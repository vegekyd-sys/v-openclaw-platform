// subagent-settle-backlog-v1
import { s as asFiniteNumber } from "./number-coercion-CLj0HTDM.js";
import "./src-vebZIeLe.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { t as safeParseJson } from "./json-coercion-ighRFv8Y.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync } from "./kysely-sync-DKYGT267.js";
import { $ as normalizeAgentRunTerminalReplySnapshot, i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction } from "./openclaw-state-db-Bh3Bq87y.js";
import { c as normalizeDeliveryContext } from "./delivery-context.shared-DlcU69m_.js";
import { isDeepStrictEqual } from "node:util";
import { sql } from "kysely";
//#region src/agents/subagents/registry/subagent-registry-memory.ts
/**
* Process-local live subagent run map.
*
* Shared by registry read/write helpers for active in-memory run state.
*/
const collectorRunIdByChildSessionKey = /* @__PURE__ */ new Map();
const runsByChildSessionKey = /* @__PURE__ */ new Map();
const runsByCollectorGroupKey = /* @__PURE__ */ new Map();
function collectorGroupKey(entry) {
	if (entry.collect !== true || !entry.groupId) return;
	return JSON.stringify([entry.swarmRequesterSessionKey ?? entry.requesterSessionKey, entry.groupId]);
}
function removeIndexedSubagentRun(index, key, runId, entry) {
	if (!key) return;
	const indexedRuns = index.get(key);
	if (indexedRuns?.get(runId) !== entry) return;
	indexedRuns.delete(runId);
	if (indexedRuns.size === 0) index.delete(key);
}
function indexSubagentRun(index, key, runId, entry) {
	if (!key) return;
	const indexedRuns = index.get(key);
	if (indexedRuns) indexedRuns.set(runId, entry);
	else index.set(key, /* @__PURE__ */ new Map([[runId, entry]]));
}
var SubagentRunMap = class extends Map {
	constructor(..._args) {
		super(..._args);
		this.retirementScopes = /* @__PURE__ */ new Set();
	}
	/** A cancellation borrows retirement evidence only for its own lexical lifetime. */
	captureRetirement(entry, isSuccessor) {
		const scope = {
			observation: {
				entry,
				generation: entry.generation,
				createdAt: entry.createdAt,
				state: "selected"
			},
			isSuccessor
		};
		this.retirementScopes.add(scope);
		return {
			get observation() {
				return scope.observation;
			},
			release: () => {
				scope.observation = { state: "superseded" };
				this.retirementScopes.delete(scope);
			}
		};
	}
	/** Publish only accepted ownership, after synchronous registration/recovery rollback decisions. */
	commitOwnership(entry) {
		if (this.get(entry.runId) !== entry) return;
		for (const scope of this.retirementScopes) {
			const previous = scope.observation.entry;
			if (previous && previous !== entry && previous.childSessionKey === entry.childSessionKey && scope.isSuccessor(entry)) {
				const receipt = previous.execution.restartRecovery;
				scope.observation = receipt?.phase === "accepted" && receipt.idempotencyKey === entry.runId && entry.execution.restartRecovery === receipt ? {
					entry,
					generation: entry.generation,
					createdAt: entry.createdAt,
					state: "selected"
				} : { state: "superseded" };
			}
		}
	}
	/** Normal cleanup calls this only after its deletion commits; raw map deletion is not evidence. */
	confirmRetirement(entry) {
		for (const scope of this.retirementScopes) {
			const observed = scope.observation;
			if (observed.entry === entry && observed.state === "selected" && this.get(entry.runId) !== entry) observed.state = "retired";
		}
	}
	set(runId, entry) {
		const prev = this.get(runId);
		if (prev) {
			removeIndexedSubagentRun(runsByChildSessionKey, prev.childSessionKey, runId, prev);
			removeIndexedSubagentRun(runsByCollectorGroupKey, collectorGroupKey(prev), runId, prev);
			if (prev.collect === true && prev.childSessionKey) collectorRunIdByChildSessionKey.delete(prev.childSessionKey);
		}
		super.set(runId, entry);
		indexSubagentRun(runsByChildSessionKey, entry.childSessionKey, runId, entry);
		indexSubagentRun(runsByCollectorGroupKey, collectorGroupKey(entry), runId, entry);
		if (entry.collect === true && entry.childSessionKey) collectorRunIdByChildSessionKey.set(entry.childSessionKey, runId);
		return this;
	}
	delete(runId) {
		const prev = this.get(runId);
		if (prev) {
			removeIndexedSubagentRun(runsByChildSessionKey, prev.childSessionKey, runId, prev);
			removeIndexedSubagentRun(runsByCollectorGroupKey, collectorGroupKey(prev), runId, prev);
		}
		if (prev?.collect === true && prev.childSessionKey && collectorRunIdByChildSessionKey.get(prev.childSessionKey) === runId) collectorRunIdByChildSessionKey.delete(prev.childSessionKey);
		return super.delete(runId);
	}
	clear() {
		for (const scope of this.retirementScopes) scope.observation = { state: "superseded" };
		this.retirementScopes.clear();
		super.clear();
		collectorRunIdByChildSessionKey.clear();
		runsByChildSessionKey.clear();
		runsByCollectorGroupKey.clear();
	}
};
const subagentRuns = new SubagentRunMap();
/** Iterate live generations for one child session without scanning the registry. */
function getSubagentRunsForChildSession(childSessionKey) {
	return runsByChildSessionKey.get(childSessionKey)?.values() ?? [];
}
/** Iterate live collector members for one requester/group archive decision. */
function getSubagentRunsForCollectorGroup(requesterSessionKey, groupId) {
	const key = JSON.stringify([requesterSessionKey, groupId]);
	return runsByCollectorGroupKey.get(key)?.entries() ?? [];
}
/** Resolve a collector tombstone that reserves its child session from ordinary turns. */
function findSwarmCollectorSession(childSessionKey) {
	const key = childSessionKey?.trim();
	if (!key) return;
	const runId = collectorRunIdByChildSessionKey.get(key);
	return runId ? subagentRuns.get(runId) : void 0;
}
/** Resolve the host-registered collector that authorizes a Gateway request. */
function findAuthorizedSwarmCollectorRequest(params) {
	const idempotencyKey = params.idempotencyKey?.trim();
	if (!idempotencyKey) return;
	const entry = findSwarmCollectorSession(params.childSessionKey);
	if (!entry) return;
	return entry.swarmLaunchIdempotencyKey === idempotencyKey && isDeepStrictEqual(entry.outputSchema, params.outputSchema) ? entry : void 0;
}
//#endregion
//#region src/agents/subagents/registry/subagent-delivery-state.ts
function normalizeSubagentRunState(entry) {
	entry.taskRunId = (typeof entry.taskRunId === "string" ? entry.taskRunId.trim() : "") || void 0;
	const requesterTurnRunId = typeof entry.requesterTurnRunId === "string" ? entry.requesterTurnRunId.trim() : "";
	entry.requesterTurnRunId = requesterTurnRunId || void 0;
	entry.requesterTurnYielded = requesterTurnRunId && entry.requesterTurnYielded === true ? true : void 0;
	entry.retireAfterRequesterTurn = requesterTurnRunId && entry.retireAfterRequesterTurn === true ? true : void 0;
	entry.generation = typeof entry.generation === "number" && Number.isSafeInteger(entry.generation) && entry.generation > 0 ? entry.generation : void 0;
	entry.deleteCleanupDispatchedAt = Number.isFinite(entry.deleteCleanupDispatchedAt) ? entry.deleteCleanupDispatchedAt : void 0;
	entry.suppressCompletionDelivery = entry.suppressCompletionDelivery === true ? true : void 0;
	entry.terminalOwner = entry.terminalOwner === "interrupted-recovery" && Number.isFinite(entry.execution.endedAt) && entry.execution.outcome?.status === "error" && entry.endedReason === "subagent-error" && entry.pauseReason !== "sessions_yield" ? "interrupted-recovery" : void 0;
	if (entry.completion) entry.completion.terminalReply = normalizeAgentRunTerminalReplySnapshot(entry.completion.terminalReply);
	const killReconciliation = entry.killReconciliation;
	if (!killReconciliation || typeof killReconciliation !== "object" || !Number.isFinite(killReconciliation.killedAt)) delete entry.killReconciliation;
	else entry.killReconciliation = {
		killedAt: killReconciliation.killedAt,
		suppressTaskDelivery: killReconciliation.suppressTaskDelivery === true ? true : void 0,
		supersededAt: Number.isFinite(killReconciliation.supersededAt) ? killReconciliation.supersededAt : void 0
	};
	const killIntent = entry.killIntent;
	if (!killIntent || typeof killIntent !== "object" || !Number.isFinite(killIntent.requestedAt) || typeof killIntent.reason !== "string" || !killIntent.reason.trim()) delete entry.killIntent;
	else entry.killIntent = {
		requestedAt: killIntent.requestedAt,
		reason: killIntent.reason.trim(),
		lifecycleGeneration: typeof killIntent.lifecycleGeneration === "string" && killIntent.lifecycleGeneration.trim() ? killIntent.lifecycleGeneration.trim() : void 0,
		sessionId: typeof killIntent.sessionId === "string" && killIntent.sessionId.trim() ? killIntent.sessionId.trim() : void 0,
		sessionLifecycleRevision: typeof killIntent.sessionLifecycleRevision === "string" && killIntent.sessionLifecycleRevision.trim() ? killIntent.sessionLifecycleRevision.trim() : void 0,
		suppressTaskDelivery: killIntent.suppressTaskDelivery === true ? true : void 0
	};
	if (entry.cleanupHandled === true && typeof entry.cleanupCompletedAt !== "number" && entry.delivery?.status !== "discarded") entry.cleanupHandled = false;
	return entry;
}
/** Ensures a run has a nested completion state object. */
function ensureCompletionState(entry) {
	entry.completion ??= { required: entry.expectsCompletionMessage === true };
	return entry.completion;
}
/** Ensures a run has a nested delivery state object. */
function ensureDeliveryState(entry) {
	entry.delivery ??= { status: entry.expectsCompletionMessage === false ? "not_required" : "pending" };
	return entry.delivery;
}
/** Resets delivery state to its initial status for the run's completion requirement. */
function clearDeliveryState(entry) {
	entry.delivery = { status: entry.expectsCompletionMessage === false ? "not_required" : "pending" };
}
/** Returns true when delivery is suspended with a durable timestamp. */
function isDeliverySuspended(entry) {
	return entry.delivery?.status === "suspended" && typeof entry.delivery.suspendedAt === "number";
}
/** Returns true when required delivery still owns the row after its child session is gone. */
function hasRetainedRequiredCompletionDelivery(entry) {
	const delivery = entry.delivery;
	if (entry.expectsCompletionMessage !== true || entry.suppressCompletionDelivery === true || entry.completion?.required !== true || !delivery?.payload) return false;
	if (isDeliverySuspended(entry)) return true;
	if (delivery.status === "in_progress") return true;
	return delivery.status === "pending" && delivery.disposition !== "ambiguous" && delivery.disposition !== "intentional_non_delivery" && delivery.disposition !== "permanent_failure";
}
/** Reads the current delivery attempt count. */
function getDeliveryAttemptCount(entry) {
	return entry.delivery?.attemptCount ?? 0;
}
/** Reads the non-empty last delivery error. */
function getDeliveryLastError(entry) {
	const error = entry.delivery?.lastError;
	return typeof error === "string" && error.trim() ? error : void 0;
}
//#endregion
//#region src/agents/subagents/registry/subagent-run-generation.ts
function normalizeGeneration(entry) {
	return typeof entry.generation === "number" && Number.isFinite(entry.generation) ? entry.generation : 0;
}
/** Orders runs that share a child session, including legacy rows without a generation. */
function compareSubagentRunGeneration(left, right) {
	const generationDelta = normalizeGeneration(left) - normalizeGeneration(right);
	if (generationDelta !== 0) return generationDelta;
	const createdAtDelta = left.createdAt - right.createdAt;
	if (createdAtDelta !== 0) return createdAtDelta;
	return left.runId.localeCompare(right.runId);
}
/** Allocates a durable monotonic generation within one child session. */
function nextSubagentRunGeneration(runs, childSessionKey) {
	let generation = 0;
	for (const entry of runs) if (entry.childSessionKey === childSessionKey) generation = Math.max(generation, normalizeGeneration(entry));
	return generation + 1;
}
//#endregion
//#region src/agents/subagents/registry/subagent-registry.store.sqlite.ts
/**
* Persists subagent run records in the shared sqlite state database, with
* query-bearing identity columns indexing canonical normalized payload JSON.
*/
const EXECUTION_STATUSES = new Set("queued running interrupted terminal".split(" "));
const DELIVERY_STATUSES = new Set("not_required pending in_progress delivered failed suspended discarded".split(" "));
function hasStateStatus(value, statuses) {
	return isRecord(value) && typeof value.status === "string" && statuses.has(value.status);
}
function isCanonicalSubagentRunRecord(value) {
	return isRecord(value) && hasStateStatus(value.execution, EXECUTION_STATUSES) && isRecord(value.completion) && typeof value.completion.required === "boolean" && hasStateStatus(value.delivery, DELIVERY_STATUSES) && !("handoffLeaseId" in value.delivery || "handoffLeasedAt" in value.delivery || "handoffInjectedAt" in value.delivery);
}
function parseJson(raw) {
	return raw ? safeParseJson(raw) : void 0;
}
/** Rehydrates one sqlite row into the normalized subagent run record shape. */
function rowToSubagentRunRecord(row) {
	const payload = parseJson(row.payload_json);
	if (!isCanonicalSubagentRunRecord(payload)) return null;
	payload.runId = row.run_id;
	payload.childSessionKey = row.child_session_key;
	payload.requesterSessionKey = row.requester_session_key;
	const controllerSessionKey = row.controller_session_key?.trim();
	if (controllerSessionKey) payload.controllerSessionKey = controllerSessionKey;
	else delete payload.controllerSessionKey;
	if (payload.requesterOrigin) payload.requesterOrigin = normalizeDeliveryContext(payload.requesterOrigin);
	if (payload.expectsCompletionMessage === false) payload.delivery.status = "not_required";
	const record = normalizeSubagentRunState(payload);
	return record.runId && record.childSessionKey && record.requesterSessionKey ? record : null;
}
/** Canonically serializes a run before an outer transaction acquires the write lock. */
function bindSubagentRunRecord(entry) {
	const normalized = normalizeSubagentRunState(structuredClone(entry));
	if (!isCanonicalSubagentRunRecord(normalized)) throw new Error("subagent run is missing canonical nested state");
	return {
		run_id: normalized.runId,
		child_session_key: normalized.childSessionKey,
		controller_session_key: normalized.controllerSessionKey?.trim() || null,
		requester_session_key: normalized.requesterSessionKey,
		created_at: normalized.createdAt,
		payload_json: JSON.stringify(normalized)
	};
}
/** Upserts a prebound run on the exact supplied shared-state handle. */
function upsertSubagentRunRowInDatabase(database, row) {
	const stateDb = getNodeSqliteKysely(database.db);
	executeSqliteQuerySync(database.db, stateDb.insertInto("subagent_runs").values(row).onConflict((conflict) => conflict.column("run_id").doUpdateSet(subagentRunRecordToSqliteUpdate(row))));
}
function readSubagentRun(database, runId) {
	const row = executeSqliteQuerySync(database.db, getNodeSqliteKysely(database.db).selectFrom("subagent_runs").selectAll().where("run_id", "=", runId)).rows[0];
	return row ? rowToSubagentRunRecord(row) : null;
}
function subagentRunRecordToSqliteUpdate(values) {
	const { run_id: _runId, ...update } = values;
	return update;
}
function writeSubagentRunValues(values, deleteRunIds, retainedRunIds) {
	if (values.length === 0 && deleteRunIds?.length === 0 && retainedRunIds === void 0) return;
	runOpenClawStateWriteTransaction((database) => {
		const { db } = database;
		const stateDb = getNodeSqliteKysely(db);
		for (const row of values) upsertSubagentRunRowInDatabase(database, row);
		if (retainedRunIds !== void 0) {
			const deleteQuery = retainedRunIds.length === 0 ? stateDb.deleteFrom("subagent_runs") : stateDb.deleteFrom("subagent_runs").where("run_id", "not in", retainedRunIds);
			executeSqliteQuerySync(db, deleteQuery);
			return;
		}
		if (deleteRunIds && deleteRunIds.length > 0) executeSqliteQuerySync(db, stateDb.deleteFrom("subagent_runs").where("run_id", "in", deleteRunIds));
	});
}
function readSubagentRegistryRows(scope) {
	const { db } = openOpenClawStateDatabase();
	let query = getNodeSqliteKysely(db).selectFrom("subagent_runs").selectAll();
	if (scope?.kind === "child") query = query.where("child_session_key", "=", scope.sessionKey);
	else if (scope?.kind === "controller") query = query.where((eb) => eb.or([eb("controller_session_key", "=", scope.sessionKey), eb.and([eb.or([eb("controller_session_key", "is", null), eb("controller_session_key", "=", "")]), eb("requester_session_key", "=", scope.sessionKey)])]));
	return executeSqliteQuerySync(db, query.orderBy("created_at", "asc").orderBy("run_id", "asc")).rows;
}
function subagentPayloadJsonValue(path) {
	return sql`json_extract(payload_json, ${path})`;
}
function canonicalSubagentPayloadFilter() {
	return sql`json_valid(payload_json)
    AND json_type(payload_json, '$.execution') = 'object'
    AND json_extract(payload_json, '$.execution.status')
      IN ('queued', 'running', 'interrupted', 'terminal')
    AND json_type(payload_json, '$.completion') = 'object'
    AND json_type(payload_json, '$.completion.required') IN ('true', 'false')
    AND json_type(payload_json, '$.delivery') = 'object'
    AND json_extract(payload_json, '$.delivery.status')
      IN (
        'not_required',
        'pending',
        'in_progress',
        'delivered',
        'failed',
        'suspended',
        'discarded'
      )
    AND json_type(payload_json, '$.delivery.handoffLeaseId') IS NULL
    AND json_type(payload_json, '$.delivery.handoffLeasedAt') IS NULL
    AND json_type(payload_json, '$.delivery.handoffInjectedAt') IS NULL`;
}
function readSubagentSessionListRows() {
	const { db } = openOpenClawStateDatabase();
	const stateDb = getNodeSqliteKysely(db);
	return executeSqliteQuerySync(db, stateDb.selectFrom("subagent_runs").select([
		"run_id",
		"child_session_key",
		"controller_session_key",
		"requester_session_key",
		"created_at",
		subagentPayloadJsonValue("$.model").as("model"),
		subagentPayloadJsonValue("$.runTimeoutSeconds").as("run_timeout_seconds"),
		subagentPayloadJsonValue("$.execution.status").as("execution_status"),
		subagentPayloadJsonValue("$.execution.startedAt").as("started_at"),
		subagentPayloadJsonValue("$.sessionStartedAt").as("session_started_at"),
		subagentPayloadJsonValue("$.accumulatedRuntimeMs").as("accumulated_runtime_ms"),
		subagentPayloadJsonValue("$.execution.endedAt").as("ended_at"),
		subagentPayloadJsonValue("$.endedReason").as("ended_reason"),
		subagentPayloadJsonValue("$.cleanupCompletedAt").as("cleanup_completed_at"),
		subagentPayloadJsonValue("$.generation").as("generation"),
		subagentPayloadJsonValue("$.execution.outcome.status").as("outcome_status"),
		subagentPayloadJsonValue("$.delivery.status").as("delivery_status"),
		subagentPayloadJsonValue("$.delivery.disposition").as("delivery_disposition"),
		subagentPayloadJsonValue("$.expectsCompletionMessage").as("expects_completion_message"),
		subagentPayloadJsonValue("$.requesterAgentId").as("requester_agent_id"),
		subagentPayloadJsonValue("$.delivery.suspendedAt").as("delivery_suspended_at")
	]).where(canonicalSubagentPayloadFilter()).orderBy("created_at", "asc").orderBy("run_id", "asc")).rows;
}
function rowToSubagentRunReadRecord(row) {
	const runId = row.run_id.trim();
	const childSessionKey = row.child_session_key.trim();
	const requesterSessionKey = row.requester_session_key.trim();
	if (!runId || !childSessionKey || !requesterSessionKey) return null;
	const outcomeStatus = row.outcome_status === "ok" || row.outcome_status === "error" || row.outcome_status === "timeout" || row.outcome_status === "unknown" ? row.outcome_status : void 0;
	const deliveryStatus = row.expects_completion_message === 0 ? "not_required" : DELIVERY_STATUSES.has(row.delivery_status ?? "") ? row.delivery_status : void 0;
	const startedAt = asFiniteNumber(row.started_at);
	const endedAt = asFiniteNumber(row.ended_at);
	return Object.fromEntries(Object.entries({
		runId,
		childSessionKey,
		controllerSessionKey: row.controller_session_key?.trim() || void 0,
		requesterSessionKey,
		requesterAgentId: row.requester_agent_id?.trim() || void 0,
		model: row.model || void 0,
		generation: Number.isSafeInteger(row.generation) && row.generation > 0 ? row.generation : void 0,
		createdAt: row.created_at,
		execution: {
			status: row.execution_status,
			...startedAt !== void 0 ? { startedAt } : {},
			...endedAt !== void 0 ? { endedAt } : {},
			...outcomeStatus ? { outcome: { status: outcomeStatus } } : {}
		},
		sessionStartedAt: asFiniteNumber(row.session_started_at),
		accumulatedRuntimeMs: asFiniteNumber(row.accumulated_runtime_ms),
		runTimeoutSeconds: asFiniteNumber(row.run_timeout_seconds),
		endedReason: row.ended_reason || void 0,
		cleanupCompletedAt: asFiniteNumber(row.cleanup_completed_at),
		delivery: deliveryStatus ? {
			status: deliveryStatus,
			...typeof row.delivery_disposition === "string" ? { disposition: row.delivery_disposition } : {},
			...asFiniteNumber(row.delivery_suspended_at) !== void 0 ? { suspendedAt: row.delivery_suspended_at ?? void 0 } : {}
		} : void 0
	}).filter(([, value]) => value !== void 0));
}
function loadScopedSubagentRuns(scope) {
	const key = scope.sessionKey.trim();
	if (!key) return [];
	return readSubagentRegistryRows({
		...scope,
		sessionKey: key
	}).flatMap((row) => {
		const run = rowToSubagentRunRecord(row);
		return run ? [run] : [];
	});
}
/** Loads runs controlled by one session, preserving the legacy requester fallback. */
function loadSubagentRunsForControllerFromSqlite(controllerSessionKey) {
	return loadScopedSubagentRuns({
		kind: "controller",
		sessionKey: controllerSessionKey
	});
}
/** Loads all persisted generations for one child session through its existing index. */
function loadSubagentRunsForChildSessionFromSqlite(childSessionKey) {
	return loadScopedSubagentRuns({
		kind: "child",
		sessionKey: childSessionKey
	});
}
/** Loads the canonical subagent registry from shared SQLite state. */
function loadSubagentRegistryFromSqlite() {
	const runs = /* @__PURE__ */ new Map();
	for (const row of readSubagentRegistryRows()) {
		const entry = rowToSubagentRunRecord(row);
		if (entry) runs.set(entry.runId, entry);
	}
	return runs;
}
/** Loads only the canonical fields needed to build session-list topology metadata. */
function loadSubagentSessionListRunsFromSqlite() {
	const runs = /* @__PURE__ */ new Map();
	for (const row of readSubagentSessionListRows()) {
		const entry = rowToSubagentRunReadRecord(row);
		if (entry) runs.set(entry.runId, entry);
	}
	return runs;
}
/** Saves the complete subagent run snapshot to sqlite and prunes rows not in the snapshot. */
function saveSubagentRegistryToSqlite(runs) {
	const values = [...runs.values()].map(bindSubagentRunRecord);
	writeSubagentRunValues(values, void 0, values.map((row) => row.run_id));
}
/** Persists only named run mutations, deleting names absent from the current registry. */
function saveSubagentRegistryChangesToSqlite(runs, changedRunIds) {
	const runIds = [...new Set(changedRunIds.map((runId) => runId.trim()).filter(Boolean))];
	const values = [];
	const deleteRunIds = [];
	for (const runId of runIds) {
		const entry = runs.get(runId);
		if (entry) values.push(bindSubagentRunRecord(entry));
		else deleteRunIds.push(runId);
	}
	writeSubagentRunValues(values, deleteRunIds);
}
//#endregion
export { getSubagentRunsForCollectorGroup as C, getSubagentRunsForChildSession as S, hasRetainedRequiredCompletionDelivery as _, loadSubagentSessionListRunsFromSqlite as a, findAuthorizedSwarmCollectorRequest as b, saveSubagentRegistryToSqlite as c, nextSubagentRunGeneration as d, clearDeliveryState as f, getDeliveryLastError as g, getDeliveryAttemptCount as h, loadSubagentRunsForControllerFromSqlite as i, upsertSubagentRunRowInDatabase as l, ensureDeliveryState as m, loadSubagentRegistryFromSqlite as n, readSubagentRun as o, ensureCompletionState as p, loadSubagentRunsForChildSessionFromSqlite as r, saveSubagentRegistryChangesToSqlite as s, bindSubagentRunRecord as t, compareSubagentRunGeneration as u, isDeliverySuspended as v, subagentRuns as w, findSwarmCollectorSession as x, normalizeSubagentRunState as y };
