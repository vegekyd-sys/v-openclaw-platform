// Build lab/release-files/workboard-start-context/ from V's live bytes: batch-20261010c
// (release-batch-20261009 + #302 + #306, lab/release-files/workboard-dispatch-slots).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorkboardRuntimeApi, patchWorkboardSqliteStore } from './patch-workboard-start-context.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  ['runtime-api-1CCazqtv.js', '6ea87f966325e83b', patchWorkboardRuntimeApi],
  ['sqlite-store-CH-caj1l.js', '321499f358464e8b', patchWorkboardSqliteStore],
];
const out = [];
for (const [name, before, patch] of files) {
  const original = fs.readFileSync(path.join(repo, 'lab/release-files/workboard-dispatch-slots', name), 'utf8');
  if (!sha(original).startsWith(before)) throw new Error(`Unexpected ${name} checksum ${sha(original)}`);
  const patched = patch(original);
  const source = `lab/release-files/workboard-start-context/${name}`;
  fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: `openclaw/dist/${name}`, before: sha(original), after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
