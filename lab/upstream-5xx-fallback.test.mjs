// lab/release-files/upstream-5xx-fallback: release bytes, plans, and the patched behaviour.
//
// Offline checks for the catalog. The checks that need V's bytes or a 9.1 runtime are in
// lab/upstream-5xx-fallback.runtime.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FILES, outputDir, planPath } from './build-upstream-5xx-fallback.mjs';
import { INCOMPLETE_AFTER_TOOLS_TEXT, INCOMPLETE_TEXT, MARKER, TRANSIENT_FAILURE_TEXT } from './patch-upstream-5xx-fallback.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('plans ship every release file over the bytes it was built from', () => {
  for (const variant of ['v', 'e3']) {
    const plan = JSON.parse(read(planPath(variant)));
    assert.equal(plan.files.length, FILES.length, variant);
    for (const [i, file] of FILES.entries()) {
      const entry = plan.files[i];
      assert.equal(entry.target, `${file.target}/${file.name}`);
      const bytes = read(entry.source);
      assert.ok(bytes.includes(MARKER), `${entry.source} lacks ${MARKER}`);
      assert.equal(spawnSync(process.execPath, ['--check', path.join(repo, entry.source)]).status, 0, entry.source);
      if (variant === 'v') assert.equal(entry.before, file.before, file.name);
      if (variant === 'e3' && file.e3) assert.equal(entry.before, sha(read(file.e3)), file.name);
      if (variant === 'e3' && !file.e3) assert.equal(entry.source, `${outputDir('v')}/${file.name}`);
    }
  }
});

test('the e3 variant is the same patch applied over history-image-e3', () => {
  for (const file of FILES.filter((f) => f.e3)) {
    assert.equal(file.patch(read(file.e3)), read(`${outputDir('e3')}/${file.name}`), file.name);
    assert.throws(() => file.patch(read(`${outputDir('e3')}/${file.name}`)), /already patched/);
  }
});

test('a worker failure is replay-safe only when the caller proved the turn ran no tool', async () => {
  const { buildHarnessFailureAttempt } = await import(pathToFileURL(path.join(repo, outputDir('v'), 'harness-failure.mjs')).href);
  const error = Object.assign(new Error('⚠️ deepseek/deepseek-flash request failed'), { name: 'FailoverError', status: 503 });
  assert.deepEqual(buildHarnessFailureAttempt(error, { sessionId: 's' }).replayMetadata, { hadPotentialSideEffects: true, replaySafe: false });
  assert.deepEqual(buildHarnessFailureAttempt(error, { sessionId: 's', providerFailureWithoutTools: false }).replayMetadata, { hadPotentialSideEffects: true, replaySafe: false });
  assert.deepEqual(buildHarnessFailureAttempt(error, { sessionId: 's', providerFailureWithoutTools: true }).replayMetadata, { hadPotentialSideEffects: false, replaySafe: true });
  // A model timeout the worker already retried reaches the Gateway as a prompt failure, not an attempt timeout.
  const timeout = Object.assign(new Error('LLM request timed out.'), { name: 'FailoverError', status: 408 });
  assert.equal(buildHarnessFailureAttempt(timeout, { sessionId: 's' }).timedOut, true);
  assert.equal(buildHarnessFailureAttempt(timeout, { sessionId: 's', providerFailureWithoutTools: true }).timedOut, false);
});

test('a provider failure keeps status/provider/model/reason across the worker IPC', () => {
  const worker = read(`${outputDir('v')}/worker.mjs`);
  const fn = worker.slice(worker.indexOf('function serializeError(error) {'), worker.indexOf('\nfunction jsonSafe('));
  const serializeError = new Function(`${fn}\nreturn serializeError;`)();
  class FailoverError extends Error { constructor(m, o) { super(m); this.name = 'FailoverError'; Object.assign(this, o); } }
  const wire = JSON.parse(JSON.stringify(serializeError(new FailoverError('busy', { reason: 'server_error', status: 503, provider: 'deepseek', model: 'deepseek-flash' }))));
  assert.deepEqual({ status: wire.status, provider: wire.provider, model: wire.model, failoverReason: wire.failoverReason, name: wire.name }, { status: 503, provider: 'deepseek', model: 'deepseek-flash', failoverReason: 'server_error', name: 'FailoverError' });
  const plain = JSON.parse(JSON.stringify(serializeError(Object.assign(new Error('x'), { reason: 'abort' }))));
  assert.equal(plain.failoverReason, undefined, 'only a FailoverError carries a failover reason');
  const pool = read(`${outputDir('v')}/worker-pool.mjs`);
  for (const field of ['status', 'provider', 'model', 'failoverReason']) assert.ok(pool.includes(`error.${field} = message.error.${field}`), field);
});

test('the user-facing failure copy is Chinese and still classifies as the same failure', () => {
  const helpers = read(`${outputDir('v')}/embedded-agent-helpers-CzpaLpCq.js`);
  assert.ok(helpers.includes(TRANSIENT_FAILURE_TEXT));
  assert.ok(!helpers.includes('This is usually temporary — try again shortly.'));
  const builtin = read(`${outputDir('v')}/builtin-openclaw-zQV8Wwjr.js`);
  assert.ok(builtin.includes(INCOMPLETE_AFTER_TOOLS_TEXT) && builtin.includes(INCOMPLETE_TEXT));
  assert.ok(!builtin.includes("Note: some tool actions may have already been executed"));
});

