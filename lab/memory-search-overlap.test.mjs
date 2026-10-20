import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { patchKeywordDuringKnn } from './patch-memory-search-overlap.mjs';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const base = read('./release-files/memory-search-vector-budget/manager-runtime.js');
const patched = read('./release-files/memory-search-overlap/manager-runtime.js');

test('release file is the V manager (vector-budget) with only the keyword-during-KNN change', () => {
  assert.equal(sha(base), '272177d58386e53e0f5ae2113d704005e192e98f3886db5fcd20e277f0f4fb90');
  assert.equal(patchKeywordDuringKnn(base), patched);
  assert.throws(() => patchKeywordDuringKnn(patched), /already applied/);
});

test('the keyword search runs after the embedding and while the KNN child scans', () => {
  const body = patched.slice(patched.indexOf('const pendingQueryVec = opts?.lexicalOnly'));
  const embedAwait = body.indexOf('queryVec = await pendingQueryVec;');
  const vectorStart = body.indexOf('const pendingVectorResults = queryVec.some((v) => v !== 0) ? runMemorySearchStageWithBudget(');
  const yieldOnce = body.indexOf('await new Promise((resolve) => setImmediate(resolve));', vectorStart);
  const keyword = body.indexOf('await ensureKeywordResults();', vectorStart);
  const vectorAwait = body.indexOf('const vectorResults = await pendingVectorResults;', vectorStart);
  assert(embedAwait > 0 && vectorStart > embedAwait && yieldOnce > vectorStart && keyword > yieldOnce && vectorAwait > keyword);
  // Nothing loads keywords before the embedding any more.
  assert(!body.slice(0, embedAwait).includes('keywordResults = await loadKeywordResults();'));
});

test('every keyword-only exit still has its keyword results', () => {
  assert.match(patched, /if \(opts\?\.lexicalOnly\) return await this\.finalizeKeywordOnlyResults\(\{\n\t+results: await ensureKeywordResults\(\),/);
  assert.match(patched, /finalizeStageBudgetKeywordResults\("embedding-timeout", await ensureKeywordResults\(\),/);
  assert.match(patched, /embeddings unavailable; using keyword-only results: \$\{message\}`\);\n\t+return await this\.finalizeKeywordOnlyResults\(\{\n\t+results: await ensureKeywordResults\(\),/);
  assert.match(patched, /keywordResults = await loadKeywordResults\(\);\n\t+keywordLoaded = true;\n\t+queryVec = await this\.embedQueryWithRetry\(/);
  // The vector-timeout exit runs after the keyword search has completed.
  const timeout = patched.indexOf('finalizeStageBudgetKeywordResults("vector-timeout", keywordResults,');
  assert(timeout > patched.indexOf('const vectorResults = await pendingVectorResults;'));
});

test('ensureKeywordResults loads once and the stage-budget wrapper is kept', async () => {
  const start = patched.indexOf('let keywordLoaded = false;');
  const end = patched.indexOf('let queryVec;', start);
  let loads = 0;
  const fn = new Function('loadKeywordResults', `let keywordResults = []; ${patched.slice(start, end)}; return ensureKeywordResults;`)(async () => { loads++; return ['hit']; });
  assert.deepEqual(await fn(), ['hit']);
  assert.deepEqual(await fn(), ['hit']);
  assert.equal(loads, 1);
  assert.match(patched, /const MEMORY_SEARCH_STAGE_BUDGET_MS = /);
});
