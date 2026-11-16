import assert from 'node:assert/strict';

// sessions_search froze V's Gateway main thread for 27 s (CPU profile 2026-11-16 19:18, see
// lab/release-files/sessions-search-stall/README.md). A sessions_search tool call made inside the
// Gateway runs two visibility listings and then ~110 chunked sessions.search calls (200 session keys
// each), and every sessions.search ran listSessionsNeedingTranscriptIndexReconcile: one probe of the
// newest transcript row per window (26,913 windows, ~22,800 pages of a 42 GB database). An
// in-process Gateway call resolves without returning to the event loop, so all of it was one block.
//
// Port of openclaw-versa versa/port-sessions-search-stall-20261116 (3466c31b26c) onto V's bytes:
// - session-transcript-reconcile: the read-only preflight Worker can skip the orphan scan, and
//   scanTranscriptIndexNeedsReconcile runs only the dirty listing there (exported as `o`).
// - session-transcript-search: the caller checks only the small-table part of the dirty predicate;
//   the watermark lag is checked by that Worker at most once a minute per database, which starts
//   the reconcile when it finds work. OPENCLAW_V_TRANSCRIPT_SEARCH_LAG_OFFTHREAD=0 restores the old
//   listing on the caller.
// - openclaw-tools: sessions_search yields to the event loop before every Gateway call
//   (OPENCLAW_V_SESSIONS_SEARCH_YIELD=0 calls straight through), and lists its candidates in one
//   50,000-row page per scope: every sessions.list page re-reads the whole store, and 10,000-row
//   pages read V's ~22,000 sessions six times per search.

export const SESSIONS_SEARCH_STALL_MARKER = '// sessions-search-stall-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchTranscriptReconcile(source) {
  assert(!source.includes(SESSIONS_SEARCH_STALL_MARKER), 'reconcile chunk already patched');
  let out = source;
  out = replaceExactlyOnce(out,
    '\t\t\tfor (const row of db.prepare("SELECT st.session_id AS session_id FROM session_transcript_index_state st',
    '\t\t\tconst ftsOwners = new Map();\n\t\t\tif (workerData.orphans !== false) {\n\t\t\tfor (const row of db.prepare("SELECT st.session_id AS session_id FROM session_transcript_index_state st',
    'preflight orphan scan start');
  out = replaceExactlyOnce(out,
    '\t\t\tconst ftsOwners = new Map();\n\t\t\tfor (const row of db.prepare("SELECT rowid AS id, session_id FROM session_transcript_fts").iterate()) {',
    '\t\t\tfor (const row of db.prepare("SELECT rowid AS id, session_id FROM session_transcript_fts").iterate()) {',
    'preflight FTS owner map');
  out = replaceExactlyOnce(out,
    '\t\t\tfor (const [sessionId, rowids] of ftsOwners) if (transcriptExists.get(sessionId) === undefined) owner(sessionId).push(...rowids);\n',
    '\t\t\tfor (const [sessionId, rowids] of ftsOwners) if (transcriptExists.get(sessionId) === undefined) owner(sessionId).push(...rowids);\n\t\t\t}\n',
    'preflight orphan scan end');
  out = replaceExactlyOnce(out,
    'function scanTranscriptIndexPreflight(databasePath, needs) {',
    'function scanTranscriptIndexPreflight(databasePath, needs, orphans = true) {',
    'preflight scan signature');
  out = replaceExactlyOnce(out,
    '\t\t\t\t\tneeds,\n\t\t\t\t\tpath: databasePath\n',
    '\t\t\t\t\tneeds,\n\t\t\t\t\torphans,\n\t\t\t\t\tpath: databasePath\n',
    'preflight worker data');
  out = replaceExactlyOnce(out,
    '// transcript-projection-fixed-cost-v1: the preferred session is planned before any whole-database scan\n',
    `${SESSIONS_SEARCH_STALL_MARKER}: listSessionsNeedingTranscriptIndexReconcile on the read-only preflight Worker, without the orphan scan
// (it reads the whole FTS table). Transcript search asks here instead of listing every window on the Gateway thread.
async function scanTranscriptIndexNeedsReconcile(databaseOptions) {
	return (await scanTranscriptIndexPreflight(databaseOptions.path, true, false)).needsReconcile;
}
// transcript-projection-fixed-cost-v1: the preferred session is planned before any whole-database scan
`,
    'reconcile fixed-cost anchor');
  out = replaceExactlyOnce(out,
    'export { waitForSessionTranscriptProjection as a, waitForSessionTranscriptIndexReconcile as i, reconcileSessionTranscriptIndexes as n, startSessionTranscriptIndexReconcile as r, isSessionTranscriptIndexReconcileRunning as t };',
    'export { waitForSessionTranscriptProjection as a, waitForSessionTranscriptIndexReconcile as i, reconcileSessionTranscriptIndexes as n, scanTranscriptIndexNeedsReconcile as o, startSessionTranscriptIndexReconcile as r, isSessionTranscriptIndexReconcileRunning as t };',
    'reconcile exports');
  return out;
}

