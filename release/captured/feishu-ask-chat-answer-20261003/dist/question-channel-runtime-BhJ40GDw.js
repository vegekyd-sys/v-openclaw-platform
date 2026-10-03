import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
//#region src/infra/question-channel-runtime-internal.ts
const TERMINAL_DELIVERY_RETENTION_MS = 864e5;
function collectAnsweredLabels(record, event) {
	if (!record) return [];
	const answers = event.answers.answers;
	return record.questions.flatMap((question) => {
		if (question.isSecret || question.options.length === 0) return [];
		const optionLabels = new Set(question.options.map((option) => option.label));
		return (answers[question.questionId] ?? []).filter((answer) => optionLabels.has(answer));
	});
}
function formatQuestionTerminalStatusLine(params) {
	if (params.event.status === "expired") return "Expired";
	if (params.event.status === "cancelled") return "Cancelled";
	const labels = collectAnsweredLabels(params.record, params.event);
	return labels.length > 0 ? `Answered: ${labels.join(", ")}` : "Answered";
}
function createQuestionChannelRuntime(options = {}) {
	const entries = /* @__PURE__ */ new Map();
	const terminalRetentionMs = options.terminalRetentionMs ?? TERMINAL_DELIVERY_RETENTION_MS;
	const getOrCreate = (questionId) => {
		const existing = entries.get(questionId);
		if (existing) return existing;
		const created = {
			deliveries: /* @__PURE__ */ new Map(),
			finalizedDeliveryIds: /* @__PURE__ */ new Set()
		};
		entries.set(questionId, created);
		return created;
	};
	const finalizeDelivery = (questionId, entry, deliveryId, finalize) => {
		if (!entry.terminal || entry.finalizedDeliveryIds.has(deliveryId)) return;
		entry.deliveries.delete(deliveryId);
		entry.finalizedDeliveryIds.add(deliveryId);
		const statusLine = formatQuestionTerminalStatusLine({
			record: entry.record,
			event: entry.terminal
		});
		try {
			Promise.resolve(finalize(statusLine)).catch((error) => options.onFinalizeError?.(error, questionId, deliveryId));
		} catch (error) {
			options.onFinalizeError?.(error, questionId, deliveryId);
		}
	};
	const scheduleCleanup = (questionId, entry) => {
		if (entry.cleanupTimer) return;
		entry.cleanupTimer = setTimeout(() => {
			if (entries.get(questionId) === entry) entries.delete(questionId);
		}, terminalRetentionMs);
		entry.cleanupTimer.unref?.();
	};
	return {
		handleRequested(record) {
			const entry = getOrCreate(record.id);
			entry.record = record;
		},
		handleResolved(event) {
			const entry = getOrCreate(event.id);
			if (entry.terminal) return;
			entry.terminal = event;
			for (const [deliveryId, finalize] of entry.deliveries) finalizeDelivery(event.id, entry, deliveryId, finalize);
			scheduleCleanup(event.id, entry);
		},
		registerDelivery({ questionId, deliveryId, finalize }) {
			const entry = getOrCreate(questionId);
			if (entry.finalizedDeliveryIds.has(deliveryId)) return;
			entry.deliveries.set(deliveryId, finalize);
			finalizeDelivery(questionId, entry, deliveryId, finalize);
		},
		clear() {
			for (const entry of entries.values()) if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
			entries.clear();
		}
	};
}
//#endregion
//#region src/infra/question-channel-runtime.ts
const log = createSubsystemLogger("gateway/questions");
const questionChannelRuntime = resolveGlobalSingleton(Symbol.for("openclaw.questionChannelRuntime"), () => createQuestionChannelRuntime({ onFinalizeError: (error, questionId, deliveryId) => {
	log.warn(`question message finalization failed id=${questionId} delivery=${deliveryId}`, { error: String(error) });
} }), (runtime) => runtime.clear());
const vSecretEntryRequestedListeners = resolveGlobalSingleton(Symbol.for("openclaw.questionChannelRequestedListeners"), () => /* @__PURE__ */ new Set(), (listeners) => listeners.clear()); // v-openclaw91-secret-entry-runtime-v2
function subscribeQuestionChannelRequested(listener) {
	vSecretEntryRequestedListeners.add(listener);
	return () => vSecretEntryRequestedListeners.delete(listener);
}
const handleQuestionChannelRequested = (record) => {
	questionChannelRuntime.handleRequested(record);
	for (const listener of vSecretEntryRequestedListeners) try {
		Promise.resolve(listener(record)).catch((error) => log.warn(`question requested listener failed id=${record.id}`, { error: String(error) }));
	} catch (error) {
		log.warn(`question requested listener failed id=${record.id}`, { error: String(error) });
	}
};
const handleQuestionChannelResolved = questionChannelRuntime.handleResolved;
const registerQuestionChannelDelivery = questionChannelRuntime.registerDelivery;
//#endregion
export { handleQuestionChannelResolved as n, registerQuestionChannelDelivery as r, subscribeQuestionChannelRequested as s, handleQuestionChannelRequested as t };
