import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {MAX_AGE_MS, readReusableVerification, recordSuccessfulVerification as record, beginVerification, invalidateVerification, assertNotRevoked, verifyCurrentAgentDatabase, rememberConnection, assertConnectionUsable} from './gate.mjs';

function recordSuccessfulVerification(db, filename, agentId, options) {
  const ticket = beginVerification(db, filename, agentId, options);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  return record(db, filename, agentId, {...options, ticket});
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'db91-gate-test-'));
  const dir = path.join(root, 'gate'); fs.mkdirSync(dir, {mode: 0o700});
  const filename = path.join(root, 'agent.sqlite');
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA user_version=19; PRAGMA foreign_keys=ON; CREATE TABLE schema_meta(meta_key TEXT PRIMARY KEY, role TEXT, agent_id TEXT, schema_version INTEGER); INSERT INTO schema_meta VALUES('primary','agent','lab',19); CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));");
  const env = {OPENCLAW_DB91_INTEGRITY_DIR: fs.realpathSync(dir), OPENCLAW_DB91_INTEGRITY_EPOCH: randomUUID()};
  t.after(() => {if (db.isOpen) db.close(); fs.rmSync(root, {recursive: true, force: true});});
  return {db, filename: fs.realpathSync(filename), dir, env};
}

test('only a completed full check can establish reusable verification', t => {
  const f = fixture(t); let full = 0, contracts = 0;
  const params = {db: f.db, filename: f.filename, agentId: 'lab', env: f.env, schemaSql: '', options: {},
    verifyFull: db => {full++; assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); return [];},
    verifyContracts: () => {contracts++; return [];}};
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
  verifyCurrentAgentDatabase(params); verifyCurrentAgentDatabase(params);
  assert.equal(full, 1); assert.equal(contracts, 1);
});

test('disabled mode preserves all native full calls', t => {
  const f = fixture(t); let full = 0;
  for (let i = 0; i < 3; i++) verifyCurrentAgentDatabase({db: f.db, filename: f.filename, agentId: 'lab', env: {}, verifyFull: () => {full++;}, verifyContracts: () => {throw Error('must not skip');}});
  assert.equal(full, 3);
});

test('ordinary writes keep constraints and do not masquerade as a fresh full check', t => {
  const f = fixture(t); const now = Date.now();
  recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env, now});
  f.db.exec('BEGIN; INSERT INTO parent VALUES(1); INSERT INTO child VALUES(1,1); COMMIT');
  assert.throws(() => f.db.exec('INSERT INTO child VALUES(2,99)'), /FOREIGN KEY/);
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env, now: now + 1}), true);
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env, now: now + MAX_AGE_MS + 1}), false);
});

test('new Gateway epoch cannot reuse an old result', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: {...f.env, OPENCLAW_DB91_INTEGRITY_EPOCH: randomUUID()}}), false);
});

test('schema change invalidates receipt even at the same schema version', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  f.db.exec('CREATE INDEX child_parent ON child(parent_id)');
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
});

test('ownership mismatch and schema migration cannot reuse receipt', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  assert.throws(() => readReusableVerification(f.db, f.filename, 'other', {env: f.env}), /ownership/);
  f.db.exec('PRAGMA user_version=20');
  assert.throws(() => readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), /current schema/);
});

test('failure revokes warm connections, without replacing original error', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  const original = Error('native index contract failed');
  assert.throws(() => verifyCurrentAgentDatabase({db: f.db, filename: f.filename, agentId: 'lab', env: f.env, verifyFull: () => {}, verifyContracts: () => {throw original;}}), error => error === original);
  assert.throws(() => assertNotRevoked(f.filename, {env: f.env}), /revoked/);
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
});

test('only a fresh successful check clears explicit revocation', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  invalidateVerification(f.filename, {env: f.env});
  assert.throws(() => assertNotRevoked(f.filename, {env: f.env}));
  recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  assert.doesNotThrow(() => assertNotRevoked(f.filename, {env: f.env}));
});

