// Build the memory-search-1s release files on top of memory-search-fast (on V since 2026-10-02).
// usage: node lab/build-memory-search-1s.mjs <dir holding V's dist/ files>
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchSessionVisibilityFastPath, patchSpareKnnChild } from './patch-memory-search-fast.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const stockDist = process.argv[2];
if (!stockDist) throw new Error('usage: build-memory-search-1s.mjs <V dist dir>');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  {
    input: path.join(dir, 'release-files/memory-search-fast/manager-runtime.js'),
    source: 'lab/release-files/memory-search-1s/manager-runtime.js',
    target: 'openclaw/dist/extensions/memory-core/manager-runtime.js',
    before: 'c6f97543ab75f568d76045148318e0dfb059ef45afadd484ea66f7365a68d9aa',
    patch: patchSpareKnnChild,
  },
  {
    input: path.join(stockDist, 'session-search-visibility-H6aL2Pcb.js'),
    source: 'lab/release-files/memory-search-1s/session-search-visibility-H6aL2Pcb.js',
    target: 'openclaw/dist/session-search-visibility-H6aL2Pcb.js',
    before: 'badc3d4c1cd555862da0972de30f04f0eeb46ab45749094f7c4e4b5539cb3e46',
    patch: patchSessionVisibilityFastPath,
  },
];

fs.mkdirSync(path.join(repo, 'lab/release-files/memory-search-1s'), { recursive: true });
const out = [];
for (const file of files) {
  const original = fs.readFileSync(file.input, 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.input}`);
  const patched = file.patch(original);
  fs.writeFileSync(path.join(repo, file.source), patched);
  out.push({ source: file.source, target: file.target, before: file.before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
