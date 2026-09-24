import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { h as redactToolPayloadText } from "./redact-Df68iObN.js";
import { s as sleepWithAbort, t as RetrySupervisor } from "./src-BQ327IOM.js";
import { o as redactSensitiveUrlLikeString } from "./redact-sensitive-url-BN1NZvXG.js";
import { i as registerSecretValueForRedaction } from "./secret-redaction-registry-BOLC6DkF.js";
import { t as VERSION } from "./version-CAQhhGAu.js";
import { t as isNonEmptyProtocolString } from "./protocol-value-normalization-CF07aFUM.js";
import { i as GATEWAY_CLIENT_NAMES, r as GATEWAY_CLIENT_MODES } from "./client-info-B1bPgeKr.js";
import { n as logError, t as logDebug } from "./logger-dgyRJ-bX.js";
import { d as readConnectErrorRecoveryAdvice, p as readPairingConnectErrorDetails, t as ConnectErrorDetailCodes, u as readConnectErrorDetailCode } from "./connect-error-details-DaOfGNN8.js";
import "./version-CwNT1gaY.js";
import { i as loadDeviceAuthTokenReadOnly, l as storeDeviceAuthToken, n as clearOriginDeviceToken, o as loadOriginDeviceToken, r as loadDeviceAuthToken, s as loadOriginDeviceTokenReadOnly, t as clearDeviceAuthToken, u as storeOriginDeviceToken } from "./device-auth-store-Dv4-CrXq.js";
import { n as loadDeviceIdentityIfPresent, o as publicKeyRawBase64UrlFromPem, r as loadOrCreateDeviceIdentity, s as signDevicePayload } from "./device-identity-CLNSF1JX.js";
import { a as resolveConnectChallengeTimeoutMs, c as resolveSafeTimeoutDelayMs, i as clearGatewayConnectTimeout, l as startGatewayConnectTimeout, s as resolvePreauthHandshakeTimeoutMs, t as DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS } from "./timeouts-D2XMKe-X.js";
import { n as normalizeGatewayErrorText, r as normalizeTlsFingerprint, t as isSensitiveUrlQueryParamName } from "./client-address-utils-DUCasR_v.js";
import { o as resolveGatewayStartupRetryAfterMs } from "./startup-unavailable-D0-EeFjq.js";
import { n as buildDeviceAuthPayloadV3 } from "./device-auth-na9vtJo1.js";
import { i as retainGatewayResponsePayload, n as GatewayProtocolRequestTimeoutError, t as GatewayProtocolRequestError } from "./protocol-request-BMUN1re6.js";
import { t as GatewayClientRequestError } from "./request-error-BSFClQsA.js";
import { t as rawDataToString } from "./websocket-data-2vBvd4uX.js";
import { a as resolveGatewayWebSocketTransport, i as isGatewayLoopbackHost, n as GatewayWebSocketTransportConfigurationError } from "./websocket-transport-PSJq23gL.js";
import { r as registerManagedProxyGatewayLoopbackBypass, t as ensureInheritedManagedProxyRoutingActive } from "./proxy-lifecycle-DK54iu0H.js";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
//#region packages/gateway-client/src/connect-auth.ts
function normalized(value) {
	return typeof value === "string" ? value.trim() || void 0 : void 0;
}
function selectGatewayConnectAuth(params) {
	const authToken = normalized(params.token);
	const bootstrapToken = normalized(params.bootstrapToken);
	const explicitDeviceToken = normalized(params.deviceToken);
	const authPassword = normalized(params.password);
	const storedToken = normalized(params.storedToken);
	const stored = {
		storedToken,
		storedScopes: params.storedScopes
	};
	if (params.preferBootstrapToken && bootstrapToken) return {
		authBootstrapToken: bootstrapToken,
		signatureToken: bootstrapToken,
		...stored
	};
	const useRetryToken = params.pendingDeviceTokenRetry === true && !explicitDeviceToken && Boolean(authToken && storedToken && params.trustedDeviceTokenRetry);
	const resolvedDeviceToken = explicitDeviceToken ?? (useRetryToken || !(authToken || authPassword) && (!bootstrapToken || storedToken) ? storedToken : void 0);
	const usingStoredDeviceToken = Boolean(resolvedDeviceToken && !explicitDeviceToken && storedToken) && resolvedDeviceToken === storedToken;
	const selectedToken = authToken ?? resolvedDeviceToken;
	const authBootstrapToken = !authToken && !resolvedDeviceToken && !authPassword ? bootstrapToken : void 0;
	return {
		authToken: selectedToken,
		authBootstrapToken,
		authDeviceToken: useRetryToken ? storedToken : void 0,
		authPassword,
		authApprovalRuntimeToken: normalized(params.approvalRuntimeToken),
		authAgentRuntimeIdentityToken: normalized(params.agentRuntimeIdentityToken),
		signatureToken: selectedToken ?? authBootstrapToken,
		resolvedDeviceToken,
		usingStoredDeviceToken,
		...stored
	};
}
function buildGatewayConnectAuth(selected) {
	const auth = {
		token: selected.authToken,
		bootstrapToken: selected.authBootstrapToken,
		deviceToken: selected.authDeviceToken ?? selected.resolvedDeviceToken,
		password: selected.authPassword,
		approvalRuntimeToken: selected.authApprovalRuntimeToken,
		agentRuntimeIdentityToken: selected.authAgentRuntimeIdentityToken
	};
	return Object.values(auth).some(Boolean) ? auth : void 0;
}
function resolveGatewayConnectScopes(params) {
	return params.requestedScopes ?? (params.usingStoredDeviceToken && params.storedScopes?.length ? params.storedScopes : [...params.defaultScopes]);
}
function shouldRetryGatewayWithDeviceToken(params) {
	if (params.retryBudgetUsed || params.currentDeviceToken || !params.explicitToken || !params.storedToken || !params.trustedEndpoint) return false;
	const advice = readConnectErrorRecoveryAdvice(params.errorDetails);
	return params.canRetryWithDeviceTokenHint === true || advice.canRetryWithDeviceToken === true || advice.recommendedNextStep === "retry_with_device_token" || readConnectErrorDetailCode(params.errorDetails) === ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH;
}
//#endregion
//#region packages/gateway-protocol/src/frame-guards.ts
function isNonNegativeInteger(value) {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function isGatewayErrorShape(value) {
	if (!isRecord(value)) return false;
	if (!isNonEmptyProtocolString(value.code) || !isNonEmptyProtocolString(value.message)) return false;
	if (value.retryable !== void 0 && typeof value.retryable !== "boolean") return false;
	return value.retryAfterMs === void 0 || isNonNegativeInteger(value.retryAfterMs);
}
function isGatewayEventFrame(value) {
	if (!isRecord(value) || value.type !== "event" || !isNonEmptyProtocolString(value.event)) return false;
	return value.seq === void 0 || isNonNegativeInteger(value.seq);
}
function isGatewayResponseFrame(value) {
	if (!isRecord(value) || value.type !== "res" || !isNonEmptyProtocolString(value.id) || typeof value.ok !== "boolean") return false;
	return value.error === void 0 || isGatewayErrorShape(value.error);
}
//#endregion
//#region packages/gateway-client/src/event-listeners.ts
/** Subscription identity prevents old frames and disposers from reviving callbacks. */
var GatewayEventListeners = class {
	constructor() {
		this.listeners = /* @__PURE__ */ new Map();
	}
	add(listener) {
		const subscription = this.listeners.get(listener) ?? {};
		this.listeners.set(listener, subscription);
		return () => {
			if (this.listeners.get(listener) === subscription) this.listeners.delete(listener);
		};
	}
	snapshot() {
		return [...this.listeners];
	}
	isCurrent(listener, subscription) {
		return this.listeners.get(listener) === subscription;
	}
};
//#endregion
//#region packages/gateway-client/src/pending-request.ts
/** Owns request deadlines, correlation, settlement, and generation-scoped IDs. */
var GatewayPendingRequests = class {
	constructor(opts) {
		this.opts = opts;
		this.pending = /* @__PURE__ */ new Map();
		this.requestSequence = 0;
	}
	get hasPending() {
		return this.pending.size > 0;
	}
	get hasUnboundedPending() {
		return [...this.pending.values()].some((pending) => pending.unbounded);
	}
	request(sender, method, params, options) {
		let id;
		try {
			id = this.allocateRequestId();
		} catch (error) {
			return Promise.reject(error instanceof Error ? error : new Error(String(error)));
		}
		const requestedTimeoutMs = options?.timeoutMs === null ? void 0 : options?.timeoutMs ?? this.opts.requestTimeoutMs;
		const timeoutMs = typeof requestedTimeoutMs === "number" && Number.isFinite(requestedTimeoutMs) ? resolveSafeTimeoutDelayMs(requestedTimeoutMs, { minMs: 0 }) : void 0;
		return new Promise((resolve, reject) => {
			let timeout;
			let requestSent = false;
			const pending = {
				resolve: (value) => resolve(value),
				reject,
				expectFinal: options?.expectFinal === true,
				acceptedNotified: false,
				onAccepted: options?.onAccepted,
				unbounded: timeoutMs === void 0,
				method,
				startedAtMs: this.opts.nowMs()
			};
			const cleanup = () => {
				if (timeout !== void 0) clearTimeout(timeout);
				options?.signal?.removeEventListener("abort", onAbort);
			};
			const retire = (errorCode) => {
				if (this.pending.get(id) !== pending) return false;
				this.pending.delete(id);
				cleanup();
				this.finishTiming(id, pending, false, errorCode);
				return true;
			};
			const onAbort = () => {
				if (!retire("CLIENT_ABORTED")) return;
				reject(this.opts.createRequestAbortError?.(method) ?? /* @__PURE__ */ new Error(`gateway request aborted for ${method}`));
			};
			if (options?.signal?.aborted) {
				reject(this.opts.createRequestAbortError?.(method) ?? /* @__PURE__ */ new Error(`gateway request aborted for ${method}`));
				return;
			}
			pending.cleanup = cleanup;
			if (timeoutMs !== void 0) {
				timeout = setTimeout(() => {
					if (!retire("CLIENT_TIMEOUT")) return;
					reject(this.opts.createRequestTimeoutError?.(method, timeoutMs, requestSent) ?? new GatewayProtocolRequestTimeoutError({
						method,
						timeoutMs,
						requestSent
					}));
				}, timeoutMs);
				timeout.unref?.();
			}
			options?.signal?.addEventListener("abort", onAbort, { once: true });
			this.pending.set(id, pending);
			try {
				sender.send(JSON.stringify({
					type: "req",
					id,
					method,
					params
				}));
				if (this.pending.get(id) !== pending) return;
				requestSent = true;
				this.invoke("sent", () => options?.onSent?.());
			} catch (error) {
				if (retire("CLIENT_SEND_ERROR")) reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}
	handleResponse(frame) {
		const pending = this.pending.get(frame.id);
		if (!pending) return;
		const status = frame.payload?.status;
		if (frame.ok && pending.expectFinal && status === "accepted") {
			if (!pending.acceptedNotified) {
				pending.acceptedNotified = true;
				this.invoke("accepted", () => pending.onAccepted?.(frame.payload));
			}
			return;
		}
		this.pending.delete(frame.id);
		pending.cleanup?.();
		if (frame.ok) {
			this.finishTiming(frame.id, pending, true);
			pending.resolve(frame.payload);
			return;
		}
		this.finishTiming(frame.id, pending, false, frame.error?.code);
		const error = this.opts.createRequestError?.(frame.error ?? {}) ?? new GatewayProtocolRequestError(frame.error ?? {});
		retainGatewayResponsePayload(error, frame.payload);
		pending.reject(error);
	}
	flush(error) {
		const retired = [...this.pending];
		this.pending.clear();
		this.requestSequence = 0;
		for (const [id, pending] of retired) {
			pending.cleanup?.();
			this.finishTiming(id, pending, false, "CLIENT_CLOSED");
			pending.reject(error);
		}
	}
	allocateRequestId() {
		this.requestSequence += 1;
		return `${this.requestSequence}:${this.opts.createRequestId()}`;
	}
	finishTiming(id, pending, ok, errorCode) {
		const endedAtMs = this.opts.nowMs();
		try {
			const onTiming = this.opts.onTiming;
			if (onTiming === void 0 || onTiming === null) return;
			Reflect.apply(onTiming, this.opts, [{
				id,
				method: pending.method,
				ok,
				durationMs: Math.max(0, endedAtMs - pending.startedAtMs),
				startedAtMs: pending.startedAtMs,
				endedAtMs,
				errorCode
			}]);
		} catch (error) {
			this.opts.onCallbackError?.("request timing", error);
		}
	}
	invoke(label, callback) {
		try {
			callback();
		} catch (error) {
			this.opts.onCallbackError?.(label, error);
		}
	}
};
//#endregion
//#region packages/gateway-client/src/protocol-client.ts
/**
* Browser-safe gateway wire client. Environment adapters own transport and auth
* policy; this class owns the single socket/handshake/reconnect/frame state machine.
*/
var GatewayProtocolClient = class {
	constructor(opts) {
		this.opts = opts;
		this.socket = null;
		this.listeners = new GatewayEventListeners();
		this.stopped = true;
		this.generation = 0;
		this.lastSeq = null;
		this.connectNonce = null;
		this.connectSent = false;
		this.connectRequestSent = false;
		this.handshakeTimer = null;
		this.reconnectSignal = null;
		this.socketOpened = false;
		this.helloReceived = false;
		this.connectTiming = null;
		this.reconnectSupervisor = new RetrySupervisor({
			initialMs: opts.reconnect.initialMs,
			maxMs: opts.reconnect.maxMs,
			factor: opts.reconnect.multiplier,
			jitter: 0
		});
		this.requests = new GatewayPendingRequests({
			createRequestId: opts.createRequestId,
			createRequestError: opts.createRequestError,
			createRequestTimeoutError: opts.createRequestTimeoutError,
			createRequestAbortError: opts.createRequestAbortError,
			requestTimeoutMs: opts.requestTimeoutMs,
			nowMs: () => this.nowMs(),
			onTiming: opts.onRequestTiming,
			onCallbackError: opts.onCallbackError
		});
	}
	get connected() {
		return this.socket?.isOpen() ?? false;
	}
	get hasPendingRequests() {
		return this.requests.hasPending;
	}
	get connecting() {
		return this.connectSent && !this.helloReceived;
	}
	get hasUnboundedPendingRequests() {
		return this.requests.hasUnboundedPending;
	}
	start() {
		if (this.socket || this.reconnectSignal) return;
		this.stopped = false;
		this.reconnectSupervisor.cancel();
		this.connect();
	}
	stop() {
		this.stopped = true;
		this.clearHandshakeTimer();
		this.reconnectSignal = null;
		this.reconnectSupervisor.reset();
		const socket = this.socket;
		if (socket && this.opts.notifyStoppedClose) this.stoppedSocket = {
			socket,
			context: this.closeContext()
		};
		this.socket = null;
		this.connectFailure = void 0;
		this.connectTiming = null;
		this.requests.flush(/* @__PURE__ */ new Error("gateway client stopped"));
		socket?.close();
	}
	request(method, params, options) {
		const socket = this.socket;
		if (!socket?.isOpen()) return Promise.reject(/* @__PURE__ */ new Error("gateway not connected"));
		if (typeof method !== "string" || method.length === 0) return Promise.reject(/* @__PURE__ */ new Error("invalid request frame: method must be a non-empty string"));
		return this.requests.request(socket, method, params, options);
	}
	addEventListener(listener) {
		return this.listeners.add(listener);
	}
	closeSocket(code, reason) {
		this.socket?.close(code, reason);
	}
	resetReconnectBackoff(initialMs) {
		this.reconnectSignal = null;
		this.reconnectSupervisor.reset(initialMs);
	}
	recordTiming(phase, generation, plan, detail) {
		const now = this.nowMs();
		const state = this.connectTiming;
		if (!state || state.generation !== generation) return;
		state.hasChallenge ||= phase === "challenge";
		state.usedFallback ||= phase === "fallback";
		this.invoke("connect timing", () => this.opts.onTiming?.({
			phase,
			generation,
			durationMs: Math.max(0, now - state.startedAtMs),
			phaseDurationMs: Math.max(0, now - state.lastAtMs),
			hasChallenge: state.hasChallenge,
			usedFallback: state.usedFallback,
			plan,
			detail
		}));
		state.lastAtMs = now;
		if (phase === "hello" || phase === "failed") this.connectTiming = null;
	}
	connect() {
		if (this.stopped) return;
		const generation = this.generation + 1;
		this.lastSeq = null;
		this.connectNonce = null;
		this.connectChallengeTs = void 0;
		this.connectSent = this.connectRequestSent = false;
		this.socketOpened = false;
		this.helloReceived = false;
		this.connectFailure = void 0;
		let socket;
		try {
			socket = this.opts.createSocket({
				open: () => this.handleOpen(socket, generation),
				message: (data) => this.handleMessage(socket, generation, data),
				close: (code, reason) => this.handleClose(socket, generation, code, reason),
				error: (error) => this.handleSocketError(socket, generation, error)
			});
		} catch (error) {
			const normalized = error instanceof Error ? error : new Error(String(error));
			this.opts.onSocketFactoryError?.(normalized);
			this.opts.onConnectError?.(normalized);
			if (this.opts.rethrowSocketFactoryError?.(normalized)) {
				if (this.generation > 0 && !this.stopped && !this.socket && !this.reconnectSignal) this.opts.onReconnectStopped?.(normalized);
				throw normalized;
			}
			if (this.opts.shouldRetrySocketFactoryError?.(normalized) && !this.stopped && !this.socket && !this.reconnectSignal) this.scheduleReconnect();
			else if (this.generation > 0 && !this.stopped && !this.socket && !this.reconnectSignal) this.opts.onReconnectStopped?.(normalized);
			return;
		}
		this.generation = generation;
		this.socket = socket;
		const now = this.nowMs();
		this.connectTiming = {
			generation,
			startedAtMs: now,
			lastAtMs: now,
			hasChallenge: false,
			usedFallback: false
		};
	}
	handleOpen(socket, generation) {
		if (!this.isActive(socket, generation)) return;
		this.socketOpened = true;
		this.recordTiming("socket-open", generation);
		if (this.connectNonce) {
			this.sendConnect(socket, generation);
			return;
		}
		this.armHandshakeTimer(socket, generation);
	}
	armHandshakeTimer(socket, generation) {
		this.clearHandshakeTimer();
		const armedAt = Date.now();
		this.handshakeTimer = setTimeout(() => {
			this.handshakeTimer = null;
			if (!this.isActive(socket, generation) || this.connectSent || !socket.isOpen()) return;
			if (this.opts.handshake.mode === "fallback") {
				this.recordTiming("fallback", generation);
				this.sendConnect(socket, generation);
				return;
			}
			const elapsedMs = Date.now() - armedAt;
			const error = new Error(this.opts.handshake.timeoutMessage?.(elapsedMs) ?? `gateway connect challenge timeout after ${elapsedMs}ms`);
			this.opts.onConnectError?.(error);
			socket.close(1008, "connect challenge timeout");
		}, this.opts.handshake.timeoutMs);
		this.handshakeTimer.unref?.();
	}
	sendConnect(socket, generation) {
		if (!this.isActive(socket, generation) || !socket.isOpen() || this.connectSent) return;
		this.connectSent = true;
		this.clearHandshakeTimer();
		this.handshakeTimer = startGatewayConnectTimeout(() => {
			if (this.isActive(socket, generation) && !this.helloReceived) socket.close(4e3, "connect timeout");
		});
		let planOrPromise;
		try {
			planOrPromise = this.opts.buildConnectPlan({
				nonce: this.connectNonce,
				challengeTs: this.connectChallengeTs,
				generation
			});
		} catch (error) {
			this.handleConnectPlanError(socket, generation, error);
			return;
		}
		if (planOrPromise instanceof Promise) {
			planOrPromise.then((plan) => this.sendConnectPlan(socket, generation, plan)).catch((error) => this.handleConnectPlanError(socket, generation, error));
			return;
		}
		this.sendConnectPlan(socket, generation, planOrPromise);
	}
	handleConnectPlanError(socket, generation, error) {
		if (!this.isActive(socket, generation)) return;
		const normalized = error instanceof Error ? error : new Error(String(error));
		const outcome = this.opts.onConnectPlanError?.(normalized) ?? {
			closeCode: 1008,
			closeReason: "connect failed"
		};
		this.opts.onConnectError?.(outcome.error ?? normalized);
		if (outcome.stop) this.stopped = true;
		socket.close(outcome.closeCode, outcome.closeReason);
	}
	sendConnectPlan(socket, generation, plan) {
		if (!this.isActive(socket, generation) || !socket.isOpen()) return;
		const context = {
			generation,
			nonce: this.connectNonce,
			challengeTs: this.connectChallengeTs,
			plan
		};
		this.recordTiming("connect-plan-ready", generation, plan);
		this.recordTiming("request-sent", generation, plan);
		this.connectRequestSent = true;
		this.request("connect", this.opts.buildConnectParams(plan)).then((hello) => {
			if (!this.isActive(socket, generation) || !socket.isOpen()) return;
			this.helloReceived = true;
			this.clearHandshakeTimer();
			this.connectFailure = void 0;
			this.reconnectSupervisor.reset();
			this.recordTiming("hello", generation, plan);
			this.opts.onConnectHello?.(hello, context);
			this.invoke("hello", () => this.opts.onHello?.(hello));
		}).catch((error) => {
			if (!this.isActive(socket, generation)) return;
			const requestError = error instanceof GatewayProtocolRequestError ? error : new GatewayProtocolRequestError({ message: String(error) });
			const outcome = this.opts.onConnectFailure?.(requestError, context) ?? {
				closeCode: 1008,
				closeReason: "connect failed"
			};
			this.connectFailure = {
				error: requestError,
				reconnectDelayMs: outcome.reconnectDelayMs
			};
			if (outcome.stop) this.stopped = true;
			socket.close(outcome.closeCode, outcome.closeReason);
		});
	}
	handleMessage(socket, generation, raw) {
		if (!this.isActive(socket, generation)) return;
		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			this.opts.onParseError?.(error);
			return;
		}
		if (isGatewayEventFrame(parsed)) {
			this.opts.onActivity?.();
			if (parsed.event === "connect.challenge") {
				const payload = parsed.payload;
				const nonce = typeof payload?.nonce === "string" ? payload.nonce.trim() : "";
				if (!nonce) {
					if (this.opts.handshake.mode === "require-challenge") {
						const error = /* @__PURE__ */ new Error("gateway connect challenge missing nonce");
						this.opts.onConnectError?.(error);
						socket.close(1008, "connect challenge missing nonce");
					}
					return;
				}
				this.connectNonce = nonce;
				const challengeTs = payload?.ts;
				this.connectChallengeTs = typeof challengeTs === "number" && Number.isSafeInteger(challengeTs) && challengeTs >= 0 ? challengeTs : null;
				this.recordTiming("challenge", generation);
				this.sendConnect(socket, generation);
				return;
			}
			const seq = typeof parsed.seq === "number" ? parsed.seq : null;
			if (seq !== null) {
				if (this.lastSeq !== null && seq > this.lastSeq + 1) {
					const expected = this.lastSeq + 1;
					this.invoke("gap", () => this.opts.onGap?.({
						expected,
						received: seq
					}));
					if (!this.isActive(socket, generation)) return;
				}
				this.lastSeq = seq;
			}
			const listeners = this.listeners.snapshot();
			this.invoke("event", () => this.opts.onEvent?.(parsed));
			for (const [listener, subscription] of listeners) {
				if (!this.isActive(socket, generation)) return;
				if (this.listeners.isCurrent(listener, subscription)) this.invoke("event listener", () => listener(parsed));
			}
			return;
		}
		if (!isGatewayResponseFrame(parsed)) return;
		this.opts.onActivity?.();
		this.requests.handleResponse(parsed);
	}
	handleClose(socket, generation, code, reason) {
		if (this.socket !== socket) {
			if (this.stoppedSocket?.socket === socket) {
				const context = {
					...this.stoppedSocket.context,
					code,
					reason
				};
				this.stoppedSocket = void 0;
				this.invoke("close", () => this.opts.onClose?.(context, {
					retry: false,
					notify: true
				}));
			}
			return;
		}
		this.socket = null;
		this.clearHandshakeTimer();
		const context = {
			...this.closeContext(),
			code,
			reason,
			generation
		};
		this.connectFailure = void 0;
		const decision = this.opts.resolveClose(context);
		this.requests.flush(decision.pendingError ?? context.connectFailure?.error ?? /* @__PURE__ */ new Error(`gateway closed (${code}): ${reason}`));
		this.invoke("close", () => this.opts.onClose?.(context, decision));
		if (decision.retry && !this.stopped && !this.socket && !this.reconnectSignal) this.scheduleReconnect(decision.reconnectDelayMs ?? context.connectFailure?.reconnectDelayMs);
	}
	handleSocketError(socket, generation, error) {
		if (!this.isActive(socket, generation) || this.connectSent) return;
		this.connectFailure = { error };
		this.opts.onConnectError?.(error);
	}
	scheduleReconnect(overrideMs) {
		if (overrideMs !== void 0) this.reconnectSupervisor.nextDelayOverrideMs = overrideMs;
		const retry = this.reconnectSupervisor.next();
		if (!retry) return;
		this.reconnectSignal = retry.signal;
		sleepWithAbort(retry.delayMs, retry.signal).then(() => {
			if (this.reconnectSignal !== retry.signal) return;
			this.reconnectSignal = null;
			this.invoke("reconnect", () => this.connect());
		}, () => {
			if (this.reconnectSignal === retry.signal) this.reconnectSignal = null;
		});
	}
	closeContext() {
		return {
			generation: this.generation,
			socketOpened: this.socketOpened,
			helloReceived: this.helloReceived,
			connectRequestSent: this.connectRequestSent,
			connectFailure: this.connectFailure
		};
	}
	isActive(socket, generation) {
		return !this.stopped && this.socket === socket && this.generation === generation;
	}
	nowMs() {
		return this.opts.nowMs?.() ?? Date.now();
	}
	clearHandshakeTimer() {
		this.handshakeTimer = clearGatewayConnectTimeout(this.handshakeTimer);
	}
	invoke(label, callback) {
		try {
			callback();
		} catch (error) {
			this.opts.onCallbackError?.(label, error);
		}
	}
};
//#endregion
//#region packages/gateway-client/src/reconnect-policy.ts
const NON_RECOVERABLE_AUTH_ERRORS = /* @__PURE__ */ new Set([
	ConnectErrorDetailCodes.AUTH_TOKEN_MISSING,
	ConnectErrorDetailCodes.AUTH_BOOTSTRAP_TOKEN_INVALID,
	ConnectErrorDetailCodes.AUTH_PASSWORD_MISSING,
	ConnectErrorDetailCodes.AUTH_PASSWORD_MISMATCH,
	ConnectErrorDetailCodes.AUTH_RATE_LIMITED,
	ConnectErrorDetailCodes.AUTH_DEVICE_TOKEN_MISMATCH,
	ConnectErrorDetailCodes.AUTH_SCOPE_MISMATCH,
	ConnectErrorDetailCodes.AUTH_IDENTITY_HEADER_REQUIRED,
	ConnectErrorDetailCodes.AUTH_VERIFIED_USER_REQUIRED,
	ConnectErrorDetailCodes.CONTROL_UI_BUILD_MISMATCH,
	ConnectErrorDetailCodes.PAIRING_REQUIRED,
	ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED,
	ConnectErrorDetailCodes.DEVICE_IDENTITY_REQUIRED
]);
function shouldPauseGatewayReconnect(params) {
	const code = readConnectErrorDetailCode(params.details);
	if (!code) return false;
	const pairing = readPairingConnectErrorDetails(params.details);
	if (code === ConnectErrorDetailCodes.PAIRING_REQUIRED && (pairing?.pauseReconnect === false || pairing?.recommendedNextStep === "wait_then_retry")) return false;
	if (code === ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH) return params.tokenMismatchIsTerminal === true && !params.deviceTokenRetryPending;
	if (code === ConnectErrorDetailCodes.AUTH_IDENTITY_HEADER_REQUIRED) return !params.deviceTokenRetryPending;
	return NON_RECOVERABLE_AUTH_ERRORS.has(code) || params.protocolMismatchIsTerminal === true && code === ConnectErrorDetailCodes.PROTOCOL_MISMATCH || params.clientVersionMismatchIsTerminal === true && code === ConnectErrorDetailCodes.CLIENT_VERSION_MISMATCH;
}
//#endregion
//#region packages/gateway-client/src/client.ts
const DEFAULT_HOST_DEPS = {
	loadOrCreateDeviceIdentity: () => void 0,
	signDevicePayload: () => {
		throw new Error("GatewayClient device signature dependency is not configured");
	},
	publicKeyRawBase64UrlFromPem: () => {
		throw new Error("GatewayClient public key dependency is not configured");
	},
	loadDeviceAuthToken: () => null,
	storeDeviceAuthToken: () => {},
	clearDeviceAuthToken: () => {},
	beforeConnect: () => {},
	registerGatewayLoopbackBypass: () => void 0,
	logDebug: () => {},
	logError: () => {},
	redactForLog: (message) => message,
	normalizeTlsFingerprint
};
function resolveHostDeps(overrides) {
	return Object.fromEntries(Object.entries(DEFAULT_HOST_DEPS).map(([key, fallback]) => [key, overrides?.[key] ?? fallback]));
}
const DEFAULT_GATEWAY_CLIENT_URL = "ws://127.0.0.1:18789";
const DEFAULT_CLIENT_VERSION = "0.0.0";
const MAX_UPGRADE_ERROR_BODY_BYTES = 2048;
const UPGRADE_ERROR_BODY_TIMEOUT_MS = 1e3;
async function readUpgradeErrorBody(response) {
	return await new Promise((resolve) => {
		const chunks = [];
		let totalBytes = 0;
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			response.off("data", onData);
			response.off("end", finish);
			response.off("error", finish);
			response.off("aborted", finish);
			resolve(Buffer.concat(chunks, totalBytes).toString("utf8").replace(/\s+/gu, " ").trim());
		};
		const stop = () => {
			finish();
			response.destroy();
		};
		const onData = (chunk) => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			const remaining = MAX_UPGRADE_ERROR_BODY_BYTES - totalBytes;
			if (remaining > 0) {
				const prefix = buffer.subarray(0, remaining);
				chunks.push(prefix);
				totalBytes += prefix.byteLength;
			}
			if (buffer.byteLength >= remaining) stop();
		};
		const timer = setTimeout(stop, UPGRADE_ERROR_BODY_TIMEOUT_MS);
		timer.unref?.();
		response.on("data", onData);
		response.once("end", finish);
		response.once("error", finish);
		response.once("aborted", finish);
	});
}
var GatewayClientRequestTimeoutError = class extends GatewayProtocolRequestTimeoutError {
	constructor(params) {
		super(params, `gateway request timeout for ${params.method}`);
		this.name = "GatewayClientRequestTimeoutError";
	}
};
var GatewayClientTransportPolicyError = class extends GatewayWebSocketTransportConfigurationError {};
const GATEWAY_CONNECT_ASSEMBLY_ERROR = Symbol("gateway.connectAssemblyError");
function markGatewayConnectAssemblyError(error) {
	Object.defineProperty(error, GATEWAY_CONNECT_ASSEMBLY_ERROR, {
		configurable: true,
		value: true
	});
	return error;
}
function isGatewayConnectAssemblyError(value) {
	return value instanceof Error && value[GATEWAY_CONNECT_ASSEMBLY_ERROR] === true;
}
function isGatewayClientStoppedError(err) {
	const message = err instanceof Error ? err.message : String(err);
	return message === "gateway client stopped" || message === "Error: gateway client stopped";
}
function formatGatewayClientErrorForLog(err) {
	return String(err).replace(/\/\/([^@/?#\s]+)@/g, "//***:***@").replace(/(Authorization:\s*Bearer\s+)[^\s]+/giu, "$1***").replace(/([?&])([^=&\s]+)=([^&#\s"'<>)]*)/g, (match, prefix, key) => isSensitiveUrlQueryParamName(key) ? `${prefix}${key}=***` : match);
}
const FORCE_STOP_TERMINATE_GRACE_MS = 250;
const STOP_AND_WAIT_TIMEOUT_MS = 1e3;
const MAX_SUPPRESSED_TRANSIENT_PRE_HELLO_CLEAN_CLOSES = 1;
function resolveLegacyNodePlatform(platform) {
	switch (platform) {
		case "macos": return "darwin";
		case "windows": return "win32";
		default: return;
	}
}
var GatewayClient$1 = class {
	constructor(opts) {
		this.ws = null;
		this.stopped = false;
		this.useLegacyNodeProtocolEnvelope = false;
		this.nodeProtocolTransitionPending = false;
		this.suppressNextHelloCallback = false;
		this.pendingDeviceTokenRetry = false;
		this.deviceTokenRetryBudgetUsed = false;
		this.approvalRuntimeTokenCompatibilityDisabled = false;
		this.approvalRuntimeTokenRetryBudgetUsed = false;
		this.lastTick = null;
		this.tickIntervalMs = 3e4;
		this.tickTimer = null;
		this.pendingStop = null;
		this.transportValidated = false;
		this.suppressedTransientPreHelloCleanCloses = 0;
		this.deps = resolveHostDeps(opts.hostDeps);
		this.opts = {
			...opts,
			deviceIdentity: opts.deviceIdentity === null ? void 0 : opts.deviceIdentity ?? this.deps.loadOrCreateDeviceIdentity()
		};
		this.requestTimeoutMs = typeof opts.requestTimeoutMs === "number" && Number.isFinite(opts.requestTimeoutMs) ? opts.requestTimeoutMs : DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS;
		const connectChallengeTimeoutMs = resolveConnectChallengeTimeoutMs(this.opts.connectChallengeTimeoutMs, {
			env: this.opts.env,
			configuredTimeoutMs: this.opts.preauthHandshakeTimeoutMs
		});
		this.protocol = new GatewayProtocolClient({
			createSocket: (handlers) => this.createSocket(handlers),
			createRequestId: randomUUID,
			createRequestError: (error) => new GatewayClientRequestError(error),
			createRequestTimeoutError: (method, timeoutMs, requestSent) => new GatewayClientRequestTimeoutError({
				method,
				timeoutMs,
				requestSent
			}),
			createRequestAbortError: createGatewayRequestAbortError,
			buildConnectPlan: ({ nonce, challengeTs }) => {
				if (!nonce) throw new Error("gateway connect challenge missing nonce");
				if (this.opts.deviceIdentity && challengeTs == null) throw new Error("gateway connect challenge timestamp invalid");
				return this.assembleConnectParams({
					role: this.opts.role ?? "operator",
					nonce,
					signedAtMs: challengeTs ?? Date.now()
				});
			},
			buildConnectParams: (assembled) => assembled.params,
			onConnectPlanError: (error) => {
				this.stopped = true;
				const marked = markGatewayConnectAssemblyError(error);
				const msg = `gateway connect failed: ${formatGatewayClientErrorForLog(error)}`;
				if (this.opts.mode === GATEWAY_CLIENT_MODES.PROBE || isGatewayClientStoppedError(error)) this.logDebug(msg);
				else this.logError(msg);
				return {
					closeCode: 1008,
					closeReason: "connect failed",
					stop: true,
					error: marked
				};
			},
			onConnectHello: (hello, context) => this.handleConnectHello(hello, context.plan),
			onHello: (hello) => {
				if (this.suppressNextHelloCallback) {
					this.suppressNextHelloCallback = false;
					return;
				}
				this.opts.onHelloOk?.(hello);
			},
			onConnectFailure: (error, context) => this.handleConnectRequestFailure(error, context.plan),
			resolveClose: (context) => this.resolveClose(context),
			onClose: (context, decision) => {
				if (this.tickTimer) {
					clearInterval(this.tickTimer);
					this.tickTimer = null;
				}
				if (decision.notify) this.opts.onClose?.(context.code, context.reason, this.closeInfo(context));
			},
			notifyStoppedClose: true,
			onConnectError: (error) => this.notifyConnectError(error),
			onReconnectStopped: (error) => this.notifyReconnectPaused({
				code: 1008,
				reason: error.message,
				detailCode: null
			}),
			onParseError: (error) => this.logDebug(`gateway client parse error: ${formatGatewayClientErrorForLog(error)}`),
			onEvent: (event) => this.opts.onEvent?.(event),
			onGap: (info) => this.opts.onGap?.(info),
			onActivity: () => {
				this.lastTick = Date.now();
			},
			onCallbackError: (label, error) => this.logDebug(`gateway client ${label === "hello" ? "hello-ok" : label === "gap" ? "event" : label} handler error: ${formatGatewayClientErrorForLog(error)}`),
			handshake: {
				mode: "require-challenge",
				timeoutMs: connectChallengeTimeoutMs,
				timeoutMessage: (elapsedMs) => `gateway connect challenge timeout (waited ${elapsedMs}ms, limit ${connectChallengeTimeoutMs}ms)`
			},
			reconnect: {
				initialMs: 1e3,
				multiplier: 2,
				maxMs: 3e4
			},
			requestTimeoutMs: this.requestTimeoutMs,
			shouldRetrySocketFactoryError: (error) => !(error instanceof GatewayWebSocketTransportConfigurationError) && !(error instanceof SyntaxError) && !(error instanceof TypeError) && !(error instanceof RangeError),
			rethrowSocketFactoryError: (error) => error instanceof GatewayClientTransportPolicyError
		});
	}
	getConnectionMetadata() {
		return {
			clientName: this.opts.clientName,
			hasDeviceIdentity: Boolean(this.opts.deviceIdentity),
			mode: this.opts.mode,
			preauthHandshakeTimeoutMs: this.opts.preauthHandshakeTimeoutMs
		};
	}
	updateNodeManifest(manifest) {
		this.opts = {
			...this.opts,
			caps: [...manifest.caps],
			commands: [...manifest.commands],
			computerUse: manifest.computerUse === void 0 ? void 0 : structuredClone(manifest.computerUse),
			workerRuns: manifest.workerRuns ? structuredClone(manifest.workerRuns) : void 0
		};
		if (!this.stopped) this.protocol.closeSocket(1012, "node manifest changed");
	}
	start() {
		if (this.stopped) return;
		this.protocol.start();
	}
	createSocket(handlers) {
		const url = this.opts.url ?? DEFAULT_GATEWAY_CLIENT_URL;
		const configuredEdgeAuthHeaders = this.opts.edgeAuthHeaders;
		const edgeAuthHeaders = configuredEdgeAuthHeaders && Object.keys(configuredEdgeAuthHeaders).length > 0 ? configuredEdgeAuthHeaders : void 0;
		if (edgeAuthHeaders && new URL(url).protocol !== "wss:") throw new GatewayWebSocketTransportConfigurationError("edge auth headers require a wss:// Gateway URL");
		const handshakeTimeoutMs = resolvePreauthHandshakeTimeoutMs({
			env: this.opts.env,
			configuredTimeoutMs: this.opts.preauthHandshakeTimeoutMs
		});
		const transport = resolveGatewayWebSocketTransport({
			url,
			tlsFingerprint: this.opts.tlsFingerprint,
			env: this.opts.env,
			normalizeTlsFingerprint: this.deps.normalizeTlsFingerprint,
			options: {
				maxPayload: 26214400,
				handshakeTimeout: handshakeTimeoutMs,
				...this.opts.origin ? { origin: this.opts.origin } : {},
				...edgeAuthHeaders ? {
					followRedirects: false,
					headers: edgeAuthHeaders
				} : {}
			}
		});
		this.deps.beforeConnect();
		let ws;
		let unregisterGatewayLoopbackBypass;
		try {
			unregisterGatewayLoopbackBypass = this.deps.registerGatewayLoopbackBypass(url);
		} catch (error) {
			throw new GatewayClientTransportPolicyError(error instanceof Error ? error.message : String(error));
		}
		try {
			ws = new WebSocket(url, transport.options);
			ws.binaryType = "nodebuffer";
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error));
		} finally {
			unregisterGatewayLoopbackBypass?.();
		}
		this.ws = ws;
		this.transportValidated = false;
		let upgradeError;
		ws.on("open", () => {
			this.transportValidated = true;
			handlers.open();
		});
		ws.on("message", (data) => handlers.message(rawDataToString(data)));
		ws.on("close", (code, reason) => {
			const reasonText = reason.toString();
			if (this.ws === ws) this.ws = null;
			this.resolvePendingStop(ws);
			handlers.close(code, reasonText);
		});
		ws.on("unexpected-response", (request, response) => {
			readUpgradeErrorBody(response).then((body) => {
				const statusCode = response.statusCode;
				let gatewayError;
				try {
					const parsed = JSON.parse(body);
					const parsedError = isRecord(parsed) ? parsed.error : void 0;
					gatewayError = isRecord(parsedError) ? parsedError : void 0;
				} catch {}
				const rawLocation = response.headers.location;
				const location = rawLocation ? redactSensitiveUrlLikeString(Array.isArray(rawLocation) ? rawLocation[0] ?? "" : rawLocation) : void 0;
				const message = `gateway rejected websocket upgrade (HTTP ${statusCode ?? "unknown"})${body ? `: ${body}` : ""}`;
				upgradeError = new GatewayClientRequestError({
					code: "UNAVAILABLE",
					message,
					retryable: true,
					details: {
						reason: "websocket-upgrade-rejected",
						...statusCode === void 0 ? {} : { httpStatus: statusCode },
						...location ? { location } : {},
						...typeof gatewayError?.type === "string" ? {
							gatewayErrorType: gatewayError.type,
							...typeof gatewayError.message === "string" ? { gatewayErrorMessage: gatewayError.message } : {}
						} : {}
					}
				});
				handlers.error(upgradeError);
				request.destroy();
				ws.close();
			});
		});
		ws.on("error", (err) => {
			if (upgradeError) return;
			this.logDebug(`gateway client error: ${formatGatewayClientErrorForLog(err)}`);
			handlers.error(err instanceof Error ? err : new Error(String(err)));
		});
		return {
			isOpen: () => ws.readyState === WebSocket.OPEN,
			send: (data) => ws.send(data),
			close: (code, reason) => ws.close(code, reason)
		};
	}
	stop() {
		this.beginStop();
	}
	async stopAndWait(opts) {
		const stopPromise = this.beginStop();
		if (!stopPromise) return;
		const timeoutMs = opts?.timeoutMs === void 0 ? STOP_AND_WAIT_TIMEOUT_MS : resolveSafeTimeoutDelayMs(opts.timeoutMs);
		let timeout = null;
		try {
			await Promise.race([stopPromise, new Promise((_, reject) => {
				timeout = setTimeout(() => {
					reject(/* @__PURE__ */ new Error(`gateway client stop timed out after ${timeoutMs}ms`));
				}, timeoutMs);
				timeout.unref?.();
			})]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}
	beginStop() {
		this.stopped = true;
		this.pendingDeviceTokenRetry = false;
		this.deviceTokenRetryBudgetUsed = false;
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = null;
		}
		if (this.pendingStop) return this.pendingStop.promise;
		const ws = this.ws;
		this.ws = null;
		if (ws) {
			const pendingStop = this.createPendingStop(ws);
			const forceTerminateTimer = setTimeout(() => {
				try {
					ws.terminate();
				} finally {
					this.resolvePendingStop(ws);
				}
			}, FORCE_STOP_TERMINATE_GRACE_MS);
			forceTerminateTimer.unref?.();
			pendingStop.terminateTimer = forceTerminateTimer;
			if (this.protocol.connecting) {
				const error = /* @__PURE__ */ new Error("gateway client stopped");
				this.notifyConnectError(error);
				this.logDebug(`gateway connect failed: ${formatGatewayClientErrorForLog(error)}`);
			}
			this.protocol.stop();
			return pendingStop.promise;
		}
		this.protocol.stop();
		return null;
	}
	createPendingStop(ws) {
		if (this.pendingStop?.ws === ws) return this.pendingStop;
		let resolve = () => {};
		const promise = new Promise((done) => {
			resolve = done;
		});
		this.pendingStop = {
			ws,
			promise,
			resolve
		};
		return this.pendingStop;
	}
	resolvePendingStop(ws) {
		if (this.pendingStop?.ws !== ws) return;
		const { resolve, terminateTimer } = this.pendingStop;
		if (terminateTimer) clearTimeout(terminateTimer);
		this.pendingStop = null;
		resolve();
	}
	logDebug(message) {
		this.deps.logDebug(this.deps.redactForLog(message));
	}
	logError(message) {
		this.deps.logError(this.deps.redactForLog(message));
	}
	assembleConnectParams(params) {
		const { role, nonce, signedAtMs } = params;
		const selectedAuth = this.selectConnectAuth(role);
		const { authDeviceToken, authApprovalRuntimeToken, authAgentRuntimeIdentityToken, signatureToken, resolvedDeviceToken, storedToken, storedScopes, usingStoredDeviceToken } = selectedAuth;
		if (this.pendingDeviceTokenRetry && authDeviceToken) this.pendingDeviceTokenRetry = false;
		const auth = buildGatewayConnectAuth(selectedAuth);
		const scopes = resolveGatewayConnectScopes({
			requestedScopes: this.opts.scopes,
			usingStoredDeviceToken,
			storedScopes,
			defaultScopes: ["operator.admin"]
		});
		const clientMode = this.opts.mode ?? GATEWAY_CLIENT_MODES.BACKEND;
		const clientId = this.opts.clientName ?? GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT;
		const isBuiltInNodeHost = role === "node" && clientMode === GATEWAY_CLIENT_MODES.NODE && clientId === GATEWAY_CLIENT_NAMES.NODE_HOST;
		const negotiatesNodeProtocol = this.shouldNegotiateLegacyNodeProtocol();
		const useLegacyNodeProtocolEnvelope = isBuiltInNodeHost && (this.useLegacyNodeProtocolEnvelope || this.opts.maxProtocol === 3 && (this.opts.minProtocol ?? 3) <= 3);
		const minProtocol = useLegacyNodeProtocolEnvelope ? 3 : negotiatesNodeProtocol ? 4 : this.opts.minProtocol ?? (clientMode === GATEWAY_CLIENT_MODES.PROBE ? 3 : role === "node" && clientMode === GATEWAY_CLIENT_MODES.NODE ? 3 : 4);
		const maxProtocol = useLegacyNodeProtocolEnvelope ? 3 : negotiatesNodeProtocol ? 4 : this.opts.maxProtocol ?? 4;
		const configuredPlatform = this.opts.platform ?? process.platform;
		const platform = useLegacyNodeProtocolEnvelope ? resolveLegacyNodePlatform(configuredPlatform) ?? configuredPlatform : configuredPlatform;
		const deviceFamily = useLegacyNodeProtocolEnvelope ? void 0 : this.opts.deviceFamily;
		return {
			params: {
				minProtocol,
				maxProtocol,
				client: {
					id: clientId,
					displayName: this.opts.clientDisplayName,
					version: this.opts.clientVersion ?? DEFAULT_CLIENT_VERSION,
					buildId: this.opts.clientBuildId,
					platform,
					deviceFamily,
					mode: clientMode,
					instanceId: this.opts.instanceId
				},
				caps: Array.isArray(this.opts.caps) ? this.opts.caps : [],
				commands: Array.isArray(this.opts.commands) ? this.opts.commands : void 0,
				computerUse: useLegacyNodeProtocolEnvelope ? void 0 : this.opts.computerUse,
				workerRuns: useLegacyNodeProtocolEnvelope ? void 0 : this.opts.workerRuns,
				permissions: this.opts.permissions && typeof this.opts.permissions === "object" ? this.opts.permissions : void 0,
				pathEnv: this.opts.pathEnv,
				auth,
				role,
				scopes,
				device: this.buildDeviceConnectParams({
					nonce,
					role,
					scopes,
					signatureToken,
					signedAtMs,
					platform,
					deviceFamily,
					clientMode
				})
			},
			authApprovalRuntimeToken,
			authAgentRuntimeIdentityToken,
			resolvedDeviceToken,
			storedScopes,
			storedToken,
			usingStoredDeviceToken
		};
	}
	shouldNegotiateLegacyNodeProtocol() {
		if (this.opts.role !== "node" || this.opts.mode !== GATEWAY_CLIENT_MODES.NODE || this.opts.clientName !== GATEWAY_CLIENT_NAMES.NODE_HOST) return false;
		return (this.opts.minProtocol ?? 3) === 3 && (this.opts.maxProtocol ?? 4) === 4;
	}
	shouldRetryWithLegacyNodeProtocol(error) {
		if (this.useLegacyNodeProtocolEnvelope || !this.shouldNegotiateLegacyNodeProtocol() || !(error instanceof GatewayClientRequestError)) return false;
		const detailCode = readConnectErrorDetailCode(error.details);
		return error.details?.expectedProtocol === 3 && (detailCode === ConnectErrorDetailCodes.PROTOCOL_MISMATCH || normalizeGatewayErrorText(error.message).includes("protocol mismatch"));
	}
	shouldRetryWithCurrentNodeProtocol(error) {
		if (!this.useLegacyNodeProtocolEnvelope || !this.shouldNegotiateLegacyNodeProtocol() || !(error instanceof GatewayClientRequestError)) return false;
		const detailCode = readConnectErrorDetailCode(error.details);
		return error.details?.expectedProtocol === 4 && (detailCode === ConnectErrorDetailCodes.PROTOCOL_MISMATCH || normalizeGatewayErrorText(error.message).includes("protocol mismatch"));
	}
	buildDeviceConnectParams(params) {
		if (!this.opts.deviceIdentity) return;
		const { nonce, role, scopes, signatureToken, signedAtMs, platform, deviceFamily, clientMode } = params;
		const payload = buildDeviceAuthPayloadV3({
			deviceId: this.opts.deviceIdentity.deviceId,
			clientId: this.opts.clientName ?? GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
			clientMode,
			role,
			scopes,
			signedAtMs,
			token: signatureToken ?? null,
			nonce,
			platform,
			deviceFamily
		});
		const signature = this.deps.signDevicePayload(this.opts.deviceIdentity.privateKeyPem, payload);
		return {
			id: this.opts.deviceIdentity.deviceId,
			publicKey: this.deps.publicKeyRawBase64UrlFromPem(this.opts.deviceIdentity.publicKeyPem),
			signature,
			signedAt: signedAtMs,
			nonce
		};
	}
	handleConnectHello(helloOk, assembled) {
		const reconnectWithCurrentNodeProtocol = this.useLegacyNodeProtocolEnvelope && this.shouldNegotiateLegacyNodeProtocol() && helloOk.protocol > 3;
		if (reconnectWithCurrentNodeProtocol) this.useLegacyNodeProtocolEnvelope = false;
		this.nodeProtocolTransitionPending = false;
		this.pendingDeviceTokenRetry = false;
		this.deviceTokenRetryBudgetUsed = false;
		this.suppressedTransientPreHelloCleanCloses = 0;
		const role = this.opts.role ?? "operator";
		const authInfo = helloOk.auth;
		if (authInfo?.deviceToken && this.opts.deviceIdentity) {
			const tokenRole = authInfo.role ?? role;
			const scopes = tokenRole === role && authInfo.deviceToken === assembled.storedToken ? assembled.storedScopes ?? authInfo.scopes ?? [] : authInfo.scopes ?? [];
			this.deps.storeDeviceAuthToken({
				deviceId: this.opts.deviceIdentity.deviceId,
				role: tokenRole,
				token: authInfo.deviceToken,
				scopes,
				env: this.opts.env
			});
		}
		if (this.opts.preferBootstrapToken) {
			this.opts.token = void 0;
			this.opts.bootstrapToken = void 0;
			this.opts.password = void 0;
			this.opts.preferBootstrapToken = false;
		}
		this.tickIntervalMs = typeof helloOk.policy?.tickIntervalMs === "number" ? helloOk.policy.tickIntervalMs : 3e4;
		if (reconnectWithCurrentNodeProtocol) {
			this.suppressNextHelloCallback = true;
			this.protocol.resetReconnectBackoff(250);
			this.protocol.closeSocket(1012, "gateway protocol upgraded");
			return;
		}
		this.lastTick = Date.now();
		this.startTickWatch();
	}
	handleConnectRequestFailure(error, assembled) {
		if (this.shouldRetryWithCurrentNodeProtocol(error)) {
			const resetBackoff = !this.nodeProtocolTransitionPending;
			this.useLegacyNodeProtocolEnvelope = false;
			this.nodeProtocolTransitionPending = true;
			if (resetBackoff) this.protocol.resetReconnectBackoff(250);
			this.logDebug("gateway rejected protocol v3; retrying node host with protocol v4");
			return {
				closeCode: 1008,
				closeReason: "connect retry"
			};
		}
		if (this.shouldRetryWithLegacyNodeProtocol(error)) {
			const resetBackoff = !this.nodeProtocolTransitionPending;
			this.useLegacyNodeProtocolEnvelope = true;
			this.nodeProtocolTransitionPending = true;
			if (resetBackoff) this.protocol.resetReconnectBackoff(250);
			this.logDebug("gateway rejected protocol v4; retrying node host with protocol v3");
			return {
				closeCode: 1008,
				closeReason: "connect retry"
			};
		}
		this.nodeProtocolTransitionPending = false;
		const role = this.opts.role ?? "operator";
		const detailCode = error instanceof GatewayClientRequestError ? readConnectErrorDetailCode(error.details) : null;
		const shouldRetryWithDeviceToken = shouldRetryGatewayWithDeviceToken({
			retryBudgetUsed: this.deviceTokenRetryBudgetUsed,
			currentDeviceToken: assembled.resolvedDeviceToken,
			explicitToken: this.opts.token?.trim() || void 0,
			storedToken: assembled.storedToken,
			trustedEndpoint: this.isTrustedDeviceRetryEndpoint(),
			errorDetails: error instanceof GatewayClientRequestError ? error.details : void 0
		});
		if (this.opts.deviceIdentity && assembled.usingStoredDeviceToken && detailCode === ConnectErrorDetailCodes.AUTH_DEVICE_TOKEN_MISMATCH) {
			const deviceId = this.opts.deviceIdentity.deviceId;
			try {
				this.deps.clearDeviceAuthToken({
					deviceId,
					role,
					env: this.opts.env
				});
				this.logDebug(`cleared stale device-auth token for device ${deviceId}`);
			} catch (clearError) {
				this.logDebug(`failed clearing stale device-auth token for device ${deviceId}: ${String(clearError)}`);
			}
		}
		if (shouldRetryWithDeviceToken) {
			this.pendingDeviceTokenRetry = true;
			this.deviceTokenRetryBudgetUsed = true;
			this.protocol.resetReconnectBackoff(250);
		}
		const startupRetryAfterMs = resolveGatewayStartupRetryAfterMs(error);
		if (startupRetryAfterMs !== null) {
			this.logDebug(`gateway connect failed: ${formatGatewayClientErrorForLog(error)}`);
			return {
				closeCode: 1013,
				closeReason: "gateway starting",
				reconnectDelayMs: startupRetryAfterMs
			};
		}
		if (this.shouldFailClosedForUnsupportedAgentRuntimeIdentity({
			error,
			authAgentRuntimeIdentityToken: assembled.authAgentRuntimeIdentityToken
		})) {
			const unsupportedIdentityError = /* @__PURE__ */ new Error("gateway rejected required agent runtime identity auth field; refusing to retry without it");
			this.stopped = true;
			this.notifyConnectError(unsupportedIdentityError);
			this.logError(`gateway connect failed: ${unsupportedIdentityError.message}`);
			return {
				closeCode: 1008,
				closeReason: "connect failed",
				stop: true
			};
		}
		if (this.shouldRetryWithoutApprovalRuntimeToken({
			error,
			authApprovalRuntimeToken: assembled.authApprovalRuntimeToken
		})) {
			this.approvalRuntimeTokenCompatibilityDisabled = true;
			this.approvalRuntimeTokenRetryBudgetUsed = true;
			this.protocol.resetReconnectBackoff(250);
			this.logDebug("gateway rejected approval runtime auth field; retrying without it");
			return {
				closeCode: 1008,
				closeReason: "connect retry"
			};
		}
		this.notifyConnectError(error);
		const message = `gateway connect failed: ${formatGatewayClientErrorForLog(error)}`;
		if (this.opts.mode === GATEWAY_CLIENT_MODES.PROBE || isGatewayClientStoppedError(error) || detailCode === ConnectErrorDetailCodes.AUTH_RATE_LIMITED) this.logDebug(message);
		else this.logError(message);
		return {
			closeCode: 1008,
			closeReason: "connect failed"
		};
	}
	resolveClose(context) {
		const info = this.closeInfo(context);
		const detailCode = context.connectFailure?.error instanceof GatewayClientRequestError ? readConnectErrorDetailCode(context.connectFailure.error.details) : null;
		const details = context.connectFailure?.error instanceof GatewayClientRequestError ? context.connectFailure.error.details : void 0;
		if (context.code === 1013 && context.connectFailure?.reconnectDelayMs !== void 0) return {
			retry: true,
			notify: this.opts.notifyOnStartupRetry === true,
			reconnectDelayMs: context.connectFailure.reconnectDelayMs
		};
		if (info.transientPreHelloCleanClose && this.suppressedTransientPreHelloCleanCloses < MAX_SUPPRESSED_TRANSIENT_PRE_HELLO_CLEAN_CLOSES) {
			this.suppressedTransientPreHelloCleanCloses += 1;
			return {
				retry: true,
				notify: true,
				pendingError: /* @__PURE__ */ new Error("gateway transient pre-hello clean close")
			};
		}
		if (info.transientPreHelloCleanClose || context.connectRequestSent && !context.helloReceived && !context.connectFailure) {
			const error = /* @__PURE__ */ new Error(`gateway closed (${context.code}): ${context.reason}`);
			this.notifyConnectError(error);
			this.logError(`gateway connect failed: ${formatGatewayClientErrorForLog(error)}`);
		}
		this.clearStaleDeviceTokenForClose(context.code, context.reason);
		if (shouldPauseGatewayReconnect({
			details,
			deviceTokenRetryPending: this.pendingDeviceTokenRetry,
			tokenMismatchIsTerminal: true,
			protocolMismatchIsTerminal: !this.nodeProtocolTransitionPending,
			clientVersionMismatchIsTerminal: true
		})) {
			this.notifyReconnectPaused({
				code: context.code,
				reason: context.reason,
				detailCode
			});
			return {
				retry: false,
				notify: true
			};
		}
		return {
			retry: true,
			notify: true,
			reconnectDelayMs: context.connectFailure?.reconnectDelayMs
		};
	}
	closeInfo(context) {
		return {
			phase: context.helloReceived ? "post-hello" : "pre-hello",
			socketOpened: context.socketOpened,
			transportValidated: this.transportValidated,
			connectRequestSent: context.connectRequestSent,
			transientPreHelloCleanClose: !context.helloReceived && context.code === 1e3 && context.reason === "",
			...context.connectFailure?.error ? { connectError: context.connectFailure.error } : {}
		};
	}
	clearStaleDeviceTokenForClose(code, reason) {
		if (code !== 1008 || !normalizeGatewayErrorText(reason).includes("device token mismatch") || this.opts.token || this.opts.password || !this.opts.deviceIdentity) return;
		const deviceId = this.opts.deviceIdentity.deviceId;
		const role = this.opts.role ?? "operator";
		try {
			this.deps.clearDeviceAuthToken({
				deviceId,
				role,
				env: this.opts.env
			});
			this.logDebug(`cleared stale device-auth token for device ${deviceId}`);
		} catch (error) {
			this.logDebug(`failed clearing stale device-auth token for device ${deviceId}: ${String(error)}`);
		}
	}
	notifyConnectError(error) {
		try {
			this.opts.onConnectError?.(error);
		} catch (err) {
			this.logDebug(`gateway client connect error handler error: ${formatGatewayClientErrorForLog(err)}`);
		}
	}
	notifyReconnectPaused(info) {
		try {
			this.opts.onReconnectPaused?.(info);
		} catch (err) {
			this.logDebug(`gateway client reconnect paused handler error: ${formatGatewayClientErrorForLog(err)}`);
		}
	}
	shouldRetryWithoutApprovalRuntimeToken(params) {
		if (this.approvalRuntimeTokenRetryBudgetUsed) return false;
		if (!params.authApprovalRuntimeToken) return false;
		if (!(params.error instanceof GatewayClientRequestError)) return false;
		if (params.error.gatewayCode !== "INVALID_REQUEST") return false;
		const message = normalizeGatewayErrorText(params.error.message);
		return message.includes("invalid connect params") && message.includes("approvalruntimetoken");
	}
	shouldFailClosedForUnsupportedAgentRuntimeIdentity(params) {
		if (!params.authAgentRuntimeIdentityToken) return false;
		if (!(params.error instanceof GatewayClientRequestError)) return false;
		if (params.error.gatewayCode !== "INVALID_REQUEST") return false;
		const message = normalizeGatewayErrorText(params.error.message);
		return message.includes("invalid connect params") && message.includes("agentruntimeidentitytoken");
	}
	isTrustedDeviceRetryEndpoint() {
		const rawUrl = this.opts.url ?? "ws://127.0.0.1:18789";
		try {
			const parsed = new URL(rawUrl);
			const protocol = parsed.protocol === "https:" ? "wss:" : parsed.protocol === "http:" ? "ws:" : parsed.protocol;
			if (isGatewayLoopbackHost(parsed.hostname)) return true;
			return protocol === "wss:" && Boolean(this.opts.tlsFingerprint?.trim());
		} catch {
			return false;
		}
	}
	selectConnectAuth(role) {
		const storedAuth = this.opts.deviceIdentity ? this.deps.loadDeviceAuthToken({
			deviceId: this.opts.deviceIdentity.deviceId,
			role,
			env: this.opts.env
		}) : null;
		return selectGatewayConnectAuth({
			token: this.opts.token,
			bootstrapToken: this.opts.bootstrapToken,
			preferBootstrapToken: this.opts.preferBootstrapToken,
			deviceToken: this.opts.deviceToken,
			password: this.opts.password,
			approvalRuntimeToken: this.approvalRuntimeTokenCompatibilityDisabled ? void 0 : this.opts.approvalRuntimeToken,
			agentRuntimeIdentityToken: this.opts.agentRuntimeIdentityToken,
			storedToken: storedAuth?.token,
			storedScopes: storedAuth?.scopes,
			pendingDeviceTokenRetry: this.pendingDeviceTokenRetry,
			trustedDeviceTokenRetry: this.isTrustedDeviceRetryEndpoint()
		});
	}
	startTickWatch() {
		if (this.tickTimer) clearInterval(this.tickTimer);
		const rawMinInterval = this.opts.tickWatchMinIntervalMs;
		const minInterval = typeof rawMinInterval === "number" && Number.isFinite(rawMinInterval) ? Math.max(1, Math.min(3e4, rawMinInterval)) : 1e3;
		const interval = resolveSafeTimeoutDelayMs(Math.max(this.tickIntervalMs, minInterval));
		this.tickTimer = setInterval(() => {
			if (this.stopped) return;
			if (!this.lastTick) return;
			if (this.protocol.hasPendingRequests && !this.protocol.hasUnboundedPendingRequests) return;
			const gap = Date.now() - this.lastTick;
			const rawTimeoutMs = this.opts.tickWatchTimeoutMs;
			if (gap > (typeof rawTimeoutMs === "number" && Number.isFinite(rawTimeoutMs) ? Math.max(1, rawTimeoutMs) : this.tickIntervalMs * 2)) this.protocol.closeSocket(4e3, "tick timeout");
		}, interval);
	}
	async request(method, params, opts) {
		const expectFinal = opts?.expectFinal === true;
		const timeoutMs = opts?.timeoutMs === null ? null : typeof opts?.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : expectFinal ? null : this.requestTimeoutMs;
		return this.protocol.request(method, params, {
			expectFinal,
			timeoutMs,
			signal: opts?.signal,
			onSent: opts?.onSent,
			onAccepted: opts?.onAccepted
		});
	}
};
function createGatewayRequestAbortError(method) {
	const err = /* @__PURE__ */ new Error(`gateway request aborted for ${method}`);
	err.name = "AbortError";
	return err;
}
//#endregion
//#region src/gateway/client.ts
function createOpenClawGatewayClientHostDeps(overrides, deviceAuthScope, suppressOriginDeviceAuth = false, sharedStateMode, preparedDeviceAuth) {
	const readOnly = sharedStateMode === "read-only";
	const rotationFence = preparedDeviceAuth ? { expectedToken: preparedDeviceAuth.token } : void 0;
	const deviceAuthDeps = deviceAuthScope ? {
		loadDeviceAuthToken: (params) => suppressOriginDeviceAuth ? null : readOnly ? loadOriginDeviceTokenReadOnly({
			...params,
			gatewayScope: deviceAuthScope
		}) : loadOriginDeviceToken({
			...params,
			gatewayScope: deviceAuthScope
		}),
		storeDeviceAuthToken: readOnly ? () => {} : (params) => storeOriginDeviceToken({
			...params,
			gatewayScope: deviceAuthScope,
			...rotationFence
		}),
		clearDeviceAuthToken: readOnly ? () => {} : (params) => clearOriginDeviceToken({
			...params,
			gatewayScope: deviceAuthScope,
			...rotationFence
		})
	} : readOnly ? {
		loadDeviceAuthToken: loadDeviceAuthTokenReadOnly,
		storeDeviceAuthToken: () => {},
		clearDeviceAuthToken: () => {}
	} : {
		loadDeviceAuthToken,
		storeDeviceAuthToken: (params) => storeDeviceAuthToken({
			...params,
			...rotationFence
		}),
		clearDeviceAuthToken: (params) => clearDeviceAuthToken({
			...params,
			...rotationFence
		})
	};
	const preparedDeviceAuthDeps = preparedDeviceAuth ? {
		...deviceAuthDeps,
		loadDeviceAuthToken: () => preparedDeviceAuth
	} : deviceAuthDeps;
	return {
		loadOrCreateDeviceIdentity,
		signDevicePayload,
		publicKeyRawBase64UrlFromPem,
		...preparedDeviceAuthDeps,
		beforeConnect: ensureInheritedManagedProxyRoutingActive,
		registerGatewayLoopbackBypass: registerManagedProxyGatewayLoopbackBypass,
		logDebug,
		logError,
		redactForLog: redactToolPayloadText,
		...overrides,
		...readOnly ? {
			loadOrCreateDeviceIdentity: () => loadDeviceIdentityIfPresent() ?? void 0,
			...preparedDeviceAuthDeps
		} : {}
	};
}
var GatewayClient = class {
	#client;
	constructor(opts) {
		const { deviceAuthScope, preparedDeviceAuth, sharedStateMode, ...baseOptions } = opts;
		const suppressOriginDeviceAuth = Boolean(deviceAuthScope && (baseOptions.token?.trim() || baseOptions.password?.trim()));
		for (const value of Object.values(baseOptions.edgeAuthHeaders ?? {})) registerSecretValueForRedaction(value);
		this.#client = new GatewayClient$1({
			...baseOptions,
			clientVersion: baseOptions.clientVersion ?? VERSION,
			hostDeps: createOpenClawGatewayClientHostDeps(baseOptions.hostDeps, deviceAuthScope, suppressOriginDeviceAuth, sharedStateMode, preparedDeviceAuth)
		});
	}
	start() {
		this.#client.start();
	}
	stop() {
		this.#client.stop();
	}
	stopAndWait(opts) {
		return this.#client.stopAndWait(opts);
	}
	request(method, params, opts) {
		return this.#client.request(method, params, opts);
	}
	getConnectionMetadata() {
		return this.#client.getConnectionMetadata();
	}
	updateNodeManifest(manifest) {
		this.#client.updateNodeManifest(manifest);
	}
};
//#endregion
export { isGatewayConnectAssemblyError as n, GatewayClient as t };
