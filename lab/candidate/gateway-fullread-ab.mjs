// gateway-fullread-hotpaths A/B on a copy of V's session tables (see lab/gateway-fullread-hotpaths.md).
//
// Data (read-only exports from V, kept outside the repository; FIXTURE_DIR on the VLab host):
//   v-sessions.sqlite   all session_nodes / session_windows / session_participants /
//                       session_transcript_index_state / session_progress_cards rows, every
//                       session_transcript_fts row, and the transcript rows of the 150 oldest
//                       Night Shift subagent sessions (sample_keys / sample_ids)
//   v-state-tasks.sqlite task_runs and task_delivery_state
//   v-workboard.sqlite   the workboard plugin database
// A fresh makaron agent database is created by OpenClaw itself (schema, triggers) under WORK_DIR on
// the root disk, then filled from the export; entry_valid keeps V's value (the insert trigger resets it).
//
// SCENARIO (comma list): cron, sweep, workboard, list, tasks (tasks runs ARM=base|patched, one per
// process, on a fresh copy of the state database). Both chunks are loaded side by side from the
// candidate dist for the in-process scenarios: V's file and the release file under another name.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { Session } from "node:inspector/promises";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/gwstall";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const SCENARIOS = new Set((process.env.SCENARIO ?? "cron,sweep,workboard,list").split(","));
const REPEAT = Number(process.env.REPEAT ?? 5);
const RELEASE_DIR = path.resolve("lab/release-files/gateway-fullread-hotpaths");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const out = {};
// Progress also goes to FIXTURE_DIR/<run>.log so a long run can be followed on the host.
const progressLog = path.join(FIXTURE_DIR, `${path.basename(WORK_DIR)}.progress.log`);
const log = (key, value) => {
  out[key] = value;
  const line = `[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`;
  console.error(line);
  fs.appendFileSync(progressLog, `${line}\n`);
};

// ---- state directory on the root disk (the candidate data disk is nearly full) ----
const stateDir = path.join(WORK_DIR, "state");
const agentDb = path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite");
const KEEP = process.env.KEEP_WORK === "1";
if (!KEEP) process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));
fs.mkdirSync(path.dirname(agentDb), { recursive: true });
// V's session.maintenance (warn mode): VLab's own (enforce, maxEntries 2000) would cap the copied store
// on the first lifecycle write and turn a sweep into a 3,000-session deletion.
{
  const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
  config.session = { ...config.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  fs.writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(config, null, 2));
}
process.env.OPENCLAW_STATE_DIR = stateDir;
process.env.OPENCLAW_CONFIG_PATH = path.join(stateDir, "openclaw.json");
process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT = stateDir;
process.env.OPENCLAW_HOME = WORK_DIR;

// ---- side-by-side chunks ----
async function loadPair(name, extraExport) {
  const base = fs.readFileSync(path.join(DIST, name), "utf8");
  const release = fs.readFileSync(path.join(RELEASE_DIR, name), "utf8");
  const plan = JSON.parse(fs.readFileSync("lab/gateway-fullread-hotpaths.plan.json", "utf8")).files.find((f) => f.target.endsWith(`/${name}`));
  assert.equal(sha(base), plan.before, `${name}: candidate runtime is not V's bytes`);
  assert.equal(sha(release), plan.after, `${name}: release file hash`);
  const stem = name.replace(/\.js$/u, "");
  const files = [[`${stem}.FRBASE.js`, base], [`${stem}.FRPATCH.js`, release]];
  const mods = [];
  for (const [file, source] of files) {
    fs.writeFileSync(path.join(DIST, file), source + (extraExport ? `\nexport { ${extraExport} };\n` : ""));
    process.on("exit", () => fs.rmSync(path.join(DIST, file), { force: true }));
    mods.push(await import(path.join(DIST, file)));
  }
  return { base: mods[0], patched: mods[1] };
}

