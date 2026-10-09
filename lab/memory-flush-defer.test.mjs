import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto, { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  DEFAULT_IDLE_MS,
  STEER_POLL_MS,
  STEER_WAIT_MS,
  MEMORY_FLUSH_DEFER_MARKER,
  MIN_HEADROOM_TOKENS,
  extractBuiltinQueueHandle,
  extractDeferRegion,
  patchAgentRunnerMemory,
  patchAgentRunnerRuntime,
  patchBuiltinOpenclaw,
} from './patch-memory-flush-defer.mjs';
import { EXPECTED_INPUT_SHA256 } from './build-memory-flush-defer.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const runtimeInput = read('../release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/agent-runner.runtime-CAdsMsQt.js');
const memoryInput = read('./fixtures/memory-flush-defer/agent-runner-memory-7VF-zwNt.js');
const released = (name) => read(`./release-files/memory-flush-defer/${name}`);
const runtimeOut = released('agent-runner.runtime-CAdsMsQt.js');
// npm 2026.9.1 bytes of the Gateway work admission chunk (unmodified on V), run for real below.
const admissionSource = read('./fixtures/memory-flush-defer/gateway-work-admission-3tn4Qiws.js');
const ADMISSION_SHA256 = '7018c585a8ba0c7514e0521ba0e215dedcd07d8f01bd9a33121997cc0b589c10';
const memoryOut = released('agent-runner-memory-7VF-zwNt.js');
const builtinInput = read('../release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/builtin-openclaw-zQV8Wwjr.js');
const builtinOut = released('builtin-openclaw-zQV8Wwjr.js');
// npm 2026.9.1 bytes of the embedded run registry (unmodified on V): the sessionId injection path.
const runsSource = read('./fixtures/memory-flush-defer/runs-5WnDPZ0V.js');
const RUNS_SHA256 = '407999737bf83f799b68042ab6e9de48920bcdf656be8fba58c3183a82f24359';
// V's subagent announce delivery (V patches it), from the same capture.
const announceSource = read('../release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/subagent-announce-delivery-Dosep7Zr.js');

test('inputs are V\'s pinned bytes and the release files are exactly the patch of them', () => {
  assert.equal(sha(runtimeInput), EXPECTED_INPUT_SHA256['agent-runner.runtime-CAdsMsQt.js']);
  assert.equal(sha(memoryInput), EXPECTED_INPUT_SHA256['agent-runner-memory-7VF-zwNt.js']);
  // V runs the npm bytes of agent-runner-memory: the latest capture does not list it as modified.
  const manifest = JSON.parse(read('../release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/manifest.json'));
  assert(!manifest.files.some((f) => f.path.includes('agent-runner-memory-')));
  assert(!manifest.files.some((f) => f.path.includes('gateway-work-admission-')));
  assert.equal(sha(admissionSource), ADMISSION_SHA256);
  assert.equal(manifest.files.find((f) => f.path === './agent-runner.runtime-CAdsMsQt.js').sha256, sha(runtimeInput));
  assert.equal(patchAgentRunnerRuntime(runtimeInput), runtimeOut);
  assert.equal(patchAgentRunnerMemory(memoryInput), memoryOut);
  // builtin-openclaw: V's bytes from the latest capture (V patches it)
  assert.equal(sha(builtinInput), EXPECTED_INPUT_SHA256['builtin-openclaw-zQV8Wwjr.js']);
  assert.equal(manifest.files.find((f) => f.path === './builtin-openclaw-zQV8Wwjr.js').sha256, sha(builtinInput));
  assert.equal(patchBuiltinOpenclaw(builtinInput), builtinOut);
  // the injection path and the announce caller run below as V runs them
  assert.equal(sha(runsSource), RUNS_SHA256);
  assert(!manifest.files.some((f) => f.path.includes('runs-5WnDPZ0V')));
  assert.equal(manifest.files.find((f) => f.path === './subagent-announce-delivery-Dosep7Zr.js').sha256, sha(announceSource));
});

test('each anchor is replaced exactly once and a patched file is refused', () => {
  assert.throws(() => patchAgentRunnerRuntime(runtimeOut), /already patched/);
  assert.throws(() => patchAgentRunnerMemory(memoryOut), /already patched/);
  // anchors are unique in the inputs; a duplicated anchor is refused instead of patched twice
  const doubled = memoryInput.replace('\tconst latch = entry.transcriptByteCompactionLatch;\n', '\tconst latch = entry.transcriptByteCompactionLatch;\n\tif (latch !== void 0 && (typeof maxActiveTranscriptBytes !== "number" || false)) {}\n');
  assert.throws(() => patchAgentRunnerMemory(doubled), /Expected exactly one byte-compaction latch clear/);
  assert.throws(() => patchAgentRunnerRuntime(runtimeInput.replace('async function executePreparedReplyAgentRun(context) {\n', '')), /Expected exactly one reply agent run executor/);
  assert.throws(() => patchBuiltinOpenclaw(builtinOut), /already patched/);
  assert.throws(() => patchBuiltinOpenclaw(builtinInput.replace('\t\tisCompacting: () => subscription.isCompacting(),\n', '')), /Expected exactly one embedded run compacting state/);
  assert.equal(memoryOut.split(MEMORY_FLUSH_DEFER_MARKER).length - 1, 14);
  assert.equal(memoryOut.split('if (!isAbortError(error) && run.memoryFlushDeferred !== true && storePath && sessionKey) try {').length - 1, 1);
  assert.equal(runtimeOut.split('deferPreReplyFlush:').length - 1, 1);
  assert.equal(runtimeOut.split('yieldDeferredMemoryFlush(sessionKey, "inbound-turn")').length - 1, 1);
});

