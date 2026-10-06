import assert from 'node:assert/strict';

// Gateway first-message preparation (gateway-first-message), on V's 2026.9.1 db91.6 bytes.
//
// The first message after a Gateway start pays one-time work between dispatch and the
// Worker harness. Production V 2026-10-06 00:55 (first message after the #212 restart):
// 8.4 s from "dispatching to agent" to gateway-harness-enter, with "[skills] Skipping
// invalid skill" logged at +7.3 s; later messages 0.7-2.6 s. VLab candidate (private
// Gateway, Workers ready, 30 s idle): chat.send -> gateway-harness-enter 1965 ms for the
// first message, 371 / 441 ms for the next two. The first message's CPU profile: ~200 ms
// building the agent's workspace skill snapshot (get-reply -> ensureSkillSnapshot ->
// resolveReusableWorkspaceSkillSnapshot -> loadSkillEntries), ~0.4-0.8 s of first imports
// (40 scripts parsed), GC; the second and third messages build no snapshot and parse
// (almost) no script.
//
// OpenClaw already prepares the reply runtime at startup (sidecars.reply-runtime ->
// prewarmConfigDrivenReplyRuntime) and runs post-ready "gateway data" prewarm items as
// idle tasks (scheduleGatewayHandlerPrewarm: each item waits until the Gateway has no
// root work, retries while busy, failures are logged and skipped). This adds one item to
// that list, ahead of the existing ones:
//   reply.first-message: import the reply path's remaining lazy runtimes, then for each
//   configured agent (at most 16) call the same ensureSkillSnapshot a message calls, with
//   the inputs get-reply derives for it (workspace, <workspace>/skills, config, the
//   session key's eligibility) and without a session entry, session store or entry
//   handle. With none of those ensureSkillSnapshot has nothing to persist into: the
//   snapshot lands only in the process cache that the first message's cachedRebuild reads.
// Nothing is written. OPENCLAW_GATEWAY_FIRST_MESSAGE_PREWARM=0 turns it off.
//
// Busy start (V 2026-10-06 18:51): the idle scheduler retries every 250 ms while the Gateway
// has any root work, and V had browser and takeover turns running from the first seconds, so
// after 7 minutes the item had still not run and real messages paid the cost instead. The
// item now waits for an idle Gateway at most OPENCLAW_GATEWAY_FIRST_MESSAGE_PREWARM_MAX_WAIT_MS
// (default 3000) and then runs anyway; the other prewarm items keep waiting for idle as before.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// dist-relative modules the first message imports on the shared reply path
export const REPLY_FIRST_MESSAGE_MODULES = [
  './groups.runtime.js',
  './abort.runtime.js',
  './command-poll-backoff.runtime.js',
  './acp-workspace-provisioning-BeD_7yxe.js',
  './agents/auth-profiles.runtime.js',
];
export const MAX_PREWARM_AGENTS = 16;
export const DEFAULT_MAX_IDLE_WAIT_MS = 3000;

const REPLY_PREWARM = `/** Prepare what the first message after a Gateway start would otherwise pay for on the
 * reply path (gateway-first-message): its remaining lazy imports, and each agent's workspace
 * skill snapshot built through ensureSkillSnapshot exactly as get-reply calls it, but with
 * no session entry, store or handle, so nothing can be persisted and the snapshot only
 * lands in the process cache the first message reads. */
async function prewarmReplyFirstMessage(params) {
	const started = performance.now();
	const modules = await Promise.allSettled([
		sessionUpdatesRuntimeLoader.load(),
		groupsRuntimeLoader.load(),
%MODULES%
	]);
	const { ensureSkillSnapshot } = await loadSessionUpdatesRuntime();
	const agentIds = [...new Set((params?.agentIds ?? []).map((id) => normalizeAgentId(id)))].slice(0, ${'%MAX%'});
	const skillSnapshots = [];
	for (const agentId of agentIds) {
		const agentStarted = performance.now();
		try {
			const workspaceDir = resolveUserPath(resolveAgentWorkspaceDir(params.cfg, agentId) ?? DEFAULT_AGENT_WORKSPACE_DIR);
			const result = await ensureSkillSnapshot({
				agentId,
				sessionKey: \`agent:\${agentId}:feishu:group:gateway-prewarm\`,
				isFirstTurnInSession: false,
				workspaceDir,
				executionSkillsDir: path.join(workspaceDir, "skills"),
				cfg: params.cfg
			});
			skillSnapshots.push({ agentId, ok: Boolean(result?.skillsSnapshot), ms: Math.round(performance.now() - agentStarted) });
		} catch (error) {
			skillSnapshots.push({ agentId, ok: false, ms: Math.round(performance.now() - agentStarted), error: String(error?.message ?? error).slice(0, 160) });
		}
	}
	return {
		modules: \`\${modules.filter((r) => r.status === "fulfilled").length}/\${modules.length}\`,
		skillSnapshots,
		ms: Math.round(performance.now() - started)
	};
}
`;

