import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { patchKnnChild, patchKnnQueryModule, patchSearchEmbeddingOverlap, patchSessionVisibilityFastPath, patchSpareKnnChild } from './patch-memory-search-fast.mjs';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const stockManager = read('./release-files/memory-vector-chunks-manager.js');
const manager = read('./release-files/memory-search-fast/manager-runtime.js');
const knn = read('./release-files/memory-search-fast/manager-search-knn-NiSMMJUM.js');
const child = read('./release-files/memory-search-fast/memory-search-knn.child.js');

test('release manager is the V manager with only the embedding overlap applied', () => {
  assert.equal(sha(stockManager), '115e5f41ab576192389c0d0282baccdf79ac7a8acbbea2b7873602bf89242f9d');
  assert.equal(patchSearchEmbeddingOverlap(stockManager), manager);
  assert.throws(() => patchSearchEmbeddingOverlap(manager), /primary query embedding await/);
});

test('the query embedding starts before the keyword search and is awaited after it', () => {
  const start = manager.indexOf('const pendingQueryVec = opts?.lexicalOnly ? void 0 : this.embedQueryWithRetry(');
  const keyword = manager.indexOf('keywordResults = await loadKeywordResults();', start);
  const awaited = manager.indexOf('queryVec = await pendingQueryVec;', keyword);
  assert(start > 0 && keyword > start && awaited > keyword);
  // The fallback-provider path still embeds after its own keyword retry.
  assert.match(manager, /keywordResults = await loadKeywordResults\(\);\n\t+queryVec = await this\.embedQueryWithRetry\(cleaned, opts\?\.signal, semanticProvider, false, semanticProviderRuntime\);/);
});

test('KNN child and query module carry no bare side-effect imports', () => {
  assert.doesNotMatch(knn, /^import "\.\/memory-core-host-engine-foundation-/m);
  assert.doesNotMatch(child, /^import "\.\.\/\.\.\/(memory-core-host-engine-schema|sqlite-runtime)-/m);
  assert.match(child, /^import \{ n as runVectorKnnQuery \} from "\.\.\/\.\.\/manager-search-knn-NiSMMJUM\.js";$/m);
  assert.throws(() => patchKnnQueryModule(knn), /foundation side-effect import/);
  assert.throws(() => patchKnnChild(child), /schema side-effect import/);
});

const manager1s = read('./release-files/memory-search-1s/manager-runtime.js');
const visibility1s = read('./release-files/memory-search-1s/session-search-visibility-H6aL2Pcb.js');

test('memory-search-1s manager adds only the spare KNN child to memory-search-fast', () => {
  assert.equal(patchSpareKnnChild(manager), manager1s);
  assert.throws(() => patchSpareKnnChild(manager1s), /KNN child spawn/);
  const run = manager1s.slice(manager1s.indexOf('async function runVectorKnnInSubprocess(params) {'));
  assert.match(run, /child = takeSpareVectorKnnChild\(\) \?\? spawnVectorKnnChild\(\);\n\t\tprepareSpareVectorKnnChild\(\);/);
  // A spare child is unref'd while idle and re-ref'd when a search takes it.
  assert.match(manager1s, /child\.unref\(\);\n\t\tfor \(const stream of \[child\.stdin, child\.stdout, child\.stderr\]\) stream\?\.unref\?\.\(\);/);
  assert.match(manager1s, /child\.ref\(\);\n\tfor \(const stream of \[child\.stdin, child\.stdout, child\.stderr\]\) stream\?\.ref\?\.\(\);/);
});

test('session visibility returns transcript-free hits without loading the session catalog', () => {
  const entry = visibility1s.indexOf('async function filterMemorySearchHitsBySessionVisibility(params) {');
  const fast = visibility1s.indexOf('if (!params.hits.some((hit) => hit.source === "sessions")) return params.conversationRecall?.corpus === "sessions" ? [] : params.hits;', entry);
  const catalog = visibility1s.indexOf('loadCombinedSessionStoreForGateway(', entry);
  assert(entry > 0 && fast > entry && catalog > fast);
  assert.throws(() => patchSessionVisibilityFastPath(visibility1s), /session visibility filter entry/);
});
