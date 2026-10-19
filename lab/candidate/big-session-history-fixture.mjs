// Private makaron database holding shared-VLab sessions inflated to the size of V's largest
// sessions (2026-10-19: 26,604 rows / 265 MB, largest row 5.3 MB). Same construction as
// big-session-reads.mjs: the events repeat INFLATE times as one chain (ids suffixed, each block's
// roots attached to the previous block's leaf, derived identity/active-path/index-state rows written
// to match), and MEDIA_ROWS tool results get view_image-shaped inline base64 images.
// The shared VLab database is opened read-only; only the private copy is written.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// sessions: [{ sourceSession, inflate, mediaRows, mediaImagesPerRow, mediaImageChars }]
export function buildBigSessionDatabase({ runtime, srcPath, dstPath, sessions }) {
  assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec);
  dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  const ids = sessions.map((s) => s.sourceSession);
  const keys = ids.map((id) => {
    const key = src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(id)?.session_key;
    assert(key, `session ${id} is not in the shared VLab mirror`);
    assert.equal(src.prepare("SELECT current_session_id FROM session_nodes WHERE session_key = ?").get(key)?.current_session_id, id, `${id} is the current session of ${key}`);
    return key;
  });
  const convs = new Set();
  for (const id of ids) {
    for (const r of src.prepare("SELECT conversation_id FROM session_conversations WHERE session_id = ?").all(id)) convs.add(r.conversation_id);
    const primary = src.prepare("SELECT primary_conversation_id FROM session_windows WHERE session_id = ?").get(id)?.primary_conversation_id;
    if (primary) convs.add(primary);
  }
  const inList = (col, values) => `"${col}" IN (${values.map(() => "?").join(",")})`;
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts") || t.name.startsWith("session_transcript_fts")) continue;
    let where, args;
    if (cols.includes("session_id")) { where = inList("session_id", ids); args = ids; }
    else if (cols.includes("session_key")) { where = inList("session_key", keys); args = keys; }
    else if (cols.includes("conversation_id")) {
      if (!convs.size) continue;
      where = `"conversation_id" IN (${[...convs].map(() => "?").join(",")})`; args = [...convs];
    } else { where = ""; args = []; }
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).iterate(...args)) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();
  dst.close();
  return sessions.map((session, i) => ({ sessionKey: keys[i], ...inflateSession({ dstPath, sid: session.sourceSession, ...session }) }));
}

