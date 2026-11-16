import assert from 'node:assert/strict';

// sessions.list visibilityRowsOnly (sessions_search's candidate listing, PR #475) loaded the list
// projection: json_remove + JSON.parse of every session node's entry JSON (1.98 GB for V's 21,913
// makaron rows, 2026-11-16) on the Gateway thread, for five fields of each entry. It is the
// longest block left in a sessions_search after PR #608 (4.5 s warm, ~25 s cold on a V-scale
// VLab fixture). See lab/release-files/sessions-visibility-columns/README.md.
//
// Port of openclaw-versa versa/port-sessions-visibility-columns-20261116 (628f03f9d18) onto V's bytes:
// - session-accessor.sqlite-entry: readSqliteSessionVisibilityEntries reads sessionId, updatedAt,
//   archivedAt, lastInteractionAt, spawnedBy and parentSessionKey from session_nodes' covering
//   indexes, and scans the table only for entry_valid and typeof(pinned_at) (record header, no
//   overflow walk). Rows the columns cannot reproduce (entry_valid != 1, pinned, parent_session_key
//   = spawned_by) are decoded from JSON as before. listSqliteSessionEntriesFromDatabase uses it for
//   a list read with visibilityColumns on a durable database.
// - combined-store-gateway: projection "visibility" = list projection + visibilityColumns.
// - sessions-read: sessions.list visibilityRowsOnly with only column filters, no visibility filter
//   and no lifecycle window loads projection "visibility".
// OPENCLAW_V_SESSIONS_VISIBILITY_COLUMNS=0 restores the list projection.

