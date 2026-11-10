import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { diffConfigPaths } from "./worker-config-derive.mjs";

// Bookkeeping the Gateway writes into its own config (version stamps,
// migration markers) reaches the Worker config too, but is no reason to pay
// for a new Worker generation's cold first turns.
const ROLL_EXEMPT = /^meta(?:[.[]|$)/u;
export function workerConfigChangeNeedsRoll(changedPaths) {
  return changedPaths.some((path) => !ROLL_EXEMPT.test(path));
}

// worker-config-roll.1: the Worker config a generation was spawned with.
// Each generation keeps one, taken when it is created, so the roll decision
// compares what running Workers read against what is on disk now, whoever
// wrote the file.
export function readWorkerConfigSnapshot(workerConfigPath) {
  let text;
  try {
    text = readFileSync(workerConfigPath, "utf8");
  } catch {
    return { sha256: "missing", config: undefined };
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    config = undefined;
  }
  return { sha256: createHash("sha256").update(text).digest("hex"), config };
}

export function workerConfigRollDecision(spawnedWith, current) {
  if (spawnedWith.sha256 === current.sha256) return { roll: false, changedPaths: [] };
  const changedPaths =
    spawnedWith.config !== undefined && current.config !== undefined
      ? diffConfigPaths(spawnedWith.config, current.config)
      : ["(root)"];
  return { roll: workerConfigChangeNeedsRoll(changedPaths), changedPaths };
}

// worker-generations.1: 9.1 applies most Gateway config changes (models,
// agents, tools, policy) without a plugin reload, so this plugin is never
// registered again and the Worker config is never re-derived. Poll the Gateway
// config, re-derive after one quiet interval, and report when what Workers
// read actually changed so the caller can roll the Worker generation.
//
// worker-config-roll.1: on some of those reloads (models.*) 9.1 does register
// the plugin again, and the registration derives the Worker file itself
// without rolling. If that write lands first, this watch's own derivation
// finds the file current. So the watch also follows the Worker file, and with
// `runningWorkerConfig` it rolls whenever the file differs from what the live
// generation was spawned with, not only when its own derivation wrote it.
export function createWorkerConfigWatch({
  gatewayConfigPath,
  workerConfigPath,
  derive,
  runningWorkerConfig,
  onWorkerConfigChanged,
  intervalMs = 5_000,
  logger,
}) {
  const stamp = (path) => {
    try {
      const stat = statSync(path);
      return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      return "missing";
    }
  };
  const fingerprint = () =>
    workerConfigPath
      ? `${stamp(gatewayConfigPath)}|${stamp(workerConfigPath)}`
      : stamp(gatewayConfigPath);
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
      // Our own rewrite of the Worker file is not a new change.
      if (workerConfigPath && result?.changed) {
        last = `${now.split("|")[0]}|${stamp(workerConfigPath)}`;
      }
      // A failed derivation keeps the previous Worker file; it can still be
      // newer than the live generation.
      if (workerConfigPath && runningWorkerConfig) {
        const spawnedWith = runningWorkerConfig();
        if (!spawnedWith) return; // no live generation to roll
        const decision = workerConfigRollDecision(
          spawnedWith,
          readWorkerConfigSnapshot(workerConfigPath),
        );
        if (decision.roll) {
          await onWorkerConfigChanged({
            ...result,
            changedPaths: decision.changedPaths,
            spawnedWithSha256: spawnedWith.sha256,
          });
        }
      } else if (
        result?.ok &&
        result.changed &&
        workerConfigChangeNeedsRoll(result.changedPaths ?? ["(unknown)"])
      ) {
        await onWorkerConfigChanged(result);
      }
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
