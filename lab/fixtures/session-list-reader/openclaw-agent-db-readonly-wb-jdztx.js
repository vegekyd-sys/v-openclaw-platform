import { h as clearNodeSqliteKyselyCacheForDatabase, t as openNodeSqliteDatabase } from "./node-sqlite-CL-d6drd.js";
import "./kysely-sync-DKYGT267.js";
import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import "./session-key-CRjxKW0X.js";
import { c as assertCanonicalAgentPersistenceVersion, d as assertSupportedAgentSchemaVersion, f as readExistingAgentSchemaMeta, l as assertExistingAgentSchemaOwner } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { r as resolveOpenClawAgentSqlitePath, t as isIncognitoOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { u as getOpenClawAgentDatabaseIfOpen } from "./openclaw-agent-db-CUTe8BX6.js";
import fs from "node:fs";
//#region src/state/openclaw-agent-db-readonly.ts
/**
* Look up a process-held handle without adopting writer-side failures.
*
* Read-only reads are meant to survive a latched open failure or an ownership
* mismatch that only the writable lifecycle cares about; those callers fall
* back to a fresh connection, which reports the precise reason.
*/
function findOpenAgentDatabase(options) {
	try {
		return getOpenClawAgentDatabaseIfOpen(options);
	} catch {
		return;
	}
}
/** Open one existing agent database without creating, registering, migrating, or adopting it. */
function openOpenClawAgentDatabaseReadOnly(options, behavior = {}) {
	const agentId = normalizeAgentId(options.agentId);
	const pathname = resolveOpenClawAgentSqlitePath({
		...options,
		agentId
	});
	if (isIncognitoOpenClawAgentSqlitePath(pathname, {
		agentId,
		env: options.env
	})) return {
		found: false,
		reason: "database-missing"
	};
	if (!fs.existsSync(pathname)) return {
		found: false,
		reason: "database-missing"
	};
	const db = openNodeSqliteDatabase(pathname, {
		readOnly: true,
		...behavior.allowExtension ? { allowExtension: true } : {}
	});
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		clearNodeSqliteKyselyCacheForDatabase(db);
		db.close();
	};
	try {
		db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
		const userVersion = assertSupportedAgentSchemaVersion(db, pathname);
		assertCanonicalAgentPersistenceVersion(db, pathname, userVersion);
		const schemaMeta = readExistingAgentSchemaMeta(db);
		if (!schemaMeta) {
			close();
			return {
				found: false,
				reason: "schema-missing"
			};
		}
		assertExistingAgentSchemaOwner(schemaMeta, agentId, pathname);
		return {
			found: true,
			database: {
				agentId,
				db,
				path: pathname,
				close
			}
		};
	} catch (error) {
		close();
		throw error;
	}
}
/** Read agent state without creating, registering, migrating, or joining its writable lifecycle. */
function withOpenClawAgentDatabaseReadOnly(operation, options, behavior = {}) {
	const agentId = normalizeAgentId(options.agentId);
	const pathname = resolveOpenClawAgentSqlitePath({
		...options,
		agentId
	});
	if (isIncognitoOpenClawAgentSqlitePath(pathname, {
		agentId,
		env: options.env
	})) {
		const database = getOpenClawAgentDatabaseIfOpen({
			...options,
			agentId
		});
		if (database && behavior.allowExtension) throw new Error("Extension-capable read-only access is unavailable for incognito databases.");
		return database ? {
			found: true,
			value: operation(database)
		} : {
			found: false,
			reason: "database-missing"
		};
	}
	const processOpened = behavior.allowExtension ? void 0 : findOpenAgentDatabase({
		...options,
		agentId
	});
	const reusable = processOpened && !processOpened.db.isTransaction ? processOpened : void 0;
	const fresh = reusable ? void 0 : openOpenClawAgentDatabaseReadOnly({
		...options,
		agentId
	}, behavior);
	if (fresh && !fresh.found) return fresh;
	const database = reusable ?? fresh.database;
	const { db } = database;
	try {
		if (reusable) {
			const userVersion = assertSupportedAgentSchemaVersion(db, pathname);
			assertCanonicalAgentPersistenceVersion(db, pathname, userVersion);
		}
		try {
			return {
				found: true,
				value: operation(database)
			};
		} catch (error) {
			if (error instanceof Error && error.code === "ERR_SQLITE_ERROR" && /\bno such table:/iu.test(error.message) && !behavior.throwOnMissingTable) return {
				found: false,
				reason: "table-missing"
			};
			throw error;
		}
	} finally {
		if (fresh?.found) fresh.database.close();
	}
}
//#endregion
export { withOpenClawAgentDatabaseReadOnly as n, openOpenClawAgentDatabaseReadOnly as t };
