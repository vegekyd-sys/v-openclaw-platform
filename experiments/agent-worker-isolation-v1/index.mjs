import { WorkerPool } from "./worker-pool.mjs";
import { performance } from "node:perf_hooks";

const SESSION_PREFIX = "agent:makaron:explicit:vlab-worker-";
const NATIVE_HARNESS_ID = "vlab-worker";
const SHARED_POOL_KEY = Symbol.for(
  "versa.vlab-agent-worker-isolation.shared-pool-v1",
);

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
  const sessionKey = readString(params, "sessionKey", {
    required: true,
  }).toLowerCase();
  if (!sessionKey.startsWith(SESSION_PREFIX)) {
    throw new Error(`sessionKey must start with ${SESSION_PREFIX}`);
  }
  return sessionKey;
}

function respondError(respond, error) {
  respond(false, undefined, {
    code:
      error && typeof error === "object" && error.code
        ? String(error.code)
        : "vlab_worker_error",
    message: error instanceof Error ? error.message : String(error),
  });
}

function operationSnapshot(operation) {
  return {
    operationId: operation.operationId,
    idempotencyKey: operation.idempotencyKey,
    requestId: operation.requestId,
    sessionKey: operation.sessionKey,
    kind: operation.kind,
    state: operation.state,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    result: operation.result,
    error: operation.error,
  };
}

function acquireSharedPool(options) {
  if (!globalThis[SHARED_POOL_KEY]) {
    globalThis[SHARED_POOL_KEY] = {
      pool: new WorkerPool(options),
      nativeHarnessStats: {
        admitted: 0,
        completed: 0,
        cancelled: 0,
        failed: 0,
        lastSessionKey: undefined,
        lastWorkerSlot: undefined,
        lastWorkerPid: undefined,
      },
      nativeRequestsByRunId: new Map(),
    };
  }
  return globalThis[SHARED_POOL_KEY];
}

