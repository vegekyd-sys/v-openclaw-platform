#!/usr/bin/env node
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const target = 'openclaw/dist/openclaw-agent-db-CUTe8BX6.js';
const expectedSha = 'acbf762a26fcb52e6b6561b3258d4ad54ee7497ee29958bc6f01c445a609320b';
const response = JSON.parse(execFileSync(process.execPath, [
  path.join(here, 'vlab.mjs'),
  'read-code', '--repo', repo, '--target', target,
], {encoding: 'utf8', maxBuffer: 16 * 1024 ** 2}));

assert.equal(response.sha256, expectedSha, 'VLab runtime input changed; review a fresh patch');
let source = Buffer.from(response.content, 'base64').toString('utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'), expectedSha);

const importNeedle = 'import { t as openNodeSqliteDatabase, u as runSqliteImmediateTransactionSync } from "./node-sqlite-CL-d6drd.js";\n';
assert.equal(source.split(importNeedle).length, 2);
source = source.replace(
  importNeedle,
  `${importNeedle}import {withSqliteBeginContentionRetrySync} from "./sqlite-begin-contention-retry.mjs";\n`,
);

const before = `function runOpenClawAgentWriteTransaction(operation, options, transactionOptions = {}) {
\tconst database = openOpenClawAgentDatabase(options);
\tconst enteredNestedTransaction = database.db.isTransaction;
\treturn withSqlitePostCommitPublications(database.db, () => runSqliteImmediateTransactionSync(database.db, () => {
\t\tconst operationResult = operation(database);
\t\tif (!enteredNestedTransaction) {
\t\t\tif (!incognitoDatabases.has(database)) ensureOpenClawAgentDatabasePermissions(database.path, options);
\t\t}
\t\treturn operationResult;
\t}, {
\t\tbusyTimeoutMs: transactionOptions.busyTimeoutMs ?? 5e3,
\t\tdatabaseLabel: database.path,
\t\t...transactionOptions,
\t\toperationLabel: transactionOptions.operationLabel ?? "agent.write"
\t}));
}`;

const after = `function runOpenClawAgentWriteTransaction(operation, options, transactionOptions = {}) {
\tconst database = openOpenClawAgentDatabase(options);
\tconst enteredNestedTransaction = database.db.isTransaction;
\treturn withSqlitePostCommitPublications(database.db, () => withSqliteBeginContentionRetrySync({
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
}`;

assert.equal(source.split(before).length, 2, 'transaction wrapper shape changed');
source = source.replace(before, after);
const output = path.join(here, 'release-files', path.basename(target));
fs.writeFileSync(output, source);
console.log(JSON.stringify({output, sha256: crypto.createHash('sha256').update(source).digest('hex')}, null, 2));
