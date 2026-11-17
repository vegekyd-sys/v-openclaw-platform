// Derives the Worker config from the Gateway config.
//
// Worker processes read their own OpenClaw config file (workerConfigPath).
// It used to be a hand-maintained copy of the Gateway config and drifted:
// models added to agents.defaults.modelPolicy.allow on the Gateway were still
// rejected inside Workers ("Model override ... is not allowed"), session
// maintenance thresholds differed, removed providers lingered, and so on.
//
// The Worker config is now a pure function of the Gateway config plus the
// small, versioned overlay below. Everything not named by the overlay is
// mirrored byte-for-byte from the Gateway config, including secret references
// (`${ENV}` strings and `{source, provider, id}` objects), which are never
// resolved here. The file is rewritten atomically and only when its parsed
// content differs. Failures keep the existing file and are reported, never
// thrown: a Gateway must not lose its Worker pool because the derivation
// failed.
import { createHash } from "node:crypto";
import {
  chmodSync,
  chownSync,
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const WORKER_ISOLATION_PLUGIN_ID = "vlab-agent-worker-isolation";
// Runtime ids that only make sense in the Gateway. A Worker that sees one
// would try to hand the turn to a Worker pool it does not have.
export const GATEWAY_ONLY_RUNTIME_IDS = Object.freeze(["vlab-worker"]);

// The only intentional differences between the Gateway and Worker configs.
// Bump `version` whenever a rule changes; it is part of every log line.
export const WORKER_CONFIG_OVERLAY = Object.freeze({
  version: 1,
  // The Gateway routes these models to the Worker pool ("vlab-worker"); inside
  // the Worker the same turn runs on the embedded runtime ("openclaw").
  // Other runtime ids (codex, claude-cli, ...) are kept as they are.
  runtimeIdMap: Object.freeze({ "vlab-worker": "openclaw" }),
  runtimeIdScopes: Object.freeze([
    Object.freeze(["agents"]),
    Object.freeze(["models", "providers"]),
  ]),
  set: Object.freeze([
    Object.freeze({
      path: Object.freeze(["session", "maintenance", "mode"]),
      value: "warn",
      // 2026-09-29: Workers enforcing maintenance pruned sessions, ran ANALYZE
      // and disk-budget sweeps inside the shared write lock (24.7 s holds).
      // Only the Gateway enforces session maintenance.
      reason: "session maintenance is enforced by the Gateway only",
    }),
  ]),
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPath(root, path) {
  let node = root;
  for (const key of path) {
    if (!isPlainObject(node) || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

function mapRuntimeIds(node, runtimeIdMap) {
  if (Array.isArray(node)) {
    for (const item of node) mapRuntimeIds(item, runtimeIdMap);
    return;
  }
  if (!isPlainObject(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "agentRuntime") {
      if (typeof value === "string" && Object.hasOwn(runtimeIdMap, value)) {
        node[key] = runtimeIdMap[value];
        continue;
      }
      if (
        isPlainObject(value) &&
        typeof value.id === "string" &&
        Object.hasOwn(runtimeIdMap, value.id)
      ) {
        value.id = runtimeIdMap[value.id];
      }
    }
    mapRuntimeIds(value, runtimeIdMap);
  }
}

function setPath(root, path, value) {
  let node = root;
  for (const key of path.slice(0, -1)) {
    if (!isPlainObject(node[key])) node[key] = {};
    node = node[key];
  }
  node[path.at(-1)] = structuredClone(value);
}

export function deriveWorkerConfig(
  gatewayConfig,
  overlay = WORKER_CONFIG_OVERLAY,
) {
  if (!isPlainObject(gatewayConfig)) {
    throw new Error("Gateway config must be a JSON object");
  }
  const derived = structuredClone(gatewayConfig);
  for (const scope of overlay.runtimeIdScopes ?? []) {
    mapRuntimeIds(getPath(derived, scope), overlay.runtimeIdMap ?? {});
  }
  for (const rule of overlay.set ?? []) {
    setPath(derived, rule.path, rule.value);
  }
  return derived;
}

function collectRuntimeIds(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectRuntimeIds(item, out);
  } else if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "agentRuntime") {
        out.push(isPlainObject(value) ? value.id : value);
      }
      collectRuntimeIds(value, out);
    }
  }
  return out;
}

function agentModelMaps(config) {
  const agents = config?.agents;
  const maps = [["defaults", agents?.defaults?.models]];
  for (const [name, entry] of Object.entries(agents?.entries ?? {})) {
    maps.push([name, entry?.models]);
  }
  return maps.filter(([, models]) => isPlainObject(models));
}

// Invariants the Worker relies on. Each problem names a path, never a value.
export function validateWorkerConfig(
  derived,
  gatewayConfig,
  overlay = WORKER_CONFIG_OVERLAY,
) {
  const problems = [];
  if (!isPlainObject(derived)) return ["worker config is not a JSON object"];
  const forbidden = new Set([
    ...GATEWAY_ONLY_RUNTIME_IDS,
    ...Object.keys(overlay.runtimeIdMap ?? {}),
  ]);
  for (const scope of WORKER_CONFIG_OVERLAY.runtimeIdScopes) {
    const leaked = collectRuntimeIds(getPath(derived, scope)).filter((id) =>
      forbidden.has(id),
    );
    if (leaked.length) {
      problems.push(
        `${scope.join(".")}: ${leaked.length} Gateway-only runtime id(s) left`,
      );
    }
  }
  const gatewayAllow = gatewayConfig?.agents?.defaults?.modelPolicy?.allow;
  if (Array.isArray(gatewayAllow)) {
    const workerAllow = new Set(
      derived?.agents?.defaults?.modelPolicy?.allow ?? [],
    );
    const missing = gatewayAllow.filter((model) => !workerAllow.has(model));
    if (missing.length) {
      problems.push(
        `agents.defaults.modelPolicy.allow: ${missing.length} Gateway entries missing`,
      );
    }
  }
  const workerMaps = new Map(agentModelMaps(derived));
  for (const [agent, models] of agentModelMaps(gatewayConfig)) {
    const workerModels = workerMaps.get(agent) ?? {};
    const missing = Object.keys(models).filter(
      (model) => !Object.hasOwn(workerModels, model),
    );
    if (missing.length) {
      problems.push(`agents.${agent}.models: ${missing.length} models missing`);
    }
  }
  const gatewayPlugin = gatewayConfig?.plugins?.entries?.[WORKER_ISOLATION_PLUGIN_ID];
  const workerPlugin = derived?.plugins?.entries?.[WORKER_ISOLATION_PLUGIN_ID];
  if (gatewayPlugin?.enabled === true && workerPlugin?.enabled !== true) {
    // The Worker child loads this plugin for its compaction provider and the
    // resolve_exec_env hook.
    problems.push(`plugins.entries.${WORKER_ISOLATION_PLUGIN_ID} is not enabled`);
  }
  return problems;
}

function formatKey(key) {
  return /^[A-Za-z_$][\w$-]*$/u.test(key) ? key : JSON.stringify(key);
}

function joinPath(parent, key) {
  const part = formatKey(key);
  if (!parent) return part;
  return part.startsWith('"') ? `${parent}[${part}]` : `${parent}.${part}`;
}

// Paths (not values) where two configs differ, down to `maxDepth` levels
// (deep enough for agents.<agent>.models["<model>"].<field>).
// Arrays are compared whole.
export function diffConfigPaths(before, after, { maxDepth = 5 } = {}) {
  const paths = [];
  const walk = (a, b, path, depth) => {
    if (isDeepStrictEqual(a, b)) return;
    if (isPlainObject(a) && isPlainObject(b) && depth < maxDepth) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      for (const key of keys) {
        walk(a[key], b[key], joinPath(path, key), depth + 1);
      }
      return;
    }
    paths.push(path || "(root)");
  };
  walk(before, after, "", 0);
  return paths;
}

function requireAbsolutePath(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  const path = value.trim();
  if (!isAbsolute(path)) throw new Error(`${name} must be an absolute path`);
  return path;
}

// JSON.parse error messages quote the offending text, which could be a
// secret. Report only the file role and the position.
function parseConfig(text, role) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const position = /position (\d+)/u.exec(String(error?.message))?.[1];
    throw new Error(
      `${role} config is not valid JSON${position ? ` (position ${position})` : ""}`,
    );
  }
}

