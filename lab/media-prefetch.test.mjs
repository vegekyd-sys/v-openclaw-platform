import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  DEFAULT_CONCURRENCY,
  LANE_WAIT_MS,
  MEDIA_PREFETCH_MARKER,
  extractRegion,
  patchDispatchFromConfig,
  patchRunnerEntries,
} from './patch-media-prefetch.mjs';
import { EXPECTED_INPUT_SHA256, INPUTS } from './build-media-prefetch.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const runnerIn = read(`../${INPUTS['runner.entries-C1o21Kna.js']}`);
const dispatchIn = read(`../${INPUTS['dispatch-from-config-DOJq_7CI.js']}`);
const runnerOut = read('./release-files/media-prefetch/runner.entries-C1o21Kna.js');
const dispatchOut = read('./release-files/media-prefetch/dispatch-from-config-DOJq_7CI.js');

test('inputs are V\'s pinned bytes and the release files are exactly the patch of them', () => {
  assert.equal(sha(runnerIn), EXPECTED_INPUT_SHA256['runner.entries-C1o21Kna.js']);
  assert.equal(sha(dispatchIn), EXPECTED_INPUT_SHA256['dispatch-from-config-DOJq_7CI.js']);
  assert.equal(patchRunnerEntries(runnerIn), runnerOut);
  assert.equal(patchDispatchFromConfig(dispatchIn), dispatchOut);
  assert.throws(() => patchRunnerEntries(runnerOut), /already patched/);
  assert.throws(() => patchDispatchFromConfig(dispatchOut), /already patched/);
});

