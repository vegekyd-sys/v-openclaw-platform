// Build lab/release-files/subagent-active-precheck/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist; the first commit of the release file is that copy).
//   node lab/build-subagent-active-precheck.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEFORE_SHA, HELPER, MARKER, NAME, patchHistoryImagePrune, sha256, unpatchHistoryImagePrune } from './patch-subagent-active-precheck.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/subagent-active-precheck';
const source = `${dir}/${NAME}`;
const existing = fs.readFileSync(path.join(repo, source), 'utf8');
const original = process.argv[2]
  ? fs.readFileSync(path.join(process.argv[2], NAME), 'utf8')
  : existing.includes(MARKER) ? unpatchHistoryImagePrune(existing) : existing;
if (sha256(original) !== BEFORE_SHA) throw new Error(`Unexpected ${NAME} checksum ${sha256(original)}`);
const patched = patchHistoryImagePrune(original);
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([
  { source, target: `openclaw/dist/${NAME}`, before: BEFORE_SHA, after: sha256(patched) },
  { source: `${dir}/${HELPER}`, target: `openclaw/dist/${HELPER}`, after: sha256(fs.readFileSync(path.join(repo, dir, HELPER))) },
], null, 2));
