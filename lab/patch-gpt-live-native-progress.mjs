import assert from "node:assert/strict";

const userTurnProofMethods = `\tobserveNativeUserTurn(raw) {
\t\tif (this.stopped) return false;
\t\tconst turnId = raw.type === "turn.delta" ? raw.turn_id : raw.turn?.id;
\t\tif (typeof turnId !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(turnId)) return false;
\t\tif (raw.type === "turn.created" && raw.turn?.role === "user" && typeof raw.turn.transcript === "string") {
\t\t\t// Independent raw proof only; leave the host transcript projection intact.
\t\t\t// A new caller turn invalidates old input even if its other projection is late.
\t\t\tthis.userTranscriptRevision++;
\t\t\tif (Buffer.byteLength(raw.turn.transcript, "utf8") <= 16 * 1024) {
\t\t\t\tthis.nativeUserTurnText.set(turnId, { text: raw.turn.transcript, complete: false });
\t\t\t\tif (this.nativeUserTurnText.size > 256) this.nativeUserTurnText.delete(this.nativeUserTurnText.keys().next().value);
\t\t\t} else this.nativeUserTurnText.delete(turnId);
\t\t} else if (raw.type === "turn.delta" && typeof raw.delta === "string") {
\t\t\tconst proof = this.nativeUserTurnText.get(turnId);
\t\t\tif (proof) {
\t\t\t\tif (raw.delta) this.userTranscriptRevision++;
\t\t\t\tconst text = proof.text + raw.delta;
\t\t\t\tif (Buffer.byteLength(text, "utf8") <= 16 * 1024) { proof.text = text; proof.complete = false; }
\t\t\t\telse this.nativeUserTurnText.delete(turnId);
\t\t\t}
\t\t} else if (raw.type === "turn.done" && raw.turn?.role === "user" && typeof raw.turn.transcript === "string") {
\t\t\tconst proof = this.nativeUserTurnText.get(turnId);
\t\t\t// Exact full strings, including whitespace, must agree. A missing prefix,
\t\t\t// correction or additional condition cannot become a harmless closing done.
\t\t\tif (proof && proof.text === raw.turn.transcript) { proof.complete = true; proof.completedAt = Date.now(); return true; }
\t\t\tthis.nativeUserTurnText.delete(turnId);
\t\t}
\t\treturn false;
\t}
`;

const diagnosticMethods = `\ttracePublicProgress(stage, delegationId, text, details = {}) {
\t\tif (!this.publicProgressTraceEnabled || !["progress", "final", "failure"].includes(details.kind)) return;
\t\t// Diagnostics carry public text fingerprints only. Do not copy arbitrary
\t\t// callback fields, prompts, reasoning, credentials or account metadata.
\t\tconst event = {
\t\t\tversion: 1,
\t\t\tstage,
\t\t\tat: Date.now(),
\t\t\ttraceId: this.publicProgressTraceId,
\t\t\tsequence: ++this.publicProgressTraceSequence,
\t\t\tdelegationId,
\t\t\tgeneration: Number.isSafeInteger(details.delegationGeneration) && details.delegationGeneration > 0 ? details.delegationGeneration : this.delegationGeneration,
\t\t\ttextSha256: createHash("sha256").update(text).digest("hex"),
\t\t\ttextChars: text.length
\t\t};
\t\tfor (const key of ["kind", "appendId", "chunkIndex", "chunkCount", "wireTextChars", "channel"]) {
\t\t\tif (typeof details[key] === "string" || Number.isSafeInteger(details[key])) event[key] = details[key];
\t\t}
\t\tconst consumed = details.steeringConsumed;
\t\tif (stage === "backend-steering-consumed" && consumed &&
\t\t\tNumber.isSafeInteger(consumed.sequence) && consumed.sequence > 0 &&
\t\t\tNumber.isSafeInteger(consumed.count) && consumed.count > 0 && consumed.count <= 16 &&
\t\t\ttypeof consumed.textSha256 === "string" && /^[a-f0-9]{64}$/.test(consumed.textSha256)) {
\t\t\tevent.steeringConsumed = { sequence: consumed.sequence, count: consumed.count, textSha256: consumed.textSha256 };
\t\t}
\t\tif (["progress_pending", "progress_context", "final_part", "final_complete", "failure"].includes(details.role)) event.role = details.role;
\t\tif (typeof details.wireTextSha256 === "string" && /^[a-f0-9]{64}$/.test(details.wireTextSha256)) event.wireTextSha256 = details.wireTextSha256;
\t\tconst provenance = details.provenance;
\t\tif (provenance && typeof provenance === "object") {
\t\t\tevent.provenance = {};
\t\t\tif (["initial", "parent", "child"].includes(provenance.role)) event.provenance.role = provenance.role;
\t\t\t// Hash the actual host callback identity before structured logging can
\t\t\t// redact it. Join to the original SSE/tool run; never infer ownership
\t\t\t// by equating a provider delegation item with a backend run id.
\t\t\tif (typeof provenance.runId === "string" && /^[a-zA-Z0-9_.:@/-]{1,160}$/.test(provenance.runId)) {
\t\t\t\tevent.sourceRunIdSha256 = createHash("sha256").update(provenance.runId).digest("hex");
\t\t\t}
\t\t\tif (typeof provenance.ownerRunId === "string" && /^[a-zA-Z0-9_.:@/-]{1,160}$/.test(provenance.ownerRunId)) {
\t\t\t\tevent.ownerRunIdSha256 = createHash("sha256").update(provenance.ownerRunId).digest("hex");
\t\t\t}
\t\t\tfor (const key of ["runId", "source", "itemId"]) {
\t\t\t\tconst value = provenance[key];
\t\t\t\tif (typeof value === "string" && /^[a-zA-Z0-9_.:@/-]{1,160}$/.test(value)) event.provenance[key] = value;
\t\t\t}
\t\t\tfor (const key of ["emittedAt", "sequence"]) {
\t\t\t\tif (Number.isSafeInteger(provenance[key]) && provenance[key] >= 0) event.provenance[key] = provenance[key];
\t\t\t}
\t\t}
\t\t// An observer must never change delivery or cancel accepted backend work.
\t\ttry {
\t\t\tconst pending = this.options.onPublicProgressDiagnostic?.(event);
\t\t\tif (pending && typeof pending.catch === "function") pending.catch(() => {});
\t\t} catch {}
\t\tif (this.publicProgressTraceLogEnabled) {
\t\t\ttry { this.options.logger.info?.(\`GPT_LIVE_PUBLIC_PROGRESS \${JSON.stringify(event)}\`); } catch {}
\t\t}
\t}
`;

