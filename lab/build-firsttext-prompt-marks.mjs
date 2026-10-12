// Build lab/release-files/firsttext-prompt-marks/ from V's live builtin chunk
// (release/captured/v-voice-content-product-20261011).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchBuiltinChunk } from './patch-firsttext-prompt-marks.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const PROMPT_MARK_CAPTURE = 'release/captured/v-voice-content-product-20261011/dist';
export const PROMPT_MARK_INPUTS = [
  { name: 'builtin-openclaw-zQV8Wwjr.js', before: '3e07c3fa8bc9ccb3fe87577f245afa11b42a99b87b46b957e43e5eb9de049f3d', patch: patchBuiltinChunk },
];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = [];
  for (const input of PROMPT_MARK_INPUTS) {
    const original = fs.readFileSync(path.join(repo, PROMPT_MARK_CAPTURE, input.name), 'utf8');
    if (sha(original) !== input.before) throw new Error(`Unexpected ${input.name} checksum: ${sha(original)}`);
    const patched = input.patch(original);
    const source = `lab/release-files/firsttext-prompt-marks/${input.name}`;
    fs.writeFileSync(path.join(repo, source), patched);
    out.push({ source, target: `openclaw/dist/${input.name}`, before: sha(original), after: sha(patched) });
  }
  console.log(JSON.stringify(out, null, 2));
}
