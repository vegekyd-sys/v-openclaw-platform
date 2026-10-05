// gpt-live-projection-readiness-v1: native-session-wait
import { u as toStringifiedError } from "./error-coercion-CwcmpTBO.js";
import "./path-guards-Cp-mGr3-.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as runtimeProcessEntrypoints } from "./runtime-process-entrypoints-DEjFGor2.js";
import { n as resolveRuntimeWorkerUrl } from "./runtime-worker-url-DJUUt97T.js";
import { r as resolveOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { d as resolveSqliteTranscriptReadScope, m as toDatabaseOptions, p as runExclusiveSqliteSessionWrite } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { d as appendPreparedSessionTranscriptProjectionChunkInTransaction, f as claimPreparedSessionTranscriptProjectionInTransaction, i as deleteOrphanedTranscriptIndexRowsInTransaction, l as sessionTranscriptIndexNeedsReconcile, m as finalizePreparedSessionTranscriptProjectionInTransaction, o as listSessionsNeedingTranscriptIndexReconcile, p as deletePreparedSessionTranscriptProjectionChunkInTransaction } from "./session-transcript-index-9itOio9h.js";
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
/** Prepares full trees off-thread, then commits bounded chunks through the runtime writer owner. */
async function reconcileSessionTranscriptIndexesAsProcessOwner(params) {
	const databasePath = resolveOpenClawAgentSqlitePath(params);
	const databaseOptions = {
		agentId: params.agentId,
		...params.env ? { env: params.env } : {},
		path: databasePath
	};
	if (!await runProjectionWrite(databaseOptions, "sessions.transcript-index.preflight", (database) => {
		deleteOrphanedTranscriptIndexRowsInTransaction(database.db);
		return listSessionsNeedingTranscriptIndexReconcile(database.db).length > 0;
	})) return { reconciledSessions: 0 };
	const workerUrl = resolveRuntimeWorkerUrl(runtimeProcessEntrypoints.sessionTranscriptReconcile);
	const sourceWorkerExecArgv = workerUrl.pathname.endsWith(".ts") ? ["--import", "tsx"] : void 0;
	const input = {
		agentId: params.agentId,
		path: databasePath,
		...params.preferredSessionId ? { preferredSessionId: params.preferredSessionId } : {}
	};
	let worker;
	try {
		worker = (params.createWorker ?? ((filename, options) => new Worker(filename, options)))(workerUrl, {
			workerData: input,
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
		const settle = (finish) => {
			if (settled) return;
			settled = true;
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
				try {
					await runProjectionWrite(databaseOptions, "sessions.transcript-index.orphan-sweep", (database) => deleteOrphanedTranscriptIndexRowsInTransaction(database.db));
				} catch (error) {
					settle(() => reject(toStringifiedError(error)));
					return;
				}
				settle(() => resolve({ reconciledSessions }));
				return;
			}
			try {
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
		return;
	}
	const state = {
		pending: false,
		...params.preferredSessionId ? { preferredSessionId: params.preferredSessionId } : {}
	};
	state.promise = yieldToGateway().then(async () => {
		let reconciledSessions = 0;
		while (true) {
			state.pending = false;
			const preferredSessionId = state.preferredSessionId;
			delete state.preferredSessionId;
			const result = await reconcileSessionTranscriptIndexes({
				...params,
				...preferredSessionId ? { preferredSessionId } : {}
			});
			reconciledSessions += result.reconciledSessions;
			if (state.pending) continue;
			if (runningReconciles.get(key) === state) runningReconciles.delete(key);
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
