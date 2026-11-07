#!/usr/bin/env node
// A Codex turn whose model request never answers ends in bounded time.
//
//   node patch-codex-model-wait-watchdog.mjs <@openclaw/codex/dist> [--check]
//
// Codex has no timeout before the response headers and models.providers.*.timeoutSeconds never
// reaches it, so a provider that accepts the connection and goes quiet held the session for over
// 930 s with no reply and no fallback. Upstream removed its turn idle watches on purpose (#134755,
// real long tool-argument generation was being interrupted) and has nothing to backport: only the
// elapsed execution budget, unlimited on V.
//
// So this watches one narrow thing: Codex is waiting on the model and the turn has been silent.
//
//   - Not while anything else owns the wait: a native tool item (shell, computer, MCP, subagent,
//     compaction, or a type this code does not know), a tool call the model finished and whose
//     output has not come back, a dynamic tool or approval request, a local projection.
//   - The limit is the provider's models.providers.<id>.timeoutSeconds, the value the Worker runtime
//     already applies (V: DeepSeek 90 s). A provider without one stays as it is, unbounded, unless
//     OPENCLAW_CODEX_MODEL_WAIT_DEFAULT_SECONDS is set: upstream's own quiet-turn contract (#134755)
//     says a silent GPT turn is not evidence of a hang, and its 5 min idle watch was interrupting
//     real work.
//   - Once this request has produced model output the limit doubles: tool arguments stream with no
//     app-server event at all, and they must not look like a hang.
//   - The turn is interrupted and ends as a prompt timeout that names the provider. It is not an
//     abort and not a budget timeout, so the existing policy applies: replay-safe with a fallback
//     moves to the next model; without one, the run loop's transient window retries once and then
//     reports the error (about two limits, as the Worker does).
//   - A confirmed interrupt is a settled turn, so it keeps its subscription as #524's failed turn
//     does and the next message reuses the thread.
//
// OPENCLAW_CODEX_MODEL_WAIT_WATCHDOG=off disables it.
//
// Idempotent: every anchor must match exactly once, or its replacement must already be present.
// Written against the Codex dist V runs on 2026-11-01 (whole dist c2bbae59, run-attempt-D1hJO4fX.js 71a11b78).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith("--"));
const checkOnly = args.includes("--check");
assert(dist, "usage: patch-codex-model-wait-watchdog.mjs <dist dir> [--check]");

