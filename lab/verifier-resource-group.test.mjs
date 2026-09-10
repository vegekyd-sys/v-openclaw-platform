import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {prepareVerifyResourceGroup, VERIFY_MEMORY_HIGH, VERIFY_MEMORY_MAX} from './release-files/database-verify-resource-group.mjs';
const parent = '/sys/fs/cgroup/system.slice/example.service';
function fixture() {
  const data = new Map([
    ['/proc/self/cgroup', '0::/system.slice/example.service/foreground\n'],
    [parent + '/cgroup.subtree_control', 'memory\n'],
    [parent + '/cgroup.controllers', 'cpu memory pids\n'],
    [parent + '/cgroup.procs', ''],
    ['/proc/200/status', 'PPid:\t100\nUid:\t1001\t1001\t1001\t1001\n'],
  ]), writes = [];
  const io = {
    readFileSync: name => {assert(data.has(name), 'Unexpected read ' + name); return data.get(name);},
    writeFileSync: (name, value) => {writes.push([name, value]); data.set(name, value); if (name.endsWith('/database-verifier/cgroup.procs')) data.set('/proc/200/cgroup', '0::/system.slice/example.service/database-verifier\n');},
    realpathSync: name => name,
    statfsSync: () => ({type: 0x63677270}),
    lstatSync: () => ({uid: 1001, isDirectory: () => true, isSymbolicLink: () => false}),
    mkdirSync: () => {},
  };
  return {data, writes, io, call: () => prepareVerifyResourceGroup({env: {OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP: '1'}, io, uid: 1001, pid: 100})};
}
test('default is unchanged and touches no filesystem', () => assert.equal(prepareVerifyResourceGroup({env: {}, io: new Proxy({}, {get: () => assert.fail()})}), null));
test('only verifier child receives limits; foreground and service limits are untouched', () => {
  const f = fixture(), group = f.call(); group.attach(200);
  assert.deepEqual(f.writes, [
    [parent + '/database-verifier/memory.high', String(VERIFY_MEMORY_HIGH)],
    [parent + '/database-verifier/memory.max', String(VERIFY_MEMORY_MAX)],
    [parent + '/database-verifier/memory.swap.max', '0'],
    [parent + '/database-verifier/cgroup.procs', '200'],
  ]);
});
test('empty delegated parent can enable memory; populated parent cannot', () => {
  const f = fixture(); f.data.set(parent + '/cgroup.subtree_control', ''); f.call(); assert.equal(f.writes[0][1], '+memory');
  const g = fixture(); g.data.set(parent + '/cgroup.subtree_control', ''); g.data.set(parent + '/cgroup.procs', '100'); assert.throws(g.call); assert.equal(g.writes.length, 0);
});
for (const kind of ['root', 'wrong-subgroup', 'traversal', 'wrong-filesystem', 'foreign-owner', 'symlink', 'bad-opt-in']) test('reject unsafe setup: ' + kind, () => {
  const f = fixture();
  if (kind === 'wrong-subgroup') f.data.set('/proc/self/cgroup', '0::/system.slice/example.service/other');
  if (kind === 'traversal') f.data.set('/proc/self/cgroup', '0::/../example.service/foreground');
  if (kind === 'wrong-filesystem') f.io.statfsSync = () => ({type: 1});
  if (kind === 'foreign-owner') f.io.lstatSync = () => ({uid: 2000});
  if (kind === 'symlink') f.io.realpathSync = () => '/another';
  assert.throws(() => prepareVerifyResourceGroup({env: {OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP: kind === 'bad-opt-in' ? 'yes' : '1'}, io: f.io, uid: kind === 'root' ? 0 : 1001, pid: 100}));
  assert.equal(f.writes.length, 0);
});
test('reject PID reuse, unrelated process and foreign UID before migration', () => {
  for (const status of ['PPid:\t101\nUid:\t1001', 'PPid:\t100\nUid:\t2000']) {
    const f = fixture(), group = f.call(); f.data.set('/proc/200/status', status); assert.throws(() => group.attach(200)); assert(!f.writes.some(([n]) => n.endsWith('/cgroup.procs')));
  }
});
test('native verification, proof publication, quarantine, timing and stop behavior remain byte-identical', () => {
  const s = fs.readFileSync(new URL('./release-files/openclaw-database-verify-a3Yme38Y.js', import.meta.url), 'utf8');
  const restored = s.replace('import {prepareVerifyResourceGroup} from "./database-verify-resource-group.mjs";\n', '')
    .replace('\t\tconst resourceGroup = prepareVerifyResourceGroup();\n', '')
    .replace('\t\tresourceGroup?.attach(worker.pid);\n', '')
    .replace('\t\tworker?.once("error", () => {});\n', '')
    .replace('\t\tworker?.kill();\n', '');
  const plan = JSON.parse(fs.readFileSync(new URL('./verifier-resource-group-plan.json', import.meta.url)));
  assert.equal(createHash('sha256').update(restored).digest('hex'), plan.files[0].before);
});
const nativeSource = fs.readFileSync(new URL('./release-files/openclaw-database-verify-a3Yme38Y.js', import.meta.url), 'utf8');
const workerBody = nativeSource.match(/function runDatabaseVerifyWorker\(targets, options = \{\}\) \{[\s\S]*?\n\}(?=\nasync function terminateDatabaseVerifyWorker)/)?.[0];
assert(workerBody);
const makeWorker = (prepare, fork) => new Function('prepareVerifyResourceGroup', 'fork', 'fileURLToPath', 'toStructuredErrorObject', 'isVerifyResult', 'DATABASE_VERIFY_CHILD_ARG', 'return (' + workerBody + ')')(prepare, fork, fileURLToPath, e => e, r => typeof r.path === 'string' && typeof r.ok === 'boolean', '--openclaw-database-verify-child');
test('resource attachment precedes native target dispatch and native results are unchanged', async () => {
  const child = new EventEmitter(), calls = [], result = [{path: '/db', ok: true}];
  Object.assign(child, {pid: 200, connected: true, kill: () => calls.push('kill'), send: () => {calls.push('send'); queueMicrotask(() => {child.emit('message', result); child.emit('exit', 0, null); child.connected = false; child.emit('disconnect');});}});
  const f = makeWorker(() => ({attach: pid => {assert.equal(pid, 200); calls.push('attach');}}), () => child);
  assert.equal(await f([{path: '/db'}], {workerUrl: new URL('file:///verify.js')}), result);
  assert.deepEqual(calls, ['attach', 'send']);
});
test('failed attachment terminates only its just-created child and never sends targets', async () => {
  const child = new EventEmitter(), error = new Error('delegation failed'); let killed = 0;
  Object.assign(child, {pid: 200, kill: () => killed++, send: () => assert.fail('dispatch before isolation')});
  const f = makeWorker(() => ({attach: () => {throw error;}}), () => child);
  await assert.rejects(f([], {workerUrl: new URL('file:///verify.js')}), e => e === error);
  assert.equal(killed, 1); child.emit('error', new Error('late spawn failure'));
});
test('invalid configured scope never forks; disabled isolation still follows native protocol', async () => {
  const error = new Error('invalid group');
  await assert.rejects(makeWorker(() => {throw error;}, () => assert.fail())([], {workerUrl: new URL('file:///verify.js')}), e => e === error);
  const child = new EventEmitter();
  Object.assign(child, {connected: true, send: () => queueMicrotask(() => {child.emit('message', []); child.connected = false; child.emit('disconnect'); child.emit('exit', 0, null);})});
  assert.deepEqual(await makeWorker(() => null, () => child)([], {workerUrl: new URL('file:///verify.js')}), []);
});
