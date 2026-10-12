import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PROMPT_MARKER, PROMPT_MARKS, patchBuiltinChunk } from './patch-firsttext-prompt-marks.mjs';
import { PROMPT_MARK_CAPTURE, PROMPT_MARK_INPUTS } from './build-firsttext-prompt-marks.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const name = 'builtin-openclaw-zQV8Wwjr.js';
const read = (file) => fs.readFileSync(file, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const base = read(path.join(repo, PROMPT_MARK_CAPTURE, name));
const patched = read(path.join(repo, 'lab/release-files/firsttext-prompt-marks', name));

test('release file is the patched V capture', () => {
  assert.equal(sha(base), PROMPT_MARK_INPUTS[0].before);
  assert.equal(sha(patchBuiltinChunk(base)), sha(patched));
  assert.throws(() => patchBuiltinChunk(patched), /already patched/);
  assert.equal(spawnSync(process.execPath, ['--check', path.join(repo, 'lab/release-files/firsttext-prompt-marks', name)]).status, 0);
});

test('patch only adds marks, the helper and the summary switch', () => {
  assert.equal(patched.split('ocPromptMark(attempt, "').length - 1, PROMPT_MARKS.length);
  assert.equal(patched.split('params.markCoreToolStage?.("tool-base:').length - 1, 4);
  const stripped = patched
    .replace(/^\/\/ firsttext-prompt-marks-v1: timing[\s\S]*?\n\t\} catch \{\}\n\}\n/m, '')
    .replace(/^\t\/\/ firsttext-prompt-marks-v1: diagnostic switch.*\n\tif \(process\.env\.OPENCLAW_EMBEDDED_STAGE_SUMMARY_ALWAYS === "1"\) return true;\n/m, '')
    .replace(/^\t*ocPromptMark\(attempt, "pp:[a-z-]+"\);\n/gm, '')
    .replace(/^\tparams\.markCoreToolStage\?\.\("tool-base:[a-z-]+"\);\n/gm, '');
  assert.equal(stripped, base);
  assert.ok(patched.includes(PROMPT_MARKER));
});

test('marks follow the call order and stay once per run', async () => {
  const helper = patched.match(/const ocPromptMarkSeen = new Map\(\);\nfunction ocPromptMark[\s\S]*?\n\t\} catch \{\}\n\}\n/)[0];
  const lines = [];
  const run = new Function('console', 'process', `${helper}; return ocPromptMark;`);
  const mark = run({ error: (line) => lines.push(line) }, { env: {}, pid: 7 });
  const attempt = { runId: 'r1', provider: 'deepseek', modelId: 'deepseek-flash' };
  mark(attempt, 'pp:enter');
  mark(attempt, 'pp:enter');
  mark({ runId: '' }, 'pp:enter');
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0].replace('[firsttext-metrics] ', ''));
  assert.deepEqual(Object.keys(row), ['runId', 'provider', 'model', 'at', 'pid', 'stage']);
  assert.equal(row.stage, 'pp:enter');
  const off = [];
  run({ error: (line) => off.push(line) }, { env: { OPENCLAW_FIRSTTEXT_PROMPT_MARKS: '0' }, pid: 7 })(attempt, 'pp:enter');
  assert.equal(off.length, 0);
  // Anchors appear in source order so the marks read as a timeline.
  const order = ['"pp:enter"', '"pp:assembly"', '"pp:context"', '"pp:before-agent-run"', '"pp:api-key"', '"pp:execution"', '"pp:observe"', '"pp:preflight"']
    .map((stage) => patched.indexOf(`ocPromptMark(attempt, ${stage})`));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
