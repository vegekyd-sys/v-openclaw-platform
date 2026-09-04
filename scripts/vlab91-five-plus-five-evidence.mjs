import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Read only the dedicated acceptance sessions. Never emit reasoning or tool arguments.
const root = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const db = new DatabaseSync(`${root}/state/agents/makaron/agent/openclaw-agent.sqlite`, { readOnly: true });
function inspect(key) {
  const node = db.prepare('SELECT current_session_id,status FROM session_nodes WHERE session_key=?').get(key);
  if (!node) return { key, missing: true };
  const rows = db.prepare('SELECT seq,event_json FROM transcript_events WHERE session_id=? ORDER BY seq').all(node.current_session_id);
  const tools = [], markers = [], completionEvents = [], children = new Set(), errors = [];
  for (const row of rows) {
    const event = JSON.parse(row.event_json), message = event.message;
    if (!message) continue;
    if (message.role === 'user' && message.provenance?.sourceTool === 'agent_harness_task') completionEvents.push({ seq: row.seq, at: event.timestamp, sourceSessionKey: message.provenance.sourceSessionKey });
    const content = Array.isArray(message.content) ? message.content : [{ type: 'text', text: String(message.content ?? '') }];
    for (const block of content) {
      if (block.type === 'toolCall') tools.push({ seq: row.seq, at: event.timestamp, name: block.name });
      if (block.type !== 'text') continue;
      const text = String(block.text ?? '');
      for (const match of text.matchAll(/(?:CHILD|PARENT)_[1-5]_660_OK/g)) markers.push({ seq: row.seq, at: event.timestamp, role: message.role, marker: match[0] });
      if (message.toolName === 'sessions_spawn') {
        for (const match of text.matchAll(/agent:makaron:subagent:[a-f0-9-]+/g)) children.add(match[0]);
      }
    }
    if (message.isError || message.stopReason === 'error') errors.push({ seq: row.seq, at: event.timestamp, tool: message.toolName, stopReason: message.stopReason });
  }
  return { key, sessionId: node.current_session_id, status: node.status, tools, markers, completionEvents, children: [...children], errors };
}
const parents = Array.from({ length: 5 }, (_, i) => inspect(`agent:makaron:explicit:vlab91-5p5-${i+1}-20260904`));
const children = [...new Set(parents.flatMap(p => p.children ?? []))].map(inspect);
const heartbeats = Array.from({ length: 5 }, (_, i) => {
  const file = `/tmp/vlab91-r3-${i+1}.log`;
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : [];
  return { id: i+1, lines: lines.length, first: lines[0], last: lines.at(-1), done: lines.some(l => /DONE|complete/i.test(l)) };
});
db.close();
console.log(JSON.stringify({ at: new Date().toISOString(), parents, children, heartbeats }, null, 2));
