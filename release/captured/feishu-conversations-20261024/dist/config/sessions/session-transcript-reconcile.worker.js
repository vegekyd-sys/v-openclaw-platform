import { g as openOpenClawAgentDatabase, i as closeOpenClawAgentDatabaseByPath } from "../../openclaw-agent-db-CUTe8BX6.js";
import { g as prepareSessionTranscriptProjection, o as listSessionsNeedingTranscriptIndexReconcile, x as prepareIncrementalSessionTranscriptProjection } from "../../session-transcript-index-9itOio9h.js";
import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { n as normalizeAgentId } from "../../agent-id-CeT3w4ap.js";
import { t as enableNodeSqliteKyselyStatementCache } from "../../kysely-sync-DKYGT267.js";
import { X as releaseOpenClawAgentDatabaseLease, Y as claimOpenClawAgentDatabaseLease, d as assertSupportedAgentSchemaVersion, f as readExistingAgentSchemaMeta, l as assertExistingAgentSchemaOwner } from "../../openclaw-agent-db-maintenance-DYSkzMMg.js";
//#region src/config/sessions/session-transcript-reconcile.worker.ts
/** Worker entrypoint for transcript parsing and active-branch resolution only. */
// transcript-projection-fixed-cost-v1: listSessionsNeedingTranscriptIndexReconcile's predicate for one session
const LISTED_FOR_RECONCILE_SQL = "SELECT 1 AS present FROM session_windows w JOIN transcript_events latest ON latest.session_id = w.session_id AND latest.seq = (SELECT c.seq FROM transcript_events c WHERE c.session_id = w.session_id ORDER BY c.seq DESC LIMIT 1) LEFT JOIN session_transcript_index_state st ON st.session_id = w.session_id WHERE w.session_id = ? AND (coalesce(st.needs_rebuild, 1) != 0 OR latest.seq > coalesce(st.indexed_seq, -1) OR EXISTS (SELECT 1 FROM session_transcript_active_events p WHERE p.session_id = w.session_id AND p.context_eligible IS NULL))";
const ACTIVE_ROWS_PER_CHUNK = 512;
const FTS_ROWS_PER_CHUNK = 128;
const FTS_TEXT_BYTES_PER_CHUNK = 262144;
function parseWorkerInput(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const input = value;
	if (typeof input.agentId !== "string" || typeof input.path !== "string") return;
	if (input.preferredSessionId !== void 0 && typeof input.preferredSessionId !== "string") return;
	return {
		agentId: input.agentId,
		path: input.path,
		...typeof input.preferredSessionId === "string" ? { preferredSessionId: input.preferredSessionId } : {},
		...input.reusable === true ? { reusable: true } : {}
	};
}
function orderSessionIds(sessionIds, preferredSessionId) {
	if (!preferredSessionId || !sessionIds.includes(preferredSessionId)) return sessionIds;
	return [preferredSessionId, ...sessionIds.filter((sessionId) => sessionId !== preferredSessionId)];
}
const input = parseWorkerInput(workerData);
if (!parentPort || !input) throw new Error("session transcript reconcile worker requires valid worker data");
const port = parentPort;
const reconcileInput = input;
function waitForContinue() {
	return new Promise((resolve, reject) => {
		port.once("message", (message) => {
			if (message?.type !== "continue" || typeof message.accepted !== "boolean") {
				reject(/* @__PURE__ */ new Error("session transcript reconcile worker received an invalid command"));
				return;
			}
			resolve(message.accepted);
		});
	});
}
async function postAndWait(message, transferList = []) {
	port.postMessage(message, transferList);
	return await waitForContinue();
}
function encodeFtsChunk(rows) {
	const encoder = new TextEncoder();
	const encoded = rows.map((row) => ({
		bytes: encoder.encode(row.text),
		row
	}));
	const textBytes = new Uint8Array(encoded.reduce((total, entry) => total + entry.bytes.length, 0));
	let textByteOffset = 0;
	return {
		rows: encoded.map(({ bytes, row }) => {
			textBytes.set(bytes, textByteOffset);
			const result = {
				messageId: row.messageId,
				role: row.role,
				textByteLength: bytes.length,
				textByteOffset,
				timestamp: row.timestamp
			};
			textByteOffset += bytes.length;
			return result;
		}),
		textBytes
	};
}
function takeFtsChunkEnd(rows, start) {
	let bytes = 0;
	let end = start;
	while (end < rows.length && end - start < FTS_ROWS_PER_CHUNK) {
		const rowBytes = Buffer.byteLength(rows[end]?.text ?? "", "utf8");
		if (end > start && bytes + rowBytes > FTS_TEXT_BYTES_PER_CHUNK) break;
		bytes += rowBytes;
		end += 1;
	}
	return end;
}
async function streamPreparedProjection(plan) {
	const { activeRows, ftsRows, ...metadata } = plan;
	if (!await postAndWait({
		type: "plan-start",
		plan: metadata
	})) return;
	for (let offset = 0; offset < activeRows.length; offset += ACTIVE_ROWS_PER_CHUNK) if (!await postAndWait({
		type: "active-chunk",
		rows: activeRows.slice(offset, offset + ACTIVE_ROWS_PER_CHUNK),
		sessionId: plan.sessionId
	})) return;
	for (let offset = 0; offset < ftsRows.length;) {
		const end = takeFtsChunkEnd(ftsRows, offset);
		const chunk = encodeFtsChunk(ftsRows.slice(offset, end));
		if (!await postAndWait({
			type: "fts-chunk",
			chunk,
			sessionId: plan.sessionId
		}, [chunk.textBytes.buffer])) return;
		offset = end;
	}
	await postAndWait({
		type: "plan-finish",
		sessionId: plan.sessionId
	});
}
// transcript-reconcile-readonly-v1: this Worker only reads, so it does not take the writer's open path
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
async function run() {
	let terminalMessage;
	let readOnlyDatabase;
	try {
		readOnlyDatabase = openReconcileDatabaseReadOnly(reconcileInput);
		const database = readOnlyDatabase ?? openOpenClawAgentDatabase({
			agentId: reconcileInput.agentId,
			path: reconcileInput.path
		});
		const reconcileSession = async (sessionId) => {
			// transcript-projection-incremental-v1: a projection whose prefix is intact continues from it; anything else rebuilds in full
			const delta = prepareIncrementalSessionTranscriptProjection(database.db, sessionId);
			if (delta && await postAndWait({
				type: "delta-plan",
				plan: delta
			})) return;
			const plan = prepareSessionTranscriptProjection(database.db, sessionId);
			if (plan) await streamPreparedProjection(plan);
		};
		// transcript-projection-fixed-cost-v1: the preferred session, when listed, before the whole-database listing
		const preferredSessionId = currentPreferredSessionId;
		const preferredFirst = preferredSessionId !== void 0 && database.db.prepare(LISTED_FOR_RECONCILE_SQL).get(preferredSessionId) !== void 0;
		if (preferredFirst) await reconcileSession(preferredSessionId);
		const sessionIds = preferredFirst ? listSessionsNeedingTranscriptIndexReconcile(database.db).filter((sessionId) => sessionId !== preferredSessionId) : orderSessionIds(listSessionsNeedingTranscriptIndexReconcile(database.db), preferredSessionId);
		for (const sessionId of sessionIds) await reconcileSession(sessionId);
		terminalMessage = { type: "done" };
	} catch (error) {
		terminalMessage = {
			type: "failed",
			error: error instanceof Error ? error.message : String(error)
		};
	}
	if (readOnlyDatabase) readOnlyDatabase.close();
	else closeOpenClawAgentDatabaseByPath(reconcileInput.path);
	return terminalMessage;
}
// transcript-projection-fixed-cost-v1: a reusable Worker serves one pass per "run" command until its owner stops it
let currentPreferredSessionId = reconcileInput.preferredSessionId;
function waitForRun() {
	return new Promise((resolve) => {
		port.once("message", (message) => {
			resolve(message?.type === "run" && (message.preferredSessionId === void 0 || typeof message.preferredSessionId === "string") ? message : void 0);
		});
	});
}
async function serve() {
	try {
		while (true) {
			const terminalMessage = await run();
			port.postMessage(terminalMessage);
			if (reconcileInput.reusable !== true || terminalMessage.type !== "done") return;
			const next = await waitForRun();
			if (!next) return;
			currentPreferredSessionId = next.preferredSessionId;
		}
	} finally {
		port.close();
	}
}
serve();
//#endregion
export {};
