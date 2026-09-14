#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const vlab = '/Users/tianyicai/vlab-dev/lab/vlab.mjs';
const integrationRepo = '/Users/tianyicai/vlab-dev';
const targets = {
  scope: {
    target: 'openclaw/dist/session-accessor.sqlite-scope-BwPKGcgm.js',
    expectedSha: '6817511dc8a40eec8a3de4f13e71fe27d10f6d584bd2d3f7af342e9bbce8e787',
    output: path.join(here, 'release-files/session-accessor.sqlite-scope-BwPKGcgm.js'),
  },
  database: {
    target: 'openclaw/dist/openclaw-agent-db-CUTe8BX6.js',
    expectedSha: 'f27dfd63df7347ba9d6cf9026227cb8a36e09fc33da19f17c07ba898b2163024',
    output: path.join(here, 'release-files/openclaw-agent-db-CUTe8BX6.js'),
  },
  history: {
    target: 'openclaw/dist/session-history-eviction-d5aiCsHS.js',
    expectedSha: '04a6851b05385b6361637c8a8e52d82260943717c507b4ccfda34970b12b22e0',
    output: path.join(here, 'release-files/session-history-eviction-d5aiCsHS.js'),
  },
};

function once(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} anchor mismatch`);
  return source.replace(before, after);
}

export function patchScopeSource(source) {
  source = once(source,
    'import { o as tryAcquireExclusiveSqliteCoordinator } from "./node-sqlite-CL-d6drd.js";\nimport { withAgentDatabaseProcessLease } from "./agent-db-process-coordinator.mjs";\n',
    '',
    'broad scope process coordinator imports');
  const start = source.indexOf('async function runExclusiveSqliteSessionWrite(scope, fn) {');
  const end = source.indexOf('\nfunction resolveSqliteScope(scope) {', start);
  assert(start >= 0 && end > start, 'runExclusiveSqliteSessionWrite anchor mismatch');
  const replacement = `async function runExclusiveSqliteSessionWrite(scope, fn) {
\tconst databaseOptions = toDatabaseOptions(scope);
\tconst storePath = resolveOpenClawAgentSqlitePath(databaseOptions);
\tconst startedAt = Date.now();
\tlet localQueueWaitMs = 0;
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
\t\t\t\treturn await runCriticalSection();
\t\t\t}
\t\t});
\t\tconst elapsedMs = Date.now() - startedAt;
\t\tif (elapsedMs >= SQLITE_SESSION_SLOW_WRITE_MS) getChildLogger({ subsystem: "session-sqlite" }).warn("slow SQLite session write", {
\t\t\tagentId: scope.agentId,
\t\t\tcriticalSectionMs,
\t\t\telapsedMs,
\t\t\tlocalQueueWaitMs,
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
\t\t\tstorePath
\t\t});
\t\tthrow error;
\t}
}`;
  return source.slice(0, start) + replacement + source.slice(end);
}

export function patchDatabaseSource(source) {
  source = once(source,
    '\tconst enteredNestedTransaction = database.db.isTransaction;\n\tconst runTransaction =',
    '\tconst enteredNestedTransaction = database.db.isTransaction;\n\tconst processAdmissionTimeoutMs = transactionOptions.busyTimeoutMs ?? 5e3;\n\tconst runTransaction =',
    'transaction admission budget');
  return once(source,
    '\t\tdatabasePath: database.path,\n\t\tfn: runTransaction,',
    '\t\tdatabasePath: database.path,\n\t\tfn: runTransaction,\n\t\tmaxWaitMs: processAdmissionTimeoutMs,',
    'bounded synchronous admission');
}

export function patchHistorySource(source) {
  source = once(source,
    'import { p as runWithSqliteBusyTimeout } from "./node-sqlite-CL-d6drd.js";\n',
    'import { o as tryAcquireExclusiveSqliteCoordinator, p as runWithSqliteBusyTimeout } from "./node-sqlite-CL-d6drd.js";\nimport { withAgentDatabaseProcessLeaseSync } from "./agent-db-process-coordinator.mjs";\n',
    'history coordinator imports');
  source = once(source,
    `\t\tconst database = openOpenClawAgentDatabase(toDatabaseOptions(scope));
