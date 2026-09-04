import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Read-only evidence for Tianyi's explicitly authorized two-child test.
const root = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const db = new DatabaseSync(`${root}/state/agents/makaron/agent/openclaw-agent.sqlite`, { readOnly: true });
const keys = [
  'agent:makaron:feishu:direct:ou_775a78b0aaae67da5e15eeaf102e3cd9',
  'agent:makaron:subagent:8e0f445f-d83f-4574-9b34-c9536e036194',
  'agent:makaron:subagent:e4c28457-503c-41e9-ac18-02417f674f82',
];
const sessions = keys.map((key, index) => {
  const node = db.prepare('SELECT current_session_id,status FROM session_nodes WHERE session_key=?').get(key);
  if (!node) return { index, missing: true };
  const events = db.prepare('SELECT seq,event_json FROM transcript_events WHERE session_id=? ORDER BY seq').all(node.current_session_id);
  const tools = [], markers = [], errors = [];
  for (const row of events) {
    if (index === 0 && row.seq < 103) continue;
    const event = JSON.parse(row.event_json), message = event.message;
    if (!message) continue;
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (block.type === 'toolCall') tools.push({ seq: row.seq, name: block.name });
      // Do not emit model reasoning, private conversation, or tool arguments.
      if (block.type === 'text') {
        for (const marker of block.text?.matchAll(/VLAB91_(?:TOOL_OK|REPLY_OK|LONG_OK)|SUB[12]_(?:COMPLETE|DONE)/g) ?? []) {
          markers.push({ seq: row.seq, role: message.role, value: marker[0] });
        }
      }
    }
    if (message.isError === true || message.stopReason === 'error') errors.push({ seq: row.seq, tool: message.toolName, stopReason: message.stopReason });
  }
  return { index, status: node.status, events: events.length, tools, markers, errors };
});
db.close();
const heartbeatFiles = [1, 2].map(id => {
  const file = `/tmp/vlab91/sub${id}.log`;
  if (!fs.existsSync(file)) return { id, missing: true };
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const heartbeats = lines.map(line => line.match(/^SUB[12]_HEARTBEAT t=(\d+) ts=(\d+)$/)).filter(Boolean).map(m => ({ elapsed: Number(m[1]), epoch: Number(m[2]) }));
  return { id, heartbeats, done: lines.includes(`SUB${id}_DONE`), wallSeconds: heartbeats.length > 1 ? heartbeats.at(-1).epoch - heartbeats[0].epoch : 0 };
});
console.log(JSON.stringify({ at: new Date().toISOString(), sessions, heartbeatFiles }, null, 2));
