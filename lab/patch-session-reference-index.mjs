import assert from 'node:assert/strict';

// Session deletions stall V's Gateway main thread for 3.5-5.3 s (V 2026-11-16/17).
//
// Every deletion that keeps the session's transcript windows (sessions.delete at the end of a run,
// projected lifecycle removals) rehomes each retained window to a surviving node that references it.
// deleteSessionEntryRows found that node by projecting the metadata JSON of every other row of
// session_nodes and parsing it in JS, inside the synchronous write transaction. On V's makaron store
// that is 21,923 rows / 1.99 GB of entry_json: SQLite's json_remove over all of it alone takes 2.6 s,
// plus a parse per row. The Gateway file log shows the holds as `agent.write` with callers
// runSqliteSessionDeletionTransaction <- sqlite-lifecycle:377 (3.3-3.5 s, every 7-30 minutes) and
// <- commitProjectedLifecycleMutation (5.1-5.3 s: that path also runs readReferencedSessionIds, the same
// full read). Deletions that drop transcripts paid the read again in their preparation lane.
//
// session-reference-index-v1 keeps, per connection, the session ids each node references (sessionId,
// previousSessionId, usageFamilySessionIds, compaction checkpoints) with a fingerprint read in the
// same statement: rowid, current id, updated_at, octet_length(entry_json) (record header only; on V
// the whole fingerprint pass reads 90 MB of leaf pages, 0.18 s warm, instead of 2 GB). A row is
// re-read only when this connection wrote it (TEMP triggers record the key), or when another
// connection committed since the last check (PRAGMA data_version) and its fingerprint differs. Inside
// one write transaction no other connection can commit, so repeated reads there cost only the
// transaction's own writes. An epoch token in a TEMP table, written through the caller's transaction,
// makes a rolled-back transaction's reads suspect again. Before the writer lane, a prewarm validates
// the index one page per event-loop turn.
//
// OPENCLAW_V_SESSION_REFERENCE_INDEX=0 restores the full read on every call (no restart of the
// behaviour beyond the environment of the Gateway process).
// Source: openclaw-versa versa/port-session-reference-index-20261117.

export const MARKER = 'session-reference-index-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

