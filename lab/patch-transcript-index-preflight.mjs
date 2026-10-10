import assert from 'node:assert/strict';

// Transcript index preflight without a full-table scan under the Agent DB writer.
//
// reconcileSessionTranscriptIndexesAsProcessOwner opened a write transaction
// ("sessions.transcript-index.preflight") and, inside it, ran three
//   DELETE FROM {active_events|fts|index_state} WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)
// plus listSessionsNeedingTranscriptIndexReconcile, all synchronously on the Gateway main
// thread. session_transcript_fts keeps session_id UNINDEXED, so the FTS delete reads the
// whole content table. On V's makaron database that held the process-wide writer for
// 9975 / 10166 / 9275 ms on 2026-10-08, and replies waiting behind it failed with
// "Agent DB process coordinator wait exceeded 5000ms". The same sweep ran again at the end
// of every reconcile ("sessions.transcript-index.orphan-sweep").
//
// Now a short-lived worker thread reads the same facts on its own read-only connection in
// one read transaction: the orphaned owners of each index table (no transcript row left),
// the FTS rowids of those owners, and whether any session needs reconcile (the native
// listSessionsNeedingTranscriptIndexReconcile, imported from the same chunk). Neither the
// writer nor the main thread is held while it reads. Orphans are usually absent and then no
// write transaction is opened at all. When there are some, each write transaction first
// re-checks that the owner still has no transcript row, then deletes at most
// ORPHAN_DELETE_CHUNK_ROWS rows per table by indexed key (FTS by rowid). If the worker
// cannot run, the original in-transaction sweep runs instead.