\t\trunWithSqliteBusyTimeout(database.db, 0, () => {
\t\t\tconst row = database.db.prepare("PRAGMA analysis_limit").get();
\t\t\tconst previousLimit = Number(row?.analysis_limit ?? 0);
\t\t\ttry {
\t\t\t\tdatabase.db.exec(\`PRAGMA analysis_limit = \${SESSION_PLANNER_ANALYSIS_LIMIT}; ANALYZE main;\`);
\t\t\t} finally {
\t\t\t\tdatabase.db.exec(\`PRAGMA analysis_limit = \${previousLimit};\`);
\t\t\t}
\t\t});`,
    `\t\trunOpenClawAgentWriteTransaction((database) => runWithSqliteBusyTimeout(database.db, 0, () => {
\t\t\tconst row = database.db.prepare("PRAGMA analysis_limit").get();
\t\t\tconst previousLimit = Number(row?.analysis_limit ?? 0);
\t\t\ttry {
\t\t\t\tdatabase.db.exec(\`PRAGMA analysis_limit = \${SESSION_PLANNER_ANALYSIS_LIMIT}; ANALYZE main;\`);
\t\t\t} finally {
\t\t\t\tdatabase.db.exec(\`PRAGMA analysis_limit = \${previousLimit};\`);
\t\t\t}
\t\t}), toDatabaseOptions(scope), { operationLabel: "sessions.planner.analyze" });`,
    'planner analyze transaction');
  const beforeReclaim = `function reclaimSqliteFreePages(databaseOptions) {
\tconst database = openOpenClawAgentDatabase(databaseOptions);
\tdatabase.walMaintenance.checkpoint();
\tconst row = database.db.prepare("PRAGMA freelist_count").get();
\tconst freePages = Number(row?.freelist_count ?? 0);
\tif (Number.isSafeInteger(freePages) && freePages > 0) database.db.exec(\`PRAGMA incremental_vacuum(\${freePages});\`);
\tdatabase.walMaintenance.checkpoint();
}`;
  const afterReclaim = `function reclaimSqliteFreePages(databaseOptions) {
\tconst database = openOpenClawAgentDatabase(databaseOptions);
\tconst runMaintenance = () => {
\t\tdatabase.walMaintenance.checkpoint();
\t\tconst row = database.db.prepare("PRAGMA freelist_count").get();
\t\tconst freePages = Number(row?.freelist_count ?? 0);
\t\tif (Number.isSafeInteger(freePages) && freePages > 0) database.db.exec(\`PRAGMA incremental_vacuum(\${freePages});\`);
\t\tdatabase.walMaintenance.checkpoint();
\t};
\tif (isIncognitoOpenClawAgentSqlitePath(database.path, { agentId: databaseOptions.agentId, env: databaseOptions.env })) return runMaintenance();
\treturn withAgentDatabaseProcessLeaseSync({
\t\tacquire: tryAcquireExclusiveSqliteCoordinator,
\t\tdatabasePath: database.path,
\t\tfn: runMaintenance,
\t\tmaxWaitMs: 5e3,
\t\tonReleaseError: (error) => getChildLogger({ subsystem: "session-sqlite" }).warn("SQLite free-page coordinator release failed", { error, path: database.path })
\t});
}`;
  return once(source, beforeReclaim, afterReclaim, 'free-page maintenance transaction scope');
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
  const sources = {
    scope: patchScopeSource(readCurrent(targets.scope)),
    database: patchDatabaseSource(readCurrent(targets.database)),
    history: patchHistorySource(readCurrent(targets.history)),
  };
  for (const [name, source] of Object.entries(sources)) fs.writeFileSync(targets[name].output, source);
  return Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, {
    target: targets[name].target,
    before: targets[name].expectedSha,
    after: sha256(source),
  }]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
