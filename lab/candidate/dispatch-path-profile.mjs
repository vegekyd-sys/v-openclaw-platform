// Candidate profile of the Gateway side of a Feishu-like burst: six messages to six group
// sessions at once, on V's default route (vlab-worker, deepseek-flash), with V-sized session
// metadata and the mirror's worker placements. It answers two questions for
// first-token-regression-20261005:
//   1. how much later does a burst reach the model when it lands on the 60 s placement sweep
//      ("aligned" rounds, sent the moment a sweep starts) than between sweeps ("gap" rounds);
//   2. what else holds the Gateway main thread between chat.send and the Worker's model call
//      (CPU profile of the Gateway over all rounds, attributed per round).
// The model endpoint is a closed local port, so every run ends at its first model call; the
// measured span is chat.send -> the Worker's first model-call-enter for that run.
// Run it against the unpatched runtime and against lab/release-files/placement-evidence-absence.
// It reports; it asserts only that every run reached the model and that sweeps were seen.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const CYCLES = Number(process.env.CYCLES ?? 3); // each cycle: one aligned round, one gap round
const GROUPS = CONCURRENCY * CYCLES * 2;
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const placementFile = path.join(dist, "server-worker-placement-startup-BvPREvpr.js");
const accessorFile = path.join(dist, "session-accessor-K0XuW6ln.js");
const PATCH = fs.readFileSync(accessorFile, "utf8").includes("function readSessionIdentityAbsenceRows(") ? "on" : "off";
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const inspectPort = await freePort();

// ---- probe: when each placement sweep starts and how long its evidence read takes ----
{
  let src = fs.readFileSync(placementFile, "utf8");
  const head = "async function createWorkerPlacementSessionEvidenceResolver(placements) {";
  assert.equal(src.split(head).length - 1, 1, "resolver anchor not found exactly once");
  src = src.replace(head, `async function createWorkerPlacementSessionEvidenceResolver(placements) {
	const __at = Date.now(), __t0 = performance.now();
	console.error("[pe-sweep-start] " + JSON.stringify({ at: __at, placements: placements.length }));
	try { return await __peResolveEvidence(placements); } finally { console.error("[pe-sweep] " + JSON.stringify({ at: __at, ms: Math.round(performance.now() - __t0), placements: placements.length })); }
}
async function __peResolveEvidence(placements) {`);
  fs.writeFileSync(placementFile, src);
}