export function patchTranscriptSearch(source) {
  assert(!source.includes(SESSIONS_SEARCH_STALL_MARKER), 'search chunk already patched');
  let out = source;
  out = replaceExactlyOnce(out,
    'import { r as startSessionTranscriptIndexReconcile, t as isSessionTranscriptIndexReconcileRunning } from "./session-transcript-reconcile-j5qhAafV.js";\n',
    `import { o as scanTranscriptIndexNeedsReconcile, r as startSessionTranscriptIndexReconcile, t as isSessionTranscriptIndexReconcileRunning } from "./session-transcript-reconcile-j5qhAafV.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { r as resolveOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
`,
    'search reconcile import');
  out = replaceExactlyOnce(out,
    'function toFtsQuery(query) {',
    `${SESSIONS_SEARCH_STALL_MARKER}: the caller checks only the small-table part of the dirty predicate
const log = createSubsystemLogger("sessions/transcript-index");
/**
* The part of listSessionsNeedingTranscriptIndexReconcile's predicate that reads only small
* tables: a window with transcript rows whose index state is missing, flagged for rebuild, or
* still has active events of undecided context eligibility. The remaining clause (newest
* transcript row past the indexed watermark) needs one transcript-index probe per window.
*/
const SEARCH_INDEX_DIRTY_SQL = \`
SELECT
  EXISTS (
    SELECT 1 FROM session_transcript_index_state st
    JOIN session_windows w ON w.session_id = st.session_id
    WHERE st.needs_rebuild != 0
      AND EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = st.session_id)
  )
  OR EXISTS (
    SELECT 1 FROM session_windows w
    WHERE NOT EXISTS (
        SELECT 1 FROM session_transcript_index_state st WHERE st.session_id = w.session_id
      )
      AND EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = w.session_id)
  )
  OR EXISTS (
    SELECT 1 FROM session_transcript_active_events pending
    JOIN session_windows w ON w.session_id = pending.session_id
    WHERE pending.context_eligible IS NULL
      AND EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = pending.session_id)
  ) AS dirty\`;
/** How often one database's whole watermark check may run for searches (off the caller's thread). */
const SEARCH_LAG_CHECK_INTERVAL_MS = 6e4;
const searchLagChecks = /* @__PURE__ */ new Map();
/** Watermark lag check on a read-only Worker; starts the reconcile when it finds work. */
function startSearchTranscriptIndexLagCheck(databaseOptions) {
	const databasePath = resolveOpenClawAgentSqlitePath(databaseOptions);
	const previous = searchLagChecks.get(databasePath);
	const now = Date.now();
	if (previous && (previous.running || now - previous.startedAt < SEARCH_LAG_CHECK_INTERVAL_MS)) return;
	const check = {
		startedAt: now,
		running: true
	};
	searchLagChecks.set(databasePath, check);
	scanTranscriptIndexNeedsReconcile({
		...databaseOptions,
		path: databasePath
	}).then((needsReconcile) => {
		if (needsReconcile) startSessionTranscriptIndexReconcile(databaseOptions);
	}).catch((error) => {
		log.warn(\`session transcript search lag check failed agent=\${databaseOptions.agentId} error=\${error instanceof Error ? error.message : String(error)}\`);
	}).finally(() => {
		check.running = false;
	});
}
/**
* Whether the index may be behind for this search, without scanning every window on the
* caller's thread. OPENCLAW_V_TRANSCRIPT_SEARCH_LAG_OFFTHREAD=0 restores the whole listing.
*/
function readSearchIndexing(db, databaseOptions) {
	if (process.env.OPENCLAW_V_TRANSCRIPT_SEARCH_LAG_OFFTHREAD === "0") {
		const dirtySessions = listSessionsNeedingTranscriptIndexReconcile(db);
		if (dirtySessions.length > 0) startSessionTranscriptIndexReconcile(databaseOptions);
		return dirtySessions.length > 0 || isSessionTranscriptIndexReconcileRunning(databaseOptions);
	}
	const row = db.prepare(SEARCH_INDEX_DIRTY_SQL).get();
	const dirty = Number(row?.dirty ?? 0) !== 0;
	const running = isSessionTranscriptIndexReconcileRunning(databaseOptions);
	if (dirty) startSessionTranscriptIndexReconcile(databaseOptions);
	else if (!running) startSearchTranscriptIndexLagCheck(databaseOptions);
	return dirty || running;
}
function toFtsQuery(query) {`,
    'search toFtsQuery anchor');
  out = replaceExactlyOnce(out,
    `\t\tconst dirtySessions = listSessionsNeedingTranscriptIndexReconcile(database.db);
\t\tif (dirtySessions.length > 0) startSessionTranscriptIndexReconcile(databaseOptions);
\t\tconst indexing = dirtySessions.length > 0 || isSessionTranscriptIndexReconcileRunning(databaseOptions);
`,
    '\t\tconst indexing = readSearchIndexing(database.db, databaseOptions);\n',
    'search dirty listing');
  return out;
}

