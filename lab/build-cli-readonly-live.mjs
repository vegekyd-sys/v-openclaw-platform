// Build lab/release-files/cli-readonly-live/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist; unpatching a release file gives those bytes back).
//   node lab/build-cli-readonly-live.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCATION, LOCATION_BEFORE_SHA, MARKER, READONLY, READONLY_BEFORE_SHA, patchLocation, patchReadonly, sha256, unpatchLocation, unpatchReadonly } from './patch-cli-readonly-live.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/cli-readonly-live';
fs.mkdirSync(path.join(repo, dir), { recursive: true });
const build = (name, beforeSha, patch, unpatch) => {
  const source = `${dir}/${name}`;
  const target = path.join(repo, source);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
  const original = process.argv[2] ? fs.readFileSync(path.join(process.argv[2], name), 'utf8') : existing?.includes(MARKER) ? unpatch(existing) : existing;
  if (original === undefined) throw new Error(`pass V's dist directory to build ${name}`);
  if (sha256(original) !== beforeSha) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const patched = patch(original);
  if (unpatch(patched) !== original) throw new Error(`${name} does not round-trip`);
  fs.writeFileSync(target, patched);
  return { source, target: `openclaw/dist/${name}`, before: beforeSha, after: sha256(patched) };
};
console.log(JSON.stringify([
  build(READONLY, READONLY_BEFORE_SHA, patchReadonly, unpatchReadonly),
  build(LOCATION, LOCATION_BEFORE_SHA, patchLocation, unpatchLocation),
], null, 2));
