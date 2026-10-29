import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { restoredWorker, sha, BEFORE, AFTER } from './build-worker-secret-egress-restore.mjs';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const base = read('./release-files/upstream-5xx-fallback/worker.mjs');
const restored = read('./release-files/worker-secret-egress-restore/worker.mjs');

test('current composed Worker preserves all bytes except the existing egress hook', () => {
  assert.equal(sha(base), BEFORE);
  assert.equal(restoredWorker(base), restored);
  assert.equal(sha(restored), AFTER);
  // A later feature must not be silently replaced by a historical whole-file asset.
  assert.throws(() => restoredWorker(base + '\n// later feature\n'), /baseline changed/);
  assert.throws(() => restoredWorker(restored), /baseline changed/);
});

test('startup and request-finally retain egress initialization and revocation', () => {
  const start = restored.indexOf('workerSecretEgress = await startWorkerSecretEgress(');
  const ready = restored.indexOf('let runtimePrewarm = { status: "disabled" };');
  assert(start > 0 && start < ready);
  assert.match(restored, /finally \{\s+activeControllers.delete\(message.id\);\s+if \(message.kind === "agent" && message.runId\) workerSecretEgress\?\.revokeRun\(message.runId\);/);
  assert.match(restored, /active.request\?\.kind === "agent"\)\) workerSecretEgress\?\.revokeAll\(\)/);
});
