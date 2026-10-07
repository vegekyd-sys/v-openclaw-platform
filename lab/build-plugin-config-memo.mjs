// Build lab/release-files/plugin-config-memo/ from V's live bytes.
//   installed-plugin-index-DzUab7zi.js  unmodified on V: npm openclaw@2026.9.1, read from the
//                                       dist directory given as the first argument
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchInstalledPluginIndexChunk } from './patch-plugin-config-memo.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const npmDist = process.argv[2];
if (!npmDist) throw new Error('usage: node lab/build-plugin-config-memo.mjs <npm openclaw@2026.9.1 dist>');
const name = 'installed-plugin-index-DzUab7zi.js';
const before = '3d177fdc4cff00363fa39864bfb0dd188fccc6cb1cfa8d0528cfb3a38839192c';
const original = fs.readFileSync(path.join(npmDist, name), 'utf8');
if (sha(original) !== before) throw new Error(`Unexpected input checksum for ${name}`);
const patched = patchInstalledPluginIndexChunk(original);
const source = `lab/release-files/plugin-config-memo/${name}`;
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
