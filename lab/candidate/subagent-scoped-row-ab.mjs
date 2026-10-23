// subagent-scoped-row-index: row equivalence and cost, V's session-utils-list chunk vs the release chunk,
// side by side in one process over V's subagent registry and session store (lab/subagent-scoped-row-index.md).
//
// Data: FIXTURE_DIR/v-reg.sqlite, a read-only export of V's subagent_runs (state database) and
// session_nodes / session_participants (makaron agent database); kept outside the repository.
// The candidate dist carries the release store chunk (it only adds loadSubagentRunTreeFromSqlite);
// V's session-utils-list and the release one are loaded from it under other names.
//
// Compared per key: loadGatewaySessionLifecycleSnapshot (session events), loadGatewaySessionRow
// (transcript broadcasts) and buildGatewaySessionInfo (chat.history), as JSON. Keys: agent:makaron:main,
// every requester and controller in the registry, a spread of child sessions, store-child parents and
// other sessions. Then ROUNDS rounds of random in-memory runs (running, queued, regenerated, grandchild,
// controlled elsewhere, recently / long ended) over the same keys. V's chunk reads the registry through
// its 500 ms cache, which is cleared before each of its calls so both arms see the same persisted rows.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { Session } from "node:inspector/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/gwreg";
const WORK_DIR = path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const ROUNDS = Number(process.env.ROUNDS ?? 120);
const CHILD_KEYS = Number(process.env.CHILD_KEYS ?? 300);
const REPEAT = Number(process.env.REPEAT ?? 5);
const RELEASE_DIR = path.resolve("lab/release-files/subagent-scoped-row-index");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const out = {};
const progressLog = path.join(FIXTURE_DIR, `${path.basename(WORK_DIR)}.progress.log`);
const log = (key, value) => {
  out[key] = value;
  const line = `[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`;
  console.error(line);
  fs.appendFileSync(progressLog, `${line}\n`);
};
let seed = Number(process.env.SEED ?? 20261021);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (items) => items[Math.floor(rand() * items.length)];

// ---- private state on the root disk ----
const stateDir = path.join(WORK_DIR, "state");
const agentDb = path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite");
const stateDb = path.join(stateDir, "state", "openclaw.sqlite");
if (process.env.KEEP_WORK !== "1") process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));
fs.mkdirSync(path.dirname(agentDb), { recursive: true });
fs.mkdirSync(path.dirname(stateDb), { recursive: true });
fs.copyFileSync(process.env.OPENCLAW_CONFIG_PATH, path.join(stateDir, "openclaw.json"));
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
Object.assign(process.env, {
  OPENCLAW_STATE_DIR: stateDir,
  OPENCLAW_CONFIG_PATH: path.join(stateDir, "openclaw.json"),
  OPENCLAW_DB91_INTEGRITY_STATE_ROOT: stateDir,
  OPENCLAW_HOME: WORK_DIR,
});
const fixture = path.join(FIXTURE_DIR, "v-reg.sqlite");

// State database: shared VLab's, with V's subagent_runs.
execFileSync("sqlite3", [path.join(sharedState, "state", "openclaw.sqlite"), `.backup '${stateDb}'`]);
{
  const db = new DatabaseSync(stateDb);
  db.exec(`ATTACH '${fixture}' AS v; BEGIN; DELETE FROM main.subagent_runs;`);
  const cols = db.prepare("PRAGMA main.table_info(subagent_runs)").all().map((c) => `"${c.name}"`).join(",");
  db.exec(`INSERT INTO main.subagent_runs (${cols}) SELECT ${cols} FROM v.subagent_runs; COMMIT; DETACH v;`);
  db.close();
}
// Agent database: created by OpenClaw, filled with V's session rows (entry_valid kept).
const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
openOpenClawAgentDatabase({ agentId: "makaron" });
closeOpenClawAgentDatabases();
{
  const db = new DatabaseSync(agentDb);
  db.exec(`PRAGMA foreign_keys = OFF; ATTACH '${fixture}' AS v; BEGIN;`);
  for (const table of ["session_nodes", "session_participants"]) {
    const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
    const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
    const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
    db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
  }
  db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key); COMMIT; DETACH v;");
  db.close();
}

