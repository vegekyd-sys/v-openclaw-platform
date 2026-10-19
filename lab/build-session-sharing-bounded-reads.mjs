import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {patchState, patchEntry, patchUtils, patchRead} from './patch-session-sharing-bounded-reads.mjs';

// Input is an independently captured read-code directory, never a live write target.
const input = process.argv[2];
if (!input) throw new Error('Usage: node lab/build-session-sharing-bounded-reads.mjs CAPTURED_DIST');
const output = new URL('./release-files/session-sharing-bounded-reads/', import.meta.url);
fs.mkdirSync(output, {recursive: true});
const files = [
  ['session-accessor.sqlite-transcript-state-Cz9g7S9v.js', patchState],
  ['session-accessor.sqlite-entry-BlklNPKQ.js', patchEntry],
  ['session-utils-store-Dlphca2N.js', patchUtils],
  ['sessions-read-C6mAMxyQ.js', patchRead],
].map(([name, patch]) => {
  const source = fs.readFileSync(path.join(input, name), 'utf8');
  fs.writeFileSync(new URL(name, output), patch(source));
  return {source: `lab/release-files/session-sharing-bounded-reads/${name}`, target: `openclaw/dist/${name}`, before: createHash('sha256').update(source).digest('hex')};
});
fs.writeFileSync(new URL('./session-sharing-bounded-reads-plan.json', import.meta.url), JSON.stringify({files}, null, 2) + '\n');
