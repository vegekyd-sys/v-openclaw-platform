// Builds lab/release-files/bounded-branch-list from V's exact bytes. V's session-accessor chunk is the
// mirror-facts-identity release (lab/release-files/mirror-facts-identity, checked against
// /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist on 2026-10-19). Never touches a
// live runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchSessionAccessor } from './patch-bounded-branch-list.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const BOUNDED_BRANCH_LIST_FILES = [
  { name: 'session-accessor-K0XuW6ln.js', base: 'lab/release-files/mirror-facts-identity', before: '30c7b9d6e3d9baf842e51f4811708b0f21a95c5cd36ebc150b2dd7a2fed2c15d', patch: patchSessionAccessor },
];

export function buildBoundedBranchList() {
  const plan = { files: [] };
  for (const file of BOUNDED_BRANCH_LIST_FILES) {
    const original = fs.readFileSync(path.join(root, file.base, file.name), 'utf8');
    assert.equal(sha(original), file.before, `${file.base}/${file.name} is not V's bytes`);
    const patched = file.patch(original);
    const source = `lab/release-files/bounded-branch-list/${file.name}`;
    fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
    fs.writeFileSync(path.join(root, source), patched);
    plan.files.push({ source, target: `openclaw/dist/${file.name}`, before: file.before, after: sha(patched) });
  }
  fs.writeFileSync(path.join(root, 'lab/bounded-branch-list-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildBoundedBranchList(), null, 2));
}
