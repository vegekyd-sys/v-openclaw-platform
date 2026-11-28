// Backups copy live databases safely, carry every file's hash, and a restore proves it is whole.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildBackupImage, verifyImage, tarCreate, tarExtract, prunable, BACKUP_EXCLUDE } from './backup.mjs';

const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'v-backup-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const put = (f, c) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };

test('backup image: files with hashes, live databases copied whole, rebuildable parts left out; restore verifies', async (t) => {
  const root = tmp(t);
  const state = path.join(root, 'live/home/openclaw/.openclaw');
  const etc = path.join(root, 'live/etc/v');
  put(path.join(state, 'workspace/memory/2026-11-28.md'), 'what happened');
  put(path.join(state, 'workspace/USER.md'), 'the owner');
  put(path.join(state, 'npm/projects/x/index.js'), 'reinstalled by OpenClaw');
  put(path.join(state, 'tmp/openclaw-996/gateway.lock.sqlite'), 'lock');
  put(path.join(etc, 'secrets.env'), 'DEEPSEEK_API_KEY=k\n');
  fs.chmodSync(path.join(etc, 'secrets.env'), 0o600);
  // A database in WAL mode with an open writer, as under a running Gateway.
  fs.mkdirSync(path.join(state, 'agents/makaron/agent'), { recursive: true });
  const dbFile = path.join(state, 'agents/makaron/agent/openclaw-agent.sqlite');
  const live = new DatabaseSync(dbFile);
  live.exec('PRAGMA journal_mode=WAL; CREATE TABLE sessions (id TEXT); INSERT INTO sessions VALUES (\'a\'), (\'b\'), (\'c\');');
  t.after(() => live.close());

  const stage = path.join(root, 'stage');
  fs.mkdirSync(stage);
  const image = await buildBackupImage({ stage, trees: [
    { from: state, to: 'home/openclaw/.openclaw', exclude: BACKUP_EXCLUDE },
    { from: etc, to: 'etc/v' },
  ] });
  assert.ok(image.files['home/openclaw/.openclaw/workspace/memory/2026-11-28.md']);
  assert.ok(image.files['etc/v/secrets.env'], 'secrets are part of the backup');
  assert.ok(!Object.keys(image.files).some((f) => f.includes('/npm/') || f.includes('/tmp/')), 'rebuildable parts left out');
  const dbRel = 'home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite';
  assert.equal(image.databases[dbRel].integrity, 'ok');
  assert.equal(image.databases[dbRel].rows.sessions, 3, 'rows still in the WAL are in the copy');
  assert.equal(fs.statSync(path.join(stage, 'etc/v/secrets.env')).mode & 0o777, 0o600);

  const manifest = { schema: 'v-distro-backup/1', ...image };
  fs.writeFileSync(path.join(stage, 'v-backup-manifest.json'), JSON.stringify(manifest));
  const archive = path.join(root, 'v-backup-test.tar.gz');
  tarCreate(stage, archive);
  assert.equal(fs.statSync(archive).mode & 0o777, 0o600);

  const restored = path.join(root, 'restored');
  tarExtract(archive, restored);
  const ok = await verifyImage(restored, manifest);
  assert.equal(ok.ok, true, ok.problems.join('; '));
  assert.equal(ok.databases, 1);

  fs.appendFileSync(path.join(restored, 'home/openclaw/.openclaw/workspace/USER.md'), ' changed');
  const bad = await verifyImage(restored, manifest);
  assert.deepEqual(bad.problems, ['changed home/openclaw/.openclaw/workspace/USER.md']);
});

test('keep N: only the oldest archives this tool named are pruned', (t) => {
  const d = tmp(t);
  for (const f of ['v-backup-a-2026-11-01.tar.gz', 'v-backup-a-2026-11-02.tar.gz', 'v-backup-a-2026-11-03.tar.gz', 'other.tar.gz']) put(path.join(d, f), 'x');
  assert.deepEqual(prunable(d, 2), ['v-backup-a-2026-11-01.tar.gz']);
  assert.deepEqual(prunable(d, 0), []);
});
