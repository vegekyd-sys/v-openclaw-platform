import assert from 'node:assert/strict';

// A memory_search connection closes with a PASSIVE WAL checkpoint instead of TRUNCATE (V 2026-11-20).
//
// From 22:29–22:34 to 23:06–23:09 CST every tools.invoke memory_search on V took 6.1–7.5 s
// instead of 1.0–1.3 s, while the tool's own toolMs/searchMs stayed ~1.0 s. The extra ~5.0 s came
// after the search: memory_search opens a "search" MemoryIndexManager per call and closes it in
// its finally block (after toolMs is measured). close() -> closeMemoryDatabase ->
// closeMemorySqliteWalMaintenance runs `PRAGMA wal_checkpoint(TRUNCATE)` synchronously on the
// Gateway thread with this connection's busy_timeout of 5000 ms.
//
// The memory index lives in the shared agent database (openclaw-agent.sqlite). TRUNCATE (like
// RESTART) takes the WAL writer lock and then waits, through the busy handler, until no reader is
// still using the WAL. While any other connection holds a read transaction open, it waits the full
// 5000 ms, returns busy=1 (never logged) and the close completes. During those 5 s the Gateway
// event loop is frozen (V logged "liveness heartbeat delayed" at 22:43:53 and 22:51:25, the same
// millisecond two of the slow replies were sent) and other processes' agent-database writes are
// refused (the writer lock is held).
//
// PASSIVE never calls the busy handler: it copies what it can and returns. The connection's real
// owner (the Gateway's agent database handle) keeps doing the WAL maintenance; a reindex shadow
// database is the last connection to its own file, and SQLite checkpoints and removes the WAL when
// the last connection closes.
//
// Source: openclaw-versa versa/memory-close-passive-checkpoint-20261120 @ b09039594d8 (on versa/main
// aea2dae23b4): extensions/memory-core/src/memory/manager-db.ts openMemoryDatabaseAtPath; test
// manager-db.test.ts "closes without waiting for another connection's open read transaction".

export const MARKER = 'memory-close-passive-v1';

const BEFORE = `function openMemoryDatabaseAtPath(dbPath, allowExtension, agentId) {
	ensureMemoryHostDir(path.dirname(dbPath));
	const db = openNodeSqliteDatabase(dbPath, { allowExtension });
	try {
		configureMemorySqliteWalMaintenance(db, {
			busyTimeoutMs: 5e3,
			databasePath: dbPath
		});`;

const AFTER = `function openMemoryDatabaseAtPath(dbPath, allowExtension, agentId) {
	ensureMemoryHostDir(path.dirname(dbPath));
	const db = openNodeSqliteDatabase(dbPath, { allowExtension });
	try {
		// ${MARKER}: the memory index shares the agent database. A TRUNCATE checkpoint on close
		// holds the writer lock and busy-waits (5 s, on the Gateway thread) for every open reader;
		// PASSIVE never waits. The database's owner keeps its own WAL maintenance.
		configureMemorySqliteWalMaintenance(db, {
			busyTimeoutMs: 5e3,
			databasePath: dbPath,
			checkpointMode: "PASSIVE"
		});`;

export function patchMemoryClosePassive(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied`);
  assert.equal(source.split(BEFORE).length, 2, 'Expected exactly one openMemoryDatabaseAtPath');
  // configureMemorySqliteWalMaintenance has no other caller in this file.
  assert.equal(source.split('configureMemorySqliteWalMaintenance(db,').length, 2, 'Expected one WAL maintenance call');
  return source.replace(BEFORE, AFTER);
}

export const FILES = [{
  name: 'manager-vector-warning-BHH19jrh.js',
  base: 'core/dist',
  target: 'openclaw/dist',
  // V 2026-11-20: unchanged npm openclaw@2026.9.1 bytes.
  before: '8e51348880034b62c568fcb651c3b2f6e59e0ebaff6536965d936ab1b0351e28',
  patch: patchMemoryClosePassive,
}];
