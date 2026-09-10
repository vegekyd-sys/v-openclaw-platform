import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {lookupWorkboardSnapshot as lookup, MAX_KEYS, MAX_ENTRY_BYTES, MAX_BYTES} from './release-files/workboard-lookup-cache.mjs';
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workboard-lookup-test-'));
  const file = path.join(directory, 'test.sqlite'), db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE cards(id TEXT PRIMARY KEY, value TEXT); INSERT INTO cards VALUES (\'a\', \'before\')');
  const other = new DatabaseSync(file);
  t.after(() => {if (other.isOpen) other.close(); if (db.isOpen) db.close(); fs.rmSync(directory, {recursive: true});});
  let reads = 0;
  const read = key => {reads++; const row = db.prepare('SELECT * FROM cards WHERE id=?').get(key); return row ? {card: {...row, nested: {labels: ['x']}}} : undefined;};
  return {db, other, file, read, get: (key = 'a') => lookup(db, key, () => read(key)), count: () => reads};
}
test('stable reads reuse snapshot, but callers get independent nested objects', t => {
  const f = fixture(t), a = f.get(); a.card.nested.labels.push('changed');
  const b = f.get(); assert.deepEqual(b.card.nested.labels, ['x']); b.card.value = 'changed';
  assert.equal(f.get().card.value, 'before'); assert.equal(f.count(), 1);
});
test('same-handle writes and external commits invalidate all cached cards', t => {
  const f = fixture(t); f.get();
  f.db.exec("UPDATE cards SET value='own' WHERE id='a'"); assert.equal(f.get().card.value, 'own');
  f.other.exec("UPDATE cards SET value='external' WHERE id='a'"); assert.equal(f.get().card.value, 'external');
  assert.equal(f.count(), 3);
});
test('native uncommitted reads and rollback are preserved', t => {
  const f = fixture(t); f.get(); f.db.exec("BEGIN; UPDATE cards SET value='pending'");
  assert.equal(f.get().card.value, 'pending'); assert.equal(f.get().card.value, 'pending');
  f.db.exec('ROLLBACK'); assert.equal(f.get().card.value, 'before'); assert.equal(f.count(), 4);
  f.db.exec("BEGIN; UPDATE cards SET value='unobserved'; ROLLBACK"); f.get(); assert.equal(f.count(), 5);
});
test('external commit during hydration is not saved in cache', t => {
  const f = fixture(t);
  const value = lookup(f.db, 'a', () => {const a = f.read('a'); f.other.exec("UPDATE cards SET value='after'"); return a;});
  assert.equal(value.card.value, 'before'); assert.equal(f.get().card.value, 'after'); assert.equal(f.count(), 2);
});
test('external and own deletion, missing target and recreation stay fresh', t => {
  const f = fixture(t); f.get(); f.other.exec("DELETE FROM cards WHERE id='a'");
  assert.equal(f.get(), undefined); assert.equal(f.get(), undefined);
  f.db.exec("INSERT INTO cards VALUES('a','new')"); assert.equal(f.get().card.value, 'new');
  f.db.exec('DELETE FROM cards'); assert.equal(f.get(), undefined);
});
test('schema changes are visible even when total_changes does not change', t => {
  const f = fixture(t); f.get(); f.db.exec('ALTER TABLE cards ADD COLUMN extra TEXT');
  assert.equal(f.get().card.extra, null);
  f.db.exec('DROP TABLE cards'); assert.throws(() => f.get(), /no such table/);
});
test('closed database cannot return a cache hit; reopened handle resets cache', t => {
  const f = fixture(t); f.get(); f.db.close(); assert.throws(() => f.get()); f.db.open();
  assert.equal(f.get().card.value, 'before'); assert.equal(f.count(), 2);
  // Reopen without any lookup while closed must also discard the snapshot.
  f.db.close(); f.other.exec("UPDATE cards SET value='reopened'"); f.db.open();
  assert.equal(f.get().card.value, 'reopened'); assert.equal(f.count(), 3);
});
test('key-count, per-entry and total-byte bounds evict without rejecting reads', t => {
  const f = fixture(t); let reads = 0;
  const read = () => ({card: {text: 'x'.repeat(1024)}});
  for (let i = 0; i <= MAX_KEYS; i++) lookup(f.db, String(i), read);
  lookup(f.db, '0', () => {reads++; return read();}); assert.equal(reads, 1);
  const huge = () => {reads++; return {text: 'x'.repeat(MAX_ENTRY_BYTES + 1)};};
  lookup(f.db, 'huge', huge); lookup(f.db, 'huge', huge); assert.equal(reads, 3);
  const large = () => ({text: 'x'.repeat(MAX_ENTRY_BYTES - 100)});
  for (let i = 0; i <= Math.ceil(MAX_BYTES / MAX_ENTRY_BYTES); i++) lookup(f.db, 'large' + i, large);
  lookup(f.db, 'large0', () => {reads++; return large();}); assert.equal(reads, 4);
});
test('native mutation, ownership, deletion and bulk-list code is byte-identical', () => {
  const source = fs.readFileSync(new URL('./release-files/sqlite-store-CH-caj1l.js', import.meta.url), 'utf8');
  const before = source.replace('import {lookupWorkboardSnapshot} from "./workboard-lookup-cache.mjs";\n', '')
    .replace('\tasync lookup(key) {\n\t\treturn lookupWorkboardSnapshot(this.db, key, () => {\n', '\tasync lookup(key) {\n')
    .replace('\t\t} : void 0;\n\t\t});\n\t}', '\t\t} : void 0;\n\t}');
  const plan = JSON.parse(fs.readFileSync(new URL('./workboard-lookup-cache-plan.json', import.meta.url)));
  assert.equal(createHash('sha256').update(before).digest('hex'), plan.files[0].before);
});
