// Where does one makaron Agent DB write spend 1-3 s? Runs in a VLab candidate
// against a private SQLite backup of the shared VLab makaron database
// (VLAB_CANDIDATE_DATA). Every mutation runs inside BEGIN IMMEDIATE ... ROLLBACK
// except the explicit commit probe, which only touches the private copy.
//
// Output: one JSON object on stdout.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const root = process.env.VLAB_CANDIDATE_DATA;
if (!root) throw new Error("VLAB_CANDIDATE_DATA is required");
const find = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = find(p); if (r) return r; }
    else if (e.name === "openclaw-agent.sqlite" && p.includes("/makaron/")) return p;
  }
};
const file = process.env.PROBE_DB ?? find(root);
if (!file) throw new Error(`makaron openclaw-agent.sqlite not found under ${root}`);
const db = new DatabaseSync(file);
db.exec("PRAGMA busy_timeout=5000");
const out = { file, sizeBytes: fs.statSync(file).size };
const ms = (fn) => { const t = process.hrtime.bigint(); const r = fn(); return [Number(process.hrtime.bigint() - t) / 1e6, r]; };
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const timed = (label, sql, ...a) => { const [t, r] = ms(() => all(sql, ...a)); out.timings[label] = Math.round(t); return r; };
// Run fn inside a write transaction that is always rolled back; best of n runs plus all values.
const inTx = (label, fn, n = 3) => {
  const runs = [];
  for (let i = 0; i < n; i++) {
    db.exec("BEGIN IMMEDIATE");
    try { const [t] = ms(fn); runs.push(Math.round(t)); } finally { db.exec("ROLLBACK"); }
  }
  out.writes[label] = runs;
};
out.timings = {}; out.writes = {}; out.plans = {};

// --- scale ---
out.pragmas = { page_size: one("PRAGMA page_size").page_size, page_count: one("PRAGMA page_count").page_count, freelist: one("PRAGMA freelist_count").freelist_count, journal_mode: one("PRAGMA journal_mode").journal_mode };
out.rows = {};
for (const t of ["transcript_events", "session_windows", "session_transcript_active_events", "transcript_event_identities", "session_transcript_index_state", "session_transcript_fts_content", "session_transcript_fts_docsize", "session_transcript_fts_data", "memory_index_chunks"]) {
  try { const [t2, r] = ms(() => one(`SELECT count(*) n FROM "${t}"`)); out.rows[t] = r.n; out.timings[`count:${t}`] = Math.round(t2); } catch (e) { out.rows[t] = `err ${e.message}`; }
}
try { out.ftsDataBytes = one("SELECT sum(length(block)) b FROM session_transcript_fts_data").b; } catch {}
try { out.ftsContentTextBytes = one("SELECT sum(length(c0)) b FROM session_transcript_fts_content").b; } catch {}
try { out.eventJsonBytes = one("SELECT sum(length(event_json)) b FROM transcript_events").b; } catch {}
out.needsRebuild = one("SELECT count(*) n FROM session_transcript_index_state WHERE needs_rebuild != 0").n;
out.ftsSchema = one("SELECT sql FROM sqlite_master WHERE name='session_transcript_fts'")?.sql;

// --- which sessions are big ---
const top = timed("top-sessions", "SELECT session_id, count(*) events, sum(length(event_json)) bytes FROM transcript_events GROUP BY session_id ORDER BY events DESC LIMIT 5");
out.topSessions = top;
const small = one("SELECT session_id, count(*) events FROM transcript_events GROUP BY session_id HAVING count(*) BETWEEN 5 AND 20 LIMIT 1");
out.smallSession = small;
const big = top[0];

// --- query plans for the statements on the write path ---
const plan = (label, sql) => { out.plans[label] = all(`EXPLAIN QUERY PLAN ${sql}`).map((r) => r.detail); };
plan("fts-delete-by-session", `DELETE FROM session_transcript_fts WHERE session_id = '${big.session_id}'`);
plan("next-seq", `SELECT seq FROM transcript_events WHERE session_id = '${big.session_id}' ORDER BY seq DESC LIMIT 1`);
plan("unclassified", `SELECT session_id FROM session_transcript_active_events WHERE session_id = '${big.session_id}' AND context_eligible IS NULL LIMIT 1`);

// --- per-statement write costs, rolled back ---
const text = "今天的夜市图片生成好了，".repeat(60); // ~2 KB, like one assistant message
inTx("fts-insert-2KB", () => db.prepare("INSERT INTO session_transcript_fts(text, session_id, message_id, role, timestamp) VALUES (?,?,?,?,?)").run(text, big.session_id, "probe", "assistant", Date.now()), 5);
inTx("fts-delete-big-session", () => db.prepare("DELETE FROM session_transcript_fts WHERE session_id = ?").run(big.session_id), 2);
if (small) inTx("fts-delete-small-session", () => db.prepare("DELETE FROM session_transcript_fts WHERE session_id = ?").run(small.session_id), 2);
inTx("event-append", () => {
  const next = (one("SELECT seq FROM transcript_events WHERE session_id = ? ORDER BY seq DESC LIMIT 1", big.session_id)?.seq ?? -1) + 1;
  db.prepare("INSERT INTO transcript_events(session_id, seq, event_json, created_at) VALUES (?,?,?,?)").run(big.session_id, next, JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text }] } }), Date.now());
  db.prepare("UPDATE session_windows SET updated_at = ? WHERE session_id = ?").run(Date.now(), big.session_id);
}, 5);
inTx("unclassified-check-big", () => one("SELECT session_id FROM session_transcript_active_events WHERE session_id = ? AND context_eligible IS NULL LIMIT 1", big.session_id), 3);
// Rebuild of the biggest session's FTS rows the way reconcile does it: delete, then reinsert its text.
inTx("fts-rebuild-big-session", () => {
  db.prepare("DELETE FROM session_transcript_fts WHERE session_id = ?").run(big.session_id);
  const ins = db.prepare("INSERT INTO session_transcript_fts(text, session_id, message_id, role, timestamp) VALUES (?,?,?,?,?)");
  for (const r of db.prepare("SELECT seq, substr(event_json, 1, 4000) j FROM transcript_events WHERE session_id = ? ORDER BY seq").iterate(big.session_id)) ins.run(r.j, big.session_id, String(r.seq), "x", 0);
}, 1);

// --- real commit on the private copy: FTS merge work shows up here ---
const commits = [];
for (let i = 0; i < 20; i++) {
  const [t] = ms(() => {
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO session_transcript_fts(text, session_id, message_id, role, timestamp) VALUES (?,?,?,?,?)").run(text + i, big.session_id, `probe-${i}`, "assistant", Date.now());
    db.exec("COMMIT");
  });
  commits.push(Math.round(t));
}
out.writes["fts-insert-commit-x20"] = commits;
console.log(JSON.stringify(out, null, 1));
