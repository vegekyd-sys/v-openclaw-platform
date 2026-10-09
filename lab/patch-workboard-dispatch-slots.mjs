import assert from 'node:assert/strict';

// Workboard dispatch counts owner slots from the cards that can hold one, not from every card.
//
// After #302 (card creation), dispatch was the remaining full board read on Night Shift's path.
// workboard.cards.dispatchWithOptions took p50 2.3-3.0 s on V (2026-10-09/10, 4,150 cards), every
// call over 1 s, because two steps read every card with all eleven child tables, synchronously on
// the Gateway main thread, only to count the cards holding an owner slot:
//   - runWorkboardDispatch: params.store.list() feeds selectStartableCards, which uses it only to
//     count workboardCardConsumesOwnerSlot cards per workboardCardSlotOwner;
//   - WorkboardSqliteCardStore.claimIfOwnerAvailable (the Night Shift owner cap): inside its
//     IMMEDIATE transaction, every other row plus every child row, to count the same per owner.
//
// workboardCardConsumesOwnerSlot is true only for an unarchived card that is running, has a running
// execution, or is not done and carries a claim. Those are columns of workboard_cards (archived_at,
// status, execution_status, claim_json), so SQL now selects that superset (on V: 59 of 4,150 rows)
// and the unchanged predicate and owner function decide on the full cards, as before. Unchanged:
//   - the predicate, the owner, the caps (36 per owner / 36 total) and the selection order;
//   - a store without listOwnerSlotCandidates takes the original full read.

export const MARKER = 'workboard-dispatch-slots';
export const SLOT_SUPERSET_SQL = "(archived_at IS NULL OR archived_at = 0) AND (status = 'running' OR execution_status = 'running' OR (status <> 'done' AND claim_json IS NOT NULL))";

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

/** The superset is derived from this exact predicate; a different one must not be patched blindly. */
export const SLOT_PREDICATE = 'function workboardCardConsumesOwnerSlot(card, now) {\n\tconst claim = card.metadata?.claim;\n\tconst activeClaim = claim && isFutureDateTimestampMs(claim.expiresAt, { nowMs: now });\n\treturn !card.metadata?.archivedAt && !isWorkboardClaimReclaimable(claim, now) && (card.status === "running" || card.status !== "done" && activeClaim || card.execution?.status === "running");\n}';

export function patchWorkboardSqliteStore(source) {
  assert(!source.includes(MARKER), 'sqlite store already patched');
  assert(source.includes('workboard-create-indexed'), 'expected the card-creation patch (#302) underneath');
  assert.equal(source.split(SLOT_PREDICATE).length, 2, 'workboardCardConsumesOwnerSlot changed; re-derive the slot superset');
  let out = source;
  out = replaceExactlyOnce(out,
    '\t\t\tconst rows = this.db.prepare("SELECT * FROM workboard_cards WHERE id <> ?").all(key);\n\t\t\tconst preloaded = loadCardChildRows(this.db);\n\t\t\tlet activeForOwner = 0;\n\t\t\tfor (const row of rows) {\n\t\t\t\tconst card = readCard(this.db, row, preloaded);',
    `\t\t\t// ${MARKER}: only rows that can hold an owner slot; the predicate below still decides.
\t\t\tconst rows = this.db.prepare("SELECT * FROM workboard_cards WHERE id <> ? AND ${SLOT_SUPERSET_SQL}").all(key);
\t\t\tlet activeForOwner = 0;
\t\t\tfor (const row of rows) {
\t\t\t\tconst card = readCard(this.db, row);`,
    'claimIfOwnerAvailable full read');
  out = replaceExactlyOnce(out,
    '\t\treturn numberValue(this.db.prepare("SELECT MAX(position) AS position FROM workboard_cards WHERE board_id = ? AND status = ?").get(boardId, status), "position");\n\t}\n};\nvar WorkboardSqliteBoardStore = class {',
    `\t\treturn numberValue(this.db.prepare("SELECT MAX(position) AS position FROM workboard_cards WHERE board_id = ? AND status = ?").get(boardId, status), "position");
\t}
\t/** ${MARKER}: every card that can hold an owner slot (a superset of workboardCardConsumesOwnerSlot), for the dispatcher's per-owner count. */
\tasync listOwnerSlotCandidates() {
\t\treturn this.db.prepare("SELECT * FROM workboard_cards WHERE ${SLOT_SUPERSET_SQL} ORDER BY created_at ASC, id ASC").all().map((row) => readCard(this.db, row));
\t}
};
var WorkboardSqliteBoardStore = class {`,
    'end of WorkboardSqliteCardStore');
  return out;
}

export function patchWorkboardRuntimeApi(source) {
  assert(!source.includes(MARKER), 'runtime api already patched');
  assert(source.includes('workboard-create-indexed'), 'expected the card-creation patch (#302) underneath');
  let out = source;
  out = replaceExactlyOnce(out,
    '\t\t\t...typeof store.maxPosition === "function" ? {maxPosition: async (boardId, status) => await store.maxPosition(boardId, status)} : {}\n\t\t};',
    `\t\t\t...typeof store.maxPosition === "function" ? {maxPosition: async (boardId, status) => await store.maxPosition(boardId, status)} : {},
\t\t\t...typeof store.listOwnerSlotCandidates === "function" ? {listOwnerSlotCandidates: async () => await store.listOwnerSlotCandidates()} : {}
\t\t};`,
    'trackCardStore return');
  out = replaceExactlyOnce(out,
    '\tconst cards = await params.store.list();\n\tconst candidates = directCard ? [directCard] : await params.store.list({ boardId, cardIds });',
    `\t// ${MARKER}: selectStartableCards uses this list only to count owner slots.
\tconst cards = typeof params.store.cardStore?.listOwnerSlotCandidates === "function" ? await params.store.cardStore.listOwnerSlotCandidates() : await params.store.list();
\tconst candidates = directCard ? [directCard] : await params.store.list({ boardId, cardIds });`,
    'runWorkboardDispatch full list');
  return out;
}
