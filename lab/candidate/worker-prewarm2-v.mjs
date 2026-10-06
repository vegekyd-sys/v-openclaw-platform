// Candidate A/B for lab/release-files/worker-prewarm2-v: a Worker's first turn should cost
// what a warm turn costs. Derived from worker-prewarm-v.mjs (private Gateway, V's routing,
// closed model port so every run ends at its first model call, V-sized session metadata).
// One Worker, one group session: a cold turn (the Worker's first) and three warm turns.
// Per run: worker-command-enter -> model-call-enter. PROFILE_WORKER=1 adds a CPU profile of
// that window (WINDOW=command; default starts at the first stream event) and SCRIPTS=1 the
// scripts first parsed inside it.
// PREWARM2=off  dev runtime (worker-prewarm-v only): baseline
// PREWARM2=on   patched: the Worker reports skillSnapshotPrepared and firstTurnModules 9/9,
//               preparation writes no session row or transcript (agent database unchanged
//               between start and the first turn), cold command->model under 2.2 s
// 2026-10-06 VLab (1 Worker, 3759 sessions of metadata): dev cold command->model 2623 ms,
// warm 368-417 ms; patched cold 1846 ms, warm 341-469 ms, preparation +0.55 s; the patched
// cold window parses no new script and builds no skill snapshot. What is left of the cold
// gap: GC (~0.3 s), the first tool construction (~0.24 s, it spawns) and ~0.4 s idle.
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
const PATCH = process.env.PATCH ?? "on";
const PREWARM2 = process.env.PREWARM2 ?? "off";
const WORKERS = Number(process.env.WORKERS ?? 1);
const GROUPS = WORKERS * 2;
const MODEL = "deepseek/deepseek-flash";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const dist = path.join(runtime, "openclaw", "dist");
const workerFile = path.join(runtime, "production-worker", "worker.mjs");
const patched = fs.readFileSync(workerFile, "utf8").includes("[worker-runtime-prewarm.3]");
assert.equal(patched, PATCH === "on", `runtime patch marker ${patched} does not match PATCH=${PATCH}`);
const patched2 = fs.readFileSync(path.join(dist, "agent-command-DPfawBbr.js"), "utf8").includes("function prewarmWorkspaceSkillSnapshot(");
assert.equal(patched2, PREWARM2 === "on", `runtime prewarm2 marker ${patched2} does not match PREWARM2=${PREWARM2}`);

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
Object.assign(workerPlugin, { minWorkers: WORKERS, maxWorkers: WORKERS, sessionsPerWorker: 1, warmSpareWorkers: 0 });
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

