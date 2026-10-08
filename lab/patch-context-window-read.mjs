// context-window-read-v1: read only the model-context window of a session, on V's
// 2026.9.1 db91.6 bytes (core/dist/session-manager-CNTG_BAJ.js).
//
// V 2026-10-08: "session context snapshot read" froze the Gateway main thread for
// 3-11 s at the start of every Codex (vcodex/vds) turn in a 70-160 MB session
// (extensions/codex session-history: SessionManager.openModelContext and
// readSessionContext). withTranscriptContextSnapshot projects navigation facts out
// of every transcript row of the session in SQLite (reading every row's overflow
// pages, base64 images included), rebuilds the whole tree in JS and walks it to the
// leaf, yet the model context only uses the path from the latest compaction/reset
// boundary's first kept entry onward (resolveSessionContextWindow). A VLab session
// with 650 compactions produced 21 context messages from 31,126 path entries.
//
// The fast path reads the same path from OpenClaw's own active-path index
// (session_transcript_active_events, materialized with the same tree semantics):
//   - only when the index is current (needs_rebuild = 0, indexed through the newest
//     row) and the path has a compaction/reset boundary before the read fence;
//   - path rows from min(firstKept, boundary) onward get the same navigation
//     projection and payload reads as before;
//   - the latest thinking_level_change, model_change and assistant message on the
//     path before the window are chained in front of it, so buildSessionContext()
//     reports the same thinkingLevel and model;
//   - the window's last entry must be the leaf the full read would select (fence
//     admission parent, or the index leaf), and the window must start at firstKept
//     or the boundary; otherwise, and on any error, the original full scan runs.
// Consumers that only use buildSessionContext()/context messages (Codex session
// history, Skill Workshop review) see identical output; the detached
// SessionManager no longer carries pre-window history entries (getEntries(),
// getBoundaryCount() reflect the window). OPENCLAW_V_CONTEXT_WINDOW_READ=0 restores
// the full scan.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const SESSION_MANAGER_FILE = "session-manager-CNTG_BAJ.js";
export const SESSION_MANAGER_BEFORE = "8db52c1a8d53e5f69e0bb2fe83c4fb0074b7abf6e2d03a4c832d5536fadc7024";
const MARKER = "context-window-read-v1";
const HEAD = "function withTranscriptContextSnapshot(scope, view, read) {\n\tconst resolved = resolveSqliteTranscriptReadScope(scope);\n\treturn withOpenClawAgentDatabaseReadOnly((database) => runSqliteDeferredTransactionSync(database.db, () => {";

