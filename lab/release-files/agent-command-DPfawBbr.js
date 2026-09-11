function selectPostTurnFinalText(payloads) {
 if(!Array.isArray(payloads)||payloads.length!==1)return;
 const p=payloads[0];
 if(!p||p.isError||p.isReasoning||p.mediaUrl||p.mediaUrls?.length||p.channelData||p.audioAsVoice||typeof p.text!=='string'||!p.text.trim())return;
 return p.text;
}
import { C as parseStrictNonNegativeInteger } from "./number-coercion-CLj0HTDM.js";
import { t as sanitizeForLog } from "./ansi-DrXAcdMD.js";
import { t as coerceErrorMessage } from "./error-coercion-CwcmpTBO.js";
import { a as asOptionalRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { r as defaultRuntime } from "./runtime-V1VdbWVS.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { t as createLazyImportLoader } from "./lazy-promise-DGqyc4Y4.js";
import { l as readConfigFileSnapshotForWrite, n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { shareColdConfigPreparation } from "./cold-config-singleflight.mjs";
import "./utils-D3A1hGii.js";
import { d as isSecretRef } from "./types.secrets-kC0nOetj.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { f as isDiagnosticsEnabled, o as emitTrustedDiagnosticEvent } from "./diagnostic-events-D_BPObBj.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { rt as normalizeAgentRunTerminalReceipt } from "./openclaw-state-db-Bh3Bq87y.js";
import { f as stripInternalRuntimeContext, l as hasInternalRuntimeContext } from "./internal-runtime-context-DWUZUDW2.js";
import { c as resolvePluginMetadataSnapshot } from "./plugin-metadata-snapshot-BuNx7zRZ.js";
import { t as formatCliCommand } from "./command-format-C7YfyMTd.js";
import { c as resolveAgentConfig, i as listAgentEntries, m as resolveAgentWorkspaceDir, o as listAgentIds, p as resolveAgentRunCwd, u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { T as isSubagentSessionKey, _ as scopeLegacySessionKeyToAgent, c as classifySessionKeyShape, f as resolveAgentIdFromSessionKey, l as isUnscopedSessionKeySentinel } from "./session-key-CRjxKW0X.js";
import { c as normalizeProviderId, o as normalizeConfiguredProviderCatalogModelId, s as normalizeModelRef } from "./model-ref-shared-Dz7QU0Lx.js";
import { t as modelKey } from "./model-key-CMdQNkZf.js";
import { T as setRuntimeConfigSnapshot } from "./runtime-snapshot-BVoUH4MI.js";
import "./agent-runtime-id-CYhl-5UQ.js";
import { C as prepareModelRunCapabilities, g as resolveConfiguredModelRef, i as buildModelAliasIndex, r as buildConfiguredModelCatalog, v as resolveModelAliasFromPair, y as resolveModelRefFromString } from "./model-selection-shared-BUMiYTyL.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-CdX9UGcX.js";
import { t as splitTrailingAuthProfile } from "./model-ref-profile-BIKs-96s.js";
import { A as resolveSessionAuthProfileOverrideSource, E as hasSessionAutoModelFallbackProvenance, _ as resolveSessionAgentId, i as markAutoFallbackPrimaryProbe, m as resolveEffectiveModelFallbacks, n as entryMatchesAutoFallbackPrimaryProbe, o as resolveAgentEffectiveModelPrimary, p as resolveAutoFallbackPrimaryProbe, r as hasLegacyAutoFallbackWithoutOrigin, t as clearAutoFallbackPrimaryProbeSelection, y as resolveSessionAgentIds } from "./agent-scope-CSlN0kZb.js";
import { n as resolveEffectiveAgentSkillFilter } from "./agent-filter-BSbUMFGi.js";
import { t as resolveDefaultModelForAgent } from "./model-selection-config-bdtzr00S.js";
import { s as normalizeThinkLevel, u as normalizeVerboseLevel } from "./thinking.shared-bHYuuc1L.js";
import { a as listOpenAIAuthProfileProvidersForAgentRuntime } from "./openai-routing-ChWi-Lfh.js";
import { n as resolveProviderIdForAuth } from "./provider-auth-aliases-CdY3FZM-.js";
import { r as discoverConfigSecretTargetsByIds } from "./target-registry-query-CgVSp7bX.js";
import "./target-registry-Dl6csZaC.js";
import "./io-Des9Xfzj.js";
import { i as emitAgentEvent, n as captureAgentRunLifecycleGeneration, t as assertAgentRunLifecycleGenerationCurrent, v as withAgentRunLifecycleGeneration } from "./agent-events-Con5xUCM.js";
import { a as clearAgentRunContext, h as registerAgentRunContext } from "./agent-run-registry-D84MDeZl.js";
import { w as requireActivePluginRegistry } from "./runtime-MupoouIC.js";
import { a as getPluginRuntimeGatewayRequestScope, c as withPluginRuntimeGatewayRequestScope } from "./gateway-request-scope-CmMd3nUp.js";
import { n as withPluginRuntimeGenerationScope } from "./generation-scope-CcvBHxkU.js";
import { a as getReplyPayloadMetadata, y as setReplyPayloadMetadata } from "./reply-payload-DahKk-7n.js";
import "./message-channel-constants-2zSoJXQC.js";
import { c as normalizeDeliveryContext, d as sessionDeliveryChannel, f as sessionDeliveryOrigin } from "./delivery-context.shared-DlcU69m_.js";
import { r as ensureAuthProfileStore } from "./store-CZzbMlii.js";
import { n as isStoredCredentialCompatibleWithAuthProvider } from "./order-DZ_d3_p5.js";
import { r as loadManifestModelCatalog } from "./model-catalog-CIpnqiiW.js";
import { i as hasBillableUsage } from "./usage-CtmV8Xxq.js";
import { p as patchSessionEntryCore } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { a as resolveMessageChannel, t as isDeliverableMessageChannel } from "./message-channel-normalize-DzpgR6ro.js";
import "./message-channel-BGKf9KPa.js";
import { t as formatSqliteSessionFileMarker } from "./legacy-sqlite-marker-COPKCuIN.js";
import { n as beginSessionWorkAdmission } from "./session-lifecycle-admission-siUq03Jk.js";
import { o as resolveFreshSessionTotalTokens } from "./types-BHV0IaPK.js";
import "./session-accessor-K0XuW6ln.js";
import { c as isValidAgentHarnessSessionStoreEntry, l as resolveAgentHarnessSessionContextError, t as AGENT_HARNESS_MODEL_RUN_FORBIDDEN_MESSAGE } from "./agent-harness-session-key-CLRQddqz.js";
import { a as applyModelOverrideToSessionEntry, c as repairProviderWrappedModelOverride, i as ModelSelectionLockedError, s as isModelSelectionLocked, t as MODEL_SELECTION_LOCKED_MESSAGE } from "./model-overrides-Bm7jo7Di.js";
import { t as buildRestartRecoveryClaimCleanupPatch } from "./restart-recovery-state-xVcgAuHK.js";
import { n as isThinkingLevelSupported, t as formatThinkingLevels } from "./thinking-DxxV8Ztb.js";
import { n as resolveAvailableAgentHarnessPolicy } from "./availability-CAyTTQQq.js";
import { i as resolveSessionRuntimeOverrideForProvider } from "./session-runtime-compat-BmHRQBtd.js";
import { a as resolveCandidateThinkingLevel, i as normalizeThinkingCatalogProviders, n as hasResolvedThinkingCatalogEntry, o as resolveEffectiveAgentRuntime, r as needsThinkHydration } from "./thinking-runtime-CMnVn0Uq.js";
import { p as ensureAgentWorkspace } from "./workspace-BFk42BX6.js";
import { a as findConfiguredModelProvider, i as allowsPluginModelNormalization } from "./model-fallback-candidates-B-mHEN3S.js";
import { n as withAgentPluginRegistry } from "./runtime-plugins-CWkOjN1D.js";
import "./model-selection-DG2dN6VK.js";
import { n as resolveThinkingDefault, t as resolveConfiguredThinkingDefault } from "./model-thinking-default-DOCrUkf0.js";
import { f as recordSessionHumanDirectMessage, n as classifySessionStateActor } from "./session-state-events-BIoqMlY_.js";
import { i as buildAgentRunTerminalOutcomeFromLifecycleEvent, o as classifyAgentRunTerminalOutcome } from "./agent-run-terminal-outcome-CyRezSup.js";
import { i as getFailoverErrorCode } from "./error-Crg6nsju.js";
import { _ as throwAgentRunRestartAbortReason, c as createAgentRunRestartAbortError, f as isAgentRunRestartAbortReason, h as resolveAgentRunErrorLifecycleFields, m as resolveAgentRunAbortLifecycleFields } from "./run-termination-Ts9RsbeN.js";
import { t as mergeAgentRunTerminalOutcome } from "./agent-run-terminal-outcome-merge-DXNYLPhQ.js";
import { v as renderFailoverCodeUserCopy } from "./user-copy-BLzGKYoR.js";
import { i as isSyntheticSourceReplyTurn } from "./source-reply-delivery-mode-7Re9v3QT.js";
import { a as hasNewGeneratedMediaTaskForSessionKey, r as getGeneratedMediaTaskIdsForSessionKey } from "./task-status-access-BL-VaEOd.js";
import { n as resolveAgentTimeoutMs } from "./timeout-Dm7mxETK.js";
import { i as getAdmittedRunDelegatedAuthority } from "./admitted-run-context-DO5gB_Jz.js";
import { n as getInstallationTarget, t as LOCAL_INSTALLATION_TARGET_UNSUPPORTED } from "./installation-target-context-DG00hO1x.js";
import { f as resolveSessionWorkStartError, o as createSessionWorkStartChangedError, u as isSessionWorkStartInvalidatedError } from "./lifecycle-CKz-1QIz.js";
import { a as resolveModelCostConfig, t as estimateAggregateUsageCost } from "./usage-format-G8w2sGOz.js";
import { y as createDeferredEmbeddedRunLifecycleManager } from "./builtin-openclaw-zQV8Wwjr.js";
import { r as formatErrorMessageForDisplay } from "./error-diagnostics-CIYWvh6l.js";
import { o as isAgentMediatedCompletionSourceTool } from "./input-provenance-CCQsDhUy.js";
import { t as buildOutboundSessionContext } from "./session-context-ZrdC3CLh.js";
import { n as runAgentHarnessBeforeMessageWriteHook } from "./hook-helpers-D11aAm0B.js";
import { n as recordAgentRunTerminalOutcome } from "./agent-run-terminal-outcome-Ovu6kj_3.js";
import { t as resolveSessionStableReplyMode } from "./session-stable-reply-mode-B53DWmq1.js";
import { t as isHeartbeatLifecycleRunKind } from "./bootstrap-mode-HvSedbJl.js";
import { n as createUserTurnTranscriptRecorder } from "./user-turn-transcript-sTfkLnbR.js";
import { t as resolveFastModeState } from "./fast-mode-CGDySgLE.js";
import { t as AGENT_LANE_SUBAGENT } from "./lanes-CI0_P-yC.js";
import { n as prepareInternalSessionEffectsSession, t as createInternalSessionEffectsCleanup } from "./internal-session-effects-C8FWqbuL.js";
import { a as hasVisibleAgentPayload, r as hasExplicitlyVisibleAgentPayload } from "./message-visibility-D0FOL9Zj.js";
import { t as createTrajectoryRuntimeRecorder } from "./runtime-gmrQ9kJS.js";
import { _ as hasUnaccountedMessagingToolAggregateEvidence, i as collectMessagingToolDeliveredMediaUrls, l as hasCommittedOutboundDeliveryEvidence, r as collectDeliveredMediaUrls, v as hasVisibleCommittedMessagingToolDeliveryEvidence } from "./delivery-evidence-BDLYyuib.js";
import { d as formatAgentInternalEventsForPrompt, u as formatAgentInternalEventsForPlainPrompt } from "./subagent-announce-delivery-Dosep7Zr.js";
import { a as getActiveSecretsRuntimeConfigSnapshot } from "./runtime-state-BoJn6Ddu.js";
import { i as runWithCronCreatorAuthorityCapability, r as createCronCreatorAuthorityCapability } from "./cron-creator-authority-context-Cw7-6Bah.js";
import { r as LiveSessionModelSwitchError } from "./model-fallback-runner-DOsPfj4O.js";
import { i as normalizePendingFinalRecoveryPayloads, n as buildRecoverablePendingFinalDeliveryText, r as normalizePendingFinalDeliveryPayloads } from "./pending-final-delivery-CNQYsZ37.js";
import { n as buildMainSessionRecoveryClearPatch } from "./main-session-recovery-clear-H7IP1700.js";
import { i as resolveSession, n as clearRotatedSessionMetadata } from "./session-CEfQoC2g.js";
import { r as resolveMessageChannelSelection } from "./channel-selection-cs_ikGB-.js";
import { n as normalizeAgentRunTerminalDeliverySnapshot } from "./agent-run-status-Ie-4cjf6.js";
import { f as getScopedChannelsCommandSecretTargets, n as getAgentRuntimeOptionalCommandSecretPaths, t as getAgentRuntimeCommandSecretTargetIds } from "./command-secret-targets-esC7Faew.js";
import { n as createModelVisibilityPolicy } from "./model-visibility-policy-B1zFZD7p.js";
import { n as normalizeSpawnedRunMetadata } from "./spawned-context-BdRGa6HI.js";
import "./selection-BC0YSSFq.js";
import { t as resolveChannelModelOverride } from "./model-overrides-DyGTmVtW.js";
import { n as resolveStoredModelOverride } from "./stored-model-overrides-Cw6nNvhW.js";
import { t as scheduleMainSessionRecoveryPendingTarget } from "./main-session-recovery-owner-release-TcVwK5j7.js";
import { r as repairMainSessionRecoveryMutation } from "./main-session-recovery-lifecycle-B_BW8sTy.js";
import { a as releaseMainSessionRecoveryOwner, i as refreshMainSessionRecoveryOwner, r as inspectMainSessionRecoveryRequired, t as claimMainSessionRecoveryOwner } from "./main-session-recovery-store-CPOjGERP.js";
import { n as resolveSendPolicy } from "./send-policy-C3rFzSh0.js";
import { r as createChatRunState } from "./server-chat-state-KjZAS9Bd.js";
import { t as ensureSelectedAgentHarnessPlugin } from "./runtime-plugin-tBIKSPI8.js";
import "./live-model-switch-D25jd7WQ.js";
import { n as incrementCompactionCount } from "./session-updates-DQXogl1j.js";
import { t as mergeAttemptToolMediaPayloads } from "./tool-media-payloads-cmOaamUz.js";
import { t as ensureSessionDiffBaseline } from "./session-diff-baseline-DLuS-HQ-.js";
import { t as clearSessionAuthProfileOverride } from "./session-override-Cee0bXZ_.js";
import { r as mergeSessionSnapshotChanges } from "./session-snapshot-merge-Cf1TdJBp.js";
import { n as applyVerboseOverride } from "./level-overrides-DdeyQjzP.js";
import { i as resolveInlineAgentImageAttachments } from "./agent-turn-attachments-Dd666vYm.js";
import { n as prepareAgentCommandExecutionIdentity, r as sanitizePublicAgentCommandIngressOpts, t as executionIdentity } from "./agent-command-execution-identity-CZgrsP3A.js";
import { t as withLocalAgentCronJobsRemoved } from "./local-service-CSfhU34f.js";
import { t as loadGatewayConfigRevisionProjector } from "./config-revision-token-116RG-B9.js";
import { t as NodeRegistry } from "./node-registry-DbI-1zaD.js";
import { r as registerGatewayModelCatalogPrivateAccess } from "./server-model-catalog-auth-DCNJBYb7.js";
import { a as readPreparedGatewayModelCatalogOwnerSnapshot, i as readPreparedGatewayModelCatalog, n as loadGatewayModelCatalogSnapshot, r as loadPreparedGatewayModelCatalogSnapshot, t as loadGatewayModelCatalog } from "./server-model-catalog-C1bZx4vW.js";
import { n as resolveAgentExplicitRecipientSession, r as resolveAgentOutboundTarget, t as resolveAgentDeliveryPlanWithSessionRoute } from "./agent-delivery-k4NdoSge.js";
import { t as measureAgentStartup } from "./startup-timing-ysBV0I5C.js";
import { n as acquireWorktreeRunLease, o as resolveWorktreeIdForPath } from "./run-lease-DrYnw-Yh.js";
import { t as createLazyAcpElicitationHandler } from "./acp-elicitation-handler-lazy-DG5M9Tq1.js";
import { i as runEmbeddedAgentEntry, t as hasSameCompactionWriter } from "./agent-runner-compaction-accounting-DgyN7qs3.js";
import { t as resolveAgentRunContext } from "./run-context-D1ccatfu.js";
import path from "node:path";
import { randomUUID } from "node:crypto";
//#region src/gateway/local-request-context.ts
function cronUnavailable() {
	throw new Error("Cron is unavailable in local embedded agent gateway context.");
}
const unavailableCron = {
	start: async () => {
		cronUnavailable();
	},
	stop: () => {},
	pauseScheduling: () => {},
	resumeScheduling: () => {},
	status: async () => cronUnavailable(),
	list: async () => cronUnavailable(),
	listPage: async () => cronUnavailable(),
	add: async () => cronUnavailable(),
	update: async () => cronUnavailable(),
	updateWithPrecondition: async () => cronUnavailable(),
	remove: async () => cronUnavailable(),
	removeStaleJobFamily: async () => cronUnavailable(),
	removeAgentJobsTransactional: async () => cronUnavailable(),
	run: async () => cronUnavailable(),
	enqueueRun: async () => cronUnavailable(),
	getJob: () => void 0,
	readJob: async () => void 0,
	readScratch: async () => cronUnavailable(),
	writeScratch: async () => cronUnavailable(),
	getDefaultAgentId: () => void 0,
	wake: () => ({
		ok: false,
		reason: "unwakeable-session-key"
	})
};
/** Creates the minimal gateway context used by embedded local agent execution. */
function createLocalGatewayRequestContext(params) {
	const logGateway = createSubsystemLogger("gateway/local");
	const cron = {
		...unavailableCron,
		removeAgentJobsTransactional: async (agentId, commit) => await withLocalAgentCronJobsRemoved(agentId, params.getRuntimeConfig, commit)
	};
	const sessionEvents = /* @__PURE__ */ new Set();
	const chatRunState = createChatRunState();
	const loadCatalogSnapshot = (loadParams) => loadGatewayModelCatalogSnapshot({
		...loadParams,
		getConfig: params.getRuntimeConfig
	});
	registerGatewayModelCatalogPrivateAccess(loadCatalogSnapshot, {
		loadDeferred: (loadParams) => loadPreparedGatewayModelCatalogSnapshot({
			...loadParams,
			getConfig: params.getRuntimeConfig
		}),
		readPrepared: (loadParams) => readPreparedGatewayModelCatalogOwnerSnapshot({
			...loadParams,
			getConfig: params.getRuntimeConfig
		})
	});
	const context = {
		localEmbedded: true,
		deps: params.deps,
		configRevisionProjector: loadGatewayConfigRevisionProjector({ env: process.env }),
		cron,
		cronStorePath: "",
		getRuntimeConfig: params.getRuntimeConfig,
		isConfigReloadSettled: () => false,
		notifyPluginMetadataChanged: () => {},
		resolveTerminalLaunchPolicy: () => ({
			ok: false,
			block: { kind: "disabled" }
		}),
		isTerminalEnabled: () => false,
		loadGatewayModelCatalog: (loadParams) => loadGatewayModelCatalog({
			...loadParams,
			getConfig: params.getRuntimeConfig
		}),
		loadGatewayModelCatalogSnapshot: loadCatalogSnapshot,
		readPreparedGatewayModelCatalog: (loadParams) => readPreparedGatewayModelCatalog({
			...loadParams,
			getConfig: params.getRuntimeConfig
		}),
		readChatMetadata: async () => {
			throw new Error("Chat metadata is unavailable in local embedded agent gateway context.");
		},
		getHealthCache: () => null,
		refreshHealthSnapshot: async () => ({}),
		logHealth: { error: (message) => logGateway.error(message) },
		logGateway,
		incrementPresenceVersion: () => 0,
		getHealthVersion: () => 0,
		broadcast: () => {},
		broadcastToConnIds: () => {},
		nodeSendToSession: () => {},
		nodeSendToAllSubscribed: () => {},
		nodeSubscribe: () => {},
		nodeUnsubscribe: () => {},
		nodeUnsubscribeAll: () => {},
		hasConnectedTalkNode: async () => false,
		nodeRegistry: new NodeRegistry(),
		agentRunSeq: /* @__PURE__ */ new Map(),
		chatAbortControllers: /* @__PURE__ */ new Map(),
		chatQueuedTurns: /* @__PURE__ */ new Map(),
		chatRunState,
		addChatRun: chatRunState.registry.add,
		removeChatRun: chatRunState.registry.remove,
		subscribeSessionEvents: (connId) => {
			sessionEvents.add(connId);
		},
		unsubscribeSessionEvents: (connId) => {
			sessionEvents.delete(connId);
		},
		subscribeSessionMessageEvents: () => void 0,
		unsubscribeSessionMessageEvents: () => {},
		unsubscribeAllSessionEvents: (connId) => {
			sessionEvents.delete(connId);
		},
		getSessionEventSubscriberConnIds: () => sessionEvents,
		registerToolEventRecipient: () => {},
		dedupe: /* @__PURE__ */ new Map(),
		wizardSessions: /* @__PURE__ */ new Map(),
		systemAgentSessions: /* @__PURE__ */ new Map(),
		findRunningWizard: () => null,
		purgeWizardSession: () => {},
		getRuntimeSnapshot: () => ({}),
		startChannel: async () => {
			throw new Error("Channel start is unavailable in local embedded agent gateway context.");
		},
		stopChannel: async () => {
			throw new Error("Channel stop is unavailable in local embedded agent gateway context.");
		},
		markChannelLoggedOut: () => {},
		wizardRunner: async () => {
			throw new Error("Onboarding wizard is unavailable in local embedded agent gateway context.");
		},
		channelWizardRunner: async () => {
			throw new Error("Channel setup wizard is unavailable in local embedded agent gateway context.");
		},
		broadcastVoiceWakeChanged: () => {},
		broadcastVoiceWakeRoutingChanged: () => {},
		unavailableGatewayMethods: /* @__PURE__ */ new Set()
	};
	context.createAgentTurnFacade = async (principal) => {
		const { createInternalAgentTurnFacade } = await import("./internal-facade.runtime.js");
		return createInternalAgentTurnFacade({
			...principal,
			getContext: () => context
		});
	};
	return context;
}
/** Runs code inside a local gateway request scope unless an outer scope already exists. */
function withLocalGatewayRequestScope(params, run) {
	const existing = getPluginRuntimeGatewayRequestScope();
	if (existing?.context) return run();
	const context = createLocalGatewayRequestContext(params);
	return withPluginRuntimeGatewayRequestScope({
		...existing,
		context,
		isWebchatConnect: existing?.isWebchatConnect ?? (() => false)
	}, run);
}
//#endregion
//#region src/agents/agent-command-recovery-owner.ts
const log$6 = createSubsystemLogger("agents/agent-command");
function cloneRecoveryOwnerEntry(entry) {
	return {
		...entry,
		...entry.restartRecoveryRuns ? { restartRecoveryRuns: entry.restartRecoveryRuns.map((run) => ({ ...run })) } : {},
		...entry.mainRestartRecovery ? { mainRestartRecovery: structuredClone(entry.mainRestartRecovery) } : {}
	};
}
function refreshPreparedRecoveryOwnerTarget(prepared, acquired) {
	if (!acquired || acquired.entry.sessionId !== prepared.sessionId) return;
	const entry = cloneRecoveryOwnerEntry(acquired.entry);
	prepared.sessionEntry = entry;
	if (prepared.sessionStore && prepared.sessionKey) prepared.sessionStore[prepared.sessionKey] = entry;
}
async function claimAgentCommandRecoveryOwner(params) {
	const transferredLease = params.opts.mainRestartRecoveryOwnerLease;
	if (transferredLease) {
		const expectedLeaseSessionId = params.prepared.isNewSession ? params.prepared.previousSessionId : params.prepared.sessionId;
		if (!(expectedLeaseSessionId !== void 0 && transferredLease.lifecycleGeneration === params.lifecycleGeneration && transferredLease.sessionId === expectedLeaseSessionId && transferredLease.sessionKey === params.prepared.sessionKey && path.resolve(transferredLease.storePath) === path.resolve(params.prepared.storePath))) throw new Error("main-session recovery owner changed during ingress preparation; retry");
		const snapshot = await refreshMainSessionRecoveryOwner(transferredLease, params.opts.runId);
		if (!snapshot) throw new Error("main-session recovery owner changed during ingress preparation; retry");
		return snapshot;
	}
	if (params.opts.sessionEffects === "internal") return;
	if (params.opts.mainRestartRecoveryAdmitted === true) return;
	const sessionKey = params.prepared.sessionKey;
	if (!sessionKey) return;
	if (params.mode === "reject_uncoordinated") {
		const recoveryInspection = await inspectMainSessionRecoveryRequired({
			allowMissingSession: params.prepared.isNewSession && !params.prepared.previousSessionId || params.opts.sessionId?.trim() === params.prepared.sessionId,
			expectedSessionId: params.prepared.previousSessionId ?? params.prepared.sessionId,
			lifecycleGeneration: params.lifecycleGeneration,
			target: {
				sessionKey,
				storePath: params.prepared.storePath
			}
		});
		if (recoveryInspection.kind === "invalidated") throw createSessionWorkStartChangedError(sessionKey);
		if (recoveryInspection.kind === "required") throw new Error(`Session "${sessionKey}" has interrupted work pending restart recovery; retry through a healthy Gateway or reset it there with /new or /reset.`);
		return;
	}
	const claim = await claimMainSessionRecoveryOwner({
		allowMissingSession: params.prepared.isNewSession && !params.prepared.previousSessionId || params.opts.sessionId?.trim() === params.prepared.sessionId,
		lifecycleGeneration: params.lifecycleGeneration,
		sessionId: params.prepared.previousSessionId ?? params.prepared.sessionId,
		replacementSessionId: params.prepared.isNewSession ? params.prepared.sessionId : void 0,
		runId: params.opts.runId,
		target: {
			sessionKey,
			storePath: params.prepared.storePath
		}
	});
	if (claim.kind === "invalidated") throw createSessionWorkStartChangedError(sessionKey);
	if (claim.kind === "not_required") return;
	return {
		lease: claim.lease,
		entry: claim.entry,
		sessionKey: claim.sessionKey
	};
}
async function runWithAgentCommandRecoveryOwner(params) {
	let lease = params.opts.mainRestartRecoveryOwnerLease;
	let pendingRecovery = void 0;
	let prepared;
	try {
		try {
			prepared = await params.prepare(params.opts);
		} catch (error) {
			const restoreAdmittedRecovery = params.restoreAdmittedRecovery;
			if (restoreAdmittedRecovery) pendingRecovery = await repairMainSessionRecoveryMutation({
				mutation: restoreAdmittedRecovery,
				onDeferredSuccess: scheduleMainSessionRecoveryPendingTarget,
				onError: (restoreError) => log$6.warn(`failed to restore admitted recovery after command preparation: ${formatErrorMessage(restoreError)}`)
			});
			throw error;
		}
		const acquired = await claimAgentCommandRecoveryOwner({
			...params,
			prepared
		});
		lease = acquired?.lease;
		refreshPreparedRecoveryOwnerTarget(prepared, acquired);
		return await params.run(prepared);
	} finally {
		try {
			const releasedRecovery = await releaseMainSessionRecoveryOwner(lease);
			pendingRecovery ??= releasedRecovery;
		} catch (error) {
			log$6.warn(`failed to release main-session recovery owner: ${formatErrorMessage(error)}`);
		}
		try {
			await prepared?.runLease?.release();
		} finally {
			scheduleMainSessionRecoveryPendingTarget(pendingRecovery);
		}
	}
}
//#endregion
//#region src/agents/agent-runtime-config.ts
/** Resolves agent runtime config, including SecretRef materialization for agent command use. */
/** Loads runtime/source config and resolves command SecretRefs when the agent path needs them. */
async function resolveAgentRuntimeConfig(runtime, params, runtimeContext) {
	const loadedRaw = getRuntimeConfig();
	const prepare = () => resolveAgentRuntimeConfigUnshared(runtime, params, loadedRaw);
	// Only trusted prepared-generation ingress with identical pinned config,
	// no delivery target and no SecretRef resolution may share initialization.
	// Other callers retain their own resolution, warnings and error handling.
	if (runtimeContext?.pluginGeneration && !params?.runtimeTargetsChannelSecrets &&
		!params?.runtimeChannelSecretScope && !getActiveSecretsRuntimeConfigSnapshot() &&
		!hasAgentRuntimeSecretRefs({ config: loadedRaw, includeChannelTargets: false })) {
		return await shareColdConfigPreparation(loadedRaw, runtimeContext.pluginGeneration, runtime, prepare);
	}
	return await prepare();
}
async function resolveAgentRuntimeConfigUnshared(runtime, params, loadedRaw) {
	const includeChannelTargets = params?.runtimeTargetsChannelSecrets === true;
	const channelSecretScope = params?.runtimeChannelSecretScope;
	const hasRuntimeSecretRefs = hasAgentRuntimeSecretRefs({
		config: loadedRaw,
		includeChannelTargets,
		channel: channelSecretScope?.channel
	});
	const activeSecretsConfig = getActiveSecretsRuntimeConfigSnapshot();
	let pluginMetadataSnapshot;
	const sourceConfig = activeSecretsConfig ? activeSecretsConfig.sourceConfig : await measureAgentStartup("config-source", async () => {
		try {
			const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
			if (snapshot.valid) {
				pluginMetadataSnapshot = writeOptions.basePluginMetadataSnapshot;
				return snapshot.resolved;
			}
		} catch {}
		pluginMetadataSnapshot = resolvePluginMetadataSnapshot({ config: loadedRaw });
		return loadedRaw;
	}, { config: loadedRaw });
	const cfg = hasRuntimeSecretRefs ? await (async () => {
		const runtimeSecretTargets = resolveAgentRuntimeSecretTargets({
			config: loadedRaw,
			includeChannelTargets,
			channelSecretScope
		});
		return (await (await import("./command-config-resolution.runtime.js")).resolveCommandConfigWithSecrets({
			config: loadedRaw,
			commandName: "agent",
			targetIds: runtimeSecretTargets.targetIds,
			...runtimeSecretTargets.allowedPaths ? { allowedPaths: runtimeSecretTargets.allowedPaths } : {},
			...runtimeSecretTargets.optionalActivePaths.size > 0 ? { optionalActivePaths: runtimeSecretTargets.optionalActivePaths } : {},
			runtime
		})).resolvedConfig;
	})() : loadedRaw;
	if (activeSecretsConfig && cfg !== loadedRaw) setRuntimeConfigSnapshot(cfg, sourceConfig);
	else if (!activeSecretsConfig) {
		const secretsRuntime = await measureAgentStartup("secrets-runtime-import", () => import("./runtime-BA_TxOCt.js"), { config: cfg });
		const snapshot = await measureAgentStartup("secrets-snapshot", () => secretsRuntime.prepareSecretsRuntimeSnapshot({
			config: sourceConfig,
			assignmentConfig: cfg,
			includeConfigRefs: false,
			...pluginMetadataSnapshot ? { pluginMetadataSnapshot } : {}
		}), { config: cfg });
		secretsRuntime.activateSecretsRuntimeSnapshot(snapshot);
	}
	return cfg;
}
function hasNestedSecretRef(value) {
	if (isSecretRef(value)) return true;
	if (Array.isArray(value)) return value.some((entry) => hasNestedSecretRef(entry));
	if (!value || typeof value !== "object") return false;
	return Object.values(value).some((entry) => hasNestedSecretRef(entry));
}
function hasAgentRuntimeSecretRefs(params) {
	const { config } = params;
	if (hasNestedSecretRef(config.models?.providers)) return true;
	if (hasNestedSecretRef(config.memory?.search?.remote)) return true;
	if (listAgentEntries(config).some((agent) => hasNestedSecretRef({
		memoryRemote: agent.memory?.search?.remote,
		tts: agent.tts
	}))) return true;
	if (hasNestedSecretRef(config.tts)) return true;
	if (hasNestedSecretRef(config.skills?.entries)) return true;
	if (hasNestedSecretRef(config.tools?.web?.search)) return true;
	if (config.plugins?.entries && Object.values(config.plugins.entries).some((entry) => hasNestedSecretRef({
		webSearch: entry?.config?.webSearch,
		webFetch: entry?.config?.webFetch
	}))) return true;
	if (params.includeChannelTargets) return hasNestedSecretRef(config.channels);
	if (!params.channel) return false;
	return hasNestedSecretRef(config.channels?.[params.channel]);
}
function resolveAgentRuntimeSecretTargets(params) {
	const baseTargetIds = getAgentRuntimeCommandSecretTargetIds({
		config: params.config,
		includeChannelTargets: params.includeChannelTargets
	});
	const optionalActivePaths = getAgentRuntimeOptionalCommandSecretPaths(params.config);
	if (params.includeChannelTargets || !params.channelSecretScope) return {
		targetIds: baseTargetIds,
		optionalActivePaths
	};
	const channelTargets = getScopedChannelsCommandSecretTargets({
		config: params.config,
		channel: params.channelSecretScope.channel,
		accountId: params.channelSecretScope.accountId,
		defaultAccountWhenMissing: true
	});
	const targetIds = new Set(baseTargetIds);
	for (const targetId of channelTargets.targetIds) targetIds.add(targetId);
	if (!channelTargets.allowedPaths) return {
		targetIds,
		optionalActivePaths
	};
	const allowedPaths = new Set(channelTargets.allowedPaths);
	for (const target of discoverConfigSecretTargetsByIds(params.config, baseTargetIds)) allowedPaths.add(target.path);
	return {
		targetIds,
		allowedPaths,
		optionalActivePaths
	};
}
//#endregion
//#region src/agents/command/attempt-execution.shared.ts
/**
* Shared session persistence and prompt-body helpers for agent attempt
* execution paths.
*/
/** Persists one session entry while keeping the caller's in-memory store aligned. */
async function persistAgentSession(params) {
	let rejectedMissingEntry = false;
	// voice-session-persistence-cas-retry-v1
	let persisted;
	for (let attempt = 0; ; attempt++) {
		rejectedMissingEntry = false;
		try {
			persisted = await patchSessionEntryCore({
		sessionKey: params.sessionKey,
		storePath: params.storePath
	}, (_entry, context) => {
		const shouldPersistCurrent = params.shouldPersist?.(context.existingEntry);
		if (!context.existingEntry && shouldPersistCurrent !== true) {
			rejectedMissingEntry = true;
			return null;
		}
		if (shouldPersistCurrent === false) {
			rejectedMissingEntry = !context.existingEntry;
			return null;
		}
		if (!context.existingEntry) return params.entry;
		if (context.existingEntry.sessionId !== params.initialEntry.sessionId) return null;
		return mergeSessionSnapshotChanges({
			initial: params.initialEntry,
			next: params.entry,
			current: context.existingEntry
		});
	}, {
		fallbackEntry: params.sessionStore[params.sessionKey] ?? params.entry,
		replaceEntry: true
	});
			break;
		} catch (error) {
			if (error?.name !== 'SqliteSessionMutationConflictError' ||
				error.message !== 'SQLite session state changed while preparing session-entry.patch' ||
				attempt >= 2) throw error;
			// The failed CAS committed nothing. Re-read and re-merge against the
			// current entry; native identity and shouldPersist guards still apply.
			await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
		}
	}
	if (rejectedMissingEntry) {
		delete params.sessionStore[params.sessionKey];
		return;
	}
	if (persisted) params.sessionStore[params.sessionKey] = persisted;
	else delete params.sessionStore[params.sessionKey];
	return persisted ?? void 0;
}
/** Prepends hidden internal event context unless the body already carries it. */
function prependInternalEventContext(body, events) {
	if (hasInternalRuntimeContext(body)) return body;
	const renderedEvents = formatAgentInternalEventsForPrompt(events);
	if (!renderedEvents) return body;
	return [renderedEvents, body].filter(Boolean).join("\n\n");
}
function resolvePlainInternalEventBody(body, events) {
	const renderedEvents = formatAgentInternalEventsForPlainPrompt(events);
	if (!renderedEvents) return body;
	return [renderedEvents, stripInternalRuntimeContext(body).trim()].filter(Boolean).join("\n\n") || body;
}
/** Resolves the prompt body submitted to ACP runtimes. */
function resolveAcpPromptBody(body, events) {
	return events?.length ? resolvePlainInternalEventBody(body, events) : body;
}
/** Resolves the body stored in transcripts after internal event rendering. */
function resolveInternalEventTranscriptBody(body, events) {
	if (!hasInternalRuntimeContext(body)) return body;
	return resolvePlainInternalEventBody(body, events);
}
//#endregion
//#region src/agents/command/explicit-session-key.ts
function resolveExplicitAgentCommandSessionKey(params) {
	if (isUnscopedSessionKeySentinel(params.rawExplicitSessionKey)) return params.rawExplicitSessionKey;
	const unscopedOwnerAgentId = classifySessionKeyShape(params.rawExplicitSessionKey) === "legacy_or_alias" && (params.agentIdOverride || params.shouldScopeDefaultAgentKey) ? resolveSessionAgentIds({
		config: params.cfg,
		agentId: params.agentIdOverride,
		sessionKey: params.rawExplicitSessionKey
	}).sessionAgentId : void 0;
	return scopeLegacySessionKeyToAgent({
		agentId: unscopedOwnerAgentId ?? params.agentIdOverride,
		sessionKey: params.rawExplicitSessionKey,
		mainKey: params.cfg.session?.mainKey
	});
}
//#endregion
//#region src/agents/command/runtime-loaders.ts
const attemptExecutionRuntimeLoader = createLazyImportLoader(() => import("./attempt-execution.runtime.js"));
const acpManagerRuntimeLoader = createLazyImportLoader(() => import("./acp/control-plane/manager.js"));
const acpPolicyRuntimeLoader = createLazyImportLoader(() => import("./policy-BZcEYUWj.js"));
const acpRuntimeErrorsRuntimeLoader = createLazyImportLoader(() => import("./errors-C_ZNsgiJ.js"));
const acpSessionIdentifiersRuntimeLoader = createLazyImportLoader(() => import("./acp-core/runtime/session-identifiers.js"));
const deliveryRuntimeLoader = createLazyImportLoader(() => import("./delivery.runtime.js"));
const sessionStoreRuntimeLoader = createLazyImportLoader(() => import("./session-store.runtime.js"));
const cliCompactionRuntimeLoader = createLazyImportLoader(() => import("./cli-compaction-zdSSv7yq.js"));
const agentRunnerMemoryRuntimeLoader = createLazyImportLoader(() => import("./agent-runner-memory-B-bv9ico.js"));
const transcriptResolveRuntimeLoader = createLazyImportLoader(() => import("./transcript-resolve.runtime.js"));
const transcriptAppendRuntimeLoader = createLazyImportLoader(() => import("./transcript.runtime.js"));
const cliDepsRuntimeLoader = createLazyImportLoader(() => import("./deps-DZ1SfM39.js"));
const execDefaultsRuntimeLoader = createLazyImportLoader(() => import("./exec-defaults-B3qxvkGR.js"));
const skillsRuntimeLoader = createLazyImportLoader(async () => {
	const [remote, sessionSnapshot] = await Promise.all([import("./remote-DOGd902G.js"), import("./session-snapshot-CrzRGVMe.js")]);
	return {
		getRemoteSkillEligibility: remote.getRemoteSkillEligibility,
		resolveReusableWorkspaceSkillSnapshot: sessionSnapshot.resolveReusableWorkspaceSkillSnapshot
	};
});
function loadAttemptExecutionRuntime() {
	return attemptExecutionRuntimeLoader.load();
}
function loadAcpManagerRuntime() {
	return acpManagerRuntimeLoader.load();
}
function loadAcpPolicyRuntime() {
	return acpPolicyRuntimeLoader.load();
}
function loadAcpRuntimeErrorsRuntime() {
	return acpRuntimeErrorsRuntimeLoader.load();
}
function loadAcpSessionIdentifiersRuntime() {
	return acpSessionIdentifiersRuntimeLoader.load();
}
function loadDeliveryRuntime() {
	return deliveryRuntimeLoader.load();
}
function loadSessionStoreRuntime() {
	return sessionStoreRuntimeLoader.load();
}
function loadCliCompactionRuntime() {
	return cliCompactionRuntimeLoader.load();
}
function loadAgentRunnerMemoryRuntime() {
	return agentRunnerMemoryRuntimeLoader.load();
}
function loadTranscriptResolveRuntime() {
	return transcriptResolveRuntimeLoader.load();
}
function loadTranscriptAppendRuntime() {
	return transcriptAppendRuntimeLoader.load();
}
function loadExecDefaultsRuntime() {
	return execDefaultsRuntimeLoader.load();
}
function loadSkillsRuntime() {
	return skillsRuntimeLoader.load();
}
async function resolveAgentCommandDeps(deps) {
	if (deps) return deps;
	const { createDefaultDeps } = await cliDepsRuntimeLoader.load();
	return createDefaultDeps();
}
//#endregion
//#region src/agents/command/prepare.ts
const OVERRIDE_VALUE_MAX_LENGTH = 256;
function containsControlCharacters(value) {
	for (const char of value) {
		const code = char.codePointAt(0);
		if (code === void 0) continue;
		if (code <= 31 || code >= 127 && code <= 159) return true;
	}
	return false;
}
function normalizeExplicitOverrideInput(raw, kind) {
	const trimmed = raw.trim();
	const label = kind === "provider" ? "Provider" : "Model";
	if (!trimmed) throw new Error(`${label} override must be non-empty.`);
	if (trimmed.length > OVERRIDE_VALUE_MAX_LENGTH) throw new Error(`${label} override exceeds ${String(OVERRIDE_VALUE_MAX_LENGTH)} characters.`);
	if (containsControlCharacters(trimmed)) throw new Error(`${label} override contains invalid control characters.`);
	return trimmed;
}
async function prepareAgentCommandExecution(opts, runtime, runtimeContext) {
	const isRawModelRun = opts.modelRun === true || opts.promptMode === "none";
	const message = opts.message ?? "";
	if (!message.trim()) throw new Error("Message (--message) is required");
	const rawExplicitSessionKey = opts.sessionKey?.trim();
	const requestedSessionId = opts.sessionId?.trim() || void 0;
	const rawTo = opts.to?.trim();
	const toSessionKey = !rawExplicitSessionKey && !requestedSessionId && classifySessionKeyShape(rawTo) === "agent" ? rawTo : void 0;
	const recipientChannel = resolveMessageChannel(opts.channel);
	const shouldResolveExplicitRecipientSession = Boolean(!rawExplicitSessionKey && !requestedSessionId && !toSessionKey && opts.agentId?.trim() && recipientChannel && isDeliverableMessageChannel(recipientChannel) && rawTo);
	if (!opts.to && !requestedSessionId && !rawExplicitSessionKey && !opts.agentId) throw new Error("Pass --to <E.164>, --session-key, --session-id, or --agent to choose a session");
	const cfg = await resolveAgentRuntimeConfig(runtime, {
		runtimeTargetsChannelSecrets: opts.deliver === true,
		runtimeChannelSecretScope: opts.deliver !== true && shouldResolveExplicitRecipientSession && recipientChannel ? {
			channel: recipientChannel,
			accountId: opts.accountId
		} : void 0
	}, runtimeContext);
	const normalizedSpawned = normalizeSpawnedRunMetadata({
		spawnedBy: opts.spawnedBy,
		groupId: opts.groupId,
		groupChannel: opts.groupChannel,
		groupSpace: opts.groupSpace,
		workspaceDir: opts.workspaceDir
	});
	const agentIdOverrideRaw = opts.agentId?.trim();
	const agentIdOverride = agentIdOverrideRaw ? normalizeAgentId(agentIdOverrideRaw) : void 0;
	if (agentIdOverride) {
		if (!listAgentIds(cfg).includes(agentIdOverride)) throw new Error(`Unknown agent id "${agentIdOverrideRaw}". Use "${formatCliCommand("openclaw agents list")}" to see configured agents.`);
	}
	const shouldScopeDefaultAgentKey = Boolean(rawExplicitSessionKey && !agentIdOverride && classifySessionKeyShape(rawExplicitSessionKey) === "legacy_or_alias" && !isUnscopedSessionKeySentinel(rawExplicitSessionKey));
	const explicitSessionKey = toSessionKey ?? resolveExplicitAgentCommandSessionKey({
		rawExplicitSessionKey,
		agentIdOverride,
		shouldScopeDefaultAgentKey,
		cfg
	});
	if (explicitSessionKey && classifySessionKeyShape(explicitSessionKey) === "malformed_agent") throw new Error(`Invalid --session-key "${explicitSessionKey}". Agent-prefixed session keys must use agent:<agent-id>:<session-key>.`);
	if (agentIdOverride && explicitSessionKey && classifySessionKeyShape(explicitSessionKey) === "agent") {
		const sessionAgentId = resolveAgentIdFromSessionKey(explicitSessionKey);
		if (sessionAgentId !== agentIdOverride) throw new Error(`Agent id "${agentIdOverrideRaw}" does not match session key agent "${sessionAgentId}".`);
	}
	const agentCfg = cfg.agents?.defaults;
	const verboseOverride = normalizeVerboseLevel(opts.verbose);
	if (opts.verbose && !verboseOverride) throw new Error("Invalid verbose level. Use \"on\", \"full\", or \"off\".");
	const isSubagentLane = (normalizeOptionalString(opts.lane) ?? "") === AGENT_LANE_SUBAGENT;
	const hasExplicitTimeoutOption = opts.timeout !== void 0;
	const timeoutSecondsRaw = hasExplicitTimeoutOption ? parseStrictNonNegativeInteger(opts.timeout) ?? NaN : isSubagentLane ? 0 : void 0;
	if (timeoutSecondsRaw !== void 0 && (Number.isNaN(timeoutSecondsRaw) || timeoutSecondsRaw < 0)) throw new Error("--timeout must be a non-negative integer (seconds; 0 means no timeout)");
	const timeoutMs = resolveAgentTimeoutMs({
		cfg,
		overrideSeconds: timeoutSecondsRaw
	});
	const runTimeoutOverrideMs = hasExplicitTimeoutOption ? timeoutMs : void 0;
	const selectedCommandOpts = toSessionKey ? {
		...opts,
		to: void 0,
		sessionKey: explicitSessionKey
	} : opts;
	const explicitRecipientSession = shouldResolveExplicitRecipientSession && agentIdOverride && recipientChannel && rawTo ? await resolveAgentExplicitRecipientSession({
		cfg,
		agentId: agentIdOverride,
		channel: recipientChannel,
		to: rawTo,
		accountId: selectedCommandOpts.accountId,
		threadId: selectedCommandOpts.threadId
	}) : void 0;
	if (explicitRecipientSession?.error) throw explicitRecipientSession.error;
	let commandOpts = explicitRecipientSession?.sessionKey ? {
		...selectedCommandOpts,
		channel: explicitRecipientSession.channel,
		to: explicitRecipientSession.to,
		accountId: explicitRecipientSession.accountId,
		threadId: explicitRecipientSession.threadId
	} : selectedCommandOpts;
	const { sessionId, sessionKey, sessionEntry: sessionEntryRaw, storePath, isNewSession, previousSessionId, persistedThinking, persistedVerbose } = resolveSession({
		cfg,
		to: commandOpts.to,
		sessionId: commandOpts.sessionId,
		sessionKey: explicitSessionKey ?? explicitRecipientSession?.sessionKey,
		agentId: agentIdOverride
	});
	const harnessSessionError = sessionKey ? resolveAgentHarnessSessionContextError(sessionKey, sessionEntryRaw) : void 0;
	if (harnessSessionError) throw new Error(harnessSessionError);
	if ((opts.modelRun === true || opts.promptMode === "none") && sessionKey && sessionEntryRaw?.modelSelectionLocked === true) throw new Error(AGENT_HARNESS_MODEL_RUN_FORBIDDEN_MESSAGE);
	const sessionStore = sessionKey && sessionEntryRaw ? { [sessionKey]: sessionEntryRaw } : {};
	const sessionAgentId = agentIdOverride ?? resolveSessionAgentId({
		sessionKey: sessionKey ?? explicitSessionKey,
		config: cfg
	});
	const outboundSession = buildOutboundSessionContext({
		cfg,
		agentId: sessionAgentId,
		sessionKey
	});
	const workspaceDirRaw = normalizedSpawned.workspaceDir ?? resolveAgentWorkspaceDir(cfg, sessionAgentId);
	const workspaceDir = resolveUserPath(workspaceDirRaw);
	const { getAcpSessionManager } = await loadAcpManagerRuntime();
	const acpManager = getAcpSessionManager();
	const acpResolution = sessionKey ? acpManager.resolveSession({
		cfg,
		sessionKey,
		agentId: sessionAgentId
	}) : null;
	const isAcpPlacedSession = acpResolution !== null && acpResolution.kind !== "none";
	const cwd = normalizeOptionalString(opts.cwd) ?? normalizeOptionalString(sessionEntryRaw?.spawnedCwd) ?? (isAcpPlacedSession ? void 0 : resolveAgentRunCwd(cfg, sessionAgentId));
	const agentDir = resolveAgentDir(cfg, sessionAgentId);
	const pluginsEnabled = cfg.plugins?.enabled !== false;
	const preparedMetadataSnapshot = runtimeContext?.pluginGeneration.pluginMetadataSnapshot;
	const manifestMetadataSnapshot = pluginsEnabled ? preparedMetadataSnapshot ?? resolvePluginMetadataSnapshot({
		config: cfg,
		env: process.env,
		workspaceDir
	}) : void 0;
	const modelManifestContext = { manifestPlugins: manifestMetadataSnapshot ?? [] };
	const configuredModel = resolveConfiguredModelRef({
		cfg,
		agentId: sessionAgentId,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL,
		allowPluginNormalization: pluginsEnabled,
		...modelManifestContext
	});
	const configuredThinkingCatalog = buildConfiguredModelCatalog({
		cfg,
		workspaceDir,
		...modelManifestContext
	});
	const configuredThinkingRuntime = resolveEffectiveAgentRuntime({
		cfg,
		provider: configuredModel.provider,
		modelId: configuredModel.model,
		agentId: sessionAgentId,
		sessionKey,
		sessionEntry: sessionEntryRaw
	});
	if (sessionEntryRaw && commandOpts.cliSessionBindingFacts === void 0 && isSyntheticSourceReplyTurn({
		inputProvenance: commandOpts.inputProvenance,
		isHeartbeat: commandOpts.bootstrapContextRunKind === "heartbeat"
	})) commandOpts = {
		...commandOpts,
		cliSessionBindingFacts: { sourceReplyDeliveryMode: resolveSessionStableReplyMode({
			cfg,
			ctx: { CommandAuthorized: false },
			sessionEntry: sessionEntryRaw,
			sessionAgentId,
			sessionKey
		}) }
	};
	const thinkingLevelsHint = formatThinkingLevels(configuredModel.provider, configuredModel.model, ", ", configuredThinkingCatalog.length > 0 ? configuredThinkingCatalog : void 0, configuredThinkingRuntime);
	const thinkOverride = normalizeThinkLevel(opts.thinking);
	const thinkOnce = normalizeThinkLevel(opts.thinkingOnce);
	if (opts.thinking && !thinkOverride) throw new Error(`Invalid thinking level. Use one of: ${thinkingLevelsHint}.`);
	if (opts.thinkingOnce && !thinkOnce) throw new Error(`Invalid one-shot thinking level. Use one of: ${thinkingLevelsHint}.`);
	const resolvedCwd = cwd ? resolveUserPath(cwd) : void 0;
	const worktreeId = await resolveWorktreeIdForPath({
		sessionEntry: sessionEntryRaw,
		candidatePaths: [resolvedCwd ?? workspaceDir, workspaceDir]
	});
	const runLease = worktreeId ? await acquireWorktreeRunLease(worktreeId) : void 0;
	try {
		const { resolveAcpAgentWorkspaceProvisioningForTurn } = await import("./acp-workspace-provisioning-BeD_7yxe.js");
		const workspaceProvisioning = await resolveAcpAgentWorkspaceProvisioningForTurn({
			cfg,
			agentId: sessionAgentId,
			workspaceDir,
			cwd: resolvedCwd,
			sessionKey: sessionKey ?? void 0,
			sessionEntry: sessionEntryRaw ?? void 0
		});
		await ensureAgentWorkspace({
			dir: workspaceDirRaw,
			ensureBootstrapFiles: !agentCfg?.skipBootstrap,
			skipOptionalBootstrapFiles: agentCfg?.skipOptionalBootstrapFiles,
			provisioning: workspaceProvisioning
		});
		const runId = opts.runId?.trim() || sessionId;
		let promptMessage = message;
		if (!isRawModelRun && (message.includes("$") || message.trimStart().startsWith("/"))) {
			const { expandExplicitSkillReferences, hasSkillReferenceCandidate, listSkillCommandsForWorkspace, resolveEffectiveAgentSkillFilter } = await import("./chat-commands.runtime.js");
			if (message.trimStart().startsWith("/") || hasSkillReferenceCandidate(message)) {
				const skillFilter = resolveEffectiveAgentSkillFilter(cfg, sessionAgentId);
				const commandParams = {
					workspaceDir,
					cfg,
					agentId: sessionAgentId,
					sessionEntry: sessionEntryRaw,
					sessionKey,
					...preparedMetadataSnapshot ? { pluginMetadataSnapshot: preparedMetadataSnapshot } : {},
					...skillFilter ? { skillFilter } : {}
				};
				const skillCommands = listSkillCommandsForWorkspace(commandParams);
				const expansion = expandExplicitSkillReferences({
					text: message,
					skillCommands,
					allSkillCommands: skillFilter ? listSkillCommandsForWorkspace({
						...commandParams,
						includeAllowlistHidden: true
					}) : skillCommands
				});
				if (expansion.error) throw new Error(expansion.error);
				promptMessage = expansion.body;
			}
		}
		const body = !isRawModelRun && acpResolution?.kind === "ready" ? resolveAcpPromptBody(promptMessage, opts.internalEvents) : prependInternalEventContext(promptMessage, opts.internalEvents);
		const transcriptBody = opts.transcriptMessage ?? resolveInternalEventTranscriptBody(message, opts.internalEvents);
		return {
			opts: commandOpts,
			body,
			transcriptBody,
			cfg,
			configuredThinkingCatalog,
			normalizedSpawned,
			agentCfg,
			thinkOverride,
			thinkOnce,
			verboseOverride,
			timeoutMs,
			runTimeoutOverrideMs,
			sessionId,
			sessionKey,
			sessionEntry: sessionEntryRaw,
			sessionStore,
			storePath,
			isNewSession,
			previousSessionId,
			persistedThinking,
			persistedVerbose,
			sessionAgentId,
			outboundSession,
			workspaceDir,
			cwd: resolvedCwd,
			agentDir,
			pluginsEnabled,
			manifestMetadataSnapshot,
			...runtimeContext ? { commandRuntimeContext: runtimeContext } : {},
			modelManifestContext,
			runId,
			isSubagentLane,
			acpManager,
			acpResolution,
			runLease
		};
	} catch (error) {
		await runLease?.release();
		throw error;
	}
}
//#endregion
//#region src/agents/agent-command-local.ts
/** Runs a local command under one request, recovery, and plugin-registry generation. */
async function runLocalAgentCommand(params) {
	const resolvedDeps = await measureAgentStartup("command-dependencies", () => resolveAgentCommandDeps(params.deps));
	const lifecycleGeneration = params.opts.lifecycleGeneration ?? captureAgentRunLifecycleGeneration(params.opts.runId ?? "");
	return await withAgentRunLifecycleGeneration(lifecycleGeneration, () => withLocalGatewayRequestScope({
		deps: resolvedDeps,
		getRuntimeConfig
	}, async () => await runWithAgentCommandRecoveryOwner({
		lifecycleGeneration,
		mode: "reject_uncoordinated",
		opts: {
			...params.opts,
			lifecycleGeneration,
			senderIsOwner: params.opts.senderIsOwner ?? true,
			allowModelOverride: params.opts.allowModelOverride ?? true
		},
		prepare: async (preparedOpts) => await measureAgentStartup("command-prepare", () => prepareAgentCommandExecution(preparedOpts, params.runtime)),
		run: async (prepared) => {
			const capability = params.operatorAuthority && prepared.opts.senderIsOwner === true ? createCronCreatorAuthorityCapability(prepared.runId, { kind: "local" }) : void 0;
			const admittedPrepared = capability ? {
				...prepared,
				opts: {
					...prepared.opts,
					cronCreatorAuthorityCapability: capability
				}
			} : prepared;
			const run = () => withAgentPluginRegistry({
				config: admittedPrepared.cfg,
				workspaceDir: admittedPrepared.workspaceDir,
				run: () => params.run(admittedPrepared, resolvedDeps)
			});
			return capability ? await runWithCronCreatorAuthorityCapability(capability, run, admittedPrepared.opts.abortSignal) : await run();
		}
	})));
}
//#endregion
//#region src/agents/agent-command-restart-recovery.ts
function normalizeOptionalThreadId(value) {
	return normalizeOptionalString(value) ?? (typeof value === "number" && Number.isFinite(value) ? String(value) : void 0);
}
/** Replace model-selected media with the exact host-owned delivery set. */
function constrainRestartRecoveryDeliveryPayloads(payloads, mediaUrls, suppressText = false) {
	const constrained = [];
	for (const payload of payloads ?? []) {
		const constrainedPayload = {};
		if (!suppressText && typeof payload.text === "string") constrainedPayload.text = payload.text;
		if (payload.isError === true) constrainedPayload.isError = true;
		if (payload.isReasoning === true) constrainedPayload.isReasoning = true;
		if (payload.isCommentary === true) constrainedPayload.isCommentary = true;
		if (payload.isReasoningSnapshot === true) constrainedPayload.isReasoningSnapshot = true;
		if (payload.isCompactionNotice === true) constrainedPayload.isCompactionNotice = true;
		if (payload.isFallbackNotice === true) constrainedPayload.isFallbackNotice = true;
		if (payload.isStatusNotice === true) constrainedPayload.isStatusNotice = true;
		if (Object.keys(constrainedPayload).length > 0) constrained.push(constrainedPayload);
	}
	const exactMediaUrls = Array.from(new Set(mediaUrls.map((url) => url.trim()).filter((url) => url.length > 0)));
	if (exactMediaUrls.length === 0) return constrained;
	if (!suppressText) {
		const visibleReplyIndex = constrained.findIndex((payload) => hasVisibleAgentPayload({ payloads: [payload] }, {
			includeErrorPayloads: false,
			includeSilentReplyPayloads: false,
			requireTerminalContent: true
		}));
		if (visibleReplyIndex >= 0) {
			const visibleReply = constrained[visibleReplyIndex];
			if (visibleReply) {
				const [mergedReply] = mergeAttemptToolMediaPayloads({
					payloads: [visibleReply],
					toolMediaUrls: exactMediaUrls,
					hostOwnedToolMediaUrls: exactMediaUrls,
					toolTrustedLocalMedia: true,
					sourceReplyDeliveryMode: "automatic"
				}) ?? [];
				if (mergedReply) {
					constrained[visibleReplyIndex] = mergedReply;
					return constrained;
				}
			}
		}
	}
	constrained.push({
		mediaUrls: exactMediaUrls,
		trustedLocalMedia: true
	});
	return constrained;
}
/** Reduce a terminal result to bounded, route-checkable delivery evidence. */
function buildRestartRecoveryTerminalDeliveryEvidence(result) {
	const rawPayloads = Array.isArray(result.payloads) ? result.payloads : void 0;
	const payloads = Array.isArray(rawPayloads) ? rawPayloads.slice(0, 64).map((payload) => {
		const mediaUrls = collectDeliveredMediaUrls({ payloads: [payload] });
		const evidence = { visible: hasExplicitlyVisibleAgentPayload(payload) };
		if (mediaUrls.length > 0) evidence.mediaUrls = mediaUrls;
		return evidence;
	}) : void 0;
	const payloadsTruncated = rawPayloads && rawPayloads.length > 64 ? true : void 0;
	const rawDeliveryStatus = result.deliveryStatus;
	const status = rawDeliveryStatus?.status === "failed" || rawDeliveryStatus?.status === "partial_failed" || rawDeliveryStatus?.status === "sent" || rawDeliveryStatus?.status === "suppressed" ? rawDeliveryStatus.status : void 0;
	const rawPayloadOutcomes = rawDeliveryStatus && typeof rawDeliveryStatus === "object" ? rawDeliveryStatus.payloadOutcomes : void 0;
	const payloadOutcomes = Array.isArray(rawPayloadOutcomes) ? rawPayloadOutcomes.flatMap((outcome) => {
		if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return [];
		const record = outcome;
		const outcomeStatus = record.status === "failed" || record.status === "sent" || record.status === "suppressed" ? record.status : void 0;
		if (!outcomeStatus || typeof record.index !== "number" || !Number.isInteger(record.index)) return [];
		return [{
			index: record.index,
			status: outcomeStatus,
			...typeof record.sentBeforeError === "boolean" ? { sentBeforeError: record.sentBeforeError } : {}
		}];
	}) : void 0;
	const errorMessage = normalizeOptionalString(rawDeliveryStatus?.errorMessage);
	const deliveryStatus = status ? {
		status,
		...errorMessage ? { errorMessage } : {},
		...payloadOutcomes?.length ? { payloadOutcomes } : {}
	} : void 0;
	const rawMessagingToolSentTargets = Array.isArray(result.messagingToolSentTargets) ? result.messagingToolSentTargets : void 0;
	const messagingToolSentTargets = rawMessagingToolSentTargets ? rawMessagingToolSentTargets.slice(0, 64).flatMap((target) => {
		if (!target || typeof target !== "object" || Array.isArray(target)) return [];
		const record = target;
		const mediaUrls = collectMessagingToolDeliveredMediaUrls({ messagingToolSentTargets: [record] });
		const evidence = { visible: hasVisibleCommittedMessagingToolDeliveryEvidence({ messagingToolSentTargets: [record] }) };
		const provider = normalizeOptionalString(record.provider);
		const accountId = normalizeOptionalString(record.accountId);
		const to = normalizeOptionalString(record.to);
		const threadId = normalizeOptionalThreadId(record.threadId);
		if (provider) evidence.provider = provider;
		if (accountId) evidence.accountId = accountId;
		if (to) evidence.to = to;
		if (threadId) evidence.threadId = threadId;
		if (record.threadImplicit === true) evidence.threadImplicit = true;
		if (record.threadSuppressed === true) evidence.threadSuppressed = true;
		if (mediaUrls.length > 0) evidence.mediaUrls = mediaUrls;
		return [evidence];
	}) : void 0;
	const messagingToolSentTargetsTruncated = rawMessagingToolSentTargets && rawMessagingToolSentTargets.length > 64 ? true : void 0;
	const messagingToolAggregateEvidenceUnaccounted = hasUnaccountedMessagingToolAggregateEvidence(result) ? true : void 0;
	const restartUnsafeSideEffectsDetected = hasCommittedOutboundDeliveryEvidence(result) || result.didSendDeterministicApprovalPrompt === true ? true : void 0;
	return {
		captured: true,
		...payloads?.length ? { payloads } : {},
		...payloadsTruncated ? { payloadsTruncated } : {},
		...deliveryStatus ? { deliveryStatus } : {},
		...messagingToolSentTargets?.length ? { messagingToolSentTargets } : {},
		...messagingToolSentTargetsTruncated ? { messagingToolSentTargetsTruncated } : {},
		...messagingToolAggregateEvidenceUnaccounted ? { messagingToolAggregateEvidenceUnaccounted } : {},
		...restartUnsafeSideEffectsDetected ? { restartUnsafeSideEffectsDetected } : {}
	};
}
function shouldPersistCurrentRunSessionCleanup(current, sessionId) {
	return current !== void 0 && current.sessionId === sessionId && current.abortedLastRun !== true;
}
function shouldPersistRestartRecoveryContextClaim(current, sessionId, runId, allowCreate) {
	if (!current) return allowCreate;
	if (!shouldPersistCurrentRunSessionCleanup(current, sessionId)) return false;
	return current.restartRecoveryDeliveryRunId === void 0 || current.restartRecoveryDeliveryRunId === runId;
}
function shouldPersistRestartRecoveryCleanup(current, sessionId, runId) {
	return shouldPersistCurrentRunSessionCleanup(current, sessionId) && current?.restartRecoveryDeliveryRunId === runId;
}
function buildCurrentRunRestartRecoveryClaim(params) {
	const adoptsExistingClaim = params.entry.restartRecoveryDeliveryRunId === params.runId;
	const createsTranscriptOnlySourceClaim = params.sourceRunId !== void 0 && params.deliveryContext === void 0;
	const createsScopedDeliveryClaim = params.sourceRunId !== void 0;
	if (!adoptsExistingClaim && createsScopedDeliveryClaim && !params.sourceIngress) throw new Error("restart recovery source ownership is required for a new claim");
	return {
		restartRecoveryDeliveryContext: adoptsExistingClaim ? params.entry.restartRecoveryDeliveryContext : params.deliveryContext,
		restartRecoveryDeliveryMediaUrls: adoptsExistingClaim ? params.entry.restartRecoveryDeliveryMediaUrls : createsScopedDeliveryClaim && params.deliveryMediaUrls !== void 0 ? [...params.deliveryMediaUrls] : void 0,
		restartRecoveryDisableMessageTool: adoptsExistingClaim ? params.entry.restartRecoveryDisableMessageTool : createsScopedDeliveryClaim && params.disableMessageTool === true ? true : void 0,
		restartRecoverySuppressTextDelivery: adoptsExistingClaim ? params.entry.restartRecoverySuppressTextDelivery : createsScopedDeliveryClaim && params.suppressTextDelivery === true ? true : void 0,
		restartRecoveryDeliveryRunId: params.deliveryContext || adoptsExistingClaim || createsTranscriptOnlySourceClaim ? params.runId : void 0,
		restartRecoveryDeliverySourceRunId: adoptsExistingClaim ? params.entry.restartRecoveryDeliverySourceRunId : params.sourceRunId,
		restartRecoverySourceIngress: adoptsExistingClaim ? params.entry.restartRecoverySourceIngress : createsScopedDeliveryClaim ? params.sourceIngress : void 0,
		restartRecoverySourceReplyDeliveryMode: adoptsExistingClaim ? params.entry.restartRecoverySourceReplyDeliveryMode : params.sourceRunId ? params.sourceReplyDeliveryMode : void 0,
		restartRecoveryForceSafeTools: adoptsExistingClaim ? params.entry.restartRecoveryForceSafeTools : createsScopedDeliveryClaim && params.forceRestartSafeTools === true ? true : void 0
	};
}
//#endregion
//#region src/agents/command/lifecycle.ts
const log$5 = createSubsystemLogger("agents/agent-command");
const formatLifecycleError = (error) => formatErrorMessageForDisplay(error, renderFailoverCodeUserCopy(getFailoverErrorCode(error)));
function resolveTerminalLogLevel(outcome) {
	if (!outcome.stopReason || outcome.stopReason === "end_turn") return;
	if (outcome.reason === "completed") return "info";
	return outcome.status === "timeout" ? "warn" : "error";
}
function applyAgentRunAbortMetadata(result, signal) {
	const abortFields = resolveAgentRunAbortLifecycleFields(signal);
	if (abortFields.aborted !== true) return result;
	return {
		...result,
		meta: {
			...result.meta,
			...abortFields
		}
	};
}
function createAgentCommandLifecycle(params) {
	let lifecycleFinishingEmitted = false;
	const resolveResultError = (runResult, includeErrorPayload) => params.state.lifecycleError ?? (includeErrorPayload ? runResult.payloads?.find((payload) => payload.isError === true && typeof payload.text === "string")?.text : void 0) ?? (runResult.meta.error ? "Agent run failed" : void 0);
	const emitTerminalPhase = (phase, terminal, error = terminal.outcome.status === "timeout" ? terminal.outcome.error : void 0) => {
		const { aborted, yielded, replayInvalid, terminalReply } = terminal.metadata;
		const terminalDelivery = normalizeAgentRunTerminalDeliverySnapshot(terminal.metadata.terminalDelivery);
		const terminalReceipt = normalizeAgentRunTerminalReceipt(terminal.metadata.terminalReceipt);
		const { stopReason, livenessState, timeoutPhase, providerStarted } = terminal.outcome;
		const abortFields = resolveAgentRunAbortLifecycleFields(params.abortSignal);
		emitAgentEvent({
			runId: params.runId,
			lifecycleGeneration: params.lifecycleGeneration(),
			stream: "lifecycle",
			data: {
				phase,
				startedAt: params.startedAt,
				endedAt: Date.now(),
				aborted: typeof aborted === "boolean" ? aborted : false,
				stopReason,
				...yielded === true ? { yielded } : {},
				...replayInvalid === true ? { replayInvalid } : {},
				...livenessState ? { livenessState } : {},
				...timeoutPhase ? { timeoutPhase } : {},
				...providerStarted !== void 0 ? { providerStarted } : {},
				...error ? { error: formatErrorMessage(error) } : {},
				...error && params.state.lifecycleErrorObservation ? { errorObservation: params.state.lifecycleErrorObservation } : {},
				...phase !== "finishing" ? { executionSettled: true } : {},
				...terminalDelivery ? { terminalDelivery } : {},
				...terminalReceipt ? { terminalReceipt } : {},
				...terminalReply ? { terminalReply } : {},
				...stopReason === "superseded" ? {
					aborted: true,
					stopReason
				} : abortFields
			}
		});
	};
	return {
		emitBasicError(error, extraData) {
			if (params.state.lifecycleEnded) return;
			params.state.lifecycleEnded = true;
			emitAgentEvent({
				runId: params.runId,
				lifecycleGeneration: params.lifecycleGeneration(),
				stream: "lifecycle",
				data: {
					phase: "error",
					startedAt: params.startedAt,
					endedAt: Date.now(),
					error: formatLifecycleError(error),
					...params.state.lifecycleErrorObservation ? { errorObservation: params.state.lifecycleErrorObservation } : {},
					...extraData,
					executionSettled: true
				}
			});
		},
		emitFinishing(terminal) {
			if (params.state.lifecycleEnded || params.state.lifecycleFinishing || lifecycleFinishingEmitted) return;
			lifecycleFinishingEmitted = true;
			params.state.lifecycleFinishing = true;
			emitTerminalPhase("finishing", terminal);
		},
		emitEnd(terminal) {
			if (params.state.lifecycleEnded) return;
			params.state.lifecycleEnded = true;
			const stopReason = terminal.outcome.stopReason;
			const logLevel = resolveTerminalLogLevel(terminal.outcome);
			if (logLevel) log$5[logLevel](`[agent] run ${params.runId} ended with stopReason=${stopReason}`);
			emitTerminalPhase("end", terminal);
		},
		resolveResultError,
		emitResultError(runResult, fallbackExhausted, terminal) {
			if (params.state.lifecycleEnded) return;
			params.state.lifecycleEnded = true;
			const error = params.state.lifecycleError ?? (terminal.outcome.status === "timeout" ? terminal.outcome.error : resolveResultError(runResult, fallbackExhausted)) ?? (fallbackExhausted ? "All model fallback candidates failed" : "Agent run failed");
			emitTerminalPhase("error", terminal, error);
		},
		emitPostTurnError(error, terminal) {
			if (params.state.lifecycleEnded) return;
			params.state.lifecycleEnded = true;
			const terminalDelivery = normalizeAgentRunTerminalDeliverySnapshot(terminal.metadata.terminalDelivery);
			emitAgentEvent({
				runId: params.runId,
				lifecycleGeneration: params.lifecycleGeneration(),
				stream: "lifecycle",
				data: {
					phase: "error",
					startedAt: params.startedAt,
					endedAt: Date.now(),
					error: formatLifecycleError(error),
					...terminalDelivery ? { terminalDelivery } : {},
					...resolveAgentRunErrorLifecycleFields(error, params.abortSignal),
					executionSettled: true
				}
			});
		}
	};
}
//#endregion
//#region src/agents/command/session-helpers.ts
function clearPendingFinalDelivery(entry, updatedAt) {
	return {
		...entry,
		pendingFinalDelivery: void 0,
		restartRecoveryForceSafeTools: void 0,
		restartRecoveryDeliveryMediaUrls: void 0,
		restartRecoveryDisableMessageTool: void 0,
		restartRecoverySuppressTextDelivery: void 0,
		updatedAt
	};
}
async function prepareCurrentRunDelivery(params) {
	const { cfg, opts, sessionEntry } = params;
	if (opts.deliver !== true) return;
	const buildPlan = async (requestedChannel, preparedPlugin) => await resolveAgentDeliveryPlanWithSessionRoute({
		cfg,
		agentId: params.agentId,
		currentSessionKey: params.currentSessionKey,
		sessionEntry,
		requestedChannel,
		explicitTo: opts.replyTo ?? opts.to,
		explicitThreadId: opts.threadId,
		accountId: opts.replyAccountId ?? opts.accountId,
		wantsDelivery: true,
		turnSourceChannel: opts.runContext?.messageChannel ?? opts.messageChannel,
		turnSourceTo: opts.runContext?.currentChannelId ?? opts.to,
		turnSourceAccountId: opts.runContext?.accountId ?? opts.accountId,
		turnSourceThreadId: opts.runContext?.currentThreadTs ?? opts.threadId,
		preparedPlugin
	});
	let deliveryPlan = await buildPlan(opts.replyChannel ?? opts.channel);
	const explicitChannelHint = normalizeOptionalString(opts.replyChannel ?? opts.channel);
	const explicitThreadId = opts.threadId != null && opts.threadId !== "" ? opts.threadId : void 0;
	if (deliveryPlan.resolvedChannel === "webchat" && !explicitChannelHint) {
		const selection = await resolveMessageChannelSelection({ cfg });
		deliveryPlan = await buildPlan(selection.channel, selection.plugin);
	}
	if (deliveryPlan.targetResolutionError) throw deliveryPlan.targetResolutionError;
	if (!isDeliverableMessageChannel(deliveryPlan.resolvedChannel)) throw new Error("delivery channel is required: pass --channel/--reply-channel or use a main session with a previous channel");
	const targetMode = opts.deliveryTargetMode ?? deliveryPlan.deliveryTargetMode ?? (opts.replyTo ?? opts.to ? "explicit" : "implicit");
	const resolved = resolveAgentOutboundTarget({
		cfg,
		plan: deliveryPlan,
		targetMode,
		validateExplicitTarget: true
	});
	if (resolved.resolvedTarget && !resolved.resolvedTarget.ok) throw resolved.resolvedTarget.error;
	const resolvedTo = resolved.resolvedTo;
	if (!resolvedTo) throw new Error(`delivery target is required for ${deliveryPlan.resolvedChannel}`);
	const threadId = targetMode === "explicit" ? explicitThreadId ?? (deliveryPlan.baseDelivery.threadIdSource === "explicit" ? deliveryPlan.resolvedThreadId : void 0) : deliveryPlan.resolvedThreadId;
	const context = normalizeDeliveryContext({
		channel: deliveryPlan.resolvedChannel,
		to: resolvedTo,
		accountId: deliveryPlan.resolvedAccountId,
		threadId
	});
	return context ? {
		context,
		targetMode
	} : void 0;
}
function resolveInternalSessionEffectsSource(params) {
	if (!params.storePath || !params.sessionKey) return;
	return {
		agentId: params.agentId,
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		storePath: params.storePath
	};
}
//#endregion
//#region src/agents/command/acp-execution.ts
const log$4 = createSubsystemLogger("agents/agent-command");
async function runAcpAgentCommand(params) {
	if (getInstallationTarget()) throw new Error(LOCAL_INSTALLATION_TARGET_UNSUPPORTED);
	const attemptExecutionRuntime = await loadAttemptExecutionRuntime();
	const acpToolTracker = attemptExecutionRuntime.createAcpToolLifecycleTracker();
	const startedAt = Date.now();
	registerAgentRunContext(params.runId, {
		sessionKey: params.sessionKey,
		sessionId: params.sessionId,
		agentId: params.sessionAgentId,
		lifecycleGeneration: params.lifecycleGeneration,
		projectSessionActive: !params.suppressVisibleSessionEffects,
		...params.suppressVisibleSessionEffects ? { isControlUiVisible: false } : {}
	});
	attemptExecutionRuntime.emitAcpLifecycleStart({
		runId: params.runId,
		startedAt,
		agentId: params.sessionAgentId,
		lifecycleGeneration: params.lifecycleGeneration
	});
	const visibleTextAccumulator = attemptExecutionRuntime.createAcpVisibleTextAccumulator();
	let stopReason;
	let resultStatus;
	let terminalOutcome;
	try {
		const { resolveAcpAgentPolicyError, resolveAcpDispatchPolicyError, resolveAcpExplicitTurnPolicyError } = await loadAcpPolicyRuntime();
		const turnPolicyError = params.opts.acpTurnSource === "manual_spawn" ? resolveAcpExplicitTurnPolicyError(params.cfg) : resolveAcpDispatchPolicyError(params.cfg);
		if (turnPolicyError) {
			terminalOutcome = "blocked";
			throw turnPolicyError;
		}
		const acpAgent = normalizeAgentId(params.acpResolution.meta.agent || resolveAgentIdFromSessionKey(params.sessionKey));
		const agentPolicyError = resolveAcpAgentPolicyError(params.cfg, acpAgent);
		if (agentPolicyError) {
			terminalOutcome = "blocked";
			throw agentPolicyError;
		}
		const acpImageAttachments = resolveInlineAgentImageAttachments(params.opts.images);
		assertAgentRunLifecycleGenerationCurrent(params.lifecycleGeneration);
		const admittedRunContext = await params.preparedRunAdmission.admit("acp");
		const isElicitationActive = () => {
			if (params.opts.abortSignal?.aborted === true || getAdmittedRunDelegatedAuthority(admittedRunContext) === void 0) return false;
			try {
				assertAgentRunLifecycleGenerationCurrent(params.lifecycleGeneration);
				return true;
			} catch {
				return false;
			}
		};
		const onElicitation = createLazyAcpElicitationHandler({
			sourceSessionKey: params.opts.inputProvenance?.sourceSessionKey ?? params.sessionKey,
			targetSessionKey: params.sessionKey,
			outerRequestId: params.runId,
			agentId: params.sessionAgentId,
			runId: params.runId,
			delivery: { deliver: async (_kind, payload) => {
				if (!isElicitationActive()) throw new Error("ACP input request is no longer active.");
				if (payload.text) attemptExecutionRuntime.emitAcpRuntimeEvent({
					runId: params.runId,
					toolTracker: acpToolTracker,
					sessionKey: params.sessionKey,
					agentId: params.sessionAgentId,
					abortSignal: params.opts.abortSignal,
					event: {
						type: "status",
						text: payload.text,
						tag: "elicitation"
					}
				});
				return true;
			} },
			isActive: isElicitationActive
		});
		await params.acpManager.runTurn({
			admittedRunContext,
			cfg: params.cfg,
			sessionKey: params.sessionKey,
			agentId: params.sessionAgentId,
			provenance: params.provenance,
			text: params.body,
			attachments: acpImageAttachments.length > 0 ? acpImageAttachments : void 0,
			mode: "prompt",
			requestId: params.runId,
			signal: params.opts.abortSignal,
			onElicitation,
			onBeforePrompt: async () => {
				const recorder = params.opts.userTurnTranscriptRecorder;
				if (recorder && !recorder.hasPersisted() && !await recorder.persistApproved()) throw new Error("ACP input could not enter the session transcript");
				params.opts.onExecutionStarted?.();
			},
			onLifecycle: (event) => {
				if (event.type === "prompt_submitted") attemptExecutionRuntime.emitAcpPromptSubmitted({
					runId: params.runId,
					sessionKey: params.sessionKey,
					at: event.at
				});
			},
			onEvent: (event) => {
				if (event.type !== "text_delta") attemptExecutionRuntime.emitAcpRuntimeEvent({
					runId: params.runId,
					toolTracker: acpToolTracker,
					sessionKey: params.sessionKey,
					agentId: params.sessionAgentId,
					abortSignal: params.opts.abortSignal,
					event
				});
				if (event.type === "done") {
					stopReason = event.stopReason;
					resultStatus = event.status;
					return;
				}
				if (event.type !== "text_delta" || event.stream && event.stream !== "output" || !event.text) return;
				const visibleUpdate = visibleTextAccumulator.consume(event.text);
				if (visibleUpdate) attemptExecutionRuntime.emitAcpAssistantDelta({
					runId: params.runId,
					text: visibleUpdate.text,
					delta: visibleUpdate.delta
				});
			}
		});
		if (isAgentRunRestartAbortReason(params.opts.abortSignal?.reason)) throw params.opts.abortSignal?.reason;
	} catch (error) {
		const { toAcpRuntimeError } = await loadAcpRuntimeErrorsRuntime();
		const acpError = toAcpRuntimeError({
			error,
			fallbackCode: "ACP_TURN_FAILED",
			fallbackMessage: "ACP turn failed before completion."
		});
		attemptExecutionRuntime.emitAcpLifecycleError({
			runId: params.runId,
			toolTracker: acpToolTracker,
			error: acpError,
			sessionKey: params.sessionKey,
			agentId: params.sessionAgentId,
			lifecycleGeneration: params.lifecycleGeneration,
			abortSignal: params.opts.abortSignal,
			...terminalOutcome ? { terminalOutcome } : {}
		});
		throw acpError;
	}
	const finalTextRaw = visibleTextAccumulator.finalizeRaw();
	const finalText = visibleTextAccumulator.finalize();
	const terminalReply = visibleTextAccumulator.finalizeReplySnapshot();
	let sessionEntry = params.sessionEntry;
	try {
		const { resolveAcpSessionCwd } = await loadAcpSessionIdentifiersRuntime();
		const internalSource = params.suppressVisibleSessionEffects ? resolveInternalSessionEffectsSource({
			agentId: params.sessionAgentId,
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			storePath: params.storePath
		}) : void 0;
		const internalTarget = params.suppressVisibleSessionEffects ? await prepareInternalSessionEffectsSession({
			agentId: params.sessionAgentId,
			cwd: resolveAcpSessionCwd(params.acpResolution.meta) ?? params.workspaceDir,
			runId: params.runId,
			source: internalSource,
			storePath: params.storePath
		}) : void 0;
		params.trackInternalModelRunTarget(internalTarget);
		const transcriptResult = await attemptExecutionRuntime.persistAcpTurnTranscript({
			body: params.body,
			transcriptBody: params.transcriptBody,
			userTurnTranscriptRecorder: params.opts.userTurnTranscriptRecorder,
			...!params.opts.userTurnTranscriptRecorder && params.opts.suppressPromptPersistence !== true && params.opts.transcriptMedia?.length ? { userInput: {
				text: params.transcriptBody,
				media: params.opts.transcriptMedia
			} } : {},
			finalText: finalTextRaw,
			sessionId: internalTarget?.sessionId ?? params.sessionId,
			sessionKey: internalTarget?.sessionKey ?? params.sessionKey,
			sessionEntry: internalTarget?.sessionEntry ?? sessionEntry,
			sessionStore: params.suppressVisibleSessionEffects ? void 0 : params.sessionStore,
			storePath: internalTarget?.storePath ?? params.storePath,
			sessionAgentId: internalTarget?.agentId ?? params.sessionAgentId,
			threadId: params.opts.threadId,
			sessionCwd: resolveAcpSessionCwd(params.acpResolution.meta) ?? params.workspaceDir,
			config: params.cfg
		});
		if (!internalTarget) sessionEntry = transcriptResult.sessionEntry;
	} catch (error) {
		log$4.warn(`ACP transcript persistence failed for ${params.sessionKey}: ${formatErrorMessage(error)}`);
	}
	const restartAbortReason = params.opts.abortSignal?.reason;
	if (isAgentRunRestartAbortReason(restartAbortReason)) {
		attemptExecutionRuntime.emitAcpLifecycleError({
			runId: params.runId,
			toolTracker: acpToolTracker,
			error: restartAbortReason,
			sessionKey: params.sessionKey,
			agentId: params.sessionAgentId,
			lifecycleGeneration: params.lifecycleGeneration,
			abortSignal: params.opts.abortSignal
		});
		throw restartAbortReason;
	}
	attemptExecutionRuntime.emitAcpLifecycleEnd({
		runId: params.runId,
		toolTracker: acpToolTracker,
		agentId: params.sessionAgentId,
		lifecycleGeneration: params.lifecycleGeneration,
		abortSignal: params.opts.abortSignal,
		stopReason,
		resultStatus,
		terminalReply
	});
	const result = applyAgentRunAbortMetadata(attemptExecutionRuntime.buildAcpResult({
		payloadText: finalText,
		terminalReply,
		startedAt,
		stopReason,
		resultStatus,
		abortSignal: params.opts.abortSignal
	}), params.opts.abortSignal);
	const { deliverAgentCommandResult } = await loadDeliveryRuntime();
	const deliveryResult = await deliverAgentCommandResult({
		cfg: params.cfg,
		deps: params.deps,
		runtime: params.runtime,
		opts: params.opts,
		outboundSession: params.outboundSession,
		sessionEntry,
		result,
		payloads: result.payloads,
		assertDeliveryCurrent: () => assertAgentRunLifecycleGenerationCurrent(params.lifecycleGeneration)
	});
	const outcome = buildAgentRunTerminalOutcomeFromLifecycleEvent({
		phase: "end",
		data: {
			status: resultStatus,
			stopReason
		},
		abortSignal: params.opts.abortSignal
	});
	return recordAgentRunTerminalOutcome(deliveryResult, classifyAgentRunTerminalOutcome(outcome) === "success" ? "completed" : "failed");
}
//#endregion
//#region src/agents/command/assistant-transcript-repair.ts
const log$3 = createSubsystemLogger("agents/assistant-transcript-repair");
const EMPTY_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0
	}
};
/** Records a final whose canonical transcript append failed. */
async function persistAssistantTranscriptRepairRecord(params) {
	const { context, replyText, provider, model, runOwnedSessionId } = params;
	if (!replyText.trim() || !context.sessionStore || !context.sessionKey.trim()) return;
	const now = Date.now();
	const existing = context.sessionStore[context.sessionKey] ?? context.sessionEntry;
	if (!existing) return;
	const nextRepair = {
		id: randomUUID(),
		text: replyText,
		...provider?.trim() ? { provider: provider.trim() } : {},
		...model?.trim() ? { model: model.trim() } : {},
		createdAt: now
	};
	try {
		await persistAgentSession({
			sessionStore: context.sessionStore,
			sessionKey: context.sessionKey,
			storePath: context.storePath,
			initialEntry: existing,
			entry: {
				...existing,
				pendingTranscriptRepair: [...existing.pendingTranscriptRepair ?? [], nextRepair],
				updatedAt: now
			},
			shouldPersist: (current) => current?.sessionId === runOwnedSessionId && current.abortedLastRun !== true
		});
	} catch (error) {
		log$3.warn(`Failed to persist assistant transcript repair record for ${context.sessionKey}: ${formatErrorMessage(error)}`);
	}
}
/**
* Restores missing assistant finals before another turn can observe or extend
* the transcript. Append failures are an admission barrier: continuing would
* give the model incomplete history and make the eventual append out of order.
*/
async function repairPendingAssistantTranscriptTurns(params) {
	const { context } = params;
	if (!context.sessionStore || !context.sessionKey) return;
	const entry = context.sessionStore[context.sessionKey] ?? context.sessionEntry;
	const backlog = entry?.pendingTranscriptRepair;
	if (!entry || !backlog?.length) return;
	const { appendExactAssistantMessageToSessionTranscript } = await loadTranscriptAppendRuntime();
	const remaining = [...backlog];
	while (remaining.length > 0) {
		const item = remaining[0];
		let result;
		try {
			result = await appendExactAssistantMessageToSessionTranscript({
				agentId: context.sessionAgentId,
				sessionKey: context.sessionKey,
				expectedSessionId: entry.sessionId,
				storePath: context.storePath,
				config: context.config,
				updateMode: "file-only",
				idempotencyKey: `transcript-repair:${item.id}`,
				beforeMessageWrite: runAgentHarnessBeforeMessageWriteHook,
				message: {
					role: "assistant",
					content: [{
						type: "text",
						text: item.text
					}],
					api: "cli",
					provider: item.provider ?? "cli",
					model: item.model ?? "default",
					usage: EMPTY_USAGE,
					stopReason: "stop",
					timestamp: item.createdAt
				}
			});
		} catch (error) {
			log$3.warn(`Assistant transcript repair failed for ${context.sessionKey}: ${formatErrorMessage(error)}`);
			throw new Error("Previous assistant reply is still pending transcript recovery; retry.", { cause: error });
		}
		if (!result.ok && result.code !== "blocked") {
			log$3.warn(`Assistant transcript repair failed for ${context.sessionKey}: ${result.reason}`);
			throw new Error("Previous assistant reply is still pending transcript recovery; retry.");
		}
		remaining.shift();
		if (result.ok) log$3.info(`Re-appended missing assistant transcript turn for ${context.sessionKey}`);
		else log$3.warn(`Dropped blocked assistant transcript repair for ${context.sessionKey}`);
	}
	const current = context.sessionStore[context.sessionKey];
	if (!current || current.sessionId !== entry.sessionId) return;
	try {
		await persistAgentSession({
			sessionStore: context.sessionStore,
			sessionKey: context.sessionKey,
			storePath: context.storePath,
			initialEntry: current,
			entry: {
				...current,
				pendingTranscriptRepair: void 0,
				updatedAt: Date.now()
			},
			shouldPersist: (latest) => latest?.sessionId === entry.sessionId
		});
	} catch (error) {
		log$3.warn(`Failed to clear assistant transcript repair record for ${context.sessionKey}: ${formatErrorMessage(error)}`);
	}
}
//#endregion
//#region src/agents/command/ingress-diagnostics.ts
/** Resolve the channel label for model.usage diagnostics from ingress run options. */
function ingressDiagnosticChannel(opts) {
	return opts.runContext?.messageChannel ?? opts.messageChannel ?? opts.channel ?? "http";
}
/** Emit the ingress-only model usage diagnostic after a completed agent run. */
function emitIngressModelUsageDiagnostic(result, opts, agentDir) {
	const cfg = getRuntimeConfig();
	if (!isDiagnosticsEnabled(cfg)) return;
	const agentMeta = result.meta?.agentMeta;
	const usage = agentMeta?.diagnosticUsage ?? agentMeta?.usage;
	if (!agentMeta || !hasBillableUsage(usage)) return;
	const providerUsed = agentMeta.provider ?? "";
	const modelUsed = agentMeta.model ?? "";
	const input = usage.input ?? 0;
	const output = usage.output ?? 0;
	const cacheRead = usage.cacheRead ?? 0;
	const cacheWrite = usage.cacheWrite ?? 0;
	const usagePromptTokens = input + cacheRead + cacheWrite;
	const totalTokens = usage.total ?? usagePromptTokens + output;
	const costConfig = resolveModelCostConfig({
		provider: providerUsed,
		model: modelUsed,
		config: cfg,
		agentDir
	});
	const costUsd = estimateAggregateUsageCost({
		usage,
		cost: costConfig
	});
	emitTrustedDiagnosticEvent({
		type: "model.usage",
		sessionKey: opts.sessionKey,
		sessionId: agentMeta.sessionId,
		channel: ingressDiagnosticChannel(opts),
		agentId: opts.agentId,
		provider: providerUsed,
		model: modelUsed,
		usage: {
			input,
			output,
			cacheRead,
			cacheWrite,
			promptTokens: usagePromptTokens,
			total: totalTokens
		},
		lastCallUsage: agentMeta.lastCallUsage,
		context: {
			limit: agentMeta.contextTokens,
			...agentMeta.promptTokens !== void 0 ? { used: agentMeta.promptTokens } : {}
		},
		costUsd,
		durationMs: result.meta?.durationMs
	});
}
//#endregion
//#region src/agents/command/model-ref.ts
function normalizeAgentCommandModelRef(cfg, provider, model, modelManifestContext) {
	return normalizeModelRef(provider, model, {
		...modelManifestContext,
		allowPluginNormalization: allowsPluginModelNormalization({
			cfg,
			provider,
			model
		})
	});
}
function normalizeAgentCommandDefaultModelRef(cfg, provider, model, modelManifestContext) {
	const normalizedProvider = normalizeProviderId(provider);
	if (findConfiguredModelProvider(cfg, normalizedProvider)) return {
		provider: normalizedProvider,
		model: normalizeConfiguredProviderCatalogModelId(normalizedProvider, model, { manifestPlugins: modelManifestContext.manifestPlugins })
	};
	return normalizeAgentCommandModelRef(cfg, provider, model, modelManifestContext);
}
function parseAgentCommandModelRef(cfg, agentId, raw, defaultProvider, modelManifestContext) {
	const parsed = resolveModelRefFromString({
		cfg,
		agentId,
		raw,
		defaultProvider,
		aliasIndex: buildModelAliasIndex({
			cfg,
			agentId,
			defaultProvider,
			...modelManifestContext,
			allowPluginNormalization: false
		}),
		...modelManifestContext,
		allowPluginNormalization: false
	})?.ref;
	return parsed ? normalizeAgentCommandModelRef(cfg, parsed.provider, parsed.model, modelManifestContext) : null;
}
//#endregion
//#region src/agents/command/model-selection.ts
async function resolveEmbeddedModelSelection(params) {
	const configuredDefaultRef = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.sessionAgentId,
		allowPluginNormalization: params.pluginsEnabled,
		...params.modelManifestContext
	});
	const configuredDefaultAuthProfileId = splitTrailingAuthProfile(resolveAgentEffectiveModelPrimary(params.cfg, params.sessionAgentId) ?? "").profile;
	const { provider: defaultProvider, model: defaultModel } = normalizeAgentCommandDefaultModelRef(params.cfg, configuredDefaultRef.provider, configuredDefaultRef.model, params.modelManifestContext);
	let provider = defaultProvider;
	let model = defaultModel;
	let requestedRouteResolution = "resolved";
	let sessionEntry = params.sessionEntry;
	const hasStoredOverride = Boolean(sessionEntry?.modelOverride || sessionEntry?.providerOverride);
	let storedModelOverrideSource = hasStoredOverride ? sessionEntry?.modelOverrideSource : void 0;
	let hasStoredAutoFallbackProvenance = hasStoredOverride && hasSessionAutoModelFallbackProvenance(sessionEntry);
	let hasLegacyAutoFallbackOverrideWithoutOrigin = hasStoredOverride && hasLegacyAutoFallbackWithoutOrigin(sessionEntry);
	const explicitProviderOverride = typeof params.opts.provider === "string" ? normalizeExplicitOverrideInput(params.opts.provider, "provider") : void 0;
	const explicitModelOverride = typeof params.opts.model === "string" ? normalizeExplicitOverrideInput(params.opts.model, "model") : void 0;
	const hasExplicitRunOverride = Boolean(explicitProviderOverride || explicitModelOverride);
	if (hasExplicitRunOverride && isModelSelectionLocked(sessionEntry)) throw new ModelSelectionLockedError();
	if (hasExplicitRunOverride && params.opts.allowModelOverride !== true) throw new Error("Model override is not authorized for this caller.");
	let allowedModelCatalog = [];
	let modelCatalog = null;
	let visibilityPolicy = createModelVisibilityPolicy({
		cfg: params.cfg,
		catalog: [],
		defaultProvider,
		defaultModel,
		agentId: params.sessionAgentId,
		allowManifestNormalization: true,
		allowPluginNormalization: params.pluginsEnabled,
		...params.modelManifestContext
	});
	const hasAllowlist = !visibilityPolicy.allowAny;
	const agentModels = resolveAgentConfig(params.cfg, params.sessionAgentId)?.models;
	const hasConfiguredModels = Object.keys(params.cfg.agents?.defaults?.models ?? {}).length > 0 || Object.keys(agentModels ?? {}).length > 0;
	if (hasAllowlist || hasConfiguredModels) {
		modelCatalog = params.pluginsEnabled ? loadManifestModelCatalog({
			config: params.cfg,
			workspaceDir: params.workspaceDir,
			metadataSnapshot: params.manifestMetadataSnapshot
		}) : [];
		visibilityPolicy = createModelVisibilityPolicy({
			cfg: params.cfg,
			catalog: modelCatalog,
			defaultProvider,
			defaultModel,
			agentId: params.sessionAgentId,
			allowManifestNormalization: true,
			allowPluginNormalization: params.pluginsEnabled,
			...params.modelManifestContext
		});
		allowedModelCatalog = visibilityPolicy.allowedCatalog;
	}
	if (!isModelSelectionLocked(sessionEntry) && sessionEntry && params.sessionStore && params.sessionKey && hasStoredOverride && !isValidAgentHarnessSessionStoreEntry(params.sessionKey, sessionEntry) && !params.suppressVisibleSessionEffects) {
		const initialEntry = sessionEntry;
		const entry = { ...sessionEntry };
		let entryUpdated = false;
		if (hasLegacyAutoFallbackOverrideWithoutOrigin) {
			const { updated } = applyModelOverrideToSessionEntry({
				entry,
				selection: {
					provider: defaultProvider,
					model: defaultModel,
					isDefault: true
				}
			});
			if (updated) {
				storedModelOverrideSource = void 0;
				entryUpdated = true;
			}
		}
		const repaired = repairProviderWrappedModelOverride({
			entry,
			defaultProvider,
			defaultModel
		});
		entryUpdated ||= repaired.updated;
		const overrideProvider = entry.providerOverride?.trim() || defaultProvider;
		const overrideModel = entry.modelOverride?.trim();
		if (overrideModel) {
			const normalizedOverride = normalizeAgentCommandModelRef(params.cfg, overrideProvider, overrideModel, params.modelManifestContext);
			if (!visibilityPolicy.allowsKey(modelKey(normalizedOverride.provider, normalizedOverride.model))) {
				const { updated } = applyModelOverrideToSessionEntry({
					entry,
					selection: {
						provider: defaultProvider,
						model: defaultModel,
						isDefault: true
					}
				});
				entryUpdated ||= updated;
			}
		}
		if (entryUpdated) {
			sessionEntry = await persistAgentSession({
				sessionStore: params.sessionStore,
				sessionKey: params.sessionKey,
				storePath: params.storePath,
				initialEntry,
				entry
			});
			const adoptedHasStoredOverride = Boolean(sessionEntry?.modelOverride || sessionEntry?.providerOverride);
			storedModelOverrideSource = adoptedHasStoredOverride ? sessionEntry?.modelOverrideSource : void 0;
			hasStoredAutoFallbackProvenance = adoptedHasStoredOverride && hasSessionAutoModelFallbackProvenance(sessionEntry);
			hasLegacyAutoFallbackOverrideWithoutOrigin = adoptedHasStoredOverride && hasLegacyAutoFallbackWithoutOrigin(sessionEntry);
		}
	}
	if (isModelSelectionLocked(sessionEntry)) hasLegacyAutoFallbackOverrideWithoutOrigin = false;
	const effectiveStoredOverride = hasLegacyAutoFallbackOverrideWithoutOrigin ? null : resolveStoredModelOverride({
		sessionEntry,
		sessionStore: params.sessionStore,
		sessionKey: params.sessionKey,
		parentSessionKey: sessionEntry?.parentSessionKey,
		defaultProvider
	});
	if (effectiveStoredOverride?.source === "parent") {
		storedModelOverrideSource = void 0;
		hasStoredAutoFallbackProvenance = false;
	}
	const storedProviderOverride = hasLegacyAutoFallbackOverrideWithoutOrigin ? void 0 : effectiveStoredOverride?.provider ?? sessionEntry?.providerOverride?.trim();
	const storedModelOverride = hasLegacyAutoFallbackOverrideWithoutOrigin ? void 0 : effectiveStoredOverride?.model ?? sessionEntry?.modelOverride?.trim();
	const storedModelOverrideRouteResolution = effectiveStoredOverride?.routeResolution;
	const currentRunModelChannel = [
		params.runContext.messageChannel,
		params.opts.replyChannel,
		params.opts.channel
	].find((channel) => Boolean(channel && isDeliverableMessageChannel(channel)));
	const channelOverrideGroupId = currentRunModelChannel ? params.runContext.groupId ?? sessionEntry?.groupId ?? params.runContext.currentChannelId : sessionEntry?.groupId ?? params.runContext.groupId ?? params.runContext.currentChannelId;
	const channelModelOverride = params.cfg.channels?.modelByChannel && !hasExplicitRunOverride ? resolveChannelModelOverride({
		cfg: params.cfg,
		channel: currentRunModelChannel ?? sessionDeliveryChannel(sessionEntry),
		groupId: channelOverrideGroupId,
		groupChatType: sessionEntry?.chatType ?? sessionDeliveryOrigin(sessionEntry)?.chatType,
		groupChannel: params.runContext.groupChannel ?? sessionEntry?.groupChannel,
		groupSubject: sessionEntry?.subject,
		parentSessionKey: sessionEntry?.parentSessionKey ?? params.sessionKey,
		directUserIds: [
			sessionDeliveryOrigin(sessionEntry)?.nativeDirectUserId,
			sessionDeliveryOrigin(sessionEntry)?.from,
			sessionDeliveryOrigin(sessionEntry)?.to
		]
	}) : null;
	const normalizedChannelOverride = channelModelOverride ? parseAgentCommandModelRef(params.cfg, params.sessionAgentId, channelModelOverride.model, defaultProvider, params.modelManifestContext) : null;
	const primaryProvider = normalizedChannelOverride?.provider ?? defaultProvider;
	const primaryModel = normalizedChannelOverride?.model ?? defaultModel;
	if (normalizedChannelOverride && !Boolean(storedProviderOverride || storedModelOverride)) {
		provider = normalizedChannelOverride.provider;
		model = normalizedChannelOverride.model;
		requestedRouteResolution = "resolved";
	}
	if (storedModelOverride) {
		const candidateProvider = storedProviderOverride || defaultProvider;
		const storedRouteKey = modelKey(candidateProvider, storedModelOverride);
		const storedRouteCataloged = (modelCatalog ?? allowedModelCatalog).some((entry) => modelKey(entry.provider, entry.id) === storedRouteKey);
		const storedAlias = storedModelOverrideRouteResolution === "raw" && !storedRouteCataloged ? resolveModelAliasFromPair({
			cfg: params.cfg,
			agentId: params.sessionAgentId,
			provider: candidateProvider,
			model: storedModelOverride,
			defaultProvider,
			aliasIndex: visibilityPolicy.selectionAliasIndex,
			allowPluginNormalization: params.pluginsEnabled,
			...params.modelManifestContext
		}) : null;
		const normalizedStored = normalizeAgentCommandModelRef(params.cfg, storedAlias?.provider ?? candidateProvider, storedAlias?.model ?? storedModelOverride, params.modelManifestContext);
		if (isModelSelectionLocked(sessionEntry) || visibilityPolicy.allowsKey(modelKey(normalizedStored.provider, normalizedStored.model))) {
			provider = normalizedStored.provider;
			model = normalizedStored.model;
			requestedRouteResolution = storedAlias || storedRouteCataloged ? "resolved" : storedModelOverrideRouteResolution ?? "raw";
		}
	}
	const autoFallbackPrimaryProbe = !hasExplicitRunOverride && !isModelSelectionLocked(sessionEntry) ? resolveAutoFallbackPrimaryProbe({
		entry: sessionEntry,
		sessionKey: params.sessionKey,
		primaryProvider,
		primaryModel
	}) : void 0;
	let autoFallbackPrimaryProbeSessionEntry;
	if (autoFallbackPrimaryProbe && sessionEntry) {
		provider = autoFallbackPrimaryProbe.provider;
		model = autoFallbackPrimaryProbe.model;
		requestedRouteResolution = "resolved";
		autoFallbackPrimaryProbeSessionEntry = { ...sessionEntry };
		clearAutoFallbackPrimaryProbeSelection(autoFallbackPrimaryProbeSessionEntry);
	}
	if (hasExplicitRunOverride) {
		const explicitRef = explicitModelOverride ? explicitProviderOverride ? normalizeAgentCommandModelRef(params.cfg, explicitProviderOverride, explicitModelOverride, params.modelManifestContext) : parseAgentCommandModelRef(params.cfg, params.sessionAgentId, explicitModelOverride, provider, params.modelManifestContext) : explicitProviderOverride ? normalizeAgentCommandModelRef(params.cfg, explicitProviderOverride, model, params.modelManifestContext) : null;
		if (!explicitRef) throw new Error("Invalid model override.");
		if (!visibilityPolicy.allowsKey(modelKey(explicitRef.provider, explicitRef.model))) {
			const rejectedKey = `${sanitizeForLog(explicitRef.provider)}/${sanitizeForLog(explicitRef.model)}`;
			const policyPath = visibilityPolicy.allowConfigPath ?? "modelPolicy.allow";
			const repairPath = visibilityPolicy.allowRepairConfigPath;
			throw new Error(`Model override "${rejectedKey}" is not allowed for agent "${params.sessionAgentId}" by ${policyPath}. Add "${rejectedKey}" or "${sanitizeForLog(explicitRef.provider)}/*" to ${repairPath}, or remove/empty the list to allow any model.`);
		}
		provider = explicitRef.provider;
		model = explicitRef.model;
		requestedRouteResolution = "resolved";
	}
	const unresolvedSelectionKey = modelKey(provider, model);
	const allowedInitialSelection = isModelSelectionLocked(sessionEntry) ? {
		provider,
		model
	} : visibilityPolicy.resolveSelection({
		provider,
		model
	});
	if (!allowedInitialSelection) {
		const policyPath = visibilityPolicy.allowConfigPath ?? "modelPolicy.allow";
		throw new Error(`Configured default model "${modelKey(provider, model)}" is not allowed by ${policyPath}, and no allowed model is available.`);
	}
	provider = allowedInitialSelection.provider;
	model = allowedInitialSelection.model;
	if (modelKey(provider, model) !== unresolvedSelectionKey) requestedRouteResolution = "resolved";
	const providerForAuthProfileValidation = provider;
	let sessionEntryForAttempt = autoFallbackPrimaryProbeSessionEntry ?? sessionEntry;
	const initialAgentHarnessRuntimeOverride = resolveSessionRuntimeOverrideForProvider({
		provider,
		entry: sessionEntryForAttempt,
		cfg: params.cfg
	});
	await ensureSelectedAgentHarnessPlugin({
		config: params.cfg,
		provider,
		modelId: model,
		agentId: params.sessionAgentId,
		sessionKey: params.sessionKey,
		agentHarnessRuntimeOverride: initialAgentHarnessRuntimeOverride,
		workspaceDir: params.workspaceDir,
		pluginRegistry: requireActivePluginRegistry()
	});
	const authProfileId = sessionEntryForAttempt?.authProfileOverride;
	if (sessionEntryForAttempt && authProfileId) {
		const entry = sessionEntryForAttempt;
		const profile = ensureAuthProfileStore().profiles[authProfileId];
		const validationHarnessPolicy = resolveAvailableAgentHarnessPolicy({
			provider: providerForAuthProfileValidation,
			modelId: model,
			config: params.cfg,
			agentId: params.sessionAgentId,
			sessionKey: params.sessionKey
		});
		const acceptedAuthProviders = listOpenAIAuthProfileProvidersForAgentRuntime({
			provider: providerForAuthProfileValidation,
			harnessRuntime: validationHarnessPolicy.runtime,
			config: params.cfg
		}).map((candidateProvider) => params.pluginsEnabled ? resolveProviderIdForAuth(candidateProvider, {
			config: params.cfg,
			workspaceDir: params.workspaceDir,
			...params.manifestMetadataSnapshot ? { metadataSnapshot: params.manifestMetadataSnapshot } : {}
		}) : candidateProvider);
		const authAliasLookupParams = params.pluginsEnabled ? {
			config: params.cfg,
			workspaceDir: params.workspaceDir,
			...params.manifestMetadataSnapshot ? { metadataSnapshot: params.manifestMetadataSnapshot } : {}
		} : {
			config: params.cfg,
			workspaceDir: params.workspaceDir,
			metadataSnapshot: { plugins: [] }
		};
		if (!(profile && acceptedAuthProviders.some((candidateProvider) => isStoredCredentialCompatibleWithAuthProvider({
			cfg: params.cfg,
			authAliasLookupParams,
			provider: candidateProvider,
			credential: profile
		})))) {
			if (hasExplicitRunOverride || autoFallbackPrimaryProbe) sessionEntryForAttempt = {
				...entry,
				authProfileOverride: void 0,
				authProfileOverrideSource: void 0,
				authProfileOverrideCompactionCount: void 0
			};
			else if (params.sessionStore && params.sessionKey && !params.suppressVisibleSessionEffects) await clearSessionAuthProfileOverride({
				sessionEntry: entry,
				sessionStore: params.sessionStore,
				sessionKey: params.sessionKey,
				storePath: params.storePath
			});
		}
	}
	const configuredThinkLevel = normalizeThinkLevel(resolveAgentConfig(params.cfg, params.sessionAgentId)?.thinkingDefault);
	const immutableThinkLevel = params.requestedThinkLevel ?? configuredThinkLevel;
	const primaryConfiguredThinkLevel = immutableThinkLevel ?? resolveConfiguredThinkingDefault({
		cfg: params.cfg,
		provider,
		model
	});
	let catalogForThinking = allowedModelCatalog.length > 0 ? allowedModelCatalog : modelCatalog && modelCatalog.length > 0 ? modelCatalog : params.configuredThinkingCatalog;
	if (params.pluginsEnabled && primaryConfiguredThinkLevel !== "off" && !hasResolvedThinkingCatalogEntry({
		catalog: catalogForThinking,
		provider,
		model
	})) {
		const { loadProviderScopedThinkingCatalog } = await import("./agents/model-catalog.runtime.js");
		const runtimeCatalog = normalizeThinkingCatalogProviders(await loadProviderScopedThinkingCatalog({
			config: params.cfg,
			provider,
			model,
			...params.sessionAgentId ? { agentId: params.sessionAgentId } : {},
			...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}
		}));
		const allowedRuntimeCatalog = createModelVisibilityPolicy({
			cfg: params.cfg,
			catalog: runtimeCatalog,
			defaultProvider,
			defaultModel,
			agentId: params.sessionAgentId,
			allowManifestNormalization: true,
			allowPluginNormalization: params.pluginsEnabled,
			...params.modelManifestContext
		}).allowedCatalog;
		if (hasResolvedThinkingCatalogEntry({
			catalog: allowedRuntimeCatalog,
			provider,
			model
		})) catalogForThinking = allowedRuntimeCatalog;
	}
	const thinkingCatalog = catalogForThinking.length > 0 ? catalogForThinking : void 0;
	const thinkingRuntime = resolveEffectiveAgentRuntime({
		cfg: params.cfg,
		provider,
		modelId: model,
		agentId: params.sessionAgentId,
		sessionKey: params.sessionKey,
		sessionEntry: sessionEntryForAttempt
	});
	const primaryThinkLevel = primaryConfiguredThinkLevel ?? resolveThinkingDefault({
		cfg: params.cfg,
		provider,
		model,
		catalog: thinkingCatalog,
		agentRuntime: thinkingRuntime
	});
	if (!isThinkingLevelSupported({
		provider,
		model,
		level: primaryThinkLevel,
		catalog: thinkingCatalog,
		agentRuntime: thinkingRuntime
	})) {
		const explicitThink = Boolean(params.thinkOnce || params.thinkOverride);
		const isSubagentSpawnRun = params.isSubagentLane && isSubagentSessionKey(params.sessionKey);
		if (explicitThink && !isSubagentSpawnRun) throw new Error(`Thinking level "${primaryThinkLevel}" is not supported for ${provider}/${model}. Use one of: ${formatThinkingLevels(provider, model, ", ", thinkingCatalog, thinkingRuntime)}.`);
	}
	if (params.thinkOverride && params.sessionStore && params.sessionKey && !params.suppressVisibleSessionEffects) {
		const now = Date.now();
		const entry = params.sessionStore[params.sessionKey] ?? sessionEntry ?? {
			sessionId: params.sessionId,
			updatedAt: now,
			sessionStartedAt: now
		};
		const next = {
			...entry,
			sessionId: params.sessionId,
			updatedAt: now,
			sessionStartedAt: entry.sessionStartedAt ?? now,
			lastInteractionAt: now,
			thinkingLevel: params.thinkOverride
		};
		sessionEntry = await persistAgentSession({
			sessionStore: params.sessionStore,
			sessionKey: params.sessionKey,
			storePath: params.storePath,
			initialEntry: entry,
			entry: next
		}) ?? sessionEntry;
		sessionEntryForAttempt = {
			...sessionEntryForAttempt ?? next,
			thinkingLevel: params.thinkOverride
		};
	}
	const { resolveSessionTranscriptFile } = await loadTranscriptResolveRuntime();
	let sessionFile;
	if (params.sessionStore && params.sessionKey) {
		const resolvedSessionFile = await resolveSessionTranscriptFile({
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			sessionStore: params.suppressVisibleSessionEffects ? void 0 : params.sessionStore,
			storePath: params.suppressVisibleSessionEffects ? void 0 : params.storePath,
			sessionEntry,
			agentId: params.sessionAgentId,
			threadId: params.opts.threadId
		});
		sessionFile = resolvedSessionFile.sessionFile;
		sessionEntry = resolvedSessionFile.sessionEntry;
	}
	if (!sessionFile) {
		const resolvedSessionFile = await resolveSessionTranscriptFile({
			sessionId: params.sessionId,
			sessionKey: params.sessionKey ?? params.sessionId,
			storePath: params.storePath,
			sessionEntry,
			agentId: params.sessionAgentId,
			threadId: params.opts.threadId
		});
		sessionFile = resolvedSessionFile.sessionFile;
		sessionEntry = resolvedSessionFile.sessionEntry;
	}
	return {
		sessionEntry,
		provider,
		model,
		requestedRouteResolution,
		defaultProvider,
		defaultModel,
		configuredDefaultAuthProfileId,
		providerForAuthProfileValidation,
		visibilityPolicy,
		hasExplicitRunOverride,
		storedProviderOverride,
		storedModelOverride,
		storedModelOverrideSource,
		hasStoredAutoFallbackProvenance,
		autoFallbackPrimaryProbe,
		sessionEntryForAttempt,
		thinkingCatalog,
		immutableThinkLevel,
		effectiveTurnThinkLevel: primaryThinkLevel,
		sessionFile
	};
}
//#endregion
//#region src/agents/pending-final-delivery-marker.ts
/** Persists restart-recoverable final delivery markers for agent runs. */
async function persistPendingFinalDeliveryMarker(params) {
	const sendablePayloads = params.payloads.filter((payload) => normalizePendingFinalDeliveryPayloads([payload]).length > 0);
	const hasSendableFinalPayload = sendablePayloads.length > 0;
	const recoverableText = buildRecoverablePendingFinalDeliveryText(normalizePendingFinalRecoveryPayloads(params.payloads));
	if (!params.deliver || !params.sessionStore || !params.sessionKey || params.suppressVisibleSessionEffects || params.sessionReboundDuringRun || isSubagentSessionKey(params.sessionKey) || !hasSendableFinalPayload || !params.deliveryContext) return {
		sessionEntry: params.sessionEntry,
		pendingFinalDeliveryMarkerPersisted: false,
		hasSendableFinalPayload
	};
	const entry = params.sessionStore[params.sessionKey] ?? params.sessionEntry;
	if (!entry) return {
		sessionEntry: params.sessionEntry,
		pendingFinalDeliveryMarkerPersisted: false,
		hasSendableFinalPayload
	};
	const now = Date.now();
	const intentId = randomUUID();
	const deliveryId = randomUUID();
	const persisted = await persistAgentSession({
		sessionStore: params.sessionStore,
		sessionKey: params.sessionKey,
		storePath: params.storePath,
		initialEntry: entry,
		entry: {
			...entry,
			pendingFinalDelivery: {
				...recoverableText ? {
					kind: "replayable",
					text: recoverableText
				} : { kind: "transport-only" },
				intentId,
				deliveries: [{
					id: deliveryId,
					state: "prepared"
				}],
				createdAt: now,
				context: params.deliveryContext
			},
			updatedAt: now
		},
		shouldPersist: (current) => current?.sessionId === params.runOwnedSessionId && current.abortedLastRun !== true
	});
	const markerPersisted = persisted?.pendingFinalDelivery?.intentId === intentId;
	if (markerPersisted) for (const payload of sendablePayloads) setReplyPayloadMetadata(payload, { pendingFinalDeliveryCompletion: {
		deliveryId,
		intentId,
		...entry.restartRecoveryDeliveryRunId ? { recoveryRunId: entry.restartRecoveryDeliveryRunId } : {},
		sessionId: params.runOwnedSessionId,
		sessionKey: params.sessionKey,
		storePath: params.storePath
	} });
	return {
		sessionEntry: persisted,
		pendingFinalDeliveryMarkerPersisted: markerPersisted,
		...markerPersisted ? { pendingFinalDeliveryIntentId: intentId } : {},
		hasSendableFinalPayload
	};
}
//#endregion
//#region src/agents/command/post-run.ts
const log$2 = createSubsystemLogger("agents/agent-command");
function createCompactionSessionIdReporter(sessionId, onSessionIdChanged) {
	let notifiedSessionId = sessionId;
	let pendingCompactionSessionId;
	const notifySessionIdChanged = (nextSessionId) => {
		notifiedSessionId = nextSessionId;
		pendingCompactionSessionId = void 0;
		onSessionIdChanged?.(nextSessionId);
	};
	return {
		onSessionIdChanged: notifySessionIdChanged,
		onCompactionCommitted: (nextSessionId) => {
			if (nextSessionId !== void 0) pendingCompactionSessionId = nextSessionId;
		},
		reportCommitted: () => {
			if (pendingCompactionSessionId !== void 0 && pendingCompactionSessionId !== notifiedSessionId) try {
				notifySessionIdChanged(pendingCompactionSessionId);
			} catch (error) {
				log$2.warn(`failed to report settled session identity: ${coerceErrorMessage(error)}`);
			}
		}
	};
}
async function finalizeEmbeddedAgentCommand(params) {
	const { cfg, body, transcriptBody, sessionId, sessionKey, sessionStore, storePath, sessionAgentId, workspaceDir, cwd, agentDir, timeoutMs, outboundSession, runId } = params.prepared;
	const { fallbackProvider, fallbackModel, fallbackExhausted, provider, model, effectiveTurnThinkLevel, internalSessionTarget, attemptExecutionRuntime, messageChannel, suppressUserTurnPersistence, userTurnTranscriptRecorder, fallbackTrajectoryRecorder, deferredLifecycle, lifecycle, terminal, lifecycleGeneration } = params.attempt;
	const { resolvedVerboseLevel, skillsSnapshot, runContext } = params.embeddedSessionState;
	const effectiveCwd = cwd ?? workspaceDir;
	const isHeartbeatLifecycleRun = isHeartbeatLifecycleRunKind(params.opts.bootstrapContextRunKind);
	let sessionEntry = params.sessionEntry;
	let result = params.attempt.result;
	let deliveryResult;
	let hasResultError;
	let { runOwnedSessionId, sessionReboundDuringRun } = params.sessionOwnership;
	const publishSessionOwnership = (committedCompactionSessionId) => {
		params.onSessionOwnershipChanged({
			runOwnedSessionId,
			sessionReboundDuringRun
		}, committedCompactionSessionId);
	};
	try {
		await fallbackTrajectoryRecorder?.flush();
		const finalVisiblePayload = result.payloads?.toReversed().find((payload) => !payload.isError && !payload.isReasoning && payload.text?.trim());
		const assistantTranscriptOwned = finalVisiblePayload !== void 0 && getReplyPayloadMetadata(finalVisiblePayload)?.assistantTranscriptOwned === true;
		if (params.opts.internalDeliveryMediaUrls !== void 0) result = {
			...result,
			payloads: constrainRestartRecoveryDeliveryPayloads(result.payloads, params.opts.internalDeliveryMediaUrls, params.opts.internalDeliverySuppressText === true)
		};
		const resultErrorPayload = result.payloads?.find((payload) => payload.isError === true);
		if (resultErrorPayload) {
			const message = typeof resultErrorPayload.text === "string" && resultErrorPayload.text.trim() ? resultErrorPayload.text : void 0;
			params.opts.onResultErrorPayload?.(message);
		}
		params.onTerminalDeliveryEvidenceChanged(buildRestartRecoveryTerminalDeliveryEvidence(result));
		const compactionFact = params.attempt.compactionAccounting;
		const effectiveSessionId = compactionFact?.target.sessionId ?? internalSessionTarget?.sessionId ?? sessionId;
		if (sessionStore && sessionKey && !params.suppressVisibleSessionEffects) {
			const { updateSessionStoreAfterAgentRun } = await loadSessionStoreRuntime();
			await updateSessionStoreAfterAgentRun({
				cfg,
				agentDir,
				sessionId: effectiveSessionId,
				sessionKey,
				storePath,
				sessionStore,
				defaultProvider: provider,
				defaultModel: model,
				fallbackProvider,
				fallbackModel,
				result,
				compactionAccounting: compactionFact,
				touchInteraction: params.opts.bootstrapContextRunKind !== "cron" && !isHeartbeatLifecycleRun && !params.opts.internalEvents?.length,
				touchActivity: !isHeartbeatLifecycleRun && !params.opts.internalEvents?.length,
				preserveRuntimeModel: fallbackExhausted || fallbackProvider !== provider || fallbackModel !== model || isHeartbeatLifecycleRun || params.preserveUserFacingSessionModelState,
				preserveUserFacingSessionModelState: params.preserveUserFacingSessionModelState,
				clearRestartRecoveryForceSafeTools: params.opts.forceRestartSafeTools === true && params.opts.deliver !== true
			});
			sessionEntry = sessionStore[sessionKey] ?? sessionEntry;
		}
		runOwnedSessionId = effectiveSessionId;
		publishSessionOwnership();
		const transcriptPersistenceRunner = result.meta.executionTrace?.runner;
		let persistedCliTurnTranscript = false;
		if (!sessionReboundDuringRun && transcriptPersistenceRunner === "cli") try {
			const transcriptResult = await attemptExecutionRuntime.persistCliTurnTranscript({
				body,
				transcriptBody,
				result,
				sessionId: effectiveSessionId,
				sessionKey: internalSessionTarget?.sessionKey ?? sessionKey ?? effectiveSessionId,
				sessionEntry: internalSessionTarget?.sessionEntry ?? sessionEntry,
				sessionStore: params.suppressVisibleSessionEffects ? void 0 : sessionStore,
				storePath: internalSessionTarget?.storePath ?? storePath,
				sessionAgentId: internalSessionTarget?.agentId ?? sessionAgentId,
				threadId: params.opts.threadId,
				sessionCwd: effectiveCwd,
				config: cfg,
				skipAssistantTurn: assistantTranscriptOwned,
				skipUserTurn: suppressUserTurnPersistence || params.opts.userTurnTranscriptRecorder !== void 0 || userTurnTranscriptRecorder.hasPersisted() || userTurnTranscriptRecorder.isBlocked()
			});
			sessionReboundDuringRun = transcriptResult.kind === "session-rebound";
			publishSessionOwnership();
			if (!internalSessionTarget) sessionEntry = transcriptResult.sessionEntry;
			persistedCliTurnTranscript = transcriptResult.kind === "persisted";
		} catch (error) {
			log$2.warn(`Turn transcript persistence failed for ${sessionKey ?? sessionId}: ${error instanceof Error ? error.message : String(error)}`);
			if (sessionStore && sessionKey && !params.suppressVisibleSessionEffects && !sessionReboundDuringRun && !assistantTranscriptOwned) await persistAssistantTranscriptRepairRecord({
				context: {
					sessionKey: internalSessionTarget?.sessionKey ?? sessionKey ?? effectiveSessionId,
					sessionEntry: internalSessionTarget?.sessionEntry ?? sessionEntry,
					sessionStore,
					storePath: internalSessionTarget?.storePath ?? storePath,
					sessionAgentId: internalSessionTarget?.agentId ?? sessionAgentId,
					config: cfg
				},
				replyText: attemptExecutionRuntime.resolveCliTranscriptReplyText(result),
				provider: result.meta.agentMeta?.provider,
				model: result.meta.agentMeta?.model,
				runOwnedSessionId
			});
		}
		const turnTranscriptPersisted = transcriptPersistenceRunner === "embedded" || persistedCliTurnTranscript;
		let followupRun;
		if (turnTranscriptPersisted && sessionEntry && sessionStore && sessionKey && !params.suppressVisibleSessionEffects) {
			const flushProvider = result.meta.agentMeta?.provider ?? fallbackProvider;
			const flushModel = result.meta.agentMeta?.model ?? fallbackModel;
			const maintenanceAuthProfile = params.attempt.maintenanceAuthProfile ?? {
				authProfileId: sessionEntry.authProfileOverride?.trim() || void 0,
				authProfileIdSource: resolveSessionAuthProfileOverrideSource(sessionEntry)
			};
			followupRun = {
				prompt: "",
				enqueuedAt: Date.now(),
				run: {
					agentId: sessionAgentId,
					agentDir,
					sessionId: sessionEntry.sessionId,
					sessionKey,
					sessionFile: sessionKey,
					workspaceDir,
					cwd: effectiveCwd,
					runtimePolicySessionKey: sessionKey,
					config: cfg,
					provider: flushProvider,
					model: flushModel,
					...maintenanceAuthProfile,
					blockReplyBreak: "message_end",
					skillsSnapshot,
					thinkLevel: effectiveTurnThinkLevel,
					verboseLevel: resolvedVerboseLevel ?? "off",
					timeoutMs,
					senderIsOwner: false
				}
			};
			throwAgentRunRestartAbortReason(params.opts.abortSignal?.reason);
			assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
			const { runMemoryFlushIfNeeded } = await loadAgentRunnerMemoryRuntime();
			throwAgentRunRestartAbortReason(params.opts.abortSignal?.reason);
			assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
			sessionEntry = (await runMemoryFlushIfNeeded({
				cfg,
				followupRun,
				promptForEstimate: "",
				sessionCtx: {},
				defaultModel: flushModel,
				resolvedVerboseLevel: resolvedVerboseLevel ?? "off",
				sessionEntry,
				sessionStore,
				sessionKey,
				runtimePolicySessionKey: sessionKey,
				storePath,
				isHeartbeat: isHeartbeatLifecycleRun,
				abortSignal: params.opts.abortSignal,
				onSessionIdChanged: params.opts.onSessionIdChanged
			})).sessionEntry ?? sessionEntry;
			followupRun.run.sessionId = sessionEntry.sessionId;
			if (sessionEntry.sessionId !== runOwnedSessionId) {
				runOwnedSessionId = sessionEntry.sessionId;
				publishSessionOwnership();
			}
			throwAgentRunRestartAbortReason(params.opts.abortSignal?.reason);
			assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
		}
		const payloads = result.payloads ?? [];
		const pendingFinalDeliveryMarker = await persistPendingFinalDeliveryMarker({
			deliver: params.opts.deliver === true,
			sessionStore,
			sessionKey,
			sessionEntry,
			storePath,
			suppressVisibleSessionEffects: params.suppressVisibleSessionEffects,
			sessionReboundDuringRun,
			payloads,
			deliveryContext: params.currentRunDeliveryContext,
			runOwnedSessionId
		});
		sessionEntry = pendingFinalDeliveryMarker.sessionEntry;
		const resolveFreshSessionEntryForDelivery = sessionStore && sessionKey && !params.suppressVisibleSessionEffects ? async () => {
			const { loadSessionEntryReadOnly } = await loadSessionStoreRuntime();
			const freshEntry = loadSessionEntryReadOnly({
				storePath,
				sessionKey,
				readConsistency: "latest",
				clone: false
			});
			if (!freshEntry || freshEntry.sessionId !== runOwnedSessionId) return;
			sessionStore[sessionKey] = freshEntry;
			return freshEntry;
		} : void 0;
		// vlab-postturn-reply-finalization-v1
		const canSafelyRunPostTurnCompaction = params.opts.deliver !== true || !pendingFinalDeliveryMarker.hasSendableFinalPayload || pendingFinalDeliveryMarker.pendingFinalDeliveryMarkerPersisted;
		const agentMeta = result.meta.agentMeta;
		let embeddedCompactionRun = followupRun && transcriptPersistenceRunner === "embedded" && agentMeta?.agentHarnessId === "openclaw" && sessionEntry?.sessionId === runOwnedSessionId && !fallbackExhausted && terminal.outcome.status === "ok" && !resultErrorPayload && !result.meta.yielded && !result.meta.aborted && (compactionFact?.count ?? 0) === 0 && !isHeartbeatLifecycleRun && cfg.agents?.defaults?.compaction?.enabled !== false && !params.preserveUserFacingSessionModelState && !sessionReboundDuringRun && params.opts.modelRun !== true && params.opts.promptMode !== "none" ? followupRun : void 0;
		if (embeddedCompactionRun && params.attempt.maintenanceAuthProfile === void 0) {
			log$2.warn("Post-turn compaction skipped: completed embedded run did not report its auth selection.");
			embeddedCompactionRun = void 0;
		}
		if ((persistedCliTurnTranscript || embeddedCompactionRun) && !params.suppressVisibleSessionEffects && canSafelyRunPostTurnCompaction) {
			const lifecycleRevisionBefore = sessionEntry?.lifecycleRevision;
			try {
				const compactionCountBefore = sessionEntry?.compactionCount ?? 0;
				const authorize = () => {
					throwAgentRunRestartAbortReason(params.opts.abortSignal?.reason);
					assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
					return params.opts.abortSignal?.aborted !== true && !sessionReboundDuringRun;
				};
				const onCommitted = (accepted) => {
					sessionEntry = accepted.entry;
					runOwnedSessionId = accepted.sessionId;
					publishSessionOwnership(accepted.previousSessionId === void 0 ? void 0 : accepted.sessionId);
				};
				const compactedSessionEntry = embeddedCompactionRun ? await (await loadAgentRunnerMemoryRuntime()).runSessionCompactionIfNeeded({
					cfg,
					followupRun: embeddedCompactionRun,
					promptForEstimate: "",
					sessionEntry,
					sessionStore,
					sessionKey,
					runtimePolicySessionKey: sessionKey,
					storePath,
					defaultModel: embeddedCompactionRun.run.model,
					isHeartbeat: false,
					agentHarnessId: agentMeta?.agentHarnessId,
					abortSignal: params.opts.abortSignal,
					onSessionIdChanged: params.opts.onSessionIdChanged,
					authorize,
					onCompactionCommitted: onCommitted,
					onCompactionStart: async () => {
						// Only this post-turn path has a committed final assistant result.
						// Preflight/overflow/mid-turn compaction cannot close the reply.
						const text = selectPostTurnFinalText(payloads);
						if (text === void 0 || !authorize()) return;
						await globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")]?.finishVisibleReplyForMaintenance?.(runId, text);
					}
				}) : await (await loadCliCompactionRuntime()).runCliTurnCompactionLifecycle({
					cfg,
					sessionId: sessionEntry?.sessionId ?? effectiveSessionId,
					sessionKey: sessionKey ?? effectiveSessionId,
					sessionEntry,
					sessionStore,
					storePath,
					sessionAgentId,
					workspaceDir,
					cwd: effectiveCwd,
					agentDir,
					provider: agentMeta?.provider ?? provider,
					model: agentMeta?.model ?? model,
					skillsSnapshot,
					messageChannel,
					agentAccountId: runContext.accountId,
					senderIsOwner: params.opts.senderIsOwner,
					thinkLevel: effectiveTurnThinkLevel,
					extraSystemPrompt: params.opts.extraSystemPrompt,
					pluginGeneration: params.prepared.commandRuntimeContext?.pluginGeneration,
					abortSignal: params.opts.abortSignal
				}, {
					assertActive: () => {
						if (!authorize()) throw new Error("Command compaction is no longer active");
					},
					onCommitted
				});
				throwAgentRunRestartAbortReason(params.opts.abortSignal?.reason);
				assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
				sessionEntry = compactedSessionEntry;
				runOwnedSessionId = compactedSessionEntry?.sessionId ?? runOwnedSessionId;
				publishSessionOwnership();
				const completedCompactions = (compactedSessionEntry?.compactionCount ?? 0) - compactionCountBefore;
				if (embeddedCompactionRun && compactedSessionEntry && agentMeta && completedCompactions > 0) result = {
					...result,
					meta: {
						...result.meta,
						agentMeta: {
							...agentMeta,
							sessionId: runOwnedSessionId,
							sessionFile: formatSqliteSessionFileMarker({
								agentId: sessionAgentId,
								sessionId: runOwnedSessionId,
								storePath
							}),
							compactionCount: (agentMeta.compactionCount ?? 0) + completedCompactions,
							compactionTokensAfter: resolveFreshSessionTotalTokens(compactedSessionEntry),
							contextBudgetStatus: void 0
						}
					}
				};
			} catch (error) {
				throwAgentRunRestartAbortReason(params.opts.abortSignal?.reason);
				throwAgentRunRestartAbortReason(error);
				assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
				if (embeddedCompactionRun) {
					params.opts.abortSignal?.throwIfAborted();
					const currentEntry = await resolveFreshSessionEntryForDelivery?.();
					params.opts.abortSignal?.throwIfAborted();
					assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
					if (!currentEntry || currentEntry.lifecycleRevision !== lifecycleRevisionBefore) throw error;
				} else if (params.opts.deliver !== true || !pendingFinalDeliveryMarker.pendingFinalDeliveryMarkerPersisted || !pendingFinalDeliveryMarker.hasSendableFinalPayload) throw error;
				log$2.warn(`Post-turn transcript compaction failed for ${sessionKey ?? sessionId}; continuing final delivery: ${formatErrorMessage(error)}`);
			}
		}
		const { deliverAgentCommandResult } = await loadDeliveryRuntime();
		const deliveryParams = {
			cfg,
			deps: params.deps,
			runtime: params.runtime,
			opts: params.opts,
			outboundSession,
			sessionEntry,
			result,
			payloads,
			assertDeliveryCurrent: () => assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration),
			onDeliveryResult: (delivered) => {
				const deliveryStatus = delivered.deliveryStatus;
				const terminalDelivery = normalizeAgentRunTerminalDeliverySnapshot(deliveryStatus && {
					status: deliveryStatus.status,
					resultCount: deliveryStatus.resultCount ?? 0
				});
				if (terminalDelivery) terminal.metadata.terminalDelivery = terminalDelivery;
				params.onTerminalDeliveryEvidenceChanged(buildRestartRecoveryTerminalDeliveryEvidence(delivered));
			}
		};
		deliveryResult = await deliverAgentCommandResult(resolveFreshSessionEntryForDelivery ? {
			...deliveryParams,
			expectedSessionIdForFreshDelivery: runOwnedSessionId,
			resolveFreshSessionEntryForDelivery
		} : deliveryParams);
		if (sessionStore && sessionKey && !isSubagentSessionKey(sessionKey) && !params.suppressVisibleSessionEffects && !sessionReboundDuringRun) {
			const entry = await resolveFreshSessionEntryForDelivery?.() ?? sessionStore[sessionKey] ?? sessionEntry;
			if (!entry) throw new Error("Cannot clear pending delivery without a session entry");
			const clearStaleTransportOnly = params.opts.deliver === true && !pendingFinalDeliveryMarker.hasSendableFinalPayload && entry.pendingFinalDelivery?.kind === "transport-only";
			const clearOwnedPendingFinal = deliveryResult?.deliverySucceeded === true && pendingFinalDeliveryMarker.pendingFinalDeliveryIntentId !== void 0;
			const recoveryClaimEntry = entry.restartRecoveryDeliveryRunId === runId ? entry : sessionEntry?.restartRecoveryDeliveryRunId === runId ? sessionEntry : params.sessionEntry?.restartRecoveryDeliveryRunId === runId ? params.sessionEntry : void 0;
			const clearsRecoveryCycle = entry.restartRecoveryDeliveryRunId === runId;
			if (clearOwnedPendingFinal || clearStaleTransportOnly || recoveryClaimEntry) {
				const now = Date.now();
				sessionEntry = await persistAgentSession({
					sessionStore,
					sessionKey,
					storePath,
					initialEntry: entry,
					entry: {
						...clearOwnedPendingFinal || clearStaleTransportOnly ? clearPendingFinalDelivery(entry, now) : {
							...entry,
							updatedAt: now
						},
						...recoveryClaimEntry ? buildRestartRecoveryClaimCleanupPatch({
							entry: {
								...recoveryClaimEntry,
								restartRecoveryTerminalDeliveryEvidence: entry.restartRecoveryTerminalDeliveryEvidence,
								restartRecoveryTerminalRunIds: entry.restartRecoveryTerminalRunIds
							},
							recordTerminalSource: true,
							terminalDeliveryEvidence: buildRestartRecoveryTerminalDeliveryEvidence(deliveryResult ?? result),
							terminalRunId: runId
						}) : {},
						...clearsRecoveryCycle ? buildMainSessionRecoveryClearPatch(entry) : {}
					},
					shouldPersist: (current) => shouldPersistCurrentRunSessionCleanup(current, runOwnedSessionId) && (!recoveryClaimEntry || current?.restartRecoveryDeliveryRunId === runId || !clearsRecoveryCycle && current?.restartRecoveryDeliveryRunId === void 0) && (!clearOwnedPendingFinal || current?.pendingFinalDelivery?.intentId === pendingFinalDeliveryMarker.pendingFinalDeliveryIntentId) && (!clearStaleTransportOnly || current?.pendingFinalDelivery?.kind === "transport-only")
				});
			}
		}
		hasResultError = Boolean(fallbackExhausted || lifecycle.resolveResultError(result, false));
		if (hasResultError) lifecycle.emitResultError(result, fallbackExhausted, terminal);
		else lifecycle.emitEnd(terminal);
	} catch (error) {
		lifecycle.emitPostTurnError(error, terminal);
		throw error;
	} finally {
		await deferredLifecycle.complete();
	}
	const outcome = deferredLifecycle.signal.aborted ? mergeAgentRunTerminalOutcome(terminal.outcome, buildAgentRunTerminalOutcomeFromLifecycleEvent({
		phase: "end",
		abortSignal: deferredLifecycle.signal
	})) : terminal.outcome;
	return {
		deliveryResult: recordAgentRunTerminalOutcome(deliveryResult, hasResultError || classifyAgentRunTerminalOutcome(outcome) !== "success" ? "failed" : "completed"),
		sessionEntry,
		runOwnedSessionId,
		sessionReboundDuringRun
	};
}
//#endregion
//#region src/agents/command/attempt-callbacks.ts
/**
* Lifecycle callback state helpers for a single agent attempt.
*/
/** Creates callbacks that update lifecycle flags for persistence decisions. */
function createAgentAttemptLifecycleCallbacks(state, onRuntimeTurnStarted) {
	return {
		onUserMessagePersisted: () => {
			state.currentTurnUserMessagePersisted = true;
		},
		onAgentEvent: (evt) => {
			if (evt.stream !== "lifecycle" || typeof evt.data?.phase !== "string") return;
			if (evt.data.phase === "start") {
				state.lifecycleError = void 0;
				state.lifecycleErrorObservation = void 0;
				state.lifecycleFinishing = false;
				state.lifecycleEnded = false;
				return onRuntimeTurnStarted?.();
			}
			if (typeof evt.data.error === "string" && evt.data.error.trim()) {
				state.lifecycleError = evt.data.error;
				state.lifecycleErrorObservation = asOptionalRecord(evt.data.errorObservation);
			}
			if (evt.data.phase === "finishing") {
				state.lifecycleFinishing = true;
				return;
			}
			if (evt.data.phase === "end" || evt.data.phase === "error") state.lifecycleEnded = true;
		}
	};
}
//#endregion
//#region src/agents/command/compaction-accounting.ts
/** Keeps command context observations and completed counts on their original writer. */
function createCommandCompactionAccounting(params) {
	let accounting;
	return {
		get fact() {
			return accounting;
		},
		beginCandidate() {
			if (accounting?.currentContextSnapshot) accounting = {
				...accounting,
				currentContextSnapshot: { tokens: void 0 }
			};
			let candidateFact;
			return {
				observe: (fact) => {
					if (fact?.kind === "durable" && fact.count === 0 && accounting && !hasSameCompactionWriter(accounting.target, fact.target)) return;
					candidateFact = fact;
					if (fact?.kind === "durable") params.onDurableFact(fact);
				},
				async finish(sessionEntry) {
					const fact = candidateFact;
					if (fact?.kind !== "durable") return;
					const carriedCount = hasSameCompactionWriter(accounting?.target, fact.target) ? accounting?.count ?? 0 : 0;
					accounting = {
						...fact,
						count: carriedCount + fact.count,
						currentContextSnapshot: fact.currentContextSnapshot ?? accounting?.currentContextSnapshot
					};
					if (fact.count > 0 && params.persistCounts) {
						await incrementCompactionCount({
							agentId: fact.target.agentId,
							sessionEntry,
							sessionStore: params.sessionStore,
							sessionKey: fact.target.sessionKey,
							storePath: fact.target.storePath,
							expectedSession: fact.target,
							amount: fact.count,
							tokensAfter: fact.currentContextSnapshot?.tokens
						});
						params.refreshSessionEntry(fact.target.sessionKey);
					}
				}
			};
		}
	};
}
//#endregion
//#region src/agents/command/run-embedded-attempt.ts
const log$1 = createSubsystemLogger("agents/agent-command");
const MAX_LIVE_SWITCH_RETRIES = 5;
async function runEmbeddedAgentAttempt(params) {
	const { cfg, body, transcriptBody, sessionId, sessionKey, sessionStore, storePath, sessionAgentId, workspaceDir, cwd, agentDir, runId, pluginsEnabled, manifestMetadataSnapshot, modelManifestContext, normalizedSpawned, isNewSession, timeoutMs, runTimeoutOverrideMs } = params.prepared;
	const { runContext, skillsSnapshot, resolvedVerboseLevel } = params.embeddedSessionState;
	const { defaultProvider, defaultModel, configuredDefaultAuthProfileId, visibilityPolicy, hasExplicitRunOverride, storedProviderOverride, hasStoredAutoFallbackProvenance, autoFallbackPrimaryProbe, immutableThinkLevel, sessionFile } = params.modelSelection;
	let { provider, model, providerForAuthProfileValidation, sessionEntryForAttempt, storedModelOverride, storedModelOverrideSource, effectiveTurnThinkLevel } = params.modelSelection;
	const thinkingCatalog = params.modelSelection.thinkingCatalog;
	let sessionEntry = params.sessionEntry;
	let lifecycleGeneration = params.lifecycleGeneration;
	const sessionEffectsSource = resolveInternalSessionEffectsSource({
		agentId: sessionAgentId,
		sessionId,
		sessionKey,
		storePath
	});
	const internalSessionTarget = params.suppressVisibleSessionEffects ? await prepareInternalSessionEffectsSession({
		agentId: sessionAgentId,
		cwd: cwd ?? workspaceDir,
		runId,
		source: sessionEffectsSource,
		storePath
	}) : void 0;
	params.trackInternalModelRunTarget(internalSessionTarget);
	let attemptSessionTarget = internalSessionTarget ?? (sessionKey && storePath ? {
		agentId: sessionAgentId,
		sessionId,
		sessionKey,
		storePath
	} : void 0);
	const attemptSessionFile = internalSessionTarget?.sessionFile ?? sessionFile;
	const startedAt = Date.now();
	const attemptLifecycleState = {
		currentTurnUserMessagePersisted: false,
		lifecycleFinishing: false,
		lifecycleEnded: false
	};
	const attemptLifecycleCallbacks = createAgentAttemptLifecycleCallbacks(attemptLifecycleState, params.preparedRunAdmission.onRuntimeTurnStarted);
	const transcriptMedia = params.opts.transcriptMedia ?? [];
	const hasTranscriptMedia = transcriptMedia.length > 0;
	const suppressUserTurnPersistence = params.opts.suppressPromptPersistence === true || params.opts.transcriptMessage === "" && !hasTranscriptMedia;
	const recorderTranscriptText = transcriptBody || void 0;
	const userTurnTranscriptRecorder = (internalSessionTarget ? void 0 : params.opts.userTurnTranscriptRecorder) ?? createUserTurnTranscriptRecorder({
		...!suppressUserTurnPersistence && (recorderTranscriptText || hasTranscriptMedia) ? { input: {
			text: recorderTranscriptText,
			...hasTranscriptMedia ? { media: transcriptMedia } : {},
			senderIsOwner: params.opts.senderIsOwner,
			...params.opts.inputProvenance ? { provenance: params.opts.inputProvenance } : {}
		} } : {},
		target: {
			sessionId: internalSessionTarget?.sessionId ?? sessionId,
			agentId: internalSessionTarget?.agentId ?? sessionAgentId,
			sessionKey: internalSessionTarget?.sessionKey ?? sessionKey ?? sessionId,
			sessionEntry: internalSessionTarget?.sessionEntry ?? sessionEntry,
			sessionStore: params.suppressVisibleSessionEffects ? void 0 : sessionStore,
			storePath: internalSessionTarget?.storePath ?? storePath,
			cwd: cwd ?? workspaceDir,
			config: cfg
		},
		beforeMessageWrite: runAgentHarnessBeforeMessageWriteHook,
		errorContext: "agent command user turn transcript"
	});
	if (suppressUserTurnPersistence) userTurnTranscriptRecorder.markBlocked();
	const lifecycle = createAgentCommandLifecycle({
		runId,
		lifecycleGeneration: () => lifecycleGeneration,
		startedAt,
		abortSignal: params.opts.abortSignal,
		state: attemptLifecycleState
	});
	const attemptExecutionRuntime = await measureAgentStartup("attempt-runtime-import", () => loadAttemptExecutionRuntime(), { config: cfg });
	const messageChannel = resolveMessageChannel(runContext.messageChannel, params.opts.replyChannel ?? params.opts.channel);
	let result;
	const compactionAccounting = createCommandCompactionAccounting({
		sessionStore,
		persistCounts: !params.suppressVisibleSessionEffects && !params.preserveUserFacingSessionModelState,
		onDurableFact: (fact) => {
			attemptSessionTarget = fact.target;
			params.trackInternalModelRunTarget(fact.target);
			params.onCompactionAccounting?.(fact);
		},
		refreshSessionEntry: (key) => {
			sessionEntry = sessionStore?.[key] ?? sessionEntry;
			sessionEntryForAttempt = sessionEntry;
		}
	});
	let maintenanceAuthProfile;
	let fallbackProvider = provider;
	let fallbackModel = model;
	let fallbackExhausted = false;
	let terminal;
	let liveSwitchRetries = 0;
	let autoFallbackPrimaryProbeInterruptedByLiveSwitch = false;
	const fastModeStartedAtMs = Date.now();
	const fallbackTrajectoryRecorder = createTrajectoryRuntimeRecorder({
		cfg,
		runId,
		sessionId,
		sessionKey,
		sessionFile: attemptSessionFile,
		provider,
		modelId: model,
		workspaceDir
	});
	const deferredLifecycle = createDeferredEmbeddedRunLifecycleManager({
		runId,
		agentId: sessionAgentId,
		sessionId,
		sessionKey,
		sessionFile: attemptSessionFile,
		abortSignal: params.opts.abortSignal
	});
	const logicalTurnOpts = {
		...params.opts,
		abortSignal: deferredLifecycle.signal
	};
	let liveSwitchMediaTaskIds = /* @__PURE__ */ new Set();
	for (;;) try {
		liveSwitchMediaTaskIds = sessionKey ? getGeneratedMediaTaskIdsForSessionKey(sessionKey) : /* @__PURE__ */ new Set();
		const spawnedBy = normalizedSpawned.spawnedBy ?? sessionEntry?.spawnedBy;
		const effectiveFallbacksOverride = isModelSelectionLocked(sessionEntry) ? [] : params.opts.modelFallbacksOverride ?? resolveEffectiveModelFallbacks({
			cfg,
			agentId: sessionAgentId,
			sessionKey,
			hasSessionModelOverride: hasExplicitRunOverride || Boolean(storedProviderOverride || storedModelOverride),
			modelOverrideSource: hasExplicitRunOverride ? "user" : storedModelOverrideSource,
			hasAutoFallbackProvenance: hasExplicitRunOverride ? false : hasStoredAutoFallbackProvenance
		});
		const fallbackRuntimeState = {};
		attemptLifecycleState.currentTurnUserMessagePersisted = false;
		let attemptMediaTaskIds = liveSwitchMediaTaskIds;
		const currentAttemptCommittedCronMedia = () => Boolean(sessionKey && hasNewGeneratedMediaTaskForSessionKey(sessionKey, attemptMediaTaskIds));
		const fallbackResult = await runEmbeddedAgentEntry({
			selection: {
				cfg,
				provider,
				model,
				requestedRouteResolution: params.modelSelection.requestedRouteResolution,
				agentDir,
				fallbacksOverride: effectiveFallbacksOverride,
				userLockedAuthProfileId: resolveSessionAuthProfileOverrideSource(sessionEntryForAttempt) === "user" ? sessionEntryForAttempt?.authProfileOverride : void 0,
				...modelManifestContext
			},
			identity: {
				runId,
				agentId: sessionAgentId,
				sessionId,
				sessionKey: sessionKey ?? sessionId
			},
			harness: {
				workspaceDir,
				sessionKey,
				preparation: { kind: "direct" },
				resolveRuntimeOverride: (candidateProvider) => resolveSessionRuntimeOverrideForProvider({
					provider: candidateProvider,
					entry: sessionEntryForAttempt,
					cfg
				})
			},
			behavior: {
				kind: "command-rpc",
				hasCommittedSideEffect: currentAttemptCommittedCronMedia
			},
			sessionOverride: {
				kind: "reconcile-completed",
				reconcile: async ({ provider: winnerProvider, model: winnerModel }) => {
					if (!autoFallbackPrimaryProbe || autoFallbackPrimaryProbeInterruptedByLiveSwitch || !sessionEntry || !sessionStore || !sessionKey || isModelSelectionLocked(sessionEntry) || params.suppressVisibleSessionEffects || params.preserveUserFacingSessionModelState || !entryMatchesAutoFallbackPrimaryProbe(sessionEntry, autoFallbackPrimaryProbe) || winnerProvider !== autoFallbackPrimaryProbe.provider || winnerModel !== autoFallbackPrimaryProbe.model) return;
					const nextSessionEntry = { ...sessionEntry };
					clearAutoFallbackPrimaryProbeSelection(nextSessionEntry);
					sessionEntry = await persistAgentSession({
						sessionStore,
						sessionKey,
						storePath,
						initialEntry: sessionEntry,
						entry: nextSessionEntry,
						shouldPersist: (current) => Boolean(current && entryMatchesAutoFallbackPrimaryProbe(current, autoFallbackPrimaryProbe))
					});
				}
			},
			abortSignal: deferredLifecycle.signal,
			onFallbackStep: (step) => {
				fallbackTrajectoryRecorder?.recordEvent("model.fallback_step", step);
			},
			runCandidate: async (providerOverride, modelOverride, runOptions) => {
				const candidateAccounting = compactionAccounting.beginCandidate();
				maintenanceAuthProfile = void 0;
				attemptMediaTaskIds = sessionKey ? getGeneratedMediaTaskIdsForSessionKey(sessionKey) : /* @__PURE__ */ new Set();
				attemptLifecycleState.lifecycleError = void 0;
				attemptLifecycleState.lifecycleFinishing = false;
				attemptLifecycleState.lifecycleEnded = false;
				const isAutoFallbackPrimaryProbeCandidate = autoFallbackPrimaryProbe && providerOverride === autoFallbackPrimaryProbe.provider && modelOverride === autoFallbackPrimaryProbe.model;
				const attemptSessionEntry = autoFallbackPrimaryProbe && providerOverride === autoFallbackPrimaryProbe.fallbackProvider && !isAutoFallbackPrimaryProbeCandidate ? sessionEntry : sessionEntryForAttempt;
				if (isAutoFallbackPrimaryProbeCandidate) markAutoFallbackPrimaryProbe({
					probe: autoFallbackPrimaryProbe,
					sessionKey
				});
				await params.opts.onActiveModelSelected?.({
					provider: providerOverride,
					model: modelOverride
				});
				const fastModeState = resolveFastModeState({
					cfg,
					provider: providerOverride,
					model: modelOverride,
					agentId: sessionAgentId,
					sessionEntry
				});
				const fastMode = params.opts.fastMode ?? fastModeState.mode;
				const configuredAuthProfileId = providerOverride === defaultProvider && modelOverride === defaultModel ? configuredDefaultAuthProfileId : void 0;
				const agentHarnessRuntimeOverride = resolveSessionRuntimeOverrideForProvider({
					provider: providerOverride,
					entry: attemptSessionEntry,
					cfg
				});
				const candidateRuntime = resolveEffectiveAgentRuntime({
					cfg,
					provider: providerOverride,
					modelId: modelOverride,
					agentId: sessionAgentId,
					sessionKey,
					sessionEntry: attemptSessionEntry
				});
				const candidateConfiguredThinkLevel = immutableThinkLevel ?? resolveConfiguredThinkingDefault({
					cfg,
					provider: providerOverride,
					model: modelOverride
				});
				let candidateThinkingCatalog = thinkingCatalog;
				if (pluginsEnabled && candidateConfiguredThinkLevel !== "off" && needsThinkHydration(thinkingCatalog, providerOverride, modelOverride, candidateRuntime)) {
					const { loadProviderScopedThinkingCatalog } = await import("./agents/model-catalog.runtime.js");
					const runtimeCatalog = normalizeThinkingCatalogProviders(await loadProviderScopedThinkingCatalog({
						config: cfg,
						provider: providerOverride,
						model: modelOverride,
						agentId: sessionAgentId,
						workspaceDir
					}));
					const allowedRuntimeCatalog = createModelVisibilityPolicy({
						cfg,
						catalog: runtimeCatalog,
						defaultProvider,
						defaultModel,
						agentId: sessionAgentId,
						allowManifestNormalization: true,
						allowPluginNormalization: true,
						...modelManifestContext
					}).allowedCatalog;
					if (allowedRuntimeCatalog.length > 0) candidateThinkingCatalog = allowedRuntimeCatalog;
				}
				const candidateRequestedThinkLevel = candidateConfiguredThinkLevel ?? resolveThinkingDefault({
					cfg,
					provider: providerOverride,
					model: modelOverride,
					catalog: candidateThinkingCatalog,
					agentRuntime: candidateRuntime
				});
				const candidateThinkLevel = resolveCandidateThinkingLevel({
					cfg,
					provider: providerOverride,
					modelId: modelOverride,
					level: candidateRequestedThinkLevel,
					catalog: candidateThinkingCatalog,
					agentId: sessionAgentId,
					sessionKey,
					sessionEntry: attemptSessionEntry,
					agentRuntime: candidateRuntime
				}) ?? candidateRequestedThinkLevel;
				effectiveTurnThinkLevel = candidateThinkLevel;
				try {
					return await attemptExecutionRuntime.runAgentAttempt({
						preparedRunAdmission: params.preparedRunAdmission,
						providerOverride,
						modelOverride,
						...prepareModelRunCapabilities([candidateThinkingCatalog, params.prepared.configuredThinkingCatalog], [
							providerOverride,
							modelOverride,
							candidateRuntime
						]),
						configuredAuthProfileId,
						modelFallbacksOverride: effectiveFallbacksOverride,
						originalProvider: provider,
						cfg,
						sessionEntry: attemptSessionEntry,
						agentHarnessRuntimeOverride,
						sessionId: attemptSessionTarget?.sessionId ?? sessionId,
						sessionKey,
						...attemptSessionTarget ? { sessionTarget: attemptSessionTarget } : {},
						sessionAgentId,
						sessionFile: attemptSessionFile,
						workspaceDir,
						cwd,
						body,
						transcriptBody,
						isFallbackRetry: runOptions.isFallbackRetry,
						classifyResult: runOptions.classifyResult,
						preserveCliSessionBinding: isHeartbeatLifecycleRunKind(logicalTurnOpts.bootstrapContextRunKind) || params.preserveUserFacingSessionModelState,
						modelRoutingProvenance: runOptions.modelRoutingProvenance,
						resolvedThinkLevel: candidateThinkLevel,
						fastMode,
						fastModeStartedAtMs,
						fastModeAutoOnSeconds: fastMode === "auto" ? params.opts.fastModeAutoOnSeconds ?? fastModeState.fastAutoOnSeconds : fastModeState.fastAutoOnSeconds,
						isFinalFallbackAttempt: runOptions?.isFinalFallbackAttempt,
						timeoutMs,
						runTimeoutOverrideMs,
						runId,
						lifecycleGeneration,
						opts: logicalTurnOpts,
						runContext,
						spawnedBy,
						messageChannel,
						skillsSnapshot,
						resolvedVerboseLevel,
						agentDir,
						authProfileProvider: providerForAuthProfileValidation,
						sessionStore: params.suppressVisibleSessionEffects ? void 0 : sessionStore,
						storePath: params.suppressVisibleSessionEffects ? void 0 : storePath,
						pluginsEnabled,
						...manifestMetadataSnapshot ? { metadataSnapshot: manifestMetadataSnapshot } : {},
						pluginGeneration: params.prepared.commandRuntimeContext?.pluginGeneration,
						allowTransientCooldownProbe: runOptions?.allowTransientCooldownProbe,
						sessionHasHistory: !isNewSession || await attemptExecutionRuntime.sessionTranscriptHasContent(attemptSessionTarget, deferredLifecycle.signal),
						fallbackRuntimeState,
						suppressPromptPersistenceOnRetry: suppressUserTurnPersistence || userTurnTranscriptRecorder.hasPersisted() || userTurnTranscriptRecorder.isBlocked() || runOptions.isFallbackRetry && attemptLifecycleState.currentTurnUserMessagePersisted,
						userTurnTranscriptRecorder,
						contextEngineLogicalTurnLease: runOptions.contextEngineLogicalTurnLease,
						onContextEngineTurnCandidate: runOptions.onContextEngineTurnCandidate,
						onUserMessagePersisted: attemptLifecycleCallbacks.onUserMessagePersisted,
						onCompactionAccounting: candidateAccounting.observe,
						onSuccessfulAuthProfile: (selection) => {
							maintenanceAuthProfile = selection;
						},
						onLifecycleGenerationChanged: (nextLifecycleGeneration) => {
							lifecycleGeneration = nextLifecycleGeneration;
							params.onLifecycleGenerationChanged(nextLifecycleGeneration);
						},
						onAgentEvent: attemptLifecycleCallbacks.onAgentEvent,
						deferTerminalLifecycle: true,
						deferredLifecycle
					});
				} finally {
					await candidateAccounting.finish(sessionEntry);
				}
			}
		});
		result = fallbackResult.result;
		terminal = fallbackResult.terminal;
		if (isAgentRunRestartAbortReason(params.opts.abortSignal?.reason)) throw params.opts.abortSignal?.reason;
		fallbackProvider = fallbackResult.provider;
		fallbackModel = fallbackResult.model;
		fallbackExhausted = fallbackResult.outcome === "exhausted";
		await fallbackResult.settleSessionOverride();
		if (fallbackResult.attempts.length > 0 && result.meta.agentMeta) result = {
			...result,
			meta: {
				...result.meta,
				agentMeta: {
					...result.meta.agentMeta,
					fallbackAttempts: fallbackResult.attempts
				}
			}
		};
		if (!fallbackExhausted) lifecycle.emitFinishing(terminal);
		break;
	} catch (err) {
		if (err instanceof LiveSessionModelSwitchError) {
			if (isModelSelectionLocked(sessionEntry)) {
				lifecycle.emitBasicError(MODEL_SELECTION_LOCKED_MESSAGE);
				await fallbackTrajectoryRecorder?.flush();
				await deferredLifecycle.complete();
				throw new ModelSelectionLockedError();
			}
			if (sessionKey && hasNewGeneratedMediaTaskForSessionKey(sessionKey, liveSwitchMediaTaskIds)) {
				await deferredLifecycle.complete();
				throw err;
			}
			liveSwitchRetries += 1;
			if (liveSwitchRetries > MAX_LIVE_SWITCH_RETRIES) {
				const retryLimitMessage = `Exceeded maximum live model switch retries (${MAX_LIVE_SWITCH_RETRIES})`;
				log$1.error(`Live session model switch in subagent run ${runId}: ${retryLimitMessage}`);
				lifecycle.emitBasicError("Agent run failed");
				await fallbackTrajectoryRecorder?.flush();
				await deferredLifecycle.complete();
				throw new Error(retryLimitMessage, { cause: err });
			}
			const switchRef = normalizeAgentCommandModelRef(cfg, err.provider, err.model, modelManifestContext);
			if (!visibilityPolicy.allowsKey(modelKey(switchRef.provider, switchRef.model))) {
				log$1.info(`Live session model switch in subagent run ${runId}: rejected ${sanitizeForLog(err.provider)}/${sanitizeForLog(err.model)} (not in allowlist)`);
				lifecycle.emitBasicError("Agent run failed");
				await fallbackTrajectoryRecorder?.flush();
				await deferredLifecycle.complete();
				throw new Error(`Live model switch rejected: ${sanitizeForLog(err.provider)}/${sanitizeForLog(err.model)} is not in the agent allowlist`, { cause: err });
			}
			if (storedModelOverride || err.model !== model || err.provider !== provider) {
				storedModelOverride = err.model;
				storedModelOverrideSource = "user";
			}
			if (autoFallbackPrimaryProbe) autoFallbackPrimaryProbeInterruptedByLiveSwitch = true;
			provider = err.provider;
			model = err.model;
			fallbackProvider = err.provider;
			fallbackModel = err.model;
			providerForAuthProfileValidation = err.provider;
			if (sessionEntry) {
				sessionEntry = { ...sessionEntry };
				if (err.agentRuntimeOverride) sessionEntry.agentRuntimeOverride = err.agentRuntimeOverride;
				else delete sessionEntry.agentRuntimeOverride;
				sessionEntry.authProfileOverride = err.authProfileId;
				sessionEntry.authProfileOverrideSource = err.authProfileId ? err.authProfileIdSource : void 0;
				sessionEntry.authProfileOverrideCompactionCount = void 0;
				sessionEntryForAttempt = sessionEntry;
			}
			attemptLifecycleState.lifecycleEnded = false;
			log$1.info(`Live session model switch in subagent run ${runId}: switching to ${sanitizeForLog(err.provider)}/${sanitizeForLog(err.model)}`);
			continue;
		}
		const errorLifecycleFields = resolveAgentRunErrorLifecycleFields(err, params.opts.abortSignal);
		lifecycle.emitBasicError(err instanceof Error ? err : /* @__PURE__ */ new Error("Agent run failed"), errorLifecycleFields);
		await fallbackTrajectoryRecorder?.flush();
		await deferredLifecycle.complete();
		throw err;
	}
	return {
		result,
		fallbackProvider,
		fallbackModel,
		fallbackExhausted,
		provider,
		model,
		sessionEntry,
		lifecycleGeneration,
		effectiveTurnThinkLevel,
		maintenanceAuthProfile,
		compactionAccounting: compactionAccounting.fact,
		internalSessionTarget,
		attemptExecutionRuntime,
		messageChannel,
		suppressUserTurnPersistence,
		userTurnTranscriptRecorder,
		fallbackTrajectoryRecorder,
		deferredLifecycle,
		lifecycle,
		terminal
	};
}
//#endregion
//#region src/agents/command/session-preparation.ts
async function prepareEmbeddedSessionState(params) {
	const requestedThinkLevel = params.thinkOnce ?? params.thinkOverride ?? params.persistedThinking;
	const resolvedVerboseLevel = params.verboseOverride ?? params.persistedVerbose ?? params.verboseDefault;
	assertAgentRunLifecycleGenerationCurrent(params.lifecycleGeneration);
	if (params.sessionKey || params.suppressVisibleSessionEffects) registerAgentRunContext(params.runId, {
		...params.sessionKey ? {
			sessionKey: params.sessionKey,
			sessionId: params.sessionId
		} : {},
		agentId: params.sessionAgentId,
		lifecycleGeneration: params.lifecycleGeneration,
		verboseLevel: resolvedVerboseLevel,
		isControlUiVisible: !params.suppressVisibleSessionEffects,
		projectSessionActive: !params.suppressVisibleSessionEffects
	});
	let sessionEntry = params.sessionEntry;
	const skillFilter = resolveEffectiveAgentSkillFilter(params.cfg, params.sessionAgentId);
	const currentSkillsSnapshot = sessionEntry?.skillsSnapshot;
	const [{ getRemoteSkillEligibility, resolveReusableWorkspaceSkillSnapshot }, { resolveNodeExecEligibility }] = await Promise.all([loadSkillsRuntime(), loadExecDefaultsRuntime()]);
	const nodeSkillsEligibility = resolveNodeExecEligibility({
		cfg: params.cfg,
		sessionEntry,
		sessionKey: params.sessionKey,
		agentId: params.sessionAgentId
	});
	const skillSnapshotState = resolveReusableWorkspaceSkillSnapshot({
		workspaceDir: params.workspaceDir,
		executionSkillsDir: params.executionSkillsDir,
		config: params.cfg,
		agentId: params.sessionAgentId,
		existingSnapshot: params.isNewSession ? void 0 : currentSkillsSnapshot,
		librarySelections: sessionEntry?.skillLibrarySelections,
		skillFilter,
		eligibility: {
			nodeSkills: nodeSkillsEligibility,
			remote: getRemoteSkillEligibility({ advertiseExecNode: nodeSkillsEligibility.canExec })
		},
		watch: params.watchSkills && params.opts.oneShotCliRun !== true,
		...params.pluginMetadataSnapshot ? { pluginMetadataSnapshot: params.pluginMetadataSnapshot } : {}
	});
	const needsSkillsSnapshot = params.isNewSession || !currentSkillsSnapshot || skillSnapshotState.shouldRefresh;
	const skillsSnapshot = skillSnapshotState.snapshot;
	if (skillsSnapshot && params.sessionStore && params.sessionKey && needsSkillsSnapshot && !params.suppressVisibleSessionEffects) {
		const now = Date.now();
		const current = sessionEntry ?? {
			sessionId: params.sessionId,
			updatedAt: now,
			sessionStartedAt: now
		};
		const next = {
			...current,
			sessionId: params.sessionId,
			updatedAt: now,
			sessionStartedAt: current.sessionStartedAt ?? now,
			skillsSnapshot
		};
		sessionEntry = await persistAgentSession({
			sessionStore: params.sessionStore,
			sessionKey: params.sessionKey,
			storePath: params.storePath,
			initialEntry: current,
			entry: next
		});
	}
	const shouldPersistInitialSessionTouch = params.opts.skipInitialSessionTouch !== true || Boolean(params.verboseOverride);
	if (params.sessionStore && params.sessionKey && !params.suppressVisibleSessionEffects && shouldPersistInitialSessionTouch) {
		const now = Date.now();
		const entry = params.sessionStore[params.sessionKey] ?? sessionEntry ?? {
			sessionId: params.sessionId,
			updatedAt: now,
			sessionStartedAt: now
		};
		const next = {
			...entry,
			sessionId: params.sessionId,
			updatedAt: now,
			sessionStartedAt: entry.sessionStartedAt ?? now,
			lastInteractionAt: now,
			agentStatus: void 0
		};
		applyVerboseOverride(next, params.verboseOverride);
		sessionEntry = await persistAgentSession({
			sessionStore: params.sessionStore,
			sessionKey: params.sessionKey,
			storePath: params.storePath,
			initialEntry: entry,
			entry: next
		});
	}
	if (params.sessionKey && !params.isSubagentLaneTurn) recordSessionHumanDirectMessage({
		sessionKey: params.sessionKey,
		entry: sessionEntry,
		agentId: params.sessionAgentId,
		actor: params.sessionStateActor,
		channel: params.opts.channel,
		runId: params.runId
	});
	return {
		sessionEntry,
		requestedThinkLevel,
		resolvedVerboseLevel,
		skillsSnapshot,
		runContext: resolveAgentRunContext(params.opts)
	};
}
//#endregion
//#region src/agents/agent-command.ts
const log = createSubsystemLogger("agents/agent-command");
async function agentCommandInternal(prepared, initialOpts, admissionIngress, runtime = defaultRuntime, deps, watchSkills = false) {
	const resolvedDeps = await resolveAgentCommandDeps(deps);
	const isRawModelRun = initialOpts.modelRun === true || initialOpts.promptMode === "none";
	const suppressVisibleSessionEffects = initialOpts.sessionEffects === "internal";
	const preserveUserFacingSessionModelState = initialOpts.preserveUserFacingSessionModelState === true;
	const lifecycleAbortController = new AbortController();
	const storedDeliveryMediaUrls = prepared.sessionEntry?.restartRecoveryDeliveryRunId === prepared.runId && Array.isArray(prepared.sessionEntry.restartRecoveryDeliveryMediaUrls) ? prepared.sessionEntry.restartRecoveryDeliveryMediaUrls : void 0;
	const preparedOpts = storedDeliveryMediaUrls !== void 0 ? {
		...prepared.opts,
		internalDeliveryMediaUrls: [...storedDeliveryMediaUrls],
		internalDeliverySuppressText: prepared.sessionEntry?.restartRecoverySuppressTextDelivery,
		sourceReplyDeliveryMode: prepared.sessionEntry?.restartRecoverySourceReplyDeliveryMode,
		disableMessageTool: prepared.sessionEntry?.restartRecoveryDisableMessageTool,
		forceRestartSafeTools: prepared.sessionEntry?.restartRecoveryForceSafeTools
	} : prepared.opts;
	if (preparedOpts.internalDeliverySuppressText === true && preparedOpts.internalDeliveryMediaUrls === void 0 || (preparedOpts.internalDeliveryMediaUrls !== void 0 || preparedOpts.internalDeliverySuppressText === true) && (preparedOpts.forceRestartSafeTools !== true || preparedOpts.disableMessageTool !== true || preparedOpts.sourceReplyDeliveryMode !== "automatic")) throw new Error("internal delivery media constraints require automatic delivery with restart-safe tools and no message tool");
	const compactionSessionIdReporter = createCompactionSessionIdReporter(prepared.sessionId, preparedOpts.onSessionIdChanged);
	let opts = {
		...preparedOpts,
		onSessionIdChanged: compactionSessionIdReporter.onSessionIdChanged,
		abortSignal: preparedOpts.abortSignal ? AbortSignal.any([preparedOpts.abortSignal, lifecycleAbortController.signal]) : lifecycleAbortController.signal
	};
	const { body, transcriptBody, cfg, configuredThinkingCatalog, agentCfg, thinkOverride, thinkOnce, verboseOverride, sessionId, sessionKey, sessionStore, storePath, isNewSession, persistedThinking, persistedVerbose, sessionAgentId, outboundSession, workspaceDir, cwd, runId, isSubagentLane, acpManager, acpResolution, pluginsEnabled, manifestMetadataSnapshot, modelManifestContext } = prepared;
	let lifecycleGeneration = opts.lifecycleGeneration ?? captureAgentRunLifecycleGeneration(runId);
	let sessionEntry = prepared.sessionEntry, runOwnedSessionId = sessionId;
	const sessionStateActor = classifySessionStateActor({
		inputProvenance: opts.inputProvenance,
		internalEvents: opts.internalEvents,
		sessionEffects: opts.sessionEffects
	});
	const isSubagentLaneTurn = normalizeOptionalString(opts.lane) === AGENT_LANE_SUBAGENT;
	let sessionReboundDuringRun = false;
	let trackedRestartRecoveryDeliveryClaim = false;
	let currentRunDeliveryContext;
	let restartRecoveryTerminalDeliveryEvidence;
	const preparedSessionId = sessionEntry?.sessionId;
	const { track: trackInternalModelRunTarget, cleanup: cleanupInternalModelRunTargets } = createInternalSessionEffectsCleanup({
		enabled: initialOpts.modelRun === true && suppressVisibleSessionEffects,
		agentId: sessionAgentId,
		runId,
		storePath,
		onError: (error) => {
			log.warn(`failed to remove model-run SQLite session: ${coerceErrorMessage(error)}`);
		}
	});
	let sessionWorkAdmission;
	let preparedRunAdmission;
	try {
		assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
		const sessionStoreRuntime = storePath && sessionKey ? await loadSessionStoreRuntime() : void 0;
		sessionWorkAdmission = await beginSessionWorkAdmission({
			scope: storePath ?? `agent:${sessionAgentId}`,
			identities: [sessionKey, sessionId],
			signal: opts.abortSignal,
			onInterrupt: () => lifecycleAbortController.abort(createAgentRunRestartAbortError()),
			assertAllowed: () => {
				const currentEntry = sessionStoreRuntime && storePath && sessionKey ? sessionStoreRuntime.loadSessionEntry({
					storePath,
					sessionKey,
					readConsistency: "latest"
				}) : sessionEntry;
				if (!currentEntry && preparedSessionId) throw createSessionWorkStartChangedError(sessionKey ?? sessionId);
				const matchesIntentionalRollover = isNewSession && currentEntry?.sessionId === preparedSessionId;
				if (currentEntry && currentEntry.sessionId !== sessionId && !matchesIntentionalRollover) throw createSessionWorkStartChangedError(sessionKey ?? sessionId);
				const archivedSessionError = resolveSessionWorkStartError(sessionKey ?? sessionId, currentEntry);
				if (archivedSessionError) throw new Error(archivedSessionError);
				sessionEntry = currentEntry;
				if (sessionStore && sessionKey) {
					if (currentEntry) sessionStore[sessionKey] = currentEntry;
					else delete sessionStore[sessionKey];
				}
			}
		});
		return await sessionWorkAdmission.run(async () => {
			preparedRunAdmission = prepareAgentCommandExecutionIdentity({
				opts,
				prepared,
				ingress: admissionIngress,
				lifecycleGeneration
			});
			if (sessionStore && sessionKey && !suppressVisibleSessionEffects) try {
				await repairPendingAssistantTranscriptTurns({ context: {
					sessionKey,
					sessionEntry,
					sessionStore,
					storePath,
					sessionAgentId,
					config: cfg
				} });
				sessionEntry = sessionStore[sessionKey] ?? sessionEntry;
			} catch (error) {
				if (!isNewSession) throw error;
				log.warn(`Could not repair predecessor transcript before session reset for ${sessionKey}: ${formatErrorMessage(error)}`);
			}
			if (opts.deliver === true) {
				if (resolveSendPolicy({
					cfg,
					entry: sessionEntry,
					sessionKey,
					channel: sessionDeliveryChannel(sessionEntry),
					chatType: sessionEntry?.chatType
				}) === "deny") throw new Error("send blocked by session policy");
			}
			if (!isRawModelRun && acpResolution?.kind === "stale") throw acpResolution.error;
			let currentRunDeliveryPrepared = false;
			const prepareDeliveryForRun = async (candidateSessionEntry) => {
				if (currentRunDeliveryPrepared || opts.deliver !== true) return;
				currentRunDeliveryPrepared = true;
				let preparedDelivery;
				try {
					preparedDelivery = await prepareCurrentRunDelivery({
						cfg,
						opts,
						agentId: sessionAgentId,
						currentSessionKey: sessionKey,
						sessionEntry: candidateSessionEntry
					});
				} catch (error) {
					if (opts.bestEffortDeliver !== true) throw error;
					log.warn(`delivery preflight failed; continuing model run with requested delivery intent because bestEffortDeliver is enabled: ${coerceErrorMessage(error)}`);
				}
				assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
				if (preparedDelivery) {
					currentRunDeliveryContext = preparedDelivery.context;
					opts = {
						...opts,
						replyChannel: preparedDelivery.context.channel,
						replyTo: preparedDelivery.context.to,
						replyAccountId: preparedDelivery.context.accountId,
						threadId: preparedDelivery.context.threadId,
						deliveryTargetMode: preparedDelivery.targetMode
					};
				}
			};
			if (sessionStore && sessionKey && !suppressVisibleSessionEffects && !isSubagentSessionKey(sessionKey)) {
				const now = Date.now();
				const currentStoreEntry = sessionStore[sessionKey];
				const allowCreateRestartRecoveryEntry = currentStoreEntry === void 0 && sessionEntry === void 0;
				const initialEntry = currentStoreEntry ?? sessionEntry ?? {
					sessionId,
					updatedAt: now,
					sessionStartedAt: now
				};
				const isSessionRollover = isNewSession && initialEntry.sessionId !== sessionId;
				const entry = isSessionRollover ? clearRotatedSessionMetadata(initialEntry) : initialEntry;
				await prepareDeliveryForRun(entry);
				const generatedMediaSourceRunId = opts.internalDeliveryMediaUrls !== void 0 && opts.inputProvenance?.kind === "inter_session" && isAgentMediatedCompletionSourceTool(opts.inputProvenance.sourceTool) ? runId : void 0;
				assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
				const next = {
					...entry,
					sessionId,
					updatedAt: now,
					sessionStartedAt: isSessionRollover ? now : entry.sessionStartedAt,
					lastInteractionAt: isSessionRollover ? now : entry.lastInteractionAt,
					...buildCurrentRunRestartRecoveryClaim({
						deliveryContext: currentRunDeliveryContext,
						deliveryMediaUrls: opts.internalDeliveryMediaUrls,
						disableMessageTool: opts.disableMessageTool,
						entry,
						forceRestartSafeTools: opts.forceRestartSafeTools,
						runId,
						sourceIngress: generatedMediaSourceRunId ? "internal" : void 0,
						sourceRunId: generatedMediaSourceRunId,
						sourceReplyDeliveryMode: opts.sourceReplyDeliveryMode,
						suppressTextDelivery: opts.internalDeliverySuppressText
					})
				};
				const persisted = await persistAgentSession({
					sessionStore,
					sessionKey,
					storePath,
					initialEntry,
					entry: next,
					shouldPersist: (current) => isSessionRollover ? current?.sessionId === initialEntry.sessionId : shouldPersistRestartRecoveryContextClaim(current, sessionId, runId, allowCreateRestartRecoveryEntry)
				});
				sessionEntry = persisted;
				trackedRestartRecoveryDeliveryClaim = persisted?.restartRecoveryDeliveryRunId === runId;
			}
			if (sessionEntry && sessionKey && !suppressVisibleSessionEffects) try {
				sessionEntry = await ensureSessionDiffBaseline({
					cwd: cwd ?? workspaceDir,
					entry: sessionEntry,
					isNewSession,
					sessionKey,
					storePath
				});
				if (sessionStore) sessionStore[sessionKey] = sessionEntry;
			} catch (error) {
				if (isSessionWorkStartInvalidatedError(error)) throw error;
				log.warn(`session diff baseline capture failed; continuing without attribution filtering: ${coerceErrorMessage(error)}`);
			}
			await prepareDeliveryForRun(sessionEntry);
			if (!isRawModelRun && acpResolution?.kind === "ready" && sessionKey) {
				assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
				return await runAcpAgentCommand({
					cfg,
					deps: resolvedDeps,
					runtime,
					opts,
					outboundSession,
					sessionEntry,
					sessionStore,
					body,
					transcriptBody,
					suppressVisibleSessionEffects,
					provenance: isSubagentLaneTurn ? "agent" : sessionStateActor.actorType,
					sessionAgentId,
					sessionId,
					sessionKey,
					storePath,
					workspaceDir,
					runId,
					lifecycleGeneration,
					acpManager,
					acpResolution,
					trackInternalModelRunTarget,
					preparedRunAdmission
				});
			}
			const embeddedSessionState = await measureAgentStartup("session-state", () => prepareEmbeddedSessionState({
				cfg,
				opts,
				sessionEntry,
				sessionStore,
				sessionKey,
				sessionId,
				storePath,
				sessionAgentId,
				lifecycleGeneration,
				runId,
				workspaceDir,
				executionSkillsDir: path.join(sessionEntry?.worktree?.canonicalWorkspaceDir ?? cwd ?? workspaceDir, "skills"),
				watchSkills,
				isNewSession,
				isSubagentLaneTurn,
				suppressVisibleSessionEffects,
				thinkOnce,
				thinkOverride,
				persistedThinking,
				verboseOverride,
				persistedVerbose,
				verboseDefault: agentCfg?.verboseDefault,
				sessionStateActor,
				...manifestMetadataSnapshot ? { pluginMetadataSnapshot: manifestMetadataSnapshot } : {}
			}), { config: cfg });
			sessionEntry = embeddedSessionState.sessionEntry;
			const { requestedThinkLevel, runContext } = embeddedSessionState;
			const modelSelection = await measureAgentStartup("model-selection", () => resolveEmbeddedModelSelection({
				cfg,
				opts,
				sessionEntry,
				sessionStore,
				sessionKey,
				sessionId,
				storePath,
				sessionAgentId,
				workspaceDir,
				pluginsEnabled,
				manifestMetadataSnapshot,
				modelManifestContext,
				configuredThinkingCatalog,
				requestedThinkLevel,
				thinkOverride,
				thinkOnce,
				isSubagentLane,
				suppressVisibleSessionEffects,
				runContext
			}), { config: cfg });
			sessionEntry = modelSelection.sessionEntry;
			const embeddedAttempt = await runEmbeddedAgentAttempt({
				prepared,
				opts,
				sessionEntry,
				lifecycleGeneration,
				onLifecycleGenerationChanged: (nextLifecycleGeneration) => {
					lifecycleGeneration = nextLifecycleGeneration;
				},
				onCompactionAccounting: (fact) => {
					if (fact.kind === "durable") {
						runOwnedSessionId = fact.target.sessionId;
						if (fact.previousSessionId !== void 0) compactionSessionIdReporter.onCompactionCommitted(fact.target.sessionId);
					}
				},
				suppressVisibleSessionEffects,
				preserveUserFacingSessionModelState,
				modelSelection,
				embeddedSessionState,
				trackInternalModelRunTarget,
				preparedRunAdmission
			});
			if (embeddedAttempt.fallbackExhausted) opts.onModelFallbackExhausted?.();
			sessionEntry = embeddedAttempt.sessionEntry;
			lifecycleGeneration = embeddedAttempt.lifecycleGeneration;
			const finalized = await finalizeEmbeddedAgentCommand({
				prepared,
				opts,
				deps: resolvedDeps,
				runtime,
				sessionEntry,
				attempt: embeddedAttempt,
				embeddedSessionState,
				suppressVisibleSessionEffects,
				preserveUserFacingSessionModelState,
				currentRunDeliveryContext,
				sessionOwnership: {
					runOwnedSessionId,
					sessionReboundDuringRun
				},
				trackInternalModelRunTarget,
				onSessionOwnershipChanged: (ownership, committedCompactionSessionId) => {
					runOwnedSessionId = ownership.runOwnedSessionId;
					sessionReboundDuringRun = ownership.sessionReboundDuringRun;
					compactionSessionIdReporter.onCompactionCommitted(committedCompactionSessionId);
				},
				onTerminalDeliveryEvidenceChanged: (evidence) => {
					restartRecoveryTerminalDeliveryEvidence = evidence;
				}
			});
			sessionEntry = finalized.sessionEntry;
			runOwnedSessionId = finalized.runOwnedSessionId;
			sessionReboundDuringRun = finalized.sessionReboundDuringRun;
			return finalized.deliveryResult;
		});
	} finally {
		compactionSessionIdReporter.reportCommitted();
		await preparedRunAdmission?.finish();
		sessionWorkAdmission?.release();
		await cleanupInternalModelRunTargets();
		if (!sessionReboundDuringRun && trackedRestartRecoveryDeliveryClaim && sessionStore && sessionKey) try {
			const entry = sessionStore[sessionKey] ?? sessionEntry;
			if (entry?.restartRecoveryDeliveryRunId === runId) sessionEntry = await persistAgentSession({
				sessionStore,
				sessionKey,
				storePath,
				initialEntry: entry,
				entry: {
					...entry,
					...buildRestartRecoveryClaimCleanupPatch({
						entry,
						recordTerminalSource: true,
						terminalRunId: runId,
						terminalDeliveryEvidence: restartRecoveryTerminalDeliveryEvidence
					}),
					...buildMainSessionRecoveryClearPatch(entry),
					updatedAt: Date.now()
				},
				shouldPersist: (current) => shouldPersistRestartRecoveryCleanup(current, runOwnedSessionId, runId)
			});
		} catch (error) {
			log.warn(`failed to clear restart recovery delivery context for ${sessionKey}: ${coerceErrorMessage(error)}`);
		}
		clearAgentRunContext(runId, lifecycleGeneration);
	}
}
async function agentCommandWithAdmissionIngress(opts, admissionIngress, runtime = defaultRuntime, deps) {
	return await runLocalAgentCommand({
		opts,
		runtime,
		deps,
		operatorAuthority: admissionIngress.kind === "local-cli",
		run: async (prepared, resolvedDeps) => await agentCommandInternal(prepared, prepared.opts, admissionIngress, runtime, resolvedDeps)
	});
}
async function agentCommand(opts, runtime = defaultRuntime, deps) {
	const { localIngress } = executionIdentity;
	return await agentCommandWithAdmissionIngress(opts, localIngress, runtime, deps);
}
async function agentCommandFromSystem(opts, admission, runtime = defaultRuntime, deps) {
	return await agentCommandWithAdmissionIngress(opts, executionIdentity.systemIngress(admission.boundary), runtime, deps);
}
async function agentCommandFromIngressInternal(opts, runtime = defaultRuntime, deps, recovery, runtimeContext) {
	if (typeof opts.allowModelOverride !== "boolean") throw new Error("allowModelOverride must be explicitly set for ingress agent runs.");
	const lifecycleGeneration = opts.lifecycleGeneration ?? captureAgentRunLifecycleGeneration(opts.runId ?? "");
	const generation = runtimeContext?.pluginGeneration;
	const executeIngress = () => withAgentRunLifecycleGeneration(lifecycleGeneration, async () => {
		let preparedAgentDir;
		const result = await runWithAgentCommandRecoveryOwner({
			lifecycleGeneration,
			mode: "claim",
			opts: {
				...opts,
				lifecycleGeneration,
				senderIsOwner: opts.senderIsOwner === true
			},
			prepare: async (preparedOpts) => await prepareAgentCommandExecution(preparedOpts, runtime, runtimeContext),
			restoreAdmittedRecovery: recovery?.restoreAdmittedRecovery,
			run: async (prepared) => {
				preparedAgentDir = prepared.agentDir;
				const run = async () => await agentCommandInternal(prepared, prepared.opts, {
					kind: "api",
					boundary: "agent-command.from-ingress",
					state: "unknown"
				}, runtime, deps, true);
				return generation ? await run() : await withAgentPluginRegistry({
					config: prepared.cfg,
					workspaceDir: prepared.workspaceDir,
					run
				});
			}
		});
		if (result && preparedAgentDir) emitIngressModelUsageDiagnostic(result, opts, preparedAgentDir);
		return result;
	});
	return generation && runtimeContext ? await withPluginRuntimeGenerationScope({
		metadataSnapshot: generation.pluginMetadataSnapshot,
		pluginRegistry: generation.pluginRegistry
	}, executeIngress) : await executeIngress();
}
/** Runs an agent turn from an inbound channel/gateway ingress context. */
async function agentCommandFromIngress(opts, runtime = defaultRuntime, deps) {
	return await agentCommandFromIngressInternal(sanitizePublicAgentCommandIngressOpts(opts), runtime, deps);
}
/** Internal Gateway entrypoint that restores a rejected restart-recovery admission. */
async function agentCommandFromGatewayIngress(opts, runtime, deps, recovery, runtimeContext) {
	return await agentCommandFromIngressInternal(opts, runtime, deps, recovery, runtimeContext);
}
//#endregion
export { agentCommandFromSystem as i, agentCommandFromGatewayIngress as n, agentCommandFromIngress as r, agentCommand as t };
