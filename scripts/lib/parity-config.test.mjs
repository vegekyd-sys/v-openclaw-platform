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
  });
  assert.ok(!JSON.stringify(s).includes(SECRET));
  assert.equal(configSwitches(null), null);
  assert.deepEqual(configSwitches({}), { mcp: {}, plugins: {} });
  assert.deepEqual(configSwitches({ mcp: { servers: { a: null, b: 'x' } } }).mcp, { a: true, b: true });
});

test('voice-memory on in VLab, off on V: one advisory finding per config', () => {
  const v = { gateway: configSwitches(config({ voiceMemory: false })), worker: configSwitches(config({ voiceMemory: false })) };
  const vlab = { gateway: configSwitches(config({ voiceMemory: true })), worker: configSwitches(config({ voiceMemory: true })) };
  const { compared, findings } = compareConfigSwitches({ v, vlab });
  assert.equal(compared, 10);
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