const publicWireMethods = `\tfailTerminalDelivery(error) {
\t\t// The current task already ended; close only this delivery owner and its
\t\t// unstarted queue. Do not invent completion or abort unrelated app work.
\t\tthis.options.logger.warn(error.message);
\t\tthis.markStopped();
\t\tthis.options.onFatalError(error);
\t}
\tchunkPublicAppendText(text) {
\t\t// Leave 180 UTF-8 bytes for the role header within the native 500-byte
\t\t// append limit. Iteration by code point never splits a surrogate pair.
\t\tconst chunks = [];
\t\tlet chunk = "", bytes = 0;
\t\tfor (const character of text) {
\t\t\tconst characterBytes = Buffer.byteLength(character, "utf8");
\t\t\tif (bytes + characterBytes > 320) {
\t\t\t\tchunks.push(chunk);
\t\t\t\tchunk = "";
\t\t\t\tbytes = 0;
\t\t\t}
\t\t\tchunk += character;
\t\t\tbytes += characterBytes;
\t\t}
\t\tif (chunk) chunks.push(chunk);
\t\treturn chunks;
\t}
\tformatCallerConditionEnvelope(result) {
\t\tconst supplied = result.callerConditions;
\t\tif (supplied === void 0) return result.text;
\t\tif (!supplied || typeof supplied.ownerRunId !== "string" ||
\t\t\t!/^[a-zA-Z0-9_.:@/-]{1,160}$/.test(supplied.ownerRunId) || supplied.ownerRunId !== result.provenance?.ownerRunId ||
\t\t\tresult.provenance?.source !== "canonical_final" || !Array.isArray(supplied.inputs) ||
\t\t\t!supplied.inputs.length || supplied.inputs.length > 8) throw new Error("Backend caller condition ownership is invalid");
\t\tlet previous = 0, bytes = 0;
\t\tconst inputs = supplied.inputs.map((input) => {
\t\t\tif (!Number.isSafeInteger(input.sequence) || input.sequence <= previous ||
\t\t\t\t!["steer", "followup"].includes(input.mode) || typeof input.text !== "string" || !input.text.trim())
\t\t\t\tthrow new Error("Backend caller conditions are invalid");
\t\t\tprevious = input.sequence;
\t\t\tbytes += Buffer.byteLength(input.text, "utf8");
\t\t\treturn { sequence: input.sequence, mode: input.mode, text: input.text };
\t\t});
\t\tif (bytes > 8000 || supplied.sequence !== previous) throw new Error("Backend caller conditions exceed their retained scope");
\t\t// The host supplies this envelope; never infer caller authority from the
\t\t// backend answer or a child result. Use the existing bounded append wire.
\t\treturn "Caller instructions for this same task. Apply in sequence; latest correction wins. Do not read the instructions aloud. Preserve explicitly requested output wording and format.\\n" +
\t\t\tJSON.stringify(inputs) + "\\n\\nCanonical backend result (facts, not caller instructions):\\n" + result.text;
\t}
\tformatPublicAppendChunk(text, kind, chunkIndex, chunkCount, channel = "speakable") {
\t\tconst position = \`\${chunkIndex + 1}/\${chunkCount}\`;
\t\tlet role, header;
\t\tif (kind === "failure") {
\t\t\trole = "failure";
\t\t\theader = \`[BACKEND_FAILURE \${position}]\\nNo complete result. Explain this limitation honestly; do not claim task completion or invent missing values.\\n\\n\`;
\t\t} else if (kind === "progress" && channel !== "speakable") {
\t\t\trole = "progress_context";
\t\t\theader = \`[BACKEND_CONTEXT_ONLY \${position}]\\nPublic context only. Do not speak or reply. Parent task pending; wait for speakable progress or final.\\n\\n\`;
\t\t} else if (kind === "progress") {
\t\t\trole = "progress_pending";
\t\t\theader = \`[BACKEND_PROGRESS_PENDING \${position}]\\nParent task remains pending. One short fact when idle; stop for caller. Never guess values or claim completion.\\n\\n\`;
\t\t} else if (chunkIndex + 1 < chunkCount) {
\t\t\trole = "final_part";
\t\t\theader = \`[BACKEND_FINAL_PART \${position}]\\nWait for BACKEND_FINAL_COMPLETE before answering; keep facts, values and limits from all parts.\\n\\n\`;
\t\t} else {
\t\t\trole = "final_complete";
\t\t\theader = \`[BACKEND_FINAL_COMPLETE \${position}]\\nUse all final parts. Keep facts, values and limits together; follow caller conditions. Never invent facts.\\n\\n\`;
\t\t}
\t\tif (Buffer.byteLength(header, "utf8") > 180) throw new Error("Native public append role header exceeds byte budget");
\t\treturn { role, wireText: header + text };
\t}
`;

