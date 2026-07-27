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
    const minWorkers = Number(api.pluginConfig?.minWorkers ?? 1);
    const maxWorkers = Number(api.pluginConfig?.maxWorkers ?? 2);
    const idleTimeoutMs = Number(api.pluginConfig?.idleTimeoutMs ?? 180_000);
    const requestTimeoutMs = Number(api.pluginConfig?.requestTimeoutMs ?? 600_000);
    const pool = new WorkerPool({
      minWorkers,
      maxWorkers,
      idleTimeoutMs,
      requestTimeoutMs,
    });
    const nativeSessionSnapshots = new Map();
    let nativeSessionWriteTail = Promise.resolve();

    function readNativeSession(agentId, sessionKey) {
      const sessionRuntime = api.runtime.agent.session;
      const storePath = sessionRuntime.resolveStorePath(api.config.session?.store, {
        agentId,
      });
      const entry = sessionRuntime.getSessionEntry({
        agentId,
        storePath,
        sessionKey,
        readConsistency: "latest",
      });
      if (!entry) {
        return {
          exists: false,
        };
      }
      return {
        exists: true,
        sessionId: entry.sessionId,
        updatedAt: entry.updatedAt,
        status: entry.status,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        abortedLastRun: entry.abortedLastRun === true,
      };
    }

    async function reconcileNativeSessions(agentId, sessionKey, result) {
      const sessionId = result.meta?.sessionId;
      if (typeof sessionId !== "string" || sessionId.trim() === "") {
        throw new Error("worker Agent result did not include a native sessionId");
      }
      const now = Date.now();
      nativeSessionSnapshots.set(sessionKey, {
        agentId,
        sessionId,
        sessionFile: result.meta?.sessionFile,
        updatedAt: now,
      });
      while (nativeSessionSnapshots.size > 1024) {
        nativeSessionSnapshots.delete(nativeSessionSnapshots.keys().next().value);
      }

      const reconcile = async () => {
        for (const [knownSessionKey, snapshot] of nativeSessionSnapshots) {
          const sessionRuntime = api.runtime.agent.session;
          const storePath = sessionRuntime.resolveStorePath(api.config.session?.store, {
            agentId: snapshot.agentId,
          });
          const existing = sessionRuntime.getSessionEntry({
            agentId: snapshot.agentId,
            storePath,
            sessionKey: knownSessionKey,
            readConsistency: "latest",
          });
          if (existing && existing.sessionId !== snapshot.sessionId) {
            throw new Error(
              `native session ${knownSessionKey} changed from ${snapshot.sessionId} to ${existing.sessionId}`,
            );
          }
          if (existing) {
            continue;
          }
          await sessionRuntime.upsertSessionEntry({
            agentId: snapshot.agentId,
            storePath,
            sessionKey: knownSessionKey,
            readConsistency: "latest",
            entry: {
              sessionId: snapshot.sessionId,
              updatedAt: snapshot.updatedAt,
              lastActivityAt: snapshot.updatedAt,
              sessionStartedAt: snapshot.updatedAt,
              abortedLastRun: false,
              ...(typeof snapshot.sessionFile === "string"
                ? { sessionFile: snapshot.sessionFile }
                : {}),
            },
          });
        }
      };

      const pendingWrite = nativeSessionWriteTail.then(reconcile, reconcile);
      nativeSessionWriteTail = pendingWrite.catch(() => {});
      await pendingWrite;
    }

    api.registerService({
      id: "vlab-agent-worker-isolation",
      async start() {
        await pool.start();
        api.logger.info(
          `vLab Agent Worker Isolation started with ${minWorkers}-${maxWorkers} elastic workers`,
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
      "vlab.workers.hold",
      async ({ params, respond }) => {
        try {
          const startedAt = performance.now();
          const sessionKey = requireLabSessionKey(params);
          const durationMs = readNumber(params, "durationMs", 5_000);
          const result = await pool.dispatch(sessionKey, {
            kind: "hold",
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
          const nativeSessionBefore = readNativeSession(agentId, sessionKey);
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
          await reconcileNativeSessions(agentId, sessionKey, result);
          const nativeSessionAfter = readNativeSession(agentId, sessionKey);
          respond(true, {
            ...result,
            nativeSession: {
              before: nativeSessionBefore,
              after: nativeSessionAfter,
            },
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