test('the reply lane path is unchanged except for the lookup after the argv and the provider guard', () => {
  // the lookup sits right after the argv is resolved and before the CLI is executed
  const i = runnerOut.indexOf('const argv = [command, ...args].map(');
  const j = runnerOut.indexOf('mediaCliPrefetchLookup({', i);
  const k = runnerOut.indexOf('const { stdout, stderr } = await runExec(', i);
  assert(i > 0 && j > i && k > j);
  assert.match(runnerOut, /async function runProviderEntry\(params\) \{\n\t\/\/ media-prefetch-v1[^\n]*\n\tif \(mediaCliPrefetchState\(\)\.als\.getStore\(\)\?\.prefetch\) throw/);
  // the prefetch starts before the admission ticket and unused results go when the dispatch ends
  const s = dispatchOut.indexOf('const mediaPrefetch = startMediaUnderstandingPrefetch(params);');
  const t = dispatchOut.indexOf('const ticket = reserveReplyAdmissionTicket(');
  assert(s > 0 && t > s);
  assert.match(dispatchOut, /ticket\?\.release\(\);\n\t\tmediaPrefetch\?\.dropUnconsumed\(\);/);
  assert.match(dispatchOut, /import \{ c as resolveAgentConfig, m as resolveAgentWorkspaceDir, u as resolveAgentDir \} from "\.\/agent-scope-config-CUiGBd59\.js";/);
  assert.equal(runnerOut.split(MEDIA_PREFETCH_MARKER).length - 1, 6);
});

// ---- evaluate the runner region against fakes ----
function loadRunner({ env = {}, cliDelayMs = 0, cliFails = false } = {}) {
  delete globalThis[Symbol.for('openclaw.mediaCliPrefetch.v1')];
  const calls = [];
  const logs = [];
  const scope = {
    process: { env, getBuiltinModule: (m) => (m === 'node:async_hooks' ? { AsyncLocalStorage } : m === 'node:crypto' ? { createHash } : process.getBuiltinModule(m)) },
    fs$1: { stat: async (p) => ({ size: p.length * 1000, mtimeMs: 1 }) },
    setTimeout, Promise, JSON, Date, Number, Math, Map, Set, Error, Symbol, globalThis, String, Array,
  };
  const src = `${extractRegion(runnerOut, 'shared state')}\n${extractRegion(runnerOut, 'runner')}\n` +
    'return { mediaCliPrefetchState, mediaCliPrefetchLookup, mediaCliPrefetchMessageKey, mediaCliPrefetchKey, mediaCliPrefetchConcurrency, setRunCliEntry: (f) => { runCliEntry = f; } };';
  const api = new Function('scope', `with (scope) { let runCliEntry; ${src} }`)(scope);
  api.setRunCliEntry(async (params) => {
    calls.push({ capability: params.capability, at: Date.now() });
    if (cliDelayMs) await new Promise((r) => setTimeout(r, cliDelayMs));
    if (cliFails) throw new Error('cli failed');
    return { kind: 'video.description', attachmentIndex: 0, text: `analysis of ${params.capability}` };
  });
  api.mediaCliPrefetchState().log = { info: (m) => logs.push(m) };
  return { api, calls, logs, state: api.mediaCliPrefetchState() };
}
const ctx = { SessionKey: 'agent:makaron:feishu:group:oc_x', MessageSid: 'om_1', media: [{ path: '/media/inbound/a.mp4', contentType: 'video/mp4' }] };
const lookupParams = (over = {}) => ({ entryParams: { capability: 'video' }, ctx, cfg: { tools: { media: { video: { enabled: true } } } }, capability: 'video', argv: ['/bin/analyze', '--video', '/media/inbound/a.mp4', 'prompt'], outputDir: '/tmp/openclaw-media-cli-AAA', mediaPath: '/media/inbound/a.mp4', timeoutMs: 60000, maxChars: 8000, ...over });

test('a prefetched CLI run is reused by the lane for the identical call: the CLI runs once', async () => {
  const { api, calls, logs, state } = loadRunner();
  const prefetched = await state.als.run({ prefetch: true, keys: new Set() }, () => api.mediaCliPrefetchLookup(lookupParams()));
  assert.equal(prefetched.handled, true);
  assert.equal(calls.length, 1);
  // the lane call has its own temp output dir: normalised away
  const lane = await api.mediaCliPrefetchLookup(lookupParams({ outputDir: '/tmp/openclaw-media-cli-BBB', argv: ['/bin/analyze', '--video', '/media/inbound/a.mp4', 'prompt'] }));
  assert.equal(lane.handled, true);
  assert.deepEqual(lane.value, prefetched.value);
  assert.equal(calls.length, 1, 'no second CLI run');
  assert.equal(state.entries.size, 0, 'used once, then gone');
  assert(logs.some((l) => l.includes('"phase":"started"')) && logs.some((l) => l.includes('"phase":"hit"')));
  assert(!logs.join('\n').includes('/media/inbound'), 'no paths in the log');
  // a second lane call for the same media runs normally
  assert.equal((await api.mediaCliPrefetchLookup(lookupParams())).handled, false);
});

test('a different call misses: other argv, other bytes, other media config', async () => {
  const { api, state } = loadRunner();
  await state.als.run({ prefetch: true }, () => api.mediaCliPrefetchLookup(lookupParams()));
  assert.equal((await api.mediaCliPrefetchLookup(lookupParams({ argv: ['/bin/analyze', '--video', '/media/inbound/a.mp4', 'another prompt'] }))).handled, false);
  assert.equal((await api.mediaCliPrefetchLookup(lookupParams({ cfg: { tools: { media: { video: { enabled: true, maxChars: 1 } } } } }))).handled, false);
  assert.equal((await api.mediaCliPrefetchLookup(lookupParams({ timeoutMs: 1 }))).handled, false);
  assert.equal(state.entries.size, 1, 'the prefetched entry is left for its own call');
});

test('a failed prefetch falls back to running in the lane', async () => {
  const { api, calls, logs, state } = loadRunner({ cliFails: true });
  await assert.rejects(state.als.run({ prefetch: true }, () => api.mediaCliPrefetchLookup(lookupParams())));
  const lane = await api.mediaCliPrefetchLookup(lookupParams());
  assert.equal(lane.handled, false, 'the lane runs the CLI itself');
  assert.equal(calls.length, 1);
  assert(logs.some((l) => l.includes('"phase":"fallback"')));
});

test('image entries and the bypass scope are never prefetched; switched off does nothing', async () => {
  const { api, state } = loadRunner();
  await assert.rejects(state.als.run({ prefetch: true }, () => api.mediaCliPrefetchLookup(lookupParams({ capability: 'image' }))), /not prefetched/);
  assert.equal((await state.als.run({ bypass: true }, () => api.mediaCliPrefetchLookup(lookupParams()))).handled, false);
  const off = loadRunner({ env: { OPENCLAW_MEDIA_PREFETCH: '0' } });
  assert.equal((await off.state.als.run({ prefetch: true }, () => off.api.mediaCliPrefetchLookup(lookupParams()))).handled, false);
  assert.equal(off.calls.length, 0);
});

test('at most OPENCLAW_MEDIA_PREFETCH_CONCURRENCY prefetched CLI runs at once (default 3)', async () => {
  assert.equal(loadRunner().api.mediaCliPrefetchConcurrency({}), DEFAULT_CONCURRENCY);
  assert.equal(loadRunner().api.mediaCliPrefetchConcurrency({ OPENCLAW_MEDIA_PREFETCH_CONCURRENCY: '2' }), 2);
  const { api, calls, state } = loadRunner({ env: { OPENCLAW_MEDIA_PREFETCH_CONCURRENCY: '2' }, cliDelayMs: 60 });
  const runs = [1, 2, 3].map((n) => state.als.run({ prefetch: true }, () => api.mediaCliPrefetchLookup(lookupParams({ mediaPath: `/media/inbound/${n}${'x'.repeat(n)}.mp4`, argv: ['/bin/analyze', `/media/inbound/${n}.mp4`] }))));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 2, 'the third waits');
  await Promise.all(runs);
  assert.equal(calls.length, 3);
  assert(calls[2].at - calls[0].at >= 50, 'the third started after one finished');
});

