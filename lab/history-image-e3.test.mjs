import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { COMBINED_FILES, buildCombined } from './build-history-image-e3.mjs';
import { RESIZE_SKIP_MARKER, patchEmbeddedAgentHelpers } from './patch-history-image-resize-skip.mjs';
import { IMAGE_MARKER, NOTICE_MARKER, patchErrorText } from './patch-deepseek-budget-completions.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const byName = Object.fromEntries(COMBINED_FILES.map((file) => [file.name, file]));

test('release files are V\'s live bytes plus every patch for that file', () => {
  for (const file of COMBINED_FILES) {
    const original = read(file.input);
    assert.equal(sha(original), file.before, file.name);
    assert.equal(buildCombined(file, original), read(file.output), file.name);
    assert.equal(spawnSync(process.execPath, ['--check', path.join(repo, file.output)]).status, 0, file.name);
  }
});

test('the plan ships exactly the built files over V\'s bytes', () => {
  const plan = JSON.parse(read('lab/history-image-e3.plan.json'));
  assert.deepEqual(plan.files, COMBINED_FILES.map((file) => ({ source: file.output, target: file.target, before: file.before })));
});

test('files touched by one PR are byte-identical to that PR\'s own release file', () => {
  const single = {
    'history-image-prune-Dg0CDQ4a.js': 'lab/release-files/history-image-resize-skip/history-image-prune-Dg0CDQ4a.js',
    'embedded-agent-DaSvA-Yk.js': 'lab/release-files/deepseek-budget-completions/embedded-agent-DaSvA-Yk.js',
    'agent-runner.runtime-CAdsMsQt.js': 'lab/release-files/deepseek-budget-completions/agent-runner.runtime-CAdsMsQt.js',
    'openai-completions-D0QZ0AyB.mjs': 'lab/release-files/deepseek-budget-completions/openai-completions-D0QZ0AyB.mjs',
  };
  for (const [name, file] of Object.entries(single)) assert.equal(read(byName[name].output), read(file), name);
});

test('the shared helpers file carries both patches, independent of order', () => {
  const helpers = byName['embedded-agent-helpers-CzpaLpCq.js'];
  const combined = read(helpers.output);
  const resizeOnly = read('lab/release-files/history-image-resize-skip/embedded-agent-helpers-CzpaLpCq.js');
  const noticeOnly = read('lab/release-files/deepseek-budget-completions/embedded-agent-helpers-CzpaLpCq.js');
  assert.equal(patchErrorText(resizeOnly), combined);
  assert.equal(patchEmbeddedAgentHelpers(noticeOnly), combined);
  assert.ok(combined.includes(RESIZE_SKIP_MARKER) && combined.includes(NOTICE_MARKER));
  assert.ok(read(byName['openai-completions-D0QZ0AyB.mjs'].output).includes(IMAGE_MARKER));
  assert.throws(() => buildCombined(helpers, combined), /already patched/);
});
