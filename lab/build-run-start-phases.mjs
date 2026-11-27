// Build lab/release-files/run-start-phases/ from V's live bytes (sha256 checked; V 2026-11-23):
//   core/dist/get-reply-CqW1y05D.js              = lab/release-files/unified-session-presentation/core/
//   core/dist/agent-runner.runtime-CAdsMsQt.js   = lab/release-files/early-tool-status/ (#575)
//   core/dist/embedded-agent-DaSvA-Yk.js         = lab/release-files/settled-tool-handoff/
//   @openclaw/codex dist/run-attempt-D1hJO4fX.js = lab/release-files/codex-turn-end-terminals/ (#589)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchAgentRunner, patchCodexRunAttempt, patchEmbeddedAgent, patchGetReply } from './patch-run-start-phases.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
export const HEAD_FILES = [
  { from: 'lab/release-files/unified-session-presentation/core/get-reply-CqW1y05D.js', name: 'get-reply-CqW1y05D.js', target: 'core/dist/get-reply-CqW1y05D.js', before: 'a22a84a9b832d0aed7a0ab00354dde35a332cff377a9eeca6df3130292a4f974', patch: patchGetReply },
  { from: 'lab/release-files/early-tool-status/agent-runner.runtime-CAdsMsQt.js', name: 'agent-runner.runtime-CAdsMsQt.js', target: 'core/dist/agent-runner.runtime-CAdsMsQt.js', before: 'ec866319e0125f124acd499d42a76bc49672b92618a8f358a1b7afc343e4a2d3', patch: patchAgentRunner },
  { from: 'lab/release-files/settled-tool-handoff/embedded-agent-DaSvA-Yk.js', name: 'embedded-agent-DaSvA-Yk.js', target: 'core/dist/embedded-agent-DaSvA-Yk.js', before: '182c175cc3fb8a2d73014def89413e0b8f709b5494af8b81a5d2ab5d0484340a', patch: patchEmbeddedAgent },
  { from: 'lab/release-files/codex-turn-end-terminals/run-attempt-D1hJO4fX.js', name: 'run-attempt-D1hJO4fX.js', target: '@openclaw/codex/dist/run-attempt-D1hJO4fX.js', before: '23705af0ceb5a879284ed04206cfba97be80bc872bfaf8cab21f601b3551d5cb', patch: patchCodexRunAttempt },
];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = [];
  for (const file of HEAD_FILES) {
    const original = fs.readFileSync(path.join(repo, file.from), 'utf8');
    const before = sha(original);
    if (before !== file.before) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
    const patched = file.patch(original);
    const source = `lab/release-files/run-start-phases/${file.name}`;
    fs.mkdirSync(path.join(repo, 'lab/release-files/run-start-phases'), { recursive: true });
    fs.writeFileSync(path.join(repo, source), patched);
    out.push({ source, target: file.target, before, after: sha(patched) });
  }
  console.log(JSON.stringify(out, null, 2));
}
