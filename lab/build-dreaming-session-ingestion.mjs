import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {patchHostEngineSessions, patchDreamingPhases} from './patch-dreaming-session-ingestion.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] ?? path.join(root, 'lab/fixtures/dreaming-session-ingestion-baseline');
const definitions = [
  ['memory-core-host-engine-sessions-CAnvQ_5o.js', patchHostEngineSessions],
  ['dreaming-phases-C5ItPb99.js', patchDreamingPhases],
];
const sha = s => createHash('sha256').update(s).digest('hex');
const files = definitions.map(([targetName, patch]) => {
  const before = fs.readFileSync(path.join(input, targetName), 'utf8');
  const after = patch(before);
  const source = 'lab/release-files/' + targetName;
  fs.writeFileSync(path.join(root, source), after);
  return {source, target: 'openclaw/dist/' + targetName, before: sha(before), after: sha(after)};
});
fs.writeFileSync(path.join(root, 'lab/dreaming-session-ingestion-plan.json'), JSON.stringify({files}, null, 2) + '\n');
console.log(JSON.stringify({files}, null, 2));
