import { u as toStringifiedError } from "./error-coercion-CwcmpTBO.js";
import { r as racePromiseWithAbortSignal, t as createAbortError } from "./abort-signal-D2k14JsD.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { r as normalizeProviderId } from "./provider-id-DMd-TDFp.js";
import { t as createDeferredCore } from "./deferred-D0La5CRk.js";
import { D as tryResolveLegacyCompatibilityAgentId, m as resolveAgentWorkspaceDir, o as listAgentIds, u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import "./legacy.default-agent-owner-BMzvJbjU.js";
import { u as hashRuntimeConfigValue } from "./runtime-snapshot-BVoUH4MI.js";
import "./defaults-CdX9UGcX.js";
import { C as resolveSubagentSpawnModelFallbacksOverride } from "./agent-scope-CSlN0kZb.js";
import { n as resolveSubagentConfiguredModelSelection, t as resolveDefaultModelForAgent } from "./model-selection-config-bdtzr00S.js";
import { t as runTasksWithConcurrency } from "./run-with-concurrency-B6LtW2cN.js";
import { t as collectConfiguredAgentHarnessRuntimes } from "./harness-runtimes-Co-CLL5a.js";
import { D as registerRuntimeAuthMaterializationMutationListener, T as getPreparedRuntimeAuthMaterializations, v as registerRuntimeAuthProfileStoreMutationListener } from "./runtime-snapshots-C1iF8uaR.js";
import { a as resolveLegacyInheritedAuthDir } from "./legacy-inherited-auth-dir-DFUw26T1.js";
import { c as setPreparedModelRuntimeAuthMaterializations, l as setPreparedModelRuntimeAuthStore, s as setPreparedModelRuntimeAuthLoader, t as copyPreparedModelRuntimeAuthBindings } from "./prepared-model-runtime-auth-CnrySjUa.js";
import { r as resolvePublishedModelCatalogOwner, t as preparePublishedModelCatalogOwnerIdentity } from "./prepared-model-catalog-owner-Ca2Si6qe.js";
import { i as preparedPluginGenerationSupportsSelections, p as resolveUsableAgentCredentialModes, r as preparedPluginGenerationReusesBase } from "./prepared-model-runtime.plugin-generation-pQZavE54.js";
import { bt as AuthStorage } from "./sessions-CHgQo4vL.js";
import { l as prepareModelCatalogThinkingPolicies } from "./thinking-DxxV8Ztb.js";
import { o as resolveSelectedAgentHarnessRuntime } from "./runtime-plugin-load-plan-Bm46qisR.js";
import { i as prepareFullCatalogFacts, r as materializePreparedModelCatalog } from "./prepared-model-runtime.full-catalog-CMXC5WYF.js";
import { n as PreparedModelRuntimePublicationSupersededError, t as PreparedModelRuntimeOwnerNotPublishedError } from "./prepared-model-runtime.errors-DeG6Ut3_.js";
import { r as isReservedSystemAgentId } from "./agent-id-CaFmP6-7.js";
import { r as resolveModelCandidateChain } from "./model-fallback-candidates-B-mHEN3S.js";
import { n as resolveConfiguredModelFallbacks } from "./model-selection-resolve-C6fFERVD.js";
import { t as runAbortableTimeout } from "./with-timeout-gZtoLtw8.js";
import { a as preparedModelInventoryKey, d as preparedModelRuntimeWorkspaceFactsKey, i as prepareWorkspaceBuildGroup, l as createPreparedInboundRegistryLoader, n as prepareAgentCatalogSource, r as prepareConfiguredRuntimeFactsBatch, t as fingerprintPreparedRuntimeFacts } from "./prepared-model-runtime.facts-CEW6RO02.js";
import { n as createPreparedModelCatalogWorkerInput, t as createPreparedModelCatalogWorker } from "./prepared-model-catalog-worker-e4XwYzOa.js";
import { t as getPreparedModelRuntimeBorrowedSnapshot } from "./prepared-model-runtime-generation-scope-o4umnoSw.js";
import path from "node:path";
import { performance } from "node:perf_hooks";
import pLimit from "p-limit";
import { setImmediate } from "node:timers/promises";
//#region src/agents/prepared-model-runtime.publication-events.ts
const log$1 = createSubsystemLogger("agents/prepared-model-runtime");
const publicationListeners = /* @__PURE__ */ new Set();
/** Observes committed prepared model/auth generations without starting discovery. */
function registerPreparedModelRuntimePublicationListener(listener) {
	publicationListeners.add(listener);
	return () => publicationListeners.delete(listener);
}
function notifyPreparedModelRuntimePublication(event) {
	for (const listener of publicationListeners) try {
		listener(event);
	} catch (error) {
		log$1.warn(`prepared model runtime publication listener failed: ${String(error)}`);
	}
}
function resetPreparedModelRuntimePublicationListenersForTest() {
	publicationListeners.clear();
}
//#endregion
//#region src/agents/prepared-model-runtime.build.ts
const MAX_CONCURRENT_MODEL_RUNTIME_AGENT_SOURCE_BUILDS = 2;
const MAX_CONCURRENT_FULL_MODEL_CATALOG_BUILDS = 1;
const limitFullModelCatalogBuild = pLimit(MAX_CONCURRENT_FULL_MODEL_CATALOG_BUILDS);
function runSerializedPreparedModelRuntimeTask(params) {
	const previous = params.agentBuildCompletions.get(params.agentDir);
	const pending = (async () => {
		if (previous) await previous;
		await setImmediate();
		if (!params.isCurrent()) throw new PreparedModelRuntimePublicationSupersededError(`prepared model runtime catalog generation was superseded for ${params.agentDir}`);
		return await params.task();
	})();
	const completion = pending.then(() => void 0, () => void 0);
	params.agentBuildCompletions.set(params.agentDir, completion);
	completion.then(() => {
		if (params.agentBuildCompletions.get(params.agentDir) === completion) params.agentBuildCompletions.delete(params.agentDir);
	});
	return pending;
}
function assertPreparedModelRuntimeInputCurrent(input, isCurrent) {
	if (isCurrent && !isCurrent()) throw new PreparedModelRuntimePublicationSupersededError(`prepared model runtime publication was superseded for ${input.agentDir}`);
}
function assertPreparedModelRuntimeCandidatesCurrent(candidates) {
	for (const candidate of candidates) assertPreparedModelRuntimeInputCurrent(candidate.input, candidate.isBuildCurrent);
}
function groupBuildCandidates(candidates, keyOf) {
	const groups = /* @__PURE__ */ new Map();
	for (const candidate of candidates) {
		const key = keyOf(candidate);
		const group = groups.get(key) ?? [];
		group.push(candidate);
		groups.set(key, group);
	}
	return groups;
}
function createFullModelCatalogAccess(params) {
	const project = (catalog) => {
		const projected = materializePreparedModelCatalog(catalog, params.agentFacts.runtimeCapabilityModels);
		prepareModelCatalogThinkingPolicies({
			catalog: projected,
			metadataSnapshot: params.pluginGeneration.pluginMetadataSnapshot,
			providers: params.pluginGeneration.pluginRegistry?.providers
		});
		return projected;
	};
	const inventoryKey = preparedModelInventoryKey(params.agentFacts.input);
	const inventory = params.inventoryOwner.catalogInventory;
	let fullCatalog = inventory?.key === inventoryKey ? project(inventory.catalog) : void 0;
	let pending;
	let pendingAuth;
	const assertCurrent = () => assertPreparedModelRuntimeInputCurrent(params.agentFacts.input, params.isCurrent);
	const worker = createPreparedModelCatalogWorker({
		input: createPreparedModelCatalogWorkerInput({
			agentFacts: params.agentFacts,
			pluginMetadataSnapshot: params.pluginGeneration.pluginMetadataSnapshot,
			preferBuiltPluginArtifacts: params.pluginGeneration.preferBuiltPluginArtifacts
		}),
		isCurrent: params.isCurrent
	});
	return {
		loadAuth: ({ providerIds, profileIds }) => {
			const cacheKey = [providerIds, profileIds ?? []].map((ids) => [...new Set(ids)].toSorted((left, right) => left.localeCompare(right)).join("\0")).join("\0\0");
			if (pendingAuth?.key === cacheKey) return pendingAuth.promise;
			const promise = worker.loadAuth({
				providerIds,
				...profileIds?.length ? { profileIds } : {}
			}).then((refreshed) => {
				const authModes = { ...resolveUsableAgentCredentialModes(params.agentFacts.credentials) };
				for (const providerId of providerIds) delete authModes[normalizeProviderId(providerId)];
				Object.assign(authModes, refreshed.authModes);
				return {
					authStore: refreshed.authStore,
					authModes: Object.freeze(authModes)
				};
			}).finally(() => {
				if (pendingAuth?.promise === promise) pendingAuth = void 0;
			});
			pendingAuth = {
				key: cacheKey,
				promise
			};
			return promise;
		},
		readFullModelCatalog: () => {
			assertCurrent();
			return fullCatalog;
		},
		loadFullModelCatalog: async (options) => {
			assertCurrent();
			if (!options?.refresh && fullCatalog) return fullCatalog;
			if (!pending) pending = runSerializedPreparedModelRuntimeTask({
				agentDir: params.agentFacts.input.agentDir,
				agentBuildCompletions: params.agentBuildCompletions,
				isCurrent: params.isCurrent,
				task: async () => await limitFullModelCatalogBuild(async () => {
					assertCurrent();
					const catalog = await worker.loadCatalog();
					assertCurrent();
					return catalog;
				})
			}).then((catalog) => {
				assertCurrent();
				fullCatalog = project(catalog);
				params.inventoryOwner.catalogInventory = {
					catalog,
					key: inventoryKey
				};
				notifyPreparedModelRuntimePublication({ phase: "catalog-published" });
				return fullCatalog;
			}).finally(() => {
				pending = void 0;
			});
			return pending;
		}
	};
}
function createSnapshot(catalogOwner, agentFacts, pluginGeneration, catalogFacts, catalogAccess) {
	const { credentials, input } = agentFacts;
	const { mediaCapabilityProviders, messageToolCatalog, pluginMetadataSnapshot, pluginRegistry } = pluginGeneration;
	const { configuredRuntimeModels, inlineProviderModels, templateModelRegistry } = catalogFacts;
	const modelCatalog = materializePreparedModelCatalog(catalogFacts.modelCatalog, agentFacts.runtimeCapabilityModels);
	prepareModelCatalogThinkingPolicies({
		catalog: modelCatalog,
		metadataSnapshot: pluginMetadataSnapshot,
		providers: pluginRegistry?.providers
	});
	const createStores = () => {
		const authStorage = AuthStorage.inMemory(credentials);
		return {
			authStorage,
			modelRegistry: templateModelRegistry.fork(authStorage)
		};
	};
	const snapshot = Object.freeze({
		catalogOwner,
		...input.agentId ? { agentId: input.agentId } : {},
		agentDir: input.agentDir,
		activeProjectKeys: [],
		...input.inheritedAuthDir ? { inheritedAuthDir: input.inheritedAuthDir } : {},
		...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {},
		config: input.config,
		authModes: resolveUsableAgentCredentialModes(credentials),
		metadataSnapshot: pluginMetadataSnapshot,
		allowGatewaySubagentBinding: input.allowGatewaySubagentBinding === true,
		...pluginRegistry ? { pluginRegistry } : {},
		...messageToolCatalog ? { messageToolCatalog } : {},
		...mediaCapabilityProviders ? { mediaCapabilityProviders } : {},
		modelCatalog,
		readFullModelCatalog: catalogAccess.readFullModelCatalog,
		loadFullModelCatalog: catalogAccess.loadFullModelCatalog,
		configuredRuntimeModels,
		inlineProviderModels,
		createStores
	});
	setPreparedModelRuntimeAuthStore(snapshot, agentFacts.authStore);
	setPreparedModelRuntimeAuthLoader(snapshot, catalogAccess.loadAuth);
	setPreparedModelRuntimeAuthMaterializations(snapshot, Object.freeze([...getPreparedRuntimeAuthMaterializations(input.agentDir)]));
	return snapshot;
}
async function buildSnapshotBatch(candidates, catalogMode, agentBuildCompletions, pluginMetadataSnapshot, onBuildStats, includeCredentialProviders = catalogMode === "live") {
	const generations = groupBuildCandidates(candidates, (candidate) => candidate.pluginGeneration);
	const fresh = generations.get(void 0) ?? [];
	generations.delete(void 0);
	generations.set(void 0, fresh);
	const groups = [...generations].flatMap(([pluginGeneration, generationCandidates]) => [...groupBuildCandidates(generationCandidates, (candidate) => {
		const workspace = preparedModelRuntimeWorkspaceFactsKey(candidate.input);
		const kind = candidate.prepareInboundPluginRegistry ? "configured" : "dynamic";
		return pluginGeneration ? workspace : `${kind}\0${workspace}`;
	}).values()].map((groupCandidates) => ({
		groupCandidates,
		pluginGeneration
	})));
	const preparedInputs = /* @__PURE__ */ new Map();
	const requirePreparedInput = (input) => {
		const prepared = preparedInputs.get(input);
		if (!prepared) throw new Error(`prepared model runtime facts missing for ${input.agentDir}`);
		return prepared;
	};
	const loadInboundPluginRegistry = createPreparedInboundRegistryLoader();
	const configuredHarnessRuntimesByConfig = /* @__PURE__ */ new Map();
	let runtimePluginMs = 0;
	let pluginMetadataMs = 0;
	let staticProviderCatalogMs = 0;
	let ambientCredentialsMs = 0;
	let agentFactsMs = 0;
	let configuredProjectionMs = 0;
	const workspaceFactsStartedAt = performance.now();
	for (const { groupCandidates, pluginGeneration } of groups) {
		for (const candidate of groupCandidates) assertPreparedModelRuntimeInputCurrent(candidate.input, candidate.isPreparationCurrent);
		const prepareInboundPluginRegistry = groupCandidates.some((candidate) => candidate.prepareInboundPluginRegistry);
		const preferBuiltPluginArtifacts = pluginGeneration?.preferBuiltPluginArtifacts ?? prepareInboundPluginRegistry;
		const getConfiguredHarnessRuntimes = () => {
			const config = groupCandidates[0].input.config;
			let runtimes = configuredHarnessRuntimesByConfig.get(config);
			if (!runtimes) {
				runtimes = collectConfiguredAgentHarnessRuntimes(config);
				configuredHarnessRuntimesByConfig.set(config, runtimes);
			}
			return runtimes;
		};
		const prepared = await prepareWorkspaceBuildGroup(groupCandidates.map(({ input }) => input), catalogMode, {
			preferBuiltPluginArtifacts,
			includeCredentialProviders,
			getConfiguredHarnessRuntimes
		}, prepareInboundPluginRegistry ? loadInboundPluginRegistry : void 0, pluginGeneration, pluginMetadataSnapshot);
		assertPreparedModelRuntimeCandidatesCurrent(groupCandidates);
		runtimePluginMs += prepared.buildStats.runtimePluginMs;
		pluginMetadataMs += prepared.buildStats.pluginMetadataMs;
		staticProviderCatalogMs += prepared.buildStats.staticProviderCatalogMs;
		ambientCredentialsMs += prepared.buildStats.ambientCredentialsMs;
		agentFactsMs += prepared.buildStats.agentFactsMs;
		configuredProjectionMs += prepared.buildStats.configuredProjectionMs;
		for (const agentFacts of prepared.agentFacts) preparedInputs.set(agentFacts.input, {
			agentFacts,
			pluginGeneration: prepared.pluginGeneration
		});
	}
	const workspaceFactsMs = performance.now() - workspaceFactsStartedAt;
	const catalogSourceStartedAt = performance.now();
	const catalogSources = /* @__PURE__ */ new Map();
	if (catalogMode === "live") {
		const sourceCandidatesByAgentDir = groupBuildCandidates(candidates, ({ input }) => input.agentDir);
		const sourceErrors = [];
		const sourceBuild = await runTasksWithConcurrency({
			limit: MAX_CONCURRENT_MODEL_RUNTIME_AGENT_SOURCE_BUILDS,
			errorMode: "stop",
			onTaskError: (error) => {
				sourceErrors.push(error);
			},
			tasks: [...sourceCandidatesByAgentDir.values()].map((sourceCandidates) => async () => {
				for (const candidate of sourceCandidates) {
					const { input } = candidate;
					const { agentFacts, pluginGeneration } = requirePreparedInput(input);
					assertPreparedModelRuntimeInputCurrent(input, candidate.isBuildCurrent);
					const catalogSource = await prepareAgentCatalogSource(agentFacts, pluginGeneration, catalogMode);
					assertPreparedModelRuntimeInputCurrent(input, candidate.isBuildCurrent);
					catalogSources.set(input, catalogSource);
				}
			})
		});
		if (sourceBuild.hasError) throw toStringifiedError(sourceErrors.find((error) => !(error instanceof PreparedModelRuntimePublicationSupersededError)) ?? sourceBuild.firstError);
	}
	const catalogSourceMs = performance.now() - catalogSourceStartedAt;
	const preparedCatalogs = /* @__PURE__ */ new Map();
	let runtimeRegistryCount = 0;
	const registryStartedAt = performance.now();
	if (catalogMode === "live") for (const candidate of candidates) {
		const { input } = candidate;
		const { agentFacts, pluginGeneration } = requirePreparedInput(input);
		const catalogSource = catalogSources.get(input);
		if (!catalogSource) throw new Error(`prepared model runtime catalog source missing for ${input.agentDir}`);
		assertPreparedModelRuntimeInputCurrent(input, candidate.isBuildCurrent);
		preparedCatalogs.set(input, await prepareFullCatalogFacts(agentFacts, pluginGeneration, catalogMode, catalogSource));
		assertPreparedModelRuntimeInputCurrent(input, candidate.isBuildCurrent);
		runtimeRegistryCount += 1;
	}
	else for (const { groupCandidates } of groups) {
		assertPreparedModelRuntimeCandidatesCurrent(groupCandidates);
		const { pluginGeneration } = requirePreparedInput(groupCandidates[0].input);
		const batch = prepareConfiguredRuntimeFactsBatch({
			agentFacts: groupCandidates.map(({ input }) => requirePreparedInput(input).agentFacts),
			pluginGeneration
		});
		runtimeRegistryCount += batch.registryCount;
		for (const [input, catalogFacts] of batch.catalogs) preparedCatalogs.set(input, catalogFacts);
		assertPreparedModelRuntimeCandidatesCurrent(groupCandidates);
	}
	const registryMs = performance.now() - registryStartedAt;
	const preparedAgentFacts = [...preparedInputs.values()].map(({ agentFacts }) => agentFacts);
	const configuredRuntimeModelCount = [...preparedCatalogs.values()].reduce((count, facts) => count + facts.configuredRuntimeModels.length, 0);
	const generatedCatalogPluginCount = new Set(preparedAgentFacts.flatMap((facts) => facts.configuredGeneratedCatalogPluginIds)).size;
	const generatedCatalogReadCount = preparedAgentFacts.reduce((count, facts) => count + facts.configuredGeneratedCatalogPluginIds.length, 0);
	onBuildStats?.({
		agentCount: candidates.length,
		workspaceGroupCount: groups.length,
		configuredFactsGroupCount: groups.length,
		catalogSourceCount: catalogMode === "live" ? preparedAgentFacts.filter(({ input }) => !input.readOnly).length : 0,
		credentialGroupCount: new Set(preparedAgentFacts.map(({ credentials }) => fingerprintPreparedRuntimeFacts(credentials))).size,
		catalogGroupCount: catalogMode === "live" ? candidates.length : 0,
		runtimeRegistryCount,
		configuredRuntimeModelCount,
		generatedCatalogPluginCount,
		generatedCatalogReadCount,
		workspaceFactsMs,
		runtimePluginMs,
		pluginMetadataMs,
		staticProviderCatalogMs,
		ambientCredentialsMs,
		agentFactsMs,
		configuredProjectionMs,
		catalogSourceMs,
		registryMs,
		sourceConcurrencyLimit: MAX_CONCURRENT_MODEL_RUNTIME_AGENT_SOURCE_BUILDS,
		fullCatalogConcurrencyLimit: MAX_CONCURRENT_FULL_MODEL_CATALOG_BUILDS
	});
	assertPreparedModelRuntimeCandidatesCurrent(candidates);
	return candidates.map((candidate) => {
		const { input } = candidate;
		const { agentFacts, pluginGeneration } = requirePreparedInput(input);
		const catalogFacts = preparedCatalogs.get(input);
		if (!catalogFacts) throw new Error(`prepared model runtime snapshot facts missing for ${input.agentDir}`);
		return {
			snapshot: createSnapshot(candidate.catalogOwner, agentFacts, pluginGeneration, catalogFacts, createFullModelCatalogAccess({
				agentFacts,
				pluginGeneration,
				agentBuildCompletions,
				isCurrent: candidate.isGenerationCurrent ?? (() => false),
				inventoryOwner: candidate.inventoryOwner ?? {}
			})),
			pluginGeneration
		};
	});
}
function startSerializedSnapshotBuildBatch(candidates, agentBuildCompletions, buildTimeoutMs, catalogMode = "live", onBuildStats, pluginMetadataSnapshot, includeCredentialProviders = catalogMode === "live") {
	const agentDirs = [...new Set(candidates.map(({ input }) => input.agentDir))];
	const previousBuildCompletions = agentDirs.map((agentDir) => agentBuildCompletions.get(agentDir)).filter((completion) => completion !== void 0);
	const startBuild = (async () => {
		if (previousBuildCompletions.length > 0) await Promise.all(previousBuildCompletions);
		return { actualBuild: buildSnapshotBatch(candidates, catalogMode, agentBuildCompletions, pluginMetadataSnapshot, onBuildStats, includeCredentialProviders) };
	})();
	const completion = startBuild.then(({ actualBuild }) => actualBuild).then(() => void 0, () => void 0);
	for (const agentDir of agentDirs) {
		agentBuildCompletions.set(agentDir, completion);
		completion.then(() => {
			if (agentBuildCompletions.get(agentDir) === completion) agentBuildCompletions.delete(agentDir);
		});
	}
	return {
		pending: runAbortableTimeout(async () => (await startBuild).actualBuild, buildTimeoutMs, "prepared model runtime publication"),
		completion
	};
}
//#endregion
//#region src/agents/prepared-model-runtime.owner.ts
const ownersBySnapshot = /* @__PURE__ */ new WeakMap();
function resolvePreparedModelRuntimeOwnerBySnapshot(snapshot) {
	return ownersBySnapshot.get(snapshot);
}
function publishPreparedModelRuntimeOwnerSnapshot(owner, snapshot) {
	const published = stampPreparedModelRuntimeSnapshotConfig(snapshot, owner.input.config);
	if (owner.snapshot) ownersBySnapshot.delete(owner.snapshot);
	owner.snapshot = published;
	ownersBySnapshot.set(published, owner);
	return published;
}
function prepareModelRuntimeOwner(input, provenance, catalogMode = "live", existing) {
	return Object.assign(existing ?? {
		generation: 0,
		needsRefresh: true,
		catalogStale: false
	}, {
		input,
		catalogOwner: preparePublishedModelCatalogOwnerIdentity(input),
		environmentFingerprint: effectiveEnvironmentFingerprint(input),
		catalogMode,
		provenance
	});
}
var PreparedModelRuntimeOwnerRetention = class {
	#retained = /* @__PURE__ */ new Map();
	constructor(maxSize) {
		this.maxSize = maxSize;
	}
	clear(owners) {
		for (const [key, owner] of this.#retained) if (owner.provenance === "run" && (owner.leaseCount ?? 0) === 0 && owners.get(key) === owner) owners.delete(key);
		this.#retained.clear();
	}
	has(key, owner) {
		return this.#retained.get(key) === owner;
	}
	retain(key, owner, owners) {
		if (owner.provenance !== "run") return;
		this.#retained.delete(key);
		this.#retained.set(key, owner);
		while (this.#retained.size > this.maxSize) {
			const oldest = this.#retained.entries().next().value;
			if (!oldest) return;
			const [oldestKey, oldestOwner] = oldest;
			this.#retained.delete(oldestKey);
			if ((oldestOwner.leaseCount ?? 0) === 0 && owners.get(oldestKey) === oldestOwner) owners.delete(oldestKey);
		}
	}
};
function findConfiguredOwnerCandidates(owners, rawInput) {
	const input = normalizePreparedModelRuntimeInput(rawInput);
	const configured = [...owners.values()].filter((owner) => owner.provenance === "configured");
	const identityCandidates = input.agentId === void 0 ? [] : configured.filter((owner) => owner.input.agentId === input.agentId);
	const exactCandidates = identityCandidates.filter((owner) => owner.input.agentDir === input.agentDir);
	const directoryCandidates = configured.filter((owner) => owner.input.agentDir === input.agentDir);
	const canRebindByDirectory = input.agentId === void 0 || isReservedSystemAgentId(input.agentId);
	return exactCandidates.length > 0 ? exactCandidates : canRebindByDirectory && directoryCandidates.length > 0 ? directoryCandidates : identityCandidates;
}
function resolveConfiguredOwnerPublication(owners, rawInput) {
	const candidates = findConfiguredOwnerCandidates(owners, rawInput);
	return {
		matches: candidates.length > 0,
		pending: candidates.length === 1 ? candidates[0]?.pending : void 0
	};
}
function resolveConfiguredOwner(owners, rawInput) {
	const candidates = findConfiguredOwnerCandidates(owners, rawInput);
	return candidates.length === 1 ? candidates[0] : void 0;
}
function resolveCommittedConfiguredOwner(owners, rawInput) {
	const candidates = findConfiguredOwnerCandidates(owners, rawInput).filter((owner) => owner.snapshot && !owner.needsRefresh && !owner.pending);
	return candidates.length === 1 ? candidates[0] : void 0;
}
function rebindInputToCommittedConfiguredOwner(owners, rawInput) {
	const input = normalizePreparedModelRuntimeInput(rawInput);
	const owner = resolveCommittedConfiguredOwner(owners, rawInput);
	if (!owner) throw new PreparedModelRuntimeOwnerNotPublishedError(`prepared model runtime owner was not committed after replacement for ${input.agentDir}`);
	const preserveWorkspaceDir = input.preserveWorkspaceDirOnRefresh === true && input.workspaceDir !== void 0;
	const agentId = input.agentId ?? owner.input.agentId;
	return normalizePreparedModelRuntimeInput({
		...input,
		...agentId ? { agentId } : {},
		agentDir: owner.input.agentDir,
		config: owner.input.config,
		inheritedAuthDir: owner.input.inheritedAuthDir,
		env: owner.input.env,
		workspaceDir: preserveWorkspaceDir ? input.workspaceDir : owner.input.workspaceDir,
		preserveWorkspaceDirOnRefresh: preserveWorkspaceDir,
		allowGatewaySubagentBinding: input.allowGatewaySubagentBinding ?? owner.input.allowGatewaySubagentBinding,
		runtimePluginSelections: input.runtimePluginSelections ?? owner.input.runtimePluginSelections
	});
}
/** Accepts canonical config clones without weakening projected-config isolation. */
function preparedModelRuntimeConfigsMatch(left, right) {
	if (left === right) return true;
	try {
		return hashRuntimeConfigValue(left) === hashRuntimeConfigValue(right);
	} catch {
		return false;
	}
}
function stampPreparedModelRuntimeSnapshotConfig(snapshot, config) {
	if (snapshot.config === config) return snapshot;
	const stamped = Object.freeze({
		...snapshot,
		config
	});
	copyPreparedModelRuntimeAuthBindings(snapshot, stamped);
	return stamped;
}
function advancePreparedModelRuntimeOwnerConfig(owner, config) {
	owner.input = {
		...owner.input,
		config
	};
	if (owner.snapshot) publishPreparedModelRuntimeOwnerSnapshot(owner, owner.snapshot);
}
function normalizeOptionalDir(dirname) {
	return dirname ? path.resolve(dirname) : void 0;
}
function normalizePreparedModelRuntimeInput(input) {
	const { inheritedAuthDir: _inheritedAuthDir, readOnly, runtimePluginSelections: _runtimePluginSelections, skipCredentials, workspaceDir: _workspaceDir, ...rest } = input;
	const inheritedAuthDir = normalizeOptionalDir(input.inheritedAuthDir ?? resolveLegacyInheritedAuthDir(input.config, input.env));
	const workspaceDir = normalizeOptionalDir(input.workspaceDir);
	const env = input.env ? Object.freeze({ ...input.env }) : void 0;
	const runtimePluginSelections = input.runtimePluginSelections ? Object.freeze([...input.runtimePluginSelections].map((selection) => {
		const runtime = resolveSelectedAgentHarnessRuntime(selection, input.config);
		const { agentId: _agentId, ...normalized } = selection;
		return Object.freeze({
			...normalized,
			runtime
		});
	}).toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))) : void 0;
	return {
		...rest,
		agentDir: path.resolve(input.agentDir),
		...inheritedAuthDir ? { inheritedAuthDir } : {},
		...readOnly === true ? { readOnly: true } : {},
		...skipCredentials === true ? { skipCredentials: true } : {},
		...workspaceDir ? { workspaceDir } : {},
		...env ? { env } : {},
		...input.allowGatewaySubagentBinding === true ? { allowGatewaySubagentBinding: true } : {},
		...runtimePluginSelections?.length ? { runtimePluginSelections } : {}
	};
}
function environmentFingerprint(env) {
	return env ? hashRuntimeConfigValue(env) : void 0;
}
function effectiveEnvironmentFingerprint(input) {
	return hashRuntimeConfigValue(input.env ?? process.env);
}
function ownerKey(input) {
	return JSON.stringify({
		agentId: input.agentId,
		agentDir: input.agentDir,
		inheritedAuthDir: input.inheritedAuthDir,
		readOnly: input.readOnly === true,
		loadRuntimePlugins: input.loadRuntimePlugins === true,
		skipCredentials: input.skipCredentials === true,
		workspaceDir: input.workspaceDir,
		env: environmentFingerprint(input.env),
		allowGatewaySubagentBinding: input.allowGatewaySubagentBinding === true,
		runtimePluginSelections: input.runtimePluginSelections,
		config: input.readOnly ? hashRuntimeConfigValue(input.config) : void 0
	});
}
function resolvePublishedOwner(owners, input, options = {}) {
	const exact = owners.get(ownerKey(input));
	if (exact) return exact;
	if (!options.allowConfiguredWorkspaceFallback) return;
	const candidates = [...owners.values()].filter((owner) => owner.provenance === "configured" && (input.agentId === void 0 || owner.input.agentId === input.agentId) && owner.input.agentDir === input.agentDir && owner.input.inheritedAuthDir === input.inheritedAuthDir && owner.input.readOnly === input.readOnly && owner.input.loadRuntimePlugins === input.loadRuntimePlugins && owner.input.skipCredentials === input.skipCredentials && (input.allowGatewaySubagentBinding === void 0 || owner.input.allowGatewaySubagentBinding === input.allowGatewaySubagentBinding) && (input.runtimePluginSelections === void 0 || JSON.stringify(owner.input.runtimePluginSelections) === JSON.stringify(input.runtimePluginSelections)) && (input.env === void 0 || owner.environmentFingerprint === environmentFingerprint(input.env)) && (input.workspaceDir === void 0 || owner.input.workspaceDir === input.workspaceDir));
	return candidates.length === 1 ? candidates[0] : void 0;
}
function hasSameLifecycleInput(left, right) {
	return left.config === right.config && left.agentId === right.agentId && left.inheritedAuthDir === right.inheritedAuthDir && left.readOnly === right.readOnly && left.loadRuntimePlugins === right.loadRuntimePlugins && left.skipCredentials === right.skipCredentials && left.workspaceDir === right.workspaceDir && environmentFingerprint(left.env) === environmentFingerprint(right.env) && left.preserveWorkspaceDirOnRefresh === right.preserveWorkspaceDirOnRefresh && left.allowGatewaySubagentBinding === right.allowGatewaySubagentBinding && JSON.stringify(left.runtimePluginSelections) === JSON.stringify(right.runtimePluginSelections);
}
function createPreparedModelRuntimeReplacement() {
	let resolve;
	let reject;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	promise.catch(() => void 0);
	return {
		gateId: Symbol("prepared-model-runtime-replacement"),
		promise,
		resolve,
		reject
	};
}
function listConfiguredOwnerInputs(config, defaultWorkspaceDir, allowGatewaySubagentBinding) {
	const compatibilityAgentId = tryResolveLegacyCompatibilityAgentId(config);
	const inheritedAuthDir = resolveLegacyInheritedAuthDir(config);
	return listAgentIds(config).map((agentId) => {
		const preserveWorkspaceDirOnRefresh = agentId === compatibilityAgentId && defaultWorkspaceDir;
		const input = {
			agentId,
			agentDir: resolveAgentDir(config, agentId),
			config,
			inheritedAuthDir,
			workspaceDir: preserveWorkspaceDirOnRefresh ? defaultWorkspaceDir : resolveAgentWorkspaceDir(config, agentId),
			runtimePluginSelections: resolveConfiguredRuntimePluginSelections(config, agentId)
		};
		if (allowGatewaySubagentBinding === true) input.allowGatewaySubagentBinding = true;
		if (preserveWorkspaceDirOnRefresh) input.preserveWorkspaceDirOnRefresh = true;
		return input;
	});
}
function resolveConfiguredRuntimePluginSelections(config, agentId) {
	const configured = resolveDefaultModelForAgent({
		cfg: config,
		agentId
	});
	const subagentModel = resolveSubagentConfiguredModelSelection({
		cfg: config,
		agentId,
		includeAgentPrimary: false
	});
	return resolveModelCandidateChain({
		cfg: config,
		agentId,
		manifestPlugins: [],
		provider: configured.provider || "openai",
		model: configured.model || "gpt-5.6-sol",
		requestedRouteResolution: "resolved",
		fallbacksOverride: [
			...resolveConfiguredModelFallbacks({
				cfg: config,
				agentId
			}),
			...subagentModel ? [subagentModel] : [],
			...resolveSubagentSpawnModelFallbacksOverride(config, agentId) ?? []
		]
	}).map((candidate) => ({
		provider: candidate.provider,
		modelId: candidate.model,
		agentId
	}));
}
async function publishPreparedModelRuntimeOwnerBatch(params) {
	const candidates = params.entries.map(({ owner }) => {
		const input = owner.input;
		owner.environmentFingerprint = effectiveEnvironmentFingerprint(input);
		owner.generation += 1;
		owner.needsRefresh = true;
		owner.refreshError = void 0;
		owner.pendingPluginGeneration = params.reusePluginGenerations ? owner.pluginGeneration : void 0;
		const generation = owner.generation;
		const key = ownerKey(input);
		let registered = params.owners.get(key) === owner;
		const isGenerationCurrent = () => owner.generation === generation && params.owners.get(key) === owner;
		const isCurrent = () => (params.isPublicationCurrent?.() ?? true) && isGenerationCurrent();
		return {
			catalogMode: owner.catalogMode,
			input,
			catalogOwner: owner.catalogOwner,
			inventoryOwner: owner,
			pluginGeneration: owner.pendingPluginGeneration,
			prepareInboundPluginRegistry: owner.provenance === "configured",
			isGenerationCurrent,
			isBuildCurrent: params.isBuildCurrent ?? isCurrent,
			isPreparationCurrent: params.isBuildCurrent,
			isEligible: () => (params.isPublicationCurrent?.() ?? true) && owner.generation === generation && (registered ? params.owners.get(key) === owner : params.registerEntriesAfterBuildStart === true),
			isCurrent,
			key,
			generation,
			markRegistered: () => {
				registered = true;
			},
			owner
		};
	});
	const groups = /* @__PURE__ */ new Map();
	for (const candidate of candidates) {
		const group = groups.get(candidate.catalogMode);
		if (group) group.push(candidate);
		else groups.set(candidate.catalogMode, [candidate]);
	}
	const results = /* @__PURE__ */ new Map();
	await (async () => {
		try {
			while (true) {
				const attempt = candidates.filter((candidate) => candidate.isEligible() && !results.has(candidate.owner));
				if (attempt.length === 0) break;
				try {
					for (const [catalogMode, group] of groups) {
						const currentGroup = group.filter((candidate) => candidate.isEligible() && !results.has(candidate.owner));
						if (currentGroup.length === 0) continue;
						const build = startSerializedSnapshotBuildBatch(currentGroup, params.agentBuildCompletions, params.buildTimeoutMs, catalogMode, params.onBuildStats, params.pluginMetadataSnapshot, params.includeCredentialProviders);
						for (const candidate of currentGroup) {
							if (params.registerEntriesAfterBuildStart === true) {
								params.owners.set(candidate.key, candidate.owner);
								candidate.markRegistered();
							}
							candidate.owner.buildCompletion = build.completion;
							build.completion.then(() => {
								if (candidate.owner.buildCompletion === build.completion) candidate.owner.buildCompletion = void 0;
							});
						}
						const built = await build.pending;
						for (const [index, candidate] of currentGroup.entries()) results.set(candidate.owner, built[index]);
					}
					break;
				} catch (error) {
					const refreshError = toStringifiedError(error);
					const lostCandidate = attempt.some((candidate) => !candidate.isCurrent());
					if (!(refreshError instanceof PreparedModelRuntimePublicationSupersededError) || !(params.isPublicationCurrent?.() ?? true) || !lostCandidate) throw refreshError;
				}
			}
			for (const candidate of candidates) {
				if (candidate.owner.generation === candidate.generation) candidate.owner.pendingPluginGeneration = void 0;
				if (!candidate.isCurrent()) continue;
				const result = results.get(candidate.owner);
				if (!result) throw new Error(`prepared model runtime snapshot missing after auth refresh for ${candidate.input.agentDir}`);
				const snapshot = publishPreparedModelRuntimeOwnerSnapshot(candidate.owner, result.snapshot);
				results.set(candidate.owner, {
					...result,
					snapshot
				});
				candidate.owner.pluginGeneration = result.pluginGeneration;
				candidate.owner.needsRefresh = false;
			}
		} catch (error) {
			const refreshError = toStringifiedError(error);
			for (const candidate of candidates) {
				if (candidate.owner.generation === candidate.generation) candidate.owner.pendingPluginGeneration = void 0;
				if (!candidate.isCurrent()) continue;
				candidate.owner.needsRefresh = true;
				candidate.owner.refreshError = refreshError;
			}
			throw refreshError;
		}
	})();
}
async function publishModelRuntimeSnapshot(input, owners, agentBuildCompletions, buildTimeoutMs, existing, provenance = "explicit", catalogMode = existing?.catalogMode ?? "live", reusablePluginGeneration, pluginMetadataSnapshot) {
	const key = ownerKey(input);
	const owner = prepareModelRuntimeOwner(input, provenance, catalogMode, existing);
	owner.generation += 1;
	owner.needsRefresh = true;
	owner.refreshError = void 0;
	owner.pluginGeneration = void 0;
	owner.pendingPluginGeneration = reusablePluginGeneration;
	const generation = owner.generation;
	const isGenerationCurrent = () => owner.generation === generation && owners.get(key) === owner;
	const build = startSerializedSnapshotBuildBatch([{
		input,
		catalogOwner: owner.catalogOwner,
		inventoryOwner: owner,
		isGenerationCurrent,
		isBuildCurrent: isGenerationCurrent,
		prepareInboundPluginRegistry: provenance === "configured",
		pluginGeneration: reusablePluginGeneration
	}], agentBuildCompletions, buildTimeoutMs, catalogMode, void 0, pluginMetadataSnapshot);
	owner.buildCompletion = build.completion;
	build.completion.then(() => {
		if (owner.buildCompletion === build.completion) owner.buildCompletion = void 0;
	});
	owners.set(key, owner);
	const publication = (async () => {
		try {
			const result = (await build.pending)[0];
			if (owner.generation !== generation || owners.get(key) !== owner) throw new PreparedModelRuntimePublicationSupersededError(`prepared model runtime publication was superseded for ${input.agentDir}`);
			const snapshot = publishPreparedModelRuntimeOwnerSnapshot(owner, result.snapshot);
			owner.pluginGeneration = result.pluginGeneration;
			owner.pendingPluginGeneration = void 0;
			owner.pending = void 0;
			owner.needsRefresh = false;
			return snapshot;
		} catch (error) {
			const refreshError = toStringifiedError(error);
			if (owner.generation === generation) owner.pendingPluginGeneration = void 0;
			if (owner.generation === generation && owners.get(key) === owner) {
				owner.pending = void 0;
				owner.needsRefresh = true;
				owner.refreshError = refreshError;
			}
			throw refreshError;
		}
	})();
	owner.pending = publication;
	return await publication;
}
//#endregion
//#region src/agents/prepared-model-runtime-auth-publication.ts
function partitionAuthMutationOwners(mutations) {
	const components = [];
	for (const invalidatedOwners of mutations) {
		const target = new Set(invalidatedOwners);
		let insertAt = components.length;
		for (let index = components.length - 1; index >= 0; index -= 1) {
			if (![...target].some((owner) => components[index].has(owner))) continue;
			insertAt = index;
			for (const owner of components[index]) target.add(owner);
			components.splice(index, 1);
		}
		components.splice(insertAt, 0, target);
	}
	return components.map((component) => Array.from(component));
}
var PreparedModelRuntimeAuthPublicationOwner = class {
	#events = [];
	#transaction;
	enqueue(invalidatedOwners, profileSetChanged = false) {
		this.#events.push([...invalidatedOwners]);
		const transaction = this.#transaction ?? (this.#transaction = {
			ownerGates: /* @__PURE__ */ new Map(),
			publicationQueued: false,
			profileSetChanged: false
		});
		transaction.profileSetChanged ||= profileSetChanged;
		for (const owner of invalidatedOwners) {
			let gate = transaction.ownerGates.get(owner);
			if (!gate) {
				gate = createDeferredCore();
				transaction.ownerGates.set(owner, gate);
				gate.promise.catch(() => void 0);
			}
			owner.pending = gate.promise;
		}
		return transaction;
	}
	claimPublication(transaction) {
		if (transaction.publicationQueued) return false;
		transaction.publicationQueued = true;
		return true;
	}
	isCurrent(transaction) {
		return this.#transaction === transaction;
	}
	adopt(gateId) {
		if (this.#transaction) this.#transaction.adoptedBy = gateId;
	}
	adoptTransaction(transaction, gateId) {
		if (this.#transaction === transaction) transaction.adoptedBy = gateId;
	}
	prepareAdoptedCommit(gateId) {
		const transaction = this.#transaction;
		if (transaction?.adoptedBy !== gateId) return;
		this.clearOwnerGates(transaction);
		return transaction;
	}
	resolve(transaction, owners) {
		if (this.#transaction !== transaction) return false;
		if (transaction.adoptedBy) this.#transaction = void 0;
		else if (transaction.ownerGates.size === 0) {
			this.#transaction = void 0;
			return true;
		} else return false;
		this.clearOwnerGates(transaction);
		for (const [owner, gate] of transaction.ownerGates) {
			const published = owners.get(ownerKey(owner.input)) ?? resolveConfiguredOwner(owners, owner.input);
			if (published?.snapshot && !published.needsRefresh && !published.pending) gate.resolve(published.snapshot);
			else gate.reject(new PreparedModelRuntimePublicationSupersededError(`prepared model runtime publication was superseded for ${owner.input.agentDir}`));
		}
		return true;
	}
	settleComponent(transaction, componentOwners, owners, publishOwners) {
		if (this.#transaction !== transaction || transaction.adoptedBy) return;
		const queuedOwners = new Set(this.#events.flat());
		const completed = componentOwners.flatMap((owner) => {
			const gate = transaction.ownerGates.get(owner);
			return gate && !queuedOwners.has(owner) ? [{
				owner,
				gate
			}] : [];
		}).flatMap(({ owner, gate }) => owner.pending === gate.promise && owners.get(ownerKey(owner.input)) === owner && owner.snapshot && !owner.needsRefresh ? [{
			owner,
			gate,
			snapshot: owner.snapshot
		}] : []);
		for (const { owner } of completed) owner.pending = void 0;
		try {
			if (completed.length > 0) publishOwners(completed.map(({ owner }) => owner));
		} catch (error) {
			for (const { owner, gate } of completed) if (transaction.ownerGates.get(owner) === gate && owner.pending === void 0) owner.pending = gate.promise;
			throw error;
		}
		for (const { owner, gate, snapshot } of completed) {
			transaction.ownerGates.delete(owner);
			gate.resolve(snapshot);
		}
		this.rejectComponentOwners(transaction, componentOwners, new PreparedModelRuntimePublicationSupersededError("prepared model runtime auth publication owner was superseded"));
	}
	reject(transaction, error) {
		if (this.#transaction === transaction) this.#transaction = void 0;
		this.clearOwnerGates(transaction);
		for (const gate of transaction.ownerGates.values()) gate.reject(error);
	}
	rejectAdopted(gateId, error) {
		if (this.#transaction?.adoptedBy === gateId) this.reject(this.#transaction, error);
	}
	async drain(params) {
		while (this.#events.length > 0) {
			const components = partitionAuthMutationOwners(this.#events.splice(0));
			for (const componentOwners of components) {
				const entries = componentOwners.flatMap((owner) => params.owners.get(ownerKey(owner.input)) === owner ? [{
					owner,
					input: owner.input
				}] : []);
				try {
					if (entries.length > 0) await params.publish(entries, this.#transaction?.profileSetChanged === true);
					const transaction = this.#transaction;
					if (transaction) this.settleComponent(transaction, componentOwners, params.owners, params.publishOwners);
				} catch (error) {
					if (this.#transaction?.adoptedBy) throw error;
					const transaction = this.#transaction;
					if (transaction && this.rejectComponentOwners(transaction, componentOwners, error) > 0) params.onOwnerFailure?.(error);
				}
			}
		}
		params.commit?.();
	}
	reset(error) {
		if (this.#transaction) this.reject(this.#transaction, error);
		this.#events.length = 0;
	}
	clearOwnerGates(transaction) {
		for (const [owner, gate] of transaction.ownerGates) if (owner.pending === gate.promise) owner.pending = void 0;
	}
	rejectComponentOwners(transaction, componentOwners, error) {
		const queuedOwners = new Set(this.#events.flat());
		let rejected = 0;
		for (const owner of componentOwners) {
			if (queuedOwners.has(owner)) continue;
			const gate = transaction.ownerGates.get(owner);
			if (!gate) continue;
			if (owner.pending === gate.promise) owner.pending = void 0;
			transaction.ownerGates.delete(owner);
			gate.reject(error);
			rejected += 1;
		}
		return rejected;
	}
};
//#endregion
//#region src/agents/prepared-model-runtime-lease.ts
// OPENCLAW_WORKER_RETAIN_RUN_OWNERS_V1: the isolated Worker installs the native attempt
// bridge before it loads OpenClaw; the Gateway never does.
function workerRetainsRunOwners() {
	return globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")] !== void 0 && process.env.OPENCLAW_WORKER_RETAIN_RUN_OWNERS !== "0";
}
// An idle retained owner is reused only for the same config and within a bounded age, so
// state another process changes (auth profiles, plugin catalogs) is re-read at that cadence.
const workerRetainedSnapshotBuiltAt = /* @__PURE__ */ new WeakMap();
function workerRetainedRunOwnerTtlMs() {
	const configured = Number(process.env.OPENCLAW_WORKER_RETAIN_RUN_OWNERS_TTL_MS ?? 3e5);
	return Number.isFinite(configured) ? Math.max(0, configured) : 3e5;
}
function workerRetainedRunOwnerReusable(owner, input) {
	const builtAt = owner.snapshot ? workerRetainedSnapshotBuiltAt.get(owner.snapshot) : void 0;
	return builtAt !== void 0 && Date.now() - builtAt < workerRetainedRunOwnerTtlMs() && preparedModelRuntimeConfigsMatch(owner.input.config, input.config);
}
function retainWorkerRunOwner(key, owner, context) {
	if (owner.snapshot && !workerRetainedSnapshotBuiltAt.has(owner.snapshot)) workerRetainedSnapshotBuiltAt.set(owner.snapshot, Date.now());
	context.retainedGatewayRunOwners.retain(key, owner, context.owners);
}
/** Agent-run lease admission for lifecycle-owned prepared model runtimes. */
function throwIfLeaseAdmissionAborted(signal) {
	if (signal?.aborted) throw createAbortError("Prepared model runtime lease admission aborted", { cause: signal.reason });
}
async function acquirePreparedModelRuntimeLeaseFromOwners(rawInput, provenance, context, options = {}) {
	let normalizedInput = normalizePreparedModelRuntimeInput({
		...rawInput,
		preserveWorkspaceDirOnRefresh: rawInput.preserveWorkspaceDirOnRefresh ?? rawInput.workspaceDir !== void 0
	});
	if (provenance === "run" && context.getGatewayLifecycleActive() && !options.pluginGeneration && !context.getPendingReplacement()) try {
		normalizedInput = rebindInputToCommittedConfiguredOwner(context.owners, normalizedInput);
	} catch (error) {
		if (!(error instanceof PreparedModelRuntimeOwnerNotPublishedError)) throw error;
	}
	let input = normalizedInput;
	let key = ownerKey(input);
	let owner;
	let snapshot;
	for (;;) {
		throwIfLeaseAdmissionAborted(options.abortSignal);
		const replacement = context.getPendingReplacement();
		if (replacement) {
			await racePromiseWithAbortSignal(replacement.promise, options.abortSignal);
			if (context.getPendingReplacement()) continue;
			if (provenance === "run" && !options.pluginGeneration) {
				input = rebindInputToCommittedConfiguredOwner(context.owners, input);
				key = ownerKey(input);
			}
			continue;
		}
		if (provenance === "run" && context.getGatewayLifecycleActive() && options.pluginGeneration) {
			const configuredOwner = resolveConfiguredOwner(context.owners, input);
			if (configuredOwner?.pending) {
				await racePromiseWithAbortSignal(configuredOwner.pending.catch(() => void 0), options.abortSignal);
				continue;
			}
			if (configuredOwner && (configuredOwner.needsRefresh || configuredOwner.pluginGeneration !== options.pluginGeneration)) {
				const borrowed = getPreparedModelRuntimeBorrowedSnapshot(options.pluginGeneration);
				if (!configuredOwner.needsRefresh && borrowed && borrowed.metadataSnapshot === options.pluginGeneration.pluginMetadataSnapshot && preparedModelRuntimeConfigsMatch(borrowed.config, input.config) && borrowed.agentId === input.agentId && borrowed.agentDir === input.agentDir && borrowed.inheritedAuthDir === input.inheritedAuthDir && borrowed.workspaceDir === input.workspaceDir && (!input.allowGatewaySubagentBinding || borrowed.allowGatewaySubagentBinding) && !input.readOnly && !input.loadRuntimePlugins && !input.skipCredentials && !input.env && preparedPluginGenerationSupportsSelections(options.pluginGeneration, input)) {
					throwIfLeaseAdmissionAborted(options.abortSignal);
					return {
						snapshot: borrowed,
						pluginGeneration: options.pluginGeneration,
						release: () => {}
					};
				}
				throw new PreparedModelRuntimeOwnerNotPublishedError(`prepared model runtime plugin generation was superseded for ${input.agentDir}`);
			}
		}
		let existing = context.owners.get(key);
		let staleDynamicOwner = existing?.needsRefresh && !existing.pending && (existing.provenance === "run" || existing.provenance === "ephemeral");
		if (!staleDynamicOwner && provenance === "run" && existing?.provenance === "run" && !existing.pending && (existing.leaseCount ?? 0) === 0 && workerRetainsRunOwners() && !workerRetainedRunOwnerReusable(existing, input)) staleDynamicOwner = true;
		if (context.getGatewayLifecycleActive() && provenance === "run" && !options.pluginGeneration && (!existing || staleDynamicOwner)) try {
			input = rebindInputToCommittedConfiguredOwner(context.owners, input);
			key = ownerKey(input);
			existing = context.owners.get(key);
			staleDynamicOwner = existing?.needsRefresh && !existing.pending && (existing.provenance === "run" || existing.provenance === "ephemeral");
		} catch (error) {
			if (!(error instanceof PreparedModelRuntimeOwnerNotPublishedError)) throw error;
			const canActivateConfiglessSetup = input.agentId !== void 0 && isReservedSystemAgentId(input.agentId);
			const configuredOwner = resolveConfiguredOwnerPublication(context.owners, input);
			if (configuredOwner.matches || !canActivateConfiglessSetup) {
				const pending = configuredOwner.pending;
				if (pending) {
					await racePromiseWithAbortSignal(pending, options.abortSignal);
					continue;
				}
				throw error;
			}
		}
		const ownerGenerationChanged = options.pluginGeneration !== void 0 && !preparedPluginGenerationReusesBase(existing?.pending ? existing.pendingPluginGeneration : existing?.pluginGeneration, options.pluginGeneration) || options.catalogMode === "live" && existing?.catalogMode === "static";
		if (existing?.pending && ownerGenerationChanged) {
			await racePromiseWithAbortSignal(existing.pending.catch(() => void 0), options.abortSignal);
			continue;
		}
		try {
			if (existing?.pending && !ownerGenerationChanged) {
				snapshot = await racePromiseWithAbortSignal(existing.pending, options.abortSignal);
				if (existing.snapshot !== snapshot || existing.needsRefresh) continue;
				owner = existing;
				break;
			}
			if (existing && !staleDynamicOwner && !ownerGenerationChanged) snapshot = await racePromiseWithAbortSignal(context.prepareSnapshot(input), options.abortSignal);
			else snapshot = await racePromiseWithAbortSignal(publishModelRuntimeSnapshot(input, context.owners, context.agentBuildCompletions, context.getBuildTimeoutMs(), void 0, provenance, options.catalogMode, options.pluginGeneration, options.pluginMetadataSnapshot), options.abortSignal);
		} catch (error) {
			if (error instanceof PreparedModelRuntimePublicationSupersededError) continue;
			throw error;
		}
		const published = context.owners.get(key);
		if (context.getPendingReplacement() || !published || published.snapshot !== snapshot || published.needsRefresh || published.pending) continue;
		owner = published;
		break;
	}
	throwIfLeaseAdmissionAborted(options.abortSignal);
	const pluginGeneration = owner.pluginGeneration;
	if (owner.provenance !== provenance) return {
		snapshot,
		pluginGeneration,
		release: () => {}
	};
	throwIfLeaseAdmissionAborted(options.abortSignal);
	if (provenance === "run" && options.retainIdleRunOwner) context.retainedDirectRunOwners.retain(key, owner, context.owners);
	else if (provenance === "run" && context.getGatewayLifecycleActive()) context.retainedGatewayRunOwners.retain(key, owner, context.owners);
	else if (provenance === "run" && workerRetainsRunOwners()) retainWorkerRunOwner(key, owner, context);
	owner.leaseCount = (owner.leaseCount ?? 0) + 1;
	let released = false;
	return {
		snapshot,
		pluginGeneration,
		release: () => {
			if (released) return;
			released = true;
			owner.leaseCount = Math.max(0, (owner.leaseCount ?? 1) - 1);
			if (owner.leaseCount === 0 && context.owners.get(key) === owner) {
				if (!context.retainedDirectRunOwners.has(key, owner) && !context.retainedGatewayRunOwners.has(key, owner)) context.owners.delete(key);
			}
		}
	};
}
//#endregion
//#region src/agents/prepared-model-runtime-materializations.ts
function configuredOwnersAreRequestVisible(owners) {
	for (const owner of owners.values()) {
		if (owner.provenance !== "configured") continue;
		if (!owner.snapshot || owner.needsRefresh || owner.pending) return false;
	}
	return true;
}
function registerPreparedRuntimeAuthMaterializationPublisher(owners, notify) {
	return registerRuntimeAuthMaterializationMutationListener((event) => {
		publishPreparedRuntimeAuthMaterializations({
			event,
			owners,
			onInvalidated: () => notify({ phase: "invalidated" }),
			onPublished: () => notify({ phase: "published" })
		});
	});
}
function publishPreparedRuntimeAuthMaterializations(params) {
	const event = {
		...params.event,
		agentDir: normalizeOptionalDir(params.event.agentDir)
	};
	const affectedOwners = [...params.owners.values()].flatMap((owner) => {
		return (event.affectsInheritedStores || owner.input.agentDir === event.agentDir || owner.input.inheritedAuthDir === event.agentDir) && owner.snapshot && !owner.pending && !owner.needsRefresh ? [{
			owner,
			snapshot: owner.snapshot
		}] : [];
	});
	if (affectedOwners.length === 0) return;
	for (const { owner, snapshot } of affectedOwners) setPreparedModelRuntimeAuthMaterializations(snapshot, Object.freeze([...getPreparedRuntimeAuthMaterializations(owner.input.agentDir)]));
	if (!configuredOwnersAreRequestVisible(params.owners)) return;
	params.onInvalidated();
	params.onPublished();
}
//#endregion
//#region src/agents/prepared-model-runtime.refresh-scope.ts
/** Whether a refresh scope must replace this owner rather than retain it. */
function isPreparedModelRuntimeOwnerInRefreshScope(owner, agentIds) {
	if (!agentIds) return true;
	if (owner.input.readOnly || owner.provenance !== "configured" && owner.provenance !== "run") return true;
	return !owner.input.agentId || agentIds.has(owner.input.agentId);
}
/** Builds configured inputs while preserving the startup-selected default workspace. */
function listConfiguredRefreshInputs(config, options, owners) {
	const preservedWorkspaceByAgentDir = /* @__PURE__ */ new Map();
	for (const owner of owners.values()) {
		const { agentDir, agentId, preserveWorkspaceDirOnRefresh, workspaceDir } = owner.input;
		if (owner.provenance !== "configured" || !agentId || !preserveWorkspaceDirOnRefresh || !workspaceDir) continue;
		let workspacesByDir = preservedWorkspaceByAgentDir.get(agentId);
		if (!workspacesByDir) {
			workspacesByDir = /* @__PURE__ */ new Map();
			preservedWorkspaceByAgentDir.set(agentId, workspacesByDir);
		}
		if (!workspacesByDir.has(agentDir)) workspacesByDir.set(agentDir, workspaceDir);
	}
	const inputs = [];
	for (const rawInput of listConfiguredOwnerInputs(config, options.defaultWorkspaceDir, options.allowGatewaySubagentBinding)) {
		const input = normalizePreparedModelRuntimeInput(rawInput);
		const preservedWorkspaceDir = input.agentId ? preservedWorkspaceByAgentDir.get(input.agentId)?.get(input.agentDir) : void 0;
		inputs.push(preservedWorkspaceDir ? {
			...input,
			workspaceDir: preservedWorkspaceDir,
			preserveWorkspaceDirOnRefresh: true
		} : input);
	}
	return inputs;
}
/** Invalidates scoped owners and optionally advances retained owners to a new config stamp. */
function updateOwnersForScopedRefresh(owners, agentIds, staleError, options = {}) {
	for (const [key, owner] of owners) {
		if (!isPreparedModelRuntimeOwnerInRefreshScope(owner, agentIds)) {
			if (options.retainedConfig) advancePreparedModelRuntimeOwnerConfig(owner, options.retainedConfig);
			continue;
		}
		if (options.retireStandalone && owner.provenance === "standalone") {
			owner.generation += 1;
			owners.delete(key);
			continue;
		}
		owner.generation += 1;
		owner.needsRefresh = true;
		owner.refreshError = staleError;
		if (options.clearPending) owner.pending = void 0;
		if (options.resetPluginGeneration) owner.pluginGeneration = void 0;
	}
}
/** Keeps a requested scope only when every retained owner has identical prepared dependencies. */
function resolveSafeRefreshAgentIds(config, options, owners) {
	const requested = options.agentIds;
	if (!requested) return;
	const inputs = new Map(listConfiguredRefreshInputs(config, options, owners).flatMap((input) => input.agentId ? [[input.agentId, input]] : []));
	for (const owner of owners.values()) {
		if (owner.provenance !== "configured" || !owner.input.agentId || requested.has(owner.input.agentId)) continue;
		const input = inputs.get(owner.input.agentId);
		if (!input || !owner.snapshot || owner.needsRefresh || owner.catalogMode !== (options.catalogMode ?? "live") || options.pluginMetadataSnapshot && owner.snapshot.metadataSnapshot !== options.pluginMetadataSnapshot || ownerKey({
			...owner.input,
			config: input.config
		}) !== ownerKey(input)) return;
	}
	return requested;
}
//#endregion
//#region src/agents/prepared-reply-dispatch-runtime.ts
const EMPTY_REPLY_DISPATCH_PUBLICATION = Object.freeze({ runtimes: Object.freeze([]) });
function createReplyDispatchRuntime(runtimeOwner) {
	const snapshot = runtimeOwner.snapshot;
	const owner = resolvePublishedModelCatalogOwner(snapshot);
	const pluginGeneration = runtimeOwner.pluginGeneration;
	const inboundPluginRegistry = pluginGeneration?.inboundPluginRegistry;
	if (!pluginGeneration || !inboundPluginRegistry) throw new PreparedModelRuntimeOwnerNotPublishedError(`prepared inbound plugin registry was not published for ${snapshot.agentDir}`);
	return Object.freeze({
		agentId: owner.agentId,
		agentDir: owner.agentDir,
		workspaceDir: owner.workspaceDir,
		config: owner.config,
		modelCatalog: owner.modelCatalog,
		inboundPluginRegistry,
		pluginGeneration
	});
}
function buildReplyDispatchPublication(owners) {
	const runtimes = [...owners].filter((owner) => owner.provenance === "configured").map((owner) => {
		if (!owner.snapshot || owner.needsRefresh || owner.pending) throw new PreparedModelRuntimeOwnerNotPublishedError(`prepared reply dispatch runtime owner was not published for ${owner.input.agentId ?? owner.input.agentDir}`);
		return createReplyDispatchRuntime(owner);
	}).toSorted((left, right) => left.agentId.localeCompare(right.agentId));
	if (new Set(runtimes.map((runtime) => runtime.agentId)).size !== runtimes.length) throw new PreparedModelRuntimeOwnerNotPublishedError("prepared reply dispatch runtime publication contains duplicate configured agents");
	return Object.freeze({ runtimes: Object.freeze(runtimes) });
}
function removeReplyDispatchRuntimeProjections(publication, agentIds) {
	if (agentIds.size === 0) return publication;
	return Object.freeze({ runtimes: Object.freeze(publication.runtimes.filter((runtime) => !agentIds.has(runtime.agentId))) });
}
function replaceReplyDispatchRuntimeProjections(publication, replacement, agentIds) {
	return Object.freeze({ runtimes: Object.freeze([...publication.runtimes.filter((runtime) => !agentIds.has(runtime.agentId)), ...replacement.runtimes].toSorted((left, right) => left.agentId.localeCompare(right.agentId))) });
}
/** Reads one immutable configured Gateway dispatch generation without activating an owner. */
var PreparedReplyDispatchPublicationOwner = class {
	#publication;
	constructor(host) {
		this.host = host;
		this.#publication = EMPTY_REPLY_DISPATCH_PUBLICATION;
		this.load = async ({ agentId, abortSignal }) => {
			for (;;) {
				if (abortSignal?.aborted) throw createAbortError("Prepared reply dispatch admission aborted", { cause: abortSignal.reason });
				if (!this.host.isGatewayLifecycleActive()) return;
				const replacement = this.host.getPendingReplacement();
				if (replacement) {
					await racePromiseWithAbortSignal(replacement, abortSignal);
					continue;
				}
				const pendingOwner = this.host.getPendingOwnerPublication(agentId);
				if (pendingOwner) {
					await racePromiseWithAbortSignal(pendingOwner, abortSignal);
					continue;
				}
				const matches = this.#publication.runtimes.filter((runtime) => runtime.agentId === agentId);
				if (matches.length !== 1) throw new PreparedModelRuntimeOwnerNotPublishedError(`prepared reply dispatch runtime owner was not published for ${agentId}`);
				return matches[0];
			}
		};
	}
	clear() {
		this.#publication = EMPTY_REPLY_DISPATCH_PUBLICATION;
	}
	advanceConfig(config) {
		this.#publication = Object.freeze({ runtimes: Object.freeze(this.#publication.runtimes.map((runtime) => Object.freeze({
			...runtime,
			config
		}))) });
	}
	rebuild(owners) {
		this.#publication = this.host.isGatewayLifecycleActive() ? buildReplyDispatchPublication(owners) : EMPTY_REPLY_DISPATCH_PUBLICATION;
	}
	remove(agentIds) {
		this.#publication = removeReplyDispatchRuntimeProjections(this.#publication, agentIds);
	}
	replace(owners) {
		const replacements = buildReplyDispatchPublication(owners);
		this.#publication = replaceReplyDispatchRuntimeProjections(this.#publication, replacements, new Set(replacements.runtimes.map((runtime) => runtime.agentId)));
	}
};
//#endregion
//#region src/agents/prepared-model-runtime.ts
/** Lifecycle-owned auth/model discovery snapshots for agent runs. */
const log = createSubsystemLogger("agents/prepared-model-runtime");
const DEFAULT_MODEL_RUNTIME_BUILD_TIMEOUT_MS = 12e4;
let modelRuntimeBuildTimeoutMs = DEFAULT_MODEL_RUNTIME_BUILD_TIMEOUT_MS;
const owners = /* @__PURE__ */ new Map();
const agentBuildCompletions = /* @__PURE__ */ new Map();
const standaloneActivationTails = /* @__PURE__ */ new Map();
const retainedDirectRunOwners = new PreparedModelRuntimeOwnerRetention(1);
const retainedGatewayRunOwners = new PreparedModelRuntimeOwnerRetention(8);
let gatewayLifecycleActive = false;
let refreshTail = Promise.resolve();
let refreshRequestEpoch = 0;
let pendingModelRuntimeReplacement;
const authPublication = new PreparedModelRuntimeAuthPublicationOwner();
const replyDispatchPublication = new PreparedReplyDispatchPublicationOwner({
	isGatewayLifecycleActive: () => gatewayLifecycleActive,
	getPendingOwnerPublication: (agentId) => resolveConfiguredOwnerPublication(owners, {
		agentId,
		agentDir: ".",
		config: {}
	}).pending,
	getPendingReplacement: () => pendingModelRuntimeReplacement?.promise
});
const loadPublishedGatewayReplyDispatchRuntime = replyDispatchPublication.load;
/** Advances model-neutral config identity without rebuilding prepared generation artifacts. */
function advancePreparedModelRuntimeConfig(config) {
	for (const owner of owners.values()) {
		if (owner.input.readOnly) continue;
		advancePreparedModelRuntimeOwnerConfig(owner, config);
	}
	replyDispatchPublication.advanceConfig(config);
}
/** Resolves a published owner or activates a standalone lifecycle owner. */
async function loadPreparedModelRuntimeSnapshot(rawInput) {
	let input = normalizePreparedModelRuntimeInput({
		...rawInput,
		preserveWorkspaceDirOnRefresh: rawInput.preserveWorkspaceDirOnRefresh ?? rawInput.workspaceDir !== void 0
	});
	for (;;) {
		const replacement = pendingModelRuntimeReplacement;
		if (replacement) {
			await replacement.promise;
			if (pendingModelRuntimeReplacement) continue;
			input = rebindInputToCommittedConfiguredOwner(owners, input);
			continue;
		}
		try {
			return await prepareModelRuntimeSnapshot(input);
		} catch (error) {
			if (!(error instanceof PreparedModelRuntimeOwnerNotPublishedError)) throw error;
		}
		if (pendingModelRuntimeReplacement) continue;
		const activated = await activateStandalonePreparedModelRuntime(input);
		if (pendingModelRuntimeReplacement) continue;
		if (!activated) return await prepareModelRuntimeSnapshot(input);
		try {
			return await prepareModelRuntimeSnapshot(input);
		} catch (error) {
			if (!(error instanceof PreparedModelRuntimeOwnerNotPublishedError)) throw error;
		}
	}
}
/** Returns an already-published generation without starting discovery. */
function getPreparedModelRuntimeSnapshot(rawInput) {
	if (pendingModelRuntimeReplacement) return;
	const input = normalizePreparedModelRuntimeInput(rawInput);
	const owner = resolvePublishedOwner(owners, input, { allowConfiguredWorkspaceFallback: rawInput.workspaceDir === void 0 || rawInput.agentId === void 0 || rawInput.runtimePluginSelections === void 0 });
	if (!owner?.snapshot || owner.needsRefresh || owner.pending) return;
	if (input.readOnly && !preparedModelRuntimeConfigsMatch(owner.input.config, input.config)) return;
	return owner.snapshot;
}
/** Publishes one owner from an explicit startup/activation lifecycle boundary. */
async function publishPreparedModelRuntimeSnapshot(rawInput, options = {}) {
	const input = normalizePreparedModelRuntimeInput(rawInput);
	const existing = owners.get(ownerKey(input));
	if (existing?.pending) {
		if (!options.force && hasSameLifecycleInput(existing.input, input)) return await existing.pending;
	} else {
		if (existing?.buildCompletion) throw existing.refreshError ?? /* @__PURE__ */ new Error(`prepared model runtime build is still settling for ${input.agentDir}`);
		if (existing?.snapshot && !existing.needsRefresh && !options.force && hasSameLifecycleInput(existing.input, input)) return existing.snapshot;
	}
	return await publishModelRuntimeSnapshot(input, owners, agentBuildCompletions, modelRuntimeBuildTimeoutMs, existing, options.provenance, options.catalogMode);
}
/** Activates lifecycle publication for direct embedded runtimes without a gateway startup. */
async function activateStandalonePreparedModelRuntime(rawInput) {
	const input = normalizePreparedModelRuntimeInput(rawInput);
	const key = ownerKey(input);
	const activation = (standaloneActivationTails.get(key) ?? Promise.resolve()).then(async () => await activateStandalonePreparedModelRuntimeNow(input));
	const tail = activation.then(() => void 0, () => void 0);
	standaloneActivationTails.set(key, tail);
	try {
		return await activation;
	} finally {
		if (standaloneActivationTails.get(key) === tail) standaloneActivationTails.delete(key);
	}
}
async function activateStandalonePreparedModelRuntimeNow(input) {
	for (;;) {
		const overlapsConfiguredOwner = [...owners.values()].some((owner) => owner.provenance === "configured" && owner.input.agentDir === input.agentDir && (input.agentId === void 0 || owner.input.agentId === input.agentId) && (input.workspaceDir === void 0 || owner.input.workspaceDir === input.workspaceDir));
		if (gatewayLifecycleActive && (!input.readOnly || overlapsConfiguredOwner)) return;
		try {
			return await publishPreparedModelRuntimeSnapshot({
				...input,
				preserveWorkspaceDirOnRefresh: input.workspaceDir !== void 0
			}, { provenance: "standalone" });
		} catch (error) {
			if (!(error instanceof PreparedModelRuntimePublicationSupersededError)) throw error;
			const replacement = pendingModelRuntimeReplacement;
			if (replacement) await replacement.promise;
		}
	}
}
const preparedModelRuntimeLeaseContext = {
	owners,
	agentBuildCompletions,
	retainedDirectRunOwners,
	retainedGatewayRunOwners,
	getBuildTimeoutMs: () => modelRuntimeBuildTimeoutMs,
	getGatewayLifecycleActive: () => gatewayLifecycleActive,
	getPendingReplacement: () => pendingModelRuntimeReplacement,
	prepareSnapshot: prepareModelRuntimeSnapshot
};
/** Acquires a run generation from configured facts; full catalog discovery is explicit. */
async function acquireAgentRunPreparedModelRuntime(rawInput, options = {}) {
	return await acquirePreparedModelRuntimeLeaseFromOwners(rawInput, "run", preparedModelRuntimeLeaseContext, {
		...options,
		catalogMode: options.catalogMode ?? "static"
	});
}
/** Acquires an exact read-only generation scoped to the returned lease. */
async function acquireReadOnlyPreparedModelRuntime(rawInput, abortSignal, catalogMode = "live") {
	return await acquirePreparedModelRuntimeLeaseFromOwners({
		...rawInput,
		readOnly: true
	}, "ephemeral", preparedModelRuntimeLeaseContext, {
		abortSignal,
		catalogMode
	});
}
/** Returns the snapshot published by the lifecycle owner. Request config cannot replace it. */
async function prepareModelRuntimeSnapshot(rawInput) {
	const replacement = pendingModelRuntimeReplacement;
	if (replacement) {
		await replacement.promise;
		return await prepareModelRuntimeSnapshot(rawInput);
	}
	const input = normalizePreparedModelRuntimeInput(rawInput);
	const existing = resolvePublishedOwner(owners, input, { allowConfiguredWorkspaceFallback: rawInput.workspaceDir === void 0 || rawInput.agentId === void 0 || rawInput.runtimePluginSelections === void 0 });
	if (input.readOnly && existing && !preparedModelRuntimeConfigsMatch(existing.input.config, input.config)) throw new PreparedModelRuntimeOwnerNotPublishedError(`prepared read-only model runtime owner was not published for the requested config (${input.agentDir})`);
	if (existing?.pending) {
		try {
			await existing.pending;
		} catch {}
		return await prepareModelRuntimeSnapshot(rawInput);
	}
	if (existing?.needsRefresh) throw existing.refreshError ?? /* @__PURE__ */ new Error("prepared model runtime refresh is pending");
	if (existing?.snapshot) return existing.snapshot;
	throw new PreparedModelRuntimeOwnerNotPublishedError(`prepared model runtime owner was not published for ${input.agentDir}`);
}
/** Refreshes stale inventory only for an explicit catalog read; turn admission remains static. */
async function refreshStalePreparedModelRuntimeCatalog(snapshot) {
	const owner = resolvePreparedModelRuntimeOwnerBySnapshot(snapshot);
	if (!owner || owners.get(ownerKey(owner.input)) !== owner || !owner.catalogStale || !snapshot.loadFullModelCatalog) return;
	const generation = owner.generation;
	const catalog = await snapshot.loadFullModelCatalog({ refresh: true });
	if (owner.catalogStale && owner.generation === generation && owners.get(ownerKey(owner.input)) === owner) owner.catalogStale = false;
	return catalog;
}
/** Invalidates every published generation before config/plugin runtime replacement. */
function markPreparedModelRuntimeSnapshotsStale(reason = "prepared model runtime owner is stale after config publication", options = {}) {
	replyDispatchPublication.clear();
	if (options.waitForReplacement) {
		const superseded = pendingModelRuntimeReplacement;
		pendingModelRuntimeReplacement = createPreparedModelRuntimeReplacement();
		authPublication.adopt(pendingModelRuntimeReplacement.gateId);
		superseded?.resolve();
	} else if (!options.preserveReplacementWait && pendingModelRuntimeReplacement) {
		const cancelled = pendingModelRuntimeReplacement;
		pendingModelRuntimeReplacement = void 0;
		cancelled.resolve();
	}
	refreshRequestEpoch += 1;
	const staleError = new Error(reason);
	updateOwnersForScopedRefresh(owners, options.agentIds, staleError, {
		retireStandalone: true,
		resetPluginGeneration: true
	});
	notifyPreparedModelRuntimePublication({ phase: "invalidated" });
	if (!pendingModelRuntimeReplacement) notifyPreparedModelRuntimePublication({
		phase: "failed",
		error: staleError
	});
	return pendingModelRuntimeReplacement?.gateId;
}
/** Rejects readers waiting for a replacement when its owning reload cannot continue. */
function rejectPendingPreparedModelRuntimeReplacement(gateId, error) {
	const replacement = pendingModelRuntimeReplacement;
	if (!replacement || !gateId || replacement.gateId !== gateId) return;
	pendingModelRuntimeReplacement = void 0;
	const replacementError = toStringifiedError(error);
	authPublication.rejectAdopted(replacement.gateId, replacementError);
	replacement.reject(replacementError);
	notifyPreparedModelRuntimePublication({
		phase: "failed",
		error: replacementError
	});
}
/** Rebuilds active owners after config/plugin runtime publication. */
async function refreshPreparedModelRuntimeSnapshotsNow(config, options, isPublicationCurrent) {
	retainedGatewayRunOwners.clear(owners);
	const catalogMode = options.catalogMode ?? "live";
	gatewayLifecycleActive ||= options.gatewayLifecycle === true;
	const staleError = /* @__PURE__ */ new Error("prepared model runtime owner is stale after config publication");
	const inventories = new Map([...owners.values()].flatMap((owner) => owner.provenance === "configured" && owner.catalogInventory ? [[owner.catalogInventory.key, owner.catalogInventory]] : []));
	updateOwnersForScopedRefresh(owners, options.agentIds, staleError, { retainedConfig: config });
	const entries = [];
	const knownKeys = /* @__PURE__ */ new Set();
	for (const input of listConfiguredRefreshInputs(config, options, owners)) {
		if (options.agentIds && input.agentId && !options.agentIds.has(input.agentId)) continue;
		const key = ownerKey(input);
		if (knownKeys.has(key)) continue;
		knownKeys.add(key);
		const owner = owners.get(key);
		entries.push({
			owner,
			input
		});
	}
	for (const [key, owner] of owners) {
		if (!isPreparedModelRuntimeOwnerInRefreshScope(owner, options.agentIds)) continue;
		if (!knownKeys.has(key) && (gatewayLifecycleActive || owner.provenance === "configured")) owners.delete(key);
	}
	await publishPreparedModelRuntimeOwnerBatch({
		entries: entries.map(({ owner: existing, input }) => {
			const owner = prepareModelRuntimeOwner(input, "configured", catalogMode, existing?.provenance === "configured" ? existing : void 0);
			owner.catalogInventory = inventories.get(preparedModelInventoryKey(input));
			return {
				input,
				owner
			};
		}),
		owners,
		agentBuildCompletions,
		buildTimeoutMs: modelRuntimeBuildTimeoutMs,
		isPublicationCurrent,
		isBuildCurrent: isPublicationCurrent,
		onBuildStats: options.onBuildStats,
		pluginMetadataSnapshot: options.pluginMetadataSnapshot,
		registerEntriesAfterBuildStart: true
	});
}
/** Serializes config/plugin publications so only the latest completed refresh retires owners. */
function refreshPreparedModelRuntimeSnapshots(config, options = {}) {
	if (options.isPublicationCurrent?.() === false) return Promise.resolve();
	const requestedScopedRefresh = options.agentIds !== void 0;
	const initialAgentIds = typeof config === "function" ? void 0 : resolveSafeRefreshAgentIds(config, options, owners);
	const forceFullRefresh = requestedScopedRefresh && initialAgentIds === void 0;
	markPreparedModelRuntimeSnapshotsStale(void 0, {
		waitForReplacement: true,
		agentIds: initialAgentIds
	});
	const requestEpoch = refreshRequestEpoch;
	const replacement = pendingModelRuntimeReplacement;
	let publicationAgentIds = initialAgentIds;
	const isPublicationCurrent = () => requestEpoch === refreshRequestEpoch && options.isPublicationCurrent?.() !== false;
	const rejectReplacement = (error) => {
		if (requestEpoch === refreshRequestEpoch) updateOwnersForScopedRefresh(owners, publicationAgentIds, error, {
			clearPending: true,
			resetPluginGeneration: true
		});
		rejectPendingPreparedModelRuntimeReplacement(replacement?.gateId, error);
	};
	const commitReplacement = () => {
		if (!replacement || pendingModelRuntimeReplacement !== replacement) return;
		if (!isPublicationCurrent()) {
			rejectReplacement(new PreparedModelRuntimePublicationSupersededError("prepared model runtime publication was superseded"));
			return;
		}
		const adoptedAuthTransaction = authPublication.prepareAdoptedCommit(replacement.gateId);
		replyDispatchPublication.rebuild(owners.values());
		pendingModelRuntimeReplacement = void 0;
		if (adoptedAuthTransaction) authPublication.resolve(adoptedAuthTransaction, owners);
		replacement.resolve();
		notifyPreparedModelRuntimePublication({ phase: "published" });
	};
	return enqueuePreparedModelRuntimePublication(async () => {
		if (!isPublicationCurrent()) return;
		const currentConfig = typeof config === "function" ? await config() : config;
		if (!isPublicationCurrent()) return;
		publicationAgentIds = forceFullRefresh ? void 0 : resolveSafeRefreshAgentIds(currentConfig, options, owners);
		await refreshPreparedModelRuntimeSnapshotsNow(currentConfig, {
			...options,
			agentIds: publicationAgentIds
		}, isPublicationCurrent);
		if (!isPublicationCurrent()) return;
		await drainPendingAuthMutations(commitReplacement);
	}).then(commitReplacement, (error) => {
		const refreshError = toStringifiedError(error);
		rejectReplacement(refreshError);
		throw refreshError;
	});
}
function enqueuePreparedModelRuntimePublication(task) {
	const publication = refreshTail.then(task);
	refreshTail = publication.then(() => void 0, () => void 0);
	return publication;
}
async function drainPendingAuthMutations(commit) {
	await authPublication.drain({
		owners,
		publish: async (entries, includeCredentialProviders) => await publishPreparedModelRuntimeOwnerBatch({
			entries,
			owners,
			agentBuildCompletions,
			buildTimeoutMs: modelRuntimeBuildTimeoutMs,
			...includeCredentialProviders ? { includeCredentialProviders: true } : {},
			reusePluginGenerations: true
		}),
		publishOwners: (publishedOwners) => replyDispatchPublication.replace(publishedOwners),
		commit,
		onOwnerFailure: (error) => {
			const refreshError = toStringifiedError(error);
			notifyPreparedModelRuntimePublication({
				phase: "failed",
				error: refreshError
			});
			log.warn(`auth-triggered model runtime refresh failed: ${String(refreshError)}`);
		}
	});
}
function invalidateForAuthMutation(event) {
	const normalizedEvent = {
		...event,
		agentDir: normalizeOptionalDir(event.agentDir)
	};
	const staleError = /* @__PURE__ */ new Error("prepared model runtime owner is stale after auth mutation");
	const invalidatedOwners = [];
	const invalidatedConfiguredAgentIds = /* @__PURE__ */ new Set();
	for (const owner of owners.values()) {
		if (!normalizedEvent.affectsInheritedStores && owner.input.agentDir !== normalizedEvent.agentDir && owner.input.inheritedAuthDir !== normalizedEvent.agentDir) continue;
		invalidatedOwners.push(owner);
		owner.generation += 1;
		owner.needsRefresh = true;
		owner.refreshError = staleError;
		if (normalizedEvent.profileSetChanged) owner.catalogStale = true;
		if (owner.provenance === "configured" && owner.input.agentId) invalidatedConfiguredAgentIds.add(owner.input.agentId);
	}
	if (invalidatedOwners.length === 0) return;
	replyDispatchPublication.remove(invalidatedConfiguredAgentIds);
	const transaction = authPublication.enqueue(invalidatedOwners, normalizedEvent.profileSetChanged);
	if (pendingModelRuntimeReplacement) {
		authPublication.adoptTransaction(transaction, pendingModelRuntimeReplacement.gateId);
		notifyPreparedModelRuntimePublication({ phase: "invalidated" });
		return;
	}
	if (!authPublication.claimPublication(transaction)) {
		notifyPreparedModelRuntimePublication({ phase: "invalidated" });
		return;
	}
	const publication = enqueuePreparedModelRuntimePublication(async () => {
		if (pendingModelRuntimeReplacement) {
			authPublication.adoptTransaction(transaction, pendingModelRuntimeReplacement.gateId);
			return;
		}
		await drainPendingAuthMutations(() => {
			if (pendingModelRuntimeReplacement) {
				authPublication.adoptTransaction(transaction, pendingModelRuntimeReplacement.gateId);
				return;
			}
			if (!authPublication.resolve(transaction, owners)) return;
			if (configuredOwnersAreRequestVisible(owners)) notifyPreparedModelRuntimePublication({ phase: "published" });
		});
	});
	notifyPreparedModelRuntimePublication({ phase: "invalidated" });
	publication.catch((error) => {
		if (!authPublication.isCurrent(transaction)) return;
		if (pendingModelRuntimeReplacement) {
			authPublication.adoptTransaction(transaction, pendingModelRuntimeReplacement.gateId);
			return;
		}
		if (error instanceof PreparedModelRuntimePublicationSupersededError) return;
		const refreshError = toStringifiedError(error);
		authPublication.reject(transaction, refreshError);
		notifyPreparedModelRuntimePublication({
			phase: "failed",
			error: refreshError
		});
		log.warn(`auth-triggered model runtime refresh failed: ${String(refreshError)}`);
	});
}
registerRuntimeAuthProfileStoreMutationListener(invalidateForAuthMutation);
registerPreparedRuntimeAuthMaterializationPublisher(owners, notifyPreparedModelRuntimePublication);
function resetPreparedModelRuntimeSnapshotsForTest() {
	authPublication.reset(new PreparedModelRuntimePublicationSupersededError("prepared model runtime auth publication reset for test"));
	pendingModelRuntimeReplacement?.resolve();
	pendingModelRuntimeReplacement = void 0;
	owners.clear();
	agentBuildCompletions.clear();
	standaloneActivationTails.clear();
	retainedGatewayRunOwners.clear(owners);
	gatewayLifecycleActive = false;
	refreshTail = Promise.resolve();
	refreshRequestEpoch = 0;
	replyDispatchPublication.clear();
	resetPreparedModelRuntimePublicationListenersForTest();
	modelRuntimeBuildTimeoutMs = DEFAULT_MODEL_RUNTIME_BUILD_TIMEOUT_MS;
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.preparedModelRuntimeTestApi")] = {
	resetPreparedModelRuntimeSnapshotsForTest,
	getPreparedModelRuntimeOwnerCountForTest: () => owners.size,
	setModelRuntimeBuildTimeoutMsForTest: (timeoutMs) => {
		modelRuntimeBuildTimeoutMs = timeoutMs;
	}
};
//#endregion
export { getPreparedModelRuntimeSnapshot as a, markPreparedModelRuntimeSnapshotsStale as c, refreshPreparedModelRuntimeSnapshots as d, refreshStalePreparedModelRuntimeCatalog as f, registerPreparedModelRuntimePublicationListener as h, advancePreparedModelRuntimeConfig as i, prepareModelRuntimeSnapshot as l, preparedModelRuntimeConfigsMatch as m, acquireReadOnlyPreparedModelRuntime as n, loadPreparedModelRuntimeSnapshot as o, rejectPendingPreparedModelRuntimeReplacement as p, activateStandalonePreparedModelRuntime as r, loadPublishedGatewayReplyDispatchRuntime as s, acquireAgentRunPreparedModelRuntime as t, publishPreparedModelRuntimeSnapshot as u };
