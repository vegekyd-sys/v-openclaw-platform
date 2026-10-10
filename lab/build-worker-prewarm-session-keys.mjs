// Build lab/release-files/worker-prewarm-session-keys/ from the worker-prewarm-secrets
// agent-command chunk (lab/release-files, the bytes V runs).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchAgentCommandChunk } from './patch-worker-prewarm-session-keys.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const name = 'agent-command-DPfawBbr.js';
const original = fs.readFileSync(path.join(dir, 'release-files', 'worker-prewarm-secrets', name), 'utf8');
const before = sha(original);
if (before !== '150d9003e6526e4faa5a4c9ab3454f05a3614b180cd5f832926dad28344439af') throw new Error(`Unexpected input checksum for ${name}: ${before}`);
const patched = patchAgentCommandChunk(original);
const source = `lab/release-files/worker-prewarm-session-keys/${name}`;
fs.mkdirSync(path.join(repo, path.dirname(source)), { recursive: true });
fs.writeFileSync(path.join(repo, source), patched);
console.log(JSON.stringify([{ source, target: `openclaw/dist/${name}`, before, after: sha(patched) }], null, 2));
