// Builds lab/release-files/transcript-projection-fixed-cost from V's exact bytes: the #411 release
// files (lab/release-files/transcript-projection-incremental), which V core/dist carries since
// projection-incremental-20261017 (checked on V 2026-10-17 13:50 CST). Never touches a live runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchTranscriptReconcileFixedCost, patchTranscriptReconcileWorkerFixedCost } from './patch-transcript-projection-fixed-cost.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const TRANSCRIPT_PROJECTION_FIXED_COST_FILES = [
  { name: 'session-transcript-reconcile-j5qhAafV.js', before: '9fac1d4af9f55f7e5ad430bf24512c2bd6d037a6916bed950dfcdf7829e3c7bd', patch: patchTranscriptReconcileFixedCost },
  // stored flat: the repository ignores every directory named sessions/
  { name: 'session-transcript-reconcile.worker.js', target: 'config/sessions/session-transcript-reconcile.worker.js', before: '2fa289ddec026dd55a6b88dc929c561db30e3b69638091b68ed64bf59b2f6388', patch: patchTranscriptReconcileWorkerFixedCost },
];

export function buildTranscriptProjectionFixedCost() {
  const plan = { files: [] };
  for (const file of TRANSCRIPT_PROJECTION_FIXED_COST_FILES) {
    const original = fs.readFileSync(path.join(root, 'lab/release-files/transcript-projection-incremental', file.name), 'utf8');
    assert.equal(sha(original), file.before, `${file.name} is not V's bytes`);
    const patched = file.patch(original);
    const source = `lab/release-files/transcript-projection-fixed-cost/${file.name}`;
    fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
    fs.writeFileSync(path.join(root, source), patched);
    plan.files.push({ source, target: `openclaw/dist/${file.target ?? file.name}`, before: file.before, after: sha(patched) });
  }
  fs.writeFileSync(path.join(root, 'lab/transcript-projection-fixed-cost-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildTranscriptProjectionFixedCost(), null, 2));
}
