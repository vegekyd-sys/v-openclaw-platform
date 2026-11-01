// Build lab/release-files/subagent-control-scoped-read/ from V's bytes and print the plan's file list.
//   node lab/build-subagent-control-scoped-read.mjs <V core dist dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, HELPER, RELEASE_DIR, patchFile, sha256 } from './patch-subagent-control-scoped-read.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = process.argv[2];
if (!dist) throw new Error('usage: build-subagent-control-scoped-read.mjs <V core dist dir>');
const out = [];
for (const [name, spec] of Object.entries(FILES)) {
  const patched = patchFile(name, fs.readFileSync(path.join(dist, name), 'utf8'));
  const file = path.join(repo, RELEASE_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, patched);
  out.push({ source: `${RELEASE_DIR}/${name}`, target: spec.target, before: spec.before, after: sha256(patched) });
}
out.push({ source: `${RELEASE_DIR}/${HELPER}`, target: `openclaw/dist/${HELPER}`, before: null, after: sha256(fs.readFileSync(path.join(repo, RELEASE_DIR, HELPER))) });
console.log(JSON.stringify({ baseRelease: 'REPLACE_AT_STAGE', files: out }, null, 2));
