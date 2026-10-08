import assert from 'node:assert/strict';

// The canonical session-key scan, once per database file per process
// (canonical-scan-path-cache), on top of V's session-accessor.sqlite-transcript-state chunk.
//
// assertCanonicalSqliteSessionKeysCurrent remembers a validated database by its connection
// handle. A read-only read that cannot reuse the process's writable handle (none open yet,
// or that handle is inside a transaction) opens a fresh read-only connection, and every
// fresh connection reads and parses every session row again. With ~4,100 sessions that is
// about 1 s of synchronous CPU per read. Private VLab candidate 2026-10-06 (5 Workers, Worker
// CPU profiles): assertCanonicalSqliteSessionKeysCurrent -> scanCanonicalSqliteSessionEntries
// held 8.1 s of 8 cold-turn windows (worker-command-enter -> model-call-enter), under
// resolveSessionEntry -> withOpenClawAgentDatabaseReadOnly; two first turns took 10.6 s and
// 11.0 s.
//
// This also remembers the validated database file and the canonical main key it was
// validated against. A later connection to the same file skips the scan when the stored
// main key still matches, which costs one single-row query. That is the guarantee a
// long-lived writable handle already gives today: once validated it is never rescanned,
// whatever other processes write, because every writer asserts canonical keys on write.
// Changing the main key through setCanonicalSqliteSessionMainKey forgets the file, as it
// already forgets the handle. In-memory databases are never shared this way.
// OPENCLAW_CANONICAL_SCAN_PATH_CACHE=0 restores the per-connection behavior.

export const MARKER = '/* OPENCLAW_CANONICAL_SCAN_PATH_CACHE_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchTranscriptStateChunk(source) {
  assert.equal(source.includes(MARKER), false, 'already patched');
  let out = replaceExactlyOnce(
    source,
    `const validatedDatabases = /* @__PURE__ */ new WeakSet();
`,
    `const validatedDatabases = /* @__PURE__ */ new WeakSet();
${MARKER}
const validatedDatabasePaths = /* @__PURE__ */ new Map();
function sharesCanonicalValidationByPath(database) {
	return typeof database.path === "string" && database.path !== "" && database.path !== ":memory:" && process.env.OPENCLAW_CANONICAL_SCAN_PATH_CACHE !== "0";
}
`,
    'validated handle set',
  );
  out = replaceExactlyOnce(
    out,
    `	validatedDatabases.add(database.db);
	return count;
}
function assertCanonicalSqliteSessionKeysCurrent(database, mainKey) {
	if (!validatedDatabases.has(database.db)) scanCanonicalSqliteSessionEntries(database, void 0, mainKey);
}`,
    `	validatedDatabases.add(database.db);
	if (sharesCanonicalValidationByPath(database)) validatedDatabasePaths.set(database.path, canonicalMainKey);
	return count;
}
function assertCanonicalSqliteSessionKeysCurrent(database, mainKey) {
	if (validatedDatabases.has(database.db)) return;
	if (sharesCanonicalValidationByPath(database) && validatedDatabasePaths.has(database.path)) {
		const storedMainKey = executeSqliteQueryTakeFirstSync(database.db, getNodeSqliteKysely(database.db).selectFrom("session_key_contract").select("main_key").where("id", "=", 1))?.main_key;
		if (validatedDatabasePaths.get(database.path) === normalizeMainKey(mainKey ?? storedMainKey)) {
			validatedDatabases.add(database.db);
			return;
		}
	}
	scanCanonicalSqliteSessionEntries(database, void 0, mainKey);
}`,
    'scan end and assert',
  );
  out = replaceExactlyOnce(
    out,
    `		updated_at: Date.now()
	})));
	validatedDatabases.delete(database.db);
}`,
    `		updated_at: Date.now()
	})));
	validatedDatabases.delete(database.db);
	if (typeof database.path === "string") validatedDatabasePaths.delete(database.path);
}`,
    'main key change',
  );
  return out;
}