function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function writeAtomically(path, text) {
  let mode = 0o600;
  let owner;
  try {
    const current = statSync(path);
    mode = current.mode & 0o777;
    owner = { uid: current.uid, gid: current.gid };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const tempPath = resolve(
    dirname(path),
    `.${basename(path)}.derive-${process.pid}-${Date.now()}`,
  );
  let fd;
  try {
    fd = openSync(tempPath, "wx", mode);
    writeSync(fd, text, null, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    chmodSync(tempPath, mode);
    if (
      owner &&
      typeof process.getuid === "function" &&
      process.getuid() === 0
    ) {
      chownSync(tempPath, owner.uid, owner.gid);
    }
    renameSync(tempPath, path);
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the original write failure.
      }
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup; preserve the original write failure.
    }
    throw error;
  }
}

const SUMMARY_PATH_LIMIT = 25;

export function summarizeDerivation(result) {
  const prefix = `Worker config derivation (overlay v${result.overlayVersion})`;
  if (!result.ok) {
    return `${prefix} FAILED, kept the existing Worker config: ${result.error}`;
  }
  if (!result.changed) return `${prefix}: Worker config already current`;
  const shown = result.changedPaths.slice(0, SUMMARY_PATH_LIMIT);
  const more = result.changedPaths.length - shown.length;
  return `${prefix}: rewrote Worker config, ${result.changedPaths.length} changed path(s): ${shown.join(", ")}${
    more > 0 ? ` (+${more} more)` : ""
  }`;
}

