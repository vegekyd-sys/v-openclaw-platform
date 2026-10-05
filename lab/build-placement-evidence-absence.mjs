// Build lab/release-files/placement-evidence-absence/ from V's live bytes (captured 2026-10-05).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchAccessor, patchPlacementStartup } from './patch-placement-evidence-absence.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const captured = path.join(repo, 'release/captured/v2026.9.1-db91.6-gpt-live-voice-20261005/dist');
const files = [
  { name: 'session-accessor-K0XuW6ln.js', before: '21f2a5695f1caa2f3c18784f92a6f2beb7f54f71ad1378c5125f0d1d0563ca77', patch: patchAccessor },
  { name: 'server-worker-placement-startup-BvPREvpr.js', before: '96b5b482700dcfe715c0acc1fd3f319e4e87d03372a9f4c7f33e4f0434c39663', patch: patchPlacementStartup },
];
const out = [];
for (const file of files) {
  const original = fs.readFileSync(path.join(captured, file.name), 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.name}`);
  const patched = file.patch(original);
  const source = `lab/release-files/placement-evidence-absence/${file.name}`;
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: `openclaw/dist/${file.name}`, before: file.before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