// ---- write check: every table's row count, and the newest updated_at where a table has one ----
function agentDbFingerprint() {
  const db = new DatabaseSync(dstPath, { readOnly: true, allowExtension: true });
  db.loadExtension(path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so"));
  try {
    const out = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
      const cols = db.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name);
      try {
        const row = db.prepare(`SELECT count(*) n${cols.includes("updated_at") ? ", max(updated_at) u" : ""} FROM "${name}"`).get();
        out[name] = cols.includes("updated_at") ? `${row.n}@${row.u}` : String(row.n);
      } catch { /* virtual tables without their module */ }
    }
    return out;
  } finally { db.close(); }
}
const fingerprintDiff = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} -> ${b[k]}`);

// ---- private Gateway ----
// V runs with the Worker phase marks on (they only log runs whose id is a UUID)
const profDir = path.join(stateDir, "cpu-prof");
const CPU_PROF = process.env.CPU_PROF === "1";
const PROFILE_WORKER = process.env.PROFILE_WORKER === "1";
const workerInspectPort = await new Promise((resolve) => { const srv = net.createServer(); srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });
// with CPU_PROF=1 every process (Gateway and Workers) writes a CPU profile on exit
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1", ...(PROFILE_WORKER ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --inspect-port=127.0.0.1:${workerInspectPort}`.trim() } : {}), ...(CPU_PROF ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --cpu-prof --cpu-prof-dir=${profDir} --cpu-prof-interval=1000`.trim() } : {}) };
const lines = [];
let gateway, client;
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
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
const phases = () => {
  const runs = new Map();
  for (const l of lines) {
    const m = l.line.match(/\[(firsttext-worker-phases|firsttext-metrics)\] (\{.*\})/u);
    if (!m) continue;
    let d; try { d = JSON.parse(m[2]); } catch { continue; }
    const r = runs.get(d.runId) ?? {}; runs.set(d.runId, r);
    const at = d.atMs ?? d.at;
    if (d.stage && at && !(d.stage in r)) r[d.stage] = at;
    if (d.stage === "pool-ipc-send" && !r.worker) r.worker = d.workerPid;
  }
  return runs;
};

const built = buildPrivateDatabase();
assert(built.live.length === 2 && built.groups.length >= GROUPS, `mirror has ${built.groups.length} group sessions, need ${GROUPS}`);
let summary;
try {
  startGateway();
  await connectGateway();
  await stopGateway();
  copyPlacements(built.live);
  lines.length = 0;
  const dbBefore = agentDbFingerprint();
  const startedAt = Date.now();
  startGateway();
  await connectGateway();
  const connectedAt = Date.now();
  // all Workers ready: with the patch each reports its preparation; without it, give the pool time
  const deadline = Date.now() + 240_000;
  if (PATCH === "on") while (Date.now() < deadline && probes("[worker-runtime-prewarm.3]").length < WORKERS) await sleep(500);
  const prewarm = probes("[worker-runtime-prewarm.3]");
  const readyAt = Date.now();
  await sleep(30_000); // idle, like a resident Worker waiting for traffic
  const preparationWrites = fingerprintDiff(dbBefore, agentDbFingerprint());
  const rounds = [];
  let g = 0;
  let workerProf, workerProfile;
  if (PROFILE_WORKER) {
    const pid = probes("[worker-runtime-prewarm.3]")[0]?.pid ?? Number(fs.readdirSync("/proc").find((d) => /^\d+$/u.test(d) && fs.readFileSync(`/proc/${d}/cmdline`, "utf8").includes("production-worker/worker.mjs")));
    process.kill(pid, "SIGUSR1");
    await sleep(1500);
    const list = await (await fetch(`http://127.0.0.1:${workerInspectPort}/json/list`)).json();
    const ws = new WebSocket(list[0].webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    await new Promise((r) => (ws.onopen = r));
    var parsed = [];
    if (process.env.SCRIPTS === "1") { const prev = ws.onmessage; ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.method === "Debugger.scriptParsed" && m.params.url) parsed.push({ url: m.params.url, at: Date.now() }); else prev(e); }; await send("Debugger.enable"); }
    await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 1000 });
    const startedWall = Date.now(); await send("Profiler.start");
    workerProf = { pid, startedWall, stop: async () => { const { profile } = await send("Profiler.stop"); ws.close(); return profile; } };
  }
  const windows = [];
  for (const kind of ["cold", "warm1", "warm2", "warm3"]) {
    // every round on the same sessions: cold = each Worker's first turn, warm = later turns of the same session (V's group pattern)
    const keys = built.groups.slice(0, WORKERS);
    const calls = await Promise.all(keys.map(async (sessionKey, i) => {
      const sent = Date.now();
      const idempotencyKey = randomUUID();
      try {
        await client.request("chat.send", { agentId: "makaron", sessionKey, message: `（自动化测试 worker-prewarm ${kind} #${i}）请只回一个字`, deliver: false, thinking: "low", timeoutMs: 120000, idempotencyKey });
        return { sent, runId: idempotencyKey };
      } catch (error) { return { sent, error: redact(error?.message ?? error).slice(0, 200) }; }
    }));
    const until = Date.now() + 120_000;
    while (Date.now() < until && calls.some((c) => c.runId && !phases().get(c.runId)?.["model-call-enter"])) await sleep(250);
    const runs = phases();
    const per = calls.map((c) => {
      const r = runs.get(c.runId) ?? {};
      const stages = Object.fromEntries(Object.entries(r).filter(([k, v]) => typeof v === "number" && k !== "worker").map(([k, v]) => [k, v - c.sent]).sort((x, y) => x[1] - y[1]));
      return { stages: kind === "cold" ? stages : undefined, worker: r.worker, enterToModelMs: r["model-call-enter"] && r["worker-agent-enter"] ? r["model-call-enter"] - r["worker-agent-enter"] : null, preparedMs: r["worker-prepared-runtime-end"] && r["worker-prepared-runtime-enter"] ? r["worker-prepared-runtime-end"] - r["worker-prepared-runtime-enter"] : null, sendToModelMs: r["model-call-enter"] ? r["model-call-enter"] - c.sent : null, error: c.error };
    });
    const v = per.map((p) => p.enterToModelMs).filter((x) => x !== null);
    // the window after the first stream event (onAttemptDeadlineChanged) up to the model call, per run of the profiled Worker
    for (const c of calls) { const r = runs.get(c.runId) ?? {}; if (r.worker === workerProf?.pid && r["worker-stream-send"] && r["model-call-enter"]) windows.push({ kind: kind === "cold" ? "cold" : "warm", from: process.env.WINDOW === "command" ? r["worker-command-enter"] : r["worker-stream-send"], to: r["model-call-enter"], cmdEnter: r["worker-command-enter"] }); }
    const cm = calls.map((c) => { const r = runs.get(c.runId) ?? {}; return r["model-call-enter"] && r["worker-command-enter"] ? r["model-call-enter"] - r["worker-command-enter"] : null; }).filter((x) => x !== null);
    rounds.push({ runIds: calls.map((c) => c.runId), sentAt: calls[0].sent, kind, reached: v.length, n: per.length, cmdToModelP50: pct(cm, 0.5), enterToModelP50: pct(v, 0.5), enterToModelMax: v.length ? Math.max(...v) : null, sendToModelP50: pct(per.map((p) => p.sendToModelMs).filter((x) => x !== null), 0.5), runs: per });
    await sleep(15_000);
  }
  if (workerProf) {
    const profile = await workerProf.stop();
    const byId = new Map(profile.nodes.map((n) => [n.id, n])); const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const label = (n) => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url || "").replace(/-[A-Za-z0-9_]{8}\.js$/u, "")}:${n.callFrame.lineNumber + 1}`;
    const generic = /^(\(root\)|\(program\)|\(anon\)|runMicrotasks|processTicksAndRejections|run|bound|next|all|fn)$/u;
    const acc = {};
    for (const kind of ["cold", "warm"]) acc[kind] = { incl: new Map(), self: new Map(), busy: 0, idle: 0, gc: 0, windowMs: 0, windows: windows.filter((w) => w.kind === kind).map((w) => ({ streamToModelMs: w.to - w.from, cmdToStreamMs: w.from - w.cmdEnter })) };
    for (const w of windows) acc[w.kind].windowMs += w.to - w.from;
    let t = profile.startTime;
    profile.samples.forEach((sid, i) => {
      t += profile.timeDeltas[i]; const wall = workerProf.startedWall + (t - profile.startTime) / 1000; const dt = (profile.timeDeltas[i + 1] ?? 1000) / 1000;
      const w = windows.find((x) => wall >= x.from && wall <= x.to); if (!w) return;
      const a = acc[w.kind]; const n = byId.get(sid); const fn = n.callFrame.functionName;
      if (fn === "(idle)") { a.idle += dt; return; }
      if (fn === "(garbage collector)") a.gc += dt;
      a.busy += dt; a.self.set(label(n), (a.self.get(label(n)) ?? 0) + dt);
      const seen = new Set();
      for (let c = sid; c !== undefined; c = parent.get(c)) { const node = byId.get(c); if (generic.test(node.callFrame.functionName || "(anon)")) continue; const k = label(node); if (seen.has(k)) continue; seen.add(k); a.incl.set(k, (a.incl.get(k) ?? 0) + dt); }
    });
    const top = (m, k) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([x, v]) => `${Math.round(v)} ${x}`);
    workerProfile = Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, { windows: a.windows, windowMs: Math.round(a.windowMs), busyMs: Math.round(a.busy), idleMs: Math.round(a.idle), gcMs: Math.round(a.gc), topInclusive: top(a.incl, 25), topSelf: top(a.self, 25) }]));
    workerProfile.pid = workerProf.pid;
    if (process.env.SCRIPTS === "1") workerProfile.scripts = Object.fromEntries(["cold", "warm"].map((k) => [k, parsed.filter((p) => windows.some((w) => w.kind === k && p.at >= w.from && p.at <= w.to)).map((p) => p.url.replace(/^.*\/dist\//u, "dist/"))]));
  }
  // every observer line of the first cold run, for the remaining first-turn gap
  const coldRun = rounds[0].runs[0];
  const coldId = rounds[0].runIds?.[0];
  const detail = coldId ? lines.filter((l) => l.line.includes(coldId) && !/firsttext-worker-phases/u.test(l.line)).map((l) => {
    const s = l.line; const at = s.match(/"(?:atMs|at)":(\d{13})/u)?.[1] ?? Date.parse(s.match(/"at":"([^"]+Z)"/u)?.[1] ?? "") ;
    return `${Number.isFinite(+at) ? +at - rounds[0].sentAt : "?"} ${s.replace(/\x1b\[[0-9;]*m/gu, "").slice(0, /trace:embedded-run|startup stages/u.test(s) ? 3000 : 200)}`;
  }) : [];
  summary = { prewarm2: PREWARM2, preparationWrites, workerProfile, coldDetail: PROFILE_WORKER ? [] : detail.slice(0, 120), patch: PATCH, workers: WORKERS, sessions: built.sessions, connectAfterStartMs: connectedAt - startedAt, workersReadyAfterStartMs: PATCH === "on" ? readyAt - startedAt : null, prewarm: prewarm.map(({ pid, ...rest }) => rest), rounds };
  console.log(JSON.stringify(summary, null, 1));
  const [cold] = rounds;
  if (!CPU_PROF && !PROFILE_WORKER) { // a profiling run only reports
  assert(rounds.every((r) => r.reached === r.n && r.runs.every((x) => x.sendToModelMs !== null)), "some runs never reached the model; the Worker path was not exercised");
  assert.equal(prewarm.length, WORKERS, `only ${prewarm.length} Workers reported preparation`);
  assert(prewarm.every((p) => p.status === "ready" && p.sessionStorePrepared === true), `a Worker did not finish preparation: ${JSON.stringify(prewarm)}`);
  assert.deepEqual(preparationWrites, [], "Worker preparation wrote to the agent database");
  if (PREWARM2 === "on") {
    assert(prewarm.every((p) => p.skillSnapshotPrepared === true && p.firstTurnModules === "9/9"), `prewarm2 did not finish: ${JSON.stringify(prewarm)}`);
    assert(cold.cmdToModelP50 < 2200, `cold first turn command -> model ${cold.cmdToModelP50} ms`);
  }
  console.log(`PASS prewarm2=${PREWARM2} cold command->model ${cold.cmdToModelP50}ms warm ${rounds.slice(1).map((r) => r.cmdToModelP50).join("/")}ms ready after start ${readyAt - startedAt}ms prewarm ${prewarm.map((p) => p.ms).join("/")}ms`);
  }
} finally {
  await stopGateway();
}
if (CPU_PROF && summary) {
  // the first cold run's Worker: which functions held it between entering the Worker and the model call
  await sleep(5_000);
  const run = summary.rounds[0].runs[0];
  const files = fs.existsSync(profDir) ? fs.readdirSync(profDir) : [];
  const file = files.find((f) => f.includes(`.${run.worker}.`));
  const sentAt = summary.rounds[0].sentAt;
  const from = sentAt + run.stages["worker-agent-enter"], to = sentAt + run.stages["model-call-enter"];
  if (!file) console.log(`no profile for worker ${run.worker} among ${files.join(",")}`);
  else {
    const p = JSON.parse(fs.readFileSync(path.join(profDir, file), "utf8"));
    // profile clock is monotonic µs; anchor its end to the file's mtime
    const endWall = fs.statSync(path.join(profDir, file)).mtimeMs;
    const byId = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map();
    for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const label = (n) => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url || "").replace(/-[A-Za-z0-9_]{8}\.js$/u, "")}:${n.callFrame.lineNumber + 1}`;
    const generic = /^(\(root\)|\(program\)|\(anon\)|runMicrotasks|processTicksAndRejections|run|bound|next|all|fn)$/u;
    let t = p.startTime; const incl = new Map(), self = new Map(); let busy = 0, idle = 0;
    p.samples.forEach((id, i) => {
      t += p.timeDeltas[i]; const wall = endWall - (p.endTime - t) / 1000; const dt = (p.timeDeltas[i + 1] ?? 1000) / 1000;
      if (wall < from || wall > to) return;
      const n = byId.get(id); if (n.callFrame.functionName === "(idle)") { idle += dt; return; }
      busy += dt; self.set(label(n), (self.get(label(n)) ?? 0) + dt);
      const seen = new Set();
      for (let c = id; c !== undefined; c = parent.get(c)) { const node = byId.get(c); if (generic.test(node.callFrame.functionName || "(anon)")) continue; const k = label(node); if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); }
    });
    const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([x, v]) => `${Math.round(v)} ${x}`);
    console.log(JSON.stringify({ workerProfile: file, windowMs: Math.round(to - from), busyMs: Math.round(busy), idleMs: Math.round(idle), topInclusive: top(incl, 45), topSelf: top(self, 15) }, null, 1));
  }
}
