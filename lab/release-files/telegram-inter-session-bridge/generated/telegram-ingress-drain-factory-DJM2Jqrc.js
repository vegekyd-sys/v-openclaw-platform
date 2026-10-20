import { p as clampPositiveTimerTimeoutMs, s as asFiniteNumber, w as parseStrictPositiveInteger } from "./number-coercion-CLj0HTDM.js";
import { n as collectErrorGraphCandidates, s as readErrorName } from "./error-coercion-CwcmpTBO.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { n as createNonExitingRuntime } from "./runtime-V1VdbWVS.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { w as root } from "./fs-safe-Cdu9fYG_.js";
import { n as computeBackoff, s as sleepWithAbort } from "./src-BQ327IOM.js";
import { r as formatUncaughtError, t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { a as getChildLogger } from "./logger-Dj_CBJHF.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as createDedupeCache } from "./dedupe-gst1CUro.js";
import { u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAccountId } from "./account-id-CETVCrTz.js";
import { t as resolveDefaultModelForAgent } from "./model-selection-config-bdtzr00S.js";
import { t as KeyedAsyncQueue } from "./keyed-async-queue-CTreGrmR.js";
import { t as mutateConfigFile } from "./mutate-QXuWm_d5.js";
import { i as shouldLogVerbose, o as warn, r as logVerbose, t as danger } from "./globals-Dl0PaL2u.js";
import { b as fireAndForgetHook, t as getGlobalHookRunner } from "./hook-runner-global-DLqoAE5f.js";
import { t as DEFAULT_INGRESS_ADOPTION_STALL_MS } from "./ingress-drain-DnD8A5M1.js";
import { a as createMessageReceiveContext } from "./channel-outbound-dOhEOvWr.js";
import { l as kindFromMime } from "./mime-BxTGWg2e.js";
import { i as stripInlineDirectiveTagsForDelivery } from "./directive-tags-BAfDHbTb.js";
import { f as saveMediaBuffer } from "./store-D1sR82up.js";
import { i as saveRemoteMedia, t as MediaFetchError } from "./fetch-DLi8QLoe.js";
import "./history-DLKGD0Dj.js";
import { a as buildPluginBindingResolvedText, d as parsePluginBindingApprovalCustomId, p as resolvePluginConversationBindingApproval } from "./conversation-binding-BoU7sW8E.js";
import { n as listChatCommands } from "./commands-registry-list-DX9oISoy.js";
import { n as maybeResolveTextAlias, r as normalizeCommandBody } from "./commands-registry-normalize-CfEpanSa.js";
import { n as isAbortRequestText } from "./abort-primitives--Bw2kolT.js";
import { t as hasControlCommand } from "./command-detection-DQHzxLNo.js";
import { l as toPluginMessageContext, n as deriveInboundMessageHookContext, u as toPluginMessageReceivedEvent } from "./message-hook-mappers--zYc1UXl.js";
import { T as formatLocationText } from "./reply-payload-y5EgUJuZ.js";
import { t as resolveChannelGroupPolicy } from "./group-policy-Du6hrGhQ.js";
import { s as resolveAgentRoute } from "./resolve-route-BoSYT0_Y.js";
import { n as firstDefined } from "./allow-from-QJeaiQ3n.js";
import { f as resolveChannelConfigWrites } from "./channel-config-helpers-p1X9ri68.js";
import { a as resolveThreadBindingIdleTimeoutMsForChannel, c as resolveThreadBindingSpawnPolicy, s as resolveThreadBindingMaxAgeMsForChannel } from "./thread-bindings-policy-DaKgM08y.js";
import { t as isApprovalNotFoundError } from "./approval-errors-Bzw_-cAg.js";
import { n as resolveStoredModelOverride } from "./stored-model-overrides-Cw6nNvhW.js";
import { c as listNativeCommandSpecsForConfig, r as findCommandByNativeName, s as listNativeCommandSpecs } from "./commands-registry-4rJyHCiD.js";
import { r as matchesMentionWithExplicit, t as buildMentionRegexes } from "./mentions-3Yw3AfIC.js";
import { t as createPluginCommandRuntime } from "./plugin-command-runtime-CxloO-SR.js";
import "./error-runtime-BmBsU1OI.js";
import "./runtime-env-BIoctfDh.js";
import { _ as isTelegramRateLimitError, f as isTelegramEditTargetMissingError, i as shouldRetryTelegramTransportFallback, m as isTelegramMessageNotModifiedError, o as isRecoverableTelegramNetworkError, p as isTelegramMessageHasNoTextError, r as resolveTelegramTransport, s as isRetryableTelegramApiError, t as resolveTelegramApiBase, v as isTelegramServerError, w as normalizeTelegramApiRoot, y as readTelegramRetryAfterMs } from "./fetch-Ss1T35Uy.js";
import { t as expectDefined } from "./expect-runtime-CJBt0Gq2.js";
import "./number-runtime-Cy4drVnh.js";
import "./string-coerce-runtime-GQa0ehRA.js";
import "./routing-Ca5Ulw93.js";
import { n as resolveInboundDebounceMs, t as createInboundDebouncer } from "./inbound-debounce-CZ39yLz-.js";
import { t as evaluateSupplementalContextVisibility } from "./context-visibility-C5CaKMWO.js";
import { d as formatMediaPlaceholderText } from "./run-channel-turn-aZxCVWWO.js";
import { n as implicitMentionKindWhen, r as resolveInboundMentionDecision } from "./mention-gating-Cqy7URJJ.js";
import { h as parseExecApprovalCommandText } from "./exec-approval-reply-DydPy0bt.js";
import { t as resolveApprovalOverGateway } from "./approval-gateway-resolver-Dv75Tbz-.js";
import "./approval-gateway-runtime-eJeOCbPB.js";
import "./approval-reply-runtime-DYWw96T3.js";
import { n as questionGatewayRuntime } from "./question-gateway-runtime-BuwS3oNQ.js";
import { n as resolveAmbientTranscriptWatermarkKey } from "./ambient-transcript-watermark-ClCY_hE7.js";
import { c as readAmbientTranscriptWatermark, r as getSessionEntry } from "./session-store-runtime-Di9N1AZ9.js";
import { t as resolveChannelContextVisibilityMode } from "./context-visibility-B6w64wE1.js";
import { n as resolveNativeCommandsEnabled, r as resolveNativeSkillsEnabled } from "./commands-BuZQO_9q.js";
import "./config-mutation-BGK3_B7H.js";
import { t as normalizeGroupActivation } from "./group-activation-B6ER3hWD.js";
import { n as isBtwRequestText } from "./btw-command-C8tjcHy5.js";
import { m as shouldDebounceTextInbound } from "./channel-inbound-BdUpfMiU.js";
import { n as createChannelIngressMonitor } from "./ingress-monitor-DKZtktZW.js";
import { c as runClaimableDedupeClaimLoop, t as createChannelReplayGuard } from "./persistent-dedupe-CoskJQTL.js";
import { t as reportChannelRoomJoin } from "./channel-join-intro-runtime-aCFRjW_-.js";
import "./dedupe-runtime-DxcmJhX3.js";
import "./file-access-runtime-BBbjPFLE.js";
import { t as applySessionModelSelection } from "./apply-session-model-selection-CJtWmAQJ.js";
import "./model-session-runtime-DmgH_xQD.js";
import "./ssrf-runtime-6BVcK74y.js";
import "./media-runtime-tK9ZA3MS.js";
import "./conversation-runtime-BgKHZq8H.js";
import "./text-chunking-ACBUEghg.js";
import "./agent-runtime-zPZ6yBNz.js";
import "./plugin-command-runtime-Ba4aESoK.js";
import { n as createChannelInteractiveDispatcher } from "./plugin-runtime-_vVH0LFQ.js";
import "./security-runtime-D-LGLycn.js";
import "./hook-runtime-Bdv5FiMM.js";
import { n as formatModelsAvailableHeader } from "./commands-models-Boygy8-x.js";
import "./models-provider-runtime-DcHkmeCD.js";
import "./command-auth-native-8s54zPyc.js";
import "./command-primitives-runtime-kVihlad1.js";
import { n as buildCommandsMessagePaginated } from "./command-status-builders-CVA6DcfM.js";
import "./command-status-C3cRMBIS.js";
import "./command-detection-BUN61D5R.js";
import "./channel-inbound-debounce-CRuq0N9d.js";
import { m as resolveScopeRequireMention, u as buildChannelGroupsScopeTree } from "./channel-policy-C6nFKGeT.js";
import "./context-visibility-runtime-k-0SOswT.js";
import "./native-command-config-runtime-DHGDNSib.js";
import "./text-utility-runtime-ChP15RP5.js";
import { a as normalizeDmAllowFromWithStore, i as normalizeAllowFrom, n as resolveTelegramDmAllow, o as resolveTelegramEffectiveDmPolicy, r as isSenderAllowed, t as expandTelegramAllowFromWithAccessGroups } from "./access-groups-BQMtBJdF.js";
import { t as mergeTelegramAccountConfig } from "./account-config-DafQ4_2K.js";
import { o as resolveTelegramAccount, s as resolveTelegramMediaRuntimeOptions } from "./accounts-ezkRkrYh.js";
import { t as buildTelegramConversationId } from "./topic-conversation-Cl4csGES.js";
import { n as isTelegramExecApprovalApprover, r as isTelegramExecApprovalAuthorizedSender } from "./exec-approvals-B9CO2ilR.js";
import { t as normalizeTelegramStateAccountId } from "./state-account-id-CdS1ON70.js";
import { A as hasBotMention, C as resolveTelegramThreadSpec, D as buildSenderName, I as resolveTelegramPrimaryMedia, O as extractTelegramLocation, P as joinTelegramTextParts, T as withResolvedTelegramForumFlag, _ as resolveTelegramForumThreadId, a as buildTelegramInboundOriginTarget, b as resolveTelegramMessageThreadSpec, c as buildTelegramThreadParams, f as getCachedTelegramForumFlag, g as resolveTelegramForumFlag, h as resolveTelegramCommandAuthorization, i as buildTelegramGroupPeerId, k as getTelegramTextParts, m as resolveTelegramBotHasTopicsEnabled, p as isTelegramCommandsAllowFromConfigured, r as buildTelegramGroupFrom, t as TelegramPairingStoreReadError, v as resolveTelegramGroupAllowFromContext, w as shouldUseTelegramDmThreadSession, y as resolveTelegramMessageForumFlagHint } from "./helpers-DEd6NfQU.js";
import { r as resolveTelegramInlineButtonsScope } from "./inline-buttons-C9P_Iqnu.js";
import { a as resolveTelegramTargetSession, i as resolveTelegramConversationRoute } from "./conversation-route-DPlSZpCP.js";
import { G as resolveTelegramGroupIngestEnabled, O as buildInlineKeyboard, q as resolveTelegramScopedGroupConfig, w as resolveCompleteTelegramPromptContextProjectionIds } from "./text-chunk-limit-qImmQs06.js";
import { t as resolveTelegramAccountOwnerAgentId } from "./account-owner-CrNRC3se.js";
import { a as parseTelegramOpaqueCallbackData, c as hasTelegramApprovalCallbackPrefix, i as parseTelegramNativeCommandCallbackData, l as parseTelegramApprovalCallbackData, r as hasTelegramOpaqueCallbackPrefix, s as fitsTelegramCallbackData } from "./native-command-callback-data-C1RSVJRf.js";
import { a as parseTelegramQuestionCallbackData, i as hasTelegramQuestionCallbackPrefix } from "./button-types-t7A5OWBJ.js";
import { _ as resolveModelSelection, d as buildModelsKeyboard, g as resolveModelListCallback, h as parseModelCallbackData, o as buildTelegramModelsMenuButtons, p as calculateTotalPages, t as buildCommandsPaginationKeyboard } from "./command-ui-xP6QVt6J.js";
import { i as resolveTelegramCustomCommands, r as normalizeTelegramCommandName, t as TELEGRAM_COMMAND_NAME_PATTERN } from "./command-config-BipFmZLM.js";
import { t as createTelegramThreadBindingManager } from "./thread-bindings-GyxJize-.js";
import { a as getCachedSticker, n as cacheSticker } from "./sticker-cache-BrGJRqts.js";
import { p as resolveTelegramMessageCacheScope } from "./sent-message-cache.legacy-state-BigwweVO.js";
import { $ as recordTelegramGroupHistoryEntry, H as buildTelegramConversationContext, J as buildTelegramSelfSenderName, K as isTelegramMessageFromCurrentBot, U as buildTelegramReplyChain, V as registerTelegramOutboundGroupHistoryRecorder, W as createTelegramMessageCache, X as isTelegramHistoryEntryAfterAmbientWatermark, Z as isTelegramSelfSenderName, a as prepareTelegramPollAnswerContext, at as createTelegramClientFetch, c as findTelegramPollRegistryEntry, ct as resolveTelegramOutboundClientTimeoutFloorSeconds, dt as apiThrottler, ft as sequentialize, ht as resolveTelegramEffectiveGroupPolicy, i as isEligibleTelegramPollAnswerUpdate, it as asTelegramClientFetch, l as retireTelegramPollRegistryEntry, lt as getOrCreateAccountThrottler, mt as evaluateTelegramGroupPolicyAccess, o as recordPreparedTelegramPollAnswer, ot as resolveTelegramClientTimeoutMinimumSeconds, pt as evaluateTelegramGroupBaseAccess, q as resolveProviderObservedTelegramThreadSpec, r as getPreparedTelegramPollAnswer, s as settleTelegramPollAnswerContext, st as resolveTelegramClientTimeoutSeconds, ut as Bot$1 } from "./send-DHnAItg0.js";
import { t as withTelegramApiErrorLogging } from "./api-logging-DT6ZktrD.js";
import { n as buildTelegramInvalidApprovalTerminalText, r as buildTelegramLegacyApprovalTerminalText, t as buildTelegramCanonicalApprovalTerminalText } from "./approval-terminal-DXUqzkMX.js";
import { n as buildPluginTelegramMenuCommands, r as syncTelegramMenuCommands, t as buildCappedTelegramMenuCommands } from "./bot-native-command-menu-8dvkmGtq.js";
import { t as defaultTelegramBotDeps } from "./bot-deps-Duy0c9jV.js";
import { C as createTelegramIngressResolver, D as telegramAllowEntries, E as resolveTelegramEventIngressAuthorization, O as isTelegramForumServiceMessage, S as resolveTelegramPromptMediaPath, T as resolveTelegramCommandIngressAuthorization, _ as runWithTelegramUpdateProcessingFrame, a as resolveTelegramUpdateId$1, b as isTelegramDmAccessAllowed, c as TelegramSpooledReplayProcessingError, d as ensureTelegramMessageProcessingResult, f as getTelegramSpooledReplayDeferredParticipant, g as runWithTelegramSpooledReplayUpdate, h as recordTelegramMessageProcessingResult, l as createTelegramSpooledReplayDeferredParticipant, m as isTelegramSpooledReplayUpdate, n as resolveTelegramMessageTurnSettings, o as telegramQueueEventId, p as getTelegramSpooledReplayLifecycle, r as openTelegramIngressQueue, s as resolveTelegramDmHistoryLimit, t as createTelegramMessageProcessor, u as createTelegramSpooledReplayParticipant, v as TELEGRAM_CHAT_ACTION_INTERVAL_MS, w as createTelegramIngressSubject, x as resolveTelegramInboundMediaUri, y as enforceTelegramDmAccess } from "./bot-message-DC6p8sB3.js";
import { t as defaultTelegramNativeCommandDeps } from "./bot-native-command-deps.runtime.js";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { GrammyError } from "grammy";
// v-experience-telegram-v1
import * as vExperience from "./v-experience.js";
import { o as vCallGateway } from "./call-DcwkiOeW.js";
const vTelegramFor = (cfg) => vExperience.telegramExperience({
	call: (method, params) => vCallGateway({ config: cfg, method, params, scopes: ["operator.questions"], clientDisplayName: "Telegram question" }),
	log: (message) => console.log(message)
});
//#region extensions/telegram/src/bot-handlers.callback-actions.ts
function createTelegramCallbackMessageActions(params) {
	const { bot, callbackMessage, threadSpec } = params;
	const callbackBusinessParams = callbackMessage.business_connection_id !== void 0 ? { business_connection_id: callbackMessage.business_connection_id } : void 0;
	const withCallbackBusinessParams = (value) => callbackBusinessParams ? {
		...callbackBusinessParams,
		...value
	} : value;
	const editCallbackMessage = async (text, editParams) => {
		return await bot.api.editMessageText(callbackMessage.chat.id, callbackMessage.message_id, text, editParams ? withCallbackBusinessParams(editParams) : callbackBusinessParams);
	};
	const clearCallbackButtons = async () => {
		return await bot.api.editMessageReplyMarkup(callbackMessage.chat.id, callbackMessage.message_id, withCallbackBusinessParams({ reply_markup: { inline_keyboard: [] } }));
	};
	const editCallbackButtons = async (buttons) => {
		return await bot.api.editMessageReplyMarkup(callbackMessage.chat.id, callbackMessage.message_id, withCallbackBusinessParams({ reply_markup: buildInlineKeyboard(buttons) ?? { inline_keyboard: [] } }));
	};
	const deleteCallbackMessage = async () => {
		return callbackBusinessParams ? await bot.api.deleteBusinessMessages(callbackBusinessParams.business_connection_id, [callbackMessage.message_id]) : await bot.api.deleteMessage(callbackMessage.chat.id, callbackMessage.message_id);
	};
	const replyToCallbackChat = async (text, replyParams) => {
		const threadParams = buildTelegramThreadParams(threadSpec);
		const mergedParams = callbackBusinessParams || threadParams || replyParams ? {
			...replyParams,
			...callbackBusinessParams,
			...threadParams
		} : replyParams;
		return await bot.api.sendMessage(callbackMessage.chat.id, text, mergedParams);
	};
	const editCallbackMessageWithButtons = async (text, buttons, extra) => {
		const keyboard = buildInlineKeyboard(buttons);
		const editParams = keyboard ? {
			reply_markup: keyboard,
			...extra
		} : extra;
		try {
			await editCallbackMessage(text, editParams);
		} catch (editErr) {
			const errStr = String(editErr);
			if (errStr.includes("no text in the message")) {
				try {
					await deleteCallbackMessage();
				} catch {}
				await replyToCallbackChat(text, keyboard ? {
					reply_markup: keyboard,
					...extra
				} : extra);
			} else if (!errStr.includes("message is not modified")) throw editErr;
		}
	};
	return {
		editCallbackMessage,
		clearCallbackButtons,
		editCallbackButtons,
		editCallbackMessageWithButtons,
		deleteCallbackMessage,
		replyToCallbackChat
	};
}
async function sendTelegramQuestionFeedback(params) {
	if (params.mode === "terminal") await params.actions.clearCallbackButtons().catch(() => {});
	const groupCustomInput = params.mode === "custom-input" && params.isGroup;
	const text = groupCustomInput ? `${params.user.first_name}, reply with your own answer.` : params.text;
	await params.actions.replyToCallbackChat(text, params.mode === "custom-input" ? {
		...groupCustomInput ? { entities: [{
			type: "text_mention",
			offset: 0,
			length: params.user.first_name.length,
			user: params.user
		}] } : {},
		reply_markup: {
			force_reply: true,
			selective: groupCustomInput
		}
	} : void 0);
	if (params.mode === "custom-input") await params.actions.clearCallbackButtons().catch(() => {});
}
async function handleTelegramQuestionCallback(params) {
	try {
		if (params.callback.intent === "custom-input") {
			if ((await (params.resolveQuestion ?? questionGatewayRuntime.resolveOption)({
				cfg: params.cfg,
				questionId: params.callback.questionId,
				customInput: true,
				senderId: params.senderId,
				clientDisplayName: "Telegram question"
			})).status === "already-terminal") {
				await params.feedback("This question was already answered.", "terminal");
				return;
			}
			await params.feedback("Reply with your own answer.", "custom-input");
			return;
		}
		const result = await (params.resolveQuestion ?? questionGatewayRuntime.resolveOption)({
			cfg: params.cfg,
			questionId: params.callback.questionId,
			optionIndex: params.callback.optionIndex,
			senderId: params.senderId,
			clientDisplayName: "Telegram question"
		});
		await params.feedback(result.status === "answered" ? "Answer submitted." : "This question was already answered.", "terminal").catch(() => {});
	} catch (error) {
		await params.feedback("Could not submit this answer.", "retry").catch(() => {});
		throw error;
	}
}
//#endregion
//#region extensions/telegram/src/interactive-dispatch.ts
const dispatchTelegramInteractive = createChannelInteractiveDispatcher({
	channel: "telegram",
	interactiveKey: "callback",
	dispatchInteractiveKey: "callbackMessage"
});
async function dispatchTelegramPluginInteractiveHandler(params) {
	return await dispatchTelegramInteractive({
		...params,
		dedupeId: params.callbackId
	});
}
//#endregion
//#region extensions/telegram/src/bot-handlers.callback-router-controls.ts
var TelegramRetryableCallbackError = class extends Error {
	constructor(cause) {
		super(String(cause));
		this.cause = cause;
		this.name = "TelegramRetryableCallbackError";
	}
};
const isPermanentTelegramCallbackEditError = (err) => isTelegramEditTargetMissingError(err) || isTelegramMessageHasNoTextError(err);
function isApprovalAlreadyResolvedError(error) {
	if (!(error instanceof Error)) return false;
	const record = error;
	const reason = record.details?.reason;
	return record.gatewayCode === "APPROVAL_ALREADY_RESOLVED" || record.gatewayCode === "INVALID_REQUEST" && reason === "APPROVAL_ALREADY_RESOLVED" || /approval already resolved/i.test(error.message);
}
function createTelegramCallbackApprovalRuntime(params) {
	const { accountId, telegramDeps, runtimeCfg, senderId, actions } = params;
	const { clearCallbackButtons, editCallbackMessage, replyToCallbackChat } = actions;
	const resolveApprovalAuthorizations = () => {
		const pluginApprovalAuthorizedSender = isTelegramExecApprovalApprover({
			cfg: runtimeCfg,
			accountId,
			senderId
		});
		return {
			execApprovalAuthorizedSender: isTelegramExecApprovalAuthorizedSender({
				cfg: runtimeCfg,
				accountId,
				senderId
			}),
			pluginApprovalAuthorizedSender
		};
	};
	const clearTerminalApprovalButtons = async () => {
		try {
			await clearCallbackButtons();
		} catch (editErr) {
			const errStr = String(editErr);
			if (errStr.includes("message is not modified") || errStr.includes("there is no text in the message to edit")) return;
			logVerbose(`telegram: failed to clear approval callback buttons: ${errStr}`);
		}
	};
	const terminalizeApprovalMessage = async (text) => {
		try {
			await editCallbackMessage(text, { reply_markup: { inline_keyboard: [] } });
			return;
		} catch (editErr) {
			const errStr = String(editErr);
			const alreadyTerminal = errStr.includes("message is not modified");
			if (!alreadyTerminal) logVerbose(`telegram: failed to render terminal approval receipt: ${errStr}`);
			await clearTerminalApprovalButtons();
			if (alreadyTerminal) return;
		}
		try {
			await replyToCallbackChat(text);
		} catch (sendErr) {
			logVerbose(`telegram: failed to send terminal approval receipt: ${String(sendErr)}`);
		}
	};
	const terminalizeLegacyApproval = async (receipt) => await terminalizeApprovalMessage(buildTelegramLegacyApprovalTerminalText(receipt));
	const resolveApproval = telegramDeps.resolveApproval ?? resolveApprovalOverGateway;
	const resolveCanonicalApproval = async (approvalCallback) => await resolveApproval({
		cfg: runtimeCfg,
		approvalId: approvalCallback.approvalId,
		approvalKind: approvalCallback.approvalKind,
		decision: approvalCallback.decision,
		channel: "telegram",
		accountId,
		senderId
	});
	const terminalizeCanonicalApproval = async (approvalCallback, result) => await terminalizeApprovalMessage(buildTelegramCanonicalApprovalTerminalText({
		result,
		fallbackApprovalId: approvalCallback.approvalId
	}));
	const handleCanonical = async (approvalCallback) => {
		const { execApprovalAuthorizedSender, pluginApprovalAuthorizedSender } = resolveApprovalAuthorizations();
		if (!(approvalCallback.approvalKind === "plugin" ? pluginApprovalAuthorizedSender : execApprovalAuthorizedSender || pluginApprovalAuthorizedSender)) {
			logVerbose(`Blocked telegram approval callback from ${senderId || "unknown"} (not authorized)`);
			return;
		}
		try {
			const result = await resolveCanonicalApproval(approvalCallback);
			if (!result.applied) logVerbose(`telegram: approval callback already resolved ${approvalCallback.approvalId} status=${result.approval.status}`);
			await terminalizeCanonicalApproval(approvalCallback, result);
		} catch (resolveErr) {
			logVerbose(`telegram: failed to resolve approval callback ${approvalCallback.approvalId}: ${String(resolveErr)}`);
			if (isApprovalNotFoundError(resolveErr) || isApprovalAlreadyResolvedError(resolveErr)) {
				await terminalizeLegacyApproval({
					approvalId: approvalCallback.approvalId,
					outcome: "no-longer-pending"
				});
				return;
			}
			throw new TelegramRetryableCallbackError(resolveErr);
		}
	};
	const handleMalformedReserved = async () => {
		const { execApprovalAuthorizedSender, pluginApprovalAuthorizedSender } = resolveApprovalAuthorizations();
		if (!execApprovalAuthorizedSender && !pluginApprovalAuthorizedSender) {
			logVerbose(`Blocked malformed telegram approval callback from ${senderId || "unknown"} (not authorized)`);
			return;
		}
		logVerbose(`telegram: consumed malformed reserved approval callback from ${senderId}`);
		await terminalizeApprovalMessage(buildTelegramInvalidApprovalTerminalText());
	};
	const handleLegacy = async (approvalCallback) => {
		const { execApprovalAuthorizedSender, pluginApprovalAuthorizedSender } = resolveApprovalAuthorizations();
		const approvalKinds = [];
		if (execApprovalAuthorizedSender || pluginApprovalAuthorizedSender) approvalKinds.push("exec");
		if (pluginApprovalAuthorizedSender) approvalKinds.push("plugin");
		if (approvalKinds.length === 0) {
			logVerbose(`Blocked telegram approval callback from ${senderId || "unknown"} (not authorized)`);
			return;
		}
		for (const approvalKind of approvalKinds) {
			const canonicalCallback = {
				type: "approval",
				approvalId: approvalCallback.approvalId,
				approvalKind,
				decision: approvalCallback.decision
			};
			try {
				await resolveApproval({
					cfg: runtimeCfg,
					approvalId: approvalCallback.approvalId,
					decision: approvalCallback.decision,
					channel: "telegram",
					accountId,
					senderId,
					resolveMethod: approvalKind
				});
				await terminalizeLegacyApproval({
					approvalId: approvalCallback.approvalId,
					decision: approvalCallback.decision,
					outcome: "resolved-here"
				});
				return;
			} catch (resolveErr) {
				if (isApprovalNotFoundError(resolveErr)) continue;
				if (isApprovalAlreadyResolvedError(resolveErr)) {
					try {
						const result = await resolveCanonicalApproval(canonicalCallback);
						await terminalizeCanonicalApproval(canonicalCallback, result);
					} catch (canonicalError) {
						if (!isApprovalNotFoundError(canonicalError) && !isApprovalAlreadyResolvedError(canonicalError)) throw new TelegramRetryableCallbackError(canonicalError);
						logVerbose(`telegram: canonical approval lookup failed after stale legacy callback ${approvalCallback.approvalId}: ${String(canonicalError)}`);
						await terminalizeLegacyApproval({
							approvalId: approvalCallback.approvalId,
							outcome: "no-longer-pending"
						});
					}
					return;
				}
				logVerbose(`telegram: failed to resolve approval callback ${approvalCallback.approvalId}: ${String(resolveErr)}`);
				throw new TelegramRetryableCallbackError(resolveErr);
			}
		}
		logVerbose(`telegram: approval callback not found ${approvalCallback.approvalId}`);
		if (!pluginApprovalAuthorizedSender) return;
		await terminalizeLegacyApproval({
			approvalId: approvalCallback.approvalId,
			outcome: "no-longer-pending"
		});
	};
	return {
		handleCanonical,
		handleMalformedReserved,
		handleLegacy
	};
}
const MULTI_SELECT_PREFIX = "OC_MULTI|";
const MULTI_SELECT_TOGGLE_PREFIX = `${MULTI_SELECT_PREFIX}toggle|`;
const SELECT_PREFIX = "OC_SELECT|";
const SELECTED_PREFIX = "✅ ";
const TELEGRAM_PLUGIN_CALLBACK_SUBMIT_RETRY_DELAYS_MS = [
	250,
	1e3,
	2500
];
const REPLY_SESSION_INIT_CONFLICT_MESSAGE_RE = /reply session initialization conflicted for \S+/u;
const parseTelegramManagedSelectCallback = (data) => {
	if (data.startsWith(MULTI_SELECT_TOGGLE_PREFIX)) return {
		type: "multi-toggle",
		value: data.slice(MULTI_SELECT_TOGGLE_PREFIX.length)
	};
	if (data === `${MULTI_SELECT_PREFIX}clear`) return { type: "multi-clear" };
	if (data === `${MULTI_SELECT_PREFIX}submit`) return { type: "multi-submit" };
	if (data.startsWith(SELECT_PREFIX)) return {
		type: "select",
		value: data.slice(10)
	};
};
const cloneInlineKeyboardButtons = (message) => {
	const rows = message.reply_markup?.inline_keyboard;
	if (!Array.isArray(rows)) return [];
	return rows.map((row) => Array.isArray(row) ? row.map((button) => {
		const candidate = button;
		if (typeof candidate.text !== "string" || typeof candidate.callback_data !== "string") return null;
		const style = candidate.style === "danger" || candidate.style === "success" || candidate.style === "primary" ? candidate.style : void 0;
		return {
			text: candidate.text,
			callback_data: candidate.callback_data,
			...style ? { style } : {}
		};
	}).filter((button) => button !== null) : []).filter((row) => row.length > 0);
};
const stripMultiSelectPrefix = (text) => text.replace(/^✅\s*/, "");
const isSelectedMultiButton = (button) => /^✅\s*/.test(button.text);
const isMultiToggleButton = (button) => button.callback_data.startsWith(MULTI_SELECT_TOGGLE_PREFIX);
const resolveMultiSelectedValues = (buttons) => buttons.flatMap((row) => row.flatMap((button) => {
	if (!isMultiToggleButton(button) || !isSelectedMultiButton(button)) return [];
	return [button.callback_data.slice(MULTI_SELECT_TOGGLE_PREFIX.length)];
}));
const updateMultiSelectKeyboard = (message, action, value = "") => cloneInlineKeyboardButtons(message).map((row) => row.map((button) => {
	if (!isMultiToggleButton(button)) return button;
	const buttonValue = button.callback_data.slice(MULTI_SELECT_TOGGLE_PREFIX.length);
	const baseText = stripMultiSelectPrefix(button.text);
	const selected = action === "clear" ? false : buttonValue === value ? !isSelectedMultiButton(button) : isSelectedMultiButton(button);
	return {
		...button,
		text: selected ? `${SELECTED_PREFIX}${baseText}` : baseText
	};
}));
const resolvePluginCallbackSubmitText = (submitText) => {
	return normalizeOptionalString(submitText);
};
const isReplySessionInitConflictError = (err) => REPLY_SESSION_INIT_CONFLICT_MESSAGE_RE.test(String(err instanceof Error ? err.message : err));
const isReplySessionInitConflictResult = (result) => result.kind === "failed-retryable" && isReplySessionInitConflictError(result.error);
async function handleTelegramInteractiveCallback(params) {
	const { accountId, callback, ctx, callbackMessage, data, pluginCallbackData, callbackConversationId, callbackThreadId, senderId, senderUsername, isGroup, isForum, storeAllowFrom, actions, messageRuntime, authorizeCallback } = params;
	const { buildSyntheticTextMessage, buildSyntheticContext, buildFailedProcessingResult, processMessageWithReplyChain } = messageRuntime;
	const { clearCallbackButtons, editCallbackButtons, editCallbackMessage, deleteCallbackMessage, replyToCallbackChat } = actions;
	const buildSynthetic = (text) => {
		const message = buildSyntheticTextMessage({
			base: withResolvedTelegramForumFlag(callbackMessage, isForum),
			from: callback.from,
			text
		});
		return {
			ctx: buildSyntheticContext(ctx, message),
			message
		};
	};
	const processSubmitText = async (text) => {
		const synthetic = buildSynthetic(text);
		const participant = isTelegramSpooledReplayUpdate(synthetic.ctx.update) ? getTelegramSpooledReplayDeferredParticipant() ?? createTelegramSpooledReplayDeferredParticipant(`plugin-callback-submit:${callback.id}`) ?? void 0 : void 0;
		const settle = (result) => {
			participant?.settle(result);
			return result.kind;
		};
		for (let attempt = 0;; attempt++) try {
			const result = await processMessageWithReplyChain({
				ctx: synthetic.ctx,
				msg: synthetic.message,
				allMedia: [],
				storeAllowFrom,
				options: {
					spooledReplay: true,
					isolateSpooledReplaySettlement: true,
					forceWasMentioned: true,
					messageIdOverride: callback.id
				},
				spooledReplayAbortSignal: participant?.abortSignal
			});
			if (result.kind === "completed" || result.kind === "skipped") {
				settle(result);
				return result.kind;
			}
			const retryDelayMs = TELEGRAM_PLUGIN_CALLBACK_SUBMIT_RETRY_DELAYS_MS[attempt];
			if (!isReplySessionInitConflictResult(result) || retryDelayMs === void 0) throw new TelegramRetryableCallbackError(result.error);
			logVerbose(`telegram plugin callback submitText hit active reply session; retrying in ${retryDelayMs}ms`);
			await sleepWithAbort(retryDelayMs, participant?.abortSignal);
		} catch (err) {
			const retryDelayMs = TELEGRAM_PLUGIN_CALLBACK_SUBMIT_RETRY_DELAYS_MS[attempt];
			if (!isReplySessionInitConflictError(err) || retryDelayMs === void 0) {
				settle(buildFailedProcessingResult(err));
				throw err;
			}
			logVerbose(`telegram plugin callback submitText hit active reply session; retrying in ${retryDelayMs}ms`);
			await sleepWithAbort(retryDelayMs, participant?.abortSignal);
		}
	};
	const pluginBindingApproval = parsePluginBindingApprovalCustomId(data);
	if (pluginBindingApproval) {
		let resolved;
		try {
			resolved = await resolvePluginConversationBindingApproval({
				approvalId: pluginBindingApproval.approvalId,
				decision: pluginBindingApproval.decision,
				senderId: senderId || void 0
			});
		} catch (err) {
			throw new TelegramRetryableCallbackError(err);
		}
		await clearCallbackButtons();
		await replyToCallbackChat(buildPluginBindingResolvedText(resolved));
		return true;
	}
	if ((await dispatchTelegramPluginInteractiveHandler({
		data: pluginCallbackData,
		callbackId: callback.id,
		ctx: {
			accountId,
			callbackId: callback.id,
			conversationId: callbackConversationId,
			parentConversationId: callbackThreadId != null ? String(callbackMessage.chat.id) : void 0,
			senderId: senderId || void 0,
			senderUsername: senderUsername || void 0,
			threadId: callbackThreadId,
			isGroup,
			isForum,
			auth: { isAuthorizedSender: await authorizeCallback() },
			callbackMessage: {
				messageId: callbackMessage.message_id,
				chatId: String(callbackMessage.chat.id),
				messageText: callbackMessage.text ?? callbackMessage.caption
			}
		},
		respond: {
			reply: async ({ text, buttons }) => {
				await replyToCallbackChat(text, buttons ? { reply_markup: buildInlineKeyboard(buttons) } : void 0);
			},
			editMessage: async ({ text, buttons }) => {
				await editCallbackMessage(text, buttons ? { reply_markup: buildInlineKeyboard(buttons) } : void 0);
			},
			editButtons: async ({ buttons }) => {
				await editCallbackButtons(buttons);
			},
			clearButtons: async () => {
				await clearCallbackButtons();
			},
			deleteMessage: async () => {
				await deleteCallbackMessage();
			}
		},
		afterInvoke: async (result) => {
			if (result?.handled === false) return;
			const submitText = resolvePluginCallbackSubmitText(result?.submitText);
			if (!submitText || await processSubmitText(submitText) === "skipped") return;
			await clearCallbackButtons().catch((err) => {
				logVerbose(`telegram plugin callback button cleanup skipped: ${String(err)}`);
			});
		}
	})).handled) return true;
	const selectCallback = parseTelegramManagedSelectCallback(callback.data?.trimStart() ?? data);
	if (!selectCallback) return false;
	if (selectCallback.type === "multi-toggle" || selectCallback.type === "multi-clear") {
		const buttons = updateMultiSelectKeyboard(callbackMessage, selectCallback.type === "multi-clear" ? "clear" : "toggle", selectCallback.type === "multi-toggle" ? selectCallback.value : "");
		if (buttons.length > 0) try {
			await editCallbackButtons(buttons);
		} catch (editErr) {
			if (!String(editErr).includes("message is not modified")) throw new TelegramRetryableCallbackError(editErr);
		}
		return true;
	}
	let text;
	if (selectCallback.type === "multi-submit") {
		const selected = resolveMultiSelectedValues(cloneInlineKeyboardButtons(callbackMessage));
		text = `Multi-select submitted: ${selected.length > 0 ? selected.join(", ") : "none"}`;
	} else {
		try {
			await clearCallbackButtons();
		} catch (editErr) {
			const errStr = String(editErr);
			if (!errStr.includes("message is not modified") && !errStr.includes("there is no text in the message to edit")) throw new TelegramRetryableCallbackError(editErr);
		}
		text = `Single-select submitted: ${selectCallback.value}`;
	}
	const synthetic = buildSynthetic(text);
	await processMessageWithReplyChain({
		ctx: synthetic.ctx,
		msg: synthetic.message,
		allMedia: [],
		storeAllowFrom,
		options: {
			forceWasMentioned: true,
			messageIdOverride: callback.id
		}
	});
	return true;
}
//#endregion
//#region extensions/telegram/src/callback-query-answer-state.ts
const TELEGRAM_CALLBACK_QUERY_ANSWER_PROMISE = Symbol.for("openclaw.telegram.callbackQueryAnswerPromise");
const telegramCallbackQueryAnswers = /* @__PURE__ */ new WeakMap();
function startTelegramCallbackQueryAnswer(bot, callbackQueryId, retainUntilDispatch) {
	let answers = telegramCallbackQueryAnswers.get(bot);
	if (!answers) {
		answers = /* @__PURE__ */ new Map();
		telegramCallbackQueryAnswers.set(bot, answers);
	}
	const existing = answers.get(callbackQueryId);
	if (existing) return existing.promise;
	const answer = {
		promise: bot.api.answerCallbackQuery(callbackQueryId),
		pending: true,
		retainUntilDispatch
	};
	answers.set(callbackQueryId, answer);
	answer.promise.then(() => {
		answer.pending = false;
		if (!answer.retainUntilDispatch) answers.delete(callbackQueryId);
	}, () => answers.delete(callbackQueryId));
	return answer.promise;
}
function takeTelegramCallbackQueryAdmissionAnswer(bot, callbackQueryId) {
	const answers = telegramCallbackQueryAnswers.get(bot);
	const answer = answers?.get(callbackQueryId);
	if (answer) {
		answer.retainUntilDispatch = false;
		if (!answer.pending) answers?.delete(callbackQueryId);
	}
	return answer?.promise;
}
function setTelegramCallbackQueryAnswerPromise(ctx, promise) {
	Object.defineProperty(ctx, TELEGRAM_CALLBACK_QUERY_ANSWER_PROMISE, {
		configurable: true,
		value: promise
	});
}
function getTelegramCallbackQueryAnswerPromise(ctx) {
	const promise = ctx[TELEGRAM_CALLBACK_QUERY_ANSWER_PROMISE];
	return promise instanceof Promise ? promise : void 0;
}
//#endregion
//#region extensions/telegram/src/bot-handlers.callback-router.ts
function createTelegramCallbackRouter({ params: { accountId, bot, runtime, telegramDeps, shouldSkipUpdate, nativeCommandCallbackDispatcher }, message: messageRuntime, authorization: authorizationRuntime }) {
	const { buildSyntheticTextMessage, buildSyntheticContext, processMessageWithReplyChain } = messageRuntime;
	const { resolveTelegramEventAuthorizationContext, authorizeTelegramEventSender, isTelegramModelCallbackAuthorized } = authorizationRuntime;
	const getChat = bot.api.getChat.bind(bot.api);
	const handleCallback = async (ctx) => {
		const callback = ctx.callbackQuery;
		if (!callback) return;
		let callbackAnswered = false;
		const answerCallbackQuery = async () => {
			await withTelegramApiErrorLogging({
				operation: "answerCallbackQuery",
				runtime,
				fn: () => startTelegramCallbackQueryAnswer(bot, callback.id, false)
			}).catch(() => {});
			callbackAnswered = true;
		};
		if (shouldSkipUpdate(ctx)) {
			const earlyAnswerPromise = getTelegramCallbackQueryAnswerPromise(ctx);
			if (earlyAnswerPromise) await earlyAnswerPromise.catch(async () => await answerCallbackQuery());
			else await answerCallbackQuery();
			return;
		}
		const data = (callback.data ?? "").trim();
		const typedQuestionCallback = parseTelegramQuestionCallbackData(data);
		const earlyAnswerPromise = getTelegramCallbackQueryAnswerPromise(ctx);
		if (earlyAnswerPromise) try {
			await earlyAnswerPromise;
			callbackAnswered = true;
		} catch {
			await answerCallbackQuery();
		}
		else await answerCallbackQuery();
		try {
			const callbackMessage = callback.message;
			if (!data || !callbackMessage) return;
			const chatId = callbackMessage.chat.id;
			const isGroup = callbackMessage.chat.type === "group" || callbackMessage.chat.type === "supergroup";
			const nativeCallbackCommand = parseTelegramNativeCommandCallbackData(data);
			const hasReservedModelPrefix = data.startsWith("mdl1~");
			const hasReservedOpaquePrefix = hasTelegramOpaqueCallbackPrefix(data);
			const opaqueCallbackData = parseTelegramOpaqueCallbackData(callback.data?.trimStart());
			const genericCallbackText = data.startsWith("/") ? data : `callback_data: ${data}`;
			const callbackCommandText = nativeCallbackCommand ?? (opaqueCallbackData ? "" : genericCallbackText);
			const hasReservedApprovalPrefix = hasTelegramApprovalCallbackPrefix(data);
			const hasReservedQuestionPrefix = hasTelegramQuestionCallbackPrefix(data);
			const typedApprovalCallback = parseTelegramApprovalCallbackData(data);
			const legacyApprovalCallback = parseExecApprovalCommandText(nativeCallbackCommand ?? (opaqueCallbackData ? "" : data));
			const isRuntimeControlCallback = hasReservedApprovalPrefix || legacyApprovalCallback !== null || hasReservedQuestionPrefix;
			const authorizationCfg = telegramDeps.getRuntimeConfig();
			const inlineButtonsScope = resolveTelegramInlineButtonsScope({
				cfg: authorizationCfg,
				accountId
			});
			const inlineButtonsUnavailable = inlineButtonsScope === "off" || inlineButtonsScope === "dm" && isGroup || inlineButtonsScope === "group" && !isGroup;
			if (!isRuntimeControlCallback && inlineButtonsUnavailable && !nativeCallbackCommand && !hasReservedOpaquePrefix && !hasReservedModelPrefix) return;
			const isForum = await resolveTelegramForumFlag({
				chatId,
				chatType: callbackMessage.chat.type,
				isGroup,
				isForum: callbackMessage.chat.is_forum,
				isTopicMessage: callbackMessage.is_topic_message,
				getChat
			});
			const senderId = callback.from?.id ? String(callback.from.id) : "";
			const senderUsername = callback.from?.username ?? "";
			const eventAuthContext = await resolveTelegramEventAuthorizationContext({
				cfg: authorizationCfg,
				chatId,
				isGroup,
				senderId,
				threadSpec: resolveTelegramMessageThreadSpec(callbackMessage, isForum)
			});
			const threadSpec = eventAuthContext.threadSpec;
			const { dmThreadId, storeAllowFrom, groupConfig } = eventAuthContext;
			const requireTopic = groupConfig?.requireTopic;
			if (!isGroup && requireTopic === true && dmThreadId == null) {
				logVerbose(`Blocked telegram callback in DM ${chatId}: requireTopic=true but no topic present`);
				return;
			}
			const actions = createTelegramCallbackMessageActions({
				bot,
				callbackMessage,
				threadSpec
			});
			const clearRoutedCallbackButtons = async () => {
				try {
					await actions.clearCallbackButtons();
				} catch (editErr) {
					if (!isTelegramMessageNotModifiedError(editErr) && !isPermanentTelegramCallbackEditError(editErr)) throw new TelegramRetryableCallbackError(editErr);
				}
			};
			const terminalizeUnavailableCallback = async () => {
				logVerbose("telegram: typed callback unavailable (handler missing or payload invalid)");
				await clearRoutedCallbackButtons();
				await actions.replyToCallbackChat("This action is no longer available.");
			};
			if (inlineButtonsUnavailable && (nativeCallbackCommand && !legacyApprovalCallback || hasReservedOpaquePrefix || hasReservedModelPrefix)) {
				await terminalizeUnavailableCallback();
				return;
			}
			if (nativeCallbackCommand && nativeCommandCallbackDispatcher) {
				const dispatch = await nativeCommandCallbackDispatcher({
					botUser: ctx.me,
					callbackQuery: callback,
					commandText: nativeCallbackCommand
				});
				if (dispatch.handled) {
					if (dispatch.clearButtons) await clearRoutedCallbackButtons();
					return;
				}
			}
			const authorizationMode = hasReservedQuestionPrefix ? "callback-runtime-allowlist" : !isGroup || !isRuntimeControlCallback && inlineButtonsScope === "allowlist" ? "callback-allowlist" : "callback-scope";
			if (!await authorizeTelegramEventSender({
				chatId,
				chatTitle: callbackMessage.chat.title,
				isGroup,
				senderId,
				senderUsername,
				mode: authorizationMode,
				context: eventAuthContext
			})) return;
			const callbackConversationId = buildTelegramConversationId({
				chatId,
				thread: threadSpec
			});
			const callbackThreadId = threadSpec.id;
			const runtimeCfg = telegramDeps.getRuntimeConfig();
			const approvalRuntime = createTelegramCallbackApprovalRuntime({
				accountId,
				telegramDeps,
				runtimeCfg,
				senderId,
				actions
			});
			const authorizeCallback = async () => await isTelegramModelCallbackAuthorized({
				chatId,
				isGroup,
				senderId,
				senderUsername,
				context: eventAuthContext
			});
			if (typedApprovalCallback) {
				await approvalRuntime.handleCanonical(typedApprovalCallback);
				return;
			}
			if (typedQuestionCallback) {
				await handleTelegramQuestionCallback({
					callback: typedQuestionCallback,
					cfg: runtimeCfg,
					senderId,
					feedback: async (text, mode) => await sendTelegramQuestionFeedback({
						actions,
						text,
						mode,
						isGroup,
						user: callback.from
					})
				});
				return;
			}
			if (hasReservedQuestionPrefix) return;
			if (hasReservedApprovalPrefix) {
				await approvalRuntime.handleMalformedReserved();
				return;
			}
			if (!nativeCallbackCommand && !hasReservedModelPrefix && !inlineButtonsUnavailable && await handleTelegramInteractiveCallback({
				accountId,
				callback,
				ctx,
				callbackMessage,
				data,
				pluginCallbackData: opaqueCallbackData ?? data,
				callbackConversationId,
				callbackThreadId,
				senderId,
				senderUsername,
				isGroup,
				isForum,
				storeAllowFrom,
				actions,
				messageRuntime,
				authorizeCallback
			})) return;
			if (legacyApprovalCallback) {
				await approvalRuntime.handleLegacy(legacyApprovalCallback);
				return;
			}
			if (hasReservedOpaquePrefix) {
				await terminalizeUnavailableCallback();
				return;
			}
			if (await handleTelegramModelCallback({
				data,
				ctx,
				chatId,
				isGroup,
				threadSpec,
				senderId,
				runtimeCfg,
				telegramDeps,
				actions,
				messageRuntime,
				authorizeCallback
			})) return;
			if (hasReservedModelPrefix) {
				await terminalizeUnavailableCallback();
				return;
			}
			if ((callbackMessage.reply_markup?.inline_keyboard?.length ?? 0) > 0) await clearRoutedCallbackButtons();
			const syntheticMessage = buildSyntheticTextMessage({
				base: withResolvedTelegramForumFlag(callbackMessage, isForum),
				from: callback.from,
				text: callbackCommandText
			});
			const syntheticCtx = buildSyntheticContext(ctx, syntheticMessage);
			await processMessageWithReplyChain({
				ctx: syntheticCtx,
				msg: syntheticMessage,
				allMedia: [],
				storeAllowFrom,
				options: {
					threadSpec,
					...nativeCallbackCommand ? { commandSource: "native" } : {},
					forceWasMentioned: true,
					messageIdOverride: callback.id
				}
			});
		} catch (err) {
			if (err instanceof TelegramRetryableCallbackError) {
				if (isPermanentTelegramCallbackEditError(err.cause)) {
					logVerbose(`telegram: swallowing permanent callback edit error: ${String(err.cause)}`);
					return;
				}
				runtime.error?.(danger(`callback handler failed: ${String(err)}`));
				throw err.cause;
			}
			runtime.error?.(danger(`callback handler failed: ${String(err)}`));
			if (isTelegramSpooledReplayUpdate(ctx.update)) recordTelegramMessageProcessingResult({
				kind: "failed-retryable",
				error: err
			});
		} finally {
			if (typedQuestionCallback && !callbackAnswered) await answerCallbackQuery();
		}
	};
	return { route: async (ctx) => {
		if (!ctx.callbackQuery) return { kind: "ignored" };
		await handleCallback(ctx);
		return { kind: "handled" };
	} };
}
async function handleTelegramModelCallback(params) {
	const { data, ctx, chatId, isGroup, threadSpec, senderId, runtimeCfg, telegramDeps, actions, messageRuntime, authorizeCallback } = params;
	const { editCallbackMessage, editCallbackMessageWithButtons: editMessageWithButtons } = actions;
	const retryModelAction = async (action) => {
		try {
			return await action();
		} catch (error) {
			throw new TelegramRetryableCallbackError(error);
		}
	};
	const paginationMatch = data.match(/^commands_page_(\d+|noop)(?::(.+))?$/);
	if (paginationMatch) {
		const pageValue = paginationMatch[1];
		if (pageValue === "noop") return true;
		const page = parseStrictPositiveInteger(pageValue);
		if (page === void 0) return true;
		const agentId = paginationMatch[2]?.trim() || messageRuntime.resolveTelegramSessionState({
			chatId,
			isGroup,
			threadSpec,
			botHasTopicsEnabled: resolveTelegramBotHasTopicsEnabled(ctx.me),
			senderId,
			runtimeCfg
		}).agentId;
		const result = await retryModelAction(async () => {
			const skillCommands = telegramDeps.listSkillCommandsForAgents({
				cfg: runtimeCfg,
				agentIds: [agentId]
			});
			return buildCommandsMessagePaginated(runtimeCfg, skillCommands, {
				page,
				forcePaginatedList: true,
				surface: "telegram"
			});
		});
		const keyboard = result.totalPages > 1 ? buildInlineKeyboard(buildCommandsPaginationKeyboard(result.currentPage, result.totalPages, agentId)) : void 0;
		try {
			await editCallbackMessage(result.text, keyboard ? { reply_markup: keyboard } : void 0);
		} catch (editErr) {
			if (!String(editErr).includes("message is not modified")) throw new TelegramRetryableCallbackError(editErr);
		}
		return true;
	}
	const modelCallback = parseModelCallbackData(data);
	if (!modelCallback) return false;
	if (!await authorizeCallback()) {
		logVerbose(`Blocked telegram model callback from ${senderId || "unknown"} (not authorized for /models)`);
		return true;
	}
	const { sessionState, modelData } = await retryModelAction(async () => {
		const session = messageRuntime.resolveTelegramSessionState({
			chatId,
			isGroup,
			threadSpec,
			botHasTopicsEnabled: resolveTelegramBotHasTopicsEnabled(ctx.me),
			senderId,
			runtimeCfg
		});
		return {
			sessionState: session,
			modelData: await telegramDeps.buildModelsProviderData(runtimeCfg, session.agentId)
		};
	});
	const { byProvider, providers, modelNames, resolvedDefault: activeResolvedDefault } = modelData;
	const providerInfos = providers.map((provider) => ({
		id: provider,
		count: byProvider.get(provider)?.size ?? 0
	}));
	if (modelCallback.type === "providers" || modelCallback.type === "back") {
		if (providers.length === 0) {
			await retryModelAction(() => editMessageWithButtons("No providers available.", []));
			return true;
		}
		await retryModelAction(() => editMessageWithButtons("Select a provider:", buildTelegramModelsMenuButtons({ providers: providerInfos })));
		return true;
	}
	if (modelCallback.type === "list" || modelCallback.type === "list-ref") {
		const listSelection = resolveModelListCallback({
			callback: modelCallback,
			providers
		});
		if (!listSelection) {
			await retryModelAction(() => editMessageWithButtons("This model picker is stale or ambiguous. Reopen /model and try again.", buildTelegramModelsMenuButtons({ providers: providerInfos })));
			return true;
		}
		const { provider, page } = listSelection;
		const modelSet = byProvider.get(provider);
		if (!modelSet || modelSet.size === 0) {
			await retryModelAction(() => editMessageWithButtons(`Unknown provider: ${provider}\n\nSelect a provider:`, buildTelegramModelsMenuButtons({ providers: providerInfos })));
			return true;
		}
		const models = [...modelSet].toSorted((left, right) => left.localeCompare(right));
		const totalPages = calculateTotalPages(models.length);
		const safePage = Math.max(1, Math.min(page, totalPages));
		const currentModel = sessionState.model || `${activeResolvedDefault.provider}/${activeResolvedDefault.model}`;
		const buttons = buildModelsKeyboard({
			provider,
			models,
			currentModel,
			currentPage: safePage,
			totalPages,
			modelNames
		});
		const text = `${formatModelsAvailableHeader({
			provider,
			total: models.length,
			cfg: runtimeCfg,
			agentDir: resolveAgentDir(runtimeCfg, sessionState.agentId),
			sessionEntry: sessionState.sessionEntry
		})}\nSelecting a model also applies its configured runtime.`;
		await retryModelAction(() => editMessageWithButtons(text, buttons));
		return true;
	}
	if (modelCallback.type !== "select" && modelCallback.type !== "select-ref") return true;
	const selection = resolveModelSelection({
		callback: modelCallback,
		providers,
		byProvider
	});
	if (selection.kind !== "resolved") {
		await retryModelAction(() => editMessageWithButtons(`Could not resolve model "${selection.model}".\n\nSelect a provider:`, buildTelegramModelsMenuButtons({ providers: providerInfos })));
		return true;
	}
	if (!byProvider.get(selection.provider)?.has(selection.model)) {
		await retryModelAction(() => editMessageWithButtons(`❌ Model "${selection.provider}/${selection.model}" is not allowed.`, []));
		return true;
	}
	try {
		const storePath = telegramDeps.resolveStorePath(runtimeCfg.session?.store, { agentId: sessionState.agentId });
		const resolvedDefault = resolveDefaultModelForAgent({
			cfg: runtimeCfg,
			agentId: sessionState.agentId
		});
		const isDefaultSelection = selection.provider === resolvedDefault.provider && selection.model === resolvedDefault.model;
		const persistedSessionEntry = sessionState.sessionEntry ?? telegramDeps.getSessionEntry?.({
			storePath,
			sessionKey: sessionState.sessionKey
		}) ?? getSessionEntry({
			storePath,
			sessionKey: sessionState.sessionKey
		});
		const sessionEntryMissing = persistedSessionEntry === void 0;
		const sessionEntry = persistedSessionEntry ?? {
			sessionId: randomUUID(),
			updatedAt: Date.now()
		};
		const previousAuthProfileId = sessionEntry.authProfileOverride?.trim();
		const sessionStore = { [sessionState.sessionKey]: sessionEntry };
		const currentModelRef = sessionState.model?.trim();
		const currentModelSeparator = currentModelRef?.indexOf("/") ?? -1;
		const currentProvider = currentModelRef && currentModelSeparator > 0 ? currentModelRef.slice(0, currentModelSeparator) : resolvedDefault.provider;
		const currentModel = currentModelRef && currentModelSeparator > 0 ? currentModelRef.slice(currentModelSeparator + 1) : resolvedDefault.model;
		const applied = await retryModelAction(() => applySessionModelSelection({
			cfg: runtimeCfg,
			agentId: sessionState.agentId,
			sessionKey: sessionState.sessionKey,
			storePath,
			sessionEntry,
			sessionStore,
			allowCreate: sessionEntryMissing,
			defaultProvider: resolvedDefault.provider,
			defaultModel: resolvedDefault.model,
			currentProvider,
			currentModel,
			modelCatalog: modelData.modelCatalog,
			canPersistStickyModelSelection: false,
			request: {
				provider: selection.provider,
				model: selection.model,
				isDefault: isDefaultSelection,
				runtime: { kind: "clear" }
			},
			markLiveSwitchPending: true
		}));
		if (applied.status !== "applied") {
			await editMessageWithButtons(`❌ ${applied.message}`, []);
			return true;
		}
		const defaultAuthProfileNotice = isDefaultSelection && previousAuthProfileId ? sessionStore[sessionState.sessionKey]?.authProfileOverride?.trim() === previousAuthProfileId ? "Compatible auth profile retained." : "Incompatible auth profile cleared." : void 0;
		const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		const actionText = isDefaultSelection ? "reset to default" : `changed to <b>${escapeHtml(selection.provider)}/${escapeHtml(selection.model)}</b>`;
		const runtimeText = `Runtime set to <b>${escapeHtml(applied.agentRuntime)}</b> from configured policy.`;
		await editMessageWithButtons(`✅ Model ${actionText}\n\n${isDefaultSelection ? `Session model selection cleared.${defaultAuthProfileNotice ? ` ${defaultAuthProfileNotice}` : ""} ${runtimeText} New replies use the agent's configured default.` : `Session-only model selection. ${runtimeText} The agent default in openclaw.json is unchanged. This chat keeps the model selection across /new and /reset; use /model default -s to clear the session model selection.`}`, [], { parse_mode: "HTML" });
	} catch (err) {
		if (err instanceof TelegramRetryableCallbackError) throw err;
		await editMessageWithButtons(`❌ Failed to change model: ${String(err)}`, []);
	}
	return true;
}
//#endregion
//#region extensions/telegram/src/group-migration.ts
function resolveAccountGroups(cfg, accountId) {
	if (!accountId) return {};
	const normalized = normalizeAccountId(accountId);
	const accounts = cfg.channels?.telegram?.accounts;
	if (!accounts || typeof accounts !== "object") return {};
	const exact = accounts[normalized];
	if (exact?.groups) return { groups: exact.groups };
	const matchKey = Object.keys(accounts).find((key) => normalizeLowercaseStringOrEmpty(key) === normalizeLowercaseStringOrEmpty(normalized));
	return { groups: matchKey ? accounts[matchKey]?.groups : void 0 };
}
function migrateTelegramGroupsInPlace(groups, oldChatId, newChatId) {
	if (!groups) return {
		migrated: false,
		skippedExisting: false
	};
	if (oldChatId === newChatId) return {
		migrated: false,
		skippedExisting: false
	};
	if (!Object.hasOwn(groups, oldChatId)) return {
		migrated: false,
		skippedExisting: false
	};
	if (Object.hasOwn(groups, newChatId)) return {
		migrated: false,
		skippedExisting: true
	};
	groups[newChatId] = expectDefined(groups[oldChatId], "owned Telegram group config key");
	delete groups[oldChatId];
	return {
		migrated: true,
		skippedExisting: false
	};
}
function migrateTelegramGroupConfig(params) {
	const scopes = [];
	let migrated = false;
	let skippedExisting = false;
	const migrationTargets = [{
		scope: "account",
		groups: resolveAccountGroups(params.cfg, params.accountId).groups
	}, {
		scope: "global",
		groups: params.cfg.channels?.telegram?.groups
	}];
	for (const target of migrationTargets) {
		const result = migrateTelegramGroupsInPlace(target.groups, params.oldChatId, params.newChatId);
		if (result.migrated) {
			migrated = true;
			scopes.push(target.scope);
		}
		if (result.skippedExisting) skippedExisting = true;
	}
	return {
		migrated,
		skippedExisting,
		scopes
	};
}
//#endregion
//#region extensions/telegram/src/bot-handlers.event-bindings.ts
/** Stable operator-facing reason for a scoped reaction dropped without a known topic. */
const TELEGRAM_REACTION_THREAD_UNRESOLVED_REASON = "thread-context-unavailable";
function isCurrentTelegramChatMember(member) {
	return member.status === "creator" || member.status === "administrator" || member.status === "member" || member.status === "restricted" && member.is_member;
}
function createTelegramEventBindings({ params, message, authorization, registerMessages }) {
	const { accountId, ownerAgentId, bot, cfg, opts, runtime, shouldSkipUpdate, telegramDeps } = params;
	const { authorizeTelegramEventSender, resolveTelegramEventAuthorizationContext } = authorization;
	const { buildSyntheticContext, buildSyntheticTextMessage, processMessageWithReplyChain, resolveCachedMessageThreadSpec } = message;
	const registerChatMembership = () => {
		bot.on("my_chat_member", async (ctx) => {
			const membership = ctx.myChatMember;
			if (!membership || shouldSkipUpdate(ctx)) return;
			const botUserId = ctx.me?.id ?? opts.botInfo?.id;
			if (!(membership.chat.type === "group" || membership.chat.type === "supergroup") || botUserId === void 0 || membership.new_chat_member.user.id !== botUserId || isCurrentTelegramChatMember(membership.old_chat_member) || !isCurrentTelegramChatMember(membership.new_chat_member)) return;
			const chatId = membership.chat.id;
			const currentCfg = telegramDeps.getRuntimeConfig();
			const telegramCfg = resolveTelegramAccount({
				cfg: currentCfg,
				accountId
			}).config;
			const { groupConfig } = params.resolveTelegramGroupConfig(chatId, void 0, currentCfg);
			const groupPolicyAccess = evaluateTelegramGroupPolicyAccess({
				isGroup: true,
				chatId,
				cfg: currentCfg,
				telegramCfg,
				groupConfig,
				effectiveGroupAllow: normalizeAllowFrom(),
				resolveGroupPolicy: params.resolveGroupPolicy,
				enforcePolicy: true,
				enforceAllowlistAuthorization: false,
				allowEmptyAllowlistEntries: false,
				requireSenderForAllowlistAuthorization: false,
				checkChatAllowlist: true
			});
			const roomAllowed = groupConfig?.enabled !== false && groupPolicyAccess.allowed;
			const inviter = membership.from;
			const inviterLabel = [inviter.first_name, inviter.last_name].filter(Boolean).join(" ") || inviter.username;
			await reportChannelRoomJoin({
				cfg: currentCfg,
				channel: "telegram",
				accountId,
				conversationId: String(chatId),
				deliverTo: String(chatId),
				route: resolveTelegramConversationRoute({
					cfg: currentCfg,
					accountId,
					chatId,
					isGroup: true,
					threadSpec: resolveTelegramThreadSpec({ isGroup: true })
				}).route,
				inviterLabel,
				roomAllowed,
				resolveRoomContext: async () => {
					const chat = await bot.api.getChat(chatId);
					return {
						title: chat.title,
						purpose: chat.description,
						pinned: chat.pinned_message?.text ?? chat.pinned_message?.caption,
						historyUnavailable: true
					};
				}
			});
		});
	};
	const registerReaction = () => {
		bot.on("message_reaction", async (ctx) => {
			try {
				const reaction = ctx.messageReaction;
				if (!reaction || shouldSkipUpdate(ctx)) return;
				const chatId = reaction.chat.id;
				const messageId = reaction.message_id;
				const user = reaction.user;
				const senderId = user?.id != null ? String(user.id) : "";
				const senderUsername = user?.username ?? "";
				const isGroup = reaction.chat.type === "group" || reaction.chat.type === "supergroup";
				const isDirectMessagesChat = reaction.chat.is_direct_messages === true;
				const isForum = !isDirectMessagesChat && reaction.chat.is_forum === true;
				const authorizationCfg = telegramDeps.getRuntimeConfig();
				const reactionMode = resolveTelegramAccount({
					cfg: authorizationCfg,
					accountId
				}).config.reactionNotifications ?? "own";
				if (reactionMode === "off" || user?.is_bot) return;
				if (reactionMode === "own" && !telegramDeps.wasSentByBot(chatId, messageId, authorizationCfg, {
					accountId,
					agentId: ownerAgentId
				})) {
					logVerbose(`telegram: skipped reaction on msg ${messageId} in chat ${chatId} (own mode, not sent by bot)`);
					return;
				}
				const oldEmojis = new Set(reaction.old_reaction.filter((item) => item.type === "emoji").map((item) => item.emoji));
				const addedReactions = reaction.new_reaction.filter((item) => item.type === "emoji").filter((item) => !oldEmojis.has(item.emoji));
				if (addedReactions.length === 0) return;
				let recoveredThreadSpec;
				const requiredScope = isDirectMessagesChat ? "direct-messages" : isForum ? "forum" : void 0;
				if (requiredScope) {
					recoveredThreadSpec = await resolveCachedMessageThreadSpec({
						chatId,
						messageId
					});
					if (recoveredThreadSpec?.scope !== requiredScope || recoveredThreadSpec.id === void 0) {
						runtime.log?.(warn(`telegram: skipped scoped reaction account=${accountId} chat=${chatId} message=${messageId} reason=${TELEGRAM_REACTION_THREAD_UNRESOLVED_REASON}`));
						return;
					}
				}
				const eventAuthContext = await resolveTelegramEventAuthorizationContext({
					cfg: authorizationCfg,
					chatId,
					isGroup,
					senderId,
					threadSpec: recoveredThreadSpec ?? resolveTelegramThreadSpec({
						isGroup,
						isForum
					})
				});
				if (!await authorizeTelegramEventSender({
					chatId,
					chatTitle: reaction.chat.title,
					isGroup,
					senderId,
					senderUsername,
					mode: "reaction",
					context: eventAuthContext
				})) return;
				if (!isGroup) {
					if ((eventAuthContext.groupConfig && "requireTopic" in eventAuthContext.groupConfig ? eventAuthContext.groupConfig.requireTopic : void 0) === true) {
						logVerbose(`Blocked telegram reaction in DM ${chatId}: requireTopic=true but topic unknown for reactions`);
						return;
					}
				}
				const sessionKey = resolveTelegramConversationRoute({
					cfg: eventAuthContext.cfg,
					accountId,
					chatId,
					isGroup,
					threadSpec: recoveredThreadSpec ?? eventAuthContext.threadSpec,
					senderId,
					topicAgentId: eventAuthContext.topicConfig?.agentId
				}).route.sessionKey;
				const senderName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username : void 0;
				const senderUsernameLabel = user?.username ? `@${user.username}` : void 0;
				let senderLabel = senderName;
				if (senderName && senderUsernameLabel) senderLabel = `${senderName} (${senderUsernameLabel})`;
				else if (!senderName && senderUsernameLabel) senderLabel = senderUsernameLabel;
				if (!senderLabel && user?.id) senderLabel = `id:${user.id}`;
				senderLabel = senderLabel || "unknown";
				for (const addedReaction of addedReactions) {
					const emoji = addedReaction.emoji;
					const text = `Telegram reaction added: ${emoji} by ${senderLabel} on msg ${messageId}`;
					telegramDeps.enqueueSystemEvent(text, {
						sessionKey,
						contextKey: `telegram:reaction:add:${chatId}:${messageId}:${user?.id ?? "anon"}:${emoji}`
					});
					logVerbose(`telegram: reaction event enqueued: ${text}`);
				}
			} catch (err) {
				runtime.error?.(danger(`telegram reaction handler failed: ${String(err)}`));
				throw err;
			}
		});
	};
	const registerPolls = () => {
		bot.on("poll", async (ctx) => {
			try {
				const poll = ctx.poll;
				if (!poll?.is_closed || shouldSkipUpdate(ctx)) return;
				await retireTelegramPollRegistryEntry({
					accountId,
					pollId: poll.id
				});
			} catch (err) {
				runtime.error?.(danger(`telegram poll handler failed: ${String(err)}`));
				if (isTelegramSpooledReplayUpdate(ctx.update)) {
					recordTelegramMessageProcessingResult({
						kind: "failed-retryable",
						error: err
					});
					return;
				}
				throw err;
			}
		});
		bot.on("poll_answer", async (ctx) => {
			try {
				const pollAnswer = ctx.pollAnswer;
				if (!pollAnswer || shouldSkipUpdate(ctx)) return;
				const optionIds = pollAnswer.option_ids ?? [];
				const user = pollAnswer.user;
				if (optionIds.length === 0 || !user || user.is_bot) return;
				const pollId = pollAnswer.poll_id;
				const prepared = getPreparedTelegramPollAnswer(ctx.update);
				const entry = prepared ? prepared.entry : await findTelegramPollRegistryEntry({
					pollId,
					accountId
				});
				if (!entry) {
					logVerbose(`telegram: poll_answer for poll ${pollId} has no registry entry; skipping`);
					return;
				}
				const chatId = entry.chat.id;
				const isGroup = entry.chat.type === "group" || entry.chat.type === "supergroup";
				const senderId = String(user.id);
				const senderUsername = user.username ?? "";
				if (!isGroup && user.id !== chatId) {
					logVerbose(`Blocked forwarded telegram poll_answer for DM ${chatId} from ${senderId}`);
					return;
				}
				if (isGroup && !isCurrentTelegramChatMember(await bot.api.getChatMember(chatId, user.id))) {
					logVerbose(`Blocked forwarded telegram poll_answer for group ${chatId} from non-member ${senderId}`);
					return;
				}
				const authorizationCfg = telegramDeps.getRuntimeConfig();
				const eventAuthContext = await resolveTelegramEventAuthorizationContext({
					cfg: authorizationCfg,
					chatId,
					isGroup,
					senderId,
					threadSpec: entry.threadSpec
				});
				if (!await authorizeTelegramEventSender({
					chatId,
					chatTitle: "title" in entry.chat ? entry.chat.title : void 0,
					isGroup,
					senderId,
					senderUsername,
					mode: "reaction",
					context: eventAuthContext
				})) return;
				const requireTopic = eventAuthContext.groupConfig && "requireTopic" in eventAuthContext.groupConfig ? eventAuthContext.groupConfig.requireTopic : void 0;
				if (!isGroup && requireTopic === true) {
					if (eventAuthContext.dmThreadId == null) {
						logVerbose(`Blocked telegram poll_answer in DM ${chatId}: requireTopic=true but topic unknown`);
						return;
					}
				}
				const optionLabels = optionIds.map((index) => entry.options[index] ?? `option ${index}`);
				const text = `Poll response to "${entry.question}": ${optionLabels.join(", ")}`;
				const messageThreadId = "id" in entry.threadSpec ? entry.threadSpec.id : void 0;
				const syntheticMessage = buildSyntheticTextMessage({
					base: {
						message_id: entry.messageId,
						date: Math.floor(Date.now() / 1e3),
						chat: entry.chat,
						...messageThreadId == null ? {} : {
							message_thread_id: messageThreadId,
							is_topic_message: true
						}
					},
					from: user,
					text
				});
				const result = await processMessageWithReplyChain({
					ctx: buildSyntheticContext(ctx, syntheticMessage),
					msg: syntheticMessage,
					allMedia: [],
					storeAllowFrom: eventAuthContext.storeAllowFrom,
					options: {
						forceWasMentioned: true,
						messageIdOverride: typeof ctx.update.update_id === "number" ? String(ctx.update.update_id) : `poll:${pollId}:${user.id}:${optionIds.join("-")}`
					}
				});
				recordTelegramMessageProcessingResult(result);
				logVerbose(`telegram: poll_answer dispatched for poll ${pollId} by ${senderId}`);
			} catch (err) {
				runtime.error?.(danger(`telegram poll_answer handler failed: ${String(err)}`));
				if (isTelegramSpooledReplayUpdate(ctx.update)) {
					recordTelegramMessageProcessingResult({
						kind: "failed-retryable",
						error: err
					});
					return;
				}
				throw err;
			}
		});
	};
	const registerMigration = () => {
		bot.on("message:migrate_to_chat_id", async (ctx) => {
			try {
				const msg = ctx.message;
				if (!msg?.migrate_to_chat_id || shouldSkipUpdate(ctx)) return;
				const oldChatId = String(msg.chat.id);
				const newChatId = String(msg.migrate_to_chat_id);
				const chatTitle = msg.chat.title ?? "Unknown";
				runtime.log?.(warn(`[telegram] Group migrated: "${chatTitle}" ${oldChatId} → ${newChatId}`));
				if (!resolveChannelConfigWrites({
					cfg,
					channelId: "telegram",
					accountId
				})) {
					runtime.log?.(warn("[telegram] Config writes disabled; skipping group config migration."));
					return;
				}
				const migration = migrateTelegramGroupConfig({
					cfg: telegramDeps.getRuntimeConfig(),
					accountId,
					oldChatId,
					newChatId
				});
				if (migration.migrated) {
					runtime.log?.(warn(`[telegram] Migrating group config from ${oldChatId} to ${newChatId}`));
					migrateTelegramGroupConfig({
						cfg,
						accountId,
						oldChatId,
						newChatId
					});
					await mutateConfigFile({
						afterWrite: { mode: "auto" },
						mutate: (draft) => {
							migrateTelegramGroupConfig({
								cfg: draft,
								accountId,
								oldChatId,
								newChatId
							});
						}
					});
					runtime.log?.(warn("[telegram] Group config migrated and saved successfully"));
				} else if (migration.skippedExisting) runtime.log?.(warn(`[telegram] Group config already exists for ${newChatId}; leaving ${oldChatId} unchanged`));
				else runtime.log?.(warn(`[telegram] No config found for old group ID ${oldChatId}, migration logged only`));
			} catch (err) {
				runtime.error?.(danger(`[telegram] Group migration handler failed: ${String(err)}`));
				throw err;
			}
		});
	};
	return {
		registerChatMembership,
		registerReaction,
		registerPolls,
		registerMigration,
		registerMessages
	};
}
//#endregion
//#region extensions/telegram/src/bot-handlers.inbound-authorization.ts
function createTelegramHandlerAuthorization({ accountId, bot, opts, logger, telegramDeps, resolveGroupPolicy, resolveTelegramGroupConfig }) {
	const shouldSkipGroupMessage = (params) => shouldSkipTelegramGroupMessage(params, {
		logger,
		resolveGroupPolicy
	});
	const TELEGRAM_EVENT_AUTH_RULES = {
		reaction: {
			enforceDirectAuthorization: true,
			enforceGroupAllowlistAuthorization: false,
			deniedDmReason: "reaction unauthorized by dm policy/allowlist",
			deniedGroupReason: "reaction unauthorized by group allowlist"
		},
		"callback-scope": {
			enforceDirectAuthorization: false,
			enforceGroupAllowlistAuthorization: false,
			deniedDmReason: "callback unauthorized by inlineButtonsScope",
			deniedGroupReason: "callback unauthorized by inlineButtonsScope"
		},
		"callback-allowlist": {
			enforceDirectAuthorization: true,
			enforceGroupAllowlistAuthorization: false,
			deniedDmReason: "callback unauthorized by inlineButtonsScope allowlist",
			deniedGroupReason: "callback unauthorized by inlineButtonsScope allowlist"
		},
		"callback-runtime-allowlist": {
			enforceDirectAuthorization: true,
			enforceGroupAllowlistAuthorization: true,
			deniedDmReason: "runtime callback unauthorized by allowlist",
			deniedGroupReason: "runtime callback unauthorized by group allowlist"
		}
	};
	const resolveTelegramEventAuthorizationContext = async (params) => {
		const authorizationCfg = params.cfg;
		const authorizationTelegramCfg = resolveTelegramAccount({
			cfg: authorizationCfg,
			accountId
		}).config;
		const authorizationSettings = resolveTelegramMessageTurnSettings({
			accountId,
			cfg: authorizationCfg,
			telegramCfg: authorizationTelegramCfg,
			opts
		});
		const groupAllowContext = await resolveTelegramGroupAllowFromContext({
			cfg: authorizationCfg,
			chatId: params.chatId,
			accountId,
			dmPolicy: authorizationSettings.dmPolicy,
			allowFrom: authorizationSettings.allowFrom,
			senderId: params.senderId,
			isGroup: params.isGroup,
			threadSpec: params.threadSpec,
			groupAllowFrom: authorizationSettings.groupAllowFrom,
			readChannelAllowFromStore: telegramDeps.readChannelAllowFromStore,
			resolveTelegramGroupConfig
		});
		const effectiveDmPolicy = resolveTelegramEffectiveDmPolicy({
			isGroup: params.isGroup,
			groupConfig: groupAllowContext.groupConfig,
			dmPolicy: authorizationSettings.dmPolicy
		});
		return {
			cfg: authorizationCfg,
			allowFrom: authorizationSettings.allowFrom,
			telegramCfg: authorizationTelegramCfg,
			dmPolicy: effectiveDmPolicy,
			...groupAllowContext
		};
	};
	const authorizeTelegramEventSender = async (params) => {
		const { chatId, chatTitle, isGroup, senderId, senderUsername, mode, context } = params;
		const { dmPolicy, resolvedThreadId, storeAllowFrom, groupConfig, topicConfig, groupAllowOverride, effectiveGroupAllow, hasGroupAllowOverride, cfg: authorizationCfg, telegramCfg: authorizationTelegramCfg, allowFrom: authorizationAllowFrom } = context;
		const { enforceDirectAuthorization, enforceGroupAllowlistAuthorization, deniedDmReason, deniedGroupReason } = TELEGRAM_EVENT_AUTH_RULES[mode];
		if (shouldSkipGroupMessage({
			isGroup,
			chatId,
			chatTitle,
			resolvedThreadId,
			senderId,
			senderUsername,
			effectiveGroupAllow,
			hasGroupAllowOverride,
			groupConfig,
			topicConfig,
			cfg: authorizationCfg,
			telegramCfg: authorizationTelegramCfg
		})) return false;
		if (!isGroup && enforceDirectAuthorization) {
			const expandedDmAllowFrom = await expandTelegramAllowFromWithAccessGroups({
				cfg: authorizationCfg,
				allowFrom: groupAllowOverride ?? authorizationAllowFrom,
				accountId,
				senderId
			});
			const effectiveDmAllow = normalizeDmAllowFromWithStore({
				allowFrom: expandedDmAllowFrom,
				storeAllowFrom,
				dmPolicy
			});
			const eventAccess = await resolveTelegramEventIngressAuthorization({
				accountId,
				dmPolicy,
				isGroup,
				chatId,
				resolvedThreadId,
				senderId,
				effectiveDmAllow,
				effectiveGroupAllow,
				enforceGroupAuthorization: false,
				eventKind: mode === "reaction" ? "reaction" : "button"
			});
			if (eventAccess.decision !== "allow") {
				if (eventAccess.reasonCode === "dm_policy_disabled") {
					logVerbose(`Blocked telegram direct event from ${senderId || "unknown"} (${deniedDmReason})`);
					return false;
				}
				logVerbose(`Blocked telegram direct sender ${senderId || "unknown"} (${deniedDmReason})`);
				return false;
			}
		}
		if (isGroup && enforceGroupAllowlistAuthorization) {
			if ((await resolveTelegramEventIngressAuthorization({
				accountId,
				dmPolicy,
				isGroup,
				chatId,
				resolvedThreadId,
				senderId,
				effectiveDmAllow: normalizeDmAllowFromWithStore({
					allowFrom: [],
					dmPolicy
				}),
				effectiveGroupAllow,
				enforceGroupAuthorization: true,
				eventKind: mode === "reaction" ? "reaction" : "button"
			})).decision !== "allow") {
				logVerbose(`Blocked telegram group sender ${senderId || "unknown"} (${deniedGroupReason})`);
				return false;
			}
		}
		return true;
	};
	const isTelegramModelCallbackAuthorized = async (params) => {
		const { chatId, isGroup, senderId, senderUsername, context } = params;
		const cfgLocal = context.cfg;
		const dmAllowFrom = context.groupAllowOverride ?? context.allowFrom;
		if (isTelegramCommandsAllowFromConfigured(cfgLocal)) return resolveTelegramCommandAuthorization({
			cfg: cfgLocal,
			accountId,
			chatId,
			isGroup,
			threadSpec: context.threadSpec,
			senderId,
			senderUsername,
			commandText: "/model" // v-experience-telegram-v1
		}).isAuthorizedSender;
		const expandedDmAllowFrom = await expandTelegramAllowFromWithAccessGroups({
			cfg: cfgLocal,
			allowFrom: dmAllowFrom,
			accountId,
			senderId
		});
		const dmAllow = normalizeDmAllowFromWithStore({
			allowFrom: expandedDmAllowFrom,
			storeAllowFrom: isGroup ? [] : context.storeAllowFrom,
			dmPolicy: context.dmPolicy
		});
		return (await resolveTelegramCommandIngressAuthorization({
			accountId,
			cfg: cfgLocal,
			dmPolicy: context.dmPolicy,
			isGroup,
			chatId,
			resolvedThreadId: context.resolvedThreadId,
			senderId,
			effectiveDmAllow: dmAllow,
			effectiveGroupAllow: context.effectiveGroupAllow,
			ownerAccess: {
				ownerList: [],
				senderIsOwner: false
			},
			eventKind: "button"
		})).authorized;
	};
	const authorizeInboundMessage = async (params) => {
		const authorizationCfg = telegramDeps.getRuntimeConfig();
		const context = await resolveTelegramEventAuthorizationContext({
			cfg: authorizationCfg,
			chatId: params.chatId,
			isGroup: params.isGroup,
			senderId: params.senderId,
			threadSpec: resolveTelegramMessageThreadSpec(params.msg, params.isForum)
		});
		const { dmPolicy, resolvedThreadId, dmThreadId, storeAllowFrom, groupConfig, topicConfig, groupAllowOverride, effectiveGroupAllow, hasGroupAllowOverride, telegramCfg: authorizationTelegramCfg, allowFrom: authorizationAllowFrom } = context;
		const expandedDmAllowFrom = await expandTelegramAllowFromWithAccessGroups({
			cfg: authorizationCfg,
			allowFrom: groupAllowOverride ?? authorizationAllowFrom,
			accountId,
			senderId: params.senderId
		});
		const effectiveDmAllow = normalizeDmAllowFromWithStore({
			allowFrom: expandedDmAllowFrom,
			storeAllowFrom,
			dmPolicy
		});
		if (params.requireConfiguredGroup && (!groupConfig || groupConfig.enabled === false)) {
			logVerbose(`Blocked telegram channel ${params.chatId} (channel disabled)`);
			return { allowed: false };
		}
		if (shouldSkipGroupMessage({
			isGroup: params.isGroup,
			chatId: params.chatId,
			chatTitle: params.msg.chat.title,
			resolvedThreadId,
			senderId: params.senderId,
			senderUsername: params.senderUsername,
			effectiveGroupAllow,
			hasGroupAllowOverride,
			groupConfig,
			topicConfig,
			cfg: authorizationCfg,
			telegramCfg: authorizationTelegramCfg
		})) return { allowed: false };
		if (!params.isGroup) {
			if ((groupConfig && "requireTopic" in groupConfig ? groupConfig.requireTopic : void 0) === true && dmThreadId == null) {
				logVerbose(`Blocked telegram DM ${params.chatId}: requireTopic=true but no topic present`);
				return { allowed: false };
			}
			if (!(params.dmAccess === "challenge" ? await enforceTelegramDmAccess({
				isGroup: params.isGroup,
				dmPolicy,
				msg: params.msg,
				chatId: params.chatId,
				effectiveDmAllow,
				accountId,
				bot,
				logger,
				upsertPairingRequest: telegramDeps.upsertChannelPairingRequest
			}) : await isTelegramDmAccessAllowed({
				dmPolicy,
				msg: params.msg,
				chatId: params.chatId,
				effectiveDmAllow,
				accountId
			}))) return { allowed: false };
		}
		const ingressResolver = createTelegramIngressResolver({
			accountId,
			cfg: authorizationCfg
		});
		const groupPolicy = resolveTelegramEffectiveGroupPolicy({
			cfg: authorizationCfg,
			telegramCfg: authorizationTelegramCfg,
			groupConfig: params.isGroup ? groupConfig : void 0,
			topicConfig
		});
		let admittedIngress;
		const resolveChannelIngress = (contextBinding) => admittedIngress ??= ingressResolver.message({
			subject: createTelegramIngressSubject(params.senderId),
			conversation: {
				kind: params.isGroup ? "group" : "direct",
				id: String(params.chatId),
				...params.isGroup && resolvedThreadId != null ? { parentId: String(params.chatId) } : {},
				...resolvedThreadId != null ? { threadId: String(resolvedThreadId) } : {}
			},
			contextBinding,
			dmPolicy,
			groupPolicy,
			allowFrom: telegramAllowEntries(effectiveDmAllow),
			groupAllowFrom: telegramAllowEntries(effectiveGroupAllow)
		});
		return {
			allowed: true,
			context,
			effectiveDmAllow,
			resolveChannelIngress
		};
	};
	return {
		resolveTelegramEventAuthorizationContext,
		authorizeTelegramEventSender,
		isTelegramModelCallbackAuthorized,
		authorizeInboundMessage
	};
}
function shouldSkipTelegramGroupMessage(params, runtime) {
	const { isGroup, chatId, chatTitle, resolvedThreadId, senderId, senderUsername, effectiveGroupAllow, hasGroupAllowOverride, groupConfig, topicConfig, cfg, telegramCfg } = params;
	const baseAccess = evaluateTelegramGroupBaseAccess({
		isGroup,
		groupConfig,
		topicConfig,
		hasGroupAllowOverride,
		effectiveGroupAllow,
		senderId,
		senderUsername,
		enforceAllowOverride: true,
		requireSenderForAllowOverride: true
	});
	if (!baseAccess.allowed) {
		if (baseAccess.reason === "group-disabled") {
			logVerbose(`Blocked telegram group ${chatId} (group disabled)`);
			return true;
		}
		if (baseAccess.reason === "topic-disabled") {
			logVerbose(`Blocked telegram topic ${chatId} (${resolvedThreadId ?? "unknown"}) (topic disabled)`);
			return true;
		}
		logVerbose(`Blocked telegram group sender ${senderId || "unknown"} (group allowFrom override)`);
		return true;
	}
	if (!isGroup) return false;
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
		resolveGroupPolicy: runtime.resolveGroupPolicy,
		enforcePolicy: true,
		enforceAllowlistAuthorization: true,
		allowEmptyAllowlistEntries: false,
		requireSenderForAllowlistAuthorization: true,
		checkChatAllowlist: true
	});
	if (policyAccess.allowed) return false;
	if (policyAccess.reason === "group-policy-disabled") {
		logVerbose("Blocked telegram group message (groupPolicy: disabled)");
		return true;
	}
	if (policyAccess.reason === "group-policy-allowlist-no-sender") {
		logVerbose("Blocked telegram group message (no sender ID, groupPolicy: allowlist)");
		return true;
	}
	if (policyAccess.reason === "group-policy-allowlist-empty") {
		logVerbose("Blocked telegram group message (groupPolicy: allowlist, no group allowlist entries)");
		return true;
	}
	if (policyAccess.reason === "group-policy-allowlist-unauthorized") {
		logVerbose(`Blocked telegram group message from ${senderId} (groupPolicy: allowlist)`);
		return true;
	}
	runtime.logger.info({
		chatId,
		title: chatTitle,
		reason: "not-allowed"
	}, "skipping group message");
	return true;
}
//#endregion
//#region extensions/telegram/src/bot-handlers.debounce-key.ts
function buildTelegramInboundDebounceKey(params) {
	return `telegram:${params.accountId?.trim() || "default"}:${params.conversationKey}:${params.senderId}:${params.debounceLane}`;
}
function buildTelegramInboundDebounceConversationKey(params) {
	return buildTelegramGroupPeerId(params.chatId, params.threadSpec);
}
//#endregion
//#region extensions/telegram/src/bot-handlers.inbound-buffer.ts
function createTelegramInboundBuffers({ params: { cfg, bot, runtime, opts }, message }) {
	const { promptContextBoundaryOptions, latestPromptContextMinTimestampMs, latestPromptContextAmbientWatermark, mergeDispatchDedupeClaims, releaseDispatchDedupeClaims, buildFailedProcessingResult, settleSpooledReplayParticipants, createSpooledReplayParticipantForBufferedWork, spooledReplayOptions, buildSyntheticTextMessage, buildSyntheticContext, formatTelegramAmbientTranscriptBody, processMessageWithReplyChain } = message;
	const debounceMs = resolveInboundDebounceMs({
		cfg,
		channel: "telegram"
	});
	const FORWARD_BURST_DEBOUNCE_MS = 80;
	const resolveTelegramDebounceEntryMs = (entry) => entry.debounceLane === "forward" ? FORWARD_BURST_DEBOUNCE_MS : debounceMs;
	const shouldDebounceTelegramEntry = (entry) => {
		const hasDebounceableText = shouldDebounceTextInbound({
			text: getTelegramTextParts(entry.msg).text,
			cfg,
			commandOptions: { botUsername: entry.botUsername }
		});
		if (entry.debounceLane === "forward") return hasDebounceableText || entry.allMedia.length > 0;
		return hasDebounceableText && entry.allMedia.length === 0;
	};
	const resolveTelegramDebounceLane = (msg) => {
		const forwardMeta = msg;
		return forwardMeta.forward_origin ?? forwardMeta.forward_from ?? forwardMeta.forward_from_chat ?? forwardMeta.forward_sender_name ?? forwardMeta.forward_date ? "forward" : "default";
	};
	const inboundDebouncer = createInboundDebouncer({
		debounceMs,
		serializeImmediate: true,
		resolveDebounceMs: resolveTelegramDebounceEntryMs,
		buildKey: (entry) => entry.debounceKey,
		shouldDebounce: shouldDebounceTelegramEntry,
		onFlush: (entries) => {
			const completion = (async () => {
				const participants = entries.map((entry) => entry.spooledReplayParticipant).filter((participant) => participant !== void 0);
				const last = entries.at(-1);
				if (!last) return;
				try {
					if (entries.length === 1) {
						const result = await processMessageWithReplyChain({
							ctx: last.ctx,
							msg: last.msg,
							allMedia: last.allMedia,
							storeAllowFrom: last.storeAllowFrom,
							options: {
								receivedAtMs: last.receivedAtMs,
								ingressBuffer: "inbound-debounce",
								threadSpec: last.threadSpec,
								...promptContextBoundaryOptions(last.promptContextMinTimestampMs, last.promptContextAmbientWatermark),
								...spooledReplayOptions(participants),
								channelIngressResolvers: last.channelIngressResolvers
							},
							dispatchDedupeClaims: last.dispatchDedupeClaims,
							spooledReplayParticipants: participants
						});
						settleSpooledReplayParticipants(participants, result);
						return;
					}
					const combinedTextParts = joinTelegramTextParts(entries.map((entry) => entry.msg), "\n");
					const combinedText = combinedTextParts.text;
					const combinedMedia = entries.flatMap((entry) => entry.allMedia);
					if (!combinedText.trim() && combinedMedia.length === 0) {
						releaseDispatchDedupeClaims(mergeDispatchDedupeClaims(...entries.map((entry) => entry.dispatchDedupeClaims)));
						settleSpooledReplayParticipants(participants, { kind: "skipped" });
						return;
					}
					const first = expectDefined(entries.at(0), "multi-entry Telegram debounce batch");
					const syntheticMessage = {
						...buildSyntheticTextMessage({
							base: first.msg,
							text: combinedText,
							entities: combinedTextParts.entities,
							date: last.msg.date ?? first.msg.date
						}),
						forward_origin: void 0
					};
					const result = await processMessageWithReplyChain({
						ctx: buildSyntheticContext(first.ctx, syntheticMessage),
						msg: syntheticMessage,
						allMedia: combinedMedia,
						storeAllowFrom: first.storeAllowFrom,
						options: {
							...last.msg.message_id ? { messageIdOverride: String(last.msg.message_id) } : {},
							ambientTranscriptBody: formatTelegramAmbientTranscriptBody(entries.map((entry) => entry.msg)),
							receivedAtMs: first.receivedAtMs,
							ingressBuffer: "inbound-debounce",
							threadSpec: first.threadSpec,
							bufferedMessages: entries.map((entry) => entry.msg),
							...promptContextBoundaryOptions(latestPromptContextMinTimestampMs(...entries.map((entry) => entry.promptContextMinTimestampMs)), latestPromptContextAmbientWatermark(...entries.map((entry) => entry.promptContextAmbientWatermark))),
							...spooledReplayOptions(participants),
							channelIngressResolvers: entries.flatMap((entry) => entry.channelIngressResolvers)
						},
						dispatchDedupeClaims: mergeDispatchDedupeClaims(...entries.map((entry) => entry.dispatchDedupeClaims)),
						spooledReplayParticipants: participants
					});
					settleSpooledReplayParticipants(participants, result);
				} catch (error) {
					settleSpooledReplayParticipants(participants, buildFailedProcessingResult(error));
					throw error;
				}
			})();
			return {
				admission: completion,
				completion
			};
		},
		onError: (error, items) => {
			const participants = items.map((item) => item.spooledReplayParticipant).filter((participant) => participant !== void 0);
			settleSpooledReplayParticipants(participants, buildFailedProcessingResult(error));
			runtime.error?.(danger(`telegram debounce flush failed: ${String(error)}`));
			if (participants.length > 0) return;
			const chatId = items[0]?.msg.chat.id;
			if (chatId != null) {
				const threadParams = buildTelegramThreadParams(items[0]?.threadSpec);
				bot.api.sendMessage(chatId, "Something went wrong while processing your message. Please try again.", threadParams).catch((sendError) => {
					logVerbose(`telegram: error fallback send failed: ${String(sendError)}`);
				});
			}
		},
		onCancel: (items) => {
			releaseDispatchDedupeClaims(mergeDispatchDedupeClaims(...items.map((item) => item.dispatchDedupeClaims)));
			settleSpooledReplayParticipants(items.map((item) => item.spooledReplayParticipant).filter((participant) => participant !== void 0), { kind: "skipped" });
		}
	});
	const maxGapMs = typeof opts.testTimings?.textFragmentGapMs === "number" && Number.isFinite(opts.testTimings.textFragmentGapMs) ? Math.max(10, Math.floor(opts.testTimings.textFragmentGapMs)) : 1500;
	const textBuffer = /* @__PURE__ */ new Map();
	const textQueue = new KeyedAsyncQueue();
	const flushTextFragments = async (entry) => {
		try {
			entry.messages.sort((a, b) => a.msg.message_id - b.msg.message_id);
			const bufferedMessages = entry.messages.map((bufferedMessage) => bufferedMessage.msg);
			const first = entry.messages[0];
			const last = entry.messages.at(-1);
			if (!first || !last) {
				releaseDispatchDedupeClaims(entry.dispatchDedupeClaims);
				settleSpooledReplayParticipants(entry.spooledReplayParticipants, { kind: "skipped" });
				return;
			}
			const combinedTextParts = joinTelegramTextParts(bufferedMessages, "");
			const combinedText = combinedTextParts.text;
			if (!combinedText.trim()) {
				releaseDispatchDedupeClaims(entry.dispatchDedupeClaims);
				settleSpooledReplayParticipants(entry.spooledReplayParticipants, { kind: "skipped" });
				return;
			}
			const syntheticMessage = buildSyntheticTextMessage({
				base: first.msg,
				text: combinedText,
				entities: combinedTextParts.entities,
				date: last.msg.date ?? first.msg.date
			});
			const result = await processMessageWithReplyChain({
				ctx: buildSyntheticContext(first.ctx, syntheticMessage),
				msg: syntheticMessage,
				allMedia: [],
				storeAllowFrom: entry.storeAllowFrom,
				options: {
					messageIdOverride: String(last.msg.message_id),
					ambientTranscriptBody: formatTelegramAmbientTranscriptBody(bufferedMessages),
					receivedAtMs: first.receivedAtMs,
					ingressBuffer: "text-fragment",
					threadSpec: entry.threadSpec,
					bufferedMessages,
					...promptContextBoundaryOptions(entry.promptContextMinTimestampMs, entry.promptContextAmbientWatermark),
					...spooledReplayOptions(entry.spooledReplayParticipants),
					channelIngressResolvers: entry.channelIngressResolvers
				},
				dispatchDedupeClaims: entry.dispatchDedupeClaims,
				spooledReplayParticipants: entry.spooledReplayParticipants
			});
			settleSpooledReplayParticipants(entry.spooledReplayParticipants, result);
		} catch (error) {
			releaseDispatchDedupeClaims(entry.dispatchDedupeClaims, error);
			settleSpooledReplayParticipants(entry.spooledReplayParticipants, buildFailedProcessingResult(error));
			runtime.error?.(danger(`text fragment handler failed: ${String(error)}`));
		}
	};
	const queueTextFlush = async (entry) => {
		await textQueue.enqueue(entry.key, async () => {
			await flushTextFragments(entry).catch(() => void 0);
		});
	};
	const runTextFlush = async (entry) => {
		textBuffer.delete(entry.key);
		await queueTextFlush(entry);
	};
	const scheduleTextFlush = (entry) => {
		clearTimeout(entry.timer);
		entry.timer = setTimeout(() => void runTextFlush(entry), maxGapMs);
	};
	const handleTextFragment = async (params) => {
		const text = typeof params.msg.text === "string" ? params.msg.text : void 0;
		const isCommand = getTelegramTextParts(params.msg).entities.some((entity) => entity.type === "bot_command" && entity.offset === 0);
		const senderId = params.msg.from?.id != null ? String(params.msg.from.id) : "unknown";
		const key = `text:${params.chatId}:${params.threadSpec.scope}:${params.threadSpec.id ?? "main"}:${senderId}`;
		if (text && !isCommand && !params.isAbortControlMessage) {
			const nowMs = Date.now();
			const existing = textBuffer.get(key);
			if (existing) {
				const last = existing.messages.at(-1);
				const idGap = last ? params.msg.message_id - last.msg.message_id : Infinity;
				const timeGapMs = nowMs - (last?.receivedAtMs ?? nowMs);
				const canAppend = idGap > 0 && idGap <= 1 && timeGapMs >= 0 && timeGapMs <= maxGapMs;
				const nextTotalChars = existing.messages.reduce((sum, bufferedMessage) => sum + (bufferedMessage.msg.text?.length ?? 0), 0) + text.length;
				if (canAppend && existing.messages.length < 12 && nextTotalChars <= 5e4) {
					const participant = createSpooledReplayParticipantForBufferedWork(`text-fragment:${key}:${params.msg.message_id}`);
					if (participant) existing.spooledReplayParticipants.push(participant);
					existing.messages.push({
						msg: params.msg,
						ctx: params.ctx,
						receivedAtMs: nowMs
					});
					existing.promptContextMinTimestampMs = latestPromptContextMinTimestampMs(existing.promptContextMinTimestampMs, params.promptContextMinTimestampMs);
					existing.promptContextAmbientWatermark = latestPromptContextAmbientWatermark(existing.promptContextAmbientWatermark, params.promptContextAmbientWatermark);
					existing.dispatchDedupeClaims = mergeDispatchDedupeClaims(existing.dispatchDedupeClaims, params.dispatchDedupeClaims);
					existing.channelIngressResolvers.push(params.channelIngressResolver);
					scheduleTextFlush(existing);
					return true;
				}
				clearTimeout(existing.timer);
				textBuffer.delete(key);
				await queueTextFlush(existing);
			}
			if (text.length >= 4e3) {
				const participant = createSpooledReplayParticipantForBufferedWork(`text-fragment:${key}:${params.msg.message_id}`);
				const entry = {
					key,
					storeAllowFrom: params.storeAllowFrom,
					threadSpec: params.threadSpec,
					messages: [{
						msg: params.msg,
						ctx: params.ctx,
						receivedAtMs: nowMs
					}],
					dispatchDedupeClaims: params.dispatchDedupeClaims,
					spooledReplayParticipants: participant ? [participant] : [],
					channelIngressResolvers: [params.channelIngressResolver],
					...promptContextBoundaryOptions(params.promptContextMinTimestampMs, params.promptContextAmbientWatermark),
					timer: setTimeout(() => {}, maxGapMs)
				};
				textBuffer.set(key, entry);
				scheduleTextFlush(entry);
				return true;
			}
		} else if (text && params.isAbortControlMessage && await params.isAuthorizedAbortControlMessage()) {
			const existing = textBuffer.get(key);
			if (existing) {
				clearTimeout(existing.timer);
				textBuffer.delete(key);
				releaseDispatchDedupeClaims(existing.dispatchDedupeClaims);
				settleSpooledReplayParticipants(existing.spooledReplayParticipants, { kind: "skipped" });
			}
		}
		return false;
	};
	return {
		inboundDebouncer,
		resolveTelegramDebounceEntryMs,
		shouldDebounceTelegramEntry,
		resolveTelegramDebounceLane,
		handleTextFragment
	};
}
//#endregion
//#region extensions/telegram/src/bot-handlers.media.ts
const TELEGRAM_BOT_API_FILE_DOWNLOAD_LIMIT_MB = 20;
var TelegramBotApiFileTooLargeError = class extends MediaFetchError {
	constructor(cause) {
		super("max_bytes", `Telegram Bot API cannot download files larger than ${TELEGRAM_BOT_API_FILE_DOWNLOAD_LIMIT_MB} MB`, {
			cause,
			status: 400
		});
		this.limitMb = TELEGRAM_BOT_API_FILE_DOWNLOAD_LIMIT_MB;
		this.name = "TelegramBotApiFileTooLargeError";
	}
};
function isMediaSizeLimitError(err) {
	if (err instanceof MediaFetchError) return err.code === "max_bytes";
	const errMsg = String(err);
	return errMsg.includes("exceeds") && errMsg.includes("MB limit");
}
function isRecoverableMediaGroupError(err) {
	return err instanceof MediaFetchError || isMediaSizeLimitError(err);
}
function isAbortError(err) {
	if (!err || typeof err !== "object") return false;
	if ("name" in err && err.name === "AbortError") return true;
	return "message" in err && err.message === "This operation was aborted";
}
function isDurablyRetryableInboundMediaError(err) {
	if (!(err instanceof MediaFetchError)) return false;
	if (err.code === "http_error") return typeof err.status === "number" && (err.status === 408 || err.status === 429 || err.status >= 500);
	if (err.code !== "fetch_failed") return false;
	return isAbortError(err) || isAbortError(err.cause) || isRecoverableTelegramNetworkError(err, { context: "polling" });
}
function hasInboundMedia(msg) {
	return Boolean(msg.media_group_id) || Array.isArray(msg.photo) && msg.photo.length > 0 || Boolean(msg.video ?? msg.video_note ?? msg.document ?? msg.audio ?? msg.voice ?? msg.sticker);
}
function resolveInboundMediaFileId(msg) {
	return msg.sticker?.file_id ?? msg.photo?.[msg.photo.length - 1]?.file_id ?? msg.video?.file_id ?? msg.video_note?.file_id ?? msg.document?.file_id ?? msg.audio?.file_id ?? msg.voice?.file_id;
}
//#endregion
//#region extensions/telegram/src/bot-updates.ts
const RECENT_TELEGRAM_UPDATE_TTL_MS = 3e5;
const RECENT_TELEGRAM_UPDATE_MAX = 2e3;
const resolveTelegramUpdateId = (ctx) => ctx.update?.update_id ?? ctx.update_id;
const buildTelegramUpdateKey = (ctx) => {
	const updateId = resolveTelegramUpdateId(ctx);
	if (typeof updateId === "number") return `update:${updateId}`;
	const callbackId = ctx.callbackQuery?.id;
	if (callbackId) return `callback:${callbackId}`;
	const editedMsg = ctx.editedMessage ?? ctx.editedChannelPost ?? ctx.update?.edited_message ?? ctx.update?.edited_channel_post;
	const editedChatId = editedMsg?.chat?.id;
	const editedMessageId = editedMsg?.message_id;
	if (editedChatId !== void 0 && typeof editedMessageId === "number") return `edited-message:${editedChatId}:${editedMessageId}`;
	const msg = ctx.message ?? ctx.channelPost ?? ctx.update?.message ?? ctx.update?.channel_post ?? ctx.callbackQuery?.message;
	const chatId = msg?.chat?.id;
	const messageId = msg?.message_id;
	if (chatId !== void 0 && typeof messageId === "number") return `message:${chatId}:${messageId}`;
};
const createTelegramUpdateDedupe = () => createDedupeCache({
	ttlMs: RECENT_TELEGRAM_UPDATE_TTL_MS,
	maxSize: RECENT_TELEGRAM_UPDATE_MAX
});
//#endregion
//#region extensions/telegram/src/bot/delivery.resolve-media.ts
const FILE_TOO_BIG_RE = /file is too big/i;
const TELEGRAM_GET_FILE_RETRY_DEADLINE_MS = 12e5;
const TELEGRAM_GET_FILE_RETRY_ATTEMPTS = 3;
const GrammyErrorCtor = typeof GrammyError === "function" ? GrammyError : void 0;
function buildTelegramMediaSsrfPolicy(apiRoot, dangerouslyAllowPrivateNetwork) {
	const hostnames = ["api.telegram.org"];
	let allowedHostnames;
	if (apiRoot) try {
		const customHost = new URL(apiRoot).hostname;
		if (customHost && !hostnames.includes(customHost)) {
			hostnames.push(customHost);
			allowedHostnames = [customHost];
		}
	} catch (err) {
		logVerbose(`telegram: invalid apiRoot URL "${apiRoot}": ${String(err)}`);
	}
	return {
		hostnameAllowlist: hostnames,
		...allowedHostnames ? { allowedHostnames } : {},
		...dangerouslyAllowPrivateNetwork ? { allowPrivateNetwork: true } : {},
		allowRfc2544BenchmarkRange: true
	};
}
/**
* Returns true if the error is Telegram's "file is too big" error.
* This happens when trying to download files >20MB via the Bot API.
* Unlike network errors, this is a permanent error and should not be retried.
*/
function isFileTooBigError(err) {
	if (GrammyErrorCtor && err instanceof GrammyErrorCtor) return FILE_TOO_BIG_RE.test(err.description);
	return FILE_TOO_BIG_RE.test(formatErrorMessage(err));
}
function isRetryableGetFileError(err) {
	if (isFileTooBigError(err)) return false;
	if (isRetryableTelegramApiError(err, { context: "polling" })) return true;
	return GrammyErrorCtor !== void 0 && err instanceof GrammyErrorCtor && err.method === "getFile" && err.error_code === 400 && /\bfile is temporarily unavailable\b/i.test(err.description);
}
function resolveMediaMetadata(msg) {
	return {
		fileRef: msg.photo?.[msg.photo.length - 1] ?? msg.video ?? msg.video_note ?? msg.document ?? msg.audio ?? msg.voice,
		fileName: msg.document?.file_name ?? msg.audio?.file_name ?? msg.video?.file_name ?? msg.animation?.file_name,
		mimeType: msg.audio?.mime_type ?? msg.voice?.mime_type ?? msg.video?.mime_type ?? msg.document?.mime_type ?? msg.animation?.mime_type
	};
}
async function resolveTelegramFileWithRetry(ctx, abortSignal) {
	const deadline = new AbortController();
	const deadlineTimer = setTimeout(() => deadline.abort(/* @__PURE__ */ new Error("Telegram getFile retry deadline exceeded")), TELEGRAM_GET_FILE_RETRY_DEADLINE_MS);
	deadlineTimer.unref?.();
	const signal = abortSignal ? AbortSignal.any([abortSignal, deadline.signal]) : deadline.signal;
	const getFileSignal = signal;
	try {
		for (let attempt = 1;; attempt += 1) try {
			return await ctx.getFile(getFileSignal);
		} catch (err) {
			if (attempt >= TELEGRAM_GET_FILE_RETRY_ATTEMPTS || !isRetryableGetFileError(err)) throw err;
			logVerbose(`telegram: getFile retry ${attempt}/${TELEGRAM_GET_FILE_RETRY_ATTEMPTS}`);
			try {
				await sleepWithAbort(readTelegramRetryAfterMs(err) ?? 1e3 * 2 ** (attempt - 1), signal);
			} catch {
				throw err;
			}
		}
	} catch (err) {
		if (isFileTooBigError(err)) throw new TelegramBotApiFileTooLargeError(err);
		const status = GrammyErrorCtor && err instanceof GrammyErrorCtor ? err.error_code : void 0;
		throw new MediaFetchError(status ? "http_error" : "fetch_failed", `Telegram getFile failed after retries: ${formatErrorMessage(err)}`, {
			cause: err,
			status
		});
	} finally {
		clearTimeout(deadlineTimer);
	}
}
function resolveRequiredTelegramTransport(transport) {
	if (transport) return transport;
	const resolvedFetch = globalThis.fetch;
	if (!resolvedFetch) throw new Error("fetch is not available; set channels.telegram.proxy in config");
	return {
		fetch: resolvedFetch,
		sourceFetch: resolvedFetch,
		close: async () => {}
	};
}
/** Default idle timeout for Telegram media downloads (30 seconds). */
const TELEGRAM_DOWNLOAD_IDLE_TIMEOUT_MS = 3e4;
/** Maximum wait for Telegram media response headers (120 seconds). */
const TELEGRAM_DOWNLOAD_RESPONSE_HEADER_TIMEOUT_MS = 12e4;
function usesTrustedTelegramExplicitProxy(transport) {
	return transport.dispatcherAttempts?.some((attempt) => attempt.dispatcherPolicy?.mode === "explicit-proxy") ?? false;
}
function resolveTrustedLocalTelegramRoot(filePath, trustedLocalFileRoots) {
	if (!path.isAbsolute(filePath)) return null;
	for (const rootDir of trustedLocalFileRoots ?? []) {
		const relativePath = path.relative(rootDir, filePath);
		if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) continue;
		return {
			rootDir,
			relativePath
		};
	}
	return null;
}
const TELEGRAM_BOT_API_CONTAINER_DATA_ROOT = "/var/lib/telegram-bot-api";
function normalizeTrustedTelegramRelativeFilePath(filePath) {
	const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
	if (!normalized || normalized.includes("\0")) return null;
	if (normalized.split("/").some((part) => !part || part === "." || part === "..")) return null;
	return normalized;
}
function resolveTelegramBotApiContainerRelativePaths(filePath, token) {
	if (!path.isAbsolute(filePath)) return [];
	const normalized = filePath.replace(/\\/g, "/");
	const prefix = `${TELEGRAM_BOT_API_CONTAINER_DATA_ROOT}/`;
	if (!normalized.startsWith(prefix)) return [];
	const relativePath = normalizeTrustedTelegramRelativeFilePath(normalized.slice(prefix.length));
	if (!relativePath) return [];
	const candidates = [relativePath];
	for (const tokenDirectory of [token, token.replaceAll(":", "~")]) {
		const tokenPrefix = `${tokenDirectory}/`;
		if (tokenDirectory && relativePath.startsWith(tokenPrefix)) candidates.push(relativePath.slice(tokenPrefix.length));
	}
	return [...new Set(candidates)];
}
function isTrustedLocalTelegramFileMissing(error) {
	return error instanceof Error && "code" in error && (error.code === "not-found" || error.code === "ENOENT" || error.code === "ENOTDIR");
}
async function downloadAndSaveTelegramFile(params) {
	const trustedLocalFile = resolveTrustedLocalTelegramRoot(params.filePath, params.trustedLocalFileRoots);
	if (trustedLocalFile) {
		let localFile;
		try {
			localFile = await (await root(trustedLocalFile.rootDir)).read(trustedLocalFile.relativePath, { maxBytes: params.maxBytes });
		} catch (err) {
			throw new MediaFetchError("fetch_failed", `Failed to read local Telegram Bot API media from ${params.filePath}: ${formatErrorMessage(err)}`, { cause: err });
		}
		return await saveMediaBuffer(localFile.buffer, params.mimeType, "inbound", params.maxBytes, params.telegramFileName ?? path.basename(localFile.realPath));
	}
	const containerRelativePaths = resolveTelegramBotApiContainerRelativePaths(params.filePath, params.token);
	for (const rootDir of params.trustedLocalFileRoots ?? []) for (const relativePath of containerRelativePaths) {
		let localFile;
		try {
			localFile = await (await root(rootDir)).read(relativePath, { maxBytes: params.maxBytes });
		} catch (err) {
			if (isTrustedLocalTelegramFileMissing(err)) continue;
			throw new MediaFetchError("fetch_failed", `Failed to read mapped local Telegram Bot API media: ${formatErrorMessage(err)}`, { cause: err });
		}
		return await saveMediaBuffer(localFile.buffer, params.mimeType, "inbound", params.maxBytes, params.telegramFileName ?? path.basename(localFile.realPath));
	}
	if (path.isAbsolute(params.filePath)) throw new MediaFetchError("fetch_failed", `Telegram Bot API returned absolute file path ${params.filePath} outside trustedLocalFileRoots`);
	const transport = resolveRequiredTelegramTransport(params.transport);
	const url = `${resolveTelegramApiBase(params.apiRoot)}/file/bot${params.token}/${params.filePath}`;
	return await saveRemoteMedia({
		url,
		fetchImpl: transport.sourceFetch,
		dispatcherAttempts: transport.dispatcherAttempts,
		trustExplicitProxyDns: usesTrustedTelegramExplicitProxy(transport),
		shouldRetryFetchError: shouldRetryTelegramTransportFallback,
		...params.abortSignal ? { requestInit: { signal: params.abortSignal } } : {},
		filePathHint: params.filePath,
		maxBytes: params.maxBytes,
		responseHeaderTimeoutMs: TELEGRAM_DOWNLOAD_RESPONSE_HEADER_TIMEOUT_MS,
		readIdleTimeoutMs: TELEGRAM_DOWNLOAD_IDLE_TIMEOUT_MS,
		ssrfPolicy: buildTelegramMediaSsrfPolicy(params.apiRoot, params.dangerouslyAllowPrivateNetwork),
		fallbackContentType: params.mimeType,
		originalFilename: params.telegramFileName
	});
}
async function resolveStickerMedia(params) {
	const { msg, ctx, maxBytes, token, transport, abortSignal } = params;
	if (!msg.sticker) return;
	const sticker = msg.sticker;
	if (sticker.is_animated || sticker.is_video) {
		logVerbose("telegram: skipping animated/video sticker (only static stickers supported)");
		return null;
	}
	if (!sticker.file_id) return null;
	const file = await resolveTelegramFileWithRetry(ctx, abortSignal);
	if (!file.file_path) throw new Error("Telegram getFile returned no file_path for sticker");
	const saved = await downloadAndSaveTelegramFile({
		filePath: file.file_path,
		token,
		transport,
		maxBytes,
		apiRoot: params.apiRoot,
		trustedLocalFileRoots: params.trustedLocalFileRoots,
		dangerouslyAllowPrivateNetwork: params.dangerouslyAllowPrivateNetwork,
		abortSignal
	});
	const cached = sticker.file_unique_id ? getCachedSticker(sticker.file_unique_id) : null;
	if (cached) {
		logVerbose(`telegram: sticker cache hit for ${sticker.file_unique_id}`);
		const fileId = sticker.file_id ?? cached.fileId;
		const emoji = sticker.emoji ?? cached.emoji;
		const setName = sticker.set_name ?? cached.setName;
		if (fileId !== cached.fileId || emoji !== cached.emoji || setName !== cached.setName) cacheSticker({
			...cached,
			fileId,
			emoji,
			setName
		});
		return {
			id: saved.id,
			path: saved.path,
			size: saved.size,
			contentType: saved.contentType,
			kind: "sticker",
			fileUniqueId: sticker.file_unique_id,
			savedAt: Date.now(),
			stickerMetadata: {
				emoji,
				setName,
				fileId,
				fileUniqueId: sticker.file_unique_id,
				cachedDescription: cached.description
			}
		};
	}
	return {
		id: saved.id,
		path: saved.path,
		size: saved.size,
		contentType: saved.contentType,
		kind: "sticker",
		fileUniqueId: sticker.file_unique_id,
		savedAt: Date.now(),
		stickerMetadata: {
			emoji: sticker.emoji ?? void 0,
			setName: sticker.set_name ?? void 0,
			fileId: sticker.file_id,
			fileUniqueId: sticker.file_unique_id
		}
	};
}
async function resolveMedia(params) {
	const { ctx, maxBytes, token, transport, apiRoot, trustedLocalFileRoots, dangerouslyAllowPrivateNetwork, abortSignal } = params;
	const msg = ctx.message;
	const stickerResolved = await resolveStickerMedia({
		msg,
		ctx,
		maxBytes,
		token,
		transport,
		apiRoot,
		trustedLocalFileRoots,
		dangerouslyAllowPrivateNetwork,
		abortSignal
	});
	if (stickerResolved !== void 0) return stickerResolved;
	const metadata = resolveMediaMetadata(msg);
	const m = metadata.fileRef;
	if (!m?.file_id) return null;
	const file = await resolveTelegramFileWithRetry(ctx, abortSignal);
	if (!file.file_path) throw new Error("Telegram getFile returned no file_path");
	const saved = await downloadAndSaveTelegramFile({
		filePath: file.file_path,
		token,
		transport,
		maxBytes,
		telegramFileName: metadata.fileName,
		mimeType: metadata.mimeType,
		apiRoot,
		trustedLocalFileRoots,
		dangerouslyAllowPrivateNetwork,
		abortSignal
	});
	const nativeKind = resolveTelegramPrimaryMedia(msg)?.kind ?? "document";
	const kind = nativeKind === "sticker" ? nativeKind : saved.contentType?.startsWith("audio/") ? "audio" : nativeKind;
	return {
		id: saved.id,
		path: saved.path,
		size: saved.size,
		contentType: saved.contentType,
		...metadata.fileName ? { fileName: metadata.fileName } : {},
		kind,
		fileUniqueId: m.file_unique_id,
		savedAt: Date.now()
	};
}
//#endregion
//#region extensions/telegram/src/bot-handlers.inbound-media.ts
function createTelegramInboundMedia({ params, message }) {
	const { accountId, bot, opts, runtime, mediaMaxBytes, logger, resolveGroupActivation, resolveGroupRequireMention } = params;
	const { resolveMediaRuntime, recordMessageResolvedMedia, promptContextBoundaryOptions, latestPromptContextMinTimestampMs, latestPromptContextAmbientWatermark, mergeDispatchDedupeClaims, releaseDispatchDedupeClaims, buildFailedProcessingResult, settleSpooledReplayParticipants, createSpooledReplayParticipantForBufferedWork, spooledReplayOptions, resolveTelegramSessionState, processMessageWithReplyChain } = message;
	const timeoutMs = typeof opts.testTimings?.mediaGroupFlushMs === "number" && Number.isFinite(opts.testTimings.mediaGroupFlushMs) ? Math.max(10, Math.floor(opts.testTimings.mediaGroupFlushMs)) : 500;
	const buffer = /* @__PURE__ */ new Map();
	const queue = new KeyedAsyncQueue();
	const resolveUnaddressedGroupMediaDisposition = async (authorization) => {
		const { ctx, msg, chatId, isGroup, senderId, threadSpec } = authorization;
		const resolvedThreadId = threadSpec.scope === "forum" || threadSpec.scope === "direct-messages" ? threadSpec.id : void 0;
		const textParts = getTelegramTextParts(msg);
		const documentMime = msg.document?.mime_type?.split(";")[0]?.trim().toLowerCase();
		const mayNeedDownload = !textParts.text.trim() && Boolean(msg.audio ?? msg.voice ?? documentMime?.startsWith("audio/"));
		if (!isGroup || !hasInboundMedia(msg) || mayNeedDownload) return "process";
		const sessionState = resolveTelegramSessionState({
			chatId,
			isGroup,
			threadSpec,
			senderId,
			runtimeCfg: authorization.authorizationCfg
		});
		const activationOverride = resolveGroupActivation({
			sessionKey: sessionState.sessionKey,
			agentId: sessionState.agentId,
			cfg: authorization.authorizationCfg
		});
		const requireMention = firstDefined(authorization.topicConfig?.requireMention, activationOverride, authorization.groupConfig?.requireMention, resolveGroupRequireMention(chatId, authorization.authorizationCfg));
		const botUsername = ctx.me?.username?.trim().toLowerCase();
		const hasControlCommandInMessage = hasControlCommand(textParts.text, authorization.authorizationCfg, { botUsername });
		if (!requireMention && !hasControlCommandInMessage) return "process";
		const commandGate = await resolveTelegramCommandIngressAuthorization({
			accountId,
			cfg: authorization.authorizationCfg,
			dmPolicy: "pairing",
			isGroup,
			chatId,
			resolvedThreadId,
			senderId,
			effectiveDmAllow: authorization.effectiveDmAllow,
			effectiveGroupAllow: authorization.effectiveGroupAllow,
			ownerAccess: {
				ownerList: [],
				senderIsOwner: false
			},
			eventKind: "message",
			allowTextCommands: true,
			hasControlCommand: hasControlCommandInMessage,
			modeWhenAccessGroupsOff: "allow",
			includeDmAllowForGroupCommands: false
		});
		if (commandGate.shouldBlockControlCommand) {
			logger.info({
				chatId,
				reason: "unauthorized-control-command"
			}, "skipping group command media before download");
			return "skip";
		}
		if (!requireMention) return "process";
		const mentionRegexes = buildMentionRegexes(authorization.authorizationCfg, sessionState.agentId, {
			provider: "telegram",
			conversationId: buildTelegramGroupPeerId(chatId, threadSpec),
			providerPolicy: authorization.authorizationCfg.channels?.telegram?.accounts?.[accountId]?.mentionPatterns
		});
		const hasAnyMention = textParts.entities.some((entity) => entity.type === "mention");
		const explicitlyMentioned = botUsername ? hasBotMention(msg, botUsername) : false;
		const wasMentioned = matchesMentionWithExplicit({
			text: textParts.text,
			mentionRegexes,
			explicit: {
				hasAnyMention,
				isExplicitlyMentioned: explicitlyMentioned,
				canResolveExplicit: Boolean(botUsername)
			}
		});
		const replyToBotMessage = ctx.me?.id != null && msg.reply_to_message?.from?.id === ctx.me.id;
		const implicitMentionKinds = implicitMentionKindWhen("reply_to_bot", replyToBotMessage && !isTelegramForumServiceMessage(msg.reply_to_message));
		if (resolveInboundMentionDecision({
			facts: {
				canDetectMention: Boolean(botUsername) || mentionRegexes.length > 0,
				wasMentioned,
				hasAnyMention,
				implicitMentionKinds
			},
			policy: {
				isGroup,
				requireMention: true,
				allowTextCommands: true,
				hasControlCommand: hasControlCommandInMessage,
				commandAuthorized: commandGate.authorized
			}
		}).shouldSkip) {
			if (resolveTelegramGroupIngestEnabled({
				cfg: authorization.authorizationCfg,
				chatId,
				accountId,
				topicConfig: authorization.topicConfig
			})) return "silent-ingest";
			logger.info({
				chatId,
				reason: "no-mention"
			}, "skipping group media before download");
			return "skip";
		}
		return "process";
	};
	const processMediaGroup = async (entry) => {
		try {
			const finalIngressMessageId = entry.messages.at(-1)?.msg.message_id;
			entry.messages.sort((a, b) => a.msg.message_id - b.msg.message_id);
			let primary = entry.messages.find((item) => item.msg.caption || item.msg.text) ?? entry.messages[0];
			if (!primary) {
				releaseDispatchDedupeClaims(entry.dispatchDedupeClaims);
				settleSpooledReplayParticipants(entry.spooledReplayParticipants, { kind: "skipped" });
				return;
			}
			const captionParts = entry.messages.map(({ msg }) => getTelegramTextParts(msg)).filter(({ text }) => text.trim());
			if (captionParts.length > 1) {
				const botUsername = primary.ctx.me?.username;
				const commandCaptionIndex = captionParts.findIndex(({ text }) => hasControlCommand(text, entry.authorizationCfg, { botUsername }));
				if (commandCaptionIndex > 0) {
					const [commandCaption] = captionParts.splice(commandCaptionIndex, 1);
					if (commandCaption) captionParts.unshift(commandCaption);
				}
				let caption = "";
				const captionEntities = [];
				for (const { text, entities } of captionParts) {
					if (caption) caption += "\n";
					const offset = caption.length;
					caption += text;
					for (const entity of entities) captionEntities.push({
						...entity,
						offset: entity.offset + offset
					});
				}
				const combinedMessage = {
					...primary.msg,
					text: void 0,
					entities: void 0,
					caption,
					caption_entities: captionEntities.length ? captionEntities : void 0
				};
				const combinedContext = Object.create(primary.ctx);
				Object.defineProperty(combinedContext, "message", {
					value: combinedMessage,
					enumerable: true
				});
				primary = {
					ctx: combinedContext,
					msg: combinedMessage
				};
			}
			const mediaDisposition = await resolveUnaddressedGroupMediaDisposition({
				...entry,
				...primary
			});
			if (mediaDisposition === "skip") {
				releaseDispatchDedupeClaims(entry.dispatchDedupeClaims);
				settleSpooledReplayParticipants(entry.spooledReplayParticipants, { kind: "skipped" });
				return;
			}
			const allMedia = [];
			const selection = /* @__PURE__ */ new Map();
			const mediaRuntime = resolveMediaRuntime(...entry.spooledReplayParticipants.map((participant) => participant.abortSignal));
			let materializedCount = 0;
			let skippedCount = 0;
			for (const { ctx, msg } of entry.messages) {
				const sourceMessageId = String(msg.message_id);
				const nativeKind = resolveTelegramPrimaryMedia(msg)?.kind ?? "document";
				let media;
				try {
					media = await resolveMedia({
						ctx,
						maxBytes: mediaMaxBytes,
						...mediaRuntime
					});
				} catch (error) {
					if (entry.spooledReplayParticipants.length > 0 && (mediaRuntime.abortSignal?.aborted || isDurablyRetryableInboundMediaError(error))) throw error;
					if (!isRecoverableMediaGroupError(error)) throw error;
					runtime.log?.(warn(`media group: skipping photo that failed to fetch: ${String(error)}`));
				}
				if (media) {
					await recordMessageResolvedMedia({
						msg,
						media,
						botUserId: ctx.me?.id
					});
					allMedia.push({
						path: media.path,
						contentType: media.contentType,
						...media.fileName ? { fileName: media.fileName } : {},
						kind: media.kind,
						stickerMetadata: media.stickerMetadata,
						sourceMessageId
					});
					materializedCount++;
					selection.set(sourceMessageId, "include");
				} else {
					allMedia.push({
						kind: nativeKind,
						sourceMessageId,
						unavailable: { reason: "download-failed" }
					});
					selection.set(sourceMessageId, "exclude");
					skippedCount++;
				}
			}
			if (skippedCount > 0 && mediaDisposition !== "silent-ingest") {
				const verb = skippedCount === 1 ? "was" : "were";
				await withTelegramApiErrorLogging({
					operation: "sendMessage",
					runtime,
					fn: () => bot.api.sendMessage(primary.msg.chat.id, `⚠️ Received ${materializedCount} of ${entry.messages.length} images — ${skippedCount} could not be fetched and ${verb} skipped.`, {
						...buildTelegramThreadParams(entry.threadSpec),
						reply_parameters: {
							message_id: primary.msg.message_id,
							allow_sending_without_reply: true
						}
					})
				}).catch(() => {});
			}
			const result = await processMessageWithReplyChain({
				ctx: primary.ctx,
				msg: primary.msg,
				allMedia,
				promptContextMessageSelection: selection,
				storeAllowFrom: entry.storeAllowFrom,
				options: {
					threadSpec: entry.threadSpec,
					...finalIngressMessageId != null ? { messageIdOverride: String(finalIngressMessageId) } : {},
					...promptContextBoundaryOptions(entry.promptContextMinTimestampMs, entry.promptContextAmbientWatermark),
					...spooledReplayOptions(entry.spooledReplayParticipants),
					channelIngressResolvers: entry.channelIngressResolvers
				},
				dispatchDedupeClaims: entry.dispatchDedupeClaims,
				spooledReplayParticipants: entry.spooledReplayParticipants
			});
			settleSpooledReplayParticipants(entry.spooledReplayParticipants, result);
		} catch (error) {
			releaseDispatchDedupeClaims(entry.dispatchDedupeClaims, error);
			settleSpooledReplayParticipants(entry.spooledReplayParticipants, buildFailedProcessingResult(error));
			runtime.error?.(danger(`media group handler failed: ${String(error)}`));
		}
	};
	const queueEntry = (key, entry) => void queue.enqueue(key, async () => {
		await processMediaGroup(entry).catch(() => void 0);
	});
	const handleMediaGroup = (input) => {
		const mediaGroupId = input.msg.media_group_id;
		if (!mediaGroupId) return false;
		const key = `media:${input.chatId}:${input.threadSpec.scope}:${input.threadSpec.id ?? "main"}:${mediaGroupId}`;
		const existing = buffer.get(key);
		const participant = createSpooledReplayParticipantForBufferedWork(`media-group:${key}:${input.msg.message_id}`);
		if (existing) {
			if (participant) existing.spooledReplayParticipants.push(participant);
			clearTimeout(existing.timer);
			existing.messages.push({
				msg: input.msg,
				ctx: input.ctx
			});
			existing.promptContextMinTimestampMs = latestPromptContextMinTimestampMs(existing.promptContextMinTimestampMs, input.promptContextMinTimestampMs);
			existing.promptContextAmbientWatermark = latestPromptContextAmbientWatermark(existing.promptContextAmbientWatermark, input.promptContextAmbientWatermark);
			existing.dispatchDedupeClaims = mergeDispatchDedupeClaims(existing.dispatchDedupeClaims, input.dispatchDedupeClaims);
			existing.channelIngressResolvers = [...existing.channelIngressResolvers, ...input.channelIngressResolvers];
			existing.timer = setTimeout(() => {
				buffer.delete(key);
				queueEntry(key, existing);
			}, timeoutMs);
			return true;
		}
		const entry = {
			...input,
			messages: [{
				msg: input.msg,
				ctx: input.ctx
			}],
			spooledReplayParticipants: participant ? [participant] : [],
			...promptContextBoundaryOptions(input.promptContextMinTimestampMs, input.promptContextAmbientWatermark),
			timer: setTimeout(() => {
				buffer.delete(key);
				queueEntry(key, entry);
			}, timeoutMs)
		};
		buffer.set(key, entry);
		return true;
	};
	return {
		handleMediaGroup,
		resolveUnaddressedGroupMediaDisposition
	};
}
//#endregion
//#region extensions/telegram/src/bot-handlers.inbound-processing.ts
function createTelegramInboundProcessing({ params: { cfg, accountId, bot, opts, runtime, mediaMaxBytes, logger, resolveGroupActivation, resolveGroupRequireMention }, message }) {
	const { resolveMediaRuntime, recordMessageResolvedMedia, promptContextBoundaryOptions, releaseDispatchDedupeClaims, createSpooledReplayParticipantForBufferedWork } = message;
	const { inboundDebouncer, resolveTelegramDebounceEntryMs, shouldDebounceTelegramEntry, resolveTelegramDebounceLane, handleTextFragment } = createTelegramInboundBuffers({
		params: {
			cfg,
			bot,
			runtime,
			opts
		},
		message
	});
	const { handleMediaGroup, resolveUnaddressedGroupMediaDisposition } = createTelegramInboundMedia({
		params: {
			accountId,
			bot,
			opts,
			runtime,
			mediaMaxBytes,
			logger,
			resolveGroupActivation,
			resolveGroupRequireMention
		},
		message
	});
	const processInboundMessage = async (params) => {
		const { authorizationCfg, ctx, msg, chatId, isGroup, isForum, threadSpec, dmPolicy, storeAllowFrom, senderId, effectiveGroupAllow, effectiveDmAllow, channelIngressResolver, groupConfig, topicConfig, sendOversizeWarning, oversizeLogMessage, promptContextMinTimestampMs, promptContextAmbientWatermark, dispatchDedupeClaims } = params;
		const resolvedThreadId = threadSpec.scope === "forum" || threadSpec.scope === "direct-messages" ? threadSpec.id : void 0;
		const messageText = getTelegramTextParts(msg).text;
		const botUsername = ctx.me?.username;
		const isAbortControlMessage = isAbortRequestText(messageText, { botUsername });
		let abortControlAuthorized;
		const isAuthorizedAbortControlMessage = () => {
			if (!isAbortControlMessage || !senderId) return Promise.resolve(false);
			abortControlAuthorized ??= resolveTelegramCommandIngressAuthorization({
				accountId,
				cfg: authorizationCfg,
				dmPolicy,
				isGroup,
				chatId,
				resolvedThreadId,
				senderId,
				effectiveDmAllow,
				effectiveGroupAllow,
				ownerAccess: {
					ownerList: [],
					senderIsOwner: false
				},
				eventKind: "message",
				allowTextCommands: true,
				hasControlCommand: true,
				modeWhenAccessGroupsOff: "allow",
				includeDmAllowForGroupCommands: false
			}).then((gate) => gate.authorized);
			return abortControlAuthorized;
		};
		if (await handleTextFragment({
			ctx,
			msg,
			chatId,
			threadSpec,
			storeAllowFrom,
			isAbortControlMessage,
			isAuthorizedAbortControlMessage,
			promptContextMinTimestampMs,
			promptContextAmbientWatermark,
			dispatchDedupeClaims,
			channelIngressResolver
		})) return {
			kind: "buffered",
			buffer: "text-fragment"
		};
		if (handleMediaGroup({
			authorizationCfg,
			ctx,
			msg,
			chatId,
			isGroup,
			isForum,
			threadSpec,
			storeAllowFrom,
			senderId,
			effectiveGroupAllow,
			effectiveDmAllow,
			groupConfig,
			topicConfig,
			promptContextMinTimestampMs,
			promptContextAmbientWatermark,
			dispatchDedupeClaims,
			channelIngressResolvers: [channelIngressResolver]
		})) return {
			kind: "buffered",
			buffer: "media-group"
		};
		const mediaDisposition = await resolveUnaddressedGroupMediaDisposition({
			authorizationCfg,
			ctx,
			msg,
			chatId,
			isGroup,
			isForum,
			threadSpec,
			senderId,
			effectiveGroupAllow,
			effectiveDmAllow,
			groupConfig,
			topicConfig
		});
		if (mediaDisposition === "skip") {
			releaseDispatchDedupeClaims(dispatchDedupeClaims);
			return { kind: "ignored" };
		}
		const nativeMedia = resolveTelegramPrimaryMedia(msg);
		const mediaRuntime = resolveMediaRuntime();
		let media = null;
		let unavailable;
		try {
			media = await resolveMedia({
				ctx,
				maxBytes: mediaMaxBytes,
				...mediaRuntime
			});
			if (mediaRuntime.abortSignal?.aborted) {
				const abortError = mediaRuntime.abortSignal.reason ?? /* @__PURE__ */ new Error("telegram media hydration owner aborted");
				recordTelegramMessageProcessingResult({
					kind: "failed-retryable",
					error: abortError
				});
				releaseDispatchDedupeClaims(dispatchDedupeClaims, abortError);
				return { kind: "ignored" };
			}
			if (media) await recordMessageResolvedMedia({
				msg,
				media,
				botUserId: ctx.me?.id
			});
		} catch (mediaErr) {
			const replayingSpooledUpdate = isTelegramSpooledReplayUpdate(ctx.update);
			const warningThreadParams = buildTelegramThreadParams(threadSpec);
			if (mediaRuntime.abortSignal?.aborted && isDurablyRetryableInboundMediaError(mediaErr)) {
				recordTelegramMessageProcessingResult({
					kind: "failed-retryable",
					error: mediaErr
				});
				releaseDispatchDedupeClaims(dispatchDedupeClaims, mediaErr);
				return { kind: "ignored" };
			}
			if (isMediaSizeLimitError(mediaErr)) {
				const limitMb = mediaErr instanceof TelegramBotApiFileTooLargeError ? Math.min(mediaErr.limitMb, Math.round(mediaMaxBytes / 1048576)) : Math.round(mediaMaxBytes / 1048576);
				unavailable = {
					reason: "oversize",
					limitMb
				};
				if (sendOversizeWarning && mediaDisposition !== "silent-ingest") await withTelegramApiErrorLogging({
					operation: "sendMessage",
					runtime,
					fn: () => bot.api.sendMessage(chatId, `⚠️ File too large. Maximum size is ${limitMb}MB.`, {
						...warningThreadParams,
						reply_parameters: {
							message_id: msg.message_id,
							allow_sending_without_reply: true
						}
					})
				}).catch(() => {});
				logger.warn({
					chatId,
					error: String(mediaErr)
				}, oversizeLogMessage);
			} else {
				logger.warn({
					chatId,
					error: String(mediaErr)
				}, "media fetch failed");
				if (isDurablyRetryableInboundMediaError(mediaErr) && replayingSpooledUpdate) {
					recordTelegramMessageProcessingResult({
						kind: "failed-retryable",
						error: mediaErr
					});
					releaseDispatchDedupeClaims(dispatchDedupeClaims, mediaErr);
					return { kind: "ignored" };
				}
				unavailable = { reason: "download-failed" };
				if (mediaDisposition !== "silent-ingest") await withTelegramApiErrorLogging({
					operation: "sendMessage",
					runtime,
					fn: () => bot.api.sendMessage(chatId, "⚠️ Failed to download media. Please try again.", {
						...warningThreadParams,
						reply_parameters: {
							message_id: msg.message_id,
							allow_sending_without_reply: true
						}
					})
				}).catch(() => {});
			}
		}
		const allMedia = nativeMedia ? [media ? {
			path: media.path,
			contentType: media.contentType,
			...media.fileName ? { fileName: media.fileName } : {},
			kind: media.kind,
			stickerMetadata: media.stickerMetadata
		} : {
			kind: nativeMedia.kind,
			unavailable
		}] : [];
		const conversationKey = buildTelegramInboundDebounceConversationKey({
			chatId,
			threadSpec
		});
		const debounceLane = resolveTelegramDebounceLane(msg);
		const debounceKey = senderId ? buildTelegramInboundDebounceKey({
			accountId,
			conversationKey,
			senderId,
			debounceLane
		}) : null;
		if (senderId && await isAuthorizedAbortControlMessage()) for (const lane of ["default", "forward"]) inboundDebouncer.cancelKey(buildTelegramInboundDebounceKey({
			accountId,
			conversationKey,
			senderId,
			debounceLane: lane
		}));
		const debounceEntry = {
			ctx,
			msg,
			allMedia,
			storeAllowFrom,
			receivedAtMs: Date.now(),
			debounceKey: isAbortControlMessage ? null : debounceKey,
			debounceLane,
			botUsername,
			threadSpec,
			...promptContextBoundaryOptions(promptContextMinTimestampMs, promptContextAmbientWatermark),
			dispatchDedupeClaims,
			channelIngressResolvers: [channelIngressResolver]
		};
		const shouldBufferDebounce = Boolean(debounceEntry.debounceKey && resolveTelegramDebounceEntryMs(debounceEntry) > 0 && shouldDebounceTelegramEntry(debounceEntry));
		if (shouldBufferDebounce) debounceEntry.spooledReplayParticipant = createSpooledReplayParticipantForBufferedWork(`inbound-debounce:${debounceEntry.debounceKey}`);
		await inboundDebouncer.enqueue(debounceEntry);
		return shouldBufferDebounce ? {
			kind: "buffered",
			buffer: "debounce"
		} : { kind: "processed" };
	};
	return { processInboundMessage };
}
//#endregion
//#region extensions/telegram/src/location-message-hook.ts
function buildTelegramLocationMessageHook(params) {
	const location = extractTelegramLocation(params.msg);
	if (!location) return null;
	const msg = params.msg;
	const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
	const threadSpec = resolveTelegramMessageThreadSpec(msg, params.isForum);
	const originatingTo = buildTelegramInboundOriginTarget(msg.chat.id, threadSpec);
	const from = isGroup ? buildTelegramGroupFrom(msg.chat.id, threadSpec) : `telegram:${msg.chat.id}`;
	const canonical = deriveInboundMessageHookContext({
		From: from,
		To: originatingTo,
		OriginatingChannel: "telegram",
		OriginatingTo: originatingTo,
		Provider: "telegram",
		Surface: "telegram",
		AccountId: params.accountId,
		MessageSid: String(msg.message_id),
		MessageSidFull: String(msg.message_id),
		SenderId: msg.from?.id != null ? String(msg.from.id) : void 0,
		SenderName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || void 0,
		SenderUsername: msg.from?.username,
		Timestamp: params.updateKind.startsWith("edited_") && msg.edit_date ? msg.edit_date * 1e3 : msg.date ? msg.date * 1e3 : void 0,
		Body: formatLocationText(location),
		RawBody: formatLocationText(location),
		BodyForAgent: formatLocationText(location),
		MessageThreadId: threadSpec.id,
		GroupSubject: isGroup ? msg.chat.title : void 0,
		LocationLat: location.latitude,
		LocationLon: location.longitude,
		LocationAccuracy: location.accuracy,
		LocationName: location.name,
		LocationAddress: location.address,
		LocationSource: location.source,
		LocationIsLive: location.isLive,
		LocationLivePeriodSeconds: msg.location?.live_period,
		LocationCaption: location.caption,
		ProviderUpdateId: String(params.updateId),
		ProviderUpdateKind: params.updateKind,
		ProviderMessageTimestamp: msg.date ? msg.date * 1e3 : void 0,
		ProviderEditTimestamp: msg.edit_date ? msg.edit_date * 1e3 : void 0,
		CommandAuthorized: false
	});
	return {
		event: toPluginMessageReceivedEvent(canonical),
		context: toPluginMessageContext(canonical)
	};
}
function emitTelegramLiveLocationMessageHook(params) {
	const pair = buildTelegramLocationMessageHook(params);
	const runner = getGlobalHookRunner();
	if (!pair || !runner?.hasHooks("message_received", pair.context)) return;
	fireAndForgetHook(runner.runMessageReceived(pair.event, pair.context), "message_received plugin hook failed");
}
//#endregion
//#region extensions/telegram/src/bot-handlers.inbound-pipeline.ts
function createTelegramInboundHandlers({ accountId, bot, opts, runtime, shouldSkipUpdate }, messageRuntime, authorizationRuntime, inboundRuntime) {
	const { normalizePromptContextMinTimestampMs, promptContextBoundaryOptions, releaseDispatchDedupeClaims, claimMessageDispatchDedupe, buildSyntheticContext, resolveTelegramSessionState, resolvePromptContextAmbientWatermark, recordMessageForReplyChain } = messageRuntime;
	const { authorizeInboundMessage } = authorizationRuntime;
	const { processInboundMessage } = inboundRuntime;
	const getChat = bot.api.getChat.bind(bot.api);
	const resolveBotUserId = (ctx) => {
		const botUserId = ctx.me?.id ?? opts.botInfo?.id;
		if (botUserId == null) throw new Error("Telegram bot identity is unavailable");
		return botUserId;
	};
	const normalizeChannelPostMessage = (post) => {
		const chatId = post.chat.id;
		const syntheticFrom = post.sender_chat ? {
			id: post.sender_chat.id,
			is_bot: true,
			first_name: post.sender_chat.title || "Channel",
			username: post.sender_chat.username
		} : {
			id: chatId,
			is_bot: true,
			first_name: post.chat.title || "Channel",
			username: post.chat.username
		};
		return {
			...post,
			from: post.from ?? syntheticFrom,
			chat: {
				...post.chat,
				type: "supergroup"
			}
		};
	};
	const recordEditedMessageForReplyChain = async (params) => {
		if (shouldSkipUpdate(params.ctxForDedupe)) return;
		const msg = params.msg;
		const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
		const isForum = await resolveTelegramForumFlag({
			chatId: msg.chat.id,
			chatType: msg.chat.type,
			isGroup,
			isForum: msg.chat.is_forum,
			isTopicMessage: msg.is_topic_message,
			getChat
		});
		const normalizedMsg = withResolvedTelegramForumFlag(msg, isForum);
		const gate = await authorizeInboundMessage({
			msg: normalizedMsg,
			chatId: normalizedMsg.chat.id,
			isGroup,
			isForum,
			senderId: normalizedMsg.from?.id != null ? String(normalizedMsg.from.id) : "",
			senderUsername: normalizedMsg.from?.username ?? "",
			requireConfiguredGroup: params.requireConfiguredGroup,
			dmAccess: "silent"
		});
		if (!gate.allowed) return;
		await recordMessageForReplyChain(normalizedMsg, gate.context.threadSpec, params.botUserId);
		if (params.providerUpdate) emitTelegramLiveLocationMessageHook({
			accountId,
			msg: normalizedMsg,
			updateId: params.providerUpdate.id,
			updateKind: params.providerUpdate.kind,
			isForum
		});
	};
	const handleInboundMessageLike = async (event) => {
		let dispatchDedupeClaims = [];
		try {
			if (shouldSkipUpdate(event.ctxForDedupe)) return { kind: "ignored" };
			const gate = await authorizeInboundMessage({
				msg: event.msg,
				chatId: event.chatId,
				isGroup: event.isGroup,
				isForum: event.isForum,
				senderId: event.senderId,
				senderUsername: event.senderUsername,
				requireConfiguredGroup: event.requireConfiguredGroup,
				dmAccess: "challenge"
			});
			if (!gate.allowed) return { kind: "ignored" };
			const { effectiveDmAllow } = gate;
			const { dmPolicy, resolvedThreadId, storeAllowFrom, groupConfig, topicConfig, effectiveGroupAllow, threadSpec } = gate.context;
			const sessionState = resolveTelegramSessionState({
				chatId: event.chatId,
				isGroup: event.isGroup,
				threadSpec,
				botHasTopicsEnabled: resolveTelegramBotHasTopicsEnabled(event.ctx.me),
				senderId: event.senderId,
				runtimeCfg: gate.context.cfg
			});
			const promptContextMinTimestampMs = normalizePromptContextMinTimestampMs(sessionState.sessionEntry?.sessionStartedAt);
			const promptContextAmbientWatermark = resolvePromptContextAmbientWatermark({
				chatId: event.chatId,
				isGroup: event.isGroup,
				resolvedThreadId,
				sessionKey: sessionState.sessionKey,
				storePath: sessionState.storePath
			});
			const dispatchDedupe = await claimMessageDispatchDedupe(event.msg, event.botUserId);
			if (!dispatchDedupe.process) return { kind: "ignored" };
			dispatchDedupeClaims = dispatchDedupe.claims;
			await recordMessageForReplyChain(event.msg, gate.context.threadSpec, event.botUserId);
			return await processInboundMessage({
				authorizationCfg: gate.context.cfg,
				ctx: event.ctx,
				msg: event.msg,
				chatId: event.chatId,
				isGroup: event.isGroup,
				isForum: event.isForum,
				threadSpec,
				dmPolicy,
				storeAllowFrom,
				senderId: event.senderId,
				effectiveGroupAllow,
				effectiveDmAllow,
				channelIngressResolver: gate.resolveChannelIngress,
				groupConfig: event.isGroup ? groupConfig : void 0,
				topicConfig,
				sendOversizeWarning: event.sendOversizeWarning,
				oversizeLogMessage: event.oversizeLogMessage,
				dispatchDedupeClaims,
				...promptContextBoundaryOptions(promptContextMinTimestampMs, promptContextAmbientWatermark)
			});
		} catch (err) {
			releaseDispatchDedupeClaims(dispatchDedupeClaims, err);
			runtime.error?.(danger(`${event.errorMessage}: ${String(err)}`));
			const spooledReplay = isTelegramSpooledReplayUpdate(event.ctx.update);
			if (err instanceof TelegramPairingStoreReadError || spooledReplay) {
				recordTelegramMessageProcessingResult({
					kind: "failed-retryable",
					error: err
				});
				if (spooledReplay) return { kind: "ignored" };
				await withTelegramApiErrorLogging({
					operation: "sendMessage",
					runtime,
					fn: () => bot.api.sendMessage(event.chatId, "⚠️ Couldn't process this message, please try again in a moment.", { reply_parameters: {
						message_id: event.msg.message_id,
						allow_sending_without_reply: true
					} })
				}).catch(() => {});
			}
			return { kind: "ignored" };
		}
	};
	const handleMessage = async (ctx) => {
		const msg = ctx.message;
		if (!msg) return { kind: "ignored" };
		const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
		const isForum = await resolveTelegramForumFlag({
			chatId: msg.chat.id,
			chatType: msg.chat.type,
			isGroup,
			isForum: msg.chat.is_forum,
			isTopicMessage: msg.is_topic_message,
			getChat
		});
		const normalizedMsg = withResolvedTelegramForumFlag(msg, isForum);
		const botUserId = resolveBotUserId(ctx);
		if (normalizedMsg.from?.id != null && normalizedMsg.from.id === botUserId) return { kind: "ignored" };
		return await handleInboundMessageLike({
			ctxForDedupe: ctx,
			ctx: buildSyntheticContext(ctx, normalizedMsg),
			botUserId,
			msg: normalizedMsg,
			chatId: normalizedMsg.chat.id,
			isGroup,
			isForum,
			messageThreadId: normalizedMsg.message_thread_id,
			senderId: normalizedMsg.from?.id != null ? String(normalizedMsg.from.id) : "",
			senderUsername: normalizedMsg.from?.username ?? "",
			requireConfiguredGroup: false,
			sendOversizeWarning: true,
			oversizeLogMessage: "media exceeds size limit",
			errorMessage: "handler failed"
		});
	};
	const handleEditedMessage = async (ctx) => {
		const msg = ctx.editedMessage;
		if (!msg) return { kind: "ignored" };
		await recordEditedMessageForReplyChain({
			ctxForDedupe: ctx,
			msg,
			requireConfiguredGroup: false,
			botUserId: resolveBotUserId(ctx),
			providerUpdate: typeof ctx.update?.update_id === "number" ? {
				id: ctx.update.update_id,
				kind: "edited_message"
			} : void 0
		});
		return { kind: "recorded" };
	};
	const handleChannelPost = async (ctx) => {
		const post = ctx.channelPost;
		if (!post) return { kind: "ignored" };
		const chatId = post.chat.id;
		const syntheticMsg = normalizeChannelPostMessage(post);
		return await handleInboundMessageLike({
			ctxForDedupe: ctx,
			ctx: buildSyntheticContext(ctx, syntheticMsg),
			botUserId: resolveBotUserId(ctx),
			msg: syntheticMsg,
			chatId,
			isGroup: true,
			isForum: false,
			senderId: post.sender_chat?.id != null ? String(post.sender_chat.id) : post.from?.id != null ? String(post.from.id) : "",
			senderUsername: post.sender_chat?.username ?? post.from?.username ?? "",
			requireConfiguredGroup: true,
			sendOversizeWarning: false,
			oversizeLogMessage: "channel post media exceeds size limit",
			errorMessage: "channel_post handler failed"
		});
	};
	const handleEditedChannelPost = async (ctx) => {
		const post = ctx.editedChannelPost;
		if (!post) return { kind: "ignored" };
		await recordEditedMessageForReplyChain({
			ctxForDedupe: ctx,
			msg: normalizeChannelPostMessage(post),
			requireConfiguredGroup: true,
			botUserId: resolveBotUserId(ctx),
			providerUpdate: typeof ctx.update?.update_id === "number" ? {
				id: ctx.update.update_id,
				kind: "edited_channel_post"
			} : void 0
		});
		return { kind: "recorded" };
	};
	return {
		handleMessage,
		handleEditedMessage,
		handleChannelPost,
		handleEditedChannelPost
	};
}
function createTelegramInboundPipeline({ params, message, authorization }) {
	const handlers = createTelegramInboundHandlers(params, message, authorization, createTelegramInboundProcessing({
		params,
		message
	}));
	return { handle: async (ctx) => {
		if (ctx.message) return await handlers.handleMessage(ctx);
		if (ctx.editedMessage) return await handlers.handleEditedMessage(ctx);
		if (ctx.channelPost) return await handlers.handleChannelPost(ctx);
		if (ctx.editedChannelPost) return await handlers.handleEditedChannelPost(ctx);
		return { kind: "ignored" };
	} };
}
function registerTelegramInboundHandlers({ bot, pipeline }) {
	bot.on("message", pipeline.handle);
	bot.on("edited_message", pipeline.handle);
	bot.on("channel_post", pipeline.handle);
	bot.on("edited_channel_post", pipeline.handle);
}
//#endregion
//#region extensions/telegram/src/bot-handlers.message-context.ts
function legacyAssistantTextKey(node, botUserId) {
	if (node.promptContextProjectionMarker) return;
	const timestamp = node.sourceMessage.openclaw_prompt_context_timestamp_ms;
	const legacySelf = isTelegramMessageFromCurrentBot(node.sourceMessage, botUserId) || node.sourceMessage.from?.id === 0 && node.sourceMessage.from.is_bot;
	const body = stripInlineDirectiveTagsForDelivery(node.body ?? "").text.trim();
	return legacySelf && typeof timestamp === "number" && body ? `text:${timestamp}:${body}` : void 0;
}
const normalizePromptContextMinTimestampMs = (timestampMs) => asFiniteNumber(timestampMs);
function promptContextBoundaryOptions(timestampMs, ambientWatermark) {
	const promptContextMinTimestampMs = normalizePromptContextMinTimestampMs(timestampMs);
	return {
		...promptContextMinTimestampMs === void 0 ? {} : { promptContextMinTimestampMs },
		...ambientWatermark === void 0 ? {} : { promptContextAmbientWatermark: ambientWatermark }
	};
}
function latestPromptContextMinTimestampMs(...timestamps) {
	let latest;
	for (const timestampMs of timestamps) {
		const normalized = normalizePromptContextMinTimestampMs(timestampMs);
		if (normalized !== void 0) latest = latest === void 0 ? normalized : Math.max(latest, normalized);
	}
	return latest;
}
const latestPromptContextAmbientWatermark = (...watermarks) => watermarks.findLast((watermark) => watermark !== void 0);
function buildSyntheticTextMessage(params) {
	return {
		...params.base,
		...params.from ? { from: params.from } : {},
		text: params.text,
		caption: void 0,
		caption_entities: void 0,
		entities: params.entities?.length ? params.entities : void 0,
		...params.date != null ? { date: params.date } : {}
	};
}
const buildSyntheticContext = (ctx, message) => ({
	message,
	update: ctx.update,
	me: ctx.me,
	getFile: ctx.getFile.bind(ctx)
});
function formatTelegramAmbientTranscriptBody(messages) {
	const lines = messages.map((msg) => {
		const text = getTelegramTextParts(msg).text.trim();
		const media = resolveTelegramPrimaryMedia(msg);
		const body = text || formatMediaPlaceholderText(media ? [{ kind: media.kind }] : [{}]);
		const prefix = [msg.message_id ? `#${msg.message_id}` : void 0, buildSenderName(msg)].filter(Boolean).join(" ");
		return prefix ? `${prefix}: ${body}` : body;
	});
	return lines.length > 0 ? lines.join("\n") : void 0;
}
function createTelegramMessageSessionRuntime({ accountId, resolveTelegramGroupConfig, telegramDeps }) {
	const loadSessionEntry = telegramDeps.getSessionEntry ?? getSessionEntry;
	const resolveTelegramSessionState = (params) => {
		const dmThreadId = params.threadSpec.scope === "dm" ? params.threadSpec.id : void 0;
		const topicThreadId = params.threadSpec.id;
		const { topicConfig } = resolveTelegramGroupConfig(params.chatId, topicThreadId, params.runtimeCfg);
		const { route } = resolveTelegramConversationRoute({
			cfg: params.runtimeCfg,
			accountId,
			chatId: params.chatId,
			isGroup: params.isGroup,
			threadSpec: params.threadSpec,
			senderId: params.senderId,
			topicAgentId: topicConfig?.agentId
		});
		const sessionKey = resolveTelegramTargetSession({
			cfg: params.runtimeCfg,
			route,
			chatId: params.chatId,
			isGroup: params.isGroup,
			senderId: params.senderId,
			dmThreadId,
			botHasTopicsEnabled: params.botHasTopicsEnabled
		});
		const storePath = telegramDeps.resolveStorePath(params.runtimeCfg.session?.store, { agentId: route.agentId });
		const entry = loadSessionEntry({
			storePath,
			sessionKey
		});
		const storedOverride = resolveStoredModelOverride({
			sessionEntry: entry,
			loadSessionEntry: (parentSessionKey) => loadSessionEntry({
				storePath,
				sessionKey: parentSessionKey
			}),
			sessionKey,
			defaultProvider: resolveDefaultModelForAgent({
				cfg: params.runtimeCfg,
				agentId: route.agentId
			}).provider
		});
		if (storedOverride) return {
			agentId: route.agentId,
			sessionEntry: entry,
			sessionKey,
			storePath,
			model: storedOverride.provider ? `${storedOverride.provider}/${storedOverride.model}` : storedOverride.model
		};
		const provider = entry?.modelProvider?.trim();
		const model = entry?.model?.trim();
		if (provider && model) return {
			agentId: route.agentId,
			sessionEntry: entry,
			sessionKey,
			storePath,
			model: `${provider}/${model}`
		};
		const modelCfg = params.runtimeCfg.agents?.defaults?.model;
		return {
			agentId: route.agentId,
			sessionEntry: entry,
			sessionKey,
			storePath,
			model: typeof modelCfg === "string" ? modelCfg : modelCfg?.primary
		};
	};
	const resolvePromptContextAmbientWatermark = (params) => {
		if (!params.isGroup) return;
		const key = (telegramDeps.resolveAmbientTranscriptWatermarkKey ?? resolveAmbientTranscriptWatermarkKey)({
			channel: "telegram",
			accountId,
			conversationId: String(params.chatId),
			...params.resolvedThreadId !== void 0 ? { threadId: params.resolvedThreadId } : {}
		});
		return (telegramDeps.readAmbientTranscriptWatermark ?? readAmbientTranscriptWatermark)({
			storePath: params.storePath,
			sessionKey: params.sessionKey,
			key
		});
	};
	return {
		resolveTelegramSessionState,
		resolvePromptContextAmbientWatermark
	};
}
function createTelegramMessageContextRuntime({ cfg, accountId, ownerAgentId, opts, telegramCfg, telegramDeps }) {
	const messageCache = createTelegramMessageCache({ scope: resolveTelegramMessageCacheScope(telegramDeps.resolveStorePath(cfg.session?.store, { agentId: ownerAgentId })) });
	const resolvePromptSender = (node, ctx) => {
		const botInfo = ctx.me ?? opts.botInfo;
		if (botInfo?.id != null && (node.senderId === String(botInfo.id) || node.sourceMessage.sender_business_bot?.id === botInfo.id)) return buildTelegramSelfSenderName(telegramCfg.name, botInfo);
		if (node.senderId === "0" && node.sourceMessage.from?.is_bot === true) return node.sender;
		return isTelegramSelfSenderName(node.sender) ? `${node.sender} (Telegram sender)` : node.sender;
	};
	const recordMessageForReplyChain = (msg, providerObservedThread, botUserId) => messageCache.record({
		accountId,
		chatId: msg.chat.id,
		msg,
		...botUserId !== void 0 ? { botUserId } : {},
		...providerObservedThread ? { providerObservedThread } : {},
		...providerObservedThread?.id != null ? { threadId: providerObservedThread.id } : {}
	});
	const recordMessageResolvedMedia = (params) => messageCache.recordResolvedMedia({
		accountId,
		chatId: params.msg.chat.id,
		messageId: String(params.msg.message_id),
		media: params.media,
		...params.botUserId !== void 0 ? { botUserId: params.botUserId } : {}
	});
	const recordReplyMessageResolvedMedia = async (params) => {
		if (!await messageCache.get({
			accountId,
			chatId: params.chatId,
			messageId: params.messageId
		})) return;
		await messageCache.recordResolvedMedia({
			accountId,
			chatId: params.chatId,
			messageId: params.messageId,
			media: params.media,
			...params.botUserId !== void 0 ? { botUserId: params.botUserId } : {}
		});
	};
	const resolveCachedMessageThreadSpec = async (params) => {
		const node = await messageCache.get({
			accountId,
			chatId: params.chatId,
			messageId: String(params.messageId)
		});
		return resolveProviderObservedTelegramThreadSpec(node);
	};
	const buildReplyChainForMessage = (msg) => buildTelegramReplyChain({
		cache: messageCache,
		accountId,
		chatId: msg.chat.id,
		msg
	});
	const toReplyChainEntry = (node, ctx, media) => {
		const { sourceMessage: _sourceMessage, resolvedMedia: _resolvedMedia, promptContextProjectionMarker: _promptContextProjectionMarker, threadBinding: _threadBinding, ...entry } = node;
		const projectedEntry = {
			...entry,
			sender: resolvePromptSender(node, ctx)
		};
		if (!media?.path) return projectedEntry;
		const { mediaRef: _mediaRef, ...entryWithoutProviderMediaRef } = projectedEntry;
		return {
			...entryWithoutProviderMediaRef,
			mediaPath: media.path,
			mediaKind: media.kind,
			...media.contentType ? { mediaType: media.contentType } : {}
		};
	};
	const toPromptContextMessage = (node, ctx, flags, media) => ({
		message_id: node.messageId,
		thread_id: node.threadId,
		sender: resolvePromptSender(node, ctx),
		sender_id: node.senderId,
		sender_username: node.senderUsername,
		timestamp_ms: node.timestamp,
		body: node.body,
		media_type: media?.contentType ?? media?.kind ?? node.mediaType,
		media_path: media?.path,
		media_ref: media?.path ? void 0 : node.mediaRef,
		reply_to_id: node.replyToId,
		is_reply_target: flags?.replyTarget === true ? true : void 0
	});
	const buildPromptContextForMessage = async (ctx, msg, replyChainNodes, runtimeCfg, runtimeTelegramCfg, options, mediaByMessageId, selectedMessageIds) => {
		const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
		const groupHistoryLimit = Math.max(0, runtimeTelegramCfg.historyLimit ?? runtimeCfg.messages?.groupChat?.historyLimit ?? 50);
		const dmHistoryLimit = resolveTelegramDmHistoryLimit({
			config: runtimeTelegramCfg,
			senderId: msg.from?.id
		});
		const messageId = typeof msg.message_id === "number" ? String(msg.message_id) : void 0;
		const currentNode = await messageCache.get({
			accountId,
			chatId: msg.chat.id,
			messageId
		});
		const threadId = currentNode?.threadId ? Number(currentNode.threadId) : void 0;
		const conversationContext = isGroup && groupHistoryLimit <= 0 ? [] : await buildTelegramConversationContext({
			cache: messageCache,
			messageId,
			accountId,
			chatId: msg.chat.id,
			...Number.isFinite(threadId) ? { threadId } : {},
			replyChainNodes,
			recentLimit: isGroup ? groupHistoryLimit : dmHistoryLimit,
			replyTargetWindowSize: isGroup || dmHistoryLimit > 0 ? 2 : 0,
			...options?.promptContextMinTimestampMs !== void 0 ? { minTimestampMs: options.promptContextMinTimestampMs } : {},
			...isGroup && options?.promptContextAmbientWatermark !== void 0 ? { includeNode: (node, flags) => flags?.replyTarget === true || isTelegramHistoryEntryAfterAmbientWatermark(node, options.promptContextAmbientWatermark) } : {}
		});
		const conversationContextById = new Map(conversationContext.flatMap((entry) => entry.node.messageId ? [[entry.node.messageId, entry]] : []));
		for (const [selectedMessageId, selection] of selectedMessageIds ?? []) {
			if (selection === "exclude") {
				conversationContextById.delete(selectedMessageId);
				continue;
			}
			if (selectedMessageId === messageId || conversationContextById.has(selectedMessageId)) continue;
			const node = await messageCache.get({
				accountId,
				chatId: msg.chat.id,
				messageId: selectedMessageId
			});
			if (node?.messageId) conversationContextById.set(node.messageId, { node });
		}
		const cacheEntries = Array.from(conversationContextById.values()).map((entry) => ({
			node: entry.node,
			message: toPromptContextMessage(entry.node, ctx, { replyTarget: entry.isReplyTarget }, entry.node.messageId ? mediaByMessageId?.get(entry.node.messageId) : void 0)
		}));
		const completeProjectionIds = resolveCompleteTelegramPromptContextProjectionIds(cacheEntries.map((entry) => entry.node.promptContextProjectionMarker));
		const legacyAssistantTextKeys = cacheEntries.flatMap(({ node }) => {
			const key = legacyAssistantTextKey(node, ctx.me?.id ?? opts.botInfo?.id);
			return key ? [key] : [];
		});
		const messages = cacheEntries.map((entry) => entry.message);
		return messages.length > 0 ? [{
			label: "Conversation context",
			source: "telegram",
			type: "chat_window",
			...completeProjectionIds.size > 0 ? { sessionTranscriptDedupeMessageIds: [...completeProjectionIds] } : {},
			...legacyAssistantTextKeys.length > 0 ? { sessionTranscriptAssistantTextDedupeKeys: legacyAssistantTextKeys } : {},
			payload: {
				order: "chronological",
				relation: "selected_for_current_message",
				messages
			}
		}] : [];
	};
	return {
		recordMessageForReplyChain,
		recordMessageResolvedMedia,
		recordReplyMessageResolvedMedia,
		resolveCachedMessageThreadSpec,
		buildReplyChainForMessage,
		toReplyChainEntry,
		buildPromptContextForMessage
	};
}
//#endregion
//#region extensions/telegram/src/message-dispatch-dedupe.ts
const TELEGRAM_MESSAGE_DISPATCH_DEDUPE_TTL_MS = 6048e5;
const TELEGRAM_MESSAGE_DISPATCH_DEDUPE_NAMESPACE = "global";
const TELEGRAM_MESSAGE_DISPATCH_DEDUPE_NAMESPACE_PREFIX = "telegram.message-dispatch-dedupe";
const TELEGRAM_MESSAGE_DISPATCH_DEDUPE_STATE_PLUGIN_ID = "telegram-message-dispatch-dedupe";
const TELEGRAM_MESSAGE_DISPATCH_DEDUPE_MEMORY_MAX_ENTRIES = 5e4;
const TELEGRAM_MESSAGE_DISPATCH_DEDUPE_STATE_MAX_ENTRIES = 5e4;
var TelegramMessageDispatchReplayForgetError = class extends Error {
	constructor(failures) {
		const count = failures.length;
		super(`telegram message dispatch dedupe rollback failed for ${count} key(s)`, { cause: failures.find((failure) => failure.error !== void 0)?.error });
		this.name = "TelegramMessageDispatchReplayForgetError";
		this.failures = [...failures];
		this.cause = failures.find((failure) => failure.error !== void 0)?.error;
	}
};
function isTelegramMessageDispatchReplayForgetError(error) {
	return error instanceof TelegramMessageDispatchReplayForgetError;
}
function buildTelegramMessageDispatchStoredReplayKey(params) {
	const chatId = params.msg.chat?.id;
	const messageId = params.msg.message_id;
	if (chatId == null || typeof messageId !== "number" || messageId <= 0) return null;
	return JSON.stringify([
		"account",
		params.accountId,
		"bot",
		String(params.botUserId),
		"message",
		String(chatId),
		messageId
	]);
}
function createTelegramMessageDispatchReplayGuard(params = {}) {
	return createChannelReplayGuard({
		dedupe: {
			ttlMs: TELEGRAM_MESSAGE_DISPATCH_DEDUPE_TTL_MS,
			memoryMaxSize: TELEGRAM_MESSAGE_DISPATCH_DEDUPE_MEMORY_MAX_ENTRIES,
			pluginId: TELEGRAM_MESSAGE_DISPATCH_DEDUPE_STATE_PLUGIN_ID,
			namespacePrefix: TELEGRAM_MESSAGE_DISPATCH_DEDUPE_NAMESPACE_PREFIX,
			stateMaxEntries: TELEGRAM_MESSAGE_DISPATCH_DEDUPE_STATE_MAX_ENTRIES,
			...params.onDiskError ? { onDiskError: params.onDiskError } : {}
		},
		buildReplayKey: (event) => "msg" in event ? buildTelegramMessageDispatchStoredReplayKey(event) : event.keys ?? [],
		namespace: () => TELEGRAM_MESSAGE_DISPATCH_DEDUPE_NAMESPACE
	});
}
async function claimTelegramMessageDispatchReplay(params) {
	return await runClaimableDedupeClaimLoop(() => params.guard.claim({
		accountId: params.accountId,
		botUserId: params.botUserId,
		msg: params.msg
	}), (_error, rejectionCount) => rejectionCount <= 1);
}
async function commitTelegramMessageDispatchReplay(params) {
	const claims = [...new Set(params.claims ?? [])];
	const committedKeys = [];
	for (const [index, claim] of claims.entries()) {
		let diskError;
		try {
			const recorded = await claim.commit(params.requirePersistent === true ? { onDiskError: (error) => {
				diskError = error;
			} } : void 0);
			if (params.requirePersistent === true && diskError !== void 0) throw diskError instanceof Error ? diskError : new Error(formatErrorMessage(diskError), { cause: diskError });
			if (recorded) committedKeys.push(...claim.keys);
		} catch (error) {
			for (const pendingClaim of claims.slice(index + 1)) pendingClaim.release({ error });
			const failures = [];
			for (const committedKey of committedKeys) try {
				if (!await params.guard.forget({ keys: [committedKey] })) failures.push({ key: committedKey });
			} catch (rollbackError) {
				failures.push({
					key: committedKey,
					error: rollbackError
				});
			}
			let failedKeyCleanupError;
			try {
				await params.guard.forget({ keys: claim.keys }, { onDiskError: (rollbackError) => {
					failedKeyCleanupError = rollbackError;
				} });
			} catch (rollbackError) {
				failedKeyCleanupError = rollbackError;
			}
			if (failedKeyCleanupError !== void 0) failures.push(...claim.keys.map((key) => ({
				key,
				error: failedKeyCleanupError
			})));
			if (failures.length > 0) throw new TelegramMessageDispatchReplayForgetError(failures);
			throw error;
		}
	}
}
function releaseTelegramMessageDispatchReplay(params) {
	for (const claim of new Set(params.claims ?? [])) claim.release({ error: params.error });
}
//#endregion
//#region extensions/telegram/src/bot-handlers.message-pipeline.ts
const HOUR_MS = 36e5;
function resolveRetainedTelegramMedia(params) {
	const media = params.media;
	if (!media || media.size > params.maxBytes) return;
	if (params.ttlHours !== void 0 && media.savedAt + params.ttlHours * HOUR_MS <= Date.now()) return;
	const path = resolveTelegramInboundMediaUri(media.id);
	const fileName = params.sourceMessage.document?.file_name ?? params.sourceMessage.audio?.file_name ?? params.sourceMessage.video?.file_name ?? params.sourceMessage.animation?.file_name;
	return path ? {
		path,
		kind: media.kind,
		...media.contentType ? { contentType: media.contentType } : {},
		...fileName ? { fileName } : {},
		...media.stickerMetadata ? { stickerMetadata: media.stickerMetadata } : {}
	} : void 0;
}
function createTelegramMessagePipeline({ cfg, accountId, ownerAgentId, bot, opts, telegramTransport, runtime, mediaMaxBytes, telegramCfg, resolveTelegramGroupConfig, processMessage, logger, telegramDeps }) {
	const { token } = opts;
	const mediaRuntimeOptions = resolveTelegramMediaRuntimeOptions({
		cfg,
		accountId,
		token,
		transport: telegramTransport
	});
	const resolveMediaRuntime = (...explicitSignals) => {
		const abortSignals = [
			opts.mediaAbortSignal,
			opts.fetchAbortSignal,
			getTelegramSpooledReplayLifecycle()?.abortSignal,
			...explicitSignals
		].filter((signal) => signal !== void 0);
		return {
			...mediaRuntimeOptions,
			abortSignal: abortSignals.length > 1 ? AbortSignal.any(abortSignals) : abortSignals[0]
		};
	};
	const { resolveTelegramSessionState, resolvePromptContextAmbientWatermark } = createTelegramMessageSessionRuntime({
		accountId,
		resolveTelegramGroupConfig,
		telegramDeps
	});
	const { recordMessageForReplyChain, recordMessageResolvedMedia, recordReplyMessageResolvedMedia, resolveCachedMessageThreadSpec, buildReplyChainForMessage, toReplyChainEntry, buildPromptContextForMessage } = createTelegramMessageContextRuntime({
		cfg,
		accountId,
		ownerAgentId,
		opts,
		telegramCfg,
		telegramDeps
	});
	const replayGuard = createTelegramMessageDispatchReplayGuard({ onDiskError: (error) => {
		runtime.error?.(danger(`[telegram] message dispatch dedupe store failed: ${String(error)}`));
	} });
	const mergeDispatchDedupeClaims = (...groups) => [...new Set(groups.flatMap((group) => group ?? []))];
	const releaseDispatchDedupeClaims = (claims, error) => {
		releaseTelegramMessageDispatchReplay({
			claims,
			error
		});
	};
	const commitDispatchDedupeClaims = async (claims, options = {}) => {
		await commitTelegramMessageDispatchReplay({
			guard: replayGuard,
			claims,
			...options
		});
	};
	const buildFailedProcessingResult = (error) => ({
		kind: "failed-retryable",
		error
	});
	const settleSpooledReplayParticipants = (participants, result) => {
		for (const participant of new Set(participants)) participant.settle(result);
	};
	const beginSpooledReplaySettlementHolds = (participants) => {
		const holds = [];
		for (const participant of new Set(participants)) {
			const hold = participant.beginSettlementHold();
			if (!hold) {
				for (const acquired of holds) acquired.release("replay-pending");
				const reason = participant.abortSignal.reason;
				throw reason instanceof Error ? reason : /* @__PURE__ */ new Error(`telegram spooled replay participant ${participant.key} settled before durable adoption`);
			}
			holds.push(hold);
		}
		return (mode) => {
			for (const hold of holds) hold.release(mode);
		};
	};
	const createSpooledReplayParticipantForBufferedWork = (key) => createTelegramSpooledReplayDeferredParticipant(key) ?? void 0;
	const spooledReplayOptions = (participants) => participants.length > 0 ? { spooledReplay: true } : {};
	const claimMessageDispatchDedupe = async (msg, botUserId) => {
		const claim = await claimTelegramMessageDispatchReplay({
			guard: replayGuard,
			accountId,
			botUserId,
			msg
		});
		if (claim.kind === "duplicate") {
			logVerbose(`telegram dispatch dedupe: skipped message ${msg.chat.id}:${msg.message_id}`);
			return { process: false };
		}
		return {
			process: true,
			claims: claim.kind === "claimed" ? [claim.handle] : []
		};
	};
	const resolveReplyMediaForChain = async (ctx, chain, shouldHydrateMedia, durableMediaReplay, ...participantSignals) => {
		const mediaRuntime = resolveMediaRuntime(...participantSignals);
		const replyMedia = [];
		const replyChain = [];
		for (const [index, node] of chain.entries()) {
			let mediaRef;
			const replyFileId = resolveInboundMediaFileId(node.sourceMessage);
			if (replyFileId && hasInboundMedia(node.sourceMessage) && await shouldHydrateMedia(node, index)) try {
				mediaRuntime.abortSignal?.throwIfAborted();
				mediaRef = resolveRetainedTelegramMedia({
					media: node.resolvedMedia,
					sourceMessage: node.sourceMessage,
					maxBytes: mediaMaxBytes,
					ttlHours: cfg.attachments?.ttlHours
				});
				if (!mediaRef) {
					const media = await resolveMedia({
						ctx: {
							message: node.sourceMessage,
							me: ctx.me,
							getFile: async (signal) => await bot.api.getFile(replyFileId, signal)
						},
						maxBytes: mediaMaxBytes,
						...mediaRuntime
					});
					if (media) {
						mediaRef = {
							path: media.path,
							kind: media.kind,
							...media.contentType ? { contentType: media.contentType } : {},
							...media.fileName ? { fileName: media.fileName } : {},
							...media.stickerMetadata ? { stickerMetadata: media.stickerMetadata } : {}
						};
						await recordReplyMessageResolvedMedia({
							chatId: ctx.message.chat.id,
							messageId: node.messageId,
							media,
							botUserId: ctx.me?.id
						});
					}
				}
			} catch (err) {
				if (mediaRuntime.abortSignal?.aborted && durableMediaReplay) {
					recordTelegramMessageProcessingResult({
						kind: "failed-retryable",
						error: err
					});
					throw err;
				}
				logger.warn({
					chatId: ctx.message.chat.id,
					error: String(err)
				}, "reply media fetch failed");
			}
			if (mediaRef) replyMedia.push(mediaRef);
			replyChain.push(toReplyChainEntry(node, ctx, mediaRef));
		}
		return {
			replyMedia,
			replyChain
		};
	};
	const processMessageWithReplyChain = async (params) => {
		let dispatchDedupeCommitted = false;
		let spooledReplayFinalResult;
		let spooledReplayFinalization;
		const durableMediaReplay = isTelegramSpooledReplayUpdate(params.ctx.update) || Boolean(params.spooledReplayParticipants?.length);
		const spooledReplay = params.options?.spooledReplay === true || durableMediaReplay;
		const explicitParticipants = params.spooledReplayParticipants ?? [];
		const frameParticipant = spooledReplay && explicitParticipants.length === 0 && params.options?.isolateSpooledReplaySettlement !== true ? getTelegramSpooledReplayDeferredParticipant() ?? createTelegramSpooledReplayDeferredParticipant(`message:${params.msg.chat.id}:${params.msg.message_id}`) ?? void 0 : void 0;
		const ingressSpooledReplayParticipants = [...explicitParticipants, ...frameParticipant ? [frameParticipant] : []];
		const processingParticipant = explicitParticipants.length > 0 ? createTelegramSpooledReplayParticipant(`message-processing:${params.msg.chat.id}:${params.msg.message_id}`) : frameParticipant;
		if (processingParticipant && explicitParticipants.length > 0) for (const participant of explicitParticipants) participant.task.then((result) => {
			processingParticipant.settle(result);
		});
		const spooledReplayParticipants = [.../* @__PURE__ */ new Set([...ingressSpooledReplayParticipants, ...processingParticipant ? [processingParticipant] : []])];
		const finalizeSpooledReplayResult = async (result) => {
			if (spooledReplayFinalResult) return spooledReplayFinalResult;
			if (spooledReplayFinalization) return await spooledReplayFinalization;
			const finalization = (async () => {
				const finalized = result;
				if (result.kind === "completed") {
					const releaseSettlementHolds = beginSpooledReplaySettlementHolds(ingressSpooledReplayParticipants);
					try {
						await commitDispatchDedupeClaims(params.dispatchDedupeClaims ?? [], { requirePersistent: true });
					} catch (error) {
						releaseSettlementHolds("replay-pending");
						throw error;
					}
					releaseSettlementHolds("discard-pending");
					dispatchDedupeCommitted = true;
				} else releaseDispatchDedupeClaims(params.dispatchDedupeClaims ?? [], result.kind === "failed-retryable" ? result.error : void 0);
				spooledReplayFinalResult = finalized;
				settleSpooledReplayParticipants(spooledReplayParticipants, finalized);
				return finalized;
			})();
			spooledReplayFinalization = finalization;
			try {
				return await finalization;
			} finally {
				if (!spooledReplayFinalResult && spooledReplayFinalization === finalization) spooledReplayFinalization = void 0;
			}
		};
		try {
			const runtimeCfg = telegramDeps.getRuntimeConfig();
			const runtimeTelegramCfg = resolveTelegramAccount({
				cfg: runtimeCfg,
				accountId
			}).config;
			const replyChainNodes = await buildReplyChainForMessage(params.msg);
			const isGroupConversation = params.msg.chat.type === "group" || params.msg.chat.type === "supergroup";
			const scopedThreadId = resolveTelegramMessageThreadSpec(params.msg).id;
			const { groupConfig, topicConfig } = resolveTelegramScopedGroupConfig(runtimeTelegramCfg, params.msg.chat.id, scopedThreadId);
			const configuredGroupAllowFrom = firstDefined(topicConfig?.allowFrom, groupConfig?.allowFrom) ?? opts.groupAllowFrom ?? runtimeTelegramCfg.groupAllowFrom ?? runtimeTelegramCfg.allowFrom ?? opts.allowFrom;
			const contextVisibilityMode = resolveChannelContextVisibilityMode({
				cfg: runtimeCfg,
				channel: "telegram",
				accountId
			});
			const shouldHydrateReplyMedia = async (node, index) => {
				if (!isGroupConversation) return true;
				const expandedAllowFrom = await expandTelegramAllowFromWithAccessGroups({
					cfg: runtimeCfg,
					allowFrom: configuredGroupAllowFrom,
					accountId,
					senderId: node.senderId
				});
				const effectiveAllow = normalizeAllowFrom(expandedAllowFrom);
				const senderAllowed = effectiveAllow.hasEntries ? isSenderAllowed({
					allow: effectiveAllow,
					senderId: node.senderId,
					senderUsername: node.senderUsername
				}) : true;
				return evaluateSupplementalContextVisibility({
					mode: contextVisibilityMode,
					kind: index === 0 ? "quote" : "thread",
					senderAllowed
				}).include;
			};
			const { replyMedia, replyChain } = await resolveReplyMediaForChain(params.ctx, replyChainNodes, shouldHydrateReplyMedia, durableMediaReplay, ...spooledReplayParticipants.map((participant) => participant.abortSignal), ...params.spooledReplayAbortSignal ? [params.spooledReplayAbortSignal] : []);
			const promptContextMediaByMessageId = /* @__PURE__ */ new Map();
			const currentMessageId = typeof params.msg.message_id === "number" ? String(params.msg.message_id) : void 0;
			for (const [index, media] of params.allMedia.entries()) {
				const messageId = media.sourceMessageId ?? (index === 0 ? currentMessageId : void 0);
				const promptMediaPath = media.path ? resolveTelegramPromptMediaPath(media.path) : void 0;
				if (messageId && promptMediaPath) promptContextMediaByMessageId.set(messageId, {
					...media,
					path: promptMediaPath
				});
			}
			for (const entry of replyChain) {
				const promptMediaPath = entry.mediaPath ? resolveTelegramPromptMediaPath(entry.mediaPath) : void 0;
				const inferredKind = kindFromMime(entry.mediaType);
				const mediaKind = entry.mediaKind ?? (inferredKind && inferredKind !== "unknown" ? inferredKind : "document");
				if (entry.messageId && entry.mediaPath && promptMediaPath) promptContextMediaByMessageId.set(entry.messageId, {
					path: promptMediaPath,
					kind: mediaKind,
					...entry.mediaType ? { contentType: entry.mediaType } : {}
				});
			}
			const promptContext = await buildPromptContextForMessage(params.ctx, params.msg, replyChainNodes, runtimeCfg, runtimeTelegramCfg, params.options, promptContextMediaByMessageId, params.promptContextMessageSelection);
			const result = await processMessage({
				ctx: params.ctx,
				allMedia: params.allMedia,
				storeAllowFrom: params.storeAllowFrom,
				turnContext: {
					cfg: runtimeCfg,
					telegramCfg: runtimeTelegramCfg,
					onDispatchStart: async () => {
						await commitDispatchDedupeClaims(params.dispatchDedupeClaims ?? []);
						dispatchDedupeCommitted = true;
					},
					spooledReplayAbortSignal: params.spooledReplayAbortSignal,
					spooledReplayParticipant: processingParticipant,
					finalizeSpooledReplayResult: async (processingResult) => await finalizeSpooledReplayResult(processingResult),
					completeSpooledReplayAfterIrrevocableAdoption: async () => {
						return await finalizeSpooledReplayResult({ kind: "completed" });
					}
				},
				options: params.options,
				replyMedia,
				replyChain,
				promptContext
			});
			if (spooledReplay) return await finalizeSpooledReplayResult(result);
			if (result.kind === "completed" && !dispatchDedupeCommitted) await commitDispatchDedupeClaims(params.dispatchDedupeClaims ?? []);
			else if (result.kind !== "completed" && !dispatchDedupeCommitted) releaseDispatchDedupeClaims(params.dispatchDedupeClaims ?? []);
			return result;
		} catch (err) {
			if (spooledReplay) return await finalizeSpooledReplayResult(buildFailedProcessingResult(err));
			if (!dispatchDedupeCommitted) releaseDispatchDedupeClaims(params.dispatchDedupeClaims ?? [], err);
			throw err;
		}
	};
	return {
		resolveMediaRuntime,
		normalizePromptContextMinTimestampMs,
		promptContextBoundaryOptions,
		latestPromptContextMinTimestampMs,
		latestPromptContextAmbientWatermark,
		mergeDispatchDedupeClaims,
		releaseDispatchDedupeClaims,
		buildFailedProcessingResult,
		settleSpooledReplayParticipants,
		createSpooledReplayParticipantForBufferedWork,
		spooledReplayOptions,
		claimMessageDispatchDedupe,
		buildSyntheticTextMessage,
		buildSyntheticContext,
		formatTelegramAmbientTranscriptBody,
		resolveTelegramSessionState,
		resolvePromptContextAmbientWatermark,
		recordMessageForReplyChain,
		recordMessageResolvedMedia,
		resolveCachedMessageThreadSpec,
		processMessageWithReplyChain
	};
}
//#endregion
// v-telegram-inter-session-bridge-v1: bridge
// Telegram channel inbound bridge for sessions_send (docs/inter-session/design.md §2.a, §3.7).
const V_TELEGRAM_INTER_SESSION_BRIDGES = "openclaw.v.interSessionInboundBridges";
const V_TELEGRAM_INTER_SESSION_CAPS = Object.freeze({ streaming: true, replyAnchor: true, idempotentPost: false, editPost: false, maxVisibleChars: 3500, askUser: true, media: true });
const V_TELEGRAM_INTER_SESSION_BUSY_REASONS = ["active_run", "pending_queue", "recovery_owner"];
const V_TELEGRAM_INTER_SESSION_RESTART_WEDGE_RE = /restart recovery claim changed/u;
const V_TELEGRAM_INTER_SESSION_MESSAGE_MAX = 4096;
const V_TELEGRAM_INTER_SESSION_CHAT_TTL_MS = 600000;
const vTelegramInterSessionByBot = /* @__PURE__ */ new WeakMap();
function vTelegramInterSessionRegistry() {
	const key = Symbol.for(V_TELEGRAM_INTER_SESSION_BRIDGES);
	globalThis[key] ??= { v: 1, bridges: new Map(), listeners: new Set() };
	return globalThis[key];
}
function vTelegramInterSessionNotify(reg, key, bridge) {
	for (const listener of [...reg.listeners]) try {
		listener(key, bridge);
	} catch {}
}
function vTelegramBridgeError(code, message, transient) {
	const error = new Error(message);
	error.name = "BridgeError";
	error.code = code;
	error.transient = transient === true;
	return error;
}
/** A grammY GrammyError (error_code, description) or HttpError (no error_code) as a BridgeError (§2.a). */
function vTelegramBridgeErrorFrom(err) {
	const status = typeof err?.error_code === "number" ? err.error_code : void 0;
	const description = String(err?.description ?? err?.message ?? err);
	if (status === void 0) return vTelegramBridgeError("CHANNEL_DOWN", "Telegram unreachable: " + description, true);
	if (status === 429 || status >= 500) return vTelegramBridgeError("CHANNEL_DOWN", "Telegram " + status + ": " + description, true);
	if (status === 403) return vTelegramBridgeError("NOT_MEMBER", "Telegram 403: " + description, false);
	if (/chat not found|peer_id_invalid|group chat was (?:deleted|upgraded)|chat was deactivated/iu.test(description)) return vTelegramBridgeError("CHAT_GONE", "Telegram " + status + ": " + description, false);
	return vTelegramBridgeError("POST_FAILED", "Telegram " + status + ": " + description, false);
}
/** Clip to Telegram's per-message limit without splitting a surrogate pair. */
function vTelegramInterSessionClip(text) {
	if (text.length <= V_TELEGRAM_INTER_SESSION_MESSAGE_MAX) return text;
	let end = V_TELEGRAM_INTER_SESSION_MESSAGE_MAX - 1;
	const code = text.charCodeAt(end - 1);
	if (code >= 55296 && code <= 56319) end -= 1;
	return text.slice(0, end) + "…";
}
/** A chat from a stored delivery target: "telegram:<chat>", "telegram:<chat>:topic:<n>" or a bare id. */
function vTelegramTargetFromDelivery(to, threadId) {
	const m = /^(?:(?:telegram|tg):)?(-?\d+)(?::topic:(\d+))?$/iu.exec(String(to ?? "").trim());
	if (!m) return void 0;
	const thread = m[2] ?? (threadId != null && /^\d+$/u.test(String(threadId)) ? String(threadId) : void 0);
	return { chatId: m[1], ...thread ? { threadId: thread } : {} };
}
/** A chat from a session key: "agent:<a>:telegram[:<account>]:(direct|group):<id>[:topic:<n>]" (§2.a). */
function vTelegramTargetFromSessionKey(sessionKey) {
	const m = /:telegram:(?:[a-z0-9_-]+:)?(?:direct|group):(-?\d+)(?::topic:(\d+))?$/u.exec(String(sessionKey ?? ""));
	return m ? { chatId: m[1], ...m[2] ? { threadId: m[2] } : {} } : void 0;
}
/**
* The turn record a synthetic message carries in update.vInterSession; the dispatch chunk reports
* into it. outcome settles once: started (onAgentRunStart), busy (onBusy) or rejected (the handler
* returned without either); done settles once a started turn's handler returns.
*/
function vCreateTelegramInterSessionTurn(req) {
	let settleOutcome;
	const outcome = new Promise((resolve) => {
		settleOutcome = resolve;
	});
	let resolveDone;
	const done = new Promise((resolve) => {
		resolveDone = resolve;
	});
	let outcomeSettled = false;
	let doneSettled = false;
	const settle = (value) => {
		if (outcomeSettled) return;
		outcomeSettled = true;
		settleOutcome(value);
	};
	const rejected = (code, message) => settle({ status: "rejected", code, message, started: false });
	const errorText = (error) => error == null ? void 0 : String(error?.message ?? error);
	const turn = {
		v: 1,
		req,
		started: false,
		runId: void 0,
		busyReason: void 0,
		rejection: void 0,
		error: void 0,
		end: void 0,
		finals: [],
		vInter: void 0,
		onAgentRunStart(runId) {
			if (turn.started || outcomeSettled) return;
			turn.started = true;
			turn.runId = typeof runId === "string" && runId ? runId : req.runId;
			settle({ status: "started", runId: turn.runId, done });
		},
		onBusy(info) {
			if (turn.started || outcomeSettled) return;
			turn.busyReason = V_TELEGRAM_INTER_SESSION_BUSY_REASONS.includes(info?.reason) ? info.reason : "active_run";
			settle({ status: "busy", reason: turn.busyReason });
		},
		reject(code, message) {
			if (!turn.started && !turn.rejection) turn.rejection = { code, message: String(message ?? code) };
		},
		/** A final reply payload of the turn (deliver kind "final"); ask_user questions and reasoning are not results. */
		captureFinal(payload) {
			if (!turn.started || !payload || payload.channelData?.askUser || payload.isReasoning === true) return;
			const text = typeof payload.text === "string" && payload.text.trim() ? payload.text : void 0;
			const media = [...Array.isArray(payload.mediaUrls) ? payload.mediaUrls : [], ...typeof payload.mediaUrl === "string" ? [payload.mediaUrl] : []].filter((url) => typeof url === "string" && url);
			if (!text && media.length === 0) return;
			turn.finals.push({ ...text ? { text } : {}, ...media.length ? { mediaUrls: [...new Set(media)] } : {} });
		},
		noteNotStarted(error) {
			if (error != null && turn.error == null) turn.error = error;
		},
		noteDispatchEnd(summary) {
			turn.end = summary;
		},
		/** The handler (processMessageWithReplyChain) returned or threw. */
		finish(result, thrown) {
			const message = errorText(thrown) ?? (result?.kind === "failed-retryable" ? errorText(result.error) ?? "telegram processing failed" : void 0) ?? errorText(turn.error);
			if (!turn.started) {
				if (outcomeSettled) return;
				if (turn.rejection) return rejected(turn.rejection.code, turn.rejection.message);
				if (message !== void 0) return rejected(V_TELEGRAM_INTER_SESSION_RESTART_WEDGE_RE.test(message) ? "RESTART_WEDGE" : "INTERNAL", message);
				return rejected("GATED", result?.kind === "skipped" ? "Telegram dropped the synthetic message (access, mention or binding rules)" : "the turn ended without starting a run or reporting busy");
			}
			if (doneSettled) return;
			doneSettled = true;
			const end = turn.end ?? {};
			const failure = message ?? errorText(end.dispatchError) ?? (end.agentRunFailed === true ? "the agent run failed" : void 0);
			resolveDone({
				status: failure === void 0 ? "ok" : "error",
				finals: turn.finals,
				visibleReplySent: end.visibleReplySent === true,
				finalCount: turn.finals.length,
				...failure === void 0 ? {} : { error: failure }
			});
		}
	};
	turn.vInter = {
		exclusive: true,
		id: req.id,
		kind: req.kind,
		onBusy: (info) => turn.onBusy(info)
	};
	return { turn, outcome };
}
/**
* The prompt-context bounds a person's message in this chat gets (handleInboundMessageLike): the
* chat window starts at the session's start (nothing from before a /new) and, in a group, after the
* ambient transcript watermark (nothing the session already has). Without them a turn's prompt
* carries up to historyLimit cached chat messages regardless of resets. Best effort: on any error
* the turn runs unbounded, like the stock synthetic messages (poll answers, button submits).
*/
function vTelegramInterSessionPromptBounds({ message, gate, msg, chatId, isGroup, isForum, self, senderId, log }) {
	try {
		if (typeof message.resolveTelegramSessionState !== "function" || typeof message.promptContextBoundaryOptions !== "function") return {};
		const context = gate?.context ?? {};
		const threadSpec = context.threadSpec ?? resolveTelegramMessageThreadSpec(msg, isForum);
		const sessionState = message.resolveTelegramSessionState({
			chatId,
			isGroup,
			threadSpec,
			botHasTopicsEnabled: resolveTelegramBotHasTopicsEnabled(self),
			senderId,
			runtimeCfg: context.cfg
		});
		const minTimestampMs = message.normalizePromptContextMinTimestampMs(sessionState?.sessionEntry?.sessionStartedAt);
		const watermark = message.resolvePromptContextAmbientWatermark({
			chatId,
			isGroup,
			resolvedThreadId: context.resolvedThreadId,
			sessionKey: sessionState?.sessionKey,
			storePath: sessionState?.storePath
		});
		return message.promptContextBoundaryOptions(minTimestampMs, watermark) ?? {};
	} catch (err) {
		log?.("telegram inter-session: prompt-context bounds unavailable for chat " + chatId + ": " + String(err?.message ?? err));
		return {};
	}
}
/** The InterSessionBridge of one Telegram account (§2.a). */
function vCreateTelegramInterSessionBridge({ accountId, bot, botInfo, message, authorization, normalizeAccountId, log }) {
	const chats = /* @__PURE__ */ new Map();
	const rememberChat = (chat) => {
		if (chat && chat.id != null) chats.set(String(chat.id), { chat, at: Date.now() });
	};
	const cachedChat = (chatId) => {
		const hit = chats.get(String(chatId));
		return hit && Date.now() - hit.at < V_TELEGRAM_INTER_SESSION_CHAT_TTL_MS ? hit.chat : void 0;
	};
	const me = () => {
		try {
			return bot.botInfo ?? botInfo;
		} catch {
			return botInfo;
		}
	};
	const threadParams = (route) => route?.chatType === "group" && /^\d+$/u.test(String(route.threadId ?? "")) ? { message_thread_id: Number(route.threadId) } : {};
	const ownRoute = (route) => route?.channel === "telegram" && normalizeAccountId(route.accountId) === accountId && /^-?\d+$/u.test(String(route.chatId ?? ""));
	const rejected = (code, message) => ({ status: "rejected", code, message, started: false });
	return {
		v: 1,
		channel: "telegram",
		accountId,
		caps: V_TELEGRAM_INTER_SESSION_CAPS,
		async resolveRoute(q) {
			const delivery = q?.delivery && (q.delivery.channel == null || q.delivery.channel === "telegram") ? q.delivery : void 0;
			if (delivery?.accountId && normalizeAccountId(delivery.accountId) !== accountId) return { ok: false, code: "NO_ROUTE", reason: "the session is delivered by Telegram account " + normalizeAccountId(delivery.accountId) + ", not " + accountId };
			const target = (delivery?.to ? vTelegramTargetFromDelivery(delivery.to, delivery.threadId) : void 0) ?? vTelegramTargetFromSessionKey(q?.sessionKey);
			if (!target) return { ok: false, code: "NO_ROUTE", reason: "no Telegram chat id in the session's delivery address or key" };
			const direct = !target.chatId.startsWith("-");
			let chat = cachedChat(target.chatId);
			if (!chat) try {
				chat = await bot.api.getChat(Number(target.chatId));
				rememberChat(chat);
			} catch (err) {
				const failure = vTelegramBridgeErrorFrom(err);
				if (failure.code === "CHAT_GONE" || failure.code === "NOT_MEMBER") return { ok: false, code: failure.code, reason: failure.message };
				log?.("telegram inter-session: getChat " + target.chatId + " failed; routing without it: " + failure.message);
			}
			const owners = (Array.isArray(q?.ownerIds) ? q.ownerIds : []).map((id) => String(id).replace(/^(?:telegram|tg):/iu, "").trim());
			const label = !direct && typeof chat?.title === "string" && chat.title.trim() ? chat.title.trim() : void 0;
			return { ok: true, route: {
				channel: "telegram",
				accountId,
				to: target.chatId,
				chatId: target.chatId,
				chatType: direct ? "direct" : "group",
				...direct ? { peerId: target.chatId } : {},
				humans: direct ? owners.includes(target.chatId) ? "owner_only" : "single_peer" : "shared",
				...label ? { label } : {},
				...!direct && target.threadId ? { threadId: target.threadId } : {}
			} };
		},
		async post(p) {
			const route = p?.route;
			if (!ownRoute(route)) throw vTelegramBridgeError("POST_FAILED", "not a route of Telegram account " + accountId, false);
			const text = vTelegramInterSessionClip(String(p.text ?? ""));
			if (!text.trim()) throw vTelegramBridgeError("POST_FAILED", "nothing to post", false);
			const replyTo = /^\d+$/u.test(String(p.replyToMessageId ?? "")) ? Number(p.replyToMessageId) : void 0;
			let sent;
			try {
				sent = await bot.api.sendMessage(Number(route.chatId), text, {
					...threadParams(route),
					...replyTo === void 0 ? {} : { reply_parameters: {
						message_id: replyTo,
						allow_sending_without_reply: true
					} },
					link_preview_options: { is_disabled: true }
				});
			} catch (err) {
				throw vTelegramBridgeErrorFrom(err);
			}
			rememberChat(sent?.chat);
			return { messageId: sent?.message_id == null ? null : String(sent.message_id) };
		},
		async start(req) {
			const route = req?.route;
			if (!ownRoute(route)) return rejected("ROUTE_MISMATCH", "not a route of Telegram account " + accountId);
			if (typeof req.promptText !== "string" || !req.promptText.trim()) return rejected("INTERNAL", "empty promptText");
			const peer = /^\d+$/u.test(String(req.routePeerId ?? "")) ? Number(req.routePeerId) : void 0;
			if (peer === void 0) return rejected("NO_ROUTE", "no Telegram user to carry the request into chat " + route.chatId);
			const self = me();
			if (self?.id == null) return rejected("CHANNEL_DOWN", "the Telegram bot has not finished starting");
			try {
				const chatId = String(route.chatId);
				const isGroup = route.chatType === "group";
				const name = String(req.sender?.name || "V");
				const chat = cachedChat(chatId) ?? (isGroup ? {
					id: Number(chatId),
					type: chatId.startsWith("-100") ? "supergroup" : "group",
					...typeof route.label === "string" && route.label ? { title: route.label } : {}
				} : {
					id: Number(chatId),
					type: "private",
					first_name: name
				});
				const thread = threadParams(route);
				const anchorId = /^\d+$/u.test(String(req.anchorMessageId ?? "")) ? Number(req.anchorMessageId) : void 0;
				const msg = message.buildSyntheticTextMessage({
					base: {
						...anchorId === void 0 ? {} : { message_id: anchorId },
						date: Math.floor(Date.now() / 1e3),
						chat,
						...thread.message_thread_id === void 0 ? {} : {
							message_thread_id: thread.message_thread_id,
							is_topic_message: true
						}
					},
					from: {
						id: peer,
						is_bot: false,
						first_name: name
					},
					text: req.promptText
				});
				const gate = await authorization.authorizeInboundMessage({
					msg,
					chatId: Number(chatId),
					isGroup,
					isForum: chat.is_forum === true,
					senderId: String(peer),
					senderUsername: "",
					dmAccess: "silent"
				});
				if (!gate?.allowed) return rejected("GATED", "Telegram access rules refused sender " + peer + " in chat " + chatId);
				const bounds = vTelegramInterSessionPromptBounds({ message, gate, msg, chatId: Number(chatId), isGroup, isForum: chat.is_forum === true, self, senderId: String(peer), log });
				const { turn, outcome } = vCreateTelegramInterSessionTurn(req);
				const ctx = {
					message: msg,
					update: { vInterSession: turn },
					me: self,
					getFile: async () => {
						throw new Error("a synthetic inter-session message has no file");
					}
				};
				Promise.resolve().then(() => message.processMessageWithReplyChain({
					ctx,
					msg,
					allMedia: [],
					storeAllowFrom: gate.context?.storeAllowFrom ?? [],
					options: {
						forceWasMentioned: true,
						messageIdOverride: req.messageSid,
						receivedAtMs: Date.now(),
						...bounds,
						...gate.context?.threadSpec ? { threadSpec: gate.context.threadSpec } : {},
						...typeof gate.resolveChannelIngress === "function" ? { channelIngressResolvers: [gate.resolveChannelIngress] } : {}
					}
				})).then((result) => turn.finish(result), (error) => turn.finish(void 0, error));
				return await outcome;
			} catch (error) {
				const text = String(error?.message ?? error);
				return rejected(V_TELEGRAM_INTER_SESSION_RESTART_WEDGE_RE.test(text) ? "RESTART_WEDGE" : "INTERNAL", text);
			}
		}
	};
}
function vRegisterTelegramInterSessionBridge(params, message, authorization) {
	try {
		const accountId = normalizeAccountId(params.accountId);
		const bridge = vCreateTelegramInterSessionBridge({
			accountId,
			bot: params.bot,
			botInfo: params.opts?.botInfo,
			message,
			authorization,
			normalizeAccountId,
			log: (line) => logVerbose(line)
		});
		const reg = vTelegramInterSessionRegistry();
		const key = "telegram:" + accountId;
		vTelegramInterSessionByBot.set(params.bot, bridge);
		reg.bridges.set(key, bridge);
		vTelegramInterSessionNotify(reg, key, bridge);
		logVerbose("telegram: inter-session bridge registered as " + key);
	} catch (err) {
		params.runtime?.error?.("telegram: inter-session bridge not registered: " + String(err?.message ?? err));
	}
}
function vUnregisterTelegramInterSessionBridge(bot) {
	const bridge = vTelegramInterSessionByBot.get(bot);
	if (!bridge) return;
	vTelegramInterSessionByBot.delete(bot);
	const reg = vTelegramInterSessionRegistry();
	const key = "telegram:" + bridge.accountId;
	if (reg.bridges.get(key) !== bridge) return;
	reg.bridges.delete(key);
	vTelegramInterSessionNotify(reg, key, null);
}
// v-telegram-inter-session-bridge-v1: bridge end
//#region extensions/telegram/src/bot-handlers.runtime.ts
const registerTelegramHandlers = (params) => {
	const message = createTelegramMessagePipeline(params);
	const authorization = createTelegramHandlerAuthorization(params);
	vRegisterTelegramInterSessionBridge(params, message, authorization); // v-telegram-inter-session-bridge-v1
	const inboundPipeline = createTelegramInboundPipeline({
		params,
		message,
		authorization
	});
	const callbackRouter = createTelegramCallbackRouter({
		params,
		message,
		authorization
	});
	const eventBindings = createTelegramEventBindings({
		params,
		message,
		authorization,
		registerMessages: () => registerTelegramInboundHandlers({
			bot: params.bot,
			pipeline: inboundPipeline
		})
	});
	eventBindings.registerChatMembership();
	eventBindings.registerReaction();
	eventBindings.registerPolls();
	params.bot.on("callback_query", async (ctx) => {
		await callbackRouter.route(ctx);
	});
	eventBindings.registerMigration();
	eventBindings.registerMessages();
};
//#endregion
//#region extensions/telegram/src/bot-native-commands.ts
const loadTelegramBuiltinCommandExecutor = createLazyRuntimeModule(() => import("./bot-native-command-builtins-mQhamMB9.js"));
const loadTelegramPluginCommandExecutor = createLazyRuntimeModule(() => import("./bot-native-command-plugins-DIvwTl-k.js"));
const registerTelegramNativeCommands = ({ bot, cfg, runtime, accountId, telegramCfg, mediaMaxBytes, nativeEnabled, nativeSkillsEnabled, resolveGroupPolicy, resolveTelegramGroupConfig, shouldSkipUpdate, telegramDeps = defaultTelegramNativeCommandDeps, opts }) => {
	const boundRoute = nativeEnabled && nativeSkillsEnabled ? resolveAgentRoute({
		cfg,
		channel: "telegram",
		accountId
	}) : null;
	if (nativeEnabled && nativeSkillsEnabled && !boundRoute) runtime.log?.("nativeSkillsEnabled is true but no agent route is bound for this Telegram account; skill commands will not appear in the native menu.");
	const skillCommands = nativeEnabled && nativeSkillsEnabled && boundRoute ? telegramDeps.listSkillCommandsForAgents({
		cfg,
		agentIds: [boundRoute.agentId]
	}) : [];
	const pluginCommandRuntime = createPluginCommandRuntime();
	const pluginCommandSpecs = pluginCommandRuntime.listNativeCandidates("telegram");
	const nativeCommands = nativeEnabled ? listNativeCommandSpecsForConfig(cfg, {
		skillCommands,
		provider: "telegram",
		includeBundledChannelFallback: false
	}) : [];
	const reservedCommands = new Set(listNativeCommandSpecs({
		provider: "telegram",
		includeBundledChannelFallback: false
	}).map((command) => normalizeTelegramCommandName(command.name)));
	for (const command of skillCommands) reservedCommands.add(normalizeTelegramCommandName(command.name));
	const customResolution = resolveTelegramCustomCommands({
		commands: telegramCfg.customCommands,
		reservedCommands
	});
	for (const issue of customResolution.issues) runtime.error?.(danger(issue.message));
	const customCommands = customResolution.commands;
	const pluginCatalog = buildPluginTelegramMenuCommands({
		specs: pluginCommandSpecs,
		existingCommands: new Set(reservedCommands)
	});
	for (const issue of pluginCatalog.issues) runtime.error?.(danger(issue));
	const firstSkillCommandIndex = nativeEnabled ? listNativeCommandSpecsForConfig(cfg, {
		provider: "telegram",
		includeBundledChannelFallback: false
	}).length : 0;
	const nativeMenuCommands = nativeCommands.map((command, index) => {
		const normalized = normalizeTelegramCommandName(command.name);
		if (!TELEGRAM_COMMAND_NAME_PATTERN.test(normalized)) {
			runtime.error?.(danger(`Native command "${command.name}" is invalid for Telegram (resolved to "${normalized}"). Skipping.`));
			return null;
		}
		return {
			command: normalized,
			description: command.description,
			...command.isAlias ? { isAlias: true } : {},
			...index >= firstSkillCommandIndex ? { isSkill: true } : {},
			...command.descriptionLocalizations ? { descriptionLocalizations: command.descriptionLocalizations } : {}
		};
	}).filter((command) => command !== null);
	const customCommandNames = new Set(customCommands.map((command) => command.command));
	const fullCommandCatalog = buildCappedTelegramMenuCommands({ allCommands: [
		...customCommands,
		...nativeMenuCommands.filter((command) => !command.isAlias),
		...nativeEnabled ? pluginCatalog.commands.filter((command) => !customCommandNames.has(command.command)) : [],
		...nativeMenuCommands.filter((command) => command.isAlias)
	] });
	if (fullCommandCatalog.skillCommandsOmitted) runtime.log?.("Telegram menu pressure omitted per-skill commands; removing per-skill commands and keeping /skill.");
	const loginCommand = listNativeCommandSpecsForConfig(cfg, {
		provider: "telegram",
		includeBundledChannelFallback: false
	}).find((command) => findCommandByNativeName(command.name, "telegram", { includeBundledChannelFallback: false })?.key === "login");
	const nativeCommandsToHandle = nativeEnabled ? nativeCommands : loginCommand ? [loginCommand] : [];
	const { commandsToRegister, totalCommands, maxCommands, overflowCount, maxTotalChars, descriptionTrimmed, textBudgetDropCount } = fullCommandCatalog;
	if (overflowCount > 0) runtime.log?.(`Telegram limits bots to ${maxCommands} commands. ${totalCommands} configured; registering first ${maxCommands}. Use channels.telegram.commands.native: false to disable, or reduce plugin/skill/custom commands.`);
	if (descriptionTrimmed) runtime.log?.(`Telegram menu text exceeded the conservative ${maxTotalChars}-character payload budget; shortening descriptions to keep ${commandsToRegister.length} commands visible.`);
	if (textBudgetDropCount > 0) runtime.log?.(`Telegram menu text still exceeded the conservative ${maxTotalChars}-character payload budget after shortening descriptions; registering first ${commandsToRegister.length} commands.`);
	(telegramDeps.syncTelegramMenuCommands ?? syncTelegramMenuCommands)({
		bot,
		runtime,
		commandsToRegister,
		accountId,
		botId: opts.botInfo?.id,
		botToken: opts.token
	});
	const buildExecutorParams = (params) => ({
		...params,
		bot,
		runtime,
		accountId,
		mediaMaxBytes,
		resolveGroupPolicy,
		resolveTelegramGroupConfig,
		telegramDeps,
		opts
	});
	let handleLoginCallback;
	for (const command of nativeCommandsToHandle) {
		const normalizedCommandName = normalizeTelegramCommandName(command.name);
		const handleNativeCommand = async (botUser, msg, rawText) => {
			const { executeTelegramBuiltinCommand } = await loadTelegramBuiltinCommandExecutor();
			return await executeTelegramBuiltinCommand({
				...buildExecutorParams({
					botUser,
					msg,
					rawText
				}),
				commandName: command.name
			});
		};
		if (nativeEnabled) bot.command(normalizedCommandName, async (ctx) => {
			if (shouldSkipUpdate(ctx) || !ctx.message) return;
			await handleNativeCommand(ctx.me, ctx.message, typeof ctx.match === "string" ? ctx.match.trim() : "");
		});
		if (findCommandByNativeName(command.name, "telegram", { includeBundledChannelFallback: false })?.key === "login") handleLoginCallback = handleNativeCommand;
	}
	for (const pluginCommand of pluginCatalog.selectedCommands) bot.command(pluginCommand.command, async (ctx) => {
		if (shouldSkipUpdate(ctx) || !ctx.message) return;
		const { executeTelegramPluginCommand } = await loadTelegramPluginCommandExecutor();
		await executeTelegramPluginCommand({
			...buildExecutorParams({
				botUser: ctx.me,
				msg: ctx.message,
				rawText: ctx.match?.trim() ?? ""
			}),
			commandName: pluginCommand.command,
			candidate: pluginCommand.spec
		});
	});
	if (pluginCatalog.selectedCommands.length > 0) pluginCommandRuntime.retainNativeCatalog("telegram");
	if (!handleLoginCallback) return;
	return async ({ botUser, callbackQuery, commandText }) => {
		const commandBody = commandText.slice(1).trim();
		const separatorIndex = commandBody.search(/\s/u);
		const commandName = (separatorIndex === -1 ? commandBody : commandBody.slice(0, separatorIndex)).split("@", 1)[0]?.toLowerCase();
		if ((commandName ? findCommandByNativeName(commandName, "telegram", { includeBundledChannelFallback: false }) : void 0)?.key !== "login") return {
			handled: false,
			clearButtons: false
		};
		const callbackMessage = callbackQuery.message;
		if (!callbackMessage || callbackMessage.date <= 0) return {
			handled: true,
			clearButtons: false
		};
		if (callbackMessage.chat.type === "channel") return {
			handled: true,
			clearButtons: false
		};
		const rawText = separatorIndex === -1 ? "" : commandBody.slice(separatorIndex + 1).trim();
		return {
			handled: true,
			clearButtons: await handleLoginCallback(botUser, {
				...callbackMessage,
				chat: callbackMessage.chat,
				from: callbackQuery.from,
				text: commandText
			}, rawText)
		};
	};
};
//#endregion
//#region extensions/telegram/src/bot-update-tracker.ts
function sortedIds(ids) {
	return [...ids].toSorted((a, b) => a - b);
}
const ACCEPTED_UPDATE_ID_RETENTION = 1e4;
function createTelegramUpdateTracker(options = {}) {
	const initialUpdateId = typeof options.initialUpdateId === "number" ? options.initialUpdateId : null;
	const persistenceFloorUpdateId = typeof options.persistenceFloorUpdateId === "number" ? options.persistenceFloorUpdateId : initialUpdateId;
	const ackPolicy = options.ackPolicy ?? "after_receive_record";
	const recentUpdates = createTelegramUpdateDedupe();
	const pendingUpdateKeys = /* @__PURE__ */ new Set();
	const activeHandledUpdateKeys = /* @__PURE__ */ new Map();
	const pendingUpdateIds = /* @__PURE__ */ new Set();
	const failedUpdateIds = /* @__PURE__ */ new Set();
	const acceptedUpdateIds = /* @__PURE__ */ new Set();
	let highestAcceptedUpdateId = initialUpdateId;
	let highestPersistedAcceptedUpdateId = persistenceFloorUpdateId;
	let highestPersistenceRequestedUpdateId = persistenceFloorUpdateId;
	let highestCompletedUpdateId = persistenceFloorUpdateId;
	let persistInFlight = false;
	let persistTargetUpdateId = null;
	const skip = (key) => {
		options.onSkip?.(key);
	};
	const pruneAcceptedUpdateIds = () => {
		if (highestAcceptedUpdateId === null && highestPersistedAcceptedUpdateId === null) return;
		const windowFloor = highestAcceptedUpdateId === null ? Number.NEGATIVE_INFINITY : highestAcceptedUpdateId - ACCEPTED_UPDATE_ID_RETENTION;
		const persistedFloor = highestPersistedAcceptedUpdateId === null ? Number.NEGATIVE_INFINITY : highestPersistedAcceptedUpdateId;
		const pruneAtOrBelow = Math.max(persistedFloor, windowFloor);
		for (const id of acceptedUpdateIds) {
			if (id > pruneAtOrBelow) continue;
			if (pendingUpdateIds.has(id) || failedUpdateIds.has(id)) continue;
			acceptedUpdateIds.delete(id);
		}
	};
	const drainPersistQueue = async () => {
		const persist = options.onAcceptedUpdateId;
		if (persistInFlight || typeof persist !== "function") return;
		persistInFlight = true;
		try {
			while (persistTargetUpdateId !== null) {
				const updateId = persistTargetUpdateId;
				persistTargetUpdateId = null;
				try {
					await persist(updateId);
					if (highestPersistedAcceptedUpdateId === null || updateId > highestPersistedAcceptedUpdateId) {
						highestPersistedAcceptedUpdateId = updateId;
						pruneAcceptedUpdateIds();
					}
				} catch (err) {
					options.onPersistError?.(err);
				}
			}
		} finally {
			persistInFlight = false;
		}
	};
	const requestPersistAcceptedUpdateId = (updateId) => {
		if (typeof options.onAcceptedUpdateId !== "function") return;
		if (highestPersistenceRequestedUpdateId !== null && updateId <= highestPersistenceRequestedUpdateId) return;
		highestPersistenceRequestedUpdateId = updateId;
		persistTargetUpdateId = updateId;
		drainPersistQueue().catch((err) => {
			options.onPersistError?.(err);
		});
	};
	const acceptUpdateId = (updateId) => {
		acceptedUpdateIds.add(updateId);
		if (highestAcceptedUpdateId === null || updateId > highestAcceptedUpdateId) highestAcceptedUpdateId = updateId;
		pruneAcceptedUpdateIds();
	};
	function resolveSafeCompletedUpdateId() {
		if (highestCompletedUpdateId === null) return null;
		let safeCompletedUpdateId = highestCompletedUpdateId;
		for (const updateId of pendingUpdateIds) {
			if (persistenceFloorUpdateId !== null && updateId <= persistenceFloorUpdateId) continue;
			if (updateId <= safeCompletedUpdateId) safeCompletedUpdateId = updateId - 1;
		}
		for (const updateId of failedUpdateIds) {
			if (persistenceFloorUpdateId !== null && updateId <= persistenceFloorUpdateId) continue;
			if (updateId <= safeCompletedUpdateId) safeCompletedUpdateId = updateId - 1;
		}
		return safeCompletedUpdateId;
	}
	const persistUpdateIdAfterAck = async (updateId) => {
		const persistUpdateId = ackPolicy === "after_agent_dispatch" ? resolveSafeCompletedUpdateId() : updateId;
		if (persistUpdateId !== null) requestPersistAcceptedUpdateId(persistUpdateId);
	};
	const ackUpdateAfterStage = (receiveContext, stage) => {
		if (!receiveContext?.shouldAckAfter(stage)) return;
		receiveContext.ack().catch((err) => {
			options.onPersistError?.(err);
		});
	};
	const beginUpdate = (ctx) => {
		const updateId = resolveTelegramUpdateId(ctx);
		const updateKey = buildTelegramUpdateKey(ctx);
		if (typeof updateId === "number") {
			if (failedUpdateIds.has(updateId)) failedUpdateIds.delete(updateId);
			else if (initialUpdateId !== null && updateId <= initialUpdateId) {
				skip(`update:${updateId}`);
				return {
					accepted: false,
					reason: "accepted-watermark"
				};
			} else if (acceptedUpdateIds.has(updateId)) {
				skip(`update:${updateId}`);
				return {
					accepted: false,
					reason: "accepted-watermark"
				};
			}
		}
		if (updateKey) {
			if (pendingUpdateKeys.has(updateKey) || recentUpdates.peek(updateKey)) {
				skip(updateKey);
				return {
					accepted: false,
					reason: "semantic-dedupe"
				};
			}
			pendingUpdateKeys.add(updateKey);
			activeHandledUpdateKeys.set(updateKey, false);
		}
		let receiveContext;
		if (typeof updateId === "number") {
			pendingUpdateIds.add(updateId);
			acceptUpdateId(updateId);
			receiveContext = createMessageReceiveContext({
				id: updateKey ?? `telegram:update:${updateId}`,
				channel: "telegram",
				message: ctx,
				ackPolicy,
				onAck: () => persistUpdateIdAfterAck(updateId)
			});
			ackUpdateAfterStage(receiveContext, "receive_record");
		}
		return {
			accepted: true,
			update: {
				...updateKey ? { key: updateKey } : {},
				...typeof updateId === "number" ? { updateId } : {},
				...receiveContext ? { receiveContext } : {}
			}
		};
	};
	const finishUpdate = (update, finish) => {
		if (update.key) {
			activeHandledUpdateKeys.delete(update.key);
			if (finish.completed) recentUpdates.check(update.key);
			pendingUpdateKeys.delete(update.key);
		}
		if (typeof update.updateId === "number") {
			pendingUpdateIds.delete(update.updateId);
			if (finish.completed) {
				failedUpdateIds.delete(update.updateId);
				if (highestCompletedUpdateId === null || update.updateId > highestCompletedUpdateId) highestCompletedUpdateId = update.updateId;
				ackUpdateAfterStage(update.receiveContext, "agent_dispatch");
			} else {
				failedUpdateIds.add(update.updateId);
				update.receiveContext?.nack(/* @__PURE__ */ new Error("Telegram update handler did not complete")).catch((err) => {
					options.onPersistError?.(err);
				});
			}
			pruneAcceptedUpdateIds();
		}
	};
	const shouldSkipHandlerDispatch = (ctx) => {
		const updateId = resolveTelegramUpdateId(ctx);
		if (typeof updateId === "number" && initialUpdateId !== null && updateId <= initialUpdateId) return true;
		const key = buildTelegramUpdateKey(ctx);
		if (!key) return false;
		const handled = activeHandledUpdateKeys.get(key);
		if (handled != null) {
			if (handled) {
				skip(key);
				return true;
			}
			activeHandledUpdateKeys.set(key, true);
			return false;
		}
		const skipped = recentUpdates.peek(key);
		if (skipped) skip(key);
		return skipped;
	};
	const getState = () => ({
		highestAcceptedUpdateId,
		highestPersistedAcceptedUpdateId,
		highestCompletedUpdateId,
		safeCompletedUpdateId: resolveSafeCompletedUpdateId(),
		pendingUpdateIds: sortedIds(pendingUpdateIds),
		failedUpdateIds: sortedIds(failedUpdateIds)
	});
	return {
		beginUpdate,
		finishUpdate,
		getState,
		shouldSkipHandlerDispatch
	};
}
//#endregion
//#region extensions/telegram/src/raw-update-log.ts
const MAX_RAW_UPDATE_STRING = 500;
const MAX_RAW_UPDATE_ARRAY = 20;
const MAX_RAW_UPDATE_CHARS = 8e3;
const REDACTED_TELEGRAM_FIELD = "[redacted]";
const TELEGRAM_RAW_UPDATE_ALWAYS_REDACT_KEYS = /* @__PURE__ */ new Set([
	"added_to_attachment_menu",
	"author_signature",
	"caption",
	"chat_instance",
	"data",
	"email",
	"bio",
	"description",
	"explanation",
	"file_id",
	"file_unique_id",
	"first_name",
	"invite_link",
	"is_premium",
	"language_code",
	"latitude",
	"last_name",
	"longitude",
	"name",
	"phone_number",
	"question",
	"query",
	"text",
	"title",
	"url",
	"username",
	"vcard"
]);
const TELEGRAM_RAW_UPDATE_ALLOWED_ID_KEYS = /* @__PURE__ */ new Set(["message_id", "update_id"]);
const TELEGRAM_RAW_UPDATE_ID_REDACT_KEYS = /* @__PURE__ */ new Set([
	"chat_id",
	"custom_emoji_id",
	"inline_message_id",
	"migrate_from_chat_id",
	"migrate_to_chat_id",
	"option_ids",
	"poll_id",
	"sender_chat_id",
	"user_id",
	"user_chat_id"
]);
function shouldRedactTelegramRawUpdateValue(key, parentKey) {
	if (!key) return false;
	if (TELEGRAM_RAW_UPDATE_ALWAYS_REDACT_KEYS.has(key)) return true;
	if (TELEGRAM_RAW_UPDATE_ALLOWED_ID_KEYS.has(key)) return false;
	if (TELEGRAM_RAW_UPDATE_ID_REDACT_KEYS.has(key)) return true;
	if (key === "id" || key.endsWith("_id") || key.endsWith("_ids")) return parentKey !== void 0;
	return false;
}
function isTelegramUserObject(value) {
	return typeof value.id === "number" && typeof value.is_bot === "boolean" && typeof value.first_name === "string";
}
function formatTelegramRawUpdateForLog(update) {
	const seen = /* @__PURE__ */ new WeakSet();
	const transform = (value, key = "", parentKey) => {
		if (shouldRedactTelegramRawUpdateValue(key, parentKey)) return REDACTED_TELEGRAM_FIELD;
		if (typeof value === "string") return value.length > MAX_RAW_UPDATE_STRING ? `${truncateUtf16Safe(value, MAX_RAW_UPDATE_STRING)}...` : value;
		if (Array.isArray(value)) {
			const items = value.slice(0, MAX_RAW_UPDATE_ARRAY).map((item) => transform(item, key, key));
			if (value.length > MAX_RAW_UPDATE_ARRAY) items.push(`...(${value.length - MAX_RAW_UPDATE_ARRAY} more)`);
			return items;
		}
		if (value && typeof value === "object") {
			if (seen.has(value)) return "[Circular]";
			seen.add(value);
			const record = value;
			if (isTelegramUserObject(record)) return REDACTED_TELEGRAM_FIELD;
			const redacted = {};
			for (const [entryKey, entryValue] of Object.entries(record)) redacted[entryKey] = transform(entryValue, entryKey, key);
			return redacted;
		}
		return value;
	};
	const raw = JSON.stringify(transform(update ?? null));
	return raw.length > MAX_RAW_UPDATE_CHARS ? `${truncateUtf16Safe(raw, MAX_RAW_UPDATE_CHARS)}...` : raw;
}
//#endregion
//#region extensions/telegram/src/sendchataction-401-backoff.ts
const BACKOFF_POLICY = {
	initialMs: 1e3,
	maxMs: 3e5,
	factor: 2,
	jitter: .1
};
function is401Error(error) {
	if (!error) return false;
	if (typeof error === "object" && error !== null && "error_code" in error && typeof error.error_code === "number") return error.error_code === 401;
	const message = error instanceof Error ? error.message : JSON.stringify(error);
	return normalizeLowercaseStringOrEmpty(message).includes("unauthorized");
}
function isTransientSendChatActionError(error) {
	return isTelegramRateLimitError(error) || isTelegramServerError(error) || isRecoverableTelegramNetworkError(error, { context: "action" });
}
function resolveTransientCooldownMs(error, attempt) {
	const retryAfterMs = readTelegramRetryAfterMs(error);
	if (retryAfterMs !== void 0 && retryAfterMs > 0) return retryAfterMs;
	return computeBackoff(BACKOFF_POLICY, attempt);
}
/**
* Creates a GLOBAL (per-account) handler for sendChatAction that tracks 401 and
* transient errors across all message contexts. This prevents the infinite loop
* that caused Telegram to delete bots (issue #27092).
*
* When a 401 occurs, exponential backoff is applied (1s → 2s → 4s → ... → 5min).
* After maxConsecutive401 failures (default 10), all sendChatAction calls are
* suspended until reset() is called.
*/
function createTelegramSendChatActionHandler({ sendChatActionFn, logger, maxConsecutive401 = 10, minIntervalMs = 0, now = () => Date.now() }) {
	let consecutive401Failures = 0;
	let consecutiveTransientFailures = 0;
	let suspended = false;
	let transientCooldownUntilMs = 0;
	const blockedUntilByKey = /* @__PURE__ */ new Map();
	const clearTransientCooldown = () => {
		consecutiveTransientFailures = 0;
		transientCooldownUntilMs = 0;
	};
	const reset = () => {
		consecutive401Failures = 0;
		clearTransientCooldown();
		suspended = false;
		blockedUntilByKey.clear();
	};
	const sendChatAction = async (chatId, action, threadParams) => {
		if (suspended) return;
		const attemptedAt = now();
		const remainingTransientCooldownMs = transientCooldownUntilMs - attemptedAt;
		if (remainingTransientCooldownMs > 0) throw new Error(`sendChatAction transient cooldown active for ${Math.ceil(remainingTransientCooldownMs)}ms`);
		const key = minIntervalMs > 0 ? `${String(chatId)}:${action}` : void 0;
		if (key) {
			const blockedUntil = blockedUntilByKey.get(key);
			if (blockedUntil !== void 0 && attemptedAt < blockedUntil) return;
			blockedUntilByKey.set(key, Number.POSITIVE_INFINITY);
		}
		if (consecutive401Failures > 0) {
			const backoffMs = computeBackoff(BACKOFF_POLICY, consecutive401Failures);
			logger(`sendChatAction backoff: waiting ${backoffMs}ms before retry (failure ${consecutive401Failures}/${maxConsecutive401})`);
			await sleepWithAbort(backoffMs);
		}
		try {
			await sendChatActionFn(chatId, action, threadParams);
			if (consecutive401Failures > 0) {
				logger(`sendChatAction recovered after ${consecutive401Failures} consecutive 401 failures`);
				consecutive401Failures = 0;
			}
			clearTransientCooldown();
		} catch (error) {
			if (is401Error(error)) {
				clearTransientCooldown();
				consecutive401Failures++;
				if (consecutive401Failures >= maxConsecutive401) {
					suspended = true;
					logger(`CRITICAL: sendChatAction suspended after ${consecutive401Failures} consecutive 401 errors. Bot token is likely invalid. Telegram may DELETE the bot if requests continue. Replace the Telegram token in config/env, then restart the Gateway.`);
				} else logger(`sendChatAction 401 error (${consecutive401Failures}/${maxConsecutive401}). Retrying with exponential backoff.`);
			} else if (isTransientSendChatActionError(error)) {
				consecutiveTransientFailures++;
				const cooldownMs = resolveTransientCooldownMs(error, consecutiveTransientFailures);
				const cooldownStartedAt = now();
				const coalescingUntilMs = key ? attemptedAt + minIntervalMs : 0;
				transientCooldownUntilMs = Math.max(cooldownStartedAt + cooldownMs, coalescingUntilMs);
				const effectiveCooldownMs = Math.max(0, transientCooldownUntilMs - cooldownStartedAt);
				logger(`sendChatAction transient error (${consecutiveTransientFailures}). Cooling down ${effectiveCooldownMs}ms before retry.`);
			} else clearTransientCooldown();
			throw error;
		} finally {
			if (key) blockedUntilByKey.set(key, attemptedAt + minIntervalMs);
		}
	};
	return {
		sendChatAction,
		isSuspended: () => suspended,
		reset
	};
}
//#endregion
//#region extensions/telegram/src/sequential-key.ts
const TELEGRAM_READ_ONLY_STATUS_COMMAND_KEYS = /* @__PURE__ */ new Set([
	"commands",
	"context",
	"help",
	"status",
	"tasks",
	"tools",
	"whoami"
]);
const TELEGRAM_ACTIVE_RUN_CONTROL_COMMAND_KEYS = /* @__PURE__ */ new Set(["queue", "steer"]);
function getTelegramMessageReactionSequentialKey(ctx) {
	const reaction = ctx.update?.message_reaction;
	if ((reaction?.chat?.is_forum === true || reaction?.chat?.is_direct_messages === true) && typeof reaction.chat.id === "number" && typeof reaction.message_id === "number") return `telegram:${reaction.chat.id}:message:${reaction.message_id}`;
	const msg = ctx.message ?? ctx.channelPost ?? ctx.editedMessage ?? ctx.editedChannelPost ?? ctx.update?.message ?? ctx.update?.edited_message ?? ctx.update?.channel_post ?? ctx.update?.edited_channel_post;
	return (resolveTelegramMessageForumFlagHint({
		chatType: msg?.chat?.type,
		isForum: msg?.chat?.is_forum,
		isTopicMessage: msg?.is_topic_message
	}) || msg?.chat.is_direct_messages === true) && typeof msg?.chat.id === "number" && typeof msg.message_id === "number" ? `telegram:${msg.chat.id}:message:${msg.message_id}` : void 0;
}
function isTelegramReadOnlyControlLaneText(params) {
	const normalizedBody = normalizeCommandBody(params.rawText?.trim() ?? "", params.botUsername ? { botUsername: params.botUsername } : void 0);
	const alias = maybeResolveTextAlias(normalizedBody);
	if (!alias) return false;
	const command = listChatCommands().find((entry) => entry.textAliases.some((candidate) => candidate.trim().toLowerCase() === alias));
	return command?.category === "status" && TELEGRAM_READ_ONLY_STATUS_COMMAND_KEYS.has(command.key);
}
function resolveTelegramCommandAliasForControlLane(rawText, botUsername) {
	const trimmed = rawText?.trim();
	if (!trimmed) return;
	return maybeResolveTextAlias(normalizeCommandBody(trimmed, botUsername ? { botUsername } : void 0)) ?? void 0;
}
function isTelegramActiveRunControlLaneText(params) {
	const alias = resolveTelegramCommandAliasForControlLane(params.rawText, params.botUsername);
	if (!alias) return false;
	const command = listChatCommands().find((entry) => entry.textAliases.some((candidate) => candidate.trim().toLowerCase() === alias));
	return command ? TELEGRAM_ACTIVE_RUN_CONTROL_COMMAND_KEYS.has(command.key) : false;
}
function isTelegramControlLaneText(params) {
	const abortCommandOptions = params.botUsername ? { botUsername: params.botUsername } : { targetedCommandMode: "pre-identity" };
	if (isAbortRequestText(params.rawText, abortCommandOptions)) return true;
	if (isTelegramActiveRunControlLaneText(params)) return true;
	return isTelegramReadOnlyControlLaneText(params);
}
function getTelegramSequentialKey(ctx) {
	const reaction = ctx.update?.message_reaction;
	if (reaction?.chat?.id) return `telegram:${reaction.chat.id}`;
	const update = ctx.update;
	const pollId = update?.poll_answer?.poll_id;
	if (pollId) {
		const entry = getPreparedTelegramPollAnswer(update)?.entry;
		if (entry) return getTelegramPollAnswerSequentialKey(entry);
		return `telegram:poll:${pollId}`;
	}
	const msg = ctx.message ?? ctx.channelPost ?? ctx.editedMessage ?? ctx.editedChannelPost ?? ctx.update?.message ?? ctx.update?.edited_message ?? ctx.update?.channel_post ?? ctx.update?.edited_channel_post ?? ctx.update?.callback_query?.message;
	const chatId = msg?.chat?.id ?? ctx.chat?.id;
	const rawText = msg?.text ?? msg?.caption;
	const botUsername = ctx.me?.username;
	if (isTelegramControlLaneText({
		rawText,
		botUsername
	})) {
		if (typeof chatId === "number") return `telegram:${chatId}:control`;
		return "telegram:control";
	}
	if (isBtwRequestText(rawText, botUsername ? { botUsername } : void 0)) {
		const messageId = msg?.message_id;
		if (typeof chatId === "number" && typeof messageId === "number") return `telegram:${chatId}:btw:${messageId}`;
		if (typeof chatId === "number") return `telegram:${chatId}:btw`;
		return "telegram:btw";
	}
	const callbackData = ctx.update?.callback_query?.data;
	if (hasTelegramQuestionCallbackPrefix(callbackData)) {
		if (typeof chatId === "number") return `telegram:${chatId}:question`;
		return "telegram:question";
	}
	if (hasTelegramApprovalCallbackPrefix(callbackData) || callbackData && parseExecApprovalCommandText(callbackData) !== null) {
		if (typeof chatId === "number") return `telegram:${chatId}:approval`;
		return "telegram:approval";
	}
	const forumHint = msg?.chat ? resolveTelegramMessageForumFlagHint({
		chatType: msg.chat.type,
		isForum: msg.chat.is_forum,
		isTopicMessage: msg.is_topic_message
	}) : void 0;
	const cachedForumFlag = forumHint === void 0 && msg?.chat?.type === "supergroup" && typeof msg.chat.id === "number" ? getCachedTelegramForumFlag(msg.chat.id) : void 0;
	const threadSpec = msg?.chat ? resolveTelegramMessageThreadSpec(msg, forumHint ?? cachedForumFlag) : void 0;
	const threadId = threadSpec?.scope === "dm" ? shouldUseTelegramDmThreadSession({
		dmThreadId: threadSpec.id,
		botHasTopicsEnabled: resolveTelegramBotHasTopicsEnabled(ctx.me)
	}) ? threadSpec.id : void 0 : threadSpec?.id;
	if (typeof chatId === "number") return threadId != null ? `telegram:${chatId}:topic:${threadId}` : `telegram:${chatId}`;
	return "telegram:unknown";
}
function getTelegramPollAnswerSequentialKey(entry) {
	const threadId = "id" in entry.threadSpec ? entry.threadSpec.id : void 0;
	return threadId == null ? `telegram:${entry.chat.id}` : `telegram:${entry.chat.id}:topic:${threadId}`;
}
function getTelegramSequentialConstraints(ctx) {
	const key = getTelegramSequentialKey(ctx);
	const messageKey = getTelegramMessageReactionSequentialKey(ctx);
	if (ctx.update?.message_reaction && messageKey) return messageKey;
	return messageKey ? [key, messageKey] : key;
}
//#endregion
//#region extensions/telegram/src/bot-core.ts
const DEFAULT_TELEGRAM_BOT_RUNTIME = {
	Bot: Bot$1,
	sequentialize,
	apiThrottler
};
function createTelegramBotCore(opts) {
	const botRuntime = DEFAULT_TELEGRAM_BOT_RUNTIME;
	const runtime = opts.runtime ?? createNonExitingRuntime();
	const telegramDeps = opts.telegramDeps;
	const cfg = opts.config ?? telegramDeps.getRuntimeConfig();
	const account = resolveTelegramAccount({
		cfg,
		accountId: opts.accountId
	});
	const ownerAgentId = opts.ownerAgentId?.trim() || resolveTelegramAccountOwnerAgentId({
		cfg,
		accountId: account.accountId
	});
	const runtimeOpts = {
		...opts,
		ownerAgentId
	};
	const threadBindingManager = resolveThreadBindingSpawnPolicy({
		cfg,
		channel: "telegram",
		accountId: account.accountId,
		kind: "subagent"
	}).enabled ? createTelegramThreadBindingManager({
		cfg,
		accountId: account.accountId,
		idleTimeoutMs: resolveThreadBindingIdleTimeoutMsForChannel({
			cfg,
			channel: "telegram",
			accountId: account.accountId
		}),
		maxAgeMs: resolveThreadBindingMaxAgeMsForChannel({
			cfg,
			channel: "telegram",
			accountId: account.accountId
		})
	}) : null;
	const telegramCfg = account.config;
	const telegramTransport = opts.telegramTransport ?? resolveTelegramTransport(opts.proxyFetch, { network: telegramCfg.network });
	const finalFetch = createTelegramClientFetch({
		fetchImpl: asTelegramClientFetch(telegramTransport.fetch),
		shutdownSignal: opts.fetchAbortSignal,
		transport: telegramTransport
	});
	const timeoutSeconds = resolveTelegramClientTimeoutSeconds({
		value: void 0,
		minimum: resolveTelegramClientTimeoutMinimumSeconds([opts.minimumClientTimeoutSeconds, resolveTelegramOutboundClientTimeoutFloorSeconds(void 0)])
	});
	const apiRoot = normalizeOptionalString(telegramCfg.apiRoot);
	const normalizedApiRoot = apiRoot ? normalizeTelegramApiRoot(apiRoot) : void 0;
	const client = finalFetch || timeoutSeconds || normalizedApiRoot ? {
		...finalFetch ? { fetch: asTelegramClientFetch(finalFetch) } : {},
		...timeoutSeconds ? { timeoutSeconds } : {},
		...normalizedApiRoot ? { apiRoot: normalizedApiRoot } : {}
	} : void 0;
	const botConfig = client || opts.botInfo ? {
		...client ? { client } : {},
		...opts.botInfo ? { botInfo: opts.botInfo } : {}
	} : void 0;
	const bot = new botRuntime.Bot(opts.token, botConfig);
	bot.api.config.use(getOrCreateAccountThrottler(opts.token, botRuntime.apiThrottler));
	bot.catch((err) => {
		runtime.error?.(danger(`telegram bot error: ${formatUncaughtError(err)}`));
	});
	const initialUpdateId = typeof opts.updateOffset?.lastUpdateId === "number" ? opts.updateOffset.lastUpdateId : null;
	const logSkippedUpdate = (key) => {
		if (shouldLogVerbose()) logVerbose(`telegram dedupe: skipped ${key}`);
	};
	const updateTracker = createTelegramUpdateTracker({
		initialUpdateId,
		persistenceFloorUpdateId: typeof opts.updateOffset?.persistenceFloorUpdateId === "number" ? opts.updateOffset.persistenceFloorUpdateId : initialUpdateId,
		ackPolicy: "after_agent_dispatch",
		...typeof opts.updateOffset?.onUpdateId === "function" ? { onAcceptedUpdateId: opts.updateOffset.onUpdateId } : {},
		onPersistError: (err) => {
			runtime.error?.(`telegram: failed to persist update watermark: ${formatErrorMessage(err)}`);
		},
		onSkip: logSkippedUpdate
	});
	const shouldSkipUpdate = (ctx) => updateTracker.shouldSkipHandlerDispatch(ctx);
	bot.use(async (ctx, next) => {
		const begin = updateTracker.beginUpdate(ctx);
		if (!begin.accepted) return;
		try {
			const { result } = await runWithTelegramUpdateProcessingFrame(async () => {
				await next();
				if (!getTelegramSpooledReplayDeferredParticipant()) ensureTelegramMessageProcessingResult({ kind: "completed" });
			});
			const deferredWork = getTelegramSpooledReplayDeferredParticipant();
			if (deferredWork) {
				deferredWork.task.then((deferredResult) => {
					updateTracker.finishUpdate(begin.update, { completed: deferredResult.kind !== "failed-retryable" });
				}).catch(() => {
					updateTracker.finishUpdate(begin.update, { completed: false });
				});
				return;
			}
			if (result?.kind === "failed-retryable") {
				if (isTelegramSpooledReplayUpdate(ctx.update)) throw new TelegramSpooledReplayProcessingError(result.error);
				updateTracker.finishUpdate(begin.update, { completed: true });
				return;
			}
			updateTracker.finishUpdate(begin.update, { completed: true });
		} catch (error) {
			updateTracker.finishUpdate(begin.update, { completed: false });
			throw error;
		}
	});
	bot.use(async (ctx, next) => {
		const callback = ctx.callbackQuery;
		if (callback) {
			const answerPromise = takeTelegramCallbackQueryAdmissionAnswer(bot, callback.id) ?? startTelegramCallbackQueryAnswer(bot, callback.id, false);
			setTelegramCallbackQueryAnswerPromise(ctx, answerPromise);
			answerPromise.catch(() => {});
		}
		await next();
	});
	bot.use(async (ctx, next) => {
		try {
			prepareTelegramPollAnswerContext({
				update: ctx.update,
				accountId: account.accountId
			});
		} catch (error) {
			if (isTelegramSpooledReplayUpdate(ctx.update)) {
				recordTelegramMessageProcessingResult({
					kind: "failed-retryable",
					error
				});
				return;
			}
			throw error;
		}
		await next();
	});
	bot.use(vTelegramFor(telegramDeps.getRuntimeConfig?.() ?? cfg).middleware); // v-experience-telegram-v1
	bot.use(botRuntime.sequentialize(getTelegramSequentialConstraints));
	bot.use(async (ctx, next) => {
		await settleTelegramPollAnswerContext({
			update: ctx.update,
			accountId: account.accountId
		});
		await next();
	});
	const rawUpdateLogger = createSubsystemLogger("gateway/channels/telegram/raw-update");
	bot.use(async (ctx, next) => {
		if (shouldLogVerbose()) try {
			rawUpdateLogger.debug(`telegram update: ${formatTelegramRawUpdateForLog(ctx.update)}`);
		} catch (err) {
			rawUpdateLogger.debug(`telegram update log failed: ${String(err)}`);
		}
		await next();
	});
	const { historyLimit } = resolveTelegramMessageTurnSettings({
		accountId: account.accountId,
		cfg,
		telegramCfg,
		opts: runtimeOpts
	});
	const groupHistories = /* @__PURE__ */ new Map();
	const botHistorySender = buildTelegramSelfSenderName(account.name, opts.botInfo);
	const unregisterOutboundGroupHistoryRecorder = registerTelegramOutboundGroupHistoryRecorder({
		accountId: account.accountId,
		recorder: (record) => {
			if (!String(record.chatId).startsWith("-")) return;
			recordTelegramGroupHistoryEntry({
				historyMap: groupHistories,
				historyKey: buildTelegramGroupPeerId(record.chatId, record.threadSpec),
				limit: historyLimit,
				entry: {
					sender: botHistorySender,
					body: record.text?.trim() || "<media>",
					timestamp: record.timestamp,
					messageId: String(record.messageId)
				}
			});
		}
	});
	const nativeEnabled = resolveNativeCommandsEnabled({
		providerId: "telegram",
		providerSetting: telegramCfg.commands?.native,
		globalSetting: cfg.commands?.native
	});
	const nativeSkillsEnabled = resolveNativeSkillsEnabled({
		providerId: "telegram",
		providerSetting: telegramCfg.commands?.nativeSkills,
		globalSetting: cfg.commands?.nativeSkills
	});
	const mediaMaxBytes = (opts.mediaMaxMb ?? telegramCfg.mediaMaxMb ?? 100) * 1024 * 1024;
	const logger = getChildLogger({ module: "telegram-auto-reply" });
	const resolveGroupPolicy = (chatId, turnCfg) => resolveChannelGroupPolicy({
		cfg: turnCfg,
		channel: "telegram",
		accountId: account.accountId,
		groupId: String(chatId)
	});
	const resolveGroupActivation = (params) => {
		const agentId = params.agentId ?? ownerAgentId;
		const storePath = telegramDeps.resolveStorePath(params.cfg.session?.store, { agentId });
		try {
			const getSessionEntry = telegramDeps.getSessionEntry;
			if (!getSessionEntry) return;
			const storedActivation = getSessionEntry({
				storePath,
				sessionKey: params.sessionKey
			})?.groupActivation;
			const activation = storedActivation === "mention" || storedActivation === "always" ? normalizeGroupActivation(storedActivation) : void 0;
			if (activation === "always") return false;
			if (activation === "mention") return true;
		} catch (err) {
			logVerbose(`Failed to load session for activation check: ${String(err)}`);
		}
	};
	const resolveGroupRequireMention = (chatId, turnCfg) => resolveScopeRequireMention({
		tree: buildChannelGroupsScopeTree(turnCfg, "telegram", account.accountId),
		path: [String(chatId)],
		requireMentionOverride: opts.requireMention,
		overrideOrder: "after-config"
	});
	const resolveTelegramGroupConfig = (chatId, messageThreadId, turnCfg) => {
		const turnTelegramCfg = resolveTelegramAccount({
			cfg: turnCfg,
			accountId: account.accountId
		}).config;
		return resolveTelegramScopedGroupConfig(turnTelegramCfg, chatId, messageThreadId);
	};
	const sendChatActionHandler = createTelegramSendChatActionHandler({
		sendChatActionFn: (chatId, action, threadParams) => bot.api.sendChatAction(chatId, action, threadParams),
		logger: (message) => logVerbose(`telegram: ${message}`),
		minIntervalMs: TELEGRAM_CHAT_ACTION_INTERVAL_MS
	});
	const processMessage = createTelegramMessageProcessor({
		bot,
		account,
		groupHistories,
		logger,
		resolveGroupActivation,
		resolveGroupRequireMention,
		resolveTelegramGroupConfig,
		sendChatActionHandler,
		runtime,
		buildContext: opts.buildContext,
		opts: runtimeOpts,
		telegramDeps
	});
	const nativeCommandCallbackDispatcher = registerTelegramNativeCommands({
		bot,
		cfg,
		runtime,
		accountId: account.accountId,
		telegramCfg,
		mediaMaxBytes,
		nativeEnabled,
		nativeSkillsEnabled,
		resolveGroupPolicy,
		resolveTelegramGroupConfig,
		shouldSkipUpdate,
		opts: runtimeOpts,
		telegramDeps: {
			...telegramDeps,
			sendMessageTelegram: defaultTelegramNativeCommandDeps.sendMessageTelegram
		}
	});
	registerTelegramHandlers({
		cfg,
		accountId: account.accountId,
		ownerAgentId,
		bot,
		opts: runtimeOpts,
		telegramTransport,
		runtime,
		mediaMaxBytes,
		telegramCfg,
		resolveGroupPolicy,
		resolveGroupActivation,
		resolveGroupRequireMention,
		resolveTelegramGroupConfig,
		shouldSkipUpdate,
		processMessage: async ({ ctx, allMedia, storeAllowFrom, turnContext, options, replyMedia, replyChain, promptContext }) => await processMessage(ctx, allMedia, storeAllowFrom, turnContext, options, replyMedia, replyChain, promptContext),
		logger,
		telegramDeps,
		nativeCommandCallbackDispatcher
	});
	const originalStop = bot.stop.bind(bot);
	bot.stop = ((...args) => {
		threadBindingManager?.stop();
		vUnregisterTelegramInterSessionBridge(bot); // v-telegram-inter-session-bridge-v1
		unregisterOutboundGroupHistoryRecorder();
		return originalStop(...args);
	});
	return bot;
}
//#endregion
//#region extensions/telegram/src/bot.ts
function createTelegramBot(opts) {
	return createTelegramBotCore({
		...opts,
		telegramDeps: opts.telegramDeps ?? defaultTelegramBotDeps
	});
}
//#endregion
//#region extensions/telegram/src/telegram-ingress-spool.payload.ts
var TelegramIngressPayloadError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "TelegramIngressPayloadError";
	}
};
//#endregion
//#region extensions/telegram/src/telegram-ingress-non-retryable.ts
const MISSING_AGENT_HARNESS_ERROR_NAME = "MissingAgentHarnessError";
const MISSING_AGENT_HARNESS_MESSAGE_RE = /Requested agent harness "[^"]+" is not registered\./u;
const TELEGRAM_UNREACHABLE_RECIPIENT_RE = /\b403\b[\s\S]*\b(?:bot was blocked by the user|bot was kicked|user is deactivated)\b/iu;
/** Channel-owned non-retryable predicate for the core ingress drain. */
function resolveTelegramIngressNonRetryableFailure(err) {
	for (const candidate of collectErrorGraphCandidates(err, (current) => [current.cause, current.error])) {
		const message = formatErrorMessage(candidate);
		if (candidate instanceof TelegramIngressPayloadError) return {
			reason: "invalid-event",
			message
		};
		if (isTelegramMessageDispatchReplayForgetError(candidate)) return {
			reason: "dispatch-dedupe-rollback-failed",
			message
		};
		if (TELEGRAM_UNREACHABLE_RECIPIENT_RE.test(message)) return {
			reason: "recipient-unreachable",
			message
		};
		if (readErrorName(candidate) === MISSING_AGENT_HARNESS_ERROR_NAME || MISSING_AGENT_HARNESS_MESSAGE_RE.test(message)) return {
			reason: "missing-agent-harness",
			message
		};
	}
	return null;
}
//#endregion
//#region extensions/telegram/src/telegram-ingress-supersede-auth.ts
function extractUpdateSenderFacts(update) {
	if (!update || typeof update !== "object") return null;
	const root = update;
	let message;
	for (const key of [
		"message",
		"edited_message",
		"channel_post",
		"edited_channel_post"
	]) {
		const candidate = root[key];
		if (candidate && typeof candidate === "object") {
			message = candidate;
			break;
		}
	}
	if (!message) {
		const callback = root.callback_query;
		if (callback && typeof callback === "object") {
			const cb = callback;
			const from = cb.from;
			const msg = cb.message;
			if (from && typeof from === "object" && msg && typeof msg === "object") {
				const chat = msg.chat;
				const fromObj = from;
				if (typeof chat?.id === "number" && typeof fromObj.id === "number") {
					const chatType = typeof chat.type === "string" ? chat.type : "private";
					return {
						senderId: String(fromObj.id),
						...typeof fromObj.username === "string" ? { senderUsername: fromObj.username } : {},
						chatId: chat.id,
						isGroup: chatType !== "private",
						message: msg
					};
				}
			}
		}
		return null;
	}
	const chat = message.chat;
	const from = message.from;
	if (typeof chat?.id !== "number" || typeof from?.id !== "number") return null;
	const chatType = typeof chat.type === "string" ? chat.type : "private";
	return {
		senderId: String(from.id),
		...typeof from.username === "string" ? { senderUsername: from.username } : {},
		chatId: chat.id,
		isGroup: chatType !== "private",
		message
	};
}
/** Ambient room_event-shaped updates (no user text body) stay supersedable. */
function isTelegramAmbientSpooledUpdate(update) {
	if (!update || typeof update !== "object") return false;
	const root = update;
	return root.message_reaction != null || root.message_reaction_count != null || root.chat_member != null || root.my_chat_member != null || root.chat_join_request != null || root.chat_boost != null || root.removed_chat_boost != null;
}
/**
* Whether the raw update's sender is command-authorized.
* Reuses resolveTelegramGroupAllowFromContext — same group/topic allowFrom
* overrides and access-group expansion as normal message ingress.
*/
async function isTelegramSpooledUpdateSenderAuthorized(update, auth) {
	const facts = extractUpdateSenderFacts(update);
	if (!facts) return false;
	const accountCfg = mergeTelegramAccountConfig(auth.cfg, auth.accountId);
	const dmPolicy = accountCfg.dmPolicy ?? "pairing";
	const allowFrom = accountCfg.allowFrom;
	const groupAllowFrom = accountCfg.groupAllowFrom ?? accountCfg.allowFrom;
	const threadSpec = resolveTelegramMessageThreadSpec(facts.message);
	const { resolvedThreadId, storeAllowFrom, groupAllowOverride, effectiveGroupAllow } = await resolveTelegramGroupAllowFromContext({
		cfg: auth.cfg,
		chatId: facts.chatId,
		accountId: auth.accountId,
		dmPolicy,
		allowFrom,
		senderId: facts.senderId,
		isGroup: facts.isGroup,
		threadSpec,
		groupAllowFrom,
		resolveTelegramGroupConfig: (chatId, messageThreadId, cfg) => {
			const telegramCfg = mergeTelegramAccountConfig(cfg, auth.accountId);
			return resolveTelegramScopedGroupConfig(telegramCfg, chatId, messageThreadId);
		}
	});
	const dmAllow = await resolveTelegramDmAllow({
		cfg: auth.cfg,
		groupAllowOverride,
		allowFrom,
		accountId: auth.accountId,
		senderId: facts.senderId,
		storeAllowFrom: facts.isGroup ? [] : storeAllowFrom,
		dmPolicy
	});
	const ownerAccess = resolveTelegramCommandAuthorization({
		cfg: auth.cfg,
		accountId: auth.accountId,
		chatId: facts.chatId,
		isGroup: facts.isGroup,
		threadSpec,
		senderId: facts.senderId,
		...facts.senderUsername !== void 0 ? { senderUsername: facts.senderUsername } : {}
	});
	return (await resolveTelegramCommandIngressAuthorization({
		accountId: auth.accountId,
		cfg: auth.cfg,
		dmPolicy,
		isGroup: facts.isGroup,
		chatId: facts.chatId,
		...resolvedThreadId !== void 0 ? { resolvedThreadId } : {},
		senderId: facts.senderId,
		effectiveDmAllow: dmAllow.effectiveAllow,
		effectiveGroupAllow,
		ownerAccess,
		eventKind: "message",
		allowTextCommands: true,
		hasControlCommand: true,
		modeWhenAccessGroupsOff: "allow",
		includeDmAllowForGroupCommands: false
	})).authorized;
}
//#endregion
//#region extensions/telegram/src/telegram-ingress-supersede.ts
function isRecognizedTelegramTextCommand(rawText, botUsername) {
	return maybeResolveTextAlias(normalizeCommandBody(rawText, botUsername ? { botUsername } : void 0)) != null;
}
/** Whether a bot_command entity is untargeted or addressed to the known bot identity. */
function isTelegramCommandTargetedAtBot(commandText, botUsername) {
	const trimmed = commandText.trim();
	if (!trimmed.startsWith("/")) return false;
	const normalized = normalizeCommandBody(trimmed, botUsername ? { botUsername } : void 0).trim();
	if (!normalized.startsWith("/") || normalized === "/") return false;
	return normalized === normalizeCommandBody(trimmed, { targetedCommandMode: "pre-identity" }).trim();
}
/** True when the update carries a bot_command entity addressed to this bot. */
function updateHasBotCommandEntityForBot(update, botUsername) {
	if (!update || typeof update !== "object") return false;
	const root = update;
	for (const key of [
		"message",
		"edited_message",
		"channel_post",
		"edited_channel_post"
	]) {
		const msg = root[key];
		if (!msg || typeof msg !== "object") continue;
		const message = msg;
		const body = typeof message.text === "string" ? message.text : typeof message.caption === "string" ? message.caption : "";
		for (const entities of [message.entities, message.caption_entities]) {
			if (!Array.isArray(entities)) continue;
			for (const entity of entities) {
				if (!entity || typeof entity !== "object") continue;
				const ent = entity;
				if (ent.type !== "bot_command") continue;
				if (ent.offset !== 0 || typeof ent.length !== "number") continue;
				if (isTelegramCommandTargetedAtBot(body.slice(ent.offset, ent.offset + ent.length), botUsername)) return true;
			}
		}
	}
	return false;
}
function extractUpdateText(update) {
	if (!update || typeof update !== "object") return "";
	const root = update;
	for (const key of [
		"message",
		"edited_message",
		"channel_post",
		"edited_channel_post"
	]) {
		const msg = root[key];
		if (msg && typeof msg === "object") {
			const text = msg.text;
			if (typeof text === "string") return text;
			const caption = msg.caption;
			if (typeof caption === "string") return caption;
		}
	}
	const callback = root.callback_query;
	if (callback && typeof callback === "object") {
		const data = callback.data;
		if (typeof data === "string") return data;
	}
	return "";
}
/**
* Drain-level supersede predicate over raw spooled payloads.
* Authorization is resolved from the new event's numeric sender via the same
* ingress command gate as the old fence (CommandAuthorized).
*/
function createShouldSupersedeTelegramSpooledPending(auth) {
	return async (newEvent, pendingEvent) => {
		const pendingUpdate = pendingEvent.payload.update;
		const newUpdate = newEvent.payload.update;
		if (isTelegramAmbientSpooledUpdate(pendingUpdate) && !isTelegramAmbientSpooledUpdate(newUpdate)) return await isTelegramSpooledUpdateSenderAuthorized(newUpdate, auth);
		const text = extractUpdateText(newUpdate);
		if (!text) return false;
		const commandOptions = auth.botUsername ? { botUsername: auth.botUsername } : void 0;
		const abortCommandOptions = auth.botUsername ? { botUsername: auth.botUsername } : { targetedCommandMode: "pre-identity" };
		if (isBtwRequestText(text, commandOptions) || isTelegramReadOnlyControlLaneText({
			rawText: text,
			...auth.botUsername ? { botUsername: auth.botUsername } : {}
		})) return false;
		const isAbort = isAbortRequestText(text, abortCommandOptions);
		const isCommand = isRecognizedTelegramTextCommand(text, auth.botUsername) || updateHasBotCommandEntityForBot(newUpdate, auth.botUsername);
		if (!isAbort && !isCommand) return false;
		return await isTelegramSpooledUpdateSenderAuthorized(newUpdate, auth);
	};
}
//#endregion
//#region extensions/telegram/src/telegram-ingress-drain.ts
const TELEGRAM_SPOOLED_HANDLER_TIMEOUT_ENV = "OPENCLAW_TELEGRAM_SPOOLED_HANDLER_TIMEOUT_MS";
const TELEGRAM_SPOOLED_DRAIN_START_LIMIT = 100;
const TELEGRAM_SPOOLED_DRAIN_SCAN_LIMIT = 1e3;
const TELEGRAM_SPOOLED_DRAIN_POLL_INTERVAL_MS = 500;
function resolveTelegramAdoptionStallTimeoutMs(params) {
	const candidates = [params.configured, Number(params.env?.[TELEGRAM_SPOOLED_HANDLER_TIMEOUT_ENV])];
	for (const candidate of candidates) {
		const timeoutMs = clampPositiveTimerTimeoutMs(candidate);
		if (timeoutMs !== void 0) return timeoutMs;
	}
	return DEFAULT_INGRESS_ADOPTION_STALL_MS;
}
function telegramSpooledLaneKey(update, botInfo) {
	return getTelegramSequentialKey({
		update,
		...botInfo ? { me: botInfo } : {}
	});
}
function inspectTelegramSpooledUpdate(update, botInfo, claimedLaneKey) {
	const updateId = resolveTelegramUpdateId$1(update);
	if (updateId === null) throw new TelegramIngressPayloadError("Telegram spooled update is missing numeric update_id.");
	const derivedLaneKey = telegramSpooledLaneKey(update, botInfo);
	const preservePreIdentityControlLane = botInfo !== void 0 && claimedLaneKey?.endsWith(":control") === true && claimedLaneKey !== derivedLaneKey && claimedLaneKey === telegramSpooledLaneKey(update);
	return {
		eventId: telegramQueueEventId(updateId),
		laneKey: preservePreIdentityControlLane ? claimedLaneKey : derivedLaneKey
	};
}
function isNonemptyTelegramCallbackValue(value) {
	return typeof value === "string" && value.trim().length > 0;
}
function isBoundedTelegramCallbackData(value) {
	return isNonemptyTelegramCallbackValue(value) && fitsTelegramCallbackData(value);
}
function canReconcileTelegramLegacyLane(params) {
	if (params.record.channelId !== "telegram" || params.record.accountId !== normalizeTelegramStateAccountId(params.accountId)) return false;
	const update = params.record.payload.update;
	if (!update || typeof update !== "object") return false;
	const candidate = update;
	const callback = candidate.callback_query;
	if (callback !== void 0) {
		if (!callback || typeof callback !== "object") return false;
		const senderId = callback.from?.id;
		const callbackMessage = callback.message;
		if (candidate.message !== void 0 || candidate.edited_message !== void 0 || !isNonemptyTelegramCallbackValue(callback.id) || !isBoundedTelegramCallbackData(callback.data) || !isNonemptyTelegramCallbackValue(callback.chat_instance) || callback.inline_message_id !== void 0 || typeof senderId !== "number" || !Number.isSafeInteger(senderId) || senderId <= 0 || callback.from?.is_bot !== false || !params.botInfo || callbackMessage?.from?.id !== params.botInfo.id || callbackMessage.from.is_bot !== true || callbackMessage.business_connection_id !== void 0 || callbackMessage.guest_query_id !== void 0 || callbackMessage.sender_chat !== void 0 || callbackMessage.direct_messages_topic !== void 0 || typeof callbackMessage.date !== "number" || !Number.isSafeInteger(callbackMessage.date) || callbackMessage.date <= 0 || typeof callbackMessage.message_id !== "number" || !Number.isSafeInteger(callbackMessage.message_id) || callbackMessage.message_id <= 0) return false;
	}
	const message = candidate.message ?? candidate.edited_message ?? callback?.message;
	if (message == null) return false;
	const chatId = message?.chat?.id;
	const chatType = message?.chat?.type;
	const threadId = message?.message_thread_id;
	const callbackData = typeof callback?.data === "string" ? callback.data : void 0;
	const typedApproval = parseTelegramApprovalCallbackData(callbackData);
	const isPrivateChat = chatType === "private" && typeof chatId === "number" && chatId > 0;
	const isGroupChat = (chatType === "group" || chatType === "supergroup") && typeof chatId === "number" && chatId < 0;
	const hasValidThreadId = typeof threadId === "number" && Number.isSafeInteger(threadId) && threadId > 0;
	const forumFlag = resolveTelegramMessageForumFlagHint({
		chatType: chatType === "channel" || chatType === "group" || chatType === "private" || chatType === "supergroup" ? chatType : void 0,
		isForum: typeof message.chat?.is_forum === "boolean" ? message.chat.is_forum : void 0,
		isTopicMessage: typeof message.is_topic_message === "boolean" ? message.is_topic_message : void 0
	}) ?? (typeof chatId === "number" ? getCachedTelegramForumFlag(chatId) : void 0);
	const isForumGroup = isGroupChat && forumFlag === true;
	if (typeof chatId !== "number" || !Number.isSafeInteger(chatId) || (typedApproval ? !isPrivateChat && !isGroupChat : !isPrivateChat && !isForumGroup) || !typedApproval && !hasValidThreadId && !isForumGroup || typedApproval && threadId !== void 0 && !hasValidThreadId) return false;
	const baseLaneKey = `telegram:${chatId}`;
	const legacyThreadId = isGroupChat ? resolveTelegramForumThreadId({
		isForum: forumFlag,
		messageThreadId: hasValidThreadId ? threadId : void 0
	}) : hasValidThreadId ? threadId : void 0;
	const topicLaneKey = legacyThreadId ? `${baseLaneKey}:topic:${legacyThreadId}` : void 0;
	const canonicalLaneKey = typedApproval ? `${baseLaneKey}:approval` : isForumGroup || params.botInfo?.has_topics_enabled === true ? topicLaneKey : baseLaneKey;
	const previousLaneKey = canonicalLaneKey === baseLaneKey ? topicLaneKey : baseLaneKey;
	return (typedApproval ? params.storedLaneKey === baseLaneKey || params.storedLaneKey === topicLaneKey : !hasTelegramApprovalCallbackPrefix(callbackData) && !hasTelegramQuestionCallbackPrefix(callbackData) && params.storedLaneKey === previousLaneKey) && params.derivedLaneKey === canonicalLaneKey && telegramSpooledLaneKey(update, params.botInfo) === canonicalLaneKey;
}
/**
* Shared polling/webhook monitor over Telegram's channel-owned durable spool.
*
* The transports keep durable admission because offset advancement and webhook
* acknowledgement depend on that exact boundary; requestDrain() bridges the
* committed spool append into the shared pump.
*/
function createTelegramIngressMonitor(params) {
	return createChannelIngressMonitor({
		queue: params.queue,
		inspect: (update, context) => {
			if (context.phase === "admission" && typeof update === "object" && update !== null && isEligibleTelegramPollAnswerUpdate(update)) prepareTelegramPollAnswerContext({
				update,
				accountId: params.accountId
			});
			return inspectTelegramSpooledUpdate(update, params.botInfo, context.phase === "claim" ? context.claimedLaneKey : void 0);
		},
		payload: {
			version: 1,
			serialize: (update, { receivedAt }) => {
				const updateId = resolveTelegramUpdateId$1(update);
				if (updateId === null) throw new TelegramIngressPayloadError("Telegram spooled update is missing numeric update_id.");
				const preparedPollAnswer = typeof update === "object" && update !== null ? getPreparedTelegramPollAnswer(update) : void 0;
				return {
					version: 1,
					updateId,
					receivedAt,
					update,
					...preparedPollAnswer ? { preparedPollAnswer } : {}
				};
			},
			deserialize: (payload) => {
				const update = payload.update;
				if (payload.preparedPollAnswer && typeof update === "object" && update !== null) recordPreparedTelegramPollAnswer(update, payload.preparedPollAnswer);
				return update;
			},
			encode: ({ body }) => body,
			decode: (payload) => ({
				version: payload.version,
				body: payload
			}),
			createClaimError: (kind, claim) => new TelegramIngressPayloadError(kind === "invalid-version" ? `Telegram ingress row ${claim.id} has an unsupported payload version.` : `Telegram ingress row ${claim.id} changed update identity.`)
		},
		deliver: async (update, lifecycle) => {
			const telegramLifecycle = lifecycle;
			try {
				const result = await runWithTelegramSpooledReplayUpdate(update, async () => {
					await settleTelegramPollAnswerContext({
						update,
						accountId: params.accountId
					});
					return await params.dispatch(update, telegramLifecycle);
				}, telegramLifecycle);
				const outcome = result.value;
				if (outcome && typeof outcome === "object" && "kind" in outcome) {
					if (outcome.kind === "failed-retryable") return {
						kind: "failed-retryable",
						error: outcome.error
					};
					if (outcome.kind === "completed" || outcome.kind === "skipped") {
						await lifecycle.onAdopted();
						return { kind: "completed" };
					}
				}
				const participant = result.deferredWork;
				if (participant) {
					let abortedWhilePending = participant.wasOwnerAbortedWhilePending();
					const onAbort = () => {
						if (!participant.isSettled()) abortedWhilePending = true;
					};
					telegramLifecycle.abortSignal.addEventListener("abort", onAbort, { once: true });
					const removeAbortListener = () => {
						telegramLifecycle.abortSignal.removeEventListener("abort", onAbort);
					};
					const settleAfterOwnerAbort = async (error) => {
						if (error !== void 0 && resolveTelegramIngressNonRetryableFailure(error)?.reason === "dispatch-dedupe-rollback-failed") {
							await telegramLifecycle.onFailed(error);
							return;
						}
						await telegramLifecycle.onCancelled();
					};
					participant.task.then(async (terminal) => {
						removeAbortListener();
						if (abortedWhilePending) {
							await settleAfterOwnerAbort(terminal.kind === "failed-retryable" ? terminal.error : void 0);
							return;
						}
						if (terminal.kind === "failed-retryable") {
							await telegramLifecycle.onFailed(terminal.error);
							return;
						}
						await lifecycle.onAdopted();
					}, async (error) => {
						removeAbortListener();
						if (abortedWhilePending) {
							await settleAfterOwnerAbort(error);
							return;
						}
						await telegramLifecycle.onFailed(error instanceof Error ? error : new Error(String(error)));
					}).catch((error) => {
						params.onLog?.(`telegram ingress: deferred settlement failed for update ${resolveTelegramUpdateId$1(update) ?? "unknown"}: ${String(error)}`);
					});
					return { kind: "deferred" };
				}
				if (!participant) params.onLog?.(`telegram ingress: update ${resolveTelegramUpdateId$1(update) ?? "unknown"} completed without a recorded processing outcome`);
				await lifecycle.onAdopted();
				return { kind: "completed" };
			} catch (error) {
				return {
					kind: "failed-retryable",
					error
				};
			}
		},
		pollIntervalMs: params.pollIntervalMs ?? TELEGRAM_SPOOLED_DRAIN_POLL_INTERVAL_MS,
		retention: {
			completedMaxEntries: 1e3,
			failedMaxEntries: 1e3
		},
		drain: {
			deferredLaneOccupancy: "release",
			adoptionStallTimeoutMs: params.adoptionStallTimeoutMs ?? 3e5,
			orderBy: "id",
			scanLimit: TELEGRAM_SPOOLED_DRAIN_SCAN_LIMIT,
			startLimit: TELEGRAM_SPOOLED_DRAIN_START_LIMIT,
			resolveNonRetryableFailure: resolveTelegramIngressNonRetryableFailure,
			shouldSupersedePending: createShouldSupersedeTelegramSpooledPending({
				cfg: params.cfg,
				accountId: params.accountId,
				...params.botInfo?.username ? { botUsername: params.botInfo.username } : {}
			}),
			deriveLaneKey: (record) => telegramSpooledLaneKey(record.payload.update, params.botInfo),
			reconcileStoredLaneKey: (record, storedLaneKey, derivedLaneKey) => canReconcileTelegramLegacyLane({
				record,
				storedLaneKey,
				derivedLaneKey,
				accountId: params.accountId,
				botInfo: params.botInfo
			}),
			...params.onLog ? { onLog: params.onLog } : {}
		},
		...params.abortSignal ? { abortSignal: params.abortSignal } : {},
		admissionMode: "while-running",
		createStoppedError: () => /* @__PURE__ */ new Error("Telegram ingress monitor is stopped."),
		...params.onDurableAdmission ? { onDurableAdmission: params.onDurableAdmission } : {},
		...params.onError ? { onError: params.onError } : {}
	});
}
//#endregion
//#region extensions/telegram/src/telegram-ingress-drain-factory.ts
/**
* One monitor for polling + webhook: channel-owned append, shared claim →
* dispatch with turnAdoptionLifecycle → complete at adoption.
*/
function createTelegramTransportIngressMonitor(params) {
	const queue = openTelegramIngressQueue(params.spoolDir);
	const adoptionStallTimeoutMs = resolveTelegramAdoptionStallTimeoutMs({
		configured: params.adoptionStallTimeoutMs,
		env: process.env
	});
	return createTelegramIngressMonitor({
		queue,
		cfg: params.cfg,
		accountId: params.accountId,
		botInfo: params.botInfo,
		adoptionStallTimeoutMs,
		...params.pollIntervalMs === void 0 ? {} : { pollIntervalMs: params.pollIntervalMs },
		...params.onLog ? { onLog: params.onLog } : {},
		...params.onError ? { onError: params.onError } : {},
		...params.abortSignal ? { abortSignal: params.abortSignal } : {},
		onDurableAdmission: (update, context) => {
			if (!isRecord(update)) return;
			const callbackQuery = update.callback_query;
			if (!isRecord(callbackQuery)) return;
			const callbackQueryId = callbackQuery.id;
			if (typeof callbackQueryId !== "string" || callbackQueryId.trim().length === 0) return;
			startTelegramCallbackQueryAnswer(params.bot, callbackQueryId, context.isNew);
		},
		dispatch: async (update, lifecycle) => {
			if (params.dispatchUpdate) return await params.dispatchUpdate(update, lifecycle);
			const { result } = await runWithTelegramUpdateProcessingFrame(async () => {
				await params.bot.handleUpdate(update);
			});
			return result;
		}
	});
}
//#endregion
export { resolveTelegramAdoptionStallTimeoutMs as n, createTelegramBot as r, createTelegramTransportIngressMonitor as t };