test('the runtime wiring sits where the reply path flushes and where a turn starts', () => {
  const exec = runtimeOut.slice(runtimeOut.indexOf('async function executePreparedReplyAgentRun(context) {'), runtimeOut.indexOf('traceAgentPhase("reply.preflight_compaction"'));
  assert.match(exec, /traceAgentPhase\("reply\.memory_flush", \(\) => runMemoryFlushIfNeeded\(\{[\s\S]*deferPreReplyFlush: \(flushState\) => deferPreReplyMemoryFlush\(\{/);
  const reply = runtimeOut.slice(runtimeOut.indexOf('async function runReplyAgent(params) {'));
  const yieldAt = reply.indexOf('yieldDeferredMemoryFlush(sessionKey, "inbound-turn")');
  assert(yieldAt > 0 && yieldAt < reply.indexOf('runActiveReplySteer({') && yieldAt < reply.indexOf('enqueueFollowupRun('));
  assert.match(reply, /if \(!isHeartbeat && sessionKey\) yieldDeferredMemoryFlush/);
  // busy state is re-resolved after the yield and before every queue decision
  assert.match(reply, /isActive: isActiveBeforeDeferredFlushYield, isRunActive,/);
  const resolvedAt = reply.indexOf('const isActive = resolveReplyActiveAfterDeferredFlushYield({');
  assert(resolvedAt > yieldAt && resolvedAt < reply.indexOf('shouldQueueAuthorityMismatch =') && resolvedAt < reply.indexOf('runActiveReplySteer({') && resolvedAt < reply.indexOf('resolveActiveRunQueueAction({'));
  assert.equal(reply.slice(0, reply.indexOf('\n}\n')).split('isActiveBeforeDeferredFlushYield').length - 1, 2);
  // every name the region uses is bound in the chunk
  for (const [name, re] of [
    ['runSessionCompactionIfNeeded/runMemoryFlushIfNeeded', /^import \{ n as runSessionCompactionIfNeeded, t as runMemoryFlushIfNeeded \} from "\.\/agent-runner-memory-7VF-zwNt\.js";$/m],
    ['replyRunRegistry/runAfterReplyOperationClear', /^import \{[^}]*m as replyRunRegistry[^}]*z as runAfterReplyOperationClear \} from /m],
    ['createSubsystemLogger', /^import \{ t as createSubsystemLogger \} from /m],
    ['logVerbose', /^import \{ r as logVerbose \} from /m],
    ['crypto', /^import crypto from "node:crypto";$/m],
    ['gateway work admission', /^import \{ b as runWithGatewayIndependentRootWorkAdmission, f as isGatewayWorkAdmissionClosed, s as getGatewayRestartDrainSignal, t as GatewayDrainingError \} from "\.\/gateway-work-admission-3tn4Qiws\.js";$/m],
    ['refreshSessionEntryFromStore', /^function refreshSessionEntryFromStore\(params\) \{$/m],
  ]) assert.match(runtimeOut, re, name);
});

// ---------------------------------------------------------------------------------------
// Evaluate the patched agent-runner-memory module against fakes for its imports.

function loadMemoryModule(fakes) {
  const names = [];
  const body = [];
  for (const line of memoryOut.split('\n')) {
    if (line.startsWith('import ')) {
      const named = line.match(/^import \{ (.+) \} from "[^"]+";$/);
      const deflt = line.match(/^import (\w+) from "node:\w+";$/);
      if (named) for (const part of named[1].split(', ')) names.push(part.includes(' as ') ? part.split(' as ')[1] : part);
      else if (deflt) names.push(deflt[1]);
      else assert.match(line, /^import "[^"]+";$/);
      continue;
    }
    if (line.startsWith('export {')) {
      body.push('return { runSessionCompactionIfNeeded, runMemoryFlushIfNeeded, hasAlreadyFlushedForCurrentCompaction };');
      continue;
    }
    body.push(line);
  }
  const values = names.map((name) => (name in fakes ? fakes[name] : (...args) => { throw new Error(`unexpected call to ${name}(${JSON.stringify(args).slice(0, 80)})`); }));
  return new Function(...names, body.join('\n'))(...values);
}

function memoryFakes(overrides = {}) {
  const calls = { verbose: [], incrementCompactionCount: [], compact: [], plan: [], updateSessionEntry: [] };
  const plan = { softThresholdTokens: 4000, forceFlushTranscriptBytes: 2097152, reserveTokensFloor: 20000 };
  const fakes = {
    fs, path, crypto,
    createSubsystemLogger: () => ({ info() {}, warn() {}, debug() {} }),
    createLazyImportLoader: () => ({ load: async () => ({
      compactEmbeddedAgentSession: async (...args) => { calls.compact.push(args[0]); return { ok: true, compacted: false, reason: 'below_threshold' }; },
      truncateOversizedToolResultsInMessages: (messages) => ({ messages }),
    }) }),
    normalizeOptionalString: (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
    normalizeLowercaseStringOrEmpty: (v) => (typeof v === 'string' ? v.toLowerCase() : ''),
    logVerbose: (m) => calls.verbose.push(m),
    resolveSandboxRuntimeStatus: () => ({ sandboxed: false, workspaceAccess: 'rw' }),
    isIncognitoSessionKey: () => false,
    resolveEffectiveAgentRuntime: () => 'vlab-worker',
    isCliRuntimeAliasForProvider: () => false,
    isCliProvider: () => false,
    resolvePersistedSessionRuntimeId: () => undefined,
    resolveCliBackendConfig: () => undefined,
    resolveContextTokensForModel: () => 1_000_000,
    resolveContextConfigProviderForRuntime: (p) => p.provider,
    resolveMemoryFlushPlan: (p) => { calls.plan.push(p); return p.nowMs ? null : plan; },
    resolveEffectiveCompactionReserveTokens: () => 20000,
    estimateMessagesTokens: (messages) => messages.reduce((n, m) => n + Math.ceil(String(m.content).length / 4), 0),
    resolveFreshSessionTotalTokens: (e) => (e?.totalTokensFresh === true ? e.totalTokens : undefined),
    readSessionTranscriptActiveStats: () => ({ sizeBytes: overrides.transcriptBytes ?? 3_500_000, eventCount: 400 }),
    readRecentSessionTranscriptActiveEvents: () => [],
    selectSessionTranscriptLeafControlledPath: () => undefined,
    deriveContextPromptTokens: () => undefined,
    resolveBootstrapWarningSignaturesSeen: () => [],
    resolveDefaultAgentId: () => 'makaron',
    isUnscopedSessionKeySentinel: () => false,
    resolveAgentIdFromSessionKey: () => 'makaron',
    resolveSessionStorePathForScope: (p) => p.storePath,
    resolveSessionStorePathCore: () => '/store',
    resolveMergedModelProviderConfig: () => undefined,
    resolveMergedModelProviderModels: () => new Map(),
    normalizeProviderId: (v) => String(v).toLowerCase(),
    normalizeStaticProviderModelId: (_p, v) => v,
    resolveModelExtraParamSources: () => ({ defaultParams: {}, modelParams: {} }),
    resolveOpenAIResponsesServerCompactionPlan: () => ({ enabled: false, threshold: undefined }),
    resolveAnthropicServerCompactionPlan: () => ({ enabled: false }),
    parseNonNegativeByteSize: (v) => (typeof v === 'number' ? v : undefined),
    incrementCompactionCount: async (p) => { calls.incrementCompactionCount.push(p); return 1; },
    updateSessionEntry: async (...args) => { calls.updateSessionEntry.push(args); return undefined; },
    isBenignCompactionSkipResult: (r) => !r.compacted,
    ...overrides.fakes,
  };
  return { fakes, calls };
}

const followupRun = (prompt = '帮我看下这个') => ({ prompt, run: { agentId: 'makaron', sessionId: 's1', sessionKey: 'agent:makaron:feishu:dm:u1', provider: 'provider-a', model: 'model-a', workspaceDir: '/ws', config: {} } });
const entry = (over = {}) => ({ sessionId: 's1', totalTokens: 300_000, totalTokensFresh: true, compactionCount: 0, ...over });
const baseParams = (over = {}) => ({ cfg: { agents: { defaults: { compaction: {} } } }, followupRun: followupRun(), promptForEstimate: followupRun().prompt, sessionEntry: entry(), sessionStore: {}, sessionKey: 'agent:makaron:feishu:dm:u1', storePath: '/store', isHeartbeat: false, ...over });

test('memory module: a transcript-size flush asks the hook with its numbers and returns "deferred" without running', async () => {
  const { fakes, calls } = memoryFakes();
  const { runMemoryFlushIfNeeded } = loadMemoryModule(fakes);
  const phases = [];
  let asked;
  const result = await runMemoryFlushIfNeeded(baseParams({
    replyOperation: { setPhase: (p) => phases.push(p), updateSessionId() {} },
    deferPreReplyFlush: async (state) => { asked = state; return true; },
  }));
  assert.equal(result.outcome, 'deferred');
  assert.equal(asked.tokenTriggered, false);
  assert.equal(asked.transcriptBytes, 3_500_000);
  assert.equal(asked.forceFlushTranscriptBytes, 2097152);
  assert.equal(asked.flushThreshold, 1_000_000 - 20000 - 4000);
  assert(asked.tokenCount >= 300_000 && asked.tokenCount < 301_000);
  assert.deepEqual(phases, []); // never entered memory_flushing
  assert.equal(calls.plan.filter((p) => p.nowMs).length, 0); // never prepared a flush attempt
});

test('memory module: hook false, hook throwing, or no hook all flush before the reply as before', async () => {
  for (const hook of [async () => false, async () => { throw new Error('probe failed'); }, undefined]) {
    const { fakes, calls } = memoryFakes();
    const { runMemoryFlushIfNeeded } = loadMemoryModule(fakes);
    const phases = [];
    const result = await runMemoryFlushIfNeeded(baseParams({ replyOperation: { setPhase: (p) => phases.push(p), updateSessionId() {} }, ...(hook ? { deferPreReplyFlush: hook } : {}) }));
    // the fake plan resolver stops the attempt right after the flush was committed to
    assert.deepEqual(phases, ['memory_flushing']);
    assert.equal(result.outcome, 'skipped');
    assert.equal(calls.plan.filter((p) => p.nowMs).length, 1);
  }
});

test('memory module: a session already flushed this cycle never reaches the hook', async () => {
  const { fakes } = memoryFakes();
  const { runMemoryFlushIfNeeded } = loadMemoryModule(fakes);
  let asked = false;
  const result = await runMemoryFlushIfNeeded(baseParams({ sessionEntry: entry({ memoryFlush: { kind: 'succeeded', compactionCount: 0 } }), deferPreReplyFlush: async () => { asked = true; return true; } }));
  assert.equal(result.outcome, 'skipped');
  assert.equal(asked, false);
});

test('memory module: a token-threshold flush tells the hook it is token-triggered', async () => {
  const { fakes } = memoryFakes({ transcriptBytes: 100 });
  const { runMemoryFlushIfNeeded } = loadMemoryModule(fakes);
  let asked;
  await runMemoryFlushIfNeeded(baseParams({ sessionEntry: entry({ totalTokens: 977_000 }), deferPreReplyFlush: async (s) => { asked = s; return false; } }));
  assert.equal(asked.tokenTriggered, true);
});

test('memory module: the preflight probe reports the real gate and neither compacts nor writes', async () => {
  for (const [label, sessionEntry, cfgCompaction, transcriptBytes, expect] of [
    ['far below', entry(), {}, 3_500_000, false],
    ['over the token threshold', entry({ totalTokens: 990_000 }), {}, 3_500_000, true],
    ['over maxActiveTranscriptBytes', entry(), { maxActiveTranscriptBytes: 3_000_000 }, 3_500_000, true],
    ['stale latch from another session', entry({ transcriptByteCompactionLatch: { sessionId: 'old', maxBytes: 3_000_000, activeBytes: 3_100_000 } }), { maxActiveTranscriptBytes: 3_000_000 }, 3_500_000, true],
  ]) {
    const { fakes, calls } = memoryFakes({ transcriptBytes });
    const { runSessionCompactionIfNeeded } = loadMemoryModule(fakes);
    const probe = {};
    let started = false;
    const out = await runSessionCompactionIfNeeded({ ...baseParams({ cfg: { agents: { defaults: { compaction: cfgCompaction } } }, sessionEntry }), probe, onCompactionStart: () => { started = true; } });
    assert.equal(probe.willCompact, expect, label);
    assert.equal(probe.threshold, 980_000, label);
    assert.equal(typeof probe.tokenCount, 'number', label);
    assert.equal(out, sessionEntry, label);
    assert.equal(started, false, label);
    assert.equal(calls.compact.length, 0, label);
    assert.equal(calls.incrementCompactionCount.length, 0, label);
  }
  // without a probe the same stale latch is still cleared, as upstream does
  const { fakes, calls } = memoryFakes();
  const { runSessionCompactionIfNeeded } = loadMemoryModule(fakes);
  await runSessionCompactionIfNeeded({ ...baseParams({ cfg: { agents: { defaults: { compaction: { maxActiveTranscriptBytes: 3_000_000 } } } }, sessionEntry: entry({ transcriptByteCompactionLatch: { sessionId: 'old', maxBytes: 3_000_000, activeBytes: 3_100_000 } }) }) });
  assert.equal(calls.incrementCompactionCount[0]?.amount, 0);
});

test('memory module: a heartbeat leaves the probe empty (unknown)', async () => {
  const { fakes } = memoryFakes();
  const { runSessionCompactionIfNeeded } = loadMemoryModule(fakes);
  const probe = {};
  await runSessionCompactionIfNeeded({ ...baseParams({ isHeartbeat: true }), probe });
  assert.deepEqual(probe, {});
});

test('memory module: a Codex session reports no OpenClaw compaction, with its tokens when they are fresh', async () => {
  // V 2026-10-07 11:28: a /vds turn waited 73 s behind the flush because this probe stayed empty
  const codex = memoryFakes({ fakes: { resolveEffectiveAgentRuntime: () => 'codex' } });
  const probe = {};
  const out = await loadMemoryModule(codex.fakes).runSessionCompactionIfNeeded({ ...baseParams(), probe });
  assert.equal(probe.willCompact, false);
  assert.equal(probe.threshold, 980_000);
  assert.equal(typeof probe.tokenCount, 'number');
  assert(probe.tokenCount > 0);
  assert.equal(codex.calls.compact.length, 0);
  assert.equal(codex.calls.incrementCompactionCount.length, 0);
  assert.deepEqual(out, baseParams().sessionEntry);
  // a stale token count still means no OpenClaw compaction; only the count is left out
  // (V 2026-10-07 13:55 and 14:00: a stale /vds session ran a 40-50 s flush in front of each message)
  const stale = memoryFakes({ fakes: { resolveEffectiveAgentRuntime: () => 'codex' } });
  const probe2 = {};
  await loadMemoryModule(stale.fakes).runSessionCompactionIfNeeded({ ...baseParams({ sessionEntry: entry({ totalTokensFresh: false }) }), probe: probe2 });
  assert.deepEqual(probe2, { willCompact: false, threshold: 980_000 });
  assert.equal(stale.calls.compact.length, 0);
});

// ---------------------------------------------------------------------------------------
// Evaluate the runtime's deferral region against fakes.

// runReplyAgent from its start through the queue decision; reaching the turn's own run
// returns "run-own-turn" instead of continuing.
function extractReplyAgentHead(runtime) {
  const start = runtime.indexOf('async function runReplyAgent(params) {\n');
  const stop = runtime.indexOf('\tfollowupRun.run.config = await resolveQueuedReplyExecutionConfig(', start);
  assert(start >= 0 && stop > start, 'runReplyAgent head not found');
  return `${runtime.slice(start, stop)}\treturn "run-own-turn";\n}`;
}

// The real Gateway work admission chunk, with its two imports faked and a private state.
function loadAdmissionModule() {
  const body = [];
  let exported;
  for (const line of admissionSource.split('\n')) {
    if (line.startsWith('import ')) continue;
    if (line.startsWith('export {')) {
      exported = Object.fromEntries(line.slice('export { '.length, -' };'.length).split(', ').map((part) => part.split(' as ').reverse()));
      body.push(`return { ${Object.entries(exported).map(([letter, name]) => `${letter}: ${name}, ${name}`).join(', ')} };`);
      continue;
    }
    body.push(line);
  }
  const mod = new Function('resolveGlobalSingleton', 'createSubsystemLogger', 'AsyncLocalStorage', body.join('\n'))(
    (_key, create) => create(), () => ({ info() {}, warn() {} }), AsyncLocalStorage);
  return { mod, exported };
}

function loadRegion({ env = {}, probeResult = { willCompact: false, threshold: 980_000, tokenCount: 300_500 }, flushOutcome = 'completed', activeOps = new Map(), freshEntry = entry(), unwindOnAbort = true, replyFakes = {} } = {}) {
  const log = [];
  const verbose = [];
  const timers = [];
  const afterClear = [];
  const flushCalls = [];
  const probeCalls = [];
  const { mod: admission } = loadAdmissionModule();
  const fakes = {
    createSubsystemLogger: () => ({ info: (m) => log.push(m) }),
    process: { env },
    crypto,
    logVerbose: (m) => verbose.push(m),
    runSessionCompactionIfNeeded: async (p) => { probeCalls.push(p); Object.assign(p.probe, probeResult); return p.sessionEntry; },
    runMemoryFlushIfNeeded: async (p) => {
      flushCalls.push(p);
      p.__rootWork = admission.getActiveGatewayRootWorkHolders();
      // the embedded flush run enqueues on the session lane: enqueueCommandInLane rejects
      // with GatewayDrainingError when subordinate admission is closed, and the flush
      // records a failure (command-queue-oRD7ZANz.js enqueueCommandInLane)
      if (admission.isGatewaySubordinateWorkAdmissionClosed()) {
        p.__admissionClosed = true;
        return { outcome: 'failed' };
      }
      if (p.abortSignal.aborted) return { outcome: 'failed' };
      return await new Promise((resolve) => {
        // unwindOnAbort=false: the aborted embedded run keeps the session until __finish
        if (unwindOnAbort) p.abortSignal.addEventListener('abort', () => resolve({ outcome: 'failed' }));
        p.__finish = () => resolve({ outcome: p.abortSignal.aborted ? 'failed' : flushOutcome });
      });
    },
    // the reply registry runs after-clear callbacks from the clearing reply's context
    runAfterReplyOperationClear: (op, cb) => afterClear.push({ op, cb: AsyncLocalStorage.bind(cb) }),
    replyRunRegistry: {
      get: (key) => activeOps.get(key),
      // a reply can take a steered message once its run has attached a backend
      resolveCurrentMessageInjectionTarget: (key) => { const op = activeOps.get(key); return op && op.injectable !== false ? { op } : undefined; },
    },
    refreshSessionEntryFromStore: () => freshEntry,
    // a real timer callback runs in the async context that armed it
    setTimeout: (fn, ms) => {
      if (ms === STEER_POLL_MS) return globalThis.setTimeout(fn, 1); // the steer-wait poll runs for real
      const t = { fn: AsyncLocalStorage.bind(fn), ms, cleared: false, unref() { this.unrefd = true; } };
      timers.push(t);
      return t;
    },
    clearTimeout: (t) => { if (t) t.cleared = true; },
    runWithGatewayIndependentRootWorkAdmission: admission.runWithGatewayIndependentRootWorkAdmission,
    isGatewayWorkAdmissionClosed: admission.isGatewayWorkAdmissionClosed,
    getGatewayRestartDrainSignal: admission.getGatewayRestartDrainSignal,
  };
  // The region plus the head of runReplyAgent (through its queue decision), evaluated in
  // one scope so the reply turn sees the same deferred-flush jobs. Free names resolve to
  // the fakes, then to globals; anything else throws when called.
  Object.assign(fakes, replyFakes);
  const scope = new Proxy({}, {
    has: (_t, k) => typeof k === 'string',
    get: (_t, k) => {
      if (k === Symbol.unscopables) return undefined;
      if (Object.hasOwn(fakes, k)) return fakes[k];
      if (k in globalThis) return globalThis[k];
      return (...args) => { throw new Error(`unexpected call to ${String(k)}(${JSON.stringify(args).slice(0, 80)})`); };
    },
  });
  const head = extractReplyAgentHead(runtimeOut);
  const api = new Function('scope', `with (scope) {\n${extractDeferRegion(runtimeOut)}\n${head}\nreturn { resolvePreReplyMemoryFlushDeferral, deferPreReplyMemoryFlush, yieldDeferredMemoryFlush, deferredMemoryFlushJobs, resolveDeferredMemoryFlushIdleMs, runReplyAgentHead: runReplyAgent };\n}`)(scope);
  return { api, log, verbose, timers, afterClear, flushCalls, probeCalls, admission };
}

const sessionKey = 'agent:makaron:feishu:dm:u1';
const replyOperation = { key: sessionKey, abortSignal: new AbortController().signal };
const ctxFor = (flushState, over = {}) => ({
  flushState, cfg: { c: 1 }, followupRun: followupRun('用户这条消息的正文'), defaultModel: 'model-a', sessionStore: {}, sessionKey,
  runtimePolicySessionKey: sessionKey, storePath: '/store', isHeartbeat: false, replyOperation, sessionCtx: { Provider: 'feishu' }, resolvedVerboseLevel: 'off', ...over,
});
const sizeState = { sessionEntry: entry(), tokenCount: 300_500, flushThreshold: 976_000, tokenTriggered: false, transcriptBytes: 3_500_000, forceFlushTranscriptBytes: 2097152 };

test('decision: defer only housekeeping; keep when compaction will run, is near or unknown, for heartbeat and when switched off', () => {
  const { api } = loadRegion();
  const d = (over) => api.resolvePreReplyMemoryFlushDeferral({ enabled: true, isHeartbeat: false, hasSession: true, tokenCount: 300_500, flushThreshold: 976_000, probe: { willCompact: false, threshold: 980_000, tokenCount: 300_500 }, ...over });
  assert.deepEqual(d({}), { defer: true, reason: 'housekeeping', headroom: 244_000 });
  assert.equal(d({ probe: { willCompact: true, threshold: 980_000 } }).reason, 'compaction-this-turn');
  assert.equal(d({ probe: {} }).reason, 'compaction-unknown');
  assert.equal(d({ probe: undefined }).reason, 'probe-required');
  assert.equal(d({ probe: { willCompact: false, threshold: 980_000, tokenCount: 800_000 } }).reason, 'near-compaction');
  // a token-threshold flush is within softThresholdTokens of compaction: always first
  assert.equal(d({ tokenCount: 976_500 }).reason, 'near-compaction');
  // forced by transcript size while the token counters are stale: unknown, keep
  assert.equal(d({ tokenCount: undefined }).reason, 'token-count-unknown');
  assert.equal(d({ isHeartbeat: true }).reason, 'heartbeat');
  assert.equal(d({ enabled: false }).reason, 'disabled');
  assert.equal(d({ hasSession: false }).reason, 'no-session');
  // small windows: the headroom floor applies
  assert.equal(d({ flushThreshold: 100_000, tokenCount: 70_000 }).reason, 'near-compaction');
  assert.equal(d({ flushThreshold: 100_000, tokenCount: 60_000, probe: { willCompact: false, threshold: 104_000, tokenCount: 60_000 } }).headroom, MIN_HEADROOM_TOKENS);
});

test('switch and idle settings come from the environment', async () => {
  const off = loadRegion({ env: { OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH: '0' } });
  assert.equal(await off.api.deferPreReplyMemoryFlush(ctxFor(sizeState)), false);
  assert.equal(off.probeCalls.length, 0);
  assert.equal(off.api.deferredMemoryFlushJobs.size, 0);
  assert.equal(loadRegion().api.resolveDeferredMemoryFlushIdleMs({}), DEFAULT_IDLE_MS);
  assert.equal(loadRegion().api.resolveDeferredMemoryFlushIdleMs({ OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH_IDLE_MS: '5000' }), 5000);
  assert.equal(loadRegion().api.resolveDeferredMemoryFlushIdleMs({ OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH_IDLE_MS: 'x' }), DEFAULT_IDLE_MS);
  const hb = loadRegion();
  assert.equal(await hb.api.deferPreReplyMemoryFlush(ctxFor(sizeState, { isHeartbeat: true })), false);
  assert.equal(hb.probeCalls.length, 0);
});

test('a deferred flush is probed with the turn\'s inputs, logged without text, and run after the reply and the idle wait', async () => {
  const t = loadRegion();
  assert.equal(await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState)), true);
  // probe uses the same inputs as the preflight compaction call that follows
  assert.equal(t.probeCalls.length, 1);
  assert.equal(t.probeCalls[0].promptForEstimate, '用户这条消息的正文');
  assert.equal(t.probeCalls[0].sessionEntry, sizeState.sessionEntry);
  assert.equal(t.probeCalls[0].abortSignal, replyOperation.abortSignal);
  // one tagged line, hashed key, numbers only
  assert.equal(t.log.length, 1);
  assert.match(t.log[0], /^\[memory-flush-deferred\.1\] \{/);
  const fields = JSON.parse(t.log[0].replace('[memory-flush-deferred.1] ', ''));
  assert.deepEqual(fields, { phase: 'deferred', session: createHash('sha256').update(sessionKey).digest('hex').slice(0, 12), tokens: 300_500, threshold: 976_000, compactionThreshold: 980_000, trigger: 'transcript_bytes', idleMs: DEFAULT_IDLE_MS });
  assert(!t.log[0].includes('用户') && !t.log[0].includes(sessionKey));
  // nothing runs until the reply operation clears
  assert.equal(t.flushCalls.length, 0);
  assert.equal(t.afterClear.length, 1);
  assert.equal(t.afterClear[0].op, replyOperation);
  assert.equal(t.timers.length, 0);
  t.afterClear[0].cb();
  assert.equal(t.timers.length, 1);
  assert.equal(t.timers[0].ms, DEFAULT_IDLE_MS);
  assert.equal(t.timers[0].unrefd, true);
  assert.equal(t.flushCalls.length, 0);
  t.timers[0].fn();
  assert.equal(t.flushCalls.length, 1);
  const call = t.flushCalls[0];
  assert.equal(call.deferPreReplyFlush, undefined);
  assert.equal(call.isHeartbeat, false);
  assert.equal(call.promptForEstimate, '');
  assert.equal(call.followupRun.prompt, '');
  assert.equal(call.replyOperation, undefined);
  assert.equal(call.sessionKey, sessionKey);
  assert.equal(call.storePath, '/store');
  assert.equal(call.sessionEntry.sessionId, 's1');
  assert.notEqual(call.followupRun, ctxFor(sizeState).followupRun);
  assert(call.abortSignal instanceof AbortSignal);
  call.__finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(t.api.deferredMemoryFlushJobs.size, 0);
  assert.match(t.log.at(-1), /"phase":"ran".*"outcome":"completed"/);
});

test('when compaction will run this turn nothing is scheduled and the flush stays first', async () => {
  const t = loadRegion({ probeResult: { willCompact: true, threshold: 980_000, tokenCount: 990_000 } });
  assert.equal(await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState)), false);
  assert.equal(t.afterClear.length, 0);
  assert.equal(t.api.deferredMemoryFlushJobs.size, 0);
  assert.equal(t.log.length, 0);
  // and a token-threshold flush never even probes
  const n = loadRegion();
  assert.equal(await n.api.deferPreReplyMemoryFlush(ctxFor({ ...sizeState, tokenCount: 977_000, tokenTriggered: true })), false);
  assert.equal(n.probeCalls.length, 0);
});

test('a session busy with another reply when the idle wait ends waits for that reply to clear', async () => {
  const otherOp = { key: sessionKey };
  const activeOps = new Map([[sessionKey, otherOp]]);
  const t = loadRegion({ activeOps });
  await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState));
  t.afterClear[0].cb();
  t.timers[0].fn();
  assert.equal(t.flushCalls.length, 0);
  assert.equal(t.afterClear.length, 2);
  assert.equal(t.afterClear[1].op, otherOp);
  activeOps.clear();
  t.afterClear[1].cb();
  t.timers[1].fn();
  assert.equal(t.flushCalls.length, 1);
});