// ---- both session-utils-list chunks, one registry module ----
const NAME = "session-utils-list-BUP03AzS.js";
const plan = JSON.parse(fs.readFileSync("lab/subagent-scoped-row-index.plan.json", "utf8")).files;
const planFor = (name) => plan.find((f) => f.target.endsWith(`/${name}`));
const storeName = "subagent-registry.store.sqlite-hzGu4QSk.js";
assert.equal(sha(fs.readFileSync(path.join(DIST, storeName))), planFor(storeName).after, "candidate dist must carry the release store chunk");
const baseSource = fs.readFileSync(path.join(process.env.BASELINE_DIST ?? DIST, NAME), "utf8");
assert.equal(sha(baseSource), planFor(NAME).before, "candidate session-utils-list is not V's bytes");
const releaseSource = fs.readFileSync(path.join(RELEASE_DIR, NAME), "utf8");
assert.equal(sha(releaseSource), planFor(NAME).after);
const load = async (file, source) => {
  fs.writeFileSync(path.join(DIST, file), source);
  process.on("exit", () => fs.rmSync(path.join(DIST, file), { force: true }));
  return await import(path.join(DIST, file));
};
const base = await load("session-utils-list-SRBASE.js", baseSource);
const patched = await load("session-utils-list-SRPATCH.js", releaseSource);
const { n: loadSubagentRegistryFromSqlite, w: registry } = await import(path.join(DIST, storeName));
const { y: clearSubagentRunsReadCache } = await import(path.join(DIST, "subagent-registry-read-UaDFTyfW.js"));
const { a: listSessionEntriesReadOnly } = await import(path.join(DIST, "session-accessor.sqlite-entry-BlklNPKQ.js"));

const storePath = path.join(stateDir, "agents", "makaron", "sessions", "sessions.json");
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const store = Object.fromEntries(listSessionEntriesReadOnly({ agentId: "makaron", storePath, projection: "list" }).map(({ sessionKey, entry }) => [sessionKey, entry]));
const runRows = new DatabaseSync(fixture, { readOnly: true }).prepare("SELECT run_id, child_session_key, requester_session_key, controller_session_key, payload_json FROM subagent_runs").all();
const whitespaceKeys = runRows.filter((r) => [r.child_session_key, r.requester_session_key, r.controller_session_key ?? ""].some((k) => k !== k.trim())).length;
const requesters = [...new Set(runRows.flatMap((r) => [r.requester_session_key, r.controller_session_key].filter(Boolean)))];
const children = [...new Set(runRows.map((r) => r.child_session_key))];
const storeParents = [...new Set(Object.values(store).flatMap((e) => [e?.spawnedBy, e?.parentSessionKey].filter(Boolean)))];
const spread = (keys, n) => keys.filter((_k, i) => i % Math.max(1, Math.floor(keys.length / n)) === 0).slice(0, n);
const others = spread(Object.keys(store).filter((k) => !k.includes(":subagent:")), 60);
const keys = [...new Set(["agent:makaron:main", ...requesters, ...spread(children, CHILD_KEYS), ...storeParents, ...others])].filter((k) => store[k]).slice(0, Number(process.env.MAX_KEYS ?? Infinity));
log("fixture", { runs: runRows.length, storeEntries: Object.keys(store).length, requesters: requesters.length, children: children.length, storeParents: storeParents.length, keys: keys.length, whitespaceKeys });

const project = (value) => JSON.stringify(value, (_k, v) => (typeof v === "function" ? undefined : v));
const calls = [
  ["lifecycle", (m, key, now) => m.a(key, { now })],
  ["row", (m, key, now) => m.o(key, { now })],
  ["info", (m, key, now) => m.i({ cfg, storePath, store, key, entry: store[key], agentId: "makaron", now })],
];
let compared = 0, mismatches = [], baseMs = 0, patchedMs = 0, withChildren = 0, active = 0;
const compareKeys = (keyList, round) => {
  const now = Date.now();
  for (const key of keyList) for (const [label, call] of calls) {
    clearSubagentRunsReadCache();
    let t = performance.now();
    const a = project(call(base, key, now));
    baseMs += performance.now() - t;
    t = performance.now();
    const b = project(call(patched, key, now));
    patchedMs += performance.now() - t;
    compared += 1;
    if (a !== b && mismatches.length < 10) mismatches.push({ round, key, label, base: a.slice(0, 500), patched: b.slice(0, 500) });
    if (label === "info") {
      const row = JSON.parse(b);
      if (row?.childSessions?.length) withChildren += 1;
      if (row?.hasActiveSubagentRun) active += 1;
    }
  }
};
// Like V's Gateway after startup: every persisted run restored into the in-memory registry.
const restored = loadSubagentRegistryFromSqlite();
const restoreRegistry = (on) => {
  registry.clear();
  if (on) for (const [runId, entry] of restored) registry.set(runId, structuredClone(entry));
};
// Equivalence runs with EQUIV_MAX_RUNS (e.g. Infinity: every key takes the scoped path, main included);
// costs below use the shipped default.
if (process.env.EQUIV_MAX_RUNS) process.env.OPENCLAW_V_SCOPED_ROW_MAX_RUNS = process.env.EQUIV_MAX_RUNS;
compareKeys(keys, "persisted");
restoreRegistry(true);
compareKeys(keys, "restored");
restoreRegistry(false);
log("equivalence.persisted", { maxRuns: process.env.OPENCLAW_V_SCOPED_ROW_MAX_RUNS ?? "default 256", keys: keys.length, phases: ["registry empty", "all runs restored in memory"], compared, mismatches: mismatches.length, rowsWithChildren: withChildren, rowsActive: active, baseMs: Math.round(baseMs), patchedMs: Math.round(patchedMs), sample: mismatches.slice(0, 3) });

