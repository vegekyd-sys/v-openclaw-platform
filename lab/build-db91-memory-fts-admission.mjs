import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {patchDb91MemoryFtsAdmission} from './patch-db91-memory-fts-admission.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = 'openclaw/dist/memory-schema-BSs9MQgq.js';
const snapshot = JSON.parse(execFileSync(process.execPath, [
  '/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code',
  '--repo', '/Users/tianyicai/vlab-dev', '--target', target,
], {encoding: 'utf8', maxBuffer: 5 * 1024 ** 2}));
const source = Buffer.from(snapshot.content, 'base64').toString();
const sha256 = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha256(source), snapshot.sha256);

const output = patchDb91MemoryFtsAdmission(source);
const destination = 'lab/release-files/memory-schema-BSs9MQgq.js';
fs.writeFileSync(path.join(root, destination), output);
const plan = {
  baseRelease: snapshot.current.release,
  files: [{source: destination, target, before: snapshot.sha256}],
};
fs.writeFileSync(path.join(root, 'lab/db91-memory-fts-admission-plan.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({...plan, after: sha256(output)}));