test('a new turn aborts a running deferred flush and the flush waits for idle again', async () => {
  const t = loadRegion();
  await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState));
  t.afterClear[0].cb();
  // a turn during the idle wait restarts the wait
  assert.equal(t.api.yieldDeferredMemoryFlush(sessionKey, 'inbound-turn'), false);
  assert.equal(t.timers[0].cleared, true);
  assert.equal(t.timers.length, 2);
  t.timers[0].fn(); // stale timer does nothing
  assert.equal(t.flushCalls.length, 0);
  t.timers[1].fn();
  assert.equal(t.flushCalls.length, 1);
  // a turn while the flush runs aborts it
  assert.equal(t.api.yieldDeferredMemoryFlush(sessionKey, 'inbound-turn'), true);
  assert.equal(t.flushCalls[0].abortSignal.aborted, true);
  await new Promise((r) => setImmediate(r));
  assert.match(t.log.find((l) => l.includes('"phase":"yielded"')), /"reason":"inbound-turn"/);
  assert.match(t.log.find((l) => l.includes('"phase":"ran"')), /"outcome":"failed","aborted":true/);
  // the job survives the abort and runs again after the next idle wait
  assert.equal(t.api.deferredMemoryFlushJobs.size, 1);
  t.timers.at(-1).fn();
  assert.equal(t.flushCalls.length, 2);
  assert.equal(t.flushCalls[1].abortSignal.aborted, false);
  // a completed run ends the job
  t.flushCalls[1].__finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(t.api.deferredMemoryFlushJobs.size, 0);
  assert.match(t.log.at(-1), /"phase":"ran".*"outcome":"completed"/);
});

