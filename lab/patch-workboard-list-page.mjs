import assert from 'node:assert/strict';

// workboard_list reads only the cards it returns (V 2026-11-24).
//
// 2026-11-23 19:09 and 23:24 CST the Gateway's main thread stopped for 28 s and 19 s. Both times a Codex
// night-shift turn had called workboard_list {boardId: "nightshift", limit: 200}; the calls took 30 s and
// 19 s. Other workboard_list calls that day took 8-17 s, limit 20 included. The tool called
// store.list({boardId}), which reads every card on V's board with all eleven child tables (29,105 cards,
// 165 MB of notes, 440k events, 66k links, 31k attempts), sorts them, and only then filters and keeps the
// first `limit`.
//
// workboard-list-page-v1:
// - the card store reads the sort keys (id, status, position, created_at) of the cards the tool can return,
//   narrowed by columns that can only drop cards the tool drops too: board_id (written as cardBoardId(card)
//   by insertCard, the table's only writer), status, agent_id, unarchived, and, for a tenant made of
//   characters JSON never escapes, the tenant's JSON string inside automation_json;
// - WorkboardStore.listPage sorts the keys with compareCards in the full read's order (created_at, id, then
//   the stable sort), reads each card whole through get() in that order, applies the board check and the
//   tool's own filters to the whole card, and stops at `limit`;
// - workboard_list uses it; the filters are the tool's own, unchanged.
// OPENCLAW_V_WORKBOARD_LIST_PAGE=0 restores the full read (read per call).

export const MARKER = 'workboard-list-page-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source, name) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to ${name}`);
}

// JSON.stringify leaves these characters as they are, so the tenant's JSON string is a substring of any
// automation_json that holds the tenant.
export const PLAIN_TENANT = '^[A-Za-z0-9_.:@-]+$';

export function patchSqliteStore(source) {
  guard(source, 'sqlite-store-CH-caj1l.js');
  return replaceExactlyOnce(source,
    `	async listOwnerSlotCandidates() {
		return this.db.prepare("SELECT * FROM workboard_cards WHERE (archived_at IS NULL OR archived_at = 0) AND (status = 'running' OR execution_status = 'running' OR (status <> 'done' AND claim_json IS NOT NULL)) ORDER BY created_at ASC, id ASC").all().map((row) => readCard(this.db, row));
	}
};`,
    `	async listOwnerSlotCandidates() {
		return this.db.prepare("SELECT * FROM workboard_cards WHERE (archived_at IS NULL OR archived_at = 0) AND (status = 'running' OR execution_status = 'running' OR (status <> 'done' AND claim_json IS NOT NULL)) ORDER BY created_at ASC, id ASC").all().map((row) => readCard(this.db, row));
	}
	/** ${MARKER}: sort keys of every card workboard_list can return (a superset; the caller checks each whole card), in entries() order. */
	async listCardSortKeys(filter = {}) {
		const where = [];
		const args = [];
		if (filter.boardId) {
			where.push("board_id = ?");
			args.push(filter.boardId);
		}
		if (filter.status) {
			where.push("status = ?");
			args.push(filter.status);
		}
		if (filter.agentId) {
			where.push("agent_id = ?");
			args.push(filter.agentId);
		}
		if (filter.includeArchived !== true) where.push("(archived_at IS NULL OR archived_at = 0)");
		if (typeof filter.tenant === "string" && /${PLAIN_TENANT}/u.test(filter.tenant)) {
			where.push("instr(automation_json, ?) > 0");
			args.push(JSON.stringify(filter.tenant));
		}
		return this.db.prepare(\`SELECT id, status, position, created_at FROM workboard_cards\${where.length ? \` WHERE \${where.join(" AND ")}\` : ""} ORDER BY created_at ASC, id ASC\`).all(...args).map((row) => ({
			id: requiredString(row, "id"),
			status: requiredString(row, "status"),
			position: requiredNumber(row, "position"),
			createdAt: requiredNumber(row, "created_at")
		}));
	}
};`,
    'WorkboardSqliteCardStore.listOwnerSlotCandidates');
}