// ---- configuration: V's routing, no model, no channels ----
const dead = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  deepseek.baseUrl = `http://127.0.0.1:${dead}/v1`;
  const model = { primary: MODEL, fallbacks: [] };
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) { config.agents.entries.makaron.model = model; (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent; }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  config.channels = {};
  // V's session maintenance (the shared VLab config caps at 2000 entries, below its 3742
  // sessions, so every session write there scans all sessions for cap candidates; V caps
  // at 6000 with 2529 sessions and Workers only warn)
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
Object.assign(workerPlugin, { minWorkers: 3, maxWorkers: 3, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- private makaron database: every session's metadata, no transcripts ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });
const META = ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members"];
function buildPrivateDatabase() {
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
    // session metadata in full; transcripts are not needed; everything else (database
    // identity, ownership, schema bookkeeping) is copied whole, as the DB91 gate requires
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
  const size = dst.prepare("SELECT count(*) n, sum(length(entry_json)) b FROM session_nodes").get();
  const groups = dst.prepare(`SELECT session_key FROM session_nodes WHERE entry_valid = 1 AND session_key LIKE 'agent:makaron:feishu:group:%' ORDER BY updated_at DESC LIMIT ?`).all(GROUPS).map((r) => r.session_key);
  const live = dst.prepare("SELECT session_key, current_session_id FROM session_nodes WHERE entry_valid = 1 AND session_key LIKE 'agent:makaron:%' ORDER BY updated_at DESC LIMIT 2").all();
  src.close(); dst.close();
  return { sessions: size.n, entryMb: Math.round(size.b / 1048576), live, groups };
}

// ---- placements: the mirror's makaron rows plus the planted three ----
const sharedStateDb = path.join(sharedState, "state", "openclaw.sqlite");
const privateStateDb = path.join(stateDir, "state", "openclaw.sqlite");
function copyPlacements(live) {
  const src = new DatabaseSync(sharedStateDb, { readOnly: true });
  const dst = new DatabaseSync(privateStateDb);
  const cols = dst.prepare("PRAGMA table_info(worker_session_placements)").all().map((c) => c.name);
  assert(cols.length > 0, "the candidate Gateway did not create worker_session_placements");
  const list = cols.map((c) => `"${c}"`).join(",");
  const ins = dst.prepare(`INSERT OR IGNORE INTO worker_session_placements (${list}) VALUES (${cols.map(() => "?").join(",")})`);
  dst.exec("BEGIN");
  let copied = 0;
  for (const r of src.prepare(`SELECT ${list} FROM worker_session_placements WHERE agent_id = 'makaron' AND state = 'local' AND turn_claim_owner IS NULL`).iterate()) { ins.run(...cols.map((c) => r[c])); copied += 1; }
  const now = Date.now();
  const plant = (sessionId, sessionKey) => {
    dst.prepare("DELETE FROM worker_session_placements WHERE session_id = ?").run(sessionId);
    dst.prepare("INSERT INTO worker_session_placements (session_id, agent_id, session_key, state, transition_generation, created_at_ms, updated_at_ms, state_changed_at_ms) VALUES (?, 'makaron', ?, 'local', 0, ?, ?, ?)").run(sessionId, sessionKey, now, now, now);
    return { sessionId, sessionKey };
  };
  const planted = {
    ghost: plant(randomUUID(), `agent:makaron:pe-ghost-${now}`),
    reset: plant(randomUUID(), live[0].session_key),
    live: plant(live[1].current_session_id, live[1].session_key),
  };
  dst.exec("COMMIT");
  const total = dst.prepare("SELECT count(*) n FROM worker_session_placements").get().n;
  src.close(); dst.close();
  return { copied, total, planted };
}
function placementState(sessionId) {
  const db = new DatabaseSync(privateStateDb, { readOnly: true });
  try { return db.prepare("SELECT state, terminal_reason FROM worker_session_placements WHERE session_id = ?").get(sessionId) ?? null; } finally { db.close(); }
}

// ---- private Gateway ----
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) };
const lines = [];
let gateway, client;
function startGateway() {
  gateway = spawn(process.execPath, [`--inspect=127.0.0.1:${inspectPort}`, "--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 60_000) lines.splice(0, lines.length - 60_000);
    });
  }
}
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError, restarted = false;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (!restarted && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { restarted = true; startGateway(); continue; }
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
async function stopGateway() {
  client?.stop();
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  for (let i = 0; i < 60 && gateway.exitCode === null; i += 1) await sleep(500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  await sleep(1_000);
}
const probes = (tag) => lines.filter((l) => l.line.includes(tag)).map((l) => { try { return JSON.parse(l.line.slice(l.line.indexOf("{"))); } catch { return null; } }).filter(Boolean);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
const modelEnter = (runId) => {
  for (const l of lines) {
    if (!l.line.includes("[firsttext-metrics]") || !l.line.includes(runId) || !l.line.includes("model-call-enter")) continue;
    try { return JSON.parse(l.line.slice(l.line.indexOf("{"))).at; } catch {}
  }
  return null;
};

// ---- inspector profiler on the candidate Gateway ----
async function openProfiler() {
  const list = await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
  await new Promise((r) => (ws.onopen = r));
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 1000 });
  const startedAt = Date.now();
  await send("Profiler.start");
  return { startedAt, stop: async () => { const { profile } = await send("Profiler.stop"); ws.close(); return profile; } };
}
const GENERIC = /^(\(root\)|\(program\)|\(anon\)|runMicrotasks|processTicksAndRejections|run|runInAsyncScope|bound|emit|next|all|fn|operation|_propagate|measureDiagnosticsTimelineSpan(Sync)?|withSqliteBeginContentionRetry(Sync)?|runWithHeldLease|withAgentDatabaseProcessLeaseSync|runSqlite\w*TransactionSync|runTransaction|executeSqliteQuerySync|executeCompiledSqliteQuerySync|executeWithCachedStatement|withOpenClawAgentDatabaseReadOnly|listOnTimeout|processTimers|processImmediate|runNextTicks|callbackTrampoline|onceWrapper|emitWithoutGuard|callback|dispatch|handle|invoke|apply|call|then|resolve|Promise)$/u;
function attribute(profile, startedAt, from, to) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n])); const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url || "").replace(/-[A-Za-z0-9_]{8}\.js$/u, "")}:${n.callFrame.lineNumber + 1}`;
  let t = profile.startTime, busy = 0, gc = 0; const incl = new Map();
  profile.samples.forEach((id, i) => {
    t += profile.timeDeltas[i]; const wall = startedAt + (t - profile.startTime) / 1000; const dt = (profile.timeDeltas[i + 1] ?? 1000) / 1000;
    if (wall < from || wall > to) return;
    const n = byId.get(id); const fn = n.callFrame.functionName;
    if (fn === "(idle)") return;
    busy += dt; if (fn === "(garbage collector)") gc += dt;
    const seen = new Set();
    for (let c = id; c !== undefined; c = parent.get(c)) { const node = byId.get(c); if (GENERIC.test(node.callFrame.functionName || "(anon)")) continue; const k = label(node); if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); }
  });
  return { windowMs: Math.round(to - from), busyMs: Math.round(busy), gcMs: Math.round(gc), top: [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${Math.round(v)} ${k}`) };
}