test('a turn arriving while the flush still waits for its reply does not disturb it', async () => {
  const t = loadRegion();
  await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState));
  assert.equal(t.api.yieldDeferredMemoryFlush(sessionKey, 'inbound-turn'), false);
  assert.equal(t.timers.length, 0);
  t.afterClear[0].cb();
  assert.equal(t.timers.length, 1);
});

test('the runtime imports the admission functions it calls under their real export letters', () => {
  const { exported } = loadAdmissionModule();
  const line = runtimeOut.split('\n').find((l) => l.endsWith('from "./gateway-work-admission-3tn4Qiws.js";'));
  for (const part of line.match(/^import \{ (.+) \} from /)[1].split(', ')) {
    const [letter, name] = part.split(' as ');
    assert.equal(exported[letter], name, part);
  }
});

test('a deferred flush armed inside a reply whose root admission is released still runs (stale-ALS repro)', async () => {
  const t = loadRegion();
  const { admission } = t;
  // the reply runs under its root-work admission; the deferral, the after-clear callback
  // and the idle timer are all created inside it
  const reply = admission.tryBeginGatewayRootWorkAdmission('chat.send');
  await reply.run(async () => {
    assert.equal(await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState)), true);
    t.afterClear[0].cb();
  });
  reply.release();
  assert.equal(t.timers.length, 1);
  // the cause: a chain carrying the released reply store reads subordinate admission as
  // closed although the Gateway accepts work
  assert.equal(admission.isGatewayWorkAdmissionClosed(), false);
  let staleClosed;
  const probe = admission.tryBeginGatewayRootWorkAdmission('probe');
  await probe.run(async () => {
    // reproduce the timer's view: a callback bound inside a released root
    const bound = AsyncLocalStorage.bind(() => admission.isGatewaySubordinateWorkAdmissionClosed());
    probe.release();
    staleClosed = bound();
  });
  assert.equal(staleClosed, true);
  // the idle timer fires in the released reply's context: the flush runs admitted
  t.timers[0].fn();
  assert.equal(t.flushCalls.length, 1);
  const call = t.flushCalls[0];
  assert.equal(call.__admissionClosed, undefined);
  assert.equal(call.memoryFlushDeferred, true);
  assert.deepEqual(call.__rootWork, ['memory-flush-deferred']);
  call.__finish();
  await new Promise((r) => setImmediate(r));
  assert.match(t.log.at(-1), /"phase":"ran".*"outcome":"completed"/);
  assert.deepEqual(admission.getActiveGatewayRootWorkHolders(), []);
  assert.equal(t.api.deferredMemoryFlushJobs.size, 0);
});

test('a deferred flush is skipped without a failure while Gateway admission is closed', async () => {
  for (const [label, close] of [
    ['restart-signal fence', (a) => { const fence = a.beginGatewayRestartSignalAdmission(); return () => fence.rollback(); }],
    ['host suspension', (a) => { const s = a.tryBeginGatewaySuspendAdmission(); return () => s.rollback(); }],
  ]) {
    const t = loadRegion();
    await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState));
    t.afterClear[0].cb();
    const reopen = close(t.admission);
    assert.equal(t.admission.isGatewayWorkAdmissionClosed(), true, label);
    t.timers[0].fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(t.flushCalls.length, 0, label);
    assert.deepEqual(JSON.parse(t.log.at(-1).replace('[memory-flush-deferred.1] ', '')), { phase: 'skipped', session: createHash('sha256').update(sessionKey).digest('hex').slice(0, 12), reason: 'admission-closed' }, label);
    assert(!t.log.some((l) => l.includes('"phase":"ran"')), label);
    // left for the next pre-reply check, which may defer it again once admission reopens
    assert.equal(t.api.deferredMemoryFlushJobs.size, 0, label);
    assert.deepEqual(t.admission.getActiveGatewayRootWorkHolders(), [], label);
    reopen();
    assert.equal(await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState)), true, label);
    t.afterClear[1].cb();
    t.timers[1].fn();
    assert.equal(t.flushCalls.length, 1, label);
  }
});

test('a restart drain during a deferred flush aborts it and the job ends', async () => {
  const t = loadRegion();
  await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState));
  t.afterClear[0].cb();
  t.timers[0].fn();
  assert.equal(t.flushCalls.length, 1);
  assert.deepEqual(t.admission.getActiveGatewayRootWorkHolders(), ['memory-flush-deferred']);
  t.admission.markGatewayRestartDraining();
  assert.equal(t.flushCalls[0].abortSignal.aborted, true);
  await new Promise((r) => setImmediate(r));
  assert.match(t.log.at(-1), /"phase":"ran".*"outcome":"failed","aborted":true/);
  assert.equal(t.api.deferredMemoryFlushJobs.size, 0);
  assert.deepEqual(t.admission.getActiveGatewayRootWorkHolders(), []);
});

test('memory module: a deferred flush never writes the failure budget; a pre-reply flush still does', async () => {
  const drainError = Object.assign(new Error('gateway is draining for restart'), { name: 'GatewayDrainingError' });
  for (const [label, extra, counted] of [
    ['deferred and aborted', { memoryFlushDeferred: true, abortSignal: AbortSignal.abort(drainError) }, false],
    // the error can precede the abort (or come from shutdown): still not written
    ['deferred, not aborted', { memoryFlushDeferred: true, abortSignal: new AbortController().signal }, false],
    ['pre-reply, aborted', { abortSignal: AbortSignal.abort(drainError) }, true],
    ['pre-reply', {}, true],
  ]) {
    const { fakes, calls } = memoryFakes({ fakes: { resolveMemoryFlushPlan: (p) => { if (p.nowMs) throw drainError; return { softThresholdTokens: 4000, forceFlushTranscriptBytes: 2097152, reserveTokensFloor: 20000 }; } } });
    const { runMemoryFlushIfNeeded } = loadMemoryModule({ ...fakes, isAbortError: (e) => e?.name === 'AbortError', truncateUtf16Safe: (v) => v, formatErrorMessage: (e) => String(e?.message ?? e) });
    const result = await runMemoryFlushIfNeeded(baseParams({ onVisibleErrorPayloads() {}, ...extra }));
    assert.equal(result.outcome, 'failed', label);
    assert.equal(calls.updateSessionEntry.length > 0, counted, label);
    assert.equal(result.failureName, extra.memoryFlushDeferred ? 'GatewayDrainingError' : undefined, label);
  }
});

// ---------------------------------------------------------------------------------------
// A message that arrives while the deferred flush runs (VLab candidate at 69bd4b9: the
// second message got state=final after 215 ms with no text). get-reply's
// resolveQueueBusyState reports isActive=true because the flush's embedded run is active
// for the session's sessionId; runReplyAgent must not steer into or queue behind it.

// npm 2026.9.1 current-turn-images-DlJeEkAZ.js resolveActiveRunQueueAction, verbatim.
function resolveActiveRunQueueAction(params) {
  if (!params.isActive && (!params.queueAdmissionState || params.queueAdmissionState === 'empty')) return 'run-now';
  if (params.isHeartbeat) return 'drop';
  if (params.resetTriggered) return 'run-now';
  if (params.queueAdmissionState && params.queueAdmissionState !== 'empty') return 'enqueue-followup';
  if (params.shouldFollowup) return 'enqueue-followup';
  return 'run-now';
}

function replyHarness() {
  const decisions = [];
  const replyFakes = {
    REPLY_ADMISSION_TICKET: Symbol('ticket'),
    resolveReplyOperationRunState: () => undefined,
    resolveFollowupRunToolAuthorityFingerprint: () => 'authority-a',
    createTypingSignaler: () => ({ shouldStartImmediately: false, signalToolStart: async () => {} }),
    readChannelSourceTurnId: () => undefined,
    loadSessionEntry: () => undefined,
    createShouldEmitToolResult: () => () => false,
    createShouldEmitToolOutput: () => () => false,
    createFollowupRunner: () => async () => {},
    bindQueueDispositionToRunState: () => {},
    runActiveReplySteer: async (p) => { decisions.push(['steer', p.providedReplyOperation]); },
    resolveActiveRunQueueAction,
    enqueueFollowupRun: () => { decisions.push(['followup']); return true; },
    scheduleFollowupDrainAfterReplyOperationClear: () => {},
    scheduleFollowupDrain: () => {},
    updateSessionEntry: async () => undefined,
  };
  return { decisions, replyFakes };
}

// What get-reply hands runReplyAgent for a steer-mode DM while the session looks busy.
const inboundTurn = (over = {}) => ({
  commandBody: '第二条消息', transcriptCommandBody: '第二条消息', followupRun: followupRun('第二条消息'), queueKey: sessionKey,
  resolvedQueue: { mode: 'steer' }, shouldSteer: true, shouldFollowup: true, queueAdmissionState: 'empty', isActive: true,
  isRunActive: () => true, opts: {}, typing: { cleanup() {} }, sessionEntry: entry(), sessionStore: {}, sessionKey,
  runtimePolicySessionKey: sessionKey, storePath: '/store', defaultModel: 'model-a', resolvedVerboseLevel: 'off',
  sessionCtx: { Provider: 'feishu' }, typingMode: 'instant', ...over,
});

async function startRunningFlush(t) {
  await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState));
  t.afterClear[0].cb();
  t.timers[0].fn();
  assert.equal(t.flushCalls.length, 1);
}

test('repro: a message during a running deferred flush runs its own turn instead of steering into the flush', async () => {
  for (const mode of ['steer', 'followup', 'collect']) {
    const { decisions, replyFakes } = replyHarness();
    const t = loadRegion({ replyFakes });
    await startRunningFlush(t);
    const out = await t.api.runReplyAgentHead(inboundTurn({ resolvedQueue: { mode }, shouldSteer: mode === 'steer' }));
    assert.equal(out, 'run-own-turn', mode);
    assert.deepEqual(decisions, [], mode);
    assert.equal(t.flushCalls[0].abortSignal.aborted, true, mode);
    assert(t.log.some((l) => l.includes('"phase":"turn-not-busy"')), mode);
  }
});

