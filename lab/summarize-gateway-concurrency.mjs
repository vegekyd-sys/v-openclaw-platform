// Read-only metric projection: no raw journals, message bodies, or credentials emitted.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const prefix = process.argv[2] ?? ''; assert(/^[a-z0-9-]*$/.test(prefix));
const control = '/srv/vlab-production-mirror/labs/control';
const files = fs.readdirSync(control).filter(n => /^concurrency-profile-[a-z0-9-]+-\d+\.json$/.test(n) && n.startsWith('concurrency-profile-' + prefix));
assert(files.length, 'No matching test metrics');
const batches = files.map(n => ({file: n, ...JSON.parse(fs.readFileSync(control + '/' + n))}));
const results = batches.flatMap(b => b.rows.map(r => ({label: b.label, pid: b.pid, ...r}))), byId = new Map(results.map(r => [r.id, r]));
const start = Math.min(...results.map(r => r.start));
const raw = execFileSync('journalctl', ['-u', 'openclaw-vlab-production-mirror-v8.service', '--since', new Date(start - 1000).toISOString(), '-o', 'json', '--no-pager'], {encoding: 'utf8', maxBuffer: 100 * 1024 ** 2});
const stages = new Map(), profiles = [];
for (const line of raw.split('\n')) {
  if (!line) continue; let j; try {j = JSON.parse(line);} catch {continue;}
  const msg = j.MESSAGE ?? '', profileMatch = msg.match(/\[gateway-concurrency-profile\] (\{.*\})/);
  if (profileMatch) {const e = JSON.parse(profileMatch[1]); if (e.event === 'summary') profiles.push(e);}
  const match = msg.match(/\[(?:firsttext-metrics|firsttext-worker-phases|firsttext-native-premodel)\] (\{.*\})/);
  if (!match) continue; let e; try {e = JSON.parse(match[1]);} catch {continue;}
  if (!byId.has(e.runId)) continue; const a = stages.get(e.runId) ?? []; a.push(e); stages.set(e.runId, a);
}
const stat = values => {const a = values.filter(Number.isFinite).sort((a, b) => a - b); return {n: a.length, p50: a[Math.ceil(a.length * .5) - 1] ?? null, p95: a[Math.ceil(a.length * .95) - 1] ?? null, max: a.at(-1) ?? null};};
for (const r of results) {
  const s = stages.get(r.id) ?? [], at = stage => {const e = s.find(e => e.stage === stage); return e?.atMs ?? e?.at;};
  const enter = at('worker-agent-enter'), model = at('model-call-enter'), text = at('first-nonempty-text');
  r.phases = {sendToHarnessMs: at('gateway-harness-enter') - r.start, sendToWorkerMs: enter - r.start, gatewayPreflightMs: at('gateway-preflight-end') - at('gateway-preflight-enter'), poolQueueMs: at('pool-ipc-send') - at('pool-enqueued'), workerToModelMs: model - enter, modelToFirstTextMs: text - model, firstTextToGatewayBodyMs: r.start + r.firstBody - text};
  r.workerPid = s.find(e => e.stage === 'worker-agent-enter')?.pid;
  r.calls = s.filter(e => e.stage === 'model-call-enter').map(e => ({provider: e.provider, model: e.model}));
  assert.equal(r.calls.length, 1, 'Expected one traced model call per short request');
  assert.deepEqual(r.calls[0], {provider: 'deepseek', model: 'deepseek-v4-pro'});
  r.workerStart = enter; r.workerEnd = at('worker-command-end');
}
const groups = {};
for (const label of new Set(results.map(r => r.label))) {
  const a = results.filter(r => r.label === label), edges = a.flatMap(r => Number.isFinite(r.workerStart) && Number.isFinite(r.workerEnd) ? [[r.workerStart, 1], [r.workerEnd, -1]] : []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0, maxActive = 0; for (const [, delta] of edges) {active += delta; maxActive = Math.max(active, maxActive);}
  groups[label] = {n: a.length, firstBody: stat(a.map(r => r.firstBody)), ack: stat(a.map(r => r.ackMs)), total: stat(a.map(r => r.total)), maxSimultaneousWorkerRuns: maxActive, phases: Object.fromEntries(Object.keys(a[0].phases).map(key => [key, stat(a.map(r => r.phases[key]))]))};
}
const summary = {files, groups, profiles, results};
const output = control + '/concurrency-metrics-' + Date.now() + '.json';
fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({output, groups, profiles}, null, 2));
