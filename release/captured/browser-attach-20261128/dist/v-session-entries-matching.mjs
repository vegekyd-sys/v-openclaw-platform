// sessions-search-exact-read: list only the session rows a search can match.
//
// listSessionEntriesReadOnly (full projection) parses every session_nodes row of the store and never
// caches: makaron on V, 2026-10-24, 9,503 rows / 623 MB of entry JSON, 5-10 s of Gateway main thread
// per call. sessions.resolve by sessionId / label / shortId and the plugin session ownership check
// only keep rows whose sessionId, key or label match, so this reads the matching keys from indexed
// or key-only columns first, then reads those rows exactly as the whole-store read does
// (loadSessionEntrySnapshot + listSqliteSessionEntriesFromDatabase): same columns, same parser,
// same participant projection, internal-session-effects rows skipped, same canonical-key check,
// rows returned in session_key order.
//
// The candidate columns are projected by the session entry writer from the same entry
// (bindSessionNode: current_session_id = entry.sessionId, label = trimmed entry.label), so every
// row the callers keep is a candidate.
//
// workboard-sweep-bounded: match.updatedSince adds the rows whose updated_at column (bindSessionNode:
// entry.updatedAt) is at or after it, and every row the writer has not validated yet
// (entry_valid = 0; -1 rows do not parse and are never listed), for sessions.list activeMinutes.
import { c as resolveSqliteScope, i as getSessionKysely, m as toDatabaseOptions, t as cloneSessionEntry } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { n as executeSqliteQuerySync } from "./kysely-sync-DKYGT267.js";
import { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { E as parseSessionEntryJson, O as selectSessionEntryRows, m as canonicalSessionKeyMigrationRequiredError, p as assertCanonicalSqliteSessionKeysCurrent, projectSqliteSessionParticipantsBatch } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { O as isInternalSessionEffectsKey } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { o as resolveDeliveryProvenCanonicalSessionKey } from "./store-entry-CMuTqREZ.js";

const CHUNK = 400;
const chunks = (values) => {
	const out = [];
	for (let offset = 0; offset < values.length; offset += CHUNK) out.push(values.slice(offset, offset + CHUNK));
	return out;
};
const strings = (values) => [...new Set((values ?? []).filter((value) => typeof value === "string" && value.length > 0))];
// session_key order as SQLite's BINARY collation sorts it (UTF-8 bytes).
const byStoredKey = (a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

/**
* Rows whose current session id is in match.sessionIds, whose key is in match.sessionKeys, whose
* label column is in match.labels, or whose key passes match.keyFilter (one key-only pass).
*/
function listSessionEntriesMatchingReadOnly(scope = {}, match = {}) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const projection = scope.projection ?? "full";
	const sessionIds = strings(match.sessionIds);
	const sessionKeys = strings(match.sessionKeys);
	const labels = strings(match.labels);
	const updatedSince = typeof match.updatedSince === "number" && Number.isFinite(match.updatedSince) ? match.updatedSince : void 0;
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		assertCanonicalSqliteSessionKeysCurrent(database);
		const read = () => {
			const db = getSessionKysely(database.db);
			const candidates = new Set();
			const collect = (query) => {
				for (const row of executeSqliteQuerySync(database.db, query).rows) candidates.add(row.session_key);
			};
			for (const chunk of chunks(sessionIds)) collect(db.selectFrom("session_nodes").select("session_key").where("current_session_id", "in", chunk));
			for (const chunk of chunks(sessionKeys)) collect(db.selectFrom("session_nodes").select("session_key").where("session_key", "in", chunk));
			for (const chunk of chunks(labels)) collect(db.selectFrom("session_nodes").select("session_key").where("label", "in", chunk));
			if (updatedSince !== void 0) {
				collect(db.selectFrom("session_nodes").select("session_key").where("updated_at", ">=", updatedSince));
				collect(db.selectFrom("session_nodes").select("session_key").where("entry_valid", "=", 0));
			}
			if (typeof match.keyFilter === "function") for (const row of executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select("session_key")).rows) {
				if (match.keyFilter(row.session_key)) candidates.add(row.session_key);
			}
			const keys = [...candidates].sort(byStoredKey);
			const parsedEntries = /* @__PURE__ */ new Map();
			for (const chunk of chunks(keys)) for (const row of executeSqliteQuerySync(database.db, selectSessionEntryRows(database, projection).select("updated_at").where("session_key", "in", chunk).orderBy("session_key")).rows) {
				const entry = parseSessionEntryJson(row, projection);
				if (entry) parsedEntries.set(row.session_key, entry);
			}
			const entries = projectSqliteSessionParticipantsBatch(database.db, parsedEntries);
			return keys.flatMap((sessionKey) => {
				if (isInternalSessionEffectsKey(sessionKey)) return [];
				const entry = entries.get(sessionKey);
				if (!entry) return [];
				const deliveryCanonicalKey = resolveDeliveryProvenCanonicalSessionKey(sessionKey, entry);
				if (deliveryCanonicalKey !== sessionKey) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${deliveryCanonicalKey}`);
				return [{
					sessionKey,
					entry: projection === "list" && scope.clone !== false ? cloneSessionEntry(entry) : entry
				}];
			});
		};
		// One SQLite snapshot for the candidate keys, their rows and participants.
		return database.db.isTransaction ? read() : runSqliteDeferredTransactionSync(database.db, read);
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}

export { listSessionEntriesMatchingReadOnly };
