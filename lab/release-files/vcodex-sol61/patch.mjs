import assert from 'node:assert/strict';

const marker = 'v91-gpt61-sol-v1';
function insert(source, anchor, addition) {
  if (source.includes(marker)) return source;
  assert.equal(source.split(anchor).length, 2, `Unexpected runtime anchor: ${anchor}`);
  return source.replace(anchor, `${anchor}\n\t// ${marker}\n${addition}`);
}
export function patchContract(source) {
  if (source.includes(marker)) return source;
  source = insert(source, 'const OPENAI_DUAL_ROUTE_MODEL_IDS = [', '\t"gpt-6.1-sol",');
  const anchor = 'const OPENAI_CODEX_REASONING_EFFORTS_BY_MODEL = /* @__PURE__ */ new Map([';
  assert.equal(source.split(anchor).length, 2, 'Reasoning contract anchor drifted');
  source = source.replace(anchor, `${anchor}\n\t["gpt-6.1-sol", ["low", "medium", "high", "xhigh", "max"]],`);
  const merge = 'const supported = /* @__PURE__ */ new Set([...known, ...normalizedObserved]);';
  assert.equal(source.split(merge).length, 2, 'Reasoning merge anchor drifted');
  return source.replace(merge, 'const supported = /* @__PURE__ */ new Set([...known, ...normalizedObserved.filter((effort) => normalizeOpenAIRouteMembershipId(modelId) !== "gpt-6.1-sol" || known.includes(effort))]);');
}
export function patchSubscriptionProvider(source) {
  return insert(source, '\tconst synthBaseUrl = ctx.providerConfig?.baseUrl ?? OPENAI_CODEX_BASE_URL;', `\tif (lower === "gpt-6.1-sol") return normalizeModelCompat({
\t\tid: trimmedModelId, name: "GPT-6.1 Sol", provider: PROVIDER_ID,
\t\tapi: "openai-chatgpt-responses", baseUrl: synthBaseUrl,
\t\treasoning: true, input: ["text", "image"],
\t\tcontextWindow: 1050000, contextTokens: 272000, maxTokens: 128000,
\t\tcost: {input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5},
\t\tthinkingLevelMap: {off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"},
\t\tcompat: {supportsTemperature: false, supportsReasoningEffort: true,
\t\t\tsupportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"], codeMode: "preferred"}
\t});`);
}
