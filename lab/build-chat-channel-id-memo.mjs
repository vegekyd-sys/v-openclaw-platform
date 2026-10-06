// Build lab/release-files/chat-channel-id-memo/ from V's live bytes.
//   ids-DeNBb0Rp.js  unmodified on V: npm openclaw@2026.9.1, read from the dist directory
//                    given as the first argument
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchIdsChunk } from './patch-chat-channel-id-memo.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const npmDist = process.argv[2];
if (!npmDist) throw new Error('usage: node lab/build-chat-channel-id-memo.mjs <npm openclaw@2026.9.1 dist>');
const name = 'ids-DeNBb0Rp.js';
const before = '91cc9358c885211e5a1d882dc70b2d614c04ee5ff31adbe565b4fe3234ffabe6';
const original = fs.readFileSync(path.join(npmDist, name), 'utf8');
if (sha(original) !== before) throw new Error(`Unexpected input checksum for ${name}`);
const patched = patchIdsChunk(original);
const source = `lab/release-files/chat-channel-id-memo/${name}`;
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
