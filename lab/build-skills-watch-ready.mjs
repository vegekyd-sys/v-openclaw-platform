// Build lab/release-files/skills-watch-ready/ from V's live bytes.
//   refresh-BzYxPady.js  unmodified on V: npm openclaw@2026.9.1, read from the dist directory
//                        given as the first argument
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchSkillsWatchReady } from './patch-skills-watch-ready.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const npmDist = process.argv[2];
if (!npmDist) throw new Error('usage: node lab/build-skills-watch-ready.mjs <npm openclaw@2026.9.1 dist>');
const name = 'refresh-BzYxPady.js';
const before = 'e886dd60b17d119f316270997a379c474c1b066ba38f18d7f327ca6aee9b35f8';
const original = fs.readFileSync(path.join(npmDist, name), 'utf8');
if (sha(original) !== before) throw new Error(`Unexpected input checksum for ${name}`);
const patched = patchSkillsWatchReady(original);
const source = `lab/release-files/skills-watch-ready/${name}`;
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