const built = buildPrivateDatabase();
assert(built.live.length === 2 && built.groups.length >= GROUPS, `mirror has ${built.groups.length} group sessions, need ${GROUPS}`);
const rounds = [];
let profiler, profile;
try {
  startGateway();
  await connectGateway();
  await stopGateway();
  const seeded = copyPlacements(built.live);
  lines.length = 0;
  startGateway();
  await connectGateway();
  await sleep(45_000); // startup work and the startup sweep
  profiler = await openProfiler();
  let g = 0;
  const nextSweepStart = async () => {
    const seen = probes("[pe-sweep-start]").length;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline && probes("[pe-sweep-start]").length === seen) await sleep(20);
    assert(probes("[pe-sweep-start]").length > seen, "no placement sweep within 120 s");
  };
  for (let c = 0; c < CYCLES; c += 1) {
    for (const kind of ["aligned", "gap"]) {
      await nextSweepStart();
      if (kind === "gap") await sleep(25_000);
      const keys = built.groups.slice(g, g + CONCURRENCY); g += CONCURRENCY;
      const t0 = Date.now();
      const calls = await Promise.all(keys.map(async (sessionKey, i) => {
        const sent = Date.now();
        const idempotencyKey = `dp-${sent}-${c}-${kind}-${i}`;
        try {
          await client.request("chat.send", { agentId: "makaron", sessionKey, message: `（自动化测试 dispatch ${kind} c${c} #${i}）请只回一个字`, deliver: false, thinking: "low", timeoutMs: 120000, idempotencyKey });
          return { sent, ackMs: Date.now() - sent, runId: idempotencyKey };
        } catch (error) { return { sent, error: redact(error?.message ?? error).slice(0, 200) }; }
      }));
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline && calls.some((x) => x.runId && !modelEnter(x.runId))) await sleep(250);
      for (const x of calls) { const m = x.runId ? modelEnter(x.runId) : null; x.toModelMs = m ? m - x.sent : null; }
      const v = calls.map((x) => x.toModelMs).filter((x) => x !== null);
      rounds.push({ cycle: c, kind, t0, end: t0 + (v.length ? Math.max(...v) : 0), n: calls.length, reached: v.length, p50: pct(v, 0.5), max: v.length ? Math.max(...v) : null, ackP50: pct(calls.map((x) => x.ackMs).filter(Boolean), 0.5), errors: calls.filter((x) => x.error).map((x) => x.error) });
    }
  }
  profile = await profiler.stop();
  const sweeps = probes("[pe-sweep]");
  const perRound = rounds.map((r) => ({ ...r, gateway: attribute(profile, profiler.startedAt, r.t0, r.end) }));
  const aligned = rounds.filter((r) => r.kind === "aligned").map((r) => r.p50), gap = rounds.filter((r) => r.kind === "gap").map((r) => r.p50);
  const summary = {
    patch: PATCH, sessions: built.sessions, entryMb: built.entryMb, placements: seeded.total,
    sweepMs: sweeps.map((s) => s.ms),
    toModelP50: { aligned, gap },
    rounds: perRound,
  };
  fs.writeFileSync(path.join(stateDir, "dispatch.cpuprofile"), JSON.stringify(profile));
  console.log(JSON.stringify(summary, null, 1));
  assert(rounds.filter((r) => r.reached === r.n).length >= rounds.length / 2, "most rounds had runs that never reached the model; the dispatch path was not exercised");
  console.log(`DONE patch=${PATCH} placements=${seeded.total} sweep=${sweeps.map((s) => s.ms).join("/")}ms to-model p50 aligned=${aligned.join("/")}ms gap=${gap.join("/")}ms`);
} finally {
  await stopGateway();
}
