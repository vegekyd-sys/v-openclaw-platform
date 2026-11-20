import { g as isFutureDateTimestampMs, j as resolveIntegerOption, w as parseStrictPositiveInteger } from "./number-coercion-CLj0HTDM.js";
import "./src-vebZIeLe.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { n as createLazyPromise, r as createLazyPromiseLoader } from "./lazy-promise-DGqyc4Y4.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { n as isVitestRuntimeEnv } from "./test-runtime-env-DQDRzsLt.js";
import { n as isTruthyEnvValue, r as logAcceptedEnvOption } from "./env-UY9MQ9LW.js";
import { c as readConfigFileSnapshotForRuntimeTransaction, g as registerConfigWriteListener, i as promoteConfigSnapshotToLastKnownGood, n as getRuntimeConfig, s as readConfigFileSnapshot, w as captureConfigOverrideApplier } from "./io.runtime-CKu7Rw0j.js";
import { n as isErrno } from "./errno-CkbDOfLk.js";
import { a as isWithinDir } from "./path-safety-Bi0ppMWC.js";
import "./utils-D3A1hGii.js";
import { t as sleep } from "./sleep-D7nua6TP.js";
import { d as isSecretRef } from "./types.secrets-kC0nOetj.js";
import { c as isNixMode, l as normalizeStateDirEnv, w as resolveStateDir } from "./paths-Dx1CjxA5.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { r as applyLoggingConfig } from "./logger-Dj_CBJHF.js";
import { N as runWithDiagnosticTraceContext, f as isDiagnosticsEnabled, w as createDiagnosticTraceContext, y as setDiagnosticsEnabledForProcess } from "./diagnostic-events-D_BPObBj.js";
import { r as runtimeForLogger, t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { i as getGatewayPluginMetadataSnapshot } from "./current-plugin-metadata-state-B1UoAr4G.js";
import { n as registerPluginMetadataProcessMemoLifecycleClear, r as retainGatewayPluginMetadata } from "./plugin-metadata-lifecycle-C6m-q5Au.js";
import { l as resolveRuntimeServiceVersion } from "./version-CAQhhGAu.js";
import { _ as resolveDatabasePath, o as openClawStateDatabaseCache } from "./openclaw-state-db-cache-AunrvrzG.js";
import { o as resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { m as assertOpenClawStateWriteAllowedAtPath } from "./openclaw-state-db-Bh3Bq87y.js";
import { o as sha256HexPrefixCore } from "./crypto-digest-IGAbV2KW.js";
import { t as createDeferredCore } from "./deferred-D0La5CRk.js";
import { _ as runHttpConnectionRequest } from "./http-body-C8wtGPZr.js";
import { a as setGatewayPluginMetadataSnapshot } from "./current-plugin-metadata-snapshot-BqMIdsHK.js";
import { t as completePluginMetadataSnapshot } from "./plugin-metadata-snapshot-BuNx7zRZ.js";
import { n as ensureControlUiAllowedOriginsForNonLoopbackBind } from "./gateway-control-ui-origins-Dg5h8BhY.js";
import { d as prepareConfigRuntimeEnv, l as initializePublishedConfigRuntimeEnv, r as collectConfigRuntimeEnvOwnership } from "./config-env-vars-COpg5tHQ.js";
import { n as copyConfigResolutionFacts, r as copyConfigResolutionFactsExcept } from "./resolution-facts-Dks1tbik.js";
import { C as setAppliedRuntimeConfigSnapshot, c as getRuntimeConfigSourceSnapshot } from "./runtime-snapshot-BVoUH4MI.js";
import { C as assertGatewayConfigEnvSelectionUnchanged } from "./io.read-helpers-KfhJP4_w.js";
import { a as READ_SCOPE, i as QUESTIONS_SCOPE, n as APPROVALS_SCOPE, o as TALK_SCOPE, r as PAIRING_SCOPE, t as ADMIN_SCOPE } from "./operator-scopes-Dw7Gu2cA.js";
import { a as hasGatewayClientCap, t as GATEWAY_CLIENT_CAPS } from "./client-info-B1bPgeKr.js";
import { t as KeyedAsyncQueue } from "./keyed-async-queue-CTreGrmR.js";
import "./io-Des9Xfzj.js";
import "./config-Cv60gBux.js";
import { t as GatewayLockError } from "./gateway-lock-DnUZuWOM.js";
import { o as purgeExpiredSecretStoreEntries } from "./secret-store-CZM8IBOD.js";
import { t as isContainerEnvironment } from "./container-environment-CNsJSTpY.js";
import { _ as resolveGatewayListenHosts, r as isLocalDirectRequest, s as isLoopbackHost } from "./net-CLIrL_-C.js";
import { f as buildRateLimitIdentityKey, p as createAuthRateLimiter, s as AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL, u as AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION } from "./auth-rate-limit-Dmj7HxbF.js";
import { a as prepareGatewayIngressAttribution, i as markGatewayIngressTransport, n as PROXY_ATTRIBUTION_REQUIRED_REASON, o as readPreparedGatewayIngressAttribution, r as createGatewayUnattributableProxyReporter, t as PROXY_ATTRIBUTION_GUIDANCE } from "./ingress-attribution-CFC44c07.js";
import { n as resolveGatewayAuth } from "./auth-resolve-n1Ctyh5X.js";
import { n as authorizeHttpGatewayConnect } from "./auth-BIfLTVzA.js";
import { n as isRestartEnabled } from "./commands.flags-CZN5Wwe1.js";
import { n as loadGatewayTlsServerRuntime } from "./gateway-BI_AI0Q_.js";
import { i as listLoadedChannelPlugins, n as getLoadedChannelPluginEntryById } from "./registry-loaded-CWEKVWPu.js";
import { d as isCoreGatewayMethodClassified, l as STARTUP_UNAVAILABLE_GATEWAY_METHODS, m as listCoreGatewayMethodNames, u as createCoreGatewayMethodDescriptors } from "./method-scopes-C3BvHJ95.js";
import { a as getActiveGatewayRootWorkCount, c as getGatewaySuspendAdmissionPhase, f as isGatewayWorkAdmissionClosed, u as isGatewayRestartDraining } from "./gateway-work-admission-3tn4Qiws.js";
import { m as setPreRestartDeferralCheck, p as setGatewaySigusr1RestartPolicy } from "./restart-BXbZs7-w.js";
import { r as readGatewayRestartHandoffSync } from "./restart-handoff-D1svyFl-.js";
import { i as tryLoadActivatedBundledPluginPublicSurfaceModule } from "./facade-runtime-CNDGpPZj.js";
import { a as enqueueSystemEvent, h as withSystemEventOwner } from "./system-events-GfU3KOHp.js";
import { t as isBrowserCopilotClient } from "./message-channel-BGKf9KPa.js";
import { i as MAX_BUFFERED_BYTES, o as MAX_PREAUTH_PAYLOAD_BYTES } from "./server-constants-BW5URgqP.js";
import { c as isTranscriptOnlyOpenClawAssistantMessage } from "./transcript-only-openclaw-assistant-DPLRJnG4.js";
import { c as resolveSystemMainSessionTarget } from "./main-session-TZQkcBLs.js";
import { C as getUserPreferences, s as resolveUserProfileId } from "./user-profiles-ftXkbNlK.js";
import { m as stopDiagnosticHeartbeat, p as startDiagnosticHeartbeat } from "./diagnostic-CN79G-MT.js";
import { f as resolveCronJobsStorePathFromConfig } from "./store-vWBHfJUH.js";
import { c as resolveControlUiRootSync, i as isPackageProvenControlUiRootSync, n as ensureControlUiAssetsBuilt, r as isControlUiStartupAssetsReady, s as resolveControlUiRootOverrideSync } from "./control-ui-assets-6tBpRcAU.js";
import { s as getActiveBackgroundExecSessionCount } from "./bash-process-registry-BIq3VUFD.js";
import { i as resolveActiveEmbeddedRunSessionId, t as getActiveEmbeddedRunCount } from "./active-run-projections-rkNbMELs.js";
import { t as getTotalPendingReplies } from "./dispatcher-registry-B2AzyUtN.js";
import { r as getActiveCronJobCount } from "./active-jobs-BKloUR4E.js";
import { s as getTotalQueueSize, u as isGatewayDraining } from "./command-queue-oRD7ZANz.js";
import "./sessions-eI69vxPt.js";
import { t as createAgentRuntimeApprovalAuthorityValidator } from "./agent-runtime-identity-token-tbYOQmt6.js";
import { a as decodeSandboxHostCsp, i as buildSandboxHostProxyHtml, n as buildSandboxHostContentSecurityPolicy, s as resolveSandboxHostPort } from "./sandbox-host-B7OZY_3w.js";
import "./node-desktop-stream-BZM2AiRA.js";
import { a as parseControlUiResourcePath, o as parseControlUiUserAvatarPath } from "./control-ui-contract-CgrOMhfo.js";
import { i as withCoreCanvasNodeCapability, n as isCanvasDocumentHttpPath, r as resolveCanvasNodeCapability } from "./constants-Cm4bJJ1Q.js";
import { i as isControlUiPluginManagerRequest, n as isControlUiApprovalDocumentPath, r as isControlUiFocusDocumentPath } from "./control-ui-routing-BSMukCN-.js";
import { r as prepareGatewayAgentCliShim, t as clearGatewayAgentCliShim } from "./openclaw-cli-shim-Bxbg8ch1.js";
import { a as getActiveSecretsRuntimeConfigSnapshot, r as clearSecretsRuntimeSnapshotState } from "./runtime-state-BoJn6Ddu.js";
import { t as isCoreCanvasHostEnabled } from "./config-CNM2FIj9.js";
import { n as fenceSessionSuspensionWritesForGatewayShutdown } from "./session-suspension-CB3NOJMt.js";
import { a as createSessionMessageSubscriberRegistry, i as createSessionEventSubscriberRegistry, r as createChatRunState } from "./server-chat-state-KjZAS9Bd.js";
import { d as resumeGatewayRestartTraceFromHandoff, i as finishGatewayRestartTrace, n as collectGatewayProcessMemoryUsageMb, u as resumeGatewayRestartTraceFromEnv } from "./restart-trace-DML9AJwA.js";
import { i as upsertPresence } from "./system-presence-5HkHkZCv.js";
import { c as removeRemoteNodeInfoForConnection, i as recordRemoteNodeInfo, s as removeRemoteNodeInfo } from "./remote-CiV-Qx_e.js";
import { f as requestNodePairing, p as reusePendingNodePairingForReconnect, r as finalizeNodePairingCleanupClaim } from "./device-pairing-node-C4odYxnS.js";
import { t as createDefaultDeps } from "./deps-h2-GHgff.js";
import { n as logRejectedLargePayload } from "./diagnostic-payload-97JaXMk1.js";
import { r as registerGatewayModelCatalogPrivateAccess } from "./server-model-catalog-auth-DCNJBYb7.js";
import { c as normalizePluginNodeCapabilityScopedUrl } from "./plugin-node-capability-Ce1WKsgy.js";
import { n as logWs, r as summarizeAgentEventForWsLog } from "./ws-log-CFwaDvs6.js";
import { n as mergeGatewayAuthConfig, r as mergeGatewayTailscaleConfig } from "./startup-auth-CJaBITID.js";
import { t as ensureOpenClawCliOnPath } from "./path-env-D7jxSL_0.js";
import { u as revokeAttachGrantsForSession } from "./mcp-grant-store-CokwJWGU.js";
import { a as resolvePluginRoutePathContext, i as isProtectedPluginRoutePathFromContext, t as findMatchingPluginHttpRoutes } from "./route-match-Vz3WZJuX.js";
import { a as sendGatewayAuthFailure, f as setDefaultSecurityHeaders, n as finishFailedGatewayHttpResponse, v as respondNotFound, y as respondPlainText } from "./http-common-PerMKXgg.js";
import { t as resolveSharedGatewaySessionGeneration } from "./ws-shared-generation-Wt672rYh.js";
import { t as canReceiveSessionEvent } from "./session-sharing-BlMqwMBH.js";
import { n as queuePluginSessionsChanged } from "./gateway-events-BmI3R81H.js";
import { n as resolveAssistantAgentId } from "./assistant-identity-AcSLp8Kz.js";
import { n as installActiveGitHubOAuthLifecycle, t as createGitHubOAuthLifecycle } from "./github-oauth-lifecycle-bUiGN17f.js";
import { a as classifyMcpAppStandalonePath, c as classifyWorkerBootstrapArtifactTransferPath, i as classifyGatewayProbePath, l as classifyWorkerGatewayPath, o as classifyNodeWorkerBundleTransferPath, s as classifyNodeWorkspaceTransferPath } from "./gateway-http-route-contracts-jBtizxKU.js";
import { n as parseDevicePairingJoinRequestPath } from "./join-code-B_OfdZ-j.js";
import { n as DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS, r as evaluateChannelHealth, t as DEFAULT_CHANNEL_CONNECT_GRACE_MS } from "./channel-health-policy-D20awG2O.js";
import { n as createGatewayMethodRegistry, r as createPluginGatewayMethodDescriptors, t as createGatewayMethodDescriptorsFromHandlers } from "./registry-BagSHJEt.js";
import { t as isTerminalConfigEnabled } from "./enabled-BSjeiWpO.js";
import { n as resolveGatewayReloadPluginActivationCandidate, r as resolveGatewayStartupPluginActivationConfig, t as mergeActivationSectionsIntoRuntimeConfig } from "./plugin-activation-runtime-config-BzfukVs6.js";
import { A as resolveEffectiveWebPushPreferences, E as isWebPushQuietHours, M as webPushCategoryEnabled, O as normalizeWebPushDisplayLabel, T as WEB_PUSH_USER_PREFERENCES_KEY, j as webPushAgentAllowed, m as listBoundWebPushSubscriptions } from "./push-web-store-DODsgiW4.js";
import { r as prepareWebPushNotificationSender } from "./push-web-B2-JnTu_.js";
import { n as webPushTargetClient, t as listCurrentWebPushTargets } from "./web-push-authority-VCNU-I_u.js";
import { a as enforceSharedGatewaySessionGenerationForConfigWrite, s as getRequiredSharedGatewaySessionGeneration } from "./server-shared-auth-generation-BKVola-Y.js";
import { r as waitForMediaCleanupDrains, t as MEDIA_CLEANUP_STOP_TIMEOUT_MS } from "./server-media-cleanup-lifecycle-dOPPbnLL.js";
import { n as GATEWAY_EVENT_NODE_RUNNER_INVENTORY_CHANGED, t as GATEWAY_EVENT_DEVICE_PAIR_CHANGED } from "./events-D_8lxFnu.js";
import { t as createPresenceRecipientProjection } from "./presence-projection-CehrEX_V.js";
import { a as incrementPresenceVersion, i as getPresenceVersion, n as getHealthCache, o as refreshGatewayHealthSnapshot, r as getHealthVersion } from "./health-state-D1_igxji.js";
import { t as resolveGatewayPluginConfig } from "./runtime-plugin-config-0kjRXRpP.js";
import { t as createControlUiSessionPullRequestSubscriptions } from "./control-ui-session-pr-subscriptions-Doxnb684.js";
import { i as clearNodeWakeState } from "./node-wake-state-CWVR-GCk.js";
import { t as resolveGrantExpiryDaysConfig } from "./standing-grant-expiry-config-CqUe6ux8.js";
import { t as broadcastPresenceSnapshot } from "./presence-events-CEhzyB_2.js";
import { n as applyGatewayLaneConcurrency, r as resolveGatewayLaneConcurrency, t as resolveHookClientIpConfig } from "./hook-client-ip-config-xij_RBMo.js";
import { t as createNoopHeartbeatRunner } from "./server-runtime-service-shared-iwns63ly.js";
import { t as recordClientPresenceActivity } from "./client-presence-CJ81NcaF.js";
import { t as disposeNodeConnectionNotifications } from "./node-connection-notifications-DXD2BWvh.js";
import { r as createDesktopSessionRegistry } from "./session-registry-_fMvmmii.js";
import { t as createGatewayStartupTrace } from "./server-startup-trace-h4U5enU8.js";
import { i as runWithGatewayHttpWorkAdmission, o as writeGatewayUpgradeServiceUnavailable, r as shouldEnforceGatewayAuthForPluginPath, t as isPluginAuthenticatedRoutePath } from "./route-auth-kw1skDb9.js";
import { n as handleNodeWorkerBundleTransferHttpRequest } from "./node-worker-bundle-transfer-http-DihAcqj2.js";
import { n as handleNodeWorkspaceTransferHttpRequest } from "./node-workspace-transfer-http-D1Tnl1lW.js";
import { n as handleWorkerBootstrapArtifactTransferHttpRequest } from "./worker-bootstrap-artifact-transfer-http-bgEnKW0j.js";
import { i as markPublicWorkerIngress, t as GATEWAY_WS_CONNECTION_KIND_PROPERTY } from "./ws-types-099MIJxx.js";
import { t as findMatchingPluginNodeCapabilityRoute } from "./route-capability-BPxapSf3.js";
import { t as GATEWAY_EVENTS } from "./server-methods-list-BxoOZlEM.js";
import { t as beginMacOSSystemCaWarmupOnce } from "./system-ca-warmup-CvzcuIrF.js";
import { createRequire } from "node:module";
import fs, { constants } from "node:fs";
import path from "node:path";
import fs$1 from "node:fs/promises";
import net from "node:net";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { createServer as createServer$1, request } from "node:http";
import { createServer as createServer$2 } from "node:https";
//#region src/gateway/channel-thaw-restart.ts
function snapshotRunningTargets(manager) {
	return Object.entries(manager.getRuntimeSnapshot().channelAccounts).flatMap(([channelId, accounts]) => Object.entries(accounts ?? {}).filter(([, status]) => status?.running === true).map(([accountId]) => ({
		channelId,
		accountId
	})));
}
function dedupeTargets(targets) {
	const seen = /* @__PURE__ */ new Set();
	return targets.filter((target) => {
		const key = `${target.channelId}:${target.accountId}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
/**
* Restarts every running, non-manually-stopped channel account after a host
* thaw. Dead sockets from a freeze otherwise wait for the slow health sweep.
*/
async function restartRunningChannelAccounts(manager, opts, selection = { kind: "new-thaw" }) {
	const targets = selection.kind === "new-thaw" ? dedupeTargets([...selection.pendingTargets ?? [], ...snapshotRunningTargets(manager)]) : [...selection.targets];
	const failedTargets = [];
	for (const [index, target] of targets.entries()) {
		const { channelId, accountId } = target;
		if (manager.isManuallyStopped(channelId, accountId)) continue;
		if (!opts.shouldContinue()) return [...failedTargets, ...targets.slice(index)];
		try {
			let current = manager.getRuntimeSnapshot().channelAccounts[channelId]?.[accountId];
			if (!current) continue;
			await manager.stopChannel(channelId, accountId, { manual: false });
			if (!opts.shouldContinue()) return [
				...failedTargets,
				target,
				...targets.slice(index + 1)
			];
			current = manager.getRuntimeSnapshot().channelAccounts[channelId]?.[accountId];
			if (!current) continue;
			let startOutcomes = await manager.startChannel(channelId, accountId, { preserveManualStop: true });
			let startOutcome = startOutcomes.get(accountId);
			let restarted = manager.getRuntimeSnapshot().channelAccounts[channelId]?.[accountId];
			if (startOutcome?.status === "retry" && restarted?.restartPending === true) {
				startOutcomes = await manager.startChannel(channelId, accountId, { preserveManualStop: true });
				startOutcome = startOutcomes.get(accountId);
				restarted = manager.getRuntimeSnapshot().channelAccounts[channelId]?.[accountId];
			}
			if (startOutcome?.status === "retry") {
				failedTargets.push(target);
				opts.onError(`[${channelId}:${accountId}] host-thaw restart failed: replacement was not handed off (${startOutcome.reason})${restarted?.lastError ? `: ${restarted.lastError}` : ""}`);
			}
		} catch (error) {
			failedTargets.push(target);
			opts.onError(`[${channelId}:${accountId}] host-thaw restart failed: ${String(error)}`);
		}
		if (!opts.shouldContinue()) return [...failedTargets, ...targets.slice(index + 1)];
	}
	return failedTargets;
}
//#endregion
//#region src/gateway/server-core-runtime.ts
const listGatewayStartupChannelPlugins$1 = () => listLoadedChannelPlugins();
const MAX_MEDIA_TTL_HOURS = 168;
function resolveMediaCleanupTtlMs(ttlHoursRaw) {
	const ttlMs = Math.min(Math.max(ttlHoursRaw, 1), MAX_MEDIA_TTL_HOURS) * 60 * 6e4;
	if (!Number.isFinite(ttlMs) || !Number.isSafeInteger(ttlMs)) throw new Error(`Invalid media.ttlHours: ${String(ttlHoursRaw)}`);
	return ttlMs;
}
function approvalRequestTargetsSession(request, sessionKeys, sessionId) {
	if (typeof request !== "object" || request === null) return false;
	const record = request;
	return typeof record.sessionId === "string" && record.sessionId === sessionId || typeof record.sessionKey === "string" && sessionKeys.has(record.sessionKey);
}
async function startGatewayCoreRuntime(input) {
	const { lifecycleRuntime: runtime, port, log, logDiscovery, logHealth, logChannels, loadGatewayStartupEarlyModule, loadGatewayPluginBootstrapModule, loadGatewayModelCatalog, loadGatewayModelCatalogSnapshot, readPreparedGatewayModelCatalog } = input;
	const { minimalTestGateway, cfgAtStart, gatewayTls, bindHost, tailscaleMode, nodeRegistry, pluginRuntime, broadcast, nodeSendToAllSubscribed, refreshGatewayHealthSnapshotWithRuntime, dedupe, chatAbortControllers, chatQueuedTurns, restartRecoveryCandidates, chatRunState, removeChatRun, agentRunSeq, nodeSendToSession, runtimeState, kernel, startupTrace, channelManager, readinessEventLoopHealth, workerDispatchAuthority, clients, sharedGatewaySessionGenerationState, resolveSharedGatewaySessionGenerationForConfig, sessionMessageSubscribers, sessionEventSubscribers, toolEventRecipients, broadcastToConnIds, terminalSessions, controlUiBasePath, workerEnvironmentService, workerPlacementDispatchAvailable, workerPlacementControlAvailable, workerDesktopObserveAvailable, desktopObserveAvailable, desktopSessionRegistry, listStartupChannelGatewayMethods, coreGatewayMethodNames, pluginHostServices, baseMethods, pluginWorkspaceDir, ambientEnvTriggers, resolvePluginGatewayContext, workerEnvironmentStartup, broadcastPluginEvent, activateRuntimeSecrets } = runtime;
	const pluginMetadataSnapshot = runtime.pluginMetadataSnapshot;
	if (desktopSessionRegistry) kernel.addGatewayLifetimeSidecar({ stop: () => desktopSessionRegistry.stopAll() });
	const secretEgressProxy = cfgAtStart.secrets?.egressProxy?.enabled === true ? await import("./runtime-Cy2RRq4n.js").then((egressRuntime) => egressRuntime.startGatewaySecretEgressProxy({
		...cfgAtStart.secrets?.egressProxy?.allowedHosts !== void 0 ? { allowedHosts: cfgAtStart.secrets.egressProxy.allowedHosts } : {},
		...cfgAtStart.secrets?.egressProxy?.bypassHosts ? { bypassHosts: cfgAtStart.secrets.egressProxy.bypassHosts } : {}
	})) : void 0;
	if (secretEgressProxy) kernel.addGatewayLifetimeSidecar(secretEgressProxy);
	let pendingThawRestartTargets;
	let earlyRuntimePromise;
	const startEarlyRuntime = () => earlyRuntimePromise ??= startupTrace.measure("runtime.early", () => loadGatewayStartupEarlyModule().then(({ startGatewayEarlyRuntime }) => startGatewayEarlyRuntime({
		minimalTestGateway,
		cfgAtStart,
		port,
		gatewayTls,
		gatewayDirectReachable: !isLoopbackHost(bindHost),
		tailscaleMode,
		log,
		logDiscovery,
		nodeRegistry,
		swapBonjourStop: kernel.swapBonjourStop,
		pluginRegistry: pluginRuntime.registry,
		broadcast,
		nodeSendToAllSubscribed,
		getPresenceVersion,
		getHealthVersion,
		refreshGatewayHealthSnapshot: refreshGatewayHealthSnapshotWithRuntime,
		restartRunningChannels: async (mode, shouldContinue = () => !isGatewayWorkAdmissionClosed()) => {
			const failedTargets = await restartRunningChannelAccounts(channelManager, {
				shouldContinue,
				onError: (message) => logHealth.error(message)
			}, mode === "new-thaw" || pendingThawRestartTargets === void 0 ? {
				kind: "new-thaw",
				pendingTargets: pendingThawRestartTargets
			} : {
				kind: "deferred-retry",
				targets: pendingThawRestartTargets
			});
			pendingThawRestartTargets = failedTargets.length > 0 ? failedTargets : void 0;
			return failedTargets.length === 0;
		},
		refreshPresence: () => broadcastPresenceSnapshot({
			broadcast,
			incrementPresenceVersion,
			getHealthVersion
		}),
		resetEventLoopHealth: readinessEventLoopHealth.reset,
		logHealth,
		dedupe,
		chatAbortControllers,
		chatQueuedTurns,
		restartRecoveryCandidates,
		chatRunState,
		removeChatRun,
		agentRunSeq,
		nodeSendToSession,
		...typeof cfgAtStart.attachments?.ttlHours === "number" ? { mediaCleanupTtlMs: resolveMediaCleanupTtlMs(cfgAtStart.attachments.ttlHours) } : {},
		skillsRefreshDelayMs: runtimeState.skillsRefreshDelayMs,
		getSkillsRefreshTimer: () => runtimeState.skillsRefreshTimer,
		setSkillsRefreshTimer: (timer) => {
			runtimeState.skillsRefreshTimer = timer;
		},
		getRuntimeConfig,
		startupTrace
	}))).then((earlyRuntime) => {
		kernel.setEarlyRuntimeHandles(earlyRuntime);
		return earlyRuntime;
	});
	const [{ startGatewayEventSubscriptions }, { startGatewayChannelHealthMonitor }] = await startupTrace.measure("runtime.post-early-imports", () => Promise.all([import("./server-runtime-subscriptions-DBC0HRs-.js"), import("./server-runtime-startup-services-D7d6opsj.js")]));
	const { sessionCompanion, sessionObserver, ...runtimeSubscriptionUnsubs } = await startupTrace.measure("runtime.subscriptions", () => startGatewayEventSubscriptions({
		log,
		broadcast,
		broadcastToConnIds,
		nodeSendToSession,
		agentRunSeq,
		chatRunState,
		toolEventRecipients,
		sessionEventSubscribers,
		sessionMessageSubscribers,
		chatAbortControllers,
		restartRecoveryCandidates,
		terminalSessions
	}));
	Object.assign(runtimeState, runtimeSubscriptionUnsubs);
	await startupTrace.measure("runtime.services", () => kernel.setChannelHealthMonitor(startGatewayChannelHealthMonitor({ channelManager })));
	const { createOperatorApprovalSessionEventRuntime } = await import("./operator-approval-session-events-BH_n-lnF.js");
	const approvalManagersForReplay = /* @__PURE__ */ new Map();
	const approvalSessionEvents = createOperatorApprovalSessionEventRuntime({
		clients,
		sessionMessageSubscribers,
		broadcastToConnIds,
		controlUiBasePath,
		reconcileTerminal: (record) => {
			return approvalManagersForReplay.get(record.kind)?.reconcileDurableTerminal(record) ?? false;
		}
	});
	const validateAgentRuntimeApprovalAuthority = createAgentRuntimeApprovalAuthorityValidator(workerEnvironmentStartup?.placementStore);
	const { execApprovalManager, questionManager, cancelRunBoundApprovals, forwardPluginApprovalRequest, approvalWebPushDelivery, pluginApprovalIosPushDelivery, pluginApprovalManager, placementStandingGrants, systemAgentApprovalManager, bindApprovalPublicationContext, unregisterApprovalAuthorityObserver, extraHandlers, coreGatewayHandlers } = await startupTrace.measure("gateway.handlers", async () => {
		const [{ createGatewayAuxHandlers }, { coreGatewayHandlers: coreGatewayHandlersLocal }] = await Promise.all([import("./server-aux-handlers-BFfgn6Vp.js"), import("./server-methods-CBcm6UgT.js")]);
		return {
			...createGatewayAuxHandlers({
				log,
				chatAbortControllers,
				hasRunAbortMarker: (runId) => chatRunState.hasAbortMarker(runId),
				resolveGrantDefaultExpiresAtMs: (nowMs) => {
					const days = resolveGrantExpiryDaysConfig(getRuntimeConfig());
					return days !== null ? nowMs + days * 864e5 : null;
				},
				activateRuntimeSecrets,
				sharedGatewaySessionGenerationState,
				resolveSharedGatewaySessionGenerationForConfig,
				clients,
				channelManager,
				getChannelAutostartSuppression: channelManager.getAutostartSuppression,
				logChannels,
				registerWorkerTurnClaimClosedHandler: workerEnvironmentStartup?.placementStore ? (handler) => workerEnvironmentStartup.placementStore.registerTurnClaimClosedHandler(handler) : void 0,
				validateAgentRuntimeDelegatedAuthority: (authority) => validateAgentRuntimeApprovalAuthority({
					kind: "agentRuntime",
					agentId: "approval-manager",
					sessionKey: "approval-manager",
					operationalRunInstance: authority.operationalRunInstance,
					delegatedAuthority: authority
				}),
				onApprovalLifecycle: approvalSessionEvents.publish,
				onAgentRunAuthorityClosed: (authority) => {
					secretEgressProxy?.revokeRun(authority.operationalRunInstance);
				}
			}),
			coreGatewayHandlers: coreGatewayHandlersLocal
		};
	});
	kernel.addGatewayLifetimeSidecar({ stop: async () => {
		unregisterApprovalAuthorityObserver();
	} });
	approvalManagersForReplay.set("exec", execApprovalManager);
	approvalManagersForReplay.set("plugin", pluginApprovalManager);
	approvalManagersForReplay.set("system-agent", systemAgentApprovalManager);
	workerDispatchAuthority.revoke = ({ sessionId, sessionKeys }) => {
		const keys = new Set(sessionKeys);
		for (const sessionKey of keys) revokeAttachGrantsForSession(sessionKey);
		const fenceResolver = {
			kind: "system",
			id: "worker-dispatch"
		};
		for (const manager of [execApprovalManager, pluginApprovalManager]) for (const record of manager.listPendingRecords()) if (approvalRequestTargetsSession(record.request, keys, sessionId)) manager.forceDenyDetailed(record.id, "run-aborted", fenceResolver, "cancelled");
	};
	const attachedGatewayExtraHandlers = {
		...pluginRuntime.registry.gatewayHandlers,
		...extraHandlers
	};
	let attachedPluginGatewayHandlerKeys = new Set(Object.keys(pluginRuntime.registry.gatewayHandlers));
	const buildAttachedGatewayMethodRegistry = (nextPluginRegistry) => {
		const coreDescriptorHandlers = { ...coreGatewayHandlers };
		const auxHandlers = {};
		for (const [method, handler] of Object.entries(extraHandlers)) if (isCoreGatewayMethodClassified(method)) coreDescriptorHandlers[method] = handler;
		else auxHandlers[method] = handler;
		const coreDescriptors = createCoreGatewayMethodDescriptors(coreDescriptorHandlers).filter((descriptor) => (workerEnvironmentService || descriptor.name !== "environments.create" && descriptor.name !== "environments.destroy") && (workerPlacementDispatchAvailable || descriptor.name !== "sessions.dispatch") && (workerPlacementControlAvailable || descriptor.name !== "sessions.reclaim" && descriptor.name !== "sessions.move") && (desktopObserveAvailable || descriptor.name !== "desktop.observe") && (workerDesktopObserveAvailable || descriptor.name !== "desktop.launch" && descriptor.name !== "worker.desktop.observe" && descriptor.name !== "worker.desktop.launch"));
		return createGatewayMethodRegistry([
			...coreDescriptors,
			...createPluginGatewayMethodDescriptors(nextPluginRegistry),
			...createGatewayMethodDescriptorsFromHandlers({
				handlers: auxHandlers,
				owner: {
					kind: "aux",
					area: "gateway-extra"
				},
				defaultScope: ADMIN_SCOPE
			})
		], nextPluginRegistry);
	};
	let attachedGatewayMethodRegistry = buildAttachedGatewayMethodRegistry(pluginRuntime.registry);
	let retireAttachedPluginRuntimeBindings = () => {};
	kernel.addGatewayLifetimeSidecar({ stop: async () => retireAttachedPluginRuntimeBindings() });
	const listAttachedGatewayMethods = () => {
		const methods = attachedGatewayMethodRegistry.listAdvertisedMethods();
		methods.push(...listStartupChannelGatewayMethods());
		return uniqueStrings(methods);
	};
	kernel.publishMethodSurface(listAttachedGatewayMethods());
	const replaceAttachedPluginRuntime = (loaded) => {
		const retirePreviousBindings = retireAttachedPluginRuntimeBindings;
		retireAttachedPluginRuntimeBindings = loaded.retireGatewayRuntimeBindings ?? (() => {});
		retirePreviousBindings();
		pluginRuntime.registry = loaded.pluginRegistry;
		pluginRuntime.baseGatewayMethods = loaded.gatewayMethods;
		for (const key of attachedPluginGatewayHandlerKeys) delete attachedGatewayExtraHandlers[key];
		Object.assign(attachedGatewayExtraHandlers, pluginRuntime.registry.gatewayHandlers);
		attachedPluginGatewayHandlerKeys = new Set(Object.keys(pluginRuntime.registry.gatewayHandlers));
		attachedGatewayMethodRegistry = buildAttachedGatewayMethodRegistry(pluginRuntime.registry);
		kernel.publishMethodSurface(listAttachedGatewayMethods());
		nodeRegistry.refreshNodePluginTools();
	};
	const refreshAttachedGatewayDiscovery = async (nextPluginRegistry, claim) => {
		if (minimalTestGateway) return;
		try {
			if (!await claim.waitForUnblocked()) return;
			await kernel.swapBonjourStop(null)?.().catch((err) => {
				logDiscovery.warn(`gateway discovery stop failed before plugin refresh: ${String(err)}`);
			});
			const { startGatewayPluginDiscovery } = await loadGatewayStartupEarlyModule();
			if (!await claim.waitForUnblocked()) return;
			const stopNextDiscovery = await startGatewayPluginDiscovery({
				minimalTestGateway,
				cfgAtStart,
				port,
				gatewayTls,
				gatewayDirectReachable: !isLoopbackHost(bindHost),
				tailscaleMode,
				logDiscovery,
				pluginRegistry: nextPluginRegistry
			});
			if (!await claim.waitForUnblocked() || !claim.publish(() => kernel.swapBonjourStop(stopNextDiscovery))) await stopNextDiscovery?.();
		} catch (err) {
			logDiscovery.warn(`gateway discovery refresh failed after plugin load: ${String(err)}`);
		}
	};
	const reloadAttachedGatewayPlugins = async (params) => {
		const [{ loadPluginLookUpTable }, { listAmbientOnlyConfiguredChannelIds }, { prepareGatewayPluginLoad }, { startPluginServices, PLUGIN_SERVICE_REPLACEMENT_STOP_TIMEOUT_MS }, { listChannelPluginConfigTargetIds, pluginConfigTargetsChanged }] = await Promise.all([
			import("./plugin-lookup-table-CFbO502d.js"),
			import("./channel-presence-policy-DPp9qePZ.js"),
			loadGatewayPluginBootstrapModule(),
			import("./services-d6sHwM-q.js"),
			import("./gateway/plugin-channel-reload-targets.js")
		]);
		const cancelledReload = (activeChannels) => ({
			restartChannels: /* @__PURE__ */ new Set(),
			activeChannels: new Set(activeChannels),
			cancelled: true
		});
		const listAttachedChannelConfigTargets = () => new Map(listGatewayStartupChannelPlugins$1().map((plugin) => [plugin.id, listChannelPluginConfigTargetIds({
			channelId: plugin.id,
			pluginId: getLoadedChannelPluginEntryById(plugin.id)?.pluginId,
			aliases: plugin.meta.aliases
		})]));
		const beforeChannelTargets = listAttachedChannelConfigTargets();
		const beforeChannelIds = new Set(beforeChannelTargets.keys());
		const nextPluginLookUpTable = loadPluginLookUpTable({
			config: resolveGatewayStartupPluginActivationConfig({
				runtimeConfig: params.nextConfig,
				activationSourceConfig: params.sourceConfig,
				env: params.env,
				manifestRegistry: pluginMetadataSnapshot?.manifestRegistry,
				discovery: pluginMetadataSnapshot?.discovery,
				ambientEnvTriggers
			}),
			workspaceDir: pluginWorkspaceDir,
			env: params.env,
			activationSourceConfig: params.sourceConfig,
			metadataSnapshot: pluginMetadataSnapshot,
			workerProviderIds: workerEnvironmentStartup?.listDurableProviderIds() ?? [],
			ambientEnvTriggers
		});
		const nextAmbientAutostartSuppressedChannelIds = ambientEnvTriggers === "suppress" ? new Set(listAmbientOnlyConfiguredChannelIds({
			config: params.nextConfig,
			activationSourceConfig: params.sourceConfig,
			env: params.env,
			includePersistedAuthState: false,
			manifestRecords: nextPluginLookUpTable.manifestRegistry.plugins
		})) : /* @__PURE__ */ new Set();
		const nextStartupPluginIds = new Set(nextPluginLookUpTable.startup.pluginIds);
		const nextStartupChannelIds = new Set(nextPluginLookUpTable.manifestRegistry.plugins.flatMap(({ id, channels }) => nextStartupPluginIds.has(id) ? channels.length > 0 ? channels : [id] : []));
		const channelsToStopBeforeReplace = /* @__PURE__ */ new Set();
		for (const [channelId, targetIds] of beforeChannelTargets) if (!nextStartupChannelIds.has(channelId) || pluginConfigTargetsChanged(targetIds, params.changedPaths)) channelsToStopBeforeReplace.add(channelId);
		const pluginRuntimeGeneration = kernel.pluginRuntimeGeneration;
		const replacement = pluginRuntimeGeneration.reserve();
		let recoverFromReplacementTeardown;
		try {
			await params.beforeReplace(channelsToStopBeforeReplace, channelManager.getPluginCommandCatalogAccounts());
			if (params.isAborted?.()) {
				replacement.reject();
				return cancelledReload(beforeChannelIds);
			}
			const previousServices = pluginRuntimeGeneration.currentServices();
			if (previousServices) {
				recoverFromReplacementTeardown = params.onReplacementTeardownFailure;
				await previousServices.stop({
					strict: true,
					deadlineAtMs: Date.now() + PLUGIN_SERVICE_REPLACEMENT_STOP_TIMEOUT_MS
				});
				if (params.isAborted?.()) throw new Error("Gateway plugin runtime replacement was superseded after service teardown");
			}
			await params.commitRuntime(() => {
				replacement.commit();
				pluginRuntimeGeneration.publishServices(replacement.claim, null);
				recoverFromReplacementTeardown = void 0;
			});
			if (!await replacement.claim.waitForUnblocked()) return cancelledReload(beforeChannelIds);
			let loaded;
			if (!replacement.claim.publish(() => {
				channelManager.setAmbientAutostartSuppressedChannelIds(nextAmbientAutostartSuppressedChannelIds);
				loaded = prepareGatewayPluginLoad({
					cfg: params.nextConfig,
					activationSourceConfig: params.sourceConfig,
					workspaceDir: pluginWorkspaceDir,
					log,
					coreGatewayMethodNames,
					hostServices: pluginHostServices,
					baseMethods,
					pluginLookUpTable: nextPluginLookUpTable,
					pluginMetadataSnapshot,
					ambientEnvTriggers,
					resolveGatewayContext: resolvePluginGatewayContext
				});
				replaceAttachedPluginRuntime(loaded);
			}) || !loaded) return cancelledReload(listAttachedChannelConfigTargets().keys());
			await refreshAttachedGatewayDiscovery(loaded.pluginRegistry, replacement.claim);
			if (!await replacement.claim.waitForUnblocked()) return cancelledReload(listAttachedChannelConfigTargets().keys());
			const nextServices = await startPluginServices({
				registry: loaded.pluginRegistry,
				config: params.nextConfig,
				workspaceDir: pluginWorkspaceDir,
				broadcastPluginEvent,
				onHandle: (handle) => pluginRuntimeGeneration.publishServices(replacement.claim, handle)
			});
			if (!await replacement.claim.waitForUnblocked() || !pluginRuntimeGeneration.publishServices(replacement.claim, nextServices)) await nextServices.stop({
				strict: true,
				deadlineAtMs: Date.now() + PLUGIN_SERVICE_REPLACEMENT_STOP_TIMEOUT_MS
			});
		} catch (error) {
			replacement.reject();
			recoverFromReplacementTeardown?.(error);
			throw error;
		}
		const afterChannelTargets = listAttachedChannelConfigTargets();
		const restartChannels = /* @__PURE__ */ new Set();
		for (const [channelId, targetIds] of afterChannelTargets) if (!beforeChannelIds.has(channelId) || pluginConfigTargetsChanged(targetIds, params.changedPaths)) restartChannels.add(channelId);
		return {
			restartChannels,
			activeChannels: new Set(afterChannelTargets.keys())
		};
	};
	return {
		...runtime,
		kernel: {
			...kernel,
			reloadPlugins: reloadAttachedGatewayPlugins
		},
		startEarlyRuntime,
		sessionCompanion,
		sessionObserver,
		approvalSessionEvents,
		execApprovalManager,
		questionManager,
		cancelRunBoundApprovals,
		forwardPluginApprovalRequest,
		approvalWebPushDelivery,
		pluginApprovalIosPushDelivery,
		pluginApprovalManager,
		placementStandingGrants,
		systemAgentApprovalManager,
		bindApprovalPublicationContext,
		validateAgentRuntimeApprovalAuthority,
		attachedGatewayExtraHandlers,
		getAttachedGatewayMethodRegistry: () => attachedGatewayMethodRegistry,
		replaceAttachedPluginRuntime,
		refreshAttachedGatewayDiscovery,
		loadGatewayModelCatalog,
		loadGatewayModelCatalogSnapshot,
		readPreparedGatewayModelCatalog,
		getPluginMetadataSnapshot: () => pluginMetadataSnapshot
	};
}
//#endregion
//#region src/gateway/server-chat-metadata-lifecycle.ts
async function createGatewayChatMetadataLifecycle(params) {
	let context;
	let preparedModelRuntimeAvailable = false;
	let preparedModelRuntimeEventVersion = 0;
	const { ChatMetadataSnapshotUnavailableError, createGatewayChatMetadataRuntime } = await import("./chat-metadata-runtime-C_EurJCI.js");
	const runtime = createGatewayChatMetadataRuntime({
		getConfig: params.getConfig,
		getContext: () => {
			if (!context) throw new Error("gateway request context is unavailable during chat metadata preparation");
			return context;
		},
		...params.minimalTestGateway ? {
			beforeRefresh: async () => {
				const { refreshPreparedModelRuntimeSnapshots } = await import("./prepared-model-runtime-DNXZpNBL.js");
				await refreshPreparedModelRuntimeSnapshots(params.getConfig(), {
					gatewayLifecycle: true,
					catalogMode: "static",
					allowGatewaySubagentBinding: true
				});
			},
			refreshOnRead: true
		} : {},
		onChanged: () => context?.broadcast("chat.metadata.changed", {}, { dropIfSlow: true }),
		log: params.log
	});
	const refreshLogged = () => {
		runtime.refresh().catch((error) => {
			params.log.warn(`chat metadata refresh failed: ${String(error)}`);
		});
	};
	const invalidateForSubordinateChange = () => {
		runtime.invalidate();
		if (preparedModelRuntimeAvailable) refreshLogged();
	};
	const registerRefreshListeners = async () => {
		if (params.minimalTestGateway) return;
		const [{ registerRuntimeAuthProfileStoreMutationListener }, { registerPreparedModelRuntimePublicationListener }, { registerSkillsChangeListener }] = await Promise.all([
			import("./runtime-snapshots-CyYIbqm-.js"),
			import("./prepared-model-runtime-DNXZpNBL.js"),
			import("./refresh-CzJOBCBM.js")
		]);
		const unregisterPreparedModelRuntimePublication = registerPreparedModelRuntimePublicationListener((event) => {
			if (event.phase === "catalog-published") {
				invalidateForSubordinateChange();
				return;
			}
			preparedModelRuntimeEventVersion += 1;
			if (event.phase === "invalidated") {
				preparedModelRuntimeAvailable = false;
				runtime.invalidate();
				return;
			}
			if (event.phase === "failed") {
				preparedModelRuntimeAvailable = false;
				runtime.fail(event.error);
				return;
			}
			preparedModelRuntimeAvailable = true;
			refreshLogged();
		});
		const unregisterSkillsChange = registerSkillsChangeListener(() => {
			invalidateForSubordinateChange();
		});
		const unregisterRuntimeAuthProfileStoreMutation = registerRuntimeAuthProfileStoreMutationListener(() => {
			invalidateForSubordinateChange();
		});
		return { stop: async () => {
			unregisterRuntimeAuthProfileStoreMutation();
			unregisterPreparedModelRuntimePublication();
			unregisterSkillsChange();
		} };
	};
	return {
		attachContext: async (next, sidecars) => {
			context = next;
			const sidecar = await registerRefreshListeners();
			if (sidecar) {
				sidecars.push(sidecar);
				const eventVersion = preparedModelRuntimeEventVersion;
				await runtime.refresh().then(() => {
					if (preparedModelRuntimeEventVersion === eventVersion) preparedModelRuntimeAvailable = true;
				}, (error) => {
					if (!(error instanceof ChatMetadataSnapshotUnavailableError)) {
						if (preparedModelRuntimeEventVersion === eventVersion) preparedModelRuntimeAvailable = true;
						params.log.warn(`chat metadata catch-up refresh failed: ${String(error)}`);
					}
				});
			}
		},
		read: runtime.read,
		readStartup: runtime.readStartup,
		refresh: runtime.refresh
	};
}
//#endregion
//#region src/gateway/server-lifetime-sidecars.ts
const SECRET_STORE_EXPIRY_INTERVAL_MS = 6e4;
const GITHUB_PUBLICATION_RECONCILE_INTERVAL_MS = 6e4;
function startGitHubPublicationMaintenance(reconcile, logWarning) {
	let current;
	let stopped = false;
	const run = () => {
		if (stopped || current) return;
		const operation = reconcile().catch(() => logWarning("GitHub publication recovery failed; will retry.")).finally(() => {
			if (current === operation) current = void 0;
		});
		current = operation;
	};
	run();
	const interval = setInterval(run, GITHUB_PUBLICATION_RECONCILE_INTERVAL_MS);
	interval.unref?.();
	return { stop: async () => {
		stopped = true;
		clearInterval(interval);
		await current;
	} };
}
function startSecretStoreExpiryMaintenance(logWarning) {
	let warned = false;
	const purge = () => {
		try {
			purgeExpiredSecretStoreEntries();
			warned = false;
		} catch {
			if (!warned) {
				logWarning("Secret store expiry cleanup failed; will retry.");
				warned = true;
			}
		}
	};
	purge();
	const interval = setInterval(purge, SECRET_STORE_EXPIRY_INTERVAL_MS);
	interval.unref?.();
	return { stop: () => clearInterval(interval) };
}
async function attachInitialGatewayLifetimeSidecars(params) {
	await params.chatMetadataLifecycle.attachContext(params.gatewayRequestContext, params.sidecars);
	const githubOAuth = createGitHubOAuthLifecycle({
		getConfig: params.gatewayRequestContext.getRuntimeConfig,
		getPersistedConfig: () => getRuntimeConfig({ pin: false }),
		warn: params.logWarning
	});
	params.gatewayRequestContext.githubOAuthService = githubOAuth;
	const uninstallGitHubOAuth = installActiveGitHubOAuthLifecycle(githubOAuth);
	if (!params.minimalTestGateway) githubOAuth.start();
	params.sidecars.push({ stop: async () => {
		uninstallGitHubOAuth();
		await githubOAuth.stop();
		if (params.gatewayRequestContext.githubOAuthService === githubOAuth) delete params.gatewayRequestContext.githubOAuthService;
	} });
	if (!params.minimalTestGateway) params.sidecars.push(startSecretStoreExpiryMaintenance(params.logWarning));
	if (params.reconcileGitHubPublications) params.sidecars.push(startGitHubPublicationMaintenance(params.reconcileGitHubPublications, params.logWarning));
	params.sidecars.push({ stop: () => {
		params.flushPendingSessionsChangedEvents(params.gatewayRequestContext);
	} });
}
//#endregion
//#region src/gateway/server-kernel-request-runtime.ts
/** Completes the socket-free request and internal-dispatch half of Gateway startup. */
async function prepareGatewayKernelRequestRuntime(params) {
	const { coreRuntime: runtime, log, logHealth } = params;
	const { minimalTestGateway, deps, runtimeState, unavailableGatewayMethods, sessionCompanion, sessionObserver, getMcpAppSandboxPort, ensureSandboxHostPort, getPortalService, terminalLaunchPolicy, execApprovalManager, questionManager, cancelRunBoundApprovals, forwardPluginApprovalRequest, approvalWebPushDelivery, pluginApprovalIosPushDelivery, pluginApprovalManager, placementStandingGrants, systemAgentApprovalManager, bindApprovalPublicationContext, validateAgentRuntimeApprovalAuthority, approvalSessionEvents, startupTrace, loadGatewayModelCatalog, loadGatewayModelCatalogSnapshot, readPreparedGatewayModelCatalog, refreshGatewayHealthSnapshotWithRuntime, getRuntimeSnapshot, broadcast, broadcastToConnIds, nodeSendToSession, nodeSendToAllSubscribed, nodeSubscribe, nodeUnsubscribe, nodeUnsubscribeAll, hasTalkNodeConnected, clients, isConnectionActive, watchNodeHttpRuntime, sharedGatewaySessionGenerationState, resolveSharedGatewaySessionGenerationForRuntimeSnapshot, nodeRegistry, nodeDesktopService, workerEnvironmentService, hostDesktopService, workerEnvironmentStartup, workerPlacementRuntime, workerPlacementControlAvailable, githubPublicationRuntime, githubPublicationService, terminalSessions, agentRunSeq, chatAbortControllers, chatQueuedTurns, chatRunState, addChatRun, removeChatRun, subscribeSessionMessageEvents, unsubscribeSessionMessageEvents, sessionEventSubscribers, sessionMessageSubscribers, toolEventRecipients, dedupe, wizardSessions, systemAgentSessions, findRunningWizard, purgeWizardSession, readinessEventLoopHealth, startChannel, stopChannel, markChannelLoggedOut, wizardRunner, channelWizardRunner, broadcastVoiceWakeChanged, broadcastVoiceWakeRoutingChanged, pluginGatewayContext, getAttachedGatewayMethodRegistry, gatewayInstanceRuntimeRef, gatewayTls, lifecycle, startupState, kernel, shutdownRuntime } = runtime;
	const chatMetadataLifecycle = await createGatewayChatMetadataLifecycle({
		getConfig: getRuntimeConfig,
		minimalTestGateway,
		log
	});
	const configRevisionProjector = await startupTrace.measure("gateway.config-revision-key", async () => {
		const { loadGatewayConfigRevisionProjector } = await import("./config-revision-token-Ck3ozy3X.js");
		return loadGatewayConfigRevisionProjector({ env: process.env });
	});
	const gatewayRequestContext = await startupTrace.measure("gateway.request-context", async () => {
		const { createGatewayRequestContext } = await import("./server-request-context-C9Wrv_U0.js");
		return createGatewayRequestContext({
			deps,
			configRevisionProjector,
			runtimeState,
			sessionCompanion,
			getRuntimeConfig,
			isConfigReloadSettled: () => !lifecycle.closePreludeStarted && runtimeState.configReloader.isConfigReloadSettled(),
			getGatewayMethodRegistry: getAttachedGatewayMethodRegistry,
			gatewayTlsFingerprint: gatewayTls.enabled ? gatewayTls.fingerprintSha256 : void 0,
			sessionObserver,
			getMcpAppSandboxPort,
			ensureSandboxHostPort,
			getPortalService,
			resolveTerminalLaunchPolicy: terminalLaunchPolicy.resolve,
			isTerminalEnabled: terminalLaunchPolicy.isEnabled,
			execApprovalManager,
			questionManager,
			cancelRunBoundApprovals,
			forwardPluginApprovalRequest,
			approvalWebPushDelivery,
			pluginApprovalIosPushDelivery,
			pluginApprovalManager,
			placementStandingGrants,
			systemAgentApprovalManager,
			listSessionPendingApprovals: approvalSessionEvents.replay,
			loadGatewayModelCatalog,
			loadGatewayModelCatalogSnapshot,
			readPreparedGatewayModelCatalog,
			readChatMetadata: chatMetadataLifecycle.read,
			readChatStartupProjection: chatMetadataLifecycle.readStartup,
			getHealthCache,
			refreshHealthSnapshot: refreshGatewayHealthSnapshotWithRuntime,
			logHealth,
			logGateway: log,
			incrementPresenceVersion,
			getHealthVersion,
			broadcast,
			broadcastToConnIds,
			nodeSendToSession,
			nodeSendToAllSubscribed,
			nodeSubscribe,
			nodeUnsubscribe,
			nodeUnsubscribeAll,
			hasConnectedTalkNode: hasTalkNodeConnected,
			clients,
			isConnectionActive,
			invalidateDeviceTransports: watchNodeHttpRuntime.invalidateSessionsForDevice,
			disconnectDeviceTransports: watchNodeHttpRuntime.disconnectSessionsForDevice,
			enforceSharedGatewayAuthGenerationForConfigWrite: (nextConfig) => {
				enforceSharedGatewaySessionGenerationForConfigWrite({
					state: sharedGatewaySessionGenerationState,
					nextConfig,
					resolveRuntimeSnapshotGeneration: resolveSharedGatewaySessionGenerationForRuntimeSnapshot,
					clients
				});
			},
			nodeRegistry,
			...nodeDesktopService ? { nodeDesktopService } : {},
			...workerEnvironmentService ? { workerEnvironmentService } : {},
			...hostDesktopService ? { hostDesktopService } : {},
			...workerEnvironmentStartup ? { workerSessionPlacementService: workerEnvironmentStartup.placementStore } : {},
			...workerPlacementRuntime ? {
				workerPlacementDiskSpaceReader: workerPlacementRuntime.diskSpace,
				workerPlacementRunnerAvailabilityReader: workerPlacementRuntime.runnerAvailability
			} : {},
			...workerPlacementControlAvailable ? { workerPlacementDispatchService: workerPlacementControlAvailable } : {},
			...githubPublicationService ? { githubPublicationService } : {},
			validateAgentRuntimeApprovalAuthority,
			terminalSessions,
			agentRunSeq,
			chatAbortControllers,
			chatQueuedTurns,
			chatRunState,
			addChatRun,
			removeChatRun,
			subscribeSessionEvents: sessionEventSubscribers.subscribe,
			unsubscribeSessionEvents: sessionEventSubscribers.unsubscribe,
			subscribeSessionMessageEvents,
			unsubscribeSessionMessageEvents,
			unsubscribeAllSessionEvents: (connId) => {
				sessionEventSubscribers.unsubscribe(connId);
				sessionMessageSubscribers.unsubscribeAll(connId);
				sessionObserver.removeConnection(connId);
			},
			getSessionEventSubscriberConnIds: sessionEventSubscribers.getAll,
			registerToolEventRecipient: toolEventRecipients.add,
			dedupe,
			wizardSessions,
			systemAgentSessions,
			findRunningWizard,
			purgeWizardSession,
			getRuntimeSnapshot,
			getEventLoopHealth: readinessEventLoopHealth.snapshot,
			startChannel,
			stopChannel,
			markChannelLoggedOut,
			wizardRunner,
			channelWizardRunner,
			broadcastVoiceWakeChanged,
			unavailableGatewayMethods,
			broadcastVoiceWakeRoutingChanged,
			notifyPluginMetadataChanged: kernel.notifyPluginMetadataChanged,
			getConfigReloaderHotReloadStatus: kernel.getConfigReloaderHotReloadStatus
		});
	});
	bindApprovalPublicationContext(gatewayRequestContext);
	await attachInitialGatewayLifetimeSidecars({
		chatMetadataLifecycle,
		gatewayRequestContext,
		flushPendingSessionsChangedEvents: shutdownRuntime.flushPendingSessionsChangedEvents,
		minimalTestGateway,
		logWarning: (message) => log.warn(message),
		...!workerPlacementRuntime && githubPublicationRuntime ? { reconcileGitHubPublications: githubPublicationRuntime.reconcilePublications } : {},
		sidecars: runtimeState.gatewayLifetimeSidecars
	});
	pluginGatewayContext.current = gatewayRequestContext;
	gatewayRequestContext.dispatchHookAgentTurn = async (pluginId, hookParams) => {
		const transport = runtime.transportBridge.current();
		if (!transport) throw new Error("Gateway listener must start before plugin hook dispatch");
		return await transport.dispatchHookAgentTurn(pluginId, hookParams);
	};
	const { createGatewayInstanceRuntime } = await import("./server-instance-runtime-DJ5zqWvf.js");
	const gatewayInstanceRuntime = createGatewayInstanceRuntime({
		getContext: () => gatewayRequestContext,
		getMethodRegistry: () => getAttachedGatewayMethodRegistry(),
		isDispatchAvailable: () => startupState.dispatchReady && !lifecycle.closePreludeStarted,
		logError: (message) => log.error(message)
	});
	gatewayInstanceRuntimeRef.current = gatewayInstanceRuntime;
	gatewayRequestContext.resolveGatewayContext = () => gatewayInstanceRuntime.isAvailable() ? gatewayRequestContext : void 0;
	gatewayRequestContext.approvalEvents = gatewayInstanceRuntime.approvalEvents;
	gatewayRequestContext.recoveryRuntime = gatewayInstanceRuntime.recovery;
	gatewayRequestContext.createAgentTurnFacade = gatewayInstanceRuntime.createAgentTurnFacade;
	return {
		...runtime,
		chatMetadataLifecycle,
		gatewayRequestContext,
		gatewayInstanceRuntime
	};
}
//#endregion
//#region src/gateway/server-cron-lazy.ts
/** Creates a cron state proxy that imports the real cron service on first use. */
function createLazyGatewayCronState(params) {
	const env = params.env ?? process.env;
	const storePath = resolveCronJobsStorePathFromConfig(params.cfg, env);
	const cronEnabled = env.OPENCLAW_SKIP_CRON !== "1" && params.cfg.cron?.enabled !== false;
	let loaded = null;
	let stopped = false;
	let exitWatcherHandoff;
	let exitWatcherHandoffStop;
	let lifecycleGeneration = 0;
	let schedulingPaused = false;
	const schedulingResumeWaiters = /* @__PURE__ */ new Set();
	const releaseSchedulingResumeWaiters = () => {
		const waiters = Array.from(schedulingResumeWaiters);
		schedulingResumeWaiters.clear();
		for (const resolve of waiters) resolve();
	};
	const waitForSchedulingResume = async () => {
		if (!schedulingPaused) return;
		await new Promise((resolve) => {
			schedulingResumeWaiters.add(resolve);
		});
	};
	const cronStateLoader = createLazyPromiseLoader(() => import("./server-cron-CjiKhW6B.js").then(({ buildGatewayCronService }) => {
		loaded = {
			state: buildGatewayCronService(params),
			phase: "idle",
			startPromise: null,
			startGeneration: null,
			schedulingPaused: false,
			underlyingStartInFlight: false,
			underlyingStarted: false
		};
		if (schedulingPaused) {
			loaded.state.cron.pauseScheduling();
			loaded.schedulingPaused = true;
		}
		return loaded;
	}), { cacheRejections: true });
	const load = async () => {
		if (loaded) return loaded;
		return await cronStateLoader.load();
	};
	const stopResolvedCron = async (resolved) => {
		resolved.phase = "stopped";
		resolved.underlyingStarted = false;
		if (exitWatcherHandoff) await (exitWatcherHandoffStop ??= exitWatcherHandoff.stopOwner());
		else if (resolved.state.cron.stopAndDrain) await resolved.state.cron.stopAndDrain();
		else {
			resolved.state.cron.stop();
			await resolved.state.stopStreamWatchers();
		}
	};
	const stopLoadedCronAndDrain = async (handoff) => {
		stopped = true;
		exitWatcherHandoff ??= handoff;
		lifecycleGeneration += 1;
		releaseSchedulingResumeWaiters();
		const loading = cronStateLoader.peek();
		const resolved = loaded ?? (loading ? await loading : null);
		if (resolved) await stopResolvedCron(resolved);
	};
	const cron = {
		async start() {
			stopped = false;
			const generation = lifecycleGeneration;
			const startCancelled = () => stopped || generation !== lifecycleGeneration;
			const resolved = await load();
			const hasStarted = () => resolved.phase === "started";
			if (startCancelled()) return;
			if (hasStarted()) return;
			if (resolved.startPromise) {
				const pendingGeneration = resolved.startGeneration;
				try {
					await resolved.startPromise;
				} catch (err) {
					if (pendingGeneration === generation) throw err;
				}
				if (startCancelled() || hasStarted()) return;
				if (pendingGeneration !== generation) {
					await cron.start();
					return;
				}
			}
			resolved.phase = "starting";
			resolved.startGeneration = generation;
			const startPromise = (async () => {
				await waitForSchedulingResume();
				if (startCancelled()) {
					resolved.phase = "stopped";
					return;
				}
				if (resolved.schedulingPaused) {
					resolved.state.cron.resumeScheduling();
					resolved.schedulingPaused = false;
				}
				resolved.underlyingStartInFlight = true;
				try {
					await resolved.state.cron.start();
					resolved.underlyingStarted = true;
				} catch (err) {
					resolved.underlyingStarted = false;
					resolved.phase = startCancelled() ? "stopped" : "idle";
					throw err;
				} finally {
					resolved.underlyingStartInFlight = false;
				}
				if (startCancelled()) {
					await stopResolvedCron(resolved);
					return;
				}
				if (schedulingPaused) {
					resolved.state.cron.pauseScheduling();
					resolved.schedulingPaused = true;
				}
				try {
					if (resolved.state.cronEnabled) await Promise.all([resolved.state.reconcileExitWatchers(), resolved.state.reconcileStreamWatchers()]);
				} catch (err) {
					resolved.phase = startCancelled() ? "stopped" : "started";
					throw err;
				}
				if (startCancelled()) {
					await stopResolvedCron(resolved);
					return;
				}
				resolved.phase = "started";
			})();
			resolved.startPromise = startPromise;
			try {
				await startPromise;
			} finally {
				if (resolved.startPromise === startPromise) {
					resolved.startPromise = null;
					resolved.startGeneration = null;
				}
			}
		},
		stop() {
			stopped = true;
			lifecycleGeneration += 1;
			releaseSchedulingResumeWaiters();
			if (loaded) {
				loaded.phase = "stopped";
				loaded.underlyingStarted = false;
				loaded.state.cron.stop();
				return;
			}
			const loading = cronStateLoader.peek();
			if (loading) loading.then((resolved) => {
				if (!stopped) return;
				resolved.phase = "stopped";
				resolved.underlyingStarted = false;
				resolved.state.cron.stop();
			}).catch(() => {});
		},
		async stopAndDrain() {
			await stopLoadedCronAndDrain();
		},
		pauseScheduling() {
			schedulingPaused = true;
			if (loaded) {
				loaded.state.cron.pauseScheduling();
				loaded.schedulingPaused = true;
			}
		},
		resumeScheduling() {
			schedulingPaused = false;
			releaseSchedulingResumeWaiters();
			if (loaded && loaded.schedulingPaused && (loaded.underlyingStarted || loaded.underlyingStartInFlight)) {
				loaded.state.cron.resumeScheduling();
				loaded.schedulingPaused = false;
			}
		},
		getSuspensionBlockerCount() {
			const loadedBlockers = loaded?.state.cron.getSuspensionBlockerCount?.() ?? 0;
			return loaded?.phase === "starting" ? Math.max(1, loadedBlockers) : loadedBlockers;
		},
		async status() {
			return await (await load()).state.cron.status();
		},
		async list(opts) {
			return await (await load()).state.cron.list(opts);
		},
		async listPage(opts) {
			return await (await load()).state.cron.listPage(opts);
		},
		async add(input, opts) {
			return await (await load()).state.cron.add(input, opts);
		},
		async update(id, patch, opts) {
			return await (await load()).state.cron.update(id, patch, opts);
		},
		async updateWithPrecondition(id, patch, precondition, opts) {
			return await (await load()).state.cron.updateWithPrecondition(id, patch, precondition, opts);
		},
		async remove(id, opts) {
			return await (await load()).state.cron.remove(id, opts);
		},
		async removeStaleJobFamily(family) {
			return await (await load()).state.cron.removeStaleJobFamily(family);
		},
		async removeAgentJobsTransactional(agentId, commit) {
			return await (await load()).state.cron.removeAgentJobsTransactional(agentId, commit);
		},
		async run(id, mode, opts) {
			return await (await load()).state.cron.run(id, mode, opts);
		},
		async enqueueRun(id, mode, opts) {
			return await (await load()).state.cron.enqueueRun(id, mode, opts);
		},
		getJob(id) {
			if (!loaded) return;
			return loaded.state.cron.getJob(id);
		},
		async readJob(id) {
			return await (await load()).state.cron.readJob(id);
		},
		async readScratch(id) {
			return await (await load()).state.cron.readScratch(id);
		},
		async writeScratch(id, write) {
			return await (await load()).state.cron.writeScratch(id, write);
		},
		getDefaultAgentId() {
			if (!loaded) return;
			return loaded.state.cron.getDefaultAgentId();
		},
		async prepareWake() {
			await load();
		},
		wake(opts) {
			if (!loaded) {
				load();
				return { ok: false };
			}
			return loaded.state.cron.wake(opts);
		}
	};
	return {
		cron,
		storePath,
		cronEnabled,
		prepareExitWatcherHandoff: async () => {
			const loading = cronStateLoader.peek();
			const handoff = await (loaded ?? (loading ? await loading : null))?.state.prepareExitWatcherHandoff?.();
			if (!handoff) return;
			return {
				...handoff,
				stopOwner: async () => {
					await stopLoadedCronAndDrain(handoff);
				}
			};
		},
		async reconcileExitWatchers() {
			await (await load()).state.reconcileExitWatchers();
		},
		async reconcileStreamWatchers() {
			await (await load()).state.reconcileStreamWatchers();
		},
		async stopStreamWatchers() {
			await loaded?.state.stopStreamWatchers();
		},
		async reconcileHeartbeatJobs(cfg) {
			return await (await load()).state.reconcileHeartbeatJobs(cfg);
		}
	};
}
//#endregion
//#region src/gateway/server-cron-reconciled.ts
function createGatewayCronReconciliation(params) {
	let lifecycleGeneration = 0;
	let activeAbortController;
	const supersedeActive = () => {
		lifecycleGeneration += 1;
		activeAbortController?.abort();
		activeAbortController = void 0;
	};
	return {
		arm: ({ reason, config, cronState }) => {
			supersedeActive();
			const generation = lifecycleGeneration;
			const abortController = new AbortController();
			activeAbortController = abortController;
			const cron = cronState.cron;
			const event = {
				reason,
				enabled: cronState.cronEnabled
			};
			let completed = false;
			return { complete: async () => {
				if (completed) return;
				completed = true;
				if (params.isClosing() || generation !== lifecycleGeneration || abortController.signal.aborted) return;
				await params.runHook(event, {
					port: params.port,
					config,
					workspaceDir: params.workspaceDir,
					getCron: () => cron,
					abortSignal: abortController.signal
				});
			} };
		},
		invalidate: supersedeActive
	};
}
//#endregion
//#region src/gateway/server-runtime-handles.ts
/** Creates gateway mutable state with inert handles that are safe to stop before startup finishes. */
function createGatewayServerMutableState() {
	return {
		bonjourStop: null,
		maintenance: null,
		stopMediaCleanup: () => waitForMediaCleanupDrains({ timeoutMs: MEDIA_CLEANUP_STOP_TIMEOUT_MS }),
		heartbeatRunner: createNoopHeartbeatRunner(),
		stopOutboundDeliveryRecovery: async () => {},
		stopGatewayUpdateCheck: () => {},
		tailscaleCleanup: null,
		postReadySidecars: [],
		gatewayLifetimeSidecars: [],
		skillsRefreshTimer: null,
		skillsRefreshDelayMs: 3e4,
		skillsChangeUnsub: async () => {},
		channelHealthMonitor: null,
		configReloader: {
			stop: async () => {},
			notifyPluginMetadataChanged: () => {},
			isConfigReloadSettled: () => false
		},
		agentUnsub: null,
		heartbeatUnsub: null,
		transcriptUnsub: null,
		lifecycleUnsub: null,
		taskUnsub: null
	};
}
//#endregion
//#region src/gateway/server-live-state.ts
/** Creates gateway live state with fresh mutable runtime handles. */
function createGatewayServerLiveState(params) {
	return {
		...createGatewayServerMutableState(),
		hooksConfig: params.hooksConfig,
		hookClientIpConfig: params.hookClientIpConfig,
		cronState: params.cronState,
		controlUiSessionPullRequests: void 0,
		sessionViewerPresence: void 0,
		pluginServices: null,
		gatewayMethods: params.gatewayMethods
	};
}
//#endregion
//#region src/gateway/server-plugin-runtime-generation.ts
/** One Gateway owner fences every plugin publication across startup and hot replacement. */
function createGatewayPluginRuntimeGeneration(params) {
	let current;
	let pending;
	const createClaim = () => {
		const claim = Object.freeze({
			isCurrent: () => current === claim && pending === void 0,
			waitForUnblocked: async () => {
				for (;;) {
					const reservation = pending;
					if (current !== claim || !reservation) return claim.isCurrent();
					await reservation.settled.promise;
				}
			},
			publish: (publication) => {
				if (!claim.isCurrent()) return false;
				publication();
				return true;
			}
		});
		return claim;
	};
	current = createClaim();
	return {
		currentClaim: () => current,
		currentServices: () => params.getServices(),
		publishServices: (claim, services) => claim.publish(() => params.setServices(services)),
		reserve: () => {
			if (pending) throw new Error("a Gateway plugin runtime replacement is already pending");
			const reservation = {
				claim: createClaim(),
				settled: createDeferredCore()
			};
			pending = reservation;
			const settle = (accepted) => {
				if (pending !== reservation) return;
				if (accepted) current = reservation.claim;
				pending = void 0;
				reservation.settled.resolve();
			};
			return Object.freeze({
				claim: reservation.claim,
				commit: () => settle(true),
				reject: () => settle(false)
			});
		}
	};
}
//#endregion
//#region src/gateway/server-shutdown.ts
/** Run every shutdown step even when one owner fails, with the failed owner named. */
async function runGatewayShutdownSteps(params) {
	for (const step of params.steps) try {
		await step.run();
	} catch (error) {
		params.onError(`shutdown step failed (${step.name}): ${formatErrorMessage(error)}`);
	}
}
//#endregion
//#region src/gateway/server-sidecar-owners.ts
function createGatewaySidecarStopOwner(params) {
	let activeStop = null;
	let phase = "open";
	const publish = (sidecars) => {
		if (phase === "sealed") throw new Error("cannot publish a Gateway sidecar after shutdown sealed its owner");
		params.setRegistered(mergeGatewaySidecarOwners({
			registered: params.getRegistered(),
			published: sidecars
		}));
		if (phase === "closing") stop().catch(() => {});
	};
	const beginClose = () => {
		if (phase === "open") phase = "closing";
	};
	const stop = () => {
		if (activeStop) return activeStop;
		const stopping = Promise.resolve().then(async () => {
			const failedSidecars = /* @__PURE__ */ new Set();
			let failure;
			try {
				while (params.getRegistered().some((sidecar) => !failedSidecars.has(sidecar))) {
					const sidecars = [...new Set(params.getRegistered().filter((sidecar) => !failedSidecars.has(sidecar)))];
					const ownedSidecars = new Set(sidecars);
					params.setRegistered(params.getRegistered().filter((sidecar) => !ownedSidecars.has(sidecar)));
					let pending = sidecars;
					let results = [];
					for (let attempt = 0; attempt < 2; attempt += 1) {
						results = await Promise.allSettled(pending.map(async (sidecar) => await sidecar.stop()));
						pending = pending.filter((_sidecar, index) => results[index]?.status === "rejected");
						if (pending.length === 0) break;
					}
					params.setRegistered(params.getRegistered().filter((sidecar) => !ownedSidecars.has(sidecar)));
					if (pending.length > 0) {
						const rejected = results.find((result) => result.status === "rejected");
						failure ??= rejected?.reason;
						for (const sidecar of pending) failedSidecars.add(sidecar);
					}
				}
				if (failedSidecars.size > 0) {
					params.setRegistered([...failedSidecars, ...params.getRegistered()]);
					throw failure;
				}
			} finally {
				activeStop = null;
			}
		});
		activeStop = stopping;
		stopping.catch(() => {});
		return stopping;
	};
	const sealAndJoin = async () => {
		let failure;
		while (true) {
			const stopping = activeStop;
			if (!stopping) {
				phase = "sealed";
				break;
			}
			try {
				await stopping;
			} catch (error) {
				failure ??= error instanceof Error ? error : new Error(String(error));
			}
		}
		if (failure) throw failure;
	};
	return {
		publish,
		beginClose,
		stop,
		sealAndJoin
	};
}
function mergeGatewaySidecarOwners(params) {
	return [.../* @__PURE__ */ new Set([...params.registered, ...params.published])];
}
//#endregion
//#region src/gateway/session-viewer-presence.ts
function normalizedSessionKeys(sessionKeys) {
	return [...new Set(sessionKeys.map((key) => key.trim()).filter(Boolean))].toSorted();
}
function sameKeys(left, right) {
	return left !== void 0 && left.length === right.length && left.every((key, index) => key === right[index]);
}
/** Owns one replace-set per websocket connection until empty declaration or disconnect. */
function createSessionViewerPresenceDeclarations(deps) {
	const declarations = /* @__PURE__ */ new Map();
	let stopped = false;
	const replace = (connId, sessionKeys) => {
		if (stopped) return [];
		const normalizedConnId = connId.trim();
		const client = deps.clients.getByConnectionId(normalizedConnId);
		if (!client || client.invalidated || client.socket.readyState !== 1) return [];
		const next = normalizedSessionKeys(sessionKeys);
		const previous = declarations.get(normalizedConnId);
		if (sameKeys(previous, next) || previous === void 0 && next.length === 0) return next;
		if (next.length === 0) declarations.delete(normalizedConnId);
		else declarations.set(normalizedConnId, next);
		if (client.presenceKey) {
			upsertPresence(client.presenceKey, { watchedSessions: next.length > 0 ? [...next] : void 0 });
			if (next.length > 0) recordClientPresenceActivity(deps.clients, client);
			broadcastPresenceSnapshot(deps);
		}
		return next;
	};
	const unsubscribe = (connId) => {
		const normalizedConnId = connId.trim();
		if (normalizedConnId) declarations.delete(normalizedConnId);
	};
	const stop = () => {
		stopped = true;
		declarations.clear();
	};
	return {
		replace,
		unsubscribe,
		stop
	};
}
//#endregion
//#region src/gateway/server-lifecycle.ts
async function prepareGatewayLifecycle(params) {
	const { runtime, port, log, logCron, diagnosticsEnabled, shutdownRuntime } = params;
	const { minimalTestGateway, transportBridge, sessionMessageSubscribers, isConnectionActive, clients, broadcast, cfgAtStart, pluginRuntime, authRateLimiter, nodeReapprovalCoordinator, channelManager, deps, initialHooksConfig, initialHookClientIpConfig, runtimeStateRef, gatewayInstanceRuntimeRef, startupState, readinessEventLoopHealth, browserAuthRateLimiter, chatRunState, chatAbortControllers, chatQueuedTurns, removeChatRun, agentRunSeq, listActiveGatewayMethods, broadcastToConnIds, getBufferedAmount, sessionEventSubscribers, watchNodeRequestHandler, defaultWorkspaceDir, activeTaskCount, desktopSessionRegistry, nodeDesktopStreamBroker, nodeDesktopObserveAvailable, bindDeviceNodeControl, bindWorkerNodeDesktopControl, workerPlacementRuntime, lifecycle } = runtime;
	const subscribeSessionMessageEvents = (connId, sessionKey, options) => sessionMessageSubscribers.subscribe(connId, sessionKey, options);
	const unsubscribeSessionMessageEvents = (connId, sessionKey) => sessionMessageSubscribers.unsubscribe(connId, sessionKey);
	const restartRecoveryCandidates = /* @__PURE__ */ new Map();
	const nodeDesktopServiceRef = {};
	const { createGatewayNodeSessionRuntime } = await import("./server-node-session-runtime-BmmS_m0o.js");
	const { nodeRegistry, nodeWorkerSupervisorTransport, nodePresenceTimers, nodeSendToSession, nodeSendToAllSubscribed, nodeSubscribe, nodeUnsubscribe, nodeUnsubscribeAll, broadcastVoiceWakeChanged, broadcastVoiceWakeRoutingChanged, hasTalkNodeConnected } = createGatewayNodeSessionRuntime({
		broadcast,
		sessionEventSubscribers,
		sessionMessageSubscribers,
		listRegisteredNodePluginToolCommands: () => pluginRuntime.registry.nodeHostCommands,
		nodePluginToolsEnabled: cfgAtStart.gateway?.nodes?.pluginTools?.enabled !== false,
		nodeSkillsEnabled: cfgAtStart.gateway?.nodes?.allowSkills !== false,
		onRunnerStateChanged: (nodeId, change) => {
			if (change.availabilityChanged) workerPlacementRuntime?.runnerAvailability.markChanged();
			if (change.inventoryChanged) workerPlacementRuntime?.scheduleNodeWorkspaceRetention(nodeId);
		},
		onPairingInvalidated: ({ nodeId, connId }) => {
			nodeDesktopServiceRef.current?.stopNode(nodeId);
			upsertPresence(nodeId, { reason: "disconnect" });
			broadcastPresenceSnapshot({
				broadcast,
				incrementPresenceVersion,
				getHealthVersion
			});
			removeRemoteNodeInfoForConnection(nodeId, connId);
		},
		onPairingGenerationChanged: ({ nodeId }) => {
			nodeDesktopServiceRef.current?.stopNode(nodeId);
		}
	});
	const nodeDesktopService = nodeDesktopObserveAvailable && desktopSessionRegistry && nodeDesktopStreamBroker ? (await import("./node-source-eeLcSWV6.js")).createNodeDesktopService({
		getConfig: getRuntimeConfig,
		nodeRegistry,
		desktopRegistry: desktopSessionRegistry,
		streamBroker: nodeDesktopStreamBroker
	}) : void 0;
	nodeDesktopServiceRef.current = nodeDesktopService;
	bindDeviceNodeControl?.(nodeWorkerSupervisorTransport);
	bindWorkerNodeDesktopControl?.(nodeWorkerSupervisorTransport);
	const { createWatchNodeHttpRuntime } = await import("./watch-node-http-DzqfZA0a.js");
	const watchNodeHttpRuntime = createWatchNodeHttpRuntime({
		nodeRegistry,
		getConfig: getRuntimeConfig,
		broadcast,
		rateLimiter: authRateLimiter,
		nodeReapprovalCoordinator,
		onNodeConnected: (session) => {
			upsertPresence(session.nodeId, {
				host: session.displayName ?? session.clientId ?? session.nodeId,
				ip: session.remoteIp,
				version: session.version,
				platform: session.platform,
				deviceFamily: session.deviceFamily,
				modelIdentifier: session.modelIdentifier,
				mode: session.clientMode,
				deviceId: session.nodeId,
				roles: ["node"],
				scopes: [],
				instanceId: session.nodeId,
				reason: "connect"
			});
			broadcastPresenceSnapshot({
				broadcast,
				incrementPresenceVersion,
				getHealthVersion
			});
			recordRemoteNodeInfo({
				nodeId: session.nodeId,
				connId: session.connId,
				displayName: session.displayName,
				platform: session.platform,
				deviceFamily: session.deviceFamily,
				commands: session.commands,
				remoteIp: session.remoteIp,
				pairingGeneration: session.pairingGeneration
			});
		},
		onNodeDisconnected: (nodeId) => {
			upsertPresence(nodeId, { reason: "disconnect" });
			broadcastPresenceSnapshot({
				broadcast,
				incrementPresenceVersion,
				getHealthVersion
			});
			removeRemoteNodeInfo(nodeId);
			nodeUnsubscribeAll(nodeId);
			clearNodeWakeState(nodeId);
		},
		onError: (message, error) => log.warn(`${message}: ${String(error)}`)
	});
	watchNodeRequestHandler.current = watchNodeHttpRuntime.handleRequest;
	const { TerminalSessionManager, DEFAULT_TERMINAL_DETACH_SECONDS } = await import("./session-manager-DD9I11lu.js");
	const { createTerminalSessionTransport } = await import("./gateway-transport-CCDhR7aF.js");
	const terminalSessions = new TerminalSessionManager({
		...createTerminalSessionTransport(broadcastToConnIds, getBufferedAmount),
		detachGraceMs: (cfgAtStart.gateway?.terminal?.detachedSessionTimeoutSeconds ?? DEFAULT_TERMINAL_DETACH_SECONDS) * 1e3
	});
	applyGatewayLaneConcurrency(resolveGatewayLaneConcurrency(cfgAtStart), { gatewayStart: true });
	runtimeStateRef.current = createGatewayServerLiveState({
		hooksConfig: initialHooksConfig,
		hookClientIpConfig: initialHookClientIpConfig,
		cronState: createLazyGatewayCronState({
			cfg: cfgAtStart,
			deps,
			broadcast,
			resolveGatewayContext: runtime.resolvePluginGatewayContext
		}),
		gatewayMethods: listActiveGatewayMethods(pluginRuntime.baseGatewayMethods)
	});
	const runtimeState = runtimeStateRef.current;
	const pluginRuntimeGeneration = createGatewayPluginRuntimeGeneration({
		getServices: () => runtimeState.pluginServices,
		setServices: (services) => {
			runtimeState.pluginServices = services;
		}
	});
	const unavailableGatewayMethods = new Set(minimalTestGateway ? [] : STARTUP_UNAVAILABLE_GATEWAY_METHODS);
	const kernel = {
		pluginRuntimeGeneration,
		setDispatchReady: (ready) => {
			startupState.dispatchReady = ready;
		},
		markSidecarsReady: () => {
			startupState.sidecarsReady = true;
		},
		unlockStartupMethods: () => {
			for (const method of STARTUP_UNAVAILABLE_GATEWAY_METHODS) unavailableGatewayMethods.delete(method);
		},
		publishMethodSurface: (methods) => {
			runtimeState.gatewayMethods.splice(0, runtimeState.gatewayMethods.length, ...methods);
		},
		setEarlyRuntimeHandles: (handles) => {
			activeTaskCount.get = handles.getActiveTaskCount;
			runtimeState.skillsChangeUnsub = handles.skillsChangeUnsub;
		},
		swapBonjourStop: (next) => {
			const previous = runtimeState.bonjourStop;
			runtimeState.bonjourStop = next;
			return previous;
		},
		setScheduledServiceHandles: (handles) => {
			runtimeState.heartbeatRunner = handles.heartbeatRunner;
			runtimeState.stopOutboundDeliveryRecovery = handles.stopOutboundDeliveryRecovery;
		},
		setPostAttachHandles: (handles, claim) => {
			runtimeState.stopGatewayUpdateCheck = handles.stopGatewayUpdateCheck;
			pluginRuntimeGeneration.publishServices(claim, handles.pluginServices);
		},
		setTailscaleCleanup: (cleanup) => {
			runtimeState.tailscaleCleanup = cleanup;
		},
		setConfigReloaderHandle: (configReloader) => {
			runtimeState.configReloader = configReloader;
		},
		getReloadState: () => ({
			hooksConfig: runtimeState.hooksConfig,
			hookClientIpConfig: runtimeState.hookClientIpConfig,
			heartbeatRunner: runtimeState.heartbeatRunner,
			cronState: runtimeState.cronState,
			channelHealthMonitor: runtimeState.channelHealthMonitor
		}),
		setReloadHookState: (next) => {
			runtimeState.hooksConfig = next.hooksConfig;
			runtimeState.hookClientIpConfig = next.hookClientIpConfig;
		},
		swapHeartbeatRunner: (next) => {
			const previous = runtimeState.heartbeatRunner;
			runtimeState.heartbeatRunner = next;
			return previous;
		},
		swapCronState: (next) => {
			const previous = runtimeState.cronState;
			runtimeState.cronState = next;
			deps.cron = next.cron;
			return previous;
		},
		setChannelHealthMonitor: (next) => {
			runtimeState.channelHealthMonitor = next;
		},
		notifyPluginMetadataChanged: () => {
			runtimeState.configReloader.notifyPluginMetadataChanged();
		},
		getConfigReloaderHotReloadStatus: () => runtimeState.configReloader.hotReloadStatus?.(),
		setPostReadySidecars: (sidecars) => {
			runtimeState.postReadySidecars = sidecars;
		},
		setGatewayLifetimeSidecars: (sidecars) => {
			runtimeState.gatewayLifetimeSidecars = sidecars;
		},
		addGatewayLifetimeSidecar: (sidecar) => {
			runtimeState.gatewayLifetimeSidecars.push(sidecar);
		},
		setMaintenanceHandles: (handles) => {
			runtimeState.maintenance = handles;
			runtimeState.stopMediaCleanup = handles.stopMediaCleanup;
		}
	};
	runtimeState.controlUiSessionPullRequests = createControlUiSessionPullRequestSubscriptions({
		broadcastToConnIds,
		isConnectionActive
	});
	runtimeState.sessionViewerPresence = createSessionViewerPresenceDeclarations({
		clients,
		broadcast,
		incrementPresenceVersion,
		getHealthVersion
	});
	deps.cron = runtimeState.cronState.cron;
	const pluginHostServices = { get cron() {
		return runtimeState.cronState.cron;
	} };
	const cronReconciliation = createGatewayCronReconciliation({
		port,
		workspaceDir: defaultWorkspaceDir,
		isClosing: () => lifecycle.closePreludeStarted,
		runHook: async (event, ctx) => {
			try {
				const hookRunner = (await import("./plugins/hook-runner-global.js")).getGlobalHookRunner();
				if (hookRunner?.hasHooks("cron_reconciled")) await hookRunner.runCronReconciled(event, ctx);
			} catch (err) {
				logCron.error(`cron_reconciled hook failed: ${String(err)}`);
			}
		}
	});
	const postReadyState = {
		maintenanceTimer: null,
		retainedPluginCleanupHandle: null
	};
	const clearPostReadyMaintenanceTimer = () => {
		if (!postReadyState.maintenanceTimer) return;
		clearTimeout(postReadyState.maintenanceTimer);
		postReadyState.maintenanceTimer = null;
	};
	let outboundDeliveryRecoveryStopPromise = null;
	const stopOutboundDeliveryRecoveryForClose = () => {
		outboundDeliveryRecoveryStopPromise ??= runtimeState.stopOutboundDeliveryRecovery();
		return outboundDeliveryRecoveryStopPromise;
	};
	let mediaCleanupStopPromise = null;
	const stopMediaCleanupForClose = () => {
		mediaCleanupStopPromise ??= runtimeState.stopMediaCleanup();
		return mediaCleanupStopPromise;
	};
	const markClosePreludeStarted = () => {
		if (lifecycle.closePreludeStarted) return;
		lifecycle.closePreludeStarted = true;
		postReadySidecarStopOwner.beginClose();
		gatewayLifetimeSidecarStopOwner.beginClose();
		stopOutboundDeliveryRecoveryForClose();
		stopMediaCleanupForClose();
		runtimeState.stopGatewayUpdateCheck();
		runtimeState.controlUiSessionPullRequests?.stop();
		runtimeState.sessionViewerPresence?.stop();
		kernel.setDispatchReady(false);
		gatewayInstanceRuntimeRef.current?.close();
		cronReconciliation.invalidate();
		clearPostReadyMaintenanceTimer();
		postReadyState.retainedPluginCleanupHandle?.stop();
		postReadyState.retainedPluginCleanupHandle = null;
	};
	let configReloaderStopPromise = null;
	const stopConfigReloaderForClose = () => {
		configReloaderStopPromise ??= runtimeState.configReloader.stop();
		return configReloaderStopPromise;
	};
	const beginClosePrelude = async () => {
		fenceSessionSuspensionWritesForGatewayShutdown();
		markClosePreludeStarted();
		await Promise.all([
			stopOutboundDeliveryRecoveryForClose(),
			stopMediaCleanupForClose(),
			stopConfigReloaderForClose().catch(() => {})
		]);
	};
	const runClosePrelude = async () => {
		await beginClosePrelude();
		disposeNodeConnectionNotifications(nodeRegistry);
		watchNodeHttpRuntime.close();
		await shutdownRuntime.runGatewayClosePrelude({
			...diagnosticsEnabled ? { stopDiagnostics: stopDiagnosticHeartbeat } : {},
			clearSkillsRefreshTimer: () => {
				if (!runtimeState?.skillsRefreshTimer) return;
				clearTimeout(runtimeState.skillsRefreshTimer);
				runtimeState.skillsRefreshTimer = null;
			},
			skillsChangeUnsub: runtimeState.skillsChangeUnsub,
			disposeAuthRateLimiter: () => {
				authRateLimiter.dispose();
				nodeReapprovalCoordinator.dispose();
			},
			disposeBrowserAuthRateLimiter: () => browserAuthRateLimiter.dispose(),
			stopChannelHealthMonitor: async () => {
				const monitor = runtimeState?.channelHealthMonitor;
				monitor?.shutdown();
				await monitor?.waitForIdle();
			},
			stopReadinessEventLoopHealth: readinessEventLoopHealth.stop,
			closeMcpServer: shutdownRuntime.closeMcpLoopbackServer
		});
	};
	const { getRuntimeSnapshot, startChannels, startChannel, stopChannel, markChannelLoggedOut } = channelManager;
	const refreshGatewayHealthSnapshotWithRuntime = (optsResult) => refreshGatewayHealthSnapshot({
		...optsResult,
		getRuntimeSnapshot,
		getEventLoopHealth: readinessEventLoopHealth.snapshot,
		getConfigReloaderHotReloadStatus: kernel.getConfigReloaderHotReloadStatus
	});
	const postReadySidecarStopOwner = createGatewaySidecarStopOwner({
		getRegistered: () => runtimeState.postReadySidecars,
		setRegistered: (sidecars) => {
			runtimeState.postReadySidecars = sidecars;
		}
	});
	const gatewayLifetimeSidecarStopOwner = createGatewaySidecarStopOwner({
		getRegistered: () => runtimeState.gatewayLifetimeSidecars,
		setRegistered: (sidecars) => {
			runtimeState.gatewayLifetimeSidecars = sidecars;
		}
	});
	const stopRegisteredPostReadySidecars = postReadySidecarStopOwner.stop;
	const stopRegisteredGatewayLifetimeSidecars = gatewayLifetimeSidecarStopOwner.stop;
	const sealAndJoinRegisteredSidecarStops = async () => {
		const failure = (await Promise.allSettled([postReadySidecarStopOwner.sealAndJoin(), gatewayLifetimeSidecarStopOwner.sealAndJoin()])).find((result) => result.status === "rejected");
		if (failure) throw failure.reason;
	};
	const createCloseHandler = () => async (optsValue) => {
		try {
			markClosePreludeStarted();
			const channelIds = listLoadedChannelPlugins().map((plugin) => plugin.id);
			const transport = transportBridge.current();
			await transport?.portalService.closeAll();
			await shutdownRuntime.createGatewayCloseHandler({
				bonjourStop: kernel.swapBonjourStop(null),
				tailscaleCleanup: runtimeState.tailscaleCleanup,
				clearSecretsRuntimeSnapshot: clearSecretsRuntimeSnapshotState,
				channelIds,
				stopChannel,
				pluginServices: runtimeState.pluginServices,
				cron: runtimeState.cronState.cron,
				heartbeatRunner: runtimeState.heartbeatRunner,
				updateCheckStop: runtimeState.stopGatewayUpdateCheck,
				stopTaskRegistryMaintenance: shutdownRuntime.stopTaskRegistryMaintenance,
				nodePresenceTimers,
				broadcast,
				maintenance: runtimeState.maintenance,
				stopMediaCleanup: stopMediaCleanupForClose,
				agentUnsub: runtimeState.agentUnsub,
				heartbeatUnsub: runtimeState.heartbeatUnsub,
				transcriptUnsub: runtimeState.transcriptUnsub,
				lifecycleUnsub: runtimeState.lifecycleUnsub,
				taskUnsub: runtimeState.taskUnsub,
				chatRunState,
				chatAbortControllers,
				chatQueuedTurns,
				restartRecoveryCandidates,
				removeChatRun,
				agentRunSeq,
				nodeSendToSession,
				resolveActiveSessionIdForKey: resolveActiveEmbeddedRunSessionId,
				markMainSessionsAbortedForRestart: async (restart) => {
					await shutdownRuntime.markRestartAbortedMainSessions({
						cfg: getRuntimeConfig(),
						...restart
					});
				},
				getPendingReplyCount: getTotalPendingReplies,
				clients,
				configReloader: { stop: stopConfigReloaderForClose },
				...transport ? {
					wss: transport.wss,
					httpServer: transport.httpServer,
					httpServers: transport.httpServers
				} : {},
				drainActiveSessionsForShutdown: shutdownRuntime.drainActiveSessionsForShutdown,
				disposeAllBundleLspRuntimes: shutdownRuntime.disposeAllBundleLspRuntimes,
				drainRetainedOpenAiEmbeddingProviders: shutdownRuntime.drainRetainedOpenAiEmbeddingProviders,
				stopGmailWatcher: shutdownRuntime.stopGmailWatcher,
				disposeAllCodeModeRuns: shutdownRuntime.disposeAllCodeModeRuns,
				closeProviderTransportDispatcherPool: shutdownRuntime.closeProviderTransportDispatcherPool
			})(optsValue);
		} finally {
			params.releasePluginMetadata();
		}
	};
	const closeOnStartupFailure = async () => {
		await runGatewayShutdownSteps({
			steps: [
				{
					name: "close prelude fence",
					run: beginClosePrelude
				},
				{
					name: "gateway lifetime sidecars",
					run: stopRegisteredGatewayLifetimeSidecars
				},
				{
					name: "post-ready sidecars",
					run: stopRegisteredPostReadySidecars
				},
				{
					name: "gateway close prelude",
					run: runClosePrelude
				},
				{
					name: "late sidecar cleanup",
					run: sealAndJoinRegisteredSidecarStops
				},
				{
					name: "gateway close",
					run: () => createCloseHandler()({ reason: "gateway startup failed" })
				}
			],
			onError: (message) => log.error(message)
		});
	};
	if (diagnosticsEnabled) startDiagnosticHeartbeat(void 0, {
		getConfig: getRuntimeConfig,
		startupGraceMs: 6e4,
		sampleLiveness: () => {
			const sample = readinessEventLoopHealth.persistentDegradationSnapshot();
			if (!sample || sample.degradedSinceMs == null) return null;
			return {
				reasons: sample.reasons,
				intervalMs: sample.intervalMs,
				degradedSinceMs: sample.degradedSinceMs,
				eventLoopDelayP99Ms: sample.delayP99Ms,
				eventLoopDelayMaxMs: sample.delayMaxMs,
				eventLoopUtilization: sample.utilization,
				cpuCoreRatio: sample.cpuCoreRatio
			};
		}
	});
	return {
		...runtime,
		subscribeSessionMessageEvents,
		unsubscribeSessionMessageEvents,
		restartRecoveryCandidates,
		nodeRegistry,
		nodeDesktopService,
		nodePresenceTimers,
		nodeSendToSession,
		nodeSendToAllSubscribed,
		nodeSubscribe,
		nodeUnsubscribe,
		nodeUnsubscribeAll,
		broadcastVoiceWakeChanged,
		broadcastVoiceWakeRoutingChanged,
		hasTalkNodeConnected,
		watchNodeHttpRuntime,
		terminalSessions,
		runtimeState,
		unavailableGatewayMethods,
		kernel,
		pluginHostServices,
		shutdownRuntime,
		lifecycle,
		postReadyState,
		cronReconciliation,
		beginClosePrelude,
		runClosePrelude,
		getRuntimeSnapshot,
		startChannels,
		startChannel,
		stopChannel,
		markChannelLoggedOut,
		refreshGatewayHealthSnapshotWithRuntime,
		stopRegisteredPostReadySidecars,
		stopRegisteredGatewayLifetimeSidecars,
		registerPostReadySidecars: postReadySidecarStopOwner.publish,
		registerGatewayLifetimeSidecars: gatewayLifetimeSidecarStopOwner.publish,
		sealAndJoinRegisteredSidecarStops,
		createCloseHandler,
		closeOnStartupFailure
	};
}
//#endregion
//#region src/gateway/node-reapproval-coordinator.ts
const pendingNodeReapprovalAttempts = new KeyedAsyncQueue();
function normalizeFingerprintList(value) {
	return value ? [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))].toSorted() : void 0;
}
function buildRequestFingerprint(input) {
	const permissions = input.permissions ? Object.fromEntries(Object.entries(input.permissions).toSorted(([left], [right]) => left.localeCompare(right))) : void 0;
	return JSON.stringify({
		nodeId: input.nodeId.trim(),
		clientId: input.clientId,
		clientMode: input.clientMode,
		displayName: input.displayName,
		platform: input.platform,
		version: input.version,
		coreVersion: input.coreVersion,
		uiVersion: input.uiVersion,
		deviceFamily: input.deviceFamily,
		modelIdentifier: input.modelIdentifier,
		caps: normalizeFingerprintList(input.caps),
		commands: normalizeFingerprintList(input.commands),
		permissions,
		remoteIp: input.remoteIp,
		silent: Boolean(input.silent)
	});
}
/** Creates the gateway-lifetime owner for paired-node reapproval write limits. */
function createNodeReapprovalCoordinator(config) {
	const limiter = createAuthRateLimiter({
		...config,
		exemptLoopback: false
	});
	const requestStates = /* @__PURE__ */ new Map();
	let disposed = false;
	const executeRequest = async ({ input, cleanupClaim, baseDir }) => {
		if (disposed) return null;
		const reused = await reusePendingNodePairingForReconnect(input, cleanupClaim, baseDir);
		if (reused) return reused;
		const nodeId = input.nodeId.trim();
		const identityKey = buildRateLimitIdentityKey("node", nodeId);
		if (!limiter.check(identityKey, "node-reapproval").allowed) return null;
		const result = await requestNodePairing(input, baseDir);
		limiter.recordFailure(identityKey, AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL);
		return result;
	};
	const finishActiveRequest = (nodeId, state, fingerprint) => {
		if (requestStates.get(nodeId) !== state || state.activeFingerprint !== fingerprint) return;
		if (!state.queued) requestStates.delete(nodeId);
	};
	const startFirstRequest = (nodeId, state, request) => {
		pendingNodeReapprovalAttempts.enqueue(`node-reapproval:${nodeId}`, async () => {
			try {
				request.deferred.resolve(await executeRequest(request.params));
			} catch (error) {
				request.deferred.reject(error);
			} finally {
				finishActiveRequest(nodeId, state, request.fingerprint);
			}
		});
	};
	const startQueuedRequest = (nodeId, state) => {
		pendingNodeReapprovalAttempts.enqueue(`node-reapproval:${nodeId}`, async () => {
			const queued = state.queued;
			if (!queued) return;
			state.queued = void 0;
			state.activeFingerprint = queued.fingerprint;
			try {
				queued.deferred.resolve(await executeRequest(queued.params));
				for (const follower of queued.followers) follower.resolve(null);
			} catch (error) {
				queued.deferred.reject(error);
				for (const follower of queued.followers) follower.reject(error);
			} finally {
				finishActiveRequest(nodeId, state, queued.fingerprint);
			}
		});
	};
	return {
		request(params) {
			if (disposed) return Promise.resolve(null);
			const nodeId = params.input.nodeId.trim();
			const fingerprint = buildRequestFingerprint(params.input);
			const state = requestStates.get(nodeId);
			if (!state) {
				const deferred = createDeferredCore();
				const nextState = { activeFingerprint: fingerprint };
				requestStates.set(nodeId, nextState);
				startFirstRequest(nodeId, nextState, {
					fingerprint,
					params,
					deferred,
					followers: []
				});
				return deferred.promise;
			}
			if (state.queued?.fingerprint === fingerprint) {
				const follower = createDeferredCore();
				state.queued.params = params;
				state.queued.followers.push(follower);
				return follower.promise;
			}
			const deferred = createDeferredCore();
			if (state.queued) {
				state.queued.deferred.resolve(null);
				for (const follower of state.queued.followers) follower.resolve(null);
				state.queued = {
					fingerprint,
					params,
					deferred,
					followers: []
				};
			} else {
				state.queued = {
					fingerprint,
					params,
					deferred,
					followers: []
				};
				startQueuedRequest(nodeId, state);
			}
			return deferred.promise;
		},
		async finalizeCleanup(claim) {
			return await pendingNodeReapprovalAttempts.enqueue(`node-reapproval:${claim.nodeId}`, async () => await finalizeNodePairingCleanupClaim(claim));
		},
		dispose() {
			disposed = true;
			for (const state of requestStates.values()) {
				state.queued?.deferred.resolve(null);
				for (const follower of state.queued?.followers ?? []) follower.resolve(null);
			}
			requestStates.clear();
			limiter.dispose();
		}
	};
}
//#endregion
//#region src/gateway/event-web-push.ts
const EVENT_PUSH_TTL_SECONDS = 300;
function resolveEventWebPushNotification(event, payload) {
	const value = isRecord(payload) ? payload : null;
	if (!value) return null;
	if (event === "question.requested") return {
		category: "agent-question",
		title: "OpenClaw needs an answer",
		body: "An agent has a question for you.",
		tag: `openclaw-question-${normalizeWebPushDisplayLabel(value.id) ?? "pending"}`
	};
	if (event === "chat" && value.state === "final" && !isTranscriptOnlyOpenClawAssistantMessage(value.message)) return {
		category: "agent-finished",
		title: "OpenClaw agent finished",
		body: "An agent completed its response.",
		tag: `openclaw-agent-finished-${normalizeWebPushDisplayLabel(value.runId) ?? "finished"}`
	};
	if (event === "task" && value.action === "upserted") {
		const task = isRecord(value.task) ? value.task : null;
		if (task?.status !== "failed" && task?.status !== "timed_out") return null;
		const taskId = normalizeWebPushDisplayLabel(task.id) ?? "failed";
		const taskTitle = normalizeWebPushDisplayLabel(task.title);
		return {
			category: "background-task-failed",
			title: "OpenClaw background task failed",
			body: "A background task needs attention.",
			...taskTitle ? { identifiedBody: `${taskTitle} needs attention.` } : {},
			tag: `openclaw-task-failed-${taskId}`
		};
	}
	if (event === "cron" && value.action === "finished" && value.status === "error") {
		const job = isRecord(value.job) ? value.job : null;
		const jobId = normalizeWebPushDisplayLabel(value.jobId) ?? "failed";
		const jobName = normalizeWebPushDisplayLabel(job?.name);
		return {
			category: "scheduled-task-failed",
			title: "OpenClaw scheduled task failed",
			body: "A scheduled task needs attention.",
			...jobName ? { identifiedBody: `${jobName} needs attention.` } : {},
			tag: `openclaw-cron-failed-${jobId}`
		};
	}
	return null;
}
function preferenceFor(subscription, stateDir) {
	const profileId = subscription.userProfileId ? resolveUserProfileId(subscription.userProfileId) : void 0;
	const user = profileId ? getUserPreferences(profileId, [WEB_PUSH_USER_PREFERENCES_KEY], stateDir ? { env: {
		...process.env,
		OPENCLAW_STATE_DIR: stateDir
	} } : {})[WEB_PUSH_USER_PREFERENCES_KEY] : void 0;
	return resolveEffectiveWebPushPreferences({
		user,
		device: subscription.devicePreferences
	});
}
/** Routes attention events to offline browsers without expanding live session visibility. */
function createEventWebPushDelivery(params) {
	return { handleEvent(event, payload, opts) {
		const notification = resolveEventWebPushNotification(event, payload);
		if (!notification) return;
		(async () => {
			if (listBoundWebPushSubscriptions(params.stateDir).length === 0) return;
			const sender = await prepareWebPushNotificationSender(params.stateDir);
			const cfg = params.getRuntimeConfig();
			const targets = listCurrentWebPushTargets({
				cfg,
				requiredScopes: notification.category === "agent-question" ? [READ_SCOPE, QUESTIONS_SCOPE] : [READ_SCOPE],
				stateDir: params.stateDir
			});
			const agentId = normalizeOptionalString(opts?.agentId ?? (isRecord(payload) ? payload.agentId : void 0));
			const agentLabel = normalizeWebPushDisplayLabel(agentId);
			const groups = /* @__PURE__ */ new Map();
			for (const target of targets) {
				const subscription = target.subscription;
				const preferences = preferenceFor(subscription, params.stateDir);
				if (!webPushCategoryEnabled(preferences, notification.category) || isWebPushQuietHours(preferences) || !webPushAgentAllowed(preferences, agentId)) continue;
				const sessionKeys = opts?.sessionKeys ?? [];
				if (sessionKeys.length > 0 && !canReceiveSessionEvent({
					cfg,
					client: webPushTargetClient(target),
					sessionKeys,
					...agentId ? { agentId } : {},
					event,
					payload
				})) continue;
				if (cfg.gateway?.roles && sessionKeys.length === 0) continue;
				const title = `${preferences.label ? `${preferences.label} · ` : ""}${notification.title}`;
				const body = preferences.detailLevel === "private" ? notification.body : notification.identifiedBody ?? (agentLabel ? `${agentLabel}: ${notification.body}` : notification.body);
				const key = JSON.stringify({
					title,
					body
				});
				const group = groups.get(key) ?? {
					title,
					body,
					subscriptions: []
				};
				group.subscriptions.push(subscription);
				groups.set(key, group);
			}
			const topic = createHash("sha256").update(notification.tag).digest("base64url").slice(0, 32);
			await Promise.all([...groups.values()].map((group) => sender({
				subscriptions: group.subscriptions,
				payload: {
					title: group.title,
					body: group.body,
					tag: notification.tag,
					renotify: false
				},
				deliveryOptions: {
					TTL: EVENT_PUSH_TTL_SECONDS,
					urgency: notification.category.includes("failed") ? "high" : "normal",
					topic
				}
			})));
		})().catch((error) => {
			params.log?.warn?.(`event Web Push delivery failed event=${event}: ${String(error)}`);
		});
	} };
}
//#endregion
//#region src/gateway/server/client-registry.ts
var GatewayClientRegistry = class extends Set {
	#byConnectionId = /* @__PURE__ */ new Map();
	#nextOrder = 0;
	constructor(clients) {
		super();
		for (const client of clients ?? []) this.add(client);
	}
	add(client) {
		if (!this.has(client)) this.#byConnectionId.set(client.connId, {
			client,
			order: this.#nextOrder++
		});
		return super.add(client);
	}
	delete(client) {
		if (!super.delete(client)) return false;
		if (this.#byConnectionId.get(client.connId)?.client === client) this.#byConnectionId.delete(client.connId);
		return true;
	}
	clear() {
		super.clear();
		this.#byConnectionId.clear();
	}
	getByConnectionId(connId) {
		return this.#byConnectionId.get(connId)?.client;
	}
	getByConnectionIds(connIds) {
		const indexed = [];
		for (const connId of connIds) {
			const entry = this.#byConnectionId.get(connId);
			if (entry) indexed.push(entry);
		}
		if (indexed.length > 1) indexed.sort((a, b) => a.order - b.order);
		return indexed.map((entry) => entry.client);
	}
};
//#endregion
//#region src/gateway/server-broadcast.ts
const EVENT_SCOPE_GUARDS = {
	agent: [READ_SCOPE],
	chat: [READ_SCOPE],
	"chat.metadata.changed": [READ_SCOPE],
	"board.changed": [READ_SCOPE],
	"board.command": [READ_SCOPE],
	"progressCard.changed": [READ_SCOPE],
	"ui.command": [READ_SCOPE],
	"chat.send_timing": [READ_SCOPE],
	"chat.side_result": [READ_SCOPE],
	cron: [READ_SCOPE],
	health: [],
	"exec.approval.requested": [APPROVALS_SCOPE],
	"exec.approval.resolved": [APPROVALS_SCOPE],
	"question.requested": [QUESTIONS_SCOPE],
	"question.resolved": [QUESTIONS_SCOPE],
	heartbeat: [],
	"plugin.approval.requested": [APPROVALS_SCOPE],
	"plugin.approval.resolved": [APPROVALS_SCOPE],
	"openclaw.approval.requested": [APPROVALS_SCOPE],
	"openclaw.approval.resolved": [APPROVALS_SCOPE],
	presence: [READ_SCOPE],
	shutdown: [],
	"gateway.suspension": [],
	tick: [],
	"talk.event": [READ_SCOPE],
	"talk.mode": [TALK_SCOPE],
	task: [READ_SCOPE],
	"task.suggestion": [READ_SCOPE],
	"update.available": [],
	"config.changed": [READ_SCOPE],
	"users.prefs.changed": [READ_SCOPE],
	"skills.changed": [READ_SCOPE],
	"voicewake.changed": [READ_SCOPE],
	"voicewake.routing.changed": [READ_SCOPE],
	[GATEWAY_EVENT_DEVICE_PAIR_CHANGED]: [PAIRING_SCOPE],
	"device.pair.requested": [PAIRING_SCOPE],
	"device.pair.resolved": [PAIRING_SCOPE],
	"device.pair.setup.completed": [PAIRING_SCOPE],
	"device.pair.setup.deliveryUncertain": [PAIRING_SCOPE],
	"node.pair.requested": [PAIRING_SCOPE],
	"node.pair.resolved": [PAIRING_SCOPE],
	"node.presence": [READ_SCOPE],
	[GATEWAY_EVENT_NODE_RUNNER_INVENTORY_CHANGED]: [READ_SCOPE],
	"sessions.catalog.host": [READ_SCOPE],
	"sessions.changed": [READ_SCOPE],
	"controlUi.sessionPullRequests.changed": [READ_SCOPE],
	"session.approval": [APPROVALS_SCOPE],
	"session.message": [READ_SCOPE],
	"session.observer": [READ_SCOPE],
	"session.operation": [READ_SCOPE],
	"session.sharing": [READ_SCOPE],
	"session.sharing.evidence": [READ_SCOPE],
	"session.suggestion": [READ_SCOPE],
	"session.typing": [READ_SCOPE],
	"session.tool": [READ_SCOPE],
	"terminal.data": [ADMIN_SCOPE],
	"terminal.exit": [ADMIN_SCOPE],
	"portal.changed": [READ_SCOPE]
};
const log$2 = createSubsystemLogger("gateway/broadcast");
const SESSION_SUBSCRIPTION_EVENTS = /* @__PURE__ */ new Set([
	"agent",
	"chat",
	"chat.side_result",
	"session.observer",
	"session.tool"
]);
function serializeFrameField(name, value) {
	const fieldJSON = JSON.stringify({ [name]: value });
	const keyJSON = JSON.stringify(name);
	const prefix = `{${keyJSON}:`;
	return fieldJSON.startsWith(prefix) ? `,${keyJSON}:${fieldJSON.slice(prefix.length, -1)}` : "";
}
function resolveBroadcastSessionScope(payload, explicit, explicitAgentId) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {
		sessionKeys: explicit ?? [],
		...explicitAgentId ? { agentId: explicitAgentId } : {}
	};
	const record = payload;
	const source = [
		record,
		record.suggestion,
		record.request
	].find((candidate) => typeof candidate?.sessionKey === "string" && candidate.sessionKey.trim());
	const sessionKey = typeof source?.sessionKey === "string" ? source.sessionKey.trim() : "";
	const agentId = explicitAgentId ?? (typeof source?.agentId === "string" ? source.agentId.trim() || void 0 : void 0);
	return {
		sessionKeys: explicit?.length ? explicit : sessionKey ? [sessionKey] : [],
		...agentId ? { agentId } : {}
	};
}
function hasEventScope(client, event, explicitPluginScope) {
	if (client.connectionKind === "worker") return false;
	const role = client.connect.role ?? "operator";
	const scopes = Array.isArray(client.connect.scopes) ? client.connect.scopes : [];
	if (explicitPluginScope) {
		if (role !== "operator") return false;
		if (scopes.includes("operator.admin")) return true;
		return explicitPluginScope === "operator.read" ? scopes.includes("operator.read") || scopes.includes("operator.write") : explicitPluginScope === "operator.write" && scopes.includes("operator.write");
	}
	const required = EVENT_SCOPE_GUARDS[event];
	if (!required && event.startsWith("plugin.")) {
		if (role !== "operator") return false;
		return scopes.includes("operator.write") || scopes.includes("operator.admin");
	}
	if (!required) return false;
	if (required.length === 0) return true;
	if (role !== "operator") return false;
	if (scopes.includes("operator.admin")) return true;
	if (required.includes("operator.read")) return scopes.includes("operator.read") || scopes.includes("operator.write");
	if (required.includes("operator.talk")) return scopes.includes("operator.talk") || scopes.includes("operator.write");
	return required.some((scope) => scopes.includes(scope));
}
function createGatewayBroadcaster(params) {
	const clientSeq = /* @__PURE__ */ new WeakMap();
	const reportedSlowPayloadClients = /* @__PURE__ */ new WeakSet();
	const indexedClients = params.clients instanceof GatewayClientRegistry ? params.clients : void 0;
	const broadcastInternal = (event, payload, opts, targetConnIds, explicitPluginScope) => {
		if (event === "sessions.changed") queuePluginSessionsChanged(payload);
		if (params.clients.size === 0) return;
		const { sessionKeys, agentId } = resolveBroadcastSessionScope(payload, opts?.sessionKeys, opts?.agentId);
		const isTargeted = Boolean(targetConnIds);
		const presencePayload = event === "presence" ? payload : void 0;
		let projectPresence;
		let outboundEventLogged = false;
		let frameBase;
		const getFrameBase = () => {
			if (!frameBase) frameBase = {
				eventJSON: JSON.stringify(event),
				payloadFragment: presencePayload ? "" : serializeFrameField("payload", payload),
				stateVersionFragment: opts?.stateVersion === void 0 ? "" : serializeFrameField("stateVersion", opts.stateVersion)
			};
			return frameBase;
		};
		const sessionSubscriptionVerified = opts?.sessionSubscriptionVerified === true;
		const isSessionSubscriptionEvent = SESSION_SUBSCRIPTION_EVENTS.has(event);
		const sessionMessageSubscribers = params.sessionMessageSubscribers;
		let sessionSubscriberConnIdsByKey;
		const recipients = targetConnIds && indexedClients ? indexedClients.getByConnectionIds(targetConnIds) : params.clients;
		for (const c of recipients) {
			if (c.invalidated === true || c.socket.readyState !== 1) continue;
			if (targetConnIds && !indexedClients && !targetConnIds.has(c.connId)) continue;
			if (!hasEventScope(c, event, explicitPluginScope)) continue;
			if (sessionKeys.length > 0 && params.canReceiveSessionEvent && !params.canReceiveSessionEvent(c, sessionKeys, agentId, event, payload)) continue;
			if ((event === "session.typing" || (isBrowserCopilotClient(c.connect.client) || hasGatewayClientCap(c.connect.caps, GATEWAY_CLIENT_CAPS.SESSION_SCOPED_EVENTS)) && isSessionSubscriptionEvent) && !(isTargeted && sessionSubscriptionVerified)) {
				if (!sessionKeys.length || !sessionMessageSubscribers) continue;
				sessionSubscriberConnIdsByKey ??= [];
				let subscribed = false;
				let sessionKeyIndex = 0;
				for (const sessionKey of sessionKeys) {
					if ((sessionSubscriberConnIdsByKey[sessionKeyIndex] ??= sessionMessageSubscribers.get(sessionKey)).has(c.connId)) {
						subscribed = true;
						break;
					}
					sessionKeyIndex += 1;
				}
				if (!subscribed) continue;
			}
			if (!outboundEventLogged) {
				outboundEventLogged = true;
				logWs("out", "event", () => {
					const logMeta = {
						event,
						seq: "per-client",
						clients: params.clients.size,
						targets: targetConnIds ? targetConnIds.size : void 0,
						dropIfSlow: opts?.dropIfSlow,
						presenceVersion: opts?.stateVersion?.presence,
						healthVersion: opts?.stateVersion?.health
					};
					if (event === "agent") Object.assign(logMeta, summarizeAgentEventForWsLog(payload));
					return logMeta;
				});
			}
			const nextSeq = (clientSeq.get(c) ?? 0) + 1;
			const slow = c.socket.bufferedAmount > MAX_BUFFERED_BYTES;
			if (!slow) reportedSlowPayloadClients.delete(c);
			else if (!reportedSlowPayloadClients.has(c)) {
				reportedSlowPayloadClients.add(c);
				logRejectedLargePayload({
					surface: "gateway.ws.outbound_buffer",
					bytes: c.socket.bufferedAmount,
					limitBytes: MAX_BUFFERED_BYTES,
					reason: opts?.dropIfSlow ? "ws_send_buffer_drop" : "ws_send_buffer_close"
				});
			}
			if (slow && opts?.dropIfSlow) {
				clientSeq.set(c, nextSeq);
				continue;
			}
			if (slow) {
				try {
					c.socket.close(1008, "slow consumer");
				} catch {}
				c.socket.terminate();
				continue;
			}
			let frame;
			try {
				const base = getFrameBase();
				let payloadFragment = base.payloadFragment;
				if (presencePayload) {
					if (!params.preparePresenceProjection) throw new Error("presence recipient projection unavailable");
					projectPresence ??= params.preparePresenceProjection(presencePayload.presence);
					payloadFragment = serializeFrameField("payload", {
						...presencePayload,
						presence: projectPresence(c)
					});
				}
				frame = `{"type":"event","event":${base.eventJSON}${payloadFragment},"seq":${nextSeq}${base.stateVersionFragment}}`;
			} catch (err) {
				log$2.error(`broadcast serialization failed for event ${event}: ${formatErrorMessage(err)}`);
				return;
			}
			clientSeq.set(c, nextSeq);
			try {
				c.socket.send(frame);
			} catch (err) {
				log$2.error(`broadcast send failed conn=${c.connId}: ${formatErrorMessage(err)}`, { event });
				c.socket.terminate();
			}
		}
	};
	const broadcast = (event, payload, opts) => {
		params.onBroadcast?.(event, payload, opts);
		broadcastInternal(event, payload, opts);
	};
	const broadcastToConnIds = (event, payload, connIds, opts) => {
		broadcastInternal(event, payload, opts, connIds);
	};
	const getBufferedAmount = (connId) => {
		if (indexedClients) return indexedClients.getByConnectionId(connId)?.socket.bufferedAmount;
		for (const client of params.clients) if (client.connId === connId) return client.socket.bufferedAmount;
	};
	const broadcastPluginEvent = (event, payload, scope) => {
		if (!event.startsWith("plugin.") || event.startsWith("plugin.approval.")) throw new Error(`invalid plugin gateway event: ${event}`);
		if (scope !== "operator.read" && scope !== "operator.write" && scope !== "operator.admin") throw new Error("invalid plugin gateway event scope");
		broadcastInternal(event, payload, void 0, void 0, scope);
	};
	return {
		broadcast,
		broadcastToConnIds,
		broadcastPluginEvent,
		getBufferedAmount
	};
}
//#endregion
//#region src/gateway/server-connection-state.ts
/** Creates transport-independent connection, subscription, and run state. */
function createGatewayConnectionState(params) {
	const loadRuntimeConfig = params.getRuntimeConfig ?? (() => params.cfg);
	const clients = new GatewayClientRegistry();
	const isConnectionActive = (connId) => {
		const client = clients.getByConnectionId(connId);
		return Boolean(client && !client.invalidated);
	};
	const sessionEventSubscribers = createSessionEventSubscriberRegistry(isConnectionActive);
	const sessionMessageSubscribers = createSessionMessageSubscriberRegistry(isConnectionActive);
	const eventWebPush = createEventWebPushDelivery({ getRuntimeConfig: loadRuntimeConfig });
	const gatewayBroadcaster = createGatewayBroadcaster({
		clients,
		preparePresenceProjection: (presence) => createPresenceRecipientProjection({
			cfg: loadRuntimeConfig(),
			presence
		}),
		sessionMessageSubscribers,
		canReceiveSessionEvent: (client, sessionKeys, agentId, event, payload) => canReceiveSessionEvent({
			cfg: loadRuntimeConfig(),
			client,
			sessionKeys,
			agentId,
			event,
			payload
		}),
		onBroadcast: (event, payload, opts) => eventWebPush.handleEvent(event, payload, opts)
	});
	const agentRunSeq = /* @__PURE__ */ new Map();
	const dedupe = /* @__PURE__ */ new Map();
	const chatRunState = createChatRunState();
	const chatRunRegistry = chatRunState.registry;
	const addChatRun = chatRunRegistry.add;
	const removeChatRun = chatRunRegistry.remove;
	const chatAbortControllers = /* @__PURE__ */ new Map();
	const chatQueuedTurns = /* @__PURE__ */ new Map();
	const toolEventRecipients = chatRunState.toolEventRecipients;
	return {
		clients,
		isConnectionActive,
		...gatewayBroadcaster,
		agentRunSeq,
		dedupe,
		chatRunState,
		addChatRun,
		removeChatRun,
		chatAbortControllers,
		chatQueuedTurns,
		toolEventRecipients,
		sessionEventSubscribers,
		sessionMessageSubscribers
	};
}
//#endregion
//#region src/gateway/control-ui-asset-manifest.ts
const CONTROL_UI_ASSET_MANIFEST_FILENAME = "asset-manifest.json";
function hashControlUiAssetManifestEntries(entries) {
	const hash = createHash("sha256");
	for (const entry of entries) {
		hash.update(entry.path);
		hash.update("\0");
		hash.update(String(entry.size));
		hash.update("\0");
		hash.update(entry.sha256);
		hash.update("\n");
	}
	return hash.digest("hex");
}
//#endregion
//#region src/gateway/control-ui-asset-manifest-parse.ts
const CONTROL_UI_ASSET_SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CONTROL_UI_ASSET_MANIFEST_MAX_ENTRIES = 8192;
const CONTROL_UI_ASSET_MANIFEST_MAX_FILE_BYTES = 67108864;
const CONTROL_UI_ASSET_MANIFEST_MAX_TOTAL_BYTES = 536870912;
function hasExactKeys(record, keys) {
	const actual = Object.keys(record);
	return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function isControlUiAssetManifestPath(value) {
	if (!value.startsWith("assets/") || value.includes("\\") || value.includes("\0")) return false;
	const normalized = path.posix.normalize(value);
	return normalized === value && !normalized.endsWith("/");
}
function parseControlUiAssetManifest(value) {
	if (!isRecord(value) || !hasExactKeys(value, [
		"assets",
		"generation",
		"version"
	])) return null;
	if (value.version !== 1 || typeof value.generation !== "string" || !CONTROL_UI_ASSET_SHA256_PATTERN.test(value.generation) || !Array.isArray(value.assets) || value.assets.length === 0 || value.assets.length > CONTROL_UI_ASSET_MANIFEST_MAX_ENTRIES) return null;
	const assets = [];
	const paths = /* @__PURE__ */ new Set();
	let totalBytes = 0;
	for (const candidate of value.assets) {
		if (!isRecord(candidate) || !hasExactKeys(candidate, [
			"path",
			"sha256",
			"size"
		])) return null;
		const assetPath = candidate.path;
		const size = candidate.size;
		const sha256 = candidate.sha256;
		if (typeof assetPath !== "string" || !isControlUiAssetManifestPath(assetPath) || paths.has(assetPath) || typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 || size > CONTROL_UI_ASSET_MANIFEST_MAX_FILE_BYTES || typeof sha256 !== "string" || !CONTROL_UI_ASSET_SHA256_PATTERN.test(sha256)) return null;
		totalBytes += size;
		if (totalBytes > CONTROL_UI_ASSET_MANIFEST_MAX_TOTAL_BYTES) return null;
		paths.add(assetPath);
		assets.push({
			path: assetPath,
			sha256,
			size
		});
	}
	for (let index = 1; index < assets.length; index += 1) if (assets[index - 1].path.localeCompare(assets[index].path) > 0) return null;
	if (hashControlUiAssetManifestEntries(assets) !== value.generation) return null;
	return {
		version: 1,
		generation: value.generation,
		assets
	};
}
//#endregion
//#region src/gateway/control-ui-asset-retention.ts
const CONTROL_UI_RETAINED_GENERATION_LIMIT = 3;
const CONTROL_UI_RETAINED_ASSET_MAX_BYTES = 100663296;
const CONTROL_UI_GENERATION_PATTERN = /^[a-f0-9]{64}$/u;
const CONTROL_UI_STAGING_PATTERN = /^\.staging-[0-9]+-[a-f0-9-]+$/u;
const CONTROL_UI_STAGING_MAX_AGE_MS = 36e5;
const CONTROL_UI_MANIFEST_MAX_BYTES = 4194304;
const CONTROL_UI_ASSET_IO_BUFFER_BYTES = 65536;
function resolveControlUiAssetCacheDir() {
	return path.join(resolveStateDir(), "cache", "control-ui-assets");
}
function throwIfCancelled(operation) {
	operation?.signal?.throwIfAborted();
	if (operation?.isCancelled?.()) throw new DOMException("Control UI asset retention cancelled", "AbortError");
}
async function readCachedGeneration(directory, operation) {
	try {
		throwIfCancelled(operation);
		const stats = await fs$1.lstat(directory);
		if (stats.isSymbolicLink() || !stats.isDirectory()) return null;
		const realPath = await fs$1.realpath(directory);
		if (!isWithinDir(path.dirname(directory), realPath)) return null;
		const manifest = await readAssetManifest(realPath, operation);
		if (manifest.generation !== path.basename(directory)) return null;
		for (const asset of manifest.assets) await verifyAsset({
			entry: asset,
			operation,
			root: realPath,
			rootRealPath: realPath
		});
		const currentStats = await fs$1.lstat(directory);
		throwIfCancelled(operation);
		if (!sameDirectory(stats, currentStats)) return null;
		return {
			assetPaths: new Set(manifest.assets.map((asset) => asset.path)),
			bytes: manifest.assets.reduce((total, asset) => total + asset.size, 0),
			directory,
			generation: manifest.generation,
			stats: currentStats,
			realPath
		};
	} catch {
		throwIfCancelled(operation);
		return null;
	}
}
function sameDirectory(left, right) {
	return right.isDirectory() && !right.isSymbolicLink() && left.dev === right.dev && left.ino === right.ino;
}
function compareGenerations(left, right) {
	return right.stats.mtimeMs - left.stats.mtimeMs || left.generation.localeCompare(right.generation);
}
async function readCacheInventory(cacheDir, operation, verified = []) {
	const generations = [];
	const directories = /* @__PURE__ */ new Map();
	let cacheRealPath;
	let entries;
	try {
		throwIfCancelled(operation);
		cacheRealPath = await fs$1.realpath(cacheDir);
		entries = await fs$1.readdir(cacheRealPath, { withFileTypes: true });
	} catch {
		throwIfCancelled(operation);
		return {
			generations,
			directories
		};
	}
	const known = new Map(verified.map((generation) => [generation.generation, generation]));
	for (const entry of entries) {
		throwIfCancelled(operation);
		if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
		const directory = path.join(cacheRealPath, entry.name);
		const stats = await fs$1.lstat(directory).catch(() => null);
		if (!stats || !stats.isDirectory() || stats.isSymbolicLink()) continue;
		directories.set(directory, stats);
		if (!CONTROL_UI_GENERATION_PATTERN.test(entry.name)) continue;
		const previous = known.get(entry.name);
		const generation = previous && sameDirectory(previous.stats, stats) ? {
			...previous,
			stats
		} : await readCachedGeneration(directory, operation);
		if (generation) generations.push(generation);
	}
	throwIfCancelled(operation);
	return {
		generations: generations.toSorted(compareGenerations),
		directories
	};
}
async function readAssetManifest(root, operation) {
	const manifestPath = path.join(root, CONTROL_UI_ASSET_MANIFEST_FILENAME);
	throwIfCancelled(operation);
	const stats = await fs$1.lstat(manifestPath);
	throwIfCancelled(operation);
	if (stats.isSymbolicLink() || !stats.isFile() || stats.size > CONTROL_UI_MANIFEST_MAX_BYTES) throw new Error(`Invalid Control UI asset manifest: ${manifestPath}`);
	const manifest = parseControlUiAssetManifest(JSON.parse(await fs$1.readFile(manifestPath, {
		encoding: "utf8",
		signal: operation?.signal
	})));
	throwIfCancelled(operation);
	if (!manifest) throw new Error(`Invalid Control UI asset manifest: ${manifestPath}`);
	return manifest;
}
async function verifyAsset(params) {
	throwIfCancelled(params.operation);
	const sourcePath = path.resolve(params.root, params.entry.path);
	if (!isWithinDir(params.root, sourcePath)) throw new Error(`Unsafe Control UI asset path: ${params.entry.path}`);
	const expectedRealPath = await fs$1.realpath(sourcePath);
	if (!isWithinDir(params.rootRealPath, expectedRealPath)) throw new Error(`Unsafe Control UI asset path: ${params.entry.path}`);
	const initialStats = await fs$1.lstat(sourcePath);
	if (initialStats.isSymbolicLink() || !initialStats.isFile()) throw new Error(`Unsafe Control UI asset: ${params.entry.path}`);
	const source = await fs$1.open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
	let destination;
	try {
		if (params.destination) destination = await fs$1.open(params.destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 384);
		const hash = createHash("sha256");
		let offset = 0;
		for (;;) {
			throwIfCancelled(params.operation);
			const { bytesRead } = await source.read(params.operation.scratch, 0, params.operation.scratch.length, offset);
			throwIfCancelled(params.operation);
			if (bytesRead === 0) break;
			offset += bytesRead;
			if (offset > params.entry.size) throw new Error(`Control UI asset changed while being retained: ${params.entry.path}`);
			hash.update(params.operation.scratch.subarray(0, bytesRead));
			if (!destination) continue;
			for (let written = 0; written < bytesRead;) {
				throwIfCancelled(params.operation);
				const { bytesWritten } = await destination.write(params.operation.scratch, written, bytesRead - written, offset - bytesRead + written);
				throwIfCancelled(params.operation);
				if (bytesWritten === 0) throw new Error(`Control UI asset write made no progress: ${params.entry.path}`);
				written += bytesWritten;
			}
		}
		const openedStats = await source.stat();
		const currentStats = await fs$1.lstat(sourcePath);
		const currentRealPath = await fs$1.realpath(sourcePath);
		if (!openedStats.isFile() || openedStats.size !== params.entry.size || currentStats.isSymbolicLink() || !currentStats.isFile() || currentRealPath !== expectedRealPath || currentStats.dev !== openedStats.dev || currentStats.ino !== openedStats.ino || offset !== params.entry.size || hash.digest("hex") !== params.entry.sha256) throw new Error(`Control UI asset changed while being retained: ${params.entry.path}`);
		throwIfCancelled(params.operation);
	} finally {
		await Promise.allSettled([source.close(), destination?.close()]);
	}
}
async function publishGeneration(params) {
	const target = path.join(await fs$1.realpath(params.cacheDir), params.manifest.generation);
	const stats = await fs$1.lstat(target).catch((error) => {
		if (!isErrno(error) || error.code !== "ENOENT") throw error;
		return null;
	});
	const verified = stats && (params.verified && sameDirectory(params.verified.stats, stats) ? params.verified : await readCachedGeneration(target, params.operation));
	if (verified) {
		throwIfCancelled(params.operation);
		await fs$1.utimes(target, /* @__PURE__ */ new Date(), /* @__PURE__ */ new Date());
		return verified;
	}
	const staging = path.join(params.cacheDir, `.staging-${process.pid}-${randomUUID()}`);
	throwIfCancelled(params.operation);
	await fs$1.mkdir(staging, {
		recursive: false,
		mode: 448
	});
	try {
		const rootRealPath = await fs$1.realpath(params.root);
		let preparedDirectory;
		for (const entry of params.manifest.assets) {
			throwIfCancelled(params.operation);
			const destination = path.join(staging, entry.path);
			const directory = path.dirname(destination);
			if (directory !== preparedDirectory) {
				await fs$1.mkdir(directory, {
					recursive: true,
					mode: 448
				});
				preparedDirectory = directory;
			}
			await verifyAsset({
				destination,
				entry,
				operation: params.operation,
				root: params.root,
				rootRealPath
			});
		}
		throwIfCancelled(params.operation);
		await fs$1.writeFile(path.join(staging, CONTROL_UI_ASSET_MANIFEST_FILENAME), `${JSON.stringify(params.manifest)}\n`, {
			mode: 384,
			signal: params.operation?.signal
		});
		throwIfCancelled(params.operation);
		let collision;
		try {
			await fs$1.rename(staging, target);
		} catch (error) {
			if (!isErrno(error) || error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
			collision = error;
		}
		const published = await readCachedGeneration(target, params.operation);
		if (!published) throw collision ?? /* @__PURE__ */ new Error(`Invalid retained Control UI generation: ${target}`);
		throwIfCancelled(params.operation);
		await fs$1.utimes(target, /* @__PURE__ */ new Date(), /* @__PURE__ */ new Date());
		return published;
	} finally {
		await fs$1.rm(staging, {
			recursive: true,
			force: true
		});
	}
}
async function pruneRetainedGenerations(params) {
	const inventory = await readCacheInventory(params.cacheDir, params.operation, params.verified);
	const generations = inventory.generations.toSorted((left, right) => {
		if (left.generation === params.currentGeneration) return -1;
		if (right.generation === params.currentGeneration) return 1;
		return compareGenerations(left, right);
	});
	const retained = /* @__PURE__ */ new Set();
	let retainedBytes = 0;
	for (const generation of generations) if (retained.size < CONTROL_UI_RETAINED_GENERATION_LIMIT && retainedBytes + generation.bytes <= CONTROL_UI_RETAINED_ASSET_MAX_BYTES) {
		retained.add(generation.generation);
		retainedBytes += generation.bytes;
	}
	for (const [target, stats] of inventory.directories) {
		throwIfCancelled(params.operation);
		const name = path.basename(target);
		const generation = CONTROL_UI_GENERATION_PATTERN.test(name);
		const staleStaging = CONTROL_UI_STAGING_PATTERN.test(name) && params.now - stats.mtimeMs >= CONTROL_UI_STAGING_MAX_AGE_MS;
		if ((!generation || retained.has(name)) && !staleStaging) continue;
		const currentStats = await fs$1.lstat(target).catch(() => null);
		throwIfCancelled(params.operation);
		if (!currentStats || !sameDirectory(stats, currentStats) || stats.mtimeMs !== currentStats.mtimeMs) continue;
		await fs$1.rm(target, {
			recursive: true,
			force: true
		});
	}
	const survivors = [];
	for (const generation of inventory.generations) {
		if (!retained.has(generation.generation)) continue;
		const stats = await fs$1.lstat(generation.directory).catch(() => null);
		throwIfCancelled(params.operation);
		if (stats && sameDirectory(generation.stats, stats)) survivors.push({
			...generation,
			stats
		});
	}
	return survivors.toSorted(compareGenerations);
}
function createControlUiAssetRetention(root) {
	const cacheDir = resolveControlUiAssetCacheDir();
	let generations = [];
	let preparing;
	return {
		prepare(operation) {
			preparing ??= (async () => {
				throwIfCancelled(operation);
				await fs$1.mkdir(cacheDir, {
					recursive: true,
					mode: 448
				});
				await fs$1.chmod(cacheDir, 448);
				const io = {
					...operation,
					scratch: Buffer.allocUnsafe(CONTROL_UI_ASSET_IO_BUFFER_BYTES)
				};
				const inventory = await readCacheInventory(cacheDir, io);
				throwIfCancelled(operation);
				generations = inventory.generations;
				const verified = [...generations];
				const manifest = await readAssetManifest(root, operation);
				const manifestBytes = manifest.assets.reduce((total, asset) => total + asset.size, 0);
				if (manifestBytes <= CONTROL_UI_RETAINED_ASSET_MAX_BYTES) {
					const published = await publishGeneration({
						cacheDir,
						manifest,
						operation: io,
						root,
						verified: verified.find((entry) => entry.generation === manifest.generation)
					});
					verified.push(published);
				}
				const survivors = await pruneRetainedGenerations({
					cacheDir,
					verified,
					currentGeneration: manifestBytes <= CONTROL_UI_RETAINED_ASSET_MAX_BYTES ? manifest.generation : void 0,
					now: Date.now(),
					operation: io
				});
				throwIfCancelled(operation);
				generations = survivors;
			})().catch((error) => {
				preparing = void 0;
				throw error;
			});
			return preparing;
		},
		resolveAsset(assetPath) {
			for (const generation of generations) {
				if (!generation.assetPaths.has(assetPath)) continue;
				return {
					filePath: path.join(generation.directory, assetPath),
					rootPath: generation.directory,
					rootRealPath: generation.realPath
				};
			}
			return null;
		}
	};
}
//#endregion
//#region src/gateway/server-control-ui-root.ts
function resolveAutoRoot() {
	return resolveControlUiRootSync({
		moduleUrl: import.meta.url,
		argv1: process.argv[1],
		cwd: process.cwd()
	});
}
function createResolvedRootState(root, configured = false) {
	return !configured && isPackageProvenControlUiRootSync(root, {
		moduleUrl: import.meta.url,
		argv1: process.argv[1],
		cwd: process.cwd()
	}) ? {
		kind: "bundled",
		path: root,
		realPath: fs.realpathSync(root),
		retainedAssets: createControlUiAssetRetention(root)
	} : {
		kind: "resolved",
		path: root,
		realPath: fs.realpathSync(root)
	};
}
function prepareResolvedRootState(params) {
	try {
		return createResolvedRootState(params.root, params.configured);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		const message = `Control UI assets are unavailable at ${params.root}: ${detail}`;
		params.log.warn(`gateway: ${message}`);
		return params.configured ? {
			kind: "invalid",
			path: path.resolve(params.root)
		} : { kind: "failed" };
	}
}
/** Prepare the stable root reference shared by every HTTP listener. */
function createGatewayControlUiRootLifecycle(params) {
	let state;
	if (params.controlUiRootOverride) {
		const resolvedOverride = resolveControlUiRootOverrideSync(params.controlUiRootOverride);
		const resolvedOverridePath = path.resolve(params.controlUiRootOverride);
		if (!resolvedOverride) {
			params.log.warn(`gateway: controlUi.root not found at ${resolvedOverridePath}`);
			state = {
				kind: "invalid",
				path: resolvedOverridePath
			};
		} else state = prepareResolvedRootState({
			root: resolvedOverride,
			configured: true,
			log: params.log
		});
	} else if (params.controlUiEnabled) {
		const resolvedRoot = resolveAutoRoot();
		state = resolvedRoot && isControlUiStartupAssetsReady(resolvedRoot) ? prepareResolvedRootState({
			root: resolvedRoot,
			log: params.log
		}) : { kind: "preparing" };
	}
	let buildPromise;
	let retentionPromise;
	const prepareRetention = (isStopped, signal) => {
		if (state?.kind !== "bundled" || !state.retainedAssets) return Promise.resolve();
		retentionPromise ??= state.retainedAssets.prepare({
			isCancelled: isStopped,
			signal
		}).catch((error) => {
			if (isStopped() || signal.aborted) return;
			const detail = error instanceof Error ? error.message : String(error);
			params.log.warn(`gateway: Control UI asset retention failed: ${detail}`);
		});
		return retentionPromise;
	};
	const start = (isStopped, signal) => {
		if (isStopped() || signal.aborted) return Promise.resolve();
		if (state?.kind !== "preparing") return prepareRetention(isStopped, signal);
		const preparingState = state;
		buildPromise ??= (async () => {
			try {
				const result = await ensureControlUiAssetsBuilt(params.gatewayRuntime, { signal });
				if (isStopped() || signal.aborted) return;
				if (!result.ok) {
					const message = result.message ?? "Control UI assets could not be built.";
					Object.assign(preparingState, { kind: "failed" });
					params.log.warn(`gateway: ${message}`);
					return;
				}
				const resolvedRoot = resolveAutoRoot();
				if (!resolvedRoot || !isControlUiStartupAssetsReady(resolvedRoot)) {
					const message = resolvedRoot ? `Control UI assets at ${resolvedRoot} remain incomplete. Run \`openclaw doctor --fix\` or reinstall OpenClaw.` : "Control UI build completed, but its assets are still unavailable. Run `pnpm ui:build`.";
					Object.assign(preparingState, { kind: "failed" });
					params.log.warn(`gateway: ${message}`);
					return;
				}
				Object.assign(preparingState, createResolvedRootState(resolvedRoot));
				await prepareRetention(isStopped, signal);
			} catch (error) {
				if (isStopped() || signal.aborted) return;
				const message = `Control UI assets build failed: ${error instanceof Error ? error.message : String(error)}`;
				Object.assign(preparingState, { kind: "failed" });
				params.log.warn(`gateway: ${message}`);
			}
		})();
		return buildPromise;
	};
	return {
		state,
		start,
		stop: async () => {
			await Promise.all([buildPromise, retentionPromise]);
		}
	};
}
//#endregion
//#region src/gateway/server-transport-bridge.ts
/** Late-bound transport facts consumed by the socket-free Gateway kernel. */
function createGatewayTransportBridge() {
	let current;
	return {
		attach: (transport) => {
			current = transport;
		},
		current: () => current,
		getPortalService: () => current?.portalService,
		getTailscaleIngressEndpoint: () => current?.getTailscaleIngressEndpoint(),
		getMcpAppSandboxPort: () => current?.getMcpAppSandboxPort(),
		ensureSandboxHostPort: async () => {
			if (!current) throw new Error("Gateway listener must start before the sandbox host");
			return await current.ensureSandboxHostPort();
		}
	};
}
//#endregion
//#region src/gateway/server-wizard-sessions.ts
const UNCOLLECTED_TERMINAL_RETENTION_MS = 3e5;
/** Creates the in-memory tracker used for active Gateway wizard sessions. */
function createWizardSessionTracker(options) {
	const wizardSessions = /* @__PURE__ */ new Map();
	const terminalSince = /* @__PURE__ */ new Map();
	const now = options?.now ?? Date.now;
	const findRunningWizard = () => {
		for (const [id, session] of wizardSessions) {
			if (!session.isSettled()) {
				terminalSince.delete(id);
				return id;
			}
			const observedAt = terminalSince.get(id);
			if (observedAt === void 0) terminalSince.set(id, now());
			else if (now() - observedAt >= UNCOLLECTED_TERMINAL_RETENTION_MS) {
				wizardSessions.delete(id);
				terminalSince.delete(id);
			}
		}
		return null;
	};
	const purgeWizardSession = (id) => {
		const session = wizardSessions.get(id);
		if (!session) return;
		if (!session.isSettled()) return;
		wizardSessions.delete(id);
		terminalSince.delete(id);
	};
	return {
		wizardSessions,
		findRunningWizard,
		purgeWizardSession
	};
}
//#endregion
//#region src/gateway/server/event-loop-health.ts
const EVENT_LOOP_MONITOR_RESOLUTION_MS = 20;
const EVENT_LOOP_DELAY_WARN_MS = 1e3;
const EVENT_LOOP_UTILIZATION_WARN = .95;
const CPU_CORE_RATIO_WARN = .9;
const PERSISTENT_DEGRADATION_WARN_AFTER_MS = 6e4;
const LOAD_DEGRADATION_DELAY_COEVIDENCE_MS = 25;
const SUSTAINED_LOAD_SAMPLE_MIN_INTERVAL_MS = 1e3;
function roundMetric(value, digits = 3) {
	if (!Number.isFinite(value)) return 0;
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}
function nanosecondsToMilliseconds(value) {
	return roundMetric(value / 1e6, 1);
}
function classifyGatewayEventLoopHealthReasons(metrics) {
	const reasons = [];
	if (metrics.delayP99Ms >= EVENT_LOOP_DELAY_WARN_MS || metrics.delayMaxMs >= EVENT_LOOP_DELAY_WARN_MS) reasons.push("event_loop_delay");
	if (metrics.intervalMs < SUSTAINED_LOAD_SAMPLE_MIN_INTERVAL_MS) return reasons;
	if (!(metrics.delayP99Ms >= LOAD_DEGRADATION_DELAY_COEVIDENCE_MS || metrics.delayMaxMs >= LOAD_DEGRADATION_DELAY_COEVIDENCE_MS)) return reasons;
	if (metrics.utilization >= EVENT_LOOP_UTILIZATION_WARN) reasons.push("event_loop_utilization");
	if (metrics.cpuCoreRatio >= CPU_CORE_RATIO_WARN) reasons.push("cpu");
	return reasons;
}
function createGatewayEventLoopHealthMonitor(deps = {}) {
	const nowMs = deps.now ?? performance.now.bind(performance);
	const readCpuUsage = deps.cpuUsage ?? process.cpuUsage.bind(process);
	const readEventLoopUtilization = deps.eventLoopUtilization ?? performance.eventLoopUtilization.bind(performance);
	const createDelayMonitor = deps.createDelayMonitor ?? ((resolutionMs) => monitorEventLoopDelay({ resolution: resolutionMs }));
	let monitor = null;
	let lastWallAt = nowMs();
	let lastCpuUsage = readCpuUsage();
	let lastEventLoopUtilization = readEventLoopUtilization();
	let lastSnapshot;
	let firstDegradedAtMs = null;
	try {
		monitor = createDelayMonitor(EVENT_LOOP_MONITOR_RESOLUTION_MS);
		monitor.enable();
		monitor.reset();
	} catch {
		monitor = null;
	}
	const snapshot = () => {
		if (!monitor || !lastCpuUsage || !lastEventLoopUtilization || lastWallAt === null) return;
		const now = nowMs();
		const intervalMs = Math.max(1, now - lastWallAt);
		const delayP50Ms = nanosecondsToMilliseconds(monitor.percentile(50));
		const delayP99Ms = nanosecondsToMilliseconds(monitor.percentile(99));
		const delayMaxMs = nanosecondsToMilliseconds(monitor.max);
		if (!(delayP99Ms >= EVENT_LOOP_DELAY_WARN_MS || delayMaxMs >= EVENT_LOOP_DELAY_WARN_MS) && intervalMs < SUSTAINED_LOAD_SAMPLE_MIN_INTERVAL_MS) return lastSnapshot;
		const cpuUsage = readCpuUsage(lastCpuUsage);
		const currentEventLoopUtilization = readEventLoopUtilization();
		const utilization = roundMetric(readEventLoopUtilization(currentEventLoopUtilization, lastEventLoopUtilization).utilization);
		const cpuCoreRatio = roundMetric(roundMetric((cpuUsage.user + cpuUsage.system) / 1e3, 1) / intervalMs);
		const reasons = classifyGatewayEventLoopHealthReasons({
			intervalMs,
			delayP99Ms,
			delayMaxMs,
			utilization,
			cpuCoreRatio
		});
		const degraded = reasons.length > 0;
		if (degraded) firstDegradedAtMs ??= now;
		else firstDegradedAtMs = null;
		const health = {
			degraded,
			degradedSinceMs: firstDegradedAtMs === null ? null : Math.max(0, Math.round(now - firstDegradedAtMs)),
			reasons,
			intervalMs,
			delayP50Ms,
			delayP99Ms,
			delayMaxMs,
			utilization,
			cpuCoreRatio
		};
		monitor.reset();
		lastWallAt = now;
		lastCpuUsage = readCpuUsage();
		lastEventLoopUtilization = currentEventLoopUtilization;
		lastSnapshot = health;
		return health;
	};
	const reset = () => {
		monitor?.reset();
		lastWallAt = nowMs();
		lastCpuUsage = readCpuUsage();
		lastEventLoopUtilization = readEventLoopUtilization();
		lastSnapshot = void 0;
		firstDegradedAtMs = null;
	};
	return {
		snapshot,
		persistentDegradationSnapshot: () => {
			const current = snapshot();
			return current?.degradedSinceMs != null && current.degradedSinceMs >= PERSISTENT_DEGRADATION_WARN_AFTER_MS ? current : void 0;
		},
		reset,
		stop: () => {
			monitor?.disable();
			monitor = null;
			lastWallAt = null;
			lastCpuUsage = null;
			lastEventLoopUtilization = null;
			lastSnapshot = void 0;
			firstDegradedAtMs = null;
		}
	};
}
//#endregion
//#region src/gateway/server/readiness.ts
const DEFAULT_READINESS_CACHE_TTL_MS = 1e3;
/** Create a startup checker that excludes downstream channel health. */
function createStartupChecker(deps) {
	return () => {
		const uptimeMs = Date.now() - deps.startedAt;
		if (deps.getGatewayDraining?.()) return {
			ok: false,
			status: "draining",
			uptimeMs
		};
		if (deps.getStartupPending?.()) return {
			ok: false,
			status: "starting",
			uptimeMs,
			pendingReason: deps.getStartupPendingReason?.() ?? "startup-sidecars"
		};
		return {
			ok: true,
			status: "started",
			uptimeMs
		};
	};
}
function shouldIgnoreReadinessFailure(accountSnapshot, health, autostartSuppressed) {
	if (health.reason === "unmanaged" || health.reason === "stale-socket") return true;
	if (autostartSuppressed && health.reason === "not-running") return true;
	const restartableReason = health.reason === "not-running" || health.reason === "ingress-unavailable";
	const inRestartHandoff = accountSnapshot.restartPending === true && accountSnapshot.running !== true;
	return restartableReason && inRestartHandoff;
}
/** Create a cached readiness checker over channel runtime health. */
function createReadinessChecker(deps) {
	const { channelManager, startedAt } = deps;
	const getStartup = createStartupChecker(deps);
	const cacheTtlMs = Math.max(0, deps.cacheTtlMs ?? DEFAULT_READINESS_CACHE_TTL_MS);
	let cachedAt = 0;
	let cachedState = null;
	return () => {
		const startup = getStartup();
		const uptimeMs = startup.uptimeMs;
		const now = startedAt + uptimeMs;
		if (startup.status === "starting") return withEventLoopHealth({
			ready: false,
			failing: [startup.pendingReason],
			uptimeMs
		}, deps.getEventLoopHealth);
		if (startup.status === "draining") return withEventLoopHealth({
			ready: false,
			failing: ["gateway-draining"],
			uptimeMs
		}, deps.getEventLoopHealth);
		if (cachedState && !isFutureDateTimestampMs(cachedAt, { nowMs: now }) && now - cachedAt < cacheTtlMs) return withEventLoopHealth({
			...cachedState,
			uptimeMs
		}, deps.getEventLoopHealth);
		if (deps.getStateDatabaseFailure?.()) return withEventLoopHealth({
			ready: false,
			failing: ["state-database"],
			uptimeMs
		}, deps.getEventLoopHealth);
		if (deps.shouldSkipChannelReadiness?.()) return withEventLoopHealth({
			ready: true,
			failing: [],
			uptimeMs
		}, deps.getEventLoopHealth);
		const snapshot = channelManager.getRuntimeSnapshot();
		const globallyAutostartSuppressed = channelManager.getAutostartSuppression() !== null;
		const failing = [];
		const suppressed = [];
		for (const [channelId, accounts] of Object.entries(snapshot.channelAccounts)) {
			if (!accounts) continue;
			const autostartSuppressed = globallyAutostartSuppressed || channelManager.isAmbientAutostartSuppressed(channelId);
			for (const accountSnapshot of Object.values(accounts)) {
				if (!accountSnapshot) continue;
				const health = evaluateChannelHealth(accountSnapshot, {
					now,
					staleEventThresholdMs: DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS,
					channelConnectGraceMs: DEFAULT_CHANNEL_CONNECT_GRACE_MS,
					channelId
				});
				if (!health.healthy && autostartSuppressed && health.reason === "not-running") {
					if (!suppressed.includes(channelId)) suppressed.push(channelId);
					continue;
				}
				if (!health.healthy && !shouldIgnoreReadinessFailure(accountSnapshot, health, autostartSuppressed)) {
					failing.push(channelId);
					break;
				}
			}
		}
		cachedAt = now;
		cachedState = {
			ready: failing.length === 0,
			failing,
			...suppressed.length > 0 ? { suppressed } : {}
		};
		return withEventLoopHealth({
			...cachedState,
			uptimeMs
		}, deps.getEventLoopHealth);
	};
}
function withEventLoopHealth(result, getEventLoopHealth) {
	const eventLoop = getEventLoopHealth?.();
	return eventLoop ? {
		...result,
		eventLoop
	} : result;
}
//#endregion
//#region src/gateway/server-runtime-state-prepare.ts
function createGatewayAuthRateLimiters(rateLimitConfig) {
	return {
		rateLimiter: createAuthRateLimiter(rateLimitConfig ?? {}),
		browserRateLimiter: createAuthRateLimiter({
			...rateLimitConfig,
			exemptLoopback: false
		})
	};
}
function listGatewayStartupChannelPlugins() {
	return listLoadedChannelPlugins();
}
async function prepareGatewayKernelState(params) {
	const { bootstrap, port, opts, log, logChannels, logHooks, logPlugins, gatewayRuntime, resolveChannelRuntime: getChannelRuntime, loadWorkerEnvironmentStartupModule, loadWorkerPlacementStartupModule } = params;
	const { pluginBootstrap, gatewayPluginConfigAtStart, workerEnvironmentStartup, startupTrace, cfgAtStart, resolvedStartupAuthOverride, startupTailscaleOverride, ambientAutostartSuppressedChannelIds, minimalTestGateway, pluginGatewayContext } = bootstrap;
	const pluginRuntime = {
		registry: pluginBootstrap.pluginRegistry,
		baseGatewayMethods: pluginBootstrap.baseGatewayMethods
	};
	const shouldStartWorkerEnvironmentService = Boolean(workerEnvironmentStartup);
	const hostDesktopConfig = gatewayPluginConfigAtStart.desktop?.host;
	const hostDesktopEnabled = hostDesktopConfig?.enabled === true;
	const nodeCommandConfig = gatewayPluginConfigAtStart.gateway?.nodes?.commands;
	const nodeDesktopObserveAvailable = (nodeCommandConfig?.allow ?? []).some((command) => command.trim() === "desktop.stream") && !(nodeCommandConfig?.deny ?? []).some((command) => command.trim() === "desktop.stream");
	const workerDesktopObserveAvailable = shouldStartWorkerEnvironmentService && gatewayPluginConfigAtStart.cloudWorkers?.desktop === true;
	const desktopSessionRegistry = shouldStartWorkerEnvironmentService || hostDesktopEnabled || nodeDesktopObserveAvailable ? createDesktopSessionRegistry() : void 0;
	const nodeDesktopStreamBroker = nodeDesktopObserveAvailable || shouldStartWorkerEnvironmentService ? (await startupTrace.measure("node-desktop.runtime-import", () => import("./node-stream-broker-CA1idjFI.js"))).createNodeDesktopStreamBroker() : void 0;
	const hostDesktopService = hostDesktopConfig && hostDesktopEnabled && desktopSessionRegistry ? (await startupTrace.measure("host-desktop.runtime-import", () => import("./host-source-eTN6eELw.js"))).createHostDesktopService({
		config: hostDesktopConfig,
		registry: desktopSessionRegistry
	}) : void 0;
	const workerEnvironmentRuntime = workerEnvironmentStartup && desktopSessionRegistry ? await startupTrace.measure("worker-environments.runtime-imports", async () => {
		return await (await loadWorkerEnvironmentStartupModule()).createGatewayWorkerEnvironmentRuntime({
			getPluginRegistry: () => pluginRuntime.registry,
			getPortalRuntime: () => pluginGatewayContext.current,
			resolveGatewayContext: () => pluginGatewayContext.current,
			desktopSessionRegistry,
			...nodeDesktopStreamBroker ? { nodeDesktopStreamBroker } : {},
			startup: workerEnvironmentStartup,
			log
		});
	}) : {};
	const { workerEnvironmentService, workerLiveEvents, nodeWorkerGatewayNamespace, bindDeviceNodeControl, bindWorkerNodeDesktopControl, bindNodeWorkspaceBindingResolver, bindGitHubPublication, handleNodeWorkerBundleTransferRequest, handleWorkerBootstrapArtifactTransferRequest, handleNodeWorkspaceTransferRequest } = workerEnvironmentRuntime;
	const workerDispatchAuthority = { revoke: (_params) => {
		throw new Error("Worker dispatch authority revocation is not ready");
	} };
	const workerPlacementModule = workerEnvironmentStartup ? await startupTrace.measure("worker-environments.placement-module", loadWorkerPlacementStartupModule) : void 0;
	const githubPublicationRuntime = workerEnvironmentStartup && workerPlacementModule ? workerPlacementModule.createGatewayGitHubPublicationRuntime({
		placements: workerEnvironmentStartup.placementStore,
		warn: (message) => log.warn(message)
	}) : void 0;
	const workerPlacementRuntime = workerEnvironmentService && workerEnvironmentStartup && nodeWorkerGatewayNamespace && workerPlacementModule ? await startupTrace.measure("worker-environments.placement-runtime", async () => workerPlacementModule.createGatewayWorkerPlacementRuntime({
		placements: workerEnvironmentStartup.placementStore,
		environments: workerEnvironmentService,
		gatewayNamespace: nodeWorkerGatewayNamespace,
		getSessionChangeContext: () => pluginGatewayContext.current,
		persistAbandonedPartial: async ({ sessionId, sessionKey, agentId, runId }) => {
			const text = connectionState.chatRunState.resolveBuffer(runId, { final: true }).text;
			if (!text.trim()) return;
			const { captureAbortedPartial, persistAbortedPartials } = await import("./chat-transcript-persistence.runtime.js");
			await persistAbortedPartials({
				context: { logGateway: log },
				snapshots: [captureAbortedPartial({
					sessionKey,
					sessionId,
					agentId,
					runId,
					text,
					abortOrigin: "placement-abandon"
				})]
			});
		},
		cancelSessionWork: async (request) => {
			const context = pluginGatewayContext.current;
			if (!context) throw new Error("Worker session cancellation is not ready");
			const { cancelGatewayWorkerSessionWork } = await import("./server-worker-placement-cancel-DT5GeeUI.js");
			await cancelGatewayWorkerSessionWork(context, request);
		},
		revokeSessionAuthority: (request) => workerDispatchAuthority.revoke(request),
		info: (message) => log.info(message),
		warn: (message) => log.warn(message),
		...githubPublicationRuntime ? { githubPublicationRuntime } : {}
	})) : void 0;
	if (workerPlacementRuntime) {
		bindNodeWorkspaceBindingResolver?.(workerPlacementRuntime.resolveNodeWorkspaceBinding);
		workerEnvironmentRuntime.bindWorkerSessionDispatch?.(workerPlacementRuntime.dispatchService.dispatch);
	}
	if (githubPublicationRuntime) bindGitHubPublication?.(githubPublicationRuntime.coordinator);
	const bindDeviceNodeRuntime = bindDeviceNodeControl ? (transport) => {
		bindDeviceNodeControl(transport);
		workerPlacementRuntime?.bindNodeWorkerSupervisorTransport(transport);
	} : void 0;
	const workerPlacementControlAvailable = workerPlacementRuntime?.dispatchService;
	const workerPlacementDispatchAvailable = workerPlacementControlAvailable;
	const desktopObserveAvailable = workerDesktopObserveAvailable || nodeDesktopObserveAvailable || Boolean(hostDesktopService);
	const channelLogs = Object.fromEntries(listGatewayStartupChannelPlugins().map((plugin) => [plugin.id, logChannels.child(plugin.id)]));
	const channelRuntimeEnvs = Object.fromEntries(Object.entries(channelLogs).map(([id, logger]) => [id, runtimeForLogger(logger)]));
	const listStartupChannelGatewayMethods = () => {
		const methods = [];
		for (const plugin of listGatewayStartupChannelPlugins()) {
			methods.push(...plugin.gatewayMethods ?? []);
			for (const descriptor of plugin.gatewayMethodDescriptors ?? []) methods.push(descriptor.name);
		}
		return methods;
	};
	const listActiveGatewayMethods = (nextBaseGatewayMethods) => uniqueStrings([...nextBaseGatewayMethods, ...listStartupChannelGatewayMethods()]).filter((method) => (workerPlacementDispatchAvailable || method !== "sessions.dispatch") && (workerPlacementControlAvailable || method !== "sessions.reclaim" && method !== "sessions.move") && (desktopObserveAvailable || method !== "desktop.observe") && (workerDesktopObserveAvailable || method !== "desktop.launch" && method !== "worker.desktop.observe" && method !== "worker.desktop.launch"));
	const runtimeConfig = await startupTrace.measure("runtime.config", async () => {
		const { resolveGatewayRuntimeConfig } = await import("./server-runtime-config-By1uXlnI.js");
		return resolveGatewayRuntimeConfig({
			cfg: cfgAtStart,
			port,
			bind: opts.bind,
			host: opts.host,
			controlUiEnabled: opts.controlUiEnabled,
			openAiChatCompletionsEnabled: opts.openAiChatCompletionsEnabled,
			openResponsesEnabled: opts.openResponsesEnabled,
			auth: resolvedStartupAuthOverride,
			tailscale: startupTailscaleOverride
		});
	});
	const { bindHost, controlUiEnabled, openAiChatCompletionsEnabled, openAiChatCompletionsConfig, openResponsesEnabled, openResponsesConfig, strictTransportSecurityHeader, controlUiBasePath, controlUiRoot: controlUiRootOverride, resolvedAuth, tailscaleConfig, tailscaleMode } = runtimeConfig;
	if (bootstrap.generatedStartupAuthToken && isLoopbackHost(bindHost)) {
		const { ensureStartupLocalCliPairing } = await startupTrace.measure("runtime.local-cli-pairing-import", () => import("./startup-local-cli-pairing-D7z1Ar1Y.js"));
		const pairingResult = await startupTrace.measure("runtime.local-cli-pairing", () => ensureStartupLocalCliPairing());
		if (pairingResult === "created") log.info("runtime-only gateway auth paired the local CLI device before readiness");
		else if (pairingResult === "unavailable") log.warn("runtime-only gateway auth could not prepare local CLI device credentials; configure gateway.auth.token or gateway.auth.password for CLI access");
	}
	const getResolvedAuth = () => resolveGatewayAuth({
		authConfig: getActiveSecretsRuntimeConfigSnapshot()?.config.gateway?.auth ?? getRuntimeConfig().gateway?.auth,
		authOverride: resolvedStartupAuthOverride,
		env: process.env,
		tailscaleMode
	});
	const resolveSharedGatewaySessionGenerationForConfig = (config) => resolveSharedGatewaySessionGeneration(resolveGatewayAuth({
		authConfig: config.gateway?.auth,
		authOverride: resolvedStartupAuthOverride,
		env: process.env,
		tailscaleMode
	}), config.gateway?.trustedProxies);
	const resolveCurrentSharedGatewaySessionGeneration = () => resolveSharedGatewaySessionGeneration(getResolvedAuth(), getRuntimeConfig().gateway?.trustedProxies);
	const resolveSharedGatewaySessionGenerationForRuntimeSnapshot = () => resolveSharedGatewaySessionGeneration(resolveGatewayAuth({
		authConfig: getRuntimeConfig().gateway?.auth,
		authOverride: resolvedStartupAuthOverride,
		env: process.env,
		tailscaleMode
	}), getRuntimeConfig().gateway?.trustedProxies);
	const sharedGatewaySessionGenerationState = {
		current: resolveCurrentSharedGatewaySessionGeneration(),
		required: null
	};
	const preauthHandshakeTimeoutMs = void 0;
	const initialHooksConfig = runtimeConfig.hooksConfig;
	const initialHookClientIpConfig = resolveHookClientIpConfig(cfgAtStart);
	const rateLimitConfig = cfgAtStart.gateway?.auth?.rateLimit;
	const { rateLimiter: authRateLimiter, browserRateLimiter: browserAuthRateLimiter } = createGatewayAuthRateLimiters(rateLimitConfig);
	const nodeReapprovalCoordinator = createNodeReapprovalCoordinator(rateLimitConfig);
	const controlUiRootLifecycle = await startupTrace.measure("control-ui.root", () => createGatewayControlUiRootLifecycle({
		controlUiRootOverride,
		controlUiEnabled,
		gatewayRuntime,
		log
	}));
	const { createTerminalLaunchPolicy } = await startupTrace.measure("terminal.launch-import", () => import("./launch-lPeWEWYb.js"));
	const terminalLaunchPolicy = createTerminalLaunchPolicy(cfgAtStart);
	const { runDefaultChannelSetupWizard, runDefaultSetupWizard } = await startupTrace.measure("gateway.wizard-imports", () => import("./wizard-BqWZHgEC.js"));
	const wizardRunner = opts.wizardRunner ?? runDefaultSetupWizard;
	const channelWizardRunner = opts.channelWizardRunner ?? runDefaultChannelSetupWizard;
	const { wizardSessions, findRunningWizard, purgeWizardSession } = createWizardSessionTracker();
	const systemAgentSessions = /* @__PURE__ */ new Map();
	const deps = createDefaultDeps();
	const runtimeStateRef = { current: null };
	const cronStartState = { handled: false };
	const gatewayTls = await startupTrace.measure("tls.runtime", () => loadGatewayTlsServerRuntime(cfgAtStart.gateway?.tls, log.child("tls")));
	const serverStartedAt = Date.now();
	const readinessEventLoopHealth = createGatewayEventLoopHealthMonitor();
	const startupState = {
		sidecarsReady: minimalTestGateway,
		pendingReason: "startup-sidecars",
		dispatchReady: false
	};
	const lifecycle = { closePreludeStarted: false };
	let releaseStartupAccountStarts = () => {};
	const startupAccountStartsReady = new Promise((resolve) => {
		releaseStartupAccountStarts = resolve;
	});
	const gatewayInstanceRuntimeRef = { current: void 0 };
	const { createChannelManager } = await startupTrace.measure("gateway.channel-manager-import", () => import("./server-channels-BnwAug-6.js"));
	const channelManager = createChannelManager({
		getRuntimeConfig: () => {
			const runtimeConfigLocal = getRuntimeConfig();
			return resolveGatewayPluginConfig({ config: runtimeConfigLocal });
		},
		channelLogs,
		channelRuntimeEnvs,
		resolveChannelRuntime: getChannelRuntime,
		getPluginHttpRouteRegistry: () => pluginRuntime.registry,
		startupTrace,
		deferStartupAccountStartsUntil: startupAccountStartsReady,
		getNativeApprovalRuntime: () => gatewayInstanceRuntimeRef.current?.nativeApprovals,
		ambientAutostartSuppressedChannelIds,
		...opts.tryRecoverChannelAutostartSuppression ? { tryRecoverAutostartSuppression: opts.tryRecoverChannelAutostartSuppression } : {},
		isClosing: () => lifecycle.closePreludeStarted
	});
	channelManager.setAutostartSuppression(opts.channelAutostartSuppression ?? null);
	const sidecarStartup = opts.sidecarStartup ?? "start";
	const isGatewayStartupPending = () => !startupState.sidecarsReady && !lifecycle.closePreludeStarted;
	const startupCheckerDeps = {
		startedAt: serverStartedAt,
		getStartupPending: isGatewayStartupPending,
		getStartupPendingReason: () => startupState.pendingReason,
		getGatewayDraining: () => lifecycle.closePreludeStarted || isGatewayDraining()
	};
	const getStartup = createStartupChecker(startupCheckerDeps);
	const getReadiness = createReadinessChecker({
		channelManager,
		...startupCheckerDeps,
		getEventLoopHealth: readinessEventLoopHealth.snapshot,
		getStateDatabaseFailure: () => openClawStateDatabaseCache.getOpenClawStateDatabaseRuntimeFailure(resolveDatabasePath()),
		shouldSkipChannelReadiness: () => isTruthyEnvValue(process.env.OPENCLAW_SKIP_CHANNELS) || isTruthyEnvValue(process.env.OPENCLAW_SKIP_PROVIDERS)
	});
	const watchNodeRequestHandler = {};
	log.info("starting HTTP server...");
	const connectionState = await startupTrace.measure("runtime.state", () => createGatewayConnectionState({
		cfg: cfgAtStart,
		getRuntimeConfig
	}));
	const transportBridge = createGatewayTransportBridge();
	const createHttpTransportOptions = () => ({
		cfg: cfgAtStart,
		getRuntimeConfig,
		bindHost,
		port,
		controlUiEnabled,
		controlUiBasePath,
		controlUiRoot: controlUiRootLifecycle.state,
		openAiChatCompletionsEnabled,
		openAiChatCompletionsConfig,
		openResponsesEnabled,
		openResponsesConfig,
		strictTransportSecurityHeader,
		resolvedAuth,
		rateLimiter: authRateLimiter,
		joinRateLimiter: browserAuthRateLimiter,
		isTerminalEnabled: terminalLaunchPolicy.isEnabled,
		gatewayTls,
		getResolvedAuth,
		hooksConfig: () => runtimeStateRef.current?.hooksConfig ?? initialHooksConfig,
		getHookClientIpConfig: () => runtimeStateRef.current?.hookClientIpConfig ?? initialHookClientIpConfig,
		pluginRegistry: pluginRuntime.registry,
		getPluginRouteRegistry: () => pluginRuntime.registry,
		isStartupPluginRuntimeReady: () => startupState.sidecarsReady,
		getGatewayRequestContext: () => pluginGatewayContext.current,
		deps,
		log,
		logHooks,
		logPlugins,
		getReadiness,
		getStartup,
		isStartupPending: isGatewayStartupPending,
		handleWatchNodeRequest: async (req, res) => await watchNodeRequestHandler.current?.(req, res) ?? false,
		handleNodeWorkerBundleTransferRequest,
		handleWorkerBootstrapArtifactTransferRequest,
		handleNodeWorkspaceTransferRequest,
		workerIngressEnabled: Boolean(workerEnvironmentService),
		desktopSessionRegistry,
		nodeDesktopStreamBroker,
		clients: connectionState.clients,
		tailscaleMode
	});
	const { clients, broadcast, broadcastToConnIds, broadcastPluginEvent, getBufferedAmount, agentRunSeq, dedupe, chatRunState, addChatRun, removeChatRun, chatAbortControllers, chatQueuedTurns, toolEventRecipients, sessionEventSubscribers, sessionMessageSubscribers, isConnectionActive } = connectionState;
	return {
		...bootstrap,
		pluginRuntime,
		workerEnvironmentService,
		workerLiveEvents,
		bindDeviceNodeControl: bindDeviceNodeRuntime,
		bindWorkerNodeDesktopControl,
		workerDispatchAuthority,
		workerPlacementRuntime,
		githubPublicationRuntime,
		githubPublicationService: githubPublicationRuntime?.coordinator,
		workerPlacementControlAvailable,
		workerPlacementDispatchAvailable,
		workerDesktopObserveAvailable,
		desktopObserveAvailable,
		desktopSessionRegistry,
		nodeDesktopObserveAvailable,
		nodeDesktopStreamBroker,
		hostDesktopService,
		channelLogs,
		channelRuntimeEnvs,
		listStartupChannelGatewayMethods,
		listActiveGatewayMethods,
		bindHost,
		controlUiEnabled,
		controlUiRootLifecycle,
		openAiChatCompletionsEnabled,
		openAiChatCompletionsConfig,
		openResponsesEnabled,
		openResponsesConfig,
		strictTransportSecurityHeader,
		controlUiBasePath,
		resolvedAuth,
		tailscaleConfig,
		tailscaleMode,
		getResolvedAuth,
		resolveSharedGatewaySessionGenerationForConfig,
		resolveSharedGatewaySessionGenerationForRuntimeSnapshot,
		sharedGatewaySessionGenerationState,
		preauthHandshakeTimeoutMs,
		initialHooksConfig,
		initialHookClientIpConfig,
		authRateLimiter,
		browserAuthRateLimiter,
		nodeReapprovalCoordinator,
		terminalLaunchPolicy,
		wizardRunner,
		channelWizardRunner,
		wizardSessions,
		findRunningWizard,
		purgeWizardSession,
		systemAgentSessions,
		deps,
		runtimeStateRef,
		cronStartState,
		gatewayTls,
		readinessEventLoopHealth,
		startupState,
		lifecycle,
		releaseStartupAccountStarts,
		gatewayInstanceRuntimeRef,
		channelManager,
		sidecarStartup,
		isGatewayStartupPending,
		pluginGatewayContext,
		watchNodeRequestHandler,
		createHttpTransportOptions,
		transportBridge,
		clients,
		broadcast,
		broadcastToConnIds,
		broadcastPluginEvent,
		getBufferedAmount,
		agentRunSeq,
		dedupe,
		chatRunState,
		addChatRun,
		removeChatRun,
		chatAbortControllers,
		chatQueuedTurns,
		toolEventRecipients,
		sessionEventSubscribers,
		sessionMessageSubscribers,
		isConnectionActive,
		getTailscaleIngressEndpoint: transportBridge.getTailscaleIngressEndpoint,
		getMcpAppSandboxPort: transportBridge.getMcpAppSandboxPort,
		ensureSandboxHostPort: transportBridge.ensureSandboxHostPort,
		getPortalService: transportBridge.getPortalService
	};
}
//#endregion
//#region src/gateway/startup-control-ui-origins.ts
/**
* Seeds runtime-only Control UI origins when a non-loopback gateway bind would
* otherwise reject the browser that just opened the local UI.
*/
async function maybeSeedControlUiAllowedOriginsAtStartup(params) {
	const seeded = ensureControlUiAllowedOriginsForNonLoopbackBind(params.config, {
		isContainerEnvironment,
		runtimeBind: params.runtimeBind,
		runtimePort: params.runtimePort
	});
	if (!seeded.seededOrigins || !seeded.bind) return {
		config: params.config,
		seededAllowedOrigins: false
	};
	params.log.info(buildSeededOriginsInfoLog(seeded.seededOrigins, seeded.bind));
	return {
		config: seeded.config,
		seededAllowedOrigins: true
	};
}
function buildSeededOriginsInfoLog(origins, bind) {
	return `gateway: seeded gateway.controlUi.allowedOrigins ${JSON.stringify(origins)} for bind=${bind} (required since v2026.2.26; see issue #29385). Applied for this runtime without writing config; add other origins to gateway.controlUi.allowedOrigins if needed.`;
}
//#endregion
//#region src/gateway/server-startup-bootstrap.ts
function publishGatewayPluginRuntimeConfigAtStartup(params) {
	setAppliedRuntimeConfigSnapshot(params.runtimeConfig, params.sourceConfig);
}
async function prepareGatewayServerBootstrap(input) {
	const { port, opts, log, logSecrets, loadWorkerEnvironmentStartupModule } = input;
	const formatRuntimeGatewayAuthTokenWarning = input.formatRuntimeGatewayAuthTokenWarning;
	const traceOriginAt = opts.processStartedAt ?? opts.startupStartedAt;
	const startupElapsedMs = typeof traceOriginAt === "number" ? Math.max(0, Date.now() - traceOriginAt) : 0;
	const startupTrace = createGatewayStartupTrace(log, performance.now() - startupElapsedMs);
	if (startupElapsedMs > 0) startupTrace.mark("process.bootstrap");
	await startupTrace.measure("state.ownership", async () => {
		normalizeStateDirEnv(process.env);
		await assertOpenClawStateWriteAllowedAtPath({
			databasePath: resolveOpenClawStateSqlitePath(process.env),
			env: process.env
		});
	});
	const [{ OPENCLAW_DATABASE_SCHEMA_DOCS_URL, OpenClawDatabaseSchemaPreflightError, preflightOpenClawDatabaseSchemas }, agentDatabase, stateDatabase] = await startupTrace.measure("state.runtime-imports", () => Promise.all([
		import("./openclaw-database-preflight-CJvGITpw.js"),
		import("./openclaw-agent-db-BYkVvKlY.js"),
		import("./openclaw-state-db-contract-Bz-kRHWR.js")
	]));
	const databaseSchemas = await startupTrace.measure("state.schema-preflight", () => preflightOpenClawDatabaseSchemas({
		env: process.env,
		supportedVersions: {
			state: stateDatabase.OPENCLAW_STATE_SCHEMA_VERSION,
			agent: agentDatabase.OPENCLAW_AGENT_SCHEMA_VERSION
		}
	}));
	if (databaseSchemas.incompatible.length > 0) {
		for (const database of databaseSchemas.incompatible) log.error("database schema preflight rejected newer schema", {
			kind: database.kind,
			path: database.path,
			...database.agentId ? { agentId: database.agentId } : {},
			foundVersion: database.foundVersion,
			supportedVersion: database.supportedVersion,
			writerAppVersion: database.writerAppVersion ?? "unknown",
			docsUrl: OPENCLAW_DATABASE_SCHEMA_DOCS_URL
		});
		throw new OpenClawDatabaseSchemaPreflightError(databaseSchemas.incompatible);
	}
	for (const database of databaseSchemas.indeterminate) log.warn("database schema preflight could not inspect database; continuing to real open", {
		kind: database.kind,
		path: database.path,
		reason: database.reason,
		docsUrl: OPENCLAW_DATABASE_SCHEMA_DOCS_URL
	});
	const { bootstrapGatewayNetworkRuntime } = await startupTrace.measure("runtime.network-imports", () => import("./server-network-runtime-DRXnBbhe.js"));
	await startupTrace.measure("runtime.network-bootstrap", () => bootstrapGatewayNetworkRuntime());
	const minimalTestGateway = isVitestRuntimeEnv() && process.env.OPENCLAW_TEST_MINIMAL_GATEWAY === "1";
	const ambientEnvTriggers = opts.ambientEnvTriggers ?? "suppress";
	process.env.OPENCLAW_GATEWAY_PORT = String(port);
	logAcceptedEnvOption({
		key: "OPENCLAW_RAW_STREAM",
		description: "raw stream logging enabled"
	});
	logAcceptedEnvOption({
		key: "OPENCLAW_RAW_STREAM_PATH",
		description: "raw stream log path override"
	});
	if (!resumeGatewayRestartTraceFromEnv(process.env, [["source", "env"]])) {
		const restartHandoff = readGatewayRestartHandoffSync();
		resumeGatewayRestartTraceFromHandoff(restartHandoff?.restartTrace, [
			["source", restartHandoff?.source],
			["restartKind", restartHandoff?.restartKind],
			["supervisorMode", restartHandoff?.supervisorMode]
		]);
	}
	if (!minimalTestGateway) await startupTrace.measure("runtime.agent-cli", () => prepareGatewayAgentCliShim());
	const startupConfigModulePromise = startupTrace.measure("config.runtime-imports", () => import("./server-startup-config-Cme1hH4m.js"));
	const loadStartupPluginsModule = createLazyPromise(() => import("./server-startup-plugins-TtaJlmAu.js"), { cacheRejections: true });
	const { loadGatewayStartupConfigSnapshot } = await startupConfigModulePromise;
	const envBeforeStartupConfigLoad = { ...process.env };
	const startupConfigLoad = await startupTrace.measure("config.snapshot", () => loadGatewayStartupConfigSnapshot({
		minimalTestGateway,
		log,
		measure: (name, run) => startupTrace.measure(name, run),
		...opts.startupConfigSnapshotRead ? { initialSnapshotRead: opts.startupConfigSnapshotRead } : {}
	}));
	const configSnapshot = startupConfigLoad.snapshot;
	const startupAuthOverride = opts.auth ? structuredClone(opts.auth) : void 0;
	const startupTailscaleOverride = opts.tailscale ? structuredClone(opts.tailscale) : void 0;
	const controlUiSeed = minimalTestGateway ? {
		config: configSnapshot.config,
		seededAllowedOrigins: false
	} : await startupTrace.measure("control-ui.seed", () => maybeSeedControlUiAllowedOriginsAtStartup({
		config: configSnapshot.config,
		log,
		runtimeBind: opts.bind,
		runtimePort: port
	}));
	if (controlUiSeed.seededAllowedOrigins) copyConfigResolutionFacts(configSnapshot.config, controlUiSeed.config);
	const startupConfigSnapshot = controlUiSeed.seededAllowedOrigins ? {
		...configSnapshot,
		runtimeConfig: controlUiSeed.config,
		config: controlUiSeed.config
	} : configSnapshot;
	const emitSecretsStateEvent = (code, message, cfg) => {
		const text = `[${code}] ${message}`;
		try {
			const target = resolveSystemMainSessionTarget(cfg);
			enqueueSystemEvent(text, withSystemEventOwner({
				sessionKey: target.sessionKey,
				contextKey: code
			}, target.agentId));
		} catch (error) {
			logSecrets.warn(`${text} not delivered: ${formatErrorMessage(error)}`);
		}
	};
	const { createRuntimeSecretsActivator } = await startupConfigModulePromise;
	const activateRuntimeSecrets = createRuntimeSecretsActivator({
		logSecrets,
		emitStateEvent: emitSecretsStateEvent,
		...startupConfigLoad.pluginMetadataSnapshot ? { pluginMetadataSnapshot: startupConfigLoad.pluginMetadataSnapshot } : {}
	});
	let startupInternalWriteHash = null;
	let startupLastGoodSnapshot = configSnapshot;
	const startupActivationSourceConfig = configSnapshot.sourceConfig;
	const startupRuntimeConfig = captureConfigOverrideApplier()(startupConfigSnapshot.config);
	startupTrace.setConfig(startupRuntimeConfig);
	const { prepareGatewayStartupConfig } = await startupConfigModulePromise;
	const authBootstrap = await startupTrace.measure("config.auth", () => prepareGatewayStartupConfig({
		configSnapshot: startupConfigSnapshot,
		authOverride: startupAuthOverride,
		tailscaleOverride: startupTailscaleOverride,
		activateRuntimeSecrets,
		log,
		measure: (name, run, measureOptions) => startupTrace.measure(name, run, measureOptions)
	}), { omitErrorMessage: true });
	const cfgAtStart = authBootstrap.cfg;
	startupTrace.setConfig(cfgAtStart);
	try {
		const cleanup = await startupTrace.measure("agents.github-profile-cleanup", async () => {
			const { cleanupRetiredManagedGitHubProfiles } = await import("./github-tool-profile-cleanup-BI2TjgqR.js");
			return await cleanupRetiredManagedGitHubProfiles({
				config: cfgAtStart,
				env: process.env
			});
		});
		for (const warning of cleanup.warnings) log.warn(`managed GitHub profile cleanup: ${warning}`);
	} catch (error) {
		log.warn(`managed GitHub profile cleanup failed: ${formatErrorMessage(error)}`);
	}
	if (authBootstrap.generatedToken) log.warn(formatRuntimeGatewayAuthTokenWarning());
	const trustedProxyDeviceAutoApprove = cfgAtStart.gateway?.auth?.trustedProxy?.deviceAutoApprove;
	if (cfgAtStart.gateway?.auth?.mode === "trusted-proxy" && trustedProxyDeviceAutoApprove?.enabled === true && trustedProxyDeviceAutoApprove.scopes?.some((scope) => scope.trim() === "operator.admin")) log.warn("SECURITY WARNING: gateway.auth.trustedProxy.deviceAutoApprove.scopes includes operator.admin; every proxy-authenticated user can auto-approve a new browser device with full admin, and requests without scopes receive full admin automatically. Remove operator.admin and grant admin per identity via gateway.auth.identityScopes instead.");
	const resolvedStartupAuthOverride = startupAuthOverride ? Object.fromEntries([
		"mode",
		"token",
		"password",
		"allowTailscale",
		"rateLimit",
		"trustedProxy"
	].flatMap((key) => {
		if (startupAuthOverride[key] === void 0) return [];
		if ((key === "token" || key === "password") && isSecretRef(startupAuthOverride[key])) return [];
		const resolvedValue = cfgAtStart.gateway?.auth?.[key];
		return resolvedValue === void 0 ? [] : [[key, structuredClone(resolvedValue)]];
	})) : void 0;
	const startupAuthSecretRefOverride = startupAuthOverride ? {
		...isSecretRef(startupAuthOverride.token) ? { token: structuredClone(startupAuthOverride.token) } : {},
		...isSecretRef(startupAuthOverride.password) ? { password: structuredClone(startupAuthOverride.password) } : {}
	} : void 0;
	const reloadAuthOverride = authBootstrap.generatedToken ? mergeGatewayAuthConfig(resolvedStartupAuthOverride, { token: authBootstrap.generatedToken }) : resolvedStartupAuthOverride;
	const diagnosticsEnabled = isDiagnosticsEnabled(cfgAtStart);
	setDiagnosticsEnabledForProcess(diagnosticsEnabled);
	setGatewaySigusr1RestartPolicy({ allowExternal: isRestartEnabled(cfgAtStart) });
	const activeTaskCount = { get: () => 0 };
	setPreRestartDeferralCheck(() => getTotalQueueSize() + getTotalPendingReplies() + getActiveEmbeddedRunCount() + getActiveCronJobCount() + getActiveBackgroundExecSessionCount() + getActiveGatewayRootWorkCount({ excludeCurrent: true }) + activeTaskCount.get());
	const seededControlUiAllowedOrigins = controlUiSeed.seededAllowedOrigins ? cfgAtStart.gateway?.controlUi?.allowedOrigins : void 0;
	const applyFixedGatewayOverlays = (config) => {
		let runtimeConfig = config;
		if (reloadAuthOverride || startupTailscaleOverride) runtimeConfig = {
			...runtimeConfig,
			gateway: {
				...runtimeConfig.gateway,
				...reloadAuthOverride ? { auth: mergeGatewayAuthConfig(runtimeConfig.gateway?.auth, reloadAuthOverride) } : {},
				...startupTailscaleOverride ? { tailscale: mergeGatewayTailscaleConfig(runtimeConfig.gateway?.tailscale, startupTailscaleOverride) } : {}
			}
		};
		if (seededControlUiAllowedOrigins && runtimeConfig.gateway?.controlUi?.allowedOrigins === void 0) runtimeConfig = {
			...runtimeConfig,
			gateway: {
				...runtimeConfig.gateway,
				controlUi: {
					...runtimeConfig.gateway?.controlUi,
					allowedOrigins: seededControlUiAllowedOrigins
				}
			}
		};
		copyConfigResolutionFactsExcept(config, runtimeConfig, [...reloadAuthOverride?.token !== void 0 ? ["gateway.auth.token"] : [], ...reloadAuthOverride?.password !== void 0 ? ["gateway.auth.password"] : []]);
		return runtimeConfig;
	};
	const applyReloadableGatewayAuthRefs = (config) => {
		if (!startupAuthSecretRefOverride?.token && !startupAuthSecretRefOverride?.password) return config;
		const next = {
			...config,
			gateway: {
				...config.gateway,
				auth: mergeGatewayAuthConfig(config.gateway?.auth, startupAuthSecretRefOverride)
			}
		};
		copyConfigResolutionFactsExcept(config, next, [...startupAuthSecretRefOverride.token !== void 0 ? ["gateway.auth.token"] : [], ...startupAuthSecretRefOverride.password !== void 0 ? ["gateway.auth.password"] : []]);
		return next;
	};
	const { assertConfiguredWorkspaceStateReady } = await import("./workspace-state-dirs-gG57Omj5.js");
	const prepareReloadCandidate = (params) => {
		const previousSourceConfig = params.previousSourceConfig ?? getRuntimeConfigSourceSnapshot() ?? startupLastGoodSnapshot.sourceConfig;
		assertGatewayConfigEnvSelectionUnchanged(previousSourceConfig, params.sourceConfig);
		const runtimeEnv = prepareConfigRuntimeEnv({
			previousConfig: previousSourceConfig,
			nextConfig: params.sourceConfig
		});
		const metadata = startupConfigLoad.pluginMetadataSnapshot;
		const pluginCandidate = minimalTestGateway ? {
			runtimeConfig: params.runtimeConfig,
			compareConfig: params.sourceConfig
		} : resolveGatewayReloadPluginActivationCandidate({
			...params,
			env: runtimeEnv.env,
			...metadata?.manifestRegistry ? { manifestRegistry: metadata.manifestRegistry } : {},
			discovery: metadata?.discovery,
			ambientEnvTriggers
		});
		const applyCandidateOverrides = captureConfigOverrideApplier();
		const reapplyCompareOverlays = (config) => {
			const applied = applyCandidateOverrides(mergeActivationSectionsIntoRuntimeConfig({
				runtimeConfig: config,
				activationConfig: pluginCandidate.compareConfig
			}));
			copyConfigResolutionFacts(config, applied);
			return applied;
		};
		const reapplyRuntimeOverlays = (config) => applyFixedGatewayOverlays(applyReloadableGatewayAuthRefs(reapplyCompareOverlays(config)));
		const runtimeConfig = reapplyRuntimeOverlays(params.runtimeConfig);
		assertConfiguredWorkspaceStateReady({
			cfg: runtimeConfig,
			env: runtimeEnv.env
		});
		return {
			runtimeConfig,
			compareConfig: reapplyCompareOverlays(params.sourceConfig),
			runtimeEnv,
			reapplyRuntimeOverlays,
			reapplyCompareOverlays
		};
	};
	if (startupConfigLoad.wroteConfig || authBootstrap.persistedGeneratedToken) {
		const startupSnapshot = await startupTrace.measure("config.final-snapshot", () => readConfigFileSnapshot());
		startupInternalWriteHash = startupSnapshot.hash ?? null;
		startupLastGoodSnapshot = startupSnapshot;
	}
	setAppliedRuntimeConfigSnapshot(cfgAtStart, startupLastGoodSnapshot.sourceConfig);
	applyLoggingConfig(cfgAtStart.logging);
	initializePublishedConfigRuntimeEnv(startupLastGoodSnapshot.sourceConfig, {
		ownedEnv: collectConfigRuntimeEnvOwnership(startupLastGoodSnapshot.sourceConfig, envBeforeStartupConfigLoad, process.env),
		preserveExistingOwnership: true
	});
	const workerEnvironmentStartup = minimalTestGateway ? void 0 : await startupTrace.measure("worker-environments.store-import", async () => {
		return await (await loadWorkerEnvironmentStartupModule()).loadGatewayWorkerEnvironmentStartupState();
	});
	const { prepareGatewayPluginBootstrap, runGatewayStartupMaintenance } = await startupTrace.measure("plugins.bootstrap-imports", loadStartupPluginsModule);
	const pluginGatewayContext = { current: void 0 };
	const resolvePluginGatewayContext = () => pluginGatewayContext.current;
	await startupTrace.measure("startup.maintenance", () => runGatewayStartupMaintenance({
		cfgAtStart,
		startupRuntimeConfig,
		minimalTestGateway,
		log
	}));
	const pluginBootstrap = await startupTrace.measure("plugins.bootstrap", () => prepareGatewayPluginBootstrap({
		cfgAtStart,
		activationSourceConfig: startupActivationSourceConfig,
		pluginMetadataSnapshot: startupConfigLoad.pluginMetadataSnapshot,
		workerProviderIds: workerEnvironmentStartup?.durableProviderIds ?? [],
		minimalTestGateway,
		ambientEnvTriggers,
		log
	}));
	const { gatewayPluginConfigAtStart, defaultWorkspaceDir, pluginWorkspaceDir, startupPluginIds, pluginManifestRecords, pluginMetadataSnapshot, pluginLookUpTable, baseMethods, ambientAutostartSuppressedChannelIds } = pluginBootstrap;
	copyConfigResolutionFacts(cfgAtStart, gatewayPluginConfigAtStart);
	publishGatewayPluginRuntimeConfigAtStartup({
		runtimeConfig: gatewayPluginConfigAtStart,
		sourceConfig: startupLastGoodSnapshot.sourceConfig
	});
	const coreGatewayMethodNames = listCoreGatewayMethodNames();
	const existingPluginMetadataSnapshot = getGatewayPluginMetadataSnapshot();
	const currentPluginMetadataSnapshot = existingPluginMetadataSnapshot ?? completePluginMetadataSnapshot({
		snapshot: pluginMetadataSnapshot,
		config: startupActivationSourceConfig,
		env: process.env,
		workspaceDir: defaultWorkspaceDir
	});
	if (!existingPluginMetadataSnapshot) setGatewayPluginMetadataSnapshot(currentPluginMetadataSnapshot, {
		config: startupActivationSourceConfig,
		compatibleConfigs: [
			startupRuntimeConfig,
			cfgAtStart,
			gatewayPluginConfigAtStart
		],
		env: process.env,
		workspaceDir: pluginWorkspaceDir
	});
	if (pluginLookUpTable) {
		const metrics = pluginLookUpTable.metrics;
		startupTrace.detail("plugins.lookup-table", [
			["registrySnapshotMs", metrics.registrySnapshotMs],
			["manifestRegistryMs", metrics.manifestRegistryMs],
			["startupPlanMs", metrics.startupPlanMs],
			["ownerMapsMs", metrics.ownerMapsMs],
			["totalMs", metrics.totalMs],
			["indexPlugins", String(metrics.indexPluginCount)],
			["indexPluginCount", metrics.indexPluginCount],
			["manifestPlugins", String(metrics.manifestPluginCount)],
			["manifestPluginCount", metrics.manifestPluginCount],
			["startupPlugins", String(metrics.startupPluginCount)],
			["startupPluginCount", metrics.startupPluginCount]
		]);
	}
	return {
		opts,
		minimalTestGateway,
		ambientEnvTriggers,
		startupTrace,
		loadStartupPluginsModule,
		configSnapshot,
		startupConfigLoad,
		startupActivationSourceConfig,
		startupRuntimeConfig,
		cfgAtStart,
		generatedStartupAuthToken: authBootstrap.generatedToken !== void 0,
		resolvedStartupAuthOverride,
		startupTailscaleOverride,
		diagnosticsEnabled,
		activeTaskCount,
		applyFixedGatewayOverlays,
		prepareReloadCandidate,
		startupInternalWriteHash,
		startupLastGoodSnapshot,
		workerEnvironmentStartup,
		pluginGatewayContext,
		resolvePluginGatewayContext,
		pluginBootstrap,
		gatewayPluginConfigAtStart,
		defaultWorkspaceDir,
		pluginWorkspaceDir,
		startupPluginIds,
		pluginManifestRecords,
		pluginMetadataSnapshot: currentPluginMetadataSnapshot,
		pluginLookUpTable,
		baseMethods,
		ambientAutostartSuppressedChannelIds,
		coreGatewayMethodNames,
		activateRuntimeSecrets
	};
}
//#endregion
//#region src/gateway/server-kernel.ts
const loadGatewayModelCatalogModule = createLazyRuntimeModule(() => import("./server-model-catalog-CZ0qqS1y.js"));
const loadWorkerEnvironmentStartupModule = createLazyRuntimeModule(() => import("./server-worker-environment-startup-cmQGWYH4.js"));
const loadWorkerPlacementStartupModule = createLazyRuntimeModule(() => import("./server-worker-placement-startup-BvPREvpr.js"));
const loadGatewayStartupEarlyModule = createLazyRuntimeModule(() => import("./server-startup-early-CGk4GzWP.js"));
const loadGatewayPluginBootstrapModule = createLazyRuntimeModule(() => import("./server-plugin-bootstrap-DfWKgEuh.js"));
const loadGatewayShutdownModule = createLazyRuntimeModule(() => import("./server-shutdown.runtime.js"));
const log$1 = createSubsystemLogger("gateway");
const logDiscovery = log$1.child("discovery");
const logTailscale$1 = log$1.child("tailscale");
const logChannels$1 = log$1.child("channels");
const logHealth$1 = log$1.child("health");
const logCron$1 = log$1.child("cron");
const logReload$1 = log$1.child("reload");
const logHooks$1 = log$1.child("hooks");
const logPlugins = log$1.child("plugins");
const logWsControl$1 = log$1.child("ws");
const logSecrets = log$1.child("secrets");
const gatewayKernelLogs = {
	log: log$1,
	logTailscale: logTailscale$1,
	logChannels: logChannels$1,
	logHealth: logHealth$1,
	logCron: logCron$1,
	logReload: logReload$1,
	logHooks: logHooks$1,
	logWsControl: logWsControl$1
};
const gatewayRuntime = runtimeForLogger(log$1);
const getChannelRuntime = createLazyRuntimeModule(() => import("./runtime-channel-DtYLpRdz.js").then(({ createRuntimeChannel }) => createRuntimeChannel()));
const loadGatewayModelCatalog = async (...args) => {
	return (await loadGatewayModelCatalogModule()).loadGatewayModelCatalog(...args);
};
const loadGatewayModelCatalogSnapshot = async (...args) => {
	return (await loadGatewayModelCatalogModule()).loadGatewayModelCatalogSnapshot(...args);
};
const readPreparedGatewayModelCatalog = async (...args) => {
	return (await loadGatewayModelCatalogModule()).readPreparedGatewayModelCatalog(...args);
};
const loadPreparedGatewayModelCatalogSnapshot = async (...args) => {
	return (await loadGatewayModelCatalogModule()).loadPreparedGatewayModelCatalogSnapshot(...args);
};
const readPreparedGatewayModelCatalogOwnerSnapshot = async (...args) => {
	return (await loadGatewayModelCatalogModule()).readPreparedGatewayModelCatalogOwnerSnapshot(...args);
};
registerGatewayModelCatalogPrivateAccess(loadGatewayModelCatalogSnapshot, {
	loadDeferred: (params) => loadPreparedGatewayModelCatalogSnapshot(params),
	readPrepared: readPreparedGatewayModelCatalogOwnerSnapshot
});
function formatRuntimeGatewayAuthTokenWarning() {
	const base = "Gateway auth token was missing. Generated a runtime token for this startup without changing config; restart will generate a different token.";
	if (!isNixMode) return `${base} Persist one with \`openclaw config set gateway.auth.mode token\` and \`openclaw config set gateway.auth.token <token>\`.`;
	return [
		base,
		"In Nix mode, set gateway.auth.token in your Nix-managed OpenClaw config and rebuild.",
		"For the first-party Nix flow, see https://github.com/openclaw/nix-openclaw#quick-start and https://docs.openclaw.ai/install/nix."
	].join(" ");
}
async function resetPreparedModelCatalogForTestCore() {
	const { resetPreparedModelCatalogStateForTest } = await loadGatewayModelCatalogModule();
	await resetPreparedModelCatalogStateForTest();
}
/** Builds the Gateway kernel and internal dispatch surface without creating HTTP servers. */
async function createGatewayKernel(port = 18789, opts = {}, options = {}) {
	ensureOpenClawCliOnPath();
	const releasePluginMetadata = retainGatewayPluginMetadata();
	let lifecycleRuntime;
	try {
		const bootstrap = await prepareGatewayServerBootstrap({
			port,
			opts,
			log: log$1,
			logSecrets,
			loadWorkerEnvironmentStartupModule,
			formatRuntimeGatewayAuthTokenWarning
		});
		const runtime = await bootstrap.startupTrace.measure("gateway.kernel-state", () => prepareGatewayKernelState({
			bootstrap,
			port,
			opts,
			log: log$1,
			logChannels: logChannels$1,
			logHooks: logHooks$1,
			logPlugins,
			gatewayRuntime,
			resolveChannelRuntime: getChannelRuntime,
			loadWorkerEnvironmentStartupModule,
			loadWorkerPlacementStartupModule
		}));
		const shutdownRuntime = await runtime.startupTrace.measure("gateway.shutdown-runtime-import", async () => (await loadGatewayShutdownModule()).prepareGatewayShutdownRuntime());
		const preparedLifecycleRuntime = await runtime.startupTrace.measure("gateway.lifecycle", () => prepareGatewayLifecycle({
			runtime,
			releasePluginMetadata,
			port,
			log: log$1,
			logCron: logCron$1,
			diagnosticsEnabled: bootstrap.diagnosticsEnabled,
			shutdownRuntime
		}));
		lifecycleRuntime = preparedLifecycleRuntime;
		if (bootstrap.cfgAtStart.gateway?.tls?.enabled && !runtime.gatewayTls.enabled) throw new Error(runtime.gatewayTls.error ?? "gateway tls: failed to enable");
		const coreRuntime = await runtime.startupTrace.measure("gateway.core-runtime", () => startGatewayCoreRuntime({
			lifecycleRuntime: preparedLifecycleRuntime,
			port,
			log: log$1,
			logDiscovery,
			logHealth: logHealth$1,
			logChannels: logChannels$1,
			loadGatewayStartupEarlyModule,
			loadGatewayPluginBootstrapModule,
			loadGatewayModelCatalog,
			loadGatewayModelCatalogSnapshot,
			readPreparedGatewayModelCatalog
		}));
		if (!options.deferEarlyRuntime) await coreRuntime.startEarlyRuntime();
		return await runtime.startupTrace.measure("gateway.request-runtime", () => prepareGatewayKernelRequestRuntime({
			coreRuntime,
			log: log$1,
			logHealth: logHealth$1
		}));
	} catch (error) {
		try {
			if (lifecycleRuntime) await lifecycleRuntime.closeOnStartupFailure();
			else {
				clearGatewayAgentCliShim();
				clearSecretsRuntimeSnapshotState();
			}
		} finally {
			releasePluginMetadata();
		}
		throw error;
	}
}
//#endregion
//#region src/gateway/mcp-app-sandbox-http.ts
const MCP_APP_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), clipboard-write=()";
function handleMcpAppSandboxHttpRequest(req, res) {
	let url;
	try {
		url = new URL(req.url ?? "/", "http://localhost");
	} catch {
		respondPlainText(res, 400, "Bad Request");
		return;
	}
	if (url.pathname !== "/mcp-app-sandbox" || req.method !== "GET" && req.method !== "HEAD") {
		respondPlainText(res, 404, "Not Found");
		return;
	}
	let csp;
	try {
		csp = decodeSandboxHostCsp(url.searchParams.get("csp"));
	} catch {
		respondPlainText(res, 400, "invalid MCP App sandbox policy");
		return;
	}
	res.statusCode = 200;
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("Content-Security-Policy", buildSandboxHostContentSecurityPolicy(csp));
	res.setHeader("Permissions-Policy", MCP_APP_PERMISSIONS_POLICY);
	res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
	res.setHeader("Origin-Agent-Cluster", "?1");
	res.setHeader("Referrer-Policy", "no-referrer");
	res.setHeader("X-Content-Type-Options", "nosniff");
	const html = buildSandboxHostProxyHtml(csp);
	res.setHeader("Content-Length", String(Buffer.byteLength(html)));
	res.end(req.method === "HEAD" ? void 0 : html);
}
/** Dedicated listener: this origin must never serve Control UI or authenticated Gateway data. */
function createSandboxHostHttpServer(tlsOptions) {
	const handler = (req, res) => {
		handleMcpAppSandboxHttpRequest(req, res);
	};
	return tlsOptions ? createServer$2(tlsOptions, handler) : createServer$1(handler);
}
//#endregion
//#region src/gateway/server/http-listen.ts
const EADDRINUSE_MAX_RETRIES = 20;
const EADDRINUSE_RETRY_INTERVAL_MS = 500;
async function closeServerQuietly(httpServer) {
	await new Promise((resolve) => {
		try {
			httpServer.close(() => resolve());
		} catch {
			resolve();
		}
	});
}
/** Listen on the configured gateway host/port, retrying transient EADDRINUSE windows. */
async function listenGatewayHttpServer(params) {
	const { httpServer, bindHost, port, retryEaddrinuse = true, serviceName = "gateway", endpointScheme = "ws" } = params;
	const maxRetries = retryEaddrinuse ? EADDRINUSE_MAX_RETRIES : 0;
	for (const attempt of Array.from({ length: maxRetries + 1 }, (_, index) => index)) try {
		await new Promise((resolve, reject) => {
			const onError = (err) => {
				httpServer.off("listening", onListening);
				reject(err);
			};
			const onListening = () => {
				httpServer.off("error", onError);
				resolve();
			};
			httpServer.once("error", onError);
			httpServer.once("listening", onListening);
			httpServer.listen(port, bindHost);
		});
		return;
	} catch (err) {
		const code = err.code;
		if (code === "EADDRINUSE" && attempt < maxRetries) {
			await closeServerQuietly(httpServer);
			await sleep(EADDRINUSE_RETRY_INTERVAL_MS);
			continue;
		}
		if (code === "EADDRINUSE") throw new GatewayLockError(`another ${serviceName} instance is already listening on ${endpointScheme}://${bindHost}:${port}`, err);
		throw new GatewayLockError(`failed to bind ${serviceName} socket on ${endpointScheme}://${bindHost}:${port}: ${String(err)}`, err);
	}
}
//#endregion
//#region src/gateway/portals/portal-http-proxy.ts
const PORTAL_AUTH_NAME = "openclaw_portal";
function portalAuthCookieName(listenPort) {
	return `${PORTAL_AUTH_NAME}_${listenPort}`;
}
const PORTAL_COOKIE_PREFIX = "oc_portal_";
const PORTAL_REFERRER_POLICY = "no-referrer";
const MAX_WEBSOCKET_RESPONSE_HEADER_BYTES = 65536;
const HOP_BY_HOP_HEADERS = /* @__PURE__ */ new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"proxy-connection",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade"
]);
function tokensEqual(candidate, expected) {
	if (!candidate) return false;
	const candidateBytes = Buffer.from(candidate);
	const expectedBytes = Buffer.from(expected);
	return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}
