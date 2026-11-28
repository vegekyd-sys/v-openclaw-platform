import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MARKER, patchMonitor } from './patch-feishu-block-media.mjs';
import { FILES, OUTPUT_DIR, PLAN } from './build-feishu-block-media.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const e2ePlan = JSON.parse(fs.readFileSync(path.join(repo, 'lab/workspace-html-attach-e2e.candidate.plan.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const NAME = 'monitor.account-WFdlCDhR.js';
const base = fs.readFileSync(path.join(repo, FILES[0].base, NAME), 'utf8');
const patched = fs.readFileSync(path.join(repo, OUTPUT_DIR, NAME), 'utf8');

test('plan replaces V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, FILES.map((f) => ({ source: `${OUTPUT_DIR}/${f.name}`, target: `${f.target}/${f.name}`, before: f.before })));
  assert(e2ePlan.files.some((f) => f.source === plan.files[0].source && f.target === plan.files[0].target && f.before === plan.files[0].before));
  assert.equal(sha(base), FILES[0].before);
  assert.equal(patchMonitor(base), patched);
  assert(patched.includes(MARKER));
  assert.throws(() => patchMonitor(patched), /already applied/u);
  const check = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, NAME)], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});

test('only the non-streaming block branch changes, and it now sends the media', () => {
  const baseLines = base.split('\n');
  const patchedLines = patched.split('\n');
  assert.equal(patchedLines.length, baseLines.length);
  const changed = baseLines.map((line, i) => [line, patchedLines[i]]).filter(([a, b]) => a !== b);
  assert.equal(changed.length, 1);
  const [[before, after]] = changed;
  assert.equal(before, '\t\t\t\t\t\t}');
  assert(after.startsWith('\t\t\t\t\t\t} else if (hasMedia) await collectDelivery(sendMediaReplies(payload));'));
  // The branch it extends: a block whose text is not going into a streaming card.
  const at = patchedLines.indexOf(after);
  assert.equal(patchedLines[at - 6], '\t\t\t\t\tif (hasPresentationFallback || info?.kind === "block" && !useStreamingCard) {');
  assert.equal(patchedLines[at - 5], '\t\t\t\t\t\tif (hasPresentationFallback || coreBlockStreamingEnabled) {');
  assert.equal(patchedLines[at + 1], '\t\t\t\t\t\treturn mergeFeishuReplyDeliveryResults(deliveredResults, text);');
});
