// Build lab/release-files/sessions-search-exact-read/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist, copied 2026-10-24; the first commit of each release file
// is that copy). sessions-resolve-_D6BmQTT.js carries sessions-resolve-exact-read (PR #462) too, so
// this plan replaces that one.
//   node lab/build-sessions-search-exact-read.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEFORE_SHA as RESOLVE_BEFORE, MARKER as KEY_MARKER, patchSessionsResolve, unpatchSessionsResolve } from './patch-sessions-resolve-exact-read.mjs';
import {
  COMBINED, COMBINED_BEFORE, MARKER, MODULE, OWNERSHIP, OWNERSHIP_BEFORE, RESOLVE,
  patchCombinedStore, patchSessionOwnership, patchSessionsResolveSearch, sha256,
  unpatchCombinedStore, unpatchSessionOwnership, unpatchSessionsResolveSearch,
} from './patch-sessions-search-exact-read.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/sessions-search-exact-read';
const files = [
  [RESOLVE, RESOLVE_BEFORE, (s) => patchSessionsResolveSearch(patchSessionsResolve(s)), (s) => {
    const searchless = s.includes(MARKER) ? unpatchSessionsResolveSearch(s) : s;
    return searchless.includes(KEY_MARKER) ? unpatchSessionsResolve(searchless) : searchless;
  }],
  [COMBINED, COMBINED_BEFORE, patchCombinedStore, (s) => s.includes(MARKER) ? unpatchCombinedStore(s) : s],
  [OWNERSHIP, OWNERSHIP_BEFORE, patchSessionOwnership, (s) => s.includes(MARKER) ? unpatchSessionOwnership(s) : s],
];
const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [] };
for (const [name, before, patch, unpatch] of files) {
  const source = `${dir}/${name}`;
  const original = process.argv[2]
    ? fs.readFileSync(path.join(process.argv[2], name), 'utf8')
    : unpatch(fs.readFileSync(path.join(repo, source), 'utf8'));
  if (sha256(original) !== before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const patched = patch(original);
  fs.writeFileSync(path.join(repo, source), patched);
  plan.files.push({ source, target: `openclaw/dist/${name}`, before, after: sha256(patched) });
}
const module = fs.readFileSync(path.join(repo, dir, MODULE), 'utf8');
plan.files.push({ source: `${dir}/${MODULE}`, target: `openclaw/dist/${MODULE}`, before: null, after: sha256(module) });
fs.writeFileSync(path.join(repo, 'lab/sessions-search-exact-read.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
