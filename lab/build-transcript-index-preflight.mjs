// Build lab/release-files/transcript-index-preflight/session-transcript-reconcile-j5qhAafV.js from V's bytes (captured).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchTranscriptIndexPreflight } from './patch-transcript-index-preflight.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const input = path.join(repo, 'release/captured/v2026.9.1-db91.6-voice-reliability-20261008/dist/session-transcript-reconcile-j5qhAafV.js');
const before = 'e95bb26ad215db700b967a7988b14fa19b36dd2b4c173742183319e79eac381b';
const original = fs.readFileSync(input, 'utf8');
if (sha(original) !== before) throw new Error('Unexpected input checksum');
const patched = patchTranscriptIndexPreflight(original);
fs.writeFileSync(path.join(dir, 'release-files/transcript-index-preflight/session-transcript-reconcile-j5qhAafV.js'), patched);
console.log(JSON.stringify({ source: 'lab/release-files/transcript-index-preflight/session-transcript-reconcile-j5qhAafV.js', target: 'openclaw/dist/session-transcript-reconcile-j5qhAafV.js', before, after: sha(patched) }, null, 2));
