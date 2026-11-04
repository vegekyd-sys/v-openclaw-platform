// Build lab/release-files/feishu-card-open/ from the Feishu bytes V runs.
//
//   node lab/build-feishu-card-open.mjs
//
// Dist patches replace whole files, so every target is rebuilt from the bytes it will replace and
// the plan records those bytes' sha256 as `before` (see FILES in patch-feishu-card-open.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES } from './patch-feishu-card-open.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const OUTPUT_DIR = 'lab/release-files/feishu-card-open';
export const PLAN = 'lab/feishu-card-open.plan.json';

export function build({ write = true } = {}) {
  const files = [];
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(repo, file.base, file.name), 'utf8');
    if (sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)} (V bytes changed; refetch and update FILES)`);
    const patched = file.patch(original);
    const source = `${OUTPUT_DIR}/${file.name}`;
    if (write) {
      fs.mkdirSync(path.join(repo, OUTPUT_DIR), { recursive: true });
      fs.writeFileSync(path.join(repo, source), patched);
    }
    files.push({ source, target: `${file.target}/${file.name}`, before: sha(original), after: sha(patched) });
  }
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files: files.map(({ after, ...entry }) => entry) };
  if (write) fs.writeFileSync(path.join(repo, PLAN), `${JSON.stringify(plan, null, 2)}\n`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
