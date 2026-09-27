#!/usr/bin/env node
// Convert a Gateway openclaw.json to OpenClaw 9.6 no-worker mode.
//
// On 9.6 agent turns run in the Gateway process on the native "openclaw"
// runtime; the vlab-agent-worker-isolation plugin (the Worker pool) is dropped.
// Two providers that plugin used to register move to versa-runtime-providers
// (release/components/versa-runtime-providers-0.1.0):
//   talk.realtime.provider              "volcengine-rtc-agent"
//   agents.defaults.compaction.provider "versa-fast-quality-v1"
//
// What changes:
//   - every agentRuntime.id "vlab-worker" becomes "openclaw" (codex and
//     claude-cli runtimes are kept);
//   - plugins.entries["vlab-agent-worker-isolation"] becomes {enabled:false}
//     (the exact shape 9.6 treats as an intentional disable marker, so the
//     missing plugin is not reported) and its path leaves plugins.load.paths;
//   - the new plugin's path is loaded, its entry enabled, and the Worker's
//     fastCompaction* settings move over unchanged. Its entry gets an llm
//     policy allowing the compaction model: on 9.6 api.runtime.llm.complete
//     refuses a model override without plugins.entries.<id>.llm, and the fast
//     compaction provider always names its model;
//   - plugins.allow gains the new plugin id when an allowlist is in use;
//   - mcp.sessionIdleTtlMs is set to 300000 only when absent;
//   - --disable-mcp <name> sets mcp.servers.<name>.enabled = false.
//
// Idempotent: a converted config converts to itself and nothing is written.
// Otherwise the original is kept as <config>.pre-noworker-<timestamp> first.
// Refuses (exit 2, nothing written) on any shape it was not built for.
// The summary names key paths only; values are printed only for a short list
// of non-secret fields (runtime ids, plugin ids, enabled flags, load paths).
//
// Usage:
//   node noworker96-config.mjs --config <openclaw.json> --plugin-path <dir>
//       [--worker-config <worker-openclaw.json>] [--worker-path <dir>]
//       [--disable-mcp <server>]... [--dry-run] [--json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKER_PLUGIN_ID = "vlab-agent-worker-isolation";
export const WORKER_RUNTIME_ID = "vlab-worker";
export const NATIVE_RUNTIME_ID = "openclaw";
export const PROVIDERS_PLUGIN_ID = "versa-runtime-providers";
export const REALTIME_PROVIDER_ID = "volcengine-rtc-agent";
export const COMPACTION_PROVIDER_ID = "versa-fast-quality-v1";
export const DEFAULT_FAST_COMPACTION_MODEL = "azure-openai/gpt-5.5";
export const MCP_SESSION_IDLE_TTL_MS = 300_000;
// Keys the new plugin's configSchema declares (additionalProperties:false).
// Anything else in the Worker's config block stays behind: an undeclared key
// makes the 9.6 Gateway refuse to start (exit 78/CONFIG).
export const MOVED_CONFIG_KEYS = [
  "fastCompactionModel",
  "fastCompactionMaxInputChars",
  "fastCompactionMaxOutputTokens",
  "fastCompactionMaxQualityRetries",
];

export class RefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = "RefusedError";
  }
}

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function refuse(message) {
  throw new RefusedError(message);
}

function requireRecordOrAbsent(value, where) {
  if (value !== undefined && !isRecord(value)) refuse(`${where} is not an object`);
}

function requireStringArrayOrAbsent(value, where) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    refuse(`${where} is not an array of strings`);
  }
}

function joinPath(parent, key) {
  if (typeof key === "number") return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$-]*$/u.test(key) ? (parent ? `${parent}.${key}` : key) : `${parent}[${JSON.stringify(key)}]`;
}

function* walk(value, at = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      yield* walk(value[index], joinPath(at, index));
    }
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = joinPath(at, key);
    yield { parent: value, key, value: child, path: childPath };
    yield* walk(child, childPath);
  }
}

