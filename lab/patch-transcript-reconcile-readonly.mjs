import assert from 'node:assert/strict';

// The transcript reconcile Worker opens the agent database read-only.
//
// sessions.transcript-index.prepare runs in a fresh worker thread
// (config/sessions/session-transcript-reconcile.worker.js) every time a session projection is
// rebuilt. The Worker opened the database with openOpenClawAgentDatabase, the writer's open path:
// a new thread has an empty validation cache, so every open ran the db91 verification and then
// ensureAgentSchema inside BEGIN IMMEDIATE (no operation label). On V that write transaction held
// the process-wide writer for ~1.2 s (p50 1161 ms, max 4232 ms) immediately before 264 of 287
// prepare runs on 2026-10-12/13, and the projection stayed dirty for that long too.
//
// The Worker only reads: listSessionsNeedingTranscriptIndexReconcile and
// prepareSessionTranscriptProjection; the claim, row chunks and finalize are written by the parent
// through its own (already validated) handle. Upstream made the same change in 2026.9.5 (#138585):
// claim the agent database lease, then openOpenClawAgentDatabaseReadOnly. Here the Worker claims
// the same lease, opens a read-only connection, checks the schema version and owner the writer
// open would check, and releases the lease when done. If any of that fails it uses the original
// open, so the outcome can only differ in how the Worker connects.

export const TRANSCRIPT_RECONCILE_READONLY_MARKER = '// transcript-reconcile-readonly-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const IMPORT_BEFORE = 'import { parentPort, workerData } from "node:worker_threads";\n';
const IMPORT_AFTER = `${IMPORT_BEFORE}import { DatabaseSync } from "node:sqlite";
import { n as normalizeAgentId } from "../../agent-id-CeT3w4ap.js";
import { t as enableNodeSqliteKyselyStatementCache } from "../../kysely-sync-DKYGT267.js";
import { X as releaseOpenClawAgentDatabaseLease, Y as claimOpenClawAgentDatabaseLease, d as assertSupportedAgentSchemaVersion, f as readExistingAgentSchemaMeta, l as assertExistingAgentSchemaOwner } from "../../openclaw-agent-db-maintenance-DYSkzMMg.js";
`;

const HELPER_ANCHOR = 'async function run() {\n';
const HELPER = `${TRANSCRIPT_RECONCILE_READONLY_MARKER}: this Worker only reads, so it does not take the writer's open path
// (db91 verification + ensureAgentSchema under BEGIN IMMEDIATE in every new thread). Upstream 2026.9.5 #138585.
const RECONCILE_AGENT_SCHEMA_VERSION = 19;
function openReconcileDatabaseReadOnly(input) {
	let leaseId;
	let db;
	try {
		leaseId = claimOpenClawAgentDatabaseLease({ agentId: input.agentId, path: input.path });
		db = new DatabaseSync(input.path, { readOnly: true });
		db.exec("PRAGMA busy_timeout = 5000;");
		if (assertSupportedAgentSchemaVersion(db, input.path) !== RECONCILE_AGENT_SCHEMA_VERSION) throw new Error("agent database schema is not current");
		const meta = readExistingAgentSchemaMeta(db);
		if (!meta) throw new Error("agent database has no schema owner");
		assertExistingAgentSchemaOwner(meta, normalizeAgentId(input.agentId), input.path);
		enableNodeSqliteKyselyStatementCache(db);
		const opened = db;
		const lease = leaseId;
		return {
			db: opened,
			close: () => {
				try {
					opened.close();
				} finally {
					releaseOpenClawAgentDatabaseLease(lease);
				}
			}
		};
	} catch {
		try {
			db?.close();
		} catch {}
		if (leaseId) try {
			releaseOpenClawAgentDatabaseLease(leaseId);
		} catch {}
		return;
	}
}
`;

const OPEN_BEFORE = `	let terminalMessage;
	try {
		const database = openOpenClawAgentDatabase({
			agentId: reconcileInput.agentId,
			path: reconcileInput.path
		});
`;
const OPEN_AFTER = `	let terminalMessage;
	let readOnlyDatabase;
	try {
		readOnlyDatabase = openReconcileDatabaseReadOnly(reconcileInput);
		const database = readOnlyDatabase ?? openOpenClawAgentDatabase({
			agentId: reconcileInput.agentId,
			path: reconcileInput.path
		});
`;

const CLOSE_BEFORE = `	try {
		closeOpenClawAgentDatabaseByPath(reconcileInput.path);
		port.postMessage(terminalMessage);
`;
const CLOSE_AFTER = `	try {
		if (readOnlyDatabase) readOnlyDatabase.close();
		else closeOpenClawAgentDatabaseByPath(reconcileInput.path);
		port.postMessage(terminalMessage);
`;

export function patchTranscriptReconcileReadOnly(source) {
  assert(!source.includes(TRANSCRIPT_RECONCILE_READONLY_MARKER), 'Already patched');
  let next = replaceExactlyOnce(source, IMPORT_BEFORE, IMPORT_AFTER, 'worker_threads import');
  next = replaceExactlyOnce(next, HELPER_ANCHOR, HELPER + HELPER_ANCHOR, 'run()');
  next = replaceExactlyOnce(next, OPEN_BEFORE, OPEN_AFTER, 'database open');
  next = replaceExactlyOnce(next, CLOSE_BEFORE, CLOSE_AFTER, 'database close');
  return next;
}
