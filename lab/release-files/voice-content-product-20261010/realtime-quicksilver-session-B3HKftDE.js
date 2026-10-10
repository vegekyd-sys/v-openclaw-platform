const MAKARON_MEDIA_INSTRUCTIONS="媒体生成任务通过 exec 调用已安装的 makaron CLI，复用执行环境已有凭据，不读取或输出 key。优先 makaron chat --project auto -b --json；续做同一作品使用已返回的 projectId。保存返回的 runId/id，仅用 makaron responses get 同一ID --wait --json 跟进，等待命令用原生 process 轮询，不用 nohup 或脱离管理的后台进程。只依据 completed 的 image/video 输出交付，不把计划、提交成功或 design JSON 当成最终图片/MP4；未知状态先查询原任务，不重复付费提交。用户指定 Makaron 时不要改用 image_generate/video_generate。最终保留图片、视频及用户需要的说明文字，不展示命令、私有路径、凭据或内部验收信息。";
// voice-backend-document-broker-v2
const BACKEND_RESULT_INSTRUCTIONS="电话结果呈现：如果最终结果是较长方案，最后一次回答同时写语音摘要和完整正文，不另起任务。严格使用这两个标题：\n【语音摘要】\n两到三句自然中文，100字以内，直接说最重要的结论、推荐或下一步，保留影响结论的必要条件和未完成项。不能只说完成了或让用户看屏幕，不能编造原结果没有的事实。\n【完整方案】\n完整Markdown正文，保留全部事实、来源、条件和细节。不要把摘要当成正文的替代。普通短答案直接回答，不需要这两个标题。";
function backendResultQuestion(question) {
  return `${question}\n\n${MAKARON_MEDIA_INSTRUCTIONS}\n\n${BACKEND_RESULT_INSTRUCTIONS}`;
}
// gpt-live-call-lifecycle-broker-v1
import { c as readRequestBodyWithLimit } from "./http-body-C8wtGPZr.js";
import { m as resolveOpenAICodexAuthIdentity, s as resolveProviderAuthProfileApiKey } from "./provider-auth-BSTUvZrs.js";
import "./webhook-request-guards-NpM_LUK2.js";
import { i as isOpenAIGptLiveModel, o as resolveOpenAIQuicksilverVoice } from "./realtime-quicksilver-BthHSTFW.js";
import { c as createOpenAIQuicksilverCall, l as hangupOpenAIRealtimeCall, r as buildOpenAIQuicksilverSession } from "./realtime-quicksilver-wire-C2tdaxFV.js";
import { t as OpenAIQuicksilverDelegationController } from "./realtime-quicksilver-delegation-controller-B0yPpiHp.js";
import { a as respondRealtimeOffer, i as rejectOversizedOffer, n as createResponseDeliveryWaiter, r as readOfferBearerToken, t as applyRealtimeOfferCorsHeaders } from "./realtime-quicksilver-offer-http-ByRCBmAS.js";
import { n as reserveOpenAIQuicksilverSession, t as releaseOpenAIQuicksilverSession } from "./realtime-quicksilver-session-limit-C_rvr0yn.js";
import { t as connectOpenAIQuicksilverSideband } from "./realtime-quicksilver-sideband-CIA1t5yo.js";
import { t as assertOpenAIRealtimeAudioOnlyOffer } from "./realtime-sdp-offer-DNU1ghm4.js";
import { randomBytes, randomUUID } from "node:crypto";
import WebSocket$1 from "ws";
//#region extensions/openai/realtime-quicksilver-session.ts
const OPENAI_QUICKSILVER_OFFER_PATH = "/plugins/openai/realtime/calls";
const OPENAI_QUICKSILVER_CAPABILITIES = {
	transports: ["webrtc", "gateway-relay"],
	handlesAgentConsult: true,
	supportsToolCalls: false,
	supportsVideoFrames: false
};
const OPENAI_QUICKSILVER_PENDING_TTL_MS = 6e4;
const OPENAI_QUICKSILVER_SESSION_TTL_MS = 18e5;
const OPENAI_REALTIME_MAX_SESSIONS_PER_OWNER = 2;
const OPENAI_QUICKSILVER_MAX_SDP_BYTES = 262144;
const OPENAI_QUICKSILVER_UPSTREAM_TIMEOUT_MS = 3e4;
const WEBSOCKET_OPEN = 1;
async function resolveOpenAIChatGptSubscriptionAuth(params) {
	const token = await resolveProviderAuthProfileApiKey({
		provider: "openai",
		cfg: params.cfg,
		agentDir: params.agentDir,
		profileTypes: ["oauth"],
		includeExternalCliAuth: false
	});
	if (!token) return;
	const accountId = resolveOpenAICodexAuthIdentity({ access: token }).accountId;
	if (!accountId) throw new Error("The selected ChatGPT OAuth profile is missing its account id");
	return {
		type: "oauth",
		token,
		accountId
	};
}
function createOpenAIQuicksilverBrowserSessionBroker(params) {
	const pendingOffers = /* @__PURE__ */ new Map();
	const inFlightOffers = /* @__PURE__ */ new Map();
	const activeSessions = /* @__PURE__ */ new Map();
	const reservations = /* @__PURE__ */ new Set();
	const reservationOwners = /* @__PURE__ */ new Map();
	const inFlightHandlers = /* @__PURE__ */ new Set();
	const shutdownController = new AbortController();
	const createSocket = params.webSocketFactory ?? ((url, options) => new WebSocket$1(url, options));
	let cleanedUp = false;
	const releaseReservation = (token) => {
		reservations.delete(token);
		reservationOwners.delete(token);
		releaseOpenAIQuicksilverSession(token);
	};
	const expirePendingOffer = (token, offer) => {
		if (pendingOffers.get(token) !== offer) return;
		pendingOffers.delete(token);
		clearTimeout(offer.timer);
		releaseReservation(token);
		offer.request.gatewayControl?.onClose?.("completed");
	};
	const activeSessionLease = {
		adopt: (token, wire) => {
			const session = {
				token,
				...wire
			};
			activeSessions.set(token, session);
			reserveOpenAIQuicksilverSession(token);
			return session;
		},
		close: async (session, disposition = "abort", error) => {
			if (session.closing) return session.closing;
			if (activeSessions.get(session.token) !== session) return;
			activeSessions.delete(session.token);
			releaseReservation(session.token);
			clearTimeout(session.timer);
			session.closing = Promise.resolve();
			if (disposition === "detach") session.detach?.();
			session.closing = Promise.resolve(session.dispose(error));
			return session.closing;
		},
		expireIn: (session, ttlMs) => {
			clearTimeout(session.timer);
			session.timer = setTimeout(() => void activeSessionLease.close(session), Math.max(0, ttlMs));
			session.timer.unref?.();
		},
		deliverAnswer: async (session, signal, deliver) => {
			if (!await deliver() || signal.aborted) await activeSessionLease.close(session);
		}
	};
	const attachSidebandHandlers = (session) => {
		if (!session.socket) return;
		const socket = session.socket;
		socket.on("message", (data, isBinary) => {
			session.handleFrame?.(data, isBinary);
		});
		socket.on("error", (error) => {
			params.logger.warn(`OpenAI GPT-Live sideband socket failed: ${error.message}`);
			activeSessionLease.close(session, "abort", error);
		});
		socket.on("close", (code) => {
			const error = code === 1e3 ? void 0 : /* @__PURE__ */ new Error(`OpenAI GPT-Live sideband closed unexpectedly (code ${code ?? 1006})`);
			activeSessionLease.close(session, "abort", error);
		});
	};
	const prunePendingOffers = () => {
		const now = Date.now();
		for (const [token, offer] of pendingOffers) if (offer.expiresAt <= now) expirePendingOffer(token, offer);
	};
	const broker = {
		capabilities: OPENAI_QUICKSILVER_CAPABILITIES,
		createBrowserSession: async (request, auth) => {
			if (cleanedUp || shutdownController.signal.aborted) throw new Error("OpenAI GPT-Live sessions are stopping; restart Gateway and try again");
			const model = request.model?.trim();
			if (!model) throw new Error("OpenAI realtime browser sessions require a model");
			const isGptLive = isOpenAIGptLiveModel(model);
			if (isGptLive && !request.runAgentConsult) throw new Error("OpenAI GPT-Live requires the Gateway agent-consult runtime");
			if (!isGptLive) {
				if (!request.gaSession) throw new Error("OpenAI GA realtime browser sessions require an initial session policy");
				if (request.gaSession.model !== model) throw new Error("OpenAI GA realtime session policy model must match the requested model");
			}
			prunePendingOffers();
			if (request.gaSideband && request.ownerConnId && Array.from(reservationOwners.values()).filter((owner) => owner === request.ownerConnId).length >= OPENAI_REALTIME_MAX_SESSIONS_PER_OWNER) throw new Error("Too many concurrent OpenAI realtime sessions for this client");
			const voice = isGptLive ? resolveOpenAIQuicksilverVoice(request.voice) : request.voice;
			const token = randomBytes(32).toString("base64url");
			const expiresAt = Date.now() + OPENAI_QUICKSILVER_PENDING_TTL_MS;
			reserveOpenAIQuicksilverSession(token, { expiresAtMs: expiresAt });
			const offer = {
				auth,
				expiresAt,
				requestIds: {
					realtimeSessionId: randomUUID(),
					sessionId: randomUUID(),
					threadId: randomUUID()
				},
				request: {
					...request,
					model,
					voice
				},
				timer: setTimeout(() => expirePendingOffer(token, offer), OPENAI_QUICKSILVER_PENDING_TTL_MS)
			};
			offer.timer.unref?.();
			pendingOffers.set(token, offer);
			reservations.add(token);
			if (request.gaSideband && request.ownerConnId) reservationOwners.set(token, request.ownerConnId);
			return {
				provider: "openai",
				transport: "webrtc",
				clientSecret: token,
				offerUrl: OPENAI_QUICKSILVER_OFFER_PATH,
				offerResponseMaxBytes: 262144,
				...request.gaSideband ? {} : {
					model,
					voice
				},
				expiresAt
			};
		},
		cancelBrowserSession: async (session) => {
			if (session.transport !== "webrtc") return;
			const pending = pendingOffers.get(session.clientSecret);
			if (pending) {
				pendingOffers.delete(session.clientSecret);
				clearTimeout(pending.timer);
			}
			inFlightOffers.get(session.clientSecret)?.abort(/* @__PURE__ */ new Error("OpenAI realtime session canceled"));
			const active = activeSessions.get(session.clientSecret);
			if (active) await activeSessionLease.close(active, "detach");
			else releaseReservation(session.clientSecret);
		}
	};
	const handleOffer = async (req, res) => {
		if (!applyRealtimeOfferCorsHeaders(req, res, params.getConfig())) {
			respondRealtimeOffer(res, 403, "Origin not allowed");
			return true;
		}
		if (req.method === "OPTIONS") {
			res.statusCode = 204;
			res.setHeader("cache-control", "no-store");
			res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
			res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
			if (req.headers["access-control-request-private-network"] === "true") res.setHeader("Access-Control-Allow-Private-Network", "true");
			res.setHeader("Access-Control-Max-Age", "600");
			res.end();
			return true;
		}
		if (req.method !== "POST") {
			respondRealtimeOffer(res, 405, "Method not allowed");
			return true;
		}
		if (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/sdp") {
			respondRealtimeOffer(res, 415, "Expected application/sdp");
			return true;
		}
		prunePendingOffers();
		const token = readOfferBearerToken(req);
		const offer = token ? pendingOffers.get(token) : void 0;
		if (!token || !offer || offer.expiresAt <= Date.now()) {
			respondRealtimeOffer(res, 401, "Invalid or expired realtime session token");
			return true;
		}
		pendingOffers.delete(token);
		clearTimeout(offer.timer);
		const requestController = new AbortController();
		let browserDisconnected = false;
		inFlightOffers.set(token, requestController);
		const abortFromBrowser = () => {
			browserDisconnected = true;
			requestController.abort(/* @__PURE__ */ new Error("Browser GPT-Live offer request closed"));
		};
		req.once("aborted", abortFromBrowser);
		res.once("close", abortFromBrowser);
		const detachBrowserAbort = () => {
			req.removeListener("aborted", abortFromBrowser);
			res.removeListener("close", abortFromBrowser);
		};
		const lifecycleSignal = AbortSignal.any([shutdownController.signal, requestController.signal]);
		let session;
		let responseDeliveryWaiter;
		let terminalReported = false;
		const reportTerminal = (error) => {
			if (terminalReported) return;
			terminalReported = true;
			try {
				try {
					if (error) offer.request.gatewayControl?.onError?.(error);
				} finally {
					offer.request.gatewayControl?.onClose?.(error ? "error" : "completed");
				}
			} catch (callbackError) {
				params.logger.warn(`OpenAI realtime terminal callback failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`);
			}
		};
		const deliverActiveAnswer = async (status, answerSdp) => {
			responseDeliveryWaiter = createResponseDeliveryWaiter(res, detachBrowserAbort);
			respondRealtimeOffer(res, status, answerSdp, "application/sdp");
			const delivered = await responseDeliveryWaiter.result;
			responseDeliveryWaiter = void 0;
			return delivered;
		};
		try {
			const offerStartedAt = Date.now();
			const sdp = await readRequestBodyWithLimit(req, {
				maxBytes: OPENAI_QUICKSILVER_MAX_SDP_BYTES,
				timeoutMs: 15e3,
				destroyOnLimit: false
			});
			if (!sdp.trim()) {
				respondRealtimeOffer(res, 400, "SDP offer is required");
				return true;
			}
			const upstreamSignal = AbortSignal.any([lifecycleSignal, AbortSignal.timeout(OPENAI_QUICKSILVER_UPSTREAM_TIMEOUT_MS)]);
			const sessionConfig = isOpenAIGptLiveModel(offer.request.model) ? buildOpenAIQuicksilverSession({
				model: offer.request.model,
				instructions: offer.request.instructions,
				voice: offer.request.voice,
				initialItems: offer.request.initialItems
			}) : offer.request.gaSession;
			if (!sessionConfig) throw new Error("OpenAI GA realtime browser sessions require an initial session policy");
			const gaSideband = offer.request.gaSideband;
			if (gaSideband) {
				try {
					assertOpenAIRealtimeAudioOnlyOffer(sdp);
				} catch (error) {
					respondRealtimeOffer(res, 400, error instanceof Error ? error.message : "Invalid SDP offer");
					return true;
				}
				if (offer.auth.type !== "api-key") throw new Error("OpenAI Realtime Gateway control requires a Platform API key");
				const callStartedAt = Date.now();
				const call = await createOpenAIQuicksilverCall({
					auth: offer.auth,
					requestIds: offer.requestIds,
					sdp,
					session: sessionConfig,
					gaSideband: true,
					signal: upstreamSignal,
					fetchImpl: params.fetchImpl
				});
				if (call.kind !== "ga-sideband") throw new Error("OpenAI Realtime call did not create a sideband session");
				const callCreatedAt = Date.now();
				let bridge;
				try {
					bridge = gaSideband.createBridge({
						apiKey: offer.auth.token,
						callId: call.callId,
						onTerminal: () => {
							const active = activeSessions.get(token);
							if (active) activeSessionLease.close(active);
						}
					});
				} catch (error) {
					await hangupOpenAIRealtimeCall({
						apiKey: offer.auth.token,
						callId: call.callId,
						signal: AbortSignal.timeout(OPENAI_QUICKSILVER_UPSTREAM_TIMEOUT_MS),
						fetchImpl: params.fetchImpl
					}).catch(() => void 0);
					throw error;
				}
				const active = activeSessionLease.adopt(token, { dispose: async () => {
					try {
						bridge.close();
					} catch (error) {
						params.logger.warn(`OpenAI Realtime sideband close failed: ${error instanceof Error ? error.message : String(error)}`);
					}
					try {
						await hangupOpenAIRealtimeCall({
							apiKey: offer.auth.token,
							callId: call.callId,
							signal: AbortSignal.timeout(OPENAI_QUICKSILVER_UPSTREAM_TIMEOUT_MS),
							fetchImpl: params.fetchImpl
						});
					} catch (error) {
						params.logger.warn(`OpenAI Realtime call cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
					}
				} });
				activeSessionLease.expireIn(active, OPENAI_QUICKSILVER_SESSION_TTL_MS);
				session = active;
				await bridge.connect();
				if (lifecycleSignal.aborted || activeSessions.get(token) !== active) throw lifecycleSignal.reason ?? /* @__PURE__ */ new Error("OpenAI Realtime sideband stopped during startup");
				const sidebandReadyAt = Date.now();
				const metrics = {
					callCreateMs: callCreatedAt - callStartedAt,
					sidebandReadyMs: sidebandReadyAt - callCreatedAt,
					totalOfferMs: sidebandReadyAt - offerStartedAt
				};
				params.logger.debug?.(`OpenAI Realtime sideband offer ready ${JSON.stringify(metrics)}`);
				await activeSessionLease.deliverAnswer(active, lifecycleSignal, () => deliverActiveAnswer(call.status, call.answerSdp));
				return true;
			}
			const call = await createOpenAIQuicksilverCall({
				auth: offer.auth,
				requestIds: offer.requestIds,
				sdp,
				session: sessionConfig,
				signal: upstreamSignal,
				fetchImpl: params.fetchImpl
			});
			if (call.kind === "ga-realtime") {
				respondRealtimeOffer(res, call.status, call.answerSdp, "application/sdp");
				return true;
			}
			const runAgentConsult = offer.request.runAgentConsult;
			if (!runAgentConsult) throw new Error("OpenAI GPT-Live requires the Gateway agent-consult runtime");
			const connected = await connectOpenAIQuicksilverSideband({
				auth: offer.auth,
				createSocket,
				requestIds: offer.requestIds,
				signal: lifecycleSignal,
				url: call.sidebandUrl
			});
			if (lifecycleSignal.aborted) {
				connected.socket.close(1e3, "session stopped");
				throw lifecycleSignal.reason;
			}
			const abortController = new AbortController();
			const delegations = new OpenAIQuicksilverDelegationController({
				callLifecycle: offer.request.model === "gpt-live-1-codex" && typeof offer.request.gatewayControl?.bindCallLifecycle === "function",
				isCallCurrent: () => Boolean(session) && activeSessions.get(token) === session &&
					!session.closing && session.socket === connected.socket &&
					!lifecycleSignal.aborted && !abortController.signal.aborted && connected.socket.readyState === WEBSOCKET_OPEN,
				onBackendResult: (result) => offer.request.gatewayControl?.onBackendResult?.(result),
				onCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),
				onTranscript: (role, text, final) => offer.request.gatewayControl?.onTranscript?.(role, text, final),
				getSocket: () => connected.socket,
				logger: params.logger,
				onError: (error) => offer.request.gatewayControl?.onError?.(error),
				onFatalError: (error) => {
					if (session) activeSessionLease.close(session, "abort", error);
				},
				onSessionStarted: (expiresAt) => {
					if (session && expiresAt !== void 0) {
						const upstreamTtlMs = expiresAt * 1e3 - Date.now();
						activeSessionLease.expireIn(session, Math.min(OPENAI_QUICKSILVER_SESSION_TTL_MS, upstreamTtlMs));
					}
				},
				runAgentConsult: (params) => runAgentConsult({...params,prompt:typeof offer.request.gatewayControl?.onBackendResult === "function" ? backendResultQuestion(params.prompt) : params.prompt}),
				signal: abortController.signal
			});
			if (delegations.callLifecycle) offer.request.gatewayControl.bindCallLifecycle(delegations.callLifecycle);
			session = activeSessionLease.adopt(token, {
				detach: () => delegations.detach(),
				dispose: (error) => {
					delegations.stop(/* @__PURE__ */ new Error("GPT-Live delegation stopped"));
					abortController.abort(/* @__PURE__ */ new Error("GPT-Live session closed"));
					if (connected.socket.readyState === WEBSOCKET_OPEN) try {
						connected.socket.send(JSON.stringify({ type: "session.close" }));
					} catch {}
					try {
						connected.socket.close(1e3, "session closed");
					} catch {}
					reportTerminal(error);
				},
				handleFrame: (data, isBinary) => delegations.handleFrame(data, isBinary),
				socket: connected.socket
			});
			activeSessionLease.expireIn(session, OPENAI_QUICKSILVER_SESSION_TTL_MS);
			attachSidebandHandlers(session);
			const terminalEvent = connected.detachBuffer();
			for (const frame of connected.bufferedFrames) session.handleFrame?.(frame.data, frame.isBinary);
			if (terminalEvent && activeSessions.get(token) === session) {
				if (terminalEvent.kind === "error") params.logger.warn(`OpenAI GPT-Live sideband socket failed: ${terminalEvent.error.message}`);
				await activeSessionLease.close(session, "abort", terminalEvent.kind === "error" ? terminalEvent.error : /* @__PURE__ */ new Error("OpenAI GPT-Live sideband failed during startup"));
			}
			if (activeSessions.get(token) !== session) throw new Error("OpenAI GPT-Live sideband failed during startup");
			await activeSessionLease.deliverAnswer(session, lifecycleSignal, () => deliverActiveAnswer(200, call.answerSdp));
			return true;
		} catch (error) {
			const sessionError = error instanceof Error ? error : /* @__PURE__ */ new Error("OpenAI realtime session failed");
			if (offer.request.gaSideband) offer.request.gatewayControl?.onError?.(sessionError);
			if (session) await activeSessionLease.close(session, "abort", sessionError);
			if (offer.request.gaSideband) offer.request.gatewayControl?.onClose?.("error");
			else if (!session) reportTerminal(sessionError);
			if (browserDisconnected) return true;
			if (await rejectOversizedOffer(req, res, error)) return true;
			respondRealtimeOffer(res, 502, sessionError.message);
			return true;
		} finally {
			responseDeliveryWaiter?.cancel();
			detachBrowserAbort();
			inFlightOffers.delete(token);
			if (!session) releaseReservation(token);
		}
	};
	const handler = (req, res) => {
		const handling = handleOffer(req, res);
		inFlightHandlers.add(handling);
		return handling.finally(() => inFlightHandlers.delete(handling));
	};
	const cleanup = async () => {
		if (cleanedUp) return;
		cleanedUp = true;
		shutdownController.abort(/* @__PURE__ */ new Error("OpenAI realtime broker stopped"));
		for (const [token, offer] of pendingOffers) expirePendingOffer(token, offer);
		for (const controller of inFlightOffers.values()) controller.abort(/* @__PURE__ */ new Error("OpenAI realtime broker stopped"));
		const closingSessions = Array.from(activeSessions.values(), (session) => activeSessionLease.close(session));
		await Promise.allSettled(inFlightHandlers);
		await Promise.allSettled(closingSessions);
		for (const token of reservations) releaseOpenAIQuicksilverSession(token);
		reservations.clear();
		reservationOwners.clear();
	};
	return {
		broker,
		handler,
		cleanup,
		getSessionCounts: () => ({
			pending: pendingOffers.size,
			inFlight: inFlightOffers.size,
			active: activeSessions.size,
			reservations: reservations.size
		})
	};
}
//#endregion
export { resolveOpenAIChatGptSubscriptionAuth as i, OPENAI_QUICKSILVER_OFFER_PATH as n, createOpenAIQuicksilverBrowserSessionBroker as r, OPENAI_QUICKSILVER_CAPABILITIES as t };
