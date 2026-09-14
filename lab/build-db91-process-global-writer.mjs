import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const vlab = '/Users/tianyicai/vlab-dev/lab/vlab.mjs';
const integrationRepo = '/Users/tianyicai/vlab-dev';
const targets = {
  scope: {
    target: 'openclaw/dist/session-accessor.sqlite-scope-BwPKGcgm.js',
    expectedSha: '193a84fe7518a8b83db2315acb0518653011087b17f14f3f9f01cc7aa8a6c834',
    output: path.join(here, 'release-files/session-accessor.sqlite-scope-BwPKGcgm.js'),
  },
  reconcile: {
    target: 'openclaw/dist/session-transcript-reconcile-j5qhAafV.js',
    expectedSha: '0c0461d43f9147aa6b8d7991466f5f3f1b07924306ccb7cf14cafcd0315b84f3',
    output: path.join(here, 'release-files/session-transcript-reconcile-j5qhAafV.js'),
  },
  database: {
    target: 'openclaw/dist/openclaw-agent-db-CUTe8BX6.js',
    expectedSha: 'a4c1d63df182d95cc029c25e338eb18708c484b7a8afc998d4ea61292416bb71',
    output: path.join(here, 'release-files/openclaw-agent-db-CUTe8BX6.js'),
  },
};

function once(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} anchor mismatch`);
  return source.replace(before, after);
}

export function patchScopeSource(source) {
  source = once(source,
    'import { t as formatSqliteSessionFileMarker } from "./legacy-sqlite-marker-COPKCuIN.js";\n',
    'import { t as formatSqliteSessionFileMarker } from "./legacy-sqlite-marker-COPKCuIN.js";\nimport { o as tryAcquireExclusiveSqliteCoordinator } from "./node-sqlite-CL-d6drd.js";\nimport { withAgentDatabaseProcessLease } from "./agent-db-process-coordinator.mjs";\n',
    'scope imports');
  const start = source.indexOf('async function runExclusiveSqliteSessionWrite(scope, fn) {');
  const end = source.indexOf('\nfunction resolveSqliteScope(scope) {', start);
  assert(start >= 0 && end > start, 'runExclusiveSqliteSessionWrite anchor mismatch');
  const replacement = `async function runExclusiveSqliteSessionWrite(scope, fn) {
\tconst databaseOptions = toDatabaseOptions(scope);
\tconst storePath = resolveOpenClawAgentSqlitePath(databaseOptions);
\tconst startedAt = Date.now();
\tlet localQueueWaitMs = 0;
\tlet processQueueWaitMs = 0;
\tlet processQueueAttempts = 0;
\tlet criticalSectionMs = 0;
\tconst runCriticalSection = async () => {
\t\tconst criticalStartedAt = Date.now();
\t\ttry {
\t\t\treturn await fn();
\t\t} finally {
\t\t\tcriticalSectionMs = Date.now() - criticalStartedAt;
\t\t}
\t};
\ttry {
\t\tconst result = await runQueuedStoreWrite({
\t\t\tqueues: SQLITE_SESSION_WRITER_QUEUES,
\t\t\tstorePath,
\t\t\tlabel: "runExclusiveSqliteSessionWrite",
\t\t\tfn: async () => {
\t\t\t\tlocalQueueWaitMs = Date.now() - startedAt;
\t\t\t\tif (typeof scope.sessionKey === "string" && isIncognitoSessionKey(scope.sessionKey)) return await runCriticalSection();
\t\t\t\treturn await withAgentDatabaseProcessLease({
\t\t\t\t\tacquire: tryAcquireExclusiveSqliteCoordinator,
\t\t\t\t\tdatabasePath: storePath,
\t\t\t\t\tfn: runCriticalSection,
\t\t\t\t\tonAcquired: ({ attempts, waitMs }) => {
\t\t\t\t\t\tprocessQueueAttempts = attempts;
\t\t\t\t\t\tprocessQueueWaitMs = waitMs;
\t\t\t\t\t},
\t\t\t\t\tonReleaseError: (error) => getChildLogger({ subsystem: "session-sqlite" }).warn("Agent DB process writer coordinator release failed", { error, storePath })
\t\t\t\t});
\t\t\t}
\t\t});
\t\tconst elapsedMs = Date.now() - startedAt;
\t\tif (elapsedMs >= SQLITE_SESSION_SLOW_WRITE_MS) getChildLogger({ subsystem: "session-sqlite" }).warn("slow SQLite session write", {
\t\t\tagentId: scope.agentId,
\t\t\tcriticalSectionMs,
\t\t\telapsedMs,
\t\t\tlocalQueueWaitMs,
\t\t\tprocessQueueAttempts,
\t\t\tprocessQueueWaitMs,
\t\t\tstorePath
\t\t});
\t\treturn result;
\t} catch (error) {
\t\tgetChildLogger({ subsystem: "session-sqlite" }).warn("SQLite session write failed", {
\t\t\tagentId: scope.agentId,
\t\t\tcriticalSectionMs,
\t\t\telapsedMs: Date.now() - startedAt,
\t\t\terror,
\t\t\tlocalQueueWaitMs,
\t\t\tprocessQueueAttempts,
\t\t\tprocessQueueWaitMs,
\t\t\tstorePath
\t\t});
\t\tthrow error;
\t}
}`;
  return source.slice(0, start) + replacement + source.slice(end);
}

export function patchReconcileSource(source) {
  source = once(source,
    'import { setTimeout } from "node:timers/promises";\n',
    'import { setTimeout } from "node:timers/promises";\nimport { o as tryAcquireExclusiveSqliteCoordinator } from "./node-sqlite-CL-d6drd.js";\nimport { withAgentDatabaseProcessLease } from "./agent-db-process-coordinator.mjs";\n',
    'reconcile imports');
  source = once(source,
    'async function reconcileSessionTranscriptIndexes(params) {',
    'async function reconcileSessionTranscriptIndexesAsProcessOwner(params) {',
    'reconcile owner');
  const marker = '/** Starts one deferred reconcile. No transcript rows are read on the caller\'s stack. */';
  const index = source.indexOf(marker);
  assert(index >= 0, 'reconcile wrapper anchor mismatch');
  const wrapper = `/** Coalesces reconcile ownership across Gateway and all worker processes. */
