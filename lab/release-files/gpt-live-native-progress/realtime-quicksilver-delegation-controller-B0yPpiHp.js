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
		this.issuedDelegationGeneration = 0;
		this.pendingDelegations = [];
		this.observedDelegationIds = new Set();
		this.publicProgressTraceLogEnabled = process.env.OPENCLAW_GPT_LIVE_PROGRESS_TRACE === "1";
		this.publicProgressTraceEnabled = this.publicProgressTraceLogEnabled || typeof options.onPublicProgressDiagnostic === "function";
		this.publicProgressTraceId = this.publicProgressTraceEnabled ? randomUUID() : void 0;
		this.publicProgressTraceSequence = 0;
		this.publicProgressAppendSequence = 0;
		this.delegationInputsByUserTurn = new Map();
		this.completedUserTurns = new Set();
		this.nativeUserTurnText = new Map();
		this.userTranscriptRevision = 0;
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
		if (event) {
			// The native parser currently omits this observed provider identity.
			// Preserve it at the wire boundary without altering any control frame.
			try {
				const raw = JSON.parse(payload);
				event.userClosingTranscriptUnchanged = this.observeNativeUserTurn(raw);
				const turnId = raw.type === "delegation.created" ? raw.item?.user_bidi_turn_id :
					raw.type === "turn.done" && raw.turn?.role === "user" ? raw.turn.id : void 0;
				if (typeof turnId === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(turnId)) event.userBidiTurnId = turnId;
			} catch {}
			this.handleEvent(event);
		}
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
		this.startDelegation(event.id, event.prompt, event.userBidiTurnId);
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
		if (event.role === "user") {
			if (event.kind !== "transcript-done" || event.userClosingTranscriptUnchanged !== true) this.userTranscriptRevision++;
			if (event.kind === "transcript-done" && typeof event.userBidiTurnId === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(event.userBidiTurnId)) {
				this.completedUserTurns.add(event.userBidiTurnId);
				if (this.completedUserTurns.size > 256) this.completedUserTurns.delete(this.completedUserTurns.values().next().value);
			}
		}
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
	startDelegation(id, input, userBidiTurnId) {
		if (this.stopped || this.options.signal.aborted || !input.trim()) return;
		// A duplicate item cannot denote two tasks. Preserve its accepted work and
		// reject replay without sending failure into that item's original result.
		if (this.observedDelegationIds.has(id)) {
			this.options.logger.warn("OpenAI GPT-Live duplicate delegation item rejected");
			this.tracePublicProgress("delegation-rejected", id, "", { kind: "failure", provenance: { source: "duplicate_item" } });
			return;
		}
		let inputKey;
		if (typeof userBidiTurnId === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(userBidiTurnId)) {
			inputKey = userBidiTurnId + ":" + createHash("sha256").update(input.trim()).digest("hex");
			// A single spoken turn can delegate an early prefix and then changed
			// conditions. Suppress only an identical completed replay after the
			// entire user turn ended and with no later caller transcript. Failed,
			// cancelled and partially delivered work remains eligible for retry.
			const completed = this.delegationInputsByUserTurn.get(inputKey);
			const proof = this.nativeUserTurnText.get(userBidiTurnId);
			if (this.completedUserTurns.has(userBidiTurnId) && completed?.revision === this.userTranscriptRevision &&
				proof?.complete === true && completed.text === proof.text) return;
		}
		const transcript = this.transcript;
		const delegation = {
			id,
			rawInput: input,
			userBidiTurnId, inputKey,
			userTranscriptRevision: this.userTranscriptRevision,
			userTurnTranscriptText: this.nativeUserTurnText.get(userBidiTurnId)?.text,
			callerInputAcceptedAt: Date.now(),
			generation: ++this.issuedDelegationGeneration,
			prompt: buildOpenAIQuicksilverDelegationPrompt({
				input,
				transcript
			})
		};
		// New provider speech is not authorization to cancel an accepted app task.
		// Keep one owner through its complete final and admit other ids in order.
		const identityLimit = this.observedDelegationIds.size >= 1024;
		if (!identityLimit) this.observedDelegationIds.add(id);
		if (identityLimit || Buffer.byteLength(delegation.prompt, "utf8") > 64 * 1024 ||
			this.consultController && this.pendingDelegations.length >= 8) {
			const failure = "The backend task queue could not accept this request. It was not started. Report that limitation honestly; do not claim work is running or complete.";
			this.tracePublicProgress("delegation-rejected", id, failure, { kind: "failure", delegationGeneration: delegation.generation, provenance: { source: "queue_limit" } });
			try { this.sendAppend(id, failure, "speakable", { kind: "failure", delegationGeneration: delegation.generation }); }
			catch (error) { this.options.logger.warn(`OpenAI GPT-Live delegation rejection delivery failed: ${shortFailureReason(error)}`); }
			return;
		}
		this.transcript = [];
		this.partialTranscriptRole = void 0;
		if (this.consultController) {
			this.pendingDelegations.push(delegation);
			return;
		}
		this.launchDelegation(delegation);
	}
	launchDelegation(delegation) {
		if (this.stopped || this.options.signal.aborted) return;
		const controller = new AbortController();
		this.consultController = controller;
		this.activeDelegationId = delegation.id;
		this.delegationGeneration = delegation.generation;
		this.runDelegation(delegation, controller.signal).catch((error) => this.failTerminalDelivery(toErrorObject(error, "OpenAI GPT-Live delegation failed"))).finally(() => {
			if (this.consultController !== controller) return;
			this.consultController = void 0;
			const pending = this.pendingDelegations.shift();
			if (pending) this.launchDelegation(pending);
			else this.activeDelegationId = void 0;
		});
	}
	markStopped() {
		this.cancelQueuedProgress?.();
		this.delegationInputsByUserTurn.clear();
		this.completedUserTurns.clear();
		this.nativeUserTurnText.clear();
		this.pendingDelegations.length = 0;
		this.observedDelegationIds.clear();
		this.stopped = true;
		this.options.signal.removeEventListener("abort", this.onSessionAbort);
		this.pendingDelegation = void 0;
		this.activeDelegationId = void 0;
		this.partialTranscriptRole = void 0;
		this.transcript = [];
	}
	observeNativeUserTurn(raw) {
		if (this.stopped) return false;
		const turnId = raw.type === "turn.delta" ? raw.turn_id : raw.turn?.id;
		if (typeof turnId !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(turnId)) return false;
		if (raw.type === "turn.created" && raw.turn?.role === "user" && typeof raw.turn.transcript === "string") {
			// Independent raw proof only; leave the host transcript projection intact.
			// A new caller turn invalidates old input even if its other projection is late.
			this.userTranscriptRevision++;
			if (Buffer.byteLength(raw.turn.transcript, "utf8") <= 16 * 1024) {
				this.nativeUserTurnText.set(turnId, { text: raw.turn.transcript, complete: false });
				if (this.nativeUserTurnText.size > 256) this.nativeUserTurnText.delete(this.nativeUserTurnText.keys().next().value);
			} else this.nativeUserTurnText.delete(turnId);
		} else if (raw.type === "turn.delta" && typeof raw.delta === "string") {
			const proof = this.nativeUserTurnText.get(turnId);
			if (proof) {
				if (raw.delta) this.userTranscriptRevision++;
				const text = proof.text + raw.delta;
				if (Buffer.byteLength(text, "utf8") <= 16 * 1024) { proof.text = text; proof.complete = false; }
				else this.nativeUserTurnText.delete(turnId);
			}
		} else if (raw.type === "turn.done" && raw.turn?.role === "user" && typeof raw.turn.transcript === "string") {
			const proof = this.nativeUserTurnText.get(turnId);
			// Exact full strings, including whitespace, must agree. A missing prefix,
			// correction or additional condition cannot become a harmless closing done.
			if (proof && proof.text === raw.turn.transcript) { proof.complete = true; proof.completedAt = Date.now(); return true; }
			this.nativeUserTurnText.delete(turnId);
		}
		return false;
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
			generation: Number.isSafeInteger(details.delegationGeneration) && details.delegationGeneration > 0 ? details.delegationGeneration : this.delegationGeneration,
			textSha256: createHash("sha256").update(text).digest("hex"),
			textChars: text.length
		};
		for (const key of ["kind", "appendId", "chunkIndex", "chunkCount", "wireTextChars", "channel"]) {
			if (typeof details[key] === "string" || Number.isSafeInteger(details[key])) event[key] = details[key];
		}
		const consumed = details.steeringConsumed;
		if (stage === "backend-steering-consumed" && consumed &&
			Number.isSafeInteger(consumed.sequence) && consumed.sequence > 0 &&
			Number.isSafeInteger(consumed.count) && consumed.count > 0 && consumed.count <= 16 &&
			typeof consumed.textSha256 === "string" && /^[a-f0-9]{64}$/.test(consumed.textSha256)) {
			event.steeringConsumed = { sequence: consumed.sequence, count: consumed.count, textSha256: consumed.textSha256 };
		}
		if (["progress_pending", "progress_context", "final_part", "final_complete", "failure"].includes(details.role)) event.role = details.role;
		if (typeof details.wireTextSha256 === "string" && /^[a-f0-9]{64}$/.test(details.wireTextSha256)) event.wireTextSha256 = details.wireTextSha256;
		const provenance = details.provenance;
		if (provenance && typeof provenance === "object") {
			event.provenance = {};
			if (["initial", "parent", "child"].includes(provenance.role)) event.provenance.role = provenance.role;
			// Hash the actual host callback identity before structured logging can
			// redact it. Join to the original SSE/tool run; never infer ownership
			// by equating a provider delegation item with a backend run id.
			if (typeof provenance.runId === "string" && /^[a-zA-Z0-9_.:@/-]{1,160}$/.test(provenance.runId)) {
				event.sourceRunIdSha256 = createHash("sha256").update(provenance.runId).digest("hex");
			}
			if (typeof provenance.ownerRunId === "string" && /^[a-zA-Z0-9_.:@/-]{1,160}$/.test(provenance.ownerRunId)) {
				event.ownerRunIdSha256 = createHash("sha256").update(provenance.ownerRunId).digest("hex");
			}
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
	failTerminalDelivery(error) {
		// The current task already ended; close only this delivery owner and its
		// unstarted queue. Do not invent completion or abort unrelated app work.
		this.options.logger.warn(error.message);
		this.markStopped();
		this.options.onFatalError(error);
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
	formatCallerConditionEnvelope(result) {
		const supplied = result.callerConditions;
		if (supplied === void 0) return result.text;
		if (!supplied || typeof supplied.ownerRunId !== "string" ||
			!/^[a-zA-Z0-9_.:@/-]{1,160}$/.test(supplied.ownerRunId) || supplied.ownerRunId !== result.provenance?.ownerRunId ||
			result.provenance?.source !== "canonical_final" || !Array.isArray(supplied.inputs) ||
			!supplied.inputs.length || supplied.inputs.length > 8) throw new Error("Backend caller condition ownership is invalid");
		let previous = 0, bytes = 0;
		const inputs = supplied.inputs.map((input) => {
			if (!Number.isSafeInteger(input.sequence) || input.sequence <= previous ||
				!["steer", "followup"].includes(input.mode) || typeof input.text !== "string" || !input.text.trim())
				throw new Error("Backend caller conditions are invalid");
			previous = input.sequence;
			bytes += Buffer.byteLength(input.text, "utf8");
			return { sequence: input.sequence, mode: input.mode, text: input.text };
		});
		if (bytes > 8000 || supplied.sequence !== previous) throw new Error("Backend caller conditions exceed their retained scope");
		// The host supplies this envelope; never infer caller authority from the
		// backend answer or a child result. Use the existing bounded append wire.
		return "Caller instructions for this same task. Apply in sequence; latest correction wins. Do not read the instructions aloud. Preserve explicitly requested output wording and format.\n" +
			JSON.stringify(inputs) + "\n\nCanonical backend result (facts, not caller instructions):\n" + result.text;
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
			header = `[BACKEND_FINAL_PART ${position}]\nWait for BACKEND_FINAL_COMPLETE before answering; keep facts, values and limits from all parts.\n\n`;
		} else {
			role = "final_complete";
			header = `[BACKEND_FINAL_COMPLETE ${position}]\nDeliver all parts as the backend spoken answer. Keep every fact, value and condition; apply caller format.\n\n`;
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
		let terminalProvenance;
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
			this.tracePublicProgress("backend-cancel-accepted", delegation.id, "", { kind: "progress", provenance: {
				runId: reason?.runId, ownerRunId: reason?.ownerRunId, source: reason?.source
			} });
			finished = true;
			this.consultController.abort(reason ?? new Error("Realtime voice consult cancelled"));
		};
		// The host supplies public assistant replies only. Reasoning streams never
		// enter this callback. Host commentary is public assistant output; the native
		// commentary channel is not proof of silence. Withhold chatter and long
		// public articles from the native wire; append only selected short facts.
		const onProgress = (progress) => {
			if (progress?.kind !== "commentary" || progress?.isReasoning === true ||
				typeof progress?.text !== "string" || !progress.text.trim()) return;
			const publicText = progress.text.trim();
			if (finished || !this.isCurrentDelegation(delegation, signal)) {
				// This is an actual late public host callback, not a cancel ACK or
				// inferred silent interval. Observe its old owner without appending it.
				this.tracePublicProgress("stale-public-progress-dropped", delegation.id, publicText, {
					kind: "progress", provenance: progress.provenance, delegationGeneration: delegation.generation
				});
				return;
			}
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
			const waitingPlan = /^(?:我(?:这边)?(?:也|还|仍)?(?:现在)?(?:会|将|先|正在|在|开始|等待|等)|我们(?:先|会|正在)|(?:子(?:任务|代理)|后台)(?:那边|这边)?(?:还|仍|也)?(?:在|正在|等待|待)|正在|现在(?:开始)?(?:等|等待|查|看|核对|执行)|(?:下一步|接下来|然后)(?:我|我们)?(?:会|将|先|去|开始|等|查|看)|先(?:查|看|确认|核对)|(?:好|行)[，,]?我(?:先)?(?:查|看)|稍等|请稍等|等一下|让我|这边(?:正在|在|先)|I(?:'m| am| will|['’]ll)|(?:Now|Next)(?:[,:]?\s+)(?:I(?: will|['’]ll)|we(?: will|['’]ll)|start|wait|waiting|check)|(?:The |This |That )?(?:sleep|process|job|command|operation|task|sub-?task|child|work)(?: is| remains)? (?:still )?(?:running|sleeping|waiting|pending)\b|(?:It(?:'s| is)|They are) (?:still )?(?:running|sleeping|waiting|pending)\b|(?:Still )?(?:sleeping|waiting|polling)\b|(?:Continuing|Continue) (?:to )?(?:wait|poll)\b|Let me|Please wait|One (?:sec|moment))/iu.test(publicText);
			const setupOnly = /^(?:Read-only\b|All read-only\b|No (?:files? (?:written|were written)|external)|(?:Sub-?task spawned|(?:Task|Job|Command) (?:accepted|started)|Starting (?:step|the next step))\b|子(?:任务|代理)(?:已经|已)?(?:在后台)?(?:启动|派发|交办|受理|执行|运行))/iu.test(publicText);
			// Future/dependency clauses do not turn waiting chatter into a result.
			// This changes eligibility only; the selected public text stays byte-exact.
			const statedResultText = publicText.replace(/\b(?:until(?!\s+(?:now\b|this\s+point\b))|will|would|shall|should)\b(?:[^.!?;。！？；]|\.(?=\d))*|\b(?:wait(?:ing)?|poll(?:ing)?)\s+(?:for|to)\b(?:[^.!?;。！？；]|\.(?=\d))*|\bto\s+(?:complete|finish|confirm|verify|generate|find)\b(?:[^.!?;。！？；]|\.(?=\d))*/giu, "");
			const hasStatedResult = /(?:已(?:经)?(?:找到|查到|确认|核对|完成|收到|得到|生成|发出|测得|读到|验证)|找到了|查到了|确认了|核对出|记录显示|结果(?:是|为)|等于|(?:当前|测得|核验)(?:时间|值)(?:是|为)|(?:found|confirmed|completed|complete|finished|done|generated|verified)\b|(?:has|have) (?:already )?been (?:processed|checked|read|verified|completed)\b|results?(?: (?:is|are)|:)|(?:value|time|price|cost) is\b)/iu.test(statedResultText);
			// A streamed markdown fragment is not an independent stage sentence.
			// In particular, a child result's bare "— YES**" must not displace a fact.
			const structuralFragment = /^(?:全部|所有步骤)(?:已)?完成[，,]以下是[^：:。.]*[：:]$|```|(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|>\s|\d+[.)]\s)|^\s*[-—–*`#\s]*(?:YES|NO|TRUE|FALSE|DONE|OK|MATCH)[-—–*`#.!\s]*$|^\s*\*\*/iu.test(publicText);
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
				callerInputAcceptedAt: delegation.callerInputAcceptedAt,
				continuationIdentity: { delegationItemId: delegation.id, delegationGeneration: delegation.generation },
				onRunStarted: ({ runId, steeringConsumed }) => {
					if (!finished && this.isCurrentDelegation(delegation, signal)) {
						this.tracePublicProgress(steeringConsumed ? "backend-steering-consumed" : "backend-run-started", delegation.id, "", { kind: "progress", provenance: { runId }, steeringConsumed });
					}
				},
				onProgress,
				onCanceled
			});
			if (!this.isCurrentDelegation(delegation, signal)) return;
			if (typeof result?.text !== "string" || !result.text.trim()) throw new Error("Backend returned no complete public result");
			text = result.text;
			terminalProvenance = result.provenance;
			// Preserve the original public result before applying the delivery limit.
			// Byte-safe native chunks already bound individual frames; truncating the
			// whole result would lose late facts while falsely labeling it complete.
			this.tracePublicProgress("backend-final-received", delegation.id, text, { kind: "final", provenance: terminalProvenance });
			text = this.formatCallerConditionEnvelope(result);
			if (result.callerConditions) this.tracePublicProgress("caller-conditions-attached", delegation.id,
				JSON.stringify(result.callerConditions.inputs), { kind: "final", provenance: terminalProvenance });
			if (Buffer.byteLength(text, "utf8") > 16 * 1024) {
				terminalKind = "failure";
				terminalProvenance = void 0;
				text = "The backend result is too long to deliver completely. Tell the user it has not been fully delivered; do not claim completion, summarize unseen parts or invent missing values.";
				this.options.logger.warn("OpenAI GPT-Live complete public result exceeded the 16 KiB delivery limit");
			}
		} catch (error) {
			if (!this.isCurrentDelegation(delegation, signal) || this.options.isCanceledError?.(error)) return;
			this.options.logger.warn(`OpenAI GPT-Live delegation consult failed: ${shortFailureReason(error)}`);
			text = CONSULT_FAILURE_TEXT;
			terminalKind = "failure";
			terminalProvenance = void 0;
		} finally {
			finished = true;
			clearQueuedProgress();
			signal.removeEventListener("abort", clearQueuedProgress);
			if (this.cancelQueuedProgress === clearQueuedProgress) this.cancelQueuedProgress = void 0;
		}
		if (this.isCurrentDelegation(delegation, signal)) {
			const sent = this.sendAppend(delegation.id, text, "speakable", { kind: terminalKind, provenance: terminalProvenance });
			if (!sent) {
				if (this.stopped || this.options.signal.aborted) return;
				this.failTerminalDelivery(new Error("OpenAI GPT-Live terminal result was not delivered"));
				return;
			}
			const proof = this.nativeUserTurnText.get(delegation.userBidiTurnId);
			if (sent && terminalKind === "final" && delegation.inputKey && this.completedUserTurns.has(delegation.userBidiTurnId) &&
				proof?.complete === true && proof.text === delegation.userTurnTranscriptText &&
				delegation.userTranscriptRevision === this.userTranscriptRevision) {
				// Never absorb caller conditions that arrived after this consult accepted.
				this.delegationInputsByUserTurn.set(delegation.inputKey, { revision: delegation.userTranscriptRevision, text: proof.text });
				if (this.delegationInputsByUserTurn.size > 256) this.delegationInputsByUserTurn.delete(this.delegationInputsByUserTurn.keys().next().value);
			}
		}
	}
	sendAppend(delegationId, text, channel, diagnostic = {}) {
		const socket = this.options.getSocket();
		if (this.stopped || !socket || socket.readyState !== WEBSOCKET_OPEN) return false;
		const isPublic = ["progress", "final", "failure"].includes(diagnostic.kind);
		const chunks = isPublic ? this.chunkPublicAppendText(text) : chunkOpenAIQuicksilverAppendText(text);
		const appendId = ++this.publicProgressAppendSequence;
		for (const [chunkIndex, chunk] of chunks.entries()) {
			if (this.stopped || this.options.signal.aborted || socket.readyState !== WEBSOCKET_OPEN) return false;
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
