// Candidate load test: how many concurrent /vds (Codex harness + DeepSeek), /vcc (claude-cli) and
// mixed turns one Gateway carries before its main thread stalls, Worker stream acks time out or
// Codex process inspection misses its deadline, on small sessions and on ~80 MB ones.
//
// V 2026-10-16: the Gateway main thread froze 50-70 s several times in the afternoon; during the
// freezes Worker requests failed with "Worker stream acknowledgement timed out" and /vds turns with
// "Cannot inspect Codex processes. Process inspection exceeded its deadline" (the Codex plugin reads
// /proc/<pid>/stat one awaited readFile at a time under a 2 s deadline, transport-stdio). Codex
// turns (/vds, /vcodex) run in the Gateway process with a few shared app-servers; /vcc spawns one
// claude process per session; a Codex turn reads the whole session history when it starts.
// None of these runtimes had ever been load-tested.
//
// What it does, all in this run's private copies (nothing touches shared VLab state or V):
//   - a private Gateway on shared VLab's runtime (= V's code, ALIGNED) with V's Gateway flags and
//     env, V's Codex plugin config and Codex 0.159.2, V's Claude Code 2.1.280; channels and cron off
//   - cheap models only: /vds = deepseek/vds-deepseek-flash (V's alias as is), /vcc =
//     VCC_MODEL (claude-haiku-5-5 on the claude-cli runtime); the canary is deepseek-flash on the
//     Worker runtime (V's default model), one per level, so Worker stream acks are exercised
//   - small sessions start empty; big sessions are one shared-VLab Codex session with tool output
//     trimmed, repeated INFLATE times as one chain and padded with view_image-shaped base64 rows to
//     BIG_MB, then cloned once per concurrent slot and bound to its runtime
//   - waits for a steady Gateway (uptime >= STEADY_MIN, RSS drift < STEADY_DRIFT_MB, no liveness
//     warning in the window, three samples in a row), then for every ARMS entry fires LEVELS
//     concurrent turns at once ("run `printf %s <label> | sha256sum | cut -c1-12`, reply with it"; a
//     run only counts when the reply holds that hash, i.e. the tool really ran)
//   - per level: first text and completion p50/p95, failures with their errors, the longest
//     main-thread stall (preloaded lag probe) and the CPU spent in it, liveness warnings, Worker
//     stream-ack timeouts, Codex process-inspection failures, whole-session reads on the Gateway,
//     Gateway CPU/RSS/heap, app-server and claude process counts, host memory
//   - gate: a level with a stall > GATE_STALL_MS or failures > GATE_FAIL_RATE ends that arm
//
// Output: JSON lines on stdout and in $OUT_DIR/progress.jsonl as they happen, then a summary (also
// $OUT_DIR/summary.json with every run), the Gateway's lag/signal lines and the 1 s samples.

import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const here = path.dirname(new URL(import.meta.url).pathname);
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;

const num = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : Number(process.env[k]));
const ARMS = (process.env.ARMS ?? "vds:small,vcc:small,mix:small,vds:big,vcc:big,mix:big").split(",").map((s) => { const [arm, size] = s.split(":"); return { arm, size }; });
const LEVELS = (process.env.LEVELS ?? "1,3,5,10,15").split(",").map(Number);
const MAXC = Math.max(...LEVELS);
const STEADY_MIN = num("STEADY_MIN", 20);
const STEADY_DRIFT_MB = num("STEADY_DRIFT_MB", 200);
const STEADY_SAMPLE_MS = num("STEADY_SAMPLE_MS", 60_000);
const STEADY_STALL_MS = num("STEADY_STALL_MS", 2_000);
const GATE_STALL_MS = num("GATE_STALL_MS", 20_000);
const GATE_FAIL_RATE = num("GATE_FAIL_RATE", 0.2);
const COOLDOWN_MS = num("COOLDOWN_MS", 60_000);
const SETTLE_MS = num("SETTLE_MS", 15_000);
const TURN_TIMEOUT_MS = num("TURN_TIMEOUT_MS", 600_000);
const HOST_MIN_AVAILABLE_MB = num("HOST_MIN_AVAILABLE_MB", 1200);
const CANARY = num("CANARY", 1);
const WARM_BIG = process.env.WARM_BIG !== "0";
const SOURCE_SESSION = process.env.SOURCE_SESSION ?? "f185e1fe-5d6a-4b3c-8864-827373cf8afc";
const INFLATE = num("INFLATE", 4);
const TRIM_TOOL_CHARS = num("TRIM_TOOL_CHARS", 600);
const BIG_MB = num("BIG_MB", 80);
const BIG_COUNT = num("BIG_COUNT", ARMS.some((a) => a.size === "big") ? MAXC : 0);
const READ_PROBE_MS = num("READ_PROBE_MS", 200);
const HOLD_PROBE_MS = num("HOLD_PROBE_MS", 500);
const VDS_REF = "deepseek/vds-deepseek-flash";
const FLASH_REF = "deepseek/deepseek-flash";
const VCC_REF = process.env.VCC_MODEL ?? "anthropic/claude-haiku-5-5";
const CODEX_VERSION = process.env.CODEX_VERSION ?? "0.159.2"; // V: /opt/codex-0.159.2-v
const CLAUDE_VERSION = process.env.CLAUDE_VERSION ?? "2.1.280"; // V: /home/openclaw/.npm-global/bin/claude
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const secrets = Object.fromEntries(fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u).map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/gu, "")]));
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing");
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of Object.values(secrets)) if (v && v.length >= 12) out = out.replaceAll(v, "[redacted]");
  return out;
};
const dist = path.join(runtime, "openclaw", "dist");
// The candidate removes its work directory at the end; results go to OUT_DIR, which outlives it.
const OUT_DIR = process.env.OUT_DIR ?? `/tmp/runtime-concurrency-${new Date().toISOString().slice(0, 16).replace(/[-:T]/gu, "")}`;
fs.mkdirSync(OUT_DIR, { recursive: true });
const progressPath = path.join(OUT_DIR, "progress.jsonl");
const emit = (o) => {
  const line = JSON.stringify({ at: new Date().toISOString(), ...o });
  console.log(line);
  fs.appendFileSync(progressPath, `${line}\n`);
};
// What else this 4-core host is running: other experiments skew every number below.
function hostContext() {
  const procs = [];
  for (const p of fs.readdirSync("/proc").filter((d) => /^\d+$/u.test(d))) {
    try {
      const cmd = fs.readFileSync(`/proc/${p}/cmdline`, "utf8").split("\0").join(" ").trim();
      const s = fs.readFileSync(`/proc/${p}/stat`, "utf8");
      const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
      procs.push({ pid: Number(p), cpuS: Math.round((Number(f[11]) + Number(f[12])) / 100), rssMB: Math.round(Number(f[21]) * 4096 / 1048576), cmd });
    } catch {}
  }
  const mem = fs.readFileSync("/proc/meminfo", "utf8");
  const kb = (k) => Number(mem.match(new RegExp(`^${k}:\\s+(\\d+)`, "mu"))?.[1] ?? 0);
  return {
    load: fs.readFileSync("/proc/loadavg", "utf8").trim(), availMB: Math.round(kb("MemAvailable") / 1024), swapUsedMB: Math.round((kb("SwapTotal") - kb("SwapFree")) / 1024),
    gcSwapExperiment: procs.filter((p) => /cc-gcswap/u.test(p.cmd)).map((p) => p.cmd.slice(0, 160)),
    sharedGatewayInspect: procs.filter((p) => /db91-parity\/runtime\/openclaw\/dist\/index\.js gateway/u.test(p.cmd)).map((p) => ({ pid: p.pid, inspect: /--inspect/u.test(p.cmd), rssMB: p.rssMB })),
    otherCandidates: [...new Set(procs.map((p) => p.cmd.match(/candidate-tests\/runs\/([^/ ]+)/u)?.[1]).filter((id) => id && !scratch.includes(id)))],
    topRss: procs.sort((a, b) => b.rssMB - a.rssMB).slice(0, 8).map((p) => `${p.rssMB}MB ${p.cmd.slice(0, 90)}`),
  };
}
emit({ phase: "host-context", ...hostContext() });
for (const d of ["tmp", "cache", "npm-cache"]) fs.mkdirSync(path.join(scratch, d), { recursive: true, mode: 0o700 });
const npm = path.join(path.dirname(process.execPath), "npm");
const npmEnv = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, npm_config_cache: path.join(scratch, "npm-cache") };

