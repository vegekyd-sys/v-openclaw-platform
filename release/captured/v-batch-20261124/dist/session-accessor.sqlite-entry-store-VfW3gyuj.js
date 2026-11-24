import { s as asFiniteNumber } from "./number-coercion-CLj0HTDM.js";
import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import { a as asOptionalRecord, c as isRecord } from "./record-coerce-DItp3I4t.js";
import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { a as getChildLogger } from "./logger-Dj_CBJHF.js";
import { a as iterateSqliteQuerySync, i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { c as createSqliteLifecycleAggregateError } from "./state-database-coordinator-DKD8Uulb.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { r as normalizeOptionalAccountId } from "./account-id-CETVCrTz.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { n as getPluginRegistryState } from "./runtime-state-B4nZOuAi.js";
import { l as isAgentEventLifecycleGenerationCurrent, m as registerAgentEventLifecycleRotationHandler } from "./agent-events-Con5xUCM.js";
import { n as capturePluginLifecycleAuthority } from "./registry-lifecycle-yJcZYGGM.js";
import { a as getPluginRuntimeGatewayRequestScope, c as withPluginRuntimeGatewayRequestScope } from "./gateway-request-scope-CmMd3nUp.js";
import { A as hasValidSessionEntryIdentity, E as hasSessionPendingInputsSchema, O as buildConversationRef, b as ensureSessionParticipantsSchema, g as ensureOpenClawAgentProgressCardSchemaInTransaction, k as normalizeConversationPeerId, w as ensureSessionPendingInputsSchema } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { t as normalizeChatType } from "./chat-type-CG0X_HJM.js";
import { c as deferOpenClawAgentPostCommitPublication, g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { t as getPluginRuntimeGenerationRegistry } from "./generation-scope-CcvBHxkU.js";
import { r as isInternalNonDeliveryChannel } from "./message-channel-constants-2zSoJXQC.js";
import { n as normalizeMessageChannel } from "./message-channel-core-D0_xUNNr.js";
import { c as normalizeDeliveryContext, d as sessionDeliveryChannel, f as sessionDeliveryOrigin, l as normalizeSessionDeliveryState, n as deliveryContextFromSession, o as mergeDeliveryContext, p as sessionDeliveryRoute, t as deliveryContextFromChannelRoute } from "./delivery-context.shared-DlcU69m_.js";
import { t as normalizeInternalTurnContext } from "./internal-turn-source-CPy6lbaz.js";
import { t as resolveConversationLabel } from "./conversation-label-DYC5BXIh.js";
import { a as normalizeChannelId, n as getLoadedChannelPlugin } from "./registry-CkcjiYIl.js";
import "./plugins-BssTyOqH.js";
import "./message-channel-BGKf9KPa.js";
import { r as resolveGroupSessionKey, t as buildGroupDisplayName } from "./group-rofV1-qp.js";
import { c as projectCanonicalSessionEntryShape, l as stripRuntimeOnlySessionSkillsFields } from "./store-writer-state-_Y6b9Vjm.js";
import { a as normalizeStoreSessionKey, o as resolveDeliveryProvenCanonicalSessionKey, t as collectSessionEntryLookupKeys } from "./store-entry-CMuTqREZ.js";
import { a as normalizeSqliteSessionKey, i as getSessionKysely, m as toDatabaseOptions, p as runExclusiveSqliteSessionWrite } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { A as sessionEntryMetadataJson, E as parseSessionEntryJson, F as hasSqliteSessionOwnerColumns, M as projectSqliteSessionParticipants, N as mergeParticipantAggregate, O as selectSessionEntryRows, S as publishSessionEntryCacheInvalidation, T as normalizeStatus, b as normalizeSessionRowChatType, f as assertCanonicalSessionKeyWriteMatchesDatabase, k as sessionEntryInventoryJson, m as canonicalSessionKeyMigrationRequiredError, p as assertCanonicalSqliteSessionKeysCurrent, s as readTranscriptMutationStateInTransaction, u as assertCanonicalSessionEntryLineageWrite, w as trackSessionEntryCacheWrite, x as normalizeText } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { d as isCompetingSessionWorkAdmissionActive, h as runExclusiveSessionLifecycleMutation } from "./session-lifecycle-admission-siUq03Jk.js";
import { i as preserveCreationStamp } from "./session-entry-provenance-Ch9ZRplR.js";
import { isDeepStrictEqual } from "node:util";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
//#region src/config/sessions/metadata.ts
const mergeSessionOrigin = (existing, next) => {
	if (!existing && !next) return;
	const merged = existing ? { ...existing } : {};
	const nextProvider = next?.provider;
	const nextIsDeliverableChannel = nextProvider != null && nextProvider !== "webchat" && !isInternalNonDeliveryChannel(nextProvider);
	if (existing != null && nextIsDeliverableChannel && (existing.provider != null && nextProvider !== existing.provider || existing.surface != null && next?.surface != null && next.surface !== existing.surface || existing.accountId != null && next?.accountId != null && next.accountId !== existing.accountId)) {
		delete merged.nativeChannelId;
		delete merged.nativeDirectUserId;
		delete merged.avatar;
		delete merged.accountId;
		delete merged.threadId;
	}
	if (next?.label) merged.label = next.label;
	if (next?.provider) merged.provider = next.provider;
	if (next?.surface) merged.surface = next.surface;
	if (next?.chatType) merged.chatType = next.chatType;
	if (next?.from) merged.from = next.from;
	if (next?.to) merged.to = next.to;
	if (next?.nativeChannelId) merged.nativeChannelId = next.nativeChannelId;
	if (next?.nativeDirectUserId) merged.nativeDirectUserId = next.nativeDirectUserId;
	if (next?.avatar) merged.avatar = next.avatar;
	if (next?.accountId) merged.accountId = next.accountId;
	if (next?.threadId != null && next.threadId !== "") merged.threadId = next.threadId;
	return Object.keys(merged).length > 0 ? merged : void 0;
};
/** Derives session origin metadata from an inbound message context. */
function deriveSessionOrigin(ctx, opts) {
	if (opts?.skipSystemEventOrigin && ctx.InternalTurnSource !== void 0) return;
	const label = normalizeOptionalString(resolveConversationLabel(ctx));
	const providerRaw = typeof ctx.OriginatingChannel === "string" && ctx.OriginatingChannel || ctx.Surface || ctx.Provider;
	const provider = normalizeMessageChannel(providerRaw);
	const surface = normalizeOptionalLowercaseString(ctx.Surface);
	const chatType = normalizeChatType(ctx.ChatType) ?? void 0;
	const from = normalizeOptionalString(ctx.From);
	const to = normalizeOptionalString(typeof ctx.OriginatingTo === "string" ? ctx.OriginatingTo : ctx.To);
	const nativeChannelId = normalizeOptionalString(ctx.NativeChannelId);
	const nativeDirectUserId = normalizeOptionalString(ctx.NativeDirectUserId);
	const avatar = normalizeOptionalString(ctx.ConversationAvatar);
	const accountId = normalizeOptionalString(ctx.AccountId);
	const threadId = ctx.MessageThreadId ?? void 0;
	const origin = {};
	if (label) origin.label = label;
	if (provider) origin.provider = provider;
	if (surface) origin.surface = surface;
	if (chatType) origin.chatType = chatType;
	if (from) origin.from = from;
	if (to) origin.to = to;
	if (nativeChannelId) origin.nativeChannelId = nativeChannelId;
	if (nativeDirectUserId) origin.nativeDirectUserId = nativeDirectUserId;
	if (avatar) origin.avatar = avatar;
	if (accountId) origin.accountId = accountId;
	if (threadId != null && threadId !== "") origin.threadId = threadId;
	return Object.keys(origin).length > 0 ? origin : void 0;
}
function deriveGroupSessionPatch(params) {
	const resolution = params.groupResolution ?? resolveGroupSessionKey(params.ctx);
	if (!resolution?.channel) return null;
	const channel = resolution.channel;
	const subject = params.ctx.GroupSubject?.trim();
	const space = params.ctx.GroupSpace?.trim();
	const explicitChannel = params.ctx.GroupChannel?.trim();
	const subjectLooksChannel = Boolean(subject?.startsWith("#"));
	const normalizedChannel = subjectLooksChannel && resolution.chatType !== "channel" ? normalizeChannelId(channel) : null;
	const isChannelProvider = Boolean(normalizedChannel && getLoadedChannelPlugin(normalizedChannel)?.capabilities.chatTypes.includes("channel"));
	const nextGroupChannel = explicitChannel ?? (subjectLooksChannel && subject && (resolution.chatType === "channel" || isChannelProvider) ? subject : void 0);
	const nextSubject = nextGroupChannel ? void 0 : subject;
	const patch = {
		chatType: resolution.chatType ?? "group",
		groupId: resolution.id
	};
	if (nextSubject) {
		patch.subject = nextSubject;
		patch.groupChannel = void 0;
	}
	if (nextGroupChannel) {
		patch.groupChannel = nextGroupChannel;
		patch.subject = void 0;
	}
	if (space) patch.space = space;
	const displayName = buildGroupDisplayName({
		provider: channel,
		subject: nextSubject ?? (nextGroupChannel ? void 0 : params.existing?.subject),
		groupChannel: nextGroupChannel ?? (nextSubject ? void 0 : params.existing?.groupChannel),
		space: space ?? params.existing?.space,
		id: resolution.id,
		key: params.sessionKey
	});
	if (displayName) patch.displayName = displayName;
	return patch;
}
function deriveSessionMetaPatch(params) {
	const groupPatch = deriveGroupSessionPatch(params);
	const origin = deriveSessionOrigin(params.ctx, { skipSystemEventOrigin: params.skipSystemEventOrigin });
	if (!groupPatch && !origin) return null;
	const patch = groupPatch ? { ...groupPatch } : {};
	const existingOrigin = sessionDeliveryOrigin(params.existing);
	const mergedOrigin = mergeSessionOrigin(existingOrigin, origin);
	if (mergedOrigin) {
		if (!patch.chatType && mergedOrigin.chatType) patch.chatType = mergedOrigin.chatType;
		const nextProvider = origin?.provider;
		const nextOwnsExternalRoute = Boolean(nextProvider && nextProvider !== "webchat" && !isInternalNonDeliveryChannel(nextProvider));
		const existingRoute = sessionDeliveryRoute(params.existing);
		const existingRouteAccountId = existingRoute?.accountId ?? deliveryContextFromSession(params.existing)?.accountId;
		const freshRouteOwnsNextProvider = params.preserveExistingDeliveryRoute === true && nextProvider != null && existingRoute?.channel === nextProvider && (origin?.accountId == null || existingRouteAccountId === origin.accountId);
		const deliveryIdentityChanged = nextOwnsExternalRoute && !freshRouteOwnsNextProvider && (!existingOrigin || existingOrigin.provider != null && nextProvider !== existingOrigin.provider || existingOrigin.surface != null && origin?.surface != null && origin.surface !== existingOrigin.surface || existingOrigin.accountId != null && origin?.accountId != null && origin.accountId !== existingOrigin.accountId);
		patch.delivery = normalizeSessionDeliveryState({
			route: deliveryIdentityChanged ? void 0 : sessionDeliveryRoute(params.existing),
			context: deliveryIdentityChanged ? {
				channel: mergedOrigin.provider,
				to: mergedOrigin.to,
				accountId: mergedOrigin.accountId,
				threadId: mergedOrigin.threadId
			} : deliveryContextFromSession(params.existing),
			origin: mergedOrigin
		});
	}
	return Object.keys(patch).length > 0 ? patch : null;
}
function withoutThread(identity) {
	if (!identity || identity.threadId == null) return identity;
	const next = { ...identity };
	delete next.threadId;
	return next;
}
/**
* Derives the last-route/delivery patch for an inbound routing update. Route
* updates must not refresh activity timestamps; idle/daily reset evaluation
* relies on updatedAt from actual session turns (#49515). Shared by the file
* store and the SQLite accessor so both backends apply one routing policy.
*/
function deriveLastRoutePatch(params) {
	const { channel, to, accountId, threadId, ctx, existing } = params;
	const explicitContext = normalizeDeliveryContext(params.deliveryContext);
	const inlineContext = normalizeDeliveryContext({
		channel,
		to,
		accountId,
		threadId
	});
	const routeContext = deliveryContextFromChannelRoute(params.route);
	const mergedInput = mergeDeliveryContext(routeContext, mergeDeliveryContext(explicitContext, inlineContext));
	const explicitDeliveryContext = params.deliveryContext;
	const explicitThreadValue = (explicitDeliveryContext != null && Object.hasOwn(explicitDeliveryContext, "threadId") ? explicitDeliveryContext.threadId : void 0) ?? (threadId != null && threadId !== "" ? threadId : void 0);
	const clearThreadFromFallback = Boolean(routeContext?.channel || routeContext?.to || explicitContext?.channel || explicitContext?.to || inlineContext?.channel || inlineContext?.to) && explicitThreadValue == null;
	const fallbackContext = clearThreadFromFallback ? withoutThread(deliveryContextFromSession(existing)) : deliveryContextFromSession(existing);
	const existingOrigin = sessionDeliveryOrigin(existing);
	const fallbackOrigin = clearThreadFromFallback ? withoutThread(existingOrigin) : existingOrigin;
	const merged = mergeDeliveryContext(mergedInput, fallbackContext);
	const delivery = normalizeSessionDeliveryState({
		route: params.route,
		context: {
			channel: merged?.channel,
			to: merged?.to,
			accountId: merged?.accountId,
			threadId: merged?.threadId
		},
		origin: fallbackOrigin
	});
	const nextEntry = existing ? {
		...existing,
		delivery
	} : { delivery };
	const metaPatch = ctx ? deriveSessionMetaPatch({
		ctx,
		sessionKey: params.sessionKey,
		existing: nextEntry,
		groupResolution: params.groupResolution,
		preserveExistingDeliveryRoute: routeContext != null
	}) : null;
	const basePatch = { delivery };
	return metaPatch ? {
		...basePatch,
		...metaPatch
	} : basePatch;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-entry-equality.ts
var SqliteSessionMutationConflictError = class extends Error {
	constructor(operationLabel) {
		super(`SQLite session state changed while preparing ${operationLabel}`);
		this.name = "SqliteSessionMutationConflictError";
	}
};
function sqliteSessionEntriesEqual(left, right) {
	if (!left || !right) return left === right;
	const { participants: _leftParticipants, participantCount: _leftParticipantCount, ...leftEntry } = left;
	const { participants: _rightParticipants, participantCount: _rightParticipantCount, ...rightEntry } = right;
	return JSON.stringify(leftEntry) === JSON.stringify(rightEntry);
}
function sqliteLifecycleTargetSnapshotsEqual(left, right) {
	return left.length === right.length && left.every((row, index) => row.sessionKey === right[index]?.sessionKey && sqliteSessionEntriesEqual(row.entry, right[index]?.entry));
}
function assertLifecycleTargetSnapshotUnchanged(expected, current, operationLabel) {
	if (!sqliteLifecycleTargetSnapshotsEqual(expected, current)) throw new SqliteSessionMutationConflictError(operationLabel);
}
//#endregion
//#region src/config/sessions/conversation-route-context.ts
const MAX_ROUTE_CONTEXT_ID_LENGTH = 512;
const MAX_ROUTE_CONTEXT_ROLE_IDS = 256;
const MAX_STORED_ROUTE_CONTEXT_LENGTH = 14e4;
function normalizeBoundedId(value) {
	const normalized = normalizeOptionalString(value);
	return normalized && normalized.length <= MAX_ROUTE_CONTEXT_ID_LENGTH ? normalized : void 0;
}
function normalizeRoleIds(value) {
	if (value === void 0) return { valid: true };
	if (!Array.isArray(value) || value.length > MAX_ROUTE_CONTEXT_ROLE_IDS) return { valid: false };
	const roleIds = [];
	for (const item of value) {
		const roleId = normalizeBoundedId(item);
		if (!roleId) return { valid: false };
		roleIds.push(roleId);
	}
	const unique = [...new Set(roleIds)].toSorted();
	return unique.length > 0 ? {
		valid: true,
		value: unique
	} : { valid: true };
}
/** Parses the closed, bounded route facts used to replay configured routing precedence. */
function parseConversationRouteContext(value) {
	if (!isRecord(value)) return;
	const guildId = normalizeBoundedId(value.guildId);
	const peerId = normalizeBoundedId(value.peerId);
	const teamId = normalizeBoundedId(value.teamId);
	const parentPeerId = normalizeBoundedId(value.parentPeerId);
	const memberRoleIds = normalizeRoleIds(value.memberRoleIds);
	if (value.peerId !== void 0 && !peerId || value.guildId !== void 0 && !guildId || value.teamId !== void 0 && !teamId || value.parentPeerId !== void 0 && !parentPeerId || !memberRoleIds.valid) return;
	if (!peerId && !guildId && !teamId && !parentPeerId && !memberRoleIds.value) return;
	return {
		...peerId ? { peerId } : {},
		...guildId ? { guildId } : {},
		...teamId ? { teamId } : {},
		...parentPeerId ? { parentPeerId } : {},
		...memberRoleIds.value ? { memberRoleIds: memberRoleIds.value } : {}
	};
}
/** Captures only authoritative inbound facts needed to replay configured route precedence. */
function conversationRouteContextFromMsgContext(ctx) {
	const channel = normalizeOptionalLowercaseString(ctx.OriginatingChannel ?? ctx.Provider);
	const spaceId = normalizeBoundedId(ctx.GroupSpace);
	const parentPeerId = normalizeBoundedId(ctx.ThreadParentId);
	return parseConversationRouteContext({
		...ctx.ConversationRoutePeerId !== void 0 ? { peerId: ctx.ConversationRoutePeerId } : {},
		...channel === "discord" && spaceId ? { guildId: spaceId } : {},
		...(channel === "slack" || channel === "mattermost" || channel === "msteams") && spaceId ? { teamId: spaceId } : {},
		...parentPeerId ? { parentPeerId } : {},
		...ctx.MemberRoleIds !== void 0 ? { memberRoleIds: ctx.MemberRoleIds } : {}
	});
}
function serializeStoredConversationRouteContext(context, observedAt) {
	const canonical = context === null ? null : parseConversationRouteContext(context);
	if (context !== null && !canonical) throw new Error("Invalid conversation route context");
	return JSON.stringify({
		version: 1,
		writeId: randomUUID(),
		observedAt,
		context: canonical ?? null
	});
}
function parseStoredConversationRouteContext(value, expectedObservedAt) {
	if (!value || value.length > MAX_STORED_ROUTE_CONTEXT_LENGTH) return;
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch {
		return;
	}
	if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.writeId !== "string" || parsed.writeId.length === 0 || typeof parsed.observedAt !== "number" || parsed.observedAt !== expectedObservedAt) return;
	const context = parseConversationRouteContext(parsed.context);
	if (parsed.context !== null && !context) return;
	return context ? { context } : {};
}
function refreshStoredConversationRouteContext(value, previousObservedAt, observedAt) {
	const stored = parseStoredConversationRouteContext(value, previousObservedAt);
	return stored ? serializeStoredConversationRouteContext(stored.context ?? null, observedAt) : null;
}
//#endregion
//#region src/config/sessions/conversation-identity.ts
function normalizeThreadId(value) {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return normalizeOptionalString(value);
}
function normalizeKind(value) {
	const normalized = normalizeChatType(typeof value === "string" ? value : void 0);
	if (normalized === "channel") return "channel";
	if (normalized === "group") return "group";
	return "direct";
}
function resolvePairedOriginPeerId(params) {
	if (params.kind !== "direct") return;
	const origin = sessionDeliveryOrigin(params.entry);
	const originFrom = normalizeOptionalString(origin?.from);
	const originTo = normalizeOptionalString(origin?.to);
	const originChannel = normalizeOptionalString(origin?.provider)?.toLowerCase();
	const deliveryChannel = normalizeOptionalString(params.deliveryContext?.channel)?.toLowerCase();
	if (!originFrom || originTo !== params.deliveryTarget || !originChannel || originChannel !== deliveryChannel || normalizeChatType(origin?.chatType) !== params.kind || (normalizeOptionalAccountId(origin?.accountId) ?? "default") !== (normalizeOptionalAccountId(params.deliveryContext?.accountId) ?? "default") || normalizeThreadId(origin?.threadId) !== normalizeThreadId(params.deliveryContext?.threadId)) return;
	return originFrom;
}
/** Builds one stable transport address from authoritative channel route facts. */
function buildConversationIdentity(params) {
	const channel = normalizeOptionalString(params.channel)?.toLowerCase();
	const rawPeerId = normalizeOptionalString(params.peerId);
	if (!channel || !rawPeerId) return null;
	const peerId = normalizeConversationPeerId(channel, rawPeerId);
	if (!peerId) return null;
	const deliveryTarget = normalizeOptionalString(params.deliveryTarget);
	if (!deliveryTarget) return null;
	const accountId = normalizeOptionalAccountId(params.accountId) ?? "default";
	const rawParent = normalizeOptionalString(params.parentConversationRef);
	const parentConversationRef = rawParent ? rawParent.startsWith("conv_") ? rawParent : buildConversationRef({
		channel,
		accountId,
		kind: params.kind,
		peerId: normalizeConversationPeerId(channel, rawParent)
	}) : void 0;
	const threadId = normalizeThreadId(params.threadId);
	return {
		conversationRef: buildConversationRef({
			channel,
			accountId,
			kind: params.kind,
			peerId,
			parentConversationRef,
			threadId
		}),
		channel,
		accountId,
		kind: params.kind,
		peerId,
		deliveryTarget,
		...parentConversationRef ? { parentConversationRef } : {},
		...threadId ? { threadId } : {},
		...normalizeOptionalString(params.nativeChannelId) ? { nativeChannelId: normalizeOptionalString(params.nativeChannelId) } : {},
		...normalizeOptionalString(params.nativeDirectUserId) ? { nativeDirectUserId: normalizeOptionalString(params.nativeDirectUserId) } : {},
		...normalizeOptionalString(params.label) ? { label: normalizeOptionalString(params.label) } : {},
		...params.metadata ? { metadata: params.metadata } : {}
	};
}
/** Derives a transport address from the canonical route snapshot persisted on a session. */
function conversationIdentityFromSessionEntry(entry, routeContext) {
	const deliveryContext = deliveryContextFromSession(entry);
	const origin = sessionDeliveryOrigin(entry);
	const kind = normalizeKind(entry.chatType);
	const routeTarget = normalizeOptionalString(deliveryContext?.to);
	const deliveryTarget = routeTarget ?? (kind === "direct" ? normalizeOptionalString(origin?.from) : void 0);
	const routeOwnsTarget = Boolean(routeTarget);
	const channel = routeOwnsTarget ? deliveryContext?.channel : normalizeOptionalString(origin?.provider);
	const pairedOriginPeerId = routeTarget ? resolvePairedOriginPeerId({
		entry,
		deliveryContext,
		deliveryTarget: routeTarget,
		kind
	}) : void 0;
	return buildConversationIdentity({
		channel,
		accountId: routeOwnsTarget ? deliveryContext?.accountId : origin?.accountId,
		kind,
		peerId: routeContext?.peerId ?? pairedOriginPeerId ?? deliveryTarget,
		deliveryTarget,
		threadId: routeOwnsTarget ? deliveryContext?.threadId : origin?.threadId,
		nativeChannelId: origin?.nativeChannelId,
		nativeDirectUserId: origin?.nativeDirectUserId,
		label: entry.displayName ?? entry.label
	});
}
/** Derives the same stable address from live inbound channel facts. */
function conversationIdentityFromMsgContext(params) {
	normalizeInternalTurnContext(params.ctx);
	const route = deriveSessionOrigin(params.ctx);
	const explicitDeliveryContext = normalizeDeliveryContext(params.deliveryContext);
	const routeDeliveryContext = normalizeDeliveryContext({
		channel: route?.provider,
		to: route?.to,
		accountId: route?.accountId,
		threadId: route?.threadId
	});
	const deliveryContext = mergeDeliveryContext(explicitDeliveryContext, routeDeliveryContext);
	const groupResolution = params.groupResolution ?? resolveGroupSessionKey(params.ctx);
	const routeContext = conversationRouteContextFromMsgContext(params.ctx);
	const kind = groupResolution?.chatType ?? normalizeKind(params.ctx.ChatType);
	const directIngressTarget = kind === "direct" ? normalizeOptionalString(params.ctx.From) : void 0;
	const useDirectIngressTarget = Boolean(directIngressTarget && !explicitDeliveryContext?.to);
	const deliveryTarget = useDirectIngressTarget ? directIngressTarget : normalizeOptionalString(deliveryContext?.to) ?? normalizeOptionalString(params.ctx.OriginatingTo) ?? normalizeOptionalString(params.ctx.To);
	return buildConversationIdentity({
		channel: useDirectIngressTarget ? normalizeOptionalString(route?.provider) ?? normalizeOptionalString(params.ctx.OriginatingChannel) ?? normalizeOptionalString(params.ctx.Provider) : deliveryContext?.channel ?? groupResolution?.channel ?? normalizeOptionalString(route?.provider) ?? normalizeOptionalString(params.ctx.OriginatingChannel) ?? normalizeOptionalString(params.ctx.Provider),
		accountId: useDirectIngressTarget ? route?.accountId ?? params.ctx.AccountId : deliveryContext?.accountId ?? route?.accountId ?? params.ctx.AccountId,
		kind,
		peerId: routeContext?.peerId ?? deliveryTarget,
		deliveryTarget,
		threadId: useDirectIngressTarget ? route?.threadId ?? params.ctx.MessageThreadId : deliveryContext?.threadId ?? params.ctx.MessageThreadId,
		nativeChannelId: params.ctx.NativeChannelId ?? route?.nativeChannelId,
		nativeDirectUserId: params.ctx.NativeDirectUserId ?? route?.nativeDirectUserId,
		label: normalizeOptionalString(resolveConversationLabel(params.ctx)) ?? route?.label
	});
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-conversation.ts
/** Shared-main DMs multiplex peers through one context; every other routed session has one primary. */
function prepareSessionConversation(params) {
	const routeContext = params.routeContext === null ? null : params.routeContext === void 0 ? void 0 : parseConversationRouteContext(params.routeContext);
	if (params.routeContext !== void 0 && params.routeContext !== null && !routeContext) throw new Error("Invalid conversation route context");
	const identity = conversationIdentityFromSessionEntry(params.entry, routeContext);
	if (!identity) return null;
	return {
		identity,
		role: params.sessionScope === "shared-main" && identity.kind === "direct" ? "participant" : "primary",
		...routeContext !== void 0 ? { routeContext } : {}
	};
}
/** Keeps a previously observed route peer when a generic session writer has no route facts. */
function preserveSessionConversationIdentity(params) {
	if (params.sessionIds.length === 0) return params.identity;
	const db = getSessionKysely(params.database.db);
	const row = executeSqliteQuerySync(params.database.db, db.selectFrom("session_conversations as sc").innerJoin("conversations as c", "c.conversation_id", "sc.conversation_id").select([
		"c.conversation_id",
		"c.channel",
		"c.account_id",
		"c.kind",
		"c.peer_id",
		"c.delivery_target",
		"c.parent_conversation_id",
		"c.thread_id",
		"c.native_channel_id",
		"c.native_direct_user_id",
		"c.label",
		"c.metadata_json"
	]).where("sc.session_id", "in", params.sessionIds).where("c.channel", "=", params.identity.channel).where("c.account_id", "=", params.identity.accountId).where("c.kind", "=", params.identity.kind).where("c.delivery_target", "=", params.identity.deliveryTarget).where("sc.role", "in", ["primary", "participant"]).where("c.thread_id", params.identity.threadId ? "=" : "is", params.identity.threadId ?? null).orderBy("sc.last_seen_at", "desc").limit(1)).rows[0];
	let metadata;
	if (row?.metadata_json) try {
		const parsed = JSON.parse(row.metadata_json);
		metadata = isRecord(parsed) ? parsed : void 0;
	} catch {
		metadata = void 0;
	}
	return row ? {
		conversationRef: row.conversation_id,
		channel: row.channel,
		accountId: row.account_id,
		kind: params.identity.kind,
		peerId: row.peer_id,
		deliveryTarget: row.delivery_target,
		...row.parent_conversation_id ? { parentConversationRef: row.parent_conversation_id } : {},
		...row.thread_id ? { threadId: row.thread_id } : {},
		...row.native_channel_id ? { nativeChannelId: row.native_channel_id } : {},
		...row.native_direct_user_id ? { nativeDirectUserId: row.native_direct_user_id } : {},
		...params.identity.label ?? row.label ? { label: params.identity.label ?? row.label } : {},
		...metadata ? { metadata } : {}
	} : params.identity;
}
function prepareSessionConversationForWrite(params) {
	const conversation = prepareSessionConversation(params);
	if (!conversation || params.routeContext !== void 0) return conversation;
	conversation.identity = preserveSessionConversationIdentity({
		database: params.database,
		identity: conversation.identity,
		sessionIds: [params.entry.sessionId, params.previousEntry?.sessionId].filter((sessionId) => Boolean(sessionId))
	});
	return conversation;
}
/** Upserts the address before the session row so its primary-conversation FK is always valid. */
function upsertConversationIdentity(database, identity, updatedAt) {
	const db = getSessionKysely(database.db);
	executeSqliteQuerySync(database.db, db.insertInto("conversations").values({
		conversation_id: identity.conversationRef,
		channel: identity.channel,
		account_id: identity.accountId,
		kind: identity.kind,
		peer_id: identity.peerId,
		delivery_target: identity.deliveryTarget,
		parent_conversation_id: identity.parentConversationRef ?? null,
		thread_id: identity.threadId ?? null,
		native_channel_id: identity.nativeChannelId ?? null,
		native_direct_user_id: identity.nativeDirectUserId ?? null,
		label: identity.label ?? null,
		metadata_json: identity.metadata ? JSON.stringify(identity.metadata) : null,
		created_at: updatedAt,
		updated_at: updatedAt
	}).onConflict((conflict) => conflict.column("conversation_id").doUpdateSet({
		channel: identity.channel,
		account_id: identity.accountId,
		kind: identity.kind,
		peer_id: identity.peerId,
		delivery_target: identity.deliveryTarget,
		parent_conversation_id: identity.parentConversationRef ?? null,
		thread_id: identity.threadId ?? null,
		native_channel_id: identity.nativeChannelId ?? null,
		native_direct_user_id: identity.nativeDirectUserId ?? null,
		label: identity.label ?? null,
		metadata_json: identity.metadata ? JSON.stringify(identity.metadata) : null,
		updated_at: updatedAt
	})));
}
/** Links one external address to its local context without conflating the two identities. */
function linkSessionConversation(params) {
	const { database, sessionId, conversation, updatedAt } = params;
	const db = getSessionKysely(database.db);
	const readAssociation = (candidateSessionId) => executeSqliteQuerySync(database.db, db.selectFrom("session_conversations").select(["last_seen_at", "route_context_json"]).where("session_id", "=", candidateSessionId).where("conversation_id", "=", conversation.identity.conversationRef).orderBy("last_seen_at", "desc").limit(1)).rows[0];
	const existingAssociation = readAssociation(sessionId) ?? (params.previousSessionId && params.previousSessionId !== sessionId ? readAssociation(params.previousSessionId) : void 0);
	const routeContextJson = conversation.routeContext === void 0 ? existingAssociation ? refreshStoredConversationRouteContext(existingAssociation.route_context_json, existingAssociation.last_seen_at, updatedAt) : null : serializeStoredConversationRouteContext(conversation.routeContext, updatedAt);
	if (conversation.role === "primary") {
		const stalePrimaryRows = executeSqliteQuerySync(database.db, db.selectFrom("session_conversations").select([
			"conversation_id",
			"first_seen_at",
			"last_seen_at",
			"route_context_json"
		]).where("session_id", "=", sessionId).where("role", "=", "primary").where("conversation_id", "!=", conversation.identity.conversationRef)).rows;
		if (stalePrimaryRows.length > 0) {
			executeSqliteQuerySync(database.db, db.insertInto("session_conversations").values(stalePrimaryRows.map((row) => ({
				session_id: sessionId,
				conversation_id: row.conversation_id,
				role: "related",
				route_context_json: refreshStoredConversationRouteContext(row.route_context_json, row.last_seen_at, updatedAt),
				first_seen_at: row.first_seen_at,
				last_seen_at: updatedAt
			}))).onConflict((conflict) => conflict.columns([
				"session_id",
				"conversation_id",
				"role"
			]).doUpdateSet((eb) => ({
				route_context_json: eb.ref("excluded.route_context_json"),
				last_seen_at: updatedAt
			}))));
			executeSqliteQuerySync(database.db, db.deleteFrom("session_conversations").where("session_id", "=", sessionId).where("role", "=", "primary").where("conversation_id", "!=", conversation.identity.conversationRef));
		}
	}
	executeSqliteQuerySync(database.db, db.deleteFrom("session_conversations").where("session_id", "=", sessionId).where("conversation_id", "=", conversation.identity.conversationRef).where("role", "!=", conversation.role));
	executeSqliteQuerySync(database.db, db.insertInto("session_conversations").values({
		session_id: sessionId,
		conversation_id: conversation.identity.conversationRef,
		role: conversation.role,
		route_context_json: routeContextJson,
		first_seen_at: updatedAt,
		last_seen_at: updatedAt
	}).onConflict((conflict) => conflict.columns([
		"session_id",
		"conversation_id",
		"role"
	]).doUpdateSet({
		route_context_json: routeContextJson,
		last_seen_at: updatedAt
	})));
}
//#endregion
//#region src/agents/harness/session-deletion.ts
/** Reuse the registered harness owner; deletion is not a second plugin registration surface. */
function captureAgentHarnessSessionDeletions() {
	const scopedRegistry = () => getPluginRuntimeGenerationRegistry() ?? getPluginRuntimeGatewayRequestScope()?.pluginRegistry;
	const scoped = scopedRegistry();
	const registry = scoped ?? getPluginRegistryState()?.activeRegistry;
	const owners = registry?.agentHarnesses.flatMap((registration) => {
		const prepare = registration.harness.withSessionDeletion;
		if (!prepare) return [];
		const record = registry.plugins.find((plugin) => plugin.id === registration.pluginId);
		return [{
			registration,
			prepare,
			current: record || registration.pluginId === "core" ? capturePluginLifecycleAuthority(registry, record, { scopedRuntime: scoped === registry }) : void 0
		}];
	}) ?? [];
	return owners.length === 0 ? void 0 : async (targets, run) => {
		const pending = targets.flatMap((target) => owners.filter(({ registration }) => !target.agentHarnessId || target.agentHarnessId === registration.harness.id).map((owner) => ({
			owner,
			target
		})));
		const prepared = /* @__PURE__ */ new Map();
		const prepareNext = async (index) => {
			const candidate = pending[index];
			if (!candidate) return await run(prepared);
			const { owner, target } = candidate;
			let active = true;
			const assertCurrent = () => {
				target.initialization?.assertRollbackCurrent();
				if (!active || !owner.current?.() || scoped && scopedRegistry() !== scoped || !registry?.agentHarnesses.includes(owner.registration) || owner.registration.harness.withSessionDeletion !== owner.prepare) throw new Error(`Session deletion harness owner changed: ${owner.registration.harness.id}`);
			};
			try {
				assertCurrent();
				const result = await owner.prepare({
					...target,
					assertCurrent
				}, async (mutation) => {
					assertCurrent();
					const mutations = prepared.get(target.sessionKey) ?? [];
					mutations.push({
						assertCurrent,
						commit: () => {
							assertCurrent();
							mutation.commit();
						},
						rollback: () => {
							assertCurrent();
							mutation.rollback();
						}
					});
					prepared.set(target.sessionKey, mutations);
					return await prepareNext(index + 1);
				});
				assertCurrent();
				return result;
			} finally {
				active = false;
			}
		};
		return await prepareNext(0);
	};
}
//#endregion
//#region src/sessions/session-initialization.ts
const { rollbackOwner, sources } = resolveGlobalSingleton(Symbol.for("openclaw.sessionInitialization"), () => ({
	rollbackOwner: new AsyncLocalStorage(),
	sources: new AsyncLocalStorage()
}));
/** The message-cut owner supplies its exact source incarnation, never plugin-provided fields. */
async function withSessionInitializationSource(assertCurrent, run) {
	let active = true;
	try {
		return await sources.run(() => {
			if (!active) throw new Error("Session initialization source is closed");
			assertCurrent();
		}, run);
	} finally {
		active = false;
	}
}
function captureSessionInitializationOwner(harnessId) {
	const assertSource = sources.getStore();
	const scopedRegistry = () => getPluginRuntimeGenerationRegistry() ?? getPluginRuntimeGatewayRequestScope()?.pluginRegistry;
	const scoped = scopedRegistry();
	const registry = scoped ?? getPluginRegistryState()?.activeRegistry;
	const registration = registry?.agentHarnesses.find((candidate) => candidate.harness.id === harnessId);
	const record = registry?.plugins.find((candidate) => candidate.id === registration?.pluginId);
	const registryCurrent = registry && capturePluginLifecycleAuthority(registry, record, { scopedRuntime: scoped === registry });
	const harness = registration?.harness;
	const deletion = harness?.withSessionDeletion;
	return () => {
		assertSource?.();
		if (registry && (!registryCurrent?.() || scoped && scopedRegistry() !== scoped || !scoped && getPluginRegistryState()?.activeRegistry !== registry || registration && (!registry.agentHarnesses.includes(registration) || registration.harness !== harness || harness?.withSessionDeletion !== deletion))) throw new Error("Session initialization registry owner changed");
	};
}
function createSessionInitialization(target, assertOwner, preparation) {
	const registry = getPluginRuntimeGenerationRegistry() ?? getPluginRuntimeGatewayRequestScope()?.pluginRegistry ?? getPluginRegistryState()?.activeRegistry ?? void 0;
	let active = true;
	let deleted = false;
	const assertLive = () => {
		if (!active) throw new Error("Session initialization is closed");
		assertOwner(deleted);
	};
	const owner = {
		target,
		handle: Object.freeze({
			assertCurrent() {
				assertLive();
				if (deleted || rollbackOwner.getStore() === owner) throw new Error("Session initialization is rolling back");
			},
			assertRollbackCurrent() {
				assertLive();
				if (rollbackOwner.getStore() !== owner) throw new Error("Session initialization rollback is not active");
			},
			prepareNativeToolPolicy: async (model) => {
				owner.handle.assertCurrent();
				const { provider, runtimeProvider = provider, id } = model;
				if ([
					provider,
					runtimeProvider,
					id
				].some((value) => typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > 256)) throw new Error("Session policy preparation requires a bounded native model selection");
				const [{ resolvePluginHarnessToolPolicies }, { resolveSandboxRuntimeStatus }, { resolveWebSearchToolPolicy }] = await Promise.all([
					import("./selection-BKLJzyCN.js"),
					import("./runtime-status-BIlcU5Q4.js"),
					import("./web-search-tool-policy-DxqD4wCK.js")
				]);
				owner.handle.assertCurrent();
				const child = {
					config: preparation.config,
					agentId: preparation.agentId,
					sessionKey: target.sessionKey,
					sessionId: target.sessionId
				};
				if (preparation.entry.execNode || resolveSandboxRuntimeStatus({
					cfg: child.config,
					agentId: child.agentId,
					sessionKey: child.sessionKey
				}).sandboxed) throw new Error("Session creation cannot prepare an execution environment; fork from the original source instead.");
				const result = withPluginRuntimeGatewayRequestScope({
					isWebchatConnect: () => false,
					pluginRegistry: registry
				}, () => {
					if (resolvePluginHarnessToolPolicies({
						...child,
						provider: runtimeProvider,
						modelId: id
					}).toolPolicyRestricted) throw new Error("The child's native tool policy requires run-owned preparation. Fork an original imported message instead.");
					return { webSearchAllowed: resolveWebSearchToolPolicy({
						...child,
						modelProvider: provider,
						modelId: id,
						webSearchEnabled: child.config.tools?.web?.search?.enabled
					}).persistentAllowed };
				});
				owner.handle.assertCurrent();
				return result;
			}
		}),
		committed: () => {
			deleted = true;
		}
	};
	return {
		handle: owner.handle,
		rollback: (run) => rollbackOwner.run(owner, run),
		close: () => {
			active = false;
		}
	};
}
function getSessionInitializationRollback(target) {
	const owner = rollbackOwner.getStore();
	if (!owner || owner.target.storePath !== target.storePath || owner.target.sessionKey !== target.sessionKey || owner.target.sessionId !== target.sessionId || owner.target.lifecycleRevision !== target.lifecycleRevision) return;
	owner.handle.assertRollbackCurrent();
	return owner.handle;
}
/** Called by the first deletion publication, only for a removal that crossed COMMIT. */
function commitSessionInitializationRollback(handle) {
	const owner = rollbackOwner.getStore();
	if (owner?.handle === handle) owner.committed();
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-deletion.ts
const deletions = new AsyncLocalStorage();
const transactionMutations = new AsyncLocalStorage();
/** Keep ordinary updates serialized; release the writer only for native or artifact preparation. */
async function runPreparedSqliteSessionWrite(scope, prepare) {
	const prepared = await runExclusiveSqliteSessionWrite(scope, async () => {
		const write = await prepare();
		return write.deletedEntries.length || write.beforeCommit ? { write } : { result: await write.commit() };
	});
	if (!prepared.write) return {
		deletedEntries: 0,
		result: prepared.result
	};
	const write = prepared.write;
	// session-reference-index-v1: removals resolve surviving references inside the commit transaction; validate them
	// first, outside the writer lane, a page per event-loop turn.
	await prewarmSessionReferenceIndex(() => openOpenClawAgentDatabase(toDatabaseOptions(scope)));
	const result = await withSqliteSessionDeletions(scope, write.deletedEntries, async (assertCurrent) => {
		await write.beforeCommit?.();
		return await runExclusiveSqliteSessionWrite(scope, async () => {
			assertCurrent();
			return await write.commit();
		});
	});
	return {
		deletedEntries: write.deletedEntries.length,
		result
	};
}
/** Prepare owner leases before entering a physical writer or changing any transcript state. */
async function withSqliteSessionDeletions(scope, entries, run) {
	const targets = [...new Map(entries.filter(({ entry }) => entry.sessionId).map(({ sessionKey, entry }) => [sessionKey, {
		agentId: parseAgentSessionKey(sessionKey)?.agentId ?? scope.agentId,
		sessionKey,
		sessionId: entry.sessionId,
		...entry.lifecycleRevision ? { lifecycleRevision: entry.lifecycleRevision } : {},
		...entry.agentHarnessId ? { agentHarnessId: entry.agentHarnessId } : {}
	}])).values()].toSorted((a, b) => a.sessionKey.localeCompare(b.sessionKey));
	const ownerStorePath = scope.ownerStorePath ?? resolveSessionStorePathCore(void 0, {
		agentId: scope.agentId,
		env: scope.env
	});
	for (const target of targets) target.initialization = getSessionInitializationRollback({
		...target,
		storePath: ownerStorePath
	});
	const assertTargetIdle = (target) => {
		if (isCompetingSessionWorkAdmissionActive(ownerStorePath, [target.sessionKey, target.sessionId])) throw new Error(`Cannot delete session while competing work is in flight for ${target.sessionKey}; retry after the run completes`);
	};
	targets.forEach(assertTargetIdle);
	const prepare = captureAgentHarnessSessionDeletions();
	const invoke = async (prepared) => {
		const assertCurrent = () => {
			targets.forEach(assertTargetIdle);
			for (const mutations of prepared.values()) mutations.forEach((mutation) => mutation.assertCurrent());
		};
		assertCurrent();
		return await deletions.run(new Map(targets.map((target) => [target.sessionKey, {
			target,
			mutations: prepared.get(target.sessionKey) ?? [],
			assertIdle: () => assertTargetIdle(target)
		}])), () => run(assertCurrent));
	};
	return await runExclusiveSessionLifecycleMutation({
		scope: ownerStorePath,
		identities: targets.flatMap((target) => [target.sessionKey, target.sessionId]),
		run: async () => prepare ? await prepare(targets, invoke) : await invoke(/* @__PURE__ */ new Map())
	});
}
/** Called only at the synchronous SQL edge, after the operation revalidates its row snapshot. */
function commitSqliteSessionDeletion(sessionKey, entry) {
	const prepared = deletions.getStore()?.get(sessionKey);
	if (!prepared) {
		if (captureAgentHarnessSessionDeletions()) throw new Error(`Session deletion requires prepared harness ownership: ${sessionKey}`);
		return;
	}
	if (prepared.target.sessionId !== entry.sessionId || prepared.target.lifecycleRevision !== entry.lifecycleRevision) throw new Error(`Session changed before deletion: ${sessionKey}`);
	prepared.assertIdle();
	const transaction = transactionMutations.getStore();
	if (!transaction) throw new Error(`Session deletion requires its synchronous transaction: ${sessionKey}`);
	for (const mutation of prepared.mutations) {
		transaction.rollback.push(mutation);
		mutation.commit();
	}
	if (prepared.target.initialization) transaction.initializations.add(prepared.target.initialization);
}
/** Roll back companion state only if SQLite failed before COMMIT, never after publication. */
function runSqliteSessionDeletionTransaction(operation, options, transactionOptions) {
	if (!deletions.getStore() || transactionMutations.getStore()) return runOpenClawAgentWriteTransaction(operation, options, transactionOptions);
	const rollback = [];
	const initializations = /* @__PURE__ */ new Set();
	let committed = false;
	try {
		return transactionMutations.run({
			rollback,
			initializations
		}, () => runOpenClawAgentWriteTransaction((database) => {
			deferOpenClawAgentPostCommitPublication(database, () => {
				committed = true;
				initializations.forEach(commitSessionInitializationRollback);
			});
			return operation(database);
		}, options, transactionOptions));
	} catch (error) {
		const failures = [error];
		if (!committed) for (const mutation of rollback.toReversed()) try {
			mutation.rollback();
		} catch (rollbackError) {
			failures.push(rollbackError);
		}
		if (failures.length > 1) throw createSqliteLifecycleAggregateError(failures, "Session deletion rollback failed", error);
		throw error;
	}
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-pending-inputs.ts
const owners = resolveGlobalSingleton(Symbol.for("openclaw.sessionPendingInputOwners"), () => ({
	live: /* @__PURE__ */ new Map(),
	current: new AsyncLocalStorage()
}));
registerAgentEventLifecycleRotationHandler("session-pending-inputs", () => {
	const failures = [];
	for (const owner of owners.live.values()) try {
		owner.finish("interrupted");
	} catch (error) {
		failures.push(error);
	}
	if (failures.length) throw new AggregateError(failures, "Failed to record interrupted pending inputs");
});
function registerSessionPendingInputOwner(owner) {
	if (owners.live.has(owner.inputId)) throw new Error("Pending input already has a live owner");
	owners.live.set(owner.inputId, owner);
}
function releaseSessionPendingInputOwner(owner) {
	if (owners.live.get(owner.inputId) === owner) owners.live.delete(owner.inputId);
}
function assertPendingInputOwnerCurrent(owner) {
	if (owner.sources) {
		for (const source of owner.sources) assertPendingInputOwnerCurrent(source);
		return;
	}
	if (owners.live.get(owner.inputId) !== owner || !isAgentEventLifecycleGenerationCurrent(owner.lifecycleGeneration)) throw new Error("Pending input ownership ended; submit a new turn to continue");
	owner.assertCurrent();
}
function runWithSessionPendingInput(owner, run) {
	assertPendingInputOwnerCurrent(owner);
	return owners.current.run(owner, run);
}
/** Persistence alone may mirror a closed turn; the append owner proves exact committed bytes. */
function runWithSessionPendingInputPersistence(owner, persist) {
	return owners.current.run(owner, persist);
}
/** Registration owns disposition; execution and promotion check the private operational predicates. */
function readSessionPendingInputOwnerIds(database, rows) {
	const candidates = rows.filter((row) => {
		const owner = owners.live.get(row.input_id);
		return owner?.databasePath === database.path && owner.sessionId === row.session_id && owner.sessionKey === row.session_key && owner.lifecycleGeneration === row.lifecycle_generation && isAgentEventLifecycleGenerationCurrent(owner.lifecycleGeneration);
	});
	if (!candidates.length) return /* @__PURE__ */ new Set();
	const sessions = executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_nodes").select(["session_key", "current_session_id"]).where("session_key", "in", [...new Set(candidates.map((row) => row.session_key))])).rows;
	const current = new Map(sessions.map((row) => [row.session_key, row.current_session_id]));
	return new Set(candidates.filter((row) => current.get(row.session_key) === row.session_id).map((row) => row.input_id));
}
function parseSessionPendingInputMessage(messageJson) {
	const value = JSON.parse(messageJson);
	if (asOptionalRecord(value)?.role !== "user") throw new Error("Pending input has an invalid persisted user message");
	return value;
}
function projectSessionPendingInput(row) {
	if (row.state !== "queued" && row.state !== "interrupted" && row.state !== "cancelled") throw new Error("Pending input has an invalid disposition");
	return {
		id: row.input_id,
		runId: row.run_id,
		message: parseSessionPendingInputMessage(row.message_json),
		acceptedAt: row.accepted_at,
		state: row.state
	};
}
/** Query only the exact physical transcript; copied keys cannot adopt another generation. */
function readSessionPendingInputByKey(database, scope, idempotencyKey) {
	if (!hasSessionPendingInputsSchema(database.db)) return;
	return executeSqliteQueryTakeFirstSync(database.db, getSessionKysely(database.db).selectFrom("session_pending_inputs").selectAll().where("session_id", "=", scope.sessionId).where("session_key", "=", scope.sessionKey).where("idempotency_key", "=", idempotencyKey));
}
/** The private call-path owner, not a copied id or durable row, permits promotion. */
function resolveSessionPendingInputAppend(database, scope, message) {
	const record = asOptionalRecord(message);
	if (record?.role !== "user" || typeof record.idempotencyKey !== "string") return;
	const idempotencyKey = record.idempotencyKey.trim();
	const row = readSessionPendingInputByKey(database, scope, idempotencyKey);
	const owner = owners.current.getStore();
	const ownsInput = owner?.idempotencyKey === idempotencyKey;
	if (!row && !ownsInput) return;
	if (!owner || !ownsInput || owner.databasePath !== database.path || owner.sessionId !== scope.sessionId || owner.sessionKey !== scope.sessionKey || row && (row.input_id !== owner.inputId || row.consumed_event_id != null || row.state !== "queued" || row.lifecycle_generation !== owner.lifecycleGeneration)) throw new Error("Pending input cannot be appended outside its admitted turn");
	if (owner.sources) {
		const acceptedByKey = new Map(executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_pending_inputs").selectAll().where("session_id", "=", scope.sessionId).where("session_key", "=", scope.sessionKey).where("idempotency_key", "in", owner.sources.map((source) => source.idempotencyKey))).rows.map((sourceRow) => [sourceRow.idempotency_key, sourceRow]));
		const sources = owner.sources.map((source) => {
			const accepted = acceptedByKey.get(source.idempotencyKey);
			if (!accepted || accepted.input_id !== source.inputId || accepted.lifecycle_generation !== source.lifecycleGeneration || accepted.message_json !== source.messageJson) throw new Error("Collected input custody changed before transcript promotion");
			return accepted;
		});
		const alreadyPromoted = sources.every((source) => source.consumed_event_id === owner.inputId);
		if (!alreadyPromoted) {
			if (sources.some((source) => source.consumed_event_id != null || source.state !== "queued")) throw new Error("Collected input custody ended before transcript promotion");
			assertPendingInputOwnerCurrent(owner);
		}
		return {
			inputId: owner.inputId,
			message: parseSessionPendingInputMessage(owner.messageJson),
			alreadyPromoted,
			sourceInputIds: sources.map((source) => source.input_id)
		};
	}
	if (row) assertPendingInputOwnerCurrent(owner);
	return {
		inputId: owner.inputId,
		message: parseSessionPendingInputMessage(row?.message_json ?? owner.messageJson),
		alreadyPromoted: !row
	};
}
function consumeSessionPendingInput(database, pending) {
	if (!pending.alreadyPromoted) {
		if (pending.sourceInputIds) {
			if (executeSqliteQuerySync(database.db, getSessionKysely(database.db).updateTable("session_pending_inputs").set({ consumed_event_id: pending.inputId }).where("input_id", "in", [...pending.sourceInputIds]).where("state", "=", "queued").where("consumed_event_id", "is", null)).numAffectedRows !== BigInt(pending.sourceInputIds.length)) throw new Error("Collected input custody changed during transcript promotion");
			return;
		}
		executeSqliteQuerySync(database.db, getSessionKysely(database.db).deleteFrom("session_pending_inputs").where("input_id", "=", pending.inputId).where("state", "=", "queued"));
	}
}
/** Logical deletion also clears custody when transcript windows are retained. */
function deleteSessionPendingInputs(database, sessionKey) {
	if (hasSessionPendingInputsSchema(database.db)) executeSqliteQuerySync(database.db, getSessionKysely(database.db).deleteFrom("session_pending_inputs").where("session_key", "=", sessionKey));
}
/** Canonical repair preserves accepted text without transferring its old execution authority. */
function copySessionPendingInputsForRepair(source, destination, sourceKeys, canonicalKey) {
	if (!hasSessionPendingInputsSchema(source.db)) return;
	const rows = executeSqliteQuerySync(source.db, getSessionKysely(source.db).selectFrom("session_pending_inputs").selectAll().where("session_key", "in", sourceKeys).orderBy("seq", "asc")).rows;
	if (!rows.length) return;
	ensureSessionPendingInputsSchema(destination.db);
	const db = getSessionKysely(destination.db);
	for (const row of rows) {
		if (source.db === destination.db) {
			executeSqliteQuerySync(destination.db, db.updateTable("session_pending_inputs").set({
				session_key: canonicalKey,
				state: row.state === "cancelled" ? "cancelled" : "interrupted"
			}).where("input_id", "=", row.input_id));
			continue;
		}
		const existing = readSessionPendingInputByKey(destination, {
			sessionKey: canonicalKey,
			sessionId: row.session_id
		}, row.idempotency_key);
		if (existing) {
			if (existing.request_hash !== row.request_hash || existing.message_json !== row.message_json || existing.run_id !== row.run_id || existing.consumed_event_id != null && row.consumed_event_id != null && existing.consumed_event_id !== row.consumed_event_id) throw new Error("Canonical repair found conflicting accepted inputs");
			executeSqliteQuerySync(destination.db, db.updateTable("session_pending_inputs").set({
				consumed_event_id: existing.consumed_event_id ?? row.consumed_event_id ?? null,
				state: existing.state === "cancelled" || row.state === "cancelled" ? "cancelled" : "interrupted"
			}).where("input_id", "=", existing.input_id));
			continue;
		}
		const { seq: _seq, ...record } = row;
		executeSqliteQuerySync(destination.db, db.insertInto("session_pending_inputs").values({
			...record,
			session_key: canonicalKey,
			state: row.state === "cancelled" ? "cancelled" : "interrupted"
		}));
	}
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-node-artifacts.ts
function clearSessionCollaborationForKey(database, sessionKey, options = {}) {
	const presentTables = readSessionNodeArtifactTables(database);
	const db = getSessionKysely(database.db);
	if (presentTables.has("session_members")) executeSqliteQuerySync(database.db, db.deleteFrom("session_members").where("session_key", "=", sessionKey));
	if (options.clearSuggestions !== false && presentTables.has("session_suggestions")) executeSqliteQuerySync(database.db, db.deleteFrom("session_suggestions").where("session_key", "=", sessionKey));
}
/** Copy logical-session artifacts into their canonical node within one agent store or across two. */
function copySessionNodeArtifactsForRepair(source, destination, sourceKeys, canonicalKey, options = {}) {
	const keys = [...new Set(sourceKeys)];
	if (keys.length === 0) return;
	copySessionPendingInputsForRepair(source, destination, keys, canonicalKey);
	const sourceDb = getSessionKysely(source.db);
	const destinationDb = getSessionKysely(destination.db);
	const sourceKeyReferences = new Set(keys.flatMap((key) => [key, key.trim()]));
	const sourceTables = readSessionNodeArtifactTables(source);
	let destinationTables = readSessionNodeArtifactTables(destination);
	if (options.includeParticipants !== false && sourceTables.has("session_participants") && !destinationTables.has("session_participants")) {
		ensureSessionParticipantsSchema(destination.db);
		destinationTables = readSessionNodeArtifactTables(destination);
	}
	if (sourceTables.has("session_progress_cards")) {
		const progressCards = executeSqliteQuerySync(source.db, sourceDb.selectFrom("session_progress_cards").selectAll().where("session_key", "in", keys)).rows;
		if (progressCards.length > 0 && !destinationTables.has("session_progress_cards")) {
			ensureOpenClawAgentProgressCardSchemaInTransaction(destination.db);
			destinationTables = readSessionNodeArtifactTables(destination);
		}
		for (const progressCard of progressCards) {
			const canonicalProgressCard = {
				...progressCard,
				session_key: canonicalKey
			};
			executeSqliteQuerySync(destination.db, destinationDb.insertInto("session_progress_cards").values(canonicalProgressCard).onConflict((conflict) => conflict.column("session_key").doUpdateSet(canonicalProgressCard).where((eb) => eb.or([eb("revision", "<", progressCard.revision), eb.and([eb("revision", "=", progressCard.revision), eb("updated_at", "<", progressCard.updated_at)])]))));
		}
	}
	if (sourceTables.has("board_tabs") && sourceTables.has("board_widgets") && destinationTables.has("board_tabs") && destinationTables.has("board_widgets")) {
		for (const tab of executeSqliteQuerySync(source.db, sourceDb.selectFrom("board_tabs").selectAll().where("session_key", "in", keys)).rows) executeSqliteQuerySync(destination.db, destinationDb.insertInto("board_tabs").values({
			...tab,
			session_key: canonicalKey
		}).onConflict((conflict) => conflict.columns(["session_key", "tab_id"]).doUpdateSet({
			title: tab.title,
			position: tab.position,
			chat_dock: tab.chat_dock,
			created_by: tab.created_by,
			revision: tab.revision
		}).where("revision", "<", tab.revision)));
		for (const widget of executeSqliteQuerySync(source.db, sourceDb.selectFrom("board_widgets").selectAll().where("session_key", "in", keys)).rows) executeSqliteQuerySync(destination.db, destinationDb.insertInto("board_widgets").values({
			...widget,
			session_key: canonicalKey
		}).onConflict((conflict) => conflict.columns(["session_key", "name"]).doUpdateSet({
			...widget,
			session_key: canonicalKey
		}).where((eb) => eb.or([eb("revision", "<", widget.revision), eb.and([eb("revision", "=", widget.revision), eb("updated_at", "<", widget.updated_at)])]))));
	}
	if (options.includeMembers !== false && sourceTables.has("session_members") && destinationTables.has("session_members")) for (const member of executeSqliteQuerySync(source.db, sourceDb.selectFrom("session_members").selectAll().where("session_key", "in", keys)).rows) executeSqliteQuerySync(destination.db, destinationDb.insertInto("session_members").values({
		...member,
		session_key: canonicalKey
	}).onConflict((conflict) => conflict.columns(["session_key", "identity_id"]).doNothing()));
	if (sourceTables.has("session_suggestions") && destinationTables.has("session_suggestions")) {
		if (source.db === destination.db) executeSqliteQuerySync(destination.db, destinationDb.updateTable("session_suggestions").set({ session_key: canonicalKey }).where("session_key", "in", keys));
		else for (const suggestion of executeSqliteQuerySync(source.db, sourceDb.selectFrom("session_suggestions").selectAll().where("session_key", "in", keys)).rows) executeSqliteQuerySync(destination.db, destinationDb.insertInto("session_suggestions").values({
			...suggestion,
			session_key: canonicalKey
		}).onConflict((conflict) => conflict.column("id").doNothing()));
	}
	if (sourceTables.has("heartbeat_outcomes") && destinationTables.has("heartbeat_outcomes")) for (const heartbeat of executeSqliteQuerySync(source.db, sourceDb.selectFrom("heartbeat_outcomes").selectAll().where("session_key", "in", keys)).rows) executeSqliteQuerySync(destination.db, destinationDb.insertInto("heartbeat_outcomes").values({
		...heartbeat,
		session_key: canonicalKey,
		run_session_key: sourceKeyReferences.has(heartbeat.run_session_key) ? canonicalKey : heartbeat.run_session_key
	}).onConflict((conflict) => conflict.column("session_key").doUpdateSet({
		...heartbeat,
		session_key: canonicalKey,
		run_session_key: sourceKeyReferences.has(heartbeat.run_session_key) ? canonicalKey : heartbeat.run_session_key
	}).where((eb) => eb.or([eb("updated_at", "<", heartbeat.updated_at), eb.and([eb("updated_at", "=", heartbeat.updated_at), eb("occurred_at", "<", heartbeat.occurred_at)])]))));
	if (options.includeParticipants !== false && sourceTables.has("session_participants") && destinationTables.has("session_participants")) for (const participant of executeSqliteQuerySync(source.db, sourceDb.selectFrom("session_participants").selectAll().where("session_key", "in", keys)).rows) {
		if (source.db === destination.db && participant.session_key === canonicalKey) continue;
		const existing = executeSqliteQueryTakeFirstSync(destination.db, destinationDb.selectFrom("session_participants").select([
			"contribution_count",
			"first_prompted_at",
			"last_prompted_at"
		]).where("session_key", "=", canonicalKey).where("identity_namespace", "=", participant.identity_namespace).where("actor_id", "=", participant.actor_id));
		const aggregate = mergeParticipantAggregate(existing, participant, source.db === destination.db ? "sum" : "copy");
		executeSqliteQuerySync(destination.db, destinationDb.insertInto("session_participants").values({
			...participant,
			...aggregate,
			session_key: canonicalKey
		}).onConflict((conflict) => conflict.columns([
			"session_key",
			"identity_namespace",
			"actor_id"
		]).doUpdateSet(aggregate)));
	}
}
/** Membership is authorization state; canonical repair replaces it from the selected winner. */
function deleteSessionMembersForRepair(database, sessionKey) {
	if (!readSessionNodeArtifactTables(database).has("session_members")) return;
	const db = getSessionKysely(database.db);
	executeSqliteQuerySync(database.db, db.deleteFrom("session_members").where("session_key", "=", sessionKey));
}
function deleteSessionDeliveryArtifacts(database, sessionKey, additionalKeys = []) {
	const db = getSessionKysely(database.db);
	const trimmedKey = sessionKey.trim();
	const lookupKeys = uniqueStrings([
		sessionKey,
		trimmedKey,
		normalizeStoreSessionKey(trimmedKey),
		...additionalKeys
	]);
	const competingIdentities = new Set(executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select("session_key")).rows.flatMap((row) => row.session_key === sessionKey ? [] : [normalizeStoreSessionKey(row.session_key.trim())]));
	const sessionKeys = lookupKeys.filter((key) => key === sessionKey || !competingIdentities.has(normalizeStoreSessionKey(key.trim())));
	executeSqliteQuerySync(database.db, db.deleteFrom("conversation_deliveries").where("source_session_key", "in", sessionKeys));
}
function deleteSessionNodeArtifacts(database, sessionKey) {
	deleteSessionPendingInputs(database, sessionKey);
	const db = getSessionKysely(database.db);
	const presentTables = readSessionNodeArtifactTables(database);
	if (presentTables.has("board_tabs") && presentTables.has("board_widgets")) {
		executeSqliteQuerySync(database.db, db.deleteFrom("board_widgets").where("session_key", "=", sessionKey));
		executeSqliteQuerySync(database.db, db.deleteFrom("board_tabs").where("session_key", "=", sessionKey));
	}
	for (const table of [
		"heartbeat_outcomes",
		"session_participants",
		"session_progress_cards"
	]) {
		if (!presentTables.has(table)) continue;
		executeSqliteQuerySync(database.db, db.deleteFrom(table).where("session_key", "=", sessionKey));
	}
	clearSessionCollaborationForKey(database, sessionKey);
}
function readSessionNodeArtifactTables(database) {
	const db = getSessionKysely(database.db);
	return new Set(executeSqliteQuerySync(database.db, db.selectFrom("sqlite_schema").select("name").where("type", "=", "table").where("name", "in", [
		"board_tabs",
		"board_widgets",
		"heartbeat_outcomes",
		"session_members",
		"session_participants",
		"session_progress_cards",
		"session_suggestions"
	])).rows.flatMap((row) => row.name ? [row.name] : []));
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-provenance.ts
function bindSessionEntryProvenance(entry) {
	const hookSource = entry.hookExternalContentSource;
	const persistedHookSource = hookSource === "email" ? "webhook" : hookSource;
	return {
		session_entry_provenance: 1,
		acp_owned: entry.acp ? 1 : 0,
		plugin_owner_id: typeof entry.pluginOwnerId === "string" && entry.pluginOwnerId.trim() ? entry.pluginOwnerId.trim() : null,
		hook_external_content_source: persistedHookSource === "gmail" || persistedHookSource === "webhook" ? persistedHookSource : null
	};
}
function resolveSessionEntryProvenanceRow(params) {
	const db = getNodeSqliteKysely(params.database.db);
	const existingRoot = executeSqliteQueryTakeFirstSync(params.database.db, db.selectFrom("session_windows").select([
		"session_entry_provenance",
		"acp_owned",
		"plugin_owner_id",
		"hook_external_content_source"
	]).where("session_id", "=", params.entry.sessionId));
	const hasTranscript = Boolean(executeSqliteQueryTakeFirstSync(params.database.db, db.selectFrom("transcript_events").select("seq").where("session_id", "=", params.entry.sessionId).limit(1)));
	if (existingRoot?.session_entry_provenance === 0 && (params.previousEntry?.sessionId === params.entry.sessionId || hasTranscript)) return {
		...params.boundSessionRow,
		session_entry_provenance: 0,
		acp_owned: 0,
		plugin_owner_id: null,
		hook_external_content_source: null
	};
	return existingRoot?.session_entry_provenance === 1 ? {
		...params.boundSessionRow,
		acp_owned: existingRoot.acp_owned === 1 ? 1 : params.boundSessionRow.acp_owned,
		plugin_owner_id: params.boundSessionRow.plugin_owner_id ?? existingRoot.plugin_owner_id,
		hook_external_content_source: params.boundSessionRow.hook_external_content_source ?? existingRoot.hook_external_content_source
	} : params.boundSessionRow;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-references.ts
/** Every transcript generation retained by one canonical logical-session record. */
function collectSessionStateIdsForEntry(entry) {
	const sessionIds = [];
	const add = (sessionId) => {
		const normalized = sessionId?.trim();
		if (normalized) sessionIds.push(normalized);
	};
	add(entry.sessionId);
	add(entry.previousSessionId);
	for (const sessionId of entry.usageFamilySessionIds ?? []) add(sessionId);
	for (const checkpoint of entry.compactionCheckpoints ?? []) {
		add(checkpoint.sessionId);
		add(checkpoint.preCompaction.sessionId);
		add(checkpoint.postCompaction.sessionId);
	}
	return uniqueStrings(sessionIds);
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-session-row.ts
function normalizeSessionEntryTimestamp(entry) {
	const hasLegacyDeliveryFields = [
		"route",
		"deliveryContext",
		"origin",
		"channel",
		"lastChannel",
		"lastTo",
		"lastAccountId",
		"lastThreadId"
	].some((key) => key in entry);
	const delivery = entry.delivery ?? (hasLegacyDeliveryFields ? void 0 : { kind: "none" });
	if (typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt)) {
		if (entry.delivery === delivery) return entry;
		return delivery ? {
			...entry,
			delivery
		} : entry;
	}
	const updatedAt = typeof entry.sessionStartedAt === "number" && Number.isFinite(entry.sessionStartedAt) ? entry.sessionStartedAt : Date.now();
	return delivery ? {
		...entry,
		delivery,
		updatedAt
	} : {
		...entry,
		updatedAt
	};
}
function bindSessionRoot(params) {
	const updatedAt = Number.isFinite(params.entry.updatedAt) ? params.entry.updatedAt : params.updatedAt;
	return {
		session_id: params.entry.sessionId,
		session_key: params.sessionKey,
		reason: null,
		created_at: resolveSqliteSessionCreatedAt(params.entry, updatedAt),
		updated_at: updatedAt,
		...bindSessionEntryProvenance(params.entry),
		...bindSessionWindowEntryProjection(params),
		primary_conversation_id: null
	};
}
function bindSessionWindowEntryProjection(params) {
	return {
		previous_session_id: normalizeText(params.entry.previousSessionId),
		session_scope: resolveSqliteSessionScope(params.entry, params.sessionKey),
		started_at: finiteSqliteNumber(params.entry.startedAt),
		ended_at: finiteSqliteNumber(params.entry.endedAt),
		status: normalizeStatus(params.entry.status),
		chat_type: normalizeSessionRowChatType(params.entry.chatType),
		channel: resolveSqliteSessionChannel(params.entry),
		account_id: resolveSqliteSessionAccountId(params.entry),
		model_provider: normalizeText(params.entry.modelProvider),
		model: normalizeText(params.entry.model),
		agent_harness_id: normalizeText(params.entry.agentHarnessId),
		parent_session_key: normalizeText(params.entry.parentSessionKey),
		spawned_by: normalizeText(params.entry.spawnedBy),
		display_name: resolveSqliteSessionDisplayName(params.entry)
	};
}
/** Project the canonical entry blob into the logical-node query columns. */
function bindSessionNode(params) {
	const canonicalEntry = projectCanonicalSessionEntryShape({ ...params.entry });
	const actor = params.entry.createdActor;
	return {
		session_key: params.sessionKey,
		current_session_id: params.entry.sessionId,
		entry_json: JSON.stringify(stripRuntimeOnlySessionSkillsFields(canonicalEntry)),
		entry_valid: 1,
		updated_at: params.updatedAt,
		status: normalizeStatus(params.entry.status),
		created_at: finiteSqliteNumber(params.entry.createdAt),
		created_via: normalizeSqliteCreatedVia(params.entry.createdVia),
		created_actor_type: normalizeSqliteCreatedActorType(actor?.type),
		created_actor_id: normalizeText(actor?.id),
		project_id: normalizeText(params.entry.projectId),
		parent_session_key: normalizeText(params.entry.parentSessionKey) ?? normalizeText(params.entry.spawnedBy),
		spawned_by: normalizeText(params.entry.spawnedBy),
		fork_source_session_key: normalizeText(params.entry.forkSource?.sessionKey),
		fork_source_session_id: normalizeText(params.entry.forkSource?.sessionId),
		fork_source_entry_id: normalizeText(params.entry.forkSource?.entryId),
		label: normalizeText(params.entry.label),
		display_name: normalizeText(params.entry.displayName),
		category: normalizeText(params.entry.category),
		icon: normalizeText(canonicalEntry.icon),
		pinned_at: finiteSqliteNumber(params.entry.pinnedAt),
		archived_at: finiteSqliteNumber(params.entry.archivedAt),
		last_read_at: finiteSqliteNumber(params.entry.lastReadAt),
		last_interaction_at: finiteSqliteNumber(params.entry.lastInteractionAt),
		last_activity_at: finiteSqliteNumber(params.entry.lastActivityAt)
	};
}
function normalizeSqliteCreatedVia(value) {
	return value === "operator" || value === "spawn" || value === "channel" || value === "cron" || value === "talk" || value === "run" || value === "plugin" || value === "internal" ? value : null;
}
function normalizeSqliteCreatedActorType(value) {
	return value === "human" || value === "agent" || value === "system" ? value : null;
}
function resolveSqliteSessionScope(entry, sessionKey) {
	const chatType = normalizeSessionRowChatType(entry.chatType);
	const normalizedKey = sessionKey.trim().toLowerCase();
	if (chatType === "direct" && (normalizedKey === "main" || normalizedKey.endsWith(":main"))) return "shared-main";
	if (chatType === "group" || chatType === "channel") return chatType;
	return "conversation";
}
function resolveSqliteSessionCreatedAt(entry, updatedAt) {
	for (const candidate of [
		entry.sessionStartedAt,
		entry.startedAt,
		entry.updatedAt,
		updatedAt
	]) if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) return candidate;
	return updatedAt;
}
function finiteSqliteNumber(value) {
	return asFiniteNumber(value) ?? null;
}
function resolveSqliteSessionChannel(entry) {
	return normalizeText(sessionDeliveryChannel(entry));
}
function resolveSqliteSessionAccountId(entry) {
	return normalizeText(deliveryContextFromSession(entry)?.accountId);
}
function resolveSqliteSessionDisplayName(entry) {
	return normalizeText(entry.displayName) ?? normalizeText(entry.label) ?? normalizeText(entry.subject) ?? normalizeText(entry.groupId);
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-entry-store.ts
/** Decodes a fresh owned entry, including its nested JSON, owner and participant values. */
function parseReadableSqliteSessionEntryRow(database, row, projection = "full") {
	const parsed = parseSessionEntryJson(row, projection);
	if (parsed) {
		const entry = projectSqliteSessionParticipants(database.db, row.session_key, parsed);
		if (resolveDeliveryProvenCanonicalSessionKey(row.session_key, entry) !== row.session_key) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${row.session_key}`);
		return entry;
	}
	if (row.entry_json === "{}" ? executeSqliteQueryTakeFirstSync(database.db, getSessionKysely(database.db).selectFrom("session_windows").select("session_id").where("session_id", "=", row.current_session_id).where("session_key", "=", row.session_key)) : void 0) return null;
	throw canonicalSessionKeyMigrationRequiredError(`invalid persisted session row requires repair for ${row.session_key}`);
}
/** Exact reads already own nested values; retain them through identity publication. */
function readSessionIdentitySnapshot(database, sessionKeys) {
	const snapshot = /* @__PURE__ */ new Map();
	for (const sessionKey of uniqueStrings([...sessionKeys].map((key) => key.trim()))) {
		const row = readExactSessionEntryRow(database, sessionKey);
		if (row) snapshot.set(sessionKey, row.entry);
	}
	return snapshot;
}
function readSessionEntryRow(database, sessionKey) {
	assertCanonicalSqliteSessionKeysCurrent(database);
	return readSessionEntryRowUnchecked(database, sessionKey);
}
function readSessionEntryRowUnchecked(database, sessionKey) {
	const db = getSessionKysely(database.db);
	const lookupKeys = collectSessionEntryLookupKeys(database, sessionKey);
	if (lookupKeys.length === 0) return;
	const rows = executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").selectAll().where("session_key", "in", lookupKeys).orderBy("session_key", "asc")).rows;
	let selected;
	for (const row of rows) {
		const entry = parseReadableSqliteSessionEntryRow(database, row);
		if (!entry || row.session_key !== sessionKey.trim()) continue;
		selected = {
			entry,
			row
		};
	}
	return selected;
}
function readSessionEntrySelectionSnapshot(database, sessionKey, exact) {
	const selected = exact ? readExactSessionEntryRow(database, sessionKey) : readSessionEntryRow(database, sessionKey);
	return selected ? [{
		entry: selected.entry,
		sessionKey: selected.row.session_key
	}] : [];
}
function readExactSessionEntryRow(database, sessionKey, projection = "full") {
	const db = getSessionKysely(database.db);
	const query = projection === "list" ? selectSessionEntryRows(database, projection).select(["current_session_id", "updated_at"]) : db.selectFrom("session_nodes").selectAll();
	const row = executeSqliteQueryTakeFirstSync(database.db, query.where("session_key", "=", sessionKey));
	if (!row) return;
	const entry = parseReadableSqliteSessionEntryRow(database, row, projection);
	return entry ? {
		entry,
		row
	} : void 0;
}
function readExactSessionEntryJson(database, sessionKey) {
	const db = getSessionKysely(database.db);
	return executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_nodes").select("entry_json").where("session_key", "=", sessionKey))?.entry_json;
}
function readExactSessionEntryRowValidated(database, sessionKey, projection = "full") {
	assertCanonicalSqliteSessionKeysCurrent(database);
	return readExactSessionEntryRow(database, sessionKey, projection);
}
function readSessionEntryStore(database, options = {}) {
	if (options.allowCanonicalRepair !== true) assertCanonicalSqliteSessionKeysCurrent(database);
	if (options.sessionKeys?.length === 0) return {};
	const query = getSessionKysely(database.db).selectFrom("session_nodes").selectAll().orderBy("session_key");
	const rows = iterateSqliteQuerySync(database.db, options.sessionKeys ? query.where("session_key", "in", options.sessionKeys) : query);
	const store = {};
	for (const row of rows) {
		const entry = parseSessionEntryJson(row);
		if (entry) store[row.session_key] = entry;
	}
	return store;
}
function readSessionEntryCount(database) {
	const db = getSessionKysely(database.db);
	const rows = iterateSqliteQuerySync(database.db, db.selectFrom("session_nodes").select(sessionEntryInventoryJson));
	let count = 0;
	for (const row of rows) count += row.entry_json === null || parseSessionEntryJson({ entry_json: row.entry_json }) ? 1 : 0;
	return count;
}
function* iterateSessionEntryKeys(database) {
	const db = getSessionKysely(database.db);
	for (const row of iterateSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([sessionEntryInventoryJson, "session_key"]).orderBy("session_key", "asc"))) if (row.entry_json === null || parseSessionEntryJson({ entry_json: row.entry_json })) yield row.session_key;
}
function resolveLifecyclePrimaryEntry(database, target, options = {}) {
	const rows = target.storeKeys.flatMap((key) => {
		const sessionKey = key.trim();
		const row = readExactSessionEntryRow(database, sessionKey);
		return row ? [{
			sessionKey,
			entry: row.entry
		}] : [];
	});
	if (rows.length > 1) throw canonicalSessionKeyMigrationRequiredError(`duplicate rows resolve to canonical session key ${target.canonicalKey}`);
	const [row] = rows;
	if (row && row.sessionKey !== target.canonicalKey && options.allowCanonicalMove !== true) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${target.canonicalKey}`);
	return row;
}
function readLifecycleTargetSnapshot(database, target, options = {}) {
	assertCanonicalSqliteSessionKeysCurrent(database);
	const row = resolveLifecyclePrimaryEntry(database, normalizeLifecycleTarget(target), options);
	return row ? [row] : [];
}
function normalizeLifecycleTarget(target) {
	const canonicalKey = normalizeSqliteSessionKey(target.canonicalKey);
	return {
		canonicalKey,
		storeKeys: uniqueStrings([canonicalKey, ...target.storeKeys.map(normalizeSqliteSessionKey)])
	};
}
//#region src/config/sessions/session-accessor.sqlite-reference-index.ts
// session-reference-index-v1: per-connection index of the session ids each session node references.
const SESSION_REFERENCE_LOAD_PAGE_KEYS = 200;
const SESSION_REFERENCE_PREWARM_PAGE_ROWS = 2e3;
const SESSION_REFERENCE_DIRTY_TABLE = "openclaw_session_reference_dirty";
const SESSION_REFERENCE_EPOCH_TABLE = "openclaw_session_reference_epoch";
const SESSION_REFERENCE_TRIGGERS = [
	"openclaw_session_reference_dirty_insert",
	"openclaw_session_reference_dirty_update",
	"openclaw_session_reference_dirty_delete"
];
const SESSION_REFERENCE_FINGERPRINT_COLUMNS = "rowid AS r, session_key AS k, current_session_id AS c, updated_at AS u, octet_length(entry_json) AS n";
const sessionReferenceIndexes = /* @__PURE__ */ new WeakMap();
function isSessionReferenceIndexEnabled(env = process.env) {
	return env.OPENCLAW_V_SESSION_REFERENCE_INDEX !== "0";
}
function sessionReferenceFingerprintOf(row) {
	return `${row.r}\u0000${row.c}\u0000${row.u ?? ""}\u0000${row.n ?? ""}`;
}
function readSessionReferencePragmaNumber(db, pragma) {
	const value = db.prepare(`PRAGMA main.${pragma}`).get()?.[pragma];
	if (typeof value !== "number") throw new Error(`SQLite did not return a numeric PRAGMA ${pragma}`);
	return value;
}
function sessionReferenceTrackerInstalled(db) {
	const row = db.prepare(`SELECT count(*) AS n FROM temp.sqlite_master WHERE name IN ('${SESSION_REFERENCE_DIRTY_TABLE}', '${SESSION_REFERENCE_EPOCH_TABLE}', ${SESSION_REFERENCE_TRIGGERS.map((name) => `'${name}'`).join(", ")})`).get();
	return Number(row.n) === 2 + SESSION_REFERENCE_TRIGGERS.length;
}
/** The connection's index, with its dirty-key triggers installed for the current schema. */
function ensureSessionReferenceIndex(db) {
	const schemaVersion = readSessionReferencePragmaNumber(db, "schema_version");
	const index = sessionReferenceIndexes.get(db);
	if (index && index.schemaVersion === schemaVersion && sessionReferenceTrackerInstalled(db)) return index;
	const mark = (key) => `INSERT INTO ${SESSION_REFERENCE_DIRTY_TABLE} (session_key) SELECT ${key}.session_key WHERE NOT EXISTS (SELECT 1 FROM ${SESSION_REFERENCE_DIRTY_TABLE} WHERE session_key = ${key}.session_key);`;
	// No constraints on the TEMP tables: an outer ON CONFLICT clause overrides a trigger's own
	// conflict handling, so a constrained insert could fail the session_nodes statement.
	db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS ${SESSION_REFERENCE_DIRTY_TABLE} (session_key TEXT);
    CREATE INDEX IF NOT EXISTS temp.${SESSION_REFERENCE_DIRTY_TABLE}_key ON ${SESSION_REFERENCE_DIRTY_TABLE} (session_key);
    CREATE TEMP TABLE IF NOT EXISTS ${SESSION_REFERENCE_EPOCH_TABLE} (token TEXT);
    DROP TRIGGER IF EXISTS ${SESSION_REFERENCE_TRIGGERS[0]};
    DROP TRIGGER IF EXISTS ${SESSION_REFERENCE_TRIGGERS[1]};
    DROP TRIGGER IF EXISTS ${SESSION_REFERENCE_TRIGGERS[2]};
    CREATE TEMP TRIGGER ${SESSION_REFERENCE_TRIGGERS[0]} AFTER INSERT ON main.session_nodes BEGIN ${mark("NEW")} END;
    CREATE TEMP TRIGGER ${SESSION_REFERENCE_TRIGGERS[1]} AFTER UPDATE ON main.session_nodes BEGIN ${mark("OLD")} ${mark("NEW")} END;
    CREATE TEMP TRIGGER ${SESSION_REFERENCE_TRIGGERS[2]} AFTER DELETE ON main.session_nodes BEGIN ${mark("OLD")} END;
    DELETE FROM ${SESSION_REFERENCE_EPOCH_TABLE};
  `);
	const sameSchema = index?.schemaVersion === schemaVersion;
	const next = {
		rows: sameSchema && index ? index.rows : /* @__PURE__ */ new Map(),
		schemaVersion,
		uncertain: sameSchema && index ? index.uncertain : /* @__PURE__ */ new Set()
	};
	sessionReferenceIndexes.set(db, next);
	return next;
}
function readSessionReferenceDirtyKeys(db) {
	return db.prepare(`SELECT DISTINCT session_key FROM temp.${SESSION_REFERENCE_DIRTY_TABLE} WHERE session_key IS NOT NULL`).all().map((row) => row.session_key);
}
function sessionReferenceEpochIsCurrent(db, index) {
	return index.token !== void 0 && db.prepare(`SELECT 1 AS ok FROM temp.${SESSION_REFERENCE_EPOCH_TABLE} WHERE token = ?`).get(index.token) !== void 0;
}
/** Record a completed validation through the caller's transaction (or autocommit). */
function sealSessionReferenceEpoch(db, index, dataVersion, consumeDirty) {
	const token = randomUUID();
	if (consumeDirty) db.prepare(`DELETE FROM temp.${SESSION_REFERENCE_DIRTY_TABLE}`).run();
	db.prepare(`DELETE FROM temp.${SESSION_REFERENCE_EPOCH_TABLE}`).run();
	db.prepare(`INSERT INTO temp.${SESSION_REFERENCE_EPOCH_TABLE} (token) VALUES (?)`).run(token);
	index.token = token;
	index.dataVersion = dataVersion;
}
function collectStaleSessionReferenceKeys(index, rows, seen) {
	const stale = [];
	for (const row of rows) {
		seen.add(row.k);
		if (index.rows.get(row.k)?.fingerprint !== sessionReferenceFingerprintOf(row)) stale.push(row.k);
	}
	return stale;
}
function dropMissingSessionReferenceRows(index, seen) {
	for (const key of index.rows.keys()) if (!seen.has(key)) index.rows.delete(key);
}
/** Load metadata projection and fingerprint of the given keys, one statement per page. */
function loadSessionReferenceRows(db, index, keys) {
	const kysely = getSessionKysely(db);
	for (let start = 0; start < keys.length; start += SESSION_REFERENCE_LOAD_PAGE_KEYS) {
		const page = keys.slice(start, start + SESSION_REFERENCE_LOAD_PAGE_KEYS);
		const rows = executeSqliteQuerySync(db, kysely.selectFrom("session_nodes").select([
			sessionEntryMetadataJson,
			"current_session_id",
			"session_key",
			sql`rowid`.as("r"),
			sql`updated_at`.as("u"),
			sql`octet_length(entry_json)`.as("n")
		]).where("session_key", "in", page)).rows;
		const found = /* @__PURE__ */ new Set();
		for (const row of rows) {
			found.add(row.session_key);
			const entry = parseSessionEntryJson({
				current_session_id: row.current_session_id,
				entry_json: row.entry_json
			});
			index.rows.set(row.session_key, {
				fingerprint: sessionReferenceFingerprintOf({
					r: row.r,
					k: row.session_key,
					c: row.current_session_id,
					u: row.u,
					n: row.n
				}),
				currentSessionId: row.current_session_id,
				sessionIds: entry ? collectSessionStateIdsForEntry(entry) : []
			});
		}
		for (const key of page) if (!found.has(key)) index.rows.delete(key);
	}
}
/** The connection's reference index, brought current synchronously (safe inside a write transaction). */
function refreshSessionReferenceIndexSync(database) {
	const db = database.db;
	const index = ensureSessionReferenceIndex(db);
	const inTransaction = db.isTransaction;
	const dataVersion = readSessionReferencePragmaNumber(db, "data_version");
	const epochCurrent = sessionReferenceEpochIsCurrent(db, index);
	if (epochCurrent && !inTransaction) index.uncertain.clear();
	const stale = new Set(readSessionReferenceDirtyKeys(db));
	if (index.dataVersion !== dataVersion || !epochCurrent) {
		const seen = /* @__PURE__ */ new Set();
		for (const key of collectStaleSessionReferenceKeys(index, db.prepare(`SELECT ${SESSION_REFERENCE_FINGERPRINT_COLUMNS} FROM main.session_nodes`).iterate(), seen)) stale.add(key);
		dropMissingSessionReferenceRows(index, seen);
	}
	if (!epochCurrent) for (const key of index.uncertain) stale.add(key);
	loadSessionReferenceRows(db, index, [...stale]);
	if (inTransaction) for (const key of stale) index.uncertain.add(key);
	else index.uncertain.clear();
	sealSessionReferenceEpoch(db, index, dataVersion, true);
	return index.rows;
}
const yieldSessionReferencePrewarm = () => new Promise((resolve) => setImmediate(resolve));
/** Validate the index outside any writer lane, one small page per event-loop turn. Best effort. */
async function prewarmSessionReferenceIndex(open) {
	if (!isSessionReferenceIndexEnabled()) return;
	try {
		const opened = open();
		if (!opened || opened.db.isTransaction) return;
		let db = opened.db;
		const index = ensureSessionReferenceIndex(db);
		const dataVersion = readSessionReferencePragmaNumber(db, "data_version");
		const epochCurrent = sessionReferenceEpochIsCurrent(db, index);
		if (epochCurrent) {
			index.uncertain.clear();
			if (index.dataVersion === dataVersion) return;
		}
		const usable = () => {
			const current = open();
			if (!current) return false;
			db = current.db;
			return !db.isTransaction && sessionReferenceIndexes.get(db) === index;
		};
		const seen = /* @__PURE__ */ new Set();
		const stale = [];
		let after = -1;
		for (;;) {
			const rows = db.prepare(`SELECT ${SESSION_REFERENCE_FINGERPRINT_COLUMNS} FROM main.session_nodes WHERE rowid > ? ORDER BY rowid LIMIT ${SESSION_REFERENCE_PREWARM_PAGE_ROWS}`).all(after);
			stale.push(...collectStaleSessionReferenceKeys(index, rows, seen));
			if (rows.length < SESSION_REFERENCE_PREWARM_PAGE_ROWS) break;
			after = rows[rows.length - 1].r;
			await yieldSessionReferencePrewarm();
			if (!usable()) return;
		}
		dropMissingSessionReferenceRows(index, seen);
		if (!epochCurrent) {
			const staleSet = new Set(stale);
			stale.push(...[...index.uncertain].filter((key) => !staleSet.has(key)));
		}
		for (let start = 0; start < stale.length; start += SESSION_REFERENCE_LOAD_PAGE_KEYS) {
			if (start > 0) {
				await yieldSessionReferencePrewarm();
				if (!usable()) return;
			}
			loadSessionReferenceRows(db, index, stale.slice(start, start + SESSION_REFERENCE_LOAD_PAGE_KEYS));
		}
		if (!usable()) return;
		index.uncertain.clear();
		sealSessionReferenceEpoch(db, index, dataVersion, false);
	} catch {}
}
/** Session ids referenced by live session nodes, except the excluded keys. */
function readReferencedSessionIdsFromIndex(database, excludedSessionKeys) {
	const sessionIds = /* @__PURE__ */ new Set();
	for (const [sessionKey, row] of refreshSessionReferenceIndexSync(database)) {
		if (excludedSessionKeys.has(sessionKey)) continue;
		sessionIds.add(row.currentSessionId);
		for (const sessionId of row.sessionIds) sessionIds.add(sessionId);
	}
	return sessionIds;
}
function compareSessionReferenceKeysBinary(left, right) {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
/** For each session id, the first other node (session_key in SQLite BINARY order) that owns or references it. */
function findSurvivingSessionNodeKeysFromIndex(database, sessionIds, excludedSessionKey) {
	const wanted = new Set(sessionIds);
	const owners = /* @__PURE__ */ new Map();
	if (wanted.size === 0) return owners;
	const consider = (sessionId, sessionKey) => {
		if (!wanted.has(sessionId)) return;
		const current = owners.get(sessionId);
		if (current === void 0 || compareSessionReferenceKeysBinary(sessionKey, current) < 0) owners.set(sessionId, sessionKey);
	};
	for (const [sessionKey, row] of refreshSessionReferenceIndexSync(database)) {
		if (sessionKey === excludedSessionKey) continue;
		consider(row.currentSessionId, sessionKey);
		for (const sessionId of row.sessionIds) consider(sessionId, sessionKey);
	}
	return owners;
}
/** First other node (session_key order) that owns or references each window. */
function findSurvivingSessionNodeKeys(database, sessionIds, sessionKey) {
	if (isSessionReferenceIndexEnabled()) try {
		return findSurvivingSessionNodeKeysFromIndex(database, sessionIds, sessionKey);
	} catch {}
	const survivingNodes = executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_nodes").select([
		"current_session_id",
		sessionEntryMetadataJson,
		"session_key"
	]).where("session_key", "!=", sessionKey).orderBy("session_key", "asc")).rows;
	const owners = /* @__PURE__ */ new Map();
	for (const sessionId of sessionIds) {
		const survivingNode = survivingNodes.find((node) => {
			if (node.current_session_id === sessionId) return true;
			const entry = parseSessionEntryJson(node);
			return entry ? collectSessionStateIdsForEntry(entry).includes(sessionId) : false;
		});
		if (survivingNode) owners.set(sessionId, survivingNode.session_key);
	}
	return owners;
}
//#endregion
function deleteSessionEntryRows(database, sessionKey, options = {}) {
	const previousEntry = options.validatedEntry ?? readExactSessionEntryRow(database, sessionKey)?.entry;
	if (previousEntry) commitSqliteSessionDeletion(sessionKey, previousEntry);
	const db = getSessionKysely(database.db);
	const windows = executeSqliteQuerySync(database.db, db.selectFrom("session_windows").select("session_id").where("session_key", "=", sessionKey)).rows;
	// session-reference-index-v1: the first surviving owner of each retained window, from the reference index.
	const survivingKeys = windows.length > 0 ? findSurvivingSessionNodeKeys(database, windows.map((window) => window.session_id), sessionKey) : /* @__PURE__ */ new Map();
	for (const window of windows) {
		const survivingKey = survivingKeys.get(window.session_id);
		if (survivingKey !== void 0) executeSqliteQuerySync(database.db, db.updateTable("session_windows").set({ session_key: survivingKey }).where("session_id", "=", window.session_id));
	}
	if (options.deleteOwnedWindows) {
		deleteSessionDeliveryArtifacts(database, sessionKey, options.deliveryCleanupKeys);
		deleteSessionNodeArtifacts(database, sessionKey);
		executeSqliteQuerySync(database.db, db.deleteFrom("session_nodes").where("session_key", "=", sessionKey));
		publishSessionEntryCacheInvalidation(database);
		return;
	}
	const remainingWindow = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_windows").select(["session_id", "updated_at"]).where("session_key", "=", sessionKey).orderBy("updated_at", "desc").orderBy("session_id", "asc").limit(1));
	if (remainingWindow) {
		deleteSessionNodeArtifacts(database, sessionKey);
		clearSqliteSessionEntryPreservingWindows(database, {
			sessionId: remainingWindow.session_id,
			sessionKey,
			updatedAt: remainingWindow.updated_at
		});
		publishSessionEntryCacheInvalidation(database);
		return;
	}
	executeSqliteQuerySync(database.db, db.deleteFrom("session_nodes").where("session_key", "=", sessionKey));
	publishSessionEntryCacheInvalidation(database);
}
/** Remove the logical entry while retaining its node-owned transcript windows. */
function clearSqliteSessionEntryPreservingWindows(database, params) {
	const db = getSessionKysely(database.db);
	const cleared = {
		current_session_id: params.sessionId,
		entry_json: "{}",
		entry_valid: -1,
		updated_at: params.updatedAt,
		status: null,
		created_at: null,
		created_via: null,
		created_actor_type: null,
		created_actor_id: null,
		project_id: null,
		parent_session_key: null,
		spawned_by: null,
		fork_source_session_key: null,
		fork_source_session_id: null,
		fork_source_entry_id: null,
		label: null,
		display_name: null,
		category: null,
		icon: null,
		pinned_at: null,
		archived_at: null,
		last_read_at: null,
		last_interaction_at: null,
		last_activity_at: null,
		...hasSqliteSessionOwnerColumns(database.db) ? {
			owner_actor_type: null,
			owner_actor_id: null,
			owner_assigned_by_type: null,
			owner_assigned_by_id: null,
			owner_assigned_at: null
		} : {}
	};
	executeSqliteQuerySync(database.db, db.insertInto("session_nodes").values({
		session_key: params.sessionKey,
		...cleared
	}).onConflict((conflict) => conflict.column("session_key").doUpdateSet(cleared)));
	executeSqliteQuerySync(database.db, db.updateTable("session_nodes").set({ entry_valid: -1 }).where("session_key", "=", params.sessionKey));
}
function deleteLifecycleTargetRows(database, target) {
	for (const sessionKey of uniqueStrings([target.canonicalKey, ...target.storeKeys])) {
		const trimmed = sessionKey.trim();
		if (trimmed) deleteSessionEntryRows(database, trimmed);
	}
}
function sqliteLifecycleTargetMatchesExpectedEntry(database, target, expectedEntry) {
	const current = resolveLifecyclePrimaryEntry(database, target)?.entry;
	if (!current || !expectedEntry) return current === expectedEntry;
	return sqliteSessionEntriesEqual(current, expectedEntry);
}
function assertLifecycleTargetUnchanged(database, target, expectedEntry, operation) {
	if (sqliteLifecycleTargetMatchesExpectedEntry(database, target, expectedEntry)) return;
	throw new Error(`SQLite session entry changed before ${operation} lifecycle mutation`);
}
function deleteLegacySessionEntryRows(database, legacyKeys, sessionKey, options = {}) {
	if (legacyKeys.length === 0) return;
	const db = getSessionKysely(database.db);
	for (const legacyKey of legacyKeys) {
		if (legacyKey === sessionKey) continue;
		const previousEntry = options.validatedEntries?.get(legacyKey) ?? readExactSessionEntryRow(database, legacyKey)?.entry;
		if (previousEntry) commitSqliteSessionDeletion(legacyKey, previousEntry);
		rehomeSessionWindows(database, sessionKey, [legacyKey]);
		copySessionNodeArtifactsForRepair(database, database, [legacyKey], sessionKey, { includeMembers: options.rehomeMembers });
		executeSqliteQuerySync(database.db, db.deleteFrom("session_nodes").where("session_key", "=", legacyKey));
		publishSessionEntryCacheInvalidation(database);
	}
}
/** Move retained generations to the canonical node before removing key aliases. */
function rehomeSessionWindows(database, canonicalKey, previousKeys) {
	const legacyKeys = uniqueStrings([...previousKeys].map((key) => key.trim())).filter((key) => key && key !== canonicalKey);
	if (legacyKeys.length === 0) return;
	const db = getSessionKysely(database.db);
	executeSqliteQuerySync(database.db, db.updateTable("session_windows").set({ session_key: canonicalKey }).where("session_key", "in", legacyKeys));
}
function writeSessionEntry(database, sessionKey, entry, options = {}) {
	const db = getSessionKysely(database.db);
	if (!options.allowStoredAliases) {
		assertCanonicalSessionKeyWriteMatchesDatabase(database, sessionKey);
		assertCanonicalSessionEntryLineageWrite(database, entry);
		if (resolveDeliveryProvenCanonicalSessionKey(sessionKey, entry) !== sessionKey) throw canonicalSessionKeyMigrationRequiredError(`refusing non-canonical session key write ${sessionKey}`);
	}
	let normalizedEntry = normalizeSessionEntryTimestamp(entry);
	if (!hasValidSessionEntryIdentity(normalizedEntry)) throw new Error("Refusing invalid SQLite session entry identity");
	const updatedAt = normalizedEntry.updatedAt;
	const canonicalPreviousEntry = options.allowStoredAliases && options.previousEntry !== void 0 ? options.previousEntry ?? void 0 : readExactSessionEntryRow(database, sessionKey)?.entry;
	if (canonicalPreviousEntry?.sandbox === "required") {
		if (normalizedEntry.sandbox !== "required" || normalizedEntry.createdVia !== canonicalPreviousEntry.createdVia || normalizedEntry.createdAt !== canonicalPreviousEntry.createdAt || !isDeepStrictEqual(normalizedEntry.createdActor, canonicalPreviousEntry.createdActor)) getChildLogger({ subsystem: "session-sqlite" }).warn("blocked role-required session creation provenance downgrade", {
			agentId: database.agentId,
			sessionKey
		});
	}
	if (!options.allowStoredAliases || canonicalPreviousEntry?.sandbox === "required") normalizedEntry = preserveCreationStamp(normalizedEntry, canonicalPreviousEntry);
	const previousEntry = options.previousEntry === void 0 ? canonicalPreviousEntry : options.previousEntry ?? void 0;
	if (previousEntry && previousEntry.sessionId !== normalizedEntry.sessionId) delete normalizedEntry.visibility;
	if (canonicalPreviousEntry && canonicalPreviousEntry.sessionId !== normalizedEntry.sessionId) clearSessionCollaborationForKey(database, sessionKey, { clearSuggestions: options.preserveNodeSuggestions !== true });
	const transcriptObservedAt = readTranscriptMutationStateInTransaction(database, normalizedEntry.sessionId).updatedAt ?? updatedAt;
	const boundSessionRoot = bindSessionRoot({
		entry: normalizedEntry,
		sessionKey,
		updatedAt
	});
	const conversation = prepareSessionConversationForWrite({
		database,
		entry: normalizedEntry,
		previousEntry,
		...options.routeContext !== void 0 ? { routeContext: options.routeContext } : {},
		sessionScope: boundSessionRoot.session_scope
	});
	if (conversation) upsertConversationIdentity(database, conversation.identity, updatedAt);
	const sessionRow = resolveSessionEntryProvenanceRow({
		boundSessionRow: {
			...boundSessionRoot,
			primary_conversation_id: conversation?.role === "primary" ? conversation.identity.conversationRef : null,
			transcript_observed_at: transcriptObservedAt
		},
		database,
		entry: normalizedEntry,
		previousEntry
	});
	const sessionNode = bindSessionNode({
		entry: normalizedEntry,
		sessionKey,
		updatedAt
	});
	const writeGeneration = trackSessionEntryCacheWrite(database, () => {
		executeSqliteQuerySync(database.db, db.insertInto("session_nodes").values(sessionNode).onConflict((conflict) => conflict.column("session_key").doUpdateSet({
			current_session_id: sessionNode.current_session_id,
			entry_json: sessionNode.entry_json,
			entry_valid: sessionNode.entry_valid,
			updated_at: sessionNode.updated_at,
			status: sessionNode.status,
			created_at: sessionNode.created_at,
			created_via: sessionNode.created_via,
			created_actor_type: sessionNode.created_actor_type,
			created_actor_id: sessionNode.created_actor_id,
			project_id: sessionNode.project_id,
			parent_session_key: sessionNode.parent_session_key,
			spawned_by: sessionNode.spawned_by,
			fork_source_session_key: sessionNode.fork_source_session_key,
			fork_source_session_id: sessionNode.fork_source_session_id,
			fork_source_entry_id: sessionNode.fork_source_entry_id,
			label: sessionNode.label,
			display_name: sessionNode.display_name,
			category: sessionNode.category,
			icon: sessionNode.icon,
			pinned_at: sessionNode.pinned_at,
			archived_at: sessionNode.archived_at,
			last_read_at: sessionNode.last_read_at,
			last_interaction_at: sessionNode.last_interaction_at,
			last_activity_at: sessionNode.last_activity_at
		})));
		executeSqliteQuerySync(database.db, db.updateTable("session_nodes").set({ entry_valid: 1 }).where("session_key", "=", sessionKey));
	});
	executeSqliteQuerySync(database.db, db.insertInto("session_windows").values(sessionRow).onConflict((conflict) => conflict.column("session_id").doUpdateSet({
		session_key: sessionKey,
		previous_session_id: sessionRow.previous_session_id,
		reason: sessionRow.reason,
		session_scope: sessionRow.session_scope,
		transcript_observed_at: transcriptObservedAt,
		session_entry_provenance: sessionRow.session_entry_provenance,
		acp_owned: sessionRow.acp_owned,
		plugin_owner_id: sessionRow.plugin_owner_id,
		hook_external_content_source: sessionRow.hook_external_content_source,
		updated_at: updatedAt,
		started_at: sessionRow.started_at,
		ended_at: sessionRow.ended_at,
		status: sessionRow.status,
		chat_type: sessionRow.chat_type,
		channel: sessionRow.channel,
		account_id: sessionRow.account_id,
		primary_conversation_id: sessionRow.primary_conversation_id,
		model_provider: sessionRow.model_provider,
		model: sessionRow.model,
		agent_harness_id: sessionRow.agent_harness_id,
		parent_session_key: sessionRow.parent_session_key,
		spawned_by: sessionRow.spawned_by,
		display_name: sessionRow.display_name
	})));
	if (conversation) linkSessionConversation({
		database,
		...previousEntry?.sessionId ? { previousSessionId: previousEntry.sessionId } : {},
		sessionId: sessionRow.session_id,
		conversation,
		updatedAt
	});
	publishSessionEntryCacheInvalidation(database, {
		sessionKey,
		entry: normalizedEntry
	}, writeGeneration);
	return normalizedEntry;
}
//#endregion
export { isSessionReferenceIndexEnabled, prewarmSessionReferenceIndex, readReferencedSessionIdsFromIndex, registerSessionPendingInputOwner as A, withSessionInitializationSource as B, deleteSessionDeliveryArtifacts as C, projectSessionPendingInput as D, parseSessionPendingInputMessage as E, runPreparedSqliteSessionWrite as F, parseConversationRouteContext as G, buildConversationIdentity as H, runSqliteSessionDeletionTransaction as I, sqliteLifecycleTargetSnapshotsEqual as J, parseStoredConversationRouteContext as K, withSqliteSessionDeletions as L, resolveSessionPendingInputAppend as M, runWithSessionPendingInput as N, readSessionPendingInputByKey as O, runWithSessionPendingInputPersistence as P, deriveSessionOrigin as Q, captureSessionInitializationOwner as R, copySessionNodeArtifactsForRepair as S, consumeSessionPendingInput as T, conversationIdentityFromMsgContext as U, upsertConversationIdentity as V, conversationRouteContextFromMsgContext as W, deriveLastRoutePatch as X, sqliteSessionEntriesEqual as Y, deriveSessionMetaPatch as Z, rehomeSessionWindows as _, iterateSessionEntryKeys as a, bindSessionWindowEntryProjection as b, readExactSessionEntryJson as c, readLifecycleTargetSnapshot as d, readSessionEntryCount as f, readSessionIdentitySnapshot as g, readSessionEntryStore as h, deleteSessionEntryRows as i, releaseSessionPendingInputOwner as j, readSessionPendingInputOwnerIds as k, readExactSessionEntryRow as l, readSessionEntrySelectionSnapshot as m, deleteLegacySessionEntryRows as n, normalizeLifecycleTarget as o, readSessionEntryRow as p, assertLifecycleTargetSnapshotUnchanged as q, deleteLifecycleTargetRows as r, parseReadableSqliteSessionEntryRow as s, assertLifecycleTargetUnchanged as t, readExactSessionEntryRowValidated as u, resolveLifecyclePrimaryEntry as v, deleteSessionMembersForRepair as w, collectSessionStateIdsForEntry as x, writeSessionEntry as y, createSessionInitialization as z };
