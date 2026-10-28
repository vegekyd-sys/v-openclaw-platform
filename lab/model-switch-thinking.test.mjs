import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-model-switch-thinking.mjs';
import { OUTPUT_DIR, PLAN } from './build-model-switch-thinking.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');

test('plan lists every patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  for (const file of FILES) assert.equal(plan.files.find((f) => f.target.endsWith(file.name)).before, file.before);
});

test('release files carry the marker and refuse a second patch', () => {
  for (const file of FILES.filter((f) => f.name.endsWith('.js'))) {
    const out = read(file.name);
    assert(out.includes(MARKER), `${file.name} lacks ${MARKER}`);
    assert.throws(() => file.patch(out), /already patched/u);
  }
});

test('worker source matches the release file', () => {
  const src = fs.readFileSync(path.join(repo, 'experiments/agent-worker-isolation-v1/harness-event-contract.mjs'), 'utf8');
  assert.equal(sha(src), sha(read('harness-event-contract.mjs')));
});

test('no remaining write-back of a clamped thinking level', () => {
  assert(!read('directive-handling.impl-CoR1-5xR.js').includes('sessionEntry.thinkingLevel = remappedUnsupportedThinkLevel'));
  assert(!read('directive-handling.impl-CoR1-5xR.js').includes('touchedSessionFields.push("thinkingLevel")'));
  assert(!read('apply-session-model-selection-CJtWmAQJ.js').includes('nextEntry.thinkingLevel = remapped'));
  assert(!read('sessions-patch-iR7MNInU.js').includes('next.thinkingLevel = resolveSupportedThinkingLevel'));
  assert(read('harness-event-contract.mjs').includes('  thinkLevel: "thinkingOnce",'));
  // The notice for the newly selected model is kept.
  assert(read('directive-handling.impl-CoR1-5xR.js').includes('not supported for ${resolvedProvider}/${resolvedModel}).`'));
  assert(read('apply-session-model-selection-CJtWmAQJ.js').includes('thinkingRemap = {'));
});

test('release files parse', () => {
  for (const file of FILES) {
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${file.name} does not parse: ${r.stderr}`);
  }
});

test('release bytes are the build of V bytes', { skip: !process.env.MSWT_V_BASE && 'set MSWT_V_BASE=<dir with core/dist/*> to compare' }, () => {
  for (const file of FILES) {
    const original = fs.readFileSync(path.join(process.env.MSWT_V_BASE, file.base, file.name), 'utf8');
    assert.equal(sha(original), file.before);
    assert.equal(sha(file.patch(original)), sha(read(file.name)));
  }
});
