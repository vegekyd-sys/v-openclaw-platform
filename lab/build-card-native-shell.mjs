// Build lab/release-files/card-native-shell/ from V's bytes.
//
//   node lab/build-card-native-shell.mjs
//
// The bases are V's live bytes as kept in this repository (FILES[].base): the Codex harness from
// background-work-20261002/vlab-codex-parity, thread-lifecycle from codex-turn-context-handoff, the core
// runtime-Cy2RRq4n.js (secret egress proxy) from egress-proxy-tls-reuse. Dist patches
// replace whole files, so the targets are rebuilt from the bytes they replace; the plan records them as `before`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES as SHELL_FILES } from './patch-card-native-shell.mjs';
import { FILES as EGRESS_FILES } from './patch-egress-loopback.mjs';

export const FILES = [...SHELL_FILES, ...EGRESS_FILES];

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const OUTPUT_DIR = 'lab/release-files/card-native-shell';
export const PLAN = 'lab/card-native-shell.plan.json';

export function build() {
  const files = [];
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(repo, file.base, file.name), 'utf8');
    if (sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)} (V bytes changed; refetch and update FILES)`);
    const patched = file.patch(original);
    const source = `${OUTPUT_DIR}/${file.name}`;
    fs.mkdirSync(path.dirname(path.join(repo, source)), { recursive: true });
    fs.writeFileSync(path.join(repo, source), patched);
    files.push({ source, target: `${file.target}/${file.name}`, before: sha(original), after: sha(patched) });
  }
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files: files.map(({ after, ...entry }) => entry) };
  fs.writeFileSync(path.join(repo, PLAN), `${JSON.stringify(plan, null, 2)}\n`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
