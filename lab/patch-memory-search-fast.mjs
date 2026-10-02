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

// 3. Session visibility (upstream 2026.9.5 fix, backported): filtering memory_search
//    hits by session visibility loaded the agent's whole session catalog on the
//    Gateway loop for every call, even when no hit came from a session transcript.
//    Measured inside the VLab Gateway 2026-10-02: 0.82-0.99 s per call for 3,743
//    makaron sessions; makaron indexes memory files only, so it was pure overhead.
//    The result for transcript-free hits does not depend on the catalog.
export function patchSessionVisibilityFastPath(source) {
  return replaceExactlyOnce(
    source,
    'async function filterMemorySearchHitsBySessionVisibility(params) {\n\tconst visibility = resolveEffectiveSessionToolsVisibility({',
    'async function filterMemorySearchHitsBySessionVisibility(params) {\n' +
      '\t// Session visibility owns transcript hits only; memory-only results never need the session catalog.\n' +
      '\tif (!params.hits.some((hit) => hit.source === "sessions")) return params.conversationRecall?.corpus === "sessions" ? [] : params.hits;\n' +
      '\tconst visibility = resolveEffectiveSessionToolsVisibility({',
    'session visibility filter entry',
  );
}

// 4. Spare KNN child: every vector search started a fresh Node child (~0.2 s even
//    after the import fix). Keep one pre-spawned child waiting on stdin and take it
//    for the next search; the child opens the database only after it reads a request,
//    and exits on its own when the parent goes away (stdin closes).
export function patchSpareKnnChild(source) {
  let out = replaceExactlyOnce(
    source,
    '/** Run one file-backed KNN query in a bounded, OS-killable child process. */\nasync function runVectorKnnInSubprocess(params) {',
    '// One pre-spawned child waits on stdin so a search skips the Node start of a fresh one.\n' +
      'let spareVectorKnnChild;\n' +
      'function spawnVectorKnnChild() {\n' +
      '\tconst childUrl = resolveRuntimeWorkerUrl(vectorKnnProcessEntrypoint);\n' +
      '\treturn spawn(process.execPath, resolveRuntimeWorkerArgv(childUrl), {\n' +
      '\t\tenv: buildChildEnv(),\n\t\tshell: false,\n\t\tstdio: [\n\t\t\t"pipe",\n\t\t\t"pipe",\n\t\t\t"pipe"\n\t\t],\n\t\twindowsHide: true\n\t});\n' +
      '}\n' +
      'function takeSpareVectorKnnChild() {\n' +
      '\tconst child = spareVectorKnnChild;\n' +
      '\tspareVectorKnnChild = void 0;\n' +
      '\tif (!child || child.exitCode !== null || child.signalCode !== null || child.killed) return void 0;\n' +
      '\tchild.ref();\n' +
      '\tfor (const stream of [child.stdin, child.stdout, child.stderr]) stream?.ref?.();\n' +
      '\treturn child;\n' +
      '}\n' +
      'function prepareSpareVectorKnnChild() {\n' +
      '\tif (spareVectorKnnChild) return;\n' +
      '\ttry {\n' +
      '\t\tconst child = spawnVectorKnnChild();\n' +
      '\t\tconst forget = () => {\n\t\t\tif (spareVectorKnnChild === child) spareVectorKnnChild = void 0;\n\t\t};\n' +
      '\t\tchild.on("error", forget);\n' +
      '\t\tchild.on("exit", forget);\n' +
      '\t\tchild.unref();\n' +
      '\t\tfor (const stream of [child.stdin, child.stdout, child.stderr]) stream?.unref?.();\n' +
      '\t\tspareVectorKnnChild = child;\n' +
      '\t} catch {}\n' +
      '}\n' +
      '/** Run one file-backed KNN query in a bounded, OS-killable child process. */\nasync function runVectorKnnInSubprocess(params) {',
    'KNN subprocess runner',
  );
  out = replaceExactlyOnce(
    out,
    '\ttry {\n\t\tconst childUrl = resolveRuntimeWorkerUrl(vectorKnnProcessEntrypoint);\n\t\tchild = spawn(process.execPath, resolveRuntimeWorkerArgv(childUrl), {\n\t\t\tenv: buildChildEnv(),\n\t\t\tshell: false,\n\t\t\tstdio: [\n\t\t\t\t"pipe",\n\t\t\t\t"pipe",\n\t\t\t\t"pipe"\n\t\t\t],\n\t\t\twindowsHide: true\n\t\t});\n\t} catch (error) {',
    '\ttry {\n\t\tchild = takeSpareVectorKnnChild() ?? spawnVectorKnnChild();\n\t\tprepareSpareVectorKnnChild();\n\t} catch (error) {',
    'KNN child spawn',
  );
  return out;
}

