// Build the memory-search-overlap release file on top of memory-search-vector-budget (V since 2026-10-20).
// usage: node lab/build-memory-search-overlap.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchKeywordDuringKnn } from './patch-memory-search-overlap.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const file = {
  input: path.join(dir, 'release-files/memory-search-vector-budget/manager-runtime.js'),
  source: 'lab/release-files/memory-search-overlap/manager-runtime.js',
  target: 'openclaw/dist/extensions/memory-core/manager-runtime.js',
  before: '272177d58386e53e0f5ae2113d704005e192e98f3886db5fcd20e277f0f4fb90',
};
const original = fs.readFileSync(file.input, 'utf8');
if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.input}`);
const patched = patchKeywordDuringKnn(original);
fs.mkdirSync(path.join(repo, path.dirname(file.source)), { recursive: true });
fs.writeFileSync(path.join(repo, file.source), patched);
console.log(JSON.stringify({ source: file.source, target: file.target, before: file.before, after: sha(patched) }, null, 2));
