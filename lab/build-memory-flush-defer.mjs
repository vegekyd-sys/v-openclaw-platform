// Build lab/release-files/memory-flush-defer/ from V's live bytes: agent-runner.runtime and
// builtin-openclaw from the latest V capture (V patches both), agent-runner-memory from the
// npm 2026.9.1 bytes (unmodified on V, kept as a fixture).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchAgentRunnerMemory, patchAgentRunnerRuntime, patchBuiltinOpenclaw } from './patch-memory-flush-defer.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const captured = path.join(repo, 'release/captured/v2026.9.1-db91.6-firsttext-r1-20261006');
const fixtures = path.join(dir, 'fixtures/memory-flush-defer');
const files = [
  { from: `${captured}/dist/agent-runner.runtime-CAdsMsQt.js`, name: 'agent-runner.runtime-CAdsMsQt.js', target: 'openclaw/dist/agent-runner.runtime-CAdsMsQt.js', patch: patchAgentRunnerRuntime },
  { from: `${fixtures}/agent-runner-memory-7VF-zwNt.js`, name: 'agent-runner-memory-7VF-zwNt.js', target: 'openclaw/dist/agent-runner-memory-7VF-zwNt.js', patch: patchAgentRunnerMemory },
  { from: `${captured}/dist/builtin-openclaw-zQV8Wwjr.js`, name: 'builtin-openclaw-zQV8Wwjr.js', target: 'openclaw/dist/builtin-openclaw-zQV8Wwjr.js', patch: patchBuiltinOpenclaw },
];
export const EXPECTED_INPUT_SHA256 = {
  'agent-runner.runtime-CAdsMsQt.js': '9b85f780d8a5ece533efc7166e0e56d6a0e0f7a6f3c737e496f07d5d0b98a7fd',
  'agent-runner-memory-7VF-zwNt.js': '8bca065f05bfd1f8baba4ab799dcfa131aade7b4876c0a4349a8eefd5a0a2317',
  'builtin-openclaw-zQV8Wwjr.js': '8445647093325217ee80f83b1fd34b5a01f2322adbb495732d576d2d40d75af1',
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = [];
  for (const file of files) {
    const original = fs.readFileSync(file.from, 'utf8');
    const before = sha(original);
    if (before !== EXPECTED_INPUT_SHA256[file.name]) throw new Error(`Unexpected input checksum for ${file.name}: ${before}`);
    const patched = file.patch(original);
    const source = `lab/release-files/memory-flush-defer/${file.name}`;
    fs.writeFileSync(path.join(repo, source), patched);
    out.push({ source, target: file.target, before, after: sha(patched) });
  }
  console.log(JSON.stringify(out, null, 2));
}
