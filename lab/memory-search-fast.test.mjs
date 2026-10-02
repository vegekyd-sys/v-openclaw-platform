import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { patchKnnChild, patchKnnQueryModule, patchSearchEmbeddingOverlap, patchSessionVisibilityFastPath, patchSpareKnnChild, patchHybridRescoring } from './patch-memory-search-fast.mjs';

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

const managerMixed = read('./release-files/memory-search-mixed/manager-runtime.js');

test('memory-search-mixed adds only hybrid rescoring to memory-search-1s', () => {
  assert.equal(patchHybridRescoring(manager1s), managerMixed);
  assert.throws(() => patchHybridRescoring(managerMixed), /manager hybrid merge|hybrid merge call/);
});

test('hybrid rescoring: coverage keyword score, gated vector backfill, any-term candidates', () => {
  assert.match(managerMixed, /params = rescoreHybridCandidates\(this\.db, params, this\.vector\.available === true\);/);
  assert.match(managerMixed, /merged: await this\.mergeHybridResults\(\{\n\t+query: cleaned,\n\t+queryVec,/);
  // Single-term queries keep upstream scoring; backfill needs half of the terms.
  assert.match(managerMixed, /if \(terms\.length < 2\) return params;/);
  assert.match(managerMixed, /if \(seen\.has\(hit\.id\) \|\| hit\.textScore < \.5\) continue;/);
  assert.match(managerMixed, /const anyTermResults = await this\.searchKeywordAnyTerm\(query, limit, sourceFilterList\)\.catch\(\(\) => \[\]\);/);
  assert.match(managerMixed, /join\(" OR "\)/);
});

test('rescoreHybridCandidates scores coverage and backfills cosine for strong keyword-only hits', async () => {
  const start = managerMixed.indexOf('function rescoreHybridCandidates(db, params, vectorAvailable) {');
  const end = managerMixed.indexOf('\n}\n', start) + 2;
  const fn = new Function('VECTOR_TABLE', 'vectorToBlob', `${managerMixed.slice(start, end)}; return rescoreHybridCandidates;`)('memory_index_chunks_vec', (v) => v);
  const texts = { a: 'DAM 策划案 docx 中纺 项目', b: '只有 项目 两个字', c: 'vector hit' };
  const db = { prepare: (sql) => ({ get: (...args) => (sql.includes('vec_distance_cosine') ? { dist: args[1] === 'a' ? 0.4 : 0.9 } : { text: texts[args[0]] }) }) };
  const out = fn(db, { query: '中纺 DAM 项目 ID 策划案 docx', queryVec: [1], vector: [{ id: 'c', path: 'c.md', score: 0.6 }], keyword: [{ id: 'a', path: 'a.md' }, { id: 'b', path: 'b.md' }] }, true);
  const byId = Object.fromEntries(out.keyword.map((hit) => [hit.id, hit.textScore]));
  assert.equal(byId.a, 5 / 6);
  assert.equal(byId.b, 1 / 6);
  assert.deepEqual(out.vector.map((hit) => [hit.id, Number(hit.score.toFixed(2))]), [['c', 0.6], ['a', 0.6]]);
  assert.equal(fn(db, { query: '康浩源', queryVec: [1], vector: [], keyword: [{ id: 'a', path: 'a.md' }] }, true).keyword[0].textScore, undefined);
});
