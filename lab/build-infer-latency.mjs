// Build lab/release-files/infer-latency/ from V's bytes
// (db91-release-v2026.9.1-db91.6/core/dist; unpatching a release file gives those bytes back).
//   node lab/build-infer-latency.mjs [<dir holding V's copies of the files>]
// Without a directory each file is rebuilt from its own release file (unpatched first).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER, patchFile, sha256, unpatchFile } from './patch-infer-latency.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = 'lab/release-files/infer-latency';
fs.mkdirSync(path.join(repo, dir), { recursive: true });
const out = [];
for (const [name, file] of Object.entries(FILES)) {
  const source = `${dir}/${name}`;
  const target = path.join(repo, source);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
  const fromDir = process.argv[2] && fs.existsSync(path.join(process.argv[2], name)) ? fs.readFileSync(path.join(process.argv[2], name), 'utf8') : undefined;
  const original = fromDir ?? (existing?.includes(MARKER) ? unpatchFile(name, existing) : undefined);
  if (original === undefined) throw new Error(`pass a directory with V's ${name}`);
  if (sha256(original) !== file.before) throw new Error(`Unexpected ${name} checksum ${sha256(original)}`);
  const patched = patchFile(name, original);
  if (unpatchFile(name, patched) !== original) throw new Error(`${name} does not round-trip`);
  fs.writeFileSync(target, patched);
  out.push({ source, target: `openclaw/dist/${name}`, before: file.before, after: sha256(patched), layer: file.layer });
}
console.log(JSON.stringify(out, null, 2));
