// Probe: where does sessions.transcript-index.prepare spend its time on V-shaped sessions?
//
// prepare (session-transcript-index chunk, export g) runs in the reconcile Worker thread: one
// DEFERRED read transaction that reads every transcript row of the session twice (all rows for
// the branch tree, then the visible path row by row) and JSON.parses each one in full.
// This probe opens the shared VLab agent database read-only and, for its largest sessions, times
//   raw       iterate event_json only (SQLite read + string materialization)
//   parse     raw + JSON.parse of every row (what the tree pass does)
//   prepare   the runtime's own prepareSessionTranscriptProjection
// twice each (the second pass has a warm page cache). Nothing is written.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const shared = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && shared, "candidate runtime environment is required");
const TOP = Number(process.env.TOP ?? 6);
const dist = path.join(runtime, "openclaw", "dist");
const index = await import(path.join(dist, "session-transcript-index-9itOio9h.js"));
const prepare = index.g;
assert.equal(typeof prepare, "function");

const db = new DatabaseSync(path.join(shared, "agents/makaron/agent/openclaw-agent.sqlite"), { readOnly: true });
const top = db.prepare("SELECT session_id, active_event_count FROM session_transcript_index_state ORDER BY active_event_count DESC LIMIT ?").all(TOP * 3);
const sized = top.map((r) => ({ ...r, ...db.prepare("SELECT count(*) AS rows, sum(octet_length(event_json)) AS bytes FROM transcript_events WHERE session_id = ?").get(r.session_id) }))
  .sort((a, b) => b.bytes - a.bytes).slice(0, TOP);
const time = (fn) => { const t = performance.now(); const v = fn(); return [Math.round(performance.now() - t), v]; };
const out = [];
for (const s of sized) {
  const q = db.prepare("SELECT event_json, seq, created_at FROM transcript_events WHERE session_id = ? ORDER BY seq");
  const r = { session: s.session_id.slice(0, 8), rows: s.rows, mb: Math.round(s.bytes / 1e5) / 10, active: s.active_event_count };
  for (const pass of [1, 2]) {
    const [raw] = time(() => { let n = 0; for (const row of q.iterate(s.session_id)) n += row.event_json.length; return n; });
    const [parse] = time(() => { let n = 0; for (const row of q.iterate(s.session_id)) n += JSON.parse(row.event_json) ? 1 : 0; return n; });
    const [prep, plan] = time(() => prepare(db, s.session_id));
    r[`p${pass}`] = { raw, parse, prepare: prep, activeRows: plan?.activeRows.length, ftsRows: plan?.ftsRows.length };
  }
  out.push(r);
  console.log(JSON.stringify(r));
}
db.close();
fs.writeFileSync("probe-result.json", JSON.stringify(out, null, 2));