function readManifestId(dir) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "openclaw.plugin.json"), "utf8"));
    return typeof manifest?.id === "string" ? manifest.id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which plugins.load.paths entry is the Worker plugin. An explicit
 * --worker-path wins; otherwise the manifest id on disk decides; a path whose
 * manifest cannot be read is matched by its directory name only when exactly
 * one path looks like a Worker build.
 */
export function findWorkerLoadPaths(paths, { workerPath, readId = readManifestId } = {}) {
  if (workerPath) {
    const matches = paths.filter((entry) => path.resolve(entry) === path.resolve(workerPath));
    return { matches, how: "explicit --worker-path" };
  }
  const byManifest = paths.filter((entry) => readId(entry) === WORKER_PLUGIN_ID);
  if (byManifest.length) return { matches: byManifest, how: "manifest id" };
  const byName = paths.filter((entry) =>
    /(^|[\\/])(worker([-_.][^\\/]*)?|vlab-agent-worker-isolation[^\\/]*)[\\/]?$/u.test(entry),
  );
  if (byName.length > 1) {
    refuse(`several plugins.load.paths look like the Worker plugin (${byName.length}); pass --worker-path`);
  }
  return { matches: byName, how: byName.length ? "directory name (manifest unreadable)" : "none" };
}

/**
 * Pure conversion. Returns the converted config (a copy), the change list and
 * notes. Throws RefusedError on any unexpected shape.
 */
