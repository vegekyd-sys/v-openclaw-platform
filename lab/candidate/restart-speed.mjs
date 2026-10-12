// Candidate measurement for a V Gateway restart: stop -> usable. A private Gateway with V's
// process flags, DB91 environment and Worker pool size, started RUNS times after one warm-up
// start (state migrations). Each run records the startup marks V's journal carries, the
// stop time, and when a client hello succeeds; CPU_PROF=1 adds where each phase spends its
// time (Gateway main thread and the first Worker). No channels, no cron, model port closed:
// the restart path, not traffic. DB=meta builds makaron's session metadata (V-sized session
// store, no transcripts); DB=none starts with an empty agent directory.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const stateRoot = stateDir && fs.realpathSync(stateDir);
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const RUNS = Number(process.env.RUNS ?? 2);
const WORKERS = Number(process.env.WORKERS ?? 5);
const DB = process.env.DB ?? "meta";
const CPU_PROF = process.env.CPU_PROF === "1";
const EXTRA_NODE_FLAGS = (process.env.EXTRA_NODE_FLAGS ?? "").split(/\s+/u).filter(Boolean);
const EXTRA_ENV = JSON.parse(process.env.EXTRA_ENV ?? "{}");
const MODEL = "deepseek/deepseek-flash";
// REAL_TURN=1: keep the real model and, after the last restart, run one Worker turn that must
// call exec and answer with the command output (the restart path still serves real turns).
const REAL_TURN = process.env.REAL_TURN === "1";
const V_SECRET_REFS = process.env.V_SECRET_REFS === "1";
const SAFETY = process.env.SAFETY === "1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");

// ---- configuration: V's routing, no model, no channels ----
const dead = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  if (!REAL_TURN) deepseek.baseUrl = `http://127.0.0.1:${dead}/v1`;
  const model = { primary: MODEL, fallbacks: [] };
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent; }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  if (V_SECRET_REFS) { // V's agent-runtime SecretRefs (shared VLab has none): a Worker's runtime config resolves them via the Gateway
    ((config.plugins ??= {}).entries ??= {}).google ??= { enabled: true };
    ((config.plugins.entries.google.config ??= {}).webSearch ??= {}).apiKey = { source: "env", provider: "default", id: "GOOGLE_API_KEY" };
    ((config.secrets ??= {}).providers ??= {}).default = { source: "env", allowlist: ["GOOGLE_API_KEY"] };
  }
  config.session = { ...(config.session ?? {}), maintenance: { mode: runtimeId === "openclaw" ? "warn" : "enforce", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "32gb" } };
  return config;
}
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured; production runs turns in Workers");
// V: minWorkers 5, maxWorkers 15, sessionsPerWorker 3
Object.assign(workerPlugin, { minWorkers: WORKERS, maxWorkers: Math.max(WORKERS, 15), sessionsPerWorker: 3 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- private makaron database: every session's metadata, no transcripts ----
function buildPrivateDatabase() {
  const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
  const srcPath = path.join(sharedState, dbRel);
  const dstPath = path.join(stateDir, dbRel);
  if (fs.existsSync(dstPath)) return { reused: true };
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  const META = ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members"];
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec); dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    if (!META.includes(t.name) && (cols.includes("session_id") || cols.includes("session_key") || cols.includes("conversation_id"))) continue;
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}"`).iterate()) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  const n = dst.prepare("SELECT count(*) n FROM session_nodes").get().n;
  src.close(); dst.close();
  return { sessions: n, bytes: fs.statSync(dstPath).size };
}