test('the unwinding window: the first message runs itself, the second steers into that real reply, not the dying flush', async () => {
  const activeOps = new Map();
  const { decisions, replyFakes } = replyHarness();
  const t = loadRegion({ activeOps, replyFakes, unwindOnAbort: false });
  await startRunningFlush(t);
  // first message: aborts the flush, which keeps unwinding
  assert.equal(await t.api.runReplyAgentHead(inboundTurn()), 'run-own-turn');
  assert.equal(t.flushCalls[0].abortSignal.aborted, true);
  assert.match(t.log.find((l) => l.includes('"phase":"turn-not-busy"')), /"flush":"in-flight"/);
  await new Promise((r) => setImmediate(r));
  assert(!t.log.some((l) => l.includes('"phase":"ran"')));
  // a second message before the first turn registered its reply operation also runs itself
  // (it waits on the session lane behind the first)
  assert.equal(await t.api.runReplyAgentHead(inboundTurn()), 'run-own-turn');
  assert.equal(t.log.filter((l) => l.includes('"phase":"turn-not-busy"')).length, 2);
  // once the first turn owns a reply operation, the next message steers into it
  const firstReply = { key: sessionKey, sessionId: 's1', toolAuthorityFingerprint: 'authority-a' };
  activeOps.set(sessionKey, firstReply);
  assert.equal(await t.api.runReplyAgentHead(inboundTurn()), undefined);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0][0], 'steer');
  // this turn's own provided (pre-dispatch) operation is not "another reply"
  const ownOp = { key: sessionKey, sessionId: 's1', toolAuthorityFingerprint: 'authority-a' };
  activeOps.set(sessionKey, ownOp);
  assert.equal(await t.api.runReplyAgentHead(inboundTurn({ replyOperation: ownOp })), 'run-own-turn');
  // the flush finishes unwinding: aborted, not failed, and the job waits for idle again
  t.flushCalls[0].__finish();
  await new Promise((r) => setImmediate(r));
  assert.match(t.log.find((l) => l.includes('"phase":"ran"')), /"outcome":"failed","aborted":true/);
  assert.equal(t.api.deferredMemoryFlushJobs.size, 1);
  // with no flush in flight, busy is get-reply's answer again
  activeOps.delete(sessionKey);
  assert.equal(await t.api.runReplyAgentHead(inboundTurn()), undefined);
  assert.equal(decisions.length, 2);
});

test('a re-armed flush does not start while the yielded run is still unwinding', async () => {
  const t = loadRegion({ unwindOnAbort: false });
  await startRunningFlush(t);
  assert.equal(t.api.yieldDeferredMemoryFlush(sessionKey, 'inbound-turn'), true);
  t.timers.at(-1).fn();
  assert.equal(t.flushCalls.length, 1);
  t.flushCalls[0].__finish();
  await new Promise((r) => setImmediate(r));
  // re-armed after the unwind, then runs once the idle wait ends
  t.timers.at(-1).fn();
  assert.equal(t.flushCalls.length, 2);
  assert.equal(t.flushCalls[1].abortSignal.aborted, false);
});

test('without a deferred flush in flight steering and queueing are unchanged', async () => {
  // a real active reply, no flush: steer into it
  const activeOps = new Map([[sessionKey, { key: sessionKey, sessionId: 's1', toolAuthorityFingerprint: 'authority-a' }]]);
  let h = replyHarness();
  let t = loadRegion({ activeOps, replyFakes: h.replyFakes });
  assert.equal(await t.api.runReplyAgentHead(inboundTurn()), undefined);
  assert.deepEqual(h.decisions.map((d) => d[0]), ['steer']);
  assert(!t.log.some((l) => l.includes('turn-not-busy')));
  // followup mode queues behind it
  h = replyHarness();
  t = loadRegion({ activeOps, replyFakes: h.replyFakes });
  assert.equal(await t.api.runReplyAgentHead(inboundTurn({ resolvedQueue: { mode: 'followup' }, shouldSteer: false })), undefined);
  assert.deepEqual(h.decisions.map((d) => d[0]), ['followup']);
  // a flush deferred but only waiting (idle wait, not running): get-reply's busy state stands
  h = replyHarness();
  t = loadRegion({ replyFakes: h.replyFakes });
  await t.api.deferPreReplyMemoryFlush(ctxFor(sizeState));
  t.afterClear[0].cb();
  assert.equal(await t.api.runReplyAgentHead(inboundTurn()), undefined);
  assert.deepEqual(h.decisions.map((d) => d[0]), ['steer']);
  // not busy stays not busy
  assert.equal(await t.api.runReplyAgentHead(inboundTurn({ isActive: false })), 'run-own-turn');
});

test('a heartbeat during a running deferred flush neither yields it nor runs', async () => {
  const { decisions, replyFakes } = replyHarness();
  const t = loadRegion({ replyFakes });
  await startRunningFlush(t);
  assert.equal(await t.api.runReplyAgentHead(inboundTurn({ opts: { isHeartbeat: true }, shouldSteer: false })), undefined);
  assert.deepEqual(decisions, []);
  assert.equal(t.flushCalls[0].abortSignal.aborted, false);
  assert(!t.log.some((l) => l.includes('turn-not-busy')));
});

// ---------------------------------------------------------------------------------------
// The patched agent-runner-memory and the runtime region together, against one session
// store (VLab candidate at 6f05930, interrupt arm: abort mid-flush, the next turn defers
// again, and the re-run after the idle wait ended "skipped" without writing memory).

function integratedSession({ stats, world, stockAttempts = false, extraFakes = {} } = {}) {
  const workspaceDir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'memflush-'));
  after(() => fs.rmSync(workspaceDir, { recursive: true, force: true }));
  const store = { [sessionKey]: entry() };
  const embedded = [];
  const attempts = [];
  const hooks = {};
  let completeGate;
  const plan = { softThresholdTokens: 4000, forceFlushTranscriptBytes: 2097152, reserveTokensFloor: 20000 };
  const { fakes } = memoryFakes({ fakes: {
    // as patchSqliteSessionEntrySnapshot: prepare the patch, then commit (assertCommitAllowed at
    // the commit edge); a null patch writes nothing and returns the current entry
    updateSessionEntry: async (scope, update, options = {}) => {
      if (!store[scope.sessionKey]) return null;
      const patch = await update({ ...store[scope.sessionKey] });
      await hooks.beforeCommit?.();
      options.assertCommitAllowed?.();
      if (!patch) return { ...store[scope.sessionKey] };
      store[scope.sessionKey] = { ...store[scope.sessionKey], ...patch };
      return store[scope.sessionKey];
    },
    // stockAttempts: the entry calls the module's real runCandidate, and the embedded attempt
    // (runEmbeddedAgent) behaves as builtin-openclaw's does: an aborted attempt returns
    // normally with meta.aborted instead of throwing
    ...stockAttempts ? {
      createLazyImportLoader: () => ({ load: async () => ({
        runEmbeddedAgent: async (p) => {
          const attempt = { params: p };
          attempts.push(attempt);
          return await new Promise((resolve) => {
            const abortedResult = () => resolve({ payloads: [], meta: { durationMs: 2410, aborted: true, stopReason: 'aborted' } });
            if (p.abortSignal.aborted) return abortedResult();
            p.abortSignal.addEventListener('abort', abortedResult, { once: true });
            attempt.finish = () => { p.abortSignal.removeEventListener('abort', abortedResult); resolve({ payloads: [], meta: { durationMs: 24_700 } }); };
            // the run aborts itself (its own run controller) while the flush's signal is not aborted
            attempt.abortInternally = () => { p.abortSignal.removeEventListener('abort', abortedResult); abortedResult(); };
            // a Codex flush thread compacts natively and the run reports it as a durable fact
            attempt.compact = (count = 1) => p.onCompactionAccounting({ kind: 'durable', count, target: { agentId: 'makaron', sessionId: 's1', sessionKey, storePath: '/store' } });
          });
        },
      }) }),
      resolveSessionRuntimeOverrideForProvider: () => undefined,
      resolveCandidateThinkingLevel: () => undefined,
      invalidateTurnCompactionContext: () => {},
      recordTurnCompaction: () => {},
      buildEmbeddedRunExecutionParams: async (p) => ({ embeddedContext: {}, senderContext: {}, runBaseParams: { runId: p.runId, sessionId: p.run.sessionId } }),
    } : {},
    readSessionTranscriptActiveStats: () => (stats ? stats() : { sizeBytes: 3_500_000, eventCount: 400 }),
    ...extraFakes,
    resolveMemoryFlushPlan: (p) => (p.nowMs ? { ...plan, relativePath: 'memory/2026-10-06.md', prompt: 'flush', systemPrompt: 'sys' } : plan),
    resolveModelFallbackOptions: (run) => ({ cfg: run.config, provider: run.provider, model: run.model }),
    prepareSystemAgentRunAdmission: () => ({ close() {} }),
    registerAgentRunContext: () => {},
    clearAgentRunContext: () => {},
    refreshQueuedFollowupSession: () => {},
    isAbortError: (e) => e?.name === 'AbortError',
    truncateUtf16Safe: (v) => v,
    formatErrorMessage: (e) => String(e?.message ?? e),
    isRenderablePayload: () => true,
    createDeferredEmbeddedRunLifecycleManager: (p) => {
      const controller = new AbortController();
      return {
        signal: p.abortSignal ? AbortSignal.any([p.abortSignal, controller.signal]) : controller.signal, adopt() {}, abort: () => controller.abort(),
        complete: async () => { await completeGate?.promise; },
      };
    },
    // the embedded flush run: holds until finished, rejects when aborted first. With a
    // `world`, the attempt registers builtin-openclaw's real run handle for its sessionId
    // (as setActiveEmbeddedRun does) and keeps it, aborted, until it has unwound.
    runEmbeddedAgentEntry: async (p) => {
      const call = { params: p };
      embedded.push(call);
      if (stockAttempts) {
        // the stock entry returns the candidate's result normally (agent-runner-compaction-accounting)
        call.result = await p.runCandidate(p.selection.provider, p.selection.model, { isFinalFallbackAttempt: true, onContextEngineTurnCandidate() {} });
        return { outcome: 'completed', result: call.result };
      }
      const sessionId = p.identity.sessionId;
      let runInput;
      if (world) {
        runInput = { state: { aborted: false }, runAbortController: new AbortController(), activeSession: { isStreaming: true, agent: {} } };
        runInput.getRunState = () => runInput.state;
        runInput.abortRun = () => { runInput.state.aborted = true; runInput.runAbortController.abort(); };
        // runMemoryFlushIfNeeded hands runEmbeddedAgent trigger "memory" and runId flushRunId
        call.handle = world.api.makeEmbeddedRunHandle({ runId: p.identity.runId, trigger: 'memory', sessionId, sessionKey }, runInput, { isCompacting: () => false });
        world.ACTIVE_EMBEDDED_RUNS.set(sessionId, call.handle);
      }
      const release = () => { if (world && world.ACTIVE_EMBEDDED_RUNS.get(sessionId) === call.handle) world.ACTIVE_EMBEDDED_RUNS.delete(sessionId); };
      await new Promise((resolve, reject) => {
        const onAbort = async () => {
          runInput?.abortRun();
          await world?.unwindGate?.promise;
          release();
          reject(p.abortSignal.reason);
        };
        if (p.abortSignal.aborted) return onAbort();
        p.abortSignal.addEventListener('abort', onAbort, { once: true });
        call.finish = () => { p.abortSignal.removeEventListener('abort', onAbort); release(); resolve(); };
        call.fail = (error) => { p.abortSignal.removeEventListener('abort', onAbort); release(); reject(error); };
      });
    },
  } });
  const memory = loadMemoryModule(fakes);
  const t = loadRegion({ replyFakes: {
    runMemoryFlushIfNeeded: memory.runMemoryFlushIfNeeded,
    runSessionCompactionIfNeeded: memory.runSessionCompactionIfNeeded,
    refreshSessionEntryFromStore: (p) => { const e = store[p.sessionKey]; if (e) p.activeSessionStore[p.sessionKey] = e; return e; },
  } });
  const run = () => ({ ...followupRun('用户消息'), run: { ...followupRun().run, workspaceDir, config: {} } });
  // what executePreparedReplyAgentRun does for a turn: the pre-reply check with the hook
  const preReplyCheck = async () => {
    const replyOp = { key: sessionKey, abortSignal: new AbortController().signal, setPhase() {}, updateSessionId() {} };
    const followup = run();
    const result = await memory.runMemoryFlushIfNeeded(baseParams({
      followupRun: followup, promptForEstimate: followup.prompt, sessionEntry: store[sessionKey], replyOperation: replyOp,
      deferPreReplyFlush: (flushState) => t.api.deferPreReplyMemoryFlush(ctxFor(flushState, { followupRun: followup, replyOperation: replyOp })),
    }));
    return result.outcome;
  };
  // let the real module's awaits (including the memory file's fs calls) run out
  const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 5)); };
  const gateCompletion = () => { let open; completeGate = { promise: new Promise((r) => { open = r; }) }; return () => { completeGate = undefined; open(); }; };
  return { t, store, embedded, attempts, hooks, memory, preReplyCheck, settle, gateCompletion, ranLines: () => t.log.filter((l) => l.includes('"phase":"ran"')).map((l) => JSON.parse(l.replace('[memory-flush-deferred.1] ', ''))) };
}

