import assert from 'node:assert/strict';

// /vcc (claude-cli) never accepted a message sent while a reply was running (V 2026-11-06).
//
// A Feishu message that arrives during an active reply is "steered" into that reply when its
// backend offers message injection (replyRunRegistry -> backend.queueMessage). The claude-cli
// backend attached only { kind, runId, toolAuthorityFingerprint, cancel }, so every steer was
// rejected with "no injectable reply operation" and fell back to a follow-up turn that ran after
// the reply finished. Reproduced in V's test group 2026-11-06 00:00 CST: the mid-turn message was
// answered as a separate turn after the first reply.
//
// The live Claude session already feeds Claude Code through a streaming prompt (Agent SDK query()
// over a PassThrough). Probes on V's own Claude Code and SDK (0.3.241) showed:
//   - a user message written while a tool runs is absorbed into the same turn (one result);
//   - one written while the final answer is being produced makes Claude Code finish that turn and
//     run another one for it (a second result), which OpenClaw used to drop because the turn had
//     already completed at the first result;
//   - with --replay-user-messages Claude Code echoes each user message (same uuid) when it consumes it,
//     before the result in the first case and after it in the second.
//
// vcc-steer-live-injection-v1: the live session gains queueMessage (text only), writes the message
// into the running process, and records its uuid; replays are consumed internally (never forwarded)
// and clear the uuid; at a result the turn stays open while any steered message is unconsumed, so
// the follow-on turn's text joins this reply (the JSONL parser already joins multiple results). If no
// replay arrives within 60 s of that result, the turn completes and the live process is closed so a
// late answer can never leak into the next turn. The core's claude-cli reply handle exposes the
// injection when its live session can take it; otherwise the steer falls back as before.

// Source: openclaw-versa versa/port-vcc-steer-20261106 (6f600039627), on versa/port-session-delete-admission-20261105.

export const MARKER = 'vcc-steer-live-injection-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/extensions/anthropic/agent-sdk.runtime.js
export function patchAgentSdkRuntime(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `const RESULT_HOLDING_BACKGROUND_TASK_TYPES = /* @__PURE__ */ new Set(["local_agent", "local_workflow"]);`,
    `const RESULT_HOLDING_BACKGROUND_TASK_TYPES = /* @__PURE__ */ new Set(["local_agent", "local_workflow"]);
// ${MARKER}: how long a turn waits after its result for a steered message Claude Code has not consumed.
const CLAUDE_STEER_FOLLOW_ON_TIMEOUT_MS = 6e4;`,
    'result-holding constant');
  // A steered message is not a new OpenClaw prompt: do not prepend the turn's prompt context again.
  out = replaceExactlyOnce(out,
    `				if (input.hook_event_name !== "UserPromptSubmit" || !turn || request.signal.aborted || turn.controller.signal.aborted) return {};
`,
    `				if (input.hook_event_name !== "UserPromptSubmit" || !turn || request.signal.aborted || turn.controller.signal.aborted) return {};
				if (typeof input.prompt === "string" && turn.steerPrompts?.has(input.prompt)) return {};
`,
    'UserPromptSubmit hook');
  out = replaceExactlyOnce(out,
    `function completeClaudeAgentSdkTurn(session) {
	const turn = session.currentTurn;
	if (!turn) return;
	session.currentTurn = void 0;`,
    `function completeClaudeAgentSdkTurn(session) {
	const turn = session.currentTurn;
	if (!turn) return;
	clearTimeout(turn.steerFollowOnTimer);
	session.currentTurn = void 0;`,
    'completeClaudeAgentSdkTurn');
  out = replaceExactlyOnce(out,
    `function acceptClaudeAgentSdkMessage(session, message) {
	const turn = session.currentTurn;
	if (!turn) return;
	if (message.type === "system" && message.subtype === "background_tasks_changed")`,
    `function queueClaudeAgentSdkSteer(session, text) {
	const turn = session.currentTurn;
	if (session.closed || !turn || turn.controller.signal.aborted) throw new Error("Claude live session has no running turn to steer.");
	if (turn.sawTerminalResult && turn.pendingSteers.size === 0) throw new Error("Claude live turn already finished.");
	if (typeof text !== "string" || !text.trim()) throw new Error("Claude live steer needs text.");
	const message = {
		...createClaudeAgentSdkUserMessage({
			...turn.context,
			prompt: text
		}),
		priority: "next"
	};
	turn.pendingSteers.add(message.uuid);
	turn.steerPrompts.add(text);
	session.prompts.write(message);
}
function acceptClaudeAgentSdkMessage(session, message) {
	const turn = session.currentTurn;
	if (!turn) return;
	if (message.type === "user" && message.isReplay === true) {
		if (typeof message.uuid === "string") turn.pendingSteers.delete(message.uuid);
		return;
	}
	if (message.type === "system" && message.subtype === "background_tasks_changed")`,
    'acceptClaudeAgentSdkMessage head');
  out = replaceExactlyOnce(out,
    `	if (message.type === "result") {
		turn.sawTerminalResult = true;
		if (!session.hasResultHoldingBackgroundTasks) completeClaudeAgentSdkTurn(session);
	}
}`,
    `	if (message.type === "result") {
		turn.sawTerminalResult = true;
		clearTimeout(turn.steerFollowOnTimer);
		if (turn.pendingSteers.size > 0) {
			turn.steerFollowOnTimer = setTimeout(() => {
				if (session.currentTurn !== turn) return;
				completeClaudeAgentSdkTurn(session);
				session.handle.close("restart");
			}, CLAUDE_STEER_FOLLOW_ON_TIMEOUT_MS);
			turn.steerFollowOnTimer.unref?.();
			return;
		}
		if (!session.hasResultHoldingBackgroundTasks) completeClaudeAgentSdkTurn(session);
	}
}`,
    'result completion');
  out = replaceExactlyOnce(out,
    `			isIdle: () => !session.closed && !session.currentTurn,
			close: (reason, error) => closeClaudeAgentSdkSession(session, reason, error),`,
    `			isIdle: () => !session.closed && !session.currentTurn,
			canQueueMessage: () => !session.closed && Boolean(session.currentTurn) && !session.currentTurn.controller.signal.aborted && !(session.currentTurn.sawTerminalResult && session.currentTurn.pendingSteers.size === 0),
			queueMessage: async (text) => queueClaudeAgentSdkSteer(session, text),
			close: (reason, error) => closeClaudeAgentSdkSession(session, reason, error),`,
    'live session handle');
  out = replaceExactlyOnce(out,
    `		events: new PassThrough({ objectMode: true }),
		sawTerminalResult: false
	};
	session.currentTurn = turn;`,
    `		events: new PassThrough({ objectMode: true }),
		sawTerminalResult: false,
		pendingSteers: /* @__PURE__ */ new Set(),
		steerPrompts: /* @__PURE__ */ new Set()
	};
	session.currentTurn = turn;`,
    'turn record');
  // Claude Code echoes consumed user messages only with --replay-user-messages; live sessions only.
  out = replaceExactlyOnce(out,
    `			const options = resolveClaudeAgentSdkOptions(context, session.controller, () => session.currentTurn, session.process);
			session.query = query({`,
    `			const options = resolveClaudeAgentSdkOptions(context, session.controller, () => session.currentTurn, session.process);
			options.extraArgs = {
				...options.extraArgs,
				"replay-user-messages": null
			};
			session.query = query({`,
    'live query options');
  return out;
}

