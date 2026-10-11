// v-voice-direct-exec-admission-v1
import {withVoiceDirectExecAdmission} from './voice-direct-exec-admission.js';
import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { n as defaultSlotIdForKey } from "./slots-CQdAEuat.js";
import { o as isTestDefaultMemorySlotDisabled } from "./config-state-B-P4NhQV.js";
import { n as isAutomationsToolName, t as AUTOMATIONS_TOOL_NAME } from "./automations-tool-name-DBMZPbPL.js";
import { r as isKnownCoreToolId } from "./tool-catalog-CsKMGPc2.js";
import { t as ADMIN_SCOPE } from "./operator-scopes-Dw7Gu2cA.js";
import { i as logWarn } from "./logger-dgyRJ-bX.js";
import "./method-scopes-C3BvHJ95.js";
import { x as runBeforeToolCallHook } from "./agent-tools.before-tool-call-g2OT63u5.js";
import { i as resolveStoredSessionKeyForAgentStore } from "./session-store-key-DVtVp9hU.js";
import { a as isAgentHarnessSessionKey, r as AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE, s as isAgentHarnessSessionStoreEntryProtected } from "./agent-harness-session-key-CLRQddqz.js";
import { n as ToolInputError } from "./tool-input-error-mjW74R8m.js";
import "./common-BhOX6DcU.js";
import { r as getPluginToolMeta } from "./tool-metadata-B4LwDu-h.js";
import { c as getChannelAgentToolMeta } from "./agent-tool-metadata-CkrU8K-F.js";
import "./openclaw-tools-BODVdJQD.js";
import { t as authorizeGatewaySessionCreation } from "./operator-role-policy-B_VzZMic.js";
import { i as withOperatorToolGatewayAuthority } from "./server-plugin-in-process-dispatch-BirRDL7L.js";
import { t as createSyntheticPluginRuntimeClient } from "./server-plugin-runtime-client-CXu_O7BH.js";
import { n as resolveRequestedSessionAgentId } from "./session-request-agent-Db9uggbl.js";
import { i as loadGatewaySessionEntryReadOnly } from "./session-utils-store-Dlphca2N.js";
import "./session-utils-C2DgQXXH.js";
import "./agent-tools-djVuP1H1.js";
import { t as resolveToolLoopDetectionConfig } from "./tool-loop-detection-config-Dftl-DTD.js";
import { t as normalizeConversationReadInvocationOrigin } from "./conversation-read-origin-E3olMOwo.js";
import { t as resolveGatewayScopedTools } from "./tool-resolution-Con11qMn.js";
import { R as resolveSessionSharingTarget, k as authorizeResolvedSessionMutation } from "./session-sharing-BlMqwMBH.js";
//#region src/gateway/tools-invoke-shared.ts
const MEMORY_TOOL_NAMES = /* @__PURE__ */ new Set(["memory_search", "memory_get"]);
function resolveSessionTarget(params) {
	const rawSessionKey = normalizeOptionalString(params.input.sessionKey) ?? "main";
	const resolved = resolveRequestedSessionAgentId(params.cfg, rawSessionKey, normalizeOptionalString(params.input.agentId));
	if (!resolved.ok) return resolved;
	return {
		ok: true,
		agentId: resolved.agentId,
		sessionKey: resolveStoredSessionKeyForAgentStore({
			cfg: params.cfg,
			agentId: resolved.agentId,
			sessionKey: rawSessionKey
		})
	};
}
function resolveMemoryToolDisableReasons(cfg) {
	if (!process.env.VITEST) return [];
	const reasons = [];
	const plugins = cfg.plugins;
	const slotRaw = plugins?.slots?.memory;
	const slotDisabled = slotRaw === null || normalizeOptionalLowercaseString(slotRaw) === "none";
	const pluginsDisabled = plugins?.enabled === false;
	const defaultDisabled = isTestDefaultMemorySlotDisabled(cfg);
	if (pluginsDisabled) reasons.push("plugins.enabled=false");
	if (slotDisabled) reasons.push(slotRaw === null ? "plugins.slots.memory=null" : "plugins.slots.memory=\"none\"");
	if (!pluginsDisabled && !slotDisabled && defaultDisabled) reasons.push("memory plugin disabled by test default");
	return reasons;
}
function mergeActionIntoArgsIfSupported(params) {
	const { toolSchema, action, args } = params;
	if (!action || args.action !== void 0) return args;
	const schemaObj = toolSchema;
	return Boolean(schemaObj && typeof schemaObj === "object" && schemaObj.properties && "action" in schemaObj.properties) ? {
		...args,
		action
	} : args;
}
function resolveToolInputErrorStatus(err) {
	if (err instanceof ToolInputError) {
		const status = err.status;
		return typeof status === "number" ? status : 400;
	}
	if (typeof err !== "object" || err === null || !("name" in err)) return null;
	const name = err.name;
	if (name !== "ToolInputError" && name !== "ToolAuthorizationError") return null;
	const status = err.status;
	if (typeof status === "number") return status;
	return name === "ToolAuthorizationError" ? 403 : 400;
}
function resolveToolSource(tool) {
	if (getPluginToolMeta(tool)) return "plugin";
	if (getChannelAgentToolMeta(tool)) return "channel";
	return "core";
}
async function invokeGatewayToolWithSignal(params) {
	const conversationReadOrigin = normalizeConversationReadInvocationOrigin(params.conversationReadOrigin);
	const requestedToolName = normalizeOptionalString(params.input.name ?? params.input.tool) ?? "";
	const toolName = isAutomationsToolName(requestedToolName) ? AUTOMATIONS_TOOL_NAME : requestedToolName;
	if (!toolName) return {
		ok: false,
		status: 400,
		toolName: "",
		error: {
			type: "invalid_request",
			message: "tools.invoke requires name"
		}
	};
	if (process.env.VITEST && MEMORY_TOOL_NAMES.has(toolName)) {
		const reasons = resolveMemoryToolDisableReasons(params.cfg);
		if (reasons.length > 0) return {
			ok: false,
			status: 400,
			toolName,
			error: {
				type: "invalid_request",
				message: `memory tools are disabled in tests${` (${reasons.join(", ")})`}. Enable by setting plugins.slots.memory="${defaultSlotIdForKey("memory")}" (and ensure plugins.enabled is not false).`
			}
		};
	}
	const knownCoreTool = isKnownCoreToolId(toolName);
	const gatewayRequestedTools = knownCoreTool ? [] : [toolName];
	const action = normalizeOptionalString(params.input.action);
	const argsRaw = params.input.args;
	const args = argsRaw && typeof argsRaw === "object" && !Array.isArray(argsRaw) ? argsRaw : {};
	const sessionTarget = resolveSessionTarget({
		cfg: params.cfg,
		input: params.input
	});
	if (!sessionTarget.ok) return {
		ok: false,
		status: 400,
		toolName,
		error: {
			type: "invalid_request",
			message: sessionTarget.error.message
		}
	};
	const { agentId: selectedAgentId, sessionKey } = sessionTarget;
	const authenticatedUserProfile = params.cfg.gateway?.roles ? params.authenticatedUserProfile : void 0;
	const operatorRoleActor = params.operatorRoleActor ?? (params.senderIsOwner && !authenticatedUserProfile ? { kind: "system" } : void 0);
	const client = createSyntheticPluginRuntimeClient({
		...authenticatedUserProfile ? { authenticatedUserProfile } : {},
		...operatorRoleActor ? { operatorRoleActor } : {},
		scopes: params.senderIsOwner ? [ADMIN_SCOPE] : [...params.operatorScopes ?? []]
	});
	const primarySessionAuthorizationError = authorizeResolvedSessionMutation({
		cfg: params.cfg,
		client,
		sessionKey,
		agentId: selectedAgentId
	});
	if (primarySessionAuthorizationError) return {
		ok: false,
		status: 403,
		toolName,
		error: {
			type: "tool_call_blocked",
			message: primarySessionAuthorizationError.message
		}
	};
	if (authenticatedUserProfile && (toolName === "sessions_spawn" || toolName === "sessions_send")) {
		const nestedSessionKey = normalizeOptionalString(args.sessionKey);
		const nestedAgentId = normalizeOptionalString(args.agentId);
		const targetAgent = nestedSessionKey ? resolveRequestedSessionAgentId(params.cfg, nestedSessionKey, nestedAgentId) : void 0;
		if (targetAgent && !targetAgent.ok) return {
			ok: false,
			status: 400,
			toolName,
			error: {
				type: "invalid_request",
				message: targetAgent.error.message
			}
		};
		const targetAgentId = targetAgent?.agentId ?? nestedAgentId ?? selectedAgentId;
		const existingTarget = toolName === "sessions_send" && nestedSessionKey ? resolveSessionSharingTarget({
			cfg: params.cfg,
			sessionKey: nestedSessionKey,
			agentId: targetAgentId
		}) : null;
		const authorizationError = (toolName === "sessions_send" && nestedSessionKey ? authorizeResolvedSessionMutation({
			cfg: params.cfg,
			client,
			sessionKey: nestedSessionKey,
			agentId: targetAgentId
		}) : null) ?? (!existingTarget ? authorizeGatewaySessionCreation({
			cfg: params.cfg,
			profileId: authenticatedUserProfile.profileId,
			agentId: targetAgentId
		}) : null);
		if (authorizationError) return {
			ok: false,
			status: 403,
			toolName,
			error: {
				type: "tool_call_blocked",
				message: authorizationError.message
			}
		};
	}
	const sessionEntry = loadGatewaySessionEntryReadOnly(sessionKey, { agentId: selectedAgentId }).entry;
	if (isAgentHarnessSessionKey(sessionKey) && (!sessionEntry || isAgentHarnessSessionStoreEntryProtected(sessionKey, sessionEntry))) return {
		ok: false,
		status: 400,
		toolName,
		error: {
			type: "invalid_request",
			message: AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE
		}
	};
	// v-voice-direct-coding-tools-v1: a server-owned voice client explicitly
	// opts into mediated coding tools under the same effective agent policies.
	// Unprivileged clients and the normal RPC/HTTP surface remain unchanged.
	const directCodingTool = params.senderIsOwner === true &&
		params.clientCaps?.includes("voice-direct-tools") === true &&
		["read", "write", "edit", "apply_patch", "exec", "process"].includes(toolName);
	return await withVoiceDirectExecAdmission({
		enabled: directCodingTool && toolName === "exec",
		cfg: params.cfg, agentId: selectedAgentId, signal: params.signal
	}, async (voiceExecution) => {
	const resolveTools = (disablePluginTools) => resolveGatewayScopedTools({
		cfg: params.cfg,
		sessionKey,
		sessionId: sessionEntry?.sessionId,
		agentId: selectedAgentId,
		messageProvider: params.messageChannel,
		accountId: params.accountId,
		agentTo: params.agentTo,
		agentThreadId: params.agentThreadId,
		senderIsOwner: params.senderIsOwner,
		clientCaps: params.clientCaps,
		conversationReadOrigin,
		allowGatewaySubagentBinding: true,
		allowMediaInvokeCommands: true,
		surface: directCodingTool ? "loopback" : "http",
		mediatedToolNames: directCodingTool ? [toolName] : [],
		voiceDirectExecution: voiceExecution,
		disablePluginTools,
		gatewayRequestedTools
	});
	let { agentId, tools, workspaceDir } = resolveTools(knownCoreTool);
	if (knownCoreTool && !tools.some((candidate) => candidate.name === toolName)) ({agentId, tools, workspaceDir} = resolveTools(false));
	const requestedAgentId = normalizeOptionalString(params.input.agentId);
	if (requestedAgentId && agentId && requestedAgentId !== agentId) return {
		ok: false,
		status: 400,
		toolName,
		error: {
			type: "invalid_request",
			message: `agent id "${requestedAgentId}" does not match session agent "${agentId}"`
		}
	};
	const tool = tools.find((candidate) => candidate.name === toolName);
	if (!tool) return {
		ok: false,
		status: 404,
		toolName,
		error: {
			type: "not_found",
			message: `Tool not available: ${toolName}`
		}
	};
	try {
		const gatewayTool = tool;
		const idempotencyKey = normalizeOptionalString(params.input.idempotencyKey);
		const toolCallId = idempotencyKey ? `${params.toolCallIdPrefix}-${conversationReadOrigin}-${idempotencyKey}` : `${params.toolCallIdPrefix}-${conversationReadOrigin}-${Date.now()}`;
		const toolArgs = mergeActionIntoArgsIfSupported({
			toolSchema: gatewayTool.parameters,
			action,
			args
		});
		const hookResult = await runBeforeToolCallHook({
			toolName,
			params: toolArgs,
			toolCallId,
			ctx: {
				agentId,
				config: params.cfg,
				sessionKey,
				workspaceDir,
				loopDetection: resolveToolLoopDetectionConfig({
					cfg: params.cfg,
					agentId
				})
			},
			signal: params.signal,
			approvalMode: params.approvalMode
		});
		if (hookResult.blocked) return {
			ok: false,
			status: 403,
			toolName,
			error: {
				type: "tool_call_blocked",
				message: hookResult.reason,
				requiresApproval: hookResult.deniedReason === "plugin-approval"
			}
		};
		params.signal?.throwIfAborted();
		const executeTool = async () => await gatewayTool.execute?.(toolCallId, hookResult.params, params.signal);
		const result = authenticatedUserProfile ? await withOperatorToolGatewayAuthority({
			authenticatedUserProfile,
			scopes: params.operatorScopes ?? []
		}, executeTool) : await executeTool();
		return {
			ok: true,
			status: 200,
			toolName,
			source: resolveToolSource(gatewayTool),
			result
		};
	} catch (err) {
		const inputStatus = resolveToolInputErrorStatus(err);
		if (inputStatus !== null) return {
			ok: false,
			status: inputStatus === 403 ? 403 : 400,
			toolName,
			error: {
				type: "tool_error",
				message: formatErrorMessage(err) || "invalid tool arguments"
			}
		};
		if (!params.signal?.aborted) logWarn(`tools-invoke: tool execution failed: ${String(err)}`);
		return {
			ok: false,
			status: 500,
			toolName,
			error: {
				type: "tool_error",
				message: "tool execution failed"
			}
		};
	}
	});
}
/** Resolves, authorizes, and invokes one gateway-visible core/plugin/channel tool. */
async function invokeGatewayTool(params) {
	const requestAbort = new AbortController();
	const signal = params.signal ? AbortSignal.any([params.signal, requestAbort.signal]) : requestAbort.signal;
	try {
		return await invokeGatewayToolWithSignal({
			...params,
			signal
		});
	} finally {
		requestAbort.abort();
	}
}
//#endregion
export { invokeGatewayTool as t };
