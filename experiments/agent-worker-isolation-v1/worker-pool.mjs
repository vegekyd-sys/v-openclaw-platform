import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKER_PATH = fileURLToPath(new URL("./worker.mjs", import.meta.url));

export function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class WorkerPool {
  constructor(options = {}) {
    this.maxWorkers = options.maxWorkers ?? 2;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 600_000;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 15_000;
    this.workerPath = options.workerPath ?? DEFAULT_WORKER_PATH;
    this.workerEnv = options.workerEnv ?? process.env;
    this.workers = new Map();
    this.nextRequestId = 1;
    this.started = false;
    this.closing = false;

    if (!Number.isInteger(this.maxWorkers) || this.maxWorkers < 2) {
      throw new Error("maxWorkers must be an integer >= 2");
    }
  }

  slotFor(sessionKey) {
    return fnv1a32(sessionKey) % this.maxWorkers;
  }

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    await Promise.all(
      Array.from({ length: this.maxWorkers }, (_, slot) => this.spawn(slot)),
    );
  }

  async spawn(slot) {
    const existing = this.workers.get(slot);
    if (existing?.ready) {
      return existing;
    }
    if (existing?.startupPromise) {
      return existing.startupPromise;
    }

    const child = fork(this.workerPath, [], {
      env: this.workerEnv,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    const handle = {
      slot,
      child,
      pid: child.pid,
      ready: false,
      active: null,
      queue: [],
      startupPromise: null,
    };
    this.workers.set(slot, handle);

    child.stderr?.on("data", (chunk) => {
      process.stderr.write(`[vlab-worker:${slot}] ${chunk}`);
    });
    child.on("message", (message) => this.onMessage(handle, message));
    child.on("exit", (code, signal) => this.onExit(handle, code, signal));

    handle.startupPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`worker ${slot} startup timed out`));
        child.kill("SIGKILL");
      }, this.startupTimeoutMs);

      handle.resolveStartup = () => {
        clearTimeout(timer);
        handle.ready = true;
        resolve(handle);
      };
      handle.rejectStartup = (error) => {
        clearTimeout(timer);
        reject(error);
      };
    });

    return handle.startupPromise;
  }

  async dispatch(sessionKey, request) {
    if (!this.started) {
      await this.start();
    }
    if (this.closing) {
      throw new Error("worker pool is closing");
    }

    const slot = this.slotFor(sessionKey);
    const worker = await this.spawn(slot);
    const id = `${slot}-${this.nextRequestId}`;
    this.nextRequestId += 1;

    return await new Promise((resolve, reject) => {
      worker.queue.push({
        id,
        sessionKey,
        request,
        resolve,
        reject,
      });
      this.drain(worker);
    });
  }

  drain(worker) {
    if (!worker.ready || worker.active || worker.queue.length === 0) {
      return;
    }

    const job = worker.queue.shift();
    const timer = setTimeout(() => {
      if (worker.active?.id !== job.id) {
        return;
      }
      worker.active = null;
      job.reject(new Error(`worker request ${job.id} timed out`));
      worker.child.kill("SIGKILL");
    }, this.requestTimeoutMs);

    worker.active = { ...job, timer };
    worker.child.send({
      id: job.id,
      sessionKey: job.sessionKey,
      ...job.request,
    });
  }

  onMessage(worker, message) {
    if (message?.type === "ready") {
      worker.resolveStartup?.();
      return;
    }
    if (message?.type !== "response" || !worker.active) {
      return;
    }
    if (message.id !== worker.active.id) {
      return;
    }

    const active = worker.active;
    worker.active = null;
    clearTimeout(active.timer);
    if (message.ok) {
      active.resolve({
        slot: worker.slot,
        workerPid: worker.pid,
        ...message.result,
      });
    } else {
      const error = new Error(message.error?.message ?? "worker request failed");
      error.stack = message.error?.stack ?? error.stack;
      active.reject(error);
    }
    this.drain(worker);
  }

  onExit(worker, code, signal) {
    if (this.workers.get(worker.slot) === worker) {
      this.workers.delete(worker.slot);
    }
    const error = new Error(
      `worker ${worker.slot} exited code=${String(code)} signal=${String(signal)}`,
    );
    worker.rejectStartup?.(error);
    if (worker.active) {
      clearTimeout(worker.active.timer);
      worker.active.reject(error);
    }
    for (const queued of worker.queue) {
      queued.reject(error);
    }
  }

  status() {
    return {
      started: this.started,
      maxWorkers: this.maxWorkers,
      workers: [...this.workers.values()]
        .sort((left, right) => left.slot - right.slot)
        .map((worker) => ({
          slot: worker.slot,
          pid: worker.pid,
          ready: worker.ready,
          active: worker.active?.id ?? null,
          queued: worker.queue.length,
        })),
    };
  }

  async close() {
    if (this.closing) {
      return;
    }
    this.closing = true;
    const children = [...this.workers.values()].map((worker) => worker.child);
    await Promise.all(
      children.map(
        (child) =>
          new Promise((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolve();
              return;
            }
            const hardKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
            child.once("exit", () => {
              clearTimeout(hardKill);
              resolve();
            });
            child.kill("SIGTERM");
          }),
      ),
    );
    this.workers.clear();
  }
}
