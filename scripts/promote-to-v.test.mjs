import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertAcceptedReleaseBinding, assertPromotionLease, classifyAlignFailure, REMOTE } from './promote-to-v.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function acceptedFixture() {
  const release = 'offline-release', sourceCommit = 'a'.repeat(40);
  const artifact = { id: release, branch: 'dev', sourceCommit, files: [] };
  const artifactBytes = Buffer.from(JSON.stringify(artifact, null, 2) + '\n');
  const current = { release, accepted: true, sourceCommit, artifactSha: hash(artifactBytes) };
  const manifest = { id: release, branch: 'dev', sourceCommit, artifactSha: current.artifactSha };
  return { release, current, artifact, manifest, artifactBytes, manifestBytes: Buffer.from(JSON.stringify(manifest) + '\n') };
}

test('accepted current, manifest and exact artifact bytes bind one canonical source', () => {
  const f = acceptedFixture();
  assert.deepEqual(assertAcceptedReleaseBinding(f.current, f.release, f.manifestBytes, f.artifactBytes), f.artifact);
});

test('same artifact JSON with changed formatting is rejected by raw accepted SHA', () => {
  const f = acceptedFixture();
  assert.throws(() => assertAcceptedReleaseBinding(f.current, f.release, f.manifestBytes, Buffer.from(JSON.stringify(f.artifact))), /raw bytes/u);
});

test('reject stale acceptance, source mismatches, manifest SHA and release identities', () => {
  const f = acceptedFixture();
  for (const current of [
    { ...f.current, accepted: false }, { ...f.current, release: 'previous' },
    { ...f.current, sourceCommit: 'b'.repeat(40) }, { ...f.current, artifactSha: undefined },
  ]) assert.throws(() => assertAcceptedReleaseBinding(current, f.release, f.manifestBytes, f.artifactBytes));
  for (const change of [
    { sourceCommit: 'b'.repeat(40) }, { artifactSha: 'b'.repeat(64) }, { id: 'previous' }, { branch: 'task' },
  ]) assert.throws(() => assertAcceptedReleaseBinding(f.current, f.release, Buffer.from(JSON.stringify({ ...f.manifest, ...change })), f.artifactBytes));
  // Even a self-consistent new SHA cannot silently replace the accepted source.
  for (const change of [{ sourceCommit: 'b'.repeat(40) }, { id: 'previous' }, { branch: 'task' }]) {
    const bytes = Buffer.from(JSON.stringify({ ...f.artifact, ...change }));
    const artifactSha = hash(bytes);
    assert.throws(() => assertAcceptedReleaseBinding({ ...f.current, artifactSha }, f.release,
      Buffer.from(JSON.stringify({ ...f.manifest, artifactSha })), bytes));
  }
});

test('apply requires the current integration lease and no pending shared cutover', () => {
  const status = { lease: { owner: 'this-task' }, pending: null };
  assertPromotionLease(status, 'this-task');
  for (const [value, owner] of [[status, undefined], [status, 'another-task'], [{ ...status, lease: null }, 'this-task'],
    [{ ...status, pending: { release: 'next' } }, 'this-task'], [{ lease: status.lease }, 'this-task']])
    assert.throws(() => assertPromotionLease(value, owner));
});

function withFiles(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-offline-'));
  try { callback(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function stage(dir) {
  const target = path.join(dir, 'runtime', 'existing.mjs'), added = path.join(dir, 'runtime', 'new.mjs');
  fs.mkdirSync(path.dirname(target)); fs.writeFileSync(target, 'original\n', { mode: 0o640 });
  // A privileged local test uses a different owner to exercise the original bug.
  if (process.getuid() === 0) fs.chownSync(target, 1234, 1235);
  const originalStat = fs.statSync(target);
  const files = [
    { vPath: target, before: hash('original\n'), after: hash('replacement\n') },
    { vPath: added, before: null, after: hash('added\n') },
  ];
  fs.mkdirSync(path.join(dir, 'files')); fs.writeFileSync(path.join(dir, 'files', '0'), 'replacement\n');
  fs.writeFileSync(path.join(dir, 'files', '1'), 'added\n');
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ files }));
  return { target, added, originalStat };
}
function remote(mode, dir) {
  return spawnSync(process.execPath, ['-', mode, dir], { input: REMOTE, encoding: 'utf8', timeout: 15000 });
}
function metadata(stat) { return { uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o7777 }; }

test('actual remote installer and undo preserve original owner and mode and remove added files', () => withFiles(dir => {
  const { target, added, originalStat } = stage(dir);
  let run = remote('install', dir); assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), 'replacement\n');
  assert.deepEqual(metadata(fs.statSync(target)), metadata(originalStat));
  const undo = JSON.parse(fs.readFileSync(path.join(dir, 'undo.json')));
  assert.deepEqual({ uid: undo[0].uid, gid: undo[0].gid, mode: undo[0].mode }, metadata(originalStat));
  assert.deepEqual(metadata(fs.statSync(undo[0].backup)), metadata(originalStat));
  // Undo must use saved target metadata even if backup metadata later changes.
  fs.chmodSync(undo[0].backup, 0o600);
  run = remote('undo', dir); assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), 'original\n');
  assert.deepEqual(metadata(fs.statSync(target)), metadata(originalStat));
  assert.equal(fs.existsSync(added), false);
}));

