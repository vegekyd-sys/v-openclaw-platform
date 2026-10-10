import assert from 'node:assert/strict';

// Starting a Workboard card and moving one into an active status read only the cards they need.
//
// After #302 (creation) and #306 (owner slots) workboard.cards.dispatchWithOptions still took
// ~1.1 s on V (2026-10-10 14:12-14:40, 21 calls) against 23 ms in the candidate that started no
// card: each card a dispatch starts goes through WorkboardStore.buildWorkerContext, which read
// every card (on V 4,150, with all eleven child tables, on the Gateway main thread) to write two
// sections of the worker prompt:
//   - "Parent results": the card's done parents (by id);
//   - "Recent done work by <agent>": the five most recently updated done cards of the same agent
//     on the same board, ties kept in board order (a stable sort over the compareCards list).
// assertActiveStatusAllowed (complete, move, update into ready/running/review/done) read every
// card the same way for one check: whether the card's parents are done. On V complete took
// avg 1.25 s.
//
// buildWorkerContext now hands the unchanged builder only the cards those sections can use: the
// parents by id, the card, and every done card of that agent on that board updated no earlier than
// the fifth most recent (so boundary ties are all present), in list()'s order (created_at and id,
// then a stable compareCards sort, so cards tied on every compareCards key keep their order). The builder
// filters and sorts them exactly as it did the full list. assertActiveStatusAllowed reads the
// parents by id. Stores without the new read keep the full read.

export const MARKER = 'workboard-start-context';
export const RECENT_LIMIT = 5;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorkboardSqliteStore(source) {
  assert(!source.includes(MARKER), 'sqlite store already patched');
  assert(source.includes('workboard-dispatch-slots'), 'expected the owner-slot patch (#306) underneath');
  return replaceExactlyOnce(source,
    '\tasync listOwnerSlotCandidates() {\n',
    `\t/** ${MARKER}: done cards of one agent on one board, updated no earlier than the limit-th most recent (ties included), for the worker context. */
\tasync listRecentDoneCardsForAgent(boardId, agentId, excludeId, limit) {
\t\tconst floor = this.db.prepare("SELECT updated_at FROM workboard_cards WHERE board_id = ? AND agent_id = ? AND status = 'done' AND id <> ? ORDER BY updated_at DESC LIMIT 1 OFFSET ?").get(boardId, agentId, excludeId, limit - 1);
\t\tconst rows = floor ? this.db.prepare("SELECT * FROM workboard_cards WHERE board_id = ? AND agent_id = ? AND status = 'done' AND id <> ? AND updated_at >= ?").all(boardId, agentId, excludeId, floor.updated_at) : this.db.prepare("SELECT * FROM workboard_cards WHERE board_id = ? AND agent_id = ? AND status = 'done' AND id <> ?").all(boardId, agentId, excludeId);
\t\treturn rows.map((row) => readCard(this.db, row));
\t}
\tasync listOwnerSlotCandidates() {
`,
    'listOwnerSlotCandidates');
}

export function patchWorkboardRuntimeApi(source) {
  assert(!source.includes(MARKER), 'runtime api already patched');
  assert(source.includes('workboard-dispatch-slots'), 'expected the owner-slot patch (#306) underneath');
  let out = source;
  out = replaceExactlyOnce(out,
    '\t\t\t...typeof store.listOwnerSlotCandidates === "function" ? {listOwnerSlotCandidates: async () => await store.listOwnerSlotCandidates()} : {}\n\t\t};',
    `\t\t\t...typeof store.listOwnerSlotCandidates === "function" ? {listOwnerSlotCandidates: async () => await store.listOwnerSlotCandidates()} : {},
\t\t\t...typeof store.listRecentDoneCardsForAgent === "function" ? {listRecentDoneCardsForAgent: async (boardId, agentId, excludeId, limit) => await store.listRecentDoneCardsForAgent(boardId, agentId, excludeId, limit)} : {}
\t\t};`,
    'trackCardStore return');
  out = replaceExactlyOnce(out,
    '\t\tif (!card) throw new Error(`card not found: ${id}`);\n\t\treturn buildWorkerContext(card, await this.list());\n\t}',
    `\t\tif (!card) throw new Error(\`card not found: \${id}\`);
\t\t// ${MARKER}: only the cards the context's parent and recent-work sections can use, in board order.
\t\tif (typeof this.cardStore?.listRecentDoneCardsForAgent !== "function") return buildWorkerContext(card, await this.list());
\t\tconst parents = (await Promise.all(cardParentIds(card).map((parentId) => this.get(parentId)))).filter((entry) => Boolean(entry?.id));
\t\tconst recent = card.agentId ? await this.cardStore.listRecentDoneCardsForAgent(cardBoardId(card), card.agentId, card.id, ${RECENT_LIMIT}) : [];
\t\tconst cards = new Map([...parents, ...recent, card].map((entry) => [entry.id, entry]));
\t\t// list() order: entries by created_at, id, then compareCards (stable), so exact ties keep the same order\n\t\treturn buildWorkerContext(card, [...cards.values()].toSorted((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).toSorted(compareCards));
\t}`,
    'buildWorkerContext full list');
  out = replaceExactlyOnce(out,
    '\t\tconst cards = parents.length > 0 ? new Map((await this.list()).map((card) => [card.id, card])) : void 0;\n\t\tif (parents.length > 0 && !parents.every((parentId) => cards?.get(parentId)?.status === "done")) throw new Error("card dependencies are not done.");',
    `\t\t// ${MARKER}: the parents by id.
\t\tconst cards = parents.length > 0 ? this.cardStore ? new Map((await Promise.all(parents.map((parentId) => this.get(parentId)))).filter((card) => Boolean(card?.id)).map((card) => [card.id, card])) : new Map((await this.list()).map((card) => [card.id, card])) : void 0;
\t\tif (parents.length > 0 && !parents.every((parentId) => cards?.get(parentId)?.status === "done")) throw new Error("card dependencies are not done.");`,
    'assertActiveStatusAllowed full list');
  // the builder's own recent-work selection must be the one this patch reproduces
  assert(out.includes('const recentAgentWork = card.agentId && cards.length ? cards.filter((entry) => entry.id !== card.id && cardBoardId(entry) === cardBoardId(card) && entry.agentId === card.agentId && entry.status === "done").toSorted((a, b) => b.updatedAt - a.updatedAt).slice(0, 5) : [];'), 'buildWorkerContext recent-work selection changed');
  return out;
}
