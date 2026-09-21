import { o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import "./utils-D3A1hGii.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { f as WORKER_PROTOCOL_METHODS, h as WORKER_SESSION_TOOLS_PROTOCOL_FEATURE, i as WORKER_HEARTBEAT_INTERVAL_MS, r as WORKER_GITHUB_PUBLICATION_PROTOCOL_FEATURE, s as WORKER_PORTAL_PROTOCOL_FEATURE } from "./worker-admission-B7c6K0nm.js";
import { Bo as validateWorkerHeartbeatParams, Go as validateWorkerTranscriptCommitParams, Ho as validateWorkerPortalParams, No as validateWorkerComputerParams, Po as validateWorkerConnectRequestFrame, Uo as validateWorkerSessionsSendParams, Vo as validateWorkerLiveEventParams, Wo as validateWorkerSessionsSpawnParams, Xn as validateRequestFrame, zo as validateWorkerGitHubPublishParams } from "./src-B9mb84px.js";
import { s as WORKER_PROTOCOL_MAX_PAYLOAD_BYTES } from "./worker-protocol-primitives-Dh40okcI.js";
import "./io-Des9Xfzj.js";
import { a as isLoopbackAddress } from "./net-CLIrL_-C.js";
import { u as AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION } from "./auth-rate-limit-Dmj7HxbF.js";
import { o as readPreparedGatewayIngressAttribution } from "./ingress-attribution-CFC44c07.js";
import { n as withSerializedRateLimitAttempt } from "./rate-limit-attempt-serialization-DtCldbAd.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import "./version-CwNT1gaY.js";
import { s as resolvePreauthHandshakeTimeoutMs } from "./timeouts-D2XMKe-X.js";
import "./startup-unavailable-D0-EeFjq.js";
import { t as rawDataToString } from "./websocket-data-2vBvd4uX.js";
import { T as tryBeginGatewayRootWorkAdmission, c as getGatewaySuspendAdmissionPhase, u as isGatewayRestartDraining, x as runWithGatewayIndependentRootWorkContinuation } from "./gateway-work-admission-3tn4Qiws.js";
import { a as WORKER_PROTOCOL_MAX_INFERENCE_PAYLOAD_BYTES, h as validateWorkerInferenceStartParams, p as validateWorkerInferenceCancelParams, r as WORKER_INFERENCE_METHODS } from "./worker-inference-BzLcqsR7.js";
import { u as isWebchatClient } from "./message-channel-BGKf9KPa.js";
import { a as MAX_PAYLOAD_BYTES, i as MAX_BUFFERED_BYTES, o as MAX_PREAUTH_PAYLOAD_BYTES } from "./server-constants-BW5URgqP.js";
import { n as WORKER_SKILL_WORKSHOP_FEATURE, o as validateWorkerSkillWorkshopParams } from "./worker-skill-workshop-JjrCyuEW.js";
import { i as upsertPresence, n as touchPresence } from "./system-presence-5HkHkZCv.js";
import { s as removeRemoteNodeInfo } from "./remote-CiV-Qx_e.js";
import { c as recordPairedNodeDisconnection } from "./device-pairing-node-C4odYxnS.js";
import { t as rawDataByteLength } from "./ws-C3ckvj65.js";
import { n as logRejectedLargePayload } from "./diagnostic-payload-97JaXMk1.js";
import { t as resolveHostedPluginSurfaceUrl } from "./hosted-plugin-surface-url-WPxCfAjE.js";
import { n as logWs, t as formatForLog } from "./ws-log-CFwaDvs6.js";
import { t as resolveSharedGatewaySessionGeneration } from "./ws-shared-generation-Wt672rYh.js";
import { l as cleanupTalkConnection } from "./session-sharing-BlMqwMBH.js";
import "./server-utils-CT_zAZOY.js";
import { t as isWorkerTranscriptFrameWithinBudget } from "./worker-transcript-budget-FCBBB0Hv.js";
import "./placement-session-tool-operations-B-By5lJt.js";
import { s as runWorkerTurnAdmissionContinuation } from "./placement-turn-claim-events-D86so_oK.js";
import { t as startWebSocketKeepalive } from "./websocket-keepalive-Jg8mBtsJ.js";
import { n as classifyGatewayStaleInstall, t as GATEWAY_STALE_INSTALL_CLOSE_REASON } from "./stale-install-Coqyo4R-.js";
import { a as incrementPresenceVersion, r as getHealthVersion } from "./health-state-D1_igxji.js";
import { i as clearNodeWakeState } from "./node-wake-state-CWVR-GCk.js";
import { t as broadcastPresenceSnapshot } from "./presence-events-CEhzyB_2.js";
import { n as refreshClientPresence } from "./client-presence-CJ81NcaF.js";
import { a as takePublicWorkerIngress, r as WS_HANDSHAKE_PHASES } from "./ws-types-099MIJxx.js";
import { n as buildHandshakeAuthLogKey, r as shouldLimitMissingCredentialAuthLog, t as HandshakeAuthLogLimiter } from "./handshake-auth-log-limiter-Bxl0dwPS.js";
import { randomUUID } from "node:crypto";
//#region src/gateway/server/ws-connection-diagnostics.ts
const LOG_HEADER_MAX_LEN = 300;
const LOG_HEADER_FORMAT_REGEX = /\p{Cf}/gu;
function replaceControlChars(value) {
	let cleaned = "";
	for (const char of value) {
		const codePoint = char.codePointAt(0);
		if (codePoint !== void 0 && (codePoint <= 31 || codePoint >= 127 && codePoint <= 159)) {
			cleaned += " ";
			continue;
		}
		cleaned += char;
	}
	return cleaned;
}
function stringMetaValue(meta, key) {
	const value = meta[key];
	return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function sanitizeWsLogValue(value) {
	if (!value) return;
	const cleaned = replaceControlChars(value).replace(LOG_HEADER_FORMAT_REGEX, " ").replace(/\s+/g, " ").trim();
	if (!cleaned) return;
	if (cleaned.length <= LOG_HEADER_MAX_LEN) return cleaned;
	return truncateUtf16Safe(cleaned, LOG_HEADER_MAX_LEN);
}
function formatSocketEndpoint(address, port) {
	if (!address) return;
	if (port === void 0) return address;
	return address.includes(":") ? `[${address}]:${port}` : `${address}:${port}`;
}
function resolveSocketAddress(socket) {
	const rawSocket = socket["_socket"];
	const remoteAddr = rawSocket?.remoteAddress;
	const remotePort = rawSocket?.remotePort;
	const localAddr = rawSocket?.localAddress;
	const localPort = rawSocket?.localPort;
	const remoteEndpoint = formatSocketEndpoint(remoteAddr, remotePort);
	const localEndpoint = formatSocketEndpoint(localAddr, localPort);
	return {
		remoteAddr,
		remotePort,
		localAddr,
		localPort,
		endpoint: remoteEndpoint && localEndpoint ? `${remoteEndpoint}->${localEndpoint}` : remoteEndpoint ?? localEndpoint
	};
}
function isWsPayloadLimitError(err) {
	if (!err || typeof err !== "object") return false;
	if (err.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") return true;
	const message = err.message;
	return typeof message === "string" && /max payload size exceeded/i.test(message);
}
//#endregion
//#region src/gateway/server/ws-connection/node-lifecycle-dispatch.ts
const NODE_LIFECYCLE_METHODS = /* @__PURE__ */ new Set(["node.invoke.progress", "node.invoke.result"]);
const NODE_LIFECYCLE_DISPATCH_DRAIN_TIMEOUT_MS = 1e3;
/**
* Tracks admitted node progress/result requests so physical disconnect cleanup
* drains their existing work before retiring invokes. It does not add a queue.
*/
var GatewayNodeLifecycleDispatchTracker = class {
	constructor() {
		this.active = /* @__PURE__ */ new Set();
	}
	hasActive() {
		return this.active.size > 0;
	}
	dispatch(method, run) {
		const execution = run();
		if (!NODE_LIFECYCLE_METHODS.has(method)) return execution;
		const settled = execution.then(() => void 0, () => void 0);
		this.active.add(settled);
		settled.finally(() => {
			this.active.delete(settled);
		});
		return execution;
	}
	async drain(timeoutMs = NODE_LIFECYCLE_DISPATCH_DRAIN_TIMEOUT_MS) {
		const deadlineAt = Date.now() + Math.max(0, timeoutMs);
		while (this.active.size > 0) {
			const remainingMs = deadlineAt - Date.now();
			if (remainingMs <= 0) return false;
			let timeout;
			const timedOut = Symbol("node-lifecycle-dispatch-timeout");
			const result = await Promise.race([Promise.allSettled(this.active), new Promise((resolve) => {
				timeout = setTimeout(() => resolve(timedOut), remainingMs);
			})]);
			if (timeout) clearTimeout(timeout);
			if (result === timedOut) return false;
		}
		return true;
	}
};
//#endregion
//#region src/gateway/server/ws-connection/worker-admission-boundary.ts
/** Serialize public credential checks and charge only failed admission attempts. */
async function runWorkerAdmissionBoundary(params) {
	const run = async () => {
		const publicAdmission = params.publicAdmission;
		const rateCheck = publicAdmission?.rateLimiter?.check(publicAdmission.clientIp, AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION);
		if (rateCheck && !rateCheck.allowed) return {
			ok: false,
			reason: "rate-limited"
		};
		const admission = await params.service?.admitWorker(params.admission) ?? {
			ok: false,
			reason: "environment-unavailable"
		};
		if (!admission.ok) {
			publicAdmission?.rateLimiter?.recordFailure(publicAdmission.clientIp, AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION);
			return admission;
		}
		const ownershipFailure = params.service?.validateWorkerConnection(admission.identity);
		if (ownershipFailure) {
			publicAdmission?.rateLimiter?.recordFailure(publicAdmission.clientIp, AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION);
			return {
				ok: false,
				reason: ownershipFailure
			};
		}
		if (!params.claim(admission.identity)) return {
			ok: false,
			reason: "claim-rejected"
		};
		publicAdmission?.rateLimiter?.reset(publicAdmission.clientIp, AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION);
		return admission;
	};
	if (!params.publicAdmission?.rateLimiter) return await run();
	return await withSerializedRateLimitAttempt({
		ip: params.publicAdmission.clientIp,
		scope: AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION,
		run
	});
}
//#endregion
//#region src/gateway/server/ws-connection/worker-connection-frames.ts
function workerProtocolError(reason, options = {}) {
	return {
		code: options.code ?? ErrorCodes.INVALID_REQUEST,
		message: options.message ?? "worker protocol request rejected",
		details: { reason },
		...options.retryable === void 0 ? {} : { retryable: options.retryable },
		...options.retryAfterMs === void 0 ? {} : { retryAfterMs: options.retryAfterMs }
	};
}
function workerMaxPayload(identity) {
	return identity.protocolFeatures.includes("worker-inference-v1") ? WORKER_PROTOCOL_MAX_INFERENCE_PAYLOAD_BYTES : WORKER_PROTOCOL_MAX_PAYLOAD_BYTES;
}
function buildWorkerHello(identity) {
	return {
		type: "worker-hello-ok",
		environmentId: identity.environmentId,
		sessionId: identity.sessionId,
		ownerEpoch: identity.ownerEpoch,
		rpcSetVersion: identity.rpcSetVersion,
		protocolFeatures: [...identity.protocolFeatures],
		credentialExpiresAtMs: identity.credentialExpiresAtMs,
		policy: {
			heartbeatIntervalMs: WORKER_HEARTBEAT_INTERVAL_MS,
			maxPayload: workerMaxPayload(identity)
		}
	};
}
function workerTranscriptCommitError(reason) {
	return {
		code: ErrorCodes.INVALID_REQUEST,
		message: "worker transcript commit rejected",
		details: { reason }
	};
}
function workerLiveEventError(details) {
	return {
		code: ErrorCodes.INVALID_REQUEST,
		message: "worker live event rejected",
		details
	};
}
function workerInferenceError(reason) {
	return {
		code: reason === "provider-error" ? ErrorCodes.UNAVAILABLE : ErrorCodes.INVALID_REQUEST,
		message: "worker inference request rejected",
		details: { reason }
	};
}
//#endregion
//#region src/gateway/server/ws-connection/worker-connection-dispatch.ts
function rejectWorkerRequest(params) {
	params.warn(`worker protocol request rejected reason=${params.reason}`);
	params.respond(false, void 0, workerProtocolError(params.reason));
	queueMicrotask(() => params.close(1008, params.reason));
}
/** Closed worker dispatcher. It never calls the generic gateway method registry. */
async function dispatchWorkerRequest(params) {
	const service = params.service;
	if (!service) {
		rejectWorkerRequest({
			...params,
			reason: "environment-unavailable"
		});
		return;
	}
	const ownershipFailure = service.validateWorkerConnection(params.identity);
	if (ownershipFailure) {
		rejectWorkerRequest({
			...params,
			reason: ownershipFailure
		});
		return;
	}
	if (params.request.method === WORKER_INFERENCE_METHODS[0]) {
		if (!params.identity.protocolFeatures.includes("worker-inference-v1")) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		if (!validateWorkerInferenceStartParams(params.request.params)) {
			params.respond(false, void 0, workerInferenceError("invalid-context"));
			return;
		}
		if (!service.startInference) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		const outcome = service.startInference(params.identity, params.request.params, {
			connectionId: params.connectionId,
			send: (frame) => params.send(frame)
		});
		if (outcome.ok) {
			params.respond(true, outcome.result);
			outcome.launch();
			return;
		}
		if ("closeReason" in outcome) {
			rejectWorkerRequest({
				...params,
				reason: outcome.closeReason
			});
			return;
		}
		params.respond(false, void 0, workerInferenceError(outcome.reason));
		return;
	}
	if (params.request.method === WORKER_INFERENCE_METHODS[1]) {
		if (!params.identity.protocolFeatures.includes("worker-inference-v1")) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		if (!validateWorkerInferenceCancelParams(params.request.params)) {
			params.respond(false, void 0, workerInferenceError("invalid-context"));
			return;
		}
		if (!service.cancelInference) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		const outcome = service.cancelInference(params.identity, params.request.params);
		if (outcome.ok) {
			params.respond(true, outcome.result);
			return;
		}
		if ("closeReason" in outcome) {
			rejectWorkerRequest({
				...params,
				reason: outcome.closeReason
			});
			return;
		}
		params.respond(false, void 0, workerInferenceError(outcome.reason));
		return;
	}
	if (params.request.method === WORKER_PROTOCOL_METHODS[1]) {
		if (!params.identity.protocolFeatures.includes("worker-transcript-commit-v1")) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		if (!validateWorkerTranscriptCommitParams(params.request.params)) {
			params.respond(false, void 0, workerTranscriptCommitError("invalid-batch"));
			return;
		}
		const outcome = await service.commitTranscript(params.identity, params.request.params);
		if (outcome.ok) {
			params.respond(true, outcome.result);
			return;
		}
		if ("closeReason" in outcome) {
			rejectWorkerRequest({
				...params,
				reason: outcome.closeReason
			});
			return;
		}
		params.respond(false, void 0, workerTranscriptCommitError(outcome.reason));
		return;
	}
	if (params.request.method === WORKER_PROTOCOL_METHODS[2]) {
		if (!params.identity.protocolFeatures.includes("worker-live-event-v1")) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		if (!validateWorkerLiveEventParams(params.request.params)) {
			params.respond(false, void 0, workerLiveEventError({ reason: "invalid-event" }));
			return;
		}
		const outcome = await service.pushLiveEvent(params.identity, params.request.params);
		if (outcome.ok) {
			params.respond(true, outcome.result);
			return;
		}
		if ("closeReason" in outcome) {
			rejectWorkerRequest({
				...params,
				reason: outcome.closeReason
			});
			return;
		}
		params.respond(false, void 0, workerLiveEventError(outcome.details));
		return;
	}
	if (params.request.method === "worker.computer") {
		if (!params.identity.protocolFeatures.includes("worker-computer-v1") || !service.executeComputer) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		if (!validateWorkerComputerParams(params.request.params)) {
			rejectWorkerRequest({
				...params,
				reason: "invalid-frame"
			});
			return;
		}
		const outcome = await service.executeComputer(params.identity, params.request.params, params.signal);
		if (outcome.ok) params.respond(true, outcome.result);
		else if ("closeReason" in outcome) rejectWorkerRequest({
			...params,
			reason: outcome.closeReason
		});
		else params.respond(false, void 0, workerProtocolError(outcome.reason, { message: outcome.message }));
		return;
	}
	if (params.request.method === WORKER_PROTOCOL_METHODS[3] || params.request.method === WORKER_PROTOCOL_METHODS[4] || params.request.method === WORKER_PROTOCOL_METHODS[5] || params.request.method === WORKER_PROTOCOL_METHODS[6] || params.request.method === "worker.skill-workshop") {
		const isGitHubPublish = params.request.method === WORKER_PROTOCOL_METHODS[5];
		const isSkillWorkshop = params.request.method === "worker.skill-workshop";
		const isPortal = params.request.method === WORKER_PROTOCOL_METHODS[6];
		const requiredFeature = isSkillWorkshop ? WORKER_SKILL_WORKSHOP_FEATURE : isPortal ? WORKER_PORTAL_PROTOCOL_FEATURE : isGitHubPublish ? WORKER_GITHUB_PUBLICATION_PROTOCOL_FEATURE : WORKER_SESSION_TOOLS_PROTOCOL_FEATURE;
		if (!params.identity.protocolFeatures.includes(requiredFeature)) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		if (!service.executeSessionTool) {
			rejectWorkerRequest({
				...params,
				reason: "method-not-allowed"
			});
			return;
		}
		const isSpawn = params.request.method === WORKER_PROTOCOL_METHODS[3];
		if (!(isSkillWorkshop ? validateWorkerSkillWorkshopParams(params.request.params) : isPortal ? validateWorkerPortalParams(params.request.params) : isSpawn ? validateWorkerSessionsSpawnParams(params.request.params) : isGitHubPublish ? validateWorkerGitHubPublishParams(params.request.params) : validateWorkerSessionsSendParams(params.request.params))) {
			params.respond(false, void 0, workerProtocolError("invalid-frame"));
			return;
		}
		const outcome = await service.executeSessionTool(params.identity, isSkillWorkshop ? "skill_workshop" : isPortal ? "portal" : isSpawn ? "sessions_spawn" : isGitHubPublish ? "github_publish" : "sessions_send", params.request.params, params.signal);
		if (outcome.ok) {
			params.respond(true, outcome.result);
			return;
		}
		if ("closeReason" in outcome) {
			rejectWorkerRequest({
				...params,
				reason: outcome.closeReason
			});
			return;
		}
		params.respond(false, void 0, workerProtocolError(outcome.reason));
		return;
	}
	if (params.request.method !== WORKER_PROTOCOL_METHODS[0]) {
		rejectWorkerRequest({
			...params,
			reason: "method-not-allowed"
		});
		return;
	}
	if (!validateWorkerHeartbeatParams(params.request.params)) {
		rejectWorkerRequest({
			...params,
			reason: "invalid-heartbeat"
		});
		return;
	}
	const result = {
		receivedAtMs: Date.now(),
		status: "ok",
		ownerEpoch: params.identity.ownerEpoch
	};
	params.respond(true, result);
}
//#endregion
//#region src/gateway/server/ws-connection/worker-connection.ts
const MAX_QUEUED_WORKER_FRAMES = 16;
const MAX_QUEUED_WORKER_BYTES = 33554432;
function setSocketMaxPayload(socket, maxPayload) {
	const receiver = socket["_receiver"];
	if (receiver) receiver["_maxPayload"] = maxPayload;
}
/** Dedicated ingress handler: worker frames never enter the generic message handler. */
function attachWorkerWsMessageHandler(params) {
	let expiryTimer;
	let disposed = false;
	const sessionOperations = /* @__PURE__ */ new Set();
	const computerLifetime = new AbortController();
	const cleanup = () => {
		if (disposed) return;
		disposed = true;
		computerLifetime.abort(/* @__PURE__ */ new Error("Worker computer connection closed"));
		clearTimeout(expiryTimer);
		sessionOperations.clear();
		params.socket.off("message", onMessage);
	};
	const closeWorker = (code, reason) => {
		cleanup();
		params.close(code, reason);
	};
	const failHandshake = (code, reason) => {
		params.publicAdmission?.rateLimiter?.recordFailure(params.publicAdmission.clientIp, AUTH_RATE_LIMIT_SCOPE_WORKER_ADMISSION);
		params.setHandshakeState("failed");
		params.setCloseCause(reason);
		params.logWsControl.warn(`worker admission rejected reason=${reason}`);
		closeWorker(code, reason);
	};
	const failFrame = (code, reason) => {
		params.setCloseCause(reason);
		params.logGateway.warn(`worker protocol request rejected reason=${reason}`);
		closeWorker(code, reason);
	};
	const sendError = (id, reason, error = workerProtocolError(reason), code = 1008) => {
		params.send({
			type: "res",
			id,
			ok: false,
			error
		});
		queueMicrotask(() => closeWorker(code, reason));
	};
	const rejectAdmission = (rejection) => {
		const internalReason = rejection.internalReason ?? rejection.reason;
		const wireReason = rejection.opaqueOnPublicIngress || rejection.reason === "rate-limited" ? "invalid-handshake" : rejection.reason;
		const wireError = rejection.error ?? workerProtocolError(wireReason, { message: "worker admission rejected" });
		params.setHandshakeState("failed");
		params.setCloseCause(internalReason);
		params.logWsControl.warn(`worker admission rejected reason=${internalReason}`);
		sendError(rejection.id, wireReason, wireError, rejection.code ?? 1008);
	};
	const handleConnect = async (connect, id, admissionOpen) => {
		if (!admissionOpen || params.isStartupPending?.()) {
			rejectAdmission({
				id,
				reason: "gateway-unavailable",
				error: workerProtocolError("gateway-unavailable", {
					code: ErrorCodes.UNAVAILABLE,
					message: "worker gateway unavailable",
					retryable: true,
					retryAfterMs: 500
				}),
				code: 1013
			});
			return;
		}
		if (!params.publicAdmission) {
			rejectAdmission({
				id,
				reason: "invalid-handshake",
				internalReason: "public-ingress-context-missing"
			});
			return;
		}
		if (connect.minProtocol > 4 || connect.maxProtocol < 4) {
			rejectAdmission({
				id,
				reason: "protocol-mismatch"
			});
			return;
		}
		const admission = await runWorkerAdmissionBoundary({
			service: params.service,
			admission: connect.admission,
			publicAdmission: params.publicAdmission,
			claim: (identity) => {
				const client = {
					socket: params.socket,
					connect: {
						minProtocol: connect.minProtocol,
						maxProtocol: connect.maxProtocol,
						client: connect.client,
						role: "worker",
						scopes: []
					},
					connId: params.connId,
					connectionKind: "worker",
					worker: identity,
					usesSharedGatewayAuth: false
				};
				params.clearHandshakeTimer();
				params.advanceHandshakePhase("auth_validated");
				if (!params.setClient(client)) {
					params.setHandshakeState("failed");
					return false;
				}
				return true;
			}
		});
		if (!admission.ok) {
			if (admission.reason === "claim-rejected") return;
			rejectAdmission({
				id,
				reason: admission.reason,
				opaqueOnPublicIngress: true
			});
			return;
		}
		params.setHandshakeState("connected");
		params.advanceHandshakePhase("session_attached");
		setSocketMaxPayload(params.socket, workerMaxPayload(admission.identity));
		params.advanceHandshakePhase("hello_payload_prepared");
		params.send({
			type: "res",
			id,
			ok: true,
			payload: buildWorkerHello(admission.identity)
		});
		if (disposed || params.isClosed()) return;
		params.advanceHandshakePhase("ready");
		expiryTimer = setTimeout(() => {
			const failure = params.service?.validateWorkerConnection(admission.identity);
			if (failure) closeWorker(1008, failure);
			else if (!params.service) closeWorker(1008, "credential-expired");
		}, Math.max(0, admission.identity.credentialExpiresAtMs - Date.now()));
		expiryTimer.unref?.();
	};
	const handleMessage = async (data, admissionOpen) => {
		const client = params.getClient();
		if (client?.invalidated) {
			failFrame(1008, "credential-replaced");
			return;
		}
		if (client && !admissionOpen) {
			failFrame(1013, "gateway-unavailable");
			return;
		}
		const frameBytes = rawDataByteLength(data);
		if (frameBytes > (client?.worker ? workerMaxPayload(client.worker) : 65536)) {
			if (client) failFrame(1009, "invalid-frame");
			else failHandshake(1009, "invalid-handshake");
			return;
		}
		let parsed;
		try {
			parsed = JSON.parse(rawDataToString(data));
		} catch {
			if (client) failFrame(1008, "invalid-frame");
			else failHandshake(1008, "invalid-handshake");
			return;
		}
		if (!client) {
			if (!validateWorkerConnectRequestFrame(parsed)) {
				failHandshake(1008, "invalid-handshake");
				return;
			}
			params.setLastFrameMeta({
				type: "req",
				method: "connect"
			});
			await handleConnect(parsed.params, parsed.id, admissionOpen);
			return;
		}
		if (!validateRequestFrame(parsed) || parsed.id.length > 128 || parsed.method.length > 64) {
			params.logGateway.warn("worker protocol request rejected reason=invalid-frame");
			closeWorker(1008, "invalid-frame");
			return;
		}
		const mediaTranscript = parsed.method === "worker.transcript.commit" && validateWorkerTranscriptCommitParams(parsed.params) && isWorkerTranscriptFrameWithinBudget({
			...parsed,
			method: "worker.transcript.commit",
			params: parsed.params
		});
		if (frameBytes > 65536 && parsed.method !== WORKER_INFERENCE_METHODS[0] && !mediaTranscript) {
			failFrame(1009, "invalid-frame");
			return;
		}
		if (parsed.method === WORKER_PROTOCOL_METHODS[0] || parsed.method === WORKER_PROTOCOL_METHODS[1] || parsed.method === WORKER_PROTOCOL_METHODS[2] || parsed.method === WORKER_PROTOCOL_METHODS[3] || parsed.method === WORKER_PROTOCOL_METHODS[4] || parsed.method === WORKER_PROTOCOL_METHODS[5] || parsed.method === WORKER_PROTOCOL_METHODS[6] || parsed.method === "worker.computer" || parsed.method === WORKER_INFERENCE_METHODS[0] || parsed.method === WORKER_INFERENCE_METHODS[1]) params.setLastFrameMeta({
			type: "req",
			method: parsed.method
		});
		if (!client.worker) {
			closeWorker(1008, "environment-unavailable");
			return;
		}
		const respond = (ok, payload, error) => {
			if (disposed || params.isClosed() || params.getClient() !== client || client.invalidated) return;
			params.send(ok ? {
				type: "res",
				id: parsed.id,
				ok,
				payload
			} : {
				type: "res",
				id: parsed.id,
				ok,
				error
			});
		};
		const dispatch = (signal) => dispatchWorkerRequest({
			request: parsed,
			identity: client.worker,
			connectionId: params.connId,
			service: params.service,
			send: (frame) => params.send(frame),
			respond,
			close: closeWorker,
			warn: (message) => params.logGateway.warn(message),
			...signal ? { signal } : {}
		});
		if (parsed.method === WORKER_PROTOCOL_METHODS[3] || parsed.method === WORKER_PROTOCOL_METHODS[4] || parsed.method === WORKER_PROTOCOL_METHODS[5] || parsed.method === WORKER_PROTOCOL_METHODS[6] || parsed.method === "worker.computer") {
			if (sessionOperations.has(parsed.id)) {
				failFrame(1008, "invalid-frame");
				return;
			}
			if (sessionOperations.size >= 4) {
				respond(false, void 0, workerProtocolError("gateway-unavailable"));
				return;
			}
			sessionOperations.add(parsed.id);
			runWithGatewayIndependentRootWorkContinuation(() => dispatch(parsed.method === "worker.computer" ? computerLifetime.signal : void 0), "worker:dispatch").catch(() => {
				respond(false, void 0, workerProtocolError("gateway-unavailable"));
			}).finally(() => {
				sessionOperations.delete(parsed.id);
			});
			return;
		}
		await dispatch();
	};
	let queue = Promise.resolve();
	let pendingFrames = 0;
	let pendingBytes = 0;
	function onMessage(data) {
		if (disposed) return;
		const frameBytes = rawDataByteLength(data);
		if (pendingFrames >= MAX_QUEUED_WORKER_FRAMES || pendingBytes + frameBytes > MAX_QUEUED_WORKER_BYTES) {
			if (params.getClient()) failFrame(1008, "invalid-frame");
			else failHandshake(1008, "invalid-handshake");
			return;
		}
		pendingFrames += 1;
		pendingBytes += frameBytes;
		queue = queue.then(async () => {
			if (disposed || params.isClosed()) return;
			const admission = tryBeginGatewayRootWorkAdmission("ws:worker-frame");
			if (!admission) {
				const client = params.getClient();
				const identity = client?.worker;
				if (client && getGatewaySuspendAdmissionPhase() === "draining" && !isGatewayRestartDraining() && identity?.turnClaim && !client.invalidated && params.service?.validateWorkerConnection(identity) === null) {
					const continuation = runWorkerTurnAdmissionContinuation(identity, () => handleMessage(data, true));
					if (continuation) {
						await continuation;
						return;
					}
				}
				await handleMessage(data, false);
				return;
			}
			try {
				await admission.run(() => handleMessage(data, true));
			} finally {
				admission.release();
			}
		}).catch(() => {
			if (disposed) return;
			if (params.getClient()) failFrame(1011, "gateway-unavailable");
			else failHandshake(1011, "gateway-unavailable");
		}).finally(() => {
			pendingFrames -= 1;
			pendingBytes -= frameBytes;
		});
	}
	params.socket.on("message", onMessage);
	return cleanup;
}
//#endregion
//#region src/gateway/server/ws-connection.ts
const unauthorizedCloseBeforeConnectLogLimiter = new HandshakeAuthLogLimiter();
function attachGatewayWsMessageHandlerOnDemand(params) {
	const queued = [];
	const queueMessage = (data) => {
		if (queued.length >= 16) {
			params.setCloseCause("message-handler-loading-overflow", { queuedFrames: queued.length });
			params.close(1008, "gateway message handler loading");
			return;
		}
		queued.push(data);
	};
	params.socket.on("message", queueMessage);
	import("./message-handler-D549zpG2.js").then(({ attachGatewayWsMessageHandler }) => {
		params.socket.off("message", queueMessage);
		if (params.isClosed()) return;
		attachGatewayWsMessageHandler(params);
		for (const data of queued) params.socket.emit("message", data);
	}).catch((error) => {
		params.socket.off("message", queueMessage);
		const formattedError = formatErrorMessage(error);
		const staleInstall = classifyGatewayStaleInstall(error);
		if (staleInstall) {
			params.setCloseCause("message-handler-load-failed", {
				error: formattedError,
				staleInstall: true,
				restartCommand: staleInstall.restartCommand
			});
			params.logWsControl.error(`failed to load ws message handler because the OpenClaw installation changed while the Gateway was running conn=${params.connId}; run: ${staleInstall.restartCommand}; error: ${formattedError}`);
			params.close(1011, GATEWAY_STALE_INSTALL_CLOSE_REASON);
			return;
		}
		params.setCloseCause("message-handler-load-failed", { error: formattedError });
		params.logWsControl.error(`failed to load ws message handler conn=${params.connId}: ${formattedError}`);
		params.close(1011, "gateway message handler unavailable");
	});
}
function attachGatewayWsConnectionHandler(params) {
	const { wss, clients, preauthConnectionBudget, port, pluginSurfaceScheme, getPluginNodeCapabilities, getResolvedAuth, getRequiredSharedGatewaySessionGeneration = () => resolveSharedGatewaySessionGeneration(getResolvedAuth(), getRuntimeConfig().gateway?.trustedProxies), rateLimiter, browserRateLimiter, nodeReapprovalCoordinator, isStartupPending, isPendingWorkerNodeSetup, gatewayMethods, events, refreshHealthSnapshot, logGateway, logHealth, logWsControl, extraHandlers, getMethodRegistry, broadcast, buildRequestContext, workerConnectionService } = params;
	const originCheckMetrics = { hostHeaderFallbackAccepted: 0 };
	wss.on("connection", (socket, upgradeReq) => {
		let client = null, closed = false;
		const [openedAt, connId] = [Date.now(), randomUUID()];
		const ingressSocket = socket;
		const connectionKind = ingressSocket["__openclawConnectionKind"] ?? "gateway";
		const publicWorkerIngress = connectionKind === "worker" ? takePublicWorkerIngress(socket) : void 0;
		const connectionPreauthBudget = ingressSocket["__openclawPreauthBudget"] ?? preauthConnectionBudget;
		const { remoteAddr, remotePort, localAddr, localPort, endpoint } = resolveSocketAddress(socket);
		const preauthBudgetKey = socket["__openclawPreauthBudgetKey"];
		socket["__openclawPreauthBudgetClaimed"] = true;
		const headerValue = (value) => Array.isArray(value) ? value[0] : value;
		const requestHost = headerValue(upgradeReq.headers.host);
		const requestOrigin = headerValue(upgradeReq.headers.origin);
		const requestUserAgent = headerValue(upgradeReq.headers["user-agent"]);
		const forwardedFor = headerValue(upgradeReq.headers["x-forwarded-for"]);
		const realIp = headerValue(upgradeReq.headers["x-real-ip"]);
		const openedDuringStartup = isStartupPending?.() === true;
		const pluginNodeCapabilities = connectionKind === "gateway" ? getPluginNodeCapabilities?.() ?? [] : [];
		const pluginSurfaceBaseUrl = pluginNodeCapabilities.length > 0 ? resolveHostedPluginSurfaceUrl({
			port,
			forwardedHost: upgradeReq.headers["x-forwarded-host"],
			requestHost: upgradeReq.headers.host,
			forwardedProto: upgradeReq.headers["x-forwarded-proto"],
			localAddress: upgradeReq.socket?.localAddress,
			scheme: pluginSurfaceScheme
		}) : void 0;
		logWs("in", "open", {
			connId,
			remoteAddr,
			remotePort,
			localAddr,
			localPort,
			endpoint
		});
		let handshakeState = "pending";
		let lastHandshakePhase = "tcp_accepted";
		let holdsPreauthBudget = true;
		let closeCause;
		let closeMeta = {};
		let lastFrameType;
		let lastFrameMethod;
		let lastFrameId;
		let hasReceivedPreauthFrame = false;
		const nodeLifecycleDispatch = new GatewayNodeLifecycleDispatchTracker();
		socket.once("message", () => {
			hasReceivedPreauthFrame = true;
		});
		const advanceHandshakePhase = (next) => {
			if (WS_HANDSHAKE_PHASES.indexOf(next) > WS_HANDSHAKE_PHASES.indexOf(lastHandshakePhase)) lastHandshakePhase = next;
		};
		const setCloseCause = (cause, meta) => {
			if (!closeCause) closeCause = cause;
			if (meta && Object.keys(meta).length > 0) closeMeta = {
				...closeMeta,
				...meta
			};
		};
		const releasePreauthBudget = () => {
			if (!holdsPreauthBudget) return;
			holdsPreauthBudget = false;
			connectionPreauthBudget.release(preauthBudgetKey);
		};
		const setLastFrameMeta = (meta) => {
			if (meta.type || meta.method || meta.id) {
				lastFrameType = meta.type ?? lastFrameType;
				lastFrameMethod = meta.method ?? lastFrameMethod;
				lastFrameId = meta.id ?? lastFrameId;
			}
		};
		let stopKeepalive;
		let cleanupWorkerConnection;
		let retainClientUntilNodeDrain = false;
		const handshakeTimeoutMs = resolvePreauthHandshakeTimeoutMs({ configuredTimeoutMs: params.preauthHandshakeTimeoutMs });
		const handshakeTimer = setTimeout(() => {
			if (!client) {
				handshakeState = "failed";
				setCloseCause("handshake-timeout", {
					handshakeMs: Date.now() - openedAt,
					endpoint,
					phase: lastHandshakePhase
				});
				logWsControl.warn(`handshake timeout conn=${connId} peer=${endpoint ?? "n/a"} remote=${remoteAddr ?? "?"} phase=${lastHandshakePhase}`);
				if (connectionKind === "worker") close(1008, "invalid-handshake");
				else close();
			}
		}, handshakeTimeoutMs);
		const retireTransport = (code = 1e3, reason) => {
			if (closed) return;
			closed = true;
			clearTimeout(handshakeTimer);
			stopKeepalive?.();
			cleanupWorkerConnection?.();
			releasePreauthBudget();
			try {
				socket.close(code, reason);
			} catch {}
		};
		const close = (code = 1e3, reason) => {
			retainClientUntilNodeDrain ||= !closed && client?.connect.role === "node" && nodeLifecycleDispatch.hasActive();
			retireTransport(code, reason);
			if (client && !retainClientUntilNodeDrain) clients.delete(client);
		};
		const send = (obj) => {
			if (closed) return { kind: "unavailable" };
			if (socket.readyState !== 1) {
				close();
				return { kind: "unavailable" };
			}
			if (socket.bufferedAmount > 52428800) {
				logRejectedLargePayload({
					surface: "gateway.ws.outbound_buffer",
					bytes: socket.bufferedAmount,
					limitBytes: MAX_BUFFERED_BYTES,
					reason: "ws_send_buffer_close"
				});
				setCloseCause("outbound-buffer-exceeded", {
					bytes: socket.bufferedAmount,
					limitBytes: MAX_BUFFERED_BYTES
				});
				close(1008, connectionKind === "worker" ? "slow-consumer" : "slow consumer");
				socket.terminate();
				return { kind: "unavailable" };
			}
			let encoded;
			try {
				encoded = JSON.stringify(obj);
			} catch (error) {
				return {
					kind: "serialization",
					error
				};
			}
			try {
				socket.send(encoded);
				return { kind: "sent" };
			} catch {
				socket.terminate();
				close();
				return { kind: "unavailable" };
			}
		};
		const connectNonce = randomUUID();
		if (connectionKind === "gateway") send({
			type: "event",
			event: "connect.challenge",
			payload: {
				nonce: connectNonce,
				ts: Date.now()
			}
		});
		advanceHandshakePhase("ws_upgrade_started");
		socket.once("error", (err) => {
			if (isWsPayloadLimitError(err)) logRejectedLargePayload({
				surface: client ? "gateway.ws.frame" : "gateway.ws.preauth",
				limitBytes: connectionKind === "worker" ? WORKER_PROTOCOL_MAX_PAYLOAD_BYTES : client ? MAX_PAYLOAD_BYTES : MAX_PREAUTH_PAYLOAD_BYTES,
				reason: client ? "ws_frame_limit" : "preauth_frame_limit"
			});
			logWsControl.warn(`error conn=${connId} remote=${remoteAddr ?? "?"}: ${formatErrorMessage(err)}`);
			if (connectionKind === "worker") close(1008, client ? "invalid-frame" : "invalid-handshake");
			else close();
		});
		socket.on("pong", () => {
			if (client?.presenceKey) touchPresence(client.presenceKey);
		});
		const isNoisySwiftPmHelperClose = (userAgent, remote) => normalizeLowercaseStringOrEmpty(userAgent).includes("swiftpm-testing-helper") && isLoopbackAddress(remote);
		const isExpectedLocalAppStartupAbort = (code) => openedDuringStartup && (code === 1001 || code === 1006) && lastHandshakePhase === "ws_upgrade_started" && !hasReceivedPreauthFrame && lastFrameType === void 0 && normalizeLowercaseStringOrEmpty(requestUserAgent).startsWith("openclaw/") && isLoopbackAddress(remoteAddr);
		const handleSocketClose = async (code, reason) => {
			const durationMs = Date.now() - openedAt;
			const logForwardedFor = sanitizeWsLogValue(forwardedFor);
			const logOrigin = sanitizeWsLogValue(requestOrigin);
			const logHost = sanitizeWsLogValue(requestHost);
			const logUserAgent = sanitizeWsLogValue(requestUserAgent);
			const logReason = sanitizeWsLogValue(reason?.toString());
			const handshakeIncomplete = lastHandshakePhase !== "ready";
			const closeContext = {
				cause: closeCause,
				handshake: handshakeState,
				...handshakeIncomplete ? { phase: lastHandshakePhase } : {},
				durationMs,
				lastFrameType,
				lastFrameMethod,
				lastFrameId,
				host: logHost,
				origin: logOrigin,
				userAgent: logUserAgent,
				forwardedFor: logForwardedFor,
				remoteAddr,
				remotePort,
				localAddr,
				localPort,
				endpoint,
				...closeMeta
			};
			if (!client) {
				const logFn = isNoisySwiftPmHelperClose(requestUserAgent, remoteAddr) || closeCause === "startup-sidecars-pending" || isExpectedLocalAppStartupAbort(code) ? logWsControl.debug : logWsControl.warn;
				const authReason = stringMetaValue(closeMeta, "authReason");
				const closeLogDecision = closeCause === "unauthorized" && shouldLimitMissingCredentialAuthLog({
					reason: authReason,
					authProvided: "none"
				}) ? unauthorizedCloseBeforeConnectLogLimiter.register(buildHandshakeAuthLogKey({
					reason: authReason,
					remoteAddr,
					client: stringMetaValue(closeMeta, "clientDisplayName") ?? stringMetaValue(closeMeta, "client"),
					mode: stringMetaValue(closeMeta, "mode"),
					authProvided: "none"
				})) : {
					shouldLog: true,
					suppressedSinceLastLog: 0
				};
				if (closeLogDecision.shouldLog) {
					const suppressedText = closeLogDecision.suppressedSinceLastLog > 0 ? ` suppressed=${closeLogDecision.suppressedSinceLastLog}` : "";
					logFn(`closed before connect conn=${connId} peer=${endpoint ?? "n/a"} remote=${remoteAddr ?? "?"} fwd=${logForwardedFor || "n/a"} origin=${logOrigin || "n/a"} host=${logHost || "n/a"} ua=${logUserAgent || "n/a"} code=${code ?? "n/a"} reason=${logReason || "n/a"} phase=${lastHandshakePhase}${suppressedText}`, closeContext);
				}
			}
			if (client && isWebchatClient(client.connect.client)) logWsControl.info(`webchat disconnected code=${code} reason=${logReason || "n/a"} conn=${connId}`);
			if (client?.authenticatedUserId) logWsControl.info(`authenticated user disconnected code=${code} reason=${logReason || "n/a"} conn=${connId} user=${formatForLog(client.authenticatedUserId)}`);
			if (connectionKind === "gateway") {
				const context = buildRequestContext();
				cleanupTalkConnection(connId, logGateway);
				context.unsubscribeAllSessionEvents(connId);
				context.terminalSessions?.handleDisconnect(connId);
				let currentDisconnectedNodeId = null;
				let disconnectedNodeHistory;
				if (client?.connect?.role === "node") {
					const nodeId = client.connect.device?.id ?? client.connect.client.id;
					const nodeSession = context.nodeRegistry.get(nodeId);
					if (nodeSession?.connId === connId && nodeSession.pairingGeneration) disconnectedNodeHistory = {
						nodeId: nodeSession.nodeId,
						connectedAtMs: nodeSession.connectedAtMs,
						disconnectedAtMs: Date.now(),
						expectedPairingGeneration: {
							nodeId: nodeSession.nodeId,
							key: nodeSession.pairingGeneration
						}
					};
					retainClientUntilNodeDrain = true;
					retireTransport();
					try {
						if (nodeLifecycleDispatch.hasActive()) {
							if (!await nodeLifecycleDispatch.drain()) logGateway.warn(`node lifecycle dispatch drain timed out after ${NODE_LIFECYCLE_DISPATCH_DRAIN_TIMEOUT_MS}ms conn=${connId}`);
						}
						currentDisconnectedNodeId = context.nodeRegistry.unregister(connId);
					} finally {
						retainClientUntilNodeDrain = false;
					}
				}
				if (client?.presenceKey && (client.connect.role !== "node" || currentDisconnectedNodeId !== null)) {
					upsertPresence(client.presenceKey, {
						reason: "disconnect",
						watchedSessions: void 0
					});
					broadcastPresenceSnapshot({
						broadcast,
						incrementPresenceVersion,
						getHealthVersion
					});
				}
				if (currentDisconnectedNodeId) {
					removeRemoteNodeInfo(currentDisconnectedNodeId);
					context.nodeUnsubscribeAll(currentDisconnectedNodeId);
					clearNodeWakeState(currentDisconnectedNodeId);
				}
				if (disconnectedNodeHistory && currentDisconnectedNodeId === disconnectedNodeHistory.nodeId) try {
					await recordPairedNodeDisconnection(disconnectedNodeHistory);
				} catch (error) {
					logGateway.warn(`failed to record node disconnect for ${disconnectedNodeHistory.nodeId}: ${formatForLog(error)}`);
				}
			}
			logWs("out", "close", {
				connId,
				code,
				reason: logReason,
				durationMs,
				cause: closeCause,
				handshake: handshakeState,
				...handshakeIncomplete ? { phase: lastHandshakePhase } : {},
				lastFrameType,
				lastFrameMethod,
				lastFrameId,
				endpoint
			});
			close();
		};
		socket.once("close", (code, reason) => {
			handleSocketClose(code, reason).catch((error) => {
				logGateway.error(`websocket close cleanup failed conn=${connId}: ${formatErrorMessage(error)}`);
				close();
			});
		});
		const setClient = (next) => {
			if (closed || client) return false;
			if (next.worker) {
				for (const existing of clients) if (existing.worker?.environmentId === next.worker.environmentId) {
					existing.invalidated = true;
					clients.delete(existing);
					try {
						existing.socket.terminate();
					} catch {
						existing.socket.close(1008, "credential-replaced");
					}
				}
			}
			releasePreauthBudget();
			client = next;
			clients.add(next);
			if (next.presenceKey && next.authenticatedUserId && next.connect.role !== "node") {
				next.personPresence = { onlineSince: Date.now() };
				refreshClientPresence(clients, next);
			}
			stopKeepalive = startWebSocketKeepalive(socket, () => {
				setCloseCause("heartbeat-timeout");
				try {
					socket.terminate();
				} catch {
					close();
				}
			}, upgradeReq.socket);
			return true;
		};
		if (connectionKind === "worker") {
			cleanupWorkerConnection = attachWorkerWsMessageHandler({
				socket,
				connId,
				service: workerConnectionService,
				isStartupPending,
				send,
				close,
				isClosed: () => closed,
				clearHandshakeTimer: () => clearTimeout(handshakeTimer),
				getClient: () => client,
				setClient,
				setHandshakeState: (next) => {
					handshakeState = next;
				},
				advanceHandshakePhase,
				setCloseCause,
				setLastFrameMeta,
				logGateway,
				logWsControl,
				publicAdmission: publicWorkerIngress
			});
			return;
		}
		const ingressAttribution = readPreparedGatewayIngressAttribution(upgradeReq);
		if (!ingressAttribution || ingressAttribution.kind === "unattributable-proxy") {
			setCloseCause("missing-ingress-attribution");
			logWsControl.warn(`gateway websocket missing prepared ingress attribution conn=${connId}`);
			close(1008, "gateway ingress attribution required");
			return;
		}
		attachGatewayWsMessageHandlerOnDemand({
			socket,
			upgradeReq,
			ingressAttribution,
			connId,
			bootId: params.bootId,
			remoteAddr,
			remotePort,
			localAddr,
			localPort,
			endpoint,
			forwardedFor,
			realIp,
			requestHost,
			requestOrigin,
			requestUserAgent,
			pluginSurfaceBaseUrl,
			pluginNodeCapabilities,
			connectNonce,
			getResolvedAuth,
			getRequiredSharedGatewaySessionGeneration,
			rateLimiter,
			browserRateLimiter,
			nodeReapprovalCoordinator,
			isStartupPending,
			isPendingWorkerNodeSetup,
			gatewayMethods,
			events,
			extraHandlers,
			getMethodRegistry,
			buildRequestContext,
			nodeLifecycleDispatch,
			refreshHealthSnapshot,
			send,
			close,
			isClosed: () => closed,
			clearHandshakeTimer: () => clearTimeout(handshakeTimer),
			getClient: () => client,
			setClient,
			setHandshakeState: (next) => {
				handshakeState = next;
			},
			advanceHandshakePhase,
			setCloseCause,
			setLastFrameMeta,
			originCheckMetrics,
			logGateway,
			logHealth,
			logWsControl
		});
	});
}
//#endregion
//#region src/gateway/server-ws-runtime.ts
/** Attaches websocket handlers for an already-created gateway request context. */
function attachGatewayWsHandlers(params) {
	attachGatewayWsConnectionHandler({
		wss: params.wss,
		clients: params.clients,
		bootId: params.bootId,
		preauthConnectionBudget: params.preauthConnectionBudget,
		port: params.port,
		gatewayHost: params.gatewayHost,
		pluginSurfaceScheme: params.pluginSurfaceScheme,
		getPluginNodeCapabilities: params.getPluginNodeCapabilities,
		getResolvedAuth: params.getResolvedAuth,
		getRequiredSharedGatewaySessionGeneration: params.getRequiredSharedGatewaySessionGeneration,
		rateLimiter: params.rateLimiter,
		browserRateLimiter: params.browserRateLimiter,
		nodeReapprovalCoordinator: params.nodeReapprovalCoordinator,
		preauthHandshakeTimeoutMs: params.preauthHandshakeTimeoutMs,
		isStartupPending: params.isStartupPending,
		isPendingWorkerNodeSetup: params.isPendingWorkerNodeSetup,
		gatewayMethods: params.gatewayMethods,
		events: params.events,
		refreshHealthSnapshot: params.context.refreshHealthSnapshot,
		logGateway: params.logGateway,
		logHealth: params.logHealth,
		logWsControl: params.logWsControl,
		extraHandlers: params.extraHandlers,
		getMethodRegistry: params.getMethodRegistry,
		...params.workerConnectionService ? { workerConnectionService: params.workerConnectionService } : {},
		broadcast: params.broadcast,
		buildRequestContext: () => params.context
	});
}
//#endregion
export { attachGatewayWsHandlers };
