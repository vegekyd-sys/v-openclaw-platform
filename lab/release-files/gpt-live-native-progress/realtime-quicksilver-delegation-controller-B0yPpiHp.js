import { createHash, randomUUID } from "node:crypto";
import { l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import "./error-runtime-BmBsU1OI.js";
import { n as rawDataToString } from "./ws-C3ckvj65.js";
import "./webhook-ingress-DvQMng9V.js";
import { t as buildOpenAIQuicksilverDelegationPrompt } from "./realtime-quicksilver-instructions-CUVT6eIm.js";
import { d as parseOpenAIQuicksilverEvent, n as boundOpenAIQuicksilverDelegationResult, s as chunkOpenAIQuicksilverAppendText, t as boundOpenAIQuicksilverContextItems } from "./realtime-quicksilver-wire-C2tdaxFV.js";
//#region extensions/openai/realtime-quicksilver-delegation-controller.ts
const WEBSOCKET_OPEN = 1;
const CONSULT_FAILURE_TEXT = "The agent task failed. Tell the user it did not complete and offer to try again.";
function shortFailureReason(error) {
	return formatErrorMessage(error).replaceAll(/\s+/g, " ").trim().slice(0, 180) || "unknown error";
}
function readWireEventType(payload) {
	try {
		const decoded = JSON.parse(payload);
		return typeof decoded.type === "string" ? decoded.type : void 0;
	} catch {
		return;
	}
}
/** Owns the provider's single active delegation and its once-consumed transcript context. */
var OpenAIQuicksilverDelegationController = class {
	constructor(options) {
		this.options = options;
		this.onSessionAbort = () => {
			const reason = this.options.signal.reason;
			this.stop(reason instanceof Error ? reason : /* @__PURE__ */ new Error("GPT-Live session stopped"));
		};
		this.stopped = false;
		this.delegationGeneration = 0;
		this.publicProgressTraceLogEnabled = process.env.OPENCLAW_GPT_LIVE_PROGRESS_TRACE === "1";
		this.publicProgressTraceEnabled = this.publicProgressTraceLogEnabled || typeof options.onPublicProgressDiagnostic === "function";
		this.publicProgressTraceId = this.publicProgressTraceEnabled ? randomUUID() : void 0;
		this.publicProgressTraceSequence = 0;
		this.publicProgressAppendSequence = 0;
		this.lastSpokenProgressAt = -Infinity;
		this.transcript = [];
		if (options.signal.aborted) this.onSessionAbort();
		else options.signal.addEventListener("abort", this.onSessionAbort, { once: true });
	}
	handleFrame(data, isBinary) {
		if (isBinary) {
			this.fail(/* @__PURE__ */ new Error("OpenAI GPT-Live sideband returned an unexpected binary frame"));
			return;
		}
		const payload = rawDataToString(data);
		if (this.options.onWireEventType) {
			const eventType = readWireEventType(payload);
			if (eventType) this.options.onWireEventType(eventType);
		}
		const event = parseOpenAIQuicksilverEvent(payload);
		if (event) this.handleEvent(event);
	}
	handleEvent(event) {
		if (this.stopped || event.kind === "ignored") return;
		if (event.kind === "unknown") {
			this.options.logger.debug?.(`OpenAI GPT-Live ignored sideband event: ${event.eventType}`);
			return;
		}
		if (event.kind === "session-started") {
			this.options.onSessionStarted?.(event.expiresAt);
			return;
		}
		if (event.kind === "transcript-delta" || event.kind === "transcript-done") {
			this.appendTranscript(event);
			this.options.onTranscript?.(event.role, event.text, event.kind === "transcript-done");
			return;
		}
		if (event.kind === "error") {
			const error = /* @__PURE__ */ new Error(`OpenAI GPT-Live sideband error: ${event.message}`);
			this.options.logger.warn(error.message);
			if (event.fatalAuth) this.options.onFatalError(error);
			else this.options.onError?.(error);
			return;
		}
		if (event.kind === "audio") return;
		this.startDelegation(event.id, event.prompt);
	}
	sendToActiveDelegation(text, channel) {
		const content = text.trim();
		if (this.activeDelegationId && content) this.sendAppend(this.activeDelegationId, content, channel);
	}
	stop(reason) {
		if (this.stopped) return;
		this.markStopped();
		this.consultController?.abort(reason);
		this.consultController = void 0;
	}
	/** Releases sideband ownership without canceling work already accepted by the host. */
	detach() {
		if (this.stopped) return;
		this.markStopped();
	}
	appendTranscript(event) {
		const last = this.transcript.at(-1);
		if (event.kind === "transcript-delta") {
			if (last?.role === event.role && this.partialTranscriptRole === event.role) last.text += event.text;
			else this.transcript.push({
				role: event.role,
				text: event.text
			});
			this.partialTranscriptRole = event.role;
		} else {
			if (last?.role === event.role && this.partialTranscriptRole === event.role) last.text = event.text;
			else this.transcript.push({
				role: event.role,
				text: event.text
			});
			this.partialTranscriptRole = void 0;
		}
		this.transcript = boundOpenAIQuicksilverContextItems(this.transcript);
	}
	startDelegation(id, input) {
		if (this.stopped || this.options.signal.aborted || !input.trim()) return;
		const transcript = this.transcript;
		this.transcript = [];
		this.partialTranscriptRole = void 0;
		const delegation = {
			id,
			generation: ++this.delegationGeneration,
			prompt: buildOpenAIQuicksilverDelegationPrompt({
				input,
				transcript
			})
		};
		this.activeDelegationId = id;
		if (this.consultController) {
			this.pendingDelegation = delegation;
			this.consultController.abort(/* @__PURE__ */ new Error("GPT-Live delegation superseded"));
			return;
		}
		this.launchDelegation(delegation);
	}
	launchDelegation(delegation) {
		if (this.stopped || this.options.signal.aborted) return;
		const controller = new AbortController();
		this.consultController = controller;
		this.activeDelegationId = delegation.id;
		this.runDelegation(delegation, controller.signal).catch((error) => this.fail(toErrorObject(error, "OpenAI GPT-Live delegation failed"))).finally(() => {
			if (this.consultController !== controller) return;
			this.consultController = void 0;
			const pending = this.pendingDelegation;
			this.pendingDelegation = void 0;
			if (pending) this.launchDelegation(pending);
			else this.activeDelegationId = void 0;
		});
	}
	markStopped() {
		this.cancelQueuedProgress?.();
		this.stopped = true;
		this.options.signal.removeEventListener("abort", this.onSessionAbort);
		this.pendingDelegation = void 0;
		this.activeDelegationId = void 0;
		this.partialTranscriptRole = void 0;
		this.transcript = [];
	}
	tracePublicProgress(stage, delegationId, text, details = {}) {
		if (!this.publicProgressTraceEnabled || !["progress", "final", "failure"].includes(details.kind)) return;
		// Diagnostics carry public text fingerprints only. Do not copy arbitrary
		// callback fields, prompts, reasoning, credentials or account metadata.
		const event = {
			version: 1,
			stage,
			at: Date.now(),
			traceId: this.publicProgressTraceId,
			sequence: ++this.publicProgressTraceSequence,
			delegationId,
			generation: this.delegationGeneration,
			textSha256: createHash("sha256").update(text).digest("hex"),
			textChars: text.length
		};
		for (const key of ["kind", "appendId", "chunkIndex", "chunkCount", "wireTextChars", "channel"]) {
			if (typeof details[key] === "string" || Number.isSafeInteger(details[key])) event[key] = details[key];
		}
		if (["progress_pending", "progress_context", "final_part", "final_complete", "failure"].includes(details.role)) event.role = details.role;
		if (typeof details.wireTextSha256 === "string" && /^[a-f0-9]{64}$/.test(details.wireTextSha256)) event.wireTextSha256 = details.wireTextSha256;
		const provenance = details.provenance;
		if (provenance && typeof provenance === "object") {
			event.provenance = {};
			for (const key of ["runId", "source", "itemId"]) {
				const value = provenance[key];
				if (typeof value === "string" && /^[a-zA-Z0-9_.:@/-]{1,160}$/.test(value)) event.provenance[key] = value;
			}
			for (const key of ["emittedAt", "sequence"]) {
				if (Number.isSafeInteger(provenance[key]) && provenance[key] >= 0) event.provenance[key] = provenance[key];
			}
		}
		// An observer must never change delivery or cancel accepted backend work.
		try {
			const pending = this.options.onPublicProgressDiagnostic?.(event);
			if (pending && typeof pending.catch === "function") pending.catch(() => {});
		} catch {}
		if (this.publicProgressTraceLogEnabled) {
			try { this.options.logger.info?.(`GPT_LIVE_PUBLIC_PROGRESS ${JSON.stringify(event)}`); } catch {}
		}
	}
	chunkPublicAppendText(text) {
		// Leave 180 UTF-8 bytes for the role header within the native 500-byte
		// append limit. Iteration by code point never splits a surrogate pair.
		const chunks = [];
		let chunk = "", bytes = 0;
		for (const character of text) {
			const characterBytes = Buffer.byteLength(character, "utf8");
			if (bytes + characterBytes > 320) {
				chunks.push(chunk);
				chunk = "";
				bytes = 0;
			}
			chunk += character;
			bytes += characterBytes;
		}
		if (chunk) chunks.push(chunk);
		return chunks;
	}
	formatPublicAppendChunk(text, kind, chunkIndex, chunkCount, channel = "speakable") {
		const position = `${chunkIndex + 1}/${chunkCount}`;
		let role, header;
		if (kind === "failure") {
			role = "failure";
			header = `[BACKEND_FAILURE ${position}]\nNo complete result. Explain this limitation honestly; do not claim task completion or invent missing values.\n\n`;
		} else if (kind === "progress" && channel !== "speakable") {
			role = "progress_context";
			header = `[BACKEND_CONTEXT_ONLY ${position}]\nPublic context only. Do not speak or reply. Parent task pending; wait for speakable progress or final.\n\n`;
		} else if (kind === "progress") {
			role = "progress_pending";
			header = `[BACKEND_PROGRESS_PENDING ${position}]\nParent task remains pending. One short fact when idle; stop for caller. Never guess values or claim completion.\n\n`;
		} else if (chunkIndex + 1 < chunkCount) {
			role = "final_part";
			header = `[BACKEND_FINAL_PART ${position}]\nPartial parent final. Wait for BACKEND_FINAL_COMPLETE before answering; preserve all facts and values exactly.\n\n`;
		} else {
			role = "final_complete";
			header = `[BACKEND_FINAL_COMPLETE ${position}]\nParent final is complete. Relay collected final parts faithfully; never replace numbers or invent missing facts.\n\n`;
		}
		if (Buffer.byteLength(header, "utf8") > 180) throw new Error("Native public append role header exceeds byte budget");
		return { role, wireText: header + text };
	}
	isCurrentDelegation(delegation, signal) {
		return !this.stopped && !this.options.signal.aborted && !signal.aborted &&
			this.activeDelegationId === delegation.id && this.delegationGeneration === delegation.generation;
	}
	async runDelegation(delegation, signal) {
		let text;
		let terminalKind = "final";
		let finished = false;
		const seenProgress = new Set();
		let queuedProgress;
		let progressTimer;
		const clearQueuedProgress = () => {
			clearTimeout(progressTimer);
			progressTimer = void 0;
			queuedProgress = void 0;
		};
		this.cancelQueuedProgress = clearQueuedProgress;
		signal.addEventListener("abort", clearQueuedProgress, { once: true });
		const deliverProgress = (progress, channel) => {
			try {
				if (!this.sendAppend(delegation.id, progress.text, channel, { kind: "progress", provenance: progress.provenance })) return false;
				if (channel === "speakable") this.lastSpokenProgressAt = Date.now();
				return true;
			} catch (error) {
				this.options.logger.warn(`OpenAI GPT-Live progress delivery failed: ${shortFailureReason(error)}`);
				return false;
			}
		};
		const queueProgress = (progress) => {
			// Retain one latest public fact rather than reading a backlog. It has not
			// been appended yet, so its later speech is not a duplicated context body.
			queuedProgress = progress;
			if (progressTimer) return;
			progressTimer = setTimeout(() => {
				progressTimer = void 0;
				const latest = queuedProgress;
				queuedProgress = void 0;
				if (!latest || finished || !this.isCurrentDelegation(delegation, signal)) return;
				deliverProgress(latest, "speakable");
			}, Math.max(1, 15000 - (Date.now() - this.lastSpokenProgressAt)));
			progressTimer.unref?.();
		};
		// Only an exact, authorized host cancellation can revoke this delivery
		// owner. Never infer cancellation from generic worker error strings.
		const onCanceled = (reason) => {
			if (finished || !this.isCurrentDelegation(delegation, signal) ||
				this.consultController?.signal !== signal) return;
			finished = true;
			this.consultController.abort(reason ?? new Error("Realtime voice consult cancelled"));
		};
		// The host supplies public assistant replies only. Reasoning streams never
		// enter this callback. Host commentary is public assistant output; the native
		// commentary channel is not proof of silence. Withhold chatter and long
		// public articles from the native wire; append only selected short facts.
		const onProgress = (progress) => {
			if (finished || !this.isCurrentDelegation(delegation, signal) ||
				progress?.kind !== "commentary" || progress?.isReasoning === true ||
				typeof progress?.text !== "string" || !progress.text.trim()) return;
			const publicText = progress.text.trim();
			this.tracePublicProgress("public-progress-received", delegation.id, publicText, { kind: "progress", provenance: progress.provenance });
			const fingerprint = createHash("sha256").update(publicText).digest("hex");
			if (seenProgress.has(fingerprint)) return;
			// Backend work retains its own context. Sending an ineligible article on
			// commentary can still provoke speech, despite a context-only instruction.
			// Backend result grounding is a prompt/acceptance contract; this semantic
			// chatter filter does not prove arbitrary assistant text is verified.
			const now = Date.now();
			// Ordinary short public facts need no special wording. Suppress clear
			// waiting/setup statements; an actual result within one takes priority.
			const waitingPlan = /^(?:我(?:这边)?(?:会|将|先|正在|在)|我们(?:先|会|正在)|正在|现在(?:开始)?(?:等|等待|查|看|核对|执行)|(?:下一步|接下来|然后)(?:我|我们)?(?:会|将|先|去|开始|等|查|看)|先(?:查|看|确认|核对)|(?:好|行)[，,]?我(?:先)?(?:查|看)|稍等|请稍等|等一下|让我|这边(?:正在|在|先)|I(?:'m| am| will|['’]ll)|(?:Now|Next)(?:[,:]?\s+)(?:I(?: will|['’]ll)|we(?: will|['’]ll)|start|wait|waiting|check)|Let me|Please wait|One (?:sec|moment))/iu.test(publicText);
			const setupOnly = /^(?:Read-only\b|All read-only\b|No (?:files? (?:written|were written)|external)|Sub-?task spawned\b|子(?:任务|代理)(?:已)?(?:启动|派发|交办))/iu.test(publicText);
			const hasStatedResult = /(?:已(?:经)?(?:找到|查到|确认|核对|完成|收到|得到|生成|发出|测得|读到|验证)|找到了|查到了|确认了|核对出|记录显示|结果(?:是|为)|等于|完成(?:了|[。.!]|$)|(?:当前|测得|核验)(?:时间|值)(?:是|为)|(?:found|confirmed|completed|complete|finished|done|generated|verified)\b|results?(?: (?:is|are)|:)|(?:value|time|price|cost) is\b)/iu.test(publicText);
			// A streamed markdown fragment is not an independent stage sentence.
			// In particular, a child result's bare "— YES**" must not displace a fact.
			const structuralFragment = /```|(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|>\s|\d+[.)]\s)|^\s*[-—–*`#\s]*(?:YES|NO|TRUE|FALSE|DONE|OK|MATCH)[-—–*`#.!\s]*$|^\s*\*\*/iu.test(publicText);
			const speechEligible = !structuralFragment && (!(waitingPlan || setupOnly) || hasStatedResult) && Buffer.byteLength(publicText, "utf8") <= 320;
			const selected = { text: publicText, provenance: progress.provenance };
			if (speechEligible) {
				if (now - this.lastSpokenProgressAt < 15000) queueProgress(selected);
				else {
					clearQueuedProgress();
					if (!deliverProgress(selected, "speakable")) return;
				}
			}
			seenProgress.add(fingerprint);
			if (seenProgress.size > 256) seenProgress.delete(seenProgress.values().next().value);
		};
		try {
			const result = await this.options.runAgentConsult({
				prompt: delegation.prompt,
				signal,
				continuationIdentity: { delegationItemId: delegation.id, delegationGeneration: delegation.generation },
				onProgress,
				onCanceled
			});
			if (!this.isCurrentDelegation(delegation, signal)) return;
			if (typeof result?.text !== "string" || !result.text.trim()) throw new Error("Backend returned no complete public result");
			text = result.text;
			// Preserve the original public result before applying the delivery limit.
			// Byte-safe native chunks already bound individual frames; truncating the
			// whole result would lose late facts while falsely labeling it complete.
			this.tracePublicProgress("backend-final-received", delegation.id, text, { kind: "final" });
			if (Buffer.byteLength(text, "utf8") > 16 * 1024) {
				terminalKind = "failure";
				text = "The backend result is too long to deliver completely. Tell the user it has not been fully delivered; do not claim completion, summarize unseen parts or invent missing values.";
				this.options.logger.warn("OpenAI GPT-Live complete public result exceeded the 16 KiB delivery limit");
			}
		} catch (error) {
			if (!this.isCurrentDelegation(delegation, signal) || this.options.isCanceledError?.(error)) return;
			this.options.logger.warn(`OpenAI GPT-Live delegation consult failed: ${shortFailureReason(error)}`);
			text = CONSULT_FAILURE_TEXT;
			terminalKind = "failure";
		} finally {
			finished = true;
			clearQueuedProgress();
			signal.removeEventListener("abort", clearQueuedProgress);
			if (this.cancelQueuedProgress === clearQueuedProgress) this.cancelQueuedProgress = void 0;
		}
		if (this.isCurrentDelegation(delegation, signal)) {
			this.sendAppend(delegation.id, text, "speakable", { kind: terminalKind });
		}
	}
	sendAppend(delegationId, text, channel, diagnostic = {}) {
		const socket = this.options.getSocket();
		if (this.stopped || !socket || socket.readyState !== WEBSOCKET_OPEN) return false;
		const isPublic = ["progress", "final", "failure"].includes(diagnostic.kind);
		const chunks = isPublic ? this.chunkPublicAppendText(text) : chunkOpenAIQuicksilverAppendText(text);
		const appendId = ++this.publicProgressAppendSequence;
		for (const [chunkIndex, chunk] of chunks.entries()) {
			const { role, wireText } = isPublic ? this.formatPublicAppendChunk(chunk, diagnostic.kind, chunkIndex, chunks.length, channel) : { wireText: chunk };
			const frame = {
				type: "delegation.context.append",
				delegation_item_id: delegationId,
				channel,
				content: [{ type: "input_text", text: wireText }]
			};
			socket.send(JSON.stringify(frame));
			// Fingerprint the content of the actual successfully sent frame. The
			// body hash remains joinable to public callback provenance.
			this.tracePublicProgress("context-append-sent", delegationId, chunk, {
				...diagnostic, channel, appendId, chunkIndex, chunkCount: chunks.length, role,
				wireTextSha256: createHash("sha256").update(frame.content[0].text).digest("hex"),
				wireTextChars: frame.content[0].text.length
			});
		}
		return chunks.length > 0;
	}
	fail(error) {
		if (this.stopped) return;
		this.options.logger.warn(error.message);
		this.options.onFatalError(error);
	}
};
//#endregion
export { OpenAIQuicksilverDelegationController as t };
