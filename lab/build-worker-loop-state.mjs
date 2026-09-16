import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {patchPluginState, patchDreamingState} from './patch-worker-loop-state.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] ?? path.join(root, 'lab/fixtures/worker-loop-native-baseline');
const definitions = [
  ['plugin-state-store.js', 'plugin-state-store-PhQA2Nhh.js', patchPluginState],
  ['dreaming-state.js', 'dreaming-state-B0qd2W7q.js', patchDreamingState],
];
const sha = s => createHash('sha256').update(s).digest('hex');
const files = definitions.map(([name, targetName, patch]) => {
  const before = fs.readFileSync(path.join(input, targetName), 'utf8');
  const after = patch(before);
  const source = 'lab/release-files/' + targetName;
  fs.writeFileSync(path.join(root, source), after);
  return {source, target: 'openclaw/dist/' + targetName, before: sha(before), after: sha(after)};
});
fs.writeFileSync(path.join(root, 'lab/worker-loop-state-plan.json'), JSON.stringify({files}, null, 2) + '\n');
console.log(JSON.stringify({files}, null, 2));
