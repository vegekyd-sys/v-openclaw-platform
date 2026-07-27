import { WorkerPool } from "./worker-pool.mjs";
import { performance } from "node:perf_hooks";

const SESSION_PREFIX = "agent:makaron:explicit:vlab-worker-";

function readString(params, key, options = {}) {
  const value = params?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    if (options.required) {
      throw new Error(`${key} is required`);
    }
    return undefined;
  }
  return value.trim();
}

function readNumber(params, key, fallback) {
  const value = params?.[key] ?? fallback;
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return Number(value);
}

function requireLabSessionKey(params) {
  const sessionKey = readString(params, "sessionKey", { required: true });
  if (!sessionKey.startsWith(SESSION_PREFIX)) {
    throw new Error(`sessionKey must start with ${SESSION_PREFIX}`);
  }
  return sessionKey;
}

function respondError(respond, error) {
  respond(false, undefined, {
    code: "vlab_worker_error",
    message: error instanceof Error ? error.message : String(error),
  });
}

const plugin = {
  id: "vlab-agent-worker-isolation",
  name: "vLab Agent Worker Isolation",
  description: "Runs vLab experiment workloads in sticky child-process workers.",
  register(api) {
    const maxWorkers = Number(api.pluginConfig?.maxWorkers ?? 2);
    const requestTimeoutMs = Number(api.pluginConfig?.requestTimeoutMs ?? 600_000);
    const pool = new WorkerPool({ maxWorkers, requestTimeoutMs });

    api.registerService({
      id: "vlab-agent-worker-isolation",
      async start() {
        await pool.start();
        api.logger.info(
          `vLab Agent Worker Isolation started with ${maxWorkers} workers`,
        );
      },
      async stop() {
        await pool.close();
      },
    });

    api.registerGatewayMethod(
      "vlab.workers.status",
      async ({ respond }) => {
        respond(true, pool.status());
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "vlab.workers.ping",
      async ({ params, respond }) => {
        try {
          const startedAt = performance.now();
          const sessionKey = requireLabSessionKey(params);
          const result = await pool.dispatch(sessionKey, { kind: "ping" });
          respond(true, {
            ...result,
            gatewayDispatchMs: performance.now() - startedAt,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "vlab.workers.cpu",
      async ({ params, respond }) => {
        try {
          const startedAt = performance.now();
          const sessionKey = requireLabSessionKey(params);
          const durationMs = readNumber(params, "durationMs", 5_000);
          const result = await pool.dispatch(sessionKey, {
            kind: "cpu",
            durationMs,
          });
          respond(true, {
            ...result,
            gatewayDispatchMs: performance.now() - startedAt,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.agent",
      async ({ params, respond }) => {
        try {
          const startedAt = performance.now();
          const sessionKey = requireLabSessionKey(params);
          const message = readString(params, "message", { required: true });
          const agentId = readString(params, "agentId") ?? "makaron";
          const timeoutSeconds = readNumber(params, "timeoutSeconds", 300);
          const result = await pool.dispatch(sessionKey, {
            kind: "agent",
            message,
            agentId,
            timeoutSeconds,
            modelRun: params?.modelRun === true,
            toolsAllow: Array.isArray(params?.toolsAllow)
              ? params.toolsAllow.filter((item) => typeof item === "string")
              : undefined,
          });
          respond(true, {
            ...result,
            gatewayDispatchMs: performance.now() - startedAt,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );
  },
};

export default plugin;
