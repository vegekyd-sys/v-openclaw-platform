import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile, execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SHIM = fileURLToPath(new URL('./lark-cli-shim/lark-cli', import.meta.url));
const PROD = 'cli_a9365919fc3a1bd6';
const VLAB_BOT = 'cli_aae2c999c7789bd9';
const POOL = ['oc_00000000000000000000000000000001', 'oc_00000000000000000000000000000002', 'oc_00000000000000000000000000000003'];
const CREATE = ['im', '+chat-create', '--as', 'user', '--type', 'private', '--name', 'V｜测试｜1020', '--description', 'Task room',
  '--users', 'ou_00000000000000000000000000000abc', '--bots', VLAB_BOT];

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lark-shim-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const home = path.join(root, 'home'), data = path.join(root, 'data');
  fs.mkdirSync(home); fs.mkdirSync(data);
  // A clean env: the developer's own HOME and lark-cli settings must not leak into the test.
  const env = {PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, VLAB_CANDIDATE_DATA: data, INTER_SESSION_ROOM_POOL: POOL.join(',')};
  const run = (args, extra = {}) => spawnSync(process.execPath, [SHIM, ...args], {env: {...env, ...extra}, encoding: 'utf8'});
  const logs = () => fs.existsSync(path.join(data, 'lark-shim.log'))
    ? fs.readFileSync(path.join(data, 'lark-shim.log'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  return {root, home, data, env, run, logs};
}

test('the shim is an executable node script that cannot reach the network', () => {
  const src = fs.readFileSync(SHIM, 'utf8');
  assert.match(src, /^#!\/usr\/bin\/env node\n/);
  assert.ok(fs.statSync(SHIM).mode & 0o111, 'lark-cli must be executable');
  for (const mod of ['net', 'http', 'https', 'http2', 'tls', 'dns', 'dgram', 'child_process', 'worker_threads', 'cluster', 'inspector'])
    assert.doesNotMatch(src, new RegExp(`['"](node:)?${mod}['"]`), `shim must not load ${mod}`);
  assert.doesNotMatch(src, /\bfetch\s*\(|WebSocket|XMLHttpRequest|\brequire\s*\(|^\s*import\s/m);
  assert.doesNotMatch(src, /\beval\s*\(|new Function/);
});

test('im +chat-create hands out pooled chats in rotation with lark-cli\'s success envelope', t => {
  const s = sandbox(t);
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const r = s.run(CREATE);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out), ['ok', 'identity', 'data']);
    assert.equal(out.ok, true); assert.equal(out.identity, 'user');
    assert.deepEqual(Object.keys(out.data), ['chat_id', 'name', 'chat_type', 'owner_id', 'external']);
    assert.equal(out.data.name, 'V｜测试｜1020'); assert.equal(out.data.chat_type, 'private'); assert.equal(out.data.external, false);
    ids.push(out.data.chat_id);
  }
  assert.deepEqual(ids, [...POOL, POOL[0]]);
  const logs = s.logs();
  assert.equal(logs.length, 4);
  assert.deepEqual(logs.map(l => l.result), ['created', 'created', 'created', 'created']);
  assert.deepEqual(logs.map(l => l.reused), [false, false, false, true]);
  assert.ok(logs.every(l => l.network === 'none' && l.exit === 0 && l.argv.join(' ') === CREATE.join(' ')));
  assert.deepEqual(logs[3].warnings, ['pool_reused']);
  assert.equal(logs[0].parsed.bots[0], VLAB_BOT);
});

test('the success output satisfies the task-room helper\'s chat_id parser and --jq paths', t => {
  const s = sandbox(t);
  const r = s.run(CREATE);
  // Same rule as create_task_room.py parse_chat_id: ok must be true, chat_id under data.
  const parsed = execFileSync('python3', ['-I', '-c',
    'import json,sys; d=json.loads(sys.stdin.read()); assert d.get("ok"); print((d.get("data") or {}).get("chat_id") or d.get("chat_id"))'],
  {input: r.stdout, encoding: 'utf8'}).trim();
  assert.equal(parsed, POOL[0]);
  const jq = s.run([...CREATE, '-q', '.data.chat_id']);
  assert.equal(jq.status, 0, jq.stderr); assert.equal(JSON.parse(jq.stdout), POOL[1]);
  assert.equal(s.run([...CREATE, '--jq', '.data[0]']).status, 2);
});

test('every other subcommand exits 3 without output on stdout', t => {
  const s = sandbox(t);
  for (const args of [[], ['im', '+messages-send', '--as', 'bot', '--chat-id', POOL[0], '--markdown', 'brief'], ['auth', 'login'],
    ['im', 'chat.members', 'create'], ['api', 'POST', '/open-apis/im/v1/chats'], ['im', '+chat-create', 'extra']]) {
    const r = s.run(args);
    assert.equal(r.status, 3, `${args.join(' ')} -> ${r.status}`);
    assert.equal(r.stdout, '');
    assert.equal(JSON.parse(r.stderr).error.subtype, 'unsupported_command');
  }
  assert.ok(s.logs().every(l => l.exit === 3 && l.result === 'refused'));
  assert.equal(fs.existsSync(path.join(s.data, 'lark-shim.state.json')), false, 'refused calls never consume the pool');
});

test('the production app id anywhere in env or in reachable lark-cli configs exits 4 before anything else', t => {
  const s = sandbox(t);
  for (const extra of [{LARKSUITE_CLI_APP_ID: PROD}, {FEISHU_APP_ID: PROD}, {SOME_JSON: `{"appId":"${PROD}"}`}]) {
    const r = s.run(CREATE, extra);
    assert.equal(r.status, 4, JSON.stringify(Object.keys(extra)));
    assert.equal(r.stdout, '');
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.subtype, 'production_app_id');
    assert.match(err.error.message, new RegExp(`env:${Object.keys(extra)[0]}`));
    assert.ok(!r.stderr.includes('{"appId"'), 'env values are never echoed');
  }
  // Even an unsupported subcommand reports the production app id first.
  assert.equal(s.run(['im', '+messages-send'], {LARKSUITE_CLI_APP_ID: PROD}).status, 4);

  fs.mkdirSync(path.join(s.home, '.lark-cli/openclaw'), {recursive: true});
  fs.writeFileSync(path.join(s.home, '.lark-cli/openclaw/config.json'), JSON.stringify({apps: [{appId: PROD, defaultAs: 'user'}]}));
  let r = s.run(CREATE);
  assert.equal(r.status, 4); assert.match(r.stderr, /openclaw\/config\.json/);
  fs.rmSync(path.join(s.home, '.lark-cli'), {recursive: true});

  const elsewhere = path.join(s.root, 'elsewhere');
  fs.mkdirSync(elsewhere); fs.writeFileSync(path.join(elsewhere, 'config.json'), JSON.stringify({appId: PROD}));
  fs.symlinkSync(elsewhere, path.join(s.home, '.lark-cli'));
  assert.equal(s.run(CREATE).status, 4, 'symlinked config dir is followed');
  fs.unlinkSync(path.join(s.home, '.lark-cli'));
  r = s.run(CREATE, {LARKSUITE_CLI_CONFIG_DIR: elsewhere});
  assert.equal(r.status, 4, 'LARKSUITE_CLI_CONFIG_DIR is scanned too');

  // lark-cli `config bind` takes app credentials from the OpenClaw config too (and LARK_CHANNEL_CONFIG).
  const prodConfig = path.join(s.root, 'prod-openclaw.json');
  fs.writeFileSync(prodConfig, JSON.stringify({channels: {feishu: {appId: PROD}}}));
  for (const extra of [{OPENCLAW_CONFIG_PATH: prodConfig}, {LARK_CHANNEL_CONFIG: prodConfig}, {OPENCLAW_STATE_DIR: elsewhere}]) {
    if (extra.OPENCLAW_STATE_DIR) fs.copyFileSync(prodConfig, path.join(elsewhere, 'openclaw.json'));
    r = s.run(CREATE, extra);
    assert.equal(r.status, 4, JSON.stringify(Object.keys(extra)));
    assert.match(r.stderr, /openclaw\.json/);
  }
  const ocHome = path.join(s.root, 'oc-home');
  fs.mkdirSync(path.join(ocHome, '.openclaw'), {recursive: true});
  fs.copyFileSync(prodConfig, path.join(ocHome, '.openclaw/openclaw.json'));
  assert.equal(s.run(CREATE, {OPENCLAW_HOME: ocHome}).status, 4, 'OPENCLAW_HOME/.openclaw/openclaw.json');

  assert.equal(fs.existsSync(path.join(s.data, 'lark-shim.state.json')), false, 'no chat handed out while refusing');
  assert.ok(s.logs().every(l => l.exit === 4 && l.reason === 'production_app_id'));
  // The candidate's own OpenClaw config names only the VLab app: no refusal.
  const vlabConfig = path.join(s.root, 'vlab-openclaw.json');
  fs.writeFileSync(vlabConfig, JSON.stringify({channels: {feishu: {appId: VLAB_BOT}}}));
  assert.equal(s.run(CREATE, {OPENCLAW_CONFIG_PATH: vlabConfig, OPENCLAW_HOME: s.root}).status, 0);
  // A harmless config for another app does not trip the check.
  fs.mkdirSync(path.join(s.home, '.lark-cli')); fs.writeFileSync(path.join(s.home, '.lark-cli/config.json'), JSON.stringify({appId: VLAB_BOT}));
  assert.equal(s.run(CREATE).status, 0);
});

test('a production bot id passed as an argument is logged but harmless: nothing leaves the machine', t => {
  const s = sandbox(t);
  const r = s.run(['im', '+chat-create', '--name', 'V｜x｜1020', '--users', 'ou_0abc', '--bots', PROD]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(s.logs()[0].warnings, ['production_app_id_in_args']);
});

test('misconfiguration and bad flags exit 2; --help and --dry-run exit 0 without consuming the pool', t => {
  const s = sandbox(t);
  assert.equal(s.run(CREATE, {INTER_SESSION_ROOM_POOL: ''}).status, 2);
  assert.equal(s.run(CREATE, {INTER_SESSION_ROOM_POOL: 'oc_NOTHEX,chat-1'}).status, 2);
  const noData = spawnSync(process.execPath, [SHIM, ...CREATE], {env: {...s.env, VLAB_CANDIDATE_DATA: ''}, encoding: 'utf8'});
  assert.equal(noData.status, 2);
  for (const bad of [['--frobnicate'], ['--as', 'robot'], ['--type', 'secret'], ['--bots', 'a,b'], ['--users', 'someone'],
    ['--name', 'x'.repeat(61)], ['--format', 'table'], ['--name']])
    assert.equal(s.run(['im', '+chat-create', ...bad]).status, 2, bad.join(' '));
  const help = s.run(['im', '+chat-create', '--help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /only `im \+chat-create`/);
  const dry = s.run([...CREATE, '--dry-run']);
  assert.equal(dry.status, 0);
  const preview = JSON.parse(dry.stdout);
  assert.equal(preview.dry_run, true); assert.equal(preview.request.url, '/open-apis/im/v1/chats');
  assert.equal(fs.existsSync(path.join(s.data, 'lark-shim.state.json')), false);
  assert.equal(JSON.parse(s.run(CREATE).stdout).data.chat_id, POOL[0]);
});

test('a lock left behind by a killed shim does not block the next call', t => {
  const s = sandbox(t);
  const lock = path.join(s.data, 'lark-shim.lock');
  fs.mkdirSync(lock);
  const old = new Date(Date.now() - 12000);
  fs.utimesSync(lock, old, old);
  const started = Date.now();
  const r = s.run(CREATE);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).data.chat_id, POOL[0]);
  assert.ok(Date.now() - started < 5000, 'a stale lock is taken over at once instead of timing out');
  assert.equal(fs.existsSync(lock), false);
});

test('parallel calls get distinct chats', async t => {
  const s = sandbox(t);
  const pool = Array.from({length: 8}, (_, i) => `oc_${String(i + 1).padStart(32, '0')}`);
  const runOne = () => new Promise((resolve, reject) => execFile(process.execPath, [SHIM, ...CREATE],
    {env: {...s.env, INTER_SESSION_ROOM_POOL: pool.join(',')}, encoding: 'utf8'}, (err, stdout) => err ? reject(err) : resolve(JSON.parse(stdout).data.chat_id)));
  const ids = await Promise.all(pool.map(runOne));
  assert.deepEqual([...ids].sort(), [...pool].sort());
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.data, 'lark-shim.state.json'), 'utf8')).next, pool.length);
});
