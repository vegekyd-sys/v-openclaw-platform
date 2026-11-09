import assert from 'node:assert/strict';

// Client compaction must not resize history images on the event loop (V 2026-11-09).
//
// 14:00:48 CST a skill-workshop review (deepseek-flash, run inside the Gateway because its
// foreground was a /vds Codex turn) overflowed on a 3,530-message transcript. Overflow
// auto-compaction calls sanitizeSessionHistory over the whole transcript; that resizes every image
// above imageMaxDimensionPx (1200) with Rastermill's in-process Photon (WASM, synchronous): 208
// "Image resized to fit limits" lines 14:00:49-14:01:39, then "liveness heartbeat delayed:
// overdue=41214ms", DingTalk reconnect, and only then the gpt-5.6-sol summary request.
//
// Nothing that receives those resized bytes needs them when the client summarizer runs:
// - AgentSession compaction prepares from sessionManager.getBranch() (persisted entries, original
//   bytes), and serializeConversation replaces images with "[image data omitted from summary input]";
// - token estimates count image blocks, not bytes;
// - the session context is rebuilt from entries after compaction, and the retried attempt sanitizes
//   (and, for the last turns, resizes) again on its own path (#355).
// Only provider-owned compaction (OpenAI Responses compact endpoint) sends session.messages, which
// are the sanitized ones; attemptServerEndpointCompaction already refuses overflow, custom
// instructions and models without the endpoint. compaction-image-resize-skip-v1 skips resizing (but
// keeps validation) exactly when that refusal applies. OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP=0
// restores resizing.
//
// Source: openclaw-versa versa/port-compaction-image-skip-20261109 @ 9491dac5cd0.

export const MARKER = 'compaction-image-resize-skip-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/history-image-prune-Dg0CDQ4a.js
export function patchHistoryImagePrune(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `		keepImageBytesBeforeIndex: params.skipPrunedImageResize === true && process.env.OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP !== "0" ? resolveImageResizeSkipBeforeIndex(normalizedAssistantReplay) : -1,`,
    `		// ${MARKER}: client compaction never sends these image bytes, so validate them only.
		keepImageBytesBeforeIndex: params.skipImageResize === true && process.env.OPENCLAW_COMPACTION_IMAGE_RESIZE_SKIP !== "0" ? normalizedAssistantReplay.length : params.skipPrunedImageResize === true && process.env.OPENCLAW_HISTORY_IMAGE_RESIZE_SKIP !== "0" ? resolveImageResizeSkipBeforeIndex(normalizedAssistantReplay) : -1,`,
    'sanitizeSessionHistory image resize option');
}

// core/dist/compact-gStBcHDe.js
export function patchCompact(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `async function attemptServerEndpointCompaction(params) {
	if (params.trigger === "overflow" || params.customInstructions?.trim() || !resolveOpenAIResponsesCompactEndpointPlan(params.model, params.extraParams).enabled) return;`,
    `// ${MARKER}: when provider-owned compaction cannot run, the client summarizer handles the request.
function serverEndpointCompactionMayRun(params) {
	return !(params.trigger === "overflow" || params.customInstructions?.trim() || !resolveOpenAIResponsesCompactEndpointPlan(params.model, params.extraParams).enabled);
}
async function attemptServerEndpointCompaction(params) {
	if (!serverEndpointCompactionMayRun(params)) return;`,
    'attemptServerEndpointCompaction guard');
  out = replaceExactlyOnce(out,
    `						sessionId: params.sessionId,
						policy: transcriptPolicy,
						preserveLatestAssistantThinking: false
					});
					const dedupedValidated = dedupeDuplicateUserMessagesForCompaction(`,
    `						sessionId: params.sessionId,
						policy: transcriptPolicy,
						preserveLatestAssistantThinking: false,
						// ${MARKER}: the client summarizer reads persisted entries and drops image bytes.
						skipImageResize: !serverEndpointCompactionMayRun({
							trigger,
							model: effectiveModel,
							extraParams: effectiveExtraParams,
							customInstructions: params.customInstructions
						})
					});
					const dedupedValidated = dedupeDuplicateUserMessagesForCompaction(`,
    'compaction sanitizeSessionHistory call');
  return out;
}

export const FILES = [
  { name: 'history-image-prune-Dg0CDQ4a.js', base: 'core/dist', target: 'openclaw/dist', before: '3e5c9c8b90e78d85c0360cf64bba4f9add36dbdabb7eceaf96a5eefe084bdd36', patch: patchHistoryImagePrune },
  { name: 'compact-gStBcHDe.js', base: 'core/dist', target: 'openclaw/dist', before: '54be690135a3b02b256da3761f5c96d20ee1390da5e2e2cd03ce0c53cadc0e4f', patch: patchCompact },
];
