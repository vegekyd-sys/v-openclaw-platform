// Offline tests for lab/patch-memory-search-vector-budget.mjs against V's captured bytes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchManagerStageBudget, patchToolDegradedField } from '../lab/patch-memory-search-vector-budget.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const captured = path.join(repo, 'release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const stockManager = fs.readFileSync(path.join(captured, 'extensions/memory-core/manager-runtime.js'), 'utf8');
const stockTools = fs.readFileSync(path.join(captured, 'tools-Byg09TOP.js'), 'utf8');

test('inputs are the bytes V runs', () => {
  assert.equal(sha(stockManager), '134cc6f6dfcda254be4e727cd9a0b47649aa88d8697043fc5f509c3a64270e87');
  assert.equal(sha(stockTools), '091c318773a6bd3f4c332ef40c42d8ca10aa0c586346527dde986e2fb0433e30');
});

test('release files are the build output and the plan points at them', () => {
  const manager = patchManagerStageBudget(stockManager);
  const tools = patchToolDegradedField(stockTools);
  assert.equal(read('lab/release-files/memory-search-vector-budget/manager-runtime.js'), manager);
  assert.equal(read('lab/release-files/memory-search-vector-budget/tools-Byg09TOP.js'), tools);
  const plan = JSON.parse(read('lab/candidate/memory-search-vector-budget.plan.json'));
  const byTarget = Object.fromEntries(plan.files.map((f) => [f.target, f]));
  assert.equal(byTarget['openclaw/dist/extensions/memory-core/manager-runtime.js'].before, sha(stockManager));
  assert.equal(byTarget['openclaw/dist/tools-Byg09TOP.js'].before, sha(stockTools));
});

test('patches apply once and refuse to apply twice', () => {
  const manager = patchManagerStageBudget(stockManager);
  assert.throws(() => patchManagerStageBudget(manager), /already carries/);
  assert.throws(() => patchToolDegradedField(patchToolDegradedField(stockTools)), /already report/);
});

test('both semantic stages run under the budget and fall back to keyword results', () => {
  const manager = patchManagerStageBudget(stockManager);
  assert.match(manager, /runMemorySearchStageWithBudget\(opts\?\.signal, \(stageSignal\) => this\.embedQueryWithRetry\(cleaned, stageSignal,/);
  assert.match(manager, /runMemorySearchStageWithBudget\(opts\?\.signal, \(stageSignal\) => this\.searchVector\(queryVec, candidates, sourceFilterList, vectorProviderIdentity, stageSignal\)/);
  assert.match(manager, /queryVec === memorySearchStageExpired\) return await this\.finalizeStageBudgetKeywordResults\("embedding-timeout"/);
  assert.match(manager, /vectorResults === memorySearchStageExpired\) return await this\.finalizeStageBudgetKeywordResults\("vector-timeout"/);
  // The keyword-only answer is the manager's own no-provider path, not a new ranking.
  assert.match(manager, /async finalizeStageBudgetKeywordResults[\s\S]{0,600}return await this\.finalizeKeywordOnlyResults\(\{/);
  // Only the two stage calls are replaced; every other stock line is still there.
  const kept = new Set(manager.split('\n'));
  assert.deepEqual(stockManager.split('\n').filter((l) => !kept.has(l)).map((l) => l.trim().slice(0, 60)), [
    'const pendingQueryVec = opts?.lexicalOnly ? void 0 : this.em',
    'const vectorResults = queryVec.some((v) => v !== 0) ? await ',
  ]);
});

test('the tool reports degraded next to results and in debug', () => {
  const tools = patchToolDegradedField(stockTools);
  assert.match(tools, /degraded: runtimeDebug\.findLast\(\(entry\) => entry\.degraded\)\?\.degraded,/);
  assert.match(tools, /mode: memoryValue\?\.mode,\n\t+\.\.\.memoryValue\?\.debug\?\.degraded \? \{ degraded: memoryValue\.debug\.degraded \} : \{\},/);
});

// Evaluate the helper exactly as shipped.
function loadBudgetHelper(budgetMs) {
  const manager = patchManagerStageBudget(stockManager);
  const start = manager.indexOf('const MEMORY_SEARCH_STAGE_BUDGET_MS');
  const end = manager.indexOf('\n}\n', manager.indexOf('async function runMemorySearchStageWithBudget')) + 3;
  const env = { OPENCLAW_MEMORY_SEARCH_STAGE_BUDGET_MS: String(budgetMs) };
  return new Function('process', `${manager.slice(start, end)}\nreturn { run: runMemorySearchStageWithBudget, expired: memorySearchStageExpired, budget: MEMORY_SEARCH_STAGE_BUDGET_MS };`)({ env });
}
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms, 'done');
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

test('budget helper: a stage within budget returns its value', async () => {
  const h = loadBudgetHelper(200);
  assert.equal(await h.run(undefined, (signal) => sleep(10, signal)), 'done');
});

test('budget helper: a slow stage is aborted and reported as expired on time', async () => {
  const h = loadBudgetHelper(50);
  let stageSignal;
  const t = performance.now();
  const out = await h.run(undefined, (signal) => { stageSignal = signal; return sleep(5_000, signal); });
  assert.equal(out, h.expired);
  assert(performance.now() - t < 1_000);
  assert.equal(stageSignal.aborted, true, 'the stage (KNN child, embedding request) must be told to stop');
});

test('budget helper: the caller aborting still rejects as before', async () => {
  const h = loadBudgetHelper(5_000);
  const parent = new AbortController();
  setTimeout(() => parent.abort(new Error('caller gone')), 20);
  await assert.rejects(h.run(parent.signal, (signal) => sleep(2_000, signal)), /caller gone/);
});

test('budget helper: default budget is 8 s and bad values fall back to it', () => {
  assert.equal(loadBudgetHelper('nonsense').budget, 8000);
  assert.equal(loadBudgetHelper(0).budget, 8000);
  assert.equal(loadBudgetHelper(2500).budget, 2500);
});
