import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildPatch, marker, patchMaintenance, patchVerifier, patchWorkboard} from './patch-openclaw94-operational-parity.mjs';

const core = '/Users/tianyicai/v-upgrade-private/20260912-openclaw94-shared-vlab/openclaw-2026.9.4-worker-compat';

test('9.4 operational parity patch resolves exact reviewed modules', async () => {
  const changes = await buildPatch(core);
  assert.deepEqual(changes.map(change => change.name).toSorted(), [
    'automatic-maintenance-coordinator.mjs',
    'database-verify-resource-group.mjs',
    'openclaw-database-verify-CVkK3KtV.mjs',
    'session-accessor.sqlite-entry-Ifvoy33r.mjs',
    'sqlite-store-MnHTs6w0.mjs',
    'workboard-lookup-cache.mjs',
  ].toSorted());
  assert.equal(changes.filter(change => change.before !== change.after).length, 6);
  for (const change of changes.filter(change => change.name.endsWith('.mjs'))) {
    const check = spawnSync(process.execPath, ['--check', '--input-type=module'], {
      input: change.after,
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, `${path.basename(change.name)}: ${check.stderr}`);
  }
});

test('maintenance coordinator is cross-process, best-effort and idempotent', async () => {
  const source = await fs.readFile(path.join(core, 'dist/session-accessor.sqlite-entry-Ifvoy33r.mjs'), 'utf8');
  const output = patchMaintenance(source, 'sqlite-coordinator-CR2GyNlB.mjs');
  assert(output.includes(`${marker}:maintenance`));
  assert(output.includes('acquireAutomaticMaintenancePermit(owner.database, tryAcquireExclusiveSqliteCoordinator'));
  assert(output.includes('permit.finish(completed)'));
  assert.equal(patchMaintenance(output, 'sqlite-coordinator-CR2GyNlB.mjs'), output);
});

test('database verifier is attached before work and fails closed', async () => {
  const source = await fs.readFile(path.join(core, 'dist/openclaw-database-verify-CVkK3KtV.mjs'), 'utf8');
  const output = patchVerifier(source);
  assert(output.includes(`${marker}:verifier`));
  assert(output.indexOf('resourceGroup?.attach(worker.pid)') < output.indexOf('options.onWorker?.(worker)'));
  assert(output.includes('worker?.kill()'));
  assert.equal(patchVerifier(output), output);
});

test('workboard cache wraps only stable card lookup', async () => {
  const source = await fs.readFile(path.join(core, 'dist/sqlite-store-MnHTs6w0.mjs'), 'utf8');
  const output = patchWorkboard(source);
  assert(output.includes(`${marker}:workboard-cache`));
  assert(output.includes('return lookupWorkboardSnapshot(this.db, key, () => {'));
  assert(output.includes('async registerIfAbsent(key, value)'));
  assert.equal(patchWorkboard(output), output);
});
