import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const core = process.argv[2];
assert(core && path.isAbsolute(core));
const dist = path.join(core, 'dist');
const names = fs.readdirSync(dist);
function source(prefix) {
  const pattern = new RegExp(`^${prefix.replaceAll('.', '\\.')}[A-Za-z0-9_-]{8}\\.js$`);
  const matches = names.filter(n => pattern.test(n));
  assert.equal(matches.length, 1);
  return fs.readFileSync(path.join(dist, matches[0]), 'utf8');
}
const authSource = source('command-auth-');
const authFunction = authSource.match(/function resolveCommandSenderAuthorization\(params\) \{[\s\S]*?\n\}/);
assert(authFunction);
const resolve = vm.runInNewContext(`${authFunction[0]}; resolveCommandSenderAuthorization`, {
  hasWildcardAllowFrom: list => list.includes('*'),
});
const base = { enforceOwnerForCommands: false, isOwnerForCommands: true, commandsAllowFromList: ['*'],
  providerResolutionError: false, commandsAllowFromConfigured: true, senderCandidates: ['feishu:ou_test'],
  providerId: 'feishu', senderIsOwner: false, commandAuthorized: true };
assert.equal(resolve({ ...base, commandText: '/model vds' }), 'commands');
assert.equal(resolve({ ...base, commandText: '/model status' }), 'commands');
assert.equal(resolve({ ...base, commandText: '/model vcc' }), 'commands'); // model guard handles the target
for (const commandText of ['/restart', '/config get gateway', '/bash ls', '/vcc', 'hi /model vds'])
  assert.equal(resolve({ ...base, commandText }), 'reset-only', commandText);
assert.equal(resolve({ ...base, senderIsOwner: true, commandText: '/restart' }), 'commands');
assert.equal(resolve({ ...base, commandsAllowFromList: ['feishu:someone_else'], commandText: '/model vds' }), 'denied');
assert.equal(resolve({ ...base, providerId: 'telegram', senderIsOwner: false, commandText: '/restart' }), 'commands');

const cfg = { agents: { defaults: { models: {
  'openai/gpt-5.6-sol': { alias: 'vcodex' },
  'anthropic/claude-opus-5-5': { alias: 'vcc' },
  'deepseek/vds-deepseek-flash': { alias: 'vds' },
  'azure-openai/gpt-5.6-sol': { alias: 'gpt5.6' },
} } } };
for (const prefix of ['get-reply-', 'directive-handling.impl-']) {
  const text = source(prefix);
  const fn = text.match(/function isFeishuOwnerOnlyModelSelection\(cfg, agentId, selection\) \{[\s\S]*?\n\}/);
  assert(fn);
  const blocked = vm.runInNewContext(`${fn[0]}; isFeishuOwnerOnlyModelSelection`);
  assert.equal(blocked(cfg, 'makaron', { provider: 'openai', model: 'gpt-5.6-sol' }), true);
  assert.equal(blocked(cfg, 'makaron', { provider: 'anthropic', model: 'claude-opus-5-5' }), true);
  assert.equal(blocked(cfg, 'makaron', { provider: 'deepseek', model: 'vds-deepseek-flash' }), false);
  assert.equal(blocked(cfg, 'makaron', { provider: 'azure-openai', model: 'gpt-5.6-sol' }), false);
  assert.equal(blocked(cfg, 'makaron', { provider: 'x', model: 'y', alias: 'vcc' }), true);
  assert(text.includes(prefix === 'get-reply-' ? 'ctx.Provider === "feishu"' : 'params.messageProvider === "feishu"'));
}
console.log('feishu model-switch policy assertions passed');
