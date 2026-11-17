// workboard-sweep-complete A/B on a V-scale session store (lab/workboard-sweep-complete.md).
//
// Each arm runs the Workboard lifecycle service of its extensions/workboard/index.js (the lifecycle-sync region,
// as lab/candidate/workboard-sweep-bounded-ab.mjs does) with a real WorkboardStore over a fresh Workboard database,
// and a Gateway whose sessions.list is the real handler of the candidate runtime (V's bytes, including the
// workboard-full-sweep worker #614) over a private V-scale makaron store (v-scale-session-fixture.mjs).
//   A   V's index.js (runtime bytes, sha256 = the plan's `before`)
//   B   the release file
//   B0  the release file with OPENCLAW_V_WORKBOARD_SWEEP_COMPLETE=0 (must end exactly like A)
// Cards (same ids/data in every arm), linked to sessions picked from the store's full lifecycle listing:
//   oldSettled   300 cards on sessions ranked past 10,000, already consistent (done / review)
//   oldDrift      30 cards on sessions ranked past 10,000 whose card still says running (session done)
//   recentDrift   30 cards on sessions ranked in the first 5,000, card running (session done)
//   orphan         2 prepared launches from before this process started, no session
//   inflight       2 prepared launches from this process (just prepared), no session
// Every sweep is full (prepared launches force it). Reports per sweep: wall time, longest main-thread block
// (1 ms ticker), the sessions.list call's wall time, rows, hasMore, totalCount, and whether #614's worker ran.
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
const sha = (v) => createHash("sha256").update(v).digest("hex");
const AGENT = "makaron";
const SWEEPS = Number(process.env.SWEEPS ?? 4);
const SUBAGENT_RUNS = Number(process.env.SUBAGENT_RUNS ?? 22033);
const PLAN = JSON.parse(fs.readFileSync("lab/workboard-sweep-complete.plan.json", "utf8"));
const FULL_SWEEP_PLAN = JSON.parse(fs.readFileSync("lab/workboard-full-sweep.plan.json", "utf8"));
const INDEX = PLAN.files[0];
const dbOf = (stateDir) => path.join(stateDir, "agents", AGENT, "agent", "openclaw-agent.sqlite");
const stateDbOf = (stateDir) => path.join(stateDir, "state", "openclaw.sqlite");

if (process.argv[2] === "child") await child(process.argv[3], process.argv[4]);
else if (process.argv[2] === "canon") await canon(process.argv[3]);
else await parent();

