import assert from 'node:assert/strict';

// Workboard card creation reads only the cards it needs, not every card.
//
// WorkboardStore.createDirect began with this.list(): every card with its notes and eleven child
// tables, read synchronously through node:sqlite and built into card objects on the Gateway main
// thread, inside the store's serial mutation queue. It used that list for three things only:
//   - the duplicate check: a card with the same automation idempotencyKey, tenant and board;
//   - the parent cards named in input.parents;
//   - the default position: the highest position in the new card's board column, plus a step.
// On V (2026-10-09, 4,150 cards, ~146k child rows) workboard.cards.create took p50 1.9 s over
// 418 calls, growing with the board, and Night Shift creates cards in bursts. 401 of those 418
// cards had a parent, and linking a parent runs dependsOn (the cycle check), which read every card
// a second time to walk the new card's ancestors. On the shared VLab mirror grown to V's size, a
// create without parents was 99% that first read, with the event loop blocked throughout.
//
// The SQLite card store now answers those three directly: cards whose automation_json carries the
// idempotency key (sorted with compareCards, then the unchanged predicate picks the first, as
// before), the parents by id through the store's existing lookup, and MAX(position) over the
// (board_id, status) index. board_id is written from cardBoardId(card) and automation_json from
// metadata.automation on every insert, so these see what list() saw. dependsOn walks the same
// parent links depth first, reading each ancestor by id with the same entry check list() applies;
// above 256 ancestors it falls back to the full read. Unchanged:
//   - stores without the two read methods (the non-SQLite store) take the original full read;
//   - the order of checks and errors (duplicate first, then "card not found: <parent>");
//   - the rest of createDirect, the mutation queue and compensation.

export const MARKER = 'workboard-create-indexed';
/** dependsOn reads at most this many ancestors by id; past it, one full read is cheaper. */
export const ANCESTOR_LIMIT = 256;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorkboardSqliteStore(source) {
  assert(!source.includes(MARKER), 'sqlite store already patched');
  return replaceExactlyOnce(source,
    '\t\t\tupdatedAt: requiredNumber(row, "updated_at")\n\t\t}));\n\t}\n};\nvar WorkboardSqliteBoardStore = class {',
    `\t\t\tupdatedAt: requiredNumber(row, "updated_at")
\t\t}));
\t}
\t/** ${MARKER}: cards whose automation carries this idempotency key, for createDirect's duplicate check. */
\tasync findByAutomationIdempotencyKey(key) {
\t\treturn this.db.prepare("SELECT * FROM workboard_cards WHERE json_extract(automation_json, '$.idempotencyKey') = ? ORDER BY created_at ASC, id ASC").all(key).map((row) => readCard(this.db, row));
\t}
\t/** ${MARKER}: highest position in one board column, or undefined when it is empty, for createDirect's default position. */
\tasync maxPosition(boardId, status) {
\t\treturn numberValue(this.db.prepare("SELECT MAX(position) AS position FROM workboard_cards WHERE board_id = ? AND status = ?").get(boardId, status), "position");
\t}
};
var WorkboardSqliteBoardStore = class {`,
    'end of WorkboardSqliteCardStore');
}

