// Before/after evidence for transcript-index-preflight-readonly-v1 on a private copy of
// the shared VLab makaron database (VLab candidate, real runtime chunks).
//
// Both reconcile chunks (V's original and the patched release file in this runtime)
// run with their real sibling chunks: the native transcript index chunk
// (session-transcript-index-9itOio9h.js: orphan sweep, dirty-session query), node:sqlite,
// worker_threads. Only three siblings are replaced, because the real ones would open the
// 7 GB copy through the db91 integrity gate: the Agent DB handle and write transaction
// (BEGIN IMMEDIATE ... COMMIT on one cached connection, timed = writer hold), the
// session write queue and the process lease (pass-through).
//
// 1. Plant orphans in realistic shapes: a deleted session window (FK cascade leaves FTS
//    rows), a cleared transcript (state and FTS rows stay), rows written with foreign keys off.
// 2. Original preflight in a transaction that is captured, then rolled back.
// 3. Patched preflight for real. Index tables must equal the original's captured result.
// 4. No-orphan steady state, cold and warm: writer hold and main-thread stall of each.
// 5. A dirty session: both start the reconcile worker (stubbed, records the start).
//
// Output: one JSON object on stdout; assertion failures exit non-zero.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const root = process.env.VLAB_CANDIDATE_DATA;
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(root && runtime, "VLAB_CANDIDATE_DATA and VLAB_CANDIDATE_RUNTIME are required");
const find = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = find(p); if (r) return r; }
    else if (e.name === "openclaw-agent.sqlite" && p.includes("/makaron/")) return p;
  }
};
const file = find(root);
assert(file, `makaron openclaw-agent.sqlite not found under ${root}`);
const dist = path.join(runtime, "openclaw", "dist");
const work = fs.mkdtempSync(path.join(path.dirname(file), ".preflight-evidence-"));
const RECONCILE = "session-transcript-reconcile-j5qhAafV.js";
const originalSource = fs.readFileSync("release/captured/v2026.9.1-db91.6-voice-reliability-20261008/dist/" + RECONCILE, "utf8");
const patchedSource = fs.readFileSync(path.join(dist, RECONCILE), "utf8");
assert(patchedSource.includes("transcript-index-preflight-readonly-v1"), "runtime does not carry the patched reconcile chunk");
assert(!originalSource.includes("transcript-index-preflight-readonly-v1"));

// ---- stub siblings ----
fs.writeFileSync(path.join(work, "agent-db.mjs"), `import { DatabaseSync } from "node:sqlite";
const cache = new Map();
export const g = (options) => {
  let entry = cache.get(options.path);
  if (!entry) { const db = new DatabaseSync(options.path); db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 30000"); cache.set(options.path, entry = { db }); }
  return entry;
};
export const y = (operation, options, transactionOptions) => {
  const probe = globalThis.__probe;
  const database = g(options);
  const t0 = process.hrtime.bigint();
  database.db.exec("BEGIN IMMEDIATE");
  let result;
  try { result = operation(database); } catch (error) { database.db.exec("ROLLBACK"); throw error; }
  const holdMs = Number(process.hrtime.bigint() - t0) / 1e6;
  if (probe.rollback) { probe.captured.push(probe.capture(database.db)); database.db.exec("ROLLBACK"); }
  else database.db.exec("COMMIT");
  probe.writes.push({ label: transactionOptions.operationLabel, holdMs: Math.round((probe.rollback ? holdMs : Number(process.hrtime.bigint() - t0) / 1e6) * 10) / 10 });
  return result;
};
export const close = () => { for (const { db } of cache.values()) db.close(); cache.clear(); };
`);
fs.writeFileSync(path.join(work, "scope.mjs"), "export const d = (s) => s; export const m = (s) => s; export const p = async (options, fn) => fn();\n");
fs.writeFileSync(path.join(work, "lease.mjs"), "export const withAgentDatabaseProcessLease = async ({ fn }) => fn();\n");
const relink = (source) => source.replace(/"\.\/([^"]+\.(?:js|mjs))"/gu, (whole, name) => {
  if (name.startsWith("openclaw-agent-db-CUTe8BX6")) return JSON.stringify(pathToFileURL(path.join(work, "agent-db.mjs")).href);
  if (name.startsWith("session-accessor.sqlite-scope-")) return JSON.stringify(pathToFileURL(path.join(work, "scope.mjs")).href);
  if (name === "agent-db-process-coordinator.mjs") return JSON.stringify(pathToFileURL(path.join(work, "lease.mjs")).href);
  return JSON.stringify(pathToFileURL(path.join(dist, name)).href);
});
fs.writeFileSync(path.join(work, "original.mjs"), relink(originalSource));
fs.writeFileSync(path.join(work, "patched.mjs"), relink(patchedSource));
const originalModule = await import(pathToFileURL(path.join(work, "original.mjs")).href);
const patchedModule = await import(pathToFileURL(path.join(work, "patched.mjs")).href);
const agentDb = await import(pathToFileURL(path.join(work, "agent-db.mjs")).href);
const index = await import(pathToFileURL(path.join(dist, "session-transcript-index-9itOio9h.js")).href);

