import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { buildHarnessAttemptResult } from "./harness-result.mjs";
import { readFastCompactionStats } from "./fast-compaction-provider.mjs";

let agentRuntimePromise;
const activeControllers = new Map();
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

async function loadAgentRuntime() {
  if (!agentRuntimePromise) {
    const runtimePath =
      process.env.VLAB_OPENCLAW_AGENT_RUNTIME ??
      "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/agent-runtime.js";
    agentRuntimePromise = import(pathToFileURL(runtimePath).href);
  }
  return await agentRuntimePromise;
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
  const result = await agentCommandFromIngress({
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
    allowModelOverride: true,
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
      if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > 60_000) {
        throw new Error("durationMs must be between 1 and 60000");
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
    });
  } catch (error) {
    process.send?.({
      type: "response",
      id: message.id,
      ok: false,
      error: serializeError(error),
    });
  } finally {
    activeControllers.delete(message.id);
  }
});

if (process.env.VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME === "1") {
  await loadAgentRuntime();
}

process.send?.({ type: "ready", pid: process.pid });
