// Build lab/release-files/sessions-get-exact-read/ from V's live bytes
// (lab/release-files/sessions-read-live-20261010, read from VLab batch-20261010, same sha as V).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchSessionsRead } from './patch-sessions-get-exact-read.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const name = 'sessions-read-C6mAMxyQ.js';
const original = fs.readFileSync(path.join(repo, 'lab/release-files/sessions-read-live-20261010', name), 'utf8');
if (!sha(original).startsWith('bfecaccaf2e01592')) throw new Error(`Unexpected ${name} checksum ${sha(original)}`);
const patched = patchSessionsRead(original);
const source = `lab/release-files/sessions-get-exact-read/${name}`;
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify({ source, target: `openclaw/dist/${name}`, before: sha(original), after: sha(patched) }, null, 2));
