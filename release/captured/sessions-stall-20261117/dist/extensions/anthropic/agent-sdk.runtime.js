import { c as isRecord } from "../../record-coerce-DItp3I4t.js";
import { t as _usingCtx } from "../../usingCtx-CTfBxUtw.js";
import "../../string-coerce-runtime-GQa0ehRA.js";
import { t as createClaudeAgentSdkProcessOwner } from "../../agent-sdk-process-DnhtknON.js";
import { n as splitClaudeToolNames, t as createClaudeAgentSdkUserMessage } from "../../agent-sdk-runtime-helpers-DkEzKEr2.js";
import { t as createClaudeAgentSdkUserInputAuthorizer } from "../../agent-sdk-user-input-Bs_xxp4_.js";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
//#region extensions/anthropic/agent-sdk.runtime.ts
const CLAUDE_EFFORT_LEVELS = [
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
const CLAUDE_STREAM_PROTOCOL_FLAGS = /* @__PURE__ */ new Set([
	"-p",
	"--print",
	"--verbose",
	"--include-partial-messages"
]);
const CLAUDE_STREAM_PROTOCOL_VALUE_FLAGS = /* @__PURE__ */ new Set([
	"--output-format",
	"--input-format",
	"--model",
	"--session-id",
	"--resume",
	"-r",
	"--append-system-prompt-file",
	"--append-system-prompt",
	"--system-prompt-file",
	"--system-prompt"
]);
const CLAUDE_VALUE_FLAGS = /* @__PURE__ */ new Set([
	...CLAUDE_STREAM_PROTOCOL_VALUE_FLAGS,
	"--setting-sources",
	"--allowedTools",
	"--allowed-tools",
	"--disallowedTools",
	"--disallowed-tools",
	"--tools",
	"--add-dir",
	"--permission-mode",
	"--effort",
	"--mcp-config",
	"--resume-session-at",
	"--max-turns",
	"--plugin-dir",
	"--plugin-dir-no-mcp"
]);
const CLAUDE_VARIADIC_VALUE_FLAGS = /* @__PURE__ */ new Set([
	"--allowedTools",
	"--allowed-tools",
	"--disallowedTools",
	"--disallowed-tools",
	"--tools",
	"--add-dir"
]);
const CLAUDE_LIVE_IDLE_TIMEOUT_MS = 6e5;
const RESULT_HOLDING_BACKGROUND_TASK_TYPES = /* @__PURE__ */ new Set(["local_agent", "local_workflow"]);
// vcc-steer-live-injection-v1: how long a turn waits after its result for a steered message Claude Code has not consumed.
const CLAUDE_STEER_FOLLOW_ON_TIMEOUT_MS = 6e4;
const claudeAgentSdkSessions = /* @__PURE__ */ new WeakMap();
async function authorizeClaudeAgentSdkTool(params) {
	const turn = params.currentTurn();
	if (!turn || params.signal.aborted || turn.controller.signal.aborted) return {
		behavior: "deny",
		message: "The OpenClaw run is no longer active."
	};
	try {
		const decision = params.toolName === "AskUserQuestion" ? await turn.userInput.authorize({
			input: params.input,
			signal: params.signal,
			...params.toolUseId ? { toolUseId: params.toolUseId } : {}
		}) : await turn.context.requestToolPermission({
			toolName: params.toolName,
			toolInput: params.input,
			...params.toolUseId ? { toolCallId: params.toolUseId } : {},
			abortSignal: params.signal
		});
		if (params.currentTurn() !== turn || params.signal.aborted || turn.controller.signal.aborted) return {
			behavior: "deny",
			message: "The OpenClaw run is no longer active."
		};
		return decision.behavior === "allow" ? {
			behavior: "allow",
			updatedInput: decision.updatedInput
		} : decision;
	} catch {
		return {
			behavior: "deny",
			message: "OpenClaw could not authorize this tool call."
		};
	}
}
function resolveClaudeAgentSdkOptions(context, abortController, currentTurn, processOwner) {
	const options = {
		abortController,
		cwd: context.cwd,
		env: context.env,
		includePartialMessages: true,
		model: context.modelId,
		pathToClaudeCodeExecutable: context.command,
		permissionMode: "default",
		settingSources: ["user"],
		spawnClaudeCodeProcess: processOwner.spawn,
		systemPrompt: {
			type: "preset",
			preset: "claude_code",
			append: context.systemPrompt
		},
		canUseTool: (toolName, input, request) => authorizeClaudeAgentSdkTool({
			currentTurn,
			toolName,
			input,
			signal: request.signal,
			toolUseId: request.toolUseID
		}),
		hooks: {
			UserPromptSubmit: [{ hooks: [async (input, _toolUseId, request) => {
				const turn = currentTurn();
				if (input.hook_event_name !== "UserPromptSubmit" || !turn || request.signal.aborted || turn.controller.signal.aborted) return {};
				if (typeof input.prompt === "string" && turn.steerPrompts?.has(input.prompt)) return {};
				const additionalContext = [turn.context.promptContext?.prependContext, turn.context.promptContext?.appendContext].filter(Boolean).join("\n\n");
				if (!additionalContext) return {};
				return { hookSpecificOutput: {
					hookEventName: "UserPromptSubmit",
					additionalContext
				} };
			}] }],
			PreToolUse: [{ hooks: [async (input, toolUseId, request) => {
				if (input.hook_event_name !== "PreToolUse") return {};
				if (input.tool_name.startsWith("mcp__openclaw__")) return { continue: true };
				if (!isRecord(input.tool_input)) return { hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: "OpenClaw rejected malformed native tool input."
				} };
				const decision = await authorizeClaudeAgentSdkTool({
					currentTurn,
					toolName: input.tool_name,
					input: input.tool_input,
					signal: request.signal,
					toolUseId: toolUseId ?? input.tool_use_id
				});
				return { hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: decision.behavior,
					...decision.behavior === "allow" ? { updatedInput: decision.updatedInput } : { permissionDecisionReason: decision.message }
				} };
			}] }]
		}
	};
	if (context.useResume && context.sessionId) options.resume = context.sessionId;
	else if (context.sessionId) options.sessionId = context.sessionId;
	const allowedTools = [];
	const disallowedTools = [];
	const extraArgs = {};
	let excludeDynamicSystemPromptSections = false;
	for (let index = 0; index < context.args.length; index += 1) {
		const rawArgument = context.args[index] ?? "";
		const equalsIndex = rawArgument.indexOf("=");
		const argument = equalsIndex === -1 ? rawArgument : rawArgument.slice(0, equalsIndex);
		const inlineValue = equalsIndex === -1 ? void 0 : rawArgument.slice(equalsIndex + 1);
		if (CLAUDE_STREAM_PROTOCOL_FLAGS.has(argument)) continue;
		let value = inlineValue ?? "";
		if (CLAUDE_VALUE_FLAGS.has(argument) && inlineValue === void 0) {
			const next = context.args[index + 1];
			if (next === void 0) throw new Error(`Claude Agent SDK cannot preserve ${argument} without its value`);
			value = next;
			index += 1;
		}
		const values = [value];
		if (CLAUDE_VARIADIC_VALUE_FLAGS.has(argument) && inlineValue === void 0) while (index + 1 < context.args.length && !context.args[index + 1]?.startsWith("-")) {
			values.push(context.args[index + 1] ?? "");
			index += 1;
		}
		if (CLAUDE_STREAM_PROTOCOL_VALUE_FLAGS.has(argument)) continue;
		switch (argument) {
			case "--setting-sources":
				if (value !== "" && value !== "user") throw new Error("Claude Agent SDK settings must be limited to user settings.");
				options.settingSources = value === "" ? [] : ["user"];
				break;
			case "--allowedTools":
			case "--allowed-tools":
				allowedTools.push(...values.flatMap(splitClaudeToolNames).filter((toolName) => toolName.startsWith("mcp__openclaw__")));
				break;
			case "--disallowedTools":
			case "--disallowed-tools":
				disallowedTools.push(...values.flatMap(splitClaudeToolNames));
				break;
			case "--tools":
				options.tools = values.flatMap(splitClaudeToolNames);
				break;
			case "--add-dir":
				options.additionalDirectories ??= [];
				options.additionalDirectories.push(...values);
				break;
			case "--permission-mode": break;
			case "--effort": {
				const effort = CLAUDE_EFFORT_LEVELS.find((level) => level === value);
				if (!effort) throw new Error(`Unsupported Claude Agent SDK effort: ${value}`);
				options.effort = effort;
				break;
			}
			case "--mcp-config":
				extraArgs["mcp-config"] = value;
				break;
			case "--strict-mcp-config":
				options.strictMcpConfig = true;
				break;
			case "--fork-session":
				options.forkSession = true;
				break;
			case "--resume-session-at":
				options.resumeSessionAt = value;
				break;
			case "--no-session-persistence":
				options.persistSession = false;
				break;
			case "--max-turns": {
				const maxTurns = Number(value);
				if (!Number.isSafeInteger(maxTurns) || maxTurns < 1) throw new Error(`Unsupported Claude Agent SDK max-turns value: ${value}`);
				options.maxTurns = maxTurns;
				break;
			}
			case "--plugin-dir":
			case "--plugin-dir-no-mcp":
				options.plugins ??= [];
				options.plugins.push({
					type: "local",
					path: value,
					...argument === "--plugin-dir-no-mcp" ? { skipMcpDiscovery: true } : {}
				});
				break;
			case "--exclude-dynamic-system-prompt-sections":
				excludeDynamicSystemPromptSections = true;
				break;
			default: {
				if (!argument.startsWith("--")) throw new Error(`Claude Agent SDK cannot preserve positional argument: ${argument}`);
				const name = argument.slice(2);
				if (inlineValue !== void 0) {
					extraArgs[name] = inlineValue;
					break;
				}
				const next = context.args[index + 1];
				if (next !== void 0 && !next.startsWith("-")) {
					extraArgs[name] = next;
					index += 1;
				} else extraArgs[name] = null;
			}
		}
	}
	if (context.toolAvailability) {
		options.tools = [...context.toolAvailability.native];
		const approvedOpenClawTools = context.toolAvailability.openClaw.map((toolName) => `mcp__openclaw__${toolName}`);
		const authorizedOpenClawTools = new Set(allowedTools);
		options.allowedTools = approvedOpenClawTools.filter((toolName) => authorizedOpenClawTools.has(toolName) || authorizedOpenClawTools.has("mcp__openclaw__*"));
	} else if (allowedTools.length > 0) options.allowedTools = [...new Set(allowedTools)];
	if (disallowedTools.length > 0) options.disallowedTools = [...new Set(disallowedTools)];
	if (Object.keys(extraArgs).length > 0) options.extraArgs = extraArgs;
	if (excludeDynamicSystemPromptSections) options.systemPrompt = {
		type: "preset",
		preset: "claude_code",
		append: context.systemPrompt,
		excludeDynamicSections: true
	};
	return options;
}
function closeClaudeAgentSdkSession(session, _reason, error) {
	if (session.closed) return;
	session.closed = true;
	clearTimeout(session.idleTimer);
	session.capability.remove(session.handle);
	const turn = session.currentTurn;
	session.currentTurn = void 0;
	session.process?.[Symbol.dispose]();
	if (turn) {
		turn.error = error instanceof Error ? error : /* @__PURE__ */ new Error("Claude Agent SDK live session closed.");
		turn.controller.abort();
		turn.events.end();
	}
	session.controller.abort();
	session.prompts.end();
	session.query?.close();
	if (!session.query) session.resolveExit();
}
function completeClaudeAgentSdkTurn(session) {
	const turn = session.currentTurn;
	if (!turn) return;
	clearTimeout(turn.steerFollowOnTimer);
	session.currentTurn = void 0;
	turn.controller.abort();
	turn.events.end();
	session.idleTimer = setTimeout(() => {
		session.handle.close("idle");
	}, CLAUDE_LIVE_IDLE_TIMEOUT_MS);
	session.idleTimer.unref();
}
function queueClaudeAgentSdkSteer(session, text) {
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
	if (message.type === "system" && message.subtype === "background_tasks_changed") session.hasResultHoldingBackgroundTasks = (Array.isArray(message.tasks) ? message.tasks : []).some((task) => isRecord(task) && typeof task.task_type === "string" && RESULT_HOLDING_BACKGROUND_TASK_TYPES.has(task.task_type) && typeof task.task_id === "string" && task.task_id.length > 0);
	turn.events.write(message);
	if (message.type === "result") {
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
}
async function consumeClaudeAgentSdkSession(session, query) {
	try {
		for await (const message of query) acceptClaudeAgentSdkMessage(session, { ...message });
		if (!session.closed) throw new Error("Claude Agent SDK live session exited unexpectedly.");
	} catch (error) {
		if (!session.closed) session.handle.close("abort", await session.process?.withDiagnostics(error));
	} finally {
		session.resolveExit();
	}
}
function createClaudeAgentSdkSession(capability) {
	let resolveExit = () => {};
	const exited = new Promise((resolve) => {
		resolveExit = resolve;
	});
	const session = {
		capability,
		controller: new AbortController(),
		prompts: new PassThrough({ objectMode: true }),
		hasResultHoldingBackgroundTasks: false,
		closed: false,
		resolveExit,
		exited,
		handle: {
			generation: randomUUID(),
			fingerprint: capability.fingerprint,
			isIdle: () => !session.closed && !session.currentTurn,
			canQueueMessage: () => !session.closed && Boolean(session.currentTurn) && !session.currentTurn.controller.signal.aborted && !(session.currentTurn.sawTerminalResult && session.currentTurn.pendingSteers.size === 0),
			queueMessage: async (text) => queueClaudeAgentSdkSteer(session, text),
			close: (reason, error) => closeClaudeAgentSdkSession(session, reason, error),
			waitForExit: () => session.exited
		}
	};
	claudeAgentSdkSessions.set(session.handle, session);
	capability.register(session.handle);
	return session;
}
async function* executeClaudeAgentSdkLiveTurn(context, capability, secretInput) {
	const { query } = await import("./agent-sdk/sdk.mjs");
	let existingHandle = capability.current();
	if (existingHandle && existingHandle.fingerprint !== capability.fingerprint) {
		existingHandle.close("restart");
		await existingHandle.waitForExit();
		existingHandle = capability.current();
	}
	let session = existingHandle ? claudeAgentSdkSessions.get(existingHandle) : void 0;
	if (existingHandle && (!session || session.closed)) {
		existingHandle.close("restart");
		await existingHandle.waitForExit();
		session = void 0;
	}
	session ??= createClaudeAgentSdkSession(capability);
	session.capability = capability;
	if (session.currentTurn) throw new Error("Claude Agent SDK live session is already handling another turn.");
	clearTimeout(session.idleTimer);
	const turn = {
		context,
		controller: new AbortController(),
		userInput: createClaudeAgentSdkUserInputAuthorizer(context),
		events: new PassThrough({ objectMode: true }),
		sawTerminalResult: false,
		pendingSteers: /* @__PURE__ */ new Set(),
		steerPrompts: /* @__PURE__ */ new Set()
	};
	session.currentTurn = turn;
	const abort = () => session.handle.close("abort", context.abortSignal?.reason);
	context.abortSignal?.addEventListener("abort", abort, { once: true });
	try {
		if (context.abortSignal?.aborted) {
			abort();
			throw context.abortSignal.reason ?? /* @__PURE__ */ new Error("Claude Agent SDK live turn was aborted.");
		}
		capability.activate(session.handle);
		if (!session.query) {
			session.process = createClaudeAgentSdkProcessOwner(() => session.currentTurn?.context, secretInput);
			const options = resolveClaudeAgentSdkOptions(context, session.controller, () => session.currentTurn, session.process);
			options.extraArgs = {
				...options.extraArgs,
				"replay-user-messages": null
			};
			session.query = query({
				prompt: session.prompts,
				options
			});
			consumeClaudeAgentSdkSession(session, session.query);
		}
		if (session.closed || session.currentTurn !== turn) throw new Error("Claude Agent SDK live session closed before its prompt was accepted.");
		session.prompts.write(createClaudeAgentSdkUserMessage(context));
		for await (const record of turn.events) yield record;
		if (turn.error) throw turn.error;
		if (!turn.sawTerminalResult) throw new Error("Claude Agent SDK live turn exited without a terminal result.");
	} catch (error) {
		if (!session.closed) session.handle.close("abort", error);
		throw error;
	} finally {
		turn.controller.abort();
		context.abortSignal?.removeEventListener("abort", abort);
	}
}
async function* executeClaudeAgentSdk(context, secretInput) {
	try {
		var _usingCtx$1 = _usingCtx();
		if (context.liveSession) {
			yield* executeClaudeAgentSdkLiveTurn(context, context.liveSession, secretInput);
			return;
		}
		const { query } = await import("./agent-sdk/sdk.mjs");
		const controller = new AbortController();
		let activeTurn = {
			context,
			controller,
			userInput: createClaudeAgentSdkUserInputAuthorizer(context)
		};
		const processOwner = _usingCtx$1.u(createClaudeAgentSdkProcessOwner(() => activeTurn?.context, secretInput));
		let sawTerminalResult = false;
		const abort = () => controller.abort();
		context.abortSignal?.addEventListener("abort", abort, { once: true });
		try {
			context.abortSignal?.throwIfAborted();
			const options = resolveClaudeAgentSdkOptions(context, controller, () => activeTurn, processOwner);
			for await (const message of query({
				prompt: context.prompt,
				options
			})) {
				if (message.type === "result") sawTerminalResult = true;
				yield { ...message };
			}
			if (!sawTerminalResult && !controller.signal.aborted) throw new Error("Claude Agent SDK exited without a terminal result.");
		} catch (error) {
			throw await processOwner.withDiagnostics(error);
		} finally {
			activeTurn = void 0;
			if (!controller.signal.aborted) controller.abort();
			context.abortSignal?.removeEventListener("abort", abort);
		}
	} catch (_) {
		_usingCtx$1.e = _;
	} finally {
		_usingCtx$1.d();
	}
}
//#endregion
export { executeClaudeAgentSdk };
