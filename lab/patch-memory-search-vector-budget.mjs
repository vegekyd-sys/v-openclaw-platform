import assert from 'node:assert/strict';

// memory_search must answer even when the vector table is cold (V, 2026-10-20).
//
// The vector stage brute-forces the sqlite-vec table (743 MB in 56,061 runs on V). When
// the page cache is tight it is evicted between searches and a cold scan takes 23-45 s,
// so the whole tool hits its fixed 25 s deadline, returns "memory_search timed out" with
// no results, and then refuses every memory_search of the agent for 60 s. 17:51, 18:14
// and 18:51 that evening all ended that way.
//
// Give the two semantic stages (query embedding, vector KNN) a budget each (8 s). Past
// it, abort the stage (the KNN child is killed through its signal) and answer from the
// keyword (FTS) results already in hand, through the same keyword-only ranking the
// manager uses when no embedding provider is available. The result says
// degraded: "vector-timeout" / "embedding-timeout". It is a normal answer, so the
// tool's failure cooldown is not armed. Searches whose stages finish within budget take
// exactly the old path; their results are unchanged.

const MARK = 'v-memory-search-stage-budget-20261020';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const STAGE_BUDGET_HELPER = `// ${MARK}: the embedding and vector stages each get a budget; past it the search
// answers from its keyword results instead of running into the tool's 25 s deadline.
const MEMORY_SEARCH_STAGE_BUDGET_MS = (() => {
	const configured = Number(process.env.OPENCLAW_MEMORY_SEARCH_STAGE_BUDGET_MS);
	return Number.isFinite(configured) && configured > 0 ? configured : 8e3;
})();
const memorySearchStageExpired = Symbol("memory-search-stage-expired");
async function runMemorySearchStageWithBudget(signal, run) {
	const controller = new AbortController();
	const onAbort = () => controller.abort(signal.reason);
	if (signal?.aborted) controller.abort(signal.reason);
	else signal?.addEventListener("abort", onAbort, { once: true });
	let timer;
	const expired = new Promise((resolve) => {
		timer = setTimeout(() => {
			resolve(memorySearchStageExpired);
			controller.abort(new Error(\`memory search stage exceeded \${MEMORY_SEARCH_STAGE_BUDGET_MS}ms\`));
		}, MEMORY_SEARCH_STAGE_BUDGET_MS);
		timer.unref?.();
	});
	const task = Promise.resolve().then(() => run(controller.signal));
	task.catch(() => {});
	try {
		return await Promise.race([task, expired]);
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}
`;

