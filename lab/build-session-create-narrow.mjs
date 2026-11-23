// Build lab/release-files/session-create-narrow/ from V's bytes.
//
//   node lab/build-session-create-narrow.mjs
//
// The bases are V's bytes as kept in this repository (FILES[].base): session-accessor-K0XuW6ln.js is the
// infer-latency release file, session-utils-store-Dlphca2N.js the session-sharing-bounded-reads release file,
// and session-create-service--hv2vsLh.js npm openclaw@2026.9.1's file (copied from V into v-base/). Dist patches
// replace whole files, so the targets are rebuilt from the bytes they replace; the plan records them as `before`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES } from './patch-session-create-narrow.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const OUTPUT_DIR = 'lab/release-files/session-create-narrow';
export const PLAN = 'lab/session-create-narrow.plan.json';

export function build() {
  fs.mkdirSync(path.join(repo, OUTPUT_DIR), { recursive: true });
  const files = [];
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(repo, file.base, file.name), 'utf8');
    if (sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)} (V bytes changed; refetch and update FILES)`);
    const patched = file.patch(original);
    const source = `${OUTPUT_DIR}/${file.name}`;
    fs.writeFileSync(path.join(repo, source), patched);
    files.push({ source, target: `${file.target}/${file.name}`, before: sha(original), after: sha(patched) });
  }
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files: files.map(({ after, ...entry }) => entry) };
  fs.writeFileSync(path.join(repo, PLAN), `${JSON.stringify(plan, null, 2)}\n`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
