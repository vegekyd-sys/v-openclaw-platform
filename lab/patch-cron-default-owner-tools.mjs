import assert from 'node:assert/strict';

// A job an agent creates from chat without naming tools could never use Claude's
// native tools on claude-cli (V 2026-11-07).
//
// Creating a cron job from a session stores a frozen snapshot of the creating turn's
// OpenClaw tools (payload.toolsAllowIsDefault). On claude-cli that snapshot holds only
// the MCP-bridged OpenClaw tools: Bash/Read/Write/Edit are Claude's own and never part of
// it. At run time any finite list becomes a CLI cap with native tools disabled, so V's
// 19:30 "X 每日两帖草稿" job (created in its Feishu group) could not edit a file, while the
// operator-created Memory Librarian (`*`, trusted) edits files every night.
//
// cron-default-snapshot-runs-as-owner-v1, backport of upstream #162432 (run-time half):
// an agent-turn automatic snapshot with a valid scheduled owner policy, no condition
// trigger and no Codex app authority runs as `*`, i.e. with the same tools as a normal
// turn in its owner conversation (on claude-cli: no cap, native tools as in chat). The
// owner's scheduled policy still applies. Explicit lists, scripts and condition triggers
// keep their stored list; a `*` list keeps the creator's exec pin. Nothing stored changes.

// Source: openclaw-versa versa/port-cron-native-creator-20261107 (595ee2bf4aa), on
// versa/port-vcc-steer-20261106 (6f600039627).

export const MARKER = 'cron-default-snapshot-runs-as-owner-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/isolated-agent-BxeXdw5A.js: run preparation and the command-prompt preflight.
export function patchIsolatedAgent(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `function resolveCronCommandPromptPreflight(job) {
	if (job.payload.kind !== "agentTurn" || classifyCronAgentTurnShellPrompt(job.payload) !== "commandPromptWithoutShellAccess") return;`,
    `// ${MARKER}: an automatic creator snapshot runs with its owner conversation's tools.
function resolveCronRunToolsAllow(job) {
	return job.payload.kind === "agentTurn" && job.payload.toolsAllowIsDefault === true && !job.trigger?.script.trim() && !job.runtimeAuthority && !job.runtimeAuthorityRecoveryRequired && resolveCronScheduledToolPolicy({
		toolsAllow: job.payload.toolsAllow,
		scheduledToolPolicy: job.scheduledToolPolicy,
		owner: job.owner
	}) ? ["*"] : job.payload.toolsAllow;
}
function resolveCronCommandPromptPreflight(job) {
	if (job.payload.kind !== "agentTurn" || classifyCronAgentTurnShellPrompt({
		...job.payload,
		toolsAllow: resolveCronRunToolsAllow(job)
	}) !== "commandPromptWithoutShellAccess") return;`,
    'command-prompt preflight');
  out = replaceExactlyOnce(out,
    `		const agentPayload = input.job.payload.kind === "agentTurn" ? input.job.payload : null;`,
    `		const agentPayload = input.job.payload.kind === "agentTurn" ? {
			...input.job.payload,
			toolsAllow: resolveCronRunToolsAllow(input.job)
		} : null;`,
    'run payload');
  return out;
}

// core/dist/scheduled-tool-policy-WcH3cpLk.js: a `*` list carries the creator's exec pin.
export function patchScheduledToolPolicy(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `	if (!requirement || params.toolsAllow.includes("exec")) return [...params.toolsAllow];`,
    `	// ${MARKER}: a wildcard list already grants exec.
	if (!requirement || params.toolsAllow.includes("exec") || params.toolsAllow.includes("*")) return [...params.toolsAllow];`,
    'exec pin restore');
}

export const FILES = [
  {
    base: 'core/dist',
    target: 'openclaw/dist',
    name: 'isolated-agent-BxeXdw5A.js',
    before: '2613b14741ab4cf2a03c0c4e6be90a0594ee406009324876aae1d634734f8698',
    patch: patchIsolatedAgent,
  },
  {
    base: 'core/dist',
    target: 'openclaw/dist',
    name: 'scheduled-tool-policy-WcH3cpLk.js',
    before: 'b788e48c757ea29c8a57a1d01f25cf32d5e015c086d72d35723a65049d369b37',
    patch: patchScheduledToolPolicy,
  },
];
