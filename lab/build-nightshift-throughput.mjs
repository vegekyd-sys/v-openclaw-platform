// Builds lab/release-files/nightshift-throughput/* from the repo copies of V's bytes (each checked
// against V's sha) and writes lab/nightshift-throughput.plan.json.
import fs from 'node:fs';
import path from 'node:path';
import { FILES, RELEASE_DIR, patchFile, sha256 } from './patch-nightshift-throughput.mjs';

const root = new URL('..', import.meta.url).pathname;
fs.mkdirSync(path.join(root, RELEASE_DIR), { recursive: true });
const files = [];
for (const [name, spec] of Object.entries(FILES)) {
  const before = fs.readFileSync(path.join(root, spec.from), 'utf8');
  const after = patchFile(name, before);
  fs.writeFileSync(path.join(root, RELEASE_DIR, name), after);
  files.push({ source: `${RELEASE_DIR}/${name}`, target: spec.target, before: sha256(before), after: sha256(after) });
}
fs.writeFileSync(path.join(root, 'lab/nightshift-throughput.plan.json'), `${JSON.stringify({ baseRelease: 'REPLACE_AT_STAGE', files }, null, 2)}\n`);
console.log(JSON.stringify(files, null, 2));