// ---- helpers ----
const evict = () => {
  for (const f of [file, `${file}-wal`]) if (fs.existsSync(f)) execFileSync("python3", ["-c", "import os,sys\nfd=os.open(sys.argv[1],os.O_RDONLY)\nos.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)\nos.close(fd)", f]);
};
const digest = (db) => {
  const h = createHash("sha256");
  const counts = {};
  for (const [table, sql] of [
    ["active", "SELECT session_id, active_position, event_seq FROM session_transcript_active_events ORDER BY session_id, active_position"],
    ["fts", "SELECT rowid AS id, session_id, message_id FROM session_transcript_fts ORDER BY rowid"],
    ["state", "SELECT session_id, indexed_seq, needs_rebuild FROM session_transcript_index_state ORDER BY session_id"],
  ]) {
    let n = 0;
    for (const row of db.prepare(sql).iterate()) { h.update(JSON.stringify(row)); n += 1; }
    h.update(`|${table}|`);
    counts[table] = n;
  }
  return { sha: h.digest("hex"), ...counts };
};
const fakeWorker = (probe) => () => {
  probe.workerStarted = true;
  const listeners = new Map();
  const worker = { on(e, f) { listeners.set(e, f); return worker; }, once(e, f) { listeners.set(e, f); return worker; }, postMessage() {}, removeAllListeners() { listeners.clear(); }, terminate: async () => 0 };
  setImmediate(() => { listeners.get("message")?.({ type: "done" }); setImmediate(() => listeners.get("exit")?.(0)); });
  return worker;
};
async function run(module, { rollback = false, cold = false } = {}) {
  agentDb.close();
  if (cold) evict();
  const probe = globalThis.__probe = { writes: [], captured: [], rollback, capture: digest, workerStarted: false };
  // Main-thread stall: the longest gap between 5 ms ticks while the preflight runs.
  let last = performance.now(), maxGapMs = 0;
  const tick = setInterval(() => { const now = performance.now(); maxGapMs = Math.max(maxGapMs, now - last); last = now; }, 5);
  const t0 = performance.now();
  const result = await module.n({ agentId: "makaron", path: file, createWorker: fakeWorker(probe) });
  const totalMs = performance.now() - t0;
  clearInterval(tick);
  maxGapMs = Math.max(maxGapMs, performance.now() - last);
  agentDb.close();
  delete globalThis.__probe;
  const r1 = (v) => Math.round(v * 10) / 10;
  return { result, workerStarted: probe.workerStarted, writes: probe.writes, maxHoldMs: Math.max(0, ...probe.writes.map((w) => w.holdMs)), writeTransactions: probe.writes.length, mainThreadMaxStallMs: r1(maxGapMs), totalMs: r1(totalMs), captured: probe.captured };
}
const orphanCounts = (db) => Object.fromEntries(["session_transcript_active_events", "session_transcript_fts", "session_transcript_index_state"].map((t) => [t, db.prepare(`SELECT count(*) AS n FROM ${t} WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)`).get().n]));

const out = { file, sizeBytes: fs.statSync(file).size };
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 30000");
out.orphansAtStart = orphanCounts(db);
out.needingAtStart = index.o(db).length;

// ---- 1. plant orphans ----
const pick = db.prepare(`SELECT f.session_id AS id, count(*) AS fts FROM session_transcript_fts f
  WHERE f.session_id IN (SELECT session_id FROM session_transcript_index_state WHERE needs_rebuild = 0)
  GROUP BY f.session_id HAVING count(*) BETWEEN 3 AND 40 ORDER BY f.session_id LIMIT 3`).all();
