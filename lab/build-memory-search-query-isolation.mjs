import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchMemorySearchManager, patchMemorySearchTools } from './patch-memory-search-query-isolation.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  {
    source: 'release-files/memory-search-timeout-tools.js',
    target: 'openclaw/dist/tools-Byg09TOP.js',
    before: 'ab4ea0b409edc959a27a99835ed062b326477a2e37ac9df082619ac15c6c675a',
    patch: patchMemorySearchTools,
  },
  {
    source: 'release-files/memory-vector-chunks-manager.js',
    target: 'openclaw/dist/extensions/memory-core/manager-runtime.js',
    before: '1ec72378de48cee9d8deeaef75e753e694162a5b8eba66fd663b0b3c92854e84',
    patch: patchMemorySearchManager,
  },
];

for (const file of files) {
  const filePath = path.join(dir, file.source);
  const original = fs.readFileSync(filePath, 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.source}`);
  fs.writeFileSync(filePath, file.patch(original));
}

const plan = {
  baseRelease: 'native-final-candidate-20260911-v1',
  files: files.map(({ source, target, before }) => ({ source: `lab/${source}`, target, before })),
};
fs.writeFileSync(path.join(dir, 'memory-search-query-isolation-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({
  baseRelease: plan.baseRelease,
  files: files.map(({ source }) => ({ source, after: sha(fs.readFileSync(path.join(dir, source))) })),
}));