async function parent() {
  const sharedState = process.env.VLAB_SHARED_STATE_DIR;
  assert(sharedState, "shared VLab state is required for the fixture templates");
  // V today: workboard-full-sweep (#614) is live, and index.js is the workboard-sweep-bounded (#487) release.
  for (const file of FULL_SWEEP_PLAN.files) assert.equal(sha(fs.readFileSync(path.join(runtime, file.target))), file.after, `runtime is not V's bytes for ${file.target}`);
  assert.equal(sha(fs.readFileSync(path.join(runtime, INDEX.target))), INDEX.before, "runtime index.js is not V's bytes");
  assert.equal(sha(fs.readFileSync(path.resolve(INDEX.source))), INDEX.after, "release file hash");
  const WORK = path.join(process.env.WORK_ROOT ?? "/var/tmp", `workboard-sweep-complete-ab-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
  process.on("exit", () => { if (process.env.KEEP_WORK !== "1") fs.rmSync(WORK, { recursive: true, force: true }); });

  const { buildVScaleSessionDatabase } = await import("./v-scale-session-fixture.mjs");
  const state = path.join(WORK, "fixture");
  const t0 = performance.now();
  const fixture = buildVScaleSessionDatabase({
    runtime,
    srcPath: path.join(sharedState, "agents", AGENT, "agent", "openclaw-agent.sqlite"),
    dstPath: dbOf(state),
    targetRows: Number(process.env.TARGET_ROWS ?? 22922),
    targetEntryBytes: Number(process.env.TARGET_ENTRY_BYTES ?? 92000),
    orphanWindows: 0,
  });
  const canonRun = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "canon", state], { env: { ...process.env, OPENCLAW_STATE_DIR: state, OPENCLAW_DB91_INTEGRITY_STATE_ROOT: state, OPENCLAW_HOME: state }, encoding: "utf8" });
  process.stderr.write(canonRun.stderr ?? "");
  assert.equal(canonRun.status, 0, "canonical cleanup failed");
  const runs = buildSubagentRuns({ sharedStateDb: stateDbOf(sharedState), stateDb: stateDbOf(state), agentDb: dbOf(state) });
  console.error(`[wsc-ab] fixture ${JSON.stringify({ ...fixture, runs })} built in ${Math.round((performance.now() - t0) / 1000)} s`);

  const arms = (process.env.ARMS ?? "A,B,B0").split(",");
  const results = {};
  for (const arm of arms) {
    const env = { ...process.env, OPENCLAW_STATE_DIR: state, OPENCLAW_DB91_INTEGRITY_STATE_ROOT: state, OPENCLAW_HOME: state, WORK_DIR: WORK };
    if (arm === "B0") env.OPENCLAW_V_WORKBOARD_SWEEP_COMPLETE = "0";
    else delete env.OPENCLAW_V_WORKBOARD_SWEEP_COMPLETE;
    const run = spawnSync(process.execPath, ["--expose-gc", "--max-old-space-size=7168", new URL(import.meta.url).pathname, "child", arm, state], { env, encoding: "utf8", maxBuffer: 64 << 20 });
    process.stderr.write(run.stderr ?? "");
    assert.equal(run.status, 0, `arm ${arm} failed`);
    results[arm] = JSON.parse(run.stdout.trim().split("\n").at(-1));
  }
  console.log(JSON.stringify({ fixture, runs, results }, null, 1));

  const { A, B, B0 } = results;
  const groups = (r) => r.groups;
  if (A) {
    assert(A.sweeps.every((s) => s.list.rows === 10000 && s.list.hasMore === true), "A lists the fixed 10,000-row page");
    assert.deepEqual(groups(A).oldDrift, { "running/running/-": 30 }, "A: sessions past 10,000 are never reconciled");
    assert.deepEqual(groups(A).orphan, { "running/running/prepared": 2 }, "A: an orphaned launch is never failed");
  }
  if (B) {
    assert(B.sweeps.every((s) => s.list.hasMore === false && s.list.rows === s.list.totalCount && s.list.rows > 10000), "B lists the whole catalog");
    assert(B.sweeps.every((s) => s.list.worker), "B's full listing still reads on #614's worker");
    assert.deepEqual(groups(B).oldDrift, { "review/review/-": 30 }, "B reconciles sessions past 10,000");
    assert.deepEqual(groups(B).orphan, { "blocked/-/failed": 2 }, "B fails the orphaned launches");
    assert.deepEqual(groups(B).inflight, { "running/running/prepared": 2 }, "B keeps the launches this process is starting");
    assert.deepEqual(B.sweeps.slice(1).map((s) => s.changes), B.sweeps.slice(1).map(() => 0), "B settles after the first sweep");
  }
  for (const r of [A, B, B0].filter(Boolean)) {
    assert.deepEqual(groups(r).oldSettled, { "done/review/-": 300 }, "consistent cards stay as they are");
    assert.deepEqual(groups(r).recentDrift, { "review/review/-": 30 }, "recent sessions reconcile in every arm");
    assert.deepEqual(groups(r).inflight, { "running/running/prepared": 2 }, "in-flight launches stay prepared");
    assert.deepEqual(r.warnings, [], "lifecycle service warned");
  }
  if (A && B0) assert.equal(B0.fingerprint, A.fingerprint, "B0 (switch off) ends exactly like A");
  const worst = (r) => Math.max(...r.sweeps.slice(1).map((s) => s.maxBlockMs));
  console.log(`PASS workboard-sweep-complete: ${arms.map((arm) => `${arm} rows ${results[arm].sweeps[0].list.rows} steady max block ${worst(results[arm])} ms`).join(", ")}`);
}

// One run per fixture subagent session (most terminal ok, some error, some running), cloned from a real row of the
// shared VLab state database (consistent backup). Same construction as workboard-full-sweep-ab.mjs.
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
  const counts = { ok: 0, error: 0, running: 0 };
  for (let i = 0; i < SUBAGENT_RUNS - 10 && keys.length > 0; i += 1) {
    const { session_key: childSessionKey, updated_at: at } = keys[i % keys.length];
    const runId = randomUUID();
    const kind = i % 211 === 0 ? "running" : i % 37 === 0 ? "error" : "ok";
    counts[kind] += 1;
    const execution = kind === "running"
      ? { ...base.execution, status: "running", startedAt: at - 60e3, endedAt: undefined, outcome: undefined }
      : { ...base.execution, status: "terminal", startedAt: at - 60e3, endedAt: at, outcome: { ...(base.execution?.outcome ?? {}), status: kind } };
    ins.run(runId, childSessionKey, template.controller_session_key, template.requester_session_key, at - 61e3, JSON.stringify({ ...base, runId, taskRunId: runId, childSessionKey, createdAt: at - 61e3, execution, task: `${base.task ?? ""}${filler}` }));
  }
  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const total = db.prepare("SELECT count(*) n FROM subagent_runs").get();
  db.close();
  return { ...counts, total: total.n };
}

async function canon(stateDir) {
  const { g: openOpenClawAgentDatabase } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
  const { p: assertCanonicalSqliteSessionKeysCurrent } = await import(path.join(DIST, "session-accessor.sqlite-transcript-state-Cz9g7S9v.js"));
  const raw = new DatabaseSync(dbOf(stateDir));
  raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 30000;");
  let removed = 0;
  for (let i = 0; i < 200; i += 1) {
    try {
      assertCanonicalSqliteSessionKeysCurrent(openOpenClawAgentDatabase({ agentId: AGENT }));
      raw.close();
      console.log(JSON.stringify({ removed }));
      return;
    } catch (error) {
      const key = /repair for (.+?); stop the Gateway/u.exec(String(error?.message))?.[1];
      assert(key, `unexpected canonical scan failure: ${error?.message}`);
      raw.prepare("DELETE FROM session_nodes WHERE session_key = ?").run(key);
      removed += 1;
    }
  }
  throw new Error("canonical cleanup did not converge");
}

async function child(arm, stateDir) {
  let workersStarted = 0;
  const { createRequire, syncBuiltinESMExports } = await import("node:module");
  const workerThreads = createRequire(import.meta.url)("node:worker_threads");
  const BaseWorker = workerThreads.Worker;
  workerThreads.Worker = class CountedWorker extends BaseWorker {
    constructor(...args) { super(...args); workersStarted += 1; }
  };
  syncBuiltinESMExports();
  const file = (name) => pathToFileURL(path.join(DIST, name)).href;
  const { n: getRuntimeConfig } = await import(file("io.runtime-CKu7Rw0j.js"));
  const { g: openOpenClawAgentDatabase } = await import(file("openclaw-agent-db-CUTe8BX6.js"));
  const transcriptState = await import(file("session-accessor.sqlite-transcript-state-Cz9g7S9v.js"));
  const { t: sessionReadHandlers } = await import(file("sessions-read-C6mAMxyQ.js"));
  const { t: createWorkboardSqliteStores } = await import(file("sqlite-store-CH-caj1l.js"));
  const api = await import(file("runtime-api-1CCazqtv.js"));
  const list = sessionReadHandlers["sessions.list"];
  const cfg = getRuntimeConfig();
  transcriptState.p(openOpenClawAgentDatabase({ agentId: AGENT }));
  const context = { getRuntimeConfig: () => cfg, chatAbortControllers: new Map(), logGateway: { warn() {}, info() {}, debug() {}, error() {} } };
  const call = async (params) => {
    let payload;
    let error;
    await list({ params: { ...params }, client: undefined, context, respond: (ok, value, err) => { if (ok) payload = value; else error = err; } });
    assert(!error, `sessions.list failed: ${JSON.stringify(error)}`);
    return payload;
  };

  // The store's full lifecycle listing in sweep order (untimed; the same data in every arm).
  const catalog = (await call({ limit: 1e6, configuredAgentsOnly: true, lifecycleOnly: true, includeGlobal: false, includeUnknown: false })).sessions;
  const done = (from, to, n) => catalog.slice(from, to).filter((s) => s.status === "done" && s.hasActiveRun !== true && s.key.startsWith(`agent:${AGENT}:subagent:`)).slice(0, n);
  const oldSessions = done(12000, catalog.length, 330);
  const recentSessions = done(0, 5000, 30);
  assert.equal(oldSessions.length, 330, "not enough settled sessions past 10,000");
  assert.equal(recentSessions.length, 30, "not enough settled recent sessions");

  // ---- Workboard: a fresh database with the cards of every group ----
  const wbFile = path.join(process.env.WORK_DIR, `workboard-${arm}.sqlite`);
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(wbFile + suffix, { force: true });
  const stores = createWorkboardSqliteStores({ dbPath: wbFile });
  const core = new api.r(stores.cards, stores);
  const raw = new DatabaseSync(wbFile);
  raw.exec("PRAGMA busy_timeout = 30000");
  const link = raw.prepare(`UPDATE workboard_cards SET status = @status, session_key = @key, run_id = @run, execution_id = @run, execution_kind = 'agent-session',
    execution_engine = 'vlab-worker', execution_mode = 'autonomous', execution_status = @execution, execution_session_key = @key, execution_run_id = @run,
    execution_started_at = @at, execution_updated_at = @at, automation_json = @automation WHERE id = @id`);
  const groupOf = new Map();
  const add = async (group, i, { key, status, execution, at, launch }) => {
    const card = await core.create({ title: `${group}-${i}`, status: "todo" });
    const run = `${group}-run-${i}`;
    const automation = launch ? JSON.stringify({ ...card.metadata?.automation, launch: { phase: "prepared", requestedSessionKey: key, provisionalRunId: run, preparedAt: launch } }) : card.metadata?.automation ? JSON.stringify(card.metadata.automation) : null;
    link.run({ id: card.id, status, key, run, execution, at, automation });
    groupOf.set(card.id, group);
  };
  const t = Date.now();
  for (const [i, s] of oldSessions.slice(0, 300).entries()) await add("oldSettled", i, { key: s.key, status: "done", execution: "review", at: s.updatedAt });
  for (const [i, s] of oldSessions.slice(300).entries()) await add("oldDrift", i, { key: s.key, status: "running", execution: "running", at: s.updatedAt - 1 });
  for (const [i, s] of recentSessions.entries()) await add("recentDrift", i, { key: s.key, status: "running", execution: "running", at: s.updatedAt - 1 });
  for (let i = 0; i < 2; i += 1) await add("orphan", i, { key: `agent:${AGENT}:subagent:workboard-orphan-${i}`, status: "running", execution: "running", at: t - 3600e3, launch: Math.floor(performance.timeOrigin) - 3600e3 });
  for (let i = 0; i < 2; i += 1) await add("inflight", i, { key: `agent:${AGENT}:subagent:workboard-inflight-${i}`, status: "running", execution: "running", at: t, launch: t });
  raw.close();

  // ---- the arm's lifecycle service ----
  const source = fs.readFileSync(arm === "A" ? path.join(runtime, INDEX.target) : path.resolve(INDEX.source), "utf8");
  const start = source.indexOf("//#region extensions/workboard/src/lifecycle-sync.ts");
  const end = source.indexOf("//#endregion", start);
  assert(start > 0 && end > start, "lifecycle region");
  let fire;
  const deps = {
    resolveGlobalSingleton: (_key, create) => create(),
    isRecord: (x) => !!x && typeof x === "object" && !Array.isArray(x),
    cardSessionKey: api.c, cardRunId: api.s, workboardCardSessionLookupKey: api.a, workboardCardMatchesLifecycleLink: api.i,
    isWorkboardWorktreeCleanupCandidate: api.u, cleanupWorkboardCardWorktree: api.l,
    setTimeout: (fn, ms) => { assert.equal(ms, 60000); fire?.(fn); return { unref() {} }; },
    clearTimeout: () => {},
  };
  const lifecycle = new Function(...Object.keys(deps), `${source.slice(start, end)}\nreturn { createWorkboardLifecycleService, readWorkboardLifecycleSessions };`)(...Object.values(deps));

  let lastList;
  const gateway = {
    isAvailable: async () => true,
    request: async (method, params) => {
      assert.equal(method, "sessions.list");
      const w0 = workersStarted;
      const t0 = performance.now();
      const payload = await call(params);
      lastList = { wallMs: Math.round(performance.now() - t0), limit: params.limit, rows: payload.sessions.length, hasMore: payload.hasMore, totalCount: payload.totalCount, worker: workersStarted > w0 };
      return payload;
    },
  };
  let changes = 0;
  const sync = core.syncLifecycle.bind(core);
  core.syncLifecycle = async (...args) => { const r = await sync(...args); if (r) changes += 1; return r; };
  const failLaunch = core.failPreparedLaunch.bind(core);
  core.failPreparedLaunch = async (...args) => { const r = await failLaunch(...args); if (r) changes += 1; return r; };
  const warnings = [];
  const service = lifecycle.createWorkboardLifecycleService({ store: core, readSessions: (options) => lifecycle.readWorkboardLifecycleSessions(gateway, options) });
  const sweeps = [];
  let next;
  for (let i = 0; i < SWEEPS; i += 1) {
    global.gc?.();
    const done = new Promise((resolve) => { fire = (fn) => { next = fn; resolve(); }; });
    let last = performance.now();
    let maxBlock = 0;
    let running = true;
    const tick = () => { const now = performance.now(); maxBlock = Math.max(maxBlock, now - last); last = now; if (running) setTimeout(tick, 1); };
    setTimeout(tick, 1);
    const before = changes;
    const t0 = performance.now();
    if (i === 0) { service.start({ logger: { warn: (m) => warnings.push(String(m)) } }); service.onGatewayStart(); } else next();
    await done;
    const wallMs = Math.round(performance.now() - t0);
    running = false;
    await new Promise((r) => setTimeout(r, 5));
    sweeps.push({ wallMs, maxBlockMs: Math.round(maxBlock), changes: changes - before, list: lastList });
    console.error(`[wsc-ab ${arm}] sweep ${i}: ${JSON.stringify(sweeps.at(-1))}`);
  }
  service.stop();
  const cards = await core.list();
  const groups = {};
  for (const card of cards) {
    const group = groupOf.get(card.id);
    const k = `${card.status}/${card.execution?.status ?? "-"}/${card.metadata?.automation?.launch?.phase ?? "-"}`;
    (groups[group] ??= {})[k] = (groups[group][k] ?? 0) + 1;
  }
  const fingerprint = sha(JSON.stringify(cards.map((c) => [groupOf.get(c.id), c.title, c.status, c.execution?.status, c.sessionKey, c.metadata?.automation?.launch?.phase, c.metadata?.stale ? 1 : 0])));
  stores.close();
  console.error(`[wsc-ab ${arm}] groups ${JSON.stringify(groups)}`);
  console.log(JSON.stringify({ arm, catalog: catalog.length, sweeps, groups, fingerprint, warnings }));
}
