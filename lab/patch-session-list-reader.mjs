import assert from 'node:assert/strict';

// Retained read-only session-list reader (session-list-reader), on V's 2026.9.1 db91.6 bytes.
//
// The Workboard lifecycle sweep calls sessions.list once a minute (extensions/workboard:
// WORKBOARD_LIFECYCLE_SWEEP_MS = 6e4). Each call reads every durable session store twice
// on the Gateway main thread: gateway.sessions.list.store_load
// (loadCombinedSessionStoreForGatewayCore) and then the sharing phase
// (resolveSessionSharingTarget -> loadGatewaySessionLookupStore, whose per-request
// storeCache is new on every call). Both end in listSessionEntriesReadOnly.
//
// listSessionEntriesReadOnly reuses this process's writable handle when one is open; then
// the entry snapshot cache (keyed by connection, PRAGMA data_version + a session_nodes
// generation) and the one-time canonical-key validation (also keyed by connection) apply.
// V's Gateway runs agent turns in Worker processes, so it usually holds no writable
// handle: every call opens a fresh read-only connection, runs the full canonical-key scan,
// builds a full entry snapshot and closes it. The caches can never hit. On V's code with
// a 3,000-row store that is ~300 ms per read, twice per sessions.list.
//
// This keeps the last such read-only connection per database file (at most 16) and
// reuses it only while a fresh connection could not read anything different:
//   - this process still has no writable handle for the file (else the original path,
//     which reuses that handle, runs and the retained reader is closed);
//   - the file is the same file: dev, inode, size and mtime of the database and its
//     -wal are unchanged since the last read;
//   - PRAGMA data_version on the retained connection is unchanged since before the last
//     read started, i.e. no other connection has committed anything to the file.
// Anything else (a change, an error, a nested read, incognito, a latched writer failure)
// closes it and opens a new read-only connection exactly as the original path does, or
// runs the original path itself. Results, errors and freshness after a write are those of
// a fresh connection; only the repeated scan and parse of unchanged data are skipped.
// OPENCLAW_SESSION_LIST_READER=0 turns it off (and closes retained readers).

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export const SESSION_LIST_READER_CAP = 16;

const READONLY_IMPORT_BEFORE = 'import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";\n';
const READONLY_IMPORT_AFTER = 'import { n as withOpenClawAgentDatabaseReadOnly, t as openOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";\n';
const FS_IMPORT_ANCHOR = 'import crypto from "node:crypto";\n';
const FS_IMPORT = 'import crypto from "node:crypto";\nimport sessionListReaderFs from "node:fs";\n';

const LIST_BEFORE = `function listSessionEntriesReadOnly(scope = {}) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => listSqliteSessionEntriesFromDatabase(database, resolved, scope), toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
`;