export function convertConfig(input, options) {
  if (!isRecord(input)) refuse("config root is not an object");
  const pluginPath = options?.pluginPath;
  if (typeof pluginPath !== "string" || !pluginPath.trim()) refuse("--plugin-path is required");
  const disableMcp = [...new Set(options.disableMcp ?? [])];
  const config = structuredClone(input);
  const changes = [];
  const notes = [];
  const change = (at, action, shown) => changes.push(shown === undefined ? { path: at, action } : { path: at, action, value: shown });

  // ---- shape checks: everything is verified before anything is changed ----
  const plugins = config.plugins;
  if (!isRecord(plugins)) refuse("plugins is missing or not an object");
  if (!isRecord(plugins.entries)) refuse("plugins.entries is missing or not an object");
  requireRecordOrAbsent(plugins.load, "plugins.load");
  requireStringArrayOrAbsent(plugins.load?.paths, "plugins.load.paths");
  requireStringArrayOrAbsent(plugins.allow, "plugins.allow");
  requireStringArrayOrAbsent(plugins.deny, "plugins.deny");
  if (plugins.deny?.includes(PROVIDERS_PLUGIN_ID)) refuse(`plugins.deny lists ${PROVIDERS_PLUGIN_ID}`);
  const worker = plugins.entries[WORKER_PLUGIN_ID];
  const providers = plugins.entries[PROVIDERS_PLUGIN_ID];
  requireRecordOrAbsent(worker, `plugins.entries.${WORKER_PLUGIN_ID}`);
  requireRecordOrAbsent(providers, `plugins.entries.${PROVIDERS_PLUGIN_ID}`);
  requireRecordOrAbsent(worker?.config, `plugins.entries.${WORKER_PLUGIN_ID}.config`);
  requireRecordOrAbsent(providers?.config, `plugins.entries.${PROVIDERS_PLUGIN_ID}.config`);
  requireRecordOrAbsent(providers?.llm, `plugins.entries.${PROVIDERS_PLUGIN_ID}.llm`);
  if (!worker && !providers) {
    refuse(`neither ${WORKER_PLUGIN_ID} nor ${PROVIDERS_PLUGIN_ID} is configured; not a V Gateway config`);
  }
  for (const node of walk(config)) {
    if (node.key !== "agentRuntime") continue;
    if (!isRecord(node.value) || typeof node.value.id !== "string") {
      refuse(`${node.path} is not an object with a string id`);
    }
  }
  const realtime = config.talk?.realtime;
  requireRecordOrAbsent(config.talk, "talk");
  requireRecordOrAbsent(realtime, "talk.realtime");
  if (realtime?.provider !== undefined && typeof realtime.provider !== "string") {
    refuse("talk.realtime.provider is not a string");
  }
  requireRecordOrAbsent(config.agents, "agents");
  requireRecordOrAbsent(config.agents?.defaults, "agents.defaults");
  requireRecordOrAbsent(config.agents?.defaults?.compaction, "agents.defaults.compaction");
  const mcp = config.mcp;
  requireRecordOrAbsent(mcp, "mcp");
  requireRecordOrAbsent(mcp?.servers, "mcp.servers");
  if (mcp?.sessionIdleTtlMs !== undefined && typeof mcp.sessionIdleTtlMs !== "number") {
    refuse("mcp.sessionIdleTtlMs is not a number");
  }
  for (const name of disableMcp) {
    if (!isRecord(mcp?.servers?.[name])) refuse(`--disable-mcp ${name}: mcp.servers.${name} does not exist`);
  }
  const loadPaths = plugins.load?.paths ?? [];
  const workerPaths = findWorkerLoadPaths(loadPaths, options);
  if (worker && worker.enabled !== false && !workerPaths.matches.length) {
    refuse(`${WORKER_PLUGIN_ID} is enabled but none of plugins.load.paths is its directory; pass --worker-path`);
  }

  // ---- 1. agent runtimes ----
  for (const node of walk(config)) {
    if (node.key === "agentRuntime" && node.value.id === WORKER_RUNTIME_ID) {
      node.value.id = NATIVE_RUNTIME_ID;
      change(`${node.path}.id`, "set", NATIVE_RUNTIME_ID);
    }
  }
  const leftovers = [...walk(config)].filter(
    (node) => node.value === WORKER_RUNTIME_ID || node.key === WORKER_RUNTIME_ID,
  );
  if (leftovers.length) {
    refuse(`"${WORKER_RUNTIME_ID}" is still referenced outside agentRuntime.id at ${leftovers.map((node) => node.path).join(", ")}`);
  }

  // ---- 2. fast-compaction settings the new plugin will read ----
  const movedConfig = {};
  for (const key of MOVED_CONFIG_KEYS) {
    if (worker?.config?.[key] !== undefined) movedConfig[key] = worker.config[key];
  }
  const compactionModel =
    (typeof providers?.config?.fastCompactionModel === "string" && providers.config.fastCompactionModel.trim()) ||
    (typeof movedConfig.fastCompactionModel === "string" && movedConfig.fastCompactionModel.trim()) ||
    (typeof config.agents?.defaults?.compaction?.model === "string" && config.agents.defaults.compaction.model.trim()) ||
    DEFAULT_FAST_COMPACTION_MODEL;

  // ---- 3. Worker plugin off ----
  if (worker && !(worker.enabled === false && Object.keys(worker).length === 1)) {
    const dropped = Object.keys(worker).filter((key) => key !== "enabled");
    plugins.entries[WORKER_PLUGIN_ID] = { enabled: false };
    change(`plugins.entries.${WORKER_PLUGIN_ID}`, "replace with {enabled:false}", undefined);
    if (dropped.length) {
      notes.push(`plugins.entries.${WORKER_PLUGIN_ID} keys ${dropped.join(", ")} are kept only in the backup (rollback = restore the backup)`);
    }
  }
  if (workerPaths.matches.length) {
    plugins.load.paths = loadPaths.filter((entry) => !workerPaths.matches.includes(entry));
    for (const entry of workerPaths.matches) {
      change("plugins.load.paths", `remove (${workerPaths.how})`, entry);
    }
  }

  // ---- 4. versa-runtime-providers on ----
  plugins.load ??= {};
  plugins.load.paths ??= [];
  if (!plugins.load.paths.some((entry) => path.resolve(entry) === path.resolve(pluginPath))) {
    plugins.load.paths.push(pluginPath);
    change("plugins.load.paths", "append", pluginPath);
  }
  if (!plugins.entries[PROVIDERS_PLUGIN_ID]) {
    plugins.entries[PROVIDERS_PLUGIN_ID] = { enabled: true };
    change(`plugins.entries.${PROVIDERS_PLUGIN_ID}`, "create");
  }
  const entry = plugins.entries[PROVIDERS_PLUGIN_ID];
  if (entry.enabled !== true) {
    entry.enabled = true;
    change(`plugins.entries.${PROVIDERS_PLUGIN_ID}.enabled`, "set", true);
  }
  if (Object.keys(movedConfig).length) {
    entry.config ??= {};
    for (const [key, value] of Object.entries(movedConfig)) {
      if (entry.config[key] === undefined) {
        entry.config[key] = value;
        change(`plugins.entries.${PROVIDERS_PLUGIN_ID}.config.${key}`, `move from ${WORKER_PLUGIN_ID}`);
      }
    }
  }
  const undeclared = Object.keys(entry.config ?? {}).filter((key) => !MOVED_CONFIG_KEYS.includes(key));
  if (undeclared.length) {
    refuse(`plugins.entries.${PROVIDERS_PLUGIN_ID}.config has keys its schema rejects: ${undeclared.join(", ")}`);
  }
  entry.llm ??= {};
  if (entry.llm.allowModelOverride !== true) {
    entry.llm.allowModelOverride = true;
    change(`plugins.entries.${PROVIDERS_PLUGIN_ID}.llm.allowModelOverride`, "set", true);
  }
  requireStringArrayOrAbsent(entry.llm.allowedModels, `plugins.entries.${PROVIDERS_PLUGIN_ID}.llm.allowedModels`);
  const allowedModels = entry.llm.allowedModels ?? [];
  if (!allowedModels.includes("*") && !allowedModels.includes(compactionModel)) {
    entry.llm.allowedModels = [...allowedModels, compactionModel];
    change(`plugins.entries.${PROVIDERS_PLUGIN_ID}.llm.allowedModels`, "add", compactionModel);
  }
  if (Array.isArray(plugins.allow) && !plugins.allow.includes(PROVIDERS_PLUGIN_ID)) {
    plugins.allow.push(PROVIDERS_PLUGIN_ID);
    change("plugins.allow", "append", PROVIDERS_PLUGIN_ID);
  }

  // ---- 5. provider references resolve to the new plugin ----
  if (realtime?.provider === REALTIME_PROVIDER_ID) {
    notes.push(`talk.realtime.provider ${REALTIME_PROVIDER_ID} -> registered by ${PROVIDERS_PLUGIN_ID}`);
  } else if (realtime?.provider !== undefined) {
    notes.push(`talk.realtime.provider is not ${REALTIME_PROVIDER_ID}; left to its own plugin`);
  }
  for (const node of walk(config)) {
    if (node.key === "compaction" && isRecord(node.value) && node.value.provider === COMPACTION_PROVIDER_ID) {
      notes.push(`${node.path}.provider ${COMPACTION_PROVIDER_ID} -> registered by ${PROVIDERS_PLUGIN_ID} (model ${compactionModel})`);
    }
  }

  // ---- 6. MCP ----
  if (!config.mcp) {
    config.mcp = {};
  }
  if (config.mcp.sessionIdleTtlMs === undefined) {
    config.mcp.sessionIdleTtlMs = MCP_SESSION_IDLE_TTL_MS;
    change("mcp.sessionIdleTtlMs", "set (was absent)", MCP_SESSION_IDLE_TTL_MS);
  }
  for (const name of disableMcp) {
    if (config.mcp.servers[name].enabled !== false) {
      config.mcp.servers[name].enabled = false;
      change(`mcp.servers.${name}.enabled`, "set", false);
    }
  }

  return { config, changes, notes };
}

