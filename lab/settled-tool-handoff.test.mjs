import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FILES, MARKER } from './patch-settled-tool-handoff.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = 'lab/release-files/settled-tool-handoff';
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/settled-tool-handoff.plan.json'), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');
// V's bytes as captured with the release before this one (the fallback runner is unpatched 9.1, not captured).
const CAPTURED = {
  'openclaw/dist': 'release/captured/v2026.9.1-db91.6-luna-fallback-takeover-20261104/dist',
  'production-worker': 'release/captured/v2026.9.1-db91.6-luna-fallback-takeover-20261104.worker/dist',
};

test('plan lists every patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  for (const file of FILES) assert.equal(plan.files.find((f) => f.target === `${file.target}/${file.name}`).before, file.before);
});

test('release files are the patch applied to the captured V bytes', () => {
  for (const file of FILES) {
    const captured = path.join(repo, CAPTURED[file.target], file.name);
    if (!fs.existsSync(captured)) continue;
    const before = fs.readFileSync(captured, 'utf8');
    assert.equal(sha(before), file.before, `${file.name}: captured bytes are not the plan's before`);
    assert.equal(read(file.name), file.patch(before), `${file.name}: release file differs from patch(V)`);
  }
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

// The decision helper, lifted out of the patched chunk and run against stand-ins for its two imports.
const handoff = () => {
  const src = read('embedded-agent-DaSvA-Yk.js');
  const start = src.indexOf('const V_SETTLED_HANDOFF = ');
  const end = src.indexOf('\n}\n', src.indexOf('function vSettledHandoffError')) + 2;
  delete globalThis[Symbol.for('openclaw.v.settledToolHandoff')];
  class FailoverError extends Error { constructor(message, p) { super(message); Object.assign(this, p); } }
  const resolveFailoverStatus = (reason) => ({ server_error: 500, overloaded: 503, rate_limit: 429 })[reason];
  return new Function('FailoverError', 'resolveFailoverStatus', `${src.slice(start, end)}\nreturn { V_SETTLED_HANDOFF, vSettledHandoffError };`)(FailoverError, resolveFailoverStatus);
};
const assistant = { errorMessage: '500 Internal Server Error' };

test('one same-model continuation per runId while a fallback is pending, then the hand-off error', () => {
  const { V_SETTLED_HANDOFF, vSettledHandoffError } = handoff();
  const params = { runId: 'r1', isFinalFallbackAttempt: false };
  assert.equal(vSettledHandoffError(params, 'server_error', assistant, 'deepseek', 'deepseek-flash', false), undefined);
  const error = vSettledHandoffError(params, 'server_error', assistant, 'deepseek', 'deepseek-flash', false);
  assert.equal(error.vSettledContinuation, true);
  assert.equal(error.status, 500);
  assert.equal(error.reason, 'server_error');
  assert.equal(error.message, '500 Internal Server Error');
  assert.equal(V_SETTLED_HANDOFF.pending.get('r1').from, 'deepseek/deepseek-flash');
  assert.equal(V_SETTLED_HANDOFF.continuations.has('r1'), false);
});

test('the Gateway over the Worker hands over at once; without a pending fallback nothing changes', () => {
  const { V_SETTLED_HANDOFF, vSettledHandoffError } = handoff();
  assert(vSettledHandoffError({ runId: 'r2', isFinalFallbackAttempt: false }, 'overloaded', assistant, 'deepseek', 'deepseek-flash', true));
  for (const isFinalFallbackAttempt of [true, undefined]) {
    for (let i = 0; i < 4; i++) assert.equal(vSettledHandoffError({ runId: 'r3', isFinalFallbackAttempt }, 'server_error', assistant, 'deepseek', 'deepseek-flash', true), undefined);
  }
  assert.equal(V_SETTLED_HANDOFF.pending.has('r3'), false);
  assert.equal(vSettledHandoffError({ isFinalFallbackAttempt: false }, 'server_error', assistant, 'deepseek', 'deepseek-flash', true), undefined, 'no runId');
});

test('the recovery branches sit where 9.1 decides to continue or surface', () => {
  const src = read('embedded-agent-DaSvA-Yk.js');
  const gate = src.indexOf('if (!currentAttemptReplaySafe && !canContinueSettledMidTurnOverflow && !settledTransportDropAssistant && !vProviderErrorReason) return { action: "proceed" };');
  const continuation = src.indexOf('const vContinuationErrorReason = ');
  const workerHandoff = src.indexOf('if (attempt.vSettledContinuation === true && promptError && !currentAttemptReplaySafe && !aborted && !terminalInterrupted && params.isFinalFallbackAttempt === false && params.runId) {');
  assert(continuation > 0 && workerHandoff > continuation && gate > workerHandoff, 'both checks run before the replay-unsafe proceed gate');
  assert(src.slice(continuation, workerHandoff).includes('sessionPromptState.activePrompt.internal === true && params.runId && V_SETTLED_HANDOFF.continuations.has(params.runId)'));
  const sameModel = src.indexOf('if (vProviderErrorReason && (recoveryState.vProviderErrorContinuations ?? 0) < MAX_PROVIDER_ERROR_CONTINUATIONS) {');
  const handoffCheck = src.indexOf('const vHandoffError = vProviderErrorReason ? vSettledHandoffError(');
  assert(handoffCheck > 0 && handoffCheck < sameModel, 'the hand-off check precedes the same-model continuation');
  assert(src.slice(handoffCheck, sameModel).includes('runtime.pluginHarnessOwnsTransport === true'));
  const state = src.indexOf('const vSettledHandoff = params.runId ? V_SETTLED_HANDOFF.continuing.get(params.runId) : void 0;');
  assert(state > src.indexOf('function createEmbeddedRunSessionPromptState(input) {'));
  assert(src.slice(state, state + 600).includes('activePrompt = { override: MID_TURN_PRECHECK_CONTINUATION_PROMPT, persisted: true, internal: true };'));
});

test('the fallback runner moves a pending hand-off to the next candidate and skips the replay guard for it', () => {
  const src = read('model-fallback-runner-DOsPfj4O.js');
  const at = src.indexOf('const vSettledHandoff = params.runId ? vSettledHandoffState.pending.get(params.runId) : void 0;');
  assert(at > src.indexOf('const err = attemptRun.error;'));
  assert(src.slice(at, at + 500).includes('if (vSettledHandoff && hasRemainingCandidate) {'));
  assert(src.includes('if (!(vSettledHandoff && hasRemainingCandidate) && !attemptRun.classifiedResult && params.canFallbackAfterError && !await params.canFallbackAfterError({'));
});

test('the Worker reports the hand-off across IPC once, and the Gateway keeps it', () => {
  const worker = read('worker.mjs');
  assert(worker.includes('const vSettledHandoff = typeof message.runId === "string" && vSettledHandoffState.pending.delete(message.runId);'));
  assert(worker.includes('error: { ...serializeError(error), ...(vSettledHandoff ? { vSettledContinuation: true } : {}) },'));
  assert(read('worker-pool.mjs').includes('if (message.error?.vSettledContinuation === true) error.vSettledContinuation = true;'));
  const index = read('index.mjs');
  assert(index.includes('if (error?.vSettledContinuation === true) providerFailureWithoutTools = false;'));
  assert(index.includes('settledContinuation: error?.vSettledContinuation === true,'));
});

test('a harness failure marked as a hand-off is never replay-safe', async () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'sth-'));
  try {
    fs.writeFileSync(path.join(dir, 'harness-failure.mjs'), read('harness-failure.mjs'));
    const { buildHarnessFailureAttempt } = await import(pathToFileURL(path.join(dir, 'harness-failure.mjs')).href);
    const marked = buildHarnessFailureAttempt(new Error('500'), { providerFailureWithoutTools: true, settledContinuation: true });
    assert.equal(marked.vSettledContinuation, true);
    assert.deepEqual(marked.replayMetadata, { hadPotentialSideEffects: true, replaySafe: false });
    const clean = buildHarnessFailureAttempt(new Error('500'), { providerFailureWithoutTools: true });
    assert.equal(clean.vSettledContinuation, undefined);
    assert.deepEqual(clean.replayMetadata, { hadPotentialSideEffects: false, replaySafe: true }, '#375 unchanged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
