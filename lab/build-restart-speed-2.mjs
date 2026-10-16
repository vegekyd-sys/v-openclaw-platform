// Build lab/release-files/restart-speed-2/ from the bytes V runs (fixtures copied from V
// 2026-10-14; unchanged npm 2026.9.1 bytes, identical on shared VLab).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchCommandSecretGateway } from './patch-restart-speed-secrets-resolve.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const out = [];
const name = 'command-secret-gateway-DCJZ8pGz.js';
const original = fs.readFileSync(path.join(dir, 'fixtures', 'restart-speed-2', name), 'utf8');
const before = sha(original);
if (before !== 'd139c36e955fa35cc42f02a26273b3e5551c409fb8e631bc84791564923a4e77') throw new Error(`Unexpected input checksum for ${name}: ${before}`);
const patched = patchCommandSecretGateway(original);
const source = `lab/release-files/restart-speed-2/dist/${name}`;
fs.writeFileSync(path.join(repo, source), patched);
out.push({ source, target: `openclaw/dist/${name}`, before, after: sha(patched) });
console.log(JSON.stringify(out, null, 2));
