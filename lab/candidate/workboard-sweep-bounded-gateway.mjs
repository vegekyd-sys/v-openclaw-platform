#!/usr/bin/env node
// workboard-sweep-bounded on a private Gateway with V's data (see lab/workboard-sweep-bounded.md).
//
// Same fixture as workboard-sweep-bounded-ab.mjs (FIXTURE_DIR: V's Workboard database, five agents'
// session tables, subagent_runs). Each arm gets a fresh copy of the same state and its own Gateway
// (channels and cron off) with --inspect:
//   before  V's bytes for the six files (rebuilt from the release files by unpatching)
//   after   the release files
// In each arm:
//   1. sessions.list with the sweep's parameters with and without lifecycleOnly, full and with
//      activeMinutes, must agree on the fields the sweep reads (key, updatedAt, status, hasActiveRun,
//      abortedLastRun);
//   2. the Workboard lifecycle service runs on its own cadence for SWEEP_MINUTES while a client
//      relabels TOUCH sessions linked to unarchived cards each minute (V's rate: ~9 sessions per two
//      minutes, 2026-10-26 16:55 CST); a CPU profile covers the whole stretch and each sweep's
//      main-thread time is read from it;
//   3. no "workboard lifecycle sync/recovery failed" lines.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FILES, sha256 } from "../patch-workboard-sweep-bounded.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const baseConfigPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && baseConfigPath, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/wsb-20261026";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `gw-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const ARMS = (process.env.ARMS ?? "before,after").split(",");
const SWEEP_MINUTES = Number(process.env.SWEEP_MINUTES ?? 13);
const TOUCH = Number(process.env.TOUCH ?? 8);
const INSPECT_PORT = Number(process.env.INSPECT_PORT ?? 39431);
const AGENTS = ["makaron", "v-codex", "xiaoai", "dealclaw", "short-v"];
const REL = "lab/release-files/workboard-sweep-bounded";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(`[${new Date().toISOString()}]`, ...args);
fs.mkdirSync(WORK_DIR, { recursive: true });
// The runner's TMPDIR / XDG_CACHE_HOME are shared; the private Gateway's read-only SQLite worker refuses them.
const PRIVATE_ENV = { TMPDIR: path.join(WORK_DIR, "tmp"), XDG_CACHE_HOME: path.join(WORK_DIR, "cache") };
for (const d of Object.values(PRIVATE_ENV)) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
if (process.env.KEEP_WORK !== "1") process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));

// ---- bytes per arm ----
const plan = JSON.parse(fs.readFileSync("lab/workboard-sweep-bounded.plan.json", "utf8"));
const bytes = { before: {}, after: {} };
for (const [name, before, , unpatch] of FILES) {
  const file = plan.files.find((f) => f.target === `openclaw/dist/${name}`);
  const released = fs.readFileSync(path.join(REL, name), "utf8");
  assert.equal(sha256(released), file.after, `release bytes ${name}`);
  bytes.after[name] = released;
  bytes.before[name] = unpatch(released);
  assert.equal(sha256(bytes.before[name]), before, `V bytes ${name}`);
}
const install = (arm) => { for (const [name, source] of Object.entries(bytes[arm])) fs.writeFileSync(path.join(dist, name), source); };
// Leave the dist as the plan installed it.
process.on("exit", () => install("after"));

