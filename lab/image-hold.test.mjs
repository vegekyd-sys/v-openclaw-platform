import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchRunner } from './patch-image-hold.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const runner = read('./fixtures/image-hold/runner-BIhCXp3h.js');
const released = read('./release-files/image-hold/runner-BIhCXp3h.js');

test('the release file is V\'s runner with only the probe change', () => {
  assert.equal(patchRunner(runner), released);
  assert.throws(() => patchRunner(released), /native vision probe/);
  // the catalog API the probe uses comes from the same lazy module as before
  assert.match(runner, /const loadPreparedModelCatalogApi = createLazyRuntimeModule\(async \(\) => \(\{\n\t\.\.\.await import\("\.\/model-catalog-DRobr014\.js"\),\n\t\.\.\.await import\("\.\/prepared-model-catalog-BQXfkgza\.js"\)\n\}\)\);/);
});

// Run the patched probe against a fake catalog API.
function probe(api) {
  const start = released.indexOf('async function activeModelSupportsNativeVision(params)');
  const end = released.indexOf('async function* resolveAutoAudioEntries(');
  const AsyncFunction = (async () => {}).constructor;
  const fn = new AsyncFunction('loadPreparedModelCatalogApi', 'isMinimaxVlmProvider', 'isMinimaxNativeVisionModel', 'params', `${released.slice(start, end)}\nreturn await activeModelSupportsNativeVision(params);`);
  return (params) => fn(async () => api, () => false, () => true, params);
}
const entry = (provider, id, input) => ({ provider, id, input });
const api = ({ available, scoped, full, calls }) => ({
  findModelInCatalog: (catalog, provider, model) => catalog.find((e) => e.provider === provider && e.id === model),
  modelSupportsVision: (e) => Boolean(e?.input?.includes('image')),
  getAvailablePreparedModelCatalogSnapshot: (p) => { calls.push(['available', p]); if (available instanceof Error) throw available; return available ? { entries: available } : undefined; },
  loadPreparedModelCatalog: async (p) => { calls.push([p.readOnly ? 'scoped' : 'full', p]); if (p.readOnly) { if (scoped instanceof Error) throw scoped; return scoped ?? []; } return full ?? []; },
});
const params = { cfg: { c: 1 }, agentId: 'makaron', agentDir: '/a', workspaceDir: '/w', activeModel: { provider: 'deepseek', model: 'deepseek-flash' } };

test('the generation\'s completed catalog answers without any catalog read', async () => {
  const calls = [];
  assert.equal(await probe(api({ available: [entry('deepseek', 'deepseek-flash', ['text', 'image'])], calls }))(params), true);
  assert.deepEqual(calls.map((c) => c[0]), ['available']);
  assert.deepEqual(calls[0][1], { config: { c: 1 }, agentId: 'makaron', agentDir: '/a', workspaceDir: '/w' });
});

test('otherwise the scoped read-only catalog for the active provider answers', async () => {
  const calls = [];
  assert.equal(await probe(api({ available: [], scoped: [entry('deepseek', 'deepseek-flash', ['text'])], calls }))(params), false);
  assert.deepEqual(calls.map((c) => c[0]), ['available', 'scoped']);
  assert.deepEqual(calls[1][1], { config: { c: 1 }, agentId: 'makaron', agentDir: '/a', workspaceDir: '/w', readOnly: true, providerDiscoveryProviderIds: ['deepseek'] });
});

test('the full catalog is read only when neither knows the model, as before', async () => {
  const calls = [];
  assert.equal(await probe(api({ available: undefined, scoped: [entry('deepseek', 'other', ['image'])], full: [entry('deepseek', 'deepseek-flash', ['image'])], calls }))(params), true);
  assert.deepEqual(calls.map((c) => c[0]), ['available', 'scoped', 'full']);
  assert.deepEqual(calls[2][1], { config: { c: 1 }, agentId: 'makaron', agentDir: '/a', workspaceDir: '/w' });
});

test('failing cheap reads fall through to the old full read', async () => {
  const calls = [];
  assert.equal(await probe(api({ available: new Error('no owner'), scoped: new Error('scoped failed'), full: [entry('deepseek', 'deepseek-flash', ['image'])], calls }))(params), true);
  assert.deepEqual(calls.map((c) => c[0]), ['available', 'scoped', 'full']);
});

test('no active provider: no catalog read at all, as before', async () => {
  const calls = [];
  assert.equal(await probe(api({ calls }))({ ...params, activeModel: { provider: ' ' } }), false);
  assert.equal(calls.length, 0);
});
