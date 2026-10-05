// Build lab/release-files/worker-prewarm-v/ from V's live bytes (captured 2026-10-05).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchAgentCommandChunk, patchAgentCommandFacade, patchWorker } from './patch-worker-prewarm-v.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const captured = path.join(repo, 'release/captured/v2026.9.1-db91.6-gpt-live-voice-20261005');
const files = [
  { from: `${captured}/dist/agent-command-DPfawBbr.js`, name: 'agent-command-DPfawBbr.js', target: 'openclaw/dist/agent-command-DPfawBbr.js', before: 'f914243041fab139683a7fbf74ed6817da3312791e89dc3586d981e88c83df4a', patch: patchAgentCommandChunk },
  // unmodified upstream file on V: the npm 2026.9.1 bytes
  { from: path.join(dir, 'fixtures/worker-prewarm-v/agent-command-DeP5kHlK.js'), name: 'agent-command-DeP5kHlK.js', target: 'openclaw/dist/agent-command-DeP5kHlK.js', before: '893415c5f2bb79551a48b8571099f85743f8f04329235eda2f268e0b7634835a', patch: patchAgentCommandFacade },
  { from: `${captured}.worker/dist/worker.mjs`, name: 'worker.mjs', target: 'production-worker/worker.mjs', before: '4bf1472d5462bfd59ea4ec264c55cb46d35f8281f3479140005b94af5d276c51', patch: patchWorker },
];
const out = [];
for (const file of files) {
  const original = fs.readFileSync(file.from, 'utf8');
  const before = sha(original);
  if (file.before && before !== file.before) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
  const patched = file.patch(original);
  const source = `lab/release-files/worker-prewarm-v/${file.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: file.target, before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
