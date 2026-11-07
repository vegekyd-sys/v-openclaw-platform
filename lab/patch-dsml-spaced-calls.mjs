import assert from 'node:assert/strict';

// DeepSeek tool calls written as spaced DSML text reach the user instead of running (V, 2026-10-30 .. 11-06).
//
// 14 deepseek-flash replies in 14 days (7 Feishu conversations and one cron) ended with stopReason=stop and
// a visible body like
//   <｜｜DSML｜｜ calls>
//   <｜｜DSML｜｜ invoke name="exec">
//   <｜｜DSML｜｜ parameter name="command" string="true">cd /home/openclaw/... </｜｜DSML｜｜ parameter>
//   </｜｜DSML｜｜ invoke></｜｜DSML｜｜ calls>
// The tool never ran and the user read the markup. 9.1's DSML grammar knows the doubled full-width bar
// but not the space after it, and not the "calls" wrapper, so neither the tool-call recoverer nor the
// visible-text filter matched (every tag seen on V: <｜｜DSML｜｜ calls|invoke|parameter> and the matching
// closers, always with the space).
//
// dsml-spaced-calls-v1 back-ports upstream 910a2c1b308 (#169728, "recover calls markup instead of leaking
// tool payloads", 2026-10-12) to V's bundled @openclaw/ai:
//   - every marker also exists with the separator space; "calls" joins tool_calls/tool_call/function_calls;
//   - the recoverer and the visible-text filter share one list of tool wrappers (the filter keeps
//     tool_use_error on top);
//   - direct provider calls (no tool recovery there) still hide DSML text instead of showing it.
// Closing tags are derived from the matched opening tag, so a spaced opener only closes on a spaced closer.
//
// dsml-prefaced-calls-v1 (V only, beyond upstream): DeepSeek's DSML call always comes with finish_reason
// "stop", and finalizeOpenAICompletionsToolCalls promotes stop -> toolUse only when no visible text exists,
// so any preface sentence ("我先检查一下刚才伟诺入表失败的原因。") made the call disappear: 6 of the 14 leaks.
// When every tool call came from a closed DSML block and nothing visible follows the last one, the turn is a
// tool turn and the preface stays as text. Native tool calls keep the upstream rule.
// Source: openclaw-versa versa/port-dsml-spaced-calls-20261107 (efb1a6c2748 cherry-pick, 47f392f4aa1 V).

export const MARKER = 'dsml-spaced-calls-v1';
export const PREFACE_MARKER = 'dsml-prefaced-calls-v1';

