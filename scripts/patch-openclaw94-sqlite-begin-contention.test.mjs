import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {marker, patchSessionAccessor} from './patch-openclaw94-sqlite-begin-contention.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewedCore = '/Users/tianyicai/v-upgrade-private/20260912-openclaw94-shared-vlab/openclaw-2026.9.4-worker-compat';
const accessorName = 'session-accessor.sqlite-entry-Ifvoy33r.mjs';

test('patches only the OpenClaw 9.4 commit edge and is idempotent', async () => {
  const source = await readFile(path.join(reviewedCore, 'dist', accessorName), 'utf8');
  const output = patchSessionAccessor(source);
  assert.ok(output.includes(marker));
  assert.ok(output.includes('const publish = await withSqliteBeginContentionRetry({'));
  assert.ok(output.includes('run: operation => runOpenClawAgentWriteTransaction(operation, databaseOptions)'));
  assert.ok(output.includes('if (next && result) options.onCommitted?.(cloneSessionEntry(result));'));
  assert.ok(output.includes('publish?.();'));
  assert.equal(patchSessionAccessor(output), output);
  assert.throws(() => patchSessionAccessor(source.replace('const publish = runOpenClawAgentWriteTransaction', 'const publish = changedTransaction')), /anchor mismatch/);
});

test('CLI checks and applies an exact 9.4 fixture without touching its source package', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openclaw94-sqlite-patch-'));
  const core = path.join(directory, 'openclaw');
  const dist = path.join(core, 'dist');
  try {
    await mkdir(dist, {recursive: true});
    await writeFile(path.join(core, 'package.json'), '{"version":"2026.9.4"}\n');
    const source = await readFile(path.join(reviewedCore, 'dist', accessorName));
    await writeFile(path.join(dist, accessorName), source);
    const script = path.join(root, 'scripts', 'patch-openclaw94-sqlite-begin-contention.mjs');
    const checked = JSON.parse((await execFileAsync(process.execPath, [script, core, '--check'])).stdout);
    assert.equal(checked.state, 'patched');
    assert.equal(checked.helper, 'missing');
    await execFileAsync(process.execPath, [script, core, '--apply', checked.beforeSha256]);
    const patched = await readFile(path.join(dist, accessorName), 'utf8');
    assert.ok(patched.includes(marker));
    assert.equal(await readFile(path.join(dist, 'sqlite-begin-contention-retry.mjs'), 'utf8'), await readFile(path.join(root, 'lab/release-files/sqlite-begin-contention-retry.mjs'), 'utf8'));
    const idempotent = JSON.parse((await execFileAsync(process.execPath, [script, core, '--apply'])).stdout);
    assert.equal(idempotent.state, 'unchanged');
    assert.equal(idempotent.helper, 'matching');
    assert.equal(await readFile(path.join(dist, `${accessorName}.${marker}.bak`), 'utf8'), source.toString());
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('CLI rejects a different helper and a different release', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openclaw94-sqlite-reject-'));
  const core = path.join(directory, 'openclaw');
  const dist = path.join(core, 'dist');
  try {
    await mkdir(dist, {recursive: true});
    await writeFile(path.join(core, 'package.json'), '{"version":"2026.9.4"}\n');
    await writeFile(path.join(dist, accessorName), await readFile(path.join(reviewedCore, 'dist', accessorName)));
    await writeFile(path.join(dist, 'sqlite-begin-contention-retry.mjs'), 'different\n');
    const script = path.join(root, 'scripts', 'patch-openclaw94-sqlite-begin-contention.mjs');
    await assert.rejects(execFileAsync(process.execPath, [script, core, '--check']), /helper differs/);
    await writeFile(path.join(core, 'package.json'), '{"version":"2026.9.3"}\n');
    await assert.rejects(execFileAsync(process.execPath, [script, core, '--check']), /Requires reviewed OpenClaw 2026\.9\.4/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
