#!/usr/bin/env node
// Per-message 首字 timing records for one window of V's journald, one JSON line per Feishu
// message, for breaking down the queue tail message by message.
//
//   node export-records.mjs --since "2026-10-05 16:00:00 UTC" --until "..." [--log file]
//
// Runs on V next to firsttext-e2e-report.mjs (same journald unit, needs root or the
// systemd-journal group). Each line joins the [firsttext-e2e.1] record with the Worker's
// [firsttext-worker-phases] and the model's [firsttext-metrics] marks by runId. Only timestamps
// and identifiers leave V: no message text, chat ids or message ids; the session key is
// reduced to the first 10 hex chars of its sha256.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };

const E2E_FIELDS = ['sentAtMs', 'receivedAtMs', 'dispatcherAtMs', 'cardStartAtMs', 'typingShownAtMs', 'cardCreatedAtMs', 'runStartAtMs', 'firstPushAtMs', 'firstStatusPushAtMs', 'firstAnswerTokenAtMs', 'firstAnswerPushAtMs', 'visibleAtMs', 'endAtMs'];
const PHASES = ['gateway-preflight-enter', 'gateway-harness-enter', 'worker-agent-enter', 'worker-command-enter', 'worker-stream-send'];
const METRICS = ['model-call-enter', 'payload-ready', 'provider-accepted', 'first-decoded-event', 'first-thinking-event', 'first-nonempty-text', 'first-tool-event'];

function marks(text, tag) {
  const out = [];
  const prefix = `[${tag}] `;
  for (const line of text.split('\n')) {
    const i = line.indexOf(prefix);
    if (i < 0) continue;
    try { out.push(JSON.parse(line.slice(i + prefix.length))); } catch {}
  }
  return out;
}

// runId -> {stage: earliest time, pid, workerPid}
function byRun(rows, timeKey, stages) {
  const runs = new Map();
  for (const m of rows) {
    if (typeof m.runId !== 'string' || !stages.includes(m.stage) || !Number.isFinite(m[timeKey])) continue;
    const run = runs.get(m.runId) ?? {};
    if (!(run[m.stage] <= m[timeKey])) {
      run[m.stage] = m[timeKey];
      if (m.stage === 'worker-command-enter' && Number.isSafeInteger(m.pid)) run.pid = m.pid;
    }
    if (Number.isSafeInteger(m.workerPid)) run.workerPid ??= m.workerPid;
    runs.set(m.runId, run);
  }
  return runs;
}

// runId -> size and usage of the run's first model request (the one 首字 waits on):
// inputItems/toolCount from payload-ready (provider message count, a size proxy) and the
// token counts from model-call-ended (input, cacheRead, cacheWrite, output, requestBytes),
// for prompt-cache analysis.
const PAYLOAD_FIELDS = {
  'payload-ready': ['inputItems', 'toolCount'],
  'model-call-ended': ['input', 'cacheRead', 'cacheWrite', 'output', 'requestBytes'],
};
function firstPayload(rows) {
  const earliest = new Map();
  for (const m of rows) {
    if (typeof m.runId !== 'string' || !PAYLOAD_FIELDS[m.stage] || !Number.isFinite(m.at)) continue;
    const key = `${m.runId}\n${m.stage}`;
    if (!(earliest.get(key)?.at <= m.at)) earliest.set(key, m);
  }
  const runs = new Map();
  for (const m of earliest.values()) {
    const p = runs.get(m.runId) ?? {};
    for (const k of PAYLOAD_FIELDS[m.stage]) if (Number.isSafeInteger(m[k])) p[k] = m[k];
    runs.set(m.runId, p);
  }
  return runs;
}

export function exportRecords(text) {
  const phases = byRun(marks(text, 'firsttext-worker-phases'), 'atMs', PHASES);
  const metricRows = marks(text, 'firsttext-metrics');
  const metrics = byRun(metricRows, 'at', METRICS);
  const payloads = firstPayload(metricRows);
  return marks(text, 'firsttext-e2e.1').map((r) => {
    const out = {};
    for (const k of E2E_FIELDS) if (Number.isFinite(r[k])) out[k] = r[k];
    if (typeof r.runId === 'string') out.runId = r.runId;
    for (const k of ['agentRuntime', 'provider', 'model']) if (typeof r[k] === 'string') out[k] = r[k];
    out.chat = /:feishu:(group|direct|dm):/u.exec(r.sessionKey ?? '')?.[1] ?? 'other';
    if (typeof r.sessionKey === 'string') out.session = createHash('sha256').update(r.sessionKey).digest('hex').slice(0, 10);
    const p = phases.get(r.runId) ?? {};
    out.phases = {};
    for (const k of PHASES) if (Number.isFinite(p[k])) out.phases[k] = p[k];
    if (p.pid) out.pid = p.pid;
    if (p.workerPid) out.workerPid = p.workerPid;
    const m = metrics.get(r.runId) ?? {};
    out.metrics = {};
    for (const k of METRICS) if (Number.isFinite(m[k])) out.metrics[k] = m[k];
    const payload = payloads.get(r.runId);
    if (payload && Object.keys(payload).length > 0) out.payload = payload;
    return out;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const logFile = opt('log');
  const text = logFile ? fs.readFileSync(logFile, 'utf8') : execFileSync('journalctl', ['-u', opt('unit', 'openclaw-gateway.service'), '--since', opt('since', '-1 hour'), '--until', opt('until', 'now'), '--no-pager', '-o', 'cat', '--grep', 'firsttext-e2e|firsttext-metrics|firsttext-worker-phases'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  for (const row of exportRecords(text)) process.stdout.write(JSON.stringify(row) + '\n');
}
