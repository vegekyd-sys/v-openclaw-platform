// Build lab/release-files/async-writer-admission/ from V's live
// session-accessor.sqlite-entry chunk (captured in
// release/captured/v2026.9.1-db91.6-workboard-incremental-sweep-20261006).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchSessionEntryChunk } from './patch-async-writer-admission.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const base = path.join(repo, 'release/captured/v2026.9.1-db91.6-workboard-incremental-sweep-20261006/dist/session-accessor.sqlite-entry-BlklNPKQ.js');
const expected = '6b12190ca8e975ea6c8bce6703af805e01a1ef492e83f4829a6fe0f90669d96b';
const original = fs.readFileSync(base, 'utf8');
if (sha(original) !== expected) throw new Error(`Unexpected input checksum: ${sha(original)}`);
const patched = patchSessionEntryChunk(original);
const source = 'lab/release-files/async-writer-admission/session-accessor.sqlite-entry-BlklNPKQ.js';
fs.writeFileSync(path.join(repo, source), patched);
const helper = 'lab/release-files/async-writer-admission/agent-db-writer-admission-wait.mjs';
console.log(JSON.stringify([
  { source, target: 'openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js', before: expected, after: sha(patched) },
  { source: helper, target: 'openclaw/dist/agent-db-writer-admission-wait.mjs', before: null, after: sha(fs.readFileSync(path.join(repo, helper))) },
], null, 2));
