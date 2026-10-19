// sqlite-hold-callsite-v1: "slow SQLite transaction hold" carries the caller that entered the transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CALLER_FRAMES, MARKER, patchNodeSqlite } from './patch-sqlite-hold-callsite.mjs';
import { FILES, OUTPUT_DIR, PLAN } from './build-sqlite-hold-callsite.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const [FILE] = FILES;

test('release file is exactly the patch of V\'s bytes, the plan names them, a patched file is refused', () => {
  const input = read(FILE.from);
  assert.equal(sha(input), FILE.before, 'input is V\'s node-sqlite');
  const out = patchNodeSqlite(input);
  assert.equal(read(`${OUTPUT_DIR}/${FILE.name}`), out);
  assert.throws(() => patchNodeSqlite(out), /already carries/u);
  assert.equal(out.split(`//#region V ${MARKER}`).length - 1, 1, 'one helper');
  assert(out.includes('codex-turn-tail-v1'), 'V\'s codex-turn-tail patch is kept');
  assert.deepEqual(JSON.parse(read(PLAN)), {
    baseRelease: 'REPLACE_AT_STAGE',
    files: [{ source: `${OUTPUT_DIR}/${FILE.name}`, target: `openclaw/dist/${FILE.name}`, before: FILE.before }],
  });
  // only the slow path changed: the helper runs after the threshold check
  assert.match(out, /if \(params\.elapsedMs < slowTransactionHoldThresholdMs\(params\.options\)\) return;\n\tconst callers = __vSqliteHoldCallers\(\);/u);
});

// The patched release file, loaded with stub sibling chunks and driven with real node:sqlite.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-hold-callsite-'));
process.on('exit', () => fs.rmSync(dist, { recursive: true, force: true }));
fs.writeFileSync(path.join(dist, FILE.name), read(`${OUTPUT_DIR}/${FILE.name}`));
const stubs = {
  'warning-filter-z3hZGeVP.js': 'export const t = () => {};',
  'errors-u9zSVTak.js': 'export const t = (e) => String(e);',
  'subsystem-bfHYmnCE.js': 'export const t = () => ({ warn() {}, debug() {}, info() {} });',
  'sqlite-runtime-version-2bxyFHKW.js': 'export const n = () => true;',
  'promise-like-D7-l5Fsp.js': 'export const t = (v) => !!v && typeof v.then === "function";',
};
for (const [name, body] of Object.entries(stubs)) fs.writeFileSync(path.join(dist, name), `${body}\n`);
// V's agent.write path: runOpenClawAgentWriteTransaction -> process coordinator -> post-commit
// publications -> begin-contention retry -> runSqliteImmediateTransactionSync.
fs.writeFileSync(path.join(dist, 'openclaw-agent-db-TEST.js'), `import { u as runSqliteImmediateTransactionSync } from "./${FILE.name}";
function withAgentDatabaseProcessLeaseSync(p) { return p.fn(); }
function withSqlitePostCommitPublications(db, fn) { return fn(); }
function withSqliteBeginContentionRetrySync(p) { return p.run(p.operation); }
export function runOpenClawAgentWriteTransaction(operation, db, transactionOptions = {}) {
	const runTransaction = () => withSqlitePostCommitPublications(db, () => withSqliteBeginContentionRetrySync({
		run: (transactionOperation) => runSqliteImmediateTransactionSync(db, () => transactionOperation(db), { ...transactionOptions, operationLabel: "agent.write" }),
		operation: (writeDatabase) => operation(writeDatabase)
	}));
	return withAgentDatabaseProcessLeaseSync({ fn: runTransaction });
}
`);
const sqlite = await import(pathToFileURL(path.join(dist, FILE.name)).href);
const agentDb = await import(pathToFileURL(path.join(dist, 'openclaw-agent-db-TEST.js')).href);

function spin(ms) { const until = Date.now() + ms; while (Date.now() < until); }
function capture() {
  const lines = [];
  return { lines, logger: { warn: (message, meta) => lines.push({ message, meta }) } };
}
function openDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (v INTEGER)');
  return db;
}

test('agent.write over the threshold: callers start at the code that called runOpenClawAgentWriteTransaction', () => {
  const db = openDb();
  const { lines, logger } = capture();
  function persistTurnForTest() {
    return agentDb.runOpenClawAgentWriteTransaction((d) => { d.prepare('INSERT INTO t VALUES (1)').run(); spin(60); return 'ok'; }, db, { logger, slowTransactionHoldMs: 50 });
  }
  function handleMessageForTest() { return persistTurnForTest(); }
  assert.equal(handleMessageForTest(), 'ok');
  assert.equal(lines.length, 1);
  const { message, meta } = lines[0];
  assert.equal(message, 'slow SQLite transaction hold');
  assert.equal(meta.operation, 'agent.write');
  assert(meta.elapsedMs >= 50);
  assert(Array.isArray(meta.callers), JSON.stringify(meta));
  assert.match(meta.callers[0], /^persistTurnForTest \([^/()\s]+\/sqlite-hold-callsite\.test\.mjs:\d+:\d+\)$/u);
  assert.match(meta.callers[1], /^handleMessageForTest /u);
  assert(meta.callers.length <= CALLER_FRAMES);
  for (const frame of meta.callers) {
    assert.doesNotMatch(frame, /node-sqlite-|openclaw-agent-db-|withSqlite|withAgentDatabase/u, `wrapper frame kept: ${frame}`);
    assert.doesNotMatch(frame, /file:\/\/|\(\//u, `absolute path kept: ${frame}`);
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM t').get().n, 1, 'the write committed');
});

test('a direct transaction (no agent wrapper) skips only node-sqlite\'s own frames', () => {
  const db = openDb();
  const { lines, logger } = capture();
  function directWriterForTest() {
    return sqlite.u(db, () => spin(30), { logger, slowTransactionHoldMs: 20, operationLabel: 'state.write' });
  }
  directWriterForTest();
  assert.equal(lines.length, 1);
  assert.match(lines[0].meta.callers[0], /^directWriterForTest /u);
});

test('under the threshold nothing is logged; stackTraceLimit is restored; a failing stack still logs the line', () => {
  const db = openDb();
  const { lines, logger } = capture();
  const limit = Error.stackTraceLimit;
  for (let i = 0; i < 50; i += 1) agentDb.runOpenClawAgentWriteTransaction((d) => d.prepare('INSERT INTO t VALUES (2)').run(), db, { logger });
  assert.equal(lines.length, 0, 'no hold reached the default 1000 ms');
  agentDb.runOpenClawAgentWriteTransaction(() => spin(15), db, { logger, slowTransactionHoldMs: 10 });
  assert.equal(Error.stackTraceLimit, limit);
  const prepare = Error.prepareStackTrace;
  Error.prepareStackTrace = () => { throw new Error('broken prepareStackTrace'); };
  try {
    agentDb.runOpenClawAgentWriteTransaction(() => spin(15), db, { logger, slowTransactionHoldMs: 10 });
  } finally {
    Error.prepareStackTrace = prepare;
  }
  assert.equal(Error.stackTraceLimit, limit);
  assert.equal(lines.length, 2);
  assert(Array.isArray(lines[0].meta.callers));
  assert.equal(lines[1].meta.callers, undefined, 'logged without callers');
  assert.equal(lines[1].meta.operation, 'agent.write');
});
