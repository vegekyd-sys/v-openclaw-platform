// V-scale makaron session store for candidate tests (lifecycle-cleanup-bounded, startup-heap-spike).
//
// V on 2026-11-13: session_nodes 20,920 rows / 1.85 GB entry JSON (skillsSnapshot ~55 KB with ~314
// skills + systemPromptReport ~32 KB a row; 18,638 subagent rows); 25,669 session_windows of which
// 4,713 are no node's current id, 4,692 of those with transcripts (120,148 events, 608 MB).
//
// The private database copies the shared VLab makaron schema and its session metadata (no
// transcripts, no memory index), then clones the shared store's real subagent rows (they pass the
// canonical-key scan) with fresh keys/ids and their skills list grown to V's size, and adds
// historical windows with plain transcripts. Nothing here reads or copies production V data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const META = ["session_nodes", "session_windows", "conversations", "session_conversations", "session_participants", "session_members"];

export function buildVScaleSessionDatabase({
  runtime,
  srcPath,
  dstPath,
  targetRows = 20900,
  targetEntryBytes = 92000,
  orphanWindows = 4700,
  orphanEventsPerWindow = 25,
  orphanEventBytes = 5200,
}) {
  assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec); dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    if (!META.includes(t.name) && (cols.includes("session_id") || cols.includes("session_key") || cols.includes("conversation_id"))) continue;
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}"`).iterate()) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();

  const nodeCols = dst.prepare("PRAGMA table_info(session_nodes)").all().map((c) => c.name);
  const winCols = dst.prepare("PRAGMA table_info(session_windows)").all().map((c) => c.name);
  const templates = dst.prepare("SELECT * FROM session_nodes WHERE session_key LIKE 'agent:makaron:subagent:%' AND entry_valid = 1").all();
  assert(templates.length > 0, "no subagent template rows in the shared VLab store");
  const windowOf = dst.prepare("SELECT * FROM session_windows WHERE session_id = ?");
  const insNode = dst.prepare(`INSERT INTO session_nodes (${nodeCols.map((c) => `"${c}"`).join(",")}) VALUES (${nodeCols.map(() => "?").join(",")})`);
  const insWin = dst.prepare(`INSERT INTO session_windows (${winCols.map((c) => `"${c}"`).join(",")}) VALUES (${winCols.map(() => "?").join(",")})`);
  const insEvent = dst.prepare("INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)");
  const grown = templates.map((row) => {
    const entry = JSON.parse(row.entry_json);
    const skills = entry.skillsSnapshot?.skills;
    if (Array.isArray(skills) && skills.length > 0) {
      const base = skills.slice();
      for (let i = 0; JSON.stringify(entry).length < targetEntryBytes; i += 1) {
        const s = base[i % base.length];
        skills.push({ ...s, name: `${s.name ?? "skill"}-v${i}` });
      }
    }
    return { row, entry, window: windowOf.get(row.current_session_id) };
  });
  const existing = dst.prepare("SELECT count(*) n FROM session_nodes").get().n;
  const now = Date.now();
  const day = 86400e3;
  dst.exec("BEGIN");
  let made = 0;
  for (let i = 0; existing + made < targetRows; i += 1) {
    const t = grown[i % grown.length];
    const sessionId = randomUUID();
    const sessionKey = `agent:makaron:subagent:${randomUUID()}`;
    const updatedAt = now - Math.floor(Math.random() * 30 * day);
    const entry = { ...t.entry, sessionId, updatedAt, label: `${t.entry.label ?? "subagent"}-${i}` };
    const r = { ...t.row, session_key: sessionKey, current_session_id: sessionId, entry_json: JSON.stringify(entry), updated_at: updatedAt, label: entry.label };
    insNode.run(...nodeCols.map((c) => r[c] ?? null));
    if (t.window) {
      const w = { ...t.window, session_id: sessionId, session_key: sessionKey, primary_conversation_id: null, created_at: updatedAt, updated_at: updatedAt };
      insWin.run(...winCols.map((c) => w[c] ?? null));
    }
    made += 1;
  }
  dst.exec("UPDATE session_nodes SET entry_valid = 1 WHERE session_key LIKE 'agent:makaron:subagent:%' AND entry_valid = 0");
  // historical windows (reset/rollover generations): no node's current id, plain transcripts
  const keys = dst.prepare("SELECT session_key FROM session_nodes WHERE session_key LIKE 'agent:makaron:%' ORDER BY random() LIMIT ?").all(orphanWindows).map((r) => r.session_key);
  const filler = "x".repeat(orphanEventBytes);
  let orphanEvents = 0;
  for (let i = 0; i < orphanWindows && keys.length > 0; i += 1) {
    const sessionId = randomUUID();
    const sessionKey = keys[i % keys.length];
    const at = now - day - Math.floor(Math.random() * 60 * day);
    const w = { session_id: sessionId, session_key: sessionKey, reason: "reset", session_scope: "conversation", created_at: at, updated_at: at, session_entry_provenance: 0, acp_owned: 0 };
    insWin.run(...winCols.map((c) => w[c] ?? null));
    insEvent.run(sessionId, 0, JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp: new Date(at).toISOString() }), at);
    for (let seq = 1; seq < orphanEventsPerWindow; seq += 1) {
      insEvent.run(sessionId, seq, JSON.stringify({ type: "message", id: `m${seq}`, message: { role: seq % 2 ? "user" : "assistant", content: [{ type: "text", text: filler }] } }), at + seq);
      orphanEvents += 1;
    }
  }
  dst.exec("COMMIT");
  dst.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const size = dst.prepare("SELECT count(*) n, sum(length(entry_json)) b, avg(length(entry_json)) a FROM session_nodes").get();
  const orphan = dst.prepare("SELECT count(*) n FROM session_windows WHERE session_id NOT IN (SELECT current_session_id FROM session_nodes)").get().n;
  const transcriptMb = Math.round(dst.prepare("SELECT sum(length(event_json)) b FROM transcript_events").get().b / 1048576);
  dst.close();
  return { templates: templates.length, cloned: made, sessions: size.n, entryMb: Math.round(size.b / 1048576), avgEntryKb: Math.round(size.a / 1024), orphanWindows: orphan, orphanEvents, transcriptMb, dbMb: Math.round(fs.statSync(dstPath).size / 1048576) };
}
