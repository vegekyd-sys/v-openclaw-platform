import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-compaction-image-skip.mjs';
import { OUTPUT_DIR, PLAN } from './build-compaction-image-skip.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const PRUNE = 'history-image-prune-Dg0CDQ4a.js';
const COMPACT = 'compact-gStBcHDe.js';

test('plan lists both patched files with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
  for (const f of plan.files) assert.equal(f.source, `${OUTPUT_DIR}/${path.basename(f.target)}`);
});

test('release files carry the marker, parse, and refuse a second patch', () => {
  for (const file of FILES) {
    const out = read(file.name);
    assert(out.includes(MARKER), file.name);
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(sha(out), file.before);
  }
});

test('sanitizeSessionHistory keeps every image byte when asked, unless the switch is 0', () => {
  const src = read(PRUNE);
  const line = src.split('\n').find((l) => l.includes('keepImageBytesBeforeIndex:'));
  const expr = line.trim().replace(/^keepImageBytesBeforeIndex:\s*/u, '').replace(/,$/u, '');
  const run = (params, env = {}) => new Function('params', 'process', 'normalizedAssistantReplay', 'resolveImageResizeSkipBeforeIndex', `return ${expr};`)(
    params, { env }, new Array(7), () => 3);
  assert.equal(run({ skipImageResize: true }), 7);
  assert.equal(run({ skipImageResize: true }, { OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP: '0' }), -1);
  assert.equal(run({ skipImageResize: true, skipPrunedImageResize: true }, { OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP: '0' }), 3);
  assert.equal(run({ skipPrunedImageResize: true }), 3, 'the attempt path (#355) is unchanged');
  assert.equal(run({ skipPrunedImageResize: true }, { OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP: '0' }), -1);
  assert.equal(run({}), -1);
});

const serverEndpointCompactionMayRun = (() => {
  const src = read(COMPACT);
  const start = src.indexOf('function serverEndpointCompactionMayRun');
  const end = src.indexOf('\n}\n', start) + 2;
  const plan = (model) => ({ enabled: model === 'responses' });
  return new Function('resolveOpenAIResponsesCompactEndpointPlan', `${src.slice(start, end)}\nreturn serverEndpointCompactionMayRun;`)(plan);
})();

test('resizing is skipped exactly when provider-owned compaction cannot run', () => {
  assert.equal(serverEndpointCompactionMayRun({ trigger: 'budget', model: 'responses', extraParams: {} }), true);
  assert.equal(serverEndpointCompactionMayRun({ trigger: 'manual', model: 'responses', extraParams: {} }), true);
  assert.equal(serverEndpointCompactionMayRun({ trigger: 'overflow', model: 'responses', extraParams: {} }), false);
  assert.equal(serverEndpointCompactionMayRun({ trigger: 'budget', model: 'responses', extraParams: {}, customInstructions: ' keep ids ' }), false);
  assert.equal(serverEndpointCompactionMayRun({ trigger: 'budget', model: 'responses', extraParams: {}, customInstructions: '   ' }), true);
  assert.equal(serverEndpointCompactionMayRun({ trigger: 'budget', model: 'completions', extraParams: {} }), false);
});

test('the endpoint guard and the compaction history sanitization share the predicate', () => {
  const src = read(COMPACT);
  assert.equal(src.split('if (!serverEndpointCompactionMayRun(params)) return;').length, 2);
  assert(!src.includes('if (params.trigger === "overflow" || params.customInstructions?.trim()'), 'old inline guard is gone');
  const call = src.slice(src.indexOf('const prior = await sanitizeSessionHistory({'), src.indexOf('const dedupedValidated'));
  assert.match(call, /messages: session\.messages,/u);
  assert.match(call, /skipImageResize: !serverEndpointCompactionMayRun\(\{\n\t+trigger,\n\t+model: effectiveModel,\n\t+extraParams: effectiveExtraParams,\n\t+customInstructions: params\.customInstructions\n\t+\}\)/u);
  assert.equal(src.split('skipImageResize:').length, 2, 'only the compaction call asks');
});
