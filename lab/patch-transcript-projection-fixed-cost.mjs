import assert from 'node:assert/strict';

// Take the whole-database scans off the window between a dirty append and a readable projection.
//
// Since #411 a branch, rewind or side append is published as a small delta, but every reconcile
// pass still did, in order and under the cross-process reconcile lease:
//   1. a preflight in a fresh eval Worker: read every FTS row (session_id is UNINDEXED, so the
//      whole content table including text), every active row, then list every dirty session;
//   2. a reconcile Worker that lists every dirty session again before it plans the preferred one;
//   3. after the last session, the same preflight again as the orphan sweep;
// and every reader that saw "rebuilding" meanwhile (the turn's projection wait polls) set the
// chain's pending flag, so each event was followed by a second full pass (steps 1 and, when
// work was found, 2–3) that the next event had to wait behind. On V the scans read 150k FTS rows
// and 925k active rows: about 0.6–1 s warm and 15–25 s when the pages were evicted, which is
// where the 6.7 s and 25.8 s reconcile-lease waits on 10/17 come from.
//
// Now, for a pass that has a preferred session (every append and reader request has one):
//   - when that session needs reconcile by the listing's own predicate (one indexed lookup, on
//     the caller's thread), the leading preflight is skipped and the Worker plans that session
//     before it lists the others; any other dirty session follows in the same pass as before;
//   - otherwise the pass runs exactly as before (preflight first);
// a pass started by start…Reconcile no longer sweeps orphans under the reconcile lease; the chain
// sweeps once after its last pass, outside the reconcile chain and lease, under its own
// try-only sidecar lease (another process already sweeping covers it); and a pending flag set
// only by per-session requests leads to another pass only when one of those sessions still needs
// reconcile after the pass. A pass without a preferred session (startup, search) keeps the
// original leading preflight, and reconcileSessionTranscriptIndexes called directly keeps its
// in-lease trailing sweep. Orphan deletion is unchanged: the same read-only scan, the same
// per-chunk re-check that the owner still has no transcript rows.
//
// The reconcile Worker is kept for the next pass of the same database (one idle Worker per
// database per process, unref'd, stopped after 5 min idle or on any error): starting it and
// loading its modules took about 0.55 s per pass, and its first read-only open (the agent-database
// lease row in the state database) about 0.2 s. It still opens, leases and closes the agent
// database per pass, so an idle Worker holds no lease and no snapshot.

export const TRANSCRIPT_PROJECTION_FIXED_COST_MARKER = '// transcript-projection-fixed-cost-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// The listing's predicate (listSessionsNeedingTranscriptIndexReconcile) for one session.
const LISTED_ONE_SQL = 'SELECT 1 AS present FROM session_windows w JOIN transcript_events latest ON latest.session_id = w.session_id AND latest.seq = (SELECT c.seq FROM transcript_events c WHERE c.session_id = w.session_id ORDER BY c.seq DESC LIMIT 1) LEFT JOIN session_transcript_index_state st ON st.session_id = w.session_id WHERE w.session_id = ? AND (coalesce(st.needs_rebuild, 1) != 0 OR latest.seq > coalesce(st.indexed_seq, -1) OR EXISTS (SELECT 1 FROM session_transcript_active_events p WHERE p.session_id = w.session_id AND p.context_eligible IS NULL))';

// ---- session-transcript-reconcile chunk ----

