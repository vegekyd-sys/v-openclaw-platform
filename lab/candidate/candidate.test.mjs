import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildRequest} from './client.mjs';
import {fixtureConfig, privateConfig} from './runner.mjs';

test('candidate payload binds exact bytes and supports agent-selected external inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-input-'));
  try {
    fs.writeFileSync(root + '/test.mjs', 'first');
    const a = buildRequest(root, {tests: ['test.mjs']}, 'test-owner');
    fs.writeFileSync(root + '/test.mjs', 'second');
    const b = buildRequest(root, {tests: ['test.mjs']}, 'test-owner');
    assert.notEqual(a.inputSha256, b.inputSha256);
    fs.symlinkSync('/etc/hosts', root + '/outside');
    assert.match(buildRequest(root, {tests: ['outside']}).tests[0], /^external\//);
    assert.equal(buildRequest(root, {tests: ['test.mjs']}).timeoutSeconds, 0);
    const command = buildRequest(root, {command: ['python3', '-c', 'print(1)'], timeoutSeconds: 3600, env: {CUSTOM: 'value'}});
    assert.deepEqual(command.command, ['python3', '-c', 'print(1)']);
    assert.equal(command.timeoutSeconds, 3600);
    assert.equal(command.env.CUSTOM, 'value');
  } finally {fs.rmSync(root, {recursive: true});}
});

test('execution preserves provider credentials and integrations while diagnostic fixture stays redacted', () => {
  const config = {gateway: {port: 24993, auth: {token: 'secret-token'}}, agents: {
    defaults: {maxConcurrent: 15, workspace: '/live/workspace', model: {primary: 'provider/model'}},
    entries: {makaron: {agentDir: '/live/state/agents/makaron/agent'}}},
    models: {providers: {p: {apiKey: '${PROVIDER_KEY}', maxTokens: 4096, baseUrl: 'https://user:password@example.test'}}},
    plugins: {entries: {worker: {config: {maxWorkers: 15}}}}, channels: {feishu: {appSecret: 'another-secret'}},
    cron: {enabled: true}, browser: {enabled: true}};
  const fixture = fixtureConfig(config), privateCopy = privateConfig(config, '/live/state', '/data', '/runtime', 26400);
  assert.equal(fixture.plugins.entries.worker.config.maxWorkers, 15);
  assert.equal(fixture.models.providers.p.maxTokens, 4096);
  assert(!JSON.stringify(fixture).includes('secret-token'));
  assert(!JSON.stringify(fixture).includes('PROVIDER_KEY'));
  assert(!JSON.stringify(fixture).includes('user:password'));
  assert.equal(privateCopy.agents.defaults.maxConcurrent, 15);
  assert.equal(privateCopy.agents.entries.makaron.agentDir, '/data/state/agents/makaron/agent');
  assert.deepEqual(privateCopy.channels, config.channels);
  assert.deepEqual(privateCopy.plugins, config.plugins);
  assert.equal(privateCopy.models.providers.p.apiKey, '${PROVIDER_KEY}');
  assert.equal(privateCopy.gateway.auth.token, 'secret-token');
  assert.equal(privateCopy.cron.enabled, true);
  assert.equal(privateCopy.browser.enabled, true);
  assert.equal(config.gateway.port, 24993);
});
