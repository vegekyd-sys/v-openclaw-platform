// Build lab/release-files/history-image-e3/: one release for #355 (history images are no
// longer resized) and #345 (DeepSeek budget, E3 follow-up). Both patch
// embedded-agent-helpers-CzpaLpCq.js, and dist patches replace whole files, so each target is
// built once from V's live bytes with every patch that touches it, in a fixed order. The bases
// are the bytes V runs as of restart-speed-2-reconcile-20261014 (checked on V 2026-10-15).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchEmbeddedAgentHelpers, patchHistoryImagePrune } from './patch-history-image-resize-skip.mjs';
import { patchAgentRunner, patchErrorText, patchOpenAICompletions, patchOverflowGuidance } from './patch-deepseek-budget-completions.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const capture = 'release/captured/restart-speed-20261013/dist';
const output = 'lab/release-files/history-image-e3';

export const COMBINED_FILES = [
  { name: 'embedded-agent-helpers-CzpaLpCq.js', input: `${capture}/embedded-agent-helpers-CzpaLpCq.js`, target: 'openclaw/dist/embedded-agent-helpers-CzpaLpCq.js', before: '342e6269ad41e2db113ed35ef4499e7a7ea051a8285ea68baf495d38c2ccbfc2', patches: [patchEmbeddedAgentHelpers, patchErrorText] },
  { name: 'history-image-prune-Dg0CDQ4a.js', input: `${capture}/history-image-prune-Dg0CDQ4a.js`, target: 'openclaw/dist/history-image-prune-Dg0CDQ4a.js', before: '2811753f28022063d0e23275d1fbf0680ef32b3d4922091079234171b2df880c', patches: [patchHistoryImagePrune] },
  { name: 'embedded-agent-DaSvA-Yk.js', input: `${capture}/embedded-agent-DaSvA-Yk.js`, target: 'openclaw/dist/embedded-agent-DaSvA-Yk.js', before: '22dad1eff94b82345bcfb4c0b5da5ba4c72f436b4e81ad94d7ceb611961c3cee', patches: [patchOverflowGuidance] },
  { name: 'agent-runner.runtime-CAdsMsQt.js', input: `${capture}/agent-runner.runtime-CAdsMsQt.js`, target: 'openclaw/dist/agent-runner.runtime-CAdsMsQt.js', before: '75b5b4b1a6ff870da0b42a1c8a7108700dae6da12aa6b015c966eca597d318cb', patches: [patchAgentRunner] },
  { name: 'openai-completions-D0QZ0AyB.mjs', input: 'lab/release-files/deepseek-compaction-openai-completions-D0QZ0AyB.mjs', target: 'openclaw/node_modules/@openclaw/ai/dist/openai-completions-D0QZ0AyB.mjs', before: '6a34cb7901a9d82e05150662bdf028fce0ecc316b7058f198247d8041d82ea08', patches: [patchOpenAICompletions] },
].map((file) => ({ ...file, output: `${output}/${file.name}` }));

export const buildCombined = (file, source) => file.patches.reduce((next, patch) => patch(next), source);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.join(repo, output), { recursive: true });
  const files = [];
  for (const file of COMBINED_FILES) {
    const original = fs.readFileSync(path.join(repo, file.input), 'utf8');
    if (sha(original) !== file.before) throw new Error(`Unexpected ${file.name} checksum: ${sha(original)}`);
    const patched = buildCombined(file, original);
    fs.writeFileSync(path.join(repo, file.output), patched);
    files.push({ source: file.output, target: file.target, before: file.before, after: sha(patched) });
  }
  const plan = { baseRelease: 'REPLACE_AT_STAGE', files: files.map(({ after, ...entry }) => entry) };
  fs.writeFileSync(path.join(dir, 'history-image-e3.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify(files, null, 2));
}
