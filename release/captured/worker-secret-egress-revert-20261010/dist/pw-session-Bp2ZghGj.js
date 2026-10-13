import { D as resolveExpiresAtMsFromDurationMs, b as parseFiniteNumber, g as isFutureDateTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { a as asOptionalRecord, u as readStringField } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { b as uniqueValues } from "./string-normalization-DiSb4JeN.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { L as sanitizeUntrustedFileName } from "./fs-safe-Cdu9fYG_.js";
import { t as pruneMapToMaxSize } from "./map-size-CNcWiFKu.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { s as isLoopbackHost } from "./net-CLIrL_-C.js";
import { t as SsrFBlockedError } from "./ssrf-pyUhwHSS.js";
import { t as expectDefined } from "./expect-runtime-CJBt0Gq2.js";
import "./number-runtime-Cy4drVnh.js";
import "./string-coerce-runtime-GQa0ehRA.js";
import { n as rawDataToString } from "./ws-C3ckvj65.js";
import "./text-utility-runtime-ChP15RP5.js";
import "./webhook-ingress-DvQMng9V.js";
import { u as BrowserTabNotFoundError } from "./errors-6hPg4OWh.js";
import "./sdk-security-runtime-EzsrvSuq.js";
import { t as DEFAULT_DOWNLOAD_DIR } from "./paths-cZWqM_58.js";
import "./errors-godh8QKY.js";
import { D as PLAYWRIGHT_TARGET_INFO_TIMEOUT_MS, F as stripCdpUrlCredentials, M as withManagedProxyForCdpUrl, N as withNoProxyForCdpUrl, P as getHeadersWithAuth, _ as openCdpWebSocket, a as fetchJson, c as isWebSocketUrl, f as scopeCdpPolicyToConfiguredEndpoint, l as normalizeCdpHttpBaseForJsonEndpoints, n as assertCdpEndpointAllowed, t as appendCdpPath, u as redactCdpErrorText, v as withCdpSocket, y as getPlaywrightCore } from "./cdp.helpers-BRkS_31t.js";
import { L as withBrowserNavigationPolicy, M as assertBrowserNavigationAllowed, N as assertBrowserNavigationRedirectChainAllowed, P as assertBrowserNavigationResultAllowed, R as readCdpMainFrameDocumentIdentity, j as InvalidBrowserNavigationUrlError, n as getChromeWebSocketEndpoint, p as AX_REF_PATTERN, v as normalizeCdpWsUrl } from "./chrome-lc3LoS6t.js";
import { t as writeExternalFileWithinOutputRoot } from "./output-files-DTr739Kf.js";
import { t as getBorrowedRelayCdpAccess } from "./relay-access-B8A24s4S.js";
import path from "node:path";
import crypto from "node:crypto";
import WebSocket$1 from "ws";
//#region extensions/browser/src/browser/pw-session-contracts.ts
/** Raised when an action is blocked by an observed modal dialog. */
var BrowserObservedDialogBlockedError = class extends Error {
	constructor(browserState) {
		super("Browser action blocked by a modal dialog.");
		this.name = "BrowserObservedDialogBlockedError";
		this.browserState = browserState;
	}
};
/** Type guard for observed-dialog blocked errors. */
function isBrowserObservedDialogBlockedError(err) {
	return err instanceof BrowserObservedDialogBlockedError;
}
const pageStates = /* @__PURE__ */ new WeakMap();
const contextStates = /* @__PURE__ */ new WeakMap();
const observedContexts = /* @__PURE__ */ new WeakSet();
const observedPages = /* @__PURE__ */ new WeakSet();
const cachedByCdpUrl = /* @__PURE__ */ new Map();
const connectingByCdpUrl = /* @__PURE__ */ new Map();
const retainedClosingByCdpUrl = /* @__PURE__ */ new Map();
const closeConnectionPromises = /* @__PURE__ */ new WeakMap();
const closedConnections = /* @__PURE__ */ new WeakSet();
const PLAYWRIGHT_CONNECTION_CLOSE_TIMEOUT_MS = 2e3;
const blockedTargetsByCdpUrl = /* @__PURE__ */ new Set();
const blockedPageRefsByCdpUrl = /* @__PURE__ */ new Map();
//#endregion
//#region extensions/browser/src/browser/pw-download-capture.ts
/** Shared Playwright download capture and output handling. */
function buildManagedDownloadPath(rootDir, fileName) {
	const id = crypto.randomUUID();
	const safeName = sanitizeUntrustedFileName(fileName, "download.bin");
	return path.join(rootDir, `${id}-${safeName}`);
}
/** Validate metadata and atomically save one Playwright download. */
async function saveBrowserDownload(download, opts = {}, onReadyToPublish) {
	const suggestedFilename = download.suggestedFilename?.() || "download.bin";
	const candidate = {
		url: download.url?.() || "",
		suggestedFilename
	};
	await opts.beforeSave?.(candidate);
	opts.signal?.throwIfAborted();
	const saveAs = download.saveAs?.bind(download);
	if (!saveAs) throw new Error("Download cannot be saved");
	const requestedPath = opts.outputPath?.trim();
	const implicitRoot = opts.outputRoot ?? DEFAULT_DOWNLOAD_DIR;
	const managedPath = requestedPath || buildManagedDownloadPath(implicitRoot, suggestedFilename);
	const savedPath = await writeExternalFileWithinOutputRoot({
		rootDir: requestedPath ? opts.outputRoot : implicitRoot,
		path: managedPath,
		write: async (tempPath) => {
			await saveAs(tempPath);
			opts.signal?.throwIfAborted();
			onReadyToPublish?.();
		}
	}).catch((error) => {
		if (!opts.signal?.aborted) download.cancel?.().catch(() => {});
		throw error;
	});
	return {
		...candidate,
		path: savedPath
	};
}
/** Arm one page download while maintaining explicit/passive ownership depth. */
function createDownloadCaptureForPage(page, state, timeoutMs, opts = {}) {
	if (opts.mode !== "explicit" && state.downloadWaiterDepth > 0) return {
		armed: false,
		promise: new Promise(() => {}),
		cancel: () => {}
	};
	state.downloadWaiterDepth += 1;
	const operation = new AbortController();
	let done = false;
	let timer;
	let handler;
	let activeDownload;
	let abort = () => {};
	const releaseWaiter = () => {
		if (handler) {
			state.downloadWaiterDepth = Math.max(0, state.downloadWaiterDepth - 1);
			page.off("download", handler);
			handler = void 0;
		}
	};
	const retireDeadline = () => {
		if (timer) {
			clearTimeout(timer);
			timer = void 0;
		}
	};
	const cleanup = () => {
		done = true;
		releaseWaiter();
		retireDeadline();
		opts.signal?.removeEventListener("abort", abort);
	};
	return {
		armed: true,
		promise: new Promise((resolve, reject) => {
			const rejectCapture = (reason) => {
				if (done) return;
				operation.abort(reason);
				cleanup();
				activeDownload?.cancel?.().catch(() => {});
				reject(reason);
			};
			handler = (download) => {
				if (done) return;
				activeDownload = download;
				releaseWaiter();
				saveBrowserDownload(activeDownload, {
					...opts,
					signal: operation.signal
				}, () => {
					opts.signal?.removeEventListener("abort", abort);
					retireDeadline();
				}).finally(cleanup).then(resolve, reject);
			};
			page.on("download", handler);
			timer = setTimeout(() => {
				rejectCapture(new Error(opts.timeoutMessage ?? "Timeout waiting for download"));
			}, Math.max(1, timeoutMs));
			timer.unref?.();
			abort = () => {
				const reason = opts.signal?.reason;
				rejectCapture(reason instanceof Error ? reason : /* @__PURE__ */ new Error("Download wait was cancelled"));
			};
			opts.signal?.addEventListener("abort", abort, { once: true });
			if (opts.signal?.aborted) abort();
		}),
		cancel: () => {
			if (done || activeDownload) return;
			cleanup();
		}
	};
}
//#endregion
//#region extensions/browser/src/browser/pw-session-dialogs.ts
function resolveObservedDialogTimeoutMs(timeoutMs) {
	const parsed = parseFiniteNumber(timeoutMs);
	return Math.max(1, Math.floor(parsed ?? 12e4));
}
function appendRecentDialog(state, record) {
	state.recentDialogs.push(record);
	while (state.recentDialogs.length > 20) state.recentDialogs.shift();
}
function serializeDialogRecord(dialog) {
	return {
		id: dialog.id,
		type: dialog.type,
		message: dialog.message,
		...dialog.defaultValue !== void 0 ? { defaultValue: dialog.defaultValue } : {},
		openedAt: dialog.openedAt,
		...dialog.closedAt !== void 0 ? { closedAt: dialog.closedAt } : {},
		...dialog.closedBy !== void 0 ? { closedBy: dialog.closedBy } : {}
	};
}
function serializePendingDialog(dialog) {
	return serializeDialogRecord(dialog);
}
function serializeObservedBrowserState(state) {
	return { dialogs: {
		pending: state.pendingDialogs.map(serializePendingDialog),
		recent: state.recentDialogs.map(serializeDialogRecord)
	} };
}
function clearArmedDialogResponse(state) {
	if (state.armedDialogResponse?.timer) clearTimeout(state.armedDialogResponse.timer);
	state.armedDialogResponse = void 0;
}
function abortActionsBlockedByDialog(state, reason) {
	if (state.dialogAbortControllers.size === 0) return;
	const err = reason ?? new BrowserObservedDialogBlockedError(serializeObservedBrowserState(state));
	for (const controller of state.dialogAbortControllers) if (!controller.signal.aborted) controller.abort(err);
	state.dialogAbortControllers.clear();
}
function isNoDialogShowingError(err) {
	return (err instanceof Error ? err.message : String(err)).toLowerCase().includes("no dialog is showing");
}
async function settleObservedDialog(params) {
	const { state, pending } = params;
	state.pendingDialogs = state.pendingDialogs.filter((dialog) => dialog.id !== pending.id);
	let closedBy = params.closedBy;
	try {
		if (params.accept) await pending.dialog.accept(params.promptText);
		else await pending.dialog.dismiss();
	} catch (err) {
		if (!isNoDialogShowingError(err)) throw err;
		closedBy = "remote";
	}
	const record = {
		id: pending.id,
		type: pending.type,
		message: pending.message,
		...pending.defaultValue !== void 0 ? { defaultValue: pending.defaultValue } : {},
		openedAt: pending.openedAt,
		closedAt: (/* @__PURE__ */ new Date()).toISOString(),
		closedBy
	};
	appendRecentDialog(state, record);
	return record;
}
function observeDialog(pageState, dialog) {
	pageState.nextObservedDialogId += 1;
	const type = dialog.type();
	const defaultValue = dialog.defaultValue();
	const pending = {
		id: `d${pageState.nextObservedDialogId}`,
		type,
		message: dialog.message(),
		openedAt: (/* @__PURE__ */ new Date()).toISOString(),
		dialog,
		...type === "prompt" ? { defaultValue } : {}
	};
	pageState.pendingDialogs.push(pending);
	const armed = pageState.armedDialogResponse;
	if (armed && isFutureDateTimestampMs(armed.expiresAt)) {
		clearArmedDialogResponse(pageState);
		settleObservedDialog({
			state: pageState,
			pending,
			accept: armed.accept,
			...armed.promptText !== void 0 ? { promptText: armed.promptText } : {},
			closedBy: "armed"
		}).catch((err) => abortActionsBlockedByDialog(pageState, err));
		return;
	}
	if (armed) clearArmedDialogResponse(pageState);
	abortActionsBlockedByDialog(pageState);
}
function resolvePendingDialogForResponse(params) {
	const dialogId = normalizeOptionalString(params.dialogId);
	if (dialogId) {
		const found = params.state.pendingDialogs.find((dialog) => dialog.id === dialogId);
		if (found) return found;
		throw new Error(`Dialog "${dialogId}" is not pending.`);
	}
	if (params.state.pendingDialogs.length === 1) return expectDefined(params.state.pendingDialogs.at(0), "single pending browser dialog");
	if (params.state.pendingDialogs.length > 1) throw new Error("Multiple dialogs are pending; pass dialogId.");
	throw new Error("No dialog is pending.");
}
/** Respond to a pending observed dialog on a page. */
//#endregion
//#region extensions/browser/src/browser/pw-session-state.ts
const roleRefsByTarget = /* @__PURE__ */ new Map();
const MAX_ROLE_REFS_CACHE = 50;
let roleRefsCacheGeneration = 0;
const MAX_OBSERVED_PAGE_TEXT_CHARS = 2048;
function truncateObservedPageText(value) {
	return truncateUtf16Safe(value, MAX_OBSERVED_PAGE_TEXT_CHARS);
}
function normalizeCdpUrl(raw) {
	return raw.replace(/\/$/, "");
}
function targetKey(cdpUrl, targetId) {
	return `${normalizeCdpUrl(cdpUrl)}::${targetId}`;
}
function roleRefsKey(cdpUrl, targetId) {
	return targetKey(cdpUrl, targetId);
}
function bindRoleRefsTarget(page, cdpUrl, targetId) {
	const normalizedTargetId = normalizeOptionalString(targetId ?? void 0);
	if (!normalizedTargetId) return;
	const state = ensurePageState(page);
	const key = roleRefsKey(cdpUrl, normalizedTargetId);
	const invalidBeforeGeneration = state.roleRefsInvalidBeforeGeneration;
	const ariaInvalidBeforeGeneration = state.roleRefsAriaInvalidBeforeGeneration;
	const cached = roleRefsByTarget.get(key);
	if (cached && (invalidBeforeGeneration !== void 0 && cached.generation <= invalidBeforeGeneration || ariaInvalidBeforeGeneration !== void 0 && cached.mode === "aria" && cached.generation <= ariaInvalidBeforeGeneration)) roleRefsByTarget.delete(key);
	state.roleRefsInvalidBeforeGeneration = void 0;
	state.roleRefsAriaInvalidBeforeGeneration = void 0;
	state.roleRefsTargetKey = key;
	if (!state.roleRefs) state.roleRefsTargetGeneration = roleRefsByTarget.get(key)?.generation;
}
/** Cache role refs for a target id after a snapshot. */
function rememberRoleRefsForTarget(opts) {
	const targetId = normalizeOptionalString(opts.targetId) ?? "";
	if (!targetId) return;
	const key = roleRefsKey(opts.cdpUrl, targetId);
	if (opts.frameSelector) {
		roleRefsByTarget.delete(key);
		return;
	}
	const generation = ++roleRefsCacheGeneration;
	roleRefsByTarget.set(key, {
		refs: opts.refs,
		...opts.mode ? { mode: opts.mode } : {},
		generation
	});
	pruneMapToMaxSize(roleRefsByTarget, MAX_ROLE_REFS_CACHE);
	return generation;
}
/** Store role refs on the page and target cache. */
function storeRoleRefsForTarget(opts) {
	if (opts.frameSelector && !opts.frame) throw new Error("Frame-scoped role refs require their resolved frame.");
	const state = ensurePageState(opts.page);
	state.roleRefs = opts.refs;
	state.roleRefsFrameSelector = opts.frameSelector;
	state.roleRefsFrame = opts.frame;
	state.roleRefsMode = opts.mode;
	const targetId = normalizeOptionalString(opts.targetId);
	if (!targetId) {
		state.roleRefsTargetKey = void 0;
		state.roleRefsTargetGeneration = void 0;
		return;
	}
	bindRoleRefsTarget(opts.page, opts.cdpUrl, targetId);
	state.roleRefsTargetGeneration = rememberRoleRefsForTarget({
		cdpUrl: opts.cdpUrl,
		targetId,
		refs: opts.refs,
		frameSelector: opts.frameSelector,
		mode: opts.mode
	});
}
function clearRoleRefs(state) {
	if (state.roleRefsTargetKey) {
		if (roleRefsByTarget.get(state.roleRefsTargetKey)?.generation === state.roleRefsTargetGeneration) roleRefsByTarget.delete(state.roleRefsTargetKey);
	}
	state.roleRefs = void 0;
	state.roleRefsMode = void 0;
	state.roleRefsFrameSelector = void 0;
	state.roleRefsFrame = void 0;
	state.roleRefsTargetKey = void 0;
	state.roleRefsTargetGeneration = void 0;
}
function currentTargetRoleRefsMode(state) {
	if (!state.roleRefsTargetKey) return;
	const cached = roleRefsByTarget.get(state.roleRefsTargetKey);
	return cached && cached.generation === state.roleRefsTargetGeneration ? cached.mode : void 0;
}
/** Restore cached role refs onto a newly resolved page. */
function restoreRoleRefsForTarget(opts) {
	const targetId = normalizeOptionalString(opts.targetId) ?? "";
	if (!targetId) return;
	const cacheKey = roleRefsKey(opts.cdpUrl, targetId);
	bindRoleRefsTarget(opts.page, opts.cdpUrl, targetId);
	const cached = roleRefsByTarget.get(cacheKey);
	if (!cached) return;
	const state = ensurePageState(opts.page);
	if (state.roleRefs) return;
	state.roleRefsTargetKey = cacheKey;
	state.roleRefsTargetGeneration = cached.generation;
	state.roleRefs = cached.refs;
	state.roleRefsMode = cached.mode;
}
/** Ensure and attach state listeners for a Playwright page. */
function ensurePageState(page) {
	const existing = pageStates.get(page);
	if (existing) return existing;
	const state = {
		console: [],
		errors: [],
		requests: /* @__PURE__ */ new Map(),
		requestIds: /* @__PURE__ */ new WeakMap(),
		nextRequestId: 0,
		armIdUpload: 0,
		armIdDownload: 0,
		downloadWaiterDepth: 0,
		nextObservedDialogId: 0,
		pendingDialogs: [],
		recentDialogs: [],
		dialogAbortControllers: /* @__PURE__ */ new Set()
	};
	pageStates.set(page, state);
	if (!observedPages.has(page)) {
		observedPages.add(page);
		page.on("console", (msg) => {
			const location = msg.location();
			const entry = {
				type: truncateObservedPageText(msg.type()),
				text: truncateObservedPageText(msg.text()),
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				location: {
					...location,
					url: truncateObservedPageText(location.url)
				}
			};
			state.console.push(entry);
			if (state.console.length > 500) state.console.shift();
		});
		page.on("pageerror", (err) => {
			state.errors.push({
				message: truncateObservedPageText(err.message || String(err)),
				name: err.name ? truncateObservedPageText(err.name) : void 0,
				stack: err.stack ? truncateObservedPageText(err.stack) : void 0,
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
			if (state.errors.length > 200) state.errors.shift();
		});
		page.on("request", (req) => {
			state.nextRequestId += 1;
			const id = `r${state.nextRequestId}`;
			state.requestIds.set(req, id);
			state.requests.set(id, {
				id,
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				method: req.method(),
				url: truncateObservedPageText(req.url()),
				resourceType: req.resourceType()
			});
			pruneMapToMaxSize(state.requests, 500);
		});
		page.on("response", (resp) => {
			const req = resp.request();
			const id = state.requestIds.get(req);
			if (!id) return;
			const rec = state.requests.get(id);
			if (!rec) return;
			rec.status = resp.status();
			rec.ok = resp.ok();
		});
		page.on("requestfailed", (req) => {
			const id = state.requestIds.get(req);
			if (!id) return;
			const rec = state.requests.get(id);
			if (!rec) return;
			const failureText = req.failure()?.errorText;
			rec.failureText = failureText ? truncateObservedPageText(failureText) : void 0;
			rec.ok = false;
		});
		page.on("dialog", (dialog) => {
			observeDialog(state, dialog);
		});
		page.on("download", (download) => {
			if (state.downloadWaiterDepth > 0) return;
			const actionCapture = state.actionDownloadCapture;
			const beforeSave = actionCapture?.beforeSave;
			const managedSave = saveBrowserDownload(download, actionCapture && beforeSave ? { beforeSave: (candidate) => {
				const validation = Promise.resolve().then(() => beforeSave(candidate));
				actionCapture.validations.push(validation);
				return validation;
			} } : void 0);
			managedSave.catch(() => {});
			download.path = async () => (await managedSave).path;
			if (actionCapture) actionCapture.lastEventAtMs = Date.now();
			actionCapture?.pending.push(managedSave);
			for (const finish of actionCapture?.waiters.splice(0) ?? []) finish();
		});
		page.on("framenavigated", (frame) => {
			const isMainFrame = frame === page.mainFrame();
			if (!(state.roleRefsTargetKey !== void 0)) {
				if (isMainFrame) state.roleRefsInvalidBeforeGeneration = roleRefsCacheGeneration;
				else state.roleRefsAriaInvalidBeforeGeneration = roleRefsCacheGeneration;
			}
			const pageWideAriaRefs = state.roleRefsMode === "aria" || currentTargetRoleRefsMode(state) === "aria";
			if (isMainFrame || pageWideAriaRefs || frame === state.roleRefsFrame) clearRoleRefs(state);
		});
		page.on("framedetached", (frame) => {
			if (!state.roleRefsTargetKey) {
				if (frame === page.mainFrame()) state.roleRefsInvalidBeforeGeneration = roleRefsCacheGeneration;
				else state.roleRefsAriaInvalidBeforeGeneration = roleRefsCacheGeneration;
			}
			if (state.roleRefsMode === "aria" || currentTargetRoleRefsMode(state) === "aria" || frame === state.roleRefsFrame) clearRoleRefs(state);
		});
		page.on("close", () => {
			const emulationSession = state.emulation?.session;
			state.emulation = void 0;
			emulationSession?.then((session) => session.detach()).catch(() => {});
			clearArmedDialogResponse(state);
			for (const controller of state.dialogAbortControllers) if (!controller.signal.aborted) controller.abort(/* @__PURE__ */ new Error("Page closed before browser action completed."));
			state.dialogAbortControllers.clear();
			state.pendingDialogs = [];
			pageStates.delete(page);
			observedPages.delete(page);
		});
	}
	return state;
}
/** Read observed dialog state from a Playwright page. */
function getObservedBrowserStateForPage(page) {
	return serializeObservedBrowserState(ensurePageState(page));
}
/** Resolve a page and read its observed browser state. */
async function respondToObservedDialogOnPage(opts) {
	const state = ensurePageState(opts.page);
	return await settleObservedDialog({
		state,
		pending: resolvePendingDialogForResponse({
			state,
			...opts.dialogId !== void 0 ? { dialogId: opts.dialogId } : {}
		}),
		accept: opts.accept,
		...opts.promptText !== void 0 ? { promptText: opts.promptText } : {},
		closedBy: opts.closedBy ?? "agent"
	});
}
/** Mark pending observed dialogs as handled by a remote/browser-side hook. */
function markObservedDialogsHandledRemotelyForPage(page) {
	const state = ensurePageState(page);
	const pending = state.pendingDialogs.splice(0);
	const closedAt = (/* @__PURE__ */ new Date()).toISOString();
	for (const dialog of pending) appendRecentDialog(state, {
		id: dialog.id,
		type: dialog.type,
		message: dialog.message,
		...dialog.defaultValue !== void 0 ? { defaultValue: dialog.defaultValue } : {},
		openedAt: dialog.openedAt,
		closedAt,
		closedBy: "remote"
	});
	return serializeObservedBrowserState(state);
}
/** Arm a one-shot automatic dialog response for a page. */
function armObservedDialogResponseOnPage(opts) {
	const state = ensurePageState(opts.page);
	clearArmedDialogResponse(state);
	const timeoutMs = resolveObservedDialogTimeoutMs(opts.timeoutMs);
	const expiresAt = resolveExpiresAtMsFromDurationMs(timeoutMs);
	if (expiresAt === void 0) return;
	const response = {
		accept: opts.accept,
		expiresAt,
		...opts.promptText !== void 0 ? { promptText: opts.promptText } : {}
	};
	response.timer = setTimeout(() => {
		if (state.armedDialogResponse === response) state.armedDialogResponse = void 0;
	}, timeoutMs);
	state.armedDialogResponse = response;
}
/** Create an abort signal that fires while a dialog blocks the page. */
function createObservedDialogAbortSignalForPage(opts) {
	const state = ensurePageState(opts.page);
	const controller = new AbortController();
	const abortForCurrentDialog = () => {
		if (!controller.signal.aborted) controller.abort(new BrowserObservedDialogBlockedError(serializeObservedBrowserState(state)));
	};
	const abortForParent = () => {
		if (!controller.signal.aborted) controller.abort(opts.parentSignal?.reason ?? /* @__PURE__ */ new Error("aborted"));
	};
	if (state.pendingDialogs.length > 0) abortForCurrentDialog();
	else state.dialogAbortControllers.add(controller);
	if (opts.parentSignal) {
		if (opts.parentSignal.aborted) abortForParent();
		else opts.parentSignal.addEventListener("abort", abortForParent, { once: true });
	}
	return {
		signal: controller.signal,
		cleanup: () => {
			state.dialogAbortControllers.delete(controller);
			opts.parentSignal?.removeEventListener("abort", abortForParent);
		}
	};
}
//#endregion
//#region extensions/browser/src/browser/pw-session-downloads.ts
function isDownloadStartingNavigationError(err, expectedUrl) {
	const message = formatErrorMessage(err).toLowerCase();
	if (message.includes("download is starting")) return true;
	const normalizedUrl = normalizeOptionalString(expectedUrl)?.toLowerCase();
	return Boolean(normalizedUrl && message.includes("net::err_aborted") && message.includes(normalizedUrl));
}
/** Capture downloads started synchronously by one Browser action. */
function beginActionDownloadCaptureOnPage(page, opts = {}) {
	const state = ensurePageState(page);
	const capture = {
		pending: [],
		validations: [],
		waiters: [],
		...opts.beforeSave ? { beforeSave: opts.beforeSave } : {}
	};
	state.actionDownloadCapture = capture;
	const detach = () => {
		if (state.actionDownloadCapture === capture) state.actionDownloadCapture = void 0;
		for (const finish of capture.waiters.splice(0)) finish();
	};
	return {
		drain: async (drainOpts = {}) => {
			const waitForEvent = async (timeoutMs) => {
				await new Promise((resolve) => {
					const finish = () => {
						clearTimeout(timer);
						capture.waiters = capture.waiters.filter((waiter) => waiter !== finish);
						resolve();
					};
					const timer = setTimeout(finish, timeoutMs);
					capture.waiters.push(finish);
				});
			};
			const firstEventGraceMs = Math.max(0, drainOpts.firstEventGraceMs ?? 0);
			const maxWaitMs = Math.max(0, drainOpts.maxWaitMs ?? Number.POSITIVE_INFINITY);
			const deadlineAtMs = Date.now() + maxWaitMs;
			const remainingBudgetMs = () => Math.max(0, deadlineAtMs - Date.now());
			if (capture.pending.length === 0 && firstEventGraceMs > 0) await waitForEvent(Math.min(firstEventGraceMs, remainingBudgetMs()));
			const quietMs = Math.max(0, drainOpts.quietMs ?? 0);
			if (quietMs > 0) while (capture.lastEventAtMs !== void 0) {
				const remainingQuietMs = Math.min(quietMs - (Date.now() - capture.lastEventAtMs), remainingBudgetMs());
				if (remainingQuietMs <= 0) break;
				await waitForEvent(remainingQuietMs);
			}
			detach();
			const pending = capture.pending.slice();
			await Promise.all(capture.validations.slice());
			const downloads = await Promise.all(pending);
			return downloads.length > 0 ? downloads : void 0;
		},
		dispose: detach
	};
}
//#endregion
//#region extensions/browser/src/browser/pw-session-cdp-transport.ts
const FIRST_INTERNAL_COMMAND_ID = -1e4;
function contextlessTargetParams(message) {
	if (readStringField(message, "method") !== "Target.attachedToTarget") return;
	const params = asOptionalRecord(message.params);
	const targetInfo = asOptionalRecord(params?.targetInfo);
	if (readStringField(message, "sessionId") || readStringField(targetInfo, "type") === "browser" || readStringField(targetInfo, "browserContextId")) return;
	return params ?? {};
}
async function openCdpTransportSocket(connectionUrl, opts) {
	const resolvedConnectionUrl = isWebSocketUrl(connectionUrl) ? connectionUrl : await opts.resolveWebSocketUrl?.();
	if (!resolvedConnectionUrl) throw new Error("CDP endpoint did not expose a usable WebSocket URL.");
	const ws = openCdpWebSocket(resolvedConnectionUrl, {
		headers: opts.headers,
		handshakeTimeoutMs: opts.timeout,
		lookup: opts.lookup,
		playwrightTransportDefaults: true
	});
	try {
		await new Promise((resolve, reject) => {
			ws.once("open", () => resolve());
			ws.once("error", reject);
			ws.once("close", () => reject(/* @__PURE__ */ new Error("CDP socket closed")));
		});
	} catch (error) {
		ws.close();
		throw error;
	}
	const wire = {
		send: (message) => ws.send(JSON.stringify(message)),
		close: () => {
			ws.close();
			setTimeout(() => {
				if (ws.readyState !== WebSocket$1.CLOSED) ws.terminate();
			}, 100).unref?.();
		}
	};
	ws.on("message", (raw) => {
		try {
			const parsed = asOptionalRecord(JSON.parse(rawDataToString(raw)));
			if (!parsed) {
				wire.close();
				return;
			}
			wire.onmessage?.(parsed);
		} catch {
			wire.close();
		}
	});
	ws.on("close", () => wire.onclose?.("CDP socket closed"));
	ws.on("error", (error) => wire.onclose?.(formatErrorMessage(error)));
	return wire;
}
async function connectOverCdpTransport(connectionUrl, opts) {
	const wire = opts.preparedTransport ?? await openCdpTransportSocket(connectionUrl, opts);
	try {
		let onMessage;
		let onClose;
		const pendingMessages = [];
		let pendingCloseReason;
		let transportClosed = false;
		let closingReason;
		let transportCloseScheduled = false;
		let nextInternalCommandId = FIRST_INTERNAL_COMMAND_ID;
		const pendingContextlessTargetResumes = /* @__PURE__ */ new Map();
		const notifyTransportClosed = (reason) => {
			if (transportClosed) return;
			transportClosed = true;
			if (onClose) {
				onClose(reason);
				return;
			}
			pendingCloseReason = reason;
		};
		const scheduleTransportClosed = (reason) => {
			if (transportClosed || transportCloseScheduled) return;
			transportCloseScheduled = true;
			setImmediate(() => {
				transportCloseScheduled = false;
				notifyTransportClosed(reason);
			});
		};
		const closeTransportSocket = (reason = "CDP socket closed") => {
			closingReason = reason;
			wire.close();
		};
		const sendInternalCommand = (method, params, sessionId) => {
			const id = nextInternalCommandId--;
			wire.send({
				id,
				method,
				...params ? { params } : {},
				sessionId
			});
			return id;
		};
		const releaseContextlessTarget = (params) => {
			const sessionId = readStringField(params, "sessionId");
			if (!sessionId) return;
			const resumeId = sendInternalCommand("Runtime.runIfWaitingForDebugger", void 0, sessionId);
			pendingContextlessTargetResumes.set(resumeId, sessionId);
		};
		const scheduleMessage = (message) => {
			setImmediate(() => {
				if (transportClosed || closingReason) return;
				if (!onMessage) {
					pendingMessages.push(message);
					return;
				}
				try {
					onMessage(message);
				} catch (error) {
					closeTransportSocket(formatErrorMessage(error));
				}
			});
		};
		const transport = {
			send: (message) => {
				if (closingReason || transportClosed) throw new Error("CDP transport closed");
				wire.send(message);
			},
			close: () => {
				closeTransportSocket();
			},
			get onmessage() {
				return onMessage;
			},
			set onmessage(handler) {
				onMessage = handler;
				if (!handler) return;
				while (pendingMessages.length > 0) {
					const pending = pendingMessages.shift();
					if (pending) scheduleMessage(pending);
				}
			},
			get onclose() {
				return onClose;
			},
			set onclose(handler) {
				onClose = handler;
				if (handler && pendingCloseReason !== void 0) {
					const reason = pendingCloseReason;
					pendingCloseReason = void 0;
					handler(reason);
				}
			}
		};
		Object.assign(wire, {
			onmessage: (message) => {
				try {
					const parsed = asOptionalRecord(message);
					if (!parsed) {
						closeTransportSocket();
						return;
					}
					const id = parsed.id;
					if (typeof id === "number" && id <= FIRST_INTERNAL_COMMAND_ID) {
						const targetSessionId = pendingContextlessTargetResumes.get(id);
						if (targetSessionId) {
							pendingContextlessTargetResumes.delete(id);
							sendInternalCommand("Target.detachFromTarget", { sessionId: targetSessionId });
						}
						return;
					}
					const contextlessParams = contextlessTargetParams(parsed);
					if (contextlessParams) {
						releaseContextlessTarget(contextlessParams);
						return;
					}
					scheduleMessage(parsed);
				} catch {
					closeTransportSocket();
				}
			},
			onclose: (reason) => scheduleTransportClosed(closingReason ?? reason ?? "CDP socket closed")
		});
		return await getPlaywrightCore().chromium.connectOverCDP(transport, { timeout: opts.timeout });
	} catch (error) {
		wire.close();
		throw error;
	}
}
//#endregion
//#region extensions/browser/src/browser/extension-relay/owner-playwright.ts
const operationConnections = /* @__PURE__ */ new WeakMap();
async function closeRelayOperationConnection(reference) {
	const pending = operationConnections.get(reference);
	if (!pending) return;
	await (await pending).close();
	if (operationConnections.get(reference) === pending) operationConnections.delete(reference);
}
async function connectRelayBrowser(relay, cdpUrl, reference) {
	const existing = reference && operationConnections.get(reference);
	if (existing) {
		const browser = await existing;
		relay.client.assertCurrent();
		if (!await reference.resolve()) throw new Error("Captured relay connection was superseded");
		return browser;
	}
	const pending = (async () => {
		const browser = await connectOverCdpTransport(cdpUrl, {
			timeout: 5e3,
			headers: {},
			preparedTransport: await (reference ? reference.openTransport() : relay.client.openTransport())
		});
		try {
			if (getBorrowedRelayCdpAccess(cdpUrl) !== relay || reference && !await reference.resolve()) throw new Error("Captured relay connection was superseded");
			return browser;
		} catch (error) {
			await browser.close();
			throw error;
		}
	})();
	if (reference) {
		operationConnections.set(reference, pending);
		pending.catch(() => {
			if (operationConnections.get(reference) === pending) operationConnections.delete(reference);
		});
	}
	return await pending;
}
//#endregion
//#region extensions/browser/src/browser/pw-session-page-target.ts
const targetInfoReads = /* @__PURE__ */ new WeakMap();
async function readPageTargetInfo(page) {
	let session;
	// vbrowser-target-identity-diagnostic-v1
	const diagnosticAt = Date.now();
	let diagnosticStage = "attach";
	let timer;
	let timedOut = false;
	let detachStarted = false;
	const detach = () => {
		if (!session || detachStarted) return;
		detachStarted = true;
		session.detach().catch(() => {});
	};
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => {
			timedOut = true;
			console.warn("[vbrowser-target-identity] " + JSON.stringify({kind:"timeout",stage:diagnosticStage,elapsedMs:Date.now()-diagnosticAt}));
			detach();
			resolve(null);
		}, PLAYWRIGHT_TARGET_INFO_TIMEOUT_MS);
		timer.unref?.();
	});
	const read = (async () => {
		session = await page.context().newCDPSession(page);
		if (timedOut) {
			detach();
			return null;
		}
		try {
			diagnosticStage = "getTargetInfo";
			const { targetInfo } = await session.send("Target.getTargetInfo");
			const targetId = normalizeOptionalString(targetInfo.targetId) ?? "";
			if (!targetId) return null;
			return {
				targetId,
				title: targetInfo.title
			};
		} finally {
			detach();
		}
	})();
	try {
		return await Promise.race([read, timeout]);
	} catch (error) {
		console.warn("[vbrowser-target-identity] " + JSON.stringify({kind:"error",stage:diagnosticStage,elapsedMs:Date.now()-diagnosticAt,error:redactCdpErrorText(String(error)).slice(0,400)}));
		throw error;
	} finally {
		if (timer) clearTimeout(timer);
	}
}
function pageTargetInfo(page) {
	const existing = targetInfoReads.get(page);
	if (existing) return existing;
	const pending = readPageTargetInfo(page);
	targetInfoReads.set(page, pending);
	const evict = () => {
		if (targetInfoReads.get(page) === pending) targetInfoReads.delete(page);
	};
	pending.then(evict, evict);
	return pending;
}
//#endregion
//#region extensions/browser/src/browser/pw-session-connection.ts
function resolveCdpConnectRetryDelayMs(attempt) {
	return 250 + attempt * 250;
}
function hasCachedPlaywrightBrowserConnection(cdpUrl) {
	return cachedByCdpUrl.has(normalizeCdpUrl(cdpUrl));
}
function isRecoverablePlaywrightDisconnectError(err) {
	const message = formatErrorMessage(err).toLowerCase();
	return message.includes("target page, context or browser has been closed") || message.includes("browser has been closed") || message.includes("browser disconnected") || message.includes("target closed") || message.includes("connection closed") || message.includes("websocket closed") || message.includes("cdp socket closed");
}
function isRecoverableStalePageSelectionError(err, reusedCachedBrowser) {
	if (!reusedCachedBrowser) return false;
	if (err instanceof Error && err.message.includes("No pages available in the connected browser.")) return true;
	if (err instanceof BrowserTabNotFoundError) return true;
	return (err instanceof Error ? err.message : formatErrorMessage(err)).toLowerCase().includes("tab not found");
}
function isBlockedTarget(cdpUrl, targetId) {
	const normalizedTargetId = normalizeOptionalString(targetId) ?? "";
	if (!normalizedTargetId) return false;
	return blockedTargetsByCdpUrl.has(targetKey(cdpUrl, normalizedTargetId));
}
function markTargetBlocked(cdpUrl, targetId) {
	const normalizedTargetId = normalizeOptionalString(targetId) ?? "";
	if (!normalizedTargetId) return;
	blockedTargetsByCdpUrl.add(targetKey(cdpUrl, normalizedTargetId));
}
function clearBlockedTarget(cdpUrl, targetId) {
	const normalizedTargetId = normalizeOptionalString(targetId) ?? "";
	if (!normalizedTargetId) return;
	blockedTargetsByCdpUrl.delete(targetKey(cdpUrl, normalizedTargetId));
}
function clearBlockedTargetsForCdpUrl(cdpUrl) {
	if (!cdpUrl) {
		blockedTargetsByCdpUrl.clear();
		return;
	}
	const prefix = `${normalizeCdpUrl(cdpUrl)}::`;
	for (const key of blockedTargetsByCdpUrl) if (key.startsWith(prefix)) blockedTargetsByCdpUrl.delete(key);
}
function blockedPageRefsForCdpUrl(cdpUrl) {
	const normalized = normalizeCdpUrl(cdpUrl);
	const existing = blockedPageRefsByCdpUrl.get(normalized);
	if (existing) return existing;
	const created = /* @__PURE__ */ new WeakSet();
	blockedPageRefsByCdpUrl.set(normalized, created);
	return created;
}
function isBlockedPageRef(cdpUrl, page) {
	return blockedPageRefsByCdpUrl.get(normalizeCdpUrl(cdpUrl))?.has(page) ?? false;
}
function markPageRefBlocked(cdpUrl, page) {
	blockedPageRefsForCdpUrl(cdpUrl).add(page);
}
function clearBlockedPageRefsForCdpUrl(cdpUrl) {
	if (!cdpUrl) {
		blockedPageRefsByCdpUrl.clear();
		return;
	}
	blockedPageRefsByCdpUrl.delete(normalizeCdpUrl(cdpUrl));
}
function clearBlockedPageRef(cdpUrl, page) {
	blockedPageRefsByCdpUrl.get(normalizeCdpUrl(cdpUrl))?.delete(page);
}
function takeCachedPlaywrightBrowserConnection(cdpUrl) {
	const normalized = normalizeCdpUrl(cdpUrl);
	const cur = cachedByCdpUrl.get(normalized);
	cachedByCdpUrl.delete(normalized);
	const pending = connectingByCdpUrl.get(normalized);
	if (pending) pending.attempt.cancelled = true;
	connectingByCdpUrl.delete(normalized);
	if (!cur) return null;
	if (cur.onDisconnected && typeof cur.browser.off === "function") cur.browser.off("disconnected", cur.onDisconnected);
	return cur;
}
/** Raised when a page target has been quarantined after policy denial. */
var BlockedBrowserTargetError = class extends Error {
	constructor() {
		super("Browser target is unavailable after SSRF policy blocked its navigation.");
		this.name = "BlockedBrowserTargetError";
	}
};
function retainClosingPlaywrightConnection(connection) {
	const retained = retainedClosingByCdpUrl.get(connection.cdpUrl) ?? /* @__PURE__ */ new Set();
	retained.add(connection);
	retainedClosingByCdpUrl.set(connection.cdpUrl, retained);
}
function releaseClosingPlaywrightConnection(connection) {
	const retained = retainedClosingByCdpUrl.get(connection.cdpUrl);
	retained?.delete(connection);
	if (retained?.size === 0) retainedClosingByCdpUrl.delete(connection.cdpUrl);
}
async function closeTrackedPlaywrightConnection(connection) {
	if (closedConnections.has(connection)) return;
	const existing = closeConnectionPromises.get(connection);
	if (existing) return await existing;
	retainClosingPlaywrightConnection(connection);
	const closing = (async () => {
		try {
			await connection.browser.close();
			closedConnections.add(connection);
			releaseClosingPlaywrightConnection(connection);
		} finally {
			closeConnectionPromises.delete(connection);
		}
	})();
	closeConnectionPromises.set(connection, closing);
	return await closing;
}
async function withPlaywrightCloseTimeout(task) {
	let timer;
	try {
		await Promise.race([task, new Promise((_, reject) => {
			timer = setTimeout(() => reject(/* @__PURE__ */ new Error("Playwright adapter disconnect timed out.")), PLAYWRIGHT_CONNECTION_CLOSE_TIMEOUT_MS);
			timer.unref?.();
		})]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
/** Capture and retire only the adapter handles currently owned by one lifecycle transition. */
function retirePlaywrightBrowserConnectionExact(opts) {
	const normalized = normalizeCdpUrl(opts.cdpUrl);
	clearBlockedTargetsForCdpUrl(normalized);
	clearBlockedPageRefsForCdpUrl(normalized);
	const connections = /* @__PURE__ */ new Set();
	const closeAttempts = /* @__PURE__ */ new Map();
	const pendingCollections = /* @__PURE__ */ new Set();
	let retired = false;
	const startClosing = () => {
		for (const connection of connections) {
			if (closeAttempts.has(connection)) continue;
			const closing = closeTrackedPlaywrightConnection(connection);
			closeAttempts.set(connection, closing);
			closing.catch(() => {});
		}
	};
	const awaitClosing = async () => {
		const attempts = [...closeAttempts];
		const results = await Promise.allSettled(attempts.map(([, closing]) => closing));
		let firstError;
		for (const [index, result] of results.entries()) if (result.status === "rejected") {
			const [connection, closing] = attempts[index] ?? [];
			if (connection && closeAttempts.get(connection) === closing) closeAttempts.delete(connection);
			firstError ??= toErrorObject(result.reason, "Playwright adapter disconnect failed.");
		}
		if (firstError) throw firstError;
	};
	const capture = () => {
		const pending = connectingByCdpUrl.get(normalized);
		const cached = takeCachedPlaywrightBrowserConnection(normalized);
		for (const connection of retainedClosingByCdpUrl.get(normalized) ?? []) connections.add(connection);
		if (cached) {
			connections.add(cached);
			retainClosingPlaywrightConnection(cached);
		}
		if (pending) {
			const collection = pending.promise.then((connection) => {
				connections.add(connection);
			}, () => {
				if (pending.attempt.retired) connections.add(pending.attempt.retired);
			});
			pendingCollections.add(collection);
			collection.then(() => {
				pendingCollections.delete(collection);
				startClosing();
			});
		}
		startClosing();
		const captured = Boolean(pending || connections.size > 0);
		retired ||= captured;
		return captured;
	};
	capture();
	return {
		get retired() {
			return retired;
		},
		refresh: capture,
		close: async () => {
			await withPlaywrightCloseTimeout((async () => {
				startClosing();
				await Promise.all(pendingCollections);
				startClosing();
				await awaitClosing();
			})());
		}
	};
}
/** Retire a scoped adapter immediately; its CDP disconnect may settle later. */
function retirePlaywrightBrowserConnection(opts) {
	return retirePlaywrightBrowserConnectionExact(opts).retired;
}
function evictStalePlaywrightBrowserConnection(cdpUrl, expectedBrowser) {
	const current = cachedByCdpUrl.get(normalizeCdpUrl(cdpUrl));
	if (expectedBrowser && current?.browser !== expectedBrowser) return;
	const cur = takeCachedPlaywrightBrowserConnection(cdpUrl);
	if (cur) closeTrackedPlaywrightConnection(cur).catch(() => {});
}
function hasBlockedTargetsForCdpUrl(cdpUrl) {
	const prefix = `${normalizeCdpUrl(cdpUrl)}::`;
	for (const key of blockedTargetsByCdpUrl) if (key.startsWith(prefix)) return true;
	return false;
}
/** Raised when a page target has been quarantined after policy denial. */
function observeContext(context) {
	if (observedContexts.has(context)) return;
	observedContexts.add(context);
	ensureContextState(context);
	for (const page of context.pages()) ensurePageState(page);
	context.on("page", (page) => ensurePageState(page));
}
/** Ensure shared Playwright browser-context state. */
function ensureContextState(context) {
	const existing = contextStates.get(context);
	if (existing) return existing;
	const state = { traceActive: false };
	contextStates.set(context, state);
	return state;
}
function observeBrowser(browser) {
	for (const context of browser.contexts()) observeContext(context);
}
async function connectBrowser(cdpUrl, ssrfPolicy, relayReference) {
	const normalized = normalizeCdpUrl(cdpUrl);
	const relay = getBorrowedRelayCdpAccess(normalized);
	if (relayReference) {
		if (!relay) throw new Error("Captured relay connection is unavailable");
		const browser = await connectRelayBrowser(relay, normalized, relayReference);
		observeBrowser(browser);
		return {
			browser,
			cdpUrl: normalized
		};
	}
	const cached = cachedByCdpUrl.get(normalized);
	if (cached) return cached;
	const configuredPin = await assertCdpEndpointAllowed(normalized, ssrfPolicy);
	const connecting = connectingByCdpUrl.get(normalized);
	if (connecting) return await connecting.promise;
	const connectionAttempt = { cancelled: false };
	const connectWithRetry = async () => {
		let lastErr;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			if (connectionAttempt.cancelled) break;
			try {
				const timeout = 5e3 + attempt * 2e3;
				let endpointDiscoveryError;
				const resolvedEndpoint = relay ? null : await getChromeWebSocketEndpoint(normalized, timeout, ssrfPolicy).catch((err) => {
					endpointDiscoveryError = err;
					return null;
				});
				const hasUrlCredentials = stripCdpUrlCredentials(normalized) !== normalized;
				const configuredIsWebSocket = isWebSocketUrl(normalized);
				if (!relay && !resolvedEndpoint && !configuredIsWebSocket) {
					if (hasUrlCredentials) throw new Error("Authenticated CDP HTTP endpoint did not expose a usable WebSocket URL.");
					const detail = endpointDiscoveryError ? ` Reason: ${redactCdpErrorText(formatErrorMessage(endpointDiscoveryError))}` : "";
					if (ssrfPolicy) throw new Error(`Guarded CDP endpoint did not expose a usable WebSocket URL.${detail}`);
				}
				const normalizedCdpHostname = new URL(normalized).hostname;
				const needsPinnedDependencyConnect = Boolean(configuredPin?.lookup) && !isLoopbackHost(normalizedCdpHostname);
				const endpointUrl = resolvedEndpoint?.url ?? normalized;
				const endpointLookup = resolvedEndpoint?.lookup ?? (needsPinnedDependencyConnect ? configuredPin?.lookup : void 0);
				const connectEndpoint = async (target, lookup) => {
					const headers = getHeadersWithAuth(target);
					const connectionUrl = stripCdpUrlCredentials(target);
					const resolveWebSocketUrl = isWebSocketUrl(connectionUrl) ? void 0 : async () => (await getChromeWebSocketEndpoint(connectionUrl, timeout))?.url;
					return await withManagedProxyForCdpUrl(connectionUrl, () => withNoProxyForCdpUrl(connectionUrl, async () => {
						return await connectOverCdpTransport(connectionUrl, {
							timeout,
							headers,
							lookup,
							resolveWebSocketUrl
						});
					}));
				};
				let browser;
				try {
					browser = relay ? await connectRelayBrowser(relay, normalized) : await connectEndpoint(endpointUrl, endpointLookup);
					if (relay && getBorrowedRelayCdpAccess(normalized) !== relay) {
						await browser.close();
						throw new Error("Relay connection was superseded");
					}
				} catch (err) {
					if (!configuredIsWebSocket || endpointUrl === normalized) throw err;
					browser = await connectEndpoint(normalized, configuredPin?.lookup);
				}
				if (connectionAttempt.cancelled) {
					connectionAttempt.retired = {
						browser,
						cdpUrl: normalized
					};
					closeTrackedPlaywrightConnection(connectionAttempt.retired).catch(() => {});
					throw new Error("Playwright connection attempt was superseded.");
				}
				const onDisconnected = () => {
					if (cachedByCdpUrl.get(normalized)?.browser === browser) cachedByCdpUrl.delete(normalized);
				};
				const connected = {
					browser,
					cdpUrl: normalized,
					onDisconnected
				};
				cachedByCdpUrl.set(normalized, connected);
				browser.on("disconnected", onDisconnected);
				observeBrowser(browser);
				return connected;
			} catch (err) {
				lastErr = err;
				if (connectionAttempt.cancelled || relay) break;
				if (formatErrorMessage(err).includes("rate limit")) break;
				const delay = resolveCdpConnectRetryDelayMs(attempt);
				await new Promise((r) => {
					setTimeout(r, delay);
				});
			}
		}
		const message = lastErr ? formatErrorMessage(lastErr) : "CDP connect failed";
		throw new Error(redactCdpErrorText(message));
	};
	const pending = connectWithRetry().finally(() => {
		if (connectingByCdpUrl.get(normalized)?.attempt === connectionAttempt) connectingByCdpUrl.delete(normalized);
	});
	connectingByCdpUrl.set(normalized, {
		attempt: connectionAttempt,
		promise: pending
	});
	return await pending;
}
async function getAllPages(browser) {
	return browser.contexts().flatMap((c) => c.pages());
}
async function partitionAccessiblePages(opts) {
	const accessible = [];
	let blockedCount = 0;
	for (const page of opts.pages) {
		if (isBlockedPageRef(opts.cdpUrl, page)) {
			blockedCount += 1;
			continue;
		}
		ensurePageState(page);
		const targetId = (await pageTargetInfo(page).catch(() => null))?.targetId ?? null;
		if (!targetId) {
			if (hasBlockedTargetsForCdpUrl(opts.cdpUrl)) {
				blockedCount += 1;
				continue;
			}
			accessible.push({
				page,
				targetId: null
			});
			continue;
		}
		if (isBlockedTarget(opts.cdpUrl, targetId)) {
			blockedCount += 1;
			continue;
		}
		bindRoleRefsTarget(page, opts.cdpUrl, targetId);
		accessible.push({
			page,
			targetId
		});
	}
	return {
		accessible,
		blockedCount
	};
}
async function getPageForTargetIdOnce(opts) {
	if (opts.targetId && isBlockedTarget(opts.cdpUrl, opts.targetId)) throw new BlockedBrowserTargetError();
	const { browser } = await connectBrowser(opts.cdpUrl, opts.ssrfPolicy, opts.relayReference);
	const pages = await getAllPages(browser);
	if (!pages.length) throw new Error("No pages available in the connected browser.");
	const { accessible, blockedCount } = await partitionAccessiblePages({
		cdpUrl: opts.cdpUrl,
		pages
	});
	if (!accessible.length) {
		if (blockedCount > 0) throw new BlockedBrowserTargetError();
		throw new Error("No pages available in the connected browser.");
	}
	const first = expectDefined(accessible.at(0), "non-empty accessible browser pages");
	if (!opts.targetId) {
		bindRoleRefsTarget(first.page, opts.cdpUrl, first.targetId);
		return first.page;
	}
	const found = accessible.find((entry) => entry.targetId === opts.targetId);
	if (found) {
		bindRoleRefsTarget(found.page, opts.cdpUrl, found.targetId);
		return found.page;
	}
	throw new BrowserTabNotFoundError();
}
/** Resolve a Playwright page by target id, reconnecting once on stale state. */
async function getPageForTargetId(opts) {
	const reusedCachedBrowser = hasCachedPlaywrightBrowserConnection(opts.cdpUrl);
	try {
		return await getPageForTargetIdOnce(opts);
	} catch (err) {
		if (!isRecoverableStalePageSelectionError(err, reusedCachedBrowser)) throw err;
		if (opts.relayReference) await closeRelayOperationConnection(opts.relayReference);
		else retirePlaywrightBrowserConnection({ cdpUrl: opts.cdpUrl });
		return await getPageForTargetIdOnce(opts);
	}
}
//#endregion
//#region extensions/browser/src/browser/pw-session-navigation.ts
/** Classify requests that can navigate the selected page or one of its frames. */
function classifyBrowserDocumentNavigationRequest(page, request) {
	let kind;
	let frameResolutionFailed = false;
	try {
		kind = request.frame() === page.mainFrame() ? "top-level" : "subframe";
	} catch {
		kind = "top-level";
		frameResolutionFailed = true;
	}
	try {
		if (request.isNavigationRequest()) return kind;
	} catch {}
	try {
		if (request.resourceType() === "document") return kind;
	} catch {}
	return frameResolutionFailed ? "subframe" : null;
}
/** Return true when an error is a browser navigation policy denial. */
function isPolicyDenyNavigationError(err) {
	return err instanceof SsrFBlockedError || err instanceof InvalidBrowserNavigationUrlError;
}
async function quarantineBlockedNavigationTarget(opts) {
	markPageRefBlocked(opts.cdpUrl, opts.page);
	const resolvedTargetId = (await pageTargetInfo(opts.page).catch(() => null))?.targetId ?? null;
	const fallbackTargetId = normalizeOptionalString(opts.targetId) ?? "";
	const targetIdToBlock = resolvedTargetId || fallbackTargetId;
	if (targetIdToBlock) markTargetBlocked(opts.cdpUrl, targetIdToBlock);
}
/** Quarantine and close a tab that OpenClaw navigated to a blocked URL. */
async function closeBlockedNavigationTarget(opts) {
	await quarantineBlockedNavigationTarget(opts);
	await opts.page.close().catch(() => {});
}
/** Validate a completed page navigation and quarantine policy-denied targets. */
async function assertPageNavigationCompletedSafely(opts) {
	const navigationPolicy = withBrowserNavigationPolicy(opts.ssrfPolicy, { browserProxyMode: opts.browserProxyMode });
	try {
		await assertBrowserNavigationRedirectChainAllowed({
			request: opts.response?.request(),
			...navigationPolicy
		});
		await assertBrowserNavigationResultAllowed({
			url: opts.page.url(),
			...navigationPolicy
		});
	} catch (err) {
		if (isPolicyDenyNavigationError(err)) await quarantineBlockedNavigationTarget({
			cdpUrl: opts.cdpUrl,
			page: opts.page,
			targetId: opts.targetId
		});
		throw err;
	}
}
async function continueRouteSafely(route) {
	try {
		await route.continue();
	} catch (err) {
		if ((err instanceof Error ? err.message : "").includes("Route is already handled")) return;
		throw err;
	}
}
async function fallbackRouteSafely(route) {
	try {
		await route.fallback();
	} catch (err) {
		if ((err instanceof Error ? err.message : "").includes("Route is already handled")) return;
		throw err;
	}
}
const sourcePreservedPolicyDenials = /* @__PURE__ */ new WeakSet();
async function removePageNavigationRequestGuard(page, handler) {
	try {
		await page.unroute("**", handler);
	} catch (err) {
		try {
			if (page.isClosed()) return;
		} catch {}
		return err;
	}
}
/** Return true when policy denial left the selected page on its source document. */
function wasBrowserNavigationSourcePreservedAfterPolicyDenial(err) {
	return typeof err === "object" && err !== null && sourcePreservedPolicyDenials.has(err);
}
/** Run one selected-page action while guarding document requests. */
async function withPageNavigationRequestGuard(opts) {
	const navigationPolicy = withBrowserNavigationPolicy(opts.ssrfPolicy, { browserProxyMode: opts.browserProxyMode });
	if (!navigationPolicy.ssrfPolicy && !navigationPolicy.browserProxyMode) return await opts.action(opts.page.url());
	const inFlight = /* @__PURE__ */ new Set();
	let hasGuardError = false;
	let firstGuardError;
	let deniedDocumentCount = 0;
	let fulfilledDeniedDocumentCount = 0;
	let pendingDeniedDocumentCount = 0;
	let unpreservedDocumentCount = 0;
	let policyDeniedDetected = false;
	let lastNotifiedSourcePreserved;
	const recordGuardError = (err) => {
		if (hasGuardError) {
			if (!isPolicyDenyNavigationError(firstGuardError) && isPolicyDenyNavigationError(err)) firstGuardError = err;
			return;
		}
		hasGuardError = true;
		firstGuardError = err;
	};
	const emitPolicyDenied = (event) => {
		try {
			opts.onPolicyDenied?.(event);
		} catch {}
	};
	const updateImmediateSourcePreservation = () => {
		if (typeof firstGuardError !== "object" || firstGuardError === null) return;
		let sourcePreserved;
		if (unpreservedDocumentCount > 0) sourcePreserved = false;
		else if (isPolicyDenyNavigationError(firstGuardError) && deniedDocumentCount > 0 && pendingDeniedDocumentCount === 0 && fulfilledDeniedDocumentCount === deniedDocumentCount) sourcePreserved = true;
		if (sourcePreserved === void 0) {
			sourcePreservedPolicyDenials.delete(firstGuardError);
			return;
		}
		if (sourcePreserved) sourcePreservedPolicyDenials.add(firstGuardError);
		else sourcePreservedPolicyDenials.delete(firstGuardError);
		if (policyDeniedDetected && sourcePreserved !== lastNotifiedSourcePreserved) {
			lastNotifiedSourcePreserved = sourcePreserved;
			emitPolicyDenied({
				state: "handled",
				error: firstGuardError,
				sourcePreserved
			});
		}
	};
	const notifyPolicyDeniedDetected = () => {
		if (policyDeniedDetected || !isPolicyDenyNavigationError(firstGuardError)) return;
		policyDeniedDetected = true;
		emitPolicyDenied({
			state: "detected",
			error: firstGuardError
		});
	};
	const stopGuardedRoute = async (route, preserveDocument, requestError) => {
		if (preserveDocument && isPolicyDenyNavigationError(requestError)) {
			deniedDocumentCount += 1;
			pendingDeniedDocumentCount += 1;
			try {
				await route.fulfill({
					status: 204,
					body: ""
				});
				fulfilledDeniedDocumentCount += 1;
				pendingDeniedDocumentCount -= 1;
				updateImmediateSourcePreservation();
				return;
			} catch {
				pendingDeniedDocumentCount -= 1;
			}
		}
		if (preserveDocument) {
			unpreservedDocumentCount += 1;
			updateImmediateSourcePreservation();
		}
		await route.abort().catch(() => {});
	};
	const handleRoute = async (route, request) => {
		if (!classifyBrowserDocumentNavigationRequest(opts.page, request)) {
			try {
				await fallbackRouteSafely(route);
			} catch (err) {
				recordGuardError(err);
				await stopGuardedRoute(route, false, err);
			}
			return;
		}
		const policyCheck = assertBrowserNavigationAllowed({
			url: request.url(),
			...navigationPolicy
		});
		try {
			opts.onPolicyCheckStarted?.(policyCheck);
		} catch {}
		try {
			await policyCheck;
		} catch (err) {
			recordGuardError(err);
			notifyPolicyDeniedDetected();
			await stopGuardedRoute(route, true, err);
			return;
		}
		try {
			await fallbackRouteSafely(route);
		} catch (err) {
			recordGuardError(err);
			await stopGuardedRoute(route, true, err);
		}
	};
	const handler = (route, request) => {
		const operation = handleRoute(route, request).catch(async (err) => {
			recordGuardError(err);
			await stopGuardedRoute(route, true, err);
		});
		inFlight.add(operation);
		operation.finally(() => inFlight.delete(operation));
		return operation;
	};
	try {
		await opts.page.route("**", handler);
	} catch (err) {
		await removePageNavigationRequestGuard(opts.page, handler);
		throw err;
	}
	let result;
	let actionFailed = false;
	let actionError;
	try {
		let baselineUrl = opts.page.url();
		await assertBrowserNavigationResultAllowed({
			url: baselineUrl,
			...navigationPolicy
		});
		const latestUrl = opts.page.url();
		if (latestUrl !== baselineUrl) {
			await assertBrowserNavigationResultAllowed({
				url: latestUrl,
				...navigationPolicy
			});
			baselineUrl = latestUrl;
		}
		result = await opts.action(baselineUrl);
	} catch (err) {
		actionFailed = true;
		actionError = err;
		if (isPolicyDenyNavigationError(err)) {
			recordGuardError(err);
			notifyPolicyDeniedDetected();
			unpreservedDocumentCount += 1;
			updateImmediateSourcePreservation();
		}
	}
	const cleanupError = await removePageNavigationRequestGuard(opts.page, handler);
	while (inFlight.size > 0) await Promise.allSettled(inFlight);
	if (hasGuardError) {
		const sourcePreserved = isPolicyDenyNavigationError(firstGuardError) && deniedDocumentCount > 0 && fulfilledDeniedDocumentCount === deniedDocumentCount && unpreservedDocumentCount === 0 && !(actionFailed && isPolicyDenyNavigationError(actionError)) && typeof firstGuardError === "object" && firstGuardError !== null;
		if (typeof firstGuardError === "object" && firstGuardError !== null) {
			if (sourcePreserved) sourcePreservedPolicyDenials.add(firstGuardError);
			else sourcePreservedPolicyDenials.delete(firstGuardError);
		}
		throw toErrorObject(firstGuardError, "Non-Error thrown");
	}
	if (actionFailed) throw toErrorObject(actionError, "Non-Error thrown");
	if (cleanupError !== void 0) throw toErrorObject(cleanupError, "Non-Error thrown");
	return result;
}
/** Navigate a page while guarding requested URL and redirect chain. */
async function gotoPageWithNavigationGuard(opts) {
	const navigationPolicy = withBrowserNavigationPolicy(opts.ssrfPolicy, { browserProxyMode: opts.browserProxyMode });
	let blockedError = null;
	const handler = async (route, request) => {
		if (blockedError) {
			await route.abort().catch(() => {});
			return;
		}
		const requestKind = classifyBrowserDocumentNavigationRequest(opts.page, request);
		if (!requestKind) {
			await continueRouteSafely(route);
			return;
		}
		try {
			await assertBrowserNavigationAllowed({
				url: request.url(),
				...navigationPolicy
			});
		} catch (err) {
			if (isPolicyDenyNavigationError(err)) {
				if (requestKind === "top-level") blockedError = err;
				await route.abort().catch(() => {});
				return;
			}
			throw err;
		}
		await continueRouteSafely(route);
	};
	try {
		await opts.page.route("**", handler);
	} catch (err) {
		await removePageNavigationRequestGuard(opts.page, handler);
		throw err;
	}
	let response = null;
	let navigationFailed = false;
	let navigationError;
	try {
		await opts.assertPageCurrent?.();
		response = await opts.page.goto(opts.url, { timeout: opts.timeoutMs });
	} catch (err) {
		navigationFailed = true;
		navigationError = err;
	}
	const cleanupError = await removePageNavigationRequestGuard(opts.page, handler);
	if (blockedError) {
		await closeBlockedNavigationTarget({
			cdpUrl: opts.cdpUrl,
			page: opts.page,
			targetId: opts.targetId
		});
		throw toErrorObject(blockedError, "Non-Error thrown");
	}
	if (navigationFailed) throw navigationError;
	if (cleanupError !== void 0) throw toErrorObject(cleanupError, "Non-Error thrown");
	return response;
}
/** Resolve a browser snapshot ref into a Playwright locator. */
//#endregion
//#region extensions/browser/src/browser/pw-session.page-cdp.ts
/**
* Playwright page-scoped CDP helpers.
*
* Opens a CDP session through Playwright pages and marks backend DOM nodes with
* temporary browser refs for role-snapshot interactions.
*/
/** Attribute used to mark DOM nodes that correspond to generated browser refs. */
const BROWSER_REF_MARKER_ATTRIBUTE = "data-openclaw-browser-ref";
async function withPlaywrightPageCdpSession(page, fn) {
	const session = await page.context().newCDPSession(page);
	try {
		return await fn(session);
	} finally {
		await session.detach().catch(() => {});
	}
}
/** Run a function with a CDP send helper scoped to one Playwright page. */
async function withPageScopedCdpClient(opts) {
	return await withPlaywrightPageCdpSession(opts.page, async (session) => {
		return await opts.fn((method, params) => session.send(method, params));
	});
}
/** Read the browser-owned loader identity for a Playwright page's main frame. */
async function readMainFrameDocumentIdentityForPage(page) {
	return await withPlaywrightPageCdpSession(page, async (session) => await readCdpMainFrameDocumentIdentity((method, params) => session.send(method, params)));
}
/** Mark backend DOM node ids on the page with browser ref attributes. */
async function markBackendDomRefsOnPage(opts) {
	await opts.page.locator(`[${BROWSER_REF_MARKER_ATTRIBUTE}]`).evaluateAll((elements, attr) => {
		for (const element of elements) if (element instanceof Element) element.removeAttribute(attr);
	}, BROWSER_REF_MARKER_ATTRIBUTE).catch(() => {});
	const refs = opts.refs.filter((entry) => /^(?:e|ax)\d+$/.test(entry.ref) && Number.isFinite(entry.backendDOMNodeId) && Math.floor(entry.backendDOMNodeId) > 0);
	const marked = /* @__PURE__ */ new Set();
	if (!refs.length) return marked;
	return await withPlaywrightPageCdpSession(opts.page, async (session) => {
		const send = async (method, params) => await session.send(method, params);
		await send("DOM.getDocument", { depth: 0 }).catch(() => {});
		const backendNodeIds = uniqueValues(refs.map((entry) => Math.floor(entry.backendDOMNodeId)));
		const pushed = await send("DOM.pushNodesByBackendIdsToFrontend", { backendNodeIds }).catch(() => ({}));
		const nodeIds = Array.isArray(pushed.nodeIds) ? pushed.nodeIds : [];
		const nodeIdByBackendId = /* @__PURE__ */ new Map();
		for (let index = 0; index < backendNodeIds.length; index += 1) {
			const backendNodeId = backendNodeIds[index];
			const nodeId = nodeIds[index];
			if (backendNodeId && typeof nodeId === "number" && nodeId > 0) nodeIdByBackendId.set(backendNodeId, nodeId);
		}
		for (const entry of refs) {
			const nodeId = nodeIdByBackendId.get(Math.floor(entry.backendDOMNodeId));
			if (!nodeId) continue;
			try {
				await send("DOM.setAttributeValue", {
					nodeId,
					name: BROWSER_REF_MARKER_ATTRIBUTE,
					value: entry.ref
				});
				marked.add(entry.ref);
			} catch {}
		}
		return marked;
	});
}
//#endregion
//#region extensions/browser/src/browser/pw-session-actions.ts
async function getObservedBrowserStateViaPlaywright(opts) {
	return getObservedBrowserStateForPage(await getPageForTargetId(opts));
}
/** Resolve a page and read its current main-frame document identity. */
async function getMainFrameDocumentIdentityViaPlaywright(opts) {
	return await readMainFrameDocumentIdentityForPage(await getPageForTargetId(opts));
}
function refLocator(page, ref) {
	const normalized = ref.startsWith("@") ? ref.slice(1) : ref.startsWith("ref=") ? ref.slice(4) : ref;
	const isRoleRef = /^e\d+$/.test(normalized);
	if (isRoleRef || AX_REF_PATTERN.test(normalized)) {
		const state = pageStates.get(page);
		if (isRoleRef && state?.roleRefsMode === "aria") return (state.roleRefsFrame ?? page).locator(`aria-ref=${normalized}`);
		const info = state?.roleRefs?.[normalized];
		if (!info) throw new Error(`Unknown ref "${normalized}". Run a new snapshot and use a ref from that snapshot.`);
		const scope = state?.roleRefsFrame ?? page;
		if (info.domMarker) return scope.locator(`[${BROWSER_REF_MARKER_ATTRIBUTE}="${normalized}"]`);
		const locator = scope.getByRole(info.role, {
			name: info.name ?? /^$|^.{901,}$/s,
			exact: true
		});
		return info.nth !== void 0 ? locator.nth(info.nth) : locator;
	}
	return page.locator(`aria-ref=${normalized}`);
}
/** Close one or all cached Playwright browser connections. */
async function closePlaywrightBrowserConnection(opts) {
	const normalized = opts?.cdpUrl ? normalizeCdpUrl(opts.cdpUrl) : null;
	if (normalized) {
		await retirePlaywrightBrowserConnectionExact({ cdpUrl: normalized }).close();
		return;
	}
	const cdpUrls = /* @__PURE__ */ new Set([
		...cachedByCdpUrl.keys(),
		...connectingByCdpUrl.keys(),
		...retainedClosingByCdpUrl.keys()
	]);
	clearBlockedTargetsForCdpUrl();
	clearBlockedPageRefsForCdpUrl();
	const failed = (await Promise.allSettled([...cdpUrls].map(async (cdpUrl) => await retirePlaywrightBrowserConnectionExact({ cdpUrl }).close()))).find((result) => result.status === "rejected");
	if (failed) throw failed.reason;
}
function cdpSocketNeedsAttach(wsUrl) {
	try {
		const pathname = new URL(wsUrl).pathname;
		return pathname === "/cdp" || pathname.endsWith("/cdp") || pathname.includes("/devtools/browser/");
	} catch {
		return false;
	}
}
async function tryTerminateExecutionViaCdp(opts) {
	await assertCdpEndpointAllowed(opts.cdpUrl, opts.ssrfPolicy);
	const cdpControlPolicy = scopeCdpPolicyToConfiguredEndpoint(opts.cdpUrl, opts.ssrfPolicy);
	const cdpHttpBase = normalizeCdpHttpBaseForJsonEndpoints(opts.cdpUrl);
	const listUrl = appendCdpPath(cdpHttpBase, "/json/list");
	const pages = await fetchJson(listUrl, 2e3, void 0, cdpControlPolicy).catch(() => null);
	if (!pages || pages.length === 0) return;
	const targetId = normalizeOptionalString(opts.targetId) ?? "";
	const target = pages.find((p) => normalizeOptionalString(p.id) === targetId);
	const wsUrlRaw = normalizeOptionalString(target?.webSocketDebuggerUrl) ?? "";
	if (!wsUrlRaw) return;
	const wsUrl = normalizeCdpWsUrl(wsUrlRaw, cdpHttpBase);
	const wsPin = await assertCdpEndpointAllowed(wsUrl, cdpControlPolicy, {
		source: "discovered",
		configuredUrl: opts.cdpUrl
	});
	const needsAttach = cdpSocketNeedsAttach(wsUrl);
	const runWithTimeout = async (work, ms) => {
		let timer;
		const timeoutPromise = new Promise((_, reject) => {
			timer = setTimeout(() => reject(/* @__PURE__ */ new Error("CDP command timed out")), ms);
		});
		try {
			return await Promise.race([work, timeoutPromise]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	};
	await withCdpSocket(wsUrl, async (send) => {
		let sessionId;
		try {
			if (needsAttach) {
				const attached = await runWithTimeout(send("Target.attachToTarget", {
					targetId: opts.targetId,
					flatten: true
				}), 1500);
				const attachedSessionId = normalizeOptionalString(attached?.sessionId);
				if (attachedSessionId) sessionId = attachedSessionId;
			}
			await runWithTimeout(send("Runtime.terminateExecution", void 0, sessionId), 1500);
			if (sessionId) send("Target.detachFromTarget", { sessionId }).catch(() => {});
		} catch {}
	}, {
		handshakeTimeoutMs: 2e3,
		...wsPin?.lookup ? { lookup: wsPin.lookup } : {}
	}).catch(() => {});
}
/**
* Best-effort cancellation for stuck page operations.
*
* Playwright serializes CDP commands per page; a long-running or stuck operation (notably evaluate)
* can block all subsequent commands. We cannot safely "cancel" an individual command, and we do
* not want to close the actual Chromium tab. Instead, we disconnect Playwright's CDP connection
* so in-flight commands fail fast and the next request reconnects transparently.
*
* IMPORTANT: We CANNOT call Connection.close() because Playwright shares a single Connection
* across all objects (BrowserType, Browser, etc.). Closing it corrupts the entire Playwright
* instance, preventing reconnection.
*
* Instead we:
* 1. Retire the scoped cached or in-flight connection so the next call reconnects
* 2. Fire-and-forget browser.close() — it may hang but won't block us
* 3. The next connectBrowser() creates a completely new CDP WebSocket connection
*
* The old browser.close() eventually resolves when the in-browser evaluate timeout fires,
* or the old connection gets GC'd. Either way, it doesn't affect the fresh connection.
*/
/** Force-disconnect a Playwright connection to unblock a stuck target operation. */
async function forceDisconnectPlaywrightForTarget(opts) {
	const normalized = normalizeCdpUrl(opts.cdpUrl);
	const cur = takeCachedPlaywrightBrowserConnection(normalized);
	if (!cur) return;
	const targetId = normalizeOptionalString(opts.targetId) ?? "";
	if (targetId) await tryTerminateExecutionViaCdp({
		cdpUrl: normalized,
		targetId,
		ssrfPolicy: opts.ssrfPolicy
	}).catch(() => {});
	closeTrackedPlaywrightConnection(cur).catch(() => {});
}
async function withPlaywrightSafeReadReconnect(opts, run) {
	const connected = await connectBrowser(opts.cdpUrl, opts.ssrfPolicy);
	try {
		return await run(connected.browser);
	} catch (err) {
		if (!isRecoverablePlaywrightDisconnectError(err) || opts.attempt?.cancelled) throw err;
		evictStalePlaywrightBrowserConnection(opts.cdpUrl, connected.browser);
		if (opts.attempt?.cancelled) throw err;
		return await run((await connectBrowser(opts.cdpUrl, opts.ssrfPolicy)).browser);
	}
}
async function readPagesViaPlaywright(opts, attempt) {
	return await withPlaywrightSafeReadReconnect({
		cdpUrl: opts.cdpUrl,
		ssrfPolicy: opts.ssrfPolicy,
		attempt
	}, async (browser) => {
		let remainingTargetIds;
		if (opts.requireCompleteTargetList) {
			const session = await browser.newBrowserCDPSession();
			try {
				const result = await session.send("Target.getTargets");
				if (!Array.isArray(result.targetInfos)) throw new Error("Browser target enumeration was unavailable.");
				remainingTargetIds = new Set(result.targetInfos.filter((info) => info.type === "page" && !isBlockedTarget(opts.cdpUrl, info.targetId)).map((info) => info.targetId));
			} finally {
				await session.detach().catch(() => {});
			}
		}
		const candidatePages = (await getAllPages(browser)).filter((page) => !isBlockedPageRef(opts.cdpUrl, page));
		const pageResults = await Promise.all(candidatePages.map(async (page) => {
			let targetInfo;
			try {
				targetInfo = await pageTargetInfo(page);
			} catch (err) {
				if (isRecoverablePlaywrightDisconnectError(err)) throw err;
				targetInfo = null;
			}
			if (!targetInfo) return { status: "unresolved" };
			if (isBlockedTarget(opts.cdpUrl, targetInfo.targetId)) return { status: "blocked" };
			let url = "";
			try {
				url = page.url();
			} catch (err) {
				if (isRecoverablePlaywrightDisconnectError(err)) throw err;
			}
			return {
				status: "available",
				page: {
					targetId: targetInfo.targetId,
					title: targetInfo.title,
					url,
					type: "page"
				}
			};
		}));
		const resolvedPages = pageResults.flatMap((result) => result.status === "available" && (!remainingTargetIds || remainingTargetIds.delete(result.page.targetId)) ? [result.page] : []);
		if (remainingTargetIds && remainingTargetIds.size > 0 || (opts.requireCompleteTargetList || resolvedPages.length === 0) && pageResults.some((result) => result.status === "unresolved")) return {
			status: "unavailable",
			reason: "target-identity-unresolved"
		};
		return {
			status: "available",
			pages: resolvedPages
		};
	});
}
/**
* List all pages/tabs from the persistent Playwright connection.
* Used for remote profiles where HTTP-based /json/list is ephemeral.
*/
/** List pages through the persistent Playwright connection. */
async function listPagesViaPlaywright(opts) {
	const timeoutMs = typeof opts.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) ? Math.max(1, Math.floor(opts.timeoutMs)) : void 0;
	let timer;
	let timeoutError;
	const attempt = { cancelled: false };
	const operations = [readPagesViaPlaywright(opts, attempt)];
	if (timeoutMs !== void 0) operations.push(new Promise((_, reject) => {
		timer = setTimeout(() => {
			attempt.cancelled = true;
			timeoutError = /* @__PURE__ */ new Error(`Playwright page enumeration timed out after ${timeoutMs}ms`);
			reject(timeoutError);
		}, timeoutMs);
		timer.unref?.();
	}));
	let abortError;
	let abortListener;
	const signal = opts.signal;
	if (signal) operations.push(new Promise((_, reject) => {
		if (signal.aborted) {
			attempt.cancelled = true;
			abortError = signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("Playwright page enumeration was aborted.");
			reject(abortError);
			return;
		}
		abortListener = () => {
			attempt.cancelled = true;
			abortError = signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("Playwright page enumeration was aborted.");
			reject(abortError);
		};
		signal.addEventListener("abort", abortListener, { once: true });
	}));
	try {
		const enumeration = await Promise.race(operations);
		if (enumeration.status === "unavailable") throw new Error("Playwright page target identities are temporarily unavailable.");
		return enumeration.pages;
	} catch (err) {
		if (err === timeoutError || err === abortError) await forceDisconnectPlaywrightForTarget({
			cdpUrl: opts.cdpUrl,
			ssrfPolicy: opts.ssrfPolicy,
			reason: "Playwright page enumeration"
		}).catch(() => {});
		throw err;
	} finally {
		if (timer) clearTimeout(timer);
		if (abortListener && signal) signal.removeEventListener("abort", abortListener);
	}
}
/**
* Create a new page/tab using the persistent Playwright connection.
* Used for remote profiles where HTTP-based /json/new is ephemeral.
* Returns the new page's targetId and metadata.
*/
/** Create and optionally navigate a page through Playwright. */
async function createPageViaPlaywright(opts) {
	opts.signal?.throwIfAborted();
	const { browser } = await connectBrowser(opts.cdpUrl, opts.cdpPolicy ?? opts.ssrfPolicy);
	opts.signal?.throwIfAborted();
	const context = browser.contexts()[0] ?? await browser.newContext();
	opts.signal?.throwIfAborted();
	ensureContextState(context);
	const page = await context.newPage();
	const throwIfCreationAborted = async () => {
		try {
			opts.signal?.throwIfAborted();
		} catch (error) {
			await page.close().catch(() => {});
			throw error;
		}
	};
	ensurePageState(page);
	clearBlockedPageRef(opts.cdpUrl, page);
	const createdTargetId = (await pageTargetInfo(page).catch(() => null))?.targetId ?? null;
	await throwIfCreationAborted();
	clearBlockedTarget(opts.cdpUrl, createdTargetId ?? void 0);
	const targetUrl = opts.url.trim() || "about:blank";
	if (targetUrl !== "about:blank") {
		const navigationPolicy = withBrowserNavigationPolicy(opts.ssrfPolicy, { browserProxyMode: opts.browserProxyMode });
		await assertBrowserNavigationAllowed({
			url: targetUrl,
			...navigationPolicy
		});
		let response;
		try {
			response = await gotoPageWithNavigationGuard({
				cdpUrl: opts.cdpUrl,
				page,
				url: targetUrl,
				timeoutMs: 3e4,
				ssrfPolicy: opts.ssrfPolicy,
				browserProxyMode: opts.browserProxyMode,
				targetId: createdTargetId ?? void 0
			});
			opts.signal?.throwIfAborted();
		} catch (err) {
			if (!isPolicyDenyNavigationError(err) && !(err instanceof BlockedBrowserTargetError)) await page.close().catch(() => {});
			throw err;
		}
		try {
			await assertPageNavigationCompletedSafely({
				cdpUrl: opts.cdpUrl,
				page,
				response,
				ssrfPolicy: opts.ssrfPolicy,
				browserProxyMode: opts.browserProxyMode,
				targetId: createdTargetId ?? void 0
			});
		} catch (err) {
			if (isPolicyDenyNavigationError(err)) await closeBlockedNavigationTarget({
				cdpUrl: opts.cdpUrl,
				page,
				targetId: createdTargetId ?? void 0
			});
			throw err;
		}
	}
	const tid = createdTargetId ?? (await pageTargetInfo(page).catch(() => null))?.targetId ?? null;
	await throwIfCreationAborted();
	if (!tid) throw new Error("Failed to get targetId for new page");
	const title = await page.title().catch(() => "");
	await throwIfCreationAborted();
	return {
		targetId: tid,
		title,
		url: page.url(),
		type: "page"
	};
}
/**
* Close a page/tab by targetId using the persistent Playwright connection.
* Used for remote profiles where HTTP-based /json/close is ephemeral.
*/
async function closePageByTargetIdViaPlaywright(opts) {
	const page = await getPageForTargetId(opts);
	opts.signal?.throwIfAborted();
	await page.close();
}
/**
* Focus a page/tab by targetId using the persistent Playwright connection.
* Used for remote profiles where HTTP-based /json/activate can be ephemeral.
*/
async function focusPageByTargetIdViaPlaywright(opts) {
	const page = await getPageForTargetId(opts);
	opts.signal?.throwIfAborted();
	await page.bringToFront();
}
//#endregion
export { armObservedDialogResponseOnPage as A, hasCachedPlaywrightBrowserConnection as C, closeRelayOperationConnection as D, pageTargetInfo as E, respondToObservedDialogOnPage as F, restoreRoleRefsForTarget as I, storeRoleRefsForTarget as L, ensurePageState as M, getObservedBrowserStateForPage as N, beginActionDownloadCaptureOnPage as O, markObservedDialogsHandledRemotelyForPage as P, createDownloadCaptureForPage as R, getPageForTargetId as S, retirePlaywrightBrowserConnectionExact as T, quarantineBlockedNavigationTarget as _, forceDisconnectPlaywrightForTarget as a, connectBrowser as b, listPagesViaPlaywright as c, readMainFrameDocumentIdentityForPage as d, withPageScopedCdpClient as f, isPolicyDenyNavigationError as g, gotoPageWithNavigationGuard as h, focusPageByTargetIdViaPlaywright as i, createObservedDialogAbortSignalForPage as j, isDownloadStartingNavigationError as k, refLocator as l, closeBlockedNavigationTarget as m, closePlaywrightBrowserConnection as n, getMainFrameDocumentIdentityViaPlaywright as o, assertPageNavigationCompletedSafely as p, createPageViaPlaywright as r, getObservedBrowserStateViaPlaywright as s, closePageByTargetIdViaPlaywright as t, markBackendDomRefsOnPage as u, wasBrowserNavigationSourcePreservedAfterPolicyDenial as v, retirePlaywrightBrowserConnection as w, ensureContextState as x, withPageNavigationRequestGuard as y, isBrowserObservedDialogBlockedError as z };
