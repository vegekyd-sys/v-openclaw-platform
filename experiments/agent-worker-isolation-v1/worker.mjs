import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { buildHarnessAttemptResult } from "./harness-result.mjs";

let agentRuntimePromise;
const activeControllers = new Map();

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
  const { agentCommand } = await loadAgentRuntime();
  const startedAt = performance.now();
  const result = await agentCommand({
    message: message.message,
    transcriptMessage: message.transcriptMessage ?? message.message,
    images: message.images,
    imageOrder: message.imageOrder,
    clientTools: message.clientTools,
    agentId: message.agentId ?? "makaron",
    sessionId: message.sessionId,
    sessionKey: message.sessionKey,
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
    cleanupBundleMcpOnRunEnd: true,
    cleanupCliLiveSessionOnRunEnd: true,
    oneShotCliRun: true,
    allowGatewaySubagentBinding: false,
    abortSignal,
  });
  if (abortSignal.aborted) {
    throw abortSignal.reason ?? new Error("worker Agent request was cancelled");
  }
  const agentMeta = result.meta?.agentMeta ?? result.meta ?? {};
  const response = {
    kind: "agent",
    elapsedMs: performance.now() - startedAt,
    payloads: jsonSafe(result.payloads),
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
    }),
  };
  if (message.harnessAttempt === true) {
    response.attempt = jsonSafe(await buildHarnessAttemptResult(result));
  }
  return response;
}

process.on("message", async (message) => {
  if (message?.type === "cancel" && message.requestId) {
    const controller = activeControllers.get(message.requestId);
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
  activeControllers.set(message.id, controller);
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

process.send?.({ type: "ready", pid: process.pid });
