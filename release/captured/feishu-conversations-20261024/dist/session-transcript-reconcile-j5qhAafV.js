// gpt-live-projection-readiness-v1: native-session-wait
import { u as toStringifiedError } from "./error-coercion-CwcmpTBO.js";
import "./path-guards-Cp-mGr3-.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as runtimeProcessEntrypoints } from "./runtime-process-entrypoints-DEjFGor2.js";
import { n as resolveRuntimeWorkerUrl } from "./runtime-worker-url-DJUUt97T.js";
import { r as resolveOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { d as resolveSqliteTranscriptReadScope, m as toDatabaseOptions, p as runExclusiveSqliteSessionWrite } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { d as appendPreparedSessionTranscriptProjectionChunkInTransaction, f as claimPreparedSessionTranscriptProjectionInTransaction, i as deleteOrphanedTranscriptIndexRowsInTransaction, l as sessionTranscriptIndexNeedsReconcile, m as finalizePreparedSessionTranscriptProjectionInTransaction, o as listSessionsNeedingTranscriptIndexReconcile, p as deletePreparedSessionTranscriptProjectionChunkInTransaction, y as applyIncrementalSessionTranscriptProjectionInTransaction } from "./session-transcript-index-9itOio9h.js";
import { randomInt } from "node:crypto";
import { Worker } from "node:worker_threads";
import { setTimeout } from "node:timers/promises";
import { o as tryAcquireExclusiveSqliteCoordinator } from "./node-sqlite-CL-d6drd.js";
import { withAgentDatabaseProcessLease } from "./agent-db-process-coordinator.mjs";
//#region src/config/sessions/session-transcript-reconcile.ts
const log = createSubsystemLogger("sessions/transcript-index");
const PROJECTION_WRITE_CHUNK_ROWS = 512;
const PROJECTION_READY_POLL_MS = 10;
const runningReconciles = /* @__PURE__ */ new Map();
function reconcileKey(params) {
	return resolveOpenClawAgentSqlitePath(params);
}
function yieldToGateway() {
	return new Promise((resolve) => {
		setImmediate(resolve);
	});
}
function nextProjectionClaimId() {
	return -randomInt(1, 2 ** 47);
}
function continueProjectionWorker(worker, accepted) {
	worker.postMessage({
		accepted,
		type: "continue"
	}, []);
}
async function runProjectionWrite(databaseOptions, operationLabel, operation) {
	return await runExclusiveSqliteSessionWrite(databaseOptions, async () => runOpenClawAgentWriteTransaction(operation, databaseOptions, { operationLabel }));
}
async function claimPreparedSessionTranscriptProjection(databaseOptions, plan) {
	const claimId = nextProjectionClaimId();
	if (!await runProjectionWrite(databaseOptions, "sessions.transcript-index.claim", (database) => claimPreparedSessionTranscriptProjectionInTransaction(database.db, plan, claimId))) return;
	let deleteResult = {
		hasMore: true,
		owned: true
	};
	while (deleteResult.hasMore && deleteResult.owned) {
		deleteResult = await runProjectionWrite(databaseOptions, "sessions.transcript-index.delete-chunk", (database) => deletePreparedSessionTranscriptProjectionChunkInTransaction(database.db, {
			maxRowsPerTable: PROJECTION_WRITE_CHUNK_ROWS,
			sessionId: plan.sessionId,
			claimId
		}));
		await yieldToGateway();
	}
	if (!deleteResult.owned) return;
	return {
		claimId,
		plan
	};
}
function decodeFtsChunk(chunk) {
	const decoder = new TextDecoder();
	return chunk.rows.map((row) => ({
		messageId: row.messageId,
		role: row.role,
		text: decoder.decode(chunk.textBytes.subarray(row.textByteOffset, row.textByteOffset + row.textByteLength)),
		timestamp: row.timestamp
	}));
}
async function appendPreparedProjectionChunk(databaseOptions, active, rows) {
	const owned = await runProjectionWrite(databaseOptions, "activeRows" in rows ? "sessions.transcript-index.active-chunk" : "sessions.transcript-index.fts-chunk", (database) => appendPreparedSessionTranscriptProjectionChunkInTransaction(database.db, {
		...rows,
		claimId: active.claimId,
		sessionId: active.plan.sessionId
	}));
	await yieldToGateway();
	return owned;
}
async function finalizePreparedProjection(databaseOptions, active) {
	return await runProjectionWrite(databaseOptions, "sessions.transcript-index.finalize", (database) => finalizePreparedSessionTranscriptProjectionInTransaction(database.db, active.plan, active.claimId));
}
// transcript-index-preflight-readonly-v1: orphan and dirty-session reads run on a worker's read-only connection
const ORPHAN_DELETE_CHUNK_ROWS = 512;
const PREFLIGHT_SCAN_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
(async () => {
	const index = await import(workerData.indexUrl);
	const db = new DatabaseSync(workerData.path, { readOnly: true });
	try {
		db.exec("PRAGMA busy_timeout = 30000");
		db.exec("BEGIN");
		try {
			const owners = new Map();
			const owner = (sessionId) => {
				let rowids = owners.get(sessionId);
				if (!rowids) owners.set(sessionId, rowids = []);
				return rowids;
			};
			for (const row of db.prepare("SELECT st.session_id AS session_id FROM session_transcript_index_state st WHERE NOT EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = st.session_id)").iterate()) owner(row.session_id);
			for (const row of db.prepare("SELECT DISTINCT a.session_id AS session_id FROM session_transcript_active_events a WHERE NOT EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = a.session_id)").iterate()) owner(row.session_id);
			const ftsOwners = new Map();
			for (const row of db.prepare("SELECT rowid AS id, session_id FROM session_transcript_fts").iterate()) {
				if (row.session_id === null) continue;
				let rowids = ftsOwners.get(row.session_id);
				if (!rowids) ftsOwners.set(row.session_id, rowids = []);
				rowids.push(row.id);
			}
			const transcriptExists = db.prepare("SELECT 1 AS present FROM transcript_events WHERE session_id = ? LIMIT 1");
			for (const [sessionId, rowids] of ftsOwners) if (transcriptExists.get(sessionId) === undefined) owner(sessionId).push(...rowids);
			const needsReconcile = workerData.needs ? index.o(db).length > 0 : false;
			parentPort.postMessage({
				type: "done",
				orphans: [...owners].map(([sessionId, ftsRowids]) => ({ sessionId, ftsRowids })),
				needsReconcile,
				ftsRows: [...ftsOwners.values()].reduce((sum, rowids) => sum + rowids.length, 0)
			});
		} finally {
			db.exec("ROLLBACK");
		}
	} finally {
		db.close();
	}
})().catch((error) => {
	parentPort.postMessage({ type: "failed", error: String(error && error.stack || error) });
});
`;
function scanTranscriptIndexPreflight(databasePath, needs) {
	return new Promise((resolve, reject) => {
		let worker;
		try {
			worker = new Worker(PREFLIGHT_SCAN_SOURCE, {
				eval: true,
				workerData: {
					indexUrl: new URL("./session-transcript-index-9itOio9h.js", import.meta.url).href,
					needs,
					path: databasePath
				}
			});
		} catch (error) {
			reject(toStringifiedError(error));
			return;
		}
		let settled = false;
		const settle = (finish) => {
			if (settled) return;
			settled = true;
			worker.removeAllListeners();
			worker.terminate().then(finish, finish);
		};
		worker.once("message", (message) => {
			settle(() => message?.type === "done" ? resolve(message) : reject(new Error(message?.error ?? "session transcript index preflight scan sent no result")));
		});
		worker.once("error", (error) => {
			settle(() => reject(toStringifiedError(error)));
		});
		worker.once("exit", (code) => {
			settle(() => reject(/* @__PURE__ */ new Error(`session transcript index preflight scan exited with code ${code}`)));
		});
	});
}
/** Deletes one bounded chunk of a still-orphaned owner's index rows by indexed key. */
function deleteOrphanedTranscriptIndexChunkInTransaction(db, sessionId, ftsRowids, lastFtsChunk) {
	if (db.prepare("SELECT 1 AS present FROM transcript_events WHERE session_id = ? LIMIT 1").get(sessionId) !== void 0) return { deleted: 0, finished: true };
	const active = Number(db.prepare("DELETE FROM session_transcript_active_events WHERE rowid IN (SELECT rowid FROM session_transcript_active_events WHERE session_id = ? LIMIT ?)").run(sessionId, ORPHAN_DELETE_CHUNK_ROWS).changes);
	const deleteFts = db.prepare("DELETE FROM session_transcript_fts WHERE rowid = ? AND session_id = ?");
	let fts = 0;
	for (const rowid of ftsRowids) fts += Number(deleteFts.run(rowid, sessionId).changes);
	const finished = active < ORPHAN_DELETE_CHUNK_ROWS && lastFtsChunk;
	const state = finished ? Number(db.prepare("DELETE FROM session_transcript_index_state WHERE session_id = ?").run(sessionId).changes) : 0;
	return { deleted: active + fts + state, finished };
}
async function deleteOrphanedTranscriptIndexRows(databaseOptions, operationLabel, orphans) {
	let deleted = 0;
	for (const orphan of orphans) {
		let offset = 0;
		while (true) {
			const ftsRowids = orphan.ftsRowids.slice(offset, offset + ORPHAN_DELETE_CHUNK_ROWS);
			offset += ftsRowids.length;
			const chunk = await runProjectionWrite(databaseOptions, operationLabel, (database) => deleteOrphanedTranscriptIndexChunkInTransaction(database.db, orphan.sessionId, ftsRowids, offset >= orphan.ftsRowids.length));
			deleted += chunk.deleted;
			await yieldToGateway();
			if (chunk.finished) break;
		}
	}
	return deleted;
}
/** Same result as the in-transaction orphan sweep plus dirty-session check, without a full scan under the writer. */
async function runTranscriptIndexPreflight(databaseOptions, operationLabel, needs) {
	const startedAt = performance.now();
	let scan;
	try {
		scan = await scanTranscriptIndexPreflight(databaseOptions.path, needs);
	} catch (error) {
		log.warn(`session transcript index preflight scan failed; sweeping inside the write transaction agent=${databaseOptions.agentId} error=${error instanceof Error ? error.message : String(error)}`);
		return await runProjectionWrite(databaseOptions, operationLabel, (database) => {
			deleteOrphanedTranscriptIndexRowsInTransaction(database.db);
			return needs ? listSessionsNeedingTranscriptIndexReconcile(database.db).length > 0 : false;
		});
	}
	const scanMs = Math.round(performance.now() - startedAt);
	if (scan.orphans.length > 0) {
		const deleted = await deleteOrphanedTranscriptIndexRows(databaseOptions, operationLabel, scan.orphans);
		log.info(`session transcript index orphans removed agent=${databaseOptions.agentId} operation=${operationLabel} sessions=${scan.orphans.length} rows=${deleted} scanMs=${scanMs}`);
	} else log.debug(`session transcript index preflight agent=${databaseOptions.agentId} operation=${operationLabel} orphans=0 needsReconcile=${scan.needsReconcile} ftsRows=${scan.ftsRows} scanMs=${scanMs}`);
	return scan.needsReconcile;
}
// transcript-projection-fixed-cost-v1: the preferred session is planned before any whole-database scan
const LISTED_FOR_RECONCILE_SQL = "SELECT 1 AS present FROM session_windows w JOIN transcript_events latest ON latest.session_id = w.session_id AND latest.seq = (SELECT c.seq FROM transcript_events c WHERE c.session_id = w.session_id ORDER BY c.seq DESC LIMIT 1) LEFT JOIN session_transcript_index_state st ON st.session_id = w.session_id WHERE w.session_id = ? AND (coalesce(st.needs_rebuild, 1) != 0 OR latest.seq > coalesce(st.indexed_seq, -1) OR EXISTS (SELECT 1 FROM session_transcript_active_events p WHERE p.session_id = w.session_id AND p.context_eligible IS NULL))";
/** listSessionsNeedingTranscriptIndexReconcile's predicate for one session (indexed lookups only); undefined when it cannot be read. */
function sessionListedForTranscriptIndexReconcile(databaseOptions, sessionId) {
	try {
		return openOpenClawAgentDatabase(databaseOptions).db.prepare(LISTED_FOR_RECONCILE_SQL).get(sessionId) !== void 0;
	} catch (error) {
		log.warn(`session transcript reconcile could not check session=${sessionId} agent=${databaseOptions.agentId} error=${error instanceof Error ? error.message : String(error)}`);
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
				onReleaseError: (error) => log.warn(`session transcript orphan sweep coordinator release failed agent=${params.agentId} error=${error instanceof Error ? error.message : String(error)}`),
				suffix: ".transcript-orphan-sweep-coordinator"
			});
		} catch (error) {
			if (error?.code === "V_AGENT_DB_PROCESS_COORDINATOR_TIMEOUT") return;
			log.warn(`session transcript orphan sweep failed agent=${params.agentId} error=${error instanceof Error ? error.message : String(error)}`);
		}
	}).finally(() => {
		if (runningOrphanSweeps.get(key) === sweep) runningOrphanSweeps.delete(key);
	});
	runningOrphanSweeps.set(key, sweep);
}
/** Prepares full trees off-thread, then commits bounded chunks through the runtime writer owner. */
async function reconcileSessionTranscriptIndexesAsProcessOwner(params) {
	const databasePath = resolveOpenClawAgentSqlitePath(params);
	const databaseOptions = {
		agentId: params.agentId,
		...params.env ? { env: params.env } : {},
		path: databasePath
	};
	// transcript-projection-fixed-cost-v1: a preferred session that needs work goes first; the scans wait until after it
	const preferredFirst = params.preferredSessionId !== void 0 && sessionListedForTranscriptIndexReconcile(databaseOptions, params.preferredSessionId) === true;
	if (!preferredFirst && !await runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.preflight", true)) return { reconciledSessions: 0 };
	const workerUrl = resolveRuntimeWorkerUrl(runtimeProcessEntrypoints.sessionTranscriptReconcile);
	const sourceWorkerExecArgv = workerUrl.pathname.endsWith(".ts") ? ["--import", "tsx"] : void 0;
	const input = {
		agentId: params.agentId,
		path: databasePath,
		...params.preferredSessionId ? { preferredSessionId: params.preferredSessionId } : {}
	};
	// transcript-projection-fixed-cost-v1: an idle Worker from an earlier pass takes this one
	let worker = takeIdleReconcileWorker(databasePath);
	if (worker) worker.postMessage({
		type: "run",
		...params.preferredSessionId ? { preferredSessionId: params.preferredSessionId } : {}
	});
	else try {
		worker = (params.createWorker ?? ((filename, options) => new Worker(filename, options)))(workerUrl, {
			workerData: {
				...input,
				reusable: true
			},
			execArgv: sourceWorkerExecArgv
		});
	} catch (error) {
		throw toStringifiedError(error);
	}
	return new Promise((resolve, reject) => {
		let active;
		let doneReceived = false;
		let reconciledSessions = 0;
		let settled = false;
		const settle = (finish, park = false) => {
			if (settled) return;
			settled = true;
			if (park) {
				releaseReconcileWorkerListeners(worker);
				parkReconcileWorker(databasePath, worker);
				finish();
				return;
			}
			worker.removeAllListeners();
			worker.terminate().then(finish, finish);
		};
		const handleMessage = async (message) => {
			if (message.type === "failed") {
				settle(() => reject(new Error(message.error)));
				return;
			}
			if (message.type === "done") {
				doneReceived = true;
				if (active) {
					settle(() => reject(/* @__PURE__ */ new Error("session transcript reconcile worker ended mid-plan")));
					return;
				}
				// transcript-projection-fixed-cost-v1: a reconcile chain sweeps once after its last pass, outside the lease
				if (params.deferOrphanSweep === true) {
					settle(() => resolve({ reconciledSessions, orphanSweepOwed: true }), true);
					return;
				}
				try {
					await runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.orphan-sweep", false);
				} catch (error) {
					settle(() => reject(toStringifiedError(error)));
					return;
				}
				settle(() => resolve({ reconciledSessions }), true);
				return;
			}
			try {
				// transcript-projection-incremental-v1: a delta is small; it is published in one writer transaction or refused
				if (message.type === "delta-plan") {
					if (active) throw new Error("session transcript reconcile worker sent a delta during a plan");
					const applied = await runProjectionWrite(databaseOptions, "sessions.transcript-index.delta", (database) => applyIncrementalSessionTranscriptProjectionInTransaction(database.db, message.plan));
					if (applied) reconciledSessions += 1;
					continueProjectionWorker(worker, applied);
					return;
				}
				if (message.type === "plan-start") {
					if (active) throw new Error("session transcript reconcile worker started overlapping plans");
					active = await claimPreparedSessionTranscriptProjection(databaseOptions, message.plan);
					continueProjectionWorker(worker, active !== void 0);
					return;
				}
				if (!active || active.plan.sessionId !== message.sessionId) throw new Error("session transcript reconcile worker sent a chunk for no active plan");
				if (message.type === "plan-finish") {
					const finalized = await finalizePreparedProjection(databaseOptions, active);
					active = void 0;
					if (finalized) reconciledSessions += 1;
					continueProjectionWorker(worker, finalized);
					return;
				}
				const owned = await appendPreparedProjectionChunk(databaseOptions, active, message.type === "active-chunk" ? { activeRows: message.rows } : { ftsRows: decodeFtsChunk(message.chunk) });
				if (!owned) active = void 0;
				continueProjectionWorker(worker, owned);
			} catch (error) {
				settle(() => reject(toStringifiedError(error)));
			}
		};
		worker.on("message", (message) => {
			handleMessage(message);
		});
		worker.once("error", (error) => {
			settle(() => reject(toStringifiedError(error)));
		});
		worker.once("exit", (code) => {
			if (doneReceived && code === 0) return;
			settle(() => reject(/* @__PURE__ */ new Error(`session transcript reconcile worker exited with code ${code}`)));
		});
	});
}
/** Coalesces reconcile ownership across Gateway and all worker processes. */
async function reconcileSessionTranscriptIndexes(params) {
	const databasePath = resolveOpenClawAgentSqlitePath(params);
	let wait;
	return await withAgentDatabaseProcessLease({
		acquire: tryAcquireExclusiveSqliteCoordinator,
		databasePath,
		fn: async () => {
			if (wait?.waitMs >= 1e3) log.warn(`session transcript reconcile waited for process owner agent=${params.agentId} waitMs=${wait.waitMs} attempts=${wait.attempts}`);
			return await reconcileSessionTranscriptIndexesAsProcessOwner(params);
		},
		onAcquired: (value) => { wait = value; },
		onReleaseError: (error) => log.warn(`session transcript reconcile coordinator release failed agent=${params.agentId} error=${error instanceof Error ? error.message : String(error)}`),
		suffix: ".transcript-reconcile-coordinator"
	});
}
/** Starts one deferred reconcile. No transcript rows are read on the caller's stack. */
function startSessionTranscriptIndexReconcile(params) {
	const key = reconcileKey(params);
	const running = runningReconciles.get(key);
	if (running) {
		running.pending = true;
		running.preferredSessionId ??= params.preferredSessionId;
		// transcript-projection-fixed-cost-v1: remember who asked; a request for one session is met once that session is current
		if (params.preferredSessionId) running.pendingSessionIds.add(params.preferredSessionId);
		else running.pendingAll = true;
		return;
	}
	const state = {
		pending: false,
		pendingAll: false,
		pendingSessionIds: /* @__PURE__ */ new Set(),
		...params.preferredSessionId ? { preferredSessionId: params.preferredSessionId } : {}
	};
	state.promise = yieldToGateway().then(async () => {
		let reconciledSessions = 0;
		let orphanSweepOwed = false;
		while (true) {
			state.pending = false;
			state.pendingAll = false;
			state.pendingSessionIds.clear();
			const preferredSessionId = state.preferredSessionId;
			delete state.preferredSessionId;
			const result = await reconcileSessionTranscriptIndexes({
				...params,
				...preferredSessionId ? { preferredSessionId } : {},
				deferOrphanSweep: true
			});
			reconciledSessions += result.reconciledSessions;
			if (result.orphanSweepOwed) orphanSweepOwed = true;
			// transcript-projection-fixed-cost-v1: another pass only for work still owed
			if (state.pending && !state.pendingAll) {
				const databaseOptions = {
					agentId: params.agentId,
					...params.env ? { env: params.env } : {},
					path: key
				};
				const owed = [...state.pendingSessionIds].find((sessionId) => sessionListedForTranscriptIndexReconcile(databaseOptions, sessionId) !== false);
				if (owed === void 0) state.pending = false;
				else state.preferredSessionId = owed;
			}
			if (state.pending) continue;
			if (runningReconciles.get(key) === state) runningReconciles.delete(key);
			if (orphanSweepOwed) startTranscriptIndexOrphanSweep(params);
			return { reconciledSessions };
		}
	}).catch(async (error) => {
		log.warn(`session transcript reconcile failed agent=${params.agentId} error=${error instanceof Error ? error.message : String(error)}`);
		const shouldHandoff = state.pending;
		const preferredSessionId = state.preferredSessionId;
		if (runningReconciles.get(key) === state) runningReconciles.delete(key);
		if (shouldHandoff) {
			startSessionTranscriptIndexReconcile({
				...params,
				...preferredSessionId ? { preferredSessionId } : {}
			});
			await waitForSessionTranscriptIndexReconcile(params);
		}
		return { reconciledSessions: 0 };
	});
	runningReconciles.set(key, state);
}
function isSessionTranscriptIndexReconcileRunning(params) {
	return runningReconciles.has(reconcileKey(params));
}
/** Test and maintenance wait hook for an already-scheduled reconcile. */
async function waitForSessionTranscriptIndexReconcile(params) {
	await runningReconciles.get(reconcileKey(params))?.promise;
	await runningOrphanSweeps.get(reconcileKey(params));
}
/** Reads only a current native projection; never replays a prompt or a tool. */
async function waitForSessionTranscriptProjection(scope, abortSignal, options = {}) {
	const assertWaitActive = () => {
		abortSignal?.throwIfAborted();
		if (options.assertActive?.() === false) throw new Error("Session projection wait owner is no longer active");
	};
	assertWaitActive();
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const databaseOptions = toDatabaseOptions(resolved);
	// The accessor imports this reconciler. Resolve its existing hard guard only
	// after module initialization, preserving the native transaction and generation checks.
	const { C: withCurrentProjectionSnapshot, T: isSessionTranscriptProjectionUnavailableError } = await import("./session-accessor-K0XuW6ln.js");
	assertWaitActive();
	const startedAt = performance.now();
	const timeoutMs = 15e3;
	let lastRebuildingError;
	let polls = 0;
	while (true) {
		assertWaitActive();
		// The process-local reconcile Map cannot prove readiness in another Worker.
		const needsReconcile = sessionTranscriptIndexNeedsReconcile(openOpenClawAgentDatabase(databaseOptions).db, resolved.sessionId);
		if (!lastRebuildingError || !needsReconcile) {
			try {
				const proof = withCurrentProjectionSnapshot(resolved, ({ state }) => ({ sessionId: resolved.sessionId, indexedSeq: state.indexedSeq }));
				assertWaitActive();
				const waitMs = performance.now() - startedAt;
				if (polls > 0) log.debug(`session transcript projection ready session=${resolved.sessionId} indexedSeq=${proof.indexedSeq} waitMs=${waitMs} polls=${polls}`);
				return { ...proof, waitMs, polls };
			} catch (error) {
				if (!isSessionTranscriptProjectionUnavailableError(error) || error.sessionId !== resolved.sessionId) throw error;
				lastRebuildingError = error;
			}
		}
		assertWaitActive();
		const elapsedMs = performance.now() - startedAt;
		if (elapsedMs >= timeoutMs) {
			// Keep the real structured rebuilding error. A caller must not retry a run.
			lastRebuildingError.projectionWait = { phase: "before-model", sessionId: resolved.sessionId, timeoutMs, elapsedMs, polls };
			throw lastRebuildingError;
		}
		await setTimeout(Math.min(PROJECTION_READY_POLL_MS, timeoutMs - elapsedMs), void 0, abortSignal ? { signal: abortSignal } : void 0);
		polls += 1;
	}
}
//#endregion
export { waitForSessionTranscriptProjection as a, waitForSessionTranscriptIndexReconcile as i, reconcileSessionTranscriptIndexes as n, startSessionTranscriptIndexReconcile as r, isSessionTranscriptIndexReconcileRunning as t };
