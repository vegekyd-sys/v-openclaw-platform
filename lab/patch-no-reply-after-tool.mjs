import assert from 'node:assert/strict';

// An explicit NO_REPLY after a tool call stays silent, as upstream 2026.9.5 does (#149642).
//
// V 2026-10-10 15:03, Feishu group oc_6a4e6bc8…: Tianyi wrote 「感谢大家支持」, V reacted
// THUMBSUP with the message tool and answered NO_REPLY. The 9.1 settled-turn check saw a tool
// batch with no final answer, asked the model twice for "the final user-visible answer" (it
// answered NO_REPLY both times), then sent SETTLED_TOOL_FINALIZATION_FALLBACK_TEXT ("The tool
// run finished, but no final summary was produced…") into the group. Same for any tool:
// the same group got it on 10/08 13:52 after an exec. Only the built-in runtime has this check
// (vlab-worker and in-Gateway alike); Codex and claude-cli turns are not affected.
//
// shouldTreatEmptyAssistantReplyAsSilent returns false before it looks at the reply whenever
// the turn does not allow empty replies, and V's group turns count as directed, so they never
// do. Upstream 1b4c1a10a78 lets an authored NO_REPLY through that gate; blank replies still get
// the continuation, and failed tools, async work and committed message sends keep their checks.
//
// v2: v1 (upstream's line alone) passed a CLI candidate but not a real Feishu group on shared VLab
// (10/10 16:47, om_x100b63abf490…): with block streaming on, the model's NO_REPLY never reaches
// attempt.assistantTexts, which is all the check reads; the transcript still holds the final
// assistant message with exactly NO_REPLY. "Authored NO_REPLY" now also means: the current
// attempt's final assistant message says exactly NO_REPLY and assistantTexts holds nothing else.

export const MARKER = 'v-no-reply-after-tool-v2';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchBuiltinOpenclaw(source) {
  assert(!source.includes(MARKER) && !source.includes('v-no-reply-after-tool-v1'), 'already patched');
  const explicit = replaceExactlyOnce(source,
    `	const explicitSilentReply = params.payloadCount === 0 && assistant?.stopReason !== "error" && hasOnlySilentAssistantReply(params.attempt.assistantTexts);
	const tolerateSideEffects = terminalReplyOptional || explicitSilentReply;`,
    `	// ${MARKER}: block streaming keeps NO_REPLY out of assistantTexts; the final message still says it
	const vAssistantSaysNoReply = Array.isArray(assistant?.content) && (() => {
		const text = assistant.content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("").trim();
		return text.length > 0 && isSilentReplyPayloadText(text, "NO_REPLY");
	})() && (params.attempt.assistantTexts ?? []).every((text) => text.trim().length === 0 || isSilentReplyPayloadText(text, "NO_REPLY"));
	const explicitSilentReply = params.payloadCount === 0 && assistant?.stopReason !== "error" && (hasOnlySilentAssistantReply(params.attempt.assistantTexts) || vAssistantSaysNoReply);
	const tolerateSideEffects = terminalReplyOptional || explicitSilentReply;`,
    'shouldTreatEmptyAssistantReplyAsSilent explicit silence');
  return replaceExactlyOnce(explicit,
    `	const tolerateSideEffects = terminalReplyOptional || explicitSilentReply;
	if (!params.allowEmptyAssistantReplyAsSilent || shouldSkipNonVisibleTurnRetry({`,
    `	const tolerateSideEffects = terminalReplyOptional || explicitSilentReply;
	// ${MARKER}: an authored NO_REPLY is silence even where empty replies are not allowed
	if (!params.allowEmptyAssistantReplyAsSilent && !explicitSilentReply || shouldSkipNonVisibleTurnRetry({`,
    'shouldTreatEmptyAssistantReplyAsSilent gate');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'usage: patch-no-reply-after-tool.mjs <builtin-openclaw in> <out>');
  fs.writeFileSync(output, patchBuiltinOpenclaw(fs.readFileSync(input, 'utf8')));
}
