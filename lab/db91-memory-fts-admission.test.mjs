import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {patchDb91MemoryFtsAdmission} from './patch-db91-memory-fts-admission.mjs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const source = read('./release-files/memory-schema-BSs9MQgq.js');

function loadSchemaFunctions(transaction, candidate = source) {
  const start = candidate.indexOf('const MEMORY_INDEX_SOURCES_TABLE =');
  const end = candidate.indexOf('\n//#endregion', candidate.indexOf('function ensureMemoryPathFtsSchema(', start));
  assert(start >= 0 && end > start);
  return Function('runSqliteImmediateTransactionSync', `${candidate.slice(start, end)}\nreturn {ensureMemoryChunkFtsSchema, ensureMemoryPathFtsSchema};`)(transaction);
}

function baselineSource() {
  return source
    .replace(/\/\*\* Return whether a schema reconciliation can change persisted FTS state\. \*\/[\s\S]*?(?=\/\*\* Remove only derived FTS state)/, '')
    .replace(/\tif \(process\.env\.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1"\) \{[\s\S]*?operationLabel: "memory\.fts\.ensure-body", databaseLabel: "memory index"\}\);\n\t\}/, '\tif (process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1" && !params.db.isTransaction) return runSqliteImmediateTransactionSync(params.db, () => ensureMemoryChunkFtsSchema(params), {operationLabel: "memory.fts.ensure-body", databaseLabel: "memory index"});')
    .replace(/\tif \(process\.env\.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1"\) \{[\s\S]*?operationLabel: "memory\.fts\.ensure-path", databaseLabel: "memory index"\}\);\n\t\}/, '\tif (process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1" && !params.db.isTransaction) return runSqliteImmediateTransactionSync(params.db, () => ensureMemoryPathFtsSchema(params), {operationLabel: "memory.fts.ensure-path", databaseLabel: "memory index"});');
}

function runProbe(sourcePath, databasePath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL('./run-db91-memory-fts-admission-probe.mjs', import.meta.url).pathname, sourcePath, databasePath], {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.once('exit', code => resolve({code, stdout, stderr}));
  });
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'db91-memory-fts-admission-'));
  const filename = path.join(directory, 'agent.sqlite');
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE memory_index_chunks (text TEXT, id TEXT, path TEXT, source TEXT, model TEXT, start_line INTEGER, end_line INTEGER);
    CREATE TABLE memory_index_sources (id INTEGER PRIMARY KEY, path TEXT, source TEXT);`);
  let transactions = 0;
  const transaction = (database, operation) => {
    transactions++;
    database.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  };
  const functions = loadSchemaFunctions(transaction);
  const body = () => functions.ensureMemoryChunkFtsSchema({db, ftsTable: 'memory_index_chunks_fts', tokenizeClause: ''});
  const paths = () => functions.ensureMemoryPathFtsSchema({db, tokenizeClause: ''});
  return {directory, filename, db, body, paths, transactions: () => transactions};
}

function withDb91Enabled(operation) {
  const previous = process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE;
  process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE = '1';
  try { return operation(); }
  finally {
    if (previous === undefined) delete process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE;
    else process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE = previous;
  }
}

test('patch is exact and refuses drift or double application', () => {
  const baseline = baselineSource();
  assert.equal(patchDb91MemoryFtsAdmission(baseline), source);
  assert.throws(() => patchDb91MemoryFtsAdmission(source), /already patched/);
  assert.throws(() => patchDb91MemoryFtsAdmission(baseline.replace('memory.fts.ensure-body', 'drifted')), /anchor mismatch/);
});

test('healthy body and path FTS checks acquire no SQLite writer', () => withDb91Enabled(() => {
  const h = fixture();
  try {
    h.db.exec("INSERT INTO memory_index_chunks VALUES ('hello','1','a','memory','m',1,1); INSERT INTO memory_index_sources VALUES (1,'a','memory')");
    h.body(); h.paths();
    assert.equal(h.transactions(), 2);
    h.body(); h.paths(); h.body(); h.paths();
    assert.equal(h.transactions(), 2);
  } finally { h.db.close(); fs.rmSync(h.directory, {recursive: true}); }
}));

test('fifteen processes bypass a live writer on healthy schema while 9.1 baseline collides', async () => withDb91Enabled(async () => {
  const h = fixture();
  const baselinePath = path.join(h.directory, 'baseline.js');
  fs.writeFileSync(baselinePath, baselineSource());
  try {
    h.db.exec("INSERT INTO memory_index_chunks VALUES ('hello','1','a','memory','m',1,1); INSERT INTO memory_index_sources VALUES (1,'a','memory')");
    h.body(); h.paths();
    const holder = new DatabaseSync(h.filename);
    holder.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
    try {
      const oldResult = await runProbe(baselinePath, h.filename);
      assert.notEqual(oldResult.code, 0);
      assert.match(oldResult.stderr, /database is locked/);
      const candidatePath = new URL('./release-files/memory-schema-BSs9MQgq.js', import.meta.url).pathname;
      const results = await Promise.all(Array.from({length: 15}, () => runProbe(candidatePath, h.filename)));
      for (const result of results) {
        assert.equal(result.code, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {transactions: 0});
      }
    } finally { holder.exec('ROLLBACK'); holder.close(); }
  } finally { h.db.close(); fs.rmSync(h.directory, {recursive: true}); }
}));

test('healthy checks stay available while another process owns BEGIN IMMEDIATE', () => withDb91Enabled(() => {
  const h = fixture();
  try {
    h.db.exec("INSERT INTO memory_index_chunks VALUES ('hello','1','a','memory','m',1,1); INSERT INTO memory_index_sources VALUES (1,'a','memory')");
    h.body(); h.paths();
    const before = h.transactions();
    const holder = new DatabaseSync(h.filename);
    holder.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
    try { h.body(); h.paths(); }
    finally { holder.exec('ROLLBACK'); holder.close(); }
    assert.equal(h.transactions(), before);
  } finally { h.db.close(); fs.rmSync(h.directory, {recursive: true}); }
}));

test('missing or empty derived state enters one write transaction and backfills', () => withDb91Enabled(() => {
  const h = fixture();
  try {
    h.db.exec("INSERT INTO memory_index_chunks VALUES ('hello','1','a','memory','m',1,1); INSERT INTO memory_index_sources VALUES (1,'a','memory')");
    h.body(); h.paths();
    assert.equal(h.transactions(), 2);
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM memory_index_chunks_fts').get().n, 1);
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM memory_index_paths_fts').get().n, 1);
    h.db.exec('DROP TRIGGER memory_index_paths_fts_after_delete');
    h.paths();
    assert.equal(h.transactions(), 3);
    assert.equal(h.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='trigger' AND name LIKE 'memory_index_paths_fts_after_%'").get().n, 3);
  } finally { h.db.close(); fs.rmSync(h.directory, {recursive: true}); }
}));

test('feature flag off preserves the 9.1 reconciliation path', () => {
  const h = fixture();
  try {
    delete process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE;
    h.body(); h.body();
    assert.equal(h.transactions(), 0);
    assert.equal(h.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='memory_index_chunks_fts'").get().n, 1);
  } finally { h.db.close(); fs.rmSync(h.directory, {recursive: true}); }
});
