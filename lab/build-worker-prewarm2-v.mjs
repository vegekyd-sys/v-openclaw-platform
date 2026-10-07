// Build lab/release-files/worker-prewarm2-v/ from the worker-prewarm-v release files (the
// bytes V runs since #198).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchAgentCommandChunk, patchWorker } from './patch-worker-prewarm2-v.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const base = path.join(dir, 'release-files/worker-prewarm-v');
const files = [
  { name: 'agent-command-DPfawBbr.js', target: 'openclaw/dist/agent-command-DPfawBbr.js', before: 'e8a0c7e4210989f454a75fc7b6fd7c2c332e79f2e336467f5f301bb5fc8cddf1', patch: patchAgentCommandChunk },
  { name: 'worker.mjs', target: 'production-worker/worker.mjs', before: '898fd1fc67d5cdfc5a4b7a926aa08cead56b97d37c385a661edd2c518d7ae6c3', patch: patchWorker },
];
const out = [];
for (const file of files) {
  const original = fs.readFileSync(path.join(base, file.name), 'utf8');
  const before = sha(original);
  if (before !== file.before) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
  const patched = file.patch(original);
  const source = `lab/release-files/worker-prewarm2-v/${file.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: file.target, before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
