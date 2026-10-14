// Adds the provider's token usage to the [firsttext-metrics] model-call-ended mark.
//
// On 10/13 three V sessions missed DeepSeek's prompt cache on almost every warm turn
// (provider-accepted -> first event 7-11 s instead of 0.5-1 s, about 520 s that day).
// Message counts can't tell a cache that never fills apart from a prompt prefix that
// changes each turn: 309fb1c7e2 hit and missed at the same 894-955 messages. Token counts
// can: input + cacheRead per call says how much of the prompt the provider reused. Reading
// them from V's session store is blocked for the Mac session, so the Worker logs them
// next to the other first-text marks (numbers only, no content).
function once(source, before, after, label) {
  if (source.split(before).length - 1 !== 1) throw new Error(`${label} anchor mismatch`);
  return source.replace(before, after);
}

export const USAGE_MARKS_MARKER = 'v-firsttext-usage-marks-v1';

const ENDED_BEFORE = ` firstTextMetric(observer.state,'model-call-ended',{failed:Boolean(failure)});`;
const ENDED_AFTER = ` firstTextMetric(observer.state,'model-call-ended',{failed:Boolean(failure),...firstTextUsageFields(observer.state)}); // ${USAGE_MARKS_MARKER}`;

const HELPER_ANCHOR = `function firstTextMetric(state, stage, extra = {}) {`;
const HELPER = `// ${USAGE_MARKS_MARKER}: token counts of the finished call, for prompt-cache analysis.
function firstTextUsageFields(state) {
  const out = {};
  for (const k of ['input', 'cacheRead', 'cacheWrite', 'output']) if (Number.isFinite(state.usage?.[k])) out[k] = state.usage[k];
  if (Number.isFinite(state.requestPayloadBytes)) out.requestBytes = state.requestPayloadBytes;
  return out;
}
${HELPER_ANCHOR}`;

export function patchModelDiagnosticEvents(source) {
  if (source.includes(USAGE_MARKS_MARKER)) throw new Error('already patched');
  let next = once(source, ENDED_BEFORE, ENDED_AFTER, 'model-call-ended mark');
  next = once(next, HELPER_ANCHOR, HELPER, 'firstTextMetric');
  return next;
}
