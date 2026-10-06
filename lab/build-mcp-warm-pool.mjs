// Build lab/release-files/mcp-warm-pool/ from V's live bytes.
//   agents/agent-bundle-mcp-runtime.js  V after firsttext-r1 (captured 2026-10-06; carries the
//                                       bundle-prep-observer marks)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchMcpWarmPool } from './patch-mcp-warm-pool.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const files = [
  { name: 'agents/agent-bundle-mcp-runtime.js', from: path.join(repo, 'release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/agents/agent-bundle-mcp-runtime.js'), before: '7971447cf4e11d0fcc8e4b0c729085101bbc45c77a8f1ede1eb5f6c343769354', patch: patchMcpWarmPool },
];
const out = [];
for (const file of files) {
  const original = fs.readFileSync(file.from, 'utf8');
  if (sha(original) !== file.before) throw new Error(`Unexpected input checksum for ${file.name}`);
  const patched = file.patch(original);
  const source = `lab/release-files/mcp-warm-pool/${file.name}`;
  fs.mkdirSync(path.dirname(path.join(repo, source)), { recursive: true });
  fs.writeFileSync(path.join(repo, source), patched);
  out.push({ source, target: `openclaw/dist/${file.name}`, before: file.before, after: sha(patched) });
}
console.log(JSON.stringify(out, null, 2));
