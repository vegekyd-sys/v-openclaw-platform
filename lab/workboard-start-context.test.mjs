import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARKER, RECENT_LIMIT, patchWorkboardRuntimeApi, patchWorkboardSqliteStore } from './patch-workboard-start-context.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's Workboard files as live since batch-20261010c (release-batch-20261009 + #302 + #306)
const runtimeApi = read('./release-files/workboard-dispatch-slots/runtime-api-1CCazqtv.js');
const sqliteStore = read('./release-files/workboard-dispatch-slots/sqlite-store-CH-caj1l.js');
const releasedRuntimeApi = read('./release-files/workboard-start-context/runtime-api-1CCazqtv.js');
const releasedSqliteStore = read('./release-files/workboard-start-context/sqlite-store-CH-caj1l.js');

test('release files are V\'s Workboard files plus only this patch', () => {
  assert.equal(patchWorkboardRuntimeApi(runtimeApi), releasedRuntimeApi);
  assert.equal(patchWorkboardSqliteStore(sqliteStore), releasedSqliteStore);
  assert.throws(() => patchWorkboardRuntimeApi(releasedRuntimeApi), /already patched/);
  assert.throws(() => patchWorkboardSqliteStore(releasedSqliteStore), /already patched/);
  assert.throws(() => patchWorkboardRuntimeApi(read('./release-files/workboard-create-indexed/runtime-api-1CCazqtv.js')), /#306/);
  assert.throws(() => patchWorkboardRuntimeApi(runtimeApi.replace('.slice(0, 5) : [];', '.slice(0, 6) : [];')), /recent-work selection changed/);
});

test('the worker context reads the parents, the card and the recent done work, in list() order', () => {
  const method = releasedRuntimeApi.slice(releasedRuntimeApi.indexOf('\tasync buildWorkerContext(id) {'), releasedRuntimeApi.indexOf('\n\t}\n', releasedRuntimeApi.indexOf('\tasync buildWorkerContext(id) {')));
  assert.match(method, /if \(typeof this\.cardStore\?\.listRecentDoneCardsForAgent !== "function"\) return buildWorkerContext\(card, await this\.list\(\)\);/);
  assert.match(method, new RegExp(`listRecentDoneCardsForAgent\\(cardBoardId\\(card\\), card\\.agentId, card\\.id, ${RECENT_LIMIT}\\)`));
  assert.match(method, /toSorted\(\(a, b\) => a\.createdAt - b\.createdAt \|\| \(a\.id < b\.id \? -1 : a\.id > b\.id \? 1 : 0\)\)\.toSorted\(compareCards\)/);
  // the store's full read orders by created_at, id: the tie order the method reproduces
  assert.match(releasedSqliteStore, /SELECT \* FROM workboard_cards ORDER BY created_at ASC, id ASC/);
  // ties at the fifth place are all fetched
  assert.match(releasedSqliteStore, /ORDER BY updated_at DESC LIMIT 1 OFFSET \?"\)\.get\(boardId, agentId, excludeId, limit - 1\)/);
  assert.match(releasedSqliteStore, /AND updated_at >= \?"\)\.all\(boardId, agentId, excludeId, floor\.updated_at\)/);
});

test('the dependency check reads the parents by id, or every card without a card store', () => {
  const check = releasedRuntimeApi.slice(releasedRuntimeApi.indexOf('\tasync assertActiveStatusAllowed('), releasedRuntimeApi.indexOf('\tasync delete(id)'));
  assert.match(check, /this\.cardStore \? new Map\(\(await Promise\.all\(parents\.map\(\(parentId\) => this\.get\(parentId\)\)\)\)/);
  assert.match(check, /: new Map\(\(await this\.list\(\)\)\.map\(\(card\) => \[card\.id, card\]\)\) : void 0;/);
  assert.match(check, /throw new Error\("card dependencies are not done\."\)/);
  assert.equal(releasedRuntimeApi.split(MARKER).length - 1, 2);
});