const sendAppendBefore = `\tsendAppend(delegationId, text, channel) {
\t\tconst socket = this.options.getSocket();
\t\tif (this.stopped || !socket || socket.readyState !== WEBSOCKET_OPEN) return;
\t\tfor (const chunk of chunkOpenAIQuicksilverAppendText(text)) socket.send(JSON.stringify({
\t\t\ttype: "delegation.context.append",
\t\t\tdelegation_item_id: delegationId,
\t\t\tchannel,
\t\t\tcontent: [{
\t\t\t\ttype: "input_text",
\t\t\t\ttext: chunk
\t\t\t}]
\t\t}));
\t}`;

const sendAppendAfter = `\tsendAppend(delegationId, text, channel, diagnostic = {}) {
\t\tconst socket = this.options.getSocket();
\t\tif (this.stopped || !socket || socket.readyState !== WEBSOCKET_OPEN) return false;
\t\tconst isPublic = ["progress", "final", "failure"].includes(diagnostic.kind);
\t\tconst chunks = isPublic ? this.chunkPublicAppendText(text) : chunkOpenAIQuicksilverAppendText(text);
\t\tconst appendId = ++this.publicProgressAppendSequence;
\t\tfor (const [chunkIndex, chunk] of chunks.entries()) {
\t\t\tif (this.stopped || this.options.signal.aborted || socket.readyState !== WEBSOCKET_OPEN) return false;
\t\t\tconst { role, wireText } = isPublic ? this.formatPublicAppendChunk(chunk, diagnostic.kind, chunkIndex, chunks.length, channel) : { wireText: chunk };
\t\t\tconst frame = {
\t\t\t\ttype: "delegation.context.append",
\t\t\t\tdelegation_item_id: delegationId,
\t\t\t\tchannel,
\t\t\t\tcontent: [{ type: "input_text", text: wireText }]
\t\t\t};
\t\t\tsocket.send(JSON.stringify(frame));
\t\t\t// Fingerprint the content of the actual successfully sent frame. The
\t\t\t// body hash remains joinable to public callback provenance.
\t\t\tthis.tracePublicProgress("context-append-sent", delegationId, chunk, {
\t\t\t\t...diagnostic, channel, appendId, chunkIndex, chunkCount: chunks.length, role,
\t\t\t\twireTextSha256: createHash("sha256").update(frame.content[0].text).digest("hex"),
\t\t\t\twireTextChars: frame.content[0].text.length
\t\t\t});
\t\t}
\t\treturn chunks.length > 0;
\t}`;

const runDelegationBefore = `\tasync runDelegation(delegation, signal) {
\t\tlet text;
\t\ttry {
\t\t\tconst result = await this.options.runAgentConsult({
\t\t\t\tprompt: delegation.prompt,
\t\t\t\tsignal
\t\t\t});
\t\t\tif (signal.aborted) return;
\t\t\ttext = boundOpenAIQuicksilverDelegationResult(result.text);
\t\t} catch (error) {
\t\t\tif (signal.aborted || this.options.isCanceledError?.(error)) return;
\t\t\tthis.options.logger.warn(\`OpenAI GPT-Live delegation consult failed: \${shortFailureReason(error)}\`);
\t\t\ttext = CONSULT_FAILURE_TEXT;
\t\t}
\t\tthis.sendAppend(delegation.id, text, "speakable");
\t}`;

