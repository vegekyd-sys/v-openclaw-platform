// Corpus check for lab/release-files/mirror-facts-identity (PR #315): over every session of every
// agent database in the shared VLab mirror of V (read-only), do the identity rows give the same
// mirror facts as the full transcript read they replace?
//
// While a session's projection is dirty or behind, V's original readTranscriptMirrorFacts parsed
// every transcript event and kept, per idempotency key, the message of the last event carrying it.
// The patch reads transcript_event_identities instead (unless the session has no identity rows at
// all, which still takes the full read). The two agree only if every event carrying a key has an
// identity row owning that key. Known ways they can differ, counted here per session:
//   missing   a key on an event without an identity row (event without an id, or a key nulled by
//             a later duplicate append): the patched read would not report it, so a Codex mirror
//             would append it again (core append dedupe is identity based too, so it would not
//             stop that either);
//   extra     a key in an identity row that no event carries (should be impossible);
//   message   same key, different message (several events carry the key; identity keeps the owner,
//             the full read kept the last).
// Only the existence set changes what a mirror writes; the message only changes which persisted
// copy it reports as present.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const shared = process.env.VLAB_SHARED_STATE_DIR;
if (!shared) throw new Error("VLAB_SHARED_STATE_DIR is required");
const only = process.env.AGENTS ? new Set(process.env.AGENTS.split(",")) : undefined;
const hash = (value) => createHash("sha1").update(JSON.stringify(value) ?? "undefined").digest("hex").slice(0, 16);
const isRecord = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const messageOf = (event) => (isRecord(event) && isRecord(event.message) ? event.message : undefined);
const keyOf = (message) => (isRecord(message) && typeof message.idempotencyKey === "string" && message.idempotencyKey.trim() ? message.idempotencyKey.trim() : null);

const agentsDir = path.join(shared, "agents");
const report = { sharedStateDir: shared, startedAt: new Date().toISOString(), agents: [] };
for (const agent of fs.readdirSync(agentsDir).sort()) {
  if (only && !only.has(agent)) continue;
  const file = path.join(agentsDir, agent, "agent", "openclaw-agent.sqlite");
  if (!fs.existsSync(file)) continue;
  const t0 = Date.now();
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  if (!tables.has("transcript_events") || !tables.has("transcript_event_identities")) { db.close(); continue; }
  db.exec("BEGIN"); // one snapshot for both reads

  // Full read, as the original fallback: last event per key wins.
  const fallback = new Map();
  let scanned = 0;
  for (const row of db.prepare("SELECT session_id, seq, event_json FROM transcript_events WHERE instr(event_json, 'idempotencyKey') > 0 ORDER BY session_id, seq").iterate()) {
    scanned += 1;
    let event;
    try { event = JSON.parse(row.event_json); } catch { continue; }
    const message = messageOf(event);
    const key = keyOf(message);
    if (!key) continue;
    let s = fallback.get(row.session_id);
    if (!s) fallback.set(row.session_id, (s = new Map()));
    const prev = s.get(key);
    s.set(key, { seq: row.seq, hash: hash(message), hasId: typeof event.id === "string" && Boolean(event.id.trim()), copies: (prev?.copies ?? 0) + 1 });
  }

  // Identity rows, as the patched read: in seq order, so the last row per key wins too.
  const identity = new Map();
  for (const row of db.prepare("SELECT i.session_id, i.message_idempotency_key AS k, i.seq, e.event_json FROM transcript_event_identities AS i JOIN transcript_events AS e ON e.session_id = i.session_id AND e.seq = i.seq WHERE i.message_idempotency_key IS NOT NULL ORDER BY i.session_id, i.seq").iterate()) {
    let event;
    try { event = JSON.parse(row.event_json); } catch { event = undefined; }
    let s = identity.get(row.session_id);
    if (!s) identity.set(row.session_id, (s = new Map()));
    s.set(row.k, { seq: row.seq, hash: hash(messageOf(event)) });
  }
  const hasIdentityRows = new Set(db.prepare("SELECT DISTINCT session_id FROM transcript_event_identities").all().map((r) => r.session_id));
  const sessionsWithEvents = db.prepare("SELECT count(DISTINCT session_id) AS n FROM transcript_events").get().n;
  const lagging = db.prepare("SELECT count(*) AS n FROM session_transcript_index_state AS s WHERE s.needs_rebuild = 1 OR s.indexed_seq < (SELECT max(seq) FROM transcript_events AS e WHERE e.session_id = s.session_id)").get().n;
  db.exec("COMMIT");
  db.close();

  const totals = { sessionsWithEvents, sessionsWithKeys: 0, unindexedSessions: 0, comparedSessions: 0, keys: 0, missing: 0, missingNoEventId: 0, extra: 0, message: 0, messageDuplicateKey: 0, laggingNow: lagging };
  const examples = [];
  const sessionIds = new Set([...fallback.keys(), ...identity.keys()]);
  for (const sessionId of sessionIds) {
    const fb = fallback.get(sessionId) ?? new Map();
    const id = identity.get(sessionId) ?? new Map();
    if (fb.size) totals.sessionsWithKeys += 1;
    if (!hasIdentityRows.has(sessionId)) { totals.unindexedSessions += 1; continue; } // still a full read
    totals.comparedSessions += 1;
    const diff = { sessionId, missing: [], extra: [], message: [] };
    for (const [key, f] of fb) {
      totals.keys += 1;
      const i = id.get(key);
      if (!i) { totals.missing += 1; if (!f.hasId) totals.missingNoEventId += 1; diff.missing.push({ key: key.slice(0, 80), seq: f.seq, hasId: f.hasId, copies: f.copies }); continue; }
      if (i.hash !== f.hash) { totals.message += 1; if (f.copies > 1) totals.messageDuplicateKey += 1; diff.message.push({ key: key.slice(0, 80), identitySeq: i.seq, lastSeq: f.seq, copies: f.copies }); }
    }
    for (const key of id.keys()) if (!fb.has(key)) { totals.extra += 1; diff.extra.push(key.slice(0, 80)); }
    if (diff.missing.length || diff.extra.length || diff.message.length) examples.push({ sessionId, missing: diff.missing.length, extra: diff.extra.length, message: diff.message.length, sample: { missing: diff.missing.slice(0, 3), extra: diff.extra.slice(0, 3), message: diff.message.slice(0, 3) } });
  }
  report.agents.push({ agent, bytes: fs.statSync(file).size, scannedEventsWithKeyText: scanned, ms: Date.now() - t0, totals, sessionsWithDifferences: examples.length, examples: examples.slice(0, 20) });
  console.error(`[corpus] ${agent} done in ${Date.now() - t0} ms: ${JSON.stringify(totals)}`);
}
report.finishedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
