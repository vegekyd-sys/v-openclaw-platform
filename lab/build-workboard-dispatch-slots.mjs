// Build lab/release-files/workboard-dispatch-slots/ from V's live bytes: release-batch-20261009
// plus #302 (lab/release-files/workboard-create-indexed, on V since 2026-10-10 00:20).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchWorkboardRuntimeApi, patchWorkboardSqliteStore } from './patch-workboard-dispatch-slots.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  ['runtime-api-1CCazqtv.js', '5b83602133393feb', patchWorkboardRuntimeApi],
  ['sqlite-store-CH-caj1l.js', '4ca26600f933a071', patchWorkboardSqliteStore],
];
const out = [];
for (const [name, before, patch] of files) {
  const original = fs.readFileSync(path.join(repo, 'lab/release-files/workboard-create-indexed', name), 'utf8');
  if (!sha(original).startsWith(before)) throw new Error(`Unexpected ${name} checksum ${sha(original)}`);
  const patched = patch(original);
  const source = `lab/release-files/workboard-dispatch-slots/${name}`;
  fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: `openclaw/dist/${name}`, before: sha(original), after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
