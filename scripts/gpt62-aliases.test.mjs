import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, verify, revert, ROWS } from './gpt62-aliases.mjs';

// Shape of production V on 2026-11-18 (Gateway file; the Worker file differs
// only in runtime ids, which the migration copies rather than rewrites).
function gatewayLike(runtime = 'vlab-worker') {
  return {
    models: { providers: { openai: { models: [{ id: 'gpt-6.1-terra' }, { id: 'gpt-6-luna' }] } } },
    plugins: { entries: { codex: { config: { appServer: { mode: 'yolo', sandbox: 'danger-full-access', command: '/opt/codex-0.159.2-v/codex' } } } } },
    agents: {
      defaults: {
        models: {
          'openai/gpt-6-astra': { alias: 'astra', params: { thinking: 'low' }, agentRuntime: { id: runtime } },
          'openai/gpt-6-sol': { alias: 'vcodex60', params: { thinking: 'medium' }, agentRuntime: { id: 'codex' } },
          'openai/gpt-6.1-sol': { alias: 'vcodex', params: { thinking: 'medium' }, agentRuntime: { id: 'codex' } },
          'deepseek/vds-deepseek-flash': { alias: 'vds', agentRuntime: { id: 'codex' } },
          'openai/gpt-6.1-terra': { alias: 'terra', params: { thinking: 'medium' }, agentRuntime: { id: runtime } },
          'openai/gpt-5.6-terra': { alias: 'terra56', params: { thinking: 'medium' }, agentRuntime: { id: runtime } },
        },
      },
      entries: {
        makaron: { models: {
          'openai/gpt-6-astra': { alias: 'astra', params: { thinking: 'high' }, agentRuntime: { id: 'codex' } },
          'openai/gpt-6.1-sol': { alias: 'vcodex', params: { thinking: 'medium' }, agentRuntime: { id: 'codex' } },
        } },
        'hy-codex': { models: {
          'openai/gpt-5.6-sol': { agentRuntime: { id: 'codex' } },
          'openai/gpt-6-astra': { alias: 'astra', params: { thinking: 'high' }, agentRuntime: { id: 'codex' } },
        } },
        dealclaw: { models: { 'azure-openai/gpt-5.6-sol': {} } },
      },
    },
  };
}

// Mimics `openclaw config set --merge`: objects merge deeply, arrays replace.
function applySets(config, sets) {
  const merge = (t, s) => {
    if (Array.isArray(s) || typeof s !== 'object' || s === null) return s;
    const out = t && typeof t === 'object' && !Array.isArray(t) ? t : {};
    for (const k of Object.keys(s)) out[k] = merge(out[k], s[k]);
    return out;
  };
  for (const { path, value } of sets) {
    const keys = path.split('.');
    const last = keys.pop();
    let o = config;
    for (const k of keys) o = o[k];
    o[last] = merge(o[last], value);
  }
  return config;
}

test('moves /vcodex and /astra to 6.2 and keeps each scope runtime and thinking', () => {
  const c = gatewayLike();
  const codex = '/opt/codex-0.169.1-v/codex';
  applySets(c, plan(c, { codexCommand: codex }).sets);
  const v = verify(c, { codexCommand: codex });
  assert.deepEqual(v.problems, []);
  assert.equal(c.agents.defaults.models['openai/gpt-6.2-astra'].agentRuntime.id, 'vlab-worker');
  for (const m of [c.agents.defaults.models, c.agents.entries.makaron.models]) {
    assert.equal(m['openai/gpt-6.2-astra'].params.thinking, 'high');
    assert.equal(m['openai/gpt-6.2-sol'].params.thinking, 'high');
  }
  assert.equal(c.agents.defaults.models['openai/gpt-6-astra'].params.thinking, 'low', 'fallback keeps its level');
  assert.equal(c.agents.defaults.models['openai/gpt-6.1-sol'].params.thinking, 'medium', 'fallback keeps its level');
  assert.equal(c.agents.entries.makaron.models['openai/gpt-6.1-sol'].alias, 'vcodex61');
  assert.equal(c.agents.entries['hy-codex'].models['openai/gpt-6-astra'].alias, 'astra60');
  assert.equal(c.agents.entries['hy-codex'].models['openai/gpt-6.2-sol'], undefined, 'hy-codex never had /vcodex');
  assert.equal(c.agents.defaults.models['openai/gpt-6-sol'].alias, 'vcodex60', 'other aliases untouched');
  assert.deepEqual(c.models.providers.openai.models.map((m) => m.id), ['gpt-6.1-terra', 'gpt-6-luna', 'gpt-6.2-sol', 'gpt-6.2-astra']);
  assert.equal(c.plugins.entries.codex.config.appServer.mode, 'yolo', 'appServer merge keeps other keys');
  assert.equal(c.plugins.entries.codex.config.appServer.command, codex);
});

