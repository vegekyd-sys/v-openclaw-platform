// Build the memory-search-vector-budget release files from the bytes V runs.
// usage: node lab/build-memory-search-vector-budget.mjs
// Inputs are the 2026-10-20 capture of V (release/captured/v2026.9.1-db91.6-subagent-index-20261020),
// byte-identical to V's /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist on 2026-10-20.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchManagerStageBudget, patchToolDegradedField } from './patch-memory-search-vector-budget.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const captured = path.join(repo, 'release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  {
    input: path.join(captured, 'extensions/memory-core/manager-runtime.js'),
    source: 'lab/release-files/memory-search-vector-budget/manager-runtime.js',
    target: 'openclaw/dist/extensions/memory-core/manager-runtime.js',
    before: '134cc6f6dfcda254be4e727cd9a0b47649aa88d8697043fc5f509c3a64270e87',
    patch: patchManagerStageBudget,
  },
  {
    input: path.join(captured, 'tools-Byg09TOP.js'),
    source: 'lab/release-files/memory-search-vector-budget/tools-Byg09TOP.js',
    target: 'openclaw/dist/tools-Byg09TOP.js',
    before: '091c318773a6bd3f4c332ef40c42d8ca10aa0c586346527dde986e2fb0433e30',
    patch: patchToolDegradedField,
  },
];

fs.mkdirSync(path.join(repo, 'lab/release-files/memory-search-vector-budget'), { recursive: true });
const out = [];
for (const file of files) {
  const original = fs.readFileSync(file.input, 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.input}`);
  const patched = file.patch(original);
  fs.writeFileSync(path.join(repo, file.source), patched);
  out.push({ source: file.source, target: file.target, before: file.before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
