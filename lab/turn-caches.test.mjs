import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchBundledDir, patchChannelCatalog, patchTestRuntimeEnv } from './patch-turn-caches.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const fixture = (name) => read(`./fixtures/turn-caches/${name}`);
const released = (name) => read(`./release-files/turn-caches/${name}`);
const ENV = 'test-runtime-env-DQDRzsLt.js';
const DIR = 'bundled-dir-CnR4u-Mo.js';
const CATALOG = 'bundled-channel-catalog-read-BwcurWAL.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('release files are V\'s files with only the memo change', () => {
  assert.equal(patchTestRuntimeEnv(fixture(ENV)), released(ENV));
  assert.equal(patchBundledDir(fixture(DIR)), released(DIR));
  assert.equal(patchChannelCatalog(fixture(CATALOG)), released(CATALOG));
  assert.throws(() => patchTestRuntimeEnv(released(ENV)), /isVitestRuntimeEnv/);
  assert.throws(() => patchBundledDir(released(DIR)), /resolveBundledPluginsDir/);
  assert.throws(() => patchChannelCatalog(released(CATALOG)), /listBundledChannelCatalogEntries/);
});

test('the computations themselves are V\'s, unchanged', () => {
  const vitestExpr = 'env.VITEST === "true" || env.VITEST === "1" || env.VITEST_POOL_ID !== void 0 || env.VITEST_WORKER_ID !== void 0 || env.NODE_ENV === "test"';
  assert(fixture(ENV).includes(`return ${vitestExpr};`));
  assert(released(ENV).includes(`function computeVitestRuntimeEnv(env) {\n\treturn ${vitestExpr};\n}`));
  // the keyed bodies are the original function bodies under a new name
  const originalDir = fixture(DIR).slice(fixture(DIR).indexOf('function resolveBundledPluginsDir(env = process.env) {') + 'function resolveBundledPluginsDir(env = process.env) {'.length, fixture(DIR).indexOf('//#endregion', fixture(DIR).indexOf('function resolveBundledPluginsDir(')));
  assert(released(DIR).includes(`function resolveBundledPluginsDirKeyed(env) {${originalDir}`));
  const originalCatalog = fixture(CATALOG).slice(fixture(CATALOG).indexOf('function listBundledChannelCatalogEntries() {') + 'function listBundledChannelCatalogEntries() {'.length, fixture(CATALOG).indexOf('/** Finds bundled or generated channel metadata'));
  assert(released(CATALOG).includes(`function listBundledChannelCatalogEntriesKeyed() {${originalCatalog}`));
});

// Load a released function body against a fake environment.
function loadVitest(env) {
  const src = released(ENV).slice(released(ENV).indexOf('const turnHelperMemoEnabled'), released(ENV).indexOf('/** Enables the shared fast-test shortcuts'));
  return new Function('process', `${src}\nreturn isVitestRuntimeEnv;`)({ env });
}

test('isVitestRuntimeEnv: one answer per microtask window for process.env, fresh after it', async () => {
  const env = { NODE_ENV: 'production' };
  const isVitest = loadVitest(env);
  assert.equal(isVitest(), false);
  env.NODE_ENV = 'test';
  assert.equal(isVitest(), false, 'same synchronous stretch: memo');
  assert.equal(isVitest({ NODE_ENV: 'test' }), true, 'an explicit env object is never memoized');
  await tick();
  assert.equal(isVitest(), true, 'next window recomputes');
});

test('OPENCLAW_TURN_HELPER_MEMO=0 turns the memo off', () => {
  const env = { OPENCLAW_TURN_HELPER_MEMO: '0', NODE_ENV: 'production' };
  const isVitest = loadVitest(env);
  assert.equal(isVitest(), false);
  env.NODE_ENV = 'test';
  assert.equal(isVitest(), true);
});

function loadBundledDir(env, cache, compute) {
  const out = released(DIR);
  const src = out.slice(out.indexOf('const turnHelperMemoEnabled'), out.indexOf('function resolveBundledPluginsDirKeyed(env) {'));
  return new Function('process', 'getPluginCache', 'resolveBundledPluginsDirKeyed', `${src}\nreturn resolveBundledPluginsDir;`)({ env }, () => cache.current, compute);
}

test('resolveBundledPluginsDir: memo per window and per plugin cache object', async () => {
  const env = {};
  const cache = { current: { metadata: {} } };
  let calls = 0;
  const resolve = loadBundledDir(env, cache, () => `/dir/${++calls}`);
  assert.equal(resolve(), '/dir/1');
  assert.equal(resolve(), '/dir/1');
  assert.equal(calls, 1);
  cache.current = { metadata: {} }; // cache reset in the same stretch
  assert.equal(resolve(), '/dir/2');
  assert.equal(resolve({ OTHER: '1' }), '/dir/3', 'explicit env computes');
  await tick();
  assert.equal(resolve(), '/dir/4');
});

function loadCatalog(env, cache, compute) {
  const out = released(CATALOG);
  const src = out.slice(out.indexOf('const turnHelperMemoEnabled'), out.indexOf('function listBundledChannelCatalogEntriesKeyed() {'));
  return new Function('process', 'getPluginCache', 'listBundledChannelCatalogEntriesKeyed', `${src}\nreturn listBundledChannelCatalogEntries;`)({ env }, () => cache.current, compute);
}

test('listBundledChannelCatalogEntries: memo per window and per catalog map', async () => {
  const cache = { current: { metadata: { bundledChannelCatalogs: new Map() } } };
  let calls = 0;
  const list = loadCatalog({}, cache, () => [{ id: `c${++calls}` }]);
  const first = list();
  assert.equal(list(), first);
  assert.equal(calls, 1);
  cache.current = { metadata: { bundledChannelCatalogs: new Map() } };
  assert.notEqual(list(), first);
  assert.equal(calls, 2);
  await tick();
  list();
  assert.equal(calls, 3);
});

test('memo off for the catalog too', () => {
  const cache = { current: { metadata: { bundledChannelCatalogs: new Map() } } };
  let calls = 0;
  const list = loadCatalog({ OPENCLAW_TURN_HELPER_MEMO: '0' }, cache, () => [++calls]);
  list(); list();
  assert.equal(calls, 2);
});