test('/terra moves to the Codex harness at thinking high; /terra56 stays', () => {
  for (const shape of ['vlab-worker', 'openclaw']) {
    const c = gatewayLike(shape);
    applySets(c, plan(c).sets);
    assert.deepEqual(c.agents.defaults.models['openai/gpt-6.1-terra'], { alias: 'terra', params: { thinking: 'high' }, agentRuntime: { id: 'codex' } });
    assert.equal(c.agents.defaults.models['openai/gpt-5.6-terra'].agentRuntime.id, shape);
    assert.equal(c.agents.defaults.models['openai/gpt-5.6-terra'].params.thinking, 'medium');
    assert.deepEqual(verify(c).problems, []);
  }
  const odd = gatewayLike();
  odd.agents.defaults.models['openai/gpt-6.1-terra'].alias = 'x';
  odd.agents.defaults.models['openai/gpt-5.6-terra'].alias = 'terra';
  assert.throws(() => plan(odd), /\/terra points at openai\/gpt-5.6-terra/);
});

test('worker shape keeps its own runtime id', () => {
  const c = gatewayLike('openclaw');
  applySets(c, plan(c).sets);
  assert.equal(c.agents.defaults.models['openai/gpt-6.2-astra'].agentRuntime.id, 'openclaw');
  assert.deepEqual(verify(c).problems, []);
});

test('a config migrated before the thinking change is raised to high', () => {
  const c = gatewayLike();
  applySets(c, plan(c).sets);
  c.agents.defaults.models['openai/gpt-6.2-astra'].params.thinking = 'low';
  c.agents.entries.makaron.models['openai/gpt-6.2-sol'].params.thinking = 'medium';
  assert.deepEqual(verify(c).problems.length, 2);
  applySets(c, plan(c).sets);
  assert.deepEqual(verify(c).problems, []);
  assert.equal(c.agents.defaults.models['openai/gpt-6.2-astra'].agentRuntime.id, 'vlab-worker');
});

test('second run is a no-op', () => {
  const c = gatewayLike();
  applySets(c, plan(c, { codexCommand: '/x/codex' }).sets);
  assert.deepEqual(plan(c, { codexCommand: '/x/codex' }).sets, []);
});

test('refuses when the alias points somewhere unexpected or the fallback alias is taken', () => {
  const odd = gatewayLike();
  odd.agents.entries.makaron.models['openai/gpt-6.1-sol'].alias = 'other';
  odd.agents.entries.makaron.models['openai/gpt-5.6-sol'] = { alias: 'VCODEX' };
  assert.throws(() => plan(odd), /\/vcodex points at openai\/gpt-5.6-sol/);
  const taken = gatewayLike();
  taken.agents.defaults.models['openai/gpt-5.6-sol'] = { alias: 'vcodex61' };
  assert.throws(() => plan(taken), /alias vcodex61 already used/);
});

test('provider rows declare the subscription route and only Codex-listed efforts', () => {
  for (const row of Object.values(ROWS)) {
    assert.equal(row.api, 'openai-chatgpt-responses');
    assert.deepEqual(row.compat.supportedReasoningEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  }
});

test('revert hands the plain aliases back to the old models', () => {
  const c = gatewayLike();
  applySets(c, plan(c).sets);
  applySets(c, revert(c).sets);
  assert.equal(c.agents.entries.makaron.models['openai/gpt-6.1-sol'].alias, 'vcodex');
  assert.equal(c.agents.entries.makaron.models['openai/gpt-6.2-sol'].alias, 'vcodex62');
  assert.equal(c.agents.defaults.models['openai/gpt-6-astra'].alias, 'astra');
});
