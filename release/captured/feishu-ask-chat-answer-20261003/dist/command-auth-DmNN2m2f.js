import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { d as normalizeStringEntries } from "./string-normalization-DiSb4JeN.js";
import "./registry-DCugu7x1.js";
import { t as normalizeAnyChannelId } from "./registry-normalize-CY8V_nbx.js";
import { i as listLoadedChannelPlugins, t as getLoadedChannelPluginById } from "./registry-loaded-CWEKVWPu.js";
import { t as INTERNAL_MESSAGE_CHANNEL } from "./message-channel-constants-2zSoJXQC.js";
import { n as normalizeMessageChannel } from "./message-channel-core-D0_xUNNr.js";
import { a as isInternalMessageChannel } from "./message-channel-BGKf9KPa.js";
import { t as resolveAccountEntry } from "./account-lookup-CvFhSs3G.js";
//#region src/auto-reply/sender-identity.ts
/** Shared sender identity helpers for authorization checks. */
function isConversationLikeIdentity(value) {
	const normalized = normalizeOptionalLowercaseString(value);
	if (!normalized) return false;
	if (normalized.startsWith("chat_id:")) return true;
	return /(^|:)(channel|group|thread|topic|room|space|spaces):/.test(normalized);
}
function shouldUseFromAsSenderFallback(params) {
	const from = normalizeOptionalString(params.from) ?? "";
	if (!from) return false;
	const chatType = normalizeLowercaseStringOrEmpty(params.chatType);
	if (chatType && chatType !== "direct") return false;
	return !isConversationLikeIdentity(from);
}
//#endregion
//#region src/auto-reply/command-auth.ts
/** Command authorization helpers for owner and allowlist checks. */
function resolveProviderFromContext(ctx, cfg) {
	const explicitMessageChannels = [
		ctx.Surface,
		ctx.OriginatingChannel,
		ctx.Provider
	].map((value) => normalizeMessageChannel(value)).filter((value) => Boolean(value));
	const explicitMessageChannel = explicitMessageChannels.find((value) => value !== INTERNAL_MESSAGE_CHANNEL);
	if (!explicitMessageChannel && explicitMessageChannels.includes("webchat")) return {
		providerId: void 0,
		hadResolutionError: false
	};
	const direct = normalizeAnyChannelId(explicitMessageChannel ?? void 0) ?? explicitMessageChannel ?? normalizeAnyChannelId(ctx.Provider) ?? normalizeAnyChannelId(ctx.Surface) ?? normalizeAnyChannelId(ctx.OriginatingChannel);
	if (direct) return {
		providerId: direct,
		hadResolutionError: false
	};
	const candidates = [ctx.From, ctx.To].filter((value) => Boolean(value?.trim())).flatMap((value) => value.split(":").map((part) => part.trim()));
	for (const candidate of candidates) {
		const normalizedCandidateChannel = normalizeMessageChannel(candidate);
		if (normalizedCandidateChannel === "webchat") return {
			providerId: void 0,
			hadResolutionError: false
		};
		const normalized = normalizeAnyChannelId(normalizedCandidateChannel ?? void 0) ?? normalizedCandidateChannel ?? normalizeAnyChannelId(candidate);
		if (normalized) return {
			providerId: normalized,
			hadResolutionError: false
		};
	}
	const inferredProviders = probeInferredProviders(ctx, cfg);
	const inferred = inferredProviders.candidates[0];
	if (inferredProviders.candidates.length === 1 && inferred) return inferred;
	return {
		providerId: void 0,
		hadResolutionError: inferredProviders.droppedResolutionError || inferredProviders.candidates.some((entry) => entry.hadResolutionError)
	};
}
function probeInferredProviders(ctx, cfg) {
	let droppedResolutionError = false;
	const candidates = [];
	for (const plugin of listLoadedChannelPlugins()) {
		const resolved = resolveProviderAllowFrom({
			plugin,
			cfg,
			accountId: ctx.AccountId
		});
		if (resolved.allowFromList.length > 0) candidates.push({
			providerId: plugin.id,
			hadResolutionError: resolved.hadResolutionError
		});
		else if (resolved.hadResolutionError) droppedResolutionError = true;
	}
	return {
		candidates,
		droppedResolutionError
	};
}
function formatAllowFromList(params) {
	const { plugin, cfg, accountId, allowFrom } = params;
	if (!allowFrom || allowFrom.length === 0) return [];
	if (plugin?.config?.formatAllowFrom) return plugin.config.formatAllowFrom({
		cfg,
		accountId,
		allowFrom
	});
	return normalizeStringEntries(allowFrom);
}
function normalizeAllowFromEntry(params) {
	return formatAllowFromList({
		...params,
		allowFrom: [params.value]
	}).filter((entry) => Boolean(entry.trim()));
}
function isWildcardAllowFromEntry(entry) {
	return entry.trim() === "*";
}
function hasWildcardAllowFrom(list) {
	return list.some((entry) => isWildcardAllowFromEntry(entry));
}
function stripWildcardAllowFrom(list) {
	return list.filter((entry) => !isWildcardAllowFromEntry(entry));
}
function resolveProviderAllowFrom(params) {
	const { plugin, cfg, accountId } = params;
	const providerId = params.forceFallbackResolutionError ? params.providerId ?? plugin?.id : plugin?.id;
	const resolveFallback = () => resolveFallbackAllowFrom({
		cfg,
		providerId,
		accountId
	});
	let hadResolutionError = Boolean(params.forceFallbackResolutionError);
	let allowFrom;
	if (hadResolutionError || !plugin?.config?.resolveAllowFrom) allowFrom = resolveFallback();
	else try {
		const resolved = plugin.config.resolveAllowFrom({
			cfg,
			accountId
		});
		if (resolved == null || Array.isArray(resolved)) allowFrom = resolved ?? [];
		else {
			console.warn(`[command-auth] resolveAllowFrom returned an invalid allowFrom for provider "${providerId}", falling back to config allowFrom: invalid_result`);
			hadResolutionError = true;
			allowFrom = resolveFallback();
		}
	} catch (err) {
		console.warn(`[command-auth] resolveAllowFrom threw for provider "${providerId}", falling back to config allowFrom: ${describeAllowFromResolutionError(err)}`);
		hadResolutionError = true;
		allowFrom = resolveFallback();
	}
	return {
		allowFrom,
		allowFromList: formatAllowFromList({
			plugin,
			cfg,
			accountId,
			allowFrom
		}),
		hadResolutionError
	};
}
function describeAllowFromResolutionError(err) {
	if (err instanceof Error) return (normalizeOptionalString(err.name) ?? "") || "Error";
	return "unknown_error";
}
function resolveOwnerAllowFromList(params) {
	const raw = params.allowFrom ?? params.cfg.commands?.ownerAllowFrom;
	if (!Array.isArray(raw) || raw.length === 0) return [];
	const filtered = [];
	for (const entry of raw) {
		const trimmed = normalizeOptionalString(String(entry ?? "")) ?? "";
		if (!trimmed) continue;
		const separatorIndex = trimmed.indexOf(":");
		if (separatorIndex > 0) {
			const prefix = trimmed.slice(0, separatorIndex);
			const channel = normalizeAnyChannelId(prefix);
			if (channel) {
				if (!params.providerId || channel !== params.providerId) continue;
				const remainder = trimmed.slice(separatorIndex + 1).trim();
				if (remainder) filtered.push(remainder);
				continue;
			}
		}
		filtered.push(trimmed);
	}
	return formatAllowFromList({
		...params,
		allowFrom: filtered
	});
}
/**
* Resolves the commands.allowFrom list for a given provider.
* Returns the provider-specific list if defined, otherwise the "*" global list.
* Returns null if commands.allowFrom is not configured at all (fall back to channel allowFrom).
*/
function resolveCommandsAllowFromList(params) {
	const commandsAllowFrom = params.cfg.commands?.allowFrom;
	if (!commandsAllowFrom || typeof commandsAllowFrom !== "object") return null;
	const providerList = commandsAllowFrom[params.providerId ?? ""];
	const globalList = commandsAllowFrom["*"];
	const rawList = Array.isArray(providerList) ? providerList : globalList;
	if (!Array.isArray(rawList)) return null;
	return formatAllowFromList({
		...params,
		allowFrom: rawList
	});
}
function resolveOwnerCandidatesForCommands(params) {
	if (params.allowAll) return [];
	const ownerCandidatesForCommands = stripWildcardAllowFrom(params.allowFromList);
	if (ownerCandidatesForCommands.length > 0 || !params.to) return ownerCandidatesForCommands;
	return normalizeAllowFromEntry({
		...params,
		value: params.to
	});
}
function resolveOwnerAuthorizationState(params) {
	const configOwnerAllowFromList = resolveOwnerAllowFromList({
		...params,
		allowFrom: params.configOwnerAllowFrom
	});
	const contextOwnerAllowFromList = resolveOwnerAllowFromList({
		...params,
		allowFrom: params.contextOwnerAllowFrom
	});
	const allowAll = !params.hadResolutionError && (params.allowFromList.length === 0 || hasWildcardAllowFrom(params.allowFromList));
	const channelCommandOwners = resolveOwnerCandidatesForCommands({
		...params,
		allowAll
	});
	const explicitOwners = Array.from(new Set(stripWildcardAllowFrom(configOwnerAllowFromList)));
	const contextCommandOwners = stripWildcardAllowFrom(contextOwnerAllowFromList);
	return {
		commandOwnerCandidates: Array.from(new Set(explicitOwners.length > 0 ? explicitOwners : contextCommandOwners.length > 0 ? contextCommandOwners : channelCommandOwners)),
		explicitOwners
	};
}
function resolveCommandSenderAuthorization(params) {
	if (params.enforceOwnerForCommands && !params.isOwnerForCommands) return "denied";
	if (params.commandsAllowFromList !== null || params.providerResolutionError && params.commandsAllowFromConfigured) {
		const commandsAllowFromList = params.commandsAllowFromList;
		const commandsAllowAll = !params.providerResolutionError && Boolean(commandsAllowFromList && hasWildcardAllowFrom(commandsAllowFromList));
		const matchedCommandsAllowFrom = commandsAllowFromList?.length ? params.senderCandidates.find((candidate) => commandsAllowFromList.includes(candidate)) : void 0;
		if (params.providerResolutionError || !(commandsAllowAll || Boolean(matchedCommandsAllowFrom))) return "denied";
        // FEISHU_MODEL_COMMAND_ONLY_V2: non-owner Feishu senders may use /model, not the full command set.
        if (params.providerId === "feishu" && !params.senderIsOwner) return /^[ \t]*\/model(?:[ \t]+[^\r\n]*)?[ \t]*$/i.test(params.commandText ?? "") ? "commands" : "reset-only";
        return "commands";
	}
	if (!params.commandAuthorized) return "denied";
	return params.isOwnerForCommands ? "commands" : "reset-only";
}
function resolveSenderCandidates(params) {
	const { plugin, cfg, accountId } = params;
	const candidates = [];
	const pushCandidate = (value) => {
		const trimmed = normalizeOptionalString(value) ?? "";
		if (!trimmed) return;
		candidates.push(trimmed);
	};
	if (plugin?.commands?.preferSenderE164ForCommands) {
		pushCandidate(params.senderE164);
		pushCandidate(params.senderId);
	} else {
		pushCandidate(params.senderId);
		pushCandidate(params.senderE164);
	}
	if (candidates.length === 0 && shouldUseFromAsSenderFallback({
		from: params.from,
		chatType: params.chatType
	})) pushCandidate(params.from);
	const normalized = [];
	for (const sender of candidates) {
		const entries = normalizeAllowFromEntry({
			plugin,
			cfg,
			accountId,
			value: sender
		});
		for (const entry of entries) if (!normalized.includes(entry)) normalized.push(entry);
	}
	return normalized;
}
function resolveFallbackAllowFrom(params) {
	const providerId = normalizeOptionalString(params.providerId);
	if (!providerId) return [];
	const channelCfg = params.cfg.channels?.[providerId];
	const accountCfg = resolveFallbackAccountConfig(channelCfg?.accounts, params.accountId) ?? resolveFallbackDefaultAccountConfig(channelCfg);
	const allowFrom = accountCfg?.allowFrom ?? accountCfg?.dm?.allowFrom ?? channelCfg?.allowFrom ?? channelCfg?.dm?.allowFrom;
	return Array.isArray(allowFrom) ? allowFrom : [];
}
function resolveFallbackAccountConfig(accounts, accountId) {
	const normalizedAccountId = normalizeOptionalLowercaseString(accountId);
	if (!accounts || !normalizedAccountId) return;
	return accounts[normalizedAccountId] ?? resolveAccountEntry(accounts, normalizedAccountId);
}
function resolveFallbackDefaultAccountConfig(channelCfg) {
	const accounts = channelCfg?.accounts;
	if (!accounts) return;
	const preferred = resolveFallbackAccountConfig(accounts, channelCfg?.defaultAccount) ?? resolveFallbackAccountConfig(accounts, "default");
	if (preferred) return preferred;
	const definedAccounts = Object.values(accounts).filter(Boolean);
	return definedAccounts.length === 1 ? definedAccounts[0] : void 0;
}
function resolveCommandAuthorizationState(params) {
	const { ctx, cfg, commandAuthorized } = params;
	const { providerId, hadResolutionError: providerResolutionError } = resolveProviderFromContext(ctx, cfg);
	const plugin = providerId ? getLoadedChannelPluginById(providerId) ?? void 0 : void 0;
	const from = normalizeOptionalString(ctx.From) ?? "";
	const to = normalizeOptionalString(ctx.To) ?? "";
	const commandsAllowFromConfigured = Boolean(cfg.commands?.allowFrom && typeof cfg.commands.allowFrom === "object");
	const commandsAllowFromList = resolveCommandsAllowFromList({
		plugin,
		cfg,
		accountId: ctx.AccountId,
		providerId
	});
	const resolvedAllowFrom = resolveProviderAllowFrom({
		plugin,
		cfg,
		accountId: ctx.AccountId,
		providerId,
		forceFallbackResolutionError: providerResolutionError
	});
	const ownerState = resolveOwnerAuthorizationState({
		plugin,
		cfg,
		accountId: ctx.AccountId,
		providerId,
		to,
		allowFromList: resolvedAllowFrom.allowFromList,
		hadResolutionError: resolvedAllowFrom.hadResolutionError,
		configOwnerAllowFrom: cfg.commands?.ownerAllowFrom,
		contextOwnerAllowFrom: ctx.OwnerAllowFrom
	});
	const senderCandidates = resolveSenderCandidates({
		plugin,
		cfg,
		accountId: ctx.AccountId,
		senderId: ctx.SenderId,
		senderE164: ctx.SenderE164,
		from,
		chatType: ctx.ChatType
	});
	const matchedSender = ownerState.explicitOwners.length ? senderCandidates.find((candidate) => ownerState.explicitOwners.includes(candidate)) : void 0;
	const matchedCommandOwner = ownerState.commandOwnerCandidates.length ? senderCandidates.find((candidate) => ownerState.commandOwnerCandidates.includes(candidate)) : void 0;
	const senderId = matchedSender ?? matchedCommandOwner ?? senderCandidates[0];
	const enforceOwner = Boolean(plugin?.commands?.enforceOwnerForCommands);
	const senderIsOwnerByIdentity = Boolean(matchedSender);
	const senderIsOwnerByScope = isInternalMessageChannel(ctx.Provider) && Array.isArray(ctx.GatewayClientScopes) && ctx.GatewayClientScopes.includes("operator.admin");
	const ownerAllowlistConfigured = ownerState.explicitOwners.length > 0;
	const senderIsOwner = senderIsOwnerByIdentity || senderIsOwnerByScope;
	const access = resolveCommandSenderAuthorization({
		commandAuthorized,
		providerId,
		senderIsOwner,
		commandText: ctx.commandText ?? ctx.Body ?? "",
		enforceOwnerForCommands: enforceOwner,
		isOwnerForCommands: !(enforceOwner || ownerAllowlistConfigured) ? true : ownerAllowlistConfigured ? senderIsOwner : senderIsOwnerByScope || Boolean(matchedCommandOwner),
		senderCandidates,
		commandsAllowFromList,
		providerResolutionError,
		commandsAllowFromConfigured
	});
	return {
		authorization: {
			providerId,
			ownerList: ownerState.explicitOwners,
			senderId: senderId || void 0,
			senderIsOwner,
			isAuthorizedSender: access === "commands",
			from: from || void 0,
			to: to || void 0
		},
		access
	};
}
function resolveCommandAuthorization(params) {
	return resolveCommandAuthorizationState(params).authorization;
}
/** Resolves reset admission without granting other command or owner authority. */
function isResetAuthorizedForContext(params) {
	if (resolveCommandAuthorizationState(params).access === "denied") return false;
	const provider = params.ctx.Provider;
	if (!(provider ? isInternalMessageChannel(provider) : isInternalMessageChannel(params.ctx.Surface))) return true;
	const scopes = params.ctx.GatewayClientScopes;
	if (!Array.isArray(scopes) || scopes.length === 0) return true;
	return scopes.includes("operator.admin");
}
//#endregion
export { resolveCommandAuthorization as n, shouldUseFromAsSenderFallback as r, isResetAuthorizedForContext as t };
