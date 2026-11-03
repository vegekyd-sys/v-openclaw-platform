// v-codex-prepersisted-prompt-evidence-v1
import { i as readUpstreamUserText, n as attachUpstreamUserText, r as readMirrorIdentity, t as attachCodexMirrorIdentity } from "./upstream-prompt-provenance-LphB8slG.js";
import { asOptionalRecord, normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import path from "node:path";
import { deliverAgentHarnessUserInputPrompt, embeddedAgentLog, formatErrorMessage, projectAgentHarnessTranscriptMessageForDisplay, runAgentHarnessBeforeMessageWriteHook } from "openclaw/plugin-sdk/agent-harness-runtime";
import { createHash } from "node:crypto";
import fsSync from "node:fs";
import { truncateUtf8Prefix } from "openclaw/plugin-sdk/text-utility-runtime";
import { withCodexSessionTranscriptMirrorWriteLock } from "openclaw/plugin-sdk/codex-session-transcript-runtime";
import { publishSessionTranscriptUpdateByIdentity } from "openclaw/plugin-sdk/session-transcript-runtime";
import { Buffer } from "node:buffer";
//#region extensions/codex/src/session-catalog-home-id.ts
function canonicalCodexCatalogHome(value) {
	const resolved = path.resolve(value);
	try {
		return fsSync.realpathSync.native(resolved);
	} catch {
		return resolved;
	}
}
/** One canonical identity for catalog discovery and durable ownership rows. */
function codexCatalogHomeId(codexHome) {
	return createHash("sha256").update("openclaw:codex-session-catalog-home:v1\0").update(canonicalCodexCatalogHome(codexHome)).digest("hex");
}
//#endregion
//#region extensions/codex/src/app-server/transcript-history-projection.ts
const CODEX_HISTORY_IMPORT_MAX_MESSAGES = 200;
const CODEX_HISTORY_IMPORT_MAX_BYTES = 524288;
const CODEX_HISTORY_IMPORT_MAX_MESSAGE_BYTES = 65536;
const CODEX_HISTORY_TRUNCATION_SUFFIX = "\n\n[Message truncated during Codex history import.]";
const CODEX_HISTORY_ASSISTANT_API = "openai-chatgpt-responses";
const CODEX_HISTORY_ASSISTANT_PROVIDER = "openai";
const CODEX_HISTORY_ASSISTANT_MODEL = "native-history";
const CODEX_HISTORY_ZERO_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0
	}
};
function normalizeImportedHistoryText(value) {
	if (typeof value !== "string") return;
	const text = value.trim();
	if (!text) return;
	if (Buffer.byteLength(text, "utf8") <= CODEX_HISTORY_IMPORT_MAX_MESSAGE_BYTES) return text;
	const suffixBytes = Buffer.byteLength(CODEX_HISTORY_TRUNCATION_SUFFIX, "utf8");
	const contentLimitBytes = Math.max(0, CODEX_HISTORY_IMPORT_MAX_MESSAGE_BYTES - suffixBytes);
	return `${truncateUtf8Prefix(text, contentLimitBytes)}${CODEX_HISTORY_TRUNCATION_SUFFIX}`;
}
function projectCodexUserItemText(item) {
	if (!Array.isArray(item.content)) return;
	const parts = [];
	for (const value of item.content) {
		if (!value || typeof value !== "object" || Array.isArray(value)) continue;
		const input = value;
		if (input.type === "text") {
			const text = normalizeImportedHistoryText(input.text);
			if (text) parts.push(text);
			continue;
		}
		if (input.type === "image" || input.type === "localImage") {
			parts.push("[Image attachment]");
			continue;
		}
		if (input.type === "audio" || input.type === "localAudio" || input.type === "local_audio") parts.push("[Audio attachment]");
		if (input.type === "skill" || input.type === "mention") {
			const name = normalizeOptionalString(input.name);
			if (name) parts.push(`${input.type === "skill" ? "$" : "@"}${name}`);
		}
	}
	return normalizeImportedHistoryText(parts.join("\n"));
}
function selectTurnsThroughBoundary(thread, throughTurnId) {
	if (throughTurnId === null) return [];
	const turns = thread.turns ?? [];
	const boundaryIndex = turns.findIndex((turn) => turn.id === throughTurnId);
	if (boundaryIndex < 0) throw new Error(`Codex history boundary turn not found: ${throughTurnId}`);
	const boundary = turns[boundaryIndex];
	if (boundary?.status !== "completed" && boundary?.status !== "interrupted" && boundary?.status !== "failed") throw new Error(`Codex history boundary turn is not terminal: ${throughTurnId}`);
	return turns.slice(0, boundaryIndex + 1);
}
function projectCodexThreadHistory(params) {
	const projected = [];
	const threadTimestamp = typeof params.thread.createdAt === "number" && Number.isFinite(params.thread.createdAt) ? params.thread.createdAt * 1e3 : params.importedAt;
	let itemOffset = 0;
	for (const turn of selectTurnsThroughBoundary(params.thread, params.throughTurnId)) for (const value of turn.items) {
		const item = value;
		const itemId = normalizeOptionalString(item.id);
		const identity = `${turn.id}:${itemId ?? itemOffset}`;
		const timestampSeconds = item.type === "agentMessage" ? turn.completedAt ?? turn.startedAt : turn.startedAt ?? turn.completedAt;
		const timestamp = typeof timestampSeconds === "number" && Number.isFinite(timestampSeconds) ? timestampSeconds * 1e3 + itemOffset : threadTimestamp + itemOffset;
		const text = item.type === "userMessage" ? projectCodexUserItemText(item) : item.type === "agentMessage" ? normalizeImportedHistoryText(item.text) : void 0;
		const role = item.type === "userMessage" ? "user" : item.type === "agentMessage" ? "assistant" : void 0;
		itemOffset += 1;
		if (!text || !role) continue;
		const phase = item.phase === "commentary" || item.phase === "final_answer" ? item.phase : void 0;
		const asyncDelivery = item.delivery === "async";
		const message = role === "assistant" ? attachCodexMirrorIdentity({
			role,
			content: [{
				type: "text",
				text
			}],
			api: CODEX_HISTORY_ASSISTANT_API,
			provider: normalizeOptionalString(params.modelProvider) ?? normalizeOptionalString(params.thread.modelProvider) ?? CODEX_HISTORY_ASSISTANT_PROVIDER,
			model: CODEX_HISTORY_ASSISTANT_MODEL,
			usage: CODEX_HISTORY_ZERO_USAGE,
			stopReason: turn.status === "interrupted" ? "aborted" : turn.status === "failed" ? "error" : "stop",
			...turn.status === "failed" && turn.error?.message ? { errorMessage: turn.error.message } : {},
			...phase ? { phase } : {},
			...asyncDelivery && itemId ? { openclawAsyncDelivery: { itemId } } : {},
			timestamp
		}, identity) : attachCodexMirrorIdentity({
			role,
			content: text,
			timestamp
		}, identity);
		projected.push({
			message,
			responseItem: {
				type: "message",
				role,
				content: [{
					type: role === "assistant" ? "output_text" : "input_text",
					text
				}],
				...role === "assistant" && phase ? { phase } : {}
			},
			textBytes: Buffer.byteLength(text, "utf8")
		});
	}
	return projected;
}
function selectBoundedCodexHistoryTail(projected) {
	const selected = [];
	let selectedBytes = 0;
	for (let index = projected.length - 1; index >= 0; index -= 1) {
		const candidate = projected[index];
		if (!candidate) continue;
		if (selected.length >= CODEX_HISTORY_IMPORT_MAX_MESSAGES || selectedBytes + candidate.textBytes > CODEX_HISTORY_IMPORT_MAX_BYTES) break;
		selected.push(candidate);
		selectedBytes += candidate.textBytes;
	}
	return selected.toReversed();
}
/** Projects one terminal Codex history prefix into transcript and Responses API items. */
function projectBoundedCodexThreadHistory(params) {
	const projected = projectCodexThreadHistory({
		thread: params.thread,
		throughTurnId: params.throughTurnId,
		importedAt: params.importedAt,
		...params.modelProvider ? { modelProvider: params.modelProvider } : {}
	});
	const selected = selectBoundedCodexHistoryTail(projected);
	return {
		importedMessages: selected.length,
		omittedMessages: projected.length - selected.length,
		responseItems: selected.filter(({ message }) => message.role !== "assistant" || message.stopReason !== "aborted" && message.stopReason !== "error" && !("openclawAsyncDelivery" in message)).map(({ responseItem }) => responseItem),
		transcriptMessages: selected.map(({ message }) => message)
	};
}
/** Projects only visible local user/assistant messages through the same bounded history policy. */
function projectBoundedCodexVisibleSessionHistory(entries) {
	const projected = [];
	for (const entry of entries) {
		if (entry.role !== "user" && entry.role !== "assistant" || !("content" in entry.message)) continue;
		if (entry.role === "assistant" && ("stopReason" in entry.message && (entry.message.stopReason === "aborted" || entry.message.stopReason === "error") || "openclawAsyncDelivery" in entry.message)) continue;
		const content = entry.message.content;
		const text = normalizeImportedHistoryText(typeof content === "string" ? content : Array.isArray(content) ? content.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n") : void 0);
		if (!text) continue;
		projected.push({
			message: entry.message,
			responseItem: {
				type: "message",
				role: entry.role,
				content: [{
					type: entry.role === "assistant" ? "output_text" : "input_text",
					text
				}]
			},
			textBytes: Buffer.byteLength(text, "utf8")
		});
	}
	return selectBoundedCodexHistoryTail(projected).map(({ responseItem }) => responseItem);
}
//#endregion
//#region extensions/codex/src/app-server/transcript-mirror-attestation.ts
const MIRROR_ORIGIN_META_KEY = "mirrorOrigin";
const MIRROR_SOURCE_FINGERPRINT_META_KEY = "mirrorSourceFingerprint";
const CODEX_APP_SERVER_MIRROR_ORIGIN = "codex-app-server";
const CODEX_META_KEY = "__openclaw";
function applyCodexTranscriptTaint(message, state) {
	if (message.role === "user") {
		state.tainted = false;
		return message;
	}
	const existing = CODEX_META_KEY in message ? message[CODEX_META_KEY] : void 0;
	const metadata = asOptionalRecord(existing);
	state.tainted ||= metadata?.turnTainted === true || metadata?.resultContentSource === "network";
	return message.role === "assistant" && state.tainted ? {
		...message,
		__openclaw: {
			...metadata,
			turnTainted: true
		}
	} : message;
}
function attachCodexMirrorAttestation(message, sourceFingerprint) {
	const existing = CODEX_META_KEY in message ? message[CODEX_META_KEY] : void 0;
	const baseMeta = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
	return {
		...message,
		[CODEX_META_KEY]: {
			...baseMeta,
			[MIRROR_ORIGIN_META_KEY]: CODEX_APP_SERVER_MIRROR_ORIGIN,
			...sourceFingerprint ? { [MIRROR_SOURCE_FINGERPRINT_META_KEY]: sourceFingerprint } : {}
		}
	};
}
function attachCodexMirrorRunId(message, runId, terminal = false) {
	const existing = CODEX_META_KEY in message ? message[CODEX_META_KEY] : void 0;
	const { runTerminal: _staleTerminal, ...current } = asOptionalRecord(existing) ?? {};
	return {
		...message,
		[CODEX_META_KEY]: {
			...current,
			runId,
			...terminal ? { runTerminal: true } : {}
		}
	};
}
function hasCodexMirrorOrigin(message) {
	const meta = CODEX_META_KEY in message ? message[CODEX_META_KEY] : void 0;
	return asOptionalRecord(meta)?.[MIRROR_ORIGIN_META_KEY] === CODEX_APP_SERVER_MIRROR_ORIGIN;
}
function readCodexMirrorSourceFingerprint(message) {
	const meta = CODEX_META_KEY in message ? message[CODEX_META_KEY] : void 0;
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) return;
	const value = meta[MIRROR_SOURCE_FINGERPRINT_META_KEY];
	return typeof value === "string" && value ? value : void 0;
}
function serializeCodexMirrorSourceEvidence(message) {
	const content = "content" in message ? message.content : void 0;
	return JSON.stringify({
		role: message.role,
		content,
		...message.role === "user" ? { upstreamUserText: readUpstreamUserText(message) } : {},
		...message.role === "toolResult" ? {
			toolCallId: message.toolCallId,
			toolName: message.toolName,
			isError: message.isError
		} : {}
	});
}
function fingerprintCodexMirrorSourceMessage(message) {
	return createHash("sha256").update(serializeCodexMirrorSourceEvidence(message)).digest("hex").slice(0, 32);
}
//#endregion
//#region extensions/codex/src/app-server/user-prompt-message.ts
function buildSenderLabel(params) {
	const label = params.senderName ?? params.senderUsername ?? params.senderE164 ?? params.senderId;
	if (!label) return;
	return !params.senderId || label.includes(params.senderId) ? label : `${label} (${params.senderId})`;
}
function buildFromPrepared(params, preparedUserMessage) {
	const senderId = normalizeOptionalString(params.senderId);
	const senderName = normalizeOptionalString(params.senderName);
	const senderUsername = normalizeOptionalString(params.senderUsername);
	const senderE164 = normalizeOptionalString(params.senderE164);
	const senderLabel = buildSenderLabel({
		senderId,
		senderName,
		senderUsername,
		senderE164
	});
	const sourceChannel = normalizeOptionalString(params.inputProvenance?.sourceChannel ?? params.messageChannel ?? params.messageProvider);
	return {
		role: "user",
		timestamp: Date.now(),
		...params.inputProvenance ? { provenance: params.inputProvenance } : {},
		...sourceChannel ? { sourceChannel } : {},
		...senderId ? { senderId } : {},
		...senderName ? { senderName } : {},
		...senderUsername ? { senderUsername } : {},
		...senderE164 ? { senderE164 } : {},
		...senderLabel ? { senderLabel } : {},
		...preparedUserMessage ?? { content: params.transcriptPrompt ?? params.prompt }
	};
}
function buildCodexUserPromptMessage(params) {
	return buildFromPrepared(params, params.userTurnTranscriptRecorder?.message);
}
function buildCodexUpstreamPromptMessage(params, identity, upstreamUserText) {
	const message = attachCodexMirrorIdentity(buildCodexUserPromptMessage(params), identity);
	return upstreamUserText ? attachUpstreamUserText(message, upstreamUserText) : message;
}
function promptSnapshot(params, turnId, upstreamUserText) {
	return params.suppressNextUserMessagePersistence ? [] : [buildCodexUpstreamPromptMessage(params, `${turnId}:prompt`, upstreamUserText)];
}
async function buildResolvedCodexUserPromptMessage(params) {
	return buildFromPrepared(params, await params.userTurnTranscriptRecorder?.resolveMessage() ?? params.userTurnTranscriptRecorder?.message);
}
//#endregion
//#region extensions/codex/src/app-server/transcript-mirror.ts
function isMirroredAgentMessage(message) {
	return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
}
function readMirroredAssistantText(message) {
	if (message?.role !== "assistant") return;
	return message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") || void 0;
}
/** Imports a bounded, user-visible Codex history tail into a new OpenClaw transcript. */
async function importCodexThreadHistoryToTranscript(params) {
	const { transcriptMessages, importedMessages, omittedMessages } = projectBoundedCodexThreadHistory({
		thread: params.thread,
		throughTurnId: params.throughTurnId,
		importedAt: Date.now(),
		...params.modelProvider ? { modelProvider: params.modelProvider } : {}
	});
	if (transcriptMessages.length > 0) await mirror({
		assertCurrent: params.assertCurrent,
		storePath: params.storePath,
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		...params.agentId ? { agentId: params.agentId } : {},
		...params.cwd ? { cwd: params.cwd } : {},
		...params.config ? { config: params.config } : {},
		messages: transcriptMessages,
		idempotencyScope: `codex-app-server:${params.thread.id}:history`
	});
	return {
		importedMessages,
		omittedMessages
	};
}
async function mirrorBestEffort(params) {
	if (!params.params.sessionTarget) return {
		assistantTranscriptOwned: false,
		mirroredMessages: []
	};
	try {
		const messages = await resolveFinalCodexMirrorMessages({
			params: params.params,
			messagesSnapshot: params.result.messagesSnapshot,
			turnId: params.turnId
		});
		const mirrorResult = await mirror({
			agentId: params.agentId,
			sessionKey: params.sessionKey,
			sessionId: params.params.sessionId,
			storePath: params.params.sessionTarget?.storePath,
			cwd: params.cwd,
			messages,
			idempotencyScope: `codex-app-server:${params.threadId}`,
			runId: params.params.runId,
			runMirrorIdentityPrefix: `${params.turnId}:`,
			terminalAssistantOwner: {
				mirrorIdentity: `${params.turnId}:assistant`,
				runId: params.params.runId
			},
			prepareAssistantTranscriptMessage: params.params.prepareAssistantTranscriptMessage,
			config: params.params.config
		});
		for (const receipt of mirrorResult.userMessageReceipts) try {
			params.notifyUserMessagePersisted(receipt.message, receipt.anchor);
		} catch (error) {
			embeddedAgentLog.warn("failed to notify codex app-server user-message persistence", { error: formatErrorMessage(error) });
		}
		const expectedFingerprints = new Map(messages.flatMap((message) => {
			if (!isMirroredAgentMessage(message)) return [];
			const identity = readMirrorIdentity(message);
			return identity ? [[identity, fingerprintCodexMirrorSourceMessage(message)]] : [];
		}));
		const mirroredMessages = mirrorResult.messagesPresent.filter((message) => {
			const identity = readMirrorIdentity(message);
			return identity !== void 0 && readCodexMirrorSourceFingerprint(message) === expectedFingerprints.get(identity);
		});
		const assistantMirrorIdentity = `${params.turnId}:assistant`;
		const assistantTranscriptMessage = mirroredMessages.find((message) => readMirrorIdentity(message) === assistantMirrorIdentity);
		const assistantTranscriptOwned = Boolean(assistantTranscriptMessage && mirrorResult.assistantMirrorIdentitiesOwned.includes(assistantMirrorIdentity));
		const assistantTranscriptIdempotencyKey = normalizeOptionalString(assistantTranscriptMessage?.idempotencyKey);
		const terminalMessage = mirroredMessages.at(-1);
		const terminalMirrorIdentity = terminalMessage ? readMirrorIdentity(terminalMessage) : void 0;
		const terminalAnchor = (terminalMirrorIdentity ? mirrorResult.anchorsByMirrorIdentity.get(terminalMirrorIdentity) : void 0) ?? params.params.userTurnTranscriptRecorder?.getAdmissionReceipt();
		return {
			assistantTranscriptOwned,
			...assistantTranscriptIdempotencyKey ? { assistantTranscriptIdempotencyKey } : {},
			...terminalAnchor ? { terminalAnchor } : {},
			mirroredMessages,
			persistedUserMessages: mirrorResult.userMessagesPresent
		};
	} catch (error) {
		embeddedAgentLog.warn("failed to mirror codex app-server transcript", {
			error: formatErrorMessage(error),
			runId: params.params.runId,
			sessionId: params.params.sessionId
		});
		return {
			assistantTranscriptOwned: false,
			mirroredMessages: []
		};
	}
}
async function resolveFinalCodexMirrorMessages(params) {
	if (params.params.suppressNextUserMessagePersistence || !params.params.userTurnTranscriptRecorder) return params.messagesSnapshot;
	const promptSnapshot = params.messagesSnapshot.find((message) => message.role === "user");
	const resolvedBase = attachCodexMirrorIdentity(await buildResolvedCodexUserPromptMessage(params.params), `${params.turnId}:prompt`);
	const upstreamUserText = readUpstreamUserText(promptSnapshot);
	const resolvedPrompt = upstreamUserText ? attachUpstreamUserText(resolvedBase, upstreamUserText) : resolvedBase;
	const firstUserIndex = params.messagesSnapshot.findIndex((message) => message.role === "user");
	if (firstUserIndex === -1) return [resolvedPrompt, ...params.messagesSnapshot];
	const messages = params.messagesSnapshot.slice();
	messages[firstUserIndex] = resolvedPrompt;
	return messages;
}
function createCodexAppServerUserMessagePersistenceNotifier(runParams) {
	let notified = false;
	return (message, anchor) => {
		if (notified) return;
		notified = true;
		runParams.userTurnTranscriptRecorder?.markRuntimePersisted(message, anchor);
		try {
			runParams.onUserMessagePersisted?.(message);
		} catch (error) {
			embeddedAgentLog.warn("codex app-server user persistence notification failed", { error: formatErrorMessage(error) });
		}
	};
}
async function mirrorPromptAtTurnStartBestEffort(params) {
	if (params.params.suppressNextUserMessagePersistence || !params.params.sessionTarget) return;
	try {
		const mirrorPromise = (async () => {
			const userPromptMessage = projectAgentHarnessTranscriptMessageForDisplay({
				hidden: params.params.trigger === "memory",
				message: attachUpstreamUserText(attachCodexMirrorIdentity(await buildResolvedCodexUserPromptMessage(params.params), `${params.turnId}:prompt`), params.upstreamUserText)
			});
			if (params.params.userTurnTranscriptRecorder?.getAdmissionReceipt()) {
				const annotate = params.params.hostCapabilities.annotateCurrentUserTurn;
				if (!annotate || userPromptMessage.role !== "user") throw new Error("current host admission is unavailable for native prompt annotation");
				await annotate({
					mirrorIdentity: `${params.turnId}:prompt`,
					upstreamUserText: params.upstreamUserText,
					mirrorOrigin: "codex-app-server",
					mirrorSourceFingerprint: fingerprintCodexMirrorSourceMessage(userPromptMessage)
				});
			}
			const mirrorResult = await mirror({
				assertCurrent: params.params.hostCapabilities.assertActive,
				agentId: params.agentId,
				sessionKey: params.sessionKey,
				sessionId: params.params.sessionId,
				storePath: params.params.sessionTarget?.storePath,
				cwd: params.cwd,
				messages: [userPromptMessage],
				idempotencyScope: `codex-app-server:${params.threadId}`,
				runId: params.params.runId,
				runMirrorIdentityPrefix: `${params.turnId}:`,
				config: params.params.config
			});
			for (const receipt of mirrorResult.userMessageReceipts) params.notifyUserMessagePersisted(receipt.message, receipt.anchor);
		})();
		params.params.userTurnTranscriptRecorder?.markRuntimePersistencePending(mirrorPromise);
		await mirrorPromise;
	} catch (error) {
		embeddedAgentLog.warn("failed to mirror codex app-server prompt at turn start", {
			error: formatErrorMessage(error),
			runId: params.params.runId,
			sessionId: params.params.sessionId
		});
	}
}
function fingerprintMirrorMessageContent(message) {
	const payload = JSON.stringify({
		role: message.role,
		content: message.content
	});
	return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
function buildMirrorDedupeIdentity(message) {
	return readMirrorIdentity(message) || `${message.role}:${fingerprintMirrorMessageContent(message)}`;
}
async function mirror(params) {
	const messages = params.messages.filter(isMirroredAgentMessage);
	if (messages.length === 0) return {
		assistantMirrorIdentitiesAppended: [],
		assistantMirrorIdentitiesOwned: [],
		anchorsByMirrorIdentity: /* @__PURE__ */ new Map(),
		messagesPresent: [],
		userMessageReceipts: [],
		userMessagesPresent: []
	};
	const candidates = messages.map((message) => {
		const dedupeIdentity = buildMirrorDedupeIdentity(message);
		const sourceFingerprint = fingerprintCodexMirrorSourceMessage(message);
		return {
			dedupeIdentity,
			idempotencyKey: (message.role === "user" ? normalizeOptionalString("idempotencyKey" in message ? message.idempotencyKey : void 0) : void 0) ?? (params.idempotencyScope ? `${params.idempotencyScope}:${dedupeIdentity}` : void 0),
			message,
			sourceFingerprint
		};
	});
	const candidateIdempotencyKeys = candidates.flatMap(({ idempotencyKey }) => idempotencyKey ? [idempotencyKey] : []);
	const transcriptTarget = resolveCodexMirrorTranscriptTarget(params);
	params.assertCurrent?.();
	const mirrorBatch = await withCodexSessionTranscriptMirrorWriteLock({
		...transcriptTarget,
		config: params.config
	}, async (transcript) => {
		params.assertCurrent?.();
		const nextAppendedUpdates = [];
		const nextAssistantMirrorIdentitiesAppended = /* @__PURE__ */ new Set();
		const nextAssistantMirrorIdentitiesOwned = /* @__PURE__ */ new Set();
		const nextAnchorsByMirrorIdentity = /* @__PURE__ */ new Map();
		const nextMessagesPresent = [];
		const nextUserMessageReceipts = [];
		const nextUserMessagesPresent = [];
		const mirrorFacts = await transcript.readMessageFacts({ idempotencyKeys: candidateIdempotencyKeys });
		params.assertCurrent?.();
		for (const { dedupeIdentity, idempotencyKey, message, sourceFingerprint } of candidates) {
			const mirrorIdentity = readMirrorIdentity(message);
			const ownsRun = Boolean(params.runId && (!params.runMirrorIdentityPrefix || mirrorIdentity?.startsWith(params.runMirrorIdentityPrefix)));
			const terminalOwner = params.terminalAssistantOwner;
			const ownsTerminal = Boolean(ownsRun && terminalOwner && mirrorIdentity === terminalOwner.mirrorIdentity);
			const transcriptMessage = {
				...attachCodexMirrorAttestation(ownsRun && params.runId ? attachCodexMirrorRunId(message, params.runId, ownsTerminal) : message, sourceFingerprint),
				...idempotencyKey ? { idempotencyKey } : {}
			};
			if (idempotencyKey && mirrorFacts.existingIdempotencyKeys.has(idempotencyKey)) {
				const persistedMessage = mirrorFacts.messagesByIdempotencyKey.get(idempotencyKey);
				const persistedAnchor = mirrorFacts.anchorsByIdempotencyKey.get(idempotencyKey);
				if (persistedMessage && isMirroredAgentMessage(persistedMessage)) {
					nextMessagesPresent.push(persistedMessage);
					if (persistedMessage.role === "user") {
						nextUserMessagesPresent.push(persistedMessage);
						if (persistedAnchor) nextUserMessageReceipts.push({
							anchor: persistedAnchor,
							message: persistedMessage
						});
					}
				}
				if (persistedAnchor) nextAnchorsByMirrorIdentity.set(dedupeIdentity, persistedAnchor);
				if (message.role === "assistant") nextAssistantMirrorIdentitiesOwned.add(dedupeIdentity);
				continue;
			}
			const nextMessage = runAgentHarnessBeforeMessageWriteHook({
				message: transcriptMessage,
				agentId: params.agentId,
				sessionKey: params.sessionKey,
				skipBeforeMessageWriteHooks: params.skipBeforeMessageWriteHooks,
				prepareAssistantTranscriptMessage: ownsTerminal ? params.prepareAssistantTranscriptMessage : void 0
			});
			if (!nextMessage) {
				if (message.role === "assistant") nextAssistantMirrorIdentitiesOwned.add(dedupeIdentity);
				continue;
			}
			let messageToAppend = idempotencyKey ? {
				...attachCodexMirrorAttestation(nextMessage, sourceFingerprint),
				idempotencyKey
			} : attachCodexMirrorAttestation(nextMessage, sourceFingerprint);
			if (mirrorIdentity) messageToAppend = attachCodexMirrorIdentity(messageToAppend, mirrorIdentity);
			if (ownsRun && params.runId) messageToAppend = attachCodexMirrorRunId(messageToAppend, params.runId, ownsTerminal);
			if (message.role === "assistant" && message.openclawAsyncDelivery) messageToAppend = Object.assign(messageToAppend, { openclawAsyncDelivery: { itemId: message.openclawAsyncDelivery.itemId } });
			messageToAppend = projectAgentHarnessTranscriptMessageForDisplay({
				hidden: message.display === false,
				message: messageToAppend
			});
			params.assertCurrent?.();
			const { messageSeq, result: appended } = await transcript.appendMessageWithMessageSequence({
				message: messageToAppend,
				...params.assertCurrent ? { prepareMessageAfterIdempotencyCheck: (preparedMessage) => {
					params.assertCurrent?.();
					return preparedMessage;
				} } : {},
				idempotencyLookup: "scan",
				cwd: params.cwd
			});
			params.assertCurrent?.();
			if (!appended) continue;
			const { messageId, message: appendedMessage } = appended;
			if (isMirroredAgentMessage(appendedMessage)) {
				nextMessagesPresent.push(appendedMessage);
				if (idempotencyKey) mirrorFacts.messagesByIdempotencyKey.set(idempotencyKey, appendedMessage);
			}
			if (message.role === "assistant") nextAssistantMirrorIdentitiesOwned.add(dedupeIdentity);
			if (appended.anchor) nextAnchorsByMirrorIdentity.set(dedupeIdentity, appended.anchor);
			if (appendedMessage.role === "user" && appended.anchor) {
				nextUserMessagesPresent.push(appendedMessage);
				nextUserMessageReceipts.push({
					anchor: appended.anchor,
					message: appendedMessage
				});
			}
			if (appended.appended) {
				if (message.role === "assistant") nextAssistantMirrorIdentitiesAppended.add(dedupeIdentity);
				nextAppendedUpdates.push({
					messageId,
					message: appendedMessage,
					...messageSeq !== void 0 ? { messageSeq } : {}
				});
			}
			if (idempotencyKey) {
				mirrorFacts.existingIdempotencyKeys.add(idempotencyKey);
				if (appended.anchor) mirrorFacts.anchorsByIdempotencyKey.set(idempotencyKey, appended.anchor);
			}
		}
		return {
			appendedUpdates: nextAppendedUpdates,
			assistantMirrorIdentitiesAppended: [...nextAssistantMirrorIdentitiesAppended],
			assistantMirrorIdentitiesOwned: [...nextAssistantMirrorIdentitiesOwned],
			anchorsByMirrorIdentity: nextAnchorsByMirrorIdentity,
			messagesPresent: nextMessagesPresent,
			userMessageReceipts: nextUserMessageReceipts,
			userMessagesPresent: nextUserMessagesPresent
		};
	});
	params.assertCurrent?.();
	const { appendedUpdates, assistantMirrorIdentitiesAppended, assistantMirrorIdentitiesOwned, anchorsByMirrorIdentity, messagesPresent, userMessageReceipts, userMessagesPresent } = mirrorBatch;
	for (const update of appendedUpdates) try {
		const terminalOwner = params.terminalAssistantOwner;
		const terminalRunId = update.message.role === "assistant" && terminalOwner && readMirrorIdentity(update.message) === terminalOwner.mirrorIdentity ? terminalOwner.runId : void 0;
		await publishSessionTranscriptUpdateByIdentity({
			...transcriptTarget,
			update: {
				...params.agentId ? { agentId: params.agentId } : {},
				message: update.message,
				messageId: update.messageId,
				...update.messageSeq !== void 0 ? { messageSeq: update.messageSeq } : {},
				...terminalRunId ? { runId: terminalRunId } : {},
				sessionKey: transcriptTarget.sessionKey
			}
		});
	} catch (error) {
		embeddedAgentLog.warn("failed to publish codex app-server transcript update", { error: formatErrorMessage(error) });
	}
	return {
		assistantMirrorIdentitiesAppended,
		assistantMirrorIdentitiesOwned,
		anchorsByMirrorIdentity,
		messagesPresent,
		userMessageReceipts,
		userMessagesPresent
	};
}
async function deliverAsyncMessageBestEffort(params) {
	const mirrorIdentity = `${params.turnId}:async:${params.itemId}`;
	const deliveryIntentId = `block-reply:v1:codex-app-server:${[
		params.threadId,
		params.turnId,
		params.itemId
	].map(encodeURIComponent).join(":")}`;
	const target = params.params.sessionTarget;
	if (!target) {
		if (!params.params.onBlockReply) return "retry";
		try {
			await deliverAsyncBlockReply(params.params.onBlockReply, params.text, deliveryIntentId);
			return "settled";
		} catch (error) {
			embeddedAgentLog.warn("failed to deliver codex async agent message", {
				error: formatErrorMessage(error),
				itemId: params.itemId,
				runId: params.params.runId,
				threadId: params.threadId,
				turnId: params.turnId
			});
			return "retry";
		}
	}
	let result;
	try {
		result = await mirror({
			agentId: target.agentId ?? params.params.agentId,
			sessionId: target.sessionId ?? params.params.sessionId,
			sessionKey: target.sessionKey ?? params.params.sessionKey,
			storePath: target.storePath,
			cwd: params.cwd,
			config: params.params.config,
			messages: [attachCodexMirrorIdentity(params.message, mirrorIdentity)],
			idempotencyScope: `codex-app-server:${params.threadId}`
		});
	} catch (error) {
		embeddedAgentLog.warn("failed to persist codex async agent message", {
			error: formatErrorMessage(error),
			itemId: params.itemId,
			runId: params.params.runId,
			threadId: params.threadId,
			turnId: params.turnId
		});
		return "retry";
	}
	if (!result.assistantMirrorIdentitiesOwned.includes(mirrorIdentity)) return "retry";
	const persistedText = readMirroredAssistantText(result.messagesPresent.find((message) => readMirrorIdentity(message) === mirrorIdentity));
	if (params.params.onBlockReply && persistedText !== void 0) try {
		await deliverAsyncBlockReply(params.params.onBlockReply, persistedText, deliveryIntentId);
	} catch (error) {
		embeddedAgentLog.warn("failed to deliver persisted codex async agent message", {
			error: formatErrorMessage(error),
			itemId: params.itemId,
			runId: params.params.runId,
			threadId: params.threadId,
			turnId: params.turnId
		});
		return "retry";
	}
	return "settled";
}
const codexTranscriptMirrorRuntime = {
	deliverAsyncMessageBestEffort,
	mirror,
	mirrorBestEffort
};
async function deliverAsyncBlockReply(onBlockReply, text, deliveryIntentId) {
	await deliverAgentHarnessUserInputPrompt({ onBlockReply: (payload) => onBlockReply(payload, { deliveryIntentId }) }, [], { intro: text });
}
function resolveCodexMirrorTranscriptTarget(params) {
	const sessionKey = params.sessionKey?.trim();
	const storePath = params.storePath?.trim();
	if (!sessionKey || !storePath) throw new Error("Codex transcript mirror requires a runtime session identity");
	return {
		...params.agentId ? { agentId: params.agentId } : {},
		sessionId: params.sessionId,
		sessionKey,
		storePath
	};
}
//#endregion
export { buildCodexUserPromptMessage as a, fingerprintCodexMirrorSourceMessage as c, serializeCodexMirrorSourceEvidence as d, projectBoundedCodexThreadHistory as f, codexCatalogHomeId as g, canonicalCodexCatalogHome as h, mirrorPromptAtTurnStartBestEffort as i, hasCodexMirrorOrigin as l, projectCodexUserItemText as m, createCodexAppServerUserMessagePersistenceNotifier as n, promptSnapshot as o, projectBoundedCodexVisibleSessionHistory as p, importCodexThreadHistoryToTranscript as r, applyCodexTranscriptTaint as s, codexTranscriptMirrorRuntime as t, readCodexMirrorSourceFingerprint as u };
