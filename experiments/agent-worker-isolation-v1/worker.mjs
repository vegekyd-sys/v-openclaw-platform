import { performance } from "node:perf_hooks";
import { initializeWorkerNativeHooks } from "./native-hook-runtime.mjs";
import { pathToFileURL } from "node:url";
import { buildHarnessAttemptResult } from "./harness-result.mjs";
import { readFastCompactionStats } from "./fast-compaction-provider.mjs";
import { isBridgedHarnessEventCallback } from "./harness-event-contract.mjs";
import { getSessionHotsetStatus } from "./session-hotset.mjs";
import {
  normalizeWorkerGatewayEvent,
  WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
  WORKER_GATEWAY_EVENT_BRIDGE_SYMBOL,
} from "./worker-gateway-events.mjs";
import { installGatewayOwnedToolProxy } from "./gateway-owned-tool-proxy.mjs";
import { buildRelayedSkillUsageEvent } from "./skill-usage-telemetry.mjs";
import { createNativeAttemptBridge, NATIVE_ATTEMPT_BRIDGE } from "./native-attempt-bridge.mjs";
import {
  resolveOpenClawAgentCommandRuntimePath,
  resolveOpenClawPreparedModelRuntimePath,
} from "./runtime-path.mjs";

let agentRuntimePromise;
let agentEventRuntimePromise;
let diagnosticRuntimePromise;
let compactionRuntimePromise;
const activeControllers = new Map();
const activeSteerControllers = new Map();
const skillTelemetryContexts = new Map();
const pendingStreamEventAcks = new Map();
const pendingWorkerGatewayEventAcks = new Map();
const pendingGatewayToolRequests = new Map();
const externalTaskContextsBySessionKey = new Map();
const externalTaskContextsBySessionId = new Map();
const externalTaskContextsByRunId = new Map();
let nextStreamEventId = 1;
let nextGatewayToolRequestId = 1;
const nativeAttemptBridge = createNativeAttemptBridge();
globalThis[NATIVE_ATTEMPT_BRIDGE] = nativeAttemptBridge;
const configuredHeartbeatMs = Number(
  process.env.VLAB_WORKER_HEARTBEAT_MS ?? 15_000,
);
const heartbeatMs = Number.isFinite(configuredHeartbeatMs)
  ? Math.max(25, configuredHeartbeatMs)
  : 15_000;

function gatewayToolError(message) {
  const error = new Error(
    message?.error?.message ?? "Gateway-owned tool request failed",
  );
  error.name = message?.error?.name ?? error.name;
  if (message?.error?.code) error.code = message.error.code;
  return error;
}

async function executeToolInGateway(request) {
  if (typeof process.send !== "function") {
    throw new Error("Gateway-owned tool request requires an IPC channel");
  }
  const requestId = `gateway-tool-${nextGatewayToolRequestId++}`;
  const timeoutMs = Math.max(
    1_000,
    Number(process.env.VLAB_GATEWAY_OWNED_TOOL_TIMEOUT_MS ?? 310_000),
  );
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingGatewayToolRequests.delete(requestId);
      reject(
        Object.assign(
          new Error(`Gateway-owned tool ${requestId} timed out after ${timeoutMs}ms`),
          { code: "VLAB_GATEWAY_TOOL_TIMEOUT" },
        ),
      );
    }, timeoutMs);
    timer.unref?.();
    pendingGatewayToolRequests.set(requestId, { resolve, reject, timer });
    process.send({ type: "gateway-tool-request", requestId, request });
  });
}

const gatewayOwnedToolProxy = installGatewayOwnedToolProxy({
  timeoutMs: Number(
    process.env.VLAB_GATEWAY_OWNED_TOOL_TIMEOUT_MS ?? 310_000,
  ),
  executeInGateway: executeToolInGateway,
});
globalThis[Symbol.for("versa.vlab.external-harness-task-bridge-v1")] = true;
globalThis[Symbol.for("versa.vlab.external-harness-task-record-v1")] =
  (spawn) => {
    const context =
      externalTaskContextsByRunId.get(spawn?.requesterTurnRunId) ??
      externalTaskContextsBySessionKey.get(spawn?.parentSessionKey);
    if (context && spawn?.status === "accepted") {
      context.acceptedSessionSpawns.push(spawn);
    }
  };