export function patchRuntimeApi(source) {
  guard(source, 'runtime-api-1CCazqtv.js');
  let out = replaceExactlyOnce(source,
    `			...typeof store.listRecentDoneCardsForAgent === "function" ? {listRecentDoneCardsForAgent: async (boardId, agentId, excludeId, limit) => await store.listRecentDoneCardsForAgent(boardId, agentId, excludeId, limit)} : {}
`,
    `			...typeof store.listRecentDoneCardsForAgent === "function" ? {listRecentDoneCardsForAgent: async (boardId, agentId, excludeId, limit) => await store.listRecentDoneCardsForAgent(boardId, agentId, excludeId, limit)} : {},
			// ${MARKER}
			...typeof store.listCardSortKeys === "function" ? {listCardSortKeys: async (filter) => await store.listCardSortKeys(filter)} : {}
`,
    'trackCardStore listRecentDoneCardsForAgent');
  out = replaceExactlyOnce(out,
    `		return cards.filter((card) => !boardId || cardBoardId(card) === boardId).toSorted(compareCards);
	}
	async listBoards() {`,
    `		return cards.filter((card) => !boardId || cardBoardId(card) === boardId).toSorted(compareCards);
	}
	/** ${MARKER}: list({ boardId }).filter(keep).slice(0, limit), reading only the cards it returns. */
	async listPage(filter, keep, limit) {
		const boardId = normalizeBoardId(filter.boardId);
		if (process.env.OPENCLAW_V_WORKBOARD_LIST_PAGE === "0" || typeof this.cardStore?.listCardSortKeys !== "function") return (await this.list({ boardId })).filter(keep).slice(0, limit);
		const keys = (await this.cardStore.listCardSortKeys({
			boardId,
			status: filter.status,
			agentId: filter.agentId,
			tenant: filter.tenant,
			includeArchived: filter.includeArchived === true
		})).toSorted(compareCards);
		const cards = [];
		for (const key of keys) {
			if (cards.length >= limit) break;
			const card = await this.get(key.id);
			if (card && (!boardId || cardBoardId(card) === boardId) && keep(card)) cards.push(card);
		}
		return cards;
	}
	async listBoards() {`,
    'WorkboardStore.list');
  return out;
}

export function patchWorkboardIndex(source) {
  guard(source, 'extensions/workboard/index.js');
  return replaceExactlyOnce(source,
    `				const cards = (await store.list({ boardId })).filter((card) => record.includeArchived === true || !card.metadata?.archivedAt).filter((card) => !status || card.status === status).filter((card) => !agentId || card.agentId === agentId).filter((card) => !tenant || card.metadata?.automation?.tenant === tenant).slice(0, limit).map(summarizeCard);
`,
    `				// ${MARKER}: the same filters, applied to the cards read in order until \`limit\` pass.
				const keep = (card) => (record.includeArchived === true || !card.metadata?.archivedAt) && (!status || card.status === status) && (!agentId || card.agentId === agentId) && (!tenant || card.metadata?.automation?.tenant === tenant);
				const cards = (typeof store.listPage === "function" ? await store.listPage({
					boardId,
					status,
					agentId,
					tenant,
					includeArchived: record.includeArchived === true
				}, keep, limit) : (await store.list({ boardId })).filter(keep).slice(0, limit)).map(summarizeCard);
`,
    'workboard_list cards');
}

export const FILES = [
  { name: 'sqlite-store-CH-caj1l.js', base: 'lab/release-files/spawn-broker-workboard-index', target: 'openclaw/dist', before: '9ff2826f52d522b5122e1542a3adb3b306d20bc13d673d4988050d5bef1e4168', patch: patchSqliteStore },
  { name: 'runtime-api-1CCazqtv.js', base: 'lab/release-files/workboard-full-context', target: 'openclaw/dist', before: 'b1bdba866c4cf587c0db959ff9a04a5b127f37b1c470eb134e097f1a46f1d8d6', patch: patchRuntimeApi },
  { name: 'extensions/workboard/index.js', base: 'lab/release-files/workboard-sweep-complete', target: 'openclaw/dist', before: '62a0a1b558563fc481bd7231fe2366feb6be1ea56a59b14e4afb4215c2c75590', patch: patchWorkboardIndex },
];