// ---- V's Codex and Claude Code binaries, private to this run ----
const codexPrefix = path.join(scratch, `codex-${CODEX_VERSION}`);
{
  const r = spawnSync(npm, ["install", "--prefix", codexPrefix, "--no-audit", "--no-fund", `@openai/codex@${CODEX_VERSION}`], { env: npmEnv, encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
  assert.equal(r.status, 0, `codex install: ${redact(r.stderr).slice(-1500)}`);
}
const codexBin = path.join(codexPrefix, "node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex");
assert(fs.existsSync(codexBin), "Codex binary missing");
// Claude Code only when an arm drives /vcc. Its login lives in $HOME (the shared instance's); a
// candidate whose first claude-cli turn finds an expired token refreshes it there and rewrites the
// shared credentials (2026-10-17 03:11 that refresh failed and logged shared VLab out).
const NEEDS_CLAUDE = ARMS.some((a) => a.arm === "vcc" || a.arm === "mix");
const claudePrefix = path.join(scratch, `claude-${CLAUDE_VERSION}`);
const claudeBinDir = path.join(claudePrefix, "node_modules", ".bin");
let claudeVersion = null;
let claudeAuth = null;
if (NEEDS_CLAUDE) {
  const r = spawnSync(npm, ["install", "--prefix", claudePrefix, "--no-audit", "--no-fund", `@anthropic-ai/claude-code@${CLAUDE_VERSION}`], { env: npmEnv, encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
  assert.equal(r.status, 0, `claude-code install: ${redact(r.stderr).slice(-1500)}`);
  claudeVersion = execFileSync(path.join(claudeBinDir, "claude"), ["--version"], { encoding: "utf8", env: { ...process.env, DISABLE_AUTOUPDATER: "1" } }).trim();
  assert(claudeVersion.startsWith(CLAUDE_VERSION), `Claude Code ${claudeVersion}`);
  claudeAuth = JSON.parse(spawnSync(path.join(claudeBinDir, "claude"), ["auth", "status", "--json"], { encoding: "utf8", env: { ...process.env, DISABLE_AUTOUPDATER: "1" } }).stdout || "{}");
  assert.equal(claudeAuth.loggedIn, true, "claude is not logged in for this user");
}
emit({ phase: "binaries", codex: CODEX_VERSION, claude: claudeVersion, claudeAuth: claudeAuth?.authMethod ?? null });

// ---- managed npm plugins (Codex) in this run's state ----
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}

// ---- Codex plugin = V's bytes. Shared VLab can be V plus one release on its way (2026-10-17 03:58
// #409 changed transport-stdio); every copy the Gateway can load (state/npm and the runtime's npm,
// those with a package.json) is brought to V's whole-dist bytes, and the result recorded.
// V's whole Codex dist, as `find dist -type f | sort | xargs sha256sum | sha256sum` on V (2026-10-17)
const V_CODEX_DIST_SHA = process.env.V_CODEX_DIST_SHA ?? "7fade013e1e061e57f73d4cbcd31975a6bf58f1199846acc43c6009b891c36d1";
{
  const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  const distSha = (dir) => {
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.isFile()) files.push(f); } };
    walk(dir);
    const lines = files.map((f) => `dist/${path.relative(dir, f)}`).sort().map((rel) => `${sha(path.join(dir, rel.slice(5)))}  ${rel}\n`);
    return createHash("sha256").update(lines.join("")).digest("hex");
  };
  const codexDists = (base) => (fs.existsSync(path.join(base, "npm", "projects")) ? fs.readdirSync(path.join(base, "npm", "projects")).filter((d) => d.startsWith("openclaw-codex-")).map((d) => path.join(base, "npm", "projects", d, "node_modules", "@openclaw", "codex", "dist")).filter((d) => fs.existsSync(path.join(d, "..", "package.json"))) : []);
  // a source with V's bytes: this run's state/npm copy, else a cached runtime baseline
  const baselines = "/srv/vlab-production-mirror/labs/candidate-tests/baselines";
  const sources = [...codexDists(stateDir), ...(fs.existsSync(baselines) ? fs.readdirSync(baselines).flatMap((b) => codexDists(path.join(baselines, b, "runtime"))) : [])];
  const vDist = sources.find((d) => distSha(d) === V_CODEX_DIST_SHA);
  assert(vDist, "no copy of V's Codex plugin bytes found");
  const replaced = [];
  for (const dir of [...codexDists(stateDir), ...codexDists(runtime)]) {
    if (dir === vDist) continue;
    for (const f of fs.readdirSync(vDist)) {
      const from = path.join(vDist, f);
      const to = path.join(dir, f);
      if (!fs.statSync(from).isFile()) continue;
      if (!fs.existsSync(to) || sha(to) !== sha(from)) { fs.copyFileSync(from, to); replaced.push(path.relative(path.dirname(path.dirname(path.dirname(path.dirname(dir)))), to)); }
    }
  }
  const after = [...codexDists(stateDir), ...codexDists(runtime)].map((d) => distSha(d) === V_CODEX_DIST_SHA);
  emit({ phase: "codex-plugin", source: vDist.startsWith(stateDir) ? "state/npm" : vDist.replace(baselines, "baselines").slice(0, 60), allV: after.every(Boolean), copies: after.length, replacedWithV: replaced });
  assert(after.every(Boolean), "a Codex plugin copy still differs from V's bytes");
}

