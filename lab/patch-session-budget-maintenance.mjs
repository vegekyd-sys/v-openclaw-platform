import assert from 'node:assert/strict';

// Session maintenance in a Worker must use the context budget the turn ran with (V 2026-11-03).
//
// After #543 gave gpt-6-luna an 850k budget, shared VLab still compacted a luna session right after a
// 222k-token turn (reason auto-threshold, 225,773 -> 40,524). The turn itself ran with 850k; the
// maintenance that follows it does not ask the turn. runSessionCompactionIfNeeded (pre-turn and
// post-turn compaction) and runMemoryFlushIfNeeded size their thresholds with
// resolveMemoryFlushContextWindowTokens -> resolveContextTokensForModel, which reads only config rows
// and the model-catalog cache. Workers never load that cache (only the Gateway prewarms it after
// ready), so a model without a config row resolves to the 200,000 default inside a Worker: threshold
// 180,000 (candidate, debug log: "preflightCompaction check ... contextWindow=200000 threshold=180000",
// then "triggered ... tokenCount=225000"). Every vlab-worker model without a config row is affected;
// DeepSeek is not because it has one.
//
// The session entry already records the budget the turn ran with (contextTokens, 850000 for that luna
// session). session-budget-maintenance-v1 uses it when the entry's model is the model being maintained,
// and otherwise falls back to the existing lookup and default.

export const MARKER = 'session-budget-maintenance-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/agent-runner-memory-7VF-zwNt.js
export function patchAgentRunnerMemory(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `function resolveMemoryFlushContextWindowTokens(params) {
	return resolveContextTokensForModel({`,
    `// ${MARKER}: the budget the session's last turn ran with, when it is for the model being maintained.
function resolveSessionRunContextTokens(params) {
	const entry = params.sessionEntry;
	const tokens = entry?.contextTokens;
	if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) return;
	const entryModel = typeof entry.model === "string" ? entry.model.trim().toLowerCase() : "";
	const modelId = typeof params.modelId === "string" ? params.modelId.trim().toLowerCase() : "";
	if (!entryModel || !modelId || (entryModel !== modelId && !modelId.endsWith(\`/\${entryModel}\`))) return;
	const entryProvider = typeof entry.modelProvider === "string" ? entry.modelProvider.trim() : "";
	if (entryProvider && params.provider && normalizeProviderId(entryProvider) !== normalizeProviderId(params.provider)) return;
	return Math.floor(tokens);
}
function resolveMemoryFlushContextWindowTokens(params) {
	const sessionRunContextTokens = resolveSessionRunContextTokens(params);
	if (sessionRunContextTokens !== void 0) return sessionRunContextTokens;
	return resolveContextTokensForModel({`,
    'resolveMemoryFlushContextWindowTokens');
  const call = (entryExpr) => `({
		cfg: params.cfg,
		provider: resolveContextConfigProviderForRuntime({
			provider: params.followupRun.run.provider,
			runtimeId,
			config: params.cfg
		}),
		modelId: params.followupRun.run.model ?? params.defaultModel${entryExpr}
	});`;
  out = replaceExactlyOnce(out,
    `	const compactionStore = params.sessionStore ?? { [compactionSessionKey]: entry };
	const contextWindowTokens = resolveMemoryFlushContextWindowTokens${call('')}`,
    `	const compactionStore = params.sessionStore ?? { [compactionSessionKey]: entry };
	const contextWindowTokens = resolveMemoryFlushContextWindowTokens${call(',\n\t\tsessionEntry: entry')}`,
    'compaction context window');
  out = replaceExactlyOnce(out,
    `	const recordFailure = (error) => recordMemoryFlushFailure(error, params, activeSessionEntry);
	const contextWindowTokens = resolveMemoryFlushContextWindowTokens${call('')}`,
    `	const recordFailure = (error) => recordMemoryFlushFailure(error, params, activeSessionEntry);
	const contextWindowTokens = resolveMemoryFlushContextWindowTokens${call(',\n\t\tsessionEntry: activeSessionEntry')}`,
    'memory flush context window');
  return out;
}

export const FILES = [
  { name: 'agent-runner-memory-7VF-zwNt.js', base: 'core/dist', target: 'openclaw/dist', before: 'befc094d3c6183b8275c1550cc91ccd333dfdd8a989ad9121be95d6c914746f2', patch: patchAgentRunnerMemory },
];