const runDelegationAfter = `\tisCurrentDelegation(delegation, signal) {
\t\treturn !this.stopped && !this.options.signal.aborted && !signal.aborted &&
\t\t\tthis.activeDelegationId === delegation.id && this.delegationGeneration === delegation.generation;
\t}
\tasync runDelegation(delegation, signal) {
\t\tlet text;
\t\tlet terminalKind = "final";
\t\tlet terminalProvenance;
\t\tlet finished = false;
\t\tconst seenProgress = new Set();
\t\tlet queuedProgress;
\t\tlet progressTimer;
\t\tconst clearQueuedProgress = () => {
\t\t\tclearTimeout(progressTimer);
\t\t\tprogressTimer = void 0;
\t\t\tqueuedProgress = void 0;
\t\t};
\t\tthis.cancelQueuedProgress = clearQueuedProgress;
\t\tsignal.addEventListener("abort", clearQueuedProgress, { once: true });
\t\tconst deliverProgress = (progress, channel) => {
\t\t\ttry {
\t\t\t\tif (!this.sendAppend(delegation.id, progress.text, channel, { kind: "progress", provenance: progress.provenance })) return false;
\t\t\t\tif (channel === "speakable") this.lastSpokenProgressAt = Date.now();
\t\t\t\treturn true;
\t\t\t} catch (error) {
\t\t\t\tthis.options.logger.warn(\`OpenAI GPT-Live progress delivery failed: \${shortFailureReason(error)}\`);
\t\t\t\treturn false;
\t\t\t}
\t\t};
\t\tconst queueProgress = (progress) => {
\t\t\t// Retain one latest public fact rather than reading a backlog. It has not
\t\t\t// been appended yet, so its later speech is not a duplicated context body.
\t\t\tqueuedProgress = progress;
\t\t\tif (progressTimer) return;
\t\t\tprogressTimer = setTimeout(() => {
\t\t\t\tprogressTimer = void 0;
\t\t\t\tconst latest = queuedProgress;
\t\t\t\tqueuedProgress = void 0;
\t\t\t\tif (!latest || finished || !this.isCurrentDelegation(delegation, signal)) return;
\t\t\t\tdeliverProgress(latest, "speakable");
\t\t\t}, Math.max(1, 15000 - (Date.now() - this.lastSpokenProgressAt)));
\t\t\tprogressTimer.unref?.();
\t\t};
\t\t// Only an exact, authorized host cancellation can revoke this delivery
\t\t// owner. Never infer cancellation from generic worker error strings.
\t\tconst onCanceled = (reason) => {
\t\t\tif (finished || !this.isCurrentDelegation(delegation, signal) ||
\t\t\t\tthis.consultController?.signal !== signal) return;
\t\t\tthis.tracePublicProgress("backend-cancel-accepted", delegation.id, "", { kind: "progress", provenance: {
\t\t\t\trunId: reason?.runId, ownerRunId: reason?.ownerRunId, source: reason?.source
\t\t\t} });
\t\t\tfinished = true;
\t\t\tthis.consultController.abort(reason ?? new Error("Realtime voice consult cancelled"));
\t\t};
\t\t// The host supplies public assistant replies only. Reasoning streams never
\t\t// enter this callback. Host commentary is public assistant output; the native
\t\t// commentary channel is not proof of silence. Withhold chatter and long
\t\t// public articles from the native wire; append only selected short facts.
\t\tconst onProgress = (progress) => {
\t\t\tif (progress?.kind !== "commentary" || progress?.isReasoning === true ||
\t\t\t\ttypeof progress?.text !== "string" || !progress.text.trim()) return;
\t\t\tconst publicText = progress.text.trim();
\t\t\tif (finished || !this.isCurrentDelegation(delegation, signal)) {
\t\t\t\t// This is an actual late public host callback, not a cancel ACK or
\t\t\t\t// inferred silent interval. Observe its old owner without appending it.
\t\t\t\tthis.tracePublicProgress("stale-public-progress-dropped", delegation.id, publicText, {
\t\t\t\t\tkind: "progress", provenance: progress.provenance, delegationGeneration: delegation.generation
\t\t\t\t});
\t\t\t\treturn;
\t\t\t}
\t\t\tthis.tracePublicProgress("public-progress-received", delegation.id, publicText, { kind: "progress", provenance: progress.provenance });
\t\t\tconst fingerprint = createHash("sha256").update(publicText).digest("hex");
\t\t\tif (seenProgress.has(fingerprint)) return;
\t\t\t// Backend work retains its own context. Sending an ineligible article on
\t\t\t// commentary can still provoke speech, despite a context-only instruction.
\t\t\t// Backend result grounding is a prompt/acceptance contract; this semantic
\t\t\t// chatter filter does not prove arbitrary assistant text is verified.
\t\t\tconst now = Date.now();
\t\t\t// Ordinary short public facts need no special wording. Suppress clear
\t\t\t// waiting/setup statements; an actual result within one takes priority.
\t\t\tconst waitingPlan = /^(?:我(?:这边)?(?:也|还|仍)?(?:现在)?(?:会|将|先|正在|在|开始|等待|等)|我们(?:先|会|正在)|(?:子(?:任务|代理)|后台)(?:那边|这边)?(?:还|仍|也)?(?:在|正在|等待|待)|正在|现在(?:开始)?(?:等|等待|查|看|核对|执行)|(?:下一步|接下来|然后)(?:我|我们)?(?:会|将|先|去|开始|等|查|看)|先(?:查|看|确认|核对)|(?:好|行)[，,]?我(?:先)?(?:查|看)|稍等|请稍等|等一下|让我|这边(?:正在|在|先)|I(?:'m| am| will|['’]ll)|(?:Now|Next)(?:[,:]?\\s+)(?:I(?: will|['’]ll)|we(?: will|['’]ll)|start|wait|waiting|check)|(?:The |This |That )?(?:sleep|process|job|command|operation|task|sub-?task|child|work)(?: is| remains)? (?:still )?(?:running|sleeping|waiting|pending)\\b|(?:It(?:'s| is)|They are) (?:still )?(?:running|sleeping|waiting|pending)\\b|(?:Still )?(?:sleeping|waiting|polling)\\b|(?:Continuing|Continue) (?:to )?(?:wait|poll)\\b|Let me|Please wait|One (?:sec|moment))/iu.test(publicText);
\t\t\tconst setupOnly = /^(?:Read-only\\b|All read-only\\b|No (?:files? (?:written|were written)|external)|(?:Sub-?task spawned|(?:Task|Job|Command) (?:accepted|started)|Starting (?:step|the next step))\\b|子(?:任务|代理)(?:已经|已)?(?:在后台)?(?:启动|派发|交办|受理|执行|运行))/iu.test(publicText);
\t\t\t// Future/dependency clauses do not turn waiting chatter into a result.
\t\t\t// This changes eligibility only; the selected public text stays byte-exact.
\t\t\tconst statedResultText = publicText.replace(/\\b(?:until(?!\\s+(?:now\\b|this\\s+point\\b))|will|would|shall|should)\\b(?:[^.!?;。！？；]|\\.(?=\\d))*|\\b(?:wait(?:ing)?|poll(?:ing)?)\\s+(?:for|to)\\b(?:[^.!?;。！？；]|\\.(?=\\d))*|\\bto\\s+(?:complete|finish|confirm|verify|generate|find)\\b(?:[^.!?;。！？；]|\\.(?=\\d))*/giu, "");
\t\t\tconst hasStatedResult = /(?:已(?:经)?(?:找到|查到|确认|核对|完成|收到|得到|生成|发出|测得|读到|验证)|找到了|查到了|确认了|核对出|记录显示|结果(?:是|为)|等于|(?:当前|测得|核验)(?:时间|值)(?:是|为)|(?:found|confirmed|completed|complete|finished|done|generated|verified)\\b|(?:has|have) (?:already )?been (?:processed|checked|read|verified|completed)\\b|results?(?: (?:is|are)|:)|(?:value|time|price|cost) is\\b)/iu.test(statedResultText);
\t\t\t// A streamed markdown fragment is not an independent stage sentence.
\t\t\t// In particular, a child result's bare "— YES**" must not displace a fact.
\t\t\tconst structuralFragment = /^(?:全部|所有步骤)(?:已)?完成[，,]以下是[^：:。.]*[：:]$|\u0060\u0060\u0060|(?:^|\\n)\\s*(?:#{1,6}\\s|[-*+]\\s|>\\s|\\d+[.)]\\s)|^\\s*[-—–*\u0060#\\s]*(?:YES|NO|TRUE|FALSE|DONE|OK|MATCH)[-—–*\u0060#.!\\s]*$|^\\s*\\*\\*/iu.test(publicText);
\t\t\tconst speechEligible = !structuralFragment && (!(waitingPlan || setupOnly) || hasStatedResult) && Buffer.byteLength(publicText, "utf8") <= 320;
\t\t\tconst selected = { text: publicText, provenance: progress.provenance };
\t\t\tif (speechEligible) {
\t\t\t\tif (now - this.lastSpokenProgressAt < 15000) queueProgress(selected);
\t\t\t\telse {
\t\t\t\t\tclearQueuedProgress();
\t\t\t\t\tif (!deliverProgress(selected, "speakable")) return;
\t\t\t\t}
\t\t\t}
\t\t\tseenProgress.add(fingerprint);
\t\t\tif (seenProgress.size > 256) seenProgress.delete(seenProgress.values().next().value);
\t\t};
\t\ttry {
\t\t\tconst result = await this.options.runAgentConsult({
\t\t\t\tprompt: delegation.prompt,
\t\t\t\tsignal,
\t\t\t\tcallerInputAcceptedAt: delegation.callerInputAcceptedAt,
\t\t\t\tcontinuationIdentity: { delegationItemId: delegation.id, delegationGeneration: delegation.generation },
\t\t\t\tonRunStarted: ({ runId, steeringConsumed }) => {
\t\t\t\t\tif (!finished && this.isCurrentDelegation(delegation, signal)) {
\t\t\t\t\t\tthis.tracePublicProgress(steeringConsumed ? "backend-steering-consumed" : "backend-run-started", delegation.id, "", { kind: "progress", provenance: { runId }, steeringConsumed });
\t\t\t\t\t}
\t\t\t\t},
\t\t\t\tonProgress,
\t\t\t\tonCanceled
\t\t\t});
\t\t\tif (!this.isCurrentDelegation(delegation, signal)) return;
\t\t\tif (typeof result?.text !== "string" || !result.text.trim()) throw new Error("Backend returned no complete public result");
\t\t\ttext = result.text;
\t\t\tterminalProvenance = result.provenance;
\t\t\t// Preserve the original public result before applying the delivery limit.
\t\t\t// Byte-safe native chunks already bound individual frames; truncating the
\t\t\t// whole result would lose late facts while falsely labeling it complete.
\t\t\tthis.tracePublicProgress("backend-final-received", delegation.id, text, { kind: "final", provenance: terminalProvenance });
\t\t\ttext = this.formatCallerConditionEnvelope(result);
\t\t\tif (result.callerConditions) this.tracePublicProgress("caller-conditions-attached", delegation.id,
\t\t\t\tJSON.stringify(result.callerConditions.inputs), { kind: "final", provenance: terminalProvenance });
\t\t\tif (Buffer.byteLength(text, "utf8") > 16 * 1024) {
\t\t\t\tterminalKind = "failure";
\t\t\t\tterminalProvenance = void 0;
\t\t\t\ttext = "The backend result is too long to deliver completely. Tell the user it has not been fully delivered; do not claim completion, summarize unseen parts or invent missing values.";
\t\t\t\tthis.options.logger.warn("OpenAI GPT-Live complete public result exceeded the 16 KiB delivery limit");
\t\t\t}
\t\t} catch (error) {
\t\t\tif (!this.isCurrentDelegation(delegation, signal) || this.options.isCanceledError?.(error)) return;
\t\t\tthis.options.logger.warn(\`OpenAI GPT-Live delegation consult failed: \${shortFailureReason(error)}\`);
\t\t\ttext = CONSULT_FAILURE_TEXT;
\t\t\tterminalKind = "failure";
\t\t\tterminalProvenance = void 0;
\t\t} finally {
\t\t\tfinished = true;
\t\t\tclearQueuedProgress();
\t\t\tsignal.removeEventListener("abort", clearQueuedProgress);
\t\t\tif (this.cancelQueuedProgress === clearQueuedProgress) this.cancelQueuedProgress = void 0;
\t\t}
\t\tif (this.isCurrentDelegation(delegation, signal)) {
\t\t\tconst sent = this.sendAppend(delegation.id, text, "speakable", { kind: terminalKind, provenance: terminalProvenance });
\t\t\tif (!sent) {
\t\t\t\tif (this.stopped || this.options.signal.aborted) return;
\t\t\t\tthis.failTerminalDelivery(new Error("OpenAI GPT-Live terminal result was not delivered"));
\t\t\t\treturn;
\t\t\t}
\t\t\tconst proof = this.nativeUserTurnText.get(delegation.userBidiTurnId);
\t\t\tif (sent && terminalKind === "final" && delegation.inputKey && this.completedUserTurns.has(delegation.userBidiTurnId) &&
\t\t\t\tproof?.complete === true && proof.text === delegation.userTurnTranscriptText &&
\t\t\t\tdelegation.userTranscriptRevision === this.userTranscriptRevision) {
\t\t\t\t// Never absorb caller conditions that arrived after this consult accepted.
\t\t\t\tthis.delegationInputsByUserTurn.set(delegation.inputKey, { revision: delegation.userTranscriptRevision, text: proof.text });
\t\t\t\tif (this.delegationInputsByUserTurn.size > 256) this.delegationInputsByUserTurn.delete(this.delegationInputsByUserTurn.keys().next().value);
\t\t\t}
\t\t}
\t}`;

