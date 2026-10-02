import assert from "node:assert/strict";

const diagnosticMethods = `\ttracePublicProgress(stage, delegationId, text, details = {}) {
\t\tif (!this.publicProgressTraceEnabled || !["progress", "final"].includes(details.kind)) return;
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
\t\tfor (const key of ["kind", "appendId", "chunkIndex", "chunkCount", "wireTextChars"]) {
\t\t\tif (typeof details[key] === "string" || Number.isSafeInteger(details[key])) event[key] = details[key];
\t\t}
\t\tif (["progress_pending", "final_part", "final_complete"].includes(details.role)) event.role = details.role;
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
\tformatPublicAppendChunk(text, kind, chunkIndex, chunkCount) {
\t\tconst position = \`\${chunkIndex + 1}/\${chunkCount}\`;
\t\tlet role, header;
\t\tif (kind === "progress") {
\t\t\trole = "progress_pending";
\t\t\theader = \`[BACKEND_PROGRESS_PENDING \${position}]\\nParent task remains pending. Relay stated facts only; never guess missing values or announce whole-task completion.\\n\\n\`;
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
\t\tif (this.stopped || !socket || socket.readyState !== WEBSOCKET_OPEN) return;
\t\tconst isPublic = ["progress", "final"].includes(diagnostic.kind);
\t\tconst chunks = isPublic ? this.chunkPublicAppendText(text) : chunkOpenAIQuicksilverAppendText(text);
\t\tconst appendId = ++this.publicProgressAppendSequence;
\t\tfor (const [chunkIndex, chunk] of chunks.entries()) {
\t\t\tconst { role, wireText } = isPublic ? this.formatPublicAppendChunk(chunk, diagnostic.kind, chunkIndex, chunks.length) : { wireText: chunk };
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
\t\t\t\t...diagnostic, appendId, chunkIndex, chunkCount: chunks.length, role,
\t\t\t\twireTextSha256: createHash("sha256").update(frame.content[0].text).digest("hex"),
\t\t\t\twireTextChars: frame.content[0].text.length
\t\t\t});
\t\t}
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
\t\tlet finished = false;
\t\t// The host supplies public assistant replies only. Reasoning streams never
\t\t// enter this callback; commentary here is a host kind, not the native silent
\t\t// commentary channel. Public progress must use native speakable context.
\t\tconst onProgress = (progress) => {
\t\t\tif (finished || !this.isCurrentDelegation(delegation, signal) ||
\t\t\t\tprogress?.kind !== "commentary" || progress?.isReasoning === true ||
\t\t\t\ttypeof progress?.text !== "string" || !progress.text.trim()) return;
\t\t\tconst publicText = progress.text.trim();
\t\t\tthis.tracePublicProgress("public-progress-received", delegation.id, publicText, { kind: "progress", provenance: progress.provenance });
\t\t\ttry {
\t\t\t\tthis.sendAppend(delegation.id, publicText, "speakable", { kind: "progress", provenance: progress.provenance });
\t\t\t} catch (error) {
\t\t\t\t// A dropped progress update must not abort accepted backend work or
\t\t\t\t// turn its eventual final answer into a failed consult.
\t\t\t\tthis.options.logger.warn(\`OpenAI GPT-Live progress delivery failed: \${shortFailureReason(error)}\`);
\t\t\t}
\t\t};
\t\ttry {
\t\t\tconst result = await this.options.runAgentConsult({
\t\t\t\tprompt: delegation.prompt,
\t\t\t\tsignal,
\t\t\t\tcontinuationIdentity: { delegationItemId: delegation.id, delegationGeneration: delegation.generation },
\t\t\t\tonProgress
\t\t\t});
\t\t\tif (!this.isCurrentDelegation(delegation, signal)) return;
\t\t\ttext = boundOpenAIQuicksilverDelegationResult(result.text);
\t\t} catch (error) {
\t\t\tif (!this.isCurrentDelegation(delegation, signal) || this.options.isCanceledError?.(error)) return;
\t\t\tthis.options.logger.warn(\`OpenAI GPT-Live delegation consult failed: \${shortFailureReason(error)}\`);
\t\t\ttext = CONSULT_FAILURE_TEXT;
\t\t} finally {
\t\t\tfinished = true;
\t\t}
\t\tif (this.isCurrentDelegation(delegation, signal)) {
\t\t\tthis.tracePublicProgress("backend-final-received", delegation.id, text, { kind: "final" });
\t\t\tthis.sendAppend(delegation.id, text, "speakable", { kind: "final" });
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
\t\tthis.publicProgressAppendSequence = 0;`, "delegation generation and opt-in diagnostic initialization");
  patched = replaceOnce(patched, "\t\tconst delegation = {\n\t\t\tid,", "\t\tconst delegation = {\n\t\t\tid,\n\t\t\tgeneration: ++this.delegationGeneration,", "delegation generation ownership");
  patched = replaceOnce(patched, runDelegationBefore, `${diagnosticMethods}${publicWireMethods}${runDelegationAfter}`, "native consult progress and terminal delivery");
  return replaceOnce(patched, sendAppendBefore, sendAppendAfter, "native public append roles and successful wire boundary");
}
