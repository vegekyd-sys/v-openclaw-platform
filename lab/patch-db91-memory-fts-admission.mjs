import assert from 'node:assert/strict';

const bodyAnchor = '\tif (process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1" && !params.db.isTransaction) return runSqliteImmediateTransactionSync(params.db, () => ensureMemoryChunkFtsSchema(params), {operationLabel: "memory.fts.ensure-body", databaseLabel: "memory index"});';
const pathAnchor = '\tif (process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1" && !params.db.isTransaction) return runSqliteImmediateTransactionSync(params.db, () => ensureMemoryPathFtsSchema(params), {operationLabel: "memory.fts.ensure-path", databaseLabel: "memory index"});';
const helperAnchor = '/** Remove only derived FTS state whose persisted schema no longer matches. */';

const helpers = `/** Return whether a schema reconciliation can change persisted FTS state. */
function memoryFtsTableNeedsReconcile(params) {
\tconst status = ftsTableMatchesSchema(params);
\tif (status !== "matching") return true;
\tif (params.db.prepare(\`SELECT 1 AS found FROM \${params.tableName} LIMIT 1\`).get()?.found === 1) return false;
\treturn params.db.prepare(\`SELECT 1 AS found FROM \${params.sourceTable} LIMIT 1\`).get()?.found === 1;
}
function memoryPathFtsTriggersNeedReconcile(db) {
\tconst names = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'memory_index_paths_fts_after_%'").all().map((row) => row.name));
\treturn MEMORY_PATH_FTS_TRIGGER_DEFINITIONS.some((trigger) => !names.has(trigger.name));
}
`;

const bodyAdmission = `\tif (process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1") {
\t\tconst needsReconcile = memoryFtsTableNeedsReconcile({
\t\t\tdb: params.db,
\t\t\ttableName: params.ftsTable,
\t\t\tsourceTable: MEMORY_INDEX_CHUNKS_TABLE,
\t\t\texpectedColumns: ["text", "id", "path", "source", "model", "start_line", "end_line"],
\t\t\ttokenizeClause: params.tokenizeClause
\t\t});
\t\tif (!needsReconcile) return;
\t\tif (!params.db.isTransaction) return runSqliteImmediateTransactionSync(params.db, () => ensureMemoryChunkFtsSchema(params), {operationLabel: "memory.fts.ensure-body", databaseLabel: "memory index"});
\t}`;

const pathAdmission = `\tif (process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE === "1") {
\t\tconst needsReconcile = memoryFtsTableNeedsReconcile({
\t\t\tdb: params.db,
\t\t\ttableName: MEMORY_INDEX_PATHS_FTS_TABLE,
\t\t\tsourceTable: MEMORY_INDEX_SOURCES_TABLE,
\t\t\texpectedColumns: ["path", "source"],
\t\t\ttokenizeClause: params.tokenizeClause
\t\t}) || memoryPathFtsTriggersNeedReconcile(params.db);
\t\tif (!needsReconcile) return;
\t\tif (!params.db.isTransaction) return runSqliteImmediateTransactionSync(params.db, () => ensureMemoryPathFtsSchema(params), {operationLabel: "memory.fts.ensure-path", databaseLabel: "memory index"});
\t}`;

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `anchor mismatch: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

export function patchDb91MemoryFtsAdmission(source) {
  assert(!source.includes('function memoryFtsTableNeedsReconcile('), 'memory FTS admission is already patched');
  let output = replaceOnce(source, helperAnchor, helpers + helperAnchor);
  output = replaceOnce(output, bodyAnchor, bodyAdmission);
  output = replaceOnce(output, pathAnchor, pathAdmission);
  return output;
}
