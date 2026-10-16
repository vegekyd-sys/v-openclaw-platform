import assert from 'node:assert/strict';

export const MARKER = 'transcript-index-rowid-window-v1';

export function patchIndex(source) {
  assert(!source.includes(MARKER), 'rowid window already applied');
  const before = '\tconst fts = Number(executeSqliteQuerySync(db, kysely.deleteFrom("session_transcript_fts").where("rowid", "in", kysely.selectFrom("session_transcript_fts").select("rowid").where("session_id", "=", params.sessionId).limit(params.maxRowsPerTable))).numAffectedRows ?? 0n);';
  assert.equal(source.split(before).length, 2, 'expected one prepared FTS delete');
  return source.replace(before, `\t// ${MARKER}: session_id is UNINDEXED in FTS5. Bound rows scanned,
\t// not just rows deleted, and carry the cursor across this claim's chunks.
\t// Older callers without a cursor retain the original deletion contract.
\tif (Object.hasOwn(params, "ftsAfterRowid")) {
\t\tconst scan = db.prepare(params.ftsAfterRowid === null
\t\t\t? "SELECT rowid AS id, session_id FROM session_transcript_fts ORDER BY rowid ASC LIMIT ?"
\t\t\t: "SELECT rowid AS id, session_id FROM session_transcript_fts WHERE rowid > ? ORDER BY rowid ASC LIMIT ?");
\t\tscan.setReadBigInts(true);
\t\tconst rows = params.ftsAfterRowid === null ? scan.all(params.maxRowsPerTable) : scan.all(params.ftsAfterRowid, params.maxRowsPerTable);
\t\tconst remove = db.prepare("DELETE FROM session_transcript_fts WHERE rowid = ? AND session_id = ?");
\t\tfor (const row of rows) if (row.session_id === params.sessionId) remove.run(row.id, params.sessionId);
\t\treturn {
\t\t\thasMore: active === params.maxRowsPerTable || rows.length === params.maxRowsPerTable,
\t\t\towned: true,
\t\t\tftsAfterRowid: rows.length > 0 ? rows[rows.length - 1].id : params.ftsAfterRowid
\t\t};
\t}
${before}`);
}

export function patchReconcile(source) {
  assert(!source.includes(MARKER), 'rowid window already applied');
  const before = '\tlet deleteResult = {\n\t\thasMore: true,\n\t\towned: true\n\t};';
  const call = '\t\t\tmaxRowsPerTable: PROJECTION_WRITE_CHUNK_ROWS,\n\t\t\tsessionId: plan.sessionId,';
  assert.equal(source.split(before).length, 2, 'expected one projection claim loop');
  assert.equal(source.split(call).length, 2, 'expected one projection delete call');
  return source.replace(before, `\t// ${MARKER}: cursor is private to this claim; a retry starts from the beginning.
\tlet deleteResult = {
\t\thasMore: true,
\t\towned: true,
\t\tftsAfterRowid: null
\t};`).replace(call, '\t\t\tftsAfterRowid: deleteResult.ftsAfterRowid,\n' + call);
}
