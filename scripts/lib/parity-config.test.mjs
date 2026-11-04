import test from 'node:test';
import assert from 'node:assert/strict';
import { compareConfigSwitches, configSwitches } from './parity-config.mjs';
import { evaluateParity } from './parity.mjs';

const SECRET = 'sk-fixture-secret-should-never-appear';

// The shape of the 2026-10-06 finding: V has all three MCP servers off in
// both configs, VLab has voice-memory on in both.
function config({ voiceMemory, extraPlugin = false }) {
  return {
    gateway: { auth: { token: SECRET } },
    mcp: {
      servers: {
        figma: { enabled: false, url: `https://mcp.example.test/${SECRET}` },
        'universal-memory': { enabled: false, command: 'node', args: ['--token', SECRET] },
        'voice-memory': { enabled: voiceMemory, command: 'node', env: { VOICE_MEMORY_TOKEN: SECRET } },
      },
    },
    plugins: {
      load: { paths: ['/opt/x'] },
      entries: {
        feishu: { enabled: true, config: { appSecret: SECRET } },
        'vlab-agent-worker-isolation': { config: { workerConfigPath: '/w.json' } },
        ...(extraPlugin ? { 'v-browser': { enabled: false } } : {}),
      },
    },
  };
}

test('extracts only names and booleans; unset enabled counts as on', () => {
  const s = configSwitches(config({ voiceMemory: true }));
  assert.deepEqual(s, {
    mcp: { figma: false, 'universal-memory': false, 'voice-memory': true },
    plugins: { feishu: true, 'vlab-agent-worker-isolation': true },
    pluginConfig: {},
    channels: {},
    gatewaySettings: { 'gateway.reload.mode': 'hybrid' },
    models: {},
  });
  assert.ok(!JSON.stringify(s).includes(SECRET));
  assert.equal(configSwitches(null), null);
  assert.deepEqual(configSwitches({}), { mcp: {}, plugins: {}, pluginConfig: {}, channels: {}, gatewaySettings: { 'gateway.reload.mode': 'hybrid' }, models: {} });
  assert.deepEqual(configSwitches({ mcp: { servers: { a: null, b: 'x' } } }).mcp, { a: true, b: true });
});

test('voice-memory on in VLab, off on V: one advisory finding per config', () => {
  const v = { gateway: configSwitches(config({ voiceMemory: false })), worker: configSwitches(config({ voiceMemory: false })) };
  const vlab = { gateway: configSwitches(config({ voiceMemory: true })), worker: configSwitches(config({ voiceMemory: true })) };
  const { compared, findings } = compareConfigSwitches({ v, vlab });
  assert.equal(compared, 12);
  assert.deepEqual(findings, [
    { target: 'gateway: mcp.servers.voice-memory.enabled', component: 'config', kind: 'config-differs', v: 'false', vlab: 'true', advisory: true },
    { target: 'worker: mcp.servers.voice-memory.enabled', component: 'config', kind: 'config-differs', v: 'false', vlab: 'true', advisory: true },
  ]);
  assert.ok(!JSON.stringify(findings).includes(SECRET));
});

test('identical switches: no findings', () => {
  const side = () => ({ gateway: configSwitches(config({ voiceMemory: false })), worker: configSwitches(config({ voiceMemory: false })) });
  assert.deepEqual(compareConfigSwitches({ v: side(), vlab: side() }).findings, []);
});

test('a name on one side only, and a missing Worker config, are reported', () => {
  const v = { gateway: configSwitches(config({ voiceMemory: false, extraPlugin: true })), worker: configSwitches(config({ voiceMemory: false })) };
  const vlab = { gateway: configSwitches(config({ voiceMemory: false })), worker: null };
  const { findings } = compareConfigSwitches({ v, vlab });
  assert.deepEqual(findings.map((f) => [f.target, f.v, f.vlab]), [
    ['gateway: plugins.entries.v-browser.enabled', 'false', 'absent'],
    ['worker: config file', 'present', 'absent'],
  ]);
  assert.deepEqual(compareConfigSwitches({ v: { gateway: null, worker: null }, vlab: { gateway: null, worker: null } }), { compared: 0, findings: [] });
});

