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
