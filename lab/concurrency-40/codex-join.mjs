// Join Codex app-server log events with Feishu [firsttext-e2e.1] records (read-only, runs on V as openclaw).
//   node codex-join.mjs <codexEventsJsonl> <journalTextFile> <stateDb> <agentDb> <outJson>
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const [evFile, journalFile, stateDb, agentDb, outFile] = process.argv.slice(2);
const ev = fs.readFileSync(evFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const byThread = new Map();
for (const e of ev) { if (!e.th) continue; (byThread.get(e.th) ?? byThread.set(e.th, []).get(e.th)).push(e); }
for (const xs of byThread.values()) xs.sort((a, b) => a.ms - b.ms || a.id - b.id);

// thread -> sessionId (current + managed history)
const threadToSid = new Map();
{
  const db = new DatabaseSync(stateDb, { readOnly: true });
  const rows = db.prepare(`select value_json from plugin_state_entries where plugin_id='codex' and namespace in ('app-server-thread-bindings','app-server-managed-threads')`).all();
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value_json);
      const th = v?.binding?.threadId ?? v?.threadId;
      const sid = v?.sessionId ?? v?.binding?.sessionId;
      if (th && sid && byThread.has(th)) threadToSid.set(th, sid);
    } catch {}
  }
  db.close();
}
const sidToKey = new Map();
{
  const db = new DatabaseSync(agentDb, { readOnly: true });
  const q = db.prepare('select session_key from session_nodes where current_session_id = ?');
  for (const sid of new Set(threadToSid.values())) { const r = q.get(sid); if (r) sidToKey.set(sid, r.session_key); }
  db.close();
}
const threadKey = new Map([...threadToSid].map(([th, sid]) => [th, sidToKey.get(sid) ?? null]));
const keyThreads = new Map();
for (const [th, k] of threadKey) if (k) (keyThreads.get(k) ?? keyThreads.set(k, []).get(k)).push(th);

// per-turn segments from codex events alone
const turns = [];
for (const [th, xs] of byThread) {
  let cur = null;
  for (const e of xs) {
    if (e.k === 'sub' && e.op === 'turn_input') { cur = { th, key: threadKey.get(th) ?? null, turnInput: e.ms, sub: e.sub, calls: [] }; turns.push(cur); continue; }
    if (!cur) continue;
    if (e.k === 'http' && e.host?.includes('deepseek')) cur.calls.push({ hdr: e.ms, firstItem: null, st: e.st });
    else if (e.k === 'item' && cur.calls.length && cur.calls.at(-1).firstItem == null) { cur.calls.at(-1).firstItem = e.ms; cur.calls.at(-1).firstType = e.t; }
    else if (e.k === 'sub' && e.op === 'dynamic_tool_response') { const c = cur.calls.at(-1); if (c) { c.toolResp ??= []; c.toolResp.push(e.ms); } }
    else if (e.k === 'tool') { const c = cur.calls.at(-1); if (c) { c.tools ??= []; c.tools.push({ tool: e.tool, hand: e.hand, tot: e.tot, done: e.ms }); } }
    else if (e.k === 'sampled') { const c = cur.calls.at(-1); if (c) c.sampled = e.ms; }
  }
}
// request send time is not logged; previous call's last tool response (or turnInput) approximates when the next request was sent
for (const t of turns) {
  let prevEnd = t.turnInput;
  for (const c of t.calls) {
    c.sentApprox = prevEnd;
    c.ttfbApprox = c.hdr - prevEnd;              // app-server prep + network + DeepSeek queue until response headers
    c.genToFirstItem = c.firstItem != null ? c.firstItem - c.hdr : null;
    prevEnd = c.toolResp?.length ? Math.max(...c.toolResp) : (c.firstItem ?? c.hdr);
  }
}

// Feishu records
const recs = [];
for (const line of fs.readFileSync(journalFile, 'utf8').split('\n')) {
  const i = line.indexOf('[firsttext-e2e.1] ');
  if (i < 0) continue;
  try { recs.push(JSON.parse(line.slice(i + 18))); } catch {}
}
const minMs = Math.min(...ev.map((e) => e.ms));
const chat = [];
for (const r of recs) {
  if (!r.runStartAtMs || r.agentRuntime !== 'codex' || r.sentAtMs < minMs) continue;
  const ths = keyThreads.get(r.sessionKey) ?? [];
  let best = null;
  for (const t of turns) if (ths.includes(t.th) && t.turnInput >= r.dispatcherAtMs - 500 && t.turnInput <= (r.endAtMs ?? Infinity)) { if (!best || t.turnInput < best.turnInput) best = t; }
  const fv = Math.min(...[r.firstPushAtMs, r.visibleAtMs].filter(Number.isFinite));
  const c0 = best?.calls?.[0];
  chat.push({
    sentAt: r.sentAtMs, key: r.sessionKey.slice(0, 40), fv: fv - r.sentAtMs,
    inbound: r.receivedAtMs - r.sentAtMs, d2r: r.runStartAtMs - r.dispatcherAtMs,
    run2turn: best ? best.turnInput - r.runStartAtMs : null,
    turn2hdr: c0 ? c0.hdr - best.turnInput : null,
    hdr2item: c0?.firstItem != null ? c0.firstItem - c0.hdr : null,
    item2push: c0?.firstItem != null ? fv - c0.firstItem : null,
    firstType: c0?.firstType ?? null, matched: !!best,
  });
}
const summary = { events: ev.length, threads: byThread.size, mappedThreads: [...threadKey.values()].filter(Boolean).length, turns: turns.length, chatRecords: chat.length, matched: chat.filter((c) => c.matched).length };
const cls = (k) => !k ? 'unknown' : k.includes(':subagent:workboard-') ? 'wb' : /:(feishu|dingtalk|wecom|telegram|dashboard|explicit):/.test(k) ? 'chat' : k.includes(':subagent:') ? 'subagent' : k.includes(':cron:') ? 'cron' : 'other';
const threadClass = Object.fromEntries([...byThread.keys()].map((th) => [th, cls(threadKey.get(th))]));
fs.writeFileSync(outFile, JSON.stringify({ summary, threadClass, chat, turns: turns.map((t) => ({ ...t, key: t.key ? t.key.replace(/:[^:]+$/, ':*').slice(0, 60) : null, wb: !!t.key?.includes('workboard') })) }));
console.log(JSON.stringify(summary));
