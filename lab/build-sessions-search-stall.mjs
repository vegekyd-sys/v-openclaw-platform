// Build lab/release-files/sessions-search-stall/ from V's bytes (2026-11-16, db91-release-v2026.9.1-db91.6).
// openclaw-tools and session-transcript-reconcile come from the remote-node-stable-20261111 capture (V's
// bytes on 2026-11-16); session-transcript-search is upstream 2026.9.1 unchanged (checked against
// release/captured/base/openclaw@2026.9.1.json) and kept under v-base/.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchSessionsSearchTool, patchTranscriptReconcile, patchTranscriptSearch } from './patch-sessions-search-stall.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const out = path.join(dir, 'release-files/sessions-search-stall');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const captured = (name) => path.join(repo, 'release/captured/remote-node-stable-20261111/dist', name);
const baseHashes = JSON.parse(fs.readFileSync(path.join(repo, 'release/captured/base/openclaw@2026.9.1.json'), 'utf8'));
const FILES = [
  { name: 'session-transcript-reconcile-j5qhAafV.js', input: captured('session-transcript-reconcile-j5qhAafV.js'), before: '85455fa43c681eda0b831d6dc9b147925c149acc503fd936a018e765faca325b', patch: patchTranscriptReconcile },
  { name: 'session-transcript-search-pRB2YScP.js', input: path.join(out, 'v-base/session-transcript-search-pRB2YScP.js'), before: '399b50e688169ad0fea5382c38c00f89925aa29b99949bc92446d5adee3690bc', patch: patchTranscriptSearch, upstream: true },
  { name: 'openclaw-tools-BODVdJQD.js', input: captured('openclaw-tools-BODVdJQD.js'), before: '0b8b623310c01d8153a7f751c1f3a2042a2f3481d62499effce4f34d60ed2799', patch: patchSessionsSearchTool },
];
const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [] };
for (const file of FILES) {
  const original = fs.readFileSync(file.input, 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.name}`);
  if (file.upstream && !JSON.stringify(baseHashes).includes(file.before)) throw new Error(`${file.name} is not the upstream 2026.9.1 bytes`);
  const patched = file.patch(original);
  fs.writeFileSync(path.join(out, file.name), patched);
  plan.files.push({ source: `lab/release-files/sessions-search-stall/${file.name}`, target: `openclaw/dist/${file.name}`, before: file.before, after: sha(patched) });
}
fs.writeFileSync(path.join(dir, 'sessions-search-stall.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
