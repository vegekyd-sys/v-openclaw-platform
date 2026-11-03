import { verifyCurrentAgentDatabase as db91VerifyCurrent } from "./db91-integrity-gate.mjs";
import { s as asFiniteNumber } from "./number-coercion-CLj0HTDM.js";
import "./src-vebZIeLe.js";
import { a as asOptionalRecord, c as isRecord, r as asNullableRecord } from "./record-coerce-DItp3I4t.js";
import { n as safeParseJsonRecord } from "./json-coercion-ighRFv8Y.js";
import { l as normalizeOptionalString, s as normalizeNullableString } from "./string-coerce-CIXf7egm.js";
import { r as isPathInside } from "./path-guards-Cp-mGr3-.js";
import { w as resolveStateDir } from "./paths-Dx1CjxA5.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { h as clearNodeSqliteKyselyCacheForDatabase, t as openNodeSqliteDatabase, u as runSqliteImmediateTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";
import { t as VERSION } from "./version-CAQhhGAu.js";
import { a as readSqliteUserVersion, n as createNewerSqliteSchemaVersionError } from "./sqlite-user-version-DkmzAA6V.js";
import { D as tableExists, E as ensureColumn, L as getCanonicalSqliteTableNames, M as assertSqliteSchemaTablesPresent, O as tableHasColumn, j as assertSqliteSchemaContains } from "./openclaw-state-db-cache-AunrvrzG.js";
import { n as resolveOpenClawAgentDatabaseStoredPath, o as resolveOpenClawStateSqlitePath, r as resolveOpenClawRegisteredAgentDatabasePath } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { n as withExistingOpenClawStateDatabaseReadOnly } from "./openclaw-state-db-readonly-C7txILW9.js";
import { t as assertSqliteIntegrity } from "./sqlite-integrity-BBPyeEpy.js";
import { Xt as repairCanonicalSqliteIndexes, Zt as verifyAndRepairCanonicalSqliteIndexes, bt as detectOpenClawStateDatabaseSchemaMigrationsFromDatabase, s as runOpenClawStateWriteTransaction, vt as resolveSqliteDatabaseFilePaths, x as ensureAgentDatabaseLeaseSchema } from "./openclaw-state-db-Bh3Bq87y.js";
import { n as migrateSqliteSchemaToStrictInTransaction } from "./sqlite-strict-DnGe0ZLD.js";
import { n as configureSqlitePreSchemaPragmas } from "./sqlite-wal-B8YRh3_y.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import "./session-key-CRjxKW0X.js";
import { n as normalizeAccountId } from "./account-id-CETVCrTz.js";
import { i as isPidDefinitelyDead, t as getFileLockProcessStartTime } from "./pid-alive-lAl8ESlJ.js";
import { n as assertAgentDeletionPathFence, s as prepareAgentDeletionPathFence, t as assertAgentDeletionIdentityClaimAllowed } from "./agent-deletion-journal-CoDMOoU8.js";
import { r as resolveOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import "./openclaw-agent-db-contract-CGTyjij4.js";
import { _ as ensureMemoryRecallMetadataSchema, b as ensureMemoryChunkProvenance, d as MEMORY_INDEX_SOURCES_TABLE, f as MEMORY_PATH_FTS_TRIGGER_DEFINITIONS, g as MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE, n as migrateMemoryIndexSourcesIdentity, v as hasLegacyMemoryRecallMetadataColumns, y as MEMORY_INDEX_CHUNK_PROVENANCE_TABLE } from "./memory-schema-BSs9MQgq.js";
import { n as OpenClawAgentDatabaseMediaMigrationRequiredError } from "./openclaw-agent-db-migration-required-BHhCEvlh.js";
import { t as normalizeChatType } from "./chat-type-CG0X_HJM.js";
import { t as deriveSessionChatTypeFromKey } from "./session-chat-type-shared-BKTfMJHj.js";
import { chmodSync, existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, rmdirSync, statSync } from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import crypto, { randomBytes } from "node:crypto";
//#region src/state/openclaw-agent-db-lease.ts
const AGENT_DATABASE_MAINTENANCE_LEASE = {
	scope: "core:agent-database-maintenance",
	key: "global"
};
var OpenClawAgentDatabaseLeaseActiveError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "OpenClawAgentDatabaseLeaseActiveError";
	}
};
const maintenanceAuthority = new AsyncLocalStorage();
function runWithAgentDatabaseMaintenanceAuthority(authority, run) {
	return maintenanceAuthority.run(authority, run);
}
/** Revalidate the held lease, including immediately before committing a versioned rebuild. */
function assertAgentDatabaseMaintenanceAuthority() {
	const authority = maintenanceAuthority.getStore();
	if (!authority) throw new Error("Agent identity migration requires stopped-writer maintenance; stop active agents and run openclaw doctor --fix.");
	authority.assertOwned();
}
/** Revalidate a maintenance owner when present, without requiring ordinary opens to hold one. */
function assertAgentDatabaseMaintenanceAuthorityIfPresent() {
	maintenanceAuthority.getStore()?.assertOwned();
}
/** Verify the maintenance owner and its independent heartbeat before a synchronous phase. */
function renewAgentDatabaseMaintenanceAuthorityIfPresent() {
	const authority = maintenanceAuthority.getStore();
	if (!authority) return;
	if (!authority.renew) throw new Error("Agent database maintenance authority cannot renew its lease.");
	authority.renew();
}
function claimOpenClawAgentDatabaseLease(params) {
	const agentId = normalizeAgentId(params.agentId);
	const deletionFence = prepareAgentDeletionPathFence({
		agentId,
		path: params.path
	}, { env: params.env });
	const leaseId = crypto.randomUUID();
	const ownerStartTime = getFileLockProcessStartTime(process.pid);
	runOpenClawStateWriteTransaction((database) => {
		ensureAgentDatabaseLeaseSchema(database.db);
		const db = getNodeSqliteKysely(database.db);
		if (executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("state_leases").select("owner").where("scope", "=", AGENT_DATABASE_MAINTENANCE_LEASE.scope).where("lease_key", "=", AGENT_DATABASE_MAINTENANCE_LEASE.key).where("expires_at", ">", Date.now()))) throw new Error("Agent database maintenance is in progress; retry after openclaw doctor --fix completes.");
		const deletion = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("agent_deletion_journal").select("agent_id").where("agent_id", "=", agentId));
		assertAgentDeletionIdentityClaimAllowed(agentId, deletion?.agent_id);
		assertAgentDeletionPathFence(database.db, deletionFence);
		executeSqliteQuerySync(database.db, db.insertInto("agent_database_leases").values({
			lease_id: leaseId,
			agent_id: agentId,
			path: params.path,
			owner_pid: process.pid,
			owner_start_time: ownerStartTime,
			opened_at: Date.now()
		}));
	}, { env: params.env });
	return leaseId;
}
function releaseOpenClawAgentDatabaseLease(leaseId, options = {}) {
	runOpenClawStateWriteTransaction((database) => {
		ensureAgentDatabaseLeaseSchema(database.db);
		const db = getNodeSqliteKysely(database.db);
		executeSqliteQuerySync(database.db, db.deleteFrom("agent_database_leases").where("lease_id", "=", leaseId));
	}, options);
}
function assertNoOpenClawAgentDatabaseLeases(agentIdRaw, options = {}) {
	const maintenance = typeof agentIdRaw === "string" ? void 0 : agentIdRaw;
	const agentId = typeof agentIdRaw === "string" ? normalizeAgentId(agentIdRaw) : void 0;
	const rows = runOpenClawStateWriteTransaction((database) => {
		maintenance?.assertOwnedInTransaction(database.db);
		ensureAgentDatabaseLeaseSchema(database.db);
		const db = getNodeSqliteKysely(database.db);
		return executeSqliteQuerySync(database.db, db.selectFrom("agent_database_leases").select([
			"agent_id",
			"lease_id",
			"owner_pid",
			"owner_start_time",
			"path"
		])).rows;
	}, options);
	const staleLeaseIds = rows.filter((row) => {
		if (isPidDefinitelyDead(row.owner_pid)) return true;
		const currentStartTime = getFileLockProcessStartTime(row.owner_pid);
		return row.owner_start_time !== null && currentStartTime !== null && row.owner_start_time !== currentStartTime;
	}).map((row) => row.lease_id);
	if (staleLeaseIds.length > 0) runOpenClawStateWriteTransaction((database) => {
		maintenance?.assertOwnedInTransaction(database.db);
		ensureAgentDatabaseLeaseSchema(database.db);
		const db = getNodeSqliteKysely(database.db);
		executeSqliteQuerySync(database.db, db.deleteFrom("agent_database_leases").where("lease_id", "in", staleLeaseIds));
	}, options);
	const staleLeaseIdSet = new Set(staleLeaseIds);
	for (const row of rows) {
		if (staleLeaseIdSet.has(row.lease_id)) continue;
		const deletionFence = agentId ? prepareAgentDeletionPathFence({
			agentId: row.agent_id,
			path: row.path,
			fenceAgentId: agentId
		}, options) : void 0;
		let leaseStillExists = false;
		runOpenClawStateWriteTransaction((database) => {
			maintenance?.assertOwnedInTransaction(database.db);
			ensureAgentDatabaseLeaseSchema(database.db);
			const db = getNodeSqliteKysely(database.db);
			leaseStillExists = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("agent_database_leases").select("lease_id").where("lease_id", "=", row.lease_id)) !== void 0;
			if (leaseStillExists && row.agent_id !== agentId && deletionFence) assertAgentDeletionPathFence(database.db, deletionFence);
		}, options);
		if (leaseStillExists && (!agentId || row.agent_id === agentId)) {
			const remediation = agentId ? "." : "; stop that process and rerun openclaw doctor --fix.";
			throw new OpenClawAgentDatabaseLeaseActiveError(`Agent ${row.agent_id} database is still open in another process${remediation}`);
		}
	}
}
//#endregion
//#region src/state/openclaw-agent-db-permissions.ts
const OPENCLAW_AGENT_DB_DIR_MODE = 448;
const OPENCLAW_AGENT_DB_FILE_MODE = 384;
function ensureOpenClawAgentDatabasePermissions(pathname, options) {
	const dir = path.dirname(pathname);
	const defaultPath = resolveOpenClawAgentSqlitePath({
		agentId: options.agentId,
		env: options.env
	});
	const isDefaultAgentDatabase = path.resolve(pathname) === path.resolve(defaultPath);
	const dirExisted = existsSync(dir);
	mkdirSync(dir, {
		recursive: true,
		mode: OPENCLAW_AGENT_DB_DIR_MODE
	});
	if (isDefaultAgentDatabase || !dirExisted) chmodSync(dir, OPENCLAW_AGENT_DB_DIR_MODE);
	for (const candidate of resolveSqliteDatabaseFilePaths(pathname)) try {
		chmodSync(candidate, OPENCLAW_AGENT_DB_FILE_MODE);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
}
//#endregion
//#region src/state/openclaw-agent-db-registry-listing.ts
let registeredAgentDatabasesMemo;
function resolveAgentDatabaseRegistryPath(options) {
	return path.resolve(options.path ?? resolveOpenClawStateSqlitePath(options.env ?? process.env));
}
function activateRegisteredAgentDatabasesMemo(options) {
	const pathname = resolveAgentDatabaseRegistryPath(options);
	if (registeredAgentDatabasesMemo?.pathname !== pathname) registeredAgentDatabasesMemo = {
		pathname,
		token: Symbol(pathname)
	};
	return registeredAgentDatabasesMemo;
}
/** Return the process-stable generation for the active agent database registry. */
function readOpenClawAgentDatabaseRegistryToken(options = {}) {
	return activateRegisteredAgentDatabasesMemo(options).token;
}
function invalidateRegisteredAgentDatabasesMemo(options) {
	const pathname = resolveAgentDatabaseRegistryPath(options);
	if (registeredAgentDatabasesMemo?.pathname === pathname) registeredAgentDatabasesMemo = {
		pathname,
		token: Symbol(pathname)
	};
}
function cloneRegisteredAgentDatabases(entries) {
	return entries.map((entry) => ({ ...entry }));
}
function hasUnavailableMissingSqlitePath(pathname) {
	for (const candidate of resolveSqliteDatabaseFilePaths(pathname)) try {
		lstatSync(candidate);
		return true;
	} catch (error) {
		if (error.code !== "ENOENT") return true;
	}
	let ancestor = path.dirname(pathname);
	while (true) {
		try {
			const stat = lstatSync(ancestor);
			if (!stat.isSymbolicLink()) return !stat.isDirectory();
			try {
				return !statSync(ancestor).isDirectory();
			} catch {
				return true;
			}
		} catch (error) {
			if (error.code !== "ENOENT") return true;
		}
		const parent = path.dirname(ancestor);
		if (parent === ancestor) return false;
		ancestor = parent;
	}
}
/** List agent databases recorded in the shared OpenClaw state registry. */
function listOpenClawRegisteredAgentDatabases(options = {}) {
	const memo = activateRegisteredAgentDatabasesMemo(options);
	const { pathname } = memo;
	if (memo.entries) {
		const entries = cloneRegisteredAgentDatabases(memo.entries);
		return options.includeIncompatibleSchemaVersions ? entries : entries.filter((entry) => entry.schemaVersion === 19);
	}
	const entries = withExistingOpenClawStateDatabaseReadOnly(({ db: database }) => {
		if (detectOpenClawStateDatabaseSchemaMigrationsFromDatabase(database, pathname).length > 0) throw new Error(`OpenClaw state database ${pathname} has a legacy agent database registry schema; run openclaw doctor --fix to migrate it.`);
		const registryTable = database.prepare("SELECT type FROM sqlite_master WHERE name = 'agent_databases'").get();
		if (!registryTable) return [];
		if (registryTable.type !== "table") throw new Error(`OpenClaw state database ${pathname} has an invalid agent registry.`);
		const db = getNodeSqliteKysely(database);
		return executeSqliteQuerySync(database, db.selectFrom("agent_databases").selectAll().orderBy("agent_id", "asc").orderBy("path", "asc")).rows.map((row) => ({
			agentId: normalizeAgentId(row.agent_id),
			path: resolveOpenClawRegisteredAgentDatabasePath(pathname, row.path),
			schemaVersion: row.schema_version,
			lastSeenAt: row.last_seen_at,
			sizeBytes: row.size_bytes
		}));
	}, options);
	if (entries === void 0) {
		if (hasUnavailableMissingSqlitePath(pathname)) throw new Error(`OpenClaw state database ${pathname} is unavailable.`);
		memo.entries = [];
		return [];
	}
	memo.entries = entries;
	const cloned = cloneRegisteredAgentDatabases(entries);
	return options.includeIncompatibleSchemaVersions ? cloned : cloned.filter((entry) => entry.schemaVersion === 19);
}
//#endregion
//#region src/state/openclaw-agent-db-registry.ts
const missingSuffixAliasCache = /* @__PURE__ */ new Map();
const MAX_DANGLING_SYMLINK_HOPS = 64;
const PROBE_NAME_LENGTH = 6;
const PROBE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const PROBE_FIRST_ALPHABET = "bdefghijkmoqrstuvwxyz";
function createSymlinkLoopError(lexicalPath) {
	const error = /* @__PURE__ */ new Error(`Symlink loop while resolving ${lexicalPath}.`);
	error.code = "ELOOP";
	return error;
}
function areAsciiCaseVariants(left, right) {
	const foldAsciiCase = (value) => value.replace(/[A-Z]/gu, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));
	return left !== void 0 && right !== void 0 && foldAsciiCase(left) === foldAsciiCase(right);
}
function shouldProbeUnicodeCaseVariants(left, right) {
	const hasNonAscii = (value) => value.split("").some((character) => character.charCodeAt(0) > 127);
	if (!hasNonAscii(left) && !hasNonAscii(right)) return false;
	const lowercaseEquivalent = left.toLowerCase() === right.toLowerCase();
	const uppercaseEquivalent = left.toUpperCase() === right.toUpperCase();
	if (!lowercaseEquivalent && !uppercaseEquivalent) return false;
	return !(Array.from(left).length !== Array.from(right).length && lowercaseEquivalent && !uppercaseEquivalent);
}
function isWindowsReservedPathComponent(value) {
	const stem = value.split(".", 1)[0].replace(/[ .]+$/u, "").toUpperCase();
	return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(stem);
}
function createNormalizationProbePairs(left, right) {
	const pairs = [];
	const seen = /* @__PURE__ */ new Set();
	const addPair = (candidateLeft, candidateRight) => {
		if (!areAsciiCaseVariants(candidateLeft.normalize("NFC"), candidateRight.normalize("NFC"))) return;
		if (isWindowsReservedPathComponent(candidateLeft) || isWindowsReservedPathComponent(candidateRight)) return;
		if (candidateLeft === left || candidateLeft === right || candidateRight === left || candidateRight === right) return;
		const key = `${candidateLeft}\0${candidateRight}`;
		if (!seen.has(key)) {
			seen.add(key);
			pairs.push([candidateLeft, candidateRight]);
		}
	};
	const replaceAscii = (value, replacements) => value.replace(/[A-Za-z]/gu, (character) => {
		const lower = character.toLowerCase();
		const replacement = replacements.get(lower);
		if (!replacement) return character;
		return character === lower ? replacement : replacement.toUpperCase();
	});
	const mutableAscii = [...new Set(`${left}${right}`.toLowerCase().match(/[a-z]/gu) ?? [])].filter((source) => {
		const replacements = /* @__PURE__ */ new Map([[source, source === "z" ? "y" : "z"]]);
		return areAsciiCaseVariants(replaceAscii(left, replacements).normalize("NFC"), replaceAscii(right, replacements).normalize("NFC"));
	});
	for (let attempt = 0; attempt < 24 && mutableAscii.length > 0; attempt += 1) {
		const entropy = randomBytes(mutableAscii.length);
		const replacements = new Map(mutableAscii.map((source, index) => [source, String.fromCharCode("a".charCodeAt(0) + entropy[index] % 26)]));
		addPair(replaceAscii(left, replacements), replaceAscii(right, replacements));
	}
	return pairs;
}
function createAsciiCaseProbePairs(nameLength, forbiddenNames) {
	const pairs = [];
	for (let attempt = 0; attempt < 96 && pairs.length < 24; attempt += 1) {
		const base = createPrivateProbeName(nameLength);
		const alias = `${base[0].toUpperCase()}${base.slice(1)}`;
		if (!forbiddenNames.has(base) && !forbiddenNames.has(alias)) pairs.push([base, alias]);
	}
	return pairs;
}
function createPrivateProbeName(nameLength) {
	return [...randomBytes(nameLength)].map((value, index) => {
		const alphabet = index === 0 ? PROBE_FIRST_ALPHABET : PROBE_ALPHABET;
		return alphabet[value % alphabet.length];
	}).join("");
}
function createPrivateProbeNames(nameLength, forbiddenNames) {
	const names = [];
	for (let attempt = 0; attempt < 96 && names.length < 24; attempt += 1) {
		const name = createPrivateProbeName(nameLength);
		if (!forbiddenNames.has(name)) names.push(name);
	}
	return names;
}
function removeOwnedProbePath(created) {
	try {
		const current = lstatSync(created.path, { bigint: true });
		if (current.dev !== created.device || current.ino !== created.inode || !current.isDirectory()) return false;
		rmdirSync(created.path);
		return true;
	} catch (error) {
		return error.code === "ENOENT";
	}
}
function removeTrackedProbePath(createdPaths, probePath) {
	const index = createdPaths.findLastIndex((created) => created.path === probePath);
	if (index >= 0) createdPaths.splice(index, 1);
}
function createDirectoryAliasProbe(params) {
	for (const [firstName, aliasName] of params.pairs) {
		const probePath = path.join(params.parentPath, firstName);
		const aliasPath = path.join(params.parentPath, aliasName);
		try {
			mkdirSync(probePath);
		} catch (error) {
			if (error.code === "EEXIST") continue;
			throw error;
		}
		const probeStat = lstatSync(probePath, { bigint: true });
		params.createdPaths.push({
			path: probePath,
			device: probeStat.dev,
			inode: probeStat.ino
		});
		try {
			const aliasStat = lstatSync(aliasPath, { bigint: true });
			if (aliasStat.dev === probeStat.dev && aliasStat.ino === probeStat.ino) return {
				aliases: true,
				path: probePath
			};
			const created = params.createdPaths.at(-1);
			if (created?.path === probePath && removeOwnedProbePath(created)) removeTrackedProbePath(params.createdPaths, probePath);
		} catch (error) {
			if (error.code === "ENOENT") return {
				aliases: false,
				path: probePath
			};
			throw error;
		}
	}
}
function createNeutralProbeDirectory(params) {
	for (const name of createPrivateProbeNames(params.nameLength, params.forbiddenNames)) {
		const probePath = path.join(params.parentPath, name);
		try {
			mkdirSync(probePath);
			const stat = lstatSync(probePath, { bigint: true });
			params.createdPaths.push({
				path: probePath,
				device: stat.dev,
				inode: stat.ino
			});
			return probePath;
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
	}
}
function areMissingSuffixAliases(params) {
	if (params.left === void 0 || params.right === void 0) return false;
	if (params.left === params.right) return true;
	const leftSegments = params.left.split(path.sep);
	const rightSegments = params.right.split(path.sep);
	if (leftSegments.length !== rightSegments.length || [...leftSegments, ...rightSegments].some((segment) => !segment || segment === "." || segment === "..")) return false;
	const suffixPair = [params.left, params.right].toSorted();
	const cacheKey = JSON.stringify([
		params.parentDevice.toString(),
		params.parentInode.toString(),
		params.parentRealPath,
		...suffixPair
	]);
	const cached = missingSuffixAliasCache.get(cacheKey);
	if (cached !== void 0) return cached;
	const createdPaths = [];
	const maxProbePathLength = Math.max(path.join(params.parentRealPath, params.left).length, path.join(params.parentRealPath, params.right).length);
	try {
		let probeParent = params.parentRealPath;
		for (let index = 0; index < leftSegments.length; index += 1) {
			const leftSegment = leftSegments[index];
			const rightSegment = rightSegments[index];
			const normalizedLeft = leftSegment.normalize("NFC");
			const normalizedRight = rightSegment.normalize("NFC");
			const availableProbeNameLength = maxProbePathLength - probeParent.length - (probeParent.endsWith(path.sep) ? 0 : 1);
			const componentProbeNameLength = Math.max(1, Math.min(PROBE_NAME_LENGTH, leftSegment.length, rightSegment.length));
			const forbiddenNames = /* @__PURE__ */ new Set([leftSegment, rightSegment]);
			let nextProbeParent;
			if (normalizedLeft !== normalizedRight) {
				let caseProbeParent = probeParent;
				let caseProbePairs = createAsciiCaseProbePairs(componentProbeNameLength, forbiddenNames);
				if (!areAsciiCaseVariants(normalizedLeft, normalizedRight)) {
					if (!shouldProbeUnicodeCaseVariants(normalizedLeft, normalizedRight)) {
						missingSuffixAliasCache.set(cacheKey, false);
						return false;
					}
					const privateParent = createNeutralProbeDirectory({
						parentPath: probeParent,
						createdPaths,
						forbiddenNames,
						nameLength: componentProbeNameLength
					});
					if (!privateParent) return true;
					caseProbeParent = privateParent;
					caseProbePairs = [[leftSegment, rightSegment]];
				}
				const caseProbe = createDirectoryAliasProbe({
					parentPath: caseProbeParent,
					pairs: caseProbePairs,
					createdPaths
				});
				if (!caseProbe) return true;
				if (!caseProbe.aliases) {
					missingSuffixAliasCache.set(cacheKey, false);
					return false;
				}
				nextProbeParent = caseProbe.path;
			}
			if (leftSegment !== normalizedLeft || rightSegment !== normalizedRight) {
				let normalizationPairs = createNormalizationProbePairs(leftSegment, rightSegment).filter(([probeLeft, probeRight]) => probeLeft.length <= availableProbeNameLength && probeRight.length <= availableProbeNameLength);
				let normalizationProbeParent = probeParent;
				if (normalizationPairs.length === 0) {
					const privateParent = createNeutralProbeDirectory({
						parentPath: probeParent,
						createdPaths,
						forbiddenNames,
						nameLength: componentProbeNameLength
					});
					if (!privateParent) return true;
					normalizationProbeParent = privateParent;
					normalizationPairs = [[leftSegment, rightSegment]];
				}
				const normalizationProbe = createDirectoryAliasProbe({
					parentPath: normalizationProbeParent,
					pairs: normalizationPairs,
					createdPaths
				});
				if (!normalizationProbe) return true;
				if (!normalizationProbe.aliases) {
					missingSuffixAliasCache.set(cacheKey, false);
					return false;
				}
				nextProbeParent ??= normalizationProbe.path;
			}
			if (index < leftSegments.length - 1) {
				nextProbeParent ??= createNeutralProbeDirectory({
					parentPath: probeParent,
					createdPaths,
					forbiddenNames,
					nameLength: componentProbeNameLength
				});
				if (!nextProbeParent) return true;
				probeParent = nextProbeParent;
			}
		}
		missingSuffixAliasCache.set(cacheKey, true);
		return true;
	} catch {
		return true;
	} finally {
		for (const created of createdPaths.toReversed()) removeOwnedProbePath(created);
	}
}
function resolveDanglingSymlinkTargetPath(lexicalPath) {
	let resolved = path.parse(lexicalPath).root;
	const remaining = lexicalPath.slice(resolved.length).split(path.sep).filter(Boolean);
	const visitedSymlinks = /* @__PURE__ */ new Set();
	const visitedResolutionStates = /* @__PURE__ */ new Set();
	let symlinkHops = 0;
	while (remaining.length > 0) {
		const segment = remaining.shift();
		if (!segment || segment === ".") continue;
		if (segment === "..") {
			resolved = path.dirname(resolved);
			continue;
		}
		const candidate = path.join(resolved, segment);
		try {
			const stat = lstatSync(candidate, { bigint: true });
			if (!stat.isSymbolicLink()) {
				resolved = candidate;
				continue;
			}
			const symlinkIdentity = `${stat.dev}:${stat.ino}:${candidate}`;
			const resolutionState = `${symlinkIdentity}\0${remaining.join(path.sep)}`;
			if (symlinkHops >= MAX_DANGLING_SYMLINK_HOPS || visitedSymlinks.has(symlinkIdentity) && visitedResolutionStates.has(resolutionState)) throw createSymlinkLoopError(lexicalPath);
			visitedSymlinks.add(symlinkIdentity);
			visitedResolutionStates.add(resolutionState);
			symlinkHops += 1;
			const target = readlinkSync(candidate);
			if (path.isAbsolute(target)) {
				resolved = path.parse(target).root;
				remaining.unshift(...target.slice(resolved.length).split(path.sep));
			} else remaining.unshift(...target.split(path.sep));
		} catch (error) {
			if (error.code === "ENOENT") return {
				existingPath: resolved,
				unresolvedSegments: [segment, ...remaining]
			};
			throw error;
		}
	}
	return {
		existingPath: resolved,
		unresolvedSegments: []
	};
}
function anchorDatabasePathWithoutNormalizing(pathname) {
	const platformPath = path.sep === "\\" ? pathname.replaceAll("/", "\\") : pathname;
	if (path.isAbsolute(platformPath)) return platformPath;
	if (path.sep === "\\") {
		const driveRelative = /^([A-Za-z]:)(.*)$/u.exec(platformPath);
		if (driveRelative) {
			const driveBase = path.resolve(`${driveRelative[1]}.`);
			return driveRelative[2] ? `${driveBase}${driveBase.endsWith(path.sep) ? "" : path.sep}${driveRelative[2]}` : driveBase;
		}
	}
	const cwd = process.cwd();
	return `${cwd}${cwd.endsWith(path.sep) ? "" : path.sep}${platformPath}`;
}
function resolveAgentDatabasePathIdentity(pathname) {
	const lexicalPath = anchorDatabasePathWithoutNormalizing(pathname);
	try {
		const realPath = realpathSync.native(lexicalPath);
		const stat = statSync(realPath, { bigint: true });
		return {
			lexicalPath,
			realPath,
			device: stat.dev,
			inode: stat.ino
		};
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		const dangling = resolveDanglingSymlinkTargetPath(lexicalPath);
		const parentRealPath = realpathSync.native(dangling.existingPath);
		const parentStat = statSync(parentRealPath, { bigint: true });
		return {
			lexicalPath,
			parentDevice: parentStat.dev,
			parentInode: parentStat.ino,
			parentRealPath,
			unresolvedSuffix: dangling.unresolvedSegments.join(path.sep)
		};
	}
}
function areSameAgentDatabasePathIdentities(leftIdentity, rightIdentity) {
	if (leftIdentity.lexicalPath === rightIdentity.lexicalPath) return true;
	if (leftIdentity.realPath && leftIdentity.realPath === rightIdentity.realPath) return true;
	const parentDevice = leftIdentity.parentDevice;
	const parentInode = leftIdentity.parentInode;
	const sameMissingParent = parentDevice !== void 0 && parentInode !== void 0 && parentDevice === rightIdentity.parentDevice && parentInode === rightIdentity.parentInode;
	const sameMissingSuffix = leftIdentity.unresolvedSuffix === rightIdentity.unresolvedSuffix || sameMissingParent && parentDevice !== void 0 && parentInode !== void 0 && leftIdentity.parentRealPath !== void 0 && areMissingSuffixAliases({
		left: leftIdentity.unresolvedSuffix,
		right: rightIdentity.unresolvedSuffix,
		parentDevice,
		parentInode,
		parentRealPath: leftIdentity.parentRealPath
	});
	return leftIdentity.device !== void 0 && leftIdentity.inode !== void 0 && leftIdentity.device === rightIdentity.device && leftIdentity.inode === rightIdentity.inode || sameMissingParent && sameMissingSuffix;
}
/** Create a synchronous-operation matcher that prepares each exact locator once. */
function createOpenClawAgentDatabasePathMatcher() {
	const identities = /* @__PURE__ */ new Map();
	const resolveIdentity = (pathname) => {
		const lexicalPath = anchorDatabasePathWithoutNormalizing(pathname);
		const cached = identities.get(lexicalPath);
		if (cached) return cached;
		const identity = resolveAgentDatabasePathIdentity(lexicalPath);
		identities.set(lexicalPath, identity);
		return identity;
	};
	return (left, right) => areSameAgentDatabasePathIdentities(resolveIdentity(left), resolveIdentity(right));
}
/** Compare two database locators by canonical filesystem identity when available. */
function isSameOpenClawAgentDatabasePath(left, right) {
	return areSameAgentDatabasePathIdentities(resolveAgentDatabasePathIdentity(left), resolveAgentDatabasePathIdentity(right));
}
function registerOpenClawAgentDatabase(params) {
	if (!isPersistentOpenClawAgentDatabasePath(params.path, params.env)) return;
	const deletionFence = prepareAgentDeletionPathFence({
		agentId: params.agentId,
		path: params.path
	}, { env: params.env });
	let sizeBytes = null;
	try {
		sizeBytes = statSync(params.path).size;
	} catch {
		sizeBytes = null;
	}
	const lastSeenAt = Date.now();
	runOpenClawStateWriteTransaction((database) => {
		assertAgentDeletionPathFence(database.db, deletionFence);
		const storedPath = resolveOpenClawAgentDatabaseStoredPath(database.path, params.path);
		const db = getNodeSqliteKysely(database.db);
		executeSqliteQuerySync(database.db, db.insertInto("agent_databases").values({
			agent_id: params.agentId,
			path: storedPath,
			schema_version: params.schemaVersion ?? 19,
			last_seen_at: lastSeenAt,
			size_bytes: sizeBytes
		}).onConflict((conflict) => conflict.columns(["agent_id", "path"]).doUpdateSet({
			schema_version: params.schemaVersion ?? 19,
			last_seen_at: lastSeenAt,
			size_bytes: sizeBytes
		})));
	}, { env: params.env });
	invalidateRegisteredAgentDatabasesMemo({ env: params.env });
}
function canonicalPathForRegistryBoundary(pathname) {
	const identity = resolveAgentDatabasePathIdentity(pathname);
	if (identity.realPath) return identity.realPath;
	if (!identity.parentRealPath || !identity.unresolvedSuffix) return identity.parentRealPath ?? path.resolve(pathname);
	const unresolvedSegments = identity.unresolvedSuffix.split(path.sep);
	return unresolvedSegments.includes("..") ? identity.parentRealPath : path.join(identity.parentRealPath, ...unresolvedSegments);
}
/** Named import artifacts are offline archives, not durable runtime discovery state. */
function isPersistentOpenClawAgentDatabasePath(pathname, env = process.env) {
	const lexicalCandidate = path.resolve(pathname);
	const lexicalImportsDir = path.join(path.resolve(resolveStateDir(env)), "imports");
	if (lexicalCandidate === lexicalImportsDir || isPathInside(lexicalImportsDir, lexicalCandidate)) return false;
	const candidate = canonicalPathForRegistryBoundary(pathname);
	const stateDir = canonicalPathForRegistryBoundary(resolveStateDir(env));
	const importsDir = canonicalPathForRegistryBoundary(path.join(stateDir, "imports"));
	if (candidate === importsDir || isPathInside(importsDir, candidate)) return false;
	return true;
}
function unregisterOpenClawAgentDatabase(params) {
	runOpenClawStateWriteTransaction((database) => {
		const storedPath = resolveOpenClawAgentDatabaseStoredPath(database.path, params.path);
		const matchingPaths = [.../* @__PURE__ */ new Set([
			storedPath,
			params.path,
			path.resolve(params.path)
		])];
		const db = getNodeSqliteKysely(database.db);
		executeSqliteQuerySync(database.db, db.deleteFrom("agent_databases").where("agent_id", "=", params.agentId).where("path", "in", matchingPaths));
	}, { env: params.env });
	invalidateRegisteredAgentDatabasesMemo({ env: params.env });
}
/** Remove every durable database registration owned by a deleted agent. */
function unregisterOpenClawAgentDatabases(params) {
	runOpenClawStateWriteTransaction((database) => {
		const db = getNodeSqliteKysely(database.db);
		executeSqliteQuerySync(database.db, db.deleteFrom("agent_databases").where("agent_id", "=", params.agentId));
	}, { env: params.env });
	invalidateRegisteredAgentDatabasesMemo({ env: params.env });
}
//#endregion
//#region src/state/openclaw-agent-schema.ts
const OPENCLAW_AGENT_SCHEMA_SQL = "-- Session storage doctrine: session_nodes.entry_json is the canonical logical-session\n-- record. Promoted session_nodes columns are query indexes projected only by the\n-- session entry writer; session_windows and their children own transcript generations.\n\nCREATE TABLE IF NOT EXISTS schema_meta (\n  meta_key TEXT NOT NULL PRIMARY KEY,\n  role TEXT NOT NULL,\n  schema_version INTEGER NOT NULL,\n  agent_id TEXT,\n  app_version TEXT,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS session_nodes (\n  session_key TEXT NOT NULL PRIMARY KEY,\n  current_session_id TEXT NOT NULL,\n  entry_json TEXT NOT NULL,\n  entry_valid INTEGER NOT NULL DEFAULT 0 CHECK (entry_valid IN (-1, 0, 1)),\n  updated_at INTEGER NOT NULL,\n  status TEXT CHECK (status IS NULL OR status IN ('running', 'done', 'failed', 'killed', 'timeout')),\n  created_at INTEGER,\n  created_via TEXT CHECK (created_via IS NULL OR created_via IN ('operator', 'spawn', 'channel', 'cron', 'talk', 'run', 'plugin', 'internal')),\n  created_actor_type TEXT CHECK (created_actor_type IS NULL OR created_actor_type IN ('human', 'agent', 'system')),\n  created_actor_id TEXT,\n  owner_actor_type TEXT,\n  owner_actor_id TEXT,\n  owner_assigned_by_type TEXT,\n  owner_assigned_by_id TEXT,\n  owner_assigned_at INTEGER,\n  project_id TEXT,\n  parent_session_key TEXT,\n  spawned_by TEXT,\n  fork_source_session_key TEXT,\n  fork_source_session_id TEXT,\n  fork_source_entry_id TEXT,\n  label TEXT,\n  display_name TEXT,\n  category TEXT,\n  icon TEXT,\n  pinned_at INTEGER,\n  archived_at INTEGER,\n  last_read_at INTEGER,\n  last_interaction_at INTEGER,\n  last_activity_at INTEGER\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_nodes_updated_at\n  ON session_nodes(updated_at DESC, session_key);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_nodes_last_interaction_at\n  ON session_nodes(last_interaction_at DESC, session_key);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_nodes_parent_session_key\n  ON session_nodes(parent_session_key, session_key);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_nodes_spawned_by\n  ON session_nodes(spawned_by, session_key);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_nodes_status\n  ON session_nodes(status, session_key)\n  WHERE status IS NOT NULL;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_nodes_archived_at\n  ON session_nodes(archived_at, session_key)\n  WHERE archived_at IS NOT NULL;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_nodes_current_session_id\n  ON session_nodes(current_session_id);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_nodes_entry_valid_pending\n  ON session_nodes(session_key)\n  WHERE entry_valid = 0;\n\nCREATE TABLE IF NOT EXISTS session_participants (\n  session_key TEXT NOT NULL,\n  identity_namespace TEXT NOT NULL,\n  actor_id TEXT NOT NULL,\n  contribution_count INTEGER NOT NULL,\n  first_prompted_at INTEGER,\n  last_prompted_at INTEGER,\n  PRIMARY KEY (session_key, identity_namespace, actor_id),\n  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS session_key_contract (\n  id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),\n  main_key TEXT NOT NULL,\n  updated_at INTEGER NOT NULL\n) STRICT;\n\nINSERT OR IGNORE INTO session_key_contract (id, main_key, updated_at) VALUES (1, 'main', 0);\n\nCREATE TRIGGER IF NOT EXISTS session_nodes_entry_valid_after_insert\nAFTER INSERT ON session_nodes\nBEGIN\n  UPDATE session_nodes SET entry_valid = 0 WHERE session_key = NEW.session_key;\nEND;\n\nCREATE TRIGGER IF NOT EXISTS session_nodes_entry_valid_after_entry_update\nAFTER UPDATE OF entry_json ON session_nodes\nBEGIN\n  UPDATE session_nodes SET entry_valid = 0 WHERE session_key = NEW.session_key;\nEND;\n\nCREATE TRIGGER IF NOT EXISTS session_nodes_entry_valid_after_identity_update\nAFTER UPDATE OF current_session_id, updated_at ON session_nodes\nBEGIN\n  UPDATE session_nodes SET entry_valid = 0 WHERE session_key = NEW.session_key;\nEND;\n\nCREATE TABLE IF NOT EXISTS session_windows (\n  session_id TEXT NOT NULL PRIMARY KEY,\n  session_key TEXT NOT NULL,\n  previous_session_id TEXT,\n  reason TEXT CHECK (reason IS NULL OR reason IN ('initial', 'reset', 'rollover', 'fork', 'rewind', 'switch', 'recovery', 'compaction')),\n  session_scope TEXT NOT NULL DEFAULT 'conversation' CHECK (session_scope IN ('conversation', 'shared-main', 'group', 'channel')),\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  transcript_updated_at INTEGER DEFAULT NULL,\n  transcript_observed_at INTEGER DEFAULT NULL,\n  session_entry_provenance INTEGER NOT NULL DEFAULT 0 CHECK (session_entry_provenance IN (0, 1)),\n  acp_owned INTEGER NOT NULL DEFAULT 0 CHECK (acp_owned IN (0, 1)),\n  plugin_owner_id TEXT,\n  hook_external_content_source TEXT CHECK (hook_external_content_source IS NULL OR hook_external_content_source IN ('gmail', 'webhook')),\n  started_at INTEGER,\n  ended_at INTEGER,\n  status TEXT CHECK (status IS NULL OR status IN ('running', 'done', 'failed', 'killed', 'timeout')),\n  chat_type TEXT CHECK (chat_type IS NULL OR chat_type IN ('direct', 'group', 'channel')),\n  channel TEXT,\n  account_id TEXT,\n  primary_conversation_id TEXT,\n  model_provider TEXT,\n  model TEXT,\n  agent_harness_id TEXT,\n  parent_session_key TEXT,\n  spawned_by TEXT,\n  display_name TEXT,\n  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE,\n  FOREIGN KEY (primary_conversation_id) REFERENCES conversations(conversation_id) ON DELETE SET NULL\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_windows_updated_at\n  ON session_windows(updated_at DESC, session_id);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_windows_session_key\n  ON session_windows(session_key, updated_at DESC, session_id);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_windows_created_at\n  ON session_windows(created_at DESC, session_id);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_windows_conversation\n  ON session_windows(primary_conversation_id, updated_at DESC, session_id)\n  WHERE primary_conversation_id IS NOT NULL;\n\nCREATE TABLE IF NOT EXISTS conversations (\n  conversation_id TEXT NOT NULL PRIMARY KEY,\n  channel TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  kind TEXT NOT NULL CHECK (kind IN ('direct', 'group', 'channel')),\n  peer_id TEXT NOT NULL,\n  delivery_target TEXT NOT NULL,\n  parent_conversation_id TEXT,\n  thread_id TEXT,\n  native_channel_id TEXT,\n  native_direct_user_id TEXT,\n  label TEXT,\n  metadata_json TEXT,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_conversations_lookup\n  ON conversations(channel, account_id, kind, peer_id, thread_id);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_agent_conversations_identity\n  ON conversations(\n    channel,\n    account_id,\n    kind,\n    peer_id,\n    IFNULL(parent_conversation_id, ''),\n    IFNULL(thread_id, '')\n  );\n\nCREATE INDEX IF NOT EXISTS idx_agent_conversations_updated\n  ON conversations(updated_at DESC, conversation_id);\n\nCREATE TABLE IF NOT EXISTS conversation_deliveries (\n  operation_id TEXT NOT NULL PRIMARY KEY,\n  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('send', 'turn')),\n  conversation_id TEXT NOT NULL,\n  source_session_key TEXT,\n  message_hash TEXT NOT NULL,\n  status TEXT NOT NULL CHECK (status IN ('created', 'queued', 'sent', 'suppressed', 'rejected', 'unknown', 'replied')),\n  prepared_message_id TEXT,\n  platform_message_id TEXT,\n  queue_id TEXT,\n  rejection_error TEXT,\n  reply_message_id TEXT,\n  reply_to_id TEXT,\n  reply_thread_id TEXT,\n  reply_text TEXT,\n  reply_timestamp INTEGER,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  CHECK (\n    (status = 'rejected' AND rejection_error IS NOT NULL) OR\n    (status != 'rejected' AND rejection_error IS NULL)\n  ),\n  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_conversation_deliveries_reply\n  ON conversation_deliveries(conversation_id, platform_message_id, prepared_message_id)\n  WHERE status IN ('queued', 'sent', 'replied');\n\nCREATE INDEX IF NOT EXISTS idx_agent_conversation_deliveries_updated\n  ON conversation_deliveries(updated_at DESC, operation_id);\n\nCREATE TABLE IF NOT EXISTS session_conversations (\n  session_id TEXT NOT NULL,\n  conversation_id TEXT NOT NULL,\n  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'participant', 'related')),\n  route_context_json TEXT,\n  first_seen_at INTEGER NOT NULL,\n  last_seen_at INTEGER NOT NULL,\n  PRIMARY KEY (session_id, conversation_id, role),\n  FOREIGN KEY (session_id) REFERENCES \"session_windows\"(session_id) ON DELETE CASCADE,\n  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE\n) STRICT;\n\n-- Older same-version writers preserve the envelope while updating the association.\nCREATE TRIGGER IF NOT EXISTS session_conversations_route_context_invalidate_after_update\nAFTER UPDATE OF role, last_seen_at ON session_conversations\nWHEN NEW.route_context_json IS OLD.route_context_json\nBEGIN\n  UPDATE session_conversations\n  SET route_context_json = NULL\n  WHERE session_id = NEW.session_id\n    AND conversation_id = NEW.conversation_id\n    AND role = NEW.role;\nEND;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_conversations_conversation\n  ON session_conversations(conversation_id, last_seen_at DESC, session_id);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_agent_session_conversations_primary\n  ON session_conversations(session_id)\n  WHERE role = 'primary';\n\nCREATE TABLE IF NOT EXISTS session_members (\n  session_key TEXT NOT NULL,\n  identity_id TEXT NOT NULL,\n  added_by TEXT NOT NULL,\n  added_at INTEGER NOT NULL,\n  PRIMARY KEY (session_key, identity_id),\n  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_members_identity\n  ON session_members(identity_id, session_key);\n\nCREATE TABLE IF NOT EXISTS session_suggestions (\n  id TEXT PRIMARY KEY,\n  session_key TEXT NOT NULL,\n  author_id TEXT NOT NULL,\n  author_label TEXT,\n  text TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  state TEXT NOT NULL CHECK (state IN ('pending', 'accepted', 'dismissed')),\n  dispatch_token TEXT,\n  dispatch_started_at INTEGER,\n  dispatch_resolution TEXT CHECK (dispatch_resolution IN ('send', 'queue', 'edit', 'dismiss')),\n  CHECK (\n    (dispatch_token IS NULL AND dispatch_started_at IS NULL AND dispatch_resolution IS NULL)\n    OR (dispatch_token IS NOT NULL AND dispatch_started_at IS NOT NULL AND dispatch_resolution IS NOT NULL)\n  ),\n  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_suggestions_session_state_created\n  ON session_suggestions(session_key, state, created_at, id);\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_suggestions_author_created\n  ON session_suggestions(author_id, created_at, id);\n\nCREATE TABLE IF NOT EXISTS board_tabs (\n  session_key TEXT NOT NULL,\n  tab_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  position INTEGER NOT NULL CHECK (position >= 0),\n  chat_dock TEXT NOT NULL DEFAULT 'right' CHECK (chat_dock IN ('left', 'right', 'bottom', 'hidden')),\n  created_by TEXT NOT NULL CHECK (created_by IN ('user', 'agent')),\n  revision INTEGER NOT NULL CHECK (revision >= 0),\n  PRIMARY KEY (session_key, tab_id),\n  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS board_widgets (\n  session_key TEXT NOT NULL,\n  name TEXT NOT NULL,\n  tab_id TEXT NOT NULL,\n  title TEXT,\n  content_kind TEXT NOT NULL CHECK (content_kind IN ('html', 'mcp-app', 'plugin')),\n  html BLOB,\n  descriptor_json TEXT,\n  sha256 TEXT NOT NULL,\n  view_generation TEXT,\n  revision INTEGER NOT NULL CHECK (revision >= 1),\n  size_w INTEGER NOT NULL CHECK (size_w BETWEEN 1 AND 12),\n  size_h INTEGER NOT NULL CHECK (size_h BETWEEN 1 AND 20),\n  position INTEGER NOT NULL CHECK (position >= 0),\n  manifest TEXT NOT NULL DEFAULT '{}',\n  grant_state TEXT NOT NULL DEFAULT 'none' CHECK (grant_state IN ('none', 'pending', 'granted', 'rejected')),\n  granted_sha TEXT,\n  created_by TEXT NOT NULL CHECK (created_by IN ('user', 'agent')),\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  PRIMARY KEY (session_key, name),\n  FOREIGN KEY (session_key, tab_id) REFERENCES board_tabs(session_key, tab_id) ON DELETE CASCADE,\n  CHECK (\n    (content_kind = 'html' AND html IS NOT NULL AND descriptor_json IS NULL AND view_generation IS NOT NULL) OR\n    (content_kind = 'mcp-app' AND html IS NULL AND descriptor_json IS NOT NULL AND view_generation IS NULL) OR\n    (content_kind = 'plugin' AND html IS NULL AND descriptor_json IS NOT NULL AND view_generation IS NULL)\n  )\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_board_widgets_tab_position\n  ON board_widgets(session_key, tab_id, position);\n\nCREATE TABLE IF NOT EXISTS session_progress_cards (\n  session_key TEXT NOT NULL PRIMARY KEY,\n  markdown TEXT,\n  steps_json TEXT,\n  revision INTEGER NOT NULL,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS heartbeat_outcomes (\n  session_key TEXT NOT NULL PRIMARY KEY,\n  run_session_key TEXT NOT NULL,\n  outcome TEXT NOT NULL CHECK (outcome IN ('progress', 'done', 'blocked', 'needs_attention')),\n  summary TEXT NOT NULL,\n  response_reason TEXT,\n  priority TEXT CHECK (priority IS NULL OR priority IN ('low', 'normal', 'high')),\n  next_check TEXT,\n  task_names_json TEXT,\n  wake_source TEXT,\n  wake_reason TEXT,\n  occurred_at INTEGER NOT NULL,\n  context_run_id TEXT,\n  context_claimed_at INTEGER,\n  updated_at INTEGER NOT NULL,\n  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS message_tool_run_outcomes (\n  id INTEGER PRIMARY KEY,\n  run_id TEXT NOT NULL,\n  session_key TEXT NOT NULL,\n  agent_id TEXT NOT NULL,\n  provider TEXT NOT NULL,\n  model TEXT NOT NULL,\n  outcome TEXT NOT NULL CHECK (outcome IN ('tool_delivered', 'mute')),\n  run_status TEXT NOT NULL CHECK (run_status IN ('completed', 'errored', 'aborted')),\n  occurred_at INTEGER NOT NULL\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_message_tool_run_outcomes_occurred\n  ON message_tool_run_outcomes(occurred_at DESC, id DESC);\n\n-- Receipts outlive Goal clear and session reset so a delayed retry cannot recreate a Goal.\n-- They intentionally have no session FK; bounded retention belongs to the operation owner.\nCREATE TABLE IF NOT EXISTS session_goal_operations (\n  session_key TEXT NOT NULL,\n  operation_id TEXT NOT NULL,\n  session_id TEXT NOT NULL,\n  request_fingerprint TEXT NOT NULL,\n  result_json TEXT NOT NULL,\n  expires_at INTEGER NOT NULL,\n  PRIMARY KEY (session_key, operation_id)\n) STRICT;\nCREATE INDEX IF NOT EXISTS idx_agent_session_goal_operations_expiry\n  ON session_goal_operations(expires_at);\n\nCREATE TABLE IF NOT EXISTS transcript_events (\n  session_id TEXT NOT NULL,\n  seq INTEGER NOT NULL,\n  event_json TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  PRIMARY KEY (session_id, seq),\n  FOREIGN KEY (session_id) REFERENCES \"session_windows\"(session_id) ON DELETE CASCADE\n) STRICT;\n\n-- Canonical cold-tier owner for reclaimed transcript generations. The derived\n-- .deleted/.reset file may be recreated from this row after a crash.\nCREATE TABLE IF NOT EXISTS session_transcript_archives (\n  session_id TEXT NOT NULL,\n  generation TEXT NOT NULL,\n  session_key TEXT NOT NULL,\n  reason TEXT NOT NULL CHECK (reason IN ('deleted', 'reset')),\n  encoding TEXT NOT NULL CHECK (encoding IN ('identity', 'zstd')),\n  archive_blob BLOB NOT NULL,\n  archive_sha256 TEXT NOT NULL CHECK (length(archive_sha256) = 64),\n  archive_name TEXT NOT NULL UNIQUE,\n  created_at INTEGER NOT NULL,\n  published_at INTEGER,\n  publish_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),\n  last_publish_attempt_at INTEGER,\n  last_publish_error TEXT,\n  PRIMARY KEY (session_id, generation),\n  CHECK (archive_name NOT LIKE '%/%' AND archive_name NOT LIKE '%\\%')\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_transcript_archives_pending\n  ON session_transcript_archives(created_at, session_id, generation)\n  WHERE published_at IS NULL;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_transcript_archives_retention\n  ON session_transcript_archives(created_at, session_id, generation);\n\nCREATE TABLE IF NOT EXISTS transcript_rewrite_watermarks (\n  session_id TEXT NOT NULL PRIMARY KEY,\n  generation TEXT NOT NULL,\n  updated_at INTEGER NOT NULL,\n  FOREIGN KEY (session_id) REFERENCES \"session_windows\"(session_id) ON DELETE CASCADE\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS trajectory_runtime_events (\n  session_id TEXT NOT NULL,\n  seq INTEGER NOT NULL,\n  run_id TEXT,\n  event_json TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  PRIMARY KEY (session_id, seq),\n  FOREIGN KEY (session_id) REFERENCES \"session_windows\"(session_id) ON DELETE CASCADE\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_trajectory_runtime_run\n  ON trajectory_runtime_events(session_id, run_id, seq)\n  WHERE run_id IS NOT NULL;\n\nCREATE TABLE IF NOT EXISTS acp_parent_stream_events (\n  session_id TEXT NOT NULL,\n  run_id TEXT NOT NULL,\n  seq INTEGER NOT NULL,\n  event_json TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  PRIMARY KEY (session_id, run_id, seq),\n  FOREIGN KEY (session_id) REFERENCES \"session_windows\"(session_id) ON DELETE CASCADE\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_acp_parent_stream_run\n  ON acp_parent_stream_events(run_id, seq);\n\nCREATE TABLE IF NOT EXISTS transcript_event_identities (\n  session_id TEXT NOT NULL,\n  event_id TEXT NOT NULL,\n  seq INTEGER NOT NULL,\n  event_type TEXT,\n  parent_id TEXT,\n  message_idempotency_key TEXT,\n  created_at INTEGER NOT NULL,\n  PRIMARY KEY (session_id, event_id),\n  FOREIGN KEY (session_id, seq) REFERENCES transcript_events(session_id, seq) ON DELETE CASCADE\n) STRICT;\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_agent_transcript_message_idempotency\n  ON transcript_event_identities(session_id, message_idempotency_key)\n  WHERE message_idempotency_key IS NOT NULL;\n\nCREATE INDEX IF NOT EXISTS idx_agent_transcript_event_identity_sequence\n  ON transcript_event_identities(session_id, seq);\n\nCREATE INDEX IF NOT EXISTS idx_agent_transcript_event_parent\n  ON transcript_event_identities(session_id, parent_id)\n  WHERE parent_id IS NOT NULL;\n\nCREATE INDEX IF NOT EXISTS idx_agent_transcript_event_sequence\n  ON transcript_event_identities(session_id, event_type, seq DESC);\n\nCREATE TABLE IF NOT EXISTS context_engine_turn_outbox (\n  advancement_key TEXT NOT NULL PRIMARY KEY,\n  engine_id TEXT NOT NULL,\n  owner_plugin_id TEXT,\n  session_id TEXT NOT NULL,\n  payload_json TEXT NOT NULL,\n  attempt_count INTEGER NOT NULL DEFAULT 0,\n  last_attempt_at INTEGER,\n  last_error TEXT,\n  created_at INTEGER NOT NULL\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_context_engine_turn_outbox_engine\n  ON context_engine_turn_outbox(engine_id, created_at);\n\nCREATE TABLE IF NOT EXISTS cache_entries (\n  scope TEXT NOT NULL,\n  key TEXT NOT NULL,\n  value_json TEXT,\n  blob BLOB,\n  expires_at INTEGER,\n  updated_at INTEGER NOT NULL,\n  PRIMARY KEY (scope, key)\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_cache_expiry\n  ON cache_entries(scope, expires_at, key)\n  WHERE expires_at IS NOT NULL;\n\nCREATE INDEX IF NOT EXISTS idx_agent_cache_updated\n  ON cache_entries(scope, updated_at DESC, key);\n\nCREATE TABLE IF NOT EXISTS auth_profile_store (\n  store_key TEXT NOT NULL PRIMARY KEY,\n  store_json TEXT NOT NULL,\n  updated_at INTEGER NOT NULL\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS auth_profile_state (\n  state_key TEXT NOT NULL PRIMARY KEY,\n  state_json TEXT NOT NULL,\n  updated_at INTEGER NOT NULL\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_index_meta (\n  key TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_index_sources (\n  id INTEGER PRIMARY KEY,\n  path TEXT NOT NULL,\n  source TEXT NOT NULL DEFAULT 'memory',\n  hash TEXT NOT NULL,\n  mtime REAL NOT NULL,\n  size INTEGER NOT NULL,\n  UNIQUE (path, source)\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_index_chunks (\n  id TEXT PRIMARY KEY,\n  path TEXT NOT NULL,\n  source TEXT NOT NULL DEFAULT 'memory',\n  start_line INTEGER NOT NULL,\n  end_line INTEGER NOT NULL,\n  hash TEXT NOT NULL,\n  model TEXT NOT NULL,\n  text TEXT NOT NULL,\n  embedding TEXT NOT NULL,\n  updated_at INTEGER NOT NULL\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_index_chunk_recall_metadata (\n  chunk_id TEXT PRIMARY KEY,\n  importance INTEGER CHECK (importance IS NULL OR importance BETWEEN 1 AND 10),\n  triggers TEXT,\n  project_key TEXT,\n  FOREIGN KEY (chunk_id) REFERENCES memory_index_chunks(id) ON DELETE CASCADE\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_index_chunk_provenance (\n  chunk_id TEXT PRIMARY KEY,\n  origin_class TEXT NOT NULL CHECK (origin_class IN ('owner', 'agent', 'untrusted', 'system')),\n  session_kind TEXT NOT NULL CHECK (session_kind IN ('interactive', 'cron', 'heartbeat', 'subagent', 'unknown')),\n  observed_at INTEGER NOT NULL,\n  supersedes_key TEXT,\n  FOREIGN KEY (chunk_id) REFERENCES memory_index_chunks(id) ON DELETE CASCADE\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_entry_origins (\n  entry_key TEXT NOT NULL,\n  agent_id TEXT NOT NULL,\n  session_id TEXT NOT NULL,\n  session_key TEXT,\n  origin_class TEXT NOT NULL CHECK (origin_class IN ('owner', 'agent', 'untrusted', 'system')),\n  observed_at INTEGER NOT NULL,\n  PRIMARY KEY (entry_key, agent_id, session_id)\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_session_tombstones (\n  session_id TEXT NOT NULL PRIMARY KEY,\n  agent_id TEXT NOT NULL,\n  reason TEXT NOT NULL,\n  created_at INTEGER NOT NULL\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_embedding_cache (\n  provider TEXT NOT NULL,\n  model TEXT NOT NULL,\n  provider_key TEXT NOT NULL,\n  hash TEXT NOT NULL,\n  embedding TEXT NOT NULL,\n  dims INTEGER,\n  updated_at INTEGER NOT NULL,\n  PRIMARY KEY (provider, model, provider_key, hash)\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS memory_index_state (\n  id INTEGER PRIMARY KEY CHECK (id = 1),\n  revision INTEGER NOT NULL\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS standing_intents (\n  intent_key INTEGER PRIMARY KEY,\n  id TEXT NOT NULL UNIQUE,\n  description TEXT NOT NULL,\n  trigger_keywords TEXT NOT NULL,\n  trigger_embedding TEXT,\n  channel_scope TEXT,\n  sender_scope TEXT,\n  creator_sender TEXT CHECK (creator_sender IS NULL OR length(trim(creator_sender)) > 0),\n  status TEXT NOT NULL CHECK (status IN ('pending', 'armed', 'fired', 'done', 'cancelled', 'expired')),\n  expires_at INTEGER NOT NULL,\n  max_fires INTEGER NOT NULL CHECK (max_fires > 0),\n  fire_count INTEGER NOT NULL DEFAULT 0 CHECK (fire_count >= 0),\n  cooldown_seconds INTEGER NOT NULL DEFAULT 86400 CHECK (cooldown_seconds >= 0),\n  last_fired_at INTEGER,\n  created_at INTEGER NOT NULL,\n  source_session_id TEXT\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_standing_intents_lifecycle\n  ON standing_intents(status, expires_at, last_fired_at);\n\nCREATE INDEX IF NOT EXISTS idx_standing_intents_scope\n  ON standing_intents(status, channel_scope, sender_scope);\n\nCREATE VIRTUAL TABLE IF NOT EXISTS standing_intents_fts USING fts5(\n  trigger_keywords,\n  content = 'standing_intents',\n  content_rowid = 'intent_key',\n  tokenize = 'unicode61 remove_diacritics 2'\n);\n\nCREATE TRIGGER IF NOT EXISTS standing_intents_fts_after_insert\nAFTER INSERT ON standing_intents\nBEGIN\n  INSERT INTO standing_intents_fts(rowid, trigger_keywords)\n  VALUES (new.intent_key, new.trigger_keywords);\nEND;\n\nCREATE TRIGGER IF NOT EXISTS standing_intents_fts_after_delete\nAFTER DELETE ON standing_intents\nBEGIN\n  INSERT INTO standing_intents_fts(standing_intents_fts, rowid, trigger_keywords)\n  VALUES ('delete', old.intent_key, old.trigger_keywords);\nEND;\n\nCREATE TRIGGER IF NOT EXISTS standing_intents_fts_after_update\nAFTER UPDATE OF trigger_keywords ON standing_intents\nBEGIN\n  INSERT INTO standing_intents_fts(standing_intents_fts, rowid, trigger_keywords)\n  VALUES ('delete', old.intent_key, old.trigger_keywords);\n  INSERT INTO standing_intents_fts(rowid, trigger_keywords)\n  VALUES (new.intent_key, new.trigger_keywords);\nEND;\n\nCREATE TABLE IF NOT EXISTS session_transcript_index_state (\n  session_id TEXT NOT NULL PRIMARY KEY,\n  indexed_seq INTEGER NOT NULL,\n  leaf_event_id TEXT,\n  needs_rebuild INTEGER NOT NULL DEFAULT 0,\n  active_event_count INTEGER NOT NULL DEFAULT 0,\n  active_message_count INTEGER NOT NULL DEFAULT 0,\n  updated_at INTEGER NOT NULL,\n  FOREIGN KEY (session_id) REFERENCES session_windows(session_id) ON DELETE CASCADE\n) STRICT;\n\nCREATE TABLE IF NOT EXISTS session_transcript_active_events (\n  session_id TEXT NOT NULL,\n  active_position INTEGER NOT NULL CHECK (active_position >= 0),\n  event_seq INTEGER NOT NULL,\n  message_position INTEGER CHECK (message_position IS NULL OR message_position >= 0),\n  context_eligible INTEGER,\n  PRIMARY KEY (session_id, active_position),\n  FOREIGN KEY (session_id, event_seq) REFERENCES transcript_events(session_id, seq) ON DELETE CASCADE\n) STRICT;\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_agent_transcript_active_event_seq\n  ON session_transcript_active_events(session_id, event_seq);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_agent_transcript_active_messages\n  ON session_transcript_active_events(session_id, message_position)\n  WHERE message_position IS NOT NULL;\n\nCREATE INDEX IF NOT EXISTS idx_agent_transcript_context_pending\n  ON session_transcript_active_events(session_id)\n  WHERE context_eligible IS NULL;\n\nCREATE VIRTUAL TABLE IF NOT EXISTS session_transcript_fts USING fts5(\n  text,\n  session_id UNINDEXED,\n  message_id UNINDEXED,\n  role UNINDEXED,\n  timestamp UNINDEXED,\n  tokenize = 'unicode61 remove_diacritics 2'\n);\n\nINSERT OR IGNORE INTO memory_index_state (id, revision) VALUES (1, 0);\n\nCREATE TRIGGER IF NOT EXISTS memory_index_sources_revision_after_insert\nAFTER INSERT ON memory_index_sources\nBEGIN\n  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;\nEND;\n\nCREATE TRIGGER IF NOT EXISTS memory_index_sources_revision_after_update\nAFTER UPDATE ON memory_index_sources\nBEGIN\n  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;\nEND;\n\nCREATE TRIGGER IF NOT EXISTS memory_index_sources_revision_after_delete\nAFTER DELETE ON memory_index_sources\nBEGIN\n  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;\nEND;\n\nCREATE TRIGGER IF NOT EXISTS memory_index_chunks_revision_after_insert\nAFTER INSERT ON memory_index_chunks\nBEGIN\n  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;\nEND;\n\nCREATE TRIGGER IF NOT EXISTS memory_index_chunks_revision_after_update\nAFTER UPDATE ON memory_index_chunks\nBEGIN\n  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;\nEND;\n\nCREATE TRIGGER IF NOT EXISTS memory_index_chunks_revision_after_delete\nAFTER DELETE ON memory_index_chunks\nBEGIN\n  UPDATE memory_index_state SET revision = revision + 1 WHERE id = 1;\nEND;\n\nCREATE INDEX IF NOT EXISTS idx_memory_embedding_cache_updated_at\n  ON memory_embedding_cache(updated_at);\n\nCREATE INDEX IF NOT EXISTS idx_memory_index_sources_source\n  ON memory_index_sources(source);\n\nCREATE INDEX IF NOT EXISTS idx_memory_index_chunks_path_source\n  ON memory_index_chunks(path, source);\n\nCREATE INDEX IF NOT EXISTS idx_memory_index_chunks_path\n  ON memory_index_chunks(path);\n\nCREATE INDEX IF NOT EXISTS idx_memory_index_chunks_source\n  ON memory_index_chunks(source);\n\n-- Accepted input stays outside the active transcript until its exact turn owns execution.\nCREATE TABLE IF NOT EXISTS session_pending_inputs (\n  seq INTEGER PRIMARY KEY AUTOINCREMENT,\n  input_id TEXT NOT NULL UNIQUE,\n  session_key TEXT NOT NULL,\n  session_id TEXT NOT NULL,\n  idempotency_key TEXT NOT NULL,\n  run_id TEXT NOT NULL,\n  request_hash TEXT NOT NULL,\n  message_json TEXT NOT NULL,\n  lifecycle_generation TEXT NOT NULL,\n  state TEXT NOT NULL CHECK (state IN ('queued', 'interrupted', 'cancelled')),\n  accepted_at INTEGER NOT NULL,\n  consumed_event_id TEXT,\n  UNIQUE (session_id, idempotency_key),\n  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE,\n  FOREIGN KEY (session_id) REFERENCES session_windows(session_id) ON DELETE CASCADE\n) STRICT;\n\nCREATE INDEX IF NOT EXISTS idx_agent_session_pending_inputs_session\n  ON session_pending_inputs(session_key, session_id, seq DESC);\n";
//#endregion
//#region src/state/openclaw-agent-board-schema.ts
const BOARD_SCHEMA_START = "CREATE TABLE IF NOT EXISTS board_tabs (";
const BOARD_SCHEMA_END = "CREATE TABLE IF NOT EXISTS session_progress_cards (";
const BOARD_WIDGETS_SCHEMA_START = "CREATE TABLE IF NOT EXISTS board_widgets (";
const BOARD_WIDGETS_SCHEMA_END = "CREATE INDEX IF NOT EXISTS idx_agent_board_widgets_tab_position";
const BOARD_WIDGETS_MIGRATION_TABLE = "board_widgets_plugin_kind_migration_new";
const PLUGIN_CONTENT_KIND_CLAUSE_PATTERN = /content_kind\s+IN\s*\(\s*'html'\s*,\s*'mcp-app'\s*,\s*'plugin'\s*\)/iu;
const PLUGIN_PAYLOAD_BRANCH_PATTERN = /\s+OR\s+\(content_kind\s*=\s*'plugin'\s+AND\s+html\s+IS\s+NULL\s+AND\s+descriptor_json\s+IS\s+NOT\s+NULL\s+AND\s+view_generation\s+IS\s+NULL\)/iu;
function splitBoardSchema(sql) {
	const start = sql.indexOf(BOARD_SCHEMA_START);
	const end = sql.indexOf(BOARD_SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw agent board schema markers are missing from the canonical schema.");
	return {
		board: sql.slice(start, end),
		withoutBoard: `${sql.slice(0, start)}${sql.slice(end)}`
	};
}
const boardSchema = splitBoardSchema(OPENCLAW_AGENT_SCHEMA_SQL);
const OPENCLAW_AGENT_BOARD_SCHEMA_SQL = boardSchema.board;
const AGENT_V14_BOARD_SCHEMA_SQL = OPENCLAW_AGENT_BOARD_SCHEMA_SQL;
const OPENCLAW_AGENT_SCHEMA_WITHOUT_BOARD_SQL = boardSchema.withoutBoard;
function canonicalBoardWidgetsCreateSql() {
	const start = OPENCLAW_AGENT_BOARD_SCHEMA_SQL.indexOf(BOARD_WIDGETS_SCHEMA_START);
	const end = OPENCLAW_AGENT_BOARD_SCHEMA_SQL.indexOf(BOARD_WIDGETS_SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw agent board widget schema markers are missing.");
	return OPENCLAW_AGENT_BOARD_SCHEMA_SQL.slice(start, end).trim();
}
function legacyBoardWidgetsCreateSql() {
	const canonical = canonicalBoardWidgetsCreateSql();
	const legacy = canonical.replace(PLUGIN_CONTENT_KIND_CLAUSE_PATTERN, "content_kind IN ('html', 'mcp-app')").replace(PLUGIN_PAYLOAD_BRANCH_PATTERN, "");
	if (legacy === canonical) throw new Error("OpenClaw agent board widget legacy schema derivation failed.");
	return legacy;
}
function normalizeBoardWidgetsCreateSql(sql) {
	return sql.replace(/^CREATE TABLE(?: IF NOT EXISTS)?\s+(?:board_widgets|"board_widgets"|`board_widgets`|\[board_widgets\])\s*\(/iu, "CREATE TABLE board_widgets (").replace(/\s+/gu, " ").replace(/;\s*$/u, "").trim();
}
/** Repair the v14 board constraint inside the caller's schema/write transaction. */
function ensureOpenClawAgentBoardSchemaInTransaction(db) {
	if (!db.isTransaction) throw new Error("board schema ensure requires an active transaction");
	db.exec(OPENCLAW_AGENT_BOARD_SCHEMA_SQL);
	const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'board_widgets'").get();
	if (typeof row?.sql !== "string") throw new Error("OpenClaw agent board widget schema is missing after ensure.");
	const normalizedSchema = normalizeBoardWidgetsCreateSql(row.sql);
	if (normalizedSchema === normalizeBoardWidgetsCreateSql(canonicalBoardWidgetsCreateSql())) return;
	if (normalizedSchema !== normalizeBoardWidgetsCreateSql(legacyBoardWidgetsCreateSql())) throw new Error("OpenClaw agent board widget schema has an unsupported content-kind constraint.");
	if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(BOARD_WIDGETS_MIGRATION_TABLE)) throw new Error(`OpenClaw agent board migration table already exists: ${BOARD_WIDGETS_MIGRATION_TABLE}`);
	const migrationCreateSql = canonicalBoardWidgetsCreateSql().replace(BOARD_WIDGETS_SCHEMA_START, `CREATE TABLE ${BOARD_WIDGETS_MIGRATION_TABLE} (`);
	db.exec(`
    ${migrationCreateSql}
    INSERT INTO ${BOARD_WIDGETS_MIGRATION_TABLE} (
      session_key, name, tab_id, title, content_kind, html, descriptor_json, sha256,
      view_generation, revision, size_w, size_h, position, manifest, grant_state,
      granted_sha, created_by, created_at, updated_at
    )
    SELECT
      session_key, name, tab_id, title, content_kind, html, descriptor_json, sha256,
      view_generation, revision, size_w, size_h, position, manifest, grant_state,
      granted_sha, created_by, created_at, updated_at
    FROM board_widgets;
    DROP TABLE board_widgets;
    ALTER TABLE ${BOARD_WIDGETS_MIGRATION_TABLE} RENAME TO board_widgets;
  `);
	db.exec(OPENCLAW_AGENT_BOARD_SCHEMA_SQL);
}
//#endregion
//#region src/state/openclaw-agent-context-engine-turn-outbox-schema.ts
const CONTEXT_ENGINE_TURN_OUTBOX_TABLE = "context_engine_turn_outbox";
const OUTBOX_SCHEMA_START = `CREATE TABLE IF NOT EXISTS ${CONTEXT_ENGINE_TURN_OUTBOX_TABLE} (`;
const OUTBOX_SCHEMA_END = "CREATE TABLE IF NOT EXISTS cache_entries (";
const ENSURED_DATABASES$2 = /* @__PURE__ */ new WeakSet();
function contextEngineTurnOutboxSchemaSql() {
	const start = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(OUTBOX_SCHEMA_START);
	const end = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(OUTBOX_SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw context-engine turn outbox schema markers are missing.");
	return OPENCLAW_AGENT_SCHEMA_SQL.slice(start, end);
}
/** Lazily installs the additive context-engine turn outbox on first use. */
function ensureContextEngineTurnOutboxSchema(db) {
	if (ENSURED_DATABASES$2.has(db)) return;
	const ensure = () => {
		db.exec(contextEngineTurnOutboxSchemaSql());
	};
	if (db.isTransaction) {
		ensure();
		return;
	}
	runSqliteImmediateTransactionSync(db, ensure);
	ENSURED_DATABASES$2.add(db);
}
//#endregion
//#region src/state/openclaw-agent-db-additive-columns.ts
const FIRST_USE_ADDITIVE_AGENT_COLUMN_DEFINITIONS = [
	{
		columnName: "owner_actor_type",
		dataType: "TEXT",
		tableName: "session_nodes"
	},
	{
		columnName: "owner_actor_id",
		dataType: "TEXT",
		tableName: "session_nodes"
	},
	{
		columnName: "owner_assigned_by_type",
		dataType: "TEXT",
		tableName: "session_nodes"
	},
	{
		columnName: "owner_assigned_by_id",
		dataType: "TEXT",
		tableName: "session_nodes"
	},
	{
		columnName: "owner_assigned_at",
		dataType: "INTEGER",
		tableName: "session_nodes"
	}
];
//#endregion
//#region src/config/sessions/session-entry-json.ts
function hasValidSessionEntryIdentity(entry) {
	return typeof entry.sessionId === "string" && typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt);
}
function parseSqliteSessionEntryRecord(row) {
	try {
		const parsed = JSON.parse(row.entry_json);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		const record = parsed;
		if (!hasValidSessionEntryIdentity(record)) return null;
		if (row.current_session_id !== void 0 && row.current_session_id !== record.sessionId || row.updated_at !== void 0 && row.updated_at !== record.updatedAt) return null;
		return record;
	} catch {
		return null;
	}
}
//#endregion
//#region src/routing/conversation-ref.ts
/** Canonicalizes an adapter target into the peer id used by inbound routing. */
function normalizeConversationPeerId(channel, value) {
	let normalized = value.trim();
	const channelPrefix = `${channel.trim().toLowerCase()}:`;
	if (normalized.toLowerCase().startsWith(channelPrefix)) normalized = normalized.slice(channelPrefix.length).trim();
	return normalized.replace(/^(user|channel|group|conversation|room|dm|thread):/i, "").trim();
}
/** Builds an opaque address from canonical transport identity, never from model-session state. */
function buildConversationRef(params) {
	return `conv_${crypto.createHash("sha256").update(JSON.stringify([
		params.channel,
		params.accountId,
		params.kind,
		params.peerId,
		params.parentConversationRef ?? "",
		params.threadId ?? ""
	])).digest("hex").slice(0, 32)}`;
}
//#endregion
//#region src/state/creator-namespace-migration.ts
/** Doctor and versioned upgrades alone may qualify historical creation seams. */
function migrateLegacySessionCreator(entry) {
	const legacy = entry;
	const actor = entry.createdActor ?? (isRecord(legacy.createdBy) ? {
		...legacy.createdBy,
		type: "human",
		source: "unknown"
	} : void 0);
	if (actor?.type !== "human") return entry;
	const source = actor.source === "profile" || actor.source === "channel" || actor.source === "unknown" ? actor.source : entry.createdVia === "operator" || entry.createdVia === "run" ? "profile" : entry.createdVia === "channel" ? "channel" : "unknown";
	if (actor === entry.createdActor && source === actor.source && !legacy.createdBy) return entry;
	const migrated = {
		...legacy,
		createdActor: {
			...actor,
			source
		}
	};
	delete migrated.createdBy;
	return migrated;
}
//#endregion
//#region src/state/openclaw-agent-pending-inputs-schema.ts
const SESSION_PENDING_INPUTS_TABLE = "session_pending_inputs";
const presentDatabases = /* @__PURE__ */ new WeakSet();
const completeDatabases = /* @__PURE__ */ new WeakSet();
let absentDatabases = /* @__PURE__ */ new WeakSet();
/** Cache feature-table presence per connection; first use invalidates earlier absence checks. */
function hasSessionPendingInputsSchema(db) {
	if (presentDatabases.has(db)) return true;
	if (!db.isTransaction && absentDatabases.has(db)) return false;
	const present = Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(SESSION_PENDING_INPUTS_TABLE));
	if (!db.isTransaction) (present ? presentDatabases : absentDatabases).add(db);
	return present;
}
/** Lazily installs accepted-input custody without changing either schema version marker. */
function ensureSessionPendingInputsSchema(db) {
	if (completeDatabases.has(db)) return;
	const start = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(`CREATE TABLE IF NOT EXISTS ${SESSION_PENDING_INPUTS_TABLE} (`);
	if (start < 0) throw new Error("OpenClaw pending-input schema marker is missing.");
	const nested = db.isTransaction;
	runSqliteImmediateTransactionSync(db, () => {
		db.exec(OPENCLAW_AGENT_SCHEMA_SQL.slice(start));
		ensureColumn(db, SESSION_PENDING_INPUTS_TABLE, "consumed_event_id TEXT");
	});
	absentDatabases = /* @__PURE__ */ new WeakSet();
	if (!nested) {
		presentDatabases.add(db);
		completeDatabases.add(db);
	}
}
/** Existing same-version stores converge through Doctor/open; absent tables stay feature-local. */
function hasPendingInputConsumptionColumnMigration(db) {
	return hasSessionPendingInputsSchema(db) && !tableHasColumn(db, "session_pending_inputs", "consumed_event_id");
}
function ensurePendingInputConsumptionColumn(db) {
	ensureColumn(db, SESSION_PENDING_INPUTS_TABLE, "consumed_event_id TEXT");
}
/** Read-only callers can inspect pre-feature stores without installing schema. */
function hasPendingInputConsumptionColumn(db) {
	if (completeDatabases.has(db)) return true;
	const present = tableHasColumn(db, SESSION_PENDING_INPUTS_TABLE, "consumed_event_id");
	if (present && !db.isTransaction) completeDatabases.add(db);
	return present;
}
//#endregion
//#region src/state/openclaw-agent-db-session-migrations.ts
function parseConversationEntry(value) {
	return typeof value === "string" ? safeParseJsonRecord(value) : void 0;
}
function inferMigratedChatType(params) {
	const explicit = normalizeChatType(normalizeOptionalString(params.entry.chatType)) ?? normalizeChatType(normalizeOptionalString(params.persistedChatType));
	if (explicit) return explicit;
	const keyType = deriveSessionChatTypeFromKey(params.sessionKey);
	if (keyType !== "unknown") return keyType;
	const target = params.deliveryTarget?.toLowerCase();
	if (target?.startsWith("channel:") || /^[^:]+:channel:/u.test(target ?? "")) return "channel";
	if (/^(?:[^:]+:)?(?:group|room):/u.test(target ?? "") || normalizeOptionalString(params.entry.groupId)) return "group";
	return "direct";
}
function migratedConversation(entry, persistedChatType, sessionKey) {
	const canonicalDelivery = asOptionalRecord(entry.delivery);
	const delivery = asOptionalRecord(canonicalDelivery?.context) ?? asOptionalRecord(entry.deliveryContext);
	const origin = asOptionalRecord(canonicalDelivery?.origin) ?? asOptionalRecord(entry.origin);
	const deliveryRouteTarget = normalizeOptionalString(delivery?.to);
	const kind = inferMigratedChatType({
		entry,
		persistedChatType,
		sessionKey,
		deliveryTarget: deliveryRouteTarget ?? normalizeOptionalString(origin?.from)
	});
	const deliveryTarget = deliveryRouteTarget ?? (kind === "direct" ? normalizeOptionalString(origin?.from) : void 0);
	if (!deliveryTarget) return;
	const routeOwnsTarget = Boolean(deliveryRouteTarget);
	const channel = (routeOwnsTarget ? normalizeOptionalString(delivery?.channel) ?? normalizeOptionalString(entry.channel) ?? normalizeOptionalString(entry.lastChannel) ?? normalizeOptionalString(origin?.provider) : normalizeOptionalString(origin?.provider))?.toLowerCase();
	const accountId = normalizeAccountId(routeOwnsTarget ? normalizeOptionalString(delivery?.accountId) ?? normalizeOptionalString(entry.lastAccountId) ?? normalizeOptionalString(origin?.accountId) : normalizeOptionalString(origin?.accountId));
	const threadIdRaw = routeOwnsTarget ? delivery?.threadId : origin?.threadId;
	const threadId = typeof threadIdRaw === "number" && Number.isFinite(threadIdRaw) ? String(threadIdRaw) : normalizeOptionalString(threadIdRaw);
	const peerId = channel ? normalizeConversationPeerId(channel, deliveryTarget) : void 0;
	if (!channel || !peerId) return;
	return {
		conversationRef: buildConversationRef({
			channel,
			accountId,
			kind,
			peerId,
			threadId
		}),
		channel,
		accountId,
		kind,
		peerId,
		deliveryTarget,
		threadId,
		nativeChannelId: normalizeOptionalString(origin?.nativeChannelId),
		nativeDirectUserId: normalizeOptionalString(origin?.nativeDirectUserId),
		label: normalizeOptionalString(entry.displayName) ?? normalizeOptionalString(entry.label) ?? normalizeOptionalString(entry.subject) ?? normalizeOptionalString(entry.groupId)
	};
}
/** Backfills canonical external addresses once when conversation routing becomes active. */
function backfillSessionConversations(db) {
	if (!readSqliteTableColumns(db, "session_entries") || !readSqliteTableColumns(db, "sessions") || !readSqliteTableColumns(db, "conversations")) return;
	if (!readSqliteTableColumns(db, "session_conversations")) db.exec(`
      CREATE TABLE session_conversations (
        session_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'participant', 'related')),
        route_context_json TEXT,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, conversation_id, role),
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
      );
    `);
	db.exec(`
    UPDATE sessions
    SET primary_conversation_id = NULL
    WHERE primary_conversation_id IN (
      SELECT conversation_id FROM conversations WHERE delivery_target = ''
    );
    DELETE FROM session_conversations
    WHERE conversation_id IN (
      SELECT conversation_id FROM conversations WHERE delivery_target = ''
    );
    DELETE FROM conversations WHERE delivery_target = '';
  `);
	const rows = db.prepare(`
        SELECT
          se.session_id,
          se.entry_json,
          se.session_key,
          se.updated_at,
          s.session_scope,
          CASE WHEN se.session_key = s.session_key THEN s.chat_type END AS persisted_chat_type
        FROM session_entries AS se
        INNER JOIN sessions AS s ON s.session_id = se.session_id
        ORDER BY se.updated_at ASC, se.session_key ASC;
      `).all();
	const upsertConversation = db.prepare(`
    INSERT INTO conversations (
      conversation_id, channel, account_id, kind, peer_id, delivery_target,
      parent_conversation_id, thread_id, native_channel_id,
      native_direct_user_id, label, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      channel = excluded.channel,
      account_id = excluded.account_id,
      kind = excluded.kind,
      peer_id = excluded.peer_id,
      delivery_target = excluded.delivery_target,
      thread_id = excluded.thread_id,
      native_channel_id = excluded.native_channel_id,
      native_direct_user_id = excluded.native_direct_user_id,
      label = excluded.label,
      updated_at = excluded.updated_at;
  `);
	const deleteMatchingRelated = db.prepare(`
    DELETE FROM session_conversations
    WHERE session_id = ? AND conversation_id = ? AND role = 'related';
  `);
	const demotePrimary = db.prepare(`
    UPDATE session_conversations SET role = 'related', last_seen_at = ?
    WHERE session_id = ? AND role = 'primary';
  `);
	const linkConversation = db.prepare(`
    INSERT INTO session_conversations (
      session_id, conversation_id, role, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, conversation_id, role) DO UPDATE SET
      last_seen_at = excluded.last_seen_at;
  `);
	const updatePrimary = db.prepare("UPDATE sessions SET primary_conversation_id = ? WHERE session_id = ?");
	for (const row of rows) {
		const sessionId = normalizeOptionalString(row.session_id);
		const entry = parseConversationEntry(row.entry_json);
		const updatedAt = typeof row.updated_at === "number" ? row.updated_at : Date.now();
		const conversation = entry ? migratedConversation(entry, normalizeOptionalString(row.persisted_chat_type), normalizeOptionalString(row.session_key)) : void 0;
		if (!sessionId || !conversation) continue;
		const role = row.session_scope === "shared-main" && conversation.kind === "direct" ? "participant" : "primary";
		upsertConversation.run(conversation.conversationRef, conversation.channel, conversation.accountId, conversation.kind, conversation.peerId, conversation.deliveryTarget, conversation.threadId ?? null, conversation.nativeChannelId ?? null, conversation.nativeDirectUserId ?? null, conversation.label ?? null, updatedAt, updatedAt);
		if (role === "primary") {
			demotePrimary.run(updatedAt, sessionId);
			deleteMatchingRelated.run(sessionId, conversation.conversationRef);
		}
		linkConversation.run(sessionId, conversation.conversationRef, role, updatedAt, updatedAt);
		if (role === "primary") updatePrimary.run(conversation.conversationRef, sessionId);
	}
}
function readSqliteTableColumns(db, tableName) {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) throw new Error(`invalid SQLite table identifier: ${tableName}`);
	if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)) return null;
	const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
	return new Set(rows.flatMap((row) => typeof row.name === "string" ? [row.name] : []));
}
/** Installs same-version session projections on first updated-binary open. */
function ensureSessionAdditiveColumns(db) {
	ensurePendingInputConsumptionColumn(db);
	if (hasPendingSessionTranscriptContextEligibilityColumn(db)) db.exec("ALTER TABLE session_transcript_active_events ADD COLUMN context_eligible INTEGER;");
	const columns = readSqliteTableColumns(db, "session_nodes");
	if (columns && !columns.has("project_id")) db.exec("ALTER TABLE session_nodes ADD COLUMN project_id TEXT;");
	const conversationColumns = readSqliteTableColumns(db, "session_conversations");
	if (conversationColumns && !conversationColumns.has("route_context_json")) db.exec("ALTER TABLE session_conversations ADD COLUMN route_context_json TEXT");
	if (conversationColumns) db.exec(`
      CREATE TRIGGER IF NOT EXISTS session_conversations_route_context_invalidate_after_update
      AFTER UPDATE OF role, last_seen_at ON session_conversations
      WHEN NEW.route_context_json IS OLD.route_context_json
      BEGIN
        UPDATE session_conversations
        SET route_context_json = NULL
        WHERE session_id = NEW.session_id
          AND conversation_id = NEW.conversation_id
          AND role = NEW.role;
      END;
    `);
}
function hasPendingSessionConversationRouteContextColumn(db) {
	const columns = readSqliteTableColumns(db, "session_conversations");
	return Boolean(columns && !columns.has("route_context_json"));
}
function hasPendingSessionTranscriptContextEligibilityColumn(db) {
	const columns = readSqliteTableColumns(db, "session_transcript_active_events");
	return Boolean(columns && !columns.has("context_eligible"));
}
/** Adds the v11 exact delivery target before the conversation backfill writes canonical rows. */
function migrateConversationDeliveryTargetColumn(db) {
	const columns = readSqliteTableColumns(db, "conversations");
	if (!columns || columns.has("delivery_target")) return;
	db.exec("ALTER TABLE conversations ADD COLUMN delivery_target TEXT NOT NULL DEFAULT '';");
}
/** Adds the validity projection and settles only rows left pending by older writers. */
function ensureSessionEntryValidityProjection(db) {
	const columns = readSqliteTableColumns(db, "session_nodes");
	if (!columns) return;
	if (!columns.has("entry_valid")) db.exec("ALTER TABLE session_nodes ADD COLUMN entry_valid INTEGER NOT NULL DEFAULT 0 CHECK (entry_valid IN (-1, 0, 1))");
	db.exec(`
    CREATE TRIGGER IF NOT EXISTS session_nodes_entry_valid_after_insert
    AFTER INSERT ON session_nodes
    BEGIN
      UPDATE session_nodes SET entry_valid = 0 WHERE session_key = NEW.session_key;
    END;
    CREATE TRIGGER IF NOT EXISTS session_nodes_entry_valid_after_entry_update
    AFTER UPDATE OF entry_json ON session_nodes
    BEGIN
      UPDATE session_nodes SET entry_valid = 0 WHERE session_key = NEW.session_key;
    END;
    CREATE TRIGGER IF NOT EXISTS session_nodes_entry_valid_after_identity_update
    AFTER UPDATE OF current_session_id, updated_at ON session_nodes
    BEGIN
      UPDATE session_nodes SET entry_valid = 0 WHERE session_key = NEW.session_key;
    END;
  `);
	const selectPending = db.prepare("SELECT current_session_id, entry_json, session_key, updated_at FROM session_nodes WHERE entry_valid = 0 ORDER BY session_key LIMIT 256");
	const update = db.prepare("UPDATE session_nodes SET entry_valid = ? WHERE session_key = ?");
	while (true) {
		const rows = selectPending.all();
		if (rows.length === 0) break;
		for (const row of rows) update.run(parseSqliteSessionEntryRecord(row) ? 1 : -1, row.session_key);
	}
}
function migrateSessionEntryStatusProjection(db, readStatus) {
	const columns = readSqliteTableColumns(db, "session_entries");
	if (!columns) return;
	if (!columns.has("status")) db.exec("ALTER TABLE session_entries ADD COLUMN status TEXT CHECK (status IS NULL OR status IN ('running', 'done', 'failed', 'killed', 'timeout'));");
	const rows = db.prepare("SELECT session_key, entry_json FROM session_entries").all();
	const update = db.prepare("UPDATE session_entries SET status = ? WHERE session_key = ?");
	for (const row of rows) if (typeof row.session_key === "string") update.run(readStatus(row.entry_json), row.session_key);
}
function migrateSessionCreatorNamespaces(db, previousVersion) {
	if (previousVersion >= 19 || !tableExists(db, "session_nodes")) return;
	const update = db.prepare("UPDATE session_nodes SET entry_json = ?, created_actor_type = ?, created_actor_id = ? WHERE session_key = ?");
	const rows = db.prepare(`SELECT session_key, entry_json FROM session_nodes
    WHERE json_valid(entry_json) AND (json_extract(entry_json, '$.createdActor.type') = 'human'
      OR (json_type(entry_json, '$.createdActor') IS NULL AND json_type(entry_json, '$.createdBy') = 'object'))`);
	for (const row of rows.all()) {
		const entry = migrateLegacySessionCreator(JSON.parse(row.entry_json));
		update.run(JSON.stringify(entry), entry.createdActor?.type ?? null, entry.createdActor?.id ?? null, row.session_key);
	}
}
//#endregion
//#region src/state/openclaw-agent-goal-operations-schema.ts
const SESSION_GOAL_OPERATIONS_TABLE = "session_goal_operations";
const ensuredDatabases$1 = /* @__PURE__ */ new WeakSet();
/** First typed Goal use installs the additive receipt table, without a version bump. */
function ensureSessionGoalOperationsSchema(db) {
	if (ensuredDatabases$1.has(db)) return;
	const start = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(`CREATE TABLE IF NOT EXISTS ${SESSION_GOAL_OPERATIONS_TABLE} (`);
	const end = OPENCLAW_AGENT_SCHEMA_SQL.indexOf("CREATE TABLE IF NOT EXISTS transcript_events (", start);
	if (start < 0 || end < 0) throw new Error("OpenClaw Goal operation schema markers are missing.");
	runSqliteImmediateTransactionSync(db, () => {
		db.exec(OPENCLAW_AGENT_SCHEMA_SQL.slice(start, end));
	});
	ensuredDatabases$1.add(db);
}
//#endregion
//#region src/state/openclaw-agent-message-tool-outcome-schema.ts
const MESSAGE_TOOL_RUN_OUTCOMES_TABLE = "message_tool_run_outcomes";
const SCHEMA_START$1 = `CREATE TABLE IF NOT EXISTS ${MESSAGE_TOOL_RUN_OUTCOMES_TABLE} (`;
const SCHEMA_END$1 = "CREATE TABLE IF NOT EXISTS session_goal_operations (";
const ENSURED_DATABASES$1 = /* @__PURE__ */ new WeakSet();
function messageToolRunOutcomeSchemaSql() {
	const start = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(SCHEMA_START$1);
	const end = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(SCHEMA_END$1, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw message-tool run outcome schema markers are missing.");
	return OPENCLAW_AGENT_SCHEMA_SQL.slice(start, end);
}
/** Lazily installs the additive outcome table on first use. */
function ensureMessageToolRunOutcomeSchema(db) {
	if (ENSURED_DATABASES$1.has(db)) return;
	runSqliteImmediateTransactionSync(db, () => {
		db.exec(messageToolRunOutcomeSchemaSql());
	});
	ENSURED_DATABASES$1.add(db);
}
//#endregion
//#region src/state/openclaw-agent-session-participants-schema.ts
const SESSION_PARTICIPANTS_TABLE = "session_participants";
const SCHEMA_START = `CREATE TABLE IF NOT EXISTS ${SESSION_PARTICIPANTS_TABLE} (`;
const SCHEMA_END = "CREATE TABLE IF NOT EXISTS session_key_contract (";
const ensuredDatabases = /* @__PURE__ */ new WeakSet();
function sessionParticipantsSchemaSql() {
	const start = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(SCHEMA_START);
	const end = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw session participant schema markers are missing.");
	return OPENCLAW_AGENT_SCHEMA_SQL.slice(start, end);
}
/** Lazily installs the additive participant table on the first admitted prompt. */
function ensureSessionParticipantsSchema(database) {
	if (ensuredDatabases.has(database)) return false;
	const ensure = () => {
		database.exec(sessionParticipantsSchemaSql());
	};
	if (database.isTransaction) {
		ensure();
		return true;
	}
	runSqliteImmediateTransactionSync(database, ensure);
	ensuredDatabases.add(database);
	return false;
}
/** Cache a first-use ensure only after its owning transaction commits. */
function confirmSessionParticipantsSchemaEnsured(database) {
	ensuredDatabases.add(database);
}
//#endregion
//#region src/state/openclaw-agent-participants-migration.ts
const LEGACY_PARTICIPANTS_SCHEMA = `CREATE TABLE IF NOT EXISTS session_participants (
  session_key TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_source TEXT,
  contribution_count INTEGER,
  first_prompted_at INTEGER NOT NULL,
  last_prompted_at INTEGER NOT NULL,
  PRIMARY KEY (session_key, actor_type, actor_id),
  FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE
) STRICT;`;
const MIGRATION_TABLE = "session_participants_identity_migration";
const LEGACY_PARTICIPANT_OPTIONAL_COLUMNS = ["session_participants.actor_source", "session_participants.contribution_count"];
/** Historical structural/media validation must not require a future identity key. */
function withLegacySessionParticipantsSchema(sql) {
	return sql.replace(sessionParticipantsSchemaSql().trim(), LEGACY_PARTICIPANTS_SCHEMA);
}
function migrateSessionParticipantsSchema(database, pathname) {
	if (!tableExists(database, "session_participants")) return;
	assertSqliteSchemaContains(database, pathname, LEGACY_PARTICIPANTS_SCHEMA, { allowedMissingColumns: LEGACY_PARTICIPANT_OPTIONAL_COLUMNS });
	if (tableExists(database, MIGRATION_TABLE)) throw new Error(`Participant migration table already exists: ${MIGRATION_TABLE}`);
	if (database.prepare(`SELECT name FROM sqlite_schema
    WHERE (type IN ('trigger', 'index') AND tbl_name = 'session_participants' AND sql IS NOT NULL)
       OR (type IN ('view', 'trigger') AND sql LIKE '%session_participants%')`).all().length > 0) throw new Error("Participant migration cannot rebuild unknown indexes, views, or triggers.");
	for (const table of database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()) if (database.prepare(`PRAGMA foreign_key_list("${String(table.name).replaceAll("\"", "\"\"")}")`).all().some((key) => key.table === "session_participants")) throw new Error("Participant migration cannot rebuild a table referenced by an unknown foreign key.");
	const source = tableHasColumn(database, "session_participants", "actor_source") ? "actor_source" : "NULL";
	const count = tableHasColumn(database, "session_participants", "contribution_count") ? "coalesce(contribution_count, 1)" : "1";
	const knownAgent = `actor_type = 'agent' AND ${source} = 'agent' AND actor_id <> ''`;
	const knownObservation = `(${knownAgent}) OR (actor_type = 'human' AND ${source} = 'channel')`;
	database.exec(`
    ${sessionParticipantsSchemaSql().replace("IF NOT EXISTS session_participants", MIGRATION_TABLE)}
    INSERT INTO ${MIGRATION_TABLE}
      (session_key, identity_namespace, actor_id, contribution_count, first_prompted_at, last_prompted_at)
    SELECT session_key,
      CASE
        WHEN actor_type = 'human' AND ${source} = 'profile' AND actor_id <> '' THEN json_object('type', 'profile')
        WHEN ${knownAgent} THEN json_object('type', 'agent')
        ELSE json_object('type', 'legacy', 'actorType', actor_type, 'source', ${source})
      END,
      actor_id, ${count},
      CASE WHEN ${knownObservation} THEN first_prompted_at ELSE NULL END,
      CASE WHEN ${knownObservation} THEN last_prompted_at ELSE NULL END
    FROM session_participants;
    DROP TABLE session_participants;
    ALTER TABLE ${MIGRATION_TABLE} RENAME TO session_participants;
  `);
}
//#endregion
//#region src/state/openclaw-agent-progress-card-schema.ts
const SESSION_PROGRESS_CARDS_TABLE = "session_progress_cards";
const PROGRESS_CARD_SCHEMA_START = `CREATE TABLE IF NOT EXISTS ${SESSION_PROGRESS_CARDS_TABLE} (`;
const PROGRESS_CARD_SCHEMA_END = "CREATE TABLE IF NOT EXISTS heartbeat_outcomes (";
function splitProgressCardSchema(sql) {
	const start = sql.indexOf(PROGRESS_CARD_SCHEMA_START);
	const end = sql.indexOf(PROGRESS_CARD_SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw agent progress-card schema markers are missing.");
	return {
		progressCard: sql.slice(start, end),
		withoutProgressCard: `${sql.slice(0, start)}${sql.slice(end)}`
	};
}
const progressCardSchema = splitProgressCardSchema(OPENCLAW_AGENT_SCHEMA_WITHOUT_BOARD_SQL);
const AGENT_PROGRESS_CARD_SCHEMA_SQL = progressCardSchema.progressCard;
const AGENT_SCHEMA_WITHOUT_PROGRESS_CARD_SQL = progressCardSchema.withoutProgressCard;
/** Ensure the additive progress-card table inside the caller's write transaction. */
function ensureOpenClawAgentProgressCardSchemaInTransaction(db) {
	if (!db.isTransaction) throw new Error("progress-card schema ensure requires an active transaction");
	db.exec(AGENT_PROGRESS_CARD_SCHEMA_SQL);
}
//#endregion
//#region src/state/openclaw-agent-session-sharing-schema.ts
const SHARING_SCHEMA_START = "CREATE TABLE IF NOT EXISTS session_members (";
const SHARING_SCHEMA_END = "CREATE TABLE IF NOT EXISTS heartbeat_outcomes (";
const SUGGESTIONS_SCHEMA_START = "CREATE TABLE IF NOT EXISTS session_suggestions (";
function splitSessionSharingSchema(sql) {
	const start = sql.indexOf(SHARING_SCHEMA_START);
	const end = sql.indexOf(SHARING_SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw agent session-sharing schema markers are missing.");
	return {
		sharing: sql.slice(start, end),
		withoutSharing: `${sql.slice(0, start)}${sql.slice(end)}`
	};
}
const sessionSharingSchema = splitSessionSharingSchema(AGENT_SCHEMA_WITHOUT_PROGRESS_CARD_SQL);
const sessionSuggestionsStart = sessionSharingSchema.sharing.indexOf(SUGGESTIONS_SCHEMA_START);
if (sessionSuggestionsStart === -1) throw new Error("OpenClaw agent session-suggestions schema marker is missing.");
const AGENT_V14_SESSION_SHARING_SCHEMA_SQL = sessionSharingSchema.sharing.slice(0, sessionSuggestionsStart);
const AGENT_V14_ADDITIVE_SCHEMA_SQL = sessionSharingSchema.sharing.slice(sessionSuggestionsStart);
const AGENT_V14_CORE_SCHEMA_SQL = withLegacySessionParticipantsSchema(sessionSharingSchema.withoutSharing);
//#endregion
//#region src/state/openclaw-agent-session-transcript-archive-schema.ts
const SESSION_TRANSCRIPT_ARCHIVES_TABLE = "session_transcript_archives";
const ARCHIVE_SCHEMA_START = `CREATE TABLE IF NOT EXISTS ${SESSION_TRANSCRIPT_ARCHIVES_TABLE} (`;
const ARCHIVE_SCHEMA_END = "CREATE TABLE IF NOT EXISTS transcript_rewrite_watermarks (";
const ENSURED_DATABASES = /* @__PURE__ */ new WeakSet();
function sessionTranscriptArchiveSchemaSql() {
	const start = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(ARCHIVE_SCHEMA_START);
	const end = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(ARCHIVE_SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw session transcript archive schema markers are missing.");
	return OPENCLAW_AGENT_SCHEMA_SQL.slice(start, end);
}
/** Lazily installs the additive canonical archive owner on first archive use. */
function ensureSessionTranscriptArchiveSchema(db) {
	if (ENSURED_DATABASES.has(db)) return;
	const ensure = () => {
		db.exec(sessionTranscriptArchiveSchemaSql());
	};
	if (db.isTransaction) {
		ensure();
		return;
	}
	runSqliteImmediateTransactionSync(db, ensure);
	ENSURED_DATABASES.add(db);
}
//#endregion
//#region src/state/openclaw-agent-standing-intents-schema.ts
const STANDING_INTENTS_TABLE = "standing_intents";
const STANDING_INTENTS_FTS_TABLE = "standing_intents_fts";
const STANDING_INTENTS_FTS_SHADOW_TABLES = [
	"standing_intents_fts_config",
	"standing_intents_fts_data",
	"standing_intents_fts_docsize",
	"standing_intents_fts_idx"
];
const STANDING_INTENTS_SCHEMA_START = "CREATE TABLE IF NOT EXISTS standing_intents (";
const STANDING_INTENTS_SCHEMA_END = "CREATE TABLE IF NOT EXISTS session_transcript_index_state (";
function standingIntentsSchemaSql() {
	const start = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(STANDING_INTENTS_SCHEMA_START);
	const end = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(STANDING_INTENTS_SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw standing-intents schema markers are missing.");
	return OPENCLAW_AGENT_SCHEMA_SQL.slice(start, end);
}
function ensureStandingIntentCreatorColumn(db) {
	if (db.prepare("PRAGMA table_info(standing_intents)").all().some((column) => column.name === "creator_sender")) return;
	db.exec("ALTER TABLE standing_intents ADD COLUMN creator_sender TEXT CHECK (creator_sender IS NULL OR length(trim(creator_sender)) > 0)");
}
/** Lazily add the canonical standing-intents tables on first feature use. */
function ensureOpenClawAgentStandingIntentsSchema(db) {
	const ensure = () => {
		db.exec(standingIntentsSchemaSql());
		ensureStandingIntentCreatorColumn(db);
	};
	if (db.isTransaction) {
		ensure();
		return;
	}
	runSqliteImmediateTransactionSync(db, ensure);
}
//#endregion
//#region src/state/openclaw-agent-db-schema-helpers.ts
function migratedSessionColumn(columns, columnName, fallback) {
	return columns.has(columnName) ? columnName : fallback;
}
const AGENT_SCHEMA_COMPATIBILITY = {
	allowCompatibleAdditiveColumns: true,
	allowedMissingTables: [
		"memory_entry_origins",
		"memory_session_tombstones",
		MEMORY_INDEX_CHUNK_PROVENANCE_TABLE,
		MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE,
		CONTEXT_ENGINE_TURN_OUTBOX_TABLE,
		MESSAGE_TOOL_RUN_OUTCOMES_TABLE,
		SESSION_GOAL_OPERATIONS_TABLE,
		SESSION_PENDING_INPUTS_TABLE,
		SESSION_PARTICIPANTS_TABLE,
		SESSION_PROGRESS_CARDS_TABLE,
		SESSION_TRANSCRIPT_ARCHIVES_TABLE,
		STANDING_INTENTS_TABLE,
		STANDING_INTENTS_FTS_TABLE,
		...STANDING_INTENTS_FTS_SHADOW_TABLES
	],
	allowedMissingColumns: [
		"session_pending_inputs.consumed_event_id",
		"session_transcript_active_events.context_eligible",
		"session_conversations.route_context_json",
		"standing_intents.creator_sender",
		...FIRST_USE_ADDITIVE_AGENT_COLUMN_DEFINITIONS.map(({ columnName, tableName }) => `${tableName}.${columnName}`)
	],
	allowedColumnDefinitions: { "conversations.delivery_target": ["delivery_target TEXT NOT NULL DEFAULT ''"] },
	allowedMissingIndexes: ["idx_agent_transcript_context_pending"],
	optionalCanonicalTriggerGroups: [{
		tableName: MEMORY_INDEX_SOURCES_TABLE,
		triggers: MEMORY_PATH_FTS_TRIGGER_DEFINITIONS
	}]
};
function hasRetiredAgentStateLeaseSchema(database) {
	return Boolean(database.prepare("SELECT 1 FROM main.sqlite_schema WHERE name = 'state_leases'").get());
}
function assertOpenClawAgentSchemaContains(database, pathname, schemaSql, participantSchema = "current") {
	assertSqliteSchemaContains(database, pathname, schemaSql, {
		...AGENT_SCHEMA_COMPATIBILITY,
		allowedMissingColumns: [...AGENT_SCHEMA_COMPATIBILITY.allowedMissingColumns, ...participantSchema === "legacy" ? LEGACY_PARTICIPANT_OPTIONAL_COLUMNS : []]
	});
}
function assertOpenClawAgentCurrentRuntimeSchema(database, options) {
	const agentId = normalizeAgentId(options.agentId);
	const metadata = readExistingAgentSchemaMeta(database);
	if (!metadata) throw new Error(`OpenClaw agent database ${options.pathname} has no schema ownership metadata.`);
	assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
	if (metadata.schemaVersion !== 19) throw new Error(`OpenClaw agent database ${options.pathname} metadata schema version ${metadata.schemaVersion ?? "invalid"} does not match 19; run openclaw doctor --fix before using it.`);
	if (hasRetiredAgentStateLeaseSchema(database)) throw new Error(`OpenClaw agent database ${options.pathname} retains retired state_leases storage; run openclaw doctor --fix before using it.`);
	assertOpenClawAgentSchemaContains(database, options.pathname, OPENCLAW_AGENT_SCHEMA_SQL);
}
function hasAnyCanonicalTable(database, schemaSql) {
	const tableNames = getCanonicalSqliteTableNames(schemaSql);
	const placeholders = tableNames.map(() => "?").join(", ");
	return Boolean(database.prepare(`SELECT 1 FROM main.sqlite_schema
         WHERE type = 'table' AND name IN (${placeholders})
         LIMIT 1`).get(...tableNames));
}
function repairAndAssertAgentSchemaGroup(database, pathname, schemaSql) {
	repairCanonicalSqliteIndexes(database, pathname, schemaSql, { verifyPhysicalIntegrity: false });
	assertOpenClawAgentSchemaContains(database, pathname, schemaSql, "legacy");
}
const SESSION_KEY_CONTRACT_SCHEMA_START = "CREATE TABLE IF NOT EXISTS session_key_contract (";
const SESSION_KEY_CONTRACT_SCHEMA_END = "CREATE TABLE IF NOT EXISTS session_windows (";
/** Ensure the additive session-key contract table inside the caller's transaction. */
function ensureSessionKeyContractSchemaInTransaction(db) {
	const start = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(SESSION_KEY_CONTRACT_SCHEMA_START);
	const end = OPENCLAW_AGENT_SCHEMA_SQL.indexOf(SESSION_KEY_CONTRACT_SCHEMA_END, start);
	if (start === -1 || end === -1) throw new Error("OpenClaw agent session-key contract schema markers are missing.");
	db.exec(OPENCLAW_AGENT_SCHEMA_SQL.slice(start, end));
}
function repairAndAssertOpenClawAgentV14SchemaForMigration(database, options) {
	const userVersion = readSqliteUserVersion(database);
	if (userVersion !== 14) throw new Error(`OpenClaw agent database ${options.pathname} uses schema version ${userVersion}; expected 14 before migrating it.`);
	const agentId = normalizeAgentId(options.agentId);
	const metadata = readExistingAgentSchemaMeta(database);
	if (!metadata) throw new Error(`OpenClaw agent database ${options.pathname} has no schema ownership metadata.`);
	assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
	if (metadata.schemaVersion !== 14) throw new Error(`OpenClaw agent database ${options.pathname} metadata schema version ${metadata.schemaVersion ?? "invalid"} does not match 14; repair the ownership metadata before migrating it.`);
	ensureSessionAdditiveColumns(database);
	ensureSessionEntryValidityProjection(database);
	ensureSessionKeyContractSchemaInTransaction(database);
	repairAndAssertAgentSchemaGroup(database, options.pathname, AGENT_V14_CORE_SCHEMA_SQL);
	if (hasAnyCanonicalTable(database, AGENT_V14_SESSION_SHARING_SCHEMA_SQL)) repairAndAssertAgentSchemaGroup(database, options.pathname, AGENT_V14_SESSION_SHARING_SCHEMA_SQL);
	if (hasAnyCanonicalTable(database, AGENT_V14_ADDITIVE_SCHEMA_SQL)) repairAndAssertAgentSchemaGroup(database, options.pathname, AGENT_V14_ADDITIVE_SCHEMA_SQL);
	if (hasAnyCanonicalTable(database, AGENT_V14_BOARD_SCHEMA_SQL)) {
		assertSqliteSchemaTablesPresent(database, options.pathname, AGENT_V14_BOARD_SCHEMA_SQL);
		ensureOpenClawAgentBoardSchemaInTransaction(database);
		repairAndAssertAgentSchemaGroup(database, options.pathname, AGENT_V14_BOARD_SCHEMA_SQL);
	}
	if (hasAnyCanonicalTable(database, AGENT_PROGRESS_CARD_SCHEMA_SQL)) {
		assertSqliteSchemaTablesPresent(database, options.pathname, AGENT_PROGRESS_CARD_SCHEMA_SQL);
		ensureOpenClawAgentProgressCardSchemaInTransaction(database);
		repairAndAssertAgentSchemaGroup(database, options.pathname, AGENT_PROGRESS_CARD_SCHEMA_SQL);
	}
}
function assertSupportedAgentSchemaVersion(db, pathname) {
	const userVersion = readSqliteUserVersion(db);
	if (userVersion > 19) throw createNewerSqliteSchemaVersionError("OpenClaw agent database", pathname, userVersion, 19);
	return userVersion;
}
/** Readers may pass their immediate check; writers reread the version after integrity work. */
function assertCanonicalAgentPersistenceVersion(db, pathname, userVersion = readSqliteUserVersion(db)) {
	const hasApplicationSchema = userVersion === 0 && db.prepare("SELECT 1 FROM sqlite_master WHERE substr(name, 1, 7) <> 'sqlite_' LIMIT 1").get();
	const isNewUnownedDatabase = userVersion === 0 && readExistingAgentSchemaMeta(db) === null && !hasApplicationSchema;
	if (userVersion < 17 && !isNewUnownedDatabase) throw new OpenClawAgentDatabaseMediaMigrationRequiredError(pathname, userVersion);
	if (userVersion < 19 && !isNewUnownedDatabase) throw new Error(`OpenClaw agent database ${pathname} uses schema version ${userVersion}; stop active agents and run openclaw doctor --fix to migrate session identities before using it.`);
}
function readExistingAgentSchemaMeta(db) {
	if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'").get()) return null;
	const row = db.prepare("SELECT role, schema_version, agent_id FROM schema_meta WHERE meta_key = 'primary'").get();
	if (!row) return null;
	return {
		agentId: normalizeNullableString(row.agent_id),
		role: typeof row.role === "string" ? row.role : null,
		schemaVersion: typeof row.schema_version === "number" ? row.schema_version : null
	};
}
function assertExistingAgentSchemaOwner(existing, agentId, pathname) {
	if (!existing) return;
	if (existing.role !== "agent") throw new Error(`OpenClaw agent database ${pathname} has schema role ${existing.role ?? "unknown"}; expected agent.`);
	if (!existing.agentId) throw new Error(`OpenClaw agent database ${pathname} has no agent owner.`);
	if (normalizeAgentId(existing.agentId) !== agentId) throw new Error(`OpenClaw agent database ${pathname} belongs to agent ${existing.agentId}; requested agent ${agentId}.`);
}
const RETIRED_AGENT_STATE_LEASE_SCHEMA_SQL = `
CREATE TABLE state_leases (
  scope TEXT NOT NULL,
  lease_key TEXT NOT NULL,
  owner TEXT NOT NULL,
  expires_at INTEGER,
  heartbeat_at INTEGER,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, lease_key)
) STRICT;
`;
function migrateRetiredAgentStateLeaseSchema(db, pathname, targetVersion) {
	if (targetVersion < 17 || !hasRetiredAgentStateLeaseSchema(db)) return;
	assertSqliteSchemaContains(db, pathname, RETIRED_AGENT_STATE_LEASE_SCHEMA_SQL);
	db.exec("DROP TABLE state_leases;");
}
function assertAgentSchemaVersion(db, options, schemaSql) {
	const metadata = readExistingAgentSchemaMeta(db);
	assertExistingAgentSchemaOwner(metadata, options.agentId, options.pathname);
	if (readSqliteUserVersion(db) !== options.version || metadata?.schemaVersion !== options.version) throw new Error(`OpenClaw agent database ${options.pathname} did not converge on schema version ${options.version}.`);
	assertOpenClawAgentSchemaContains(db, options.pathname, schemaSql, options.version < 18 ? "legacy" : "current");
}
function hasLegacyMemoryChunkProvenanceTrigger(db) {
	return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = 'memory_index_chunk_provenance_after_insert'").get());
}
function hasPendingMemoryChunkMetadataMigration(db) {
	return hasLegacyMemoryRecallMetadataColumns(db) || hasLegacyMemoryChunkProvenanceTrigger(db);
}
//#endregion
//#region src/state/openclaw-agent-db-session-nodes-migration.ts
const SESSION_NODE_SCHEMA_VERSION = 14;
function migratedColumn(columns, columnName, fallback) {
	return columns.has(columnName) ? columnName : fallback;
}
function jsonText(path) {
	return `CASE
    WHEN json_valid(entry_json) AND json_type(entry_json, '${path}') = 'text'
    THEN NULLIF(trim(CAST(json_extract(entry_json, '${path}') AS TEXT)), '')
    ELSE NULL
  END`;
}
function jsonNumber(path) {
	return `CASE
    WHEN json_valid(entry_json) AND json_type(entry_json, '${path}') IN ('integer', 'real')
    THEN CAST(json_extract(entry_json, '${path}') AS INTEGER)
    ELSE NULL
  END`;
}
function createSessionNodes(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS session_nodes (
      session_key TEXT NOT NULL PRIMARY KEY,
      current_session_id TEXT NOT NULL,
      entry_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      status TEXT CHECK (status IS NULL OR status IN ('running', 'done', 'failed', 'killed', 'timeout')),
      created_at INTEGER,
      created_via TEXT CHECK (created_via IS NULL OR created_via IN ('operator', 'spawn', 'channel', 'cron', 'talk', 'run', 'plugin', 'internal')),
      created_actor_type TEXT CHECK (created_actor_type IS NULL OR created_actor_type IN ('human', 'agent', 'system')),
      created_actor_id TEXT,
      parent_session_key TEXT,
      spawned_by TEXT,
      fork_source_session_key TEXT,
      fork_source_session_id TEXT,
      fork_source_entry_id TEXT,
      label TEXT,
      display_name TEXT,
      category TEXT,
      icon TEXT,
      pinned_at INTEGER,
      archived_at INTEGER,
      last_read_at INTEGER,
      last_interaction_at INTEGER,
      last_activity_at INTEGER
    ) STRICT;
  `);
}
function backfillSessionNodes(db) {
	const entryColumns = readSqliteTableColumns(db, "session_entries");
	if (entryColumns) {
		const status = migratedColumn(entryColumns, "status", "NULL");
		db.exec(`
      INSERT OR REPLACE INTO session_nodes (
        session_key, current_session_id, entry_json, updated_at, status,
        created_at, created_via, created_actor_type, created_actor_id,
        parent_session_key, spawned_by, fork_source_session_key,
        fork_source_session_id, fork_source_entry_id, label, display_name,
        category, icon, pinned_at, archived_at, last_read_at,
        last_interaction_at, last_activity_at
      )
      SELECT
        session_key,
        session_id,
        entry_json,
        updated_at,
        ${status},
        ${jsonNumber("$.createdAt")},
        CASE
          WHEN json_valid(entry_json)
            AND json_extract(entry_json, '$.createdVia') IN
              ('operator', 'spawn', 'channel', 'cron', 'talk', 'run', 'plugin', 'internal')
          THEN json_extract(entry_json, '$.createdVia')
          ELSE NULL
        END,
        CASE
          WHEN json_valid(entry_json)
            AND json_extract(entry_json, '$.createdActor.type') IN ('human', 'agent', 'system')
          THEN json_extract(entry_json, '$.createdActor.type')
          WHEN ${jsonText("$.createdBy.id")} IS NOT NULL THEN 'human'
          ELSE NULL
        END,
        COALESCE(${jsonText("$.createdActor.id")}, ${jsonText("$.createdBy.id")}),
        COALESCE(${jsonText("$.parentSessionKey")}, ${jsonText("$.spawnedBy")}),
        ${jsonText("$.spawnedBy")},
        ${jsonText("$.forkSource.sessionKey")},
        ${jsonText("$.forkSource.sessionId")},
        ${jsonText("$.forkSource.entryId")},
        ${jsonText("$.label")},
        ${jsonText("$.displayName")},
        ${jsonText("$.category")},
        NULL,
        ${jsonNumber("$.pinnedAt")},
        ${jsonNumber("$.archivedAt")},
        ${jsonNumber("$.lastReadAt")},
        ${jsonNumber("$.lastInteractionAt")},
        ${jsonNumber("$.lastActivityAt")}
      FROM session_entries;
    `);
	}
	if (readSqliteTableColumns(db, "session_routes")) db.exec(`
      INSERT OR IGNORE INTO session_nodes (
        session_key, current_session_id, entry_json, updated_at
      )
      SELECT session_key, session_id, '{}', updated_at
      FROM session_routes;
    `);
	db.exec(`
    INSERT OR IGNORE INTO session_nodes (
      session_key, current_session_id, entry_json, updated_at
    )
    SELECT session_key, session_id, '{}', updated_at
    FROM sessions;
  `);
}
function migrateSessionWindows(db) {
	const columns = readSqliteTableColumns(db, "sessions");
	if (!columns) return;
	const entryColumns = readSqliteTableColumns(db, "session_entries");
	const routeColumns = readSqliteTableColumns(db, "session_routes");
	const entryOwner = entryColumns ? `(SELECT se.session_key
        FROM session_entries AS se
        INNER JOIN session_windows AS owner_window ON owner_window.session_id = se.session_id
        WHERE se.session_id = session_windows.session_id
        ORDER BY CASE WHEN se.session_key = owner_window.session_key THEN 0 ELSE 1 END,
                 se.updated_at DESC,
                 se.session_key ASC
        LIMIT 1)` : "NULL";
	const routeOwner = routeColumns ? `(SELECT sr.session_key
        FROM session_routes AS sr
        INNER JOIN session_windows AS owner_window ON owner_window.session_id = sr.session_id
        WHERE sr.session_id = session_windows.session_id
        ORDER BY CASE WHEN sr.session_key = owner_window.session_key THEN 0 ELSE 1 END,
                 sr.updated_at DESC,
                 sr.session_key ASC
        LIMIT 1)` : "NULL";
	const currentEntryJson = entryColumns ? `(SELECT se.entry_json
        FROM session_entries AS se
        INNER JOIN session_windows AS owner_window ON owner_window.session_id = se.session_id
        WHERE se.session_id = session_windows.session_id
        ORDER BY CASE WHEN se.session_key = owner_window.session_key THEN 0 ELSE 1 END,
                 se.updated_at DESC,
                 se.session_key ASC
        LIMIT 1)` : "NULL";
	db.exec("ALTER TABLE sessions RENAME TO session_windows;");
	db.exec(`
    DROP TABLE IF EXISTS session_windows_new;
    CREATE TABLE session_windows_new (
      session_id TEXT NOT NULL PRIMARY KEY,
      session_key TEXT NOT NULL,
      previous_session_id TEXT,
      reason TEXT CHECK (reason IS NULL OR reason IN ('initial', 'reset', 'rollover', 'fork', 'rewind', 'switch', 'recovery', 'compaction')),
      session_scope TEXT NOT NULL DEFAULT 'conversation' CHECK (session_scope IN ('conversation', 'shared-main', 'group', 'channel')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      transcript_updated_at INTEGER DEFAULT NULL,
      transcript_observed_at INTEGER DEFAULT NULL,
      session_entry_provenance INTEGER NOT NULL DEFAULT 0 CHECK (session_entry_provenance IN (0, 1)),
      acp_owned INTEGER NOT NULL DEFAULT 0 CHECK (acp_owned IN (0, 1)),
      plugin_owner_id TEXT,
      hook_external_content_source TEXT CHECK (hook_external_content_source IS NULL OR hook_external_content_source IN ('gmail', 'webhook')),
      started_at INTEGER,
      ended_at INTEGER,
      status TEXT CHECK (status IS NULL OR status IN ('running', 'done', 'failed', 'killed', 'timeout')),
      chat_type TEXT CHECK (chat_type IS NULL OR chat_type IN ('direct', 'group', 'channel')),
      channel TEXT,
      account_id TEXT,
      primary_conversation_id TEXT,
      model_provider TEXT,
      model TEXT,
      agent_harness_id TEXT,
      parent_session_key TEXT,
      spawned_by TEXT,
      display_name TEXT,
      FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE,
      FOREIGN KEY (primary_conversation_id) REFERENCES conversations(conversation_id) ON DELETE SET NULL
    ) STRICT;
    INSERT INTO session_windows_new (
      session_id, session_key, previous_session_id, reason, session_scope,
      created_at, updated_at, transcript_updated_at, transcript_observed_at,
      session_entry_provenance, acp_owned, plugin_owner_id,
      hook_external_content_source, started_at, ended_at, status, chat_type,
      channel, account_id, primary_conversation_id, model_provider, model,
      agent_harness_id, parent_session_key, spawned_by, display_name
    )
    SELECT
      session_id,
      COALESCE(${entryOwner}, ${routeOwner}, session_key),
      CASE
        WHEN json_valid(${currentEntryJson})
        THEN NULLIF(trim(CAST(json_extract(${currentEntryJson}, '$.previousSessionId') AS TEXT)), '')
        ELSE NULL
      END,
      NULL,
      ${migratedColumn(columns, "session_scope", "'conversation'")},
      created_at,
      updated_at,
      ${migratedColumn(columns, "transcript_updated_at", "NULL")},
      ${migratedColumn(columns, "transcript_observed_at", "NULL")},
      ${migratedColumn(columns, "session_entry_provenance", "0")},
      ${migratedColumn(columns, "acp_owned", "0")},
      ${migratedColumn(columns, "plugin_owner_id", "NULL")},
      ${migratedColumn(columns, "hook_external_content_source", "NULL")},
      ${migratedColumn(columns, "started_at", "NULL")},
      ${migratedColumn(columns, "ended_at", "NULL")},
      ${migratedColumn(columns, "status", "NULL")},
      ${migratedColumn(columns, "chat_type", "NULL")},
      ${migratedColumn(columns, "channel", "NULL")},
      ${migratedColumn(columns, "account_id", "NULL")},
      ${migratedColumn(columns, "primary_conversation_id", "NULL")},
      ${migratedColumn(columns, "model_provider", "NULL")},
      ${migratedColumn(columns, "model", "NULL")},
      ${migratedColumn(columns, "agent_harness_id", "NULL")},
      ${migratedColumn(columns, "parent_session_key", "NULL")},
      ${migratedColumn(columns, "spawned_by", "NULL")},
      ${migratedColumn(columns, "display_name", "NULL")}
    FROM session_windows;
    DROP TABLE session_windows;
    ALTER TABLE session_windows_new RENAME TO session_windows;
  `);
}
function renameTranscriptRewriteWatermarks(db) {
	if (readSqliteTableColumns(db, "session_transcript_generations") && !readSqliteTableColumns(db, "transcript_rewrite_watermarks")) db.exec("ALTER TABLE session_transcript_generations RENAME TO transcript_rewrite_watermarks;");
}
function rebuildBoardTabs(db) {
	if (!readSqliteTableColumns(db, "board_tabs")) return;
	if (readSqliteTableColumns(db, "board_widgets")) db.exec(`
      DELETE FROM board_widgets
      WHERE NOT EXISTS (
        SELECT 1 FROM session_nodes WHERE session_nodes.session_key = board_widgets.session_key
      );
    `);
	db.exec(`
    DROP TABLE IF EXISTS board_tabs_new;
    CREATE TABLE board_tabs_new (
      session_key TEXT NOT NULL,
      tab_id TEXT NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position >= 0),
      chat_dock TEXT NOT NULL DEFAULT 'right' CHECK (chat_dock IN ('left', 'right', 'bottom', 'hidden')),
      created_by TEXT NOT NULL CHECK (created_by IN ('user', 'agent')),
      revision INTEGER NOT NULL CHECK (revision >= 0),
      PRIMARY KEY (session_key, tab_id),
      FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE
    ) STRICT;
    INSERT INTO board_tabs_new (
      session_key, tab_id, title, position, chat_dock, created_by, revision
    )
    SELECT b.session_key, b.tab_id, b.title, b.position, b.chat_dock, b.created_by, b.revision
    FROM board_tabs AS b
    INNER JOIN session_nodes AS n ON n.session_key = b.session_key;
    DROP TABLE board_tabs;
    ALTER TABLE board_tabs_new RENAME TO board_tabs;
  `);
}
function rebuildHeartbeatOutcomes(db) {
	const columns = readSqliteTableColumns(db, "heartbeat_outcomes");
	if (!columns) return;
	db.exec(`
    DROP TABLE IF EXISTS heartbeat_outcomes_new;
    CREATE TABLE heartbeat_outcomes_new (
      session_key TEXT NOT NULL PRIMARY KEY,
      run_session_key TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('progress', 'done', 'blocked', 'needs_attention')),
      summary TEXT NOT NULL,
      response_reason TEXT,
      priority TEXT CHECK (priority IS NULL OR priority IN ('low', 'normal', 'high')),
      next_check TEXT,
      task_names_json TEXT,
      wake_source TEXT,
      wake_reason TEXT,
      occurred_at INTEGER NOT NULL,
      context_run_id TEXT,
      context_claimed_at INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE
    ) STRICT;
    INSERT INTO heartbeat_outcomes_new (
      session_key, run_session_key, outcome, summary, response_reason, priority,
      next_check, task_names_json, wake_source, wake_reason, occurred_at,
      context_run_id, context_claimed_at, updated_at
    )
    SELECT
      h.session_key,
      h.run_session_key,
      h.outcome,
      h.summary,
      ${migratedColumn(columns, "response_reason", "NULL")},
      ${migratedColumn(columns, "priority", "NULL")},
      ${migratedColumn(columns, "next_check", "NULL")},
      ${migratedColumn(columns, "task_names_json", "NULL")},
      ${migratedColumn(columns, "wake_source", "NULL")},
      ${migratedColumn(columns, "wake_reason", "NULL")},
      h.occurred_at,
      ${migratedColumn(columns, "context_run_id", "NULL")},
      ${migratedColumn(columns, "context_claimed_at", "NULL")},
      h.updated_at
    FROM heartbeat_outcomes AS h
    INNER JOIN session_nodes AS n ON n.session_key = h.session_key;
    DROP TABLE heartbeat_outcomes;
    ALTER TABLE heartbeat_outcomes_new RENAME TO heartbeat_outcomes;
  `);
}
function rebuildSessionMembers(db) {
	if (!readSqliteTableColumns(db, "session_members")) return;
	db.exec(`
    DROP TABLE IF EXISTS session_members_new;
    CREATE TABLE session_members_new (
      session_key TEXT NOT NULL,
      identity_id TEXT NOT NULL,
      added_by TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (session_key, identity_id),
      FOREIGN KEY (session_key) REFERENCES session_nodes(session_key) ON DELETE CASCADE
    ) STRICT;
    INSERT INTO session_members_new (session_key, identity_id, added_by, added_at)
    SELECT m.session_key, m.identity_id, m.added_by, m.added_at
    FROM session_members AS m
    INNER JOIN session_nodes AS n ON n.session_key = m.session_key;
    DROP TABLE session_members;
    ALTER TABLE session_members_new RENAME TO session_members;
  `);
}
function rebuildTranscriptIndexState(db) {
	const columns = readSqliteTableColumns(db, "session_transcript_index_state");
	if (!columns) return;
	db.exec(`
    DROP TABLE IF EXISTS session_transcript_index_state_new;
    CREATE TABLE session_transcript_index_state_new (
      session_id TEXT NOT NULL PRIMARY KEY,
      indexed_seq INTEGER NOT NULL,
      leaf_event_id TEXT,
      needs_rebuild INTEGER NOT NULL DEFAULT 0,
      active_event_count INTEGER NOT NULL DEFAULT 0,
      active_message_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES session_windows(session_id) ON DELETE CASCADE
    ) STRICT;
    INSERT INTO session_transcript_index_state_new (
      session_id, indexed_seq, leaf_event_id, needs_rebuild,
      active_event_count, active_message_count, updated_at
    )
    SELECT
      i.session_id,
      i.indexed_seq,
      ${migratedColumn(columns, "leaf_event_id", "NULL")},
      ${migratedColumn(columns, "needs_rebuild", "0")},
      ${migratedColumn(columns, "active_event_count", "0")},
      ${migratedColumn(columns, "active_message_count", "0")},
      i.updated_at
    FROM session_transcript_index_state AS i
    INNER JOIN session_windows AS w ON w.session_id = i.session_id;
    DROP TABLE session_transcript_index_state;
    ALTER TABLE session_transcript_index_state_new RENAME TO session_transcript_index_state;
  `);
}
/** Replace split entry/route roots with logical nodes and generation windows. */
function migrateSessionNodesAndWindows(db, previousVersion) {
	if (previousVersion >= SESSION_NODE_SCHEMA_VERSION || !readSqliteTableColumns(db, "sessions")) return;
	createSessionNodes(db);
	backfillSessionNodes(db);
	migrateSessionWindows(db);
	renameTranscriptRewriteWatermarks(db);
	rebuildBoardTabs(db);
	rebuildHeartbeatOutcomes(db);
	rebuildSessionMembers(db);
	rebuildTranscriptIndexState(db);
	db.exec(`
    DROP TABLE IF EXISTS session_routes;
    DROP TABLE IF EXISTS session_entries;
  `);
}
//#endregion
//#region src/state/openclaw-agent-db-session-provenance.ts
function readMigratedEntry(value) {
	if (typeof value === "string") try {
		return asOptionalRecord(JSON.parse(value));
	} catch {
		return;
	}
	return asOptionalRecord(value);
}
function addSessionProvenanceColumns(db, columns) {
	if (columns && !columns.has("session_entry_provenance")) db.exec("ALTER TABLE sessions ADD COLUMN session_entry_provenance INTEGER NOT NULL DEFAULT 0 CHECK (session_entry_provenance IN (0, 1));");
	if (columns && !columns.has("acp_owned")) db.exec("ALTER TABLE sessions ADD COLUMN acp_owned INTEGER NOT NULL DEFAULT 0 CHECK (acp_owned IN (0, 1));");
	if (columns && !columns.has("plugin_owner_id")) db.exec("ALTER TABLE sessions ADD COLUMN plugin_owner_id TEXT;");
	if (columns && !columns.has("hook_external_content_source")) db.exec("ALTER TABLE sessions ADD COLUMN hook_external_content_source TEXT CHECK (hook_external_content_source IS NULL OR hook_external_content_source IN ('gmail', 'webhook'));");
}
function backfillSessionEntryProvenance(db, previousVersion) {
	if (previousVersion >= 8) return;
	const hasSessionEntries = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_entries'").get();
	const hasSessions = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get();
	if (!hasSessionEntries || !hasSessions) return;
	const rows = db.prepare(`SELECT se.session_id, se.entry_json
       FROM session_entries AS se
       INNER JOIN sessions AS s
         ON s.session_id = se.session_id AND s.session_key = se.session_key;`).all();
	const update = db.prepare(`
    UPDATE sessions
    SET session_entry_provenance = 1, acp_owned = ?, plugin_owner_id = ?,
        hook_external_content_source = ?
    WHERE session_id = ?;
  `);
	for (const row of rows) {
		const sessionId = normalizeNullableString(row.session_id);
		const entry = readMigratedEntry(row.entry_json);
		if (!sessionId || !entry) continue;
		const hookSource = normalizeNullableString(entry.hookExternalContentSource);
		update.run(isRecord(entry.acp) ? 1 : 0, normalizeNullableString(entry.pluginOwnerId), hookSource === "gmail" || hookSource === "webhook" ? hookSource : null, sessionId);
	}
}
function backfillTranscriptMutationWatermarks(db) {
	if (db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get("transcript_events")?.ok !== 1) return;
	db.exec(`
    UPDATE sessions
    SET
      transcript_updated_at = COALESCE(
        transcript_updated_at,
        (SELECT MAX(transcript_events.created_at)
         FROM transcript_events
         WHERE transcript_events.session_id = sessions.session_id)
      ),
      transcript_observed_at = COALESCE(transcript_observed_at, updated_at)
    WHERE EXISTS (
      SELECT 1 FROM transcript_events
      WHERE transcript_events.session_id = sessions.session_id
    );
  `);
}
//#endregion
//#region src/state/openclaw-agent-db-schema.ts
const agentDbLog = createSubsystemLogger("state/agent-db");
function dropLegacySessionTranscriptSearchSchema(db) {
	db.exec("DROP TABLE IF EXISTS session_transcript_files;");
	if (db.prepare("PRAGMA table_info(session_transcript_fts)").all().some((row) => row.name === "session_key")) db.exec(`
      DROP TABLE IF EXISTS session_transcript_fts;
      DROP TABLE IF EXISTS session_transcript_index_state;
    `);
}
function dropLegacyMemoryIndexSchema(db) {
	if (!db.prepare("PRAGMA table_info(memory_index_sources)").all().some((row) => row.name === "source_kind")) return;
	db.exec(`
    DROP TABLE IF EXISTS memory_index_chunks_fts;
    DROP TABLE IF EXISTS memory_index_chunks;
    DROP TABLE IF EXISTS memory_index_sources;
  `);
}
function dropLegacyRuntimeJournalSchemas(db) {
	const acpParentStreamColumns = readSqliteTableColumns(db, "acp_parent_stream_events");
	if (acpParentStreamColumns && !acpParentStreamColumns.has("session_id")) db.exec(`
      DROP INDEX IF EXISTS idx_agent_acp_parent_stream_events_created;
      DROP TABLE acp_parent_stream_events;
    `);
	if (readSqliteTableColumns(db, "trajectory_runtime_events")?.has("event_id")) db.exec(`
      DROP INDEX IF EXISTS idx_agent_trajectory_runtime_events_session;
      DROP INDEX IF EXISTS idx_agent_trajectory_runtime_events_run;
      DROP TABLE trajectory_runtime_events;
    `);
}
function hasPendingSessionKeyContractSchemaMigration(db) {
	const sessionNodeColumns = readSqliteTableColumns(db, "session_nodes");
	if (!sessionNodeColumns) return false;
	const hasContractTable = Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'session_key_contract'").get());
	return !sessionNodeColumns.has("entry_valid") || !hasContractTable;
}
function hasPendingSessionProjectColumn(db) {
	const columns = readSqliteTableColumns(db, "session_nodes");
	return Boolean(columns && !columns.has("project_id"));
}
function migrateMemoryChunkMetadataSchema(db) {
	ensureMemoryRecallMetadataSchema(db);
	ensureMemoryChunkProvenance(db);
}
function migrateOpenClawAgentSchema(db) {
	const userVersion = readSqliteUserVersion(db);
	if (userVersion >= 19) return;
	if (userVersion < 7) {
		db.exec("DROP INDEX IF EXISTS idx_agent_sessions_status;");
		migrateSessionEntryStatusProjection(db, (entryJson) => {
			const entry = parseMigratedSessionEntry(entryJson);
			return entry ? migratedStatus(entry.status) : null;
		});
	}
	if (userVersion < 6) db.exec("DROP INDEX IF EXISTS idx_agent_session_entries_session_id;");
	if (userVersion < 3) db.exec("DROP INDEX IF EXISTS idx_agent_transcript_events_session;");
	const columns = readSqliteTableColumns(db, "sessions");
	if (columns && !columns.has("transcript_updated_at")) db.exec("ALTER TABLE sessions ADD COLUMN transcript_updated_at INTEGER DEFAULT NULL;");
	if (columns && !columns.has("transcript_observed_at")) db.exec("ALTER TABLE sessions ADD COLUMN transcript_observed_at INTEGER DEFAULT NULL;");
	addSessionProvenanceColumns(db, columns);
	if (!columns) return;
	if (userVersion > 1) {
		backfillTranscriptMutationWatermarks(db);
		return;
	}
	const copyColumns = [
		"session_id",
		"session_key",
		"session_scope",
		"created_at",
		"updated_at",
		"session_entry_provenance",
		"acp_owned",
		"plugin_owner_id",
		"hook_external_content_source",
		"started_at",
		"ended_at",
		"status",
		"chat_type",
		"channel",
		"account_id",
		"primary_conversation_id",
		"model_provider",
		"model",
		"agent_harness_id",
		"parent_session_key",
		"spawned_by",
		"display_name"
	];
	const selectColumns = [
		"session_id",
		"session_key",
		migratedSessionColumn(columns, "session_scope", "'conversation'"),
		"created_at",
		"updated_at",
		migratedSessionColumn(columns, "session_entry_provenance", "0"),
		migratedSessionColumn(columns, "acp_owned", "0"),
		migratedSessionColumn(columns, "plugin_owner_id", "NULL"),
		migratedSessionColumn(columns, "hook_external_content_source", "NULL"),
		migratedSessionColumn(columns, "started_at", "NULL"),
		migratedSessionColumn(columns, "ended_at", "NULL"),
		migratedSessionColumn(columns, "status", "NULL"),
		migratedSessionColumn(columns, "chat_type", "NULL"),
		migratedSessionColumn(columns, "channel", "NULL"),
		migratedSessionColumn(columns, "account_id", "NULL"),
		migratedSessionColumn(columns, "primary_conversation_id", "NULL"),
		migratedSessionColumn(columns, "model_provider", "NULL"),
		migratedSessionColumn(columns, "model", "NULL"),
		migratedSessionColumn(columns, "agent_harness_id", "NULL"),
		migratedSessionColumn(columns, "parent_session_key", "NULL"),
		migratedSessionColumn(columns, "spawned_by", "NULL"),
		migratedSessionColumn(columns, "display_name", "NULL")
	];
	db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      conversation_id TEXT NOT NULL PRIMARY KEY,
      channel TEXT NOT NULL,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('direct', 'group', 'channel')),
      peer_id TEXT NOT NULL,
      delivery_target TEXT NOT NULL,
      parent_conversation_id TEXT,
      thread_id TEXT,
      native_channel_id TEXT,
      native_direct_user_id TEXT,
      label TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
	db.exec(`
      DROP TABLE IF EXISTS sessions_new;
      CREATE TABLE sessions_new (
        session_id TEXT NOT NULL PRIMARY KEY,
        session_key TEXT NOT NULL,
        session_scope TEXT NOT NULL DEFAULT 'conversation' CHECK (session_scope IN ('conversation', 'shared-main', 'group', 'channel')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        transcript_updated_at INTEGER DEFAULT NULL,
        transcript_observed_at INTEGER DEFAULT NULL,
        session_entry_provenance INTEGER NOT NULL DEFAULT 0 CHECK (session_entry_provenance IN (0, 1)),
        acp_owned INTEGER NOT NULL DEFAULT 0 CHECK (acp_owned IN (0, 1)),
        plugin_owner_id TEXT,
        hook_external_content_source TEXT CHECK (hook_external_content_source IS NULL OR hook_external_content_source IN ('gmail', 'webhook')),
        started_at INTEGER,
        ended_at INTEGER,
        status TEXT CHECK (status IS NULL OR status IN ('running', 'done', 'failed', 'killed', 'timeout')),
        chat_type TEXT CHECK (chat_type IS NULL OR chat_type IN ('direct', 'group', 'channel')),
        channel TEXT,
        account_id TEXT,
        primary_conversation_id TEXT,
        model_provider TEXT,
        model TEXT,
        agent_harness_id TEXT,
        parent_session_key TEXT,
        spawned_by TEXT,
        display_name TEXT,
        FOREIGN KEY (primary_conversation_id) REFERENCES conversations(conversation_id) ON DELETE SET NULL
      );
      INSERT INTO sessions_new (${copyColumns.join(", ")})
      SELECT ${selectColumns.join(", ")} FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
    `);
	backfillTranscriptMutationWatermarks(db);
}
/** Backfill one generation token without copying or rewriting transcript rows. */
function migrateSessionTranscriptGenerations(db, previousVersion) {
	if (previousVersion >= 13) return;
	db.prepare(`INSERT OR IGNORE INTO transcript_rewrite_watermarks (session_id, generation, updated_at)
     SELECT session_id, lower(hex(randomblob(16))), ?
     FROM transcript_events
     GROUP BY session_id`).run(Date.now());
}
function migrateSessionTranscriptActiveProjection(db, previousVersion) {
	if (previousVersion >= 10) return;
	const columns = readSqliteTableColumns(db, "session_transcript_index_state");
	if (columns && !columns.has("active_event_count")) db.exec("ALTER TABLE session_transcript_index_state ADD COLUMN active_event_count INTEGER NOT NULL DEFAULT 0;");
	if (columns && !columns.has("active_message_count")) db.exec("ALTER TABLE session_transcript_index_state ADD COLUMN active_message_count INTEGER NOT NULL DEFAULT 0;");
	db.exec(`
    DELETE FROM session_transcript_active_events;
    UPDATE session_transcript_index_state
    SET needs_rebuild = 1,
        active_event_count = 0,
        active_message_count = 0,
        updated_at = ${Date.now()};
  `);
}
function parseMigratedSessionEntry(value) {
	if (typeof value !== "string") return null;
	return safeParseJsonRecord(value) ?? null;
}
function migratedObjectField(entry, key) {
	return asNullableRecord(entry[key]);
}
function migratedNumber(value) {
	return asFiniteNumber(value) ?? null;
}
function migratedChatType(value) {
	if (value === "direct" || value === "group" || value === "channel") return value;
	return null;
}
function migratedStatus(value) {
	if (value === "running" || value === "done" || value === "failed" || value === "killed" || value === "timeout") return value;
	return null;
}
function migratedSessionScope(entry, sessionKey) {
	const chatType = migratedChatType(entry.chatType);
	const normalizedKey = sessionKey.trim().toLowerCase();
	if (chatType === "direct" && (normalizedKey === "main" || normalizedKey.endsWith(":main"))) return "shared-main";
	if (chatType === "group" || chatType === "channel") return chatType;
	return "conversation";
}
function migratedEntryChannel(entry) {
	const delivery = migratedObjectField(entry, "delivery");
	const deliveryContext = migratedObjectField(delivery ?? {}, "context") ?? migratedObjectField(entry, "deliveryContext");
	const origin = migratedObjectField(delivery ?? {}, "origin") ?? migratedObjectField(entry, "origin");
	return normalizeNullableString(entry.channel) ?? normalizeNullableString(deliveryContext?.channel) ?? normalizeNullableString(entry.lastChannel) ?? normalizeNullableString(origin?.provider);
}
function migratedEntryAccountId(entry) {
	const delivery = migratedObjectField(entry, "delivery");
	const deliveryContext = migratedObjectField(delivery ?? {}, "context") ?? migratedObjectField(entry, "deliveryContext");
	const origin = migratedObjectField(delivery ?? {}, "origin") ?? migratedObjectField(entry, "origin");
	return normalizeNullableString(deliveryContext?.accountId) ?? normalizeNullableString(entry.lastAccountId) ?? normalizeNullableString(origin?.accountId);
}
function migratedEntryDisplayName(entry) {
	return normalizeNullableString(entry.displayName) ?? normalizeNullableString(entry.label) ?? normalizeNullableString(entry.subject) ?? normalizeNullableString(entry.groupId);
}
function backfillOpenClawAgentSchema(db, previousVersion) {
	if (previousVersion >= 2) return;
	if (!readSqliteTableColumns(db, "session_entries") || !readSqliteTableColumns(db, "sessions")) return;
	if (!readSqliteTableColumns(db, "session_routes")) db.exec(`
      CREATE TABLE session_routes (
        session_key TEXT NOT NULL PRIMARY KEY,
        session_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );
    `);
	db.exec(`
    INSERT OR REPLACE INTO session_routes (session_key, session_id, updated_at)
    SELECT se.session_key, se.session_id, se.updated_at
    FROM session_entries AS se
    INNER JOIN sessions AS s ON s.session_id = se.session_id;
  `);
	const rows = db.prepare(`
        SELECT se.session_key, se.session_id, se.entry_json
        FROM session_entries AS se
        INNER JOIN sessions AS s ON s.session_id = se.session_id;
      `).all();
	const update = db.prepare(`
    UPDATE sessions
    SET
      session_scope = ?,
      started_at = ?,
      ended_at = ?,
      status = ?,
      chat_type = ?,
      channel = ?,
      account_id = ?,
      model_provider = ?,
      model = ?,
      agent_harness_id = ?,
      parent_session_key = ?,
      spawned_by = ?,
      display_name = ?
    WHERE session_id = ?;
  `);
	for (const row of rows) {
		const sessionKey = normalizeNullableString(row.session_key);
		const sessionId = normalizeNullableString(row.session_id);
		const entry = parseMigratedSessionEntry(row.entry_json);
		if (!sessionKey || !sessionId || !entry) continue;
		update.run(migratedSessionScope(entry, sessionKey), migratedNumber(entry.startedAt), migratedNumber(entry.endedAt), migratedStatus(entry.status), migratedChatType(entry.chatType), migratedEntryChannel(entry), migratedEntryAccountId(entry), normalizeNullableString(entry.modelProvider), normalizeNullableString(entry.model), normalizeNullableString(entry.agentHarnessId), normalizeNullableString(entry.parentSessionKey), normalizeNullableString(entry.spawnedBy), migratedEntryDisplayName(entry), sessionId);
	}
}
function assertAgentDatabaseIntegrityBeforeMutation(database, agentId, pathname) {
	database.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
	const userVersion = readSqliteUserVersion(database);
	const hasApplicationSchema = database.prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get();
	if (userVersion === 0 && hasApplicationSchema || userVersion > 0 && userVersion < 19) agentDbLog.info("agent database schema migration pending; verifying integrity first", {
		fromVersion: userVersion,
		path: pathname,
		toVersion: 19
	});
	const hasPendingCurrentVersionMigration = userVersion === 19 && (hasPendingMemoryChunkMetadataMigration(database) || hasPendingSessionKeyContractSchemaMigration(database) || hasRetiredAgentStateLeaseSchema(database) || hasPendingSessionConversationRouteContextColumn(database) || hasPendingSessionTranscriptContextEligibilityColumn(database) || hasPendingInputConsumptionColumnMigration(database) || hasPendingSessionProjectColumn(database));
	if (userVersion === 19 && !hasPendingCurrentVersionMigration) {
		db91VerifyCurrent({db: database, filename: pathname, agentId, schemaSql: OPENCLAW_AGENT_SCHEMA_SQL,
			verifyFull: verifyAndRepairCanonicalSqliteIndexes, verifyContracts: repairCanonicalSqliteIndexes, options: {
			allowMissingColumns: true,
			validateAfterRepair: () => assertOpenClawAgentCurrentRuntimeSchema(database, {agentId, pathname})
		}});
		assertOpenClawAgentCurrentRuntimeSchema(database, {
			agentId,
			pathname
		});
	} else assertSqliteIntegrity(database, pathname);
	return hasPendingCurrentVersionMigration;
}
function persistAgentSchemaMetadata(db, agentId, targetVersion) {
	const now = Date.now();
	const metadata = {
		role: "agent",
		schema_version: targetVersion,
		agent_id: agentId,
		app_version: VERSION
	};
	executeSqliteQuerySync(db, getNodeSqliteKysely(db).insertInto("schema_meta").values({
		meta_key: "primary",
		...metadata,
		created_at: now,
		updated_at: now
	}).onConflict((conflict) => conflict.column("meta_key").doUpdateSet({
		...metadata,
		updated_at: now
	}).where((eb) => eb.or([
		eb("schema_meta.schema_version", "!=", targetVersion),
		eb("schema_meta.app_version", "is", null),
		eb("schema_meta.app_version", "!=", VERSION),
		eb("schema_meta.agent_id", "!=", agentId)
	]))));
}
function ensureAgentSchema(db, agentId, pathname, targetVersion = 19) {
	const schemaSql = targetVersion < 18 ? withLegacySessionParticipantsSchema(OPENCLAW_AGENT_SCHEMA_SQL) : OPENCLAW_AGENT_SCHEMA_SQL;
	const identityMigration = targetVersion >= 18 && readSqliteUserVersion(db) < targetVersion && (readSqliteUserVersion(db) > 0 || readExistingAgentSchemaMeta(db) !== null);
	if (identityMigration) assertAgentDatabaseMaintenanceAuthority();
	db.exec("PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = OFF;");
	try {
		runSqliteImmediateTransactionSync(db, () => {
			assertExistingAgentSchemaOwner(readExistingAgentSchemaMeta(db), agentId, pathname);
			assertSupportedAgentSchemaVersion(db, pathname);
			const previousVersion = readSqliteUserVersion(db);
			if (identityMigration && readExistingAgentSchemaMeta(db)?.schemaVersion !== previousVersion) throw new Error(`Agent schema markers disagree for ${pathname}; repair ownership metadata before migration.`);
			if (previousVersion > targetVersion) throw new Error(`OpenClaw agent database ${pathname} uses schema version ${previousVersion}; expected at most ${targetVersion} for this migration.`);
			if (previousVersion === 17) {
				const legacySql = withLegacySessionParticipantsSchema(OPENCLAW_AGENT_SCHEMA_SQL);
				ensureSessionAdditiveColumns(db);
				verifyAndRepairCanonicalSqliteIndexes(db, pathname, legacySql, { validateAfterRepair: () => {
					assertAgentSchemaVersion(db, {
						agentId,
						pathname,
						version: 17
					}, legacySql);
				} });
			}
			migrateRetiredAgentStateLeaseSchema(db, pathname, targetVersion);
			if (previousVersion === targetVersion) {
				ensureSessionAdditiveColumns(db);
				ensureSessionEntryValidityProjection(db);
				ensureSessionKeyContractSchemaInTransaction(db);
				if (hasPendingMemoryChunkMetadataMigration(db)) {
					migrateMemoryChunkMetadataSchema(db);
					db.exec(schemaSql);
				}
				repairCanonicalSqliteIndexes(db, pathname, schemaSql, { verifyPhysicalIntegrity: false });
				persistAgentSchemaMetadata(db, agentId, targetVersion);
				assertAgentSchemaVersion(db, {
					agentId,
					pathname,
					version: targetVersion
				}, schemaSql);
				assertAgentDatabaseMaintenanceAuthorityIfPresent();
				return;
			} else if (previousVersion === 14) repairAndAssertOpenClawAgentV14SchemaForMigration(db, {
				agentId,
				pathname
			});
			dropLegacyMemoryIndexSchema(db);
			dropLegacySessionTranscriptSearchSchema(db);
			dropLegacyRuntimeJournalSchemas(db);
			renewAgentDatabaseMaintenanceAuthorityIfPresent();
			migrateMemoryIndexSourcesIdentity(db);
			migrateOpenClawAgentSchema(db);
			migrateConversationDeliveryTargetColumn(db);
			backfillOpenClawAgentSchema(db, previousVersion);
			if (previousVersion < 11) backfillSessionConversations(db);
			backfillSessionEntryProvenance(db, previousVersion);
			migrateSessionNodesAndWindows(db, previousVersion);
			renewAgentDatabaseMaintenanceAuthorityIfPresent();
			ensureSessionAdditiveColumns(db);
			ensureSessionEntryValidityProjection(db);
			if (targetVersion >= 18 && previousVersion < 18) migrateSessionParticipantsSchema(db, pathname);
			if (targetVersion >= 19) migrateSessionCreatorNamespaces(db, previousVersion);
			renewAgentDatabaseMaintenanceAuthorityIfPresent();
			db.exec(schemaSql);
			migrateMemoryChunkMetadataSchema(db);
			if (previousVersion < targetVersion) ensureOpenClawAgentBoardSchemaInTransaction(db);
			migrateSessionTranscriptGenerations(db, previousVersion);
			migrateSessionTranscriptActiveProjection(db, previousVersion);
			if (previousVersion < 11) migrateSqliteSchemaToStrictInTransaction(db, schemaSql, { databaseLabel: pathname });
			repairCanonicalSqliteIndexes(db, pathname, schemaSql, { verifyPhysicalIntegrity: false });
			db.exec(`PRAGMA user_version = ${targetVersion};`);
			persistAgentSchemaMetadata(db, agentId, targetVersion);
			assertAgentSchemaVersion(db, {
				agentId,
				pathname,
				version: targetVersion
			}, schemaSql);
			if (identityMigration) {
				if (db.prepare("PRAGMA foreign_key_check").all().length > 0) throw new Error(`Agent identity migration failed foreign key validation for ${pathname}.`);
				assertAgentDatabaseMaintenanceAuthority();
			}
		});
	} finally {
		db.exec("PRAGMA foreign_keys = ON;");
	}
}
/** Initialize agent schema/ownership metadata on an independently managed connection. */
function ensureOpenClawAgentDatabaseSchema(db, options) {
 // v-memory-preparation-observe-20260909
 const measured=(stage,fn)=>{const t=performance.now();try{return fn();}finally{console.error('[memory-database-preparation] '+JSON.stringify({pid:process.pid,stage,ms:Math.round((performance.now()-t)*10)/10}));}};
	const agentId = normalizeAgentId(options.agentId);
	const databaseOptions = {
		...options,
		agentId
	};
	const pathname = resolveOpenClawAgentSqlitePath(databaseOptions);
	ensureOpenClawAgentDatabasePermissions(pathname, databaseOptions);
	db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
	assertSupportedAgentSchemaVersion(db, pathname);
	assertExistingAgentSchemaOwner(readExistingAgentSchemaMeta(db), agentId, pathname);
	if (readSqliteUserVersion(db) !== 17) measured("integrity",()=>assertAgentDatabaseIntegrityBeforeMutation(db, agentId, pathname));
	configureSqlitePreSchemaPragmas(db, { busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS });
	measured("agent-schema",()=>ensureAgentSchema(db, agentId, pathname));
	ensureOpenClawAgentDatabasePermissions(pathname, databaseOptions);
	if (options.register === true) measured("registry",()=>registerOpenClawAgentDatabase({
		agentId,
		path: pathname,
		env: options.env
	}));
}
/** Upgrade older owned databases to the structural schema required by the media cutover. */
function migrateOpenClawAgentDatabaseToMediaPrerequisiteSchema(db, options) {
	const targetVersion = 16;
	if (readSqliteUserVersion(db) > targetVersion) return;
	const agentId = normalizeAgentId(options.agentId);
	const pathname = resolveOpenClawAgentSqlitePath({
		...options,
		agentId
	});
	assertAgentDatabaseIntegrityBeforeMutation(db, agentId, pathname);
	configureSqlitePreSchemaPragmas(db, { busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS });
	ensureAgentSchema(db, agentId, pathname, targetVersion);
}
//#endregion
//#region src/state/openclaw-agent-db-maintenance.ts
/** Require exact agent ownership without requiring the latest schema. */
function assertOpenClawAgentDatabaseOwner(database, options) {
	const agentId = normalizeAgentId(options.agentId);
	const metadata = readExistingAgentSchemaMeta(database);
	if (!metadata) throw new Error(`OpenClaw agent database ${options.pathname} has no schema ownership metadata.`);
	assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
	if (metadata.agentId !== agentId) throw new Error(`OpenClaw agent database ${options.pathname} belongs to agent ${metadata.agentId}; requested agent ${agentId}.`);
	return metadata;
}
/** Require the exact agent owner and schema before offline file maintenance. */
function assertOpenClawAgentDatabaseForMaintenance(database, options) {
	const metadata = assertOpenClawAgentDatabaseOwner(database, options);
	const userVersion = readSqliteUserVersion(database);
	if (userVersion > 19) throw createNewerSqliteSchemaVersionError("OpenClaw agent database", options.pathname, userVersion, 19);
	if (userVersion !== 19) throw new Error(`OpenClaw agent database ${options.pathname} uses schema version ${userVersion}; run openclaw doctor --fix before compacting it.`);
	if (metadata.schemaVersion !== 19) throw new Error(`OpenClaw agent database ${options.pathname} metadata schema version ${metadata.schemaVersion ?? "invalid"} does not match 19; run openclaw doctor --fix before compacting it.`);
	assertOpenClawAgentSchemaContains(database, options.pathname, OPENCLAW_AGENT_SCHEMA_SQL);
}
/** Upgrade or repair a supported owned schema before strict offline maintenance. */
function migrateOpenClawAgentDatabaseForMaintenance(options) {
	const agentId = normalizeAgentId(options.agentId);
	const database = openNodeSqliteDatabase(options.pathname);
	try {
		database.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
		const metadata = readExistingAgentSchemaMeta(database);
		if (!metadata) return;
		assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
		assertSupportedAgentSchemaVersion(database, options.pathname);
		const userVersion = readSqliteUserVersion(database);
		const metadataVersion = metadata.schemaVersion;
		if (!(userVersion === 19 && metadataVersion === 19) && !(userVersion >= 1 && userVersion < 19 && metadataVersion !== null && metadataVersion === userVersion && metadataVersion >= 1 && metadataVersion < 19)) return;
		ensureOpenClawAgentDatabaseSchema(database, {
			agentId,
			path: options.pathname
		});
		assertOpenClawAgentDatabaseForMaintenance(database, {
			agentId,
			pathname: options.pathname
		});
	} finally {
		clearNodeSqliteKyselyCacheForDatabase(database);
		database.close();
	}
}
//#endregion
export { hasValidSessionEntryIdentity as A, unregisterOpenClawAgentDatabase as B, ensureSessionGoalOperationsSchema as C, migrateLegacySessionCreator as D, hasSessionPendingInputsSchema as E, OPENCLAW_AGENT_SCHEMA_SQL as F, AGENT_DATABASE_MAINTENANCE_LEASE as G, listOpenClawRegisteredAgentDatabases as H, createOpenClawAgentDatabasePathMatcher as I, assertNoOpenClawAgentDatabaseLeases as J, OpenClawAgentDatabaseLeaseActiveError as K, isPersistentOpenClawAgentDatabasePath as L, FIRST_USE_ADDITIVE_AGENT_COLUMN_DEFINITIONS as M, ensureContextEngineTurnOutboxSchema as N, buildConversationRef as O, ensureOpenClawAgentBoardSchemaInTransaction as P, isSameOpenClawAgentDatabasePath as R, SESSION_GOAL_OPERATIONS_TABLE as S, hasPendingInputConsumptionColumn as T, readOpenClawAgentDatabaseRegistryToken as U, unregisterOpenClawAgentDatabases as V, ensureOpenClawAgentDatabasePermissions as W, releaseOpenClawAgentDatabaseLease as X, claimOpenClawAgentDatabaseLease as Y, runWithAgentDatabaseMaintenanceAuthority as Z, withLegacySessionParticipantsSchema as _, ensureAgentSchema as a, ensureSessionParticipantsSchema as b, assertCanonicalAgentPersistenceVersion as c, assertSupportedAgentSchemaVersion as d, readExistingAgentSchemaMeta as f, ensureOpenClawAgentProgressCardSchemaInTransaction as g, ensureSessionTranscriptArchiveSchema as h, assertAgentDatabaseIntegrityBeforeMutation as i, parseSqliteSessionEntryRecord as j, normalizeConversationPeerId as k, assertExistingAgentSchemaOwner as l, SESSION_TRANSCRIPT_ARCHIVES_TABLE as m, assertOpenClawAgentDatabaseOwner as n, ensureOpenClawAgentDatabaseSchema as o, ensureOpenClawAgentStandingIntentsSchema as p, assertAgentDatabaseMaintenanceAuthority as q, migrateOpenClawAgentDatabaseForMaintenance as r, migrateOpenClawAgentDatabaseToMediaPrerequisiteSchema as s, assertOpenClawAgentDatabaseForMaintenance as t, assertOpenClawAgentSchemaContains as u, SESSION_PARTICIPANTS_TABLE as v, ensureSessionPendingInputsSchema as w, ensureMessageToolRunOutcomeSchema as x, confirmSessionParticipantsSchemaEnsured as y, registerOpenClawAgentDatabase as z };