globalThis[Symbol.for("versa.vlab.external-harness-task-yield-v1")] =
  ({ sessionId, requesterSessionKey, requesterTurnRunId } = {}) => {
    const context =
      externalTaskContextsByRunId.get(requesterTurnRunId) ??
      externalTaskContextsBySessionId.get(sessionId) ??
      externalTaskContextsBySessionKey.get(requesterSessionKey);
    return (context?.acceptedSessionSpawns.length ?? 0) > 0;
  };
const skillUsageTelemetryStats = {
  observed: 0,
  relayed: 0,
  unmatched: 0,
  failed: 0,
  pending: 0,
  unavailable: false,
};

function publishSkillUsageTelemetryStatus() {
  process.send?.({
    type: "skill-usage-telemetry-status",
    skillUsageTelemetry: { ...skillUsageTelemetryStats },
  });
}

function sendProgress(requestId, request, reason = "worker:active") {
  process.send?.({
    type: "progress",
    id: requestId,
    runId: request.runId,
    sessionId: request.sessionId,
    sessionKey: request.sessionKey,
    reason,
    sessionHotset: getSessionHotsetStatus(),
    gatewayOwnedToolProxy: gatewayOwnedToolProxy.status(),
    skillUsageTelemetry: { ...skillUsageTelemetryStats },
  });
}

const heartbeatTimer = setInterval(() => {
  for (const [requestId, active] of activeControllers) {
    sendProgress(requestId, active.request);
  }
}, heartbeatMs);
heartbeatTimer.unref?.();

function serializeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : undefined,
    code:
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined,
  };
}

