// Builds lab/release-files/transcript-projection-checkpoint from V's exact bytes
// (lab/fixtures/transcript-projection-checkpoint, checked against V core/dist on 2026-10-17
// 01:40 CST: all 8600 dist files of the running Gateway hashed equal to the local copy).
// Never touches a live runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchBuiltinAttemptOpenCheckpoint, patchTranscriptIndexCheckpoint, patchTranscriptStoreCheckpoint } from './patch-transcript-projection-checkpoint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const TRANSCRIPT_PROJECTION_CHECKPOINT_FILES = [
  { name: 'session-transcript-index-9itOio9h.js', before: '5504f5decee060251f991e658a809a53e2548e4727cfb2838499a5a7c2ce84b1', patch: patchTranscriptIndexCheckpoint },
  { name: 'session-accessor.sqlite-transcript-store-DV0WFe1a.js', before: '0592e1cd88d5cb2261b94dc972b12baa591099f6f6da2f7042bdc6e0e6bfa397', patch: patchTranscriptStoreCheckpoint },
  // V's bytes are the subagent-completion-projection release (lab/release-files/subagent-completion-projection)
  { name: 'builtin-openclaw-zQV8Wwjr.js', before: '71c2310a73dbfa66d70fe560ff13132c620f0033439e604417842412758a67bc', patch: patchBuiltinAttemptOpenCheckpoint },
];

export function buildTranscriptProjectionCheckpoint() {
  const plan = { files: [] };
  for (const file of TRANSCRIPT_PROJECTION_CHECKPOINT_FILES) {
    const original = fs.readFileSync(path.join(root, 'lab/fixtures/transcript-projection-checkpoint', file.name), 'utf8');
    assert.equal(sha(original), file.before, `fixture ${file.name} is not V's bytes`);
    const patched = file.patch(original);
    const source = `lab/release-files/transcript-projection-checkpoint/${file.name}`;
    fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
    fs.writeFileSync(path.join(root, source), patched);
    plan.files.push({ source, target: `openclaw/dist/${file.name}`, before: file.before, after: sha(patched) });
  }
  fs.writeFileSync(path.join(root, 'lab/transcript-projection-checkpoint-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildTranscriptProjectionCheckpoint(), null, 2));
}
