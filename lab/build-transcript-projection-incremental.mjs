// Builds lab/release-files/transcript-projection-incremental from V's exact bytes
// (lab/fixtures/transcript-projection-incremental; checked against V core/dist on 2026-10-17
// 04:20 CST, after projection-checkpoint-20261017 / #405). Never touches a live runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchTranscriptIndexIncremental, patchTranscriptReconcileIncremental, patchTranscriptReconcileWorkerIncremental } from './patch-transcript-projection-incremental.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const TRANSCRIPT_PROJECTION_INCREMENTAL_FILES = [
  // V's index chunk is the #405 release (lab/release-files/transcript-projection-checkpoint)
  { name: 'session-transcript-index-9itOio9h.js', before: 'd0e05a562dde0b6076d464698de2dfc4f786d08d261745c85a5fa558b945d7c1', patch: patchTranscriptIndexIncremental },
  { name: 'session-transcript-reconcile-j5qhAafV.js', before: 'b63bdf05e20f48fdb9b00c9759efc70fd4333c412adfca91a768d47443f057ae', patch: patchTranscriptReconcileIncremental },
  // stored flat: the repository ignores every directory named sessions/
  { name: 'session-transcript-reconcile.worker.js', target: 'config/sessions/session-transcript-reconcile.worker.js', before: '95b9ddcd7d8bb9748e8263959e43af514d9ba70e2045aa3e668cc6a347bfcb5e', patch: patchTranscriptReconcileWorkerIncremental },
];

export function buildTranscriptProjectionIncremental() {
  const plan = { files: [] };
  for (const file of TRANSCRIPT_PROJECTION_INCREMENTAL_FILES) {
    const original = fs.readFileSync(path.join(root, 'lab/fixtures/transcript-projection-incremental', file.name), 'utf8');
    assert.equal(sha(original), file.before, `fixture ${file.name} is not V's bytes`);
    const patched = file.patch(original);
    const source = `lab/release-files/transcript-projection-incremental/${file.name}`;
    fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
    fs.writeFileSync(path.join(root, source), patched);
    plan.files.push({ source, target: `openclaw/dist/${file.target ?? file.name}`, before: file.before, after: sha(patched) });
  }
  fs.writeFileSync(path.join(root, 'lab/transcript-projection-incremental-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildTranscriptProjectionIncremental(), null, 2));
}