test('abort mid-flush, the next turn defers again, then after idle the flush really runs (not skipped)', async () => {
  const s = integratedSession();
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.embedded.length, 1);
  // a new turn: yield aborts the running flush
  assert.equal(s.t.api.yieldDeferredMemoryFlush(sessionKey, 'inbound-turn'), true);
  await s.settle();
  assert.deepEqual(s.ranLines().at(-1), { phase: 'ran', session: s.ranLines().at(-1).session, outcome: 'failed', aborted: true, error: 'AbortError', ms: s.ranLines().at(-1).ms });
  // nothing marks the cycle as flushed, and no failure is counted
  assert.equal(s.store[sessionKey].memoryFlush, undefined);
  // that turn's own pre-reply check defers again, the reply clears, the session idles
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.embedded.length, 2, 'the re-run reached the embedded flush run');
  s.embedded[1].finish();
  await s.settle();
  assert.equal(s.ranLines().at(-1).outcome, 'completed');
  assert.deepEqual(s.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 0 });
  assert.equal(s.t.api.deferredMemoryFlushJobs.size, 0);
  // and only now does the next turn find nothing to flush
  assert.equal(await s.preReplyCheck(), 'skipped');
});

test('an abort that lands after the flush finished is logged with its real outcome (completed), so a later skip is "already-flushed"', async () => {
  const s = integratedSession();
  const openCompletion = s.gateCompletion();
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  s.embedded[0].finish();
  await s.settle();
  // the model run is done and the cycle is marked; the run is still completing its lifecycle
  assert.deepEqual(s.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 0 });
  assert.equal(s.t.api.yieldDeferredMemoryFlush(sessionKey, 'inbound-turn'), true);
  openCompletion();
  await s.settle();
  const ran = s.ranLines().at(-1);
  assert.equal(ran.outcome, 'completed');
  assert.equal(ran.aborted, true);
  assert.equal(ran.marked, true);
  // the re-armed job finds the cycle flushed and says so
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.embedded.length, 1);
  assert.equal(s.ranLines().at(-1).outcome, 'skipped');
  assert.equal(s.ranLines().at(-1).reason, 'already-flushed');
});

test('a deferred run that cannot read the transcript stats keeps the flush due and looks again', async () => {
  let unreadable = 0;
  const s = integratedSession({ stats: () => { if (unreadable > 0) { unreadable -= 1; throw new Error('SessionTranscriptProjectionUnavailableError'); } return { sizeBytes: 3_500_000, eventCount: 400 }; } });
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  unreadable = 1;
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.embedded.length, 0);
  assert.deepEqual(['skipped', 'transcript-stats-unavailable', true], [s.ranLines().at(-1).outcome, s.ranLines().at(-1).reason, s.ranLines().at(-1).retry]);
  assert.equal(s.t.api.deferredMemoryFlushJobs.size, 1);
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.embedded.length, 1);
  s.embedded[0].finish();
  await s.settle();
  assert.equal(s.ranLines().at(-1).outcome, 'completed');
  // retries are bounded: after three unreadable looks the job ends and the flush waits for
  // the next pre-reply check (still not marked as flushed)
  let broken = false;
  const b = integratedSession({ stats: () => { if (broken) throw new Error('unavailable'); return { sizeBytes: 3_500_000, eventCount: 400 }; } });
  assert.equal(await b.preReplyCheck(), 'deferred');
  b.t.afterClear.at(-1).cb();
  broken = true;
  for (let i = 0; i < 4; i += 1) {
    b.t.timers.at(-1).fn();
    await b.settle();
  }
  assert.deepEqual(b.ranLines().map((l) => l.retry === true), [true, true, true, false]);
  assert.equal(b.t.api.deferredMemoryFlushJobs.size, 0);
  assert.equal(b.store[sessionKey].memoryFlush, undefined);
  assert.equal(b.embedded.length, 0);
});

test('real failure path: an error that reaches the deferred flush before the abort writes nothing; the same error before a reply writes kind=failed', async () => {
  // what the candidate saw: memoryFlush {kind:"failed"} after "ran outcome=failed aborted=true".
  // The guard on the aborted signal only held when the abort came first; an error raised
  // by the incoming turn (or by shutdown) before the yield was written by
  // recordMemoryFlushFailure as a counted failure.
  const interrupted = Object.assign(new Error('Session work admission interrupted'), { name: 'Error' });
  const s = integratedSession();
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  // the error lands and is recorded before any yield (the signal is not aborted yet)
  s.embedded[0].fail(interrupted);
  await s.settle();
  assert.equal(s.store[sessionKey].memoryFlush, undefined);
  const ran = s.ranLines().at(-1);
  assert.deepEqual([ran.outcome, ran.error], ['failed', 'Error']);
  // the next turn defers again, and the idle re-run flushes
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  s.embedded[1].finish();
  await s.settle();
  assert.equal(s.ranLines().at(-1).outcome, 'completed');
  assert.deepEqual(s.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 0 });

  // the stock pre-reply path through the same code: kind=failed, counted toward the budget
  const p = integratedSession();
  p.store[sessionKey] = entry({ compactionCount: 101 });
  const followup = { ...followupRun('用户消息'), run: { ...followupRun().run, workspaceDir: fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'memflush-')), config: {} } };
  after(() => fs.rmSync(followup.run.workspaceDir, { recursive: true, force: true }));
  const pending = p.memory.runMemoryFlushIfNeeded(baseParams({ followupRun: followup, promptForEstimate: '', sessionEntry: p.store[sessionKey], onVisibleErrorPayloads() {} }));
  await p.settle();
  p.embedded[0].fail(interrupted);
  assert.equal((await pending).outcome, 'failed');
  assert.deepEqual(p.store[sessionKey].memoryFlush, { kind: 'failed', failureCount: 1 });
});

test('a steered message waits for the real reply queued behind the unwinding flush, then steers into it (stock: B merges into A)', async () => {
  const activeOps = new Map();
  const { decisions, replyFakes } = replyHarness();
  const t = loadRegion({ activeOps, replyFakes, unwindOnAbort: false });
  await startRunningFlush(t);
  // A: aborts the flush and runs itself; its reply operation registers, but its embedded
  // run waits on the session lane behind the unwinding flush (no backend yet)
  assert.equal(await t.api.runReplyAgentHead(inboundTurn()), 'run-own-turn');
  const replyA = { key: sessionKey, sessionId: 's1', toolAuthorityFingerprint: 'authority-a', injectable: false };
  activeOps.set(sessionKey, replyA);
  // B, 100 ms later: busy, steer mode; it waits instead of falling back to a queued followup
  let settled = false;
  const b = t.api.runReplyAgentHead(inboundTurn()).then((v) => { settled = true; return v; });
  await new Promise((r) => globalThis.setTimeout(r, 20));
  assert.equal(settled, false);
  assert.deepEqual(decisions, []);
  // the flush lets go of the lane, A's run starts and attaches its backend
  t.flushCalls[0].__finish();
  await new Promise((r) => globalThis.setTimeout(r, 5));
  replyA.injectable = true;
  assert.equal(await b, undefined);
  assert.deepEqual(decisions.map((d) => d[0]), ['steer']);
  assert.match(t.log.find((l) => l.includes('"phase":"steer-wait"')), /"result":"injectable"/);
});

test('the steer wait ends when the real reply ends, and never applies without an in-flight flush, for followup mode or for the turn\'s own operation', async () => {
  const activeOps = new Map();
  let h = replyHarness();
  let t = loadRegion({ activeOps, replyFakes: h.replyFakes, unwindOnAbort: false });
  await startRunningFlush(t);
  assert.equal(await t.api.runReplyAgentHead(inboundTurn()), 'run-own-turn');
  activeOps.set(sessionKey, { key: sessionKey, sessionId: 's1', toolAuthorityFingerprint: 'authority-a', injectable: false });
  const b = t.api.runReplyAgentHead(inboundTurn());
  await new Promise((r) => globalThis.setTimeout(r, 20));
  activeOps.delete(sessionKey);
  await b;
  assert.match(t.log.find((l) => l.includes('"phase":"steer-wait"')), /"result":"reply-ended"/);
  // followup mode queues as stock does, without waiting
  activeOps.set(sessionKey, { key: sessionKey, sessionId: 's1', toolAuthorityFingerprint: 'authority-a', injectable: false });
  await t.api.runReplyAgentHead(inboundTurn({ resolvedQueue: { mode: 'followup' }, shouldSteer: false }));
  assert.deepEqual(h.decisions.map((d) => d[0]), ['steer', 'followup']);
  assert.equal(t.log.filter((l) => l.includes('"phase":"steer-wait"')).length, 1);
  // no flush in flight: a not-yet-injectable reply is stock behavior, no wait
  h = replyHarness();
  t = loadRegion({ activeOps, replyFakes: h.replyFakes });
  await t.api.runReplyAgentHead(inboundTurn());
  assert.deepEqual(h.decisions.map((d) => d[0]), ['steer']);
  assert(!t.log.some((l) => l.includes('steer-wait')));
  assert(STEER_WAIT_MS >= 1000 && STEER_WAIT_MS <= 10000);
});

// Success marker (VLab candidate at 38bdb0a, interrupt arm: "ran outcome=failed aborted=true
// error=AbortError ms=2410", then "ran skipped already-flushed", entry.memoryFlush succeeded).
// The embedded attempt of the real path returns normally when aborted (meta.aborted), and the
// entry returns that result; runMemoryFlushIfNeeded ignores it and relies on its lifecycle
// signal. These run the module's real runCandidate against that stock attempt shape.

test('stock aborted-run shape: a deferred flush aborted mid-run returns normally, marks nothing, and the idle re-run flushes', async () => {
  const s = integratedSession({ stockAttempts: true });
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.attempts.length, 1);
  assert.equal(s.attempts[0].params.trigger, 'memory');
  assert.equal(s.t.api.yieldDeferredMemoryFlush(sessionKey, 'inbound-turn'), true);
  await s.settle();
  // the attempt and the entry returned normally, with the aborted flag
  assert.equal(s.embedded[0].result.meta.aborted, true);
  const ran = s.ranLines().at(-1);
  assert.deepEqual([ran.outcome, ran.aborted, ran.error, ran.marked], ['failed', true, 'AbortError', undefined]);
  assert.equal(s.store[sessionKey].memoryFlush, undefined);
  // the cycle stays due: the next turn defers again and the idle re-run really flushes
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.attempts.length, 2);
  s.attempts[1].finish();
  await s.settle();
  assert.deepEqual([s.ranLines().at(-1).outcome, s.ranLines().at(-1).marked], ['completed', true]);
  assert.deepEqual(s.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 0 });
  assert.equal(await s.preReplyCheck(), 'skipped');
});