// ---- private Gateway, launched like V's unit ----
const profDir = path.join(stateDir, "cpu-prof");
const env = {
  ...process.env,
  OPENCLAW_GATEWAY_PORT: String(port),
  OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1",
  OPENCLAW_DB91_INTEGRITY_ENABLE: "1",
  OPENCLAW_DB91_INTEGRITY_STATE_ROOT: stateRoot,
  OPENCLAW_DB91_PROVENANCE_ENABLE: "1",
  OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE: "1",
  OPENCLAW_DB91_MAINTENANCE_ENABLE: "1",
  OPENCLAW_DB91_READ_AHEAD_ENABLE: "1",
  OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE: "1",
  OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE: "1",
  OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE: "1",
  // V's delegated verifier cgroup (94-verifier-resource-group) does not exist in a candidate
  // process group; without it the native verifier runs unconfined, as on shared VLab before 9/10.
  OPENCLAW_CONFIG_PATH: configPath,
  ...(V_SECRET_REFS && !process.env.GOOGLE_API_KEY ? { GOOGLE_API_KEY: "restart-speed-placeholder" } : {}),
  ...EXTRA_ENV,
};
const lines = [];
let gateway;
function startGateway(prof) {
  const flags = ["--experimental-async-context-frame", "--max-old-space-size=12288", ...EXTRA_NODE_FLAGS];
  const runEnv = prof ? { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --cpu-prof --cpu-prof-dir=${profDir} --cpu-prof-interval=1000`.trim() } : env;
  gateway = spawn(process.execPath, [...flags, `${dist}/index.js`, "gateway", "--port", String(port)], { env: runEnv, stdio: ["ignore", "pipe", "pipe"] });
  const startedAt = Date.now();
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    let rest = "";
    s.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u); rest = parts.pop();
      for (const line of parts.filter(Boolean)) lines.push({ at: Date.now(), line: line.replace(/\x1b\[[0-9;]*m/gu, "") });
      if (lines.length > 80_000) lines.splice(0, lines.length - 80_000);
    });
  }
  return startedAt;
}
let GatewayClient;
async function helloOnce(timeoutMs = 3000) {
  GatewayClient ??= (await import(`${dist}/plugin-sdk/gateway-runtime.js`)).GatewayClient;
  let client;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("hello timeout")), timeoutMs);
      client = new GatewayClient({
        url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
        scopes: ["operator.admin", "operator.read", "operator.write"],
        onHelloOk: () => { clearTimeout(timeout); resolve(); },
        onConnectError: (error) => { clearTimeout(timeout); reject(error); },
      });
      client.start();
    });
    return true;
  } catch { return false; } finally { client?.stop(); }
}
const MARKS = [
  ["preflightStart", /\[db91-integrity\] preflight start/u],
  ["preflightEnd", /\[db91-integrity\] preflight passed/u],
  ["loadingConfig", /\[gateway\] loading configuration/u],
  ["starting", /\[gateway\] starting\.\.\./u],
  ["httpStarting", /\[gateway\] starting HTTP server/u],
  ["channelsStarting", /\[gateway\] starting channels and sidecars/u],
  ["httpListening", /\[gateway\] http server listening/u],
  ["firstPoolSpawn", /"stage":"pool-spawn"/u],
  ["firstPoolReady", /"stage":"pool-ready"/u],
  ["gatewayReady", /\[gateway\] ready/u],
];
async function measuredStart(prof) {
  const from = lines.length;
  const t0 = startGateway(prof);
  let hello = null;
  const deadline = t0 + 1_800_000;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    const seen = lines.slice(from);
    if (hello === null && seen.some((l) => /http server listening/u.test(l.line)) && await helloOnce()) hello = Date.now() - t0;
    if (seen.some((l) => /\[gateway\] ready/u.test(l.line)) && seen.filter((l) => /"stage":"pool-ready"/u.test(l.line)).length >= WORKERS) break;
    await sleep(250);
  }
  if (hello === null && await helloOnce()) hello = Date.now() - t0;
  const seen = lines.slice(from);
  const marks = {};
  for (const [name, re] of MARKS) { const l = seen.find((x) => re.test(x.line)); if (l) marks[name] = l.at - t0; }
  const ready = seen.filter((l) => /"stage":"pool-ready"/u.test(l.line)).map((l) => l.at - t0);
  marks.allPoolReady = ready.length >= WORKERS ? ready[WORKERS - 1] : null;
  marks.hello = hello;
  const prewarm = seen.filter((l) => l.line.includes("[worker-runtime-prewarm")).map((l) => { try { const j = JSON.parse(l.line.slice(l.line.indexOf("{"))); return { ms: j.ms, preparedMs: j.preparedMs, pid: j.pid, fastPath: j.distResolveFastPath, compileCache: j.compileCache, status: j.status, secrets: j.secretsPrepared }; } catch { return null; } }).filter(Boolean);
  const preflight = seen.find((l) => /preflight passed in (\d+)ms/u.test(l.line))?.line.match(/passed in (\d+)ms/u)?.[1];
  const carry = seen.find((l) => l.line.includes("clean-restart carry"))?.line.replace(/^.*clean-restart carry: /u, "") ?? null;
  return { t0, marks, prewarm, preflightMs: preflight ? Number(preflight) : null, carry, receipts: receipts() };
}
// receipts of the current lifecycle: who produced each one (full check, carried, verifier)
function receipts() {
  try {
    const base = path.join(stateRoot, ".db91-integrity");
    const pointer = JSON.parse(fs.readFileSync(path.join(base, "last-lifecycle.json"), "utf8"));
    const dir = path.join(base, pointer.epoch);
    return fs.readdirSync(dir).filter((f) => /^[a-f0-9]{64}\.json$/u.test(f)).map((f) => { const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); return { agent: r.identity?.agentId, source: r.source, ageS: Math.round((Date.now() - r.checkedAt) / 1000), carriedFrom: r.carriedFrom ? r.carriedFrom.slice(0, 8) : undefined }; });
  } catch (error) { return `unavailable: ${error.code ?? error.message}`; }
}
async function stopGateway() {
  if (!gateway || gateway.exitCode !== null) return null;
  const t = Date.now();
  gateway.kill("SIGTERM");
  for (let i = 0; i < 120 && gateway.exitCode === null; i += 1) await sleep(250);
  if (gateway.exitCode === null) { gateway.kill("SIGKILL"); await sleep(500); return { stopMs: Date.now() - t, killed: true }; }
  // KillMode=control-group: leftover Workers die with the unit; here they are our children
  return { stopMs: Date.now() - t, exitCode: gateway.exitCode, signal: gateway.signalCode };
}

async function realTurn() {
  // The answer is a fresh random UUID only the command can produce; the transcript must show
  // the exec call and its result, and the Worker must have run the turn.
  const sessionKey = `agent:makaron:explicit:vlab-dev-restart-speed-${Date.now()}`;
  const from = lines.length;
  const started = Date.now();
  const r = await new Promise((resolve) => {
    const child = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey, "--message",
      "这是一次自动化测试，请严格照做：用 exec 工具运行命令 cat /proc/sys/kernel/random/uuid，然后只回复命令输出的那一行，不要其他文字。", "--json", "--timeout", "300"],
      { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (c) => { out += c; }); child.stderr.on("data", (c) => { err += c; });
    child.on("exit", (code) => resolve({ code, out, err }));
  });
  let meta; try { meta = JSON.parse(r.out.slice(r.out.indexOf("{"))); } catch {}
  const payloads = (meta?.result?.payloads ?? meta?.payloads ?? []).map((p) => String(p?.text ?? ""));
  const answer = payloads.join("\n").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u)?.[0] ?? null;
  const transcript = (() => {
    const db = new DatabaseSync(path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite"), { readOnly: true });
    try {
      const node = db.prepare("select current_session_id as id from session_nodes where session_key = ?").get(sessionKey);
      if (!node) return { found: false };
      const events = db.prepare("select event_json from transcript_events where session_id = ? order by seq").all(node.id).map((e) => JSON.stringify(JSON.parse(e.event_json)));
      return { found: true, execCall: events.some((e) => /"toolCall"/u.test(e) && /"exec"|"bash"/u.test(e)), resultHasAnswer: answer !== null && events.some((e) => /toolResult|tool_result/u.test(e) && e.includes(answer)) };
    } finally { db.close(); }
  })();
  const workerLines = lines.slice(from).filter((l) => l.line.startsWith("[vlab-worker:")).length;
  return { secs: Math.round((Date.now() - started) / 100) / 10, exit: r.code, answer: Boolean(answer), ...transcript, workerLines, provider: meta?.result?.meta?.agentMeta?.provider ?? meta?.meta?.agentMeta?.provider, stderr: r.code === 0 ? undefined : redact(r.err).slice(-600) };
}

// ---- profile windows ----
function profileWindows(file, windows) {
  const p = JSON.parse(fs.readFileSync(file, "utf8"));
  const endWall = fs.statSync(file).mtimeMs;
  const byId = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => `${n.callFrame.functionName || "(anon)"} ${(n.callFrame.url || "").replace(/^.*\/(dist|node_modules|production-worker)\//u, "$1/").replace(/-[A-Za-z0-9_]{8}\.js$/u, "")}:${n.callFrame.lineNumber + 1}`;
  const generic = /^(\(root\)|\(program\)|\(anon\)|runMicrotasks|processTicksAndRejections|run|bound|next|all|fn)$/u;
  const out = Object.fromEntries(windows.map((w) => [w.name, { ms: Math.round(w.to - w.from), busy: 0, idle: 0, gc: 0, files: new Map(), incl: new Map(), self: new Map() }]));
  let t = p.startTime;
  p.samples.forEach((id, i) => {
    t += p.timeDeltas[i];
    const wall = endWall - (p.endTime - t) / 1000; const dt = (p.timeDeltas[i + 1] ?? 1000) / 1000;
    const w = windows.find((x) => wall >= x.from && wall < x.to); if (!w) return;
    const a = out[w.name]; const n = byId.get(id); const fn = n.callFrame.functionName;
    if (fn === "(idle)") { a.idle += dt; return; }
    if (fn === "(garbage collector)") a.gc += dt;
    a.busy += dt; a.self.set(label(n), (a.self.get(label(n)) ?? 0) + dt);
    const seen = new Set();
    for (let c = id; c !== undefined; c = parent.get(c)) {
      const node = byId.get(c); if (generic.test(node.callFrame.functionName || "(anon)")) continue;
      const k = label(node); if (seen.has(k)) continue; seen.add(k); a.incl.set(k, (a.incl.get(k) ?? 0) + dt);
    }
    const f = (n.callFrame.url || fn).replace(/^.*\/(dist|node_modules|production-worker)\//u, "$1/").replace(/-[A-Za-z0-9_]{8}\.js$/u, "");
    a.files.set(f, (a.files.get(f) ?? 0) + dt);
  });
  const top = (m, k) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([x, v]) => `${Math.round(v)} ${x}`);
  return Object.fromEntries(Object.entries(out).map(([k, a]) => [k, { ms: a.ms, busyMs: Math.round(a.busy), idleMs: Math.round(a.idle), gcMs: Math.round(a.gc), topSelf: top(a.self, 20), topInclusive: top(a.incl, 30), topFiles: top(a.files, 15) }]));
}

console.log(JSON.stringify({ env: Object.keys(process.env).filter((k) => /^(OPENCLAW|VLAB)_/u.test(k)).sort(), node: process.version, nproc: (await import("node:os")).cpus().length }));
const built = DB === "meta" ? buildPrivateDatabase() : { none: true };
const results = [];
try {
  // warm-up: state migrations, Worker config, private databases
  await measuredStart(false);
  await sleep(10_000);
  results.push({ warmupStop: await stopGateway() });
  for (let run = 1; run <= RUNS; run += 1) {
    if (CPU_PROF) fs.rmSync(profDir, { recursive: true, force: true });
    const start = await measuredStart(CPU_PROF && run === RUNS);
    await sleep(CPU_PROF && run === RUNS ? 2_000 : 20_000);
    const turn = REAL_TURN && run === RUNS ? await realTurn() : undefined;
    const gatewayPid = gateway.pid;
    const stop = await stopGateway();
    const r = { run, ...start, stop, turn };
    if (CPU_PROF && run === RUNS) {
      await sleep(3_000);
      const files = fs.existsSync(profDir) ? fs.readdirSync(profDir) : [];
      const m = start.marks; const t0 = start.t0;
      const at = (k, fallback) => t0 + (m[k] ?? fallback);
      const gw = files.find((f) => f.includes(`.${gatewayPid}.`));
      if (gw) r.gatewayProfile = profileWindows(path.join(profDir, gw), [
        { name: "a_boot_to_preflight", from: t0, to: at("preflightStart", 0) },
        { name: "b_preflight", from: at("preflightStart", 0), to: at("preflightEnd", m.preflightStart ?? 0) },
        { name: "c_preflight_to_loadingConfig", from: at("preflightEnd", 0), to: at("loadingConfig", 0) },
        { name: "d_loadingConfig_to_httpStarting", from: at("loadingConfig", 0), to: at("httpStarting", 0) },
        { name: "e_httpStarting_to_listening", from: at("httpStarting", 0), to: at("httpListening", 0) },
        { name: "f_listening_to_ready", from: at("httpListening", 0), to: at("gatewayReady", 0) },
      ]);
      const workerPid = start.prewarm[0]?.pid;
      const wk = workerPid && files.find((f) => f.includes(`.${workerPid}.`));
      if (wk) r.workerProfile = profileWindows(path.join(profDir, wk), [{ name: "worker_spawn_to_ready", from: t0 + (m.firstPoolSpawn ?? 0), to: t0 + (m.firstPoolReady ?? 0) }]);
      r.profiles = files.length;
    }
    results.push(r);
    console.log(JSON.stringify(r));
  }
  if (SAFETY) {
    // 1) a crash (SIGKILL of the Gateway and its Workers) is never carried: full check before admission
    await measuredStart(false);
    const children = spawnSync("pgrep", ["-P", String(gateway.pid)], { encoding: "utf8" }).stdout.split(/\s+/u).filter(Boolean).map(Number);
    gateway.kill("SIGKILL");
    for (const pid of children) { try { process.kill(pid, "SIGKILL"); } catch {} }
    for (let i = 0; i < 40 && gateway.exitCode === null && gateway.signalCode === null; i += 1) await sleep(250);
    await sleep(2_000);
    const afterCrash = await measuredStart(false);
    // 2) the native verifier (5 min after start) re-checks the database in full and replaces the receipt
    const deadline = Date.now() + 480_000;
    const mark = lines.length;
    await stopGateway();
    const verified = await measuredStart(false);
    while (Date.now() < deadline && !lines.slice(mark).some((l) => /database integrity verification (passed|failed)|integrity verifier failed/u.test(l.line))) await sleep(2_000);
    const verifierLines = lines.slice(mark).filter((l) => /database-verify/u.test(l.line)).map((l) => redact(l.line).slice(0, 200));
    results.push({ safety: {
      afterCrash: { carry: afterCrash.carry, preflightMs: afterCrash.preflightMs, receipts: afterCrash.receipts },
      afterCleanStop: { carry: verified.carry, preflightMs: verified.preflightMs },
      verifierLines, receiptsAfterVerifier: receipts(),
    } });
    console.log(JSON.stringify(results.at(-1)));
  }
} finally {
  await stopGateway();
}
console.log(JSON.stringify({ built, workers: WORKERS, db: DB, safety: results.find((r) => r.safety)?.safety, runs: results.filter((r) => r.run).map((r) => ({ run: r.run, preflightMs: r.preflightMs, carry: r.carry, receipts: r.receipts, ...r.marks, stopMs: r.stop?.stopMs, prewarmMs: r.prewarm.map((p) => p.ms), preparedMs: r.prewarm.map((p) => p.preparedMs), turn: r.turn, workerFlags: [...new Set(r.prewarm.map((p) => `${p.status}/${p.fastPath}/${p.compileCache}/${p.secrets}`))] })) }, null, 1));
