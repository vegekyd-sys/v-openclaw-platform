import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {patchIndex, patchReconcile} from './patch-transcript-index-rowid-window.mjs';

const directory = new URL('./release-files/transcript-index-rowid-window/', import.meta.url);
fs.mkdirSync(directory, {recursive:true});
const files = [
  ['transcript-index-prepare', 'session-transcript-index-9itOio9h.js', patchIndex],
  ['transcript-index-preflight', 'session-transcript-reconcile-j5qhAafV.js', patchReconcile],
].map(([sourceDirectory, name, patch]) => {
  const before = fs.readFileSync(new URL(`./release-files/${sourceDirectory}/${name}`, import.meta.url), 'utf8');
  fs.writeFileSync(new URL(name, directory), patch(before));
  return {
    source:`lab/release-files/transcript-index-rowid-window/${name}`,
    target:`openclaw/dist/${name}`,
    before:createHash('sha256').update(before).digest('hex'),
  };
});
fs.writeFileSync(new URL('./transcript-index-rowid-window-plan.json', import.meta.url), JSON.stringify({files}, null, 2) + '\n');
