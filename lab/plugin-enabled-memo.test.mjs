import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, MARKER, RELEASE_DIR, patchFile, sha256, unpatchFile } from './patch-plugin-enabled-memo.mjs';

// plugin-enabled-memo: see lab/plugin-enabled-memo.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/plugin-enabled-memo.plan.json'));
const NAME = 'installed-plugin-index-DzUab7zi.js';
const spec = FILES[NAME];

test('plan pins V bytes before and the release file after', () => {
  const released = read(`${RELEASE_DIR}/${NAME}`);
  const original = unpatchFile(NAME, released);
  const entry = plan.files.find((file) => file.target === spec.target);
  assert.equal(plan.files.length, 1);
  assert.equal(entry.source, `${RELEASE_DIR}/${NAME}`);
  assert.equal(sha256(original), spec.before, 'V bytes');
  assert.equal(sha256(released), entry.after, 'release bytes');
  assert.equal(patchFile(NAME, original), released);
  assert.throws(() => patchFile(NAME, released), /already patched/);
});

// Runs the shipped functions (from the memo declaration to the end of isInstalledPluginEnabled's helper)
// with stand-ins for their imports, so each call into the activation chain can be counted.
function load(source, { patched }) {
  const start = patched ? source.indexOf(`// ${MARKER}:`) : source.indexOf('function isInstalledPluginEnabled(');
  const end = source.indexOf('\n}\n', source.indexOf('normalizePluginsConfig(activationConfig?.plugins)')) + 3;
  assert.ok(start > 0 && end > start);
  const body = source.slice(start, end);
  const calls = { normalize: 0, compat: 0, discovery: 0 };
  const clears = [];
  const deps = {
    getInstalledPluginRecord: (index, id) => index.plugins.find((plugin) => plugin.pluginId === id),
    isBundledProviderCompatPlugin: ({ origin }) => origin === 'bundled-compat',
    withBundledPluginEnablementCompat: ({ config, pluginIds }) => {
      calls.compat += 1;
      return pluginIds.length && deps.mode === 'compat' ? { ...config, plugins: { ...config.plugins, entries: { ...config.plugins?.entries, [pluginIds[0]]: { enabled: true } } } } : config;
    },
    readBundledDiscoveryModeMemoized: () => {
      calls.discovery += 1;
      return deps.mode;
    },
    normalizePluginsConfig: (plugins) => {
      calls.normalize += 1;
      return { deny: plugins?.deny ?? [], entries: plugins?.entries ?? {} };
    },
    resolveEffectivePluginActivationState: ({ id, config, enabledByDefault }) => ({
      enabled: !config.deny.includes(id) && (config.entries[id]?.enabled ?? enabledByDefault),
    }),
    isPluginEnabledByDefaultForPlatform: (record) => record.enabledByDefault === true,
    registerPluginMetadataProcessMemoLifecycleClear: (fn) => clears.push(fn),
    mode: 'allowlist',
  };
  const names = Object.keys(deps).filter((key) => key !== 'mode');
  const fn = new Function(...names, 'process', `${body}\nreturn isInstalledPluginEnabled;`);
  const env = {};
  const isEnabled = fn(...names.map((key) => (...args) => deps[key](...args)), { env });
  return { isEnabled, calls, deps, env, clear: () => clears.forEach((c) => c()) };
}

const index = () => ({
  plugins: [
    { pluginId: 'demo', origin: 'global', enabled: true, enabledByDefault: true },
    { pluginId: 'off', origin: 'global', enabled: false, enabledByDefault: false },
    { pluginId: 'speech', origin: 'bundled-compat', enabled: false, enabledByDefault: false },
  ],
});
const configs = [{ plugins: { deny: ['demo'] } }, { plugins: {} }, { plugins: { entries: { off: { enabled: true } } } }, {}];

test('same answers as V for every record, config and discovery mode', () => {
  const released = read(`${RELEASE_DIR}/${NAME}`);
  const v = load(unpatchFile(NAME, released), { patched: false });
  const memo = load(released, { patched: true });
  const idx = index();
  for (const mode of ['allowlist', 'compat', 'allowlist']) {
    v.deps.mode = mode;
    memo.deps.mode = mode;
    for (let round = 0; round < 3; round += 1)
      for (const config of [...configs, undefined])
        for (const id of ['demo', 'off', 'speech', 'missing'])
          assert.equal(memo.isEnabled(idx, id, config), v.isEnabled(idx, id, config), `${mode} ${id} ${JSON.stringify(config)}`);
  }
  // compat plugin answered per mode: on in compat, off otherwise
  memo.deps.mode = 'compat';
  assert.equal(memo.isEnabled(idx, 'speech', configs[1]), true);
  memo.deps.mode = 'allowlist';
  assert.equal(memo.isEnabled(idx, 'speech', configs[1]), false);
});

test('one evaluation per record and config object; replaced config and cleared memo re-evaluate', () => {
  const memo = load(read(`${RELEASE_DIR}/${NAME}`), { patched: true });
  const idx = index();
  const config = { plugins: { deny: ['demo'] } };
  for (let i = 0; i < 5; i += 1) {
    assert.equal(memo.isEnabled(idx, 'demo', config), false);
    assert.equal(memo.isEnabled(idx, 'off', config), false);
  }
  assert.equal(memo.calls.normalize, 2);
  assert.equal(memo.isEnabled(idx, 'demo', { plugins: {} }), true);
  assert.equal(memo.calls.normalize, 3);
  memo.clear();
  memo.isEnabled(idx, 'demo', config);
  assert.equal(memo.calls.normalize, 4);
  assert.equal(memo.calls.discovery, 0, 'discovery mode is read only for compat plugins');
});

test('the switch evaluates every call', () => {
  const memo = load(read(`${RELEASE_DIR}/${NAME}`), { patched: true });
  memo.env.OPENCLAW_V_PLUGIN_ENABLED_MEMO = '0';
  const idx = index();
  const config = { plugins: {} };
  for (let i = 0; i < 4; i += 1) memo.isEnabled(idx, 'demo', config);
  assert.equal(memo.calls.normalize, 4);
});
