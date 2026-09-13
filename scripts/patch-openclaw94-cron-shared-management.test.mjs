import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  applyPatch,
  buildPatch,
  marker,
  runtimeName,
} from './patch-openclaw94-cron-shared-management.mjs';

const core = '/Users/tianyicai/v-upgrade-private/20260912-openclaw94-shared-vlab/openclaw-2026.9.4-worker-compat';

test('9.4 Shared Cron patch resolves the complete authenticated path', async () => {
  const changes = await buildPatch(core);
  assert.equal(changes.length, 9);
  assert.equal(changes.filter(change => change.before !== change.after).length, 9);
  assert(changes.some(change => change.name === runtimeName));
  for (const change of changes) {
    if (change.name !== runtimeName) assert(change.after.includes(marker));
    const check = spawnSync(process.execPath, ['--check', '--input-type=module'], {
      input: change.after,
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, `${change.name}: ${check.stderr}`);
  }
});

test('patch is idempotent on a code-only 9.4 copy', async t => {
  const root = await fs.mkdtemp('/tmp/openclaw94-cron-');
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'dist'));
  await fs.copyFile(path.join(core, 'package.json'), path.join(root, 'package.json'));
  for (const change of await buildPatch(core)) {
    if (change.before !== null) await fs.copyFile(path.join(core, 'dist', change.name), path.join(root, 'dist', change.name));
  }
  const first = await applyPatch(root, true);
  assert.equal(first.files.filter(file => file.changed).length, 9);
  const second = await applyPatch(root, true);
  assert.equal(second.files.filter(file => file.changed).length, 0);
});

test('patch rejects a different release', async t => {
  const root = await fs.mkdtemp('/tmp/openclaw94-cron-version-');
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'dist'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({version: '2026.9.5'}));
  await assert.rejects(buildPatch(root), /exact OpenClaw 2026\.9\.4/);
});