test('actual remote install rejects changed before bytes before creating any backup or replacement', () => withFiles(dir => {
  const { target, added } = stage(dir); fs.writeFileSync(target, 'another release\n');
  const run = remote('install', dir); assert.notEqual(run.status, 0);
  assert.equal(fs.readFileSync(target, 'utf8'), 'another release\n');
  assert.equal(fs.existsSync(path.join(dir, 'undo.json')), false); assert.equal(fs.existsSync(added), false);
}));

test('legacy undo still restores its backup metadata and explicitly reports its uncertified original owner', () => withFiles(dir => {
  const { target } = stage(dir); assert.equal(remote('install', dir).status, 0);
  const undo = JSON.parse(fs.readFileSync(path.join(dir, 'undo.json')));
  for (const entry of undo) for (const key of ['uid', 'gid', 'mode']) delete entry[key];
  fs.writeFileSync(path.join(dir, 'undo.json'), JSON.stringify(undo));
  fs.chmodSync(undo[0].backup, 0o600);
  const run = remote('undo', dir); assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /legacy undo: using backup metadata; original owner cannot be certified/u);
  assert.equal(fs.statSync(target).mode & 0o7777, 0o600); assert.equal(fs.readFileSync(target, 'utf8'), 'original\n');
}));

test('partial explicit undo metadata fails closed instead of silently using backup ownership', () => withFiles(dir => {
  const { target } = stage(dir); assert.equal(remote('install', dir).status, 0);
  const undo = JSON.parse(fs.readFileSync(path.join(dir, 'undo.json'))); delete undo[0].gid;
  fs.writeFileSync(path.join(dir, 'undo.json'), JSON.stringify([undo[0]]));
  const run = remote('undo', dir); assert.notEqual(run.status, 0); assert.match(run.stderr, /Invalid undo file metadata/u);
  assert.equal(fs.readFileSync(target, 'utf8'), 'replacement\n');
}));

test('align refusal after install: own files -> undo, sidecar -> install on V, lagging -> sync, parity fine -> rerun align', () => {
  const mine = new Set(['openclaw/dist/a.js', 'extensions/wecom-openclaw-plugin/dist/src/channel.js']);
  const p = (...findings) => ({ state: 'DIVERGED', findings });
  assert.equal(classifyAlignFailure(null, mine).kind, 'unknown');
  assert.equal(classifyAlignFailure({ state: 'ALIGNED', findings: [] }, mine).kind, 'parity-aligned');
  assert.equal(classifyAlignFailure({ state: 'ALIGNED', findings: [{ target: 'sidecar:handoff/service/x.js', component: 'handoff', kind: 'only-on-v', advisory: true }] }, mine).kind, 'parity-aligned');
  assert.equal(classifyAlignFailure(p({ target: 'extensions/wecom-openclaw-plugin/dist/src/channel.js', kind: 'differs' }), mine).kind, 'undo');
  // A release that also installed the secret-entry service, on VLab only so far.
  const side = classifyAlignFailure(p({ target: 'sidecar:secret-entry/server.mjs', component: 'secret-entry', kind: 'only-on-vlab' }), mine);
  assert.equal(side.kind, 'sidecars');
  assert.deepEqual(side.sidecars.map(([id, list]) => [id, list.length]), [['secret-entry', 1]]);
  assert.deepEqual(side.lagging, []);
  const lag = classifyAlignFailure(p({ target: 'openclaw/dist/other.js', kind: 'differs' }), mine);
  assert.deepEqual([lag.kind, lag.lagging.length], ['lagging', 1]);
  // Something only on VLab outside the sidecars is not "V ahead": undo path.
  assert.equal(classifyAlignFailure(p({ target: 'openclaw/dist/new.js', kind: 'only-on-vlab' }), mine).kind, 'unknown');
  // This release's Codex file reached V and VLab's runtime/ copy, not the copy VLab's Gateway loads.
  const codex = 'npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist/a.js';
  const copy = classifyAlignFailure(p({ target: codex, component: 'codex', copy: 'vlab-gateway', kind: 'differs' }), new Set([...mine, codex]));
  assert.deepEqual([copy.kind, copy.handCopy.length], ['hand-copy', 1]);
  // Anything else wrong besides it is still classified on its own.
  assert.equal(classifyAlignFailure(p({ target: codex, copy: 'vlab-gateway', kind: 'differs' }, { target: 'openclaw/dist/a.js', kind: 'differs' }), mine).kind, 'undo');
});
