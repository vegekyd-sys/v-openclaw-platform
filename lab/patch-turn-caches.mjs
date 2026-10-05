import assert from 'node:assert/strict';

// Per-turn hot helpers memoized for one microtask window (turn-caches), on V's 2026.9.1
// bytes (all three files are unmodified upstream on V).
//
// A warm Worker turn spends ~400 ms between worker-command-enter and the model call
// (VLab candidate, 1 Worker, closed model port: 0.34-0.49 s). Its CPU profile has three
// helpers that are cheap per call but are called thousands of times per turn, each call
// re-reading process.env and re-serializing a cache key:
//   isVitestRuntimeEnv()               3.3 us/call, ~22 ms self per turn  (~6.6k calls)
//   resolveBundledPluginsDir()         9.5 us/call, ~33 ms incl. per turn (~3.5k calls)
//   listBundledChannelCatalogEntries() 8.9 us/call, ~38 ms incl. per turn (normalizeChatChannelId
//                                      of every non-core channel id lands here)
// (per-call costs: VLab candidate turn-hot-calls; per-turn shares: the warm profile of
// candidate-3b822f02.) Each already caches its result; the cost is the key.
//
// Each now keeps its last answer for the current microtask window when called with the
// process environment: the first call in a synchronous stretch computes exactly as before
// and schedules a microtask that drops the memo; later calls in the same stretch return it.
// Nothing can change process.env, argv, execPath or cwd between two calls of one
// synchronous stretch except that stretch itself, and the plugin-cache memos are also keyed
// on the cache object they read, so a cache reset in the same stretch recomputes. Calls
// with an explicit env object other than process.env compute as before.
// OPENCLAW_TURN_HELPER_MEMO=0 (read once at module load) turns the memos off.
// Measured 2026-10-06 (VLab candidate, 1 Worker, warm command -> model, 3 turns): dev
// 419/376/406 and 446/388/402 ms, patched 403/330/348 ms: at most ~40 ms, within run-to-run
// noise; Gateway warm messages unchanged. The bulk of a warm turn is elsewhere (see PR).

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const MEMO_ENABLED = 'process.env.OPENCLAW_TURN_HELPER_MEMO !== "0"';

export function patchTestRuntimeEnv(source) {
  return replaceExactlyOnce(
    source,
    `function isVitestRuntimeEnv(env = process.env) {
	return env.VITEST === "true" || env.VITEST === "1" || env.VITEST_POOL_ID !== void 0 || env.VITEST_WORKER_ID !== void 0 || env.NODE_ENV === "test";
}`,
    `const turnHelperMemoEnabled = ${MEMO_ENABLED};
let processVitestRuntimeEnvMemo;
function isVitestRuntimeEnv(env = process.env) {
	// turn-caches: one answer per microtask window for the process environment
	if (turnHelperMemoEnabled && env === process.env) {
		if (processVitestRuntimeEnvMemo !== void 0) return processVitestRuntimeEnvMemo;
		processVitestRuntimeEnvMemo = computeVitestRuntimeEnv(env);
		queueMicrotask(() => {
			processVitestRuntimeEnvMemo = void 0;
		});
		return processVitestRuntimeEnvMemo;
	}
	return computeVitestRuntimeEnv(env);
}
function computeVitestRuntimeEnv(env) {
	return env.VITEST === "true" || env.VITEST === "1" || env.VITEST_POOL_ID !== void 0 || env.VITEST_WORKER_ID !== void 0 || env.NODE_ENV === "test";
}`,
    'isVitestRuntimeEnv',
  );
}

export function patchBundledDir(source) {
  let out = replaceExactlyOnce(
    source,
    'function resolveBundledPluginsDir(env = process.env) {\n\tconst disabled = areBundledPluginsDisabled(env);',
    `const turnHelperMemoEnabled = ${MEMO_ENABLED};
let processBundledPluginsDirMemo;
function resolveBundledPluginsDir(env = process.env) {
	// turn-caches: one answer per microtask window for the process environment and plugin cache
	if (turnHelperMemoEnabled && env === process.env) {
		const metadata = getPluginCache().metadata;
		if (processBundledPluginsDirMemo?.metadata === metadata) return processBundledPluginsDirMemo.value;
		const value = resolveBundledPluginsDirKeyed(env);
		processBundledPluginsDirMemo = { metadata, value };
		queueMicrotask(() => {
			processBundledPluginsDirMemo = void 0;
		});
		return value;
	}
	return resolveBundledPluginsDirKeyed(env);
}
function resolveBundledPluginsDirKeyed(env) {
	const disabled = areBundledPluginsDisabled(env);`,
    'resolveBundledPluginsDir',
  );
  return out;
}

export function patchChannelCatalog(source) {
  return replaceExactlyOnce(
    source,
    'function listBundledChannelCatalogEntries() {\n\tconst pluginsDir = resolveBundledPluginsDir();',
    `const turnHelperMemoEnabled = ${MEMO_ENABLED};
let bundledChannelCatalogMemo;
function listBundledChannelCatalogEntries() {
	// turn-caches: one answer per microtask window and plugin cache
	if (!turnHelperMemoEnabled) return listBundledChannelCatalogEntriesKeyed();
	const catalogs = getPluginCache().metadata.bundledChannelCatalogs;
	if (bundledChannelCatalogMemo?.catalogs === catalogs) return bundledChannelCatalogMemo.value;
	const value = listBundledChannelCatalogEntriesKeyed();
	bundledChannelCatalogMemo = { catalogs, value };
	queueMicrotask(() => {
		bundledChannelCatalogMemo = void 0;
	});
	return value;
}
function listBundledChannelCatalogEntriesKeyed() {
	const pluginsDir = resolveBundledPluginsDir();`,
    'listBundledChannelCatalogEntries',
  );
}