assert.equal(pick.length, 3, "need three small indexed sessions");
const [windowGone, transcriptCleared, fkOff] = pick.map((r) => r.id);
db.exec("BEGIN IMMEDIATE");
db.prepare("DELETE FROM session_windows WHERE session_id = ?").run(windowGone);
db.prepare("DELETE FROM transcript_events WHERE session_id = ?").run(transcriptCleared);
db.exec("COMMIT");
db.exec("PRAGMA foreign_keys = OFF");
db.exec("BEGIN IMMEDIATE");
// FK off: the transcript of fkOff disappears without cascading to its active rows.
db.prepare("DELETE FROM transcript_events WHERE session_id = ?").run(fkOff);
db.prepare("INSERT INTO session_transcript_index_state (session_id, indexed_seq, needs_rebuild, updated_at) VALUES (?, 0, 0, 1)").run("vlab-preflight-ghost-state");
const ftsInsert = db.prepare("INSERT INTO session_transcript_fts (text, session_id, message_id, role, timestamp) VALUES (?, ?, ?, 'user', 1)");
for (let n = 0; n < 1200; n++) ftsInsert.run(`ghost ${n}`, "vlab-preflight-ghost-fts", `ghost-${n}`);
db.exec("COMMIT");
db.exec("PRAGMA foreign_keys = ON");
out.planted = { windowGone, transcriptCleared, fkOff, orphans: orphanCounts(db), needing: index.o(db).length };
const beforeDigest = digest(db);
db.close();

// ---- 2/3. original (captured, rolled back) vs patched (committed) ----
out.originalWithOrphans = await run(originalModule, { rollback: true, cold: true });
const originalAfter = out.originalWithOrphans.captured.at(-1);
const reopened = () => { const d = new DatabaseSync(file); d.exec("PRAGMA foreign_keys = ON"); return d; };
{ const d = reopened(); assert.deepEqual(digest(d), beforeDigest, "rollback left the copy unchanged"); d.close(); }
out.patchedWithOrphans = await run(patchedModule, { cold: true });
{
  const d = reopened();
  const after = digest(d);
  out.equivalence = { before: beforeDigest, original: originalAfter, patched: after, orphansLeft: orphanCounts(d), same: after.sha === originalAfter.sha };
  d.close();
}
assert.equal(out.equivalence.same, true, "patched preflight must leave the index tables the original leaves");
assert.ok(beforeDigest.fts - originalAfter.fts >= 1200, "planted FTS orphans were removed");
assert.deepEqual(out.patchedWithOrphans.result, out.originalWithOrphans.result);
for (const w of out.patchedWithOrphans.writes) assert.ok(w.holdMs < 200, `patched orphan delete held the writer ${w.holdMs} ms`);

// ---- 4. steady state: no orphans ----
out.steady = {};
for (const [label, module, rollback] of [["original", originalModule, true], ["patched", patchedModule, false]]) {
  out.steady[label] = { cold: [], warm: [] };
  for (let i = 0; i < 2; i++) out.steady[label].cold.push(await run(module, { rollback, cold: true }));
  for (let i = 0; i < 3; i++) out.steady[label].warm.push(await run(module, { rollback, cold: false }));
}
for (const r of [...out.steady.patched.cold, ...out.steady.patched.warm]) {
  assert.equal(r.writeTransactions, 0);
  assert.equal(r.workerStarted, false);
}

// ---- 5. dirty session: both start the reconcile worker ----
{
  const d = reopened();
  const live = d.prepare("SELECT session_id FROM session_transcript_index_state ORDER BY session_id LIMIT 1").get().session_id;
  d.prepare("UPDATE session_transcript_index_state SET needs_rebuild = 1 WHERE session_id = ?").run(live);
  out.dirty = { session: live, needing: index.o(d).length };
  d.close();
}
out.dirty.original = await run(originalModule, { rollback: true, cold: false });
out.dirty.patched = await run(patchedModule, { cold: false });
assert.equal(out.dirty.original.workerStarted, true);
assert.equal(out.dirty.patched.workerStarted, true);

// ---- summary ----
const strip = (r) => ({ maxHoldMs: r.maxHoldMs, writeTransactions: r.writeTransactions, mainThreadMaxStallMs: r.mainThreadMaxStallMs, totalMs: r.totalMs, workerStarted: r.workerStarted });
out.summary = {
  withOrphans: { original: strip(out.originalWithOrphans), patched: strip(out.patchedWithOrphans) },
  steady: Object.fromEntries(Object.entries(out.steady).map(([k, v]) => [k, { cold: v.cold.map(strip), warm: v.warm.map(strip) }])),
  dirty: { original: strip(out.dirty.original), patched: strip(out.dirty.patched) },
};
for (const r of [out.originalWithOrphans, out.patchedWithOrphans, out.dirty.original, out.dirty.patched, ...Object.values(out.steady).flatMap((v) => [...v.cold, ...v.warm])]) delete r.captured;
fs.rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify(out, null, 1));
