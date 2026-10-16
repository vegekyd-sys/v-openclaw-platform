import "./src-vebZIeLe.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { t as safeParseJson } from "./json-coercion-ighRFv8Y.js";
import "./utils-D3A1hGii.js";
import { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { D as tableExists, k as tableHasColumns, n as closeOpenClawStateDatabase } from "./openclaw-state-db-cache-AunrvrzG.js";
import { n as withExistingOpenClawStateDatabaseReadOnly } from "./openclaw-state-db-readonly-C7txILW9.js";
import { n as assertSqliteTableIntegrity } from "./sqlite-integrity-BBPyeEpy.js";
import { i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction, wt as normalizeSqliteNumber } from "./openclaw-state-db-Bh3Bq87y.js";
import { c as normalizeDeliveryContext } from "./delivery-context.shared-DlcU69m_.js";
import { r as executionOwnerBindingFromAdmission } from "./execution-owner-binding-BlIkuQuA.js";
import { i as pruneOrphanedExecutionOwnerLifecycleMetadata, n as bindExecutionOwnerLifecycleMetadata, r as deleteExecutionOwnerLifecycleMetadata } from "./execution-owner-lifecycle-binding-store-DBsWEIdy.js";
import { a as parseTaskDeliveryStatus, c as parseTaskScopeKind, i as parseOptionalTaskTerminalOutcome, l as parseTaskStatus, o as parseTaskNotifyPolicy, s as parseTaskRuntime } from "./task-registry.types-73FJYVhP.js";
//#region src/tasks/task-registry.sqlite.shared.ts
function parseSqliteJsonValue(raw) {
	if (!raw?.trim()) return;
	return safeParseJson(raw);
}
function parseDeliveryContextJson(raw) {
	const parsed = parseSqliteJsonValue(raw);
	if (!isRecord(parsed)) return;
	return normalizeDeliveryContext({
		channel: typeof parsed.channel === "string" ? parsed.channel : void 0,
		to: typeof parsed.to === "string" ? parsed.to : void 0,
		accountId: typeof parsed.accountId === "string" ? parsed.accountId : void 0,
		threadId: typeof parsed.threadId === "string" || typeof parsed.threadId === "number" ? parsed.threadId : void 0
	});
}
//#endregion
//#region src/tasks/task-registry.store.sqlite.ts
const TASK_RUN_SELECT_COLUMNS = [
	"task_id",
	"runtime",
	"task_kind",
	"source_id",
	"requester_session_key",
	"owner_key",
	"scope_kind",
	"child_session_key",
	"parent_flow_id",
	"parent_task_id",
	"agent_id",
	"requester_agent_id",
	"run_id",
	"label",
	"task",
	"status",
	"delivery_status",
	"notify_policy",
	"created_at",
	"started_at",
	"ended_at",
	"last_event_at",
	"cleanup_after",
	"tool_use_count",
	"last_tool_name",
	"error",
	"progress_summary",
	"terminal_summary",
	"terminal_outcome",
	"detail_json"
];
const TASK_DELIVERY_STATE_SELECT_COLUMNS = [
	"task_id",
	"requester_origin_json",
	"last_notified_event_at"
];
let cachedDatabase = null;
function serializeJson(value) {
	return value === void 0 ? null : JSON.stringify(value) ?? null;
}
function rowToTaskRecord(row) {
	const startedAt = normalizeSqliteNumber(row.started_at);
	const endedAt = normalizeSqliteNumber(row.ended_at);
	const lastEventAt = normalizeSqliteNumber(row.last_event_at);
	const cleanupAfter = normalizeSqliteNumber(row.cleanup_after);
	const toolUseCount = normalizeSqliteNumber(row.tool_use_count);
	const scopeKind = parseTaskScopeKind(row.scope_kind);
	const terminalOutcome = parseOptionalTaskTerminalOutcome(row.terminal_outcome);
	const detail = parseSqliteJsonValue(row.detail_json);
	const requesterSessionKey = scopeKind === "system" ? "" : row.requester_session_key?.trim() || row.owner_key;
	return {
		taskId: row.task_id,
		runtime: parseTaskRuntime(row.runtime),
		...row.task_kind ? { taskKind: row.task_kind } : {},
		...row.source_id ? { sourceId: row.source_id } : {},
		requesterSessionKey,
		ownerKey: row.owner_key,
		scopeKind,
		...row.child_session_key ? { childSessionKey: row.child_session_key } : {},
		...row.parent_flow_id ? { parentFlowId: row.parent_flow_id } : {},
		...row.parent_task_id ? { parentTaskId: row.parent_task_id } : {},
		...row.agent_id ? { agentId: row.agent_id } : {},
		...row.requester_agent_id ? { requesterAgentId: row.requester_agent_id } : {},
		...row.run_id ? { runId: row.run_id } : {},
		...row.label ? { label: row.label } : {},
		task: row.task,
		status: parseTaskStatus(row.status),
		deliveryStatus: parseTaskDeliveryStatus(row.delivery_status),
		notifyPolicy: parseTaskNotifyPolicy(row.notify_policy),
		createdAt: normalizeSqliteNumber(row.created_at) ?? 0,
		...startedAt != null ? { startedAt } : {},
		...endedAt != null ? { endedAt } : {},
		...lastEventAt != null ? { lastEventAt } : {},
		...cleanupAfter != null ? { cleanupAfter } : {},
		...toolUseCount != null ? { toolUseCount } : {},
		...row.last_tool_name ? { lastToolName: row.last_tool_name } : {},
		...row.error ? { error: row.error } : {},
		...row.progress_summary ? { progressSummary: row.progress_summary } : {},
		...row.terminal_summary !== null ? { terminalSummary: row.terminal_summary } : {},
		...terminalOutcome ? { terminalOutcome } : {},
		...detail !== void 0 ? { detail } : {}
	};
}
function rowToTaskDeliveryState(row) {
	const requesterOrigin = parseDeliveryContextJson(row.requester_origin_json);
	const lastNotifiedEventAt = normalizeSqliteNumber(row.last_notified_event_at);
	return {
		taskId: row.task_id,
		...requesterOrigin ? { requesterOrigin } : {},
		...lastNotifiedEventAt != null ? { lastNotifiedEventAt } : {}
	};
}
/** Canonically serializes a task before an outer transaction acquires the write lock. */
function bindTaskRecord(record) {
	return {
		task_id: record.taskId,
		runtime: record.runtime,
		task_kind: record.taskKind ?? null,
		source_id: record.sourceId ?? null,
		requester_session_key: record.scopeKind === "system" ? "" : record.requesterSessionKey,
		owner_key: record.ownerKey,
		scope_kind: record.scopeKind,
		child_session_key: record.childSessionKey ?? null,
		parent_flow_id: record.parentFlowId ?? null,
		parent_task_id: record.parentTaskId ?? null,
		agent_id: record.agentId ?? null,
		requester_agent_id: record.requesterAgentId ?? null,
		run_id: record.runId ?? null,
		label: record.label ?? null,
		task: record.task,
		status: record.status,
		delivery_status: record.deliveryStatus,
		notify_policy: record.notifyPolicy,
		created_at: record.createdAt,
		started_at: record.startedAt ?? null,
		ended_at: record.endedAt ?? null,
		last_event_at: record.lastEventAt ?? null,
		cleanup_after: record.cleanupAfter ?? null,
		tool_use_count: record.toolUseCount ?? null,
		last_tool_name: record.lastToolName ?? null,
		error: record.error ?? null,
		progress_summary: record.progressSummary ?? null,
		terminal_summary: record.terminalSummary ?? null,
		terminal_outcome: record.terminalOutcome ?? null,
		detail_json: serializeJson(record.detail)
	};
}
function bindTaskDeliveryState(state) {
	return {
		task_id: state.taskId,
		requester_origin_json: serializeJson(state.requesterOrigin),
		last_notified_event_at: state.lastNotifiedEventAt ?? null
	};
}
function getTaskRegistryKysely(db) {
	return getNodeSqliteKysely(db);
}
function pruneRowsNotInSnapshot(params) {
	params.db.exec(`CREATE TEMP TABLE IF NOT EXISTS ${params.tempTableName} (id TEXT PRIMARY KEY)`);
	params.db.exec(`DELETE FROM ${params.tempTableName}`);
	const insert = params.db.prepare(`INSERT OR IGNORE INTO ${params.tempTableName} (id) VALUES (?)`);
	for (const id of params.ids) insert.run(id);
	params.db.exec(`
    DELETE FROM ${params.tableName}
    WHERE NOT EXISTS (
      SELECT 1 FROM ${params.tempTableName}
      WHERE ${params.tempTableName}.id = ${params.tableName}.${params.columnName}
    )
  `);
	params.db.exec(`DELETE FROM ${params.tempTableName}`);
}
function selectTaskRows(db) {
	const query = getTaskRegistryKysely(db).selectFrom("task_runs").select(TASK_RUN_SELECT_COLUMNS).orderBy("created_at", "asc").orderBy("task_id", "asc");
	return executeSqliteQuerySync(db, query).rows;
}
function selectTaskRowsByOwnerKey(db, ownerKey) {
	const selectColumns = TASK_RUN_SELECT_COLUMNS.join(", ");
	return db.prepare(`SELECT ${selectColumns}
       FROM task_runs NOT INDEXED
       WHERE owner_key = ?
       ORDER BY created_at ASC, task_id ASC`).all(ownerKey);
}
function selectTaskRowsByRuntimeSourceId(db, runtime, sourceId) {
	let query = getTaskRegistryKysely(db).selectFrom("task_runs").select(TASK_RUN_SELECT_COLUMNS).where("runtime", "=", runtime);
	if (sourceId !== void 0) query = query.where("source_id", "=", sourceId);
	return executeSqliteQuerySync(db, query.orderBy("created_at", "asc").orderBy("task_id", "asc")).rows;
}
/** Reads task records from the caller's shared-state transaction. */
function listTaskRecordsByRuntimeSourceIdInDatabase(db, runtime, sourceId) {
	return selectTaskRowsByRuntimeSourceId(db, runtime, sourceId).map(rowToTaskRecord);
}
function readTaskRecord(db, taskId) {
	const row = executeSqliteQueryTakeFirstSync(db, getTaskRegistryKysely(db).selectFrom("task_runs").select(TASK_RUN_SELECT_COLUMNS).where("task_id", "=", taskId));
	return row ? rowToTaskRecord(row) : void 0;
}
function selectTaskDeliveryStateRows(db) {
	const query = getTaskRegistryKysely(db).selectFrom("task_delivery_state").select(TASK_DELIVERY_STATE_SELECT_COLUMNS).orderBy("task_id", "asc");
	return executeSqliteQuerySync(db, query).rows;
}
/** Upserts a prebound task on the exact supplied shared-state handle. */
function upsertTaskRunRowInDatabase(database, row) {
	const { db } = database;
	const updates = {
		...row,
		task_id: void 0
	};
	executeSqliteQuerySync(db, getTaskRegistryKysely(db).insertInto("task_runs").values(row).onConflict((conflict) => conflict.column("task_id").doUpdateSet(updates)));
}
function replaceTaskDeliveryStateRow(db, row) {
	executeSqliteQuerySync(db, getTaskRegistryKysely(db).insertInto("task_delivery_state").values(row).onConflict((conflict) => conflict.column("task_id").doUpdateSet({
		requester_origin_json: (eb) => eb.ref("excluded.requester_origin_json"),
		last_notified_event_at: (eb) => eb.ref("excluded.last_notified_event_at")
	})));
}
function deleteTaskRowsWithDeliveryState(db, taskId) {
	const kysely = getTaskRegistryKysely(db);
	executeSqliteQuerySync(db, kysely.deleteFrom("task_delivery_state").where("task_id", "=", taskId));
	executeSqliteQuerySync(db, kysely.deleteFrom("task_runs").where("task_id", "=", taskId));
	deleteExecutionOwnerLifecycleMetadata({
		db,
		ownerKind: "task",
		ownerIds: [taskId]
	});
}
function openTaskRegistryDatabase() {
	const database = openOpenClawStateDatabase();
	const pathname = database.path;
	if (cachedDatabase && cachedDatabase.path === pathname && cachedDatabase.db.isOpen) return cachedDatabase;
	if (cachedDatabase && !cachedDatabase.db.isOpen) cachedDatabase = null;
	cachedDatabase = {
		db: database.db,
		path: pathname
	};
	return cachedDatabase;
}
function withWriteTransaction(write) {
	openTaskRegistryDatabase();
	runOpenClawStateWriteTransaction((database) => write(database));
}
function readTaskRegistrySnapshot({ db, path }) {
	return runSqliteDeferredTransactionSync(db, () => {
		assertSqliteTableIntegrity(db, path, "task_runs");
		assertSqliteTableIntegrity(db, path, "task_delivery_state");
		const taskRows = selectTaskRows(db);
		const deliveryRows = selectTaskDeliveryStateRows(db);
		return {
			tasks: new Map(taskRows.map((row) => [row.task_id, rowToTaskRecord(row)])),
			deliveryStates: new Map(deliveryRows.map((row) => [row.task_id, rowToTaskDeliveryState(row)]))
		};
	});
}
function loadTaskRegistryStateFromSqlite() {
	return readTaskRegistrySnapshot(openTaskRegistryDatabase());
}
/** Loads task records without creating or migrating shared state. */
function loadTaskRegistryStateFromSqliteReadOnly() {
	return loadTaskRegistryStateFromSqliteReadOnlyResult().snapshot;
}
/** Reads task state only when the existing database already has the canonical task shape. */
function loadTaskRegistryStateFromSqliteReadOnlyResult() {
	return withExistingOpenClawStateDatabaseReadOnly(({ db, path }) => {
		return tableExists(db, "task_runs") && tableExists(db, "task_delivery_state") && tableHasColumns(db, "task_runs", TASK_RUN_SELECT_COLUMNS) && tableHasColumns(db, "task_delivery_state", TASK_DELIVERY_STATE_SELECT_COLUMNS) ? {
			state: "ready",
			snapshot: readTaskRegistrySnapshot({
				db,
				path
			})
		} : {
			state: "migration-required",
			snapshot: {
				tasks: /* @__PURE__ */ new Map(),
				deliveryStates: /* @__PURE__ */ new Map()
			}
		};
	}) ?? {
		state: "ready",
		snapshot: {
			tasks: /* @__PURE__ */ new Map(),
			deliveryStates: /* @__PURE__ */ new Map()
		}
	};
}
function listTaskRegistryRecordsByOwnerKeyFromSqlite(ownerKey) {
	const key = ownerKey.trim();
	if (!key) return [];
	const { db } = openTaskRegistryDatabase();
	return selectTaskRowsByOwnerKey(db, key).map(rowToTaskRecord);
}
/** Reads task rows for one runtime/source without restoring the process registry snapshot. */
function listTaskRegistryRecordsByRuntimeSourceIdFromSqlite(params) {
	const sourceId = params.sourceId?.trim();
	if (params.sourceId !== void 0 && !sourceId) return [];
	return withExistingOpenClawStateDatabaseReadOnly(({ db }) => selectTaskRowsByRuntimeSourceId(db, params.runtime, sourceId).map(rowToTaskRecord)) ?? [];
}
function saveTaskRegistryStateToSqlite(snapshot) {
	withWriteTransaction((database) => {
		const { db } = database;
		const kysely = getTaskRegistryKysely(db);
		const taskIds = [...snapshot.tasks.keys()];
		if (taskIds.length === 0) {
			executeSqliteQuerySync(db, kysely.deleteFrom("task_delivery_state"));
			executeSqliteQuerySync(db, kysely.deleteFrom("task_runs"));
			pruneOrphanedExecutionOwnerLifecycleMetadata(db, "task");
			return;
		}
		pruneRowsNotInSnapshot({
			db,
			tableName: "task_runs",
			columnName: "task_id",
			tempTableName: "openclaw_live_task_run_ids",
			ids: taskIds
		});
		const deliveryTaskIds = [...snapshot.deliveryStates.keys()];
		if (deliveryTaskIds.length === 0) executeSqliteQuerySync(db, kysely.deleteFrom("task_delivery_state"));
		else pruneRowsNotInSnapshot({
			db,
			tableName: "task_delivery_state",
			columnName: "task_id",
			tempTableName: "openclaw_live_task_delivery_ids",
			ids: deliveryTaskIds
		});
		for (const task of snapshot.tasks.values()) upsertTaskRunRowInDatabase(database, bindTaskRecord(task));
		for (const state of snapshot.deliveryStates.values()) replaceTaskDeliveryStateRow(db, bindTaskDeliveryState(state));
		pruneOrphanedExecutionOwnerLifecycleMetadata(db, "task");
	});
}
function upsertTaskRegistryRecordToSqlite(task) {
	withWriteTransaction((database) => {
		upsertTaskRunRowInDatabase(database, bindTaskRecord(task));
	});
}
/** Binds only the exact task row selected before admission; runId is never a join key. */
function bindTaskRunExecution(params) {
	const binding = executionOwnerBindingFromAdmission(params.admitted);
	if (!binding) return "disabled";
	return runOpenClawStateWriteTransaction(({ db }) => {
		const kysely = getTaskRegistryKysely(db);
		const current = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("task_runs").select([
			"task_id",
			"status",
			"ended_at"
		]).where("task_id", "=", params.taskId));
		const status = current ? parseTaskStatus(current.status) : void 0;
		if (!current || status !== "queued" && status !== "running" || current.ended_at !== null) return "missing";
		return bindExecutionOwnerLifecycleMetadata({
			db,
			ownerKind: "task",
			ownerId: current.task_id,
			binding
		});
	}, params.options, { operationLabel: "task.run.execution-binding" });
}
function upsertTaskWithDeliveryStateToSqlite(params) {
	withWriteTransaction((database) => {
		const { db } = database;
		upsertTaskRunRowInDatabase(database, bindTaskRecord(params.task));
		if (params.deliveryState) replaceTaskDeliveryStateRow(db, bindTaskDeliveryState(params.deliveryState));
		else executeSqliteQuerySync(db, getTaskRegistryKysely(db).deleteFrom("task_delivery_state").where("task_id", "=", params.task.taskId));
	});
}
function deleteTaskRegistryRecordFromSqlite(taskId) {
	withWriteTransaction(({ db }) => {
		deleteTaskRowsWithDeliveryState(db, taskId);
	});
}
function deleteTaskAndDeliveryStateFromSqlite(taskId) {
	withWriteTransaction(({ db }) => {
		deleteTaskRowsWithDeliveryState(db, taskId);
	});
}
function upsertTaskDeliveryStateToSqlite(state) {
	withWriteTransaction(({ db }) => {
		replaceTaskDeliveryStateRow(db, bindTaskDeliveryState(state));
	});
}
function deleteTaskDeliveryStateFromSqlite(taskId) {
	withWriteTransaction(({ db }) => {
		executeSqliteQuerySync(db, getTaskRegistryKysely(db).deleteFrom("task_delivery_state").where("task_id", "=", taskId));
	});
}
function closeTaskRegistryDatabase() {
	cachedDatabase = null;
	closeOpenClawStateDatabase();
}
//#endregion
export { upsertTaskRunRowInDatabase as _, deleteTaskDeliveryStateFromSqlite as a, parseSqliteJsonValue as b, listTaskRegistryRecordsByOwnerKeyFromSqlite as c, loadTaskRegistryStateFromSqliteReadOnly as d, loadTaskRegistryStateFromSqliteReadOnlyResult as f, upsertTaskRegistryRecordToSqlite as g, upsertTaskDeliveryStateToSqlite as h, deleteTaskAndDeliveryStateFromSqlite as i, listTaskRegistryRecordsByRuntimeSourceIdFromSqlite as l, saveTaskRegistryStateToSqlite as m, bindTaskRunExecution as n, deleteTaskRegistryRecordFromSqlite as o, readTaskRecord as p, closeTaskRegistryDatabase as r, listTaskRecordsByRuntimeSourceIdInDatabase as s, bindTaskRecord as t, loadTaskRegistryStateFromSqlite as u, upsertTaskWithDeliveryStateToSqlite as v, parseDeliveryContextJson as y };

