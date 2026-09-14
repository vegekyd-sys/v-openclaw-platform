import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const [sourcePath, databasePath] = process.argv.slice(2);
if (!sourcePath || !databasePath) throw new Error('usage: probe SOURCE DATABASE');
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('const MEMORY_INDEX_SOURCES_TABLE =');
const end = source.indexOf('\n//#endregion', source.indexOf('function ensureMemoryPathFtsSchema(', start));
if (start < 0 || end <= start) throw new Error('memory schema function anchors not found');
let transactions = 0;
const runSqliteImmediateTransactionSync = (database, operation) => {
  transactions++;
  database.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};
const functions = Function('runSqliteImmediateTransactionSync', `${source.slice(start, end)}\nreturn {ensureMemoryChunkFtsSchema, ensureMemoryPathFtsSchema};`)(runSqliteImmediateTransactionSync);
const database = new DatabaseSync(databasePath);
try {
  process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE = '1';
  functions.ensureMemoryChunkFtsSchema({db: database, ftsTable: 'memory_index_chunks_fts', tokenizeClause: ''});
  functions.ensureMemoryPathFtsSchema({db: database, tokenizeClause: ''});
  process.stdout.write(JSON.stringify({transactions}));
} finally {
  database.close();
}
