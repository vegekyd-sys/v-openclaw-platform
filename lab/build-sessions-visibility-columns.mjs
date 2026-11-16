// Build lab/release-files/sessions-visibility-columns/ from V's bytes (2026-11-16, db91-release-v2026.9.1-db91.6):
// the remote-node-stable-20261111 capture holds the three chunks exactly as V runs them (checked on V 2026-11-16).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchCombinedStoreGateway, patchSessionAccessorEntry, patchSessionsRead } from './patch-sessions-visibility-columns.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const out = path.join(dir, 'release-files/sessions-visibility-columns');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const captured = (name) => path.join(repo, 'release/captured/remote-node-stable-20261111/dist', name);
const FILES = [
  { name: 'session-accessor.sqlite-entry-BlklNPKQ.js', before: '258aa1be787081f9333db2ef576caee987b537acde9d99dcdb7f48542022a230', patch: patchSessionAccessorEntry },
  { name: 'combined-store-gateway-BwDhjbIt.js', before: '9cb53296f60b4d375f19cdd0e52d104a7b255c9feaae34656654c718bb6f5c51', patch: patchCombinedStoreGateway },
  { name: 'sessions-read-C6mAMxyQ.js', before: '5c84c606c258ae729630a659d54bdf28d1b7cb2999b1ca86a325832b78ef5a43', patch: patchSessionsRead },
];
const plan = { baseRelease: 'REPLACE_AT_STAGE', files: [] };
fs.mkdirSync(out, { recursive: true });
for (const file of FILES) {
  const original = fs.readFileSync(captured(file.name), 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.name}: ${sha(original)}`);
  const patched = file.patch(original);
  fs.writeFileSync(path.join(out, file.name), patched);
  plan.files.push({ source: `lab/release-files/sessions-visibility-columns/${file.name}`, target: `openclaw/dist/${file.name}`, before: file.before, after: sha(patched) });
}
fs.writeFileSync(path.join(dir, 'sessions-visibility-columns.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify(plan, null, 2));
