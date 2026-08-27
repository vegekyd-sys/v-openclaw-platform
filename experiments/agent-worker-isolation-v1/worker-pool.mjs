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

function requestTimeoutError(requestId, timeoutMs) {
  const error = new Error(
    `worker request ${requestId} timed out after ${timeoutMs}ms`,
  );
  error.code = "VLAB_WORKER_REQUEST_TIMEOUT";
  return error;
}

function workerStallTimeoutError(requestId, timeoutMs) {
  const error = new Error(
    `worker request ${requestId} made no progress for ${timeoutMs}ms`,
  );
  error.code = "VLAB_WORKER_STALL_TIMEOUT";
  return error;
}

function clearJobTimers(job) {
  clearTimeout(job.timer);
  if (job.stallTimer) {
    clearTimeout(job.stallTimer);
    job.stallTimer = null;
  }
  if (job.forceKillTimer) {
    clearTimeout(job.forceKillTimer);
    job.forceKillTimer = null;
  }
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
    // Fallback only for callers that do not provide OpenClaw's resolved
    // per-attempt timeout. It must never cap a longer upstream deadline.
    this.requestTimeoutMs = options.requestTimeoutMs ?? 600_000;
    // Worker-process liveness watchdog. Progress heartbeats reset this timer;
    // it is deliberately separate from the business request deadline.
    this.requestStallTimeoutMs = options.requestStallTimeoutMs ?? 120_000;
    this.requestCancelGraceMs = options.requestCancelGraceMs ?? 15_000;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 15_000;
    this.retireGraceMs = options.retireGraceMs ?? 2_000;
    this.workerPath = options.workerPath ?? DEFAULT_WORKER_PATH;
    this.workerEnv = options.workerEnv ?? process.env;
    this.onProgress =
      typeof options.onProgress === "function" ? options.onProgress : undefined;
    this.onWorkerEvent =
      typeof options.onWorkerEvent === "function"
        ? options.onWorkerEvent
        : undefined;
    this.onGatewayToolRequest =
      typeof options.onGatewayToolRequest === "function"
        ? options.onGatewayToolRequest
        : undefined;
    this.workers = new Map();
    this.sessionOwners = new Map();
    this.pending = [];
    this.nextRequestId = 1;
    this.nextSteerId = 1;
    this.pendingSteers = new Map();
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
    if (
      !Number.isFinite(this.requestTimeoutMs) ||
      this.requestTimeoutMs < 10
    ) {
      throw new Error("requestTimeoutMs must be >= 10");
    }
    if (
      !Number.isFinite(this.requestStallTimeoutMs) ||
      this.requestStallTimeoutMs < 10
    ) {
      throw new Error("requestStallTimeoutMs must be >= 10");
    }
    if (
      !Number.isFinite(this.requestCancelGraceMs) ||
      this.requestCancelGraceMs < 10
    ) {
      throw new Error("requestCancelGraceMs must be >= 10");
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
      detachedTaskKeys: new Set(),
      lastIdleAt: Date.now(),
      startupPromise: null,
      retireTimer: null,
      sessionHotset: undefined,
      gatewayOwnedToolProxy: undefined,
      skillUsageTelemetry: undefined,
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

  async submit(sessionKey, request, options = {}) {
    if (!this.started) {
      await this.start();
    }
    if (this.closing) {
      throw new Error("worker pool is closing");
    }
    if (typeof sessionKey !== "string" || sessionKey.trim() === "") {
      throw new Error("sessionKey is required");
    }
    const sessionOwnerKey =
      typeof options.sessionOwnerKey === "string" &&
      options.sessionOwnerKey.trim() !== ""
        ? options.sessionOwnerKey
        : sessionKey;

    const requestId = `request-${this.nextRequestId}`;
    this.nextRequestId += 1;
    const promise = new Promise((resolve, reject) => {
      this.pending.push({
        id: requestId,
        sessionKey,
        sessionOwnerKey,
        request,
        onEvent:
          typeof options.onEvent === "function" ? options.onEvent : undefined,
        resolve,
        reject,
      });
      this.requestPump();
    });
    return { requestId, promise };
  }

  async dispatch(sessionKey, request, options) {
    const submitted = await this.submit(sessionKey, request, options);
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
        this.releaseSessionOwner(worker, job.sessionOwnerKey);
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

  async steer(requestId, text, options = {}) {
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error("Steer text is required");
    }
    for (const worker of this.workers.values()) {
      if (!worker.active.has(requestId)) continue;
      const steerId = `steer-${this.nextSteerId}`;
      this.nextSteerId += 1;
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingSteers.delete(steerId);
          reject(new Error(`worker Steer ${steerId} acknowledgement timed out`));
        }, 5_000);
        timer.unref?.();
        this.pendingSteers.set(steerId, {
          requestId,
          worker,
          timer,
          resolve,
          reject,
        });
      });
      worker.child.send({
        type: "steer",
        requestId,
        steerId,
        text,
        options: {
          steeringMode:
            options?.steeringMode === "one-at-a-time"
              ? "one-at-a-time"
              : "all",
          sourceReplyDeliveryMode: options?.sourceReplyDeliveryMode,
          waitForTranscriptCommit: options?.waitForTranscriptCommit === true,
        },
      });
      return await promise;
    }
    return {
      steered: false,
      state: "not_active",
      requestId,
      error: `worker request ${requestId} is not active`,
    };
  }

  rejectPendingSteers(requestId, error) {
    for (const [steerId, pending] of this.pendingSteers) {
      if (pending.requestId !== requestId) continue;
      clearTimeout(pending.timer);
      this.pendingSteers.delete(steerId);
      pending.reject(error);
    }
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
        let worker = this.sessionOwners.get(job.sessionOwnerKey);
        if (
          worker &&
          (worker.retiring || !this.workers.has(worker.slot))
        ) {
          this.sessionOwners.delete(job.sessionOwnerKey);
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
        if (!worker.ownerSessionKeys.has(job.sessionOwnerKey)) {
          worker.ownerSessionKeys.add(job.sessionOwnerKey);
          this.sessionOwners.set(job.sessionOwnerKey, worker);
        }
        worker.queue.push(job);
        this.drain(worker);
      }
    } finally {
      this.pumping = false;
    }
  }

  beginTimedCancellation(worker, active, error) {
    if (
      worker.active.get(active.id) !== active ||
      active.timeoutError
    ) {
      return;
    }
    active.timeoutError = error;
    worker.child.send({ type: "cancel", requestId: active.id });
    active.forceKillTimer = setTimeout(() => {
      if (worker.active.get(active.id) !== active) {
        return;
      }
      // A cooperative AbortSignal normally unwinds just this request. Only
      // an unresponsive child process reaches this fallback, where process
      // replacement is required to restore the pool.
      worker.retiring = true;
      worker.child.kill("SIGKILL");
    }, this.requestCancelGraceMs);
    active.forceKillTimer.unref?.();
  }

  armStallWatchdog(worker, active) {
    if (active.stallTimer) {
      clearTimeout(active.stallTimer);
    }
    active.stallTimer = setTimeout(() => {
      this.beginTimedCancellation(
        worker,
        active,
        workerStallTimeoutError(active.id, this.requestStallTimeoutMs),
      );
    }, this.requestStallTimeoutMs);
    active.stallTimer.unref?.();
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
        [...worker.active.values()].map((job) => job.sessionOwnerKey),
      );
      const jobIndex = worker.queue.findIndex(
        (candidate) => !activeSessions.has(candidate.sessionOwnerKey),
      );
      if (jobIndex < 0) {
        break;
      }
      const [job] = worker.queue.splice(jobIndex, 1);
      const requestedTimeoutMs = Number(job.request?.requestTimeoutMs);
      const requestTimeoutMs = Number.isFinite(requestedTimeoutMs)
        ? Math.max(1_000, requestedTimeoutMs)
        : this.requestTimeoutMs;
      const active = {
        ...job,
        timer: null,
        stallTimer: null,
        forceKillTimer: null,
        timeoutError: null,
        requestTimeoutMs,
        lastProgressAt: Date.now(),
        streamEventTail: Promise.resolve(),
      };
      worker.active.set(job.id, active);
      active.timer = setTimeout(() => {
        this.beginTimedCancellation(
          worker,
          active,
          requestTimeoutError(job.id, requestTimeoutMs),
        );
      }, requestTimeoutMs);
      active.timer.unref?.();
      this.armStallWatchdog(worker, active);
      worker.child.send({
        id: job.id,
        sessionKey: job.sessionKey,
        ...job.request,
      });
    }
  }

  releaseSessionOwner(worker, sessionOwnerKey) {
    if (
      sessionOwnerKey &&
      this.sessionOwners.get(sessionOwnerKey) === worker &&
      ![...worker.active.values()].some(
        (active) => active.sessionOwnerKey === sessionOwnerKey,
      ) &&
      !worker.queue.some(
        (queued) => queued.sessionOwnerKey === sessionOwnerKey,
      )
    ) {
      this.sessionOwners.delete(sessionOwnerKey);
      worker.ownerSessionKeys.delete(sessionOwnerKey);
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
    if (message?.sessionHotset) {
      worker.sessionHotset = message.sessionHotset;
    }
    if (message?.gatewayOwnedToolProxy) {
      worker.gatewayOwnedToolProxy = message.gatewayOwnedToolProxy;
    }
    if (message?.skillUsageTelemetry) {
      worker.skillUsageTelemetry = message.skillUsageTelemetry;
    }
    if (message?.type === "ready") {
      worker.resolveStartup?.();
      this.requestPump();
      return;
    }
    if (message?.type === "steer-ack" && message.steerId) {
      const pending = this.pendingSteers.get(message.steerId);
      if (
        !pending ||
        pending.worker !== worker ||
        pending.requestId !== message.requestId
      ) {
        return;
      }
      clearTimeout(pending.timer);
      this.pendingSteers.delete(message.steerId);
      if (message.ok === true) {
        pending.resolve({
          steered: true,
          requestId: message.requestId,
          steerId: message.steerId,
          slot: worker.slot,
          workerPid: worker.pid,
        });
      } else {
        pending.reject(
          Object.assign(
            new Error(message.error?.message ?? "worker rejected Steer message"),
            { code: message.error?.code ?? "VLAB_WORKER_STEER_REJECTED" },
          ),
        );
      }
      return;
    }
    if (message?.type === "progress") {
      const active = worker.active.get(message.id);
      if (!active) {
        return;
      }
      active.lastProgressAt = Date.now();
      this.armStallWatchdog(worker, active);
      if (this.onProgress) {
        const progress = {
          requestId: active.id,
          runId: active.request?.runId,
          sessionId: active.request?.sessionId,
          sessionKey: active.sessionKey,
          reason:
            typeof message.reason === "string"
              ? message.reason
              : "worker:active",
          slot: worker.slot,
          workerPid: worker.pid,
        };
        try {
          Promise.resolve(this.onProgress(progress)).catch((error) => {
            process.stderr.write(
              `[vlab-worker:${worker.slot}] progress relay failed: ${
                toError(error).message
              }\n`,
            );
          });
        } catch (error) {
          process.stderr.write(
            `[vlab-worker:${worker.slot}] progress relay failed: ${
              toError(error).message
            }\n`,
          );
        }
      }
      return;
    }
    if (message?.type === "worker-gateway-event") {
      const event = message.event;
      if (event?.eventKind === "detached_task_started" && event.taskKey) {
        worker.detachedTaskKeys.add(event.taskKey);
      }
      const delivery = Promise.resolve().then(async () => {
        return await this.onWorkerEvent?.({
          ...event,
          slot: worker.slot,
          workerPid: worker.pid,
        });
      });
      void delivery.then(
        (result) => {
          if (event?.eventKind === "detached_task_settled" && event.taskKey) {
            worker.detachedTaskKeys.delete(event.taskKey);
            if (
              worker.active.size === 0 &&
              worker.queue.length === 0 &&
              worker.ownerSessionKeys.size === 0 &&
              worker.detachedTaskKeys.size === 0
            ) {
              worker.lastIdleAt = Date.now();
            }
          }
          worker.child.send({
            type: "worker-gateway-event-ack",
            eventId: event?.eventId,
            ok: true,
            result,
          });
        },
        (error) => {
          const failure = toError(error);
          worker.child.send({
            type: "worker-gateway-event-ack",
            eventId: event?.eventId,
            ok: false,
            error: {
              name: failure.name,
              code: failure.code,
              message: failure.message,
            },
          });
        },
      );
      return;
    }
    if (message?.type === "gateway-tool-request" && message.requestId) {
      const delivery = Promise.resolve().then(async () => {
        if (!this.onGatewayToolRequest) {
          throw Object.assign(new Error("Gateway tool request handler is unavailable"), {
            code: "VLAB_GATEWAY_TOOL_HANDLER_UNAVAILABLE",
          });
        }
        return await this.onGatewayToolRequest(message.request, {
          slot: worker.slot,
          workerPid: worker.pid,
        });
      });
      void delivery.then(
        (result) => {
          worker.child.send({
            type: "gateway-tool-response",
            requestId: message.requestId,
            ok: true,
            result,
          });
        },
        (error) => {
          const failure = toError(error);
          worker.child.send({
            type: "gateway-tool-response",
            requestId: message.requestId,
            ok: false,
            error: {
              name: failure.name,
              code: failure.code,
              message: failure.message,
            },
          });
        },
      );
      return;
    }
    if (message?.type === "stream-event") {
      const active = worker.active.get(message.id);
      if (!active) {
        worker.child.send({
          type: "stream-event-ack",
          requestId: message.id,
          eventId: message.eventId,
          ok: false,
          error: {
            code: "VLAB_WORKER_STREAM_REQUEST_NOT_ACTIVE",
            message: `stream event request is not active: ${String(message.id)}`,
          },
        });
        return;
      }
      active.lastProgressAt = Date.now();
      this.armStallWatchdog(worker, active);
      const delivery = active.streamEventTail.then(async () => {
        await active.onEvent?.({
          requestId: active.id,
          runId: active.request?.runId,
          sessionId: active.request?.sessionId,
          sessionKey: active.sessionKey,
          name: message.name,
          args: Array.isArray(message.args) ? message.args : [],
          slot: worker.slot,
          workerPid: worker.pid,
        });
      });
      active.streamEventTail = delivery.catch(() => {});
      void delivery.then(
        () => {
          worker.child.send({
            type: "stream-event-ack",
            requestId: active.id,
            eventId: message.eventId,
            ok: true,
          });
        },
        (error) => {
          const failure = toError(error);
          worker.child.send({
            type: "stream-event-ack",
            requestId: active.id,
            eventId: message.eventId,
            ok: false,
            error: {
              name: failure.name,
              code: failure.code,
              message: failure.message,
            },
          });
        },
      );
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
    this.rejectPendingSteers(
      message.id,
      new Error(`worker request ${message.id} completed before Steer acknowledgement`),
    );
    clearJobTimers(active);
    if (active.timeoutError) {
      active.reject(active.timeoutError);
    } else if (message.ok) {
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

    this.releaseSessionOwner(worker, active.sessionOwnerKey);
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
      clearJobTimers(active);
      this.rejectPendingSteers(active.id, error);
      active.reject(active.timeoutError ?? error);
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
          worker.detachedTaskKeys.size === 0 &&
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
      requestTimeoutMs: this.requestTimeoutMs,
      requestStallTimeoutMs: this.requestStallTimeoutMs,
      requestCancelGraceMs: this.requestCancelGraceMs,
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
          detachedTaskKeys: [...worker.detachedTaskKeys],
          detachedTaskCount: worker.detachedTaskKeys.size,
          active: [...worker.active.values()].map((job) => ({
            requestId: job.id,
            sessionKey: job.sessionKey,
            kind: job.request?.kind,
            runId: job.request?.runId,
            timeoutPending: Boolean(job.timeoutError),
            requestTimeoutMs: job.requestTimeoutMs,
            lastProgressAgeMs: Math.max(
              0,
              Date.now() - job.lastProgressAt,
            ),
          })),
          activeCount: worker.active.size,
          queued: worker.queue.length,
          idleMs:
            worker.active.size === 0 && worker.ownerSessionKeys.size === 0
              ? Math.max(0, Date.now() - worker.lastIdleAt)
              : 0,
          sessionHotset: worker.sessionHotset,
          gatewayOwnedToolProxy: worker.gatewayOwnedToolProxy,
          skillUsageTelemetry: worker.skillUsageTelemetry,
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
    for (const [steerId, pending] of this.pendingSteers) {
      clearTimeout(pending.timer);
      pending.reject(closeError);
      this.pendingSteers.delete(steerId);
    }

    const children = [...this.workers.values()].map((worker) => worker.child);
    for (const worker of this.workers.values()) {
      if (worker.retireTimer) {
        clearTimeout(worker.retireTimer);
        worker.retireTimer = null;
      }
      for (const active of worker.active.values()) {
        clearJobTimers(active);
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
