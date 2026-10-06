// Candidate measurement: where does a /vcodex turn spend its time before the model?
//
// V 2026-09-30: from the persisted user message to Codex turn/start takes a median
// 6.5 s (p90 17.9 s), about 5 s on tiny sessions and 8 s on 80 MB ones, while the
// Codex app-server logs nothing for the thread in that window. The model itself
// answers in 4-7 s. Codex's own profiler only covers the stages before dynamic
// tools, so this run adds its own marks.
//
// What it does, all in this run's private copies:
//   - a private Gateway on V's shared VLab configuration (channels and cron off),
//     under --cpu-prof, with OPENCLAW_DIAGNOSTICS=profiler (Codex and reply/agent-turn timings)
//   - marks between the awaited stages of runCodexAppServerAttempt and a timer
//     on every Codex app-server RPC, both patched into the private plugin copy
//   - vcodex turns (gpt-6.1-sol via the codex runtime) on a new session and on a
//     copy of a large production-sized session
// It reports per turn: user message -> attempt start -> each stage -> turn/start
// -> model completed, the RPCs issued in the window, and where the Gateway main
// thread spent CPU in the pre-turn window (or that it was idle, i.e. waiting).

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { disableCodexPlugins } from "../release-files/codex-plugins-off/config.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
// Which Codex-runtime alias to drive. The Gateway-side preparation measured here runs before the
// provider is called, so /vds (codex runtime + DeepSeek) exercises the same path as /vcodex when
// VLab has no live ChatGPT login.
const ALIAS = process.env.CODEX_ALIAS ?? "vcodex";
const NEW_TURNS = Number(process.env.NEW_TURNS ?? 3);
const BIG_TURNS = Number(process.env.BIG_TURNS ?? 2);
const BIG_SESSION_KEY = process.env.BIG_SESSION_KEY ?? "agent:makaron:feishu:group:oc_ecabb6515bef5df53bf5fd1dbeca79db"; // largest makaron session in the VLab mirror (25 MB)
const RPC_LOG_MS = Number(process.env.RPC_LOG_MS ?? 20);
// V has ~7.7k makaron sessions whose entries are 136 MB; a one-session copy hides any per-turn scan of them
const ALL_SESSION_METADATA = process.env.ALL_SESSION_METADATA === "1";
const HOLD_PROBE_MS = Number(process.env.HOLD_PROBE_MS ?? 100);
// CODEX_PLUGINS_OFF=1 applies lab/release-files/codex-plugins-off to both private configs
const CODEX_PLUGINS_OFF = process.env.CODEX_PLUGINS_OFF === "1";
const data = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
// private temp and cache dirs: the shared instance's are owned by another user and OpenClaw refuses them
for (const [key, dir] of Object.entries({ TMPDIR: "tmp", XDG_CACHE_HOME: "cache", npm_config_cache: "npm-cache" })) {
  process.env[key] = path.join(data, dir);
  fs.mkdirSync(process.env[key], { recursive: true, mode: 0o700 });
}
const PROFILE_DIR = path.join(data, "cpu-profile");
fs.mkdirSync(PROFILE_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const cli = path.join(dist, "index.js");
function run(args, timeout = 300_000) {
  const r = spawnSync(process.execPath, [cli, ...args], { env: process.env, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(r.status, 0, redact(`${r.stdout}\n${r.stderr}`).slice(-4000));
  return r.stdout;
}

// ---- Codex plugin: registry entry, then V's (shared VLab's) exact dist, then probes ----
const projectsOf = (root) => { try { return fs.readdirSync(path.join(root, "npm", "projects")).filter((p) => p.startsWith("openclaw-codex-")); } catch { return []; } };
if (!projectsOf(stateDir).length) run(["plugins", "install", "@openclaw/codex@2026.9.1", "--pin", "--force", "--accept-capabilities", "--acknowledge-install-policy-warning"]);
const [pluginProject] = projectsOf(stateDir);
const [sharedProject] = projectsOf(sharedState);
assert(pluginProject && sharedProject, "codex plugin project missing");
const codexDist = path.join(stateDir, "npm", "projects", pluginProject, "node_modules", "@openclaw", "codex", "dist");
fs.cpSync(path.join(sharedState, "npm", "projects", sharedProject, "node_modules", "@openclaw", "codex", "dist"), codexDist, { recursive: true });
{
  const byMarker = (marker) => {
    const name = fs.readdirSync(codexDist).find((f) => f.endsWith(".js") && fs.readFileSync(path.join(codexDist, f), "utf8").includes(marker));
    assert(name, `codex dist marker not found: ${marker}`);
    return path.join(codexDist, name);
  };
  const helper = `
function __vprofMark(runId, stage) { console.error("[vprof] " + JSON.stringify({ runId, stage, at: Date.now(), mono: Number(process.hrtime.bigint() / 1000n) })); }
function __vprofRpc(method, startedAt, startedMono, status) { const ms = Date.now() - startedAt; if (ms >= ${RPC_LOG_MS} || method === "turn/start" || method === "thread/resume" || method === "thread/start") console.error("[vprof-rpc] " + JSON.stringify({ method, ms, status, at: startedAt, mono: startedMono })); }
`;
  // stage marks between the awaited steps of one attempt
  const attemptFile = byMarker("async function runCodexAppServerAttempt(params, options) {");
  let src = fs.readFileSync(attemptFile, "utf8");
  const before = `async function runCodexAppServerAttempt(params, options) {
	const connection = await prepareCodexAttemptConnection({
		params,
		options
	});
	const runtime = await prepareCodexAttemptRuntime(connection);
	const attemptTools = await prepareCodexAttemptTools(runtime);
	const resources = prepareCodexAttemptResources(await prepareCodexAttemptPrompt(await prepareCodexAttemptContext(runtime, attemptTools)));
	attemptTools.runtimeYieldCompletionClaim.current = () => resources.state.nativeHookRelay?.hasClaimedDirectChild() ?? false;
	await startCodexAttemptRuntime(resources);
	const turnRuntime = createCodexAttemptTurnState(resources);`;
  const after = `async function runCodexAppServerAttempt(params, options) {
	__vprofMark(params.runId, "attempt-begin");
	const connection = await prepareCodexAttemptConnection({
		params,
		options
	});
	__vprofMark(params.runId, "connection");
	const runtime = await prepareCodexAttemptRuntime(connection);
	__vprofMark(params.runId, "runtime");
	const attemptTools = await prepareCodexAttemptTools(runtime);
	__vprofMark(params.runId, "tools");
	const __vprofContext = await prepareCodexAttemptContext(runtime, attemptTools);
	__vprofMark(params.runId, "context");
	const __vprofPrompt = await prepareCodexAttemptPrompt(__vprofContext);
	__vprofMark(params.runId, "prompt");
	const resources = prepareCodexAttemptResources(__vprofPrompt);
	attemptTools.runtimeYieldCompletionClaim.current = () => resources.state.nativeHookRelay?.hasClaimedDirectChild() ?? false;
	await startCodexAttemptRuntime(resources);
	__vprofMark(params.runId, "thread-ready");
	const turnRuntime = createCodexAttemptTurnState(resources);`;
  assert(src.includes(before), "runCodexAppServerAttempt shape changed");
  src = src.replace(before, after);
  const routeBefore = "\t\tconst turnRequest = await prepareCodexAttemptTurnRequest(";
  const turnBefore = "\t\tconst turnStart = await startCodexAttemptTurn(";
  assert(src.includes(routeBefore) && src.includes(turnBefore), "attempt route/turn anchors missing");
  src = src.replace(routeBefore, `\t\t__vprofMark(params.runId, "route");\n${routeBefore}`)
    .replace(turnBefore, `\t\t__vprofMark(params.runId, "turn-request");\n${turnBefore}`);
  src = src.replace(/(\t\tconst turnStart = await startCodexAttemptTurn\([^\n]*\n)/u, `$1\t\t__vprofMark(params.runId, "turn-started");\n`);
  fs.writeFileSync(attemptFile, `${src}\n${helper}`);

  // which branch the plugin thread config took on each attempt
  {
    const pluginFile = byMarker("async function buildCodexPluginThreadConfig(params) {");
    let psrc = fs.readFileSync(pluginFile, "utf8");
    const disabled = "\tif (!policy.enabled) return emptyPluginThreadConfig({";
    const inventory = "\tlet inventory = policy.pluginPolicies.length > 0 ? await readCodexPluginInventory({";
    assert(psrc.includes(disabled) && psrc.includes(inventory), "plugin thread config anchors missing");
    psrc = psrc.replace(disabled, `\tif (!policy.enabled) console.error("[vprof-plugins] " + JSON.stringify({ branch: "disabled", at: Date.now() }));\n${disabled}`)
      .replace(inventory, `\tconsole.error("[vprof-plugins] " + JSON.stringify({ branch: "inventory", plugins: policy.pluginPolicies.length, at: Date.now() }));\n${inventory}`);
    fs.writeFileSync(pluginFile, psrc);
  }
  // every app-server request, by method and duration
  const clientFiles = fs.readdirSync(codexDist).filter((f) => f.endsWith(".js") && fs.readFileSync(path.join(codexDist, f), "utf8").includes("\trequest(method, params, optionsInput) {"));
  assert(clientFiles.length, "app-server client request() not found");
  for (const clientName of clientFiles) {
  const clientFile = path.join(codexDist, clientName);
  let csrc = fs.readFileSync(clientFile, "utf8");
  csrc = csrc.replace("\trequest(method, params, optionsInput) {", `\trequest(method, params, optionsInput) {
		const __t = Date.now(), __m = Number(process.hrtime.bigint() / 1000n);
		const __p = this.__vprofRequest(method, params, optionsInput);
		Promise.resolve(__p).then(() => __vprofRpc(method, __t, __m, "ok"), () => __vprofRpc(method, __t, __m, "error"));
		return __p;
	}
	__vprofRequest(method, params, optionsInput) {`);
  fs.writeFileSync(clientFile, clientFile === attemptFile ? csrc : `${csrc}\n${helper}`);
  }
}

// ---- writer-hold probe in the private core runtime copy (same probe as agent-db-lock-holders) ----
{
  const marker = "function logSlowTransactionHold(params) {";
  const name = fs.readdirSync(dist).find((f) => /^node-sqlite-.*\.js$/u.test(f) && fs.readFileSync(path.join(dist, f), "utf8").includes(marker));
  assert(name, "logSlowTransactionHold not found");
  const file = path.join(dist, name);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(marker, `${marker}
	if (params.elapsedMs >= ${HOLD_PROBE_MS}) console.error("[hold-probe] " + JSON.stringify({ ms: params.elapsedMs, op: params.options?.operationLabel ?? null, db: params.options?.databaseLabel ?? null, at: Date.now(), pid: process.pid, stack: String(new Error().stack).split("\\n").slice(2, 16).map((s) => s.trim().replace(/^at /u, "").replace(/\\(file:[^)]*\\/dist\\//u, "(")).join(" < ") }));`));
}

// ---- configuration: shared VLab's (V's) config, no channels, no cron, one Worker ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.bindings = [];
config.cron = { ...(config.cron ?? {}), enabled: false };
const codexCommand = config.plugins?.entries?.codex?.config?.appServer?.command;
assert(codexCommand && fs.existsSync(codexCommand), `codex binary missing: ${codexCommand}`);
const makaron = config.agents?.entries?.makaron;
assert(makaron?.agentDir, "makaron agent missing");
const aliases = Object.entries({ ...config.agents.defaults.models, ...makaron.models }).filter(([, v]) => v?.alias === ALIAS);
assert.equal(aliases.length, 1, `shared config /${ALIAS} does not resolve to one model`);
const [[MODEL, aliasRow]] = aliases;
assert.equal(aliasRow.agentRuntime?.id, "codex", `/${ALIAS} does not run on the codex runtime`);
// `agent --model` is checked against modelPolicy.allow, which Feishu aliases bypass; shared VLab's
// list lacks the DeepSeek flash ref behind /vds, so admit the driven model in this private copy
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
if (workerPlugin?.workerConfigPath) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8")
    .replaceAll(sharedState, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {};
  if (CODEX_PLUGINS_OFF) Object.assign(workerConfig, disableCodexPlugins(workerConfig).config);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
let pluginsChange = null;
if (CODEX_PLUGINS_OFF) {
  const r = disableCodexPlugins(config);
  assert.equal(r.changed, true, `shared config codexPlugins not changed: ${r.reason}`);
  Object.assign(config, r.config);
  pluginsChange = { gateway: r.reason, enabled: config.plugins.entries.codex.config.codexPlugins.enabled };
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- Codex home: the shared one's config, plugin and skill caches; no threads or logs ----
{
  const src = path.join(sharedState, "agents", "makaron", "agent", "codex-home");
  const dst = path.join(makaron.agentDir, "codex-home");
  fs.mkdirSync(dst, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dst, "config.toml"), fs.readFileSync(path.join(src, "config.toml"), "utf8").replaceAll(sharedState, stateDir), { mode: 0o600 });
  for (const entry of ["plugins", "cache", "skills", "models_cache.json"]) {
    if (fs.existsSync(path.join(src, entry))) fs.cpSync(path.join(src, entry), path.join(dst, entry), { recursive: true });
  }
}

// ---- private makaron database: auth and other non-session tables + one large session ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });
let bigSessionId;
{
  const db = new DatabaseSync(srcPath, { readOnly: true });
  bigSessionId = db.prepare("SELECT current_session_id id FROM session_nodes WHERE session_key = ?").get(BIG_SESSION_KEY)?.id;
  db.close();
  assert(bigSessionId, `${BIG_SESSION_KEY} is not in the shared VLab mirror`);
}
function buildPrivateDatabase(sessionIds) {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec);
  dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  const ids = new Set(sessionIds);
  const keys = new Set(sessionIds.map((id) => src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(id)?.session_key).filter(Boolean));
  const convs = new Set();
  for (const id of ids) {
    for (const r of src.prepare("SELECT conversation_id FROM session_conversations WHERE session_id = ?").all(id)) convs.add(r.conversation_id);
    const w = src.prepare("SELECT primary_conversation_id FROM session_windows WHERE session_id = ?").get(id);
    if (w?.primary_conversation_id) convs.add(w.primary_conversation_id);
  }
  const copied = {};
  const inList = (col, set) => `"${col}" IN (${[...set].map(() => "?").join(",")})`;
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    // Stored OAuth credentials stay behind: the mirror's copy is stale, and refreshing with an
    // already-rotated refresh token is refused by OpenAI (seen 2026-09-30, refresh_token_reused).
    if (t.name.startsWith("auth_profile_")) continue;
    let where = "", args = [];
    if (ALL_SESSION_METADATA && ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members"].includes(t.name)) { where = ""; args = []; }
    else if (cols.includes("session_id")) { where = inList("session_id", ids); args = [...ids]; }
    else if (cols.includes("session_key")) { where = inList("session_key", keys); args = [...keys]; }
    else if (cols.includes("conversation_id")) {
      if (!convs.size) continue;
      where = inList("conversation_id", convs); args = [...convs];
    }
    const list = cols.map((c) => `"${c}"`).join(",");
    const rows = src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).all(...args);
    if (!rows.length) continue;
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of rows) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
    copied[t.name] = rows.length;
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  const bytes = src.prepare("SELECT count(*) n, sum(length(event_json)) b FROM transcript_events WHERE session_id = ?").get(sessionIds[0]);
  const entries = dst.prepare("SELECT count(*) n, sum(length(entry_json)) b FROM session_nodes").get();
  src.close();
  dst.close();
  return { copied, bigSession: { events: bytes.n, mb: Math.round(bytes.b / 1e5) / 10 }, sessionEntries: { n: entries.n, mb: Math.round((entries.b ?? 0) / 1e5) / 10 } };
}
const built = buildPrivateDatabase([bigSessionId]);

// ---- private Gateway under the CPU profiler ----
// "profiler" turns on codex.profiler and reply.profiler; both only log stages over 500 ms / turns over 1 s
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_DIAGNOSTICS: "profiler" };
// extra Node flags for the Gateway only, e.g. GATEWAY_NODE_FLAGS=--experimental-async-context-frame
const GATEWAY_NODE_FLAGS = (process.env.GATEWAY_NODE_FLAGS ?? "").split(/\s+/u).filter(Boolean);
const lines = [];
let gateway, gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, [...GATEWAY_NODE_FLAGS, "--max-old-space-size=8192", "--cpu-prof", `--cpu-prof-dir=${PROFILE_DIR}`, "--cpu-prof-interval=1000", cli, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 60_000) lines.splice(0, lines.length - 60_000);
    });
  }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
        });
        client.start();
      });
      return;
    } catch (error) { lastError = error; client?.stop(); await sleep(1_000); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}

