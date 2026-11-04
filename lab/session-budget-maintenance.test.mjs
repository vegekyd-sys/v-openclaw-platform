import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-session-budget-maintenance.mjs';
import { OUTPUT_DIR, PLAN } from './build-session-budget-maintenance.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const RELEASE = 'agent-runner-memory-7VF-zwNt.js';

test('plan lists the patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.equal(plan.files[0].before, FILES[0].before);
});

test('release file carries the marker, parses, and refuses a second patch', () => {
  const out = read(RELEASE);
  assert(out.includes(MARKER));
  assert.throws(() => FILES[0].patch(out), /already patched/u);
  const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, RELEASE)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('both maintenance paths pass the session entry', () => {
  const out = read(RELEASE);
  assert.equal(out.split('sessionEntry: entry\n\t});').length, 2, 'runSessionCompactionIfNeeded');
  assert.equal(out.split('sessionEntry: activeSessionEntry\n\t});').length, 2, 'runMemoryFlushIfNeeded');
});

const resolveSessionRunContextTokens = (() => {
  const src = read(RELEASE);
  const start = src.indexOf('function resolveSessionRunContextTokens');
  const end = src.indexOf('\n}\n', start) + 2;
  const normalizeProviderId = (id) => String(id).trim().toLowerCase();
  return new Function('normalizeProviderId', `${src.slice(start, end)}\nreturn resolveSessionRunContextTokens;`)(normalizeProviderId);
})();
const entry = { contextTokens: 850000, model: 'gpt-6-luna', modelProvider: 'openai' };

test('the budget the last turn ran with applies to the same model', () => {
  assert.equal(resolveSessionRunContextTokens({ provider: 'openai', modelId: 'gpt-6-luna', sessionEntry: entry }), 850000);
  assert.equal(resolveSessionRunContextTokens({ provider: 'openai', modelId: 'openai/gpt-6-luna', sessionEntry: entry }), 850000);
  assert.equal(resolveSessionRunContextTokens({ provider: 'openai', modelId: 'GPT-6-Luna', sessionEntry: entry }), 850000);
});

test('another model, another provider or no recorded budget falls back to the lookup', () => {
  assert.equal(resolveSessionRunContextTokens({ provider: 'openai', modelId: 'gpt-6-luna', sessionEntry: { ...entry, model: 'deepseek-flash', modelProvider: 'deepseek' } }), undefined);
  assert.equal(resolveSessionRunContextTokens({ provider: 'openai', modelId: 'gpt-6-luna', sessionEntry: { ...entry, modelProvider: 'azure-openai' } }), undefined);
  assert.equal(resolveSessionRunContextTokens({ provider: 'openai', modelId: 'gpt-6-luna', sessionEntry: { ...entry, contextTokens: undefined } }), undefined);
  assert.equal(resolveSessionRunContextTokens({ provider: 'openai', modelId: 'gpt-6-luna', sessionEntry: { ...entry, contextTokens: 0 } }), undefined);
  assert.equal(resolveSessionRunContextTokens({ provider: 'openai', modelId: 'gpt-6-luna' }), undefined);
});
