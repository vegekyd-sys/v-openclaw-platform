// Mechanical artifact generation from the shared VLab read-only code endpoint.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  patchLifecycleMessage,
  patchRegisterServiceMessage,
  patchRestartRuntime,
  patchServerReloadRuntime,
} from './safe-restart-no-forced-timeout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vlab = '/Users/tianyicai/vlab-dev/lab/vlab.mjs';
const repo = '/Users/tianyicai/vlab-dev';
const expectedRelease = 'worker-session-handoff-restore-20260912-v1';
const specifications = [
  {
    target: 'openclaw/dist/restart-BXbZs7-w.js',
    before: 'c21126b2a90f5b4cdfbc3309da295d42b6603a2e2e133189ed78218edcb649ca',
    patch: patchRestartRuntime,
  },
  {
    target: 'openclaw/dist/server-reload-handlers-DblQx0j4.js',
    before: '2c97321c2adff17b58181e08fa8a4734030ef2799a9679cf7aeb52e2a3d6491e',
    patch: patchServerReloadRuntime,
  },
  {
    target: 'openclaw/dist/lifecycle-C5MBRQv0.js',
    before: '1b39456f958ebd629b3c80adbcddcc8c80156c68853ebbc5b938601292f22c82',
    patch: patchLifecycleMessage,
  },
  {
    target: 'openclaw/dist/register-service-commands-CgYnEAQx.js',
    before: '21d4b310c60eddd1a512976665fc8bb216b5f7f258aca3279ebc3a259ba13cde',
    patch: patchRegisterServiceMessage,
  },
];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const readCode = target => JSON.parse(execFileSync(process.execPath, [vlab, 'read-code', '--repo', repo, '--target', target], {
  encoding: 'utf8',
  maxBuffer: 8 * 1024 ** 2,
  timeout: 120000,
}));

const files = [];
const summary = [];
for (const specification of specifications) {
  const snapshot = readCode(specification.target);
  assert.equal(snapshot.current.release, expectedRelease, 'Shared VLab release drift');
  assert.equal(snapshot.sha256, specification.before, `Baseline hash drift: ${specification.target}`);
  const source = Buffer.from(snapshot.content, 'base64').toString('utf8');
  assert.equal(sha256(source), specification.before, `Decoded hash mismatch: ${specification.target}`);
  const candidate = specification.patch(source);
  const sourcePath = `lab/release-files/${path.basename(specification.target)}`;
  fs.writeFileSync(path.join(root, sourcePath), candidate);
  files.push({ source: sourcePath, target: specification.target, before: specification.before });
  summary.push({ target: specification.target, before: specification.before, after: sha256(candidate) });
}

const plan = { baseRelease: expectedRelease, files };
fs.writeFileSync(path.join(root, 'lab/safe-restart-no-forced-timeout-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ baseRelease: expectedRelease, files: summary }, null, 2));
