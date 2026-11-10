import { $t as isJsonObject, jt as unsubscribeCodexAppServerLiveThread, q as CodexAppServerRpcError, y as retireSharedCodexAppServerClientIfCurrent } from "./shared-client-DxcfF9KX.js";
import { asFiniteNumber, normalizeOptionalString, normalizeOptionalString as normalizeOptionalString$1, readStringField } from "openclaw/plugin-sdk/string-coerce-runtime";
import { createDeferred } from "openclaw/plugin-sdk/extension-shared";
import { embeddedAgentLog } from "openclaw/plugin-sdk/agent-harness-runtime";
import { redactSensitiveText } from "openclaw/plugin-sdk/logging-core";
import { sanitizeTerminalText } from "openclaw/plugin-sdk/text-chunking";
//#region extensions/codex/src/app-server/event-projector-values.ts
function readNonEmptyString(record, key) {
	return normalizeOptionalString$1(record[key]);
}
function readNonEmptyStringArray(record, key) {
	const value = record[key];
	if (!Array.isArray(value)) return [];
	const entries = [];
	for (const entry of value) {
		const normalized = normalizeOptionalString$1(entry);
		if (normalized) entries.push(normalized);
	}
	return entries;
}
function readNullableString(record, key) {
	const value = record[key];
	if (value === null) return null;
	return typeof value === "string" ? value : void 0;
}
function readNonNegativeInteger(record, key) {
	const value = asFiniteNumber(record[key]);
	return value !== void 0 && Number.isInteger(value) && value >= 0 ? value : void 0;
}
function readCodexErrorNotificationMessage(record) {
	const error = record.error;
	return isJsonObject(error) ? readStringField(error, "message") : void 0;
}
function readHookOutputEntries(value) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!isJsonObject(entry)) return [];
		const text = readStringField(entry, "text");
		if (!text) return [];
		const kind = readStringField(entry, "kind");
		return [{
			...kind ? { kind } : {},
			text
		}];
	});
}
function splitPlanText(text) {
	return text.split(/\r?\n/).map((line) => line.trim().replace(/^[-*]\s+/, "")).filter((line) => line.length > 0);
}
function extractRawAssistantText(item) {
	const parts = (Array.isArray(item.content) ? item.content : []).flatMap((entry) => {
		if (!isJsonObject(entry)) return [];
		const type = readStringField(entry, "type");
		if (type !== "output_text" && type !== "text") return [];
		const value = readStringField(entry, "text");
		return value === void 0 ? [] : [value];
	});
	return parts.length > 0 ? parts.join("").trim() : void 0;
}
function readItemString(item, key) {
	const value = item[key];
	return typeof value === "string" ? value : void 0;
}
function readItem(value) {
	if (!isJsonObject(value)) return;
	const type = typeof value.type === "string" ? value.type : void 0;
	const id = typeof value.id === "string" ? value.id : void 0;
	if (!type || !id) return;
	return value;
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-items.ts
function matchesCodexSnapshotTurn(item, turnId) {
	const itemTurnId = readItemString(item, "turnId");
	return itemTurnId === void 0 || itemTurnId === turnId;
}
function itemKind(item) {
	switch (item.type) {
		case "dynamicToolCall":
		case "mcpToolCall": return "tool";
		case "commandExecution": return "command";
		case "fileChange": return "patch";
		case "webSearch": return "search";
		case "reasoning":
		case "contextCompaction": return "analysis";
		default: return;
	}
}
function itemTitle(item) {
	switch (item.type) {
		case "commandExecution": return "Command";
		case "fileChange": return "File change";
		case "mcpToolCall": return "MCP tool";
		case "dynamicToolCall": return "Tool";
		case "webSearch": return "Web search";
		case "contextCompaction": return "Context compaction";
		case "reasoning": return "Reasoning";
		default: return item.type;
	}
}
function itemStatus(item) {
	const status = readItemString(item, "status");
	if (status === "failed" || status === "error") return "failed";
	if (status === "declined") return "blocked";
	if (status === "inProgress" || status === "in_progress" || status === "running") return "running";
	return "completed";
}
function unknownItemStatus(item) {
	const status = readItemString(item, "status");
	switch (status) {
		case void 0:
		case "completed":
		case "failed":
		case "error":
		case "declined":
		case "inProgress":
		case "in_progress":
		case "running": return;
		default: return status;
	}
}
function auditNativeToolTerminalStatus(item) {
	if (item.type === "imageView" || item.type === "sleep") return "completed";
	const status = readItemString(item, "status");
	if (status === "completed") return "completed";
	if (status === "failed" || status === "error") return "failed";
	if (status === "declined") return "blocked";
	return "unknown";
}
function auditNativeToolUnfinishedStatus(item) {
	return item.type === "webSearch" || item.type === "imageGeneration" ? "unknown" : "failed";
}
function isNonSuccessItemStatus(status) {
	return status === "failed" || status === "blocked";
}
function itemName(item) {
	if (item.type === "dynamicToolCall" && typeof item.tool === "string") return item.tool;
	if (item.type === "mcpToolCall" && typeof item.tool === "string") {
		const server = typeof item.server === "string" ? item.server : void 0;
		return server ? `${server}.${item.tool}` : item.tool;
	}
	if (item.type === "commandExecution") return "bash";
	if (item.type === "fileChange") return "apply_patch";
	if (item.type === "webSearch") return "web_search";
}
function auditNativeToolName(item) {
	if (item.type === "dynamicToolCall") return;
	const progressName = itemName(item);
	if (progressName) return progressName;
	if (item.type === "collabAgentToolCall") return typeof item.tool === "string" && item.tool.trim() ? `collab.${item.tool.trim()}` : "collab_agent";
	if (item.type === "imageGeneration") return "image_generation";
	if (item.type === "imageView") return "image_view";
	if (item.type === "sleep") return "sleep";
}
function isSideEffectingNativeToolItem(item) {
	return itemStatus(item) !== "blocked" && (isMutatingNativeToolItem(item) || item.type === "mcpToolCall");
}
function shouldSynthesizeToolProgressForItem(item) {
	switch (item.type) {
		case "commandExecution":
		case "fileChange":
		case "webSearch":
		case "mcpToolCall": return true;
		default: return false;
	}
}
function shouldRecordNativeToolTranscript(item) {
	return shouldSynthesizeToolProgressForItem(item);
}
function isMutatingNativeToolItem(item) {
	if (item.type === "commandExecution") return true;
	return item.type === "fileChange" || item.type === "collabAgentToolCall" || item.type === "imageGeneration";
}
function shouldClearTerminalPresentationForNativeItem(item) {
	switch (item.type) {
		case "collabAgentToolCall":
		case "commandExecution":
		case "fileChange":
		case "imageGeneration":
		case "imageView":
		case "mcpToolCall":
		case "webSearch": return true;
		default: return false;
	}
}
//#endregion
//#region extensions/codex/src/app-server/notification-correlation.ts
/**
* Correlates Codex app-server notifications with the active thread/turn so
* projectors can ignore global or stale events without losing diagnostics.
*/
/** Returns true when a notification payload belongs to the exact active thread and turn. */
function isCodexNotificationForTurn(value, threadId, turnId) {
	if (!isJsonObject(value)) return false;
	return readCodexNotificationThreadId(value) === threadId && readCodexNotificationTurnId(value) === turnId;
}
/**
* Reads a thread id from canonical top-level or nested thread payloads.
* The generated v2 schemas require top-level `threadId` on turn/item-scoped
* notifications and define `Turn` without one, so `turn.threadId` is not a
* wire shape and is deliberately not read here.
*/
function readCodexNotificationThreadId(record) {
	const thread = isJsonObject(record.thread) ? record.thread : void 0;
	return normalizeOptionalString(record.threadId) ?? (thread ? normalizeOptionalString(thread.id) : void 0);
}
/** Reads a turn id from either top-level notification params or nested turn payloads. */
function readCodexNotificationTurnId(record) {
	return readNestedTurnId(record) ?? normalizeOptionalString(record.turnId);
}
function readNestedTurnId(record) {
	const turn = record.turn;
	return isJsonObject(turn) ? normalizeOptionalString(turn.id) : void 0;
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-diagnostics.ts
function redactCodexEventKind(method) {
	return redactSensitiveText(sanitizeTerminalText(method));
}
var CodexProjectionDiagnostics = class {
	constructor(threadId, turnId) {
		this.threadId = threadId;
		this.turnId = turnId;
		this.warningKeys = /* @__PURE__ */ new Set();
	}
	warnUnknownItemStatus(item) {
		if (!item) return;
		const status = unknownItemStatus(item);
		if (!status) return;
		const safeStatus = redactCodexEventKind(status);
		const safeItemType = redactCodexEventKind(item.type);
		this.warnOnce(JSON.stringify([
			"status",
			item.type,
			status
		]), "codex app-server item reported unknown status; continuing projection", {
			itemId: item.id,
			itemType: safeItemType,
			status: safeStatus
		});
	}
	warnUnknownEvent(notification, params) {
		const notificationThreadId = readCodexNotificationThreadId(params);
		const notificationTurnId = readCodexNotificationTurnId(params);
		const eventKind = redactCodexEventKind(notification.method);
		this.warnOnce(JSON.stringify(["method", notification.method]), `codex app-server projector received unknown event kind; continuing: ${eventKind}`, {
			eventKind,
			activeThreadId: this.threadId,
			activeTurnId: this.turnId,
			threadId: notificationThreadId,
			turnId: notificationTurnId,
			matchesActiveThread: notificationThreadId === this.threadId,
			matchesActiveTurn: notificationTurnId === this.turnId
		});
	}
	warnOnce(key, message, context) {
		if (this.warningKeys.has(key)) return;
		this.warningKeys.add(key);
		embeddedAgentLog.warn(message, context);
	}
};
//#endregion
//#region extensions/codex/src/app-server/turn-router.ts
/** Keyed routing for all turn traffic on one shared Codex app-server client. */
const DEFAULT_PREBIND_NOTIFICATION_LIMIT = 256;
const DEFAULT_GLOBAL_WARNING_LIMIT = 32;
const CODEX_APP_SERVER_NATIVE_TURN_WAIT_TIMEOUT_MS = 3e4;
const routers = /* @__PURE__ */ new WeakMap();
/** Returns the sole router installed on a physical app-server client. */
function getCodexAppServerTurnRouter(client) {
	const existing = routers.get(client);
	if (existing) return existing;
	const router = new ClientTurnRouter(client);
	routers.set(client, router);
	return router;
}
var ClientTurnRouter = class {
	constructor(client) {
		this.routes = /* @__PURE__ */ new Map();
		this.globalWarnings = [];
		this.nativeTurnCompletionWatchers = /* @__PURE__ */ new Map();
		this.disposed = false;
		client.addNotificationHandler((notification) => this.routeNotification(notification));
		client.addRequestHandler((request, signal) => this.routeRequest(request, signal));
		client.addCloseHandler((closedClient) => {
			this.dispose(closedClient.getCloseError());
		});
	}
	reserveThread(options) {
		this.assertActive();
		const threadId = requireId(options.threadId, "thread id");
		if (this.routes.has(threadId)) throw new Error(`codex app-server thread route already reserved: ${threadId}`);
		const route = {
			threadId,
			controller: new AbortController(),
			ended: createDeferred(),
			activated: createDeferred(),
			gate: "open",
			pending: this.globalWarnings.map((notification) => ({
				notification,
				receivedAtMs: Date.now(),
				scope: { threadId }
			})),
			notificationTail: Promise.resolve(),
			completedNativeTurnIds: /* @__PURE__ */ new Set(),
			ignoredTurnNotificationKeys: /* @__PURE__ */ new Set()
		};
		this.routes.set(threadId, route);
		if (options.onNotification || options.onRequest) this.activateNow(route, options);
		const releaseOn = options.releaseOn;
		if (releaseOn) {
			const release = () => this.release(route, abortReason(releaseOn));
			releaseOn.addEventListener("abort", release, { once: true });
			route.detachReleaseOn = () => releaseOn.removeEventListener("abort", release);
			if (releaseOn.aborted) release();
		}
		return {
			threadId,
			signal: route.controller.signal,
			get observedNativeTurnId() {
				return route.observedNativeTurn?.id;
			},
			activate: (handlers) => this.activate(route, handlers),
			armTurn: () => this.armTurn(route),
			bindTurn: (turnId) => this.bindTurn(route, turnId),
			cancelTurn: () => this.cancelTurn(route),
			drain: () => this.drainNotifications(route),
			release: () => this.release(route)
		};
	}
	watchNativeTurnCompletion(options) {
		this.assertActive();
		const threadId = requireId(options.threadId, "thread id");
		const turnId = requireId(options.turnId, "turn id");
		if (options.signal?.aborted) return {
			completion: Promise.resolve(false),
			cancel: () => {}
		};
		if (this.routes.get(threadId)?.completedNativeTurnIds.delete(turnId)) return {
			completion: Promise.resolve(true),
			cancel: () => {}
		};
		const { promise: completion, resolve: settle } = createDeferred();
		const watchers = this.nativeTurnCompletionWatchers.get(threadId) ?? /* @__PURE__ */ new Set();
		this.nativeTurnCompletionWatchers.set(threadId, watchers);
		let settled = false;
		const finish = (completed) => {
			if (settled) return;
			settled = true;
			watchers.delete(watcher);
			if (watchers.size === 0) this.nativeTurnCompletionWatchers.delete(threadId);
			clearTimeout(timeout);
			options.signal?.removeEventListener("abort", abort);
			settle(completed);
		};
		const watcher = {
			turnId,
			finish
		};
		watchers.add(watcher);
		const timeout = setTimeout(() => finish(false), Math.max(1, options.timeoutMs));
		timeout.unref?.();
		const abort = () => finish(false);
		options.signal?.addEventListener("abort", abort, { once: true });
		return {
			completion,
			cancel: () => finish(false)
		};
	}
	dispose(cause) {
		if (this.disposed) return;
		this.disposed = true;
		const closeError = cause ? new Error("codex app-server turn router closed", { cause }) : /* @__PURE__ */ new Error("codex app-server turn router closed");
		for (const route of this.routes.values()) this.release(route, closeError);
		for (const watchers of this.nativeTurnCompletionWatchers.values()) for (const watcher of watchers) watcher.finish(false);
	}
	async activate(route, handlers) {
		this.assertRoute(route);
		this.activateNow(route, handlers);
		await this.waitForNotifications(route);
		this.assertRoute(route);
	}
	activateNow(route, handlers) {
		if (route.handlers) throw new Error(`codex app-server thread route already activated: ${route.threadId}`);
		this.assertRoute(route);
		if (!handlers.onNotification && !handlers.onRequest) throw new Error("codex app-server thread route requires a notification or request handler");
		route.handlers = handlers;
		if (!handlers.onNotification) route.pending.length = 0;
		else if (route.gate !== "armed") this.flushNotifications(route);
		route.activated.resolve();
	}
	armTurn(route) {
		this.assertRoute(route);
		if (route.gate !== "open") throw new Error(`codex app-server thread route cannot arm from ${route.gate}`);
		route.gate = "armed";
		route.ignoredTurnNotificationKeys.clear();
		route.completedNativeTurnIds.clear();
		if (route.observedNativeTurn?.completed) route.observedNativeTurn = void 0;
		route.binding = createDeferred();
	}
	async cancelTurn(route) {
		if (route.released || route.gate !== "armed") return;
		route.gate = "open";
		route.binding?.resolve();
		route.binding = void 0;
		this.flushNotifications(route);
		await this.waitForNotifications(route);
		this.assertRoute(route);
	}
	async bindTurn(route, turnIdInput) {
		this.assertRoute(route);
		if (!route.handlers) throw new Error("codex app-server thread route must be activated before binding a turn");
		if (route.gate !== "armed") throw new Error(`codex app-server thread route cannot bind from ${route.gate}`);
		const turnId = requireId(turnIdInput, "turn id");
		route.gate = "bound";
		route.turnId = turnId;
		this.flushNotifications(route);
		route.binding?.resolve();
		await this.waitForNotifications(route);
		this.assertRoute(route);
	}
	routeNotification(notification) {
		if (this.disposed) return;
		const scope = readScope(notification.params);
		if (!scope.threadId && (notification.method === "configWarning" || notification.method === "warning")) {
			if (this.globalWarnings.length === DEFAULT_GLOBAL_WARNING_LIMIT) this.globalWarnings.shift();
			this.globalWarnings.push(notification);
			for (const route of this.routes.values()) {
				this.bufferNotification(route, notification, { threadId: route.threadId }, Date.now());
				if (route.gate === "bound") this.flushNotifications(route);
			}
			return Promise.all([...this.routes.values()].map((route) => route.notificationTail)).then(() => void 0);
		}
		const watchers = scope.threadId ? this.nativeTurnCompletionWatchers.get(scope.threadId) : void 0;
		const route = scope.threadId ? this.routes.get(scope.threadId) : void 0;
		if (!watchers && !route) return;
		if (scope.turnId && watchers) {
			for (const watcher of watchers) if (watcher.turnId === scope.turnId && notification.method === "turn/completed") watcher.finish(true);
		}
		if (!route) return;
		const routeScope = {
			threadId: route.threadId,
			...scope.turnId ? { turnId: scope.turnId } : {}
		};
		const receivedAtMs = Date.now();
		if (route.gate !== "bound" && scope.turnId) {
			if (notification.method === "turn/started") route.observedNativeTurn = {
				id: scope.turnId,
				completed: false
			};
			else if (notification.method === "turn/completed") {
				route.completedNativeTurnIds.add(scope.turnId);
				if (!route.observedNativeTurn || route.observedNativeTurn.completed || route.observedNativeTurn.id === scope.turnId) route.observedNativeTurn = {
					id: scope.turnId,
					completed: true
				};
			}
		}
		if (!route.handlers) {
			this.bufferNotification(route, notification, routeScope, receivedAtMs);
			return;
		}
		const handler = route.handlers.onNotification;
		if (!handler) return;
		if (route.gate === "bound" && scope.turnId && scope.turnId !== route.turnId) {
			this.warnDroppedStaleTurnNotification(route, notification, routeScope);
			return;
		}
		if (route.gate === "armed") {
			this.bufferNotification(route, notification, routeScope, receivedAtMs);
			return;
		}
		route.handlers.onNotificationReceived?.(notification, routeScope, receivedAtMs);
		this.enqueueNotification(route, handler, notification, routeScope);
		return route.notificationTail;
	}
	async routeRequest(request, signal = new AbortController().signal) {
		if (this.disposed || signal.aborted) return;
		const scope = readScope(request.params);
		if (!scope.threadId) return;
		const route = this.routes.get(scope.threadId);
		if (!route) return;
		const requestSignal = AbortSignal.any([signal, route.controller.signal]);
		if (!route.handlers && !await waitForPromiseOrAbort(route.activated.promise, requestSignal)) return;
		if (requestSignal.aborted || !route.handlers) return;
		const handler = route.handlers.onRequest;
		if (!handler) return;
		while (route.gate === "armed") {
			const binding = route.binding?.promise;
			if (!binding || !await waitForPromiseOrAbort(binding, requestSignal)) return;
			if (requestSignal.aborted) return;
		}
		if (route.gate === "bound" && scope.turnId && scope.turnId !== route.turnId) return;
		if (!await waitForPromiseOrAbort(this.waitForNotifications(route), requestSignal)) return;
		if (requestSignal.aborted) return;
		try {
			const result = await handler(request, {
				threadId: scope.threadId,
				...scope.turnId ? { turnId: scope.turnId } : {}
			}, requestSignal);
			return requestSignal.aborted ? void 0 : result;
		} catch (error) {
			if (requestSignal.aborted) return;
			throw error;
		}
	}
	flushNotifications(route) {
		const handler = route.handlers?.onNotification;
		if (!handler) return;
		for (const pending of route.pending.splice(0)) {
			if (route.gate !== "bound" && (pending.notification.method === "configWarning" || pending.notification.method === "warning" && !readScope(pending.notification.params).threadId)) {
				route.pending.push(pending);
				continue;
			}
			if (route.gate === "bound" && pending.scope.turnId && pending.scope.turnId !== route.turnId) {
				this.warnDroppedStaleTurnNotification(route, pending.notification, pending.scope);
				continue;
			}
			route.handlers?.onNotificationReceived?.(pending.notification, pending.scope, pending.receivedAtMs);
			this.enqueueNotification(route, handler, pending.notification, pending.scope);
		}
	}
	warnDroppedStaleTurnNotification(route, notification, scope) {
		if (notification.method === "turn/completed" || !scope.turnId || !route.turnId) return;
		const eventKind = redactCodexEventKind(notification.method);
		const key = JSON.stringify([notification.method, scope.turnId]);
		if (route.ignoredTurnNotificationKeys.has(key)) return;
		route.ignoredTurnNotificationKeys.add(key);
		embeddedAgentLog.warn("codex app-server notification ignored for inactive turn", {
			eventKind,
			activeThreadId: route.threadId,
			activeTurnId: route.turnId,
			threadId: scope.threadId,
			turnId: scope.turnId,
			matchesActiveThread: true,
			matchesActiveTurn: false
		});
	}
	bufferNotification(route, notification, scope, receivedAtMs) {
		if (route.pending.length < DEFAULT_PREBIND_NOTIFICATION_LIMIT) {
			route.pending.push({
				notification,
				receivedAtMs,
				scope
			});
			return;
		}
		const error = /* @__PURE__ */ new Error(`codex app-server pre-bind notification buffer exceeded ${DEFAULT_PREBIND_NOTIFICATION_LIMIT} entries for thread ${route.threadId}`);
		embeddedAgentLog.warn(error.message);
		this.release(route, error);
	}
	enqueueNotification(route, handler, notification, scope) {
		if (route.released) return;
		route.notificationTail = route.notificationTail.then(() => handler(notification, scope)).catch((error) => {
			if (!route.released) embeddedAgentLog.warn("codex app-server keyed notification handler failed", {
				method: notification.method,
				threadId: route.threadId,
				turnId: route.turnId,
				error
			});
		});
	}
	async waitForNotifications(route) {
		await Promise.race([route.notificationTail, route.ended.promise]);
	}
	async drainNotifications(route) {
		await Promise.race([route.notificationTail, route.ended.promise]);
	}
	release(route, error = /* @__PURE__ */ new Error("codex app-server thread route is released")) {
		if (route.released) return;
		route.released = error;
		route.pending.length = 0;
		route.ended.resolve();
		route.activated.resolve();
		route.binding?.resolve();
		route.detachReleaseOn?.();
		route.controller.abort(error);
		if (this.routes.get(route.threadId) === route) this.routes.delete(route.threadId);
	}
	assertActive() {
		if (this.disposed) throw new Error("codex app-server turn router is closed");
	}
	assertRoute(route) {
		if (route.released) throw route.released;
	}
};
async function waitForPromiseOrAbort(promise, signal) {
	if (signal.aborted) return false;
	let removeAbort;
	try {
		return await Promise.race([promise.then(() => true), new Promise((resolve) => {
			const onAbort = () => resolve(false);
			signal.addEventListener("abort", onAbort, { once: true });
			removeAbort = () => signal.removeEventListener("abort", onAbort);
			if (signal.aborted) onAbort();
		})]);
	} finally {
		removeAbort?.();
	}
}
function abortReason(signal) {
	return signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? "codex app-server thread route aborted"));
}
function readScope(value) {
	if (!isJsonObject(value)) return {};
	const threadId = readCodexNotificationThreadId(value);
	const turnId = readCodexNotificationTurnId(value);
	return {
		...threadId ? { threadId } : {},
		...turnId ? { turnId } : {}
	};
}
function requireId(value, label) {
	const normalized = value.trim();
	if (!normalized) throw new Error(`codex app-server ${label} must not be empty`);
	return normalized;
}
//#endregion
//#region extensions/codex/src/app-server/attempt-client-cleanup.ts
/**
* Best-effort cleanup helpers for Codex app-server startup attempts and turns.
*/
/** Timeout for best-effort app-server turn interruption during cleanup. */
const CODEX_APP_SERVER_INTERRUPT_TIMEOUT_MS = 5e3;
/** Timeout for best-effort thread unsubscribe during cleanup. */
const CODEX_APP_SERVER_UNSUBSCRIBE_TIMEOUT_MS = 5e3;
const CODEX_NO_ACTIVE_TURN_ERROR_CODE = -32600;
const CODEX_NO_ACTIVE_TURN_ERROR_MESSAGE = "no active turn to interrupt";
/** Identifies Codex's exact proof that an interrupt target already finished. */
function isCodexAlreadyTerminalInterruptError(error) {
	return error instanceof CodexAppServerRpcError && error.code === CODEX_NO_ACTIVE_TURN_ERROR_CODE && error.message === CODEX_NO_ACTIVE_TURN_ERROR_MESSAGE;
}
/** Raised when a thread subscription may be live on a client OpenClaw no longer controls. */
var CodexAppServerUnsafeSubscriptionError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "CodexAppServerUnsafeSubscriptionError";
	}
};
function isCodexAppServerUnsafeSubscriptionError(error) {
	return error instanceof CodexAppServerUnsafeSubscriptionError;
}
/** Asserts Codex resumed the exact thread this attempt subscribed to. */
function assertCodexThreadResumeSubscription(requestedThreadId, returnedThreadId) {
	if (returnedThreadId !== requestedThreadId) throw new CodexAppServerUnsafeSubscriptionError(`Codex thread/resume returned ${returnedThreadId} for ${requestedThreadId}`);
}
async function closeClientAndWaitIfAvailable(client) {
	const closeable = client;
	if (typeof closeable.closeAndWait === "function") {
		await closeable.closeAndWait();
		return;
	}
	closeable.close?.();
}
async function closeCodexStartupClientBestEffort(client) {
	if (!client) return;
	const retiredSharedClient = retireSharedCodexAppServerClientIfCurrent(client);
	if (!retiredSharedClient || retiredSharedClient.closed) await closeClientAndWaitIfAvailable(client);
}
/** Retires an unsafe turn client without replacing an already-authoritative failure. */
async function retireUnsafeCodexTurnClientBestEffort(client, operation) {
	try {
		await closeCodexStartupClientBestEffort(client);
	} catch (error) {
		embeddedAgentLog.debug("codex app-server unsafe turn client retirement failed", {
			operation,
			error
		});
		try {
			client.close();
		} catch (closeError) {
			embeddedAgentLog.debug("codex app-server unsafe turn client close failed", {
				operation,
				error: closeError
			});
		}
	}
}
/** Sends a bounded turn interrupt and waits for Codex to confirm terminal abort handling. */
async function interruptCodexTurnAndWaitBestEffort(client, params) {
	const timeoutMs = params.timeoutMs && Number.isFinite(params.timeoutMs) && params.timeoutMs > 0 ? params.timeoutMs : CODEX_APP_SERVER_INTERRUPT_TIMEOUT_MS;
	const requestParams = {
		threadId: params.threadId,
		turnId: params.turnId
	};
	let completion;
	try {
		completion = params.turnId ? getCodexAppServerTurnRouter(client).watchNativeTurnCompletion({
			threadId: params.threadId,
			turnId: params.turnId,
			timeoutMs
		}) : void 0;
		await client.request("turn/interrupt", requestParams, { timeoutMs });
		return completion ? await completion.completion : true;
	} catch (error) {
		if (isCodexAlreadyTerminalInterruptError(error)) return true;
		embeddedAgentLog.debug("codex app-server turn interrupt failed during abort", { error });
		return false;
	} finally {
		completion?.cancel();
	}
}
/** Stops native terminals on the cancelled thread without retiring peer threads. */
async function terminateCodexBackgroundTerminals(client, threadId) {
	const options = {
		timeoutMs: CODEX_APP_SERVER_INTERRUPT_TIMEOUT_MS,
		signal: AbortSignal.timeout(CODEX_APP_SERVER_INTERRUPT_TIMEOUT_MS)
	};
	try {
		const { data } = await client.request("thread/backgroundTerminals/list", { threadId }, options);
		for (const { processId } of data) await client.request("thread/backgroundTerminals/terminate", {
			threadId,
			processId
		}, options);
		if (data.length > 0) {
			if ((await client.request("thread/backgroundTerminals/list", {
				threadId,
				limit: 1
			}, options)).data.length > 0) throw new Error("native background terminals remain running");
		}
	} catch (cause) {
		throw new Error("Codex background-terminal cleanup failed; inspect the thread's running terminals before starting more work.", { cause });
	}
}
/** Unsubscribes from a thread while swallowing cleanup-only failures. */
async function unsubscribeCodexThreadBestEffort(client, params) {
	try {
		await unsubscribeCodexAppServerLiveThread(client, params.threadId, params.timeoutMs, params.assertCurrent);
		return true;
	} catch (error) {
		params.assertCurrent?.();
		embeddedAgentLog.debug("codex app-server thread unsubscribe cleanup failed", {
			threadId: params.threadId,
			error
		});
		return false;
	}
}
//#endregion
export { shouldRecordNativeToolTranscript as A, readNonNegativeInteger as B, isSideEffectingNativeToolItem as C, itemTitle as D, itemStatus as E, readHookOutputEntries as F, splitPlanText as H, readItem as I, readItemString as L, extractRawAssistantText as M, normalizeOptionalString$1 as N, matchesCodexSnapshotTurn as O, readCodexErrorNotificationMessage as P, readNonEmptyString as R, isNonSuccessItemStatus as S, itemName as T, readNullableString as V, readCodexNotificationTurnId as _, closeCodexStartupClientBestEffort as a, auditNativeToolUnfinishedStatus as b, isCodexAppServerUnsafeSubscriptionError as c, unsubscribeCodexThreadBestEffort as d, CODEX_APP_SERVER_NATIVE_TURN_WAIT_TIMEOUT_MS as f, readCodexNotificationThreadId as g, isCodexNotificationForTurn as h, assertCodexThreadResumeSubscription as i, shouldSynthesizeToolProgressForItem as j, shouldClearTerminalPresentationForNativeItem as k, retireUnsafeCodexTurnClientBestEffort as l, CodexProjectionDiagnostics as m, CODEX_APP_SERVER_UNSUBSCRIBE_TIMEOUT_MS as n, interruptCodexTurnAndWaitBestEffort as o, getCodexAppServerTurnRouter as p, CodexAppServerUnsafeSubscriptionError as r, isCodexAlreadyTerminalInterruptError as s, CODEX_APP_SERVER_INTERRUPT_TIMEOUT_MS as t, terminateCodexBackgroundTerminals as u, auditNativeToolName as v, itemKind as w, isMutatingNativeToolItem as x, auditNativeToolTerminalStatus as y, readNonEmptyStringArray as z };