function inflateSession({ dstPath, sid, inflate, mediaRows, mediaImagesPerRow, mediaImageChars }) {
  const db = new DatabaseSync(dstPath);
  db.exec("PRAGMA foreign_keys = OFF");
  const events = db.prepare("SELECT seq, event_json, created_at FROM transcript_events WHERE session_id = ? ORDER BY seq").all(sid)
    .map((e) => ({ ...e, obj: JSON.parse(e.event_json) }));
  const identities = db.prepare("SELECT event_id, seq, event_type, parent_id, message_idempotency_key, created_at FROM transcript_event_identities WHERE session_id = ?").all(sid);
  const active = db.prepare("SELECT active_position, event_seq, message_position, context_eligible FROM session_transcript_active_events WHERE session_id = ? ORDER BY active_position").all(sid);
  const state = db.prepare("SELECT * FROM session_transcript_index_state WHERE session_id = ?").get(sid);
  assert(state && state.needs_rebuild === 0 && state.leaf_event_id, "source session index state is not usable");
  const header = events.find((e) => e.obj.type === "session");
  const idSet = new Set(identities.map((r) => r.event_id));
  const stride = Math.max(...events.map((e) => e.seq)) + 1;
  const body = events.filter((e) => e !== header);
  const activeBody = active.filter((a) => a.event_seq !== header?.seq);
  const messagePositions = active.map((a) => a.message_position).filter((p) => p !== null);
  assert.equal(messagePositions.length, state.active_message_count, "active message count mismatch");
  assert.equal(Math.max(...messagePositions) + 1, state.active_message_count, "message positions are not contiguous");
  const suffix = (id, b) => `${id}r${b}`;
  const rewrite = (value, b) => {
    if (typeof value === "string") return idSet.has(value) ? suffix(value, b) : value;
    if (Array.isArray(value)) return value.map((v) => rewrite(v, b));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, b)]));
    return value;
  };
  const insEvent = db.prepare("INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)");
  const insIdentity = db.prepare("INSERT INTO transcript_event_identities (session_id, event_id, seq, event_type, parent_id, message_idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insActive = db.prepare("INSERT INTO session_transcript_active_events (session_id, active_position, event_seq, message_position, context_eligible) VALUES (?, ?, ?, ?, ?)");
  const identityBySeq = new Map(identities.map((r) => [r.seq, r]));
  db.exec("BEGIN");
  let leaf = state.leaf_event_id;
  for (let b = 1; b < inflate; b++) {
    const previousLeaf = leaf;
    for (const e of body) {
      let obj = rewrite(e.obj, b);
      if ("parentId" in obj && obj.parentId === null) obj.parentId = previousLeaf;
      // V-shaped history: thinking/model switches live only near the start of a long session
      const metaToCustom = obj.type === "thinking_level_change" || obj.type === "model_change";
      if (metaToCustom) obj = { type: "custom", customType: "inflated-meta", id: obj.id, parentId: obj.parentId, timestamp: obj.timestamp, data: {} };
      const seq = b * stride + e.seq;
      insEvent.run(sid, seq, JSON.stringify(obj), e.created_at);
      const identity = identityBySeq.get(e.seq);
      if (identity) {
        insIdentity.run(sid, suffix(identity.event_id, b), seq, metaToCustom ? "custom" : identity.event_type,
          identity.parent_id === null ? previousLeaf : (idSet.has(identity.parent_id) ? suffix(identity.parent_id, b) : identity.parent_id),
          identity.message_idempotency_key === null ? null : `${identity.message_idempotency_key}:r${b}`, identity.created_at);
      }
    }
    activeBody.forEach((a, index) => {
      insActive.run(sid, active.length + (b - 1) * activeBody.length + index, b * stride + a.event_seq,
        a.message_position === null ? null : b * state.active_message_count + a.message_position, a.context_eligible);
    });
    leaf = suffix(state.leaf_event_id, b);
  }
  db.prepare("UPDATE session_transcript_index_state SET indexed_seq = ?, leaf_event_id = ?, active_event_count = ?, active_message_count = ? WHERE session_id = ?")
    .run((inflate - 1) * stride + stride - 1, leaf, active.length + (inflate - 1) * activeBody.length, inflate * state.active_message_count, sid);
  // view_image-shaped inline media, spread evenly over the inflated history
  const toolResults = db.prepare(`SELECT seq FROM transcript_events WHERE session_id = ?
    AND json_extract(event_json, '$.message.role') = 'toolResult' ORDER BY seq`).all(sid).map((r) => r.seq);
  const count = Math.min(mediaRows, toolResults.length);
  const picks = new Set(Array.from({ length: count }, (_, i) => toolResults[Math.floor((i + 0.5) * toolResults.length / count)]));
  const getEvent = db.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?");
  const setEvent = db.prepare("UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = ?");
  for (const seq of picks) {
    const obj = JSON.parse(getEvent.get(sid, seq).event_json);
    const images = Array.from({ length: mediaImagesPerRow }, () => ({ type: "image", data: randomBytes(Math.ceil(mediaImageChars * 3 / 4)).toString("base64").slice(0, mediaImageChars), mimeType: "image/jpeg" }));
    obj.message.content = [...(Array.isArray(obj.message.content) ? obj.message.content : [{ type: "text", text: String(obj.message.content ?? "") }]), ...images];
    setEvent.run(JSON.stringify(obj), sid, seq);
  }
  db.exec("COMMIT");
  const size = db.prepare("SELECT count(*) AS rows, sum(octet_length(event_json)) AS bytes, max(octet_length(event_json)) AS largest FROM transcript_events WHERE session_id = ?").get(sid);
  const check = db.prepare("PRAGMA foreign_key_check(session_transcript_active_events)").all().length + db.prepare("PRAGMA foreign_key_check(transcript_event_identities)").all().length;
  assert.equal(check, 0, "inflated derived rows reference missing events");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  return { sessionId: sid, rows: size.rows, mb: Math.round(size.bytes / 1e5) / 10, largestMb: Math.round(size.largest / 1e5) / 10, activeEvents: active.length + (inflate - 1) * activeBody.length, leaf };
}
