// Builds lab/release-files/subagent-scoped-row-index/* from V's bytes and writes the release plan.
// Usage: node lab/build-subagent-scoped-row-index.mjs <dir holding V's core/dist files>
// (scp v:/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/<file> into that dir).
import fs from 'node:fs';
import path from 'node:path';
import { FILES, RELEASE_DIR, patchFile, sha256 } from './patch-subagent-scoped-row-index.mjs';

const source = process.argv[2];
if (!source) throw new Error('usage: build-subagent-scoped-row-index.mjs <V dist dir>');
const root = new URL('..', import.meta.url).pathname;
fs.mkdirSync(path.join(root, RELEASE_DIR), { recursive: true });
const files = [];
for (const name of Object.keys(FILES)) {
  const before = fs.readFileSync(path.join(source, name), 'utf8');
  const after = patchFile(name, before);
  fs.writeFileSync(path.join(root, RELEASE_DIR, name), after);
  files.push({ source: `${RELEASE_DIR}/${name}`, target: `openclaw/dist/${name}`, before: sha256(before), after: sha256(after) });
}
fs.writeFileSync(path.join(root, 'lab/subagent-scoped-row-index.plan.json'), `${JSON.stringify({ baseRelease: 'REPLACE_AT_STAGE', files }, null, 2)}\n`);
console.log(JSON.stringify(files, null, 2));