// ---- probes in the private runtime copy (optional: absent markers are reported, not fatal) ----
const probes = {};
const distFile = (re, marker) => fs.readdirSync(dist).filter((f) => re.test(f)).map((f) => path.join(dist, f)).find((f) => fs.readFileSync(f, "utf8").includes(marker));
{
  const marker = "function logSlowTransactionHold(params) {";
  const file = distFile(/^node-sqlite-.*\.js$/u, marker);
  if (file) {
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(marker, `${marker}
	if (params.elapsedMs >= ${HOLD_PROBE_MS}) console.error("[hold-probe] " + JSON.stringify({ ms: params.elapsedMs, op: params.options?.operationLabel ?? null, pid: process.pid }));`));
    probes.hold = true;
  }
}
const readProbe = (kind) => `function __readProbe_${kind}(scope, startedAt, rows) {
	const ms = Date.now() - startedAt;
	if (ms >= ${READ_PROBE_MS}) console.error("[read-probe] " + JSON.stringify({ kind: "${kind}", ms, rows, sessionId: scope?.sessionId ?? null, pid: process.pid }));
}
`;
{
  const marker = "function loadTranscriptEventsSync(scope) {";
  const file = distFile(/^session-accessor\.sqlite-transcript-store-.*\.js$/u, marker);
  if (file && fs.readFileSync(file, "utf8").split(marker).length === 2) {
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(marker, `${readProbe("fenced")}function loadTranscriptEventsSync(scope) {
	const startedAt = Date.now();
	const events = __loadTranscriptEventsSyncProbed(scope);
	__readProbe_fenced(scope, startedAt, events.length);
	return events;
}
function __loadTranscriptEventsSyncProbed(scope) {`));
    probes.fencedRead = true;
  }
}
{
  const marker = "function withTranscriptContextSnapshot(scope, view, read) {";
  const file = distFile(/^session-manager-.*\.js$/u, marker);
  if (file && fs.readFileSync(file, "utf8").split(marker).length === 2) {
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(marker, `${readProbe("context")}function withTranscriptContextSnapshot(scope, view, read) {
	const startedAt = Date.now();
	let rows;
	const result = __withTranscriptContextSnapshotProbed(scope, view, (snapshot) => {
		rows = snapshot?.entries?.length;
		return read(snapshot);
	});
	__readProbe_context({ ...scope, view }, startedAt, rows);
	return result;
}
function __withTranscriptContextSnapshotProbed(scope, view, read) {`));
    probes.contextRead = true;
  }
}
emit({ phase: "probes", probes });

// ---- configuration: V's /vds and Codex plugin, /vcc on VCC_MODEL, Worker canary ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.bindings = [];
config.cron = { ...(config.cron ?? {}), enabled: false };
const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) {
  config.models.providers.deepseek.models = (config.models.providers.deepseek.models ?? []).filter((m) => m.id !== id).concat([{ id, name, ...shape }]);
}
const entries = {
  [FLASH_REF]: { alias: "deepseek", agentRuntime: { id: "vlab-worker" }, params: { thinking: "high" } },
  [VDS_REF]: { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } },
  [VCC_REF]: { alias: "ltvcc", agentRuntime: { id: "claude-cli" }, params: { thinking: "high" } },
};
config.agents.defaults.models ??= {};
config.agents.entries.makaron.models ??= {};
for (const [ref, entry] of Object.entries(entries)) {
  config.agents.defaults.models[ref] = entry;
  config.agents.entries.makaron.models[ref] = entry;
}
const defaultModel = { primary: FLASH_REF, fallbacks: [] };
config.agents.defaults.model = defaultModel;
config.agents.entries.makaron.model = defaultModel;
// every allow list that can apply to makaron (an agent-level one takes precedence over defaults)
const allowLists = [config.agents.defaults.modelPolicy?.allow, config.agents.entries.makaron.modelPolicy?.allow, config.agents.defaults.models && config.agents.defaults.modelPolicy?.allowModels].filter(Array.isArray);
for (const list of allowLists) for (const ref of Object.keys(entries)) if (!list.includes(ref)) list.push(ref);
emit({ phase: "model-policy", lists: allowLists.length, makaronPolicy: config.agents.entries.makaron.modelPolicy ?? null, defaultsPolicyKeys: Object.keys(config.agents.defaults.modelPolicy ?? {}) });
// V's plugins.entries.codex (2026-10-17), with this run's Codex binary
config.plugins.entries.codex = { enabled: true, config: {
  codexPlugins: { enabled: false, allow_destructive_actions: true, plugins: { canva: { enabled: true, marketplaceName: "openai-curated", pluginName: "canva", allow_destructive_actions: true } } },
  codexDynamicToolsLoading: "searchable", codexDynamicToolsExclude: [],
  appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access", command: codexBin },
} };
if (Array.isArray(config.plugins.allow) && !config.plugins.allow.includes("codex")) config.plugins.allow.push("codex");
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
{
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(sharedState, rel), "utf8").replaceAll(sharedState, stateDir).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {};
  workerConfig.models.providers.deepseek.models = (workerConfig.models.providers.deepseek.models ?? []).filter((m) => m.id !== "deepseek-flash").concat([{ id: "deepseek-flash", name: "DeepSeek V4.1 Flash", ...shape }]);
  const workerEntry = { alias: "deepseek", agentRuntime: { id: "openclaw" }, params: { thinking: "high" } };
  workerConfig.agents.defaults.models = { ...(workerConfig.agents.defaults.models ?? {}), [FLASH_REF]: workerEntry };
  workerConfig.agents.defaults.model = defaultModel;
  if (workerConfig.agents.entries?.makaron) {
    workerConfig.agents.entries.makaron.models = { ...(workerConfig.agents.entries.makaron.models ?? {}), [FLASH_REF]: workerEntry };
    workerConfig.agents.entries.makaron.model = defaultModel;
  }
  const wallow = workerConfig.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(wallow) && !wallow.includes(FLASH_REF)) wallow.push(FLASH_REF);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
const makaron = config.agents.entries.makaron;
const workspace = makaron.workspace ?? config.agents.defaults.workspace;
// ---- Codex home as V's makaron one: its config.toml shape, shared caches; no threads or logs ----
{
  const src = path.join(sharedState, "agents", "makaron", "agent", "codex-home");
  const dst = path.join(makaron.agentDir, "codex-home");
  fs.mkdirSync(dst, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dst, "config.toml"), `approval_policy = "never"
sandbox_mode = "danger-full-access"

[projects."${workspace}"]
trust_level = "trusted"

[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
`, { mode: 0o600 });
  for (const entry of ["plugins", "cache", "skills", "models_cache.json"]) {
    if (fs.existsSync(path.join(src, entry))) fs.cpSync(path.join(src, entry), path.join(dst, entry), { recursive: true });
  }
}

