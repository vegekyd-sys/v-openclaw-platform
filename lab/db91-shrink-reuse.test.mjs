import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { patchDb91ShrinkReuse } from './patch-db91-shrink-reuse.mjs';

const original = fs.readFileSync(new URL('../release/captured/v2026.9.1-db91.6-background-work-20261002/dist/db91-integrity-gate.mjs', import.meta.url), 'utf8');
const patched = fs.readFileSync(new URL('./release-files/db91-shrink-reuse/db91-integrity-gate.mjs', import.meta.url), 'utf8');

test('release file is the V gate with only the shrink-reuse change', () => {
  assert.equal(patchDb91ShrinkReuse(original), patched);
  assert.throws(() => patchDb91ShrinkReuse(patched), /reuse size check/);
});

async function loadGate(t, source, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db91-gate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, name);
  fs.writeFileSync(file, source);
  return import(file);
}

function makeAgentDb(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'db91-db-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'openclaw-agent.sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA auto_vacuum = INCREMENTAL; PRAGMA journal_mode = WAL;');
  db.exec("CREATE TABLE schema_meta (meta_key TEXT PRIMARY KEY, role TEXT, agent_id TEXT, schema_version INTEGER); INSERT INTO schema_meta VALUES ('primary', 'agent', 'makaron', 19); PRAGMA user_version = 19;");
  db.exec('CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');
  const insert = db.prepare('INSERT INTO blobs (data) VALUES (?)');
  for (let i = 0; i < 400; i++) insert.run(Buffer.alloc(8192, i % 251));
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return { db, file };
}

function epochEnv(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db91-epoch-'));
  fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { OPENCLAW_DB91_INTEGRITY_EPOCH: '0123456789abcdef0123456789abcdef', OPENCLAW_DB91_INTEGRITY_DIR: fs.realpathSync(dir) };
}

function prove(gate, db, file, env) {
  const ticket = gate.beginVerification(db, file, 'makaron', { env });
  const proof = gate.finishVerification(db, file, 'makaron', { env, ticket });
  assert(gate.publishVerificationProof(proof, file, { env }));
}

test('a shrink made by incremental_vacuum keeps the proof reusable; an external truncation does not', async (t) => {
  const before = await loadGate(t, original, 'gate-original.mjs');
  const after = await loadGate(t, patched, 'gate-patched.mjs');
  for (const [label, gate, expectShrinkReuse] of [['original', before, false], ['patched', after, true]]) {
    const env = epochEnv(t);
    const { db, file } = makeAgentDb(t);
    prove(gate, db, file, env);
    assert.equal(gate.readReusableVerification(db, file, 'makaron', { env }), true, `${label}: fresh proof`);
    const sizeBefore = fs.statSync(file).size;
    db.exec('DELETE FROM blobs WHERE id % 2 = 0; PRAGMA incremental_vacuum; PRAGMA wal_checkpoint(TRUNCATE);');
    assert(fs.statSync(file).size < sizeBefore, 'incremental_vacuum shrank the file');
    assert.equal(gate.readReusableVerification(db, file, 'makaron', { env }), expectShrinkReuse, `${label}: after a SQLite shrink`);
    // Re-prove at the new size, then cut the file behind SQLite's back.
    prove(gate, db, file, env);
    fs.truncateSync(file, fs.statSync(file).size - 4096 * 8);
    assert.equal(gate.readReusableVerification(db, file, 'makaron', { env }), false, `${label}: after an external truncation`);
    db.close();
  }
});
