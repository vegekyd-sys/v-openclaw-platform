import {preReadState} from "./db91-state-read-ahead.mjs";
import { d as asPositiveSafeInteger, f as asSafeIntegerInRange, s as asFiniteNumber, t as MAX_DATE_TIMESTAMP_MS } from "./number-coercion-CLj0HTDM.js";
import "./src-vebZIeLe.js";
import { c as isRecord, r as asNullableRecord } from "./record-coerce-DItp3I4t.js";
import { n as safeParseJsonRecord, t as safeParseJson } from "./json-coercion-ighRFv8Y.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as sliceUtf16Safe, r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { t as hasErrnoCode } from "./errno-CkbDOfLk.js";
import { p as redactSensitiveText } from "./redact-Df68iObN.js";
import { t as escapeRegExp } from "./regexp-BZyMFTlj.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { At as boolean, Lt as custom, Rn as string, Tn as object, Zn as unknown, dn as literal, fn as looseObject, wn as number, yt as _enum } from "./schemas-zxit8y5H.js";
import { c as isSqliteLockError, d as normalizeSqliteNonNegativeInteger, f as readSqliteBusyTimeout, h as clearNodeSqliteKyselyCacheForDatabase, l as runSqliteDeferredTransactionSync, m as setSqliteBusyTimeout, p as runWithSqliteBusyTimeout, t as openNodeSqliteDatabase, u as runSqliteImmediateTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync, t as enableNodeSqliteKyselyStatementCache } from "./kysely-sync-DKYGT267.js";
import { i as prepareSqliteReadOnlyLocationSync, n as prepareSqliteReadOnlyLocation } from "./sqlite-readonly-location-BvtpsFvn.js";
import { i as LAZY_ADDITIVE_STATE_TABLES, o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";
import { t as VERSION } from "./version-CAQhhGAu.js";
import { a as readSqliteUserVersion, i as isSqliteSchemaVersionError } from "./sqlite-user-version-DkmzAA6V.js";
import { A as tablePrimaryKeyColumns, C as OPENCLAW_STATE_SCHEMA_SQL, D as tableExists, E as ensureColumn, F as createSqliteTableContractReader, I as getCanonicalSqliteNamedIndexContracts, L as getCanonicalSqliteTableNames, M as assertSqliteSchemaTablesPresent, N as collectSqliteNamedIndexContract, O as tableHasColumn, P as collectSqliteSchemaIssues, R as quoteSqliteIdentifier, S as isOpenClawStateStartupRepairableSchemaIssue, T as CLAW_STARTUP_ADDITIVE_STATE_COLUMN_DEFINITIONS, _ as resolveDatabasePath, b as getOpenClawStateRuntimeSchema, d as assertSupportedSchemaVersion, g as openClawStateMigrationAssertions, h as migrateCronCreatorNamespaces, j as assertSqliteSchemaContains, l as assertOpenClawStateDatabaseForMaintenance, m as migrateConversationBindingTargets, o as openClawStateDatabaseCache, p as markCurrentStateSchemaVersion, r as closeOpenClawStateDatabaseByPath, s as recordOpenClawStateDatabaseOpenFailure, t as clearOpenClawStateDatabaseOpenFailure, w as CLAW_FIRST_USE_ADDITIVE_STATE_COLUMN_DEFINITIONS, y as STATE_PERSISTENT_SCHEMA_COMPATIBILITY, z as clearOpenClawDatabaseQuarantine } from "./openclaw-state-db-cache-AunrvrzG.js";
import { t as applyPrivateModeSync } from "./private-mode-B6dWGRb2.js";
import { a as resolveOpenClawStateSqliteDir, i as resolveOpenClawStateDirForDatabasePath, n as resolveOpenClawAgentDatabaseStoredPath, o as resolveOpenClawStateSqlitePath, s as warnAgentPathMigration, t as describeAgentPathMigration } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { n as withExistingOpenClawStateDatabaseReadOnly } from "./openclaw-state-db-readonly-C7txILW9.js";
import { c as createSqliteLifecycleAggregateError, o as withStateSchemaFence, r as acquireStateDatabaseCoordinator, t as StateDatabaseCoordinatorContentionError, u as runWithSqliteCoordinator } from "./state-database-coordinator-DKD8Uulb.js";
import { i as isTerminalSqliteIntegrityError, n as assertSqliteTableIntegrity, r as confirmSqliteFileIntegrity, t as assertSqliteIntegrity } from "./sqlite-integrity-BBPyeEpy.js";
import { n as migrateSqliteSchemaToStrictInTransaction } from "./sqlite-strict-DnGe0ZLD.js";
import { t as FAILOVER_REASONS } from "./failover-reasons-Mjd0tFtT.js";
import { t as OpenClawStateDatabaseSchemaMigrationRequiredError } from "./openclaw-state-db-schema-migration-required-BAOXvPBh.js";
import { n as configureSqlitePreSchemaPragmas, t as configureSqliteConnectionPragmas } from "./sqlite-wal-B8YRh3_y.js";
import { t as createDedupeCache } from "./dedupe-gst1CUro.js";
import { f as stripInternalRuntimeContext } from "./internal-runtime-context-DWUZUDW2.js";
import { n as MESSAGE_TOOL_DELIVERY_HINTS } from "./message-tool-delivery-hints-8OSBEg_c.js";
import { n as SILENT_REPLY_TOKEN, o as isSilentReplyText, t as HEARTBEAT_TOKEN } from "./tokens-DbeAFqg7.js";
import { t as buildApprovalResolutionRef } from "./approval-resolution-ref-BMBlVd2b.js";
import { o as isGatewayExternallySupervised } from "./gateway-supervision-CWUKIQty.js";
import fs, { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
//#region src/infra/sqlite-index-schema.ts
const SQLITE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/**
* Verify the whole file once, then use table scans only to locate repairable
* index damage. Healthy opens must not multiply integrity work by table count.
*/
function verifyAndRepairCanonicalSqliteIndexes(db, databaseLabel, schemaSql, options = {}) {
	let integrityFailure;
	try {
		assertSqliteIntegrity(db, databaseLabel);
	} catch (error) {
		if (!(error instanceof Error) || !isTerminalSqliteIntegrityError(error)) throw error;
		integrityFailure = error;
	}
	const repairedIndexes = repairCanonicalSqliteIndexes(db, databaseLabel, schemaSql, {
		...options,
		verifyPhysicalIntegrity: integrityFailure !== void 0
	});
	if (integrityFailure && repairedIndexes.length === 0) throw integrityFailure;
	return repairedIndexes;
}
/**
* Restore every named index when SQLite's IF NOT EXISTS semantics preserve a
* same-name definition or b-tree that no longer matches the committed schema.
*/
function repairCanonicalSqliteIndexes(db, databaseLabel, schemaSql, options = {}) {
	const indexes = getCanonicalSqliteNamedIndexContracts(schemaSql);
	const indexesByTable = /* @__PURE__ */ new Map();
	const integrityFailuresByTable = /* @__PURE__ */ new Map();
	const repairIndexes = /* @__PURE__ */ new Set();
	for (const index of indexes) {
		assertSqliteIdentifier(index.name);
		assertSqliteIdentifier(index.tableName);
		if (!db.prepare("SELECT 1 FROM main.sqlite_schema WHERE type = 'table' AND name = ?").get(index.tableName)) continue;
		const tableIndexes = indexesByTable.get(index.tableName) ?? [];
		tableIndexes.push(index);
		indexesByTable.set(index.tableName, tableIndexes);
		if (!isEqual(collectSqliteNamedIndexContract(db, index.name), index.fingerprint)) repairIndexes.add(index);
	}
	assertNoUnexpectedUniqueIndexes(db, databaseLabel, schemaSql, indexesByTable);
	if (options.verifyPhysicalIntegrity !== false) for (const [tableName, tableIndexes] of indexesByTable) try {
		assertSqliteTableIntegrity(db, databaseLabel, tableName);
	} catch (error) {
		if (error instanceof Error) integrityFailuresByTable.set(tableName, error);
		for (const index of tableIndexes) repairIndexes.add(index);
	}
	if (repairIndexes.size === 0) return [];
	const savepoint = "repair_canonical_indexes";
	let activeIndex;
	db.exec(`SAVEPOINT ${savepoint};`);
	try {
		for (const index of repairIndexes) {
			activeIndex = index;
			const probeName = findUnusedProbeIndexName(db, index.name);
			try {
				db.exec(createIndexSql(index, probeName, true));
			} catch (error) {
				if (options.allowMissingColumns && isMissingColumnError(error)) {
					repairIndexes.delete(index);
					continue;
				}
				throw error;
			}
			db.exec(`DROP INDEX IF EXISTS main.${index.name};`);
			db.exec(createIndexSql(index, index.name, true));
			db.exec(`DROP INDEX main.${probeName};`);
		}
		if (repairIndexes.size === 0) {
			db.exec(`RELEASE SAVEPOINT ${savepoint};`);
			return [];
		}
		for (const tableName of indexesByTable.keys()) assertSqliteTableIntegrity(db, databaseLabel, tableName);
		assertSqliteIntegrity(db, databaseLabel);
		options.validateAfterRepair?.();
		db.exec(`RELEASE SAVEPOINT ${savepoint};`);
	} catch (error) {
		try {
			db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
		} finally {
			db.exec(`RELEASE SAVEPOINT ${savepoint};`);
		}
		if (error instanceof Error && isTerminalSqliteIntegrityError(error)) throw error;
		const tableIntegrityFailure = activeIndex ? integrityFailuresByTable.get(activeIndex.tableName) : void 0;
		if (tableIntegrityFailure && isTerminalSqliteIntegrityError(tableIntegrityFailure)) throw tableIntegrityFailure;
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`SQLite canonical index ${activeIndex?.name ?? "repair"} failed for ${databaseLabel}: ${detail}`, { cause: error });
	}
	return [...repairIndexes].map((index) => index.name).toSorted();
}
function assertNoUnexpectedUniqueIndexes(db, databaseLabel, schemaSql, indexesByTable) {
	for (const tableName of getCanonicalSqliteTableNames(schemaSql)) {
		assertSqliteIdentifier(tableName);
		if (!db.prepare("SELECT 1 FROM main.sqlite_schema WHERE type = 'table' AND name = ?").get(tableName)) continue;
		const canonicalIndexNames = new Set((indexesByTable.get(tableName) ?? []).map((index) => index.name));
		const unexpected = db.prepare(`PRAGMA main.index_list(${tableName})`).all().find((index) => index.unique === 1 && index.origin === "c" && !canonicalIndexNames.has(index.name));
		if (unexpected) throw new Error(`SQLite schema is incomplete or noncanonical for ${databaseLabel}: unexpected unique index ${unexpected.name}`);
	}
}
function createIndexSql(index, name, qualifyMain) {
	assertSqliteIdentifier(name);
	return `${index.unique ? "CREATE UNIQUE INDEX" : "CREATE INDEX"} ${qualifyMain ? `main.${name}` : name} ${index.definition};`;
}
function findUnusedProbeIndexName(db, canonicalName) {
	const prefix = `openclaw_probe_${canonicalName}`;
	for (let suffix = 0; suffix < 100; suffix += 1) {
		const candidate = suffix === 0 ? prefix : `${prefix}_${suffix}`;
		if (!db.prepare("SELECT 1 AS found FROM main.sqlite_schema WHERE name = ?").get(candidate)) return candidate;
	}
	throw new Error(`could not allocate a probe index name for ${canonicalName}`);
}
function assertSqliteIdentifier(identifier) {
	if (!SQLITE_IDENTIFIER_PATTERN.test(identifier)) throw new Error(`invalid SQLite identifier: ${identifier}`);
}
function isMissingColumnError(error) {
	return error instanceof Error && error.code === "ERR_SQLITE_ERROR" && /^no such column:/iu.test(error.message);
}
function isEqual(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}
//#endregion
//#region src/infra/sqlite-post-commit.ts
const pendingPublications = /* @__PURE__ */ new WeakMap();
/** Publications are non-throwing observers, never part of a durable transaction's result. */
function deferSqlitePostCommitPublication(db, publish) {
	const pending = pendingPublications.get(db);
	if (!pending) return false;
	pending.push(publish);
	return true;
}
/** Nested rollback discards its observers; successful savepoints wait for the outer commit. */
function withSqlitePostCommitPublications(db, transaction) {
	const nested = db.isTransaction;
	const pending = nested ? pendingPublications.get(db) : [];
	const start = pending?.length ?? 0;
	if (!nested && pending) pendingPublications.set(db, pending);
	let result;
	try {
		result = transaction();
	} catch (error) {
		pending?.splice(start);
		throw error;
	} finally {
		if (!nested) pendingPublications.delete(db);
	}
	if (!nested) for (const publish of pending ?? []) publish();
	return result;
}
//#endregion
//#region src/cron/completion-status.ts
/** Resolves authored completion from an admitted job, or legacy completion from stored facts. */
function resolveCronCompletionStatus(params) {
	if (params.status === "error" || params.status === "skipped") return "failed";
	if (params.status !== "ok") return "unknown";
	if (params.requiredDelivery === void 0) return params.delivered === true || params.deliveryStatus === "delivered" || params.deliveryStatus === "not-requested" ? "succeeded" : "unknown";
	if (!params.requiredDelivery || params.deliveryStatus === "delivered" || params.deliveryStatus === "not-delivered" && params.deliverySuppressionReason !== void 0) return "succeeded";
	return params.deliveryStatus === "not-delivered" ? "failed" : "unknown";
}
/** Resolves completion from the immutable delivery contract admitted for this run. */
function resolveAdmittedCronCompletionStatus(job, status, deliveryStatus, deliverySuppressionReason) {
	return resolveCronCompletionStatus({
		status,
		deliveryStatus,
		deliverySuppressionReason,
		requiredDelivery: job.delivery?.bestEffort !== true && deliveryStatus !== "not-requested"
	});
}
//#endregion
//#region src/cron/execution-error-constants.ts
/** Stable cron execution error text shared by runtime and ledger codecs. */
const CRON_JOB_EXECUTION_TIMEOUT_ERROR = "cron: job execution timed out";
const CRON_SETUP_TIMEOUT_ERROR = "cron: isolated agent setup timed out before runner start";
const CRON_PRE_EXECUTION_TIMEOUT_ERROR = "cron: isolated agent run stalled before execution start";
const CRON_TIMEOUT_ERROR_PREFIXES = [
	CRON_JOB_EXECUTION_TIMEOUT_ERROR,
	CRON_SETUP_TIMEOUT_ERROR,
	CRON_PRE_EXECUTION_TIMEOUT_ERROR
];
/** Recognizes watchdog timeouts without loading agent or execution-phase runtime. */
function isCronTimeoutErrorText(error) {
	return typeof error === "string" && CRON_TIMEOUT_ERROR_PREFIXES.some((prefix) => error === prefix || error.startsWith(`${prefix} `));
}
//#endregion
//#region src/cron/run-diagnostics-normalize.ts
/** Dependency-light normalization helpers for stored cron run diagnostics. */
const MAX_ENTRIES = 10;
const MAX_ENTRY_CHARS = 1e3;
const MAX_SUMMARY_CHARS = 2e3;
function normalizeSeverity(value) {
	return value === "info" || value === "warn" || value === "error" ? value : "error";
}
function normalizeSource(value) {
	switch (value) {
		case "cron-preflight":
		case "cron-setup":
		case "model-preflight":
		case "agent-run":
		case "tool":
		case "exec":
		case "delivery": return value;
		default: return "agent-run";
	}
}
function normalizeTimestamp$1(value, nowMs) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : nowMs();
}
function formatUnknownError(error) {
	if (error instanceof Error) return error.message || error.name;
	return String(error);
}
function normalizeDiagnosticToolName(value) {
	if (typeof value !== "string") return;
	return normalizeOptionalString(value);
}
function normalizeExitCode(value) {
	return asFiniteNumber(value) ?? (value === null ? null : void 0);
}
function tailText(value, maxChars) {
	if (value.length <= maxChars) return value;
	return sliceUtf16Safe(value, -maxChars);
}
function normalizeDiagnosticMessage(value, redactText) {
	if (typeof value !== "string") return {};
	const normalized = normalizeOptionalString(value);
	if (!normalized) return {};
	const redacted = redactText(normalized);
	if (redacted.length <= MAX_ENTRY_CHARS) return { message: redacted };
	return {
		message: `${truncateUtf16Safe(redacted, 999)}…`,
		truncated: true
	};
}
function normalizeCronRunDiagnosticSummary(value) {
	const normalized = normalizeOptionalString(value);
	if (!normalized) return;
	if (normalized.length <= MAX_SUMMARY_CHARS) return normalized;
	return `${truncateUtf16Safe(normalized, 1999)}…`;
}
/** Normalizes stored cron diagnostic payloads into bounded entries. */
function normalizeCronRunDiagnosticsCore(value, opts) {
	if (!value || typeof value !== "object") return;
	const record = value;
	const nowMs = opts?.nowMs ?? Date.now;
	const redactText = opts?.redactText ?? ((text) => text);
	const entriesRaw = Array.isArray(record.entries) ? record.entries : [];
	const entries = [];
	for (const item of entriesRaw) {
		if (!item || typeof item !== "object") continue;
		const entry = item;
		const normalized = normalizeDiagnosticMessage(entry.message, redactText);
		if (!normalized.message) continue;
		entries.push({
			ts: normalizeTimestamp$1(entry.ts, nowMs),
			source: normalizeSource(entry.source),
			severity: normalizeSeverity(entry.severity),
			message: normalized.message,
			...typeof entry.toolName === "string" && entry.toolName.trim() ? { toolName: entry.toolName.trim() } : {},
			...typeof entry.exitCode === "number" && Number.isFinite(entry.exitCode) ? { exitCode: entry.exitCode } : entry.exitCode === null ? { exitCode: null } : {},
			...entry.truncated === true || normalized.truncated ? { truncated: true } : {}
		});
		if (entries.length > MAX_ENTRIES) entries.shift();
	}
	const summary = normalizeCronRunDiagnosticSummary(typeof record.summary === "string" ? redactText(record.summary) : void 0);
	if (entries.length === 0 && !summary) return;
	return {
		...summary ? { summary } : {},
		entries
	};
}
//#endregion
//#region src/cron/task-run-detail.ts
/** Read-side cron codec between task-ledger detail and the stable run-history wire shape.
* Deliberately free of agent/runtime imports so history reads stay dependency-light;
* the event->entry write codec lives in task-run-event-codec.ts. */
const CRON_TASK_DETAIL_KIND = "cron-run";
const CRON_FAILOVER_REASONS = new Set(FAILOVER_REASONS);
const cronRunStatusSchema = _enum([
	"ok",
	"error",
	"skipped"
]);
const cronCompletionStatusSchema = _enum([
	"succeeded",
	"failed",
	"unknown"
]);
const cronDeliveryStatusSchema = _enum([
	"delivered",
	"not-delivered",
	"unknown",
	"not-requested"
]);
const optionalCronStringSchema = string().optional().catch(void 0);
const optionalNonBlankCronStringSchema = string().refine((value) => value.trim().length > 0).optional().catch(void 0);
const optionalCronTimestampSchema = unknown().optional().transform((value) => normalizeTimestamp(value));
const optionalCronDurationSchema = unknown().optional().transform((value) => asSafeIntegerInRange(value, { min: 0 }));
const optionalCronTokenCountSchema = unknown().optional().transform((value) => asSafeIntegerInRange(value, { min: 0 }));
const cronUsageSchema = object({
	input_tokens: optionalCronTokenCountSchema,
	output_tokens: optionalCronTokenCountSchema,
	total_tokens: optionalCronTokenCountSchema,
	cache_read_tokens: optionalCronTokenCountSchema,
	cache_write_tokens: optionalCronTokenCountSchema
}).transform((usage) => Object.values(usage).some((tokenCount) => tokenCount !== void 0) ? usage : void 0).optional().catch(void 0);
const cronFailureNotificationDeliverySchema = looseObject({
	status: cronDeliveryStatusSchema,
	delivered: boolean().optional().catch(void 0),
	error: optionalCronStringSchema
}).transform(({ status, delivered, error }) => ({
	status,
	...delivered !== void 0 ? { delivered } : {},
	...error !== void 0 ? { error } : {}
})).optional().catch(void 0);
const cronRunLogEntrySchema = looseObject({
	action: literal("finished"),
	jobId: string().refine((value) => value.trim().length > 0),
	ts: unknown().transform((value) => normalizeTimestamp(value)).pipe(number()),
	status: cronRunStatusSchema.optional().catch(void 0),
	completionStatus: cronCompletionStatusSchema.optional().catch(void 0),
	error: optionalCronStringSchema,
	errorReason: custom((value) => typeof value === "string" && CRON_FAILOVER_REASONS.has(value)).optional().catch(void 0),
	summary: optionalCronStringSchema,
	runId: optionalNonBlankCronStringSchema,
	diagnostics: unknown().optional(),
	runAtMs: optionalCronTimestampSchema,
	durationMs: optionalCronDurationSchema,
	nextRunAtMs: optionalCronTimestampSchema,
	triggerFired: unknown().optional().transform((value) => value === true ? true : void 0),
	model: optionalNonBlankCronStringSchema,
	provider: optionalNonBlankCronStringSchema,
	usage: cronUsageSchema,
	delivered: boolean().optional().catch(void 0),
	deliveryStatus: cronDeliveryStatusSchema.optional().catch(void 0),
	deliveryError: optionalCronStringSchema,
	deliverySuppressionReason: _enum([
		"empty",
		"silent",
		"heartbeat",
		"channel_transform"
	]).optional().catch(void 0),
	failureNotificationDelivery: cronFailureNotificationDeliverySchema,
	delivery: custom(isJsonObject).optional().catch(void 0),
	sessionId: optionalNonBlankCronStringSchema,
	sessionKey: optionalNonBlankCronStringSchema
});
function toJsonValue(value) {
	const serialized = JSON.stringify(value);
	return serialized === void 0 ? void 0 : JSON.parse(serialized);
}
function isJsonObject(value) {
	return isRecord(value);
}
function normalizeTimestamp(value) {
	return asSafeIntegerInRange(value, {
		min: 0,
		max: MAX_DATE_TIMESTAMP_MS
	});
}
function isCronRunStatus(value) {
	return cronRunStatusSchema.safeParse(value).success;
}
function isCronDeliveryStatus(value) {
	return cronDeliveryStatusSchema.safeParse(value).success;
}
/** Parses stored or migrated cron history while preserving the stable wire shape. */
function parseCronRunLogEntryObject(obj, opts) {
	const jobId = normalizeOptionalString(opts?.jobId);
	const parsed = cronRunLogEntrySchema.safeParse(obj);
	if (!parsed.success) return null;
	const entryObj = parsed.data;
	if (jobId && entryObj.jobId !== jobId) return null;
	const entry = {
		ts: entryObj.ts,
		jobId: entryObj.jobId,
		action: "finished",
		status: entryObj.status,
		completionStatus: entryObj.completionStatus ?? resolveCronCompletionStatus({
			status: entryObj.status,
			delivered: entryObj.delivered,
			deliveryStatus: entryObj.deliveryStatus
		}),
		error: entryObj.error,
		errorReason: entryObj.errorReason,
		summary: entryObj.summary,
		runId: entryObj.runId,
		diagnostics: normalizeCronRunDiagnosticsCore(entryObj.diagnostics),
		runAtMs: entryObj.runAtMs,
		durationMs: entryObj.durationMs,
		nextRunAtMs: entryObj.nextRunAtMs,
		triggerFired: entryObj.triggerFired,
		model: entryObj.model,
		provider: entryObj.provider,
		usage: entryObj.usage
	};
	if (entryObj.delivered !== void 0) entry.delivered = entryObj.delivered;
	if (entryObj.deliveryStatus !== void 0) entry.deliveryStatus = entryObj.deliveryStatus;
	if (entryObj.deliveryError !== void 0) entry.deliveryError = entryObj.deliveryError;
	if (entryObj.deliverySuppressionReason !== void 0) entry.deliverySuppressionReason = entryObj.deliverySuppressionReason;
	if (entryObj.failureNotificationDelivery !== void 0) entry.failureNotificationDelivery = entryObj.failureNotificationDelivery;
	if (entryObj.delivery !== void 0) entry.delivery = entryObj.delivery;
	if (entryObj.sessionId !== void 0) entry.sessionId = entryObj.sessionId;
	if (entryObj.sessionKey !== void 0) entry.sessionKey = entryObj.sessionKey;
	return entry;
}
/** Encodes cron-owned outcome fields; the generic lifecycle projection stays on TaskRecord. */
function cronRunLogEntryToTaskDetail(entry, options) {
	return toJsonValue({
		kind: CRON_TASK_DETAIL_KIND,
		status: entry.status,
		completionStatus: entry.completionStatus,
		error: entry.error ?? null,
		summary: entry.summary ?? null,
		storeKey: options.storeKey,
		errorReason: entry.errorReason,
		diagnostics: entry.diagnostics,
		delivered: entry.delivered,
		deliveryStatus: entry.deliveryStatus,
		deliveryError: entry.deliveryError,
		deliverySuppressionReason: entry.deliverySuppressionReason,
		failureNotificationDelivery: entry.failureNotificationDelivery,
		delivery: entry.delivery,
		sessionId: entry.sessionId,
		runId: entry.runId,
		runAtMs: entry.runAtMs,
		durationMs: entry.durationMs,
		nextRunAtMs: entry.nextRunAtMs,
		triggerFired: entry.triggerFired,
		triggerStateChanged: options.triggerEval?.fired === true ? options.triggerEval.stateChanged : void 0,
		triggerState: options.triggerEval?.fired === true && options.triggerEval.stateChanged ? options.triggerEval.state : void 0,
		scriptStateChanged: options.scriptResult?.scriptStateChanged === true ? true : void 0,
		scriptState: options.scriptResult?.scriptStateChanged === true ? options.scriptResult.scriptState : void 0,
		model: entry.model,
		provider: entry.provider,
		usage: entry.usage
	}) ?? { kind: CRON_TASK_DETAIL_KIND };
}
/** Stores quiet-trigger recovery facts without creating a run-history detail row. */
function cronQuietTriggerTaskDetail(storeKey, triggerEval) {
	return toJsonValue({
		storeKey,
		triggerFired: false,
		triggerStateChanged: triggerEval.stateChanged,
		...triggerEval.stateChanged ? { triggerState: triggerEval.state } : {}
	}) ?? {
		storeKey,
		triggerFired: false,
		triggerStateChanged: false
	};
}
/** Returns the cron store partition recorded on a task row. */
function cronTaskRecordStoreKey(task) {
	return isJsonObject(task.detail) && typeof task.detail.storeKey === "string" ? task.detail.storeKey : void 0;
}
/** Keeps history projection, recovery, and retention on one task-row timestamp. */
function resolveCronTaskRecordTimestamp(task) {
	return task.endedAt ?? task.lastEventAt ?? task.createdAt;
}
/** Reads internal trigger recovery data without adding it to run-history responses. */
function cronTaskRecordToTriggerEval(task) {
	if (!isJsonObject(task.detail) || typeof task.detail.triggerFired !== "boolean") return;
	return {
		fired: task.detail.triggerFired,
		stateChanged: task.detail.triggerStateChanged === true,
		...task.detail.triggerStateChanged === true && "triggerState" in task.detail ? { state: task.detail.triggerState } : {}
	};
}
/** Reads internal payload-script recovery data without exposing it in run history. */
function cronTaskRecordToScriptRunResult(task) {
	if (!isJsonObject(task.detail) || task.detail.scriptStateChanged !== true) return;
	return {
		scriptStateChanged: true,
		...Object.hasOwn(task.detail, "scriptState") ? { scriptState: task.detail.scriptState } : {}
	};
}
/** Maps the cron outcome vocabulary onto generic task terminal states. */
function cronRunStatusToTaskStatus(entry) {
	if (entry.status === "ok") return (entry.completionStatus ?? resolveCronCompletionStatus({
		status: entry.status,
		delivered: entry.delivered,
		deliveryStatus: entry.deliveryStatus
	})) === "succeeded" ? "succeeded" : "failed";
	return entry.status === "error" && isCronTimeoutErrorText(entry.error) ? "timed_out" : "failed";
}
/** Reconstructs the unchanged CronRunLogEntry wire shape from a cron task row. */
function cronTaskRecordToRunLogEntry(task) {
	if (task.runtime !== "cron" || !task.sourceId || !isJsonObject(task.detail)) return null;
	if (task.detail.kind !== CRON_TASK_DETAIL_KIND) return null;
	const wireDetail = { ...task.detail };
	delete wireDetail.storeKey;
	const entry = parseCronRunLogEntryObject({
		error: task.error,
		summary: task.terminalSummary,
		...wireDetail,
		ts: resolveCronTaskRecordTimestamp(task),
		jobId: task.sourceId,
		action: "finished",
		status: isCronRunStatus(task.detail.status) ? task.detail.status : void 0,
		sessionKey: task.childSessionKey,
		runId: typeof task.detail.runId === "string" ? task.detail.runId : void 0
	}, { jobId: task.sourceId });
	if (!entry) return null;
	return {
		...entry,
		delivered: entry.delivered,
		deliveryStatus: entry.deliveryStatus,
		deliveryError: entry.deliveryError,
		sessionId: entry.sessionId,
		sessionKey: entry.sessionKey
	};
}
//#endregion
//#region src/infra/sqlite-number.ts
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
/** Converts a SQLite number or safely representable bigint column into a JavaScript number. */
function normalizeSqliteNumber(value) {
	if (typeof value === "bigint") {
		if (value > MAX_SAFE_INTEGER_BIGINT || value < -MAX_SAFE_INTEGER_BIGINT) return;
		return Number(value);
	}
	return typeof value === "number" ? value : void 0;
}
//#endregion
//#region src/infra/state-migrations.cron-run-logs.ts
const CRON_RUN_LOG_TASK_IMPORT_MIGRATION_ID = "state:cron-run-logs-to-task-runs:v1";
const CRON_RUN_LOG_IMPORT_BATCH_SIZE = 500;
function hasLegacyCronRunLogs(db) {
	return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'cron_run_logs' LIMIT 1").get());
}
function parseDetail(raw) {
	return raw ? safeParseJsonRecord(raw) : void 0;
}
function collectMirroredTasks(db) {
	const rows = db.prepare(`SELECT source_id, ended_at, detail_json
       FROM task_runs
       WHERE runtime = 'cron' AND source_id IS NOT NULL AND detail_json IS NOT NULL`).all();
	const bySource = /* @__PURE__ */ new Map();
	for (const row of rows) {
		const detail = parseDetail(row.detail_json);
		if (!row.source_id || detail?.kind !== "cron-run") continue;
		const identities = bySource.get(row.source_id) ?? [];
		identities.push({
			endedAt: normalizeSqliteNumber(row.ended_at) ?? null,
			...typeof detail.runId === "string" && detail.runId ? { runId: detail.runId } : {}
		});
		bySource.set(row.source_id, identities);
	}
	return bySource;
}
function hasMirroredIdentity(identities, runId, endedAt) {
	return identities.some((identity) => runId && identity.runId ? identity.runId === runId : identity.endedAt === endedAt);
}
function integerToBoolean(value) {
	return value === null || value === void 0 ? void 0 : Number(value) !== 0;
}
/** Legacy rows trust write-time errorReason and diagnostic redaction without recomputation. */
function parseLegacyRow(row) {
	let rawEntry;
	try {
		rawEntry = JSON.parse(row.entry_json ?? "");
	} catch {
		return null;
	}
	const parsed = parseCronRunLogEntryObject(rawEntry, { jobId: row.job_id });
	if (!parsed) return null;
	return {
		...parsed,
		ts: normalizeSqliteNumber(row.ts) ?? parsed.ts,
		jobId: row.job_id,
		status: row.status ?? parsed.status,
		error: row.error ?? parsed.error,
		summary: row.summary ?? parsed.summary,
		delivered: integerToBoolean(row.delivered) ?? parsed.delivered,
		deliveryStatus: row.delivery_status ?? parsed.deliveryStatus,
		deliveryError: row.delivery_error ?? parsed.deliveryError,
		sessionId: row.session_id ?? parsed.sessionId,
		sessionKey: row.session_key ?? parsed.sessionKey,
		runId: row.run_id ?? parsed.runId,
		runAtMs: normalizeSqliteNumber(row.run_at_ms ?? null) ?? parsed.runAtMs,
		durationMs: normalizeSqliteNumber(row.duration_ms ?? null) ?? parsed.durationMs,
		nextRunAtMs: normalizeSqliteNumber(row.next_run_at_ms ?? null) ?? parsed.nextRunAtMs,
		model: row.model ?? parsed.model,
		provider: row.provider ?? parsed.provider
	};
}
function ordinalKey(jobId, ts) {
	return `${jobId}\0${ts}`;
}
/** Runs inside the state schema transaction and removes the retired table after import. */
function migrateLegacyCronRunLogsToTaskRuns(db) {
	if (!hasLegacyCronRunLogs(db)) return {
		imported: 0,
		alreadyMirrored: 0,
		malformed: 0,
		skipped: true
	};
	const mirrored = collectMirroredTasks(db);
	const ordinals = /* @__PURE__ */ new Map();
	const insert = db.prepare(`
    INSERT INTO task_runs (
      task_id, runtime, task_kind, source_id, requester_session_key, owner_key, scope_kind,
      child_session_key, parent_flow_id, parent_task_id, agent_id, requester_agent_id, run_id,
      label, task, status, delivery_status, notify_policy, created_at, started_at, ended_at,
      last_event_at, cleanup_after, error, progress_summary, terminal_summary, terminal_outcome,
      detail_json
    ) VALUES (
      @task_id, 'cron', NULL, @source_id, '', '', 'system', @child_session_key, NULL, NULL,
      NULL, NULL, @run_id, NULL, @task, @status, 'not_applicable', 'silent', @created_at,
      @started_at, @ended_at, @ended_at, NULL, @error, NULL, @terminal_summary,
      @terminal_outcome, @detail_json
    )
  `);
	let imported = 0;
	let alreadyMirrored = 0;
	let malformed = 0;
	let offset = 0;
	while (true) {
		const rows = db.prepare(`SELECT * FROM cron_run_logs
         ORDER BY job_id, ts, store_key, seq
         LIMIT ? OFFSET ?`).all(CRON_RUN_LOG_IMPORT_BATCH_SIZE, offset);
		if (rows.length === 0) break;
		offset += rows.length;
		for (const row of rows) {
			const entry = parseLegacyRow(row);
			if (!entry) {
				malformed++;
				continue;
			}
			const key = ordinalKey(entry.jobId, entry.ts);
			const ordinal = (ordinals.get(key) ?? 0) + 1;
			ordinals.set(key, ordinal);
			if (hasMirroredIdentity(mirrored.get(entry.jobId) ?? [], entry.runId, entry.ts)) {
				alreadyMirrored++;
				continue;
			}
			const taskId = `cron-runlog-import:${entry.jobId}:${entry.ts}:${ordinal}`;
			const status = cronRunStatusToTaskStatus(entry);
			insert.run({
				task_id: taskId,
				source_id: entry.jobId,
				child_session_key: entry.sessionKey ?? null,
				run_id: taskId,
				task: entry.jobId,
				status,
				created_at: entry.runAtMs ?? entry.ts,
				started_at: entry.runAtMs ?? null,
				ended_at: entry.ts,
				error: entry.error ?? null,
				terminal_summary: entry.summary ?? null,
				terminal_outcome: status === "succeeded" ? "succeeded" : null,
				detail_json: JSON.stringify(cronRunLogEntryToTaskDetail(entry, { storeKey: row.store_key }))
			});
			imported++;
		}
	}
	db.exec(`
    DROP INDEX IF EXISTS idx_cron_run_logs_store_ts;
    DROP INDEX IF EXISTS idx_cron_run_logs_job_status;
    DROP INDEX IF EXISTS idx_cron_run_logs_delivery;
    DROP TABLE cron_run_logs;
  `);
	const result = {
		imported,
		alreadyMirrored,
		malformed,
		skipped: false
	};
	const now = Date.now();
	db.prepare(`INSERT INTO migration_runs (id, started_at, finished_at, status, report_json)
     VALUES (?, ?, ?, 'completed', ?)
     ON CONFLICT(id) DO UPDATE SET
       finished_at = excluded.finished_at,
       status = excluded.status,
       report_json = excluded.report_json`).run(CRON_RUN_LOG_TASK_IMPORT_MIGRATION_ID, now, now, JSON.stringify(result));
	return result;
}
//#endregion
//#region src/state/openclaw-state-db-audit-migration.ts
const AUDIT_EVENT_STATE_SCHEMA_VERSION = 2;
const AUDIT_EVENT_LEGACY_COLUMNS = [
	"sequence",
	"event_id",
	"source_id",
	"source_sequence",
	"occurred_at",
	"kind",
	"action",
	"status",
	"error_code",
	"actor_type",
	"actor_id",
	"agent_id",
	"session_key",
	"session_id",
	"run_id",
	"tool_call_id",
	"tool_name"
];
const AUDIT_EVENT_V2_COLUMNS = [
	"sequence",
	"event_id",
	"source_id",
	"schema_version",
	"source_sequence",
	"occurred_at",
	"kind",
	"action",
	"status",
	"error_code",
	"actor_type",
	"actor_id",
	"agent_id",
	"session_key",
	"session_id",
	"run_id",
	"tool_call_id",
	"tool_name",
	"direction",
	"channel",
	"conversation_kind",
	"message_outcome",
	"reason_code",
	"delivery_kind",
	"failure_stage",
	"duration_ms",
	"result_count",
	"account_ref",
	"conversation_ref",
	"message_ref",
	"target_ref"
];
function tableColumnInfo(db, tableName) {
	return db.prepare(`PRAGMA table_info(${tableName})`).all();
}
function tableHasExactColumns(db, tableName, expected) {
	const names = tableColumnInfo(db, tableName).map((column) => column.name);
	return names.length === expected.length && names.every((name, index) => name === expected[index]);
}
function tableHasRequiredColumns(db, tableName, required) {
	const columns = new Map(tableColumnInfo(db, tableName).map((column) => [column.name, column]));
	return required.every((name) => Number(columns.get(name)?.notnull ?? 0) === 1);
}
function tableSql$1(db, tableName) {
	const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
	return typeof row?.sql === "string" ? row.sql : void 0;
}
function tableHasUniqueColumn(db, tableName, columnName) {
	return db.prepare(`PRAGMA index_list(${tableName})`).all().some((index) => {
		if (Number(index.unique ?? 0) !== 1 || typeof index.name !== "string") return false;
		const escaped = index.name.replaceAll("'", "''");
		const columns = db.prepare(`PRAGMA index_info('${escaped}')`).all();
		return columns.length === 1 && columns[0]?.name === columnName;
	});
}
function hasCanonicalAuditEventTable(db, expectedColumns, requiredColumns) {
	const sql = tableSql$1(db, "audit_events")?.toLowerCase();
	return tableHasExactColumns(db, "audit_events", expectedColumns) && tablePrimaryKeyColumns(db, "audit_events").join(",") === "sequence" && tableHasRequiredColumns(db, "audit_events", requiredColumns) && typeof sql === "string" && /\bsequence\s+integer\s+primary\s+key\s+autoincrement\b/.test(sql) && tableHasUniqueColumn(db, "audit_events", "event_id") && tableHasUniqueColumn(db, "audit_events", "source_id");
}
function hasCanonicalAuditIdentityKeyTable(db) {
	if (!tableExists(db, "audit_identity_keys")) return false;
	const sql = tableSql$1(db, "audit_identity_keys")?.toLowerCase();
	return tableHasExactColumns(db, "audit_identity_keys", [
		"id",
		"key_id",
		"key",
		"created_at"
	]) && tablePrimaryKeyColumns(db, "audit_identity_keys").join(",") === "id" && tableHasRequiredColumns(db, "audit_identity_keys", [
		"id",
		"key_id",
		"key",
		"created_at"
	]) && typeof sql === "string" && /\bcheck\s*\(\s*id\s*=\s*1\s*\)/.test(sql);
}
function hasCanonicalAuditEventsSchema(db) {
	if (!tableExists(db, "audit_events")) return readSqliteUserVersion(db) < AUDIT_EVENT_STATE_SCHEMA_VERSION && !tableExists(db, "audit_identity_keys");
	return hasCanonicalAuditEventTable(db, AUDIT_EVENT_V2_COLUMNS, [
		"event_id",
		"source_id",
		"schema_version",
		"source_sequence",
		"occurred_at",
		"kind",
		"action",
		"status",
		"actor_type",
		"actor_id"
	]) && hasCanonicalAuditIdentityKeyTable(db);
}
function canRepairLegacyAuditEventsSchema(db) {
	if (!tableExists(db, "audit_events") || tableExists(db, "audit_events_migration_new") || tableHasColumn(db, "audit_events", "schema_version")) return false;
	return (!tableExists(db, "audit_identity_keys") || hasCanonicalAuditIdentityKeyTable(db)) && hasCanonicalAuditEventTable(db, AUDIT_EVENT_LEGACY_COLUMNS, [
		"event_id",
		"source_id",
		"source_sequence",
		"occurred_at",
		"kind",
		"action",
		"status",
		"actor_type",
		"actor_id",
		"agent_id",
		"run_id"
	]);
}
function readAuditEventSequenceHighWater(db) {
	if (!tableExists(db, "sqlite_sequence")) return;
	const row = db.prepare("SELECT CAST(seq AS TEXT) AS seq FROM sqlite_sequence WHERE name = 'audit_events'").get();
	if (row === void 0) return;
	if (typeof row.seq !== "string" || !/^\d+$/.test(row.seq)) throw new Error("audit event sequence high-water mark is invalid");
	const sequence = BigInt(row.seq);
	if (sequence > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("audit event sequence high-water mark exceeds the supported integer range");
	return Number(sequence);
}
function restoreAuditEventSequenceHighWater(db, sequence) {
	if (sequence === void 0) return;
	db.prepare("DELETE FROM sqlite_sequence WHERE name = 'audit_events'").run();
	db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('audit_events', ?)").run(sequence);
}
function repairAuditEventsSchema(db) {
	if (hasCanonicalAuditEventsSchema(db) || !canRepairLegacyAuditEventsSchema(db)) return false;
	const sequenceHighWater = readAuditEventSequenceHighWater(db);
	db.exec(`
    CREATE TABLE audit_events_migration_new (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL UNIQUE,
      schema_version INTEGER NOT NULL DEFAULT 1,
      source_sequence INTEGER NOT NULL,
      occurred_at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      error_code TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      agent_id TEXT,
      session_key TEXT,
      session_id TEXT,
      run_id TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      direction TEXT,
      channel TEXT,
      conversation_kind TEXT,
      message_outcome TEXT,
      reason_code TEXT,
      delivery_kind TEXT,
      failure_stage TEXT,
      duration_ms INTEGER,
      result_count INTEGER,
      account_ref TEXT,
      conversation_ref TEXT,
      message_ref TEXT,
      target_ref TEXT
    );
    INSERT INTO audit_events_migration_new (
      sequence,
      event_id,
      source_id,
      schema_version,
      source_sequence,
      occurred_at,
      kind,
      action,
      status,
      error_code,
      actor_type,
      actor_id,
      agent_id,
      session_key,
      session_id,
      run_id,
      tool_call_id,
      tool_name
    )
    SELECT
      sequence,
      event_id,
      source_id,
      1,
      source_sequence,
      occurred_at,
      kind,
      action,
      status,
      error_code,
      actor_type,
      actor_id,
      agent_id,
      session_key,
      session_id,
      run_id,
      tool_call_id,
      tool_name
    FROM audit_events;
    DROP TABLE audit_events;
    ALTER TABLE audit_events_migration_new RENAME TO audit_events;
    CREATE INDEX idx_audit_events_time
      ON audit_events(occurred_at DESC, sequence DESC);
    CREATE INDEX idx_audit_events_agent_sequence
      ON audit_events(agent_id, sequence DESC);
    CREATE INDEX idx_audit_events_session_sequence
      ON audit_events(session_key, sequence DESC);
    CREATE INDEX idx_audit_events_run_sequence
      ON audit_events(run_id, sequence DESC);
    CREATE INDEX idx_audit_events_kind_sequence
      ON audit_events(kind, sequence DESC);
    CREATE INDEX idx_audit_events_status_sequence
      ON audit_events(status, sequence DESC);
    CREATE INDEX idx_audit_events_channel_sequence
      ON audit_events(channel, sequence DESC);
    CREATE INDEX idx_audit_events_direction_sequence
      ON audit_events(direction, sequence DESC);
    CREATE TABLE IF NOT EXISTS audit_identity_keys (
      id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
      key_id TEXT NOT NULL,
      key BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
	restoreAuditEventSequenceHighWater(db, sequenceHighWater);
	return true;
}
//#endregion
//#region src/state/openclaw-state-db-operator-approval-migration.ts
const COLUMNS = [
	"approval_id",
	"resolution_ref",
	"kind",
	"status",
	"presentation_json",
	"requested_by_device_id",
	"requested_by_client_id",
	"requested_by_device_token_auth",
	"reviewer_device_ids_json",
	"source_agent_id",
	"source_session_key",
	"source_session_id",
	"source_run_id",
	"source_tool_call_id",
	"source_tool_name",
	"audience_session_keys_json",
	"runtime_epoch",
	"created_at_ms",
	"expires_at_ms",
	"updated_at_ms",
	"decision",
	"terminal_reason",
	"resolved_at_ms",
	"resolver_kind",
	"resolver_id",
	"consumed_at_ms",
	"consumed_by"
];
function tableSql(db) {
	const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operator_approvals'").get();
	return typeof row?.sql === "string" ? row.sql : void 0;
}
function hasCanonicalOperatorApprovalKinds(db) {
	if (!tableExists(db, "operator_approvals")) return true;
	return /kind\s+text\s+not\s+null\s+check\s*\(\s*kind\s+in\s*\(\s*'exec'\s*,\s*'plugin'\s*,\s*'system-agent'\s*\)\s*\)/.test(tableSql(db)?.toLowerCase() ?? "");
}
function assertCanonicalOperatorApprovalKinds(db, pathname) {
	if (!hasCanonicalOperatorApprovalKinds(db)) throw new Error(`OpenClaw state database ${pathname} has a legacy operator approval schema; run openclaw doctor --fix to migrate it.`);
}
function isCanonicalOperatorApprovalKind(value) {
	return value === "exec" || value === "plugin" || value === "system-agent";
}
function detectOperatorApprovalSchemaMigration(db, path) {
	return hasCanonicalOperatorApprovalKinds(db) ? [] : [{
		kind: "operator-approvals-system-agent",
		path
	}];
}
function normalizeDdl(sql) {
	return sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
}
function canonicalOperatorApprovalCreateSql() {
	const marker = "CREATE TABLE IF NOT EXISTS operator_approvals (";
	const tableTerminator = "\n) STRICT;";
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf(marker);
	const end = OPENCLAW_STATE_SCHEMA_SQL.indexOf(`${tableTerminator}\n\nCREATE INDEX IF NOT EXISTS idx_operator_approvals_status_expiry`, start);
	if (start < 0 || end < 0) throw new Error("canonical operator approval schema is unavailable");
	return OPENCLAW_STATE_SCHEMA_SQL.slice(start, end + 10);
}
function alterAppendedResolutionRefCreateSql(sql) {
	const resolutionRefStart = sql.indexOf("\n  resolution_ref ");
	const followingColumnStart = sql.indexOf("\n  kind ", resolutionRefStart);
	const tailColumn = "\n  consumed_by TEXT,";
	const tailColumnStart = sql.indexOf(tailColumn, followingColumnStart);
	if (resolutionRefStart < 0 || followingColumnStart < 0 || tailColumnStart < 0) throw new Error("canonical operator approval resolution reference schema is unavailable");
	return (sql.slice(0, resolutionRefStart) + sql.slice(followingColumnStart)).replace(tailColumn, `${tailColumn} resolution_ref TEXT,`);
}
function hasExactLegacyOperatorApprovalSchema(db) {
	const live = tableSql(db);
	if (!live) return false;
	const exactStrictLegacy = canonicalOperatorApprovalCreateSql().replace("CREATE TABLE IF NOT EXISTS operator_approvals (", "CREATE TABLE operator_approvals (").replace(/'exec',\s*'plugin',\s*'system-agent'/, "'exec', 'plugin'");
	const normalizedLive = normalizeDdl(live);
	return [exactStrictLegacy, alterAppendedResolutionRefCreateSql(exactStrictLegacy)].some((strictLegacy) => [strictLegacy, strictLegacy.replace(/\) STRICT;$/u, ");")].map(normalizeDdl).includes(normalizedLive));
}
function canonicalCreateSql() {
	return canonicalOperatorApprovalCreateSql().replace("CREATE TABLE IF NOT EXISTS operator_approvals (", "CREATE TABLE operator_approvals_migration_new (");
}
function operatorApprovalIndexSql() {
	const statements = OPENCLAW_STATE_SCHEMA_SQL.split(";").map((statement) => statement.trim()).filter((statement) => /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS idx_operator_approvals_/.test(statement));
	if (statements.length === 0) throw new Error("canonical operator approval index schema is unavailable");
	return `${statements.join(";\n")};`;
}
function repairOperatorApprovalKinds(db) {
	if (hasCanonicalOperatorApprovalKinds(db) || tableExists(db, "operator_approvals_migration_new") || !hasExactLegacyOperatorApprovalSchema(db)) return false;
	const columns = COLUMNS.join(", ");
	runSqliteImmediateTransactionSync(db, () => {
		db.exec(canonicalCreateSql());
		db.exec(`
      INSERT INTO operator_approvals_migration_new (${columns})
      SELECT ${columns} FROM operator_approvals
      WHERE typeof(resolution_ref) = 'text'
        AND length(resolution_ref) = 43
        AND resolution_ref NOT GLOB '*[^A-Za-z0-9_-]*';
      DROP TABLE operator_approvals;
      ALTER TABLE operator_approvals_migration_new RENAME TO operator_approvals;
    `);
		db.exec(operatorApprovalIndexSql());
	});
	return true;
}
function repairOperatorApprovalSchema(db) {
	return repairOperatorApprovalKinds(db) ? ["Migrated shared state operator approvals → OpenClaw system changes"] : [];
}
//#endregion
//#region src/state/openclaw-state-db-schema-v12-foldin.ts
const FOLDED_SINGLETON_STATE_TABLES_V12 = [
	"skill_curator_state",
	"update_check_state",
	"clawhub_promotions_feed_state",
	"model_catalog_remote",
	"voicewake_triggers",
	"voicewake_routing_routes",
	"voicewake_routing_config",
	"onboarding_recommendations",
	"cron_store_epochs",
	"tui_last_sessions",
	"sidebar_sections",
	"node_host_config",
	"web_push_vapid_keys"
];
function migrateSingletonStateFoldInV12(db, previousVersion) {
	if (previousVersion >= 12) return false;
	db.exec(`
    CREATE TABLE IF NOT EXISTS config_machine_state (
      state_key TEXT NOT NULL PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    ) STRICT;
  `);
	const importState = db.prepare("INSERT INTO config_machine_state (state_key, value_json, updated_at_ms) VALUES (?, ?, ?) ON CONFLICT(state_key) DO NOTHING");
	if (tableExists(db, "update_check_state")) {
		const row = db.prepare("SELECT * FROM update_check_state WHERE state_key = 'default'").get();
		if (row) importState.run("update.checkState", JSON.stringify({
			lastCheckedAt: row.last_checked_at ?? void 0,
			lastNotifiedVersion: row.last_notified_version ?? void 0,
			lastNotifiedTag: row.last_notified_tag ?? void 0,
			lastAvailableVersion: row.last_available_version ?? void 0,
			lastAvailableTag: row.last_available_tag ?? void 0,
			autoInstallId: row.auto_install_id ?? void 0,
			autoFirstSeenVersion: row.auto_first_seen_version ?? void 0,
			autoFirstSeenTag: row.auto_first_seen_tag ?? void 0,
			autoFirstSeenAt: row.auto_first_seen_at ?? void 0,
			autoLastAttemptVersion: row.auto_last_attempt_version ?? void 0,
			autoLastAttemptAt: row.auto_last_attempt_at ?? void 0,
			autoLastSuccessVersion: row.auto_last_success_version ?? void 0,
			autoLastSuccessAt: row.auto_last_success_at ?? void 0
		}), Number(row.updated_at_ms));
	}
	if (tableExists(db, "voicewake_triggers")) {
		const rows = db.prepare("SELECT trigger, updated_at_ms FROM voicewake_triggers WHERE config_key = 'default' ORDER BY position").all();
		if (rows.length > 0) importState.run("voicewake.triggers", JSON.stringify(rows.map((row) => row.trigger)), Math.max(...rows.map((row) => Number(row.updated_at_ms))));
	}
	if (tableExists(db, "voicewake_routing_config")) {
		const config = db.prepare("SELECT * FROM voicewake_routing_config WHERE config_key = 'default'").get();
		if (config) {
			const routes = tableExists(db, "voicewake_routing_routes") ? db.prepare("SELECT trigger, target_mode, target_agent_id, target_session_key FROM voicewake_routing_routes WHERE config_key = 'default' ORDER BY position").all() : [];
			const targetFromColumns = (mode, agentId, sessionKey) => mode === "agent" && typeof agentId === "string" && agentId ? { agentId } : mode === "session" && typeof sessionKey === "string" && sessionKey ? { sessionKey } : { mode: "current" };
			importState.run("voicewake.routing", JSON.stringify({
				version: 1,
				defaultTarget: targetFromColumns(config.default_target_mode, config.default_target_agent_id, config.default_target_session_key),
				routes: routes.map((route) => ({
					trigger: route.trigger,
					target: targetFromColumns(route.target_mode, route.target_agent_id, route.target_session_key)
				})),
				updatedAtMs: config.updated_at_ms
			}), Number(config.updated_at_ms));
		}
	}
	if (tableExists(db, "onboarding_recommendations")) {
		const rows = db.prepare("SELECT * FROM onboarding_recommendations").all();
		for (const row of rows) importState.run(`onboarding.recommendations.${String(row.config_key)}`, JSON.stringify({
			inventoryHash: row.inventory_hash,
			matches: JSON.parse(String(row.matches_json)),
			offeredAt: row.offered_at_ms,
			acceptedAt: row.accepted_at_ms,
			updatedAt: row.updated_at_ms
		}), Number(row.updated_at_ms));
	}
	if (tableExists(db, "sidebar_sections")) {
		const sections = db.prepare("SELECT section_id FROM sidebar_sections ORDER BY position, section_id").all();
		if (sections.length > 0) importState.run("sidebar.sectionOrder", JSON.stringify(sections.map((section) => section.section_id)), Date.now());
	}
	if (tableExists(db, "node_host_config")) {
		const nodeHost = db.prepare("SELECT * FROM node_host_config WHERE config_key = 'current'").get();
		if (nodeHost) {
			const gateway = {
				...nodeHost.gateway_host == null ? {} : { host: nodeHost.gateway_host },
				...nodeHost.gateway_port == null ? {} : { port: nodeHost.gateway_port },
				...nodeHost.gateway_tls == null ? {} : { tls: nodeHost.gateway_tls === 1 },
				...nodeHost.gateway_tls_fingerprint == null ? {} : { tlsFingerprint: nodeHost.gateway_tls_fingerprint },
				...nodeHost.gateway_context_path == null ? {} : { contextPath: nodeHost.gateway_context_path },
				...nodeHost.gateway_cloudflare_access_json == null ? {} : { cloudflareAccess: JSON.parse(String(nodeHost.gateway_cloudflare_access_json)) }
			};
			importState.run("nodeHost.config", JSON.stringify({
				version: nodeHost.version,
				nodeId: nodeHost.node_id,
				...nodeHost.display_name == null ? {} : { displayName: nodeHost.display_name },
				...Object.keys(gateway).length === 0 ? {} : { gateway },
				installedAppsSharing: nodeHost.installed_apps_sharing === 1
			}), Number(nodeHost.updated_at_ms));
		}
	}
	if (tableExists(db, "web_push_vapid_keys")) {
		const vapidKeys = db.prepare("SELECT * FROM web_push_vapid_keys WHERE key_id = 'default'").get();
		if (vapidKeys) importState.run("webPush.vapidKeys", JSON.stringify({
			publicKey: vapidKeys.public_key,
			privateKey: vapidKeys.private_key,
			subject: vapidKeys.subject
		}), Number(vapidKeys.updated_at_ms));
	}
	let dropped = false;
	for (const tableName of FOLDED_SINGLETON_STATE_TABLES_V12) if (tableExists(db, tableName)) {
		db.exec(`DROP TABLE IF EXISTS ${tableName};`);
		dropped = true;
	}
	return dropped;
}
//#endregion
//#region src/state/session-watch-cursor-provenance.ts
const SESSION_WATCH_PROVENANCE_EXPLICIT = "explicit";
const SESSION_WATCH_PROVENANCE_AMBIENT_GROUP = "ambient-group";
//#endregion
//#region src/state/openclaw-state-db-session-watch-migration.ts
const SESSION_WATCH_PROVENANCE_SCHEMA_VERSION = 4;
const LEGACY_AMBIENT_GROUP_WATCH_MARKER_PREFIX = "ambient-group-watch:";
const SESSION_WATCH_PROVENANCE_COLUMN_SQL = `provenance TEXT NOT NULL DEFAULT '${SESSION_WATCH_PROVENANCE_EXPLICIT}' CHECK (provenance IN ('${SESSION_WATCH_PROVENANCE_EXPLICIT}', '${SESSION_WATCH_PROVENANCE_AMBIENT_GROUP}'))`;
function getSessionWatchCursorKysely(db) {
	return getNodeSqliteKysely(db);
}
function hasLegacyAmbientWatchSentinels(db) {
	if (!tableExists(db, "session_watch_cursors")) return false;
	return executeSqliteQueryTakeFirstSync(db, getSessionWatchCursorKysely(db).selectFrom("session_watch_cursors").select("watcher_session_key").where("watcher_session_key", "like", `${LEGACY_AMBIENT_GROUP_WATCH_MARKER_PREFIX}%`).limit(1)) !== void 0;
}
function needsSessionWatchCursorProvenanceMigration(db, userVersion) {
	if (!tableExists(db, "session_watch_cursors")) return false;
	return userVersion < SESSION_WATCH_PROVENANCE_SCHEMA_VERSION || !tableHasColumn(db, "session_watch_cursors", "provenance") || hasLegacyAmbientWatchSentinels(db);
}
function decodeLegacyAmbientWatchMarkerKey(markerKey) {
	const encoded = markerKey.slice(20);
	if (!encoded || encoded.length % 2 !== 0 || !/^[0-9a-f]+$/.test(encoded)) return;
	try {
		return new TextDecoder("utf-8", {
			fatal: true,
			ignoreBOM: true
		}).decode(Buffer.from(encoded, "hex"));
	} catch {
		return;
	}
}
function migrateSessionWatchCursorProvenance(db) {
	if (!tableExists(db, "session_watch_cursors")) return {
		addedColumn: false,
		migratedAmbientWatches: 0,
		removedLegacySentinels: 0
	};
	const addedColumn = ensureColumn(db, "session_watch_cursors", SESSION_WATCH_PROVENANCE_COLUMN_SQL);
	const kysely = getSessionWatchCursorKysely(db);
	const legacyMarkers = executeSqliteQuerySync(db, kysely.selectFrom("session_watch_cursors").select([
		"watcher_session_key",
		"target_session_key",
		"updated_at"
	]).where("watcher_session_key", "like", `${LEGACY_AMBIENT_GROUP_WATCH_MARKER_PREFIX}%`)).rows;
	let migratedAmbientWatches = 0;
	for (const marker of legacyMarkers) {
		const watcherSessionKey = decodeLegacyAmbientWatchMarkerKey(marker.watcher_session_key);
		if (watcherSessionKey) {
			const watch = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("session_watch_cursors").select("updated_at").where("watcher_session_key", "=", watcherSessionKey).where("target_session_key", "=", marker.target_session_key));
			if (watch) {
				const promoted = executeSqliteQuerySync(db, kysely.updateTable("session_watch_cursors").set({
					provenance: SESSION_WATCH_PROVENANCE_AMBIENT_GROUP,
					updated_at: Math.max(watch.updated_at, marker.updated_at)
				}).where("watcher_session_key", "=", watcherSessionKey).where("target_session_key", "=", marker.target_session_key));
				migratedAmbientWatches += Number(promoted.numAffectedRows ?? 0n);
			}
		}
		executeSqliteQuerySync(db, kysely.deleteFrom("session_watch_cursors").where("watcher_session_key", "=", marker.watcher_session_key).where("target_session_key", "=", marker.target_session_key));
	}
	return {
		addedColumn,
		migratedAmbientWatches,
		removedLegacySentinels: legacyMarkers.length
	};
}
//#endregion
//#region src/state/openclaw-state-db-table-retirements.ts
const stateDbLog$3 = createSubsystemLogger("state/db");
const logRetiredStateTableMigration = (message) => stateDbLog$3.info(message);
const RETIRED_DEAD_STATE_TABLES_V10 = [
	"agent_model_catalogs",
	"android_notification_recent_packages",
	"command_log_entries",
	"diagnostic_stability_bundles",
	"media_blobs",
	"model_capability_cache"
];
const RETIRED_COMMITMENTS_COLUMNS_SQL = `
  id TEXT NOT NULL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  account_id TEXT,
  recipient_id TEXT,
  thread_id TEXT,
  sender_id TEXT,
  kind TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  suggested_text TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  confidence REAL NOT NULL,
  due_earliest_ms INTEGER NOT NULL,
  due_latest_ms INTEGER NOT NULL,
  due_timezone TEXT NOT NULL,
  source_message_id TEXT,
  source_run_id TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  last_attempt_at_ms INTEGER,
  sent_at_ms INTEGER,
  dismissed_at_ms INTEGER,
  snoozed_until_ms INTEGER,
  expired_at_ms INTEGER,
  record_json TEXT NOT NULL
`;
const RETIRED_COMMITMENTS_BASE_INDEXES_SQL = `CREATE INDEX idx_commitments_scope_due
  ON commitments(agent_id, session_key, status, due_earliest_ms, due_latest_ms);
CREATE INDEX idx_commitments_status_due
  ON commitments(status, due_earliest_ms, due_latest_ms);
CREATE INDEX idx_commitments_scope_dedupe
  ON commitments(agent_id, session_key, channel, dedupe_key, status);`;
const RETIRED_COMMITMENTS_SCHEMA_SQL = `
CREATE TABLE commitments (${RETIRED_COMMITMENTS_COLUMNS_SQL.slice(1, -1)}
) STRICT;
${RETIRED_COMMITMENTS_BASE_INDEXES_SQL}
CREATE INDEX idx_commitments_agent_due
  ON commitments(agent_id, status, due_earliest_ms, due_latest_ms, session_key);
CREATE INDEX idx_commitments_agent_sent
  ON commitments(agent_id, status, sent_at_ms, session_key);
`;
const SHIPPED_RETIRED_COMMITMENTS_SCHEMA_SQL = `
CREATE TABLE commitments (${RETIRED_COMMITMENTS_COLUMNS_SQL.slice(1, -1)}
);
${RETIRED_COMMITMENTS_BASE_INDEXES_SQL}
`;
const RETIRED_COMMITMENTS_INDEX_FINGERPRINTS = new Map(getCanonicalSqliteNamedIndexContracts(RETIRED_COMMITMENTS_SCHEMA_SQL).map(({ fingerprint, name }) => [name, JSON.stringify(fingerprint)]));
const RETIRED_COMMITMENTS_SCHEMA_COMPATIBILITY = {
	allowedColumnDefinitions: {
		"commitments.attempts": ["attempts INTEGER NOT NULL DEFAULT 0"],
		"commitments.confidence": ["confidence REAL NOT NULL DEFAULT 0"],
		"commitments.created_at_ms": ["created_at_ms INTEGER NOT NULL DEFAULT 0"],
		"commitments.dedupe_key": ["dedupe_key TEXT NOT NULL DEFAULT ''"],
		"commitments.due_timezone": ["due_timezone TEXT NOT NULL DEFAULT 'UTC'"],
		"commitments.kind": ["kind TEXT NOT NULL DEFAULT 'followup'"],
		"commitments.reason": ["reason TEXT NOT NULL DEFAULT ''"],
		"commitments.sensitivity": ["sensitivity TEXT NOT NULL DEFAULT 'normal'"],
		"commitments.source": ["source TEXT NOT NULL DEFAULT 'unknown'"],
		"commitments.suggested_text": ["suggested_text TEXT NOT NULL DEFAULT ''"]
	},
	allowedMissingColumns: [
		"commitments.account_id",
		"commitments.recipient_id",
		"commitments.thread_id",
		"commitments.sender_id",
		"commitments.kind",
		"commitments.sensitivity",
		"commitments.source",
		"commitments.reason",
		"commitments.suggested_text",
		"commitments.dedupe_key",
		"commitments.confidence",
		"commitments.due_timezone",
		"commitments.source_message_id",
		"commitments.source_run_id",
		"commitments.created_at_ms",
		"commitments.attempts",
		"commitments.last_attempt_at_ms",
		"commitments.sent_at_ms",
		"commitments.dismissed_at_ms",
		"commitments.snoozed_until_ms",
		"commitments.expired_at_ms"
	],
	allowedMissingIndexes: [...RETIRED_COMMITMENTS_INDEX_FINGERPRINTS.keys()]
};
function hasSupportedRetiredCommitmentsSchema(db, schemaSql, compatibility) {
	if (collectSqliteSchemaIssues(db, schemaSql, compatibility).length > 0) return false;
	return db.prepare(`SELECT type, name
           FROM sqlite_schema
          WHERE type IN ('index', 'trigger')
            AND tbl_name = 'commitments'
            AND sql IS NOT NULL
          ORDER BY type, name`).all().every((object) => object.type === "index" && JSON.stringify(collectSqliteNamedIndexContract(db, object.name)) === RETIRED_COMMITMENTS_INDEX_FINGERPRINTS.get(object.name));
}
function assertRecognizedRetiredCommitmentsSchema(db) {
	if (hasRecognizedRetiredCommitmentsSchema(db)) return;
	assertSqliteSchemaContains(db, "retired OpenClaw commitments schema", RETIRED_COMMITMENTS_SCHEMA_SQL, RETIRED_COMMITMENTS_SCHEMA_COMPATIBILITY);
	throw new Error("Retired OpenClaw commitments schema has unsupported additional indexes; refusing destructive migration.");
}
function hasRecognizedRetiredCommitmentsSchema(db) {
	return hasSupportedRetiredCommitmentsSchema(db, RETIRED_COMMITMENTS_SCHEMA_SQL, RETIRED_COMMITMENTS_SCHEMA_COMPATIBILITY) || hasSupportedRetiredCommitmentsSchema(db, SHIPPED_RETIRED_COMMITMENTS_SCHEMA_SQL, RETIRED_COMMITMENTS_SCHEMA_COMPATIBILITY);
}
function assertNoRetiredCommitmentsForeignKeys(db) {
	const tables = db.prepare(`SELECT name
         FROM sqlite_schema
        WHERE type = 'table' AND name <> 'commitments'
        ORDER BY name`).all();
	for (const table of tables) if (db.prepare(`PRAGMA foreign_key_list(${quoteSqliteIdentifier(table.name)})`).all().some((foreignKey) => typeof foreignKey.table === "string" && foreignKey.table.toLowerCase() === "commitments")) throw new Error(`Retired OpenClaw commitments schema is referenced by table ${table.name}; refusing destructive migration.`);
}
function collectRetainedSchemaSql(db) {
	return new Map(db.prepare(`SELECT type, name, sql
             FROM sqlite_schema
            WHERE type IN ('trigger', 'view')
              AND tbl_name <> 'commitments'
              AND sql IS NOT NULL
            ORDER BY type, name`).all().map((object) => [`${object.type}:${object.name}`, object.sql]));
}
function assertNoRetiredCommitmentsSchemaDependencies(db) {
	const probeTable = "__openclaw_retired_commitments_probe";
	if (tableExists(db, probeTable)) throw new Error(`OpenClaw state database already contains ${probeTable}; refusing destructive migration.`);
	const before = collectRetainedSchemaSql(db);
	const savepoint = "openclaw_probe_commitments_dependencies";
	db.exec(`SAVEPOINT ${savepoint};`);
	let changedObject;
	try {
		db.exec(`ALTER TABLE commitments RENAME TO ${quoteSqliteIdentifier(probeTable)};`);
		const after = collectRetainedSchemaSql(db);
		changedObject = [...before].find(([object, sql]) => after.get(object) !== sql)?.[0];
	} catch (error) {
		db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint};`);
		throw new Error("Could not prove retained SQLite views and triggers independent of commitments; refusing destructive migration.", { cause: error });
	}
	db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint};`);
	if (changedObject) {
		const [type, name] = changedObject.split(":", 2);
		throw new Error(`Retired OpenClaw commitments schema is referenced by ${type} ${name}; refusing destructive migration.`);
	}
}
function assertVirtualTablesUsable(db, phase) {
	const virtualTables = db.prepare(`SELECT name
         FROM sqlite_schema
        WHERE type = 'table' AND lower(sql) LIKE 'create virtual table%'
        ORDER BY name`).all();
	for (const table of virtualTables) try {
		db.prepare(`SELECT * FROM ${quoteSqliteIdentifier(table.name)} LIMIT 1`).all();
	} catch (error) {
		throw new Error(`SQLite virtual table ${table.name} is unusable ${phase} commitments retirement.`, { cause: error });
	}
}
function migrateRetiredCommitmentsSchema(db, previousVersion) {
	if (previousVersion >= 7) return false;
	if (!tableExists(db, "commitments")) return false;
	assertRecognizedRetiredCommitmentsSchema(db);
	assertNoRetiredCommitmentsForeignKeys(db);
	assertNoRetiredCommitmentsSchemaDependencies(db);
	assertVirtualTablesUsable(db, "before");
	const savepoint = "openclaw_retire_commitments_v7";
	db.exec(`SAVEPOINT ${savepoint};`);
	try {
		db.exec("DROP TABLE commitments;");
		assertVirtualTablesUsable(db, "after");
		db.exec(`RELEASE ${savepoint};`);
		return true;
	} catch (error) {
		db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint};`);
		throw error;
	}
}
function migrateRetiredDeadStateTablesV10(db, previousVersion) {
	if (previousVersion >= 10) return false;
	let dropped = false;
	for (const tableName of RETIRED_DEAD_STATE_TABLES_V10) if (tableExists(db, tableName)) {
		db.exec(`DROP TABLE IF EXISTS ${tableName};`);
		dropped = true;
	}
	return dropped;
}
const RETIRED_SKILL_CURATOR_TABLES_V11 = ["skill_lifecycle", "skill_workshop_proposal_origin_runs"];
function migrateRetiredSkillCuratorTablesV11(db, previousVersion) {
	if (previousVersion >= 11) return false;
	const retiredTables = RETIRED_SKILL_CURATOR_TABLES_V11.filter((table) => tableExists(db, table));
	if (retiredTables.length === 0) return false;
	if (retiredTables.includes("skill_lifecycle")) {
		const archivedCount = Number(db.prepare("SELECT COUNT(*) AS archived_count FROM skill_lifecycle WHERE state = 'archived'").get()?.archived_count);
		if (archivedCount > 0) stateDbLog$3.info(`${archivedCount} previously archived workshop skills return to the active collection; the weekly collection review will judge them`);
	}
	for (const table of retiredTables) db.exec(`DROP TABLE IF EXISTS ${table};`);
	return true;
}
/**
* Runs every retired-table migration in schema order and names what it changed.
* Both the repair path and the ordinary open path go through here so the order
* and the operator-visible labels cannot drift apart.
*/
function runRetiredStateTableMigrations(db, previousVersion) {
	const applied = [];
	if (migrateRetiredCommitmentsSchema(db, previousVersion)) applied.push("Discarded retired shared-state commitments rows, table, and indexes");
	if (migrateRetiredDeadStateTablesV10(db, previousVersion)) applied.push("Retired six dead shared-state tables (v10)");
	if (migrateRetiredSkillCuratorTablesV11(db, previousVersion)) applied.push("Retired legacy skill curator lifecycle and proposal origin-run tables");
	return applied;
}
//#endregion
//#region src/state/openclaw-state-db-schema-repair.ts
function dropLegacyStateTables(db) {
	const transientHistoryTable = ["database", "verifications"].join("_");
	db.exec(`DROP TABLE IF EXISTS ${transientHistoryTable};`);
	db.exec("DROP TABLE IF EXISTS node_pairing_pending; DROP TABLE IF EXISTS node_pairing_paired;");
}
function migrateWorkerPlacementExecutionModeSchema(db, previousVersion) {
	if (previousVersion >= 8 || !tableExists(db, "worker_session_placements")) return false;
	for (const definition of [
		"execution_mode TEXT",
		"terminal_reason TEXT",
		"terminal_at_ms INTEGER"
	]) {
		const column = definition.split(" ", 1)[0];
		if (!tableHasColumn(db, "worker_session_placements", column)) db.exec(`ALTER TABLE worker_session_placements ADD COLUMN ${definition};`);
	}
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf("CREATE TABLE IF NOT EXISTS worker_session_placements (");
	const end = start >= 0 ? OPENCLAW_STATE_SCHEMA_SQL.indexOf("\n) STRICT;", start) : -1;
	if (start < 0 || end < 0) throw new Error("Canonical worker placement schema block is missing");
	const placementSchema = OPENCLAW_STATE_SCHEMA_SQL.slice(start, end + 10);
	const canonical = openNodeSqliteDatabase(":memory:");
	let canonicalColumns;
	try {
		canonical.exec(placementSchema);
		canonicalColumns = canonical.prepare("PRAGMA table_xinfo(worker_session_placements)").all().filter((column) => column.hidden === 0).map((column) => column.name);
	} finally {
		canonical.close();
	}
	const currentColumns = db.prepare("PRAGMA table_xinfo(worker_session_placements)").all().filter((column) => column.hidden === 0).map((column) => column.name);
	const expected = new Set(canonicalColumns);
	if (currentColumns.length !== canonicalColumns.length || currentColumns.some((column) => !expected.has(column))) throw new Error("OpenClaw v7 worker placement columns are not canonical");
	if (db.prepare(`SELECT type, name
         FROM sqlite_schema
        WHERE tbl_name = 'worker_session_placements'
          AND type IN ('index', 'trigger')
          AND sql IS NOT NULL
          AND name NOT IN (
            'idx_worker_session_placements_session_key',
            'idx_worker_session_placements_reconcile'
          )`).all().length > 0) throw new Error("OpenClaw v7 worker placement schema has unsupported attached objects");
	const migrationTable = "worker_session_placements_migration_v8";
	if (tableExists(db, migrationTable)) throw new Error(`OpenClaw worker placement migration table already exists: ${migrationTable}`);
	const migrationSchema = placementSchema.replace("CREATE TABLE IF NOT EXISTS worker_session_placements", `CREATE TABLE ${migrationTable}`);
	const columns = canonicalColumns.map(quoteSqliteIdentifier).join(", ");
	db.exec(migrationSchema);
	db.exec(`INSERT INTO ${migrationTable} (${columns}) SELECT ${columns} FROM worker_session_placements;`);
	db.exec("DROP TABLE worker_session_placements;");
	db.exec(`ALTER TABLE ${migrationTable} RENAME TO worker_session_placements;`);
	return true;
}
function isDefaultAgentDatabasePath(pathname, agentId) {
	const agentDir = path.dirname(pathname);
	const agentIdDir = path.dirname(agentDir);
	return path.basename(pathname) === "openclaw-agent.sqlite" && path.basename(agentDir) === "agent" && path.basename(agentIdDir) === agentId && path.basename(path.dirname(agentIdDir)) === "agents";
}
function migrateAgentDatabaseRelativePaths(db, previousVersion, databasePath) {
	if (previousVersion >= 9 || !tableExists(db, "agent_databases")) return {
		relativized: 0,
		reanchored: [],
		deleted: [],
		preserved: 0
	};
	const rows = db.prepare("SELECT agent_id, path FROM agent_databases").all();
	const updatePath = db.prepare("UPDATE agent_databases SET path = ? WHERE agent_id = ? AND path = ?");
	const deletePath = db.prepare("DELETE FROM agent_databases WHERE agent_id = ? AND path = ?");
	const hasPath = db.prepare("SELECT 1 FROM agent_databases WHERE agent_id = ? AND path = ? LIMIT 1");
	let relativized = 0;
	const reanchored = [];
	const deleted = [];
	for (const row of rows) {
		const agentId = row.agent_id;
		const registeredPath = row.path;
		if (typeof agentId !== "string" || typeof registeredPath !== "string") throw new Error("OpenClaw v8 agent database registry paths are not canonical");
		if (!path.isAbsolute(registeredPath)) continue;
		const storedPath = resolveOpenClawAgentDatabaseStoredPath(databasePath, registeredPath);
		if (!path.isAbsolute(storedPath)) {
			updatePath.run(storedPath, agentId, registeredPath);
			relativized += 1;
		}
	}
	const stateDir = resolveOpenClawStateDirForDatabasePath(databasePath);
	for (const row of rows) {
		const agentId = row.agent_id;
		const registeredPath = row.path;
		if (typeof agentId !== "string" || typeof registeredPath !== "string" || !path.isAbsolute(registeredPath) || !path.isAbsolute(resolveOpenClawAgentDatabaseStoredPath(databasePath, registeredPath))) continue;
		if (isDefaultAgentDatabasePath(path.resolve(registeredPath), agentId)) {
			const counterpartAbsolute = path.join(stateDir, "agents", agentId, "agent", "openclaw-agent.sqlite");
			const counterpartStored = resolveOpenClawAgentDatabaseStoredPath(databasePath, counterpartAbsolute);
			if (hasPath.get(agentId, counterpartStored)) {
				deletePath.run(agentId, registeredPath);
				deleted.push(registeredPath);
			} else if (existsSync(counterpartAbsolute)) {
				updatePath.run(counterpartStored, agentId, registeredPath);
				reanchored.push(registeredPath);
			}
		}
	}
	return {
		relativized,
		reanchored,
		deleted,
		preserved: rows.length - relativized - reanchored.length - deleted.length
	};
}
function hasCanonicalAgentDatabasesPrimaryKey(db) {
	if (!tableExists(db, "agent_databases")) return true;
	const primaryKey = tablePrimaryKeyColumns(db, "agent_databases");
	return primaryKey.length === 2 && primaryKey[0] === "agent_id" && primaryKey[1] === "path";
}
function canRepairAgentDatabasesPrimaryKey(db) {
	if (!tableExists(db, "agent_databases")) return false;
	return [
		"agent_id",
		"path",
		"schema_version",
		"last_seen_at",
		"size_bytes"
	].every((column) => tableHasColumn(db, "agent_databases", column));
}
function repairAgentDatabasesCompositePrimaryKey(db) {
	if (hasCanonicalAgentDatabasesPrimaryKey(db) || !canRepairAgentDatabasesPrimaryKey(db)) return false;
	db.exec(`
    DROP TABLE IF EXISTS agent_databases_migration_new;
    CREATE TABLE agent_databases_migration_new (
      agent_id TEXT NOT NULL,
      path TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      size_bytes INTEGER,
      PRIMARY KEY (agent_id, path)
    );
    INSERT OR REPLACE INTO agent_databases_migration_new (
      agent_id,
      path,
      schema_version,
      last_seen_at,
      size_bytes
    )
    SELECT
      agent_id,
      path,
      schema_version,
      last_seen_at,
      size_bytes
    FROM agent_databases
    WHERE agent_id IS NOT NULL AND path IS NOT NULL;
    DROP TABLE agent_databases;
    ALTER TABLE agent_databases_migration_new RENAME TO agent_databases;
  `);
	return true;
}
function repairLegacyGatewayRestartHandoffsForStrictMigration(db) {
	if (!tableExists(db, "gateway_restart_handoff")) return;
	db.prepare("DELETE FROM gateway_restart_handoff WHERE expires_at <= ?").run(Date.now());
	db.exec(`
    UPDATE gateway_restart_handoff
    SET
      restart_trace_started_at = CASE
        WHEN typeof(restart_trace_started_at) = 'real'
          THEN CAST(restart_trace_started_at AS INTEGER)
        ELSE restart_trace_started_at
      END,
      restart_trace_last_at = CASE
        WHEN typeof(restart_trace_last_at) = 'real'
          THEN CAST(restart_trace_last_at AS INTEGER)
        ELSE restart_trace_last_at
      END
    WHERE typeof(restart_trace_started_at) = 'real'
       OR typeof(restart_trace_last_at) = 'real';
  `);
}
function assertCanonicalStateSchemaShape(db, pathname) {
	assertCanonicalOperatorApprovalKinds(db, pathname);
	if (!hasCanonicalAgentDatabasesPrimaryKey(db)) {
		if (canRepairAgentDatabasesPrimaryKey(db)) throw new OpenClawStateDatabaseSchemaMigrationRequiredError("agent-databases-composite-primary-key", pathname);
		throw new Error(`OpenClaw state database ${pathname} has a noncanonical agent database registry schema that cannot be repaired automatically; restore the canonical agent_databases shape before retrying.`);
	}
	if (!hasCanonicalAuditEventsSchema(db)) {
		if (canRepairLegacyAuditEventsSchema(db)) throw new OpenClawStateDatabaseSchemaMigrationRequiredError("audit-events-v2", pathname);
		throw new Error(`OpenClaw state database ${pathname} has a noncanonical audit event schema that cannot be repaired automatically; restore the canonical audit_events shape before retrying.`);
	}
}
function detectOpenClawStateDatabaseSchemaMigrations(options = {}) {
	const pathname = resolveDatabasePath(options);
	if (!existsSync(pathname)) return [];
	const db = openNodeSqliteDatabase(pathname, { readOnly: true });
	try {
		return detectOpenClawStateDatabaseSchemaMigrationsFromDatabase(db, pathname);
	} finally {
		db.close();
	}
}
/**
* Detect migrations against a caller-owned handle.
*
* Registry discovery runs this per lookup while already holding a state
* connection; opening a second one there made reads scale with row count.
*/
function detectOpenClawStateDatabaseSchemaMigrationsFromDatabase(db, pathname) {
	const migrations = [];
	const userVersion = readSqliteUserVersion(db);
	if (userVersion < 7 && tableExists(db, "commitments") && hasRecognizedRetiredCommitmentsSchema(db)) migrations.push({
		kind: "commitments-retirement-v7",
		path: pathname
	});
	if (userVersion === 7 && tableExists(db, "worker_session_placements")) migrations.push({
		kind: "worker-placement-execution-mode-v8",
		path: pathname
	});
	if (userVersion === 8 && tableExists(db, "agent_databases")) migrations.push({
		kind: "agent-databases-relative-paths-v9",
		path: pathname
	});
	if (userVersion < 10 && RETIRED_DEAD_STATE_TABLES_V10.some((tableName) => tableExists(db, tableName))) migrations.push({
		kind: "state-table-retirement-v10",
		path: pathname
	});
	if (userVersion < 11 && RETIRED_SKILL_CURATOR_TABLES_V11.some((tableName) => tableExists(db, tableName))) migrations.push({
		kind: "state-table-retirement-v11",
		path: pathname
	});
	if (userVersion < 12 && FOLDED_SINGLETON_STATE_TABLES_V12.some((tableName) => tableExists(db, tableName))) migrations.push({
		kind: "singleton-state-foldin-v12",
		path: pathname
	});
	if (userVersion < 13 && (tableHasColumn(db, "cron_jobs", "schedule_kind") || tableHasColumn(db, "subagent_runs", "task") || tableExists(db, "workspace_attestations") || tableExists(db, "installed_plugin_index") || tableExists(db, "auth_profile_stores"))) migrations.push({
		kind: "state-consolidation-v13",
		path: pathname
	});
	if (userVersion < 14 && tableExists(db, "cron_jobs")) migrations.push({
		kind: "creator-namespace-v14",
		path: pathname
	});
	if (userVersion < 15 && (tableHasColumn(db, "current_conversation_bindings", "target_agent_id") || tableHasColumn(db, "current_conversation_bindings", "target_session_id"))) migrations.push({
		kind: "conversation-binding-targets-v15",
		path: pathname
	});
	if (!hasCanonicalAgentDatabasesPrimaryKey(db)) migrations.push({
		kind: "agent-databases-composite-primary-key",
		path: pathname
	});
	if (!hasCanonicalAuditEventsSchema(db)) migrations.push({
		kind: "audit-events-v2",
		path: pathname
	});
	if (tableExists(db, "audit_events") && userVersion < 3) migrations.push({
		kind: "strict-tables-v3",
		path: pathname
	});
	if (needsSessionWatchCursorProvenanceMigration(db, userVersion)) migrations.push({
		kind: "session-watch-cursor-provenance-v4",
		path: pathname
	});
	migrations.push(...detectOperatorApprovalSchemaMigration(db, pathname));
	return migrations;
}
//#endregion
//#region src/state/openclaw-state-db-fast-path.ts
function assertCurrentStateRuntimeSchema(database, pathname, readTable) {
	assertCanonicalStateSchemaShape(database, pathname);
	assertOpenClawStateDatabaseForMaintenance(database, { pathname }, readTable);
}
function isOpenClawStateSchemaFastPathEligible(database, pathname) {
	return runSqliteDeferredTransactionSync(database, () => {
		assertSupportedSchemaVersion(database, pathname);
		if (readSqliteUserVersion(database) !== 15) return false;
		assertSqliteIntegrity(database, pathname);
		const readTable = createSqliteTableContractReader(database);
		assertCurrentStateRuntimeSchema(database, pathname, readTable);
		if (collectSqliteSchemaIssues(database, getOpenClawStateRuntimeSchema({ includeVersionLazyAdditiveTables: false }), STATE_PERSISTENT_SCHEMA_COMPATIBILITY, readTable).some(isOpenClawStateStartupRepairableSchemaIssue)) return false;
		if (hasLegacyCronRunLogs(database)) return false;
		return database.prepare("SELECT app_version FROM schema_meta WHERE meta_key = 'primary' LIMIT 1").get()?.app_version === VERSION;
	});
}
//#endregion
//#region src/infra/sqlite-files.ts
/** SQLite main database plus every journal-mode sidecar that can contain database pages. */
const SQLITE_DATABASE_FILE_SUFFIXES = [
	"",
	"-wal",
	"-shm",
	"-journal"
];
const SQLITE_SIDECAR_SUFFIXES = SQLITE_DATABASE_FILE_SUFFIXES.slice(1);
const SQLITE_WAL_HEADER_BYTES = 32;
const SQLITE_SIDECAR_HASH_BUFFER_BYTES = 1048576;
const sqliteFilesLog = createSubsystemLogger("state/sqlite");
var SqliteOrphanedSidecarsError = class extends Error {
	constructor(pathname, sidecarPaths, cause) {
		super(`SQLite database is missing at ${pathname}, and orphaned sidecars could not be copied: ${sidecarPaths.join(", ")}. Refusing to open because SQLite could delete orphan WAL or journal state. Preserve the sidecar bytes, restore the main database, and pair it with the matching sidecar before retrying.`, { cause });
		this.name = "SqliteOrphanedSidecarsError";
	}
};
/** Resolves the main database and all possible journal-mode sidecar paths. */
function resolveSqliteDatabaseFilePaths(pathname) {
	return SQLITE_DATABASE_FILE_SUFFIXES.map((suffix) => `${pathname}${suffix}`);
}
function sha256FileSync(pathname) {
	const descriptor = fs.openSync(pathname, "r");
	const digest = createHash("sha256");
	const buffer = Buffer.allocUnsafe(SQLITE_SIDECAR_HASH_BUFFER_BYTES);
	try {
		while (true) {
			const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
			if (bytesRead === 0) return digest.digest("hex");
			digest.update(buffer.subarray(0, bytesRead));
		}
	} finally {
		fs.closeSync(descriptor);
	}
}
function findMatchingOrphanedSidecarCopy(sourcePath, sourceSize) {
	const directory = path.dirname(sourcePath);
	const prefix = `${path.basename(sourcePath)}.orphaned-`;
	const candidates = fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.startsWith(prefix)).map((entry) => path.join(directory, entry.name)).filter((candidate) => fs.statSync(candidate).size === sourceSize);
	if (candidates.length === 0) return;
	const sourceHash = sha256FileSync(sourcePath);
	for (const candidate of candidates) if (sha256FileSync(candidate) === sourceHash) return candidate;
}
function copyOrphanedSidecar(sourcePath, epochMs) {
	const basePath = `${sourcePath}.orphaned-${epochMs}`;
	for (let suffix = 0;; suffix += 1) {
		const candidate = suffix === 0 ? basePath : `${basePath}-${suffix}`;
		try {
			fs.copyFileSync(sourcePath, candidate, fs.constants.COPYFILE_EXCL);
			return candidate;
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
	}
}
/** Preserve durable orphan sidecars before SQLite creates a replacement main database. */
function quarantineOrphanedSqliteSidecars(pathname) {
	if (fs.existsSync(pathname)) return;
	const sidecars = [{
		path: `${pathname}-wal`,
		minimumBytes: SQLITE_WAL_HEADER_BYTES
	}, {
		path: `${pathname}-journal`,
		minimumBytes: 0
	}].flatMap((sidecar) => {
		const stat = fs.statSync(sidecar.path, { throwIfNoEntry: false });
		return stat?.isFile() === true && stat.size > sidecar.minimumBytes ? [{
			path: sidecar.path,
			size: stat.size
		}] : [];
	});
	if (sidecars.length === 0) return;
	const epochMs = Date.now();
	const copied = [];
	try {
		for (const sidecar of sidecars) {
			if (findMatchingOrphanedSidecarCopy(sidecar.path, sidecar.size)) continue;
			const quarantinePath = copyOrphanedSidecar(sidecar.path, epochMs);
			copied.push({
				quarantinePath,
				sourcePath: sidecar.path
			});
		}
	} catch (error) {
		throw new SqliteOrphanedSidecarsError(pathname, sidecars.map((sidecar) => sidecar.path), error);
	}
	if (copied.length === 0) return;
	const copies = copied.map(({ sourcePath, quarantinePath }) => `${sourcePath} -> ${quarantinePath}`);
	sqliteFilesLog.warn(`SQLite database is missing at ${pathname}; copied orphaned sidecars: ${copies.join(", ")}. Committed frames could not be applied because the main database is missing. The bytes are preserved. Recovery requires restoring the main database and pairing it with the quarantined file.`, {
		databasePath: pathname,
		copiedSidecars: copied
	});
}
//#endregion
//#region src/state/openclaw-state-db-permissions.ts
const OPENCLAW_STATE_DIR_MODE = 448;
const OPENCLAW_STATE_FILE_MODE = 384;
const stateDbLog$2 = createSubsystemLogger("state/db");
/** Targets already warned about, so chmod-less filesystems warn once per path. */
const chmodWarnedTargets = createDedupeCache({
	ttlMs: 0,
	maxSize: 4096
});
function bestEffortChmodSync(target, mode) {
	const result = applyPrivateModeSync(target, mode);
	if (result.applied || chmodWarnedTargets.check(target)) return;
	stateDbLog$2.warn(`skipped permission hardening for ${target}: ${String(result.error)}`);
}
function ensureOpenClawStatePermissions(pathname, env) {
	const dir = path.dirname(pathname);
	const defaultDir = resolveOpenClawStateSqliteDir(env);
	const isDefaultStateDatabase = path.resolve(pathname) === path.resolve(resolveOpenClawStateSqlitePath(env));
	if (isDefaultStateDatabase && dir !== defaultDir) throw new Error(`OpenClaw state database path resolved outside its state dir: ${pathname}`);
	const dirExisted = existsSync(dir);
	mkdirSync(dir, {
		recursive: true,
		mode: OPENCLAW_STATE_DIR_MODE
	});
	if (isDefaultStateDatabase || !dirExisted) bestEffortChmodSync(dir, OPENCLAW_STATE_DIR_MODE);
	for (const candidate of resolveSqliteDatabaseFilePaths(pathname)) if (existsSync(candidate)) try {
		bestEffortChmodSync(candidate, OPENCLAW_STATE_FILE_MODE);
	} catch (error) {
		if (candidate === pathname || !hasErrnoCode(error, "ENOENT")) throw error;
	}
}
//#endregion
//#region src/state/openclaw-state-db-open.ts
const stateDbLog$1 = createSubsystemLogger("state/db");
function assertStateDatabaseIntegrityBeforeMutation(database, pathname) {
	const userVersion = readSqliteUserVersion(database);
	const hasApplicationSchema = database.prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get();
	if (userVersion === 0 && hasApplicationSchema || userVersion > 0 && userVersion < 15) stateDbLog$1.info("state database schema migration pending; verifying integrity first", {
		fromVersion: userVersion,
		path: pathname,
		toVersion: 15
	});
	if (userVersion !== 15) assertSqliteIntegrity(database, pathname);
}
function openUnpublishedStateDatabase(params) {
	const { busyTimeoutMs, lockFailureReporting } = params;
	ensureOpenClawStatePermissions(params.pathname, params.env);
	const db = openNodeSqliteDatabase(params.pathname);
	enableNodeSqliteKyselyStatementCache(db);
	setSqliteBusyTimeout(db, busyTimeoutMs);
	const walMaintenance = runWithSqliteBusyTimeout(db, busyTimeoutMs, () => {
		let maintenance;
		try {
			assertSupportedSchemaVersion(db, params.pathname);
			assertStateDatabaseIntegrityBeforeMutation(db, params.pathname);
			configureSqlitePreSchemaPragmas(db, { busyTimeoutMs });
			maintenance = configureSqliteConnectionPragmas(db, {
				busyTimeoutMs,
				databaseLabel: "openclaw-state",
				databasePath: params.pathname,
				foreignKeys: true,
				synchronous: "NORMAL"
			});
			params.ensureSchema(db);
			return maintenance;
		} catch (error) {
			maintenance?.close();
			db.close();
			if (error instanceof Error && (isSqliteSchemaVersionError(error) || isTerminalSqliteIntegrityError(error))) params.recordOpenFailure(params.pathname, error);
			throw error;
		}
	}, { lockFailureReporting });
	ensureOpenClawStatePermissions(params.pathname, params.env);
	return {
		db,
		path: params.pathname,
		walMaintenance
	};
}
//#endregion
//#region src/shared/chat-envelope.ts
const ENVELOPE_PREFIX = /^\[([^\]]+)\]\s*/;
const ENVELOPE_CHANNELS = [
	"WebChat",
	"WhatsApp",
	"Telegram",
	"Signal",
	"Slack",
	"Discord",
	"Google Chat",
	"iMessage",
	"Teams",
	"Matrix",
	"Zalo",
	"Zalo Personal"
];
const MESSAGE_ID_LINE = /^\s*\[message_id:\s*[^\]]+\]\s*$/i;
function looksLikeEnvelopeHeader(header) {
	if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\b/.test(header)) return true;
	if (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}\b/.test(header)) return true;
	return ENVELOPE_CHANNELS.some((label) => header.startsWith(`${label} `));
}
/** Removes recognized channel/timestamp prefixes while preserving user-authored bracket text. */
function stripEnvelope(text) {
	const match = text.match(ENVELOPE_PREFIX);
	if (!match) return text;
	if (!looksLikeEnvelopeHeader(match[1] ?? "")) return text;
	return text.slice(match[0].length);
}
/** Removes standalone message-id hint lines without touching inline user mentions. */
function stripMessageIdHints(text) {
	if (!/\[message_id:/i.test(text)) return text;
	const lines = text.split(/\r?\n/);
	const filtered = lines.filter((line) => !MESSAGE_ID_LINE.test(line));
	return filtered.length === lines.length ? text : filtered.join("\n");
}
//#endregion
//#region src/auto-reply/reply/inbound-context-marker.ts
/**
* Provenance marker appended to every OpenClaw-injected inbound context header
* (see `buildInboundUserContextPrefix`). Strippers key on this marker rather
* than on label text so detection is label-agnostic and never collides with
* user-typed headings. Fixed (not per-turn random): strippers run on stored
* text with no out-of-band value, and forging it only strips the forger's own
* text — no trust boundary depends on it.
*
* Duplicated (never imported) in:
*   - extensions/memory-lancedb/memory-capture-sanitization.ts (extension boundary
*     forbids core imports)
*   - apps/shared/OpenClawKit/Sources/OpenClawChatUI/ChatMarkdownPreprocessor.swift, which spells the
*     same two code points as `\u{27E6}`/`\u{27E7}` escapes
* Keep every copy equal to this value; a drifted copy silently stops stripping.
*/
const INBOUND_CONTEXT_MARKER = "⟦openclaw:ctx⟧";
/** Appends the provenance marker to a context header label. */
function markInboundContextLabel(label) {
	return `${label} ${INBOUND_CONTEXT_MARKER}`;
}
//#endregion
//#region src/auto-reply/reply/strip-inbound-meta.ts
const LEADING_TIMESTAMP_PREFIX_RE = /^\[[A-Za-z]{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2}[^\]]*\] */;
const CHANNEL_CONTEXT_HEADER = `Context: ${INBOUND_CONTEXT_MARKER}`;
const ACTIVE_MEMORY_CONTEXT_HEADER = "Context:";
const ACTIVE_MEMORY_OPEN_TAG = "<active_memory_plugin>";
const ACTIVE_MEMORY_CLOSE_TAG = "</active_memory_plugin>";
const INBOUND_METADATA_MARKERS = [
	"[",
	INBOUND_CONTEXT_MARKER,
	...MESSAGE_TOOL_DELIVERY_HINTS,
	ACTIVE_MEMORY_CONTEXT_HEADER
];
const METADATA_TOKENS_RE = new RegExp([INBOUND_CONTEXT_MARKER, ...MESSAGE_TOOL_DELIVERY_HINTS].map(escapeRegExp).join("|"), "g");
function readTextLine(text, start) {
	if (start > text.length) return;
	const newline = text.indexOf("\n", start);
	const end = newline < 0 ? text.length : newline;
	return {
		start,
		end,
		next: end + 1,
		trimmed: text.slice(start, end).trim()
	};
}
function findTextLine(text, value, from = 0) {
	let index = text.indexOf(value, from);
	while (index >= 0) {
		const line = readTextLine(text, text.lastIndexOf("\n", index - 1) + 1);
		if (line.trimmed === value) return line;
		index = text.indexOf(value, line.next);
	}
}
function skipEmptyLines(text, start, trimmed = true) {
	let next = start;
	let line = readTextLine(text, next);
	while (line && (trimmed ? line.trimmed === "" : line.start === line.end)) {
		next = line.next;
		line = readTextLine(text, next);
	}
	return next;
}
function isInboundContextHeaderLine(line) {
	return line.length > 14 && line.endsWith("⟦openclaw:ctx⟧");
}
function isMessageToolDeliveryHintLine(line) {
	return MESSAGE_TOOL_DELIVERY_HINTS.some((hint) => hint === line);
}
/** Fast check for whether text contains any inbound metadata sentinel. */
function hasInboundMetadataSentinel(text) {
	return text.includes("⟦openclaw:ctx⟧") || MESSAGE_TOOL_DELIVERY_HINTS.some((hint) => text.includes(hint)) || text.includes(ACTIVE_MEMORY_CONTEXT_HEADER) && /^[ \t]*Context:[ \t]*$/m.test(text);
}
function metadataBlockEnd(text, header) {
	let line = readTextLine(text, header.next);
	if (line?.trimmed === "```json") return findTextLine(text, "```", line.next)?.next ?? text.length + 1;
	while (line && line.trimmed !== "") line = readTextLine(text, line.next);
	return skipEmptyLines(text, line?.start ?? text.length + 1);
}
function removeLineSpans(text, spans) {
	if (spans.length === 0) return text;
	const parts = [];
	let cursor = 0;
	for (const span of spans) {
		const start = span.next > text.length && span.start > 0 ? span.start - 1 : span.start;
		parts.push(text.slice(cursor, Math.max(cursor, start)));
		cursor = span.next;
	}
	parts.push(text.slice(cursor));
	return parts.join("");
}
function stripActiveMemoryPromptPrefixBlocks(text) {
	if (!text.includes(ACTIVE_MEMORY_OPEN_TAG)) return text;
	const spans = [];
	let header = findTextLine(text, ACTIVE_MEMORY_CONTEXT_HEADER);
	while (header) {
		const open = readTextLine(text, header.next);
		const close = open?.trimmed === ACTIVE_MEMORY_OPEN_TAG ? findTextLine(text, ACTIVE_MEMORY_CLOSE_TAG, open.next) : void 0;
		const next = close ? skipEmptyLines(text, close.next) : header.next;
		if (close) spans.push({
			start: header.start,
			next
		});
		header = findTextLine(text, ACTIVE_MEMORY_CONTEXT_HEADER, next);
	}
	return removeLineSpans(text, spans);
}
function stripTrailingContextBlockSuffix(text) {
	const header = findTextLine(text, CHANNEL_CONTEXT_HEADER);
	if (!header) return text;
	let end = header.start;
	while (end > 0) {
		const previous = end === 1 ? 0 : text.lastIndexOf("\n", end - 2) + 1;
		if (text.slice(previous, end - 1).trim() !== "") break;
		end = previous;
	}
	return text.slice(0, Math.max(0, end - 1));
}
/** Strips all injected inbound metadata blocks from user-visible text. */
function stripInboundMetadata(text) {
	const withoutTimestamp = text.replace(LEADING_TIMESTAMP_PREFIX_RE, "");
	if (!hasInboundMetadataSentinel(withoutTimestamp)) return withoutTimestamp;
	const source = stripActiveMemoryPromptPrefixBlocks(withoutTimestamp);
	const spans = [];
	const tokens = new RegExp(METADATA_TOKENS_RE);
	let match;
	while (match = tokens.exec(source)) {
		const start = source.lastIndexOf("\n", match.index - 1) + 1;
		const line = readTextLine(source, start);
		tokens.lastIndex = line.next;
		if (line.trimmed === CHANNEL_CONTEXT_HEADER) {
			spans.push({
				start,
				next: source.length + 1
			});
			break;
		}
		if (isInboundContextHeaderLine(line.trimmed)) {
			tokens.lastIndex = metadataBlockEnd(source, line);
			spans.push({
				start,
				next: tokens.lastIndex
			});
		} else if (isMessageToolDeliveryHintLine(line.trimmed)) spans.push({
			start,
			next: line.next
		});
	}
	return removeLineSpans(source, spans).replace(/^\n+/, "").replace(/\n+$/, "").replace(LEADING_TIMESTAMP_PREFIX_RE, "");
}
/** Strips only leading inbound metadata blocks while preserving later user text. */
function stripLeadingInboundMetadata(text) {
	if (!hasInboundMetadataSentinel(text)) return text;
	const source = stripActiveMemoryPromptPrefixBlocks(text);
	let start = skipEmptyLines(source, 0, false);
	let line = readTextLine(source, start);
	const strippedDeliveryHint = Boolean(line && isMessageToolDeliveryHintLine(line.trimmed));
	while (line && isMessageToolDeliveryHintLine(line.trimmed)) {
		start = skipEmptyLines(source, line.next, false);
		line = readTextLine(source, start);
	}
	if (!line) return "";
	if (!isInboundContextHeaderLine(line.trimmed)) return stripTrailingContextBlockSuffix(strippedDeliveryHint ? source.slice(start) : source);
	while (line && isInboundContextHeaderLine(line.trimmed)) {
		start = skipEmptyLines(source, metadataBlockEnd(source, line));
		line = readTextLine(source, start);
	}
	return stripTrailingContextBlockSuffix(source.slice(start));
}
function parseInboundMetaBlock(text, label) {
	const header = findTextLine(text, `${label} ${INBOUND_CONTEXT_MARKER}`);
	const open = header && readTextLine(text, header.next);
	if (open?.trimmed !== "```json") return null;
	const close = findTextLine(text, "```", open.next);
	return close ? safeParseJsonRecord(text.slice(open.next, close.start).trim()) ?? null : null;
}
function firstNonEmptyString(...values) {
	for (const value of values) if (typeof value === "string" && value.trim()) return value.trim().replaceAll("`​``", "```");
	return null;
}
/** Extracts the sender label from injected inbound metadata when present. */
function extractInboundSenderLabel(text) {
	if (!text.includes("⟦openclaw:ctx⟧")) return null;
	const sender = parseInboundMetaBlock(text, "Sender:");
	const label = firstNonEmptyString(sender?.label, sender?.name, sender?.username, sender?.e164, sender?.id);
	if (label) return label;
	const conversationSender = parseInboundMetaBlock(text, "Conversation info:")?.sender;
	return conversationSender && typeof conversationSender === "object" && !Array.isArray(conversationSender) ? firstNonEmptyString(conversationSender.name, conversationSender.username, conversationSender.e164, conversationSender.id) : firstNonEmptyString(conversationSender);
}
//#endregion
//#region src/auto-reply/reply/display-text-sanitize.ts
/** Removes internal runtime metadata before showing text to users. */
function stripInternalMetadataForDisplay(text) {
	return stripInboundMetadata(stripInternalRuntimeContext(text));
}
/** Removes user-envelope and message-id hints from display text. */
function stripUserEnvelopeForDisplay(text) {
	return stripMessageIdHints(stripEnvelope(stripInternalMetadataForDisplay(text)));
}
//#endregion
//#region src/agents/agent-run-terminal-receipt.ts
const AGENT_RUN_ROUTE_CHANGE_MAX_CHARS = 320;
function normalizeAgentRunTerminalReceipt(value) {
	const receipt = value;
	return receipt && typeof receipt.runId === "string" && typeof receipt.sessionId === "string" && typeof receipt.turnId === "string" && receipt.requested && receipt.effective && Array.isArray(receipt.successfulToolNames) ? receipt : void 0;
}
function formatAgentRunModelRef(value) {
	const route = redactSensitiveText(`${value.provider}/${value.model}`, { mode: "tools" }).replace(/\s+/gu, " ").trim();
	return route ? truncateUtf16Safe(route, 128) : void 0;
}
/** Normalizes the producer-owned route fact before lifecycle or prompt use. */
function normalizeAgentRunRouteChange(value) {
	const normalized = typeof value === "string" ? redactSensitiveText(value, { mode: "tools" }).replace(/\s+/gu, " ").trim() : "";
	return normalized ? truncateUtf16Safe(normalized, AGENT_RUN_ROUTE_CHANGE_MAX_CHARS) : void 0;
}
/** Formats the bounded, secret-free route fact owned by a terminal receipt. */
function formatAgentRunRouteChange(receipt, expectedRunId) {
	if (receipt?.runId !== expectedRunId || !receipt.rerouted || receipt.terminalDisposition !== "visible") return;
	const requested = formatAgentRunModelRef(receipt.requested);
	const effective = formatAgentRunModelRef({
		...receipt.effective,
		model: receipt.effective.responseModel || receipt.effective.model
	});
	return requested && effective ? `Model route changed: ${requested} → ${effective}.` : void 0;
}
//#endregion
//#region src/agents/agent-run-terminal-reply.ts
const AGENT_RUN_TERMINAL_REPLY_MAX_CHARS = 4096;
function isMessageToolNotCalledTerminalReply(reply) {
	return reply?.disposition === "empty" && reply.code === "message-tool-not-called";
}
/** Sanitizes and caps producer-owned text before it enters lifecycle or durable state. */
function sanitizeAgentRunTerminalReplyText(text) {
	const sanitized = stripInternalMetadataForDisplay(text).trim();
	if (sanitized.length <= AGENT_RUN_TERMINAL_REPLY_MAX_CHARS) return sanitized;
	return `${truncateUtf16Safe(sanitized, 4095).trimEnd()}…`;
}
/** Builds the authoritative terminal reply fact while raw assistant text is still available. */
function buildAgentRunTerminalReplySnapshot(params) {
	if (params.terminalReplyKind === "silent-empty" || isSilentReplyText(params.rawText ?? params.visibleText, "NO_REPLY")) return { disposition: "silent" };
	const text = sanitizeAgentRunTerminalReplyText(params.visibleText ?? "");
	return text ? {
		disposition: "visible",
		text
	} : { disposition: "empty" };
}
/** Normalizes lifecycle/RPC evidence without allowing raw or unbounded text through. */
function normalizeAgentRunTerminalReplySnapshot(value) {
	if (!isRecord(value)) return;
	const disposition = value.disposition;
	if (disposition === "silent") return { disposition };
	if (disposition === "empty") {
		if (value.code === "message-tool-not-called") return {
			disposition,
			code: "message-tool-not-called"
		};
		return { disposition };
	}
	if (disposition !== "visible") return;
	const rawText = value.text;
	if (typeof rawText !== "string") return;
	const text = sanitizeAgentRunTerminalReplyText(rawText);
	const modelRouteChange = normalizeAgentRunRouteChange(value.modelRouteChange);
	return text ? {
		disposition: "visible",
		text,
		...modelRouteChange ? { modelRouteChange } : {}
	} : { disposition: "empty" };
}
/** Reply evidence merges independently from sticky timeout/cancellation precedence. */
function mergeAgentRunTerminalReplySnapshot(existing, incoming) {
	if (!incoming) return existing;
	if (!existing) return incoming;
	if (isMessageToolNotCalledTerminalReply(existing)) return existing;
	if (isMessageToolNotCalledTerminalReply(incoming)) return incoming;
	if (existing.disposition === "empty") return incoming;
	return incoming.disposition === "empty" ? existing : incoming;
}
//#endregion
//#region src/agents/tools/sessions-send-tokens.ts
/**
* sessions_send sentinel tokens.
*
* Defines non-deliverable reply markers used by sessions_send and subagent completion delivery.
*/
/** Suppresses a subagent completion announcement. */
const ANNOUNCE_SKIP_TOKEN = "ANNOUNCE_SKIP";
/** Suppresses a direct reply delivery. */
const REPLY_SKIP_TOKEN = "REPLY_SKIP";
const NON_DELIVERABLE_REPLY_TOKENS = [
	ANNOUNCE_SKIP_TOKEN,
	REPLY_SKIP_TOKEN,
	SILENT_REPLY_TOKEN,
	HEARTBEAT_TOKEN
];
/** Returns true when text is exactly the announce-skip sentinel. */
function isAnnounceSkip(text) {
	return (text ?? "").trim() === ANNOUNCE_SKIP_TOKEN;
}
/** Returns true when text is exactly the reply-skip sentinel. */
function isReplySkip(text) {
	return (text ?? "").trim() === REPLY_SKIP_TOKEN;
}
/** Returns true when text is any non-deliverable sessions reply sentinel. */
function isNonDeliverableSessionsReply(text) {
	return NON_DELIVERABLE_REPLY_TOKENS.some((token) => isSilentReplyText(text, token));
}
/** Selects a deliverable reply while allowing NO_REPLY to use captured fallback output. */
function selectDeliverableSessionsReply(primary, fallback) {
	const primaryReply = primary?.trim();
	if (primaryReply && !isNonDeliverableSessionsReply(primaryReply)) return primaryReply;
	if (primaryReply && !isSilentReplyText(primaryReply, "NO_REPLY")) return;
	const fallbackReply = fallback?.trim();
	return fallbackReply && !isNonDeliverableSessionsReply(fallbackReply) ? fallbackReply : void 0;
}
//#endregion
//#region src/infra/delivery-queue-sqlite-bound.ts
const COMPLETED_TOMBSTONE_RETENTION_MS = 2592e6;
const BOUNDED_DELIVERY_RECEIPTS_SQL = `
  SELECT * FROM (
    SELECT rowid receipt_rowid, queue_name, id, enqueued_at,
      json_extract(entry_json, '$.completionRetention.idPrefix') id_prefix,
      json_extract(entry_json, '$.completionRetention.maxAgeMs') max_age_ms,
      json_extract(entry_json, '$.completionRetention.maxEntries') max_entries
    FROM delivery_queue_entries WHERE status IN ('completed', 'failed')
      AND recovery_state = 'completed_bounded' AND json_valid(entry_json)
       AND json_type(entry_json, '$.completionRetention') = 'object'
  )
  WHERE typeof(id_prefix) = 'text' AND id_prefix <> ''
    AND substr(id, 1, length(id_prefix)) = id_prefix
    AND typeof(max_age_ms) = 'integer' AND max_age_ms BETWEEN 1 AND 9007199254740991
    AND typeof(max_entries) = 'integer' AND max_entries BETWEEN 1 AND 9007199254740991`;
