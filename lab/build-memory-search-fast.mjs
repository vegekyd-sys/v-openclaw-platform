// Build the memory-search-fast release files from the bytes V runs.
// usage: node lab/build-memory-search-fast.mjs <dir holding V's dist/ files>
// The manager input is lab/release-files/memory-vector-chunks-manager.js, which is
// byte-identical to V's extensions/memory-core/manager-runtime.js (2026-10-02).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchKnnChild, patchKnnQueryModule, patchSearchEmbeddingOverlap } from './patch-memory-search-fast.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const stockDist = process.argv[2];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  {
    input: path.join(dir, 'release-files/memory-vector-chunks-manager.js'),
    source: 'lab/release-files/memory-search-fast/manager-runtime.js',
    target: 'openclaw/dist/extensions/memory-core/manager-runtime.js',
    before: '115e5f41ab576192389c0d0282baccdf79ac7a8acbbea2b7873602bf89242f9d',
    patch: patchSearchEmbeddingOverlap,
  },
  {
    input: stockDist && path.join(stockDist, 'manager-search-knn-NiSMMJUM.js'),
    source: 'lab/release-files/memory-search-fast/manager-search-knn-NiSMMJUM.js',
    target: 'openclaw/dist/manager-search-knn-NiSMMJUM.js',
    before: '124e05bd8aecdcf05f39826d72f9764bbcbab608f96c308df8eb0a906afcd520',
    patch: patchKnnQueryModule,
  },
  {
    input: stockDist && path.join(stockDist, 'extensions/memory-core/memory-search-knn.child.js'),
    source: 'lab/release-files/memory-search-fast/memory-search-knn.child.js',
    target: 'openclaw/dist/extensions/memory-core/memory-search-knn.child.js',
    before: 'a106f83918b30675b911e5fc071a12ef70d0ebdecf05d5130b78df8cf0748fc0',
    patch: patchKnnChild,
  },
];

if (!stockDist) throw new Error('usage: build-memory-search-fast.mjs <V dist dir>');
const repo = path.dirname(dir);
fs.mkdirSync(path.join(repo, 'lab/release-files/memory-search-fast'), { recursive: true });
const out = [];
for (const file of files) {
  const original = fs.readFileSync(file.input, 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.input}`);
  const patched = file.patch(original);
  fs.writeFileSync(path.join(repo, file.source), patched);
  out.push({ source: file.source, target: file.target, before: file.before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
