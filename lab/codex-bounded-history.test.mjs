// codex-bounded-history-v1 (lab/release-files/codex-firsttext, section H): a Codex turn reads the newest
// tail of the model context, and the full context only when it projects a fresh thread or a resumed
// binding older than that tail. These run the released functions against fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`./release-files/codex-firsttext/dist/${name}`, import.meta.url), 'utf8');
const sessionHistory = read('session-history-C5J1AKzG.js');
const runAttempt = read('run-attempt-D1hJO4fX.js');
const between = (source, start, end) => {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i);
  assert(i >= 0 && j > i, `region ${start.slice(0, 40)} not found`);
  return source.slice(i, j);
};

function loadOpen({ openModelContext }) {
  const body = between(sessionHistory, 'const CODEX_MODEL_CONTEXT_MAX_BYTES', '/** The synchronous consumer');
  const logs = [];
  const embeddedAgentLog = { info: (m) => logs.push(['info', m]), warn: (m, meta) => logs.push(['warn', m, meta]) };
  const fn = new Function('SessionManager', 'embeddedAgentLog', 'process', `${body}\nreturn openCodexModelContext;`);
  return { open: (env) => fn({ openModelContext }, embeddedAgentLog, { env }), logs };
}

test('the bounded read uses 9.5\'s limits and flags a truncated tail', () => {
  const calls = [];
  const { open, logs } = loadOpen({ openModelContext: (target, options) => {
    calls.push(options);
    if (options.limits) options.onBoundedRead({ events: 888, totalEvents: 24952, serializedBytes: 7_988_771, truncated: true });
    return { tag: options.limits ? 'bounded' : 'full' };
  } });
  const r = open({})({ sessionId: 's' }, { receipt: 1 }, 1_000_000);
  assert.deepEqual(r, { loaded: { tag: 'bounded' }, truncated: true });
  assert.deepEqual(calls[0].limits, { maxBytes: 8_000_000, maxEvents: 10_000 });
  assert.deepEqual(calls[0].admission, { receipt: 1 });
  assert.match(logs[0][1], /\[codex-bounded-history\.1\] \{"events":888,"totalEvents":24952,"bytes":7988771,"maxBytes":8000000,"ms":\d+\}/u);
  // a huge budget stops at 64 MiB
  open({})({}, undefined, 20_000_000);
  assert.equal(calls[1].limits.maxBytes, 64 * 1024 * 1024);
});

test('an untruncated tail is the whole context; no budget, the switch, or a failure read it in full', () => {
  let bounded = { truncated: false };
  const calls = [];
  const { open, logs } = loadOpen({ openModelContext: (target, options) => {
    calls.push(options);
    if (options.limits === 'throw') throw new RangeError('x');
    if (options.limits) {
      if (bounded === 'throw') throw new RangeError('Session transcript header exceeds the active-context byte limit');
      options.onBoundedRead(bounded);
    }
    return { tag: options.limits ? 'bounded' : 'full' };
  } });
  assert.deepEqual(open({})({}, undefined, 1e6), { loaded: { tag: 'bounded' }, truncated: false });
  assert.equal(logs.length, 0);
  // the hook path without a budget, and the switch
  assert.deepEqual(open({})({}, undefined, undefined), { loaded: { tag: 'full' }, truncated: false });
  assert.deepEqual(open({ OPENCLAW_V_CODEX_BOUNDED_HISTORY: '0' })({}, undefined, 1e6), { loaded: { tag: 'full' }, truncated: false });
  // core without the bounded reader ignores limits and never calls back: that read was the full one
  bounded = undefined;
  const plain = loadOpen({ openModelContext: () => ({ tag: 'full-from-unpatched-core' }) });
  assert.deepEqual(plain.open({})({}, undefined, 1e6), { loaded: { tag: 'full-from-unpatched-core' }, truncated: false });
  // a failed bounded read falls back to the full read
  bounded = 'throw';
  const before = calls.length;
  assert.deepEqual(open({})({}, undefined, 1e6), { loaded: { tag: 'full' }, truncated: false });
  assert.equal(calls.length - before, 2);
  assert.equal(logs.at(-1)[0], 'warn');
});

test('the model-context view marks a truncated result; native evidence is untouched', () => {
  const view = between(sessionHistory, '\tconst readTarget = (transcriptTarget) => {', '\ttry {\n');
  assert.match(view, /if \(view === "native-evidence"\) return SessionManager\.readSessionContext\(transcriptTarget, consume, \{ admission \}\);/u);
  assert.match(view, /const \{ loaded, truncated \} = openCodexModelContext\(transcriptTarget, admission, contextTokenBudget\);/u);
  assert.match(view, /if \(truncated && Array\.isArray\(result\)\) Object\.defineProperty\(result, "codexHistoryTruncated", \{ value: true \}\);/u);
  // the flag is not enumerable: hooks and snapshots see a plain message array
  const messages = [{ role: 'user' }];
  Object.defineProperty(messages, 'codexHistoryTruncated', { value: true });
  assert.equal(JSON.stringify(messages), '[{"role":"user"}]');
  assert.deepEqual(Object.keys(messages), ['0']);
});

