import { n as executeSqliteQuerySync } from "./kysely-sync-DKYGT267.js";
import { g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { i as getSessionKysely, m as toDatabaseOptions, s as resolveSqliteReadScope } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { mt as updateSessionEntry } from "./session-accessor-K0XuW6ln.js";
import { r as resolveMessageReceiptPrimaryId } from "./receipt-B4IFrDNq.js";
import crypto from "node:crypto";
//#region src/config/sessions/conversation-delivery-store.ts
function resolveDatabaseOptions(scope) {
	return toDatabaseOptions(resolveSqliteReadScope({
		agentId: scope.agentId,
		...scope.env ? { env: scope.env } : {},
		...scope.storePath ? { storePath: scope.storePath } : {}
	}));
}
function normalizeOperationId(value) {
	const operationId = value.trim();
	if (!operationId) throw new Error("Conversation delivery operation id is required");
	return operationId;
}
function hashMessage(message) {
	return crypto.createHash("sha256").update(message).digest("hex");
}
function normalizeStatus(value) {
	switch (value) {
		case "created":
		case "queued":
		case "sent":
		case "suppressed":
		case "rejected":
		case "unknown":
		case "replied": return value;
		default: throw new Error(`Invalid conversation delivery status: ${value}`);
	}
}
function normalizeOperationKind(value) {
	if (value === "send" || value === "turn") return value;
	throw new Error(`Invalid conversation delivery operation kind: ${value}`);
}
function mapRow(row) {
	const reply = row.reply_message_id && row.reply_text !== null && row.reply_timestamp !== null ? {
		messageId: row.reply_message_id,
		...row.reply_to_id ? { replyToId: row.reply_to_id } : {},
		...row.reply_thread_id ? { threadId: row.reply_thread_id } : {},
		text: row.reply_text,
		timestamp: row.reply_timestamp
	} : void 0;
	return {
		operationId: row.operation_id,
		operationKind: normalizeOperationKind(row.operation_kind),
		conversationRef: row.conversation_id,
		channel: row.channel,
		...row.source_session_key ? { sourceSessionKey: row.source_session_key } : {},
		messageHash: row.message_hash,
		status: normalizeStatus(row.status),
		...row.prepared_message_id ? { preparedMessageId: row.prepared_message_id } : {},
		...row.platform_message_id ? { platformMessageId: row.platform_message_id } : {},
		...row.queue_id ? { queueId: row.queue_id } : {},
		...row.rejection_error ? { rejectionError: row.rejection_error } : {},
		...reply ? { reply } : {},
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
var ConversationDeliveryInputError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "ConversationDeliveryInputError";
	}
};
var ConversationDeliveryMissingError = class extends Error {};
function selectOperation(database, operationId) {
	const db = getSessionKysely(database.db);
	const row = executeSqliteQuerySync(database.db, db.selectFrom("conversation_deliveries as delivery").innerJoin("conversations as conversation", "conversation.conversation_id", "delivery.conversation_id").selectAll("delivery").select("conversation.channel as channel").where("delivery.operation_id", "=", operationId)).rows[0];
	return row ? mapRow(row) : void 0;
}
/** Reads one durable conversation operation by its stable id. */
function getConversationDeliveryOperation(scope, operationId) {
	return selectOperation(openOpenClawAgentDatabase(resolveDatabaseOptions(scope)), normalizeOperationId(operationId));
}
/** Creates one idempotent delivery operation or returns its authoritative prior state. */
function beginConversationDeliveryOperation(scope, params) {
	const operationId = normalizeOperationId(params.operationId);
	const sourceSessionKey = params.sourceSessionKey?.trim() || void 0;
	const messageHash = hashMessage(params.message);
	return runOpenClawAgentWriteTransaction((database) => {
		const existing = selectOperation(database, operationId);
		if (existing) {
			if (existing.conversationRef !== params.conversationRef || existing.operationKind !== params.operationKind || existing.sourceSessionKey !== sourceSessionKey || existing.messageHash !== messageHash) throw new ConversationDeliveryInputError(`Conversation delivery operation was reused with different input: ${operationId}`);
			return {
				created: false,
				record: existing
			};
		}
		const now = Date.now();
		const db = getSessionKysely(database.db);
		executeSqliteQuerySync(database.db, db.insertInto("conversation_deliveries").values({
			operation_id: operationId,
			operation_kind: params.operationKind,
			conversation_id: params.conversationRef,
			source_session_key: sourceSessionKey ?? null,
			message_hash: messageHash,
			status: "created",
			prepared_message_id: params.preparedMessageId ?? null,
			platform_message_id: null,
			queue_id: null,
			rejection_error: null,
			reply_message_id: null,
			reply_to_id: null,
			reply_thread_id: null,
			reply_text: null,
			reply_timestamp: null,
			created_at: now,
			updated_at: now
		}));
		const record = selectOperation(database, operationId);
		if (!record) throw new Error(`Conversation delivery operation was not persisted: ${operationId}`);
		return {
			created: true,
			record
		};
	}, resolveDatabaseOptions(scope), { operationLabel: "conversation-delivery.begin" });
}
function updateConversationDeliveryOperation(scope, params) {
	const operationId = normalizeOperationId(params.operationId);
	return runOpenClawAgentWriteTransaction((database) => {
		const current = selectOperation(database, operationId);
		if (!current) throw new ConversationDeliveryMissingError(`Conversation delivery operation not found: ${operationId}`);
		if (!params.allowedFrom.includes(current.status)) return current;
		const db = getSessionKysely(database.db);
		executeSqliteQuerySync(database.db, db.updateTable("conversation_deliveries").set({
			status: params.status,
			...params.queueId !== void 0 ? { queue_id: params.queueId } : {},
			...params.platformMessageId !== void 0 ? { platform_message_id: params.platformMessageId } : {},
			...params.rejectionError !== void 0 ? { rejection_error: params.rejectionError } : {},
			...params.reply ? {
				reply_message_id: params.reply.messageId,
				reply_to_id: params.reply.replyToId ?? null,
				reply_thread_id: params.reply.threadId ?? null,
				reply_text: params.reply.text,
				reply_timestamp: params.reply.timestamp
			} : {},
			updated_at: Date.now()
		}).where("operation_id", "=", operationId));
		const record = selectOperation(database, operationId);
		if (!record) throw new Error(`Conversation delivery operation disappeared: ${operationId}`);
		return record;
	}, resolveDatabaseOptions(scope), { operationLabel: `conversation-delivery.${params.status}` });
}
function markConversationDeliveryQueued(scope, operationId, queueId) {
	return updateConversationDeliveryOperation(scope, {
		operationId,
		status: "queued",
		queueId,
		allowedFrom: ["created"]
	});
}
function markConversationDeliverySent(scope, operationId, platformMessageId) {
	return updateConversationDeliveryOperation(scope, {
		operationId,
		status: "sent",
		...platformMessageId ? { platformMessageId } : {},
		allowedFrom: ["created", "queued"]
	});
}
function markConversationDeliverySuppressed(scope, operationId) {
	return updateConversationDeliveryOperation(scope, {
		operationId,
		status: "suppressed",
		allowedFrom: ["created", "queued"]
	});
}
function markConversationDeliveryRejected(scope, operationId, rejectionError) {
	const normalizedError = rejectionError.trim();
	if (!normalizedError) throw new Error("Conversation delivery rejection error is required");
	return updateConversationDeliveryOperation(scope, {
		operationId,
		status: "rejected",
		rejectionError: normalizedError,
		allowedFrom: ["created", "queued"]
	});
}
function markConversationDeliveryUnknown(scope, operationId) {
	return updateConversationDeliveryOperation(scope, {
		operationId,
		status: "unknown",
		allowedFrom: ["created", "queued"]
	});
}
function markConversationDeliveryReplied(scope, params) {
	return updateConversationDeliveryOperation(scope, {
		operationId: params.operationId,
		status: "replied",
		reply: params.reply,
		allowedFrom: ["queued", "sent"]
	});
}
/** Finds the durable correlated turn associated with an inbound transport reply. */
function findConversationTurnDeliveryByReplyTarget(scope, params) {
	const database = openOpenClawAgentDatabase(resolveDatabaseOptions(scope));
	const db = getSessionKysely(database.db);
	const row = executeSqliteQuerySync(database.db, db.selectFrom("conversation_deliveries as delivery").innerJoin("conversations as conversation", "conversation.conversation_id", "delivery.conversation_id").selectAll("delivery").select("conversation.channel as channel").where("delivery.conversation_id", "=", params.conversationRef).where("delivery.operation_kind", "=", "turn").where((eb) => eb.or([eb("delivery.platform_message_id", "=", params.replyToId), eb("delivery.prepared_message_id", "=", params.replyToId)])).where("delivery.status", "in", [
		"queued",
		"sent",
		"replied"
	]).orderBy("delivery.updated_at", "desc").limit(1)).rows[0];
	return row ? mapRow(row) : void 0;
}
//#endregion
//#region src/infra/outbound/delivery-completion.ts
function scopeForCompletion(completion) {
	return {
		agentId: completion.agentId,
		...completion.storePath ? { storePath: completion.storePath } : {}
	};
}
function conversationResult(update) {
	let record;
	try {
		record = update();
	} catch (error) {
		if (error instanceof ConversationDeliveryMissingError) return { state: "stale" };
		throw error;
	}
	const delivered = record.status === "sent" || record.status === "replied";
	return {
		state: delivered ? "delivered" : record.status === "suppressed" || record.status === "rejected" || record.status === "unknown" ? record.status : "queued",
		...delivered && (record.platformMessageId || record.preparedMessageId) ? { platformMessageId: record.platformMessageId ?? record.preparedMessageId } : {},
		...record.status === "rejected" && record.rejectionError ? { rejectionError: record.rejectionError } : {}
	};
}
async function settlePendingFinalDelivery(completion, state, expectedStates, stateDir) {
	let settled = "stale";
	let wakeRecovery = false;
	await updateSessionEntry({
		sessionKey: completion.sessionKey,
		storePath: completion.storePath
	}, (entry) => {
		const internalEntry = entry;
		if (internalEntry.sessionId !== completion.sessionId || internalEntry.pendingFinalDelivery?.intentId !== completion.intentId) return null;
		const deliveries = internalEntry.pendingFinalDelivery.deliveries;
		const index = deliveries?.findIndex(({ id }) => id === completion.deliveryId) ?? -1;
		if (!deliveries || index < 0) return null;
		const current = deliveries[index].state;
		if (expectedStates && !expectedStates.some((expected) => expected === current)) return null;
		settled = current === "delivered" || current === "suppressed" || current === "unknown" && state === "unknown" ? current : state;
		const pending = internalEntry.pendingFinalDelivery;
		const existingNotice = internalEntry.pendingDeliveryNotice;
		const owedNotice = settled === "unknown" && current === "unknown" && pending.context && pending.intentId && existingNotice?.intentId !== pending.intentId && (!existingNotice || existingNotice.createdAt <= pending.createdAt) ? { pendingDeliveryNotice: {
			createdAt: pending.createdAt,
			context: pending.context,
			intentId: pending.intentId,
			state: "owed"
		} } : void 0;
		const updatedDeliveries = deliveries.with(index, {
			id: completion.deliveryId,
			state: settled
		});
		const clearsNotice = existingNotice?.state !== "acknowledged" && !updatedDeliveries.some((delivery) => delivery.state === "unknown") && settled !== "queued" && settled !== "unknown" && existingNotice?.intentId === pending.intentId;
		if (settled === current && !owedNotice && !clearsNotice) return null;
		wakeRecovery = settled !== "queued" && internalEntry.status === "running" && internalEntry.abortedLastRun === true;
		return {
			...internalEntry.mainRestartRecovery ? { mainRestartRecovery: {
				...internalEntry.mainRestartRecovery,
				revision: internalEntry.mainRestartRecovery.revision + 1
			} } : {},
			pendingFinalDelivery: {
				...internalEntry.pendingFinalDelivery,
				deliveries: updatedDeliveries
			},
			...clearsNotice ? { pendingDeliveryNotice: void 0 } : owedNotice,
			updatedAt: Date.now()
		};
	}, {
		skipMaintenance: true,
		takeCacheOwnership: true
	});
	if (wakeRecovery) {
		const { scheduleMainSessionRecoveryPendingTarget } = await import("./main-session-recovery-owner-release-nP9OevUL.js");
		scheduleMainSessionRecoveryPendingTarget({
			sessionId: completion.sessionId,
			sessionKey: completion.sessionKey,
			...stateDir !== void 0 ? { stateDir } : {},
			storePath: completion.storePath
		});
	}
	return { state: settled };
}
function readPlatformMessageId(result) {
	return (result.receipt ? resolveMessageReceiptPrimaryId(result.receipt) : void 0) ?? (result.messageId.trim() || void 0);
}
/** Records queue ownership before either the live sender or recovery crosses platform I/O. */
async function markDurableDeliveryQueued(completion, queueId, expectedPendingFinalState) {
	return completion.kind === "pending-final" ? await settlePendingFinalDelivery(completion, "queued", expectedPendingFinalState ? ["prepared", "queued"] : void 0) : conversationResult(() => markConversationDeliveryQueued(scopeForCompletion(completion), completion.operationId, queueId));
}
/** Finalizes owner state from identified platform evidence before queue acknowledgement. */
async function completeDurableDelivery(completion, result, stateDir) {
	return completion.kind === "pending-final" ? await settlePendingFinalDelivery(completion, "delivered", void 0, stateDir) : conversationResult(() => markConversationDeliverySent(scopeForCompletion(completion), completion.operationId, readPlatformMessageId(result)));
}
/** Finalizes a policy-suppressed send before its durable intent is acknowledged. */
async function suppressDurableDelivery(completion, stateDir) {
	return completion.kind === "pending-final" ? await settlePendingFinalDelivery(completion, "suppressed", void 0, stateDir) : conversationResult(() => markConversationDeliverySuppressed(scopeForCompletion(completion), completion.operationId));
}
/** Finalizes a permanent provider rejection that provably preceded platform I/O. */
async function rejectDurableDelivery(completion, error, stateDir) {
	return completion.kind === "pending-final" ? await settlePendingFinalDelivery(completion, "suppressed", void 0, stateDir) : conversationResult(() => markConversationDeliveryRejected(scopeForCompletion(completion), completion.operationId, error));
}
/** Makes a dead-lettered durable send terminal without allowing a blind replay. */
async function failDurableDelivery(completion, stateDir) {
	return completion.kind === "pending-final" ? await settlePendingFinalDelivery(completion, "unknown", void 0, stateDir) : conversationResult(() => markConversationDeliveryUnknown(scopeForCompletion(completion), completion.operationId));
}
/** Settles the completion owner from the final evidence held by its lifecycle owner. */
async function settleDurableDelivery(completion, evidence, stateDir) {
	return "result" in evidence ? completeDurableDelivery(completion, evidence.result, stateDir) : evidence.platformSendStarted ? failDurableDelivery(completion, stateDir) : suppressDurableDelivery(completion, stateDir);
}
//#endregion
export { settleDurableDelivery as a, beginConversationDeliveryOperation as c, markConversationDeliveryQueued as d, markConversationDeliveryReplied as f, rejectDurableDelivery as i, findConversationTurnDeliveryByReplyTarget as l, markConversationDeliverySuppressed as m, failDurableDelivery as n, settlePendingFinalDelivery as o, markConversationDeliverySent as p, markDurableDeliveryQueued as r, ConversationDeliveryInputError as s, completeDurableDelivery as t, getConversationDeliveryOperation as u };
