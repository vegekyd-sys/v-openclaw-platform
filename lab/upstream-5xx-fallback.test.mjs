// lab/release-files/upstream-5xx-fallback: release bytes, plans, and the patched behaviour.
//
// Byte checks run anywhere. Set UPSTREAM_5XX_BASE=<dir with core/dist/* and worker/* as V runs them>
// to rebuild from V's bytes and compare. Set OPENCLAW_DIST=<runtime>/openclaw/dist (e.g. inside a
// vlab.mjs candidate) to run the classification checks against the real 9.1 modules.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FILES, outputDir, planPath } from './build-upstream-5xx-fallback.mjs';
import { INCOMPLETE_AFTER_TOOLS_TEXT, INCOMPLETE_TEXT, MARKER, TRANSIENT_FAILURE_TEXT, patchClassify, patchFailureCopy } from './patch-upstream-5xx-fallback.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const haveRelease = fs.existsSync(path.join(repo, outputDir('v')));
const noRelease = !haveRelease && 'release files not present';
const BUSY = '503 Service is too busy. We advise users to temporarily switch to alternative LLM API service providers.';

test('plans ship every release file over the bytes it was built from', { skip: noRelease }, () => {
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

test('the e3 variant is the same patch applied over history-image-e3', { skip: noRelease }, () => {
  for (const file of FILES.filter((f) => f.e3)) {
    assert.equal(file.patch(read(file.e3)), read(`${outputDir('e3')}/${file.name}`), file.name);
    assert.throws(() => file.patch(read(`${outputDir('e3')}/${file.name}`)), /already patched/);
  }
});

test('release files rebuild from V\'s bytes', { skip: !process.env.UPSTREAM_5XX_BASE && 'UPSTREAM_5XX_BASE not set' }, () => {
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(process.env.UPSTREAM_5XX_BASE, file.base, file.name), 'utf8');
    assert.equal(sha(original), file.before, file.name);
    assert.equal(file.patch(original), read(`${outputDir('v')}/${file.name}`), file.name);
  }
});

test('a worker failure is replay-safe only when the caller proved the turn ran no tool', { skip: noRelease }, async () => {
  const { buildHarnessFailureAttempt } = await import(pathToFileURL(path.join(repo, outputDir('v'), 'harness-failure.mjs')).href);
  const error = Object.assign(new Error('⚠️ deepseek/deepseek-flash request failed'), { name: 'FailoverError', status: 503 });
  assert.deepEqual(buildHarnessFailureAttempt(error, { sessionId: 's' }).replayMetadata, { hadPotentialSideEffects: true, replaySafe: false });
  assert.deepEqual(buildHarnessFailureAttempt(error, { sessionId: 's', providerFailureWithoutTools: false }).replayMetadata, { hadPotentialSideEffects: true, replaySafe: false });
  assert.deepEqual(buildHarnessFailureAttempt(error, { sessionId: 's', providerFailureWithoutTools: true }).replayMetadata, { hadPotentialSideEffects: false, replaySafe: true });
});