function loadEnsure(messages, fullMessages) {
  const body = between(runAttempt, '\thistoryState.ensureHistoryFor = async (action, binding) => {', '\tconst hadSessionTranscriptState');
  const reads = [];
  const logs = [];
  const historyState = { messages };
  const readFencedHistory = async (bounded) => { reads.push(bounded); return fullMessages; };
  new Function('historyState', 'readFencedHistory', 'embeddedAgentLog', body)(historyState, readFencedHistory, { info: (m) => logs.push(m) });
  return { historyState, reads, logs };
}
const at = (iso) => Date.parse(iso);
const truncated = (...messages) => { Object.defineProperty(messages, 'codexHistoryTruncated', { value: true }); return messages; };

test('a fresh thread reads the full context; a resumed binding inside the tail does not', async () => {
  const full = [{ role: 'user', timestamp: at('2026-10-01T00:00:00Z') }, { role: 'user', timestamp: at('2026-10-09T10:00:00Z') }];
  const tail = () => truncated({ role: 'toolResult', timestamp: at('2026-10-09T09:00:00Z') }, { role: 'assistant', timestamp: at('2026-10-09T09:30:00Z') }, { role: 'user', timestamp: at('2026-10-09T10:00:00Z') });
  // started (a new thread, a transient memory flush, a rotated binding): full
  let e = loadEnsure(tail(), full);
  await e.historyState.ensureHistoryFor('started');
  assert.deepEqual(e.reads, [false]);
  assert.equal(e.historyState.messages, full);
  assert.match(e.logs[0], /\{"fullRead":"started","boundedMessages":3,"fullMessages":2,"ms":\d+\}/u);
  // resumed, binding covered through 09:45: the tail reaches back to 09:30, nothing more is read
  e = loadEnsure(tail(), full);
  await e.historyState.ensureHistoryFor('resumed', { historyCoveredThrough: '2026-10-09T09:45:00Z' });
  assert.deepEqual(e.reads, []);
  // resumed, binding covered through 09:10: messages after it may precede the tail, read it all
  e = loadEnsure(tail(), full);
  await e.historyState.ensureHistoryFor('resumed', { historyCoveredThrough: '2026-10-09T09:10:00Z' });
  assert.deepEqual(e.reads, [false]);
  // resumed without a cutoff selects every message (selectNewerVisibleHistoryAfterBinding): full
  e = loadEnsure(tail(), full);
  await e.historyState.ensureHistoryFor('resumed', {});
  assert.deepEqual(e.reads, [false]);
  // an untruncated history is never read again; a failed full read keeps the tail
  e = loadEnsure([{ role: 'user', timestamp: 1 }], full);
  await e.historyState.ensureHistoryFor('started');
  assert.deepEqual(e.reads, []);
  const kept = tail();
  e = loadEnsure(kept, undefined);
  await e.historyState.ensureHistoryFor('started');
  assert.equal(e.historyState.messages, kept);
});

test('run-attempt reads bounded only without a context engine, and asks for the full context before each fresh projection', () => {
  assert.match(runAttempt, /\t\t\t\.\.\.bounded && !activeContextEngine \? \{ contextTokenBudget: effectiveContextTokenBudget \} : \{\} \/\/ v-codex-bounded-history-v1\n/u);
  // before the stale-binding precompute, with the startup binding
  assert.match(runAttempt, /await historyState\.ensureHistoryFor\(isInactiveThreadBootstrapBinding\(mutable\.startupBinding\) \? "started" : "resumed", mutable\.startupBinding\); \/\/ v-codex-bounded-history-v1\n\tif \(precomputeNoContextEngineStaleBindingProjection\(\)\)/u);
  // a rotated binding starts fresh
  assert.match(runAttempt, /if \(promptState\.staleBindingContinuityForcedFreshStart\) \{\n\t\t\tawait historyState\.ensureHistoryFor\("started"\); \/\/ v-codex-bounded-history-v1\n\t\t\tapplyFreshThreadContinuityProjection\(\);/u);
  // the thread is ready: started or resumed, before its continuity projection
  assert.match(runAttempt, /await context\.historyState\?\.ensureHistoryFor\?\.\(state\.thread\.lifecycle\.action, state\.thread\); \/\/ v-codex-bounded-history-v1\n\t\tif \(applyNoContextEngineContinuityProjection\(state\.thread\.lifecycle\.action, state\.thread\)\)/u);
  assert.equal(runAttempt.split('v-codex-bounded-history-v1').length - 1, 5);
});
