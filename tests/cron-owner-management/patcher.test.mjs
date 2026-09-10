import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyPatch, rollbackPatch, runtimeName } from '../../scripts/patch-openclaw91-cron-owner-management.mjs';

// Supply a code-only 2026.9.1 fixture containing the seven targeted dist modules.
const fixture = process.env.CRON_PATCH_BASELINE;
test('install, idempotence, guarded rollback and exact restoration', { skip: !fixture }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cron-patcher-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(fixture, root, { recursive: true, filter: (source) => !source.includes('node_modules') });
  const first = await applyPatch(root, true);
  assert.equal(first.files.length, 8);
  assert.equal(first.files.filter((f) => f.before !== f.after).length, 8);
  const second = await applyPatch(root, true);
  assert.ok(second.files.every((f) => f.before === f.after));
  const target = path.join(root, 'dist', first.files[0].name);
  const originalPatched = await fs.readFile(target, 'utf8');
  await fs.appendFile(target, '\n// Another task changed this file\n');
  await assert.rejects(rollbackPatch(root), /changed after this patch/);
  await fs.writeFile(target, originalPatched);
  await rollbackPatch(root);
  for (const entry of first.files.filter((f) => f.before !== null)) {
    assert.deepEqual(await fs.readFile(path.join(root, 'dist', entry.name)),
      await fs.readFile(path.join(fixture, 'dist', entry.name)));
  }
  await assert.rejects(fs.stat(path.join(root, 'dist', runtimeName)), { code: 'ENOENT' });
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ ...pkg, version: '2026.9.2' }));
  await assert.rejects(applyPatch(root), /exact OpenClaw/);
});
