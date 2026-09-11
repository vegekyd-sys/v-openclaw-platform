import assert from "node:assert/strict";

function once(source, before, after, label) {
  assert.equal(
    source.split(before).length,
    2,
    `expected one ${label ?? before}`,
  );
  return source.replace(before, after);
}

// Project the already-tested 0.2.12 generation lifecycle onto the current
// 0.2.11 release file.  The release file deliberately retains later stream,
// identity, persistence and timing fixes that are not all present in the
// experiment source tree.
export function promoteWorkerLifecycle(source) {
  source = once(
    source,
    'import { WorkerPool } from "./worker-pool.mjs";\n',
    'import { WorkerPool } from "./worker-pool.mjs";\n' +
      'import { acquireWorkerRuntime, createWorkerRuntimeLifecycle, resolveWorkerRuntime } from "./worker-runtime-lifecycle.mjs";\n',
    "WorkerPool import",
  );

  const acquireStart = source.indexOf("function acquireSharedPool(options) {");
  const acquireEnd = source.indexOf("\n\nconst plugin = {", acquireStart);
  assert(acquireStart >= 0 && acquireEnd > acquireStart, "shared pool function");
  let acquire = source.slice(acquireStart, acquireEnd);
  acquire = once(
    acquire,
    "function acquireSharedPool(options) {\n  if (!globalThis[SHARED_POOL_KEY]) {\n    globalThis[SHARED_POOL_KEY] = {\n      pool: new WorkerPool(options),",
    "function acquireSharedPool(options) {\n  const shared = acquireWorkerRuntime(SHARED_POOL_KEY, () => {\n    const runtime = {\n      pool: new WorkerPool({\n        ...options,\n        onProgress: progress => options.onProgress?.(progress, runtime.nativeLaneProgressBridge),\n      }),",
    "shared pool creation",
  );
  acquire = once(
    acquire,
    "    };\n  }\n  if (!globalThis[SHARED_POOL_KEY].harnessEventParity) {",
    "    };\n    return runtime;\n  });\n  if (!shared.harnessEventParity) {",
    "shared pool creation tail",
  );
  acquire = acquire.replaceAll("globalThis[SHARED_POOL_KEY]", "shared");
  acquire = once(
    acquire,
    "  return shared;\n}",
    "  return shared;\n}",
    "shared pool return",
  );
  source = source.slice(0, acquireStart) + acquire + source.slice(acquireEnd);

  source = once(
    source,
    "    const sharedPool = acquireSharedPool({",
    "    const poolOptions = {",
    "pool options start",
  );
  source = once(
    source,
    "      async onProgress(progress) {\n        const nativeLaneProgressBridge =\n          globalThis[SHARED_POOL_KEY]?.nativeLaneProgressBridge;",
    "      async onProgress(progress, nativeLaneProgressBridge) {",
    "progress bridge binding",
  );
  source = once(
    source,
    "      },\n    });\n    const pool = sharedPool.pool;\n    const nativeRequestsByRunId = sharedPool.nativeRequestsByRunId;\n    const nativeLaneProgressBridge = sharedPool.nativeLaneProgressBridge;\n    const nativeSubagentCompletionRelays =\n      sharedPool.nativeSubagentCompletionRelays;\n    const fastCompactionWorkerStats = sharedPool.fastCompactionWorkerStats;\n    const harnessEventParity = sharedPool.harnessEventParity;\n    const operationsById = new Map();\n    const operationsByIdempotencyKey = new Map();\n    let nextOperationId = 1;\n    let nativeSessionWriteTail = Promise.resolve();\n    const nativeHarnessStats = sharedPool.nativeHarnessStats;",
    "      },\n    };\n    let sharedPool = acquireSharedPool(poolOptions);\n    let pool = sharedPool.pool;\n    let nativeRequestsByRunId = sharedPool.nativeRequestsByRunId;\n    let nativeLaneProgressBridge = sharedPool.nativeLaneProgressBridge;\n    let nativeSubagentCompletionRelays =\n      sharedPool.nativeSubagentCompletionRelays;\n    let fastCompactionWorkerStats = sharedPool.fastCompactionWorkerStats;\n    let harnessEventParity = sharedPool.harnessEventParity;\n    const operationsById = new Map();\n    const operationsByIdempotencyKey = new Map();\n    let nextOperationId = 1;\n    let nativeSessionWriteTail = Promise.resolve();\n    let nativeHarnessStats = sharedPool.nativeHarnessStats;\n\n    const poolLifecycle = createWorkerRuntimeLifecycle({\n      acquire: () => acquireSharedPool(poolOptions),\n      bind(runtime) {\n        sharedPool = runtime;\n        ({ pool, nativeRequestsByRunId, nativeLaneProgressBridge,\n          nativeSubagentCompletionRelays, fastCompactionWorkerStats,\n          harnessEventParity, nativeHarnessStats } = runtime);\n      },\n    });",
    "pool lifecycle binding",
  );

  source = once(
    source,
    "      const nativeHarnessData = buildNativeHarnessData(params);\n      const harnessAttemptStartedAt = Date.now();",
    "      const nativeHarnessData = buildNativeHarnessData(params);\n      // Resolve a cached harness registration only at request admission, then\n      // keep this generation's pool and ownership maps for the whole attempt.\n      const { pool, nativeRequestsByRunId, nativeLaneProgressBridge,\n        nativeSubagentCompletionRelays, fastCompactionWorkerStats,\n        harnessEventParity, nativeHarnessStats } = resolveWorkerRuntime(SHARED_POOL_KEY, sharedPool);\n      const harnessAttemptStartedAt = Date.now();",
    "harness generation admission",
  );
  source = once(
    source,
    "    async function startOperation(params) {\n      const idempotencyKey = readString(params, \"idempotencyKey\", {",
    "    async function startOperation(params) {\n      const { pool } = resolveWorkerRuntime(SHARED_POOL_KEY, sharedPool);\n      const idempotencyKey = readString(params, \"idempotencyKey\", {",
    "operator generation admission",
  );
  source = once(
    source,
    "    api.registerService({\n      id: \"vlab-agent-worker-isolation\",\n      async start() {\n        await pool.start();\n        api.logger.info(\n          `vLab Agent Worker Isolation started with ${minWorkers}-${maxWorkers} elastic workers and ${sessionsPerWorker} sessions per worker`,\n        );\n      },\n      async stop() {\n        await pool.close();\n      },\n    });",
    "    api.registerService({\n      id: \"vlab-agent-worker-isolation\",\n      async start(context) {\n        await poolLifecycle.start(context);\n        api.logger.info(\n          `vLab Agent Worker Isolation started with ${minWorkers}-${maxWorkers} elastic workers and ${sessionsPerWorker} sessions per worker`,\n        );\n      },\n      async stop(context) {\n        await poolLifecycle.stop(context);\n      },\n    });",
    "service lifecycle",
  );
  source = once(
    source,
    "          ...pool.status(),\n          openClawConcurrency:",
    "          ...pool.status(),\n          generation: sharedPool.generation,\n          openClawConcurrency:",
    "generation status",
  );
  source = once(
    source,
    '            workerIsolationVersion: "0.2.11",',
    '            workerIsolationVersion: "0.2.12-rc.1",',
    "reported version",
  );
  return source;
}