const deliveryQueueRowColumns = [
	"id",
	"entry_json",
	"enqueued_at",
	"retry_count",
	"last_attempt_at",
	"last_error",
	"platform_send_started_at",
	"recovery_state"
];
/** Prunes bounded receipts globally or for one exact producer namespace. */
function pruneDeliveryQueueTombstones(db, now, prefix) {
	db.prepare(`WITH policies AS (
      ${BOUNDED_DELIVERY_RECEIPTS_SQL}
      AND (@queueName IS NULL OR (queue_name = @queueName AND id_prefix = @idPrefix))
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY queue_name, id_prefix
        ORDER BY enqueued_at DESC, id DESC) retention_rank FROM policies
    ) DELETE FROM delivery_queue_entries WHERE rowid IN (
      SELECT receipt_rowid FROM ranked
      WHERE enqueued_at < @now - max_age_ms OR retention_rank > max_entries
    )`).run({
		now,
		queueName: prefix?.queueName ?? null,
		idPrefix: prefix?.idPrefix ?? null
	});
	if (!prefix) pruneOrdinaryDeliveryReceipts(db, now);
}
/** Cheap maintenance cleanup: age predicates only, with no window sort. */
function pruneDeliveryQueueTombstoneAges(db, now) {
	db.prepare(`DELETE FROM delivery_queue_entries WHERE rowid IN (
    SELECT receipt_rowid FROM (${BOUNDED_DELIVERY_RECEIPTS_SQL})
    WHERE enqueued_at < @now - max_age_ms)`).run({ now });
	pruneOrdinaryDeliveryReceipts(db, now);
}
/** CAS-compacts one exact row, or deletes it when no fence is authored. */
function terminalizeBoundDeliveryQueueEntry(db, queueName, id, expectedJson, failedEntry, now, expectedStatus = "pending") {
	if (!failedEntry) return db.prepare(`DELETE FROM delivery_queue_entries
          WHERE queue_name = ? AND id = ? AND status = ? AND entry_json = ?`).run(queueName, id, expectedStatus, expectedJson).changes === 1;
	return db.prepare(`UPDATE delivery_queue_entries SET status = 'failed', entry_kind = NULL,
        session_key = NULL, channel = NULL, target = NULL, account_id = NULL,
        last_attempt_at = NULL, last_error = NULL, platform_send_started_at = NULL,
        recovery_state = ?, entry_json = ?, enqueued_at = ?, updated_at = ?, failed_at = ?
      WHERE queue_name = ? AND id = ? AND status = ? AND entry_json = ?`).run(failedEntry.recoveryState ?? null, JSON.stringify(failedEntry), now, now, now, queueName, id, expectedStatus, expectedJson).changes === 1;
}
function pruneOrdinaryDeliveryReceipts(db, now) {
	db.prepare(`DELETE FROM delivery_queue_entries WHERE status = 'completed'
    AND enqueued_at < ? AND (recovery_state IS NULL OR recovery_state NOT IN (
      'completed_permanent', 'completed_bounded'
    ))`).run(now - COMPLETED_TOMBSTONE_RETENTION_MS);
}
function inflateDeliveryQueueRow(row) {
	let parsed;
	try {
		parsed = JSON.parse(row.entry_json);
	} catch {
		return null;
	}
	return {
		...parsed,
		id: row.id,
		enqueuedAt: Number(row.enqueued_at),
		retryCount: Number(row.retry_count),
		...row.last_attempt_at == null ? {} : { lastAttemptAt: Number(row.last_attempt_at) },
		...row.last_error == null ? {} : { lastError: row.last_error },
		...row.platform_send_started_at == null ? {} : { platformSendStartedAt: Number(row.platform_send_started_at) },
		...row.recovery_state == null ? {} : { recoveryState: row.recovery_state }
	};
}
function deliveryQueueMetadata(queueName, entry) {
	const item = entry;
	return {
		entryKind: item.kind ?? queueName,
		sessionKey: item.sessionKey ?? item.session?.key,
		channel: item.channel ?? item.route?.channel ?? item.deliveryContext?.channel,
		target: item.to ?? item.route?.to ?? item.deliveryContext?.to,
		accountId: item.accountId ?? item.route?.accountId ?? item.deliveryContext?.accountId
	};
}
/** Canonically serializes a queue row before a transaction acquires the write lock. */
function bindDeliveryQueueEntry(params, now = Date.now()) {
	const status = params.status ?? "pending";
	const meta = params.metadata ?? deliveryQueueMetadata(params.queueName, params.entry);
	return {
		insertOnly: params.insertOnly === true,
		updatePendingOnly: params.updatePendingOnly === true,
		completeExisting: params.completeExisting === true,
		row: {
			queue_name: params.queueName,
			id: params.entry.id,
			status,
			entry_kind: meta.entryKind ?? null,
			session_key: meta.sessionKey ?? null,
			channel: meta.channel ?? null,
			target: meta.target ?? null,
			account_id: meta.accountId ?? null,
			retry_count: params.entry.retryCount,
			last_attempt_at: params.entry.lastAttemptAt ?? null,
			last_error: params.entry.lastError ?? null,
			recovery_state: params.entry.recoveryState ?? null,
			platform_send_started_at: params.entry.platformSendStartedAt ?? null,
			entry_json: JSON.stringify(params.entry),
			enqueued_at: params.entry.enqueuedAt,
			updated_at: now,
			failed_at: status === "failed" ? now : null
		}
	};
}
/** Mutates only the exact supplied shared-state handle; never opens or hardens a file. */
function upsertBoundDeliveryQueueEntryInDatabase(bound, database) {
	const insert = getNodeSqliteKysely(database.db).insertInto("delivery_queue_entries").values(bound.row);
	const query = bound.insertOnly ? insert.onConflict((conflict) => conflict.columns(["queue_name", "id"]).doNothing()) : insert.onConflict((conflict) => {
		const update = conflict.columns(["queue_name", "id"]).doUpdateSet({
			status: (eb) => eb.ref("excluded.status"),
			entry_kind: (eb) => eb.ref("excluded.entry_kind"),
			session_key: (eb) => eb.ref("excluded.session_key"),
			channel: (eb) => eb.ref("excluded.channel"),
			target: (eb) => eb.ref("excluded.target"),
			account_id: (eb) => eb.ref("excluded.account_id"),
			retry_count: (eb) => eb.ref("excluded.retry_count"),
			last_attempt_at: (eb) => eb.ref("excluded.last_attempt_at"),
			last_error: (eb) => eb.ref("excluded.last_error"),
			recovery_state: (eb) => eb.ref("excluded.recovery_state"),
			platform_send_started_at: (eb) => eb.ref("excluded.platform_send_started_at"),
			entry_json: (eb) => eb.ref("excluded.entry_json"),
			enqueued_at: (eb) => eb.ref("excluded.enqueued_at"),
			updated_at: (eb) => eb.ref("excluded.updated_at"),
			failed_at: (eb) => eb.ref("excluded.failed_at")
		});
		if (bound.updatePendingOnly) return update.where("delivery_queue_entries.status", "=", "pending");
		return bound.completeExisting ? update.where("delivery_queue_entries.status", "in", ["pending", "failed"]) : update;
	});
	return executeSqliteQuerySync(database.db, query).numAffectedRows === 1n;
}
/** Recovery and media custody share the same inventory of unfinished work. */
function deliveryQueueEntriesQuery(database, queueNames, mode) {
	const query = getNodeSqliteKysely(database.db).selectFrom("delivery_queue_entries").select(deliveryQueueRowColumns).where("queue_name", "in", queueNames);
	return mode === "all" ? query : query.where((eb) => mode === "pending" ? eb("status", "=", "pending") : eb.or([eb("status", "=", "pending"), eb.and([eb("status", "=", "failed"), eb("recovery_state", "=", "settlement_pending")])]));
}
/** Reads one row from the exact supplied handle for cross-owner invariant validation. */
function loadDeliveryQueueEntryInDatabase(database, queueName, id, mode = "all") {
	const query = deliveryQueueEntriesQuery(database, [queueName], mode).where("id", "=", id);
	const row = executeSqliteQueryTakeFirstSync(database.db, query);
	return row ? inflateDeliveryQueueRow(row) : null;
}
//#endregion
//#region src/infra/delivery-queue-sqlite.types.ts
/** Parse only the shipped completion-retention shape for one exact producer ID. */
function parseDeliveryQueueCompletionRetention(value, id) {
	if (value === "permanent") return value;
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const retention = value;
	const idPrefix = typeof retention.idPrefix === "string" ? retention.idPrefix : "";
	const maxAgeMs = asPositiveSafeInteger(retention.maxAgeMs);
	const maxEntries = asPositiveSafeInteger(retention.maxEntries);
	if (!idPrefix || !id.startsWith(idPrefix) || maxAgeMs === void 0 || maxEntries === void 0) return;
	return {
		idPrefix,
		maxAgeMs,
		maxEntries
	};
}
const finite = (value) => typeof value === "number" && Number.isFinite(value);
/** Recover only authored or shipped producer ownership from a failed entry. */
function inferDeliveryQueueFailureRetention(entry, id, queueName, legacyAmbiguousSendEvidence = false) {
	const explicit = parseDeliveryQueueCompletionRetention(entry.completionRetention, id) ?? parseDeliveryQueueCompletionRetention(entry.failureRetention, id);
	if (explicit) return explicit;
	const fence = asNullableRecord(asNullableRecord(entry.terminalPolicy)?.fence);
	if (fence?.kind === "none") return;
	const fenced = fence?.kind === "permanent" ? "permanent" : parseDeliveryQueueCompletionRetention(fence, id);
	if (fenced) return fenced;
	const durable = queueName === "outbound-preparing-v1" || queueName === "outbound-legacy-preparing-v1" || queueName === "outbound-prepared-migration-v1" || entry.retainOnFailure === true || asNullableRecord(entry.deliveryCompletion) !== null || queueName === "session" && finite(entry.availableAt);
	const ambiguous = legacyAmbiguousSendEvidence && (typeof entry.platformSendAttemptId === "string" && entry.platformSendAttemptId.length > 0 || finite(entry.platformSendStartedAt) || entry.recoveryState === "send_attempt_started" || entry.recoveryState === "unknown_after_send" || queueName === "session" && (finite(entry.deliveryStartedAt) || typeof entry.settlementOutcome === "string" && entry.settlementOutcome.length > 0 || finite(entry.acknowledgedAt)));
	return durable || ambiguous ? "permanent" : void 0;
}
/** Additional work needs a live claim; settling an observed outcome only needs exact ownership. */
function hasLiveDeliveryQueueClaim(entry, claimId, now) {
	const unexpired = typeof entry.availableAt === "number" && entry.availableAt > now;
	return entry.recoveryState === "producer_claimed" ? entry.producerClaimId === claimId && unexpired : (entry.recoveryState === "send_attempt_started" || entry.recoveryState === "unknown_after_send") && entry.platformSendAttemptId === claimId && (entry.requiresProducerClaim !== true || unexpired);
}
/** Strip a terminal queue row to the producer policy needed for admission. */
function projectDeliveryQueueTerminalEntry(entry, terminalAt, terminal, completionRetention) {
	const retryCount = Number.isSafeInteger(entry.retryCount) && entry.retryCount >= 0 ? entry.retryCount : 0;
	const recoveryState = completionRetention === "permanent" ? "completed_permanent" : completionRetention ? "completed_bounded" : void 0;
	return {
		id: entry.id,
		enqueuedAt: terminalAt,
		retryCount,
		...terminal === "completed" ? { acknowledgedAt: terminalAt } : { failedAt: terminalAt },
		...completionRetention ? { completionRetention } : {},
		...recoveryState ? { recoveryState } : {}
	};
}
//#endregion
//#region src/state/openclaw-state-db-delivery-queue-backfill.ts
function nonNegativeSafeInteger(value) {
	const number = typeof value === "bigint" ? Number(value) : value;
	return typeof number === "number" && Number.isSafeInteger(number) && number >= 0 ? number : void 0;
}
const inferLegacyRetention = (entry, id, queue) => inferDeliveryQueueFailureRetention(entry ?? {}, id, queue, true);
/** Compact every preexisting failed row without inferring replay or owner policy. */
function compactLegacyDeliveryQueueFailures(db) {
	const migrationNow = Date.now();
	const retainPending = db.prepare(`UPDATE delivery_queue_entries SET entry_json = ?
      WHERE queue_name = ? AND id = ? AND status = 'pending' AND entry_json = ?`);
	const select = db.prepare(`SELECT queue_name, id, status, retry_count, entry_json, updated_at, failed_at, recovery_state
       FROM delivery_queue_entries WHERE status IN ('pending', 'failed')`);
	select.setReadBigInts(true);
	const rows = select.all();
	const remove = db.prepare(`DELETE FROM delivery_queue_entries WHERE queue_name = ? AND id = ? AND status = 'failed'`);
	const compact = db.prepare(`UPDATE delivery_queue_entries
        SET entry_kind = NULL, session_key = NULL, channel = NULL, target = NULL,
            account_id = NULL, retry_count = @retryCount, last_attempt_at = NULL,
            last_error = NULL, platform_send_started_at = NULL, entry_json = @entryJson,
            enqueued_at = @failedAt, failed_at = @failedAt, recovery_state = @recoveryState
      WHERE queue_name = @queueName AND id = @id AND status = 'failed'`);
	for (const row of rows) {
		if (row.recovery_state === "settlement_pending") continue;
		const parsedEntry = safeParseJsonRecord(String(row.entry_json));
		const queueName = String(row.queue_name);
		const id = String(row.id);
		if (row.status === "pending") {
			if (parsedEntry?.retainOnFailure !== true && inferLegacyRetention(parsedEntry, id, queueName)) retainPending.run(JSON.stringify({
				...parsedEntry,
				retainOnFailure: true
			}), queueName, id, String(row.entry_json));
			continue;
		}
		const failedAt = nonNegativeSafeInteger(row.failed_at) ?? nonNegativeSafeInteger(row.updated_at) ?? migrationNow;
		const entry = parsedEntry ?? {};
		const retryCount = Math.max(nonNegativeSafeInteger(row.retry_count) ?? 0, nonNegativeSafeInteger(entry.retryCount) ?? 0);
		const retention = parsedEntry ? inferLegacyRetention(entry, id, queueName) : "permanent";
		if (!retention) {
			remove.run(queueName, id);
			continue;
		}
		const failedEntry = projectDeliveryQueueTerminalEntry({
			id,
			retryCount
		}, failedAt, "failed", retention);
		compact.run({
			retryCount,
			entryJson: JSON.stringify(failedEntry),
			failedAt,
			recoveryState: failedEntry.recoveryState ?? null,
			queueName,
			id
		});
	}
	pruneDeliveryQueueTombstones(db, migrationNow);
}
//#endregion
//#region src/state/openclaw-state-db-legacy-backfills.ts
function ensureOperatorApprovalResolutionRefs(db) {
	if (!tableExists(db, "operator_approvals")) return;
	runSqliteImmediateTransactionSync(db, () => {
		ensureColumn(db, "operator_approvals", "resolution_ref TEXT");
		const rows = db.prepare("SELECT approval_id, kind, resolution_ref FROM operator_approvals").all();
		const update = db.prepare("UPDATE operator_approvals SET resolution_ref = ? WHERE approval_id = ?");
		for (const row of rows) {
			if (typeof row.approval_id !== "string" || !isCanonicalOperatorApprovalKind(row.kind)) throw new Error("operator approval row cannot be assigned a transport reference");
			const resolutionRef = buildApprovalResolutionRef({
				approvalId: row.approval_id,
				approvalKind: row.kind
			});
			if (row.resolution_ref !== resolutionRef) update.run(resolutionRef, row.approval_id);
		}
		if (db.prepare(`SELECT canonical.approval_id
         FROM operator_approvals AS canonical
         JOIN operator_approvals AS referenced
           ON canonical.approval_id = referenced.resolution_ref
         WHERE canonical.approval_id <> referenced.approval_id
         LIMIT 1`).get()) throw new Error("operator approval ids conflict with durable transport references");
		db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_approvals_resolution_ref
        ON operator_approvals(resolution_ref);
    `);
	});
}
function repairLegacyTaskAgentAttribution(db) {
	if (!tableExists(db, "task_runs") || !tableHasColumn(db, "task_runs", "requester_agent_id")) return;
	db.exec(`
    UPDATE task_runs
    SET
      requester_agent_id = CASE
        WHEN owner_key GLOB 'agent:*:*' THEN substr(
          owner_key,
          7,
          instr(substr(owner_key, 7), ':') - 1
        )
        WHEN requester_session_key GLOB 'agent:*:*' THEN substr(
          requester_session_key,
          7,
          instr(substr(requester_session_key, 7), ':') - 1
        )
        WHEN agent_id <> substr(
          child_session_key,
          7,
          instr(substr(child_session_key, 7), ':') - 1
        ) THEN agent_id
        ELSE NULL
      END,
      agent_id = substr(
        child_session_key,
        7,
        instr(substr(child_session_key, 7), ':') - 1
      )
    WHERE requester_agent_id IS NULL
      AND runtime IN ('subagent', 'acp')
      AND child_session_key GLOB 'agent:*:*'
      AND instr(substr(child_session_key, 7), ':') > 1
      AND (
        owner_key GLOB 'agent:*:*'
        OR requester_session_key GLOB 'agent:*:*'
        OR (
          agent_id IS NOT NULL
          AND agent_id <> substr(
            child_session_key,
            7,
            instr(substr(child_session_key, 7), ':') - 1
          )
        )
      );
  `);
}
function repairLegacyTaskDeliveryStatuses(db) {
	if (!tableExists(db, "task_runs") || !tableHasColumn(db, "task_runs", "delivery_status")) return;
	db.exec(`
    UPDATE task_runs
    SET delivery_status = 'not_applicable'
    WHERE delivery_status = 'not-requested';
  `);
}
/** Recover the task owner lost by stable steer replacements before runtime hydration. */
function repairLegacySubagentTaskBindings(db) {
	if (!tableExists(db, "subagent_runs") || !tableExists(db, "task_runs")) return;
	db.exec(`
    WITH runs AS MATERIALIZED (
      SELECT run_id, child_session_key, requester_session_key, created_at,
        CASE WHEN json_valid(payload_json) THEN payload_json ELSE 'null' END AS payload
      FROM subagent_runs
    ), bindings AS MATERIALIZED (
      SELECT run.run_id, task.run_id AS task_run_id
      FROM runs AS run JOIN task_runs AS task
        ON task.child_session_key = run.child_session_key
      WHERE task.runtime = 'subagent'
        AND task.requester_session_key = run.requester_session_key
        AND task.run_id <> '' AND trim(task.run_id) = task.run_id
        AND json_type(run.payload, '$.taskRunId') IS NULL
        AND json_type(run.payload, '$.completion.required') = 'true'
        AND json_type(run.payload, '$.sessionStartedAt') IN ('integer', 'real')
        AND json_extract(run.payload, '$.sessionStartedAt') < run.created_at
        AND task.created_at BETWEEN json_extract(run.payload, '$.sessionStartedAt')
          AND run.created_at
        AND (SELECT count(*) FROM runs AS sibling
          WHERE sibling.child_session_key = run.child_session_key) = 1
        AND (SELECT count(*) FROM task_runs AS sibling
          WHERE sibling.runtime = 'subagent'
            AND sibling.child_session_key = run.child_session_key) = 1
        AND (SELECT count(*) FROM task_runs AS sibling
          WHERE sibling.run_id = task.run_id) = 1
        AND NOT EXISTS (SELECT 1 FROM runs AS sibling
          WHERE json_type(sibling.payload) <> 'object' OR coalesce(
            CASE WHEN json_type(sibling.payload, '$.taskRunId') = 'text'
              THEN nullif(trim(json_extract(sibling.payload, '$.taskRunId')), '') END,
            sibling.run_id
          ) = task.run_id)
    )
    UPDATE subagent_runs SET payload_json = json_set(payload_json, '$.taskRunId',
      (SELECT task_run_id FROM bindings WHERE bindings.run_id = subagent_runs.run_id))
    WHERE run_id IN (SELECT run_id FROM bindings);
  `);
}
function nullableTextValue(record, key) {
	if (!record || !Object.hasOwn(record, key)) return;
	const value = record[key];
	return typeof value === "string" || value === null ? value : void 0;
}
function selectLegacyRetainedTaskResult(completion, primary, fallback) {
	const terminalReply = normalizeAgentRunTerminalReplySnapshot(completion.terminalReply);
	if (terminalReply) return terminalReply.disposition === "visible" ? terminalReply.text : null;
	return selectDeliverableSessionsReply(primary, fallback) ?? null;
}
/** Promote shipped retained results before runtime hydrates canonical subagent/task state. */
function repairLegacySubagentRetainedResults(db) {
	if (!tableExists(db, "subagent_runs")) return;
	const repair = () => {
		const hasLegacyPendingPayload = tableHasColumn(db, "subagent_runs", "pending_final_delivery_payload_json");
		const rows = db.prepare(hasLegacyPendingPayload ? "SELECT run_id, payload_json, pending_final_delivery_payload_json FROM subagent_runs" : "SELECT run_id, payload_json FROM subagent_runs").all();
		const updateRun = db.prepare(`UPDATE subagent_runs
          SET payload_json = ?
        WHERE run_id = ?`);
		const updateTask = tableExists(db, "task_runs") && tableHasColumn(db, "task_runs", "progress_summary") ? db.prepare(`UPDATE task_runs
              SET progress_summary = ?
            WHERE runtime = 'subagent'
              AND run_id = ?
              AND (progress_summary IS NULL
                OR trim(progress_summary) = ''
                OR (? IS NOT NULL AND trim(progress_summary) = ?))`) : void 0;
		for (const row of rows) {
			const payload = parseJsonRecord(row.payload_json);
			const completion = payload ? recordField(payload, "completion") : null;
			if (!payload || !completion) continue;
			const delivery = recordField(payload, "delivery");
			const deliveryPayload = delivery ? recordField(delivery, "payload") : null;
			const pendingPayload = row.pending_final_delivery_payload_json ? parseJsonRecord(row.pending_final_delivery_payload_json) : null;
			if (!Boolean(deliveryPayload && (Object.hasOwn(deliveryPayload, "frozenResultText") || Object.hasOwn(deliveryPayload, "fallbackFrozenResultText")) || pendingPayload && (Object.hasOwn(pendingPayload, "frozenResultText") || Object.hasOwn(pendingPayload, "fallbackFrozenResultText")))) continue;
			const legacyPrimary = nullableTextValue(deliveryPayload, "frozenResultText") ?? nullableTextValue(pendingPayload, "frozenResultText");
			const legacyFallback = nullableTextValue(deliveryPayload, "fallbackFrozenResultText") ?? nullableTextValue(pendingPayload, "fallbackFrozenResultText");
			if (nullableTextValue(completion, "resultText") == null && legacyPrimary !== void 0) completion.resultText = legacyPrimary;
			if (nullableTextValue(completion, "fallbackResultText") == null && legacyFallback !== void 0) completion.fallbackResultText = legacyFallback;
			delete deliveryPayload?.frozenResultText;
			delete deliveryPayload?.fallbackFrozenResultText;
			const primary = nullableTextValue(completion, "resultText");
			const fallback = nullableTextValue(completion, "fallbackResultText");
			updateRun.run(JSON.stringify(payload), row.run_id);
			const taskRunId = textField(payload, "taskRunId") ?? row.run_id;
			const terminalReply = normalizeAgentRunTerminalReplySnapshot(completion.terminalReply);
			const taskResult = selectLegacyRetainedTaskResult(completion, primary, fallback);
			if (updateTask && (taskResult || terminalReply)) {
				const retainedPrimary = primary?.trim() || null;
				updateTask.run(taskResult, taskRunId, retainedPrimary, retainedPrimary);
			}
		}
	};
	if (db.isTransaction) {
		repair();
		return;
	}
	runSqliteImmediateTransactionSync(db, repair);
}
/** Canonicalize shipped subagent rows whose pause/kill owner only wrote root terminal fields. */
function repairLegacySubagentExecutionPayloads(db) {
	if (!tableExists(db, "subagent_runs")) return;
	db.exec(`
    UPDATE subagent_runs
    SET payload_json = json_remove(
      CASE
        WHEN json_extract(payload_json, '$.pauseReason') = 'sessions_yield'
          AND json_extract(payload_json, '$.execution.status') <> 'terminal'
          AND json_type(payload_json, '$.endedAt') IN ('integer', 'real')
        THEN json_remove(json_set(
          payload_json,
          '$.execution.status', 'terminal',
          '$.execution.endedAt', json_extract(payload_json, '$.endedAt')
        ), '$.execution.outcome')
        WHEN (json_type(payload_json, '$.killReconciliation') = 'object'
          OR json_extract(payload_json, '$.endedReason') = 'subagent-killed')
          AND json_extract(payload_json, '$.execution.status') <> 'terminal'
          AND json_type(payload_json, '$.endedAt') IN ('integer', 'real')
          AND json_type(payload_json, '$.outcome') = 'object'
        THEN json_set(
          payload_json,
          '$.execution.status', 'terminal',
          '$.execution.endedAt', json_extract(payload_json, '$.endedAt'),
          '$.execution.outcome', json_extract(payload_json, '$.outcome')
        )
        ELSE payload_json
      END,
      '$.startedAt', '$.endedAt', '$.outcome'
    )
    WHERE json_valid(payload_json)
      AND (json_type(payload_json, '$.startedAt') IS NOT NULL
        OR json_type(payload_json, '$.endedAt') IS NOT NULL
        OR json_type(payload_json, '$.outcome') IS NOT NULL);
  `);
}
/** Canonicalize the shipped suspension reason before runtime hydrates subagent state. */
function repairLegacySubagentSuspensionReasons(db) {
	if (!tableExists(db, "subagent_runs")) return;
	db.exec(`
    UPDATE subagent_runs
    SET payload_json = json_set(payload_json, '$.delivery.suspendedReason', 'permanent_failure')
    WHERE json_valid(payload_json)
      AND json_extract(payload_json, '$.delivery.suspendedReason') = 'retry-limit';
  `);
}
function backfillAcpReplayEstimatedBytes(db) {
	if (!tableExists(db, "acp_replay_events") || !tableHasColumn(db, "acp_replay_events", "estimated_bytes")) return;
	const pendingEvent = db.prepare("SELECT 1 FROM acp_replay_events WHERE estimated_bytes = 0 LIMIT 1").get();
	const pendingSession = db.prepare("SELECT 1 FROM acp_replay_sessions WHERE estimated_bytes = 0 LIMIT 1").get();
	if (!pendingEvent && !pendingSession) return;
	db.exec(`
    UPDATE acp_replay_events
       SET estimated_bytes = length(session_id) + length(session_key) + length(update_json)
             + COALESCE(length(run_id), 0) + 32
     WHERE estimated_bytes = 0;
    UPDATE acp_replay_sessions
       SET estimated_bytes = length(session_id) + length(session_key) + length(cwd) + 32
             + COALESCE((SELECT SUM(e.estimated_bytes) FROM acp_replay_events e
                          WHERE e.session_id = acp_replay_sessions.session_id), 0)
     WHERE estimated_bytes = 0;
  `);
}
function backfillCronRunLogEntryJson(db) {
	if (!tableExists(db, "cron_run_logs") || !tableHasColumn(db, "cron_run_logs", "entry_json")) return;
	const rows = db.prepare(`SELECT store_key, job_id, seq, ts
         FROM cron_run_logs
        WHERE entry_json = '{}'`).all();
	if (rows.length === 0) return;
	const update = db.prepare(`UPDATE cron_run_logs
        SET entry_json = ?
      WHERE store_key = ? AND job_id = ? AND seq = ?`);
	for (const row of rows) update.run(JSON.stringify({
		ts: Number(row.ts),
		jobId: row.job_id,
		action: "finished"
	}), row.store_key, row.job_id, row.seq);
}
function parseJsonRecord(value) {
	return safeParseJsonRecord(value) ?? null;
}
function textField(record, key) {
	const value = record[key];
	return typeof value === "string" && value.trim() ? value : null;
}
function numberField(record, key) {
	return asFiniteNumber(record[key]) ?? null;
}
function recordField(record, key) {
	return asNullableRecord(record[key]);
}
function backfillCronJobsFromJobJson(db) {
	if (!tableExists(db, "cron_jobs") || !tableHasColumn(db, "cron_jobs", "job_json") || !tableHasColumn(db, "cron_jobs", "payload_kind")) return;
	const rows = db.prepare(`SELECT store_key, job_id, job_json, updated_at
         FROM cron_jobs
        WHERE payload_kind = 'message'
           OR name = ''`).all();
	if (rows.length === 0) return;
	const update = db.prepare(`UPDATE cron_jobs
        SET name = ?,
            enabled = ?,
            agent_id = ?,
            payload_kind = ?,
            runtime_updated_at_ms = ?
      WHERE store_key = ?
        AND job_id = ?`);
	for (const row of rows) {
		const job = parseJsonRecord(row.job_json);
		if (!job) continue;
		const schedule = recordField(job, "schedule");
		const payload = recordField(job, "payload");
		const scheduleKind = textField(schedule ?? {}, "kind");
		const payloadKind = textField(payload ?? {}, "kind");
		const isAt = scheduleKind === "at" && textField(schedule ?? {}, "at");
		const isEvery = scheduleKind === "every" && numberField(schedule ?? {}, "everyMs") != null;
		const isCron = scheduleKind === "cron" && textField(schedule ?? {}, "expr");
		const isSystemEvent = payloadKind === "systemEvent" && textField(payload ?? {}, "text");
		const isAgentTurn = payloadKind === "agentTurn" && textField(payload ?? {}, "message");
		if (!schedule || !payload || !isAt && !isEvery && !isCron || !isSystemEvent && !isAgentTurn) continue;
		update.run(textField(job, "name") ?? row.job_id, job.enabled === false ? 0 : 1, textField(job, "agentId"), payloadKind, numberField(job, "updatedAtMs") ?? (Number(row.updated_at) || 0), row.store_key, row.job_id);
	}
}
function metadataStringField(record, key) {
	return textField(record, key);
}
function backfillDeliveryQueueEntriesFromEntryJson(db) {
	if (!tableExists(db, "delivery_queue_entries") || !tableHasColumn(db, "delivery_queue_entries", "entry_json") || !tableHasColumn(db, "delivery_queue_entries", "retry_count")) return;
	compactLegacyDeliveryQueueFailures(db);
	const rows = db.prepare(`SELECT queue_name, id, entry_json
         FROM delivery_queue_entries
        WHERE status = 'pending'
          AND (retry_count = 0
            OR last_attempt_at IS NULL
            OR last_error IS NULL
            OR recovery_state IS NULL
            OR platform_send_started_at IS NULL
            OR entry_kind IS NULL
            OR session_key IS NULL
            OR channel IS NULL
            OR target IS NULL
            OR account_id IS NULL)`).all();
	if (rows.length === 0) return;
	const update = db.prepare(`UPDATE delivery_queue_entries
        SET entry_kind = COALESCE(?, entry_kind),
            session_key = COALESCE(?, session_key),
            channel = COALESCE(?, channel),
            target = COALESCE(?, target),
            account_id = COALESCE(?, account_id),
            retry_count = ?,
            last_attempt_at = COALESCE(?, last_attempt_at),
            last_error = COALESCE(?, last_error),
            recovery_state = COALESCE(?, recovery_state),
            platform_send_started_at = COALESCE(?, platform_send_started_at)
      WHERE queue_name = ?
        AND id = ?`);
	for (const row of rows) {
		const entry = parseJsonRecord(row.entry_json);
		if (!entry) continue;
		const session = recordField(entry, "session");
		const route = recordField(entry, "route");
		const deliveryContext = recordField(entry, "deliveryContext");
		update.run(metadataStringField(entry, "kind"), metadataStringField(entry, "sessionKey") ?? (session ? metadataStringField(session, "key") : null), metadataStringField(entry, "channel") ?? (route ? metadataStringField(route, "channel") : null) ?? (deliveryContext ? metadataStringField(deliveryContext, "channel") : null), metadataStringField(entry, "to") ?? (route ? metadataStringField(route, "to") : null) ?? (deliveryContext ? metadataStringField(deliveryContext, "to") : null), metadataStringField(entry, "accountId") ?? (route ? metadataStringField(route, "accountId") : null) ?? (deliveryContext ? metadataStringField(deliveryContext, "accountId") : null), asSafeIntegerInRange(entry.retryCount, { min: 0 }) ?? 0, asSafeIntegerInRange(entry.lastAttemptAt, { min: 0 }) ?? null, metadataStringField(entry, "lastError"), metadataStringField(entry, "recoveryState"), asSafeIntegerInRange(entry.platformSendStartedAt, { min: 0 }) ?? null, row.queue_name, row.id);
	}
}
//#endregion
//#region src/state/openclaw-state-db-schema-additive.ts
const SECRET_STORE_SCHEMA_START = "CREATE TABLE IF NOT EXISTS secret_store_entries (";
const SECRET_STORE_SCHEMA_END = "ON secret_store_entries (scope_kind, scope_id, name) WHERE deleted_at_ms IS NULL;";
const MCP_OAUTH_PENDING_SCHEMA_START = "CREATE TABLE IF NOT EXISTS mcp_oauth_pending_authorizations (";
const MCP_OAUTH_PENDING_SCHEMA_END = "\n) STRICT;";
const DEVICE_PAIRING_JOIN_CODE_SCHEMA_START = "CREATE TABLE IF NOT EXISTS device_pairing_join_codes (";
const DEVICE_PAIRING_JOIN_CODE_SCHEMA_END = "\n) STRICT;";
const CONFIG_REVISION_KEY_SCHEMA_START = "CREATE TABLE IF NOT EXISTS config_revision_keys (";
const CONFIG_REVISION_KEY_SCHEMA_END = "\n) STRICT;";
function secretStoreSchemaSql() {
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf(SECRET_STORE_SCHEMA_START);
	const endMarkerStart = OPENCLAW_STATE_SCHEMA_SQL.indexOf(SECRET_STORE_SCHEMA_END, start);
	if (!(start >= 0 && endMarkerStart >= start)) throw new Error("OpenClaw secret store schema marker is missing.");
	return OPENCLAW_STATE_SCHEMA_SQL.slice(start, endMarkerStart + 81);
}
/** Lazily install the additive secret store table and index on first write. */
function ensureSecretStoreSchema(database) {
	database.exec(secretStoreSchemaSql());
	ensureColumn(database, "secret_store_entries", "allowed_hosts TEXT");
}
/** Lazily install durable MCP OAuth callback correlation on first feature use. */
function ensureMcpOAuthPendingSchema(database) {
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf(MCP_OAUTH_PENDING_SCHEMA_START);
	const endMarkerStart = OPENCLAW_STATE_SCHEMA_SQL.indexOf(MCP_OAUTH_PENDING_SCHEMA_END, start);
	if (start < 0 || endMarkerStart < start) throw new Error("OpenClaw MCP OAuth pending schema marker is missing.");
	database.exec(OPENCLAW_STATE_SCHEMA_SQL.slice(start, endMarkerStart + 10));
}
/** Lazily install the additive device join-code table on first mint or redemption. */
function ensureDevicePairingJoinCodeSchema(database) {
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf(DEVICE_PAIRING_JOIN_CODE_SCHEMA_START);
	const endMarkerStart = OPENCLAW_STATE_SCHEMA_SQL.indexOf(DEVICE_PAIRING_JOIN_CODE_SCHEMA_END, start);
	if (start < 0 || endMarkerStart < start) throw new Error("OpenClaw device pairing join-code schema marker is missing.");
	database.exec(OPENCLAW_STATE_SCHEMA_SQL.slice(start, endMarkerStart + 10));
}
/** Lazily installs the Gateway's installation-local config revision key owner. */
function ensureConfigRevisionKeySchema(database) {
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf(CONFIG_REVISION_KEY_SCHEMA_START);
	const endMarkerStart = OPENCLAW_STATE_SCHEMA_SQL.indexOf(CONFIG_REVISION_KEY_SCHEMA_END, start);
	if (start < 0 || endMarkerStart < start) throw new Error("OpenClaw config revision key schema marker is missing.");
	database.exec(OPENCLAW_STATE_SCHEMA_SQL.slice(start, endMarkerStart + 10));
}
function ensureAgentDeletionJournalSchema(database) {
	database.exec(`
    CREATE TABLE IF NOT EXISTS agent_deletion_journal (
      agent_id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL DEFAULT '',
      agent_dir TEXT NOT NULL,
      workspace_dir TEXT NOT NULL,
      sessions_dir TEXT NOT NULL,
      database_paths_json TEXT NOT NULL DEFAULT '[]',
      cleanup_paths_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      cleanup_completed INTEGER NOT NULL DEFAULT 0,
      delete_files INTEGER NOT NULL DEFAULT 1
    ) STRICT
  `);
}
function ensureAgentDatabaseLeaseSchema(database) {
	ensureAgentDeletionJournalSchema(database);
	database.exec(`
    CREATE TABLE IF NOT EXISTS agent_database_leases (
      lease_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      path TEXT NOT NULL,
      owner_pid INTEGER NOT NULL,
      owner_start_time INTEGER,
      opened_at INTEGER NOT NULL
    ) STRICT
  `);
}
/**
* Same-version additive table, registered in LAZY_ADDITIVE_STATE_TABLES so
* existing v6 databases stay valid without it. Mirrors the canonical schema;
* a downgraded reader simply loses setup-completion reconciliation.
*/
function ensureDevicePairSetupCompletionSchema(database) {
	database.exec(`
    CREATE TABLE IF NOT EXISTS device_pair_setup_completions (
      setup_id TEXT NOT NULL PRIMARY KEY,
      device_id TEXT NOT NULL,
      device_name TEXT,
      access TEXT NOT NULL,
      completed_at_ms INTEGER NOT NULL,
      delivery_state TEXT NOT NULL CHECK (delivery_state IN ('uncertain', 'confirmed')),
      retain_until_ms INTEGER NOT NULL
    ) STRICT
  `);
}
/** Lazily add setup correlation only when setup pairing first writes or consumes a token. */
function ensureDevicePairSetupBootstrapSchema(database) {
	ensureColumn(database, "device_bootstrap_tokens", "setup_id TEXT");
}
/** Installs environment-owned node binding columns at first cloud enrollment use. */
function ensureWorkerEnvironmentNodeEnrollmentSchema(database) {
	ensureDevicePairSetupCompletionSchema(database);
	ensureColumn(database, "worker_environments", "node_setup_id TEXT");
	ensureColumn(database, "worker_environments", "node_device_id TEXT");
}
function resolveLegacyManagedImageRoot(recordJson) {
	if (typeof recordJson !== "string") return null;
	let record;
	try {
		record = JSON.parse(recordJson);
	} catch {
		return null;
	}
	if (!isRecord(record) || !isRecord(record.original)) return null;
	const mediaRoot = record.original.mediaRoot;
	if (typeof mediaRoot === "string" && mediaRoot.trim()) return path.resolve(mediaRoot);
	const originalPath = record.original.path;
	if (typeof originalPath !== "string" || !originalPath.trim()) return null;
	const resolvedOriginalPath = path.resolve(originalPath);
	return path.dirname(path.dirname(path.dirname(resolvedOriginalPath)));
}
function backfillLegacyManagedImageRoots(db) {
	const rows = db.prepare("SELECT attachment_id, record_json FROM managed_outgoing_image_records").all();
	const updateRoot = db.prepare("UPDATE managed_outgoing_image_records SET original_media_root = ? WHERE attachment_id = ?");
	const deleteRecord = db.prepare("DELETE FROM managed_outgoing_image_records WHERE attachment_id = ?");
	for (const row of rows) {
		const mediaRoot = resolveLegacyManagedImageRoot(row.record_json);
		if (mediaRoot) updateRoot.run(mediaRoot, row.attachment_id);
		else deleteRecord.run(row.attachment_id);
	}
}
function ensureWorkerSessionToolStateSchema(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS worker_turn_tool_authorities (
      session_id TEXT NOT NULL PRIMARY KEY,
      environment_id TEXT NOT NULL,
      owner_epoch INTEGER NOT NULL CHECK (owner_epoch >= 1),
      placement_generation INTEGER NOT NULL CHECK (placement_generation >= 0),
      claim_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      tool_names_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES worker_session_placements(session_id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS worker_session_tool_operations (
      source_session_id TEXT NOT NULL,
      source_claim_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL CHECK (tool_name IN ('sessions_spawn', 'sessions_send')),
      request_digest TEXT NOT NULL,
      operation_seed TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'unknown')),
      child_session_key TEXT,
      result_json TEXT,
      gateway_instance_id TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (source_session_id, source_claim_id, tool_call_id),
      FOREIGN KEY (source_session_id)
        REFERENCES worker_session_placements(session_id) ON DELETE CASCADE
    ) STRICT;
  `);
}
function ensureGitHubPublicationSchema(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS github_publication_requests (
      request_id TEXT NOT NULL PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      request_digest TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_key TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      worktree_id TEXT NOT NULL,
      repository_fingerprint TEXT NOT NULL,
      claim_id TEXT,
      run_id TEXT,
      environment_id TEXT,
      owner_epoch INTEGER CHECK (owner_epoch IS NULL OR owner_epoch >= 1),
      placement_generation INTEGER CHECK (
        placement_generation IS NULL OR placement_generation >= 0
      ),
      identity_source TEXT NOT NULL CHECK (
        identity_source IN ('system-detected', 'system-configured', 'agent-override')
      ),
      identity_profile_id TEXT,
      identity_account_id INTEGER NOT NULL CHECK (identity_account_id >= 1),
      identity_login TEXT NOT NULL,
      title TEXT,
      body TEXT,
      status TEXT NOT NULL CHECK (
        status IN ('requested', 'publishing', 'published', 'failed')
      ),
      gateway_instance_id TEXT,
      repository TEXT,
      branch TEXT NOT NULL,
      base_branch TEXT,
      source_head_commit TEXT,
      source_index_tree TEXT,
      workspace_tree TEXT,
      head_commit TEXT,
      pull_request_url TEXT,
      error_code TEXT,
      next_action TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      reported_at_ms INTEGER,
      UNIQUE (session_id, idempotency_key),
      CHECK (
        (claim_id IS NULL AND run_id IS NULL AND environment_id IS NULL
          AND owner_epoch IS NULL AND placement_generation IS NULL)
        OR
        (claim_id IS NOT NULL AND run_id IS NOT NULL AND placement_generation IS NOT NULL
          AND ((environment_id IS NULL AND owner_epoch IS NULL)
            OR (environment_id IS NOT NULL AND owner_epoch IS NOT NULL)))
      ),
      CHECK (
        (identity_source IS 'system-detected' AND identity_profile_id IS NULL)
        OR
        (identity_source IN ('system-configured', 'agent-override')
          AND identity_profile_id IS NOT NULL)
      ),
      CHECK (
        (source_head_commit IS NULL AND source_index_tree IS NULL AND workspace_tree IS NULL)
        OR
        (source_head_commit IS NOT NULL AND workspace_tree IS NOT NULL)
      ),
      CHECK (
        (status IS 'published' AND pull_request_url IS NOT NULL AND error_code IS NULL
          AND next_action IS NULL)
        OR
        (status IS 'failed' AND pull_request_url IS NULL AND error_code IS NOT NULL
          AND next_action IS NOT NULL)
        OR
        (status IN ('requested', 'publishing') AND pull_request_url IS NULL
          AND error_code IS NULL AND next_action IS NULL)
      )
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_github_publication_requests_pending
      ON github_publication_requests(status, updated_at_ms, request_id);
  `);
}
/** First personal publication write only; status and old readers leave this surface dormant. */
function ensurePersonalGitHubPublicationSchema(db) {
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf("CREATE TABLE IF NOT EXISTS github_personal_publication_requests (");
	const end = OPENCLAW_STATE_SCHEMA_SQL.indexOf("ON github_personal_publication_requests(status, updated_at_ms, request_id);", start);
	if (start < 0 || end < start) throw new Error("Personal GitHub publication schema marker is missing.");
	db.exec(OPENCLAW_STATE_SCHEMA_SQL.slice(start, end + 75));
}
/**
* Add the feature-owned first-use columns that a STRICT rebuild cannot skip.
*
* These columns normally stay absent until their owning feature first writes
* them, and the persistent schema contract accepts that shape. The STRICT
* table rebuild is the one caller that cannot: it recreates each table from
* canonical SQL, which already declares these columns, so a database missing
* them fails the canonical column check and rolls the entire repair back.
* Ensuring them immediately before that rebuild matches the shape the rebuild
* produces anyway, and stays scoped to databases old enough to need it.
*/
function ensureFirstUseAdditiveStateColumnsForStrictMigration(db) {
	for (const { columnName, dataType, tableName } of CLAW_FIRST_USE_ADDITIVE_STATE_COLUMN_DEFINITIONS) ensureColumn(db, tableName, `${columnName} ${dataType}`);
}
function ensureAdditiveStateColumns(db) {
	ensureWorkerSessionToolStateSchema(db);
	for (const { columnName, dataType, tableName } of CLAW_STARTUP_ADDITIVE_STATE_COLUMN_DEFINITIONS) ensureColumn(db, tableName, `${columnName} ${dataType}`);
	if (ensureColumn(db, "claw_package_refs", "updated_at_ms INTEGER NOT NULL DEFAULT 0")) db.exec("UPDATE claw_package_refs SET updated_at_ms = installed_at_ms;");
	ensureColumn(db, "claw_package_refs", "package_integrity TEXT NOT NULL DEFAULT 'sha256:0000000000000000000000000000000000000000000000000000000000000000'");
	if (ensureColumn(db, "diagnostic_events", "sequence INTEGER NOT NULL DEFAULT 0")) db.exec(`
      WITH ranked AS (
        SELECT
          rowid AS event_rowid,
          ROW_NUMBER() OVER (
            PARTITION BY scope
            ORDER BY created_at ASC, rowid ASC
          ) AS sequence
        FROM diagnostic_events
      )
      UPDATE diagnostic_events
      SET sequence = (
        SELECT ranked.sequence
        FROM ranked
        WHERE ranked.event_rowid = diagnostic_events.rowid
      );
    `);
	db.exec("DROP INDEX IF EXISTS idx_diagnostic_events_scope_created;");
	ensureColumn(db, "worktrees", "provisioned_paths_json TEXT");
	ensureColumn(db, "apns_registrations", "relay_origin TEXT");
	ensureColumn(db, "device_pairing_pending", "refreshed_at_ms INTEGER");
	ensureColumn(db, "device_pairing_pending", "browser_origin TEXT");
	ensureColumn(db, "device_pairing_paired", "approved_via TEXT");
	ensureColumn(db, "device_pairing_paired", "browser_origin TEXT");
	ensureColumn(db, "device_pairing_paired", "operator_label TEXT");
	ensureColumn(db, "device_pairing_paired", "node_surface_json TEXT");
	ensureColumn(db, "device_pairing_paired", "pending_node_surface_json TEXT");
	ensureColumn(db, "cron_run_logs", "status TEXT");
	ensureColumn(db, "cron_run_logs", "error TEXT");
	ensureColumn(db, "cron_run_logs", "summary TEXT");
	ensureColumn(db, "cron_run_logs", "diagnostics_summary TEXT");
	ensureColumn(db, "cron_run_logs", "delivery_status TEXT");
	ensureColumn(db, "cron_run_logs", "delivery_error TEXT");
	ensureColumn(db, "cron_run_logs", "delivered INTEGER");
	ensureColumn(db, "cron_run_logs", "session_id TEXT");
	ensureColumn(db, "cron_run_logs", "session_key TEXT");
	ensureColumn(db, "cron_run_logs", "run_id TEXT");
	ensureColumn(db, "cron_run_logs", "run_at_ms INTEGER");
	ensureColumn(db, "cron_run_logs", "duration_ms INTEGER");
	ensureColumn(db, "cron_run_logs", "next_run_at_ms INTEGER");
	ensureColumn(db, "cron_run_logs", "model TEXT");
	ensureColumn(db, "cron_run_logs", "provider TEXT");
	ensureColumn(db, "cron_run_logs", "total_tokens INTEGER");
	ensureColumn(db, "cron_run_logs", "entry_json TEXT NOT NULL DEFAULT '{}'");
	ensureColumn(db, "cron_run_logs", "created_at INTEGER NOT NULL DEFAULT 0");
	backfillCronRunLogEntryJson(db);
	ensureColumn(db, "acp_replay_events", "estimated_bytes INTEGER NOT NULL DEFAULT 0");
	ensureColumn(db, "acp_replay_sessions", "estimated_bytes INTEGER NOT NULL DEFAULT 0");
	backfillAcpReplayEstimatedBytes(db);
	ensureColumn(db, "cron_jobs", "description TEXT");
	ensureColumn(db, "cron_jobs", "declaration_key TEXT");
	ensureColumn(db, "cron_jobs", "owner_agent_id TEXT");
	ensureColumn(db, "cron_jobs", "name TEXT NOT NULL DEFAULT ''");
	ensureColumn(db, "cron_jobs", "enabled INTEGER NOT NULL DEFAULT 1");
	ensureColumn(db, "cron_jobs", "agent_id TEXT");
	ensureColumn(db, "cron_jobs", "payload_kind TEXT NOT NULL DEFAULT 'message'");
	ensureColumn(db, "cron_jobs", "state_json TEXT NOT NULL DEFAULT '{}'");
	ensureColumn(db, "cron_jobs", "runtime_updated_at_ms INTEGER");
	ensureColumn(db, "cron_jobs", "schedule_identity TEXT");
	ensureColumn(db, "cron_jobs", "sort_order INTEGER NOT NULL DEFAULT 0");
	backfillCronJobsFromJobJson(db);
	ensureColumn(db, "sandbox_registry_entries", "session_key TEXT");
	ensureColumn(db, "sandbox_registry_entries", "backend_id TEXT");
	ensureColumn(db, "sandbox_registry_entries", "runtime_label TEXT");
	ensureColumn(db, "sandbox_registry_entries", "image TEXT");
	ensureColumn(db, "sandbox_registry_entries", "created_at_ms INTEGER");
	ensureColumn(db, "sandbox_registry_entries", "last_used_at_ms INTEGER");
	ensureColumn(db, "sandbox_registry_entries", "config_label_kind TEXT");
	ensureColumn(db, "sandbox_registry_entries", "config_hash TEXT");
	ensureColumn(db, "sandbox_registry_entries", "cdp_port INTEGER");
	ensureColumn(db, "sandbox_registry_entries", "no_vnc_port INTEGER");
	ensureColumn(db, "delivery_queue_entries", "entry_kind TEXT");
	ensureColumn(db, "delivery_queue_entries", "session_key TEXT");
	ensureColumn(db, "delivery_queue_entries", "channel TEXT");
	ensureColumn(db, "delivery_queue_entries", "target TEXT");
	ensureColumn(db, "delivery_queue_entries", "account_id TEXT");
	ensureColumn(db, "delivery_queue_entries", "retry_count INTEGER NOT NULL DEFAULT 0");
	ensureColumn(db, "delivery_queue_entries", "last_attempt_at INTEGER");
	ensureColumn(db, "delivery_queue_entries", "last_error TEXT");
	ensureColumn(db, "delivery_queue_entries", "recovery_state TEXT");
	ensureColumn(db, "delivery_queue_entries", "platform_send_started_at INTEGER");
	backfillDeliveryQueueEntriesFromEntryJson(db);
	if (ensureColumn(db, "managed_outgoing_image_records", "original_media_root TEXT NOT NULL DEFAULT ''")) backfillLegacyManagedImageRoots(db);
	ensureColumn(db, "managed_outgoing_image_records", "agent_id TEXT");
	ensureColumn(db, "managed_outgoing_image_records", "cleanup_pending INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_pending IN (0, 1))");
	ensureColumn(db, "current_conversation_bindings", "conversation_kind TEXT NOT NULL DEFAULT 'channel'");
	ensureColumn(db, "device_bootstrap_tokens", "pending_profile_json TEXT");
	ensureColumn(db, "gateway_restart_handoff", "restart_trace_started_at INTEGER");
	ensureColumn(db, "gateway_restart_handoff", "restart_trace_last_at INTEGER");
	ensureColumn(db, "gateway_restart_intent", "reason TEXT");
	ensureColumn(db, "gateway_restart_sentinel", "delivery_channel TEXT");
	ensureColumn(db, "gateway_restart_sentinel", "delivery_to TEXT");
	ensureColumn(db, "gateway_restart_sentinel", "delivery_account_id TEXT");
	ensureColumn(db, "gateway_restart_sentinel", "message TEXT");
	ensureColumn(db, "gateway_restart_sentinel", "continuation_json TEXT");
	ensureColumn(db, "gateway_restart_sentinel", "doctor_hint TEXT");
	ensureColumn(db, "gateway_restart_sentinel", "stats_json TEXT");
	ensureColumn(db, "gateway_boot_lifecycle", "startup_reason TEXT");
	ensureColumn(db, "official_external_plugin_catalog_snapshots", "trust_mode TEXT");
	ensureColumn(db, "official_external_plugin_catalog_snapshots", "trust_key_id TEXT");
	ensureColumn(db, "official_external_plugin_catalog_snapshots", "trust_signature_count INTEGER");
	ensureColumn(db, "official_external_plugin_catalog_snapshots", "trust_threshold INTEGER");
	ensureColumn(db, "official_external_plugin_catalog_snapshots", "trust_verified_at TEXT");
	if (ensureColumn(db, "task_runs", "requester_agent_id TEXT")) repairLegacyTaskAgentAttribution(db);
	repairLegacyTaskDeliveryStatuses(db);
	ensureColumn(db, "task_runs", "tool_use_count INTEGER");
	ensureColumn(db, "task_runs", "last_tool_name TEXT");
	ensureColumn(db, "task_runs", "detail_json TEXT");
	repairLegacySubagentSuspensionReasons(db);
	repairLegacySubagentExecutionPayloads(db);
	repairLegacySubagentTaskBindings(db);
	repairLegacySubagentRetainedResults(db);
	ensureColumn(db, "worker_environments", "bootstrap_bundle_hash TEXT");
	ensureColumn(db, "worker_environments", "bootstrap_openclaw_version TEXT");
	ensureColumn(db, "worker_environments", "bootstrap_protocol_features_json TEXT");
	ensureColumn(db, "worker_environments", "bootstrap_install_kind TEXT");
	ensureColumn(db, "worker_environments", "owner_epoch INTEGER NOT NULL DEFAULT 0 CHECK (owner_epoch >= 0)");
	ensureColumn(db, "worker_environments", "ssh_host_key TEXT");
	ensureColumn(db, "worker_workspace_pending_results", "staged_result_ref TEXT");
	ensureColumn(db, "worker_environments", "teardown_terminal_state TEXT CHECK (teardown_terminal_state IN ('destroyed', 'failed'))");
	ensureOperatorApprovalResolutionRefs(db);
}
//#endregion
//#region src/state/openclaw-state-db-schema-v13-widerow.ts
const FAILURE_DESTINATION_COLUMNS = [
	["failure_delivery_mode", "mode"],
	["failure_delivery_channel", "channel"],
	["failure_delivery_to", "to"],
	["failure_delivery_account_id", "accountId"]
];
function reprojectLegacyCronJson(db) {
	const projectionColumns = FAILURE_DESTINATION_COLUMNS.map(([columnName]) => tableHasColumn(db, "cron_jobs", columnName) ? quoteSqliteIdentifier(columnName) : `NULL AS ${quoteSqliteIdentifier(columnName)}`);
	const lastRunStatus = tableHasColumn(db, "cron_jobs", "last_run_status") ? "last_run_status" : "NULL AS last_run_status";
	const rows = db.prepare(`SELECT store_key, job_id, enabled, job_json, state_json, ${lastRunStatus}, ${projectionColumns.join(", ")}
         FROM cron_jobs`).all();
	const update = db.prepare("UPDATE cron_jobs SET job_json = ?, state_json = ? WHERE store_key = ? AND job_id = ?");
	for (const row of rows) {
		if (typeof row.store_key !== "string" || typeof row.job_id !== "string" || typeof row.job_json !== "string" || typeof row.state_json !== "string") throw new Error("OpenClaw v12 cron job row is not canonical");
		const job = asNullableRecord(safeParseJson(row.job_json));
		const state = asNullableRecord(safeParseJson(row.state_json));
		if (!job || !state) continue;
		let changed = false;
		const delivery = asNullableRecord(job.delivery);
		const destination = asNullableRecord(delivery?.failureDestination);
		if ((!Object.hasOwn(job, "delivery") || delivery !== null) && (!delivery || !Object.hasOwn(delivery, "failureDestination") || destination !== null)) {
			const nextDelivery = delivery ?? {};
			const nextDestination = destination ?? {};
			for (const [columnName, fieldName] of FAILURE_DESTINATION_COLUMNS) {
				const value = row[columnName];
				if (typeof value !== "string" || Object.hasOwn(nextDestination, fieldName)) continue;
				nextDestination[fieldName] = value === "" ? null : value;
				changed = true;
			}
			if (changed) {
				nextDelivery.failureDestination = nextDestination;
				job.delivery = nextDelivery;
			}
		}
		if (typeof job.enabled !== "boolean") {
			job.enabled = row.enabled !== 0;
			changed = true;
		}
		const hasLegacyStatus = Object.hasOwn(state, "lastStatus");
		if (!Object.hasOwn(state, "lastRunStatus") && (hasLegacyStatus || typeof row.last_run_status === "string")) {
			state.lastRunStatus = hasLegacyStatus ? state.lastStatus : row.last_run_status;
			changed = true;
		}
		if (changed) update.run(JSON.stringify(job), JSON.stringify(state), row.store_key, row.job_id);
	}
}
function rebuildJsonCanonicalTable(db, tableName) {
	const migrationTable = `${tableName}_migration_v13`;
	if (tableExists(db, migrationTable)) throw new Error(`OpenClaw v13 migration table already exists: ${migrationTable}`);
	const startMarker = `CREATE TABLE IF NOT EXISTS ${tableName} (`;
	const start = OPENCLAW_STATE_SCHEMA_SQL.indexOf(startMarker);
	const end = start >= 0 ? OPENCLAW_STATE_SCHEMA_SQL.indexOf("\n) STRICT;", start) : -1;
	if (start < 0 || end < 0) throw new Error(`Canonical ${tableName} schema block is missing`);
	const migrationSchema = OPENCLAW_STATE_SCHEMA_SQL.slice(start, end + 10).replace(startMarker, `CREATE TABLE ${migrationTable} (`);
	db.exec(migrationSchema);
	const columns = db.prepare(`PRAGMA table_xinfo(${migrationTable})`).all().flatMap((column) => column.hidden === 0 && typeof column.name === "string" ? [quoteSqliteIdentifier(column.name)] : []).join(", ");
	db.exec(`INSERT INTO ${migrationTable} (${columns}) SELECT ${columns} FROM ${tableName};`);
	db.exec(`DROP TABLE ${tableName};`);
	db.exec(`ALTER TABLE ${migrationTable} RENAME TO ${tableName};`);
}
/** Fold obsolete physical projections into canonical JSON before removing their columns. */
function migrateJsonCanonicalWideRowsV13(db, previousVersion) {
	if (previousVersion >= 13) return false;
	let migrated = false;
	if (tableExists(db, "cron_jobs") && tableHasColumn(db, "cron_jobs", "schedule_kind")) {
		reprojectLegacyCronJson(db);
		rebuildJsonCanonicalTable(db, "cron_jobs");
		migrated = true;
	}
	const hasSetupState = tableExists(db, "workspace_setup_state");
	const hasAttestations = tableExists(db, "workspace_attestations");
	if (hasSetupState && !tableHasColumn(db, "workspace_setup_state", "attested_at_ms")) {
		db.exec("ALTER TABLE workspace_setup_state ADD COLUMN attested_at_ms INTEGER;");
		db.exec("ALTER TABLE workspace_setup_state ADD COLUMN attestation_updated_at_ms INTEGER;");
		rebuildJsonCanonicalTable(db, "workspace_setup_state");
		migrated = true;
	}
	if (hasAttestations) {
		db.exec(`
      UPDATE workspace_setup_state
         SET attested_at_ms = (
               SELECT attested_at_ms FROM workspace_attestations
                WHERE workspace_attestations.workspace_key = workspace_setup_state.workspace_key
             ),
             attestation_updated_at_ms = (
               SELECT updated_at_ms FROM workspace_attestations
                WHERE workspace_attestations.workspace_key = workspace_setup_state.workspace_key
             )
       WHERE workspace_key IN (SELECT workspace_key FROM workspace_attestations);
    `);
		db.exec(`
      INSERT INTO workspace_setup_state (
        workspace_key, workspace_path, attested_at_ms, attestation_updated_at_ms
      )
      SELECT a.workspace_key,
             (SELECT alias.workspace_path FROM workspace_path_aliases alias
               WHERE alias.workspace_key = a.workspace_key LIMIT 1),
             a.attested_at_ms,
             a.updated_at_ms
        FROM workspace_attestations a
       WHERE a.workspace_key NOT IN (SELECT workspace_key FROM workspace_setup_state);
    `);
		db.exec("DROP TABLE workspace_attestations;");
		migrated = true;
	}
	if ((hasSetupState || hasAttestations) && tableExists(db, "workspace_generated_bootstrap_hashes")) {
		rebuildJsonCanonicalTable(db, "workspace_generated_bootstrap_hashes");
		db.exec(`
      DELETE FROM workspace_generated_bootstrap_hashes
       WHERE workspace_key NOT IN (SELECT workspace_key FROM workspace_setup_state);
    `);
	}
	for (const [tableName, jsonColumn, stateKey] of [[
		"auth_profile_stores",
		"store_json",
		"authProfiles.store"
	], [
		"auth_profile_state",
		"state_json",
		"authProfiles.state"
	]]) {
		if (!tableExists(db, tableName)) continue;
		db.prepare(`INSERT INTO config_machine_state (state_key, value_json, updated_at_ms)
       SELECT ?, ${jsonColumn}, updated_at FROM ${tableName} WHERE store_key = 'shared'
       ON CONFLICT(state_key) DO NOTHING`).run(stateKey);
		db.exec(`DROP TABLE ${tableName};`);
		migrated = true;
	}
	if (tableExists(db, "installed_plugin_index")) {
		const workspaceDirColumn = tableHasColumn(db, "installed_plugin_index", "workspace_dir") ? "workspace_dir" : "NULL AS workspace_dir";
		const rawRow = db.prepare(`SELECT version, warning, host_contract_version, compat_registry_version,
                migration_version, policy_hash, generated_at_ms, ${workspaceDirColumn},
                refresh_reason, install_records_json, plugins_json, diagnostics_json,
                updated_at_ms
           FROM installed_plugin_index
          WHERE index_key = 'installed-plugin-index'`).get();
		const installRecords = asNullableRecord(safeParseJson(String(rawRow?.install_records_json ?? "")));
		const plugins = safeParseJson(String(rawRow?.plugins_json ?? ""));
		const diagnostics = safeParseJson(String(rawRow?.diagnostics_json ?? ""));
		const row = rawRow && installRecords && Array.isArray(plugins) && Array.isArray(diagnostics) ? rawRow : void 0;
		if (row) {
			const index = {
				version: Number(row.version),
				...typeof row.warning === "string" && row.warning ? { warning: row.warning } : {},
				hostContractVersion: row.host_contract_version,
				compatRegistryVersion: row.compat_registry_version,
				migrationVersion: Number(row.migration_version),
				policyHash: row.policy_hash,
				generatedAtMs: Number(row.generated_at_ms),
				...typeof row.workspace_dir === "string" ? { workspaceDir: row.workspace_dir } : {},
				...typeof row.refresh_reason === "string" && row.refresh_reason ? { refreshReason: row.refresh_reason } : {},
				installRecords,
				plugins,
				diagnostics
			};
			db.prepare(`INSERT INTO config_machine_state (state_key, value_json, updated_at_ms)
         VALUES (?, ?, ?) ON CONFLICT(state_key) DO NOTHING`).run("plugins.installedIndex", JSON.stringify({
				revision: Number(row.updated_at_ms),
				index
			}), Number(row.updated_at_ms));
		}
		db.exec("DROP TABLE installed_plugin_index;");
		migrated = true;
	}
	if (tableExists(db, "subagent_runs") && tableHasColumn(db, "subagent_runs", "task")) {
		repairLegacySubagentRetainedResults(db);
		rebuildJsonCanonicalTable(db, "subagent_runs");
		migrated = true;
	}
	return migrated;
}
//#endregion
//#region src/state/openclaw-state-ownership.ts
const STATE_SUPERVISION_KEY = "gateway.supervision";
const MAX_OWNERSHIP_TIMESTAMP_MS = 864e13;
const MANAGER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
var OpenClawStateOwnershipError = class extends Error {};
function isOpenClawStateWriteContentionError(error) {
	return error instanceof StateDatabaseCoordinatorContentionError || isSqliteLockError(error);
}
var OpenClawStateOwnershipMetadataError = class extends OpenClawStateOwnershipError {
	constructor(databasePath, message) {
		super(`OpenClaw shared state ownership metadata is invalid at ${databasePath}: ${message}. Repair it with OPENCLAW_SUPERVISOR_MODE=external openclaw database ownership claim --manager <manager-id>.`);
		this.databasePath = databasePath;
		this.name = "OpenClawStateOwnershipMetadataError";
	}
};
var OpenClawStateExternalOwnershipError = class extends OpenClawStateOwnershipError {
	constructor(databasePath, managerId) {
		super(`OpenClaw shared state database ${databasePath} is externally supervised by ${managerId}. Use that external supervisor with OPENCLAW_SUPERVISOR_MODE=external for writable operations.`);
		this.databasePath = databasePath;
		this.managerId = managerId;
		this.name = "OpenClawStateExternalOwnershipError";
	}
};
function normalizeOpenClawStateManagerId(managerId) {
	const normalized = managerId.trim();
	if (!MANAGER_ID_PATTERN.test(normalized)) throw new Error("External state ownership manager id must be a 1-128 character ASCII identifier.");
	return normalized;
}
function parseExternalOwnership(valueJson, databasePath) {
	let value;
	try {
		value = JSON.parse(valueJson);
	} catch {
		throw new OpenClawStateOwnershipMetadataError(databasePath, "reserved value is not valid JSON");
	}
	const record = isRecord(value) ? value : void 0;
	const keys = record ? Object.keys(record).toSorted().join(",") : "";
	const managerId = record?.managerId;
	const claimedAt = record?.claimedAt;
	if (keys !== "claimedAt,managerId,mode,version" || record?.version !== 1 || record?.mode !== "external" || typeof managerId !== "string" || !MANAGER_ID_PATTERN.test(managerId) || typeof claimedAt !== "number" || !Number.isSafeInteger(claimedAt) || claimedAt < 0 || claimedAt > MAX_OWNERSHIP_TIMESTAMP_MS) throw new OpenClawStateOwnershipMetadataError(databasePath, "reserved value does not match the version 1 external ownership contract");
	return {
		version: 1,
		mode: "external",
		managerId,
		claimedAt
	};
}
/** Inspect the reserved ownership row without entering the shared-state lifecycle. */
function inspectOpenClawStateOwnershipFromDatabase(database, databasePath, configMachineStateTableReady = false) {
	if (!configMachineStateTableReady && !tableExists(database, "config_machine_state")) return null;
	const row = database.prepare("SELECT value_json FROM config_machine_state WHERE state_key = ? LIMIT 1").get(STATE_SUPERVISION_KEY);
	if (!row) return null;
	if (typeof row.value_json !== "string") throw new OpenClawStateOwnershipMetadataError(databasePath, "reserved value is not text");
	return parseExternalOwnership(row.value_json, databasePath);
}
function inspectOwnershipThroughConnection(location, databasePath) {
	const database = openNodeSqliteDatabase(location, { readOnly: true });
	try {
		database.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS}; PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;`);
		return inspectOpenClawStateOwnershipFromDatabase(database, databasePath);
	} finally {
		database.close();
	}
}
function inspectJournalAwarePublicOwnership(databasePath) {
	const prepared = prepareSqliteReadOnlyLocationSync(databasePath);
	try {
		return inspectOwnershipThroughConnection(prepared.location, databasePath);
	} finally {
		prepared.cleanup();
	}
}
function inspectOwnershipWhileCoordinatorHeld(databasePath, busyTimeoutMs) {
	const resolvedPath = path.resolve(databasePath);
	if (!existsSync(resolvedPath)) return null;
	const database = openNodeSqliteDatabase(resolvedPath);
	try {
		database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}; PRAGMA trusted_schema = OFF;`);
		return inspectOpenClawStateOwnershipFromDatabase(database, resolvedPath);
	} finally {
		database.close();
	}
}
function acquireOpenClawStateOwnershipCoordinator(databasePath, busyTimeoutMs) {
	return acquireStateDatabaseCoordinator({
		databasePath,
		busyTimeoutMs
	});
}
function runWithOpenClawStateOwnershipCoordinator(databasePath, operationLabel, operation) {
	return runWithSqliteCoordinator(acquireOpenClawStateOwnershipCoordinator(databasePath, OPENCLAW_SQLITE_BUSY_TIMEOUT_MS), operationLabel, operation);
}
/** Inspect one resolved state database path without mutating its state tree. */
function inspectOpenClawStateOwnershipAtPath(databasePath) {
	const resolvedPath = path.resolve(databasePath);
	if (!existsSync(resolvedPath)) return null;
	return inspectJournalAwarePublicOwnership(resolvedPath);
}
function assertOwnershipAllowsWrite(status, databasePath, env) {
	if (status && !isGatewayExternallySupervised(env)) throw new OpenClawStateExternalOwnershipError(databasePath, status.managerId);
}
/** Fence and hold one path-based mutation until its main-file preamble is complete. */
function acquireOpenClawStateWriteAccess(options) {
	const resolvedPath = path.resolve(options.databasePath);
	const busyTimeoutMs = normalizeSqliteNonNegativeInteger(options.busyTimeoutMs ?? 5e3, "busyTimeoutMs");
	const access = acquireOpenClawStateOwnershipCoordinator(resolvedPath, busyTimeoutMs);
	try {
		quarantineOrphanedSqliteSidecars(resolvedPath);
		assertOwnershipAllowsWrite(inspectOwnershipWhileCoordinatorHeld(resolvedPath, busyTimeoutMs), resolvedPath, options.env ?? process.env);
		return access;
	} catch (operationError) {
		let releaseFailed = false;
		let releaseError;
		try {
			access.release();
		} catch (error) {
			releaseFailed = true;
			releaseError = error;
		}
		if (releaseFailed) throw createSqliteLifecycleAggregateError([operationError, releaseError], "state ownership inspection and coordinator release both failed", operationError);
		throw operationError;
	}
}
function runWithOpenClawStateWriteAccess(options, operationLabel, operation) {
	return runWithSqliteCoordinator(acquireOpenClawStateWriteAccess(options), operationLabel, operation);
}
/** Check write admission; callers may defer orphan-sidecar recovery until mutation is certain. */
async function assertOpenClawStateWriteAllowedAtPath(options) {
	const databasePath = path.resolve(options.databasePath);
	const recoverOrphanedSidecars = options.recoverOrphanedSidecars !== false;
	if (recoverOrphanedSidecars) quarantineOrphanedSqliteSidecars(databasePath);
	if (!existsSync(databasePath)) return;
	const env = options.env ?? process.env;
	if (recoverOrphanedSidecars && isGatewayExternallySupervised(env)) {
		runWithOpenClawStateWriteAccess({
			...options,
			databasePath
		}, "shared state write admission", () => void 0);
		return;
	}
	const prepared = await prepareSqliteReadOnlyLocation(databasePath);
	try {
		assertOwnershipAllowsWrite(inspectOwnershipThroughConnection(prepared.location, databasePath), databasePath, env);
	} finally {
		prepared.cleanup();
	}
}
/** Fence shared-state writes once an external manager has claimed ownership. */
function assertOpenClawStateWriteAllowed(options) {
	const resolvedPath = path.resolve(options.databasePath);
	assertOwnershipAllowsWrite(inspectOpenClawStateOwnershipFromDatabase(options.database, resolvedPath, options.schemaReady), resolvedPath, options.env ?? process.env);
}
//#endregion
//#region src/state/openclaw-state-db-startup-checkpoint.ts
const NATIVE_STARTUP_BOOTSTRAP_OBJECTS = /* @__PURE__ */ new Set([
	"table:device_auth_tokens",
	"index:idx_device_auth_tokens_updated",
	"table:device_identities",
	"index:idx_device_identities_device",
	"table:exec_approvals_config",
	"table:macos_port_guardian_records",
	"index:idx_macos_port_guardian_records_port",
	"table:schema_meta",
	"table:state_leases",
	"index:idx_state_leases_expiry",
	"index:idx_state_leases_owner"
]);
function isUninitializedNativeStartupDatabase(db) {
	if (readSqliteUserVersion(db) !== 0) return false;
	const objects = db.prepare("SELECT type, name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
	if (objects.some(({ type, name }) => typeof type !== "string" || typeof name !== "string" || !NATIVE_STARTUP_BOOTSTRAP_OBJECTS.has(`${type}:${name}`))) return false;
	const tableNames = new Set(objects.filter(({ type }) => type === "table").map(({ name }) => name));
	if (tableNames.has("schema_meta") && db.prepare("SELECT 1 FROM schema_meta LIMIT 1").get()) return false;
	return !(tableNames.has("state_leases") && db.prepare("SELECT 1 FROM state_leases LIMIT 1").get());
}
function ensureStartupMigrationCheckpointSchema(db, pathname, env) {
	runSqliteImmediateTransactionSync(db, () => {
		assertOpenClawStateWriteAllowed({
			database: db,
			databasePath: pathname,
			env
		});
		assertSupportedSchemaVersion(db, pathname);
		db.exec(`
        CREATE TABLE IF NOT EXISTS schema_meta (
          meta_key TEXT NOT NULL PRIMARY KEY,
          role TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          agent_id TEXT,
          app_version TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS state_leases (
          scope TEXT NOT NULL,
          lease_key TEXT NOT NULL,
          owner TEXT NOT NULL,
          expires_at INTEGER,
          heartbeat_at INTEGER,
          payload_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (scope, lease_key)
        );
        CREATE INDEX IF NOT EXISTS idx_state_leases_expiry
          ON state_leases(expires_at, scope, lease_key)
          WHERE expires_at IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_state_leases_owner
          ON state_leases(owner, updated_at DESC);
      `);
		ensureColumn(db, "schema_meta", "app_version TEXT");
	}, {
		busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS,
		databaseLabel: pathname,
		operationLabel: "state.schema.ensure-startup-checkpoint"
	});
}
function withOpenClawStateStartupCheckpointConnection(callback, options, initializeCanonicalSchema) {
	const env = options.env ?? process.env;
	const pathname = resolveDatabasePath(options);
	return runWithOpenClawStateWriteAccess({
		databasePath: pathname,
		env
	}, "startup migration checkpoint database operation", () => {
		ensureOpenClawStatePermissions(pathname, env);
		const db = openNodeSqliteDatabase(pathname);
		try {
			configureSqlitePreSchemaPragmas(db, { busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS });
			assertSqliteIntegrity(db, pathname);
			if (isUninitializedNativeStartupDatabase(db)) initializeCanonicalSchema(db, pathname, env);
			ensureStartupMigrationCheckpointSchema(db, pathname, env);
			return callback(db);
		} finally {
			db.close();
			ensureOpenClawStatePermissions(pathname, env);
		}
	});
}
/** Admit only recognized native bootstrap; versioned state stays on the read-only path. */
function initializeNativeOpenClawStateConnection(options, initializeCanonicalSchema) {
	if (!withExistingOpenClawStateDatabaseReadOnly(({ db }) => isUninitializedNativeStartupDatabase(db), options)) return;
	const env = options.env ?? process.env;
	const pathname = resolveDatabasePath(options);
	runWithOpenClawStateWriteAccess({
		databasePath: pathname,
		env
	}, "native state bootstrap", () => {
		const db = openNodeSqliteDatabase(pathname);
		try {
			if (!isUninitializedNativeStartupDatabase(db)) return;
			assertSqliteIntegrity(db, pathname);
			initializeCanonicalSchema(db, pathname, env);
		} finally {
			clearNodeSqliteKyselyCacheForDatabase(db);
			db.close();
		}
		ensureOpenClawStatePermissions(pathname, env);
	});
}
//#endregion
//#region src/state/openclaw-state-db.ts
/** Reconfirm an advisory worker failure on the live owner connection. */
function confirmOpenClawStateDatabaseIntegrity(pathname) {
	const resolvedPath = path.resolve(pathname);
	closeOpenClawStateDatabaseByPath(resolvedPath);
	return confirmSqliteFileIntegrity(resolvedPath, resolvedPath);
}
/** Reject a fresh shared-state open after known corruption until repair clears it. */
function assertOpenClawStateDatabaseFreshOpenAllowed(options = {}) {
	const env = options.env ?? process.env;
	openClawStateDatabaseCache.assertOpenClawStateDatabaseFreshOpenAllowedAtPath(resolveDatabasePath(options), env);
}
const stateDbLog = createSubsystemLogger("state/db");
function executeCanonicalStateSchema(database, options) {
	database.exec(getOpenClawStateRuntimeSchema(options));
}
function repairStateSchema(pathname, env) {
	ensureOpenClawStatePermissions(pathname, env);
	const db = openNodeSqliteDatabase(pathname);
	const rebuiltIndexNames = /* @__PURE__ */ new Set();
	let ownershipRefused = false;
	try {
		db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
		assertSupportedSchemaVersion(db, pathname);
		db.exec("PRAGMA foreign_keys = OFF;");
		const changes = runSqliteImmediateTransactionSync(db, () => {
			assertOpenClawStateWriteAllowed({
				database: db,
				databasePath: pathname,
				env
			});
			const applied = [];
			const previousVersion = readSqliteUserVersion(db);
			if (previousVersion === 15) {
				for (const name of repairCanonicalSqliteIndexes(db, pathname, OPENCLAW_STATE_SCHEMA_SQL, { allowMissingColumns: true })) rebuiltIndexNames.add(name);
				assertSqliteSchemaTablesPresent(db, pathname, OPENCLAW_STATE_SCHEMA_SQL, { allowedMissingTables: LAZY_ADDITIVE_STATE_TABLES });
			} else openClawStateMigrationAssertions.get(previousVersion)?.(db, { pathname });
			if (rebuiltIndexNames.size === 0) assertSqliteIntegrity(db, pathname);
			dropLegacyStateTables(db);
			applied.push(...runRetiredStateTableMigrations(db, previousVersion));
			if (migrateSingletonStateFoldInV12(db, previousVersion)) applied.push("Folded singleton state tables into config_machine_state (v12)");
			if (migrateWorkerPlacementExecutionModeSchema(db, previousVersion)) applied.push("Migrated cloud worker placements to execution modes");
			applied.push(...describeAgentPathMigration(migrateAgentDatabaseRelativePaths(db, previousVersion, pathname)));
			if (repairAgentDatabasesCompositePrimaryKey(db)) applied.push(`Migrated shared state agent database registry primary key → agent_id,path`);
			if (repairAuditEventsSchema(db)) applied.push(`Migrated shared state audit event ledger → versioned message lifecycle schema`);
			applied.push(...repairOperatorApprovalSchema(db));
			const needsSessionWatchMigration = needsSessionWatchCursorProvenanceMigration(db, previousVersion);
			const sessionWatchResult = migrateSessionWatchCursorProvenance(db);
			if (needsSessionWatchMigration) applied.push(`Migrated shared state session watch cursors → provenance column (${sessionWatchResult.migratedAmbientWatches} ambient, ${sessionWatchResult.removedLegacySentinels} sentinels removed)`);
			assertCanonicalStateSchemaShape(db, pathname);
			if (tableExists(db, "audit_events")) {
				ensureAdditiveStateColumns(db);
				if (migrateJsonCanonicalWideRowsV13(db, previousVersion)) applied.push("Consolidated shared state tables (v13)");
				if (migrateCronCreatorNamespaces(db, previousVersion)) applied.push("Qualified historical cron creator attribution as unknown (v14)");
				if (migrateConversationBindingTargets(db, previousVersion)) applied.push("Removed redundant conversation binding target projections (v15)");
				executeCanonicalStateSchema(db, { includeVersionLazyAdditiveTables: previousVersion !== 15 });
				if (previousVersion < 3) {
					repairLegacyGatewayRestartHandoffsForStrictMigration(db);
					ensureFirstUseAdditiveStateColumnsForStrictMigration(db);
				}
				const strictMigration = migrateSqliteSchemaToStrictInTransaction(db, getOpenClawStateRuntimeSchema({ includeVersionLazyAdditiveTables: previousVersion !== 15 }), { databaseLabel: pathname });
				if (strictMigration.migratedTables.length > 0) applied.push(`Migrated shared state tables to SQLite STRICT typing (${strictMigration.migratedTables.length})`);
				for (const name of repairCanonicalSqliteIndexes(db, pathname, OPENCLAW_STATE_SCHEMA_SQL, { verifyPhysicalIntegrity: false })) rebuiltIndexNames.add(name);
			}
			markCurrentStateSchemaVersion(db, { createMetadataIfMissing: previousVersion < 15 });
			if (readSqliteUserVersion(db) === 15) assertCurrentStateRuntimeSchema(db, pathname);
			if (rebuiltIndexNames.size > 0) applied.push(`Rebuilt canonical shared-state SQLite indexes (${rebuiltIndexNames.size})`);
			return applied;
		}, {
			busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS,
			databaseLabel: pathname,
			operationLabel: "state.schema.repair"
		});
		const quarantineCleared = clearOpenClawDatabaseQuarantine(pathname, { env });
		clearOpenClawStateDatabaseOpenFailure(pathname);
		return {
			changes,
			warnings: quarantineCleared ? [] : [`Persisted quarantine record for ${pathname} could not be cleared; rerun openclaw doctor --fix so the repaired database is not refused again.`]
		};
	} catch (err) {
		if (err instanceof OpenClawStateOwnershipError) {
			ownershipRefused = true;
			throw err;
		}
		return {
			changes: [],
			warnings: [`Failed migrating shared state database schema at ${pathname}: ${String(err).replace(/has a legacy ([a-z ]+) schema; run openclaw doctor --fix to migrate it\./u, "has a legacy $1 schema; automatic repair refused the unrecognized schema shape.")}`]
		};
	} finally {
		if (db.isOpen) db.exec("PRAGMA foreign_keys = ON;");
		clearNodeSqliteKyselyCacheForDatabase(db);
		db.close();
		if (!ownershipRefused) ensureOpenClawStatePermissions(pathname, env);
	}
}
function repairOpenClawStateDatabaseSchema(options = {}) {
	const env = options.env ?? process.env;
	const pathname = resolveDatabasePath(options);
	if (!existsSync(pathname)) return {
		changes: [],
		warnings: []
	};
	return runWithOpenClawStateWriteAccess({
		databasePath: pathname,
		env
	}, "state schema repair", () => withStateSchemaFence({ databasePath: pathname }, () => repairStateSchema(pathname, env)));
}
function needsOpenClawStateDatabaseSchemaRepair(pathname) {
	let database;
	try {
		database = openNodeSqliteDatabase(pathname, { readOnly: true });
		assertSupportedSchemaVersion(database, pathname);
		const needsRepair = readSqliteUserVersion(database) !== 15 || detectOpenClawStateDatabaseSchemaMigrationsFromDatabase(database, pathname).length > 0;
		if (!needsRepair) assertCurrentStateRuntimeSchema(database, pathname);
		return needsRepair;
	} catch {
		return true;
	} finally {
		database?.close();
	}
}
/** Skip the exclusive doctor repair when automatic migration sees a canonical current schema. */
function repairOpenClawStateDatabaseSchemaIfNeeded(options = {}) {
	const env = options.env ?? process.env;
	const pathname = resolveDatabasePath(options);
	if (!existsSync(pathname)) return {
		changes: [],
		warnings: []
	};
	return runWithOpenClawStateWriteAccess({
		databasePath: pathname,
		env
	}, "state schema repair preflight/repair", () => needsOpenClawStateDatabaseSchemaRepair(pathname) ? withStateSchemaFence({ databasePath: pathname }, () => repairStateSchema(pathname, env)) : {
		changes: [],
		warnings: []
	});
}
function ensureSchema(db, pathname, env, busyTimeoutMs = OPENCLAW_SQLITE_BUSY_TIMEOUT_MS, initializeNativeOnly = false) {
	try {
		if (isOpenClawStateSchemaFastPathEligible(db, pathname)) {
			assertOpenClawStateWriteAllowed({
				database: db,
				databasePath: pathname,
				env
			});
			return;
		}
	} catch {}
	withStateSchemaFence({ databasePath: pathname }, () => {
		const now = Date.now();
		const kysely = getNodeSqliteKysely(db);
		db.exec("PRAGMA foreign_keys = OFF;");
		try {
			runSqliteImmediateTransactionSync(db, () => {
				assertOpenClawStateWriteAllowed({
					database: db,
					databasePath: pathname,
					env
				});
				assertSupportedSchemaVersion(db, pathname);
				if (initializeNativeOnly && !isUninitializedNativeStartupDatabase(db)) return [];
				const previousVersion = readSqliteUserVersion(db);
				if (previousVersion === 15) {
					verifyAndRepairCanonicalSqliteIndexes(db, pathname, OPENCLAW_STATE_SCHEMA_SQL, {
						allowMissingColumns: true,
						validateAfterRepair: () => assertCurrentStateRuntimeSchema(db, pathname)
					});
					ensureAdditiveStateColumns(db);
					assertCurrentStateRuntimeSchema(db, pathname);
				} else openClawStateMigrationAssertions.get(previousVersion)?.(db, { pathname });
				dropLegacyStateTables(db);
				const retirementMessages = runRetiredStateTableMigrations(db, previousVersion);
				migrateSingletonStateFoldInV12(db, previousVersion);
				migrateWorkerPlacementExecutionModeSchema(db, previousVersion);
				const pathMigration = migrateAgentDatabaseRelativePaths(db, previousVersion, pathname);
				ensureAdditiveStateColumns(db);
				migrateJsonCanonicalWideRowsV13(db, previousVersion);
				migrateCronCreatorNamespaces(db, previousVersion);
				migrateConversationBindingTargets(db, previousVersion);
				migrateSessionWatchCursorProvenance(db);
				assertCanonicalStateSchemaShape(db, pathname);
				executeCanonicalStateSchema(db, { includeVersionLazyAdditiveTables: previousVersion !== 15 });
				migrateLegacyCronRunLogsToTaskRuns(db);
				if (previousVersion < 3) {
					repairLegacyGatewayRestartHandoffsForStrictMigration(db);
					ensureFirstUseAdditiveStateColumnsForStrictMigration(db);
					migrateSqliteSchemaToStrictInTransaction(db, getOpenClawStateRuntimeSchema({ includeVersionLazyAdditiveTables: previousVersion !== 15 }), { databaseLabel: pathname });
				}
				repairCanonicalSqliteIndexes(db, pathname, OPENCLAW_STATE_SCHEMA_SQL, { verifyPhysicalIntegrity: false });
				db.exec(`PRAGMA user_version = 15;`);
				executeSqliteQuerySync(db, kysely.insertInto("schema_meta").values({
					meta_key: "primary",
					role: "global",
					schema_version: 15,
					agent_id: null,
					app_version: VERSION,
					created_at: now,
					updated_at: now
				}).onConflict((conflict) => conflict.column("meta_key").doUpdateSet({
					role: "global",
					schema_version: 15,
					agent_id: null,
					app_version: VERSION,
					updated_at: now
				}).where((eb) => eb.or([
					eb("schema_meta.schema_version", "!=", 15),
					eb("schema_meta.app_version", "is not", VERSION),
					eb("schema_meta.role", "!=", "global")
				]))));
				assertOpenClawStateDatabaseForMaintenance(db, { pathname });
				warnAgentPathMigration(stateDbLog, pathMigration, pathname);
				return retirementMessages;
			}, {
				busyTimeoutMs,
				databaseLabel: pathname,
				operationLabel: "state.schema.ensure"
			}).forEach(logRetiredStateTableMigration);
		} finally {
			db.exec("PRAGMA foreign_keys = ON;");
		}
	});
}
/** Bootstrap fresh/native-only state canonically before startup checkpoint access. */
function withOpenClawStateStartupMigrationCheckpointDatabase(callback, options = {}) {
	return withOpenClawStateStartupCheckpointConnection(callback, options, ensureSchema);
}
/** Complete native bootstrap without migrating mature shared state. */
function initializeNativeOpenClawStateDatabase(options = {}) {
	initializeNativeOpenClawStateConnection(options, (db, pathname, env) => ensureSchema(db, pathname, env, OPENCLAW_SQLITE_BUSY_TIMEOUT_MS, true));
}
/** Open existing shared state without creating, migrating, chmodding, or configuring it. */
async function openExistingOpenClawStateDatabaseReadOnly(options = {}) {
	const pathname = resolveDatabasePath(options);
	if (!existsSync(pathname)) return;
	assertOpenClawStateDatabaseFreshOpenAllowed(options);
	const prepared = await prepareSqliteReadOnlyLocation(pathname);
	let db;
	try {
		db = openNodeSqliteDatabase(prepared.location, { readOnly: true });
	} catch (error) {
		prepared.cleanup();
		throw error;
	}
	try {
		db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
		assertSupportedSchemaVersion(db, pathname);
		assertSqliteIntegrity(db, pathname);
		if (readSqliteUserVersion(db) === 15) assertOpenClawStateDatabaseForMaintenance(db, { pathname });
	} catch (error) {
		try {
			clearNodeSqliteKyselyCacheForDatabase(db);
			db.close();
		} catch {}
		prepared.cleanup();
		throw error;
	}
	let cleanupComplete = false;
	return {
		db,
		path: pathname,
		walMaintenance: {
			checkpoint: () => false,
			close: () => {
				const wasOpen = db.isOpen;
				if (!wasOpen && cleanupComplete) return false;
				try {
					if (wasOpen) {
						clearNodeSqliteKyselyCacheForDatabase(db);
						db.close();
					}
				} finally {
					cleanupComplete = prepared.cleanup();
				}
				return cleanupComplete;
			}
		}
	};
}
/** Open or return a cached shared state database after schema and migration checks. */
function openOpenClawStateDatabaseWithBusyTimeout(options = {}, busyTimeoutMs = OPENCLAW_SQLITE_BUSY_TIMEOUT_MS, lockFailureReporting = "report") {
	const env = options.env ?? process.env;
	if (options.database) {
		assertOpenClawStateWriteAllowed({
			database: options.database.db,
			databasePath: options.database.path,
			env
		});
		return options.database;
	}
	const pathname = resolveDatabasePath(options);
	try {
		openClawStateDatabaseCache.assertOpenClawStateDatabaseOpenAllowed(pathname);
	} catch (error) {
		openClawStateDatabaseCache.recordOpenClawStateDatabaseLifecycleOpenError(pathname, error);
		throw error;
	}
	const cached = openClawStateDatabaseCache.getCachedOpenClawStateDatabase(pathname);
	if (cached?.db.isOpen) {
		assertOpenClawStateWriteAllowed({
			database: cached.db,
			databasePath: pathname,
			env,
			schemaReady: true
		});
		return cached;
	}
	try {
		assertOpenClawStateDatabaseFreshOpenAllowed(options);
	} catch (error) {
		openClawStateDatabaseCache.recordOpenClawStateDatabaseLifecycleOpenError(pathname, error);
		throw error;
	}
	let unpublished;
	try {
		preReadState(pathname, env);
		unpublished = runWithOpenClawStateWriteAccess({
			databasePath: pathname,
			busyTimeoutMs,
			env
		}, "fresh state database open", () => {
			if (cached) openClawStateDatabaseCache.closeStaleCachedOpenClawStateDatabase(cached);
			return unpublished = openUnpublishedStateDatabase({
				pathname,
				env,
				busyTimeoutMs,
				lockFailureReporting,
				ensureSchema: (database) => ensureSchema(database, pathname, env, busyTimeoutMs),
				recordOpenFailure: recordOpenClawStateDatabaseOpenFailure
			});
		});
	} catch (error) {
		if (lockFailureReporting === "report" || !isOpenClawStateWriteContentionError(error)) openClawStateDatabaseCache.recordOpenClawStateDatabaseLifecycleOpenError(pathname, error);
		if (!unpublished) throw error;
		const cleanup = openClawStateDatabaseCache.closeOpenClawStateDatabaseHandle(unpublished);
		if (cleanup.caught) throw createSqliteLifecycleAggregateError([error, ...cleanup.errors], `Fresh OpenClaw state database open failed releasing access and closing its unpublished handle for ${pathname}.`, error);
		throw error;
	}
	return openClawStateDatabaseCache.publishOpenClawStateDatabase(unpublished);
}
/** Open or return a cached shared state database after schema and migration checks. */
function openOpenClawStateDatabase(options = {}) {
	return openOpenClawStateDatabaseWithBusyTimeout(options);
}
/** Run one operation through the shared owner without waiting synchronously on SQLite locks. */
function runWithOpenClawStateBusyTimeout(operation, options, busyTimeoutMs) {
	const normalizedTimeoutMs = normalizeSqliteNonNegativeInteger(busyTimeoutMs, "busyTimeoutMs");
	const existing = options.database ?? getOpenClawStateDatabaseIfOpen(options);
	if (existing) return runWithSqliteBusyTimeout(existing.db, normalizedTimeoutMs, () => operation(existing), { lockFailureReporting: "suppress" });
	const opened = openOpenClawStateDatabaseWithBusyTimeout(options, normalizedTimeoutMs, "suppress");
	try {
		return runWithSqliteBusyTimeout(opened.db, normalizedTimeoutMs, () => operation(opened), { lockFailureReporting: "suppress" });
	} finally {
		if (opened.db.isOpen) setSqliteBusyTimeout(opened.db, OPENCLAW_SQLITE_BUSY_TIMEOUT_MS);
	}
}
/** Run a synchronous immediate transaction against the shared state database. */
function runOpenClawStateWriteTransaction(operation, options = {}, transactionOptions = {}) {
	let database = options.database ?? getOpenClawStateDatabaseIfOpen(options);
	let result;
	try {
		const acquired = options.database ? openOpenClawStateDatabase(options) : database ?? openOpenClawStateDatabase(options);
		database = acquired;
		result = withSqlitePostCommitPublications(acquired.db, () => runSqliteImmediateTransactionSync(acquired.db, () => {
			assertOpenClawStateWriteAllowed({
				database: acquired.db,
				databasePath: acquired.path,
				env: options.env ?? process.env,
				schemaReady: !options.database && acquired === getOpenClawStateDatabaseIfOpen(options)
			});
			return operation(acquired);
		}, {
			busyTimeoutMs: transactionOptions.busyTimeoutMs ?? readSqliteBusyTimeout(acquired.db),
			databaseLabel: acquired.path,
			...transactionOptions,
			operationLabel: transactionOptions.operationLabel ?? "state.write"
		}));
	} catch (error) {
		if (database) openClawStateDatabaseCache.evictOpenClawStateDatabaseAfterCorruption(database, error);
		throw error;
	}
	try {
		ensureOpenClawStatePermissions(database.path, options.env ?? process.env);
	} catch {}
	return result;
}
/**
* Return a shared state handle this process already holds open, if any.
*
* Read-only callers use this to avoid opening a connection per call; it never
* creates, repairs, or registers a handle.
*/
function getOpenClawStateDatabaseIfOpen(options = {}) {
	return openClawStateDatabaseCache.getOpenClawStateDatabaseIfOpenAtPath(resolveDatabasePath(options));
}
//#endregion
export { normalizeAgentRunTerminalReplySnapshot as $, ensureSecretStoreSchema as A, cronTaskRecordToScriptRunResult as At, loadDeliveryQueueEntryInDatabase as B, normalizeExitCode as Bt, ensureConfigRevisionKeySchema as C, migrateLegacyCronRunLogsToTaskRuns as Ct, ensureGitHubPublicationSchema as D, cronRunStatusToTaskStatus as Dt, ensureDevicePairingJoinCodeSchema as E, cronRunLogEntryToTaskDetail as Et, projectDeliveryQueueTerminalEntry as F, resolveCronTaskRecordTimestamp as Ft, ANNOUNCE_SKIP_TOKEN as G, isCronTimeoutErrorText as Gt, pruneDeliveryQueueTombstones as H, CRON_JOB_EXECUTION_TIMEOUT_ERROR as Ht, bindDeliveryQueueEntry as I, formatUnknownError as It, isNonDeliverableSessionsReply as J, deferSqlitePostCommitPublication as Jt, REPLY_SKIP_TOKEN as K, resolveAdmittedCronCompletionStatus as Kt, deliveryQueueEntriesQuery as L, normalizeCronRunDiagnosticSummary as Lt, hasLiveDeliveryQueueClaim as M, isCronDeliveryStatus as Mt, inferDeliveryQueueFailureRetention as N, isCronRunStatus as Nt, ensureMcpOAuthPendingSchema as O, cronTaskRecordStoreKey as Ot, parseDeliveryQueueCompletionRetention as P, parseCronRunLogEntryObject as Pt, mergeAgentRunTerminalReplySnapshot as Q, deliveryQueueMetadata as R, normalizeCronRunDiagnosticsCore as Rt, ensureAgentDeletionJournalSchema as S, SESSION_WATCH_PROVENANCE_EXPLICIT as St, ensureDevicePairSetupCompletionSchema as T, cronQuietTriggerTaskDetail as Tt, terminalizeBoundDeliveryQueueEntry as U, CRON_PRE_EXECUTION_TIMEOUT_ERROR as Ut, pruneDeliveryQueueTombstoneAges as V, tailText as Vt, upsertBoundDeliveryQueueEntryInDatabase as W, CRON_SETUP_TIMEOUT_ERROR as Wt, selectDeliverableSessionsReply as X, repairCanonicalSqliteIndexes as Xt, isReplySkip as Y, withSqlitePostCommitPublications as Yt, buildAgentRunTerminalReplySnapshot as Z, verifyAndRepairCanonicalSqliteIndexes as Zt, isOpenClawStateWriteContentionError as _, quarantineOrphanedSqliteSidecars as _t, repairOpenClawStateDatabaseSchema as a, stripUserEnvelopeForDisplay as at, runWithOpenClawStateWriteAccess as b, detectOpenClawStateDatabaseSchemaMigrationsFromDatabase as bt, runWithOpenClawStateBusyTimeout as c, hasInboundMetadataSentinel as ct, OpenClawStateOwnershipMetadataError as d, INBOUND_CONTEXT_MARKER as dt, sanitizeAgentRunTerminalReplyText as et, STATE_SUPERVISION_KEY as f, markInboundContextLabel as ft, inspectOpenClawStateOwnershipFromDatabase as g, SQLITE_SIDECAR_SUFFIXES as gt, inspectOpenClawStateOwnershipAtPath as h, ensureOpenClawStatePermissions as ht, openOpenClawStateDatabase as i, stripInternalMetadataForDisplay as it, ensureWorkerEnvironmentNodeEnrollmentSchema as j, cronTaskRecordToTriggerEval as jt, ensurePersonalGitHubPublicationSchema as k, cronTaskRecordToRunLogEntry as kt, withOpenClawStateStartupMigrationCheckpointDatabase as l, stripInboundMetadata as lt, assertOpenClawStateWriteAllowedAtPath as m, stripMessageIdHints as mt, initializeNativeOpenClawStateDatabase as n, normalizeAgentRunRouteChange as nt, repairOpenClawStateDatabaseSchemaIfNeeded as o, INBOUND_METADATA_MARKERS as ot, assertOpenClawStateWriteAllowed as p, stripEnvelope as pt, isAnnounceSkip as q, resolveCronCompletionStatus as qt, openExistingOpenClawStateDatabaseReadOnly as r, normalizeAgentRunTerminalReceipt as rt, runOpenClawStateWriteTransaction as s, extractInboundSenderLabel as st, confirmOpenClawStateDatabaseIntegrity as t, formatAgentRunRouteChange as tt, OpenClawStateOwnershipError as u, stripLeadingInboundMetadata as ut, normalizeOpenClawStateManagerId as v, resolveSqliteDatabaseFilePaths as vt, ensureDevicePairSetupBootstrapSchema as w, normalizeSqliteNumber as wt, ensureAgentDatabaseLeaseSchema as x, SESSION_WATCH_PROVENANCE_AMBIENT_GROUP as xt, runWithOpenClawStateOwnershipCoordinator as y, detectOpenClawStateDatabaseSchemaMigrations as yt, inflateDeliveryQueueRow as z, normalizeDiagnosticToolName as zt };
