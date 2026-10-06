import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto, { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  DEFAULT_IDLE_MS,
  MEMORY_FLUSH_DEFER_MARKER,
  MIN_HEADROOM_TOKENS,
  extractDeferRegion,
  patchAgentRunnerMemory,
  patchAgentRunnerRuntime,
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
});

test('each anchor is replaced exactly once and a patched file is refused', () => {
  assert.throws(() => patchAgentRunnerRuntime(runtimeOut), /already patched/);
  assert.throws(() => patchAgentRunnerMemory(memoryOut), /already patched/);
  // anchors are unique in the inputs; a duplicated anchor is refused instead of patched twice
  const doubled = memoryInput.replace('\tconst latch = entry.transcriptByteCompactionLatch;\n', '\tconst latch = entry.transcriptByteCompactionLatch;\n\tif (latch !== void 0 && (typeof maxActiveTranscriptBytes !== "number" || false)) {}\n');
  assert.throws(() => patchAgentRunnerMemory(doubled), /Expected exactly one byte-compaction latch clear/);
  assert.throws(() => patchAgentRunnerRuntime(runtimeInput.replace('async function executePreparedReplyAgentRun(context) {\n', '')), /Expected exactly one reply agent run executor/);
  assert.equal(memoryOut.split(MEMORY_FLUSH_DEFER_MARKER).length - 1, 3);
  assert.equal(memoryOut.split('run.memoryFlushDeferred === true && run.abortSignal?.aborted === true').length - 1, 1);
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

test('memory module: heartbeat or runtime-owned compaction leaves the probe empty (unknown)', async () => {
  const { fakes } = memoryFakes();
  const { runSessionCompactionIfNeeded } = loadMemoryModule(fakes);
  const probe = {};
  await runSessionCompactionIfNeeded({ ...baseParams({ isHeartbeat: true }), probe });
  assert.deepEqual(probe, {});
  const codex = memoryFakes({ fakes: { resolveEffectiveAgentRuntime: () => 'codex' } });
  const probe2 = {};
  await loadMemoryModule(codex.fakes).runSessionCompactionIfNeeded({ ...baseParams(), probe: probe2 });
  assert.deepEqual(probe2, {});
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
    replyRunRegistry: { get: (key) => activeOps.get(key) },
    refreshSessionEntryFromStore: () => freshEntry,
    // a real timer callback runs in the async context that armed it
    setTimeout: (fn, ms) => { const t = { fn: AsyncLocalStorage.bind(fn), ms, cleared: false, unref() { this.unrefd = true; } }; timers.push(t); return t; },
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
  assert.match(t.log.find((l) => l.includes('"phase":"ran"')), /"outcome":"aborted"/);
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
  assert.match(t.log.at(-1), /"phase":"ran".*"outcome":"aborted"/);
  assert.equal(t.api.deferredMemoryFlushJobs.size, 0);
  assert.deepEqual(t.admission.getActiveGatewayRootWorkHolders(), []);
});

test('memory module: an aborted deferred flush is not counted as a failure; other failures still are', async () => {
  const drainError = Object.assign(new Error('gateway is draining for restart'), { name: 'GatewayDrainingError' });
  for (const [label, extra, counted] of [
    ['deferred and aborted', { memoryFlushDeferred: true, abortSignal: AbortSignal.abort(drainError) }, false],
    ['deferred, not aborted', { memoryFlushDeferred: true, abortSignal: new AbortController().signal }, true],
    ['pre-reply, aborted', { abortSignal: AbortSignal.abort(drainError) }, true],
  ]) {
    const { fakes, calls } = memoryFakes({ fakes: { resolveMemoryFlushPlan: (p) => { if (p.nowMs) throw drainError; return { softThresholdTokens: 4000, forceFlushTranscriptBytes: 2097152, reserveTokensFloor: 20000 }; } } });
    const { runMemoryFlushIfNeeded } = loadMemoryModule({ ...fakes, isAbortError: (e) => e?.name === 'AbortError', truncateUtf16Safe: (v) => v, formatErrorMessage: (e) => String(e?.message ?? e) });
    const result = await runMemoryFlushIfNeeded(baseParams({ onVisibleErrorPayloads() {}, ...extra }));
    assert.equal(result.outcome, 'failed', label);
    assert.equal(calls.updateSessionEntry.length > 0, counted, label);
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
  assert.match(t.log.find((l) => l.includes('"phase":"ran"')), /"outcome":"aborted"/);
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
