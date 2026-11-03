import { t as __exportAll } from "./rolldown-runtime-BCk198RA.mjs";
import { i as resolveDingtalkAccount } from "./accounts-Dkl7e4kk.mjs";
import { i as streamAICard, n as finishAICard, t as createAICardForTarget } from "./card-CVsxDMw1.mjs";
//#region src/services/card-bridge.ts
var card_bridge_exports = /* @__PURE__ */ __exportAll({
	DINGTALK_CARD_BRIDGE_SYMBOL: () => DINGTALK_CARD_BRIDGE_SYMBOL,
	installDingtalkCardBridge: () => installDingtalkCardBridge,
	registerDingtalkCardGatewayMethods: () => registerDingtalkCardGatewayMethods
});
const DINGTALK_CARD_BRIDGE_SYMBOL = Symbol.for("@dingtalk-connector/card-bridge");
const CARD_RECORD_TTL_MS = 1440 * 60 * 1e3;
const CARD_RECORD_MAX_SIZE = 1e4;
const CARD_RECORD_CLEANUP_INTERVAL_MS = 3600 * 1e3;
const DEFAULT_FAILED_CARD_MARKDOWN = "Task failed";
const TARGET_ID_MAX_LENGTH = 256;
const TARGET_ID_DANGEROUS_CHARS_PATTERN = /[<>"\x00-\x1f\x7f]/;
const cards = /* @__PURE__ */ new Map();
let cleanupTimerInstalled = false;
var PublicError = class extends Error {};
function nowMs() {
	return Date.now();
}
function asRecord(value) {
	return typeof value === "object" && value !== null ? value : {};
}
function optionalString(value) {
	return typeof value === "string" ? value : void 0;
}
function errorMessage(err) {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	return "Unknown error";
}
function publicErrorMessage(err, fallback) {
	return err instanceof PublicError ? err.message : fallback;
}
function isValidTargetId(value) {
	return value.length > 0 && value.length <= TARGET_ID_MAX_LENGTH && !TARGET_ID_DANGEROUS_CHARS_PATTERN.test(value);
}
function parseCardTarget(target) {
	if (typeof target !== "string") return null;
	const raw = target.trim();
	if (!raw) return null;
	const lowered = raw.toLowerCase();
	if (lowered.startsWith("user:")) {
		const userId = raw.slice(5).trim();
		return isValidTargetId(userId) ? {
			type: "user",
			userId
		} : null;
	}
	if (lowered.startsWith("group:")) {
		const openConversationId = raw.slice(6).trim();
		return isValidTargetId(openConversationId) ? {
			type: "group",
			openConversationId
		} : null;
	}
	if (raw.startsWith("cid") && isValidTargetId(raw)) return {
		type: "group",
		openConversationId: raw
	};
	return null;
}
function targetToString(target) {
	return target.type === "user" ? `user:${target.userId}` : `group:${target.openConversationId}`;
}
function normalizeStatus(value) {
	if (value === "completed" || value === "failed") return value;
	return "running";
}
function cleanupExpiredCards(log, timestamp = nowMs()) {
	let removed = 0;
	for (const [cardInstanceId, record] of cards) if (timestamp - record.lastUsedAt > CARD_RECORD_TTL_MS) {
		cards.delete(cardInstanceId);
		removed += 1;
	}
	if (removed > 0) log?.info?.(`[DingTalk][CardBridge] cleaned expired cards count=${removed}`);
	return removed;
}
function evictOverflowCards(log) {
	const overflow = cards.size - CARD_RECORD_MAX_SIZE;
	if (overflow <= 0) return 0;
	const oldest = [...cards.entries()].sort(([, a], [, b]) => a.lastUsedAt - b.lastUsedAt).slice(0, overflow);
	for (const [cardInstanceId] of oldest) cards.delete(cardInstanceId);
	log?.warn?.(`[DingTalk][CardBridge] evicted old cards count=${oldest.length}`);
	return oldest.length;
}
function ensureCleanupTimerInstalled() {
	if (cleanupTimerInstalled) return;
	setInterval(() => {
		cleanupExpiredCards();
	}, CARD_RECORD_CLEANUP_INTERVAL_MS).unref?.();
	cleanupTimerInstalled = true;
}
function rememberCard(card, config, log) {
	cleanupExpiredCards(log);
	const record = {
		card,
		config,
		lastUsedAt: nowMs(),
		queue: Promise.resolve()
	};
	cards.set(card.cardInstanceId, record);
	evictOverflowCards(log);
	return record;
}
function getCardRecord(cardInstanceId) {
	const record = cards.get(cardInstanceId);
	if (!record) throw new PublicError(`Unknown cardInstanceId: ${cardInstanceId}`);
	record.lastUsedAt = nowMs();
	return record;
}
function resolveAccountConfig(cfg, accountId, log, method) {
	const account = resolveDingtalkAccount({
		cfg,
		accountId: typeof accountId === "string" ? accountId : void 0
	});
	if (!account.enabled || !account.configured) throw new PublicError("DingTalk not configured");
	log?.debug?.(`[DingTalk][CardBridge][${method}] using accountId=${account.accountId}`);
	return account;
}
async function createCard(params) {
	const account = resolveAccountConfig(params.cfg, params.accountId, params.log, "card.create");
	const card = await createAICardForTarget(account.config, params.target, params.log);
	if (!card) throw new PublicError("Failed to create DingTalk AI Card");
	rememberCard(card, account.config, params.log);
	try {
		if (params.markdown) await streamAICard(card, params.markdown, false, account.config, params.log);
	} catch (err) {
		cards.delete(card.cardInstanceId);
		throw err;
	}
	params.log?.info?.(`[DingTalk][CardBridge][card.create] created cardInstanceId=${card.cardInstanceId}`);
	return {
		cardInstanceId: card.cardInstanceId,
		accountId: account.accountId,
		target: targetToString(params.target)
	};
}
async function updateCard(params) {
	const record = getCardRecord(params.cardInstanceId);
	const status = normalizeStatus(params.status);
	const operation = record.queue.then(() => updateCardRecord(record, params.cardInstanceId, params.markdown, status, params.log), () => updateCardRecord(record, params.cardInstanceId, params.markdown, status, params.log));
	record.queue = operation.catch(() => void 0);
	await operation;
	return {
		cardInstanceId: params.cardInstanceId,
		status
	};
}
async function updateCardRecord(record, cardInstanceId, markdown, status, log) {
	if (cards.get(cardInstanceId) !== record) throw new PublicError(`Unknown cardInstanceId: ${cardInstanceId}`);
	record.lastUsedAt = nowMs();
	log?.info?.(`[DingTalk][CardBridge][card.update] cardInstanceId=${cardInstanceId} status=${status}`);
	if (status === "completed") try {
		await finishAICard(record.card, markdown || " ", record.config, log);
	} finally {
		cards.delete(cardInstanceId);
	}
	else if (status === "failed") {
		const content = markdown.trim() ? markdown : DEFAULT_FAILED_CARD_MARKDOWN;
		try {
			await finishAICard(record.card, content, record.config, log);
		} finally {
			cards.delete(cardInstanceId);
		}
	} else await streamAICard(record.card, markdown || " ", false, record.config, log);
}
function installDingtalkCardBridge(api) {
	ensureCleanupTimerInstalled();
	const g = globalThis;
	g[DINGTALK_CARD_BRIDGE_SYMBOL] = {
		async create(params) {
			const cfg = params?.cfg ?? api.runtime.config.current();
			const target = parseCardTarget(params?.target);
			if (!target) throw new PublicError("target is required (user:<userId>, group:<openConversationId>, or cid...)");
			return createCard({
				cfg,
				accountId: params?.accountId,
				target,
				markdown: optionalString(params?.markdown),
				log: params?.log ?? api.logger
			});
		},
		async update(params) {
			if (!params?.cardInstanceId) throw new PublicError("cardInstanceId is required");
			return updateCard({
				cardInstanceId: String(params.cardInstanceId),
				markdown: String(params?.markdown ?? ""),
				status: normalizeStatus(params?.status),
				log: params?.log ?? api.logger
			});
		}
	};
}
function registerDingtalkCardGatewayMethods(api) {
	const log = api.logger;
	api.registerGatewayMethod("dingtalk-connector.card.create", async ({ params, respond }) => {
		try {
			const cfg = api.runtime.config.current();
			const rawParams = asRecord(params);
			const target = parseCardTarget(rawParams.target);
			if (!target) return respond(false, { error: "target is required (user:<userId>, group:<openConversationId>, or cid...)" });
			respond(true, await createCard({
				cfg,
				accountId: optionalString(rawParams.accountId),
				target,
				markdown: optionalString(rawParams.markdown),
				log
			}));
		} catch (err) {
			log?.error?.(`[Gateway][card.create] 错误: ${errorMessage(err)}`);
			respond(false, { error: publicErrorMessage(err, "card.create failed") });
		}
	});
	api.registerGatewayMethod("dingtalk-connector.card.update", async ({ params, respond }) => {
		try {
			const rawParams = asRecord(params);
			if (!rawParams.cardInstanceId) return respond(false, { error: "cardInstanceId is required" });
			respond(true, await updateCard({
				cardInstanceId: String(rawParams.cardInstanceId),
				markdown: String(rawParams.markdown ?? ""),
				status: normalizeStatus(rawParams.status),
				log
			}));
		} catch (err) {
			log?.error?.(`[Gateway][card.update] 错误: ${errorMessage(err)}`);
			respond(false, { error: publicErrorMessage(err, "card.update failed") });
		}
	});
}
//#endregion
export { installDingtalkCardBridge as n, registerDingtalkCardGatewayMethods as r, card_bridge_exports as t };
