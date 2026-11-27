import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MARKER as SHELL_MARKER, NEW_SAFE_DENY } from './patch-card-native-shell.mjs';
import { LOOPBACK, MARKER as EGRESS_MARKER } from './patch-egress-loopback.mjs';
import { FILES, OUTPUT_DIR, PLAN } from './build-card-native-shell.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const out = Object.fromEntries(FILES.map((f) => [f.name, read(`${OUTPUT_DIR}/${f.name}`)]));
const harness = out['harness-DXVZ5II5.js'];
const lifecycle = out['thread-lifecycle-DAcEJ_Om.js'];
const runtime = out['runtime-Cy2RRq4n.js'];

// V core's default subagent denies (agent-tools.policy SUBAGENT_TOOL_DENY_ALWAYS + _LEAF on 2026.9.1-db91.6).
// "openclaw" is safe in core itself (v-openclaw-tool-safe-deny-v1); AUTOMATIONS_TOOL_NAME is "automations".
const SUBAGENT_DEFAULT_DENY = [
  'gateway', 'agents_list', 'session_status', 'automations', 'message', 'sessions_send',
  'conversations_list', 'conversations_send', 'conversations_turn',
  'subagents', 'sessions_list', 'sessions_history', 'sessions_search', 'sessions_spawn',
];

test('plan replaces three files by V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, FILES.map((f) => ({ source: `${OUTPUT_DIR}/${f.name}`, target: `${f.target}/${f.name}`, before: f.before })));
  for (const f of FILES) {
    const base = read(`${f.base}/${f.name}`);
    assert.equal(sha(base), f.before, f.name);
    assert.equal(f.patch(base), out[f.name], `${f.name} rebuilds`);
    assert.throws(() => f.patch(out[f.name]), /already applied/u, f.name);
  }
  assert(harness.includes(SHELL_MARKER) && lifecycle.includes(SHELL_MARKER) && runtime.includes(EGRESS_MARKER));
});

test('the Codex safe-deny list covers every default subagent deny, and nothing with a native counterpart', () => {
  const body = harness.match(/const CODEX_TOOL_POLICY_SAFE_DENY_NAMES = \[([\s\S]*?)\];/u)?.[1];
  assert(body, 'safe-deny list');
  const names = new Set([...body.matchAll(/"([a-z_]+)"/gu)].map((m) => m[1]));
  for (const name of SUBAGENT_DEFAULT_DENY) assert(names.has(name), name);
  for (const name of NEW_SAFE_DENY) assert(names.has(name), name);
  for (const name of ['exec', 'process', 'read', 'write', 'edit', 'apply_patch', 'web_search', 'browser', 'view_image']) {
    assert(!names.has(name), `${name} must stay fail-closed`);
  }
});

test('a sessions_spawn or subagents safe deny turns native delegation off, in the thread config and the preflight', () => {
  const helper = lifecycle.match(/const CODEX_NATIVE_DELEGATION_TOOL_NAMES = [\s\S]*?\nfunction codexNativeDelegationDenied\(params\) \{[\s\S]*?\n\}\n/u)?.[0];
  assert(helper, 'helper');
  const denied = new Function(`${helper}; return codexNativeDelegationDenied;`)();
  assert.equal(denied({ pluginHarnessToolPolicySafeDeniedTools: ['sessions_spawn'] }), true);
  assert.equal(denied({ pluginHarnessToolPolicySafeDeniedTools: ['message', 'subagents'] }), true);
  assert.equal(denied({ pluginHarnessToolPolicySafeDeniedTools: ['message', 'sessions_send'] }), false);
  assert.equal(denied({}), false);
  assert.match(lifecycle, /\{ "features\.image_generation": false \} : void 0, codexNativeDelegationDenied\(params\) \? CODEX_DELEGATION_DISABLED_THREAD_CONFIG : void 0, shouldDisableCodexToolSearchForModel\(/u);
  assert.match(lifecycle, /const additionalDeniedFeatures = \[\.\.\.imageGenerationDenied \? \["image_generation"\] : \[\], \.\.\.codexNativeDelegationDenied\(params\.params\) \? CODEX_NATIVE_DELEGATION_FEATURES : \[\]\];/u);
  assert.match(lifecycle, /if \(restrictedToolSurface \|\| additionalDeniedFeatures\.length > 0\) await lifecycleTiming\.measure\("tool-policy-config-requirements-read"/u);
  assert.match(lifecycle, /additionalDeniedFeatures: additionalDeniedFeatures\.length > 0 \? additionalDeniedFeatures : void 0,/u);
  assert.doesNotMatch(lifecycle, /additionalDeniedFeatures: imageGenerationDenied \?/u);
});

test('the egress run env exempts loopback, and Node then reaches a plain-HTTP loopback service under an env proxy', async () => {
  assert.match(runtime, new RegExp(`HTTP_PROXY: proxyUrl,\\n[^\\n]*${EGRESS_MARKER}[^\\n]*\\n\\t+NO_PROXY: "${LOOPBACK}",\\n\\t+no_proxy: "${LOOPBACK}",\\n\\t+NODE_USE_ENV_PROXY: "1",`, 'u'));
  const server = http.createServer((_req, res) => { res.writeHead(200, { Connection: 'close' }); res.end('{"ok":true}'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  // A proxy that refuses everything, as the secret egress proxy does for a plain-HTTP tunnel.
  const proxy = http.createServer((_req, res) => { res.writeHead(403); res.end(); });
  proxy.on('connect', (_req, socket) => socket.destroy());
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const script = `fetch("http://127.0.0.1:${server.address().port}/").then((r) => r.text()).then((t) => process.stdout.write(t), (e) => process.stdout.write("ERR " + (e.cause?.code ?? e.message)))`;
  const run = (extra) => new Promise((resolve) => {
    const env = { ...process.env, HTTP_PROXY: `http://127.0.0.1:${proxy.address().port}`, HTTPS_PROXY: `http://127.0.0.1:${proxy.address().port}`, NODE_USE_ENV_PROXY: '1', ...extra };
    for (const k of ['NO_PROXY', 'no_proxy', 'http_proxy', 'https_proxy']) if (!(k in extra)) delete env[k];
    execFile(process.execPath, ['-e', script], { env, timeout: 8_000 }, (error, stdout) => resolve(error ? `ERR child ${error.code ?? error.signal}` : stdout));
  });
  // NODE_USE_ENV_PROXY exists from Node 22.21 / 24.5 (V runs 22.23.1); older Nodes ignore the proxy entirely.
  const [major, minor] = process.versions.node.split('.').map(Number);
  const envProxySupported = major > 24 || (major === 24 && minor >= 5) || (major === 22 && minor >= 21) || major === 23;
  try {
    assert.equal(await run({ NO_PROXY: LOOPBACK, no_proxy: LOOPBACK }), '{"ok":true}');
    if (envProxySupported) assert.match(await run({}), /^ERR /u);
  } finally {
    server.close();
    proxy.close();
  }
});