const READER = `//#region session-list-reader (V)
/** Retained read-only connections for listSessionEntriesReadOnly when this process holds no
 * writable handle. Reused only while nothing a fresh connection could read has changed:
 * same file (database and -wal stat), PRAGMA data_version unchanged since before the last
 * read. Everything else takes the original fresh-connection path.
 * OPENCLAW_SESSION_LIST_READER=0 turns it off. */
const SESSION_LIST_READER_CAP = ${SESSION_LIST_READER_CAP};
const sessionListReaders = /* @__PURE__ */ new Map();
function closeSessionListReader(pathname, reader) {
	if (sessionListReaders.get(pathname) === reader) sessionListReaders.delete(pathname);
	try {
		reader.database.close();
	} catch {}
}
function closeAllSessionListReaders() {
	for (const [pathname, reader] of [...sessionListReaders]) if (!reader.busy) closeSessionListReader(pathname, reader);
}
function readSessionListReaderStamp(pathname) {
	try {
		const main = sessionListReaderFs.statSync(pathname, { bigint: true });
		if (!main.isFile()) return;
		let wal = "none";
		try {
			const sidecar = sessionListReaderFs.statSync(\`\${pathname}-wal\`, { bigint: true });
			wal = \`\${sidecar.dev}:\${sidecar.ino}:\${sidecar.size}:\${sidecar.mtimeNs}\`;
		} catch (error) {
			if (error?.code !== "ENOENT") return;
		}
		return \`\${main.dev}:\${main.ino}:\${main.size}:\${main.mtimeNs}|\${wal}\`;
	} catch {
		return;
	}
}
function readSessionListReaderDataVersion(db) {
	try {
		if (!db.isOpen || db.isTransaction) return;
		const value = db.prepare("PRAGMA data_version").get()?.data_version;
		return typeof value === "number" || typeof value === "bigint" ? value : void 0;
	} catch {
		return;
	}
}
function listSessionEntriesWithRetainedReader(resolved, scope) {
	if (process.env.OPENCLAW_SESSION_LIST_READER === "0") {
		if (sessionListReaders.size > 0) closeAllSessionListReaders();
		return;
	}
	const options = toDatabaseOptions(resolved);
	const agentId = normalizeAgentId(options.agentId);
	let pathname;
	try {
		pathname = resolveOpenClawAgentSqlitePath({
			...options,
			agentId
		});
		if (isIncognitoOpenClawAgentSqlitePath(pathname, {
			agentId,
			env: options.env
		})) return;
		if (getOpenClawAgentDatabaseIfOpen({
			...options,
			agentId
		})) {
			const stale = sessionListReaders.get(pathname);
			if (stale && !stale.busy) closeSessionListReader(pathname, stale);
			return;
		}
	} catch {
		return;
	}
	let reader = sessionListReaders.get(pathname);
	if (reader?.busy) return;
	const stamp = readSessionListReaderStamp(pathname);
	if (stamp === void 0) {
		if (reader) closeSessionListReader(pathname, reader);
		return;
	}
	if (reader) {
		const current = readSessionListReaderDataVersion(reader.database.db);
		if (reader.stamp !== stamp || current === void 0 || current !== reader.dataVersion) {
			closeSessionListReader(pathname, reader);
			reader = void 0;
		}
	}
	if (!reader) {
		let opened;
		try {
			opened = openOpenClawAgentDatabaseReadOnly({
				...options,
				agentId
			});
		} catch {
			return;
		}
		if (!opened.found) return;
		reader = {
			database: opened.database,
			busy: false,
			dataVersion: void 0,
			stamp: void 0
		};
	}
	const dataVersion = readSessionListReaderDataVersion(reader.database.db);
	if (dataVersion === void 0) {
		closeSessionListReader(pathname, reader);
		return;
	}
	sessionListReaders.delete(pathname);
	sessionListReaders.set(pathname, reader);
	let value;
	reader.busy = true;
	try {
		value = listSqliteSessionEntriesFromDatabase(reader.database, resolved, scope);
	} catch {
		reader.busy = false;
		closeSessionListReader(pathname, reader);
		return;
	}
	reader.busy = false;
	reader.dataVersion = dataVersion;
	reader.stamp = stamp;
	for (const [oldestPath, oldest] of [...sessionListReaders]) {
		if (sessionListReaders.size <= SESSION_LIST_READER_CAP) break;
		if (!oldest.busy) closeSessionListReader(oldestPath, oldest);
	}
	return { value };
}
//#endregion
`;

const LIST_AFTER = `${READER}function listSessionEntriesReadOnly(scope = {}) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const retained = listSessionEntriesWithRetainedReader(resolved, scope);
	if (retained) return retained.value;
	const result = withOpenClawAgentDatabaseReadOnly((database) => listSqliteSessionEntriesFromDatabase(database, resolved, scope), toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
`;

export function patchSessionAccessorEntry(source) {
  assert(!source.includes('session-list-reader'), 'session-list-reader is already applied');
  let output = replaceExactlyOnce(source, READONLY_IMPORT_BEFORE, READONLY_IMPORT_AFTER, 'read-only database import');
  output = replaceExactlyOnce(output, FS_IMPORT_ANCHOR, FS_IMPORT, 'node:crypto import');
  output = replaceExactlyOnce(output, LIST_BEFORE, LIST_AFTER, 'listSessionEntriesReadOnly');
  // Names the patch relies on must already be imported by the chunk.
  for (const name of ['resolveOpenClawAgentSqlitePath', 'isIncognitoOpenClawAgentSqlitePath', 'getOpenClawAgentDatabaseIfOpen', 'normalizeAgentId', 'toDatabaseOptions', 'listSqliteSessionEntriesFromDatabase']) {
    assert.match(output, new RegExp(`\\b(as ${name}\\b|function ${name}\\()`), `missing ${name}`);
  }
  return output;
}
