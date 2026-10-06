// Build lab/release-files/auth-lookup-memo/ from openclaw@2026.9.1's provider-env-vars
// chunk (V and VLab run it unmodified; see release/captured/base/openclaw@2026.9.1.json).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchProviderEnvVarsChunk } from './patch-auth-lookup-memo.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const name = 'provider-env-vars-BMbvepMk.js';
const expected = '78bedb00551a0b7f7d54f1a2bb8448053decb0f91ba72d04d9d7ddd25fb58cad';
const original = fs.readFileSync(path.join(dir, 'release-files/openclaw-9.1-base', name), 'utf8');
if (sha(original) !== expected) throw new Error(`Unexpected input checksum: ${sha(original)}`);
const patched = patchProviderEnvVarsChunk(original);
const source = `lab/release-files/auth-lookup-memo/${name}`;
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before: expected, after: sha(patched) }], null, 2));
