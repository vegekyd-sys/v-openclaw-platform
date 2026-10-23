import assert from 'node:assert/strict';

// memory_search: run the keyword search while the vector KNN child works (V, 2026-10-20).
//
// The keyword stage is synchronous SQLite on the caller's thread (per-term fallback and
// any-term FTS queries, 0.2-0.3 s on V's 21.8 GB agent database). It used to run right
// after the query embedding request was started, so the embedding round trip, which
// needs the event loop for its socket and TLS work, waited behind it: Gemini answers in
// 0.47 s but the in-search embedding took 0.8-1.1 s. Measured out of the Gateway on V
// with the same dist: keyword after the embedding settles brings it back to 0.49 s.
//
// The vector KNN runs in a child process, so the thread is idle while it scans. Order
// is now: embedding (thread free) -> start the KNN child -> keyword search on the thread
// meanwhile -> await the KNN -> merge. Same inputs, same functions, same results.
// The keyword-only exits (lexical-only, embedding past its budget, no provider) run the
// keyword search where they need it; the fallback-provider path keeps its own reload.

const MARK = 'v-memory-search-keyword-during-knn-20261021';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchKeywordDuringKnn(source) {
  assert(!source.includes(MARK), 'keyword-during-knn already applied');
  let out = replaceExactlyOnce(
    source,
    '\t\t\tlet keywordResults = [];\n\t\t\tlet queryVec;\n\t\t\tconst releaseSemanticProvider = this.acquireProviderUse(semanticProvider);\n',
    `\t\t\tlet keywordResults = [];\n\t\t\t// ${MARK}: the keyword search is synchronous SQLite; run it while the KNN child scans,\n\t\t\t// not while the embedding round trip needs this thread.\n\t\t\tlet keywordLoaded = false;\n\t\t\tconst ensureKeywordResults = async () => {\n\t\t\t\tif (!keywordLoaded) {\n\t\t\t\t\tkeywordResults = await loadKeywordResults();\n\t\t\t\t\tkeywordLoaded = true;\n\t\t\t\t}\n\t\t\t\treturn keywordResults;\n\t\t\t};\n\t\t\tlet queryVec;\n\t\t\tconst releaseSemanticProvider = this.acquireProviderUse(semanticProvider);\n`,
    'search locals',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\tpendingQueryVec?.catch(() => {});\n\t\t\t\tkeywordResults = await loadKeywordResults();\n\t\t\t\tif (opts?.lexicalOnly) return await this.finalizeKeywordOnlyResults({\n\t\t\t\t\tresults: keywordResults,',
    '\t\t\t\tpendingQueryVec?.catch(() => {});\n\t\t\t\tif (opts?.lexicalOnly) return await this.finalizeKeywordOnlyResults({\n\t\t\t\t\tresults: await ensureKeywordResults(),',
    'keyword before embedding',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\t\tif (queryVec === memorySearchStageExpired) return await this.finalizeStageBudgetKeywordResults("embedding-timeout", keywordResults, hybrid, maxResults, minScore, opts);',
    '\t\t\t\t\tif (queryVec === memorySearchStageExpired) return await this.finalizeStageBudgetKeywordResults("embedding-timeout", await ensureKeywordResults(), hybrid, maxResults, minScore, opts);',
    'embedding budget exit',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\t\t\t\tkeywordResults = await loadKeywordResults();\n\t\t\t\t\t\t\tqueryVec = await this.embedQueryWithRetry(',
    '\t\t\t\t\t\t\tkeywordResults = await loadKeywordResults();\n\t\t\t\t\t\t\tkeywordLoaded = true;\n\t\t\t\t\t\t\tqueryVec = await this.embedQueryWithRetry(',
    'fallback provider reload',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\t\t\tlog$1.warn(`memory search: embeddings unavailable; using keyword-only results: ${message}`);\n\t\t\t\t\t\treturn await this.finalizeKeywordOnlyResults({\n\t\t\t\t\t\t\tresults: keywordResults,',
    '\t\t\t\t\t\tlog$1.warn(`memory search: embeddings unavailable; using keyword-only results: ${message}`);\n\t\t\t\t\t\treturn await this.finalizeKeywordOnlyResults({\n\t\t\t\t\t\t\tresults: await ensureKeywordResults(),',
    'no provider exit',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\tconst vectorResults = queryVec.some((v) => v !== 0) ? await runMemorySearchStageWithBudget(opts?.signal, (stageSignal) => this.searchVector(',
    '\t\t\tconst pendingVectorResults = queryVec.some((v) => v !== 0) ? runMemorySearchStageWithBudget(opts?.signal, (stageSignal) => this.searchVector(',
    'vector stage start',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t})) : [];\n\t\t\tif (vectorResults === memorySearchStageExpired) return await this.finalizeStageBudgetKeywordResults("vector-timeout", keywordResults, hybrid, maxResults, minScore, opts);',
    '\t\t\t})) : Promise.resolve([]);\n\t\t\tpendingVectorResults.catch(() => {});\n\t\t\t// Let the vector stage reach the KNN child first: the keyword SQL below holds the thread.\n\t\t\tawait new Promise((resolve) => setImmediate(resolve));\n\t\t\tawait ensureKeywordResults();\n\t\t\tconst vectorResults = await pendingVectorResults;\n\t\t\tif (vectorResults === memorySearchStageExpired) return await this.finalizeStageBudgetKeywordResults("vector-timeout", keywordResults, hybrid, maxResults, minScore, opts);',
    'vector stage await',
  );
  return out;
}
