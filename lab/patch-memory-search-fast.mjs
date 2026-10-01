import assert from 'node:assert/strict';

// memory_search latency on 2026.9.1 (db91.6). Measured on V 2026-10-02: the vector stage
// spent ~1.4 s starting the per-query KNN child, of which ~1.15 s was importing modules
// the child never uses, and the query embedding (Gemini, p50 0.5 s) only started after the
// keyword search had finished.
//
// 1. KNN child imports: the 9.1 bundle reaches truncateUtf16Safe through the
//    memory-core-host-engine-foundation barrel and keeps that barrel, the memory schema
//    entry and sqlite-runtime as bare side-effect imports. The child only needs node-sqlite,
//    sqlite-vec and runVectorKnnQuery. Upstream 2026.9.5 fixed the same thing by adding the
//    lean plugin-sdk/memory-core-host-engine-knn entry; this drops the bare imports instead.
// 2. Overlap: start the query embedding before the keyword search and await it afterwards.
//    The two are independent; error handling and the fallback path are unchanged.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchKnnQueryModule(source) {
  return replaceExactlyOnce(
    source,
    'import "./memory-core-host-engine-foundation-CaZngFdy.js";\n',
    '',
    'foundation side-effect import in the KNN query module',
  );
}

export function patchKnnChild(source) {
  let out = replaceExactlyOnce(
    source,
    'import "../../memory-core-host-engine-schema-LBdTOUn5.js";\n',
    '',
    'schema side-effect import in the KNN child',
  );
  out = replaceExactlyOnce(
    out,
    'import "../../sqlite-runtime-BYNq5dB7.js";\n',
    '',
    'sqlite-runtime side-effect import in the KNN child',
  );
  return out;
}

export function patchSearchEmbeddingOverlap(source) {
  let out = replaceExactlyOnce(
    source,
    '\t\t\t\tkeywordResults = await loadKeywordResults();\n\t\t\t\tif (opts?.lexicalOnly) return await this.finalizeKeywordOnlyResults({',
    '\t\t\t\tconst pendingQueryVec = opts?.lexicalOnly ? void 0 : this.embedQueryWithRetry(cleaned, opts?.signal, semanticProvider, false, semanticProviderRuntime);\n' +
      '\t\t\t\tpendingQueryVec?.catch(() => {});\n' +
      '\t\t\t\tkeywordResults = await loadKeywordResults();\n\t\t\t\tif (opts?.lexicalOnly) return await this.finalizeKeywordOnlyResults({',
    'primary keyword search before the query embedding',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\ttry {\n\t\t\t\t\tqueryVec = await this.embedQueryWithRetry(cleaned, opts?.signal, semanticProvider, false, semanticProviderRuntime);\n\t\t\t\t} catch (err) {\n\t\t\t\t\treleaseSemanticProvider();',
    '\t\t\t\ttry {\n\t\t\t\t\tqueryVec = await pendingQueryVec;\n\t\t\t\t} catch (err) {\n\t\t\t\t\treleaseSemanticProvider();',
    'primary query embedding await',
  );
  return out;
}
