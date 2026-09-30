import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {configureVcodex, target} from '../release-files/vcodex-sol61/config.mjs';
import {patchContract, patchSubscriptionProvider} from '../release-files/vcodex-sol61/patch.mjs';

const root = process.env.VLAB_CANDIDATE_RUNTIME;
test('patched runtime admits Sol 6.1 subscription route and supported reasoning', async () => {
  assert(root, 'Run through candidate');
  const contract = await import(`${root}/openclaw/dist/model-route-contract-B2Q_03Gg.js`);
  assert(contract._('gpt-6.1-sol'));
  assert(contract.t.includes('gpt-6.1-sol'));
  assert.deepEqual(contract.x('gpt-6.1-sol'), ['low','medium','high','xhigh','max']);
  assert.deepEqual(contract.x('gpt-6.1-sol', ['none','minimal','medium','ultra']), ['low','medium','high','xhigh','max']);
  for (const id of ['gpt-6-sol','gpt-6-luna','gpt-6-astra','gpt-5.6-sol']) assert(contract._(id));
  const provider = await import(`${root}/openclaw/dist/openai-chatgpt-provider-BApw3_oy.js`);
  const hooks = provider.n();
  const model = hooks.resolveDynamicModel({modelId: 'gpt-6.1-sol', modelRegistry: {find: () => undefined}});
  assert.equal(model.id, 'gpt-6.1-sol');
  assert.equal(model.api, 'openai-chatgpt-responses');
  assert.equal(model.contextWindow, 1050000);
  assert.equal(model.contextTokens, 272000);
  assert.equal(model.maxTokens, 128000);
  assert.equal(model.cost.cacheRead, 0.1);
  assert.equal(model.thinkingLevelMap.off, 'low');
  assert.equal(model.thinkingLevelMap.minimal, 'low');
  assert.equal(model.compat.codeMode, 'preferred');
  for (const [name, patch] of [['model-route-contract-B2Q_03Gg.js',patchContract],['openai-chatgpt-provider-BApw3_oy.js',patchSubscriptionProvider]]) {
    const src = fs.readFileSync(path.join(root, 'openclaw/dist', name), 'utf8');
    assert.equal(patch(src), src, 'Patch must be idempotent');
  }
});

test('real candidate configuration moves alias once and preserves other settings', () => {
  const original = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
  const configured = configureVcodex(original);
  assert.deepEqual(configured.channels, original.channels);
  assert.deepEqual(configured.plugins, original.plugins);
  assert.deepEqual(configured.agents.defaults.model, original.agents.defaults.model);
  assert.deepEqual(configureVcodex(configured), configured);
  assert.equal(configured.agents.entries.makaron.models[target].alias, 'vcodex');
  assert.equal(configured.agents.entries.makaron.models[target].agentRuntime.id, 'codex');
  const client = configureVcodex(original,{codexCommand:'/private/codex-0.159.2/bin/codex'});
  assert.equal(client.plugins.entries.codex.config.appServer.command,'/private/codex-0.159.2/bin/codex');
  assert.equal(client.plugins.entries.codex.config.appServer.mode,original.plugins.entries.codex.config.appServer.mode);
  assert.throws(()=>configureVcodex(original,{codexCommand:'codex'}),/absolute/);
  for (const ref of ['openai/gpt-5.6-sol','openai/gpt-6-sol']) {
    if (original.agents.defaults.models[ref]?.alias === 'vcodex') assert.notEqual(configured.agents.defaults.models[ref].alias,'vcodex');
  }
  const denied = structuredClone(original);
  denied.agents.defaults.modelPolicy.allow = ['deepseek/*'];
  assert.throws(() => configureVcodex(denied), /not admitted/);
  for (const old of ['openai/gpt-5.6-sol','openai/gpt-6-sol']) {
    const fixture = {agents:{defaults:{modelPolicy:{allow:['openai/*']},models:{[old]:{alias:'vcodex',params:{thinking:'high',custom:true},agentRuntime:{id:'codex'}}}}}};
    const next = configureVcodex(fixture);
    assert.equal(next.agents.defaults.models[target].params.custom,true);
    assert.deepEqual(configureVcodex(next),next);
    fixture.agents.defaults.models['openai/custom'] = {alias: old.includes('5.6') ? 'vcodex56' : 'vcodex60'};
    assert.throws(() => configureVcodex(fixture), /occupied/);
  }
});