// ---- private makaron database: schema, the source session trimmed, inflated, padded, cloned ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const dbPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dbPath), `private database already exists at ${dbPath}`);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const SESSION_TABLES = ["transcript_events", "transcript_event_identities", "session_transcript_active_events", "session_transcript_index_state", "transcript_rewrite_watermarks"];
// explicit keys, as vlab.mjs test uses: an operator-admin chat.send on them gets the owner's tools
// (a feishu:direct key for an unknown peer is filtered to read/write/apply_patch)
const keyFor = (runtimeId, size, i) => `agent:makaron:explicit:lt-${runtimeId}-${size}-${String(i).padStart(2, "0")}`;
const harnessOf = { vds: { model: "vds-deepseek-flash", provider: "deepseek", harness: "codex" }, vcc: { model: VCC_REF.split("/")[1], provider: VCC_REF.split("/")[0], harness: "claude-cli" } };
function buildDatabase() {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(path.join(sharedState, dbRel), { readOnly: true, allowExtension: true });
  const db = new DatabaseSync(dbPath, { allowExtension: true });
  src.loadExtension(vec);
  db.loadExtension(vec);
  db.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) db.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) db.exec(i.sql);
  const big = BIG_COUNT > 0;
  const sid = SOURCE_SESSION;
  const srcKey = big ? src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(sid)?.session_key : null;
  if (big) assert(srcKey, `session ${sid} is not in the shared VLab mirror`);
  // non-session tables whole (schema ownership and other metadata), never stored credentials or
  // memory; session tables only for the big-session source
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("auth_profile_") || t.name.startsWith("memory_") || t.name.startsWith("standing_intents")) continue;
    let where = "";
    let args = [];
    const sessionScoped = cols.includes("session_id") || cols.includes("session_key") || cols.includes("conversation_id") || cols.includes("run_id");
    if (sessionScoped) {
      if (!big) continue;
      if (cols.includes("session_id")) { where = `"session_id" = ?`; args = [sid]; }
      else if (cols.includes("session_key")) { where = `"session_key" = ?`; args = [srcKey]; }
      else continue;
    }
    const list = cols.map((c) => `"${c}"`).join(",");
    const rows = src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).all(...args);
    if (!rows.length) continue;
    const ins = db.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    db.exec("BEGIN");
    for (const r of rows) ins.run(...cols.map((c) => r[c]));
    db.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) db.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) db.exec(v.sql);
  db.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  db.exec("PRAGMA journal_mode = WAL");
  src.close();
  if (!big) { db.close(); return { big: null }; }

  // trim tool output (keeps event count and shape, keeps the model context small) and inflate
  const events = db.prepare("SELECT seq, event_json, created_at FROM transcript_events WHERE session_id = ? ORDER BY seq").all(sid).map((e) => ({ ...e, obj: JSON.parse(e.event_json) }));
  const trim = (content) => (Array.isArray(content) ? content.map((c) => (c?.type === "text" && typeof c.text === "string" && c.text.length > TRIM_TOOL_CHARS ? { ...c, text: `${c.text.slice(0, TRIM_TOOL_CHARS)}…[trimmed]` } : c))
    : typeof content === "string" && content.length > TRIM_TOOL_CHARS ? `${content.slice(0, TRIM_TOOL_CHARS)}…[trimmed]` : content);
  const setEvent = db.prepare("UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = ?");
  db.exec("BEGIN");
  for (const e of events) {
    if (e.obj?.message?.role === "toolResult") {
      e.obj.message.content = trim(e.obj.message.content);
      e.event_json = JSON.stringify(e.obj);
      setEvent.run(e.event_json, sid, e.seq);
    }
  }
  db.exec("COMMIT");
  const identities = db.prepare("SELECT event_id, seq, event_type, parent_id, message_idempotency_key, created_at FROM transcript_event_identities WHERE session_id = ?").all(sid);
  assert(!identities.some((r) => r.event_type === "compaction" || r.event_type === "reset"), "the source session must have no compaction or reset");
  const active = db.prepare("SELECT active_position, event_seq, message_position, context_eligible FROM session_transcript_active_events WHERE session_id = ? ORDER BY active_position").all(sid);
  const state = db.prepare("SELECT * FROM session_transcript_index_state WHERE session_id = ?").get(sid);
  assert(state && state.needs_rebuild === 0 && state.leaf_event_id, "source session index state is not usable");
  const header = events.find((e) => e.obj.type === "session");
  const idSet = new Set(identities.map((r) => r.event_id));
  const stride = Math.max(...events.map((e) => e.seq)) + 1;
  const body = events.filter((e) => e !== header);
  const activeBody = active.filter((a) => a.event_seq !== header?.seq);
  const suffix = (id, b) => `${id}r${b}`;
  const rewrite = (value, b) => {
    if (typeof value === "string") return idSet.has(value) ? suffix(value, b) : value;
    if (Array.isArray(value)) return value.map((v) => rewrite(v, b));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, b)]));
    return value;
  };
  const insEvent = db.prepare("INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)");
  const insIdentity = db.prepare("INSERT INTO transcript_event_identities (session_id, event_id, seq, event_type, parent_id, message_idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insActive = db.prepare("INSERT INTO session_transcript_active_events (session_id, active_position, event_seq, message_position, context_eligible) VALUES (?, ?, ?, ?, ?)");
  const identityBySeq = new Map(identities.map((r) => [r.seq, r]));
  db.exec("BEGIN");
  let leaf = state.leaf_event_id;
  for (let b = 1; b < INFLATE; b++) {
    const previousLeaf = leaf;
    for (const e of body) {
      let obj = rewrite(e.obj, b);
      if ("parentId" in obj && obj.parentId === null) obj.parentId = previousLeaf;
      if (obj.type === "thinking_level_change" || obj.type === "model_change") obj = { type: "custom", customType: "inflated-meta", id: obj.id, parentId: obj.parentId, timestamp: obj.timestamp, data: {} };
      const seq = b * stride + e.seq;
      insEvent.run(sid, seq, JSON.stringify(obj), e.created_at);
      const identity = identityBySeq.get(e.seq);
      if (identity) {
        insIdentity.run(sid, suffix(identity.event_id, b), seq, obj.type === "custom" && identity.event_type !== "custom" ? "custom" : identity.event_type,
          identity.parent_id === null ? previousLeaf : (idSet.has(identity.parent_id) ? suffix(identity.parent_id, b) : identity.parent_id),
          identity.message_idempotency_key === null ? null : `${identity.message_idempotency_key}:r${b}`, identity.created_at);
      }
    }
    activeBody.forEach((a, index) => {
      insActive.run(sid, active.length + (b - 1) * activeBody.length + index, b * stride + a.event_seq,
        a.message_position === null ? null : b * state.active_message_count + a.message_position, a.context_eligible);
    });
    leaf = suffix(state.leaf_event_id, b);
  }
  db.prepare("UPDATE session_transcript_index_state SET indexed_seq = ?, leaf_event_id = ?, active_event_count = ?, active_message_count = ? WHERE session_id = ?")
    .run((INFLATE - 1) * stride + stride - 1, leaf, active.length + (INFLATE - 1) * activeBody.length, INFLATE * state.active_message_count, sid);
  // pad to BIG_MB with view_image-shaped inline base64 on tool results (V's > 1 MB rows)
  const textBytes = db.prepare("SELECT sum(octet_length(event_json)) AS b FROM transcript_events WHERE session_id = ?").get(sid).b;
  const toolResults = db.prepare(`SELECT seq FROM transcript_events WHERE session_id = ? AND json_extract(event_json, '$.message.role') = 'toolResult' ORDER BY seq`).all(sid).map((r) => r.seq);
  const padBytes = Math.max(0, BIG_MB * 1e6 - textBytes);
  const rowsN = Math.min(40, toolResults.length);
  const perRow = Math.ceil(padBytes / Math.max(1, rowsN));
  const imagesPerRow = Math.max(1, Math.ceil(perRow / 300_000));
  const imageChars = Math.floor(perRow / imagesPerRow);
  const getEvent = db.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?");
  db.exec("COMMIT");
  db.exec("BEGIN");
  for (let i = 0; i < rowsN && padBytes > 0; i++) {
    const seq = toolResults[Math.floor((i + 0.5) * toolResults.length / rowsN)];
    const obj = JSON.parse(getEvent.get(sid, seq).event_json);
    const images = Array.from({ length: imagesPerRow }, () => ({ type: "image", data: randomBytes(Math.ceil(imageChars * 3 / 4)).toString("base64").slice(0, imageChars), mimeType: "image/jpeg" }));
    obj.message.content = [...(Array.isArray(obj.message.content) ? obj.message.content : [{ type: "text", text: String(obj.message.content ?? "") }]), ...images];
    setEvent.run(JSON.stringify(obj), sid, seq);
  }
  db.exec("COMMIT");
  const size = db.prepare("SELECT count(*) AS rows, sum(octet_length(event_json)) AS bytes FROM transcript_events WHERE session_id = ?").get(sid);
  const fk = db.prepare("PRAGMA foreign_key_check(session_transcript_active_events)").all().length + db.prepare("PRAGMA foreign_key_check(transcript_event_identities)").all().length;
  assert.equal(fk, 0, "inflated derived rows reference missing events");

  // clones: one per concurrent slot and runtime, each bound to its runtime as a V session in use
  const node = db.prepare("SELECT * FROM session_nodes WHERE current_session_id = ?").get(sid);
  const win = db.prepare("SELECT * FROM session_windows WHERE session_id = ?").get(sid);
  assert(node && win, "source session node/window missing");
  const now = Date.now();
  const copyRows = (table, oldSid, newSid) => {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
    const list = cols.map((c) => `"${c}"`).join(",");
    const sel = cols.map((c) => (c === "session_id" ? "?" : c === "event_json" ? "replace(event_json, ?, ?)" : `"${c}"`)).join(",");
    const params = cols.includes("event_json") ? [newSid, oldSid, newSid, oldSid] : [newSid, oldSid];
    db.prepare(`INSERT INTO "${table}" (${list}) SELECT ${sel} FROM "${table}" WHERE session_id = ?`).run(...params);
  };
  const insertWith = (table, row) => {
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((c) => row[c]));
  };
  const clones = { vds: [], vcc: [] };
  const needed = { vds: ARMS.some((a) => a.size === "big" && (a.arm === "vds" || a.arm === "mix")), vcc: ARMS.some((a) => a.size === "big" && (a.arm === "vcc" || a.arm === "mix")) };
  for (const rt of ["vds", "vcc"]) {
    if (!needed[rt]) continue;
    for (let i = 0; i < BIG_COUNT; i++) {
      const newSid = randomUUID();
      const key = keyFor(rt, "big", i);
      db.exec("BEGIN");
      for (const t of SESSION_TABLES) copyRows(t, sid, newSid);
      const h = harnessOf[rt];
      const entry = JSON.parse(node.entry_json.replaceAll(sid, newSid).replaceAll(srcKey, key));
      for (const k of ["updatedAt", "lastInteractionAt", "lastActivityAt"]) entry[k] = now;
      for (const k of ["memoryFlush", "cliSessionBindings", "cliSessionIds", "claudeCliSessionId", "codexThreadId", "deliveryContext", "lastChannel", "lastTo", "origin"]) delete entry[k];
      Object.assign(entry, { sessionId: newSid, model: h.model, modelProvider: h.provider, modelOverride: h.model, providerOverride: h.provider, modelOverrideSource: "user", modelOverrideRouteResolution: "resolved", agentHarnessId: h.harness, thinkingLevel: "high" });
      insertWith("session_nodes", { ...node, session_key: key, current_session_id: newSid, entry_json: JSON.stringify(entry), updated_at: now, last_interaction_at: now, last_activity_at: now, parent_session_key: null, fork_source_session_key: null, fork_source_session_id: null, fork_source_entry_id: null });
      insertWith("session_windows", { ...win, session_id: newSid, session_key: key, previous_session_id: null, primary_conversation_id: null, model_provider: h.provider, model: h.model, agent_harness_id: h.harness, updated_at: now });
      db.exec("COMMIT");
      clones[rt].push(key);
    }
  }
  // the source itself is not used by any arm
  db.exec("BEGIN");
  for (const t of [...SESSION_TABLES, "session_windows", "session_conversations", "trajectory_runtime_events", "session_transcript_archives"]) db.prepare(`DELETE FROM "${t}" WHERE session_id = ?`).run(sid);
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND sql NOT LIKE '%VIRTUAL%'").all()) {
    if (db.prepare(`PRAGMA table_info("${name}")`).all().some((c) => c.name === "session_key") && name !== "session_nodes") db.prepare(`DELETE FROM "${name}" WHERE session_key = ?`).run(srcKey);
  }
  db.prepare("DELETE FROM session_nodes WHERE session_key = ?").run(srcKey);
  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const fileMB = Math.round(fs.statSync(dbPath).size / 1e6);
  db.close();
  return { big: { source: sid.slice(0, 8), events: size.rows, mb: Math.round(size.bytes / 1e5) / 10, textMB: Math.round(textBytes / 1e5) / 10, imagesPerRow, imageChars, rowsPadded: rowsN, clones: { vds: clones.vds.length, vcc: clones.vcc.length }, dbFileMB: fileMB } };
}
const built = buildDatabase();
emit({ phase: "database", ...built });
// V's startup verification of the synthesized database, for the record (the Gateway below runs
// without the DB91 admission gate): what it would reject, if anything
{
  const { fork } = await import("node:child_process");
  const verify = await new Promise((resolve) => {
    const w = fork(path.join(dist, "state/openclaw-database-verify.worker.js"), ["--openclaw-database-verify-child"], { env: process.env, execArgv: ["--max-old-space-size=1024"], stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let err = "";
    w.stderr.on("data", (b) => { err += b; });
    let msg;
    w.once("message", (m) => { msg = m; });
    w.once("exit", (code) => resolve({ code, result: msg, stderr: err.slice(-800) }));
    w.send([{ kind: "agent", label: "OpenClaw agent database", path: dbPath }]);
    setTimeout(() => w.kill("SIGKILL"), 600_000).unref();
  });
  emit({ phase: "db-verify", code: verify.code, result: redact(JSON.stringify(verify.result ?? null)).slice(0, 3000), stderr: redact(verify.stderr) });
}

// Claude Code keeps its sessions under $HOME/.claude/projects (the shared instance's HOME); the
// directories this run adds are removed at the end.
const claudeProjects = path.join(process.env.HOME ?? "/nonexistent", ".claude", "projects");
const claudeProjectsBefore = new Set(fs.existsSync(claudeProjects) ? fs.readdirSync(claudeProjects) : []);

// ---- Gateway: V's Node flags and env, the lag probe preloaded ----
const vEnv = {
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1", OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP: "1",
  // not OPENCLAW_DB91_INTEGRITY_ENABLE: a startup admission gate (it rejects the synthesized database), not turn work
  OPENCLAW_DB91_PROVENANCE_ENABLE: "1", OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE: "1", OPENCLAW_DB91_MAINTENANCE_ENABLE: "1",
  OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE: "1", OPENCLAW_DB91_INTEGRITY_ENABLE: "0", OPENCLAW_DB91_READ_AHEAD_ENABLE: "1",
  OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE: "1", OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE: "1",
};
const shortTmp = `/tmp/.ltc-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const env = {
  ...process.env, ...vEnv,
  PATH: `${claudeBinDir}:${path.dirname(process.execPath)}:${process.env.PATH}`, OPENCLAW_PATH_BOOTSTRAPPED: "1", DISABLE_AUTOUPDATER: "1",
  OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: path.join(scratch, "cache"), npm_config_cache: path.join(scratch, "npm-cache"),
  DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY,
};
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
const lagProbe = path.join(here, "runtime-concurrency-lag.mjs");
const lines = [];
let gateway;
let gatewayStartedAt;
let gatewayStarts = 0;
const plain = (s) => s.replace(/\u001b\[[0-9;]*m/gu, "");
// lag and signal lines are appended to OUT_DIR every 15 s, so a stopped run still leaves them
const SIGNAL = /liveness|stream acknowledgement|Cannot inspect Codex|Process inspection|Cannot reap|orphan cleanup|\[read-probe\]|\[hold-probe\]|\b429\b|rate.?limit|overloaded|harness failed|lane task error|startup maintenance failed|Gateway failed/iu;
const pendingLag = [];
const pendingSignal = [];
function flushLogs() {
  if (pendingLag.length) fs.appendFileSync(path.join(OUT_DIR, "lag.jsonl"), `${pendingLag.splice(0).join("\n")}\n`);
  if (pendingSignal.length) fs.appendFileSync(path.join(OUT_DIR, "gateway-signal-lines.jsonl"), `${pendingSignal.splice(0).join("\n")}\n`);
}
setInterval(flushLogs, 15_000).unref();
process.on("SIGTERM", () => { try { flushLogs(); fs.writeFileSync(path.join(OUT_DIR, "samples.jsonl"), samples.map((x) => JSON.stringify(x)).join("\n")); } finally { gateway?.kill("SIGTERM"); process.exit(143); } });
function startGateway() {
  gatewayStarts += 1;
  gatewayStartedAt = Date.now();
  gateway = spawn(process.execPath, [`--import=${lagProbe}`, "--experimental-async-context-frame", "--max-old-space-size=12288", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    let rest = "";
    s.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u);
      rest = parts.pop();
      for (const line of parts) if (line) {
        const entry = { at: Date.now(), line: plain(line) };
        lines.push(entry);
        if (entry.line.includes("[lt-lag]")) pendingLag.push(entry.line.slice(entry.line.indexOf("{")));
        else if (SIGNAL.test(entry.line)) pendingSignal.push(JSON.stringify({ at: entry.at, line: redact(entry.line).slice(0, 1500) }));
      }
      if (lines.length > 400_000) lines.splice(0, lines.length - 400_000);
    });
  }
}
const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
const runs = new Map();
let client;
function onEvent(e) {
  const p = e.payload;
  const r = runs.get(p?.runId);
  if (!r) return;
  const now = Date.now();
  if (e.event === "agent" && p.stream === "assistant" && typeof p.data?.text === "string" && p.data.text.trim() && !r.firstTextAt) r.firstTextAt = now;
  if (e.event === "agent" && p.stream === "tool" && !r.firstToolAt) r.firstToolAt = now;
  if (e.event === "chat" && p.state === "delta" && !r.firstTextAt) r.firstTextAt = now;
  if (e.event === "chat" && ["final", "error", "aborted"].includes(p.state) && !r.terminal) {
    r.terminal = p.state;
    r.endAt = now;
    if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300));
    const c = p.message?.content;
    r.text = (Array.isArray(c) ? c.filter((x) => x?.type === "text").map((x) => x.text).join("") : typeof c === "string" ? c : "").slice(0, 300);
  }
}
async function connectGateway() {
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-80).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 10_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"],
          scopes: ["operator.admin", "operator.read", "operator.write"], onEvent,
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
        });
        client.start();
      });
      return;
    } catch (error) { lastError = error; client?.stop(); await sleep(2_000); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}

// ---- 1 s sampler: Gateway CPU/RSS, its process tree, host memory ----
const samples = [];
const TICK = 100; // USER_HZ
function readStat(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
    return { cpu: (Number(f[11]) + Number(f[12])) / TICK, rssMB: Math.round(Number(f[21]) * 4096 / 1048576) };
  } catch { return null; }
}
function tree(root) {
  const out = [];
  const walk = (pid) => {
    let kids = "";
    try { kids = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8"); } catch { return; }
    for (const k of kids.trim().split(/\s+/u).filter(Boolean)) {
      let cmd = "";
      try { cmd = fs.readFileSync(`/proc/${k}/cmdline`, "utf8").split("\0").join(" "); } catch { continue; }
      const kind = /codex.*app-server|\/codex\s+app-server|bin\/codex\b/u.test(cmd) ? "codex" : /claude/u.test(cmd) && /stream-json/u.test(cmd) ? "claude" : /worker/u.test(cmd) && /node/u.test(cmd) ? "worker" : "other";
      out.push({ pid: Number(k), kind, ...readStat(k) });
      walk(k);
    }
  };
  walk(root);
  return out;
}
function hostMem() {
  const m = fs.readFileSync("/proc/meminfo", "utf8");
  const v = (k) => Number(m.match(new RegExp(`^${k}:\\s+(\\d+)`, "mu"))?.[1] ?? 0) / 1024;
  return { availMB: Math.round(v("MemAvailable")), swapUsedMB: Math.round(v("SwapTotal") - v("SwapFree")), load1: Number(fs.readFileSync("/proc/loadavg", "utf8").split(" ")[0]) };
}
let lastSample;
const seenCodexPids = new Set();
setInterval(() => {
  if (!gateway || gateway.exitCode !== null) return;
  const at = Date.now();
  const g = readStat(gateway.pid);
  if (!g) return;
  const kids = tree(gateway.pid);
  for (const k of kids) if (k.kind === "codex") seenCodexPids.add(k.pid);
  const sum = (kind) => kids.filter((k) => k.kind === kind);
  const s = { at, gwCpuPct: lastSample ? Math.round(100 * (g.cpu - lastSample.cpu) / ((at - lastSample.at) / 1000)) : null, gwRssMB: g.rssMB,
    codexN: sum("codex").length, codexRssMB: sum("codex").reduce((a, k) => a + (k.rssMB ?? 0), 0),
    claudeN: sum("claude").length, claudeRssMB: sum("claude").reduce((a, k) => a + (k.rssMB ?? 0), 0),
    workerN: sum("worker").length, ...hostMem() };
  lastSample = { at, cpu: g.cpu };
  samples.push(s);
  if (samples.length > 50_000) samples.splice(0, 10_000);
}, 1000).unref();

// ---- log readers for a time window ----
const inWin = (from, to) => (x) => x.at >= from && x.at <= to;
const jsonAfter = (line, tag) => { try { return JSON.parse(line.slice(line.indexOf("{", line.indexOf(tag)))); } catch { return null; } };
function windowMetrics(from, to) {
  const ls = lines.filter(inWin(from, to));
  const lag = ls.filter((l) => l.line.includes("[lt-lag]")).map((l) => jsonAfter(l.line, "[lt-lag]")).filter((j) => j && j.pid === gateway.pid);
  const worst = lag.reduce((a, b) => (b.gapMs > (a?.gapMs ?? -1) ? b : a), null);
  const reads = ls.filter((l) => l.line.includes("[read-probe]")).map((l) => jsonAfter(l.line, "[read-probe]")).filter((j) => j && j.pid === gateway.pid);
  const holds = ls.filter((l) => l.line.includes("[hold-probe]")).map((l) => jsonAfter(l.line, "[hold-probe]")).filter((j) => j && j.pid === gateway.pid);
  const count = (re) => ls.filter((l) => re.test(l.line)).length;
  const overdue = ls.map((l) => l.line.match(/liveness heartbeat delayed: overdue=(\d+)ms/u)).filter(Boolean).map((m) => Number(m[1]));
  const ss = samples.filter(inWin(from, to));
  const max = (arr, k) => (arr.length ? Math.max(...arr.map((x) => x[k] ?? 0)) : null);
  return {
    stallMaxMs: worst?.gapMs ?? null, stallCpuMs: worst?.cpuMs ?? null, stallAt: worst ? new Date(worst.at).toISOString() : null,
    delayMaxMs: max(lag, "maxDelayMs"), stallsOver1s: lag.filter((x) => x.gapMs >= 1000).length, stallsOver5s: lag.filter((x) => x.gapMs >= 5000).length,
    eluAvg: lag.length ? Math.round(1000 * lag.reduce((a, x) => a + x.elu, 0) / lag.length) / 1000 : null, heapMaxMB: max(lag, "heapMB"),
    liveness: overdue.length + count(/liveness (?:warning|stalled|stall)/iu), livenessOverdueMaxMs: overdue.length ? Math.max(...overdue) : 0,
    streamAckTimeouts: count(/stream acknowledgement timed out/iu),
    codexInspection: count(/Cannot inspect Codex processes/u), codexInspectionDeadline: count(/Process inspection exceeded its deadline/u),
    codexReap: count(/Cannot reap registered Codex process|orphan cleanup (?:failed|exceeded)/u),
    rateLimited: count(/\b429\b|rate.?limit|overloaded/iu),
    memoryFlush: count(/memory.?flush/iu),
    readsN: reads.length, readsMaxMs: reads.length ? Math.max(...reads.map((r) => r.ms)) : 0, readsSumMs: reads.reduce((a, r) => a + r.ms, 0),
    readsByKind: Object.fromEntries(["context", "fenced"].map((k) => [k, reads.filter((r) => r.kind === k).length])),
    holdsMaxMs: holds.length ? Math.max(...holds.map((h) => h.ms)) : 0, holdsN: holds.length, holdsSumMs: holds.reduce((a, h) => a + h.ms, 0),
    holdsByOp: Object.fromEntries(Object.entries(holds.reduce((a, h) => { const k = h.op ?? "?"; a[k] = a[k] ?? { n: 0, ms: 0 }; a[k].n += 1; a[k].ms += h.ms; return a; }, {})).sort((x, y) => y[1].ms - x[1].ms).slice(0, 8)),
    gwCpuAvgPct: ss.length ? Math.round(ss.reduce((a, s) => a + (s.gwCpuPct ?? 0), 0) / ss.length) : null, gwCpuMaxPct: max(ss, "gwCpuPct"),
    gwRssMaxMB: max(ss, "gwRssMB"), codexProcMax: max(ss, "codexN"), codexRssMaxMB: max(ss, "codexRssMB"), claudeProcMax: max(ss, "claudeN"), claudeRssMaxMB: max(ss, "claudeRssMB"),
    hostAvailMinMB: ss.length ? Math.min(...ss.map((s) => s.availMB)) : null, swapUsedMaxMB: max(ss, "swapUsedMB"), loadMax: max(ss, "load1"),
  };
}
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] / 100) / 10; };

// ---- turns ----
async function prepareSession(key, ref) {
  try { await client.request("sessions.patch", { key, model: ref }); } catch (error) { return redact(error?.message ?? error).slice(0, 200); }
  return null;
}
async function send(key, runtimeId, label) {
  const id = randomUUID();
  const r = { id, key, runtime: runtimeId, label, sentAt: Date.now() };
  runs.set(id, r);
  // the answer is only known by running the command (the model cannot compute a sha256), so a
  // correct reply proves the tool ran
  const message = `（自动化并发压测）用 shell 执行一次 \`printf %s ${label} | sha256sum | cut -c1-12\`，然后只回复它输出的那 12 个字符，不要别的文字。`;
  r.expected = createHash("sha256").update(label).digest("hex").slice(0, 12);
  try {
    await client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: 120_000 });
    r.acceptedAt = Date.now();
  } catch (error) {
    r.terminal = "send-error"; r.endAt = Date.now(); r.error = redact(error?.message ?? error).slice(0, 300);
  }
  const deadline = r.sentAt + TURN_TIMEOUT_MS + 30_000;
  while (!r.terminal && Date.now() < deadline) {
    if (gateway.exitCode !== null) { r.terminal = "gateway-exit"; break; }
    await sleep(250);
  }
  if (!r.terminal) { r.terminal = "timeout"; r.endAt = Date.now(); }
  if (r.terminal === "final" && !r.text) {
    try {
      const h = await client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 2 }, { timeoutMs: 60_000 });
      const last = (h?.messages ?? []).filter((m) => m.role === "assistant").at(-1);
      const c = last?.content;
      r.text = (Array.isArray(c) ? c.filter((x) => x?.type === "text").map((x) => x.text).join("") : String(c ?? "")).slice(0, 300);
    } catch {}
  }
  r.correct = r.terminal === "final" && (r.text ?? "").includes(r.expected);
  return { label, runtime: runtimeId, key: key.split(":").pop(), terminal: r.terminal, correct: r.correct, tool: Boolean(r.firstToolAt),
    firstMs: r.firstTextAt ? r.firstTextAt - r.sentAt : null, doneMs: r.endAt - r.sentAt, error: r.error, text: r.correct ? undefined : redact(r.text ?? "").slice(0, 160) };
}
const REF = { vds: VDS_REF, vcc: VCC_REF, flash: FLASH_REF };
const smallReady = new Set();
async function sessionsFor(arm, size, c) {
  const want = [];
  for (let i = 0; i < c; i++) {
    const rt = arm === "mix" ? (i % 2 === 0 ? "vds" : "vcc") : arm;
    const slot = arm === "mix" ? Math.floor(i / 2) : i;
    want.push({ rt, key: keyFor(rt, size, slot) });
  }
  if (size === "small") {
    for (const w of want) {
      if (smallReady.has(w.key)) continue;
      const err = await prepareSession(w.key, REF[w.rt]);
      if (err) emit({ phase: "prepare-error", key: w.key, err });
      smallReady.add(w.key);
    }
  }
  return want;
}
let canaryN = 0;
async function canaryKey() {
  const key = keyFor("flash", "canary", 0);
  if (!smallReady.has(key)) { const err = await prepareSession(key, FLASH_REF); if (err) emit({ phase: "prepare-error", key, err }); smallReady.add(key); }
  return key;
}

