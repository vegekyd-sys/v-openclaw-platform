import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, verify, revert, REF, PROVIDER, PLUGIN_ID, RUNTIME } from './gemini-neon-alias.mjs';

function config() {
  return {
    plugins: { load: { paths: ['/x/other'] }, allow: ['feishu', 'codex'], entries: { feishu: { enabled: true } } },
    models: { providers: { deepseek: { api: 'openai-completions', apiKey: 'literal-ds' } } },
    channels: { feishu: { enabled: true, renderMode: 'auto' } },
    agents: {
      defaults: {
        modelPolicy: { allow: ['openai/*', 'deepseek/deepseek-flash'] },
        models: { 'deepseek/deepseek-flash': { alias: 'deepseek', agentRuntime: { id: 'vlab-worker' } } },
      },
      entries: {
        makaron: { models: { 'deepseek/deepseek-flash': { alias: 'deepseek' } } },
        'v-codex': { models: { 'openai/gpt-6.2-astra': { alias: 'astra', agentRuntime: { id: 'codex' } } } },
      },
    },
  };
}

function applySets(cfg, sets) {
  const merge = (a, b) => (b && typeof b === 'object' && !Array.isArray(b) && a && typeof a === 'object' && !Array.isArray(a)
    ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, k in b ? merge(a[k], b[k]) : a[k]]))
    : structuredClone(b));
  for (const { path, value } of sets) {
    const keys = path.split('.');
    let node = cfg;
    for (const k of keys.slice(0, -1)) node = node[k] ??= {};
    node[keys.at(-1)] = merge(node[keys.at(-1)], value);
  }
  return cfg;
}

test('plan adds the plugin, the provider row and /neon on the Antigravity runtime; idempotent', () => {
  const cfg = config();
  const { sets } = plan(cfg);
  assert.deepEqual(sets.map((s) => s.path), [
    'plugins.load.paths', 'plugins.allow', `plugins.entries.${PLUGIN_ID}`, `models.providers.${PROVIDER}`,
    'agents.defaults.modelPolicy.allow', 'agents.defaults.models', 'agents.entries.makaron.models',
    'channels.feishu.visibleProgressRuntimes',
  ]);
  applySets(cfg, sets);
  const v = verify(cfg);
  assert.equal(v.ok, true, v.problems.join('; '));
  assert.deepEqual(cfg.plugins.load.paths, ['/x/other', '/home/openclaw/.openclaw/extensions/v-antigravity']);
  assert.deepEqual(cfg.agents.defaults.models[REF], { alias: 'neon', agentRuntime: { id: RUNTIME }, params: { thinking: 'high' } });
  assert.equal(cfg.agents.entries.makaron.models[REF].agentRuntime.id, RUNTIME);
  assert.equal(cfg.agents.entries['v-codex'].models[REF], undefined, 'other agents are untouched');
  assert.equal(cfg.models.providers[PROVIDER].apiKey, undefined, 'no credential in the provider row');
  assert.deepEqual(cfg.plugins.entries[PLUGIN_ID].config, { agyBin: '/opt/agy/current/agy', agyHome: '/home/openclaw/.agy-home', runRoot: '/home/openclaw/.agy-home/openclaw-runs', defaultEffort: 'high', modelProvider: PROVIDER });
  assert.equal(cfg.models.providers.deepseek.apiKey, 'literal-ds');
  assert.deepEqual(cfg.channels.feishu.visibleProgressRuntimes, ['codex', 'vlab-worker', 'claude-cli', RUNTIME], 'the card shows /neon\'s process like /vcc\'s');
  assert.equal(cfg.channels.feishu.renderMode, 'auto');
  assert.deepEqual(plan(cfg).sets, [], 'second run is a no-op');
  assert.equal(JSON.stringify(plan(config())).includes('literal-ds'), false, 'plan never echoes other secrets');
});

test('host-specific paths', () => {
  const opts = { pluginDir: '/srv/lab/ext/v-antigravity', agyBin: '/opt/agy-lab/bin/agy', agyHome: '/var/lib/agy-lab/home' };
  const cfg = applySets(config(), plan(config(), opts).sets);
  assert.equal(verify(cfg, opts).ok, true);
  assert.equal(verify(cfg).ok, false, 'V defaults do not match a lab config');
  assert.throws(() => plan(config(), { agyHome: 'relative' }), /absolute/);
});

test('refuses to steal an alias that points elsewhere', () => {
  const cfg = config();
  cfg.agents.defaults.models['xai/grok-4.7'] = { alias: 'Neon' };
  assert.throws(() => plan(cfg), /already points at xai\/grok-4.7/);
});

test('revert removes the alias and provider, switches the plugin off and drops its load path', () => {
  const cfg = applySets(config(), plan(config()).sets);
  const r = revert(cfg);
  assert.deepEqual(r.unset, [`agents.defaults.models["${REF}"]`, `agents.entries.makaron.models["${REF}"]`, `models.providers.${PROVIDER}`, 'channels.feishu.visibleProgressRuntimes']);
  assert.deepEqual(r.sets, [
    { path: 'agents.defaults.modelPolicy.allow', value: ['openai/*', 'deepseek/deepseek-flash'] },
    { path: `plugins.entries.${PLUGIN_ID}`, value: { enabled: false } },
    { path: 'plugins.load.paths', value: ['/x/other'] },
  ]);
});

test('an existing Feishu progress list is extended and restored, and no Feishu means no change', () => {
  const cfg = config();
  cfg.channels.feishu.visibleProgressRuntimes = ['codex', 'claude-cli'];
  const set = plan(cfg).sets.find((s) => s.path === 'channels.feishu.visibleProgressRuntimes');
  assert.deepEqual(set.value, ['codex', 'claude-cli', RUNTIME]);
  applySets(cfg, plan(cfg).sets);
  assert.deepEqual(revert(cfg).sets.find((s) => s.path === 'channels.feishu.visibleProgressRuntimes').value, ['codex', 'claude-cli']);
  const noFeishu = config();
  delete noFeishu.channels;
  assert.equal(plan(noFeishu).sets.some((s) => s.path.startsWith('channels.')), false);
  assert.equal(verify(applySets(noFeishu, plan(noFeishu).sets)).ok, true);
});
