// Where does sessions.transcript-index.preflight spend its 1-10 s writer hold?
// Runs in a VLab candidate against a private SQLite backup of the shared VLab
// makaron database (VLAB_CANDIDATE_DATA). Every original statement runs inside
// BEGIN IMMEDIATE ... ROLLBACK, so the copy is unchanged.
//
// V 2026-10-08: the preflight held the makaron writer 9975 / 10166 / 9275 ms and
// interrupted chats ("Agent DB process coordinator wait exceeded 5000ms").
// Cold = this file's pages evicted from the page cache first (posix_fadvise
// DONTNEED on the copy only), the closest we get to V after a quiet spell.
//
// Output: one JSON object on stdout.
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.VLAB_CANDIDATE_DATA;
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
if (!root || !runtime) throw new Error("VLAB_CANDIDATE_DATA and VLAB_CANDIDATE_RUNTIME are required");
const find = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = find(p); if (r) return r; }
    else if (e.name === "openclaw-agent.sqlite" && p.includes("/makaron/")) return p;
  }
};
const file = process.env.PROBE_DB ?? find(root);
if (!file) throw new Error(`makaron openclaw-agent.sqlite not found under ${root}`);
const dist = path.join(runtime, "openclaw", "dist");
const index = await import(pathToFileURL(path.join(dist, "session-transcript-index-9itOio9h.js")).href);
const deleteOrphaned = index.i;
const listNeeding = index.o;

const evict = () => {
  for (const f of [file, `${file}-wal`]) {
    if (!fs.existsSync(f)) continue;
    execFileSync("python3", ["-c", "import os,sys\nfd=os.open(sys.argv[1],os.O_RDONLY)\nos.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)\nos.close(fd)", f]);
  }
};
const db = new DatabaseSync(file);
db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
const ms = (fn) => { const t = process.hrtime.bigint(); const r = fn(); return [Math.round(Number(process.hrtime.bigint() - t) / 1e5) / 10, r]; };
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const out = { file, sizeBytes: fs.statSync(file).size, rows: {}, cold: {}, warm: {}, cold2: {}, plans: {} };

for (const t of ["transcript_events", "session_windows", "session_transcript_active_events", "session_transcript_index_state", "session_transcript_fts_content"]) {
  out.rows[t] = one(`SELECT count(*) n FROM "${t}"`).n;
}

const NOT_IN = "SELECT DISTINCT session_id FROM transcript_events";
const statements = {
  "delete-active": `DELETE FROM session_transcript_active_events WHERE session_id NOT IN (${NOT_IN})`,
  "delete-fts": `DELETE FROM session_transcript_fts WHERE session_id NOT IN (${NOT_IN})`,
  "delete-state": `DELETE FROM session_transcript_index_state WHERE session_id NOT IN (${NOT_IN})`,
};
const reads = {
  // loose index scan: one PK probe per distinct session
  "transcript-sessions": "WITH RECURSIVE s(id) AS (SELECT (SELECT min(session_id) FROM transcript_events) UNION ALL SELECT (SELECT min(session_id) FROM transcript_events WHERE session_id > s.id) FROM s WHERE s.id IS NOT NULL) SELECT count(*) n FROM s WHERE id IS NOT NULL",
  "active-orphans": "WITH RECURSIVE s(id) AS (SELECT (SELECT min(session_id) FROM session_transcript_active_events) UNION ALL SELECT (SELECT min(session_id) FROM session_transcript_active_events WHERE session_id > s.id) FROM s WHERE s.id IS NOT NULL) SELECT count(*) n FROM s WHERE id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = s.id)",
  "state-orphans": "SELECT count(*) n FROM session_transcript_index_state st WHERE NOT EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = st.session_id)",
  "fts-distinct-vtab": "SELECT count(DISTINCT session_id) n FROM session_transcript_fts",
  "fts-distinct-content": "SELECT count(DISTINCT c1) n FROM session_transcript_fts_content",
  "fts-session-rowids": "SELECT count(*) n FROM (SELECT c1, rowid FROM session_transcript_fts_content)",
};
for (const [label, sql] of Object.entries({ ...statements, ...reads })) out.plans[label] = all(`EXPLAIN QUERY PLAN ${sql}`).map((r) => r.detail);

const rolledBack = (fn) => {
  db.exec("BEGIN IMMEDIATE");
  try { return ms(fn); } finally { db.exec("ROLLBACK"); }
};
const pass = (bucket, cold) => {
  const res = out[bucket];
  const prep = () => { if (cold) evict(); };
  prep(); res["original-preflight"] = rolledBack(() => { deleteOrphaned(db); return listNeeding(db).length; });
  for (const [label, sql] of Object.entries(statements)) { prep(); res[label] = rolledBack(() => Number(db.prepare(sql).run().changes)); }
  prep(); res["list-needing"] = ms(() => listNeeding(db).length);
  for (const [label, sql] of Object.entries(reads)) { prep(); res[label] = ms(() => one(sql).n); }
};
pass("cold", true);
pass("warm", false);
pass("cold2", true);
console.log(JSON.stringify(out, null, 1));
