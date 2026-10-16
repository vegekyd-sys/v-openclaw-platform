// lab/release-files/restart-speed-2: a Worker waits at most 3 s for the Gateway's secrets.resolve.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchCommandSecretGateway, MARKER } from './patch-restart-speed-secrets-resolve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = (v) => createHash('sha256').update(v).digest('hex');
const original = fs.readFileSync(path.join(here, 'fixtures', 'restart-speed-2', 'command-secret-gateway-DCJZ8pGz.js'), 'utf8');

test('release file is exactly the patch applied to the bytes V runs', () => {
  assert.equal(sha(original), 'd139c36e955fa35cc42f02a26273b3e5551c409fb8e631bc84791564923a4e77');
  const patched = patchCommandSecretGateway(original);
  const [entry] = JSON.parse(fs.readFileSync(path.join(here, 'release-files', 'restart-speed-2', 'files.json'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(here, '..', entry.source), 'utf8'), patched);
  assert.equal(sha(patched), entry.after);
  assert.throws(() => patchCommandSecretGateway(patched), /already patched/);
});

test('only the secrets.resolve timeout changes, and only inside a Worker', () => {
  const patched = patchCommandSecretGateway(original);
  const before = original.split('\n');
  const after = patched.split('\n');
  assert.equal(after.length, before.length);
  const changed = after.map((line, i) => [before[i], line]).filter(([a, b]) => a !== b);
  assert.equal(changed.length, 1);
  assert.equal(changed[0][0], '\t\ttimeoutMs: 3e4,');
  assert.ok(changed[0][1].includes(MARKER));
  const timeoutFor = (env) => Function('process', `return (${changed[0][1].trim().replace(/^timeoutMs:\s*/, '').replace(/,$/, '').replace(MARKER, '')});`)({ env });
  assert.equal(timeoutFor({}), 30000, 'Gateway and CLI keep 30 s');
  assert.equal(timeoutFor({ VLAB_WORKER_CHILD: '1' }), 3000);
  assert.equal(timeoutFor({ VLAB_WORKER_CHILD: '1', OPENCLAW_WORKER_SECRETS_RESOLVE_TIMEOUT_MS: '30000' }), 30000, 'restores the old wait');
  assert.equal(timeoutFor({ VLAB_WORKER_CHILD: '1', OPENCLAW_WORKER_SECRETS_RESOLVE_TIMEOUT_MS: 'x' }), 3000);
});
