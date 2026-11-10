import { cronManagementPrincipalFromTurn, readCronManagementPolicy } from "./versa-cron-shared-management-v1.mjs";
import { c as normalizeOptionalLowercaseString } from "./string-coerce-CIXf7egm.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as AUTOMATIONS_TOOL_NAME } from "./automations-tool-name-DBMZPbPL.js";
import { a as expandToolGroups, c as normalizeToolPolicyName } from "./tool-policy-shared-D_3SrG-g.js";
import { t as createRuntimeToolMatcher } from "./tool-policy-match-DS7InkLt.js";
import { c as hasRestrictiveAllowPolicy, u as replaceWithEffectiveToolAllowlist } from "./tool-policy-De2653Mj.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { i as logWarn } from "./logger-dgyRJ-bX.js";
import { i as resolveGatewayMessageChannel } from "./message-channel-normalize-DzpgR6ro.js";
import "./message-channel-BGKf9KPa.js";
import { t as ToolAuthorizationError } from "./tool-input-error-mjW74R8m.js";
import "./common-BhOX6DcU.js";
import { r as resolveImageSanitizationLimits } from "./image-sanitization-DhkMOJXD.js";
import { n as copyPluginToolMeta, r as getPluginToolMeta } from "./tool-metadata-B4LwDu-h.js";
import { n as bindAssembledAgentToolActionDescriptor, r as copyAgentToolMetadata } from "./agent-tool-metadata-CkrU8K-F.js";
import { r as pinExecToolTarget } from "./exec-tool-target-pinning-Cmt_TOc5.js";
import { s as wrapToolWithGatewayCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";
import { i as resolveSessionPermissionExecPolicy, n as resolveSessionPermissionCoreToolPolicy } from "./session-permission-exec-mode-CJHB47SR.js";
import { r as resolveToolFsConfig } from "./tool-fs-policy-BVa4xTTT.js";
import { s as isCompletionReportInputProvenance } from "./input-provenance-CCQsDhUy.js";
import { d as listChannelAgentTools, l as filterToolsByClientCaps, t as createOpenClawTools, u as resolveOpenClawPluginToolsForOptions } from "./openclaw-tools-BODVdJQD.js";
import { A as getActiveAgentRingZeroTools, D as TOOL_SEARCH_CODE_MODE_TOOL_NAME, E as TOOL_DESCRIBE_RAW_TOOL_NAME, M as mergeAgentRingZeroTools, T as TOOL_CALL_RAW_TOOL_NAME, i as resolveLocalModelLeanPreserveToolNames, k as TOOL_SEARCH_RAW_TOOL_NAME, l as createToolSearchTools, n as filterLocalModelLeanTools, o as messageToolOwnsVisibleReply, p as resolveToolSearchConfig } from "./local-model-lean-DItPoOX_.js";
import { n as resolveSessionPlacementComputer, t as resolveConversationCapabilityProfile } from "./conversation-capability-profile-C6DysC6l.js";
import { n as resolveSandboxFileIdentity } from "./file-mutation-identity-dqR8BH1r.js";
import { t as resolveProcessToolScopeKey } from "./bash-process-scope-Bmw8_ghL.js";
import { t as HEARTBEAT_RESPONSE_TOOL_NAME } from "./heartbeat-tool-response-B4VYc0rg.js";
import { t as applyExecPolicyLayer } from "./exec-policy-Tf89GdLs.js";
import { n as resolveEventSessionRoutingPolicy } from "./event-session-routing-B2NedKOP.js";
import { r as replaceWithEffectiveCronCreatorToolAllowlist } from "./cron-tool-CPu6etIM.js";
import { t as applyToolPolicyPipeline } from "./tool-policy-pipeline-BI2zkR5E.js";
import { n as projectConversationToolNames, r as resolveConversationToolPolicies, t as buildConversationToolPolicyPipelineSteps } from "./conversation-tool-policy-pipeline-CFe-GVyj.js";
import { t as buildDeclaredToolAllowlistContext } from "./tool-policy-declared-context-Ck29q4nz.js";
import { s as shouldSuppressManagedWebSearchTool } from "./codex-native-web-search-core-mA5GZGaD.js";
import { n as mergeGatewayAgentCliPath } from "./openclaw-cli-shim-Bxbg8ch1.js";
import { r as appendRuntimePluginToolGrant } from "./tools-D1uCZ7Tn.js";
import { a as getActiveSecretsRuntimeConfigSnapshot } from "./runtime-state-BoJn6Ddu.js";
import { r as GATEWAY_OWNER_ONLY_CORE_TOOLS } from "./dangerous-tools-BB5wnYEo.js";
import { n as isApplyPatchAllowedForModel, r as finalizeAgentTools, t as createCoreCodingTools } from "./core-coding-tools-DYAE1EWB.js";
import { d as wrapToolMemoryFlushAppendOnlyWrite, p as createMemoryWriteProvenanceObserver, t as resolveToolLoopDetectionConfig } from "./tool-loop-detection-config-Dftl-DTD.js";
import "./codex-native-web-search-RpW5YzZM.js";
import { n as resolveExecToolConfig } from "./lazy-exec-tool-CxVBaAvd.js";
import { t as bindActiveCronCreatorAuthorityResolver } from "./cron-creator-authority-context-Cw7-6Bah.js";
import { c as prepareGitHubToolEnvironment } from "./github-tool-identity-Cj_AhZDB.js";
import { t as resolveScheduledToolCallerContext } from "./scheduled-tool-policy-CkIMk4GS.js";
//#region src/agents/agent-tools.message-provider-policy.ts
/**
* Message-provider tool filtering.
* Channels can restrict tool names after runtime assembly when the active
* transport cannot safely render or execute a class of tools.
*/
const TOOL_DENY_BY_MESSAGE_PROVIDER = {
	"discord-voice": ["tts"],
	voice: ["tts"]
};
const TOOL_ALLOW_BY_MESSAGE_PROVIDER = { node: [
	"canvas",
	"pdf",
	"tts",
	"view_image",
	"web_fetch",
	"web_search"
] };
/** Applies message-provider filtering while preserving duplicate tool entries. */
function filterToolsByMessageProvider(tools, messageProvider) {
	const normalizedProvider = normalizeOptionalLowercaseString(messageProvider);
	if (!normalizedProvider) return [...tools];
	const allowedTools = TOOL_ALLOW_BY_MESSAGE_PROVIDER[normalizedProvider];
	if (allowedTools && allowedTools.length > 0) {
		const allowedSet = new Set(allowedTools);
		return tools.filter((tool) => allowedSet.has(tool.name));
	}
	const deniedTools = TOOL_DENY_BY_MESSAGE_PROVIDER[normalizedProvider];
	if (!deniedTools || deniedTools.length === 0) return [...tools];
	const deniedSet = new Set(deniedTools);
	return tools.filter((tool) => !deniedSet.has(tool.name));
}
//#endregion
//#region src/agents/delegation-capability.ts
const log = createSubsystemLogger("agents/delegation-capability");
const NEW_DELEGATION_TOOL_NAMES = /* @__PURE__ */ new Set([
	"codex_session_send",
	"llm-task",
	"openclaw",
	"sessions_send",
	"sessions_spawn"
]);
const REPORT_ONLY_TOOL_ACTIONS = /* @__PURE__ */ new Map([
	[AUTOMATIONS_TOOL_NAME, /* @__PURE__ */ new Set([
		"get",
		"list",
		"remove",
		"runs",
		"status"
	])],
	["image_generate", /* @__PURE__ */ new Set(["list", "status"])],
	["music_generate", /* @__PURE__ */ new Set(["list", "status"])],
	["video_generate", /* @__PURE__ */ new Set(["list", "status"])]
]);
const REPORT_ONLY_ERROR = "New delegation is unavailable while reporting a completion through a fallback model.";
function resolveDelegationCapability(params) {
	if (!isCompletionReportInputProvenance(params.inputProvenance)) return "full";
	if (params.fallbackActive || params.disableTools === true) return "report_only";
	if (params.toolsAllow === void 0) return "full";
	return [...NEW_DELEGATION_TOOL_NAMES].some(createRuntimeToolMatcher(params.toolsAllow)) ? "full" : "report_only";
}
function readToolAction(params) {
	if (!params || typeof params !== "object" || Array.isArray(params)) return "";
	const action = params.action;
	return typeof action === "string" ? action.trim().toLowerCase() : "";
}
function wrapReportOnlyTool(tool, allowedActions) {
	const wrapped = new Proxy(tool, { get(target, property, receiver) {
		if (property !== "execute") return Reflect.get(target, property, receiver);
		return async (toolCallId, params, signal, onUpdate) => {
			if (!allowedActions.has(readToolAction(params))) throw new ToolAuthorizationError(REPORT_ONLY_ERROR);
			return await target.execute(toolCallId, params, signal, onUpdate);
		};
	} });
	copyPluginToolMeta(tool, wrapped);
	return wrapped;
}
/**
* Enforces the run's delegation capability after ordinary tool authorization.
* Tool names and safe actions here are explicit built-in/plugin contracts: the
* gate removes task launchers while retaining status, history, and cleanup.
*/
function applyDelegationCapability(tools, capability) {
	if (capability !== "report_only") return tools;
	const removed = [];
	const narrowed = [];
	const gated = tools.flatMap((tool) => {
		const name = normalizeToolPolicyName(tool.name);
		if (NEW_DELEGATION_TOOL_NAMES.has(name)) {
			removed.push(name);
			return [];
		}
		const allowedActions = REPORT_ONLY_TOOL_ACTIONS.get(name);
		if (!allowedActions) return [tool];
		narrowed.push(name);
		return [wrapReportOnlyTool(tool, allowedActions)];
	});
	if (removed.length > 0 || narrowed.length > 0) log.debug("delegation capability restricted run tools", {
		removed,
		narrowed
	});
	return gated;
}
//#endregion
//#region src/agents/agent-tools.ts
const MEMORY_FLUSH_ALLOWED_TOOL_NAMES = /* @__PURE__ */ new Set(["read", "write"]);
function applyModelProviderToolPolicy(toolsInput, params) {
	let tools = toolsInput;
	tools = filterLocalModelLeanTools({
		tools,
		config: params?.config,
		agentId: params?.agentId,
		sessionKey: params?.sessionKey,
		preserveToolNames: params?.localModelLeanPreserveToolNames ?? params?.runtimeToolAllowlist
	});
	if (params?.suppressManagedWebSearch !== false && shouldSuppressManagedWebSearchTool({
		config: params?.config,
		modelProvider: params?.modelProvider,
		modelApi: params?.modelApi,
		modelId: params?.modelId,
		agentId: params?.agentId,
		sessionKey: params?.sessionKey,
		agentDir: params?.agentDir
	})) return tools.filter((tool) => tool.name !== "web_search");
	return tools;
}
function createOpenClawCodingToolsInternal(options) {
	const sandbox = options?.sandbox?.enabled ? options.sandbox : void 0;
	const isMemoryFlushRun = options?.trigger === "memory";
	if (isMemoryFlushRun && !options?.memoryFlushWritePath) throw new Error("memoryFlushWritePath required for memory-triggered tool runs");
	const memoryFlushWritePath = isMemoryFlushRun ? options.memoryFlushWritePath : void 0;
	const cronSelfRemoveOnlyJobId = options?.trigger === "cron" && options.jobId?.trim() ? options.jobId.trim() : void 0;
	const capabilityProfile = options?.conversationCapabilityProfile ?? resolveConversationCapabilityProfile({
		config: options?.config,
		sessionKey: options?.sessionKey,
		runSessionKey: options?.runSessionKey,
		sessionId: options?.sessionId,
		runId: options?.runId,
		agentId: options?.policyAgentId ?? options?.agentId,
		agentDir: options?.agentDir,
		agentAccountId: options?.agentAccountId,
		messageProvider: options?.messageProvider,
		messageChannel: options?.messageChannel,
		chatType: options?.chatType,
		messageTo: options?.messageTo,
		messageThreadId: options?.messageThreadId,
		conversationToolPolicy: options?.conversationToolPolicy,
		currentChannelId: options?.currentChannelId,
		currentMessagingTarget: options?.currentMessagingTarget,
		currentThreadTs: options?.currentThreadTs,
		currentMessageId: options?.currentMessageId,
		groupId: options?.groupId,
		groupChannel: options?.groupChannel,
		groupSpace: options?.groupSpace,
		memberRoleIds: options?.memberRoleIds,
		spawnedBy: options?.spawnedBy,
		senderId: options?.senderId,
		senderName: options?.senderName,
		senderUsername: options?.senderUsername,
		senderE164: options?.senderE164,
		senderIsOwner: options?.senderIsOwner,
		modelProvider: options?.modelProvider,
		modelId: options?.modelId,
		modelApi: options?.modelApi,
		modelContextWindowTokens: options?.modelContextWindowTokens,
		modelHasVision: options?.modelHasVision,
		workspaceDir: options?.workspaceDir,
		cwd: options?.cwd,
		spawnWorkspaceDir: options?.spawnWorkspaceDir,
		skillsSnapshot: options?.skillsSnapshot,
		sandboxToolPolicy: sandbox?.tools,
		runtimeToolAllowlist: options?.runtimeToolAllowlist,
		inheritRuntimeToolAllowlist: options?.inheritRuntimeToolAllowlist,
		inputProvenance: options?.inputProvenance,
		trustedInternalHandoff: options?.trustedInternalHandoff,
		scheduledToolPolicy: options?.scheduledToolPolicy,
		pluginMetadataSnapshot: options?.preparedModelRuntime?.metadataSnapshot
	});
	const { agentId, runtimePluginToolGrant } = capabilityProfile.policy;
	const executionAgentId = options?.agentId ?? (options?.runSessionKey ? resolveSessionAgentId({
		config: options.config,
		sessionKey: options.runSessionKey
	}) : agentId);
	const executionSessionKey = options?.runSessionKey ?? options?.sessionKey;
	const enableHeartbeatTool = options?.enableHeartbeatTool === true || options?.trigger === "heartbeat" && options?.config?.messages?.visibleReplies === "message_tool";
	const forceHeartbeatTool = options?.forceHeartbeatTool === true || enableHeartbeatTool;
	const toolSearchConfig = resolveToolSearchConfig(options?.config);
	const toolSearchControlsEnabled = options?.includeToolSearchControls === true && toolSearchConfig.enabled;
	const toolSearchControlAllowlist = toolSearchControlsEnabled ? [
		TOOL_SEARCH_CODE_MODE_TOOL_NAME,
		TOOL_SEARCH_RAW_TOOL_NAME,
		TOOL_DESCRIBE_RAW_TOOL_NAME,
		TOOL_CALL_RAW_TOOL_NAME
	] : [];
	const runtimeToolAllowlistIncludesMessage = expandToolGroups(options?.runtimeToolAllowlist ?? []).some((toolName) => {
		const normalized = normalizeToolPolicyName(toolName);
		return normalized === "*" || normalized === "message";
	});
	const sourceReplyOnly = capabilityProfile.policy.requesterPolicySource === "completion-handoff" && options?.sourceReplyDeliveryMode === "message_tool_only";
	const localModelLeanPreserveToolNames = resolveLocalModelLeanPreserveToolNames({
		toolNames: capabilityProfile.policy.explicitToolOverrideAllowlist,
		forceMessageTool: options?.forceMessageTool,
		sourceReplyDeliveryMode: options?.sourceReplyDeliveryMode
	});
	const runtimeProfileAlsoAllow = [
		...options && messageToolOwnsVisibleReply(options) ? ["message"] : [],
		...runtimeToolAllowlistIncludesMessage ? ["message"] : [],
		...forceHeartbeatTool ? [HEARTBEAT_RESPONSE_TOOL_NAME] : [],
		...toolSearchControlAllowlist
	];
	const conversationToolPolicies = resolveConversationToolPolicies({
		capabilityProfile,
		additionalProfileAllow: runtimeProfileAlsoAllow,
		additionalPolicyAllow: toolSearchControlAllowlist
	});
	const sandboxWorkspaceMediaReadAllowed = projectConversationToolNames({
		capabilityProfile,
		toolNames: ["read"],
		warn: () => void 0
	}).length === 1;
	const scopeKey = resolveProcessToolScopeKey({
		scopeKey: options?.exec?.scopeKey,
		sessionKey: options?.sessionKey,
		sessionId: options?.sessionId,
		agentId
	});
	options?.recordToolPrepStage?.("tool-policy");
	const execConfig = resolveExecToolConfig({
		cfg: options?.config,
		agentId
	});
	const execRuntimeConfig = options?.exec?.config ?? options?.config;
	const preparedRunEnvironment = execRuntimeConfig && executionAgentId ? prepareGitHubToolEnvironment({
		config: execRuntimeConfig,
		sourceConfig: getActiveSecretsRuntimeConfigSnapshot()?.sourceConfig,
		agentId: executionAgentId
	}) : void 0;
	const fsConfig = resolveToolFsConfig({
		cfg: options?.config,
		agentId
	});
	const sessionPermissionPolicy = options?.sessionPermissionPolicy;
	const sessionCoreToolPolicy = sessionPermissionPolicy ? resolveSessionPermissionCoreToolPolicy(sessionPermissionPolicy) : void 0;
	const sandboxRoot = sandbox?.workspaceDir;
	const sandboxFsBridge = sandbox?.fsBridge;
	const allowWorkspaceWrites = sandbox?.workspaceAccess !== "ro";
	const workspaceRoot = capabilityProfile.workspace.workspaceRoot;
	const runtimeRoot = capabilityProfile.workspace.runtimeRoot;
	const codingRoot = sandboxRoot ?? runtimeRoot;
	const containmentRoot = sandboxRoot ?? sessionPermissionPolicy?.root ?? codingRoot;
	const memoryFlushWriteRoot = sandboxRoot ?? workspaceRoot;
	const memoryWriteProvenance = createMemoryWriteProvenanceObserver({
		mutationRoot: sandboxRoot ?? workspaceRoot,
		workspaceDir: sandboxRoot ?? workspaceRoot,
		resolvePath: sandboxFsBridge ? (filePath) => resolveSandboxFileIdentity({
			bridge: sandboxFsBridge,
			filePath,
			cwd: sandboxRoot,
			signal: options?.abortSignal
		}) : void 0,
		resolveOriginClass: () => options?.senderIsOwner === false || options?.isTurnTainted?.() === true ? "untrusted" : "agent",
		sessionId: options?.sessionId,
		sessionKey: options?.runSessionKey ?? options?.sessionKey
	});
	const includeCoreTools = options?.includeCoreTools !== false;
	const toolConstructionPlan = options?.toolConstructionPlan ?? {
		includeBaseCodingTools: includeCoreTools,
		includeShellTools: includeCoreTools,
		includeChannelTools: includeCoreTools,
		includeOpenClawTools: includeCoreTools,
		includePluginTools: true
	};
	const includeBaseCodingTools = includeCoreTools && toolConstructionPlan.includeBaseCodingTools;
	const includeShellTools = includeCoreTools && toolConstructionPlan.includeShellTools;
	const includeOpenClawTools = includeCoreTools && toolConstructionPlan.includeOpenClawTools;
	const includeChannelTools = toolConstructionPlan.includeChannelTools;
	const includePluginTools = toolConstructionPlan.includePluginTools;
	const workspaceOnly = isMemoryFlushRun || (sessionCoreToolPolicy?.workspaceOnly ?? fsConfig.workspaceOnly === true);
	const fsPolicy = {
		workspaceOnly,
		...sessionPermissionPolicy ? { root: sessionPermissionPolicy.root } : {}
	};
	const readOnly = sessionCoreToolPolicy?.readOnly ?? false;
	const applyPatchConfig = execConfig.applyPatch;
	const applyPatchWorkspaceOnly = sessionCoreToolPolicy?.applyPatchWorkspaceOnly ?? (workspaceOnly || applyPatchConfig?.workspaceOnly !== false);
	const applyPatchEnabled = !readOnly && applyPatchConfig?.enabled !== false && isApplyPatchAllowedForModel({
		modelProvider: options?.modelProvider,
		modelId: options?.modelId,
		allowModels: applyPatchConfig?.allowModels
	});
	const imageSanitization = resolveImageSanitizationLimits(options?.config);
	options?.recordToolPrepStage?.("workspace-policy");
	const { cleanupMs: cleanupMsOverride, ...execDefaults } = options?.exec ?? {};
	const effectiveExecPolicy = sessionPermissionPolicy ? resolveSessionPermissionExecPolicy(sessionPermissionPolicy, options?.exec) : applyExecPolicyLayer(execConfig, options?.exec);
	const scheduledExecTarget = options?.scheduledToolPolicy?.execTarget;
	const processToolAvailabilityRef = {};
	const coreTools = createCoreCodingTools({
		abortSignal: options?.abortSignal,
		codingRoot,
		containmentRoot,
		includeBaseCodingTools,
		includeShellTools,
		workspaceOnly,
		readOnly,
		sandbox,
		skillsSnapshot: options?.skillsSnapshot,
		skillInstructionPaths: options?.skillUsagePaths?.map((entry) => entry.readPath),
		skillInstructionDeliveryCache: options?.skillInstructionDeliveryCache,
		modelContextWindowTokens: options?.modelContextWindowTokens,
		imageSanitization,
		modelHasVision: options?.modelHasVision,
		memoryWriteProvenance,
		applyPatchEnabled,
		applyPatchWorkspaceOnly,
		execDefaults: {
			...execDefaults,
			bypassHostApprovalFloors: scheduledExecTarget?.ask !== "always" && sessionCoreToolPolicy?.bypassHostApprovalFloors && effectiveExecPolicy.security === "full",
			host: scheduledExecTarget?.host ?? options?.exec?.host ?? execConfig.host,
			mode: scheduledExecTarget?.ask ? void 0 : effectiveExecPolicy.mode,
			security: effectiveExecPolicy.security,
			ask: scheduledExecTarget?.ask ?? effectiveExecPolicy.ask,
			config: execRuntimeConfig,
			preparedRunEnvironment,
			reviewer: options?.exec?.reviewer ?? execConfig.reviewer,
			trigger: options?.trigger,
			node: options?.exec?.node ?? execConfig.node,
			pathPrepend: mergeGatewayAgentCliPath(options?.exec?.pathPrepend ?? execConfig.pathPrepend),
			safeBins: options?.exec?.safeBins ?? execConfig.safeBins,
			strictInlineEval: options?.exec?.strictInlineEval ?? execConfig.strictInlineEval,
			commandHighlighting: options?.exec?.commandHighlighting ?? execConfig.commandHighlighting,
			safeBinTrustedDirs: options?.exec?.safeBinTrustedDirs ?? execConfig.safeBinTrustedDirs,
			safeBinProfiles: options?.exec?.safeBinProfiles ?? execConfig.safeBinProfiles,
			agentId,
			processToolAvailabilityRef,
			scopeKey,
			sessionKey: options?.sessionKey,
			runId: options?.runId,
			operationalRunInstance: options?.operationalRunInstance,
			notifySessionKey: options?.runSessionKey ?? options?.sessionKey,
			sessionId: options?.sessionId,
			sessionStore: options?.config?.session?.store,
			mainKey: options?.config?.session?.mainKey,
			sessionScope: options?.config?.session?.scope,
			eventRouting: resolveEventSessionRoutingPolicy({
				cfg: options?.config,
				sessionKey: options?.runSessionKey ?? options?.sessionKey,
				channel: options?.messageProvider,
				accountId: options?.agentAccountId
			}),
			messageProvider: options?.messageProvider,
			currentChannelId: options?.currentChannelId,
			currentThreadTs: options?.currentThreadTs,
			channelContext: options?.channelContext,
			accountId: options?.agentAccountId,
			approvalReviewerDeviceId: options?.approvalReviewerDeviceId,
			nonInteractiveApproval: options?.swarmCollector,
			backgroundMs: options?.exec?.backgroundMs ?? execConfig.backgroundMs,
			timeoutSec: options?.exec?.timeoutSec ?? execConfig.timeoutSec,
			approvalRunningNoticeMs: options?.exec?.approvalRunningNoticeMs ?? execConfig.approvalRunningNoticeMs,
			notifyOnExit: options?.exec?.notifyOnExit ?? execConfig.notifyOnExit,
			notifyOnExitEmptySuccess: options?.exec?.notifyOnExitEmptySuccess ?? execConfig.notifyOnExitEmptySuccess
		},
		processDefaults: {
			cleanupMs: cleanupMsOverride ?? execConfig.cleanupMs,
			scopeKey
		},
		recordToolPrepStage: options?.recordToolPrepStage
	});
	const cronCreatorAuthorityResolver = bindActiveCronCreatorAuthorityResolver(options?.runId);
	const sharedCronPrincipal = cronManagementPrincipalFromTurn({ ...options, sandboxed: Boolean(sandbox) });
	const sharedCronManagementToolAvailable = Boolean(sharedCronPrincipal && readCronManagementPolicy()?.agents[executionAgentId]?.enabled === true);
	const ownerOnlyCoreToolDenylist = options?.senderIsOwner === false ? GATEWAY_OWNER_ONLY_CORE_TOOLS.filter((toolName) => toolName !== "automations" || !(cronCreatorAuthorityResolver || sharedCronManagementToolAvailable)) : [];
	const ownerOnlyCoreToolPolicy = ownerOnlyCoreToolDenylist.length > 0 ? { deny: ownerOnlyCoreToolDenylist } : void 0;
	const pluginToolAllowlist = appendRuntimePluginToolGrant(capabilityProfile.policy.explicitToolAllowlist, runtimePluginToolGrant);
	const pluginToolDenylist = [...capabilityProfile.policy.explicitToolDenylist, ...ownerOnlyCoreToolDenylist];
	const inheritedToolDenylist = [...pluginToolDenylist];
	const inheritedToolAllowlist = options?.inheritedToolAllowlistRef ?? [];
	const shouldInheritEffectiveToolAllowlist = capabilityProfile.policy.inheritancePolicies.some(hasRestrictiveAllowPolicy);
	const cronCreatorToolAllowlist = options?.cronCreatorToolAllowlistRef ?? [];
	const cronCreatorToolAllowlistCaptureRef = options?.cronCreatorToolAllowlistCaptureRef;
	const gatewayCaller = resolveScheduledToolCallerContext({
		scheduledToolPolicy: options?.scheduledToolPolicy,
		accountId: options?.agentAccountId,
		channel: resolveGatewayMessageChannel(options?.messageChannel ?? options?.messageProvider)
	});
	const toolCallerIdentity = options && executionAgentId && executionSessionKey?.trim() ? {
		agentId: executionAgentId,
		sessionKey: executionSessionKey.trim(),
		...options.abortSignal ? { approvalSignals: [options.abortSignal] } : {},
		turnSourceChannel: resolveGatewayMessageChannel(options.messageChannel ?? options.messageProvider),
		turnSourceTo: options.currentMessagingTarget ?? options.currentChannelId ?? options.messageTo,
		turnSourceAccountId: gatewayCaller.accountId,
		turnSourceThreadId: options.currentThreadTs ?? options.messageThreadId
	} : void 0;
	const pluginToolsOnly = filterToolsByClientCaps(includeOpenClawTools || !includePluginTools ? [] : resolveOpenClawPluginToolsForOptions({
		options: {
			agentSessionKey: options?.sessionKey,
			runSessionKey: options?.runSessionKey,
			runId: options?.runId,
			agentChannel: resolveGatewayMessageChannel(options?.messageChannel ?? options?.messageProvider),
			agentAccountId: options?.agentAccountId,
			agentTo: options?.messageTo,
			agentThreadId: options?.messageThreadId,
			nativeChannelId: options?.nativeChannelId,
			messageActionTurnCapability: options?.messageActionTurnCapability,
			agentDir: options?.agentDir,
			preparedModelRuntime: options?.preparedModelRuntime,
			workspaceDir: workspaceRoot,
			config: options?.config,
			fsPolicy,
			requesterSenderId: options?.senderId,
			senderIsOwner: options?.senderIsOwner,
			sessionId: options?.sessionId,
			conversationRecall: options?.conversationRecall,
			oneShotCliRun: options?.oneShotCliRun,
			sandboxBrowserBridgeUrl: sandbox?.browser?.bridgeUrl,
			allowHostBrowserControl: sandbox ? sandbox.browserAllowHostControl : true,
			sandboxed: Boolean(sandbox),
			pluginToolAllowlist,
			pluginToolDenylist,
			currentChannelId: options?.currentChannelId,
			currentMessagingTarget: options?.currentMessagingTarget,
			currentThreadTs: options?.currentThreadTs,
			currentMessageId: options?.currentMessageId,
			modelProvider: options?.modelProvider,
			modelId: options?.modelId,
			modelHasVision: options?.modelHasVision,
			requireExplicitMessageTarget: options?.requireExplicitMessageTarget,
			disableMessageTool: options?.disableMessageTool || options?.swarmCollector,
			requesterAgentIdOverride: executionAgentId,
			allowGatewaySubagentBinding: options?.allowGatewaySubagentBinding,
			clientCaps: options?.clientCaps,
			toolBindings: options?.toolBindings,
			authProfileStore: options?.authProfileStore
		},
		resolvedConfig: options?.config
	}), options?.clientCaps);
	const ringZeroTools = includeOpenClawTools ? getActiveAgentRingZeroTools() : [];
	const toolSearchTools = toolSearchControlsEnabled && ringZeroTools.length === 0 ? createToolSearchTools({
		config: options?.config,
		runtimeConfig: options?.config,
		agentId,
		sessionKey: options?.sessionKey,
		sessionId: options?.sessionId,
		runId: options?.runId,
		catalogRef: options?.toolSearchCatalogRef,
		abortSignal: options?.abortSignal,
		executeTool: options?.toolSearchCatalogExecutor
	}) : [];
	const tools = [
		...scheduledExecTarget ? coreTools.map((tool) => tool.name === "exec" ? copyAgentToolMetadata(tool, pinExecToolTarget(tool, scheduledExecTarget)) : tool) : coreTools,
		...includeChannelTools ? listChannelAgentTools({ cfg: options?.config }) : [],
		...includeOpenClawTools ? mergeAgentRingZeroTools(ringZeroTools, createOpenClawTools({
			...options?.systemAgentTool ? { systemAgentTool: options.systemAgentTool } : {},
			sandboxBrowserBridgeUrl: sandbox?.browser?.bridgeUrl,
			allowHostBrowserControl: sandbox ? sandbox.browserAllowHostControl : true,
			agentSessionKey: options?.sessionKey,
			runId: options?.runId,
			requesterThinkingLevel: options?.requesterThinkingLevel,
			sessionPermissionPolicy,
			execSession: sessionPermissionPolicy ? { permissionMode: sessionPermissionPolicy.mode } : void 0,
			execOverrides: {
				host: options?.exec?.host ?? execConfig.host,
				mode: effectiveExecPolicy.mode,
				security: effectiveExecPolicy.security,
				ask: effectiveExecPolicy.ask,
				node: options?.exec?.node ?? execConfig.node
			},
			approvalReviewerDeviceIds: options?.approvalReviewerDeviceId ? [options.approvalReviewerDeviceId] : void 0,
			runSessionKey: options?.runSessionKey,
			agentChannel: resolveGatewayMessageChannel(options?.messageChannel ?? options?.messageProvider),
			agentAccountId: options?.agentAccountId,
			gatewayCallerAccountId: gatewayCaller.accountId,
			gatewayCallerChannel: gatewayCaller.channel,
			gatewayCallerLocal: gatewayCaller.local,
			gatewayCallerScheduled: gatewayCaller.scheduled,
			agentTo: options?.messageTo,
			agentThreadId: options?.messageThreadId,
			nativeChannelId: options?.nativeChannelId,
			messageActionTurnCapability: options?.messageActionTurnCapability,
			agentGroupId: options?.groupId ?? null,
			agentGroupChannel: options?.groupChannel ?? null,
			agentGroupSpace: options?.groupSpace ?? null,
			agentMemberRoleIds: options?.memberRoleIds,
			agentDir: options?.agentDir,
			preparedModelRuntime: options?.preparedModelRuntime,
			sandboxRoot,
			sandboxContainerWorkdir: sandbox?.containerWorkdir,
			sandboxFsBridge,
			stagedMediaPaths: options?.stagedMediaPaths,
			sandboxWorkspaceMediaReadAllowed,
			fsPolicy,
			workspaceDir: workspaceRoot,
			spawnWorkspaceDir: capabilityProfile.workspace.spawnWorkspaceRoot,
			cwd: sandbox ? capabilityProfile.workspace.spawnWorkspaceRoot ?? runtimeRoot : runtimeRoot,
			sandboxed: Boolean(sandbox),
			config: options?.config,
			sessionConfigSource: options?.sessionConfigSource,
			webFetchHostnameAllowlistRef: options?.webFetchHostnameAllowlistRef,
			webSearchEnabled: options?.webSearchEnabled,
			clientCaps: options?.clientCaps,
			toolBindings: options?.toolBindings,
			pluginToolAllowlist,
			pluginToolDenylist,
			runtimeToolAllowlist: options?.runtimeToolAllowlist,
			githubPublicationAvailable: options?.githubPublicationAvailable,
			cronCreatorToolAllowlist,
			cronCreatorToolAllowlistCaptureRef,
			resolveCronCreatorToolAuthority: cronCreatorAuthorityResolver,
			cronCreatorAuthorityUnavailableReason: options?.cronCreatorAuthorityUnavailableReason,
			currentChannelId: options?.currentChannelId,
			currentChatType: options?.chatType,
			currentMessagingTarget: options?.currentMessagingTarget,
			currentThreadTs: options?.currentThreadTs,
			currentMessageId: options?.currentMessageId,
			currentInboundAudio: options?.currentInboundAudio,
			hasCurrentInboundAudio: options?.hasCurrentInboundAudio,
			modelProvider: options?.modelProvider,
			modelId: options?.modelId,
			modelContextWindowTokens: options?.modelContextWindowTokens,
			skillWorkshop: options?.skillWorkshop,
			replyToMode: options?.replyToMode,
			hasRepliedRef: options?.hasRepliedRef,
			modelHasVision: options?.modelHasVision,
			computerContextEpoch: options?.computerContextEpoch,
			computerTransport: resolveSessionPlacementComputer(options?.operationalRunInstance),
			registerRunCleanup: options?.registerRunCleanup,
			requireExplicitMessageTarget: options?.requireExplicitMessageTarget,
			sourceReplyDeliveryMode: options?.sourceReplyDeliveryMode,
			sourceReplyOnly,
			taskSuggestionDeliveryMode: options?.taskSuggestionDeliveryMode,
			inboundEventKind: options?.inboundEventKind,
			disableMessageTool: options?.disableMessageTool || options?.swarmCollector,
			swarmCollector: options?.swarmCollector,
			swarmOutputSchema: options?.swarmOutputSchema,
			enableHeartbeatTool,
			disablePluginTools: !includePluginTools,
			wrapBeforeToolCallHook: false,
			...cronSelfRemoveOnlyJobId ? { cronSelfRemoveOnlyJobId } : {},
			requesterAgentIdOverride: executionAgentId,
			requesterSenderId: options?.senderId,
			senderIsOwner: options?.senderIsOwner,
			authProfileStore: options?.authProfileStore,
			sessionId: options?.sessionId,
			conversationRecall: options?.conversationRecall,
			oneShotCliRun: options?.oneShotCliRun,
			inheritedToolAllowlist,
			inheritedToolDenylist,
			onYield: options?.onYield,
			claimYieldCompletion: options?.claimYieldCompletion,
			allowGatewaySubagentBinding: options?.allowGatewaySubagentBinding,
			recordToolPrepStage: options?.recordToolPrepStage
		})) : pluginToolsOnly,
		...toolSearchTools
	];
	options?.recordToolPrepStage?.("openclaw-tools");
	const swarmStructuredOutputTool = options?.swarmCollector && options.swarmOutputSchema ? tools.find((tool) => tool.name === "structured_output") : void 0;
	const toolsForMemoryFlush = isMemoryFlushRun && memoryFlushWritePath ? [] : tools;
	if (isMemoryFlushRun && memoryFlushWritePath) for (const tool of tools) {
		if (!MEMORY_FLUSH_ALLOWED_TOOL_NAMES.has(tool.name)) continue;
		if (tool.name === "write") {
			toolsForMemoryFlush.push(wrapToolMemoryFlushAppendOnlyWrite(tool, {
				root: memoryFlushWriteRoot,
				relativePath: memoryFlushWritePath,
				memoryWriteProvenance,
				containerWorkdir: sandbox?.containerWorkdir,
				sandbox: sandboxRoot && sandboxFsBridge ? {
					root: sandboxRoot,
					bridge: sandboxFsBridge
				} : void 0
			}));
			continue;
		}
		toolsForMemoryFlush.push(tool);
	}
	const unavailableCoreToolReason = isMemoryFlushRun && memoryFlushWritePath ? "memory-triggered compaction runs expose only read and append-only write" : void 0;
	const toolsForMessageProvider = filterToolsByMessageProvider(toolsForMemoryFlush, options?.toolPolicyMessageProvider ?? options?.messageProvider);
	options?.recordToolPrepStage?.("message-provider-policy");
	const toolsForModelProvider = applyModelProviderToolPolicy(toolsForMessageProvider, {
		config: options?.config,
		modelProvider: options?.modelProvider,
		modelApi: options?.modelApi,
		modelId: options?.modelId,
		agentId,
		sessionKey: options?.sessionKey,
		agentDir: options?.agentDir,
		modelCompat: options?.modelCompat,
		suppressManagedWebSearch: options?.suppressManagedWebSearch,
		runtimeToolAllowlist: options?.runtimeToolAllowlist,
		localModelLeanPreserveToolNames
	});
	options?.recordToolPrepStage?.("model-provider-policy");
	const subagentFiltered = applyToolPolicyPipeline({
		tools: toolsForModelProvider,
		toolMeta: (tool) => getPluginToolMeta(tool),
		warn: logWarn,
		steps: buildConversationToolPolicyPipelineSteps({
			capabilityProfile,
			policies: conversationToolPolicies,
			additionalStepsAfterSandbox: [{
				policy: ownerOnlyCoreToolPolicy,
				label: "gateway sender owner-only tools",
				unavailableCoreToolReason
			}],
			includeRuntimeToolPolicy: true,
			unavailableCoreToolReason
		}),
		declaredToolAllowlist: buildDeclaredToolAllowlistContext({
			config: options?.config,
			metadataSnapshot: options?.preparedModelRuntime?.metadataSnapshot,
			workspaceDir: workspaceRoot,
			toolDenylist: pluginToolDenylist
		})
	});
	const authorizedTools = applyDelegationCapability(mergeAgentRingZeroTools(ringZeroTools, subagentFiltered), options?.delegationCapability).filter((tool) => !options?.swarmCollector || tool.name !== "ask_user" && tool.name !== "sessions_send" && tool.name !== "sessions_yield");
	if (swarmStructuredOutputTool && !authorizedTools.some((tool) => tool.name === swarmStructuredOutputTool.name)) authorizedTools.push(swarmStructuredOutputTool);
	authorizedTools.forEach(bindAssembledAgentToolActionDescriptor);
	processToolAvailabilityRef.value = authorizedTools.some((tool) => tool.name === "process");
	if (shouldInheritEffectiveToolAllowlist) replaceWithEffectiveToolAllowlist(inheritedToolAllowlist, authorizedTools);
	replaceWithEffectiveCronCreatorToolAllowlist(cronCreatorToolAllowlist, authorizedTools, (tool) => getPluginToolMeta(tool));
	options?.recordToolPrepStage?.("authorization-policy");
	const turnSourceChannel = options?.messageChannel ?? options?.messageProvider;
	const turnSourceTo = options?.currentMessagingTarget ?? options?.currentChannelId;
	const requester = {
		...turnSourceChannel ? { channel: turnSourceChannel } : {},
		...options?.agentAccountId ? { accountId: options.agentAccountId } : {},
		...options?.senderId ? { senderId: options.senderId } : {},
		...options?.senderIsOwner !== void 0 ? { senderIsOwner: options.senderIsOwner } : {},
		...options?.memberRoleIds?.length ? { roleIds: [...options.memberRoleIds] } : {}
	};
	const hasRequester = Object.keys(requester).length > 0;
	const hookContext = {
		agentId: executionAgentId,
		...options?.config ? { config: options.config } : {},
		cwd: codingRoot,
		workspaceDir: workspaceRoot,
		...options?.skillsSnapshot ? { skillsSnapshot: options.skillsSnapshot } : {},
		...options?.skillUsagePaths ? { skillUsagePaths: options.skillUsagePaths } : {},
		...sandboxRoot && sandboxFsBridge && allowWorkspaceWrites ? { sandbox: {
			root: sandboxRoot,
			bridge: sandboxFsBridge
		} } : {},
		sessionKey: executionSessionKey,
		sessionId: options?.sessionId,
		runId: options?.runId,
		trigger: options?.trigger,
		approvalReviewerDeviceId: options?.approvalReviewerDeviceId,
		channelId: options?.hookChannelId ?? options?.currentChannelId,
		...hasRequester ? { requester } : {},
		...turnSourceChannel ? { turnSourceChannel } : {},
		...turnSourceTo ? { turnSourceTo } : {},
		...options?.agentAccountId ? { turnSourceAccountId: options.agentAccountId } : {},
		...options?.currentThreadTs ? { turnSourceThreadId: options.currentThreadTs } : {},
		...options?.trace ? { trace: options.trace } : {},
		loopDetection: resolveToolLoopDetectionConfig({
			cfg: options?.config,
			agentId
		}),
		onToolOutcome: options?.onToolOutcome,
		allocateToolOutcomeOrdinal: options?.allocateToolOutcomeOrdinal
	};
	return finalizeAgentTools({
		tools: authorizedTools,
		modelProvider: options?.modelProvider,
		modelId: options?.modelId,
		modelCompat: options?.modelCompat,
		hookContext,
		wrapBeforeToolCallHook: options?.wrapBeforeToolCallHook,
		emitBeforeToolCallDiagnostics: options?.emitBeforeToolCallDiagnostics,
		...options?.swarmCollector ? { approvalMode: "deny" } : {},
		abortSignal: options?.abortSignal,
		agentId: executionAgentId,
		recordToolPrepStage: options?.recordToolPrepStage
	}).map((tool) => wrapToolWithGatewayCallerIdentity(tool, toolCallerIdentity));
}
/** Build the runtime tool list exposed through the public agent harness SDK. */
function createOpenClawCodingTools(options) {
	return createOpenClawCodingToolsInternal(options);
}
//#endregion
export { filterToolsByMessageProvider as i, applyDelegationCapability as n, resolveDelegationCapability as r, createOpenClawCodingTools as t };
