// Build lab/release-files/gateway-freeze-lookups/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist; the first commit of each release file is that copy).
//   node lab/build-gateway-freeze-lookups.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER, sha256 } from './patch-gateway-freeze-lookups.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = [];
for (const [name, file] of Object.entries(FILES)) {
  const source = `lab/release-files/gateway-freeze-lookups/${name}`;
  const existing = fs.readFileSync(path.join(repo, source), 'utf8');
  const original = process.argv[2]
    ? fs.readFileSync(path.join(process.argv[2], name), 'utf8')
    : existing.includes(MARKER) ? file.unpatch(existing) : existing;
  if (sha256(original) !== file.before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const patched = file.patch(original);
  fs.writeFileSync(path.join(repo, source), patched);
  files.push({ source, target: `openclaw/dist/${name}`, before: file.before, after: sha256(patched) });
}
const plan = { baseRelease: 'REPLACE_AT_STAGE', files };
fs.writeFileSync(path.join(repo, 'lab/gateway-freeze-lookups.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