test('replaced file cannot reuse the old inode lifecycle', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  f.db.close(); fs.renameSync(f.filename, f.filename + '.previous');
  fs.copyFileSync(f.filename + '.previous', f.filename);
  const replacement = new DatabaseSync(f.filename);
  try {assert.equal(readReusableVerification(replacement, f.filename, 'lab', {env: f.env}), false);} finally {replacement.close();}
});

test('receipt is reusable by another connection, with no full scan', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  const other = new DatabaseSync(f.filename);
  try {assert.equal(readReusableVerification(other, f.filename, 'lab', {env: f.env}), true);} finally {other.close();}
});

test('malformed receipt is a miss and a public directory is rejected', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  const receipt = fs.readdirSync(f.dir).find(name => name.endsWith('.json'));
  fs.writeFileSync(path.join(f.dir, receipt), '{bad');
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
  fs.chmodSync(f.dir, 0o755);
  assert.throws(() => readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), /private/);
});

test('failed full check never leaves a successful receipt', t => {
  const f = fixture(t);
  assert.throws(() => verifyCurrentAgentDatabase({db: f.db, filename: f.filename, agentId: 'lab', env: f.env, verifyFull: () => {throw Error('corruption');}}), /corruption/);
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), false);
  assert.throws(() => assertNotRevoked(f.filename, {env: f.env}));
});

test('a late successful check cannot undo a newer revocation', t => {
  const f = fixture(t);
  const ticket = beginVerification(f.db, f.filename, 'lab', {env: f.env});
  invalidateVerification(f.filename, {env: f.env});
  assert.equal(record(f.db, f.filename, 'lab', {env: f.env, ticket}), false);
  assert.throws(() => assertNotRevoked(f.filename, {env: f.env}));
});

test('a schema change during verification cannot publish a reusable result', t => {
  const f = fixture(t);
  const ticket = beginVerification(f.db, f.filename, 'lab', {env: f.env});
  f.db.exec('CREATE INDEX child_parent ON child(parent_id)');
  assert.equal(record(f.db, f.filename, 'lab', {env: f.env, ticket}), false);
});

test('successful publication requires a before-check ticket', t => {
  const f = fixture(t);
  assert.equal(record(f.db, f.filename, 'lab', {env: f.env}), false);
});

test('new-file proof cannot bless an old open file descriptor', t => {
  const f = fixture(t);
  rememberConnection(f.db, f.filename, {env: f.env});
  recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  assert.doesNotThrow(() => assertConnectionUsable(f.db, f.filename, {env: f.env}));
  fs.renameSync(f.filename, f.filename + '.old');
  fs.copyFileSync(f.filename + '.old', f.filename);
  const replacement = new DatabaseSync(f.filename);
  try {
    recordSuccessfulVerification(replacement, f.filename, 'lab', {env: f.env});
    assert.throws(() => assertConnectionUsable(f.db, f.filename, {env: f.env}), /replaced/);
    rememberConnection(replacement, f.filename, {env: f.env});
    assert.doesNotThrow(() => assertConnectionUsable(replacement, f.filename, {env: f.env}));
  } finally {replacement.close();}
});

test('transient SQLite busy errors do not quarantine healthy sibling connections', t => {
  const f = fixture(t); recordSuccessfulVerification(f.db, f.filename, 'lab', {env: f.env});
  const busy = Object.assign(new Error('busy'), {code: 'ERR_SQLITE_ERROR', errcode: 5});
  assert.throws(() => verifyCurrentAgentDatabase({db: f.db, filename: f.filename, agentId: 'lab', env: f.env, verifyContracts: () => {throw busy;}}), e => e === busy);
  assert.doesNotThrow(() => assertNotRevoked(f.filename, {env: f.env}));
  assert.equal(readReusableVerification(f.db, f.filename, 'lab', {env: f.env}), true);
});
