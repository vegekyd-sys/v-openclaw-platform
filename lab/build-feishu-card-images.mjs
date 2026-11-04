// Build lab/release-files/feishu-card-images/ from the Feishu bytes V runs.
//
//   node lab/build-feishu-card-images.mjs [--base <dir>]
//
// <dir> holds the two files as V runs them (default: lab/release-files/desktop-handback-progress/,
// which is what V runs on 2026-11-04), e.g. fetched with
//   scp v:/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu/dist/<name> <dir>/
// Dist patches replace whole files, so every target is rebuilt from the bytes it will replace and
// the plan records those bytes' sha256 as `before`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES } from './patch-feishu-card-images.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const OUTPUT_DIR = 'lab/release-files/feishu-card-images';
export const PLAN = 'lab/feishu-card-images.plan.json';
export const DEFAULT_BASE = path.join(dir, 'release-files/desktop-handback-progress');

export function build({ base = DEFAULT_BASE, write = true } = {}) {
  const files = [];
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(base, file.name), 'utf8');
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--base');
  console.log(JSON.stringify(build({ base: i > 0 ? process.argv[i + 1] : undefined }), null, 2));
}