const RECONCILE_HELPERS_ANCHOR = '/** Prepares full trees off-thread, then commits bounded chunks through the runtime writer owner. */';
const RECONCILE_HELPERS = `${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: the preferred session is planned before any whole-database scan
const LISTED_FOR_RECONCILE_SQL = ${JSON.stringify(LISTED_ONE_SQL)};
/** listSessionsNeedingTranscriptIndexReconcile's predicate for one session (indexed lookups only); undefined when it cannot be read. */
function sessionListedForTranscriptIndexReconcile(databaseOptions, sessionId) {
	try {
		return openOpenClawAgentDatabase(databaseOptions).db.prepare(LISTED_FOR_RECONCILE_SQL).get(sessionId) !== void 0;
	} catch (error) {
		log.warn(\`session transcript reconcile could not check session=\${sessionId} agent=\${databaseOptions.agentId} error=\${error instanceof Error ? error.message : String(error)}\`);
		return;
	}
}
const RECONCILE_WORKER_IDLE_MS = 3e5;
const idleReconcileWorkers = /* @__PURE__ */ new Map();
/** Removes only this owner's listeners: removeAllListeners() also drops Node's own hooks that start the port for the next "message" listener. */
function releaseReconcileWorkerListeners(worker) {
	for (const event of [
		"message",
		"error",
		"exit"
	]) worker.removeAllListeners(event);
}
/** Keeps a Worker that finished a pass cleanly for the next pass on the same database. */
function parkReconcileWorker(key, worker) {
	if (idleReconcileWorkers.has(key)) {
		worker.terminate().catch(() => {});
		return;
	}
	const drop = () => {
		const idle = idleReconcileWorkers.get(key);
		if (idle?.worker !== worker) return;
		idleReconcileWorkers.delete(key);
		clearTimeout(idle.timer);
	};
	worker.once("error", drop);
	worker.once("exit", drop);
	// setTimeout in this chunk is node:timers/promises
	const timer = globalThis.setTimeout(() => {
		drop();
		worker.terminate().catch(() => {});
	}, RECONCILE_WORKER_IDLE_MS);
	timer.unref?.();
	worker.unref?.();
	idleReconcileWorkers.set(key, {
		worker,
		timer
	});
}
function takeIdleReconcileWorker(key) {
	const idle = idleReconcileWorkers.get(key);
	if (!idle) return;
	idleReconcileWorkers.delete(key);
	clearTimeout(idle.timer);
	releaseReconcileWorkerListeners(idle.worker);
	idle.worker.ref?.();
	return idle.worker;
}
const runningOrphanSweeps = /* @__PURE__ */ new Map();
/** One orphan sweep after a reconcile chain, outside it and its lease; skipped while another process sweeps. */
function startTranscriptIndexOrphanSweep(params) {
	const key = reconcileKey(params);
	if (runningOrphanSweeps.has(key)) return;
	const databasePath = resolveOpenClawAgentSqlitePath(params);
	const databaseOptions = {
		agentId: params.agentId,
		...params.env ? { env: params.env } : {},
		path: databasePath
	};
	const sweep = yieldToGateway().then(async () => {
		try {
			await withAgentDatabaseProcessLease({
				acquire: tryAcquireExclusiveSqliteCoordinator,
				databasePath,
				maxWaitMs: 0,
				fn: async () => {
					// transcript-projection-fixed-cost-v1: orphan sweep mark
					await runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.orphan-sweep", false);
				},
				onReleaseError: (error) => log.warn(\`session transcript orphan sweep coordinator release failed agent=\${params.agentId} error=\${error instanceof Error ? error.message : String(error)}\`),
				suffix: ".transcript-orphan-sweep-coordinator"
			});
		} catch (error) {
			if (error?.code === "V_AGENT_DB_PROCESS_COORDINATOR_TIMEOUT") return;
			log.warn(\`session transcript orphan sweep failed agent=\${params.agentId} error=\${error instanceof Error ? error.message : String(error)}\`);
		}
	}).finally(() => {
		if (runningOrphanSweeps.get(key) === sweep) runningOrphanSweeps.delete(key);
	});
	runningOrphanSweeps.set(key, sweep);
}
${RECONCILE_HELPERS_ANCHOR}`;

const LEADING_PREFLIGHT_BEFORE = `\tif (!await runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.preflight", true)) return { reconciledSessions: 0 };`;
const LEADING_PREFLIGHT_AFTER = `\t${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: a preferred session that needs work goes first; the scans wait until after it
\tconst preferredFirst = params.preferredSessionId !== void 0 && sessionListedForTranscriptIndexReconcile(databaseOptions, params.preferredSessionId) === true;
\tif (!preferredFirst && !await runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.preflight", true)) return { reconciledSessions: 0 };`;