export function patchGetReplyChunk(source) {
  let out = replaceExactlyOnce(
    source,
    'import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";\n',
    'import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";\nimport { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";\n',
    'agent id import',
  );
  out = replaceExactlyOnce(
    out,
    'function loadEmbeddedAgentRuntime() {\n',
    `${REPLY_PREWARM
      .replace('%MODULES%', REPLY_FIRST_MESSAGE_MODULES.map((m) => `\t\timport(${JSON.stringify(m)})`).join(',\n'))
      .replace('%MAX%', String(MAX_PREWARM_AGENTS))}function loadEmbeddedAgentRuntime() {\n`,
    'embedded agent runtime loader',
  );
  out = replaceExactlyOnce(
    out,
    'export { prewarmReplyRunRuntimes as n, getReplyFromConfig as t };',
    'export { prewarmReplyRunRuntimes as n, prewarmReplyFirstMessage, getReplyFromConfig as t };',
    'get-reply exports',
  );
  return out;
}

export function patchReplyFacade(source) {
  let out = replaceExactlyOnce(
    source,
    'import { n as prewarmReplyRunRuntimes, t as getReplyFromConfig } from "./get-reply-CqW1y05D.js";',
    'import { n as prewarmReplyRunRuntimes, prewarmReplyFirstMessage, t as getReplyFromConfig } from "./get-reply-CqW1y05D.js";',
    'facade import',
  );
  out = replaceExactlyOnce(
    out,
    '//#endregion\nexport { getReplyFromConfig, prewarmConfigDrivenReplyRuntime };',
    `/** First-message preparation for the post-ready idle prewarm (gateway-first-message). */
async function prewarmConfigDrivenReplyFirstMessage(params) {
	return await prewarmReplyFirstMessage(params);
}
//#endregion
export { getReplyFromConfig, prewarmConfigDrivenReplyFirstMessage, prewarmConfigDrivenReplyRuntime };`,
    'facade exports',
  );
  return out;
}

const FIRST_MESSAGE_ITEM = `	const firstMessageMaxIdleWaitMs = Number(process.env.OPENCLAW_GATEWAY_FIRST_MESSAGE_PREWARM_MAX_WAIT_MS ?? ${'%MAXWAIT%'});
	const firstMessageItems = process.env.OPENCLAW_GATEWAY_FIRST_MESSAGE_PREWARM === "0" ? [] : [{
		name: "reply.first-message",
		maxIdleWaitMs: Number.isFinite(firstMessageMaxIdleWaitMs) && firstMessageMaxIdleWaitMs >= 0 ? firstMessageMaxIdleWaitMs : ${'%MAXWAIT%'},
		load: async () => {
			const busyAtStart = getActiveGatewayRootWorkCount({ excludeCurrent: true });
			const { prewarmConfigDrivenReplyFirstMessage } = await loadGetReplyFromConfigRuntime();
			if (typeof prewarmConfigDrivenReplyFirstMessage !== "function") return;
			const result = await prewarmConfigDrivenReplyFirstMessage({ cfg, agentIds });
			log.info?.(\`[gateway-first-message-prewarm.1] \${JSON.stringify({ status: "ready", busyAtStart, ...result })}\`);
		}
	}];
	return [...firstMessageItems, ...agentIds.map((agentId) => ({`;

const BOUNDED_IDLE_WAIT = `			const load = () => item.load();
			const busyUntil = typeof item.maxIdleWaitMs === "number" ? Date.now() + item.maxIdleWaitMs : Infinity;
			idleTask = scheduleGatewayIdleTask({
				delayMs: 0,
				retryDelayMs: GATEWAY_HANDLER_PREWARM_RETRY_DELAY_MS,
				isClosing: () => stopped,
				isBusy: () => Date.now() < busyUntil && getActiveGatewayRootWorkCount({ excludeCurrent: true }) > 0,`;

export function patchPostAttach(source) {
  const out = replaceExactlyOnce(
    source,
    '	return [...agentIds.map((agentId) => ({',
    FIRST_MESSAGE_ITEM.replaceAll('%MAXWAIT%', String(DEFAULT_MAX_IDLE_WAIT_MS)),
    'dashboard prewarm item list',
  );
  return replaceExactlyOnce(
    out,
    `			const load = () => item.load();
			idleTask = scheduleGatewayIdleTask({
				delayMs: 0,
				retryDelayMs: GATEWAY_HANDLER_PREWARM_RETRY_DELAY_MS,
				isClosing: () => stopped,
				isBusy: () => getActiveGatewayRootWorkCount({ excludeCurrent: true }) > 0,`,
    BOUNDED_IDLE_WAIT,
    'handler prewarm idle wait',
  );
}
