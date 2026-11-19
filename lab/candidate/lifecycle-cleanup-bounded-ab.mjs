// lifecycle-cleanup-bounded A/B: V's planSessionLifecycleArtifactCleanup against the release file, side
// by side in one process, on a V-scale session store (lab/candidate/v-scale-session-fixture.mjs).
//
// 1. clean   - the store as V has it (no Dreaming leftovers): both plans must be empty; measures the
//              synchronous main-thread time and the allocation of one planning pass (memory-core runs
//              it at every Gateway start and once more 5 min later).
// 2. seeded  - Dreaming leftovers and look-alikes planted next to the V-scale rows: entries old/recent,
//              foreign-owned, with a previous generation; orphan transcripts old/recent, with/without
//              the marker, referenced by another node, foreign-owned, another agent's. Both plans must
//              be deep-equal (entries with expected entries, delete plans with their snapshots) and
//              select exactly the expected keys and session ids.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { Session } from "node:inspector/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildVScaleSessionDatabase } from "./v-scale-session-fixture.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && sharedState, "candidate runtime environment is required");
const DIST = path.join(runtime, "openclaw", "dist");
const NAME = "session-accessor.sqlite-lifecycle-state-CrB_K2kA.js";
const RELEASE = path.resolve("lab/release-files/lifecycle-cleanup-bounded", NAME);
const plan = JSON.parse(fs.readFileSync("lab/lifecycle-cleanup-bounded.plan.json", "utf8")).files.find((f) => f.target.endsWith(`/${NAME}`));
const sha = (v) => createHash("sha256").update(v).digest("hex");
const base = fs.readFileSync(path.join(DIST, NAME));
assert.equal(sha(base), plan.before, "candidate runtime is not V's bytes for this file");
assert.equal(sha(fs.readFileSync(RELEASE)), plan.after, "release file hash");

const WORK = path.join(process.env.WORK_ROOT ?? "/var/tmp", `lifecycle-ab-${process.env.VLAB_CANDIDATE_ID ?? process.pid}`);
process.on("exit", () => { if (process.env.KEEP_WORK !== "1") fs.rmSync(WORK, { recursive: true, force: true }); });
const stateDir = path.join(WORK, "state");
const agentDb = path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite");
process.env.OPENCLAW_STATE_DIR = stateDir;
process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT = stateDir;
process.env.OPENCLAW_HOME = WORK;
const out = {};
const log = (k, v) => { out[k] = v; console.error(`[lifecycle-ab] ${k}: ${JSON.stringify(v)}`); };

log("fixture", buildVScaleSessionDatabase({ runtime, srcPath: path.join(sharedState, "agents", "makaron", "agent", "openclaw-agent.sqlite"), dstPath: agentDb, orphanWindows: Number(process.env.ORPHAN_WINDOWS ?? 4700) }));

// both chunks side by side: V's file under its own name, the release under another name in the same dist
const patchedName = NAME.replace(/\.js$/u, ".LCBPATCH.js");
fs.copyFileSync(RELEASE, path.join(DIST, patchedName));
process.on("exit", () => fs.rmSync(path.join(DIST, patchedName), { force: true }));
const oldMod = await import(path.join(DIST, NAME));
const newMod = await import(path.join(DIST, patchedName));
const { g: openOpenClawAgentDatabase } = await import(path.join(DIST, "openclaw-agent-db-CUTe8BX6.js"));