export function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// node_modules/@openclaw/ai/dist/openai-completions-stream-DZjwK8vp.mjs
export function patchCompletionsStream(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `const DEEPSEEK_DSML_MARKERS = [
	"|",
	"｜",
	"｜｜"
].map((bar) => \`\${bar}DSML\${bar}\`);
`,
    `// ${MARKER}: upstream 910a2c1b308 (#169728) — the separator-space forms and the "calls" wrapper
const DEEPSEEK_DSML_MARKERS = [
	"|",
	"｜",
	"｜｜"
].flatMap((bar) => [\`\${bar}DSML\${bar}\`, \`\${bar}DSML\${bar} \`]);
const DEEPSEEK_DSML_SHARED_TOOL_OPEN_TOKENS = DEEPSEEK_DSML_MARKERS.flatMap((marker) => [
	"calls",
	"tool_calls",
	"tool_call",
	"function_calls"
].map((kind) => \`<\${marker}\${kind}>\`));
`,
    'DSML markers');
  out = replaceExactlyOnce(out,
    `const DSML_OPEN_TOKENS = DEEPSEEK_DSML_MARKERS.flatMap((marker) => DSML_KINDS.map((kind) => \`<\${marker}\${kind}>\`));\n`,
    `const DSML_OPEN_TOKENS = [...DEEPSEEK_DSML_SHARED_TOOL_OPEN_TOKENS, ...DEEPSEEK_DSML_MARKERS.map((marker) => \`<\${marker}tool_use_error>\`)]; // ${MARKER}\n`,
    'text filter open tokens');
  out = replaceExactlyOnce(out,
    `const DEEPSEEK_DSML_TOOL_OPEN_TOKENS = DEEPSEEK_DSML_MARKERS.flatMap((marker) => DEEPSEEK_DSML_TOOL_KINDS.map((kind) => \`<\${marker}\${kind}>\`));\n`,
    `const DEEPSEEK_DSML_TOOL_OPEN_TOKENS = DEEPSEEK_DSML_SHARED_TOOL_OPEN_TOKENS; // ${MARKER}\n`,
    'recoverer open tokens');
  out = replaceExactlyOnce(out,
    `	const shouldFilterDeepSeekDsmlText = !directMode && compat.thinkingFormat === "deepseek";
	const deepSeekTextFilter = shouldFilterDeepSeekDsmlText ? createDeepSeekTextFilter() : null;
	const deepSeekToolCallRecoverer = shouldFilterDeepSeekDsmlText ? createDsmlRecoverer() : null;\n`,
    `	// ${MARKER}: direct calls hide DSML text too, but never recover tools from it
	const shouldFilterDeepSeekDsmlText = compat.thinkingFormat === "deepseek";
	const deepSeekTextFilter = shouldFilterDeepSeekDsmlText ? createDeepSeekTextFilter() : null;
	const deepSeekToolCallRecoverer = !directMode && shouldFilterDeepSeekDsmlText ? createDsmlRecoverer() : null;\n`,
    'stream filter wiring');
  out = replaceExactlyOnce(out,
    `	const appendRecoveredToolCall = (toolCall) => {\n`,
    `	// ${PREFACE_MARKER}: DSML calls recovered from text, which always arrive with finish_reason "stop"
	const recoveredDsmlToolCalls = new WeakSet();
	const appendRecoveredToolCall = (toolCall) => {\n`,
    'recovered tool call registry');
  out = replaceExactlyOnce(out,
    `		toolArgumentPreviewSchedules.set(block, createToolArgumentPreviewSchedule());
		currentBlock = block;
		output.content.push(block);
		toolCallBlockIndices.set(block, output.content.length - 1);
		pushStreamEvent({
			type: "toolcall_start",
			contentIndex: toolCallBlockIndices.get(block) ?? -1,
			partial: output
		});\n`,
    `		toolArgumentPreviewSchedules.set(block, createToolArgumentPreviewSchedule());
		recoveredDsmlToolCalls.add(block); // ${PREFACE_MARKER}
		currentBlock = block;
		output.content.push(block);
		toolCallBlockIndices.set(block, output.content.length - 1);
		pushStreamEvent({
			type: "toolcall_start",
			contentIndex: toolCallBlockIndices.get(block) ?? -1,
			partial: output
		});\n`,
    'recovered tool call append');
  out = replaceExactlyOnce(out,
    `	flushPendingPostToolCallDeltas();
	finalizeOpenAICompletionsToolCalls(output, {\n`,
    `	flushPendingPostToolCallDeltas();
	// ${PREFACE_MARKER}: a closed DSML call after a preface sentence is a tool turn
	if (output.stopReason === "stop" && finishReason === "stop") {
		const lastToolCallIndex = output.content.findLastIndex((block) => block.type === "toolCall");
		if (lastToolCallIndex >= 0 && output.content.every((block) => block.type !== "toolCall" || recoveredDsmlToolCalls.has(block)) && !output.content.slice(lastToolCallIndex + 1).some((block) => block.type === "text" && block.text.trim().length > 0)) output.stopReason = "toolUse";
	}
	finalizeOpenAICompletionsToolCalls(output, {\n`,
    'tool call finalization');
  return out;
}

// base = directory in V's runtime layout; target = release layout.
export const FILES = [
  {
    name: 'openai-completions-stream-DZjwK8vp.mjs',
    base: 'core/node_modules/@openclaw/ai/dist',
    target: 'openclaw/node_modules/@openclaw/ai/dist',
    before: '9808e03ccb3d6a0967053e983c2a41a46c9fcec17023e541712ac6b363ca7aec',
    patch: patchCompletionsStream,
  },
];
