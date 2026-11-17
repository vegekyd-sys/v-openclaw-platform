import {
  chmodSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

export const WORKER_RUNTIME_POLICY_PATHS = ["agents.defaults.compaction"];

function requireAbsolutePath(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  const path = value.trim();
  if (!isAbsolute(path)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return path;
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== "object" || Array.isArray(parent[key])) {
    parent[key] = {};
  }
  return parent[key];
}

export function synchronizeWorkerRuntimePolicy(gatewayConfig, workerConfig) {
  const synchronized = structuredClone(workerConfig);
  const workerAgents = ensureObject(synchronized, "agents");
  const workerDefaults = ensureObject(workerAgents, "defaults");
  const gatewayCompaction = gatewayConfig?.agents?.defaults?.compaction;

  if (gatewayCompaction === undefined) {
    delete workerDefaults.compaction;
  } else {
    workerDefaults.compaction = clone(gatewayCompaction);
  }

  return synchronized;
}

export function syncWorkerRuntimeConfigFile(options) {
  const gatewayConfigPath = requireAbsolutePath(
    options.gatewayConfigPath,
    "gatewayConfigPath",
  );
  const workerConfigPath = requireAbsolutePath(
    options.workerConfigPath,
    "workerConfigPath",
  );
  if (gatewayConfigPath === workerConfigPath) {
    throw new Error("gatewayConfigPath and workerConfigPath must be different");
  }

  const gatewayConfig = JSON.parse(readFileSync(gatewayConfigPath, "utf8"));
  const workerConfig = JSON.parse(readFileSync(workerConfigPath, "utf8"));
  const synchronized = synchronizeWorkerRuntimePolicy(
    gatewayConfig,
    workerConfig,
  );
  const nextText = `${JSON.stringify(synchronized, null, 2)}\n`;
  const currentText = readFileSync(workerConfigPath, "utf8");
  if (currentText === nextText) {
    return {
      changed: false,
      paths: [...WORKER_RUNTIME_POLICY_PATHS],
    };
  }

  const currentStat = statSync(workerConfigPath);
  const currentMode = currentStat.mode & 0o777;
  const tempPath = resolve(
    dirname(workerConfigPath),
    `.${basename(workerConfigPath)}.sync-${process.pid}-${Date.now()}`,
  );
  try {
    writeFileSync(tempPath, nextText, {
      encoding: "utf8",
      mode: currentMode,
      flag: "wx",
    });
    chmodSync(tempPath, currentMode);
    renameSync(tempPath, workerConfigPath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup; preserve the original synchronization failure.
    }
    throw error;
  }

  return {
    changed: true,
    paths: [...WORKER_RUNTIME_POLICY_PATHS],
  };
}
