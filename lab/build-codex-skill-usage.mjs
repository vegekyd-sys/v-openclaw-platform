// Build lab/release-files/codex-skill-usage/ from V's live bytes.
//
//   node lab/build-codex-skill-usage.mjs --base <dir>
//
// <dir> holds the files as V runs them:
//   <dir>/core/dist/agent-tools.before-tool-call-g2OT63u5.js and <dir>/core/dist/plugin-sdk/agent-harness-runtime.js
//     from /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist
//   <dir>/codex/dist/run-attempt-D1hJO4fX.js from the Codex plugin npm project dist
//     (/home/openclaw/.openclaw/npm/projects/openclaw-codex-.../node_modules/@openclaw/codex/dist)
// Dist patches replace whole files, so every target is rebuilt from the bytes it will replace and
// the plan records those bytes' sha256 as `before`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES } from './patch-codex-skill-usage.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const OUTPUT_DIR = 'lab/release-files/codex-skill-usage';
export const PLAN = 'lab/codex-skill-usage.plan.json';

export function build({ base }) {
  fs.mkdirSync(path.join(repo, OUTPUT_DIR), { recursive: true });
  const files = [];
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(base, file.base, file.name), 'utf8');
    if (sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)} (V bytes changed; refetch and update FILES)`);
    const patched = file.patch(original);
    const source = `${OUTPUT_DIR}/${file.name}`;
    fs.writeFileSync(path.join(repo, source), patched);
    files.push({ source, target: `${file.target}/${file.name}`, before: sha(original), after: sha(patched) });
  }
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files };
  fs.writeFileSync(path.join(repo, PLAN), `${JSON.stringify(plan, null, 2)}\n`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--base');
  const base = i > 0 ? process.argv[i + 1] : undefined;
  if (!base) throw new Error('usage: build-codex-skill-usage.mjs --base <dir>');
  console.log(JSON.stringify(build({ base }), null, 2));
}