export function patchManagerStageBudget(source) {
  assert.ok(!source.includes(MARK), 'manager already carries the stage budget');
  let out = replaceExactlyOnce(
    source,
    'const FTS_TABLE = MEMORY_INDEX_FTS_TABLE;\nconst log$1 = createSubsystemLogger("memory");\n',
    'const FTS_TABLE = MEMORY_INDEX_FTS_TABLE;\nconst log$1 = createSubsystemLogger("memory");\n' + STAGE_BUDGET_HELPER,
    'search orchestration logger',
  );
  // Embedding: start it under its own budget, exactly where it started before.
  out = replaceExactlyOnce(
    out,
    '\t\t\t\tconst pendingQueryVec = opts?.lexicalOnly ? void 0 : this.embedQueryWithRetry(cleaned, opts?.signal, semanticProvider, false, semanticProviderRuntime);\n',
    '\t\t\t\tconst pendingQueryVec = opts?.lexicalOnly ? void 0 : runMemorySearchStageWithBudget(opts?.signal, (stageSignal) => this.embedQueryWithRetry(cleaned, stageSignal, semanticProvider, false, semanticProviderRuntime));\n',
    'query embedding start',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\ttry {\n\t\t\t\t\tqueryVec = await pendingQueryVec;\n\t\t\t\t} catch (err) {\n',
    '\t\t\t\ttry {\n\t\t\t\t\tqueryVec = await pendingQueryVec;\n' +
      '\t\t\t\t\tif (queryVec === memorySearchStageExpired) return await this.finalizeStageBudgetKeywordResults("embedding-timeout", keywordResults, hybrid, maxResults, minScore, opts);\n' +
      '\t\t\t\t} catch (err) {\n',
    'query embedding await',
  );
  // Vector KNN: same call and error handling, raced against its budget.
  out = replaceExactlyOnce(
    out,
    '\t\t\tconst vectorResults = queryVec.some((v) => v !== 0) ? await this.searchVector(queryVec, candidates, sourceFilterList, vectorProviderIdentity, opts?.signal).catch((err) => {\n' +
      '\t\t\t\topts?.signal?.throwIfAborted();\n' +
      '\t\t\t\tlog$1.warn(`memory search: vector query failed: ${formatErrorMessage(err)}`);\n' +
      '\t\t\t\treturn [];\n' +
      '\t\t\t}) : [];\n',
    '\t\t\tconst vectorResults = queryVec.some((v) => v !== 0) ? await runMemorySearchStageWithBudget(opts?.signal, (stageSignal) => this.searchVector(queryVec, candidates, sourceFilterList, vectorProviderIdentity, stageSignal).catch((err) => {\n' +
      '\t\t\t\topts?.signal?.throwIfAborted();\n' +
      '\t\t\t\tif (stageSignal.aborted) return [];\n' +
      '\t\t\t\tlog$1.warn(`memory search: vector query failed: ${formatErrorMessage(err)}`);\n' +
      '\t\t\t\treturn [];\n' +
      '\t\t\t})) : [];\n' +
      '\t\t\tif (vectorResults === memorySearchStageExpired) return await this.finalizeStageBudgetKeywordResults("vector-timeout", keywordResults, hybrid, maxResults, minScore, opts);\n',
    'vector stage',
  );
  out = replaceExactlyOnce(
    out,
    '\thasIndexedContent() {\n\t\tif (this.db.prepare(`SELECT 1 as found FROM memory_index_chunks LIMIT 1`).get()?.found === 1) return true;',
    '\tasync finalizeStageBudgetKeywordResults(reason, keywordResults, hybrid, maxResults, minScore, opts) {\n' +
      '\t\topts?.signal?.throwIfAborted();\n' +
      '\t\tlog$1.warn(`memory search: ${reason} after ${MEMORY_SEARCH_STAGE_BUDGET_MS}ms; answering from ${keywordResults.length} keyword results`);\n' +
      '\t\topts?.onDebug?.({\n\t\t\tbackend: "builtin",\n\t\t\teffectiveMode: "keyword",\n\t\t\tdegraded: reason\n\t\t});\n' +
      '\t\treturn await this.finalizeKeywordOnlyResults({\n' +
      '\t\t\tresults: keywordResults,\n\t\t\ttemporalDecay: hybrid.temporalDecay,\n\t\t\tmaxResults,\n\t\t\tminScore,\n\t\t\tactiveProjectKeys: opts?.activeProjectKeys\n\t\t});\n' +
      '\t}\n' +
      '\thasIndexedContent() {\n\t\tif (this.db.prepare(`SELECT 1 as found FROM memory_index_chunks LIMIT 1`).get()?.found === 1) return true;',
    'hasIndexedContent',
  );
  return out;
}

// The tool reports the degradation next to the results and in debug.
export function patchToolDegradedField(source) {
  assert.ok(!source.includes(MARK), 'tools already report degraded searches');
  let out = replaceExactlyOnce(
    source,
    '\t\t\tembeddingBootstrap: runtimeDebug.findLast((entry) => entry.embeddingBootstrap)?.embeddingBootstrap,\n',
    '\t\t\tembeddingBootstrap: runtimeDebug.findLast((entry) => entry.embeddingBootstrap)?.embeddingBootstrap,\n' +
      `\t\t\t// ${MARK}: set when a semantic stage ran out of budget and keyword results answered.\n` +
      '\t\t\tdegraded: runtimeDebug.findLast((entry) => entry.degraded)?.degraded,\n',
    'search debug',
  );
  out = replaceExactlyOnce(
    out,
    '\t\t\t\t\t\t\tmode: memoryValue?.mode,\n\t\t\t\t\t\t\t...attempts.length > 0 ? metadata : {},\n',
    '\t\t\t\t\t\t\tmode: memoryValue?.mode,\n' +
      '\t\t\t\t\t\t\t...memoryValue?.debug?.degraded ? { degraded: memoryValue.debug.degraded } : {},\n' +
      '\t\t\t\t\t\t\t...attempts.length > 0 ? metadata : {},\n',
    'tool result mode',
  );
  return out;
}
