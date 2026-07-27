import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKER_PATH = fileURLToPath(new URL("./worker.mjs", import.meta.url));

function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}

function cancellationError(requestId) {
  const error = new Error(`worker request ${requestId} was cancelled`);
  error.name = "AbortError";
  error.code = "VLAB_WORKER_CANCELLED";
  return error;
}

export class WorkerPool {
  constructor(options = {}) {
    this.minWorkers = options.minWorkers ?? 1;
    this.maxWorkers = options.maxWorkers ?? 2;
    this.sessionsPerWorker = options.sessionsPerWorker ?? 1;
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
    if (
      !Number.isInteger(this.sessionsPerWorker) ||
      this.sessionsPerWorker < 1
    ) {
      throw new Error("sessionsPerWorker must be an integer >= 1");
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
      ownerSessionKeys: new Set(),
      active: new Map(),
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

  async submit(sessionKey, request) {
    if (!this.started) {
      await this.start();
    }
    if (this.closing) {
      throw new Error("worker pool is closing");
    }
    if (typeof sessionKey !== "string" || sessionKey.trim() === "") {
      throw new Error("sessionKey is required");
    }

    const requestId = `request-${this.nextRequestId}`;
    this.nextRequestId += 1;
    const promise = new Promise((resolve, reject) => {
      this.pending.push({
        id: requestId,
        sessionKey,
        request,
        resolve,
        reject,
      });
      this.requestPump();
    });
    return { requestId, promise };
  }

  async dispatch(sessionKey, request) {
    const submitted = await this.submit(sessionKey, request);
    return await submitted.promise;
  }

  cancel(requestId) {
    const pendingIndex = this.pending.findIndex((job) => job.id === requestId);
    if (pendingIndex >= 0) {
      const [job] = this.pending.splice(pendingIndex, 1);
      job.reject(cancellationError(requestId));
      return { cancelled: true, state: "pending", requestId };
    }

    for (const worker of this.workers.values()) {
      const queuedIndex = worker.queue.findIndex((job) => job.id === requestId);
      if (queuedIndex >= 0) {
        const [job] = worker.queue.splice(queuedIndex, 1);
        job.reject(cancellationError(requestId));
        this.releaseSessionOwner(worker, job.sessionKey);
        this.requestPump();
        return {
          cancelled: true,
          state: "queued",
          requestId,
          slot: worker.slot,
          workerPid: worker.pid,
        };
      }
      if (worker.active.has(requestId)) {
        worker.child.send({ type: "cancel", requestId });
        return {
          cancelled: true,
          state: "active",
          requestId,
          slot: worker.slot,
          workerPid: worker.pid,
        };
      }
    }
    return { cancelled: false, state: "not_found", requestId };
  }

  terminateWorker(slot, signal = "SIGKILL") {
    if (!Number.isInteger(slot)) {
      throw new Error("slot must be an integer");
    }
    const worker = this.workers.get(slot);
    if (!worker) {
      return { terminated: false, slot };
    }
    const activeRequestIds = [...worker.active.keys()];
    const sessionKeys = [...worker.ownerSessionKeys];
    const workerPid = worker.pid;
    worker.child.kill(signal);
    return {
      terminated: true,
      slot,
      workerPid,
      signal,
      activeRequestIds,
      sessionKeys,
    };
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
              candidate.ownerSessionKeys.size < this.sessionsPerWorker,
          );
        }

        if (!worker && this.workers.size < this.maxWorkers) {
          worker = await this.spawn(this.findAvailableSlot());
        }
        if (!worker) {
          break;
        }

        this.pending.shift();
        if (!worker.ownerSessionKeys.has(job.sessionKey)) {
          worker.ownerSessionKeys.add(job.sessionKey);
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
      worker.queue.length === 0
    ) {
      return;
    }

    while (worker.active.size < this.sessionsPerWorker) {
      const activeSessions = new Set(
        [...worker.active.values()].map((job) => job.sessionKey),
      );
      const jobIndex = worker.queue.findIndex(
        (candidate) => !activeSessions.has(candidate.sessionKey),
      );
      if (jobIndex < 0) {
        break;
      }
      const [job] = worker.queue.splice(jobIndex, 1);
      const timer = setTimeout(() => {
        if (worker.active.get(job.id)?.id !== job.id) {
          return;
        }
        worker.active.delete(job.id);
        job.reject(new Error(`worker request ${job.id} timed out`));
        worker.child.kill("SIGKILL");
      }, this.requestTimeoutMs);

      worker.active.set(job.id, { ...job, timer });
      worker.child.send({
        id: job.id,
        sessionKey: job.sessionKey,
        ...job.request,
      });
    }
  }

  releaseSessionOwner(worker, sessionKey) {
    if (
      sessionKey &&
      this.sessionOwners.get(sessionKey) === worker &&
      ![...worker.active.values()].some(
        (active) => active.sessionKey === sessionKey,
      ) &&
      !worker.queue.some((queued) => queued.sessionKey === sessionKey)
    ) {
      this.sessionOwners.delete(sessionKey);
      worker.ownerSessionKeys.delete(sessionKey);
      if (
        worker.active.size === 0 &&
        worker.queue.length === 0 &&
        worker.ownerSessionKeys.size === 0
      ) {
        worker.lastIdleAt = Date.now();
      }
    }
  }

  onMessage(worker, message) {
    if (message?.type === "ready") {
      worker.resolveStartup?.();
      this.requestPump();
      return;
    }
    if (message?.type !== "response") {
      return;
    }
    const active = worker.active.get(message.id);
    if (!active) {
      return;
    }

    worker.active.delete(message.id);
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
      error.name = message.error?.name ?? error.name;
      if (message.error?.code) {
        error.code = message.error.code;
      }
      active.reject(error);
    }

    this.releaseSessionOwner(worker, active.sessionKey);
    this.drain(worker);
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
    for (const sessionKey of worker.ownerSessionKeys) {
      if (this.sessionOwners.get(sessionKey) === worker) {
        this.sessionOwners.delete(sessionKey);
      }
    }

    const error = new Error(
      `worker ${worker.slot} exited code=${String(code)} signal=${String(signal)}`,
    );
    worker.rejectStartup?.(error);
    for (const active of worker.active.values()) {
      clearTimeout(active.timer);
      active.reject(error);
    }
    worker.active.clear();
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
          worker.ownerSessionKeys.size === 0 &&
          worker.active.size === 0 &&
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
      sessionsPerWorker: this.sessionsPerWorker,
      maxActiveSessions: this.maxWorkers * this.sessionsPerWorker,
      idleTimeoutMs: this.idleTimeoutMs,
      pending: this.pending.length,
      workers: [...this.workers.values()]
        .sort((left, right) => left.slot - right.slot)
        .map((worker) => ({
          slot: worker.slot,
          pid: worker.pid,
          ready: worker.ready,
          retiring: worker.retiring,
          sessionKeys: [...worker.ownerSessionKeys],
          assignedSessions: worker.ownerSessionKeys.size,
          active: [...worker.active.values()].map((job) => ({
            requestId: job.id,
            sessionKey: job.sessionKey,
            kind: job.request?.kind,
          })),
          activeCount: worker.active.size,
          queued: worker.queue.length,
          idleMs:
            worker.active.size === 0 && worker.ownerSessionKeys.size === 0
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
