// Build exact code-only artifacts from the current shared VLab release.
// This reads only versioned runtime code and never writes Gateway state.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  patchGatewayAgentRuntimeIdentityMethods,
  patchInProcessGatewayFallbackOptions,
  patchOpenClawDelegateTimeout,
} from './gateway-self-config-authority.mjs';

const repo = '/Users/tianyicai/vlab-dev';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'lab/release-files/gateway-self-config-authority');
const fixtureDir = resolve(root, 'lab/fixtures/gateway-self-config-authority');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const targets = [
  ['gateway-DVu5Urba.js', patchGatewayAgentRuntimeIdentityMethods],
  ['sessions-helpers-Bn_vDNby.js', patchInProcessGatewayFallbackOptions],
  ['openclaw-tools-BODVdJQD.js', patchOpenClawDelegateTimeout],
];

mkdirSync(outputDir, { recursive: true });
mkdirSync(fixtureDir, { recursive: true });
let baseRelease;
const files = [];
for (const [name, patch] of targets) {
  const target = `openclaw/dist/${name}`;
  const result = JSON.parse(execFileSync(process.execPath, [
    '/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--repo', repo, '--target', target,
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 ** 2, timeout: 600_000 }));
  baseRelease ??= result.current.release;
  assert.equal(result.current.release, baseRelease, 'VLab release changed during build');
  const before = Buffer.from(result.content, 'base64').toString();
  assert.equal(sha256(before), result.sha256, `${name}: VLab read-code digest mismatch`);
  const after = patch(before);
  assert.notEqual(after, before, `${name}: expected unapplied patch`);
  writeFileSync(resolve(fixtureDir, name), before);
  writeFileSync(resolve(outputDir, name), after);
  assert.equal(readFileSync(resolve(outputDir, name), 'utf8'), after);
  files.push({ source: `lab/release-files/gateway-self-config-authority/${name}`, target, before: result.sha256 });
  console.log(JSON.stringify({ target, before: result.sha256, after: sha256(after) }));
}

writeFileSync(resolve(root, 'lab/gateway-self-config-authority-plan.json'), `${JSON.stringify({ baseRelease, files }, null, 2)}\n`);
console.log(JSON.stringify({ baseRelease, files: files.length }));

