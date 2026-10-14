// Build lab/release-files/firsttext-usage-marks/ from the chunk V runs
// (captured in release/captured/restart-speed-20261013; it already carries V's first-text marks).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchModelDiagnosticEvents } from './patch-firsttext-usage-marks.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const name = 'attempt.model-diagnostic-events-B4dGIs0S.js';
export const USAGE_MARKS_FILE = {
  name,
  before: '8aa2ea92c8c55aecec9077659295765f9cddfaf608bf71ef82b460ad031cee9d',
  input: `release/captured/restart-speed-20261013/dist/${name}`,
  output: `lab/release-files/firsttext-usage-marks/${name}`,
  patch: patchModelDiagnosticEvents,
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = USAGE_MARKS_FILE;
  const original = fs.readFileSync(path.join(repo, file.input), 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)}`);
  const patched = file.patch(original);
  fs.mkdirSync(path.join(repo, path.dirname(file.output)), { recursive: true });
  fs.writeFileSync(path.join(repo, file.output), patched);
  console.log(JSON.stringify([{ source: file.output, target: `openclaw/dist/${file.name}`, before: sha(original), after: sha(patched) }], null, 2));
}