test('the lane waits briefly for a prefetch of the same message that has not registered yet', async () => {
  const { api, calls, state } = loadRunner({ cliDelayMs: 30 });
  let resolveRegistered;
  const registered = new Map([['video', new Promise((r) => { resolveRegistered = r; })]]);
  state.pending.set(api.mediaCliPrefetchMessageKey(ctx), { registered, at: Date.now() });
  const lane = api.mediaCliPrefetchLookup(lookupParams());
  // the prefetch registers a moment later
  setTimeout(() => state.als.run({ prefetch: true, onRegistered: () => resolveRegistered() }, () => api.mediaCliPrefetchLookup(lookupParams())), 40);
  const result = await lane;
  assert.equal(result.handled, true);
  assert.equal(calls.length, 1, 'one CLI run for both');
  assert(LANE_WAIT_MS >= 1000);
});

// ---- dispatch region: which messages start a prefetch ----
function loadDispatch(env = {}) {
  delete globalThis[Symbol.for('openclaw.mediaCliPrefetch.v1')];
  const imports = [];
  const scope = {
    process: { env, getBuiltinModule: (m) => (m === 'node:async_hooks' ? { AsyncLocalStorage } : process.getBuiltinModule(m)) },
    normalizeOptionalString: (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
    createSubsystemLogger: () => ({ info: () => {} }),
    resolveSessionAgentId: () => 'makaron', resolveAgentDir: () => '/agent', resolveAgentWorkspaceDir: () => '/ws',
    // portable media -> MediaPaths/MediaTypes, as inbound-context finalizes it
    isFinalizedInboundContext: (c) => c.__finalized === true,
    finalizeInboundContext: (c) => ({ ...c, __finalized: true }),
    Promise, JSON, Date, Map, Set, Array, Symbol, globalThis,
  };
  const src = `${extractRegion(dispatchOut, 'shared state')}\n${extractRegion(dispatchOut, 'dispatch')}\nreturn { startMediaUnderstandingPrefetch, mediaPrefetchHasCliEntry, mediaCliPrefetchState };`;
  const api = new Function('scope', `with (scope) { ${src} }`)(scope);
  return { api, imports };
}
const cliMedia = { models: [{ type: 'cli', command: '/bin/analyze', args: ['{{MediaPath}}'], capabilities: ['video'] }], video: { enabled: true } };
const videoCtx = { ...ctx };

test('dispatch starts a prefetch only for local audio/video with a CLI media model, never twice for one message', () => {
  const { api } = loadDispatch();
  assert.equal(api.mediaPrefetchHasCliEntry(cliMedia), true);
  assert.equal(api.mediaPrefetchHasCliEntry({ video: { models: [{ type: 'cli', command: 'x' }] } }), true);
  assert.equal(api.mediaPrefetchHasCliEntry({ models: [{ type: 'provider', provider: 'google' }] }), false);
  assert.equal(api.startMediaUnderstandingPrefetch({ ctx: { ...videoCtx, media: [] }, cfg: { tools: { media: cliMedia } } }), undefined, 'no media');
  assert.equal(api.startMediaUnderstandingPrefetch({ ctx: { ...videoCtx, media: [{ path: '/media/inbound/a.png', contentType: 'image/png' }] }, cfg: { tools: { media: cliMedia } } }), undefined, 'image only');
  assert.equal(api.startMediaUnderstandingPrefetch({ ctx: { ...videoCtx, MediaRemoteHost: 'node-1' }, cfg: { tools: { media: cliMedia } } }), undefined, 'remote media is staged in the lane');
  assert.equal(api.startMediaUnderstandingPrefetch({ ctx: videoCtx, cfg: { tools: { media: { models: [{ type: 'provider' }] } } } }), undefined, 'no CLI model');
  assert.equal(api.startMediaUnderstandingPrefetch({ ctx: videoCtx, cfg: { tools: { media: { ...cliMedia, audio: { echoTranscript: true } } } } }), undefined, 'transcript echo would send a message');
  assert.equal(loadDispatch({ OPENCLAW_MEDIA_PREFETCH: '0' }).api.startMediaUnderstandingPrefetch({ ctx: videoCtx, cfg: { tools: { media: cliMedia } } }), undefined, 'switched off');
  // chat.send passes portable media; it is the finalized context that has the paths
  const portable = { SessionKey: 'agent:makaron:explicit:t', MessageSid: 'run-1', media: [{ path: '/media/inbound/p.mp4', contentType: 'video/mp4' }] };
  const portableHandle = api.startMediaUnderstandingPrefetch({ ctx: portable, cfg: { tools: { media: cliMedia } } });
  assert.equal(typeof portableHandle?.dropUnconsumed, 'function');
  assert.equal(portable.__finalized, undefined, 'the caller context is not modified');
  // a video by kind only (no content type) counts too
  const byKind = api.startMediaUnderstandingPrefetch({ ctx: { ...portable, MessageSid: 'run-2', media: [{ path: '/media/inbound/q', kind: 'video' }] }, cfg: { tools: { media: cliMedia } } });
  assert.equal(typeof byKind?.dropUnconsumed, 'function');
  byKind.dropUnconsumed();
  portableHandle.dropUnconsumed();
  const handle = api.startMediaUnderstandingPrefetch({ ctx: videoCtx, cfg: { tools: { media: cliMedia } } });
  assert.equal(typeof handle?.dropUnconsumed, 'function');
  assert.equal(api.startMediaUnderstandingPrefetch({ ctx: videoCtx, cfg: { tools: { media: cliMedia } } }), undefined, 'one prefetch per message');
  const state = api.mediaCliPrefetchState();
  assert.equal(state.pending.size, 1);
  state.entries.set('k', { at: Date.now(), promise: Promise.resolve() });
  handle.dropUnconsumed();
  assert.equal(state.pending.size, 0);
});
