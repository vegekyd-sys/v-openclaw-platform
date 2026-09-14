import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import test from 'node:test';

function findDistModule(dist, prefix, contains) {
  const matches = fs.readdirSync(dist).filter(name => {
    if (!name.startsWith(prefix) || !name.endsWith('.js')) return false;
    return fs.readFileSync(path.join(dist, name), 'utf8').includes(contains);
  });
  assert.equal(matches.length, 1, `expected one ${prefix} module, got ${matches.join(', ')}`);
  return path.join(dist, matches[0]);
}

function waitForLine(stream, expected, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${expected}: ${output}`)), timeoutMs);
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      output += chunk;
      if (!output.includes(expected)) return;
      clearTimeout(timer);
      resolve(output);
    });
    stream.on('error', reject);
  });
}

function runReaderProcess(storePath) {
  const source = String.raw`
    import {pathToFileURL} from 'node:url';
    const store = await import(pathToFileURL(process.argv[1]).href + '?reader=' + process.pid);
    const reads = [];
    for (let index = 0; index < 6; index += 1) {
      const startedAt = Date.now();
      const snapshot = await store.n();
      reads.push({elapsedMs: Date.now() - startedAt, hash: snapshot.hash});
    }
    process.stdout.write(JSON.stringify(reads));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source, storePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`reader exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

test('healthy exec approval lookup does not require the OpenClaw state writer lock', async t => {
  const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
  assert.ok(runtime, 'VLAB_CANDIDATE_RUNTIME is required');
  const dist = path.join(runtime, 'openclaw', 'dist');
  const stateDir = process.env.OPENCLAW_STATE_DIR;
  assert.ok(stateDir, 'OPENCLAW_STATE_DIR is required');

  const storePath = findDistModule(dist, 'exec-approvals-store-', 'function ensureExecApprovalsSnapshot()');
  const store = await import(`${pathToFileURL(storePath).href}?repro=${Date.now()}`);
  assert.equal(typeof store.n, 'function', 'hashed export n must be ensureExecApprovalsSnapshot');

  const initialized = await store.n();
  assert.ok(initialized.file.socket?.path?.trim(), 'fixture must have a persisted socket path');
  assert.ok(initialized.file.socket?.token?.trim(), 'fixture must have a persisted socket token');

  const databasePath = path.join(stateDir, 'state', 'openclaw.sqlite');
  const holderSource = String.raw`
    import {DatabaseSync} from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE;');
    process.stdout.write('LOCKED\n');
    process.stdin.resume();
    process.stdin.once('end', () => {
      try { db.exec('ROLLBACK'); } finally { db.close(); }
    });
  `;
  const holder = spawn(process.execPath, ['--input-type=module', '--eval', holderSource, databasePath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => {
    holder.stdin.end();
    holder.kill('SIGKILL');
  });
  await waitForLine(holder.stdout, 'LOCKED');

  const startedAt = Date.now();
  const snapshot = await store.n();
  const elapsedMs = Date.now() - startedAt;
  assert.equal(snapshot.hash, initialized.hash);
  assert.ok(elapsedMs < 1_000, `healthy read waited ${elapsedMs}ms on an unrelated writer`);

  const readerGroups = await Promise.all(Array.from({length: 5}, () => runReaderProcess(storePath)));
  assert.equal(readerGroups.flat().length, 30);
  for (const reader of readerGroups.flat()) {
    assert.equal(reader.hash, initialized.hash);
    assert.ok(reader.elapsedMs < 1_000, `cross-process healthy read waited ${reader.elapsedMs}ms`);
  }
  t.diagnostic(JSON.stringify({
    sameProcessReadMs: elapsedMs,
    crossProcessReads: readerGroups.flat().length,
    crossProcessMaxReadMs: Math.max(...readerGroups.flat().map(reader => reader.elapsedMs)),
  }));

  const holderExit = once(holder, 'exit');
  holder.stdin.end();
  await holderExit;

  assert.equal(typeof store.d, 'function', 'hashed export d must be updateExecApprovals');
  const changedPath = `${snapshot.file.socket.path}.candidate-test`;
  const updated = await store.d({
    baseHash: snapshot.hash,
    update: current => ({
      ...current,
      socket: {...current.socket, path: changedPath},
    }),
  });
  assert.ok(updated, 'real mutation must commit');
  assert.equal(updated.file.socket.path, changedPath);
  assert.notEqual(updated.hash, snapshot.hash);

  const restored = await store.d({
    baseHash: updated.hash,
    update: () => initialized.file,
  });
  assert.ok(restored, 'restore mutation must commit');
  assert.equal(restored.hash, initialized.hash);
});
