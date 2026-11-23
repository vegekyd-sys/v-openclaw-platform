import { i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { C as OPENCLAW_STATE_SCHEMA_SQL, D as tableExists, E as ensureColumn } from "./openclaw-state-db-cache-AunrvrzG.js";
import { i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction } from "./openclaw-state-db-Bh3Bq87y.js";
import { i as generateSecureToken } from "./secure-random-Ds4AFLgz.js";
import "./worker-protocol-primitives-Dh40okcI.js";
import { a as projectWorkspaceResultConflict } from "./workspace-conflicts-CQVfTI04.js";
import { _ as resolvePlacementTurnEnvironment, c as normalizeEpoch, d as normalizeWorkerPlacementExecutionMode, g as required, i as isCurrentPlacementTurnClaim, l as normalizeIdentity, m as projectWorkerSessionTurnClaim, o as nextGeneration, p as placementTurnOwner, r as assertRecordShape } from "./placement-record-CFk-vhnB.js";
import { t as boundedWorkerError } from "./worker-error-0k8TuKFS.js";
import { a as query, i as getRequired, n as find, o as transitionValues, r as fromRow$1, s as canTransitionWorkerSessionPlacement, t as ensureLocal } from "./placement-row-codec-DmVeQZuK.js";
import { a as createPlacementWorkspaceResultOps, c as isCurrentWorkerWorkspacePendingResultOwner, i as createPlacementWorkspaceReservationOps, l as clearWorkerWorkspaceReconciliation, n as createPlacementTurnClaimOps, o as hasCurrentWorkspaceResultClaim, r as assertSessionWorkspaceUnreserved, s as hasWorkerWorkspacePendingResult, u as createPlacementWorkspaceJournalOps } from "./placement-turn-claims-C0a818JW.js";
import { n as clearWorkerTurnToolState, t as assertNoRunningWorkerSessionToolOperations } from "./placement-session-tool-operations-B-By5lJt.js";
import { a as registerWorkerTurnClaimClosedHandler, l as signalWorkerTurnClaimClosed, t as attachWorkerTurnExecutionIdentityStore } from "./placement-turn-claim-events-D86so_oK.js";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
//#region src/gateway/worker-environments/placement-drain.ts
function drainWorkerSessionPlacement(db, input, nowMs) {
	const sessionId = required(input.sessionId, "session id");
	const environmentId = required(input.environmentId, "environment id");
	const ownerEpoch = normalizeEpoch(input.ownerEpoch, "active owner epoch");
	const current = getRequired(db, sessionId);
	if (current.state !== "active" || current.generation !== input.expectedGeneration || current.environmentId !== environmentId || current.activeOwnerEpoch !== ownerEpoch) throw new Error(`Cannot drain stale worker placement for session ${sessionId}`);
	if (!input.allowPendingWorkspaceResult && hasWorkerWorkspacePendingResult(db, sessionId)) throw new Error(`Cannot drain session ${sessionId} with a pending cloud workspace result`);
	const values = transitionValues(current, "draining", input.workspaceBaseManifestRef === void 0 ? {} : { workspaceBaseManifestRef: input.workspaceBaseManifestRef }, nowMs);
	const turnClaim = current.turnClaim;
	if (turnClaim) {
		values.turn_claim_owner = turnClaim.owner;
		values.turn_claim_id = turnClaim.claimId;
		values.turn_claim_run_id = turnClaim.runId;
		values.turn_claim_generation = turnClaim.generation;
		values.turn_claim_owner_epoch = turnClaim.ownerEpoch;
	}
	assertRecordShape({
		state: "draining",
		executionMode: current.executionMode,
		environmentId,
		activeOwnerEpoch: ownerEpoch,
		workspaceBaseManifestRef: values.workspace_base_manifest_ref,
		remoteWorkspaceDir: values.remote_workspace_dir,
		workerBundleHash: values.worker_bundle_hash,
		lastTranscriptAckCursor: values.last_transcript_ack_cursor,
		lastLiveEventAckCursor: values.last_live_event_ack_cursor,
		recoveryError: values.recovery_error,
		terminalReason: values.terminal_reason,
		terminalAtMs: values.terminal_at_ms,
		turnClaim
	});
	if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set(values).where("session_id", "=", sessionId).where("state", "=", "active").where("transition_generation", "=", current.generation).where("environment_id", "=", environmentId).where("active_owner_epoch", "=", ownerEpoch)).numAffectedRows !== 1n) throw new Error(`Worker session placement ${sessionId} changed during drain`);
	if (input.workspaceBaseManifestRef !== void 0) clearWorkerWorkspaceReconciliation(db, sessionId, input.workspaceBaseManifestRef);
	return getRequired(db, sessionId);
}
//#endregion
//#region src/gateway/worker-environments/placement-move-intent.ts
const MOVE_SCHEMA_START = "CREATE TABLE IF NOT EXISTS worker_session_placement_moves (";
const MOVE_SCHEMA_END = "\n) STRICT;";
const MOVE_OPERATION_PREFIX = "move:v1:";
const MOVE_MACHINE_CLASS_MAX_LENGTH = 128;
const moveQuery = (db) => getNodeSqliteKysely(db);
function moveSchemaSql() {
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf(MOVE_SCHEMA_START);
	const endMarkerStart = OPENCLAW_STATE_SCHEMA_SQL.indexOf(MOVE_SCHEMA_END, start);
	if (start < 0 || endMarkerStart < start) throw new Error("Worker placement move schema marker is missing");
	return OPENCLAW_STATE_SCHEMA_SQL.slice(start, endMarkerStart + 10);
}
const ensuredMoveSchemaHandles = /* @__PURE__ */ new WeakSet();
function ensureWorkerPlacementMoveSchema(db) {
	if (ensuredMoveSchemaHandles.has(db)) return;
	db.exec(moveSchemaSql());
	ensureColumn(db, "worker_session_placement_moves", "target_machine_class TEXT");
	ensureColumn(db, "worker_session_placement_moves", "abandon_source INTEGER");
	ensuredMoveSchemaHandles.add(db);
}
function ensureExistingWorkerPlacementMoveSchema(db) {
	if (ensuredMoveSchemaHandles.has(db)) return true;
	if (!tableExists(db, "worker_session_placement_moves")) return false;
	ensureWorkerPlacementMoveSchema(db);
	return true;
}
function normalizeGeneration(value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new Error("Worker placement move source generation must be a non-negative integer");
	return value;
}
function boundedIdentifier(value, field, maximumLength = 256) {
	const normalized = required(value, field);
	if (normalized.length > maximumLength) throw new Error(`Worker session placement ${field} exceeds ${maximumLength} characters`);
	return normalized;
}
function normalizeOperationId(value) {
	const operationId = required(value, "move operation id");
	if (!operationId.startsWith(MOVE_OPERATION_PREFIX) || operationId.length > 128) throw new Error("Worker session placement move operation id is invalid");
	return operationId;
}
function normalizeWorkerPlacementMoveTarget(target) {
	switch (target.kind) {
		case "gateway": return { kind: "gateway" };
		case "profile": {
			const machineClass = target.machineClass;
			return {
				kind: "profile",
				profileId: boundedIdentifier(target.profileId, "move profile id"),
				...machineClass === void 0 ? {} : { machineClass: boundedIdentifier(machineClass, "move machine class", MOVE_MACHINE_CLASS_MAX_LENGTH) }
			};
		}
		case "device": return {
			kind: "device",
			deviceId: boundedIdentifier(target.deviceId, "move device id")
		};
	}
	throw new Error("Worker placement move target is invalid");
}
function normalizeWorkerPlacementMoveSource(source) {
	return {
		generation: normalizeGeneration(source.generation),
		environmentId: boundedIdentifier(source.environmentId, "move source environment id"),
		ownerEpoch: normalizeEpoch(source.ownerEpoch, "move source owner epoch")
	};
}
function targetValues(target) {
	switch (target.kind) {
		case "gateway": return {
			target_kind: target.kind,
			target_id: null,
			target_machine_class: null
		};
		case "profile": return {
			target_kind: target.kind,
			target_id: target.profileId,
			target_machine_class: target.machineClass ?? null
		};
		case "device": return {
			target_kind: target.kind,
			target_id: target.deviceId,
			target_machine_class: null
		};
	}
	throw new Error("Worker placement move target is invalid");
}
function normalizeAbandonSource(value) {
	if (value === null) return false;
	if (value === 1) return true;
	throw new Error("Invalid worker placement move source abandonment value");
}
function abandonSourceValue(abandonSource) {
	return abandonSource ? 1 : null;
}
function fromRow(row) {
	const source = normalizeWorkerPlacementMoveSource({
		generation: row.source_generation,
		environmentId: row.source_environment_id,
		ownerEpoch: row.source_owner_epoch
	});
	let target;
	if (row.target_kind !== "profile" && row.target_machine_class !== null) throw new Error(`Invalid worker placement move target: ${row.target_kind}`);
	if (row.target_kind === "gateway" && row.target_id === null) target = { kind: "gateway" };
	else if (row.target_kind === "profile" && row.target_id !== null) target = {
		kind: "profile",
		profileId: boundedIdentifier(row.target_id, "move profile id"),
		...row.target_machine_class === null ? {} : { machineClass: boundedIdentifier(row.target_machine_class, "move machine class", MOVE_MACHINE_CLASS_MAX_LENGTH) }
	};
	else if (row.target_kind === "device" && row.target_id !== null) target = {
		kind: "device",
		deviceId: boundedIdentifier(row.target_id, "move device id")
	};
	else throw new Error(`Invalid worker placement move target: ${row.target_kind}`);
	const abandonSource = normalizeAbandonSource(row.abandon_source);
	if (abandonSource && target.kind !== "gateway") throw new Error("Worker placement move source abandonment requires a Gateway target");
	return {
		operationId: normalizeOperationId(row.operation_id),
		sessionId: required(row.session_id, "move session id"),
		source,
		target,
		abandonSource,
		lastError: row.last_error,
		createdAtMs: row.created_at_ms,
		updatedAtMs: row.updated_at_ms
	};
}
function findMoveRowBySession(db, sessionId) {
	if (!ensureExistingWorkerPlacementMoveSchema(db)) return;
	return executeSqliteQueryTakeFirstSync(db, moveQuery(db).selectFrom("worker_session_placement_moves").selectAll().where("session_id", "=", sessionId));
}
function findMoveRowByOperation(db, operationId) {
	if (!ensureExistingWorkerPlacementMoveSchema(db)) return;
	return executeSqliteQueryTakeFirstSync(db, moveQuery(db).selectFrom("worker_session_placement_moves").selectAll().where("operation_id", "=", operationId));
}
function requireExactMove(db, input) {
	const operationId = normalizeOperationId(input.operationId);
	const sessionId = required(input.sessionId, "move session id");
	const row = findMoveRowByOperation(db, operationId);
	if (!row || row.session_id !== sessionId) throw new Error(`Session ${sessionId} placement move changed before completion`);
	return fromRow(row);
}
function deleteExactMove(db, intent) {
	const values = targetValues(intent.target);
	let statement = moveQuery(db).deleteFrom("worker_session_placement_moves").where("operation_id", "=", intent.operationId).where("session_id", "=", intent.sessionId).where("source_generation", "=", intent.source.generation).where("source_environment_id", "=", intent.source.environmentId).where("source_owner_epoch", "=", intent.source.ownerEpoch).where("target_kind", "=", values.target_kind);
	statement = intent.abandonSource ? statement.where("abandon_source", "=", 1) : statement.where("abandon_source", "is", null);
	statement = values.target_id === null ? statement.where("target_id", "is", null) : statement.where("target_id", "=", values.target_id);
	statement = values.target_machine_class === null ? statement.where("target_machine_class", "is", null) : statement.where("target_machine_class", "=", values.target_machine_class);
	if (executeSqliteQuerySync(db, statement).numAffectedRows !== 1n) throw new Error(`Session ${intent.sessionId} placement move changed before completion`);
}
function requireExactAttachedEnvironment(db, input) {
	const row = executeSqliteQueryTakeFirstSync(db, moveQuery(db).selectFrom("worker_environments").select([
		"state",
		"owner_epoch",
		"profile_id",
		"attached_session_ids_json"
	]).where("environment_id", "=", input.environmentId));
	let attachedSessionIds;
	try {
		attachedSessionIds = row ? JSON.parse(row.attached_session_ids_json) : void 0;
	} catch {
		attachedSessionIds = void 0;
	}
	if (!row || row.state !== "attached" || row.owner_epoch !== input.ownerEpoch || input.profileId !== void 0 && row.profile_id !== input.profileId || !Array.isArray(attachedSessionIds) || attachedSessionIds.length !== 1 || attachedSessionIds[0] !== input.sessionId) throw new Error(`Cannot move stale worker environment for session ${input.sessionId}`);
}
function createPlacementMoveOps(runtime) {
	const { read, write, now } = runtime;
	return {
		getPlacementMove(sessionId) {
			const row = findMoveRowBySession(read(), required(sessionId, "move session id"));
			return row ? fromRow(row) : void 0;
		},
		getPlacementMoves(sessionIds) {
			const normalizedIds = [...new Set(sessionIds.map((sessionId) => required(sessionId, "move session id")))];
			const results = /* @__PURE__ */ new Map();
			const db = read();
			if (!ensureExistingWorkerPlacementMoveSchema(db)) return results;
			for (let offset = 0; offset < normalizedIds.length; offset += 250) {
				const chunk = normalizedIds.slice(offset, offset + 250);
				for (const row of executeSqliteQuerySync(db, moveQuery(db).selectFrom("worker_session_placement_moves").selectAll().where("session_id", "in", chunk)).rows) {
					const intent = fromRow(row);
					results.set(intent.sessionId, intent);
				}
			}
			return results;
		},
		listPlacementMoves() {
			const db = read();
			if (!ensureExistingWorkerPlacementMoveSchema(db)) return [];
			return executeSqliteQuerySync(db, moveQuery(db).selectFrom("worker_session_placement_moves").selectAll().orderBy("created_at_ms").orderBy("session_id")).rows.map(fromRow);
		},
		beginPlacementMove(input) {
			const sessionId = required(input.sessionId, "move session id");
			const source = normalizeWorkerPlacementMoveSource(input.source);
			const target = normalizeWorkerPlacementMoveTarget(input.target);
			const abandonSource = input.abandonSource === true;
			if (abandonSource && target.kind !== "gateway") throw new Error("Worker placement move source abandonment requires a Gateway target");
			const operationId = `${MOVE_OPERATION_PREFIX}${generateSecureToken(32)}`;
			return write((db) => {
				const existingRow = findMoveRowBySession(db, sessionId);
				if (existingRow) {
					const existing = fromRow(existingRow);
					if (!isDeepStrictEqual(existing.source, source) || !isDeepStrictEqual(existing.target, target) || existing.abandonSource !== abandonSource) throw new Error(`Session ${sessionId} already has a conflicting placement move`);
					return {
						intent: existing,
						placement: getRequired(db, sessionId),
						joined: true
					};
				}
				const current = getRequired(db, sessionId);
				if (current.state !== "active" || current.generation !== source.generation || current.environmentId !== source.environmentId || current.activeOwnerEpoch !== source.ownerEpoch) throw new Error(`Cannot move stale worker placement for session ${sessionId}`);
				requireExactAttachedEnvironment(db, {
					sessionId,
					...source
				});
				ensureWorkerPlacementMoveSchema(db);
				const timestamp = now();
				const row = {
					operation_id: operationId,
					session_id: sessionId,
					source_generation: source.generation,
					source_environment_id: source.environmentId,
					source_owner_epoch: source.ownerEpoch,
					...targetValues(target),
					abandon_source: abandonSourceValue(abandonSource),
					last_error: null,
					created_at_ms: timestamp,
					updated_at_ms: timestamp
				};
				executeSqliteQuerySync(db, moveQuery(db).insertInto("worker_session_placement_moves").values(row));
				const placement = drainWorkerSessionPlacement(db, {
					sessionId,
					environmentId: source.environmentId,
					ownerEpoch: source.ownerEpoch,
					expectedGeneration: source.generation
				}, timestamp);
				return {
					intent: fromRow(row),
					placement,
					joined: false
				};
			});
		},
		recordPlacementMoveError(input) {
			return write((db) => {
				const row = findMoveRowByOperation(db, normalizeOperationId(input.operationId));
				if (!row || row.session_id !== required(input.sessionId, "move session id")) return false;
				const intent = fromRow(row);
				const values = targetValues(intent.target);
				let statement = moveQuery(db).updateTable("worker_session_placement_moves").set({
					last_error: boundedWorkerError(input.error),
					updated_at_ms: now()
				}).where("operation_id", "=", intent.operationId).where("session_id", "=", intent.sessionId).where("source_generation", "=", intent.source.generation).where("source_environment_id", "=", intent.source.environmentId).where("source_owner_epoch", "=", intent.source.ownerEpoch).where("target_kind", "=", values.target_kind);
				statement = intent.abandonSource ? statement.where("abandon_source", "=", 1) : statement.where("abandon_source", "is", null);
				statement = values.target_id === null ? statement.where("target_id", "is", null) : statement.where("target_id", "=", values.target_id);
				statement = values.target_machine_class === null ? statement.where("target_machine_class", "is", null) : statement.where("target_machine_class", "=", values.target_machine_class);
				return executeSqliteQuerySync(db, statement).numAffectedRows === 1n;
			});
		},
		cancelPlacementMove(input) {
			write((db) => {
				deleteExactMove(db, requireExactMove(db, input));
			});
		},
		completePlacementMoveSourceToLocal(input) {
			return write((db) => {
				const intent = requireExactMove(db, input);
				const current = getRequired(db, intent.sessionId);
				if (current.state !== "reconciling" || current.generation !== input.expectedGeneration || current.environmentId !== intent.source.environmentId || current.activeOwnerEpoch !== intent.source.ownerEpoch) throw new Error(`Cannot complete stale Gateway placement move for session ${intent.sessionId}`);
				const values = transitionValues(current, "local", {}, now());
				if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set(values).where("session_id", "=", intent.sessionId).where("state", "=", "reconciling").where("transition_generation", "=", current.generation).where("environment_id", "=", intent.source.environmentId).where("active_owner_epoch", "=", intent.source.ownerEpoch).where("turn_claim_owner", "is", null)).numAffectedRows !== 1n) throw new Error(`Session ${intent.sessionId} changed during Gateway placement move`);
				if (intent.target.kind === "gateway") deleteExactMove(db, intent);
				return getRequired(db, intent.sessionId);
			});
		},
		completeAbandonedPlacementMoveSourceToLocal(input) {
			return write((db) => {
				const intent = requireExactMove(db, input);
				if (!intent.abandonSource || intent.target.kind !== "gateway") throw new Error(`Session ${intent.sessionId} placement move is not an abandonment`);
				const current = getRequired(db, intent.sessionId);
				if (current.state !== "failed" || current.generation !== input.expectedGeneration || current.environmentId !== intent.source.environmentId || current.activeOwnerEpoch !== intent.source.ownerEpoch || current.recoveryError !== input.expectedRecoveryError || current.turnClaim !== null) throw new Error(`Cannot complete stale abandoned placement move for session ${intent.sessionId}`);
				const values = transitionValues(current, "local", {}, now());
				if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set(values).where("session_id", "=", intent.sessionId).where("state", "=", "failed").where("transition_generation", "=", current.generation).where("environment_id", "=", intent.source.environmentId).where("active_owner_epoch", "=", intent.source.ownerEpoch).where("recovery_error", "=", input.expectedRecoveryError).where("turn_claim_owner", "is", null)).numAffectedRows !== 1n) throw new Error(`Session ${intent.sessionId} changed during abandoned placement move`);
				deleteExactMove(db, intent);
				return getRequired(db, intent.sessionId);
			});
		},
		completePlacementMoveToWorker(input) {
			const environmentId = boundedIdentifier(input.environmentId, "move destination environment id");
			const ownerEpoch = normalizeEpoch(input.ownerEpoch, "move destination owner epoch");
			return write((db) => {
				const intent = requireExactMove(db, input);
				if (intent.target.kind === "gateway") throw new Error(`Session ${intent.sessionId} placement move target is not a worker`);
				const current = getRequired(db, intent.sessionId);
				if (current.state !== "active" || current.generation !== input.expectedGeneration || current.environmentId !== environmentId || current.activeOwnerEpoch !== ownerEpoch) throw new Error(`Cannot complete stale worker placement move for session ${intent.sessionId}`);
				const profileId = intent.target.kind === "profile" ? intent.target.profileId : `device:${intent.target.deviceId}`;
				requireExactAttachedEnvironment(db, {
					sessionId: intent.sessionId,
					environmentId,
					ownerEpoch,
					profileId
				});
				deleteExactMove(db, intent);
				return current;
			});
		}
	};
}
//#endregion
//#region src/gateway/worker-environments/placement-pending-failure.ts
function createPlacementPendingFailureOps(runtime) {
	const { now, path, write } = runtime;
	return { failWorkspaceResultAndReleaseTurn(pending, error) {
		const sessionId = required(pending.sessionId, "session id");
		const recoveryError = boundedWorkerError(error);
		const outcome = write((db) => {
			const current = getRequired(db, sessionId);
			if (!isCurrentWorkerWorkspacePendingResultOwner(current, pending)) throw new Error(`Session ${sessionId} workspace result owner changed before failure`);
			const persisted = current.turnClaim;
			const releasedClaim = persisted ? {
				sessionId,
				claimId: persisted.claimId,
				runId: persisted.runId,
				placementGeneration: persisted.generation,
				owner: placementTurnOwner(current)
			} : null;
			const pendingQuery = getNodeSqliteKysely(db);
			if (!executeSqliteQuerySync(db, pendingQuery.selectFrom("worker_workspace_pending_results").select("session_id").where("session_id", "=", sessionId).where("environment_id", "=", pending.environmentId).where("owner_epoch", "=", pending.ownerEpoch).where("placement_generation", "=", pending.placementGeneration).where("claim_id", "=", pending.claimId).where("run_id", "=", pending.runId)).rows[0]) throw new Error(`Session ${sessionId} workspace result changed before failure`);
			const terminalAtMs = now();
			let transitioning = current;
			if (transitioning.state === "active") {
				const values = transitionValues(transitioning, "draining", {}, terminalAtMs);
				if (persisted) {
					values.turn_claim_owner = persisted.owner;
					values.turn_claim_id = persisted.claimId;
					values.turn_claim_run_id = persisted.runId;
					values.turn_claim_generation = persisted.generation;
					values.turn_claim_owner_epoch = persisted.ownerEpoch;
				}
				if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set(values).where("session_id", "=", sessionId).where("state", "=", "active").where("transition_generation", "=", transitioning.generation)).numAffectedRows !== 1n) throw new Error(`Session ${sessionId} workspace result changed during drain`);
				transitioning = getRequired(db, sessionId);
			}
			if (transitioning.state !== "draining") throw new Error(`Session ${sessionId} workspace result did not reach draining`);
			if (persisted) {
				assertNoRunningWorkerSessionToolOperations(db, {
					sessionId,
					claimId: persisted.claimId
				});
				clearWorkerTurnToolState(db, {
					sessionId,
					claimId: persisted.claimId
				});
			}
			const reconcilingValues = transitionValues(transitioning, "reconciling", {}, terminalAtMs);
			if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set(reconcilingValues).where("session_id", "=", sessionId).where("state", "=", "draining").where("transition_generation", "=", transitioning.generation)).numAffectedRows !== 1n) throw new Error(`Session ${sessionId} workspace result changed during reconcile`);
			transitioning = getRequired(db, sessionId);
			const failedValues = transitionValues(transitioning, "failed", {
				recoveryError,
				terminalReason: recoveryError
			}, terminalAtMs);
			if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set(failedValues).where("session_id", "=", sessionId).where("state", "=", "reconciling").where("transition_generation", "=", transitioning.generation).where("turn_claim_owner", "is", null)).numAffectedRows !== 1n) throw new Error(`Session ${sessionId} workspace result changed during failure`);
			if (executeSqliteQuerySync(db, pendingQuery.deleteFrom("worker_workspace_pending_results").where("session_id", "=", sessionId).where("environment_id", "=", pending.environmentId).where("owner_epoch", "=", pending.ownerEpoch).where("placement_generation", "=", pending.placementGeneration).where("claim_id", "=", pending.claimId).where("run_id", "=", pending.runId)).numAffectedRows !== 1n) throw new Error(`Session ${sessionId} workspace result changed during failure`);
			return {
				record: getRequired(db, sessionId),
				releasedClaim
			};
		});
		if (outcome.releasedClaim) signalWorkerTurnClaimClosed(path, outcome.releasedClaim);
		return outcome.record;
	} };
}
//#endregion
//#region src/gateway/worker-environments/placement-store.ts
const RETIRABLE_PLACEMENT_STATES = [
	"local",
	"requested",
	"reclaimed",
	"failed"
];
function exactConflictPath(value) {
	if (typeof value !== "string" || value.length === 0) throw new Error("Worker placement conflict path is required");
	return value;
}
function updateTransition(db, current, to, patch, nowMs) {
	const values = transitionValues(current, to, patch, nowMs);
	if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set(values).where("session_id", "=", current.sessionId).where("state", "=", current.state).where("transition_generation", "=", current.generation).where("turn_claim_owner", "is", null)).numAffectedRows !== 1n) throw new Error(`Worker session placement ${current.sessionId} changed during transition`);
	return getRequired(db, current.sessionId);
}
function createWorkerSessionPlacementStore(options = {}) {
	const path = (options.database ?? openOpenClawStateDatabase()).path;
	const now = options.now ?? Date.now;
	const runtime = {
		path,
		instanceId: randomUUID(),
		now,
		read: () => openOpenClawStateDatabase({ path }).db,
		write: (operation) => runOpenClawStateWriteTransaction(({ db }) => operation(db), { path })
	};
	const { read, write } = runtime;
	const workspaceResultConflicts = /* @__PURE__ */ new Map();
	const withWorkspaceResultConflict = (record) => {
		if (!record) return;
		const conflict = workspaceResultConflicts.get(record.sessionId);
		return conflict ? {
			...record,
			workspaceResultConflict: conflict
		} : record;
	};
	const requireClaimOwner = (claim) => {
		const db = read();
		const current = find(db, required(claim.sessionId, "session id"));
		if (!current || !isCurrentPlacementTurnClaim(current, claim) && !hasCurrentWorkspaceResultClaim(db, claim)) throw new Error(`Session ${claim.sessionId} workspace result conflict owner changed`);
	};
	const store = {
		...createPlacementWorkspaceReservationOps(runtime),
		...createPlacementTurnClaimOps(runtime),
		...createPlacementPendingFailureOps(runtime),
		...createPlacementMoveOps(runtime),
		...createPlacementWorkspaceJournalOps(runtime),
		...createPlacementWorkspaceResultOps(runtime),
		registerTurnClaimClosedHandler(handler) {
			return registerWorkerTurnClaimClosedHandler(path, handler);
		},
		get(sessionId) {
			return withWorkspaceResultConflict(find(read(), required(sessionId, "session id")));
		},
		getMany(sessionIds) {
			const normalizedIds = [...new Set(sessionIds.map((sessionId) => required(sessionId, "session id")))];
			const records = /* @__PURE__ */ new Map();
			const db = read();
			for (let offset = 0; offset < normalizedIds.length; offset += 250) {
				const chunk = normalizedIds.slice(offset, offset + 250);
				for (const row of executeSqliteQuerySync(db, query(db).selectFrom("worker_session_placements").selectAll().where("session_id", "in", chunk)).rows) {
					const record = fromRow$1(row);
					records.set(record.sessionId, withWorkspaceResultConflict(record));
				}
			}
			return records;
		},
		retireSessionPlacement(input) {
			const sessionId = required(input.sessionId, "session id");
			if (!RETIRABLE_PLACEMENT_STATES.includes(input.expectedState)) throw new Error(`Cannot retire worker session placement from ${input.expectedState}`);
			write((db) => {
				if (executeSqliteQuerySync(db, query(db).deleteFrom("worker_session_placements").where("session_id", "=", sessionId).where("state", "=", input.expectedState).where("transition_generation", "=", input.expectedGeneration).where("turn_claim_owner", "is", null).where("turn_claim_id", "is", null).where("turn_claim_run_id", "is", null).where("turn_claim_generation", "is", null).where("turn_claim_owner_epoch", "is", null)).numAffectedRows !== 1n) throw new Error(`Worker session placement ${sessionId} changed before retirement`);
			});
			workspaceResultConflicts.delete(sessionId);
		},
		recordWorkspaceResultConflict(claim, conflict) {
			requireClaimOwner(claim);
			if (!conflict) {
				workspaceResultConflicts.delete(claim.sessionId);
				return;
			}
			const paths = conflict.paths.map(exactConflictPath);
			const stagedResultRef = required(conflict.stagedResultRef, "staged result ref");
			if (paths.length === 0 || !/^refs\/openclaw\/worker-results\/[A-Za-z0-9-]+$/u.test(stagedResultRef)) throw new Error("Cloud workspace result conflict projection is invalid");
			workspaceResultConflicts.set(claim.sessionId, projectWorkspaceResultConflict(paths, stagedResultRef, conflict.totalCount));
		},
		startDispatch(input) {
			const identity = normalizeIdentity(input);
			const executionMode = normalizeWorkerPlacementExecutionMode(input.executionMode);
			return write((db) => {
				const current = ensureLocal(db, identity, now());
				assertSessionWorkspaceUnreserved(db, identity.sessionId);
				if (current.state !== "local" && current.state !== "reclaimed" && current.state !== "failed") throw new Error(`Cannot dispatch session ${identity.sessionId} from placement ${current.state}`);
				const updatedAtMs = now();
				if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set({
					state: "requested",
					execution_mode: executionMode,
					environment_id: null,
					transition_generation: nextGeneration(current.generation),
					active_owner_epoch: null,
					workspace_base_manifest_ref: null,
					remote_workspace_dir: null,
					worker_bundle_hash: null,
					last_transcript_ack_cursor: null,
					last_live_event_ack_cursor: null,
					recovery_error: null,
					terminal_reason: null,
					terminal_at_ms: null,
					updated_at_ms: updatedAtMs,
					state_changed_at_ms: updatedAtMs
				}).where("session_id", "=", current.sessionId).where("state", "=", current.state).where("transition_generation", "=", current.generation)).numAffectedRows !== 1n) throw new Error(`Session ${identity.sessionId} placement changed during dispatch barrier`);
				return getRequired(db, identity.sessionId);
			});
		},
		transition(input) {
			if (!canTransitionWorkerSessionPlacement(input.from, input.to)) throw new Error(`Illegal worker session placement transition: ${input.from} -> ${input.to}`);
			if (input.from === "draining" && input.to === "reconciling") throw new Error("Use startReconcile after fencing the drained worker environment");
			if (input.to === "failed") throw new Error("Use fail to record terminal worker placement diagnostics");
			const sessionId = required(input.sessionId, "session id");
			return write((db) => {
				const current = getRequired(db, sessionId);
				if (current.state !== input.from || current.generation !== input.expectedGeneration) throw new Error(`Worker session placement ${sessionId} changed: expected ${input.from}@${input.expectedGeneration}, found ${current.state}@${current.generation}`);
				if (current.turnClaim) throw new Error(`Cannot transition session ${sessionId} during an active turn`);
				return updateTransition(db, current, input.to, input.patch ?? {}, now());
			});
		},
		startDrain(input) {
			return write((db) => drainWorkerSessionPlacement(db, input, now()));
		},
		startWorkspaceResultDrain(claim) {
			return write((db) => {
				const current = getRequired(db, required(claim.sessionId, "session id"));
				const ownsWorkspaceResult = hasCurrentWorkspaceResultClaim(db, claim);
				const owner = resolvePlacementTurnEnvironment(current, claim) ?? (ownsWorkspaceResult && current.state === "active" && current.environmentId && current.activeOwnerEpoch !== null ? {
					environmentId: current.environmentId,
					ownerEpoch: current.activeOwnerEpoch
				} : void 0);
				if (current.state !== "active" || !owner || !ownsWorkspaceResult) throw new Error(`Cannot drain stale workspace result for session ${claim.sessionId}`);
				return drainWorkerSessionPlacement(db, {
					sessionId: current.sessionId,
					environmentId: owner.environmentId,
					ownerEpoch: owner.ownerEpoch,
					expectedGeneration: current.generation,
					allowPendingWorkspaceResult: true
				}, now());
			});
		},
		startReconcile(input) {
			const sessionId = required(input.sessionId, "session id");
			const environmentId = required(input.environmentId, "environment id");
			const ownerEpoch = normalizeEpoch(input.ownerEpoch, "active owner epoch");
			const outcome = write((db) => {
				const current = getRequired(db, sessionId);
				if (current.state !== "draining" || current.generation !== input.expectedGeneration || current.environmentId !== environmentId || current.activeOwnerEpoch !== ownerEpoch) throw new Error(`Cannot reconcile stale worker placement for session ${sessionId}`);
				if (hasWorkerWorkspacePendingResult(db, sessionId)) throw new Error(`Cannot reconcile session ${sessionId} with a pending cloud workspace result`);
				const claim = current.turnClaim;
				if (claim?.owner === "local" && input.forceLocalClaim !== true) throw new Error(`Cannot reconcile session ${sessionId} while its local turn is active`);
				if (claim) {
					assertNoRunningWorkerSessionToolOperations(db, {
						sessionId,
						claimId: claim.claimId
					});
					clearWorkerTurnToolState(db, {
						sessionId,
						claimId: claim.claimId
					});
				}
				const values = transitionValues(current, "reconciling", {}, now());
				const update = query(db).updateTable("worker_session_placements").set(values).where("session_id", "=", sessionId).where("state", "=", "draining").where("transition_generation", "=", current.generation).where("environment_id", "=", environmentId).where("active_owner_epoch", "=", ownerEpoch);
				const guardedUpdate = claim ? update.where("turn_claim_owner", "=", claim.owner).where("turn_claim_id", "=", claim.claimId).where("turn_claim_run_id", "=", claim.runId).where("turn_claim_generation", "=", claim.generation).where("turn_claim_owner_epoch", claim.owner === "worker" ? "=" : "is", claim.ownerEpoch) : update.where("turn_claim_owner", "is", null);
				if (executeSqliteQuerySync(db, guardedUpdate).numAffectedRows !== 1n) throw new Error(`Worker session placement ${sessionId} changed during reconcile`);
				return {
					record: getRequired(db, sessionId),
					releasedClaim: claim ? {
						sessionId,
						claimId: claim.claimId,
						runId: claim.runId,
						placementGeneration: claim.generation,
						owner: placementTurnOwner(current)
					} : void 0
				};
			});
			if (outcome.releasedClaim) signalWorkerTurnClaimClosed(path, outcome.releasedClaim);
			return outcome.record;
		},
		validateWorkerOwner(input) {
			const current = find(read(), required(input.sessionId, "session id"));
			return current?.state === "active" && current.environmentId === required(input.environmentId, "environment id") && current.activeOwnerEpoch === normalizeEpoch(input.ownerEpoch, "active owner epoch");
		},
		fail(input) {
			const sessionId = required(input.sessionId, "session id");
			const recoveryError = boundedWorkerError(input.recoveryError);
			const outcome = write((db) => {
				const current = getRequired(db, sessionId);
				if (input.expectedGeneration !== void 0 && current.generation !== input.expectedGeneration) throw new Error(`Worker session placement ${sessionId} changed before failure`);
				if (current.state === "failed") {
					if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set({
						recovery_error: recoveryError,
						updated_at_ms: now()
					}).where("session_id", "=", sessionId).where("state", "=", "failed").where("transition_generation", "=", current.generation)).numAffectedRows !== 1n) throw new Error(`Worker session placement ${sessionId} changed during failure update`);
					return {
						record: getRequired(db, sessionId),
						releasedClaim: void 0
					};
				}
				if (!canTransitionWorkerSessionPlacement(current.state, "failed")) throw new Error(`Cannot fail worker session placement from ${current.state}`);
				const localClaim = current.turnClaim?.owner === "local" ? current.turnClaim : null;
				const updatedAtMs = now();
				if (executeSqliteQuerySync(db, query(db).updateTable("worker_session_placements").set({
					state: "failed",
					transition_generation: nextGeneration(current.generation),
					recovery_error: recoveryError,
					terminal_reason: recoveryError,
					terminal_at_ms: updatedAtMs,
					turn_claim_owner: localClaim ? "local" : null,
					turn_claim_id: localClaim?.claimId ?? null,
					turn_claim_run_id: localClaim?.runId ?? null,
					turn_claim_generation: localClaim?.generation ?? null,
					turn_claim_owner_epoch: null,
					updated_at_ms: updatedAtMs,
					state_changed_at_ms: updatedAtMs
				}).where("session_id", "=", sessionId).where("state", "=", current.state).where("transition_generation", "=", current.generation)).numAffectedRows !== 1n) throw new Error(`Worker session placement ${sessionId} changed during failure`);
				return {
					record: getRequired(db, sessionId),
					releasedClaim: projectWorkerSessionTurnClaim(current)
				};
			});
			if (outcome.releasedClaim) signalWorkerTurnClaimClosed(path, outcome.releasedClaim);
			return outcome.record;
		},
		adoptActive(input) {
			const sessionId = required(input.sessionId, "session id");
			const environmentId = required(input.environmentId, "environment id");
			const ownerEpoch = normalizeEpoch(input.ownerEpoch, "active owner epoch");
			const current = getRequired(read(), sessionId);
			if (current.state !== "active" || current.environmentId !== environmentId || current.activeOwnerEpoch !== ownerEpoch || input.expectedGeneration !== void 0 && current.generation !== input.expectedGeneration) throw new Error(`Cannot adopt stale worker placement for session ${sessionId}`);
			return current;
		},
		listForReconcile() {
			const db = read();
			return executeSqliteQuerySync(db, query(db).selectFrom("worker_session_placements").selectAll().where("state", "not in", ["local", "reclaimed"]).orderBy("updated_at_ms").orderBy("session_id")).rows.map((row) => withWorkspaceResultConflict(fromRow$1(row)));
		},
		list() {
			const db = read();
			return executeSqliteQuerySync(db, query(db).selectFrom("worker_session_placements").selectAll().orderBy("session_id")).rows.map((row) => withWorkspaceResultConflict(fromRow$1(row)));
		},
		listChangeSnapshot() {
			return read().prepare("SELECT session_id, agent_id, session_key, state, transition_generation, updated_at_ms FROM worker_session_placements ORDER BY session_id").all().map((row) => ({
				sessionId: row.session_id,
				agentId: row.agent_id,
				sessionKey: row.session_key,
				state: row.state,
				generation: row.transition_generation,
				updatedAtMs: row.updated_at_ms
			}));
		},
		listByEnvironmentIds(environmentIds) {
			const ids = [...new Set(environmentIds)].filter((environmentId) => typeof environmentId === "string" && environmentId.length > 0);
			const records = [];
			const db = read();
			for (let offset = 0; offset < ids.length; offset += 250) for (const row of executeSqliteQuerySync(db, query(db).selectFrom("worker_session_placements").selectAll().where("environment_id", "in", ids.slice(offset, offset + 250))).rows) records.push(withWorkspaceResultConflict(fromRow$1(row)));
			return records.toSorted((left, right) => left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0);
		}
	};
	attachWorkerTurnExecutionIdentityStore(store, path);
	return store;
}
//#endregion
export { createWorkerSessionPlacementStore as t };
