#!/usr/bin/env node
// User-perceived first-token report for V, from the Feishu plugin's [firsttext-e2e.1] lines.
//
//   node firsttext-e2e-report.mjs [--since "-1 hour"] [--until now] [--json] [--records out.jsonl]
//
// Runs on V (reads journald of openclaw-gateway.service; needs root or the systemd-journal
// group). Each record is one inbound Feishu message V answered. Times are measured from the
// message's Feishu create_time (when the user sent it), so they include Feishu's inbound
// delivery but not the client's rendering of the card.
//   首字 / first answer = first card push carrying answer text, or the first non-streaming reply
//   first visible  = any first push (status / progress / reasoning lines count)
//   segments       = inbound (sent -> received), queue (received -> agent run start), agent (received -> first answer text reaches the
//                    channel), reasoning (received -> first reasoning text), delivery (first answer
//                    text at the channel -> in the card), card create (start -> created)
// No message text is read or written.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const since = opt('since', '-1 hour');
const until = opt('until', 'now');
const unit = opt('unit', 'openclaw-gateway.service');

export function parseRecords(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const i = line.indexOf('[firsttext-e2e.1] ');
    if (i < 0) continue;
    try { records.push(JSON.parse(line.slice(i + '[firsttext-e2e.1] '.length))); } catch {}
  }
  return records;
}

const delta = (to, from) => (Number.isFinite(to) && Number.isFinite(from) ? to - from : undefined);

export function measure(r) {
  // first answer text in the card is what the user calls 首字; earlier pushes are often status
  // or progress lines, and reasoning may be shown before the answer
  const visibleCandidates = [r.firstPushAtMs, r.visibleAtMs].filter(Number.isFinite);
  const firstVisibleAt = visibleCandidates.length ? Math.min(...visibleCandidates) : undefined;
  const firstAnswerAt = r.firstAnswerPushAtMs ?? r.visibleAtMs;
  return {
    firstAnswerMs: delta(firstAnswerAt, r.sentAtMs),
    firstVisibleMs: delta(firstVisibleAt, r.sentAtMs),
    inboundMs: delta(r.receivedAtMs, r.sentAtMs),
    queueMs: delta(r.runStartAtMs, r.receivedAtMs),
    agentMs: delta(r.firstAnswerTokenAtMs, r.receivedAtMs),
    reasoningMs: delta(r.firstReasoningAtMs, r.receivedAtMs),
    deliveryMs: delta(firstAnswerAt, r.firstAnswerTokenAtMs),
    cardCreateMs: delta(r.cardCreatedAtMs, r.cardStartAtMs),
    cardReadyBeforeAnswer: Number.isFinite(r.cardCreatedAtMs) && Number.isFinite(r.firstAnswerTokenAtMs) ? r.cardCreatedAtMs <= r.firstAnswerTokenAtMs : undefined,
    harness: r.agentRuntime ?? 'unknown',
    model: r.model ?? 'unknown',
    chat: /:feishu:(group|direct|dm):/u.exec(r.sessionKey ?? '')?.[1] ?? 'other',
  };
}

export function percentile(values, q) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return undefined;
  const k = (s.length - 1) * q, f = Math.floor(k), c = Math.ceil(k);
  return s[f] + (s[c] - s[f]) * (k - f);
}

export function summarize(rows, key) {
  const v = rows.map((r) => r[key]).filter(Number.isFinite);
  return { n: v.length, p50: percentile(v, 0.5), p95: percentile(v, 0.95), p99: percentile(v, 0.99), max: v.length ? Math.max(...v) : undefined };
}

export function report(records) {
  const rows = records.map(measure);
  const out = { n: rows.length, firstAnswer: summarize(rows, 'firstAnswerMs'), firstVisible: summarize(rows, 'firstVisibleMs'), segments: {}, byHarness: {}, slowest: [] };
  for (const k of ['inboundMs', 'queueMs', 'agentMs', 'reasoningMs', 'deliveryMs', 'cardCreateMs']) out.segments[k] = summarize(rows, k);
  const ready = rows.map((r) => r.cardReadyBeforeAnswer).filter((x) => x !== undefined);
  out.cardReadyBeforeAnswer = { n: ready.length, yes: ready.filter(Boolean).length };
  const groups = new Map();
  rows.forEach((r) => { const g = `${r.harness}/${r.model}`; groups.set(g, [...(groups.get(g) ?? []), r]); });
  for (const [g, list] of groups) out.byHarness[g] = summarize(list, 'firstAnswerMs');
  out.slowest = rows.map((r, i) => ({ ...r, at: records[i].sentAtMs, inboundMessageId: records[i].inboundMessageId }))
    .filter((r) => Number.isFinite(r.firstAnswerMs)).sort((a, b) => b.firstAnswerMs - a.firstAnswerMs).slice(0, 5);
  return out;
}

const s = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : '-');
function print(out) {
  const line = (label, x) => console.log(`${label.padEnd(26)} n=${String(x.n).padStart(4)}  P50 ${s(x.p50).padStart(6)}  P95 ${s(x.p95).padStart(6)}  P99 ${s(x.p99).padStart(6)}  Max ${s(x.max).padStart(6)}`);
  console.log(`firsttext-e2e ${since} .. ${until}: ${out.n} messages`);
  line('首字 (first answer)', out.firstAnswer);
  line('first visible (any)', out.firstVisible);
  for (const [k, v] of Object.entries(out.segments)) line(`  ${k}`, v);
  for (const [k, v] of Object.entries(out.byHarness)) line(`  ${k}`.slice(0, 26), v);
  console.log(`  card ready before the first answer text: ${out.cardReadyBeforeAnswer.yes}/${out.cardReadyBeforeAnswer.n}`);
  for (const r of out.slowest) console.log(`  slow ${new Date(r.at).toISOString()} ${s(r.firstAnswerMs)} inbound ${s(r.inboundMs)} agent ${s(r.agentMs)} delivery ${s(r.deliveryMs)} card ${s(r.cardCreateMs)} ${r.harness}/${r.model}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = execFileSync('journalctl', ['-u', unit, '--since', since, '--until', until, '--no-pager', '-o', 'cat', '--grep', 'firsttext-e2e'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const records = parseRecords(text);
  const recordsOut = opt('records');
  if (recordsOut) fs.appendFileSync(recordsOut, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  const out = report(records);
  if (args.includes('--json')) console.log(JSON.stringify(out));
  else print(out);
}