// v-task-registry-bridge-store-v1
const vTaskRegistryBridgeStatements = new WeakMap();
const vTaskRegistryBridgeSubagentStatements = new WeakMap();
(globalThis[Symbol.for("openclaw.v.taskRegistryBridge")] ??= { listeners: new Set() }).listActivePersisted = (ownerKey) => {
	const key = typeof ownerKey === "string" ? ownerKey.trim() : "";
	if (!key) return [];
	const { db } = openTaskRegistryDatabase();
	let statement = vTaskRegistryBridgeStatements.get(db);
	if (!statement) {
		statement = db.prepare(`SELECT task_id, runtime, task_kind, child_session_key, label, status, created_at, last_event_at
       FROM task_runs
       WHERE owner_key = ? AND status NOT IN ('succeeded', 'failed', 'timed_out', 'cancelled', 'lost')`);
		vTaskRegistryBridgeStatements.set(db, statement);
	}
	return statement.all(key).map((row) => ({
		taskId: row.task_id,
		runtime: row.runtime,
		taskKind: row.task_kind ?? void 0,
		childSessionKey: row.child_session_key ?? void 0,
		label: row.label ?? void 0,
		status: row.status,
		createdAt: row.created_at,
		lastEventAt: row.last_event_at ?? void 0
	}));
};
// Unfinished subagent runs this session requested, from the last day. A run
// past its own timeout by more than 10 minutes is treated as abandoned.
(globalThis[Symbol.for("openclaw.v.taskRegistryBridge")]).listActiveSubagentsPersisted = (requesterKey) => {
	const key = typeof requesterKey === "string" ? requesterKey.trim() : "";
	if (!key) return [];
	const { db } = openTaskRegistryDatabase();
	let statement = vTaskRegistryBridgeSubagentStatements.get(db);
	if (!statement) {
		statement = db.prepare(`SELECT run_id, child_session_key, created_at,
         json_extract(payload_json, '$.execution.status') AS execution_status,
         json_extract(payload_json, '$.execution.startedAt') AS started_at,
         json_extract(payload_json, '$.execution.endedAt') AS execution_ended_at,
         json_extract(payload_json, '$.endedAt') AS ended_at,
         json_extract(payload_json, '$.runTimeoutSeconds') AS timeout_seconds,
         json_extract(payload_json, '$.label') AS label
       FROM subagent_runs
       WHERE requester_session_key = ? AND created_at >= ?`);
		vTaskRegistryBridgeSubagentStatements.set(db, statement);
	}
	const now = Date.now();
	return statement.all(key, now - 864e5).filter((row) => {
		if (row.execution_status === "terminal" || row.execution_ended_at || row.ended_at) return false;
		const timeoutMs = Number(row.timeout_seconds) > 0 ? Number(row.timeout_seconds) * 1e3 : 21600000;
		return now - Number(row.started_at ?? row.created_at) <= timeoutMs + 6e5;
	}).map((row) => ({
		taskId: "subagent-run:" + row.run_id,
		runId: row.run_id,
		runtime: "subagent",
		childSessionKey: row.child_session_key,
		label: row.label ?? void 0,
		status: "running",
		createdAt: row.created_at
	}));
};