test('a deferred run that reports aborted marks nothing even when the flush signal was not aborted; the stock pre-reply path still marks it', async () => {
  const s = integratedSession({ stockAttempts: true });
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  s.attempts[0].abortInternally();
  await s.settle();
  const ran = s.ranLines().at(-1);
  assert.deepEqual([ran.outcome, ran.aborted, ran.error], ['failed', undefined, 'AbortError']);
  assert.equal(s.store[sessionKey].memoryFlush, undefined);
  // still due for the next pre-reply check
  assert.equal(await s.preReplyCheck(), 'deferred');

  // stock pre-reply flush, same attempt shape: unchanged (it marks the cycle)
  const p = integratedSession({ stockAttempts: true });
  const followup = { ...followupRun('用户消息'), run: { ...followupRun().run, workspaceDir: fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'memflush-')), config: {} } };
  after(() => fs.rmSync(followup.run.workspaceDir, { recursive: true, force: true }));
  const pending = p.memory.runMemoryFlushIfNeeded(baseParams({ followupRun: followup, promptForEstimate: '', sessionEntry: p.store[sessionKey], onVisibleErrorPayloads() {} }));
  await p.settle();
  p.attempts[0].abortInternally();
  const result = await pending;
  assert.equal(result.outcome, 'completed');
  assert.equal(result.markedFlushed, undefined);
  assert.deepEqual(p.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 0 });
});

test('an abort that lands while the success marker is being written does not mark the cycle', async () => {
  const s = integratedSession({ stockAttempts: true });
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  // the run finished; the new turn arrives between preparing the marker and its commit
  s.hooks.beforeCommit = () => { s.t.api.yieldDeferredMemoryFlush(sessionKey, 'inbound-turn'); };
  s.attempts[0].finish();
  await s.settle();
  const ran = s.ranLines().at(-1);
  assert.deepEqual([ran.outcome, ran.aborted, ran.error], ['failed', true, 'AbortError']);
  assert.equal(s.store[sessionKey].memoryFlush, undefined);
  s.hooks.beforeCommit = undefined;
  s.t.timers.at(-1).fn();
  await s.settle();
  s.attempts[1].finish();
  await s.settle();
  assert.deepEqual(s.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 0 });
});

// ---------------------------------------------------------------------------------------
// Injection by sessionId (builtin-openclaw): the real queue path of the embedded run
// registry (npm runs-5WnDPZ0V.js), V's subagent announce delivery and the embedded run
// handle of builtin-openclaw (patched, or V's bytes for the contrast), in one scope.

function extractFunctions(source, names, label) {
  return names.map((name) => {
    const re = new RegExp(`^(?:async )?function ${name}\\(`, 'gm');
    const found = [...source.matchAll(re)];
    assert.equal(found.length, 1, `${label}: exactly one ${name}`);
    const end = source.indexOf('\n}\n', found[0].index);
    return source.slice(found[0].index, end + 2);
  }).join('\n');
}

function injectionWorld({ builtin = builtinOut } = {}) {
  const ACTIVE_EMBEDDED_RUNS = new Map();
  const steered = [];
  const outcomes = [];
  let api;
  const world = { ACTIVE_EMBEDDED_RUNS, steered, outcomes, unwindGate: undefined };
  const fakes = {
    ACTIVE_EMBEDDED_RUNS,
    ACTIVE_EMBEDDED_RUNS_BY_RUN_ID: new Map(),
    isReplyRunEvidenceStaleBySessionId: () => false,
    isReplyRunActiveForSessionId: () => false,
    diagnosticLogger: { debug() {}, warn() {} },
    resolveActiveEmbeddedRunRecoveryBlocker: () => undefined,
    getDiagnosticSessionActivitySnapshot: () => ({}),
    resolveRunStaleThresholdMs: () => 600_000,
    resolveReplyBackendQueueMessageMismatch: () => undefined,
    resolveActiveReplyOperationForSessionId: () => undefined,
    normalizeOptionalString: (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
    hasPromptImageInput: () => false,
    formatErrorMessage: (e) => String(e?.message ?? e),
    logMessageQueuedWithBacklogPolicy: () => {},
    isFastTestRuntimeEnv: () => true,
    tryResolveSubagentRequesterAgentId: () => 'makaron',
    resolveRequesterStoreKey: (_cfg, key) => key,
    resolveQueueSettings: () => ({}),
    sessionDeliveryChannel: () => undefined,
    subagentAnnounceDeliveryDeps: {
      getRuntimeConfig: () => ({}),
      // the default dependency: the requester's session id, active while any run holds it
      getRequesterSessionActivity: () => ({ sessionId: 's1', isActive: api.isEmbeddedAgentRunActive('s1') }),
      isRequesterSessionAbandoned: () => false,
      loadRequesterSessionEntry: () => ({ entry: { sessionId: 's1' } }),
      queueEmbeddedAgentMessageWithOutcome: async (...args) => {
        const outcome = await api.queueEmbeddedAgentMessageWithOutcomeAsync(...args);
        outcomes.push(outcome.queued ? 'queued' : outcome.reason);
        return outcome;
      },
    },
    // the attempt's steering into its live agent session: the message is absorbed by that run
    steerActiveSessionWithOptionalDeliveryWait: async (_session, text) => { steered.push(text); return {}; },
    closeDiagnosticEmbeddedRunOwner: () => {},
    claimEmbeddedPendingUserInputAnswer: async () => false,
    cancelPendingAgentQuestionForSession: () => {},
  };
  const scope = new Proxy({}, {
    has: (_t, k) => typeof k === 'string',
    get: (_t, k) => {
      if (k === Symbol.unscopables) return undefined;
      if (Object.hasOwn(fakes, k)) return fakes[k];
      if (k in globalThis) return globalThis[k];
      return (...args) => { throw new Error(`unexpected call to ${String(k)}(${JSON.stringify(args).slice(0, 80)})`); };
    },
  });
  const runs = extractFunctions(runsSource, ['createQueueFailureOutcome', 'formatEmbeddedAgentQueueFailureSummary', 'logActiveRunMessageAccepted', 'resolveEmbeddedQueueMessage', 'prepareEmbeddedAgentQueueMessage', 'queueEmbeddedAgentMessageWithOutcomeAsync', 'isEmbeddedAgentRunActive'], 'runs');
  const ownerChanged = 'const SOURCE_OWNER_CHANGED = Symbol("source_owner_changed");';
  assert(announceSource.includes(`\n${ownerChanged}\n`));
  const announce = `${ownerChanged}\n${extractFunctions(announceSource, ['getSubagentAnnounceRuntimeConfig', 'getSubagentRequesterSessionActivity', 'isSubagentRequesterSessionAbandoned', 'loadRequesterSessionEntry', 'queueSubagentAnnounceMessage', 'waitForAnnounceRetryDelay', 'resolveRequesterSessionActivity', 'resolveCompactionSteerRetryDelaysMs', 'resolveActiveWakeWithRetries', 'maybeSteerSubagentAnnounce', 'mapSteerOutcomeToDeliveryResult', 'runSubagentAnnounceDispatch'], 'announce')}`;
  const { region, handle } = extractBuiltinQueueHandle(builtin);
  api = new Function('scope', `with (scope) {
${runs}
${announce}
${region}
function makeEmbeddedRunHandle(attempt, input, subscription) {
	let acceptingSteerMessages = true;
	let activeQueueAdmissions = 0;
	const abortActiveRunExternally = (reason) => input.abortRun(false);
${handle}	return queueHandle;
}
return { queueEmbeddedAgentMessageWithOutcomeAsync, isEmbeddedAgentRunActive, maybeSteerSubagentAnnounce, runSubagentAnnounceDispatch, makeEmbeddedRunHandle };
}`)(scope);
  world.api = api;
  // a subagent completion announce to the requester session (no completion message
  // expected: steer first, direct delivery only when steering reports nothing active)
  world.announce = async (text = 'subagent finished: report ready') => {
    const direct = [];
    const result = await api.runSubagentAnnounceDispatch({
      expectsCompletionMessage: false,
      steer: () => api.maybeSteerSubagentAnnounce({ requesterSessionKey: sessionKey, steerMessage: text }),
      direct: async () => { direct.push(text); return { delivered: true, path: 'direct' }; },
    });
    return { result, direct };
  };
  world.holdUnwind = () => { let open; world.unwindGate = { promise: new Promise((r) => { open = r; }) }; return () => { world.unwindGate = undefined; open(); }; };
  return world;
}

async function runningDeferredFlush(world) {
  const s = integratedSession({ world });
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.embedded.length, 1);
  assert.equal(world.ACTIVE_EMBEDDED_RUNS.get('s1'), s.embedded[0].handle);
  return s;
}