export function deriveWorkerConfigFile({
  gatewayConfigPath,
  workerConfigPath,
  overlay = WORKER_CONFIG_OVERLAY,
  logger,
} = {}) {
  const result = {
    ok: false,
    changed: false,
    overlayVersion: overlay.version,
    changedPaths: [],
    at: new Date().toISOString(),
  };
  try {
    const gatewayPath = requireAbsolutePath(gatewayConfigPath, "gatewayConfigPath");
    const workerPath = requireAbsolutePath(workerConfigPath, "workerConfigPath");
    if (resolve(gatewayPath) === resolve(workerPath)) {
      throw new Error("gatewayConfigPath and workerConfigPath must be different");
    }
    const gatewayConfig = parseConfig(readFileSync(gatewayPath, "utf8"), "Gateway");
    const derived = deriveWorkerConfig(gatewayConfig, overlay);
    const problems = validateWorkerConfig(derived, gatewayConfig, overlay);
    if (problems.length) {
      throw new Error(`derived Worker config is invalid: ${problems.join("; ")}`);
    }
    const nextText = `${JSON.stringify(derived, null, 2)}\n`;
    result.sha256 = createHash("sha256").update(nextText).digest("hex");
    const currentText = readOptional(workerPath);
    let current;
    if (currentText !== undefined) {
      try {
        current = parseConfig(currentText, "Worker");
      } catch {
        current = undefined; // An unreadable Worker config is replaced.
      }
    }
    result.ok = true;
    if (current !== undefined && isDeepStrictEqual(current, derived)) {
      logger?.info?.(summarizeDerivation(result));
      return result;
    }
    result.changedPaths =
      current === undefined ? ["(root)"] : diffConfigPaths(current, derived);
    writeAtomically(workerPath, nextText);
    result.changed = true;
    logger?.info?.(summarizeDerivation(result));
    return result;
  } catch (error) {
    result.ok = false;
    result.changed = false;
    result.error = error instanceof Error ? error.message : String(error);
    (logger?.error ?? logger?.warn)?.(summarizeDerivation(result));
    return result;
  }
}