// 5. Hybrid rescoring for multi-term queries. Two defects made mixed Chinese/English,
//    many-keyword queries return semantic neighbours instead of the page that holds
//    the words (V's acceptance 2026-10-02):
//    - a keyword hit outside the vector top-k entered the merge with vectorScore 0, so
//      at 0.7 vector / 0.3 text it could never beat a vector-only hit;
//    - its keyword score was the saturated fallback score (about 1.0 for nearly every
//      hit), so matching all six query words ranked the same as matching one.
//    Before merging, keyword hits get their real cosine score from the stored vector
//    (one point lookup each on the connection that already has sqlite-vec loaded), and
//    the keyword score becomes the share of query terms present in the chunk text and
//    path. Single-term queries keep the upstream scoring, and only keyword hits holding at
//    least half of the terms are backfilled, so a hit on one common word cannot crowd in.
//    Upstream 2026.9.6 still scores keyword-only hits with vectorScore 0.
export function patchHybridRescoring(source) {
  let out = replaceExactlyOnce(
    source,
    '\tmergeHybridResults(params) {\n\t\treturn mergeHybridResults({\n\t\t\tvector: params.vector.map((r) => ({',
    '\tmergeHybridResults(params) {\n' +
      '\t\tparams = rescoreHybridCandidates(this.db, params, this.vector.available === true);\n' +
      '\t\treturn mergeHybridResults({\n\t\t\tvector: params.vector.map((r) => ({',
    'manager hybrid merge',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\tmerged: await this.mergeHybridResults({\n\t\t\t\t\tquery: cleaned,\n\t\t\t\t\tvector: vectorResults,\n\t\t\t\t\tkeyword: keywordResults,',
    '\t\t\t\tmerged: await this.mergeHybridResults({\n\t\t\t\t\tquery: cleaned,\n\t\t\t\t\tqueryVec,\n\t\t\t\t\tvector: vectorResults,\n\t\t\t\t\tkeyword: keywordResults,',
    'hybrid merge call',
  );
  out = replaceExactlyOnce(
    out,
    'const VECTOR_TABLE = MEMORY_INDEX_VECTOR_TABLE;\n',
    'const VECTOR_TABLE = MEMORY_INDEX_VECTOR_TABLE;\n' +
      '// Put every hybrid candidate on the same two scales before merging: keyword score =\n' +
      '// share of query terms in the chunk (text and path), vector score = cosine to the\n' +
      '// stored vector, also for keyword hits that missed the vector top-k.\n' +
      'function rescoreHybridCandidates(db, params, vectorAvailable) {\n' +
      '\tif (!params.keyword?.length) return params;\n' +
      '\tconst terms = [...new Set((params.query.toLowerCase().match(/[\\p{L}\\p{N}_]+/gu) ?? []).filter((term) => Array.from(term).length >= 2))];\n' +
      '\tif (terms.length < 2) return params;\n' +
      '\tlet readText;\n' +
      '\ttry {\n\t\treadText = db.prepare("SELECT text FROM memory_index_chunks WHERE id = ?");\n\t} catch {\n\t\treturn params;\n\t}\n' +
      '\tconst keyword = params.keyword.map((hit) => {\n' +
      '\t\tconst text = `${hit.path}\\n${readText.get(hit.id)?.text ?? hit.snippet ?? ""}`.toLowerCase();\n' +
      '\t\tconst coverage = terms.filter((term) => text.includes(term)).length / terms.length;\n' +
      '\t\treturn Object.assign({}, hit, { textScore: coverage, score: coverage });\n' +
      '\t});\n' +
      '\tlet vector = params.vector;\n' +
      '\tif (vectorAvailable && params.queryVec?.length) try {\n' +
      '\t\tconst seen = new Set(vector.map((hit) => hit.id));\n' +
      '\t\tconst lookup = db.prepare(`SELECT vec_distance_cosine(embedding, ?) AS dist FROM ${VECTOR_TABLE} WHERE id = ?`);\n' +
      '\t\tconst queryBlob = vectorToBlob(params.queryVec);\n' +
      '\t\tconst backfilled = [];\n' +
      '\t\tfor (const hit of keyword) {\n' +
      '\t\t\tif (seen.has(hit.id) || hit.textScore < .5) continue;\n' +
      '\t\t\tseen.add(hit.id);\n' +
      '\t\t\tconst dist = lookup.get(queryBlob, hit.id)?.dist;\n' +
      '\t\t\tif (typeof dist === "number" && Number.isFinite(dist)) backfilled.push(Object.assign({}, hit, { score: 1 - dist }));\n' +
      '\t\t}\n' +
      '\t\tvector = vector.concat(backfilled);\n' +
      '\t} catch {}\n' +
      '\treturn Object.assign({}, params, { vector, keyword });\n' +
      '}\n',
    'manager vector table constant',
  );
  // The keyword stage keeps only its top candidates. Its fallback score was
  // min(1, bm25 + boosts) and the single-term bm25 alone is ~0.87, so nearly every
  // hit tied at 1.0 and the cut fell by path order. Rank by query-term coverage first.
  out = replaceExactlyOnce(
    out,
    'function scoreFallbackKeywordResult(params) {\n\tconst queryTokens = uniqueStrings(normalizeSearchTokens(params.query));',
    'function scoreFallbackKeywordResult(params) {\n' +
      '\tconst coverageTerms = [...new Set((params.query.toLowerCase().match(/[\\p{L}\\p{N}_]+/gu) ?? []).filter((term) => Array.from(term).length >= 2))];\n' +
      '\tif (coverageTerms.length > 1) {\n' +
      '\t\tconst haystack = `${params.path}\\n${params.text}`.toLowerCase();\n' +
      '\t\treturn .75 * (coverageTerms.filter((term) => haystack.includes(term)).length / coverageTerms.length) + .25 * Math.max(0, Math.min(1, params.ftsScore));\n' +
      '\t}\n' +
      '\tconst queryTokens = uniqueStrings(normalizeSearchTokens(params.query));',
    'fallback keyword score',
  );
  // Candidate generation: when the all-terms query finds too little, the fallback
  // searched each term alone and kept each term's own top hits, so a chunk holding
  // several of the words was rarely among them. Add one OR query over the terms the
  // trigram index can match (3+ characters); BM25 over OR ranks chunks that hold more
  // of the words first. The coverage score above then orders the merged candidates.
  out = replaceExactlyOnce(
    out,
    '\tasync searchKeywordWithFallback(query, limit, options, sourceFilterList) {',
    '\tasync searchKeywordAnyTerm(query, limit, sourceFilterList) {\n' +
      '\t\tif (!this.fts.enabled || !this.fts.available) return [];\n' +
      '\t\tconst terms = [...new Set((query.match(/[\\p{L}\\p{N}_]+/gu) ?? []).filter((term) => Array.from(term).length >= 3))];\n' +
      '\t\tif (terms.length < 2) return [];\n' +
      '\t\tconst results = await searchKeyword({\n' +
      '\t\t\tdb: this.db,\n\t\t\tftsTable: FTS_TABLE$1,\n\t\t\tquery: terms.join(" "),\n\t\t\tftsTokenizer: "unicode61",\n\t\t\tlimit,\n' +
      '\t\t\tsnippetMaxChars: SNIPPET_MAX_CHARS$1,\n\t\t\tsourceFilter: this.buildSourceFilter(void 0, sourceFilterList),\n' +
      '\t\t\tbuildFtsQuery: () => terms.map((term) => `"${term.replaceAll("\\"", "")}"`).join(" OR "),\n' +
      '\t\t\tbm25RankToScore,\n\t\t\tboostFallbackRanking: true,\n\t\t\trankingQuery: query\n\t\t});\n' +
      '\t\treturn this.attachRecallMetadata(results.map((entry) => Object.assign(entry, {\n' +
      '\t\t\texactPathSpecificity: resolveExactPathSpecificity(query, entry.path),\n\t\t\tpathScore: 0\n\t\t})));\n' +
      '\t}\n' +
      '\tasync searchKeywordWithFallback(query, limit, options, sourceFilterList) {',
    'keyword fallback method',
  );
  out = replaceExactlyOnce(
    out,
    '\t\treturn this.limitKeywordSearchHits(this.mergeKeywordSearchHits([fullQueryResults, ...resultSets], query), limit);',
    '\t\tconst anyTermResults = await this.searchKeywordAnyTerm(query, limit, sourceFilterList).catch(() => []);\n' +
      '\t\treturn this.limitKeywordSearchHits(this.mergeKeywordSearchHits([fullQueryResults, ...resultSets, anyTermResults], query), limit);',
    'keyword fallback merge',
  );
  return out;
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
