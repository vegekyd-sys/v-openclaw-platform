// Builds lab/release-files/card-memory-read-only/ from V's bytes (lab/fixtures/card-memory-read-only/) and
// writes lab/card-memory-read-only.plan.json.
import fs from 'node:fs';
import path from 'node:path';
import { NAME, RELEASE_DIR, patchFile, sha256 } from './patch-card-memory-read-only.mjs';

const root = new URL('..', import.meta.url).pathname;
const before = fs.readFileSync(path.join(root, 'lab/fixtures/card-memory-read-only', NAME), 'utf8');
const after = patchFile(before);
fs.mkdirSync(path.join(root, RELEASE_DIR), { recursive: true });
fs.writeFileSync(path.join(root, RELEASE_DIR, NAME), after);
const files = [{ source: `${RELEASE_DIR}/${NAME}`, target: `openclaw/dist/${NAME}`, before: sha256(before), after: sha256(after) }];
fs.writeFileSync(path.join(root, 'lab/card-memory-read-only.plan.json'), `${JSON.stringify({ baseRelease: 'REPLACE_AT_STAGE', files }, null, 2)}\n`);
console.log(JSON.stringify(files, null, 2));
