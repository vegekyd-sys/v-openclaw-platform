// gateway-freeze-lookups A/B on a copy of V's makaron session tables (see lab/gateway-freeze-lookups.md).
//
// Data (read-only export from V, kept outside the repository; FIXTURE_DIR on the VLab host):
//   makaron.sqlite   session_nodes / session_windows / session_participants /
//                    session_transcript_index_state / session_progress_cards
// The agent database is created by OpenClaw itself (schema, triggers) under WORK_DIR and filled from the
// export; entry_valid keeps V's value. A few synthetic rows cover what V's data lacks (two keys sharing a
// session id, an internal-session-effects row, a tombstone).
//
// Arms: V's chunks and the release chunks loaded side by side from the candidate dist (each copy has its
// own module state). Both import the runtime's combined store and matching reader, which must be V's
// (sessions-search-exact-read).
//   1. equivalence: resolveSessionKeyForRun(runId, opts) on both, cache reset before every case
//   2. cost per call: hit and miss
//   3. event stream: OpenClaw's own agent event bus and server-chat createAgentEventHandler, events of
//      runs whose session the handler cannot see (the three ways it happens on V), dispatched to the
//      handler asynchronously as server-runtime-subscriptions does; counts whole-store lookups, measures
//      main-thread blocking and compares everything the handler sends.
//   4. task maintenance: getInspectableActiveTaskRestartBlockers (the host-thaw / restartChannels path)
//      and reconcileTaskLookupToken over subagent / cli tasks pointing at real, missing, internal,
//      tombstoned and wedged sessions; results compared, cost per call.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { Session } from "node:inspector/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime is required");
const DIST = path.join(runtime, "openclaw", "dist");
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? "/var/tmp/rsl-20261027";
const WORK_DIR = process.env.WORK_DIR ?? path.join(FIXTURE_DIR, `run-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
const REPEAT = Number(process.env.REPEAT ?? 3);
const SAMPLE = Number(process.env.SAMPLE ?? 60);
const STREAM_EVENTS = Number(process.env.STREAM_EVENTS ?? 15);
const STREAM_RUNS = Number(process.env.STREAM_RUNS ?? 2);
const STREAM_RATE = Number(process.env.STREAM_RATE ?? 20);
const REL = "lab/release-files/gateway-freeze-lookups";
const NAME = "server-session-key-ZtX3Ble7.js";
const MAINT = "task-registry.maintenance-C4nMaDY9.js";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const out = {};
const progressLog = path.join(FIXTURE_DIR, `${path.basename(WORK_DIR)}.progress.log`);
const log = (key, value) => {
  out[key] = value;
  const line = `[${new Date().toISOString()}] ${key}: ${JSON.stringify(value)}`;
  console.error(line);
  fs.appendFileSync(progressLog, `${line}\n`);
};

// ---- state directory ----
const stateDir = path.join(WORK_DIR, "state");
const agentDb = (agentId) => path.join(stateDir, "agents", agentId, "agent", "openclaw-agent.sqlite");
if (process.env.KEEP_WORK !== "1") process.on("exit", () => fs.rmSync(WORK_DIR, { recursive: true, force: true }));
fs.mkdirSync(path.dirname(agentDb("makaron")), { recursive: true });
{
  // V's session.maintenance (warn); nothing here writes sessions after the fixture is built.
  const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
  config.session = { ...config.session, maintenance: { mode: "warn", pruneAfter: "14d", maxEntries: 6000, resetArchiveRetention: "14d", maxDiskBytes: "48gb" } };
  fs.writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(config, null, 2));
}
process.env.OPENCLAW_STATE_DIR = stateDir;
process.env.OPENCLAW_CONFIG_PATH = path.join(stateDir, "openclaw.json");
process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT = stateDir;
process.env.OPENCLAW_HOME = WORK_DIR;

// ---- side-by-side chunks ----
const plan = JSON.parse(fs.readFileSync("lab/gateway-freeze-lookups.plan.json", "utf8"));
const planFileFor = (name) => plan.files.find((f) => f.target === `openclaw/dist/${name}`);
const planFile = planFileFor(NAME);
const copies = [];
const place = (name, source) => {
  const file = path.join(DIST, name);
  fs.writeFileSync(file, source);
  copies.push(file);
  return file;
};
process.on("exit", () => { for (const file of copies) fs.rmSync(file, { force: true }); });
assert.equal(sha(fs.readFileSync(path.join(DIST, NAME), "utf8")), planFile.before, `V bytes: ${NAME}`);
// V's combined store with match support (sessions-search-exact-read) and its row reader
assert.equal(sha(fs.readFileSync(path.join(DIST, "combined-store-gateway-BwDhjbIt.js"), "utf8")), "9cb53296f60b4d375f19cdd0e52d104a7b255c9feaae34656654c718bb6f5c51", "V combined store");
assert.equal(sha(fs.readFileSync(path.join(DIST, "v-session-entries-matching.mjs"), "utf8")), "d2d2c2cd7b33622fabcd1ab52ec003d2bf471735c64b49030294a76f27af7e02", "V matching reader");
assert.equal(sha(fs.readFileSync(path.join(DIST, "server-chat-Mh_L0_2e.js"), "utf8")), "9c2f1bb1fd63684edfc89c1314fb668c5e4363b98e269507b9caf81ec052faed", "V server-chat");
assert.equal(sha(fs.readFileSync(path.join(DIST, MAINT), "utf8")), planFileFor(MAINT).before, `V bytes: ${MAINT}`);
const releaseSource = fs.readFileSync(path.join(REL, NAME), "utf8");
assert.equal(sha(releaseSource), planFile.after, "release bytes");
const maintReleaseSource = fs.readFileSync(path.join(REL, MAINT), "utf8");
assert.equal(sha(maintReleaseSource), planFileFor(MAINT).after, `release bytes: ${MAINT}`);
const base = await import(path.join(DIST, NAME));
const patched = await import(place(NAME.replace(/\.js$/u, ".GFLPATCHED.js"), releaseSource));
const maintArms = { base: await import(path.join(DIST, MAINT)), patched: await import(place(MAINT.replace(/\.js$/u, ".GFLPATCHED.js"), maintReleaseSource)) };
assert.notEqual(base.n, patched.n);
const arms = { base: { resolve: base.n, reset: base.t }, patched: { resolve: patched.n, reset: patched.t } };

// ---- allocation and main-thread measurement ----
const inspector = new Session();
inspector.connect();
async function measure(label, fn, repeat = REPEAT) {
  // The lookup is synchronous, so wall time per call is main-thread time.
  global.gc?.();
  await inspector.post("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const times = [];
  let value;
  for (let i = 0; i < repeat; i++) {
    const t = performance.now();
    try { value = fn(i); } catch (error) { value = { threw: String(error?.message ?? error) }; }
    times.push(performance.now() - t);
  }
  const { profile } = await inspector.post("HeapProfiler.stopSampling");
  const allocated = profile.samples.reduce((sum, s) => sum + s.size, 0);
  const sorted = [...times].sort((a, b) => a - b);
  return {
    label,
    repeat,
    msMedian: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
    msMax: Math.round(sorted.at(-1) * 10) / 10,
    allocatedMBPerCall: Math.round(allocated / repeat / 1e5) / 10,
    value: value ?? null,
  };
}

// ---- fixture: agent database built by OpenClaw, filled from V's export ----
const { g: openOpenClawAgentDatabase, a: closeOpenClawAgentDatabases } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));
const uuidFrom = (seed) => {
  const h = sha(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const synthetic = {};
{
  const t = performance.now();
  openOpenClawAgentDatabase({ agentId: "makaron" });
  closeOpenClawAgentDatabases();
  const db = new DatabaseSync(agentDb("makaron"));
  db.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000;");
  db.exec(`ATTACH '${path.join(FIXTURE_DIR, "makaron.sqlite")}' AS v`);
  const copy = (table) => {
    const cols = db.prepare(`PRAGMA main.table_info(${table})`).all().map((c) => c.name);
    const src = new Set(db.prepare(`PRAGMA v.table_info(${table})`).all().map((c) => c.name));
    const shared = cols.filter((c) => src.has(c)).map((c) => `"${c}"`).join(",");
    db.exec(`DELETE FROM main.${table}; INSERT INTO main.${table} (${shared}) SELECT ${shared} FROM v.${table}`);
    return db.prepare(`SELECT count(*) AS n FROM main.${table}`).get().n;
  };
  db.exec("BEGIN");
  const counts = {};
  for (const table of ["session_nodes", "session_windows", "session_participants", "session_transcript_index_state", "session_progress_cards"]) counts[table] = copy(table);
  db.exec("UPDATE main.session_nodes SET entry_valid = (SELECT s.entry_valid FROM v.session_nodes s WHERE s.session_key = main.session_nodes.session_key)");
  db.exec("UPDATE main.session_windows SET primary_conversation_id = NULL");
  db.exec("COMMIT");
  // The indexed lookup relies on the writer's projection current_session_id = entry.sessionId.
  counts.entryJsonMB = Math.round(db.prepare("SELECT sum(length(entry_json)) AS n FROM main.session_nodes").get().n / 1e5) / 10;
  counts.columnDiffersFromEntry = db.prepare("SELECT count(*) AS n FROM main.session_nodes WHERE entry_valid = 1 AND current_session_id IS NOT json_extract(entry_json, '$.sessionId')").get().n;
  counts.sessionIdIndex = db.prepare("SELECT name FROM main.sqlite_schema WHERE type = 'index' AND tbl_name = 'session_nodes' AND sql LIKE '%current_session_id%'").all().map((r) => r.name);
  db.exec("DETACH v");
  const insert = (key, entry, extra = {}) => {
    db.prepare("INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at, status, label) VALUES (?, ?, ?, ?, ?, ?)").run(key, extra.currentSessionId ?? entry.sessionId, extra.entryJson ?? JSON.stringify(entry), entry.updatedAt ?? Date.now(), null, null);
    db.prepare("UPDATE session_nodes SET entry_valid = ? WHERE session_key = ?").run(extra.entryValid ?? 1, key);
    if (extra.window) db.prepare("INSERT INTO session_windows (session_id, session_key, created_at, updated_at) VALUES (?, ?, ?, ?)").run(extra.currentSessionId ?? entry.sessionId, key, entry.updatedAt ?? Date.now(), entry.updatedAt ?? Date.now());
  };
  const donorRow = db.prepare("SELECT entry_json FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' AND archived_at IS NULL ORDER BY session_key LIMIT 1").get();
  const { label: _l, spawnedBy: _s, parentSessionKey: _p, archivedAt: _x, ...donor } = JSON.parse(donorRow.entry_json);
  const now = Date.now();
  // two keys sharing one session id, the second fresher (selection picks it)
  synthetic.shared = { sessionId: uuidFrom("rsl-shared"), keys: [`agent:makaron:rsl-shared-old-${uuidFrom("a")}`, `agent:makaron:rsl-shared-new-${uuidFrom("b")}`] };
  insert(synthetic.shared.keys[0], { ...donor, sessionId: synthetic.shared.sessionId, updatedAt: now - 60_000 });
  insert(synthetic.shared.keys[1], { ...donor, sessionId: synthetic.shared.sessionId, updatedAt: now });
  // two keys sharing one session id with the same updatedAt (ambiguous: no key)
  synthetic.tie = { sessionId: uuidFrom("rsl-tie"), keys: [`agent:makaron:rsl-tie-a-${uuidFrom("c")}`, `agent:makaron:rsl-tie-b-${uuidFrom("d")}`] };
  for (const key of synthetic.tie.keys) insert(key, { ...donor, sessionId: synthetic.tie.sessionId, updatedAt: now - 1000 });
  // an internal-session-effects row (the whole-store read skips it)
  synthetic.internal = { key: `agent:makaron:internal-session-effects:rsl-${uuidFrom("e")}`, sessionId: uuidFrom("rsl-internal") };
  insert(synthetic.internal.key, { ...donor, sessionId: synthetic.internal.sessionId });
  // a tombstone kept for its transcript window
  synthetic.tombstone = { key: `agent:makaron:rsl-tombstone-${uuidFrom("f")}`, sessionId: uuidFrom("rsl-tombstone") };
  insert(synthetic.tombstone.key, { sessionId: synthetic.tombstone.sessionId }, { entryJson: "{}", entryValid: -1, window: true });
  // a session whose id is a structural suffix of its key (the selection's structural rule)
  synthetic.structural = { sessionId: uuidFrom("rsl-structural") };
  synthetic.structural.keys = [`agent:makaron:rsl-x:${synthetic.structural.sessionId}`, `agent:makaron:rsl-y-${uuidFrom("g")}`];
  insert(synthetic.structural.keys[0], { ...donor, sessionId: synthetic.structural.sessionId, updatedAt: now - 5000 });
  insert(synthetic.structural.keys[1], { ...donor, sessionId: synthetic.structural.sessionId, updatedAt: now - 5000 });
  // a subagent session whose orphan recovery is tombstoned (task maintenance marks its task lost with the reason)
  synthetic.wedged = { key: `agent:makaron:subagent:rsl-wedged-${uuidFrom("h")}`, sessionId: uuidFrom("rsl-wedged"), reason: "rsl wedged reason" };
  insert(synthetic.wedged.key, { ...donor, sessionId: synthetic.wedged.sessionId, subagentRecovery: { wedgedAt: now - 120_000, wedgedReason: synthetic.wedged.reason } });
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  log("fixture", { counts, synthetic, ms: Math.round(performance.now() - t) });
}
// The Gateway keeps the writable handle open; so does this process.
openOpenClawAgentDatabase({ agentId: "makaron" });

// ---- 1. equivalence ----
const STREAM_ONLY = process.env.STREAM_ONLY === "1";
const rows = (() => {
  const db = new DatabaseSync(agentDb("makaron"), { readOnly: true });
  try { return db.prepare("SELECT session_key, current_session_id, archived_at FROM session_nodes WHERE current_session_id IS NOT NULL ORDER BY session_key").all(); } finally { db.close(); }
})();
const nightshift = rows.filter((r) => r.session_key.includes(":subagent:workboard-nightshift-"));
const others = rows.filter((r) => !r.session_key.includes(":subagent:workboard-nightshift-") && !r.session_key.includes(":rsl-"));
const spread = (list, n) => Array.from({ length: Math.min(n, list.length) }, (_, i) => list[Math.floor((i * list.length) / Math.min(n, list.length))]);
const realIds = [...spread(nightshift, SAMPLE / 2), ...spread(others, SAMPLE / 2)].map((r) => r.current_session_id);
const runIds = [
  ...realIds.map((id) => ["real", id]),
  ...realIds.slice(0, 5).map((id) => ["real upper case", id.toUpperCase()]),
  ...[synthetic.shared, synthetic.tie, synthetic.internal, synthetic.tombstone, synthetic.structural].map((s, i) => [`synthetic ${["shared", "tie", "internal", "tombstone", "structural"][i]}`, s.sessionId]),
  ...Array.from({ length: 10 }, () => ["unknown uuid", randomUUID()]),
  ...Array.from({ length: 5 }, () => ["unknown workboard run", `workboard:${randomUUID()}:${Date.now()}`]),
  ["announce run id", `announce:codex-native:${randomUUID()}:${randomUUID()}:succeeded`],
  ["empty run id", ""],
];
const optionSets = [["agentId makaron", { agentId: "makaron" }], ["no agentId", undefined], ["agentId v-codex", { agentId: "v-codex" }]];
const call = (arm, runId, opts) => {
  arms[arm].reset();
  try { return { key: arms[arm].resolve(runId, opts) ?? null }; } catch (error) { return { threw: String(error?.message ?? error) }; }
};
if (!STREAM_ONLY) {
  const t = performance.now();
  const summary = {};
  const diffs = [];
  for (const [kind, runId] of runIds) {
    for (const [optLabel, opts] of optionSets) {
      const a = call("base", runId, opts);
      const b = call("patched", runId, opts);
      const label = `${kind} / ${optLabel}`;
      summary[label] ??= { n: 0, resolved: 0, missing: 0, threw: 0 };
      summary[label].n++;
      summary[label][a.threw ? "threw" : a.key ? "resolved" : "missing"]++;
      if (a.threw) summary[label].error ??= a.threw.slice(0, 200);
      if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ label, runId, base: a, patched: b });
    }
  }
  // cache behaviour: a hit is remembered, a miss for 1 s, on both arms
  for (const arm of Object.keys(arms)) {
    arms[arm].reset();
    const id = realIds[0];
    const first = arms[arm].resolve(id, { agentId: "makaron" });
    const t1 = performance.now();
    const second = arms[arm].resolve(id, { agentId: "makaron" });
    summary[`cache ${arm}`] = { same: first === second, secondCallMs: Math.round((performance.now() - t1) * 100) / 100 };
  }
  // switch off restores the whole-store read in the release chunk
  process.env.OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT = "0";
  const offStart = performance.now();
  const off = call("patched", randomUUID(), { agentId: "makaron" });
  summary.switchOff = { ...off, ms: Math.round(performance.now() - offStart) };
  delete process.env.OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT;
  log("equivalence", { cases: Object.values(summary).reduce((n, s) => n + (s.n ?? 0), 0), differences: diffs.length, diffs: diffs.slice(0, 20), summary, ms: Math.round(performance.now() - t) });
  assert.equal(diffs.length, 0, "equivalence");
  assert(summary.switchOff.ms > 200, "switch off reads the whole store");
}

// ---- 2. cost per call ----
if (!STREAM_ONLY) {
  const hit = nightshift.at(-1).current_session_id;
  for (const [label, runId] of [["hit (night shift session id)", hit], ["miss (unknown run id)", randomUUID()], ["miss (workboard run id)", `workboard:${randomUUID()}:1`]]) {
    for (const arm of ["base", "patched"]) {
      log(`cost.${arm} ${label}`, await measure(`${arm}: ${label}`, () => { arms[arm].reset(); return arms[arm].resolve(runId, { agentId: "makaron" }) ?? null; }, arm === "base" ? REPEAT : REPEAT * 20));
    }
  }
}

// ---- 3. event stream through OpenClaw's agent event bus and server-chat ----
const events = await import(path.join(DIST, "agent-events-Con5xUCM.js"));
const registry = await import(path.join(DIST, "agent-run-registry-D84MDeZl.js"));
const chat = await import(path.join(DIST, "server-chat-Mh_L0_2e.js"));
const emitAgentEvent = events.i;
const onAgentRuntimeEvent = events.p;
const registerAgentRunContext = registry.h;
const clearAgentRunContext = registry.a;

async function stream(armName, scenario) {
  const arm = arms[armName];
  arm.reset();
  const sent = [];
  const record = (kind) => (...args) => sent.push([kind, JSON.parse(JSON.stringify(args, (k, v) => (k === "ts" ? 0 : v)))]);
  const lookups = [];
  const resolveSessionKeyForRun = (runId, opts) => {
    const t = performance.now();
    const value = arm.resolve(runId, opts);
    lookups.push(performance.now() - t);
    return value;
  };
  const handler = chat.createAgentEventHandler({
    broadcast: record("broadcast"),
    broadcastToConnIds: record("broadcastToConnIds"),
    nodeSendToSession: record("nodeSendToSession"),
    agentRunSeq: new Map(),
    chatRunState: chat.createChatRunState(),
    resolveSessionKeyForRun,
    clearAgentRunContext,
    toolEventRecipients: new Map(),
    sessionEventSubscribers: chat.createSessionEventSubscriberRegistry(),
    sessionMessageSubscribers: chat.createSessionMessageSubscriberRegistry(),
    persistGatewaySessionLifecycleEventForEvent: async () => {},
    clearTrackedActiveRun: () => {},
    settleTrackedTerminal: () => {},
    trackTrackedRunTerminalPersistence: () => false,
  });
  // server-runtime-subscriptions hands each event to the handler on a later microtask
  const pending = new Set();
  const unsubscribe = onAgentRuntimeEvent((evt) => {
    const p = Promise.resolve().then(() => handler(evt)).catch((error) => sent.push(["dispatch failed", String(error?.message ?? error)]));
    pending.add(p);
    p.then(() => pending.delete(p));
  });
  const realKey = others.find((r) => r.session_key.includes(":feishu:direct:"))?.session_key ?? others[0].session_key;
  const runs = Array.from({ length: scenario.runs }, (_, i) => `${scenario.prefix}${randomUUID()}${i}`);
  for (const runId of runs) scenario.setup?.(runId, realKey);
  // main-thread blocking as an interval timer sees it
  let lagMax = 0;
  let lagSum = 0;
  let last = performance.now();
  const tick = setInterval(() => { const now = performance.now(); const lag = Math.max(0, now - last - 10); lagMax = Math.max(lagMax, lag); lagSum += lag; last = now; }, 10);
  // A fixed number of events per run (the same events for both arms). Each round waits for the previous
  // round's handlers and then 1000 / STREAM_RATE ms, longer than server-chat's live text pacing (75 ms),
  // so neither arm coalesces deltas and the handler output must be identical.
  const started = performance.now();
  let emitted = 0;
  for (let round = 0; round < STREAM_EVENTS; round++) {
    await Promise.all(pending);
    await new Promise((resolve) => setTimeout(resolve, 1000 / STREAM_RATE));
    for (const runId of runs) {
      scenario.emit(runId, realKey, round);
      emitted++;
    }
  }
  await Promise.all(pending);
  const wallMs = performance.now() - started;
  clearInterval(tick);
  unsubscribe();
  for (const runId of runs) clearAgentRunContext(runId);
  const slow = lookups.filter((ms) => ms > 100);
  return {
    runs: runs.length,
    emitted,
    wallMs: Math.round(wallMs),
    lookups: lookups.length,
    lookupMsTotal: Math.round(lookups.reduce((a, b) => a + b, 0)),
    lookupsOver100ms: slow.length,
    lookupMsMax: Math.round(Math.max(0, ...lookups)),
    timerLagMaxMs: Math.round(lagMax),
    timerLagTotalMs: Math.round(lagSum),
    sent: sent.length,
    sentSample: sent.slice(0, 12).map(([kind, args]) => [kind, JSON.stringify(args).replace(/"runId":"[^"]*"/g, '"runId":"<run>"').slice(0, 400)]),
    sentDigest: sha(JSON.stringify(sent.map(([kind, args]) => [kind, args.map((a) => (a && typeof a === "object" && "runId" in a ? { ...a, runId: "<run>" } : a))]))),
  };
}
const assistant = (runId, i, extra = {}) => emitAgentEvent({ runId, agentId: "makaron", stream: "assistant", data: { text: `t${i}`, delta: `d${i}` }, ...extra });
const scenarios = {
  // a run registered without a session key (internal runs: prepareEmbeddedSessionState with
  // suppressVisibleSessionEffects and no sessionKey): every event, for the whole run
  "context without sessionKey": {
    runs: STREAM_RUNS,
    prefix: "",
    setup: (runId) => registerAgentRunContext(runId, { agentId: "makaron", isControlUiVisible: false, projectSessionActive: false }),
    emit: (runId, _key, i) => assistant(runId, i),
  },
  // no run context in the Gateway and no session key on the event
  "no context, no sessionKey": {
    runs: STREAM_RUNS,
    prefix: "workboard:",
    emit: (runId, _key, i) => assistant(runId, i),
  },
  // a channel reply run (isControlUiVisible: false) whose context is cleared in the same tick as its
  // last events: enrichAgentEvent drops their sessionKey, the handler runs after the clear
  "invisible run cleared after emit": {
    runs: STREAM_RUNS,
    prefix: "",
    emit: (runId, key, i) => {
      registerAgentRunContext(runId, { sessionKey: key, agentId: "makaron", isControlUiVisible: false });
      assistant(runId, i, { sessionKey: key });
      clearAgentRunContext(runId);
    },
  },
};
for (const [name, scenario] of Object.entries(scenarios)) {
  const result = {};
  for (const armName of ["base", "patched"]) result[armName] = await stream(armName, scenario);
  result.sameOutput = result.base.sentDigest === result.patched.sentDigest && result.base.sent === result.patched.sent;
  log(`stream ${name}`, result);
  assert(result.sameOutput, `handler output differs: ${name}`);
}

// ---- 4. task maintenance: restart blockers and task reconcile ----
{
  const { a: listSessionEntriesReadOnly } = await import(path.join(DIST, "session-accessor.sqlite-entry-BlklNPKQ.js"));
  const { o: resolveSessionStorePathCore } = await import(path.join(DIST, "paths-DDTeIhCT.js"));
  const { O: parseAgentSessionKey } = await import(path.join(DIST, "session-key-CRjxKW0X.js"));
  const { t: deriveSessionChatTypeFromKey } = await import(path.join(DIST, "session-chat-type-shared-BKTfMJHj.js"));
  const now = Date.now();
  const old = now - 3_600_000;
  const task = (i, fields) => ({ taskId: `rsl-task-${i}`, status: "running", createdAt: old, startedAt: old, lastEventAt: old, label: `t${i}`, task: `task ${i}`, ...fields });
  const sampleKeys = [...spread(nightshift, 30), ...spread(others, 10)].map((r) => r.session_key);
  const archived = rows.find((r) => r.archived_at && !r.session_key.includes(":rsl-"))?.session_key;
  const tasks = [
    ...sampleKeys.map((key, i) => task(i, { runtime: "subagent", childSessionKey: key })),
    ...Array.from({ length: 10 }, (_, i) => task(100 + i, { runtime: "subagent", childSessionKey: `agent:makaron:subagent:rsl-missing-${randomUUID()}` })),
    task(200, { runtime: "subagent", childSessionKey: synthetic.internal.key }),
    task(201, { runtime: "subagent", childSessionKey: synthetic.tombstone.key }),
    task(202, { runtime: "subagent", childSessionKey: synthetic.wedged.key }),
    ...(archived ? [task(203, { runtime: "subagent", childSessionKey: archived })] : []),
    task(204, { runtime: "subagent", childSessionKey: sampleKeys[0].toUpperCase() }),
    task(205, { runtime: "cli", childSessionKey: sampleKeys[1] }),
    task(206, { runtime: "cli", childSessionKey: "agent:makaron:feishu:direct:ou_rsl" }),
    task(207, { runtime: "cli", childSessionKey: sampleKeys[2], runId: `rsl-run-${randomUUID()}` }),
    task(208, { runtime: "subagent", childSessionKey: `agent:makaron:subagent:rsl-fresh-${randomUUID()}`, lastEventAt: now }),
    task(209, { runtime: "subagent", childSessionKey: sampleKeys[3], status: "queued" }),
    task(210, { runtime: "subagent", taskKind: "native" }),
    task(211, { runtime: "subagent", childSessionKey: `agent:v-codex:subagent:rsl-other-agent-${randomUUID()}` }),
  ];
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  const runtimeFor = () => ({
    ensureTaskRegistryReady: () => {},
    listTaskRecords: (filter) => tasks.filter((t) => !filter || filter(t)).map((t) => ({ ...t })),
    resolveTaskForLookupToken: (token) => (byId.has(token) ? { ...byId.get(token) } : undefined),
    listSessionEntries: listSessionEntriesReadOnly,
    resolveStorePath: resolveSessionStorePathCore,
    parseAgentSessionKey,
    deriveSessionChatTypeFromKey,
    getAgentRunContext: registry.c,
    isRuntimeAuthoritative: () => true,
    isCronJobActive: () => false,
    isBackgroundExecSessionActive: () => false,
    hasActiveAcpTurn: () => false,
    listTaskRegistryRecordsByRuntimeSourceIdFromSqlite: () => [],
  });
  for (const arm of Object.values(maintArms)) arm.m(runtimeFor());
  const realNow = Date.now;
  const frozen = (fn) => { Date.now = () => now; try { return fn(); } catch (error) { return { threw: String(error?.message ?? error) }; } finally { Date.now = realNow; } };
  const result = {};
  for (const [armName, arm] of Object.entries(maintArms)) {
    result[armName] = {
      blockers: frozen(() => arm.n()),
      reconciled: tasks.map((t) => frozen(() => arm.d(t.taskId))),
    };
  }
  const blockerDiff = JSON.stringify(result.base.blockers) !== JSON.stringify(result.patched.blockers);
  const reconcileDiffs = tasks.map((t, i) => [t.taskId, result.base.reconciled[i], result.patched.reconciled[i]]).filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b));
  const statusCount = (list) => list.reduce((acc, t) => { const k = t?.threw ? "threw" : `${t?.status}${t?.error ? `: ${t.error}` : ""}`; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  log("maintenance equivalence", {
    tasks: tasks.length,
    blockers: Array.isArray(result.base.blockers) ? result.base.blockers.length : result.base.blockers,
    blockerDiff,
    reconcileDifferences: reconcileDiffs.length,
    diffs: reconcileDiffs.slice(0, 10),
    reconciled: statusCount(result.base.reconciled),
  });
  assert(!blockerDiff, "restart blockers differ");
  assert.equal(reconcileDiffs.length, 0, "task reconcile differs");
  // switch off restores the whole-store read in the release chunk
  process.env.OPENCLAW_V_TASK_SESSION_LOOKUP_EXACT = "0";
  const offStart = performance.now();
  frozen(() => maintArms.patched.n());
  const offMs = Math.round(performance.now() - offStart);
  delete process.env.OPENCLAW_V_TASK_SESSION_LOOKUP_EXACT;
  log("maintenance switch off", { ms: offMs });
  assert(offMs > 200, "switch off reads the whole store");
  for (const armName of ["base", "patched"]) {
    log(`cost.${armName} restart blockers (${tasks.length} tasks)`, await measure(`${armName}: getInspectableActiveTaskRestartBlockers`, () => frozen(() => maintArms[armName].n()).length, armName === "base" ? REPEAT : REPEAT * 10));
  }
  for (const arm of Object.values(maintArms)) arm.f();
}

console.log(JSON.stringify(out, null, 1));
process.exit(0);
