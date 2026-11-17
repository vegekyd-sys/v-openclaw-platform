// Build lab/release-files/workboard-sweep-complete/ from V's bytes. Without an argument the original is the
// workboard-sweep-bounded (#487) release file, which is V's extensions/workboard/index.js (checked against `before`).
// With a V dist directory (db91-release-v2026.9.1-db91.6/core/dist) it reads it from there.
//   node lab/build-workboard-sweep-complete.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, sha256 } from './patch-workboard-sweep-complete.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/workboard-sweep-complete';
const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [] };
for (const [name, before, patch] of FILES) {
  const original = fs.readFileSync(process.argv[2] ? path.join(process.argv[2], name) : path.join(repo, 'lab/release-files/workboard-sweep-bounded', name), 'utf8');
  if (sha256(original) !== before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const source = `${dir}/${name}`;
  const patched = patch(original);
  fs.mkdirSync(path.dirname(path.join(repo, source)), { recursive: true });
  fs.writeFileSync(path.join(repo, source), patched);
  plan.files.push({ source, target: `openclaw/dist/${name}`, before, after: sha256(patched) });
}
fs.writeFileSync(path.join(repo, 'lab/workboard-sweep-complete.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
