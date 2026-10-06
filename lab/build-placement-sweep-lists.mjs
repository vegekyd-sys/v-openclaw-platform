// Build lab/release-files/placement-sweep-lists/ from V's live bytes.
//   server-worker-placement-startup-BvPREvpr.js  V after firsttext-r1 (captured 2026-10-06, #193's
//                                                 placement-evidence-absence release)
//   placement-store-CkyLHi6x.js                  unmodified on V: npm openclaw@2026.9.1, read from
//                                                 the dist directory given as the first argument
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchPlacementStartup, patchPlacementStore } from './patch-placement-sweep-lists.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const npmDist = process.argv[2];
if (!npmDist) throw new Error('usage: node lab/build-placement-sweep-lists.mjs <npm openclaw@2026.9.1 dist>');
const files = [
  { name: 'placement-store-CkyLHi6x.js', from: path.join(npmDist, 'placement-store-CkyLHi6x.js'), before: 'f7c7b41c8748a077448728c97dbd5d08510e9c931af40e02e2801b5072a7c24f', patch: patchPlacementStore },
  { name: 'server-worker-placement-startup-BvPREvpr.js', from: path.join(repo, 'release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/server-worker-placement-startup-BvPREvpr.js'), before: '8366d71a63fce504ff122e99581f4fffb0bde96613402f31478aa4e26846c781', patch: patchPlacementStartup },
];
const out = [];
fs.mkdirSync(path.join(repo, 'lab/release-files/placement-sweep-lists'), { recursive: true });
for (const file of files) {
  const original = fs.readFileSync(file.from, 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.name}`);
  const patched = file.patch(original);
  const source = `lab/release-files/placement-sweep-lists/${file.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: `openclaw/dist/${file.name}`, before: file.before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
