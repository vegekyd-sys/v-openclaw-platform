// Self-contained: sent over SSH from the task worktree, never installed over shared tools.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';

const LAB = '/srv/vlab-production-mirror/labs';
const ROOT = LAB + '/candidate-tests';
const SHARED = LAB + '/shared-workflow';
const INSTANCE = LAB + '/instances/db91-parity';
const RUNTIME = INSTANCE + '/runtime';
const NODE = '/opt/vlab/node-v22.23.1-linux-x64/bin/node';
const UNIT = 'openclaw-vlab-production-mirror-v8.service';
const hash = b => createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const exec = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', timeout: 90000, maxBuffer: 2 * 1024 ** 2, ...options}).trim();
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
  return {pid, state: env.OPENCLAW_STATE_DIR, config, configSha256: hash(raw), current: read(SHARED + '/current.json')};
}
// Secrets stay out of fixtures and stdout. This lane deliberately has no network or provider credentials.
export function fixtureConfig(value, key = '') {
  if (/(api.?key|token$|password|secret|credential|authorization|cookie|private.?key)/i.test(key) && typeof value === 'string')
    return 'candidate-redacted';
  if (typeof value === 'string') return value.replace(/\$\{[^}]+\}/g, 'candidate-redacted').replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/g, '$1candidate-redacted@');
  if (Array.isArray(value)) return value.map(v => fixtureConfig(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fixtureConfig(v, k)]));
  return value;
}
export function privateConfig(config, state) {
  const c = JSON.parse(JSON.stringify(fixtureConfig(config)).replaceAll(state, '/data/state'));
  c.gateway = {...c.gateway, port: 26400, bind: 'loopback', reload: {mode: 'off'}, auth: {mode: 'token', token: 'candidate-local-only'}};
  c.channels = {}; c.bindings = []; c.cron = {...c.cron, enabled: false}; c.browser = {...c.browser, enabled: false};
  c.agents.defaults.workspace = '/data/workspace';
  c.agents.defaults.heartbeat = {every: '0m'};
  for (const [id, a] of Object.entries(c.agents.entries ?? {})) {
    a.workspace = '/data/workspace/' + id; a.agentDir = '/data/state/agents/' + id + '/agent';
  }
  // Original plugin config remains in the read-only fixture; only candidate code is mounted.
  c.plugins = {enabled: false, allow: [], load: {paths: []}, entries: {}};
  return c;
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
function backupDatabase(source, dest, maxBytes) {
  const script = `import sqlite3,sys,time,os
src,dst,limit=sys.argv[1],sys.argv[2],int(sys.argv[3])
start=time.monotonic()
def progress(status,remaining,total):
 if time.monotonic()-start>15: raise RuntimeError('SQLite snapshot deadline')
 if total*page>limit: raise RuntimeError('SQLite snapshot size limit')
db=sqlite3.connect('file:'+src+'?mode=ro',uri=True,timeout=2)
page=db.execute('PRAGMA page_size').fetchone()[0]
out=sqlite3.connect(dst)
db.backup(out,pages=256,progress=progress,sleep=0.01)
assert out.execute('PRAGMA quick_check').fetchone()[0]=='ok'
out.close();db.close()
print(os.path.getsize(dst))`;
  return Number(exec('python3', ['-c', script, source, dest, String(maxBytes)], {timeout: 20000}));
}
function boundedRun(args, timeoutSeconds) {
  return new Promise((resolve, reject) => {
    const p = spawn('systemd-run', args, {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '', overflow = false;
    const collect = key => b => {
      if (key === 'stdout') stdout += b; else stderr += b;
      if (stdout.length + stderr.length > 1024 ** 2) { overflow = true; p.kill('SIGTERM'); }
    };
    p.stdout.on('data', collect('stdout')); p.stderr.on('data', collect('stderr'));
    const timer = setTimeout(() => p.kill('SIGTERM'), (timeoutSeconds + 15) * 1000);
    p.on('error', e => {clearTimeout(timer); reject(e);});
    p.on('close', (code, signal) => {clearTimeout(timer); resolve({code, signal, stdout: stdout.slice(0, 1024 ** 2), stderr: stderr.slice(0, 1024 ** 2), overflow});});
  });
}
export async function run(req) {
  assert.equal(os.hostname(), 'VM-0-4-ubuntu'); assert.equal(process.getuid(), 0);
  assert(/^[\w-]{1,100}$/.test(req.owner));
  assert(Number.isInteger(req.timeoutSeconds) && req.timeoutSeconds >= 1 && req.timeoutSeconds <= 300);
  const timings = {}, start = performance.now();
  let last = start;
  const mark = key => { const now = performance.now(); timings[key] = Math.round(now - last); last = now; };
  for (const d of ['baselines', 'runs', 'slots', 'receipts']) fs.mkdirSync(ROOT + '/' + d, {recursive: true, mode: 0o700});
  const free = fs.statfsSync(ROOT); assert(free.bavail * free.bsize > 5 * 1024 ** 3, 'Candidate disk reserve below 5 GiB');
  let slot;
  for (let i = 0; i < 2; i++) {
    try { fs.mkdirSync(ROOT + '/slots/' + i); slot = ROOT + '/slots/' + i; break; }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  assert(slot, 'Two candidate tests are running; retry when one finishes (shared integration lease is unrelated)');
  const id = 'candidate-' + randomUUID(), dir = ROOT + '/runs/' + id;
  const unit = 'vlab-' + id;
  let result;
  try {
    save(slot + '/owner.json', {owner: req.owner, id, pid: process.pid});
    fs.mkdirSync(dir, {mode: 0o700});
    const l = live();
    if (req.baseRelease) assert.equal(req.baseRelease, l.current.release, 'Candidate baseRelease changed');
    mark('inspectMs');
    const base = baseline(l); mark('baselineMs');
    // Directory metadata is private; unchanged file bytes are shared read-only.
    exec('cp', ['-al', base.path + '/runtime', dir + '/runtime']);
    fs.mkdirSync(dir + '/inputs'); fs.mkdirSync(dir + '/patches'); fs.mkdirSync(dir + '/data');
    fs.mkdirSync(dir + '/data/state', {recursive: true}); fs.mkdirSync(dir + '/data/workspace');
    fs.mkdirSync(dir + '/fixture');
    const config = privateConfig(l.config, l.state);
    save(dir + '/data/state/openclaw.json', config);
    save(dir + '/fixture/shared-config.json', fixtureConfig(l.config));
    for (const [id] of Object.entries(config.agents.entries ?? {})) {
      fs.mkdirSync(dir + '/data/state/agents/' + id + '/agent', {recursive: true});
      fs.mkdirSync(dir + '/data/workspace/' + id, {recursive: true});
    }
    let databaseBytes = 0;
    assert(req.databases.length <= 3);
    const databases = req.databases.map(rel => {
      assert(/\.(sqlite|db)$/.test(relative(rel)) && !/(auth|credential|secret)/i.test(rel));
      const source = within(l.state, rel), dest = within(dir + '/data/state', rel);
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      assert(fs.statSync(source).size <= 512 * 1024 ** 2, 'Select a smaller database; whole Agent databases are not copied implicitly');
      const bytes = backupDatabase(source, dest, 512 * 1024 ** 2); databaseBytes += bytes;
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
      assert(/^(openclaw|production-worker|worker|npm)\//.test(f.target));
      assert(/\.(mjs|js|cjs|json|wasm|node|ts|map)$/.test(f.target));
      const dest = within(dir + '/runtime', f.target);
      assert(!targets.has(f.target)); targets.add(f.target);
      const before = fs.existsSync(dest) ? hash(fs.readFileSync(dest)) : null;
      assert.equal(f.before, before, 'Candidate before hash mismatch: ' + f.target);
      const bytes = Buffer.from(f.content, 'base64'); assert.equal(hash(bytes), f.sha256);
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      const tmp = dir + '/patches/' + targets.size;
      fs.writeFileSync(tmp, bytes, {flag: 'wx', mode: 0o644});
      fs.renameSync(tmp, dest); // replace inode; never write a shared baseline hardlink
    }
    for (const t of req.tests) assert(seen.has(t), 'Missing test input');
    mark('overlayMs');
    const bw = ['bwrap', '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv',
      '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
      '--ro-bind', path.dirname(path.dirname(NODE)), '/opt/node', '--ro-bind', 'runtime', '/runtime',
      '--ro-bind', 'inputs', '/candidate', '--ro-bind', 'fixture', '/fixture',
      '--bind', 'data', '/data', '--tmpfs', '/tmp', '--proc', '/proc', '--dev', '/dev', '--chdir', '/candidate'];
    const env = {PATH: '/opt/node/bin:/usr/bin', HOME: '/data', OPENCLAW_HOME: '/data', OPENCLAW_STATE_DIR: '/data/state',
      OPENCLAW_CONFIG_PATH: '/data/state/openclaw.json', OPENCLAW_WORKSPACE_DIR: '/data/workspace',
      VLAB_CANDIDATE_RUNTIME: '/runtime', VLAB_SHARED_CONFIG_FIXTURE: '/fixture/shared-config.json',
      VLAB_CANDIDATE_ID: id, NODE_NO_WARNINGS: '1'};
    for (const [k, v] of Object.entries(env)) bw.push('--setenv', k, v);
    bw.push('/opt/node/bin/node', '--test', '--test-concurrency=1', ...req.tests.map(t => '/candidate/' + t));
    const outcome = await boundedRun(['--quiet', '--wait', '--pipe', '--collect', '--unit=' + unit,
      '-p', 'MemoryMax=1G', '-p', 'CPUQuota=100%', '-p', 'TasksMax=128', '-p', 'RuntimeMaxSec=' + req.timeoutSeconds,
      '-p', 'KillMode=control-group', '-p', 'UMask=0077', '-p', 'BindPaths=' + dir + ':/run/vlab-candidate', '-p', 'WorkingDirectory=/run/vlab-candidate', ...bw], req.timeoutSeconds);
    mark('testMs');
    let after, sharedObservationError;
    try {after = live();} catch (e) {sharedObservationError = e.message;}
    const sharedUnchanged = Boolean(after && after.pid === l.pid && after.configSha256 === l.configSha256 && after.current.runtimeSha === l.current.runtimeSha);
    // A concurrent Dev deployment does not invalidate a test on its frozen inputs.
    // Record drift for later integration/rebase decisions instead of serializing development.
    result = {id, ok: outcome.code === 0 && !outcome.overflow, owner: req.owner,
      sourceCommit: req.sourceCommit, branch: req.branch, dirty: req.dirty, inputSha256: req.inputSha256, runnerSha256: req.runnerSha256,
      baseRelease: l.current.release, runtimeSha: l.current.runtimeSha, configSha256: l.configSha256,
      baselineCacheHit: base.hit, databases, databaseBytes, patchCount: req.files.length,
      files: req.files.map(({source, target, before, sha256}) => ({source, target, before, after: sha256})),
      sharedBeforePid: l.pid, sharedAfterPid: after?.pid ?? null, sharedUnchanged, sharedObservationError, integrationLeaseRequired: false,
      network: 'isolated', timings, outcome, totalServerMs: Math.round(performance.now() - start),
      acceptance: 'Candidate code and selected real-data fixtures only; shared Gateway/provider/channel integration remains a final gate'};
    save(ROOT + '/receipts/' + id + '.json', result);
    return result;
  } finally {
    // Only this test's transient service and disposable files are removed.
    try {exec('systemctl', ['stop', unit + '.service'], {timeout: 10000, stdio: 'ignore'});} catch {}
    fs.rmSync(dir, {recursive: true, force: true}); fs.rmSync(slot, {recursive: true, force: true});
  }
}
