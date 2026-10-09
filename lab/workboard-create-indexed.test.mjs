import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ANCESTOR_LIMIT, MARKER, patchWorkboardRuntimeApi, patchWorkboardSqliteStore } from './patch-workboard-create-indexed.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's Workboard runtime and SQLite card store as live since release-batch-20261009
const runtimeApi = read('../release/captured/release-batch-20261009/dist/runtime-api-1CCazqtv.js');
const sqliteStore = read('../release/captured/release-batch-20261009/dist/sqlite-store-CH-caj1l.js');
const releasedRuntimeApi = read('./release-files/workboard-create-indexed/runtime-api-1CCazqtv.js');
const releasedSqliteStore = read('./release-files/workboard-create-indexed/sqlite-store-CH-caj1l.js');

test('release files are V\'s Workboard files plus only this patch', () => {
  assert.equal(patchWorkboardRuntimeApi(runtimeApi), releasedRuntimeApi);
  assert.equal(patchWorkboardSqliteStore(sqliteStore), releasedSqliteStore);
  assert.throws(() => patchWorkboardRuntimeApi(releasedRuntimeApi), /already patched/);
  assert.throws(() => patchWorkboardSqliteStore(releasedSqliteStore), /already patched/);
});

test('createDirect reads every card only when the store lacks the indexed reads', () => {
  const start = releasedRuntimeApi.indexOf('\tasync createDirect(input, scope, options = {}) {');
  const body = releasedRuntimeApi.slice(start, releasedRuntimeApi.indexOf('\n\tasync captureSession(', start));
  assert.match(body, /const cards = indexedCreate \? void 0 : await this\.list\(\);/);
  // each use of the full list keeps its original expression behind `cards ?`
  assert.match(body, /\(cards \?\? \(await this\.cardStore\.findByAutomationIdempotencyKey/);
  assert.match(body, /const cardsById = cards \? new Map\(cards\.map/);
  assert.match(body, /\(cards \? Math\.max\(0, \.\.\.cards\.filter/);
  assert.match(releasedRuntimeApi, /findByAutomationIdempotencyKey: async \(key\) => await store\.findByAutomationIdempotencyKey\(key\)/);
  assert.match(releasedSqliteStore, /json_extract\(automation_json, '\$\.idempotencyKey'\) = \?/);
  assert.match(releasedSqliteStore, /SELECT MAX\(position\) AS position FROM workboard_cards WHERE board_id = \? AND status = \?/);
  assert.equal(releasedRuntimeApi.split(MARKER).length - 1, 2);
});

// Run the patched dependsOn and the original full-read walk side by side on random parent graphs.
function loadDependsOn() {
  const fn = (name) => {
    const start = releasedRuntimeApi.indexOf(`function ${name}(`);
    return releasedRuntimeApi.slice(start, releasedRuntimeApi.indexOf('\n}\n', start) + 2);
  };
  const start = releasedRuntimeApi.indexOf(`\t/** ${MARKER}: walk the ancestors by id`);
  const end = releasedRuntimeApi.indexOf('\n\tasync recordDispatch(', start);
  const methods = releasedRuntimeApi.slice(start, end);
  return new Function(`${fn('cardParentIds')}\nreturn class {\n\tconstructor(cards) { this.cards = cards; this.lookups = 0; this.fullReads = 0; this.cardStore = {}; this.store = { lookup: async (id) => { this.lookups += 1; const card = this.cards.get(id); return card ? { version: 1, card } : void 0; } }; }\n\tasync list() { this.fullReads += 1; return [...this.cards.values()]; }\n${methods}\n};`)();
}

function randomGraph(seed, size) {
  let state = seed;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const cards = new Map();
  for (let i = 0; i < size; i += 1) {
    const parents = [];
    for (let p = 0; p < 3; p += 1) if (i > 0 && rand() < 0.5) parents.push(`c${Math.floor(rand() * i)}`);
    if (rand() < 0.05) parents.push(`missing${i}`); // links to deleted cards
    cards.set(`c${i}`, { id: `c${i}`, metadata: { links: parents.map((targetCardId) => ({ type: 'parent', targetCardId })) } });
  }
  return cards;
}

test('dependsOn answers exactly as the full-read walk, reading only ancestors', async () => {
  const Store = loadDependsOn();
  let pairs = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const cards = randomGraph(seed, 120);
    const store = new Store(cards);
    for (let i = 0; i < 60; i += 1) {
      const cardId = `c${(seed * 7 + i * 13) % 120}`;
      const target = i % 9 === 0 ? `missing${i}` : `c${(seed * 3 + i * 5) % 120}`;
      store.fullReads = 0;
      const indexed = await store.dependsOn(cardId, target);
      assert.equal(store.fullReads, 0);
      assert.equal(indexed, await store.dependsOnFullRead(cardId, target), `${seed}:${cardId}->${target}`);
      pairs += 1;
    }
  }
  assert.equal(pairs, 1200);
});

test('a very deep ancestry falls back to one full read; a store without a card store keeps it', async () => {
  const Store = loadDependsOn();
  const chain = new Map();
  for (let i = 0; i <= ANCESTOR_LIMIT + 10; i += 1) chain.set(`c${i}`, { id: `c${i}`, metadata: { links: i ? [{ type: 'parent', targetCardId: `c${i - 1}` }] : [] } });
  const deep = new Store(chain);
  assert.equal(await deep.dependsOn(`c${ANCESTOR_LIMIT + 10}`, 'c0'), true);
  assert.equal(deep.fullReads, 1);
  assert.equal(deep.lookups, ANCESTOR_LIMIT);
  const plain = new Store(chain);
  plain.cardStore = void 0;
  assert.equal(await plain.dependsOn('c3', 'c0'), true);
  assert.equal(plain.fullReads, 1);
  assert.equal(plain.lookups, 0);
});
