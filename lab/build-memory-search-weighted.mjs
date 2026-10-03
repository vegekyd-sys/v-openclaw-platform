// Build the memory-search-weighted release file on top of memory-search-mixed (on V since 2026-10-02).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWeightedTermCoverage } from './patch-memory-search-fast.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const file = {
  input: path.join(dir, 'release-files/memory-search-mixed/manager-runtime.js'),
  source: 'lab/release-files/memory-search-weighted/manager-runtime.js',
  target: 'openclaw/dist/extensions/memory-core/manager-runtime.js',
  before: '9594ce287b37d563d9cff7f409bc3e5b017eafc59a4c28e288a91eff7f4e02c4',
};
const original = fs.readFileSync(file.input, 'utf8');
if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.input}`);
const patched = patchWeightedTermCoverage(original);
fs.mkdirSync(path.join(repo, path.dirname(file.source)), { recursive: true });
fs.writeFileSync(path.join(repo, file.source), patched);
console.log(JSON.stringify({ source: file.source, target: file.target, before: file.before, after: sha(patched) }, null, 2));
