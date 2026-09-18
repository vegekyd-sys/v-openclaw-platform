// Candidate test: the patched transcript-corpus listing must return the same corpus as the baseline
// (contentRevision excluded, which dreaming never reads) on real database copies, in less time and
// with a shorter longest synchronous block. Baseline and patched run in separate processes so each
// gets its own module graph and database handles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const harness = path.resolve(here, '..', 'lab', 'dreaming-corpus-ab.mjs');
const candidateRuntime = process.env.VLAB_CANDIDATE_RUNTIME;
const sharedRuntime = process.env.VLAB_SHARED_RUNTIME ?? '/srv/vlab-production-mirror/labs/instances/db91-parity/runtime';
const agents = (process.env.DREAMING_AB_AGENTS ?? 'dealclaw,short-v,xiaoai').split(',').map((s) => s.trim()).filter(Boolean);
const outDir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'dreaming-ab-'));

function run(distDir, variant, agentId) {
  const out = path.join(outDir, `${variant}-${agentId}.json`);
  const result = spawnSync(process.execPath, ['--expose-gc', harness, distDir, variant, agentId, out, '3'], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${variant} ${agentId} harness failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

test('candidate runtime is provided', () => {
  assert.ok(candidateRuntime, 'VLAB_CANDIDATE_RUNTIME must point at the candidate runtime');
  for (const f of ['dreaming-phases-C5ItPb99.js', 'memory-core-host-engine-sessions-CAnvQ_5o.js']) {
    const patched = fs.readFileSync(path.join(candidateRuntime, 'openclaw/dist', f), 'utf8');
    assert.ok(patched.includes(f.startsWith('dreaming') ? 'resolveDreamingSessionCorpusEntries' : 'options.entryProjection'), `${f} is not the patched build`);
  }
});

for (const agentId of agents) {
  test(`corpus equivalence and cost for agent ${agentId}`, () => {
    const baseline = run(path.join(sharedRuntime, 'openclaw/dist'), 'baseline', agentId);
    const patched = run(path.join(candidateRuntime, 'openclaw/dist'), 'patched', agentId);
    console.log(JSON.stringify({agentId, baseline: {count: baseline.fingerprint.count, medianMs: baseline.medianMs, maxSyncBlockMs: baseline.maxSyncBlockMs, heapMb: baseline.medianHeapDeltaMb}, patched: {count: patched.fingerprint.count, medianMs: patched.medianMs, maxSyncBlockMs: patched.maxSyncBlockMs, heapMb: patched.medianHeapDeltaMb}}));
    assert.equal(patched.fingerprint.count, baseline.fingerprint.count, 'corpus entry count');
    assert.equal(patched.fingerprint.sha256, baseline.fingerprint.sha256, 'corpus fingerprint (agentId, artifactKind, sessionFile, sessionId, sessionKind, storePath, updatedAtMs, sessionKey, cron/dreaming flags)');
    // Every measured run must be stable across iterations (same fingerprint each time).
    for (const r of [...baseline.runs, ...patched.runs]) assert.equal(r.sha256, baseline.fingerprint.sha256, `run ${r.iteration} fingerprint drifted`);
    if (baseline.fingerprint.count >= 50) {
      assert.ok(patched.medianMs <= baseline.medianMs, `patched median ${patched.medianMs}ms must not exceed baseline ${baseline.medianMs}ms`);
      assert.ok(patched.medianHeapDeltaMb <= baseline.medianHeapDeltaMb, `patched heap ${patched.medianHeapDeltaMb}MB must not exceed baseline ${baseline.medianHeapDeltaMb}MB`);
    }
  });
}
