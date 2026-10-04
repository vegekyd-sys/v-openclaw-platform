import { n as createDebugProxyWebSocketAgent, r as resolveDebugProxySettings } from "./env-Llg659bo.js";
import { t as canonicalizeBase64 } from "./base64-Vw7DZYSc.js";
import { n as captureWsEvent } from "./runtime-HEXqQXTb.js";
import "./proxy-capture-D6KYn9z6.js";
import { n as rawDataToString } from "./ws-C3ckvj65.js";
import "./media-runtime-tK9ZA3MS.js";
import { t as RealtimeVoiceSessionLifecycle } from "./realtime-session-lifecycle-B2wf87mH.js";
import { w as REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME } from "./realtime-session-harness-CEO5kVAJ.js";
import "./realtime-voice-NlvNxg-r.js";
import { a as createStreamingPcmResampler, o as mulawToPcm, s as pcmToMulaw } from "./audio-energy-avUVPovl.js";
import "./webhook-ingress-DvQMng9V.js";
import { a as buildOpenAIQuicksilverWebSocketUrl, d as parseOpenAIQuicksilverEvent, i as buildOpenAIQuicksilverSessionUpdate, n as boundOpenAIQuicksilverDelegationResult, s as chunkOpenAIQuicksilverAppendText } from "./realtime-quicksilver-wire-C2tdaxFV.js";
import { t as connectOpenAIQuicksilverSideband } from "./realtime-quicksilver-sideband-CIA1t5yo.js";
import { randomUUID } from "node:crypto";
import WebSocket$1 from "ws";
//#region extensions/openai/realtime-quicksilver-bridge.ts
const OPENAI_QUICKSILVER_MAX_PAYLOAD_BYTES = 16777216;
const OPENAI_QUICKSILVER_READY_TIMEOUT_MS = 15e3;
const OPENAI_QUICKSILVER_SAMPLE_RATE = 24e3;
const WEBSOCKET_OPEN = 1;
function toolResultText(result) {
	if (typeof result === "string") return result;
	if (result && typeof result === "object") {
		const record = result;
		for (const key of [
			"text",
			"result",
			"output",
			"error"
		]) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) return value;
		}
	}
	try {
		return JSON.stringify(result) ?? String(result);
	} catch {
		return String(result);
	}
}
var OpenAIQuicksilverVoiceBridge = class {
	constructor(config) {
		this.config = config;
		this.supportsToolResultContinuation = true;
		this.supportsToolResultSuppression = true;
		this.handlesInputAudioBargeIn = false;
		this.inboundTelephonyResampler = createStreamingPcmResampler(8e3, OPENAI_QUICKSILVER_SAMPLE_RATE);
		this.outboundTelephonyResampler = createStreamingPcmResampler(OPENAI_QUICKSILVER_SAMPLE_RATE, 8e3);
		this.activeDelegations = /* @__PURE__ */ new Set();
		this.flowId = randomUUID();
		this.requestIds = {
			realtimeSessionId: randomUUID(),
			sessionId: randomUUID(),
			threadId: randomUUID()
		};
		this.lifecycle = new RealtimeVoiceSessionLifecycle("OpenAI", {
			pendingAudioOverflowPolicy: "drop-oldest",
			onPendingAudioOverflow: () => (config.logger?.warn ?? console.warn)("OpenAI GPT-Live input audio queue overflow; keeping newest audio")
		});
	}
	async connect() {
		await this.lifecycle.connect((connection) => this.connectConnection(connection));
	}
	async connectConnection(connection) {
		let connected;
		try {
			const auth = await this.waitForConnection(this.config.resolveAuth(), connection);
			if (!auth) return;
			const url = buildOpenAIQuicksilverWebSocketUrl(this.config.model);
			const createSocket = this.config.webSocketFactory ?? this.createSocketFactory();
			connected = await connectOpenAIQuicksilverSideband({
				auth,
				createSocket,
				requestIds: this.requestIds,
				signal: connection.signal,
				url
			});
		} catch (error) {
			if (!this.lifecycle.isCurrent(connection) || this.lifecycle.terminalOutcome(connection) === "completed") return;
			this.failLifecycle(connection);
			throw error;
		}
		if (!this.lifecycle.isCurrent(connection) || connection.signal.aborted) {
			this.closeSocket("stale connection", connected.socket);
			return;
		}
		const url = buildOpenAIQuicksilverWebSocketUrl(this.config.model);
		this.socket = connected.socket;
		captureWsEvent({
			url,
			direction: "local",
			kind: "ws-open",
			flowId: this.flowId,
			meta: {
				provider: "openai",
				capability: "gpt-live-voice"
			}
		});
		let reachedReady = false;
		let resolveReady;
		let rejectReady;
		let readySettled = false;
		let removeAbortListener = () => {};
		const readyPromise = new Promise((resolve, reject) => {
			resolveReady = resolve;
			rejectReady = reject;
		});
		const settleReady = (providerReady = true) => {
			if (readySettled) return;
			readySettled = true;
			reachedReady = providerReady;
			if (readyTimeout) clearTimeout(readyTimeout);
			removeAbortListener();
			resolveReady();
		};
		const failReady = (error) => {
			if (readySettled) return;
			readySettled = true;
			if (readyTimeout) clearTimeout(readyTimeout);
			removeAbortListener();
			rejectReady(error);
		};
		const failStartup = (error, reason) => {
			if (this.lifecycle.terminalOutcome(connection) === "completed") {
				settleReady(false);
				return;
			}
			if (!this.lifecycle.acceptsEvents(connection) || reachedReady) return;
			this.failLifecycle(connection);
			failReady(error);
			this.closeSocket(reason, connected.socket);
		};
		const readyTimeout = setTimeout(() => {
			failStartup(/* @__PURE__ */ new Error("GPT-Live WebSocket did not emit session.started"), "session-start timeout");
		}, OPENAI_QUICKSILVER_READY_TIMEOUT_MS);
		readyTimeout.unref?.();
		const onAbort = () => {
			if (this.lifecycle.terminalOutcome(connection) === "completed") settleReady(false);
		};
		connection.signal.addEventListener("abort", onAbort, { once: true });
		removeAbortListener = () => connection.signal.removeEventListener("abort", onAbort);
		if (connection.signal.aborted) onAbort();
		connected.socket.on("message", (data, isBinary) => {
			if (!this.lifecycle.acceptsEvents(connection) || this.socket !== connected.socket) return;
			if (isBinary) {
				const error = /* @__PURE__ */ new Error("GPT-Live WebSocket returned an unexpected binary frame");
				if (!reachedReady) failStartup(error, "unexpected binary frame");
				else this.fail(connection, error);
				return;
			}
			const payload = rawDataToString(data);
			captureWsEvent({
				url,
				direction: "inbound",
				kind: "ws-frame",
				flowId: this.flowId,
				payload,
				meta: {
					provider: "openai",
					capability: "gpt-live-voice"
				}
			});
			const event = parseOpenAIQuicksilverEvent(payload);
			if (event) this.handleEvent(event, connection, settleReady, failStartup);
		});
		connected.socket.on("error", (error) => {
			if (!this.lifecycle.acceptsEvents(connection) || this.socket !== connected.socket) return;
			if (!reachedReady) failStartup(error, "startup error");
			else this.fail(connection, error);
		});
		connected.socket.on("close", (code) => {
			if (!this.lifecycle.isCurrent(connection) || this.socket !== connected.socket) return;
			this.socket = void 0;
			if (!reachedReady) {
				if (this.lifecycle.terminalOutcome(connection) === "completed") {
					settleReady();
					this.notifyClose(connection, "completed");
					return;
				}
				const error = /* @__PURE__ */ new Error("GPT-Live WebSocket closed before session.started");
				this.failLifecycle(connection);
				failReady(error);
				this.lifecycle.close(connection, "error");
				return;
			}
			this.notifyClose(connection, code === 1e3 ? "completed" : "error");
		});
		const terminalEvent = connected.detachBuffer();
		this.sendEvent(buildOpenAIQuicksilverSessionUpdate({
			instructions: this.config.instructions,
			voice: this.config.voice
		}));
		for (const frame of connected.bufferedFrames) if (!frame.isBinary) {
			const event = parseOpenAIQuicksilverEvent(rawDataToString(frame.data));
			if (event) this.handleEvent(event, connection, settleReady, failStartup);
		}
		if (terminalEvent) {
			const error = terminalEvent.kind === "error" ? terminalEvent.error : /* @__PURE__ */ new Error("GPT-Live WebSocket closed during startup");
			if (reachedReady) {
				if (terminalEvent.kind === "close" && terminalEvent.code === 1e3) this.notifyClose(connection, "completed");
				else if (this.fail(connection, error, "startup terminal event")) this.notifyClose(connection, "error");
			} else failStartup(error, "startup terminal event");
		}
		await readyPromise;
	}
	sendAudio(audio) {
		if (this.lifecycle.phase() === "terminal") return;
		if (!this.lifecycle.isReady() || this.socket?.readyState !== WEBSOCKET_OPEN) {
			this.lifecycle.enqueuePendingAudio(audio);
			return;
		}
		this.sendAudioNow(audio);
	}
	setMediaTimestamp(_ts) {}
	sendUserMessage(text) {
		this.sendContext("session.context.append", void 0, text);
	}
	triggerGreeting(instructions) {
		this.sendContext("session.context.append", void 0, instructions ?? "Greet the user briefly.", "speakable");
	}
	submitToolResult(callId, result, options) {
		const channel = options?.suppressResponse || options?.willContinue ? "commentary" : "speakable";
		const isDelegation = this.activeDelegations.has(callId);
		const type = isDelegation ? "delegation.context.append" : "session.context.append";
		const text = toolResultText(result);
		this.sendContext(type, isDelegation ? callId : void 0, isDelegation ? boundOpenAIQuicksilverDelegationResult(text) : text, channel);
		if (!options?.willContinue) this.activeDelegations.delete(callId);
	}
	acknowledgeMark(_markName) {}
	close() {
		const connection = this.lifecycle.currentConnection();
		if (!this.lifecycle.cancel()) return;
		this.resetTerminalState();
		if (!connection) return;
		if (this.socket?.readyState === WEBSOCKET_OPEN) this.sendEvent({ type: "session.close" });
		this.closeSocket("bridge closed");
		this.notifyClose(connection, "completed");
	}
	isConnected() {
		return this.lifecycle.isReady() && this.socket?.readyState === WEBSOCKET_OPEN;
	}
	handleBargeIn() {
		this.config.onClearAudio("barge-in");
	}
	createSocketFactory() {
		return (url, options) => {
			const proxyAgent = createDebugProxyWebSocketAgent(resolveDebugProxySettings());
			return new WebSocket$1(url, {
				...options,
				maxPayload: OPENAI_QUICKSILVER_MAX_PAYLOAD_BYTES,
				...proxyAgent ? { agent: proxyAgent } : {}
			});
		};
	}
	async waitForConnection(promise, connection) {
		if (connection.signal.aborted) return;
		return new Promise((resolve, reject) => {
			const onAbort = () => {
				cleanup();
				resolve(void 0);
			};
			const cleanup = () => connection.signal.removeEventListener("abort", onAbort);
			connection.signal.addEventListener("abort", onAbort, { once: true });
			promise.then((value) => {
				cleanup();
				resolve(value);
			}, (error) => {
				cleanup();
				reject(error instanceof Error ? error : new Error(String(error)));
			});
		});
	}
	handleEvent(event, connection, settleReady, failStartup) {
		if (event.kind === "ignored" || event.kind === "unknown") return;
		if (event.kind === "session-started") {
			if (this.lifecycle.ready(connection)) {
				for (const audio of this.lifecycle.drainPendingAudio()) this.sendAudioNow(audio);
				this.config.onReady?.();
			}
			this.config.onEvent?.({
				direction: "server",
				type: "session.started"
			});
			settleReady();
			return;
		}
		if (event.kind === "audio") {
			const canonical = canonicalizeBase64(event.data);
			if (!canonical) {
				this.fail(connection, /* @__PURE__ */ new Error("GPT-Live WebSocket returned malformed base64 audio"));
				return;
			}
			const pcm = Buffer.from(canonical, "base64");
			const output = this.config.audioFormat?.encoding === "g711_ulaw" ? pcmToMulaw(this.outboundTelephonyResampler.process(pcm)) : pcm;
			if (output.length > 0) this.config.onAudio(output);
			this.config.onEvent?.({
				direction: "server",
				type: "output_audio.delta"
			});
			return;
		}
		if (event.kind === "transcript-delta" || event.kind === "transcript-done") {
			if (event.kind === "transcript-done" && event.role === "assistant" && this.config.audioFormat?.encoding === "g711_ulaw") {
				const tail = pcmToMulaw(this.outboundTelephonyResampler.flush());
				this.outboundTelephonyResampler = createStreamingPcmResampler(OPENAI_QUICKSILVER_SAMPLE_RATE, 8e3);
				if (tail.length > 0) this.config.onAudio(tail);
			}
			this.config.onTranscript?.(event.role, event.text, event.kind === "transcript-done");
			this.config.onEvent?.({
				direction: "server",
				type: event.kind === "transcript-done" ? event.role === "assistant" ? "response.done" : "turn.done" : `${event.role === "user" ? "input" : "output"}_transcript.added`
			});
			return;
		}
		if (event.kind === "delegation") {
			this.activeDelegations.add(event.id);
			this.config.onEvent?.({
				direction: "server",
				type: "delegation.created",
				itemId: event.id
			});
			this.config.onToolCall?.({
				itemId: event.id,
				callId: event.id,
				name: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
				args: { question: event.prompt }
			});
			return;
		}
		const error = new Error(event.message);
		if (!this.lifecycle.isReady()) {
			failStartup(error, "session start failed");
			return;
		}
		this.config.onEvent?.({
			direction: "server",
			type: "error",
			detail: event.message
		});
		if (event.fatalAuth) this.fail(connection, error, "authentication failed");
		else this.config.onError?.(error);
	}
	sendAudioNow(audio) {
		const pcm = this.config.audioFormat?.encoding === "g711_ulaw" ? this.inboundTelephonyResampler.process(mulawToPcm(audio)) : audio;
		if (pcm.length === 0) return;
		this.sendEvent({
			type: "input_audio.append",
			audio: pcm.toString("base64")
		});
	}
	sendContext(type, delegationItemId, text, channel) {
		for (const chunk of chunkOpenAIQuicksilverAppendText(text)) this.sendEvent({
			type,
			...delegationItemId ? { delegation_item_id: delegationItemId } : {},
			...channel ? { channel } : {},
			content: [{
				type: "input_text",
				text: chunk
			}]
		});
	}
	sendEvent(event) {
		if (!this.socket || this.socket.readyState !== WEBSOCKET_OPEN) return;
		const payload = JSON.stringify(event);
		captureWsEvent({
			url: buildOpenAIQuicksilverWebSocketUrl(this.config.model),
			direction: "outbound",
			kind: "ws-frame",
			flowId: this.flowId,
			payload,
			meta: {
				provider: "openai",
				capability: "gpt-live-voice"
			}
		});
		this.socket.send(payload);
	}
	fail(connection, error, reason = "bridge error") {
		if (!this.failLifecycle(connection)) return false;
		this.config.onError?.(error);
		this.closeSocket(reason);
		return true;
	}
	failLifecycle(connection) {
		if (!this.lifecycle.failure(connection)) return false;
		this.resetTerminalState();
		return true;
	}
	resetTerminalState() {
		this.activeDelegations.clear();
		this.inboundTelephonyResampler = createStreamingPcmResampler(8e3, OPENAI_QUICKSILVER_SAMPLE_RATE);
		this.outboundTelephonyResampler = createStreamingPcmResampler(OPENAI_QUICKSILVER_SAMPLE_RATE, 8e3);
	}
	closeSocket(reason, socket = this.socket) {
		try {
			socket?.close(1e3, reason);
		} catch {}
	}
	notifyClose(connection, reason) {
		const outcome = this.lifecycle.close(connection, reason);
		if (!outcome) return;
		this.resetTerminalState();
		this.config.onClose?.(outcome);
	}
};
//#endregion
export { OpenAIQuicksilverVoiceBridge as t };