const INDEX_MODULE = `//#region src/config/sessions/session-accessor.sqlite-reference-index.ts
// ${MARKER}: per-connection index of the session ids each session node references.
const SESSION_REFERENCE_LOAD_PAGE_KEYS = 200;
const SESSION_REFERENCE_PREWARM_PAGE_ROWS = 2e3;
const SESSION_REFERENCE_DIRTY_TABLE = "openclaw_session_reference_dirty";
const SESSION_REFERENCE_EPOCH_TABLE = "openclaw_session_reference_epoch";
const SESSION_REFERENCE_TRIGGERS = [
	"openclaw_session_reference_dirty_insert",
	"openclaw_session_reference_dirty_update",
	"openclaw_session_reference_dirty_delete"
];
const SESSION_REFERENCE_FINGERPRINT_COLUMNS = "rowid AS r, session_key AS k, current_session_id AS c, updated_at AS u, octet_length(entry_json) AS n";
const sessionReferenceIndexes = /* @__PURE__ */ new WeakMap();
function isSessionReferenceIndexEnabled(env = process.env) {
	return env.OPENCLAW_V_SESSION_REFERENCE_INDEX !== "0";
}
function sessionReferenceFingerprintOf(row) {
	return \`\${row.r}\\u0000\${row.c}\\u0000\${row.u ?? ""}\\u0000\${row.n ?? ""}\`;
}
function readSessionReferencePragmaNumber(db, pragma) {
	const value = db.prepare(\`PRAGMA main.\${pragma}\`).get()?.[pragma];
	if (typeof value !== "number") throw new Error(\`SQLite did not return a numeric PRAGMA \${pragma}\`);
	return value;
}
function sessionReferenceTrackerInstalled(db) {
	const row = db.prepare(\`SELECT count(*) AS n FROM temp.sqlite_master WHERE name IN ('\${SESSION_REFERENCE_DIRTY_TABLE}', '\${SESSION_REFERENCE_EPOCH_TABLE}', \${SESSION_REFERENCE_TRIGGERS.map((name) => \`'\${name}'\`).join(", ")})\`).get();
	return Number(row.n) === 2 + SESSION_REFERENCE_TRIGGERS.length;
}
/** The connection's index, with its dirty-key triggers installed for the current schema. */
function ensureSessionReferenceIndex(db) {
	const schemaVersion = readSessionReferencePragmaNumber(db, "schema_version");
	const index = sessionReferenceIndexes.get(db);
	if (index && index.schemaVersion === schemaVersion && sessionReferenceTrackerInstalled(db)) return index;
	const mark = (key) => \`INSERT INTO \${SESSION_REFERENCE_DIRTY_TABLE} (session_key) SELECT \${key}.session_key WHERE NOT EXISTS (SELECT 1 FROM \${SESSION_REFERENCE_DIRTY_TABLE} WHERE session_key = \${key}.session_key);\`;
	// No constraints on the TEMP tables: an outer ON CONFLICT clause overrides a trigger's own
	// conflict handling, so a constrained insert could fail the session_nodes statement.
	db.exec(\`
    CREATE TEMP TABLE IF NOT EXISTS \${SESSION_REFERENCE_DIRTY_TABLE} (session_key TEXT);
    CREATE INDEX IF NOT EXISTS temp.\${SESSION_REFERENCE_DIRTY_TABLE}_key ON \${SESSION_REFERENCE_DIRTY_TABLE} (session_key);
    CREATE TEMP TABLE IF NOT EXISTS \${SESSION_REFERENCE_EPOCH_TABLE} (token TEXT);
    DROP TRIGGER IF EXISTS \${SESSION_REFERENCE_TRIGGERS[0]};
    DROP TRIGGER IF EXISTS \${SESSION_REFERENCE_TRIGGERS[1]};
    DROP TRIGGER IF EXISTS \${SESSION_REFERENCE_TRIGGERS[2]};
    CREATE TEMP TRIGGER \${SESSION_REFERENCE_TRIGGERS[0]} AFTER INSERT ON main.session_nodes BEGIN \${mark("NEW")} END;
    CREATE TEMP TRIGGER \${SESSION_REFERENCE_TRIGGERS[1]} AFTER UPDATE ON main.session_nodes BEGIN \${mark("OLD")} \${mark("NEW")} END;
    CREATE TEMP TRIGGER \${SESSION_REFERENCE_TRIGGERS[2]} AFTER DELETE ON main.session_nodes BEGIN \${mark("OLD")} END;
    DELETE FROM \${SESSION_REFERENCE_EPOCH_TABLE};
  \`);
	const sameSchema = index?.schemaVersion === schemaVersion;
	const next = {
		rows: sameSchema && index ? index.rows : /* @__PURE__ */ new Map(),
		schemaVersion,
		uncertain: sameSchema && index ? index.uncertain : /* @__PURE__ */ new Set()
	};
	sessionReferenceIndexes.set(db, next);
	return next;
}
function readSessionReferenceDirtyKeys(db) {
	return db.prepare(\`SELECT DISTINCT session_key FROM temp.\${SESSION_REFERENCE_DIRTY_TABLE} WHERE session_key IS NOT NULL\`).all().map((row) => row.session_key);
}
function sessionReferenceEpochIsCurrent(db, index) {
	return index.token !== void 0 && db.prepare(\`SELECT 1 AS ok FROM temp.\${SESSION_REFERENCE_EPOCH_TABLE} WHERE token = ?\`).get(index.token) !== void 0;
}
/** Record a completed validation through the caller's transaction (or autocommit). */
function sealSessionReferenceEpoch(db, index, dataVersion, consumeDirty) {
	const token = randomUUID();
	if (consumeDirty) db.prepare(\`DELETE FROM temp.\${SESSION_REFERENCE_DIRTY_TABLE}\`).run();
	db.prepare(\`DELETE FROM temp.\${SESSION_REFERENCE_EPOCH_TABLE}\`).run();
	db.prepare(\`INSERT INTO temp.\${SESSION_REFERENCE_EPOCH_TABLE} (token) VALUES (?)\`).run(token);
	index.token = token;
	index.dataVersion = dataVersion;
}
function collectStaleSessionReferenceKeys(index, rows, seen) {
	const stale = [];
	for (const row of rows) {
		seen.add(row.k);
		if (index.rows.get(row.k)?.fingerprint !== sessionReferenceFingerprintOf(row)) stale.push(row.k);
	}
	return stale;
}
function dropMissingSessionReferenceRows(index, seen) {
	for (const key of index.rows.keys()) if (!seen.has(key)) index.rows.delete(key);
}
/** Load metadata projection and fingerprint of the given keys, one statement per page. */
function loadSessionReferenceRows(db, index, keys) {
	const kysely = getSessionKysely(db);
	for (let start = 0; start < keys.length; start += SESSION_REFERENCE_LOAD_PAGE_KEYS) {
		const page = keys.slice(start, start + SESSION_REFERENCE_LOAD_PAGE_KEYS);
		const rows = executeSqliteQuerySync(db, kysely.selectFrom("session_nodes").select([
			sessionEntryMetadataJson,
			"current_session_id",
			"session_key",
			sql\`rowid\`.as("r"),
			sql\`updated_at\`.as("u"),
			sql\`octet_length(entry_json)\`.as("n")
		]).where("session_key", "in", page)).rows;
		const found = /* @__PURE__ */ new Set();
		for (const row of rows) {
			found.add(row.session_key);
			const entry = parseSessionEntryJson({
				current_session_id: row.current_session_id,
				entry_json: row.entry_json
			});
			index.rows.set(row.session_key, {
				fingerprint: sessionReferenceFingerprintOf({
					r: row.r,
					k: row.session_key,
					c: row.current_session_id,
					u: row.u,
					n: row.n
				}),
				currentSessionId: row.current_session_id,
				sessionIds: entry ? collectSessionStateIdsForEntry(entry) : []
			});
		}
		for (const key of page) if (!found.has(key)) index.rows.delete(key);
	}
}
/** The connection's reference index, brought current synchronously (safe inside a write transaction). */
function refreshSessionReferenceIndexSync(database) {
	const db = database.db;
	const index = ensureSessionReferenceIndex(db);
	const inTransaction = db.isTransaction;
	const dataVersion = readSessionReferencePragmaNumber(db, "data_version");
	const epochCurrent = sessionReferenceEpochIsCurrent(db, index);
	if (epochCurrent && !inTransaction) index.uncertain.clear();
	const stale = new Set(readSessionReferenceDirtyKeys(db));
	if (index.dataVersion !== dataVersion || !epochCurrent) {
		const seen = /* @__PURE__ */ new Set();
		for (const key of collectStaleSessionReferenceKeys(index, db.prepare(\`SELECT \${SESSION_REFERENCE_FINGERPRINT_COLUMNS} FROM main.session_nodes\`).iterate(), seen)) stale.add(key);
		dropMissingSessionReferenceRows(index, seen);
	}
	if (!epochCurrent) for (const key of index.uncertain) stale.add(key);
	loadSessionReferenceRows(db, index, [...stale]);
	if (inTransaction) for (const key of stale) index.uncertain.add(key);
	else index.uncertain.clear();
	sealSessionReferenceEpoch(db, index, dataVersion, true);
	return index.rows;
}
const yieldSessionReferencePrewarm = () => new Promise((resolve) => setImmediate(resolve));
/** Validate the index outside any writer lane, one small page per event-loop turn. Best effort. */
async function prewarmSessionReferenceIndex(open) {
	if (!isSessionReferenceIndexEnabled()) return;
	try {
		const opened = open();
		if (!opened || opened.db.isTransaction) return;
		let db = opened.db;
		const index = ensureSessionReferenceIndex(db);
		const dataVersion = readSessionReferencePragmaNumber(db, "data_version");
		const epochCurrent = sessionReferenceEpochIsCurrent(db, index);
		if (epochCurrent) {
			index.uncertain.clear();
			if (index.dataVersion === dataVersion) return;
		}
		const usable = () => {
			const current = open();
			if (!current) return false;
			db = current.db;
			return !db.isTransaction && sessionReferenceIndexes.get(db) === index;
		};
		const seen = /* @__PURE__ */ new Set();
		const stale = [];
		let after = -1;
		for (;;) {
			const rows = db.prepare(\`SELECT \${SESSION_REFERENCE_FINGERPRINT_COLUMNS} FROM main.session_nodes WHERE rowid > ? ORDER BY rowid LIMIT \${SESSION_REFERENCE_PREWARM_PAGE_ROWS}\`).all(after);
			stale.push(...collectStaleSessionReferenceKeys(index, rows, seen));
			if (rows.length < SESSION_REFERENCE_PREWARM_PAGE_ROWS) break;
			after = rows[rows.length - 1].r;
			await yieldSessionReferencePrewarm();
			if (!usable()) return;
		}
		dropMissingSessionReferenceRows(index, seen);
		if (!epochCurrent) {
			const staleSet = new Set(stale);
			stale.push(...[...index.uncertain].filter((key) => !staleSet.has(key)));
		}
		for (let start = 0; start < stale.length; start += SESSION_REFERENCE_LOAD_PAGE_KEYS) {
			if (start > 0) {
				await yieldSessionReferencePrewarm();
				if (!usable()) return;
			}
			loadSessionReferenceRows(db, index, stale.slice(start, start + SESSION_REFERENCE_LOAD_PAGE_KEYS));
		}
		if (!usable()) return;
		index.uncertain.clear();
		sealSessionReferenceEpoch(db, index, dataVersion, false);
	} catch {}
}
/** Session ids referenced by live session nodes, except the excluded keys. */
function readReferencedSessionIdsFromIndex(database, excludedSessionKeys) {
	const sessionIds = /* @__PURE__ */ new Set();
	for (const [sessionKey, row] of refreshSessionReferenceIndexSync(database)) {
		if (excludedSessionKeys.has(sessionKey)) continue;
		sessionIds.add(row.currentSessionId);
		for (const sessionId of row.sessionIds) sessionIds.add(sessionId);
	}
	return sessionIds;
}
function compareSessionReferenceKeysBinary(left, right) {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
/** For each session id, the first other node (session_key in SQLite BINARY order) that owns or references it. */
function findSurvivingSessionNodeKeysFromIndex(database, sessionIds, excludedSessionKey) {
	const wanted = new Set(sessionIds);
	const owners = /* @__PURE__ */ new Map();
	if (wanted.size === 0) return owners;
	const consider = (sessionId, sessionKey) => {
		if (!wanted.has(sessionId)) return;
		const current = owners.get(sessionId);
		if (current === void 0 || compareSessionReferenceKeysBinary(sessionKey, current) < 0) owners.set(sessionId, sessionKey);
	};
	for (const [sessionKey, row] of refreshSessionReferenceIndexSync(database)) {
		if (sessionKey === excludedSessionKey) continue;
		consider(row.currentSessionId, sessionKey);
		for (const sessionId of row.sessionIds) consider(sessionId, sessionKey);
	}
	return owners;
}
/** First other node (session_key order) that owns or references each window. */
function findSurvivingSessionNodeKeys(database, sessionIds, sessionKey) {
	if (isSessionReferenceIndexEnabled()) try {
		return findSurvivingSessionNodeKeysFromIndex(database, sessionIds, sessionKey);
	} catch {}
	const survivingNodes = executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_nodes").select([
		"current_session_id",
		sessionEntryMetadataJson,
		"session_key"
	]).where("session_key", "!=", sessionKey).orderBy("session_key", "asc")).rows;
	const owners = /* @__PURE__ */ new Map();
	for (const sessionId of sessionIds) {
		const survivingNode = survivingNodes.find((node) => {
			if (node.current_session_id === sessionId) return true;
			const entry = parseSessionEntryJson(node);
			return entry ? collectSessionStateIdsForEntry(entry).includes(sessionId) : false;
		});
		if (survivingNode) owners.set(sessionId, survivingNode.session_key);
	}
	return owners;
}
//#endregion
`;