const WORKER_START_BEFORE = `\tlet worker;
\ttry {
\t\tworker = (params.createWorker ?? ((filename, options) => new Worker(filename, options)))(workerUrl, {
\t\t\tworkerData: input,
\t\t\texecArgv: sourceWorkerExecArgv
\t\t});
\t} catch (error) {
\t\tthrow toStringifiedError(error);
\t}`;
const WORKER_START_AFTER = `\t${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: an idle Worker from an earlier pass takes this one
\tlet worker = takeIdleReconcileWorker(databasePath);
\tif (worker) worker.postMessage({
\t\ttype: "run",
\t\t...params.preferredSessionId ? { preferredSessionId: params.preferredSessionId } : {}
\t});
\telse try {
\t\tworker = (params.createWorker ?? ((filename, options) => new Worker(filename, options)))(workerUrl, {
\t\t\tworkerData: {
\t\t\t\t...input,
\t\t\t\treusable: true
\t\t\t},
\t\t\texecArgv: sourceWorkerExecArgv
\t\t});
\t} catch (error) {
\t\tthrow toStringifiedError(error);
\t}`;
const SETTLE_BEFORE = `\t\tlet reconciledSessions = 0;
\t\tlet settled = false;
\t\tconst settle = (finish) => {
\t\t\tif (settled) return;
\t\t\tsettled = true;
\t\t\tworker.removeAllListeners();
\t\t\tworker.terminate().then(finish, finish);
\t\t};`;
const SETTLE_AFTER = `\t\tlet reconciledSessions = 0;
\t\tlet settled = false;
\t\tconst settle = (finish, park = false) => {
\t\t\tif (settled) return;
\t\t\tsettled = true;
\t\t\tif (park) {
\t\t\t\treleaseReconcileWorkerListeners(worker);
\t\t\t\tparkReconcileWorker(databasePath, worker);
\t\t\t\tfinish();
\t\t\t\treturn;
\t\t\t}
\t\t\tworker.removeAllListeners();
\t\t\tworker.terminate().then(finish, finish);
\t\t};`;
const TRAILING_SWEEP_BEFORE = `\t\t\t\ttry {
\t\t\t\t\tawait runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.orphan-sweep", false);
\t\t\t\t} catch (error) {
\t\t\t\t\tsettle(() => reject(toStringifiedError(error)));
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tsettle(() => resolve({ reconciledSessions }));`;
const TRAILING_SWEEP_AFTER = `\t\t\t\t${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: a reconcile chain sweeps once after its last pass, outside the lease
\t\t\t\tif (params.deferOrphanSweep === true) {
\t\t\t\t\tsettle(() => resolve({ reconciledSessions, orphanSweepOwed: true }), true);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\ttry {
\t\t\t\t\tawait runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.orphan-sweep", false);
\t\t\t\t} catch (error) {
\t\t\t\t\tsettle(() => reject(toStringifiedError(error)));
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tsettle(() => resolve({ reconciledSessions }), true);`;

const START_PENDING_BEFORE = `\tif (running) {
\t\trunning.pending = true;
\t\trunning.preferredSessionId ??= params.preferredSessionId;
\t\treturn;
\t}
\tconst state = {
\t\tpending: false,
\t\t...params.preferredSessionId ? { preferredSessionId: params.preferredSessionId } : {}
\t};`;
const START_PENDING_AFTER = `\tif (running) {
\t\trunning.pending = true;
\t\trunning.preferredSessionId ??= params.preferredSessionId;
\t\t${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: remember who asked; a request for one session is met once that session is current
\t\tif (params.preferredSessionId) running.pendingSessionIds.add(params.preferredSessionId);
\t\telse running.pendingAll = true;
\t\treturn;
\t}
\tconst state = {
\t\tpending: false,
\t\tpendingAll: false,
\t\tpendingSessionIds: /* @__PURE__ */ new Set(),
\t\t...params.preferredSessionId ? { preferredSessionId: params.preferredSessionId } : {}
\t};`;

