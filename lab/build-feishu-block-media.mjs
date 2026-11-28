// Build lab/release-files/feishu-block-media/ from V's bytes.
//
//   node lab/build-feishu-block-media.mjs
//
// The base is V's live Feishu monitor.account-WFdlCDhR.js, kept in this repository (FILES[].base), fetched with
//   ssh v 'sudo -n cat /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/monitor.account-WFdlCDhR.js'
// Dist patches replace whole files, so the target is rebuilt from the bytes it replaces; the plan records them as `before`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES } from './patch-feishu-block-media.mjs';

export { FILES };

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const OUTPUT_DIR = 'lab/release-files/feishu-block-media';
export const PLAN = 'lab/feishu-block-media.plan.json';

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