// what each session really ran on: the window's harness and the last assistant message's model
function actualRuntime(keys) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const out = {};
    for (const key of keys) {
      const w = db.prepare("SELECT w.session_id, w.agent_harness_id AS harness, w.model FROM session_nodes n JOIN session_windows w ON w.session_id = n.current_session_id WHERE n.session_key = ?").get(key);
      const m = w ? db.prepare(`SELECT json_extract(event_json, '$.message.provider') AS provider, json_extract(event_json, '$.message.model') AS model, json_extract(event_json, '$.message.api') AS api, json_extract(event_json, '$.message.usage') AS usage
        FROM transcript_events WHERE session_id = ? AND json_extract(event_json, '$.message.role') = 'assistant' ORDER BY seq DESC LIMIT 1`).get(w.session_id) : null;
      let usage = "";
      try { const u = JSON.parse(m?.usage ?? "null"); if (u) usage = `|in=${u.input ?? u.inputTokens ?? "?"} cache=${u.cacheRead ?? "?"} out=${u.output ?? u.outputTokens ?? "?"}`; } catch {}
      out[key.split(":").pop()] = w ? `${w.harness ?? "?"}|${m?.provider ?? "?"}/${m?.model ?? w.model ?? "?"}|${m?.api ?? "?"}${usage}` : "missing";
    }
    return out;
  } catch (error) { return { error: String(error?.message ?? error).slice(0, 200) }; } finally { db.close(); }
}

