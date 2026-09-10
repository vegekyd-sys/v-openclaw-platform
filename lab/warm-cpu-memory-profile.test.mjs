import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {withConcurrencyProfile, finishConcurrencyProfile} from './release-files/concurrency-cpu-memory-profiler.mjs';
const sha = s => createHash('sha256').update(s).digest('hex');
const plan = JSON.parse(fs.readFileSync(new URL('./warm-cpu-memory-profile-plan.json', import.meta.url)));
test('worker implementation, callback ownership and abort path are unchanged', () => {
  const source = fs.readFileSync(new URL('./release-files/profile-production-worker.mjs', import.meta.url), 'utf8');
  const before = source.replace('import {withConcurrencyProfile} from "../openclaw/dist/concurrency-cpu-memory-profiler.mjs";\n', '')
    .replace('async function runAgent(message, abortSignal) {\n  return await withConcurrencyProfile({sessionKey: message.sessionKey, idempotencyKey: message.runId}, () => runAgentUnprofiled(message, abortSignal));\n}\nasync function runAgentUnprofiled(message, abortSignal) {', 'async function runAgent(message, abortSignal) {');
  assert.equal(sha(before), plan.files[1].before);
});
test('Gateway admission and security implementation is unchanged', () => {
  const source = fs.readFileSync(new URL('./release-files/profile-chat-send-handler.js', import.meta.url), 'utf8');
  const before = source.replace('import {withConcurrencyProfile} from "./concurrency-cpu-memory-profiler.mjs";\n', '')
    .replace('\treturn await withConcurrencyProfile(options.params, () => handleChatSendWithOptions(options, onAdmissionOwned, externalAuthorityAdmission));', '\tawait handleChatSendWithOptions(options, onAdmissionOwned, externalAuthorityAdmission);');
  assert.equal(sha(before), plan.files[0].before);
});
test('unselected requests run once with the original value and rejection', async () => {
  let called = 0; assert.equal(await withConcurrencyProfile({sessionKey: 'ordinary'}, () => {called++; return 42;}), 42); assert.equal(called, 1);
  const error = new Error('original'); await assert.rejects(withConcurrencyProfile({}, () => {throw error;}), e => e === error);
});
test('selected request emits bounded numeric memory and CPU summaries; no heap dump', async t => {
  const events = []; t.mock.method(os, 'hostname', () => 'VM-0-4-ubuntu');
  t.mock.method(process.stderr, 'write', line => {const s = String(line); if (s.startsWith('[gateway-concurrency-profile] ')) events.push(JSON.parse(s.slice(s.indexOf('{')))); return true;});
  assert.equal(await withConcurrencyProfile({sessionKey: 'agent:makaron:explicit:concurrency-fix-profile-test'}, () => 23), 23);
  await new Promise(resolve => setImmediate(resolve)); await finishConcurrencyProfile();
  const summary = events.find(e => e.event === 'summary'); assert(summary); assert(summary.memory.peak.heapUsed > 0);
  assert(summary.memory.peak.rss >= summary.memory.start.rss);
  assert(!events.some(e => e.event.includes('failed')));
  for (const values of Object.values(summary.memory)) for (const value of Object.values(values)) assert(Number.isFinite(value));
});
