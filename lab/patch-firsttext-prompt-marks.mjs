// Adds [firsttext-metrics] stage marks to V's builtin chunk for the Worker window between the
// first stream event (worker-stream-send, sent when the attempt timeout is armed) and
// model-call-enter. On V that window costs 2.6-3.9 s on a Worker process's first turn and
// 0.15 s afterwards; existing prep/prompt observers do not cover it. Marks only; no
// control-flow change. OPENCLAW_FIRSTTEXT_PROMPT_MARKS=0 turns the marks off.
//
// Also: OPENCLAW_EMBEDDED_STAGE_SUMMARY_ALWAYS=1 prints every embedded-run stage summary
// (prep, startup, core-plugin-tools) at warn level instead of only above 2-10 s, and the
// core-plugin-tools tracker gets four sub-marks inside prepareEmbeddedAttemptToolBase.
function once(source, before, after, label) {
  if (source.split(before).length - 1 !== 1) throw new Error(`${label} anchor mismatch`);
  return source.replace(before, after);
}

export const PROMPT_MARKER = 'firsttext-prompt-marks-v1';

const HELPER = `// ${PROMPT_MARKER}: timing and identity only; observation never alters control flow.
const ocPromptMarkSeen = new Map();
function ocPromptMark(attempt, stage) {
	try {
		if (process.env.OPENCLAW_FIRSTTEXT_PROMPT_MARKS === "0") return;
		const runId = attempt?.runId;
		if (typeof runId !== "string" || runId.length === 0) return;
		let seen = ocPromptMarkSeen.get(runId);
		if (!seen) {
			if (ocPromptMarkSeen.size >= 256) ocPromptMarkSeen.delete(ocPromptMarkSeen.keys().next().value);
			seen = new Set();
			ocPromptMarkSeen.set(runId, seen);
		}
		if (seen.has(stage)) return;
		seen.add(stage);
		console.error("[firsttext-metrics] " + JSON.stringify({ runId, provider: attempt.provider, model: attempt.modelId, at: Date.now(), pid: process.pid, stage }));
	} catch {}
}
`;

// [anchor, stage, indent]: the mark goes on its own line right before the anchor.
export const PROMPT_MARKS = [
  // runEmbeddedAttemptExecutionPhase: attempt timeout armed (first stream event) -> settled phase.
  ['\tconst preparedStreamRuntime = {\n\t\tabortable: abortable$1,', 'pp:timeout-armed', '\t'],
  // runEmbeddedAttemptPromptPhase, step by step.
  ['\tconst promptStartedAt = Date.now();', 'pp:enter', '\t'],
  ['\tif (input.emptyExplicitToolAllowlistError) {', 'pp:assembly', '\t'],
  ['\t\tconst { hookMessagesForCurrentPrompt, promptForModel, systemPromptForHook } = promptContext;', 'pp:context', '\t\t'],
  ['\t\tif (beforeAgentRunOutcome) {', 'pp:before-agent-run', '\t\t'],
  ['\t\tconst imageResult = await prepareEmbeddedAttemptPromptExecution({', 'pp:api-key', '\t\t'],
  ['\t\tconst reserveTokens = input.getCompactionReserveTokens();', 'pp:execution', '\t\t'],
  ['\t\tconst { activeContextEngine, ...preflight } = input.preflight;', 'pp:observe', '\t\t'],
  ['\t\tif (!state.skipPromptSubmission) await submitEmbeddedAttemptPrompt({', 'pp:preflight', '\t\t'],
  // submitEmbeddedAttemptPrompt: transcript snapshot and prompt transforms installed.
  ['\tconst cleanupProviderPromptHistoryTransform = installProviderPromptHistoryTransform();', 'pp:submit-ready', '\t'],
  // promptActiveSession: entering AgentSession.prompt (compaction check, before_agent_start, agent loop).
  ['\t\t\treturn abortable$1(trackPromptSettlePromise(activeSession.prompt(prompt, options)));', 'pp:session-prompt', '\t\t\t'],
  // Provider prompt history transform: runs inside the stream function, just before the model call.
  ['\t\t\tconst providerPromptHistoryTruncation = truncateOversizedToolResultsInMessages(', 'pp:provider-transform', '\t\t\t'],
];

const TOOL_BASE_MARKS = [
  ['\tconst toolsAllowWithForcedRuntimeTools = inspectingCodeModeRecovery', 'tool-base:run-context'],
  ['\tif (isCodeModeDiagnosticEnabled()) logCodeModeDiagnostic(log$5, "activation", {', 'tool-base:surface-plan'],
  ['\tconst runtimeCapabilityProfile = resolveConversationCapabilityProfile({\n\t\tconfig: toolSearchRuntimeConfig,', 'tool-base:pre-profile'],
  ['\tconst localModelLeanEnabled = isLocalModelLeanEnabled({\n\t\tconfig: attempt.config,\n\t\tagentId: params.sessionAgentId,', 'tool-base:capability-profile'],
];

const SUMMARY_BEFORE = '\treturn summary.totalMs >= totalThresholdMs || summary.stages.some((stage) => stage.durationMs >= stageThresholdMs);';
const SUMMARY_AFTER = `\t// ${PROMPT_MARKER}: diagnostic switch, prints every stage summary\n\tif (process.env.OPENCLAW_EMBEDDED_STAGE_SUMMARY_ALWAYS === "1") return true;\n${SUMMARY_BEFORE}`;

export function patchBuiltinChunk(source) {
  if (source.includes(PROMPT_MARKER)) throw new Error('already patched');
  source = once(source,
    'async function runEmbeddedAttemptPromptPhase(input) {',
    `${HELPER}async function runEmbeddedAttemptPromptPhase(input) {`,
    'helper');
  for (const [anchor, stage, indent] of PROMPT_MARKS) {
    source = once(source, anchor, `${indent}ocPromptMark(attempt, "${stage}");\n${anchor}`, stage);
  }
  for (const [anchor, stage] of TOOL_BASE_MARKS) {
    source = once(source, anchor, `\tparams.markCoreToolStage?.("${stage}");\n${anchor}`, stage);
  }
  return once(source, SUMMARY_BEFORE, SUMMARY_AFTER, 'stage summary');
}
