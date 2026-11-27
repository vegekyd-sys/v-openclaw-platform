// The config generator writes references, never values, and the two profiles
// differ only where CONTRACT.md section 4 says.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfig, codexHomeToml, parseEnvFile } from './openclaw-config.mjs';

const SECRET_VALUES = {
  DEEPSEEK_API_KEY: 'sk-deepseek-test-value-0001',
  FEISHU_APP_SECRET: 'feishu-secret-test-value-0002',
  GOOGLE_API_KEY: 'google-test-value-0003',
  XAI_API_KEY: 'xai-test-value-0004',
  AI_GATEWAY_API_KEY: 'aigw-test-value-0005',
  OPENCLAW_GATEWAY_TOKEN: 'gateway-token-test-0006',
};
const base = { releaseDir: '/opt/v/current', stateDir: '/home/openclaw/.openclaw', workspace: '/home/openclaw/.openclaw/workspace' };
const make = (env, extra = {}) => createConfig({ profile: 'standalone', ...base, env: { V_OWNER_NAME: '王总', ...SECRET_VALUES, ...env }, codexCommand: '/opt/v/tools/codex/bin/codex', ...extra });

test('no secret value ever appears in the output, only ${NAME} references', () => {
  for (const cfg of [make({ FEISHU_APP_ID: 'cli_test', V_OWNER_FEISHU_OPEN_ID: 'ou_test' }), make({ V_MODEL_PRESET: 'vercel' }), make({}, { profile: 'sandbox' })]) {
    const text = JSON.stringify(cfg);
    for (const value of Object.values(SECRET_VALUES)) assert.ok(!text.includes(value), `leaked ${value}`);
    assert.ok(!text.includes('cli_test'), 'app id is a reference too');
  }
  const cfg = make({ FEISHU_APP_ID: 'cli_test' });
  assert.equal(cfg.gateway.auth.token, '${OPENCLAW_GATEWAY_TOKEN}');
  assert.equal(cfg.models.providers.deepseek.apiKey, '${DEEPSEEK_API_KEY}');
  assert.equal(cfg.channels.feishu.appSecret, '${FEISHU_APP_SECRET}');
  assert.equal(cfg.memory.search.remote.apiKey, '${GOOGLE_API_KEY}');
});

test('standalone deepseek is V: /vds Codex first, Worker pool fallback, V model limits, loopback Gateway', () => {
  const cfg = make({});
  assert.deepEqual(cfg.agents.defaults.model, { primary: 'deepseek/vds-deepseek-flash', fallbacks: ['deepseek/deepseek-flash'] });
  assert.equal(cfg.agents.defaults.models['deepseek/vds-deepseek-flash'].agentRuntime.id, 'codex');
  assert.equal(cfg.agents.defaults.models['deepseek/deepseek-flash'].agentRuntime.id, 'vlab-worker');
  const flash = cfg.models.providers.deepseek.models.find((m) => m.id === 'deepseek-flash');
  assert.equal(flash.contextWindow, 980000);
  assert.equal(flash.maxTokens, 64000);
  assert.equal(cfg.gateway.bind, 'loopback');
  assert.equal(cfg.plugins.entries.codex.config.appServer.command, '/opt/v/tools/codex/bin/codex');
  assert.equal(cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath, '/home/openclaw/.openclaw/worker-openclaw.json');
  assert.equal(cfg.plugins.entries['v-session-relay'].config.ownerName, '王总');
  assert.ok(cfg.plugins.load.paths.includes('/opt/v/current/plugins/worker'));
  assert.deepEqual(cfg.agents.entries, { makaron: { workspace: base.workspace, identity: { name: 'V' } } });
  assert.equal(cfg.agents.defaults.compaction.provider, 'versa-fast-quality-v1');
  assert.deepEqual(cfg.agents.defaults.compaction.qualityGuard, { enabled: true, maxRetries: 1 });
  assert.equal(cfg.plugins.entries['vlab-agent-worker-isolation'].config.fastCompactionMaxQualityRetries, 1);
  assert.equal(cfg.agents.list, undefined);
  assert.equal(cfg.channels, undefined, 'no Feishu app, no channel');
  assert.deepEqual(cfg.tools.deny, []);
  assert.equal(cfg.memory.search.provider, 'gemini');
});

test('without the codex CLI the Worker pool is primary; without Google, memory search is keyword-only', () => {
  const cfg = make({ GOOGLE_API_KEY: '' }, { codexCommand: null });
  assert.deepEqual(cfg.agents.defaults.model, { primary: 'deepseek/deepseek-flash' });
  assert.ok(!cfg.plugins.allow.includes('codex'));
  assert.equal(cfg.memory.search.provider, 'none');
  assert.equal(cfg.memory.search.store.fts.tokenizer, 'trigram');
});

