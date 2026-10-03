// Build the memory-search-mixed release file on top of memory-search-1s (on V since 2026-10-02).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchHybridRescoring } from './patch-memory-search-fast.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const file = {
  input: path.join(dir, 'release-files/memory-search-1s/manager-runtime.js'),
  source: 'lab/release-files/memory-search-mixed/manager-runtime.js',
  target: 'openclaw/dist/extensions/memory-core/manager-runtime.js',
  before: 'a94e2079535984d259d43bca4ac8006d89b65b422a5983ddd3e708e1bc3731da',
};
const original = fs.readFileSync(file.input, 'utf8');
if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.input}`);
const patched = patchHybridRescoring(original);
fs.mkdirSync(path.join(repo, path.dirname(file.source)), { recursive: true });
fs.writeFileSync(path.join(repo, file.source), patched);
console.log(JSON.stringify({ source: file.source, target: file.target, before: file.before, after: sha(patched) }, null, 2));