// ---- random in-memory runs over the persisted registry ----
const payloads = runRows.map((r) => ({ ...JSON.parse(r.payload_json), runId: r.run_id, childSessionKey: r.child_session_key, requesterSessionKey: r.requester_session_key, ...r.controller_session_key ? { controllerSessionKey: r.controller_session_key } : {} }));
let synthetic = 0;
function overlay(now, withRestored) {
  restoreRegistry(withRestored);
  const touched = [];
  const n = 1 + Math.floor(rand() * 10);
  for (let i = 0; i < n; i++) {
    const template = structuredClone(pick(payloads));
    const kind = pick(["running", "queued", "recent", "old", "regen", "grandchild", "controlled", "same-run"]);
    const run = kind === "same-run" ? template : { ...template, runId: `sr-${synthetic++}`, createdAt: kind === "old" ? template.createdAt - 1 : now - 120_000, generation: (template.generation ?? 1) + (kind === "regen" ? 1 + Math.floor(rand() * 2) : 0) };
    if (kind === "grandchild") {
      run.requesterSessionKey = template.childSessionKey;
      delete run.controllerSessionKey;
      run.childSessionKey = pick(children);
    }
    if (kind === "controlled") run.controllerSessionKey = pick(requesters);
    const ended = kind === "recent" ? now - 5 * 60_000 : kind === "old" ? now - 10 * 86_400_000 : undefined;
    if (kind === "running" || kind === "grandchild" || kind === "controlled" || kind === "same-run") {
      run.execution = { ...run.execution, status: "running", startedAt: now - 60_000 };
      delete run.execution.endedAt;
      run.sessionStartedAt = now - 60_000;
      delete run.cleanupCompletedAt;
      delete run.endedReason;
    } else if (kind === "queued") {
      run.execution = { status: "queued", lifecycleGeneration: run.execution?.lifecycleGeneration };
      delete run.sessionStartedAt;
      delete run.cleanupCompletedAt;
      delete run.endedReason;
    } else if (ended !== undefined) {
      run.execution = { ...run.execution, status: "terminal", endedAt: ended, outcome: { ...(run.execution?.outcome ?? { status: "ok" }), endedAt: ended } };
      if (rand() < 0.5) delete run.cleanupCompletedAt;
    }
    registry.set(run.runId, run);
    touched.push(run.childSessionKey, run.requesterSessionKey, run.controllerSessionKey, template.requesterSessionKey);
  }
  return [...new Set(touched)].filter((k) => k && store[k]);
}
const beforeRounds = compared;
for (let round = 0; round < ROUNDS; round++) {
  const now = Date.now();
  const touched = overlay(now, round % 2 === 1);
  compareKeys([...new Set(["agent:makaron:main", ...touched, pick(keys), pick(keys)])], round);
}
restoreRegistry(true);
log("equivalence.overlays", { rounds: ROUNDS, restoredRounds: Math.floor(ROUNDS / 2), compared: compared - beforeRounds, mismatchesTotal: mismatches.length, sample: mismatches.slice(0, 3) });
assert.equal(mismatches.length, 0, "rows differ");
if (ROUNDS > 0) assert(withChildren > 0 && active > 0, "comparisons must include rows with children and active runs");

// ---- cost per call ----
const inspector = new Session();
inspector.connect();
async function measure(label, fn, repeat = REPEAT) {
  global.gc?.();
  await inspector.post("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const times = [];
  for (let i = 0; i < repeat; i++) {
    const t = performance.now();
    fn(i);
    times.push(performance.now() - t);
  }
  const { profile } = await inspector.post("HeapProfiler.stopSampling");
  const sorted = times.sort((a, b) => a - b);
  return { label, repeat, msMedian: Math.round(sorted[Math.floor(repeat / 2)] * 10) / 10, msMax: Math.round(sorted.at(-1) * 10) / 10, allocatedMBPerCall: Math.round(profile.samples.reduce((s, x) => s + x.size, 0) / repeat / 1e5) / 10 };
}
const nightShiftChild = children.find((k) => k.includes("workboard-nightshift-") && store[k]) ?? children.find((k) => store[k]);
const groupKey = Object.keys(store).find((k) => k.includes(":group:")) ?? others[0];
// Costs with every run in memory, as on V, with the shipped threshold.
delete process.env.OPENCLAW_V_SCOPED_ROW_MAX_RUNS;
for (const [name, key] of [["nightShiftChild", nightShiftChild], ["group", groupKey], ["main", "agent:makaron:main"]]) {
  // V's chunk: a stale cache on every call is what V sees under a stream of events (>500 ms apart or not).
  log(`cost.${name}.base`, await measure(`lifecycle snapshot V ${name}`, () => { clearSubagentRunsReadCache(); base.a(key, {}); }));
  log(`cost.${name}.baseWarmCache`, await measure(`lifecycle snapshot V ${name}, cache warm`, () => base.a(key, {})));
  log(`cost.${name}.patched`, await measure(`lifecycle snapshot release ${name}`, () => patched.a(key, {})));
}
console.log(JSON.stringify(out, null, 1));
process.exit(0);
