import { a as getChildLogger } from "./logger-Dj_CBJHF.js";
import { i as getNodeSqliteKysely } from "./kysely-sync-DKYGT267.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, b as toAgentStoreSessionKey, f as resolveAgentIdFromSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { n as resolveIncognitoOpenClawAgentSqlitePath, r as resolveOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import "./openclaw-agent-db-CUTe8BX6.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { t as SQLITE_SESSION_WRITER_QUEUES, u as runQueuedStoreWrite } from "./store-writer-state-_Y6b9Vjm.js";
import { t as formatSqliteSessionFileMarker } from "./legacy-sqlite-marker-COPKCuIN.js";
import { o as tryAcquireExclusiveSqliteCoordinator } from "./node-sqlite-CL-d6drd.js";
import { withAgentDatabaseProcessLease } from "./agent-db-process-coordinator.mjs";
import { a as normalizeStoreSessionKey, u as resolveSqliteTargetFromSessionStorePath } from "./store-entry-CMuTqREZ.js";
import path from "node:path";
//#region src/config/sessions/session-accessor.sqlite-scope.ts
const SQLITE_SESSION_SLOW_WRITE_MS = 1e3;
const SQLITE_TRANSCRIPT_READ_QUERY_CHUNK_SIZE = 400;
function getSessionKysely(database) {
	return getNodeSqliteKysely(database);
}
async function runExclusiveSqliteSessionWrite(scope, fn) {
	const databaseOptions = toDatabaseOptions(scope);
	const storePath = resolveOpenClawAgentSqlitePath(databaseOptions);
	const startedAt = Date.now();
	let localQueueWaitMs = 0;
	let processQueueWaitMs = 0;
	let processQueueAttempts = 0;
	let criticalSectionMs = 0;
	const runCriticalSection = async () => {
		const criticalStartedAt = Date.now();
		try {
			return await fn();
		} finally {
			criticalSectionMs = Date.now() - criticalStartedAt;
		}
	};
	try {
		const result = await runQueuedStoreWrite({
			queues: SQLITE_SESSION_WRITER_QUEUES,
			storePath,
			label: "runExclusiveSqliteSessionWrite",
			fn: async () => {
				localQueueWaitMs = Date.now() - startedAt;
				if (typeof scope.sessionKey === "string" && isIncognitoSessionKey(scope.sessionKey)) return await runCriticalSection();
				return await withAgentDatabaseProcessLease({
					acquire: tryAcquireExclusiveSqliteCoordinator,
					databasePath: storePath,
					fn: runCriticalSection,
					onAcquired: ({ attempts, waitMs }) => {
						processQueueAttempts = attempts;
						processQueueWaitMs = waitMs;
					},
					onReleaseError: (error) => getChildLogger({ subsystem: "session-sqlite" }).warn("Agent DB process writer coordinator release failed", { error, storePath })
				});
			}
		});
		const elapsedMs = Date.now() - startedAt;
		if (elapsedMs >= SQLITE_SESSION_SLOW_WRITE_MS) getChildLogger({ subsystem: "session-sqlite" }).warn("slow SQLite session write", {
			agentId: scope.agentId,
			criticalSectionMs,
			elapsedMs,
			localQueueWaitMs,
			processQueueAttempts,
			processQueueWaitMs,
			storePath
		});
		return result;
	} catch (error) {
		getChildLogger({ subsystem: "session-sqlite" }).warn("SQLite session write failed", {
			agentId: scope.agentId,
			criticalSectionMs,
			elapsedMs: Date.now() - startedAt,
			error,
			localQueueWaitMs,
			processQueueAttempts,
			processQueueWaitMs,
			storePath
		});
		throw error;
	}
}
function resolveSqliteScope(scope) {
	const parsedAgentId = parseAgentSessionKey(scope.sessionKey)?.agentId;
	const scopedAgentId = scope.agentId ? normalizeAgentId(scope.agentId) : parsedAgentId;
	const incognitoAgentId = isIncognitoSessionKey(scope.sessionKey) ? resolveAgentIdFromSessionKey(scope.sessionKey) : void 0;
	const effectiveStorePath = incognitoAgentId ? resolveIncognitoOpenClawAgentSqlitePath({
		agentId: incognitoAgentId,
		env: scope.env
	}) : scope.storePath;
	const effectiveAgentId = incognitoAgentId ?? scopedAgentId;
	const storeTarget = effectiveStorePath ? resolveSqliteTargetFromSessionStorePath(effectiveStorePath, {
		agentId: effectiveAgentId,
		defaultAgentId: scope.defaultAgentId,
		...scope.env ? { env: scope.env } : {}
	}) : void 0;
	const agentId = resolveSqliteAgentId({
		scopedAgentId: effectiveAgentId,
		sessionKey: scope.sessionKey,
		storeAgentId: storeTarget?.agentId,
		storeShared: storeTarget?.shared
	});
	if (!agentId) throw new Error("Cannot resolve SQLite session scope without an agent id");
	const normalizedSessionKey = normalizeSqliteSessionKey(scope.sessionKey);
	const sessionKey = !normalizedSessionKey || normalizedSessionKey === "global" || normalizedSessionKey === "unknown" || parseAgentSessionKey(normalizedSessionKey) ? normalizedSessionKey : toAgentStoreSessionKey({
		agentId,
		requestKey: normalizedSessionKey
	});
	return {
		agentId,
		...storeTarget?.shared && storeTarget.agentId ? { databaseAgentId: storeTarget.agentId } : {},
		...scope.env ? { env: scope.env } : {},
		...effectiveStorePath ? { ownerStorePath: effectiveStorePath } : {},
		...storeTarget ? { path: storeTarget.path } : {},
		sessionKey
	};
}
function resolveSqliteReadScope(scope, targetCache) {
	const sessionKey = scope.sessionKey ? normalizeSqliteSessionKey(scope.sessionKey) : void 0;
	const parsedAgentId = parseAgentSessionKey(sessionKey)?.agentId;
	const scopedAgentId = scope.agentId ? normalizeAgentId(scope.agentId) : parsedAgentId;
	const incognitoAgentId = isIncognitoSessionKey(sessionKey) ? resolveAgentIdFromSessionKey(sessionKey) : void 0;
	const effectiveStorePath = incognitoAgentId ? resolveIncognitoOpenClawAgentSqlitePath({
		agentId: incognitoAgentId,
		env: scope.env
	}) : scope.storePath;
	const effectiveAgentId = incognitoAgentId ?? scopedAgentId;
	const storeTarget = effectiveStorePath ? resolveCachedSqliteStoreTarget({
		agentId: effectiveAgentId,
		defaultAgentId: scope.defaultAgentId,
		env: scope.env,
		storePath: effectiveStorePath
	}, targetCache) : void 0;
	const agentId = resolveSqliteAgentId({
		scopedAgentId: effectiveAgentId,
		sessionKey,
		storeAgentId: storeTarget?.agentId,
		storeShared: storeTarget?.shared
	});
	if (!agentId) throw new Error("Cannot resolve SQLite transcript read scope without an agent id");
	return {
		agentId,
		...storeTarget?.shared && storeTarget.agentId ? { databaseAgentId: storeTarget.agentId } : {},
		...scope.env ? { env: scope.env } : {},
		...effectiveStorePath ? { ownerStorePath: effectiveStorePath } : {},
		...storeTarget ? { path: storeTarget.path } : {},
		...sessionKey ? { sessionKey } : {}
	};
}
function resolveCachedSqliteStoreTarget(params, targetCache) {
	if (!targetCache) return resolveSqliteTargetFromSessionStorePath(params.storePath, {
		agentId: params.agentId,
		defaultAgentId: params.defaultAgentId,
		...params.env ? { env: params.env } : {}
	});
	const envCache = targetCache.get(params.env) ?? /* @__PURE__ */ new Map();
	targetCache.set(params.env, envCache);
	const cacheKey = JSON.stringify([
		params.storePath,
		params.agentId,
		params.defaultAgentId
	]);
	const cached = envCache.get(cacheKey);
	if (cached) return cached;
	const resolved = resolveSqliteTargetFromSessionStorePath(params.storePath, {
		agentId: params.agentId,
		defaultAgentId: params.defaultAgentId,
		...params.env ? { env: params.env } : {}
	});
	envCache.set(cacheKey, resolved);
	return resolved;
}
function resolveSqliteStoreScope(storePath, options = {}) {
	return resolveSqliteScope({
		...options.agentId ? { agentId: options.agentId } : {},
		sessionKey: "",
		storePath
	});
}
function resolveSqliteAgentId(params) {
	const scopedAgentId = params.scopedAgentId ? normalizeAgentId(params.scopedAgentId) : void 0;
	if (scopedAgentId && params.storeAgentId && scopedAgentId !== params.storeAgentId && !params.storeShared) throw new Error(`SQLite session store path belongs to agent ${params.storeAgentId}; requested agent ${scopedAgentId}.`);
	const parsedAgentId = params.sessionKey ? parseAgentSessionKey(params.sessionKey)?.agentId : void 0;
	return scopedAgentId ?? params.storeAgentId ?? parsedAgentId;
}
function resolveSqliteTranscriptArchiveDirectory(scope) {
	const databasePath = resolveOpenClawAgentSqlitePath(toDatabaseOptions(scope));
	const databaseDir = path.dirname(databasePath);
	if (path.basename(databaseDir) !== "agent") return databaseDir;
	return path.join(path.dirname(databaseDir), "sessions");
}
function resolveSqliteTranscriptScope(scope) {
	if (!scope.sessionId) throw new Error(`Cannot resolve SQLite transcript scope without a session id: ${scope.sessionKey}`);
	if (!scope.sessionKey) throw new Error(`Cannot resolve SQLite transcript scope without a session key: ${scope.sessionId}`);
	return {
		...resolveSqliteScope({
			...scope,
			sessionKey: scope.sessionKey
		}),
		sessionId: scope.sessionId
	};
}
function resolveSqliteTranscriptReadScope(scope, targetCache) {
	return {
		...resolveSqliteReadScope(scope, targetCache),
		sessionId: scope.sessionId
	};
}
/** Borrow one store at a time so bounded registry eviction cannot invalidate a batched read. */
function readSqliteTranscriptStoreBatches(scopes, readChunk) {
	const results = Array.from({ length: scopes.length });
	const groups = /* @__PURE__ */ new Map();
	const targetCache = /* @__PURE__ */ new Map();
	for (const [index, scope] of scopes.entries()) {
		const resolved = resolveSqliteTranscriptReadScope(scope, targetCache);
		const options = toDatabaseOptions(resolved);
		const databasePath = resolveOpenClawAgentSqlitePath(options);
		const group = groups.get(databasePath) ?? {
			indexes: /* @__PURE__ */ new Map(),
			options
		};
		const indexes = group.indexes.get(resolved.sessionId) ?? [];
		indexes.push(index);
		group.indexes.set(resolved.sessionId, indexes);
		groups.set(databasePath, group);
	}
	for (const group of groups.values()) withOpenClawAgentDatabaseReadOnly((database) => {
		const sessionIds = [...group.indexes.keys()];
		for (let offset = 0; offset < sessionIds.length; offset += SQLITE_TRANSCRIPT_READ_QUERY_CHUNK_SIZE) {
			const chunk = sessionIds.slice(offset, offset + SQLITE_TRANSCRIPT_READ_QUERY_CHUNK_SIZE);
			for (const [sessionId, value] of readChunk(database, chunk)) for (const index of group.indexes.get(sessionId) ?? []) results[index] = value;
		}
	}, group.options, { throwOnMissingTable: true });
	return results;
}
function toDatabaseOptions(scope) {
	return {
		agentId: scope.databaseAgentId ?? scope.agentId,
		...scope.env ? { env: scope.env } : {},
		...scope.path ? { path: scope.path } : {}
	};
}
function normalizeSqliteSessionKey(sessionKey) {
	return normalizeStoreSessionKey(sessionKey);
}
function cloneSessionEntry(entry) {
	return structuredClone(entry);
}
function formatSqliteSessionReferenceForScope(scope) {
	return scope.sessionKey;
}
/** Legacy identity string retained only for transcript artifact metadata and plugin contracts. */
function formatLegacySqliteSessionMarkerForScope(scope) {
	return formatSqliteSessionFileMarker({
		agentId: scope.agentId,
		sessionId: scope.sessionId,
		storePath: scope.path ?? resolveOpenClawAgentSqlitePath(toDatabaseOptions(scope))
	});
}
//#endregion
export { normalizeSqliteSessionKey as a, resolveSqliteScope as c, resolveSqliteTranscriptReadScope as d, resolveSqliteTranscriptScope as f, getSessionKysely as i, resolveSqliteStoreScope as l, toDatabaseOptions as m, formatLegacySqliteSessionMarkerForScope as n, readSqliteTranscriptStoreBatches as o, runExclusiveSqliteSessionWrite as p, formatSqliteSessionReferenceForScope as r, resolveSqliteReadScope as s, cloneSessionEntry as t, resolveSqliteTranscriptArchiveDirectory as u };