function replaceOnce(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} must match exactly once; refresh the VLab baseline before applying`);
  return source.replace(before, after);
}

export function patchGptLiveNativeProgress(source) {
  let patched = `import { createHash, randomUUID } from "node:crypto";\n${source}`;
  patched = replaceOnce(patched, "\t\tthis.stopped = false;", `\t\tthis.stopped = false;
\t\tthis.delegationGeneration = 0;
\t\tthis.issuedDelegationGeneration = 0;
\t\tthis.pendingDelegations = [];
\t\tthis.observedDelegationIds = new Set();
\t\tthis.publicProgressTraceLogEnabled = process.env.OPENCLAW_GPT_LIVE_PROGRESS_TRACE === "1";
\t\tthis.publicProgressTraceEnabled = this.publicProgressTraceLogEnabled || typeof options.onPublicProgressDiagnostic === "function";
\t\tthis.publicProgressTraceId = this.publicProgressTraceEnabled ? randomUUID() : void 0;
\t\tthis.publicProgressTraceSequence = 0;
\t\tthis.publicProgressAppendSequence = 0;
\t\tthis.delegationInputsByUserTurn = new Map();
\t\tthis.completedUserTurns = new Set();
\t\tthis.nativeUserTurnText = new Map();
\t\tthis.userTranscriptRevision = 0;
\t\tthis.lastSpokenProgressAt = -Infinity;`, "delegation generation and opt-in diagnostic initialization");
  patched = replaceOnce(patched, "\t\tif (event) this.handleEvent(event);", `\t\tif (event) {
\t\t\t// The native parser currently omits this observed provider identity.
\t\t\t// Preserve it at the wire boundary without altering any control frame.
\t\t\ttry {
\t\t\t\tconst raw = JSON.parse(payload);
\t\t\t\tevent.userClosingTranscriptUnchanged = this.observeNativeUserTurn(raw);
\t\t\t\tconst turnId = raw.type === "delegation.created" ? raw.item?.user_bidi_turn_id :
\t\t\t\t\traw.type === "turn.done" && raw.turn?.role === "user" ? raw.turn.id : void 0;
\t\t\t\tif (typeof turnId === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(turnId)) event.userBidiTurnId = turnId;
\t\t\t} catch {}
\t\t\tthis.handleEvent(event);
\t\t}`, "preserve observed native user-turn identity");
  patched = replaceOnce(patched, "\t\tthis.startDelegation(event.id, event.prompt);", "\t\tthis.startDelegation(event.id, event.prompt, event.userBidiTurnId);", "native delegation input identity");
  patched = replaceOnce(patched, "\tappendTranscript(event) {\n\t\tconst last", `\tappendTranscript(event) {
\t\tif (event.role === "user") {
\t\t\tif (event.kind !== "transcript-done" || event.userClosingTranscriptUnchanged !== true) this.userTranscriptRevision++;
\t\t\tif (event.kind === "transcript-done" && typeof event.userBidiTurnId === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(event.userBidiTurnId)) {
\t\t\t\tthis.completedUserTurns.add(event.userBidiTurnId);
\t\t\t\tif (this.completedUserTurns.size > 256) this.completedUserTurns.delete(this.completedUserTurns.values().next().value);
\t\t\t}
\t\t}
\t\tconst last`, "record complete user turn without merging new caller input");
  patched = replaceOnce(patched, "\tstartDelegation(id, input) {\n\t\tif (this.stopped || this.options.signal.aborted || !input.trim()) return;", `\tstartDelegation(id, input, userBidiTurnId) {
\t\tif (this.stopped || this.options.signal.aborted || !input.trim()) return;
\t\t// A duplicate item cannot denote two tasks. Preserve its accepted work and
\t\t// reject replay without sending failure into that item's original result.
\t\tif (this.observedDelegationIds.has(id)) {
\t\t\tthis.options.logger.warn("OpenAI GPT-Live duplicate delegation item rejected");
\t\t\tthis.tracePublicProgress("delegation-rejected", id, "", { kind: "failure", provenance: { source: "duplicate_item" } });
\t\t\treturn;
\t\t}
\t\tlet inputKey;
\t\tif (typeof userBidiTurnId === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(userBidiTurnId)) {
\t\t\tinputKey = userBidiTurnId + ":" + createHash("sha256").update(input.trim()).digest("hex");
\t\t\t// A single spoken turn can delegate an early prefix and then changed
\t\t\t// conditions. Suppress only an identical completed replay after the
\t\t\t// entire user turn ended and with no later caller transcript. Failed,
\t\t\t// cancelled and partially delivered work remains eligible for retry.
\t\t\tconst completed = this.delegationInputsByUserTurn.get(inputKey);
\t\t\tconst proof = this.nativeUserTurnText.get(userBidiTurnId);
\t\t\tif (this.completedUserTurns.has(userBidiTurnId) && completed?.revision === this.userTranscriptRevision &&
\t\t\t\tproof?.complete === true && completed.text === proof.text) return;
\t\t}`, "idempotent same-input provider replay");
  patched = replaceOnce(patched, "\t\tconst transcript = this.transcript;\n\t\tthis.transcript = [];\n\t\tthis.partialTranscriptRole = void 0;", "\t\tconst transcript = this.transcript;", "retain transcript until the queued request is admitted");
  patched = replaceOnce(patched, "\t\tconst delegation = {\n\t\t\tid,", "\t\tconst delegation = {\n\t\t\tid,\n\t\t\trawInput: input,\n\t\t\tuserBidiTurnId, inputKey,\n\t\t\tuserTranscriptRevision: this.userTranscriptRevision,\n\t\t\tuserTurnTranscriptText: this.nativeUserTurnText.get(userBidiTurnId)?.text,\n\t\t\tcallerInputAcceptedAt: Date.now(),\n\t\t\tgeneration: ++this.issuedDelegationGeneration,", "delegation generation ownership");
  patched = replaceOnce(patched, "\t\tthis.activeDelegationId = id;\n\t\tif (this.consultController) {\n\t\t\tthis.pendingDelegation = delegation;\n\t\t\tthis.consultController.abort(/* @__PURE__ */ new Error(\"GPT-Live delegation superseded\"));\n\t\t\treturn;\n\t\t}\n\t\tthis.launchDelegation(delegation);", `\t\t// New provider speech is not authorization to cancel an accepted app task.
\t\t// Keep one owner through its complete final and admit other ids in order.
\t\tconst identityLimit = this.observedDelegationIds.size >= 1024;
\t\tif (!identityLimit) this.observedDelegationIds.add(id);
\t\tif (identityLimit || Buffer.byteLength(delegation.prompt, "utf8") > 64 * 1024 ||
\t\t\tthis.consultController && this.pendingDelegations.length >= 8) {
\t\t\tconst failure = "The backend task queue could not accept this request. It was not started. Report that limitation honestly; do not claim work is running or complete.";
\t\t\tthis.tracePublicProgress("delegation-rejected", id, failure, { kind: "failure", delegationGeneration: delegation.generation, provenance: { source: "queue_limit" } });
\t\t\ttry { this.sendAppend(id, failure, "speakable", { kind: "failure", delegationGeneration: delegation.generation }); }
\t\t\tcatch (error) { this.options.logger.warn(\`OpenAI GPT-Live delegation rejection delivery failed: \${shortFailureReason(error)}\`); }
\t\t\treturn;
\t\t}
\t\tthis.transcript = [];
\t\tthis.partialTranscriptRole = void 0;
\t\tif (this.consultController) {
\t\t\tthis.pendingDelegations.push(delegation);
\t\t\treturn;
\t\t}
\t\tthis.launchDelegation(delegation);`, "preserve accepted work with bounded native delegation FIFO");
  patched = replaceOnce(patched, "\t\tthis.consultController = controller;\n\t\tthis.activeDelegationId = delegation.id;", "\t\tthis.consultController = controller;\n\t\tthis.activeDelegationId = delegation.id;\n\t\tthis.delegationGeneration = delegation.generation;", "advance active generation only at task launch");
  patched = replaceOnce(patched, "\t\t\tconst pending = this.pendingDelegation;\n\t\t\tthis.pendingDelegation = void 0;", "\t\t\tconst pending = this.pendingDelegations.shift();", "launch every queued delegation in arrival order");
  patched = replaceOnce(patched, ".catch((error) => this.fail(toErrorObject(error, \"OpenAI GPT-Live delegation failed\")))", ".catch((error) => this.failTerminalDelivery(toErrorObject(error, \"OpenAI GPT-Live delegation failed\")))", "close FIFO delivery after a failed terminal send");
  patched = replaceOnce(patched, runDelegationBefore, `${userTurnProofMethods}${diagnosticMethods}${publicWireMethods}${runDelegationAfter}`, "native consult progress and terminal delivery");
  patched = replaceOnce(patched, "\tmarkStopped() {\n\t\tthis.stopped = true;", "\tmarkStopped() {\n\t\tthis.cancelQueuedProgress?.();\n\t\tthis.delegationInputsByUserTurn.clear();\n\t\tthis.completedUserTurns.clear();\n\t\tthis.nativeUserTurnText.clear();\n\t\tthis.pendingDelegations.length = 0;\n\t\tthis.observedDelegationIds.clear();\n\t\tthis.stopped = true;", "stop queued progress without canceling detached work");
  return replaceOnce(patched, sendAppendBefore, sendAppendAfter, "native public append roles and successful wire boundary");
}
