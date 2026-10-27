// Build lab/release-files/run-session-lookup-exact/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist, unchanged since the 9.1 install; the first commit of the
// release file is that copy).
//   node lab/build-run-session-lookup-exact.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEFORE_SHA, MARKER, NAME, patchRunSessionLookup, sha256, unpatchRunSessionLookup } from './patch-run-session-lookup-exact.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = `lab/release-files/run-session-lookup-exact/${NAME}`;
const existing = fs.readFileSync(path.join(repo, source), 'utf8');
const original = process.argv[2]
  ? fs.readFileSync(path.join(process.argv[2], NAME), 'utf8')
  : existing.includes(MARKER) ? unpatchRunSessionLookup(existing) : existing;
if (sha256(original) !== BEFORE_SHA) throw new Error(`Unexpected ${NAME} checksum ${sha256(original)}`);
const patched = patchRunSessionLookup(original);
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify({ source, target: `openclaw/dist/${NAME}`, before: BEFORE_SHA, after: sha256(patched) }, null, 2));
