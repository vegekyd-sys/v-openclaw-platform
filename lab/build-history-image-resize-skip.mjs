// Build lab/release-files/history-image-resize-skip/ from the two core chunks V runs
// (captured in release/captured/restart-speed-20261013; both already carry V patches).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchEmbeddedAgentHelpers, patchHistoryImagePrune } from './patch-history-image-resize-skip.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const capture = 'release/captured/restart-speed-20261013/dist';
const output = 'lab/release-files/history-image-resize-skip';
export const RESIZE_SKIP_FILES = [
  { name: 'embedded-agent-helpers-CzpaLpCq.js', before: '342e6269ad41e2db113ed35ef4499e7a7ea051a8285ea68baf495d38c2ccbfc2', patch: patchEmbeddedAgentHelpers },
  { name: 'history-image-prune-Dg0CDQ4a.js', before: '2811753f28022063d0e23275d1fbf0680ef32b3d4922091079234171b2df880c', patch: patchHistoryImagePrune },
].map((file) => ({ ...file, input: `${capture}/${file.name}`, output: `${output}/${file.name}` }));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.join(repo, output), { recursive: true });
  const report = [];
  for (const file of RESIZE_SKIP_FILES) {
    const original = fs.readFileSync(path.join(repo, file.input), 'utf8');
    if (sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)}`);
    const patched = file.patch(original);
    fs.writeFileSync(path.join(repo, file.output), patched);
    report.push({ source: file.output, target: `openclaw/dist/${file.name}`, before: sha(original), after: sha(patched) });
  }
  console.log(JSON.stringify(report, null, 2));
}
