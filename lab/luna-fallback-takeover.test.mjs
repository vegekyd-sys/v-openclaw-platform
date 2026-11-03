import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-luna-fallback-takeover.mjs';
import { OUTPUT_DIR, PLAN } from './build-luna-fallback-takeover.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');

test('plan lists every patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  for (const file of FILES) assert.equal(plan.files.find((f) => f.target.endsWith(`/${file.name}`)).before, file.before);
});

test('release files carry the marker, parse, and refuse a second patch', () => {
  for (const file of FILES) {
    const out = read(file.name);
    assert(out.includes(MARKER), `${file.name} lacks ${MARKER}`);
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${file.name} does not parse: ${r.stderr}`);
  }
});

test('prompt stage skips profile rotation only for 5xx the harness already retried', () => {
  const src = read('embedded-agent-DaSvA-Yk.js');
  const at = src.indexOf(`// ${MARKER}`);
  const block = src.slice(at, src.indexOf('\n\t}\n', at));
  assert(block.includes('vHarnessAlreadyRetried && failoverDecision.action === "rotate_profile"'));
  assert(block.includes('(promptFailoverReason === "server_error" || promptFailoverReason === "overloaded")'));
  assert(!block.includes('rate_limit'), 'rate_limit keeps rotating to another key');
  assert(block.includes('input.attempt.replayMetadata?.replaySafe === true'));
  // The override sits after the decision and before the profile rotation that would consume it.
  assert(at > src.indexOf('let failoverDecision = resolveRunFailoverDecision({'));
  assert(at < src.indexOf('rotated = await input.advanceAuthProfile();'));
});

const silentModelTimeout = (() => {
  const src = read('index.mjs');
  const start = src.indexOf('const SILENT_MODEL_TIMEOUT_RE');
  const end = src.indexOf('\n}\n', src.indexOf('function readSilentModelTimeout')) + 2;
  return new Function(`${src.slice(start, end)}\nreturn readSilentModelTimeout;`)();
})();
const silentAttempt = (overrides = {}) => ({
  aborted: true,
  externalAbort: false,
  promptError: null,
  replayMetadata: { hadPotentialSideEffects: false, replaySafe: true },
  toolMetas: [],
  assistantTexts: [''],
  didSendViaMessagingTool: false,
  currentAttemptAssistant: { role: 'assistant', stopReason: 'aborted', content: [{ type: 'text', text: '' }], errorMessage: 'LLM idle timeout (90s): no response from model' },
  ...overrides,
});

test('a Worker reply that only timed out silently is reported as a provider timeout', () => {
  assert.equal(silentModelTimeout(silentAttempt()), 'LLM idle timeout (90s): no response from model');
});

test('anything the user could have seen or that had effects stays with the Worker result', () => {
  const abortedSignal = { aborted: true };
  assert.equal(silentModelTimeout(silentAttempt(), abortedSignal), undefined, 'Gateway/user abort');
  assert.equal(silentModelTimeout(silentAttempt({ externalAbort: true })), undefined);
  assert.equal(silentModelTimeout(silentAttempt({ toolMetas: [{ toolName: 'exec' }] })), undefined, 'a tool ran');
  assert.equal(silentModelTimeout(silentAttempt({ replayMetadata: { hadPotentialSideEffects: true, replaySafe: false } })), undefined);
  assert.equal(silentModelTimeout(silentAttempt({ assistantTexts: ['半句话'] })), undefined, 'visible text');
  assert.equal(silentModelTimeout(silentAttempt({ didSendViaMessagingTool: true })), undefined, 'delivered');
  assert.equal(silentModelTimeout(silentAttempt({ currentAttemptAssistant: { role: 'assistant', stopReason: 'aborted', errorMessage: 'Request was aborted' } })), undefined, 'other abort');
  assert.equal(silentModelTimeout(silentAttempt({ currentAttemptAssistant: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'ok' }] } })), undefined);
});
