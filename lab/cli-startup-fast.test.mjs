import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CLI, CLI_BEFORE_SHA, CLIENT, CLIENT_BEFORE_SHA, MARKER, PREFLIGHT, patchRelayCli, patchRelayClient, sha256, unpatchRelayCli, unpatchRelayClient } from './patch-cli-startup-fast.mjs';

// cli-startup-fast: the relay runs before the general CLI entry, and other launcher commands skip the
// warning respawn. See lab/cli-startup-fast.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/cli-startup-fast.plan.json'));
const dir = 'lab/release-files/cli-startup-fast';
const releasedCli = read(`${dir}/${CLI}`);
const releasedClient = read(`${dir}/${CLIENT}`);

test('plan pins V bytes before and the release files after', () => {
  const [cli, client, preflight] = plan.files;
  assert.deepEqual([cli.target, client.target, preflight.target], [CLI, CLIENT, PREFLIGHT].map((n) => `openclaw/dist/${n}`));
  assert.equal(cli.before, CLI_BEFORE_SHA);
  assert.equal(client.before, CLIENT_BEFORE_SHA);
  assert.equal(preflight.before, null);
  assert.equal(sha256(unpatchRelayCli(releasedCli)), CLI_BEFORE_SHA, 'V bytes');
  assert.equal(sha256(unpatchRelayClient(releasedClient)), CLIENT_BEFORE_SHA, 'V bytes');
  assert.equal(sha256(releasedCli), cli.after);
  assert.equal(sha256(releasedClient), client.after);
  assert.equal(sha256(read(`${dir}/${PREFLIGHT}`)), preflight.after);
  assert.equal(patchRelayCli(unpatchRelayCli(releasedCli)), releasedCli);
  assert.equal(patchRelayClient(unpatchRelayClient(releasedClient)), releasedClient);
  assert.throws(() => patchRelayCli(releasedCli), /already patched/);
  assert.throws(() => patchRelayClient(releasedClient), /already patched/);
});

