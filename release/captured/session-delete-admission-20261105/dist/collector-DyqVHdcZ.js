import { F as resolveTimerTimeoutMs } from "./number-coercion-CLj0HTDM.js";
import "./src-vebZIeLe.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { r as asNullableRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { g as redactToolPayloadTextWithConfig } from "./redact-Df68iObN.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as isDiagnosticFlagEnabled } from "./diagnostic-flags-Bk4brdIR.js";
import { D as tryResolveLegacyCompatibilityAgentId, i as listAgentEntries } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import "./session-key-CRjxKW0X.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { u as resolveSqliteTargetFromSessionStorePath } from "./store-entry-CMuTqREZ.js";
import { Worker } from "node:worker_threads";
import "./legacy.default-agent-owner-BMzvJbjU.js";
import "./agent-scope-CSlN0kZb.js";
import { t as runTasksWithConcurrency } from "./run-with-concurrency-B6LtW2cN.js";
import { d as getActivePluginRegistry } from "./runtime-MupoouIC.js";
import { l as toPublicPluginVerificationDiagnostic, o as listActiveDegradedPlugins, r as degradedPluginMatchesRoot } from "./runtime-degraded-state-B_-lbcPZ.js";
import { n as resolveHeartbeatSummaryForAgent } from "./heartbeat-summary-_n0hwz8v.js";
import { a as resolvePreferredAccountId, t as buildChannelAccountBindings } from "./bindings-DqjEuVfn.js";
import { i as resolveChannelDefaultAccountId } from "./helpers-MDpd3Xlg.js";
import { n as hasConfiguredUnavailableCredentialStatus, s as redactChannelStatusSummaryBaseUrl } from "./account-snapshot-fields-9nMCjtGM.js";
import { a as resolveUnavailableChannelAccountSnapshot } from "./account-state-FqMOJnak.js";
import { a as resolveChannelAccountEnabled, i as resolveChannelAccountConfigured, t as buildChannelAccountSnapshotFromInspection } from "./account-summary-CkgmhueC.js";
import { t as listReadOnlyChannelPluginsForConfig } from "./read-only-C_YmJcou.js";
import { t as inspectChannelAccount } from "./account-inspection-CaJAToAX.js";
import { n as awaitWithinDeadline, t as ABSOLUTE_DEADLINE_EXPIRED } from "./absolute-deadline-D0jNXqHr.js";
import { t as buildChannelAccountSnapshotFromAccount } from "./status-BLt40VmA.js";
import { i as resolveChannelHealthState, n as DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS, t as DEFAULT_CHANNEL_CONNECT_GRACE_MS } from "./channel-health-policy-D20awG2O.js";
import { n as listPluginServiceHealthFailures } from "./service-health-zkm8KGWr.js";
import { n as buildContextEngineHealthSummary, t as buildDeliveryQueueHealthSummary } from "./delivery-queue-B0zYYCY1.js";
//#region src/gateway/health/account-context.ts
const PUBLIC_IMESSAGE_FULL_DISK_ACCESS_ERROR = "imsg cannot access ~/Library/Messages/chat.db. Grant Full Disk Access to the Gateway/launcher process and restart Gateway.";
const redactIMessageProbeErrorMessage = (message) => {
	const trimmed = message.trim();
	if (!trimmed) return "";
	return trimmed.replaceAll(/\/Users\/[^/\s]+\/Library\/Messages\/chat\.db/g, "~/Library/Messages/chat.db");
};
function buildNonSensitiveProbeFailure(channelId, probe) {
	const record = asNullableRecord(probe);
	if (channelId !== "imessage" || !record || record.ok !== false) return;
	if (typeof record.error !== "string") return;
	const error = redactIMessageProbeErrorMessage(record.error);
	if (!/\bimsg\b/i.test(error) || !error.includes("~/Library/Messages/chat.db") || !/\bFull Disk Access\b/i.test(error)) return;
	return {
		ok: false,
		error: PUBLIC_IMESSAGE_FULL_DISK_ACCESS_ERROR
	};
}
function readBooleanField(value, key) {
	const record = asNullableRecord(value);
	if (!record) return;
	return typeof record[key] === "boolean" ? record[key] : void 0;
}
const hasAccountValue = (account) => account !== null && account !== void 0;
function resolveProbeAccountEnabled(params) {
	const fallback = readBooleanField(params.account, "enabled") ?? true;
	try {
		return resolveChannelAccountEnabled({
			plugin: params.plugin,
			account: params.account,
			cfg: params.cfg
		});
	} catch (error) {
		params.diagnostics.push(`${params.plugin.id}:${params.accountId}: failed to evaluate enabled state (${formatErrorMessage(error)}).`);
		return fallback;
	}
}
async function resolveProbeAccountConfigured(params) {
	const fallback = readBooleanField(params.account, "configured") ?? true;
	try {
		return await resolveChannelAccountConfigured({
			plugin: params.plugin,
			account: params.account,
			cfg: params.cfg,
			readAccountConfiguredField: true
		});
	} catch (error) {
		params.diagnostics.push(`${params.plugin.id}:${params.accountId}: failed to evaluate configured state (${formatErrorMessage(error)}).`);
		return fallback;
	}
}
async function resolveHealthAccountContext(params) {
	const diagnostics = [];
	let inspectedAccount;
	try {
		inspectedAccount = await inspectChannelAccount(params);
	} catch (error) {
		diagnostics.push(`${params.plugin.id}:${params.accountId}: failed to inspect account (${formatErrorMessage(error)}).`);
	}
	const inspectedEnabled = readBooleanField(inspectedAccount, "enabled");
	const inspectedConfigured = readBooleanField(inspectedAccount, "configured");
	let account;
	if (inspectedEnabled !== false && !hasConfiguredUnavailableCredentialStatus(inspectedAccount)) try {
		account = params.plugin.config.resolveAccount(params.cfg, params.accountId);
	} catch (error) {
		diagnostics.push(`${params.plugin.id}:${params.accountId}: failed to resolve account (${formatErrorMessage(error)}).`);
	}
	if (!hasAccountValue(account)) return {
		probeAccount: void 0,
		inspectedAccount,
		enabled: inspectedEnabled ?? false,
		configured: inspectedConfigured,
		diagnostics
	};
	const enabled = resolveProbeAccountEnabled({
		plugin: params.plugin,
		cfg: params.cfg,
		accountId: params.accountId,
		account,
		diagnostics
	});
	const configured = await resolveProbeAccountConfigured({
		plugin: params.plugin,
		cfg: params.cfg,
		accountId: params.accountId,
		account,
		diagnostics
	});
	return {
		probeAccount: account,
		inspectedAccount,
		enabled,
		configured,
		diagnostics
	};
}
//#endregion
//#region src/gateway/health/collector.ts
const HEALTH_COLLECTION_TIMEOUT_MS = 7e3;
const HEALTH_PROBE_CONCURRENCY = 5;
const HEALTH_RECENT_SESSION_LIMIT = 5;
const healthLog = createSubsystemLogger("health");
const debugHealth = (cfg, message, meta) => {
	if (isDiagnosticFlagEnabled("health", cfg)) healthLog.info(message, meta);
};
const resolveHeartbeatSummary = (cfg, agentId) => resolveHeartbeatSummaryForAgent(cfg, agentId);
function resolveHealthAgentOrder(cfg) {
	const defaultAgentId = tryResolveLegacyCompatibilityAgentId(cfg);
	const entries = listAgentEntries(cfg);
	const seen = /* @__PURE__ */ new Set();
	const ordered = [];
	for (const entry of entries) {
		if (!entry || typeof entry !== "object") continue;
		if (typeof entry.id !== "string" || !entry.id.trim()) continue;
		const id = normalizeAgentId(entry.id);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		ordered.push({
			id,
			name: typeof entry.name === "string" ? entry.name : void 0
		});
	}
	if (defaultAgentId && !seen.has(defaultAgentId)) ordered.unshift({ id: defaultAgentId });
	return {
		defaultAgentId,
		ordered
	};
}
// v-health-summary-worker-v1: the summary reads every session_nodes row's entry_valid, which sits after the
// entry JSON, so it walks every row's overflow pages: ~0.1 s with a warm page cache, 9-19 s cold, every
// 60 s refresh, on the main thread (V 2026-10-21 02:07 and 03:03). A persistent worker runs the same
// readSessionStoreSummaryReadOnly for each physical store first, with the scope and options the
// synchronous reader would pass; the reader then returns those results.
const V_HEALTH_SUMMARY_WORKER_TIMEOUT_MS = 12e4;
let vHealthSummaryWorker = null;
let vHealthSummarySequence = 0;
const vHealthSummaryPending = /* @__PURE__ */ new Map();
function vHealthSummaryScopeKey(scope) {
	return JSON.stringify([scope.agentId ?? null, scope.storePath ?? null]);
}
function getVHealthSummaryWorker() {
	if (vHealthSummaryWorker) return vHealthSummaryWorker;
	const worker = new Worker(new URL("./v-health-session-summary-worker.mjs", import.meta.url));
	worker.unref();
	const fail = (error) => {
		if (vHealthSummaryWorker === worker) vHealthSummaryWorker = null;
		for (const pending of vHealthSummaryPending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		vHealthSummaryPending.clear();
	};
	worker.on("message", (message) => {
		const pending = vHealthSummaryPending.get(message?.id);
		if (!pending) return;
		vHealthSummaryPending.delete(message.id);
		clearTimeout(pending.timer);
		pending.resolve(message.results);
	});
	worker.on("error", fail);
	worker.on("exit", (code) => fail(new Error(`health summary worker exited with code ${code}`)));
	vHealthSummaryWorker = worker;
	return worker;
}
function readHealthSummariesInWorker(requests) {
	const worker = getVHealthSummaryWorker();
	const id = ++vHealthSummarySequence;
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			vHealthSummaryPending.delete(id);
			reject(new Error("health summary worker timed out"));
		}, V_HEALTH_SUMMARY_WORKER_TIMEOUT_MS);
		timer.unref?.();
		vHealthSummaryPending.set(id, {
			resolve,
			reject,
			timer
		});
		worker.postMessage({
			id,
			requests
		});
	});
}
async function prefetchHealthSessionSummaries(agentIds, targets) {
	if (targets.length === 0 || process.env.OPENCLAW_V_HEALTH_SUMMARY_WORKER === "0") return null;
	const seenPaths = /* @__PURE__ */ new Set();
	const requests = [];
	for (const target of targets) {
		const path = resolveSqliteTargetFromSessionStorePath(target.storePath, { agentId: target.agentId }).path;
		if (seenPaths.has(path)) continue;
		seenPaths.add(path);
		requests.push({
			scope: {
				...target.agentId ? { agentId: target.agentId } : {},
				storePath: target.storePath
			},
			options: {
				agentIds,
				recentLimit: HEALTH_RECENT_SESSION_LIMIT
			}
		});
	}
	try {
		const results = await readHealthSummariesInWorker(requests);
		return new Map(requests.map((request, index) => [vHealthSummaryScopeKey(request.scope), results[index]]));
	} catch (error) {
		healthLog.warn(`health session summary worker unavailable, reading on the main thread: ${formatErrorMessage(error)}`);
		return null;
	}
}
async function createHealthSessionStoreReader(agentIds, targets = []) {
	const { createStatusSessionStoreReader } = await import("./session-stores-Bfpcoo3w.js");
	const { readSessionStoreSummaryReadOnly } = await import("./session-accessor-Dj50cDcA.js");
	const { isTransientSqliteError } = await import("./unhandled-rejections-FEKr3n0D.js");
	const prefetched = await prefetchHealthSessionSummaries(agentIds, targets);
	return createStatusSessionStoreReader(agentIds, HEALTH_RECENT_SESSION_LIMIT, (scope, options) => {
		const result = prefetched?.get(vHealthSummaryScopeKey(scope));
		if (result?.summary) return result.summary;
		if (result?.error) {
			if (!result.error.transient) throw Object.assign(new Error(result.error.message), {
				name: result.error.name ?? "Error",
				...result.error.code !== void 0 ? { code: result.error.code } : {}
			});
			return {
				count: 0,
				recent: [],
				byAgent: /* @__PURE__ */ new Map()
			};
		}
		try {
			return readSessionStoreSummaryReadOnly(scope, options);
		} catch (error) {
			if (!isTransientSqliteError(error)) throw error;
			return {
				count: 0,
				recent: [],
				byAgent: /* @__PURE__ */ new Map()
			};
		}
	});
}
function projectHealthSessions(path, summary) {
	const recent = summary.recent.map(({ sessionKey: key, entry }) => ({
		key,
		updatedAt: entry.updatedAt || null,
		age: entry.updatedAt ? Date.now() - entry.updatedAt : null
	}));
	return {
		path,
		count: summary.count,
		recent
	};
}
async function buildHealthSessionSummary(storePath, agentId) {
	const store = (await createHealthSessionStoreReader(agentId ? [agentId] : [], [{
		agentId,
		storePath
	}])).read(storePath, agentId);
	return projectHealthSessions(store.path, store);
}
/** Shares one bounded session snapshot across every configured agent in this collection. */
async function buildHealthAgentSummaries(cfg, { defaultAgentId, ordered }) {
	const reader = await createHealthSessionStoreReader(ordered.map((entry) => entry.id), ordered.map((entry) => ({
		agentId: entry.id,
		storePath: resolveSessionStorePathCore(cfg.session?.store, { agentId: entry.id })
	})));
	return ordered.map((entry) => {
		const store = reader.read(resolveSessionStorePathCore(cfg.session?.store, { agentId: entry.id }), entry.id);
		return {
			agentId: entry.id,
			name: entry.name,
			isDefault: entry.id === defaultAgentId,
			heartbeat: resolveHeartbeatSummary(cfg, entry.id),
			sessions: projectHealthSessions(store.path, store)
		};
	});
}
function buildPluginHealthSummary(cfg) {
	function projectError(plugin, error) {
		return {
			...error,
			activationSource: plugin?.activationSource,
			activationReason: plugin?.activationReason,
			error: truncateUtf16Safe(redactToolPayloadTextWithConfig(error.error, cfg.logging), 1e3)
		};
	}
	const registry = getActivePluginRegistry();
	const degradedPlugins = listActiveDegradedPlugins();
	const unavailable = degradedPlugins.map(({ pluginId, state, diagnostic }) => ({
		id: pluginId,
		state,
		diagnostic: toPublicPluginVerificationDiagnostic(diagnostic)
	})).toSorted((left, right) => left.id.localeCompare(right.id));
	const loaded = (registry?.plugins ?? []).filter((plugin) => plugin.status === "loaded").map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
	const loadErrors = (registry?.plugins ?? []).filter((plugin) => plugin.status === "error" && !degradedPlugins.some((degraded) => plugin.id === degraded.pluginId && plugin.failurePhase === "validation" && plugin.activationReason === `configured-unavailable: ${degraded.diagnostic.reason}` && Boolean(plugin.rootDir) && degradedPluginMatchesRoot(degraded, plugin.rootDir ?? ""))).map((plugin) => projectError(plugin, {
		id: plugin.id,
		origin: plugin.origin,
		activated: plugin.activated === true,
		error: plugin.error ?? "unknown plugin load error",
		...plugin.failurePhase ? { failurePhase: plugin.failurePhase } : {}
	}));
	const serviceErrors = registry ? listPluginServiceHealthFailures(registry).map((failure) => projectError(registry.plugins.find((entry) => entry.id === failure.pluginId), {
		id: failure.pluginId,
		origin: failure.origin,
		activated: true,
		failurePhase: "service",
		error: `service ${failure.serviceId}: ${failure.error}`
	})) : [];
	const errors = [...loadErrors, ...serviceErrors].toSorted((left, right) => left.id.localeCompare(right.id) || left.error.localeCompare(right.error));
	if (loaded.length === 0 && errors.length === 0 && unavailable.length === 0) return;
	return {
		loaded,
		errors,
		unavailable
	};
}
let activeHealthOperations = 0;
const healthOperationWaiters = [];
function settleHealthOperationWaiter(waiter, release) {
	if (waiter.settled) return;
	waiter.settled = true;
	clearTimeout(waiter.timer);
	waiter.resolve(release);
}
function releaseNextHealthOperationWaiter() {
	while (healthOperationWaiters.length > 0) {
		const waiter = healthOperationWaiters.shift();
		if (!waiter || waiter.settled) continue;
		if (Date.now() >= waiter.deadlineAtMs) {
			settleHealthOperationWaiter(waiter, null);
			continue;
		}
		settleHealthOperationWaiter(waiter, createHealthOperationRelease());
		return;
	}
}
function createHealthOperationRelease() {
	activeHealthOperations += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		activeHealthOperations -= 1;
		releaseNextHealthOperationWaiter();
	};
}
async function acquireHealthOperationPermit(deadlineAtMs) {
	if (Date.now() >= deadlineAtMs) return null;
	if (activeHealthOperations < HEALTH_PROBE_CONCURRENCY) return createHealthOperationRelease();
	return await new Promise((resolve) => {
		const waiter = {
			deadlineAtMs,
			resolve,
			timer: setTimeout(() => {
				const index = healthOperationWaiters.indexOf(waiter);
				if (index >= 0) healthOperationWaiters.splice(index, 1);
				settleHealthOperationWaiter(waiter, null);
			}, Math.max(1, deadlineAtMs - Date.now())),
			settled: false
		};
		if (typeof waiter.timer === "object" && "unref" in waiter.timer) waiter.timer.unref();
		healthOperationWaiters.push(waiter);
	});
}
function buildHealthTimeoutRecord(accountId, timeoutMs) {
	const error = `health collection timed out after ${timeoutMs}ms`;
	return {
		accountId,
		lastError: error,
		probe: {
			ok: false,
			timedOut: true,
			error
		}
	};
}
function resolveHealthProbeTimeoutMs(deadlineAtMs) {
	return Math.max(1, deadlineAtMs - Date.now());
}
async function buildHealthAccountRecord(params) {
	const timedOut = () => buildHealthTimeoutRecord(params.accountId, params.timeoutMs);
	const runtimeSnapshot = params.runtimeSnapshot?.channelAccounts[params.plugin.id]?.[params.accountId] ?? (params.accountId === params.defaultAccountId ? params.runtimeSnapshot?.channels[params.plugin.id] : void 0);
	const unavailable = resolveUnavailableChannelAccountSnapshot(params.cfg, {
		channelId: params.plugin.id,
		accountId: params.accountId,
		runtime: runtimeSnapshot
	});
	if (unavailable) return unavailable;
	const { probeAccount, inspectedAccount, enabled, configured, diagnostics } = await resolveHealthAccountContext({
		plugin: params.plugin,
		cfg: params.cfg,
		accountId: params.accountId
	});
	if (Date.now() >= params.deadlineAtMs) return timedOut();
	if (diagnostics.length > 0) debugHealth(params.cfg, "account.diagnostics", {
		channel: params.plugin.id,
		accountId: params.accountId,
		diagnostics
	});
	let probe;
	let lastProbeAt = null;
	if (probeAccount !== void 0 && enabled && configured === true && params.probe && params.plugin.status?.probeAccount) try {
		probe = await params.plugin.status.probeAccount({
			account: probeAccount,
			timeoutMs: resolveHealthProbeTimeoutMs(params.deadlineAtMs),
			cfg: params.cfg
		});
		lastProbeAt = Date.now();
	} catch (error) {
		probe = {
			ok: false,
			error: formatErrorMessage(error)
		};
		lastProbeAt = Date.now();
	}
	if (Date.now() >= params.deadlineAtMs) return timedOut();
	const probeRecord = probe && typeof probe === "object" ? probe : null;
	const bot = probeRecord && typeof probeRecord.bot === "object" ? probeRecord.bot : null;
	if (bot?.username) debugHealth(params.cfg, "probe.bot", {
		channel: params.plugin.id,
		accountId: params.accountId,
		username: bot.username
	});
	const nonSensitiveProbeFailure = buildNonSensitiveProbeFailure(params.plugin.id, probe);
	const snapshotProbe = params.includeSensitive ? probe : nonSensitiveProbeFailure;
	const snapshot = probeAccount === void 0 ? buildChannelAccountSnapshotFromInspection({
		account: inspectedAccount,
		accountId: params.accountId,
		runtime: runtimeSnapshot,
		probe: snapshotProbe
	}) : await buildChannelAccountSnapshotFromAccount({
		plugin: params.plugin,
		cfg: params.cfg,
		accountId: params.accountId,
		account: probeAccount,
		runtime: runtimeSnapshot,
		probe: snapshotProbe,
		enabledFallback: enabled,
		configuredFallback: configured
	});
	if (Date.now() >= params.deadlineAtMs) return timedOut();
	if (lastProbeAt) snapshot.lastProbeAt = lastProbeAt;
	const healthState = resolveChannelHealthState(snapshot, {
		channelId: params.plugin.id,
		now: Date.now(),
		staleEventThresholdMs: DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS,
		channelConnectGraceMs: DEFAULT_CHANNEL_CONNECT_GRACE_MS
	});
	if (healthState !== void 0) snapshot.healthState = healthState;
	const summary = probeAccount !== void 0 && params.plugin.status?.buildChannelSummary ? await params.plugin.status.buildChannelSummary({
		account: probeAccount,
		cfg: params.cfg,
		defaultAccountId: params.accountId,
		snapshot
	}) : void 0;
	if (Date.now() >= params.deadlineAtMs) return timedOut();
	const record = redactChannelStatusSummaryBaseUrl(summary && typeof summary === "object" ? {
		...snapshot,
		...summary
	} : {
		...snapshot,
		accountId: params.accountId
	});
	if (record.configured === void 0 && probeAccount !== void 0) record.configured = configured;
	if (params.includeSensitive && record.probe === void 0 && probe !== void 0) record.probe = probe;
	if (!params.includeSensitive) {
		const safeProbeFailure = buildNonSensitiveProbeFailure(params.plugin.id, record.probe) ?? nonSensitiveProbeFailure;
		if (safeProbeFailure) record.probe = safeProbeFailure;
		else delete record.probe;
	}
	if (record.lastProbeAt === void 0 && lastProbeAt) record.lastProbeAt = lastProbeAt;
	record.accountId = params.accountId;
	return record;
}
async function runHealthAccountWithinDeadline(params) {
	const release = await acquireHealthOperationPermit(params.deadlineAtMs);
	if (!release) return buildHealthTimeoutRecord(params.accountId, params.timeoutMs);
	const operation = buildHealthAccountRecord(params);
	operation.then(release, release);
	const result = await awaitWithinDeadline(() => operation, params.deadlineAtMs);
	return result === ABSOLUTE_DEADLINE_EXPIRED ? buildHealthTimeoutRecord(params.accountId, params.timeoutMs) : result;
}
/** Collects the gateway-owned health snapshot for an explicit trust audience. */
async function collectGatewayHealthSnapshot(params) {
	const start = Date.now();
	const timeoutMs = Math.min(resolveTimerTimeoutMs(params.timeoutMs, HEALTH_COLLECTION_TIMEOUT_MS, 50), HEALTH_COLLECTION_TIMEOUT_MS);
	const deadlineAtMs = start + timeoutMs;
	const cfg = await readRuntimeHealthConfig();
	const { defaultAgentId, ordered } = resolveHealthAgentOrder(cfg);
	const channelBindings = buildChannelAccountBindings(cfg);
	const agents = await buildHealthAgentSummaries(cfg, {
		defaultAgentId,
		ordered
	});
	const summaryAgent = agents.find((agent) => agent.isDefault) ?? agents[0];
	const configuredHeartbeatAgentId = normalizeOptionalString(cfg.agents?.defaults?.heartbeat?.agentId);
	const heartbeatSummaryAgent = (configuredHeartbeatAgentId ? agents.find((agent) => agent.heartbeat.enabled && agent.agentId === normalizeAgentId(configuredHeartbeatAgentId)) : void 0) ?? agents.find((agent) => agent.heartbeat.enabled) ?? summaryAgent;
	const heartbeatSeconds = heartbeatSummaryAgent?.heartbeat.everyMs ? Math.round(heartbeatSummaryAgent.heartbeat.everyMs / 1e3) : 0;
	const sessions = summaryAgent?.sessions ?? await buildHealthSessionSummary(resolveSessionStorePathCore(cfg.session?.store, { agentId: summaryAgent?.agentId }), summaryAgent?.agentId);
	const includeSensitive = params.audience === "admin";
	const channels = {};
	const plugins = listReadOnlyChannelPluginsForConfig(cfg, {
		includeSetupFallbackPlugins: false,
		includePersistedAuthState: false
	});
	const channelOrder = plugins.map((plugin) => plugin.id);
	const channelLabels = {};
	const channelPlans = plugins.map((plugin) => {
		channelLabels[plugin.id] = plugin.meta.label ?? plugin.id;
		const accountIds = plugin.config.listAccountIds(cfg);
		const defaultAccountId = resolveChannelDefaultAccountId({
			plugin,
			cfg,
			accountIds
		});
		const boundAccounts = defaultAgentId ? channelBindings.get(plugin.id)?.get(defaultAgentId) ?? [] : [];
		const preferredAccountId = resolvePreferredAccountId({
			accountIds,
			defaultAccountId,
			boundAccounts
		});
		const boundAccountIdsAll = Array.from(new Set(Array.from(channelBindings.get(plugin.id)?.values() ?? []).flat()));
		const accountIdsToProbe = Array.from(new Set([
			preferredAccountId,
			defaultAccountId,
			...accountIds,
			...boundAccountIdsAll
		].filter((value) => value && value.trim())));
		debugHealth(cfg, "channel", {
			id: plugin.id,
			accountIds,
			defaultAccountId,
			boundAccounts,
			preferredAccountId,
			accountIdsToProbe
		});
		return {
			plugin,
			defaultAccountId,
			preferredAccountId,
			accountIds: accountIdsToProbe,
			accountSummaries: {}
		};
	});
	const accountTasks = channelPlans.flatMap((plan) => plan.accountIds.map((accountId) => ({
		plan,
		accountId
	})));
	const { results: accountResults } = await runTasksWithConcurrency({
		tasks: accountTasks.map(({ plan, accountId }) => async () => ({
			plan,
			accountId,
			record: await runHealthAccountWithinDeadline({
				plugin: plan.plugin,
				cfg,
				accountId,
				defaultAccountId: plan.defaultAccountId,
				includeSensitive,
				probe: params.probe,
				deadlineAtMs,
				timeoutMs,
				runtimeSnapshot: params.runtimeSnapshot
			})
		})),
		limit: params.probe ? HEALTH_PROBE_CONCURRENCY : 1,
		throwOnError: true
	});
	for (const result of accountResults) if (result) result.plan.accountSummaries[result.accountId] = result.record;
	for (const plan of channelPlans) {
		const fallbackSummary = plan.accountSummaries[plan.preferredAccountId] ?? plan.accountSummaries[plan.defaultAccountId] ?? plan.accountSummaries[plan.accountIds[0] ?? plan.preferredAccountId] ?? plan.accountSummaries[expectDefined(Object.keys(plan.accountSummaries)[0], "object.keys(account summaries) entry at 0")];
		if (fallbackSummary) channels[plan.plugin.id] = {
			...fallbackSummary,
			accounts: plan.accountSummaries
		};
	}
	const pluginHealth = buildPluginHealthSummary(cfg);
	const contextEngineHealth = buildContextEngineHealthSummary();
	const deliveryQueueHealth = buildDeliveryQueueHealthSummary();
	return {
		ok: true,
		ts: Date.now(),
		durationMs: Date.now() - start,
		...params.eventLoop ? { eventLoop: params.eventLoop } : {},
		...pluginHealth ? { plugins: pluginHealth } : {},
		...contextEngineHealth ? { contextEngines: contextEngineHealth } : {},
		...deliveryQueueHealth ? { deliveryQueues: deliveryQueueHealth } : {},
		...params.configReloadHotReloadStatus ? { configReload: { hotReloadStatus: params.configReloadHotReloadStatus } } : {},
		channels,
		channelOrder,
		channelLabels,
		heartbeatSeconds,
		...defaultAgentId ? { defaultAgentId } : {},
		agents,
		sessions: {
			path: sessions.path,
			count: sessions.count,
			recent: sessions.recent
		}
	};
}
async function readRuntimeHealthConfig() {
	const { getRuntimeConfig } = await import("./config/config.js");
	return getRuntimeConfig();
}
//#endregion
export { resolveHealthAccountContext as i, collectGatewayHealthSnapshot as n, resolveHealthAgentOrder as r, buildHealthAgentSummaries as t };