test('config findings are advisory: they do not change the parity state', () => {
  const pairs = [{ component: 'core', prefix: 'openclaw', kind: 'runtime' }];
  const trees = [{ v: new Map([['a.js', 'a'.repeat(64)]]), vlab: new Map([['a.js', 'a'.repeat(64)]]) }];
  const parity = evaluateParity({ pairs, trees });
  assert.equal(parity.state, 'ALIGNED');
  const v = { gateway: configSwitches(config({ voiceMemory: false })), worker: null };
  const vlab = { gateway: configSwitches(config({ voiceMemory: true })), worker: null };
  const findings = [...parity.findings, ...compareConfigSwitches({ v, vlab }).findings];
  // promote-to-v.mjs and evaluateParity count blocking findings this way.
  assert.deepEqual(findings.filter((f) => f.kind !== 'pending' && !f.advisory), []);
});

test('MCP absent vs off is not reported; channel plugins are expected differences', () => {
  // The 2026-10-06 parity run, after voice-memory was turned off on VLab.
  const v = { gateway: { mcp: { figma: false, 'voice-memory': false }, plugins: { feishu: true, 'openclaw-plugin-xiaoai-cloud': false, parallel: true } }, worker: null };
  const vlab = { gateway: { mcp: { 'voice-memory': false }, plugins: { feishu: true, 'openclaw-plugin-xiaoai-cloud': true, telegram: true } }, worker: null };
  const { compared, findings } = compareConfigSwitches({ v, vlab });
  assert.equal(compared, 6);
  assert.deepEqual(findings.map((f) => [f.target, f.kind, f.v, f.vlab, f.advisory]), [
    ['gateway: plugins.entries.openclaw-plugin-xiaoai-cloud.enabled', 'config-expected', 'false', 'true', true],
    ['gateway: plugins.entries.parallel.enabled', 'config-differs', 'true', 'absent', true],
    ['gateway: plugins.entries.telegram.enabled', 'config-expected', 'absent', 'true', true],
  ]);
  // An MCP server on one side only, and on, is still drift.
  const on = compareConfigSwitches({ v: { gateway: { mcp: {}, plugins: {} }, worker: null }, vlab: { gateway: { mcp: { figma: true }, plugins: {} }, worker: null } });
  assert.deepEqual(on.findings.map((f) => [f.target, f.kind]), [['gateway: mcp.servers.figma.enabled', 'config-differs']]);
});

test('memory-core dreaming inside plugin config is compared; nothing else of the config is kept', () => {
  const cfg = (dreaming) => ({
    plugins: { entries: { 'memory-core': { config: { dreaming: dreaming === undefined ? { cron: '0 3 * * *' } : { enabled: dreaming, cron: '0 3 * * *', token: SECRET } } } } },
  });
  assert.deepEqual(configSwitches(cfg(false)).pluginConfig, { 'memory-core.config.dreaming': false });
  assert.deepEqual(configSwitches(cfg(undefined)).pluginConfig, {});
  assert.ok(!JSON.stringify(configSwitches(cfg(true))).includes(SECRET));
  // The 2026-10-06 state: off on V, on in VLab, in both configs.
  const v = { gateway: configSwitches(cfg(false)), worker: configSwitches(cfg(false)) };
  const vlab = { gateway: configSwitches(cfg(true)), worker: configSwitches(cfg(true)) };
  assert.deepEqual(compareConfigSwitches({ v, vlab }).findings.map((f) => [f.target, f.kind, f.v, f.vlab]), [
    ['gateway: plugins.entries.memory-core.config.dreaming.enabled', 'config-differs', 'false', 'true'],
    ['worker: plugins.entries.memory-core.config.dreaming.enabled', 'config-differs', 'false', 'true'],
  ]);
});

test('Feishu renderMode is compared; an account overrides the top level; nothing else is kept', () => {
  const cfg = (top, accounts) => ({
    channels: { feishu: { appSecret: SECRET, ...(top === undefined ? {} : { renderMode: top }), ...(accounts ? { accounts } : {}) } },
  });
  assert.deepEqual(configSwitches(cfg(undefined)).channels, { 'channels.feishu.renderMode': 'auto (unset)' });
  assert.deepEqual(configSwitches(cfg('card', { a: { appSecret: SECRET }, b: { renderMode: 'raw' } })).channels, {
    'channels.feishu.renderMode': 'card',
    'channels.feishu.accounts.*.renderMode': 'card,raw',
  });
  assert.deepEqual(configSwitches(cfg(SECRET)).channels, { 'channels.feishu.renderMode': 'other' });
  assert.ok(!JSON.stringify(configSwitches(cfg('card', { a: { appSecret: SECRET, renderMode: SECRET } }))).includes(SECRET));
  assert.deepEqual(configSwitches({ channels: {} }).channels, {});
  // The 2026-10-07 suspicion: V on the default, VLab on "card".
  const v = { gateway: configSwitches(cfg(undefined, { main: {} })), worker: configSwitches({}) };
  const vlab = { gateway: configSwitches(cfg('card', { main: {} })), worker: configSwitches({}) };
  assert.deepEqual(compareConfigSwitches({ v, vlab }).findings.map((f) => [f.target, f.kind, f.v, f.vlab]), [
    ['gateway: channels.feishu.accounts.*.renderMode', 'config-differs', 'auto', 'card'],
    ['gateway: channels.feishu.renderMode', 'config-differs', 'auto (unset)', 'card'],
  ]);
  // Same effective mode, spelled differently, still shows at the top level only.
  const same = compareConfigSwitches({ v: { gateway: configSwitches(cfg('auto', { m: {} })), worker: null }, vlab: { gateway: configSwitches(cfg(undefined, { m: {} })), worker: null } });
  assert.deepEqual(same.findings.map((f) => f.target), ['gateway: channels.feishu.renderMode']);
});

