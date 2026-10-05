// Build lab/release-files/turn-caches/ from the npm 2026.9.1 bytes V runs (unmodified on V).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchBundledDir, patchChannelCatalog, patchTestRuntimeEnv } from './patch-turn-caches.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  { name: 'test-runtime-env-DQDRzsLt.js', before: 'e9000342045431ef87d95881cb707a6f4dcbef0543324adc23c20ea066d1e98a', patch: patchTestRuntimeEnv },
  { name: 'bundled-dir-CnR4u-Mo.js', before: 'fd6f3c0904307db1b5b0bd84722124a16cccb3481a4eef3cb78079839672773c', patch: patchBundledDir },
  { name: 'bundled-channel-catalog-read-BwcurWAL.js', before: 'cb86693938d17d74daddc9af70f008d24c7068da02d89c8f39d517560e09d92e', patch: patchChannelCatalog },
];
const out = [];
for (const file of files) {
  const original = fs.readFileSync(file.from ?? path.join(dir, 'fixtures/turn-caches', file.name), 'utf8');
  const before = sha(original);
  if (before !== file.before) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
  const patched = file.patch(original);
  const source = `lab/release-files/turn-caches/${file.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: file.target ?? `openclaw/dist/${file.name}`, before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
