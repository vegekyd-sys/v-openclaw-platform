// Build lab/release-files/image-hold/ from the npm 2026.9.1 bytes V runs (unmodified on V).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchRunner } from './patch-image-hold.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const name = 'runner-BIhCXp3h.js';
const original = fs.readFileSync(path.join(dir, 'fixtures/image-hold', name), 'utf8');
const before = sha(original);
if (before !== '0648f47c8f4327111f6007aa7b6a1ac4a31872b3d9308970527e3035733bf130') throw new Error(`Unexpected input checksum for ${name}: ${before}`);
const patched = patchRunner(original);
const source = `lab/release-files/image-hold/${name}`;
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