test('Feishu: owner open_id gives an allowlist and owner; without it the first DM pairs', () => {
  const owner = make({ FEISHU_APP_ID: 'cli_x', V_OWNER_FEISHU_OPEN_ID: 'ou_abc123' });
  assert.equal(owner.channels.feishu.dmPolicy, 'allowlist');
  assert.deepEqual(owner.channels.feishu.allowFrom, ['ou_abc123']);
  assert.deepEqual(owner.commands.ownerAllowFrom, ['feishu:ou_abc123']);
  assert.equal(owner.channels.feishu.connectionMode, 'websocket');
  assert.ok(owner.plugins.allow.includes('feishu'));
  assert.deepEqual(owner.plugins.load.paths, ['/opt/v/current/plugins/worker', '/opt/v/current/plugins/session-relay', '/opt/v/current/plugins/deepseek-web'], 'official plugins never load by path (untrusted origin); only V\'s own do');
  assert.ok(owner.plugins.allow.includes('v-deepseek-web'), 'the deepseek web_search provider comes from V\'s plugin');
  assert.equal(owner.tools.web.search.provider, 'deepseek');
  const vercel = make({ V_MODEL_PRESET: 'vercel' });
  assert.ok(!vercel.plugins.load.paths.some((p) => p.endsWith('deepseek-web')));
  // Task rooms: in groups only the owner's messages come in, no @ needed. groupAllowFrom would gate
  // chat ids (oc_...), so an open_id there would shut every group.
  assert.equal(owner.channels.feishu.groupPolicy, 'open');
  assert.deepEqual(owner.channels.feishu.groupSenderAllowFrom, ['ou_abc123']);
  assert.equal(owner.channels.feishu.groupAllowFrom, undefined);
  assert.equal(owner.channels.feishu.requireMention, false);
  const pairing = make({ FEISHU_APP_ID: 'cli_x' });
  assert.equal(pairing.channels.feishu.dmPolicy, 'pairing');
  assert.equal(pairing.channels.feishu.groupPolicy, 'disabled', 'no known owner, no groups');
  assert.equal(pairing.channels.feishu.requireMention, true);
  assert.equal(pairing.commands.ownerAllowFrom, undefined);
  assert.throws(() => make({ FEISHU_APP_ID: 'cli_x', V_OWNER_FEISHU_OPEN_ID: 'not-an-id' }), /ou_/);
});

test('sandbox profile: no channel even with a Feishu app, sandbox-only tool denies, same runtime', () => {
  const s = make({ FEISHU_APP_ID: 'cli_x' }, { profile: 'sandbox' });
  const a = make({ FEISHU_APP_ID: 'cli_x' });
  assert.equal(s.channels, undefined);
  assert.ok(!s.plugins.allow.includes('feishu'));
  for (const tool of ['gateway', 'cron', 'ask_user', 'sessions_yield', 'message']) assert.ok(s.tools.deny.includes(tool), tool);
  assert.ok(!a.tools.deny.includes('message'), 'standalone keeps message: it has the Feishu channel');
  assert.deepEqual(s.gateway.reload, { mode: 'off' }, 'a sandbox never hot-reloads');
  assert.equal(a.gateway.reload, undefined, 'standalone keeps OpenClaw\'s default reload');
  assert.deepEqual(s.agents.defaults.model, a.agents.defaults.model);
  assert.deepEqual(s.plugins.entries['vlab-agent-worker-isolation'], a.plugins.entries['vlab-agent-worker-isolation']);
  assert.throws(() => make({}, { profile: 'cloud' }), /profile must be one of/);
});