// ---- state template: OpenClaw-created databases filled from V's export ----
const template = path.join(WORK_DIR, "template");
const baseConfig = JSON.parse(fs.readFileSync(baseConfigPath, "utf8"));
const port = Number(baseConfig.gateway?.port);
const token = baseConfig.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const configured = new Set(Object.keys(baseConfig.agents?.entries ?? {}));
log("configured agents", [...configured], "workboard plugin", baseConfig.plugins?.entries?.workboard?.enabled);
assert(configured.has("makaron"), "makaron must be a configured agent (sessions.list configuredAgentsOnly)");
function config(stateDir) {
  const c = structuredClone(baseConfig);
  c.channels = {};
  c.cron = { ...(c.cron ?? {}), enabled: false };
  c.session = { ...c.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  const worker = c.plugins?.entries?.["vlab-agent-worker-isolation"]?.config;
  if (worker) Object.assign(worker, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
  for (const id of disabledPlugins) (c.plugins.entries[id] ??= {}).enabled = false;
  fs.writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(c, null, 2));
}
const disabledPlugins = [];
{
  fs.mkdirSync(template, { recursive: true });
  config(template);
  install("after");
  const env = { ...process.env, ...PRIVATE_ENV, OPENCLAW_STATE_DIR: template, OPENCLAW_CONFIG_PATH: path.join(template, "openclaw.json"), OPENCLAW_DB91_INTEGRITY_STATE_ROOT: template };
  // Create the schemas with OpenClaw in a child (its database handles stay out of this process).
  const create = spawn(process.execPath, ["--input-type=module", "-e", `
    const { g: openAgent, a: closeAgents } = await import(${JSON.stringify(path.join(dist, "openclaw-agent-db-CUTe8BX6.js"))});
    const { i: openState } = await import(${JSON.stringify(path.join(dist, "openclaw-state-db-Bh3Bq87y.js"))});
    for (const agentId of ${JSON.stringify(AGENTS)}) openAgent({ agentId });
    closeAgents();
    openState();
    process.exit(0);`], { env, stdio: "inherit" });
  assert.equal(await new Promise((resolve) => create.on("exit", resolve)), 0, "schema creation");
  const fill = (file, source, tables) => {
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000; ATTACH '${source}' AS v; BEGIN`);
    const counts = {};
    for (const table of tables) {
      const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
      const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
      const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
      db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
      counts[table] = db.prepare(`SELECT count(*) AS n FROM main.${table}`).get().n;
    }
    if (tables.includes("session_nodes")) {
      db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
      db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
    }
    db.exec("COMMIT; DETACH v");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    return counts;
  };
  const counts = {};
  for (const agentId of AGENTS) counts[agentId] = fill(path.join(template, "agents", agentId, "agent", "openclaw-agent.sqlite"), path.join(FIXTURE_DIR, `${agentId}.sqlite`), ["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards"]);
  counts.state = fill(path.join(template, "state", "openclaw.sqlite"), path.join(FIXTURE_DIR, "state.sqlite"), ["subagent_runs"]);
  fs.mkdirSync(path.join(template, "plugins", "workboard"), { recursive: true });
  fs.copyFileSync(path.join(FIXTURE_DIR, "workboard.sqlite"), path.join(template, "plugins", "workboard", "workboard.sqlite"));
  log("template", counts);
}
// Sessions linked to unarchived cards: the ones the sweep reconciles.
const touchable = (() => {
  const db = new DatabaseSync(path.join(FIXTURE_DIR, "workboard.sqlite"), { readOnly: true });
  const keys = db.prepare("SELECT DISTINCT coalesce(nullif(session_key, ''), nullif(execution_session_key, '')) AS k FROM workboard_cards WHERE NOT (typeof(archived_at) = 'integer' AND archived_at <> 0) AND coalesce(nullif(session_key, ''), nullif(execution_session_key, '')) LIKE 'agent:makaron:%'").all().map((r) => r.k);
  db.close();
  return keys;
})();

// ---- one arm ----
const SWEEP = { limit: 10_000, configuredAgentsOnly: true, includeGlobal: false, includeUnknown: false };
const project = (s) => JSON.stringify([s.key, s.updatedAt ?? null, s.status ?? null, s.hasActiveRun ?? null, s.abortedLastRun === true]);
const SWEEP_FRAMES = new Set(["reconcile", "readWorkboardLifecycleLinks", "listLifecycleLinks", "listLifecycleSweepLinks", "listLifecycleStates", "syncWorkboardLifecycleSessions", "cleanupWorktrees", "listVisibleSessions", "readCards", "lifecycleStatusTransition"]);
async function runArm(arm) {
  const stateDir = path.join(WORK_DIR, arm);
  fs.rmSync(stateDir, { recursive: true, force: true });
  fs.cpSync(template, stateDir, { recursive: true });
  install(arm);
  const lines = [];
  let gateway;
  const start = () => {
    config(stateDir);
    gateway = spawn(process.execPath, ["--max-old-space-size=12288", `--inspect=127.0.0.1:${INSPECT_PORT}`, `${dist}/index.js`, "gateway", "--port", String(port)], {
      env: { ...process.env, ...PRIVATE_ENV, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: path.join(stateDir, "openclaw.json"), OPENCLAW_DB91_INTEGRITY_STATE_ROOT: stateDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [gateway.stdout, gateway.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); });
    }
  };
  start();
  try {
    return await armBody();
  } finally {
    if (gateway.exitCode === null) {
      gateway.kill("SIGTERM");
      for (let i = 0; i < 30 && gateway.exitCode === null; i += 1) await sleep(1000);
      if (gateway.exitCode === null) gateway.kill("SIGKILL");
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  async function armBody() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  let client;
  const deadline = Date.now() + 900_000;
  for (;;) {
    assert(Date.now() < deadline, "candidate Gateway did not become ready");
    if (gateway.exitCode !== null) {
      const missing = new Set();
      for (const { line } of lines) for (const m of line.matchAll(/missing configured plugin "([^"]+)"/gu)) missing.add(m[1]);
      const fresh = [...missing].filter((id) => !disabledPlugins.includes(id));
      if (fresh.length === 0) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
      disabledPlugins.push(...fresh);
      start();
      continue;
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
      break;
    } catch { client?.stop(); await sleep(1_000); }
  }
  // Every request gets a deadline: a lost answer must fail the arm, not hang it.
  const request = (method, params, ms = 300_000) => Promise.race([client.request(method, params, { timeoutMs: ms }), sleep(ms + 5_000).then(() => { throw new Error(`${method} timed out after ${ms} ms`); })]);
  // Settled: three fast answers in a row, or at most 3 minutes (a loaded host never answers fast).
  const settleUntil = Date.now() + 180_000;
  for (let ok = 0; ok < 3 && Date.now() < settleUntil;) { const t = Date.now(); await request("health", {}); ok = Date.now() - t < 500 ? ok + 1 : 0; await sleep(500); }
  const result = { arm, disabledPlugins: [...disabledPlugins], equivalence: [], sweeps: [] };

  // CPU profile over everything from here on.
  const list = await (await fetch(`http://127.0.0.1:${INSPECT_PORT}/json/list`)).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => { const msg = JSON.parse(event.data); pending.get(msg.id)?.(msg.result); pending.delete(msg.id); });
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 1000 });
  await send("Profiler.start");
  const profileStartedAt = Date.now();
  // V8 heap every 500 ms (a sample waits while the main thread is busy; heapTotal stays up after a spike).
  const heap = [];
  let sampling = true;
  const sampleHeap = (async () => { while (sampling) { const t = Date.now(); const h = await send("Runtime.getHeapUsage"); heap.push({ at: t, used: h.usedSize, total: h.totalSize }); await sleep(500); } })();

  // 1. lifecycleOnly vs the ordinary list, same Gateway, back to back.
  // PROBES: the activeMinutes values to compare ("full" = none); the full ones are slow on V's bytes.
  for (const activeMinutes of (process.env.PROBES ?? "full,2,60,1440,100000").split(",").map((v) => v === "full" ? void 0 : Number(v))) {
    const params = { ...SWEEP, ...activeMinutes ? { activeMinutes } : {} };
    let t = performance.now();
    const plain = await request("sessions.list", params);
    const plainMs = Math.round(performance.now() - t);
    t = performance.now();
    const light = await request("sessions.list", { ...params, lifecycleOnly: true });
    const lightMs = Math.round(performance.now() - t);
    assert.deepEqual(light.sessions.map(project).sort(), plain.sessions.map(project).sort(), `${arm} activeMinutes ${activeMinutes}: lifecycle fields differ`);
    result.equivalence.push({ activeMinutes: activeMinutes ?? null, rows: plain.sessions.length, plainMs, lightMs });
    log(arm, result.equivalence.at(-1));
  }
  const probesEndedAt = Date.now();

  // 2. the sweep's own cadence, with sessions changing as on V
  let seed = 97;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  let touched = 0;
  const until = Date.now() + SWEEP_MINUTES * 60_000;
  while (Date.now() < until) {
    for (let i = 0; i < TOUCH; i += 1) {
      const key = touchable[rand(touchable.length)];
      try { await request("sessions.patch", { key, label: `wsb ${arm} ${Date.now()} ${i}` }, 60_000); touched += 1; } catch (error) { log("patch failed", key, String(error?.message ?? error).slice(0, 200)); }
    }
    await sleep(60_000);
  }
  result.touched = touched;
  sampling = false;
  await sampleHeap;
  const { profile } = await send("Profiler.stop");
  ws.close();
  fs.writeFileSync(path.join(FIXTURE_DIR, `wsb-${arm}-${process.env.VLAB_CANDIDATE_ID ?? process.pid}.cpuprofile`), JSON.stringify(profile));

  // 3. sweeps from the profile: samples whose stack has a sweep frame, grouped (gaps > 20 s split sweeps).
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const idle = new Set(profile.nodes.filter((n) => ["(idle)", "(program)"].includes(n.callFrame.functionName)).map((n) => n.id));
  const sweepNode = new Map();
  const isSweep = (id) => {
    if (sweepNode.has(id)) return sweepNode.get(id);
    const n = nodes.get(id);
    const value = SWEEP_FRAMES.has(n.callFrame.functionName) || (parent.has(id) && isSweep(parent.get(id)));
    sweepNode.set(id, value);
    return value;
  };
  let t = profile.startTime;
  const samples = profile.samples.map((id, i) => { t += profile.timeDeltas[i]; return { id, t, d: profile.timeDeltas[i + 1] ?? 1000 }; });
  const wall = (us) => profileStartedAt + (us - profile.startTime) / 1000;
  const probeEndUs = profile.startTime + (probesEndedAt - profileStartedAt) * 1000;
  // contiguous busy blocks (gaps < 20 ms)
  const blocks = [];
  for (const s of samples) {
    if (idle.has(s.id)) continue;
    const last = blocks.at(-1);
    if (last && s.t - last.end < 20_000) { last.end = s.t + s.d; last.busy += s.d; last.sweep ||= isSweep(s.id); last.sweepUs += isSweep(s.id) ? s.d : 0; }
    else blocks.push({ start: s.t, end: s.t + s.d, busy: s.d, sweep: isSweep(s.id), sweepUs: isSweep(s.id) ? s.d : 0 });
  }
  for (const b of blocks.filter((b) => b.sweep && b.start > probeEndUs)) {
    const last = result.sweeps.at(-1);
    if (last && b.start - last.endUs < 20_000_000) { last.endUs = b.end; last.blocks.push(b); }
    else result.sweeps.push({ startUs: b.start, endUs: b.end, blocks: [b] });
  }
  const MB = (b) => Math.round(b / 1e6);
  const heapAround = (startMs, endMs) => {
    const before = heap.filter((h) => h.at >= startMs - 10_000 && h.at < startMs);
    const after = heap.filter((h) => h.at >= startMs && h.at <= endMs + 5_000);
    if (before.length === 0 || after.length === 0) return {};
    return {
      heapUsedDeltaMB: MB(Math.max(...after.map((h) => h.used)) - Math.min(...before.map((h) => h.used))),
      heapTotalDeltaMB: MB(Math.max(...after.map((h) => h.total)) - Math.min(...before.map((h) => h.total))),
      heapTotalPeakMB: MB(Math.max(...after.map((h) => h.total))),
    };
  };
  result.heap = { samples: heap.length, usedMinMB: MB(Math.min(...heap.map((h) => h.used))), usedMaxMB: MB(Math.max(...heap.map((h) => h.used))), totalMaxMB: MB(Math.max(...heap.map((h) => h.total))) };
  result.sweeps = result.sweeps.map((s) => ({
    ...heapAround(wall(s.startUs), wall(s.endUs)),
    at: new Date(wall(s.startUs)).toISOString(),
    spanMs: Math.round((s.endUs - s.startUs) / 1000),
    sweepCpuMs: Math.round(s.blocks.reduce((sum, b) => sum + b.sweepUs, 0) / 1000),
    busyMs: Math.round(s.blocks.reduce((sum, b) => sum + b.busy, 0) / 1000),
    longestBlockMs: Math.round(Math.max(...s.blocks.map((b) => b.busy)) / 1000),
  }));
  result.failures = lines.filter((l) => /workboard lifecycle (sync|recovery) failed|invalid sessions\.list params|unexpected property|TypeError|ReferenceError/iu.test(l.line)).map((l) => redact(l.line).slice(0, 400));
  result.livenessDelayed = lines.filter((l) => /liveness heartbeat delayed/u.test(l.line)).map((l) => redact(l.line).slice(0, 200));
  client.stop();
  return result;
  }
}

const results = [];
try {
  for (const arm of ARMS) {
    const r = await runArm(arm);
    results.push(r);
    log(arm, JSON.stringify({ sweeps: r.sweeps, failures: r.failures }));
  }
  for (const r of results) assert.deepEqual(r.failures, [], `${r.arm}: Gateway reported failures`);
  console.log(JSON.stringify({ ok: true, results }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error?.stack ?? error).slice(0, 3000), results }));
  process.exitCode = 1;
}