const WATCHDOG = `//#region extensions/codex/src/app-server/attempt-model-wait.ts
const CODEX_MODEL_WAIT_DELIVERY_GRACE_MS = 1e3;
const CODEX_MODEL_WAIT_NON_TOOL_ITEM_TYPES = new Set(["userMessage", "hookPrompt", "agentMessage", "reasoning", "plan"]);
const CODEX_MODEL_WAIT_MODEL_ITEM_TYPES = new Set(["agentMessage", "reasoning", "plan"]);
const CODEX_MODEL_WAIT_RAW_TOOL_CALLS = new Set(["custom_tool_call", "function_call", "local_shell_call", "tool_search_call"]);
const CODEX_MODEL_WAIT_RAW_TOOL_OUTPUTS = new Set(["custom_tool_call_output", "function_call_output", "tool_search_output"]);
const CODEX_MODEL_WAIT_MODEL_DELTAS = new Set(["item/agentMessage/delta", "item/plan/delta", "item/reasoning/summaryPartAdded", "item/reasoning/summaryTextDelta", "item/reasoning/textDelta"]);
// Carry no news about this turn's model request, including Codex's own retry notices.
const CODEX_MODEL_WAIT_IGNORED = new Set(["account/rateLimits/updated", "error", "thread/status/changed", "warning"]);
/** The provider's own request timeout; a provider without one is not watched unless asked for. */
function resolveCodexModelWaitLimitMs(params, threadProvider) {
	if (process.env.OPENCLAW_CODEX_MODEL_WAIT_WATCHDOG === "off") return;
	const providers = params.config?.models?.providers ?? {};
	for (const id of [threadProvider, params.provider]) {
		const seconds = typeof id === "string" ? providers[id]?.timeoutSeconds : void 0;
		if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) return Math.floor(seconds) * 1e3;
	}
	const fallbackSeconds = Number(process.env.OPENCLAW_CODEX_MODEL_WAIT_DEFAULT_SECONDS);
	return Number.isFinite(fallbackSeconds) && fallbackSeconds > 0 ? Math.floor(fallbackSeconds) * 1e3 : void 0;
}
/** Fires once when the turn has been silent while waiting on the model for the whole limit. */
function createCodexModelWaitWatchdog(params) {
	const activeToolItems = /* @__PURE__ */ new Set();
	const unansweredToolCalls = /* @__PURE__ */ new Set();
	let limitMs;
	let lastActivityAt = 0;
	let modelOutputSeen = false;
	let open = false;
	let graceSpent = false;
	let timer;
	const now = () => performance.now();
	const currentLimitMs = () => modelOutputSeen ? limitMs * 2 : limitMs;
	const schedule = (delayMs) => {
		clearTimeout(timer);
		timer = setTimeout(check, Math.max(1, delayMs));
		timer.unref?.();
	};
	const toolOwnsWait = () => activeToolItems.size > 0 || unansweredToolCalls.size > 0 || params.isBusy();
	const dispose = () => {
		open = false;
		clearTimeout(timer);
		params.signal.removeEventListener("abort", dispose);
	};
	function check() {
		if (!open) return;
		if (toolOwnsWait()) {
			lastActivityAt = now();
			graceSpent = false;
			schedule(limitMs);
			return;
		}
		const remainingMs = lastActivityAt + currentLimitMs() - now();
		if (remainingMs > 0) {
			graceSpent = false;
			schedule(remainingMs);
			return;
		}
		// A frozen event loop runs timers before it reads the app-server's queued output.
		if (!graceSpent) {
			graceSpent = true;
			schedule(CODEX_MODEL_WAIT_DELIVERY_GRACE_MS);
			return;
		}
		const fired = {
			limitMs: currentLimitMs(),
			waitedMs: Math.round(now() - lastActivityAt),
			modelOutputSeen
		};
		dispose();
		params.onExpire(fired);
	}
	const touch = () => {
		if (!open) return;
		lastActivityAt = now();
		graceSpent = false;
		schedule(currentLimitMs());
	};
	const note = (notification) => {
		if (!open || CODEX_MODEL_WAIT_IGNORED.has(notification.method)) return;
		const payload = isJsonObject(notification.params) ? notification.params : {};
		const item = isJsonObject(payload.item) ? payload.item : void 0;
		const type = typeof item?.type === "string" ? item.type : void 0;
		if (notification.method === "item/started" || notification.method === "item/completed") {
			const started = notification.method === "item/started";
			if (type && CODEX_MODEL_WAIT_MODEL_ITEM_TYPES.has(type)) modelOutputSeen = true;
			else if (type && !CODEX_MODEL_WAIT_NON_TOOL_ITEM_TYPES.has(type)) {
				const id = typeof item.id === "string" ? item.id : void 0;
				if (id && started) activeToolItems.add(id);
				if (id && !started) {
					activeToolItems.delete(id);
					unansweredToolCalls.delete(id);
				}
				modelOutputSeen = false;
			}
		} else if (notification.method === "rawResponseItem/completed" && type) {
			const callId = typeof item.call_id === "string" ? item.call_id : void 0;
			if (CODEX_MODEL_WAIT_RAW_TOOL_CALLS.has(type)) {
				if (callId) unansweredToolCalls.add(callId);
			} else if (CODEX_MODEL_WAIT_RAW_TOOL_OUTPUTS.has(type)) {
				if (callId) unansweredToolCalls.delete(callId);
				modelOutputSeen = false;
			} else if (type === "reasoning" || type === "message" && item.role === "assistant") modelOutputSeen = true;
		} else if (notification.method.startsWith("hook/")) {
			const run = isJsonObject(payload.run) ? payload.run : void 0;
			const id = typeof run?.id === "string" ? \`hook:\${run.id}\` : void 0;
			if (id && notification.method === "hook/started") activeToolItems.add(id);
			if (id && notification.method === "hook/completed") activeToolItems.delete(id);
		} else if (CODEX_MODEL_WAIT_MODEL_DELTAS.has(notification.method)) {
			modelOutputSeen = true;
			// A new response is streaming: whatever call still looks unanswered has been answered.
			if (activeToolItems.size === 0) unansweredToolCalls.clear();
		}
		touch();
	};
	const start = (nextLimitMs) => {
		if (open || nextLimitMs === void 0 || params.signal.aborted) return;
		limitMs = nextLimitMs;
		open = true;
		params.signal.addEventListener("abort", dispose, { once: true });
		lastActivityAt = now();
		schedule(limitMs);
	};
	return { start, note, touch, dispose };
}
//#endregion
//#region extensions/codex/src/app-server/attempt-deadlines.ts
`;