function flatten(value, at = "", out = new Map()) {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, joinPath(at, key), out);
  } else {
    out.set(at, JSON.stringify(value));
  }
  return out;
}

/**
 * Settings the Worker's own config applied to agent turns that the Gateway
 * config does not. In no-worker mode turns run on the Gateway config, so these
 * silently stop applying. Paths only, grouped to three levels; runtime ids and
 * plugin wiring are expected to differ and are left out.
 */
export function diffWorkerConfig(gatewayConfig, workerConfig) {
  const ignore = (key) =>
    /(^|\.)agentRuntime\.id$/u.test(key) || key.startsWith("plugins.") || key.startsWith("meta.");
  const group = (key) => key.split(/\.(?![^[]*\])/u).slice(0, 3).join(".");
  const gateway = flatten(gatewayConfig);
  const worker = flatten(workerConfig);
  const onlyWorker = new Set();
  const differs = new Set();
  for (const [key, value] of worker) {
    if (ignore(key)) continue;
    if (!gateway.has(key)) onlyWorker.add(group(key));
    else if (gateway.get(key) !== value) differs.add(group(key));
  }
  return { onlyInWorker: [...onlyWorker].sort(), differ: [...differs].sort() };
}

function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function writeLike(target, contents, reference) {
  const stat = fs.statSync(reference);
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, contents, { mode: stat.mode & 0o7777 });
  try {
    fs.chownSync(tmp, stat.uid, stat.gid);
  } catch {
    // Not root: the file is already ours.
  }
  fs.renameSync(tmp, target);
}

