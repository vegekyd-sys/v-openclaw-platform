import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER, patchMemoryClosePassive } from './patch-memory-close-passive.mjs';
import { OUTPUT_DIR, PLAN } from './build-memory-close-passive.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const outPath = path.join(repo, OUTPUT_DIR, 'manager-vector-warning-BHH19jrh.js');
const out = fs.readFileSync(outPath, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');

// V's bytes (npm openclaw@2026.9.1) with the one hunk taken back out.
function unpatch(source) {
  return source
    .replace(/\t\t\/\/ memory-close-passive-v1:[^\n]*\n\t\t\/\/[^\n]*\n\t\t\/\/[^\n]*\n/u, '')
    .replace('\t\t\tdatabasePath: dbPath,\n\t\t\tcheckpointMode: "PASSIVE"\n', '\t\t\tdatabasePath: dbPath\n');
}

test('plan replaces manager-vector-warning-BHH19jrh.js by V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, [{
    source: `${OUTPUT_DIR}/manager-vector-warning-BHH19jrh.js`,
    target: 'openclaw/dist/manager-vector-warning-BHH19jrh.js',
    before: FILES[0].before,
  }]);
  const base = unpatch(out);
  assert.equal(sha(base), FILES[0].before);
  assert.equal(patchMemoryClosePassive(base), out);
  assert(out.includes(MARKER));
  assert.throws(() => patchMemoryClosePassive(out), /already applied/u);
  const r = spawnSync(process.execPath, ['--check', outPath], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('memory connections are opened with a PASSIVE close checkpoint and nothing else changes', () => {
  assert.match(out, /configureMemorySqliteWalMaintenance\(db, \{\n\t\t\tbusyTimeoutMs: 5e3,\n\t\t\tdatabasePath: dbPath,\n\t\t\tcheckpointMode: "PASSIVE"\n\t\t\}\);/u);
  const base = unpatch(out);
  const changed = out.split('\n').filter((line) => !base.split('\n').includes(line));
  assert.deepEqual(changed.map((l) => l.trim().replace(/^\/\/ .*/u, '//')), ['//', '//', '//', 'databasePath: dbPath,', 'checkpointMode: "PASSIVE"']);
});

// The SQLite behaviour the patch relies on, on this Node's SQLite: with another connection holding
// a read transaction, TRUNCATE busy-waits the full busy_timeout while holding the writer lock;
// PASSIVE returns at once.
test('TRUNCATE waits for an open reader; PASSIVE does not', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-close-passive-'));
  try {
    const db = path.join(dir, 'agent.sqlite');
    const owner = new DatabaseSync(db);
    owner.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE t (x); INSERT INTO t VALUES (1);');
    const reader = new DatabaseSync(db);
    reader.exec('BEGIN');
    reader.prepare('SELECT count(*) FROM t').get();
    owner.exec('INSERT INTO t VALUES (2)');
    const checkpoint = (mode) => {
      const c = new DatabaseSync(db);
      c.exec('PRAGMA busy_timeout = 400');
      const t = performance.now();
      const row = c.prepare(`PRAGMA wal_checkpoint(${mode})`).get();
      const ms = performance.now() - t;
      c.close();
      return { ms, busy: row.busy };
    };
    const truncate = checkpoint('TRUNCATE');
    assert(truncate.ms >= 350 && truncate.busy === 1, JSON.stringify(truncate));
    const passive = checkpoint('PASSIVE');
    assert(passive.ms < 100 && passive.busy === 0, JSON.stringify(passive));
    reader.exec('COMMIT');
    reader.close();
    owner.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
