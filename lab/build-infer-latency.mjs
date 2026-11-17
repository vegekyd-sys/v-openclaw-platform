// Build lab/release-files/infer-latency/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist; unpatching the release file gives those bytes back).
//   node lab/build-infer-latency.mjs [<V dist dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_GUARD, CONFIG_GUARD_BEFORE_SHA, MARKER, patchConfigGuard, sha256, unpatchConfigGuard } from './patch-infer-latency.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/infer-latency';
fs.mkdirSync(path.join(repo, dir), { recursive: true });
const source = `${dir}/${CONFIG_GUARD}`;
const target = path.join(repo, source);
const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
const original = process.argv[2] ? fs.readFileSync(path.join(process.argv[2], CONFIG_GUARD), 'utf8') : existing?.includes(MARKER) ? unpatchConfigGuard(existing) : existing;
if (original === undefined) throw new Error(`pass V's dist directory to build ${CONFIG_GUARD}`);
if (sha256(original) !== CONFIG_GUARD_BEFORE_SHA) throw new Error(`Unexpected ${CONFIG_GUARD} checksum ${sha256(original)}`);
const patched = patchConfigGuard(original);
if (unpatchConfigGuard(patched) !== original) throw new Error(`${CONFIG_GUARD} does not round-trip`);
fs.writeFileSync(target, patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${CONFIG_GUARD}`, before: CONFIG_GUARD_BEFORE_SHA, after: sha256(patched) }], null, 2));