async function turn(sessionKey, label) {
  const started = Date.now();
  const child = spawn(process.execPath, [cli, "agent", "--agent", "makaron", "--session-key", sessionKey, "--model", MODEL,
    "--message", `（自动化测速 ${label}）不要调用任何工具，只回复：收到 ${label}`, "--json", "--timeout", "300"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const exit = await new Promise((resolve) => child.on("close", resolve));
  let reply = "";
  try { const o = JSON.parse(stdout.slice(stdout.indexOf("{"))); reply = ((o.result ?? o).payloads ?? []).map((p) => p.text ?? "").join(" "); } catch {}
  return { label, sessionKey, exit, wallMs: Date.now() - started, started, reply: reply.slice(0, 60), stderr: exit === 0 ? undefined : redact(stderr).slice(-400) };
}

// ---- analysis ----
const parseTagged = (tag) => lines.filter((l) => l.line.includes(`[${tag}] `)).map((l) => {
  try { return JSON.parse(l.line.slice(l.line.indexOf(`[${tag}] `) + tag.length + 3)); } catch { return null; }
}).filter(Boolean);
function trajectoryFor(sessionKey, since, runId) {
  const d = new DatabaseSync(dstPath, { readOnly: true });
  try {
    const sid = d.prepare("SELECT current_session_id id FROM session_nodes WHERE session_key = ?").get(sessionKey)?.id;
    if (!sid) return null;
    const ev = {};
    // only this turn's run: a back-to-back previous turn's events fall inside the `since` margin
    for (const r of d.prepare("SELECT event_json, created_at FROM trajectory_runtime_events WHERE session_id = ? AND run_id = ? AND created_at >= ? ORDER BY seq").all(sid, runId, since)) {
      const j = JSON.parse(r.event_json);
      ev[j.type] ??= r.created_at;
    }
    const user = d.prepare("SELECT created_at FROM transcript_events WHERE session_id = ? AND created_at >= ? AND json_extract(event_json, '$.message.role') = 'user' ORDER BY seq LIMIT 1").get(sid, since)?.created_at;
    return { runId, user, ...ev };
  } finally { d.close(); }
}

const newKey = `agent:makaron:feishu:direct:ou_vcodexprobe_${Date.now()}`;
const turns = [];
startGateway();
try {
  await connectGateway();
  await sleep(20_000); // let startup work settle before the first turn
  for (let i = 1; i <= NEW_TURNS; i++) turns.push(await turn(newKey, `new-${i}`));
  for (let i = 1; i <= BIG_TURNS; i++) turns.push(await turn(BIG_SESSION_KEY, `big-${i}`));
  await sleep(3_000);
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  client?.stop();
  gateway.kill("SIGINT");
  for (let i = 0; i < 60 && gateway.exitCode === null; i++) await sleep(1_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}

const marks = parseTagged("vprof");
const rpcs = parseTagged("vprof-rpc");
const profiles = fs.readdirSync(PROFILE_DIR).filter((f) => f.endsWith(".cpuprofile")).map((f) => path.join(PROFILE_DIR, f));
// The Gateway process's profile is the big one; CLI children are not profiled (no --cpu-prof on them).
const profile = profiles.length ? JSON.parse(fs.readFileSync(profiles.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0], "utf8")) : null;
// wall ms -> profiler µs: every mark carries both clocks
const offsets = marks.map((m) => m.mono - m.at * 1000);
const monoOf = (wallMs) => offsets.length ? wallMs * 1000 + offsets[0] : null;
function cpuIn(fromWall, toWall) {
  if (!profile || fromWall == null || toWall == null) return null;
  const from = monoOf(fromWall), to = monoOf(toWall);
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let t = profile.startTime, total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    if (t < from || t > to) continue;
    const n = byId.get(profile.samples[i]);
    const cf = n.callFrame;
    const key = cf.functionName && !cf.functionName.startsWith("(") ? `${cf.functionName} ${path.basename(cf.url || "")}:${cf.lineNumber + 1}` : cf.functionName || "(anonymous)";
    self.set(key, (self.get(key) ?? 0) + profile.timeDeltas[i]);
    total += profile.timeDeltas[i];
  }
  const ms = (us) => Math.round(us / 1000);
  const idle = self.get("(idle)") ?? 0;
  return { windowMs: Math.round(toWall - fromWall), sampledMs: ms(total), idleMs: ms(idle), busyMs: ms(total - idle),
    top: [...self.entries()].filter(([k]) => k !== "(idle)").sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${ms(v)}ms ${k}`) };
}

const holds = parseTagged("hold-probe");
const TURN_TIMING = /agent turn (timings|milestone)/u;
const report = turns.map((t) => {
  const end = t.started + t.wallMs;
  const own = marks.filter((x) => x.at >= t.started && x.at <= end && x.stage === "attempt-begin");
  const runId = own[0]?.runId;
  const tr = { ...(runId ? trajectoryFor(t.sessionKey, t.started - 1000, runId) ?? {} : {}), runId };
  const m = marks.filter((x) => x.runId && x.runId === runId);
  const at = Object.fromEntries(m.map((x) => [x.stage, x.at]));
  const order = ["attempt-begin", "connection", "runtime", "tools", "context", "prompt", "thread-ready", "route", "turn-request", "turn-started"];
  const stages = {};
  const fallbackLine = lines.find((l) => l.at >= t.started && l.at <= end && l.line.includes(`run=${runId}`));
  let prev = t.started;
  let first = true;
  for (const s of order) {
    if (at[s] == null) continue;
    stages[first ? "cli->attempt-begin" : s] = at[s] - prev;
    first = false;
    prev = at[s];
  }
  const turnStart = at["turn-started"] ?? end;
  const windowRpcs = rpcs.filter((r) => r.at >= t.started && r.at <= turnStart)
    .map((r) => `${r.method} ${r.ms}ms${r.status === "ok" ? "" : " " + r.status} @+${r.at - t.started}`);
  const windowHolds = holds.filter((h) => h.at >= t.started && h.at <= turnStart)
    .map((h) => `${h.ms}ms ${h.op ?? "-"} pid${h.pid} @+${h.at - t.started} ${h.stack.split(" < ").filter((f) => !/node-sqlite-|TransactionSync|withAgentDbProcessWriter|agent-db-process-coordinator|runWithSqliteBusyTimeout|logSlowTransactionHold/u.test(f)).slice(0, 4).join(" < ")}`);
  return {
    label: t.label, exit: t.exit, reply: t.reply, stderr: t.stderr, wallMs: t.wallMs,
    runId,
    cliToRunLogMs: fallbackLine ? fallbackLine.at - t.started : null,
    cliToTurnStartedMs: at["turn-started"] ? at["turn-started"] - t.started : null,
    turnStartedToModelCompletedMs: at["turn-started"] && tr["model.completed"] ? tr["model.completed"] - at["turn-started"] : null,
    stages, rpcs: windowRpcs,
    turnTimings: runId ? lines.filter((l) => l.line.includes(`runId=${runId}`) && TURN_TIMING.test(l.line)).map((l) => redact(l.line).replace(/^.*?(agent turn)/u, "$1").slice(0, 600)) : [], holds: windowHolds.slice(0, 12),
    cpuPreTurn: cpuIn(t.started, turnStart),
  };
});
const profilerLines = lines.filter((l) => /pre-dynamic startup timings|dynamic tool build timings/u.test(l.line)).map((l) => redact(l.line).replace(/^.*?(codex app-server)/u, "$1").slice(0, 600));
const replyProfilerLines = lines.filter((l) => /reply (hot path|resolver) timings/u.test(l.line)).map((l) => redact(l.line).replace(/^.*?(reply )/u, "$1").slice(0, 600));
const pluginBranches = parseTagged("vprof-plugins").map((x) => x.branch);
const pluginRpcs = rpcs.filter((r) => /^(plugin|app)\//u.test(r.method)).map((r) => r.method);
console.log(JSON.stringify({ codexPluginsOff: CODEX_PLUGINS_OFF, pluginsChange, pluginBranches, pluginRpcs, alias: ALIAS, model: MODEL, allSessionMetadata: ALL_SESSION_METADATA, bigSession: built.bigSession, sessionEntries: built.sessionEntries, gatewayNodeFlags: GATEWAY_NODE_FLAGS, profile: profile ? { samples: profile.samples.length } : null, turns: report, codexProfiler: profilerLines.slice(0, 12), replyProfiler: replyProfilerLines.slice(0, 20) }, null, 1));
assert(turns.some((t) => t.exit === 0), "no vcodex turn completed; nothing was measured");
assert(report.some((r) => r.cliToTurnStartedMs != null), "no stage marks were captured; the probes did not load");
assert(turns.every((t) => t.exit === 0), "a turn failed");
if (CODEX_PLUGINS_OFF) {
  // the fix must be exercised: every attempt took the disabled branch, none read the inventory
  assert(pluginBranches.length >= turns.length, `plugin thread config not built on every turn: ${JSON.stringify(pluginBranches)}`);
  assert(pluginBranches.every((b) => b === "disabled"), `plugin inventory still read: ${JSON.stringify(pluginBranches)}`);
  assert.deepEqual(pluginRpcs, [], "plugin/app RPCs still issued");
}