async function level(arm, size, c) {
  const plan = await sessionsFor(arm, size, c);
  const from = Date.now();
  const jobs = plan.map((p, i) => send(p.key, p.rt, `${arm}-${size}-c${c}-${i}`));
  const canary = CANARY ? send(await canaryKey(), "flash", `canary-${arm}-${size}-c${c}-${canaryN++}`) : null;
  const results = await Promise.all(jobs);
  const canaryResult = canary ? await canary : null;
  const to = Date.now();
  await sleep(SETTLE_MS);
  const m = windowMetrics(from, Date.now());
  const failed = results.filter((r) => !r.correct);
  const byRt = {};
  for (const rt of [...new Set(results.map((r) => r.runtime))]) {
    const rs = results.filter((r) => r.runtime === rt);
    byRt[rt] = { n: rs.length, ok: rs.filter((r) => r.correct).length,
      firstP50: pct(rs.map((r) => r.firstMs).filter((x) => x != null), 0.5), firstP95: pct(rs.map((r) => r.firstMs).filter((x) => x != null), 0.95),
      doneP50: pct(rs.filter((r) => r.terminal === "final").map((r) => r.doneMs), 0.5), doneP95: pct(rs.filter((r) => r.terminal === "final").map((r) => r.doneMs), 0.95) };
  }
  const errors = {};
  for (const f of failed) { const k = (f.error || f.terminal + (f.text ? `: ${f.text}` : "")).slice(0, 120); errors[k] = (errors[k] ?? 0) + 1; }
  const h = hostContext();
  const host = { gcSwap: h.gcSwapExperiment.length > 0, sharedGatewayInspect: h.sharedGatewayInspect.some((g) => g.inspect), otherCandidates: h.otherCandidates.length, load: h.load };
  const ran = actualRuntime([...plan.map((p) => p.key), ...(CANARY ? [await canaryKey()] : [])]);
  return { arm, size, c, host, ran, wallS: Math.round((to - from) / 1000), failed: failed.length, failRate: Math.round(100 * failed.length / results.length) / 100, byRuntime: byRt, errors, canary: canaryResult, ...m, runs: results };
}