export const SESSIONS_VISIBILITY_COLUMNS_MARKER = '// sessions-visibility-columns-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const VISIBILITY_ENTRIES = `${SESSIONS_VISIBILITY_COLUMNS_MARKER}: entries for sessions.list visibility rows from session_nodes' promoted columns.
// They carry only sessionId, updatedAt, archivedAt, lastInteractionAt, spawnedBy and parentSessionKey (what a
// visibility listing filters, orders and derives its rows by). The list projection decodes every row's entry JSON
// (1.98 GB on V); these values come from the columns the canonical writer projects from the same entry
// (bindSessionNode), each read from its covering index. The table is scanned only for entry_valid and the presence
// of pinned_at: a 0/1/NULL value lives in the record header, so SQLite does not walk the row's overflow pages (where
// every column after entry_json is stored). Rows the columns cannot reproduce exactly are decoded from JSON as before:
// entry_valid != 1 (raw or unsettled writes), pinned rows (no index; the sort reads pinnedAt), and
// parent_session_key = spawned_by (the writer stores parentSessionKey ?? spawnedBy). Undefined without the indexes.
const SESSION_VISIBILITY_COLUMN_INDEXES = [
	"idx_agent_session_nodes_updated_at",
	"idx_agent_session_nodes_current_session_id",
	"idx_agent_session_nodes_parent_session_key",
	"idx_agent_session_nodes_spawned_by",
	"idx_agent_session_nodes_archived_at",
	"idx_agent_session_nodes_last_interaction_at"
];
const SESSION_VISIBILITY_SPECIAL_ROW_CHUNK = 500;
function readSessionVisibilityIndexColumn(db, query) {
	const values = /* @__PURE__ */ new Map();
	for (const row of db.prepare(query).iterate()) values.set(Number(row.id), row.v);
	return values;
}
function readSqliteSessionVisibilityEntries(database) {
	const { db } = database;
	const indexNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'session_nodes'").all().map((row) => row.name));
	if (!SESSION_VISIBILITY_COLUMN_INDEXES.every((name) => indexNames.has(name))) return;
	const read = () => {
		const nodes = db.prepare("SELECT rowid AS id, session_key, entry_valid, typeof(pinned_at) AS pinned_type FROM session_nodes ORDER BY session_key").all();
		const updatedAt = readSessionVisibilityIndexColumn(db, "SELECT rowid AS id, updated_at AS v FROM session_nodes INDEXED BY idx_agent_session_nodes_updated_at");
		const sessionId = readSessionVisibilityIndexColumn(db, "SELECT rowid AS id, current_session_id AS v FROM session_nodes INDEXED BY idx_agent_session_nodes_current_session_id");
		const parent = readSessionVisibilityIndexColumn(db, "SELECT rowid AS id, parent_session_key AS v FROM session_nodes INDEXED BY idx_agent_session_nodes_parent_session_key WHERE parent_session_key IS NOT NULL");
		const spawnedBy = readSessionVisibilityIndexColumn(db, "SELECT rowid AS id, spawned_by AS v FROM session_nodes INDEXED BY idx_agent_session_nodes_spawned_by WHERE spawned_by IS NOT NULL");
		const archivedAt = readSessionVisibilityIndexColumn(db, "SELECT rowid AS id, archived_at AS v FROM session_nodes INDEXED BY idx_agent_session_nodes_archived_at WHERE archived_at IS NOT NULL");
		const lastInteractionAt = readSessionVisibilityIndexColumn(db, "SELECT rowid AS id, last_interaction_at AS v FROM session_nodes INDEXED BY idx_agent_session_nodes_last_interaction_at WHERE last_interaction_at IS NOT NULL");
		const keys = [];
		const entries = /* @__PURE__ */ new Map();
		const special = [];
		for (const node of nodes) {
			keys.push(node.session_key);
			const id = Number(node.id);
			const parentKey = parent.get(id);
			const spawnedKey = spawnedBy.get(id);
			const updated = updatedAt.get(id);
			const currentSessionId = sessionId.get(id);
			if (node.entry_valid !== 1 || node.pinned_type !== "null" || parentKey !== void 0 && parentKey === spawnedKey || typeof updated !== "number" || typeof currentSessionId !== "string") {
				special.push(node.session_key);
				continue;
			}
			const archived = archivedAt.get(id);
			const interacted = lastInteractionAt.get(id);
			entries.set(node.session_key, {
				sessionId: currentSessionId,
				updatedAt: updated,
				...archived !== void 0 ? { archivedAt: archived } : {},
				...interacted !== void 0 ? { lastInteractionAt: interacted } : {},
				...spawnedKey !== void 0 ? { spawnedBy: spawnedKey } : {},
				...parentKey !== void 0 ? { parentSessionKey: parentKey } : {}
			});
		}
		const parsed = /* @__PURE__ */ new Map();
		for (let index = 0; index < special.length; index += SESSION_VISIBILITY_SPECIAL_ROW_CHUNK) {
			const chunk = special.slice(index, index + SESSION_VISIBILITY_SPECIAL_ROW_CHUNK);
			for (const row of iterateSqliteQuerySync(db, selectSessionEntryRows(database, "list").select("updated_at").where("session_key", "in", chunk))) {
				const entry = parseSessionEntryJson(row, "list");
				if (entry) parsed.set(row.session_key, entry);
			}
		}
		for (const [sessionKey, entry] of projectSqliteSessionParticipantsBatch(db, parsed)) entries.set(sessionKey, entry);
		return {
			entries,
			keys
		};
	};
	return db.isTransaction ? read() : runSqliteDeferredTransactionSync(db, read);
}
function listSqliteSessionEntriesFromDatabase(database, resolved, scope) {`;

export function patchSessionAccessorEntry(source) {
  assert(!source.includes(SESSIONS_VISIBILITY_COLUMNS_MARKER), 'entry chunk already patched');
  let out = source;
  out = replaceExactlyOnce(out,
    'import { n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";\n',
    'import { a as iterateSqliteQuerySync, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";\n',
    'kysely-sync import');
  out = replaceExactlyOnce(out,
    'function listSqliteSessionEntriesFromDatabase(database, resolved, scope) {',
    VISIBILITY_ENTRIES,
    'listSqliteSessionEntriesFromDatabase');
  out = replaceExactlyOnce(out,
    `\tconst snapshot = readSessionEntryCache(database, {
		cache,
		latest: scope.readConsistency === "latest",
		projection
	});
	return snapshot.keys.flatMap((sessionKey) => {`,
    `\t${SESSIONS_VISIBILITY_COLUMNS_MARKER}: a visibility listing reads promoted columns; incognito databases, databases
	// without the indexes and OPENCLAW_V_SESSIONS_VISIBILITY_COLUMNS=0 keep the list projection.
	const visibilitySnapshot = scope.visibilityColumns === true && projection === "list" && cache && process.env.OPENCLAW_V_SESSIONS_VISIBILITY_COLUMNS !== "0" ? readSqliteSessionVisibilityEntries(database) : void 0;
	const snapshot = visibilitySnapshot ?? readSessionEntryCache(database, {
		cache,
		latest: scope.readConsistency === "latest",
		projection
	});
	return snapshot.keys.flatMap((sessionKey) => {`,
    'list snapshot read');
  return out;
}

export function patchCombinedStoreGateway(source) {
  assert(!source.includes(SESSIONS_VISIBILITY_COLUMNS_MARKER), 'combined store chunk already patched');
  return replaceExactlyOnce(source,
    `function loadGatewayStoreEntries(params) {
	// sessions-search-exact-read: a search reads only the rows it can match (durable stores).
	if (params.match && !params.includeOpenDatabases) return listSessionEntriesMatchingReadOnly({
		agentId: params.agentId,
		clone: false,
		projection: params.projection,
		storePath: params.storePath
	}, params.match);
	return (params.includeOpenDatabases ? listSessionEntriesCore : listSessionEntriesReadOnly)({
		agentId: params.agentId,
		clone: false,
		projection: params.projection,
		storePath: params.storePath
	});
}`,
    `function loadGatewayStoreEntries(params) {
	${SESSIONS_VISIBILITY_COLUMNS_MARKER}: projection "visibility" is the list projection read from promoted columns.
	const projection = params.projection === "visibility" ? "list" : params.projection;
	// sessions-search-exact-read: a search reads only the rows it can match (durable stores).
	if (params.match && !params.includeOpenDatabases) return listSessionEntriesMatchingReadOnly({
		agentId: params.agentId,
		clone: false,
		projection,
		storePath: params.storePath
	}, params.match);
	return (params.includeOpenDatabases ? listSessionEntriesCore : listSessionEntriesReadOnly)({
		agentId: params.agentId,
		clone: false,
		projection,
		...params.projection === "visibility" ? { visibilityColumns: true } : {},
		storePath: params.storePath
	});
}`,
    'loadGatewayStoreEntries');
}

export function patchSessionsRead(source) {
  assert(!source.includes(SESSIONS_VISIBILITY_COLUMNS_MARKER), 'sessions-read chunk already patched');
  let out = source;
  out = replaceExactlyOnce(out,
    `\t\t\tlet loaded = options.loaded;
			if (!loaded) loaded = {
				...measureDiagnosticsTimelineSpanSync("gateway.sessions.list.store_load", () => loadCombinedSessionStoreForGatewayCore(cfg, {
					agentId: p.agentId,
					configuredAgentsOnly,
					projection: "list",`,
    `\t\t\t${SESSIONS_VISIBILITY_COLUMNS_MARKER}: a visibility listing whose filters read only promoted columns, for a caller
			// without a visibility filter (it reads sharing fields), loads column entries instead of every entry JSON.
			const visibilityColumns = p.visibilityRowsOnly === true && lifecycleUpdatedSince === void 0 && !options.excludedKeys?.size && isVisibilityColumnListRequest(p) && !prepareSessionSharing({
				client,
				cfg
			}).entryFilter;
			let loaded = options.loaded;
			if (!loaded) loaded = {
				...measureDiagnosticsTimelineSpanSync("gateway.sessions.list.store_load", () => loadCombinedSessionStoreForGatewayCore(cfg, {
					agentId: p.agentId,
					configuredAgentsOnly,
					projection: visibilityColumns ? "visibility" : "list",`,
    'sessions.list store load');
  out = replaceExactlyOnce(out,
    'const sessionReadHandlers = {',
    `${SESSIONS_VISIBILITY_COLUMNS_MARKER}: sessions.list parameters a visibility listing may carry and still read only promoted columns
// (updatedAt, archivedAt, lastInteractionAt, the key, spawnedBy, parentSessionKey). Any other filter reads entry
// fields the columns do not carry, so the request loads the list projection.
const VISIBILITY_COLUMN_LIST_PARAMS = new Set([
	"agentId",
	"archived",
	"activeMinutes",
	"configuredAgentsOnly",
	"includeDerivedTitles",
	"includeGlobal",
	"includeLastMessage",
	"includeUnknown",
	"limit",
	"offset",
	"sortBy",
	"visibilityRowsOnly"
]);
function isVisibilityColumnListRequest(opts) {
	return Object.entries(opts).every(([name, value]) => value === void 0 || value === false || VISIBILITY_COLUMN_LIST_PARAMS.has(name));
}
const sessionReadHandlers = {`,
    'handler table');
  return out;
}