export function patchSessionsSearchTool(source) {
  assert(!source.includes(SESSIONS_SEARCH_STALL_MARKER), 'tools chunk already patched');
  let out = source;
  out = replaceExactlyOnce(out,
    'const SESSIONS_SEARCH_MAX_SESSION_KEYS = 200;\n',
    `const SESSIONS_SEARCH_MAX_SESSION_KEYS = 200;
${SESSIONS_SEARCH_STALL_MARKER}: every sessions.list page re-reads the whole session store; one page covers V's ~22,000 sessions.
const SESSIONS_SEARCH_CANDIDATE_PAGE_ROWS = 5e4;
// A Gateway call from a tool running inside the Gateway resolves without returning to the
// event loop; each sessions_search Gateway call starts on a fresh macrotask. OPENCLAW_V_SESSIONS_SEARCH_YIELD=0 calls straight through.
function yieldBeforeGatewayCall() {
	if (process.env.OPENCLAW_V_SESSIONS_SEARCH_YIELD === "0") return Promise.resolve();
	return new Promise((resolve) => {
		setImmediate(resolve);
	});
}
`,
    'tools max session keys');
  out = replaceExactlyOnce(out,
    'limit: candidateRows ? 1e4 : 200,',
    'limit: candidateRows ? SESSIONS_SEARCH_CANDIDATE_PAGE_ROWS : 200,',
    'tools candidate page size');
  out = replaceExactlyOnce(out,
    'page = await params.gatewayCall({',
    'await yieldBeforeGatewayCall();\n\t\t\t\t\tpage = await params.gatewayCall({',
    'tools candidate listing call');
  out = replaceExactlyOnce(out,
    'const scopedCandidate = chunk.length === 1 ? chunk[0] : void 0;\n',
    'const scopedCandidate = chunk.length === 1 ? chunk[0] : void 0;\n\t\t\t\tawait yieldBeforeGatewayCall();\n',
    'tools search chunk call');
  return out;
}
