import { a as normalizeFastMode, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { m as resolveAgentWorkspaceDir, u as resolveAgentDir, y as resolveDefaultAgentId } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, S as isAcpSessionKey, T as isSubagentSessionKey } from "./session-key-CRjxKW0X.js";
import { b as findModelCatalogEntry } from "./model-selection-shared-BUMiYTyL.js";
import { t as splitTrailingAuthProfile } from "./model-ref-profile-BIKs-96s.js";
import "./agent-scope-CSlN0kZb.js";
import { n as resolveSubagentConfiguredModelSelection, t as resolveDefaultModelForAgent } from "./model-selection-config-bdtzr00S.js";
import { a as normalizeElevatedLevel, l as normalizeUsageDisplay, o as normalizeReasoningLevel, s as normalizeThinkLevel } from "./thinking.shared-bHYuuc1L.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { a as normalizeSessionIconValue, i as normalizeSessionColorValue, n as SESSION_COLOR_IDS, r as SESSION_ICON_GLYPH_IDS } from "./session-agent-status-Dd63sexE.js";
import "./model-catalog-CIpnqiiW.js";
import { c as projectCanonicalSessionEntryShape } from "./store-writer-state-_Y6b9Vjm.js";
import { n as buildSessionCreationStamp } from "./session-entry-provenance-Ch9ZRplR.js";
import { m as resolveMissingAgentHarnessSessionError, o as isAgentHarnessSessionKeyOwnedBy } from "./agent-harness-session-key-CLRQddqz.js";
import { s as isModelSelectionLocked, t as MODEL_SELECTION_LOCKED_MESSAGE } from "./model-overrides-Bm7jo7Di.js";
import { n as isThinkingLevelSupported, o as resolveSupportedThinkingLevel, t as formatThinkingLevels } from "./thinking-DxxV8Ztb.js";
import { o as resolveEffectiveAgentRuntime } from "./thinking-runtime-CMnVn0Uq.js";
import { n as requiresAgentHarnessPluginSelection, r as resolveAgentHarnessOwnerPluginIds } from "./runtime-plugin-load-plan-Bm46qisR.js";
import { t as resolveAllowedModelRefCore } from "./model-selection-resolve-C6fFERVD.js";
import "./model-selection-DG2dN6VK.js";
import { a as readAcpSessionMetaForEntry } from "./session-meta-CMnopLdV.js";
import { c as normalizeInheritedToolDenylist, s as normalizeInheritedToolAllowlist } from "./inherited-tool-deny-QVM6xpjt.js";
import { v as normalizeExecTarget } from "./exec-approvals-policy-CCFUzTzd.js";
import "./exec-approvals-BYdx-Fgk.js";
import { C as resolveActiveSessionAgentStatus, S as isSessionAgentAttentionIconId, T as sessionAgentStatusExpiresAt, w as sanitizeSessionAgentStatusNote } from "./session-utils-list-BUP03AzS.js";
import { t as applyModelOverrideWithAuthProfileCompatibility } from "./auth-profile-preservation-B0RcY8kT.js";
import { t as parseSessionLabel } from "./session-label-DSD-L6TD.js";
import { n as snapshotAgentModelFallback, t as isAgentSessionModelPatchOrigin } from "./session-model-patch-origin-CxLc593t.js";
import { t as normalizeSendPolicy } from "./send-policy-C3rFzSh0.js";
import { t as normalizeGroupActivation } from "./group-activation-B6ER3hWD.js";
import { i as parseVerboseOverride, n as applyVerboseOverride, r as parseTraceOverride, t as applyTraceOverride } from "./level-overrides-DdeyQjzP.js";
import { t as normalizeSessionToolOverrides } from "./session-tool-overrides-BnsUT7mq.js";
import { randomUUID } from "node:crypto";
//#region src/gateway/sessions-patch-context-window.ts
async function applySessionContextWindowPatch(params) {
	if ("contextWindow" in params.patch) {
		const previous = params.next.contextWindow;
		const raw = params.patch.contextWindow;
		if (raw === null) delete params.next.contextWindow;
		else if (raw !== void 0) params.next.contextWindow = raw.trim();
		if (previous !== params.next.contextWindow) params.next.liveModelSwitchPending = true;
	}
	if (!("contextWindow" in params.patch) && !("model" in params.patch)) return { ok: true };
	const selected = normalizeOptionalString(params.next.contextWindow);
	if (!selected) {
		delete params.next.contextWindow;
		return { ok: true };
	}
	const provider = params.next.providerOverride ?? params.defaultProvider;
	const model = params.next.modelOverride ?? params.defaultModel;
	const catalog = await params.loadModelCatalog();
	const catalogEntry = catalog ? findModelCatalogEntry(catalog, {
		provider,
		modelId: model
	}) : void 0;
	if (catalogEntry?.contextWindows?.some((option) => option.id === selected)) return { ok: true };
	if (!("contextWindow" in params.patch)) {
		delete params.next.contextWindow;
		return { ok: true };
	}
	const allowed = catalogEntry?.contextWindows?.map((option) => option.id).join("|");
	return {
		ok: false,
		error: `contextWindow "${selected}" is not supported for ${provider}/${model}${allowed ? ` (use ${allowed})` : ""}`
	};
}
//#endregion
//#region src/gateway/sessions-patch-display-metadata.ts
/** Applies display-metadata patch fields onto the next entry; returns an error message on invalid input. */
function applySessionsPatchDisplayMetadata(params) {
	const { patch, next } = params;
	if ("label" in patch) {
		const raw = patch.label;
		if (raw === null) delete next.label;
		else if (raw !== void 0) {
			const parsed = parseSessionLabel(raw);
			if (!parsed.ok) return parsed.error;
			if (params.isLabelInUse(parsed.label)) return `label already in use: ${parsed.label}`;
			next.label = parsed.label;
		}
	}
	if ("icon" in patch) {
		const raw = patch.icon;
		if (raw === null || raw === "") delete next.icon;
		else if (raw !== void 0) {
			const icon = normalizeSessionIconValue(raw);
			if (!icon) return `icon must be a single emoji or one of: ${SESSION_ICON_GLYPH_IDS.join(", ")}`;
			next.icon = icon;
		}
	}
	if ("color" in patch) {
		const raw = patch.color;
		if (raw === null || raw === "") delete next.color;
		else if (raw !== void 0) {
			const color = normalizeSessionColorValue(raw);
			if (!color) return `color must be one of: ${SESSION_COLOR_IDS.join(", ")}`;
			next.color = color;
		}
	}
	if ("category" in patch) {
		const raw = patch.category;
		if (raw === null) delete next.category;
		else if (raw !== void 0) {
			const trimmed = normalizeOptionalString(raw) ?? "";
			if (!trimmed) return "invalid category: empty";
			if (trimmed.length > 512) return `invalid category: too long (max 512)`;
			next.category = trimmed;
		}
	}
	if ("boardFace" in patch && patch.boardFace !== void 0) next.boardFace = patch.boardFace;
}
//#endregion
//#region src/gateway/sessions-patch-subagent-policy.ts
function supportsSpawnPolicy(storeKey) {
	return isSubagentSessionKey(storeKey) || isAcpSessionKey(storeKey);
}
function unsupportedField(field, storeKey) {
	return supportsSpawnPolicy(storeKey) ? void 0 : `${field} is only supported for subagent:* or acp:* sessions`;
}
/** Applies the remaining public child-policy fields after lineage became creation-only. */
function applySessionsPatchSubagentPolicy(params) {
	const { existing, next, patch, storeKey } = params;
	if ("completionOwnerSessionKey" in patch) {
		const raw = patch.completionOwnerSessionKey;
		if (raw === null && existing?.completionOwnerSessionKey) return "completionOwnerSessionKey cannot be cleared once set";
		if (raw !== null && raw !== void 0) {
			const unsupported = unsupportedField("completionOwnerSessionKey", storeKey);
			if (unsupported) return unsupported;
			const normalized = normalizeOptionalString(raw);
			if (!normalized) return "invalid completionOwnerSessionKey: empty";
			if (existing?.completionOwnerSessionKey && existing.completionOwnerSessionKey !== normalized) return "completionOwnerSessionKey cannot be changed once set";
			next.completionOwnerSessionKey = normalized;
		}
	}
	if ("inheritedToolPolicyVersion" in patch) {
		const raw = patch.inheritedToolPolicyVersion;
		if (raw === null && existing?.inheritedToolPolicyVersion !== void 0) return "inheritedToolPolicyVersion cannot be cleared once set";
		if (raw !== null && raw !== void 0) {
			const unsupported = unsupportedField("inheritedToolPolicyVersion", storeKey);
			if (unsupported) return unsupported;
			if (raw !== 1) return "invalid inheritedToolPolicyVersion (expected 1)";
			next.inheritedToolPolicyVersion = 1;
		}
	}
	for (const field of ["inheritedToolDeny", "inheritedToolAllow"]) {
		if (!(field in patch)) continue;
		const raw = patch[field];
		if (raw === null) {
			delete next[field];
			continue;
		}
		if (raw === void 0) continue;
		if (!Array.isArray(raw)) return `invalid ${field} (use an array of tool names)`;
		const unsupported = unsupportedField(field, storeKey);
		if (unsupported) return unsupported;
		const normalized = field === "inheritedToolDeny" ? normalizeInheritedToolDenylist(raw) : normalizeInheritedToolAllowlist(raw);
		if (normalized.length > 0) next[field] = normalized;
		else delete next[field];
	}
}
//#endregion
//#region src/gateway/sessions-patch.ts
function invalid(message) {
	return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, message)
	};
}
function resolveSessionPatchModelSelection(params) {
	const { model: modelWithoutProfile, profile } = splitTrailingAuthProfile(params.raw);
	const resolved = resolveAllowedModelRefCore({
		cfg: params.cfg,
		agentId: params.agentId,
		catalog: params.catalog,
		raw: modelWithoutProfile,
		defaultProvider: params.defaultProvider,
		defaultModel: params.subagentModelHint ?? params.defaultModel
	});
	if ("error" in resolved) return {
		ok: false,
		error: resolved.error
	};
	return {
		ok: true,
		provider: resolved.ref.provider,
		model: resolved.ref.model,
		...profile ? { profile } : {},
		isDefault: resolved.ref.provider === params.defaultProvider && resolved.ref.model === params.defaultModel
	};
}
/** Project a validated gateway session patch for one session entry. */
async function projectSessionsPatchEntry(params) {
	const { cfg, storeKey, patch, creation } = params;
	if ("execSecurity" in patch || "execAsk" in patch) return invalid("execSecurity/execAsk are retired; set permissionMode (read-only|guarded|workspace|full) instead, or use /exec for this run only.");
	const harnessSessionError = params.existingEntry === void 0 && isAgentHarnessSessionKeyOwnedBy(storeKey, params.authorizedAgentHarnessId) ? void 0 : resolveMissingAgentHarnessSessionError(storeKey, params.existingEntry);
	if (harnessSessionError) return invalid(harnessSessionError);
	if (typeof patch.archived === "boolean") {
		if (!params.existingEntry?.sessionId) return invalid(`session not found: ${storeKey}`);
		if (patch.expectedSessionId === void 0) return invalid(`expectedSessionId required for session lifecycle patch: ${storeKey}`);
	}
	if ("model" in patch && isModelSelectionLocked(params.existingEntry)) return invalid(MODEL_SELECTION_LOCKED_MESSAGE);
	const now = Date.now();
	const parsedAgent = parseAgentSessionKey(storeKey);
	const sessionAgentId = normalizeAgentId(params.agentId ?? parsedAgent?.agentId ?? resolveDefaultAgentId(cfg));
	const resolvedDefault = resolveDefaultModelForAgent({
		cfg,
		agentId: sessionAgentId
	});
	const subagentModelHint = isSubagentSessionKey(storeKey) ? resolveSubagentConfiguredModelSelection({
		cfg,
		agentId: sessionAgentId
	}) : void 0;
	const resolveThinkingRuntime = (provider, model, entry) => {
		const acpMeta = readAcpSessionMetaForEntry({
			sessionKey: storeKey,
			agentId: sessionAgentId,
			entry
		});
		return params.preparedAgentRuntime ?? acpMeta?.backend ?? resolveEffectiveAgentRuntime({
			cfg,
			provider,
			modelId: model,
			agentId: sessionAgentId,
			sessionKey: storeKey,
			sessionEntry: entry
		});
	};
	let loadedModelCatalog;
	const loadPreparedModelCatalogForPatch = async () => {
		if (!loadedModelCatalog && params.loadGatewayModelCatalog) {
			const catalog = await params.loadGatewayModelCatalog();
			loadedModelCatalog = Array.isArray(catalog) ? catalog : [];
		}
		return loadedModelCatalog;
	};
	const existing = params.existingEntry && projectCanonicalSessionEntryShape({ ...params.existingEntry });
	const next = {
		...existing,
		sessionId: existing?.sessionId || randomUUID(),
		updatedAt: Math.max(existing?.updatedAt ?? 0, now),
		...params.preparedSessionRoot ? { sessionRoot: params.preparedSessionRoot } : {},
		...creation && params.existingEntry === void 0 ? buildSessionCreationStamp(creation) : {}
	};
	if (existing && !existing.sessionId) {
		delete next.label;
		delete next.category;
		delete next.displayName;
	}
	const subagentPolicyError = applySessionsPatchSubagentPolicy({
		existing,
		next,
		patch,
		storeKey
	});
	if (subagentPolicyError) return invalid(subagentPolicyError);
	const displayMetadataError = applySessionsPatchDisplayMetadata({
		patch,
		next,
		isLabelInUse: params.isLabelInUse
	});
	if (displayMetadataError) return invalid(displayMetadataError);
	if ("statusNote" in patch || "attention" in patch || "ttlMinutes" in patch) {
		const rawNote = patch.statusNote;
		const rawAttention = patch.attention;
		const ttlMinutes = patch.ttlMinutes;
		if (ttlMinutes !== void 0 && (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 120)) return invalid(`invalid ttlMinutes (use 1-120)`);
		if (rawNote === null || rawAttention === null) {
			if (rawNote !== void 0 && rawNote !== null || rawAttention !== void 0 && rawAttention !== null) return invalid("cannot clear and set agent status in the same patch");
			delete next.agentStatus;
		} else {
			const current = resolveActiveSessionAgentStatus(next.agentStatus, now);
			const note = rawNote === void 0 ? current?.note : sanitizeSessionAgentStatusNote(rawNote);
			if (!note) return invalid("statusNote required before setting attention or ttlMinutes");
			if (rawAttention !== void 0 && !isSessionAgentAttentionIconId(rawAttention)) return invalid("invalid attention icon");
			const attention = rawAttention ?? current?.attention;
			next.agentStatus = {
				note,
				expiresAt: sessionAgentStatusExpiresAt(now, ttlMinutes),
				...attention ? { attention } : {}
			};
		}
	}
	if ("archived" in patch) {
		if (patch.archived === true) {
			if (next.archivedAt === void 0) {
				next.archivedAt = now;
				if (params.archivedBy) next.archivedBy = params.archivedBy;
				else delete next.archivedBy;
			}
			delete next.pinnedAt;
		} else {
			delete next.archivedAt;
			delete next.archivedBy;
		}
	}
	if ("pinned" in patch) {
		if (patch.pinned === true) {
			if (next.archivedAt !== void 0) return invalid("cannot pin an archived session; restore it first");
			next.pinnedAt ??= now;
		} else delete next.pinnedAt;
	}
	if ("unread" in patch) {
		if (patch.unread === true) next.markedUnreadAt = Math.max(now, (params.existingEntry?.markedUnreadAt ?? 0) + 1);
		else {
			next.lastReadAt = now;
			delete next.markedUnreadAt;
			delete next.agentStatus;
		}
	}
	if ("thinkingLevel" in patch) {
		const raw = patch.thinkingLevel;
		if (raw === null) delete next.thinkingLevel;
		else if (raw !== void 0) {
			const normalized = normalizeThinkLevel(raw);
			if (!normalized) {
				const hintProvider = normalizeOptionalString(existing?.providerOverride) || resolvedDefault.provider;
				const hintModel = normalizeOptionalString(existing?.modelOverride) || resolvedDefault.model;
				const thinkingCatalog = await loadPreparedModelCatalogForPatch();
				const thinkingRuntime = resolveThinkingRuntime(hintProvider, hintModel, existing);
				return invalid(`invalid thinkingLevel (use ${formatThinkingLevels(hintProvider, hintModel, "|", thinkingCatalog, thinkingRuntime)})`);
			}
			next.thinkingLevel = normalized;
		}
	}
	if ("fastMode" in patch) {
		const raw = patch.fastMode;
		if (raw === null) delete next.fastMode;
		else if (raw !== void 0) {
			const normalized = normalizeFastMode(raw);
			if (normalized === void 0) return invalid("invalid fastMode (use true, false, or \"auto\")");
			next.fastMode = normalized;
		}
	}
	if ("toolOverrides" in patch) {
		const raw = patch.toolOverrides;
		if (raw === null) delete next.toolOverrides;
		else if (raw !== void 0) {
			const normalized = normalizeSessionToolOverrides(raw);
			if (normalized) next.toolOverrides = normalized;
			else delete next.toolOverrides;
		}
	}
	if ("verboseLevel" in patch) {
		const raw = patch.verboseLevel;
		const parsed = parseVerboseOverride(raw);
		if (!parsed.ok) return invalid(parsed.error);
		applyVerboseOverride(next, parsed.value);
	}
	if ("traceLevel" in patch) {
		const raw = patch.traceLevel;
		const parsed = parseTraceOverride(raw);
		if (!parsed.ok) return invalid(parsed.error);
		applyTraceOverride(next, parsed.value);
	}
	if ("reasoningLevel" in patch) {
		const raw = patch.reasoningLevel;
		if (raw === null) delete next.reasoningLevel;
		else if (raw !== void 0) {
			const normalized = normalizeReasoningLevel(raw);
			if (!normalized) return invalid("invalid reasoningLevel (use \"on\"|\"off\"|\"stream\")");
			next.reasoningLevel = normalized;
		}
	}
	if ("responseUsage" in patch) {
		const raw = patch.responseUsage;
		if (raw === null) delete next.responseUsage;
		else if (raw !== void 0) {
			const normalized = normalizeUsageDisplay(raw);
			if (!normalized) return invalid("invalid responseUsage (use \"off\"|\"tokens\"|\"full\")");
			next.responseUsage = normalized;
		}
	}
	if ("elevatedLevel" in patch) {
		const raw = patch.elevatedLevel;
		if (raw === null) delete next.elevatedLevel;
		else if (raw !== void 0) {
			const normalized = normalizeElevatedLevel(raw);
			if (!normalized) return invalid("invalid elevatedLevel (use \"on\"|\"off\"|\"ask\"|\"full\")");
			next.elevatedLevel = normalized;
		}
	}
	if ("execHost" in patch) {
		const raw = patch.execHost;
		if (raw === null) delete next.execHost;
		else if (raw !== void 0) {
			const normalized = normalizeExecTarget(raw) ?? void 0;
			if (!normalized) return invalid("invalid execHost (use \"auto\"|\"sandbox\"|\"gateway\"|\"node\")");
			next.execHost = normalized;
		}
	}
	if ("execNode" in patch) {
		if (patch.execNode === null) {
			delete next.execNode;
			delete next.execCwd;
			if (next.execHost === "node") delete next.execHost;
		} else if (patch.execNode !== void 0) {
			const trimmed = normalizeOptionalString(patch.execNode) ?? "";
			if (!trimmed) return invalid("invalid execNode: empty");
			if (trimmed !== next.execNode) delete next.execCwd;
			next.execNode = trimmed;
		}
	}
	if ("permissionMode" in patch) {
		if (patch.permissionMode === null) delete next.permissionMode;
		else if (patch.permissionMode !== void 0) next.permissionMode = patch.permissionMode;
	}
	if ("model" in patch) {
		const agentModelFallback = isAgentSessionModelPatchOrigin() ? next.modelFallback?.source === "agent-patch" ? {
			...next.modelFallback,
			ts: Math.max(now, next.modelFallback.ts + 1)
		} : snapshotAgentModelFallback(cfg, next, sessionAgentId, now) : void 0;
		delete next.modelFallback;
		const raw = patch.model;
		let selection;
		if (raw === null) selection = {
			...resolvedDefault,
			isDefault: true
		};
		else if (raw !== void 0) {
			const trimmed = normalizeOptionalString(raw) ?? "";
			if (!trimmed) return invalid("invalid model: empty");
			const catalog = await loadPreparedModelCatalogForPatch();
			if (!catalog) return {
				ok: false,
				error: errorShape(ErrorCodes.UNAVAILABLE, "model catalog is still loading; retry in a few seconds")
			};
			const resolved = resolveSessionPatchModelSelection({
				cfg,
				agentId: sessionAgentId,
				catalog,
				raw: trimmed,
				defaultProvider: resolvedDefault.provider,
				defaultModel: resolvedDefault.model,
				subagentModelHint
			});
			if (!resolved.ok) return invalid(resolved.error);
			selection = resolved;
		}
		if (selection) {
			const harnessSelection = {
				provider: selection.provider,
				modelId: selection.model,
				runtime: resolveThinkingRuntime(selection.provider, selection.model, next),
				agentId: sessionAgentId
			};
			if (!readAcpSessionMetaForEntry({
				sessionKey: storeKey,
				agentId: sessionAgentId,
				entry: next
			}) && requiresAgentHarnessPluginSelection(harnessSelection, cfg) && resolveAgentHarnessOwnerPluginIds({
				...harnessSelection,
				config: cfg,
				workspaceDir: resolveAgentWorkspaceDir(cfg, sessionAgentId)
			}).length === 0) return invalid(`Model ${selection.provider}/${selection.model} requires agent harness "${harnessSelection.runtime}", but no enabled plugin provides it. Install and enable its plugin, restart the Gateway, then select the model again.`);
			applyModelOverrideWithAuthProfileCompatibility({
				cfg,
				agentDir: resolveAgentDir(cfg, sessionAgentId),
				entry: next,
				currentProvider: next.providerOverride ?? next.modelProvider ?? resolvedDefault.provider,
				selection,
				profileOverride: selection.profile,
				...params.providerAuthMetadataSnapshot ? { metadataSnapshot: params.providerAuthMetadataSnapshot } : {},
				markLiveSwitchPending: raw !== null
			});
			if (raw === null) delete next.liveModelSwitchPending;
		}
		if (agentModelFallback) next.modelFallback = agentModelFallback;
	}
	if ("thinkingLevel" in patch || "model" in patch) {
		const effectiveProvider = next.providerOverride ?? resolvedDefault.provider;
		const effectiveModel = next.modelOverride ?? resolvedDefault.model;
		const thinkingLevel = normalizeThinkLevel(next.thinkingLevel);
		let thinkingRuntime;
		if (!thinkingLevel) delete next.thinkingLevel;
		else {
			const thinkingCatalog = await loadPreparedModelCatalogForPatch();
			thinkingRuntime = resolveThinkingRuntime(effectiveProvider, effectiveModel, next);
			if (!isThinkingLevelSupported({
				provider: effectiveProvider,
				model: effectiveModel,
				level: thinkingLevel,
				catalog: thinkingCatalog,
				agentRuntime: thinkingRuntime
			})) {
				if ("thinkingLevel" in patch) return invalid(`thinkingLevel "${thinkingLevel}" is not supported for ${effectiveProvider}/${effectiveModel} (use ${formatThinkingLevels(effectiveProvider, effectiveModel, "|", thinkingCatalog, thinkingRuntime)})`);
				// thinking-preserve-on-switch-v1: a model-only patch keeps the stored level; runs clamp it per turn.
			}
		}
	}
	const contextWindowPatch = await applySessionContextWindowPatch({
		defaultModel: resolvedDefault.model,
		defaultProvider: resolvedDefault.provider,
		loadModelCatalog: loadPreparedModelCatalogForPatch,
		next,
		patch
	});
	if (!contextWindowPatch.ok) return invalid(contextWindowPatch.error);
	if ("thinkingLevel" in patch && !("model" in patch) && next.modelFallback?.source === "agent-patch") next.modelFallback.prevThinkingLevel = next.thinkingLevel;
	if ("contextWindow" in patch && !("model" in patch) && next.modelFallback?.source === "agent-patch") next.modelFallback.prevContextWindow = next.contextWindow;
	if ("sendPolicy" in patch) {
		const raw = patch.sendPolicy;
		if (raw === null) delete next.sendPolicy;
		else if (raw !== void 0) {
			const normalized = normalizeSendPolicy(raw);
			if (!normalized) return invalid("invalid sendPolicy (use \"allow\"|\"deny\")");
			next.sendPolicy = normalized;
		}
	}
	if ("groupActivation" in patch) {
		const raw = patch.groupActivation;
		if (raw === null) delete next.groupActivation;
		else if (raw !== void 0) {
			const normalized = normalizeGroupActivation(raw);
			if (!normalized) return invalid("invalid groupActivation (use \"mention\"|\"always\")");
			next.groupActivation = normalized;
		}
	}
	if (!existing?.sessionId) delete next.liveModelSwitchPending;
	return {
		ok: true,
		entry: next
	};
}
//#endregion
export { resolveSessionPatchModelSelection as n, projectSessionsPatchEntry as t };
