import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function requireRunId(payload) {
  if (typeof payload?.runId !== "string" || payload.runId.trim() === "") {
    throw new Error("Gateway agent method returned an invalid runId");
  }
  return payload.runId;
}

function normalizeWaitStatus(payload) {
  let status = payload?.status;
  if (status === "completed" || status === "succeeded") {
    status = "ok";
  } else if (
    status === "error" &&
    payload?.error?.trim().toLowerCase() === "completed"
  ) {
    status = "ok";
  }
  if (status !== "ok" && status !== "error" && status !== "timeout") {
    throw new Error(
      `Gateway agent.wait returned unexpected status: ${String(
        payload?.status,
      )}`,
    );
  }
  return {
    status,
    ...(status !== "ok" &&
    typeof payload?.error === "string" &&
    payload.error
      ? { error: payload.error }
      : {}),
  };
}

export function createGatewaySubagentBridge(callGateway) {
  if (typeof callGateway !== "function") {
    throw new Error("callGateway is required");
  }
  const getSessionMessages = async (params) => {
    const limit =
      params.limit == null || !Number.isFinite(params.limit)
        ? undefined
        : Math.min(1_000, Math.max(1, Math.floor(params.limit)));
    const payload = await callGateway("sessions.get", {
      key: params.sessionKey,
      ...(limit == null ? {} : { limit }),
    });
    return {
      messages: Array.isArray(payload?.messages) ? payload.messages : [],
    };
  };
  return {
    async run(params) {
      const payload = await callGateway("agent", {
        sessionKey: params.sessionKey,
        message: params.message,
        deliver: params.deliver ?? false,
        ...(params.provider ? { provider: params.provider } : {}),
        ...(params.model ? { model: params.model } : {}),
        ...(params.extraSystemPrompt
          ? { extraSystemPrompt: params.extraSystemPrompt }
          : {}),
        ...(params.lane ? { lane: params.lane } : {}),
        ...(params.cwd ? { cwd: params.cwd } : {}),
        ...(params.lightContext === true
          ? { bootstrapContextMode: "lightweight" }
          : {}),
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
      });
      return { runId: requireRunId(payload) };
    },
    async waitForRun(params) {
      return normalizeWaitStatus(
        await callGateway("agent.wait", {
          runId: params.runId,
          ...(params.timeoutMs == null
            ? {}
            : { timeoutMs: params.timeoutMs }),
        }),
      );
    },
    getSessionMessages,
    getSession: getSessionMessages,
    async deleteSession(params) {
      await callGateway("sessions.delete", {
        key: params.sessionKey,
        deleteTranscript: params.deleteTranscript ?? true,
      });
    },
  };
}

export async function installGatewaySubagentBridge(options = {}) {
  const agentRuntimePath =
    options.agentRuntimePath ??
    process.env.VLAB_OPENCLAW_AGENT_RUNTIME;
  if (typeof agentRuntimePath !== "string" || agentRuntimePath.trim() === "") {
    throw new Error("VLAB_OPENCLAW_AGENT_RUNTIME is required");
  }
  const pluginSdkDir = dirname(agentRuntimePath);
  const gatewayRuntimePath =
    options.gatewayRuntimePath ??
    resolve(pluginSdkDir, "gateway-runtime.js");
  const pluginRuntimePath =
    options.pluginRuntimePath ??
    resolve(pluginSdkDir, "../plugins/runtime/index.js");
  const [{ callGatewayFromCli }, { setGatewaySubagentRuntime }] =
    await Promise.all([
      import(pathToFileURL(gatewayRuntimePath).href),
      import(pathToFileURL(pluginRuntimePath).href),
    ]);
  const timeoutMs = Number(options.timeoutMs ?? 600_000);
  const callGateway = async (method, params) =>
    await callGatewayFromCli(
      method,
      {
        timeout: String(timeoutMs),
        json: true,
      },
      params,
    );
  setGatewaySubagentRuntime(createGatewaySubagentBridge(callGateway));
}