function readPortalCookie(cookieHeader, listenPort) {
	const authCookieName = portalAuthCookieName(listenPort);
	for (const segment of cookieHeader?.split(";") ?? []) {
		const separator = segment.indexOf("=");
		if (separator < 0 || segment.slice(0, separator).trim() !== authCookieName) continue;
		return segment.slice(separator + 1).trim();
	}
}
function portalCookiePrefix(cookieNamespace) {
	return `${PORTAL_COOKIE_PREFIX}${cookieNamespace}_`;
}
function readTargetCookies(cookieHeader, cookieNamespace) {
	const prefix = portalCookiePrefix(cookieNamespace);
	return (cookieHeader?.split(";") ?? []).flatMap((segment) => {
		const separator = segment.indexOf("=");
		if (separator <= 0) return [];
		const name = segment.slice(0, separator).trim();
		if (!name.startsWith(prefix) || name.length === prefix.length) return [];
		return [`${name.slice(prefix.length)}=${segment.slice(separator + 1).trim()}`];
	}).join("; ") || void 0;
}
function rewriteTargetCookie(cookie, cookieNamespace) {
	const [cookiePair, ...attributes] = cookie.split(";");
	const separator = cookiePair?.indexOf("=") ?? -1;
	if (!cookiePair || separator <= 0) return;
	const name = cookiePair.slice(0, separator).trim();
	if (!name) return;
	const retainedAttributes = attributes.filter((attribute) => !/^\s*domain\s*=/iu.test(attribute));
	const suffix = retainedAttributes.length > 0 ? `;${retainedAttributes.join(";")}` : "";
	return `${portalCookiePrefix(cookieNamespace)}${name}=${cookiePair.slice(separator + 1)}${suffix}`;
}
function parsePortalUrl(req) {
	try {
		return new URL(req.url ?? "/", "http://openclaw.invalid");
	} catch {
		return;
	}
}
function authorizePortalRequest(req, target) {
	const url = parsePortalUrl(req);
	if (tokensEqual(url?.searchParams.get(PORTAL_AUTH_NAME) ?? void 0, target.token)) {
		url?.searchParams.delete(PORTAL_AUTH_NAME);
		return {
			kind: "authorized",
			requestPath: `${url?.pathname ?? "/"}${url?.search ?? ""}`,
			setCookie: true
		};
	}
	if (tokensEqual(readPortalCookie(req.headers.cookie, target.listenPort), target.token)) {
		url?.searchParams.delete(PORTAL_AUTH_NAME);
		return {
			kind: "authorized",
			requestPath: `${url?.pathname ?? "/"}${url?.search ?? ""}`,
			setCookie: false
		};
	}
	return { kind: "unauthorized" };
}
function portalCookie(target, tls) {
	return `${portalAuthCookieName(target.listenPort)}=${target.token}; HttpOnly; SameSite=Lax; Path=/${tls ? "; Secure" : ""}`;
}
function setProxyResponseHeader(res, name, value, cookieNamespace) {
	if (name !== "set-cookie") {
		res.setHeader(name, value);
		return;
	}
	const existing = res.getHeader("Set-Cookie");
	const existingCookies = existing === void 0 ? [] : Array.isArray(existing) ? existing : [existing];
	const rewrittenCookies = (Array.isArray(value) ? value : [String(value)]).flatMap((cookie) => {
		const rewritten = rewriteTargetCookie(cookie, cookieNamespace);
		return rewritten ? [rewritten] : [];
	});
	const cookies = [...existingCookies.map(String), ...rewrittenCookies];
	if (cookies.length > 0) res.setHeader("Set-Cookie", cookies);
}
function htmlResponse(res, statusCode, html, headOnly) {
	res.statusCode = statusCode;
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("Referrer-Policy", PORTAL_REFERRER_POLICY);
	res.setHeader("Content-Length", String(Buffer.byteLength(html)));
	res.end(headOnly ? void 0 : html);
}
function respondPortalUnauthorized(req, res) {
	htmlResponse(res, 401, "<!doctype html><meta charset=utf-8><title>Private portal</title><p>This portal is private. Open it from the OpenClaw Control UI.</p>", req.method === "HEAD");
}
function portalWaitingHtml(targetPort) {
	return `<!doctype html><meta charset=utf-8><meta http-equiv="refresh" content="2"><title>Waiting for app</title><p>Waiting for the app on port ${targetPort}…</p>`;
}
function respondPortalWaiting(req, res, targetPort) {
	htmlResponse(res, 502, portalWaitingHtml(targetPort), req.method === "HEAD");
}
async function connectPortalTarget(target) {
	if (target.kind === "worker") return await target.connect();
	return net.connect({
		host: "localhost",
		autoSelectFamily: true,
		port: target.port
	});
}
function connectionHeaderTokens(headers) {
	const value = headers.connection;
	const joined = Array.isArray(value) ? value.join(",") : value;
	return new Set((joined ?? "").split(",").map((token) => token.trim().toLowerCase()).filter(Boolean));
}
function proxyHeaders(headers, cookieNamespace) {
	const result = {};
	const connectionTokens = connectionHeaderTokens(headers);
	for (const [name, value] of Object.entries(headers)) {
		const normalized = name.toLowerCase();
		if (value === void 0 || HOP_BY_HOP_HEADERS.has(normalized) || connectionTokens.has(normalized)) continue;
		if (normalized === "cookie" && cookieNamespace !== void 0) {
			const cookie = readTargetCookies(Array.isArray(value) ? value.join("; ") : value, cookieNamespace);
			if (cookie) result.cookie = cookie;
			continue;
		}
		if (normalized === "referer" && String(value).includes(`${PORTAL_AUTH_NAME}=`)) continue;
		result[normalized] = value;
	}
	return result;
}
/** Proxies one authorized portal request to its local or worker target. */
function handlePortalProxyRequest(params) {
	const { req, res, target, tls } = params;
	const authorization = authorizePortalRequest(req, target);
	if (authorization.kind === "unauthorized") {
		respondPortalUnauthorized(req, res);
		return;
	}
	if (authorization.setCookie) res.setHeader("Set-Cookie", portalCookie(target, tls));
	const headers = proxyHeaders(req.headers, target.cookieNamespace);
	const originalHost = req.headers.host;
	const targetPort = target.target.kind === "local" ? target.target.port : target.target.remotePort;
	headers.host = `localhost:${targetPort}`;
	headers["x-forwarded-for"] = req.socket.remoteAddress ?? "";
	headers["x-forwarded-proto"] = tls ? "https" : "http";
	if (originalHost) headers["x-forwarded-host"] = originalHost;
	connectPortalTarget(target.target).then((targetSocket) => {
		if (req.aborted || res.destroyed) {
			targetSocket.destroy();
			return;
		}
		const proxyReq = request({
			hostname: "localhost",
			createConnection: () => targetSocket,
			port: targetPort,
			method: req.method,
			path: authorization.requestPath,
			headers
		});
		proxyReq.once("response", (proxyRes) => {
			for (const [name, value] of Object.entries(proxyHeaders(proxyRes.headers))) if (value !== void 0) setProxyResponseHeader(res, name, value, target.cookieNamespace);
			res.setHeader("Referrer-Policy", PORTAL_REFERRER_POLICY);
			res.statusCode = proxyRes.statusCode ?? 502;
			proxyRes.once("error", () => res.destroy());
			res.flushHeaders();
			proxyRes.pipe(res);
		});
		proxyReq.once("error", () => {
			if (!res.headersSent) respondPortalWaiting(req, res, targetPort);
			else res.destroy();
		});
		proxyReq.once("close", () => {
			if (target.target.kind === "worker" && !res.headersSent && !res.writableEnded) respondPortalWaiting(req, res, targetPort);
		});
		res.once("close", () => proxyReq.destroy());
		req.pipe(proxyReq);
	}, () => {
		if (!res.headersSent && !res.writableEnded && !res.destroyed) respondPortalWaiting(req, res, targetPort);
	});
}
function websocketHeaders(req, targetPort, cookieNamespace, requestPath) {
	const lines = [`${req.method ?? "GET"} ${requestPath} HTTP/1.1`];
	for (const [name, value] of Object.entries(req.headers)) {
		const normalized = name.toLowerCase();
		if (value === void 0 || normalized === "host" || HOP_BY_HOP_HEADERS.has(normalized) && normalized !== "connection" && normalized !== "upgrade") continue;
		if (normalized === "cookie") {
			const cookie = readTargetCookies(Array.isArray(value) ? value.join("; ") : value, cookieNamespace);
			if (cookie) lines.push(`cookie: ${cookie}`);
			continue;
		}
		if (normalized === "referer" && String(value).includes(`${PORTAL_AUTH_NAME}=`)) continue;
		for (const item of Array.isArray(value) ? value : [value]) lines.push(`${normalized}: ${item}`);
	}
	lines.push(`host: localhost:${targetPort}`, "", "");
	return lines.join("\r\n");
}
function rejectPortalUpgrade(socket) {
	socket.end("HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 12\r\nConnection: close\r\n\r\nUnauthorized");
}
function respondUpgradeWaiting(socket, targetPort) {
	const html = portalWaitingHtml(targetPort);
	socket.end(`HTTP/1.1 502 Bad Gateway\r
Content-Type: text/html; charset=utf-8\r
Cache-Control: no-store\r\nReferrer-Policy: ${PORTAL_REFERRER_POLICY}\r\nContent-Length: ${Buffer.byteLength(html)}\r\nConnection: close\r\n\r\n${html}`);
}
function forwardWebSocketResponse(targetSocket, browserSocket, cookieNamespace, onResponse) {
	let pending = Buffer.alloc(0);
	const onData = (chunk) => {
		pending = Buffer.concat([pending, chunk]);
		const headerEnd = pending.indexOf("\r\n\r\n");
		if (headerEnd < 0) {
			if (pending.length > MAX_WEBSOCKET_RESPONSE_HEADER_BYTES) {
				targetSocket.destroy();
				browserSocket.destroy();
			}
			return;
		}
		targetSocket.off("data", onData);
		const rewrittenLines = pending.subarray(0, headerEnd).toString("latin1").split("\r\n").flatMap((line) => {
			const separator = line.indexOf(":");
			if (separator <= 0 || line.slice(0, separator).trim().toLowerCase() !== "set-cookie") return [line];
			const rewritten = rewriteTargetCookie(line.slice(separator + 1).trimStart(), cookieNamespace);
			return rewritten ? [`${line.slice(0, separator)}: ${rewritten}`] : [];
		});
		onResponse();
		browserSocket.write(`${rewrittenLines.join("\r\n")}\r\n\r\n`);
		const remainder = pending.subarray(headerEnd + 4);
		if (remainder.length > 0) browserSocket.write(remainder);
		targetSocket.pipe(browserSocket);
	};
	targetSocket.on("data", onData);
}
/** Splices an authorized portal WebSocket upgrade into its local or worker target. */
function handlePortalProxyUpgrade(params) {
	const { req, socket, head, target, upgradedSockets } = params;
	const authorization = authorizePortalRequest(req, target);
	if (authorization.kind !== "authorized") {
		rejectPortalUpgrade(socket);
		return;
	}
	const targetPort = target.target.kind === "local" ? target.target.port : target.target.remotePort;
	upgradedSockets.add(socket);
	socket.once("close", () => upgradedSockets.delete(socket));
	connectPortalTarget(target.target).then((targetSocket) => {
		if (socket.destroyed) {
			targetSocket.destroy();
			return;
		}
		upgradedSockets.add(targetSocket);
		let responseStarted = false;
		let waitingResponseSent = false;
		const closeUpgrade = () => {
			if (target.target.kind === "worker" && !responseStarted && !socket.destroyed) {
				if (!waitingResponseSent) {
					waitingResponseSent = true;
					respondUpgradeWaiting(socket, targetPort);
				}
				return;
			}
			socket.destroy();
		};
		socket.once("close", () => targetSocket.destroy());
		targetSocket.once("close", () => {
			upgradedSockets.delete(targetSocket);
			closeUpgrade();
		});
		targetSocket.once("end", closeUpgrade);
		socket.once("error", () => targetSocket.destroy());
		targetSocket.once("error", closeUpgrade);
		const spliceUpgrade = () => {
			forwardWebSocketResponse(targetSocket, socket, target.cookieNamespace, () => {
				responseStarted = true;
			});
			targetSocket.write(websocketHeaders(req, targetPort, target.cookieNamespace, authorization.requestPath));
			if (head.length > 0) targetSocket.write(head);
			socket.pipe(targetSocket);
		};
		if (target.target.kind === "worker") spliceUpgrade();
		else targetSocket.once("connect", spliceUpgrade);
	}, () => {
		if (!socket.destroyed) {
			if (target.target.kind === "worker") respondUpgradeWaiting(socket, targetPort);
			else socket.destroy();
		}
	});
}
//#endregion
//#region src/gateway/portals/portal-service.ts
const PORTAL_PORT_ALLOCATION_ATTEMPTS = 10;
function removeServers(shared, owned) {
	for (const server of owned) {
		const index = shared.indexOf(server);
		if (index >= 0) shared.splice(index, 1);
	}
}
async function closeServers(servers) {
	await Promise.all(servers.map((server) => new Promise((resolve) => {
		if (!server.listening) {
			resolve();
			return;
		}
		server.close(() => resolve());
		server.closeAllConnections();
	})));
}
function formatPortalHost(host) {
	const openableHost = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
	return openableHost.includes(":") ? `[${openableHost}]` : openableHost;
}
/** Creates the gateway-lifetime registry and per-portal transport listeners. */
function createGatewayPortalService(params) {
	const entries = /* @__PURE__ */ new Map();
	const operations = /* @__PURE__ */ new Map();
	let closed = false;
	const summarize = (portal) => {
		const host = params.httpBindHosts[0];
		if (!host) throw new Error("Gateway listener must start before opening a portal");
		const scheme = params.tlsOptions ? "https" : "http";
		const tokenQuery = `openclaw_portal=${portal.token}`;
		const publicUrl = `${scheme}://${formatPortalHost(host)}:${portal.listenPort}${portal.path ?? "/"}`;
		const openableUrl = new URL(publicUrl);
		openableUrl.searchParams.set("openclaw_portal", portal.token);
		return {
			id: portal.id,
			title: portal.title,
			port: portal.target.kind === "local" ? portal.target.port : portal.target.remotePort,
			listenPort: portal.listenPort,
			tokenQuery,
			url: openableUrl.toString(),
			publicUrl,
			...portal.path ? { path: portal.path } : {},
			...portal.description ? { description: portal.description } : {},
			...portal.origin ? { origin: portal.origin } : {},
			createdAtMs: portal.createdAtMs
		};
	};
	const serialize = async (id, operation) => {
		const result = (operations.get(id) ?? Promise.resolve()).then(operation, operation);
		const completion = result.then(() => void 0, () => void 0);
		operations.set(id, completion);
		try {
			return await result;
		} finally {
			if (operations.get(id) === completion) operations.delete(id);
		}
	};
	const closeEntry = async (id) => {
		const runtime = entries.get(id);
		if (!runtime) return;
		entries.delete(id);
		removeServers(params.httpServers, runtime.servers);
		for (const socket of runtime.upgradedSockets) socket.destroy();
		runtime.upgradedSockets.clear();
		await closeServers(runtime.servers);
		await runtime.onClose?.();
	};
	const summarizeEntries = (selected) => Array.from(selected, ({ portal }) => summarize(portal)).toSorted((left, right) => left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id));
	return {
		open: async (input) => {
			const target = input.target ?? {
				kind: "local",
				port: input.targetPort
			};
			const targetPort = target.kind === "local" ? target.port : target.remotePort;
			const id = target.kind === "local" ? `p${targetPort}` : `p${targetPort}-worker-${sha256HexPrefixCore(target.environmentId, 32)}-${target.ownerEpoch}`;
			return await serialize(id, async () => {
				let releaseTarget = input.onClose;
				try {
					if (closed) throw new Error("portals unavailable");
					input.assertCurrent?.();
					const existing = entries.get(id);
					if (existing) {
						existing.portal.title = input.title?.trim() || existing.portal.title;
						if (input.description !== void 0) existing.portal.description = input.description;
						if (input.path !== void 0) existing.portal.path = input.path;
						if (input.origin !== void 0) existing.portal.origin = input.origin;
						return summarize(existing.portal);
					}
					if (params.httpBindHosts.length === 0) throw new Error("Gateway listener must start before opening a portal");
					const portal = {
						id,
						title: input.title?.trim() || `Port ${targetPort}`,
						...input.description ? { description: input.description } : {},
						...input.path ? { path: input.path } : {},
						...input.origin ? { origin: input.origin } : {},
						target,
						token: randomBytes(32).toString("hex"),
						cookieNamespace: randomBytes(16).toString("hex"),
						listenPort: 0,
						createdAtMs: Date.now()
					};
					const upgradedSockets = /* @__PURE__ */ new Set();
					const handler = (req, res) => handlePortalProxyRequest({
						req,
						res,
						target: portal,
						tls: Boolean(params.tlsOptions)
					});
					const servers = params.httpBindHosts.map(() => params.tlsOptions ? createServer$2(params.tlsOptions, handler) : createServer$1(handler));
					for (const server of servers) server.on("upgrade", (req, socket, head) => handlePortalProxyUpgrade({
						req,
						socket,
						head,
						target: portal,
						upgradedSockets
					}));
					params.httpServers.push(...servers);
					try {
						const primaryServer = servers[0];
						const primaryHost = params.httpBindHosts[0];
						if (!primaryServer || !primaryHost) throw new Error("Missing primary portal HTTP server");
						for (let attempt = 0; attempt < PORTAL_PORT_ALLOCATION_ATTEMPTS; attempt += 1) {
							await listenGatewayHttpServer({
								httpServer: primaryServer,
								bindHost: primaryHost,
								port: 0,
								retryEaddrinuse: false,
								serviceName: "portal",
								endpointScheme: params.tlsOptions ? "https" : "http"
							});
							const address = primaryServer.address();
							if (!address || typeof address === "string") throw new Error("Portal listener failed to resolve its port");
							if (target.kind === "worker" || address.port !== targetPort) {
								portal.listenPort = address.port;
								break;
							}
							await closeServers([primaryServer]);
						}
						if (portal.listenPort === 0) throw new Error(`Portal listener repeatedly allocated target port ${targetPort}`);
						for (const [index, host] of params.httpBindHosts.entries()) {
							if (index === 0) continue;
							const server = servers[index];
							if (!server) throw new Error(`Missing portal HTTP server for bind host ${host}`);
							await listenGatewayHttpServer({
								httpServer: server,
								bindHost: host,
								port: portal.listenPort,
								retryEaddrinuse: false,
								serviceName: "portal",
								endpointScheme: params.tlsOptions ? "https" : "http"
							});
						}
						input.assertCurrent?.();
					} catch (error) {
						removeServers(params.httpServers, servers);
						await closeServers(servers);
						throw error;
					}
					entries.set(id, {
						portal,
						servers,
						upgradedSockets,
						...input.onClose ? { onClose: input.onClose } : {}
					});
					releaseTarget = void 0;
					return summarize(portal);
				} finally {
					await releaseTarget?.();
				}
			});
		},
		list: () => summarizeEntries(entries.values()),
		listWorkerPortals: (environmentId, ownerEpoch) => summarizeEntries([...entries.values()].filter(({ portal }) => portal.target.kind === "worker" && portal.target.environmentId === environmentId && portal.target.ownerEpoch === ownerEpoch)),
		close: async (id, assertCurrent) => {
			await serialize(id, () => {
				assertCurrent?.();
				return closeEntry(id);
			});
		},
		closeWorkerPortals: async (environmentId, ownerEpoch) => {
			const environmentSuffix = `-worker-${sha256HexPrefixCore(environmentId, 32)}-`;
			const ids = [.../* @__PURE__ */ new Set([...entries.keys(), ...operations.keys()])].filter((id) => {
				const separator = id.indexOf(environmentSuffix);
				return separator >= 0 && (ownerEpoch === void 0 || id.slice(separator + environmentSuffix.length) === String(ownerEpoch));
			});
			await Promise.all(ids.map((id) => serialize(id, () => closeEntry(id))));
		},
		closeAll: async () => {
			closed = true;
			const ids = /* @__PURE__ */ new Set([...entries.keys(), ...operations.keys()]);
			await Promise.all([...ids].map((id) => serialize(id, () => closeEntry(id))));
		}
	};
}
//#endregion
//#region src/channels/plugins/gateway-auth-bypass.ts
const GATEWAY_AUTH_API_ARTIFACT_BASENAME = "gateway-auth-api.js";
const MISSING_PUBLIC_SURFACE_PREFIX = "Unable to resolve bundled plugin public surface ";
/** Resolves to null when the plugin is not activated or ships no gateway auth artifact. */
async function loadChannelGatewayAuthApi(channelId) {
	try {
		return await tryLoadActivatedBundledPluginPublicSurfaceModule({
			dirName: channelId,
			artifactBasename: GATEWAY_AUTH_API_ARTIFACT_BASENAME
		});
	} catch (error) {
		if (error instanceof Error && error.message.startsWith(MISSING_PUBLIC_SURFACE_PREFIX)) return null;
		throw error;
	}
}
/**
* Resolves configured gateway auth bypass paths from a channel plugin artifact.
*/
async function resolveBundledChannelGatewayAuthBypassPaths(params) {
	return ((await loadChannelGatewayAuthApi(params.channelId))?.resolveGatewayAuthBypassPaths?.({ cfg: params.cfg }) ?? []).flatMap((path) => typeof path === "string" && path.trim() ? [path.trim()] : []);
}
//#endregion
//#region src/gateway/server-http-plugin-auth.ts
let pluginGatewayAuthBypassPathsCache = /* @__PURE__ */ new WeakMap();
registerPluginMetadataProcessMemoLifecycleClear(() => {
	pluginGatewayAuthBypassPathsCache = /* @__PURE__ */ new WeakMap();
});
async function resolvePluginGatewayAuthBypassPaths(configSnapshot) {
	const paths = /* @__PURE__ */ new Set();
	const configuredChannels = configSnapshot.channels;
	if (!configuredChannels || Object.keys(configuredChannels).length === 0) return paths;
	for (const channelId of Object.keys(configuredChannels)) for (const path of await resolveBundledChannelGatewayAuthBypassPaths({
		channelId,
		cfg: configSnapshot
	})) paths.add(path);
	return paths;
}
function getCachedPluginGatewayAuthBypassPaths(configSnapshot) {
	const cache = pluginGatewayAuthBypassPathsCache;
	const cached = cache.get(configSnapshot);
	if (cached) return cached;
	const resolved = resolvePluginGatewayAuthBypassPaths(configSnapshot).catch((error) => {
		cache.delete(configSnapshot);
		throw error;
	});
	cache.set(configSnapshot, resolved);
	return resolved;
}
function shouldEnforceDefaultPluginGatewayAuth(pathContext) {
	return pathContext.malformedEncoding || pathContext.decodePassLimitReached || isProtectedPluginRoutePathFromContext(pathContext);
}
//#endregion
//#region src/gateway/server-http-probes.ts
const getHttpAuthUtilsModule$2 = createLazyRuntimeModule(() => import("./http-auth-utils-BbowfJkV.js"));
async function shouldIncludeGatewayProbeDetails(params) {
	if (readPreparedGatewayIngressAttribution(params.req)?.kind === "direct-local" || !readPreparedGatewayIngressAttribution(params.req) && isLocalDirectRequest(params.req, params.trustedProxies, params.allowRealIpFallback)) return true;
	if (params.resolvedAuth.mode === "none") return false;
	const { getBearerToken, resolveHttpBrowserOriginPolicy } = await getHttpAuthUtilsModule$2();
	const bearerToken = getBearerToken(params.req);
	return (await authorizeHttpGatewayConnect({
		auth: params.resolvedAuth,
		connectAuth: bearerToken ? {
			token: bearerToken,
			password: bearerToken
		} : null,
		req: params.req,
		trustedProxies: params.trustedProxies,
		allowRealIpFallback: params.allowRealIpFallback,
		rateLimiter: params.rateLimiter,
		browserOriginPolicy: resolveHttpBrowserOriginPolicy(params.req)
	})).ok;
}
function startupProbeBody(result, includeDetails) {
	if (!includeDetails) return JSON.stringify({
		ok: result.ok,
		status: result.status
	});
	return JSON.stringify({
		ok: result.ok,
		status: result.status,
		version: resolveRuntimeServiceVersion(process.env),
		uptimeMs: result.uptimeMs,
		...result.status === "starting" ? { pendingReason: result.pendingReason } : {}
	});
}
/** Handles live/ready/startup probe endpoints before normal gateway routing. */
async function handleGatewayProbeRequest(req, res, requestPath, resolvedAuth, trustedProxies, allowRealIpFallback, rateLimiter, getReadiness, getStartup) {
	const status = classifyGatewayProbePath(requestPath);
	if (status === "namespace" || status === "outside") return false;
	const method = (req.method ?? "GET").toUpperCase();
	if (method !== "GET" && method !== "HEAD") {
		res.statusCode = 405;
		res.setHeader("Allow", "GET, HEAD");
		res.setHeader("Content-Type", "text/plain; charset=utf-8");
		res.end("Method Not Allowed");
		return true;
	}
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	let statusCode;
	let body;
	if (status === "ready" && getReadiness) {
		const includeDetails = await shouldIncludeGatewayProbeDetails({
			req,
			resolvedAuth,
			trustedProxies,
			allowRealIpFallback,
			rateLimiter
		});
		try {
			const result = getReadiness();
			statusCode = result.ready ? 200 : 503;
			body = JSON.stringify(includeDetails ? result : { ready: result.ready });
		} catch {
			statusCode = 503;
			body = JSON.stringify(includeDetails ? {
				ready: false,
				failing: ["internal"],
				uptimeMs: 0
			} : { ready: false });
		}
	} else if (status === "startup") {
		const includeDetails = await shouldIncludeGatewayProbeDetails({
			req,
			resolvedAuth,
			trustedProxies,
			allowRealIpFallback,
			rateLimiter
		});
		try {
			const result = getStartup?.() ?? {
				ok: true,
				status: "started",
				uptimeMs: 0
			};
			statusCode = result.ok ? 200 : 503;
			body = startupProbeBody(result, includeDetails);
		} catch {
			const result = {
				ok: false,
				status: "starting",
				uptimeMs: 0,
				pendingReason: "internal"
			};
			statusCode = 503;
			body = startupProbeBody(result, includeDetails);
		}
	} else {
		statusCode = 200;
		body = JSON.stringify({
			ok: true,
			status
		});
	}
	res.statusCode = statusCode;
	res.setHeader("Content-Length", String(Buffer.byteLength(body)));
	res.end(method === "HEAD" ? void 0 : body);
	return true;
}
//#endregion
//#region src/gateway/server-http-upgrades.ts
const getPluginNodeCapabilityAuthModule$1 = createLazyRuntimeModule(() => import("./plugin-node-capability-auth-CWy5WpIb.js"));
const getHttpAuthUtilsModule$1 = createLazyRuntimeModule(() => import("./http-auth-utils-BbowfJkV.js"));
const getPluginRouteRuntimeScopesModule$1 = createLazyRuntimeModule(() => import("./plugin-route-runtime-scopes-ont5wzZ1.js"));
function writeUpgradeAuthFailure(socket, auth) {
	if (auth.rateLimited) {
		const retryAfterSeconds = auth.retryAfterMs && auth.retryAfterMs > 0 ? Math.ceil(auth.retryAfterMs / 1e3) : void 0;
		const body = JSON.stringify({ error: {
			message: "Too many failed authentication attempts. Please try again later.",
			type: "rate_limited"
		} });
		socket.write([
			"HTTP/1.1 429 Too Many Requests",
			...retryAfterSeconds ? [`Retry-After: ${retryAfterSeconds}`] : [],
			"Content-Type: application/json; charset=utf-8",
			`Content-Length: ${Buffer.byteLength(body, "utf8")}`,
			"Connection: close",
			"",
			body
		].join("\r\n"));
		return;
	}
	if (auth.reason === "proxy_attribution_required") {
		const body = JSON.stringify({ error: {
			message: `Proxy client attribution is required. ${PROXY_ATTRIBUTION_GUIDANCE}`,
			type: PROXY_ATTRIBUTION_REQUIRED_REASON
		} });
		socket.write([
			"HTTP/1.1 403 Forbidden",
			"Content-Type: application/json; charset=utf-8",
			`Content-Length: ${Buffer.byteLength(body, "utf8")}`,
			"Connection: close",
			"",
			body
		].join("\r\n"));
		return;
	}
	socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
}
function handleBudgetedGatewayWebSocketUpgrade(params) {
	const { req, socket, head, wss, preauthConnectionBudget, preauthBudgetKey, ingressName } = params;
	const allowsRestartStartupPreauth = ingressName === "Gateway" && isGatewayRestartDraining() && getGatewaySuspendAdmissionPhase() === "accepting" && params.isStartupPending?.() === true;
	if (isGatewayWorkAdmissionClosed() && !allowsRestartStartupPreauth && (ingressName === "Worker" || isGatewayRestartDraining() || getGatewaySuspendAdmissionPhase() !== "draining" && getGatewaySuspendAdmissionPhase() !== "prepared")) {
		writeGatewayUpgradeServiceUnavailable(socket, `${ingressName} websocket admission closed`);
		socket.destroy();
		return;
	}
	if (wss.listenerCount("connection") === 0) {
		writeGatewayUpgradeServiceUnavailable(socket, `${ingressName} websocket handlers unavailable`);
		socket.destroy();
		return;
	}
	if (!preauthConnectionBudget.acquire(preauthBudgetKey)) {
		writeGatewayUpgradeServiceUnavailable(socket, "Too many unauthenticated sockets");
		socket.destroy();
		return;
	}
	let budgetTransferred = false;
	const releaseUpgradeBudget = () => {
		if (!budgetTransferred) {
			budgetTransferred = true;
			preauthConnectionBudget.release(preauthBudgetKey);
		}
	};
	socket.once("close", releaseUpgradeBudget);
	try {
		wss.handleUpgrade(req, socket, head, (ws) => {
			const ingressSocket = ws;
			ingressSocket["__openclawPreauthBudgetKey"] = preauthBudgetKey;
			params.prepareSocket?.(ingressSocket);
			wss.emit("connection", ws, req);
			if (ingressSocket["__openclawPreauthBudgetClaimed"]) {
				budgetTransferred = true;
				socket.off("close", releaseUpgradeBudget);
			}
		});
	} catch (error) {
		socket.off("close", releaseUpgradeBudget);
		releaseUpgradeBudget();
		throw error;
	}
}
/** Attaches WebSocket and plugin-upgrade routing to an already-created HTTP server. */
function attachGatewayUpgradeHandler(opts) {
	const { httpServer, wss, handlePluginUpgrade, shouldEnforcePluginGatewayAuth, resolvePluginNodeCapabilityRoute, clients, preauthConnectionBudget, resolvedAuth, rateLimiter, publicRateLimiter, workerIngressEnabled, log } = opts;
	const getResolvedAuth = opts.getResolvedAuth ?? (() => resolvedAuth);
	httpServer.on("upgrade", (req, socket, head) => {
		markGatewayIngressTransport(req, opts.ingressTransport ?? { kind: "ordinary" });
		const handleUpgrade = async () => {
			const configSnapshot = getRuntimeConfig();
			const trustedProxies = configSnapshot.gateway?.trustedProxies ?? [];
			const allowRealIpFallback = configSnapshot.gateway?.allowRealIpFallback === true;
			const ingressAttribution = prepareGatewayIngressAttribution({
				req,
				trustedProxies,
				allowRealIpFallback
			});
			const requestClientIp = ingressAttribution.kind === "unattributable-proxy" ? ingressAttribution.remoteAddress : ingressAttribution.clientIp;
			const originalRequestPath = URL.parse(req.url ?? "/", "http://localhost")?.pathname;
			const originalWorkerGatewayRoute = originalRequestPath ? classifyWorkerGatewayPath(originalRequestPath) : "outside";
			if (originalWorkerGatewayRoute !== "outside" && ingressAttribution.kind === "unattributable-proxy") {
				opts.reportUnattributableProxy?.(ingressAttribution);
				writeUpgradeAuthFailure(socket, {
					ok: false,
					reason: ingressAttribution.reason
				});
				socket.destroy();
				return;
			}
			if (originalWorkerGatewayRoute === "worker" && !workerIngressEnabled) {
				writeGatewayUpgradeServiceUnavailable(socket, "Worker websocket ingress unavailable");
				socket.destroy();
				return;
			}
			if (originalWorkerGatewayRoute === "worker") {
				const rateCheck = publicRateLimiter?.check(requestClientIp, AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION);
				if (rateCheck && !rateCheck.allowed) {
					writeUpgradeAuthFailure(socket, {
						ok: false,
						reason: "rate_limited",
						rateLimited: true,
						retryAfterMs: rateCheck.retryAfterMs
					});
					socket.destroy();
					return;
				}
				try {
					handleBudgetedGatewayWebSocketUpgrade({
						req,
						socket,
						head,
						wss,
						preauthConnectionBudget,
						preauthBudgetKey: requestClientIp,
						ingressName: "Worker",
						prepareSocket: (workerSocket) => {
							workerSocket[GATEWAY_WS_CONNECTION_KIND_PROPERTY] = "worker";
							markPublicWorkerIngress(workerSocket, {
								clientIp: requestClientIp,
								rateLimiter: publicRateLimiter
							});
						}
					});
				} catch {
					throw new Error("public worker websocket upgrade failed");
				}
				return;
			}
			if (originalWorkerGatewayRoute !== "outside") {
				socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
				socket.destroy();
				return;
			}
			const scopedNodeCapability = normalizePluginNodeCapabilityScopedUrl(req.url ?? "/");
			if (scopedNodeCapability.malformedScopedPath) {
				writeUpgradeAuthFailure(socket, {
					ok: false,
					reason: "unauthorized"
				});
				socket.destroy();
				return;
			}
			if (scopedNodeCapability.rewrittenUrl) req.url = scopedNodeCapability.rewrittenUrl;
			const resolvedAuthLocal = getResolvedAuth();
			const requestPath = scopedNodeCapability.pathname;
			const pathContext = resolvePluginRoutePathContext(requestPath);
			if (classifyWorkerGatewayPath(requestPath) !== "outside") {
				socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
				socket.destroy();
				return;
			}
			const nodeCapability = resolvePluginNodeCapabilityRoute?.(pathContext);
			if (ingressAttribution.kind === "unattributable-proxy") {
				opts.reportUnattributableProxy?.(ingressAttribution);
				if (nodeCapability || !opts.isPluginAuthenticatedRoute?.(pathContext)) {
					writeUpgradeAuthFailure(socket, {
						ok: false,
						reason: ingressAttribution.reason
					});
					socket.destroy();
					return;
				}
			}
			if (nodeCapability) {
				const { authorizePluginNodeCapabilityRequest } = await getPluginNodeCapabilityAuthModule$1();
				const ok = await authorizePluginNodeCapabilityRequest({
					req,
					auth: resolvedAuthLocal,
					trustedProxies,
					allowRealIpFallback,
					clients,
					nodeCapability,
					capability: scopedNodeCapability.capability,
					malformedScopedPath: scopedNodeCapability.malformedScopedPath,
					rateLimiter
				});
				if (!ok.ok) {
					writeUpgradeAuthFailure(socket, ok);
					socket.destroy();
					return;
				}
			}
			if (handlePluginUpgrade) {
				let pluginGatewayAuthSatisfied = false;
				let pluginGatewayRequestAuth;
				let pluginGatewayRequestOperatorScopes;
				if ((shouldEnforcePluginGatewayAuth ?? shouldEnforceDefaultPluginGatewayAuth)(pathContext) && !(await getCachedPluginGatewayAuthBypassPaths(configSnapshot)).has(requestPath)) {
					const { checkGatewayHttpRequestAuth } = await getHttpAuthUtilsModule$1();
					const authCheck = await checkGatewayHttpRequestAuth({
						req,
						auth: resolvedAuthLocal,
						trustedProxies,
						allowRealIpFallback,
						rateLimiter,
						cfg: configSnapshot
					});
					if (!authCheck.ok) {
						writeUpgradeAuthFailure(socket, authCheck.authResult);
						socket.destroy();
						return;
					}
					pluginGatewayAuthSatisfied = true;
					pluginGatewayRequestAuth = authCheck.requestAuth;
					const { resolvePluginRouteRuntimeOperatorScopes } = await getPluginRouteRuntimeScopesModule$1();
					pluginGatewayRequestOperatorScopes = resolvePluginRouteRuntimeOperatorScopes(req, authCheck.requestAuth);
				}
				if (await handlePluginUpgrade(req, socket, head, pathContext, {
					gatewayAuthSatisfied: pluginGatewayAuthSatisfied,
					gatewayRequestAuth: pluginGatewayRequestAuth,
					gatewayRequestOperatorScopes: pluginGatewayRequestOperatorScopes,
					gatewayRequestClientIp: requestClientIp
				})) return;
			}
			if (ingressAttribution.kind === "unattributable-proxy") {
				writeUpgradeAuthFailure(socket, {
					ok: false,
					reason: ingressAttribution.reason
				});
				socket.destroy();
				return;
			}
			if (requestPath === "/desktop/observe") {
				if (!opts.desktopSessionRegistry) {
					writeGatewayUpgradeServiceUnavailable(socket, "desktop observe unavailable");
					socket.destroy();
					return;
				}
				if (isGatewayWorkAdmissionClosed()) {
					writeGatewayUpgradeServiceUnavailable(socket, "Gateway websocket admission closed");
					socket.destroy();
					return;
				}
				const { handleDesktopObserveUpgrade } = await import("./observe-bridge-C9PzA3jc.js");
				handleDesktopObserveUpgrade(req, socket, head, { registry: opts.desktopSessionRegistry });
				return;
			}
			if (requestPath === "/node-desktop/attach" || requestPath === "/node-portal/attach") {
				const context = opts.getGatewayRequestContext?.();
				if (!opts.nodeDesktopStreamBroker || !context) {
					writeGatewayUpgradeServiceUnavailable(socket, `node ${requestPath === "/node-desktop/attach" ? "desktop" : "portal"} attach unavailable`);
					socket.destroy();
					return;
				}
				if (isGatewayWorkAdmissionClosed()) {
					writeGatewayUpgradeServiceUnavailable(socket, "Gateway websocket admission closed");
					socket.destroy();
					return;
				}
				await opts.nodeDesktopStreamBroker.handleUpgrade(req, socket, head, context.nodeRegistry);
				return;
			}
			try {
				handleBudgetedGatewayWebSocketUpgrade({
					req,
					socket,
					head,
					wss,
					preauthConnectionBudget,
					preauthBudgetKey: requestClientIp,
					ingressName: "Gateway",
					isStartupPending: opts.isStartupPending
				});
			} catch {
				throw new Error("gateway websocket upgrade failed");
			}
		};
		runHttpConnectionRequest(req, () => runWithDiagnosticTraceContext(createDiagnosticTraceContext(), handleUpgrade), "upgrade").catch((err) => {
			const remoteAddress = socket.remoteAddress ?? "unknown";
			const errorMessage = err instanceof Error ? err.message : String(err);
			log?.warn(`ws upgrade error from ${remoteAddress}: ${errorMessage}`);
			socket.destroy();
		});
	});
}
//#endregion
//#region src/gateway/server-http.ts
const getControlUiModule = createLazyRuntimeModule(() => import("./control-ui-DhD7PO_6.js"));
const getCanvasServeModule = createLazyRuntimeModule(() => import("./serve.runtime.js"));
const getBoardHttpModule = createLazyRuntimeModule(() => import("./board-http-DgWXmUwK.js"));
const getEmbeddingsHttpModule = createLazyRuntimeModule(() => import("./embeddings-http-DiwOwyji.js"));
const getManagedMediaAttachmentsModule = createLazyRuntimeModule(() => import("./managed-image-attachments-BLDVXyWE.js"));
const getMcpAppStandaloneModule = createLazyRuntimeModule(() => import("./mcp-app-standalone-vHklh9BX.js"));
const getPluginIconHttpModule = createLazyRuntimeModule(() => import("./plugin-icon-http-DjFcI-E9.js"));
const getWorkspaceIconHttpModule = createLazyRuntimeModule(() => import("./workspace-icon-http-DyXvtxmv.js"));
const getChannelAvatarHttpModule = createLazyRuntimeModule(() => import("./channel-avatar-http-xH_nnrhJ.js"));
const getModelsHttpModule = createLazyRuntimeModule(() => import("./models-http-BhvuGw7H.js"));
const getOpenAiHttpModule = createLazyRuntimeModule(() => import("./openai-http-8KP36xIs.js"));
const getOpenResponsesHttpModule = createLazyRuntimeModule(() => import("./openresponses-http-C-hMoMA3.js"));
const getSessionHistoryHttpModule = createLazyRuntimeModule(() => import("./sessions-history-http-BZf5Qqx-.js"));
const getSessionKillHttpModule = createLazyRuntimeModule(() => import("./session-kill-http-v6XLQgNr.js"));
const getToolsInvokeHttpModule = createLazyRuntimeModule(() => import("./tools-invoke-http-Cas_Rusk.js"));
const getUserProfilesHttpModule = createLazyRuntimeModule(() => import("./user-profiles-http-92-8EkVx.js"));
const getDevicePairingJoinHttpModule = createLazyRuntimeModule(() => import("./device-pairing-join-http-BK2xkLU1.js"));
const getPluginNodeCapabilityAuthModule = createLazyRuntimeModule(() => import("./plugin-node-capability-auth-CWy5WpIb.js"));
const getHttpAuthUtilsModule = createLazyRuntimeModule(() => import("./http-auth-utils-BbowfJkV.js"));
const getPluginRouteRuntimeScopesModule = createLazyRuntimeModule(() => import("./plugin-route-runtime-scopes-ont5wzZ1.js"));
function isWebSocketUpgradeRequest(req) {
	const headerContains = (value, token) => (typeof value === "string" ? [value] : value ?? []).some((entry) => entry.toLowerCase().split(",").some((part) => part.trim() === token));
	return headerContains(req.headers.upgrade, "websocket") && headerContains(req.headers.connection, "upgrade");
}
/** Creates the gateway HTTP/HTTPS server and ordered request-stage router. */
function createGatewayHttpServer(opts) {
	const { clients, controlUiEnabled, controlUiBasePath, controlUiRoot, openAiChatCompletionsEnabled, openAiChatCompletionsConfig, openResponsesEnabled, openResponsesConfig, strictTransportSecurityHeader, handleHooksRequest, handlePluginRequest, shouldEnforcePluginGatewayAuth, resolvePluginNodeCapabilityRoute, resolvedAuth, rateLimiter, joinRateLimiter, getReadiness, getStartup } = opts;
	const getResolvedAuth = opts.getResolvedAuth ?? (() => resolvedAuth);
	const loadGatewayConfig = opts.getRuntimeConfig ?? getRuntimeConfig;
	const openAiCompatEnabled = openAiChatCompletionsEnabled || openResponsesEnabled;
	const controlUiRouteBasePath = controlUiBasePath && controlUiBasePath !== "/" ? controlUiBasePath.replace(/\/$/, "") : "";
	const handleServerRequest = (req, res, expectation) => {
		markGatewayIngressTransport(req, opts.ingressTransport ?? { kind: "ordinary" });
		runHttpConnectionRequest(req, () => runWithDiagnosticTraceContext(createDiagnosticTraceContext(), () => handleRequest(req, res, expectation)), res).catch((error) => {
			console.error("[gateway-http] failed to finalize request:", error);
			if (!res.destroyed) res.destroy(error instanceof Error ? error : void 0);
		});
	};
	const httpServer = opts.tlsOptions ? createServer$2(opts.tlsOptions, handleServerRequest) : createServer$1(handleServerRequest);
	httpServer.on("checkContinue", (req, res) => handleServerRequest(req, res, "continue"));
	httpServer.on("checkExpectation", (req, res) => handleServerRequest(req, res, "reject"));
	httpServer.on("connect", (req, socket) => {
		runHttpConnectionRequest(req, async () => {
			socket.destroy();
		}, "upgrade");
	});
	async function handleRequest(req, res, expectation) {
		setDefaultSecurityHeaders(res, { strictTransportSecurity: strictTransportSecurityHeader });
		if (expectation === "reject") {
			res.writeHead(417);
			res.end();
			return;
		}
		if (expectation === "continue") res.writeContinue();
		if (isWebSocketUpgradeRequest(req)) return;
		if (req.headers.upgrade !== void 0) {
			res.statusCode = 400;
			res.setHeader("Connection", "close");
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			res.end("Bad Request");
			return;
		}
		try {
			const requestPath = URL.parse(req.url ?? "/", "http://localhost")?.pathname;
			if (requestPath === void 0) {
				sendGatewayAuthFailure(res, {
					ok: false,
					reason: "unauthorized"
				});
				return;
			}
			if (classifyGatewayProbePath(requestPath) === "live") {
				await handleGatewayProbeRequest(req, res, requestPath, resolvedAuth, [], false, rateLimiter, getReadiness, getStartup);
				return;
			}
			const configSnapshot = loadGatewayConfig();
			const trustedProxies = configSnapshot.gateway?.trustedProxies ?? [];
			const allowRealIpFallback = configSnapshot.gateway?.allowRealIpFallback === true;
			const ingressAttribution = prepareGatewayIngressAttribution({
				req,
				trustedProxies,
				allowRealIpFallback
			});
			const scopedNodeCapability = normalizePluginNodeCapabilityScopedUrl(req.url ?? "/");
			if (scopedNodeCapability.malformedScopedPath) {
				sendGatewayAuthFailure(res, {
					ok: false,
					reason: "unauthorized"
				});
				return;
			}
			if (scopedNodeCapability.rewrittenUrl) req.url = scopedNodeCapability.rewrittenUrl;
			const scopedRequestPath = scopedNodeCapability.pathname;
			const pluginPathContext = resolvePluginRoutePathContext(scopedRequestPath);
			const nodeCapability = resolvePluginNodeCapabilityRoute?.(pluginPathContext);
			if (ingressAttribution.kind === "unattributable-proxy") {
				opts.reportUnattributableProxy?.(ingressAttribution);
				if (!nodeCapability && handlePluginRequest && opts.isPluginAuthenticatedRoute?.(pluginPathContext) && await handlePluginRequest(req, res, pluginPathContext, { gatewayRequestClientIp: ingressAttribution.remoteAddress })) return;
				sendGatewayAuthFailure(res, {
					ok: false,
					reason: ingressAttribution.reason
				});
				return;
			}
			const requestClientIp = ingressAttribution.clientIp;
			const resolvedAuthValue = getResolvedAuth();
			const routeAuth = {
				auth: resolvedAuthValue,
				trustedProxies,
				allowRealIpFallback,
				rateLimiter
			};
			const controlUiRouteOptions = {
				basePath: controlUiBasePath,
				config: configSnapshot,
				...routeAuth
			};
			const handleControlUiRequest = async () => (await getControlUiModule()).handleControlUiHttpRequest(req, res, {
				...controlUiRouteOptions,
				terminalEnabled: opts.isTerminalEnabled?.() ?? isTerminalConfigEnabled(configSnapshot),
				agentId: resolveAssistantAgentId(configSnapshot),
				root: controlUiRoot
			});
			const handleStandaloneControlUiRequest = async () => {
				if (!controlUiEnabled) {
					respondNotFound(res);
					return true;
				}
				if (await handleControlUiRequest()) return true;
				respondNotFound(res);
				return true;
			};
			const requestStages = [() => handleGatewayProbeRequest(req, res, scopedRequestPath, resolvedAuthValue, trustedProxies, allowRealIpFallback, rateLimiter, getReadiness, getStartup)];
			const addRequestStage = (enabled, stage, admitted = false) => {
				if (enabled) requestStages.push(admitted ? () => runWithGatewayHttpWorkAdmission(res, stage) : stage);
			};
			const addAdmittedStage = (enabled, stage) => addRequestStage(enabled, stage, true);
			addRequestStage(classifyWorkerGatewayPath(scopedRequestPath) !== "outside", () => {
				respondNotFound(res);
				return true;
			});
			addAdmittedStage(classifyWorkerBootstrapArtifactTransferPath(scopedRequestPath) !== "outside", () => handleWorkerBootstrapArtifactTransferHttpRequest({
				req,
				res,
				clientIp: ingressAttribution.rateLimit.subject.key,
				rateLimiter: joinRateLimiter,
				callback: opts.handleWorkerBootstrapArtifactTransferRequest
			}));
			addAdmittedStage(classifyNodeWorkerBundleTransferPath(scopedRequestPath) !== "outside", () => handleNodeWorkerBundleTransferHttpRequest({
				req,
				res,
				clientIp: ingressAttribution.rateLimit.subject.key,
				rateLimiter: joinRateLimiter,
				callback: opts.handleNodeWorkerBundleTransferRequest
			}));
			addAdmittedStage(classifyNodeWorkspaceTransferPath(scopedRequestPath) !== "outside", () => handleNodeWorkspaceTransferHttpRequest({
				req,
				res,
				clientIp: ingressAttribution.rateLimit.subject.key,
				rateLimiter: joinRateLimiter,
				callback: opts.handleNodeWorkspaceTransferRequest
			}));
			const devicePairingJoinShortcode = parseDevicePairingJoinRequestPath(scopedRequestPath);
			if (devicePairingJoinShortcode !== null) addAdmittedStage(true, async () => (await getDevicePairingJoinHttpModule()).handleDevicePairingJoinHttpRequest({
				req,
				res,
				shortcode: devicePairingJoinShortcode,
				clientIp: ingressAttribution.rateLimit.subject.key,
				rateLimiter: joinRateLimiter
			}));
			addAdmittedStage(req.method === "GET" && scopedRequestPath === "/oauth/mcp/callback" && Boolean(opts.handleMcpOAuthCallbackRequest), () => opts.handleMcpOAuthCallbackRequest?.(req, res) ?? false);
			addRequestStage(true, () => handleHooksRequest(req, res));
			addAdmittedStage(Boolean(opts.handleWatchNodeRequest) && scopedRequestPath.startsWith("/api/nodes/watch/"), () => opts.handleWatchNodeRequest?.(req, res) ?? false);
			addAdmittedStage(openAiCompatEnabled && (scopedRequestPath === "/v1/models" || scopedRequestPath.startsWith("/v1/models/")), async () => (await getModelsHttpModule()).handleOpenAiModelsHttpRequest(req, res, routeAuth));
			addAdmittedStage(openAiCompatEnabled && scopedRequestPath === "/v1/embeddings", async () => (await getEmbeddingsHttpModule()).handleOpenAiEmbeddingsHttpRequest(req, res, routeAuth));
			addAdmittedStage(scopedRequestPath === "/tools/invoke", async () => (await getToolsInvokeHttpModule()).handleToolsInvokeHttpRequest(req, res, routeAuth));
			addAdmittedStage(/^\/sessions\/[^/]+\/kill$/.test(scopedRequestPath), async () => (await getSessionKillHttpModule()).handleSessionKillHttpRequest(req, res, routeAuth));
			addAdmittedStage(/^\/sessions\/[^/]+\/history$/.test(scopedRequestPath), async () => (await getSessionHistoryHttpModule()).handleSessionHistoryHttpRequest(req, res, {
				...routeAuth,
				getResolvedAuth
			}));
			addAdmittedStage(scopedRequestPath.startsWith("/__openclaw__/board/"), async () => (await getBoardHttpModule()).handleBoardHttpRequest(req, res, { resolveGatewayContext: opts.getGatewayRequestContext?.()?.resolveGatewayContext }));
			addAdmittedStage(parseControlUiUserAvatarPath(scopedRequestPath, controlUiRouteBasePath).matched, async () => (await getUserProfilesHttpModule()).handleUserProfileAvatarHttpRequest(req, res, scopedRequestPath, {
				...routeAuth,
				basePath: controlUiRouteBasePath
			}));
			addAdmittedStage(openResponsesEnabled && scopedRequestPath === "/v1/responses", async () => (await getOpenResponsesHttpModule()).handleOpenResponsesHttpRequest(req, res, {
				...routeAuth,
				config: openResponsesConfig,
				resolveGatewayContext: opts.getGatewayRequestContext?.()?.resolveGatewayContext
			}));
			addAdmittedStage(openAiChatCompletionsEnabled && scopedRequestPath === "/v1/chat/completions", async () => (await getOpenAiHttpModule()).handleOpenAiHttpRequest(req, res, {
				...routeAuth,
				config: openAiChatCompletionsConfig,
				resolveGatewayContext: opts.getGatewayRequestContext?.()?.resolveGatewayContext
			}));
			const approvalDocument = isControlUiApprovalDocumentPath({
				basePath: controlUiBasePath,
				pathname: scopedRequestPath
			});
			const focusDocument = isControlUiFocusDocumentPath({
				basePath: controlUiBasePath,
				pathname: scopedRequestPath
			});
			addRequestStage(approvalDocument, handleStandaloneControlUiRequest);
			addRequestStage(Boolean(nodeCapability), async () => {
				const { authorizePluginNodeCapabilityRequest } = await getPluginNodeCapabilityAuthModule();
				const ok = await authorizePluginNodeCapabilityRequest({
					req,
					auth: resolvedAuthValue,
					trustedProxies,
					allowRealIpFallback,
					clients,
					nodeCapability,
					capability: scopedNodeCapability.capability,
					malformedScopedPath: scopedNodeCapability.malformedScopedPath,
					rateLimiter
				});
				if (!ok.ok) {
					sendGatewayAuthFailure(res, ok);
					return true;
				}
				return false;
			});
			addRequestStage(Boolean(nodeCapability) && isCoreCanvasHostEnabled(configSnapshot) && isCanvasDocumentHttpPath(scopedRequestPath), async () => (await getCanvasServeModule()).handleCanvasDocumentHttpRequest(req, res));
			addRequestStage(controlUiEnabled && isControlUiPluginManagerRequest({
				basePath: controlUiBasePath,
				pathname: scopedRequestPath,
				method: req.method
			}), handleControlUiRequest);
			const mcpAppRoute = classifyMcpAppStandalonePath(scopedRequestPath);
			if (configSnapshot.mcp?.apps?.enabled === true && (mcpAppRoute === "shell" || mcpAppRoute === "view")) requestStages.push(async () => await runWithGatewayHttpWorkAdmission(res, async () => {
				return await (await getMcpAppStandaloneModule()).handleMcpAppStandaloneHttpRequest(req, res, {
					sandboxPort: configSnapshot.mcp?.apps?.sandboxPort,
					sandboxOrigin: configSnapshot.mcp?.apps?.sandboxOrigin
				});
			}));
			if (handlePluginRequest) {
				let pluginGatewayAuthSatisfied = false;
				let pluginGatewayRequestAuth;
				let pluginRequestOperatorScopes;
				requestStages.push(async () => {
					if (!(shouldEnforcePluginGatewayAuth ?? shouldEnforceDefaultPluginGatewayAuth)(pluginPathContext) || (await getCachedPluginGatewayAuthBypassPaths(configSnapshot)).has(scopedRequestPath)) return false;
					const { authorizePluginGatewayHttpRequestOrReply } = await getHttpAuthUtilsModule();
					const { resolvePluginRouteRuntimeOperatorScopes } = await getPluginRouteRuntimeScopesModule();
					const authResult = await authorizePluginGatewayHttpRequestOrReply({
						req,
						res,
						...routeAuth,
						requestPath: scopedRequestPath,
						resolveOperatorScopes: resolvePluginRouteRuntimeOperatorScopes
					});
					if (!authResult) return true;
					pluginGatewayAuthSatisfied = true;
					pluginGatewayRequestAuth = authResult.requestAuth;
					pluginRequestOperatorScopes = authResult.operatorScopes;
					return false;
				}, () => handlePluginRequest(req, res, pluginPathContext, {
					gatewayAuthSatisfied: pluginGatewayAuthSatisfied,
					gatewayRequestAuth: pluginGatewayRequestAuth,
					gatewayRequestOperatorScopes: pluginRequestOperatorScopes,
					gatewayRequestClientIp: requestClientIp
				}));
			}
			addRequestStage(focusDocument, handleStandaloneControlUiRequest);
			addRequestStage(scopedRequestPath.startsWith("/api/chat/media/outgoing/") || controlUiRouteBasePath.length > 0 && scopedRequestPath.startsWith(`${controlUiRouteBasePath}/api/chat/media/outgoing/`), async () => (await getManagedMediaAttachmentsModule()).handleManagedOutgoingMediaHttpRequest(req, res, {
				...routeAuth,
				basePath: controlUiRouteBasePath
			}));
			addRequestStage(controlUiEnabled && [
				"pluginIcon",
				"catalogIcon",
				"linkFavicon"
			].some((route) => parseControlUiResourcePath(route, scopedRequestPath, controlUiRouteBasePath).matched), async () => (await getPluginIconHttpModule()).handlePluginIconHttpRequest(req, res, controlUiRouteOptions));
			addRequestStage(controlUiEnabled && parseControlUiResourcePath("workspaceIcon", scopedRequestPath, controlUiRouteBasePath).matched, async () => (await getWorkspaceIconHttpModule()).handleWorkspaceIconHttpRequest(req, res, controlUiRouteOptions));
			addRequestStage(controlUiEnabled && parseControlUiResourcePath("channelAvatar", scopedRequestPath, controlUiRouteBasePath).matched, async () => (await getChannelAvatarHttpModule()).handleChannelAvatarHttpRequest(req, res, controlUiRouteOptions));
			addRequestStage(controlUiEnabled, async () => (await getControlUiModule()).handleControlUiAssistantMediaRequest(req, res, {
				...controlUiRouteOptions,
				agentId: resolveAssistantAgentId(configSnapshot)
			}));
			addRequestStage(controlUiEnabled, async () => (await getControlUiModule()).handleControlUiAvatarRequest(req, res, controlUiRouteOptions));
			addRequestStage(controlUiEnabled, handleControlUiRequest);
			for (const stage of requestStages) if (await stage() || res.destroyed || res.writableEnded) return;
			if (opts.isStartupPluginRuntimeReady?.() === false) {
				res.setHeader("Cache-Control", "no-store");
				res.setHeader("Retry-After", "1");
				respondPlainText(res, 503, "Plugin runtime is starting");
				return;
			}
			respondNotFound(res);
		} catch (err) {
			console.error("[gateway-http] unhandled error in request handler:", err);
			finishFailedGatewayHttpResponse(res);
		}
	}
	return httpServer;
}
//#endregion
//#region src/gateway/server/preauth-connection-budget.ts
const DEFAULT_MAX_PREAUTH_CONNECTIONS_PER_IP = 32;
const UNKNOWN_CLIENT_IP_BUDGET_KEY = "__openclaw_unknown_client_ip__";
function getMaxPreauthConnectionsPerIpFromEnv(env = process.env) {
	const configured = env.OPENCLAW_MAX_PREAUTH_CONNECTIONS_PER_IP || (isVitestRuntimeEnv(env) ? env.OPENCLAW_TEST_MAX_PREAUTH_CONNECTIONS_PER_IP : void 0);
	if (!configured) return DEFAULT_MAX_PREAUTH_CONNECTIONS_PER_IP;
	const parsed = parseStrictPositiveInteger(configured);
	if (parsed === void 0) return DEFAULT_MAX_PREAUTH_CONNECTIONS_PER_IP;
	return parsed;
}
function createPreauthConnectionBudget(limit = getMaxPreauthConnectionsPerIpFromEnv()) {
	const maxConnectionsPerIp = resolveIntegerOption(limit, getMaxPreauthConnectionsPerIpFromEnv(), { min: 1 });
	const counts = /* @__PURE__ */ new Map();
	const normalizeBudgetKey = (clientIp) => {
		return clientIp?.trim() || UNKNOWN_CLIENT_IP_BUDGET_KEY;
	};
	return {
		acquire(clientIp) {
			const ip = normalizeBudgetKey(clientIp);
			const next = (counts.get(ip) ?? 0) + 1;
			if (next > maxConnectionsPerIp) return false;
			counts.set(ip, next);
			return true;
		},
		release(clientIp) {
			const ip = normalizeBudgetKey(clientIp);
			const current = counts.get(ip);
			if (current === void 0) return;
			if (current <= 1) {
				counts.delete(ip);
				return;
			}
			counts.set(ip, current - 1);
		}
	};
}
//#endregion
//#region src/gateway/server-runtime-state.ts
const require = createRequire(import.meta.url);
const { WebSocketServer: NpmWebSocketServer } = require(path.join(path.dirname(require.resolve("ws/package.json")), "index.js"));
const loadGatewayPluginsHttpModule = async () => await import("./plugins-http-aNik4RkL.js");
function hasMatchingGatewayPluginRoute(registry, pathContext, requiresUpgrade) {
	if (!pathContext) return (registry.httpRoutes ?? []).length > 0;
	const matchingRoutes = findMatchingPluginHttpRoutes(registry, pathContext);
	return requiresUpgrade ? matchingRoutes.some((route) => typeof route.handleUpgrade === "function") : matchingRoutes.length > 0;
}
/** Creates the HTTP/WebSocket transport for one gateway start. */
async function createGatewayHttpTransport(params) {
	const loadRuntimeConfig = params.getRuntimeConfig ?? (() => params.cfg);
	const resolvePluginRouteRegistry = () => params.getPluginRouteRegistry?.() ?? params.pluginRegistry;
	let loadedHooksRequestHandler = null;
	let loadedHookDispatcher;
	const getHookDispatcher = async () => {
		const { createGatewayHookDispatcher } = await import("./hooks-Rlx-tmpP.js");
		return loadedHookDispatcher ??= createGatewayHookDispatcher({
			deps: params.deps,
			logHooks: params.logHooks,
			...params.getGatewayRequestContext ? { resolveGatewayContext: params.getGatewayRequestContext } : {}
		});
	};
	const handleHooksRequest = async (req, res) => {
		const hooksConfig = params.hooksConfig();
		if (!hooksConfig) return false;
		const url = new URL(req.url ?? "/", "http://localhost");
		const basePath = hooksConfig.basePath;
		if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return false;
		return await runWithGatewayHttpWorkAdmission(res, async () => {
			if (!loadedHooksRequestHandler) {
				const { createGatewayHooksRequestHandler } = await import("./hooks-Rlx-tmpP.js");
				loadedHooksRequestHandler = createGatewayHooksRequestHandler({
					deps: params.deps,
					dispatcher: await getHookDispatcher(),
					getHooksConfig: params.hooksConfig,
					getClientIpConfig: params.getHookClientIpConfig,
					bindHost: params.bindHost,
					port: params.port,
					logHooks: params.logHooks,
					...params.getGatewayRequestContext ? { resolveGatewayContext: params.getGatewayRequestContext } : {}
				});
			}
			return await loadedHooksRequestHandler(req, res);
		});
	};
	const handleMcpOAuthCallbackRequest = async (req, res) => {
		const { handleMcpOAuthCallback } = await import("./mcp-oauth-callback-Cvr53et3.js");
		return await handleMcpOAuthCallback(req, res, {
			config: loadRuntimeConfig(),
			log: params.log
		});
	};
	let loadedPluginRequestHandler = null;
	let loadedPluginUpgradeHandler = null;
	const handlePluginRequest = async (req, res, pathContext, dispatchContext) => {
		if (loadedPluginRequestHandler) return await loadedPluginRequestHandler(req, res, pathContext, dispatchContext);
		if (!hasMatchingGatewayPluginRoute(resolvePluginRouteRegistry(), pathContext, false)) return false;
		const { createGatewayPluginRequestHandler } = await loadGatewayPluginsHttpModule();
		loadedPluginRequestHandler = createGatewayPluginRequestHandler({
			registry: params.pluginRegistry,
			getRouteRegistry: resolvePluginRouteRegistry,
			log: params.logPlugins,
			getGatewayRequestContext: params.getGatewayRequestContext
		});
		return await loadedPluginRequestHandler(req, res, pathContext, dispatchContext);
	};
	const handlePluginUpgrade = async (req, socket, head, pathContext, dispatchContext) => {
		if (loadedPluginUpgradeHandler) return await loadedPluginUpgradeHandler(req, socket, head, pathContext, dispatchContext);
		if (!hasMatchingGatewayPluginRoute(resolvePluginRouteRegistry(), pathContext, true)) return false;
		const { createGatewayPluginUpgradeHandler } = await loadGatewayPluginsHttpModule();
		loadedPluginUpgradeHandler = createGatewayPluginUpgradeHandler({
			registry: params.pluginRegistry,
			getRouteRegistry: resolvePluginRouteRegistry,
			log: params.logPlugins,
			getGatewayRequestContext: params.getGatewayRequestContext
		});
		return await loadedPluginUpgradeHandler(req, socket, head, pathContext, dispatchContext);
	};
	const shouldEnforcePluginGatewayAuth = (pathContext) => {
		return shouldEnforceGatewayAuthForPluginPath(resolvePluginRouteRegistry(), pathContext);
	};
	const isPluginAuthenticatedRoute = (pathContext) => {
		return isPluginAuthenticatedRoutePath(resolvePluginRouteRegistry(), pathContext);
	};
	const resolvePluginNodeCapabilityRoute = (pathContext) => {
		const coreCanvasCapability = isCoreCanvasHostEnabled(loadRuntimeConfig()) ? resolveCanvasNodeCapability(pathContext.candidates) : void 0;
		if (coreCanvasCapability) return coreCanvasCapability;
		return findMatchingPluginNodeCapabilityRoute(resolvePluginRouteRegistry(), pathContext)?.nodeCapability;
	};
	const managedTailscaleMode = params.tailscaleMode && params.tailscaleMode !== "off" ? params.tailscaleMode : void 0;
	const bindHosts = await resolveGatewayListenHosts(params.bindHost);
	if (!isLoopbackHost(params.bindHost)) params.log.warn("⚠️  Gateway is binding to a non-loopback address. Ensure authentication is configured before exposing to public networks.");
	if (params.cfg.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true) params.log.warn("⚠️  gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true is enabled. Host-header origin fallback weakens origin checks and should only be used as break-glass.");
	const wss = new NpmWebSocketServer({
		noServer: true,
		maxPayload: MAX_PREAUTH_PAYLOAD_BYTES,
		allowSynchronousEvents: false
	});
	const preauthConnectionBudget = createPreauthConnectionBudget();
	const httpServers = [];
	const gatewayHttpServers = [];
	const httpBindHosts = [];
	const portalService = createGatewayPortalService({
		httpBindHosts,
		httpServers,
		...params.gatewayTls?.enabled ? { tlsOptions: params.gatewayTls.tlsOptions } : {}
	});
	const reportUnattributableProxy = createGatewayUnattributableProxyReporter(params.log);
	const createGatewayListener = (ingressTransport, tlsOptions) => {
		const httpServer = createGatewayHttpServer({
			clients: params.clients,
			controlUiEnabled: params.controlUiEnabled,
			controlUiBasePath: params.controlUiBasePath,
			controlUiRoot: params.controlUiRoot,
			openAiChatCompletionsEnabled: params.openAiChatCompletionsEnabled,
			openAiChatCompletionsConfig: params.openAiChatCompletionsConfig,
			openResponsesEnabled: params.openResponsesEnabled,
			openResponsesConfig: params.openResponsesConfig,
			strictTransportSecurityHeader: params.strictTransportSecurityHeader,
			handleWatchNodeRequest: params.handleWatchNodeRequest,
			handleHooksRequest,
			handleMcpOAuthCallbackRequest,
			handlePluginRequest,
			shouldEnforcePluginGatewayAuth,
			isPluginAuthenticatedRoute,
			resolvePluginNodeCapabilityRoute,
			resolvedAuth: params.resolvedAuth,
			getResolvedAuth: params.getResolvedAuth,
			rateLimiter: params.rateLimiter,
			joinRateLimiter: params.joinRateLimiter,
			handleNodeWorkerBundleTransferRequest: params.handleNodeWorkerBundleTransferRequest,
			handleWorkerBootstrapArtifactTransferRequest: params.handleWorkerBootstrapArtifactTransferRequest,
			handleNodeWorkspaceTransferRequest: params.handleNodeWorkspaceTransferRequest,
			getReadiness: params.getReadiness,
			getStartup: params.getStartup,
			getRuntimeConfig: loadRuntimeConfig,
			getGatewayRequestContext: params.getGatewayRequestContext,
			isStartupPluginRuntimeReady: params.isStartupPluginRuntimeReady,
			isTerminalEnabled: params.isTerminalEnabled,
			tlsOptions,
			ingressTransport,
			reportUnattributableProxy
		});
		attachGatewayUpgradeHandler({
			httpServer,
			wss,
			handlePluginUpgrade,
			shouldEnforcePluginGatewayAuth,
			isPluginAuthenticatedRoute,
			resolvePluginNodeCapabilityRoute,
			clients: params.clients,
			preauthConnectionBudget,
			resolvedAuth: params.resolvedAuth,
			getResolvedAuth: params.getResolvedAuth,
			rateLimiter: params.rateLimiter,
			publicRateLimiter: params.joinRateLimiter,
			workerIngressEnabled: params.workerIngressEnabled,
			log: params.log,
			desktopSessionRegistry: params.desktopSessionRegistry,
			nodeDesktopStreamBroker: params.nodeDesktopStreamBroker,
			getGatewayRequestContext: params.getGatewayRequestContext,
			isStartupPending: params.isStartupPending,
			ingressTransport,
			reportUnattributableProxy
		});
		return httpServer;
	};
	for (const _ of bindHosts) {
		const httpServer = createGatewayListener({ kind: "ordinary" }, params.gatewayTls?.enabled ? params.gatewayTls.tlsOptions : void 0);
		gatewayHttpServers.push(httpServer);
		httpServers.push(httpServer);
	}
	const tailscaleHttpServer = managedTailscaleMode ? createGatewayListener({
		kind: "managed-tailscale",
		mode: managedTailscaleMode
	}, void 0) : void 0;
	if (tailscaleHttpServer) httpServers.push(tailscaleHttpServer);
	let tailscaleIngressEndpoint;
	const httpServer = gatewayHttpServers[0];
	if (!httpServer) throw new Error("Gateway HTTP server failed to start");
	let mcpAppSandboxPort;
	let sandboxHostStartPromise = null;
	let startListeningPromise = null;
	let startListeningComplete = false;
	const startSandboxHost = async () => {
		if (sandboxHostStartPromise) return await sandboxHostStartPromise;
		sandboxHostStartPromise = (async () => {
			if (httpBindHosts.length === 0) throw new Error("Gateway listener must start before the sandbox host");
			const sandboxPort = resolveSandboxHostPort(params.port, params.cfg.mcp?.apps?.sandboxPort);
			const sandboxServers = bindHosts.map(() => createSandboxHostHttpServer(params.gatewayTls?.enabled ? params.gatewayTls.tlsOptions : void 0));
			httpServers.push(...sandboxServers);
			try {
				for (const host of httpBindHosts) {
					const server = sandboxServers[bindHosts.indexOf(host)];
					if (!server) throw new Error(`Missing sandbox host HTTP server for bind host ${host}`);
					await listenGatewayHttpServer({
						httpServer: server,
						bindHost: host,
						port: sandboxPort,
						retryEaddrinuse: false,
						serviceName: "MCP App sandbox",
						endpointScheme: params.gatewayTls?.enabled ? "https" : "http"
					});
				}
			} catch (error) {
				await Promise.all(sandboxServers.map((server) => new Promise((resolve) => {
					if (!server.listening) {
						resolve();
						return;
					}
					server.close(() => resolve());
				})));
				for (const server of sandboxServers) {
					const index = httpServers.indexOf(server);
					if (index >= 0) httpServers.splice(index, 1);
				}
				throw error;
			}
			mcpAppSandboxPort = sandboxPort;
			return sandboxPort;
		})();
		const startAttempt = sandboxHostStartPromise;
		startAttempt.catch(() => {
			if (sandboxHostStartPromise === startAttempt) sandboxHostStartPromise = null;
		});
		return await startAttempt;
	};
	const ensureSandboxHostPort = async () => {
		if (!startListeningComplete) {
			if (!startListeningPromise) throw new Error("Gateway listener must start before the sandbox host");
			await startListeningPromise;
		}
		return await startSandboxHost();
	};
	const startListening = async () => {
		if (startListeningPromise) {
			await startListeningPromise;
			return;
		}
		startListeningPromise = (async () => {
			if (tailscaleHttpServer) {
				await listenGatewayHttpServer({
					httpServer: tailscaleHttpServer,
					bindHost: "127.0.0.1",
					port: 0,
					retryEaddrinuse: false,
					serviceName: "Tailscale gateway ingress"
				});
				const address = tailscaleHttpServer.address();
				if (!address || typeof address === "string") throw new Error("Tailscale gateway ingress failed to resolve its loopback port");
				tailscaleIngressEndpoint = {
					host: "127.0.0.1",
					port: address.port
				};
				await params.prepareManagedTailscaleIngress?.(tailscaleIngressEndpoint);
			}
			const requiredAlias = params.bindHost !== "127.0.0.1" && bindHosts.includes("127.0.0.1") ? "127.0.0.1" : void 0;
			const listenOrder = requiredAlias ? [requiredAlias, ...bindHosts.filter((host) => host !== requiredAlias)] : bindHosts;
			const boundHosts = /* @__PURE__ */ new Set();
			for (const host of listenOrder) {
				const index = bindHosts.indexOf(host);
				const server = gatewayHttpServers[index];
				if (!server) throw new Error(`Missing gateway HTTP server for bind host ${host}`);
				const requiredLoopbackAlias = host === requiredAlias;
				try {
					await listenGatewayHttpServer({
						httpServer: server,
						bindHost: host,
						port: params.port,
						retryEaddrinuse: !requiredLoopbackAlias
					});
					boundHosts.add(host);
				} catch (err) {
					if (host === bindHosts[0] || requiredLoopbackAlias) throw err;
					params.log.warn(`gateway: failed to bind loopback alias ${host}:${params.port} (${String(err)})`);
				}
			}
			httpBindHosts.push(...bindHosts.filter((host) => boundHosts.has(host)));
			if (httpBindHosts.length === 0) throw new Error("Gateway HTTP server failed to start");
			if (params.cfg.mcp?.apps?.enabled === true) await startSandboxHost();
			startListeningComplete = true;
		})();
		await startListeningPromise;
	};
	return {
		httpServer,
		httpServers,
		httpBindHosts,
		startListening,
		wss,
		preauthConnectionBudget,
		portalService,
		getTailscaleIngressEndpoint: () => tailscaleIngressEndpoint,
		getMcpAppSandboxPort: () => mcpAppSandboxPort,
		ensureSandboxHostPort,
		dispatchHookAgentTurn: async (pluginId, hookParams) => await (await getHookDispatcher()).dispatchHookAgentTurn(hookParams, pluginId)
	};
}
//#endregion
//#region src/gateway/server-startup-finish.ts
const [POST_READY_MAINTENANCE_DELAY_MS, RETAINED_PLUGIN_CLEANUP_DELAY_MS] = [250, 3e4];
async function finishGatewayStartup(params) {
	const { kernelRuntime: runtime, port, bootId, opts, log, logHealth, logWsControl, logHooks, logChannels, logCron, logReload, loadGatewayStartupPostAttachModule } = params;
	const { minimalTestGateway, deps, runtimeState, kernel, startupTrace, broadcast, broadcastToConnIds, clients, sharedGatewaySessionGenerationState, workerEnvironmentService, workerPlacementRuntime, terminalLaunchPolicy, terminalSessions, startChannel, stopChannel, getAttachedGatewayMethodRegistry, lifecycle, startupState, pluginRuntime, resolvePluginGatewayContext, gatewayTls, bindHost, getResolvedAuth, authRateLimiter, browserAuthRateLimiter, nodeReapprovalCoordinator, preauthHandshakeTimeoutMs, isGatewayStartupPending, attachedGatewayExtraHandlers, startListening, loadStartupPluginsModule, gatewayPluginConfigAtStart, startupActivationSourceConfig, defaultWorkspaceDir, coreGatewayMethodNames, pluginHostServices, baseMethods, startupPluginIds, pluginManifestRecords, pluginMetadataSnapshot, pluginLookUpTable, ambientEnvTriggers, replaceAttachedPluginRuntime, refreshAttachedGatewayDiscovery, wss, httpBindHosts, startChannels, broadcastPluginEvent, controlUiBasePath, controlUiRootLifecycle, sidecarStartup, workerLiveEvents, startEarlyRuntime, cfgAtStart, preauthConnectionBudget, releaseStartupAccountStarts, cronReconciliation, postReadyState, cronStartState, prepareReloadCandidate, startupLastGoodSnapshot, startupInternalWriteHash, configSnapshot, channelManager, activateRuntimeSecrets, applyFixedGatewayOverlays, resolveSharedGatewaySessionGenerationForConfig, stopRegisteredGatewayLifetimeSidecars, stopRegisteredPostReadySidecars, registerPostReadySidecars, registerGatewayLifetimeSidecars, chatMetadataLifecycle, gatewayRequestContext, gatewayInstanceRuntime, getPluginMetadataSnapshot } = runtime;
	const startupPluginRuntimeClaim = kernel.pluginRuntimeGeneration.currentClaim();
	const unregisterGatewayLifetimeSidecar = (sidecar) => {
		kernel.setGatewayLifetimeSidecars(runtimeState.gatewayLifetimeSidecars.filter((registered) => registered !== sidecar));
	};
	const [{ attachGatewayWsHandlers }, { listPluginNodeCapabilities }] = await startupTrace.measure("gateway.ws-imports", () => Promise.all([import("./server-ws-runtime-BJcMZyBf.js"), import("./route-capability-CJrfecGn.js")]));
	await startupTrace.measure("gateway.ws-attach", () => attachGatewayWsHandlers({
		wss,
		clients,
		bootId,
		preauthConnectionBudget,
		port,
		gatewayHost: bindHost ?? void 0,
		pluginSurfaceScheme: gatewayTls.enabled ? "https" : "http",
		getPluginNodeCapabilities: () => withCoreCanvasNodeCapability(listPluginNodeCapabilities(pluginRuntime.registry), isCoreCanvasHostEnabled(getRuntimeConfig())),
		getResolvedAuth,
		getRequiredSharedGatewaySessionGeneration: () => getRequiredSharedGatewaySessionGeneration(sharedGatewaySessionGenerationState),
		rateLimiter: authRateLimiter,
		browserRateLimiter: browserAuthRateLimiter,
		nodeReapprovalCoordinator,
		preauthHandshakeTimeoutMs,
		isStartupPending: isGatewayStartupPending,
		isPendingWorkerNodeSetup: workerEnvironmentService?.hasPendingNodeEnrollmentSetup,
		gatewayMethods: runtimeState.gatewayMethods,
		events: GATEWAY_EVENTS,
		logGateway: log,
		logHealth,
		logWsControl,
		extraHandlers: attachedGatewayExtraHandlers,
		getMethodRegistry: () => getAttachedGatewayMethodRegistry(),
		...workerEnvironmentService ? { workerConnectionService: workerEnvironmentService } : {},
		broadcast,
		context: gatewayRequestContext
	}));
	await startupTrace.measure("http.listen", () => startListening());
	kernel.setDispatchReady(true);
	startupTrace.mark("http.bound");
	const earlyRuntime = await startEarlyRuntime();
	const sessionDeliveryRecoveryMaxEnqueuedAt = Date.now();
	let postAttachRuntimeReturned = false;
	let scheduledServicesActivated = false;
	const loadScheduledServicesModule = createLazyPromise(() => import("./server-runtime-services-D4hu0F0F.js"), { cacheRejections: true });
	const activateScheduledServicesWhenReady = () => {
		if (lifecycle.closePreludeStarted || !postAttachRuntimeReturned || !startupState.sidecarsReady || scheduledServicesActivated) return;
		scheduledServicesActivated = true;
		loadScheduledServicesModule().then((gatewayRuntimeServices) => {
			if (lifecycle.closePreludeStarted) return;
			const activated = gatewayRuntimeServices.activateGatewayScheduledServices({
				minimalTestGateway,
				cfgAtStart,
				deps,
				sessionDeliveryRecoveryMaxEnqueuedAt,
				cronState: runtimeState.cronState,
				cronReconciliation,
				startCron: false,
				logCron,
				log,
				resolveGatewayContext: resolvePluginGatewayContext
			});
			kernel.setScheduledServiceHandles(activated);
		});
	};
	const { createGatewayServerActiveWorkInspectors } = await startupTrace.measure("gateway.active-work-import", () => import("./server-active-work-BjMdpZVY.js"));
	const activeWorkInspectors = createGatewayServerActiveWorkInspectors(gatewayRequestContext);
	const postAttachHandles = await startupTrace.measure("runtime.post-attach", () => loadGatewayStartupPostAttachModule().then(({ startGatewayPostAttachRuntime }) => startGatewayPostAttachRuntime({
		minimalTestGateway,
		cfgAtStart,
		getConfig: getRuntimeConfig,
		bindHost,
		bindHosts: httpBindHosts,
		port,
		tlsEnabled: gatewayTls.enabled,
		log,
		isNixMode,
		startupStartedAt: opts.startupStartedAt,
		broadcastToConnIds,
		getClientConnIds: gatewayRequestContext.getClientConnIds,
		broadcastPluginEvent,
		controlUiBasePath,
		controlUiRootLifecycle,
		gatewayPluginConfigAtStart,
		activationSourceConfig: startupActivationSourceConfig,
		pluginManifestRecords,
		...pluginMetadataSnapshot ? { pluginMetadataSnapshot } : {},
		pluginRuntimeClaim: startupPluginRuntimeClaim,
		getCurrentPluginRegistry: () => pluginRuntime.registry,
		getCurrentPluginMetadataSnapshot: getPluginMetadataSnapshot,
		ambientEnvTriggers,
		pluginRegistry: pluginRuntime.registry,
		defaultWorkspaceDir,
		deps,
		startChannels,
		recoveryRuntime: gatewayInstanceRuntime.recovery,
		resolveGatewayContext: gatewayRequestContext.resolveGatewayContext,
		logHooks,
		logChannels,
		unlockStartupMethods: kernel.unlockStartupMethods,
		refreshChatMetadata: chatMetadataLifecycle.refresh,
		loadStartupPlugins: async () => {
			const { loadGatewayStartupPluginRuntime } = await loadStartupPluginsModule();
			return loadGatewayStartupPluginRuntime({
				cfg: gatewayPluginConfigAtStart,
				activationSourceConfig: startupActivationSourceConfig,
				workspaceDir: runtime.pluginWorkspaceDir,
				log,
				baseMethods,
				coreGatewayMethodNames,
				hostServices: pluginHostServices,
				startupPluginIds,
				pluginLookUpTable,
				startupTrace,
				ambientEnvTriggers,
				resolveGatewayContext: resolvePluginGatewayContext,
				pluginRuntimeClaim: startupPluginRuntimeClaim,
				getCurrentPluginRegistry: () => pluginRuntime.registry
			});
		},
		onStartupPluginsLoading: () => {
			startupState.pendingReason = "startup-sidecars";
		},
		onStartupPluginsLoaded: async (loaded) => {
			if (!startupPluginRuntimeClaim.publish(() => replaceAttachedPluginRuntime(loaded))) {
				loaded.retireGatewayRuntimeBindings?.();
				return;
			}
			startupState.pendingReason = "startup-sidecars";
			await refreshAttachedGatewayDiscovery(loaded.pluginRegistry, startupPluginRuntimeClaim);
		},
		getCronService: () => runtimeState?.cronState.cron,
		onChannelsStarted: () => {
			releaseStartupAccountStarts();
		},
		onPluginServices: (pluginServices) => {
			kernel.pluginRuntimeGeneration.publishServices(startupPluginRuntimeClaim, pluginServices);
		},
		onPostReadySidecars: registerPostReadySidecars,
		onGatewayLifetimeSidecars: registerGatewayLifetimeSidecars,
		stopRegisteredPostReadySidecars,
		stopRegisteredGatewayLifetimeSidecars,
		unregisterGatewayLifetimeSidecar,
		...workerPlacementRuntime ? { startWorkerEnvironmentRuntime: async () => {
			if (lifecycle.closePreludeStarted) return null;
			return await workerPlacementRuntime.startRuntime({
				isClosePreludeStarted: () => lifecycle.closePreludeStarted,
				registerSidecar: (sidecar) => {
					registerGatewayLifetimeSidecars([sidecar]);
				},
				unregisterSidecar: unregisterGatewayLifetimeSidecar
			});
		} } : {},
		onSidecarsReady: () => {
			kernel.markSidecarsReady();
			activateScheduledServicesWhenReady();
		},
		isClosing: () => lifecycle.closePreludeStarted,
		startupTrace,
		sidecarStartup,
		waitForPostReadyWork: params.waitForPostReadyWork,
		activeWorkInspectors,
		providerAuthPrewarm: { getConfig: getRuntimeConfig }
	})));
	kernel.setPostAttachHandles(postAttachHandles, startupPluginRuntimeClaim);
	startupTrace.detail("memory.ready", collectGatewayProcessMemoryUsageMb());
	startupTrace.mark("ready");
	if (sidecarStartup === "defer") log.info("gateway ready");
	finishGatewayRestartTrace("restart.ready", collectGatewayProcessMemoryUsageMb());
	if (!minimalTestGateway) {
		const { startOpenClawDatabaseIntegrityVerifier } = await import("./openclaw-database-verify-a3Yme38Y.js");
		kernel.addGatewayLifetimeSidecar(startOpenClawDatabaseIntegrityVerifier({ env: process.env }));
	}
	postAttachRuntimeReturned = true;
	activateScheduledServicesWhenReady();
	const { startManagedGatewayConfigReloader } = await import("./server-reload-handlers-DblQx0j4.js");
	const configReloaderParams = {
		configRevisionProjector: gatewayRequestContext.configRevisionProjector,
		resolveGatewayContext: resolvePluginGatewayContext,
		minimalTestGateway,
		initialConfig: cfgAtStart,
		initialCompareConfig: startupLastGoodSnapshot.sourceConfig,
		initialSnapshotRawHash: startupLastGoodSnapshot.exists ? startupLastGoodSnapshot.hash ?? null : null,
		initialAuthoredConfig: startupLastGoodSnapshot.parsed,
		initialIncludedPaths: startupLastGoodSnapshot.includedPaths ?? [],
		initialSnapshotValid: startupLastGoodSnapshot.valid,
		initialSnapshotIssues: startupLastGoodSnapshot.issues,
		initialInternalWriteHash: startupInternalWriteHash,
		watchPath: configSnapshot.path,
		readSnapshot: readConfigFileSnapshotForRuntimeTransaction,
		promoteSnapshot: promoteConfigSnapshotToLastKnownGood,
		subscribeToWrites: (listener) => registerConfigWriteListener(listener, {
			ownsRuntimeActivationFor: configSnapshot.path,
			preCommitRuntimePreflight: async (sourceConfig, runtimeRefresh) => {
				const candidate = prepareReloadCandidate({
					runtimeConfig: sourceConfig,
					sourceConfig
				});
				await activateRuntimeSecrets(candidate.runtimeConfig, {
					reason: "reload",
					activate: false,
					env: candidate.runtimeEnv.env,
					includeAuthStoreRefs: runtimeRefresh?.includeAuthStoreRefs
				});
				return candidate;
			}
		}),
		deps,
		broadcast,
		getState: kernel.getReloadState,
		setState: (nextState) => {
			kernel.setReloadHookState(nextState);
			kernel.swapHeartbeatRunner(nextState.heartbeatRunner);
			const previousCronState = kernel.swapCronState(nextState.cronState);
			kernel.setChannelHealthMonitor(nextState.channelHealthMonitor);
			if (previousCronState !== nextState.cronState) cronStartState.handled = true;
		},
		getPluginMetadataSnapshot,
		startChannel,
		stopChannel,
		getChannelAutostartSuppression: channelManager.getAutostartSuppression,
		stopPostReadySidecars: stopRegisteredPostReadySidecars,
		reloadPlugins: kernel.reloadPlugins,
		logHooks,
		logChannels,
		logCron,
		logReload,
		cronReconciliation,
		onCronRestart: () => {
			cronStartState.handled = true;
		},
		prepareTerminalConfig: (plan, nextConfig) => {
			terminalLaunchPolicy.prepareConfig(nextConfig, { restartPending: plan.restartGateway });
		},
		reconcileTerminalSessions: () => {
			terminalSessions.closeDisallowedAgents((agentId) => terminalLaunchPolicy.resolve(agentId).ok);
		},
		commitTerminalConfig: (nextConfig) => {
			terminalLaunchPolicy.commitConfig();
			workerLiveEvents?.rebindAll(nextConfig);
		},
		acceptTerminalConfig: terminalLaunchPolicy.acceptConfig,
		channelManager,
		activateRuntimeSecrets,
		prepareConfigCandidate: prepareReloadCandidate,
		applyRuntimeConfigOverrides: applyFixedGatewayOverlays,
		resolveSharedGatewaySessionGenerationForConfig,
		sharedGatewaySessionGenerationState,
		clients,
		...opts.hotReloadRecovery ? { requestRecoveryRestart: opts.hotReloadRecovery } : {},
		restartRecoveryAvailable: opts.hotReloadRecovery !== void 0
	};
	kernel.setConfigReloaderHandle(startManagedGatewayConfigReloader(configReloaderParams));
	await promoteConfigSnapshotToLastKnownGood(startupLastGoodSnapshot).catch((err) => {
		log.warn(`gateway: failed to promote config last-known-good backup: ${String(err)}`);
	});
	if (!minimalTestGateway) {
		const gatewayRuntimeServices = await loadScheduledServicesModule();
		postReadyState.maintenanceTimer = gatewayRuntimeServices.scheduleGatewayPostReadyMaintenance({
			delayMs: POST_READY_MAINTENANCE_DELAY_MS,
			isClosing: () => lifecycle.closePreludeStarted,
			onStarted: () => {
				postReadyState.maintenanceTimer = null;
			},
			startMaintenance: async () => {
				if (lifecycle.closePreludeStarted) return null;
				return earlyRuntime.startMaintenance(activeWorkInspectors);
			},
			applyMaintenance: async (maintenance) => {
				if (lifecycle.closePreludeStarted) {
					await gatewayRuntimeServices.clearGatewayMaintenanceHandles(maintenance);
					return;
				}
				kernel.setMaintenanceHandles(maintenance);
				maintenance.startMediaCleanup();
			},
			shouldStartCron: () => !lifecycle.closePreludeStarted && !cronStartState.handled,
			markCronStartHandled: () => {
				cronStartState.handled = true;
			},
			cronState: runtimeState.cronState,
			cronReconciliation,
			cronConfig: cfgAtStart,
			logCron,
			log,
			recordPostReadyMemory: () => {
				startupTrace.detail("memory.post-ready", collectGatewayProcessMemoryUsageMb());
			}
		});
		const startupInstallPaths = [...Object.values(pluginMetadataSnapshot?.index.installRecords ?? {}).flatMap((record) => record.installPath ? [record.installPath] : []), ...pluginMetadataSnapshot?.plugins.flatMap((record) => record.setupSource ? [
			record.rootDir,
			record.source,
			record.setupSource
		] : [record.rootDir, record.source]) ?? []];
		postReadyState.retainedPluginCleanupHandle = gatewayRuntimeServices.scheduleGatewayIdleTask({
			delayMs: RETAINED_PLUGIN_CLEANUP_DELAY_MS,
			retryDelayMs: RETAINED_PLUGIN_CLEANUP_DELAY_MS,
			isClosing: () => lifecycle.closePreludeStarted,
			isBusy: () => getActiveGatewayRootWorkCount({ excludeCurrent: true }) > 0,
			run: async () => {
				const { cleanupRetainedPluginInstallGenerations } = await import("./server-retained-plugin-cleanup-MxCj01-C.js");
				await cleanupRetainedPluginInstallGenerations({
					log,
					startupInstallPaths
				});
			},
			log,
			errorMessage: "retained npm generation cleanup failed"
		});
	} else startupTrace.detail("memory.post-ready", collectGatewayProcessMemoryUsageMb());
	return { startupSettled: postAttachHandles.startupSettled };
}
//#endregion
//#region src/gateway/server-start.ts
const loadGatewayStartupPostAttachModule = createLazyRuntimeModule(() => import("./server-startup-post-attach-BPE6Pv6n.js"));
const { log, logTailscale, logChannels, logHealth, logCron, logReload, logHooks, logWsControl } = gatewayKernelLogs;
const POST_READY_WORK_START_DELAY_MS = 500;
async function startGatewayServerCore(port = 18789, opts = {}) {
	const suppliedBootId = opts.bootId;
	if (suppliedBootId !== void 0 && (suppliedBootId.trim() !== suppliedBootId || !suppliedBootId || suppliedBootId.length > 96)) throw new Error("Gateway boot ID must contain 1 to 96 characters");
	const bootId = suppliedBootId ?? randomUUID();
	let releasePostReadyWork = () => {};
	const postReadyWorkBarrier = new Promise((resolve) => {
		releasePostReadyWork = resolve;
	});
	const gatewayKernel = await createGatewayKernel(port, opts, { deferEarlyRuntime: true });
	if (!gatewayKernel.minimalTestGateway) beginMacOSSystemCaWarmupOnce({ log });
	let startupSettled;
	const { beginClosePrelude, closeOnStartupFailure, createCloseHandler, sealAndJoinRegisteredSidecarStops, runClosePrelude, stopRegisteredGatewayLifetimeSidecars, stopRegisteredPostReadySidecars, terminalSessions, shutdownRuntime } = gatewayKernel;
	try {
		const transport = await createGatewayHttpTransport({
			...gatewayKernel.createHttpTransportOptions(),
			...!gatewayKernel.minimalTestGateway && gatewayKernel.tailscaleMode !== "off" ? { prepareManagedTailscaleIngress: async (backend) => {
				const { startGatewayTailscaleExposure } = await import("./server-tailscale-CBDwVfoU.js");
				const cleanup = await startGatewayTailscaleExposure({
					tailscaleMode: gatewayKernel.tailscaleMode,
					preserveFunnel: gatewayKernel.tailscaleConfig.preserveFunnel ?? false,
					port,
					backend,
					controlUiBasePath: gatewayKernel.controlUiBasePath,
					logTailscale
				});
				gatewayKernel.kernel.setTailscaleCleanup(cleanup);
			} } : {}
		});
		gatewayKernel.transportBridge.attach(transport);
		startupSettled = (await finishGatewayStartup({
			kernelRuntime: {
				...gatewayKernel,
				...transport
			},
			port,
			opts,
			bootId,
			log,
			logHealth,
			logWsControl,
			logHooks,
			logChannels,
			logCron,
			logReload,
			loadGatewayStartupPostAttachModule,
			waitForPostReadyWork: () => postReadyWorkBarrier
		})).startupSettled;
	} catch (err) {
		await closeOnStartupFailure();
		throw err;
	}
	setTimeout(releasePostReadyWork, POST_READY_WORK_START_DELAY_MS).unref?.();
	const close = createCloseHandler();
	return {
		startupSettled,
		getTailscaleIngressEndpoint: gatewayKernel.transportBridge.getTailscaleIngressEndpoint,
		close: async (optsLocal) => {
			await runGatewayShutdownSteps({
				steps: [
					{
						name: "close prelude fence",
						run: beginClosePrelude
					},
					{
						name: "terminal sessions",
						run: () => terminalSessions.disposeAll()
					},
					{
						name: "gateway lifetime sidecars",
						run: stopRegisteredGatewayLifetimeSidecars
					},
					{
						name: "post-ready sidecars",
						run: stopRegisteredPostReadySidecars
					},
					{
						name: "gateway_stop plugin hooks",
						run: async () => {
							await shutdownRuntime.runGlobalGatewayStopSafely({
								event: { reason: optsLocal?.reason ?? "gateway stopping" },
								ctx: { port },
								onError: (error) => log.warn(`gateway_stop hook failed: ${formatErrorMessage(error)}`)
							});
						}
					},
					{
						name: "gateway close prelude",
						run: runClosePrelude
					},
					{
						name: "late sidecar cleanup",
						run: sealAndJoinRegisteredSidecarStops
					},
					{
						name: "gateway close",
						run: () => close(optsLocal)
					}
				],
				onError: (message) => log.error(message)
			});
		}
	};
}
//#endregion
export { resetPreparedModelCatalogForTestCore, startGatewayServerCore };
