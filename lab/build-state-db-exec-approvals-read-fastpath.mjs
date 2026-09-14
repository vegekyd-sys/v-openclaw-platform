#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const target = 'openclaw/dist/exec-approvals-store-D159_AKa.js';
const expectedSha = '173d3fecf20e9e8fe1e7da153292224391dea6f5afad0cdebea116c420653789';
const response = JSON.parse(execFileSync(process.execPath, [
  '/Users/tianyicai/vlab-dev/lab/vlab.mjs',
  'read-code', '--repo', repo, '--target', target,
], {encoding: 'utf8', maxBuffer: 16 * 1024 ** 2}));

assert.equal(response.sha256, expectedSha, 'VLab runtime input changed; review a fresh patch');
let source = Buffer.from(response.content, 'base64').toString('utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'), expectedSha);

const before = `async function ensureExecApprovalsSnapshot() {
\treturn requireInitializedExecApprovals(updateExecApprovalsInTransaction({ update: ensureExecApprovalsSocket }));
}
function ensureExecApprovals() {
\treturn requireInitializedExecApprovals(updateExecApprovalsInTransaction({ update: ensureExecApprovalsSocket })).file;
}`;

const after = `function readInitializedExecApprovalsSnapshotReadOnly() {
\tconst snapshot = readExecApprovalsSnapshotFromDatabaseReadOnly();
\tconst socketPath = snapshot.file.socket?.path?.trim();
\tconst token = snapshot.file.socket?.token?.trim();
\treturn socketPath && token ? snapshot : null;
}
async function ensureExecApprovalsSnapshot() {
\treturn readInitializedExecApprovalsSnapshotReadOnly() ?? requireInitializedExecApprovals(updateExecApprovalsInTransaction({ update: ensureExecApprovalsSocket }));
}
function ensureExecApprovals() {
\treturn (readInitializedExecApprovalsSnapshotReadOnly() ?? requireInitializedExecApprovals(updateExecApprovalsInTransaction({ update: ensureExecApprovalsSocket }))).file;
}`;

assert.equal(source.split(before).length, 2, 'exec approvals ensure shape changed');
source = source.replace(before, after);

const output = path.join(here, 'release-files', path.basename(target));
fs.writeFileSync(output, source);
console.log(JSON.stringify({
  output,
  sha256: crypto.createHash('sha256').update(source).digest('hex'),
}, null, 2));
