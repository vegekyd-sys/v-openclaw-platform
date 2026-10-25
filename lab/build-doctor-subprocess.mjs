// Build lab/release-files/doctor-subprocess/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist, unchanged since the 9.1 install; the first commit of the
// release files is that copy).
//   node lab/build-doctor-subprocess.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEFORE, MARKER, patch, sha256, unpatch } from './patch-doctor-subprocess.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = [];
for (const [name, before] of Object.entries(BEFORE)) {
  const source = `lab/release-files/doctor-subprocess/${name}`;
  const existing = fs.readFileSync(path.join(repo, source), 'utf8');
  const original = process.argv[2]
    ? fs.readFileSync(path.join(process.argv[2], name), 'utf8')
    : existing.includes(MARKER) ? unpatch(name, existing) : existing;
  if (sha256(original) !== before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const patched = patch(name, original);
  fs.writeFileSync(path.join(repo, source), patched);
  files.push({ source, target: `openclaw/dist/${name}`, before, after: sha256(patched) });
}
console.log(JSON.stringify({ baseRelease: 'REPLACE_AT_STAGE', files }, null, 2));
