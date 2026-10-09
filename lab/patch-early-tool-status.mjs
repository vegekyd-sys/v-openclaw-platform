import assert from 'node:assert/strict';

// Tool status line as soon as the model starts a tool call, not when the tool starts running.
//
// V 2026-10-08 (firsttext-e2e + Worker firsttext-metrics, 161 replies whose 首字 was a tool status
// line): the model's first toolcall_start reached the Feishu card start (= Gateway onToolStart)
// P50 0.96 s, P75 1.67, P90 4.33, P95 6.95, P99 11.7 s later (10/07: P90 3.8, P95 4.8 s). In
// between, the model is still streaming the tool's arguments (a file write or long command can
// take seconds) and the tool is prepared; only then does tool_execution_start fire and the
// status line ("正在 …") get pushed.
//
// The status line only needs the tool name, which the stream carries with toolcall_start. So the
// embedded agent now reports a tool "input_start" event (name + toolCallId, no args) the first
// time a tool call appears in the stream, through the run's own agent-event callback only (not
// the process-wide bus), and the Gateway reply runner treats it like a tool start for the
// channel's onToolStart. The real tool start follows as before and refreshes the same line (now
// with args where the channel shows them). Nothing the model sees or the tool does changes.
// OPENCLAW_EARLY_TOOL_STATUS=0 turns it off (checked on both sides).

export const MARKER = 'v-early-tool-status-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchBuiltinOpenclaw(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `	const eventAssistantMessage = assistantRecord?.partial && typeof assistantRecord.partial === "object" ? assistantRecord.partial : msg;
	const isResponsesTextEvent =`,
    `	// ${MARKER}: report the tool name as soon as the call appears in the stream
	if ((evtType === "toolcall_start" || evtType === "toolcall_delta") && ctx.params.onAgentEvent && process.env.OPENCLAW_EARLY_TOOL_STATUS !== "0") {
		const block = readToolCallBlock(assistantRecord);
		const toolCallId = typeof block?.id === "string" ? block.id : "";
		const rawName = typeof block?.name === "string" ? block.name : "";
		const seen = ctx.state.vEarlyToolCallIds ??= new Set();
		if (toolCallId && rawName && !seen.has(toolCallId)) {
			seen.add(toolCallId);
			const data = {
				phase: "input_start",
				name: normalizeToolPolicyName(rawName),
				toolCallId
			};
			runBestEffortCallback({
				label: "early tool status agent event",
				log: ctx.log,
				callback: () => ctx.params.onAgentEvent?.({
					stream: "tool",
					data
				})
			});
		}
	}
	const eventAssistantMessage = assistantRecord?.partial && typeof assistantRecord.partial === "object" ? assistantRecord.partial : msg;
	const isResponsesTextEvent =`,
    'handleMessageUpdate assistant message line');
}

export function patchAgentRunner(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `			if (phase === "start" || phase === "update") {
				const toolStartProgressPromise = params.turn.opts?.onToolStart?.({
					itemId: readStringValue(evt.data.itemId),
					toolCallId: readStringValue(evt.data.toolCallId),
					name,
					phase,`,
    `			// ${MARKER}: a tool call the model has only started streaming shows the same status line
			const vEarlyToolStart = phase === "input_start" && Boolean(name) && process.env.OPENCLAW_EARLY_TOOL_STATUS !== "0";
			if (phase === "start" || phase === "update" || vEarlyToolStart) {
				const toolStartProgressPromise = params.turn.opts?.onToolStart?.({
					itemId: readStringValue(evt.data.itemId),
					toolCallId: readStringValue(evt.data.toolCallId),
					name,
					phase: vEarlyToolStart ? "start" : phase,`,
    'reply runner tool start progress');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [kind, input, output] = process.argv.slice(2);
  assert(['builtin', 'agent-runner'].includes(kind) && input && output, 'usage: patch-early-tool-status.mjs builtin|agent-runner <in> <out>');
  const patch = kind === 'builtin' ? patchBuiltinOpenclaw : patchAgentRunner;
  fs.writeFileSync(output, patch(fs.readFileSync(input, 'utf8')));
}
