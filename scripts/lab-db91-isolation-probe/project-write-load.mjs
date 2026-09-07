// Native SDK workload, only on explicitly registered synthetic Lab projects.
// This is test code, not a production patch or an alternative persistence layer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const root = '/srv/vlab-production-mirror/labs/instances/db91-fix';
const digest = value => createHash('sha256').update(value).digest('hex');
export async function runProjectWriteLoad(ctx, signal) {
  assert.equal(os.hostname(), 'VM-0-4-ubuntu');
  assert.equal(process.env.OPENCLAW_STATE_DIR, root + '/state');
  const plan = JSON.parse(fs.readFileSync(root + '/tmp/project-write-plan.json'));
  assert(plan.expiresAt > Date.now(), 'expired pressure-test plan');
  assert.equal(plan.agentId, 'makaron');
  const traceKey = Symbol.for('db91.lab.native.write.trace');
  const observer = globalThis[traceKey] ??= {sequence: 0, dropped: 0, events: []};
  const traceStart = observer.events.length;
  assert(Number.isInteger(plan.rounds) && plan.rounds >= 1 && plan.rounds <= 240);
  assert(Number.isInteger(plan.payloadBytes) && plan.payloadBytes >= 128 && plan.payloadBytes <= 16384);
  const project = plan.projects.find(p => p.chatSessionKey === ctx.sessionKey);
  assert(project, 'tool only permitted for an exact planned test session');
  assert(project.directory.startsWith(root + '/workspace/db91-projects/'));
  assert.equal(fs.realpathSync(project.directory), project.directory);
  const store = await import(root + '/runtime/openclaw/dist/plugin-sdk/session-store-runtime.js');
  const transcript = await import(root + '/runtime/openclaw/dist/plugin-sdk/session-transcript-runtime.js');
  const scope = {agentId: 'makaron', env: process.env, sessionKey: project.writeSessionKey};
  assert(scope.sessionKey.startsWith('agent:makaron:explicit:db91-write-'));
  const previous = store.getSessionEntry(scope);
  assert(!previous, 'unique workload identity is required; do not overwrite or silently retry');
  const sessionId = randomUUID();
  const chat = store.getSessionEntry({agentId: 'makaron', sessionKey: ctx.sessionKey, env: process.env});
  assert.equal(chat?.projectId, project.id, 'real chat is not bound to the planned registered project');
  const ready = root + '/tmp/project-ready-' + plan.caseId + '-' + project.index + '.json';
  fs.writeFileSync(ready, JSON.stringify({pid: process.pid, at: Date.now(), projectIndex: project.index}), {mode: 0o600, flag: 'wx'});
  const barrierDeadline = Math.min(plan.expiresAt, Date.now() + 120000);
  while (!plan.projects.every(p => fs.existsSync(root + '/tmp/project-ready-' + plan.caseId + '-' + p.index + '.json'))) {
    signal?.throwIfAborted();
    assert(Date.now() < barrierDeadline, 'not all project tools reached actual execution');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const startedAt = Date.now(), started = performance.now();
  await store.upsertSessionEntry({...scope, entry: {sessionId, updatedAt: Date.now(),
    projectId: project.id, label: 'DB91 synthetic native write workload', cwd: project.directory}});
  const bound = {...scope, sessionId};
  const measurements = [], expected = new Map();
  for (let i = 0; i < plan.rounds; i++) {
    signal?.throwIfAborted();
    assert(!fs.existsSync(root + '/tmp/project-stop-' + plan.caseId), 'pressure controller stopped the workload');
    assert(Date.now() < plan.expiresAt, 'pressure window expired');
    if (i % 10 === 0) {
      const stat = fs.statfsSync(root);
      assert(stat.bavail * stat.bsize >= 3.25 * 1024 ** 3, 'disk reserve approached');
    }
    // Unique bounded payload; no copied snapshot contents or invented tool results.
    const marker = `${plan.caseId}:${project.index}:${i}`;
    const text = marker + ':' + 'x'.repeat(plan.payloadBytes - marker.length - 1);
    const eventId = randomUUID();
    const at = performance.now();
    let callbackAt;
    const entry = await store.patchSessionEntry({...scope, requireWriteSuccess: true,
      update: () => {callbackAt = performance.now(); return {updatedAt: Date.now(), label: marker};}});
    assert.equal(entry.projectId, project.id);
    measurements.push({op: 'session-entry.patch', index: i, at: Date.now(),
      totalMs: performance.now() - at, beforeCallbackMs: callbackAt - at});
    const appendAt = performance.now();
    const result = await transcript.appendSessionTranscriptMessageByIdentity({...bound, eventId,
      message: {role: 'user', content: [{type: 'text', text}], timestamp: Date.now()},
      cwd: project.directory});
    assert(result?.appended, 'native transcript append was not committed');
    expected.set(result.messageId, digest(text));
    measurements.push({op: 'transcript.append', index: i, at: Date.now(), totalMs: performance.now() - appendAt});
    // Yield between transactions so every process can progress without a busy loop.
    await new Promise(resolve => setImmediate(resolve));
    const delay = started + (i + 1) * (plan.durationMs ?? 0) / plan.rounds - performance.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  }
  const events = await transcript.readSessionTranscriptEvents(bound);
  const seen = new Map();
  for (const event of events) {
    if (event.type !== 'message') continue;
    const text = event.message?.content?.filter(c => c.type === 'text').map(c => c.text).join('');
    assert(expected.has(event.id), 'unexpected event/cross-project contamination');
    assert(!seen.has(event.id), 'duplicate committed event');
    assert.equal(digest(text), expected.get(event.id), 'committed payload changed');
    seen.set(event.id, true);
  }
  assert.equal(seen.size, plan.rounds, 'missing committed native transcript writes');
  const finalEntry = store.getSessionEntry(scope);
  assert.equal(finalEntry.projectId, project.id);
  assert.equal(finalEntry.sessionId, sessionId);
  const result = {marker: 'DB91_PROJECT_WRITE_OK', caseId: plan.caseId, projectIndex: project.index,
    pid: process.pid, startedAt, endedAt: Date.now(), elapsedMs: performance.now() - started,
    rounds: plan.rounds, payloadBytes: plan.payloadBytes, verifiedEvents: seen.size,
    sessionId, writeSessionKey: scope.sessionKey, projectId: project.id,
    measurements, limitation: 'beforeCallback includes queue/open/scheduling, not pure SQLite lock wait'};
  result.nativeWriteTrace = observer.events.slice(traceStart);
  result.nativeTraceDropped = observer.dropped;
  if (fs.existsSync(root + '/runtime/openclaw/dist/db91-memory-provenance.mjs')) {
    const {getProvenanceFastPathStats} = await import(root + '/runtime/openclaw/dist/db91-memory-provenance.mjs');
    result.provenanceStats = getProvenanceFastPathStats();
  }
  fs.writeFileSync(root + '/workspace/project-write-' + plan.caseId + '-' + project.index + '.json',
    JSON.stringify(result), {mode: 0o600, flag: 'wx'});
  return {...result, measurements: undefined, nativeWriteTrace: undefined};
}
