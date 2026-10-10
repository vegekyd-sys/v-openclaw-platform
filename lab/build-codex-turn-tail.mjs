// Build lab/release-files/codex-turn-tail/ from V's live db91.6 bytes: node-sqlite and ws-log are the npm 2026.9.1
// bytes (unmodified on V, kept as fixtures), embedded-agent is V's gpt-live-call bytes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchEmbeddedAgent, patchNodeSqlite, patchWsLog } from './patch-codex-turn-tail.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const TAIL_FILES = [
  { from: 'lab/fixtures/codex-turn-tail/node-sqlite-CL-d6drd.js', name: 'node-sqlite-CL-d6drd.js', before: '27ca87d5d7228b75aef607bf51e3e0f8d9f2f427f9defb98ca89071fe35c7c48', patch: patchNodeSqlite },
  { from: 'lab/fixtures/codex-turn-tail/ws-log-CFwaDvs6.js', name: 'ws-log-CFwaDvs6.js', before: 'a73141cb06c2c13e67a827a6ab134bc96de350e456305607e590f18774b82573', patch: patchWsLog },
  { from: 'lab/release-files/gpt-live-call/embedded-agent-DaSvA-Yk.js', name: 'embedded-agent-DaSvA-Yk.js', before: '94fc21cb0511287baf7b7d1196075619a105958d6e2308eb75f5d31452aa749b', patch: patchEmbeddedAgent },
];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = [];
  for (const file of TAIL_FILES) {
    const original = fs.readFileSync(path.join(repo, file.from), 'utf8');
    const before = sha(original);
    if (before !== file.before) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
    const patched = file.patch(original);
    const source = `lab/release-files/codex-turn-tail/${file.name}`;
    fs.mkdirSync(path.join(repo, 'lab/release-files/codex-turn-tail'), { recursive: true });
    fs.writeFileSync(path.join(repo, source), patched);
    out.push({ source, target: `openclaw/dist/${file.name}`, before, after: sha(patched) });
  }
  console.log(JSON.stringify(out, null, 2));
}
