// Build lab/release-files/workboard-full-sweep/ from V's bytes. Without an argument the originals come from the
// release files of the PRs that put them on V (each checked against the plan's `before`):
//   sessions-read-C6mAMxyQ.js, combined-store-gateway-BwDhjbIt.js   lab/release-files/sessions-visibility-columns/
//   session-accessor.sqlite-transcript-state-Cz9g7S9v.js            lab/release-files/session-sharing-bounded-reads/
//   subagent-registry.store.sqlite-hzGu4QSk.js, session-utils-list-BUP03AzS.js   lab/release-files/subagent-row-index/
//   subagent-registry-read-UaDFTyfW.js                              lab/release-files/subagent-settle-backlog/
// With a V dist directory (db91-release-v2026.9.1-db91.6/core/dist) it reads them from there.
//   node lab/build-workboard-full-sweep.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, sha256 } from './patch-workboard-full-sweep.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/workboard-full-sweep';
const ORIGINS = {
  'sessions-read-C6mAMxyQ.js': 'lab/release-files/sessions-visibility-columns',
  'combined-store-gateway-BwDhjbIt.js': 'lab/release-files/sessions-visibility-columns',
  'session-accessor.sqlite-transcript-state-Cz9g7S9v.js': 'lab/release-files/session-sharing-bounded-reads',
  'subagent-registry.store.sqlite-hzGu4QSk.js': 'lab/release-files/subagent-row-index',
  'subagent-registry-read-UaDFTyfW.js': 'lab/release-files/subagent-settle-backlog',
  'session-utils-list-BUP03AzS.js': 'lab/release-files/subagent-row-index',
};
const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [] };
for (const [name, before, patch] of FILES) {
  const source = `${dir}/${name}`;
  let original = null;
  if (before) {
    original = fs.readFileSync(process.argv[2] ? path.join(process.argv[2], name) : path.join(repo, ORIGINS[name], name), 'utf8');
    if (sha256(original) !== before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  } else if (process.argv[2] && fs.existsSync(path.join(process.argv[2], name))) {
    throw new Error(`${name} already exists in ${process.argv[2]}`);
  }
  const patched = patch(original);
  fs.mkdirSync(path.dirname(path.join(repo, source)), { recursive: true });
  fs.writeFileSync(path.join(repo, source), patched);
  plan.files.push({ source, target: `openclaw/dist/${name}`, before, after: sha256(patched) });
}
fs.writeFileSync(path.join(repo, 'lab/workboard-full-sweep.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
