import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, verify, revert, REF, PROVIDER, API_KEY_MARKER } from './gemini-neon-alias.mjs';

function config(runtime) {
  return {
    secrets: { providers: { default: { source: 'env', allowlist: ['GOOGLE_API_KEY'] } } },
    models: { providers: { deepseek: { api: 'openai-completions', apiKey: 'literal-ds' } } },
    agents: {
      defaults: {
        modelPolicy: { allow: ['openai/*', 'deepseek/deepseek-flash'] },
        models: { 'deepseek/deepseek-flash': { alias: 'deepseek', agentRuntime: { id: runtime }, params: { thinking: 'high' } } },
      },
      entries: {
        makaron: { models: { 'deepseek/deepseek-flash': { alias: 'deepseek', agentRuntime: { id: runtime } } } },
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

for (const runtime of ['vlab-worker', 'openclaw']) {
  test(`plan adds /neon on ${runtime} and is idempotent`, () => {
    const cfg = config(runtime);
    const { sets } = plan(cfg);
    assert.deepEqual(sets.map((s) => s.path), [
      `models.providers.${PROVIDER}`, 'agents.defaults.modelPolicy.allow',
      'agents.defaults.models', 'agents.entries.makaron.models',
    ]);
    applySets(cfg, sets);
    const v = verify(cfg);
    assert.equal(v.ok, true, v.problems.join('; '));
    assert.equal(cfg.agents.defaults.models[REF].agentRuntime.id, runtime);
    assert.equal(cfg.agents.entries.makaron.models[REF].alias, 'neon');
    assert.equal(cfg.agents.entries['v-codex'].models[REF], undefined, 'other agents are untouched');
    assert.equal(cfg.models.providers[PROVIDER].apiKey, API_KEY_MARKER, 'a fixed non-secret marker, no credential');
    assert.equal(cfg.secrets.providers.default.allowlist[0], 'GOOGLE_API_KEY', 'existing secret providers are kept');
    assert.equal(cfg.models.providers.deepseek.apiKey, 'literal-ds', 'existing providers are kept');
    assert.deepEqual(plan(cfg).sets, [], 'second run is a no-op');
    assert.equal(JSON.stringify(plan(cfg)).includes('literal-ds'), false, 'plan never echoes other secrets');
  });
}

test('refuses to steal an alias that points elsewhere', () => {
  const cfg = config('vlab-worker');
  cfg.agents.defaults.models['xai/grok-4.7'] = { alias: 'Neon' };
  assert.throws(() => plan(cfg), /already points at xai\/grok-4.7/);
});

test('custom bridge URL', () => {
  const cfg = applySets(config('openclaw'), plan(config('openclaw'), { baseUrl: 'http://127.0.0.1:1/v1beta' }).sets);
  assert.equal(cfg.models.providers[PROVIDER].baseUrl, 'http://127.0.0.1:1/v1beta');
  assert.equal(verify(cfg).ok, false, 'defaults no longer match');
  assert.equal(verify(cfg, { baseUrl: 'http://127.0.0.1:1/v1beta' }).ok, true);
});

test('revert lists exactly what plan added', () => {
  const cfg = applySets(config('vlab-worker'), plan(config('vlab-worker')).sets);
  const r = revert(cfg);
  assert.deepEqual(r.unset, [
    `agents.defaults.models["${REF}"]`, `agents.entries.makaron.models["${REF}"]`,
    `models.providers.${PROVIDER}`,
  ]);
  assert.deepEqual(r.sets, [{ path: 'agents.defaults.modelPolicy.allow', value: ['openai/*', 'deepseek/deepseek-flash'] }]);
});