// core/dist/execute.runtime-DRmvah87.js: the plugin-executed (live session) claude-cli reply handle.
export function patchExecuteRuntime(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `	const replyBackendHandle = run.replyOperation ? {
		kind: "cli",
		runId: run.runId,
		toolAuthorityFingerprint: run.toolAuthorityFingerprint,
		cancel: () => {
			termination.reason = "manual-cancel";
			controller.abort(createCliAbortError());
		}
	} : void 0;`,
    `	// ${MARKER}: let a running live session take a steered message instead of queueing a follow-up.
	const liveSteerHandle = () => {
		try {
			const handle = liveSession?.current();
			return handle && typeof handle.queueMessage === "function" && handle.canQueueMessage?.() === true ? handle : void 0;
		} catch {
			return;
		}
	};
	const queueLiveSteer = async (text) => {
		const handle = liveSteerHandle();
		if (!handle) throw new Error("Claude live session cannot take a steered message now.");
		await handle.queueMessage(text);
	};
	const replyBackendHandle = run.replyOperation ? {
		kind: "cli",
		runId: run.runId,
		toolAuthorityFingerprint: run.toolAuthorityFingerprint,
		cancel: () => {
			termination.reason = "manual-cancel";
			controller.abort(createCliAbortError());
		},
		sourceReplyDeliveryMode: run.sourceReplyDeliveryMode,
		taskSuggestionDeliveryMode: run.taskSuggestionDeliveryMode,
		messageInjection: {
			isAvailable: () => Boolean(liveSteerHandle()),
			queueMessage: queueLiveSteer
		}
	} : void 0;`,
    'plugin reply backend handle');
}

export const FILES = [
  {
    base: 'core/dist/extensions/anthropic',
    target: 'openclaw/dist/extensions/anthropic',
    name: 'agent-sdk.runtime.js',
    before: '1372aaa4561376b0f99b40268a45ea4b7fb087f22f2ed8c7c43206f5da8b785f',
    patch: patchAgentSdkRuntime,
  },
  {
    base: 'core/dist',
    target: 'openclaw/dist',
    name: 'execute.runtime-DRmvah87.js',
    before: '106738fad647cff6669f2324360cae9fa73467d9d11661041a6ee600509fb1c9',
    patch: patchExecuteRuntime,
  },
];
