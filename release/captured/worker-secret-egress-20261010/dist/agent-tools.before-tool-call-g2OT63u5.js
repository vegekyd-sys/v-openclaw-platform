// v-voice-spoken-confirmation-switch-v1: off unless OPENCLAW_VOICE_SPOKEN_CONFIRMATION=1
// gpt-live-client-voice-confirmation-v1: durable exact-scope host grant
import { a as addTimerTimeoutGraceMs } from "./number-coercion-CLj0HTDM.js";
import { r as asNullableRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { a as createLazyRuntimeSurface, i as createLazyRuntimeNamedExport } from "./lazy-runtime-CgCh8H_K.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { t as isPlainObject } from "./plain-object-5a0EzLzX.js";
import { m as redactToolDetail } from "./redact-Df68iObN.js";
import "./utils-D3A1hGii.js";
import { t as pruneMapToMaxSize } from "./map-size-CNcWiFKu.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { C as createChildDiagnosticTraceContext, D as freezeDiagnosticTraceContext, _ as onTrustedToolExecutionEvent, c as emitTrustedSecurityEvent, g as onTrustedInternalDiagnosticEvent, l as emitTrustedSkillUsedDiagnosticEvent, o as emitTrustedDiagnosticEvent, s as emitTrustedDiagnosticEventWithPrivateData } from "./diagnostic-events-D_BPObBj.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { Et as array, Rn as string, Zn as unknown, dn as literal, fn as looseObject, wn as number, yt as _enum } from "./schemas-zxit8y5H.js";
import "./automations-tool-name-DBMZPbPL.js";
import { c as normalizeToolPolicyName } from "./tool-policy-shared-D_3SrG-g.js";
import "./tool-policy-De2653Mj.js";
import "./config-Cv60gBux.js";
import { t as logDebug } from "./logger-dgyRJ-bX.js";
import "./client-D8eBb67K.js";
import { t as GatewayClientRequestError } from "./request-error-BSFClQsA.js";
import { t as notifyListeners } from "./listeners-BogSNJ-R.js";
import { d as getActivePluginRegistry } from "./runtime-MupoouIC.js";
import { g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { C as createPluginToolMatcherScope, E as pluginToolMatcherCoversTool, S as getGlobalHookRunnerRegistry, T as normalizePluginToolMatcher, g as cloneHookIsolationValue, t as getGlobalHookRunner } from "./hook-runner-global-DLqoAE5f.js";
import { a as attachInternalToolExecutionPreparer, n as appendToolLoopWarning } from "./internal-hooks-CiSltLvS.js";
import { a as getCodeModeExecBeforeHookMetadata, d as reconcileCodeModeExecBeforeHookParams, o as getCodeModeExecBeforeHookMetadataForToolKind, u as normalizeCodeModeExecBeforeHookParams } from "./code-mode-control-tools-E097WPds.js";
import { t as canonicalizePath } from "./paths-CIwQeLl6.js";
import { f as loadSessionEntryReadOnly, p as patchSessionEntryCore } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { n as buildSessionCreationStamp } from "./session-entry-provenance-Ch9ZRplR.js";
import { r as mergeSessionEntry } from "./types-BHV0IaPK.js";
import { _t as appendTranscriptMessage } from "./session-accessor-K0XuW6ln.js";
import { m as resolveAgentRunAbortLifecycleFields } from "./run-termination-Ts9RsbeN.js";
import { n as extractResolvedApplyPatchTargetPaths } from "./apply-patch-paths-YyTqOxC_.js";
import { r as getPluginToolMeta } from "./tool-metadata-B4LwDu-h.js";
import { _ as getBeforeToolCallSourceTool, c as getChannelAgentToolMeta, d as BEFORE_TOOL_CALL_HOOK_CONTEXT, f as BEFORE_TOOL_CALL_SOURCE_TOOL, g as getBeforeToolCallHookContext, h as getBeforeToolCallDiagnosticOptions, i as copyBeforeToolCallWrapperMetadata, m as clearBeforeToolCallWrappedMarker, o as getToolTerminalPresentation, p as BEFORE_TOOL_CALL_WRAPPED, r as copyAgentToolMetadata, u as BEFORE_TOOL_CALL_DIAGNOSTIC_OPTIONS } from "./agent-tool-metadata-CkrU8K-F.js";
import { i as withGatewayToolApprovalOwner, r as getGatewayToolCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";
import { i as diagnosticHttpStatusCode, t as diagnosticErrorCategory } from "./diagnostic-error-metadata-qnHBNuqn.js";
import { n as resolveDiagnosticModelContentCapturePolicy, t as cloneDiagnosticContentValue } from "./diagnostic-llm-content-CAc71KJ1.js";
import { n as resolveSkillTelemetrySource, r as resolveSkillTelemetrySourceValue } from "./source-0ivX3dtK.js";
import { n as recordGenericToolActionDecision, o as normalizeFileToolPathParam, r as runWithGenericToolActionDecision } from "./agent-tools.before-tool-call.decision-is7VdQQC.js";
import { a as protectNetworkToolExecutionError, c as registerTrustedToolNoStartError, i as isTrustedToolExecutionPreflightError, l as resolveToolExecutionErrorKind, n as formatToolExecutionErrorMessage, u as resolveToolResultFailureKind } from "./tool-result-error-d_ya2-bv.js";
import { t as sanitizeApprovalScope } from "./approval-scope-Csp4HrX9.js";
import { n as DEFAULT_PLUGIN_APPROVAL_TIMEOUT_MS, r as MAX_PLUGIN_APPROVAL_TIMEOUT_MS } from "./plugin-approvals-Bf5zU0Du.js";
import { t as resolveCanonicalPluginApprovalRequestAllowedDecisions } from "./plugin-approval-canonical-decisions-B5d_jVDB.js";
import { i as resolveApprovalInitiatingSurfaceState, n as describeNativePluginApprovalClientSetup } from "./exec-approval-surface-DywFK2BJ.js";
import { t as resolveSkillWorkshopConfig } from "./config-Cjp42tXL.js";
import { t as callGatewayTool } from "./gateway-DVu5Urba.js";
import { r as getPluginSessionExtensionStateSync } from "./host-hook-state-CqMIyt2W.js";
import { t as buildToolMutationState } from "./tool-mutation-7Z6dWuA8.js";
import { t as buildOutboundSessionContext } from "./session-context-ZrdC3CLh.js";
import { t as resolveSessionDeliveryTarget } from "./targets-session-FdeHAIqV.js";
import { t as BoundedSerialQueue } from "./bounded-serial-queue-Dyfy2RP0.js";
import { n as hashToolCall } from "./tool-loop-detection-DDziM3KH.js";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
//#region src/plugins/hook-before-tool-call-result.ts
const PluginApprovalResolutions = {
	ALLOW_ONCE: "allow-once",
	ALLOW_ALWAYS: "allow-always",
	DENY: "deny",
	TIMEOUT: "timeout",
	CANCELLED: "cancelled"
};
//#endregion
//#region src/agents/agent-tools.before-tool-call.state.ts
/**
* Shared before_tool_call state for adjusted tool params.
* The adapter and wrapper both consult this map so later execution can use the
* normalized payload selected by hook processing.
*/
const adjustedParamsByToolCallId = /* @__PURE__ */ new Map();
const preExecutionBlockedToolCallIds = /* @__PURE__ */ new Set();
const structuredReplaySafeToolCallIds = /* @__PURE__ */ new Set();
const startedToolCallIds = /* @__PURE__ */ new Set();
const trackedToolCallIds = /* @__PURE__ */ new Set();
const batchAdmittedToolCallIds = /* @__PURE__ */ new Set();
function buildAdjustedParamsKey(params) {
	if (params.runId && params.runId.trim()) return `${params.runId}:${params.toolCallId}`;
	return params.toolCallId;
}
/** Consume and remove hook-adjusted params for a completed tool call. */
function consumeAdjustedParamsForToolCall(toolCallId, runId) {
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	const params = adjustedParamsByToolCallId.get(key);
	adjustedParamsByToolCallId.delete(key);
	return params;
}
/** Snapshot hook-adjusted params without consuming later outcome bookkeeping. */
function peekAdjustedParamsForToolCall(toolCallId, runId) {
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	const params = adjustedParamsByToolCallId.get(key);
	return params === void 0 ? void 0 : structuredClone(params);
}
/** Consume whether policy prevented the target tool from starting. */
function consumePreExecutionBlockedToolCall(toolCallId, runId) {
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	const blocked = preExecutionBlockedToolCallIds.has(key);
	preExecutionBlockedToolCallIds.delete(key);
	return blocked;
}
/** Snapshot whether policy prevented execution without stealing cleanup from the tool owner. */
function peekPreExecutionBlockedToolCall(toolCallId, runId) {
	return preExecutionBlockedToolCallIds.has(buildAdjustedParamsKey({
		runId,
		toolCallId
	}));
}
/** Record active wrapper ownership so a racing timeout can inspect the boundary. */
function recordToolExecutionTracked(toolCallId, runId) {
	trackedToolCallIds.add(buildAdjustedParamsKey({
		runId,
		toolCallId
	}));
}
function recordToolExecutionStarted(toolCallId, runId) {
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	trackedToolCallIds.add(key);
	startedToolCallIds.add(key);
}
/** Release execution-boundary evidence when the wrapped invocation settles. */
function clearTrackedToolExecution(toolCallId, runId) {
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	trackedToolCallIds.delete(key);
	startedToolCallIds.delete(key);
}
/**
* Consume exact in-flight execution state. Undefined means the wrapper already
* settled or the producer does not participate in OpenClaw boundary tracking.
*/
function consumeTrackedToolExecutionStarted(toolCallId, runId) {
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	const tracked = trackedToolCallIds.has(key);
	const started = startedToolCallIds.has(key);
	clearTrackedToolExecution(toolCallId, runId);
	return tracked ? started : void 0;
}
function recordStructuredReplaySafeToolCall(toolCallId, runId) {
	structuredReplaySafeToolCallIds.add(buildAdjustedParamsKey({
		runId,
		toolCallId
	}));
}
function consumeStructuredReplaySafeToolCall(toolCallId, runId) {
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	const replaySafe = structuredReplaySafeToolCallIds.has(key);
	structuredReplaySafeToolCallIds.delete(key);
	return replaySafe;
}
/** Mark a call whose loop policy was already admitted with its whole assistant batch. */
function recordBatchAdmittedToolCall(toolCallId, runId) {
	batchAdmittedToolCallIds.add(buildAdjustedParamsKey({
		runId,
		toolCallId
	}));
}
/** Consume whole-batch loop admission while leaving the remaining tool policies intact. */
function consumeBatchAdmittedToolCall(toolCallId, runId) {
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	const admitted = batchAdmittedToolCallIds.has(key);
	batchAdmittedToolCallIds.delete(key);
	return admitted;
}
/** Release exact batch-admission markers for prepared calls suppressed by steering. */
function releaseBatchAdmittedToolCalls(toolCallIds, runId) {
	for (const toolCallId of toolCallIds) batchAdmittedToolCallIds.delete(buildAdjustedParamsKey({
		runId,
		toolCallId
	}));
}
/** Remove unused batch-admission markers when their embedded run ends. */
function clearBatchAdmittedToolCallsForRun(runId) {
	const prefix = `${runId}:`;
	for (const key of batchAdmittedToolCallIds) if (key.startsWith(prefix)) batchAdmittedToolCallIds.delete(key);
}
//#endregion
//#region src/agents/agent-tools.before-tool-call.diagnostics.ts
/**
* Diagnostics, skill telemetry, terminal presentation, and loop outcomes for
* before_tool_call execution.
*/
const beforeToolCallLog = createSubsystemLogger("agents/tools");
const log$1 = beforeToolCallLog;
const MAX_PENDING_TERMINAL_PRESENTATIONS = 1024;
const LOOP_WARNING_BUCKET_SIZE = 10;
const MAX_LOOP_WARNING_KEYS = 256;
const MAX_TERMINAL_PRESENTATION_CHARS = 2e3;
const pendingTerminalPresentationByToolCall = /* @__PURE__ */ new Map();
function prepareToolTerminalPresentation({ ctx, tool, toolParams, toolCallId, toolCallOrdinal }) {
	const toolName = tool.name;
	const observer = toolCallId ? ctx?.onToolOutcome : void 0;
	const formatter = getToolTerminalPresentation(getBeforeToolCallSourceTool(tool) ?? tool);
	if (!formatter && !observer) return;
	let project;
	if (formatter) {
		const formatterParams = observer ? structuredClone(toolParams) : toolParams;
		project = (result) => {
			try {
				const text = formatter(formatterParams, result)?.text.trim();
				return text ? truncateUtf16Safe(redactToolDetail(text), MAX_TERMINAL_PRESENTATION_CHARS) : void 0;
			} catch (err) {
				log$1.warn(`terminal tool presentation failed: tool=${toolName || "tool"} error=${String(err)}`);
				return;
			}
		};
	}
	return {
		observer,
		toolName,
		project,
		toolCallOrdinal
	};
}
function rememberPendingTerminalPresentation(prepared, runId, toolCallId) {
	if (!prepared?.observer || !toolCallId) return;
	const key = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	pendingTerminalPresentationByToolCall.set(key, prepared);
	pruneMapToMaxSize(pendingTerminalPresentationByToolCall, MAX_PENDING_TERMINAL_PRESENTATIONS);
}
/** Finalizes a trusted terminal summary after harness result middleware. */
function finalizeToolTerminalPresentation(params) {
	const key = buildAdjustedParamsKey({
		runId: params.runId,
		toolCallId: params.toolCallId
	});
	const pending = pendingTerminalPresentationByToolCall.get(key);
	pendingTerminalPresentationByToolCall.delete(key);
	const observer = pending?.observer ?? params.observer;
	if (!observer) return;
	const toolCallOrdinal = pending?.toolCallOrdinal ?? params.toolCallOrdinal;
	observer({
		toolName: pending?.toolName || params.toolName || "tool",
		argsHash: "",
		resultHash: "",
		...toolCallOrdinal !== void 0 ? { toolCallOrdinal } : {},
		terminalPresentation: params.isError ? void 0 : pending?.project?.(params.result),
		presentationOnly: true
	});
}
/**
* Error used when before_tool_call intentionally vetoes a tool call.
*/
const loadBeforeToolCallRuntime = createLazyRuntimeSurface(() => import("./agent-tools.before-tool-call.runtime.js"), ({ beforeToolCallRuntime }) => beforeToolCallRuntime);
function unwrapErrorCause(err) {
	try {
		if (!(err instanceof Error)) return err;
		const cause = Object.getOwnPropertyDescriptor(err, "cause");
		if (cause && "value" in cause && cause.value !== void 0) return cause.value;
	} catch {
		return err;
	}
	return err;
}
function resolveToolErrorDiagnostic(err, signal, errorCategory) {
	const cause = unwrapErrorCause(err);
	const errorCode = diagnosticHttpStatusCode(cause);
	const abortFields = resolveAgentRunAbortLifecycleFields(signal);
	const terminalReason = !abortFields.aborted ? resolveToolExecutionErrorKind(cause) : abortFields.stopReason === "timeout" ? "timed_out" : "cancelled";
	return {
		errorCategory: terminalReason === "cancelled" ? "aborted" : errorCategory ?? diagnosticErrorCategory(cause),
		terminalReason,
		...errorCode ? { errorCode } : {}
	};
}
function resolveToolResultTerminalDiagnostic(result, durationMs) {
	const failureKind = resolveToolResultFailureKind(result);
	if (!failureKind) return {
		type: "tool.execution.completed",
		durationMs
	};
	if (failureKind === "blocked") return {
		type: "tool.execution.blocked",
		deniedReason: "tool_result_blocked",
		reason: "tool_result_blocked"
	};
	return {
		type: "tool.execution.error",
		durationMs,
		errorCategory: "tool_result_error",
		terminalReason: failureKind
	};
}
function resolveToolDiagnosticIdentity(tool) {
	const pluginMeta = getPluginToolMeta(tool);
	if (pluginMeta) return pluginMeta.pluginId === "bundle-mcp" ? {
		toolSource: "mcp",
		toolOwner: pluginMeta.pluginId
	} : {
		toolSource: "plugin",
		toolOwner: pluginMeta.pluginId
	};
	const channelMeta = getChannelAgentToolMeta(tool);
	if (channelMeta) return {
		toolSource: "channel",
		toolOwner: channelMeta.channelId
	};
	return { toolSource: "core" };
}
function canonicalSkillFile(value) {
	const skillFile = value?.trim();
	return skillFile && path.isAbsolute(skillFile) ? canonicalizePath(path.resolve(skillFile)) : void 0;
}
function resolvedSkillUsageMatch(params) {
	const skillFile = canonicalSkillFile(params.skill.filePath);
	return {
		skillName: params.skill.name.trim(),
		skillSource: resolveSkillTelemetrySource(params.skill),
		activation: params.activation,
		...skillFile ? { skillFile } : {}
	};
}
function findResolvedSkillUsageMatch(params) {
	const skillName = params.skillName.trim();
	const candidates = (params.snapshot?.resolvedSkills ?? []).filter((skill) => skill.name.trim() === skillName);
	const skill = candidates.find((candidate) => resolveSkillTelemetrySource(candidate) === params.skillSource) ?? (candidates.length === 1 ? candidates[0] : void 0);
	return skill ? resolvedSkillUsageMatch({
		activation: params.activation,
		skill
	}) : void 0;
}
function resolveRelativeToolPath(candidate, ctx) {
	const trimmed = candidate.trim();
	if (!trimmed) return;
	if (trimmed.startsWith("node://")) return trimmed;
	if (trimmed === "~") return os.homedir();
	if (trimmed.startsWith("~/")) return path.resolve(os.homedir(), trimmed.slice(2));
	if (path.isAbsolute(trimmed)) return path.resolve(trimmed);
	const base = ctx?.workspaceDir ?? ctx?.cwd;
	return base ? path.resolve(base, trimmed) : void 0;
}
function readToolPathCandidate(params, ctx) {
	return isPlainObject(params) && typeof params.path === "string" ? resolveRelativeToolPath(normalizeFileToolPathParam(params.path), ctx) : void 0;
}
function findSkillInstructionMatch(snapshot, candidate) {
	const skill = snapshot.resolvedSkills?.findLast((entry) => {
		if (typeof entry.name !== "string" || !entry.name.trim()) return false;
		const filePath = typeof entry.filePath === "string" ? entry.filePath.trim() : "";
		const baseDir = typeof entry.baseDir === "string" ? entry.baseDir.trim() : "";
		return filePath && (filePath.startsWith("node://") ? filePath === candidate : path.isAbsolute(filePath) && path.resolve(filePath) === candidate) || baseDir && path.isAbsolute(baseDir) && path.resolve(baseDir, "SKILL.md") === candidate;
	});
	return skill ? resolvedSkillUsageMatch({
		activation: "read",
		skill
	}) : void 0;
}
function findSkillUsageMatch(params) {
	const command = params.ctx?.skillCommand;
	if (command) {
		const commandToolName = normalizeToolPolicyName(command.toolName ?? params.toolName);
		if (!commandToolName || commandToolName === params.toolName) {
			const skillSource = resolveSkillTelemetrySourceValue(command.skillSource);
			const snapshotMatch = findResolvedSkillUsageMatch({
				activation: "command",
				skillName: command.skillName,
				skillSource,
				snapshot: params.ctx?.skillsSnapshot
			});
			const skillFile = canonicalSkillFile(command.skillFile) ?? snapshotMatch?.skillFile;
			return {
				skillName: command.skillName,
				skillSource,
				activation: "command",
				...skillFile ? { skillFile } : {}
			};
		}
	}
	if (params.toolName !== "read") return;
	const candidate = readToolPathCandidate(params.toolParams, params.ctx);
	if (!candidate) return;
	if (params.ctx?.skillsSnapshot?.resolvedSkills?.length) return findSkillInstructionMatch(params.ctx.skillsSnapshot, candidate);
	const match = params.ctx?.skillUsagePaths?.findLast((entry) => path.resolve(entry.readPath) === candidate);
	return match ? {
		skillFile: match.skillFile,
		skillName: match.skillName,
		skillSource: match.skillSource,
		activation: "read"
	} : void 0;
}
function emitSkillUsedDiagnostic(params) {
	const trace = params.ctx?.trace ? freezeDiagnosticTraceContext(createChildDiagnosticTraceContext(params.ctx.trace)) : void 0;
	emitTrustedSkillUsedDiagnosticEvent({
		type: "skill.used",
		...params.ctx?.runId && { runId: params.ctx.runId },
		...params.ctx?.sessionKey && { sessionKey: params.ctx.sessionKey },
		...params.ctx?.sessionId && { sessionId: params.ctx.sessionId },
		...params.ctx?.agentId && { agentId: params.ctx.agentId },
		...trace && { trace },
		skillName: params.match.skillName,
		skillSource: params.match.skillSource,
		activation: params.match.activation,
		toolName: params.toolName,
		...params.toolCallId && { toolCallId: params.toolCallId }
	}, params.match.skillFile ? { skillUsage: { skillFile: params.match.skillFile } } : void 0);
}
function emitToolBlockedSecurityEvent(params) {
	const control = params.deniedReason === "client-voice-confirmation" ? {
		policyId: "talk-client-voice-confirmation",
		controlId: "talk-client-voice-confirmation",
		family: "approval"
	} : params.deniedReason === "tool-loop" ? {
		policyId: "tool-loop-detection",
		controlId: "tool-loop-detection",
		family: "authorization"
	} : params.deniedReason === "plugin-approval" ? {
		policyId: "plugin-tool-approval",
		controlId: "plugin-tool-approval",
		family: "approval"
	} : {
		policyId: "plugin-before-tool-call",
		controlId: "before-tool-call",
		family: "approval"
	};
	emitTrustedSecurityEvent({
		category: "tool",
		action: "tool.execution.blocked",
		outcome: "denied",
		severity: "medium",
		reason: params.deniedReason,
		...params.trace ? { trace: params.trace } : {},
		actor: { kind: "agent" },
		target: {
			kind: "tool",
			name: params.toolName,
			...params.toolIdentity.toolOwner ? { owner: params.toolIdentity.toolOwner } : {}
		},
		policy: {
			id: control.policyId,
			decision: "deny",
			reason: params.deniedReason
		},
		control: {
			id: control.controlId,
			family: control.family
		},
		attributes: {
			tool_source: params.toolIdentity.toolSource,
			...params.paramsSummary ? { params_kind: params.paramsSummary.kind } : {}
		}
	});
}
function buildToolContentPrivateData(policy, args) {
	if (!policy.toolInputs && !policy.toolOutputs) return;
	const toolContent = {};
	if (policy.toolInputs) toolContent.toolInput = cloneDiagnosticContentValue(args.input);
	if (args.includeOutput && policy.toolOutputs) toolContent.toolOutput = cloneDiagnosticContentValue(args.output);
	return Object.keys(toolContent).length > 0 ? { toolContent } : void 0;
}
function summarizeToolParams(params) {
	if (params === null) return { kind: "null" };
	if (params === void 0) return { kind: "undefined" };
	if (Array.isArray(params)) return {
		kind: "array",
		length: params.length
	};
	if (typeof params === "object") return { kind: "object" };
	if (typeof params === "string") return {
		kind: "string",
		length: params.length
	};
	if (typeof params === "number") return { kind: "number" };
	if (typeof params === "boolean") return { kind: "boolean" };
	return { kind: "other" };
}
function shouldEmitLoopWarning(state, warningKey, count) {
	if (!state.toolLoopWarningBuckets) state.toolLoopWarningBuckets = /* @__PURE__ */ new Map();
	const bucket = Math.floor(count / LOOP_WARNING_BUCKET_SIZE);
	if (bucket <= (state.toolLoopWarningBuckets.get(warningKey) ?? 0)) return false;
	state.toolLoopWarningBuckets.set(warningKey, bucket);
	pruneMapToMaxSize(state.toolLoopWarningBuckets, MAX_LOOP_WARNING_KEYS);
	return true;
}
/** Reconcile loop liveness with the final post-policy arguments before execution. */
async function reconcileLoopCallExecutionParams(args) {
	if (!args.ctx?.sessionKey && !args.ctx?.sessionId || args.ctx.loopDetection?.enabled !== true) return;
	try {
		const { getDiagnosticSessionState, markDiagnosticArgumentChurnObservation, reconcileToolCallExecutionParams, resolveToolLoopWarningThreshold } = await loadBeforeToolCallRuntime();
		const churn = reconcileToolCallExecutionParams(getDiagnosticSessionState({
			sessionKey: args.ctx.sessionKey,
			sessionId: args.ctx.sessionId
		}), {
			toolName: args.toolName,
			toolParams: args.toolParams,
			toolCallId: args.toolCallId,
			runId: args.ctx.runId,
			warningThreshold: resolveToolLoopWarningThreshold()
		});
		markDiagnosticArgumentChurnObservation({
			sessionKey: args.ctx.sessionKey,
			sessionId: args.ctx.sessionId,
			runId: args.ctx.runId,
			active: churn.active
		});
	} catch (err) {
		log$1.warn(`tool loop execution-param reconciliation failed: tool=${args.toolName} error=${String(err)}`);
	}
}
async function recordLoopOutcome(args) {
	if (!args.ctx?.sessionKey && !args.ctx?.sessionId) return;
	let recordedOutcome;
	try {
		const { getArgumentChurnNoProgressStreak, getDiagnosticSessionState, markDiagnosticArgumentChurnObservation, recordToolCallOutcome } = await loadBeforeToolCallRuntime();
		const sessionState = getDiagnosticSessionState({
			sessionKey: args.ctx.sessionKey,
			sessionId: args.ctx.sessionId
		});
		const record = recordToolCallOutcome(sessionState, {
			toolName: args.toolName,
			toolParams: args.toolParams,
			toolCallId: args.toolCallId,
			result: args.result,
			error: args.error,
			config: args.ctx.loopDetection,
			...args.ctx.runId && { runId: args.ctx.runId }
		});
		const churnContinues = record !== void 0 && getArgumentChurnNoProgressStreak((sessionState.toolCallHistory ?? []).filter((call) => call.runId === record.runId), record.toolName, record.argsHash).count > 0;
		markDiagnosticArgumentChurnObservation({
			sessionKey: args.ctx.sessionKey,
			sessionId: args.ctx.sessionId,
			runId: args.ctx.runId,
			active: churnContinues,
			existingOnly: true
		});
		if (record?.resultHash && args.ctx.onToolOutcome) recordedOutcome = {
			toolName: record.toolName,
			argsHash: record.argsHash,
			resultHash: record.resultHash,
			...args.resultContentSource ? { resultContentSource: args.resultContentSource } : {},
			...args.toolCallOrdinal !== void 0 ? { toolCallOrdinal: args.toolCallOrdinal } : {},
			...args.terminalPresentation ? { terminalPresentation: args.terminalPresentation } : {}
		};
	} catch (err) {
		log$1.warn(`tool loop outcome tracking failed: tool=${args.toolName} error=${String(err)}`);
	}
	if (recordedOutcome) args.ctx.onToolOutcome?.(recordedOutcome);
}
/** Run the full before_tool_call policy chain for a pending tool call. */
//#endregion
//#region src/infra/embedded-mode.ts
let embeddedModeValue = false;
/** Sets the process-local embedded-mode flag used by UI and hosted runtimes. */
function setEmbeddedMode(value) {
	embeddedModeValue = value;
}
/** Returns whether the current process is running inside an embedded OpenClaw host. */
function isEmbeddedMode() {
	return embeddedModeValue;
}
//#endregion
//#region src/infra/embedded-plugin-approval-broker.ts
let activeBroker = null;
var EmbeddedPluginApprovalBroker = class {
	constructor() {
		this.pending = /* @__PURE__ */ new Map();
		this.listeners = /* @__PURE__ */ new Set();
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	listPending() {
		return [...this.pending.values()].map((entry) => entry.record);
	}
	async request(params) {
		if (params.signal?.aborted) throw params.signal.reason ?? /* @__PURE__ */ new Error("approval request aborted");
		const id = `plugin:${randomUUID()}`;
		const createdAtMs = Date.now();
		const record = {
			approvalKind: "plugin",
			id,
			request: params.request,
			createdAtMs,
			expiresAtMs: createdAtMs + params.timeoutMs
		};
		let resolve;
		let reject;
		const decision = new Promise((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		});
		const timer = setTimeout(() => {
			const entry = this.pending.get(id);
			if (!entry) return;
			this.pending.delete(id);
			entry.resolve(null);
			this.emit({
				event: "plugin.approval.removed",
				payload: { id }
			});
		}, params.timeoutMs);
		timer.unref?.();
		this.pending.set(id, {
			record,
			timer,
			resolve,
			reject
		});
		const abort = () => {
			const entry = this.pending.get(id);
			if (!entry) return;
			clearTimeout(entry.timer);
			this.pending.delete(id);
			entry.reject(params.signal?.reason ?? /* @__PURE__ */ new Error("approval request aborted"));
			this.emit({
				event: "plugin.approval.removed",
				payload: { id }
			});
		};
		params.signal?.addEventListener("abort", abort, { once: true });
		this.emit({
			event: "plugin.approval.requested",
			payload: record
		});
		try {
			return {
				id,
				decision: await decision
			};
		} finally {
			params.signal?.removeEventListener("abort", abort);
		}
	}
	resolve(id, decision) {
		const entry = this.pending.get(id);
		if (!entry || !resolveCanonicalPluginApprovalRequestAllowedDecisions(entry.record.request).includes(decision)) return false;
		clearTimeout(entry.timer);
		this.pending.delete(id);
		entry.resolve(decision);
		this.emit({
			event: "plugin.approval.resolved",
			payload: {
				id,
				decision,
				resolvedBy: "tui:embedded",
				ts: Date.now(),
				request: entry.record.request
			}
		});
		return true;
	}
	stop(reason = /* @__PURE__ */ new Error("embedded plugin approval broker stopped")) {
		for (const [id, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(reason);
			this.emit({
				event: "plugin.approval.removed",
				payload: { id }
			});
		}
		this.pending.clear();
		this.listeners.clear();
	}
	emit(event) {
		notifyListeners(this.listeners, event);
	}
};
function setEmbeddedPluginApprovalBroker(broker) {
	activeBroker = broker;
}
function clearEmbeddedPluginApprovalBroker(broker) {
	if (activeBroker === broker) activeBroker = null;
}
function getEmbeddedPluginApprovalBroker() {
	return activeBroker;
}
//#endregion
//#region src/skills/workshop/policy.ts
const loadPendingSkillProposalResolver = createLazyRuntimeNamedExport(() => import("./policy.runtime.js"), "resolvePendingSkillProposal");
const SKILL_WORKSHOP_LIFECYCLE_ACTIONS = /* @__PURE__ */ new Set([
	"apply",
	"reject",
	"quarantine",
	"restore_collection"
]);
const SKILL_WORKSHOP_APPROVAL_TIMEOUT_MS = 7e4;
function readLifecycleAction(params) {
	const action = asNullableRecord(params)?.action;
	if (typeof action !== "string" || !SKILL_WORKSHOP_LIFECYCLE_ACTIONS.has(action)) return;
	return action;
}
function lifecycleApprovalText(action) {
	if (action === "apply") return {
		title: "Apply workspace skill proposal",
		description: "Apply a pending workspace skill proposal into live workspace skills.",
		severity: "warning"
	};
	if (action === "reject") return {
		title: "Reject workspace skill proposal",
		description: "Reject a pending workspace skill proposal.",
		severity: "info"
	};
	if (action === "restore_collection") return {
		title: "Restore previous skill collection",
		description: "Replace current workspace skills with the previous collection backup. Later skill changes may be removed.",
		severity: "warning"
	};
	return {
		title: "Quarantine workspace skill proposal",
		description: "Quarantine a pending workspace skill proposal.",
		severity: "info"
	};
}
function formatBodySizeKb(content) {
	return (Buffer.byteLength(content, "utf8") / 1024).toFixed(1);
}
function formatApprovalField(value) {
	return value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (character) => character === "\n" || character === "\r" || character === "\u2028" || character === "\u2029" ? "↵" : "�");
}
function buildLifecycleApprovalDescription(params) {
	const description = formatApprovalField(params.description);
	const requestedSkillName = formatApprovalField(params.skillName);
	const fixedLines = [
		`Proposal ID: ${params.proposalId}`,
		`Description: ${description}`,
		`Support files: ${params.supportFileCount}`,
		`Body size: ${params.bodySizeKb} KB`
	];
	const skillPrefix = "Target skill: ";
	const fixedLength = fixedLines.join("\n").length + 14 + fixedLines.length;
	const availableSkillNameLength = Math.max(1, 512 - fixedLength);
	const skillName = requestedSkillName.length <= availableSkillNameLength ? requestedSkillName : `${truncateUtf16Safe(requestedSkillName, Math.max(0, availableSkillNameLength - 1))}…`;
	return [
		fixedLines[0],
		`${skillPrefix}${skillName}`,
		...fixedLines.slice(1)
	].join("\n");
}
async function resolveLifecycleApprovalDescription(params) {
	if (!params.workspaceDir) return { description: params.fallback };
	const toolParams = asNullableRecord(params.toolParams);
	try {
		const proposal = await (await loadPendingSkillProposalResolver())({
			proposalId: normalizeOptionalString(toolParams?.proposal_id),
			name: normalizeOptionalString(toolParams?.name),
			workspaceDir: params.workspaceDir
		});
		const record = proposal.record;
		return {
			description: buildLifecycleApprovalDescription({
				proposalId: record.id,
				skillName: record.target.skillName,
				description: record.description,
				supportFileCount: record.supportFiles?.length ?? 0,
				bodySizeKb: formatBodySizeKb(proposal.content)
			}),
			proposalId: record.id
		};
	} catch (error) {
		logDebug(`skill-workshop: approval detail unavailable, using generic text: ${error instanceof Error ? error.message : String(error)}`);
		return { description: params.fallback };
	}
}
function lifecycleApprovalTimeoutReason(params) {
	if (params.action === "restore_collection") return [
		"The Skill Workshop approval request expired without a decision.",
		"This restore call left workspace skills unchanged.",
		"Review the current skills, then request the restore again if it is still wanted.",
		"Do not retry this tool call in a loop."
	].join(" ");
	return [
		"The Skill Workshop approval request expired without a decision.",
		`This lifecycle call left ${params.proposalId ? `Proposal ${params.proposalId}` : "the proposal"} unchanged and pending; check its current status in case another operator acted on it.`,
		"Decide in the Skill Workshop UI or run `openclaw skills workshop apply|reject|quarantine <id>`.",
		"Do not retry this tool call in a loop."
	].join(" ");
}
function resolveApprovalConfig(config) {
	if (config) return config;
	try {
		return getRuntimeConfig();
	} catch {
		return;
	}
}
/** Returns approval policy for skill workshop lifecycle tool calls. */
async function resolveSkillWorkshopToolApproval(params) {
	if (params.toolName !== "skill_workshop") return;
	const action = readLifecycleAction(params.toolParams);
	if (!action) return;
	if (resolveSkillWorkshopConfig(resolveApprovalConfig(params.config)).approvalPolicy === "auto") return;
	const text = lifecycleApprovalText(action);
	const approvalDescription = action === "restore_collection" ? { description: text.description } : await resolveLifecycleApprovalDescription({
		toolParams: params.toolParams,
		workspaceDir: params.workspaceDir,
		fallback: text.description
	});
	return { requireApproval: {
		...text,
		description: approvalDescription.description,
		timeoutMs: SKILL_WORKSHOP_APPROVAL_TIMEOUT_MS,
		timeoutReason: lifecycleApprovalTimeoutReason({
			action,
			proposalId: approvalDescription.proposalId
		}),
		allowedDecisions: ["allow-once", "deny"]
	} };
}
//#endregion
//#region src/agents/agent-tools.before-tool-call.approval.ts
/**
* Approval transport for before_tool_call policy decisions.
* Owns request/wait routing, embedded approval bridging, deferred approvals,
* timeout classification, and owner-provided approval outcomes.
*/
const log = createSubsystemLogger("agents/tools");
function pluginApprovalDeniedOutcome(baseParams) {
	return {
		blocked: true,
		kind: "failure",
		disposition: "blocked",
		deniedReason: "plugin-approval",
		reason: [
			"Denied by user. The tool call did not run.",
			"This denial is final: the approval request is closed. Do not mention /approve or any other approval command to the user.",
			"Do not run the tool call again or ask the user to approve it again.",
			"If the user still wants the action, explain that a new tool call will trigger a fresh approval request."
		].join("\n"),
		params: baseParams
	};
}
function resolvePluginToolApprovalTimeoutMs(approval) {
	if (typeof approval.timeoutMs !== "number" || !Number.isFinite(approval.timeoutMs) || approval.timeoutMs <= 0) return DEFAULT_PLUGIN_APPROVAL_TIMEOUT_MS;
	return Math.min(Math.floor(approval.timeoutMs), MAX_PLUGIN_APPROVAL_TIMEOUT_MS);
}
function resolvePluginToolApprovalGatewayTimeoutMs(timeoutMs) {
	return addTimerTimeoutGraceMs(timeoutMs, 1e4) ?? 13e4;
}
function mergeParamsWithApprovalOverrides(originalParams, approvalParams) {
	if (approvalParams && isPlainObject(approvalParams)) {
		if (isPlainObject(originalParams)) return {
			...originalParams,
			...approvalParams
		};
		return approvalParams;
	}
	return originalParams;
}
const warnedDeprecatedTimeoutBehaviorPluginIds = /* @__PURE__ */ new Set();
function warnDeprecatedApprovalTimeoutBehavior(approval) {
	if (approval.timeoutBehavior !== "allow") return;
	const pluginId = approval.pluginId ?? "unknown-plugin";
	if (warnedDeprecatedTimeoutBehaviorPluginIds.has(pluginId)) return;
	warnedDeprecatedTimeoutBehaviorPluginIds.add(pluginId);
	log.warn(`plugin '${pluginId}' sets deprecated requireApproval.timeoutBehavior:"allow"; the field is ignored and approvals fail closed on timeout (see docs/plugins/plugin-permission-requests.md)`);
}
function notifyPluginApprovalResolution(approval, resolution) {
	const onResolution = approval.onResolution;
	if (typeof onResolution !== "function") return;
	try {
		Promise.resolve(onResolution(resolution)).catch((err) => {
			log.warn(`plugin onResolution callback failed: ${String(err)}`);
		});
	} catch (err) {
		log.warn(`plugin onResolution callback failed: ${String(err)}`);
	}
}
function resolvePermittedPluginApprovalResolution(decision, allowedDecisions) {
	if ((decision === PluginApprovalResolutions.ALLOW_ONCE || decision === PluginApprovalResolutions.ALLOW_ALWAYS || decision === PluginApprovalResolutions.DENY) && allowedDecisions.includes(decision)) return decision;
	return PluginApprovalResolutions.TIMEOUT;
}
function buildPluginApprovalFailureReason(params) {
	const turnSourceChannel = params.ctx?.turnSourceChannel;
	if (!turnSourceChannel?.trim()) return params.fallbackReason;
	const nativePluginSurface = resolveApprovalInitiatingSurfaceState({
		channel: turnSourceChannel,
		accountId: params.ctx?.turnSourceAccountId,
		cfg: params.ctx?.config,
		approvalKind: "plugin"
	});
	const setupText = describeNativePluginApprovalClientSetup({
		channel: nativePluginSurface.channel,
		channelLabel: nativePluginSurface.channelLabel,
		accountId: nativePluginSurface.accountId
	});
	if (!setupText) return params.fallbackReason;
	if ((nativePluginSurface.kind === "disabled" ? nativePluginSurface : resolveApprovalInitiatingSurfaceState({
		channel: turnSourceChannel,
		accountId: params.ctx?.turnSourceAccountId,
		cfg: params.ctx?.config,
		approvalKind: "exec"
	})).kind !== "disabled") return params.fallbackReason;
	return `${params.fallbackReason}\n\n${setupText}`;
}
function resolveUnavailablePluginApprovalSurfaceReason(ctx) {
	const trigger = ctx?.trigger?.trim();
	if (!trigger) return;
	const initiatingSurface = resolveApprovalInitiatingSurfaceState({
		channel: ctx?.turnSourceChannel,
		accountId: ctx?.turnSourceAccountId,
		cfg: ctx?.config,
		approvalKind: "plugin"
	});
	if (trigger !== "user") return `Plugin approval unavailable: ${trigger} runs have no approval-capable initiating surface.`;
	if (!ctx?.turnSourceChannel?.trim() && !ctx?.approvalReviewerDeviceId?.trim()) return "Plugin approval unavailable: non-interactive CLI runs have no approval-capable initiating surface.";
	if (initiatingSurface.kind === "disabled") return `Plugin approval unavailable: the ${initiatingSurface.channelLabel} initiating surface is disabled.`;
	if (initiatingSurface.kind === "unsupported") return `Plugin approval unavailable: the ${initiatingSurface.channelLabel} initiating surface does not support approvals.`;
}
async function requestPluginToolApproval(params) {
	const approval = params.approval;
	const timeoutMs = resolvePluginToolApprovalTimeoutMs(approval);
	const gatewayTimeoutMs = resolvePluginToolApprovalGatewayTimeoutMs(timeoutMs);
	const allowedDecisions = resolveCanonicalPluginApprovalRequestAllowedDecisions(approval);
	let gatewayApprovalPhase = "none";
	try {
		const embeddedApprovalBroker = isEmbeddedMode() ? getEmbeddedPluginApprovalBroker() : null;
		if (embeddedApprovalBroker) {
			const decision = (await embeddedApprovalBroker.request({
				request: {
					pluginId: approval.pluginId,
					title: approval.title,
					description: approval.description,
					...approval.scope ? { scope: sanitizeApprovalScope(approval.scope) } : {},
					severity: approval.severity,
					allowedDecisions: approval.allowedDecisions,
					toolName: params.toolName,
					toolCallId: params.toolCallId,
					agentId: params.ctx?.agentId,
					sessionKey: params.ctx?.sessionKey,
					turnSourceChannel: params.ctx?.turnSourceChannel,
					turnSourceTo: params.ctx?.turnSourceTo,
					turnSourceAccountId: params.ctx?.turnSourceAccountId,
					turnSourceThreadId: params.ctx?.turnSourceThreadId
				},
				timeoutMs,
				signal: params.signal
			})).decision;
			const resolution = resolvePermittedPluginApprovalResolution(decision, allowedDecisions);
			notifyPluginApprovalResolution(approval, resolution);
			if (resolution === PluginApprovalResolutions.ALLOW_ONCE || resolution === PluginApprovalResolutions.ALLOW_ALWAYS) return {
				blocked: false,
				params: mergeParamsWithApprovalOverrides(params.baseParams, params.overrideParams),
				approvalResolution: resolution
			};
			if (resolution === PluginApprovalResolutions.DENY) return pluginApprovalDeniedOutcome(params.baseParams);
			return approval.timeoutReason ? {
				blocked: true,
				kind: "veto",
				deniedReason: "plugin-approval",
				reason: approval.timeoutReason,
				params: params.baseParams
			} : {
				blocked: true,
				kind: "failure",
				disposition: "timed_out",
				deniedReason: "plugin-approval",
				reason: "Approval timed out",
				params: params.baseParams
			};
		}
		const unavailableSurfaceReason = resolveUnavailablePluginApprovalSurfaceReason(params.ctx);
		if (unavailableSurfaceReason) {
			notifyPluginApprovalResolution(approval, PluginApprovalResolutions.CANCELLED);
			return {
				blocked: true,
				kind: "failure",
				disposition: "failed",
				deniedReason: "plugin-approval-unavailable",
				reason: unavailableSurfaceReason,
				params: params.baseParams
			};
		}
		gatewayApprovalPhase = "request";
		const requestResult = await withGatewayToolApprovalOwner(approval.pluginId, async () => await callGatewayTool("plugin.approval.request", { timeoutMs: gatewayTimeoutMs }, {
			title: approval.title,
			description: approval.description,
			...approval.scope ? { scope: approval.scope } : {},
			severity: approval.severity,
			allowedDecisions: approval.allowedDecisions,
			toolName: params.toolName,
			toolCallId: params.toolCallId,
			agentId: params.ctx?.agentId,
			sessionKey: params.ctx?.sessionKey,
			...params.ctx?.approvalReviewerDeviceId ? { approvalReviewerDeviceIds: [params.ctx.approvalReviewerDeviceId] } : {},
			turnSourceChannel: params.ctx?.turnSourceChannel,
			turnSourceTo: params.ctx?.turnSourceTo,
			turnSourceAccountId: params.ctx?.turnSourceAccountId,
			turnSourceThreadId: params.ctx?.turnSourceThreadId,
			timeoutMs,
			twoPhase: true
		}, {
			expectFinal: false,
			signal: params.signal
		}));
		gatewayApprovalPhase = "none";
		const id = requestResult?.id;
		if (!id) {
			notifyPluginApprovalResolution(approval, PluginApprovalResolutions.CANCELLED);
			return {
				blocked: true,
				kind: "failure",
				disposition: "failed",
				deniedReason: "plugin-approval",
				reason: approval.description || "Plugin approval request failed",
				params: params.baseParams
			};
		}
		const hasImmediateDecision = Object.hasOwn(requestResult ?? {}, "decision");
		let decision;
		if (hasImmediateDecision) {
			decision = requestResult?.decision;
			if (decision === null) {
				notifyPluginApprovalResolution(approval, PluginApprovalResolutions.CANCELLED);
				return {
					blocked: true,
					kind: "failure",
					disposition: "failed",
					deniedReason: "plugin-approval",
					reason: buildPluginApprovalFailureReason({
						fallbackReason: "Plugin approval unavailable (no approval route)",
						ctx: params.ctx
					}),
					params: params.baseParams
				};
			}
		} else {
			gatewayApprovalPhase = "wait";
			const waitResult = await callGatewayTool("plugin.approval.waitDecision", { timeoutMs: gatewayTimeoutMs }, { id }, { signal: params.signal });
			decision = waitResult?.id === id ? waitResult.decision : void 0;
		}
		const resolution = resolvePermittedPluginApprovalResolution(decision, allowedDecisions);
		notifyPluginApprovalResolution(approval, resolution);
		if (resolution === PluginApprovalResolutions.ALLOW_ONCE || resolution === PluginApprovalResolutions.ALLOW_ALWAYS) return {
			blocked: false,
			params: mergeParamsWithApprovalOverrides(params.baseParams, params.overrideParams),
			approvalResolution: resolution
		};
		if (resolution === PluginApprovalResolutions.DENY) return pluginApprovalDeniedOutcome(params.baseParams);
		const fallbackTimeoutReason = approval.timeoutReason ?? "Approval timed out";
		const timeoutReason = requestResult?.deliveryRoute === "turn-source" ? buildPluginApprovalFailureReason({
			fallbackReason: fallbackTimeoutReason,
			ctx: params.ctx
		}) : fallbackTimeoutReason;
		return {
			blocked: true,
			kind: approval.timeoutReason ? "veto" : "failure",
			disposition: "timed_out",
			deniedReason: "plugin-approval",
			reason: timeoutReason,
			params: params.baseParams
		};
	} catch (err) {
		notifyPluginApprovalResolution(approval, PluginApprovalResolutions.CANCELLED);
		const signal = params.signal;
		if (signal?.aborted === true && (err === signal.reason || err instanceof Error && (err.name === "AbortError" || "cause" in err && err.cause === signal.reason))) {
			log.warn(`plugin approval wait cancelled by run abort: ${String(err)}`);
			return {
				blocked: true,
				kind: "failure",
				disposition: resolveToolErrorDiagnostic(err, signal).terminalReason,
				deniedReason: "plugin-approval",
				reason: "Approval cancelled (run aborted)",
				params: params.baseParams
			};
		}
		const invalidRequest = err instanceof GatewayClientRequestError && err.gatewayCode === "INVALID_REQUEST";
		const reason = invalidRequest && gatewayApprovalPhase === "request" ? `Plugin approval request rejected: ${formatErrorMessage(err)}` : invalidRequest && gatewayApprovalPhase === "wait" ? `Plugin approval no longer available: ${formatErrorMessage(err)}` : "Plugin approval required (gateway unavailable)";
		log.warn(`plugin approval gateway request failed; blocking tool call: ${String(err)}`);
		return {
			blocked: true,
			kind: "failure",
			disposition: resolveToolErrorDiagnostic(err, signal).terminalReason,
			deniedReason: "plugin-approval",
			reason,
			params: params.baseParams
		};
	}
}
/** Resolve a deferred plugin approval request at the later execution boundary. */
async function requestDeferredPluginToolApproval(params) {
	const deferred = params.deferredApproval;
	return requestPluginToolApproval({
		approval: deferred.approval,
		toolName: deferred.toolName,
		...deferred.toolCallId ? { toolCallId: deferred.toolCallId } : {},
		...deferred.ctx ? { ctx: deferred.ctx } : {},
		signal: params.signal,
		baseParams: deferred.baseParams,
		overrideParams: deferred.overrideParams
	});
}
/** Notify plugin approval callbacks that a deferred approval was cancelled. */
function cancelDeferredPluginToolApproval(deferredApproval) {
	notifyPluginApprovalResolution(deferredApproval.approval, PluginApprovalResolutions.CANCELLED);
}
async function resolveBeforeToolCallApprovalOutcome(params) {
	const approval = params.result?.requireApproval;
	if (!approval) return;
	const baseParamsSnapshot = cloneHookIsolationValue("before_tool_call", params.baseParams);
	const overrideParamsSnapshot = params.result?.params === void 0 ? void 0 : cloneHookIsolationValue("before_tool_call", params.result.params);
	warnDeprecatedApprovalTimeoutBehavior(approval);
	if (params.approvalMode === "defer") return {
		blocked: false,
		params: cloneHookIsolationValue("before_tool_call", baseParamsSnapshot),
		deferredApproval: {
			approval,
			toolName: params.toolName,
			...params.toolCallId ? { toolCallId: params.toolCallId } : {},
			...params.ctx ? { ctx: params.ctx } : {},
			baseParams: baseParamsSnapshot,
			overrideParams: overrideParamsSnapshot
		}
	};
	if (params.approvalMode === "report") {
		notifyPluginApprovalResolution(approval, PluginApprovalResolutions.CANCELLED);
		return {
			blocked: true,
			kind: "failure",
			disposition: "blocked",
			deniedReason: "plugin-approval",
			reason: approval.description || approval.title || "Plugin approval required",
			params: baseParamsSnapshot
		};
	}
	if (params.approvalMode === "deny") {
		notifyPluginApprovalResolution(approval, PluginApprovalResolutions.DENY);
		return {
			blocked: true,
			kind: "veto",
			deniedReason: "plugin-approval",
			reason: "approval_required",
			params: baseParamsSnapshot
		};
	}
	return await requestPluginToolApproval({
		approval,
		toolName: params.toolName,
		...params.toolCallId ? { toolCallId: params.toolCallId } : {},
		...params.ctx ? { ctx: params.ctx } : {},
		signal: params.signal,
		baseParams: baseParamsSnapshot,
		overrideParams: overrideParamsSnapshot
	});
}
async function resolveSkillWorkshopApprovalForFinalParams(params) {
	return await resolveBeforeToolCallApprovalOutcome({
		result: await resolveSkillWorkshopToolApproval({
			toolName: params.toolName,
			toolParams: isPlainObject(params.params) ? params.params : {},
			...params.ctx?.config ? { config: params.ctx.config } : {},
			...params.ctx?.workspaceDir ? { workspaceDir: params.ctx.workspaceDir } : {}
		}),
		approvalMode: params.approvalMode,
		toolName: params.toolName,
		...params.toolCallId ? { toolCallId: params.toolCallId } : {},
		...params.ctx ? { ctx: params.ctx } : {},
		signal: params.signal,
		baseParams: params.params
	});
}
//#endregion
//#region src/plugins/host-tool-param-parsers.ts
/**
* Derive host-owned metadata for a tool call. Returns an empty object when no
* parser is registered for the tool, which lets callers spread the result
* unconditionally without a nullability check.
*/
async function deriveToolParams(toolName, params, options) {
	if (toolName !== "apply_patch") return {};
	const paths = await extractResolvedApplyPatchTargetPaths(params, options);
	return paths.length > 0 ? { derivedPaths: Object.freeze([...paths]) } : {};
}
//#endregion
//#region src/plugins/trusted-tool-policy.ts
/** True when the supplied or active plugin registry has trusted tool policies. */
function hasTrustedToolPolicies(registry = getActivePluginRegistry()) {
	return copyTrustedPolicyRegistrations(registry).length > 0;
}
function unreadableTrustedPolicyRegistration() {
	return {
		pluginId: "unknown-plugin",
		source: "runtime",
		get policy() {
			throw new Error("trusted policy registration is unreadable");
		}
	};
}
function copyTrustedPolicyRegistrations(registry) {
	let policies;
	try {
		policies = registry?.trustedToolPolicies;
	} catch {
		return [unreadableTrustedPolicyRegistration()];
	}
	if (!policies) return [];
	try {
		if (!Array.isArray(policies)) return [unreadableTrustedPolicyRegistration()];
		return policies.map((policy) => policy);
	} catch {
		return [unreadableTrustedPolicyRegistration()];
	}
}
function readTrustedPolicyPluginId(registration) {
	try {
		const pluginId = registration.pluginId;
		return typeof pluginId === "string" && pluginId.trim() ? pluginId.trim() : void 0;
	} catch {
		return;
	}
}
function trustedPolicyDiagnosticPluginId(registration) {
	return readTrustedPolicyPluginId(registration) ?? "unknown-plugin";
}
function readTrustedPolicyPluginName(registration) {
	try {
		const pluginName = registration.pluginName;
		return typeof pluginName === "string" && pluginName.trim() ? pluginName.trim() : void 0;
	} catch {
		return;
	}
}
function readTrustedPolicy(registration) {
	try {
		const policy = registration.policy;
		return policy && typeof policy.evaluate === "function" ? {
			ok: true,
			policy
		} : { ok: false };
	} catch {
		return { ok: false };
	}
}
function readTrustedPolicyMatcher(policy) {
	try {
		return {
			ok: true,
			matcher: normalizePluginToolMatcher(policy.matcher)
		};
	} catch {
		return { ok: false };
	}
}
function getTrustedToolPolicyMatcherScope(registry = getActivePluginRegistry()) {
	return createPluginToolMatcherScope(copyTrustedPolicyRegistrations(registry).map((registration) => {
		const policy = readTrustedPolicy(registration);
		if (!policy.ok) return;
		const matcher = readTrustedPolicyMatcher(policy.policy);
		return matcher.ok ? matcher.matcher : void 0;
	}));
}
function readTrustedPolicyId(registration) {
	const fallback = trustedPolicyDiagnosticPluginId(registration);
	const policy = readTrustedPolicy(registration);
	if (!policy.ok) return fallback;
	try {
		const id = policy.policy.id;
		return typeof id === "string" && id.trim() ? id.trim() : fallback;
	} catch {
		return fallback;
	}
}
function trustedPolicyDefaultBlockReason(registration) {
	return `blocked by ${readTrustedPolicyId(registration)}`;
}
function trustedPolicyFailureResult(registration, detail) {
	return {
		block: true,
		blockReason: `${trustedPolicyDefaultBlockReason(registration)}: ${detail}`
	};
}
/** Lists trusted tool policies for status and diagnostics. */
function getTrustedToolPolicyDiagnosticEntries(registry = getActivePluginRegistry()) {
	return copyTrustedPolicyRegistrations(registry).map((registration) => {
		const entry = {
			id: readTrustedPolicyId(registration),
			pluginId: trustedPolicyDiagnosticPluginId(registration)
		};
		const pluginName = readTrustedPolicyPluginName(registration);
		if (pluginName) entry.pluginName = pluginName;
		return entry;
	});
}
function normalizeDerivedEventFields(value) {
	return Array.isArray(value?.derivedPaths) ? { derivedPaths: Object.freeze([...value.derivedPaths]) } : {};
}
function normalizeToolIdentity(value) {
	return {
		...value?.toolKind && { toolKind: value.toolKind },
		...value?.toolInputKind && { toolInputKind: value.toolInputKind }
	};
}
/** Runs trusted tool policies before a tool call and returns the first terminal decision. */
async function runTrustedToolPolicies(event, ctx, options) {
	const policies = copyTrustedPolicyRegistrations(options?.registry ?? getActivePluginRegistry());
	let adjustedParams = event.params;
	let hasAdjustedParams = false;
	let approval;
	const sessionExtensionStateCache = /* @__PURE__ */ new Map();
	let resolvedSessionConfig = options?.config;
	let didResolveSessionConfig = Boolean(options?.config);
	const resolveSessionConfig = () => {
		if (!didResolveSessionConfig) {
			didResolveSessionConfig = true;
			try {
				resolvedSessionConfig = getRuntimeConfig();
			} catch {
				resolvedSessionConfig = void 0;
			}
		}
		return resolvedSessionConfig;
	};
	const { derivedPaths, toolKind, toolInputKind, ...eventWithoutDerivedPaths } = event;
	const { toolKind: ctxToolKind, toolInputKind: ctxToolInputKind, ...ctxWithoutToolIdentity } = ctx;
	let currentDerivedEvent = normalizeDerivedEventFields({ derivedPaths });
	let currentEventToolIdentity = normalizeToolIdentity({
		toolKind,
		toolInputKind
	});
	let currentContextToolIdentity = normalizeToolIdentity({
		toolKind: ctxToolKind,
		toolInputKind: ctxToolInputKind
	});
	const buildEvent = () => {
		return {
			...eventWithoutDerivedPaths,
			params: adjustedParams,
			...currentEventToolIdentity,
			...currentDerivedEvent
		};
	};
	for (const registration of policies) {
		const pluginId = readTrustedPolicyPluginId(registration);
		if (!pluginId) return trustedPolicyFailureResult(registration, "policy owner is unreadable");
		const policyCtx = {
			...ctxWithoutToolIdentity,
			...currentContextToolIdentity,
			getSessionExtension: (namespace) => {
				const normalizedNamespace = namespace.trim();
				const cacheKey = pluginId;
				if (!sessionExtensionStateCache.has(cacheKey)) {
					const config = ctx.sessionKey ? resolveSessionConfig() : void 0;
					sessionExtensionStateCache.set(cacheKey, config ? getPluginSessionExtensionStateSync({
						cfg: config,
						pluginId,
						sessionKey: ctx.sessionKey,
						agentId: ctx.agentId
					}) : void 0);
				}
				const pluginState = sessionExtensionStateCache.get(cacheKey);
				if (!normalizedNamespace || !pluginState) return;
				return pluginState[normalizedNamespace];
			}
		};
		const policy = readTrustedPolicy(registration);
		if (!policy.ok) return trustedPolicyFailureResult(registration, "policy is unreadable");
		const matcher = readTrustedPolicyMatcher(policy.policy);
		if (!matcher.ok) return trustedPolicyFailureResult(registration, "policy matcher is unreadable");
		if (!pluginToolMatcherCoversTool(matcher.matcher, event.toolName)) continue;
		let decision;
		try {
			decision = await policy.policy.evaluate(buildEvent(), policyCtx);
		} catch {
			return trustedPolicyFailureResult(registration, "policy evaluation failed");
		}
		if (!decision) continue;
		try {
			if ("allow" in decision && decision.allow === false) return {
				block: true,
				blockReason: decision.reason ?? trustedPolicyDefaultBlockReason(registration)
			};
			if ("block" in decision && decision.block === true) return {
				...decision,
				blockReason: decision.blockReason ?? trustedPolicyDefaultBlockReason(registration)
			};
			if ("params" in decision && isPlainObject(decision.params)) {
				const normalized = options?.normalizeEvent?.({
					...eventWithoutDerivedPaths,
					params: decision.params,
					...currentEventToolIdentity,
					...currentDerivedEvent
				}, policyCtx);
				adjustedParams = normalized?.params ?? decision.params;
				if (normalized?.event) currentEventToolIdentity = normalizeToolIdentity(normalized.event);
				if (normalized?.ctx) currentContextToolIdentity = normalizeToolIdentity(normalized.ctx);
				else if (normalized?.event) currentContextToolIdentity = normalizeToolIdentity(normalized.event);
				hasAdjustedParams = true;
				currentDerivedEvent = normalizeDerivedEventFields(await options?.deriveEvent?.(adjustedParams));
			}
			if ("requireApproval" in decision && decision.requireApproval && !approval) approval = decision.requireApproval;
		} catch {
			ctx.abortSignal?.throwIfAborted();
			return trustedPolicyFailureResult(registration, "policy decision is unreadable");
		}
	}
	if (!hasAdjustedParams && !approval) return;
	return {
		...hasAdjustedParams ? { params: adjustedParams } : {},
		...approval ? { requireApproval: approval } : {}
	};
}
//#endregion
//#region src/talk/client-voice-confirmation.ts
/** In-memory spoken confirmation binding for high-impact Talk actions. */
const traceGptLiveVoiceConfirmation = (function createGptLiveClientVoiceConfirmationTracer(core) {
  return function traceGptLiveVoiceConfirmation(stage, fields) {
    try {
      if (core.env?.OPENCLAW_GPT_LIVE_PROGRESS_TRACE !== "1" ||
          !["eligible", "bind", "consume"].includes(stage)) return;
      const hash = value => core.createHash("sha256").update(value).digest("hex");
      const event = { stage, at: fields.at, scopeSha256: hash(fields.scopeKey), fingerprint: fields.fingerprint };
      if (stage === "eligible") Object.assign(event, {
        confirmationId: fields.confirmationId, pendingCreatedAt: fields.pendingCreatedAt,
        durableUserObservedAt: fields.durableUserObservedAt, userTextSha256: hash(fields.userText),
        callerInputAcceptedAt: fields.callerInputAcceptedAt,
      });
      else {
        Object.assign(event, { runId: fields.runId, runIdSha256: hash(fields.runId) });
        if (stage === "bind") event.confirmationId = fields.confirmationId;
      }
      core.write(`GPT_LIVE_VOICE_CONFIRMATION ${JSON.stringify(event)}\n`);
    } catch {}
  };
})({
	env: process.env, createHash, write: line => process.stderr.write(line)
});
const CONFIRMATION_TTL_MS = 12e4;
const confirmationScopes = /* @__PURE__ */ new Map();
function confirmationScopeKey(agentId, voiceSessionId) {
	return `${agentId}\0${voiceSessionId}`;
}
function clearPendingExpiryTimer(state) {
	if (!state.pendingExpiryTimer) return;
	clearTimeout(state.pendingExpiryTimer);
	delete state.pendingExpiryTimer;
}
function clearPendingConfirmation(state) {
	clearPendingExpiryTimer(state);
	delete state.pending;
	delete state.recentUtterance;
}
function cleanupConfirmationScope(scopeKey, state) {
	if (state.pending || state.recentUtterance || state.approvedByRun.size > 0) return;
	if (confirmationScopes.get(scopeKey) === state) confirmationScopes.delete(scopeKey);
}
function pruneExpiredPendingConfirmation(scopeKey, state, now) {
	if (state.pending && state.pending.expiresAt < now) clearPendingConfirmation(state);
	cleanupConfirmationScope(scopeKey, state);
}
function schedulePendingConfirmationExpiry(scopeKey, state, now) {
	const pending = state.pending;
	if (!pending) {
		clearPendingExpiryTimer(state);
		cleanupConfirmationScope(scopeKey, state);
		return;
	}
	clearPendingExpiryTimer(state);
	state.pendingExpiryTimer = setTimeout(() => {
		delete state.pendingExpiryTimer;
		if (confirmationScopes.get(scopeKey) !== state || state.pending !== pending) return;
		const current = Date.now();
		if (pending.expiresAt < current) {
			clearPendingConfirmation(state);
			cleanupConfirmationScope(scopeKey, state);
		} else schedulePendingConfirmationExpiry(scopeKey, state, current);
	}, Math.max(1, pending.expiresAt - now + 1));
	state.pendingExpiryTimer.unref?.();
}
function getPrunedConfirmationScope(scopeKey, now) {
	const state = confirmationScopes.get(scopeKey);
	if (!state) return;
	pruneExpiredPendingConfirmation(scopeKey, state, now);
	return confirmationScopes.get(scopeKey);
}
function getOrCreateConfirmationScope(scopeKey) {
	const existing = confirmationScopes.get(scopeKey);
	if (existing) return existing;
	const state = { approvedByRun: /* @__PURE__ */ new Map() };
	confirmationScopes.set(scopeKey, state);
	return state;
}
function stableToolFingerprint(toolName, params) {
	const normalize = (value) => {
		if (Array.isArray(value)) return value.map(normalize);
		if (!value || typeof value !== "object") return value;
		return Object.fromEntries(Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, normalize(entry)]));
	};
	return createHash("sha256").update(`${toolName}\0${JSON.stringify(normalize(params))}`).digest("hex");
}
function requiresHighImpactVoiceConfirmation(toolName, params) {
	const normalizedTool = toolName.trim().toLowerCase();
	if (!buildToolMutationState(normalizedTool, params).mutatingAction) return false;
	if ([
		"message",
		"gateway",
		"nodes",
		"browser",
		"computer",
		"mobile_ui",
		"canvas",
		"automations",
		"process"
	].includes(normalizedTool)) return true;
	if ([
		"write",
		"edit",
		"apply_patch",
		"create_goal",
		"update_goal",
		"get_goal"
	].includes(normalizedTool)) return false;
	return true;
}
function resolveApprovedFingerprint(scopeKey, runId, fingerprint, now, consume) {
	if (!runId) return false;
	const state = confirmationScopes.get(scopeKey);
	const approved = state?.approvedByRun.get(runId);
	const expiresAt = approved?.get(fingerprint);
	if (!expiresAt || expiresAt < now) {
		approved?.delete(fingerprint);
		if (approved?.size === 0) state?.approvedByRun.delete(runId);
		if (state) cleanupConfirmationScope(scopeKey, state);
		return false;
	}
	if (consume) {
		const grantDeleted = approved?.delete(fingerprint);
		if (approved?.size === 0) state?.approvedByRun.delete(runId);
		if (state) cleanupConfirmationScope(scopeKey, state);
		if (grantDeleted === true) traceGptLiveVoiceConfirmation("consume", { at: now, scopeKey, runId, fingerprint });
	}
	return true;
}
/** Record a finalized user utterance after the durable transcript append succeeds. */
function noteClientVoiceConfirmationUtterance(params) {
	const scopeKey = confirmationScopeKey(params.agentId, params.voiceSessionId);
	const state = getPrunedConfirmationScope(scopeKey, params.timestamp);
	if (!state?.pending) return;
	if (REFUSAL_PATTERN.test(normalizeUtterance(params.text)) && state.pending.createdAt < params.timestamp) {
		clearPendingConfirmation(state);
		cleanupConfirmationScope(scopeKey, state);
		return;
	}
	state.recentUtterance = {
		text: params.text,
		timestamp: params.timestamp
	};
}
function resolveClientVoiceToolConfirmationPolicy(params, consume) {
	if (!params.agentId || !params.voiceSessionId) return { allowed: true };
	if (process.env.OPENCLAW_VOICE_SPOKEN_CONFIRMATION !== "1") return { allowed: true };
	if (!requiresHighImpactVoiceConfirmation(params.toolName, params.toolParams)) return { allowed: true };
	if (params.isConfirmable && !params.isConfirmable()) return { allowed: true };
	const now = params.now ?? Date.now();
	const fingerprint = stableToolFingerprint(params.toolName, params.toolParams);
	const scopeKey = confirmationScopeKey(params.agentId, params.voiceSessionId);
	if (resolveApprovedFingerprint(scopeKey, params.runId, fingerprint, now, consume)) return { allowed: true };
	const state = getPrunedConfirmationScope(scopeKey, now) ?? getOrCreateConfirmationScope(scopeKey);
	const pending = state.pending;
	const existing = pending && pending.runId === params.runId && pending.fingerprint === fingerprint ? pending : void 0;
	if (!existing) clearPendingConfirmation(state);
	const confirmation = existing ?? {
		confirmationId: randomUUID(),
		...params.runId ? { runId: params.runId } : {},
		fingerprint,
		createdAt: now,
		expiresAt: now + CONFIRMATION_TTL_MS
	};
	state.pending = confirmation;
	schedulePendingConfirmationExpiry(scopeKey, state, now);
	return {
		allowed: false,
		reason: `VOICE_CONFIRMATION_REQUIRED:${confirmation.confirmationId} The high-impact voice action "${params.toolName}" was not executed. Ask the user for explicit spoken confirmation, then call openclaw_agent_consult again with this confirmationId.`
	};
}
/** Check whether one exact high-impact action is approved without consuming its grant. */
function checkClientVoiceToolConfirmationPolicy(params) {
	return resolveClientVoiceToolConfirmationPolicy(params, false);
}
const authorizeGptLiveClientVoicePendingConfirmation = (function createGptLiveClientVoiceConfirmationAuthorizer(core) {
  return function authorizeGptLiveClientVoicePendingConfirmation(params) {
    const { agentId, voiceSessionId, sessionKey, callerInputAcceptedAt } = params ?? {};
    if (![agentId, voiceSessionId, sessionKey].every(value => typeof value === "string" && value.trim())) return;
    // This checkpoint comes from native delegation acceptance, including its
    // queue wait. Reading the latest USER only when a queued run starts would
    // let an older task borrow a later task's confirmation.
    if (!Number.isFinite(callerInputAcceptedAt)) return;
    const record = core.readVoiceSessionRecord(agentId, voiceSessionId);
    if (!record || record.agentId !== agentId || record.voiceSessionId !== voiceSessionId ||
        record.sessionKey !== sessionKey || record.status !== "open") return;
    if (record.origin !== "relay" && record.transcriptCapable !== true && record.hasUserTranscript !== true) return;
    const now = core.now?.() ?? Date.now();
    if (!Number.isFinite(now) || callerInputAcceptedAt > now) return;
    const state = core.getPrunedConfirmationScope(core.confirmationScopeKey(agentId, voiceSessionId), now);
    const pending = state?.pending, utterance = state?.recentUtterance;
    // Core records recentUtterance only after the finalized USER transcript
    // append succeeds. Prompt text, supplied ids and old run ids are not inputs.
    if (!pending || typeof pending.confirmationId !== "string" || !pending.confirmationId ||
        !Number.isFinite(pending.createdAt) || !Number.isFinite(pending.expiresAt) || pending.expiresAt < now ||
        !utterance || typeof utterance.text !== "string" || !Number.isFinite(utterance.timestamp) ||
        utterance.timestamp <= pending.createdAt || utterance.timestamp > callerInputAcceptedAt ||
        !core.isExplicitAffirmation(utterance.text)) return;
    const grant = core.authorizeClientVoiceConfirmation({ agentId, voiceSessionId,
      confirmationId: pending.confirmationId, now });
    try {
      if (grant) core.trace?.("eligible", { at: now,
        scopeKey: core.confirmationScopeKey(agentId, voiceSessionId),
        confirmationId: pending.confirmationId, fingerprint: grant.fingerprint,
        pendingCreatedAt: pending.createdAt, durableUserObservedAt: utterance.timestamp,
        userText: utterance.text, callerInputAcceptedAt });
    } catch {}
    return grant;
  };
})({
	readVoiceSessionRecord, getPrunedConfirmationScope, confirmationScopeKey,
	isExplicitAffirmation, authorizeClientVoiceConfirmation, trace: traceGptLiveVoiceConfirmation
});
/** Authorize the canonical execution params and consume their one-shot grant. */
function consumeClientVoiceToolConfirmationPolicy(params) {
	return resolveClientVoiceToolConfirmationPolicy(params, true);
}
const REFUSAL_PATTERN = /\b(no|don't|do not|cancel|stop|never mind)\b|^(?:不|不要|别|不同意|取消|停止|算了)|(?:不要执行|不要确认|不同意|别执行|取消任务|停止执行)/;
function normalizeUtterance(text) {
	return text.trim().toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[,;:.!?，；：。！？、]+/g, "").replace(/\s+/g, " ");
}
function isExplicitAffirmation(text) {
	const normalized = normalizeUtterance(text);
	if (REFUSAL_PATTERN.test(normalized)) return false;
	return /^(yes|yes do it|do it|confirm|confirmed|go ahead|proceed|send it|make the change|restart it|确认|确认执行|同意|同意执行|允许执行|请执行|执行吧|继续执行)$/.test(normalized);
}
/** Bind a later affirmative utterance to one exact paused action. */
function authorizeClientVoiceConfirmation(params) {
	const now = params.now ?? Date.now();
	const state = getPrunedConfirmationScope(confirmationScopeKey(params.agentId, params.voiceSessionId), now);
	const confirmation = state?.pending;
	if (!confirmation) throw new Error("voice confirmation is missing, expired, or belongs to another action");
	if (confirmation.confirmationId !== params.confirmationId) throw new Error("a newer confirmation request supersedes this one; ask again");
	const affirmation = state.recentUtterance;
	if (!affirmation || affirmation.timestamp <= confirmation.createdAt || !isExplicitAffirmation(affirmation.text)) throw new Error("explicit spoken confirmation was not found after the action request");
	return {
		agentId: params.agentId,
		voiceSessionId: params.voiceSessionId,
		confirmationId: params.confirmationId,
		fingerprint: confirmation.fingerprint,
		expiresAt: confirmation.expiresAt
	};
}
/**
* Bind a validated spoken grant to the one follow-up run and consume the
* challenge. Invalidated detached grants return false without disrupting the
* admitted run; final tool policy then blocks because no approval was created.
*/
function bindAuthorizedClientVoiceConfirmation(params) {
	const now = params.now ?? Date.now();
	const scopeKey = confirmationScopeKey(params.grant.agentId, params.grant.voiceSessionId);
	const state = confirmationScopes.get(scopeKey);
	const pending = state?.pending;
	if (!state || !pending || pending.expiresAt < now || pending.confirmationId !== params.grant.confirmationId || pending.fingerprint !== params.grant.fingerprint || pending.expiresAt !== params.grant.expiresAt) return false;
	const approved = state.approvedByRun.get(params.runId) ?? /* @__PURE__ */ new Map();
	approved.set(pending.fingerprint, pending.expiresAt);
	state.approvedByRun.set(params.runId, approved);
	clearPendingConfirmation(state);
	cleanupConfirmationScope(scopeKey, state);
	traceGptLiveVoiceConfirmation("bind", { at: now, scopeKey, runId: params.runId,
		confirmationId: pending.confirmationId, fingerprint: pending.fingerprint });
	return true;
}
/**
* Remove ephemeral confirmation state when the logical call closes. Approved
* grants for still-live consult runs survive: a spoken "yes" followed by hangup
* must not re-block the confirmed action its run is about to execute.
*/
function deactivateClientVoiceConfirmationSession(agentId, voiceSessionId, liveRunIds = []) {
	const scopeKey = confirmationScopeKey(agentId, voiceSessionId);
	const state = confirmationScopes.get(scopeKey);
	if (!state) return;
	clearPendingConfirmation(state);
	const live = new Set(liveRunIds);
	for (const runId of state.approvedByRun.keys()) if (!live.has(runId)) state.approvedByRun.delete(runId);
	cleanupConfirmationScope(scopeKey, state);
}
/** Drop a completed run's surviving grants once its lifecycle ends. */
function releaseClientVoiceConfirmationRun(agentId, voiceSessionId, runId) {
	const scopeKey = confirmationScopeKey(agentId, voiceSessionId);
	const state = confirmationScopes.get(scopeKey);
	if (!state) return;
	state.approvedByRun.delete(runId);
	cleanupConfirmationScope(scopeKey, state);
}
/** Test-only reset for process-global state. */
function resetClientVoiceConfirmationStateForTest() {
	for (const state of confirmationScopes.values()) clearPendingExpiryTimer(state);
	confirmationScopes.clear();
}
function snapshotClientVoiceConfirmationStateForTest() {
	const snapshot = {
		scopeOwners: confirmationScopes.size,
		pendingChallenges: 0,
		recentUtterances: 0,
		approvedRuns: 0,
		approvedGrants: 0,
		expiryOwners: 0
	};
	for (const state of confirmationScopes.values()) {
		snapshot.pendingChallenges += state.pending ? 1 : 0;
		snapshot.recentUtterances += state.recentUtterance ? 1 : 0;
		snapshot.approvedRuns += state.approvedByRun.size;
		for (const approved of state.approvedByRun.values()) snapshot.approvedGrants += approved.size;
		snapshot.expiryOwners += state.pendingExpiryTimer ? 1 : 0;
	}
	return snapshot;
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.clientVoiceConfirmationTestApi")] = {
	resetClientVoiceConfirmationStateForTest,
	snapshotClientVoiceConfirmationStateForTest
};
//#endregion
//#region src/talk/voice-transcript.ts
const VOICE_TRANSCRIPT_MAX_CHARS = 8e3;
const VOICE_TRANSCRIPT_QUEUE_MAX_PENDING = 40;
const VOICE_TRANSCRIPT_QUEUE_MAX_PENDING_CHARS = VOICE_TRANSCRIPT_QUEUE_MAX_PENDING * VOICE_TRANSCRIPT_MAX_CHARS;
const VOICE_TRANSCRIPT_QUEUE_OVERFLOW_MESSAGE = "Voice transcript persistence could not keep up; the realtime session was stopped.";
function normalizeVoiceTranscriptText(text) {
	return truncateUtf16Safe(text.trim(), VOICE_TRANSCRIPT_MAX_CHARS);
}
const VOICE_TRANSCRIPT_QUEUE_POLICY = {
	maxPendingCount: VOICE_TRANSCRIPT_QUEUE_MAX_PENDING,
	maxEntryChars: VOICE_TRANSCRIPT_MAX_CHARS,
	overflowMessage: VOICE_TRANSCRIPT_QUEUE_OVERFLOW_MESSAGE,
	createQueue: () => new BoundedSerialQueue({
		maxPendingCount: VOICE_TRANSCRIPT_QUEUE_MAX_PENDING,
		maxPendingWeight: VOICE_TRANSCRIPT_QUEUE_MAX_PENDING_CHARS
	})
};
var VoiceTranscriptOperationRegistry = class {
	constructor(queuePolicy) {
		this.queuePolicy = queuePolicy;
		this.owners = /* @__PURE__ */ new Map();
	}
	getOrCreate(key) {
		const existing = this.owners.get(key);
		if (existing) return existing;
		const created = { queue: this.queuePolicy.createQueue() };
		this.owners.set(key, created);
		return created;
	}
	cleanup(key, owner) {
		if (this.owners.get(key) === owner && !owner.closePromise && owner.queue.isIdle && !owner.queue.didOverflow) this.owners.delete(key);
	}
	async run(key, operation, options = {}) {
		while (true) {
			const owner = this.getOrCreate(key);
			if (owner.closePromise) {
				if (options.waitForCapacity !== true) throw new Error("voice transcript persistence session is closing");
				try {
					await owner.closePromise;
				} catch {}
				continue;
			}
			const admission = owner.queue.enqueue(operation, {
				weight: options.weight,
				sealOnOverflow: options.waitForCapacity !== true
			});
			if (admission.accepted) {
				admission.completion.then(() => this.cleanup(key, owner), () => this.cleanup(key, owner));
				return await admission.completion;
			}
			if (owner.queue.didOverflow || options.waitForCapacity !== true) throw new Error(owner.queue.didOverflow ? "voice transcript persistence queue capacity exceeded" : "voice transcript persistence session is closed");
			if (admission.reason !== "capacity") throw new Error("voice transcript persistence session is closed");
			await owner.queue.flush();
			this.cleanup(key, owner);
		}
	}
	async close(key, operation) {
		const owner = this.getOrCreate(key);
		if (!owner.closePromise) {
			owner.queue.seal();
			owner.closePromise = owner.queue.flush({ requireSuccess: true }).then(operation);
		}
		try {
			await owner.closePromise;
		} finally {
			if (this.owners.get(key) === owner) this.owners.delete(key);
		}
	}
	async flush(key) {
		await this.owners.get(key)?.queue.flush({ requireSuccess: true });
	}
	clear() {
		this.owners.clear();
	}
};
function createVoiceTranscriptOperationRegistry(queuePolicy) {
	return new VoiceTranscriptOperationRegistry(queuePolicy);
}
//#endregion
//#region src/talk/client-voice-session-store.ts
/** SQLite-backed persistence for durable per-agent Talk voice-call records. */
const VOICE_SESSION_CACHE_SCOPE = "talk-client-voice-sessions";
const VOICE_SESSION_STALE_AFTER_MS = 216e5;
const TRANSCRIPT_FAILURE_KEY_PATTERN = /^[0-9a-f]{64}$/;
const clientVoiceToolEffectSchema = looseObject({
	runId: string(),
	toolName: string(),
	startedAt: number(),
	status: _enum([
		"started",
		"succeeded",
		"failed",
		"cancelled",
		"blocked"
	])
});
const clientVoiceSessionRecordSchema = looseObject({
	version: literal(1),
	voiceSessionId: string(),
	agentId: string(),
	sessionKey: string(),
	provider: string().refine((value) => value.trim().length > 0).transform((value) => value.trim()).optional(),
	origin: _enum(["client", "relay"]),
	status: _enum(["open", "closed"]),
	createdAt: number(),
	updatedAt: number(),
	consultRunIds: unknown().optional().transform((value) => Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []),
	effects: unknown().optional().transform((value) => Array.isArray(value) ? value.flatMap((entry) => {
		const parsed = clientVoiceToolEffectSchema.safeParse(entry);
		return parsed.success ? [parsed.data] : [];
	}) : []),
	transcriptFailureKeys: unknown().optional().transform((value) => value ?? []).pipe(array(string().regex(TRANSCRIPT_FAILURE_KEY_PATTERN)).max(41).refine((keys) => new Set(keys).size === keys.length))
});
function parseVoiceSessionRecord(value) {
	const parsed = clientVoiceSessionRecordSchema.safeParse(value);
	return parsed.success ? parsed.data : void 0;
}
function parseStoredVoiceSessionRecord(valueJson) {
	if (typeof valueJson !== "string") return;
	try {
		return parseVoiceSessionRecord(JSON.parse(valueJson));
	} catch {
		return;
	}
}
function readVoiceSessionRecord(agentId, voiceSessionId) {
	return parseStoredVoiceSessionRecord(openOpenClawAgentDatabase({ agentId }).db.prepare("SELECT value_json FROM cache_entries WHERE scope = ? AND key = ?").get(VOICE_SESSION_CACHE_SCOPE, voiceSessionId)?.value_json);
}
function readVoiceSessionRecordInTransaction(database, voiceSessionId) {
	return parseStoredVoiceSessionRecord(database.db.prepare("SELECT value_json FROM cache_entries WHERE scope = ? AND key = ?").get(VOICE_SESSION_CACHE_SCOPE, voiceSessionId)?.value_json);
}
function writeVoiceSessionRecordInTransaction(database, record) {
	database.db.prepare(`INSERT INTO cache_entries (scope, key, value_json, blob, expires_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?)
       ON CONFLICT(scope, key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`).run(VOICE_SESSION_CACHE_SCOPE, record.voiceSessionId, JSON.stringify(record), record.updatedAt);
}
function assertVoiceSessionOwnership(record, params) {
	if (record.agentId !== params.agentId || record.sessionKey !== params.sessionKey) throw new Error("voice session does not belong to this agent session");
}
function operationKey(agentId, voiceSessionId) {
	return `${agentId}\0${voiceSessionId}`;
}
//#endregion
//#region src/talk/client-voice-mutation-digest-owner.ts
const CLIENT_VOICE_MUTATION_DIGEST_POLICY = {
	maxRetainedIntents: 64,
	maxRetainedIdentityBytes: 65536,
	maxConcurrentAttempts: 2,
	maxAttemptFailures: 3,
	attemptAbortAfterMs: 3e4,
	failureRetentionMs: 3e5
};
function formatMutationDigest(effects) {
	if (effects.length === 0) return;
	return ["Voice call changes", ...effects.slice(0, 12).map((effect) => `- ${effect.toolName}: ${effect.status === "started" ? "outcome not confirmed" : effect.status}`)].join("\n");
}
/** Deliver one point-in-time summary and mark the durable voice record after success. */
async function deliverClientVoiceMutationDigest(record, config, signal) {
	if (record.digestDeliveredAt) return;
	const text = formatMutationDigest(record.effects);
	if (!text) return;
	const entry = loadSessionEntryReadOnly({
		agentId: record.agentId,
		sessionKey: record.sessionKey
	});
	const target = resolveSessionDeliveryTarget({
		entry,
		requestedChannel: "last"
	});
	if (!target.channel || target.channel === "webchat" || !target.to) return;
	const { sendDurableMessageBatchCore } = await import("./runtime-Bsuryabg.js");
	const send = await sendDurableMessageBatchCore({
		cfg: config,
		channel: target.channel,
		to: target.to,
		...target.accountId ? { accountId: target.accountId } : {},
		...target.threadId != null ? { threadId: target.threadId } : {},
		payloads: [{ text }],
		durability: "required",
		requireUnknownSendReconciliation: true,
		signal,
		session: buildOutboundSessionContext({
			cfg: config,
			agentId: record.agentId,
			sessionKey: record.sessionKey,
			policySessionKey: record.sessionKey
		})
	});
	if (send.status === "failed" || send.status === "partial_failed") throw send.error;
	const deliveredAt = Date.now();
	runOpenClawAgentWriteTransaction((database) => {
		const current = readVoiceSessionRecordInTransaction(database, record.voiceSessionId);
		if (!current || current.digestDeliveredAt) return;
		current.digestDeliveredAt = deliveredAt;
		current.updatedAt = deliveredAt;
		writeVoiceSessionRecordInTransaction(database, current);
	}, { agentId: record.agentId });
}
var ClientVoiceMutationDigestOwner = class {
	constructor(options) {
		this.options = options;
		this.intents = /* @__PURE__ */ new Map();
		this.pendingKeys = /* @__PURE__ */ new Set();
		this.retryAfterActiveKeys = /* @__PURE__ */ new Set();
		this.activeAttempts = /* @__PURE__ */ new Map();
		this.retainedIdentityBytes = 0;
		this.generation = 0;
	}
	get policy() {
		return this.options.policy ?? CLIENT_VOICE_MUTATION_DIGEST_POLICY;
	}
	record(params) {
		const key = this.key(params);
		const existing = this.intents.get(key);
		if (existing) {
			existing.context = params.context;
			if (this.activeAttempts.has(key)) this.retryAfterActiveKeys.add(key);
			else this.pendingKeys.add(key);
			this.pump();
			return;
		}
		const identityBytes = Buffer.byteLength(params.agentId, "utf8") + Buffer.byteLength(params.voiceSessionId, "utf8") + 1;
		if (identityBytes > this.policy.maxRetainedIdentityBytes) {
			this.options.warn("voice mutation digest identity exceeds the retry owner byte limit");
			return;
		}
		if (this.intents.size >= this.policy.maxRetainedIntents || this.retainedIdentityBytes + identityBytes > this.policy.maxRetainedIdentityBytes) {
			this.options.warn("voice mutation digest retry owner is full");
			return;
		}
		const intent = {
			...params,
			identityBytes,
			failedAttempts: 0
		};
		this.intents.set(key, intent);
		this.retainedIdentityBytes += identityBytes;
		this.pendingKeys.add(key);
		this.pump();
	}
	retry(params) {
		const key = this.key(params);
		if (!this.intents.has(key)) return;
		if (this.activeAttempts.has(key)) this.retryAfterActiveKeys.add(key);
		else this.pendingKeys.add(key);
		this.pump();
	}
	retryAgent(agentId, context) {
		for (const [key, intent] of this.intents) {
			if (intent.agentId !== agentId) continue;
			intent.context = context;
			if (this.activeAttempts.has(key)) this.retryAfterActiveKeys.add(key);
			else this.pendingKeys.add(key);
		}
		this.pump();
	}
	snapshot() {
		return {
			active: this.activeAttempts.size,
			pending: this.pendingKeys.size,
			retained: this.intents.size,
			retainedIdentityBytes: this.retainedIdentityBytes
		};
	}
	clear() {
		for (const attempt of this.activeAttempts.values()) attempt.controller.abort(/* @__PURE__ */ new Error("voice mutation digest delivery owner reset"));
		for (const intent of this.intents.values()) if (intent.failureExpiry) clearTimeout(intent.failureExpiry);
		this.generation += 1;
		this.intents.clear();
		this.pendingKeys.clear();
		this.retryAfterActiveKeys.clear();
		this.activeAttempts.clear();
		this.retainedIdentityBytes = 0;
	}
	key(params) {
		return `${params.agentId}\0${params.voiceSessionId}`;
	}
	deleteIntent(key, expected) {
		const current = this.intents.get(key);
		if (!current || expected && current !== expected) return;
		this.intents.delete(key);
		this.pendingKeys.delete(key);
		this.retryAfterActiveKeys.delete(key);
		if (current.failureExpiry) clearTimeout(current.failureExpiry);
		this.retainedIdentityBytes -= current.identityBytes;
	}
	retainAfterFailure(key, intent) {
		if (intent.failureExpiry) return;
		intent.failureExpiry = setTimeout(() => {
			if (this.intents.get(key) !== intent) return;
			if (this.activeAttempts.has(key)) {
				intent.expireAfterActive = true;
				return;
			}
			this.deleteIntent(key, intent);
			this.options.warn(`voice mutation digest dropped after retry retention expired (${intent.failedAttempts} failed attempts)`);
		}, this.policy.failureRetentionMs);
		intent.failureExpiry.unref?.();
	}
	clearFailureState(intent) {
		if (intent.failureExpiry) {
			clearTimeout(intent.failureExpiry);
			delete intent.failureExpiry;
		}
		delete intent.expireAfterActive;
		intent.failedAttempts = 0;
	}
	pump() {
		while (this.activeAttempts.size < this.policy.maxConcurrentAttempts && this.pendingKeys.size > 0) {
			const key = this.pendingKeys.values().next().value;
			if (!key) return;
			this.pendingKeys.delete(key);
			const intent = this.intents.get(key);
			if (!intent || this.activeAttempts.has(key)) continue;
			this.startAttempt(key, intent);
		}
	}
	startAttempt(key, intent) {
		const controller = new AbortController();
		const attempt = {
			controller,
			intent,
			generation: this.generation
		};
		this.activeAttempts.set(key, attempt);
		const timeout = setTimeout(() => controller.abort(/* @__PURE__ */ new Error("voice mutation digest delivery abort requested")), this.policy.attemptAbortAfterMs);
		timeout.unref?.();
		let completion;
		try {
			completion = this.options.attempt({
				...intent,
				signal: controller.signal
			});
		} catch (error) {
			completion = Promise.reject(error instanceof Error ? error : new Error(String(error)));
		}
		completion.then((complete) => {
			if (complete) this.deleteIntent(key, intent);
			else this.clearFailureState(intent);
		}).catch((error) => {
			if (attempt.generation !== this.generation) return;
			intent.failedAttempts += 1;
			const message = error instanceof Error ? error.message : String(error);
			if (intent.failedAttempts >= this.policy.maxAttemptFailures) {
				this.deleteIntent(key, intent);
				this.options.warn(`voice mutation digest dropped after ${intent.failedAttempts} failed attempts: ${message}`);
				return;
			}
			this.options.warn(message);
			this.retainAfterFailure(key, intent);
		}).finally(() => {
			clearTimeout(timeout);
			if (attempt.generation !== this.generation) return;
			if (this.activeAttempts.get(key) === attempt) this.activeAttempts.delete(key);
			if (intent.expireAfterActive && this.intents.get(key) === intent) {
				this.deleteIntent(key, intent);
				this.options.warn(`voice mutation digest dropped after retry retention expired (${intent.failedAttempts} failed attempts)`);
				this.pump();
				return;
			}
			if (this.retryAfterActiveKeys.delete(key) && this.intents.has(key)) this.pendingKeys.add(key);
			this.pump();
		});
	}
};
//#endregion
//#region src/talk/client-voice-session.ts
/** Durable per-agent voice-call records for Talk continuity and mutation evidence. */
const voiceSessionByRunId = /* @__PURE__ */ new Map();
const voiceSessionOperations = createVoiceTranscriptOperationRegistry(VOICE_TRANSCRIPT_QUEUE_POLICY);
let unsubscribeToolEffects;
let unsubscribeRunCompletion;
function hasLiveConsultRun(record) {
	return record.consultRunIds.some((runId) => {
		const binding = voiceSessionByRunId.get(runId);
		return binding?.agentId === record.agentId && binding.voiceSessionId === record.voiceSessionId && binding.sessionKey === record.sessionKey;
	});
}
async function runVoiceSessionOperation(agentId, voiceSessionId, operation, options = {}) {
	return await voiceSessionOperations.run(operationKey(agentId, voiceSessionId), operation, options);
}
async function closeVoiceSessionOperationOwner(params) {
	await voiceSessionOperations.close(operationKey(params.agentId, params.voiceSessionId), async () => closeClientVoiceSessionInternal(params));
}
function effectStatus(event) {
	if (event.type === "tool.execution.started") return "started";
	if (event.type === "tool.execution.completed") return "succeeded";
	if (event.type === "tool.execution.blocked") return "blocked";
	return event.terminalReason === "cancelled" ? "cancelled" : "failed";
}
function recordClientVoiceToolEffect(event) {
	const runId = event.runId;
	if (!runId) return;
	const binding = voiceSessionByRunId.get(runId);
	if (!binding) return;
	runOpenClawAgentWriteTransaction((database) => {
		const record = readVoiceSessionRecordInTransaction(database, binding.voiceSessionId);
		if (!record) return;
		const existing = event.toolCallId ? record.effects.find((effect) => effect.runId === runId && effect.toolCallId === event.toolCallId) : record.effects.findLast((effect) => effect.runId === runId && effect.toolName === event.toolName && effect.status === "started");
		if (event.type !== "tool.execution.started" && !existing) return;
		if (event.type !== "tool.execution.started" && existing) {
			existing.status = effectStatus(event);
			existing.finishedAt = event.ts;
		} else if (event.mutatingAction === true && (!event.toolCallId || !existing)) record.effects.push({
			runId,
			...event.toolCallId ? { toolCallId: event.toolCallId } : {},
			toolName: event.toolName,
			startedAt: event.ts,
			status: "started"
		});
		record.updatedAt = Date.now();
		writeVoiceSessionRecordInTransaction(database, record);
	}, { agentId: binding.agentId });
}
function ensureToolEffectSubscription() {
	unsubscribeToolEffects ??= onTrustedToolExecutionEvent(recordClientVoiceToolEffect);
	unsubscribeRunCompletion ??= onTrustedInternalDiagnosticEvent((event) => {
		if (event.type !== "run.completed") return;
		const binding = voiceSessionByRunId.get(event.runId);
		if (!binding) return;
		voiceSessionByRunId.delete(event.runId);
		releaseClientVoiceConfirmationRun(binding.agentId, binding.voiceSessionId, event.runId);
		mutationDigestDeliveryOwner.retry(binding);
	}, { include: ["run.completed"] });
}
/** Create a call record or resume the same open call across transport restarts. */
function createOrResumeClientVoiceSession(params) {
	const voiceSessionId = params.voiceSessionId?.trim() || randomUUID();
	const provider = params.provider?.trim() || void 0;
	const now = params.now ?? Date.now();
	runOpenClawAgentWriteTransaction((database) => {
		const existing = readVoiceSessionRecordInTransaction(database, voiceSessionId);
		if (existing) {
			assertVoiceSessionOwnership(existing, params);
			if (existing.origin !== params.origin) throw new Error("voice session origin does not match");
			if (existing.status !== "open") throw new Error("voice session is already closed");
			if (existing.provider && provider && existing.provider !== provider) throw new Error("voice session provider does not match");
			if (!existing.provider && provider) existing.provider = provider;
			if (params.transcriptCapable === true) existing.transcriptCapable = true;
			existing.updatedAt = now;
			writeVoiceSessionRecordInTransaction(database, existing);
			return;
		}
		writeVoiceSessionRecordInTransaction(database, {
			version: 1,
			voiceSessionId,
			agentId: params.agentId,
			sessionKey: params.sessionKey,
			...provider ? { provider } : {},
			origin: params.origin,
			...params.transcriptCapable === true ? { transcriptCapable: true } : {},
			status: "open",
			createdAt: now,
			updatedAt: now,
			consultRunIds: [],
			effects: [],
			transcriptFailureKeys: []
		});
	}, { agentId: params.agentId });
	return voiceSessionId;
}
/** Read the canonical agent-session id without creating state during provider startup. */
function resolveClientVoiceAgentSessionId(params) {
	return loadSessionEntryReadOnly(params)?.sessionId?.trim() || void 0;
}
/** Ensure Talk has the same canonical agent-session row that chat turns append to. */
async function ensureClientVoiceAgentSessionEntry(params) {
	const created = await patchSessionEntryCore(params, (_entry, context) => {
		if (context.existingEntry?.sessionId) return null;
		if (context.existingEntry) return { sessionId: randomUUID() };
		return buildSessionCreationStamp({
			via: "talk",
			actor: params.creation?.actor ?? {
				type: "human",
				source: "unknown"
			},
			sandbox: params.creation?.sandbox
		});
	}, {
		fallbackEntry: mergeSessionEntry(void 0, {}),
		assertCommitAllowed: () => {
			params.assertCommitAllowed?.();
			if (params.deadlineAt !== void 0 && Date.now() >= params.deadlineAt) throw new Error("Realtime browser session expired during startup; try again");
		}
	});
	if (!created?.sessionId) throw new Error(`agent session could not be initialized (${params.sessionKey})`);
	return created.sessionId;
}
/** Correlate a consult run with its open call for confirmation and mutation evidence. */
function registerClientVoiceConsultRun(params) {
	let recordClosed = false;
	runOpenClawAgentWriteTransaction((database) => {
		const record = readVoiceSessionRecordInTransaction(database, params.voiceSessionId);
		if (!record) throw new Error("voice session not found");
		assertVoiceSessionOwnership(record, params);
		recordClosed = record.status === "closed";
		if (!record.consultRunIds.includes(params.runId)) {
			record.consultRunIds.push(params.runId);
			record.updatedAt = Date.now();
			writeVoiceSessionRecordInTransaction(database, record);
		}
	}, { agentId: params.agentId });
	const previousBinding = voiceSessionByRunId.get(params.runId);
	if (previousBinding && (previousBinding.agentId !== params.agentId || previousBinding.voiceSessionId !== params.voiceSessionId)) releaseClientVoiceConfirmationRun(previousBinding.agentId, previousBinding.voiceSessionId, params.runId);
	voiceSessionByRunId.set(params.runId, {
		agentId: params.agentId,
		voiceSessionId: params.voiceSessionId,
		sessionKey: params.sessionKey
	});
	if (recordClosed && params.config) mutationDigestDeliveryOwner.record({
		agentId: params.agentId,
		voiceSessionId: params.voiceSessionId,
		context: params.config
	});
	ensureToolEffectSubscription();
}
/** Return the open voice-call binding for one executing run. */
function resolveClientVoiceRunBinding(runId) {
	return runId ? voiceSessionByRunId.get(runId) : void 0;
}
/**
* Confirmation applies only when the session can observe spoken approvals:
* relay sessions (server hears utterances) or clients that report transcripts.
* Legacy clients without transcript reporting keep pre-gate behavior.
*/
function isClientVoiceSessionConfirmable(binding) {
	const record = readVoiceSessionRecord(binding.agentId, binding.voiceSessionId);
	return record?.origin === "relay" || record?.transcriptCapable === true || record?.hasUserTranscript === true;
}
/** Validate ownership and open state before starting a voice-bound consult. */
function assertClientVoiceSessionOpen(params) {
	const record = readVoiceSessionRecord(params.agentId, params.voiceSessionId);
	if (!record) throw new Error("voice session not found");
	assertVoiceSessionOwnership(record, params);
	if (record.status !== "open") throw new Error("voice session is closed");
	return record.origin;
}
/** Validate durable ownership without rejecting an idempotent close retry. */
function resolveClientVoiceSessionOrigin(params) {
	const record = readVoiceSessionRecord(params.agentId, params.voiceSessionId);
	if (!record) throw new Error("voice session not found");
	assertVoiceSessionOwnership(record, params);
	return record.origin;
}
/** Resolve the newest open client-owned call for legacy tool-call clients. */
function resolveOpenClientVoiceSessionId(params) {
	const rows = openOpenClawAgentDatabase({ agentId: params.agentId }).db.prepare("SELECT value_json FROM cache_entries WHERE scope = ? ORDER BY updated_at DESC").all(VOICE_SESSION_CACHE_SCOPE);
	let match;
	for (const row of rows) {
		const record = parseStoredVoiceSessionRecord(row.value_json);
		if (record?.origin === "client" && record.status === "open" && record.agentId === params.agentId && record.sessionKey === params.sessionKey) {
			if (match) return;
			match = record.voiceSessionId;
		}
	}
	return match;
}
function buildPersistedVoiceMessage(params) {
	const provenance = {
		kind: "realtime_voice",
		sourceChannel: "talk"
	};
	if (params.role === "user") return {
		role: "user",
		content: [{
			type: "text",
			text: params.text
		}],
		timestamp: params.timestamp,
		provenance
	};
	return {
		role: "assistant",
		content: [{
			type: "text",
			text: params.text
		}],
		api: "realtime",
		provider: params.provider,
		model: "realtime-voice",
		stopReason: "stop",
		timestamp: params.timestamp,
		provenance
	};
}
function transcriptFailureKey(entryId) {
	return createHash("sha256").update(entryId, "utf8").digest("hex");
}
function appendVoiceTranscript(params) {
	const normalized = {
		...params,
		text: normalizeVoiceTranscriptText(params.text)
	};
	if (!normalized.text) return Promise.resolve();
	return runVoiceSessionOperation(normalized.agentId, normalized.voiceSessionId, async () => {
		const record = readVoiceSessionRecord(normalized.agentId, normalized.voiceSessionId);
		if (!record) throw new Error("voice session not found");
		assertVoiceSessionOwnership(record, normalized);
		if (record.status !== "open") throw new Error("voice session is closed");
		if (record.origin !== normalized.origin) throw new Error("voice session origin does not allow this transcript source");
		const failureKey = transcriptFailureKey(normalized.entryId);
		if (record.transcriptFailureKeys.length >= 41 && !record.transcriptFailureKeys.includes(failureKey)) throw new Error("voice transcript persistence has too many unresolved entries");
		const sessionTarget = {
			...normalized.sessionTarget,
			agentId: normalized.agentId
		};
		const sessionEntry = loadSessionEntryReadOnly(sessionTarget);
		if (!sessionEntry?.sessionId) throw new Error(`agent session not found (${normalized.sessionKey})`);
		const observedAt = Date.now();
		const timestamp = normalized.timestamp ?? observedAt;
		runOpenClawAgentWriteTransaction((database) => {
			const current = readVoiceSessionRecordInTransaction(database, normalized.voiceSessionId);
			if (!current) throw new Error("voice session disappeared during transcript reservation");
			assertVoiceSessionOwnership(current, normalized);
			if (!current.transcriptFailureKeys.includes(failureKey)) current.transcriptFailureKeys.push(failureKey);
			current.updatedAt = Date.now();
			writeVoiceSessionRecordInTransaction(database, current);
		}, { agentId: normalized.agentId });
		await appendTranscriptMessage({
			...sessionTarget,
			sessionId: sessionEntry.sessionId
		}, {
			...normalized.config ? { config: normalized.config } : {},
			eventId: `voice:${normalized.voiceSessionId}:${normalized.entryId}`,
			message: buildPersistedVoiceMessage({
				role: normalized.role,
				text: normalized.text,
				timestamp,
				provider: record.provider ?? "realtime"
			}),
			now: timestamp
		});
		runOpenClawAgentWriteTransaction((database) => {
			const current = readVoiceSessionRecordInTransaction(database, normalized.voiceSessionId);
			if (!current) throw new Error("voice session disappeared during transcript append");
			assertVoiceSessionOwnership(current, normalized);
			if (normalized.role === "user") current.hasUserTranscript = true;
			current.transcriptFailureKeys = current.transcriptFailureKeys.filter((key) => key !== failureKey);
			current.updatedAt = Date.now();
			writeVoiceSessionRecordInTransaction(database, current);
		}, { agentId: normalized.agentId });
		if (normalized.role === "user") noteClientVoiceConfirmationUtterance({
			agentId: normalized.agentId,
			voiceSessionId: normalized.voiceSessionId,
			text: normalized.text,
			timestamp: observedAt
		});
	}, { weight: normalized.text.length });
}
/** Append one finalized client-owned transcript item idempotently. */
function appendClientVoiceTranscript(params) {
	return appendVoiceTranscript({
		...params,
		origin: "client"
	});
}
/** Wait for the accepted transcript/effect prefix without closing the logical call. */
async function flushClientVoiceSessionWrites(params) {
	await voiceSessionOperations.flush(operationKey(params.agentId, params.voiceSessionId));
}
/** Append one finalized relay-owned transcript item idempotently. */
function appendRelayVoiceTranscript(params) {
	return appendVoiceTranscript({
		...params,
		origin: "relay"
	});
}
const mutationDigestDeliveryOwner = new ClientVoiceMutationDigestOwner({
	attempt: async ({ agentId, voiceSessionId, context: config, signal }) => {
		const record = readVoiceSessionRecord(agentId, voiceSessionId);
		if (!record) return true;
		if (record.status !== "closed" || hasLiveConsultRun(record)) return false;
		await deliverClientVoiceMutationDigest(record, config, signal);
		return true;
	},
	warn: (message) => console.warn(`[talk] deferred voice mutation digest failed: ${message}`)
});
async function closeClientVoiceSessionInternal(params) {
	const existing = readVoiceSessionRecord(params.agentId, params.voiceSessionId);
	if (!existing) throw new Error("voice session not found");
	assertVoiceSessionOwnership(existing, params);
	const now = params.now ?? Date.now();
	runOpenClawAgentWriteTransaction((database) => {
		const current = readVoiceSessionRecordInTransaction(database, params.voiceSessionId);
		if (!current) throw new Error("voice session disappeared during close");
		assertVoiceSessionOwnership(current, params);
		if (current.transcriptFailureKeys.length > 0 && params.transcriptFailurePolicy === "require-success") throw new Error("voice transcript persistence must be retried before close");
		if (params.transcriptFailurePolicy === "retain-and-close" && current.origin !== "relay") throw new Error("only relay voice sessions may close with unresolved transcripts");
		if (current.status === "open") {
			current.status = "closed";
			current.closedAt = now;
			current.updatedAt = now;
			writeVoiceSessionRecordInTransaction(database, current);
		}
	}, { agentId: params.agentId });
	const closed = readVoiceSessionRecord(params.agentId, params.voiceSessionId);
	if (!closed) throw new Error("voice session disappeared after close");
	const liveRunIds = closed.consultRunIds.filter((runId) => {
		const binding = voiceSessionByRunId.get(runId);
		return binding?.voiceSessionId === params.voiceSessionId && binding.agentId === params.agentId;
	});
	deactivateClientVoiceConfirmationSession(params.agentId, params.voiceSessionId, liveRunIds);
	mutationDigestDeliveryOwner.record({
		agentId: params.agentId,
		voiceSessionId: params.voiceSessionId,
		context: params.config
	});
}
/** Close a logical voice call after its accepted transcript prefix is durable. */
async function closeClientVoiceSession(params) {
	await closeVoiceSessionOperationOwner({
		...params,
		transcriptFailurePolicy: "require-success"
	});
}
/**
* Terminally close a relay call after its bounded append retries settle.
* Relays have no payload replay owner after teardown, so unresolved hashes remain as audit state.
*/
async function closeRelayVoiceSessionRecord(params) {
	await closeVoiceSessionOperationOwner({
		...params,
		transcriptFailurePolicy: "retain-and-close"
	});
}
/** Close abandoned open calls idle for the fixed six-hour recovery window. */
async function closeStaleClientVoiceSessions(params) {
	const now = params.now ?? Date.now();
	mutationDigestDeliveryOwner.retryAgent(params.agentId, params.config);
	const stale = openOpenClawAgentDatabase({ agentId: params.agentId }).db.prepare("SELECT value_json FROM cache_entries WHERE scope = ? AND updated_at <= ?").all(VOICE_SESSION_CACHE_SCOPE, now - VOICE_SESSION_STALE_AFTER_MS).flatMap((row) => {
		const record = parseStoredVoiceSessionRecord(row.value_json);
		return record && record.status === "open" && record.voiceSessionId !== params.excludeVoiceSessionId ? [record] : [];
	});
	let closed = 0;
	for (const record of stale) try {
		await closeClientVoiceSession({
			agentId: params.agentId,
			sessionKey: record.sessionKey,
			voiceSessionId: record.voiceSessionId,
			config: params.config,
			now
		});
		closed += 1;
	} catch (error) {
		params.warn?.(`failed to close stale voice session ${record.voiceSessionId}: ${error instanceof Error ? error.message : String(error)}`);
	}
	return closed;
}
const clientVoiceSessionTesting = {
	readRecord: readVoiceSessionRecord,
	digestDeliveryPolicy: CLIENT_VOICE_MUTATION_DIGEST_POLICY,
	digestDeliverySnapshot: () => mutationDigestDeliveryOwner.snapshot(),
	reset() {
		voiceSessionByRunId.clear();
		voiceSessionOperations.clear();
		mutationDigestDeliveryOwner.clear();
		unsubscribeToolEffects?.();
		unsubscribeToolEffects = void 0;
		unsubscribeRunCompletion?.();
		unsubscribeRunCompletion = void 0;
	}
};
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.clientVoiceSessionTestApi")] = clientVoiceSessionTesting;
//#endregion
//#region src/agents/tool-loop-admission.ts
async function evaluateToolLoopCall(call, ctx, stateOverride) {
	if (!ctx.sessionKey || ctx.loopDetection?.enabled !== true) return;
	const toolName = normalizeToolPolicyName(call.toolName || "tool");
	const { getDiagnosticSessionState, logToolLoopAction, detectToolCallLoop } = await loadBeforeToolCallRuntime();
	const sessionState = getDiagnosticSessionState({
		sessionKey: ctx.sessionKey,
		sessionId: ctx.sessionId
	});
	const result = detectToolCallLoop(stateOverride ?? sessionState, toolName, call.params, ctx.loopDetection, ctx.runId ? { runId: ctx.runId } : void 0);
	if (!result.stuck) return;
	if (result.level === "critical") {
		beforeToolCallLog.error(`Blocking ${toolName} due to critical loop: ${result.message}`);
		logToolLoopAction({
			sessionKey: ctx.sessionKey,
			sessionId: ctx.sessionId,
			toolName,
			level: "critical",
			action: "block",
			detector: result.detector,
			count: result.count,
			message: result.message,
			pairedToolName: result.pairedToolName
		});
		return {
			kind: "critical-tool-loop",
			toolCallId: call.toolCallId ?? "",
			toolName,
			actionKey: hashToolCall(toolName, call.params),
			detector: result.detector,
			count: result.count,
			reason: result.message
		};
	}
	const baseWarningKey = result.warningKey ?? `${result.detector}:${toolName}`;
	if (shouldEmitLoopWarning(sessionState, ctx.runId ? `${ctx.runId}:${baseWarningKey}` : baseWarningKey, result.count)) {
		beforeToolCallLog.warn(`Loop warning for ${toolName}: ${result.message}`);
		logToolLoopAction({
			sessionKey: ctx.sessionKey,
			sessionId: ctx.sessionId,
			toolName,
			level: "warning",
			action: "warn",
			detector: result.detector,
			count: result.count,
			message: result.message,
			pairedToolName: result.pairedToolName
		});
		return {
			kind: "tool-loop-warning",
			toolCallId: call.toolCallId ?? "",
			count: result.count
		};
	}
}
async function recordToolLoopCall(call, ctx) {
	if (!ctx.sessionKey || ctx.loopDetection?.enabled !== true) return;
	const { getDiagnosticSessionState, recordToolCall } = await loadBeforeToolCallRuntime();
	recordToolCall(getDiagnosticSessionState({
		sessionKey: ctx.sessionKey,
		sessionId: ctx.sessionId
	}), normalizeToolPolicyName(call.toolName || "tool"), call.params, call.toolCallId, ctx.loopDetection, ctx.runId ? { runId: ctx.runId } : void 0);
}
/** Preserve the existing single-call admission path for harnesses without batch control. */
async function admitSingleToolCallLoop(call, ctx) {
	const intervention = await evaluateToolLoopCall(call, ctx);
	if (intervention?.kind !== "critical-tool-loop") await recordToolLoopCall(call, ctx);
	return intervention;
}
/**
* Admit an assistant tool batch atomically. Successful calls reserve exact
* markers here, then agent-core commits their history in assistant order at
* the final launch boundary. A later veto still records only denial evidence.
*/
async function admitToolCallBatch(calls, ctx) {
	if (!ctx.sessionKey || ctx.loopDetection?.enabled !== true) return {};
	const { getDiagnosticSessionState, markDiagnosticArgumentChurnObservation, reconcileToolCallExecutionParams, recordToolCall, resolveToolLoopWarningThreshold } = await loadBeforeToolCallRuntime();
	const warningThreshold = resolveToolLoopWarningThreshold();
	const sessionState = getDiagnosticSessionState({
		sessionKey: ctx.sessionKey,
		sessionId: ctx.sessionId
	});
	const projectedState = {
		...sessionState,
		toolCallHistory: [...sessionState.toolCallHistory ?? []]
	};
	const recordLoopVeto = (state, call) => {
		recordToolCall(state, normalizeToolPolicyName(call.toolCall.name || "tool"), call.args, call.toolCall.id, ctx.loopDetection, ctx.runId ? { runId: ctx.runId } : void 0);
		const projectedCall = state.toolCallHistory?.at(-1);
		if (projectedCall) projectedCall.outcomeKind = "tool-loop-veto";
	};
	const projectLoopVeto = (call) => {
		const scratchState = {
			...sessionState,
			toolCallHistory: []
		};
		recordLoopVeto(scratchState, call);
		const projectedCall = scratchState.toolCallHistory?.at(-1);
		if (projectedCall) projectedState.toolCallHistory?.push(projectedCall);
	};
	const warnings = [];
	for (const call of calls) {
		const intervention = await evaluateToolLoopCall({
			toolName: normalizeToolPolicyName(call.toolCall.name || "tool"),
			params: call.args,
			toolCallId: call.toolCall.id
		}, ctx, projectedState);
		if (intervention?.kind === "critical-tool-loop") {
			for (const rejectedCall of calls) if (hashToolCall(normalizeToolPolicyName(rejectedCall.toolCall.name || "tool"), rejectedCall.args) === intervention.actionKey) recordLoopVeto(sessionState, rejectedCall);
			return { intervention };
		}
		if (intervention) warnings.push(intervention);
		projectLoopVeto(call);
	}
	for (const call of calls) recordBatchAdmittedToolCall(call.toolCall.id, ctx.runId);
	const admittedById = new Map(calls.map((call) => [call.toolCall.id, { toolName: normalizeToolPolicyName(call.toolCall.name || "tool") }]));
	const committedIds = /* @__PURE__ */ new Set();
	const commitReadyCall = (readyCall) => {
		const admitted = admittedById.get(readyCall.toolCallId);
		if (!admitted || committedIds.has(readyCall.toolCallId)) return;
		recordToolCall(sessionState, admitted.toolName, readyCall.args, readyCall.toolCallId, ctx.loopDetection, ctx.runId ? { runId: ctx.runId } : void 0);
		const churn = reconcileToolCallExecutionParams(sessionState, {
			toolName: admitted.toolName,
			toolParams: readyCall.args,
			toolCallId: readyCall.toolCallId,
			runId: ctx.runId,
			warningThreshold
		});
		markDiagnosticArgumentChurnObservation({
			sessionKey: ctx.sessionKey,
			sessionId: ctx.sessionId,
			runId: ctx.runId,
			active: churn.active
		});
		committedIds.add(readyCall.toolCallId);
	};
	return {
		warnings,
		commitReadyCalls(readyCalls) {
			if (readyCalls.length === 1 && readyCalls[0]) {
				commitReadyCall(readyCalls[0]);
				return;
			}
			const readyById = new Map(readyCalls.map((call) => [call.toolCallId, call]));
			for (const call of calls) {
				const readyCall = readyById.get(call.toolCall.id);
				if (readyCall) commitReadyCall(readyCall);
			}
		},
		releaseSkippedCalls(toolCallIds) {
			releaseBatchAdmittedToolCalls(toolCallIds, ctx.runId);
		}
	};
}
//#endregion
//#region src/agents/agent-tools.before-tool-call.policy.ts
const BEFORE_TOOL_CALL_HOOK_FAILURE_REASON = "Tool call blocked because before_tool_call hook failed";
/** Keep receipt routing private without widening observable hook outcomes. */
function markPrivateDecision(outcome, marker) {
	Object.defineProperty(outcome, marker, { value: true });
}
function getBeforeToolCallPolicyDiagnosticState() {
	const policyRegistry = getGlobalHookRunnerRegistry() ?? void 0;
	return {
		hasBeforeToolCallHook: getGlobalHookRunner()?.hasHooks("before_tool_call") === true,
		trustedToolPolicies: getTrustedToolPolicyDiagnosticEntries(policyRegistry)
	};
}
/** Return true when any before_tool_call policy could affect tool execution. */
function hasBeforeToolCallPolicy() {
	const state = getBeforeToolCallPolicyDiagnosticState();
	return state.hasBeforeToolCallHook || state.trustedToolPolicies.length > 0;
}
/** Consume voice approval only after tool-owned finalization produces execution params. */
function consumeFinalClientVoiceToolConfirmation(args) {
	const voiceRun = resolveClientVoiceRunBinding(args.ctx?.runId);
	return consumeClientVoiceToolConfirmationPolicy({
		agentId: voiceRun?.agentId,
		voiceSessionId: voiceRun?.voiceSessionId,
		runId: args.ctx?.runId,
		toolName: normalizeToolPolicyName(args.toolName || "tool"),
		toolParams: args.params,
		...voiceRun ? { isConfirmable: () => isClientVoiceSessionConfirmable(voiceRun) } : {}
	});
}
async function runBeforeToolCallHook(args) {
	const toolName = normalizeToolPolicyName(args.toolName || "tool");
	const params = args.params;
	let loopWarning;
	const withLoopWarning = (outcome) => {
		if (!outcome.blocked && loopWarning) outcome.loopWarning = loopWarning;
		return outcome;
	};
	let releaseArgumentChurnPolicyWait;
	try {
		if (args.ctx?.sessionKey) {
			if (args.ctx.loopDetection?.enabled === true) {
				const { markDiagnosticArgumentChurnObservation } = await loadBeforeToolCallRuntime();
				const policyWaitToken = Symbol("before-tool-call-policy-wait");
				const policyWaitRef = {
					sessionKey: args.ctx.sessionKey,
					sessionId: args.ctx.sessionId,
					runId: args.ctx.runId,
					policyWaitToken
				};
				markDiagnosticArgumentChurnObservation({
					...policyWaitRef,
					policyWait: "enter"
				});
				releaseArgumentChurnPolicyWait = () => markDiagnosticArgumentChurnObservation({
					...policyWaitRef,
					policyWait: "exit"
				});
			}
			if (!(args.toolCallId !== void 0 && consumeBatchAdmittedToolCall(args.toolCallId, args.ctx.runId))) {
				const intervention = await admitSingleToolCallLoop({
					toolName,
					params,
					toolCallId: args.toolCallId
				}, args.ctx);
				if (intervention?.kind === "critical-tool-loop") {
					const outcome = {
						blocked: true,
						kind: "veto",
						deniedReason: "tool-loop",
						reason: intervention.reason,
						params
					};
					markPrivateDecision(outcome, "genericDecision");
					return outcome;
				}
				loopWarning = intervention;
			}
		}
		const hookRunner = getGlobalHookRunner();
		const hasBeforeToolCallHooks = hookRunner?.hasHooks("before_tool_call") === true;
		const policyRegistry = getGlobalHookRunnerRegistry() ?? void 0;
		const shouldRunTrustedPolicies = hasTrustedToolPolicies(policyRegistry);
		const normalizedParams = isPlainObject(params) ? params : {};
		const initialCorePolicyResult = await resolveSkillWorkshopToolApproval({
			toolName,
			toolParams: normalizedParams,
			...args.ctx?.config ? { config: args.ctx.config } : {},
			...args.ctx?.workspaceDir ? { workspaceDir: args.ctx.workspaceDir } : {}
		});
		const voiceRun = resolveClientVoiceRunBinding(args.ctx?.runId);
		const voiceConfirmation = checkClientVoiceToolConfirmationPolicy({
			agentId: voiceRun?.agentId,
			voiceSessionId: voiceRun?.voiceSessionId,
			runId: args.ctx?.runId,
			toolName,
			toolParams: normalizedParams,
			...voiceRun ? { isConfirmable: () => isClientVoiceSessionConfirmable(voiceRun) } : {}
		});
		if (!voiceConfirmation.allowed) return {
			blocked: true,
			kind: "veto",
			deniedReason: "client-voice-confirmation",
			reason: voiceConfirmation.reason,
			params
		};
		if (!initialCorePolicyResult && !shouldRunTrustedPolicies && !hasBeforeToolCallHooks) return withLoopWarning({
			blocked: false,
			params
		});
		const deriveOptions = args.ctx?.cwd || args.ctx?.sandbox ? {
			...args.ctx.cwd ? { cwd: args.ctx.cwd } : {},
			...args.ctx.sandbox ? { sandbox: args.ctx.sandbox } : {},
			...args.signal ? { signal: args.signal } : {}
		} : void 0;
		const derivedToolParams = await deriveToolParams(toolName, normalizedParams, deriveOptions);
		const deriveToolEventParams = async (candidateParams) => {
			const derived = await deriveToolParams(toolName, candidateParams, deriveOptions);
			return derived.derivedPaths ? { derivedPaths: derived.derivedPaths } : {};
		};
		const toolIdentity = {
			...args.toolKind && { toolKind: args.toolKind },
			...args.toolInputKind && { toolInputKind: args.toolInputKind }
		};
		const buildToolContext = (identity) => ({
			toolName,
			...identity,
			...args.ctx?.agentId && { agentId: args.ctx.agentId },
			...args.ctx?.sessionKey && { sessionKey: args.ctx.sessionKey },
			...args.ctx?.sessionId && { sessionId: args.ctx.sessionId },
			...args.ctx?.runId && { runId: args.ctx.runId },
			...args.signal ? { abortSignal: args.signal } : {},
			...args.ctx?.trace && { trace: freezeDiagnosticTraceContext(args.ctx.trace) },
			...args.toolCallId && { toolCallId: args.toolCallId },
			...args.ctx?.channelId && { channelId: args.ctx.channelId },
			...args.ctx?.requester ? { requester: args.ctx.requester } : {}
		});
		const toolContext = buildToolContext(toolIdentity);
		let trustedPolicyParams = normalizedParams;
		const trustedPolicyResult = shouldRunTrustedPolicies ? await runTrustedToolPolicies({
			toolName,
			params: normalizedParams,
			...toolIdentity,
			...args.ctx?.runId && { runId: args.ctx.runId },
			...args.toolCallId && { toolCallId: args.toolCallId },
			...derivedToolParams.derivedPaths ? { derivedPaths: derivedToolParams.derivedPaths } : {}
		}, toolContext, {
			...policyRegistry ? { registry: policyRegistry } : {},
			...args.ctx?.config ? { config: args.ctx.config } : {},
			deriveEvent: deriveToolEventParams,
			normalizeEvent(eventValue) {
				const normalizedEventParams = reconcileCodeModeExecBeforeHookParams({
					owner: { toolKind: eventValue.toolKind },
					originalParams: trustedPolicyParams,
					hookParams: trustedPolicyParams,
					adjustedParams: eventValue.params
				});
				if (!isPlainObject(normalizedEventParams)) return;
				trustedPolicyParams = normalizedEventParams;
				const normalizedEventIdentity = getCodeModeExecBeforeHookMetadataForToolKind({
					toolKind: eventValue.toolKind,
					params: normalizedEventParams
				});
				return {
					params: normalizedEventParams,
					...normalizedEventIdentity ? {
						event: normalizedEventIdentity,
						ctx: normalizedEventIdentity
					} : {}
				};
			}
		}) : void 0;
		if (trustedPolicyResult?.block) {
			const outcome = {
				blocked: true,
				kind: "veto",
				deniedReason: "plugin-before-tool-call",
				reason: trustedPolicyResult.blockReason || "Tool call blocked by trusted plugin policy",
				params
			};
			markPrivateDecision(outcome, "genericDecision");
			return outcome;
		}
		let trustedApprovalParams;
		let trustedApprovalResolution;
		if (trustedPolicyResult?.requireApproval) {
			const approvalOutcome = await resolveBeforeToolCallApprovalOutcome({
				result: trustedPolicyResult,
				approvalMode: args.approvalMode,
				toolName,
				...args.toolCallId ? { toolCallId: args.toolCallId } : {},
				...args.ctx ? { ctx: args.ctx } : {},
				signal: args.signal,
				baseParams: params
			});
			if (approvalOutcome) {
				if (approvalOutcome.blocked) return approvalOutcome;
				if (approvalOutcome.deferredApproval) return withLoopWarning(approvalOutcome);
				trustedApprovalParams = approvalOutcome.params;
				trustedApprovalResolution = approvalOutcome.approvalResolution;
			}
		}
		const policyAdjustedParams = trustedApprovalParams ?? trustedPolicyResult?.params ?? params;
		const policyAdjustedToolIdentity = getCodeModeExecBeforeHookMetadataForToolKind({
			toolKind: args.toolKind,
			params: policyAdjustedParams
		}) ?? toolIdentity;
		const policyAdjustedToolContext = buildToolContext(policyAdjustedToolIdentity);
		const policyAdjustedDerivedToolParams = trustedPolicyResult?.params && isPlainObject(policyAdjustedParams) ? await deriveToolParams(toolName, policyAdjustedParams, deriveOptions) : derivedToolParams;
		if (!hasBeforeToolCallHooks) {
			const finalApprovalOutcome = await resolveSkillWorkshopApprovalForFinalParams({
				toolName,
				params: policyAdjustedParams,
				approvalMode: args.approvalMode,
				...args.toolCallId ? { toolCallId: args.toolCallId } : {},
				...args.ctx ? { ctx: args.ctx } : {},
				signal: args.signal
			});
			if (finalApprovalOutcome) return withLoopWarning(finalApprovalOutcome);
			const allowed = {
				blocked: false,
				params: policyAdjustedParams
			};
			if (trustedApprovalResolution) {
				markPrivateDecision(allowed, "ownerDecision");
				allowed.approvalResolution = trustedApprovalResolution;
			}
			return withLoopWarning(allowed);
		}
		const hookEventParams = isPlainObject(policyAdjustedParams) ? policyAdjustedParams : {};
		const callerIdentity = getGatewayToolCallerIdentity();
		let ownerDecisionMarked = false;
		const receipt = callerIdentity?.executionIdentityToken && callerIdentity.receiptAuthority ? {
			token: callerIdentity.executionIdentityToken,
			assertAuthority: callerIdentity.receiptAuthority,
			markOwnerDecision: () => {
				ownerDecisionMarked = true;
			}
		} : void 0;
		const hookResult = await hookRunner.runBeforeToolCall({
			toolName,
			params: hookEventParams,
			...policyAdjustedToolIdentity,
			...args.ctx?.runId && { runId: args.ctx.runId },
			...args.toolCallId && { toolCallId: args.toolCallId },
			...policyAdjustedDerivedToolParams.derivedPaths ? { derivedPaths: policyAdjustedDerivedToolParams.derivedPaths } : {}
		}, policyAdjustedToolContext, receipt);
		if (hookResult?.block) return {
			blocked: true,
			kind: "veto",
			deniedReason: "plugin-before-tool-call",
			reason: hookResult.blockReason || "Tool call blocked by plugin hook",
			params: policyAdjustedParams
		};
		let finalParams = policyAdjustedParams;
		let finalApprovalResolution = trustedApprovalResolution;
		if (hookResult?.requireApproval) {
			const approvalOutcome = await resolveBeforeToolCallApprovalOutcome({
				result: hookResult,
				approvalMode: args.approvalMode,
				toolName,
				...args.toolCallId ? { toolCallId: args.toolCallId } : {},
				...args.ctx ? { ctx: args.ctx } : {},
				signal: args.signal,
				baseParams: policyAdjustedParams
			});
			if (approvalOutcome) {
				if (approvalOutcome.blocked) return approvalOutcome;
				if (approvalOutcome.deferredApproval) return withLoopWarning(approvalOutcome);
				finalParams = approvalOutcome.params;
				finalApprovalResolution = approvalOutcome.approvalResolution ?? finalApprovalResolution;
			}
		}
		if (hookResult?.params) finalParams = reconcileCodeModeExecBeforeHookParams({
			owner: { toolKind: args.toolKind },
			originalParams: policyAdjustedParams,
			hookParams: policyAdjustedParams,
			adjustedParams: mergeParamsWithApprovalOverrides(finalParams, hookResult.params)
		});
		const finalApprovalOutcome = await resolveSkillWorkshopApprovalForFinalParams({
			toolName,
			params: finalParams,
			approvalMode: args.approvalMode,
			...args.toolCallId ? { toolCallId: args.toolCallId } : {},
			...args.ctx ? { ctx: args.ctx } : {},
			signal: args.signal
		});
		if (finalApprovalOutcome) return withLoopWarning(finalApprovalOutcome);
		const allowed = {
			blocked: false,
			params: finalParams
		};
		if (ownerDecisionMarked || finalApprovalResolution) markPrivateDecision(allowed, "ownerDecision");
		if (finalApprovalResolution) allowed.approvalResolution = finalApprovalResolution;
		return withLoopWarning(allowed);
	} catch (err) {
		const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
		const cause = unwrapErrorCause(err);
		beforeToolCallLog.error(`before_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(cause)}`);
		return {
			blocked: true,
			kind: "failure",
			deniedReason: "plugin-before-tool-call",
			disposition: resolveToolErrorDiagnostic(cause, args.signal).terminalReason,
			reason: BEFORE_TOOL_CALL_HOOK_FAILURE_REASON,
			params
		};
	} finally {
		try {
			releaseArgumentChurnPolicyWait?.();
		} catch (err) {
			beforeToolCallLog.warn(`before_tool_call policy-wait release failed: tool=${toolName} error=${String(err)}`);
		}
	}
}
//#endregion
//#region src/skills/runtime/run-usage.ts
const MAX_TRACKED_SKILL_USAGE_RUNS = 1024;
const skillUsageByRun = /* @__PURE__ */ new Map();
/** Records the skills the foreground run demonstrably invoked or read. */
function recordRunSkillUsage(params) {
	const runId = params.runId;
	if (!runId) return;
	const usage = skillUsageByRun.get(runId) ?? /* @__PURE__ */ new Map();
	const record = {
		name: params.name,
		source: params.source,
		activation: params.activation,
		...params.skillFile ? { skillFile: params.skillFile } : {}
	};
	usage.set(`${record.source}\u0000${record.name}\u0000${record.activation}`, record);
	skillUsageByRun.set(runId, usage);
	pruneMapToMaxSize(skillUsageByRun, MAX_TRACKED_SKILL_USAGE_RUNS);
}
/** Checks whether this run demonstrably used one writable workspace skill. */
function hasRunWorkspaceSkillUsage(params) {
	if (!params.runId) return false;
	for (const usage of skillUsageByRun.get(params.runId)?.values() ?? []) if (usage.source === "workspace" && (usage.skillFile === params.skillFile || !usage.skillFile && usage.name === params.name)) return true;
	return false;
}
/** Transfers one completed run's usage receipt to its terminal side effects. */
function consumeRunSkillUsage(runId) {
	if (!runId) return [];
	const usage = skillUsageByRun.get(runId);
	skillUsageByRun.delete(runId);
	return usage ? [...usage.values()] : [];
}
//#endregion
//#region src/agents/agent-tool-source-execution-guard.ts
/** Freeze the invocation's operational fence before asynchronous source work. */
function captureAgentToolSourceExecutionGuard(signal) {
	const authority = getGatewayToolCallerIdentity()?.receiptAuthority;
	return () => {
		signal?.throwIfAborted();
		if (authority?.() === false) throw new Error("tool invocation authority is no longer active");
	};
}
const sourceExecutionGuards = /* @__PURE__ */ new WeakMap();
/** Bind a host-owned guard without mutating a tool that another attempt may reuse. */
function bindAgentToolSourceExecutionGuard(tool, guard) {
	const bound = copyAgentToolMetadata(tool, { ...tool });
	sourceExecutionGuards.set(bound, guard);
	return bound;
}
function copyAgentToolSourceExecutionGuard(source, target) {
	const guard = sourceExecutionGuards.get(source);
	if (guard) sourceExecutionGuards.set(target, guard);
}
function runAgentToolSourceExecutionGuard(tool) {
	sourceExecutionGuards.get(tool)?.();
}
//#endregion
//#region src/agents/agent-tools.execution-preparer.ts
const INTERNAL_EXECUTION_CONTROL = Symbol("openclawInternalExecutionControl");
function createControl() {
	let markReady;
	let decide;
	const ready = new Promise((resolve) => {
		markReady = resolve;
	});
	const decision = new Promise((resolve) => {
		decide = resolve;
	});
	return {
		[INTERNAL_EXECUTION_CONTROL]: true,
		ready,
		pause: (args) => {
			markReady(args);
			return decision;
		},
		launch: (start) => decide({
			launch: true,
			start
		}),
		dispose: () => decide({ launch: false })
	};
}
function readInternalExecutionControl(value) {
	return value && typeof value === "object" && value[INTERNAL_EXECUTION_CONTROL] === true ? value : void 0;
}
function createInternalExecutionPreparer(startExecution) {
	return async (params) => {
		const control = createControl();
		const execution = startExecution(params, control);
		const settled = await Promise.race([control.ready.then((args) => ({
			kind: "ready",
			args
		})), execution.then((result) => ({
			kind: "result",
			result
		}), (error) => ({
			kind: "error",
			error
		}))]);
		if (settled.kind !== "ready") return {
			kind: "immediate",
			outcome: settled.kind === "result" ? {
				kind: "result",
				result: settled.result,
				isError: false
			} : {
				kind: "error",
				error: settled.error
			},
			dispose() {}
		};
		let disposed = false;
		return {
			kind: "ready",
			args: settled.args,
			execute(start) {
				if (!disposed) control.launch(start);
				return execution;
			},
			dispose() {
				if (!disposed) {
					disposed = true;
					control.dispose();
					execution.catch(() => void 0);
				}
			}
		};
	};
}
//#endregion
//#region src/agents/agent-tools.execution-validation.ts
const executionValidators = new AsyncLocalStorage();
const INTERNAL_TOOL_EXECUTION_VALIDATION = Symbol.for("openclaw.internalToolExecutionValidation");
/** Keep per-call validation inside the policy wrapper's final execution boundary. */
async function runWithToolExecutionValidation(toolCallId, validator, execute) {
	return await executionValidators.run({
		toolCallId,
		validate: validator
	}, execute);
}
/** Validate hook-adjusted arguments without leaking a validator into concurrent calls. */
async function validateToolExecutionParams(toolCallId, params) {
	const scopedValidator = executionValidators.getStore();
	if (scopedValidator?.toolCallId === toolCallId) await scopedValidator.validate(params);
}
/** Read the private validation control carried by one native harness call. */
function readInternalToolExecutionValidation(value) {
	if (!value || typeof value !== "object") return;
	const marker = Reflect.get(value, INTERNAL_TOOL_EXECUTION_VALIDATION);
	const toolCallId = Reflect.get(value, "toolCallId");
	const validate = Reflect.get(value, "validate");
	if (marker !== true || typeof toolCallId !== "string" || typeof validate !== "function") return;
	return {
		toolCallId,
		validate: async (params) => {
			await Reflect.apply(validate, void 0, [params]);
		}
	};
}
//#endregion
//#region src/agents/agent-tools.before-tool-call.wrapper.ts
/**
* Wrapped before_tool_call execution boundary.
* Owns tool preparation/finalization, adjusted-param replay state, terminal
* results, diagnostics around execution, and wrapper metadata.
*/
const MAX_TRACKED_ADJUSTED_PARAMS = 1024;
const INTERNAL_DISPOSED_RESULT = {
	content: [],
	details: {
		status: "skipped",
		deniedReason: "internal-dispose"
	}
};
/** Run tool-owned preparation while retaining the exact prepared object. */
async function prepareBeforeToolCallExecutionParams(params) {
	const prepare = params.tool.prepareBeforeToolCallParams;
	return prepare ? await prepare(params.params, {
		...params.toolCallId ? { toolCallId: params.toolCallId } : {},
		...params.ctx ? { hookContext: params.ctx } : {},
		...params.signal ? { signal: params.signal } : {}
	}) : params.params;
}
/** Reconcile hook rewrites and restore tool-owned state before execution. */
function finalizeBeforeToolCallExecutionParams(params) {
	const reconciledParams = reconcileCodeModeExecBeforeHookParams({
		owner: { tool: params.tool },
		originalParams: params.preparedParams,
		hookParams: params.hookParams,
		adjustedParams: params.adjustedParams
	});
	const finalize = params.tool.finalizeBeforeToolCallParams;
	if (!finalize) return reconciledParams;
	if (params.finalizerMode === "adapter") return finalize(reconciledParams, params.preparedParams);
	return finalize.call(params.tool, reconciledParams, params.preparedParams) ?? reconciledParams;
}
var BeforeToolCallBlockedError = class extends Error {
	constructor(reason) {
		super(reason);
		this.reason = reason;
		this.name = "BeforeToolCallBlockedError";
	}
};
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.beforeToolCallBlockedErrorTestApi")] = { create(message) {
	return new BeforeToolCallBlockedError(message);
} };
var BeforeToolCallFailureError = class extends Error {
	constructor(message, disposition, cause) {
		super(message, cause === void 0 ? void 0 : { cause });
		this.disposition = disposition;
		this.name = "BeforeToolCallFailureError";
	}
};
function tagBeforeToolCallFailure(error, signal, stage) {
	try {
		if (error instanceof BeforeToolCallFailureError) return error;
	} catch {}
	const message = formatToolExecutionErrorMessage(error, "before_tool_call failed");
	const disposition = resolveToolErrorDiagnostic(error, signal).terminalReason;
	const tagged = new BeforeToolCallFailureError(message, disposition, error);
	if (stage === "tool_preparation" && isTrustedToolExecutionPreflightError(error)) registerTrustedToolNoStartError(tagged);
	return tagged;
}
/** Return the closed terminal disposition carried by a before-tool failure. */
function getBeforeToolCallFailureDisposition(error) {
	try {
		return error instanceof BeforeToolCallFailureError ? error.disposition : void 0;
	} catch {
		return;
	}
}
/** Remember hook-adjusted params for later adapter-side execution. */
function recordAdjustedParamsForToolCall(toolCallId, params, runId) {
	if (!toolCallId) return;
	const cloneResult = cloneParamsForAdjustedReplay(params);
	if (!cloneResult.ok) return;
	adjustedParamsByToolCallId.set(buildAdjustedParamsKey({
		runId,
		toolCallId
	}), cloneResult.value);
	pruneMapToMaxSize(adjustedParamsByToolCallId, MAX_TRACKED_ADJUSTED_PARAMS);
}
function cloneParamsForAdjustedReplay(params) {
	try {
		return {
			ok: true,
			value: structuredClone(params)
		};
	} catch {
		return { ok: false };
	}
}
/** Record that one concrete core-owned tool call may use structured replay classification. */
function recordStructuredReplayTrustForToolCall(toolCallId, tool, runId) {
	if (!toolCallId || getPluginToolMeta(tool) || getChannelAgentToolMeta(tool)) return;
	recordStructuredReplaySafeToolCall(toolCallId, runId);
	while (structuredReplaySafeToolCallIds.size > MAX_TRACKED_ADJUSTED_PARAMS) {
		const oldest = structuredReplaySafeToolCallIds.values().next().value;
		if (!oldest) break;
		structuredReplaySafeToolCallIds.delete(oldest);
	}
}
/**
* Returns true when an error represents an intentional before_tool_call veto.
*/
function isBeforeToolCallBlockedError(err) {
	return err instanceof BeforeToolCallBlockedError;
}
const preExecutionBlockedToolResults = /* @__PURE__ */ new WeakSet();
function isPreExecutionBlockedToolResult(result) {
	return result !== null && typeof result === "object" && preExecutionBlockedToolResults.has(result);
}
/** Build the standard terminal result for vetoed tool calls. */
function buildBlockedToolResult(params) {
	recordPreExecutionBlockedToolCall(params.toolCallId, params.runId);
	const result = {
		content: [{
			type: "text",
			text: params.reason
		}],
		details: {
			status: "blocked",
			deniedReason: params.deniedReason ?? "plugin-before-tool-call",
			reason: params.reason
		}
	};
	preExecutionBlockedToolResults.add(result);
	return result;
}
function wrapToolWithBeforeToolCallHook(tool, ctx, options = {}) {
	const execute = tool.execute;
	if (!execute) return tool;
	const toolName = tool.name || "tool";
	const diagnosticIdentity = resolveToolDiagnosticIdentity(tool);
	const hookOptions = {
		...options,
		emitDiagnostics: options.emitDiagnostics !== false
	};
	const toolContentPolicy = resolveDiagnosticModelContentCapturePolicy(ctx?.config);
	const wrappedTool = {
		...tool,
		execute: async (toolCallId, params, signal, onUpdate, ...executionArgs) => {
			const prepareControl = readInternalExecutionControl(executionArgs.at(-1));
			if (prepareControl) executionArgs.pop();
			const onUpdateValidation = readInternalToolExecutionValidation(onUpdate);
			const internalValidation = onUpdateValidation ?? readInternalToolExecutionValidation(executionArgs.at(-1));
			const forwardedOnUpdate = onUpdateValidation ? void 0 : onUpdate;
			if (!onUpdateValidation && internalValidation) executionArgs.pop();
			const toolCallOrdinal = ctx?.allocateToolOutcomeOrdinal?.(toolCallId);
			const preExecutionStartedAt = Date.now();
			const normalizedToolName = normalizeToolPolicyName(toolName || "tool");
			const trace = hookOptions.emitDiagnostics && ctx?.trace ? freezeDiagnosticTraceContext(createChildDiagnosticTraceContext(ctx.trace)) : void 0;
			const buildEventBase = (toolParams) => ({
				...ctx?.runId && { runId: ctx.runId },
				...ctx?.sessionKey && { sessionKey: ctx.sessionKey },
				...ctx?.sessionId && { sessionId: ctx.sessionId },
				...ctx?.agentId && { agentId: ctx.agentId },
				...trace && { trace },
				toolName: normalizedToolName,
				...diagnosticIdentity,
				...toolCallId && { toolCallId },
				paramsSummary: summarizeToolParams(toolParams),
				mutatingAction: buildToolMutationState(normalizedToolName, toolParams).mutatingAction
			});
			const recordPreExecutionError = (error, toolParams, errorCategory) => {
				recordPreExecutionBlockedToolCall(toolCallId, ctx?.runId);
				if (!hookOptions.emitDiagnostics) return;
				emitTrustedDiagnosticEvent({
					type: "tool.execution.error",
					...buildEventBase(toolParams),
					durationMs: Date.now() - preExecutionStartedAt,
					...resolveToolErrorDiagnostic(error, signal, errorCategory)
				});
			};
			const recordPreExecutionDisposition = (toolParams, disposition, errorCategory, deniedReason) => {
				recordPreExecutionBlockedToolCall(toolCallId, ctx?.runId);
				if (!hookOptions.emitDiagnostics) return;
				const eventBase = buildEventBase(toolParams);
				if (disposition === "blocked") {
					const reason = deniedReason ?? "plugin-before-tool-call";
					emitTrustedDiagnosticEvent({
						type: "tool.execution.blocked",
						...eventBase,
						deniedReason: reason,
						reason
					});
					return;
				}
				emitTrustedDiagnosticEvent({
					type: "tool.execution.error",
					...eventBase,
					durationMs: Date.now() - preExecutionStartedAt,
					errorCategory: disposition === "cancelled" ? "aborted" : errorCategory,
					terminalReason: disposition
				});
			};
			const blockToolCall = async (blockedCall) => {
				if (blockedCall.genericDecision) recordGenericToolActionDecision(tool, toolCallId, "denied");
				const eventBase = buildEventBase(blockedCall.toolParams);
				if (hookOptions.emitDiagnostics) {
					emitTrustedDiagnosticEvent({
						type: "tool.execution.blocked",
						...eventBase,
						reason: blockedCall.reason,
						deniedReason: blockedCall.deniedReason
					});
					emitToolBlockedSecurityEvent({
						ctx,
						deniedReason: blockedCall.deniedReason,
						toolIdentity: diagnosticIdentity,
						toolName: normalizedToolName,
						trace,
						paramsSummary: eventBase.paramsSummary
					});
				}
				const blockedResult = buildBlockedToolResult({
					reason: blockedCall.reason,
					deniedReason: blockedCall.deniedReason,
					toolCallId,
					runId: ctx?.runId
				});
				await recordLoopOutcome({
					ctx,
					toolName: normalizedToolName,
					toolParams: blockedCall.toolParams,
					toolCallId,
					result: blockedResult,
					toolCallOrdinal
				});
				return blockedResult;
			};
			let preparedParams;
			try {
				preparedParams = await prepareBeforeToolCallExecutionParams({
					tool,
					params,
					toolCallId,
					ctx,
					signal
				});
			} catch (error) {
				recordPreExecutionError(error, params, "tool_preparation");
				throw tagBeforeToolCallFailure(error, signal, "tool_preparation");
			}
			const hookParams = normalizeCodeModeExecBeforeHookParams({
				tool,
				params: preparedParams
			});
			const hookMetadata = getCodeModeExecBeforeHookMetadata({
				tool,
				params: preparedParams
			});
			let outcome;
			try {
				outcome = await runBeforeToolCallHook({
					toolName,
					params: hookParams,
					...hookMetadata,
					toolCallId,
					ctx,
					signal,
					approvalMode: hookOptions.approvalMode
				});
			} catch (error) {
				recordPreExecutionError(error, hookParams, "before_tool_call");
				throw tagBeforeToolCallFailure(error, signal, "before_tool_call");
			}
			if (outcome.blocked) {
				if (outcome.kind !== "veto") {
					recordPreExecutionDisposition(outcome.params ?? hookParams, outcome.disposition, outcome.deniedReason === "plugin-approval" ? "plugin_approval" : "before_tool_call", outcome.deniedReason);
					throw new BeforeToolCallFailureError(outcome.reason, outcome.disposition);
				}
				return await blockToolCall({
					reason: outcome.reason,
					deniedReason: outcome.deniedReason ?? "plugin-before-tool-call",
					toolParams: outcome.params ?? hookParams,
					genericDecision: outcome.genericDecision
				});
			}
			let executeParams;
			try {
				signal?.throwIfAborted();
				executeParams = finalizeBeforeToolCallExecutionParams({
					tool,
					preparedParams,
					hookParams,
					adjustedParams: outcome.params,
					finalizerMode: "wrapped"
				});
				await validateToolExecutionParams(toolCallId, executeParams);
				if (internalValidation?.toolCallId === toolCallId) await internalValidation.validate(executeParams);
				await reconcileLoopCallExecutionParams({
					ctx,
					toolName: normalizedToolName,
					toolParams: executeParams,
					toolCallId
				});
			} catch (error) {
				recordPreExecutionError(error, outcome.params ?? hookParams, "tool_preparation");
				throw tagBeforeToolCallFailure(error, signal, "tool_preparation");
			}
			let onImplementationStart;
			if (prepareControl) {
				const decision = await prepareControl.pause(executeParams);
				if (!decision.launch) {
					recordGenericToolActionDecision(tool, toolCallId, "suppressed");
					return INTERNAL_DISPOSED_RESULT;
				}
				onImplementationStart = decision.start;
			}
			const voiceConfirmation = consumeFinalClientVoiceToolConfirmation({
				toolName,
				params: executeParams,
				ctx
			});
			if (!voiceConfirmation.allowed) return await blockToolCall({
				reason: voiceConfirmation.reason,
				deniedReason: "client-voice-confirmation",
				toolParams: executeParams
			});
			signal?.throwIfAborted();
			runAgentToolSourceExecutionGuard(tool);
			onImplementationStart?.();
			recordAdjustedParamsForToolCall(toolCallId, executeParams, ctx?.runId);
			const eventBase = buildEventBase(executeParams);
			recordToolExecutionStarted(toolCallId, ctx?.runId);
			if (hookOptions.emitDiagnostics) emitTrustedDiagnosticEvent({
				type: "tool.execution.started",
				...eventBase
			});
			const startedAt = Date.now();
			try {
				let result;
				try {
					const args = [
						toolCallId,
						executeParams,
						signal,
						forwardedOnUpdate,
						...executionArgs
					];
					const invoke = () => execute(...args);
					result = outcome.ownerDecision ? await invoke() : await runWithGenericToolActionDecision(tool, toolCallId, invoke);
				} catch (error) {
					throw hookOptions.protectNetworkErrors !== false && tool.resultContentSource === "network" && getBeforeToolCallFailureDisposition(error) === void 0 ? protectNetworkToolExecutionError(error, "Tool execution failed.", signal) : error;
				}
				const durationMs = Date.now() - startedAt;
				const preparedTerminalPresentation = prepareToolTerminalPresentation({
					ctx,
					tool,
					toolParams: executeParams,
					toolCallId,
					toolCallOrdinal
				});
				await recordLoopOutcome({
					ctx,
					toolName: normalizedToolName,
					toolParams: executeParams,
					toolCallId,
					result,
					resultContentSource: tool.resultContentSource,
					toolCallOrdinal,
					terminalPresentation: preparedTerminalPresentation?.project?.(result)
				});
				if (!signal?.aborted) rememberPendingTerminalPresentation(preparedTerminalPresentation, ctx?.runId, toolCallId);
				const skillMatch = findSkillUsageMatch({
					toolName: normalizedToolName,
					toolParams: executeParams,
					ctx
				});
				if (skillMatch) recordRunSkillUsage({
					runId: ctx?.runId,
					name: skillMatch.skillName,
					source: skillMatch.skillSource,
					activation: skillMatch.activation,
					...skillMatch.skillFile ? { skillFile: skillMatch.skillFile } : {}
				});
				if (hookOptions.emitDiagnostics) {
					if (skillMatch) emitSkillUsedDiagnostic({
						ctx,
						match: skillMatch,
						toolName: normalizedToolName,
						toolCallId
					});
					emitTrustedDiagnosticEventWithPrivateData({
						...eventBase,
						...resolveToolResultTerminalDiagnostic(result, durationMs)
					}, buildToolContentPrivateData(toolContentPolicy, {
						input: executeParams,
						output: result,
						includeOutput: true
					}));
				}
				return outcome.loopWarning ? appendToolLoopWarning(result, outcome.loopWarning) : result;
			} catch (err) {
				if (hookOptions.emitDiagnostics) emitTrustedDiagnosticEventWithPrivateData({
					type: "tool.execution.error",
					...eventBase,
					durationMs: Date.now() - startedAt,
					...resolveToolErrorDiagnostic(err, signal)
				}, buildToolContentPrivateData(toolContentPolicy, {
					input: executeParams,
					includeOutput: false
				}));
				await recordLoopOutcome({
					ctx,
					toolName: normalizedToolName,
					toolParams: executeParams,
					toolCallId,
					error: err,
					resultContentSource: isTrustedToolExecutionPreflightError(err) || signal?.aborted && err === signal.reason ? void 0 : tool.resultContentSource,
					toolCallOrdinal
				});
				throw err;
			}
		}
	};
	const executeWithHooks = wrappedTool.execute;
	const prepareExecution = createInternalExecutionPreparer(async (params, control) => {
		recordToolExecutionTracked(params.toolCallId, ctx?.runId);
		try {
			return await Reflect.apply(executeWithHooks, wrappedTool, [
				params.toolCallId,
				params.args,
				params.signal,
				params.onUpdate,
				...params.executionArgs ?? [],
				control
			]);
		} finally {
			clearTrackedToolExecution(params.toolCallId, ctx?.runId);
		}
	});
	attachInternalToolExecutionPreparer(wrappedTool, prepareExecution);
	wrappedTool.execute = async (toolCallId, params, signal, onUpdate, ...executionArgs) => {
		const prepared = await prepareExecution({
			toolCallId,
			args: params,
			signal,
			onUpdate,
			executionArgs
		});
		try {
			if (prepared.kind === "immediate") {
				if (prepared.outcome.kind === "error") throw prepared.outcome.error;
				return prepared.outcome.result;
			}
			return await prepared.execute();
		} finally {
			prepared.dispose();
		}
	};
	copyBeforeToolCallWrapperMetadata(tool, wrappedTool);
	Object.defineProperty(wrappedTool, BEFORE_TOOL_CALL_WRAPPED, {
		value: true,
		enumerable: true
	});
	Object.defineProperty(wrappedTool, BEFORE_TOOL_CALL_DIAGNOSTIC_OPTIONS, {
		value: hookOptions,
		enumerable: false
	});
	Object.defineProperty(wrappedTool, BEFORE_TOOL_CALL_SOURCE_TOOL, {
		value: tool,
		enumerable: false
	});
	Object.defineProperty(wrappedTool, BEFORE_TOOL_CALL_HOOK_CONTEXT, {
		value: ctx,
		enumerable: false
	});
	return wrappedTool;
}
/** Rebuild a before_tool_call wrapper while preserving the original source tool. */
function rewrapToolWithBeforeToolCallHook(tool, ctx, options = {}) {
	const preservedContext = getBeforeToolCallHookContext(tool);
	const sourceTool = getBeforeToolCallSourceTool(tool) ?? tool;
	const wrapperOptions = {
		...getBeforeToolCallDiagnosticOptions(tool),
		...options
	};
	if (sourceTool === tool) return wrapToolWithBeforeToolCallHook(tool, ctx ?? preservedContext, wrapperOptions);
	const rewrapSource = {
		...tool,
		execute: sourceTool.execute
	};
	clearBeforeToolCallWrappedMarker(rewrapSource);
	copyBeforeToolCallWrapperMetadata(tool, rewrapSource);
	copyAgentToolSourceExecutionGuard(tool, rewrapSource);
	return wrapToolWithBeforeToolCallHook(rewrapSource, ctx ?? preservedContext, wrapperOptions);
}
function recordPreExecutionBlockedToolCall(toolCallId, runId) {
	if (!toolCallId) return;
	preExecutionBlockedToolCallIds.add(buildAdjustedParamsKey({
		runId,
		toolCallId
	}));
	while (preExecutionBlockedToolCallIds.size > MAX_TRACKED_ADJUSTED_PARAMS) {
		const oldest = preExecutionBlockedToolCallIds.values().next().value;
		if (!oldest) break;
		preExecutionBlockedToolCallIds.delete(oldest);
	}
}
//#endregion
export { consumeTrackedToolExecutionStarted as $, ensureClientVoiceAgentSessionEntry as A, getTrustedToolPolicyMatcherScope as B, appendClientVoiceTranscript as C, closeRelayVoiceSessionRecord as D, closeClientVoiceSession as E, resolveOpenClientVoiceSessionId as F, setEmbeddedPluginApprovalBroker as G, requestDeferredPluginToolApproval as H, VOICE_TRANSCRIPT_QUEUE_POLICY as I, finalizeToolTerminalPresentation as J, isEmbeddedMode as K, normalizeVoiceTranscriptText as L, registerClientVoiceConsultRun as M, resolveClientVoiceAgentSessionId as N, closeStaleClientVoiceSessions as O, resolveClientVoiceSessionOrigin as P, consumeStructuredReplaySafeToolCall as Q, authorizeClientVoiceConfirmation as R, admitToolCallBatch as S, assertClientVoiceSessionOpen as T, EmbeddedPluginApprovalBroker as U, cancelDeferredPluginToolApproval as V, clearEmbeddedPluginApprovalBroker as W, consumeAdjustedParamsForToolCall as X, clearBatchAdmittedToolCallsForRun as Y, consumePreExecutionBlockedToolCall as Z, hasRunWorkspaceSkillUsage as _, isPreExecutionBlockedToolResult as a, hasBeforeToolCallPolicy as b, recordStructuredReplayTrustForToolCall as c, runWithToolExecutionValidation as d, peekAdjustedParamsForToolCall as et, createInternalExecutionPreparer as f, consumeRunSkillUsage as g, captureAgentToolSourceExecutionGuard as h, isBeforeToolCallBlockedError as i, flushClientVoiceSessionWrites as j, createOrResumeClientVoiceSession as k, rewrapToolWithBeforeToolCallHook as l, bindAgentToolSourceExecutionGuard as m, finalizeBeforeToolCallExecutionParams as n, PluginApprovalResolutions as nt, prepareBeforeToolCallExecutionParams as o, readInternalExecutionControl as p, setEmbeddedMode as q, getBeforeToolCallFailureDisposition as r, recordAdjustedParamsForToolCall as s, buildBlockedToolResult as t, peekPreExecutionBlockedToolCall as tt, wrapToolWithBeforeToolCallHook as u, consumeFinalClientVoiceToolConfirmation as v, appendRelayVoiceTranscript as w, runBeforeToolCallHook as x, getBeforeToolCallPolicyDiagnosticState as y, bindAuthorizedClientVoiceConfirmation as z };

export { authorizeGptLiveClientVoicePendingConfirmation };