const FAST_PATH = `//#region V ${MARKER}: model-context window from the active-path index
const V_CONTEXT_WINDOW_FALLBACK = Symbol("v-context-window-fallback");
function noteContextWindowFallback(sessionId, reason) {
	if (process.env.OPENCLAW_V_CONTEXT_WINDOW_DEBUG === "1") process.stderr.write(\`[context-window-read] fallback session=\${sessionId} reason=\${reason}\\n\`);
}
function selectActivePathNavigation(database, sessionId, where, order, limit) {
	const db = getSessionKysely(database.db);
	let query = db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select((eb) => [
		"active.active_position",
		"active.event_seq as seq",
		projectModelContextNavigationSql(eb.ref("event.event_json")).as("navigation_json")
	]).where("active.session_id", "=", sessionId);
	query = where(query);
	query = query.orderBy("active.active_position", order);
	if (limit !== void 0) query = query.limit(limit);
	return executeSqliteQuerySync(database.db, query).rows.map((row) => ({
		...JSON.parse(row.navigation_json),
		seq: row.seq,
		activePosition: row.active_position
	}));
}
function readActiveContextWindowEntries(database, resolved, fence) {
	const sessionId = resolved.sessionId;
	const raw = database.db;
	const state = raw.prepare("SELECT indexed_seq, needs_rebuild, leaf_event_id FROM session_transcript_index_state WHERE session_id = ?").get(sessionId);
	const latest = raw.prepare("SELECT max(seq) AS seq FROM transcript_events WHERE session_id = ?").get(sessionId)?.seq;
	if (!state || state.needs_rebuild !== 0 || latest === null || latest === void 0 || state.indexed_seq < latest) return noteContextWindowFallback(sessionId, "index-not-current");
	const fenceSeq = fence ? fence.beforeRawSeq : Number.MAX_SAFE_INTEGER;
	const boundary = raw.prepare(\`SELECT active.active_position AS position, identity.seq AS seq, identity.event_id AS id
		FROM transcript_event_identities AS identity
		JOIN session_transcript_active_events AS active ON active.session_id = identity.session_id AND active.event_seq = identity.seq
		WHERE identity.session_id = ? AND identity.event_type IN ('compaction', 'reset') AND identity.seq < ?
		ORDER BY active.active_position DESC LIMIT 1\`).get(sessionId, fenceSeq);
	if (!boundary) return noteContextWindowFallback(sessionId, "no-boundary");
	const firstKeptId = raw.prepare("SELECT json_extract(event_json, '$.firstKeptEntryId') AS id FROM transcript_events WHERE session_id = ? AND seq = ?").get(sessionId, boundary.seq)?.id;
	let start = boundary.position;
	let startId = boundary.id;
	if (typeof firstKeptId === "string") {
		const kept = raw.prepare(\`SELECT active.active_position AS position FROM transcript_event_identities AS identity
			JOIN session_transcript_active_events AS active ON active.session_id = identity.session_id AND active.event_seq = identity.seq
			WHERE identity.session_id = ? AND identity.event_id = ?\`).get(sessionId, firstKeptId);
		if (kept && kept.position < start) {
			start = kept.position;
			startId = firstKeptId;
		}
	}
	const window = selectActivePathNavigation(database, sessionId, (query) => query.where("active.active_position", ">=", start).where("active.event_seq", "<", fenceSeq), "asc");
	const expectedLeaf = fence ? fence.admission.effectiveParentId : state.leaf_event_id;
	if (window.length === 0 || window[0].id !== startId || window.at(-1).id !== expectedLeaf || !window.some((entry) => entry.id === boundary.id)) return noteContextWindowFallback(sessionId, \`window-mismatch first=\${window[0]?.id === startId} leaf=\${window.at(-1)?.id === expectedLeaf} boundary=\${window.some((entry) => entry.id === boundary.id)}\`);
	// Typed by the identity index, so only the selected rows' payloads are read.
	const latestBefore = (eventType, where = (query) => query) => selectActivePathNavigation(database, sessionId, (query) => where(query.innerJoin("transcript_event_identities as identity", (join) => join.onRef("identity.session_id", "=", "active.session_id").onRef("identity.seq", "=", "active.event_seq")).where("identity.event_type", "=", eventType).where("active.active_position", "<", start)), "desc", 1)[0];
	const prefix = [
		latestBefore("thinking_level_change"),
		latestBefore("model_change"),
		latestBefore("message", (query) => query.where(sql\`json_extract(event.event_json, '$.message.role')\`, "=", "assistant"))
	].filter(Boolean).toSorted((left, right) => left.activePosition - right.activePosition);
	const entries = [...prefix, ...window];
	let parentId = null;
	for (const entry of entries) {
		entry.parentId = parentId;
		parentId = entry.id;
		delete entry.activePosition;
	}
	return entries;
}
function withTranscriptContextSnapshot(scope, view, read) {
	if (process.env.OPENCLAW_V_CONTEXT_WINDOW_READ === "0") return withTranscriptContextSnapshotFullScan(scope, view, read);
	const resolved = resolveSqliteTranscriptReadScope(scope);
	let result;
	let reading = false;
	try {
		result = withOpenClawAgentDatabaseReadOnly((database) => runSqliteDeferredTransactionSync(database.db, () => {
			const db = getSessionKysely(database.db);
			const fence = resolveSqliteSessionTranscriptReadFence({
				database,
				...resolved
			});
			const entries = readActiveContextWindowEntries(database, resolved, fence);
			if (!entries) return V_CONTEXT_WINDOW_FALLBACK;
			const base = db.selectFrom("transcript_events").where("session_id", "=", resolved.sessionId).$if(fence !== void 0, (query) => query.where("seq", "<", fence.beforeRawSeq));
			const header = executeSqliteQueryTakeFirstSync(database.db, base.select("event_json").where(sql\`json_extract(event_json, '$.type')\`, "=", "session").orderBy("seq", "asc").limit(1));
			const readPayload = prepareSqliteQuerySync(database.db, (parameter) => base.select((eb) => view === "model-context" ? projectModelContextEventSql(eb.ref("event_json"), parameter((row) => row.omitCheckpoint)).as("event_json") : eb.ref("event_json").as("event_json")).where("seq", "=", parameter((row) => row.seq)));
			reading = true;
			return read({
				header: header ? JSON.parse(header.event_json) : void 0,
				entries,
				readEntry: (entry, omitCheckpoint = false) => {
					const row = readPayload({
						seq: entry.seq,
						omitCheckpoint: omitCheckpoint ? 1 : 0
					}).rows[0];
					return {
						...JSON.parse(row.event_json),
						parentId: entry.parentId
					};
				}
			});
		}, { operationLabel: "session context window read" }), toDatabaseOptions(resolved), { throwOnMissingTable: true });
	} catch (error) {
		if (reading || error instanceof SessionTranscriptReadFenceError) throw error;
		noteContextWindowFallback(resolved.sessionId, \`error \${String(error?.message ?? error).slice(0, 200)}\`);
		result = { found: true, value: V_CONTEXT_WINDOW_FALLBACK };
	}
	if (result.found && result.value === V_CONTEXT_WINDOW_FALLBACK) return withTranscriptContextSnapshotFullScan(scope, view, read);
	return result;
}
//#endregion
function withTranscriptContextSnapshotFullScan(scope, view, read) {`;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function patchSessionManagerContextWindow(source) {
  assert(!source.includes(MARKER), `${SESSION_MANAGER_FILE} already carries ${MARKER}`);
  assert.equal(sha256(source), SESSION_MANAGER_BEFORE, `${SESSION_MANAGER_FILE} is not V's db91.6 bytes`);
  assert.equal(source.split(HEAD).length, 2, "withTranscriptContextSnapshot anchor is not unique");
  for (const name of ["executeSqliteQuerySync", "executeSqliteQueryTakeFirstSync", "prepareSqliteQuerySync", "projectModelContextNavigationSql",
    "projectModelContextEventSql", "resolveSqliteSessionTranscriptReadFence", "SessionTranscriptReadFenceError", "getSessionKysely", "sql }"]) {
    assert(source.includes(name), `${name} is not in scope of ${SESSION_MANAGER_FILE}`);
  }
  return source.replace("function withTranscriptContextSnapshot(scope, view, read) {", FAST_PATH);
}
