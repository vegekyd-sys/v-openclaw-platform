// Build lab/release-files/firsttext-gap-marks/ from V's live agent-command and
// embedded-agent chunks (release/captured/v2026.9.1-db91.6-firsttext-r1-20261006).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchAgentCommandChunk, patchEmbeddedAgentChunk } from './patch-firsttext-gap-marks.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const capture = 'release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist';
export const GAP_MARK_INPUTS = [
  { name: 'agent-command-DPfawBbr.js', before: '82e7ca49babbe4638428ebc472855dd408e5c46a3bef0fe798ffcca9279540e0', patch: patchAgentCommandChunk },
  { name: 'embedded-agent-DaSvA-Yk.js', before: '94fc21cb0511287baf7b7d1196075619a105958d6e2308eb75f5d31452aa749b', patch: patchEmbeddedAgentChunk },
];
const out = [];
for (const input of GAP_MARK_INPUTS) {
  const original = fs.readFileSync(path.join(repo, capture, input.name), 'utf8');
  if (sha(original) !== input.before) throw new Error(`Unexpected ${input.name} checksum: ${sha(original)}`);
  const patched = input.patch(original);
  const source = `lab/release-files/firsttext-gap-marks/${input.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: `openclaw/dist/${input.name}`, before: sha(original), after: sha(patched) });
}
const helper = 'lab/release-files/firsttext-gap-marks/firsttext-gap-marks.mjs';
out.push({ source: helper, target: 'openclaw/dist/firsttext-gap-marks.mjs', before: null, after: sha(fs.readFileSync(path.join(repo, helper))) });
console.log(JSON.stringify(out, null, 2));
