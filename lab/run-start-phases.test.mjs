// run-start-phases-v1: the head timer and where it is wired (core get-reply, agent-runner, Codex run-attempt).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { HEAD_HELPER, HEAD_MARKER } from './run-start-phases.mjs';
import { patchAgentRunner, patchCodexRunAttempt, patchGetReply } from './patch-run-start-phases.mjs';
import { HEAD_FILES } from './build-run-start-phases.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const KEY = Symbol.for('openclaw.v.runStartPhases.v1');
const freshHead = () => {
  delete globalThis[KEY];
  return new Function(`${HEAD_HELPER}\nreturn __vRunHead();`)();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('one tracker per process: marks before and after the run id, one summary at run start', async () => {
  const head = freshHead();
  assert.equal(new Function(`${HEAD_HELPER}\nreturn __vRunHead();`)(), head, 'a second chunk gets the same tracker');
  const h = head.begin();
  assert.equal(head.active(), true);
  await sleep(20);
  head.mark(h, '>reply.init_session_state');
  head.mark(h, 'reply.init_session_state');
  head.markRun('run-1', 'codex-enter'); // not bound yet: dropped
  head.bind(h, 'run-1');
  head.markRun('run-1', 'agent-turn');
  await sleep(120); // at least one lag sample
  head.markRun('run-1', 'codex-tools');
  head.mark(undefined, 'x'); // no head: ignored
  const out = head.finish('run-1');
  assert.equal(out.runId, 'run-1');
  assert.deepEqual(out.steps.map(([s]) => s), ['>reply.init_session_state', 'reply.init_session_state', 'agent-turn', 'codex-tools', 'run-start']);
  assert(out.steps[0][1] >= 15, 'the first step counts from the head start');
  assert(out.steps[3][1] >= 100);
  assert.equal(out.totalMs, out.steps.reduce((a, [, ms]) => a + ms, 0));
  assert(Math.abs(out.startedAtMs - Date.now()) < 5000);
  assert.equal(typeof out.lagMaxMs, 'number');
  assert.equal(head.finish('run-1'), undefined, 'logged once');
  head.markRun('run-1', 'codex-turn-start'); // after run start: ignored
  assert.equal(head.active(), false, 'the sampler stops with the last head');
  delete globalThis[KEY];
});

test('bounded: unbound heads expire after 60 s, bound after 10 min, at most 64, at most 80 steps', () => {
  const head = freshHead();
  const realNow = Date.now;
  try {
    let now = 1_000_000;
    Date.now = () => now;
    const unbound = head.begin();
    const bound = head.begin();
    head.bind(bound, 'run-b');
    now += 61_000;
    head.begin(); // expires the unbound one
    head.mark(unbound, 'late');
    assert.equal(unbound.steps.length, 0);
    head.markRun('run-b', 'still-here');
    assert.equal(bound.steps.length, 1);
    now += 600_000;
    head.begin();
    assert.equal(head.finish('run-b'), undefined, 'a bound head expires too');
    for (let i = 0; i < 100; i += 1) head.begin();
    const last = head.begin();
    head.bind(last, 'run-z');
    for (let i = 0; i < 100; i += 1) head.markRun('run-z', `s${i}`);
    assert.equal(head.finish('run-z').steps.length, 80);
  } finally {
    Date.now = realNow;
    for (let i = 0; i < 70; i += 1) globalThis[KEY]?.finish?.('none');
    delete globalThis[KEY];
  }
});

test('build inputs are V live bytes and outputs match the committed release files', () => {
  for (const file of HEAD_FILES) {
    const original = read(file.from);
    assert.equal(sha(original), file.before, `${file.name} input`);
    const patched = file.patch(original);
    assert.equal(read(`lab/release-files/run-start-phases/${file.name}`), patched, `${file.name} output is rebuilt`);
    assert.equal(patched.split(HEAD_HELPER).length, 2, `${file.name} carries the helper once`);
    assert.throws(() => file.patch(patched), /already carries/);
  }
});

const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

test('get-reply: head starts at entry on the reply options and every traced phase is marked', async () => {
  const out = patchGetReply(read(HEAD_FILES[0].from));
  assert.match(out, /async function getReplyFromConfig\(ctx, opts, configOverride\) \{\n\tconst vRunHead = opts && typeof opts === "object" && opts.isHeartbeat !== true \? __vRunHead\(\)\.begin\(\) : void 0;/);
  // the traced phase still returns the phase result and rethrows its error, and marks both ends
  const head = freshHead();
  const h = head.begin();
  head.bind(h, 'run-g');
  const def = between(out, '\tconst traceGetReplyPhase = ', '\tconst mergedSkillFilter');
  const traceGetReplyPhase = new Function('__vRunHead', 'resolverTiming', 'measureDiagnosticsTimelineSpan', 'vRunHead', 'cfg', 'traceAttributes',
    `${def}\nreturn traceGetReplyPhase;`)(() => head, { measure: async (_n, run) => await run() }, async (_n, run) => await run(), h, {}, {});
  assert.equal(await traceGetReplyPhase('reply.init_session_state', async () => 42), 42);
  await assert.rejects(traceGetReplyPhase('reply.resolve_directives', async () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(head.finish('run-g').steps.map(([s]) => s),
    ['>reply.init_session_state', 'reply.init_session_state', '>reply.resolve_directives', 'reply.resolve_directives', 'run-start']);
  delete globalThis[KEY];
});

test('agent-runner: bound at the run id, marks the pre-run stages, logs one line at run start', () => {
  const out = patchAgentRunner(read(HEAD_FILES[1].from));
  for (const step of ['run-reply-agent', 'agent-turn', 'turn-media', 'fallback-start', 'embedded-call']) assert(out.includes(`"${step}"`), step);
  assert.match(out, /const runId = params\.opts\?\.runId \?\? crypto\.randomUUID\(\);\n\t__vRunHead\(\)\.bind\(params\.opts\?\.vRunHead, runId\);/);
  const notify = between(out, '\tconst notifyAgentRunStart = () => {', '\tconst signalExecutionPhaseForTyping');
  assert(notify.indexOf('__vRunHead().finish(runId)') < notify.indexOf('params.opts?.onAgentRunStart?.('), 'logged before the channel hears of the run start');
  assert(notify.includes('agentTurnTimingLog.info(`[run-start-phases.1] ${JSON.stringify(vHead)}`)'));
  assert(out.indexOf('const agentTurnTimingLog = createSubsystemLogger') > 0);
  assert.match(between(out, '\tconst traceAgentPhase = ', '\tconst vExclusive'), /__vRunHead\(\)\.mark\(opts\?\.vRunHead, ">" \+ name\)/);
});

test('codex run-attempt: every stage before the run start is marked with the run id, behaviour unchanged', () => {
  const original = read(HEAD_FILES[2].from);
  const out = patchCodexRunAttempt(original);
  const fn = between(out, 'async function runCodexAppServerAttempt(params, options) {', '//#endregion');
  const order = ['codex-enter', 'codex-connection', 'codex-runtime', 'codex-tools', 'codex-context', 'codex-prompt'];
  let at = -1;
  for (const step of order) {
    const i = fn.indexOf(`"${step}"`);
    assert(i > at, `${step} in order`);
    at = i;
  }
  // the run start (any agent event) is the startup event at the top of startCodexAttemptRuntime, so marks past it
  // would never be recorded; this pins that assumption to V's bytes
  assert.match(between(original, 'async function startCodexAttemptRuntime(resources) {', '\t\tconst startupResult = '),
    /\ttry \{\n\t\temitCodexAppServerEvent\(params, \{\n\t\t\tstream: "codex_app_server\.lifecycle",\n\t\t\tdata: \{ phase: "startup" \}\n\t\t\}\);\n$/);
  assert.equal((fn.match(/__vRunHead\(\)\.markRun\(/g) ?? []).length, order.length);
  // removing the marks gives back the original stage calls
  const stripped = fn.replace(/\t+__vRunHead\(\)\.markRun\([^\n]*\n/g, '').replace(/\t+const vHeadRunId = [^\n]*\n/, '')
    .replace('\tconst vHeadContext = await prepareCodexAttemptContext(runtime, attemptTools);\n\tconst resources = prepareCodexAttemptResources(await prepareCodexAttemptPrompt(vHeadContext));\n',
      '\tconst resources = prepareCodexAttemptResources(await prepareCodexAttemptPrompt(await prepareCodexAttemptContext(runtime, attemptTools)));\n');
  assert.equal(stripped, between(original, 'async function runCodexAppServerAttempt(params, options) {', '//#endregion'));
  assert(!out.slice(0, out.indexOf(HEAD_HELPER)).includes(HEAD_MARKER));
});
