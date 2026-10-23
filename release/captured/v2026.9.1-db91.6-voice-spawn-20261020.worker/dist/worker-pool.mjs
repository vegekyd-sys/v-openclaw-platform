// gpt-live-voice-tool-order-v1: worker-pool
// gpt-live-voice-exec-lifetime-v1: worker-pool
import {Console as FirsttextMetricConsole} from "node:console";
const ocFirsttextMetricConsole = new FirsttextMetricConsole({stdout: process.stdout, stderr: process.stderr, ignoreErrors: true});
// OPENCLAW_FIRSTTEXT_WORKER_PHASES_V1
const ocFirsttextWorkerStages = new Set(["gateway-harness-enter","gateway-preflight-enter","gateway-preflight-end","gateway-submit-return","gateway-callback-enter","gateway-callback-end","gateway-transcript-enter","gateway-transcript-end","gateway-harness-exit","pool-submit-enter","pool-enqueued","pool-spawn","pool-ready","pool-ipc-send","pool-stream-received","pool-callback-enter","pool-callback-end","pool-ack-send","pool-response-received","worker-command-enter","worker-command-end","worker-agent-enter","worker-runtime-loaded","worker-event-runtime-loaded","worker-compaction-runtime-loaded","worker-prepared-runtime-enter","worker-prepared-runtime-end","worker-hooks-end","worker-tail-enter","worker-tail-end","worker-result-build-enter","worker-result-build-end","worker-response-send","worker-response-error","worker-stream-send","worker-ack-done","worker-ack-error","worker-native-drain-enter","worker-native-drain-end","worker-final-tail-enter","worker-final-tail-end"]);
const ocFirsttextWorkerCallbacks = new Set(['onAgentEvent','onPartialReply','onReasoningStream','onReasoningEnd','onToolStart','onToolResult','onBlockReply','onAssistantMessageStart','onAssistantMessageEnd','onAgentRunStart','onRunProgress','onAttemptDeadlineChanged','onCompactionStart','onCompactionEnd','onPlanUpdate','onApprovalEvent','onPatchSummary']);
const ocFirsttextWorkerEventCounts = new Map();
function ocFirsttextWorkerMark(stage, runId, fields = {}) {
  try {
    if (process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES !== '1' || !ocFirsttextWorkerStages.has(stage)) return;
    const validRun = typeof runId === 'string' && (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId) || /^DB91_HI_[0-9]+_[a-z0-9_]+$/.test(runId));
    if (!validRun && !['pool-spawn','pool-ready'].includes(stage)) return;
    if (/callback|stream-received|stream-send|ack-/.test(stage)) {
      let counts = ocFirsttextWorkerEventCounts.get(runId);
      if (!counts) {
        if (ocFirsttextWorkerEventCounts.size >= 256) ocFirsttextWorkerEventCounts.delete(ocFirsttextWorkerEventCounts.keys().next().value);
        counts = {}; ocFirsttextWorkerEventCounts.set(runId,counts);
      }
      counts[stage] = (counts[stage] || 0) + 1;
      if (counts[stage] > 3) return;
    }
    const row = {v:1,stage,pid:process.pid,atMs:Date.now(),monoMs:performance.now()};
    if (validRun) row.runId = runId;
    if (typeof fields.requestId === 'string' && /^request-[0-9]+$/.test(fields.requestId)) row.requestId = fields.requestId;
    if (typeof fields.eventId === 'string' && /^stream-[0-9]+$/.test(fields.eventId)) row.eventId = fields.eventId;
    if (ocFirsttextWorkerCallbacks.has(fields.name)) row.name = fields.name;
    if (Number.isSafeInteger(fields.workerPid) && fields.workerPid > 0) row.workerPid = fields.workerPid;
    if (Number.isSafeInteger(fields.slot) && fields.slot >= 0) row.slot = fields.slot;
    // row contains only validated timing/identity fields; no prompt, tool args or credentials.
    ocFirsttextMetricConsole.error('[firsttext-worker-phases] ' + JSON.stringify(row));
  } catch { /* Observation must not alter runtime control flow. */ }
}

import {sendLateWorkerReply} from "./late-worker-reply.mjs";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cloneWireData } from "./native-harness-data.mjs";

const DEFAULT_WORKER_PATH = fileURLToPath(new URL("./worker.mjs", import.meta.url));
// worker-generations.1: request ids must stay unique across pool generations,
// because a caller that admitted work in one generation may cancel or steer it
// after the job was handed to the next one.
let nextPoolRequestId = 1;

export function resolveWorkerExecArgv(
  execArgv = process.execArgv,
  maxOldSpaceMb = 0,
) {
  const inherited = execArgv.filter(
    (arg) =>
      !/^--inspect(?:-brk)?(?:=|$)/.test(arg) &&
      !/^--debug(?:-brk)?(?:=|$)/.test(arg),
  );
  if (!Number.isInteger(maxOldSpaceMb) || maxOldSpaceMb <= 0) {
    return inherited;
  }
  // A Worker must not silently inherit the Gateway's old-space ceiling. A
  // ceiling far above what a Worker needs lets V8 defer major GC until the
  // process is already several GiB wide, and those pages are never handed
  // back to the OS. Replacing it is the only way the Worker's own limit wins.
  return [
    ...inherited.filter(
      (arg) => !/^--max[-_]old[-_]space[-_]size(?:=|$)/.test(arg),
    ),
    `--max-old-space-size=${maxOldSpaceMb}`,
  ];
}

