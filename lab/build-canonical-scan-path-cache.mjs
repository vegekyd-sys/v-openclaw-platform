// Build lab/release-files/canonical-scan-path-cache/ from V's session-accessor
// sqlite-transcript-state chunk (lab/release-files, the bytes V runs).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchTranscriptStateChunk } from './patch-canonical-scan-path-cache.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const name = 'session-accessor.sqlite-transcript-state-Cz9g7S9v.js';
const original = fs.readFileSync(path.join(dir, 'release-files', name), 'utf8');
const before = sha(original);
if (before !== 'dd00be09cbeff5bbf3ffeb9b16d3a1205e3f3abc783bf6ffbc3594c97071c208') throw new Error(`Unexpected input checksum for ${name}: ${before}`);
const patched = patchTranscriptStateChunk(original);
const source = `lab/release-files/canonical-scan-path-cache/${name}`;
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
