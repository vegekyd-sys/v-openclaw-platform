import { c as getLeasedSharedCodexAppServerClient, h as releaseLeasedSharedCodexAppServerClient } from "./shared-client-DxcfF9KX.js";
import { A as isCodexFastServiceTier } from "./config-BhmfC1s6.js";
import { o as isCodexAppServerNativeAuthProfile, r as bindingStoreKey, s as normalizeCodexAppServerBindingModelProvider } from "./session-binding-BHuTCRZQ.js";
import { E as resolveCodexAppServerRequestModelSelection, O as resolveCodexBindingModelProviderFallback } from "./thread-lifecycle-DAcEJ_Om.js";
import { a as formatCodexDisplayText } from "./command-formatters-CLHhEB1Q.js";
import { n as resolveCodexBindingAppServerConnection } from "./binding-connection-E6uDsPlx.js";
import { asOptionalRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
import { resolveAgentDir } from "openclaw/plugin-sdk/agent-runtime";
import { getSessionEntry, patchSessionEntry, resolveStorePath } from "openclaw/plugin-sdk/session-store-runtime";
import { ModelSelectionLockedError, applyModelOverrideWithAuthProfileCompatibility } from "openclaw/plugin-sdk/model-session-runtime";
//#region extensions/codex/src/command-authorization.ts
const CODEX_NATIVE_EXECUTION_AUTH_ERROR = "Only an owner or operator.admin can control Codex native execution.";
const CODEX_HOST_INSPECTION_AUTH_ERROR = "Only an owner or operator.admin can inspect Codex host state.";
const CODEX_FULL_PERMISSIONS_AUTH_ERROR = "Full Codex permissions require operator.admin. Choose Admin in the Control UI permission picker, or use an admin-authenticated CLI.";
function hasCodexAdminScope(ctx) {
	return ctx.gatewayClientScopes?.includes("operator.admin") === true;
}
function canMutateCodexHost(ctx) {
	return ctx.senderIsOwner === true || hasCodexAdminScope(ctx);
}
//#endregion
//#region extensions/codex/src/conversation-control.ts
const CODEX_CONVERSATION_CONTROL_STATE = Symbol.for("openclaw.codex.conversationControl");
function getActiveTurns() {
	const globalState = globalThis;
	globalState[CODEX_CONVERSATION_CONTROL_STATE] ??= /* @__PURE__ */ new Map();
	return globalState[CODEX_CONVERSATION_CONTROL_STATE];
}
function trackCodexConversationActiveTurn(active) {
	const activeTurns = getActiveTurns();
	const key = bindingStoreKey(active.identity);
	activeTurns.set(key, active);
	return () => {
		if (activeTurns.get(key)?.turnId === active.turnId) activeTurns.delete(key);
	};
}
function readCodexConversationActiveTurn(identity) {
	return getActiveTurns().get(bindingStoreKey(identity));
}
async function stopCodexConversationTurn(params) {
	const active = readCodexConversationActiveTurn(params.identity);
	if (!active) return {
		stopped: false,
		message: "No active Codex run to stop."
	};
	const lookup = buildBindingLookup(params);
	const binding = await params.bindingStore.read(params.identity);
	if (binding?.threadId !== active.threadId) return {
		stopped: false,
		message: "The active Codex run no longer matches this session binding."
	};
	const connection = resolveCodexBindingAppServerConnection({
		binding,
		authProfileId: binding?.authProfileId,
		pluginConfig: params.pluginConfig
	});
	const runtime = connection.appServer;
	const client = active.client ?? await getLeasedSharedCodexAppServerClient({
		startOptions: runtime.start,
		timeoutMs: runtime.requestTimeoutMs,
		authProfileId: connection.clientAuthProfileId,
		...lookup
	});
	try {
		await client.request("turn/interrupt", {
			threadId: active.threadId,
			turnId: active.turnId
		}, { timeoutMs: runtime.requestTimeoutMs });
	} finally {
		if (!active.client) releaseLeasedSharedCodexAppServerClient(client);
	}
	return {
		stopped: true,
		message: "Codex stop requested."
	};
}
async function steerCodexConversationTurn(params) {
	const active = readCodexConversationActiveTurn(params.identity);
	const text = params.message.trim();
	if (!text) return {
		steered: false,
		message: "Usage: /codex steer <message>"
	};
	if (!active) return {
		steered: false,
		message: "No active Codex run to steer."
	};
	const lookup = buildBindingLookup(params);
	const binding = await params.bindingStore.read(params.identity);
	if (binding?.threadId !== active.threadId) return {
		steered: false,
		message: "The active Codex run no longer matches this session binding."
	};
	const connection = resolveCodexBindingAppServerConnection({
		binding,
		authProfileId: binding?.authProfileId,
		pluginConfig: params.pluginConfig
	});
	const runtime = connection.appServer;
	const client = active.client ?? await getLeasedSharedCodexAppServerClient({
		startOptions: runtime.start,
		timeoutMs: runtime.requestTimeoutMs,
		authProfileId: connection.clientAuthProfileId,
		...lookup
	});
	try {
		await client.request("turn/steer", {
			threadId: active.threadId,
			expectedTurnId: active.turnId,
			input: [{
				type: "text",
				text,
				text_elements: []
			}]
		}, { timeoutMs: runtime.requestTimeoutMs });
	} finally {
		if (!active.client) releaseLeasedSharedCodexAppServerClient(client);
	}
	return {
		steered: true,
		message: "Sent steer message to Codex."
	};
}
async function setCodexConversationModel(params) {
	const model = params.model.trim();
	if (!model) return "Usage: /codex model <model>";
	const lookup = buildBindingLookup(params);
	const binding = await requireThreadBinding(params.bindingStore, params.identity);
	if (binding.connectionScope === "supervision") throw new ModelSelectionLockedError();
	const modelProvider = resolveConversationControlModelProvider({
		authProfileId: binding.authProfileId,
		bindingModel: binding.model,
		bindingModelProvider: binding.modelProvider,
		currentModel: model,
		...lookup
	});
	const modelSelection = resolveCodexAppServerRequestModelSelection({
		model,
		modelProvider,
		authProfileId: binding.authProfileId,
		...lookup
	});
	const nextModelProvider = normalizeCodexAppServerBindingModelProvider({
		authProfileId: binding.authProfileId,
		modelProvider: modelSelection.modelProvider,
		...lookup
	});
	const nextModel = modelSelection.model;
	const modelChanged = nextModel !== binding.model || nextModelProvider !== binding.modelProvider;
	const projectionPatch = modelChanged && binding.contextEngine?.projection ? { contextEngine: {
		...binding.contextEngine,
		projection: void 0
	} } : {};
	const identity = params.identity;
	if (identity.kind === "session" && identity.sessionKey) {
		if (!await patchSessionEntry({
			agentId: identity.agentId,
			storePath: resolveStorePath(params.config?.session?.store, { agentId: identity.agentId }),
			sessionKey: identity.sessionKey,
			requireWriteSuccess: true,
			replaceEntry: true,
			update: (entry) => {
				if (entry.sessionId !== identity.sessionId) throw new Error("Codex session changed while applying the model selection.");
				applyModelOverrideWithAuthProfileCompatibility({
					cfg: params.config ?? {},
					agentDir: params.agentDir ?? resolveAgentDir(params.config ?? {}, identity.agentId),
					entry,
					currentProvider: binding.modelProvider ?? "openai",
					selection: {
						provider: nextModelProvider ?? "openai",
						model: nextModel
					},
					markLiveSwitchPending: true
				});
				return entry;
			}
		})) throw new Error("Codex session changed while applying the model selection.");
		if (modelChanged && binding.contextEngine?.projection) await patchThreadBinding(params.bindingStore, identity, binding.threadId, projectionPatch);
	} else await patchThreadBinding(params.bindingStore, params.identity, binding.threadId, {
		model: nextModel,
		modelProvider: nextModelProvider,
		...projectionPatch
	});
	return `Codex model set to ${formatCodexDisplayText(nextModel)}.`;
}
async function setCodexConversationFastMode(params) {
	const binding = await requireThreadBinding(params.bindingStore, params.identity);
	if (params.enabled == null) return `Codex fast mode: ${isCodexFastServiceTier(binding.serviceTier) ? "on" : "off"}.`;
	const serviceTier = params.enabled ? "priority" : "flex";
	await patchThreadBinding(params.bindingStore, params.identity, binding.threadId, { serviceTier });
	return `Codex fast mode ${params.enabled ? "enabled" : "disabled"}.`;
}
async function setCodexConversationPermissions(params) {
	const storePath = resolveStorePath(params.config?.session?.store, { agentId: params.session.agentId });
	if (!params.mode) {
		const entry = getSessionEntry({
			agentId: params.session.agentId,
			hydrateSkillPromptRefs: false,
			readConsistency: "latest",
			sessionKey: params.session.sessionKey,
			storePath
		});
		if (entry?.sessionId !== params.session.sessionId) throw new Error("Codex session changed while reading the permission mode.");
		return `Codex permissions: ${formatPermissionsMode(entry.permissionMode)}.`;
	}
	if (!await patchSessionEntry({
		agentId: params.session.agentId,
		storePath,
		sessionKey: params.session.sessionKey,
		requireWriteSuccess: true,
		replaceEntry: true,
		update: (entry) => {
			if (entry.sessionId !== params.session.sessionId) throw new Error("Codex session changed while applying the permission mode.");
			entry.permissionMode = params.mode === "yolo" ? "full" : "guarded";
			return entry;
		}
	})) throw new Error("Codex session changed while applying the permission mode.");
	return `Codex permissions set to ${params.mode === "yolo" ? "full access" : "guarded"}.`;
}
function parseCodexFastModeArg(arg) {
	const normalized = arg?.trim().toLowerCase();
	if (!normalized || normalized === "status") return;
	if (normalized === "on" || normalized === "true" || normalized === "fast") return true;
	if (normalized === "off" || normalized === "false" || normalized === "flex") return false;
}
function parseCodexPermissionsModeArg(arg) {
	const normalized = arg?.trim().toLowerCase();
	if (!normalized || normalized === "status") return;
	if (normalized === "yolo" || normalized === "full" || normalized === "full-access") return "yolo";
	if ([
		"default",
		"guardian",
		"guarded",
		"approve"
	].includes(normalized)) return "default";
}
function formatPermissionsMode(mode) {
	return mode === "full" ? "full access" : mode ?? "default";
}
async function requireThreadBinding(bindingStore, identity) {
	const binding = await bindingStore.read(identity);
	if (!binding?.threadId) throw new Error("No Codex thread is attached to this OpenClaw session yet.");
	return binding;
}
async function patchThreadBinding(bindingStore, identity, threadId, patch) {
	if (!await bindingStore.mutate(identity, {
		kind: "patch",
		threadId,
		patch
	})) throw new Error("Codex thread binding changed while applying the control update.");
}
function buildBindingLookup(params) {
	const agentDir = params.agentDir?.trim();
	return {
		...agentDir ? { agentDir } : {},
		...params.config ? { config: params.config } : {}
	};
}
function resolveConversationControlModelProvider(params) {
	const modelProvider = resolveCodexBindingModelProviderFallback({
		currentModel: params.currentModel,
		bindingModel: params.bindingModel,
		bindingModelProvider: params.bindingModelProvider
	})?.trim();
	if (!modelProvider || modelProvider.toLowerCase() === "codex") return;
	if (isCodexAppServerNativeAuthProfile(params) && modelProvider.toLowerCase() === "openai") return;
	return modelProvider.toLowerCase() === "openai" ? "openai" : modelProvider;
}
//#endregion
//#region extensions/codex/src/plugin-marketplace-discovery.ts
/** Read-only discovery of Codex-owned local, curated, and remote plugin marketplaces. */
const PLUGIN_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_PLUGIN_DESCRIPTION_LENGTH = 160;
const SUPPLEMENTAL_MARKETPLACE_KINDS = [
	"workspace-directory",
	"shared-with-me",
	"created-by-me-remote",
	"vertical"
];
/** Validates the same identifier segments required by Codex's stable PluginId parser. */
function parseCodexPluginMarketplaceId(value) {
	const separator = value.lastIndexOf("@");
	if (separator <= 0 || separator === value.length - 1) return;
	const pluginName = value.slice(0, separator);
	const marketplaceName = value.slice(separator + 1);
	return PLUGIN_SEGMENT_PATTERN.test(pluginName) && PLUGIN_SEGMENT_PATTERN.test(marketplaceName) ? {
		pluginName,
		marketplaceName
	} : void 0;
}
/** Lists local/global first and separately requests workspace, shared, and personal catalogs. */
async function discoverCodexMarketplacePlugins(params) {
	const requestParams = { cwds: [params.workspaceDir] };
	const primary = await params.request(requestParams);
	const warnings = (primary.marketplaceLoadErrors ?? []).map((error) => boundedCatalogText(error.message));
	const marketplaces = [...primary.marketplaces];
	try {
		const supplemental = await params.request({
			...requestParams,
			marketplaceKinds: [...SUPPLEMENTAL_MARKETPLACE_KINDS]
		});
		marketplaces.push(...supplemental.marketplaces);
		warnings.push(...(supplemental.marketplaceLoadErrors ?? []).map((error) => boundedCatalogText(error.message)));
	} catch (error) {
		let recoveredSupplementalMarketplace = false;
		for (const kind of SUPPLEMENTAL_MARKETPLACE_KINDS) try {
			const supplemental = await params.request({
				...requestParams,
				marketplaceKinds: [kind]
			});
			marketplaces.push(...supplemental.marketplaces);
			recoveredSupplementalMarketplace ||= supplemental.marketplaces.length > 0;
			warnings.push(...(supplemental.marketplaceLoadErrors ?? []).map((loadError) => boundedCatalogText(loadError.message)));
		} catch (kindError) {
			warnings.push(boundedCatalogText(`${kind} marketplace unavailable: ${kindError instanceof Error ? kindError.message : String(kindError)}`));
		}
		if (!recoveredSupplementalMarketplace && warnings.length === 0) warnings.push(boundedCatalogText(`Additional marketplaces could not be listed: ${error instanceof Error ? error.message : String(error)}`));
	}
	const discovered = /* @__PURE__ */ new Map();
	const ambiguous = /* @__PURE__ */ new Set();
	for (const marketplace of marketplaces) {
		if (!PLUGIN_SEGMENT_PATTERN.test(marketplace.name)) continue;
		for (const summary of marketplace.plugins) {
			const pluginName = pluginSlug(summary, marketplace.name);
			if (!pluginName) continue;
			const id = `${pluginName}@${marketplace.name}`;
			if (ambiguous.has(id)) continue;
			const previous = discovered.get(id);
			const next = {
				id,
				pluginName,
				marketplaceName: marketplace.name,
				installed: summary.installed,
				enabled: summary.enabled,
				available: summary.availability !== "DISABLED_BY_ADMIN" && summary.installPolicy !== "NOT_AVAILABLE",
				...summary.installPolicy ? { installPolicy: summary.installPolicy } : {},
				...summary.authPolicy ? { authPolicy: summary.authPolicy } : {},
				...marketplace.path ? { marketplacePath: marketplace.path } : {},
				...summary.remotePluginId?.trim() ? {
					remotePluginId: summary.remotePluginId.trim(),
					mustShowInstallationInterstitial: summary.mustShowInstallationInterstitial ?? null
				} : {},
				summaryId: summary.id
			};
			const description = pluginDescription(summary);
			if (description) next.description = description;
			if (previous && (previous.marketplacePath !== next.marketplacePath || previous.remotePluginId !== next.remotePluginId)) {
				discovered.delete(id);
				ambiguous.add(id);
				warnings.push(`Multiple discovered plugins share ${id}; installation requires a unique identity.`);
				continue;
			}
			if (!previous) discovered.set(id, next);
			else {
				const preferred = !previous.installed && next.installed || !previous.enabled && next.installed && next.enabled ? next : previous;
				discovered.set(id, {
					...preferred,
					available: previous.available && next.available,
					...preferred.remotePluginId ? { mustShowInstallationInterstitial: previous.mustShowInstallationInterstitial === true || next.mustShowInstallationInterstitial === true ? true : previous.mustShowInstallationInterstitial === false && next.mustShowInstallationInterstitial === false ? false : null } : {},
					...previous.installPolicy === "NOT_AVAILABLE" || next.installPolicy === "NOT_AVAILABLE" ? { installPolicy: "NOT_AVAILABLE" } : {}
				});
			}
		}
	}
	return {
		plugins: [...discovered.values()].toSorted((left, right) => left.id.localeCompare(right.id)),
		warnings
	};
}
function pluginSlug(summary, marketplaceName) {
	const qualified = parseCodexPluginMarketplaceId(summary.id);
	if (qualified?.marketplaceName === marketplaceName) return qualified.pluginName;
	const identitySegment = summary.id.split("/").at(-1);
	if (identitySegment && PLUGIN_SEGMENT_PATTERN.test(identitySegment)) return identitySegment;
	return PLUGIN_SEGMENT_PATTERN.test(summary.name) ? summary.name : void 0;
}
function pluginDescription(summary) {
	const description = asOptionalRecord(summary.interface)?.shortDescription;
	if (typeof description !== "string") return;
	return boundedCatalogText(description) || void 0;
}
function boundedCatalogText(value) {
	let sanitized = "";
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		sanitized += codePoint !== void 0 && (codePoint <= 31 || codePoint >= 127 && codePoint <= 159) ? " " : character;
	}
	return sanitized.replace(/\s+/g, " ").trim().slice(0, MAX_PLUGIN_DESCRIPTION_LENGTH);
}
//#endregion
export { hasCodexAdminScope as _, parseCodexPermissionsModeArg as a, setCodexConversationModel as c, stopCodexConversationTurn as d, trackCodexConversationActiveTurn as f, canMutateCodexHost as g, CODEX_NATIVE_EXECUTION_AUTH_ERROR as h, parseCodexFastModeArg as i, setCodexConversationPermissions as l, CODEX_HOST_INSPECTION_AUTH_ERROR as m, parseCodexPluginMarketplaceId as n, readCodexConversationActiveTurn as o, CODEX_FULL_PERMISSIONS_AUTH_ERROR as p, formatPermissionsMode as r, setCodexConversationFastMode as s, discoverCodexMarketplacePlugins as t, steerCodexConversationTurn as u };