test('gateway reload mode is compared; unset is hybrid', () => {
  // 2026-11-04: VLab had reload off, V had it unset.
  const v = { gateway: configSwitches({}), worker: null };
  const vlab = { gateway: configSwitches({ gateway: { reload: { mode: 'off' } } }), worker: null };
  assert.deepEqual(compareConfigSwitches({ v, vlab }).findings.map((f) => [f.target, f.kind, f.v, f.vlab]), [
    ['gateway: gateway.reload.mode', 'config-differs', 'hybrid', 'off'],
  ]);
  assert.deepEqual(compareConfigSwitches({ v, vlab: { gateway: configSwitches({ gateway: { reload: { mode: 'hybrid' } } }), worker: null } }).findings, []);
});

test('model config is compared as credential-free hashes; one-host agents are expected', () => {
  // 2026-11-04: VLab had no luna row, a 300 s DeepSeek timeout against V's 90 s, and its own agent.
  const cfg = ({ key, timeout, luna, agents }) => ({
    models: { providers: {
      deepseek: { baseUrl: 'https://api.deepseek.test', apiKey: key, timeoutSeconds: timeout, models: [{ id: 'deepseek-flash' }] },
      openai: { auth: 'oauth', models: luna ? [{ id: 'gpt-6-luna', contextTokens: 850000 }] : [] },
    } },
    agents: { defaults: { model: { primary: 'deepseek/deepseek-flash' } }, entries: agents },
  });
  const vCfg = cfg({ key: SECRET, timeout: 90, luna: true, agents: { main: { model: 'a' }, makaron: {} } });
  const sw = configSwitches(vCfg);
  assert.ok(!JSON.stringify(sw).includes(SECRET));
  assert.ok(!JSON.stringify(sw).includes('api.deepseek.test'));
  assert.match(sw.models['models.providers.deepseek'], /^[0-9a-f]{12}$/);
  // A different credential alone is not a difference.
  const same = configSwitches(cfg({ key: 'sk-other', timeout: 90, luna: true, agents: { main: { model: 'a' }, makaron: {} } }));
  assert.deepEqual(compareConfigSwitches({ v: { gateway: sw, worker: null }, vlab: { gateway: same, worker: null } }).findings, []);
  // Drift is reported per section; an agent only one host has is expected, its models too.
  const drift = configSwitches(cfg({ key: undefined, timeout: 300, luna: false, agents: { main: { model: 'b' }, makaron: {}, 'hy-codex': { model: 'c' } } }));
  assert.deepEqual(compareConfigSwitches({ v: { gateway: sw, worker: null }, vlab: { gateway: drift, worker: null } }).findings.map((f) => [f.target, f.kind]), [
    ['gateway: agents.entries.hy-codex', 'config-expected'],
    ['gateway: agents.entries.hy-codex.model', 'config-expected'],
    ['gateway: agents.entries.main.model', 'config-differs'],
    ['gateway: models.providers.deepseek', 'config-differs'],
    ['gateway: models.providers.openai', 'config-differs'],
  ]);
  // Per-agent models set on one host for an agent both have is drift.
  const unset = configSwitches(cfg({ key: SECRET, timeout: 90, luna: true, agents: { main: {}, makaron: {} } }));
  assert.deepEqual(compareConfigSwitches({ v: { gateway: sw, worker: null }, vlab: { gateway: unset, worker: null } }).findings.map((f) => [f.target, f.kind, f.vlab]), [
    ['gateway: agents.entries.main.model', 'config-differs', 'absent'],
  ]);
});