// core/dist/session-accessor.sqlite-entry-store-VfW3gyuj.js
export function patchEntryStore(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    'import { c as deferOpenClawAgentPostCommitPublication, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";',
    'import { c as deferOpenClawAgentPostCommitPublication, g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";',
    'openclaw-agent-db import');
  out = replaceExactlyOnce(out,
    'import { a as normalizeSqliteSessionKey, i as getSessionKysely, p as runExclusiveSqliteSessionWrite } from "./session-accessor.sqlite-scope-BwPKGcgm.js";',
    'import { a as normalizeSqliteSessionKey, i as getSessionKysely, m as toDatabaseOptions, p as runExclusiveSqliteSessionWrite } from "./session-accessor.sqlite-scope-BwPKGcgm.js";',
    'scope import');
  out = replaceExactlyOnce(out,
    'import { randomUUID } from "node:crypto";\n',
    'import { randomUUID } from "node:crypto";\nimport { sql } from "kysely";\n',
    'node:crypto import');
  // runPreparedSqliteSessionWrite: validate references before the commit lane
  out = replaceExactlyOnce(out,
    `	const write = prepared.write;
	const result = await withSqliteSessionDeletions(scope, write.deletedEntries, async (assertCurrent) => {`,
    `	const write = prepared.write;
	// ${MARKER}: removals resolve surviving references inside the commit transaction; validate them
	// first, outside the writer lane, a page per event-loop turn.
	await prewarmSessionReferenceIndex(() => openOpenClawAgentDatabase(toDatabaseOptions(scope)));
	const result = await withSqliteSessionDeletions(scope, write.deletedEntries, async (assertCurrent) => {`,
    'runPreparedSqliteSessionWrite');
  // deleteSessionEntryRows: surviving owners from the index instead of every row's metadata
  out = replaceExactlyOnce(out,
    `	const survivingNodes = windows.length > 0 ? executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([
		"current_session_id",
		sessionEntryMetadataJson,
		"session_key"
	]).where("session_key", "!=", sessionKey).orderBy("session_key", "asc")).rows : [];
	for (const window of windows) {
		const survivingNode = survivingNodes.find((node) => {
			if (node.current_session_id === window.session_id) return true;
			const entry = parseSessionEntryJson(node);
			return entry ? collectSessionStateIdsForEntry(entry).includes(window.session_id) : false;
		});
		if (survivingNode) executeSqliteQuerySync(database.db, db.updateTable("session_windows").set({ session_key: survivingNode.session_key }).where("session_id", "=", window.session_id));
	}`,
    `	// ${MARKER}: the first surviving owner of each retained window, from the reference index.
	const survivingKeys = windows.length > 0 ? findSurvivingSessionNodeKeys(database, windows.map((window) => window.session_id), sessionKey) : /* @__PURE__ */ new Map();
	for (const window of windows) {
		const survivingKey = survivingKeys.get(window.session_id);
		if (survivingKey !== void 0) executeSqliteQuerySync(database.db, db.updateTable("session_windows").set({ session_key: survivingKey }).where("session_id", "=", window.session_id));
	}`,
    'deleteSessionEntryRows survivor scan');
  out = replaceExactlyOnce(out,
    'function deleteSessionEntryRows(database, sessionKey, options = {}) {',
    `${INDEX_MODULE}function deleteSessionEntryRows(database, sessionKey, options = {}) {`,
    'deleteSessionEntryRows');
  out = replaceExactlyOnce(out,
    'export { registerSessionPendingInputOwner as A,',
    'export { isSessionReferenceIndexEnabled, prewarmSessionReferenceIndex, readReferencedSessionIdsFromIndex, registerSessionPendingInputOwner as A,',
    'export list');
  return out;
}