function jsonSafe(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function streamEventError(message) {
  const error = new Error(
    message?.error?.message ?? "Worker stream event delivery failed",
  );
  error.name = message?.error?.name ?? error.name;
  if (message?.error?.code) {
    error.code = message.error.code;
  }
  return error;
}

function workerGatewayEventError(message) {
  const error = new Error(
    message?.error?.message ?? "Worker Gateway event delivery failed",
  );
  error.name = message?.error?.name ?? error.name;
  if (message?.error?.code) error.code = message.error.code;
  return error;
}

async function sendWorkerGatewayEvent(rawEvent) {
  if (typeof process.send !== "function") {
    throw new Error("Worker Gateway event requires an IPC channel");
  }
  const event = normalizeWorkerGatewayEvent(rawEvent);
  const timeoutMs = Math.max(
    1_000,
    Number(process.env.VLAB_WORKER_GATEWAY_EVENT_TIMEOUT_MS ?? 600_000),
  );
  const maxAttempts = Math.max(
    1,
    Number(process.env.VLAB_WORKER_GATEWAY_EVENT_MAX_ATTEMPTS ?? 3),
  );
  const existing = pendingWorkerGatewayEventAcks.get(event.eventId);
  if (existing) return await existing.promise;

  let resolvePending;
  let rejectPending;
  const promise = new Promise((resolve, reject) => {
    resolvePending = resolve;
    rejectPending = reject;
  });
  const pending = {
    promise,
    resolve: resolvePending,
    reject: rejectPending,
    timer: undefined,
    attempts: 0,
  };
  pendingWorkerGatewayEventAcks.set(event.eventId, pending);

  const sendAttempt = () => {
    pending.attempts += 1;
    process.send(
      { type: "worker-gateway-event", event },
      (error) => {
        if (error && pendingWorkerGatewayEventAcks.has(event.eventId)) {
          clearTimeout(pending.timer);
          pendingWorkerGatewayEventAcks.delete(event.eventId);
          pending.reject(error);
        }
      },
    );
    pending.timer = setTimeout(() => {
      if (!pendingWorkerGatewayEventAcks.has(event.eventId)) return;
      if (pending.attempts < maxAttempts) {
        sendAttempt();
        return;
      }
      pendingWorkerGatewayEventAcks.delete(event.eventId);
      const error = new Error(
        `Worker Gateway event ${event.eventId} was not acknowledged after ${maxAttempts} attempts`,
      );
      error.code = "VLAB_WORKER_GATEWAY_EVENT_ACK_TIMEOUT";
      pending.reject(error);
    }, timeoutMs);
    pending.timer.unref?.();
  };
  sendAttempt();
  return await promise;
}

async function loadDiagnosticRuntime() {
  if (!diagnosticRuntimePromise) {
    const runtimePath =
      process.env.VLAB_OPENCLAW_DIAGNOSTIC_RUNTIME ??
      new URL(
        "./diagnostic-runtime.js",
        pathToFileURL(configuredAgentRuntimePath()),
      );
    diagnosticRuntimePromise = import(
      runtimePath instanceof URL
        ? runtimePath.href
        : pathToFileURL(runtimePath).href,
    );
  }
  return await diagnosticRuntimePromise;
}

async function installSkillUsageTelemetry() {
  const runtime = await loadDiagnosticRuntime();
  if (typeof runtime.onInternalDiagnosticEvent !== "function") {
    throw new Error("OpenClaw internal diagnostic subscription is unavailable");
  }
  return runtime.onInternalDiagnosticEvent((event, metadata) => {
    if (event?.type !== "skill.used" || metadata?.trusted !== true) return;
    skillUsageTelemetryStats.observed += 1;
    let relayedEvent;
    try {
      const context = skillTelemetryContexts.get(event.runId);
      relayedEvent = buildRelayedSkillUsageEvent({
        contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
        event,
        request: context?.request,
        skillTelemetryIndex: context?.skillTelemetryIndex,
      });
    } catch {
      skillUsageTelemetryStats.failed += 1;
      publishSkillUsageTelemetryStatus();
      return;
    }
    if (!relayedEvent) {
      skillUsageTelemetryStats.unmatched += 1;
      publishSkillUsageTelemetryStatus();
      return;
    }
    skillUsageTelemetryStats.pending += 1;
    publishSkillUsageTelemetryStatus();
    void sendWorkerGatewayEvent(relayedEvent)
      .then(() => {
        skillUsageTelemetryStats.relayed += 1;
      })
      .catch(() => {
        skillUsageTelemetryStats.failed += 1;
      })
      .finally(() => {
        skillUsageTelemetryStats.pending = Math.max(
          0,
          skillUsageTelemetryStats.pending - 1,
        );
        publishSkillUsageTelemetryStatus();
      });
  });
}

globalThis[WORKER_GATEWAY_EVENT_BRIDGE_SYMBOL] = sendWorkerGatewayEvent;

async function sendStreamEvent(
  requestId,
  request,
  name,
  args,
  abortSignal,
) {
  if (!isBridgedHarnessEventCallback(name)) {
    throw new Error(`unsupported Worker stream callback: ${name}`);
  }
  if (typeof process.send !== "function") {
    throw new Error("Worker stream callback requires an IPC channel");
  }
  const eventId = `stream-${nextStreamEventId}`;
  nextStreamEventId += 1;
  await new Promise((resolve, reject) => {
    const finish = (error) => {
      const pending = pendingStreamEventAcks.get(eventId);
      if (!pending) {
        return;
      }
      pendingStreamEventAcks.delete(eventId);
      abortSignal.removeEventListener("abort", onAbort);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onAbort = () => {
      finish(
        abortSignal.reason ??
          Object.assign(new Error("Worker stream event was cancelled"), {
            name: "AbortError",
          }),
      );
    };
    pendingStreamEventAcks.set(eventId, {
      requestId,
      resolve: () => finish(),
      reject: (error) => finish(error),
    });
    abortSignal.addEventListener("abort", onAbort, { once: true });
    process.send(
      {
        type: "stream-event",
        id: requestId,
        eventId,
        runId: request.runId,
        sessionId: request.sessionId,
        sessionKey: request.sessionKey,
        name,
        args: jsonSafe(args),
      },
      (error) => {
        if (error) {
          finish(error);
        }
      },
    );
  });
}

function queueStreamEvent(
  state,
  requestId,
  request,
  name,
  args,
  abortSignal,
) {
  const delivery = state.tail.then(() =>
    sendStreamEvent(
      requestId,
      request,
      name,
      args,
      abortSignal,
    ),
  );
  state.tail = delivery.catch((error) => {
    state.failure ??= error;
  });
  return delivery;
}

function buildStreamCallbacks(
  requestId,
  request,
  abortSignal,
  state,
  globallyBridgedNames,
) {
  const callbackNames = Array.isArray(request.eventCallbackNames)
    ? request.eventCallbackNames
    : [];
  return Object.fromEntries(
    callbackNames
      .filter(
        (name) =>
          isBridgedHarnessEventCallback(name) &&
          !globallyBridgedNames.has(name),
      )
      .map((name) => [
        name,
        async (...args) =>
          await queueStreamEvent(
            state,
            requestId,
            request,
            name,
            args,
            abortSignal,
          ),
      ]),
  );
}

function configuredAgentRuntimePath() {
  return (
    process.env.VLAB_OPENCLAW_AGENT_RUNTIME ??
    "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/agent-runtime.js"
  );
}

async function loadAgentRuntime() {
  if (!agentRuntimePromise) {
    agentRuntimePromise = import(
      pathToFileURL(configuredAgentRuntimePath()).href
    );
  }
  return await agentRuntimePromise;
}

async function loadCompactionRuntime() {
  if (!compactionRuntimePromise) {
    compactionRuntimePromise = (async () => {
      const agentRuntime = await loadAgentRuntime();
      if (
        typeof agentRuntime.loadConfig === "function" &&
        typeof agentRuntime.agentCommandFromGatewayIngress === "function" &&
        typeof agentRuntime.acquireAgentRunPreparedModelRuntime === "function"
      ) {
        return {
          configRuntime: agentRuntime,
          commandRuntime: agentRuntime,
          preparedRuntime: agentRuntime,
        };
      }
      const agentRuntimePath = configuredAgentRuntimePath();
      const [
        configRuntime,
        commandRuntime,
        preparedRuntime,
      ] = await Promise.all([
          import(
            new URL("./config-runtime.js", pathToFileURL(agentRuntimePath)).href
          ),
          import(
            pathToFileURL(
              resolveOpenClawAgentCommandRuntimePath({ agentRuntimePath }),
            ).href
          ),
          import(
            pathToFileURL(
              resolveOpenClawPreparedModelRuntimePath({ agentRuntimePath }),
            ).href
          ),
        ]);
      if (typeof configRuntime.loadConfig !== "function") {
        throw new Error("OpenClaw config runtime is unavailable");
      }
      if (typeof commandRuntime.agentCommandFromGatewayIngress !== "function") {
        throw new Error("OpenClaw Gateway Agent command runtime is unavailable");
      }
      if (
        typeof preparedRuntime.acquireAgentRunPreparedModelRuntime !== "function"
      ) {
        throw new Error("OpenClaw prepared model runtime is unavailable");
      }
      return {
        configRuntime,
        commandRuntime,
        preparedRuntime,
      };
    })();
  }
  return await compactionRuntimePromise;
}

async function loadAgentEventRuntime() {
  if (!agentEventRuntimePromise) {
    agentEventRuntimePromise = (async () => {
      const agentRuntime = await loadAgentRuntime();
      if (typeof agentRuntime.onAgentEvent === "function") {
        return agentRuntime;
      }
      const runtimePath =
        process.env.VLAB_OPENCLAW_AGENT_EVENT_RUNTIME ??
        new URL(
          "./agent-harness-runtime.js",
          pathToFileURL(configuredAgentRuntimePath()),
        );
      try {
        return await import(
          runtimePath instanceof URL
            ? runtimePath.href
            : pathToFileURL(runtimePath).href
        );
      } catch {
        return {};
      }
    })();
  }
  return await agentEventRuntimePromise;
}

function runCpu(durationMs) {
  const wallStartedAt = performance.now();
  const cpuStartedAt = process.cpuUsage();
  let accumulator = 0;
  while (performance.now() - wallStartedAt < durationMs) {
    accumulator += Math.sqrt((accumulator % 10_000) + 1);
  }
  const wallMs = performance.now() - wallStartedAt;
  const cpu = process.cpuUsage(cpuStartedAt);
  return {
    kind: "cpu",
    wallMs,
    cpuUserMs: cpu.user / 1_000,
    cpuSystemMs: cpu.system / 1_000,
    accumulator,
  };
}

async function runHold(durationMs, abortSignal) {
  const startedAt = performance.now();
  await new Promise((resolve, reject) => {
    const finish = () => {
      abortSignal.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, durationMs);
    const onAbort = () => {
      clearTimeout(timer);
      abortSignal.removeEventListener("abort", onAbort);
      reject(abortSignal.reason ?? new Error("worker request was cancelled"));
    };
    if (abortSignal.aborted) {
      onAbort();
      return;
    }
    abortSignal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    kind: "hold",
    wallMs: performance.now() - startedAt,
  };
}

async function runAgent(message, abortSignal) {
  const attemptStartedAt = Date.now();
  const agentRuntime = await loadAgentRuntime();
  const startedAt = performance.now();
  const eventRuntime = await loadAgentEventRuntime();
  const requestedEventNames = new Set(
    Array.isArray(message.eventCallbackNames)
      ? message.eventCallbackNames
      : [],
  );
  const globallyBridgedNames = new Set();
  const streamState = {
    tail: Promise.resolve(),
    failure: undefined,
  };
  const unregisterNativeAttempt = message.nativeAttempt91 === true
    ? nativeAttemptBridge.register(message, abortSignal, (deadline) => {
        if (!requestedEventNames.has("onAttemptDeadlineChanged")) return;
        void queueStreamEvent(streamState, message.id, message,
          "onAttemptDeadlineChanged", [deadline], abortSignal).catch(() => {});
      }, executeToolInGateway, () => buildStreamCallbacks(
        message.id, message, abortSignal, streamState, globallyBridgedNames))
    : () => {};
  let unsubscribeAgentEvents = () => {};
  if (typeof eventRuntime.onAgentEvent === "function") {
    globallyBridgedNames.add("onAgentEvent");
    globallyBridgedNames.add("onPartialReply");
    unsubscribeAgentEvents = eventRuntime.onAgentEvent((event) => {
      if (event?.runId !== message.runId) {
        return;
      }
      if (requestedEventNames.has("onAgentEvent")) {
        void queueStreamEvent(
          streamState,
          message.id,
          message,
          "onAgentEvent",
          [
            {
              stream: event.stream,
              data: event.data,
              sessionKey: event.sessionKey,
            },
          ],
          abortSignal,
        );
      }
      if (
        event.stream === "assistant" &&
        requestedEventNames.has("onPartialReply") &&
        typeof event.data?.text === "string"
      ) {
        void queueStreamEvent(
          streamState,
          message.id,
          message,
          "onPartialReply",
          [event.data],
          abortSignal,
        );
      }
    });
  }
  let result;
  try {
    const {
      configRuntime,
      commandRuntime,
      preparedRuntime,
    } = await loadCompactionRuntime();
    const config = configRuntime.loadConfig();
    const agentId = message.agentId ?? "makaron";
    const workspaceDir = agentRuntime.resolveAgentWorkspaceDir(config, agentId);
    const preparedRuntimeLease =
      await preparedRuntime.acquireAgentRunPreparedModelRuntime(
        {
          config,
          agentId,
          agentDir: agentRuntime.resolveAgentDir(config, agentId),
          allowGatewaySubagentBinding: true,
          workspaceDir,
        },
        {
          abortSignal,
          catalogMode: "static",
        },
      );
    try {
      await initializeWorkerNativeHooks({
        pluginGeneration: preparedRuntimeLease.pluginGeneration,
        agentRuntimePath: configuredAgentRuntimePath(),
      });
      const externalTaskContext = { acceptedSessionSpawns: [] };
      externalTaskContextsBySessionKey.set(
        message.sessionKey,
        externalTaskContext,
      );
      externalTaskContextsBySessionId.set(
        message.sessionId,
        externalTaskContext,
      );
      externalTaskContextsByRunId.set(message.runId, externalTaskContext);
      try {
        result = await nativeAttemptBridge.withPluginGeneration(preparedRuntimeLease.pluginGeneration, () => commandRuntime.agentCommandFromGatewayIngress({
      message: message.message,
      transcriptMessage: message.transcriptMessage ?? message.message,
      images: message.images,
      imageOrder: message.imageOrder,
      clientTools: message.clientTools,
      agentId: message.agentId ?? "makaron",
      sessionId: message.sessionId,
      sessionKey: message.sessionKey,
    // The embedded runner also has a global execution lane. If omitted, every
    // session in this process shares "main" and is silently serialized.
    // A canonical session key gives different sessions independent lanes while
    // repeated turns for one session remain serialized.
    lane: message.lane ?? message.sessionKey,
    runId: message.runId,
    deliver: false,
    json: true,
    timeout: String(message.timeoutSeconds ?? 300),
    messageChannel: message.messageChannel ?? "webchat",
    messageProvider: message.messageProvider,
    channel: message.channel ?? message.messageChannel ?? "webchat",
    accountId: message.accountId,
    to: message.to,
    replyTo: message.replyTo,
    replyChannel: message.replyChannel,
    replyAccountId: message.replyAccountId,
    threadId: message.threadId,
    runContext: message.runContext,
    toolsAllow: message.toolsAllow,
    thinking: message.thinking,
    extraSystemPrompt: message.extraSystemPrompt,
    sourceReplyDeliveryMode: message.sourceReplyDeliveryMode,
    senderIsOwner: message.senderIsOwner,
    modelRun: message.modelRun ?? false,
    ...(message.agentCommandOptions ?? {}),
    allowModelOverride: true,
      ...(message.nativeAttempt91 === true ? {} : buildStreamCallbacks(
        message.id,
        message,
        abortSignal,
        streamState,
        globallyBridgedNames,
      )),
    // This process is a persistent, concurrent Agent runtime, not a one-shot
    // local CLI. Per-turn one-shot teardown can wait on process-global MCP/CLI
    // resources after the assistant has already finished, holding the parent
    // Session lane for minutes. Process retirement owns final resource cleanup.
    cleanupBundleMcpOnRunEnd: false,
    cleanupCliLiveSessionOnRunEnd: false,
    oneShotCliRun: false,
    // The worker owns the user line unless the Gateway recorder had already
    // persisted it before dispatch. After the run, the Gateway acknowledges
    // the exact worker-written message so its fallback cannot append a copy.
    suppressPromptPersistence: message.suppressPromptPersistence === true,
    skipInitialSessionTouch: true,
    // The trusted Gateway Harness has already admitted the visible turn and
    // owns its native recovery lease. A second cross-process claim is invalid
    // in 9.1. Do not serialize or transfer that process-local lease.
    mainRestartRecoveryAdmitted: message.harnessAttempt === true,
    allowGatewaySubagentBinding: true,
      abortSignal,
      }, undefined, undefined, {}, {
        config,
        pluginGeneration: preparedRuntimeLease.pluginGeneration,
      }));
      if (message.nativeAttempt91 === true) nativeAttemptBridge.assertPrepared(message.runId);
      } finally {
        if (
          externalTaskContextsBySessionKey.get(message.sessionKey) ===
          externalTaskContext
        ) {
          externalTaskContextsBySessionKey.delete(message.sessionKey);
        }
        if (
          externalTaskContextsBySessionId.get(message.sessionId) ===
          externalTaskContext
        ) {
          externalTaskContextsBySessionId.delete(message.sessionId);
        }
        if (
          externalTaskContextsByRunId.get(message.runId) ===
          externalTaskContext
        ) {
          externalTaskContextsByRunId.delete(message.runId);
        }
      }
      result.acceptedSessionSpawns = [
        ...(result.acceptedSessionSpawns ?? []),
        ...externalTaskContext.acceptedSessionSpawns,
      ];
    } finally {
      preparedRuntimeLease.release();
    }
    await streamState.tail;
    if (streamState.failure) {
      throw streamState.failure;
    }
  } finally {
    unsubscribeAgentEvents();
    unregisterNativeAttempt();
  }
  if (abortSignal.aborted) {
    throw abortSignal.reason ?? new Error("worker Agent request was cancelled");
  }
  const agentMeta = result.meta?.agentMeta ?? result.meta ?? {};
  const response = {
    kind: "agent",
    elapsedMs: performance.now() - startedAt,
    payloads: jsonSafe(result.payloads ?? []),
    didSendViaMessagingTool: result.didSendViaMessagingTool === true,
    didDeliverSourceReplyViaMessageTool:
      result.didDeliverSourceReplyViaMessageTool === true,
    didSendDeterministicApprovalPrompt:
      result.didSendDeterministicApprovalPrompt === true,
    messagingToolSentTexts: jsonSafe(result.messagingToolSentTexts ?? []),
    messagingToolSentMediaUrls: jsonSafe(
      result.messagingToolSentMediaUrls ?? [],
    ),
    messagingToolSentTargets: jsonSafe(result.messagingToolSentTargets ?? []),
    messagingToolSourceReplyPayloads: jsonSafe(
      result.messagingToolSourceReplyPayloads ?? [],
    ),
    acceptedSessionSpawns: jsonSafe(result.acceptedSessionSpawns ?? []),
    heartbeatToolResponse: jsonSafe(result.heartbeatToolResponse ?? null),
    meta: jsonSafe({
      provider: agentMeta.provider,
      model: agentMeta.model,
      agentId: message.agentId ?? "makaron",
      sessionId: agentMeta.sessionId,
      sessionFile: agentMeta.sessionFile,
      usage: agentMeta.usage,
      aborted: result.meta?.aborted === true,
      systemPromptReport: result.meta?.systemPromptReport,
      finalPromptText: result.meta?.finalPromptText,
      compactionCount: agentMeta.compactionCount,
      compactionTokensAfter: agentMeta.compactionTokensAfter,
      fastCompaction: readFastCompactionStats(),
    }),
  };
  if (message.harnessAttempt === true) {
    response.attempt = jsonSafe(await buildHarnessAttemptResult(result,
      message.nativeAttempt91 === true ? { attemptStartedAt, transcriptTarget: {
        agentId: message.agentId ?? "makaron",
        sessionKey: message.sessionKey,
        sessionId: agentMeta.sessionId ?? message.sessionId,
      } } : {}));
  }
  return response;
}

process.on("message", async (message) => {
  if (message?.type === "permission-change" && message.requestId && message.controlId) {
    const active = activeControllers.get(message.requestId);
    try {
      if (!active || active.controller.signal.aborted) throw new Error("Worker request is not active");
      const applied = await nativeAttemptBridge.applyPermission(active.request.runId, message.mode);
      process.send?.({ type: "permission-change-ack", requestId: message.requestId,
        controlId: message.controlId, ok: true, applied });
    } catch (error) {
      process.send?.({ type: "permission-change-ack", requestId: message.requestId,
        controlId: message.controlId, ok: false, error: serializeError(error) });
    }
    return;
  }
  if (message?.type === "gateway-tool-response" && message.requestId) {
    const pending = pendingGatewayToolRequests.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingGatewayToolRequests.delete(message.requestId);
    if (message.ok === true) pending.resolve(message.result);
    else pending.reject(gatewayToolError(message));
    return;
  }
  if (message?.type === "worker-gateway-event-ack" && message.eventId) {
    const pending = pendingWorkerGatewayEventAcks.get(message.eventId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingWorkerGatewayEventAcks.delete(message.eventId);
    if (message.ok === true) pending.resolve(message.result);
    else pending.reject(workerGatewayEventError(message));
    return;
  }
  if (message?.type === "stream-event-ack" && message.eventId) {
    const pending = pendingStreamEventAcks.get(message.eventId);
    if (!pending || pending.requestId !== message.requestId) {
      return;
    }
    if (message.ok === true) {
      pending.resolve();
    } else {
      pending.reject(streamEventError(message));
    }
    return;
  }
  if (message?.type === "cancel" && message.requestId) {
    const active = activeControllers.get(message.requestId);
    const controller = active?.controller;
    if (controller && !controller.signal.aborted) {
      const error = new Error(`worker request ${message.requestId} was cancelled`);
      error.name = "AbortError";
      controller.abort(error);
    }
    return;
  }
  if (message?.type === "steer-cancel") {
    const pending = activeSteerControllers.get(message.steerId);
    if (pending?.requestId === message.requestId) pending.controller.abort();
    return;
  }
  if (message?.type === "steer" && message.requestId && message.steerId) {
    const active = activeControllers.get(message.requestId);
    try {
      if (!active) {
        throw Object.assign(new Error("worker Agent request is not active"), {
          code: "VLAB_WORKER_STEER_NOT_ACTIVE",
        });
      }
      if (active.request.nativeAttempt91 === true) {
        const controller = new AbortController();
        activeSteerControllers.set(message.steerId, {requestId:message.requestId,controller});
        const emit = data => process.send?.({requestId:message.requestId,steerId:message.steerId,...data});
        const result = await nativeAttemptBridge.steer(active.request.runId, message.text, {
          ...message.options,
          abortSignal: AbortSignal.any([active.controller.signal, controller.signal]),
          onQueueAccepted: accepted => emit({type:'steer-accepted',accepted}),
          ...(message.preparedMessage ? {userTurnTranscriptRecorder:{
            resolveMessage: async () => message.preparedMessage,
            markRuntimePersisted: (persisted,receipt) => emit({type:'steer-persisted',message:persisted,receipt}),
          }} : {}),
        });
        emit({type:'steer-ack',ok:true,result});
        return;
      }
      if (message.options?.waitForTranscriptCommit === true) {
        throw Object.assign(
          new Error("worker Steer does not support transcript-commit waiting"),
          { code: "VLAB_WORKER_STEER_COMMIT_WAIT_UNSUPPORTED" },
        );
      }
      const eventRuntime = await loadAgentEventRuntime();
      if (typeof eventRuntime.queueAgentHarnessMessage !== "function") {
        throw Object.assign(
          new Error("OpenClaw Agent Harness Steer runtime is unavailable"),
          { code: "VLAB_WORKER_STEER_RUNTIME_UNAVAILABLE" },
        );
      }
      const accepted = eventRuntime.queueAgentHarnessMessage(
        active.request.sessionId,
        message.text,
        {
          steeringMode: message.options?.steeringMode ?? "all",
          sourceReplyDeliveryMode:
            message.options?.sourceReplyDeliveryMode,
        },
      );
      if (accepted !== true) {
        throw Object.assign(new Error("active Worker run rejected Steer"), {
          code: "VLAB_WORKER_STEER_REJECTED",
        });
      }
      process.send?.({
        type: "steer-ack",
        requestId: message.requestId,
        steerId: message.steerId,
        ok: true,
      });
    } catch (error) {
      process.send?.({
        type: "steer-ack",
        requestId: message.requestId,
        steerId: message.steerId,
        ok: false,
        error: serializeError(error),
      });
    } finally {
      activeSteerControllers.delete(message.steerId);
    }
    return;
  }
  if (!message?.id) {
    return;
  }
  const controller = new AbortController();
  activeControllers.set(message.id, { controller, request: message });
  if (message.kind === "agent" && message.runId) {
    skillTelemetryContexts.set(message.runId, {
      request: message,
      skillTelemetryIndex: Array.isArray(message.skillTelemetryIndex)
        ? message.skillTelemetryIndex
        : [],
    });
  }
  sendProgress(message.id, message, "worker:started");
  try {
    let result;
    if (message.kind === "ping") {
      result = { kind: "ping", at: Date.now() };
    } else if (message.kind === "cpu") {
      const durationMs = Number(message.durationMs);
      if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > 60_000) {
        throw new Error("durationMs must be between 1 and 60000");
      }
      result = runCpu(durationMs);
    } else if (message.kind === "hold") {
      const durationMs = Number(message.durationMs);
      if (
        !Number.isFinite(durationMs) ||
        durationMs < 1 ||
        durationMs > 172_800_000
      ) {
        throw new Error("durationMs must be between 1 and 172800000");
      }
      result = await runHold(durationMs, controller.signal);
    } else if (message.kind === "agent") {
      result = await runAgent(message, controller.signal);
    } else {
      throw new Error(`unsupported worker request kind: ${String(message.kind)}`);
    }
    process.send?.({
      type: "response",
      id: message.id,
      ok: true,
      result,
      sessionHotset: getSessionHotsetStatus(),
      gatewayOwnedToolProxy: gatewayOwnedToolProxy.status(),
      skillUsageTelemetry: { ...skillUsageTelemetryStats },
    });
  } catch (error) {
    process.send?.({
      type: "response",
      id: message.id,
      ok: false,
      error: serializeError(error),
      sessionHotset: getSessionHotsetStatus(),
      gatewayOwnedToolProxy: gatewayOwnedToolProxy.status(),
      skillUsageTelemetry: { ...skillUsageTelemetryStats },
    });
  } finally {
    activeControllers.delete(message.id);
    if (message.kind === "agent" && message.runId) {
      const retained = skillTelemetryContexts.get(message.runId);
      const timer = setTimeout(() => {
        if (skillTelemetryContexts.get(message.runId) === retained) {
          skillTelemetryContexts.delete(message.runId);
        }
      }, 30_000);
      timer.unref?.();
    }
  }
});

if (process.env.VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME === "1") {
  await loadAgentRuntime();
}
if (process.env.VLAB_REQUIRE_SKILL_USAGE_TELEMETRY === "1") {
  await installSkillUsageTelemetry();
} else {
  skillUsageTelemetryStats.unavailable = true;
}

process.send?.({
  type: "ready",
  gatewayOwnedToolProxy: gatewayOwnedToolProxy.status(),
  pid: process.pid,
  sessionHotset: getSessionHotsetStatus(),
  skillUsageTelemetry: { ...skillUsageTelemetryStats },
});
