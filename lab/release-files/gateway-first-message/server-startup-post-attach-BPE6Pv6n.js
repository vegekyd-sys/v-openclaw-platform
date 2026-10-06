import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { n as isTruthyEnvValue } from "./env-UY9MQ9LW.js";
import { w as resolveStateDir } from "./paths-Dx1CjxA5.js";
import { r as getPluginModuleLoaderStats } from "./plugin-module-loader-cache-C4l9L2gm.js";
import { t as createDeferredCore } from "./deferred-D0La5CRk.js";
import { o as listAgentIds } from "./agent-scope-config-CUiGBd59.js";
import { d as withPluginRuntimeRegistryScope } from "./gateway-request-scope-CmMd3nUp.js";
import { a as getActiveGatewayRootWorkCount, b as runWithGatewayIndependentRootWorkAdmission, l as isGatewayRestartDrainError } from "./gateway-work-admission-3tn4Qiws.js";
import { v as sweepSessionStateWatchNotices } from "./session-state-events-BIoqMlY_.js";
import { s as hasRestartSentinel } from "./restart-sentinel-grguN742.js";
import { r as loadGetReplyFromConfigRuntime } from "./dispatch-from-config.runtime.js";
import { a as projectUpdateAvailable, i as canReadDetailedUpdateMetadata, r as GATEWAY_EVENT_UPDATE_AVAILABLE } from "./events-D_8lxFnu.js";
import { t as scheduleGatewayIdleTask } from "./server-idle-task-BM-2W9ay.js";
import { n as measureStartup } from "./server-startup-trace-h4U5enU8.js";
import { t as beginMacOSSystemCaWarmupOnce } from "./system-ca-warmup-CvzcuIrF.js";
import { t as hasConfiguredInternalHooks } from "./configured-Ddp8cpiI.js";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
//#region src/gateway/server-startup-context-cache-prewarm.ts
const CONTEXT_CACHE_PREWARM_START_DELAY_MS = 5e3;
const CONTEXT_CACHE_PREWARM_RETRY_DELAY_MS = 250;
function scheduleContextCachePrewarm(params) {
	let stopped = false;
	const warm = async () => {
		if (stopped) return;
		const { prewarmContextWindowCacheAfterReady } = await import("./context-CCXaMuUF.js");
		if (!stopped) await prewarmContextWindowCacheAfterReady({
			config: params.getConfig(),
			isCancelled: () => stopped
		});
	};
	const idleTask = scheduleGatewayIdleTask({
		delayMs: CONTEXT_CACHE_PREWARM_START_DELAY_MS,
		retryDelayMs: CONTEXT_CACHE_PREWARM_RETRY_DELAY_MS,
		isClosing: () => stopped,
		isBusy: () => getActiveGatewayRootWorkCount({ excludeCurrent: true }) > 0,
		run: () => params.startupTrace ? params.startupTrace.measure("post-ready.context-window-cache", warm) : warm(),
		log: params.log,
		errorMessage: "post-ready.context-window-cache failed after gateway ready"
	});
	return { stop: () => {
		stopped = true;
		idleTask.stop();
	} };
}
//#endregion
//#region src/gateway/server-startup-handler-prewarm.ts
const SIDEBAR_PREWARM_MAX_SESSION_ENTRIES = 2e3;
const GATEWAY_HANDLER_PREWARM_RETRY_DELAY_MS = 250;
async function prewarmGatewaySessionListData(cfg, agentId) {
	const [{ loadCombinedSessionStoreForGatewayCore }, { listSessionsFromStoreAsync }] = await Promise.all([import("./combined-store-gateway-DENc__P8.js"), import("./session-utils-list-DUwkWkWM.js")]);
	const { durableStorePath, storePath, store } = loadCombinedSessionStoreForGatewayCore(cfg, {
		agentId,
		projection: "list"
	});
	await listSessionsFromStoreAsync({
		cfg,
		durableStorePath,
		storePath,
		store,
		opts: {
			agentId,
			configuredAgentsOnly: true,
			includeDerivedTitles: true,
			includeGlobal: true,
			includeUnknown: true,
			limit: 200
		}
	});
}
function dashboardDataPrewarmItems(cfg, log) {
	const agentIds = listAgentIds(cfg);
	let sessionDataPrewarmChecked = false;
	let sessionDataPrewarmAllowed = false;
	const shouldPrewarmSessionData = async () => {
		if (sessionDataPrewarmChecked) return sessionDataPrewarmAllowed;
		sessionDataPrewarmChecked = true;
		const { canPrewarmCombinedSessionStoresForGateway } = await import("./combined-store-gateway-DENc__P8.js");
		sessionDataPrewarmAllowed = canPrewarmCombinedSessionStoresForGateway(cfg, {
			agentIds,
			maxRows: SIDEBAR_PREWARM_MAX_SESSION_ENTRIES
		});
		if (!sessionDataPrewarmAllowed) log.info?.(`skipping optional dashboard session prewarm: combined stores exceed ${SIDEBAR_PREWARM_MAX_SESSION_ENTRIES} rows`);
		return sessionDataPrewarmAllowed;
	};
	const firstMessageMaxIdleWaitMs = Number(process.env.OPENCLAW_GATEWAY_FIRST_MESSAGE_PREWARM_MAX_WAIT_MS ?? 3000);
	const firstMessageItems = process.env.OPENCLAW_GATEWAY_FIRST_MESSAGE_PREWARM === "0" ? [] : [{
		name: "reply.first-message",
		maxIdleWaitMs: Number.isFinite(firstMessageMaxIdleWaitMs) && firstMessageMaxIdleWaitMs >= 0 ? firstMessageMaxIdleWaitMs : 3000,
		load: async () => {
			const busyAtStart = getActiveGatewayRootWorkCount({ excludeCurrent: true });
			const { prewarmConfigDrivenReplyFirstMessage } = await loadGetReplyFromConfigRuntime();
			if (typeof prewarmConfigDrivenReplyFirstMessage !== "function") return;
			const result = await prewarmConfigDrivenReplyFirstMessage({ cfg, agentIds });
			log.info?.(`[gateway-first-message-prewarm.1] ${JSON.stringify({ status: "ready", busyAtStart, ...result })}`);
		}
	}];
	return [...firstMessageItems, ...agentIds.map((agentId) => ({
		name: `sessions.${agentId}`,
		load: async () => {
			if (!await shouldPrewarmSessionData()) return;
			await prewarmGatewaySessionListData(cfg, agentId);
		}
	})), {
		name: "plugins",
		load: async () => {
			const { listManagedPlugins } = await import("./management-service-CrtBtm94.js");
			await listManagedPlugins({ config: cfg });
		}
	}];
}
function scheduleGatewayHandlerPrewarm(params) {
	const items = params.items ?? dashboardDataPrewarmItems(params.cfgAtStart, params.log);
	let stopped = false;
	let nextIndex = 0;
	let currentItemName = "unknown";
	let idleTask;
	const scheduleNext = () => {
		if (stopped || nextIndex >= items.length) return;
		(async () => {
			await params.waitForPostReadyWork?.();
			if (stopped) return;
			const item = items[nextIndex++];
			if (!item) return;
			currentItemName = item.name;
			const load = () => item.load();
			const busyUntil = typeof item.maxIdleWaitMs === "number" ? Date.now() + item.maxIdleWaitMs : Infinity;
			idleTask = scheduleGatewayIdleTask({
				delayMs: 0,
				retryDelayMs: GATEWAY_HANDLER_PREWARM_RETRY_DELAY_MS,
				isClosing: () => stopped,
				isBusy: () => Date.now() < busyUntil && getActiveGatewayRootWorkCount({ excludeCurrent: true }) > 0,
				run: async () => {
					try {
						await (params.startupTrace ? params.startupTrace.measure(`post-ready.gateway-data.${item.name}`, load) : load());
					} finally {
						idleTask = void 0;
						scheduleNext();
					}
				},
				log: params.log,
				errorMessage: `post-ready gateway data prewarm failed for ${item.name}`
			});
		})().catch((err) => {
			params.log.warn(`post-ready gateway data prewarm failed for ${currentItemName}: ${String(err)}`);
			scheduleNext();
		});
	};
	scheduleNext();
	return { stop: () => {
		stopped = true;
		idleTask?.stop();
		idleTask = void 0;
	} };
}
//#endregion
//#region src/gateway/server-startup-outcomes.ts
const GATEWAY_STARTUP_SUBSYSTEMS = [
	"internal-hooks",
	"internal-startup-hook",
	"gateway-start-hooks",
	"gmail-watcher",
	"gmail-model"
];
function skipped(subsystem, reason) {
	return {
		subsystem,
		status: "skipped",
		reason
	};
}
function resolveOutcomePlan(params) {
	const internalHooks = params.cfg.hooks?.internal?.enabled === false ? "hooks-disabled" : hasConfiguredInternalHooks(params.cfg) ? "configured" : "not-configured";
	const gmailWatcher = !params.cfg.hooks?.enabled ? "hooks-disabled" : !params.cfg.hooks.gmail?.account ? "no-gmail-account" : isTruthyEnvValue((params.env ?? process.env).OPENCLAW_SKIP_GMAIL_WATCHER) ? "disabled-by-environment" : "scheduled";
	return {
		internalHooks,
		gatewayStartHooks: params.gatewayStartHooks,
		gmailWatcher,
		gmailModel: params.cfg.hooks?.gmail?.model ? "scheduled" : "not-configured"
	};
}
/** Create the complete initial outcome set; awaited startup work may replace entries later. */
function createGatewayStartupOutcomeRecorder(params) {
	const plan = resolveOutcomePlan(params);
	const internalHooks = plan.internalHooks === "configured" ? skipped("internal-hooks", "no-handlers-loaded") : skipped("internal-hooks", plan.internalHooks);
	const internalStartupHook = plan.internalHooks === "hooks-disabled" ? skipped("internal-startup-hook", "hooks-disabled") : skipped("internal-startup-hook", "no-handlers-loaded");
	const outcomes = /* @__PURE__ */ new Map([
		["internal-hooks", internalHooks],
		["internal-startup-hook", internalStartupHook],
		["gateway-start-hooks", plan.gatewayStartHooks ? {
			subsystem: "gateway-start-hooks",
			status: "scheduled"
		} : skipped("gateway-start-hooks", "no-handlers-loaded")],
		["gmail-watcher", plan.gmailWatcher === "scheduled" ? {
			subsystem: "gmail-watcher",
			status: "scheduled"
		} : skipped("gmail-watcher", plan.gmailWatcher)],
		["gmail-model", plan.gmailModel === "scheduled" ? {
			subsystem: "gmail-model",
			status: "scheduled"
		} : skipped("gmail-model", "not-configured")]
	]);
	return {
		record: (outcome) => {
			outcomes.set(outcome.subsystem, outcome);
		},
		snapshot: () => GATEWAY_STARTUP_SUBSYSTEMS.flatMap((subsystem) => {
			const outcome = outcomes.get(subsystem);
			return outcome ? [outcome] : [];
		})
	};
}
/** Format outcomes in canonical order regardless of collection order. */
function formatGatewayStartupOutcomes(outcomes) {
	const bySubsystem = new Map(outcomes.map((outcome) => [outcome.subsystem, outcome]));
	return `gateway startup outcomes: ${GATEWAY_STARTUP_SUBSYSTEMS.flatMap((subsystem) => {
		const outcome = bySubsystem.get(subsystem);
		if (!outcome) return [];
		const detail = "reason" in outcome ? ` (${outcome.reason})` : "";
		return `${outcome.subsystem}=${outcome.status}${detail}`;
	}).join("; ")}`;
}
//#endregion
//#region src/gateway/server-startup-post-attach.ts
const ACP_BACKEND_READY_TIMEOUT_MS = 5e3;
const ACP_BACKEND_READY_POLL_MS = 50;
const PROVIDER_AUTH_PREWARM_START_DELAY_MS = 5e3;
const PROVIDER_AUTH_REWARM_DELAY_MS = 1e3;
const DEFERRED_SIDECAR_START_DELAY_MS = 100;
const SKIP_STARTUP_MODEL_PREWARM_ENV = "OPENCLAW_SKIP_STARTUP_MODEL_PREWARM";
const loadMainSessionRestartRecoveryModule = createLazyRuntimeModule(() => import("./main-session-restart-recovery--2blnuu5.js"));
const loadMainSessionRestartRecoveryMarkingModule = createLazyRuntimeModule(() => import("./main-session-restart-recovery-marking-Dkeeoq9-.js"));
const loadAgentDefaultsModule = createLazyRuntimeModule(() => import("./defaults-RjT9WtG0.js"));
const loadAgentModelSelectionModule = createLazyRuntimeModule(() => import("./model-selection-a5W5TAQi.js"));
const loadInternalHooksModule = createLazyRuntimeModule(() => import("./internal-hooks-BfE2cgQN.js"));
const loadGatewayRestartSentinelModule = createLazyRuntimeModule(() => import("./server-restart-sentinel-DSdrfaji.js"));
/** Measure provider-auth warming without letting event-loop stalls hide in wall time. */
async function measureProviderAuthWarm(run) {
	const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
	eventLoopDelay.enable();
	const startMs = performance.now();
	try {
		await run();
	} finally {
		eventLoopDelay.disable();
	}
	return {
		elapsedMs: performance.now() - startMs,
		eventLoopMaxMs: eventLoopDelay.max / 1e6
	};
}
function formatProviderAuthWarmMetrics(metrics) {
	return `in ${metrics.elapsedMs.toFixed(0)}ms eventLoopMax=${metrics.eventLoopMaxMs.toFixed(1)}ms`;
}
function shouldCheckRestartSentinel(env = process.env) {
	return !env.VITEST && env.NODE_ENV !== "test";
}
function shouldSkipStartupModelPrewarm(env = process.env) {
	return isTruthyEnvValue(env[SKIP_STARTUP_MODEL_PREWARM_ENV]);
}
function schedulePostAttachUpdateSentinelRefresh(params) {
	setImmediate(() => {
		runWithGatewayIndependentRootWorkAdmission(async () => {
			await measureStartup(params.startupTrace, "post-attach.update-sentinel", async () => {
				await params.refreshLatestUpdateRestartSentinel();
			});
		}, "startup:update-sentinel").catch((err) => {
			params.log.warn(`restart sentinel refresh failed: ${String(err)}`);
		});
	}).unref?.();
}
function scheduleProviderAuthStatePrewarm(params) {
	let stopped = false;
	let startupTimer;
	let rewarmTimer;
	let rewarmInFlight = false;
	let pendingRewarmReason;
	const isStopped = () => stopped;
	const delayMs = params.delayMs ?? PROVIDER_AUTH_PREWARM_START_DELAY_MS;
	const logProviderAuthWarmFailure = (operation, error) => {
		if (!isGatewayRestartDrainError(error)) params.log.warn(`provider auth state ${operation} failed: ${String(error)}`);
	};
	runWithGatewayIndependentRootWorkAdmission(async () => {
		const [{ setAuthProfileFailureHook }, { clearCurrentProviderAuthState }] = await Promise.all([import("./failure-hook-DL7zdDho.js"), import("./model-provider-auth-state-BpSKvECc.js")]);
		const loadProviderAuthWarmModule = () => import("./model-provider-auth-BvCm2DCl.js");
		const runRewarm = async (reason) => {
			await runWithGatewayIndependentRootWorkAdmission(async () => {
				if (isStopped()) return;
				const cfg = params.getConfig();
				rewarmInFlight = true;
				try {
					const { warmCurrentProviderAuthStateOffMainThread } = await loadProviderAuthWarmModule();
					const metrics = await measureProviderAuthWarm(() => warmCurrentProviderAuthStateOffMainThread(cfg, { isCancelled: isStopped }));
					if (isStopped()) return;
					params.log.info(`provider auth state re-warmed (${reason}) ${formatProviderAuthWarmMetrics(metrics)}`);
				} catch (err) {
					logProviderAuthWarmFailure("rewarm", err);
				} finally {
					rewarmInFlight = false;
					const nextReason = pendingRewarmReason;
					pendingRewarmReason = void 0;
					if (nextReason && !isStopped()) scheduleAuthMapRewarm(nextReason);
				}
			}, "runtime:provider-auth-rewarm");
		};
		const scheduleAuthMapRewarm = (reason) => {
			if (isStopped()) return;
			pendingRewarmReason = reason;
			if (rewarmTimer || rewarmInFlight) return;
			rewarmTimer = setTimeout(() => {
				rewarmTimer = void 0;
				const nextReason = pendingRewarmReason ?? reason;
				pendingRewarmReason = void 0;
				runRewarm(nextReason).catch((error) => logProviderAuthWarmFailure("rewarm", error));
			}, PROVIDER_AUTH_REWARM_DELAY_MS);
			rewarmTimer.unref?.();
		};
		if (isStopped()) return;
		setAuthProfileFailureHook(() => {
			if (isStopped()) return;
			clearCurrentProviderAuthState();
			scheduleAuthMapRewarm("auth-profile-failure");
		});
		if (!params.startupWarmEnabled) return;
		startupTimer = setTimeout(() => {
			runWithGatewayIndependentRootWorkAdmission(async () => {
				if (isStopped()) return;
				const cfg = params.getConfig();
				const { warmCurrentProviderAuthStateOffMainThread } = await loadProviderAuthWarmModule();
				const metrics = await measureProviderAuthWarm(() => warmCurrentProviderAuthStateOffMainThread(cfg, { isCancelled: isStopped }));
				if (isStopped()) return;
				params.log.info(`provider auth state pre-warmed ${formatProviderAuthWarmMetrics(metrics)}`);
			}, "startup:provider-auth-prewarm").catch((error) => logProviderAuthWarmFailure("pre-warm", error));
		}, Math.max(0, delayMs));
		startupTimer.unref?.();
	}, "startup:provider-auth").catch((error) => logProviderAuthWarmFailure("pre-warm setup", error));
	return { stop: () => {
		stopped = true;
		if (startupTimer) {
			clearTimeout(startupTimer);
			startupTimer = void 0;
		}
		if (rewarmTimer) {
			clearTimeout(rewarmTimer);
			rewarmTimer = void 0;
		}
	} };
}
function schedulePostReadySidecarTask(params) {
	let stopped = false;
	const abortController = new AbortController();
	const isStopped = () => stopped;
	const handle = setImmediate(() => {
		(async () => {
			await params.waitForPostReadyWork?.();
			if (isStopped()) return;
			await runWithGatewayIndependentRootWorkAdmission(async () => {
				await measureStartup(params.startupTrace, params.name, () => params.run(isStopped, abortController.signal));
			}, `startup:${params.name}`);
		})().catch((err) => {
			params.log.warn(`${params.name} failed after gateway ready: ${String(err)}`);
		});
	});
	handle.unref?.();
	return { stop: async () => {
		stopped = true;
		abortController.abort();
		clearImmediate(handle);
		await params.stop?.();
	} };
}
function scheduleGatewayGenerationTimer(params) {
	let stopped = false;
	let timer;
	const isStopped = () => stopped;
	timer = setTimeout(() => {
		timer = void 0;
		if (isStopped()) return;
		runWithGatewayIndependentRootWorkAdmission(async () => {
			await params.run(isStopped);
		}, params.origin).catch((err) => {
			if (!isStopped()) params.onError(err);
		});
	}, params.delayMs);
	timer.unref?.();
	return { stop: () => {
		stopped = true;
		if (timer) {
			clearTimeout(timer);
			timer = void 0;
		}
	} };
}
function scheduleRestartSentinelWakeAfterReady(params) {
	return scheduleGatewayGenerationTimer({
		delayMs: 750,
		origin: "restart-sentinel:wake",
		run: async (isStopped) => {
			const { scheduleRestartSentinelWake } = await loadGatewayRestartSentinelModule();
			if (isStopped()) return;
			await scheduleRestartSentinelWake({ deps: params.deps });
		},
		onError: (err) => params.log.warn(`restart sentinel wake failed to schedule: ${String(err)}`)
	});
}
function scheduleTranscriptsAutoStartSidecar(params) {
	let stopTranscriptsAutoStart;
	return schedulePostReadySidecarTask({
		startupTrace: params.startupTrace,
		name: "sidecars.transcripts-auto-start",
		log: params.log,
		waitForPostReadyWork: params.waitForPostReadyWork,
		run: async (isStopped) => {
			const { createTranscriptsAutoStartService } = await import("./transcripts-tool-BWCy3o5q.js");
			if (isStopped()) return;
			const service = createTranscriptsAutoStartService({
				config: params.cfg,
				stateDir: resolveStateDir(),
				logger: params.log
			});
			stopTranscriptsAutoStart = () => service.stop();
			service.start();
		},
		stop: async () => {
			await stopTranscriptsAutoStart?.();
		}
	});
}
async function hasRestartSentinelFast(env = process.env) {
	return await hasRestartSentinel(env);
}
async function refreshLatestUpdateRestartSentinelIfPresent() {
	if (!await hasRestartSentinelFast()) return null;
	return await (await loadGatewayRestartSentinelModule()).refreshLatestUpdateRestartSentinel();
}
function hasGatewayStartHooks(pluginRegistry) {
	return pluginRegistry.typedHooks.some((hook) => hook.hookName === "gateway_start");
}
async function hasGatewayStartupInternalHookListeners() {
	const { hasInternalHookListeners } = await loadInternalHooksModule();
	return hasInternalHookListeners("gateway", "startup");
}
async function waitForAcpRuntimeBackendReady(params) {
	const { getAcpRuntimeBackend } = await import("./registry-45TOdwvB.js");
	const timeoutMs = params.timeoutMs ?? ACP_BACKEND_READY_TIMEOUT_MS;
	const pollMs = params.pollMs ?? ACP_BACKEND_READY_POLL_MS;
	const deadline = Date.now() + timeoutMs;
	do {
		const backend = getAcpRuntimeBackend(params.backendId);
		if (backend) try {
			if (!backend.healthy || backend.healthy()) return true;
		} catch {}
		await setTimeout$1(pollMs, void 0, { ref: false });
	} while (Date.now() < deadline);
	return false;
}
async function prewarmConfiguredPrimaryModel(params) {
	await publishConfiguredModelRuntimeSnapshots(params);
}
async function hydrateConfiguredExternalCliAuth(params) {
	const deps = await params.deps ?? await Promise.all([
		import("./agent-scope-DzYOhOj0.js"),
		import("./prepared-model-runtime.configured-2IplJQ5q.js"),
		import("./store-2xxWxF9Y.js"),
		import("./external-cli-discovery-DCXEyqYK.js")
	]).then(([scope, configured, store, external]) => ({
		listAgentIds: scope.listAgentIds,
		resolveAgentDir: scope.resolveAgentDir,
		collectConfiguredRefs: configured.collectPreparedModelRuntimeConfiguredRefs,
		hydrate: (cfg, agentDir, providers) => {
			const discovery = external.externalCliDiscoveryForProviders({
				cfg,
				providers
			});
			if (discovery.mode === "none") return;
			store.ensureAuthProfileStore(agentDir, {
				config: cfg,
				externalCli: discovery,
				allowKeychainPrompt: false,
				readOnly: true,
				syncExternalCli: false
			});
		}
	}));
	const cfg = params.getConfig();
	const hydratedDirs = /* @__PURE__ */ new Set();
	for (const agentId of deps.listAgentIds(cfg)) {
		const providers = deps.collectConfiguredRefs(cfg, agentId).flatMap(({ value }) => {
			const separator = value.indexOf("/");
			return separator > 0 ? [value.slice(0, separator)] : [];
		});
		const agentDir = deps.resolveAgentDir(cfg, agentId);
		if (providers.length === 0 || hydratedDirs.has(agentDir)) continue;
		hydratedDirs.add(agentDir);
		try {
			deps.hydrate(cfg, agentDir, providers);
		} catch (error) {
			params.log.warn(`startup external CLI auth hydration failed for agent ${agentId}: ${String(error)}`);
		}
	}
	return cfg;
}
async function publishConfiguredModelRuntimeSnapshots(params) {
	const { refreshPreparedModelRuntimeSnapshots } = await import("./prepared-model-runtime-DNXZpNBL.js");
	if (params.isCurrent?.() === false) return;
	await refreshPreparedModelRuntimeSnapshots(params.getConfig ?? params.cfg, {
		gatewayLifecycle: true,
		catalogMode: "static",
		allowGatewaySubagentBinding: true,
		...params.isCurrent ? { isPublicationCurrent: params.isCurrent } : {},
		...params.pluginMetadataSnapshot ? { pluginMetadataSnapshot: params.pluginMetadataSnapshot } : {},
		...params.workspaceDir ? { defaultWorkspaceDir: params.workspaceDir } : {},
		...params.startupTrace ? { onBuildStats: (stats) => params.startupTrace?.detail("sidecars.model-runtime-build", [
			["agentCount", stats.agentCount],
			["workspaceGroupCount", stats.workspaceGroupCount],
			["configuredFactsGroupCount", stats.configuredFactsGroupCount],
			["catalogSourceCount", stats.catalogSourceCount],
			["credentialGroupCount", stats.credentialGroupCount],
			["catalogGroupCount", stats.catalogGroupCount],
			["runtimeRegistryCount", stats.runtimeRegistryCount],
			["configuredRuntimeModelCount", stats.configuredRuntimeModelCount],
			["generatedCatalogPluginCount", stats.generatedCatalogPluginCount],
			["generatedCatalogReadCount", stats.generatedCatalogReadCount],
			["workspaceFactsMs", stats.workspaceFactsMs],
			["runtimePluginMs", stats.runtimePluginMs],
			["pluginMetadataMs", stats.pluginMetadataMs],
			["staticProviderCatalogMs", stats.staticProviderCatalogMs],
			["ambientCredentialsMs", stats.ambientCredentialsMs],
			["agentFactsMs", stats.agentFactsMs],
			["configuredProjectionMs", stats.configuredProjectionMs],
			["catalogSourceMs", stats.catalogSourceMs],
			["registryMs", stats.registryMs],
			["sourceConcurrencyLimitCount", stats.sourceConcurrencyLimit],
			["fullCatalogConcurrencyLimitCount", stats.fullCatalogConcurrencyLimit]
		]) } : {}
	});
}
async function publishStartupModelRuntime(params, prewarm = prewarmConfiguredPrimaryModel) {
	await (shouldSkipStartupModelPrewarm() ? publishConfiguredModelRuntimeSnapshots : prewarm)(params);
}
/** Start post-ready sidecars such as channels, hooks, plugin services, and cleanup tasks. */
async function startGatewaySidecars(params) {
	const postReadySidecars = [];
	const internalHooksConfigured = hasConfiguredInternalHooks(params.cfg);
	await measureStartup(params.startupTrace, "sidecars.internal-hooks", async () => {
		try {
			if (internalHooksConfigured) {
				const [{ setInternalHooksEnabled }, { loadInternalHooks }] = await Promise.all([loadInternalHooksModule(), import("./loader-C2mYolyH.js")]);
				setInternalHooksEnabled(params.cfg.hooks?.internal?.enabled !== false);
				const loadedCount = await loadInternalHooks(params.cfg, params.defaultWorkspaceDir);
				if (loadedCount > 0) {
					params.startupOutcomes?.record({
						subsystem: "internal-hooks",
						status: "loaded"
					});
					params.logHooks.info(`loaded ${loadedCount} internal hook handler${loadedCount > 1 ? "s" : ""}`);
				} else params.startupOutcomes?.record({
					subsystem: "internal-hooks",
					status: "skipped",
					reason: "no-handlers-loaded"
				});
			}
		} catch (err) {
			params.startupOutcomes?.record({
				subsystem: "internal-hooks",
				status: "failed",
				reason: "see earlier log"
			});
			params.logHooks.error(`failed to load hooks: ${String(err)}`);
		}
	});
	const mainSessionRecoveryStartupCheckedStorePaths = params.mainSessionRecoveryStartupCheckedStorePaths ?? /* @__PURE__ */ new Set();
	const skipChannels = isTruthyEnvValue(process.env.OPENCLAW_SKIP_CHANNELS) || isTruthyEnvValue(process.env.OPENCLAW_SKIP_PROVIDERS);
	await measureStartup(params.startupTrace, "sidecars.main-session-recovery", async () => {
		try {
			const { markStartupOrphanedMainSessionsForRecovery } = await measureStartup(params.startupTrace, "sidecars.main-session-recovery-load", loadMainSessionRestartRecoveryMarkingModule);
			await measureStartup(params.startupTrace, "sidecars.main-session-recovery-scan", () => markStartupOrphanedMainSessionsForRecovery({
				cfg: params.cfg,
				startupCheckedStorePaths: mainSessionRecoveryStartupCheckedStorePaths
			}));
		} catch (err) {
			params.log.warn(`main-session startup orphan marking failed before channel startup: ${String(err)}`);
		}
	});
	const getModelRuntimeConfig = params.getModelRuntimeConfig ?? (() => params.cfg);
	if (await params.pluginRuntimeClaim?.waitForUnblocked() !== false) await measureStartup(params.startupTrace, "sidecars.model-runtime", () => withPluginRuntimeRegistryScope(params.pluginRegistry, () => publishStartupModelRuntime({
		cfg: params.cfg,
		getConfig: async () => await measureStartup(params.startupTrace, "sidecars.model-auth", () => hydrateConfiguredExternalCliAuth({
			getConfig: getModelRuntimeConfig,
			log: params.log
		})),
		isCurrent: params.pluginRuntimeClaim?.isCurrent,
		...params.pluginMetadataSnapshot ? { pluginMetadataSnapshot: params.pluginMetadataSnapshot } : {},
		workspaceDir: params.defaultWorkspaceDir,
		log: params.log,
		startupTrace: params.startupTrace
	}, params.prewarmPrimaryModel)));
	await measureStartup(params.startupTrace, "sidecars.reply-runtime", async () => {
		const { prewarmConfigDrivenReplyRuntime } = await loadGetReplyFromConfigRuntime();
		await prewarmConfigDrivenReplyRuntime();
	});
	await measureStartup(params.startupTrace, "sidecars.chat-metadata", async () => {
		await params.refreshChatMetadata?.();
	});
	const shouldStartChannels = params.shouldStartChannels?.() !== false;
	await measureStartup(params.startupTrace, "sidecars.channels", async () => {
		const channelStart = skipChannels ? measureStartup(params.startupTrace, "sidecars.channel-skip", () => params.logChannels.info("skipping channel start (OPENCLAW_SKIP_CHANNELS=1 or OPENCLAW_SKIP_PROVIDERS=1)")) : shouldStartChannels ? measureStartup(params.startupTrace, "sidecars.channel-start", params.startChannels).catch((err) => params.logChannels.error(`channel startup failed: ${String(err)}`)) : Promise.resolve();
		const accountStartGateRelease = shouldStartChannels ? params.onChannelsStarted?.() : void 0;
		await Promise.all([accountStartGateRelease, channelStart]);
	});
	await params.pluginRuntimeClaim?.waitForUnblocked();
	const shouldStartPluginServices = params.pluginRuntimeClaim?.isCurrent() !== false && params.shouldStartPluginServices?.() !== false;
	let pluginServicesOwner = null;
	let pluginServicesStopRequested = false;
	let resolvePluginServicesOwner;
	if (shouldStartPluginServices) {
		const ownedPluginServices = createDeferredCore();
		pluginServicesOwner = { stop: (options) => {
			pluginServicesStopRequested = true;
			const stopPromise = ownedPluginServices.promise.then(async (handle) => {
				await handle?.stop(options);
			});
			if (!options?.strict) return stopPromise;
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					reject(new AggregateError([/* @__PURE__ */ new Error("Gateway plugin service startup did not settle before replacement")], "Gateway plugin service replacement cleanup failed"));
				}, Math.max(0, options.deadlineAtMs - Date.now()));
				stopPromise.then(() => {
					clearTimeout(timer);
					resolve();
				}, (error) => {
					clearTimeout(timer);
					reject(error instanceof Error ? error : new Error(String(error)));
				});
			});
		} };
		resolvePluginServicesOwner = ownedPluginServices.resolve;
		params.onPluginServices?.(pluginServicesOwner);
	}
	let pluginServices = shouldStartPluginServices ? await measureStartup(params.startupTrace, "sidecars.plugin-services", async () => {
		try {
			const { startPluginServices } = await import("./services-d6sHwM-q.js");
			if (pluginServicesStopRequested || params.shouldStartPluginServices?.() === false) {
				resolvePluginServicesOwner?.(null);
				return null;
			}
			const startedPluginServices = await startPluginServices({
				registry: params.pluginRegistry,
				config: params.cfg,
				workspaceDir: params.defaultWorkspaceDir,
				startupTrace: params.startupTrace,
				broadcastPluginEvent: params.broadcastPluginEvent,
				onHandle: resolvePluginServicesOwner
			});
			resolvePluginServicesOwner?.(startedPluginServices);
			return startedPluginServices;
		} catch (err) {
			resolvePluginServicesOwner?.(null);
			params.log.warn(`plugin services failed to start: ${String(err)}`);
			return null;
		}
	}) : null;
	if (!shouldStartPluginServices) params.onPluginServices?.(null);
	if (pluginServicesOwner && (pluginServicesStopRequested || params.shouldStartPluginServices?.() === false)) {
		await pluginServicesOwner.stop().catch((err) => {
			params.log.warn(`plugin services stop after close failed: ${String(err)}`);
		});
		pluginServices = null;
		params.onPluginServices?.(null);
	}
	const shouldDispatchGatewayStartupInternalHook = internalHooksConfigured || await hasGatewayStartupInternalHookListeners();
	if (params.shouldCreatePostReadySidecars?.() === false) return {
		pluginServices,
		postReadySidecars
	};
	if (shouldDispatchGatewayStartupInternalHook) {
		params.startupOutcomes?.record({
			subsystem: "internal-startup-hook",
			status: "scheduled"
		});
		postReadySidecars.push(scheduleGatewayGenerationTimer({
			delayMs: 250,
			origin: "hooks:gateway-startup",
			run: async (isStopped) => {
				const { createInternalHookEvent, triggerInternalHook } = await loadInternalHooksModule();
				if (isStopped()) return;
				await triggerInternalHook(createInternalHookEvent("gateway", "startup", "gateway:startup", {
					cfg: params.cfg,
					deps: params.deps,
					workspaceDir: params.defaultWorkspaceDir
				}));
			},
			onError: (err) => params.logHooks.warn(`gateway startup hook failed: ${String(err)}`)
		}));
	}
	if (params.cfg.acp?.enabled) runWithGatewayIndependentRootWorkAdmission(async () => {
		const ready = await measureStartup(params.startupTrace, "sidecars.acp.runtime-ready", () => waitForAcpRuntimeBackendReady({ backendId: params.cfg.acp?.backend }));
		params.startupTrace?.detail("sidecars.acp.runtime-ready", [["readyCount", ready ? 1 : 0], ["backend", params.cfg.acp?.backend ?? "default"]]);
		await measureStartup(params.startupTrace, "sidecars.acp.identity-reconcile", async () => {
			const [{ getAcpSessionManager }, { ACP_SESSION_IDENTITY_RENDERER_VERSION }] = await Promise.all([import("./acp/control-plane/manager.js"), import("./acp-core/runtime/session-identifiers.js")]);
			const result = await getAcpSessionManager().reconcilePendingSessionIdentities({ cfg: params.cfg });
			if (result.checked === 0) return;
			params.log.warn(`acp startup identity reconcile (renderer=${ACP_SESSION_IDENTITY_RENDERER_VERSION}): checked=${result.checked} resolved=${result.resolved} failed=${result.failed}`);
		});
	}, "startup:acp-identity-reconcile").catch((err) => {
		params.log.warn(`acp startup identity reconcile failed: ${String(err)}`);
	});
	let restartSentinelWake;
	postReadySidecars.push(schedulePostReadySidecarTask({
		startupTrace: params.startupTrace,
		name: "sidecars.restart-sentinel",
		log: params.log,
		waitForPostReadyWork: params.waitForPostReadyWork,
		run: async (isStopped) => {
			if (!shouldCheckRestartSentinel() || isStopped()) return;
			if (!await hasRestartSentinelFast() || isStopped()) return;
			restartSentinelWake = scheduleRestartSentinelWakeAfterReady({
				deps: params.deps,
				log: params.log
			});
		},
		stop: async () => {
			await restartSentinelWake?.stop();
		}
	}));
	if (params.cfg.hooks?.enabled && params.cfg.hooks.gmail?.account) postReadySidecars.push(schedulePostReadySidecarTask({
		startupTrace: params.startupTrace,
		name: "sidecars.gmail-watch",
		log: params.log,
		waitForPostReadyWork: params.waitForPostReadyWork,
		run: async (isStopped, signal) => {
			const { startGmailWatcherWithLogs } = await import("./gmail-watcher-lifecycle-D2XC1amG.js");
			if (isStopped()) return;
			await startGmailWatcherWithLogs({
				cfg: params.cfg,
				log: params.logHooks,
				signal
			});
		}
	}));
	if (params.cfg.hooks?.gmail?.model) postReadySidecars.push(schedulePostReadySidecarTask({
		startupTrace: params.startupTrace,
		name: "sidecars.gmail-model",
		log: params.log,
		waitForPostReadyWork: params.waitForPostReadyWork,
		run: async (isStopped) => {
			const [{ DEFAULT_MODEL, DEFAULT_PROVIDER }, { loadPreparedModelCatalog }, { getModelRefStatus, resolveConfiguredModelRef, resolveHooksGmailModel }] = await Promise.all([
				loadAgentDefaultsModule(),
				import("./prepared-model-catalog-BQXfkgza.js"),
				loadAgentModelSelectionModule()
			]);
			if (isStopped()) return;
			const hooksModelRef = resolveHooksGmailModel({
				cfg: params.cfg,
				defaultProvider: DEFAULT_PROVIDER
			});
			if (hooksModelRef) {
				const { provider: resolvedDefaultProvider, model: defaultModel } = resolveConfiguredModelRef({
					cfg: params.cfg,
					defaultProvider: DEFAULT_PROVIDER,
					defaultModel: DEFAULT_MODEL
				});
				const catalog = await loadPreparedModelCatalog({
					config: params.cfg,
					readOnly: true,
					providerDiscoveryProviderIds: [hooksModelRef.provider],
					scopedLiveProviderDiscovery: true
				});
				const status = getModelRefStatus({
					cfg: params.cfg,
					catalog,
					ref: hooksModelRef,
					defaultProvider: resolvedDefaultProvider,
					defaultModel
				});
				if (!status.allowed) params.logHooks.warn(`hooks.gmail.model "${status.key}" not allowed by agents.defaults.modelPolicy.allow (will use primary instead)`);
				if (!status.inCatalog) params.logHooks.warn(`hooks.gmail.model "${status.key}" not in the model catalog (may fail at runtime)`);
			}
		}
	}));
	params.onPostReadySidecars?.(postReadySidecars);
	return {
		pluginServices,
		postReadySidecars
	};
}
const defaultGatewayPostAttachRuntimeDeps = {
	getGlobalHookRunner: async () => (await import("./plugins/hook-runner-global.js")).getGlobalHookRunner(),
	logGatewayStartup: async (params) => (await import("./server-startup-log-DIfaqzMK.js")).logGatewayStartup(params),
	refreshLatestUpdateRestartSentinel: refreshLatestUpdateRestartSentinelIfPresent,
	initializeGatewayUpdateStatus: async () => (await import("./update-startup-DAUmgSfc.js")).initializeGatewayUpdateStatus(),
	scheduleGatewayUpdateCheck: async (...args) => (await import("./update-startup-DAUmgSfc.js")).scheduleGatewayUpdateCheck(...args),
	startGatewaySidecars,
	warmSystemCa: beginMacOSSystemCaWarmupOnce,
	loadSubagentRegistryActivation: async () => (await import("./subagent-registry-DrJqNCcx.js")).activateSubagentRegistry
};
function createDeferredGatewayUpdateCheck(params) {
	let started = false;
	let stopped = false;
	let stopUpdateCheck = null;
	let latestUpdateAvailable = null;
	let latestSchedule;
	const broadcastUpdateAvailable = (payload) => {
		const detailedConnIds = params.getClientConnIds((client) => canReadDetailedUpdateMetadata(client.connect.role ?? "operator", client.connect.scopes ?? []));
		const legacyConnIds = new Set(params.getClientConnIds());
		for (const connId of detailedConnIds) legacyConnIds.delete(connId);
		params.broadcastToConnIds(GATEWAY_EVENT_UPDATE_AVAILABLE, payload, detailedConnIds, { dropIfSlow: true });
		params.broadcastToConnIds(GATEWAY_EVENT_UPDATE_AVAILABLE, { updateAvailable: projectUpdateAvailable(payload.updateAvailable, false) ?? null }, legacyConnIds, { dropIfSlow: true });
	};
	const stop = () => {
		stopped = true;
		stopUpdateCheck?.();
		stopUpdateCheck = null;
	};
	const start = () => {
		if (started || stopped) return;
		started = true;
		params.runtimeDeps.initializeGatewayUpdateStatus().catch((err) => {
			if (!stopped) params.log.warn(`gateway update status failed to initialize: ${String(err)}`);
		});
		(async () => {
			await params.waitForPostReadyWork?.();
			if (stopped) return;
			setImmediate(() => {
				if (stopped) return;
				runWithGatewayIndependentRootWorkAdmission(async () => await measureStartup(params.startupTrace, "post-attach.update-check", () => params.runtimeDeps.scheduleGatewayUpdateCheck({
					cfg: params.cfg,
					log: params.log,
					isNixMode: params.isNixMode,
					...params.activeWorkInspectors ? { activeWorkInspectors: params.activeWorkInspectors } : {},
					onUpdateAvailableChange: (updateAvailable) => {
						latestUpdateAvailable = updateAvailable;
						const payload = {
							updateAvailable,
							...latestSchedule ? { schedule: latestSchedule } : {}
						};
						broadcastUpdateAvailable(payload);
					},
					onUpdateScheduleChange: (schedule) => {
						latestSchedule = schedule;
						broadcastUpdateAvailable({
							updateAvailable: latestUpdateAvailable,
							schedule
						});
					}
				})), "startup:update-check").then((nextStop) => {
					if (stopped) {
						nextStop();
						return;
					}
					stopUpdateCheck = nextStop;
				}).catch((err) => {
					if (stopped) return;
					params.log.warn(`gateway update check failed to start: ${String(err)}`);
				});
			});
		})().catch((err) => {
			if (!stopped) params.log.warn(`gateway update check readiness wait failed: ${String(err)}`);
		});
	};
	return {
		start,
		stop
	};
}
/** Start work that depends on the HTTP server being attached and visible. */
async function startGatewayPostAttachRuntime(params, runtimeDeps = defaultGatewayPostAttachRuntimeDeps) {
	const controlUiRootLifecycle = params.controlUiRootLifecycle;
	const mainSessionRecoveryStartupCheckedStorePaths = /* @__PURE__ */ new Set();
	const controlUiAssetsSidecar = !params.minimalTestGateway && (controlUiRootLifecycle?.state?.kind === "preparing" || controlUiRootLifecycle?.state?.kind === "bundled") && controlUiRootLifecycle ? schedulePostReadySidecarTask({
		name: "sidecars.control-ui-assets",
		startupTrace: params.startupTrace,
		log: params.log,
		run: controlUiRootLifecycle.start,
		stop: controlUiRootLifecycle.stop
	}) : void 0;
	if (controlUiAssetsSidecar) params.onGatewayLifetimeSidecars?.([controlUiAssetsSidecar]);
	if (!params.minimalTestGateway) await measureStartup(params.startupTrace, "post-attach.system-ca", () => runtimeDeps.warmSystemCa({ log: params.log }));
	let pluginRegistry = params.pluginRegistry;
	let startupPluginsLoaded = false;
	let startupPluginsLoadPromise = null;
	const loadStartupPluginsIfNeeded = async () => {
		if (params.minimalTestGateway || !params.loadStartupPlugins) return {
			pluginRegistry,
			gatewayMethods: []
		};
		if (startupPluginsLoaded) return {
			pluginRegistry,
			gatewayMethods: []
		};
		startupPluginsLoadPromise ??= (async () => {
			params.onStartupPluginsLoading?.();
			const loaded = await measureStartup(params.startupTrace, "plugins.runtime-post-bind", () => params.loadStartupPlugins());
			await params.pluginRuntimeClaim?.waitForUnblocked();
			if (params.isClosing?.() || params.pluginRuntimeClaim?.isCurrent() === false) {
				loaded.retireGatewayRuntimeBindings?.();
				pluginRegistry = params.getCurrentPluginRegistry?.() ?? pluginRegistry;
				startupPluginsLoaded = true;
				return {
					pluginRegistry,
					gatewayMethods: []
				};
			}
			pluginRegistry = loaded.pluginRegistry;
			startupPluginsLoaded = true;
			params.startupTrace?.detail("plugins.runtime-post-bind", [["loadedPluginCount", pluginRegistry.plugins.filter((plugin) => plugin.status === "loaded").length], ["gatewayMethodCount", loaded.gatewayMethods.length]]);
			await params.onStartupPluginsLoaded?.(loaded);
			return loaded;
		})();
		return await startupPluginsLoadPromise;
	};
	let startupLogPromise;
	const startupLogSettled = createDeferredCore();
	startupLogSettled.promise.catch(() => {});
	let startupLogOwnerAssigned = false;
	const assignStartupLogOwner = (owner) => {
		if (params.sidecarStartup !== "defer" || startupLogOwnerAssigned) return;
		startupLogOwnerAssigned = true;
		owner.then(startupLogSettled.resolve, startupLogSettled.reject);
	};
	const startStartupLog = () => {
		if (startupLogPromise) return startupLogPromise;
		startupLogPromise = measureStartup(params.startupTrace, "post-attach.log", () => runtimeDeps.logGatewayStartup({
			cfg: params.cfgAtStart,
			activationSourceConfig: params.activationSourceConfig,
			env: process.env,
			manifestRecords: params.pluginManifestRecords,
			...params.ambientEnvTriggers ? { ambientEnvTriggers: params.ambientEnvTriggers } : {},
			bindHost: params.bindHost,
			bindHosts: params.bindHosts,
			port: params.port,
			tlsEnabled: params.tlsEnabled,
			loadedPluginIds: pluginRegistry.plugins.filter((plugin) => plugin.status === "loaded").map((plugin) => plugin.id),
			log: params.log,
			isNixMode: params.isNixMode,
			startupStartedAt: params.startupStartedAt
		}));
		startupLogPromise.catch(() => {});
		assignStartupLogOwner(startupLogPromise);
		return startupLogPromise;
	};
	const skipStartupLog = () => assignStartupLogOwner(Promise.resolve());
	const updateCheck = params.minimalTestGateway ? {
		start: () => {},
		stop: () => {}
	} : createDeferredGatewayUpdateCheck({
		startupTrace: params.startupTrace,
		runtimeDeps,
		cfg: params.cfgAtStart,
		log: params.log,
		isNixMode: params.isNixMode,
		broadcastToConnIds: params.broadcastToConnIds,
		getClientConnIds: params.getClientConnIds,
		waitForPostReadyWork: params.waitForPostReadyWork,
		activeWorkInspectors: params.activeWorkInspectors
	});
	let pluginServicesReported = false;
	let reportedPluginServices = null;
	const reportPluginServices = (pluginServices) => {
		if (params.pluginRuntimeClaim?.isCurrent() === false) return;
		pluginServicesReported = true;
		reportedPluginServices = pluginServices;
		params.onPluginServices?.(pluginServices);
	};
	const waitForSidecarStartTurn = () => new Promise((resolve) => {
		if (params.sidecarStartup === "defer") {
			setTimeout(resolve, DEFERRED_SIDECAR_START_DELAY_MS).unref?.();
			return;
		}
		setImmediate(resolve);
	});
	const emptySidecarResult = () => ({
		pluginServices: null,
		pluginRegistry,
		postReadySidecars: [],
		gatewayLifetimeSidecars: []
	});
	const startSidecars = () => params.minimalTestGateway ? startStartupLog().then(() => ({
		pluginServices: null,
		pluginRegistry,
		postReadySidecars: [],
		gatewayLifetimeSidecars: []
	})) : waitForSidecarStartTurn().then(async () => {
		if (params.isClosing?.()) {
			skipStartupLog();
			return emptySidecarResult();
		}
		await loadStartupPluginsIfNeeded();
		if (params.isClosing?.()) {
			skipStartupLog();
			return emptySidecarResult();
		}
		const startupLog = startStartupLog();
		const startupOutcomes = createGatewayStartupOutcomeRecorder({
			cfg: params.gatewayPluginConfigAtStart,
			gatewayStartHooks: hasGatewayStartHooks(pluginRegistry)
		});
		const workerEnvironmentSidecar = params.isClosing?.() ? null : await params.startWorkerEnvironmentRuntime?.() ?? null;
		if (params.isClosing?.()) return emptySidecarResult();
		params.log.info("starting channels and sidecars...");
		const loaderStatsBefore = getPluginModuleLoaderStats();
		const result = await (async () => {
			try {
				const startupRuntimeCurrent = params.pluginRuntimeClaim?.isCurrent() !== false;
				const pluginMetadataSnapshot = startupRuntimeCurrent ? params.pluginMetadataSnapshot : params.getCurrentPluginMetadataSnapshot?.();
				return await measureStartup(params.startupTrace, "sidecars.total", () => runtimeDeps.startGatewaySidecars({
					cfg: startupRuntimeCurrent ? params.gatewayPluginConfigAtStart : params.getConfig(),
					getModelRuntimeConfig: params.getConfig,
					...pluginMetadataSnapshot ? { pluginMetadataSnapshot } : {},
					pluginRegistry,
					defaultWorkspaceDir: params.defaultWorkspaceDir,
					deps: params.deps,
					startChannels: params.startChannels,
					shouldStartChannels: () => params.isClosing?.() !== true,
					refreshChatMetadata: params.refreshChatMetadata,
					log: params.log,
					logHooks: params.logHooks,
					logChannels: params.logChannels,
					startupTrace: params.startupTrace,
					onChannelsStarted: params.onChannelsStarted,
					onPluginServices: reportPluginServices,
					onPostReadySidecars: (sidecars) => {
						params.onPostReadySidecars?.(sidecars);
					},
					shouldCreatePostReadySidecars: () => params.isClosing?.() !== true,
					shouldStartPluginServices: () => params.isClosing?.() !== true && params.pluginRuntimeClaim?.isCurrent() !== false,
					...params.pluginRuntimeClaim ? { pluginRuntimeClaim: params.pluginRuntimeClaim } : {},
					broadcastPluginEvent: params.broadcastPluginEvent,
					startupOutcomes,
					mainSessionRecoveryStartupCheckedStorePaths,
					waitForPostReadyWork: params.waitForPostReadyWork
				}));
			} catch (error) {
				try {
					await workerEnvironmentSidecar?.stop();
					if (workerEnvironmentSidecar) params.unregisterGatewayLifetimeSidecar(workerEnvironmentSidecar);
				} catch (cleanupError) {
					params.log.warn(`worker environment cleanup after sidecar startup failure failed: ${String(cleanupError)}`);
				}
				throw error;
			}
		})();
		const stopStartupSidecars = async (mainSessionRecoverySidecar) => {
			if (mainSessionRecoverySidecar) params.onGatewayLifetimeSidecars?.([mainSessionRecoverySidecar]);
			const cleanupResults = await Promise.allSettled([
				params.stopRegisteredGatewayLifetimeSidecars,
				() => result.pluginServices?.stop(),
				params.stopRegisteredPostReadySidecars
			].map(async (stop) => await stop()));
			if (result.pluginServices && cleanupResults[1]?.status === "fulfilled") reportPluginServices(null);
			const cleanupFailure = cleanupResults.find((cleanupResult) => cleanupResult.status === "rejected");
			if (cleanupFailure) throw cleanupFailure.reason;
			return emptySidecarResult();
		};
		if (params.isClosing?.()) return await stopStartupSidecars();
		const loaderStatsAfter = getPluginModuleLoaderStats();
		params.startupTrace?.detail("sidecars.plugin-loader", [
			["callsCount", loaderStatsAfter.calls - loaderStatsBefore.calls],
			["nativeHitsCount", loaderStatsAfter.nativeHits - loaderStatsBefore.nativeHits],
			["nativeMissesCount", loaderStatsAfter.nativeMisses - loaderStatsBefore.nativeMisses],
			["sourceTransformForcedCount", loaderStatsAfter.sourceTransformForced - loaderStatsBefore.sourceTransformForced],
			["sourceTransformFallbacksCount", loaderStatsAfter.sourceTransformFallbacks - loaderStatsBefore.sourceTransformFallbacks]
		]);
		let mainSessionRecoverySidecar;
		try {
			await startupLog;
		} catch (error) {
			try {
				await stopStartupSidecars(mainSessionRecoverySidecar);
			} catch (cleanupError) {
				params.log.warn(`sidecar cleanup after startup logging failure failed: ${String(cleanupError)}`);
			}
			throw error;
		}
		if (params.isClosing?.()) return await stopStartupSidecars(mainSessionRecoverySidecar);
		try {
			const { scheduleRestartAbortedMainSessionRecovery } = await loadMainSessionRestartRecoveryModule();
			if (params.isClosing?.() !== true) mainSessionRecoverySidecar = scheduleRestartAbortedMainSessionRecovery({
				delayMs: 0,
				getConfig: params.getConfig,
				shouldContinue: () => params.isClosing?.() !== true,
				startupCheckedStorePaths: mainSessionRecoveryStartupCheckedStorePaths,
				waitForStart: params.waitForPostReadyWork,
				gatewayRuntime: params.recoveryRuntime
			});
		} catch (err) {
			params.log.warn(`main-session restart recovery failed to schedule: ${String(err)}`);
		}
		if (params.isClosing?.()) return await stopStartupSidecars(mainSessionRecoverySidecar);
		params.unlockStartupMethods();
		if (!pluginServicesReported) reportPluginServices(result.pluginServices);
		const postReadySidecars = [...result.postReadySidecars];
		const newGatewayLifetimeSidecars = [
			scheduleContextCachePrewarm(params),
			scheduleGatewayHandlerPrewarm(params),
			...mainSessionRecoverySidecar ? [mainSessionRecoverySidecar] : []
		];
		if (params.providerAuthPrewarm && params.providerAuthPrewarm.enabled !== false) newGatewayLifetimeSidecars.push(scheduleProviderAuthStatePrewarm({
			getConfig: params.providerAuthPrewarm.getConfig ?? (() => params.cfgAtStart),
			log: params.log,
			delayMs: params.providerAuthPrewarm.delayMs,
			startupWarmEnabled: params.providerAuthPrewarm.enabled === true
		}));
		if (params.gatewayPluginConfigAtStart.transcripts?.autoStart?.length) newGatewayLifetimeSidecars.push(scheduleTranscriptsAutoStartSidecar({
			cfg: params.gatewayPluginConfigAtStart,
			startupTrace: params.startupTrace,
			log: params.log,
			waitForPostReadyWork: params.waitForPostReadyWork
		}));
		params.onGatewayLifetimeSidecars?.(newGatewayLifetimeSidecars);
		const gatewayLifetimeSidecars = [
			...controlUiAssetsSidecar ? [controlUiAssetsSidecar] : [],
			...workerEnvironmentSidecar ? [workerEnvironmentSidecar] : [],
			...newGatewayLifetimeSidecars
		];
		params.log.info(formatGatewayStartupOutcomes(startupOutcomes.snapshot()));
		params.onSidecarsReady?.();
		try {
			const activateSubagentRegistry = await runtimeDeps.loadSubagentRegistryActivation();
			if (params.isClosing?.() !== true) activateSubagentRegistry(params.resolveGatewayContext);
		} catch (err) {
			params.log.warn(`subagent restart recovery failed to activate: ${String(err)}`);
		}
		if (params.isClosing?.()) return await stopStartupSidecars(mainSessionRecoverySidecar);
		params.startupTrace?.detail("sidecars.ready", [["loadedPluginCount", pluginRegistry.plugins.filter((plugin) => plugin.status === "loaded").length], ["postReadySidecarCount", postReadySidecars.length + gatewayLifetimeSidecars.length]]);
		params.startupTrace?.mark("sidecars.ready");
		params.log.info("gateway ready");
		return {
			...result,
			postReadySidecars,
			gatewayLifetimeSidecars,
			pluginRegistry
		};
	});
	const sidecarsPromise = startSidecars();
	sidecarsPromise.then(async (sidecarsResult) => {
		if (params.minimalTestGateway) return;
		await params.waitForPostReadyWork?.();
		if (params.isClosing?.()) return;
		schedulePostAttachUpdateSentinelRefresh({
			startupTrace: params.startupTrace,
			log: params.log,
			refreshLatestUpdateRestartSentinel: runtimeDeps.refreshLatestUpdateRestartSentinel
		});
		setImmediate(() => {
			sweepSessionStateWatchNotices();
		}).unref?.();
		if (!hasGatewayStartHooks(sidecarsResult.pluginRegistry)) return;
		await new Promise((resolve) => {
			setImmediate(resolve);
		});
		const hookRunner = await runtimeDeps.getGlobalHookRunner();
		if (hookRunner?.hasHooks("gateway_start")) {
			const { withPluginHttpRouteRegistry } = await import("./http-registry-BZ8AcZp0.js");
			runWithGatewayIndependentRootWorkAdmission(async () => {
				await withPluginHttpRouteRegistry(sidecarsResult.pluginRegistry, () => hookRunner.runGatewayStart({ port: params.port }, {
					port: params.port,
					config: params.gatewayPluginConfigAtStart,
					workspaceDir: params.defaultWorkspaceDir,
					getCron: () => params.getCronService?.() ?? params.deps.cron
				}));
			}, "hooks:gateway-start").catch((err) => {
				params.log.warn(`gateway_start hook failed: ${String(err)}`);
			});
		}
	}).catch((err) => {
		params.log.warn(`gateway sidecars failed to start: ${String(err)}`);
	});
	if (params.sidecarStartup !== "defer") {
		const sidecarsResult = await sidecarsPromise;
		updateCheck.start();
		return {
			stopGatewayUpdateCheck: updateCheck.stop,
			pluginServices: sidecarsResult.pluginServices,
			startupSettled: Promise.resolve()
		};
	}
	updateCheck.start();
	const startupSettled = Promise.all([sidecarsPromise, startupLogSettled.promise]).then(() => void 0);
	startupSettled.catch(() => {});
	return {
		stopGatewayUpdateCheck: updateCheck.stop,
		pluginServices: reportedPluginServices,
		startupSettled
	};
}
const testing = {
	providerAuthPrewarmStartDelayMs: PROVIDER_AUTH_PREWARM_START_DELAY_MS,
	hasRestartSentinelFast,
	prewarmConfiguredPrimaryModel,
	hydrateConfiguredExternalCliAuth,
	publishConfiguredModelRuntimeSnapshots,
	publishStartupModelRuntime,
	refreshLatestUpdateRestartSentinelIfPresent,
	scheduleProviderAuthStatePrewarm,
	scheduleRestartSentinelWakeAfterReady,
	shouldSkipStartupModelPrewarm
};
//#endregion
export { startGatewayPostAttachRuntime, startGatewaySidecars, testing };
