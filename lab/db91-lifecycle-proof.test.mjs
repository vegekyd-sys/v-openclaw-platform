// lab/release-files/db91-lifecycle-proof: the two DB91 defects of 2026-11-26
// (docs/incidents/2026-11-26-gateway-tasks-max-crash-loop.md).
//  1. A process started by the running Gateway that looks like a Gateway server must not start a
//     lifecycle of its own (new epoch, preflight, last-lifecycle.json moved off the running Gateway).
//  2. A database admitted by this lifecycle's preflight is not checked in full again on the opening
//     thread when its receipt is missing; revoked, expired or replaced databases still are.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const release = path.join(here, 'release-files', 'db91-lifecycle-proof');
const production = {
  'db91-integrity-bootstrap.mjs': path.join(here, 'release-files', 'restart-speed', 'dist', 'db91-integrity-bootstrap.mjs'),
  'db91-restart-carry.mjs': path.join(here, 'release-files', 'restart-speed', 'dist', 'db91-restart-carry.mjs'),
  'db91-integrity-gate.mjs': path.join(here, 'release-files', 'db91-shrink-reuse', 'db91-integrity-gate.mjs'),
};
const HASH = (value) => createHash('sha256').update(value).digest('hex');
// Lifecycles need a kernel boot id and /proc process start times: Linux (V, VLab) only.
const linux = fs.existsSync('/proc/sys/kernel/random/boot_id') && fs.existsSync('/proc/self/stat');
if (!linux) test('db91 lifecycle tests need Linux /proc', {skip: 'run on VLab: vlab.mjs candidate --plan lab/candidate/db91-lifecycle-proof-unit.plan.json'}, () => {});
const ltest = linux ? test : () => {};

// A private dist with the three modules and a verifier child shaped like V's
// (state/openclaw-database-verify.worker.js importing ../db91-integrity-gate.mjs).
function makeDist(source) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'db91-lifecycle-dist-'));
  for (const name of Object.keys(production)) fs.copyFileSync(source === 'production' ? production[name] : path.join(release, name), path.join(dist, name));
  fs.mkdirSync(path.join(dist, 'state'));
  fs.writeFileSync(path.join(dist, 'state', 'openclaw-database-verify.worker.js'), fs.readFileSync(path.join(here, '..', 'experiments', 'db91-integrity-gate', 'fixture-verify-worker.mjs'), 'utf8').replace("from './gate.mjs'", "from '../db91-integrity-gate.mjs'"));
  return dist;
}
const dist = makeDist('release');
const gate = await import(pathToFileURL(path.join(dist, 'db91-integrity-gate.mjs')).href);
const carry = await import(pathToFileURL(path.join(dist, 'db91-restart-carry.mjs')).href);
const bootstrap = await import(pathToFileURL(path.join(dist, 'db91-integrity-bootstrap.mjs')).href);

function state(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'db91-lifecycle-state-')));
  const file = path.join(root, 'agents', 'makaron', 'agent', 'openclaw-agent.sqlite');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE schema_meta (meta_key TEXT PRIMARY KEY, role TEXT, agent_id TEXT, schema_version INTEGER); CREATE TABLE t (x); PRAGMA user_version = 19;");
  db.prepare("INSERT INTO schema_meta VALUES ('primary', 'agent', 'makaron', 19)").run();
  db.prepare('INSERT INTO t VALUES (?)').run('a'.repeat(5000));
  db.close();
  const config = path.join(root, 'openclaw.json');
  fs.writeFileSync(config, JSON.stringify({agents: {entries: {makaron: {agentDir: path.dirname(file)}}}}));
  const counter = path.join(root, 'full-checks.log');
  const env = {OPENCLAW_DB91_INTEGRITY_ENABLE: '1', OPENCLAW_DB91_INTEGRITY_STATE_ROOT: root, OPENCLAW_CONFIG_PATH: config, DB91_TEST_COUNTER_FILE: counter};
  const base = path.join(root, '.db91-integrity');
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, file, env, base, counter, checks: () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').trim().split('\n').filter(Boolean).length : 0)};
}
const argv = ['node', '/opt/openclaw/core/dist/index.js', 'gateway', '--port', '22793'];
const pointer = (base) => JSON.parse(fs.readFileSync(path.join(base, 'last-lifecycle.json'), 'utf8')).epoch;
const epochs = (base) => fs.readdirSync(base).filter((f) => /^[a-f0-9-]{36}$/.test(f)).sort();