async function waitSteady(label, minUptimeMin) {
  let ok = 0;
  let last;
  const started = Date.now();
  for (;;) {
    const up = (Date.now() - gatewayStartedAt) / 60_000;
    const rss = readStat(gateway.pid)?.rssMB;
    const winFrom = Date.now() - Math.max(STEADY_SAMPLE_MS, 120_000);
    const m = windowMetrics(winFrom, Date.now());
    const drift = last === undefined ? null : Math.abs(rss - last);
    const good = up >= minUptimeMin && drift !== null && drift < STEADY_DRIFT_MB && m.liveness === 0 && (m.stallMaxMs ?? 0) < STEADY_STALL_MS;
    ok = good ? ok + 1 : 0;
    emit({ phase: "steady-check", label, upMin: Math.round(up * 10) / 10, rssMB: rss, driftMB: drift, liveness: m.liveness, stallMaxMs: m.stallMaxMs, ok });
    if (ok >= 3) return { waitedS: Math.round((Date.now() - started) / 1000), rssMB: rss };
    last = rss;
    await sleep(STEADY_SAMPLE_MS);
  }
}

// ---- run ----
startGateway();
const summary = { built, probes, models: { vds: VDS_REF, vcc: VCC_REF, canary: FLASH_REF }, levels: [], stoppedAt: {} };
try {
  await connectGateway();
  emit({ phase: "gateway-ready", pid: gateway.pid, readyS: Math.round((Date.now() - gatewayStartedAt) / 1000) });
  // warm each runtime once (app-server, claude, worker spawn), then every big session once so its
  // Codex thread / Claude session exists, as on V where big sessions are in use
  const warm = [];
  for (const rt of ["vds", "vcc"]) if (ARMS.some((a) => a.arm === rt || a.arm === "mix")) {
    const key = keyFor(rt, "warm", 0);
    await prepareSession(key, REF[rt]);
    warm.push(await send(key, rt, `warm-${rt}`));
  }
  if (CANARY) warm.push(await send(await canaryKey(), "flash", "warm-canary"));
  emit({ phase: "warm", warm, ran: actualRuntime([keyFor("vds", "warm", 0), ...(NEEDS_CLAUDE ? [keyFor("vcc", "warm", 0)] : []), keyFor("flash", "canary", 0)]) });
  if (WARM_BIG && BIG_COUNT > 0) {
    for (const rt of ["vds", "vcc"]) {
      const keys = ARMS.some((a) => a.size === "big" && (a.arm === rt || a.arm === "mix")) ? Array.from({ length: BIG_COUNT }, (_, i) => keyFor(rt, "big", i)) : [];
      for (let i = 0; i < keys.length; i += 3) {
        const from = Date.now();
        const rs = await Promise.all(keys.slice(i, i + 3).map((k, j) => send(k, rt, `warm-big-${rt}-${i + j}`)));
        emit({ phase: "warm-big", rt, rs, stallMaxMs: windowMetrics(from, Date.now()).stallMaxMs, readsMaxMs: windowMetrics(from, Date.now()).readsMaxMs });
      }
    }
  }
  summary.steady = await waitSteady("initial", STEADY_MIN);
  summary.hostAtStart = hostContext();
  emit({ phase: "steady", ...summary.steady, host: summary.hostAtStart });
  for (const { arm, size } of ARMS) {
    for (const c of LEVELS) {
      const res = await level(arm, size, c);
      const { runs: levelRuns, ...head } = res;
      emit({ phase: "level", ...head });
      emit({ phase: "level-runs", arm, size, c, runs: levelRuns });
      summary.levels.push(res);
      const stop = (res.stallMaxMs ?? 0) > GATE_STALL_MS ? `stall ${res.stallMaxMs} ms` : res.failRate > GATE_FAIL_RATE ? `failures ${res.failed}/${c}` : null;
      if (res.hostAvailMinMB !== null && res.hostAvailMinMB < HOST_MIN_AVAILABLE_MB) { summary.abort = `host MemAvailable ${res.hostAvailMinMB} MB`; break; }
      if (stop) { summary.stoppedAt[`${arm}:${size}`] = { c, reason: stop }; emit({ phase: "gate", arm, size, c, stop }); break; }
      await sleep(COOLDOWN_MS);
    }
    if (summary.abort) { emit({ phase: "abort", reason: summary.abort }); break; }
    await waitSteady(`after-${arm}-${size}`, 0);
  }
  summary.codexAppServersSpawned = seenCodexPids.size;
  summary.gatewayStarts = gatewayStarts;
  const out = { phase: "summary", ...summary, levels: summary.levels.map(({ runs: _r, ...l }) => l) };
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify({ ...out, levels: summary.levels }, null, 1));
} catch (error) {
  console.error(redact(error?.stack ?? error));
  console.error(redact(lines.slice(-120).map((l) => l.line).join("\n")));
  process.exitCode = 1;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(5_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  fs.rmSync(shortTmp, { recursive: true, force: true });
  if (fs.existsSync(claudeProjects)) for (const d of fs.readdirSync(claudeProjects)) if (!claudeProjectsBefore.has(d)) fs.rmSync(path.join(claudeProjects, d), { recursive: true, force: true });
  flushLogs();
  fs.writeFileSync(path.join(OUT_DIR, "samples.jsonl"), samples.map((s) => JSON.stringify(s)).join("\n"));
}
process.exit(process.exitCode ?? 0);
