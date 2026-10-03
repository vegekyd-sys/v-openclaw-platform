import { statSync } from "node:fs";

// worker-generations.1: 9.1 applies most Gateway config changes (models,
// agents, tools, policy) without a plugin reload, so this plugin is never
// registered again and the Worker config is never re-derived. Poll the Gateway
// config, re-derive after one quiet interval, and report when what Workers
// read actually changed so the caller can roll the Worker generation.
export function createWorkerConfigWatch({
  gatewayConfigPath,
  derive,
  onWorkerConfigChanged,
  intervalMs = 5_000,
  logger,
}) {
  const fingerprint = () => {
    try {
      const stat = statSync(gatewayConfigPath);
      return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      return "missing";
    }
  };
  let timer = null;
  let last = fingerprint();
  let pending = null;
  let running = false;

  async function tick() {
    if (running) return;
    const now = fingerprint();
    if (now === last) {
      pending = null;
      return;
    }
    // A burst of writes (config patch, editor save) rolls once.
    if (pending !== now) {
      pending = now;
      return;
    }
    running = true;
    last = now;
    pending = null;
    try {
      const result = derive();
      if (result?.ok && result.changed) await onWorkerConfigChanged(result);
    } catch (error) {
      logger?.warn?.(
        `Worker config watch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      last = fingerprint();
      pending = null;
      timer = setInterval(() => void tick(), intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick,
  };
}