function readIntEnv(env, key, fallback) {
  const raw = env?.[key];
  if (raw === undefined || raw === null || `${raw}`.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

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
    this.configEnv = options.configEnv ?? process.env;
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
    // OpenClaw 2.0 may spend tens of seconds opening a migrated Agent DB and
    // preparing plugin state before a newly forked Worker can announce ready.
    // Treat startup as capacity admission, not as a normal request timeout.
    this.startupTimeoutMs = options.startupTimeoutMs ?? 180_000;
    this.warmSpareWorkers =
      options.warmSpareWorkers ??
      Math.min(1, Math.max(0, this.maxWorkers - 1));
    this.retireGraceMs = options.retireGraceMs ?? 2_000;
    // worker-memory-recycle.1: a resident Worker never exits on its own, so
    // every session it serves leaves its footprint behind for the lifetime of
    // the Gateway. These bounds retire a Worker that has grown too large, but
    // only while it is genuinely idle, and only after a replacement is warm.
    this.recycleRssBytes = options.recycleRssBytes ??
      readIntEnv(this.configEnv, "VLAB_WORKER_RECYCLE_RSS_MB", 1_536) *
        1024 * 1024;
    this.recycleMaxLifetimeMs = options.recycleMaxLifetimeMs ??
      readIntEnv(this.configEnv, "VLAB_WORKER_RECYCLE_LIFETIME_MS",
        12 * 60 * 60 * 1_000);
    this.recycleMaxSessions = options.recycleMaxSessions ??
      readIntEnv(this.configEnv, "VLAB_WORKER_RECYCLE_MAX_SESSIONS", 0);
    this.recycleCooldownMs = options.recycleCooldownMs ??
      readIntEnv(this.configEnv, "VLAB_WORKER_RECYCLE_COOLDOWN_MS", 60_000);
    // A Worker that has only just started cannot be the one holding a large
    // footprint. Without this floor a threshold set too low turns into a
    // spawn/retire loop that costs more than the memory it reclaims.
    this.recycleMinAgeMs = options.recycleMinAgeMs ??
      readIntEnv(this.configEnv, "VLAB_WORKER_RECYCLE_MIN_AGE_MS", 300_000);
    this.workerMaxOldSpaceMb = options.workerMaxOldSpaceMb ??
      readIntEnv(this.configEnv, "VLAB_WORKER_MAX_OLD_SPACE_MB", 0);
    // worker-generations.1: a replaced generation stops admitting work but lets
    // admitted runs, queued turns and detached tasks finish. This bounds how
    // long it may keep processes alive before the old hard close applies.
    this.generationDrainTimeoutMs = options.generationDrainTimeoutMs ??
      readIntEnv(this.configEnv, "VLAB_WORKER_GENERATION_DRAIN_MS",
        30 * 60 * 1_000);
    this.successorWaitMs = options.successorWaitMs ?? 30_000;
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
    // worker-affinity.1: a bounded scheduling hint, never an ownership lease.
    // A busy/retired Worker must not hold up admission to an available Worker.
    this.sessionAffinityEnabled = options.sessionAffinityEnabled ??
      process.env.OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE === "1";
    this.sessionAffinityTtlMs = options.sessionAffinityTtlMs ?? 180_000;
    this.sessionAffinityMaxEntries = options.sessionAffinityMaxEntries ?? 1024;
    if (!Number.isFinite(this.sessionAffinityTtlMs) || this.sessionAffinityTtlMs < 1 ||
        !Number.isInteger(this.sessionAffinityMaxEntries) || this.sessionAffinityMaxEntries < 1)
      throw new Error("invalid Worker session affinity bounds");
    this.sessionAffinity = new Map();
    this.pending = [];
    this.nextRequestId = 1;
    this.nextSteerId = 1;
    this.pendingSteers = new Map();
    this.pendingControls = new Map();
    this.nextControlId = 1;
    this.started = false;
    this.startPromise = null;
    this.closePromise = null;
    this.closing = false;
    this.draining = false;
    this.handoffExpected = false;
    this.successor = null;
    this.predecessor = null;
    this.drainedPromise = null;
    this.resolveDrained = null;
    this.drainTimer = null;
    this.orphanTimer = null;
    this.pumping = false;
    this.reapTimer = null;
    this.recyclingSlot = null;
    this.lastRecycleAt = 0;
    this.recycledWorkerCount = 0;

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
      !Number.isFinite(this.startupTimeoutMs) ||
      this.startupTimeoutMs < 10
    ) {
      throw new Error("startupTimeoutMs must be >= 10");
    }
    if (
      !Number.isInteger(this.warmSpareWorkers) ||
      this.warmSpareWorkers < 0 ||
      this.warmSpareWorkers >= this.maxWorkers
    ) {
      throw new Error("warmSpareWorkers must be an integer from 0 to maxWorkers - 1");
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
    for (const [name, value] of [
      ["recycleRssBytes", this.recycleRssBytes],
      ["recycleMaxLifetimeMs", this.recycleMaxLifetimeMs],
      ["recycleMaxSessions", this.recycleMaxSessions],
      ["recycleCooldownMs", this.recycleCooldownMs],
      ["recycleMinAgeMs", this.recycleMinAgeMs],
    ]) {
      // Zero disables that bound; a negative or non-finite value is a
      // configuration error, not a silent "recycle everything".
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be >= 0`);
      }
    }
    if (
      !Number.isInteger(this.workerMaxOldSpaceMb) ||
      this.workerMaxOldSpaceMb < 0
    ) {
      throw new Error("workerMaxOldSpaceMb must be an integer >= 0");
    }
    if (
      !Number.isFinite(this.generationDrainTimeoutMs) ||
      this.generationDrainTimeoutMs < 10
    ) {
      throw new Error("generationDrainTimeoutMs must be >= 10");
    }
  }

  // Ported from the 0.2.12 pool: concurrent starts share one startup, a
  // closed pool cannot be restarted, and a failed startup closes the pool.
  start() {
    if (this.closing) return Promise.reject(new Error("worker pool is closing"));
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startWorkers().catch(async (error) => {
      await this.close();
      throw error;
    });
    return this.startPromise;
  }

  async startWorkers() {
    this.started = true;
    // Turns handed over by a draining generation may already have started a
    // Worker here; top up to minWorkers instead of assuming an empty pool.
    const startups = [...this.workers.values()].map(
      (worker) => worker.startupPromise ?? Promise.resolve(worker),
    );
    while (this.workers.size < this.minWorkers) {
      startups.push(this.spawn(this.findAvailableSlot()));
    }
    await Promise.all(startups);
    if (this.closing) throw new Error("worker pool is closing");
    this.reapTimer = setInterval(() => {
      this.reapIdleWorkers();
      // A rejected recycle attempt must never take the sweep timer down with
      // it; capacity recovery is handled on the next tick.
      this.recycleOverGrownWorker().catch(() => {});
    }, this.idleSweepIntervalMs);
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
    // Neither a draining nor a closed generation may fork new Workers.
    if (this.closing) throw new Error("worker pool is closing");
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
      // A Gateway inspector port belongs to the Gateway process. Inheriting
      // it into every Worker creates a collision per scale-out attempt.
      execArgv: resolveWorkerExecArgv(
        process.execArgv,
        this.workerMaxOldSpaceMb,
      ),
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    ocFirsttextWorkerMark("pool-spawn", undefined, {slot,workerPid:child.pid});
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
      startedAt: Date.now(),
      servedSessionCount: 0,
      memory: null,
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
        ocFirsttextWorkerMark("pool-ready", undefined, {slot,workerPid:handle.pid});
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
    ocFirsttextWorkerMark("pool-submit-enter", request.runId);
    // A caller that resolved this generation before a reload still holds it;
    // its new turns belong to the generation that replaced it.
    // During a plugin reload the old service stops before the new one is
    // registered; wait briefly for it rather than failing the turn.
    if (this.handoffExpected && !this.successor) {
      await this.waitForSuccessor(this.successorWaitMs);
    }
    if (this.closing && this.successor) {
      return await this.successor.submit(sessionKey, request, options);
    }
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

    // A request/prompt/nativeHarnessData boolean cannot mint this mode.
    const { gptLiveVoiceToolOrder: untrustedVoiceToolOrder, ...toolOrderRequest } = request;
    const voiceSequential = request.nativeAttempt91 === true &&
      typeof options.authorizeNativeVoiceToolOrder === "function" &&
      options.authorizeNativeVoiceToolOrder() === true;
    const admittedToolOrderRequest = voiceSequential
      ? { ...toolOrderRequest, gptLiveVoiceToolOrder: "sequential-v1" } : toolOrderRequest;
    const requestId = `request-${nextPoolRequestId}`;
    nextPoolRequestId += 1;
    const promise = new Promise((resolve, reject) => {
      this.pending.push({
        id: requestId,
        sessionKey,
        sessionOwnerKey,
        request: admittedToolOrderRequest,
        onEvent:
          typeof options.onEvent === "function" ? options.onEvent : undefined,
        onGatewayToolRequest: options.onGatewayToolRequest,
        resolve,
        reject,
      });
      ocFirsttextWorkerMark("pool-enqueued", request.runId, {requestId});
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
        this.retireIfDrained(worker);
        return {
          cancelled: true,
          state: "queued",
          requestId,
          slot: worker.slot,
          workerPid: worker.pid,
        };
      }
      if (worker.active.has(requestId)) {
        worker.active.get(requestId).cancelRequested = true;
        sendLateWorkerReply(worker.child,{ type: "cancel", requestId });
        return {
          cancelled: true,
          state: "active",
          requestId,
          slot: worker.slot,
          workerPid: worker.pid,
        };
      }
    }
    // Pending work moves to the next generation when this one drains.
    if (this.successor) return this.successor.cancel(requestId);
    return { cancelled: false, state: "not_found", requestId };
  }

  // voice-worker-process-control-v3
  async cancelVoiceProcesses(runId,sessionKey){
    for(const worker of this.workers.values())for(const active of [...worker.active.values(),...(worker.voiceProcessRuns?.values()??[])]){
      if(active.request?.runId!==runId||active.sessionKey!==sessionKey)continue;
      const controlId='voice-process-'+this.nextControlId++;
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pendingControls.delete(controlId);reject(Error('Voice process cleanup acknowledgement timed out'));},15000);timer.unref?.();
        this.pendingControls.set(controlId,{worker,active,requestId:active.id,runId,sessionKey,timer,resolve,reject});
        worker.child.send({type:'voice-process-cancel',controlId,requestId:active.id,runId,sessionKey});
      });
    }
    throw Error('Exact voice Worker run is no longer active; process exit remains unconfirmed');
  }
  async applyPermission(requestId, mode) {
    for (const worker of this.workers.values()) {
      const active = worker.active.get(requestId);
      if (!active || active.cancelRequested || active.timeoutError) continue;
      const controlId = `permission-${this.nextControlId++}`;
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingControls.delete(controlId);
          reject(new Error("Worker permission acknowledgement timed out"));
        }, 5_000);
        timer.unref?.();
        this.pendingControls.set(controlId, { requestId, worker, active, timer, resolve, reject });
        worker.child.send({ type: "permission-change", controlId, requestId, mode });
      });
    }
    if (this.successor) return await this.successor.applyPermission(requestId, mode);
    return false;
  }

  updateAttemptDeadline(worker, active, deadline) {
    if (worker.active.get(active.id) !== active || active.cancelRequested || active.timeoutError) {
      throw new Error("Worker deadline owner is no longer active");
    }
    if (deadline?.kind !== "unlimited" &&
        !(deadline?.kind === "bounded" && Number.isFinite(deadline.deadlineAtMs))) {
      throw new Error("Malformed native Worker deadline");
    }
    clearTimeout(active.timer);
    active.timer = null;
    active.nativeDeadline = deadline;
    if (deadline.kind === "bounded") {
      // Core owns the business deadline. A short grace lets it report timeout
      // normally; process liveness is still monitored independently.
      const delay = Math.max(1, deadline.deadlineAtMs - Date.now() + this.requestCancelGraceMs);
      const arm = () => {
        const remaining = deadline.deadlineAtMs - Date.now() + this.requestCancelGraceMs;
        if (remaining > 0) {
          active.timer = setTimeout(arm, Math.min(remaining, 2_147_483_647));
          active.timer.unref?.();
        } else this.beginTimedCancellation(worker, active, requestTimeoutError(active.id, active.requestTimeoutMs));
      };
      active.timer = setTimeout(arm, Math.min(delay, 2_147_483_647));
      active.timer.unref?.();
    }
  }

  async steer(requestId, text, options = {}) {
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error("Steer text is required");
    }
    for (const worker of this.workers.values()) {
      if (!worker.active.has(requestId)) continue;
      const job = worker.active.get(requestId);
      const native = job.request?.nativeAttempt91 === true;
      const { onQueueAccepted, userTurnTranscriptRecorder, abortSignal, ...dataOptions } = options;
      if (abortSignal?.aborted) throw cancellationError(requestId);
      const nativeOptions = native ? cloneWireData(dataOptions, 'steerOptions') : undefined;
      const preparedMessage = native && userTurnTranscriptRecorder
        ? cloneWireData(await userTurnTranscriptRecorder.resolveMessage(), 'steerMessage') : undefined;
      if (worker.active.get(requestId) !== job || abortSignal?.aborted) throw cancellationError(requestId);
      const steerId = `steer-${this.nextSteerId}`;
      this.nextSteerId += 1;
      const promise = new Promise((resolve, reject) => {
        let accepted = false;
        const onAbort = () => {
          try { worker.child.send({type:'steer-cancel',requestId,steerId}); }
          catch { /* The pending acknowledgement/worker-exit path settles this request. */ }
        };
        const cleanup = () => abortSignal?.removeEventListener('abort', onAbort);
        const resolveSafely = value => { cleanup(); resolve(value); };
        const rejectSafely = error => {
          cleanup();
          if (accepted) resolve({steered:true,result:{transcriptCommit:'unconfirmed',errorMessage:error.message}});
          else reject(error);
        };
        const timer = setTimeout(() => {
          this.pendingSteers.delete(steerId);
          rejectSafely(new Error(`worker Steer ${steerId} acknowledgement timed out`));
        }, native ? (Number.isFinite(options.deliveryTimeoutMs) ? Math.max(5000, options.deliveryTimeoutMs) : 120000) + 5000 : 5_000);
        timer.unref?.();
        this.pendingSteers.set(steerId, {
          requestId,
          worker,
          timer,
          resolve: resolveSafely,
          reject: rejectSafely,
          onAccepted: value => { if (accepted) return; if(value) accepted=true; onQueueAccepted?.(value); },
          recorder: native ? userTurnTranscriptRecorder : undefined,
        });
        if (native) abortSignal?.addEventListener('abort', onAbort, {once:true});
      });
      try { worker.child.send({
        type: "steer",
        requestId,
        steerId,
        text,
        preparedMessage,
        options: nativeOptions ?? {
          steeringMode:
            options?.steeringMode === "one-at-a-time"
              ? "one-at-a-time"
              : "all",
          sourceReplyDeliveryMode: options?.sourceReplyDeliveryMode,
          waitForTranscriptCommit: options?.waitForTranscriptCommit === true,
        },
      }); } catch (error) {
        const pending = this.pendingSteers.get(steerId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingSteers.delete(steerId);
          pending.reject(toError(error));
        }
      }
      return await promise;
    }
    if (this.successor) return await this.successor.steer(requestId, text, options);
    return {
      steered: false,
      state: "not_active",
      requestId,
      error: `worker request ${requestId} is not active`,
    };
  }

  rejectPendingSteers(requestId, error, preserveVoiceProcessControls=false) {
    for (const [id, pending] of this.pendingControls) {
      if (pending.requestId !== requestId || preserveVoiceProcessControls && pending.runId) continue;
      clearTimeout(pending.timer);
      this.pendingControls.delete(id);
      pending.reject(error);
    }
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

  preferredSessionWorker(key) {
    if (!this.sessionAffinityEnabled) return undefined;
    const hint = this.sessionAffinity.get(key);
    if (!hint) return undefined;
    const worker = hint.worker;
    if (Date.now() - hint.at >= this.sessionAffinityTtlMs ||
        this.workers.get(worker.slot) !== worker || worker.retiring) {
      this.sessionAffinity.delete(key);
      return undefined;
    }
    if (!worker.ready || worker.ownerSessionKeys.size >= this.sessionsPerWorker ||
        worker.active.size >= this.sessionsPerWorker || worker.queue.length > 0) return undefined;
    return worker;
  }

  rememberSessionWorker(key, worker) {
    if (!this.sessionAffinityEnabled) return;
    this.sessionAffinity.delete(key);
    this.sessionAffinity.set(key, {worker, at: Date.now()});
    while (this.sessionAffinity.size > this.sessionAffinityMaxEntries)
      this.sessionAffinity.delete(this.sessionAffinity.keys().next().value);
  }

  compareSessionWorkerLoad(left, right) {
    const activeDelta =
      left.active.size + left.detachedTaskKeys.size -
      right.active.size - right.detachedTaskKeys.size;
    if (activeDelta !== 0) return activeDelta;
    const queueDelta = left.queue.length - right.queue.length;
    if (queueDelta !== 0) return queueDelta;
    return left.ownerSessionKeys.size - right.ownerSessionKeys.size;
  }

  selectSessionWorker(key) {
    const candidates = [...this.workers.values()]
      .filter(
        (candidate) =>
          candidate.ready &&
          !candidate.retiring &&
          candidate.ownerSessionKeys.size < this.sessionsPerWorker,
      )
      .sort(
        (left, right) =>
          this.compareSessionWorkerLoad(left, right) || left.slot - right.slot,
      );
    const leastLoaded = candidates[0];
    if (!leastLoaded) return undefined;
    const preferred = this.preferredSessionWorker(key);
    // Affinity is valuable only when it does not place a new Session behind
    // more work in one Node process. Spread across ready Workers first, then
    // pack up to sessionsPerWorker once every process is equally occupied.
    return preferred &&
        this.compareSessionWorkerLoad(preferred, leastLoaded) <= 0
      ? preferred
      : leastLoaded;
  }

  async pump() {
    if (this.pumping || this.closing) {
      return;
    }
    this.pumping = true;
    try {
      let index = 0;
      while (index < this.pending.length && !this.closing) {
        const job = this.pending[index];
        // One transcript has one writer: a Session still running or queued in
        // a draining generation waits for it instead of starting here.
        if (this.predecessor?.holdsSessionOwner(job.sessionOwnerKey)) {
          index += 1;
          continue;
        }
        let worker = this.sessionOwners.get(job.sessionOwnerKey);
        if (
          worker &&
          (worker.retiring || !this.workers.has(worker.slot))
        ) {
          this.sessionOwners.delete(job.sessionOwnerKey);
          worker = undefined;
        }

        if (!worker) worker = this.selectSessionWorker(job.sessionOwnerKey);

        if (!worker) {
          // Readiness is an event, not a queue-wide lock. An existing Worker
          // may finish a turn while another process is still booting; its
          // completion must be able to pump pending work immediately.
          // Preserve the original warm-spare + one demand-start concurrency,
          // without letting repeated pumps fork one process per queued job.
          if (!this.capacityStartupPromise && this.workers.size < this.maxWorkers) {
            const startup = this.spawn(this.findAvailableSlot());
            this.capacityStartupPromise = startup;
            void startup.then(() => {
              if (this.capacityStartupPromise === startup) this.capacityStartupPromise = null;
              this.requestPump();
            }, (error) => {
              if (this.capacityStartupPromise === startup) this.capacityStartupPromise = null;
              const failure = toError(error);
              for (const pending of this.pending.splice(0)) pending.reject(failure);
            });
          }
          break;
        }

        this.pending.splice(index, 1);
        this.rememberSessionWorker(job.sessionOwnerKey, worker);
        if (!worker.ownerSessionKeys.has(job.sessionOwnerKey)) {
          worker.ownerSessionKeys.add(job.sessionOwnerKey);
          worker.servedSessionCount += 1;
          this.sessionOwners.set(job.sessionOwnerKey, worker);
        }
        worker.queue.push(job);
        this.drain(worker);
        void this.ensureWarmSpareWorkers().catch(() => {
          // A speculative spare must never fail the admitted request. The
          // normal pending path retries capacity creation when it is needed.
        });
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
    sendLateWorkerReply(worker.child,{ type: "cancel", requestId: active.id });
    active.forceKillTimer = setTimeout(() => {
      if (worker.active.get(active.id) !== active) {
        return;
      }
      if (error.code === "VLAB_WORKER_STALL_TIMEOUT") {
        // Missing Worker heartbeats mean the whole process is unhealthy; a
        // process replacement is the only safe recovery in this case.
        worker.retiring = true;
        worker.child.kill("SIGKILL");
        return;
      }

      // A business deadline belongs to one request, not every Session sharing
      // this Worker. Quarantine the process, reject only the expired request,
      // let siblings drain, then replace the Worker. A late response from the
      // detached request is ignored by request id.
      worker.retiring = true;
      worker.active.delete(active.id);
      clearJobTimers(active);
      this.rejectPendingSteers(active.id, error);
      active.reject(error);
      this.releaseSessionOwner(worker, active.sessionOwnerKey);

      const queued = worker.queue.splice(0);
      for (const queuedJob of queued) {
        this.releaseSessionOwner(worker, queuedJob.sessionOwnerKey);
      }
      if (queued.length > 0) {
        if (this.draining) this.handOff(queued);
        else this.pending.unshift(...queued);
      }
      if (worker.active.size === 0) {
        this.retire(worker);
      }
      this.requestPump();
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
      ocFirsttextWorkerMark("pool-ipc-send", job.request.runId, {requestId:job.id,slot:worker.slot,workerPid:worker.pid});
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
      this.successor?.requestPump();
    }
  }

  onMessage(worker, message) {
    if(message?.type==='voice-process-cancel-ack'){
      const p=this.pendingControls.get(message.controlId);if(!p||p.worker!==worker||p.requestId!==message.requestId||!p.runId)return;
      clearTimeout(p.timer);this.pendingControls.delete(message.controlId);
      if(!message.ok||message.result?.runId!==p.runId||message.result?.sessionKey!==p.sessionKey||message.result?.confirmed!==true)p.reject(Error(message.error?.message??'Voice process cleanup identity mismatch'));
      else {p.worker.voiceProcessRuns?.delete(p.runId);p.resolve(message.result);}return;
    }
    if (message?.type === "permission-change-ack") {
      const p = this.pendingControls.get(message.controlId);
      if (!p || p.worker !== worker || p.requestId !== message.requestId) return;
      clearTimeout(p.timer);
      this.pendingControls.delete(message.controlId);
      if (!message.ok) p.reject(toError(message.error));
      else p.resolve(message.applied === true && worker.active.get(p.requestId) === p.active && !p.active.cancelRequested);
      return;
    }
    if (message?.sessionHotset) {
      worker.sessionHotset = message.sessionHotset;
    }
    if (message?.gatewayOwnedToolProxy) {
      worker.gatewayOwnedToolProxy = message.gatewayOwnedToolProxy;
    }
    if (message?.skillUsageTelemetry) {
      worker.skillUsageTelemetry = message.skillUsageTelemetry;
    }
    if (message?.memory && typeof message.memory.rss === "number") {
      worker.memory = { ...message.memory, at: Date.now() };
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
          result: message.result,
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
    if (['steer-accepted','steer-persisted'].includes(message?.type)) {
      const pending=this.pendingSteers.get(message.steerId);
      if(!pending || pending.worker!==worker || pending.requestId!==message.requestId) return;
      try {
        if(message.type==='steer-accepted') pending.onAccepted?.(message.accepted===true);
        else pending.recorder?.markRuntimePersisted?.(message.message,message.receipt);
      } catch(error) {
        clearTimeout(pending.timer);this.pendingSteers.delete(message.steerId);pending.reject(toError(error));
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
            this.retireIfDrained(worker);
          }
          sendLateWorkerReply(worker.child,{
            type: "worker-gateway-event-ack",
            eventId: event?.eventId,
            ok: true,
            result,
          });
        },
        (error) => {
          const failure = toError(error);
          sendLateWorkerReply(worker.child,{
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
        if (["native-message", "native-gateway-identity", "native-voice-exec", "native-voice-exec-cancel"].includes(message.request?.kind)) {
          const owner = worker.active.get(message.request.ownerRequestId);
          const revokeOnly = message.request.kind === "native-voice-exec-cancel";
          if (!owner || !owner.onGatewayToolRequest || !revokeOnly && (owner.cancelRequested || owner.timeoutError)) {
            throw new Error("Gateway message tool owner is no longer active");
          }
          return await owner.onGatewayToolRequest(message.request);
        }
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
          sendLateWorkerReply(worker.child,{
            type: "gateway-tool-response",
            requestId: message.requestId,
            ok: true,
            result,
          });
        },
        (error) => {
          const failure = toError(error);
          sendLateWorkerReply(worker.child,{
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
        sendLateWorkerReply(worker.child,{
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
      ocFirsttextWorkerMark("pool-stream-received", active.request?.runId, {requestId:active.id,eventId:message.eventId,name:message.name});
      active.lastProgressAt = Date.now();
      this.armStallWatchdog(worker, active);
      const delivery = active.streamEventTail.then(async () => {
        if (worker.active.get(active.id) !== active || active.cancelRequested || active.timeoutError) {
          throw new Error("Worker event owner is no longer active");
        }
        if (message.name === "onAttemptDeadlineChanged") {
          this.updateAttemptDeadline(worker, active, message.args?.[0]);
        }
        ocFirsttextWorkerMark("pool-callback-enter", active.request?.runId, {requestId:active.id,eventId:message.eventId,name:message.name});
        try { await active.onEvent?.({
          requestId: active.id,
          runId: active.request?.runId,
          sessionId: active.request?.sessionId,
          sessionKey: active.sessionKey,
          name: message.name,
          args: Array.isArray(message.args) ? message.args : [],
          slot: worker.slot,
          workerPid: worker.pid,
        }); } finally { ocFirsttextWorkerMark("pool-callback-end", active.request?.runId, {requestId:active.id,eventId:message.eventId,name:message.name}); }
      });
      active.streamEventTail = delivery.catch(() => {});
      void delivery.then(
        () => {
          ocFirsttextWorkerMark("pool-ack-send", active.request?.runId, {requestId:active.id,eventId:message.eventId,name:message.name});
          sendLateWorkerReply(worker.child,{
            type: "stream-event-ack",
            requestId: active.id,
            eventId: message.eventId,
            ok: true,
          });
        },
        (error) => {
          const failure = toError(error);
          sendLateWorkerReply(worker.child,{
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

    ocFirsttextWorkerMark("pool-response-received", active.request?.runId, {requestId:active.id,slot:worker.slot,workerPid:worker.pid});
    if(/^voice-[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(active.request?.runId??'')){
      worker.voiceProcessRuns??=new Map();worker.voiceProcessRuns.set(active.request.runId,active);
    }
    worker.active.delete(message.id);
    this.rejectPendingSteers(
      message.id,
      new Error(`worker request ${message.id} completed before Steer acknowledgement`),
      true,
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
      // upstream-5xx-fallback-v1: provider failure identity from the worker
      if (Number.isInteger(message.error?.status)) error.status = message.error.status;
      if (typeof message.error?.provider === "string") error.provider = message.error.provider;
      if (typeof message.error?.model === "string") error.model = message.error.model;
      if (typeof message.error?.failoverReason === "string") error.failoverReason = message.error.failoverReason;
      active.reject(error);
    }

    this.releaseSessionOwner(worker, active.sessionOwnerKey);
    if (worker.retiring && worker.active.size === 0) {
      this.retire(worker);
    } else {
      this.drain(worker);
      this.retireIfDrained(worker);
    }
    this.requestPump();
  }

  onExit(worker, code, signal) {
    for (const [key, hint] of this.sessionAffinity)
      if (hint.worker === worker) this.sessionAffinity.delete(key);
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
    } else if (this.draining && this.successor && worker.queue.length > 0) {
      this.successor.adoptPending(worker.queue.splice(0));
    } else {
      for (const queued of worker.queue) {
        queued.reject(error);
      }
    }
    this.successor?.requestPump();
    this.checkDrained();

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

  async ensureWarmSpareWorkers() {
    if (this.closing || this.warmSpareWorkers === 0) return;
    const workers = [...this.workers.values()].filter(
      (worker) => !worker.retiring,
    );
    const hasLoad =
      this.pending.length > 0 ||
      workers.some(
        (worker) =>
          worker.ownerSessionKeys.size > 0 ||
          worker.active.size > 0 ||
          worker.queue.length > 0 ||
          worker.detachedTaskKeys.size > 0,
      );
    if (!hasLoad) return;
    let spareOrStarting = workers.filter(
      (worker) =>
        !worker.ready ||
        (worker.ownerSessionKeys.size === 0 &&
          worker.active.size === 0 &&
          worker.queue.length === 0 &&
          worker.detachedTaskKeys.size === 0),
    ).length;
    while (
      !this.closing &&
      spareOrStarting < this.warmSpareWorkers &&
      this.workers.size < this.maxWorkers
    ) {
      // spawn() registers its handle synchronously before awaiting readiness,
      // so concurrent callers observe this in-flight spare and do not fork a
      // duplicate.
      const startup = this.spawn(this.findAvailableSlot());
      spareOrStarting += 1;
      await startup;
    }
  }

  reapIdleWorkers() {
    if (this.closing || this.workers.size <= this.minWorkers) {
      return;
    }
    const now = Date.now();
    const idleWorkers = [...this.workers.values()]
      .filter((worker) => this.isFullyIdle(worker, now))
      .sort((left, right) => right.slot - left.slot);

    let removable =
      this.workers.size - this.capacityFloor() - this.retiringWorkerCount();
    for (const worker of idleWorkers) {
      if (removable <= 0) {
        break;
      }
      this.retire(worker);
      removable -= 1;
    }
  }

  // reapIdleWorkers and recycling must agree on how much warm capacity the
  // pool owes its callers, or one of them removes what the other is holding.
  capacityFloor() {
    const nonIdleCount = [...this.workers.values()].filter(
      (worker) =>
        !worker.retiring &&
        (!worker.ready ||
          worker.ownerSessionKeys.size > 0 ||
          worker.detachedTaskKeys.size > 0 ||
          worker.active.size > 0 ||
          worker.queue.length > 0),
    ).length;
    return Math.max(
      this.minWorkers,
      nonIdleCount > 0 ? nonIdleCount + this.warmSpareWorkers : 0,
    );
  }

  retiringWorkerCount() {
    return [...this.workers.values()].filter((worker) => worker.retiring)
      .length;
  }

  isFullyIdle(worker, now) {
    return (
      worker.ready &&
      !worker.retiring &&
      worker.ownerSessionKeys.size === 0 &&
      worker.detachedTaskKeys.size === 0 &&
      worker.active.size === 0 &&
      worker.queue.length === 0 &&
      now - worker.lastIdleAt >= this.idleTimeoutMs
    );
  }

  recycleReason(worker, now) {
    if (now - worker.startedAt < this.recycleMinAgeMs) {
      return undefined;
    }
    if (
      this.recycleRssBytes > 0 &&
      (worker.memory?.rss ?? 0) >= this.recycleRssBytes
    ) {
      return "rss";
    }
    if (
      this.recycleMaxLifetimeMs > 0 &&
      now - worker.startedAt >= this.recycleMaxLifetimeMs
    ) {
      return "lifetime";
    }
    if (
      this.recycleMaxSessions > 0 &&
      worker.servedSessionCount >= this.recycleMaxSessions
    ) {
      return "sessions";
    }
    return undefined;
  }

  // reapIdleWorkers only ever shrinks the pool back toward minWorkers, so the
  // resident Workers below that floor are never replaced and keep whatever
  // they accumulated. This retires one of those, but only when it is fully
  // idle and only behind a warm replacement, so no caller ever waits on a
  // cold start and no live run is interrupted.
  async recycleOverGrownWorker() {
    if (this.closing || !this.started || this.recyclingSlot !== null) {
      return;
    }
    const now = Date.now();
    if (now - this.lastRecycleAt < this.recycleCooldownMs) {
      return;
    }
    const worker = [...this.workers.values()]
      .filter(
        (candidate) =>
          this.isFullyIdle(candidate, now) &&
          this.recycleReason(candidate, now) !== undefined,
      )
      .sort(
        (left, right) => (right.memory?.rss ?? 0) - (left.memory?.rss ?? 0),
      )[0];
    if (!worker) {
      return;
    }
    const reason = this.recycleReason(worker, now);
    this.recyclingSlot = worker.slot;
    try {
      // Retiring this Worker must not dip below the warm floor, and Workers
      // already on their way out in this same sweep count against it. Under
      // real concurrency the floor is well above minWorkers, so this is what
      // keeps recycling from stripping capacity reapIdleWorkers is holding.
      if (
        this.workers.size - this.retiringWorkerCount() - 1 <
        this.capacityFloor()
      ) {
        const slot = this.findAvailableSlot();
        if (slot === undefined) {
          // The pool is at capacity. reapIdleWorkers frees a slot first.
          return;
        }
        await this.spawn(slot);
        // Load can grow while a replacement boots; re-check before retiring.
        if (
          this.closing ||
          this.workers.size - this.retiringWorkerCount() - 1 <
            this.capacityFloor()
        ) {
          return;
        }
      }
      if (this.closing || this.workers.get(worker.slot) !== worker) {
        return;
      }
      // The candidate may have taken a session while the replacement was
      // starting. Recycling is never worth interrupting live work for.
      if (!this.isFullyIdle(worker, Date.now())) {
        return;
      }
      this.recycledWorkerCount += 1;
      this.lastRecycleAt = Date.now();
      process.stderr.write(
        `[vlab-worker-pool] recycling worker slot=${worker.slot} ` +
          `pid=${String(worker.pid)} reason=${reason} ` +
          `rss=${String(worker.memory?.rss ?? 0)} ` +
          `sessions=${String(worker.servedSessionCount)} ` +
          `ageMs=${String(Date.now() - worker.startedAt)}\n`,
      );
      this.retire(worker);
    } finally {
      this.recyclingSlot = null;
    }
  }

  retire(worker) {
    if (worker.retiring && worker.retireTimer) {
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
      startupTimeoutMs: this.startupTimeoutMs,
      warmSpareWorkers: this.warmSpareWorkers,
      requestTimeoutMs: this.requestTimeoutMs,
      requestStallTimeoutMs: this.requestStallTimeoutMs,
      requestCancelGraceMs: this.requestCancelGraceMs,
      workerMaxOldSpaceMb: this.workerMaxOldSpaceMb,
      recycleRssBytes: this.recycleRssBytes,
      recycleMaxLifetimeMs: this.recycleMaxLifetimeMs,
      recycleMaxSessions: this.recycleMaxSessions,
      recycleCooldownMs: this.recycleCooldownMs,
      recycleMinAgeMs: this.recycleMinAgeMs,
      recycledWorkerCount: this.recycledWorkerCount,
      recyclingSlot: this.recyclingSlot,
      closing: this.closing,
      draining: this.draining,
      generationDrainTimeoutMs: this.generationDrainTimeoutMs,
      predecessor: this.predecessor ? this.predecessor.drainStatus() : null,
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
            nativeDeadline: job.nativeDeadline,
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
          ageMs: Math.max(0, Date.now() - worker.startedAt),
          servedSessionCount: worker.servedSessionCount,
          memory: worker.memory,
          recycleReason: this.recycleReason(worker, Date.now()),
          sessionHotset: worker.sessionHotset,
          gatewayOwnedToolProxy: worker.gatewayOwnedToolProxy,
          skillUsageTelemetry: worker.skillUsageTelemetry,
        })),
    };
  }

  // worker-generations.1 --------------------------------------------------
  // A replaced generation drains: it admits nothing new, hands unassigned turns
  // to its successor, lets every admitted run, queued turn and detached task
  // finish in the process that owns it, and retires each Worker once it is
  // free. close() remains the hard stop and also ends a drain that outlives
  // generationDrainTimeoutMs.
  beginDrain(successor) {
    if (successor && successor !== this && !this.successor && (this.draining || !this.closing)) {
      this.successor = successor;
      successor.predecessor = this;
    }
    if (this.draining) {
      if (this.successor && this.orphanTimer) {
        clearTimeout(this.orphanTimer);
        this.orphanTimer = null;
      }
      this.handOff(this.pending.splice(0));
      this.checkDrained();
      return this.drainedPromise;
    }
    if (this.closing) {
      return this.drainedPromise ?? Promise.resolve();
    }
    this.closing = true;
    this.draining = true;
    this.handoffExpected = true;
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
      this.reapTimer = null;
    }
    this.drainedPromise = new Promise((resolve) => {
      this.resolveDrained = resolve;
    });
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      const status = this.drainStatus();
      process.stderr.write(
        `[vlab-worker-pool] generation drain timed out after ` +
          `${String(this.generationDrainTimeoutMs)}ms; closing ` +
          `workers=${String(status.workers)} active=${String(status.active)} ` +
          `detached=${String(status.detached)}\n`,
      );
      void this.close().catch(() => {});
    }, this.generationDrainTimeoutMs);
    this.drainTimer.unref?.();
    if (!this.successor) {
      this.orphanTimer = setTimeout(() => {
        this.orphanTimer = null;
        this.rejectOrphanedTurns();
      }, this.successorWaitMs);
      this.orphanTimer.unref?.();
    }
    this.handOff(this.pending.splice(0));
    const status = this.drainStatus();
    process.stderr.write(
      `[vlab-worker-pool] generation draining workers=${String(status.workers)} ` +
        `active=${String(status.active)} queued=${String(status.queued)} ` +
        `detached=${String(status.detached)} successor=${String(Boolean(this.successor))}\n`,
    );
    for (const worker of [...this.workers.values()]) {
      this.retireIfDrained(worker);
    }
    this.checkDrained();
    return this.drainedPromise;
  }

  async waitForSuccessor(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (this.handoffExpected && !this.successor && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  // Unassigned turns of a draining generation start in its successor. 9.1
  // stops the old service before it registers the new one, so they are held
  // for successorWaitMs; without a successor by then (a real shutdown) nothing
  // can run them.
  handOff(jobs) {
    if (jobs.length === 0) return;
    if (this.successor) {
      this.successor.adoptPending(jobs);
      return;
    }
    if (this.handoffExpected && this.draining) {
      this.pending.push(...jobs);
      return;
    }
    const closeError = new Error("worker pool is closing");
    for (const job of jobs) job.reject(closeError);
  }

  rejectOrphanedTurns() {
    if (this.successor) return;
    this.handoffExpected = false;
    const closeError = new Error("worker pool is closing");
    for (const job of this.pending.splice(0)) job.reject(closeError);
    this.checkDrained();
  }

  adoptPending(jobs) {
    if (this.closing) {
      this.handOff(jobs);
      return;
    }
    this.pending.unshift(...jobs);
    this.requestPump();
  }

  holdsSessionOwner(sessionOwnerKey) {
    const worker = this.sessionOwners.get(sessionOwnerKey);
    if (worker && this.workers.get(worker.slot) === worker) return true;
    return this.predecessor?.holdsSessionOwner(sessionOwnerKey) ?? false;
  }

  retireIfDrained(worker) {
    if (
      !this.draining ||
      this.workers.get(worker.slot) !== worker ||
      (worker.retiring && worker.retireTimer)
    ) {
      return;
    }
    if (
      !worker.ready ||
      (worker.active.size === 0 &&
        worker.queue.length === 0 &&
        worker.ownerSessionKeys.size === 0 &&
        worker.detachedTaskKeys.size === 0)
    ) {
      this.retire(worker);
    }
  }

  checkDrained() {
    // Held turns still wait for a successor; the process count alone does not
    // end the drain.
    if (this.draining && this.workers.size === 0 && this.pending.length === 0) {
      this.draining = false;
      this.finishDrain();
    }
  }

  finishDrain() {
    this.started = false;
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    if (this.orphanTimer) {
      clearTimeout(this.orphanTimer);
      this.orphanTimer = null;
    }
    if (this.successor?.predecessor === this) {
      this.successor.predecessor = this.predecessor;
    }
    if (this.predecessor?.successor === this) {
      this.predecessor.successor = this.successor;
    }
    this.successor?.requestPump();
    this.resolveDrained?.();
    this.resolveDrained = null;
  }

  drainStatus() {
    const workers = [...this.workers.values()];
    return {
      draining: this.draining,
      workers: workers.length,
      active: workers.reduce((sum, worker) => sum + worker.active.size, 0),
      queued: workers.reduce((sum, worker) => sum + worker.queue.length, 0),
      detached: workers.reduce(
        (sum, worker) => sum + worker.detachedTaskKeys.size,
        0,
      ),
      sessionOwners: this.sessionOwners.size,
    };
  }

  close() {
    if (this.closePromise) return this.closePromise;
    // A hard close also ends a drain that is still running.
    this.closing = true;
    this.draining = false;
    this.started = false;
    this.closePromise = this.closeWorkers();
    return this.closePromise;
  }

  async closeWorkers() {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
      this.reapTimer = null;
    }
    const closeError = new Error("worker pool is closing");
    for (const [id, pending] of this.pendingControls) {
      clearTimeout(pending.timer);
      pending.reject(closeError);
      this.pendingControls.delete(id);
    }
    this.handOff(this.pending.splice(0));
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
    this.sessionAffinity.clear();
    this.finishDrain();
  }
}
