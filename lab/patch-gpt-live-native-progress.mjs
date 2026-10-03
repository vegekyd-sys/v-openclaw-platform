import assert from "node:assert/strict";

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
\t\t\tgeneration: this.delegationGeneration,
\t\t\ttextSha256: createHash("sha256").update(text).digest("hex"),
\t\t\ttextChars: text.length
\t\t};
\t\tfor (const key of ["kind", "appendId", "chunkIndex", "chunkCount", "wireTextChars", "channel"]) {
\t\t\tif (typeof details[key] === "string" || Number.isSafeInteger(details[key])) event[key] = details[key];
\t\t}
\t\tif (["progress_pending", "progress_context", "final_part", "final_complete", "failure"].includes(details.role)) event.role = details.role;
\t\tif (typeof details.wireTextSha256 === "string" && /^[a-f0-9]{64}$/.test(details.wireTextSha256)) event.wireTextSha256 = details.wireTextSha256;
\t\tconst provenance = details.provenance;
\t\tif (provenance && typeof provenance === "object") {
\t\t\tevent.provenance = {};
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

const publicWireMethods = `\tchunkPublicAppendText(text) {
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
\t\t\theader = \`[BACKEND_FINAL_PART \${position}]\\nPartial parent final. Wait for BACKEND_FINAL_COMPLETE before answering; preserve all facts and values exactly.\\n\\n\`;
\t\t} else {
\t\t\trole = "final_complete";
\t\t\theader = \`[BACKEND_FINAL_COMPLETE \${position}]\\nParent final is complete. Relay collected final parts faithfully; never replace numbers or invent missing facts.\\n\\n\`;
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
\t\t\tfinished = true;
\t\t\tthis.consultController.abort(reason ?? new Error("Realtime voice consult cancelled"));
\t\t};
\t\t// The host supplies public assistant replies only. Reasoning streams never
\t\t// enter this callback. Host commentary is public assistant output; the native
\t\t// commentary channel is not proof of silence. Withhold chatter and long
\t\t// public articles from the native wire; append only selected short facts.
\t\tconst onProgress = (progress) => {
\t\t\tif (finished || !this.isCurrentDelegation(delegation, signal) ||
\t\t\t\tprogress?.kind !== "commentary" || progress?.isReasoning === true ||
\t\t\t\ttypeof progress?.text !== "string" || !progress.text.trim()) return;
\t\t\tconst publicText = progress.text.trim();
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
\t\t\tconst waitingPlan = /^(?:我(?:这边)?(?:会|将|先|正在|在)|我们(?:先|会|正在)|正在|现在(?:开始)?(?:等|等待|查|看|核对|执行)|(?:下一步|接下来|然后)(?:我|我们)?(?:会|将|先|去|开始|等|查|看)|先(?:查|看|确认|核对)|(?:好|行)[，,]?我(?:先)?(?:查|看)|稍等|请稍等|等一下|让我|这边(?:正在|在|先)|I(?:'m| am| will|['’]ll)|(?:Now|Next)(?:[,:]?\\s+)(?:I(?: will|['’]ll)|we(?: will|['’]ll)|start|wait|waiting|check)|Let me|Please wait|One (?:sec|moment))/iu.test(publicText);
\t\t\tconst setupOnly = /^(?:Read-only\\b|All read-only\\b|No (?:files? (?:written|were written)|external)|Sub-?task spawned\\b|子(?:任务|代理)(?:已)?(?:启动|派发|交办))/iu.test(publicText);
\t\t\tconst hasStatedResult = /(?:已(?:经)?(?:找到|查到|确认|核对|完成|收到|得到|生成|发出|测得|读到|验证)|找到了|查到了|确认了|核对出|记录显示|结果(?:是|为)|等于|完成(?:了|[。.!]|$)|(?:当前|测得|核验)(?:时间|值)(?:是|为)|(?:found|confirmed|completed|complete|finished|done|generated|verified)\\b|results?(?: (?:is|are)|:)|(?:value|time|price|cost) is\\b)/iu.test(publicText);
\t\t\t// A streamed markdown fragment is not an independent stage sentence.
\t\t\t// In particular, a child result's bare "— YES**" must not displace a fact.
\t\t\tconst structuralFragment = /\u0060\u0060\u0060|(?:^|\\n)\\s*(?:#{1,6}\\s|[-*+]\\s|>\\s|\\d+[.)]\\s)|^\\s*[-—–*\u0060#\\s]*(?:YES|NO|TRUE|FALSE|DONE|OK|MATCH)[-—–*\u0060#.!\\s]*$|^\\s*\\*\\*/iu.test(publicText);
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
\t\t\t\tcontinuationIdentity: { delegationItemId: delegation.id, delegationGeneration: delegation.generation },
\t\t\t\tonProgress,
\t\t\t\tonCanceled
\t\t\t});
\t\t\tif (!this.isCurrentDelegation(delegation, signal)) return;
\t\t\tif (typeof result?.text !== "string" || !result.text.trim()) throw new Error("Backend returned no complete public result");
\t\t\ttext = result.text;
\t\t\t// Preserve the original public result before applying the delivery limit.
\t\t\t// Byte-safe native chunks already bound individual frames; truncating the
\t\t\t// whole result would lose late facts while falsely labeling it complete.
\t\t\tthis.tracePublicProgress("backend-final-received", delegation.id, text, { kind: "final" });
\t\t\tif (Buffer.byteLength(text, "utf8") > 16 * 1024) {
\t\t\t\tterminalKind = "failure";
\t\t\t\ttext = "The backend result is too long to deliver completely. Tell the user it has not been fully delivered; do not claim completion, summarize unseen parts or invent missing values.";
\t\t\t\tthis.options.logger.warn("OpenAI GPT-Live complete public result exceeded the 16 KiB delivery limit");
\t\t\t}
\t\t} catch (error) {
\t\t\tif (!this.isCurrentDelegation(delegation, signal) || this.options.isCanceledError?.(error)) return;
\t\t\tthis.options.logger.warn(\`OpenAI GPT-Live delegation consult failed: \${shortFailureReason(error)}\`);
\t\t\ttext = CONSULT_FAILURE_TEXT;
\t\t\tterminalKind = "failure";
\t\t} finally {
\t\t\tfinished = true;
\t\t\tclearQueuedProgress();
\t\t\tsignal.removeEventListener("abort", clearQueuedProgress);
\t\t\tif (this.cancelQueuedProgress === clearQueuedProgress) this.cancelQueuedProgress = void 0;
\t\t}
\t\tif (this.isCurrentDelegation(delegation, signal)) {
\t\t\tthis.sendAppend(delegation.id, text, "speakable", { kind: terminalKind });
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
\t\tthis.publicProgressTraceLogEnabled = process.env.OPENCLAW_GPT_LIVE_PROGRESS_TRACE === "1";
\t\tthis.publicProgressTraceEnabled = this.publicProgressTraceLogEnabled || typeof options.onPublicProgressDiagnostic === "function";
\t\tthis.publicProgressTraceId = this.publicProgressTraceEnabled ? randomUUID() : void 0;
\t\tthis.publicProgressTraceSequence = 0;
\t\tthis.publicProgressAppendSequence = 0;
\t\tthis.lastSpokenProgressAt = -Infinity;`, "delegation generation and opt-in diagnostic initialization");
  patched = replaceOnce(patched, "\t\tconst delegation = {\n\t\t\tid,", "\t\tconst delegation = {\n\t\t\tid,\n\t\t\tgeneration: ++this.delegationGeneration,", "delegation generation ownership");
  patched = replaceOnce(patched, runDelegationBefore, `${diagnosticMethods}${publicWireMethods}${runDelegationAfter}`, "native consult progress and terminal delivery");
  patched = replaceOnce(patched, "\tmarkStopped() {\n\t\tthis.stopped = true;", "\tmarkStopped() {\n\t\tthis.cancelQueuedProgress?.();\n\t\tthis.stopped = true;", "stop queued progress without canceling detached work");
  return replaceOnce(patched, sendAppendBefore, sendAppendAfter, "native public append roles and successful wire boundary");
}
