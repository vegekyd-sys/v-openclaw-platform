import { D as resolveExpiresAtMsFromDurationMs, R as timestampMsToIsoString } from "./number-coercion-CLj0HTDM.js";
import { a as sanitizeCommandDescriptorDescription, i as normalizeCommandDescriptorName } from "./command-descriptor-utils-DII8rwLT.js";
import { a as getPluginCache, f as withPluginCache } from "./plugin-cache-DGWspMEc.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty, p as normalizeStringifiedOptionalString } from "./string-coerce-CIXf7egm.js";
import { _ as normalizeUniqueTrimmedStringList, b as uniqueValues, d as normalizeStringEntries, h as normalizeUniqueStringEntries, p as normalizeTrimmedStringList } from "./string-normalization-DiSb4JeN.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { a as createLazyRuntimeSurface, r as createLazyRuntimeModule, t as createLazyRuntimeMethod } from "./lazy-runtime-CgCh8H_K.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { n as describeRootFileOpenFailure, s as openRootFileSync } from "./boundary-file-read-uaJcf6X6.js";
import { n as isPathInside, o as safeRealpathSync, s as safeStatSync } from "./path-safety-Bi0ppMWC.js";
import { k as withTimeout } from "./fs-safe-Cdu9fYG_.js";
import "./utils-D3A1hGii.js";
import { w as resolveStateDir } from "./paths-Dx1CjxA5.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { n as validateJsonSchemaValue } from "./schema-validator-CLfGeb79.js";
import { c as installOpenClawPluginSdkNativeResolver, l as toSafeImportPath, t as getCachedPluginModuleLoader } from "./plugin-module-loader-cache-C4l9L2gm.js";
import { l as resolvePluginRuntimeModulePathWithDiagnostics } from "./sdk-alias-C6604U-C.js";
import { t as normalizePluginPolicyId } from "./plugin-policy-id-4QxPdFqy.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { t as isPromiseLike } from "./promise-like-D7-l5Fsp.js";
import { t as VERSION } from "./version-CAQhhGAu.js";
import { o as resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction, wt as normalizeSqliteNumber } from "./openclaw-state-db-Bh3Bq87y.js";
import { a as GENERATED_BUNDLED_CHANNEL_CONFIG_METADATA } from "./ids-DeNBb0Rp.js";
import { i as kindsEqual, n as defaultSlotIdForKey, r as hasKind } from "./slots-CQdAEuat.js";
import { d as resolveEffectivePluginActivationState, p as resolveMemorySlotDecision, u as resolveEffectiveEnableState } from "./config-state-B-P4NhQV.js";
import { f as recordPluginInstallOwnerLookup, m as resolvePluginInstallOwnerLookup, n as discoverOpenClawPlugins, p as resolvePluginCandidateInstallOwner } from "./discovery-BQKfofUJ.js";
import { t as shouldRejectHardlinkedPluginFiles } from "./hardlink-policy-BFgbuiBN.js";
import "./path-safety-BT3PFs5V.js";
import { t as isPluginEnabledByDefaultForPlatform } from "./default-enablement-CEIbpabL.js";
import { n as loadPluginManifestRegistryCore } from "./manifest-registry-_ck0cJ4q.js";
import { i as loadInstalledPluginIndexInstallRecordsSync } from "./installed-plugin-index-record-reader-CGCFpTaD.js";
import { s as createPluginIdScopeSet, u as normalizePluginIdScope } from "./current-plugin-metadata-snapshot-BqMIdsHK.js";
import { l as normalizeChannelMeta } from "./bundled-BVcgTy-G.js";
import { t as unwrapDefaultModuleExport } from "./module-export-DsZgGIbX.js";
import { a as resolveManifestOwnerBasePolicyBlock, t as hasExplicitManifestOwnerTrust } from "./manifest-owner-policy-B4j3b8bb.js";
import { t as isPluginJsonValue } from "./host-hook-json-BdcyDerH.js";
import { l as isOperatorScope } from "./operator-scopes-Dw7Gu2cA.js";
import { r as runCommandWithTimeout } from "./exec-D7bZ8DC6.js";
import { C as NODE_WORKER_PRIVATE_COMMANDS, M as isPrivateNodeInvokeCommand, a as NODE_EXEC_APPROVALS_COMMANDS, m as NODE_SYSTEM_RUN_COMMANDS, p as NODE_SYSTEM_NOTIFY_COMMAND } from "./node-commands-BC8PhxqU.js";
import { i as emitAgentEvent, x as hasInvalidLifecycleStartTimestamp } from "./agent-events-Con5xUCM.js";
import { a as isPluginRegistryActivated, d as revokePluginRecordLifecycleEpoch, i as isPluginRecordLifecycleEpochActive, s as isPluginRegistryRetired, t as activatePluginRecordLifecycleEpoch, u as pluginLoaderCacheState } from "./registry-lifecycle-yJcZYGGM.js";
import { B as registerPluginSessionSchedulerJob, F as clearPluginRunContext, I as deletePluginSessionSchedulerJob, L as getPluginRunContext, P as cleanupPluginSessionSchedulerJobs, R as getPluginSessionSchedulerJobGeneration, V as setPluginRunContext, d as getActivePluginRegistry, j as withPluginRegistrationContext, x as recordImportedPluginId } from "./runtime-MupoouIC.js";
import { n as normalizePluginHostHookId } from "./host-hooks-sVMn958c.js";
import { s as listChatChannels } from "./registry-DCugu7x1.js";
import { t as createEmptyPluginRegistry } from "./registry-empty-55wlVNzO.js";
import { d as withPluginRuntimeRegistryScope, l as withPluginRuntimePluginIdScope, r as getGatewayContextResolver, t as bindGatewayContextResolver, u as withPluginRuntimePluginScope } from "./gateway-request-scope-CmMd3nUp.js";
import { i as normalizePluginGatewayMethodScope, r as createPluginGatewayMethodDescriptor } from "./descriptor-C8WchCC9.js";
import { n as inspectBundleMcpRuntimeSupport } from "./bundle-mcp-CQ40nl-z.js";
import "./installed-plugin-index-records-ByWgcWST.js";
import { t as prefersBuiltPluginArtifacts } from "./plugin-runtime-artifact-selection-BdRMgBoa.js";
import { c as resolvePluginLoadCacheContext, l as resolveRuntimeSubagentMode, s as resolveCompatibleRuntimePluginRegistry } from "./active-runtime-registry-D12UHfQh.js";
import { P as getCoreEmbeddingProvider } from "./gateway-startup-plugin-config-BUSG8F2S.js";
import { n as createUnavailableRuntime, r as attachPluginApiFacades, t as buildPluginApi } from "./api-builder-D8BkwR6_.js";
import { C as createPluginToolMatcherScope, E as pluginToolMatcherCoversTool, T as normalizePluginToolMatcher, d as isConversationHookName, f as isPluginHookAgentTrigger, h as isPromptInjectionHookName, m as isPluginHookReplyDispatchKind, p as isPluginHookName } from "./hook-runner-global-DLqoAE5f.js";
import { n as resolveCanonicalDistRuntimeSource, r as resolvePluginRuntimeArtifact, t as clearPluginRuntimeArtifactResolutionMemo } from "./plugin-runtime-artifact-resolution-FcxjQ1Xt.js";
import { t as quoteCliArg } from "./quote-cli-arg-BriMa9wW.js";
import { c as registerContextEngineInRegistry } from "./registry-BdPa2vko.js";
import { c as serializePluginStoreJson, d as validatePluginStoreNamespace, f as validatePluginStorePositiveInteger, l as validateOptionalPluginStoreTtlMs, n as createPluginStateKeyedStore, r as createPluginStateSyncKeyedStore, s as createPluginStoreOptionPolicy, u as validatePluginStoreKey } from "./plugin-state-store-PhQA2Nhh.js";
import { i as findActiveDegradedPlugin, n as clearActiveDegradedPlugin, r as degradedPluginMatchesRoot } from "./runtime-degraded-state-B_-lbcPZ.js";
import { _ as formatMissingPluginRegisterError, a as createPluginCandidatesFromManifestRegistry, b as recordPluginConfiguredUnavailable, c as isAuthorizedDreamingSidecarPlugin, d as pushDiagnostics, f as pushPluginValidationError, g as formatAutoEnabledActivationReason, h as validatePluginConfig, i as createManifestPluginRecord, l as matchesScopedPluginOrDreamingSidecar, m as safeRealpathOrResolve, n as applyManifestSnapshotMetadata, o as createPluginLoaderLogger, p as resolveAuthorizedDreamingSidecar, r as applyPluginManifestRecordDetails, s as detailPluginStartupTrace, t as activatePluginRegistry, u as maybeThrowOnPluginLoadError, v as formatPluginFailureSummary, x as recordPluginError, y as markPluginActivationDisabled } from "./loader-shared-DZbJ6qPD.js";
import { i as withProfile } from "./plugin-load-profile-BJhF3y_n.js";
import { l as requestHeartbeat } from "./heartbeat-wake-c_7_7clI.js";
import { a as enqueueSystemEvent } from "./system-events-GfU3KOHp.js";
import { t as isBundleCapabilitySupported } from "./bundle-capability-support-B86S0fqh.js";
import { c as registerPluginDashboardCapabilities, o as PluginDashboardDeclarationError, t as createPluginBoardWidgetContentKindRegistrar } from "./board-widget-content-kinds-Dib9CmrR.js";
import { a as resolveSetupChannelRegistration, i as resolveBundledRuntimeChannelRegistration, n as loadBundledRuntimeChannelPlugin, o as shouldLoadChannelPluginInSetupRuntime, r as mergeSetupRuntimeChannelPlugin, t as channelPluginIdBelongsToManifest } from "./loader-channel-setup-CFJMGICX.js";
import { t as resolveExternalPluginRuntimeDependencyRepairHint } from "./official-external-plugin-repair-hints-CmeYRvhu.js";
import { r as registerPluginInteractiveHandlerInRegistry } from "./interactive-registry-jNjXxq9T.js";
import { t as normalizeSessionEntrySlotKey } from "./session-entry-slot-keys-CYzxMwPX.js";
import { n as normalizePluginHttpPath, t as findPluginHttpRouteRegistrationConflicts } from "./http-route-overlap-Ck15uOqk.js";
import { r as registerPluginCommandInRegistry, t as isReservedCommandName } from "./command-registration-BTRvP9xA.js";
import { n as validateWorkerProviderContract } from "./worker-provider-registry-g5Xsk896.js";
import "./with-timeout-BebXPt78.js";
import { n as resolvePromptInjectionAllowed, t as resolveConversationAccessAllowed } from "./hook-policy-decisions-DL3kOjGW.js";
import { C as registerChannelIngressHostOwner, _ as prepareHostChannelContextAdmissionEvidence, i as bindChannelParticipantInput, n as createChannelIngressDrain, u as bindHostChannelContextAdmissionEvidence } from "./ingress-drain-DnD8A5M1.js";
import { t as createChannelIngressQueue } from "./ingress-queue-C7H3VLUf.js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
//#region src/plugins/agent-tool-result-middleware.ts
const AGENT_TOOL_RESULT_MIDDLEWARE_RUNTIMES = ["openclaw", "codex"];
const AGENT_TOOL_RESULT_MIDDLEWARE_RUNTIME_SET = new Set(AGENT_TOOL_RESULT_MIDDLEWARE_RUNTIMES);
function normalizeAgentToolResultMiddlewareRuntime(runtime) {
	const normalized = runtime.trim().toLowerCase();
	return AGENT_TOOL_RESULT_MIDDLEWARE_RUNTIME_SET.has(normalized) ? normalized : void 0;
}
function normalizeAgentToolResultMiddlewareRuntimes(options) {
	const requested = options?.runtimes;
	if (!requested) return [...AGENT_TOOL_RESULT_MIDDLEWARE_RUNTIMES];
	const normalized = [];
	for (const runtime of requested) {
		const value = normalizeAgentToolResultMiddlewareRuntime(runtime);
		if (!value) continue;
		if (!normalized.includes(value)) normalized.push(value);
	}
	return normalized;
}
function normalizeAgentToolResultMiddlewareRuntimeIds(runtimes) {
	const normalized = [];
	for (const runtime of runtimes ?? []) {
		const value = normalizeAgentToolResultMiddlewareRuntime(runtime);
		if (value && !normalized.includes(value)) normalized.push(value);
	}
	return normalized;
}
function sameMiddlewareScope(left, right) {
	return left.runtimes.length === right.runtimes.length && left.runtimes.every((runtime) => right.runtimes.includes(runtime)) && (left.matcher ?? []).length === (right.matcher ?? []).length && (left.matcher ?? []).every((toolName) => right.matcher?.includes(toolName));
}
function readAgentToolResultMiddlewareScopes(registration) {
	return registration.scopes?.length ? registration.scopes : [{ runtimes: registration.runtimes }];
}
function appendAgentToolResultMiddlewareScope(registration, scope) {
	const normalizedMatcher = normalizePluginToolMatcher(scope.matcher);
	const normalizedScope = {
		runtimes: [...scope.runtimes],
		...normalizedMatcher ? { matcher: normalizedMatcher } : {}
	};
	const scopes = readAgentToolResultMiddlewareScopes(registration);
	if (!scopes.some((existing) => sameMiddlewareScope(existing, normalizedScope))) registration.scopes = [...scopes, normalizedScope];
	else if (!registration.scopes) registration.scopes = scopes;
	registration.runtimes = normalizeAgentToolResultMiddlewareRuntimeIds(readAgentToolResultMiddlewareScopes(registration).flatMap((entry) => entry.runtimes));
}
function agentToolResultMiddlewareRegistrationCoversTool(registration, runtime, toolName) {
	return readAgentToolResultMiddlewareScopes(registration).some((scope) => scope.runtimes.includes(runtime) && pluginToolMatcherCoversTool(scope.matcher, toolName));
}
function getAgentToolResultMiddlewareMatcherScope(runtime) {
	const matchers = (getActivePluginRegistry()?.agentToolResultMiddlewares ?? []).flatMap((registration) => readAgentToolResultMiddlewareScopes(registration).filter((scope) => scope.runtimes.includes(runtime)).map((scope) => scope.matcher));
	return createPluginToolMatcherScope(matchers);
}
function listAgentToolResultMiddlewares(runtime) {
	return getActivePluginRegistry()?.agentToolResultMiddlewares?.filter((entry) => entry.runtimes.includes(runtime)).map((entry) => entry.handler) ?? [];
}
//#endregion
//#region src/plugins/loader-cache.ts
/** Registry reuse is off for explicit opt-outs and for raw env-substituted config loads. */
function isPluginRegistryCacheEnabled(options) {
	return options.cache !== false && options.resolveRawConfigEnvVars !== true;
}
function clearPluginRegistryLoadCache() {
	clearPluginRuntimeArtifactResolutionMemo();
	pluginLoaderCacheState.clearCachedRegistries();
}
function resolvePluginRegistryLoadCacheKey(options = {}) {
	return resolvePluginLoadCacheContext(options).cacheKey;
}
function isPluginRegistryLoadInFlight(options = {}) {
	return pluginLoaderCacheState.isLoadInFlight(resolvePluginRegistryLoadCacheKey(options));
}
//#endregion
//#region src/plugins/loader-provenance.ts
function createPathMatcher() {
	return {
		exact: /* @__PURE__ */ new Set(),
		dirs: []
	};
}
function addPathToMatcher(matcher, rawPath, env = process.env) {
	const trimmed = rawPath.trim();
	if (!trimmed) return;
	const resolved = resolveUserPath(trimmed, env);
	if (!resolved) return;
	const canonical = safeRealpathSync(resolved) ?? resolved;
	if (matcher.exact.has(canonical) || matcher.dirs.includes(canonical)) return;
	if (safeStatSync(canonical)?.isDirectory()) {
		matcher.dirs.push(canonical);
		return;
	}
	matcher.exact.add(canonical);
}
function matchesPathMatcher(matcher, sourcePath) {
	if (matcher.exact.has(sourcePath)) return true;
	return matcher.dirs.some((dirPath) => isPathInside(dirPath, sourcePath));
}
function formatPluginInspectCommand(pluginId) {
	return `openclaw plugins inspect ${quoteCliArg(pluginId)}`;
}
/** Builds provenance matchers from configured load paths and install records. */
function buildProvenanceIndex(params) {
	const loadPathMatcher = createPathMatcher();
	for (const loadPath of params.normalizedLoadPaths) addPathToMatcher(loadPathMatcher, loadPath, params.env);
	const installRules = /* @__PURE__ */ new Map();
	const installs = params.installRecords ?? loadInstalledPluginIndexInstallRecordsSync({ env: params.env });
	for (const [pluginId, install] of Object.entries(installs)) {
		const rule = {
			trackedWithoutPaths: false,
			matcher: createPathMatcher()
		};
		const trackedPaths = normalizeTrimmedStringList([install.installPath, install.sourcePath]);
		if (trackedPaths.length === 0) rule.trackedWithoutPaths = true;
		else for (const trackedPath of trackedPaths) addPathToMatcher(rule.matcher, trackedPath, params.env);
		installRules.set(pluginId, rule);
	}
	return {
		loadPathMatcher,
		installRules
	};
}
function isTrackedByProvenance(params) {
	const sourcePath = resolveUserPath(params.source, params.env);
	const canonicalSourcePath = safeRealpathSync(sourcePath) ?? sourcePath;
	const installRule = params.index.installRules.get(params.pluginId);
	if (installRule) {
		if (installRule.trackedWithoutPaths) return true;
		if (matchesPathMatcher(installRule.matcher, canonicalSourcePath)) return true;
	}
	return matchesPathMatcher(params.index.loadPathMatcher, canonicalSourcePath);
}
/** Warns when an open plugin allowlist may auto-load non-bundled plugins. */
function warnWhenAllowlistIsOpen(params) {
	if (!params.emitWarning) return;
	if (!params.pluginsEnabled) return;
	const autoDiscoverable = params.discoverablePlugins.filter((entry) => (entry.origin === "workspace" || entry.origin === "global") && !params.explicitlyEnabledPluginIds?.has(entry.id));
	if (autoDiscoverable.length === 0) return;
	const allDiscoveredIds = new Set(params.discoverablePlugins.map((entry) => entry.id));
	const hasConfiguredAllowlist = params.allow.length > 0;
	const allowHasDiscoveredMatch = params.allow.some((id) => allDiscoveredIds.has(id));
	if (hasConfiguredAllowlist && allowHasDiscoveredMatch) return;
	if (params.warningCache.hasOpenAllowlistWarning(params.warningCacheKey)) return;
	const preview = autoDiscoverable.slice(0, 6).map((entry) => `${entry.id} (${entry.source})`).join(", ");
	const truncated = autoDiscoverable.length > 6;
	const extra = truncated ? ` (+${autoDiscoverable.length - 6} more)` : "";
	const inspectCommands = autoDiscoverable.map((entry) => `'${formatPluginInspectCommand(entry.id)}'`).join(", ");
	const remediation = truncated ? "Run 'openclaw plugins list --enabled --verbose' to enumerate every discovered plugin id, inspect trusted ids with 'openclaw plugins inspect <id>', and add the ones you trust to plugins.allow in openclaw.json." : `To trust them explicitly, set plugins.allow in openclaw.json (e.g. "plugins": { "allow": [${autoDiscoverable.map((entry) => JSON.stringify(entry.id)).join(", ")}] }). Run 'openclaw plugins list --enabled --verbose' or ${inspectCommands} to confirm plugin ids.`;
	params.warningCache.recordOpenAllowlistWarning(params.warningCacheKey);
	if (!hasConfiguredAllowlist) {
		params.logger.warn(`[plugins] plugins.allow is empty; discovered non-bundled plugins may auto-load: ${preview}${extra}. ${remediation}`);
		return;
	}
	const unmatchedEntries = params.allow.filter((id) => !allDiscoveredIds.has(id));
	const unmatchedPreview = unmatchedEntries.slice(0, 6).map((id) => `"${id}"`).join(", ");
	const unmatchedExtra = unmatchedEntries.length > 6 ? ` (+${unmatchedEntries.length - 6} more)` : "";
	params.logger.warn(`[plugins] plugins.allow entries ${unmatchedPreview}${unmatchedExtra} do not match any discovered plugin ids; discovered non-bundled plugins: ${preview}${extra}. Use the plugin id (not a channel id or npm package name).`);
}
/** Adds diagnostics for loaded plugins without install or load-path provenance. */
function warnAboutUntrackedLoadedPlugins(params) {
	const allowSet = new Set(params.allowlist);
	for (const plugin of params.registry.plugins) {
		if (plugin.status !== "loaded" || plugin.origin === "bundled") continue;
		if (allowSet.has(plugin.id)) continue;
		const installOwner = resolvePluginInstallOwnerLookup(params)?.get(plugin.id);
		if (installOwner && isTrackedByProvenance({
			pluginId: installOwner,
			source: plugin.source,
			index: params.provenance,
			env: params.env
		})) continue;
		const message = `OpenClaw can't verify where this plugin came from. Review it with '${formatPluginInspectCommand(plugin.id)}'. Adding it to plugins.allow lets it load, but does not make it trusted. If it's an official plugin, reinstall it from its official npm package or its official ClawHub listing to enable trusted features.`;
		params.registry.diagnostics.push({
			level: "warn",
			pluginId: plugin.id,
			source: plugin.source,
			message
		});
		if (params.emitWarning) params.logger.warn(`[plugins] ${plugin.id}: ${message} (${plugin.source})`);
	}
}
//#endregion
//#region src/plugins/loader-discovery.ts
function resolvePluginLoadDiscovery(params) {
	const { options, context } = params;
	const suppliedManifestRegistry = options.manifestRegistry ?? (options.discovery === void 0 ? context.metadataSnapshot?.manifestRegistry : void 0);
	const discovery = suppliedManifestRegistry ? {
		candidates: createPluginCandidatesFromManifestRegistry(suppliedManifestRegistry),
		diagnostics: []
	} : options.discovery ?? discoverOpenClawPlugins({
		workspaceDir: options.workspaceDir,
		extraPaths: context.normalized.loadPaths,
		env: context.env,
		installRecords: context.installRecords
	});
	const manifestRegistry = suppliedManifestRegistry ?? loadPluginManifestRegistryCore({
		config: context.cfg,
		workspaceDir: options.workspaceDir,
		env: context.env,
		candidates: discovery.candidates,
		diagnostics: discovery.diagnostics,
		installRecords: Object.keys(context.installRecords).length > 0 ? context.installRecords : void 0
	});
	pushDiagnostics(params.diagnostics, manifestRegistry.diagnostics);
	warnWhenAllowlistIsOpen({
		emitWarning: params.emitWarning,
		logger: params.logger,
		pluginsEnabled: context.normalized.enabled,
		allow: context.normalized.allow,
		warningCacheKey: params.warningCacheKey,
		warningCache: pluginLoaderCacheState,
		explicitlyEnabledPluginIds: new Set(Object.entries(context.normalized.entries).filter(([, entry]) => entry.enabled === true).map(([pluginId]) => pluginId)),
		discoverablePlugins: manifestRegistry.plugins.filter((plugin) => !params.onlyPluginIdSet || params.onlyPluginIdSet.has(plugin.id)).map((plugin) => ({
			id: plugin.id,
			source: plugin.source,
			origin: plugin.origin
		}))
	});
	const provenance = buildProvenanceIndex({
		normalizedLoadPaths: context.normalized.loadPaths,
		env: context.env,
		installRecords: context.installRecords
	});
	const manifestBySource = new Map(manifestRegistry.plugins.map((record) => [record.source, record]));
	return {
		discovery,
		manifestRegistry,
		orderedCandidates: discovery.candidates.filter((candidate) => manifestBySource.has(candidate.source)),
		manifestBySource,
		provenance
	};
}
//#endregion
//#region src/plugins/api-lifecycle.ts
const LATE_CALLABLE_PLUGIN_API_METHODS = /* @__PURE__ */ new Set([
	"clearRunContext",
	"emitAgentEvent",
	"enqueueNextTurnInjection",
	"getRunContext",
	"sendSessionAttachment",
	"scheduleSessionTurn",
	"setRunContext",
	"unscheduleSessionTurnsByTag"
]);
/** True when a plugin API method remains callable after registration. */
function isLateCallablePluginApiMethod(methodName) {
	return LATE_CALLABLE_PLUGIN_API_METHODS.has(methodName);
}
//#endregion
//#region src/plugins/runtime/runtime-config.ts
function createRuntimeConfig() {
	return {
		current: getRuntimeConfig,
		mutateConfigFile: async (params) => {
			const { mutateConfigFile } = await import("./mutate-6z7Sb-Jt.js");
			return await mutateConfigFile(params);
		},
		replaceConfigFile: async (params) => {
			const { replaceConfigFile } = await import("./mutate-6z7Sb-Jt.js");
			return await replaceConfigFile(params);
		}
	};
}
//#endregion
//#region src/plugins/runtime/native-deps.ts
/** Formats concise guidance for installing and rebuilding a native dependency. */
function formatNativeDependencyHint(params) {
	const manager = params.manager ?? "pnpm";
	const rebuildCommand = params.rebuildCommand ?? (manager === "npm" ? `npm rebuild ${params.packageName}` : manager === "yarn" ? `yarn rebuild ${params.packageName}` : `pnpm rebuild ${params.packageName}`);
	const steps = [
		params.approveBuildsCommand ?? (manager === "pnpm" ? `pnpm approve-builds (select ${params.packageName})` : void 0),
		rebuildCommand,
		params.downloadCommand
	].filter((step) => Boolean(step));
	if (steps.length === 0) return `Install ${params.packageName} and rebuild its native module.`;
	return `Install ${params.packageName} and rebuild its native module (${steps.join("; ")}).`;
}
//#endregion
//#region src/plugins/runtime/runtime-system.ts
const loadHeartbeatRunnerRuntime = createLazyRuntimeModule(() => import("./heartbeat-runner-BNL1no8R.js"));
const runHeartbeatOnceInternal = createLazyRuntimeMethod(loadHeartbeatRunnerRuntime, (runtime) => runtime.runHeartbeatOnce);
/** Creates the plugin runtime system facade with heartbeat/event/process helpers. */
function createRuntimeSystem() {
	const requestHeartbeatNow = (opts) => requestHeartbeat({
		source: opts?.source ?? "other",
		intent: opts?.intent ?? "immediate",
		reason: opts?.reason,
		coalesceMs: opts?.coalesceMs,
		agentId: opts?.agentId,
		sessionKey: opts?.sessionKey,
		heartbeat: opts?.heartbeat
	});
	return {
		enqueueSystemEvent,
		requestHeartbeat,
		requestHeartbeatNow,
		runHeartbeatOnce: (opts) => {
			const { reason, agentId, sessionKey, heartbeat } = opts ?? {};
			return runHeartbeatOnceInternal({
				reason,
				agentId,
				sessionKey,
				heartbeat: heartbeat ? { target: heartbeat.target } : void 0
			});
		},
		runCommandWithTimeout,
		formatNativeDependencyHint
	};
}
//#endregion
//#region src/plugins/runtime/runtime-base.ts
function unavailable(method) {
	return () => {
		throw new Error(`${method} is only available through the plugin runtime proxy.`);
	};
}
/** Host-owned facades survive later path-loaded runtime materialization unchanged. */
function createRuntimeBase() {
	let system;
	return {
		config: createRuntimeConfig(),
		state: {
			resolveStateDir,
			openBlobStore: unavailable("openBlobStore"),
			openKeyedStore: unavailable("openKeyedStore"),
			openSyncKeyedStore: unavailable("openSyncKeyedStore"),
			openChannelIngressQueue: unavailable("openChannelIngressQueue"),
			openChannelIngressDrain: unavailable("openChannelIngressDrain")
		},
		get system() {
			return system ??= createRuntimeSystem();
		}
	};
}
//#endregion
//#region src/plugins/loader-module-runtime.ts
const LAZY_RUNTIME_REFLECTION_KEYS = [
	"version",
	"gateway",
	"config",
	"agent",
	"subagent",
	"system",
	"media",
	"mediaUnderstanding",
	"tts",
	"channel",
	"events",
	"logging",
	"state",
	"modelAuth",
	"imageGeneration",
	"videoGeneration",
	"musicGeneration",
	"llm"
];
function createGuardedPluginRegistrationApi(api) {
	let closed = false;
	return {
		api: attachPluginApiFacades(new Proxy(api, { get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof value !== "function") return value;
			if (typeof prop === "string" && isLateCallablePluginApiMethod(prop)) return (...args) => Reflect.apply(value, target, args);
			return (...args) => {
				if (closed) return;
				return Reflect.apply(value, target, args);
			};
		} })),
		close: () => {
			closed = true;
		}
	};
}
function runPluginRegisterSync(register, api) {
	const guarded = createGuardedPluginRegistrationApi(api);
	try {
		const result = register(guarded.api);
		if (isPromiseLike(result)) {
			Promise.resolve(result).catch(() => {});
			throw new Error("plugin register must be synchronous");
		}
	} finally {
		guarded.close();
	}
}
function runPluginRegisterSyncInRegistry(register, api, registry, pluginId) {
	withPluginRegistrationContext(registry, pluginId, () => runPluginRegisterSync(register, api));
}
function createPluginModuleLoader(options) {
	const cache = getPluginCache();
	const captured = { ...options };
	const createLoaderForModule = (modulePath) => {
		if (captured.installNativeSdkResolver !== false && captured.tryNative !== false) installOpenClawPluginSdkNativeResolver({
			argv1: process.argv[1],
			moduleUrl: import.meta.url,
			pluginModulePath: modulePath,
			devSourceRoot: captured.devSourceRoot,
			pluginSdkResolution: captured.pluginSdkResolution
		});
		return getCachedPluginModuleLoader({
			modulePath,
			importerUrl: import.meta.url,
			loaderFilename: captured.loaderFilename ?? modulePath,
			devSourceRoot: captured.devSourceRoot,
			pluginSdkResolution: captured.pluginSdkResolution,
			...captured.tryNative !== void 0 ? { tryNative: captured.tryNative } : {}
		});
	};
	return (modulePath) => withPluginCache(cache, () => createLoaderForModule(modulePath)(toSafeImportPath(modulePath)));
}
function formatPluginRuntimeModuleResolutionError(params) {
	const { resolution } = params;
	const candidates = resolution.candidates.length > 0 ? resolution.candidates.join(", ") : "<none>";
	return [
		"Unable to resolve plugin runtime module",
		`loader=${resolution.modulePath ?? "<unresolved>"}`,
		`packageRoot=${resolution.packageRoot ?? "<none>"}`,
		`pluginSdkResolution=${params.pluginSdkResolution ?? "auto"}`,
		`candidates=${candidates}`,
		...resolution.error ? [`resolverError=${resolution.error}`] : []
	].join("; ");
}
/** Lazily materializes the broad plugin runtime only when registration reads it. */
function createLazyPluginRuntime(params) {
	let createPluginRuntimeFactory = null;
	const resolveCreatePluginRuntime = () => {
		if (createPluginRuntimeFactory) return createPluginRuntimeFactory;
		const resolution = resolvePluginRuntimeModulePathWithDiagnostics({
			devSourceRoot: params.devSourceRoot,
			pluginSdkResolution: params.pluginSdkResolution
		});
		if (!resolution.resolvedPath) throw new Error(formatPluginRuntimeModuleResolutionError({
			resolution,
			pluginSdkResolution: params.pluginSdkResolution
		}));
		const resolvedPath = resolution.resolvedPath;
		const runtimeModule = withProfile({ source: resolvedPath }, "runtime-module", () => params.loadPluginModule(resolvedPath));
		if (typeof runtimeModule.createPluginRuntime !== "function") throw new Error("Plugin runtime module missing createPluginRuntime export");
		createPluginRuntimeFactory = runtimeModule.createPluginRuntime;
		return createPluginRuntimeFactory;
	};
	const cache = getPluginCache();
	const base = createRuntimeBase();
	let resolvedRuntime = null;
	const resolveRuntime = () => {
		resolvedRuntime ??= withPluginCache(cache, () => resolveCreatePluginRuntime()(params.runtimeOptions, base));
		return resolvedRuntime;
	};
	const getRuntimeProperty = (prop, ...receiver) => {
		if (!resolvedRuntime) {
			if (prop === "version") return VERSION;
			if (prop === "config" || prop === "state" || prop === "system") return base[prop];
		}
		return receiver.length === 0 ? Reflect.get(resolveRuntime(), prop) : Reflect.get(resolveRuntime(), prop, receiver[0]);
	};
	const lazyRuntimeReflectionKeySet = new Set(LAZY_RUNTIME_REFLECTION_KEYS);
	const resolveLazyRuntimeDescriptor = (prop) => {
		if (!lazyRuntimeReflectionKeySet.has(prop)) return Reflect.getOwnPropertyDescriptor(resolveRuntime(), prop);
		return {
			configurable: true,
			enumerable: true,
			get() {
				return getRuntimeProperty(prop);
			},
			set(value) {
				Reflect.set(resolveRuntime(), prop, value);
			}
		};
	};
	return new Proxy({}, {
		get(_target, prop, receiver) {
			if (prop === "gateway" || prop === "nodes" || prop === "subagent") {
				const value = params.runtimeOptions?.[prop];
				if (value !== void 0) return value;
			}
			return getRuntimeProperty(prop, receiver);
		},
		set(_target, prop, value, receiver) {
			return Reflect.set(resolveRuntime(), prop, value, receiver);
		},
		has(_target, prop) {
			return lazyRuntimeReflectionKeySet.has(prop) || Reflect.has(resolveRuntime(), prop);
		},
		ownKeys() {
			return [...LAZY_RUNTIME_REFLECTION_KEYS];
		},
		getOwnPropertyDescriptor(_target, prop) {
			return resolveLazyRuntimeDescriptor(prop);
		},
		defineProperty(_target, prop, attributes) {
			return Reflect.defineProperty(resolveRuntime(), prop, attributes);
		},
		deleteProperty(_target, prop) {
			return Reflect.deleteProperty(resolveRuntime(), prop);
		},
		getPrototypeOf() {
			return Reflect.getPrototypeOf(resolveRuntime());
		}
	});
}
function resolvePluginModuleExport(moduleExport) {
	const seen = /* @__PURE__ */ new Set();
	const candidates = [unwrapDefaultModuleExport(moduleExport), moduleExport];
	for (let index = 0; index < candidates.length && index < 12; index += 1) {
		const resolved = candidates[index];
		if (seen.has(resolved)) continue;
		seen.add(resolved);
		if (typeof resolved === "function") return { register: resolved };
		if (resolved && typeof resolved === "object") {
			const definition = resolved;
			const register = definition.register;
			if (typeof register === "function") return {
				definition,
				register
			};
			for (const key of ["default", "module"]) if (key in definition) candidates.push(definition[key]);
		}
	}
	const resolved = candidates[0];
	if (resolved && typeof resolved === "object") {
		const definition = resolved;
		return {
			definition,
			register: definition.register
		};
	}
	return {};
}
function kindIncludes(kind, target) {
	return kind === target || Array.isArray(kind) && kind.includes(target);
}
function formatBundledChannelWrongLoaderError(kind) {
	if (kindIncludes(kind, "bundled-channel-setup-entry")) return "bundled channel setup entry requires setup-runtime loader";
	if (kindIncludes(kind, "bundled-channel-entry")) return "bundled channel entry requires setup-runtime loader";
	return null;
}
//#endregion
//#region src/plugins/loader-channel-runtime.ts
/**
* Handles the setup-entry channel path.
* Returns true when the candidate is complete (loaded, disabled, or failed).
*/
function loadSetupRuntimeChannelCandidate(params) {
	const { manifestRecord, record, registrationPlan, runtimeCandidateEntry, registryBuilder } = params;
	if (!registrationPlan.loadSetupEntry || !manifestRecord.setupSource) return false;
	const recordSetupFailure = (error, phase, message) => {
		recordPluginError({
			logger: params.logger,
			registry: registryBuilder.registry,
			record,
			seenIds: params.seenIds,
			pluginId: record.id,
			origin: params.candidateOrigin,
			phase,
			error,
			logPrefix: `[plugins] ${record.id} ${message} from ${record.source}: `,
			diagnosticMessagePrefix: `${message}: `,
			diagnosticCode: "channel-setup-failure"
		});
	};
	const setupRegistration = resolveSetupChannelRegistration(params.mod);
	if (setupRegistration.loadError) {
		recordSetupFailure(setupRegistration.loadError, "load", "failed to load setup entry");
		return true;
	}
	if (!setupRegistration.plugin) return false;
	if (!channelPluginIdBelongsToManifest({
		channelId: setupRegistration.plugin.id,
		pluginId: record.id,
		manifestChannels: manifestRecord.channels
	})) {
		params.pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", setup export uses "${setupRegistration.plugin.id}")`);
		return true;
	}
	const api = registryBuilder.createApi(record, {
		config: params.cfg,
		pluginConfig: {},
		hookPolicy: params.entry?.hooks,
		registrationMode: registrationPlan.mode
	});
	let mergedSetupRegistration = setupRegistration;
	let runtimeSetterApplied = false;
	if (registrationPlan.loadSetupRuntimeEntry && setupRegistration.usesBundledSetupContract && resolveCanonicalDistRuntimeSource(runtimeCandidateEntry.source) !== params.safeSource) {
		const runtimeModuleSource = resolveCanonicalDistRuntimeSource(runtimeCandidateEntry.source);
		const runtimeModuleRoot = resolveCanonicalDistRuntimeSource(runtimeCandidateEntry.rootDir);
		const runtimeOpened = openRootFileSync({
			absolutePath: runtimeModuleSource,
			rootPath: runtimeModuleRoot,
			boundaryLabel: "plugin root",
			rejectHardlinks: params.rejectHardlinks,
			skipLexicalRootCheck: true
		});
		if (!runtimeOpened.ok) {
			params.pushPluginLoadError(describeRootFileOpenFailure({
				failure: runtimeOpened,
				subject: "plugin entry path",
				boundaryLabel: "plugin root",
				filePath: runtimeModuleSource
			}));
			return true;
		}
		const safeRuntimeSource = runtimeOpened.path;
		fs.closeSync(runtimeOpened.fd);
		let runtimeMod;
		try {
			runtimeMod = withProfile({
				pluginId: record.id,
				source: safeRuntimeSource
			}, "load-setup-runtime-entry", () => params.loadPluginModule(safeRuntimeSource));
		} catch (error) {
			recordSetupFailure(error, "load", "failed to load setup-runtime entry");
			return true;
		}
		const runtimeRegistration = resolveBundledRuntimeChannelRegistration(runtimeMod);
		if (runtimeRegistration.id && runtimeRegistration.id !== record.id) {
			params.pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", runtime entry uses "${runtimeRegistration.id}")`);
			return true;
		}
		if (runtimeRegistration.setChannelRuntime) try {
			runtimeRegistration.setChannelRuntime(api.runtime);
			runtimeSetterApplied = true;
		} catch (error) {
			recordSetupFailure(error, "load", "failed to apply setup-runtime channel runtime");
			return true;
		}
		const runtimePluginRegistration = loadBundledRuntimeChannelPlugin({ registration: runtimeRegistration });
		if (runtimePluginRegistration.loadError) {
			recordSetupFailure(runtimePluginRegistration.loadError, "load", "failed to load setup-runtime channel entry");
			return true;
		}
		if (runtimePluginRegistration.plugin) {
			if (runtimePluginRegistration.plugin.id && runtimePluginRegistration.plugin.id !== record.id) {
				params.pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", runtime export uses "${runtimePluginRegistration.plugin.id}")`);
				return true;
			}
			mergedSetupRegistration = {
				...setupRegistration,
				plugin: mergeSetupRuntimeChannelPlugin(runtimePluginRegistration.plugin, setupRegistration.plugin),
				setChannelRuntime: runtimeRegistration.setChannelRuntime ?? setupRegistration.setChannelRuntime
			};
		}
	}
	const mergedSetupPlugin = mergedSetupRegistration.plugin;
	if (!mergedSetupPlugin) return true;
	if (!channelPluginIdBelongsToManifest({
		channelId: mergedSetupPlugin.id,
		pluginId: record.id,
		manifestChannels: manifestRecord.channels
	})) {
		params.pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", setup export uses "${mergedSetupPlugin.id}")`);
		return true;
	}
	if (!runtimeSetterApplied) try {
		mergedSetupRegistration.setChannelRuntime?.(api.runtime);
	} catch (error) {
		recordSetupFailure(error, "load", "failed to apply setup channel runtime");
		return true;
	}
	if (registrationPlan.mode === "setup-runtime" && mergedSetupRegistration.registerSetupRuntime) try {
		runPluginRegisterSyncInRegistry((registrationApi) => mergedSetupRegistration.registerSetupRuntime?.(registrationApi), api, registryBuilder.registry, record.id);
	} catch (error) {
		registryBuilder.rollbackPluginGlobalSideEffects(record.id, record);
		recordSetupFailure(error, "register", "failed to register setup-runtime channel side effects");
		return true;
	}
	try {
		api.registerChannel(mergedSetupPlugin);
	} catch (error) {
		registryBuilder.rollbackPluginGlobalSideEffects(record.id, record);
		recordSetupFailure(error, "load", "failed to register setup channel");
		return true;
	}
	registryBuilder.registry.plugins.push(record);
	params.seenIds.set(record.id, params.candidateOrigin);
	return true;
}
//#endregion
//#region src/plugins/loader-registration-plan.ts
/** Converts loader intent into explicit entrypoint and activation behavior. */
function resolvePluginRegistrationPlan(params) {
	if (params.canLoadScopedSetupOnlyChannelPlugin) return {
		mode: "setup-only",
		loadSetupEntry: true,
		loadSetupRuntimeEntry: false,
		runRuntimeCapabilityPolicy: false,
		runFullActivationOnlyRegistrations: false
	};
	if (params.scopedSetupOnlyChannelPluginRequested && params.requireSetupEntryForSetupOnlyChannelPlugins) return null;
	if (!params.enableStateEnabled) return null;
	if (params.toolDiscovery) return {
		mode: "tool-discovery",
		loadSetupEntry: false,
		loadSetupRuntimeEntry: false,
		runRuntimeCapabilityPolicy: true,
		runFullActivationOnlyRegistrations: false
	};
	if (params.shouldLoadModules && !params.validateOnly && shouldLoadChannelPluginInSetupRuntime({
		manifestChannels: params.manifestRecord.channels,
		setupSource: params.manifestRecord.setupSource,
		cfg: params.cfg,
		env: params.env,
		channelPluginLoadIntent: params.channelPluginLoadIntent
	})) return {
		mode: "setup-runtime",
		loadSetupEntry: true,
		loadSetupRuntimeEntry: true,
		runRuntimeCapabilityPolicy: false,
		runFullActivationOnlyRegistrations: false
	};
	const mode = params.shouldActivate ? "full" : "discovery";
	return {
		mode,
		loadSetupEntry: false,
		loadSetupRuntimeEntry: false,
		runRuntimeCapabilityPolicy: true,
		runFullActivationOnlyRegistrations: mode === "full"
	};
}
//#endregion
//#region src/plugins/loader-runtime-candidate.ts
function loadRuntimePluginCandidate(params) {
	const { candidate, manifestRecord, context, state } = params;
	const { registry } = params.registryBuilder;
	const pluginId = manifestRecord.id;
	const policyId = normalizePluginPolicyId(pluginId);
	if (!matchesScopedPluginOrDreamingSidecar({
		onlyPluginIdSet: params.onlyPluginIdSet,
		pluginId,
		sidecar: params.dreamingSidecar
	})) return;
	const isDreamingSidecar = isAuthorizedDreamingSidecarPlugin({
		sidecar: params.dreamingSidecar,
		pluginId
	});
	const activationState = isDreamingSidecar ? {
		enabled: true,
		activated: true,
		explicitlyEnabled: false,
		source: "auto",
		reason: `dreaming sidecar for selected memory slot "${params.dreamingSidecar?.selectedMemoryPluginId ?? ""}"`
	} : resolveEffectivePluginActivationState({
		id: pluginId,
		origin: candidate.origin,
		config: context.normalized,
		rootConfig: context.cfg,
		enabledByDefault: isPluginEnabledByDefaultForPlatform(manifestRecord),
		channelIds: manifestRecord.channels,
		activationSource: context.activationSource,
		autoEnabledReason: formatAutoEnabledActivationReason(context.autoEnabledReasons[pluginId])
	});
	const existingOrigin = state.seenIds.get(pluginId);
	if (existingOrigin) {
		const duplicate = createManifestPluginRecord({
			candidate,
			manifestRecord,
			enabled: false,
			activationState
		});
		duplicate.status = "disabled";
		duplicate.error = `overridden by ${existingOrigin} plugin`;
		markPluginActivationDisabled(duplicate, duplicate.error);
		registry.plugins.push(duplicate);
		return;
	}
	const enableState = isDreamingSidecar ? { enabled: true } : resolveEffectiveEnableState({
		id: pluginId,
		origin: candidate.origin,
		config: context.normalized,
		rootConfig: context.cfg,
		enabledByDefault: isPluginEnabledByDefaultForPlatform(manifestRecord),
		channelIds: manifestRecord.channels,
		activationSource: context.activationSource
	});
	const entry = context.normalized.entries[policyId];
	const record = createManifestPluginRecord({
		candidate,
		manifestRecord,
		enabled: enableState.enabled,
		activationState
	});
	applyPluginManifestRecordDetails(record, manifestRecord);
	const pluginRoot = safeRealpathOrResolve(candidate.rootDir);
	const degradedPluginForId = findActiveDegradedPlugin(pluginId);
	const degradedPlugin = degradedPluginForId && degradedPluginMatchesRoot(degradedPluginForId, pluginRoot) ? degradedPluginForId : void 0;
	const clearMismatchedQuarantineAfterLoad = enableState.enabled && Boolean(degradedPluginForId) && !degradedPlugin;
	if (enableState.enabled && degradedPlugin) {
		recordPluginConfiguredUnavailable({
			registry,
			record,
			seenIds: state.seenIds,
			origin: candidate.origin,
			degradedPlugin
		});
		return;
	}
	const trustedLocalScopedChannelSetupImport = resolveManifestOwnerBasePolicyBlock({
		plugin: { id: pluginId },
		normalizedConfig: context.normalized
	}) === null && (hasExplicitManifestOwnerTrust({
		plugin: { id: pluginId },
		normalizedConfig: context.normalized
	}) || candidate.origin === "workspace" && activationState.source === "auto");
	const blockUntrustedLocalScopedChannelSetupImport = context.includeSetupOnlyChannelPlugins && !params.validateOnly && Boolean(params.onlyPluginIdSet) && manifestRecord.channels.length > 0 && candidate.origin !== "bundled" && !trustedLocalScopedChannelSetupImport;
	const pushPluginLoadError = (message) => pushPluginValidationError({
		registry,
		seenIds: state.seenIds,
		pluginId,
		origin: candidate.origin,
		record,
		message
	});
	const missingDependencyHint = resolveExternalPluginRuntimeDependencyRepairHint({
		pluginId,
		packageName: candidate.packageName,
		packageBuild: candidate.packageManifest?.build
	});
	if (blockUntrustedLocalScopedChannelSetupImport) {
		record.status = "disabled";
		record.error = activationState.reason ?? enableState.reason ?? "local plugin requires explicit trust for setup";
		markPluginActivationDisabled(record, record.error);
		registry.plugins.push(record);
		return;
	}
	const preferBuiltPluginArtifacts = prefersBuiltPluginArtifacts(context.artifactPreference, candidate.origin);
	const runtimeCandidateEntry = resolvePluginRuntimeArtifact({
		pluginId,
		entryKind: "runtime",
		source: candidate.source,
		rootDir: pluginRoot,
		origin: candidate.origin,
		preferBuiltPluginArtifacts,
		sourcePreferred: manifestRecord.sourcePreferred,
		packageManifest: candidate.packageManifest,
		registry
	});
	const runtimeSetupEntry = manifestRecord.setupSource ? resolvePluginRuntimeArtifact({
		pluginId,
		entryKind: "setup",
		source: manifestRecord.setupSource,
		rootDir: pluginRoot,
		origin: candidate.origin,
		preferBuiltPluginArtifacts,
		sourcePreferred: manifestRecord.sourcePreferred,
		packageManifest: candidate.packageManifest,
		registry
	}) : void 0;
	const scopedSetupOnlyChannelPluginRequested = context.includeSetupOnlyChannelPlugins && !params.validateOnly && Boolean(params.onlyPluginIdSet) && manifestRecord.channels.length > 0 && (!enableState.enabled || context.forceSetupOnlyChannelPlugins);
	const registrationPlan = resolvePluginRegistrationPlan({
		canLoadScopedSetupOnlyChannelPlugin: scopedSetupOnlyChannelPluginRequested && (candidate.origin !== "workspace" || enableState.enabled) && (!context.requireSetupEntryForSetupOnlyChannelPlugins || Boolean(manifestRecord.setupSource)),
		scopedSetupOnlyChannelPluginRequested,
		requireSetupEntryForSetupOnlyChannelPlugins: context.requireSetupEntryForSetupOnlyChannelPlugins,
		enableStateEnabled: enableState.enabled,
		shouldLoadModules: context.shouldLoadModules,
		validateOnly: params.validateOnly,
		shouldActivate: context.shouldActivate,
		manifestRecord,
		cfg: context.cfg,
		env: context.env,
		channelPluginLoadIntent: context.channelPluginLoadIntent,
		toolDiscovery: params.options.toolDiscovery === true
	});
	if (!registrationPlan) {
		record.status = "disabled";
		record.error = enableState.reason;
		markPluginActivationDisabled(record, enableState.reason);
		registry.plugins.push(record);
		state.seenIds.set(pluginId, candidate.origin);
		return;
	}
	if (!enableState.enabled) {
		record.status = "disabled";
		record.error = enableState.reason;
		markPluginActivationDisabled(record, enableState.reason);
	}
	if (record.format === "bundle") {
		recordBundleDiagnostics({
			record,
			registry
		});
		state.seenIds.set(pluginId, candidate.origin);
		return;
	}
	const memorySlot = context.normalized.slots.memory;
	if (registrationPlan.runRuntimeCapabilityPolicy && candidate.origin === "bundled" && hasKind(manifestRecord.kind, "memory") && !isDreamingSidecar) {
		const earlyMemoryDecision = resolveMemorySlotDecision({
			id: record.id,
			kind: manifestRecord.kind,
			slot: memorySlot,
			selectedId: state.selectedMemoryPluginId
		});
		if (!earlyMemoryDecision.enabled) {
			record.enabled = false;
			record.status = "disabled";
			record.error = earlyMemoryDecision.reason;
			markPluginActivationDisabled(record, earlyMemoryDecision.reason);
			registry.plugins.push(record);
			state.seenIds.set(pluginId, candidate.origin);
			return;
		}
	}
	if (!manifestRecord.configSchema) {
		pushPluginLoadError("missing config schema");
		return;
	}
	if (!context.shouldLoadModules && registrationPlan.runRuntimeCapabilityPolicy) {
		const memoryDecision = resolveMemorySlotDecision({
			id: record.id,
			kind: record.kind,
			slot: memorySlot,
			selectedId: state.selectedMemoryPluginId
		});
		if (!memoryDecision.enabled && !isDreamingSidecar) {
			record.enabled = false;
			record.status = "disabled";
			record.error = memoryDecision.reason;
			markPluginActivationDisabled(record, memoryDecision.reason);
			registry.plugins.push(record);
			state.seenIds.set(pluginId, candidate.origin);
			return;
		}
		if (memoryDecision.selected && hasKind(record.kind, "memory")) {
			state.selectedMemoryPluginId = record.id;
			state.memorySlotMatched = true;
			record.memorySlotSelected = true;
		}
	}
	const validatedConfig = validatePluginConfig({
		origin: candidate.origin,
		schema: manifestRecord.configSchema,
		cacheKey: manifestRecord.schemaCacheKey,
		value: entry?.config,
		sourceValue: manifestRecord.configContracts?.secretInputs ? context.activationSource.plugins.entries[policyId]?.config : void 0
	});
	if (!validatedConfig.ok) {
		params.logger.error(`[plugins] ${record.id} invalid config: ${validatedConfig.error.join(", ")}`);
		pushPluginLoadError(`invalid config: ${validatedConfig.error.join(", ")}`);
		return;
	}
	if (!context.shouldLoadModules) {
		applyManifestSnapshotMetadata(record, manifestRecord);
		registry.plugins.push(record);
		state.seenIds.set(pluginId, candidate.origin);
		return;
	}
	const loadEntry = registrationPlan.loadSetupEntry && runtimeSetupEntry ? runtimeSetupEntry : runtimeCandidateEntry;
	const moduleLoadSource = resolveCanonicalDistRuntimeSource(loadEntry.source);
	const moduleRoot = resolveCanonicalDistRuntimeSource(loadEntry.rootDir);
	const rejectHardlinks = shouldRejectHardlinkedPluginFiles({
		origin: candidate.origin,
		rootDir: candidate.rootDir,
		env: context.env
	});
	const opened = openRootFileSync({
		absolutePath: moduleLoadSource,
		rootPath: moduleRoot,
		boundaryLabel: "plugin root",
		rejectHardlinks,
		skipLexicalRootCheck: true
	});
	if (!opened.ok) {
		pushPluginLoadError(describeRootFileOpenFailure({
			failure: opened,
			subject: "plugin entry path",
			boundaryLabel: "plugin root",
			filePath: moduleLoadSource
		}));
		return;
	}
	const safeSource = opened.path;
	fs.closeSync(opened.fd);
	let mod = null;
	let moduleLoadMs;
	let moduleLoadFailed = false;
	const beforeModuleLoad = performance.now();
	try {
		recordImportedPluginId(record.id);
		state.pluginLoadAttemptCount++;
		params.logger.debug?.(`[plugins] loading ${record.id} from ${safeSource}`);
		mod = withProfile({
			pluginId: record.id,
			source: safeSource
		}, registrationPlan.mode, () => params.loadPluginModule(safeSource));
	} catch (error) {
		recordPluginError({
			logger: params.logger,
			registry,
			record,
			seenIds: state.seenIds,
			pluginId,
			origin: candidate.origin,
			phase: "load",
			error,
			logPrefix: `[plugins] ${record.id} failed to load from ${record.source}: `,
			diagnosticMessagePrefix: "failed to load plugin: ",
			missingDependencyHint
		});
		moduleLoadFailed = true;
		return;
	} finally {
		moduleLoadMs = performance.now() - beforeModuleLoad;
		detailPluginStartupTrace(params.options.startupTrace, record.id, [["loadMs", moduleLoadMs], ["loadFailedCount", moduleLoadFailed ? 1 : 0]]);
	}
	if (loadSetupRuntimeChannelCandidate({
		mod,
		manifestRecord,
		record,
		registrationPlan,
		runtimeCandidateEntry,
		safeSource,
		rejectHardlinks,
		loadPluginModule: params.loadPluginModule,
		registryBuilder: params.registryBuilder,
		cfg: context.cfg,
		entry,
		seenIds: state.seenIds,
		candidateOrigin: candidate.origin,
		logger: params.logger,
		pushPluginLoadError
	})) return;
	const { definition, register } = resolvePluginModuleExport(mod);
	if (definition?.id && definition.id !== record.id) {
		pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", export uses "${definition.id}")`);
		return;
	}
	record.name = definition?.name ?? record.name;
	record.description = definition?.description ?? record.description;
	record.version = definition?.version ?? record.version;
	const manifestKind = record.kind;
	const exportKind = definition?.kind;
	if (manifestKind && exportKind && !kindsEqual(manifestKind, exportKind)) registry.diagnostics.push({
		level: "warn",
		pluginId: record.id,
		source: record.source,
		message: `plugin kind mismatch (manifest uses "${String(manifestKind)}", export uses "${String(exportKind)}")`
	});
	record.kind = definition?.kind ?? record.kind;
	if (hasKind(record.kind, "memory") && memorySlot === record.id) state.memorySlotMatched = true;
	if (registrationPlan.runRuntimeCapabilityPolicy && !isDreamingSidecar) {
		const memoryDecision = resolveMemorySlotDecision({
			id: record.id,
			kind: record.kind,
			slot: memorySlot,
			selectedId: state.selectedMemoryPluginId
		});
		if (!memoryDecision.enabled) {
			record.enabled = false;
			record.status = "disabled";
			record.error = memoryDecision.reason;
			markPluginActivationDisabled(record, memoryDecision.reason);
			registry.plugins.push(record);
			state.seenIds.set(pluginId, candidate.origin);
			return;
		}
		if (memoryDecision.selected && hasKind(record.kind, "memory")) {
			state.selectedMemoryPluginId = record.id;
			record.memorySlotSelected = true;
		}
	}
	if (params.validateOnly) {
		registry.plugins.push(record);
		state.seenIds.set(pluginId, candidate.origin);
		return;
	}
	if (typeof register !== "function") {
		const wrongLoaderError = formatBundledChannelWrongLoaderError(record.kind);
		if (wrongLoaderError) {
			params.logger.error(`[plugins] ${record.id} ${wrongLoaderError}; ensure plugin is loaded via bundled channel discovery, not legacy plugin loader`);
			pushPluginLoadError(wrongLoaderError);
		} else {
			params.logger.error(`[plugins] ${record.id} missing register/activate export`);
			pushPluginLoadError(formatMissingPluginRegisterError(mod, context.env));
		}
		return;
	}
	for (const nodeHostCommand of definition?.nodeHostCommands ?? []) params.registryBuilder.registerNodeHostCommand(record, nodeHostCommand);
	if (registrationPlan.runFullActivationOnlyRegistrations) {
		if (definition?.reload) params.registryBuilder.registerReload(record, definition.reload);
		for (const collector of definition?.securityAuditCollectors ?? []) params.registryBuilder.registerSecurityAuditCollector(record, collector);
	}
	const api = params.registryBuilder.createApi(record, {
		config: context.cfg,
		pluginConfig: validatedConfig.value,
		hookPolicy: entry?.hooks,
		registrationMode: registrationPlan.mode
	});
	const beforeRegister = performance.now();
	let registerFailed = false;
	try {
		withProfile({
			pluginId: record.id,
			source: record.source
		}, `${registrationPlan.mode}:register`, () => runPluginRegisterSyncInRegistry(register, api, registry, record.id));
		if (registrationPlan.runRuntimeCapabilityPolicy) registerPluginDashboardCapabilities({
			record,
			registry
		});
		registry.plugins.push(record);
		state.seenIds.set(pluginId, candidate.origin);
		if (clearMismatchedQuarantineAfterLoad) clearActiveDegradedPlugin(pluginId);
	} catch (error) {
		params.registryBuilder.rollbackPluginGlobalSideEffects(record.id, record);
		recordPluginError({
			logger: params.logger,
			registry,
			record,
			seenIds: state.seenIds,
			pluginId,
			origin: candidate.origin,
			phase: "register",
			error,
			logPrefix: `[plugins] ${record.id} failed during register from ${record.source}: `,
			diagnosticMessagePrefix: "plugin failed during register: ",
			missingDependencyHint,
			...error instanceof PluginDashboardDeclarationError ? { diagnosticCode: "dashboard-declaration-invalid" } : {}
		});
		registerFailed = true;
	} finally {
		const registerMs = performance.now() - beforeRegister;
		detailPluginStartupTrace(params.options.startupTrace, record.id, [
			["registerMs", registerMs],
			["loadAndRegisterMs", moduleLoadMs + registerMs],
			["registerFailedCount", registerFailed ? 1 : 0]
		]);
	}
}
function recordBundleDiagnostics(params) {
	const unsupportedCapabilities = (params.record.bundleCapabilities ?? []).filter((capability) => !params.record.bundleFormat || !isBundleCapabilitySupported(params.record.bundleFormat, capability));
	for (const capability of unsupportedCapabilities) params.registry.diagnostics.push({
		level: "warn",
		pluginId: params.record.id,
		source: params.record.source,
		message: `bundle capability detected but not wired into OpenClaw yet: ${capability}`
	});
	if (params.record.enabled && params.record.rootDir && params.record.bundleFormat && (params.record.bundleCapabilities ?? []).includes("mcpServers")) {
		const runtimeSupport = inspectBundleMcpRuntimeSupport({
			pluginId: params.record.id,
			rootDir: params.record.rootDir,
			bundleFormat: params.record.bundleFormat
		});
		for (const message of runtimeSupport.diagnostics) params.registry.diagnostics.push({
			level: "warn",
			pluginId: params.record.id,
			source: params.record.source,
			message
		});
		if (runtimeSupport.unsupportedServerNames.length > 0) params.registry.diagnostics.push({
			level: "warn",
			pluginId: params.record.id,
			source: params.record.source,
			message: `bundle MCP servers use unsupported transports or incomplete configs (${runtimeSupport.unsupportedServerNames.join(", ")})`
		});
	}
	params.registry.plugins.push(params.record);
}
//#endregion
//#region src/plugins/registry-runtime-binding.ts
const PLUGIN_REGISTRY_RUNTIME = Symbol.for("openclaw.pluginRegistryRuntime");
function bindPluginRegistryRuntime(registry, runtime) {
	Object.defineProperty(registry, PLUGIN_REGISTRY_RUNTIME, {
		configurable: false,
		enumerable: false,
		value: runtime,
		writable: false
	});
}
function getPluginRegistryRuntime(registry) {
	return registry[PLUGIN_REGISTRY_RUNTIME];
}
//#endregion
//#region src/plugins/agent-event-emission.ts
const HOST_OWNED_AGENT_EVENT_STREAMS = /* @__PURE__ */ new Set([
	"lifecycle",
	"tool",
	"assistant",
	"error",
	"item",
	"plan",
	"approval",
	"command_output",
	"patch",
	"compaction",
	"thinking",
	"model"
]);
function isPluginOwnedAgentEventStream(pluginId, stream) {
	return stream === pluginId || stream.startsWith(`${pluginId}.`);
}
function normalizePluginEventData(params) {
	if (params.data && typeof params.data === "object" && !Array.isArray(params.data)) return {
		...params.data,
		pluginId: params.pluginId,
		...params.pluginName ? { pluginName: params.pluginName } : {}
	};
	return {
		value: params.data,
		pluginId: params.pluginId,
		...params.pluginName ? { pluginName: params.pluginName } : {}
	};
}
function emitPluginAgentEvent(params) {
	const runId = normalizeOptionalString(params.event.runId);
	const sessionKey = normalizeOptionalString(params.event.sessionKey);
	const stream = normalizeOptionalString(params.event.stream);
	if (!runId || !stream) return {
		emitted: false,
		reason: "runId and stream are required"
	};
	if (!isPluginJsonValue(params.event.data)) return {
		emitted: false,
		reason: "event data must be JSON-compatible"
	};
	if (params.origin !== "bundled" && HOST_OWNED_AGENT_EVENT_STREAMS.has(stream)) return {
		emitted: false,
		reason: `stream ${stream} is reserved for bundled plugins`
	};
	if (params.origin !== "bundled" && !isPluginOwnedAgentEventStream(params.pluginId, stream)) return {
		emitted: false,
		reason: `stream ${stream} must be scoped to plugin ${params.pluginId}`
	};
	if (hasInvalidLifecycleStartTimestamp(stream, params.event.data)) return {
		emitted: false,
		reason: "lifecycle start requires a finite startedAt timestamp"
	};
	emitAgentEvent({
		runId,
		stream,
		...sessionKey ? { sessionKey } : {},
		data: normalizePluginEventData({
			pluginId: params.pluginId,
			pluginName: params.pluginName,
			data: params.event.data
		})
	});
	return {
		emitted: true,
		stream
	};
}
//#endregion
//#region src/cron/service/list-page-validation.ts
function isSafeNonNegativeInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function readCanonicalCronListPage(value, maxLimit) {
	if (!isRecord(value) || !Array.isArray(value.jobs)) throw new Error("cron.list returned an invalid inventory page");
	const page = value;
	const jobs = value.jobs;
	const limit = typeof page.limit === "number" ? page.limit : 0;
	if (typeof page.snapshotRevision !== "string" || page.snapshotRevision.length === 0 || !isSafeNonNegativeInteger(page.total) || !isSafeNonNegativeInteger(page.offset) || !Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit || jobs.length > limit || typeof page.hasMore !== "boolean" || page.nextOffset !== null && !isSafeNonNegativeInteger(page.nextOffset)) throw new Error("cron.list returned an invalid inventory page");
	return page;
}
function resolveCronListPageNextOffset(page, requestedOffset) {
	const nextOffset = requestedOffset + page.jobs.length;
	if (page.offset !== requestedOffset || !Number.isSafeInteger(nextOffset) || nextOffset > page.total || (page.hasMore ? page.nextOffset !== nextOffset || nextOffset <= requestedOffset || nextOffset >= page.total : page.nextOffset !== null || nextOffset !== page.total)) throw new Error("cron.list returned an invalid inventory page");
	return page.hasMore ? nextOffset : null;
}
//#endregion
//#region src/plugins/host-hook-scheduled-turns.ts
const log = createSubsystemLogger("plugins/host-scheduled-turns");
const PLUGIN_CRON_NAME_PREFIX = "plugin:";
const PLUGIN_CRON_TAG_MARKER = ":tag:";
const PLUGIN_CRON_CLEANUP_PAGE_SIZE = 200;
const PLUGIN_CRON_CLEANUP_MAX_PAGES = 50;
const PLUGIN_CRON_CLEANUP_MAX_SNAPSHOT_RESTARTS = 3;
function resolveSchedule(params) {
	const cron = normalizeOptionalString(params.cron);
	if (cron) {
		const tz = normalizeOptionalString(params.tz);
		return {
			kind: "cron",
			expr: cron,
			...tz ? { tz } : {}
		};
	}
	if ("delayMs" in params) {
		if (!Number.isFinite(params.delayMs) || params.delayMs < 0) return;
		const timestamp = resolveExpiresAtMsFromDurationMs(Math.max(1, Math.floor(params.delayMs)));
		const at = timestampMsToIsoString(timestamp);
		if (!at) return;
		return {
			kind: "at",
			at
		};
	}
	const rawAt = params.at;
	const at = rawAt instanceof Date ? rawAt : new Date(rawAt);
	if (!Number.isFinite(at.getTime())) return;
	return {
		kind: "at",
		at: at.toISOString()
	};
}
function resolveSessionEventDeliveryMode(deliveryMode) {
	if (deliveryMode === void 0) return;
	if (deliveryMode === "none" || deliveryMode === "announce") return deliveryMode;
}
function formatScheduleLogContext(params) {
	const parts = [`pluginId=${params.pluginId}`];
	if (params.sessionKey) parts.push(`sessionKey=${params.sessionKey}`);
	if (params.name) parts.push(`name=${params.name}`);
	if (params.jobId) parts.push(`jobId=${params.jobId}`);
	return parts.join(" ");
}
async function removeScheduledSessionTurn(params) {
	try {
		return didCronCleanupJob(await params.cron.remove(params.jobId));
	} catch (error) {
		log.warn(`plugin session turn cleanup failed (${formatScheduleLogContext(params)}): ${formatErrorMessage(error)}`);
		return false;
	}
}
function didCronRemoveJob(value) {
	return isCronRemoveResult(value) && value.ok && value.removed;
}
function didCronCleanupJob(value) {
	return isCronRemoveResult(value) && value.ok;
}
const PLUGIN_CRON_RESERVED_DELIMITER = ":";
function resolvePluginSessionTurnTag(value) {
	const tag = normalizeOptionalString(value);
	if (!tag) return { invalid: false };
	if (tag.includes(PLUGIN_CRON_RESERVED_DELIMITER)) return { invalid: true };
	return {
		tag,
		invalid: false
	};
}
function buildPluginSchedulerCronName(params) {
	const uniqueId = params.uniqueId ?? randomUUID();
	if (!params.tag) return `${PLUGIN_CRON_NAME_PREFIX}${params.pluginId}:${params.sessionKey}:${uniqueId}`;
	return `${PLUGIN_CRON_NAME_PREFIX}${params.pluginId}${PLUGIN_CRON_TAG_MARKER}${params.tag}:${params.sessionKey}:${uniqueId}`;
}
function buildPluginSchedulerTagPrefix(params) {
	return `${PLUGIN_CRON_NAME_PREFIX}${params.pluginId}${PLUGIN_CRON_TAG_MARKER}${params.tag}:${params.sessionKey}:`;
}
function isCronRemoveResult(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof value.ok === "boolean" && typeof value.removed === "boolean";
}
async function listAllCronJobsForPluginTagCleanup(cron, query) {
	for (let restart = 0; restart <= PLUGIN_CRON_CLEANUP_MAX_SNAPSHOT_RESTARTS; restart += 1) {
		const jobs = [];
		let offset = 0;
		let snapshotRevision;
		let total;
		let snapshotChanged = false;
		for (let pageNumber = 0; pageNumber < PLUGIN_CRON_CLEANUP_MAX_PAGES; pageNumber += 1) {
			const page = readCanonicalCronListPage(await cron.listPage({
				includeDisabled: true,
				limit: PLUGIN_CRON_CLEANUP_PAGE_SIZE,
				offset,
				query,
				sortBy: "name",
				sortDir: "asc"
			}), PLUGIN_CRON_CLEANUP_PAGE_SIZE);
			if (snapshotRevision !== void 0 && page.snapshotRevision !== snapshotRevision || total !== void 0 && page.total !== total) {
				snapshotChanged = true;
				break;
			}
			snapshotRevision ??= page.snapshotRevision;
			total ??= page.total;
			const nextOffset = resolveCronListPageNextOffset(page, offset);
			jobs.push(...page.jobs);
			if (nextOffset === null) return jobs;
			offset = nextOffset;
		}
		if (!snapshotChanged) throw new Error("cron.list pagination exceeded maximum pages");
		if (restart === PLUGIN_CRON_CLEANUP_MAX_SNAPSHOT_RESTARTS) throw new Error("cron.list inventory changed repeatedly during cleanup");
	}
	throw new Error("cron.list inventory changed repeatedly during cleanup");
}
async function schedulePluginSessionTurn(params) {
	if (params.origin !== "bundled") return;
	const sessionKey = normalizeOptionalString(params.schedule.sessionKey);
	const message = normalizeOptionalString(params.schedule.message);
	if (!sessionKey || !message) return;
	const cronSchedule = resolveSchedule(params.schedule);
	if (!cronSchedule) return;
	const rawDeliveryMode = params.schedule.deliveryMode;
	const deliveryMode = resolveSessionEventDeliveryMode(rawDeliveryMode);
	const scheduleName = normalizeOptionalString(params.schedule.name);
	if (rawDeliveryMode !== void 0 && !deliveryMode) {
		log.warn(`plugin session turn scheduling failed (${formatScheduleLogContext({
			pluginId: params.pluginId,
			sessionKey,
			...scheduleName ? { name: scheduleName } : {}
		})}): unsupported deliveryMode`);
		return;
	}
	if (cronSchedule.kind === "cron" && params.schedule.deleteAfterRun === true) {
		log.warn(`plugin session turn scheduling failed (${formatScheduleLogContext({
			pluginId: params.pluginId,
			sessionKey,
			...scheduleName ? { name: scheduleName } : {}
		})}): deleteAfterRun requires a one-shot schedule`);
		return;
	}
	const { tag, invalid: invalidTag } = resolvePluginSessionTurnTag(params.schedule.tag);
	if (invalidTag) {
		log.warn(`plugin session turn scheduling failed (${formatScheduleLogContext({
			pluginId: params.pluginId,
			sessionKey,
			...scheduleName ? { name: scheduleName } : {}
		})}): tag contains reserved delimiter ":"`);
		return;
	}
	const cronDeliveryMode = deliveryMode ?? "announce";
	if (params.shouldCommit && !params.shouldCommit()) return;
	if (!params.cron) {
		log.warn(`plugin session turn scheduling failed (${formatScheduleLogContext({
			pluginId: params.pluginId,
			sessionKey,
			...scheduleName ? { name: scheduleName } : {}
		})}): cron service unavailable`);
		return;
	}
	const cron = params.cron;
	const cronJobName = buildPluginSchedulerCronName({
		pluginId: params.pluginId,
		sessionKey,
		...tag !== void 0 ? { tag } : {},
		...scheduleName ? { uniqueId: scheduleName } : {}
	});
	const cronPayload = {
		kind: "agentTurn",
		message
	};
	let result;
	try {
		result = await cron.add({
			name: cronJobName,
			enabled: true,
			schedule: cronSchedule,
			sessionTarget: `session:${sessionKey}`,
			payload: cronPayload,
			...params.schedule.agentId ? { agentId: params.schedule.agentId } : {},
			deleteAfterRun: params.schedule.deleteAfterRun ?? cronSchedule.kind === "at",
			wakeMode: "now",
			delivery: {
				mode: cronDeliveryMode,
				...cronDeliveryMode === "announce" ? { channel: "last" } : {}
			}
		});
	} catch (error) {
		log.warn(`plugin session turn scheduling failed (${formatScheduleLogContext({
			pluginId: params.pluginId,
			sessionKey,
			name: cronJobName
		})}): ${formatErrorMessage(error)}`);
		return;
	}
	const jobId = result.id;
	if (!jobId) return;
	if (params.shouldCommit && !params.shouldCommit()) {
		if (!await removeScheduledSessionTurn({
			cron,
			jobId,
			pluginId: params.pluginId,
			sessionKey,
			name: cronJobName
		})) log.warn(`plugin session turn scheduling rollback failed (${formatScheduleLogContext({
			pluginId: params.pluginId,
			sessionKey,
			name: cronJobName,
			jobId
		})}): failed to remove stale scheduled session turn`);
		return;
	}
	return registerPluginSessionSchedulerJob({
		pluginId: params.pluginId,
		pluginName: params.pluginName,
		ownerRegistry: params.ownerRegistry,
		job: {
			id: jobId,
			sessionKey,
			kind: "session-turn",
			cleanup: async () => {
				if (!await removeScheduledSessionTurn({
					cron,
					jobId,
					pluginId: params.pluginId,
					sessionKey,
					name: cronJobName
				})) throw new Error(`failed to remove scheduled session turn: ${jobId}`);
			}
		}
	});
}
async function unschedulePluginSessionTurnsByTag(params) {
	if (params.origin !== "bundled") return {
		removed: 0,
		failed: 0
	};
	const sessionKey = normalizeOptionalString(params.request.sessionKey);
	const { tag, invalid: invalidTag } = resolvePluginSessionTurnTag(params.request.tag);
	if (!sessionKey || !tag || invalidTag) return {
		removed: 0,
		failed: 0
	};
	if (!params.cron) {
		log.warn("plugin session turn untag-list failed: cron service unavailable");
		return {
			removed: 0,
			failed: 1
		};
	}
	const cron = params.cron;
	const namePrefix = buildPluginSchedulerTagPrefix({
		pluginId: params.pluginId,
		tag,
		sessionKey
	});
	let jobs;
	try {
		jobs = await listAllCronJobsForPluginTagCleanup(cron, namePrefix);
	} catch (error) {
		log.warn(`plugin session turn untag-list failed: ${formatErrorMessage(error)}`);
		return {
			removed: 0,
			failed: 1
		};
	}
	const candidates = jobs.filter((job) => {
		return job.name.startsWith(namePrefix) && job.sessionTarget === `session:${sessionKey}`;
	});
	let removed = 0;
	let failed = 0;
	for (const job of candidates) {
		const id = job.id.trim();
		if (!id) continue;
		try {
			if (didCronRemoveJob(await cron.remove(id))) {
				removed += 1;
				deletePluginSessionSchedulerJob({
					pluginId: params.pluginId,
					jobId: id,
					sessionKey
				});
			} else failed += 1;
		} catch (error) {
			log.warn(`plugin session turn untag-remove failed: id=${id} error=${formatErrorMessage(error)}`);
			failed += 1;
		}
	}
	return {
		removed,
		failed
	};
}
//#endregion
//#region src/plugins/model-catalog-registration.ts
function mergeCatalogHookResults(source, left, right) {
	const rows = [...left ?? [], ...right ?? []];
	if (rows.length === 0) return null;
	const mergedRows = [];
	for (const row of rows) mergedRows.push({
		...row,
		source
	});
	return mergedRows;
}
function mergeModelCatalogHooks(source, left, right) {
	if (!left) return right;
	if (!right) return left;
	return async (ctx) => {
		const [leftRows, rightRows] = await Promise.all([left(ctx), right(ctx)]);
		return mergeCatalogHookResults(source, leftRows, rightRows);
	};
}
/** Creates handlers that register plugin model catalog providers into a registry. */
function createModelCatalogRegistrationHandlers(params) {
	const registerModelCatalogProvider = (record, provider) => {
		const providerId = normalizeOptionalString(provider.provider) ?? "";
		if (!providerId) {
			params.pushDiagnostic({
				level: "error",
				pluginId: record.id,
				source: record.source,
				message: "model catalog provider registration missing provider"
			});
			return;
		}
		if (!provider.kinds || provider.kinds.length === 0) {
			params.pushDiagnostic({
				level: "error",
				pluginId: record.id,
				source: record.source,
				message: `model catalog provider "${providerId}" registration missing kinds`
			});
			return;
		}
		const existing = params.registry.modelCatalogProviders.find((entry) => entry.provider.provider === providerId && entry.pluginId !== record.id);
		if (existing) {
			params.pushDiagnostic({
				level: "error",
				pluginId: record.id,
				source: record.source,
				message: `model catalog provider already registered: ${providerId} (${existing.pluginId})`
			});
			return;
		}
		const normalizedKinds = uniqueValues(provider.kinds);
		const samePluginOverlapping = params.registry.modelCatalogProviders.find((entry) => entry.provider.provider === providerId && entry.pluginId === record.id && entry.provider.kinds.some((kind) => normalizedKinds.includes(kind)));
		if (samePluginOverlapping) {
			samePluginOverlapping.provider = {
				...samePluginOverlapping.provider,
				...provider,
				provider: providerId,
				kinds: uniqueValues([...samePluginOverlapping.provider.kinds, ...normalizedKinds]),
				staticCatalog: mergeModelCatalogHooks("static", samePluginOverlapping.provider.staticCatalog, provider.staticCatalog),
				liveCatalog: mergeModelCatalogHooks("live", samePluginOverlapping.provider.liveCatalog, provider.liveCatalog)
			};
			return;
		}
		params.registry.modelCatalogProviders.push({
			pluginId: record.id,
			pluginName: record.name,
			provider: {
				...provider,
				provider: providerId,
				kinds: normalizedKinds
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	return { registerModelCatalogProvider };
}
//#endregion
//#region src/plugins/registry-state.ts
/** Decode the public mode once so domain registrars do not repeat string checks. */
function resolvePluginRegistrationCapabilities(mode) {
	return {
		capabilityHandlers: mode === "full" || mode === "discovery" || mode === "tool-discovery",
		setupRuntimeHandlers: mode === "setup-runtime",
		runtimeChannel: mode !== "setup-only" && mode !== "tool-discovery"
	};
}
function normalizeHookTimeoutMs(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
	return Math.floor(value);
}
function resolveTypedHookTimeoutMs(params) {
	return normalizeHookTimeoutMs(params.policy?.timeouts?.[params.hookName]) ?? normalizeHookTimeoutMs(params.policy?.timeoutMs) ?? normalizeHookTimeoutMs(params.opts?.timeoutMs);
}
function createPluginRegistryState(registryParams) {
	const registry = createEmptyPluginRegistry();
	bindPluginRegistryRuntime(registry, registryParams.runtime);
	const coreGatewayMethods = new Set(registryParams.coreGatewayMethodNames);
	for (const name of Object.keys(registryParams.coreGatewayHandlers ?? {})) coreGatewayMethods.add(name);
	registry.coreGatewayMethodNames = Array.from(coreGatewayMethods).sort();
	const pushDiagnostic = (diagnostic) => {
		registry.diagnostics.push(diagnostic);
	};
	const reportRegistrationError = (record, message) => {
		pushDiagnostic({
			level: "error",
			pluginId: record.id,
			source: record.source,
			message
		});
	};
	const reportRegistrationWarning = (record, message) => {
		pushDiagnostic({
			level: "warn",
			pluginId: record.id,
			source: record.source,
			message
		});
	};
	const modelCatalogRegistrars = createModelCatalogRegistrationHandlers({
		registry,
		pushDiagnostic
	});
	return {
		registry,
		registryParams,
		allowProcessHomeSessionCatalogs: registryParams.allowProcessHomeSessionCatalogs ?? true,
		coreGatewayMethods,
		getHostCronService: () => registryParams.hostServices?.cron,
		pluginsWithChannelRegistrationConflict: /* @__PURE__ */ new Set(),
		pluginSideEffectGuards: /* @__PURE__ */ new Map(),
		pushDiagnostic,
		reportRegistrationError,
		reportRegistrationWarning,
		...modelCatalogRegistrars
	};
}
//#endregion
//#region src/plugins/registry-api.ts
const loadAttachments = createLazyRuntimeModule(() => import("./host-hook-attachments-rCixAz4o.js"));
const loadHookState = createLazyRuntimeModule(() => import("./host-hook-state-CVIOsHlu.js"));
function normalizeLogger(logger) {
	return {
		info: logger.info,
		warn: logger.warn,
		error: logger.error,
		debug: logger.debug
	};
}
function resolvePluginPath(input, rootDir) {
	const trimmed = input.trim();
	if (!trimmed || path.isAbsolute(trimmed) || trimmed.startsWith("~")) return resolveUserPath(input);
	return rootDir ? path.resolve(rootDir, trimmed) : resolveUserPath(input);
}
function createPluginApiFactory(state, registrars, runtimeResolver) {
	const { registry, registryParams, getHostCronService, pluginSideEffectGuards, pushDiagnostic } = state;
	const { registerTool, registerHook, registerHttpRoute, registerHostedMediaResolver, registerMcpServerConnectionResolver, registerProvider, registerWorkerProvider, registerModelCatalogProvider, registerEmbeddingProvider, registerAgentHarness, registerDetachedTaskRuntime, registerSpeechProvider, registerRealtimeTranscriptionProvider, registerRealtimeVoiceProvider, registerMediaUnderstandingProvider, registerTranscriptSourceProvider, registerImageGenerationProvider, registerVideoGenerationProvider, registerMusicGenerationProvider, registerWebFetchProvider, registerWebSearchProvider, registerMigrationProvider, registerGatewayMethod, registerSessionCatalog, registerService, registerGatewayDiscoveryService, registerCliBackend, registerTextTransforms, registerReload, registerNodeHostCommand, registerNodeInvokePolicy, registerWidgetPresenter, registerSecurityAuditCollector, registerInteractiveHandler, registerConversationBindingResolvedHandler, registerCommand, registerContextEngine, registerCompactionProvider, registerCodexAppServerExtensionFactory, registerAgentToolResultMiddleware, registerSessionExtension, registerTrustedToolPolicy, registerToolMetadata, registerControlUiDescriptor, registerBoardWidgetContentKind, registerRuntimeLifecycle, registerAgentEventSubscription, registerSessionSchedulerJob, registerSessionAction, registerTypedHook, registerMemoryCapability, registerMemoryPromptSupplement, registerMemoryPromptPreparation, registerMemoryCorpusSupplement, registerCli, registerChannel } = registrars;
	const { resolvePluginRuntime, resolveRegisteredChannelRuntime, setPluginRuntimeRecord } = runtimeResolver;
	const createPluginSideEffectGuard = (pluginId) => {
		const guard = { active: true };
		const guards = pluginSideEffectGuards.get(pluginId) ?? /* @__PURE__ */ new Set();
		guards.add(guard);
		pluginSideEffectGuards.set(pluginId, guards);
		return guard;
	};
	const deactivatePluginSideEffectGuards = (pluginId) => {
		const guards = pluginSideEffectGuards.get(pluginId);
		if (!guards) return;
		for (const guard of guards) guard.active = false;
		pluginSideEffectGuards.delete(pluginId);
	};
	const createApi = (record, params) => {
		const registrationMode = params.registrationMode ?? "full";
		const registrationCapabilities = resolvePluginRegistrationCapabilities(registrationMode);
		setPluginRuntimeRecord(record);
		const sideEffectGuard = createPluginSideEffectGuard(record.id);
		const isLoadedRecordInRegistry = () => registry.plugins.some((plugin) => plugin.id === record.id && plugin.status === "loaded");
		const isLoadedRecordInLiveRegistry = () => sideEffectGuard.active && isPluginRegistryActivated(registry) && !isPluginRegistryRetired(registry) && isLoadedRecordInRegistry();
		const isActivatingLoadedRecord = () => registryParams.activateGlobalSideEffects !== false && record.enabled && record.status === "loaded" && !registry.plugins.some((plugin) => plugin.id === record.id);
		const shouldCommitWorkflowSideEffect = () => sideEffectGuard.active && !isPluginRegistryRetired(registry) && (isActivatingLoadedRecord() || isPluginRegistryActivated(registry) && isLoadedRecordInRegistry());
		return buildPluginApi({
			id: record.id,
			name: record.name,
			version: record.version,
			description: record.description,
			source: record.source,
			rootDir: record.rootDir,
			registrationMode,
			config: params.config,
			pluginConfig: params.pluginConfig,
			runtime: resolvePluginRuntime(record.id),
			logger: normalizeLogger(registryParams.logger),
			resolvePath: (input) => resolvePluginPath(input, record.rootDir),
			handlers: {
				...registrationCapabilities.capabilityHandlers ? {
					registerTool: (tool, opts) => registerTool(record, tool, opts),
					registerHook: (events, handler, opts) => registerHook(record, events, handler, opts, params.config, params.pluginConfig),
					registerHttpRoute: (routeParams) => registerHttpRoute(record, routeParams),
					registerHostedMediaResolver: (resolver) => registerHostedMediaResolver(record, resolver),
					registerMcpServerConnectionResolver: (resolver) => registerMcpServerConnectionResolver(record, resolver),
					registerProvider: (provider) => registerProvider(record, provider),
					registerWorkerProvider: (provider) => registerWorkerProvider(record, provider),
					registerModelCatalogProvider: (provider) => registerModelCatalogProvider(record, provider),
					registerEmbeddingProvider: (provider) => registerEmbeddingProvider(record, provider),
					registerAgentHarness: (harness, options) => registerAgentHarness(record, harness, options),
					registerDetachedTaskRuntime: (runtime) => registerDetachedTaskRuntime(record, runtime),
					registerSpeechProvider: (provider) => registerSpeechProvider(record, provider),
					registerRealtimeTranscriptionProvider: (provider) => registerRealtimeTranscriptionProvider(record, provider),
					registerRealtimeVoiceProvider: (provider) => registerRealtimeVoiceProvider(record, provider),
					registerMediaUnderstandingProvider: (provider) => registerMediaUnderstandingProvider(record, provider),
					registerTranscriptSourceProvider: (provider) => registerTranscriptSourceProvider(record, provider),
					registerImageGenerationProvider: (provider) => registerImageGenerationProvider(record, provider),
					registerVideoGenerationProvider: (provider) => registerVideoGenerationProvider(record, provider),
					registerMusicGenerationProvider: (provider) => registerMusicGenerationProvider(record, provider),
					registerWebFetchProvider: (provider) => registerWebFetchProvider(record, provider),
					registerWebSearchProvider: (provider) => registerWebSearchProvider(record, provider),
					registerMigrationProvider: (provider) => registerMigrationProvider(record, provider),
					registerGatewayMethod: (method, handler, opts) => registerGatewayMethod(record, method, handler, opts),
					registerSessionCatalog: (provider) => registerSessionCatalog(record, provider),
					registerService: (service) => registerService(record, service),
					registerGatewayDiscoveryService: (service) => registerGatewayDiscoveryService(record, service),
					registerCliBackend: (backend) => registerCliBackend(record, backend),
					registerTextTransforms: (transforms) => registerTextTransforms(record, transforms),
					registerReload: (registration) => registerReload(record, registration),
					registerNodeHostCommand: (command) => registerNodeHostCommand(record, command),
					registerNodeInvokePolicy: (policy) => registerNodeInvokePolicy(record, policy, params.pluginConfig),
					registerWidgetPresenter: (presenter) => registerWidgetPresenter(record, presenter),
					registerSecurityAuditCollector: (collector) => registerSecurityAuditCollector(record, collector),
					registerInteractiveHandler: (registration) => registerInteractiveHandler(record, registration),
					onConversationBindingResolved: (handler) => registerConversationBindingResolvedHandler(record, handler),
					registerCommand: (command) => registerCommand(record, command),
					registerContextEngine: (id, factory) => registerContextEngine(record, id, factory, registrationMode),
					registerCompactionProvider: (provider) => registerCompactionProvider(record, provider),
					registerCodexAppServerExtensionFactory: (factory) => {
						registerCodexAppServerExtensionFactory(record, factory);
					},
					registerAgentToolResultMiddleware: (handler, options) => {
						registerAgentToolResultMiddleware(record, handler, options, params.hookPolicy);
					},
					registerSessionExtension: (extension) => registerSessionExtension(record, extension),
					enqueueNextTurnInjection: async (injection) => {
						if (params.hookPolicy?.allowPromptInjection === false) {
							pushDiagnostic({
								level: "warn",
								pluginId: record.id,
								source: record.source,
								message: `next-turn injection blocked by plugins.entries.${record.id}.hooks.allowPromptInjection=false`
							});
							return {
								enqueued: false,
								id: "",
								sessionKey: injection.sessionKey
							};
						}
						const { enqueuePluginNextTurnInjection } = await loadHookState();
						return enqueuePluginNextTurnInjection({
							cfg: registryParams.runtime.config.current(),
							pluginId: record.id,
							pluginName: record.name,
							injection
						});
					},
					registerTrustedToolPolicy: (policy) => registerTrustedToolPolicy(record, policy),
					registerToolMetadata: (metadata) => registerToolMetadata(record, metadata),
					registerControlUiDescriptor: (descriptor) => registerControlUiDescriptor(record, descriptor),
					registerBoardWidgetContentKind: (definition) => registerBoardWidgetContentKind(record, definition),
					registerRuntimeLifecycle: (lifecycle) => registerRuntimeLifecycle(record, lifecycle),
					registerAgentEventSubscription: (subscription) => registerAgentEventSubscription(record, subscription),
					emitAgentEvent: (event) => {
						if (registryParams.activateGlobalSideEffects === false) return {
							emitted: false,
							reason: "global side effects disabled"
						};
						if (!shouldCommitWorkflowSideEffect()) return {
							emitted: false,
							reason: "plugin is not loaded"
						};
						return emitPluginAgentEvent({
							pluginId: record.id,
							pluginName: record.name,
							origin: record.origin,
							event
						});
					},
					setRunContext: (patch) => registryParams.activateGlobalSideEffects !== false && shouldCommitWorkflowSideEffect() ? setPluginRunContext({
						pluginId: record.id,
						patch
					}) : false,
					getRunContext: (get) => registryParams.activateGlobalSideEffects !== false && shouldCommitWorkflowSideEffect() ? getPluginRunContext({
						pluginId: record.id,
						get
					}) : void 0,
					clearRunContext: (paramsLocal) => {
						if (registryParams.activateGlobalSideEffects === false || !shouldCommitWorkflowSideEffect()) return;
						clearPluginRunContext({
							pluginId: record.id,
							runId: paramsLocal.runId,
							namespace: paramsLocal.namespace
						});
					},
					registerSessionSchedulerJob: (job) => registerSessionSchedulerJob(record, job),
					registerSessionAction: (action) => registerSessionAction(record, action),
					sendSessionAttachment: async (attachment) => {
						if (registryParams.activateGlobalSideEffects === false) return {
							ok: false,
							error: "global side effects disabled"
						};
						try {
							const { sendPluginSessionAttachment } = await loadAttachments();
							if (!isLoadedRecordInLiveRegistry()) return {
								ok: false,
								error: "plugin is not loaded"
							};
							const runtimeConfig = registryParams.runtime.config?.current?.() ?? params.config;
							return await sendPluginSessionAttachment({
								...attachment,
								config: runtimeConfig,
								origin: record.origin
							});
						} catch (error) {
							return {
								ok: false,
								error: `attachment delivery setup failed: ${formatErrorMessage(error)}`
							};
						}
					},
					scheduleSessionTurn: async (schedule) => {
						if (registryParams.activateGlobalSideEffects === false) return;
						await Promise.resolve();
						return schedulePluginSessionTurn({
							pluginId: record.id,
							pluginName: record.name,
							origin: record.origin,
							schedule,
							cron: getHostCronService(),
							shouldCommit: isLoadedRecordInLiveRegistry,
							ownerRegistry: registry
						});
					},
					unscheduleSessionTurnsByTag: async (request) => {
						if (registryParams.activateGlobalSideEffects === false) return {
							removed: 0,
							failed: 0
						};
						await Promise.resolve();
						if (!isLoadedRecordInLiveRegistry()) return {
							removed: 0,
							failed: 0
						};
						return unschedulePluginSessionTurnsByTag({
							pluginId: record.id,
							origin: record.origin,
							cron: getHostCronService(),
							request
						});
					},
					registerMemoryCapability: (capability) => registerMemoryCapability(record, capability),
					registerMemoryPromptSupplement: (builder) => registerMemoryPromptSupplement(record, builder),
					registerMemoryPromptPreparation: (prepare) => registerMemoryPromptPreparation(record, prepare),
					registerMemoryCorpusSupplement: (supplement) => registerMemoryCorpusSupplement(record, supplement),
					on: (hookName, handler, opts) => registerTypedHook(record, hookName, handler, opts, params.hookPolicy)
				} : {},
				...registrationCapabilities.setupRuntimeHandlers ? {
					registerHttpRoute: (routeParams) => registerHttpRoute(record, routeParams),
					registerGatewayMethod: (method, handler, opts) => registerGatewayMethod(record, method, handler, opts),
					registerSessionCatalog: (provider) => registerSessionCatalog(record, provider)
				} : {},
				registerCli: (registrar, opts) => registerCli(record, registrar, opts),
				registerChannel: (registration) => registerChannel(record, registration, registrationMode, registrationCapabilities.runtimeChannel ? () => resolveRegisteredChannelRuntime(record) : void 0)
			}
		});
	};
	return {
		createApi,
		deactivatePluginSideEffectGuards
	};
}
//#endregion
//#region src/plugins/registry-registrars-capabilities.ts
function createCapabilityRegistrars(state) {
	const { registry, reportRegistrationError, reportRegistrationWarning } = state;
	const registerDetachedTaskRuntime = (record, runtime) => {
		const existing = registry.detachedTaskRuntimes[0];
		if (existing && existing.pluginId !== record.id) {
			reportRegistrationError(record, `detached task runtime already registered by ${existing.pluginId}`);
			return;
		}
		const next = {
			pluginId: record.id,
			runtime
		};
		if (existing) registry.detachedTaskRuntimes.splice(0, 1, next);
		else registry.detachedTaskRuntimes.push(next);
	};
	const registerInteractiveHandler = (record, registration) => {
		const result = registerPluginInteractiveHandlerInRegistry(registry, record.id, registration, {
			pluginName: record.name,
			pluginRoot: record.rootDir
		});
		if (!result.ok) reportRegistrationWarning(record, result.error ?? "interactive handler registration failed");
	};
	const registerContextEngine = (record, id, factory, registrationMode) => {
		const normalizedId = normalizeOptionalString(id) ?? "";
		if (!normalizedId) {
			reportRegistrationError(record, "context engine registration missing id");
			return;
		}
		if (typeof factory !== "function") {
			reportRegistrationError(record, `context engine "${normalizedId}" registration missing factory`);
			return;
		}
		if (normalizedId === defaultSlotIdForKey("contextEngine")) {
			reportRegistrationError(record, `context engine id reserved by core: ${normalizedId}`);
			return;
		}
		const result = registerContextEngineInRegistry(registry, normalizedId, factory, `plugin:${record.id}`, {
			allowSameOwnerRefresh: true,
			lifecycle: registrationMode === "full" ? "runtime" : "readOnlyDiscovery"
		});
		if (!result.ok) {
			reportRegistrationError(record, `context engine already registered: ${normalizedId} (${result.existingOwner})`);
			return;
		}
		if (!record.contextEngineIds?.includes(normalizedId)) record.contextEngineIds = [...record.contextEngineIds ?? [], normalizedId];
	};
	const registerCompactionProvider = (record, provider) => {
		const id = normalizeOptionalString(provider?.id);
		if (!id) {
			reportRegistrationError(record, "compaction provider registration missing id");
			return;
		}
		if (typeof provider?.summarize !== "function") {
			reportRegistrationError(record, `compaction provider "${id}" registration missing summarize`);
			return;
		}
		const existing = registry.compactionProviders.find((entry) => entry.provider.id === id);
		if (existing) {
			const ownerDetail = existing.ownerPluginId ? ` (owner: ${existing.ownerPluginId})` : "";
			reportRegistrationError(record, `compaction provider already registered: ${id}${ownerDetail}`);
			return;
		}
		registry.compactionProviders.push({
			provider,
			ownerPluginId: record.id
		});
	};
	return {
		registerDetachedTaskRuntime,
		registerInteractiveHandler,
		registerContextEngine,
		registerCompactionProvider
	};
}
//#endregion
//#region src/plugins/registry-control-ui-policy.ts
function validateControlUiNativeRoutePlacement(params) {
	if (!params.placement?.startsWith("route:")) return true;
	if (params.record.origin === "bundled" && params.placement === `route:${params.record.id}`) return true;
	params.pushDiagnostic({
		level: "error",
		pluginId: params.record.id,
		source: params.record.source,
		message: `native Control UI route placement must be owned by its bundled plugin: ${params.placement}`
	});
	return false;
}
//#endregion
//#region src/plugins/tool-contracts.ts
function normalizePluginToolContractNames(contracts) {
	return normalizePluginToolNames(contracts?.tools);
}
function normalizePluginToolNames(names) {
	const normalized = /* @__PURE__ */ new Set();
	for (const name of names ?? []) {
		const trimmed = name.trim();
		if (trimmed) normalized.add(trimmed);
	}
	return [...normalized];
}
function findUndeclaredPluginToolNames(params) {
	const declared = new Set(normalizePluginToolNames(params.declaredNames));
	return normalizePluginToolNames(params.toolNames).filter((name) => !declared.has(name));
}
//#endregion
//#region src/plugins/registry-registrars-host.ts
const controlUiSurfaces = /* @__PURE__ */ new Set([
	"session",
	"tool",
	"run",
	"settings",
	"tab",
	"widget"
]);
function normalizeHostHookString(value) {
	return typeof value === "string" ? normalizePluginHostHookId(value) : "";
}
function normalizeOptionalHostHookString(value) {
	if (value === void 0) return;
	if (typeof value !== "string") return "";
	return value.trim();
}
function normalizeHostHookStringList(value) {
	if (value === void 0) return;
	if (!Array.isArray(value)) return null;
	const normalized = value.map((item) => normalizeOptionalHostHookString(item));
	if (normalized.some((item) => !item)) return null;
	return normalized;
}
function createHostRegistrars(state) {
	const { registry, registryParams, pushDiagnostic, reportRegistrationError } = state;
	const validateSessionActionSchema = (record, id, schema) => {
		if (schema === void 0) return true;
		if (!isPluginJsonValue(schema)) {
			reportRegistrationError(record, `session action schema must be JSON-compatible: ${id}`);
			return false;
		}
		if (typeof schema !== "boolean" && (!schema || typeof schema !== "object" || Array.isArray(schema))) {
			reportRegistrationError(record, `session action schema must be a JSON schema object or boolean: ${id}`);
			return false;
		}
		try {
			validateJsonSchemaValue({
				schema,
				cacheKey: `plugin-session-action-registration:${record.id}:${id}`,
				value: void 0
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			reportRegistrationError(record, `session action schema is not valid JSON Schema: ${id}: ${message}`);
			return false;
		}
		return true;
	};
	const registerSessionExtension = (record, extension) => {
		const namespace = normalizeHostHookString(extension.namespace);
		const description = normalizeHostHookString(extension.description);
		const project = extension.project;
		let normalizedSessionEntrySlotKey;
		let invalidMessage;
		if (!namespace || !description) invalidMessage = "session extension registration requires namespace and description";
		else if (project !== void 0 && typeof project !== "function") invalidMessage = "session extension projector must be a function";
		else if (project?.constructor?.name === "AsyncFunction") invalidMessage = "session extension projector must be synchronous";
		else if (extension.cleanup !== void 0 && typeof extension.cleanup !== "function") invalidMessage = "session extension cleanup must be a function";
		else if (extension.sessionEntrySlotKey !== void 0) {
			const slotKey = normalizeSessionEntrySlotKey(extension.sessionEntrySlotKey);
			if (!slotKey.ok) invalidMessage = slotKey.error;
			else normalizedSessionEntrySlotKey = slotKey.key;
		}
		if (invalidMessage) {
			reportRegistrationError(record, invalidMessage);
			return;
		}
		if (registry.sessionExtensions.find((entry) => entry.pluginId === record.id && entry.extension.namespace === namespace)) {
			reportRegistrationError(record, `session extension already registered: ${namespace}`);
			return;
		}
		if (normalizedSessionEntrySlotKey) {
			if (registry.sessionExtensions.find((entry) => {
				const existingSlotKey = entry.extension.sessionEntrySlotKey;
				if (existingSlotKey === void 0) return false;
				const normalizedExistingSlotKey = normalizeSessionEntrySlotKey(existingSlotKey);
				return normalizedExistingSlotKey.ok && normalizedExistingSlotKey.key === normalizedSessionEntrySlotKey;
			})) {
				reportRegistrationError(record, `sessionEntrySlotKey already registered: ${normalizedSessionEntrySlotKey}`);
				return;
			}
		}
		registry.sessionExtensions.push({
			pluginId: record.id,
			pluginName: record.name,
			extension: {
				...extension,
				namespace,
				description,
				...normalizedSessionEntrySlotKey ? { sessionEntrySlotKey: normalizedSessionEntrySlotKey } : {}
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerTrustedToolPolicy = (record, policy) => {
		if (!policy || typeof policy !== "object") {
			reportRegistrationError(record, "trusted tool policy registration requires id, description, and evaluate()");
			return;
		}
		const id = normalizeHostHookString(policy.id);
		const description = normalizeHostHookString(policy.description);
		const matcher = normalizePluginToolMatcher(policy.matcher);
		if (!id || !description || typeof policy.evaluate !== "function") {
			reportRegistrationError(record, "trusted tool policy registration requires id, description, and evaluate()");
			return;
		}
		if (record.origin !== "bundled" && !(record.contracts?.trustedToolPolicies ?? []).includes(id)) {
			reportRegistrationError(record, `plugin must declare contracts.trustedToolPolicies for: ${id}`);
			return;
		}
		if (record.origin !== "bundled" && !(record.enabled && record.explicitlyEnabled === true)) {
			reportRegistrationError(record, `plugin must be explicitly enabled to register trusted tool policy: ${id}`);
			return;
		}
		const policies = registry.trustedToolPolicies;
		const existing = policies.find((entry) => entry.pluginId === record.id && entry.policy.id === id);
		if (existing) {
			reportRegistrationError(record, `trusted tool policy already registered: ${id} (${existing.pluginId})`);
			return;
		}
		const registration = {
			pluginId: record.id,
			pluginName: record.name,
			policy: {
				...policy,
				id,
				description,
				...matcher ? { matcher } : {}
			},
			origin: record.origin,
			source: record.source,
			rootDir: record.rootDir
		};
		if (record.origin === "bundled") {
			const firstInstalledPolicyIndex = policies.findIndex((entry) => entry.origin !== "bundled");
			if (firstInstalledPolicyIndex === -1) policies.push(registration);
			else policies.splice(firstInstalledPolicyIndex, 0, registration);
			return;
		}
		policies.push(registration);
	};
	const registerToolMetadata = (record, metadata) => {
		const toolName = normalizeHostHookString(metadata.toolName);
		if (!toolName) {
			reportRegistrationError(record, "tool metadata registration missing toolName");
			return;
		}
		const undeclared = findUndeclaredPluginToolNames({
			declaredNames: normalizePluginToolContractNames(record.contracts),
			toolNames: [toolName]
		});
		if (undeclared.length > 0) {
			reportRegistrationError(record, `plugin must declare contracts.tools for tool metadata: ${undeclared.join(", ")}`);
			return;
		}
		const existing = registry.toolMetadata.find((entry) => entry.pluginId === record.id && entry.metadata.toolName === toolName);
		if (existing) {
			reportRegistrationError(record, `tool metadata already registered: ${toolName} (${existing.pluginId})`);
			return;
		}
		const displayName = normalizeOptionalHostHookString(metadata.displayName);
		const description = normalizeOptionalHostHookString(metadata.description);
		const tags = normalizeHostHookStringList(metadata.tags);
		if (displayName === "" || description === "" || tags === null || metadata.risk !== void 0 && ![
			"low",
			"medium",
			"high"
		].includes(metadata.risk)) {
			reportRegistrationError(record, `tool metadata registration has invalid metadata: ${toolName}`);
			return;
		}
		registry.toolMetadata.push({
			pluginId: record.id,
			pluginName: record.name,
			metadata: {
				...metadata,
				toolName,
				...displayName !== void 0 ? { displayName } : {},
				...description !== void 0 ? { description } : {},
				...tags !== void 0 ? { tags } : {}
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerControlUiDescriptor = (record, descriptor) => {
		const legacyDescriptor = descriptor;
		const id = normalizeHostHookString(descriptor.id);
		const label = normalizeHostHookString(descriptor.label ?? legacyDescriptor.name);
		const description = normalizeOptionalHostHookString(descriptor.description);
		const placement = normalizeOptionalHostHookString(descriptor.placement);
		const requiredScopes = normalizeHostHookStringList(descriptor.requiredScopes);
		const surface = typeof descriptor.surface === "string" ? descriptor.surface : "session";
		if (!id || !label || !controlUiSurfaces.has(surface) || description === "" || placement === "" || requiredScopes === null) {
			reportRegistrationError(record, "control UI descriptor registration requires id, surface, label, and valid optional fields");
			return;
		}
		if (requiredScopes !== void 0) {
			const unknownScope = requiredScopes.find((scope) => !isOperatorScope(scope));
			if (unknownScope !== void 0) {
				reportRegistrationError(record, `control UI descriptor requiredScopes contains unknown operator scope: ${unknownScope}`);
				return;
			}
		}
		if (!validateControlUiNativeRoutePlacement({
			record,
			placement,
			pushDiagnostic
		})) return;
		if (descriptor.schema !== void 0 && !isPluginJsonValue(descriptor.schema)) {
			reportRegistrationError(record, `control UI descriptor schema must be JSON-compatible: ${id}`);
			return;
		}
		if (registry.controlUiDescriptors.find((entry) => entry.pluginId === record.id && entry.descriptor.id === id)) {
			reportRegistrationError(record, `control UI descriptor already registered: ${id}`);
			return;
		}
		const icon = normalizeOptionalHostHookString(descriptor.icon);
		const tabPath = normalizeOptionalHostHookString(descriptor.path);
		if (!(tabPath === void 0 || tabPath.startsWith("/") && !tabPath.startsWith("//") && !tabPath.startsWith("/\\"))) {
			reportRegistrationError(record, `control UI descriptor path must be a gateway-local absolute path: ${id}`);
			return;
		}
		const group = descriptor.group === "control" || descriptor.group === "agent" ? descriptor.group : void 0;
		const order = typeof descriptor.order === "number" && Number.isFinite(descriptor.order) ? descriptor.order : void 0;
		registry.controlUiDescriptors.push({
			pluginId: record.id,
			pluginName: record.name,
			descriptor: {
				...descriptor,
				id,
				surface,
				label,
				...description !== void 0 ? { description } : {},
				...placement !== void 0 ? { placement } : {},
				...requiredScopes !== void 0 ? { requiredScopes } : {},
				icon,
				path: tabPath,
				group,
				order
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerRuntimeLifecycle = (record, lifecycle) => {
		const id = normalizePluginHostHookId(lifecycle.id);
		if (!id) {
			reportRegistrationError(record, "runtime lifecycle registration missing id");
			return;
		}
		if (registry.runtimeLifecycles.find((entry) => entry.pluginId === record.id && entry.lifecycle.id === id)) {
			reportRegistrationError(record, `runtime lifecycle already registered: ${id}`);
			return;
		}
		if (lifecycle.cleanup !== void 0 && typeof lifecycle.cleanup !== "function") {
			reportRegistrationError(record, `runtime lifecycle cleanup must be a function: ${id}`);
			return;
		}
		registry.runtimeLifecycles.push({
			pluginId: record.id,
			pluginName: record.name,
			lifecycle: {
				...lifecycle,
				id
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerAgentEventSubscription = (record, subscription) => {
		const id = normalizePluginHostHookId(subscription.id);
		if (!id || typeof subscription.handle !== "function") {
			reportRegistrationError(record, "agent event subscription registration requires id and handle");
			return;
		}
		const streams = normalizeHostHookStringList(subscription.streams);
		if (streams === null) {
			reportRegistrationError(record, `agent event subscription streams must be an array of strings: ${id}`);
			return;
		}
		if (registry.agentEventSubscriptions.find((entry) => entry.pluginId === record.id && entry.subscription.id === id)) {
			reportRegistrationError(record, `agent event subscription already registered: ${id}`);
			return;
		}
		registry.agentEventSubscriptions.push({
			pluginId: record.id,
			pluginName: record.name,
			subscription: {
				...subscription,
				id,
				...streams !== void 0 ? { streams } : {}
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerSessionSchedulerJob = (record, job) => {
		const jobId = normalizeHostHookString(job.id);
		const sessionKey = normalizeHostHookString(job.sessionKey);
		const kind = normalizeHostHookString(job.kind);
		if (jobId && registry.sessionSchedulerJobs.some((entry) => entry.pluginId === record.id && entry.job.id === jobId)) {
			reportRegistrationError(record, `session scheduler job already registered: ${jobId}`);
			return;
		}
		if (!jobId || !sessionKey || !kind) {
			reportRegistrationError(record, "session scheduler job registration requires unique id, sessionKey, and kind");
			return;
		}
		if (job.cleanup !== void 0 && typeof job.cleanup !== "function") {
			reportRegistrationError(record, `session scheduler job cleanup must be a function: ${jobId}`);
			return;
		}
		if (registryParams.activateGlobalSideEffects === false) {
			registry.sessionSchedulerJobs.push({
				pluginId: record.id,
				pluginName: record.name,
				job: {
					...job,
					id: jobId,
					sessionKey,
					kind
				},
				source: record.source,
				rootDir: record.rootDir
			});
			return {
				id: jobId,
				pluginId: record.id,
				sessionKey,
				kind
			};
		}
		const handle = registerPluginSessionSchedulerJob({
			pluginId: record.id,
			pluginName: record.name,
			ownerRegistry: registry,
			job: {
				...job,
				id: jobId,
				sessionKey,
				kind
			}
		});
		if (!handle) {
			reportRegistrationError(record, "session scheduler job registration requires unique id, sessionKey, and kind");
			return;
		}
		registry.sessionSchedulerJobs.push({
			pluginId: record.id,
			pluginName: record.name,
			job: {
				...job,
				id: handle.id,
				sessionKey: handle.sessionKey,
				kind: handle.kind
			},
			generation: getPluginSessionSchedulerJobGeneration({
				pluginId: record.id,
				jobId: handle.id,
				sessionKey: handle.sessionKey
			}),
			source: record.source,
			rootDir: record.rootDir
		});
		return handle;
	};
	const registerSessionAction = (record, action) => {
		const id = normalizeHostHookString(action.id);
		const description = normalizeOptionalHostHookString(action.description);
		const requiredScopes = normalizeHostHookStringList(action.requiredScopes);
		if (!id || description === "" || requiredScopes === null || typeof action.handler !== "function") {
			reportRegistrationError(record, "session action registration requires id, handler, and valid optional fields");
			return;
		}
		if (requiredScopes !== void 0) {
			const unknownScope = requiredScopes.find((scope) => !isOperatorScope(scope));
			if (unknownScope !== void 0) {
				reportRegistrationError(record, `session action requiredScopes contains unknown operator scope: ${unknownScope}`);
				return;
			}
		}
		if (!validateSessionActionSchema(record, id, action.schema)) return;
		if (registry.sessionActions.find((entry) => entry.pluginId === record.id && entry.action.id === id)) {
			reportRegistrationError(record, `session action already registered: ${id}`);
			return;
		}
		registry.sessionActions.push({
			pluginId: record.id,
			pluginName: record.name,
			action: {
				...action,
				id,
				...description !== void 0 ? { description } : {},
				...requiredScopes !== void 0 ? { requiredScopes } : {}
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerConversationBindingResolvedHandler = (record, handler) => {
		registry.conversationBindingResolvedHandlers.push({
			pluginId: record.id,
			pluginName: record.name,
			pluginRoot: record.rootDir,
			handler,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	return {
		registerSessionExtension,
		registerTrustedToolPolicy,
		registerToolMetadata,
		registerControlUiDescriptor,
		registerBoardWidgetContentKind: createPluginBoardWidgetContentKindRegistrar(registry),
		registerRuntimeLifecycle,
		registerAgentEventSubscription,
		registerSessionSchedulerJob,
		registerSessionAction,
		registerConversationBindingResolvedHandler
	};
}
//#endregion
//#region src/plugins/registry-registrars-memory.ts
function createMemoryRegistrars(state) {
	const { registry, reportRegistrationError, reportRegistrationWarning } = state;
	const requireMemorySlot = (record, surface) => {
		if (!hasKind(record.kind, "memory")) throw new Error(`only memory plugins can register a memory ${surface}`);
		if (Array.isArray(record.kind) && record.kind.length > 1 && !record.memorySlotSelected) {
			reportRegistrationWarning(record, `dual-kind plugin not selected for memory slot; skipping memory ${surface} registration`);
			return false;
		}
		return true;
	};
	const registerMemoryCapability = (record, capability) => {
		if (requireMemorySlot(record, "capability")) registry.memoryCapabilities.push({
			pluginId: record.id,
			capability
		});
	};
	const registerMemoryPromptSupplement = (record, builder) => {
		if (typeof builder !== "function") {
			reportRegistrationError(record, "memory prompt supplement registration missing builder");
			return;
		}
		registry.memoryPromptSupplements = registry.memoryPromptSupplements.filter((entry) => entry.pluginId !== record.id);
		registry.memoryPromptSupplements.push({
			pluginId: record.id,
			builder
		});
	};
	const registerMemoryPromptPreparation = (record, prepare) => {
		if (typeof prepare !== "function") {
			reportRegistrationError(record, "memory prompt preparation registration missing prepare function");
			return;
		}
		registry.memoryPromptPreparations = registry.memoryPromptPreparations.filter((entry) => entry.pluginId !== record.id);
		registry.memoryPromptPreparations.push({
			pluginId: record.id,
			prepare
		});
	};
	const registerMemoryCorpusSupplement = (record, supplement) => {
		registry.memoryCorpusSupplements = registry.memoryCorpusSupplements.filter((entry) => entry.pluginId !== record.id);
		registry.memoryCorpusSupplements.push({
			pluginId: record.id,
			supplement
		});
	};
	return {
		registerMemoryCapability,
		registerMemoryPromptSupplement,
		registerMemoryPromptPreparation,
		registerMemoryCorpusSupplement
	};
}
//#endregion
//#region src/plugins/channel-validation.ts
function resolveBundledChannelMeta(id) {
	return listChatChannels().find((meta) => meta?.id === id) ?? resolveGeneratedBundledChannelMeta(id);
}
function resolveGeneratedBundledChannelMeta(id) {
	const channel = GENERATED_BUNDLED_CHANNEL_CONFIG_METADATA.find((entry) => entry.channelId === id && entry.configurable !== false);
	const label = normalizeOptionalString(channel?.label);
	if (!channel || !label) return;
	return {
		id,
		label,
		selectionLabel: label,
		docsPath: `/channels/${id}`,
		blurb: normalizeOptionalString(channel.description) ?? ""
	};
}
function collectMissingChannelMetaFields(meta) {
	const missing = [];
	if (!normalizeOptionalString(meta?.label)) missing.push("label");
	if (!normalizeOptionalString(meta?.selectionLabel)) missing.push("selectionLabel");
	if (!normalizeOptionalString(meta?.docsPath)) missing.push("docsPath");
	if (typeof meta?.blurb !== "string") missing.push("blurb");
	return missing;
}
/** Validates and normalizes a channel plugin registration before runtime catalog insertion. */
function normalizeRegisteredChannelPlugin(params) {
	const id = normalizeOptionalString(params.plugin?.id) ?? normalizeStringifiedOptionalString(params.plugin?.id) ?? "";
	if (!id) {
		params.pushDiagnostic({
			level: "error",
			pluginId: params.pluginId,
			source: params.source,
			message: "channel registration missing id"
		});
		return null;
	}
	if (typeof params.plugin.config?.listAccountIds !== "function" || typeof params.plugin.config?.resolveAccount !== "function") {
		params.pushDiagnostic({
			level: "error",
			pluginId: params.pluginId,
			source: params.source,
			message: `channel "${id}" registration missing required config helpers`
		});
		return null;
	}
	const rawMeta = params.plugin.meta;
	const rawMetaId = normalizeOptionalString(rawMeta?.id);
	if (rawMetaId && rawMetaId !== id) params.pushDiagnostic({
		level: "warn",
		pluginId: params.pluginId,
		source: params.source,
		message: `channel "${id}" meta.id mismatch ("${rawMetaId}"); using registered channel id`
	});
	const missingFields = collectMissingChannelMetaFields(rawMeta);
	if (missingFields.length > 0) params.pushDiagnostic({
		level: "warn",
		pluginId: params.pluginId,
		source: params.source,
		message: `channel "${id}" registered incomplete metadata; filled missing ${missingFields.join(", ")}`
	});
	return {
		...params.plugin,
		id,
		meta: normalizeChannelMeta({
			id,
			meta: rawMeta,
			existing: resolveBundledChannelMeta(id)
		})
	};
}
//#endregion
//#region src/plugins/registry-registrars-network.ts
const GATEWAY_METHOD_DISPATCH_CONTRACT = "authenticated-request";
function adaptPluginGatewayMethodHandler(handler) {
	return async (opts) => {
		let responded = false;
		const respond = (ok, payload, error, meta) => {
			responded = true;
			opts.respond(ok, payload, error, meta);
		};
		const result = await handler({
			...opts,
			respond
		});
		if (!responded && result !== void 0) respond(true, result);
	};
}
function createNetworkRegistrars(state) {
	const { registry, coreGatewayMethods, pluginsWithChannelRegistrationConflict, pushDiagnostic, reportRegistrationError, reportRegistrationWarning } = state;
	let reportedLegacyCatalogSkip = false;
	const registerGatewayMethod = (record, method, handler, opts) => {
		const trimmed = method.trim();
		if (!trimmed) return;
		if (coreGatewayMethods.has(trimmed) || registry.gatewayHandlers[trimmed]) {
			reportRegistrationError(record, `gateway method already registered: ${trimmed}`);
			return;
		}
		const wrappedHandler = adaptPluginGatewayMethodHandler(handler);
		registry.gatewayHandlers[trimmed] = wrappedHandler;
		const normalizedScope = normalizePluginGatewayMethodScope(trimmed, opts?.scope);
		if (normalizedScope.coercedToReservedAdmin) reportRegistrationWarning(record, `gateway method scope coerced to operator.admin for reserved core namespace: ${trimmed}`);
		registry.gatewayMethodDescriptors.push(createPluginGatewayMethodDescriptor({
			pluginId: record.id,
			name: trimmed,
			handler: wrappedHandler,
			scope: normalizedScope.scope,
			...opts?.profileAccess ? { profileAccess: opts.profileAccess } : {}
		}));
	};
	const registerSessionCatalog = (record, provider) => {
		const id = provider.id.trim();
		const label = provider.label.trim();
		if (!id || !label) {
			reportRegistrationError(record, "session catalog requires non-empty id and label");
			return;
		}
		if (!state.allowProcessHomeSessionCatalogs && provider.supportsProcessHomeIsolation !== true) {
			if (!reportedLegacyCatalogSkip) {
				reportedLegacyCatalogSkip = true;
				reportRegistrationWarning(record, "external session catalog skipped in isolated state: provider must declare supportsProcessHomeIsolation");
			}
			return;
		}
		const existing = registry.sessionCatalogs.find((entry) => entry.provider.id === id);
		if (existing) {
			reportRegistrationError(record, `session catalog already registered: ${id} (${existing.pluginId})`);
			return;
		}
		registry.sessionCatalogs.push({
			pluginId: record.id,
			pluginName: record.name,
			provider: {
				...provider,
				id,
				label
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const describeHttpRouteOwner = (entry) => {
		return `${normalizeOptionalString(entry.pluginId) || "unknown-plugin"} (${normalizeOptionalString(entry.source) || "unknown-source"})`;
	};
	const canDispatchGatewayMethodsFromHttpRoute = (record) => (record.contracts?.gatewayMethodDispatch ?? []).includes(GATEWAY_METHOD_DISPATCH_CONTRACT);
	const registerHttpRoute = (record, params) => {
		const normalizedPath = normalizePluginHttpPath(params.path);
		if (!normalizedPath) {
			reportRegistrationWarning(record, "http route registration missing path");
			return;
		}
		if (params.auth !== "gateway" && params.auth !== "plugin") {
			reportRegistrationError(record, `http route registration missing or invalid auth: ${normalizedPath}`);
			return;
		}
		const match = params.match ?? "exact";
		const { authOverlap, canonicalMatches } = findPluginHttpRouteRegistrationConflicts(registry.httpRoutes, {
			path: normalizedPath,
			match,
			auth: params.auth
		});
		if (authOverlap) {
			reportRegistrationError(record, `http route overlap rejected: ${normalizedPath} (${match}, ${params.auth}) overlaps ${authOverlap.path} (${authOverlap.match}, ${authOverlap.auth}) owned by ${describeHttpRouteOwner(authOverlap)}`);
			return;
		}
		const existingIndex = canonicalMatches[0] ? registry.httpRoutes.indexOf(canonicalMatches[0]) : -1;
		const registration = {
			pluginId: record.id,
			path: normalizedPath,
			handler: params.handler,
			...params.handleUpgrade ? { handleUpgrade: params.handleUpgrade } : {},
			auth: params.auth,
			match,
			...params.gatewayRuntimeScopeSurface ? { gatewayRuntimeScopeSurface: params.gatewayRuntimeScopeSurface } : {},
			...canDispatchGatewayMethodsFromHttpRoute(record) ? { gatewayMethodDispatchAllowed: true } : {},
			...params.nodeCapability ? { nodeCapability: { ...params.nodeCapability } } : {},
			source: record.source
		};
		if (existingIndex >= 0) {
			if (!registry.httpRoutes[existingIndex]) return;
			const foreignOwner = canonicalMatches.find((route) => route.pluginId !== record.id);
			if (foreignOwner) {
				reportRegistrationError(record, params.replaceExisting ? `http route replacement rejected: ${normalizedPath} (${match}) owned by ${describeHttpRouteOwner(foreignOwner)}` : `http route already registered: ${normalizedPath} (${match}) by ${describeHttpRouteOwner(foreignOwner)}`);
				return;
			}
			registry.httpRoutes[existingIndex] = registration;
			for (const route of canonicalMatches.toReversed()) {
				const index = registry.httpRoutes.indexOf(route);
				if (index >= 0 && index !== existingIndex) registry.httpRoutes.splice(index, 1);
			}
			return;
		}
		record.httpRoutes += 1;
		registry.httpRoutes.push(registration);
	};
	const registerHostedMediaResolver = (record, resolver) => {
		if (typeof resolver !== "function") {
			reportRegistrationError(record, "hosted media resolver registration missing resolver");
			return;
		}
		registry.hostedMediaResolvers.push({
			pluginId: record.id,
			pluginName: record.name,
			resolver,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerMcpServerConnectionResolver = (record, resolver) => {
		const serverName = normalizeOptionalString(resolver?.serverName);
		if (!serverName || typeof resolver.resolve !== "function") {
			reportRegistrationError(record, "MCP server connection resolver registration missing serverName or resolve");
			return;
		}
		const existingIndex = registry.mcpServerConnectionResolvers.findIndex((entry) => entry.resolver.serverName === serverName);
		const registration = {
			pluginId: record.id,
			pluginName: record.name,
			resolver: {
				serverName,
				resolve: resolver.resolve
			},
			source: record.source,
			rootDir: record.rootDir
		};
		if (existingIndex >= 0) {
			const existing = registry.mcpServerConnectionResolvers[existingIndex];
			if (existing && existing.pluginId !== record.id) {
				reportRegistrationError(record, `MCP server connection resolver for "${serverName}" rejected: already registered by plugin "${existing.pluginId}"`);
				return;
			}
			registry.mcpServerConnectionResolvers[existingIndex] = registration;
			return;
		}
		registry.mcpServerConnectionResolvers.push(registration);
	};
	const registerChannel = (record, registration, mode = "full", resolveChannelRuntime) => {
		if (record.origin === "workspace" && !record.enabled) {
			reportRegistrationWarning(record, `channel registration rejected for disabled workspace plugin: ${record.id}`);
			return;
		}
		const registrationCapabilities = resolvePluginRegistrationCapabilities(mode);
		const normalized = typeof registration.plugin === "object" ? registration : { plugin: registration };
		const plugin = normalizeRegisteredChannelPlugin({
			pluginId: record.id,
			source: record.source,
			plugin: normalized.plugin,
			pushDiagnostic
		});
		if (!plugin) return;
		const id = plugin.id;
		const existingRuntime = registry.channels.find((entry) => entry.plugin.id === id);
		if (registrationCapabilities.runtimeChannel && existingRuntime) {
			if (existingRuntime.pluginId === record.id) {
				existingRuntime.plugin = plugin;
				existingRuntime.pluginName = record.name;
				existingRuntime.resolveChannelRuntime = resolveChannelRuntime;
				existingRuntime.origin = record.origin;
				existingRuntime.source = record.source;
				existingRuntime.rootDir = record.rootDir;
				const existingSetup = registry.channelSetups.find((entry) => entry.plugin.id === id);
				if (existingSetup) {
					existingSetup.plugin = plugin;
					existingSetup.pluginName = record.name;
					existingSetup.origin = record.origin;
					existingSetup.source = record.source;
					existingSetup.enabled = record.enabled;
					existingSetup.rootDir = record.rootDir;
				}
				return;
			}
			reportRegistrationError(record, `channel already registered: ${id} (${existingRuntime.pluginId})`);
			pluginsWithChannelRegistrationConflict.add(record.id);
			return;
		}
		const existingSetup = registry.channelSetups.find((entry) => entry.plugin.id === id);
		if (existingSetup) {
			if (existingSetup.pluginId === record.id) {
				existingSetup.plugin = plugin;
				existingSetup.pluginName = record.name;
				existingSetup.origin = record.origin;
				existingSetup.source = record.source;
				existingSetup.enabled = record.enabled;
				existingSetup.rootDir = record.rootDir;
				return;
			}
			reportRegistrationError(record, `channel setup already registered: ${id} (${existingSetup.pluginId})`);
			pluginsWithChannelRegistrationConflict.add(record.id);
			return;
		}
		if (!record.channelIds.includes(id)) record.channelIds.push(id);
		registry.channelSetups.push({
			pluginId: record.id,
			pluginName: record.name,
			plugin,
			origin: record.origin,
			source: record.source,
			enabled: record.enabled,
			rootDir: record.rootDir
		});
		if (!registrationCapabilities.runtimeChannel) return;
		registry.channels.push({
			pluginId: record.id,
			pluginName: record.name,
			plugin,
			resolveChannelRuntime,
			origin: record.origin,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	return {
		registerGatewayMethod,
		registerSessionCatalog,
		registerHttpRoute,
		registerHostedMediaResolver,
		registerMcpServerConnectionResolver,
		registerChannel
	};
}
//#endregion
//#region src/plugins/registry-registrars-operations.ts
function isOfficialCodexPluginRecord(record) {
	if (record.id !== "codex" || record.origin !== "global") return false;
	if (record.packageName === "@openclaw/codex") return true;
	return path.normalize(record.rootDir ?? record.source).split(path.sep).join("/").includes("/node_modules/@openclaw/codex");
}
function canClaimReservedCommandOwnership(record) {
	return record.origin === "bundled" || isOfficialCodexPluginRecord(record);
}
function createOperationRegistrars(state) {
	const { registry, reportRegistrationError, reportRegistrationWarning } = state;
	const registerWidgetPresenter = (record, presenter) => {
		const description = normalizeOptionalString(presenter.description);
		const currentCapabilities = presenter.target === "current_channel" ? presenter.capabilities : void 0;
		const currentChannelValid = presenter.target === "current_channel" && typeof presenter.match === "function" && currentCapabilities !== void 0 && Array.isArray(currentCapabilities.sourceKinds) && currentCapabilities.sourceKinds.length > 0 && currentCapabilities.sourceKinds.every((kind) => typeof kind === "string" && kind.trim().length > 0) && (currentCapabilities.maxSourceBytes === void 0 || Number.isInteger(currentCapabilities.maxSourceBytes) && currentCapabilities.maxSourceBytes > 0);
		if (presenter.target !== "node_panel" && !currentChannelValid || !description || description.length > 160 || typeof presenter.availability !== "function" || typeof presenter.present !== "function") {
			reportRegistrationError(record, "invalid widget presenter registration");
			return;
		}
		const existing = presenter.target === "current_channel" ? void 0 : registry.widgetPresenters.find((registration) => registration.presenter.target === presenter.target);
		if (existing) {
			reportRegistrationError(record, `widget presenter already registered for ${presenter.target} (${existing.pluginId})`);
			return;
		}
		registry.widgetPresenters.push({
			pluginId: record.id,
			pluginName: record.name,
			presenter: {
				...presenter,
				description
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerCli = (record, registrar, opts) => {
		const normalizeCommandRoot = (raw, source) => {
			const normalized = normalizeCommandDescriptorName(raw);
			if (!normalized) reportRegistrationError(record, `invalid cli ${source} name: ${JSON.stringify(raw.trim())}`);
			return normalized;
		};
		const parentPath = (opts?.parentPath ?? []).map((segment) => normalizeCommandRoot(segment, "command"));
		if (parentPath.some((segment) => segment === null)) return;
		const normalizedParentPath = parentPath;
		const rootRegistration = normalizedParentPath.length === 0;
		const descriptors = (opts?.descriptors ?? []).map((descriptor) => {
			const name = normalizeCommandRoot(descriptor.name, "descriptor");
			const description = sanitizeCommandDescriptorDescription(descriptor.description);
			const machineOutput = rootRegistration ? descriptor.machineOutput : void 0;
			if (!name || !description) return null;
			const normalized = {
				name,
				description,
				hasSubcommands: descriptor.hasSubcommands
			};
			if (machineOutput) normalized.machineOutput = machineOutput;
			return normalized;
		}).filter((descriptor) => descriptor !== null);
		const commands = normalizeUniqueStringEntries([...opts?.commands ?? [], ...descriptors.map((descriptor) => descriptor.name)].map((command) => normalizeCommandRoot(command, "command")).filter((command) => command !== null));
		if (commands.length === 0) {
			reportRegistrationError(record, "cli registration missing explicit commands metadata");
			return;
		}
		const serializeCommandPath = (command) => [...normalizedParentPath, command].join(" ");
		const commandPaths = commands.map(serializeCommandPath);
		const commandPathSet = new Set(commandPaths);
		const existing = registry.cliRegistrars.find((entry) => entry.commands.map((command) => [...entry.parentPath ?? [], command].join(" ")).some((commandPath) => commandPathSet.has(commandPath)));
		if (existing) {
			const existingCommandPaths = new Set(existing.commands.map((command) => [...existing.parentPath ?? [], command].join(" ")));
			const overlap = commandPaths.find((commandPath) => existingCommandPaths.has(commandPath));
			reportRegistrationError(record, `cli command already registered: ${overlap ?? commands[0]} (${existing.pluginId})`);
			return;
		}
		record.cliCommands.push(...commandPaths);
		registry.cliRegistrars.push({
			pluginId: record.id,
			pluginName: record.name,
			register: registrar,
			parentPath: normalizedParentPath,
			commands,
			descriptors,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerReload = (record, registration) => {
		const normalized = {
			restartPrefixes: normalizeStringEntries(registration.restartPrefixes),
			hotPrefixes: normalizeStringEntries(registration.hotPrefixes),
			noopPrefixes: normalizeStringEntries(registration.noopPrefixes)
		};
		if ((normalized.restartPrefixes?.length ?? 0) === 0 && (normalized.hotPrefixes?.length ?? 0) === 0 && (normalized.noopPrefixes?.length ?? 0) === 0) {
			reportRegistrationWarning(record, "reload registration missing prefixes");
			return;
		}
		registry.reloads.push({
			pluginId: record.id,
			pluginName: record.name,
			registration: normalized,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const reservedNodeHostCommands = /* @__PURE__ */ new Set([
		...NODE_SYSTEM_RUN_COMMANDS,
		...NODE_EXEC_APPROVALS_COMMANDS,
		NODE_SYSTEM_NOTIFY_COMMAND,
		...NODE_WORKER_PRIVATE_COMMANDS
	]);
	const registerNodeHostCommand = (record, nodeCommand) => {
		const command = nodeCommand.command.trim();
		if (!command) {
			reportRegistrationError(record, "node host command registration missing command");
			return;
		}
		const bundledSystemNotify = record.origin === "bundled" && command === "system.notify";
		if (reservedNodeHostCommands.has(command) && !bundledSystemNotify) {
			reportRegistrationError(record, `node host command reserved by core: ${command}`);
			return;
		}
		const existing = registry.nodeHostCommands.find((entry) => entry.command.command === command);
		if (existing) {
			reportRegistrationError(record, `node host command already registered: ${command} (${existing.pluginId})`);
			return;
		}
		registry.nodeHostCommands.push({
			pluginId: record.id,
			pluginName: record.name,
			command: {
				...nodeCommand,
				command,
				cap: normalizeOptionalString(nodeCommand.cap)
			},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerNodeInvokePolicy = (record, policy, pluginConfig) => {
		const commands = normalizeUniqueStringEntries(Array.isArray(policy.commands) ? policy.commands : []);
		if (commands.length === 0) {
			reportRegistrationError(record, "node invoke policy registration missing commands");
			return;
		}
		const reservedCommand = commands.find(isPrivateNodeInvokeCommand);
		if (reservedCommand) {
			reportRegistrationError(record, `node invoke policy command reserved by core: ${reservedCommand}`);
			return;
		}
		if (typeof policy.handle !== "function") {
			reportRegistrationError(record, `node invoke policy registration missing handler: ${commands.join(", ")}`);
			return;
		}
		for (const command of commands) {
			const existing = registry.nodeInvokePolicies.find((entry) => entry.policy.commands.includes(command));
			if (existing) {
				reportRegistrationError(record, `node invoke policy already registered for ${command} (${existing.pluginId})`);
				return;
			}
		}
		registry.nodeInvokePolicies.push({
			pluginId: record.id,
			pluginName: record.name,
			policy: {
				...policy,
				commands
			},
			pluginConfig,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerSecurityAuditCollector = (record, collector) => {
		registry.securityAuditCollectors.push({
			pluginId: record.id,
			pluginName: record.name,
			collector,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const resolveServiceRegistrationId = (record, service, kind) => {
		const id = service.id.trim();
		const registrations = kind === "service" ? registry.services : registry.gatewayDiscoveryServices;
		const existing = id ? registrations.find((entry) => entry.service.id.trim() === id) : void 0;
		if (id && !existing) return id;
		if (existing?.pluginId !== record.id) reportRegistrationError(record, existing ? `${kind} already registered: ${id} (${existing.pluginId})` : `${kind} registration missing id`);
	};
	const registerService = (record, service) => {
		const id = resolveServiceRegistrationId(record, service, "service");
		if (!id) return;
		record.services.push(id);
		registry.services.push({
			pluginId: record.id,
			pluginName: record.name,
			service,
			source: record.source,
			origin: record.origin,
			trustedOfficialInstall: record.trustedOfficialInstall,
			rootDir: record.rootDir
		});
	};
	const registerGatewayDiscoveryService = (record, service) => {
		const id = resolveServiceRegistrationId(record, service, "gateway discovery service");
		if (!id) return;
		record.gatewayDiscoveryServiceIds.push(id);
		registry.gatewayDiscoveryServices.push({
			pluginId: record.id,
			pluginName: record.name,
			service,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerCommand = (record, command) => {
		const name = command.name.trim();
		if (!name) {
			reportRegistrationError(record, "command registration missing name");
			return;
		}
		const allowReservedCommandNames = command.ownership === "reserved";
		if (allowReservedCommandNames && !canClaimReservedCommandOwnership(record)) {
			reportRegistrationError(record, `only bundled plugins can claim reserved command ownership: ${name}`);
			return;
		}
		if (allowReservedCommandNames && !isReservedCommandName(name)) {
			reportRegistrationError(record, `reserved command ownership requires a reserved command name: ${name}`);
			return;
		}
		if (allowReservedCommandNames && record.id !== normalizeLowercaseStringOrEmpty(name)) {
			reportRegistrationError(record, `command registration failed: Reserved command ownership requires plugin id "${record.id}" to match reserved command name "${normalizeLowercaseStringOrEmpty(name)}"`);
			return;
		}
		const { ownership: _ownership, ...commandForRegistration } = command;
		const result = registerPluginCommandInRegistry(registry, record.id, allowReservedCommandNames ? commandForRegistration : command, {
			pluginName: record.name,
			pluginRoot: record.rootDir,
			allowReservedCommandNames,
			allowOwnerStatusExposure: canClaimReservedCommandOwnership(record)
		});
		if (!result.ok) {
			reportRegistrationError(record, `command registration failed: ${result.error}`);
			return;
		}
		const registered = registry.commands.at(-1);
		if (registered?.pluginId === record.id) {
			registered.source = record.source;
			if (allowReservedCommandNames) registered.command.ownership = "reserved";
		}
		record.commands.push(name);
	};
	return {
		registerWidgetPresenter,
		registerCli,
		registerReload,
		registerNodeHostCommand,
		registerNodeInvokePolicy,
		registerSecurityAuditCollector,
		registerService,
		registerGatewayDiscoveryService,
		registerCommand
	};
}
//#endregion
//#region src/plugins/provider-validation.ts
/** Validates and normalizes provider plugin definitions before registry registration. */
function normalizeTextList(values) {
	const normalized = normalizeUniqueTrimmedStringList(values);
	return normalized.length > 0 ? normalized : void 0;
}
function normalizeOnboardingScopes(values) {
	const normalized = Array.from(new Set((values ?? []).filter((value) => value === "text-inference" || value === "image-generation" || value === "music-generation")));
	return normalized.length > 0 ? normalized : void 0;
}
function normalizeProviderOAuthProfileIdRepairs(values) {
	if (!Array.isArray(values)) return;
	const normalized = values.map((value) => {
		const legacyProfileId = normalizeOptionalString(value?.legacyProfileId);
		const promptLabel = normalizeOptionalString(value?.promptLabel);
		if (!legacyProfileId && !promptLabel) return null;
		return {
			...legacyProfileId ? { legacyProfileId } : {},
			...promptLabel ? { promptLabel } : {}
		};
	}).filter((value) => value !== null);
	return normalized.length > 0 ? normalized : void 0;
}
function resolveWizardMethodId(params) {
	if (!params.methodId) return;
	if (params.auth.some((method) => method.id === params.methodId)) return params.methodId;
	params.pushDiagnostic({
		level: "warn",
		pluginId: params.pluginId,
		source: params.source,
		message: `provider "${params.providerId}" ${params.metadataKind} method "${params.methodId}" not found; falling back to available methods`
	});
}
function buildNormalizedModelAllowlist(modelAllowlist) {
	if (!modelAllowlist) return;
	const allowedKeys = normalizeTextList(modelAllowlist.allowedKeys);
	const initialSelections = normalizeTextList(modelAllowlist.initialSelections);
	const loadCatalog = modelAllowlist.loadCatalog === true;
	const message = normalizeOptionalString(modelAllowlist.message);
	if (!allowedKeys && !initialSelections && !loadCatalog && !message) return;
	return {
		...allowedKeys ? { allowedKeys } : {},
		...initialSelections ? { initialSelections } : {},
		...loadCatalog ? { loadCatalog } : {},
		...message ? { message } : {}
	};
}
function buildNormalizedWizardSetup(params) {
	const choiceId = normalizeOptionalString(params.setup.choiceId);
	const choiceLabel = normalizeOptionalString(params.setup.choiceLabel);
	const choiceHint = normalizeOptionalString(params.setup.choiceHint);
	const groupId = normalizeOptionalString(params.setup.groupId);
	const groupLabel = normalizeOptionalString(params.setup.groupLabel);
	const groupHint = normalizeOptionalString(params.setup.groupHint);
	const onboardingScopes = normalizeOnboardingScopes(params.setup.onboardingScopes);
	const modelAllowlist = buildNormalizedModelAllowlist(params.setup.modelAllowlist);
	return {
		...choiceId ? { choiceId } : {},
		...choiceLabel ? { choiceLabel } : {},
		...choiceHint ? { choiceHint } : {},
		...typeof params.setup.assistantPriority === "number" && Number.isFinite(params.setup.assistantPriority) ? { assistantPriority: params.setup.assistantPriority } : {},
		...params.setup.assistantVisibility === "manual-only" || params.setup.assistantVisibility === "visible" ? { assistantVisibility: params.setup.assistantVisibility } : {},
		...params.setup.onboardingFeatured === true ? { onboardingFeatured: true } : {},
		...groupId ? { groupId } : {},
		...groupLabel ? { groupLabel } : {},
		...groupHint ? { groupHint } : {},
		...params.methodId ? { methodId: params.methodId } : {},
		...onboardingScopes ? { onboardingScopes } : {},
		...modelAllowlist ? { modelAllowlist } : {}
	};
}
function buildNormalizedModelPicker(modelPicker, methodId) {
	const label = normalizeOptionalString(modelPicker.label);
	const hint = normalizeOptionalString(modelPicker.hint);
	return {
		...label ? { label } : {},
		...hint ? { hint } : {},
		...methodId ? { methodId } : {}
	};
}
function normalizeProviderWizardSetup(params) {
	const hasAuthMethods = params.auth.length > 0;
	if (!params.setup) return;
	if (!hasAuthMethods) {
		params.pushDiagnostic({
			level: "warn",
			pluginId: params.pluginId,
			source: params.source,
			message: `provider "${params.providerId}" setup metadata ignored because it has no auth methods`
		});
		return;
	}
	const methodId = resolveWizardMethodId({
		providerId: params.providerId,
		pluginId: params.pluginId,
		source: params.source,
		auth: params.auth,
		methodId: normalizeOptionalString(params.setup.methodId),
		metadataKind: "setup",
		pushDiagnostic: params.pushDiagnostic
	});
	return buildNormalizedWizardSetup({
		setup: params.setup,
		methodId
	});
}
function normalizeProviderAuthMethods(params) {
	const seenMethodIds = /* @__PURE__ */ new Set();
	const normalized = [];
	for (const method of params.auth) {
		const methodId = normalizeOptionalString(method.id);
		if (!methodId) {
			params.pushDiagnostic({
				level: "error",
				pluginId: params.pluginId,
				source: params.source,
				message: `provider "${params.providerId}" auth method missing id`
			});
			continue;
		}
		if (seenMethodIds.has(methodId)) {
			params.pushDiagnostic({
				level: "error",
				pluginId: params.pluginId,
				source: params.source,
				message: `provider "${params.providerId}" auth method duplicated id "${methodId}"`
			});
			continue;
		}
		seenMethodIds.add(methodId);
		const wizardSetup = method.wizard;
		const wizard = wizardSetup ? normalizeProviderWizardSetup({
			providerId: params.providerId,
			pluginId: params.pluginId,
			source: params.source,
			auth: [{
				...method,
				id: methodId
			}],
			setup: wizardSetup,
			pushDiagnostic: params.pushDiagnostic
		}) : void 0;
		normalized.push({
			...method,
			id: methodId,
			label: normalizeOptionalString(method.label) ?? methodId,
			...normalizeOptionalString(method.hint) ? { hint: normalizeOptionalString(method.hint) } : {},
			...wizard ? { wizard } : {}
		});
	}
	return normalized;
}
function normalizeProviderWizard(params) {
	if (!params.wizard) return;
	const hasAuthMethods = params.auth.length > 0;
	const normalizeSetup = () => {
		const setup = params.wizard?.setup;
		if (!setup) return;
		return normalizeProviderWizardSetup({
			providerId: params.providerId,
			pluginId: params.pluginId,
			source: params.source,
			auth: params.auth,
			setup,
			pushDiagnostic: params.pushDiagnostic
		});
	};
	const normalizeModelPicker = () => {
		const modelPicker = params.wizard?.modelPicker;
		if (!modelPicker) return;
		if (!hasAuthMethods) {
			params.pushDiagnostic({
				level: "warn",
				pluginId: params.pluginId,
				source: params.source,
				message: `provider "${params.providerId}" model-picker metadata ignored because it has no auth methods`
			});
			return;
		}
		return buildNormalizedModelPicker(modelPicker, resolveWizardMethodId({
			providerId: params.providerId,
			pluginId: params.pluginId,
			source: params.source,
			auth: params.auth,
			methodId: normalizeOptionalString(modelPicker.methodId),
			metadataKind: "model-picker",
			pushDiagnostic: params.pushDiagnostic
		}));
	};
	const setup = normalizeSetup();
	const modelPicker = normalizeModelPicker();
	if (!setup && !modelPicker) return;
	return {
		...setup ? { setup } : {},
		...modelPicker ? { modelPicker } : {}
	};
}
/** Normalizes provider plugin metadata and emits diagnostics for invalid public fields. */
function normalizeRegisteredProvider(params) {
	const id = normalizeOptionalString(params.provider.id);
	if (!id) {
		params.pushDiagnostic({
			level: "error",
			pluginId: params.pluginId,
			source: params.source,
			message: "provider registration missing id"
		});
		return null;
	}
	const auth = normalizeProviderAuthMethods({
		providerId: id,
		pluginId: params.pluginId,
		source: params.source,
		auth: params.provider.auth ?? [],
		pushDiagnostic: params.pushDiagnostic
	});
	const docsPath = normalizeOptionalString(params.provider.docsPath);
	const aliases = normalizeTextList(params.provider.aliases);
	const deprecatedProfileIds = normalizeTextList(params.provider.deprecatedProfileIds);
	const oauthProfileIdRepairs = normalizeProviderOAuthProfileIdRepairs(params.provider.oauthProfileIdRepairs);
	const envVars = normalizeTextList(params.provider.envVars);
	const wizard = normalizeProviderWizard({
		providerId: id,
		pluginId: params.pluginId,
		source: params.source,
		auth,
		wizard: params.provider.wizard,
		pushDiagnostic: params.pushDiagnostic
	});
	const catalog = params.provider.catalog;
	const { wizard: _ignoredWizard, docsPath: _ignoredDocsPath, aliases: _ignoredAliases, envVars: _ignoredEnvVars, catalog: _ignoredCatalog, ...restProvider } = params.provider;
	return {
		...restProvider,
		id,
		label: normalizeOptionalString(params.provider.label) ?? id,
		...docsPath ? { docsPath } : {},
		...aliases ? { aliases } : {},
		...deprecatedProfileIds ? { deprecatedProfileIds } : {},
		...oauthProfileIdRepairs ? { oauthProfileIdRepairs } : {},
		...envVars ? { envVars } : {},
		auth,
		...catalog ? { catalog } : {},
		...wizard ? { wizard } : {}
	};
}
//#endregion
//#region src/plugins/registry-registrars-providers.ts
function createProviderRegistrars(state) {
	const { registry, pushDiagnostic, reportRegistrationError, reportRegistrationWarning, registerModelCatalogProvider } = state;
	const registerProvider = (record, provider) => {
		const normalizedProvider = normalizeRegisteredProvider({
			pluginId: record.id,
			source: record.source,
			provider,
			pushDiagnostic
		});
		if (!normalizedProvider) return;
		const id = normalizedProvider.id;
		const existing = registry.providers.find((entry) => entry.provider.id === id);
		if (existing) {
			reportRegistrationError(record, `provider already registered: ${id} (${existing.pluginId})`);
			return;
		}
		if (!record.providerIds.includes(id)) record.providerIds.push(id);
		registry.providers.push({
			pluginId: record.id,
			pluginName: record.name,
			provider: normalizedProvider,
			source: record.source,
			rootDir: record.rootDir
		});
		if (normalizedProvider.catalog || normalizedProvider.staticCatalog) registerModelCatalogProvider(record, {
			provider: normalizedProvider.id,
			kinds: ["text"]
		});
	};
	const registerAgentHarness = (record, harness, options) => {
		const id = normalizeOptionalString(harness?.id) ?? "";
		if (!id) {
			reportRegistrationError(record, "agent harness registration missing id");
			return;
		}
		if (id === "openclaw") {
			reportRegistrationError(record, "agent harness id \"openclaw\" is reserved for the built-in runtime");
			return;
		}
		if (typeof harness.supports !== "function" || typeof harness.runAttempt !== "function") {
			reportRegistrationError(record, `agent harness "${id}" registration missing required runtime methods`);
			return;
		}
		if (options?.nativeCompaction && (!canClaimReservedCommandOwnership(record) || id !== "codex" || typeof options.nativeCompaction !== "function")) {
			reportRegistrationError(record, "native compaction requires the registry-owned \"codex\" harness");
			return;
		}
		const existing = registry.agentHarnesses.find((entry) => entry.harness.id === id);
		if (existing) {
			const ownerPluginId = "pluginId" in existing ? existing.pluginId : void 0;
			const ownerDetail = ownerPluginId ? ` (owner: ${ownerPluginId})` : "";
			reportRegistrationError(record, `agent harness already registered: ${id}${ownerDetail}`);
			return;
		}
		const normalizedHarness = {
			...harness,
			id,
			pluginId: harness.pluginId ?? record.id
		};
		record.agentHarnessIds.push(id);
		registry.agentHarnesses.push({
			pluginId: record.id,
			pluginName: record.name,
			harness: normalizedHarness,
			...options?.nativeCompaction ? { nativeCompaction: options.nativeCompaction } : {},
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerCliBackend = (record, backend) => {
		const id = backend.id.trim();
		if (!id) {
			reportRegistrationError(record, "cli backend registration missing id");
			return;
		}
		const existing = registry.cliBackends.find((entry) => entry.backend.id === id);
		if (existing) {
			reportRegistrationError(record, `cli backend already registered: ${id} (${existing.pluginId})`);
			return;
		}
		registry.cliBackends.push({
			pluginId: record.id,
			pluginName: record.name,
			builtWithOpenClawVersion: record.builtWithOpenClawVersion,
			backend: {
				...backend,
				id
			},
			source: record.source,
			rootDir: record.rootDir
		});
		record.cliBackendIds.push(id);
	};
	const registerTextTransforms = (record, transforms) => {
		if ((!transforms.input || transforms.input.length === 0) && (!transforms.output || transforms.output.length === 0)) {
			reportRegistrationWarning(record, "text transform registration has no input or output replacements");
			return;
		}
		registry.textTransforms.push({
			pluginId: record.id,
			pluginName: record.name,
			transforms,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerEmbeddingProvider = (record, adapter) => {
		const id = adapter.id.trim();
		if (!id) {
			reportRegistrationError(record, "embedding provider registration missing id");
			return;
		}
		if (!(record.contracts?.embeddingProviders ?? []).includes(id)) {
			reportRegistrationError(record, `plugin must declare contracts.embeddingProviders for adapter: ${id}`);
			return;
		}
		const existing = getCoreEmbeddingProvider(id) ?? registry.embeddingProviders.find((entry) => entry.provider.id === id);
		if (existing) {
			const ownerPluginId = "ownerPluginId" in existing ? existing.ownerPluginId : "pluginId" in existing ? existing.pluginId : void 0;
			const ownerDetail = ownerPluginId ? ` (owner: ${ownerPluginId})` : "";
			reportRegistrationError(record, `embedding provider already registered: ${id}${ownerDetail}`);
			return;
		}
		registry.embeddingProviders.push({
			pluginId: record.id,
			pluginName: record.name,
			provider: adapter,
			source: record.source,
			rootDir: record.rootDir
		});
		if (!record.embeddingProviderIds.includes(id)) record.embeddingProviderIds.push(id);
	};
	const createProviderLikeRegistrar = (params) => (record, provider) => {
		const id = provider.id.trim();
		const { kindLabel } = params;
		if (!id) {
			reportRegistrationError(record, `${kindLabel} registration missing id`);
			return params.onRegister ? void 0 : false;
		}
		const existing = params.registrations.find((entry) => entry.provider.id === id);
		if (existing) {
			reportRegistrationError(record, `${kindLabel} already registered: ${id} (${existing.pluginId})`);
			return params.onRegister ? void 0 : false;
		}
		const ownedIds = params.ownedIds(record);
		if (!ownedIds.includes(id)) ownedIds.push(id);
		params.registrations.push({
			pluginId: record.id,
			pluginName: record.name,
			provider,
			source: record.source,
			rootDir: record.rootDir
		});
		if (params.onRegister) {
			params.onRegister(record, provider);
			return;
		}
		return true;
	};
	const registerWorkerProvider = (record, provider) => {
		const reject = (message) => reportRegistrationError(record, message);
		const validation = validateWorkerProviderContract(provider, record.contracts?.workerProviders ?? []);
		if (!validation.ok) {
			reject(validation.message);
			return;
		}
		const { id } = validation;
		const existing = registry.workerProviders.get(id);
		if (existing) {
			reject(`worker provider already registered: ${id} (${existing.pluginId})`);
			return;
		}
		registry.workerProviders.set(id, {
			pluginId: record.id,
			pluginName: record.name,
			provider,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	return {
		registerProvider,
		registerAgentHarness,
		registerCliBackend,
		registerTextTransforms,
		registerEmbeddingProvider,
		registerWorkerProvider,
		registerSpeechProvider: createProviderLikeRegistrar({
			kindLabel: "speech provider",
			registrations: registry.speechProviders,
			ownedIds: (record) => record.speechProviderIds,
			onRegister: (record, provider) => registerModelCatalogProvider(record, {
				provider: provider.id,
				kinds: ["voice"]
			})
		}),
		registerRealtimeTranscriptionProvider: createProviderLikeRegistrar({
			kindLabel: "realtime transcription provider",
			registrations: registry.realtimeTranscriptionProviders,
			ownedIds: (record) => record.realtimeTranscriptionProviderIds,
			onRegister: (record, provider) => registerModelCatalogProvider(record, {
				provider: provider.id,
				kinds: ["voice"]
			})
		}),
		registerRealtimeVoiceProvider: createProviderLikeRegistrar({
			kindLabel: "realtime voice provider",
			registrations: registry.realtimeVoiceProviders,
			ownedIds: (record) => record.realtimeVoiceProviderIds,
			onRegister: (record, provider) => registerModelCatalogProvider(record, {
				provider: provider.id,
				kinds: ["voice"]
			})
		}),
		registerMediaUnderstandingProvider: createProviderLikeRegistrar({
			kindLabel: "media provider",
			registrations: registry.mediaUnderstandingProviders,
			ownedIds: (record) => record.mediaUnderstandingProviderIds
		}),
		registerTranscriptSourceProvider: createProviderLikeRegistrar({
			kindLabel: "transcripts source provider",
			registrations: registry.transcriptSourceProviders,
			ownedIds: (record) => record.transcriptSourceProviderIds
		}),
		registerImageGenerationProvider: createProviderLikeRegistrar({
			kindLabel: "image-generation provider",
			registrations: registry.imageGenerationProviders,
			ownedIds: (record) => record.imageGenerationProviderIds,
			onRegister: (record, provider) => registerModelCatalogProvider(record, {
				provider: provider.id,
				kinds: ["image_generation"]
			})
		}),
		registerVideoGenerationProvider: createProviderLikeRegistrar({
			kindLabel: "video-generation provider",
			registrations: registry.videoGenerationProviders,
			ownedIds: (record) => record.videoGenerationProviderIds,
			onRegister: (record, provider) => registerModelCatalogProvider(record, {
				provider: provider.id,
				kinds: ["video_generation"]
			})
		}),
		registerMusicGenerationProvider: createProviderLikeRegistrar({
			kindLabel: "music-generation provider",
			registrations: registry.musicGenerationProviders,
			ownedIds: (record) => record.musicGenerationProviderIds,
			onRegister: (record, provider) => registerModelCatalogProvider(record, {
				provider: provider.id,
				kinds: ["music_generation"]
			})
		}),
		registerWebFetchProvider: createProviderLikeRegistrar({
			kindLabel: "web fetch provider",
			registrations: registry.webFetchProviders,
			ownedIds: (record) => record.webFetchProviderIds
		}),
		registerWebSearchProvider: createProviderLikeRegistrar({
			kindLabel: "web search provider",
			registrations: registry.webSearchProviders,
			ownedIds: (record) => record.webSearchProviderIds
		}),
		registerMigrationProvider: createProviderLikeRegistrar({
			kindLabel: "migration provider",
			registrations: registry.migrationProviders,
			ownedIds: (record) => record.migrationProviderIds
		})
	};
}
/** Lists active Codex app-server extension factories from the plugin registry. */
function listCodexAppServerExtensionFactories() {
	return getActivePluginRegistry()?.codexAppServerExtensionFactories?.map((entry) => entry.factory) ?? [];
}
//#endregion
//#region src/plugins/registry-registrars-tools-hooks.ts
function normalizeHookEligibility(value, isEligible) {
	if (!Array.isArray(value)) return;
	const entries = Array.from(value);
	if (entries.length === 0 || !entries.every(isEligible)) return;
	return uniqueValues(entries);
}
function canRegisterInstalledTrustedHook(record) {
	return record.origin === "bundled" || record.enabled && record.explicitlyEnabled === true;
}
function createToolHookRegistrars(state) {
	const { registry, registryParams, pluginsWithChannelRegistrationConflict, reportRegistrationError, reportRegistrationWarning } = state;
	const registerCodexAppServerExtensionFactory = (record, factory) => {
		if (record.origin !== "bundled") {
			reportRegistrationError(record, "only bundled plugins can register Codex app-server extension factories");
			return;
		}
		if (!(record.contracts?.embeddedExtensionFactories ?? []).includes("codex-app-server")) {
			reportRegistrationError(record, "plugin must declare contracts.embeddedExtensionFactories: [\"codex-app-server\"] to register Codex app-server extension factories");
			return;
		}
		if (typeof factory !== "function") {
			reportRegistrationError(record, "codex app-server extension factory must be a function");
			return;
		}
		if (registry.codexAppServerExtensionFactories.some((entry) => entry.pluginId === record.id && entry.rawFactory === factory)) return;
		const safeFactory = async (codex) => {
			try {
				await factory(codex);
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				registryParams.logger.warn(`[plugins] codex app-server extension factory failed for ${record.id}: ${detail}`);
			}
		};
		registry.codexAppServerExtensionFactories.push({
			pluginId: record.id,
			pluginName: record.name,
			rawFactory: factory,
			factory: safeFactory,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerAgentToolResultMiddleware = (record, handler, options, policy) => {
		if (typeof handler !== "function") {
			reportRegistrationError(record, "agent tool result middleware must be a function");
			return;
		}
		const runtimes = normalizeAgentToolResultMiddlewareRuntimes(options);
		const matcher = normalizePluginToolMatcher(options?.matcher);
		if (runtimes.length === 0) {
			reportRegistrationError(record, "agent tool result middleware must target at least one supported runtime");
			return;
		}
		const declared = normalizeAgentToolResultMiddlewareRuntimeIds(record.contracts?.agentToolResultMiddleware);
		const missing = runtimes.filter((runtime) => !declared.includes(runtime));
		if (missing.length > 0) {
			reportRegistrationError(record, `plugin must declare contracts.agentToolResultMiddleware for: ${missing.join(", ")}`);
			return;
		}
		if (!canRegisterInstalledTrustedHook(record)) {
			reportRegistrationError(record, "plugin must be explicitly enabled to register agent tool result middleware");
			return;
		}
		const existing = registry.agentToolResultMiddlewares.find((entry) => entry.pluginId === record.id && entry.rawHandler === handler);
		if (existing) {
			appendAgentToolResultMiddlewareScope(existing, {
				runtimes,
				matcher
			});
			return;
		}
		const timeoutMs = resolveTypedHookTimeoutMs({
			hookName: "after_tool_call",
			policy
		});
		const safeHandler = async (event, ctx) => {
			if (!agentToolResultMiddlewareRegistrationCoversTool(registration, ctx.runtime, event.toolName)) return;
			try {
				return await withTimeout(Promise.resolve(handler(event, ctx)), timeoutMs ?? 0, `agent tool result middleware for ${record.id}`);
			} catch (error) {
				registryParams.logger.warn(`[plugins] agent tool result middleware failed for ${record.id}`);
				throw error;
			}
		};
		const registration = {
			pluginId: record.id,
			pluginName: record.name,
			rawHandler: handler,
			handler: safeHandler,
			runtimes,
			scopes: [{
				runtimes,
				...matcher ? { matcher } : {}
			}],
			source: record.source,
			rootDir: record.rootDir
		};
		registry.agentToolResultMiddlewares.push(registration);
	};
	const registerTool = (record, tool, opts) => {
		if (pluginsWithChannelRegistrationConflict.has(record.id)) return;
		const declaredNames = normalizePluginToolContractNames(record.contracts);
		if (declaredNames.length === 0) {
			reportRegistrationError(record, "plugin must declare contracts.tools before registering agent tools");
			return;
		}
		const names = [...opts?.names ?? [], ...opts?.name ? [opts.name] : []];
		const optional = opts?.optional === true;
		const factory = typeof tool === "function" ? tool : (_ctx) => tool;
		if (typeof tool !== "function") names.push(tool.name);
		const normalized = normalizePluginToolNames(names);
		const undeclared = findUndeclaredPluginToolNames({
			declaredNames,
			toolNames: normalized
		});
		if (undeclared.length > 0) {
			reportRegistrationError(record, `plugin must declare contracts.tools for: ${undeclared.join(", ")}`);
			return;
		}
		if (normalized.length > 0) record.toolNames.push(...normalized);
		registry.tools.push({
			pluginId: record.id,
			pluginName: record.name,
			factory,
			names: normalized,
			declaredNames,
			optional,
			origin: record.origin,
			source: record.source,
			rootDir: record.rootDir
		});
	};
	const registerHook = (record, events, handler, opts, config, pluginConfig) => {
		const normalizedEvents = normalizeStringEntries(Array.isArray(events) ? events : [events]);
		for (const event of normalizedEvents) if (isPluginHookName(event)) reportRegistrationWarning(record, `hook event "${event}" is dispatched by the typed hook runner only; api.registerHook registrations for it are not invoked. Use api.on("${event}", ...) instead.`);
		const entry = opts?.entry ?? null;
		const hookName = entry?.hook.name ?? opts?.name?.trim();
		if (!hookName) throw new Error("hook registration missing name");
		const existingHook = registry.hooks.find((entryLocal) => entryLocal.entry.hook.name === hookName);
		if (existingHook) {
			reportRegistrationError(record, `hook already registered: ${hookName} (${existingHook.pluginId})`);
			return;
		}
		const description = entry?.hook.description ?? opts?.description ?? "";
		const hookEntry = entry ? {
			...entry,
			hook: {
				...entry.hook,
				name: hookName,
				description,
				source: "openclaw-plugin",
				pluginId: record.id
			},
			metadata: {
				...entry.metadata,
				events: normalizedEvents
			}
		} : {
			hook: {
				name: hookName,
				description,
				source: "openclaw-plugin",
				pluginId: record.id,
				filePath: record.source,
				baseDir: path.dirname(record.source),
				handlerPath: record.source
			},
			frontmatter: {},
			metadata: { events: normalizedEvents },
			invocation: { enabled: true }
		};
		record.hookNames.push(hookName);
		registry.hooks.push({
			pluginId: record.id,
			entry: hookEntry,
			events: normalizedEvents,
			source: record.source
		});
		if (!(config?.hooks?.internal?.enabled !== false) || opts?.register === false) return;
		for (const event of normalizedEvents) {
			const wrappedHandler = async (evt) => {
				const context = evt.context;
				const hadPluginConfig = Object.hasOwn(context, "pluginConfig");
				const previousPluginConfig = context.pluginConfig;
				context.pluginConfig = pluginConfig;
				try {
					return await handler({
						...evt,
						context
					});
				} finally {
					if (hadPluginConfig) context.pluginConfig = previousPluginConfig;
					else delete context.pluginConfig;
				}
			};
			registry.legacyInternalHooks.push({
				pluginId: record.id,
				name: hookName,
				event,
				handler: wrappedHandler
			});
		}
	};
	const registerTypedHook = (record, hookName, handler, opts, policy) => {
		if (!isPluginHookName(hookName)) {
			reportRegistrationWarning(record, `unknown typed hook "${String(hookName)}" ignored`);
			return;
		}
		if (!resolvePromptInjectionAllowed(policy) && isPromptInjectionHookName(hookName)) {
			reportRegistrationWarning(record, `typed hook "${hookName}" blocked by plugins.entries.${record.id}.hooks.allowPromptInjection=false`);
			return;
		}
		if (isConversationHookName(hookName) && !resolveConversationAccessAllowed(record.origin, policy)) {
			if (record.origin !== "bundled") {
				reportRegistrationWarning(record, `typed hook "${hookName}" blocked because non-bundled plugins must set plugins.entries.${record.id}.hooks.allowConversationAccess=true`);
				return;
			}
			reportRegistrationWarning(record, `typed hook "${hookName}" blocked by plugins.entries.${record.id}.hooks.allowConversationAccess=false`);
			return;
		}
		const timeoutMs = resolveTypedHookTimeoutMs({
			hookName,
			opts,
			policy
		});
		const eligibleTriggers = hookName === "before_agent_reply" ? normalizeHookEligibility(opts?.eligibleTriggers, isPluginHookAgentTrigger) : void 0;
		const eligibleDispatchKinds = hookName === "reply_dispatch" ? normalizeHookEligibility(opts?.eligibleDispatchKinds, isPluginHookReplyDispatchKind) : void 0;
		const matcher = hookName === "before_tool_call" || hookName === "after_tool_call" ? normalizePluginToolMatcher(opts?.matcher) : void 0;
		if (opts?.matcher && hookName !== "before_tool_call" && hookName !== "after_tool_call") reportRegistrationWarning(record, `typed hook "${hookName}" ignores tool matcher`);
		record.hookCount += 1;
		registry.typedHooks.push({
			pluginId: record.id,
			...opts?.registrationId ? { registrationId: opts.registrationId } : {},
			hookName,
			handler,
			...matcher ? { matcher } : {},
			priority: opts?.priority,
			...timeoutMs !== void 0 ? { timeoutMs } : {},
			...eligibleTriggers ? { eligibleTriggers } : {},
			...eligibleDispatchKinds ? { eligibleDispatchKinds } : {},
			...hookName === "before_prompt_build" && opts?.requiresToolAuthority === true ? { requiresToolAuthority: true } : {},
			source: record.source
		});
	};
	return {
		registerCodexAppServerExtensionFactory,
		registerAgentToolResultMiddleware,
		registerTool,
		registerHook,
		registerTypedHook
	};
}
//#endregion
//#region src/plugins/registry-registrars.ts
/** Compose domain registrars over one explicit mutable registry state. */
function createPluginRegistrars(state) {
	return {
		...createCapabilityRegistrars(state),
		...createToolHookRegistrars(state),
		...createNetworkRegistrars(state),
		...createProviderRegistrars(state),
		...createOperationRegistrars(state),
		...createHostRegistrars(state),
		...createMemoryRegistrars(state),
		registerModelCatalogProvider: state.registerModelCatalogProvider
	};
}
//#endregion
//#region src/channels/inbound-event/host-context-builder.ts
/** Wrap the ordinary builder with the private bundled-channel evidence binding. */
function createHostChannelInboundEventContextBuilder(buildContext, owner) {
	return (params) => {
		const preparation = prepareHostChannelContextAdmissionEvidence({
			owner,
			channelId: params.channel,
			accountId: params.accountId,
			ingress: params.channelIngress,
			rawPrincipalRef: params.sender.id,
			contextParams: params
		});
		const result = buildContext(params);
		const bindEvidence = (built) => {
			if (owner?.channelId === params.channel && owner.isLive()) bindChannelParticipantInput({
				context: built,
				channelId: params.channel,
				ingress: params.channelIngress,
				owner,
				binding: {
					agentId: params.route.agentId,
					sessionKey: params.route.dispatchSessionKey ?? params.route.routeSessionKey,
					nativeChannelId: params.reply.nativeChannelId ?? params.conversation.nativeChannelId,
					messageId: params.messageId,
					inboundEventKind: params.message.inboundEventKind ?? "user_request"
				}
			});
			bindHostChannelContextAdmissionEvidence({
				context: built,
				preparation
			});
			return built;
		};
		return isPromiseLike(result) ? result.then(bindEvidence) : bindEvidence(result);
	};
}
//#endregion
//#region src/plugin-state/plugin-blob-store.types.ts
var PluginBlobStoreError = class extends Error {
	constructor(message, options) {
		super(message, { cause: options.cause });
		this.name = "PluginBlobStoreError";
		this.code = options.code;
		this.operation = options.operation;
		if (options.path) this.path = options.path;
	}
};
//#endregion
//#region src/plugin-state/plugin-blob-store.sqlite.ts
const MAX_PLUGIN_BLOB_BYTES_PER_ENTRY = 104857600;
const MAX_PLUGIN_BLOB_BYTES_PER_PLUGIN = 536870912;
const MAX_PLUGIN_BLOB_ENTRIES_PER_PLUGIN = 5e4;
function createError(params) {
	return new PluginBlobStoreError(params.message, {
		code: params.code,
		operation: params.operation,
		path: resolveOpenClawStateSqlitePath(params.env ?? process.env),
		cause: params.cause
	});
}
function wrapError(error, operation, fallbackCode, message, env) {
	return error instanceof PluginBlobStoreError ? error : createError({
		code: fallbackCode,
		operation,
		message,
		env,
		cause: error
	});
}
function openDatabase(operation, env) {
	try {
		return openOpenClawStateDatabase(env ? { env } : {});
	} catch (error) {
		throw wrapError(error, operation, "PLUGIN_BLOB_OPEN_FAILED", "Failed to open plugin blob store.", env);
	}
}
function kysely(db) {
	return getNodeSqliteKysely(db);
}
function selectLiveBlob(db, params) {
	return executeSqliteQueryTakeFirstSync(db, kysely(db).selectFrom("plugin_blob_entries").select([
		"entry_key",
		"metadata_json",
		"blob",
		"created_at",
		"expires_at"
	]).select((eb) => eb.fn("length", ["blob"]).as("size_bytes")).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "=", params.key).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)])));
}
function blobKeyExists(db, params) {
	return executeSqliteQueryTakeFirstSync(db, kysely(db).selectFrom("plugin_blob_entries").select("entry_key").where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "=", params.key)) !== void 0;
}
function selectLiveInfo(db, params) {
	return executeSqliteQuerySync(db, kysely(db).selectFrom("plugin_blob_entries").select([
		"entry_key",
		"metadata_json",
		"created_at",
		"expires_at"
	]).select((eb) => eb.fn("length", ["blob"]).as("size_bytes")).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)])).orderBy("created_at", "asc").orderBy("entry_key", "asc")).rows;
}
function selectExpiredKeyInfo(db, params) {
	return executeSqliteQueryTakeFirstSync(db, kysely(db).selectFrom("plugin_blob_entries").select([
		"entry_key",
		"metadata_json",
		"created_at",
		"expires_at"
	]).select((eb) => eb.fn("length", ["blob"]).as("size_bytes")).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "=", params.key).where("expires_at", "is not", null).where("expires_at", "<=", params.now));
}
function selectLiveDescriptors(db, params) {
	let query = kysely(db).selectFrom("plugin_blob_entries").select([
		"entry_key",
		"namespace",
		"created_at"
	]).select((eb) => eb.fn("length", ["blob"]).as("size_bytes")).where("plugin_id", "=", params.pluginId).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)]));
	if (params.namespace !== void 0) query = query.where("namespace", "=", params.namespace);
	if (params.excludeKey !== void 0) query = query.where("entry_key", "!=", params.excludeKey);
	return executeSqliteQuerySync(db, query.orderBy("created_at", "asc").orderBy("entry_key", "asc")).rows;
}
function selectStoredDescriptors(db, params) {
	let query = kysely(db).selectFrom("plugin_blob_entries").select([
		"entry_key",
		"namespace",
		"created_at"
	]).select((eb) => eb.fn("length", ["blob"]).as("size_bytes")).where("plugin_id", "=", params.pluginId);
	if (params.namespace !== void 0) query = query.where("namespace", "=", params.namespace);
	return executeSqliteQuerySync(db, query.orderBy("created_at", "asc").orderBy("entry_key", "asc")).rows;
}
function selectStoredKeyDescriptor(db, params) {
	return executeSqliteQueryTakeFirstSync(db, kysely(db).selectFrom("plugin_blob_entries").select([
		"entry_key",
		"namespace",
		"created_at"
	]).select((eb) => eb.fn("length", ["blob"]).as("size_bytes")).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "=", params.key));
}
function deleteKey(db, params) {
	const result = executeSqliteQuerySync(db, kysely(db).deleteFrom("plugin_blob_entries").where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "=", params.key));
	return Number(result.numAffectedRows ?? 0);
}
function deleteKeys(db, params) {
	const batchSize = 500;
	for (let offset = 0; offset < params.keys.length; offset += batchSize) {
		const keys = params.keys.slice(offset, offset + batchSize);
		executeSqliteQuerySync(db, kysely(db).deleteFrom("plugin_blob_entries").where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "in", keys));
	}
}
function deleteExpiredNamespace(db, params) {
	const result = executeSqliteQuerySync(db, kysely(db).deleteFrom("plugin_blob_entries").where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("expires_at", "is not", null).where("expires_at", "<=", params.now));
	return Number(result.numAffectedRows ?? 0);
}
function totalBytes(rows) {
	return rows.reduce((total, row) => total + Number(row.size_bytes), 0);
}
function limitError$1(message, env) {
	return createError({
		code: "PLUGIN_BLOB_LIMIT_EXCEEDED",
		operation: "register",
		message,
		env
	});
}
function assertProjectedLimits(params) {
	const namespaceRows = selectStoredDescriptors(params.db, {
		pluginId: params.write.pluginId,
		namespace: params.write.namespace
	});
	const pluginRows = selectStoredDescriptors(params.db, { pluginId: params.write.pluginId });
	const previousBytes = params.existing ? Number(params.existing.size_bytes) : 0;
	const rowDelta = params.existing ? 0 : 1;
	if (namespaceRows.length + rowDelta > params.write.maxEntries) throw limitError$1("Plugin blob namespace reached its stored row limit.", params.write.env);
	if (totalBytes(namespaceRows) - previousBytes + params.write.bytes.byteLength > params.write.maxBytesPerNamespace) throw limitError$1("Plugin blob namespace reached its stored byte limit.", params.write.env);
	if (pluginRows.length + rowDelta > 5e4) throw limitError$1("Plugin blob store reached its per-plugin row limit.", params.write.env);
	if (totalBytes(pluginRows) - previousBytes + params.write.bytes.byteLength > 536870912) throw limitError$1("Plugin blob store reached its per-plugin byte limit.", params.write.env);
}
function deleteOldestUntilWithinLimits(params) {
	const namespaceRows = selectStoredDescriptors(params.db, {
		pluginId: params.write.pluginId,
		namespace: params.write.namespace
	});
	let namespaceCount = namespaceRows.length;
	let namespaceBytes = totalBytes(namespaceRows);
	const namespaceKeysToDelete = [];
	const namespaceCandidates = selectLiveDescriptors(params.db, {
		pluginId: params.write.pluginId,
		namespace: params.write.namespace,
		now: params.now,
		excludeKey: params.write.key
	});
	for (const row of namespaceCandidates) {
		if (namespaceCount <= params.write.maxEntries && namespaceBytes <= params.write.maxBytesPerNamespace) break;
		namespaceKeysToDelete.push(row.entry_key);
		namespaceCount -= 1;
		namespaceBytes -= Number(row.size_bytes);
	}
	if (namespaceCount > params.write.maxEntries || namespaceBytes > params.write.maxBytesPerNamespace) throw limitError$1("Plugin blob namespace cannot satisfy its configured limits.", params.write.env);
	deleteKeys(params.db, {
		pluginId: params.write.pluginId,
		namespace: params.write.namespace,
		keys: namespaceKeysToDelete
	});
	const pluginRows = selectStoredDescriptors(params.db, { pluginId: params.write.pluginId });
	let pluginCount = pluginRows.length;
	let pluginBytes = totalBytes(pluginRows);
	const liveNamespaceCandidates = selectLiveDescriptors(params.db, {
		pluginId: params.write.pluginId,
		namespace: params.write.namespace,
		now: params.now,
		excludeKey: params.write.key
	});
	const pluginKeysToDelete = [];
	for (const row of liveNamespaceCandidates) {
		if (pluginCount <= 5e4 && pluginBytes <= 536870912) break;
		pluginKeysToDelete.push(row.entry_key);
		pluginCount -= 1;
		pluginBytes -= Number(row.size_bytes);
	}
	if (pluginCount > 5e4 || pluginBytes > 536870912) throw limitError$1("Plugin blob store cannot satisfy its per-plugin limits.", params.write.env);
	deleteKeys(params.db, {
		pluginId: params.write.pluginId,
		namespace: params.write.namespace,
		keys: pluginKeysToDelete
	});
}
function upsertBlob(db, params, now) {
	const expiresAt = (() => {
		if (params.ttlMs === void 0) return null;
		const resolved = resolveExpiresAtMsFromDurationMs(params.ttlMs, { nowMs: now });
		if (resolved === void 0) throw createError({
			code: "PLUGIN_BLOB_INVALID_INPUT",
			operation: "register",
			message: "Plugin blob ttlMs cannot produce a valid expiry timestamp.",
			env: params.env
		});
		return resolved;
	})();
	const row = {
		plugin_id: params.pluginId,
		namespace: params.namespace,
		entry_key: params.key,
		metadata_json: params.metadataJson,
		blob: params.bytes,
		created_at: now,
		expires_at: expiresAt
	};
	executeSqliteQuerySync(db, kysely(db).insertInto("plugin_blob_entries").values(row).onConflict((conflict) => conflict.columns([
		"plugin_id",
		"namespace",
		"entry_key"
	]).doUpdateSet({
		metadata_json: (eb) => eb.ref("excluded.metadata_json"),
		blob: (eb) => eb.ref("excluded.blob"),
		created_at: (eb) => eb.ref("excluded.created_at"),
		expires_at: (eb) => eb.ref("excluded.expires_at")
	})));
}
function writeBlob(params, ifAbsent) {
	try {
		openDatabase("register", params.env);
		return runOpenClawStateWriteTransaction(({ db }) => {
			const now = Date.now();
			if (ifAbsent && blobKeyExists(db, params)) return false;
			const existing = selectStoredKeyDescriptor(db, params);
			if (params.overflowPolicy === "reject-new") assertProjectedLimits({
				db,
				write: params,
				existing
			});
			upsertBlob(db, params, now);
			if (params.overflowPolicy === "evict-oldest") deleteOldestUntilWithinLimits({
				db,
				write: params,
				now
			});
			return true;
		}, params.env ? { env: params.env } : {});
	} catch (error) {
		throw wrapError(error, "register", "PLUGIN_BLOB_WRITE_FAILED", "Failed to register plugin blob entry.", params.env);
	}
}
function pluginBlobRegister(params) {
	writeBlob(params, false);
}
function pluginBlobRegisterIfAbsent(params) {
	return writeBlob(params, true);
}
function pluginBlobLookup(params) {
	try {
		const { db } = openDatabase("lookup", params.env);
		return selectLiveBlob(db, {
			...params,
			now: Date.now()
		});
	} catch (error) {
		throw wrapError(error, "lookup", "PLUGIN_BLOB_READ_FAILED", "Failed to read plugin blob entry.", params.env);
	}
}
function pluginBlobEntries(params) {
	try {
		const { db } = openDatabase("entries", params.env);
		return selectLiveInfo(db, {
			...params,
			now: Date.now()
		});
	} catch (error) {
		throw wrapError(error, "entries", "PLUGIN_BLOB_READ_FAILED", "Failed to list plugin blob entries.", params.env);
	}
}
function pluginBlobDelete(params) {
	try {
		openDatabase("delete", params.env);
		return runOpenClawStateWriteTransaction(({ db }) => deleteKey(db, params) > 0, params.env ? { env: params.env } : {});
	} catch (error) {
		throw wrapError(error, "delete", "PLUGIN_BLOB_WRITE_FAILED", "Failed to delete plugin blob entry.", params.env);
	}
}
function pluginBlobDeleteExpiredKey(params) {
	try {
		openDatabase("sweep", params.env);
		return runOpenClawStateWriteTransaction(({ db }) => {
			const row = selectExpiredKeyInfo(db, {
				...params,
				now: Date.now()
			});
			if (!row) return;
			params.validateMetadataJson(row.metadata_json);
			deleteKey(db, params);
			return row;
		}, params.env ? { env: params.env } : {});
	} catch (error) {
		throw wrapError(error, "sweep", "PLUGIN_BLOB_WRITE_FAILED", "Failed to delete expired plugin blob.", params.env);
	}
}
function pluginBlobDeleteExpired(params) {
	try {
		openDatabase("sweep", params.env);
		return runOpenClawStateWriteTransaction(({ db }) => {
			const now = Date.now();
			const rows = executeSqliteQuerySync(db, kysely(db).selectFrom("plugin_blob_entries").select([
				"entry_key",
				"metadata_json",
				"created_at",
				"expires_at"
			]).select((eb) => eb.fn("length", ["blob"]).as("size_bytes")).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("expires_at", "is not", null).where("expires_at", "<=", now).orderBy("created_at", "asc").orderBy("entry_key", "asc")).rows;
			for (const row of rows) params.validateMetadataJson(row.metadata_json);
			deleteExpiredNamespace(db, {
				...params,
				now
			});
			return rows;
		}, params.env ? { env: params.env } : {});
	} catch (error) {
		throw wrapError(error, "sweep", "PLUGIN_BLOB_WRITE_FAILED", "Failed to delete expired plugin blobs.", params.env);
	}
}
function pluginBlobClear(params) {
	try {
		openDatabase("clear", params.env);
		runOpenClawStateWriteTransaction(({ db }) => {
			executeSqliteQuerySync(db, kysely(db).deleteFrom("plugin_blob_entries").where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace));
		}, params.env ? { env: params.env } : {});
	} catch (error) {
		throw wrapError(error, "clear", "PLUGIN_BLOB_WRITE_FAILED", "Failed to clear plugin blob entries.", params.env);
	}
}
//#endregion
//#region src/plugin-state/plugin-blob-store.ts
function invalidInput(message, operation = "register") {
	return new PluginBlobStoreError(message, {
		code: "PLUGIN_BLOB_INVALID_INPUT",
		operation
	});
}
function limitError(message) {
	return new PluginBlobStoreError(message, {
		code: "PLUGIN_BLOB_LIMIT_EXCEEDED",
		operation: "register"
	});
}
const validationErrors = (operation) => ({
	invalid: (message) => invalidInput(message, operation),
	limit: (message) => limitError(message)
});
function validateNamespace(value) {
	return validatePluginStoreNamespace({
		value,
		label: "plugin blob",
		errors: validationErrors("open")
	});
}
function validateKey(value, operation) {
	return validatePluginStoreKey({
		value,
		label: "plugin blob",
		errors: validationErrors(operation)
	});
}
function validatePositiveLimit(value, label, maximum) {
	const normalized = validatePluginStorePositiveInteger({
		value,
		label,
		errors: validationErrors("open")
	});
	if (normalized > maximum) throw invalidInput(`${label} must be <= ${maximum}`, "open");
	return normalized;
}
const optionPolicy = createPluginStoreOptionPolicy({
	label: "plugin blob",
	invalid: (message) => invalidInput(message, "open")
});
function validateTtl(value, operation) {
	return validateOptionalPluginStoreTtlMs({
		value,
		label: "plugin blob ttlMs",
		errors: validationErrors(operation)
	});
}
function prepareBlob(params) {
	const key = validateKey(params.key, "register");
	if (!(params.bytes instanceof Uint8Array)) throw invalidInput("plugin blob bytes must be a Uint8Array");
	if (params.bytes.byteLength > params.maxBytesPerEntry) throw limitError(`plugin blob entry exceeds the configured ${params.maxBytesPerEntry} byte limit`);
	const metadataJson = serializePluginStoreJson({
		value: params.metadata,
		label: "plugin blob metadata",
		errors: validationErrors("register")
	});
	const ttlMs = validateTtl(params.opts?.ttlMs, "register") ?? params.defaultTtlMs;
	return {
		key,
		bytes: Uint8Array.from(params.bytes),
		metadataJson,
		...ttlMs !== void 0 ? { ttlMs } : {}
	};
}
function parseMetadata(raw, operation, env) {
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new PluginBlobStoreError("Plugin blob entry contains corrupt metadata JSON.", {
			code: "PLUGIN_BLOB_CORRUPT",
			operation,
			path: resolveOpenClawStateSqlitePath(env ?? process.env),
			cause: error
		});
	}
}
function storedInfoToEntryInfo(row, operation, env) {
	const expiresAt = normalizeSqliteNumber(row.expires_at);
	return {
		key: row.entry_key,
		metadata: parseMetadata(row.metadata_json, operation, env),
		sizeBytes: Number(row.size_bytes),
		createdAt: normalizeSqliteNumber(row.created_at) ?? 0,
		...expiresAt != null ? { expiresAt } : {}
	};
}
function storedEntryToEntry(row, env) {
	return {
		...storedInfoToEntryInfo(row, "lookup", env),
		bytes: Uint8Array.from(row.blob)
	};
}
function createPluginBlobStoreInternal(pluginId, options, env) {
	if (pluginId.startsWith("core:")) throw invalidInput("Plugin ids starting with 'core:' are reserved for core consumers.", "open");
	const namespace = validateNamespace(options.namespace);
	const maxEntries = validatePositiveLimit(options.maxEntries, "plugin blob maxEntries", MAX_PLUGIN_BLOB_ENTRIES_PER_PLUGIN);
	const maxBytesPerEntry = validatePositiveLimit(options.maxBytesPerEntry, "plugin blob maxBytesPerEntry", MAX_PLUGIN_BLOB_BYTES_PER_ENTRY);
	const maxBytesPerNamespace = validatePositiveLimit(options.maxBytesPerNamespace, "plugin blob maxBytesPerNamespace", MAX_PLUGIN_BLOB_BYTES_PER_PLUGIN);
	if (maxBytesPerEntry > maxBytesPerNamespace) throw invalidInput("plugin blob maxBytesPerEntry must not exceed maxBytesPerNamespace", "open");
	const overflowPolicy = optionPolicy.resolveOverflowPolicy(options.overflowPolicy);
	const defaultTtlMs = validateTtl(options.defaultTtlMs, "open");
	optionPolicy.assertConsistent(pluginId, namespace, {
		maxEntries,
		maxBytesPerEntry,
		maxBytesPerNamespace,
		overflowPolicy,
		defaultTtlMs
	});
	const writeParams = (blob) => ({
		pluginId,
		namespace,
		key: blob.key,
		bytes: blob.bytes,
		metadataJson: blob.metadataJson,
		maxEntries,
		maxBytesPerNamespace,
		overflowPolicy,
		...blob.ttlMs !== void 0 ? { ttlMs: blob.ttlMs } : {},
		...env ? { env } : {}
	});
	return {
		async register(key, bytes, metadata, opts) {
			const blob = prepareBlob({
				key,
				bytes,
				metadata,
				maxBytesPerEntry,
				defaultTtlMs,
				opts
			});
			pluginBlobRegister(writeParams(blob));
		},
		async registerIfAbsent(key, bytes, metadata, opts) {
			const blob = prepareBlob({
				key,
				bytes,
				metadata,
				maxBytesPerEntry,
				defaultTtlMs,
				opts
			});
			return pluginBlobRegisterIfAbsent(writeParams(blob));
		},
		async lookup(key) {
			const row = pluginBlobLookup({
				pluginId,
				namespace,
				key: validateKey(key, "lookup"),
				...env ? { env } : {}
			});
			return row ? storedEntryToEntry(row, env) : void 0;
		},
		async entries() {
			return pluginBlobEntries({
				pluginId,
				namespace,
				...env ? { env } : {}
			}).map((row) => storedInfoToEntryInfo(row, "entries", env));
		},
		async delete(key) {
			return pluginBlobDelete({
				pluginId,
				namespace,
				key: validateKey(key, "delete"),
				...env ? { env } : {}
			});
		},
		async deleteExpiredKey(key) {
			const row = pluginBlobDeleteExpiredKey({
				pluginId,
				namespace,
				key: validateKey(key, "sweep"),
				validateMetadataJson: (raw) => {
					parseMetadata(raw, "sweep", env);
				},
				...env ? { env } : {}
			});
			return row ? storedInfoToEntryInfo(row, "sweep", env) : void 0;
		},
		async deleteExpired() {
			return pluginBlobDeleteExpired({
				pluginId,
				namespace,
				validateMetadataJson: (raw) => {
					parseMetadata(raw, "sweep", env);
				},
				...env ? { env } : {}
			}).map((row) => storedInfoToEntryInfo(row, "sweep", env));
		},
		async clear() {
			pluginBlobClear({
				pluginId,
				namespace,
				...env ? { env } : {}
			});
		}
	};
}
/** Opens an async blob namespace for a non-core plugin id. */
function createPluginBlobStore(pluginId, options) {
	return createPluginBlobStoreInternal(pluginId, options);
}
//#endregion
//#region src/plugins/registry-runtime.ts
function createPluginRuntimeResolver(state) {
	const { registry, registryParams } = state;
	const pluginRuntimeById = /* @__PURE__ */ new Map();
	const pluginRuntimeRecordById = /* @__PURE__ */ new Map();
	const activePluginRuntimeRecords = /* @__PURE__ */ new WeakSet();
	const recordChannelRuntime = /* @__PURE__ */ new WeakMap();
	const registeredChannelRuntime = /* @__PURE__ */ new WeakMap();
	const registeredRuntimeRecordById = /* @__PURE__ */ new Map();
	const registeredAdmissionOwnerByRecord = /* @__PURE__ */ new WeakMap();
	const addPluginRuntimeResolutionContext = (params) => {
		const { error, pluginId, prop } = params;
		if (error instanceof Error && error.message.startsWith("Unable to resolve plugin runtime module") && !error.message.includes("pluginRuntimeContext=")) {
			const record = pluginRuntimeRecordById.get(pluginId) ?? registry.plugins.find((entry) => entry.id === pluginId);
			const propName = typeof prop === "symbol" ? prop.description ?? prop.toString() : String(prop);
			error.message = [
				error.message,
				`pluginRuntimeContext=pluginId:${pluginId}`,
				`property:${propName}`,
				...record?.source ? [`source:${record.source}`] : []
			].join("; ");
		}
		throw error;
	};
	const resolveRecordChannelRuntime = (record, requireCurrentRuntimeRecord) => {
		const cache = requireCurrentRuntimeRecord ? recordChannelRuntime : registeredChannelRuntime;
		const cached = cache.get(record);
		const cachedOwner = registeredAdmissionOwnerByRecord.get(record);
		if (cached && (requireCurrentRuntimeRecord || cachedOwner?.isLive() === true)) return cached;
		if (!requireCurrentRuntimeRecord && cachedOwner) {
			cachedOwner.dispose();
			registeredAdmissionOwnerByRecord.delete(record);
		}
		const channel = (() => {
			try {
				return Reflect.get(registryParams.runtime, "channel", registryParams.runtime);
			} catch (error) {
				return addPluginRuntimeResolutionContext({
					error,
					pluginId: record.id,
					prop: "channel"
				});
			}
		})();
		if (record.origin !== "bundled" || requireCurrentRuntimeRecord) {
			cache.set(record, channel);
			return channel;
		}
		const ownsLiveRegistrySlot = () => activePluginRuntimeRecords.has(record) && registeredRuntimeRecordById.get(record.id) === record && isPluginRegistryActivated(registry) && !isPluginRegistryRetired(registry) && registry.plugins.some((candidate) => candidate === record && candidate.status === "loaded");
		const previousRecord = registeredRuntimeRecordById.get(record.id);
		if (previousRecord && previousRecord !== record) {
			registeredAdmissionOwnerByRecord.get(previousRecord)?.dispose();
			registeredAdmissionOwnerByRecord.delete(previousRecord);
			revokePluginRecordLifecycleEpoch(registry, previousRecord);
		}
		registeredRuntimeRecordById.set(record.id, record);
		const epoch = activatePluginRecordLifecycleEpoch(registry, record);
		if (!epoch) {
			cache.set(record, channel);
			return channel;
		}
		const owner = Object.freeze({
			channelId: record.id,
			record,
			epoch,
			resolveGatewayContext: getGatewayContextResolver(registryParams.runtime.subagent),
			isLive: () => ownsLiveRegistrySlot() && isPluginRecordLifecycleEpochActive(registry, record, epoch)
		});
		const disposeOwner = registerChannelIngressHostOwner(owner);
		registeredAdmissionOwnerByRecord.set(record, {
			isLive: owner.isLive,
			dispose: disposeOwner
		});
		const buildHostContext = createHostChannelInboundEventContextBuilder(channel.inbound.buildContext, owner);
		const buildContext = ((params) => {
			return buildHostContext(params);
		});
		const scoped = {
			...channel,
			inbound: {
				...channel.inbound,
				buildContext
			}
		};
		cache.set(record, scoped);
		return scoped;
	};
	const resolvePluginRuntime = (pluginId) => {
		const cached = pluginRuntimeById.get(pluginId);
		if (cached) return cached;
		const loadSessionOwnership = createLazyRuntimeSurface(() => import("./registry-runtime-session-ownership-B1XvaNE7.js"), (module) => module.createPluginSessionOwnership(state, pluginId));
		let scopedAgentRuntime;
		const assertTrustedPluginRuntime = (methodName) => {
			const record = pluginRuntimeRecordById.get(pluginId) ?? registry.plugins.find((entry) => entry.id === pluginId);
			if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins in this release. Plugin "${pluginId}" loaded with origin "${record?.origin ?? "unknown"}"; reinstall it from its official npm package or ClawHub listing to enable trusted plugin state.`);
		};
		const runtime = new Proxy(registryParams.runtime, { get(target, prop, receiver) {
			const runWithPluginScope = (run) => {
				const record = pluginRuntimeRecordById.get(pluginId) ?? registry.plugins.find((entry) => entry.id === pluginId);
				return record?.source ? withPluginRuntimePluginScope({
					pluginId,
					pluginSource: record.source,
					pluginOrigin: record.origin,
					pluginTrustedOfficialInstall: record.trustedOfficialInstall
				}, run) : withPluginRuntimePluginScope({ pluginId }, run);
			};
			const getRuntimeProperty = () => {
				try {
					return Reflect.get(target, prop, receiver);
				} catch (error) {
					return addPluginRuntimeResolutionContext({
						error,
						pluginId,
						prop
					});
				}
			};
			if (prop === "state") {
				const baseState = getRuntimeProperty();
				return {
					...baseState,
					openBlobStore: (options) => {
						assertTrustedPluginRuntime("openBlobStore");
						return createPluginBlobStore(pluginId, options);
					},
					openKeyedStore: (options) => {
						assertTrustedPluginRuntime("openKeyedStore");
						return createPluginStateKeyedStore(pluginId, options);
					},
					openSyncKeyedStore: (options) => {
						assertTrustedPluginRuntime("openSyncKeyedStore");
						return createPluginStateSyncKeyedStore(pluginId, options);
					},
					openChannelIngressQueue: (options) => {
						assertTrustedPluginRuntime("openChannelIngressQueue");
						const stateDir = options?.stateDir ?? baseState.resolveStateDir();
						return createChannelIngressQueue({
							...options,
							channelId: pluginId,
							stateDir
						});
					},
					openChannelIngressDrain: (options) => {
						assertTrustedPluginRuntime("openChannelIngressDrain");
						const stateDir = options.stateDir ?? baseState.resolveStateDir();
						const queue = options.queue ?? createChannelIngressQueue({
							channelId: pluginId,
							accountId: options.accountId,
							stateDir
						});
						const { queue: _queue, accountId: _accountId, stateDir: _stateDir, ...drainOptions } = options;
						return createChannelIngressDrain({
							...drainOptions,
							queue
						});
					}
				};
			}
			if (prop === "config") {
				const config = getRuntimeProperty();
				return {
					...config,
					current: () => runWithPluginScope(() => config.current()),
					mutateConfigFile: (params) => runWithPluginScope(() => config.mutateConfigFile(params)),
					replaceConfigFile: (params) => runWithPluginScope(() => config.replaceConfigFile(params))
				};
			}
			if (prop === "channel") {
				const ownerRecord = pluginRuntimeRecordById.get(pluginId);
				if (!ownerRecord) return getRuntimeProperty();
				return resolveRecordChannelRuntime(ownerRecord, true);
			}
			if (prop === "llm") {
				const llm = getRuntimeProperty();
				return {
					acquireLocalService: (...args) => withPluginRuntimePluginIdScope(pluginId, () => llm.acquireLocalService(...args)),
					complete: (params) => withPluginRuntimePluginIdScope(pluginId, () => llm.complete(params))
				};
			}
			if (prop === "gateway") {
				const gateway = getRuntimeProperty();
				return {
					isAvailable: () => runWithPluginScope(() => gateway.isAvailable()),
					request: async (method, params, options) => {
						const { assertGatewaySessionRequestOwned } = await loadSessionOwnership();
						return await runWithPluginScope(async () => {
							assertGatewaySessionRequestOwned(method, params);
							return await gateway.request(method, params, options);
						});
					}
				};
			}
			if (prop === "hooks") {
				const hooks = getRuntimeProperty();
				return { dispatchHookAgentTurn: async (params) => {
					assertTrustedPluginRuntime("dispatchHookAgentTurn");
					return await runWithPluginScope(() => hooks.dispatchHookAgentTurn(params));
				} };
			}
			if (prop === "nodes") {
				const nodes = getRuntimeProperty();
				return {
					list: (params) => runWithPluginScope(() => nodes.list(params)),
					invoke: (params) => runWithPluginScope(() => nodes.invoke(params)),
					openDuplex: (params) => withPluginRuntimeRegistryScope(registry, () => runWithPluginScope(() => nodes.openDuplex(params)))
				};
			}
			if (prop === "agent") {
				if (scopedAgentRuntime) return scopedAgentRuntime;
				const agent = getRuntimeProperty();
				const session = agent.session;
				const scopedSession = {
					resolveStorePath: session.resolveStorePath,
					getSessionEntry: session.getSessionEntry,
					listSessionEntries: session.listSessionEntries,
					createSessionEntry: async (params) => {
						const { assertOwnedHarness, assertReservedSessionKeyOwned } = await loadSessionOwnership();
						return await runWithPluginScope(async () => {
							if ([
								"agentHarnessId" in params.initialEntry,
								"cliBackendId" in params.initialEntry,
								"acpSessionBinding" in params.initialEntry
							].filter(Boolean).length !== 1) throw new Error(`Plugin "${pluginId}" session creation requires exactly one runtime owner.`);
							if ("agentHarnessId" in params.initialEntry) {
								assertOwnedHarness(params.initialEntry.agentHarnessId, "create its sessions");
								assertReservedSessionKeyOwned(params.key, "create");
								return await session.createSessionEntry(params);
							}
							if ("acpSessionBinding" in params.initialEntry) {
								if (!params.key.startsWith(`plugin:${pluginId}:`)) throw new Error(`Plugin "${pluginId}" session keys must start with "plugin:${pluginId}:".`);
								return await session.createSessionEntry({
									...params,
									initialEntry: {
										...params.initialEntry,
										pluginOwnerId: pluginId
									}
								});
							}
							const cliInitial = params.initialEntry;
							const backend = registry.cliBackends.find((entry) => entry.backend.id === cliInitial.cliBackendId);
							if (!backend || backend.pluginId !== pluginId) throw new Error(`Plugin "${pluginId}" must own CLI backend "${cliInitial.cliBackendId}" to create its sessions.`);
							if (!params.key.startsWith(`plugin:${pluginId}:`)) throw new Error(`Plugin "${pluginId}" session keys must start with "plugin:${pluginId}:".`);
							return await session.createSessionEntry({
								...params,
								initialEntry: {
									...cliInitial,
									pluginOwnerId: pluginId
								}
							});
						});
					},
					patchSessionEntry: async (params) => {
						const { assertStoredSessionEntryOwned, assertStoreEntryOwned } = await loadSessionOwnership();
						return await runWithPluginScope(async () => {
							assertStoredSessionEntryOwned({
								action: "patch",
								sessionKey: params.sessionKey,
								...params.agentId !== void 0 ? { agentId: params.agentId } : {},
								...params.env !== void 0 ? { env: params.env } : {},
								...params.storePath !== void 0 ? { storePath: params.storePath } : {}
							});
							return await session.patchSessionEntry({
								...params,
								update: async (entry, context) => {
									const patch = await params.update(entry, context);
									if (!patch) return patch;
									const next = params.replaceEntry ? patch : {
										...entry,
										...patch
									};
									assertStoreEntryOwned({
										action: "patch",
										before: context.existingEntry ?? entry,
										entry: next,
										sessionKey: params.sessionKey
									});
									return patch;
								}
							});
						});
					},
					upsertSessionEntry: async (params) => {
						const { assertStoredSessionEntryOwned, assertStoreEntryOwned } = await loadSessionOwnership();
						return await runWithPluginScope(async () => {
							const before = assertStoredSessionEntryOwned({
								action: "upsert",
								sessionKey: params.sessionKey,
								...params.agentId !== void 0 ? { agentId: params.agentId } : {},
								...params.env !== void 0 ? { env: params.env } : {},
								...params.storePath !== void 0 ? { storePath: params.storePath } : {}
							});
							assertStoreEntryOwned({
								action: "upsert",
								before,
								entry: params.entry,
								sessionKey: params.sessionKey
							});
							await session.upsertSessionEntry(params);
						});
					},
					runWithWorkAdmission: async (params, run) => {
						const { resolveStoredSessionExecutionOwner } = await loadSessionOwnership();
						return await runWithPluginScope(async () => {
							const resolveCurrentExecutionOwner = () => resolveStoredSessionExecutionOwner({
								action: "admit work on",
								sessionKey: params.sessionKey,
								storePath: params.storePath
							});
							const ownerPluginId = resolveCurrentExecutionOwner();
							return await (ownerPluginId ? resolvePluginRuntime(ownerPluginId).agent.session : session).runWithWorkAdmission(params, async (signal) => {
								if (resolveCurrentExecutionOwner() !== ownerPluginId) throw new Error(`Session "${params.sessionKey}" changed execution ownership while starting work.`);
								return await runWithPluginScope(() => run(signal));
							});
						});
					},
					updateSessionStoreEntry: async (params) => {
						const { assertStoredSessionEntryOwned, assertStoreEntryOwned } = await loadSessionOwnership();
						return await runWithPluginScope(async () => {
							assertStoredSessionEntryOwned({
								action: "update",
								sessionKey: params.sessionKey,
								storePath: params.storePath
							});
							return await session.updateSessionStoreEntry({
								...params,
								update: async (entry) => {
									const patch = await params.update(entry);
									if (!patch) return patch;
									assertStoreEntryOwned({
										action: "update",
										before: entry,
										entry: {
											...entry,
											...patch
										},
										sessionKey: params.sessionKey
									});
									return patch;
								}
							});
						});
					}
				};
				const runEmbeddedAgent = async (params) => {
					const runParams = {
						...params,
						skillWorkshopCollectionReconcile: void 0
					};
					const { resolveRunSessionExecutionOwner } = await loadSessionOwnership();
					return await runWithPluginScope(async () => {
						const ownerPluginId = resolveRunSessionExecutionOwner(runParams);
						if (ownerPluginId) return await resolvePluginRuntime(ownerPluginId).agent.runEmbeddedAgent(runParams);
						return await agent.runEmbeddedAgent(runParams);
					});
				};
				const channelOwnerRecord = pluginRuntimeRecordById.get(pluginId);
				const runCommandFromIngress = async (params, commandRuntime) => {
					const { senderIsOwner: claimedOwner, messageChannel, ...remainingParams } = params;
					const senderIsOwner = claimedOwner === true;
					const ingressParams = {
						...remainingParams,
						senderIsOwner,
						messageChannel
					};
					if (!channelOwnerRecord || senderIsOwner && channelOwnerRecord.origin !== "bundled" && channelOwnerRecord.trustedOfficialInstall !== true || pluginRuntimeRecordById.get(pluginId) !== channelOwnerRecord || !activePluginRuntimeRecords.has(channelOwnerRecord) || isPluginRegistryRetired(registry) || !registry.plugins.some((record) => record === channelOwnerRecord && record.status === "loaded") || !registry.channels.some((channel) => channel.pluginId === pluginId && channel.plugin.id === messageChannel)) throw new Error(`Plugin "${pluginId}" cannot admit authenticated owner authority for channel "${messageChannel ?? "unknown"}".`);
					return await runWithPluginScope(() => agent.runCommandFromIngress(ingressParams, commandRuntime));
				};
				const scopedAgent = Object.create(Object.getPrototypeOf(agent), Object.getOwnPropertyDescriptors(agent));
				Object.defineProperties(scopedAgent, {
					runCommandFromIngress: {
						configurable: true,
						enumerable: true,
						value: runCommandFromIngress
					},
					runEmbeddedAgent: {
						configurable: true,
						enumerable: true,
						value: runEmbeddedAgent
					},
					session: {
						configurable: true,
						enumerable: true,
						value: scopedSession
					}
				});
				scopedAgentRuntime = scopedAgent;
				return scopedAgentRuntime;
			}
			if (prop !== "subagent") return getRuntimeProperty();
			const subagent = getRuntimeProperty();
			// vlab91-native-scoped-subagent-context-v1: retain the underlying Gateway fence across the plugin facade.
			const scopedSubagent = {
				run: async (params) => {
					const { assertSessionIdentitiesOwned } = await loadSessionOwnership();
					return await withPluginRuntimePluginIdScope(pluginId, async () => {
						assertSessionIdentitiesOwned({
							action: "run",
							sessionKeys: [params.sessionKey]
						});
						return await subagent.run(params);
					});
				},
				waitForRun: (params) => withPluginRuntimePluginIdScope(pluginId, () => subagent.waitForRun(params)),
				getSessionMessages: (params) => withPluginRuntimePluginIdScope(pluginId, () => subagent.getSessionMessages(params)),
				deleteSession: async (params) => {
					const { assertStoredSessionEntryOwned } = await loadSessionOwnership();
					return await withPluginRuntimePluginIdScope(pluginId, async () => {
						assertStoredSessionEntryOwned({
							action: "delete",
							sessionKey: params.sessionKey
						});
						await subagent.deleteSession(params);
					});
				}
			};
			bindGatewayContextResolver(scopedSubagent, getGatewayContextResolver(subagent));
			return scopedSubagent;
		} });
		pluginRuntimeById.set(pluginId, runtime);
		return runtime;
	};
	return {
		resolvePluginRuntime,
		resolveRegisteredChannelRuntime: (record) => resolveRecordChannelRuntime(record, false),
		setPluginRuntimeRecord: (record) => {
			pluginRuntimeRecordById.set(record.id, record);
			activePluginRuntimeRecords.add(record);
		},
		revokePluginRuntimeRecord: (pluginId, record) => {
			const ownedRecord = record ?? pluginRuntimeRecordById.get(pluginId);
			if (ownedRecord) {
				activePluginRuntimeRecords.delete(ownedRecord);
				revokePluginRecordLifecycleEpoch(registry, ownedRecord);
				registeredAdmissionOwnerByRecord.get(ownedRecord)?.dispose();
				registeredAdmissionOwnerByRecord.delete(ownedRecord);
				if (registeredRuntimeRecordById.get(pluginId) === ownedRecord) registeredRuntimeRecordById.delete(pluginId);
			}
		}
	};
}
//#endregion
//#region src/plugins/registry.ts
/** In-memory plugin registry builder and mutation API for plugin runtime registration. */
function clonePluginRecord(record) {
	return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
}
function restorePluginRecord(record, snapshot) {
	Object.keys(record).forEach((key) => Reflect.deleteProperty(record, key));
	Object.assign(record, snapshot);
}
/**
* Compose the registry state, domain registrars, scoped runtime, and plugin API.
* Domain modules own validation and mutation; this function owns lifecycle wiring only.
*/
function createPluginRegistry(registryParams) {
	const state = createPluginRegistryState(registryParams);
	const registrars = createPluginRegistrars(state);
	const runtimeResolver = createPluginRuntimeResolver(state);
	const { createApi: createPluginApi, deactivatePluginSideEffectGuards } = createPluginApiFactory(state, registrars, runtimeResolver);
	const registrationRecordSnapshots = /* @__PURE__ */ new WeakMap();
	const createApi = (record, params) => {
		registrationRecordSnapshots.set(record, clonePluginRecord(record));
		return createPluginApi(record, params);
	};
	const rollbackPluginGlobalSideEffects = (pluginId, record) => {
		deactivatePluginSideEffectGuards(pluginId);
		runtimeResolver.revokePluginRuntimeRecord(pluginId, record);
		const schedulerRecords = state.registry.sessionSchedulerJobs.filter((r) => r.pluginId === pluginId);
		const gatewayMethods = state.registry.gatewayMethodDescriptors.filter((entry) => entry.owner.kind === "plugin" && entry.owner.pluginId === pluginId).map((entry) => entry.name);
		for (const [registryKey, value] of Object.entries(state.registry)) {
			if (registryKey === "plugins" || registryKey === "diagnostics") continue;
			if (Array.isArray(value)) for (let index = value.length - 1; index >= 0; index -= 1) {
				const entry = value[index];
				if (entry?.pluginId === pluginId || entry?.ownerPluginId === pluginId || entry?.owner?.pluginId === pluginId) value.splice(index, 1);
			}
			else if (value instanceof Map) for (const [key, entry] of value) {
				const owner = entry;
				if (owner?.pluginId === pluginId || owner?.owner === `plugin:${pluginId}`) value.delete(key);
			}
		}
		for (const method of gatewayMethods) delete state.registry.gatewayHandlers[method];
		for (const key of state.registry.pluginRuntimeArtifacts.keys()) if (JSON.parse(key)[0] === pluginId) state.registry.pluginRuntimeArtifacts.delete(key);
		const recordSnapshot = record ? registrationRecordSnapshots.get(record) : void 0;
		if (record && recordSnapshot) {
			restorePluginRecord(record, recordSnapshot);
			registrationRecordSnapshots.delete(record);
		}
		if (registryParams.activateGlobalSideEffects !== false && schedulerRecords.length > 0) cleanupPluginSessionSchedulerJobs({
			pluginId,
			reason: "disable",
			records: schedulerRecords,
			cleanupOwnerRegistry: state.registry
		}).then((failures) => {
			for (const failure of failures) state.pushDiagnostic({
				level: "warn",
				pluginId: failure.pluginId,
				message: `scheduler job cleanup failed during rollback: ${failure.hookId}`
			});
		});
	};
	return {
		registry: state.registry,
		createApi,
		rollbackPluginGlobalSideEffects,
		pushDiagnostic: state.pushDiagnostic,
		registerTool: registrars.registerTool,
		registerChannel: registrars.registerChannel,
		registerHostedMediaResolver: registrars.registerHostedMediaResolver,
		registerWidgetPresenter: registrars.registerWidgetPresenter,
		registerMcpServerConnectionResolver: registrars.registerMcpServerConnectionResolver,
		registerProvider: registrars.registerProvider,
		registerWorkerProvider: registrars.registerWorkerProvider,
		registerModelCatalogProvider: registrars.registerModelCatalogProvider,
		registerAgentHarness: registrars.registerAgentHarness,
		registerCliBackend: registrars.registerCliBackend,
		registerTextTransforms: registrars.registerTextTransforms,
		registerEmbeddingProvider: registrars.registerEmbeddingProvider,
		registerSpeechProvider: registrars.registerSpeechProvider,
		registerRealtimeTranscriptionProvider: registrars.registerRealtimeTranscriptionProvider,
		registerRealtimeVoiceProvider: registrars.registerRealtimeVoiceProvider,
		registerMediaUnderstandingProvider: registrars.registerMediaUnderstandingProvider,
		registerTranscriptSourceProvider: registrars.registerTranscriptSourceProvider,
		registerImageGenerationProvider: registrars.registerImageGenerationProvider,
		registerVideoGenerationProvider: registrars.registerVideoGenerationProvider,
		registerMusicGenerationProvider: registrars.registerMusicGenerationProvider,
		registerWebSearchProvider: registrars.registerWebSearchProvider,
		registerMigrationProvider: registrars.registerMigrationProvider,
		registerGatewayMethod: registrars.registerGatewayMethod,
		registerSessionCatalog: registrars.registerSessionCatalog,
		registerCli: registrars.registerCli,
		registerReload: registrars.registerReload,
		registerNodeHostCommand: registrars.registerNodeHostCommand,
		registerSecurityAuditCollector: registrars.registerSecurityAuditCollector,
		registerService: registrars.registerService,
		registerCommand: registrars.registerCommand,
		registerSessionExtension: registrars.registerSessionExtension,
		registerTrustedToolPolicy: registrars.registerTrustedToolPolicy,
		registerToolMetadata: registrars.registerToolMetadata,
		registerControlUiDescriptor: registrars.registerControlUiDescriptor,
		registerBoardWidgetContentKind: registrars.registerBoardWidgetContentKind,
		registerRuntimeLifecycle: registrars.registerRuntimeLifecycle,
		registerAgentEventSubscription: registrars.registerAgentEventSubscription,
		registerSessionSchedulerJob: registrars.registerSessionSchedulerJob,
		registerSessionAction: registrars.registerSessionAction,
		registerHook: registrars.registerHook,
		registerTypedHook: registrars.registerTypedHook
	};
}
//#endregion
//#region src/plugins/loader-runtime-load.ts
function createDeferredGatewaySubagentRuntime(runtime) {
	// vlab91-native-deferred-subagent-context-v1: preserve the native lifecycle-fenced instance resolver.
	const deferred = {
		run: (...args) => runtime.subagent.run(...args),
		waitForRun: (...args) => runtime.subagent.waitForRun(...args),
		getSessionMessages: (...args) => runtime.subagent.getSessionMessages(...args),
		deleteSession: (...args) => runtime.subagent.deleteSession(...args)
	};
	// vlab91-native-deferred-subagent-context-v2: Gateway binds the native runtime after plugin registration.
	let capturedResolver = getGatewayContextResolver(runtime.subagent);
	bindGatewayContextResolver(deferred, () => {
		capturedResolver ??= getGatewayContextResolver(runtime.subagent);
		if (!capturedResolver) throw new Error("Native Gateway subagent context is not ready");
		return capturedResolver();
	});
	return deferred;
}
function createDeferredGatewayNodesRuntime(runtime) {
	return {
		list: (...args) => runtime.nodes.list(...args),
		invoke: (...args) => runtime.nodes.invoke(...args),
		openDuplex: (...args) => runtime.nodes.openDuplex(...args)
	};
}
function loadOpenClawPlugins(options = {}) {
	return loadOpenClawPluginsInternal(options);
}
/** Internal entry for host-owned snapshots that need a narrow registration runtime. */
function loadOpenClawPluginsWithInternalOverrides(options, overrides) {
	return loadOpenClawPluginsInternal(options, overrides);
}
function loadOpenClawPluginsInternal(options, overrides) {
	const requestedOnlyPluginIds = normalizePluginIdScope(options.onlyPluginIds);
	const requestedOnlyPluginIdSet = createPluginIdScopeSet(requestedOnlyPluginIds);
	if (requestedOnlyPluginIdSet && requestedOnlyPluginIdSet.size === 0) {
		const emptyRegistry = createEmptyPluginRegistry();
		if (options.activate !== false) {
			const runtimeSubagentMode = resolveRuntimeSubagentMode(options.runtimeOptions);
			activatePluginRegistry(emptyRegistry, `empty-plugin-scope::${runtimeSubagentMode}::${options.workspaceDir ?? ""}`, runtimeSubagentMode, options.workspaceDir);
		}
		return emptyRegistry;
	}
	const context = resolvePluginLoadCacheContext(options);
	const logger = options.logger ?? createPluginLoaderLogger();
	const validateOnly = options.mode === "validate";
	const onlyPluginIdSet = createPluginIdScopeSet(context.onlyPluginIds);
	const cacheEnabled = isPluginRegistryCacheEnabled(options);
	if (cacheEnabled) {
		const cached = pluginLoaderCacheState.get(context.cacheKey);
		if (cached) {
			maybeThrowOnPluginLoadError(cached, options.throwOnLoadError);
			if (context.shouldActivate) activatePluginRegistry(cached, context.cacheKey, context.runtimeSubagentMode, options.workspaceDir);
			return cached;
		}
	}
	pluginLoaderCacheState.beginLoad(context.cacheKey);
	let registryBuilder;
	try {
		const loadPluginModule = createPluginModuleLoader({
			devSourceRoot: context.devSourceRoot,
			pluginSdkResolution: options.pluginSdkResolution,
			...overrides?.moduleLoader
		});
		const activeRuntime = options.runtimeOptions?.allowGatewaySubagentBinding === true ? getActivePluginRegistry() : void 0;
		const activeGatewayRuntime = activeRuntime ? getPluginRegistryRuntime(activeRuntime) : void 0;
		const borrowedSubagent = activeGatewayRuntime ? createDeferredGatewaySubagentRuntime(activeGatewayRuntime) : void 0;
		const borrowedNodes = activeGatewayRuntime ? createDeferredGatewayNodesRuntime(activeGatewayRuntime) : void 0;
		registryBuilder = createPluginRegistry({
			logger,
			runtime: overrides?.runtime ? overrides.runtime : createLazyPluginRuntime({
				devSourceRoot: context.devSourceRoot,
				pluginSdkResolution: options.pluginSdkResolution,
				runtimeOptions: {
					...options.runtimeOptions,
					subagent: options.runtimeOptions?.subagent ?? borrowedSubagent,
					nodes: options.runtimeOptions?.nodes ?? borrowedNodes
				},
				loadPluginModule
			}),
			allowProcessHomeSessionCatalogs: options.allowProcessHomeSessionCatalogs ?? true,
			coreGatewayHandlers: options.coreGatewayHandlers,
			...options.coreGatewayMethodNames !== void 0 && { coreGatewayMethodNames: options.coreGatewayMethodNames },
			...options.hostServices !== void 0 && { hostServices: options.hostServices },
			activateGlobalSideEffects: context.shouldActivate
		});
		const { registry } = registryBuilder;
		const { manifestRegistry, orderedCandidates, manifestBySource, provenance } = resolvePluginLoadDiscovery({
			options,
			context,
			diagnostics: registry.diagnostics,
			logger,
			onlyPluginIdSet,
			emitWarning: context.shouldActivate,
			warningCacheKey: context.cacheKey
		});
		const selectedMiddlewareOwnerManifests = /* @__PURE__ */ new Map();
		for (const candidate of orderedCandidates) {
			const record = manifestBySource.get(candidate.source);
			if (record && !selectedMiddlewareOwnerManifests.has(record.id)) selectedMiddlewareOwnerManifests.set(record.id, record);
		}
		for (const record of selectedMiddlewareOwnerManifests.values()) {
			const activation = resolveEffectivePluginActivationState({
				id: record.id,
				origin: record.origin,
				channelIds: record.channels,
				config: context.normalized,
				rootConfig: context.cfg,
				enabledByDefault: isPluginEnabledByDefaultForPlatform(record),
				activationSource: context.activationSource
			});
			const runtimes = normalizeAgentToolResultMiddlewareRuntimeIds(record.contracts?.agentToolResultMiddleware);
			if (runtimes.length > 0 && (record.origin === "bundled" || activation.enabled && activation.explicitlyEnabled)) registry.agentToolResultMiddlewareOwners.push({
				pluginId: record.id,
				runtimes,
				manifest: record
			});
		}
		const memorySlot = context.normalized.slots.memory;
		const state = {
			seenIds: /* @__PURE__ */ new Map(),
			selectedMemoryPluginId: null,
			memorySlotMatched: false,
			pluginLoadAttemptCount: 0
		};
		const dreamingSidecar = resolveAuthorizedDreamingSidecar({
			cfg: context.cfg,
			normalized: context.normalized,
			activationSource: context.activationSource,
			manifestRegistry,
			memorySlot
		});
		const pluginLoadStartMs = performance.now();
		for (const candidate of orderedCandidates) {
			const manifestRecord = manifestBySource.get(candidate.source);
			if (!manifestRecord) continue;
			loadRuntimePluginCandidate({
				candidate,
				manifestRecord,
				context,
				options,
				onlyPluginIdSet,
				dreamingSidecar,
				validateOnly,
				registryBuilder,
				loadPluginModule,
				logger,
				state
			});
		}
		const pluginLoadElapsedMs = performance.now() - pluginLoadStartMs;
		if (state.pluginLoadAttemptCount > 0) logger.debug?.(`[plugins] loaded ${registry.plugins.length} plugin(s) (${state.pluginLoadAttemptCount} attempted) in ${pluginLoadElapsedMs.toFixed(1)}ms`);
		if (!onlyPluginIdSet && typeof memorySlot === "string" && !state.memorySlotMatched) registry.diagnostics.push({
			level: "warn",
			message: `memory slot plugin not found or not marked as memory: ${memorySlot}`
		});
		warnAboutUntrackedLoadedPlugins(recordPluginInstallOwnerLookup({
			registry,
			provenance,
			allowlist: context.normalized.allow,
			emitWarning: context.shouldActivate,
			logger,
			env: context.env
		}, new Map(orderedCandidates.flatMap((candidate) => {
			const pluginId = manifestBySource.get(candidate.source)?.id;
			const installOwner = resolvePluginCandidateInstallOwner(candidate);
			return pluginId && installOwner ? [[pluginId, installOwner]] : [];
		}))));
		maybeThrowOnPluginLoadError(registry, options.throwOnLoadError);
		if (context.shouldActivate && options.mode !== "validate") {
			const failedPlugins = registry.plugins.filter((plugin) => plugin.failedAt != null);
			if (failedPlugins.length > 0) logger.warn(`[plugins] ${failedPlugins.length} plugin(s) failed to initialize (${formatPluginFailureSummary(failedPlugins)}). Run 'openclaw plugins inspect <id> --runtime --json' for runtime diagnostics, 'openclaw plugins list' for registry state, and restart the Gateway after plugin code or load-path changes.`);
		}
		if (context.shouldActivate) activatePluginRegistry(registry, context.cacheKey, context.runtimeSubagentMode, options.workspaceDir);
		if (cacheEnabled) pluginLoaderCacheState.set(context.cacheKey, registry);
		return registry;
	} catch (error) {
		if (context.shouldActivate && registryBuilder?.registry !== getActivePluginRegistry()) {
			for (const plugin of registryBuilder?.registry.plugins.toReversed() ?? []) if (plugin.status === "loaded") registryBuilder?.rollbackPluginGlobalSideEffects(plugin.id);
		}
		throw error;
	} finally {
		pluginLoaderCacheState.finishLoad(context.cacheKey);
	}
}
//#endregion
//#region src/plugins/loader-cli-registry.ts
async function loadOpenClawPluginCliRegistry(options = {}) {
	const context = resolvePluginLoadCacheContext({
		...options,
		activate: false
	});
	const cacheKey = `cli-metadata::${context.cacheKey}`;
	const cacheEnabled = isPluginRegistryCacheEnabled(options);
	if (cacheEnabled) {
		const cached = pluginLoaderCacheState.get(cacheKey);
		if (cached) return cached;
	}
	const logger = options.logger ?? createPluginLoaderLogger();
	const onlyPluginIdSet = createPluginIdScopeSet(context.onlyPluginIds);
	const loadPluginModule = createPluginModuleLoader({
		devSourceRoot: context.devSourceRoot,
		pluginSdkResolution: options.pluginSdkResolution
	});
	const { registry, registerCli, rollbackPluginGlobalSideEffects } = createPluginRegistry({
		logger,
		runtime: createUnavailableRuntime("cli-metadata"),
		coreGatewayHandlers: options.coreGatewayHandlers,
		...options.coreGatewayMethodNames !== void 0 && { coreGatewayMethodNames: options.coreGatewayMethodNames },
		activateGlobalSideEffects: false
	});
	const { manifestRegistry, orderedCandidates, manifestBySource } = resolvePluginLoadDiscovery({
		options,
		context,
		diagnostics: registry.diagnostics,
		logger,
		onlyPluginIdSet,
		emitWarning: false,
		warningCacheKey: `${context.cacheKey}::cli-metadata`
	});
	const seenIds = /* @__PURE__ */ new Map();
	const memorySlot = context.normalized.slots.memory;
	let selectedMemoryPluginId = null;
	const dreamingSidecar = resolveAuthorizedDreamingSidecar({
		cfg: context.cfg,
		normalized: context.normalized,
		activationSource: context.activationSource,
		manifestRegistry,
		memorySlot
	});
	for (const candidate of orderedCandidates) {
		const manifestRecord = manifestBySource.get(candidate.source);
		if (!manifestRecord) continue;
		const pluginId = manifestRecord.id;
		const policyId = normalizePluginPolicyId(pluginId);
		if (!matchesScopedPluginOrDreamingSidecar({
			onlyPluginIdSet,
			pluginId,
			sidecar: dreamingSidecar
		})) continue;
		const isDreamingSidecar = isAuthorizedDreamingSidecarPlugin({
			sidecar: dreamingSidecar,
			pluginId
		});
		const activationState = isDreamingSidecar ? {
			enabled: true,
			activated: true,
			explicitlyEnabled: false,
			source: "auto",
			reason: `dreaming sidecar for selected memory slot "${dreamingSidecar?.selectedMemoryPluginId ?? ""}"`
		} : resolveEffectivePluginActivationState({
			id: pluginId,
			origin: candidate.origin,
			config: context.normalized,
			rootConfig: context.cfg,
			enabledByDefault: isPluginEnabledByDefaultForPlatform(manifestRecord),
			channelIds: manifestRecord.channels,
			activationSource: context.activationSource,
			autoEnabledReason: formatAutoEnabledActivationReason(context.autoEnabledReasons[pluginId])
		});
		const existingOrigin = seenIds.get(pluginId);
		if (existingOrigin) {
			const duplicate = createManifestPluginRecord({
				candidate,
				manifestRecord,
				enabled: false,
				activationState
			});
			duplicate.status = "disabled";
			duplicate.error = `overridden by ${existingOrigin} plugin`;
			markPluginActivationDisabled(duplicate, duplicate.error);
			registry.plugins.push(duplicate);
			continue;
		}
		const enableState = isDreamingSidecar ? { enabled: true } : resolveEffectiveEnableState({
			id: pluginId,
			origin: candidate.origin,
			config: context.normalized,
			rootConfig: context.cfg,
			enabledByDefault: isPluginEnabledByDefaultForPlatform(manifestRecord),
			channelIds: manifestRecord.channels,
			activationSource: context.activationSource
		});
		const entry = context.normalized.entries[policyId];
		const record = createManifestPluginRecord({
			candidate,
			manifestRecord,
			enabled: enableState.enabled,
			activationState
		});
		applyPluginManifestRecordDetails(record, manifestRecord);
		const pushPluginLoadError = (message) => pushPluginValidationError({
			registry,
			seenIds,
			pluginId,
			origin: candidate.origin,
			record,
			message
		});
		if (!enableState.enabled) {
			record.status = "disabled";
			record.error = enableState.reason;
			markPluginActivationDisabled(record, enableState.reason);
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
			continue;
		}
		if (record.format === "bundle") {
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
			continue;
		}
		if (!manifestRecord.configSchema) {
			pushPluginLoadError("missing config schema");
			continue;
		}
		const validatedConfig = validatePluginConfig({
			origin: candidate.origin,
			schema: manifestRecord.configSchema,
			cacheKey: manifestRecord.schemaCacheKey,
			value: entry?.config,
			sourceValue: manifestRecord.configContracts?.secretInputs ? context.activationSource.plugins.entries[policyId]?.config : void 0
		});
		if (!validatedConfig.ok) {
			logger.error(`[plugins] ${record.id} invalid config: ${validatedConfig.error.join(", ")}`);
			pushPluginLoadError(`invalid config: ${validatedConfig.error.join(", ")}`);
			continue;
		}
		const cliMetadataSource = resolveCliMetadataEntrySource(candidate.rootDir, candidate.source);
		const sourceForCliMetadata = candidate.origin === "bundled" ? cliMetadataSource ? safeRealpathOrResolve(cliMetadataSource) : null : cliMetadataSource ?? candidate.source;
		if (!sourceForCliMetadata) {
			record.status = "loaded";
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
			continue;
		}
		const opened = openRootFileSync({
			absolutePath: sourceForCliMetadata,
			rootPath: safeRealpathOrResolve(candidate.rootDir),
			boundaryLabel: "plugin root",
			rejectHardlinks: shouldRejectHardlinkedPluginFiles({
				origin: candidate.origin,
				rootDir: candidate.rootDir,
				env: context.env
			}),
			skipLexicalRootCheck: true
		});
		if (!opened.ok) {
			pushPluginLoadError(describeRootFileOpenFailure({
				failure: opened,
				subject: "plugin entry path",
				boundaryLabel: "plugin root",
				filePath: sourceForCliMetadata
			}));
			continue;
		}
		const safeSource = opened.path;
		fs.closeSync(opened.fd);
		const missingDependencyHint = resolveExternalPluginRuntimeDependencyRepairHint({
			pluginId,
			packageName: candidate.packageName,
			packageBuild: candidate.packageManifest?.build
		});
		let mod;
		try {
			mod = withProfile({
				pluginId: record.id,
				source: safeSource
			}, "cli-metadata", () => loadPluginModule(safeSource));
		} catch (error) {
			recordPluginError({
				logger,
				registry,
				record,
				seenIds,
				pluginId,
				origin: candidate.origin,
				phase: "load",
				error,
				logPrefix: `[plugins] ${record.id} failed to load from ${record.source}: `,
				diagnosticMessagePrefix: "failed to load plugin: ",
				missingDependencyHint
			});
			continue;
		}
		const { definition, register } = resolvePluginModuleExport(mod);
		if (definition?.id && definition.id !== record.id) {
			pushPluginLoadError(`plugin id mismatch (config uses "${record.id}", export uses "${definition.id}")`);
			continue;
		}
		record.name = definition?.name ?? record.name;
		record.description = definition?.description ?? record.description;
		record.version = definition?.version ?? record.version;
		const manifestKind = record.kind;
		const exportKind = definition?.kind;
		if (manifestKind && exportKind && !kindsEqual(manifestKind, exportKind)) registry.diagnostics.push({
			level: "warn",
			pluginId: record.id,
			source: record.source,
			message: `plugin kind mismatch (manifest uses "${String(manifestKind)}", export uses "${String(exportKind)}")`
		});
		record.kind = definition?.kind ?? record.kind;
		if (!isDreamingSidecar) {
			const memoryDecision = resolveMemorySlotDecision({
				id: record.id,
				kind: record.kind,
				slot: memorySlot,
				selectedId: selectedMemoryPluginId
			});
			if (!memoryDecision.enabled) {
				record.enabled = false;
				record.status = "disabled";
				record.error = memoryDecision.reason;
				markPluginActivationDisabled(record, memoryDecision.reason);
				registry.plugins.push(record);
				seenIds.set(pluginId, candidate.origin);
				continue;
			}
			if (memoryDecision.selected && hasKind(record.kind, "memory")) {
				selectedMemoryPluginId = record.id;
				record.memorySlotSelected = true;
			}
		}
		if (typeof register !== "function") {
			const wrongLoaderError = formatBundledChannelWrongLoaderError(record.kind);
			if (wrongLoaderError) {
				logger.error(`[plugins] ${record.id} ${wrongLoaderError}; ensure plugin is loaded via bundled channel discovery, not legacy plugin loader`);
				pushPluginLoadError(wrongLoaderError);
			} else {
				logger.error(`[plugins] ${record.id} missing register/activate export`);
				pushPluginLoadError(formatMissingPluginRegisterError(mod, context.env));
			}
			continue;
		}
		const api = buildPluginApi({
			id: record.id,
			name: record.name,
			version: record.version,
			description: record.description,
			source: record.source,
			rootDir: record.rootDir,
			registrationMode: "cli-metadata",
			config: context.cfg,
			pluginConfig: validatedConfig.value,
			runtime: createUnavailableRuntime("cli-metadata", record.id),
			logger,
			resolvePath: (input) => resolveUserPath(input),
			handlers: { registerCli: (registrar, opts) => registerCli(record, registrar, opts) }
		});
		try {
			withProfile({
				pluginId: record.id,
				source: record.source
			}, "cli-metadata:register", () => runPluginRegisterSyncInRegistry(register, api, registry, record.id));
			registry.plugins.push(record);
			seenIds.set(pluginId, candidate.origin);
		} catch (error) {
			rollbackPluginGlobalSideEffects(record.id, record);
			recordPluginError({
				logger,
				registry,
				record,
				seenIds,
				pluginId,
				origin: candidate.origin,
				phase: "register",
				error,
				logPrefix: `[plugins] ${record.id} failed during register from ${record.source}: `,
				diagnosticMessagePrefix: "plugin failed during register: ",
				missingDependencyHint
			});
		}
	}
	if (cacheEnabled) pluginLoaderCacheState.set(cacheKey, registry);
	return registry;
}
function resolveCliMetadataEntrySource(rootDir, source) {
	for (const directory of /* @__PURE__ */ new Set([rootDir, path.dirname(source)])) for (const extension of [
		".ts",
		".js",
		".mjs",
		".cjs"
	]) {
		const candidate = path.join(directory, `cli-metadata${extension}`);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}
//#endregion
//#region src/plugins/loader-runtime-registry.ts
function resolveRuntimePluginRegistry(options) {
	const activeRegistry = resolveCompatibleRuntimePluginRegistry(options);
	if (activeRegistry) return activeRegistry;
	if (isPluginRegistryLoadInFlight(options)) return;
	return loadOpenClawPlugins({
		...options,
		activate: false
	});
}
function getRuntimePluginRegistryForLoadOptions(options) {
	return resolveRuntimePluginRegistry(options);
}
//#endregion
//#region src/plugins/loader.ts
/** Stable public facade for plugin loading and runtime-registry resolution. */
/** Loads a caller-owned registry value without changing the process-wide active registry. */
function loadPluginRegistryHandle(options = {}) {
	return loadOpenClawPlugins({
		...options,
		activate: false
	});
}
/** Loads and installs the registry owned by a process composition root. */
function loadAndActivateRootPluginRegistry(options = {}) {
	return loadOpenClawPlugins({
		...options,
		activate: true
	});
}
//#endregion
export { resolvePluginRegistryLoadCacheKey as _, loadOpenClawPluginCliRegistry as a, createHostChannelInboundEventContextBuilder as c, readCanonicalCronListPage as d, resolveCronListPageNextOffset as f, isPluginRegistryLoadInFlight as g, clearPluginRegistryLoadCache as h, resolveRuntimePluginRegistry as i, listCodexAppServerExtensionFactories as l, createRuntimeBase as m, loadPluginRegistryHandle as n, loadOpenClawPlugins as o, getPluginRegistryRuntime as p, getRuntimePluginRegistryForLoadOptions as r, loadOpenClawPluginsWithInternalOverrides as s, loadAndActivateRootPluginRegistry as t, findUndeclaredPluginToolNames as u, getAgentToolResultMiddlewareMatcherScope as v, listAgentToolResultMiddlewares as y };
