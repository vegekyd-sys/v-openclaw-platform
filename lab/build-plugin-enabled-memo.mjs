// Build lab/release-files/plugin-enabled-memo/ from V's bytes and print the plan.
//   node lab/build-plugin-enabled-memo.mjs <V core dist dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, RELEASE_DIR, patchFile, sha256 } from './patch-plugin-enabled-memo.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = process.argv[2];
if (!dist) throw new Error('usage: build-plugin-enabled-memo.mjs <V core dist dir>');
const files = [];
for (const [name, spec] of Object.entries(FILES)) {
  const patched = patchFile(name, fs.readFileSync(path.join(dist, name), 'utf8'));
  const file = path.join(repo, RELEASE_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, patched);
  files.push({ source: `${RELEASE_DIR}/${name}`, target: spec.target, before: spec.before, after: sha256(patched) });
}
console.log(JSON.stringify({ baseRelease: 'REPLACE_AT_STAGE', files }, null, 2));
