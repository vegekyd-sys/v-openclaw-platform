// Build lab/release-files/sessions-search-candidate-rows/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist, the same bytes as release/captured/feishu-conversations-20261024/dist;
// the first commit of each release file is that copy).
//   node lab/build-sessions-search-candidate-rows.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER, sha256 } from './patch-sessions-search-candidate-rows.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/sessions-search-candidate-rows';
fs.mkdirSync(path.join(repo, dir), { recursive: true });
const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [] };
for (const [name, before, patch, unpatch] of FILES) {
  const source = `${dir}/${name}`;
  const existing = path.join(repo, source);
  const original = process.argv[2]
    ? fs.readFileSync(path.join(process.argv[2], name), 'utf8')
    : fs.existsSync(existing)
      ? (() => { const s = fs.readFileSync(existing, 'utf8'); return s.includes(MARKER) ? unpatch(s) : s; })()
      : fs.readFileSync(path.join(repo, 'release/captured/feishu-conversations-20261024/dist', name), 'utf8');
  if (sha256(original) !== before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const patched = patch(original);
  if (unpatch(patched) !== original) throw new Error(`${name} does not unpatch to V's bytes`);
  fs.writeFileSync(existing, patched);
  plan.files.push({ source, target: `openclaw/dist/${name}`, before, after: sha256(patched) });
}
fs.writeFileSync(path.join(repo, 'lab/sessions-search-candidate-rows.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
