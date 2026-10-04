import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const core = process.argv[2];
assert(core && path.isAbsolute(core));
const dist = path.join(core, 'dist');
const matches = fs.readdirSync(dist).filter(name => /^command-auth-[A-Za-z0-9_-]{8}\.js$/.test(name));
assert.equal(matches.length, 1);
const source = fs.readFileSync(path.join(dist, matches[0]), 'utf8');
const authFunction = source.match(/function resolveCommandSenderAuthorization\(params\) \{[\s\S]*?\n\}/);
assert(authFunction);
const resolve = vm.runInNewContext(`${authFunction[0]}; resolveCommandSenderAuthorization`, {
  hasWildcardAllowFrom: list => list.includes('*'),
});
const base = { enforceOwnerForCommands: false, isOwnerForCommands: true, commandsAllowFromList: ['*'],
  providerResolutionError: false, commandsAllowFromConfigured: true, senderCandidates: ['feishu:ou_test'],
  providerId: 'feishu', senderIsOwner: false, commandAuthorized: true };
for (const model of ['vds', 'vcc', 'vcodex', 'ds-flash', 'status', 'openai/gpt-5.6-sol'])
  assert.equal(resolve({ ...base, commandText: `/model ${model}` }), 'commands', model);
for (const commandText of ['/restart', '/config get gateway', '/bash ls', '/vcc', 'hi /model vds', '/modelx vds', '/model vds\n/restart'])
  assert.equal(resolve({ ...base, commandText }), 'reset-only', commandText);
assert.equal(resolve({ ...base, senderIsOwner: true, commandText: '/restart' }), 'commands');
assert.equal(resolve({ ...base, commandsAllowFromList: ['feishu:someone_else'], commandText: '/model vds' }), 'denied');
for (const providerId of ['telegram', 'dingtalk-connector', 'wecom', 'msteams']) {
  assert.equal(resolve({ ...base, providerId, commandText: '/model vcc' }), 'commands', providerId);
  assert.equal(resolve({ ...base, providerId, commandText: '/restart' }), 'reset-only', providerId);
  assert.equal(resolve({ ...base, providerId, senderIsOwner: true, commandText: '/restart' }), 'commands', providerId);
}
// Channels outside the list keep stock behaviour.
assert.equal(resolve({ ...base, providerId: 'slack', commandText: '/restart' }), 'commands');
// Without commands.allowFrom the plugin's CommandAuthorized decides, as in stock 9.1.
const stock = { ...base, commandsAllowFromList: null, commandsAllowFromConfigured: false, providerId: 'wecom', commandText: '/restart' };
assert.equal(resolve({ ...stock, commandAuthorized: false }), 'denied');
assert.equal(resolve({ ...stock, isOwnerForCommands: false }), 'reset-only');
console.log('/model-only command authorization assertions passed');
