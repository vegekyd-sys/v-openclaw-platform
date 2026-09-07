// Synthetic data only. Never open a production state database with this probe.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';

const [core, scratch] = process.argv.slice(2);
assert(core && scratch, 'usage: node bench-db91-open.mjs CORE EMPTY_SCRATCH');
assert(path.isAbsolute(scratch));
assert(scratch.startsWith('/srv/vlab-production-mirror/labs/instances/db91-fix/tmp/') || scratch.startsWith('/tmp/db91-'));
assert(!fs.existsSync(scratch), 'fresh synthetic scratch required');
const dist = path.join(core, 'dist');
const find = prefix => {
  const names = fs.readdirSync(dist).filter(name => name.startsWith(prefix) && name.endsWith('.js') && fs.readFileSync(path.join(dist, name), 'utf8').includes('function verifyAndRepairCanonicalSqliteIndexes('));
  assert.equal(names.length, 1, `ambiguous bundle ${prefix}`);
  return path.join(dist, names[0]);
};
const indexFile = find('openclaw-state-db-');
const source = fs.readFileSync(indexFile, 'utf8');
const exported = name => {
  const match = source.slice(source.lastIndexOf('export {')).match(new RegExp(`\\b${name} as (\\w+)`));
  assert(match, `missing export ${name}`);
  return match[1];
};
const module = await import(pathToFileURL(indexFile).href);
const verify = module[exported('verifyAndRepairCanonicalSqliteIndexes')];
const repair = module[exported('repairCanonicalSqliteIndexes')];
const schema = 'CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, bucket INTEGER NOT NULL, payload TEXT NOT NULL) STRICT; CREATE INDEX IF NOT EXISTS idx_records_bucket ON records(bucket, id);';
fs.mkdirSync(scratch, {mode: 0o700});
const file = path.join(scratch, 'synthetic.sqlite');
let db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
db.exec(schema);
db.exec('BEGIN IMMEDIATE');
const insert = db.prepare('INSERT INTO records VALUES (?, ?, ?)');
const payload = 'synthetic-data-'.repeat(585);
for (let i = 0; i < 8192; i++) insert.run(i, i % 31, payload);
db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
const results = [];
for (const mode of ['full', 'structural', 'full', 'structural']) {
  db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=5000');
  const start = performance.now();
  const repaired = mode === 'full' ? verify(db, file, schema) : repair(db, file, schema, {verifyPhysicalIntegrity: false});
  assert.deepEqual(repaired, []);
  results.push({mode, elapsedMs: Math.round((performance.now() - start) * 100) / 100});
  db.close();
}
// Structural mode must still repair a drifted named index and validate the file afterwards.
db = new DatabaseSync(file);
db.exec('DROP INDEX idx_records_bucket; CREATE INDEX idx_records_bucket ON records(id)');
assert.deepEqual(repair(db, file, schema, {verifyPhysicalIntegrity: false}), ['idx_records_bucket']);
assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map(x => x.integrity_check), ['ok']);
assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n, 8192);
db.close();
console.log(JSON.stringify({syntheticOnly: true, fileBytes: fs.statSync(file).size, results, indexRepairPreserved: true, rowsPreserved: 8192}, null, 2));
