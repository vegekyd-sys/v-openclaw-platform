import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import "./utils-D3A1hGii.js";
import { b as toAgentStoreSessionKey } from "./session-key-CRjxKW0X.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { m as toDatabaseOptions, s as resolveSqliteReadScope } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { o as listSessionsNeedingTranscriptIndexReconcile } from "./session-transcript-index-9itOio9h.js";
import { r as startSessionTranscriptIndexReconcile, t as isSessionTranscriptIndexReconcileRunning } from "./session-transcript-reconcile-j5qhAafV.js";
//#region src/config/sessions/session-transcript-search.ts
const SEARCH_SNIPPET_MAX_CHARS = 500;
const SEARCH_LIMIT_MAX = 25;
const SEARCH_QUERY_MAX_CHARS = 4096;
function toFtsQuery(query) {
	return query.trim().split(/\s+/u).map((token) => `"${token.replaceAll("\"", "\"\"")}"`).join(" AND ");
}
/** Search the per-agent FTS index; kicks off one background reconcile when the index lags. */
function searchSessionTranscripts(params) {
	const query = params.query.trim();
	if (!query) throw new Error("query must not be empty");
	if (query.length > SEARCH_QUERY_MAX_CHARS) throw new Error(`query must not exceed ${SEARCH_QUERY_MAX_CHARS} characters`);
	const scope = resolveSqliteReadScope(params);
	const databaseOptions = toDatabaseOptions(scope);
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const dirtySessions = listSessionsNeedingTranscriptIndexReconcile(database.db);
		if (dirtySessions.length > 0) startSessionTranscriptIndexReconcile(databaseOptions);
		const indexing = dirtySessions.length > 0 || isSessionTranscriptIndexReconcileRunning(databaseOptions);
		const limit = Math.min(Math.max(1, params.limit ?? 10), SEARCH_LIMIT_MAX);
		const sessionFilterValues = params.sessionKeys ?? [toAgentStoreSessionKey({
			agentId: scope.agentId,
			requestKey: "*"
		})];
		const whereSession = params.sessionKeys === void 0 ? " AND (session_windows.session_key GLOB ? OR session_windows.session_key IN ('global', 'unknown'))" : sessionFilterValues.length > 0 ? ` AND session_windows.session_key IN (${sessionFilterValues.map(() => "?").join(", ")})` : "";
		const statement = database.db.prepare(`
    SELECT session_windows.session_key AS session_key, session_transcript_fts.session_id AS session_id,
      message_id, role, timestamp,
      snippet(session_transcript_fts, 0, '', '', ' … ', 48) AS snippet,
      bm25(session_transcript_fts) AS rank
    FROM session_transcript_fts
    JOIN session_windows ON session_windows.session_id = session_transcript_fts.session_id
    WHERE session_transcript_fts MATCH ?${whereSession}
      AND session_transcript_fts.session_id NOT IN (
        SELECT session_id FROM session_transcript_index_state WHERE needs_rebuild != 0
      )
    ORDER BY rank ASC, timestamp DESC, message_id ASC
    LIMIT ?
    `);
		const values = [
			toFtsQuery(query),
			...sessionFilterValues,
			limit + 1
		];
		const hits = statement.all(...values).flatMap((row) => {
			if (typeof row.session_key !== "string" || typeof row.session_id !== "string" || typeof row.message_id !== "string" || row.role !== "user" && row.role !== "assistant" || typeof row.snippet !== "string") return [];
			const timestamp = typeof row.timestamp === "number" ? row.timestamp : Number(row.timestamp);
			const rank = typeof row.rank === "number" ? row.rank : Number(row.rank);
			return [{
				sessionKey: row.session_key,
				sessionId: row.session_id,
				messageId: row.message_id,
				role: row.role,
				timestamp: Number.isFinite(timestamp) ? timestamp : 0,
				snippet: row.snippet.length > SEARCH_SNIPPET_MAX_CHARS ? `${truncateUtf16Safe(row.snippet, SEARCH_SNIPPET_MAX_CHARS)}…` : row.snippet,
				score: Number.isFinite(rank) ? -rank : 0
			}];
		});
		return {
			hits: hits.slice(0, limit),
			indexing,
			truncated: hits.length > limit
		};
	}, databaseOptions, { throwOnMissingTable: true });
	return result.found ? result.value : {
		hits: [],
		indexing: false,
		truncated: false
	};
}
//#endregion
export { searchSessionTranscripts as t };