test('vercel preset runs DeepSeek through the Worker pool only', () => {
  const cfg = make({ V_MODEL_PRESET: 'vercel' });
  assert.equal(cfg.models.providers.deepseek, undefined);
  assert.equal(cfg.models.providers.aigw.apiKey, '${AI_GATEWAY_API_KEY}');
  assert.match(cfg.agents.defaults.model.primary, /^aigw\//);
  assert.ok(!cfg.plugins.allow.includes('codex'));
  assert.throws(() => make({ V_MODEL_PRESET: 'other' }), /V_MODEL_PRESET/);
});

test('codex home toml trusts the workspace and reads the DeepSeek key by name', () => {
  const toml = codexHomeToml('/home/openclaw/.openclaw/workspace');
  assert.match(toml, /\[projects\."\/home\/openclaw\/\.openclaw\/workspace"\]/);
  assert.match(toml, /env_key = "DEEPSEEK_API_KEY"/);
  assert.ok(!/sk-/.test(toml));
});

test('env file parser: comments, export, quotes', () => {
  assert.deepEqual(parseEnvFile('# x\nexport A=1\nB="two words"\nC=\'3\'\nbad line\n'), { A: '1', B: 'two words', C: '3' });
});

test('voice transcription only with a Volcengine key: a CLI media model, as on V', () => {
  assert.equal(make({}).tools.media, undefined);
  const cfg = make({ VOLCENGINE_API_KEY: 'volc-test-value' });
  assert.ok(!JSON.stringify(cfg).includes('volc-test-value'));
  assert.equal(cfg.tools.media.audio.enabled, true);
  assert.deepEqual(cfg.tools.media.models[0], { type: 'cli', command: '/opt/v/node/current/bin/node', args: ['/opt/v/current/install/lib/v-asr-volcengine.mjs', '{{MediaPath}}'], timeoutSeconds: 60, language: 'zh', capabilities: ['audio'] });
});

test('desktop only with V_DESKTOP=1: host display, headed Chrome, takeover plugin, computer tool; control links go to the owner only', () => {
  const off = make({ FEISHU_APP_ID: 'cli_x', V_OWNER_FEISHU_OPEN_ID: 'ou_abc' });
  assert.equal(off.desktop, undefined);
  assert.equal(off.browser, undefined);
  assert.ok(!off.plugins.allow.includes('cua-computer'));
  const on = make({ FEISHU_APP_ID: 'cli_x', V_OWNER_FEISHU_OPEN_ID: 'ou_abc', V_DESKTOP: '1' });
  assert.deepEqual(on.desktop.host, { enabled: true, port: 5900, passwordFile: '/home/openclaw/.openclaw/desktop/vnc-password.txt' });
  assert.equal(on.browser.headless, false);
  assert.equal(on.browser.defaultProfile, 'openclaw');
  assert.equal(on.browser.profiles, undefined, 'the built-in managed profile must not be declared');
  for (const id of ['v-desktop-handoff', 'cua-computer']) assert.ok(on.plugins.allow.includes(id), id);
  assert.ok(on.plugins.load.paths.includes('/opt/v/current/plugins/desktop-handoff'));
  assert.deepEqual(on.tools.alsoAllow, ['computer']);
  const h = on.plugins.entries['v-desktop-handoff'].config;
  assert.equal(h.controlAnywhere, false);
  assert.deepEqual(h.controlAnywhereActors, ['feishu:ou_abc']);
  assert.equal(h.openclawCommand, '/opt/v/bin/openclaw');
  assert.equal(h.adminTokenFile, '/etc/v/desktop-handoff/admin-token');
});

test('Feishu app scope import file: the console\'s batch-import format, both identities, covers line B\'s user list', async () => {
  const fs = await import('node:fs');
  const file = JSON.parse(fs.readFileSync(new URL('../feishu-app-scopes.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(file), ['scopes']);
  assert.deepEqual(Object.keys(file.scopes).sort(), ['tenant', 'user']);
  for (const id of ['tenant', 'user']) {
    const list = file.scopes[id];
    assert.deepEqual([...list].sort(), list, `${id} sorted`);
    assert.equal(new Set(list).size, list.length, `${id} has no duplicates`);
    for (const s of list) assert.match(s, /^[a-z0-9_.:-]+$/, s);
    for (const s of ['bitable:app', 'sheets:spreadsheet']) assert.ok(list.includes(s), `${id} ${s}`);
  }
  // What the channel itself needs from the bot: receive DMs and group @s, send, react, read files.
  for (const s of ['im:message.p2p_msg:readonly', 'im:message.group_at_msg:readonly', 'im:message:send_as_bot', 'im:message.reactions:write_only', 'im:resource']) assert.ok(file.scopes.tenant.includes(s), s);
  const bList = new URL('../../workspace/feishu-user-scopes.txt', import.meta.url);
  if (fs.existsSync(bList)) {
    const want = fs.readFileSync(bList, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    // auth:user.id:read comes with every OAuth login; the console refuses it in an import (the whole import then stalls).
    const oauthDefault = ['auth:user.id:read'];
    for (const s of oauthDefault) assert.ok(!file.scopes.user.includes(s), `${s} must not be in the import`);
    assert.deepEqual(want.filter((s) => !file.scopes.user.includes(s) && !oauthDefault.includes(s)), [], 'every user scope V was granted is in the import');
  }
});

test('Night Shift only with V_NIGHTSHIFT_URL: workboard and nightshift-feishu pointed at the service', () => {
  const off = make({});
  assert.ok(!off.plugins.allow.includes('nightshift-feishu') && !off.plugins.allow.includes('workboard'));
  assert.equal(off.plugins.entries['nightshift-feishu'], undefined);
  const on = make({ V_NIGHTSHIFT_URL: 'http://127.0.0.1:24879' });
  for (const id of ['workboard', 'nightshift-feishu']) assert.ok(on.plugins.allow.includes(id), id);
  assert.ok(on.plugins.load.paths.includes('/opt/v/current/plugins/nightshift-feishu'));
  assert.deepEqual(on.plugins.entries['nightshift-feishu'], { enabled: true, config: { baseUrl: 'http://127.0.0.1:24879' } });
  assert.throws(() => make({ V_NIGHTSHIFT_URL: 'ftp://x' }), /http or https/);
});
