// node --test tests/v-storage-governance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertExtraSnapshotRoot, eligibleSnapshot, inspectTree, pruneSnapshots } from '../ops/v-storage-governance/core.mjs';

const OLD = Date.now() / 1000 - 5 * 24 * 3600;
const deadPid = 999_999_001;

function snapshot(root, name, files, { old = true } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  for (const [file, bytes] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), Buffer.alloc(bytes, 1));
    if (old) fs.utimesSync(path.join(dir, file), OLD, OLD);
  }
  if (old) fs.utimesSync(dir, OLD, OLD);
  return dir;
}
const pidExists = (pid) => pid === process.pid;

test('the interrupted-copy layout seen on V is eligible', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vsg-')));
  // Exactly what V carries since 2026-10-17: the database plus OpenClaw's staging copies.
  for (const files of [{ 'database.sqlite': 4096, first: 4096 }, { 'database.sqlite': 4096, first: 4096, second: 4096 }, { first: 4096 }]) {
    const name = `openclaw-sqlite-readonly-${deadPid}-Ab12Cd`;
    const dir = snapshot(root, name, files);
    // ctime cannot be backdated, so judge it as if five days have passed.
    const verdict = eligibleSnapshot(name, inspectTree(dir), { pidExists, ageHours: 48, now: Date.now() + 5 * 24 * 3600_000 });
    assert.deepEqual(verdict, { eligible: true, reason: 'expired-orphan-readonly-snapshot' }, JSON.stringify(files));
    fs.rmSync(dir, { recursive: true });
  }
});

test('anything that is not a snapshot is still refused', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vsg-')));
  const later = Date.now() + 5 * 24 * 3600_000;
  const judge = (name, opts = {}) => eligibleSnapshot(name, inspectTree(path.join(root, name)), { pidExists, ageHours: 48, now: later, ...opts }).reason;

  snapshot(root, `openclaw-sqlite-readonly-${deadPid}-Unknow`, { 'database.sqlite': 10, 'notes.txt': 10 });
  assert.equal(judge(`openclaw-sqlite-readonly-${deadPid}-Unknow`), 'unrecognized-content');

  snapshot(root, `openclaw-sqlite-readonly-${process.pid}-Alive1`, { 'database.sqlite': 10, first: 10 });
  assert.equal(judge(`openclaw-sqlite-readonly-${process.pid}-Alive1`), 'creator-pid-still-exists');

  snapshot(root, `openclaw-sqlite-readonly-${deadPid}-Recent`, { 'database.sqlite': 10, first: 10 }, { old: false });
  assert.equal(judge(`openclaw-sqlite-readonly-${deadPid}-Recent`, { now: Date.now() }), 'too-recent');

  const linked = snapshot(root, `openclaw-sqlite-readonly-${deadPid}-Linked`, { 'database.sqlite': 10 });
  fs.symlinkSync('/etc/hostname', path.join(linked, 'first'));
  assert.equal(judge(`openclaw-sqlite-readonly-${deadPid}-Linked`), 'linked-content');

  const nested = snapshot(root, `openclaw-sqlite-readonly-${deadPid}-Nested`, { 'database.sqlite': 10 });
  fs.mkdirSync(path.join(nested, 'first'));
  assert.equal(judge(`openclaw-sqlite-readonly-${deadPid}-Nested`), 'nested-content');

  snapshot(root, `openclaw-sqlite-readonly-${deadPid}-Empty1`, {});
  assert.equal(judge(`openclaw-sqlite-readonly-${deadPid}-Empty1`), 'no-snapshot-database');

  snapshot(root, 'openclaw-sqlite-readonly-stage', { first: 10 });
  assert.equal(judge('openclaw-sqlite-readonly-stage'), 'unrecognized-name');
});

test('pruneSnapshots removes only eligible snapshots, across roots, within the per-run limit', () => {
  const cache = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vsg-cache-')));
  const nightshift = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vsg-ns-')));
  const keepAlive = snapshot(cache, `openclaw-sqlite-readonly-${process.pid}-KeepMe`, { 'database.sqlite': 10, first: 10 });
  const keepOther = path.join(nightshift, 'unrelated-dir');
  fs.mkdirSync(keepOther);
  for (let i = 0; i < 5; i++) snapshot(nightshift, `openclaw-sqlite-readonly-${deadPid + i}-Gone0${i}`, { 'database.sqlite': 8192, first: 8192 });
  snapshot(cache, `openclaw-sqlite-readonly-${deadPid + 9}-Busy01`, { 'database.sqlite': 10 });

  const later = Date.now() + 5 * 24 * 3600_000;
  const references = (paths) => (paths.some((p) => p.endsWith('Busy01')) ? [{ pid: 1, kind: 'fd/3' }] : []);
  const recorded = [];
  let checks = 0;

  const audit = pruneSnapshots([{ dir: cache, alternate: '/nonexistent' }, { dir: nightshift }], { apply: false, ageHours: 48, maxDeletes: 3, pidExists, references, now: later });
  assert.equal(audit.actions.length, 3);
  assert.equal(fs.readdirSync(nightshift).length, 6, 'audit deletes nothing');

  const run = pruneSnapshots([{ dir: cache, alternate: '/nonexistent' }, { dir: nightshift }], {
    apply: true, ageHours: 48, maxDeletes: 3, pidExists, references, now: later,
    beforeDelete: () => checks++, record: (e) => recorded.push(e),
  });
  assert.equal(run.actions.length, 3);
  assert.equal(checks, 3, 'mounts re-verified before every deletion');
  assert.equal(recorded.length, 3);
  assert.deepEqual(run.skipped.map((s) => s.reason).sort(), ['creator-pid-still-exists', 'in-use', 'per-run-limit', 'per-run-limit']);
  assert.ok(fs.existsSync(keepAlive) && fs.existsSync(keepOther));
  assert.equal(fs.readdirSync(nightshift).filter((n) => n.startsWith('openclaw-sqlite-readonly-')).length, 2);

  const second = pruneSnapshots([{ dir: nightshift }], { apply: true, ageHours: 48, maxDeletes: 3, pidExists, references, now: later });
  assert.equal(second.actions.length, 2);
  assert.deepEqual(fs.readdirSync(nightshift), ['unrelated-dir']);
});

test('an extra root must be a real directory owned by the service user', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vsg-root-')));
  const real = fs.realpathSync(root);
  assertExtraSnapshotRoot(real, { uid: process.getuid() });
  assert.throws(() => assertExtraSnapshotRoot(real, { uid: process.getuid() + 1 }), /service user/);
  const link = real + '-link';
  fs.symlinkSync(real, link);
  assert.throws(() => assertExtraSnapshotRoot(link, { uid: process.getuid() }), /canonical/);
  assert.throws(() => assertExtraSnapshotRoot('relative/dir', { uid: process.getuid() }), /absolute/);
});
