import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { MARKER, MEMO, ORIGINAL_ENABLED, patchInstalledPluginIndexChunk } from './patch-plugin-config-memo.mjs';

const release = fs.readFileSync(new URL('./release-files/plugin-config-memo/installed-plugin-index-DzUab7zi.js', import.meta.url), 'utf8');

function unpatch(source) {
  return source
    .replace(MEMO, '')
    .replace('normalizeInstalledPluginActivationConfig(activationConfig?.plugins)', 'normalizePluginsConfig(activationConfig?.plugins)');
}

test('release is npm openclaw@2026.9.1 installed-plugin-index chunk plus only the memo', () => {
  const base = unpatch(release);
  assert.equal(createHash('sha256').update(base).digest('hex'), '3d177fdc4cff00363fa39864bfb0dd188fccc6cb1cfa8d0528cfb3a38839192c');
  assert.equal(patchInstalledPluginIndexChunk(base), release);
  assert.throws(() => patchInstalledPluginIndexChunk(release), /already patched/);
});

function harness(env = {}) {
  const from = release.indexOf(MARKER);
  const to = release.indexOf(ORIGINAL_ENABLED);
  assert(from > 0 && to > from);
  const state = { calls: 0 };
  const normalizePluginsConfig = (plugins) => {
    state.calls += 1;
    return { enabled: plugins?.enabled !== false, entries: Object.fromEntries(Object.entries(plugins?.entries ?? {}).map(([k, v]) => [k, { enabled: v?.enabled }])) };
  };
  const saved = process.env.OPENCLAW_PLUGIN_CONFIG_MEMO;
  if ('OPENCLAW_PLUGIN_CONFIG_MEMO' in env) process.env.OPENCLAW_PLUGIN_CONFIG_MEMO = env.OPENCLAW_PLUGIN_CONFIG_MEMO;
  try {
    const normalize = new Function('normalizePluginsConfig',
      `${release.slice(from, to)}\nreturn normalizeInstalledPluginActivationConfig;`)(normalizePluginsConfig);
    return { normalize, state };
  } finally {
    if (saved === undefined) delete process.env.OPENCLAW_PLUGIN_CONFIG_MEMO; else process.env.OPENCLAW_PLUGIN_CONFIG_MEMO = saved;
  }
}

test('the same plugins object normalizes once, and changes to it normalize again', () => {
  const { normalize, state } = harness();
  const plugins = { entries: { a: { enabled: true }, b: { enabled: false } }, allow: ['a'] };
  const first = normalize(plugins);
  for (let i = 0; i < 5; i += 1) assert.equal(normalize(plugins), first);
  assert.equal(state.calls, 1);

  plugins.entries.a.enabled = false;
  assert.equal(normalize(plugins).entries.a.enabled, false);
  plugins.entries.c = { enabled: true };
  assert.equal(normalize(plugins).entries.c.enabled, true);
  plugins.entries.c = { enabled: true };
  normalize(plugins);
  plugins.allow = ['b'];
  normalize(plugins);
  plugins.enabled = false;
  assert.equal(normalize(plugins).enabled, false);
  assert.equal(state.calls, 6);
  normalize(plugins);
  assert.equal(state.calls, 6);

  normalize({ ...plugins });
  assert.equal(state.calls, 7);
  normalize(undefined);
  normalize(undefined);
  assert.equal(state.calls, 9);
});

test('the off switch normalizes every call', () => {
  const { normalize, state } = harness({ OPENCLAW_PLUGIN_CONFIG_MEMO: '0' });
  const plugins = { entries: { a: { enabled: true } } };
  normalize(plugins); normalize(plugins); normalize(plugins);
  assert.equal(state.calls, 3);
});