test('a provider failure keeps status/provider/model/reason across the worker IPC', { skip: noRelease }, () => {
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

test('the user-facing failure copy is Chinese and still classifies as the same failure', { skip: noRelease }, () => {
  const helpers = read(`${outputDir('v')}/embedded-agent-helpers-CzpaLpCq.js`);
  assert.ok(helpers.includes(TRANSIENT_FAILURE_TEXT));
  assert.ok(!helpers.includes('This is usually temporary — try again shortly.'));
  const builtin = read(`${outputDir('v')}/builtin-openclaw-zQV8Wwjr.js`);
  assert.ok(builtin.includes(INCOMPLETE_AFTER_TOOLS_TEXT) && builtin.includes(INCOMPLETE_TEXT));
  assert.ok(!builtin.includes("Note: some tool actions may have already been executed"));
});

const dist = process.env.OPENCLAW_DIST;
test('9.1 classification: answered 5xx are server_error, timing statuses stay timeout', { skip: !dist && 'OPENCLAW_DIST not set' }, async () => {
  const original = path.join(dist, 'classify-Dm9sTbZz.js');
  const tmp = path.join(dist, `classify-Dm9sTbZz.${process.pid}.upstream-5xx-test.js`);
  fs.writeFileSync(tmp, patchClassify(fs.readFileSync(original, 'utf8')));
  try {
    const before = await import(pathToFileURL(original).href);
    const after = await import(pathToFileURL(tmp).href);
    // export map of the 9.1 chunk: t = classifyFailoverReason, n = classifyFailoverSignal
    const cases = [
      // [input, before (V today), after]
      [{ message: BUSY }, 'timeout', 'server_error'],
      [{ message: BUSY, status: 503, provider: 'deepseek' }, 'timeout', 'server_error'],
      [{ message: 'Internal Server Error', status: 500 }, 'timeout', 'server_error'],
      [{ message: '500 Internal Server Error' }, 'timeout', 'server_error'],
      [{ message: '502 Bad Gateway', status: 502 }, 'timeout', 'server_error'],
      [{ message: '503 The model is overloaded', status: 503 }, 'overloaded', 'overloaded'],
      [{ message: 'Rate limit reached for requests', status: 429 }, 'rate_limit', 'rate_limit'],
      [{ message: '429 Rate limit reached for requests' }, 'rate_limit', 'rate_limit'],
      [{ message: 'Gateway Timeout', status: 504 }, 'timeout', 'timeout'],
      [{ message: '499 Client Closed Request', status: 499 }, 'timeout', 'timeout'],
      [{ message: 'Request timed out.' }, 'timeout', 'timeout'],
      [{ message: 'terminated' }, 'timeout', 'timeout'],
      [{ message: '502 <!doctype html><html><head><title>502 Bad Gateway</title></head><body>cloudflare</body></html>' }, 'timeout', 'server_error'],
      [{ message: '504 <!doctype html><html><head><title>504 Gateway Time-out</title></head><body>cloudflare</body></html>' }, 'timeout', 'timeout'],
    ];
    const reasonOf = (mod, signal) => {
      const c = mod.n(signal);
      return c ? (c.kind === 'reason' ? c.reason : c.kind) : null;
    };
    for (const [signal, was, now] of cases) {
      assert.equal(reasonOf(before, signal), was, `before: ${JSON.stringify(signal)}`);
      assert.equal(reasonOf(after, signal), now, `after: ${JSON.stringify(signal)}`);
    }
    // The Chinese copy classifies exactly like the English copy it replaces (text alone, no status:
    // "HTTP 503" is not leading). The worker carries the real status across IPC instead.
    const helpers = patchFailureCopy(fs.readFileSync(path.join(dist, 'embedded-agent-helpers-CzpaLpCq.js'), 'utf8'));
    assert.ok(helpers.split('\n').some((l) => l.includes('模型服务暂时不可用')));
    for (const [en, zh] of [
      ['⚠️ deepseek/deepseek-flash request failed (provider internal error, HTTP 503). This is usually temporary — try again shortly.', `⚠️ 模型服务暂时不可用（deepseek/deepseek-flash，服务端出错，HTTP 503）。${TRANSIENT_FAILURE_TEXT}`],
      ['⚠️ deepseek/deepseek-flash request failed (rate limited, HTTP 429). This is usually temporary — try again shortly.', `⚠️ 模型服务暂时不可用（deepseek/deepseek-flash，请求过于频繁，HTTP 429）。${TRANSIENT_FAILURE_TEXT}`],
      ['⚠️ deepseek/deepseek-flash request failed (request timed out). This is usually temporary — try again shortly.', `⚠️ 模型服务暂时不可用（deepseek/deepseek-flash，请求超时）。${TRANSIENT_FAILURE_TEXT}`],
    ]) {
      assert.equal(after.t(zh, { provider: 'deepseek' }), after.t(en, { provider: 'deepseek' }), zh);
    }
    // With the status the worker now carries, the 503 copy is a server_error and the 429 one a rate_limit.
    assert.equal(after.n({ message: `⚠️ 模型服务暂时不可用（deepseek/deepseek-flash，服务端出错，HTTP 503）。${TRANSIENT_FAILURE_TEXT}`, status: 503, provider: 'deepseek' }).reason, 'server_error');
    assert.equal(after.n({ message: `⚠️ 模型服务暂时不可用（deepseek/deepseek-flash，请求过于频繁，HTTP 429）。${TRANSIENT_FAILURE_TEXT}`, status: 429, provider: 'deepseek' }).reason, 'rate_limit');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});
