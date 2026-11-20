// Optional systemd-delegated memory isolation for the native read-only verifier.
// No verifier checks, cadence, result handling, or foreground limits change.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export const VERIFY_MEMORY_HIGH = 512 * 1024 ** 2;
export const VERIFY_MEMORY_MAX = 1024 ** 3;
export function prepareVerifyResourceGroup({env = process.env, io = fs, pid = process.pid, uid = process.getuid?.()} = {}) {
  if (!env.OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP) return null;
  assert.equal(env.OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP, '1', 'Invalid verifier resource group opt-in');
  assert(Number.isSafeInteger(uid) && uid > 0, 'Verifier resource group requires a non-root delegated service');
  const lines = io.readFileSync('/proc/self/cgroup', 'utf8').trim().split('\n');
  const unified = lines.filter(line => line.startsWith('0::'));
  assert.equal(unified.length, 1, 'Expected unified cgroup v2');
  const relative = unified[0].slice(3);
  assert(relative.startsWith('/') && !relative.split('/').includes('..'));
  assert.equal(path.basename(relative), 'foreground', 'Expected systemd DelegateSubgroup=foreground');
  const service = path.dirname(relative);
  assert(path.basename(service).endsWith('.service'), 'Expected a delegated service scope');
  const parent = '/sys/fs/cgroup' + service;
  assert.equal(io.realpathSync(parent), parent);
  assert.equal(io.statfsSync(parent).type, 0x63677270, 'Expected cgroup2 filesystem');
  assert.equal(io.lstatSync(parent).uid, uid, 'Service scope is not delegated to this owner');
  if (!io.readFileSync(parent + '/cgroup.subtree_control', 'utf8').split(/\s+/).includes('memory')) {
    assert(io.readFileSync(parent + '/cgroup.controllers', 'utf8').split(/\s+/).includes('memory'));
    assert.equal(io.readFileSync(parent + '/cgroup.procs', 'utf8').trim(), '', 'Refuse populated service parent');
    io.writeFileSync(parent + '/cgroup.subtree_control', '+memory');
  }
  const directory = parent + '/database-verifier';
  try { io.mkdirSync(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = io.lstatSync(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === uid);
  assert.equal(io.realpathSync(directory), directory);
  for (const [name, value] of [['memory.high', VERIFY_MEMORY_HIGH], ['memory.max', VERIFY_MEMORY_MAX], ['memory.swap.max', 0]]) {
    const filename = directory + '/' + name;
    assert.equal(io.realpathSync(filename), filename);
    io.writeFileSync(filename, String(value));
    assert.equal(io.readFileSync(filename, 'utf8').trim(), String(value));
  }
  return {directory, attach(childPid) {
    assert(Number.isSafeInteger(childPid) && childPid > 1 && childPid !== pid);
    const status = io.readFileSync('/proc/' + childPid + '/status', 'utf8');
    assert.equal(Number(status.match(/^PPid:\s+(\d+)/m)?.[1]), pid, 'Refuse a process not forked by this Gateway');
    assert.equal(Number(status.match(/^Uid:\s+(\d+)/m)?.[1]), uid, 'Refuse foreign process ownership');
    io.writeFileSync(directory + '/cgroup.procs', String(childPid));
    assert(io.readFileSync('/proc/' + childPid + '/cgroup', 'utf8').trim().split('\n').includes('0::' + service + '/database-verifier'));
  }};
}
