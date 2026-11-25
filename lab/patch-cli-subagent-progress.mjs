import assert from 'node:assert/strict';

// A working Claude subagent counts as progress of its parent tool (V 2026-11-25).
//
// On /vcc (claude-cli through the Agent SDK) a foreground Agent tool runs a subagent inside the Claude
// process. V sets CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 (PR #74), so every Agent call is foreground and the
// turn waits on it. The subagent's records carry parent_tool_use_id; the stream parser keeps them out of the
// parent tool events and transcript, so the host sees nothing between "tool:Agent:started" and the result.
// The diagnostic heartbeat then classifies the session blocked_tool_call and, once the tool and the last
// progress are both 900 s old (BLOCKED_TOOL_CALL_ABORT_FLOOR_MS), aborts the turn: "This turn was interrupted
// because it stopped making progress", and closing the Claude process ends the subagents mid-work. On
// 2026-11-25 16:13-16:29 two such calls in oc_2ab0b5b3 made 86 and 49 Bash calls with records every minute
// and were aborted at age 927 s. A message arriving after 900 s would take the turn over the same way
// (reply operation no_activity: its lastActivityAtMs is refreshed by agent events only).
//
// cli-subagent-progress-v1 (source: vegekyd-sys/openclaw-versa versa/port-cli-subagent-progress-20261125):
// - the stream parser reports each Claude subagent record by its parent tool (onSubagentActivity);
// - while that parent tool is open in this run and the run is not aborted, the runner refreshes the
//   diagnostic run progress and the reply operation's activity, at most every 30 s.
// A subagent that stops streaming still ages out through the same recovery.

export const MARKER = 'cli-subagent-progress-v1';
export const INTERVAL_MS = 30_000;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchParser(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to cli-live-session-registry-Bux1JHPe.js`);
  return replaceExactlyOnce(source,
    '	const handleParsedRecord = (parsed) => {\n		if (parseErrorText) return;\n',
    `	const handleParsedRecord = (parsed) => {
		if (parseErrorText) return;
		// ${MARKER}: subagent records are the only evidence that a foreground Agent tool is still working.
		if (claudeStreamJson && isClaudeSubagentRecord(parsed)) {
			const parentToolCallId = typeof parsed.parent_tool_use_id === "string" ? parsed.parent_tool_use_id.trim() : "";
			if (parentToolCallId) params.onSubagentActivity?.({ parentToolCallId });
		}
`,
    'handleParsedRecord start');
}

export function patchRunner(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to execute.runtime-DRmvah87.js`);
  let out = replaceExactlyOnce(source,
    'import { h as BLOCKED_TOOL_CALL_ABORT_FLOOR_MS } from "./diagnostic-run-activity-DLw8ESkx.js";\n',
    'import { d as markDiagnosticRunProgress, h as BLOCKED_TOOL_CALL_ABORT_FLOOR_MS } from "./diagnostic-run-activity-DLw8ESkx.js";\n'
      + 'import { h as resolveActiveReplyOperationForSessionId } from "./reply-run-registry.registry-DWAbDPHN.js";\n',
    'diagnostic-run-activity import');
  out = replaceExactlyOnce(out,
    'function resolveCliToolSource(name, kind) {',
    `// ${MARKER}: a foreground Claude subagent streams its own records while the parent tool call stays open.
const CLI_SUBAGENT_PROGRESS_INTERVAL_MS = ${INTERVAL_MS};
function resolveCliToolSource(name, kind) {`,
    'resolveCliToolSource');
  out = replaceExactlyOnce(out,
    '	const emitCliThinkingProgress = ({ progressTokens }) => {\n',
    `	let lastSubagentProgressAt;
	// ${MARKER}: only records under a parent tool this run started and has not finished count.
	const emitCliSubagentActivity = ({ parentToolCallId }) => {
		const parentTool = activeParsedTools.get(parentToolCallId);
		if (!parentTool || runParams.abortSignal?.aborted) return;
		observedCliActivity = true;
		const now = Date.now();
		if (lastSubagentProgressAt !== void 0 && now - lastSubagentProgressAt < CLI_SUBAGENT_PROGRESS_INTERVAL_MS) return;
		lastSubagentProgressAt = now;
		markDiagnosticRunProgress({
			runId: runParams.runId,
			sessionId: runParams.sessionId,
			...runParams.sessionKey ? { sessionKey: runParams.sessionKey } : {},
			reason: \`tool:\${parentTool.toolName}:subagent_activity\`
		});
		resolveActiveReplyOperationForSessionId(runParams.sessionId)?.recordActivity();
	};
	const emitCliThinkingProgress = ({ progressTokens }) => {
`,
    'emitCliThinkingProgress');
  out = replaceExactlyOnce(out,
    '		emitCliThinkingProgress,\n		hasObservedCliActivity: () => observedCliActivity,\n',
    '		emitCliThinkingProgress,\n		emitCliSubagentActivity,\n		hasObservedCliActivity: () => observedCliActivity,\n',
    'event handlers return');
  return replaceExactlyOnce(out,
    '		onUsage: params.diagnostics?.observeUsage\n	}) : null;\n',
    '		onUsage: params.diagnostics?.observeUsage,\n		onSubagentActivity: params.events.emitCliSubagentActivity\n	}) : null;\n',
    'streaming parser options');
}

export const FILES = [
  { name: 'cli-live-session-registry-Bux1JHPe.js', base: 'lab/release-files/cli-subagent-progress-base', target: 'openclaw/dist', before: 'c296fab87b3fad58b39d5f97544f16581c11a4e94d629dcdb8c2b3de795f46d5', patch: patchParser },
  { name: 'execute.runtime-DRmvah87.js', base: 'lab/release-files/vcc-steer', target: 'openclaw/dist', before: '1c8902ac292d49a7e1d98d335972267c1b0bda5571582783084541bef5a5a836', patch: patchRunner },
];
