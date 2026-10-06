// Build lab/release-files/worker-model-selected-async/ from the worker-prewarm-v Worker (the
// bytes V runs since #198).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorker } from './patch-worker-model-selected-async.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const base = path.join(dir, 'release-files/worker-prewarm-v');
const files = [
  { name: 'worker.mjs', target: 'production-worker/worker.mjs', before: '898fd1fc67d5cdfc5a4b7a926aa08cead56b97d37c385a661edd2c518d7ae6c3', patch: patchWorker },
];
const out = [];
for (const file of files) {
  const original = fs.readFileSync(path.join(base, file.name), 'utf8');
  const before = sha(original);
  if (before !== file.before) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
  const patched = file.patch(original);
  const source = `lab/release-files/worker-model-selected-async/${file.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: file.target, before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
