import assert from 'node:assert/strict';

// Deleting a session must not load every session's entry_json (V 2026-11-05).
//
// Every rss_growth critical on V (2.2-2.4 GiB within one 30 s heartbeat, 101 in three days) lined up
// with a session deletion, almost all of them the temporary run session an agentTurn cron job removes
// when it finishes (127 of 132 deletions on 11/04). The deletion's preflight fence calls
// collectAdmissionProtectedSessionIds whenever any work admission is in flight (Night Shift keeps some
// open all day). That function selected entry_json, current_session_id and session_key for every row
// of session_nodes and only then kept the rows whose normalized key is admitted. On V's makaron
// database that is 16,336 rows and 1.21 G characters of JSON (skillsSnapshot 734 MB,
// systemPromptReport 446 MB), almost all of it with CJK text, so node:sqlite materializes 2.42 GB of
// two-byte strings: the whole rss_growth step, and ~6 s of the ~9 s each deletion blocks the main
// thread. The full read can run up to three times per deletion (preflight, then once per historical
// generation inside and outside the delete transaction).
//
// session-delete-admission-exact-read-v1 matches admitted keys on the session_key index alone (still
// normalizing in JS, since stored keys may differ from their normalized form), then reads entry_json
// only for the matched rows. The protected set is unchanged.
// Source: openclaw-versa versa/port-session-delete-admission-20261105 (330030030e5, 39242f5b4fc).

export const MARKER = 'session-delete-admission-exact-read-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/session-history-eviction-d5aiCsHS.js
export function patchSessionHistoryEviction(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `/** Session ids owned by in-flight work admissions, without live-reference protection. */
function collectAdmissionProtectedSessionIds(params) {`,
    `const ADMITTED_KEY_QUERY_CHUNK = 500;
/** Session ids owned by in-flight work admissions, without live-reference protection. */
function collectAdmissionProtectedSessionIds(params) {`,
    'collectAdmissionProtectedSessionIds');
  out = replaceExactlyOnce(out,
    `	const db = getSessionKysely(params.database.db);
	const rows = executeSqliteQuerySync(params.database.db, db.selectFrom("session_nodes").select([
		"entry_json",
		"current_session_id",
		"session_key"
	])).rows;
	for (const row of rows) {
		if (!normalizedAdmissionKeys.has(normalizeStoreSessionKey(row.session_key))) continue;
		protectedSessionIds.add(row.current_session_id);`,
    `	const db = getSessionKysely(params.database.db);
	// ${MARKER}: match admitted keys on the key index alone, then read entries for those rows only.
	const admittedStoredKeys = executeSqliteQuerySync(params.database.db, db.selectFrom("session_nodes").select("session_key")).rows.flatMap((row) => normalizedAdmissionKeys.has(normalizeStoreSessionKey(row.session_key)) ? [row.session_key] : []);
	const keyChunks = [];
	for (let start = 0; start < admittedStoredKeys.length; start += ADMITTED_KEY_QUERY_CHUNK) keyChunks.push(admittedStoredKeys.slice(start, start + ADMITTED_KEY_QUERY_CHUNK));
	const rows = keyChunks.flatMap((keys) => executeSqliteQuerySync(params.database.db, db.selectFrom("session_nodes").select([
		"entry_json",
		"current_session_id",
		"session_key"
	]).where("session_key", "in", keys)).rows);
	for (const row of rows) {
		protectedSessionIds.add(row.current_session_id);`,
    'admitted entry read');
  return out;
}

// core/dist/session-accessor.sqlite-lifecycle-dtL0ZEAl.js (upstream 9.1 bytes until now)
// The prepare phase of a deletion read the reference set (a metadata projection of every entry,
// 2.5 s on V's tables) and the admission fence unconditionally, but both only guard transcript-state
// removal. A deletion that keeps transcript state (the cron run cleanup) skips them; the fence is
// also skipped when there is no historical generation to guard.
export function patchSqliteLifecycle(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `		const referencedAfterDelete = readReferencedSessionIdsAfterTargetMutation(database, params.target);
		const deleteTranscriptState = params.archiveTranscript || params.deleteTranscriptWithoutArchive === true;
`,
    `		const deleteTranscriptState = params.archiveTranscript || params.deleteTranscriptWithoutArchive === true;
		// ${MARKER}: both full reads below only guard transcript-state removal.
		const referencedAfterDelete = deleteTranscriptState ? readReferencedSessionIdsAfterTargetMutation(database, params.target) : /* @__PURE__ */ new Set();
`,
    'deletion prepare reference set');
  out = replaceExactlyOnce(out,
    `		const preflightFence = collectAdmissionProtectedSessionIds({
			database,
			storePath: params.storePath
		});
		for (const sessionId of historicalGenerationIds)`,
    `		const preflightFence = historicalGenerationIds.length > 0 ? collectAdmissionProtectedSessionIds({
			database,
			storePath: params.storePath
		}) : /* @__PURE__ */ new Set();
		for (const sessionId of historicalGenerationIds)`,
    'deletion preflight fence');
  return out;
}

export const FILES = [
  { name: 'session-history-eviction-d5aiCsHS.js', base: 'core/dist', target: 'openclaw/dist', before: '0c43970f918117a2b350517ab7af9bffc13065c40df54a1c2f270f1745143101', patch: patchSessionHistoryEviction },
  { name: 'session-accessor.sqlite-lifecycle-dtL0ZEAl.js', base: 'core/dist', target: 'openclaw/dist', before: '1fbfab20a92e3145007017be7df8d6dc5219277eacc60463f71d6e426479e146', patch: patchSqliteLifecycle },
];
