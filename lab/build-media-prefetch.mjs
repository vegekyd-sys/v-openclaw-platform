// Build lab/release-files/media-prefetch/ from V's live bytes: runner.entries from the npm
// 2026.9.1 bytes (unmodified on V, kept as a fixture), dispatch-from-config from the latest
// V capture (V patches it).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchDispatchFromConfig, patchRunnerEntries } from './patch-media-prefetch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
export const INPUTS = {
  'runner.entries-C1o21Kna.js': 'lab/fixtures/media-prefetch/runner.entries-C1o21Kna.js',
  'dispatch-from-config-DOJq_7CI.js': 'release/captured/v2026.9.1-db91.6-voice-reliability-20261008/dist/dispatch-from-config-DOJq_7CI.js',
};
export const EXPECTED_INPUT_SHA256 = {
  'runner.entries-C1o21Kna.js': 'b3cde575a01cea39207a266eeca70b799e38b1b87565e8f08891c9c37bbf61ca',
  'dispatch-from-config-DOJq_7CI.js': 'f150902ab3ebf2c9ccb19c4c5eb5158b469554553992a76b1c5e772fe7db39bd',
};
const PATCHERS = { 'runner.entries-C1o21Kna.js': patchRunnerEntries, 'dispatch-from-config-DOJq_7CI.js': patchDispatchFromConfig };
const sha = (v) => createHash('sha256').update(v).digest('hex');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = [];
  for (const [name, input] of Object.entries(INPUTS)) {
    const source = fs.readFileSync(path.join(repo, input), 'utf8');
    if (sha(source) !== EXPECTED_INPUT_SHA256[name]) throw new Error(`${input} is not V's pinned bytes`);
    const patched = PATCHERS[name](source);
    const target = path.join(repo, 'lab/release-files/media-prefetch', name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, patched);
    out.push({ source: path.relative(repo, target), target: `openclaw/dist/${name}`, before: EXPECTED_INPUT_SHA256[name], after: sha(patched) });
  }
  console.log(JSON.stringify(out, null, 2));
}
