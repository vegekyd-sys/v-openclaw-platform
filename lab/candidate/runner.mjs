// Self-contained: sent over SSH from the task worktree, never installed over shared tools.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import net from 'node:net';

const LAB = '/srv/vlab-production-mirror/labs';
const ROOT = LAB + '/candidate-tests';
const SHARED = LAB + '/shared-workflow';
const INSTANCE = LAB + '/instances/db91-parity';
const RUNTIME = INSTANCE + '/runtime';
const NODE = '/opt/vlab/node-v22.23.1-linux-x64/bin/node';
const UNIT = 'openclaw-vlab-production-mirror-v8.service';
const hash = b => createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const exec = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', maxBuffer: Infinity, ...options}).trim();
const save = (p, value) => fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
function relative(s) {
  assert(typeof s === 'string' && s.length && !s.includes('\\') && !s.includes('\0') && !path.isAbsolute(s));
  assert(s.split('/').every(x => x && x !== '.' && x !== '..'), 'Invalid relative path');
  return s;
}
function within(root, rel) {
  const p = path.join(root, relative(rel));
  let ancestor = p;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  assert(fs.realpathSync(ancestor) === ancestor, 'Symlink input or target');
  return p;
}
function live() {
  const pid = Number(exec('systemctl', ['show', UNIT, '-p', 'MainPID', '--value']));
  assert(pid > 1);
  const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map(s => {
    const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)];
  }));
  assert(env.OPENCLAW_STATE_DIR === INSTANCE + '/state');
  assert(env.OPENCLAW_CONFIG_PATH.startsWith(env.OPENCLAW_STATE_DIR + '/'));
  const args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
  assert(args.includes(RUNTIME + '/openclaw/dist/index.js'), 'Candidate baseline currently supports the stable runtime path');
  const raw = fs.readFileSync(env.OPENCLAW_CONFIG_PATH);
  const config = JSON.parse(raw);
  assert(config.gateway.port === 24993);
  return {pid, env, configPath: env.OPENCLAW_CONFIG_PATH, state: env.OPENCLAW_STATE_DIR, config, configSha256: hash(raw), current: read(SHARED + '/current.json')};
}
// Only the diagnostic fixture is redacted. Execution keeps the server configuration and environment.
export function fixtureConfig(value, key = '') {
  if (/(api.?key|token$|password|secret|credential|authorization|cookie|private.?key)/i.test(key) && typeof value === 'string')
    return 'candidate-redacted';
  if (typeof value === 'string') return value.replace(/\$\{[^}]+\}/g, 'candidate-redacted').replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/g, '$1candidate-redacted@');
  if (Array.isArray(value)) return value.map(v => fixtureConfig(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fixtureConfig(v, k)]));
  return value;
}
export function privateConfig(config, state, dataRoot, runtimeRoot, port) {
  const c = JSON.parse(JSON.stringify(config).replaceAll(state, dataRoot + '/state').replaceAll(RUNTIME, runtimeRoot));
  c.gateway = {...c.gateway, port};
  c.agents.defaults.workspace = dataRoot + '/workspace';
  for (const [id, a] of Object.entries(c.agents.entries ?? {})) {
    a.workspace = dataRoot + '/workspace/' + id; a.agentDir = dataRoot + '/state/agents/' + id + '/agent';
  }
  return c;
}
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function baseline(l) {
  const key = l.current.runtimeSha;
  assert(/^[a-f0-9]{64}$/.test(key));
  const dest = ROOT + '/baselines/' + key;
  if (fs.existsSync(dest + '/manifest.json') && read(dest + '/manifest.json').verified) return {path: dest, hit: true};
  const lock = dest + '.lock';
  try { fs.mkdirSync(lock); } catch (e) { if (e.code === 'EEXIST') throw Error('One-time baseline capture is in progress; retry after it finishes'); throw e; }
  const temp = dest + '.preparing-' + process.pid;
  const copy = p => exec('rsync', ['-a', '--chown=0:0', '--exclude=.env', '--exclude=.env.*', '--exclude=.npmrc',
    '--exclude=*.sqlite', '--exclude=*.sqlite-wal', '--exclude=*.sqlite-shm', '--exclude=*.jsonl', '--exclude=/credentials', '--exclude=auth-profiles.json', RUNTIME + '/', p + '/runtime/']);
  try {
    if (fs.existsSync(dest + '/manifest.json')) {
      copy(dest);
      assert.equal(fingerprint(dest + '/runtime'), key, 'Cached runtime does not match registered release');
      fs.writeFileSync(dest + '/manifest.json', JSON.stringify({...read(dest + '/manifest.json'), verified: true}));
      return {path: dest, hit: true};
    }
    fs.mkdirSync(temp, {mode: 0o700});
    copy(temp);
    const after = live();
    assert.equal(after.current.runtimeSha, key, 'Shared runtime changed during baseline capture');
    assert.equal(after.pid, l.pid, 'Shared runtime restarted during baseline capture');
    assert.equal(fingerprint(temp + '/runtime'), key, 'Captured runtime does not match registered release');
    save(temp + '/manifest.json', {runtimeSha: key, release: l.current.release, verified: true, capturedAt: new Date().toISOString()});
    fs.renameSync(temp, dest);
    return {path: dest, hit: false};
  } finally {
    fs.rmSync(temp, {recursive: true, force: true}); fs.rmdirSync(lock);
  }
}
function fingerprint(root) {
  const entries = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const p = path.join(dir, e.name), rel = path.relative(root, p);
      if (e.name === '.env' || e.name.startsWith('.env.') || e.name === '.npmrc' || /\.(sqlite|jsonl)$/.test(e.name)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isSymbolicLink()) entries.push([rel, 'link', fs.readlinkSync(p)]);
      else if (e.isFile()) entries.push([rel, 'file', hash(fs.readFileSync(p)), fs.statSync(p).mode & 0o777]);
      else throw Error('Unexpected runtime file: ' + rel);
    }
  }
  walk(root); return hash(JSON.stringify(entries));
}
function backupDatabase(source, dest) {
  const script = `import sqlite3,sys,os
src,dst=sys.argv[1:]
db=sqlite3.connect('file:'+src+'?mode=ro',uri=True)
out=sqlite3.connect(dst)
db.backup(out,pages=256,sleep=0.01)
assert out.execute('PRAGMA quick_check').fetchone()[0]=='ok'
out.close();db.close()
print(os.path.getsize(dst))`;
  return Number(exec('python3', ['-c', script, source, dest]));
}
function executeCandidate(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('systemd-run', args, {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    p.stdout.on('data', b => {stdout += b;}); p.stderr.on('data', b => {stderr += b;});
    p.on('error', reject);
    p.on('close', (code, signal) => resolve({code, signal, stdout, stderr}));
  });
}
export async function run(req) {
  assert.equal(os.hostname(), 'VM-0-4-ubuntu'); assert.equal(process.getuid(), 0);
  assert(Number.isFinite(req.timeoutSeconds) && req.timeoutSeconds >= 0, 'timeoutSeconds must be non-negative; 0 means unlimited');
  const timings = {}, start = performance.now();
  let last = start;
  const mark = key => { const now = performance.now(); timings[key] = Math.round(now - last); last = now; };
  for (const d of ['baselines', 'runs', 'receipts']) fs.mkdirSync(ROOT + '/' + d, {recursive: true, mode: 0o700});
  const id = 'candidate-' + randomUUID(), dir = ROOT + '/runs/' + id;
  const unit = 'vlab-' + id;
  let result;
  try {
    fs.mkdirSync(dir, {mode: 0o700});
    const l = live();
    if (req.baseRelease) assert.equal(req.baseRelease, l.current.release, 'Candidate baseRelease changed');
    mark('inspectMs');
    const base = baseline(l); mark('baselineMs');
    // Runtime is writable. Never expose cache hardlinks to an unrestricted test.
    exec('cp', ['-a', '--reflink=auto', base.path + '/runtime', dir + '/runtime']);
    fs.mkdirSync(dir + '/inputs'); fs.mkdirSync(dir + '/patches'); fs.mkdirSync(dir + '/data');
    fs.mkdirSync(dir + '/data/state', {recursive: true}); fs.mkdirSync(dir + '/data/workspace');
    fs.mkdirSync(dir + '/fixture');
    const config = privateConfig(l.config, l.state, dir + '/data', dir + '/runtime', await availablePort());
    save(dir + '/data/state/openclaw.json', config);
    save(dir + '/fixture/shared-config.json', fixtureConfig(l.config));
    for (const [id] of Object.entries(config.agents.entries ?? {})) {
      fs.mkdirSync(dir + '/data/state/agents/' + id + '/agent', {recursive: true});
      fs.mkdirSync(dir + '/data/workspace/' + id, {recursive: true});
    }
    let databaseBytes = 0;
    const databases = req.databases.map(rel => {
      relative(rel);
      const source = within(l.state, rel), dest = within(dir + '/data/state', rel);
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      const bytes = backupDatabase(source, dest); databaseBytes += bytes;
      return {source: rel, bytes};
    });
    mark('snapshotMs');
    const seen = new Set();
    for (const f of req.inputs) {
      const dest = within(dir + '/inputs', f.source), bytes = Buffer.from(f.content, 'base64');
      assert.equal(hash(bytes), f.sha256); assert(!seen.has(f.source)); seen.add(f.source);
      fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.writeFileSync(dest, bytes, {flag: 'wx', mode: 0o600});
    }
    const targets = new Set();
    for (const f of req.files) {
      const dest = within(dir + '/runtime', f.target);
      assert(!targets.has(f.target)); targets.add(f.target);
      const before = fs.existsSync(dest) ? hash(fs.readFileSync(dest)) : null;
      if(f.before !== undefined) assert.equal(f.before, before, 'Candidate before hash mismatch: ' + f.target);
      const bytes = Buffer.from(f.content, 'base64'); assert.equal(hash(bytes), f.sha256);
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      const tmp = dir + '/patches/' + targets.size;
      fs.writeFileSync(tmp, bytes, {flag: 'wx', mode: 0o644});
      fs.renameSync(tmp, dest);
    }
    for (const t of req.tests) assert(seen.has(t), 'Missing test input');
    mark('overlayMs');
    const inherited = Object.fromEntries(Object.entries({...process.env, ...l.env}).map(([key, value]) => [key, value.replaceAll(l.state, dir + '/data/state').replaceAll(RUNTIME, dir + '/runtime')]));
    const env = {...inherited,
      OPENCLAW_HOME: dir + '/data', OPENCLAW_STATE_DIR: dir + '/data/state',
      OPENCLAW_CONFIG_PATH: dir + '/data/state/openclaw.json', OPENCLAW_WORKSPACE_DIR: dir + '/data/workspace',
      VLAB_CANDIDATE_RUNTIME: dir + '/runtime', VLAB_SHARED_CONFIG_FIXTURE: dir + '/fixture/shared-config.json',
      VLAB_SHARED_STATE_DIR: l.state, VLAB_SHARED_CONFIG_PATH: l.configPath,
      VLAB_CANDIDATE_DATA: dir + '/data', VLAB_CANDIDATE_ID: id, VLAB_CANDIDATE_UNIT: unit + '.service',
      ...req.env};
    // Keep credentials server-side, out of argv and receipts. The agent chooses overrides.
    save(dir + '/environment.json', env);
    const launch = "const fs=require('node:fs'),cp=require('node:child_process');const e=JSON.parse(fs.readFileSync(process.argv[1]));const p=cp.spawn(process.argv[2],process.argv.slice(3),{env:e,stdio:'inherit'});p.on('error',e=>{console.error(e.message);process.exitCode=1});p.on('exit',(code)=>{process.exitCode=code??1});";
    const command = req.command ?? [NODE, '--test', ...req.tests.map(t => dir + '/inputs/' + t)];
    assert(Array.isArray(command) && command.length && command.every(v => typeof v === 'string'), 'command must be an argv array');
    if (req.user) {
      exec('id', ['-u', String(req.user)]);
      fs.chmodSync(ROOT, 0o711); fs.chmodSync(ROOT + '/runs', 0o711);
      exec('chown', ['-R', String(req.user), dir]);
    }
    const outcome = await executeCandidate(['--quiet', '--wait', '--pipe', '--collect', '--unit=' + unit,
      '-p', 'KillMode=control-group', '-p', 'UMask=0077', '-p', 'TasksMax=infinity',
      '-p', 'WorkingDirectory=' + (req.cwd ?? dir + '/inputs'),
      ...(req.user ? ['-p', 'User=' + req.user] : []),
      ...(req.timeoutSeconds ? ['-p', 'RuntimeMaxSec=' + req.timeoutSeconds] : []),
      NODE, '-e', launch, dir + '/environment.json', ...command]);
    mark('testMs');
    let after, sharedObservationError;
    try {after = live();} catch (e) {sharedObservationError = e.message;}
    const sharedUnchanged = Boolean(after && after.pid === l.pid && after.configSha256 === l.configSha256 && after.current.runtimeSha === l.current.runtimeSha);
    // A concurrent Dev deployment does not invalidate a test on its frozen inputs.
    // Record drift for later integration/rebase decisions instead of serializing development.
    result = {id, ok: outcome.code === 0, owner: req.owner,
      sourceCommit: req.sourceCommit, branch: req.branch, dirty: req.dirty, inputSha256: req.inputSha256, runnerSha256: req.runnerSha256,
      baseRelease: l.current.release, runtimeSha: l.current.runtimeSha, configSha256: l.configSha256,
      baselineCacheHit: base.hit, databases, databaseBytes, patchCount: req.files.length,
      files: req.files.map(({source, target, before, sha256}) => ({source, target, before, after: sha256})),
      sharedBeforePid: l.pid, sharedAfterPid: after?.pid ?? null, sharedUnchanged, sharedObservationError, integrationLeaseRequired: false,
      executionUser: req.user ?? 'root', network: 'host', restrictions: 'none imposed by candidate runner', timeoutSeconds: req.timeoutSeconds, timings, outcome, totalServerMs: Math.round(performance.now() - start),
      acceptance: 'Evidence covers the scenarios selected and actually exercised by the agent'};
    save(ROOT + '/receipts/' + id + '.json', result);
    return result;
  } finally {
    // Only this test's transient service and disposable files are removed.
    try {exec('systemctl', ['stop', unit + '.service'], {timeout: 10000, stdio: 'ignore'});} catch {}
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
