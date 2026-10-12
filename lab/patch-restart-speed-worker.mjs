// Worker side of the restart-speed release, before the Worker's first dynamic import of the
// OpenClaw runtime: OpenClaw's dist ESM resolve fast path and Node's compile cache (both are
// what the Gateway/CLI entries already use). After readiness the compile cache is flushed, so
// a Worker that is later killed instead of exiting still leaves its entries for the next one.
const IMPORT_ANCHOR = "import {createVoiceProcessOwner} from './voice-process-owner.mjs';\n";
const BODY_ANCHOR = "let agentRuntimePromise;\n";
const REPORT_ANCHOR = "JSON.stringify({ pid: process.pid, ...runtimePrewarm })";
const READY_ANCHOR = "process.send?.({\n  type: \"ready\",\n";
const FIELDS_ANCHOR = "      ...(command?.firstTurnModules ? { firstTurnModules: command.firstTurnModules } : {}),\n";
export const MARKER = "/* OPENCLAW_WORKER_STARTUP_CACHES_V1 */";

export function patchWorker(source) {
  if (source.includes(MARKER)) throw new Error("worker.mjs already carries the startup caches");
  for (const anchor of [IMPORT_ANCHOR, BODY_ANCHOR, REPORT_ANCHOR, READY_ANCHOR, FIELDS_ANCHOR]) {
    if (source.split(anchor).length !== 2) throw new Error(`anchor not found exactly once: ${JSON.stringify(anchor)}`);
  }
  return source
    .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}import { installWorkerDistEsmResolveFastPath } from "./dist-esm-resolve-fast-path.mjs";\nimport { enableWorkerCompileCache, flushWorkerCompileCache } from "./compile-cache.mjs";\n`)
    .replace(BODY_ANCHOR, `${MARKER}\nconst workerDistResolveFastPath = installWorkerDistEsmResolveFastPath(configuredAgentRuntimePath());\nconst workerCompileCache = enableWorkerCompileCache(configuredAgentRuntimePath());\n${BODY_ANCHOR}`)
    .replace(REPORT_ANCHOR, "JSON.stringify({ pid: process.pid, ...runtimePrewarm, distResolveFastPath: workerDistResolveFastPath !== null, compileCache: workerCompileCache.status })")
    .replace(READY_ANCHOR, `setTimeout(() => flushWorkerCompileCache(), 1_000).unref?.();\n${READY_ANCHOR}`)
    .replace(FIELDS_ANCHOR, `${FIELDS_ANCHOR}      ...(command?.secretsPrepared !== undefined ? { secretsPrepared: command.secretsPrepared } : {}),\n`);
}
