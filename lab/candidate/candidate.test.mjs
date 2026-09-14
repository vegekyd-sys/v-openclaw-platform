import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildRequest} from './client.mjs';
import {fixtureConfig, privateConfig} from './runner.mjs';

test('candidate payload binds dirty worktree bytes and rejects paths outside it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-input-'));
  try {
    fs.writeFileSync(root + '/test.mjs', 'first');
    const a = buildRequest(root, {tests: ['test.mjs']}, 'test-owner');
    fs.writeFileSync(root + '/test.mjs', 'second');
    const b = buildRequest(root, {tests: ['test.mjs']}, 'test-owner');
    assert.notEqual(a.inputSha256, b.inputSha256);
    fs.symlinkSync('/etc/hosts', root + '/outside');
    assert.throws(() => buildRequest(root, {tests: ['outside']}, 'test-owner'));
    assert.throws(() => buildRequest(root, {tests: ['test.mjs']}, ''));
  } finally {fs.rmSync(root, {recursive: true});}
});

test('real settings survive fixture projection while credentials and active integrations do not', () => {
  const config = {gateway: {port: 24993, auth: {token: 'secret-token'}}, agents: {
    defaults: {maxConcurrent: 15, workspace: '/live/workspace', model: {primary: 'provider/model'}},
    entries: {makaron: {agentDir: '/live/state/agents/makaron/agent'}}},
    models: {providers: {p: {apiKey: '${PROVIDER_KEY}', maxTokens: 4096, baseUrl: 'https://user:password@example.test'}}},
    plugins: {entries: {worker: {config: {maxWorkers: 15}}}}, channels: {feishu: {appSecret: 'another-secret'}},
    cron: {enabled: true}, browser: {enabled: true}};
  const fixture = fixtureConfig(config), privateCopy = privateConfig(config, '/live/state');
  assert.equal(fixture.plugins.entries.worker.config.maxWorkers, 15);
  assert.equal(fixture.models.providers.p.maxTokens, 4096);
  assert(!JSON.stringify(fixture).includes('secret-token'));
  assert(!JSON.stringify(fixture).includes('PROVIDER_KEY'));
  assert(!JSON.stringify(fixture).includes('user:password'));
  assert.equal(privateCopy.agents.defaults.maxConcurrent, 15);
  assert.equal(privateCopy.agents.entries.makaron.agentDir, '/data/state/agents/makaron/agent');
  assert.deepEqual(privateCopy.channels, {});
  assert.equal(privateCopy.cron.enabled, false);
  assert.equal(privateCopy.browser.enabled, false);
  assert.equal(config.gateway.port, 24993);
});