// core/dist/session-accessor.sqlite-lifecycle-state-CrB_K2kA.js
export function patchLifecycleState(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    'import { Y as sqliteSessionEntriesEqual, c as readExactSessionEntryJson,',
    'import { isSessionReferenceIndexEnabled, readReferencedSessionIdsFromIndex, Y as sqliteSessionEntriesEqual, c as readExactSessionEntryJson,',
    'entry-store import');
  out = replaceExactlyOnce(out,
    `function readReferencedSessionIds(database, excludedSessionKeys = /* @__PURE__ */ new Set()) {
	const db = getSessionKysely(database.db);`,
    `function readReferencedSessionIds(database, excludedSessionKeys = /* @__PURE__ */ new Set()) {
	// ${MARKER}: ids from the per-connection reference index; the full read is the fallback.
	if (isSessionReferenceIndexEnabled()) try {
		return readReferencedSessionIdsFromIndex(database, excludedSessionKeys);
	} catch {}
	return readReferencedSessionIdsFullScan(database, excludedSessionKeys);
}
function readReferencedSessionIdsFullScan(database, excludedSessionKeys) {
	const db = getSessionKysely(database.db);`,
    'readReferencedSessionIds');
  return out;
}

// core/dist/session-accessor.sqlite-lifecycle-dtL0ZEAl.js
export function patchLifecycle(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `async function deleteSqliteSessionEntryLifecycleLocked(resolved, params, allowLockedEntryRemoval, expectedPluginOwnerId, recordCommit) {
	const prepared = await runExclusiveSqliteSessionWrite(resolved, async () => {`,
    `async function deleteSqliteSessionEntryLifecycleLocked(resolved, params, allowLockedEntryRemoval, expectedPluginOwnerId, recordCommit) {
	// ${MARKER}: the preparation lane reads surviving references; validate them first, on a store
	// this process already has open (opening one can register ownership, which belongs in the lane).
	if (params.archiveTranscript || params.deleteTranscriptWithoutArchive === true) await prewarmSessionReferenceIndex(() => getOpenClawAgentDatabaseIfOpen(toDatabaseOptions(resolved)));
	const prepared = await runExclusiveSqliteSessionWrite(resolved, async () => {`,
    'deletion preparation lane');
  out = replaceExactlyOnce(out,
    'import { c as deferOpenClawAgentPostCommitPublication, g as openOpenClawAgentDatabase } from "./openclaw-agent-db-CUTe8BX6.js";',
    'import { c as deferOpenClawAgentPostCommitPublication, g as openOpenClawAgentDatabase, u as getOpenClawAgentDatabaseIfOpen } from "./openclaw-agent-db-CUTe8BX6.js";',
    'openclaw-agent-db import');
  out = replaceExactlyOnce(out,
    `		const materializedPlans = await materializeSessionStateDeletePlans(prepared.entryPlans);
		const result = await runExclusiveSqliteSessionWrite(resolved, async () => {`,
    `		const materializedPlans = await materializeSessionStateDeletePlans(prepared.entryPlans);
		// ${MARKER}: validate surviving references outside the writer lane before the deletion transaction.
		await prewarmSessionReferenceIndex(() => openOpenClawAgentDatabase(toDatabaseOptions(resolved)));
		const result = await runExclusiveSqliteSessionWrite(resolved, async () => {`,
    'deletion transaction');
  const importLine = out.split('\n').find((line) => line.startsWith('import {') && line.includes('/session-accessor.sqlite-entry-store-VfW3gyuj.js'));
  assert(importLine, 'entry-store import in lifecycle chunk');
  out = replaceExactlyOnce(out, importLine, importLine.replace('import { ', 'import { prewarmSessionReferenceIndex, '), 'entry-store import');
  return out;
}

export const FILES = [
  {
    name: 'session-accessor.sqlite-entry-store-VfW3gyuj.js',
    base: 'core/dist',
    target: 'openclaw/dist',
    before: '455037c6dd4d03e06151c49bf8dcda76bc6124ea05a3c70b502cd819429d338d',
    patch: patchEntryStore,
  },
  {
    name: 'session-accessor.sqlite-lifecycle-state-CrB_K2kA.js',
    base: 'core/dist',
    target: 'openclaw/dist',
    before: '4f4cce65c21e82f7d9d5f49bbb2d9b76802c6b7b468cc741b4ce9b820a3e4096',
    patch: patchLifecycleState,
  },
  {
    name: 'session-accessor.sqlite-lifecycle-dtL0ZEAl.js',
    base: 'core/dist',
    target: 'openclaw/dist',
    before: 'efa4604b435e588dfeb3b86730c183c4e4950cbb5b4ebc261fc6023819fd7646',
    patch: patchLifecycle,
  },
];