test('the direct path no longer imports method scopes or the sqlite helpers', () => {
  assert.ok(releasedCli.includes(MARKER));
  assert.ok(!/^import "\.\/method-scopes/mu.test(releasedCli));
  for (const chunk of ['errors-u9zSVTak', 'node-sqlite-CL-d6drd', 'kysely-sync-DKYGT267', 'sqlite-user-version-DkmzAA6V']) {
    assert.ok(!releasedClient.includes(chunk), chunk);
  }
  assert.ok(releasedCli.includes('import("./call-biHULXUC.js")'), 'the Gateway fallback stays lazy');
});

// The release files with stubs for their small sibling chunks, as openclaw.mjs would load them.
function distWithStubs(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-startup-fast-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  for (const name of [CLI, CLIENT, PREFLIGHT]) fs.copyFileSync(new URL(`${dir}/${name}`, root), path.join(d, name));
  const stubs = {
    'native-hook-relay-cli-FHvp11Az.js': `import { n as runNativeHookRelayCliFromArgv } from "./${CLI}";\nexport { runNativeHookRelayCliFromArgv };\n`,
    'warning-filter-z3hZGeVP.js': 'export const t = () => { process.env.FILTER_INSTALLED = "1"; const emit = process.emitWarning.bind(process); process.emitWarning = (w, ...rest) => { if (!String(w?.message ?? w).includes("SQLite is an experimental")) emit(w, ...rest); }; };\n',
    'operator-scopes-Dw7Gu2cA.js': 'export const t = "operator.admin";\n',
    'timer-delay-x5n129Nx.js': 'export const t = (fn, ms) => setTimeout(fn, ms);\n',
    'parse-timeout-BhPKqfrV.js': 'export const n = (value, fallback) => (value ? Number(value) : fallback);\n',
    'error-coercion-CwcmpTBO.js': 'export const l = (error) => (error instanceof Error ? error : new Error(String(error)));\n',
    'utf16-slice-D_ngcYKd.js': 'export const i = (s) => s;\nexport const r = (s) => s;\n',
    'openclaw-state-db-contract-CsSSYjX0.js': 'export const o = 100;\n',
    'openclaw-state-db.paths-Dwj4ZWNN.js': 'export const o = () => "/nonexistent/state.sqlite";\n',
    'pid-alive-lAl8ESlJ.js': 'export const i = () => false;\n',
    'call-biHULXUC.js': 'export const callGateway = async () => { throw new Error("gateway down"); };\n',
  };
  for (const [name, text] of Object.entries(stubs)) fs.writeFileSync(path.join(d, name), text);
  return d;
}
function locator(d, port, userVersion = 15) {
  const file = path.join(d, 'state.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version=${userVersion};CREATE TABLE native_hook_relay_bridges(relay_id TEXT PRIMARY KEY,pid INT,hostname TEXT,port INT,token TEXT,expires_at_ms INT)`);
  db.prepare('INSERT INTO native_hook_relay_bridges VALUES(?,?,?,?,?,?)').run('r1', process.pid, '127.0.0.1', port, 'tok', Date.now() + 60_000);
  db.close();
  return file;
}
const denyLine = (reason) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`;
const run = (d, args, { input = '', env = {} } = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(d, PREFLIGHT), ...args], { env: { PATH: process.env.PATH, ...env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(input);
});
const bridge = async (t, respond) => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { seen.push({ auth: req.headers.authorization, path: req.url, body: JSON.parse(body) }); res.end(JSON.stringify(respond(seen.at(-1).body))); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { seen, port: server.address().port };
};
const relayArgs = (db, event) => ['hooks', 'relay', '--provider', 'codex', '--relay-id', 'r1', '--state-db', db, '--event', event, '--timeout', '1000'];

test('a blocked pre_tool_use reaches Codex byte for byte and the process exits on its own', async (t) => {
  const d = distWithStubs(t);
  const { seen, port } = await bridge(t, () => ({ ok: true, result: { stdout: denyLine('policy says no'), stderr: '', exitCode: 0 } }));
  const db = locator(d, port);
  const r = await run(d, relayArgs(db, 'pre_tool_use'), { input: '{"tool_name":"Bash"}' });
  assert.deepEqual(r, { code: 0, stdout: denyLine('policy says no'), stderr: '' });
  assert.deepEqual(seen, [{ auth: 'Bearer tok', path: '/invoke', body: { provider: 'codex', relayId: 'r1', event: 'pre_tool_use', rawPayload: { tool_name: 'Bash' } } }]);
});

test('with no reachable bridge or Gateway, pre_tool_use is denied and post_tool_use is a no-op', async (t) => {
  const d = distWithStubs(t);
  const db = locator(d, 1);
  const deny = await run(d, relayArgs(db, 'pre_tool_use'), { input: '{}' });
  assert.equal(deny.code, 0);
  assert.equal(JSON.parse(deny.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const post = await run(d, relayArgs(db, 'post_tool_use'), { input: '{}' });
  assert.equal(post.code, 0);
  assert.equal(post.stdout, '');
});

test('a newer state schema is not read and still fails closed', async (t) => {
  const d = distWithStubs(t);
  const { seen, port } = await bridge(t, () => ({ ok: true, result: { stdout: '', stderr: '', exitCode: 0 } }));
  const db = locator(d, port, 16);
  const r = await run(d, relayArgs(db, 'pre_tool_use'), { input: '{}' });
  assert.equal(r.stdout, denyLine('Native hook relay unavailable'));
  assert.equal(seen.length, 0);
});

test('a bad option reports and exits nonzero', async (t) => {
  const d = distWithStubs(t);
  const r = await run(d, ['hooks', 'relay', '--nope', 'x']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /native hook relay failed: unknown native hook relay option: --nope/u);
});

// Imports the file the way openclaw.mjs does and reports what it left behind.
const probe = (d, argv, env = {}) => JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', `
  const mod = await import(${JSON.stringify(`file://${d}/${PREFLIGHT}`)});
  mod.installProcessWarningFilter();
  let warned = [];
  process.on('warning', (w) => warned.push(w.name));
  process.emitWarning('x', 'ExperimentalWarning');
  process.emitWarning(Object.assign(new Error('x'), { name: 'ExperimentalWarning' }));
  process.emitWarning('y', 'DeprecationWarning');
  setImmediate(() => console.log(JSON.stringify({ ready: process.env.OPENCLAW_NODE_OPTIONS_READY ?? null, filter: process.env.FILTER_INSTALLED ?? null, warned })));
`, ...argv], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } }).stdout);

test('other commands get the marker and lose only experimental warnings', (t) => {
  const d = distWithStubs(t);
  assert.deepEqual(probe(d, ['cron', 'status']), { ready: '1', filter: '1', warned: ['DeprecationWarning'] });
  assert.deepEqual(probe(d, ['hooks', 'relay', '--help']), { ready: '1', filter: '1', warned: ['DeprecationWarning'] });
});

test('the switch, an explicit marker and a container target keep the old path', (t) => {
  const d = distWithStubs(t);
  const both = ['ExperimentalWarning', 'ExperimentalWarning', 'DeprecationWarning'];
  assert.deepEqual(probe(d, ['hooks', 'relay'], { OPENCLAW_V_CLI_FAST_PATH: '0' }), { ready: null, filter: '1', warned: both });
  assert.deepEqual(probe(d, ['cron', 'status'], { OPENCLAW_NODE_OPTIONS_READY: '0' }), { ready: '0', filter: '1', warned: both });
  assert.deepEqual(probe(d, ['cron', 'status'], { OPENCLAW_CONTAINER: 'box' }), { ready: null, filter: '1', warned: both });
});
