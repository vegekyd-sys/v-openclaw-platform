// Build lab/release-files/cli-startup-fast/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist; the first commit of each chunk is that copy).
//   node lab/build-cli-startup-fast.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI, CLI_BEFORE_SHA, CLIENT, CLIENT_BEFORE_SHA, MARKER, PREFLIGHT, patchRelayCli, patchRelayClient, sha256, unpatchRelayCli, unpatchRelayClient } from './patch-cli-startup-fast.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/cli-startup-fast';
const build = (name, beforeSha, patch, unpatch) => {
  const source = `${dir}/${name}`;
  const existing = fs.readFileSync(path.join(repo, source), 'utf8');
  const original = process.argv[2] ? fs.readFileSync(path.join(process.argv[2], name), 'utf8') : existing.includes(MARKER) ? unpatch(existing) : existing;
  if (sha256(original) !== beforeSha) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const patched = patch(original);
  fs.writeFileSync(path.join(repo, source), patched);
  return { source, target: `openclaw/dist/${name}`, before: beforeSha, after: sha256(patched) };
};
console.log(JSON.stringify([
  build(CLI, CLI_BEFORE_SHA, patchRelayCli, unpatchRelayCli),
  build(CLIENT, CLIENT_BEFORE_SHA, patchRelayClient, unpatchRelayClient),
  { source: `${dir}/${PREFLIGHT}`, target: `openclaw/dist/${PREFLIGHT}`, after: sha256(fs.readFileSync(path.join(repo, dir, PREFLIGHT))), before: null },
], null, 2));