const LOOP_BEFORE = `\t\tlet reconciledSessions = 0;
\t\twhile (true) {
\t\t\tstate.pending = false;
\t\t\tconst preferredSessionId = state.preferredSessionId;
\t\t\tdelete state.preferredSessionId;
\t\t\tconst result = await reconcileSessionTranscriptIndexes({
\t\t\t\t...params,
\t\t\t\t...preferredSessionId ? { preferredSessionId } : {}
\t\t\t});
\t\t\treconciledSessions += result.reconciledSessions;
\t\t\tif (state.pending) continue;
\t\t\tif (runningReconciles.get(key) === state) runningReconciles.delete(key);
\t\t\treturn { reconciledSessions };
\t\t}`;
const LOOP_AFTER = `\t\tlet reconciledSessions = 0;
\t\tlet orphanSweepOwed = false;
\t\twhile (true) {
\t\t\tstate.pending = false;
\t\t\tstate.pendingAll = false;
\t\t\tstate.pendingSessionIds.clear();
\t\t\tconst preferredSessionId = state.preferredSessionId;
\t\t\tdelete state.preferredSessionId;
\t\t\tconst result = await reconcileSessionTranscriptIndexes({
\t\t\t\t...params,
\t\t\t\t...preferredSessionId ? { preferredSessionId } : {},
\t\t\t\tdeferOrphanSweep: true
\t\t\t});
\t\t\treconciledSessions += result.reconciledSessions;
\t\t\tif (result.orphanSweepOwed) orphanSweepOwed = true;
\t\t\t${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: another pass only for work still owed
\t\t\tif (state.pending && !state.pendingAll) {
\t\t\t\tconst databaseOptions = {
\t\t\t\t\tagentId: params.agentId,
\t\t\t\t\t...params.env ? { env: params.env } : {},
\t\t\t\t\tpath: key
\t\t\t\t};
\t\t\t\tconst owed = [...state.pendingSessionIds].find((sessionId) => sessionListedForTranscriptIndexReconcile(databaseOptions, sessionId) !== false);
\t\t\t\tif (owed === void 0) state.pending = false;
\t\t\t\telse state.preferredSessionId = owed;
\t\t\t}
\t\t\tif (state.pending) continue;
\t\t\tif (runningReconciles.get(key) === state) runningReconciles.delete(key);
\t\t\tif (orphanSweepOwed) startTranscriptIndexOrphanSweep(params);
\t\t\treturn { reconciledSessions };
\t\t}`;

const WAIT_BEFORE = `\tawait runningReconciles.get(reconcileKey(params))?.promise;`;
const WAIT_AFTER = `\tawait runningReconciles.get(reconcileKey(params))?.promise;
\tawait runningOrphanSweeps.get(reconcileKey(params));`;

export function patchTranscriptReconcileFixedCost(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_FIXED_COST_MARKER), 'transcript-projection-fixed-cost already applied to the reconcile chunk');
  assert(source.includes('// transcript-projection-incremental-v1'), 'reconcile chunk is not the #411 release');
  let next = replaceExactlyOnce(source, RECONCILE_HELPERS_ANCHOR, RECONCILE_HELPERS, 'reconcile owner doc comment');
  next = replaceExactlyOnce(next, LEADING_PREFLIGHT_BEFORE, LEADING_PREFLIGHT_AFTER, 'leading preflight');
  next = replaceExactlyOnce(next, WORKER_START_BEFORE, WORKER_START_AFTER, 'reconcile worker start');
  next = replaceExactlyOnce(next, SETTLE_BEFORE, SETTLE_AFTER, 'reconcile settle');
  next = replaceExactlyOnce(next, TRAILING_SWEEP_BEFORE, TRAILING_SWEEP_AFTER, 'trailing orphan sweep');
  next = replaceExactlyOnce(next, START_PENDING_BEFORE, START_PENDING_AFTER, 'pending start');
  next = replaceExactlyOnce(next, LOOP_BEFORE, LOOP_AFTER, 'reconcile chain loop');
  next = replaceExactlyOnce(next, WAIT_BEFORE, WAIT_AFTER, 'reconcile wait hook');
  return next;
}

// ---- session-transcript-reconcile.worker ----

