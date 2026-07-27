import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

let agentRuntimePromise;

function serializeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
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

async function runAgent(message) {
  const { agentCommand } = await loadAgentRuntime();
  const startedAt = performance.now();
  const result = await agentCommand({
    message: message.message,
    transcriptMessage: message.message,
    agentId: message.agentId ?? "makaron",
    sessionKey: message.sessionKey,
    runId: message.runId,
    deliver: false,
    json: true,
    timeout: String(message.timeoutSeconds ?? 300),
    messageChannel: "webchat",
    channel: "webchat",
    toolsAllow: message.toolsAllow,
    modelRun: message.modelRun ?? false,
    cleanupBundleMcpOnRunEnd: true,
    cleanupCliLiveSessionOnRunEnd: true,
    oneShotCliRun: true,
    allowGatewaySubagentBinding: false,
  });
  return {
    kind: "agent",
    elapsedMs: performance.now() - startedAt,
    payloads: jsonSafe(result.payloads),
    meta: jsonSafe({
      provider: result.meta?.provider,
      model: result.meta?.model,
      agentId: result.meta?.agentId,
      sessionId: result.meta?.sessionId,
      usage: result.meta?.usage,
    }),
  };
}

process.on("message", async (message) => {
  if (!message?.id) {
    return;
  }
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
    } else if (message.kind === "agent") {
      result = await runAgent(message);
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
  }
});

process.send?.({ type: "ready", pid: process.pid });
