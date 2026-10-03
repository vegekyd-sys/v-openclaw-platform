// Rewires the Worker plugin entry point from the compaction-only sync to the
// full Worker config derivation. Exact-text patch, shared by the experiment
// source and the production release build so both get identical call sites.
const OLD_IMPORT = 'import { syncWorkerRuntimeConfigFile } from "./worker-config-sync.mjs";';
const NEW_IMPORT = 'import { deriveWorkerConfigFile } from "./worker-config-derive.mjs";';

const OLD_CALL = `    const workerRuntimeConfigSync = syncWorkerRuntimeConfigFile({
      gatewayConfigPath,
      workerConfigPath,
    });
    if (workerRuntimeConfigSync.changed) {
      api.logger.info(
        \`Synchronized Worker runtime policy from Gateway config: \${workerRuntimeConfigSync.paths.join(
          ", ",
        )}\`,
      );
    }
`;
const NEW_CALL = `    // Workers read workerConfigPath, derived from the Gateway config plus a
    // small versioned overlay (worker-config-derive.mjs). Only the Gateway
    // writes it; a failure keeps the previous file and is logged, it never
    // fails plugin registration. New Worker spawns read the result.
    const workerRuntimeConfigSync =
      process.env.VLAB_WORKER_CHILD === "1"
        ? { ok: true, changed: false, skipped: "worker-child" }
        : deriveWorkerConfigFile({
            gatewayConfigPath,
            workerConfigPath,
            logger: api.logger,
          });
`;

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) {
    throw new Error(`worker index: expected exactly one ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchWorkerIndexForConfigDerivation(source) {
  if (source.includes(NEW_IMPORT)) {
    throw new Error("worker index already derives its config");
  }
  let next = replaceOnce(source, OLD_IMPORT, NEW_IMPORT, "sync import");
  next = replaceOnce(next, OLD_CALL, NEW_CALL, "sync call site");
  if (next.includes("syncWorkerRuntimeConfigFile")) {
    throw new Error("worker index still references syncWorkerRuntimeConfigFile");
  }
  return next;
}
