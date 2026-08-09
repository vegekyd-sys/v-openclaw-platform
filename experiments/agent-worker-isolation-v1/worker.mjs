import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { buildHarnessAttemptResult } from "./harness-result.mjs";
import { readFastCompactionStats } from "./fast-compaction-provider.mjs";
import { isBridgedHarnessEventCallback } from "./harness-event-contract.mjs";
import { getSessionHotsetStatus } from "./session-hotset.mjs";
import {
  normalizeWorkerGatewayEvent,
  WORKER_GATEWAY_EVENT_BRIDGE_SYMBOL,
} from "./worker-gateway-events.mjs";

let agentRuntimePromise;
let agentEventRuntimePromise;
const activeControllers = new Map();
const pendingStreamEventAcks = new Map();
const pendingWorkerGatewayEventAcks = new Map();
let nextStreamEventId = 1;
const configuredHeartbeatMs = Number(
  process.env.VLAB_WORKER_HEARTBEAT_MS ?? 15_000,
);
const heartbeatMs = Number.isFinite(configuredHeartbeatMs)
  ? Math.max(25, configuredHeartbeatMs)
  : 15_000;

function sendProgress(requestId, request, reason = "worker:active") {
  process.send?.({
    type: "progress",
    id: requestId,
    runId: request.runId,
    sessionId: request.sessionId,
    sessionKey: request.sessionKey,
    reason,
    sessionHotset: getSessionHotsetStatus(),
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
  const { agentCommandFromIngress } = await loadAgentRuntime();
  if (typeof agentCommandFromIngress !== "function") {
    throw new Error("OpenClaw ingress Agent runtime is unavailable");
  }
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
    result = await agentCommandFromIngress({
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
      ...buildStreamCallbacks(
        message.id,
        message,
        abortSignal,
        streamState,
        globallyBridgedNames,
      ),
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
    allowGatewaySubagentBinding: true,
      abortSignal,
    });
    await streamState.tail;
    if (streamState.failure) {
      throw streamState.failure;
    }
  } finally {
    unsubscribeAgentEvents();
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
    response.attempt = jsonSafe(await buildHarnessAttemptResult(result));
  }
  return response;
}

process.on("message", async (message) => {
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
  if (!message?.id) {
    return;
  }
  const controller = new AbortController();
  activeControllers.set(message.id, { controller, request: message });
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
    });
  } catch (error) {
    process.send?.({
      type: "response",
      id: message.id,
      ok: false,
      error: serializeError(error),
      sessionHotset: getSessionHotsetStatus(),
    });
  } finally {
    activeControllers.delete(message.id);
  }
});

if (process.env.VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME === "1") {
  await loadAgentRuntime();
}

process.send?.({
  type: "ready",
  pid: process.pid,
  sessionHotset: getSessionHotsetStatus(),
});
