// Build lab/release-files/sqlite-hold-callsite/ and lab/sqlite-hold-callsite.plan.json from V's live bytes.
//
//   node lab/build-sqlite-hold-callsite.mjs
//
// Input is V's node-sqlite as captured in release/captured/v2026.9.1-db91.6-voice-task-continuity-20261016-r3
// (b4516f85, the npm 2026.9.1 file plus codex-turn-tail-v1; checked on V and on shared VLab 2026-10-16).
// Dist patches replace whole files, so the plan records those bytes' sha256 as `before`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchNodeSqlite } from './patch-sqlite-hold-callsite.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const FILES = [
  {
    from: 'release/captured/v2026.9.1-db91.6-voice-task-continuity-20261016-r3/dist/node-sqlite-CL-d6drd.js',
    name: 'node-sqlite-CL-d6drd.js',
    before: 'b4516f85c6e5dc59d8eccd454773af12bac73e9363e32fb1ad34eaa98b7cbdb5',
    patch: patchNodeSqlite,
  },
];
export const OUTPUT_DIR = 'lab/release-files/sqlite-hold-callsite';
export const PLAN = 'lab/sqlite-hold-callsite.plan.json';

export function build() {
  fs.mkdirSync(path.join(repo, OUTPUT_DIR), { recursive: true });
  const files = [];
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(repo, file.from), 'utf8');
    if (sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)} (V bytes changed; recapture and update FILES)`);
    const patched = file.patch(original);
    const source = `${OUTPUT_DIR}/${file.name}`;
    fs.writeFileSync(path.join(repo, source), patched);
    files.push({ source, target: `openclaw/dist/${file.name}`, before: file.before, after: sha(patched) });
  }
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files: files.map(({ after, ...entry }) => entry) };
  fs.writeFileSync(path.join(repo, PLAN), `${JSON.stringify(plan, null, 2)}\n`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
