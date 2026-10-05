#!/usr/bin/env node
// User-perceived first-token report for V, from the Feishu plugin's [firsttext-e2e.1] lines.
//
//   node firsttext-e2e-report.mjs [--since "-1 hour"] [--until now] [--json] [--records out.jsonl]
//
// Runs on V (reads journald of openclaw-gateway.service; needs root or the systemd-journal
// group). Each record is one inbound Feishu message V answered. Times are measured from the
// message's Feishu create_time (when the user sent it), so they include Feishu's inbound
// delivery but not the client's rendering of the card.
//   first visible  = first card content push, or first non-streaming reply, whichever is first
//   first answer   = first push that carries answer text (not only reasoning/status)
//   segments       = inbound (sent -> received), agent (received -> first answer text reaches the
//                    channel), delivery (that text -> pushed into the card), card create (start
//                    -> created)
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
  const visibleCandidates = [r.firstPushAtMs, r.visibleAtMs].filter(Number.isFinite);
  const firstVisibleAt = visibleCandidates.length ? Math.min(...visibleCandidates) : undefined;
  const firstAnswerAt = r.firstAnswerPushAtMs ?? r.visibleAtMs;
  const firstModelAt = [r.firstAnswerTokenAtMs, r.firstReasoningAtMs].filter(Number.isFinite);
  return {
    firstVisibleMs: delta(firstVisibleAt, r.sentAtMs),
    firstAnswerMs: delta(firstAnswerAt, r.sentAtMs),
    inboundMs: delta(r.receivedAtMs, r.sentAtMs),
    agentMs: delta(firstModelAt.length ? Math.min(...firstModelAt) : undefined, r.receivedAtMs),
    deliveryMs: delta(firstVisibleAt, firstModelAt.length ? Math.min(...firstModelAt) : undefined),
    cardCreateMs: delta(r.cardCreatedAtMs, r.cardStartAtMs),
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
  const out = { n: rows.length, firstVisible: summarize(rows, 'firstVisibleMs'), firstAnswer: summarize(rows, 'firstAnswerMs'), segments: {}, byHarness: {}, slowest: [] };
  for (const k of ['inboundMs', 'agentMs', 'deliveryMs', 'cardCreateMs']) out.segments[k] = summarize(rows, k);
  const groups = new Map();
  rows.forEach((r) => { const g = `${r.harness}/${r.model}`; groups.set(g, [...(groups.get(g) ?? []), r]); });
  for (const [g, list] of groups) out.byHarness[g] = summarize(list, 'firstVisibleMs');
  out.slowest = rows.map((r, i) => ({ ...r, at: records[i].sentAtMs, inboundMessageId: records[i].inboundMessageId }))
    .filter((r) => Number.isFinite(r.firstVisibleMs)).sort((a, b) => b.firstVisibleMs - a.firstVisibleMs).slice(0, 5);
  return out;
}

const s = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : '-');
function print(out) {
  const line = (label, x) => console.log(`${label.padEnd(26)} n=${String(x.n).padStart(4)}  P50 ${s(x.p50).padStart(6)}  P95 ${s(x.p95).padStart(6)}  P99 ${s(x.p99).padStart(6)}  Max ${s(x.max).padStart(6)}`);
  console.log(`firsttext-e2e ${since} .. ${until}: ${out.n} messages`);
  line('first visible', out.firstVisible);
  line('first answer', out.firstAnswer);
  for (const [k, v] of Object.entries(out.segments)) line(`  ${k}`, v);
  for (const [k, v] of Object.entries(out.byHarness)) line(`  ${k}`.slice(0, 26), v);
  for (const r of out.slowest) console.log(`  slow ${new Date(r.at).toISOString()} ${s(r.firstVisibleMs)} inbound ${s(r.inboundMs)} agent ${s(r.agentMs)} delivery ${s(r.deliveryMs)} ${r.harness}/${r.model}`);
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
