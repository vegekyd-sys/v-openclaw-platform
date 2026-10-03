// Build lab/release-files/db91-shrink-reuse/db91-integrity-gate.mjs from V's bytes (captured).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchDb91ShrinkReuse } from './patch-db91-shrink-reuse.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const input = path.join(repo, 'release/captured/v2026.9.1-db91.6-background-work-20261002/dist/db91-integrity-gate.mjs');
const before = '3d6807a3350f6ec2ad594045b5e88760cb4738806259afebe01ad9753cbbc57e';
const original = fs.readFileSync(input, 'utf8');
if (sha(original) !== before) throw new Error('Unexpected input checksum');
const patched = patchDb91ShrinkReuse(original);
fs.writeFileSync(path.join(dir, 'release-files/db91-shrink-reuse/db91-integrity-gate.mjs'), patched);
console.log(JSON.stringify({ source: 'lab/release-files/db91-shrink-reuse/db91-integrity-gate.mjs', target: 'openclaw/dist/db91-integrity-gate.mjs', before, after: sha(patched) }, null, 2));
