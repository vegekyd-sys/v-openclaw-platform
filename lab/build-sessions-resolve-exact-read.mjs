// Build lab/release-files/sessions-resolve-exact-read/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist, unchanged since the 9.1 install; the first commit of the
// release file is that copy).
//   node lab/build-sessions-resolve-exact-read.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEFORE_SHA, NAME, patchSessionsResolve, sha256, unpatchSessionsResolve } from './patch-sessions-resolve-exact-read.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = `lab/release-files/sessions-resolve-exact-read/${NAME}`;
const existing = fs.readFileSync(path.join(repo, source), 'utf8');
const original = process.argv[2]
  ? fs.readFileSync(path.join(process.argv[2], NAME), 'utf8')
  : existing.includes('sessions-resolve-exact-read') ? unpatchSessionsResolve(existing) : existing;
if (sha256(original) !== BEFORE_SHA) throw new Error(`Unexpected ${NAME} checksum ${sha256(original)}`);
const patched = patchSessionsResolve(original);
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify({ source, target: `openclaw/dist/${NAME}`, before: BEFORE_SHA, after: sha256(patched) }, null, 2));