export const TRANSCRIPT_INDEX_PREFLIGHT_MARKER = '// transcript-index-preflight-readonly-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const HELPERS = `${TRANSCRIPT_INDEX_PREFLIGHT_MARKER}: orphan and dirty-session reads run on a worker's read-only connection
const ORPHAN_DELETE_CHUNK_ROWS = 512;
const PREFLIGHT_SCAN_SOURCE = \`
const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
(async () => {
	const index = await import(workerData.indexUrl);
	const db = new DatabaseSync(workerData.path, { readOnly: true });
	try {
		db.exec("PRAGMA busy_timeout = 30000");
		db.exec("BEGIN");
		try {
			const owners = new Map();
			const owner = (sessionId) => {
				let rowids = owners.get(sessionId);
				if (!rowids) owners.set(sessionId, rowids = []);
				return rowids;
			};
			for (const row of db.prepare("SELECT st.session_id AS session_id FROM session_transcript_index_state st WHERE NOT EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = st.session_id)").iterate()) owner(row.session_id);
			for (const row of db.prepare("SELECT DISTINCT a.session_id AS session_id FROM session_transcript_active_events a WHERE NOT EXISTS (SELECT 1 FROM transcript_events t WHERE t.session_id = a.session_id)").iterate()) owner(row.session_id);
			const ftsOwners = new Map();
			for (const row of db.prepare("SELECT rowid AS id, session_id FROM session_transcript_fts").iterate()) {
				if (row.session_id === null) continue;
				let rowids = ftsOwners.get(row.session_id);
				if (!rowids) ftsOwners.set(row.session_id, rowids = []);
				rowids.push(row.id);
			}
			const transcriptExists = db.prepare("SELECT 1 AS present FROM transcript_events WHERE session_id = ? LIMIT 1");
			for (const [sessionId, rowids] of ftsOwners) if (transcriptExists.get(sessionId) === undefined) owner(sessionId).push(...rowids);
			const needsReconcile = workerData.needs ? index.o(db).length > 0 : false;
			parentPort.postMessage({
				type: "done",
				orphans: [...owners].map(([sessionId, ftsRowids]) => ({ sessionId, ftsRowids })),
				needsReconcile,
				ftsRows: [...ftsOwners.values()].reduce((sum, rowids) => sum + rowids.length, 0)
			});
		} finally {
			db.exec("ROLLBACK");
		}
	} finally {
		db.close();
	}
})().catch((error) => {
	parentPort.postMessage({ type: "failed", error: String(error && error.stack || error) });
});
\`;
function scanTranscriptIndexPreflight(databasePath, needs) {
	return new Promise((resolve, reject) => {
		let worker;
		try {
			worker = new Worker(PREFLIGHT_SCAN_SOURCE, {
				eval: true,
				workerData: {
					indexUrl: new URL("./session-transcript-index-9itOio9h.js", import.meta.url).href,
					needs,
					path: databasePath
				}
			});
		} catch (error) {
			reject(toStringifiedError(error));
			return;
		}
		let settled = false;
		const settle = (finish) => {
			if (settled) return;
			settled = true;
			worker.removeAllListeners();
			worker.terminate().then(finish, finish);
		};
		worker.once("message", (message) => {
			settle(() => message?.type === "done" ? resolve(message) : reject(new Error(message?.error ?? "session transcript index preflight scan sent no result")));
		});
		worker.once("error", (error) => {
			settle(() => reject(toStringifiedError(error)));
		});
		worker.once("exit", (code) => {
			settle(() => reject(/* @__PURE__ */ new Error(\`session transcript index preflight scan exited with code \${code}\`)));
		});
	});
}
/** Deletes one bounded chunk of a still-orphaned owner's index rows by indexed key. */
function deleteOrphanedTranscriptIndexChunkInTransaction(db, sessionId, ftsRowids, lastFtsChunk) {
	if (db.prepare("SELECT 1 AS present FROM transcript_events WHERE session_id = ? LIMIT 1").get(sessionId) !== void 0) return { deleted: 0, finished: true };
	const active = Number(db.prepare("DELETE FROM session_transcript_active_events WHERE rowid IN (SELECT rowid FROM session_transcript_active_events WHERE session_id = ? LIMIT ?)").run(sessionId, ORPHAN_DELETE_CHUNK_ROWS).changes);
	const deleteFts = db.prepare("DELETE FROM session_transcript_fts WHERE rowid = ? AND session_id = ?");
	let fts = 0;
	for (const rowid of ftsRowids) fts += Number(deleteFts.run(rowid, sessionId).changes);
	const finished = active < ORPHAN_DELETE_CHUNK_ROWS && lastFtsChunk;
	const state = finished ? Number(db.prepare("DELETE FROM session_transcript_index_state WHERE session_id = ?").run(sessionId).changes) : 0;
	return { deleted: active + fts + state, finished };
}
async function deleteOrphanedTranscriptIndexRows(databaseOptions, operationLabel, orphans) {
	let deleted = 0;
	for (const orphan of orphans) {
		let offset = 0;
		while (true) {
			const ftsRowids = orphan.ftsRowids.slice(offset, offset + ORPHAN_DELETE_CHUNK_ROWS);
			offset += ftsRowids.length;
			const chunk = await runProjectionWrite(databaseOptions, operationLabel, (database) => deleteOrphanedTranscriptIndexChunkInTransaction(database.db, orphan.sessionId, ftsRowids, offset >= orphan.ftsRowids.length));
			deleted += chunk.deleted;
			await yieldToGateway();
			if (chunk.finished) break;
		}
	}
	return deleted;
}
/** Same result as the in-transaction orphan sweep plus dirty-session check, without a full scan under the writer. */
async function runTranscriptIndexPreflight(databaseOptions, operationLabel, needs) {
	const startedAt = performance.now();
	let scan;
	try {
		scan = await scanTranscriptIndexPreflight(databaseOptions.path, needs);
	} catch (error) {
		log.warn(\`session transcript index preflight scan failed; sweeping inside the write transaction agent=\${databaseOptions.agentId} error=\${error instanceof Error ? error.message : String(error)}\`);
		return await runProjectionWrite(databaseOptions, operationLabel, (database) => {
			deleteOrphanedTranscriptIndexRowsInTransaction(database.db);
			return needs ? listSessionsNeedingTranscriptIndexReconcile(database.db).length > 0 : false;
		});
	}
	const scanMs = Math.round(performance.now() - startedAt);
	if (scan.orphans.length > 0) {
		const deleted = await deleteOrphanedTranscriptIndexRows(databaseOptions, operationLabel, scan.orphans);
		log.info(\`session transcript index orphans removed agent=\${databaseOptions.agentId} operation=\${operationLabel} sessions=\${scan.orphans.length} rows=\${deleted} scanMs=\${scanMs}\`);
	} else log.debug(\`session transcript index preflight agent=\${databaseOptions.agentId} operation=\${operationLabel} orphans=0 needsReconcile=\${scan.needsReconcile} ftsRows=\${scan.ftsRows} scanMs=\${scanMs}\`);
	return scan.needsReconcile;
}
/** Prepares full trees off-thread, then commits bounded chunks through the runtime writer owner. */`;

export function patchTranscriptIndexPreflight(source) {
  assert(!source.includes(TRANSCRIPT_INDEX_PREFLIGHT_MARKER), 'transcript index preflight patch is already applied');
  let out = replaceExactlyOnce(
    source,
    '/** Prepares full trees off-thread, then commits bounded chunks through the runtime writer owner. */',
    HELPERS,
    'reconcile owner doc comment',
  );
  out = replaceExactlyOnce(
    out,
    '\tif (!await runProjectionWrite(databaseOptions, "sessions.transcript-index.preflight", (database) => {\n' +
      '\t\tdeleteOrphanedTranscriptIndexRowsInTransaction(database.db);\n' +
      '\t\treturn listSessionsNeedingTranscriptIndexReconcile(database.db).length > 0;\n' +
      '\t})) return { reconciledSessions: 0 };\n',
    '\tif (!await runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.preflight", true)) return { reconciledSessions: 0 };\n',
    'preflight write transaction',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\t\tawait runProjectionWrite(databaseOptions, "sessions.transcript-index.orphan-sweep", (database) => deleteOrphanedTranscriptIndexRowsInTransaction(database.db));\n',
    '\t\t\t\t\tawait runTranscriptIndexPreflight(databaseOptions, "sessions.transcript-index.orphan-sweep", false);\n',
    'orphan sweep write transaction',
  );
  return out;
}
