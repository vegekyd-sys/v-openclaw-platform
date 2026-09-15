import { i as getNodeSqliteKysely, n as executeSqliteQuerySync } from "./kysely-sync-DKYGT267.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { n as sqliteSessionStateDeleteSnapshotsEqual, t as readSessionStateDeleteSnapshot } from "./session-accessor.sqlite-delete-snapshot-D_8sMB0n.js";
import { i as publishEncodedSessionTranscriptArchive, n as hashSessionArchiveBytes, o as resolveSqliteTranscriptArchivePath, t as MAX_MATERIALIZED_ARCHIVE_BATCH_BYTES } from "./session-accessor.sqlite-archive-CuBPV-IT.js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import zlib from "node:zlib";
import { Transform } from "node:stream";
import { parentPort, workerData } from "node:worker_threads";
import { pipeline as pipeline$1 } from "node:stream/promises";
//#region src/config/sessions/session-accessor.sqlite-archive.worker.ts
/** Worker entrypoint for SQLite transcript archive materialization off the gateway event loop. */
function isSqliteTranscriptArchiveWorkerData(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value) && value.type === "sqlite-transcript-archive-v2";
}
function parsePublishWorkerPlans(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const plans = value.plans;
	if (!Array.isArray(plans)) return;
	const parsed = [];
	for (const planValue of plans) {
		if (!planValue || typeof planValue !== "object" || Array.isArray(planValue)) return;
		const plan = planValue;
		if (typeof plan.agentId !== "string" || typeof plan.archiveDirectory !== "string" || typeof plan.databasePath !== "string" || typeof plan.generation !== "string" || typeof plan.sessionId !== "string") return;
		parsed.push({
			agentId: plan.agentId,
			archiveDirectory: plan.archiveDirectory,
			databasePath: plan.databasePath,
			generation: plan.generation,
			sessionId: plan.sessionId
		});
	}
	return parsed;
}
function parseSessionStateDeleteSnapshot(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const snapshot = value;
	if (typeof snapshot.acpParentStreamEventCount !== "number" || snapshot.generation !== null && typeof snapshot.generation !== "string" || snapshot.lastSeq !== null && typeof snapshot.lastSeq !== "number" || snapshot.sessionKey !== null && typeof snapshot.sessionKey !== "string" || snapshot.sessionUpdatedAt !== null && typeof snapshot.sessionUpdatedAt !== "number" || snapshot.trajectoryLastSeq !== null && typeof snapshot.trajectoryLastSeq !== "number" || snapshot.transcriptUpdatedAt !== null && typeof snapshot.transcriptUpdatedAt !== "number") return null;
	return {
		acpParentStreamEventCount: snapshot.acpParentStreamEventCount,
		generation: snapshot.generation,
		lastSeq: snapshot.lastSeq,
		sessionKey: snapshot.sessionKey,
		sessionUpdatedAt: snapshot.sessionUpdatedAt,
		trajectoryLastSeq: snapshot.trajectoryLastSeq,
		transcriptUpdatedAt: snapshot.transcriptUpdatedAt
	};
}
function parseWorkerPlans(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const plans = value.plans;
	if (!Array.isArray(plans)) return;
	const parsed = [];
	for (const planValue of plans) {
		if (!planValue || typeof planValue !== "object" || Array.isArray(planValue)) return;
		const plan = planValue;
		const snapshot = parseSessionStateDeleteSnapshot(plan.snapshot);
		if (typeof plan.agentId !== "string" || typeof plan.archiveDirectory !== "string" || typeof plan.databasePath !== "string" || plan.reason !== "deleted" && plan.reason !== "reset" || typeof plan.sessionId !== "string" || !snapshot) return;
		parsed.push({
			agentId: plan.agentId,
			archiveDirectory: plan.archiveDirectory,
			databasePath: plan.databasePath,
			reason: plan.reason,
			sessionId: plan.sessionId,
			snapshot
		});
	}
	return parsed;
}
function stageTranscriptArchiveContent(database, sessionId, stagedPath) {
	const fd = fs.openSync(stagedPath, "wx", 384);
	let rowCount = 0;
	try {
		const rows = database.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq ASC").iterate(sessionId);
		for (const row of rows) {
			if (typeof row.event_json !== "string") throw new Error(`Invalid transcript event row for ${sessionId}`);
			fs.writeFileSync(fd, row.event_json);
			fs.writeFileSync(fd, "\n");
			rowCount += 1;
		}
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
	return rowCount;
}
function createArchiveByteLimitTransform() {
	let encodedBytes = 0;
	return new Transform({ transform(chunk, encoding, callback) {
		let chunkBytes;
		if (typeof chunk === "string") chunkBytes = Buffer.byteLength(chunk, encoding);
		else if (chunk instanceof Uint8Array) chunkBytes = chunk.byteLength;
		else {
			callback(/* @__PURE__ */ new TypeError("Archive encoder emitted an unsupported chunk type"));
			return;
		}
		encodedBytes += chunkBytes;
		if (encodedBytes > 268435456) {
			callback(/* @__PURE__ */ new Error(`Archive exceeds ${MAX_MATERIALIZED_ARCHIVE_BATCH_BYTES} bytes during encoding`));
			return;
		}
		callback(null, chunk);
	} });
}
async function encodeStagedTranscriptArchive(params) {
	const createdAt = Date.now();
	const createZstdCompress = zlib.createZstdCompress;
	const compressed = typeof createZstdCompress === "function";
	const archivePath = `${resolveSqliteTranscriptArchivePath({
		archiveDirectory: params.archiveDirectory,
		generation: params.generation,
		identityOwner: "registry",
		reason: params.reason,
		sessionId: params.sessionId,
		nowMs: createdAt
	})}${compressed ? ".zst" : ""}`;
	const encodedPath = `${archivePath}.${randomUUID()}.stage`;
	try {
		if (compressed) await pipeline$1(fs.createReadStream(params.stagedPath), createZstdCompress.call(zlib), createArchiveByteLimitTransform(), fs.createWriteStream(encodedPath, {
			flags: "wx",
			mode: 384
		}));
		else await pipeline$1(fs.createReadStream(params.stagedPath), createArchiveByteLimitTransform(), fs.createWriteStream(encodedPath, {
			flags: "wx",
			mode: 384
		}));
		const bytes = fs.readFileSync(encodedPath);
		return {
			archiveName: path.basename(archivePath),
			bytes,
			createdAt,
			encoding: compressed ? "zstd" : "identity",
			sha256: hashSessionArchiveBytes(bytes)
		};
	} finally {
		fs.rmSync(encodedPath, { force: true });
	}
}
async function materializeTranscriptArchiveInWorker(plan) {
	fs.mkdirSync(plan.archiveDirectory, {
		recursive: true,
		mode: 448
	});
	const stagedPath = `${resolveSqliteTranscriptArchivePath({
		archiveDirectory: plan.archiveDirectory,
		generation: plan.snapshot.generation ?? void 0,
		identityOwner: "registry",
		reason: plan.reason,
		sessionId: plan.sessionId
	})}.${randomUUID()}.jsonl-stage`;
	try {
		const opened = withOpenClawAgentDatabaseReadOnly((database) => {
			let transactionOpen = false;
			try {
				// The read-only initialization cache may already own a snapshot.
				// Preserve its ownership; close() releases that transaction.
				if (!database.db.isTransaction) {
					database.db.exec("BEGIN");
					transactionOpen = true;
				}
				const snapshot = readSessionStateDeleteSnapshot(database.db, plan.sessionId);
				if (!sqliteSessionStateDeleteSnapshotsEqual(snapshot, plan.snapshot)) throw new Error(`SQLite session state changed before archive materialization for ${plan.sessionId}`);
				const rowCount = stageTranscriptArchiveContent(database.db, plan.sessionId, stagedPath);
				if (transactionOpen) {
					database.db.exec("COMMIT");
					transactionOpen = false;
				}
				return {
					rowCount,
					snapshot
				};
			} catch (error) {
				if (transactionOpen) database.db.exec("ROLLBACK");
				throw error;
			}
		}, {
			agentId: plan.agentId,
			path: plan.databasePath
		});
		if (!opened.found) throw new Error(`Cannot archive SQLite transcript ${plan.sessionId}: ${opened.reason.replaceAll("-", " ")}`);
		const generation = plan.snapshot.generation;
		if (opened.value.rowCount > 0 && !generation) throw new Error(`Cannot archive SQLite transcript without a generation for ${plan.sessionId}`);
		return {
			archive: opened.value.rowCount > 0 && generation ? await encodeStagedTranscriptArchive({
				archiveDirectory: plan.archiveDirectory,
				generation,
				reason: plan.reason,
				sessionId: plan.sessionId,
				stagedPath
			}) : null,
			sessionId: plan.sessionId
		};
	} finally {
		fs.rmSync(stagedPath, { force: true });
	}
}
function publishTranscriptArchiveInWorker(plan) {
	try {
		const opened = withOpenClawAgentDatabaseReadOnly((database) => {
			const db = getNodeSqliteKysely(database.db);
			return executeSqliteQuerySync(database.db, db.selectFrom("session_transcript_archives").select([
				"archive_blob",
				"archive_name",
				"archive_sha256"
			]).where("session_id", "=", plan.sessionId).where("generation", "=", plan.generation)).rows[0];
		}, {
			agentId: plan.agentId,
			path: plan.databasePath
		});
		if (!opened.found || !opened.value) throw new Error(`Canonical SQLite transcript archive is missing for ${plan.sessionId}`);
		if (hashSessionArchiveBytes(opened.value.archive_blob) !== opened.value.archive_sha256) throw new Error(`Canonical SQLite transcript archive is corrupt for ${plan.sessionId}`);
		return {
			archivedPath: publishEncodedSessionTranscriptArchive({
				archiveDirectory: plan.archiveDirectory,
				archiveName: opened.value.archive_name,
				bytes: opened.value.archive_blob,
				sha256: opened.value.archive_sha256
			}),
			generation: plan.generation,
			sessionId: plan.sessionId
		};
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			generation: plan.generation,
			sessionId: plan.sessionId
		};
	}
}
async function runWorkerPort(port, plans) {
	let materializedBytes = 0;
	for (const plan of plans) {
		const result = await materializeTranscriptArchiveInWorker(plan);
		materializedBytes += result.archive?.bytes.byteLength ?? 0;
		if (materializedBytes > 268435456) throw new Error(`Archive batch exceeds ${MAX_MATERIALIZED_ARCHIVE_BATCH_BYTES} bytes; use fewer sessions`);
		port.postMessage({
			type: "done",
			results: [result]
		});
	}
	port.close();
}
function runPublishWorkerPort(port, plans) {
	const results = plans.map((plan) => publishTranscriptArchiveInWorker(plan));
	port.postMessage({
		type: "published",
		results
	});
	port.close();
}
if (isSqliteTranscriptArchiveWorkerData(workerData)) {
	if (!parentPort) throw new Error("SQLite transcript archive worker requires a parent port");
	const operation = workerData.operation;
	if (operation === "materialize") {
		const plans = parseWorkerPlans(workerData);
		if (!plans) throw new Error("SQLite transcript archive worker requires valid materialization data");
		await runWorkerPort(parentPort, plans);
	} else if (operation === "publish") {
		const plans = parsePublishWorkerPlans(workerData);
		if (!plans) throw new Error("SQLite transcript archive worker requires valid publication data");
		runPublishWorkerPort(parentPort, plans);
	} else throw new Error("SQLite transcript archive worker requires a supported operation");
}
//#endregion
export { materializeTranscriptArchiveInWorker, publishTranscriptArchiveInWorker };
