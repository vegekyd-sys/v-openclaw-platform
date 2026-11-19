// workboard-full-sweep A/B on a V-scale store (lab/workboard-full-sweep.md).
//
// The Workboard lifecycle sweep's 10-minute full listing is sessions.list with
//   { limit: 10000, configuredAgentsOnly: true, lifecycleOnly: true, includeGlobal: false, includeUnknown: false }
// This harness calls the real sessions.list handler (sessions-read-C6mAMxyQ.js) with exactly those parameters,
// and the per-minute partial listing (the same plus activeMinutes: 2), in one child process per arm:
//   A  the runtime as cached (V's bytes; checked against the plan's `before`)
//   B  the release files from PLAN
// Data: a private makaron store built by v-scale-session-fixture.mjs (V 2026-11-17: 22,922 rows, 2.1 GB of
// entry JSON) with a few rows aborted / killed / archived / pinned, and a private state database whose
// subagent_runs is grown to V's 22,033 runs (most terminal, some live) for the fixture's sessions.
// Every arm gets its own copy. Before each timed call another connection rewrites 100 session rows
// (worker-style commits, so the entry cache is cold as on V).
// Checks: A's and B's first full and partial payloads are identical (all fields but ts); within B the worker
// path and the main-thread path (OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER=0) are identical on the same data;
// B logs no worker fallback. Reports per call: wall time, longest main-thread block (1 ms ticker), process
// CPU (all threads) and main-thread heap growth.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const PLAN = JSON.parse(fs.readFileSync(path.resolve(process.env.PLAN ?? "lab/workboard-full-sweep.plan.json"), "utf8"));
const sha = (v) => createHash("sha256").update(v).digest("hex");
const AGENT = "makaron";
const ITERATIONS = Number(process.env.ITERATIONS ?? 4);
const SUBAGENT_RUNS = Number(process.env.SUBAGENT_RUNS ?? 22033);
const FULL = { limit: 10000, configuredAgentsOnly: true, lifecycleOnly: true, includeGlobal: false, includeUnknown: false };
const PARTIAL = { ...FULL, activeMinutes: 2 };
const dbOf = (stateDir) => path.join(stateDir, "agents", AGENT, "agent", "openclaw-agent.sqlite");
const stateDbOf = (stateDir) => path.join(stateDir, "state", "openclaw.sqlite");

if (process.argv[2] === "child") await child(process.argv[3]);
else if (process.argv[2] === "canon") await canon(process.argv[3]);
else await parent();

