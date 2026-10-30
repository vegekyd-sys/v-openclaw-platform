// Build lab/release-files/workboard-sweep-bounded/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist at v2026.9.1-db91.6-sessions-search-20261026, copied
// 2026-10-26). Without an argument it rebuilds from the release files (unpatch, check, patch).
//   node lab/build-workboard-sweep-bounded.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, sha256 } from './patch-workboard-sweep-bounded.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/workboard-sweep-bounded';
const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [] };
for (const [name, before, patch, unpatch] of FILES) {
  const source = `${dir}/${name}`;
  const original = process.argv[2]
    ? fs.readFileSync(path.join(process.argv[2], name), 'utf8')
    : unpatch(fs.readFileSync(path.join(repo, source), 'utf8'));
  if (sha256(original) !== before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const patched = patch(original);
  fs.mkdirSync(path.dirname(path.join(repo, source)), { recursive: true });
  fs.writeFileSync(path.join(repo, source), patched);
  plan.files.push({ source, target: `openclaw/dist/${name}`, before, after: sha256(patched) });
}
fs.writeFileSync(path.join(repo, 'lab/workboard-sweep-bounded.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
