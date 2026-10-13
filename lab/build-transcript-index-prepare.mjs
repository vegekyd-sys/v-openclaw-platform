// Builds lab/release-files/transcript-index-prepare from V's exact db91.6 bytes
// (lab/fixtures/transcript-index-prepare, both files are upstream 2026.9.1 bytes on V,
// checked on V core/dist 2026-10-13). Never touches a live runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchTranscriptProjectionSinglePass } from './patch-transcript-projection-single-pass.mjs';
import { patchTranscriptReconcileReadOnly } from './patch-transcript-reconcile-readonly.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  { name: 'session-transcript-index-9itOio9h.js', before: 'ae034fcf43287501cf1417231e6e2e09638c03a0729795e53d59c8fb8b6db42d', patch: patchTranscriptProjectionSinglePass },
  // fixture and source are stored flat: the repository ignores every directory named sessions/
  { name: 'session-transcript-reconcile.worker.js', target: 'config/sessions/session-transcript-reconcile.worker.js', before: '9e67616999c6454ad460cff9e02a06cff9658a61f6f613065f370a587eade041', patch: patchTranscriptReconcileReadOnly },
];
const plan = { files: [] };
for (const file of files) {
  const original = fs.readFileSync(path.join(root, 'lab/fixtures/transcript-index-prepare', file.name), 'utf8');
  assert.equal(sha(original), file.before, `fixture ${file.name} is not V's bytes`);
  const patched = file.patch(original);
  const source = `lab/release-files/transcript-index-prepare/${file.name}`;
  fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
  fs.writeFileSync(path.join(root, source), patched);
  plan.files.push({ source, target: `openclaw/dist/${file.target ?? file.name}`, before: file.before, after: sha(patched) });
}
fs.writeFileSync(path.join(root, 'lab/transcript-index-prepare-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
