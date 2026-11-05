import { u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { t as modelKey } from "./model-key-CMdQNkZf.js";
import { A as resolveSessionAuthProfileOverrideSource } from "./agent-scope-CSlN0kZb.js";
import { c as resolveContextConfigProviderForRuntime } from "./openai-routing-ChWi-Lfh.js";
import { a as enqueueSystemEvent } from "./system-events-GfU3KOHp.js";
import { f as emitSessionLifecycleEvent } from "./session-history-eviction-d5aiCsHS.js";
import { s as isModelSelectionLocked, t as MODEL_SELECTION_LOCKED_MESSAGE } from "./model-overrides-Bm7jo7Di.js";
import { o as resolveSupportedThinkingLevel } from "./thinking-DxxV8Ztb.js";
import { o as resolveEffectiveAgentRuntime } from "./thinking-runtime-CMnVn0Uq.js";
import "./model-selection-DG2dN6VK.js";
import { c as refreshQueuedFollowupSession } from "./settings-B6dacI0n.js";
import "./queue-CsUB-_ct.js";
import { t as triggerSessionPatchHook } from "./session-patch-hooks-BR_6t2pX.js";
import { t as applyModelOverrideWithAuthProfileCompatibility } from "./auth-profile-preservation-B0RcY8kT.js";
import { n as createModelVisibilityPolicy } from "./model-visibility-policy-B1zFZD7p.js";
import { t as persistStickyModelSelectionBestEffort } from "./sticky-model-selection-DfNCb7JF.js";
import { a as prepareModelSelectionRuntime, s as applyModelRuntimeDirective, t as findSelectedCatalogEntry } from "./model-runtime-normalization-BOTUJuoD.js";
import { a as sessionModelOverrideChangesApplied, n as adoptPersistedSessionSnapshot, t as SESSION_MODEL_OVERRIDE_TRANSACTION_FIELDS } from "./session-snapshot-merge-Cf1TdJBp.js";
import { t as resolveContextTokens } from "./model-selection-context-DGf0lxtG.js";
import { t as persistReplySessionEntry } from "./session-entry-persistence-BxybRpdv.js";
//#region src/model-picker/apply-session-model-selection.ts
/** Applies the model transaction field family to one caller-owned snapshot. */
function applySessionModelSelectionToEntry(params) {
	const modelChange = applyModelOverrideWithAuthProfileCompatibility({
		cfg: params.cfg,
		agentDir: params.agentDir,
		entry: params.entry,
		currentProvider: params.currentProvider,
		selection: params.request,
		profileOverride: params.request.profileOverride,
		markLiveSwitchPending: params.markLiveSwitchPending
	});
	const runtimeChange = applyModelRuntimeDirective(params.entry, params.runtime);
	return {
		changed: modelChange.updated || runtimeChange.updated,
		...params.runtime.kind === "clear" || params.runtime.kind === "set" ? { runtimeChange: params.runtime } : {}
	};
}
function formatModelSwitchEvent(provider, model, alias) {
	const label = `${provider}/${model}`;
	return alias ? `Model switched to ${alias} (${label}).` : `Model switched to ${label}.`;
}
function rejectNotAllowed(provider, model) {
	return {
		status: "rejected",
		reason: "not-allowed",
		message: `Model ${provider}/${model} is not available for this agent.`
	};
}
/** Applies one validated picker selection to the authoritative live session. */
async function applySessionModelSelection(params) {
	const startingStoreEntry = params.sessionStore[params.sessionKey];
	const startingEntry = params.storePath ? params.sessionEntry : startingStoreEntry ?? params.sessionEntry;
	const initialEntry = { ...startingEntry };
	if (isModelSelectionLocked(startingEntry)) return {
		status: "rejected",
		reason: "locked",
		message: MODEL_SELECTION_LOCKED_MESSAGE
	};
	const normalizedModelKey = modelKey(params.request.provider, params.request.model);
	if (!(params.modelPolicy ?? createModelVisibilityPolicy({
		cfg: params.cfg,
		catalog: [...params.modelCatalog],
		defaultProvider: params.defaultProvider,
		defaultModel: params.defaultModel,
		agentId: params.agentId
	})).allows(params.request)) return rejectNotAllowed(params.request.provider, params.request.model);
	const request = {
		...params.request,
		isDefault: normalizedModelKey === modelKey(params.defaultProvider, params.defaultModel)
	};
	const prepared = await prepareModelSelectionRuntime({
		cfg: params.cfg,
		agentId: params.agentId,
		sessionEntry: startingEntry,
		provider: request.provider,
		model: request.model,
		catalog: params.thinkingCatalog ?? params.modelCatalog,
		rawRuntime: request.runtime.kind === "set" ? request.runtime.runtime : request.runtime.kind === "clear" ? "default" : void 0
	});
	if (prepared.status === "rejected") return prepared;
	const currentEntry = params.storePath ? startingEntry : params.sessionStore[params.sessionKey] ?? params.sessionEntry;
	if (isModelSelectionLocked(currentEntry)) return {
		status: "rejected",
		reason: "locked",
		message: MODEL_SELECTION_LOCKED_MESSAGE
	};
	if (!params.storePath && (params.sessionStore[params.sessionKey] !== startingStoreEntry || currentEntry.sessionId !== initialEntry.sessionId)) return {
		status: "conflict",
		message: "Model change was not applied because the session changed. Retry."
	};
	const runtime = prepared.runtime;
	const thinkingCatalog = prepared.catalog;
	const selectedCatalogEntry = findSelectedCatalogEntry({
		catalog: thinkingCatalog,
		...request
	});
	const nextEntry = { ...startingEntry };
	const applied = applySessionModelSelectionToEntry({
		cfg: params.cfg,
		agentDir: resolveAgentDir(params.cfg, params.agentId),
		entry: nextEntry,
		currentProvider: params.currentProvider,
		request,
		runtime,
		markLiveSwitchPending: params.markLiveSwitchPending
	});
	const thinkingRuntime = resolveEffectiveAgentRuntime({
		cfg: params.cfg,
		provider: request.provider,
		modelId: request.model,
		modelApi: selectedCatalogEntry?.api,
		modelBaseUrl: selectedCatalogEntry?.baseUrl,
		agentId: params.agentId,
		sessionKey: params.sessionKey,
		sessionEntry: nextEntry
	});
	const currentThinkingLevel = nextEntry.thinkingLevel;
	let thinkingRemap;
	if (currentThinkingLevel) {
		const remapped = resolveSupportedThinkingLevel({
			provider: request.provider,
			model: request.model,
			level: currentThinkingLevel,
			catalog: [...thinkingCatalog],
			agentRuntime: thinkingRuntime
		});
		if (remapped !== currentThinkingLevel) {
			// thinking-preserve-on-switch-v1: report the clamp for this model, keep the stored level.
			thinkingRemap = {
				from: currentThinkingLevel,
				to: remapped,
				provider: request.provider,
				model: request.model
			};
		}
	}
	nextEntry.updatedAt = Date.now();
	let persistedEntry;
	if (params.storePath) {
		const persistence = await persistReplySessionEntry({
			storePath: params.storePath,
			sessionKey: params.sessionKey,
			initialEntry,
			entry: nextEntry,
			allowCreate: params.allowCreate,
			reassertLiveModelSwitchPending: applied.changed && nextEntry.liveModelSwitchPending === true,
			requireModelSelectionUnlocked: true,
			touchedFields: SESSION_MODEL_OVERRIDE_TRANSACTION_FIELDS
		});
		if (persistence.entry) {
			params.sessionStore[params.sessionKey] = persistence.entry;
			adoptPersistedSessionSnapshot(params.sessionEntry, persistence.entry);
		}
		if (persistence.status === "model-selection-locked") return {
			status: "rejected",
			reason: "locked",
			message: MODEL_SELECTION_LOCKED_MESSAGE
		};
		if (persistence.status !== "current" || !sessionModelOverrideChangesApplied({
			initial: initialEntry,
			next: nextEntry,
			current: persistence.entry,
			reassertLiveModelSwitchPending: applied.changed && nextEntry.liveModelSwitchPending === true
		})) return {
			status: "conflict",
			message: "Model change was not applied because the session changed. Retry."
		};
		persistedEntry = persistence.entry;
	} else {
		adoptPersistedSessionSnapshot(params.sessionEntry, nextEntry);
		params.sessionStore[params.sessionKey] = params.sessionEntry;
		persistedEntry = params.sessionEntry;
	}
	const agentRuntime = resolveEffectiveAgentRuntime({
		cfg: params.cfg,
		provider: request.provider,
		modelId: request.model,
		modelApi: selectedCatalogEntry?.api,
		modelBaseUrl: selectedCatalogEntry?.baseUrl,
		agentId: params.agentId,
		sessionKey: params.sessionKey,
		sessionEntry: persistedEntry
	});
	const provider = request.provider;
	const model = request.model;
	const effectiveModelRef = `${provider}/${model}`;
	const changed = applied.changed;
	const configuredDefaultUpdate = params.canPersistStickyModelSelection === true && (!request.isDefault || params.stickyModelSelectionTarget) ? persistStickyModelSelectionBestEffort({
		agentId: params.agentId,
		model: effectiveModelRef,
		...params.stickyModelSelectionTarget ? { target: params.stickyModelSelectionTarget } : {}
	}) : void 0;
	if (changed) {
		emitSessionLifecycleEvent({
			sessionKey: params.sessionKey,
			agentId: params.agentId,
			reason: "patch"
		});
		triggerSessionPatchHook({
			cfg: params.cfg,
			sessionEntry: persistedEntry,
			sessionKey: params.sessionKey,
			patch: {
				key: params.sessionKey,
				model: params.patchModel ?? effectiveModelRef
			}
		});
		refreshQueuedFollowupSession({
			key: params.sessionKey,
			nextProvider: provider,
			nextModel: model,
			nextRouteResolution: "resolved",
			nextModelOverrideSource: request.isDefault ? void 0 : "user",
			nextAuthProfileId: persistedEntry.authProfileOverride,
			nextAuthProfileIdSource: resolveSessionAuthProfileOverrideSource(persistedEntry),
			nextThinking: {
				level: persistedEntry.thinkingLevel,
				catalog: [...thinkingCatalog],
				agentRuntime
			}
		});
	}
	if (`${params.currentProvider}/${params.currentModel}` !== effectiveModelRef) enqueueSystemEvent(formatModelSwitchEvent(provider, model, request.alias), {
		sessionKey: params.sessionKey,
		contextKey: `model:${effectiveModelRef}`
	});
	const contextProvider = resolveContextConfigProviderForRuntime({
		provider,
		runtimeId: agentRuntime,
		config: params.cfg
	});
	return {
		status: "applied",
		provider,
		model,
		effectiveModelRef,
		agentRuntime,
		changed,
		contextTokens: resolveContextTokens({
			cfg: params.cfg,
			provider: contextProvider,
			model,
			modelContextWindow: selectedCatalogEntry?.contextWindow,
			modelContextTokens: selectedCatalogEntry?.contextTokens
		}),
		...configuredDefaultUpdate ? { configuredDefaultUpdate } : {},
		...applied.runtimeChange ? { runtimeChange: applied.runtimeChange } : {},
		...thinkingRemap ? { thinkingRemap } : {}
	};
}
//#endregion
export { applySessionModelSelection as t };
