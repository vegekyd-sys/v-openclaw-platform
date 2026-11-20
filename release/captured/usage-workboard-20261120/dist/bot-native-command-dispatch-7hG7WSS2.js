import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { r as logVerbose, t as danger } from "./globals-Dl0PaL2u.js";
import "./channel-outbound-dOhEOvWr.js";
import { y as resolveChannelStreamingBlockEnabled } from "./streaming-DfuqOee4.js";
import { i as PLUGIN_COMMAND_DISPATCH } from "./plugin-command-runtime-CxloO-SR.js";
import "./runtime-env-BIoctfDh.js";
import { i as isChannelPartialDeliveryError } from "./delivery-result-HxHyco6f.js";
import { t as resolveMarkdownTableMode } from "./markdown-tables-SZ7TCxGW.js";
import { m as resolveStorePath } from "./session-store-runtime-Di9N1AZ9.js";
import "./channel-inbound-BdUpfMiU.js";
import "./plugin-command-runtime-Ba4aESoK.js";
import "./markdown-table-runtime-Clzg_KX_.js";
import { t as resolveNativeCommandSessionTargets } from "./native-command-session-targets-QmDJndPx.js";
import "./command-auth-native-8s54zPyc.js";
import { a as normalizeDmAllowFromWithStore, o as resolveTelegramEffectiveDmPolicy, t as expandTelegramAllowFromWithAccessGroups } from "./access-groups-BQMtBJdF.js";
import { o as resolveTelegramAccount } from "./accounts-ezkRkrYh.js";
import { d as shouldSuppressLocalTelegramExecApprovalPrompt } from "./exec-approvals-B9CO2ilR.js";
import { D as buildSenderName, b as resolveTelegramMessageThreadSpec, c as buildTelegramThreadParams, d as extractTelegramForumFlag, g as resolveTelegramForumFlag, h as resolveTelegramCommandAuthorization, m as resolveTelegramBotHasTopicsEnabled, p as isTelegramCommandsAllowFromConfigured, r as buildTelegramGroupFrom, s as buildTelegramRoutingTarget, v as resolveTelegramGroupAllowFromContext } from "./helpers-DEd6NfQU.js";
import { a as resolveTelegramTargetSession, i as resolveTelegramConversationRoute, t as buildTelegramConversationRouteContext } from "./conversation-route-DPlSZpCP.js";
import { K as resolveTelegramGroupPromptSettings, W as resolveTelegramDirectToolPolicy } from "./text-chunk-limit-qImmQs06.js";
import { t as resolveTelegramAccountOwnerAgentId } from "./account-owner-CrNRC3se.js";
import { n as getTopicName, o as resolveTopicNameCacheScope } from "./topic-name-cache-Cqs11iBo.js";
import { mt as evaluateTelegramGroupPolicyAccess, pt as evaluateTelegramGroupBaseAccess } from "./send-DHnAItg0.js";
import { t as withTelegramApiErrorLogging } from "./api-logging-DT6ZktrD.js";
import { T as resolveTelegramCommandIngressAuthorization, n as resolveTelegramMessageTurnSettings } from "./bot-message-DC6p8sB3.js";
import { t as defaultTelegramNativeCommandDeps } from "./bot-native-command-deps.runtime.js";
//#region extensions/telegram/src/bot-native-command-dispatch.ts
const EMPTY_RESPONSE_FALLBACK = "No response generated. Please try again.";
const loadTelegramNativeCommandDeliveryRuntime = createLazyRuntimeModule(() => import("./bot-native-commands.delivery.runtime.js"));
const loadTelegramNativeCommandRuntime = createLazyRuntimeModule(() => import("./bot-native-commands.runtime.js"));
async function resolveTelegramNativeCommandThreadContext(params) {
	const { msg, bot } = params;
	const chatId = msg.chat.id;
	const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
	const getChat = typeof bot.api.getChat === "function" ? bot.api.getChat.bind(bot.api) : void 0;
	const isForum = msg.chat.is_direct_messages === true ? false : await resolveTelegramForumFlag({
		chatId,
		chatType: msg.chat.type,
		isGroup,
		isForum: extractTelegramForumFlag(msg.chat),
		isTopicMessage: msg.is_topic_message,
		getChat
	});
	const threadSpec = resolveTelegramMessageThreadSpec(msg, isForum);
	return {
		chatId,
		isGroup,
		isForum,
		threadSpec,
		threadParams: buildTelegramThreadParams(threadSpec)
	};
}
async function resolveTelegramCommandAuth(params) {
	const { msg, bot, cfg, accountId, telegramCfg, requireAuth } = params;
	const { chatId, isGroup, isForum, threadSpec, threadParams } = await resolveTelegramNativeCommandThreadContext({
		msg,
		bot
	});
	const senderId = msg.from?.id ? String(msg.from.id) : "";
	const senderUsername = msg.from?.username ?? "";
	const commandsAllowFromConfigured = isTelegramCommandsAllowFromConfigured(cfg);
	const preContextCommandsAllowFromAccess = commandsAllowFromConfigured ? resolveTelegramCommandAuthorization({
		cfg,
		accountId,
		chatId,
		isGroup,
		threadSpec,
		senderId,
		senderUsername,
		commandText: params.commandText // v-experience-telegram-v1
	}) : null;
	const { resolvedThreadId, dmThreadId, storeAllowFrom, groupConfig, topicConfig, groupAllowOverride, effectiveGroupAllow, hasGroupAllowOverride } = await resolveTelegramGroupAllowFromContext({
		cfg,
		chatId,
		accountId,
		dmPolicy: telegramCfg.dmPolicy,
		allowFrom: params.allowFrom,
		senderId,
		isGroup,
		threadSpec,
		groupAllowFrom: params.groupAllowFrom,
		skipPairingStoreRead: Boolean(preContextCommandsAllowFromAccess?.isAuthorizedSender),
		readChannelAllowFromStore: params.readChannelAllowFromStore,
		resolveTelegramGroupConfig: params.resolveTelegramGroupConfig
	});
	const effectiveDmPolicy = resolveTelegramEffectiveDmPolicy({
		isGroup,
		groupConfig,
		dmPolicy: telegramCfg.dmPolicy
	});
	const requireTopic = !isGroup && groupConfig && "requireTopic" in groupConfig ? groupConfig.requireTopic : void 0;
	if (!isGroup && requireTopic === true && dmThreadId == null) {
		logVerbose(`Blocked telegram command in DM ${chatId}: requireTopic=true but no topic present`);
		return null;
	}
	const commandsAllowFromAccess = commandsAllowFromConfigured ? resolveTelegramCommandAuthorization({
		cfg,
		accountId,
		chatId,
		isGroup,
		threadSpec,
		senderId,
		senderUsername,
		commandText: params.commandText // v-experience-telegram-v1
	}) : null;
	const ownerAccess = resolveTelegramCommandAuthorization({
		cfg,
		accountId,
		chatId,
		isGroup,
		threadSpec,
		senderId,
		senderUsername
	});
	const sendAuthMessage = async (text) => {
		await withTelegramApiErrorLogging({
			operation: "sendMessage",
			fn: () => bot.api.sendMessage(chatId, text, threadParams ?? {})
		});
		return null;
	};
	const rejectNotAuthorized = async () => await sendAuthMessage("You are not authorized to use this command.");
	const baseAccess = evaluateTelegramGroupBaseAccess({
		isGroup,
		groupConfig,
		topicConfig,
		hasGroupAllowOverride,
		effectiveGroupAllow,
		senderId,
		senderUsername,
		enforceAllowOverride: requireAuth,
		requireSenderForAllowOverride: true
	});
	if (!baseAccess.allowed) {
		if (baseAccess.reason === "group-disabled") {
			logVerbose(`Blocked telegram command in group ${chatId} (group disabled)`);
			return null;
		}
		if (baseAccess.reason === "topic-disabled") {
			logVerbose(`Blocked telegram command in topic ${chatId} (${resolvedThreadId ?? "unknown"}) (topic disabled)`);
			return null;
		}
		return await rejectNotAuthorized();
	}
	const policyAccess = evaluateTelegramGroupPolicyAccess({
		isGroup,
		chatId,
		cfg,
		telegramCfg,
		topicConfig,
		groupConfig,
		effectiveGroupAllow,
		senderId,
		senderUsername,
		resolveGroupPolicy: params.resolveGroupPolicy,
		enforcePolicy: true,
		enforceAllowlistAuthorization: requireAuth && !commandsAllowFromConfigured,
		allowEmptyAllowlistEntries: true,
		requireSenderForAllowlistAuthorization: true,
		checkChatAllowlist: true
	});
	if (!policyAccess.allowed) {
		if (policyAccess.reason === "group-policy-disabled") {
			logVerbose("Blocked telegram command (groupPolicy: disabled)");
			return null;
		}
		if (policyAccess.reason === "group-policy-allowlist-no-sender" || policyAccess.reason === "group-policy-allowlist-unauthorized") return await rejectNotAuthorized();
		if (policyAccess.reason === "group-chat-not-allowed") {
			logVerbose(`Blocked telegram command in group ${chatId} (group not allowed)`);
			return null;
		}
	}
	const expandedDmAllowFrom = await expandTelegramAllowFromWithAccessGroups({
		cfg,
		allowFrom: groupAllowOverride ?? params.allowFrom,
		accountId,
		senderId
	});
	const dmAllow = normalizeDmAllowFromWithStore({
		allowFrom: expandedDmAllowFrom,
		storeAllowFrom: isGroup ? [] : storeAllowFrom,
		dmPolicy: effectiveDmPolicy
	});
	const commandAuthorized = commandsAllowFromConfigured ? Boolean(commandsAllowFromAccess?.isAuthorizedSender) : (await resolveTelegramCommandIngressAuthorization({
		accountId,
		cfg,
		dmPolicy: effectiveDmPolicy,
		isGroup,
		chatId,
		resolvedThreadId,
		senderId,
		effectiveDmAllow: dmAllow,
		effectiveGroupAllow,
		ownerAccess,
		eventKind: "native-command"
	})).authorized;
	if (requireAuth && !commandAuthorized) return await rejectNotAuthorized();
	return {
		chatId,
		isGroup,
		isForum,
		resolvedThreadId,
		senderId,
		senderUsername,
		groupConfig,
		topicConfig,
		threadSpec,
		commandAuthorized,
		senderIsOwner: ownerAccess.senderIsOwner
	};
}
async function prepareTelegramCommandDispatch(params) {
	const telegramDeps = params.telegramDeps ?? defaultTelegramNativeCommandDeps;
	const runtimeCfg = telegramDeps.getRuntimeConfig();
	const runtimeTelegramCfg = resolveTelegramAccount({
		cfg: runtimeCfg,
		accountId: params.accountId
	}).config;
	const turnSettings = resolveTelegramMessageTurnSettings({
		accountId: params.accountId,
		cfg: runtimeCfg,
		telegramCfg: runtimeTelegramCfg,
		opts: params.opts
	});
	const auth = await resolveTelegramCommandAuth({
		msg: params.msg,
		bot: params.bot,
		cfg: runtimeCfg,
		accountId: params.accountId,
		telegramCfg: runtimeTelegramCfg,
		readChannelAllowFromStore: telegramDeps.readChannelAllowFromStore,
		allowFrom: turnSettings.allowFrom,
		groupAllowFrom: turnSettings.groupAllowFrom,
		resolveGroupPolicy: params.resolveGroupPolicy,
		resolveTelegramGroupConfig: params.resolveTelegramGroupConfig,
		requireAuth: params.requireAuth,
		commandText: params.commandText // v-experience-telegram-v1
	});
	if (!auth) return null;
	const { route, bindingMode } = resolveTelegramConversationRoute({
		cfg: runtimeCfg,
		accountId: params.accountId,
		chatId: auth.chatId,
		isGroup: auth.isGroup,
		threadSpec: auth.threadSpec,
		senderId: auth.senderId,
		topicAgentId: auth.topicConfig?.agentId
	});
	const nativeCommandRuntime = await loadTelegramNativeCommandRuntime();
	if (bindingMode.kind === "configured") {
		const ensured = await nativeCommandRuntime.ensureConfiguredBindingRouteReady({
			cfg: runtimeCfg,
			bindingResolution: bindingMode.binding
		});
		if (!ensured.ok) {
			logVerbose(`telegram native command: configured ACP binding unavailable for topic ${bindingMode.binding.record.conversation.conversationId}: ${ensured.error}`);
			await withTelegramApiErrorLogging({
				operation: "sendMessage",
				runtime: params.runtime,
				fn: () => params.bot.api.sendMessage(auth.chatId, "Configured ACP binding is unavailable right now. Please try again.", buildTelegramThreadParams(auth.threadSpec) ?? {})
			});
			return null;
		}
	}
	const mediaLocalRoots = nativeCommandRuntime.getAgentScopedMediaLocalRoots(runtimeCfg, route.agentId);
	const tableMode = resolveMarkdownTableMode({
		cfg: runtimeCfg,
		channel: "telegram",
		accountId: route.accountId,
		supportsBlockTables: true
	});
	const chunkMode = nativeCommandRuntime.resolveChunkMode(runtimeCfg, "telegram", route.accountId);
	const targetSessionKey = resolveTelegramTargetSession({
		cfg: runtimeCfg,
		route,
		chatId: auth.chatId,
		isGroup: auth.isGroup,
		senderId: auth.senderId,
		dmThreadId: auth.threadSpec.scope === "dm" ? auth.threadSpec.id : void 0,
		botHasTopicsEnabled: resolveTelegramBotHasTopicsEnabled(params.botUser)
	});
	const buildDeliveryBaseOptions = (keys) => ({
		cfg: runtimeCfg,
		ownerAgentId: params.opts.ownerAgentId,
		chatId: String(auth.chatId),
		accountId: route.accountId,
		sessionKeyForInternalHooks: keys?.sessionKeyForInternalHooks,
		policySessionKey: keys?.policySessionKey,
		mirrorIsGroup: auth.isGroup,
		mirrorGroupId: auth.isGroup ? String(auth.chatId) : void 0,
		token: params.opts.token,
		runtime: params.runtime,
		bot: params.bot,
		mediaLocalRoots,
		mediaMaxBytes: params.mediaMaxBytes,
		replyToMode: turnSettings.replyToMode,
		textLimit: turnSettings.textLimit,
		thread: auth.threadSpec,
		tableMode,
		chunkMode,
		linkPreview: runtimeTelegramCfg.linkPreview,
		richMessages: runtimeTelegramCfg.richMessages
	});
	return {
		...params,
		telegramDeps,
		runtimeCfg,
		runtimeTelegramCfg,
		turnSettings,
		...auth,
		threadSpec: auth.threadSpec,
		threadParams: buildTelegramThreadParams(auth.threadSpec),
		route,
		mediaLocalRoots,
		targetSessionKey,
		nativeCommandRuntime,
		buildDeliveryBaseOptions,
		loadDeliveryRuntime: loadTelegramNativeCommandDeliveryRuntime
	};
}
async function dispatchTelegramBuiltinTurn(params) {
	const { dispatch } = params;
	const { skillFilter, groupSystemPrompt } = resolveTelegramGroupPromptSettings({
		groupConfig: dispatch.groupConfig,
		topicConfig: dispatch.topicConfig
	});
	const { sessionKey: commandSessionKey, commandTargetSessionKey } = resolveNativeCommandSessionTargets({
		agentId: dispatch.route.agentId,
		sessionPrefix: "telegram:slash",
		userId: String(dispatch.senderId || dispatch.chatId),
		targetSessionKey: dispatch.targetSessionKey
	});
	let topicName;
	if (dispatch.isForum && dispatch.resolvedThreadId != null) try {
		const storePath = resolveStorePath(dispatch.runtimeCfg.session?.store, { agentId: dispatch.opts.ownerAgentId ?? resolveTelegramAccountOwnerAgentId({
			cfg: dispatch.runtimeCfg,
			accountId: dispatch.route.accountId
		}) });
		topicName = await getTopicName(dispatch.chatId, dispatch.resolvedThreadId, resolveTopicNameCacheScope(storePath));
	} catch {}
	const conversationLabel = dispatch.isGroup ? dispatch.msg.chat.title ? `${dispatch.msg.chat.title} id:${dispatch.chatId}` : `group:${dispatch.chatId}` : buildSenderName(dispatch.msg) ?? String(dispatch.senderId || dispatch.chatId);
	const ctxPayload = dispatch.nativeCommandRuntime.finalizeInboundContext({
		Body: params.prompt,
		BodyForAgent: params.prompt,
		RawBody: params.prompt,
		CommandBody: params.prompt,
		CommandArgs: params.commandArgs,
		From: dispatch.isGroup ? buildTelegramGroupFrom(dispatch.chatId, dispatch.threadSpec) : `telegram:${dispatch.chatId}`,
		To: `slash:${dispatch.senderId || dispatch.chatId}`,
		ChatType: dispatch.isGroup ? "group" : "direct",
		...buildTelegramConversationRouteContext(dispatch),
		ConversationToolPolicy: dispatch.isGroup ? void 0 : resolveTelegramDirectToolPolicy({
			directConfig: dispatch.groupConfig,
			senderId: dispatch.senderId,
			senderName: buildSenderName(dispatch.msg),
			senderUsername: dispatch.senderUsername
		}),
		ConversationLabel: conversationLabel,
		GroupSubject: dispatch.isGroup ? dispatch.msg.chat.title ?? void 0 : void 0,
		GroupSystemPrompt: dispatch.isGroup || !dispatch.isGroup && dispatch.groupConfig ? groupSystemPrompt : void 0,
		SenderName: buildSenderName(dispatch.msg),
		SenderId: dispatch.senderId || void 0,
		SenderUsername: dispatch.senderUsername || void 0,
		Surface: "telegram",
		Provider: "telegram",
		MessageSid: String(dispatch.msg.message_id),
		Timestamp: dispatch.msg.date ? dispatch.msg.date * 1e3 : void 0,
		WasMentioned: true,
		CommandAuthorized: dispatch.commandAuthorized,
		CommandTurn: {
			kind: "native",
			source: "native",
			authorized: dispatch.commandAuthorized,
			body: params.prompt
		},
		CommandSource: "native",
		SessionKey: commandSessionKey,
		AccountId: dispatch.route.accountId,
		CommandTargetSessionKey: commandTargetSessionKey,
		MessageThreadId: dispatch.threadSpec.id,
		IsForum: dispatch.isForum,
		TopicName: dispatch.isForum && topicName ? topicName : void 0,
		OriginatingChannel: "telegram",
		OriginatingTo: buildTelegramRoutingTarget(dispatch.chatId, dispatch.threadSpec)
	});
	const deliveryState = {
		delivered: false,
		skippedNonSilent: 0,
		failedNonSilent: 0
	};
	let finalReplyOutcome;
	let recordSessionMetaTask;
	const deliveryBaseOptions = dispatch.buildDeliveryBaseOptions({
		sessionKeyForInternalHooks: commandSessionKey,
		policySessionKey: commandTargetSessionKey
	});
	const { deliverReplies } = await dispatch.loadDeliveryRuntime();
	const turnPlan = {
		cfg: dispatch.runtimeCfg,
		channel: "telegram",
		accountId: dispatch.route.accountId,
		route: {
			agentId: dispatch.route.agentId,
			sessionKey: commandSessionKey
		},
		ctxPayload,
		dispatchReplyFromConfig: dispatch.opts.dispatchReplyFromConfig,
		record: {
			sessionKey: commandTargetSessionKey,
			trackSessionMetaTask: (task) => {
				recordSessionMetaTask = task;
			},
			onRecordError: (error) => dispatch.runtime.error?.(danger(`telegram slash: failed updating session meta: ${String(error)}`))
		},
		afterRecord: async () => {
			await recordSessionMetaTask;
		},
		replyPipeline: {},
		dispatcherOptions: {
			beforeDeliver: async (payload) => payload,
			onSkip: (_payload, info) => {
				if (info.reason !== "silent") deliveryState.skippedNonSilent += 1;
			}
		},
		delivery: {
			deliverWithProviderMessageSending: async (payload, info) => {
				if (shouldSuppressLocalTelegramExecApprovalPrompt({
					cfg: dispatch.runtimeCfg,
					accountId: dispatch.route.accountId,
					payload
				})) {
					deliveryState.delivered = true;
					return {
						visibleReplySent: false,
						suppression: { reason: "no_visible_result" }
					};
				}
				const targetedPayload = payload.replyToId ? payload : {
					...payload,
					replyToId: String(dispatch.msg.message_id)
				};
				const result = await deliverReplies({
					replies: [info.bindPendingFinalDelivery ? info.bindPendingFinalDelivery(targetedPayload) : targetedPayload],
					...deliveryBaseOptions,
					silent: dispatch.runtimeTelegramCfg.silentErrorReplies === true && payload.isError === true,
					onPlatformSendDispatch: info.onPlatformSendDispatch,
					assertPlatformSendAuthorized: info.assertPlatformSendAuthorized
				});
				if (result.delivered) deliveryState.delivered = true;
				return result.delivered ? { visibleReplySent: true } : {
					visibleReplySent: false,
					suppression: { reason: "no_visible_result" }
				};
			},
			onDelivered: (_payload, info, result) => {
				const reason = result?.suppression?.reason;
				if (info.kind === "final" && result?.visibleReplySent) finalReplyOutcome = "accepted";
				if (info.kind === "final" && finalReplyOutcome !== "failed" && (reason === "cancelled_by_reply_payload_sending_hook" || reason === "empty_after_reply_payload_sending_hook")) finalReplyOutcome = "suppressed";
			},
			onError: (error, info) => {
				deliveryState.failedNonSilent += 1;
				const partialDelivery = isChannelPartialDeliveryError(error);
				if (partialDelivery) {
					deliveryState.delivered = true;
					logVerbose("telegram slash reply partially delivered before failure");
				}
				if (info.kind === "final") finalReplyOutcome = partialDelivery ? "accepted" : "failed";
				dispatch.runtime.error?.(danger(`telegram slash ${info.kind} reply failed: ${String(error)}`));
			}
		},
		replyOptions: {
			skillFilter,
			disableBlockStreaming: (() => {
				const enabled = resolveChannelStreamingBlockEnabled(dispatch.runtimeTelegramCfg);
				return typeof enabled === "boolean" ? !enabled : void 0;
			})(),
			[PLUGIN_COMMAND_DISPATCH]: { kind: "non-plugin" }
		}
	};
	const turnResult = await (dispatch.telegramDeps.dispatchChannelInboundTurn ?? defaultTelegramNativeCommandDeps.dispatchChannelInboundTurn)(turnPlan);
	if (!deliveryState.delivered && finalReplyOutcome !== "suppressed" && (deliveryState.skippedNonSilent > 0 || deliveryState.failedNonSilent > 0) && (!turnResult.dispatched || turnResult.dispatchResult.sourceReplyDeliveryMode !== "message_tool_only" || deliveryState.failedNonSilent > 0)) await deliverReplies({
		replies: [{ text: EMPTY_RESPONSE_FALLBACK }],
		...deliveryBaseOptions
	});
	return false;
}
//#endregion
export { prepareTelegramCommandDispatch as n, dispatchTelegramBuiltinTurn as t };