// Bootstrap in a separate process (a real pid, its own exit), returning what it reported and its env.
function bootChild(dir, env, {exit = 'clean', args = argv} = {}) {
  const script = `
    const {bootstrapGatewayIntegrity} = await import(${JSON.stringify(pathToFileURL(path.join(dir, 'db91-integrity-bootstrap.mjs')).href)});
    const env = {...process.env};
    const result = await bootstrapGatewayIntegrity({argv: ${JSON.stringify(args)}, env, distDir: ${JSON.stringify(dir)}});
    (await import('node:fs')).writeSync(1, JSON.stringify({result, epoch: env.OPENCLAW_DB91_INTEGRITY_EPOCH ?? null, dir: env.OPENCLAW_DB91_INTEGRITY_DIR ?? null}));
    ${exit === 'crash' ? "process.kill(process.pid, 'SIGKILL');" : ''}`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, ...env}, encoding: 'utf8', timeout: 20_000});
  assert.equal(run.error, undefined);
  return {...JSON.parse(run.stdout), stderr: run.stderr};
}
// A live Gateway lifecycle held by a separate long-running process (the "running Gateway").
async function runningGateway(dir, env) {
  const script = `
    const {bootstrapGatewayIntegrity} = await import(${JSON.stringify(pathToFileURL(path.join(dir, 'db91-integrity-bootstrap.mjs')).href)});
    const env = {...process.env};
    await bootstrapGatewayIntegrity({argv: ${JSON.stringify(argv)}, env, distDir: ${JSON.stringify(dir)}});
    process.stdout.write(JSON.stringify({epoch: env.OPENCLAW_DB91_INTEGRITY_EPOCH, dir: env.OPENCLAW_DB91_INTEGRITY_DIR}) + '\\n');
    process.on('SIGTERM', () => process.exit(0));
    setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, ...env}, stdio: ['ignore', 'pipe', 'pipe']});
  const line = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (c) => { out += c; if (out.includes('\n')) resolve(out.split('\n')[0]); });
    child.once('exit', (code) => reject(new Error('gateway stand-in exited ' + code)));
  });
  const {epoch, dir: directory} = JSON.parse(line);
  return {child, epoch, directory, stop: () => new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGTERM'); })};
}

// ---------------------------------------------------------------------------------------------- defect 1

ltest('a Gateway-looking process started by the running Gateway starts no lifecycle (fixed)', async (t) => {
  const s = state(t);
  const gw = await runningGateway(dist, s.env);
  t.after(() => gw.child.kill('SIGKILL'));
  assert.equal(s.checks(), 1, 'the running Gateway checked makaron once before admission');
  const before = epochs(s.base);
  // what an OpenClaw exec child inherits: the Gateway's environment, lifecycle variables included
  const inherited = {...s.env, OPENCLAW_DB91_INTEGRITY_EPOCH: gw.epoch, OPENCLAW_DB91_INTEGRITY_DIR: gw.directory};
  const child = bootChild(dist, inherited);
  assert.equal(child.result.enabled, false);
  assert.equal(child.result.inherited, gw.epoch);
  assert.equal(child.result.owner, gw.child.pid);
  assert.equal(child.epoch, gw.epoch, 'the child keeps using the running lifecycle');
  assert.match(child.stderr, /belongs to running Gateway pid/);
  assert.deepEqual(epochs(s.base), before, 'no new epoch directory');
  assert.equal(pointer(s.base), gw.epoch, 'last-lifecycle.json still names the running Gateway');
  assert.equal(s.checks(), 1, 'no second preflight');
  // the next clean restart still carries the running Gateway's check
  await gw.stop();
  const next = bootChild(dist, s.env);
  assert.match(next.stderr, /clean-restart carry: 1\/1 /);
  assert.equal(s.checks(), 1);
});

ltest('the same child under production bytes moved last-lifecycle.json and re-checked (the 2026-11-26 defect)', async (t) => {
  const s = state(t);
  const prod = makeDist('production');
  const gw = await runningGateway(prod, s.env);
  t.after(() => gw.child.kill('SIGKILL'));
  // on V both strays were killed (exec timeout), so their lifecycles never ended clean
  const child = bootChild(prod, {...s.env, OPENCLAW_DB91_INTEGRITY_EPOCH: gw.epoch, OPENCLAW_DB91_INTEGRITY_DIR: gw.directory}, {exit: 'crash'});
  assert.equal(child.result.enabled, true);
  assert.notEqual(pointer(s.base), gw.epoch);
  assert.equal(s.checks(), 2);
  await gw.stop();
  const next = bootChild(prod, s.env);
  assert.match(next.stderr, /clean-restart carry: 0\/1 .*previous-exit-not-clean/, 'the clean restart lost its carry');
});

ltest('an inherited lifecycle whose Gateway is gone, a reused pid, or a respawn successor starts a new lifecycle', async (t) => {
  const s = state(t);
  const first = bootChild(dist, s.env); // exited cleanly; its pid is gone
  const inherited = {...s.env, OPENCLAW_DB91_INTEGRITY_EPOCH: first.epoch, OPENCLAW_DB91_INTEGRITY_DIR: first.dir};
  const orphan = bootChild(dist, inherited);
  assert.equal(orphan.result.enabled, true);
  assert.notEqual(orphan.epoch, first.epoch);
  assert.match(orphan.stderr, /clean-restart carry: 1\/1 /, 'it is the successor of the exited Gateway');
  // direct checks of the rule
  const lifecycle = JSON.parse(fs.readFileSync(path.join(s.base, orphan.epoch, 'lifecycle.json'), 'utf8'));
  const env = {OPENCLAW_DB91_INTEGRITY_EPOCH: orphan.epoch, OPENCLAW_DB91_INTEGRITY_DIR: path.join(s.base, orphan.epoch)};
  const owner = lifecycle.pid;
  const alive = () => lifecycle.startedAt - 500;
  assert.equal(carry.inheritedLifecycle({base: s.base, env, pid: 4242, ppid: 1, bootId: lifecycle.bootId, startedAt: alive})?.owner, owner);
  assert.equal(carry.inheritedLifecycle({base: s.base, env, pid: 4242, ppid: 1, bootId: lifecycle.bootId, startedAt: () => undefined}), null, 'owner gone');
  assert.equal(carry.inheritedLifecycle({base: s.base, env, pid: 4242, ppid: 1, bootId: lifecycle.bootId, startedAt: () => lifecycle.startedAt + 60_000}), null, 'pid reused by a later process');
  if (lifecycle.bootId) assert.equal(carry.inheritedLifecycle({base: s.base, env, pid: 4242, ppid: 1, bootId: '99999999-2222-3333-4444-555555555555', startedAt: alive}), null, 'other boot');
  assert.equal(carry.inheritedLifecycle({base: s.base, env, pid: 4242, ppid: owner, bootId: lifecycle.bootId, startedAt: alive}), null, 'a direct child of the owner may be its update successor (whatever its command line): own lifecycle');
  assert.equal(carry.inheritedLifecycle({base: s.base, env: {...env, OPENCLAW_DB91_INTEGRITY_EPOCH: 'x'}, pid: 4242, ppid: 1, bootId: lifecycle.bootId, startedAt: alive}), null, 'malformed epoch');
  assert.equal(carry.inheritedLifecycle({base: s.base, env: {...env, OPENCLAW_DB91_INTEGRITY_DIR: '/elsewhere'}, pid: 4242, ppid: 1, bootId: lifecycle.bootId, startedAt: alive}), null, 'directory must be the epoch under this state root');
});

ltest('a second Gateway on the same state does not move last-lifecycle.json off a running one', async (t) => {
  const s = state(t);
  const gw = await runningGateway(dist, s.env);
  t.after(() => gw.child.kill('SIGKILL'));
  const other = bootChild(dist, s.env); // not inherited: e.g. started by hand with the unit's environment
  assert.equal(other.result.enabled, true);
  assert.match(other.stderr, /still runs the recorded lifecycle; last-lifecycle.json stays on it/);
  assert.equal(pointer(s.base), gw.epoch);
  await gw.stop();
  assert.match(bootChild(dist, s.env).stderr, /clean-restart carry: 1\/1 /);
});

// A Gateway that runs alongside the recorded one -- the update-restart successor OpenClaw spawns, or
// one started by hand -- keeps last-lifecycle.json on the running one, but records that it ran
// alongside it. If it then crashes, is still running, or revoked a receipt, the next restart must not
// carry the recorded lifecycle's receipts even though that one exited cleanly (review of PR #655).
ltest('a lifecycle alongside the recorded one stops the carry unless it exited cleanly and revoked nothing', async (t) => {
  const cases = [
    {name: 'crashed', run: async (s) => { bootChild(dist, s.env, {exit: 'crash'}); }, reason: 'alongside-exit-not-clean'},
    {name: 'revoked', run: async (s) => {
      const other = bootChild(dist, s.env);
      fs.writeFileSync(path.join(other.dir, HASH(s.file) + '.revoked.json'), JSON.stringify({format: 'x', nonce: 'n'}), {mode: 0o600});
    }, reason: 'alongside-revoked'},
    {name: 'still running', run: async (s, t) => { const other = await runningGateway(dist, s.env); t.after(() => other.child.kill('SIGKILL')); }, reason: 'alongside-lifecycle-running'},
    {name: 'clean, nothing revoked', run: async (s) => { bootChild(dist, s.env); }, reason: null},
  ];
  for (const c of cases) {
    await t.test(c.name, async (t) => {
      const s = state(t);
      const gw = await runningGateway(dist, s.env);
      t.after(() => gw.child.kill('SIGKILL'));
      await c.run(s, t);
      const alongside = epochs(s.base).filter((e) => e !== gw.epoch).map((e) => JSON.parse(fs.readFileSync(path.join(s.base, e, 'lifecycle.json'), 'utf8')));
      assert.equal(alongside.length, 1);
      assert.equal(alongside[0].alongside, gw.epoch, 'the new lifecycle records the running one');
      assert.equal(pointer(s.base), gw.epoch);
      await gw.stop(); // the recorded Gateway exits cleanly
      const next = bootChild(dist, s.env);
      if (c.reason) assert.match(next.stderr, new RegExp(`clean-restart carry: 0/1 .*"\\*":"${c.reason}"`));
      else assert.match(next.stderr, /clean-restart carry: 1\/1 /);
    });
  }
});

ltest('lifecycles that do not record running alongside the previous one are ignored by the carry', async (t) => {
  const s = state(t);
  const first = bootChild(dist, s.env);
  // a crashed lifecycle written by older bytes (no "alongside"), like the 2026-11-26 strays on V
  const stray = path.join(s.base, '00000000-1111-2222-3333-444444444444');
  fs.mkdirSync(stray, {mode: 0o700});
  fs.writeFileSync(path.join(stray, 'lifecycle.json'), JSON.stringify({format: 'openclaw-db91-lifecycle-v1', epoch: path.basename(stray), bootId: JSON.parse(fs.readFileSync(path.join(first.dir, 'lifecycle.json'), 'utf8')).bootId, pid: 999999, startedAt: Date.now()}), {mode: 0o600});
  assert.match(bootChild(dist, s.env).stderr, /clean-restart carry: 1\/1 /);
});

// ---------------------------------------------------------------------------------------------- defect 2

function openAndVerify(s, env) {
  const calls = {full: 0, contracts: 0};
  const db = new DatabaseSync(s.file);
  try {
    gate.verifyCurrentAgentDatabase({db, filename: s.file, agentId: 'makaron', schemaSql: '', options: {}, env,
      verifyFull: () => { calls.full += 1; return 'full'; }, verifyContracts: () => { calls.contracts += 1; return 'contracts'; }});
  } finally {db.close();}
  return calls;
}
function afterCrash(s) {
  bootChild(dist, s.env); // a lifecycle
  const crashed = bootChild(dist, s.env, {exit: 'crash'});
  const next = bootChild(dist, s.env, {exit: 'crash'});
  assert.match(next.stderr, /clean-restart carry: 0\/1 .*previous-exit-not-clean/, 'after a crash the preflight checks in full');
  assert.match(next.stderr, /admission proofs 1\/1/);
  void crashed;
  return {env: {OPENCLAW_DB91_INTEGRITY_EPOCH: next.epoch, OPENCLAW_DB91_INTEGRITY_DIR: next.dir}, receipt: path.join(next.dir, HASH(s.file) + '.json')};
}

ltest('after a crash a missing receipt is restored from the admission check, not re-checked in full', (t) => {
  const s = state(t);
  const l = afterCrash(s);
  const checks = s.checks();
  assert.deepEqual(openAndVerify(s, l.env), {full: 0, contracts: 1}, 'receipt present: reused');
  fs.unlinkSync(l.receipt);
  assert.deepEqual(openAndVerify(s, l.env), {full: 0, contracts: 1}, 'receipt missing: restored, no full check');
  assert.equal(JSON.parse(fs.readFileSync(l.receipt, 'utf8')).source, 'native-verifier-child', 'the preflight proof is the receipt again');
  assert.equal(gate.getIntegrityGateStats().restored >= 1, true);
  assert.equal(s.checks(), checks);
});

ltest('the production gate checked the same database in full on the opening thread (the 2026-11-26 defect)', async (t) => {
  const s = state(t);
  const l = afterCrash(s);
  fs.unlinkSync(l.receipt);
  const prodGate = await import(pathToFileURL(path.join(makeDist('production'), 'db91-integrity-gate.mjs')).href);
  let full = 0;
  const db = new DatabaseSync(s.file);
  try {prodGate.verifyCurrentAgentDatabase({db, filename: s.file, agentId: 'makaron', schemaSql: '', options: {}, env: l.env, verifyFull: () => { full += 1; }, verifyContracts: () => {}});} finally {db.close();}
  assert.equal(full, 1);
});

ltest('revoked, replaced, schema-changed or expired databases are still checked in full', (t) => {
  const cases = {
    revoked: (s, l) => gate.invalidateVerification(s.file, {env: l.env, reason: 'test'}),
    'globally revoked': (s, l) => { gate.invalidateAllVerifications({env: l.env}); fs.unlinkSync(l.receipt); },
    replaced: (s, l) => { fs.unlinkSync(l.receipt); fs.copyFileSync(s.file, s.file + '.copy'); fs.renameSync(s.file + '.copy', s.file); },
    'schema changed': (s, l) => { fs.unlinkSync(l.receipt); const db = new DatabaseSync(s.file); db.exec('CREATE TABLE added (y)'); db.close(); },
    expired: (s, l) => {
      fs.unlinkSync(l.receipt);
      const file = path.join(l.env.OPENCLAW_DB91_INTEGRITY_DIR, 'admission.json');
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const proof of Object.values(record.databases)) proof.checkedAt = Date.now() - gate.MAX_AGE_MS - 60_000;
      fs.rmSync(file); fs.writeFileSync(file, JSON.stringify(record), {mode: 0o600});
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const s = state(t);
    const l = afterCrash(s);
    mutate(s, l);
    assert.deepEqual(openAndVerify(s, l.env), {full: 1, contracts: 0}, name);
  }
});

ltest('the admission record is written once and only for this lifecycle', (t) => {
  const s = state(t);
  const l = afterCrash(s);
  const file = path.join(l.env.OPENCLAW_DB91_INTEGRITY_DIR, 'admission.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(record.epoch, l.env.OPENCLAW_DB91_INTEGRITY_EPOCH);
  assert.deepEqual(Object.keys(record.databases), [HASH(s.file)]);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(() => gate.publishAdmission(Object.values(record.databases), {env: l.env}), {code: 'EEXIST'});
  // another lifecycle's record is ignored
  const other = bootChild(dist, s.env, {exit: 'crash'});
  const otherEnv = {OPENCLAW_DB91_INTEGRITY_EPOCH: other.epoch, OPENCLAW_DB91_INTEGRITY_DIR: other.dir};
  fs.rmSync(path.join(other.dir, 'admission.json'));
  fs.copyFileSync(file, path.join(other.dir, 'admission.json'));
  fs.unlinkSync(path.join(other.dir, HASH(s.file) + '.json'));
  assert.deepEqual(openAndVerify(s, otherEnv), {full: 1, contracts: 0});
});

ltest('clean restart and crash behaviour of the preflight is unchanged', (t) => {
  const s = state(t);
  const a = bootChild(dist, s.env);
  assert.match(a.stderr, /full check for 1/);
  const b = bootChild(dist, s.env);
  assert.match(b.stderr, /clean-restart carry: 1\/1 .*full check for 0/);
  assert.match(b.stderr, /admission proofs 1\/1/, 'carried proofs are admission proofs too');
  const c = bootChild(dist, s.env, {exit: 'crash'});
  void c;
  const d = bootChild(dist, s.env);
  assert.match(d.stderr, /full check for 1; \{"\*":"previous-exit-not-clean"\}/);
  assert.equal(s.checks(), 2);
});