function parseArgs(argv) {
  const options = { disableMcp: [], dryRun: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`${arg} needs a value`);
      index += 1;
      return next;
    };
    if (arg === "--config") options.configPath = value();
    else if (arg === "--plugin-path") options.pluginPath = value();
    else if (arg === "--worker-config") options.workerConfigPath = value();
    else if (arg === "--worker-path") options.workerPath = value();
    else if (arg === "--disable-mcp") options.disableMcp.push(value());
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.configPath) throw new Error("--config is required");
  if (!options.pluginPath) throw new Error("--plugin-path is required");
  return options;
}

function readJson(file, what) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    refuse(`cannot read ${what}: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    refuse(`${what} is not strict JSON (JSON5/comments are not rewritten by this tool)`);
  }
}

export function main(argv = process.argv.slice(2), io = { log: console.log, error: console.error }) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.error(`usage error: ${error.message}`);
    return 1;
  }
  try {
    const original = readJson(options.configPath, "config");
    const { config, changes, notes } = convertConfig(original, options);
    let drift;
    if (options.workerConfigPath) {
      // Compare what worker-mode turns saw with what the Gateway config said
      // before this conversion, so our own edits do not show up as drift.
      drift = diffWorkerConfig(original, readJson(options.workerConfigPath, "worker config"));
    }
    const pluginManifestId = readManifestId(options.pluginPath);
    if (pluginManifestId !== PROVIDERS_PLUGIN_ID) {
      notes.push(`warning: ${options.pluginPath}/openclaw.plugin.json is ${pluginManifestId ? `id ${pluginManifestId}` : "missing"} here; install ${PROVIDERS_PLUGIN_ID} there before starting the Gateway`);
    }
    let backup;
    if (changes.length && !options.dryRun) {
      backup = `${options.configPath}.pre-noworker-${timestamp()}`;
      fs.copyFileSync(options.configPath, backup, fs.constants.COPYFILE_EXCL);
      const stat = fs.statSync(options.configPath);
      try {
        fs.chownSync(backup, stat.uid, stat.gid);
      } catch {}
      fs.chmodSync(backup, stat.mode & 0o7777);
      writeLike(options.configPath, `${JSON.stringify(config, null, 2)}\n`, options.configPath);
    }
    const report = {
      config: options.configPath,
      mode: options.dryRun ? "dry-run" : changes.length ? "written" : "unchanged",
      backup,
      changes,
      notes,
      ...(drift ? { workerConfigDrift: drift } : {}),
    };
    if (options.json) {
      io.log(JSON.stringify(report, null, 2));
    } else {
      io.log(`${report.mode}: ${options.configPath}${backup ? ` (backup ${backup})` : ""}`);
      io.log(`${changes.length} change(s)`);
      for (const item of changes) {
        io.log(`  ${item.path}: ${item.action}${item.value === undefined ? "" : ` ${JSON.stringify(item.value)}`}`);
      }
      for (const note of notes) io.log(`  note: ${note}`);
      if (drift) {
        io.log(`worker config settings that stop applying to agent turns (${drift.onlyInWorker.length} only in worker, ${drift.differ.length} differ):`);
        for (const key of drift.onlyInWorker) io.log(`  only in worker: ${key}`);
        for (const key of drift.differ) io.log(`  differs: ${key}`);
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof RefusedError) {
      io.error(`refused: ${error.message}`);
      return 2;
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