// ---- allocation and main-thread measurement ----
const inspector = new Session();
inspector.connect();
async function measure(label, fn, repeat = REPEAT) {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  global.gc?.();
  await inspector.post("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  delay.enable();
  const times = [];
  let value;
  for (let i = 0; i < repeat; i++) {
    const t = performance.now();
    value = await fn(i);
    times.push(performance.now() - t);
  }
  delay.disable();
  const { profile } = await inspector.post("HeapProfiler.stopSampling");
  const allocated = profile.samples.reduce((sum, s) => sum + s.size, 0);
  const sorted = [...times].sort((a, b) => a - b);
  return {
    label,
    repeat,
    msMedian: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
    msMax: Math.round(sorted.at(-1) * 10) / 10,
    allocatedMBPerCall: Math.round(allocated / repeat / 1e5) / 10,
    loopDelayMaxMs: Math.round(delay.max / 1e6),
    value,
  };
}

// ---- fixture: agent database built by OpenClaw, filled from V's export ----
const sessionsFixture = path.join(FIXTURE_DIR, "v-sessions.sqlite");
const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
function buildAgentDatabase() {
  const t = performance.now();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(agentDb + suffix, { force: true });
  openOpenClawAgentDatabase({ agentId: "makaron" });
  closeOpenClawAgentDatabases();
  const db = new DatabaseSync(agentDb);
  db.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000;");
  db.exec(`ATTACH '${sessionsFixture}' AS v`);
  const copy = (table, where = "") => {
    const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
    const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
    const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
    db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table} ${where}`);
    return db.prepare(`SELECT count(*) AS n FROM main.${table}`).get().n;
  };
  db.exec("BEGIN");
  const counts = {};
  for (const table of ["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards", "transcript_events", "transcript_event_identities", "session_transcript_active_events", "trajectory_runtime_events", "transcript_rewrite_watermarks"]) counts[table] = copy(table);
  db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
  // conversations are not exported; the routing link is irrelevant here and would fail the FK gate.
  db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
  db.exec("DELETE FROM main.session_transcript_fts; INSERT INTO main.session_transcript_fts (rowid, text, session_id, message_id, role, timestamp) SELECT id, text, session_id, message_id, role, timestamp FROM v.fts_rows");
  counts.session_transcript_fts = db.prepare("SELECT count(*) AS n FROM main.session_transcript_fts_docsize").get().n;
  db.exec("COMMIT");
  const fk = db.prepare("PRAGMA foreign_key_check").all();
  if (fk.length) throw new Error(`fixture foreign keys: ${JSON.stringify(fk.slice(0, 5))}`);
  const pending = db.prepare("SELECT count(*) AS n FROM session_nodes WHERE entry_valid <> 1 AND NOT (entry_json = '{}' AND entry_valid = -1)").get().n;
  db.exec("DETACH v; PRAGMA wal_checkpoint(TRUNCATE);");
  db.close();
  return { counts, pendingEntryValid: pending, bytes: fs.statSync(agentDb).size, ms: Math.round(performance.now() - t) };
}
log("fixture", buildAgentDatabase());
const storePath = path.join(stateDir, "agents", "makaron", "sessions", "sessions.json");
const scope = { agentId: "makaron", storePath };
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const allKeys = new DatabaseSync(agentDb, { readOnly: true }).prepare("SELECT session_key, updated_at FROM session_nodes ORDER BY session_key").all();
const project = (value) => JSON.stringify(value, (_k, v) => (typeof v === "function" ? undefined : v));

// ---- cron: resolveCronSession for every cron base key plus misses, both chunks ----
if (SCENARIOS.has("cron")) {
  const { base, patched } = await loadPair("session-D4AJhdUK.js");
  // Every base call parses the whole store, so probe a spread of keys (CRON_CASES).
  const spread = (keys, n) => keys.filter((_k, i) => i % Math.max(1, Math.floor(keys.length / n)) === 0).slice(0, n);
  const cronKeys = spread(allKeys.map((r) => r.session_key).filter((k) => /^agent:makaron:cron:/u.test(k)), Number(process.env.CRON_CASES ?? 40));
  const otherKeys = spread(allKeys.map((r) => r.session_key).filter((k) => !/^agent:makaron:cron:/u.test(k)), 20);
  const cases = [];
  for (const key of cronKeys) for (const forceNew of [false, true]) cases.push({ sessionKey: key, forceNew });
  for (const key of otherKeys) cases.push({ sessionKey: `agent:makaron:cron:ab-miss-${cases.length}`, sourceSessionKey: key, forceNew: false });
  cases.push({ sessionKey: "agent:makaron:cron:ab-miss-only", forceNew: false });
  // Random fields (new session ids, lifecycle revisions) are drawn inside; compare everything else.
  const normalize = (result) => {
    const r = structuredClone({ ...result, store: undefined });
    const seen = new Map();
    return project(r).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu, (id) => {
      if (!seen.has(id)) seen.set(id, `uuid${seen.size}`);
      return seen.get(id);
    });
  };
  let compared = 0;
  const mismatches = [];
  const nowMs = Date.now();
  for (const c of cases) {
    const params = { cfg, agentId: "makaron", nowMs, skillLibrarySelections: undefined, ...c };
    const a = base.n(params);
    const b = patched.n(params);
    compared += 1;
    const keysToCheck = [c.sessionKey, c.sourceSessionKey].filter(Boolean);
    const storeA = project(keysToCheck.map((k) => a.store[k]));
    const storeB = project(keysToCheck.map((k) => b.store[k]));
    if (normalize(a) !== normalize(b) || storeA !== storeB) mismatches.push({ case: c, a: normalize(a).slice(0, 300), b: normalize(b).slice(0, 300) });
  }
  log("cron.equivalence", { cronKeys: cronKeys.length, cases: compared, mismatches: mismatches.length, sample: mismatches.slice(0, 3) });
  assert.equal(mismatches.length, 0, "resolveCronSession results differ");
  const one = { cfg, agentId: "makaron", nowMs, sessionKey: cronKeys[0], forceNew: true };
  log("cron.base", await measure("resolveCronSession V", () => { base.n(one); }));
  log("cron.patched", await measure("resolveCronSession release", () => { patched.n(one); }, REPEAT * 10));
}

// ---- sweep: sweepCronRunSessions on V's store (no run keys) and with synthetic run keys ----
if (SCENARIOS.has("sweep")) {
  const { base, patched } = await loadPair("service-CzmmKrEg.js", "sweepCronRunSessions as __vFullreadSweep");
  const quietLog = { warn: (...a) => console.error("warn", JSON.stringify(a).slice(0, 300)), info: () => {} };
  const sweep = (mod, nowMs) => mod.__vFullreadSweep({ cronConfig: {}, agentId: "makaron", sessionStorePath: storePath, nowMs, force: true, log: quietLog });
  // V has no cron run sessions: both arms must find nothing and prune nothing.
  log("sweep.base", await measure("sweepCronRunSessions V (0 run keys)", async () => (await sweep(base, Date.now())).pruned));
  log("sweep.patched", await measure("sweepCronRunSessions release (0 run keys)", async () => (await sweep(patched, Date.now())).pruned, REPEAT * 10));
  // Equivalence with run keys: add 60 run sessions cloned from cron base rows (half expired), run
  // each arm on its own copy, compare what remains.
  const db = new DatabaseSync(agentDb);
  const bases = db.prepare("SELECT * FROM session_nodes WHERE session_key LIKE 'agent:makaron:cron:%' AND session_key NOT LIKE '%:run:%' LIMIT 30").all();
  const now = Date.now();
  db.exec("BEGIN");
  const runKeys = [];
  for (const [i, row] of bases.entries()) for (const age of [2 * 86400000, 3600000]) {
    const sessionId = randomUUID();
    const key = `${row.session_key}:run:${sessionId}`;
    const entry = { ...JSON.parse(row.entry_json), sessionId, updatedAt: now - age - i };
    db.prepare("INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at, status) VALUES (?, ?, ?, ?, ?)").run(key, sessionId, JSON.stringify(entry), entry.updatedAt, row.status);
    db.prepare("UPDATE session_nodes SET entry_valid = 1 WHERE session_key = ?").run(key);
    runKeys.push(key);
  }
  db.exec("COMMIT; PRAGMA wal_checkpoint(TRUNCATE);");
  db.close();
  closeOpenClawAgentDatabases();
  const pristine = `${agentDb}.sweep-pristine`;
  fs.copyFileSync(agentDb, pristine);
  const remaining = () => new DatabaseSync(agentDb, { readOnly: true }).prepare("SELECT session_key FROM session_nodes WHERE session_key LIKE '%:run:%' ORDER BY session_key").all().map((r) => r.session_key);
  const results = {};
  for (const [label, mod] of [["base", base], ["patched", patched]]) {
    closeOpenClawAgentDatabases();
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(agentDb + suffix, { force: true });
    fs.copyFileSync(pristine, agentDb);
    const t = performance.now();
    const r = await sweep(mod, now);
    results[label] = { pruned: r.pruned, swept: r.swept, remaining: remaining(), ms: Math.round(performance.now() - t) };
  }
  closeOpenClawAgentDatabases();
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(agentDb + suffix, { force: true });
  fs.renameSync(pristine, agentDb);
  log("sweep.equivalence", { runKeys: runKeys.length, base: { ...results.base, remaining: results.base.remaining.length }, patched: { ...results.patched, remaining: results.patched.remaining.length } });
  assert.equal(results.base.pruned, 30);
  assert.deepEqual(results.patched.remaining, results.base.remaining);
  assert.equal(results.patched.pruned, results.base.pruned);
}

// ---- workboard: lifecycle candidates for every card's session key and run id ----
if (SCENARIOS.has("workboard")) {
  const wbDb = path.join(WORK_DIR, "workboard.sqlite");
  fs.copyFileSync(path.join(FIXTURE_DIR, "v-workboard.sqlite"), wbDb);
  const store = await loadPair("sqlite-store-CH-caj1l.js");
  const api = await loadPair("runtime-api-1CCazqtv.js");
  const baseStores = store.base.t({ dbPath: wbDb });
  const patchedStores = store.patched.t({ dbPath: wbDb });
  const A = new api.base.r(baseStores.cards, baseStores);
  const B = new api.patched.r(patchedStores.cards, patchedStores);
  const links = await baseStores.cards.listLifecycleLinks();
  const sources = [];
  for (const link of links) {
    const key = link.sessionKey ?? link.execution?.sessionKey;
    const run = link.runId ?? link.execution?.runId;
    if (key) sources.push({ sessionKey: key, ...run ? { runId: run } : {} });
    if (key) sources.push({ sessionKey: key });
    if (run) sources.push({ runId: run });
    if (key) sources.push({ sessionKey: key, runId: "ab-other-run" });
  }
  sources.push({ sessionKey: "agent:makaron:subagent:ab-unknown" }, { runId: "ab-unknown" });
  // Probe a deterministic subset for equivalence (each base call costs a full parse).
  const step = Math.max(1, Math.floor(sources.length / Number(process.env.WB_PROBES ?? 400)));
  let compared = 0, matched = 0;
  const mismatches = [];
  for (let i = 0; i < sources.length; i += step) {
    const a = (await A.listLifecycleCandidates(sources[i])).map((c) => c.id);
    const b = (await B.listLifecycleCandidates(sources[i])).map((c) => c.id);
    compared += 1;
    if (a.length) matched += 1;
    if (project(a) !== project(b)) mismatches.push({ source: sources[i], a, b });
  }
  log("workboard.equivalence", { cards: links.length, archived: links.filter((l) => l.metadata?.archivedAt).length, sources: sources.length, compared, withMatches: matched, mismatches: mismatches.length, sample: mismatches.slice(0, 3) });
  assert.equal(mismatches.length, 0, "lifecycle candidates differ");
  assert(matched > 0, "probes must match cards");
  const probe = sources[0];
  log("workboard.base", await measure("listLifecycleCandidates V", async () => (await A.listLifecycleCandidates(probe)).length));
  log("workboard.patched", await measure("listLifecycleCandidates release", async () => (await B.listLifecycleCandidates(probe)).length, REPEAT * 10));
  baseStores.close();
  patchedStores.close();
}

// ---- list: what one whole-store read costs (full and list projection) ----
if (SCENARIOS.has("list")) {
  const { t: listSessionEntriesCore } = await import(path.join(DIST, "session-accessor.entry-B8arwR7t.js"));
  const { a: listSessionEntriesReadOnly } = await import(path.join(DIST, "session-accessor.sqlite-entry-BlklNPKQ.js"));
  const db = new DatabaseSync(agentDb);
  const touch = () => db.prepare("UPDATE session_nodes SET last_read_at = coalesce(last_read_at, 0) WHERE session_key = (SELECT min(session_key) FROM session_nodes)").run();
  log("list.full", await measure("listSessionEntriesCore full projection", () => listSessionEntriesCore(scope).length, 3));
  log("list.listProjection", await measure("listSessionEntriesReadOnly list projection, cache invalidated", () => { touch(); return listSessionEntriesReadOnly({ ...scope, projection: "list" }).length; }, 3));
  db.close();
}

// ---- tasks: one maintenance sweep per process (ARM=base|patched) on V's task ledger ----
if (SCENARIOS.has("tasks")) {
  const arm = process.env.ARM ?? "base";
  const stateDb = path.join(stateDir, "state", "openclaw.sqlite");
  fs.mkdirSync(path.dirname(stateDb), { recursive: true });
  execFileSync("sqlite3", [path.join(process.env.VLAB_SHARED_STATE_DIR, "state", "openclaw.sqlite"), `.backup '${stateDb}'`]);
  {
    const db = new DatabaseSync(stateDb);
    db.exec(`PRAGMA foreign_keys = OFF; ATTACH '${path.join(FIXTURE_DIR, "v-state-tasks.sqlite")}' AS v; BEGIN;`);
    for (const table of ["task_runs", "task_delivery_state"]) {
      const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
      const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
      const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
      db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
    }
    db.exec("COMMIT; DETACH v;");
    db.close();
  }
  // Both arms run in separate processes; pruning compares cleanupAfter with Date.now(), so freeze the
  // clock at the export time to compare ledgers.
  const frozenNow = Date.parse(process.env.TASKS_NOW ?? "2026-10-20T04:07:00Z");
  Date.now = () => frozenNow;
  const { base, patched } = await loadPair("task-registry.maintenance-C4nMaDY9.js");
  const mod = arm === "patched" ? patched : base;
  const { E: listTaskRecords } = await import(path.join(DIST, "task-registry-B4-CJZk7.js"));
  const tasks = listTaskRecords().length;
  const dump = () => sha(project(new DatabaseSync(stateDb, { readOnly: true }).prepare("SELECT task_id, status, cleanup_after, ended_at, error FROM task_runs ORDER BY task_id").all()));
  const first = await measure(`runTaskRegistryMaintenance ${arm}, first sweep`, async () => project(await mod.p()), 1);
  const ledgerAfterFirst = dump();
  const steady = await measure(`runTaskRegistryMaintenance ${arm}, steady sweeps`, async () => project(await mod.p()), REPEAT);
  log(`tasks.${arm}`, { tasks, first, steady, ledgerAfterFirst, ledgerAfterSteady: dump(), tasksAfter: listTaskRecords().length });
}

console.log(JSON.stringify(out, null, 1));
process.exit(0);