const WORKER_LOOP_BEFORE = `\t\tconst sessionIds = orderSessionIds(listSessionsNeedingTranscriptIndexReconcile(database.db), reconcileInput.preferredSessionId);
\t\tfor (const sessionId of sessionIds) {
\t\t\t// transcript-projection-incremental-v1: a projection whose prefix is intact continues from it; anything else rebuilds in full
\t\t\tconst delta = prepareIncrementalSessionTranscriptProjection(database.db, sessionId);
\t\t\tif (delta && await postAndWait({
\t\t\t\ttype: "delta-plan",
\t\t\t\tplan: delta
\t\t\t})) continue;
\t\t\tconst plan = prepareSessionTranscriptProjection(database.db, sessionId);
\t\t\tif (plan) await streamPreparedProjection(plan);
\t\t}`;
const WORKER_LOOP_AFTER = `\t\tconst reconcileSession = async (sessionId) => {
\t\t\t// transcript-projection-incremental-v1: a projection whose prefix is intact continues from it; anything else rebuilds in full
\t\t\tconst delta = prepareIncrementalSessionTranscriptProjection(database.db, sessionId);
\t\t\tif (delta && await postAndWait({
\t\t\t\ttype: "delta-plan",
\t\t\t\tplan: delta
\t\t\t})) return;
\t\t\tconst plan = prepareSessionTranscriptProjection(database.db, sessionId);
\t\t\tif (plan) await streamPreparedProjection(plan);
\t\t};
\t\t${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: the preferred session, when listed, before the whole-database listing
\t\tconst preferredSessionId = currentPreferredSessionId;
\t\tconst preferredFirst = preferredSessionId !== void 0 && database.db.prepare(LISTED_FOR_RECONCILE_SQL).get(preferredSessionId) !== void 0;
\t\tif (preferredFirst) await reconcileSession(preferredSessionId);
\t\tconst sessionIds = preferredFirst ? listSessionsNeedingTranscriptIndexReconcile(database.db).filter((sessionId) => sessionId !== preferredSessionId) : orderSessionIds(listSessionsNeedingTranscriptIndexReconcile(database.db), preferredSessionId);
\t\tfor (const sessionId of sessionIds) await reconcileSession(sessionId);`;
const WORKER_CONST_ANCHOR = 'const ACTIVE_ROWS_PER_CHUNK = 512;';
const WORKER_CONST = `${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: listSessionsNeedingTranscriptIndexReconcile's predicate for one session
const LISTED_FOR_RECONCILE_SQL = ${JSON.stringify(LISTED_ONE_SQL)};
${WORKER_CONST_ANCHOR}`;

const WORKER_INPUT_BEFORE = `\treturn {
\t\tagentId: input.agentId,
\t\tpath: input.path,
\t\t...typeof input.preferredSessionId === "string" ? { preferredSessionId: input.preferredSessionId } : {}
\t};`;
const WORKER_INPUT_AFTER = `\treturn {
\t\tagentId: input.agentId,
\t\tpath: input.path,
\t\t...typeof input.preferredSessionId === "string" ? { preferredSessionId: input.preferredSessionId } : {},
\t\t...input.reusable === true ? { reusable: true } : {}
\t};`;
const WORKER_TAIL_BEFORE = `\ttry {
\t\tif (readOnlyDatabase) readOnlyDatabase.close();
\t\telse closeOpenClawAgentDatabaseByPath(reconcileInput.path);
\t\tport.postMessage(terminalMessage);
\t} finally {
\t\tport.close();
\t}
}
run();`;
const WORKER_TAIL_AFTER = `\tif (readOnlyDatabase) readOnlyDatabase.close();
\telse closeOpenClawAgentDatabaseByPath(reconcileInput.path);
\treturn terminalMessage;
}
${TRANSCRIPT_PROJECTION_FIXED_COST_MARKER}: a reusable Worker serves one pass per "run" command until its owner stops it
let currentPreferredSessionId = reconcileInput.preferredSessionId;
function waitForRun() {
\treturn new Promise((resolve) => {
\t\tport.once("message", (message) => {
\t\t\tresolve(message?.type === "run" && (message.preferredSessionId === void 0 || typeof message.preferredSessionId === "string") ? message : void 0);
\t\t});
\t});
}
async function serve() {
\ttry {
\t\twhile (true) {
\t\t\tconst terminalMessage = await run();
\t\t\tport.postMessage(terminalMessage);
\t\t\tif (reconcileInput.reusable !== true || terminalMessage.type !== "done") return;
\t\t\tconst next = await waitForRun();
\t\t\tif (!next) return;
\t\t\tcurrentPreferredSessionId = next.preferredSessionId;
\t\t}
\t} finally {
\t\tport.close();
\t}
}
serve();`;
export function patchTranscriptReconcileWorkerFixedCost(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_FIXED_COST_MARKER), 'transcript-projection-fixed-cost already applied to the reconcile worker');
  assert(source.includes('// transcript-projection-incremental-v1'), 'reconcile worker is not the #411 release');
  let next = replaceExactlyOnce(source, WORKER_CONST_ANCHOR, WORKER_CONST, 'worker chunk constants');
  next = replaceExactlyOnce(next, WORKER_LOOP_BEFORE, WORKER_LOOP_AFTER, 'worker session loop');
  next = replaceExactlyOnce(next, WORKER_INPUT_BEFORE, WORKER_INPUT_AFTER, 'worker input');
  next = replaceExactlyOnce(next, WORKER_TAIL_BEFORE, WORKER_TAIL_AFTER, 'worker tail');
  return next;
}

export { LISTED_ONE_SQL };
