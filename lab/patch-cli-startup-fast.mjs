import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// hooks relay and other launcher commands start without the general CLI's cost.
//
// Codex waits on one cold relay process for every tool call. Reading a locator row and posting it takes
// 9.5 ms, yet the process loaded 1191 modules (0.38 s on V): a side-effect import of gateway method scopes
// for one constant (typebox) and Kysely for one SELECT. These two chunks drop both. Upstream imports the
// constant from operator-scopes too. The new dist/warning-filter.js dispatches the relay; see
// lab/cli-startup-fast.md.

export const MARKER = 'cli-startup-fast';
export const CLI = 'native-hook-relay-cli-DTqrikhm.js';
export const CLIENT = 'native-hook-relay-client-GFGIwlRq.js';
export const PREFLIGHT = 'warning-filter.js';
export const CLI_BEFORE_SHA = 'be7acfb87f02edfc92d139421a7695c606e3ece8b2060e0cdf3fea7a6c555846';
export const CLIENT_BEFORE_SHA = 'aa685524265913e9faf9293c9a39aa30bdf651834bf1303e71867163751e6081';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const CLI_IMPORT = 'import "./method-scopes-C3BvHJ95.js";\n';
const CLI_IMPORT_AFTER = `// ${MARKER}: gateway method scopes (typebox) are not needed for ADMIN_SCOPE.\n`;

const CLIENT_IMPORTS = `import "./errors-u9zSVTak.js";
import { h as clearNodeSqliteKyselyCacheForDatabase, t as openNodeSqliteDatabase } from "./node-sqlite-CL-d6drd.js";
import { i as getNodeSqliteKysely, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
`;
const CLIENT_IMPORTS_AFTER = `// ${MARKER}: the locator read below uses node:sqlite directly.\n`;
const CLIENT_VERSION_IMPORT = 'import { a as readSqliteUserVersion, n as createNewerSqliteSchemaVersionError } from "./sqlite-user-version-DkmzAA6V.js";\n';

const STORE = `function assertSupportedSchemaVersion(db, pathname) {
	const userVersion = readSqliteUserVersion(db);
	if (userVersion > 15) throw createNewerSqliteSchemaVersionError("OpenClaw state database", pathname, userVersion, 15);
}
/** Read one native relay locator without loading the shared-state writer lifecycle. */
function readNativeHookRelayClientBridgeRecord(params) {
	const pathname = path.resolve(params.stateDbPath ?? resolveOpenClawStateSqlitePath());
	const db = openNodeSqliteDatabase(pathname, { readOnly: true });
	try {
		db.exec(\`PRAGMA busy_timeout = \${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};\`);
		assertSupportedSchemaVersion(db, pathname);
		const query = getNodeSqliteKysely(db).selectFrom("native_hook_relay_bridges").selectAll().where("relay_id", "=", params.relayId);
		return readNativeHookRelayBridgeRecordRow(executeSqliteQueryTakeFirstSync(db, query));
	} finally {
		clearNodeSqliteKyselyCacheForDatabase(db);
		db.close();
	}
}
`;
const STORE_AFTER = `/** Read one native relay locator without loading the shared-state writer lifecycle. */
function readNativeHookRelayClientBridgeRecord(params) {
	const pathname = path.resolve(params.stateDbPath ?? resolveOpenClawStateSqlitePath());
	const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
	const db = new DatabaseSync(pathname, { readOnly: true });
	try {
		db.exec(\`PRAGMA busy_timeout = \${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};\`);
		const userVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
		if (userVersion > 15) throw new Error(\`OpenClaw state database \${pathname} has schema version \${userVersion}; this build supports up to 15\`);
		return readNativeHookRelayBridgeRecordRow(db.prepare("SELECT * FROM native_hook_relay_bridges WHERE relay_id = ?").get(params.relayId));
	} finally {
		db.close();
	}
}
`;

const once = (source, needle, what) => assert.equal(source.split(needle).length, 2, `Expected exactly one ${what}`);

export function patchRelayCli(source) {
  assert(!source.includes(MARKER), 'relay cli already patched');
  once(source, CLI_IMPORT, 'method scopes import');
  return source.replace(CLI_IMPORT, CLI_IMPORT_AFTER);
}
export function unpatchRelayCli(source) {
  once(source, CLI_IMPORT_AFTER, 'patched relay cli import');
  return source.replace(CLI_IMPORT_AFTER, CLI_IMPORT);
}
export function patchRelayClient(source) {
  assert(!source.includes(MARKER), 'relay client already patched');
  once(source, CLIENT_IMPORTS, 'sqlite helper imports');
  once(source, CLIENT_VERSION_IMPORT, 'user version import');
  once(source, STORE, 'locator read');
  return source.replace(CLIENT_IMPORTS, CLIENT_IMPORTS_AFTER).replace(CLIENT_VERSION_IMPORT, '').replace(STORE, STORE_AFTER);
}
export function unpatchRelayClient(source) {
  once(source, CLIENT_IMPORTS_AFTER, 'patched client imports');
  once(source, STORE_AFTER, 'patched locator read');
  const contract = 'import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";\n';
  once(source, contract, 'state contract import');
  return source.replace(CLIENT_IMPORTS_AFTER, CLIENT_IMPORTS).replace(contract, contract + CLIENT_VERSION_IMPORT).replace(STORE_AFTER, STORE);
}