async function parent() {
  const sharedState = process.env.VLAB_SHARED_STATE_DIR;
  assert(sharedState, "shared VLab state is required for the fixture templates");
  for (const file of PLAN.files) {
    if (file.before) assert.equal(sha(fs.readFileSync(path.join(runtime, file.target))), file.before, `runtime is not V's bytes for ${file.target}`);
    else assert(!fs.existsSync(path.join(runtime, file.target)), `runtime already has ${file.target}`);
    assert.equal(sha(fs.readFileSync(path.resolve(file.source))), file.after, `release file hash ${file.source}`);
  }
  const WORK = path.join(process.env.WORK_ROOT ?? "/var/tmp", `workboard-full-sweep-ab-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
  const originals = new Map(PLAN.files.map((file) => [file.target, fs.existsSync(path.join(runtime, file.target)) ? fs.readFileSync(path.join(runtime, file.target)) : null]));
  const restore = () => {
    for (const [target, bytes] of originals) {
      if (bytes === null) fs.rmSync(path.join(runtime, target), { force: true });
      else fs.writeFileSync(path.join(runtime, target), bytes);
    }
  };
  process.on("exit", () => {
    restore();
    if (process.env.KEEP_WORK !== "1") fs.rmSync(WORK, { recursive: true, force: true });
  });

  // ---- fixture ----
  const { buildVScaleSessionDatabase } = await import("./v-scale-session-fixture.mjs");
  const fixtureState = path.join(WORK, "fixture");
  const t0 = performance.now();
  const fixture = buildVScaleSessionDatabase({
    runtime,
    srcPath: path.join(sharedState, "agents", AGENT, "agent", "openclaw-agent.sqlite"),
    dstPath: dbOf(fixtureState),
    targetRows: Number(process.env.TARGET_ROWS ?? 22922),
    targetEntryBytes: Number(process.env.TARGET_ENTRY_BYTES ?? 92000),
    orphanWindows: Number(process.env.ORPHAN_WINDOWS ?? 0),
  });
  const canonRun = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "canon", fixtureState], { env: { ...process.env, OPENCLAW_STATE_DIR: fixtureState, OPENCLAW_DB91_INTEGRITY_STATE_ROOT: fixtureState, OPENCLAW_HOME: fixtureState }, encoding: "utf8" });
  process.stderr.write(canonRun.stderr ?? "");
  assert.equal(canonRun.status, 0, "canonical cleanup failed");
  const variety = varyRows(dbOf(fixtureState));
  const runs = buildSubagentRuns({ sharedStateDb: stateDbOf(sharedState), stateDb: stateDbOf(fixtureState), agentDb: dbOf(fixtureState) });
  console.error(`[wfs-ab] fixture ${JSON.stringify({ ...fixture, variety, runs })} built in ${Math.round((performance.now() - t0) / 1000)} s; canonical cleanup ${canonRun.stdout.trim()}`);

  const arms = (process.env.ARMS ?? "A,B").split(",");
  const results = {};
  for (const arm of arms) {
    const state = path.join(WORK, arm);
    for (const file of [dbOf, stateDbOf]) {
      fs.mkdirSync(path.dirname(file(state)), { recursive: true });
      fs.copyFileSync(file(fixtureState), file(state));
    }
    restore();
    if (arm === "B") for (const file of PLAN.files) fs.copyFileSync(path.resolve(file.source), path.join(runtime, file.target));
    const env = { ...process.env, OPENCLAW_STATE_DIR: state, OPENCLAW_DB91_INTEGRITY_STATE_ROOT: state, OPENCLAW_HOME: state, AB_ARM: arm, WORK_DIR: WORK };
    const run = spawnSync(process.execPath, ["--expose-gc", "--max-old-space-size=7168", new URL(import.meta.url).pathname, "child", state], { env, encoding: "utf8", maxBuffer: 64 << 20 });
    process.stderr.write(run.stderr ?? "");
    assert.equal(run.status, 0, `arm ${arm} failed`);
    results[arm] = JSON.parse(run.stdout.trim().split("\n").at(-1));
    fs.rmSync(state, { recursive: true, force: true });
  }
  restore();
  const table = Object.fromEntries(Object.entries(results).map(([arm, r]) => [arm, r.ops.map((op) => `${op.kind}:${op.wallMs}/${op.maxBlockMs}`).join(" ")]));
  console.log(JSON.stringify({ fixture, variety, runs, table, results }, null, 1));
  if (results.A && results.B) {
    assert.equal(results.B.digests.full, results.A.digests.full, "full lifecycle listing differs between A and B");
    assert.equal(results.B.digests.partial, results.A.digests.partial, "partial lifecycle listing differs between A and B");
  }
  if (results.B) {
    assert.equal(results.B.digests.fullMainThread, results.B.digests.full, "B worker path differs from B main-thread path");
    assert.deepEqual(results.B.warnings, [], "B logged a worker fallback");
    assert(results.B.workerSnapshots > 0, "B never used the worker");
  }
  const worst = (arm, kind) => Math.max(...results[arm].ops.filter((op) => op.kind === kind).map((op) => op.maxBlockMs));
  console.log(`PASS workboard-full-sweep: identical payloads; longest main-thread block full/partial ${arms.map((arm) => `${arm} ${worst(arm, "full")}/${worst(arm, "partial")} ms`).join(", ")}`);
}

// A few rows with each lifecycle-relevant field the cloned rows lack, columns kept in step with the entry.
function varyRows(file) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 30000");
  const keys = db.prepare("SELECT session_key FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' ORDER BY session_key").all().map((r) => r.session_key);
  const pick = (offset, every) => keys.filter((_, i) => i % every === offset);
  const update = (key, patch, columns) => {
    const sets = Object.keys(columns).map((c) => `${c} = ?`);
    let json = "entry_json";
    const args = [];
    for (const [field, value] of Object.entries(patch)) {
      json = `json_set(${json}, '$.${field}', json(?))`;
      args.push(JSON.stringify(value));
    }
    db.prepare(`UPDATE session_nodes SET entry_json = ${json}${sets.length ? `, ${sets.join(", ")}` : ""} WHERE session_key = ?`).run(...args, ...Object.values(columns), key);
  };
  const now = Date.now();
  db.exec("BEGIN");
  const counts = { aborted: 0, abortedFalse: 0, failed: 0, archived: 0, pinned: 0, running: 0, recent: 0 };
  for (const key of pick(1, 97)) { update(key, { abortedLastRun: true, status: "killed" }, { status: "killed" }); counts.aborted += 1; }
  for (const key of pick(2, 13)) { update(key, { abortedLastRun: false }, {}); counts.abortedFalse += 1; }
  for (const key of pick(3, 89)) { update(key, { status: "failed" }, { status: "failed" }); counts.failed += 1; }
  for (const key of pick(4, 53)) { update(key, { archivedAt: now - 3600e3 }, { archived_at: now - 3600e3 }); counts.archived += 1; }
  for (const key of pick(5, 1999)) { update(key, { pinnedAt: now - 7200e3 }, { pinned_at: now - 7200e3 }); counts.pinned += 1; }
  for (const key of pick(6, 2999)) { update(key, { status: "running" }, { status: "running" }); counts.running += 1; }
  // inside every arm's 2-minute partial window (the fixture's other rows are spread over 30 days)
  for (const key of pick(7, 4001)) { update(key, { updatedAt: now + 6 * 3600e3 }, { updated_at: now + 6 * 3600e3 }); counts.recent += 1; }
  db.exec("UPDATE session_nodes SET entry_valid = 1 WHERE entry_valid = 0");
  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  return counts;
}

// The shared VLab state database (consistent backup), with subagent_runs grown to V's size: one run per
// fixture subagent session (most terminal ok, some error, some still running), cloned from a real row.
function buildSubagentRuns({ sharedStateDb, stateDb, agentDb }) {
  fs.mkdirSync(path.dirname(stateDb), { recursive: true });
  const r = spawnSync("python3", ["-c", "import sqlite3,sys\ns=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)\nd=sqlite3.connect(sys.argv[2])\ns.backup(d)\nd.close();s.close()", sharedStateDb, stateDb]);
  assert.equal(r.status, 0, String(r.stderr));
  const keys = new DatabaseSync(agentDb, { readOnly: true }).prepare("SELECT session_key, updated_at FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' ORDER BY session_key").all();
  const db = new DatabaseSync(stateDb);
  db.exec("PRAGMA busy_timeout = 30000");
  const template = db.prepare("SELECT * FROM subagent_runs WHERE json_extract(payload_json, '$.execution.status') = 'terminal' AND json_type(payload_json, '$.completion') = 'object' ORDER BY length(payload_json) LIMIT 1").get();
  assert(template, "no terminal subagent run template in the shared state database");
  const base = JSON.parse(template.payload_json);
  const ins = db.prepare("INSERT INTO subagent_runs (run_id, child_session_key, controller_session_key, requester_session_key, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)");
  const filler = "x".repeat(Math.max(0, 12500 - template.payload_json.length));
  db.exec("BEGIN");
  let made = 0;
  const counts = { ok: 0, error: 0, running: 0 };
  for (let i = 0; made < SUBAGENT_RUNS - 10 && keys.length > 0; i += 1) {
    const { session_key: childSessionKey, updated_at: at } = keys[i % keys.length];
    const runId = randomUUID();
    const kind = i % 211 === 0 ? "running" : i % 37 === 0 ? "error" : "ok";
    counts[kind] += 1;
    const execution = kind === "running"
      ? { ...base.execution, status: "running", startedAt: at - 60e3, endedAt: undefined, outcome: undefined }
      : { ...base.execution, status: "terminal", startedAt: at - 60e3, endedAt: at, outcome: { ...(base.execution?.outcome ?? {}), status: kind } };
    const payload = { ...base, runId, taskRunId: runId, childSessionKey, createdAt: at - 61e3, execution, task: `${base.task ?? ""}${filler}` };
    ins.run(runId, childSessionKey, template.controller_session_key, template.requester_session_key, at - 61e3, JSON.stringify(payload));
    made += 1;
  }
  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const total = db.prepare("SELECT count(*) n, sum(length(payload_json)) b FROM subagent_runs").get();
  db.close();
  return { ...counts, total: total.n, payloadMb: Math.round(total.b / 1048576) };
}

async function canon(stateDir) {
  const { g: openOpenClawAgentDatabase } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
  const { p: assertCanonicalSqliteSessionKeysCurrent } = await import(path.join(DIST, "session-accessor.sqlite-transcript-state-Cz9g7S9v.js"));
  const raw = new DatabaseSync(dbOf(stateDir));
  raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 30000;");
  const removed = [];
  for (let i = 0; i < 200; i += 1) {
    try {
      assertCanonicalSqliteSessionKeysCurrent(openOpenClawAgentDatabase({ agentId: AGENT }));
      raw.close();
      console.log(JSON.stringify({ removed: removed.length }));
      return;
    } catch (error) {
      const key = /repair for (.+?); stop the Gateway/u.exec(String(error?.message))?.[1];
      assert(key, `unexpected canonical scan failure: ${error?.message}`);
      raw.prepare("DELETE FROM session_nodes WHERE session_key = ?").run(key);
      removed.push(key);
    }
  }
  throw new Error("canonical cleanup did not converge");
}

async function child(stateDir) {
  // count the worker threads the code under test starts (the release: one per full listing); installed before
  // any dist module binds node:worker_threads
  let started = 0;
  const { createRequire, syncBuiltinESMExports } = await import("node:module");
  const workerThreads = createRequire(import.meta.url)("node:worker_threads");
  const BaseWorker = workerThreads.Worker;
  workerThreads.Worker = class CountedWorker extends BaseWorker {
    constructor(...args) {
      super(...args);
      started += 1;
    }
  };
  syncBuiltinESMExports();
  const countWorkers = () => started;
  const file = (name) => pathToFileURL(path.join(DIST, name)).href;
  const { n: getRuntimeConfig } = await import(file("io.runtime-CKu7Rw0j.js"));
  const { g: openOpenClawAgentDatabase } = await import(file("openclaw-agent-db-CUTe8BX6.js"));
  const transcriptState = await import(file("session-accessor.sqlite-transcript-state-Cz9g7S9v.js"));
  const { t: sessionReadHandlers } = await import(file("sessions-read-C6mAMxyQ.js"));
  // two runs live in this process's registry (the Gateway restores every persisted run into memory and keeps the
  // live ones current there); the in-memory entry wins over the persisted terminal one
  const { w: subagentRunsRegistry } = await import(file("subagent-registry.store.sqlite-hzGu4QSk.js"));
  {
    const stateDb = new DatabaseSync(stateDbOf(stateDir), { readOnly: true });
    const live = stateDb.prepare("SELECT run_id, payload_json FROM subagent_runs WHERE json_extract(payload_json, '$.execution.status') = 'terminal' AND child_session_key LIKE 'agent:makaron:subagent:%' ORDER BY run_id LIMIT 2").all();
    stateDb.close();
    for (const { run_id: runId, payload_json: json } of live) {
      const entry = JSON.parse(json);
      entry.execution = { ...entry.execution, status: "running", endedAt: undefined, outcome: undefined };
      delete entry.execution.endedAt;
      delete entry.execution.outcome;
      subagentRunsRegistry.set(runId, entry);
    }
    console.error(`[wfs-ab child ${process.env.AB_ARM}] in-memory live runs ${live.length}`);
  }
  const list = sessionReadHandlers["sessions.list"];
  assert.equal(typeof list, "function");
  const cfg = getRuntimeConfig();
  // the Gateway proves the store canonical once, at start (and keeps the writable handle open)
  const tc = performance.now();
  transcriptState.p(openOpenClawAgentDatabase({ agentId: AGENT }));
  console.error(`[wfs-ab child ${process.env.AB_ARM}] canonical proof at start ${Math.round(performance.now() - tc)} ms; validated paths ${JSON.stringify(transcriptState.listCanonicalSessionKeyValidatedPaths?.() ?? "n/a")}`);

  const dbFile = dbOf(stateDir);
  const other = new DatabaseSync(dbFile);
  other.exec("PRAGMA busy_timeout = 30000");
  const sessions = other.prepare("SELECT rowid AS r, session_key AS k, current_session_id AS s FROM session_nodes WHERE entry_valid = 1 ORDER BY rowid").all();
  let workerRound = 0;
  const workerWrites = () => {
    const rows = sessions.slice((workerRound * 100) % sessions.length, ((workerRound * 100) % sessions.length) + 100);
    workerRound += 1;
    other.exec("BEGIN IMMEDIATE");
    const update = other.prepare("UPDATE session_nodes SET updated_at = updated_at + 1, entry_json = json_set(entry_json, '$.updatedAt', updated_at + 1) WHERE rowid = ?");
    const settle = other.prepare("UPDATE session_nodes SET entry_valid = 1 WHERE rowid = ?");
    for (const { r } of rows) {
      update.run(r);
      settle.run(r);
    }
    other.exec("COMMIT");
  };
  // three tracked active runs, as chat.send / agent register them on the Gateway
  const chatAbortControllers = new Map(sessions.filter((_, i) => i % 7001 === 3).slice(0, 3).map(({ k, s }, i) => [`wfs-active-run-${i}`, { sessionKey: k, sessionId: s, projectSessionActive: true }]));
  const warnings = [];
  const context = {
    getRuntimeConfig: () => cfg,
    chatAbortControllers,
    logGateway: { warn: (m) => warnings.push(String(m)), info() {}, debug() {}, error: (m) => warnings.push(String(m)) },
  };
  let workerSnapshots = 0;

  async function call(params) {
    let payload;
    let error;
    await list({ params: { ...params }, client: undefined, context, respond: (ok, value, err) => { if (ok) payload = value; else error = err; } });
    assert(!error, `sessions.list failed: ${JSON.stringify(error)}`);
    return payload;
  }
  const digest = (payload) => {
    const { ts: _ts, ...rest } = payload;
    return sha(JSON.stringify(rest));
  };
  const { Session } = await import("node:inspector/promises");
  const profileOps = new Set(process.env.AB_ARM === (process.env.PROFILE_ARM ?? "B") ? (process.env.PROFILE_OPS ?? "").split(",").filter(Boolean) : []);
  let opIndex = 0;
  async function profiled(fn) {
    const label = String(opIndex++);
    if (!profileOps.has(label)) return fn();
    const inspector = new Session();
    inspector.connect();
    await inspector.post("Profiler.enable");
    await inspector.post("Profiler.setSamplingInterval", { interval: 500 });
    await inspector.post("Profiler.start");
    const value = await fn();
    const { profile } = await inspector.post("Profiler.stop");
    inspector.disconnect();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const self = new Map();
    const incl = new Map();
    profile.samples.forEach((id, i) => {
      const ms = (profile.timeDeltas[i] ?? 0) / 1000;
      const keyOf = (n) => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url || "")}:${n.callFrame.lineNumber + 1}`;
      const top = byId.get(id);
      self.set(keyOf(top), (self.get(keyOf(top)) ?? 0) + ms);
      const seen = new Set();
      for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
        const k = keyOf(byId.get(cur));
        if (!seen.has(k)) incl.set(k, (incl.get(k) ?? 0) + ms);
        seen.add(k);
      }
    });
    const fmt = (m, n) => [...m].filter(([k]) => !/^\((idle|program|root)\)/u.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => `${Math.round(ms)}ms ${k}`);
    console.error(`[wfs-ab child ${process.env.AB_ARM}] profile op ${label} self: ${JSON.stringify(fmt(self, 15))}`);
    console.error(`[wfs-ab child ${process.env.AB_ARM}] profile op ${label} inclusive: ${JSON.stringify(fmt(incl, 45))}`);
    return value;
  }
  async function measure(kind, params) {
    global.gc?.();
    const heap0 = process.memoryUsage().heapUsed;
    let heapPeak = heap0;
    let last = performance.now();
    let maxBlock = 0;
    let running = true;
    let ticks = 0;
    const tick = () => {
      const now = performance.now();
      maxBlock = Math.max(maxBlock, now - last);
      last = now;
      if (++ticks % 20 === 0) heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed);
      if (running) setTimeout(tick, 1);
    };
    setTimeout(tick, 1);
    const cpu0 = process.cpuUsage();
    const workers0 = countWorkers();
    const t = performance.now();
    const payload = await profiled(() => call(params));
    const wallMs = Math.round(performance.now() - t);
    const cpu = process.cpuUsage(cpu0);
    running = false;
    await new Promise((r) => setTimeout(r, 5));
    maxBlock = Math.max(maxBlock, performance.now() - last - 5);
    heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed);
    const usedWorker = countWorkers() > workers0;
    if (usedWorker) workerSnapshots += 1;
    return { kind, wallMs, maxBlockMs: Math.round(maxBlock), cpuMs: Math.round((cpu.user + cpu.system) / 1000), heapPeakMb: Math.round((heapPeak - heap0) / 1048576), rows: payload.sessions.length, worker: usedWorker, payload };
  }
  const ops = [];
  const digests = {};
  const strip = ({ payload, ...op }) => op;
  // pristine data: the payloads the arms compare
  const full0 = await measure("full", FULL);
  digests.full = digest(full0.payload);
  ops.push(strip(full0));
  const partial0 = await measure("partial", PARTIAL);
  digests.partial = digest(partial0.payload);
  ops.push(strip(partial0));
  if (process.env.AB_ARM === "B") {
    process.env.OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER = "0";
    const main0 = await measure("full-main-thread", FULL);
    delete process.env.OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER;
    digests.fullMainThread = digest(main0.payload);
    ops.push(strip(main0));
  }
  const statuses = {};
  for (const s of full0.payload.sessions) statuses[`${s.status ?? "-"}/${s.abortedLastRun === true ? "aborted" : ""}/${s.hasActiveRun ? "active" : ""}`] = (statuses[`${s.status ?? "-"}/${s.abortedLastRun === true ? "aborted" : ""}/${s.hasActiveRun ? "active" : ""}`] ?? 0) + 1;
  console.error(`[wfs-ab child ${process.env.AB_ARM}] full rows ${full0.rows} (totalCount ${full0.payload.totalCount}, hasMore ${full0.payload.hasMore}) statuses ${JSON.stringify(statuses)}; partial rows ${partial0.rows}`);
  for (let i = 0; i < ITERATIONS; i += 1) {
    workerWrites();
    await new Promise((r) => setTimeout(r, 20));
    const full = await measure("full", FULL);
    ops.push(strip(full));
    workerWrites();
    await new Promise((r) => setTimeout(r, 20));
    const partial = await measure("partial", PARTIAL);
    ops.push(strip(partial));
    console.error(`[wfs-ab child ${process.env.AB_ARM}] #${i} full ${full.wallMs}/${full.maxBlockMs} ms (cpu ${full.cpuMs} ms, heap +${full.heapPeakMb} MB, worker ${full.worker}); partial ${partial.wallMs}/${partial.maxBlockMs} ms`);
  }
  other.close();
  console.log(JSON.stringify({ ops, digests, warnings, workerSnapshots }));
}