export function patchWorkboardRuntimeApi(source) {
  assert(!source.includes(MARKER), 'runtime api already patched');
  let out = source;
  out = replaceExactlyOnce(out,
    '\t\t\tlistBoardAggregates: async () => await store.listBoardAggregates()\n\t\t};\n\t}\n\tsubscribe(listener) {',
    `\t\t\tlistBoardAggregates: async () => await store.listBoardAggregates(),
\t\t\t...typeof store.findByAutomationIdempotencyKey === "function" ? {findByAutomationIdempotencyKey: async (key) => await store.findByAutomationIdempotencyKey(key)} : {},
\t\t\t...typeof store.maxPosition === "function" ? {maxPosition: async (boardId, status) => await store.maxPosition(boardId, status)} : {}
\t\t};
\t}
\tsubscribe(listener) {`,
    'trackCardStore return');
  out = replaceExactlyOnce(out,
    '\t\tconst cards = await this.list();\n\t\tconst parents = normalizeStringList(input.parents, "parents", 120);\n\t\tconst automation = normalizeCardAutomation(input);',
    `\t\t// ${MARKER}: read only the duplicate candidates, the parents and the column's highest position.
\t\tconst indexedCreate = typeof this.cardStore?.findByAutomationIdempotencyKey === "function" && typeof this.cardStore?.maxPosition === "function";
\t\tconst cards = indexedCreate ? void 0 : await this.list();
\t\tconst parents = normalizeStringList(input.parents, "parents", 120);
\t\tconst automation = normalizeCardAutomation(input);`,
    'createDirect full list');
  out = replaceExactlyOnce(out,
    '\t\t\tconst existing = cards.find((card) => card.metadata?.automation?.idempotencyKey === automation.idempotencyKey',
    '\t\t\tconst existing = (cards ?? (await this.cardStore.findByAutomationIdempotencyKey(automation.idempotencyKey)).filter((card) => Boolean(card.id)).toSorted(compareCards)).find((card) => card.metadata?.automation?.idempotencyKey === automation.idempotencyKey',
    'createDirect duplicate check');
  out = replaceExactlyOnce(out,
    '\t\tconst cardsById = new Map(cards.map((card) => [card.id, card]));\n\t\tconst parentCards = parents.map((parentId) => {',
    '\t\tconst cardsById = cards ? new Map(cards.map((card) => [card.id, card])) : new Map((await Promise.all(parents.map((parentId) => this.get(parentId)))).filter((card) => Boolean(card?.id)).map((card) => [card.id, card]));\n\t\tconst parentCards = parents.map((parentId) => {',
    'createDirect parents');
  out = replaceExactlyOnce(out,
    '\t\tconst position = Number.isFinite(normalizedPosition) ? normalizedPosition : Math.max(0, ...cards.filter((card) => card.status === status && cardBoardId(card) === boardId).map((card) => card.position)) + POSITION_STEP;',
    '\t\tconst position = Number.isFinite(normalizedPosition) ? normalizedPosition : (cards ? Math.max(0, ...cards.filter((card) => card.status === status && cardBoardId(card) === boardId).map((card) => card.position)) : Math.max(0, await this.cardStore.maxPosition(boardId, status) ?? 0)) + POSITION_STEP;',
    'createDirect position');
  out = replaceExactlyOnce(out,
    '\tasync dependsOn(cardId, targetParentId) {\n\t\tconst cards = new Map((await this.list()).map((entry) => [entry.id, entry]));',
    `\t/** ${MARKER}: walk the ancestors by id (the same depth-first search over parent links); a very deep ancestry falls back to one full read. */
\tasync dependsOn(cardId, targetParentId) {
\t\tif (!this.cardStore) return await this.dependsOnFullRead(cardId, targetParentId);
\t\tconst seen = /* @__PURE__ */ new Set();
\t\tconst stack = [cardId];
\t\twhile (stack.length > 0) {
\t\t\tconst id = stack.pop();
\t\t\tif (id === targetParentId) return true;
\t\t\tif (seen.has(id)) continue;
\t\t\tseen.add(id);
\t\t\tif (seen.size > ${ANCESTOR_LIMIT}) return await this.dependsOnFullRead(cardId, targetParentId);
\t\t\tconst entry = await this.store.lookup(id);
\t\t\tconst card = entry?.version === 1 && entry.card?.id ? entry.card : void 0;
\t\t\tif (card) stack.push(...cardParentIds(card).toReversed());
\t\t}
\t\treturn false;
\t}
\tasync dependsOnFullRead(cardId, targetParentId) {
\t\tconst cards = new Map((await this.list()).map((entry) => [entry.id, entry]));`,
    'dependsOn full list');
  return out;
}