const NOW = Date.now();
const params = {
  agentId: "makaron",
  archiveRemovedEntryTranscripts: false,
  archiveDirectory: path.join(stateDir, "agents", "makaron", "sessions"),
  pluginOwnerId: "memory-core",
  sessionKeySegmentPrefix: "dreaming-narrative-",
  transcriptContentMarker: "\"runId\":\"dreaming-narrative-",
  orphanTranscriptMinAgeMs: 300_000,
  nowMs: NOW,
};
const inspector = new Session();
inspector.connect();
async function measure(fn) {
  global.gc?.();
  await inspector.post("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const before = process.memoryUsage().heapUsed;
  const t = performance.now();
  let peak = before;
  const value = fn();
  const ms = performance.now() - t;
  peak = Math.max(peak, process.memoryUsage().heapUsed);
  const { profile } = await inspector.post("HeapProfiler.stopSampling");
  const allocated = profile.samples.reduce((sum, s) => sum + s.size, 0);
  return { ms: Math.round(ms), allocatedMb: Math.round(allocated / 1048576), heapAfterMb: Math.round(peak / 1048576), value };
}
const normalize = (p) => ({
  entries: p.entries.map((e) => ({ sessionKey: e.sessionKey, expectedEntry: e.expectedEntry ?? null })),
  deletePlans: p.deletePlans.map((d) => ({ ...d })),
});
const database = () => openOpenClawAgentDatabase({ agentId: "makaron" });
// the canonical-key scan runs once per connection/path; take it before measuring either side
database();
newMod.o(database(), params);

// release path as cleanupSessionLifecycleArtifactsCore runs it: marker prescan outside the writer lane
// (async, one small read-only page per event-loop turn), then the synchronous plan
async function newPath() {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const t = performance.now();
  const markedOrphanSessionIds = await newMod.w({ agentId: "makaron" }, params);
  const prescanMs = Math.round(performance.now() - t);
  delay.disable();
  const r = await measure(() => newMod.o(database(), { ...params, markedOrphanSessionIds }));
  return { ...r, prescanMs, prescanMaxBlockMs: Math.round(delay.max / 1e6), marked: markedOrphanSessionIds.size };
}

// ---- 1. clean ----
const clean = {};
// the release first: V's pass leaves gigabytes of garbage that the next measurement would collect
const settle = async () => { for (let i = 0; i < 3; i += 1) { global.gc?.(); await new Promise((r) => setTimeout(r, 2000)); } };
for (const label of ["new", "old", "new2", "old2"]) {
  await settle();
  const r = label.startsWith("old") ? await measure(() => oldMod.o(database(), params)) : await newPath();
  clean[label] = { ms: r.ms, allocatedMb: r.allocatedMb, heapAfterMb: r.heapAfterMb, prescanMs: r.prescanMs, prescanMaxBlockMs: r.prescanMaxBlockMs, entries: r.value.entries.length, deletePlans: r.value.deletePlans.length };
}
log("clean", clean);
assert.equal(clean.old.entries + clean.old.deletePlans + clean.new.entries + clean.new.deletePlans, 0, "a clean V-scale store must plan nothing");

// ---- 2. seeded ----
const marker = params.transcriptContentMarker;
const db = new DatabaseSync(agentDb);
db.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 30000;");
const winCols = db.prepare("PRAGMA table_info(session_windows)").all().map((c) => c.name);
const insWin = db.prepare(`INSERT INTO session_windows (${winCols.map((c) => `"${c}"`).join(",")}) VALUES (${winCols.map(() => "?").join(",")})`);
const insNode = db.prepare("INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at) VALUES (?, ?, ?, ?)");
const insEvent = db.prepare("INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)");
const old = NOW - 3_600_000;
const recent = NOW - 10_000;
const anyKey = db.prepare("SELECT session_key FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' LIMIT 1").get().session_key;
const window = (sessionId, sessionKey, owner = null, at = old) => insWin.run(...winCols.map((c) => ({ session_id: sessionId, session_key: sessionKey, reason: "initial", session_scope: "conversation", created_at: at, updated_at: at, session_entry_provenance: 0, acp_owned: 0, plugin_owner_id: owner })[c] ?? null));
const transcript = (sessionId, at, withMarker) => {
  insEvent.run(sessionId, 0, JSON.stringify({ type: "session", version: 3, id: sessionId }), at);
  insEvent.run(sessionId, 1, `{"type":"custom",${withMarker ? `${marker}light-${sessionId}",` : ""}"data":"x"}`, at);
};
const node = (sessionKey, entry, at) => insNode.run(sessionKey, entry.sessionId, JSON.stringify(entry), at);
const ids = {};
const id = (name) => (ids[name] ??= randomUUID());
const seeded = {
  // Dreaming entries
  D1_old: `agent:makaron:dreaming-narrative-light-${id("k1")}`,
  D2_recent: `agent:makaron:dreaming-narrative-light-${id("k2")}`,
  D3_foreign: `agent:makaron:dreaming-narrative-light-${id("k3")}`,
  D4_prev: `agent:makaron:dreaming-narrative-deep-${id("k4")}`,
  R_ref: `agent:makaron:explicit:lifecycle-ab-ref-${id("k5")}`,
};
db.exec("BEGIN");
window(id("d1"), seeded.D1_old, "memory-core"); transcript(id("d1"), old, true); node(seeded.D1_old, { sessionId: id("d1"), updatedAt: old }, old);
window(id("d2"), seeded.D2_recent, "memory-core", recent); transcript(id("d2"), recent, true); node(seeded.D2_recent, { sessionId: id("d2"), updatedAt: recent }, recent);
window(id("d3"), seeded.D3_foreign, "workboard"); transcript(id("d3"), old, true); node(seeded.D3_foreign, { sessionId: id("d3"), updatedAt: old }, old);
window(id("d4prev"), seeded.D4_prev, "memory-core"); transcript(id("d4prev"), old, true);
window(id("d4"), seeded.D4_prev, "memory-core"); transcript(id("d4"), old, true); node(seeded.D4_prev, { sessionId: id("d4"), previousSessionId: id("d4prev"), updatedAt: old }, old);
// orphan transcripts (historical windows of an existing V-scale key)
window(id("o1"), anyKey); transcript(id("o1"), old, true); // old + marker -> deleted
window(id("o2"), anyKey); transcript(id("o2"), old, true); // referenced by R_ref -> kept
window(id("r"), seeded.R_ref); node(seeded.R_ref, { sessionId: id("r"), previousSessionId: id("o2"), updatedAt: recent }, recent);
window(id("o3"), anyKey, null, recent); transcript(id("o3"), recent, true); // too recent -> kept
window(id("o4"), anyKey); transcript(id("o4"), old, false); // no marker -> kept
window(id("o5"), anyKey, "workboard"); transcript(id("o5"), old, true); // foreign owner -> kept
window(id("o6"), "agent:other:main"); transcript(id("o6"), old, true); // another agent -> kept
window(id("o7"), anyKey, "memory-core"); transcript(id("o7"), old, true); // own plugin -> deleted
db.exec("UPDATE session_nodes SET entry_valid = 1 WHERE entry_valid = 0");
db.exec("COMMIT");
db.close();

const seededRuns = {};
const plans = {};
for (const label of ["new", "newNoPrescan", "old"]) {
  await settle();
  const r = label === "old" ? await measure(() => oldMod.o(database(), params)) : label === "new" ? await newPath() : await measure(() => newMod.o(database(), params));
  plans[label] = normalize(r.value);
  seededRuns[label] = { ms: r.ms, allocatedMb: r.allocatedMb, prescanMs: r.prescanMs, prescanMaxBlockMs: r.prescanMaxBlockMs, entries: r.value.entries.map((e) => e.sessionKey), deletePlans: r.value.deletePlans.map((d) => d.sessionId) };
}
const name = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
const named = (r) => ({ ...r, entries: r.entries.map((k) => Object.keys(seeded).find((n) => seeded[n] === k) ?? k), deletePlans: r.deletePlans.map((s) => name[s] ?? s) });
log("seeded", { newNoPrescan: named(seededRuns.newNoPrescan), old: { ...seededRuns.old, entries: seededRuns.old.entries.map((k) => Object.keys(seeded).find((n) => seeded[n] === k) ?? k), deletePlans: seededRuns.old.deletePlans.map((s) => name[s] ?? s) }, new: { ...seededRuns.new, entries: seededRuns.new.entries.map((k) => Object.keys(seeded).find((n) => seeded[n] === k) ?? k), deletePlans: seededRuns.new.deletePlans.map((s) => name[s] ?? s) } });
assert.deepEqual(plans.new, plans.old, "the release plan differs from V's plan");
assert.deepEqual(plans.newNoPrescan, plans.old, "the release plan without a prescan differs from V's plan");
assert.deepEqual(seededRuns.new.entries.toSorted(), [seeded.D1_old, seeded.D4_prev].toSorted(), "expected Dreaming entries");
assert.deepEqual(seededRuns.new.deletePlans.map((s) => name[s]).toSorted(), ["d1", "d4", "d4prev", "o1", "o7"].toSorted(), "expected session states");
console.log(JSON.stringify(out, null, 1));
console.log(`PASS lifecycle-cleanup-bounded: clean old ${clean.old.ms}/${clean.old2.ms} ms ${clean.old.allocatedMb} MB -> new plan ${clean.new.ms}/${clean.new2.ms} ms ${clean.new.allocatedMb} MB + prescan ${clean.new.prescanMs} ms (longest block ${clean.new.prescanMaxBlockMs} ms); seeded plans identical`);