async function reconcileSessionTranscriptIndexes(params) {
\tconst databasePath = resolveOpenClawAgentSqlitePath(params);
\tlet wait;
\treturn await withAgentDatabaseProcessLease({
\t\tacquire: tryAcquireExclusiveSqliteCoordinator,
\t\tdatabasePath,
\t\tfn: async () => {
\t\t\tif (wait?.waitMs >= 1e3) log.warn(\`session transcript reconcile waited for process owner agent=\${params.agentId} waitMs=\${wait.waitMs} attempts=\${wait.attempts}\`);
\t\t\treturn await reconcileSessionTranscriptIndexesAsProcessOwner(params);
\t\t},
\t\tonAcquired: (value) => { wait = value; },
\t\tonReleaseError: (error) => log.warn(\`session transcript reconcile coordinator release failed agent=\${params.agentId} error=\${error instanceof Error ? error.message : String(error)}\`),
\t\tsuffix: ".transcript-reconcile-coordinator"
\t});
}
`;
  return source.slice(0, index) + wrapper + source.slice(index);
}

export function patchDatabaseSource(source) {
  source = once(source,
    'import { t as openNodeSqliteDatabase, u as runSqliteImmediateTransactionSync } from "./node-sqlite-CL-d6drd.js";\n',
    'import { o as tryAcquireExclusiveSqliteCoordinator, t as openNodeSqliteDatabase, u as runSqliteImmediateTransactionSync } from "./node-sqlite-CL-d6drd.js";\n',
    'database native coordinator import');
  source = once(source,
    'import {withSqliteBeginContentionRetrySync} from "./sqlite-begin-contention-retry.mjs";\n',
    'import {withSqliteBeginContentionRetrySync} from "./sqlite-begin-contention-retry.mjs";\nimport {isAgentDatabaseProcessLeaseHeld, withAgentDatabaseProcessLeaseSync} from "./agent-db-process-coordinator.mjs";\n',
    'database process coordinator import');
  const start = source.indexOf('function runOpenClawAgentWriteTransaction(operation, options, transactionOptions = {}) {');
  const end = source.indexOf('\nlet unregisterExitClose = null;', start);
  assert(start >= 0 && end > start, 'runOpenClawAgentWriteTransaction anchor mismatch');
  const replacement = `function runOpenClawAgentWriteTransaction(operation, options, transactionOptions = {}) {
\tconst database = openOpenClawAgentDatabase(options);
\tconst enteredNestedTransaction = database.db.isTransaction;
\tconst runTransaction = () => withSqlitePostCommitPublications(database.db, () => withSqliteBeginContentionRetrySync({
\t\tdatabase: database.db,
\t\trun: transactionOperation => runSqliteImmediateTransactionSync(database.db, () => transactionOperation(database), {
\t\t\tbusyTimeoutMs: transactionOptions.busyTimeoutMs ?? 5e3,
\t\t\tdatabaseLabel: database.path,
\t\t\t...transactionOptions,
\t\t\toperationLabel: transactionOptions.operationLabel ?? "agent.write"
\t\t}),
\t\toperation: (writeDatabase) => {
\t\t\tconst operationResult = operation(writeDatabase);
\t\t\tif (!enteredNestedTransaction) {
\t\t\t\tif (!incognitoDatabases.has(writeDatabase)) ensureOpenClawAgentDatabasePermissions(writeDatabase.path, options);
\t\t\t}
\t\t\treturn operationResult;
\t\t}
\t}));
\tif (incognitoDatabases.has(database) || isAgentDatabaseProcessLeaseHeld(database.path)) return runTransaction();
\treturn withAgentDatabaseProcessLeaseSync({
\t\tacquire: tryAcquireExclusiveSqliteCoordinator,
\t\tdatabasePath: database.path,
\t\tfn: runTransaction,
\t\tonAcquired: ({ attempts, waitMs }) => {
\t\t\tif (waitMs >= 1e3) agentDbLog.warn("slow direct Agent DB process writer admission", {
\t\t\t\tattempts,
\t\t\t\toperationLabel: transactionOptions.operationLabel ?? "agent.write",
\t\t\t\tpath: database.path,
\t\t\t\twaitMs
\t\t\t});
\t\t},
\t\tonReleaseError: (error) => agentDbLog.warn("direct Agent DB process writer coordinator release failed", { error, path: database.path })
\t});
}`;
  return source.slice(0, start) + replacement + source.slice(end);
}

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}

function readCurrent(spec) {
  const raw = execFileSync(process.execPath, [vlab, 'read-code', '--repo', integrationRepo, '--target', spec.target], {encoding: 'utf8'});
  const payload = JSON.parse(raw);
  assert.equal(payload.sha256, spec.expectedSha, `${spec.target} current SHA drift`);
  const source = Buffer.from(payload.content, 'base64').toString('utf8');
  assert.equal(sha256(source), spec.expectedSha, `${spec.target} decoded SHA mismatch`);
  return source;
}

export function build() {
  const scope = patchScopeSource(readCurrent(targets.scope));
  const reconcile = patchReconcileSource(readCurrent(targets.reconcile));
  const database = patchDatabaseSource(readCurrent(targets.database));
  fs.writeFileSync(targets.scope.output, scope);
  fs.writeFileSync(targets.reconcile.output, reconcile);
  fs.writeFileSync(targets.database.output, database);
  return {
    scope: {before: targets.scope.expectedSha, after: sha256(scope)},
    reconcile: {before: targets.reconcile.expectedSha, after: sha256(reconcile)},
    database: {before: targets.database.expectedSha, after: sha256(database)},
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
