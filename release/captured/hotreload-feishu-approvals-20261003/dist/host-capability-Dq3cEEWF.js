// versa-cron-shared-management-v1
import { cronManagementPrincipalFromTurn } from './versa-cron-shared-management-v1.mjs';
import { O as getActiveDiagnosticTraceContext } from "./diagnostic-events-D_BPObBj.js";
import { s as emitAgentRunOutputTokens } from "./agent-events-Con5xUCM.js";
import { n as capturePluginLifecycleAuthority } from "./registry-lifecycle-yJcZYGGM.js";
import { d as getActivePluginRegistry } from "./runtime-MupoouIC.js";
import { a as getPluginRuntimeGatewayRequestScope, c as withPluginRuntimeGatewayRequestScope, r as getGatewayContextResolver } from "./gateway-request-scope-CmMd3nUp.js";
import { l as rewrapToolWithBeforeToolCallHook, m as bindAgentToolSourceExecutionGuard, x as runBeforeToolCallHook } from "./agent-tools.before-tool-call-g2OT63u5.js";
import { a as attachInternalToolExecutionPreparer, f as getInternalToolExecutionPreparer } from "./internal-hooks-CiSltLvS.js";
import { f as loadSessionEntryReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import "./session-accessor-K0XuW6ln.js";
import { i as getAdmittedRunDelegatedAuthority, l as retainAdmittedRunBeforeToolCallRecovery } from "./admitted-run-context-DO5gB_Jz.js";
import { r as copyAgentToolMetadata } from "./agent-tool-metadata-CkrU8K-F.js";
import { n as createCronScheduledToolProjection } from "./exec-tool-target-pinning-Cmt_TOc5.js";
import { a as withGatewayToolCallerIdentity, i as withGatewayToolApprovalOwner, r as getGatewayToolCallerIdentity, s as wrapToolWithGatewayCallerIdentity, t as createAdmittedGatewayToolCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";
import { a as withInstallationTarget, n as getInstallationTarget, r as installationTargetEnv } from "./installation-target-context-DG00hO1x.js";
import { c as registerTrustedToolNoStartError } from "./tool-result-error-d_ya2-bv.js";
import { t as callGatewayTool, vlabResolveNativeGatewayIdentity } from "./gateway-DVu5Urba.js";
import { i as getCoreTtsToolResultMediaUrls, s as transferCoreTtsToolResultProvenance } from "./tool-runtime-config-C1d_lekC.js";
import { t as log } from "./logger-DEXeM7Jh.js";
import { c as bindUserTurnTranscriptAnnotation } from "./user-turn-transcript-sTfkLnbR.js";
import { n as wrapToolWithAbortSignal } from "./agent-tools.abort-D_hMKwN4.js";
import { n as runBestEffortCallback } from "./tool-result-middleware-BRQpW6IK.js";
import { t as buildAgentHookContextChannelFields } from "./hook-agent-context-AZc1TY6C.js";
import { a as getActiveSecretsRuntimeConfigSnapshot } from "./runtime-state-BoJn6Ddu.js";
import { t as createOpenClawCodingTools } from "./agent-tools-djVuP1H1.js";
import { t as resolveToolLoopDetectionConfig } from "./tool-loop-detection-config-Dftl-DTD.js";
import { c as prepareGitHubToolEnvironment } from "./github-tool-identity-Cj_AhZDB.js";
import { t as registerMcpToolApprovalBinding } from "./mcp-tool-approval-binding-81ZG5GyX.js";
import { s as prepareSystemRunMutableFileApproval } from "./system-run-approval-binding-BiER7nzy.js";
import { n as registerAgentHarnessTtsProvenanceTransferCapability, t as registerAgentHarnessScheduledToolProjectionCapability } from "./host-private-capabilities-DyLD53jB.js";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
//#region src/agents/harness/node-execution-authority.ts
/** Full is admitted host authority, narrowed to one placement claim, never a request flag. */
function createSessionNodeAuthorities(attempt, pluginId, requiredNodeCommands, assertActive, signal) {
	const admittedFull = attempt.permissionMode === "full";
	const resolveContext = getGatewayContextResolver(attempt.admittedRunContext);
	const context = resolveContext?.();
	const target = attempt.sessionTarget;
	const gatewayRegistry = getActivePluginRegistry();
	const pluginOwners = [gatewayRegistry, getPluginRuntimeGatewayRequestScope()?.pluginRegistry ?? gatewayRegistry].map((owner) => {
		const record = owner?.plugins.find((candidate) => candidate.id === pluginId);
		return owner && record ? capturePluginLifecycleAuthority(owner, record, { scopedRuntime: owner !== gatewayRegistry }) : void 0;
	});
	const assertPlacementCurrent = getPluginRuntimeGatewayRequestScope()?.assertNodeExecutionCurrent;
	if (!context || !target?.storePath || !attempt.agentId || !attempt.sessionKey || !attempt.sessionId || !assertPlacementCurrent) return {};
	const session = {
		agentId: attempt.agentId,
		sessionKey: attempt.sessionKey,
		storePath: target.storePath
	};
	const assertRequestCurrent = (request) => {
		if (request.source === "session-full" && (!admittedFull || !requiredNodeCommands.has(request.command))) throw new Error("admitted node execution authority does not cover this command");
		assertActive();
		const entry = loadSessionEntryReadOnly(session);
		if (signal.aborted || getActivePluginRegistry() !== gatewayRegistry || pluginOwners.some((isCurrent) => !isCurrent?.()) || request.source === "session-full" && (attempt.permissionMode !== "full" || !requiredNodeCommands.has(request.command)) || resolveContext && resolveContext() !== context || request.pluginId !== pluginId || !entry || entry.sessionId !== attempt.sessionId || request.source === "session-full" && entry.permissionMode !== "full" || request.workspace.sessionKey !== attempt.sessionKey || request.workspace.sessionId !== attempt.sessionId) throw new Error("admitted node execution authority is no longer current");
		assertPlacementCurrent({
			...request,
			runId: attempt.runId,
			agentId: session.agentId
		});
	};
	const invokeWithSessionNodeAuthority = async (request, invoke) => {
		if (request.source === "session-full" && (!admittedFull || !requiredNodeCommands.has(request.command))) return;
		const assertCurrent = () => assertRequestCurrent(request);
		assertCurrent();
		const result = await invoke(assertCurrent, signal);
		assertCurrent();
		return result;
	};
	return {
		invokeWithSessionNodeAuthority,
		nodePlacementGrantAuthority: {
			agentId: session.agentId,
			sessionKey: attempt.sessionKey,
			runId: attempt.runId,
			assertCurrent: (request) => assertRequestCurrent({
				...request,
				source: "human-approved"
			})
		}
	};
}
//#endregion
//#region src/agents/harness/host-capability.ts
const MAX_NATIVE_OPERATION_CWD_BYTES = 4096;
const retainedBeforeToolCallRunners = /* @__PURE__ */ new WeakMap();
/** Internal core-only lease for an already-created host policy callback. */
function retainBeforeToolCallForNativeHookRelay(runBeforeToolCall) {
	return retainedBeforeToolCallRunners.get(runBeforeToolCall)?.();
}
function normalizeNativeOperationCwd(value, attemptCwd) {
	if (typeof value !== "string") throw new Error("native operation cwd must be a string");
	const normalized = value.trim();
	if (!normalized) throw new Error("native operation cwd must not be empty");
	if (Buffer.byteLength(normalized, "utf8") > MAX_NATIVE_OPERATION_CWD_BYTES) throw new Error(`native operation cwd must not exceed ${MAX_NATIVE_OPERATION_CWD_BYTES} bytes`);
	for (let index = 0; index < normalized.length; index += 1) {
		const code = normalized.charCodeAt(index);
		if (code < 32 || code === 127) throw new Error("native operation cwd must not contain control characters");
	}
	return path.resolve(attemptCwd ?? process.cwd(), normalized);
}
function freezeSnapshot(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (!value || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const nested of Object.values(value)) freezeSnapshot(nested, seen);
	return Object.freeze(value);
}
function cloneSnapshot(value) {
	return freezeSnapshot(structuredClone(value));
}
function gateBoundTool(tool, assertActive, observeResult) {
	const execute = tool.execute;
	const sourcePreparer = getInternalToolExecutionPreparer(tool);
	if (!execute && !sourcePreparer) return tool;
	const gated = {
		...tool,
		...execute ? { execute: async (...args) => {
			try {
				assertActive();
			} catch (error) {
				throw registerTrustedToolNoStartError(error);
			}
			const result = await execute(...args);
			assertActive();
			observeResult(result);
			return result;
		} } : {}
	};
	copyAgentToolMetadata(tool, gated);
	if (sourcePreparer) attachInternalToolExecutionPreparer(gated, async (preparationParams) => {
		assertActive();
		const prepared = await sourcePreparer(preparationParams);
		try {
			assertActive();
		} catch (error) {
			prepared.dispose();
			throw error;
		}
		if (prepared.kind === "immediate") {
			if (prepared.outcome.kind === "result") observeResult(prepared.outcome.result);
			return prepared;
		}
		return {
			...prepared,
			execute: async (onImplementationStart) => {
				assertActive();
				const result = await prepared.execute(onImplementationStart);
				assertActive();
				observeResult(result);
				return result;
			}
		};
	});
	return gated;
}
function createBoundCallerIdentity(params, receiptAuthority, signal) {
	return createAdmittedGatewayToolCallerIdentity({
		cronManagementPrincipal: cronManagementPrincipalFromTurn(params),
		admittedRunContext: params.admittedRunContext,
		receiptAuthority,
		approvalSignals: [signal, ...params.abortSignal ? [params.abortSignal] : []],
		agentId: params.agentId,
		sessionKey: params.sessionKey,
		turnSourceChannel: params.messageChannel ?? params.messageProvider,
		turnSourceTo: params.currentMessagingTarget ?? params.currentChannelId,
		turnSourceAccountId: params.agentAccountId,
		turnSourceThreadId: params.currentThreadTs
	});
}
/** Creates a closure-bound capability before plugin invocation. */
function createAgentHarnessHostCapabilities(params) {
	const attempt = params.attempt;
	const installationTarget = getInstallationTarget();
	const localProcessEnv = installationTargetEnv(installationTarget);
	const { sessionKey, onAgentEvent } = attempt;
	const requiredNodeCommands = new Set(params.requiredNodeCommands);
	const operationalRunInstance = attempt.admittedRunContext.operationalRunInstance;
	const delegatedAuthority = getAdmittedRunDelegatedAuthority(attempt.admittedRunContext);
	if (!delegatedAuthority) throw new Error("agent harness host capability requires active admitted run authority");
	const { lifecycleGeneration } = delegatedAuthority;
	const { runId } = delegatedAuthority.operationalRunInstance;
	const coreTtsToolResults = /* @__PURE__ */ new WeakSet();
	let active = true;
	const capabilityAbortController = new AbortController();
	const inheritedCaller = getGatewayToolCallerIdentity();
	const sourceCaller = inheritedCaller?.operationalRunInstance === operationalRunInstance ? inheritedCaller : void 0;
	const callerIdentity = createBoundCallerIdentity(attempt, assertActive, capabilityAbortController.signal);
	function assertActive() {
		if (!active || attempt.admittedRunContext.operationalRunInstance !== operationalRunInstance || getAdmittedRunDelegatedAuthority(attempt.admittedRunContext) !== delegatedAuthority || callerIdentity?.gatewayContextResolver !== void 0 && callerIdentity.gatewayContextResolver() === void 0) throw new Error("agent harness host capability is no longer active");
		if (sourceCaller && (sourceCaller.agentId !== attempt.agentId || sourceCaller.sessionKey !== attempt.sessionKey) || sourceCaller?.workerTurnClaim && (sourceCaller.workerTurnClaim.sessionId !== attempt.sessionId || sourceCaller.workerTurnClaim.runId !== attempt.runId) || sourceCaller?.workerTurnClaim && !sourceCaller.receiptAuthority || sourceCaller?.receiptAuthority?.() === false) throw new Error("agent harness host capability lost its source execution claim");
	}
	const observeCoreTtsToolResult = (result) => {
		if (typeof result === "object" && result !== null && getCoreTtsToolResultMediaUrls(result)) coreTtsToolResults.add(result);
	};
	const requester = {
		...attempt.messageChannel ?? attempt.messageProvider ? { channel: attempt.messageChannel ?? attempt.messageProvider ?? void 0 } : {},
		...attempt.agentAccountId ? { accountId: attempt.agentAccountId } : {},
		...attempt.senderId ? { senderId: attempt.senderId } : {},
		...attempt.senderIsOwner !== void 0 ? { senderIsOwner: attempt.senderIsOwner } : {},
		...attempt.memberRoleIds?.length ? { roleIds: Object.freeze([...attempt.memberRoleIds]) } : {}
	};
	const config = attempt.config ? cloneSnapshot(attempt.config) : void 0;
	const recorder = attempt.userTurnTranscriptRecorder;
	const sessionTarget = attempt.sessionTarget ? cloneSnapshot(attempt.sessionTarget) : void 0;
	const annotateCurrentUserTurn = attempt.userTurnTranscriptRecorder && attempt.sessionTarget && attempt.agentId && attempt.sessionId && attempt.sessionKey && attempt.sessionTarget.storePath && !attempt.suppressNextUserMessagePersistence && attempt.trigger !== "memory" ? bindUserTurnTranscriptAnnotation({
		recorder: attempt.userTurnTranscriptRecorder,
		target: {
			...attempt.sessionTarget,
			agentId: attempt.agentId,
			sessionId: attempt.sessionId,
			sessionKey: attempt.sessionKey,
			storePath: attempt.sessionTarget.storePath
		},
		runId: attempt.runId,
		config,
		abortSignal: attempt.abortSignal ? AbortSignal.any([attempt.abortSignal, capabilityAbortController.signal]) : capabilityAbortController.signal,
		assertCurrent: () => {
			assertActive();
			if (attempt.userTurnTranscriptRecorder !== recorder || !isDeepStrictEqual(attempt.sessionTarget, sessionTarget) || sessionTarget?.agentId !== void 0 && sessionTarget.agentId !== attempt.agentId || sessionTarget?.sessionId !== void 0 && sessionTarget.sessionId !== attempt.sessionId || sessionTarget?.sessionKey !== void 0 && sessionTarget.sessionKey !== attempt.sessionKey) throw new Error("native prompt annotation lost its source execution claim");
		}
	}) : void 0;
	const skillsSnapshot = attempt.skillsSnapshot ? cloneSnapshot(attempt.skillsSnapshot) : void 0;
	const preparedRunEnvironment = prepareGitHubToolEnvironment({
		config: config ?? {},
		sourceConfig: getActiveSecretsRuntimeConfigSnapshot()?.sourceConfig,
		agentId: attempt.agentId ?? "main"
	});
	const skillUsagePaths = attempt.sandbox?.skillUsagePaths ? cloneSnapshot(attempt.sandbox.skillUsagePaths) : void 0;
	const hookContext = Object.freeze({
		...attempt.agentId ? { agentId: attempt.agentId } : {},
		...config ? { config } : {},
		...attempt.cwd ? { cwd: attempt.cwd } : {},
		...attempt.workspaceDir ? { workspaceDir: attempt.workspaceDir } : {},
		...attempt.sessionKey ? { sessionKey: attempt.sessionKey } : {},
		...attempt.sessionId ? { sessionId: attempt.sessionId } : {},
		runId: attempt.runId,
		...buildAgentHookContextChannelFields(attempt),
		...Object.keys(requester).length > 0 ? { requester: Object.freeze(requester) } : {},
		...getActiveDiagnosticTraceContext() ? { trace: getActiveDiagnosticTraceContext() } : {},
		...skillsSnapshot ? { skillsSnapshot } : {},
		...skillUsagePaths ? { skillUsagePaths } : {},
		...attempt.onToolOutcome ? { onToolOutcome: attempt.onToolOutcome } : {},
		...attempt.allocateToolOutcomeOrdinal ? { allocateToolOutcomeOrdinal: attempt.allocateToolOutcomeOrdinal } : {},
		...attempt.sandbox?.enabled && attempt.sandbox.workspaceAccess === "rw" && attempt.sandbox.fsBridge ? { sandbox: Object.freeze({
			root: attempt.sandbox.workspaceDir,
			bridge: attempt.sandbox.fsBridge
		}) } : {},
		loopDetection: cloneSnapshot(resolveToolLoopDetectionConfig({
			cfg: config,
			agentId: attempt.agentId
		})),
		trigger: attempt.trigger,
		approvalReviewerDeviceId: attempt.approvalReviewerDeviceId,
		turnSourceChannel: attempt.messageChannel ?? attempt.messageProvider,
		turnSourceTo: attempt.currentMessagingTarget ?? attempt.currentChannelId,
		turnSourceAccountId: attempt.agentAccountId,
		turnSourceThreadId: attempt.currentThreadTs
	});
	const withCaller = async (run, signal) => await withGatewayToolCallerIdentity(callerIdentity && signal ? {
		...callerIdentity,
		approvalSignals: [...callerIdentity.approvalSignals ?? [], signal]
	} : callerIdentity, run);
	const runBeforeToolCallWithAssertion = async (assertCurrent, { nativeOperation, approvalMode, ...request }) => {
		assertCurrent();
		const hostApprovalMode = approvalMode === "defer" ? "defer" : "request";
		const actionCwd = nativeOperation?.cwd !== void 0 ? normalizeNativeOperationCwd(nativeOperation.cwd, hookContext.cwd) : void 0;
		const actionHookContext = actionCwd ? Object.freeze({
			...hookContext,
			cwd: actionCwd
		}) : hookContext;
		const result = await runBeforeToolCallHook({
			...request,
			approvalMode: hostApprovalMode,
			ctx: actionHookContext
		});
		assertCurrent();
		return result;
	};
	const runBeforeToolCall = async (request) => await withCaller(async () => await runBeforeToolCallWithAssertion(assertActive, request), request.signal);
	retainedBeforeToolCallRunners.set(runBeforeToolCall, () => {
		const recovery = retainAdmittedRunBeforeToolCallRecovery(attempt.admittedRunContext);
		if (!recovery) return;
		const assertRecoveryActive = () => {
			if (attempt.abortSignal?.aborted || attempt.admittedRunContext.operationalRunInstance !== operationalRunInstance || callerIdentity?.gatewayContextResolver !== void 0 && callerIdentity.gatewayContextResolver() === void 0) throw new Error("agent harness retained host policy is no longer active");
			recovery.assertActive();
		};
		return Object.freeze({
			assertActive: assertRecoveryActive,
			release: recovery.release,
			runBeforeToolCall: async (request) => await runBeforeToolCallWithAssertion(assertRecoveryActive, request)
		});
	});
	const trajectoryRecorder = attempt.trajectoryRecorder;
	const scheduledToolSources = /* @__PURE__ */ new WeakMap();
	const bindTools = (tools, options, observeResult) => {
		assertActive();
		const boundAbortSignal = attempt.abortSignal ? AbortSignal.any([attempt.abortSignal, capabilityAbortController.signal]) : capabilityAbortController.signal;
		const bindingCwd = options?.cwd !== void 0 ? normalizeNativeOperationCwd(options.cwd, hookContext.cwd) : void 0;
		const bindingHookContext = bindingCwd ? Object.freeze({
			...hookContext,
			cwd: bindingCwd
		}) : hookContext;
		return tools.map((tool) => bindAgentToolSourceExecutionGuard(tool, assertActive)).map((tool) => rewrapToolWithBeforeToolCallHook(tool, bindingHookContext)).map((tool) => callerIdentity ? wrapToolWithGatewayCallerIdentity(tool, callerIdentity) : tool).map((tool) => wrapToolWithAbortSignal(tool, boundAbortSignal)).map((tool) => gateBoundTool(tool, assertActive, observeResult));
	};
	const bindToolSurface = (tools, options) => bindTools(tools, options, () => {});
	const capabilities = Object.freeze({
		kind: "agent-harness-host-capability",
		// vlab91-native-gateway-identity-v1: keeps original delegated authority and revocation.
		vlabResolveGatewayIdentity: async (request) => {
			assertActive();
			if (typeof request.method !== "string") throw new Error("Invalid Worker Gateway method");
			const result = await withCaller(() => vlabResolveNativeGatewayIdentity({
				method: request.method, required: request.required === true,
				opts: {}, target: "local", signal: request.signal
			}), request.signal);
			assertActive();
			return result;
		},
		version: 1,
		assertActive,
		reportOutputTokens: (outputTokens) => {
			assertActive();
			const data = emitAgentRunOutputTokens({
				runId,
				lifecycleGeneration,
				sessionKey,
				outputTokens
			});
			if (data && onAgentEvent) runBestEffortCallback({
				label: "usage agent event",
				log,
				callback: () => onAgentEvent({
					stream: "usage",
					data
				})
			});
		},
		...annotateCurrentUserTurn ? { annotateCurrentUserTurn } : {},
		...trajectoryRecorder ? { trajectory: Object.freeze({
			recordEvent: (type, data) => {
				assertActive();
				trajectoryRecorder.recordEvent(type, data);
			},
			flush: async () => {
				assertActive();
				await trajectoryRecorder.flush();
				assertActive();
			}
		}) } : {},
		preparedEnvironment: () => {
			assertActive();
			return Object.freeze({
				credentialScrubEnv: Object.freeze({ ...preparedRunEnvironment.credentialScrubEnv }),
				localIdentityEnv: Object.freeze({ ...preparedRunEnvironment.localIdentityEnv }),
				managedLocalIdentity: preparedRunEnvironment.managedLocalIdentity,
				...localProcessEnv ? { localProcessEnv } : {}
			});
		},
		bindToolSurface,
		createToolSurface: (options, bindingOptions) => {
			assertActive();
			const tools = bindTools(withInstallationTarget(installationTarget, () => createOpenClawCodingTools({
				...options,
				operationalRunInstance
			})), bindingOptions, observeCoreTtsToolResult);
			for (const tool of tools) if (tool.name === "exec" || tool.name === "process") scheduledToolSources.set(tool, Object.freeze({
				targetTool: tool.name,
				execute: tool.execute
			}));
			return tools;
		},
		prepareMutableFileApproval: async (request) => {
			assertActive();
			const prepared = await prepareSystemRunMutableFileApproval(request);
			assertActive();
			if (!prepared.ok) return prepared;
			return Object.freeze({
				ok: true,
				requiresOneShot: prepared.requiresOneShot,
				revalidate: async () => {
					assertActive();
					const current = await prepared.revalidate();
					assertActive();
					return current;
				}
			});
		},
		runBeforeToolCall,
		requestApproval: async (request) => {
			assertActive();
			request.signal?.throwIfAborted();
			const releaseMcpBinding = request.mcpTool && request.toolCallId && request.isMcpToolApprovalActive && attempt.agentId ? registerMcpToolApprovalBinding({
				authority: delegatedAuthority,
				agentId: attempt.agentId,
				toolCallId: request.toolCallId,
				...request.mcpTool,
				isActive: () => {
					assertActive();
					return !request.signal?.aborted && request.isMcpToolApprovalActive();
				}
			}) : void 0;
			try {
				const result = await withCaller(async () => await withGatewayToolApprovalOwner(params.pluginId, async () => await callGatewayTool("plugin.approval.request", { timeoutMs: request.transportTimeoutMs ?? request.timeoutMs }, {
					title: request.title,
					description: request.description,
					severity: request.severity,
					toolName: request.toolName,
					toolCallId: request.toolCallId,
					...request.mcpTool ? { mcpTool: request.mcpTool } : {},
					timeoutMs: request.timeoutMs,
					twoPhase: true,
					...request.allowedDecisions ? { allowedDecisions: request.allowedDecisions } : {}
				}, {
					expectFinal: false,
					requireAgentRuntimeIdentity: true,
					signal: request.signal
				})), request.signal);
				assertActive();
				request.signal?.throwIfAborted();
				return result;
			} finally {
				releaseMcpBinding?.();
			}
		},
		waitForApproval: async (request) => {
			assertActive();
			const result = await withCaller(async () => await callGatewayTool("plugin.approval.waitDecision", { timeoutMs: request.transportTimeoutMs ?? request.timeoutMs }, { id: request.approvalId }, { signal: request.signal }), request.signal);
			assertActive();
			if (result?.id !== request.approvalId) return;
			return {
				decision: result.decision,
				terminalReason: result.terminalReason
			};
		}
	});
	registerAgentHarnessScheduledToolProjectionCapability({
		hostCapabilities: capabilities,
		ownerPluginId: params.pluginId,
		create: (sourceTool, projection) => {
			assertActive();
			const source = scheduledToolSources.get(sourceTool);
			if (!source || sourceTool.name !== source.targetTool || sourceTool.execute !== source.execute) throw new Error("scheduled tool projection source was not created by this host capability");
			return createCronScheduledToolProjection(sourceTool, assertActive, source.targetTool, projection);
		}
	});
	registerAgentHarnessTtsProvenanceTransferCapability({
		hostCapabilities: capabilities,
		ownerPluginId: params.pluginId,
		transfer: (toolResult, attemptResult, eligibleMediaUrls) => {
			assertActive();
			if (typeof toolResult !== "object" || toolResult === null || !coreTtsToolResults.has(toolResult)) return attemptResult;
			return transferCoreTtsToolResultProvenance(toolResult, attemptResult, eligibleMediaUrls, operationalRunInstance);
		}
	});
	return {
		capabilities,
		runWithScope: (run) => {
			const nodeAuthorities = createSessionNodeAuthorities(attempt, params.pluginId, requiredNodeCommands, assertActive, attempt.abortSignal ? AbortSignal.any([attempt.abortSignal, capabilityAbortController.signal]) : capabilityAbortController.signal);
			return withPluginRuntimeGatewayRequestScope({
				isWebchatConnect: () => false,
				...getPluginRuntimeGatewayRequestScope(),
				...nodeAuthorities
			}, run);
		},
		close: () => {
			if (!active) return;
			active = false;
			capabilityAbortController.abort();
		}
	};
}
//#endregion
export { retainBeforeToolCallForNativeHookRelay as n, createAgentHarnessHostCapabilities as t };
