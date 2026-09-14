import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const vlab = '/Users/tianyicai/vlab-dev/lab/vlab.mjs';
const integrationRepo = '/Users/tianyicai/vlab-dev';
const target = 'openclaw/dist/server-start-BNcm1gUN.js';
const expectedSha = '845b97e1f276c426497fea21eedb8f7650d16e11dc70765e32e1ef4080e21864';
const output = path.join(here, 'release-files/server-start-BNcm1gUN.js');

function once(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} anchor mismatch`);
  return source.replace(before, after);
}

export function patchEventLoopP50(source) {
  source = once(source,
    '\t\tconst delayP99Ms = nanosecondsToMilliseconds(monitor.percentile(99));\n',
    '\t\tconst delayP50Ms = nanosecondsToMilliseconds(monitor.percentile(50));\n\t\tconst delayP99Ms = nanosecondsToMilliseconds(monitor.percentile(99));\n',
    'event-loop percentile read');
  return once(source,
    '\t\t\tdegradedSinceMs: firstDegradedAtMs === null ? null : Math.max(0, Math.round(now - firstDegradedAtMs)),\n\t\t\treasons,\n\t\t\tintervalMs,\n\t\t\tdelayP99Ms,\n\t\t\tdelayMaxMs,\n',
    '\t\t\tdegradedSinceMs: firstDegradedAtMs === null ? null : Math.max(0, Math.round(now - firstDegradedAtMs)),\n\t\t\treasons,\n\t\t\tintervalMs,\n\t\t\tdelayP50Ms,\n\t\t\tdelayP99Ms,\n\t\t\tdelayMaxMs,\n',
    'event-loop health payload');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function build() {
  const raw = execFileSync(process.execPath, [vlab, 'read-code', '--repo', integrationRepo, '--target', target], {encoding: 'utf8'});
  const payload = JSON.parse(raw);
  assert.equal(payload.sha256, expectedSha, 'server-start current SHA drift');
  const source = Buffer.from(payload.content, 'base64').toString('utf8');
  assert.equal(sha256(source), expectedSha);
  const patched = patchEventLoopP50(source);
  fs.writeFileSync(output, patched);
  return {target, before: expectedSha, after: sha256(patched)};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
