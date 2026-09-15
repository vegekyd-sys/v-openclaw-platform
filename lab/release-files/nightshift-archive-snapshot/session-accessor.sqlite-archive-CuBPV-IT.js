import { u as toStringifiedError } from "./error-coercion-CwcmpTBO.js";
import { _ as readSessionArchiveContentSync, h as encodeSessionArchiveContent, n as formatSessionArchiveTimestamp, p as SESSION_ARCHIVE_ZSTD_SUFFIX, s as isSessionArchiveArtifactName } from "./artifacts-DMDO9PHy.js";
import { t as KeyedAsyncQueue } from "./keyed-async-queue-CTreGrmR.js";
import { u as syncDirectoryBestEffortSync } from "./directory-durability-CRBtVf3G.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { n as sqliteSessionStateDeleteSnapshotsEqual, t as readSessionStateDeleteSnapshot } from "./session-accessor.sqlite-delete-snapshot-D_8sMB0n.js";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
//#region src/config/sessions/session-accessor.sqlite-archive.ts
const MAX_MATERIALIZED_ARCHIVE_BATCH_BYTES = 268435456;
const MAX_REGISTERED_ARCHIVE_SESSION_ID_BYTES = 96;
function resolveRegisteredArchiveSessionIdComponent(sessionId) {
	if (Buffer.byteLength(sessionId, "utf8") <= MAX_REGISTERED_ARCHIVE_SESSION_ID_BYTES) return sessionId;
	return `session-${createHash("sha256").update(sessionId).digest("hex")}`;
}
function resolveSqliteTranscriptArchivePath(params) {
	const archiveDirectory = path.resolve(params.archiveDirectory);
	const generationSuffix = params.generation ? `.${params.generation}` : "";
	const sessionIdComponent = params.identityOwner === "registry" ? resolveRegisteredArchiveSessionIdComponent(params.sessionId) : params.sessionId;
	const archivePath = path.resolve(archiveDirectory, `${sessionIdComponent}.jsonl.${params.reason}.${formatSessionArchiveTimestamp(params.nowMs)}${generationSuffix}`);
	if (path.dirname(archivePath) !== archiveDirectory) throw new Error(`Cannot archive SQLite transcript outside ${archiveDirectory}`);
	return archivePath;
}
function resolveRegisteredSqliteTranscriptArchiveName(params) {
	return path.basename(`${resolveSqliteTranscriptArchivePath({
		archiveDirectory: ".",
		generation: params.generation,
		identityOwner: "registry",
		reason: params.reason,
		sessionId: params.sessionId,
		nowMs: params.createdAt
	})}${params.encoding === "zstd" ? SESSION_ARCHIVE_ZSTD_SUFFIX : ""}`);
}
function findMatchingSqliteTranscriptArchive(params) {
	let entries;
	try {
		entries = fs.readdirSync(params.archiveDirectory);
	} catch {
		return null;
	}
	const prefix = `${params.sessionId}.jsonl.${params.reason}.`;
	for (const entry of entries) {
		if (!entry.startsWith(prefix) || !isSessionArchiveArtifactName(entry)) continue;
		const archivePath = path.join(params.archiveDirectory, entry);
		const compressed = entry.endsWith(SESSION_ARCHIVE_ZSTD_SUFFIX);
		try {
			const stat = fs.statSync(archivePath);
			if (!stat.isFile()) continue;
			if (!compressed && stat.size !== Buffer.byteLength(params.content, "utf8")) continue;
			if (readSessionArchiveContentSync(archivePath) === params.content) return archivePath;
		} catch {
			continue;
		}
	}
	return null;
}
/** Writes or reuses a transcript archive and returns its durable path. */
function writeTranscriptArchive(params) {
	fs.mkdirSync(params.archiveDirectory, { recursive: true });
	const existing = findMatchingSqliteTranscriptArchive(params);
	if (existing) return existing;
	const encoded = encodeSessionArchiveContent(params.content);
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const archivePath = `${resolveSqliteTranscriptArchivePath({
			archiveDirectory: params.archiveDirectory,
			identityOwner: "filename",
			reason: params.reason,
			sessionId: params.sessionId,
			nowMs: Date.now() + attempt
		})}${encoded.suffix}`;
		if (fs.existsSync(archivePath)) continue;
		const tempPath = `${archivePath}.${randomUUID()}.tmp`;
		try {
			writeDurableFileExclusive(tempPath, encoded.bytes);
			fs.renameSync(tempPath, archivePath);
			syncDirectoryBestEffortSync(params.archiveDirectory);
			if (readSessionArchiveContentSync(archivePath) !== params.content) {
				fs.rmSync(archivePath, { force: true });
				throw new Error(`SQLite transcript archive verification failed for ${params.sessionId}`);
			}
			return archivePath;
		} catch (error) {
			fs.rmSync(tempPath, { force: true });
			if (error?.code === "EEXIST") continue;
			throw error;
		}
	}
	throw new Error(`Could not create SQLite transcript archive for ${params.sessionId}`);
}
function writeDurableFileExclusive(filePath, content) {
	const fd = fs.openSync(filePath, "wx", 384);
	try {
		fs.writeFileSync(fd, content);
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
}
function hashSessionArchiveBytes(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}
/** Publishes one exact canonical archive without directory scans or replacement. */
function publishEncodedSessionTranscriptArchive(params) {
	const archiveDirectory = path.resolve(params.archiveDirectory);
	const archivePath = path.resolve(archiveDirectory, params.archiveName);
	if (path.dirname(archivePath) !== archiveDirectory || path.basename(archivePath) !== params.archiveName) throw new Error(`Cannot publish SQLite transcript archive outside ${archiveDirectory}`);
	fs.mkdirSync(archiveDirectory, {
		recursive: true,
		mode: 448
	});
	if (fs.existsSync(archivePath)) {
		if (hashSessionArchiveBytes(fs.readFileSync(archivePath)) !== params.sha256) throw new Error(`SQLite transcript archive collision for ${params.archiveName}`);
		return archivePath;
	}
	const tempPath = `${archivePath}.${randomUUID()}.tmp`;
	writeDurableFileExclusive(tempPath, Buffer.from(params.bytes));
	try {
		fs.linkSync(tempPath, archivePath);
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
	} finally {
		fs.rmSync(tempPath, { force: true });
	}
	syncDirectoryBestEffortSync(archiveDirectory);
	if (hashSessionArchiveBytes(fs.readFileSync(archivePath)) !== params.sha256) throw new Error(`SQLite transcript archive verification failed for ${params.archiveName}`);
	return archivePath;
}
function resolveSourceWorkerExecArgv() {
	const tsxApiUrl = import.meta.resolve("tsx/esm/api");
	const registerTsx = `import { register } from ${JSON.stringify(tsxApiUrl)}; register();`;
	return ["--import", `data:text/javascript,${encodeURIComponent(registerTsx)}`];
}
function spawnSqliteTranscriptArchiveWorker(params) {
	const workerUrl = new URL("./nightshift-session-archive.worker.js", import.meta.url);
	let worker;
	try {
		const sourceWorkerExecArgv = workerUrl.pathname.endsWith(".ts") ? resolveSourceWorkerExecArgv() : void 0;
		worker = new Worker(workerUrl, {
			workerData: params.workerData,
			execArgv: sourceWorkerExecArgv
		});
	} catch (error) {
		return Promise.reject(toStringifiedError(error));
	}
	return new Promise((resolve, reject) => {
		let results;
		let workerError;
		worker.on("message", (message) => {
			if (message.type === params.expectedMessageType) (results ??= []).push(...message.results);
		});
		worker.once("error", (error) => {
			workerError = toStringifiedError(error);
		});
		worker.once("exit", (code) => {
			worker.removeAllListeners();
			if (workerError) {
				reject(workerError);
				return;
			}
			if (code !== 0) {
				reject(/* @__PURE__ */ new Error(`SQLite transcript archive worker exited with code ${code}`));
				return;
			}
			if (!results) {
				reject(/* @__PURE__ */ new Error("SQLite transcript archive worker exited without results"));
				return;
			}
			resolve(results);
		});
	});
}
const sqliteTranscriptArchiveWorkerQueue = new KeyedAsyncQueue();
const SQLITE_TRANSCRIPT_ARCHIVE_WORKER_QUEUE_KEY = "lifecycle-archive";
function runSqliteTranscriptArchiveWorker(plans) {
	return sqliteTranscriptArchiveWorkerQueue.enqueue(SQLITE_TRANSCRIPT_ARCHIVE_WORKER_QUEUE_KEY, () => spawnSqliteTranscriptArchiveWorker({
		expectedMessageType: "done",
		workerData: {
			operation: "materialize",
			type: "sqlite-transcript-archive-v2",
			plans
		}
	}));
}
function runSqliteTranscriptArchivePublishWorker(plans) {
	return sqliteTranscriptArchiveWorkerQueue.enqueue(SQLITE_TRANSCRIPT_ARCHIVE_WORKER_QUEUE_KEY, () => spawnSqliteTranscriptArchiveWorker({
		expectedMessageType: "published",
		workerData: {
			operation: "publish",
			type: "sqlite-transcript-archive-v2",
			plans
		}
	}));
}
function validateEmptyTranscriptArchivePlan(plan) {
	const opened = withOpenClawAgentDatabaseReadOnly((database) => readSessionStateDeleteSnapshot(database.db, plan.sessionId), {
		agentId: plan.agentId,
		path: plan.databasePath
	});
	if (!opened.found) throw new Error(`Cannot archive SQLite transcript ${plan.sessionId}: ${opened.reason.replaceAll("-", " ")}`);
	if (!sqliteSessionStateDeleteSnapshotsEqual(opened.value, plan.snapshot)) throw new Error(`SQLite session state changed before archive materialization for ${plan.sessionId}`);
}
async function materializeSessionStateDeletePlans(plans) {
	const deduped = dedupeSqliteSessionStateDeletePlans(plans);
	const workerResults = [];
	const workerPlans = [];
	for (const archivePlan of deduped.filter((plan) => plan.archiveTranscript)) {
		if (archivePlan.snapshot.lastSeq === null) {
			validateEmptyTranscriptArchivePlan(archivePlan);
			workerResults.push({
				archive: null,
				sessionId: archivePlan.sessionId
			});
			continue;
		}
		workerPlans.push(archivePlan);
	}
	if (workerPlans.length > 0) workerResults.push(...await runSqliteTranscriptArchiveWorker(workerPlans));
	const resultBySessionId = new Map(workerResults.map((result) => [result.sessionId, result]));
	return deduped.map((plan) => {
		if (!plan.archiveTranscript) return Object.assign({}, plan, {
			archive: null,
			archivedTranscript: null
		});
		const result = resultBySessionId.get(plan.sessionId);
		if (!result) throw new Error(`SQLite transcript archive worker omitted ${plan.sessionId}`);
		const generation = plan.snapshot.generation;
		if (result.archive && !generation) throw new Error(`Cannot archive SQLite transcript without a generation for ${plan.sessionId}`);
		const archivedTranscript = result.archive && generation ? {
			generation,
			sessionId: plan.sessionId,
			archivedPath: path.join(plan.archiveDirectory, result.archive.archiveName),
			sourcePath: path.join(plan.archiveDirectory, `${plan.sessionId}.jsonl`)
		} : null;
		return Object.assign({}, plan, {
			archive: result.archive,
			archivedTranscript
		});
	});
}
function dedupeSqliteSessionStateDeletePlans(plans) {
	const deduped = /* @__PURE__ */ new Map();
	for (const plan of plans) {
		const existing = deduped.get(plan.sessionId);
		if (!existing) {
			deduped.set(plan.sessionId, plan);
			continue;
		}
		if (existing.agentId !== plan.agentId || existing.archiveDirectory !== plan.archiveDirectory || existing.databasePath !== plan.databasePath || existing.reason !== plan.reason || !sqliteSessionStateDeleteSnapshotsEqual(existing.snapshot, plan.snapshot)) throw new Error(`Conflicting SQLite transcript archive plans for ${plan.sessionId}`);
		if (!existing.archiveTranscript && plan.archiveTranscript) deduped.set(plan.sessionId, {
			...existing,
			archiveTranscript: true
		});
	}
	return [...deduped.values()];
}
//#endregion
export { resolveRegisteredSqliteTranscriptArchiveName as a, writeTranscriptArchive as c, publishEncodedSessionTranscriptArchive as i, hashSessionArchiveBytes as n, resolveSqliteTranscriptArchivePath as o, materializeSessionStateDeletePlans as r, runSqliteTranscriptArchivePublishWorker as s, MAX_MATERIALIZED_ARCHIVE_BATCH_BYTES as t };
