import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { GAP_MARKER, patchAgentCommandChunk, patchEmbeddedAgentChunk } from './patch-firsttext-gap-marks.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const capture = path.join(repo, 'release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist');
const release = path.join(repo, 'lab/release-files/firsttext-gap-marks');
const read = (file) => fs.readFileSync(file, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');

for (const [name, patch, marks] of [
  ['agent-command-DPfawBbr.js', patchAgentCommandChunk, 10],
  ['embedded-agent-DaSvA-Yk.js', patchEmbeddedAgentChunk, 7],
]) {
  test(`${name}: release file is the patched V capture and only adds marks`, () => {
    const base = read(path.join(capture, name));
    const patched = read(path.join(release, name));
    assert.equal(sha(patch(base)), sha(patched));
    assert.throws(() => patch(patched), /already patched/);
    assert.equal(patched.split('firsttextGapMark(').length - 1, marks);
    assert.ok(patched.includes(GAP_MARKER));
    // Removing every added line except the try/finally wrapper restores the original.
    const stripped = patched
      .replace(/^import \{ firsttextGapMark \}.*\n/m, '')
      .replace(/\t\t\tprepare: async \(preparedOpts\) => \{\n\t\t\t\tfirsttextGapMark\("cmd-prepare-enter", opts\.runId\);\n\t\t\t\ttry \{\n\t\t\t\t\treturn await (prepareAgentCommandExecution\(preparedOpts, runtime, runtimeContext\));\n\t\t\t\t\} finally \{\n\t\t\t\t\tfirsttextGapMark\("cmd-prepare-end", opts\.runId\);\n\t\t\t\t\}\n\t\t\t\},\n/, '\t\t\tprepare: async (preparedOpts) => await $1,\n')
      .replace(/\t\t\t\{\n\t\t\t\tconst markStartupStage = startupStages\.mark;\n[\s\S]*?\n\t\t\t\}\n/, '')
      .replace(/^\t*firsttextGapMark\(.*\);\n/gm, '');
    assert.equal(stripped, base);
  });
}

test('marks are silent unless enabled and only carry validated timing fields', () => {
  const script = `
    const { firsttextGapMark } = await import(${JSON.stringify(path.join(release, 'firsttext-gap-marks.mjs'))});
    const id = '4efda310-0000-4000-8000-000000000000';
    firsttextGapMark('off', id);
    process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES = '1';
    firsttextGapMark('cmd-ingress-enter', id);
    firsttextGapMark('emb-stage:attempt-dispatch', id);
    firsttextGapMark('bad stage!', id);
    firsttextGapMark('ok', 'not-a-run-id');
    process.env.OPENCLAW_FIRSTTEXT_GAP_MARKS = '0';
    firsttextGapMark('disabled', id);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stderr.trim().split('\n').map((line) => JSON.parse(line.replace('[firsttext-gap.1] ', '')));
  assert.deepEqual(rows.map((row) => row.stage), ['cmd-ingress-enter', 'emb-stage:attempt-dispatch']);
  assert.deepEqual(Object.keys(rows[1]).sort(), ['atMs', 'loopBusyPct', 'monoMs', 'pid', 'runId', 'sincePrevMs', 'stage', 'v']);
});