const plugin = {
  id: "vlab-agent-worker-isolation",
  name: "vLab Agent Worker Isolation",
  description:
    "Runs native OpenClaw Agent Harness dispatch in elastic child-process workers.",
  register(api) {
    const minWorkers = Number(api.pluginConfig?.minWorkers ?? 1);
    const maxWorkers = Number(api.pluginConfig?.maxWorkers ?? 3);
    const sessionsPerWorker = Number(
      api.pluginConfig?.sessionsPerWorker ?? 3,
    );
    const idleTimeoutMs = Number(api.pluginConfig?.idleTimeoutMs ?? 180_000);
    const requestTimeoutMs = Number(api.pluginConfig?.requestTimeoutMs ?? 600_000);
    const workerConfigPath =
      typeof api.pluginConfig?.workerConfigPath === "string"
        ? api.pluginConfig.workerConfigPath
        : undefined;
    const sharedPool = acquireSharedPool({
      minWorkers,
      maxWorkers,
      sessionsPerWorker,
      idleTimeoutMs,
      requestTimeoutMs,
      workerEnv: workerConfigPath
        ? {
            ...process.env,
            OPENCLAW_CONFIG_PATH: workerConfigPath,
          }
        : process.env,
    });
    const pool = sharedPool.pool;
    const nativeRequestsByRunId = sharedPool.nativeRequestsByRunId;
    const nativeSessionSnapshots = new Map();
    const operationsById = new Map();
    const operationsByIdempotencyKey = new Map();
    let nextOperationId = 1;
    let nativeSessionWriteTail = Promise.resolve();
    const nativeHarnessStats = sharedPool.nativeHarnessStats;

    function configuredAgentModelRuntimes() {
      return Object.values(api.config.agents?.defaults?.models ?? {})
        .map((entry) => entry?.agentRuntime?.id)
        .filter((value) => typeof value === "string");
    }

    async function dispatchNativeHarnessAttempt(params) {
      const sessionKey =
        typeof params.sessionKey === "string" && params.sessionKey.trim()
          ? params.sessionKey
          : `agent:${params.agentId ?? "makaron"}:${params.sessionId}`;
      const submitted = await pool.submit(sessionKey, {
        kind: "agent",
        harnessAttempt: true,
        message: params.prompt,
        transcriptMessage: params.transcriptPrompt ?? params.prompt,
        images: params.images,
        imageOrder: params.imageOrder,
        clientTools: params.clientTools,
        agentId: params.agentId ?? "makaron",
        sessionId: params.sessionId,
        runId: params.runId,
        timeoutSeconds: Math.max(
          1,
          Math.ceil(Number(params.timeoutMs ?? 300_000) / 1_000),
        ),
        messageChannel: params.messageChannel,
        messageProvider: params.messageProvider,
        channel: params.messageChannel,
        accountId: params.agentAccountId,
        to: params.messageTo,
        replyTo: params.messageTo,
        replyChannel: params.messageChannel,
        replyAccountId: params.agentAccountId,
        threadId: params.messageThreadId,
        runContext: {
          messageChannel: params.messageChannel,
          accountId: params.agentAccountId,
          groupId: params.groupId,
          groupChannel: params.groupChannel,
          groupSpace: params.groupSpace,
          currentChannelId: params.currentChannelId,
          senderId: params.senderId,
        },
        toolsAllow: params.toolsAllow,
        extraSystemPrompt: params.extraSystemPrompt,
        sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
        senderIsOwner: params.senderIsOwner,
      });
      nativeHarnessStats.admitted += 1;
      nativeHarnessStats.lastSessionKey = sessionKey;
      nativeRequestsByRunId.set(params.runId, {
        requestId: submitted.requestId,
        sessionKey,
      });
      const onAbort = () => {
        pool.cancel(submitted.requestId);
      };
      params.abortSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        const result = await submitted.promise;
        nativeHarnessStats.completed += 1;
        nativeHarnessStats.lastWorkerSlot = result.slot;
        nativeHarnessStats.lastWorkerPid = result.workerPid;
        if (!result.attempt || typeof result.attempt !== "object") {
          throw new Error("worker did not return an Agent Harness attempt result");
        }
        return result.attempt;
      } catch (error) {
        if (
          params.abortSignal?.aborted ||
          error?.name === "AbortError" ||
          error?.code === "VLAB_WORKER_CANCELLED"
        ) {
          nativeHarnessStats.cancelled += 1;
          return {
            aborted: true,
            assistantTranscriptOwned: true,
            externalAbort: true,
            timedOut: false,
            idleTimedOut: false,
            timedOutDuringCompaction: false,
            promptError: null,
            promptErrorSource: null,
            sessionIdUsed: params.sessionId,
            sessionFileUsed: params.sessionFile,
            messagesSnapshot: [],
            assistantTexts: [],
            toolMetas: [],
            acceptedSessionSpawns: [],
            didSendViaMessagingTool: false,
            messagingToolSentTexts: [],
            messagingToolSentMediaUrls: [],
            messagingToolSentTargets: [],
            replayMetadata: {
              hadPotentialSideEffects: false,
              replaySafe: true,
            },
            itemLifecycle: {
              startedCount: 0,
              completedCount: 0,
              activeCount: 0,
            },
          };
        }
        nativeHarnessStats.failed += 1;
        throw error;
      } finally {
        if (
          nativeRequestsByRunId.get(params.runId)?.requestId ===
          submitted.requestId
        ) {
          nativeRequestsByRunId.delete(params.runId);
        }
        params.abortSignal?.removeEventListener("abort", onAbort);
      }
    }

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

    function trimOperations() {
      if (operationsById.size <= 1024) {
        return;
      }
      for (const [operationId, operation] of operationsById) {
        if (
          operationsById.size <= 1024 ||
          operation.state === "pending" ||
          operation.state === "running" ||
          operation.state === "cancelling"
        ) {
          continue;
        }
        operationsById.delete(operationId);
        if (
          operationsByIdempotencyKey.get(operation.idempotencyKey) ===
          operation
        ) {
          operationsByIdempotencyKey.delete(operation.idempotencyKey);
        }
      }
    }

    function finishOperation(operation, state, fields = {}) {
      operation.state = state;
      operation.updatedAt = Date.now();
      Object.assign(operation, fields);
      trimOperations();
    }

    async function startOperation(params) {
      const idempotencyKey = readString(params, "idempotencyKey", {
        required: true,
      });
      const existing = operationsByIdempotencyKey.get(idempotencyKey);
      if (existing) {
        return {
          deduplicated: true,
          operation: operationSnapshot(existing),
        };
      }

      const sessionKey = requireLabSessionKey(params);
      const kind = readString(params, "kind", { required: true });
      if (kind !== "hold" && kind !== "agent") {
        throw new Error("kind must be hold or agent");
      }
      const createdAt = Date.now();
      const operation = {
        operationId: `operation-${nextOperationId}`,
        idempotencyKey,
        sessionKey,
        kind,
        state: "pending",
        createdAt,
        updatedAt: createdAt,
      };
      nextOperationId += 1;
      operationsById.set(operation.operationId, operation);
      operationsByIdempotencyKey.set(idempotencyKey, operation);

      let request;
      let afterSuccess = async () => {};
      if (kind === "hold") {
        request = {
          kind,
          durationMs: readNumber(params, "durationMs", 5_000),
        };
      } else {
        const agentId = readString(params, "agentId") ?? "makaron";
        request = {
          kind,
          message: readString(params, "message", { required: true }),
          agentId,
          timeoutSeconds: readNumber(params, "timeoutSeconds", 300),
          modelRun: params?.modelRun === true,
          toolsAllow: Array.isArray(params?.toolsAllow)
            ? params.toolsAllow.filter((item) => typeof item === "string")
            : undefined,
        };
        afterSuccess = async (result) => {
          await reconcileNativeSessions(agentId, sessionKey, result);
        };
      }

      try {
        const submitted = await pool.submit(sessionKey, request);
        operation.requestId = submitted.requestId;
        operation.state = "running";
        operation.updatedAt = Date.now();
        void submitted.promise.then(
          async (result) => {
            try {
              await afterSuccess(result);
              finishOperation(operation, "succeeded", { result });
            } catch (error) {
              finishOperation(operation, "failed", {
                error: {
                  code: "vlab_worker_reconcile_error",
                  message: error instanceof Error ? error.message : String(error),
                },
              });
            }
          },
          (error) => {
            const cancelled =
              error?.name === "AbortError" ||
              error?.code === "VLAB_WORKER_CANCELLED" ||
              operation.state === "cancelling";
            finishOperation(operation, cancelled ? "cancelled" : "failed", {
              error: {
                code: cancelled
                  ? "VLAB_WORKER_CANCELLED"
                  : "vlab_worker_operation_failed",
                message: error instanceof Error ? error.message : String(error),
              },
            });
          },
        );
      } catch (error) {
        finishOperation(operation, "failed", {
          error: {
            code: "vlab_worker_submit_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }

      return {
        deduplicated: false,
        operation: operationSnapshot(operation),
      };
    }

    api.registerService({
      id: "vlab-agent-worker-isolation",
      async start() {
        await pool.start();
        api.logger.info(
          `vLab Agent Worker Isolation started with ${minWorkers}-${maxWorkers} elastic workers and ${sessionsPerWorker} sessions per worker`,
        );
      },
      async stop() {
        await pool.close();
      },
    });

    api.registerAgentHarness({
      id: NATIVE_HARNESS_ID,
      label: "vLab elastic worker harness",
      supports() {
        return {
          supported: true,
          priority: 100,
          reason: "vLab worker isolation experiment is enabled",
        };
      },
      runAttempt: dispatchNativeHarnessAttempt,
    });

    api.registerGatewayMethod(
      "vlab.workers.status",
      async ({ respond }) => {
        respond(true, {
          ...pool.status(),
          openClawConcurrency: {
            maxConcurrent: api.config.agents?.defaults?.maxConcurrent,
            subagentsMaxConcurrent:
              api.config.agents?.defaults?.subagents?.maxConcurrent,
            configuredModelRuntimes: configuredAgentModelRuntimes(),
          },
          integration: {
            currentEntry: "native Channel/dispatch -> AgentHarness -> worker agentCommand",
            nativeAgentHarnessId: NATIVE_HARNESS_ID,
            nativeAgentHarnessDispatchAttached: true,
            productionPromotionBlocked: true,
            blocker:
              "native dispatch is attached; vLab native 3x3, crash, cancel, idempotency and rollback acceptance is still required",
            nativeHarnessStats: { ...nativeHarnessStats },
          },
        });
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "vlab.workers.start",
      async ({ params, respond }) => {
        try {
          respond(true, await startOperation(params));
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.operation",
      async ({ params, respond }) => {
        try {
          const operationId = readString(params, "operationId", {
            required: true,
          });
          const operation = operationsById.get(operationId);
          if (!operation) {
            throw new Error(`unknown operationId: ${operationId}`);
          }
          respond(true, operationSnapshot(operation));
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "vlab.workers.cancel",
      async ({ params, respond }) => {
        try {
          const operationId = readString(params, "operationId", {
            required: true,
          });
          const operation = operationsById.get(operationId);
          if (!operation) {
            throw new Error(`unknown operationId: ${operationId}`);
          }
          if (
            operation.state !== "pending" &&
            operation.state !== "running" &&
            operation.state !== "cancelling"
          ) {
            respond(true, {
              cancelled: false,
              reason: "already_terminal",
              operation: operationSnapshot(operation),
            });
            return;
          }
          const cancellation = pool.cancel(operation.requestId);
          if (cancellation.cancelled) {
            operation.state = "cancelling";
            operation.updatedAt = Date.now();
          }
          respond(true, {
            ...cancellation,
            operation: operationSnapshot(operation),
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.native.cancel",
      async ({ params, respond }) => {
        try {
          const runId = readString(params, "runId", { required: true });
          const nativeRequest = nativeRequestsByRunId.get(runId);
          if (!nativeRequest) {
            respond(true, {
              cancelled: false,
              state: "not_found",
              runId,
            });
            return;
          }
          respond(true, {
            ...pool.cancel(nativeRequest.requestId),
            runId,
            sessionKey: nativeRequest.sessionKey,
          });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "vlab.workers.kill",
      async ({ params, respond }) => {
        try {
          const slot = readNumber(params, "slot");
          if (!Number.isInteger(slot)) {
            throw new Error("slot must be an integer");
          }
          respond(true, pool.terminateWorker(slot));
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: "operator.write" },
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
