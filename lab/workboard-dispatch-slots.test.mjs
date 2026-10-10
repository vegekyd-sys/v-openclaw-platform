import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { MARKER, SLOT_PREDICATE, SLOT_SUPERSET_SQL, patchWorkboardRuntimeApi, patchWorkboardSqliteStore } from './patch-workboard-dispatch-slots.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's Workboard files as live since batch-20261010 (release-batch-20261009 + #302)
const runtimeApi = read('./release-files/workboard-create-indexed/runtime-api-1CCazqtv.js');
const sqliteStore = read('./release-files/workboard-create-indexed/sqlite-store-CH-caj1l.js');
const releasedRuntimeApi = read('./release-files/workboard-dispatch-slots/runtime-api-1CCazqtv.js');
const releasedSqliteStore = read('./release-files/workboard-dispatch-slots/sqlite-store-CH-caj1l.js');

test('release files are V\'s Workboard files plus only this patch', () => {
  assert.equal(patchWorkboardRuntimeApi(runtimeApi), releasedRuntimeApi);
  assert.equal(patchWorkboardSqliteStore(sqliteStore), releasedSqliteStore);
  assert.throws(() => patchWorkboardRuntimeApi(releasedRuntimeApi), /already patched/);
  assert.throws(() => patchWorkboardSqliteStore(releasedSqliteStore), /already patched/);
  assert.throws(() => patchWorkboardSqliteStore(sqliteStore.replace('card.status === "running" ||', 'card.status === "review" ||')), /re-derive the slot superset/);
  assert.throws(() => patchWorkboardRuntimeApi(read('../release/captured/release-batch-20261009/dist/runtime-api-1CCazqtv.js')), /#302/);
});

test('dispatch and the owner cap keep the full read only for stores without the candidate read', () => {
  assert.match(releasedRuntimeApi, /const cards = typeof params\.store\.cardStore\?\.listOwnerSlotCandidates === "function" \? await params\.store\.cardStore\.listOwnerSlotCandidates\(\) : await params\.store\.list\(\);/);
  assert.match(releasedRuntimeApi, /listOwnerSlotCandidates: async \(\) => await store\.listOwnerSlotCandidates\(\)/);
  const claim = releasedSqliteStore.slice(releasedSqliteStore.indexOf('\tasync claimIfOwnerAvailable('), releasedSqliteStore.indexOf('\tasync deleteIfUpdatedAt('));
  assert(!claim.includes('loadCardChildRows'), 'the owner cap no longer preloads every child row');
  assert(claim.includes(`WHERE id <> ? AND ${SLOT_SUPERSET_SQL}`));
  assert(claim.includes('workboardCardConsumesOwnerSlot(card, now) && workboardCardSlotOwner(card) === ownerId'), 'the unchanged predicate still decides');
  assert.equal(releasedSqliteStore.split(MARKER).length - 1, 2);
  assert.equal(releasedSqliteStore.split(SLOT_PREDICATE).length, 2);
});

// The SQL superset must contain every row the real predicate counts, over every column state.
function loadPredicate() {
  const reclaim = sqliteStore.slice(sqliteStore.indexOf('function isWorkboardClaimReclaimable('), sqliteStore.indexOf('\n}\n', sqliteStore.indexOf('function isWorkboardClaimReclaimable(')) + 2);
  const constant = sqliteStore.match(/const CLAIM_RECLAIM_MS = [^;]+;/)[0];
  // isFutureDateTimestampMs is imported; any implementation keeps the superset (activeClaim needs a claim).
  return new Function(`const isFutureDateTimestampMs = (v, { nowMs }) => typeof v === "number" && Number.isFinite(v) && v > nowMs;\n${constant}\n${reclaim}\n${SLOT_PREDICATE}\nreturn workboardCardConsumesOwnerSlot;`)();
}
// readCard's mapping for the fields the predicate reads
const cardFromRow = (row) => {
  const claim = typeof row.claim_json === 'string' && row.claim_json ? JSON.parse(row.claim_json) : undefined;
  const archivedAt = typeof row.archived_at === 'number' ? row.archived_at : undefined;
  return { id: row.id, status: row.status, ...row.execution_id ? { execution: { status: row.execution_status } } : {}, metadata: { ...claim ? { claim } : {}, ...archivedAt !== undefined ? { archivedAt } : {} } };
};

test('the slot superset contains every card the predicate counts', () => {
  const consumes = loadPredicate();
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE workboard_cards (id TEXT PRIMARY KEY, status TEXT NOT NULL, execution_id TEXT, execution_status TEXT, claim_json TEXT, archived_at INTEGER) STRICT');
  const now = 1_800_000_000_000;
  const statuses = ['backlog', 'todo', 'ready', 'running', 'review', 'blocked', 'done', 'scheduled'];
  const claims = [null, 'null', '{}', JSON.stringify({ ownerId: 'a', expiresAt: now + 60_000 }), JSON.stringify({ ownerId: 'a', expiresAt: now - 1_000 }), JSON.stringify({ ownerId: 'a', expiresAt: now - 86_400_000 }), JSON.stringify({ ownerId: 'a' })];
  const executions = [[null, null], ['e', 'running'], ['e', 'blocked'], ['e', 'done'], [null, 'running']];
  const archived = [null, 0, now - 1000];
  const insert = db.prepare('INSERT INTO workboard_cards VALUES (?, ?, ?, ?, ?, ?)');
  let n = 0;
  for (const s of statuses) for (const c of claims) for (const [eid, es] of executions) for (const a of archived) insert.run(`c${n++}`, s, eid, es, c, a);
  const superset = new Set(db.prepare(`SELECT id FROM workboard_cards WHERE ${SLOT_SUPERSET_SQL}`).all().map((r) => r.id));
  const counted = db.prepare('SELECT * FROM workboard_cards').all().filter((row) => consumes(cardFromRow(row), now)).map((row) => row.id);
  assert(counted.length > 0);
  for (const id of counted) assert(superset.has(id), `${id} holds a slot but is outside the superset`);
  // what dominates a real board stays out: finished, idle and archived cards
  const outside = (where) => db.prepare(`SELECT id FROM workboard_cards WHERE ${where}`).all().every((r) => !superset.has(r.id));
  assert(outside("status = 'done' AND (execution_status IS NULL OR execution_status <> 'running')"));
  assert(outside("status <> 'running' AND claim_json IS NULL AND (execution_status IS NULL OR execution_status <> 'running')"));
  assert(outside('archived_at > 0'));
  assert.equal(n, statuses.length * claims.length * executions.length * archived.length);
});