const TARGETS = {
  "run-attempt-": [
    // the watchdog itself, next to the deadlines it sits beside
    ["//#region extensions/codex/src/app-server/attempt-deadlines.ts\n", WATCHDOG],
    // turn state
    ["\t\tcurrentTurnHadNonTerminalDynamicToolResult: false\n\t};\n\tconst { promise: completion, resolve: resolveCompletion } = createDeferred();",
      "\t\tcurrentTurnHadNonTerminalDynamicToolResult: false,\n\t\tmodelWaitTimeout: void 0\n\t};\n\tconst { promise: completion, resolve: resolveCompletion } = createDeferred();"],
    ["\t\tstate.completed = true;\n\t\tsteeringQueueRef.current?.cancel();\n\t\tdeadlines.beginSettlement(Date.now());",
      "\t\tstate.completed = true;\n\t\tmodelWait.dispose();\n\t\tsteeringQueueRef.current?.cancel();\n\t\tdeadlines.beginSettlement(Date.now());"],
    ["\t\trenewNativeHookRelayForTurnProgress();\n\t\tparams.onRunProgress?.({",
      "\t\trenewNativeHookRelayForTurnProgress();\n\t\tif (reason.startsWith(\"request:\")) modelWait.touch();\n\t\tparams.onRunProgress?.({"],
    ["\treturn {\n\t\tstate,\n\t\tcompletion,\n\t\tpendingOpenClawDynamicToolCompletionIds,",
      `	const modelWait = createCodexModelWaitWatchdog({
		signal: runAbortController.signal,
		isBusy: () => state.activeAppServerTurnRequests > 0 || state.activeLocalProjections > 0 || pendingOpenClawDynamicToolCompletionIds.size > 0 || state.pendingTerminalDynamicToolRelease !== void 0 || state.localCompletionRequested || (projectorRef.current?.isCompacting() ?? false),
		onExpire: (expired) => {
			const provider = resourceState.thread.modelProvider ?? params.provider;
			state.modelWaitTimeout = {
				...expired,
				interruptConfirmed: false,
				message: \`Codex model request timed out: no response from \${provider} for \${Math.round(expired.waitedMs / 1e3)} s\`
			};
			const fields = {
				threadId: resourceState.thread.threadId,
				turnId: turnIdRef.current,
				provider,
				...expired
			};
			trajectoryRecorder?.recordEvent("turn.model_wait_timeout", fields);
			embeddedAgentLog.warn(state.modelWaitTimeout.message, fields);
			interruptTurn(turnIdRef.current ?? "").then((confirmed) => {
				state.modelWaitTimeout.interruptConfirmed = confirmed;
			}, (error) => {
				embeddedAgentLog.warn("codex app-server model wait interrupt failed", { error });
			}).finally(completeTurn);
		}
	});
	return {
		state,
		completion,
		pendingOpenClawDynamicToolCompletionIds,`],
    ["\t\tnoteProgress,\n\t\tdeadlines\n\t};\n}\n//#endregion\n//#region extensions/codex/src/app-server/run-attempt.ts",
      "\t\tnoteProgress,\n\t\tdeadlines,\n\t\tmodelWait\n\t};\n}\n//#endregion\n//#region extensions/codex/src/app-server/run-attempt.ts"],
    ["\t\tturnRuntime.deadlines.dispose();\n", "\t\tturnRuntime.deadlines.dispose();\n\t\tturnRuntime.modelWait.dispose();\n"],
    // armed once the turn is live
    ["const { state, completion, userInputBridgeRef, steeringQueueRef, deadlines, noteProgress, completeTurn, interruptTurn } = turnRuntime;",
      "const { state, completion, userInputBridgeRef, steeringQueueRef, deadlines, modelWait, noteProgress, completeTurn, interruptTurn } = turnRuntime;"],
    ["\tnoteProgress(\"turn:start\");\n",
      "\tif (!state.terminalTurnNotificationQueued) modelWait.start(resolveCodexModelWaitLimitMs(params, resourceState.thread.modelProvider));\n\tnoteProgress(\"turn:start\");\n"],
    // fed on receipt, not when the queue drains: a slow projection is not a silent model
    ["const { state, turnIdRef, userInputBridgeRef, steeringQueueRef, activeTurnItemIds, pendingOpenClawDynamicToolCompletionIds, completeTurn, noteProgress, deadlines } = turnRuntime;",
      "const { state, turnIdRef, userInputBridgeRef, steeringQueueRef, activeTurnItemIds, pendingOpenClawDynamicToolCompletionIds, completeTurn, noteProgress, deadlines, modelWait } = turnRuntime;"],
    ["\t\t\tstate.terminalTurnNotificationQueued = true;\n\t\t\tsteeringQueueRef.current?.sealAdmission();\n\t\t\tdeadlines.beginSettlement(receivedAtMs);\n\t\t}\n\t\tif (scope.turnId === turnId) {\n",
      "\t\t\tstate.terminalTurnNotificationQueued = true;\n\t\t\tmodelWait.dispose();\n\t\t\tsteeringQueueRef.current?.sealAdmission();\n\t\t\tdeadlines.beginSettlement(receivedAtMs);\n\t\t}\n\t\tif (scope.turnId === turnId) {\n\t\t\tmodelWait.note(notification);\n"],
    // the interrupt we asked for is not the projector's abort
    ["\t\tif ((state.timeout || state.localCompletionRequested) && isTerminal && readCodexTurnCompletedNotification(notification.params)?.turn.status === \"interrupted\") {",
      "\t\tif ((state.timeout || state.modelWaitTimeout || state.localCompletionRequested) && isTerminal && readCodexTurnCompletedNotification(notification.params)?.turn.status === \"interrupted\") {"],
    // finalization: a prompt timeout that names the provider; no failure kind, so the failover
    // policy (promptTimeoutFallbackSafe) decides, not the app-server recovery path
    ["\tlet finalPromptError = resourceState.executionDisconnectError ?? clientClosedPromptErrorForFinal ?? (state.timeout?.kind === \"settlement\"",
      "\tlet finalPromptError = resourceState.executionDisconnectError ?? state.modelWaitTimeout?.message ?? clientClosedPromptErrorForFinal ?? (state.timeout?.kind === \"settlement\""],
    ["\tconst finalPromptErrorSource = effectiveTimedOut || clientClosedPromptErrorForFinal ? \"prompt\" : projectedTerminal.promptErrorSource;",
      "\tconst finalPromptErrorSource = effectiveTimedOut || clientClosedPromptErrorForFinal || state.modelWaitTimeout ? \"prompt\" : projectedTerminal.promptErrorSource;"],
    ["\tconst codexAppServerFailureKind = clientClosedPromptErrorForFinal ? \"client_closed_before_turn_completed\" :",
      "\tconst codexAppServerFailureKind = state.modelWaitTimeout ? void 0 : clientClosedPromptErrorForFinal ? \"client_closed_before_turn_completed\" :"],
    ["\tterminalState.turnFailedSettled = !turnSucceeded && !finalAborted && !effectiveTimedOut && clientClosedPromptErrorForFinal === void 0 && completedTurnStatus === \"failed\";\n",
      "\tterminalState.turnFailedSettled = !turnSucceeded && !finalAborted && !effectiveTimedOut && clientClosedPromptErrorForFinal === void 0 && (completedTurnStatus === \"failed\" || state.modelWaitTimeout?.interruptConfirmed === true);\n"],
  ],
};

for (const [prefix, patches] of Object.entries(TARGETS)) {
  const hits = fs.readdirSync(dist).filter((f) => f.startsWith(prefix) && f.endsWith(".js") && !f.includes(".bak"));
  assert.equal(hits.length, 1, `expected one ${prefix}*.js in ${dist}, found ${hits.length}`);
  const file = path.join(dist, hits[0]);
  const before = fs.readFileSync(file, "utf8");
  let text = before;
  for (const [from, to] of patches) {
    if (text.includes(to)) continue;
    assert.equal(text.split(from).length, 2, `${hits[0]}: anchor must match once: ${from.slice(0, 70)}`);
    text = text.replace(from, () => to);
  }
  if (checkOnly) assert.equal(text, before, `${hits[0]}: patch not applied`);
  else if (text !== before) fs.writeFileSync(file, text);
}
