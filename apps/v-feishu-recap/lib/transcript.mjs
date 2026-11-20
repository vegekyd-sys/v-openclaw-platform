// Reads the last messages of one group's session straight from the agent database,
// from this process, never through the Gateway. Opened read-only, so it cannot block a
// writer and costs the Gateway's main thread nothing. Row sizes are checked before any
// body is read: a session can hold rows of many megabytes of base64.
import { DatabaseSync } from "node:sqlite";

export const TAIL_MESSAGES = 80;
export const TAIL_BYTES = 160 * 1024;
export const ROW_BYTES_MAX = 32 * 1024;

export function groupSessionKey(agentId, chatId) {
  return `agent:${agentId}:feishu:group:${chatId}`;
}

export class Transcripts {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath, { readOnly: true });
    this.db.exec("PRAGMA busy_timeout = 2000; PRAGMA query_only = ON;");
    this.head = this.db.prepare(`SELECT current_session_id AS sessionId, status FROM session_nodes WHERE session_key = ?`);
    this.sizes = this.db.prepare(`
      SELECT a.event_seq AS seq, octet_length(e.event_json) AS bytes, e.created_at AS createdAt
      FROM session_transcript_active_events a
      JOIN transcript_events e ON e.session_id = a.session_id AND e.seq = a.event_seq
      WHERE a.session_id = ? AND a.message_position IS NOT NULL
      ORDER BY a.active_position DESC LIMIT ?`);
    this.body = this.db.prepare(`SELECT event_json AS json FROM transcript_events WHERE session_id = ? AND seq = ?`);
  }

  /** Cheap: decides whether a cached recap is still current, without reading any body. */
  watermark(sessionKey) {
    const head = this.head.get(sessionKey);
    if (!head) return null;
    const [last] = this.sizes.all(head.sessionId, 1);
    return { sessionId: head.sessionId, status: head.status ?? null, seq: last?.seq ?? 0, lastAt: last?.createdAt ?? null };
  }

  /** Newest messages up to the limits, oldest first; oversized rows are skipped, not read. */
  tail(sessionKey, { messages = TAIL_MESSAGES, bytes = TAIL_BYTES, rowBytes = ROW_BYTES_MAX } = {}) {
    const head = this.head.get(sessionKey);
    if (!head) return null;
    const rows = [];
    let total = 0;
    let skipped = 0;
    for (const row of this.sizes.all(head.sessionId, messages)) {
      if (row.bytes > rowBytes) { skipped += 1; continue; }
      if (total + row.bytes > bytes) break;
      total += row.bytes;
      rows.push(this.body.get(head.sessionId, row.seq).json);
    }
    return { sessionId: head.sessionId, status: head.status ?? null, rows: rows.reverse(), bytes: total, skipped };
  }

  close() { this.db.close(); }
}

const INBOUND = /^\[message_id: [^\]]+\]\n(?:(ou_[A-Za-z0-9_-]+): )?/u;

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
}

/**
 * Turns raw transcript rows into the lines the model reads. Keeps what people and V said
 * and the names of tools V ran. Drops reasoning and tool output: output can hold anything
 * the machine has on disk, and everyone in the group opens this page.
 */
export function toLines(rows, { names = new Map(), maxText = 1500 } = {}) {
  const lines = [];
  for (const raw of rows) {
    let event;
    try { event = JSON.parse(raw); } catch { continue; }
    const message = event?.message;
    if (event?.type !== "message" || !message) continue;
    const at = typeof event.timestamp === "string" ? event.timestamp : null;
    if (message.role === "user") {
      const text = textOf(message.content);
      const inbound = text.match(INBOUND);
      const body = (inbound ? text.slice(inbound[0].length) : text).trim();
      if (!body) continue;
      const who = inbound ? (inbound[1] ? names.get(inbound[1]) ?? "群成员" : "群成员") : "系统通知";
      lines.push({ at, who, text: body.slice(0, maxText) });
    } else if (message.role === "assistant") {
      const text = textOf(message.content).trim();
      if (text) lines.push({ at, who: "V", text: text.slice(0, maxText) });
      const tools = (Array.isArray(message.content) ? message.content : [])
        .filter((part) => part?.type === "toolCall" && typeof part.name === "string")
        .map((part) => part.name);
      if (tools.length) lines.push({ at, who: "V", text: `（调用工具：${[...new Set(tools)].join("、")}）` });
    } else if (message.role === "toolResult" && message.isError === true && typeof message.toolName === "string") {
      lines.push({ at, who: "V", text: `（工具 ${message.toolName} 报错）` });
    }
  }
  return lines;
}
