// Build lab/release-files/worker-retain-run-owners/ from openclaw@2026.9.1's
// prepared-model-runtime chunk (V and VLab run it unmodified; see
// release/captured/base/openclaw@2026.9.1.json).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchPreparedModelRuntimeChunk } from './patch-worker-retain-run-owners.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  { name: 'prepared-model-runtime-C1N_aVhw.js', target: 'openclaw/dist/prepared-model-runtime-C1N_aVhw.js', before: '39118c7a4744c6f7a6b6bdeb01eb18c22e5462af50d32ba965c2384d529c0f75', patch: patchPreparedModelRuntimeChunk },
];
const out = [];
for (const file of files) {
  const original = fs.readFileSync(path.join(dir, 'release-files/openclaw-9.1-base', file.name), 'utf8');
  const before = sha(original);
  if (before !== file.before) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
  const patched = file.patch(original);
  const source = `lab/release-files/worker-retain-run-owners/${file.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: file.target, before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
