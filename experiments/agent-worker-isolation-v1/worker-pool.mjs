import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKER_PATH = fileURLToPath(new URL("./worker.mjs", import.meta.url));

function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}

export class WorkerPool {
  constructor(options = {}) {
    this.minWorkers = options.minWorkers ?? 1;
    this.maxWorkers = options.maxWorkers ?? 2;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 180_000;
    this.idleSweepIntervalMs =
      options.idleSweepIntervalMs ??
      Math.min(Math.max(Math.floor(this.idleTimeoutMs / 4), 1_000), 30_000);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 600_000;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 15_000;
    this.retireGraceMs = options.retireGraceMs ?? 2_000;
    this.workerPath = options.workerPath ?? DEFAULT_WORKER_PATH;
    this.workerEnv = options.workerEnv ?? process.env;
    this.workers = new Map();
    this.sessionOwners = new Map();
    this.pending = [];
    this.nextRequestId = 1;
    this.started = false;
    this.closing = false;
    this.pumping = false;
    this.reapTimer = null;

    if (!Number.isInteger(this.minWorkers) || this.minWorkers < 1) {
      throw new Error("minWorkers must be an integer >= 1");
    }
    if (
      !Number.isInteger(this.maxWorkers) ||
      this.maxWorkers < this.minWorkers
    ) {
      throw new Error("maxWorkers must be an integer >= minWorkers");
    }
    if (!Number.isFinite(this.idleTimeoutMs) || this.idleTimeoutMs < 100) {
      throw new Error("idleTimeoutMs must be >= 100");
    }
    if (
      !Number.isFinite(this.idleSweepIntervalMs) ||
      this.idleSweepIntervalMs < 10
    ) {
      throw new Error("idleSweepIntervalMs must be >= 10");
    }
    if (!Number.isFinite(this.retireGraceMs) || this.retireGraceMs < 10) {
      throw new Error("retireGraceMs must be >= 10");
    }
  }

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    await Promise.all(
      Array.from({ length: this.minWorkers }, () =>
        this.spawn(this.findAvailableSlot()),
      ),
    );
    this.reapTimer = setInterval(
      () => this.reapIdleWorkers(),
      this.idleSweepIntervalMs,
    );
    this.reapTimer.unref?.();
  }

  findAvailableSlot() {
    for (let slot = 0; slot < this.maxWorkers; slot += 1) {
      if (!this.workers.has(slot)) {
        return slot;
      }
    }
    return undefined;
  }

  async spawn(slot) {
    if (slot === undefined) {
      throw new Error("worker pool is at capacity");
    }
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
      retiring: false,
      ownerSessionKey: null,
      active: null,
      queue: [],
      lastIdleAt: Date.now(),
      startupPromise: null,
      retireTimer: null,
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
        handle.lastIdleAt = Date.now();
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
    if (typeof sessionKey !== "string" || sessionKey.trim() === "") {
      throw new Error("sessionKey is required");
    }

    return await new Promise((resolve, reject) => {
      this.pending.push({
        id: `request-${this.nextRequestId}`,
        sessionKey,
        request,
        resolve,
        reject,
      });
      this.nextRequestId += 1;
      this.requestPump();
    });
  }

  requestPump() {
    void this.pump().catch((error) => {
      const failure = toError(error);
      const pending = this.pending.splice(0);
      for (const job of pending) {
        job.reject(failure);
      }
    });
  }

  async pump() {
    if (this.pumping || this.closing) {
      return;
    }
    this.pumping = true;
    try {
      while (this.pending.length > 0 && !this.closing) {
        const job = this.pending[0];
        let worker = this.sessionOwners.get(job.sessionKey);
        if (
          worker &&
          (worker.retiring || !this.workers.has(worker.slot))
        ) {
          this.sessionOwners.delete(job.sessionKey);
          worker = undefined;
        }

        if (!worker) {
          worker = [...this.workers.values()].find(
            (candidate) =>
              candidate.ready &&
              !candidate.retiring &&
              candidate.ownerSessionKey === null &&
              candidate.active === null &&
              candidate.queue.length === 0,
          );
        }

        if (!worker && this.workers.size < this.maxWorkers) {
          worker = await this.spawn(this.findAvailableSlot());
        }
        if (!worker) {
          break;
        }

        this.pending.shift();
        if (worker.ownerSessionKey === null) {
          worker.ownerSessionKey = job.sessionKey;
          this.sessionOwners.set(job.sessionKey, worker);
        }
        worker.queue.push(job);
        this.drain(worker);
      }
    } finally {
      this.pumping = false;
    }
  }

  drain(worker) {
    if (
      !worker.ready ||
      worker.retiring ||
      worker.active ||
      worker.queue.length === 0
    ) {
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

  releaseSessionOwner(worker) {
    const sessionKey = worker.ownerSessionKey;
    if (
      sessionKey &&
      this.sessionOwners.get(sessionKey) === worker &&
      worker.active === null &&
      worker.queue.length === 0
    ) {
      this.sessionOwners.delete(sessionKey);
      worker.ownerSessionKey = null;
      worker.lastIdleAt = Date.now();
    }
  }

  onMessage(worker, message) {
    if (message?.type === "ready") {
      worker.resolveStartup?.();
      this.requestPump();
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

    if (worker.queue.length > 0) {
      this.drain(worker);
      return;
    }
    this.releaseSessionOwner(worker);
    this.requestPump();
  }

  onExit(worker, code, signal) {
    if (worker.retireTimer) {
      clearTimeout(worker.retireTimer);
      worker.retireTimer = null;
    }
    if (this.workers.get(worker.slot) === worker) {
      this.workers.delete(worker.slot);
    }
    if (
      worker.ownerSessionKey &&
      this.sessionOwners.get(worker.ownerSessionKey) === worker
    ) {
      this.sessionOwners.delete(worker.ownerSessionKey);
    }

    const error = new Error(
      `worker ${worker.slot} exited code=${String(code)} signal=${String(signal)}`,
    );
    worker.rejectStartup?.(error);
    if (worker.active) {
      clearTimeout(worker.active.timer);
      worker.active.reject(error);
    }
    if (!this.closing && worker.queue.length > 0) {
      this.pending.unshift(...worker.queue);
    } else {
      for (const queued of worker.queue) {
        queued.reject(error);
      }
    }

    if (!this.closing) {
      void this.ensureMinimumWorkers()
        .then(() => this.requestPump())
        .catch((spawnError) => {
          const failure = toError(spawnError);
          const pending = this.pending.splice(0);
          for (const job of pending) {
            job.reject(failure);
          }
        });
    }
  }

  async ensureMinimumWorkers() {
    while (!this.closing && this.workers.size < this.minWorkers) {
      await this.spawn(this.findAvailableSlot());
    }
  }

  reapIdleWorkers() {
    if (this.closing || this.workers.size <= this.minWorkers) {
      return;
    }
    const now = Date.now();
    const idleWorkers = [...this.workers.values()]
      .filter(
        (worker) =>
          worker.ready &&
          !worker.retiring &&
          worker.ownerSessionKey === null &&
          worker.active === null &&
          worker.queue.length === 0 &&
          now - worker.lastIdleAt >= this.idleTimeoutMs,
      )
      .sort((left, right) => right.slot - left.slot);

    const retiringCount = [...this.workers.values()].filter(
      (worker) => worker.retiring,
    ).length;
    let removable = this.workers.size - this.minWorkers - retiringCount;
    for (const worker of idleWorkers) {
      if (removable <= 0) {
        break;
      }
      this.retire(worker);
      removable -= 1;
    }
  }

  retire(worker) {
    if (worker.retiring) {
      return;
    }
    worker.retiring = true;
    worker.retireTimer = setTimeout(() => {
      worker.retireTimer = null;
      if (
        this.workers.get(worker.slot) === worker &&
        worker.child.exitCode === null &&
        worker.child.signalCode === null
      ) {
        worker.child.kill("SIGKILL");
      }
    }, this.retireGraceMs);
    worker.retireTimer.unref?.();
    worker.child.kill("SIGTERM");
  }

  status() {
    return {
      started: this.started,
      minWorkers: this.minWorkers,
      maxWorkers: this.maxWorkers,
      idleTimeoutMs: this.idleTimeoutMs,
      pending: this.pending.length,
      workers: [...this.workers.values()]
        .sort((left, right) => left.slot - right.slot)
        .map((worker) => ({
          slot: worker.slot,
          pid: worker.pid,
          ready: worker.ready,
          retiring: worker.retiring,
          sessionKey: worker.ownerSessionKey,
          active: worker.active?.id ?? null,
          queued: worker.queue.length,
          idleMs:
            worker.active === null && worker.ownerSessionKey === null
              ? Math.max(0, Date.now() - worker.lastIdleAt)
              : 0,
        })),
    };
  }

  async close() {
    if (this.closing) {
      return;
    }
    this.closing = true;
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
      this.reapTimer = null;
    }
    const closeError = new Error("worker pool is closing");
    for (const pending of this.pending.splice(0)) {
      pending.reject(closeError);
    }

    const children = [...this.workers.values()].map((worker) => worker.child);
    for (const worker of this.workers.values()) {
      if (worker.retireTimer) {
        clearTimeout(worker.retireTimer);
        worker.retireTimer = null;
      }
    }
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
    this.sessionOwners.clear();
  }
}