test('the deferred flush registers its embedded run for the run\'s lifetime; the handle patch keys on that run', () => {
  const run = memoryOut.slice(memoryOut.indexOf('async function runMemoryFlushIfNeeded(params) {'), memoryOut.indexOf('async function recordMemoryFlushFailure('));
  // registered only for a deferred flush, before the embedded run starts, released after its lifecycle completes
  assert.match(run, /const deferredMemoryFlushRuns = params\.memoryFlushDeferred === true \? globalThis\[Symbol\.for\("openclaw\.memoryFlushDefer\.deferredRuns\.v1"\)\] \?\?= /);
  const registeredAt = run.indexOf('deferredMemoryFlushRuns?.set(flushRunId, {');
  assert(registeredAt > 0 && registeredAt < run.indexOf('await runEmbeddedAgentEntry({'));
  assert.match(run, /try \{\n\t\t\tawait deferredLifecycle\.complete\(\);\n\t\t\} finally \{\n[^\n]*\n\t\t\tdeferredMemoryFlushRuns\?\.delete\(flushRunId\);/);
  // the embedded attempt sees that run id and trigger "memory"
  assert.match(run, /identity: \{\n\t\t\t\t\trunId: flushRunId,/);
  assert.match(run, /runId: flushRunId,\n\t\t\t\t\t\tallowTransientCooldownProbe/);
  assert.match(run, /trigger: "memory",\n/);
  assert.match(runtimeOut, /onDeferredFlushInjection: \(\) => \{\n\t\t\t\tif \(!isGatewayWorkAdmissionClosed\(\)\) yieldDeferredMemoryFlush\(ctx\.sessionKey, "session-injection"\);/);
  // the builtin handle: only isAvailable, isCompacting and queueMessage change
  const { region, handle } = extractBuiltinQueueHandle(builtinOut);
  assert.match(region, /attempt\.trigger !== "memory" \|\| !attempt\.runId/);
  assert(builtinOut.indexOf(region) < builtinOut.indexOf('function prepareEmbeddedAttemptStream(input) {'));
  assert.equal(handle.replace(/resolveDeferredMemoryFlushRun\(attempt\) !== void 0 \|\| |refuseDeferredMemoryFlushInjection\(attempt\) \|\| |\t\tif \(resolveDeferredMemoryFlushRun\(attempt\)\) throw new Error\("active run is a deferred memory flush"\);\n/g, ''), extractBuiltinQueueHandle(builtinInput).handle);
  assert.equal(builtinOut.split(MEMORY_FLUSH_DEFER_MARKER).length - 1, 2);
});

test('repro (V bytes): an announce during a running deferred flush is absorbed by the flush and never reaches the parent', async () => {
  const world = injectionWorld({ builtin: builtinInput });
  const s = await runningDeferredFlush(world);
  const { result, direct } = await world.announce();
  assert.equal(result.path, 'steered');
  assert.deepEqual(world.steered, ['subagent finished: report ready']);
  assert.deepEqual(direct, []);
  // the flush did not yield: the message is now part of its NO_REPLY housekeeping turn
  assert.equal(s.embedded[0].params.abortSignal.aborted, false);
  assert(!s.t.log.some((l) => l.includes('"phase":"yielded"')));
  s.embedded[0].finish();
  await s.settle();
});

test('an announce during a running deferred flush is not absorbed: the flush yields and the announce reaches the parent', async () => {
  const world = injectionWorld();
  const s = await runningDeferredFlush(world);
  // the aborted flush keeps its handle registered while it unwinds
  const openUnwind = world.holdUnwind();
  const pending = world.announce();
  while (world.outcomes.length < 2) await new Promise((r) => globalThis.setTimeout(r, 1));
  // refused as compacting while running and while unwinding (stock would say not_streaming
  // for the aborted run, and the announce would be dropped: next test)
  assert.deepEqual(world.outcomes, ['compacting', 'compacting']);
  assert.equal(s.embedded[0].handle.isStopped(), true);
  assert.equal(s.embedded[0].params.abortSignal.aborted, true);
  openUnwind();
  const { result, direct } = await pending;
  assert.equal(result.delivered, true);
  assert.equal(result.path, 'direct');
  assert.deepEqual(result.phases.map((p) => [p.phase, p.path, p.reason]), [['steer-primary', 'none', undefined], ['direct-primary', 'direct', undefined]]);
  assert.deepEqual(direct, ['subagent finished: report ready']);
  assert.deepEqual(world.steered, []);
  assert.deepEqual(world.outcomes.slice(-2), ['transcript_commit_wait_unsupported', 'no_active_run']);
  assert(world.outcomes.slice(0, -2).every((o) => o === 'compacting'));
  // the flush yielded once, counted nothing, and waits for idle again
  await s.settle();
  assert.equal(s.t.log.filter((l) => l.includes('"phase":"yielded"')).length, 1);
  assert.match(s.t.log.find((l) => l.includes('"phase":"yielded"')), /"reason":"session-injection"/);
  assert.deepEqual([s.ranLines().at(-1).outcome, s.ranLines().at(-1).aborted], ['failed', true]);
  assert.equal(s.store[sessionKey].memoryFlush, undefined);
  assert.equal(globalThis[Symbol.for('openclaw.memoryFlushDefer.deferredRuns.v1')].size, 0);
  assert.equal(s.t.api.deferredMemoryFlushJobs.size, 1);
  // after the idle wait the flush runs again, undisturbed, and completes
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.embedded.length, 2);
  s.embedded[1].finish();
  await s.settle();
  assert.equal(s.ranLines().at(-1).outcome, 'completed');
  assert.deepEqual(s.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 0 });
});

test('why compacting and not not_streaming: an announce refused as not_streaming by a still-active run is dropped', async () => {
  const world = injectionWorld();
  world.ACTIVE_EMBEDDED_RUNS.set('s1', { runId: 'r1', messageInjection: { isAvailable: () => false, queueMessage: async () => {} }, isCompacting: () => false });
  const { result, direct } = await world.announce();
  assert.deepEqual([result.delivered, result.reason], [false, 'steer_dropped']);
  assert.deepEqual(direct, []);
  assert.deepEqual(world.outcomes, ['not_streaming']);
});

test('a stock pre-reply flush is not registered and still accepts injection; a restart drain does not count as an injection', async () => {
  const world = injectionWorld();
  const p = integratedSession({ world });
  const followup = { ...followupRun('用户消息'), run: { ...followupRun().run, workspaceDir: fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'memflush-')), config: {} } };
  after(() => fs.rmSync(followup.run.workspaceDir, { recursive: true, force: true }));
  const pending = p.memory.runMemoryFlushIfNeeded(baseParams({ followupRun: followup, promptForEstimate: '', sessionEntry: p.store[sessionKey], onVisibleErrorPayloads() {} }));
  await p.settle();
  assert.equal(world.ACTIVE_EMBEDDED_RUNS.get('s1'), p.embedded[0].handle);
  const outcome = await world.api.queueEmbeddedAgentMessageWithOutcomeAsync('s1', 'steer me', { steeringMode: 'all' });
  assert.equal(outcome.queued, true);
  assert.deepEqual(world.steered, ['steer me']);
  p.embedded[0].finish();
  assert.equal((await pending).outcome, 'completed');

  // restart drain asks every run isCompacting() (abortEmbeddedAgentRun mode "compacting");
  // with admission closed the deferred flush is not yielded through this path (the drain
  // signal aborts it)
  const s = await runningDeferredFlush(injectionWorld());
  const fence = s.t.admission.beginGatewayRestartSignalAdmission();
  assert.equal(s.embedded[0].handle.isCompacting(), true);
  assert(!s.t.log.some((l) => l.includes('"phase":"yielded"')));
  assert.equal(s.embedded[0].params.abortSignal.aborted, false);
  fence.rollback();
  // once admission is open, the same question is an injection and yields
  assert.equal(s.embedded[0].handle.isCompacting(), true);
  assert.equal(s.embedded[0].params.abortSignal.aborted, true);
  await s.settle();
});

test('candidate probe: off without its env; with it, wakes the deferred flush\'s session like an announce and reports the outcome', async () => {
  const { spawnSync } = await import('node:child_process');
  const probe = new URL('./memory-flush-defer-inject-probe.mjs', import.meta.url).href;
  const dist = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'memflush-probe-'));
  after(() => fs.rmSync(dist, { recursive: true, force: true }));
  // a stand-in for the runs chunk: refuses as the patched handle does, then the flush is gone
  fs.writeFileSync(path.join(dist, 'runs-5WnDPZ0V.js'), `
const state = () => globalThis[Symbol.for('openclaw.embeddedRunState')];
let calls = 0;
export const v = async (sessionId, _text, options) => {
  calls += 1;
  globalThis.__probeCalls = [...(globalThis.__probeCalls ?? []), { sessionId, options }];
  if (calls <= 2) return { queued: false, sessionId, reason: 'compacting' };
  state().activeRuns.delete(sessionId);
  return { queued: false, sessionId, reason: options.waitForTranscriptCommit ? 'transcript_commit_wait_unsupported' : 'no_active_run' };
};
export const u = (sessionId) => state().activeRuns.has(sessionId);
`);
  const child = `
globalThis[Symbol.for('openclaw.embeddedRunState')] = { activeRuns: new Map([['s1', { runId: 'run-1' }]]) };
globalThis[Symbol.for('openclaw.memoryFlushDefer.deferredRuns.v1')] = new Map([['run-1', { sessionKey: 'k' }]]);
setTimeout(() => {}, 400);
`;
  const run = (env) => spawnSync(process.execPath, ['--import', probe, '-e', child], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  const quiet = run({});
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stderr, '');
  const on = run({ MEMORY_FLUSH_DEFER_PROBE_DIST: dist, MEMORY_FLUSH_DEFER_PROBE_DELAY_MS: '10', MEMORY_FLUSH_DEFER_PROBE_RETRY_MS: '5,5,5,5' });
  assert.equal(on.status, 0, on.stderr);
  const events = on.stderr.trim().split('\n').map((l) => JSON.parse(l.replace('[memory-flush-defer-probe] ', '')));
  assert.deepEqual(events.map((e) => e.phase), ['loaded', 'armed', 'attempt', 'attempt', 'attempt', 'attempt', 'result']);
  const result = events.at(-1);
  assert.deepEqual([result.sessionId, result.outcomes, result.requesterActive, result.verdict], ['s1', ['compacting', 'compacting', 'transcript_commit_wait_unsupported', 'no_active_run'], false, 'direct-delivery']);
  assert(!on.stderr.includes('probe received'), 'message text is not logged');
});

// V 2026-10-08/09: a /vds session's deferred flush replays the transcript into a transient Codex
// thread, which compacts at once; the run reports that compaction as a durable fact and
// runMemoryFlushIfNeeded raises the session's compactionCount by it. The marker used the count
// taken before the run, so the next reply found the cycle unflushed and deferred another flush:
// 60 of 60 re-triggers in two days, none after a compaction of the session's own thread.
test('a deferred flush whose own run compacts marks the cycle it produced; the next flush waits for a real compaction', async () => {
  const durableCompactions = (store) => ({
    recordTurnCompaction: (compaction, fact) => { if (fact?.kind === 'durable') compaction.durable.push(fact); },
    incrementCompactionCount: async (p) => {
      store()[p.sessionKey] = { ...store()[p.sessionKey], compactionCount: (store()[p.sessionKey].compactionCount ?? 0) + p.amount };
      if (p.sessionStore) p.sessionStore[p.sessionKey] = store()[p.sessionKey];
      return store()[p.sessionKey].compactionCount;
    },
  });
  let s;
  s = integratedSession({ stockAttempts: true, extraFakes: durableCompactions(() => s.store) });
  s.store[sessionKey] = entry({ compactionCount: 66, memoryFlush: { kind: 'succeeded', compactionCount: 65 } });
  assert.equal(await s.preReplyCheck(), 'deferred');
  s.t.afterClear.at(-1).cb();
  s.t.timers.at(-1).fn();
  await s.settle();
  assert.equal(s.attempts.length, 1);
  s.attempts[0].compact();
  s.attempts[0].finish();
  await s.settle();
  const ran = s.ranLines().at(-1);
  assert.deepEqual([ran.outcome, ran.marked, ran.ownCompactions], ['completed', true, 1]);
  // the flush's own compaction raised the count, and the marker covers it (V's bytes wrote 66)
  assert.equal(s.store[sessionKey].compactionCount, 67);
  assert.deepEqual(s.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 67 });
  // the next replies find nothing to flush
  assert.equal(await s.preReplyCheck(), 'skipped');
  assert.equal(await s.preReplyCheck(), 'skipped');
  // until the session's own thread compacts in a reply: then one flush is due again
  s.store[sessionKey] = { ...s.store[sessionKey], compactionCount: 68 };
  assert.equal(await s.preReplyCheck(), 'deferred');

  // a deferred flush without its own compaction marks the count it read, as before
  let q;
  q = integratedSession({ stockAttempts: true, extraFakes: durableCompactions(() => q.store) });
  q.store[sessionKey] = entry({ compactionCount: 5 });
  assert.equal(await q.preReplyCheck(), 'deferred');
  q.t.afterClear.at(-1).cb();
  q.t.timers.at(-1).fn();
  await q.settle();
  q.attempts[0].finish();
  await q.settle();
  assert.deepEqual([q.ranLines().at(-1).marked, q.ranLines().at(-1).ownCompactions], [true, undefined]);
  assert.deepEqual(q.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 5 });

  // the stock pre-reply flush is unchanged: it marks the count it read before its run
  let p;
  p = integratedSession({ stockAttempts: true, extraFakes: durableCompactions(() => p.store) });
  p.store[sessionKey] = entry({ compactionCount: 10 });
  const followup = { ...followupRun('用户消息'), run: { ...followupRun().run, workspaceDir: fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'memflush-')), config: {} } };
  after(() => fs.rmSync(followup.run.workspaceDir, { recursive: true, force: true }));
  const pending = p.memory.runMemoryFlushIfNeeded(baseParams({ followupRun: followup, promptForEstimate: '', sessionEntry: p.store[sessionKey], sessionStore: p.store, onVisibleErrorPayloads() {} }));
  await p.settle();
  p.attempts[0].compact();
  p.attempts[0].finish();
  const result = await pending;
  assert.equal(result.outcome, 'completed');
  assert.equal(result.ownCompactions, undefined);
  assert.equal(p.store[sessionKey].compactionCount, 11);
  assert.deepEqual(p.store[sessionKey].memoryFlush, { kind: 'succeeded', compactionCount: 10 });
});
