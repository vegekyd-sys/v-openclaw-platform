import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CHANNELS, TELEGRAM_OWNER, VLAB_DINGTALK_CARD_TEMPLATE, assertCommandAuthV3, envNames, productionConfig, vlabConfig, vlabDropins, PRODUCTION_DINGTALK_CARD_TEMPLATE, productionDropins} from './config.mjs';

// Shapes of the two configs on 2026-10-05 (non-secret keys only; credentials replaced).
const v = () => ({
  gateway: {port: 22793, auth: {mode: 'token', token: 'x'.repeat(48)}},
  commands: {native: 'auto', nativeSkills: 'auto', restart: true, allowFrom: {feishu: ['*']}, ownerAllowFrom: ['feishu:ou_owner', 'telegram:1']},
  channels: {
    'dingtalk-connector': {enabled: true, clientId: 'prod-id', clientSecret: 'prod-secret', dmPolicy: 'open', allowFrom: ['*']},
    feishu: {enabled: true}, msteams: {enabled: true}, slack: {enabled: true},
    telegram: {enabled: true, botToken: 'prod-token', dmPolicy: 'allowlist', allowFrom: ['1']},
    wecom: {enabled: true, botId: 'prod-bot', secret: 'prod-secret', dmPolicy: 'open'},
  },
  bindings: [{agentId: 'main', match: {channel: 'dingtalk-connector'}}],
  plugins: {allow: ['dingtalk-connector', 'feishu', 'telegram', 'wecom-openclaw-plugin'], entries: {'dingtalk-connector': {enabled: true}}},
});
const vlab = () => ({
  gateway: {port: 24993, auth: {token: '${VLAB_GATEWAY_TOKEN}'}, reload: {mode: 'off'}},
  commands: {allowFrom: {feishu: ['*']}, ownerAllowFrom: ['feishu:ou_vlab_owner']},
  channels: {feishu: {enabled: true, appId: '${VLAB_FEISHU_APP_ID}'}},
  bindings: [{agentId: 'makaron', match: {channel: 'feishu'}}],
  plugins: {allow: ['dingtalk-connector', 'feishu', 'telegram', 'wecom-openclaw-plugin'],
    entries: {'dingtalk-connector': {enabled: true}, 'wecom-openclaw-plugin': {enabled: true, hooks: {allowConversationAccess: true}}},
    load: {paths: ['/a', '/b']}},
});
const SECRETS = ['VLAB_DINGTALK_TEST_CLIENT_ID', 'VLAB_DINGTALK_TEST_CLIENT_SECRET', 'VLAB_WECOM_TEST_BOT_ID', 'VLAB_WECOM_TEST_SECRET', 'VLAB_TELEGRAM_TEST_BOT_TOKEN', 'OTHER'];

test('production V: only commands.allowFrom changes, owners and channels stay', () => {
  const before = v();
  const {config, changed} = productionConfig(before);
  assert.equal(changed, true);
  const expected = v();
  expected.commands.allowFrom = {feishu: ['*'], telegram: ['*'], 'dingtalk-connector': ['*'], wecom: ['*']};
  assert.deepEqual(config, expected);
  assert.deepEqual(before, v(), 'input is not mutated');
  assert.deepEqual(productionConfig(config), {config, changed: false}, 'idempotent');
});

test('production V: refuses an unexpected starting point', () => {
  const noFeishu = v(); noFeishu.commands.allowFrom = {};
  assert.throws(() => productionConfig(noFeishu), /feishu/);
  const other = v(); other.commands.allowFrom.wecom = ['someone'];
  assert.throws(() => productionConfig(other), /already set to something else/);
  const noChannel = v(); delete noChannel.channels.wecom;
  assert.throws(() => productionConfig(noChannel), /channels.wecom is not configured/);
});

test('VLab: test robots by ${ENV} reference only, bindings to makaron, command roles, Telegram owner', () => {
  const {config, changed} = vlabConfig(vlab(), {secrets: SECRETS});
  assert.equal(changed, true);
  const text = JSON.stringify(config);
  for (const prod of ['prod-id', 'prod-secret', 'prod-token', 'prod-bot']) assert(!text.includes(prod));
  assert.deepEqual(config.channels['dingtalk-connector'].clientId, '${VLAB_DINGTALK_TEST_CLIENT_ID}');
  assert.deepEqual(config.channels['dingtalk-connector'].clientSecret, '${VLAB_DINGTALK_TEST_CLIENT_SECRET}');
  assert.deepEqual([config.channels.wecom.botId, config.channels.wecom.secret], ['${VLAB_WECOM_TEST_BOT_ID}', '${VLAB_WECOM_TEST_SECRET}']);
  assert.equal(config.channels.telegram.botToken, '${VLAB_TELEGRAM_TEST_BOT_TOKEN}');
  assert.deepEqual([config.channels.telegram.dmPolicy, config.channels.telegram.allowFrom], ['allowlist', [TELEGRAM_OWNER]]);
  assert.deepEqual([config.channels.wecom.dmPolicy, config.channels['dingtalk-connector'].dmPolicy], ['open', 'open']);
  assert.deepEqual(config.channels.feishu, vlab().channels.feishu, 'Feishu untouched');
  assert.deepEqual(config.bindings, [{agentId: 'makaron', match: {channel: 'feishu'}}, ...CHANNELS.map((c) => ({agentId: 'makaron', match: {channel: c}}))]);
  assert.deepEqual(config.commands.allowFrom, {feishu: ['*'], telegram: ['*'], 'dingtalk-connector': ['*'], wecom: ['*']});
  assert.deepEqual(config.commands.ownerAllowFrom, ['feishu:ou_vlab_owner', `telegram:${TELEGRAM_OWNER}`]);
  assert.equal(config.plugins.entries.telegram.enabled, true);
  assert.deepEqual(config.plugins.entries['wecom-openclaw-plugin'], {enabled: true, hooks: {allowConversationAccess: true}});
  assert.deepEqual(config.plugins.load, vlab().plugins.load);
  assert.deepEqual(vlabConfig(config, {secrets: SECRETS}).config, config, 'idempotent');
});

