// Build lab/release-files/worker-prewarm-secrets/ from the worker-prewarm2-v agent command
// chunk.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchAgentCommandChunk } from './patch-worker-prewarm-secrets.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const name = 'agent-command-DPfawBbr.js';
const original = fs.readFileSync(path.join(dir, 'release-files/worker-prewarm2-v', name), 'utf8');
const before = sha(original);
if (before !== '82e7ca49babbe4638428ebc472855dd408e5c46a3bef0fe798ffcca9279540e0') throw new Error(`Unexpected input checksum for ${name}: ${before}`);
const patched = patchAgentCommandChunk(original);
const source = `lab/release-files/worker-prewarm-secrets/${name}`;
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