test('VLab: refuses missing secrets, the production Gateway, literal credentials and foreign bindings', () => {
  assert.throws(() => vlabConfig(vlab(), {secrets: SECRETS.filter((s) => s !== 'VLAB_WECOM_TEST_SECRET')}), /VLAB_WECOM_TEST_SECRET/);
  assert.throws(() => vlabConfig(v(), {secrets: SECRETS}), /shared VLab Gateway/);
  const literal = vlab(); literal.channels.wecom = {botId: 'real-bot', secret: '${X}'};
  assert.throws(() => vlabConfig(literal, {secrets: SECRETS}), /literal credential/);
  const foreign = vlab(); foreign.bindings.push({agentId: 'main', match: {channel: 'telegram'}});
  assert.throws(() => vlabConfig(foreign, {secrets: SECRETS}), /bindings for telegram/);
});

test('VLab drop-ins: question card template always, secrets.env only when the unit lacks it', () => {
  const secretsFile = '/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env';
  assert.deepEqual(vlabDropins({environmentFiles: [secretsFile, '/etc/v-browser/extension-relay.env'], secretsFile}),
    {'97-v-experience-dingtalk-card.conf': `[Service]\nEnvironment=V_DINGTALK_QUESTION_CARD_TEMPLATE=${VLAB_DINGTALK_CARD_TEMPLATE}\n`});
  assert.equal(vlabDropins({environmentFiles: [], secretsFile})['97-v-experience-secrets.conf'], `[Service]\nEnvironmentFile=${secretsFile}\n`);
  assert.deepEqual(envNames('A=1\nexport B="2"\n# C=3\n  D=4\nnot a line\n'), ['A', 'B', 'D']);
});

test('V drop-in: our own question card template, never the public sample', () => {
  const body = productionDropins()['97-v-experience-dingtalk-card.conf'];
  assert.equal(body, `[Service]\nEnvironment=V_DINGTALK_QUESTION_CARD_TEMPLATE=${PRODUCTION_DINGTALK_CARD_TEMPLATE}\n`);
  assert.match(PRODUCTION_DINGTALK_CARD_TEMPLATE, /^[0-9a-f-]{36}\.schema$/);
  assert.notEqual(PRODUCTION_DINGTALK_CARD_TEMPLATE, VLAB_DINGTALK_CARD_TEMPLATE);
});

test('command-auth V3 is required; the shipped V3 chunk passes, V2 and unpatched fail', () => {
  const v3 = fs.readFileSync(fileURLToPath(new URL('../feishu-model-switch-roles/command-auth-DmNN2m2f.js', import.meta.url)), 'utf8');
  assertCommandAuthV3(v3);
  assert.throws(() => assertCommandAuthV3(v3.replaceAll('V_MODEL_COMMAND_ONLY_V3', 'X')), /V3 is not installed/);
  assert.throws(() => assertCommandAuthV3(v3 + '\n// FEISHU_MODEL_COMMAND_ONLY_V2'), /both V2 and V3/);
  assert.throws(() => assertCommandAuthV3(v3.replace('"wecom"', '"x"')), /does not cover wecom/);
});

test('CLI plan prints command roles and channel names, never credentials', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v-experience-multichannel-'));
  try {
    fs.writeFileSync(`${dir}/openclaw.json`, JSON.stringify(v()));
    fs.writeFileSync(`${dir}/vlab.json`, JSON.stringify(vlab()));
    fs.writeFileSync(`${dir}/secrets.env`, SECRETS.map((s) => `${s}=value-${s}`).join('\n'));
    const cli = fileURLToPath(new URL('./config.mjs', import.meta.url));
    const p = JSON.parse(execFileSync(process.execPath, [cli, 'production', `${dir}/openclaw.json`], {encoding: 'utf8'}));
    assert.deepEqual(Object.keys(p.commands), ['feishu', 'telegram', 'dingtalk-connector', 'wecom']);
    const out = execFileSync(process.execPath, [cli, 'vlab', `${dir}/vlab.json`, '--secrets', `${dir}/secrets.env`], {encoding: 'utf8'});
    assert(!out.includes('value-'));
    assert.deepEqual(JSON.parse(out).channels, ['feishu', 'dingtalk-connector', 'wecom', 'telegram']);
    assert.equal(fs.readFileSync(`${dir}/vlab.json`, 'utf8'), JSON.stringify(vlab()), 'plan does not write');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
