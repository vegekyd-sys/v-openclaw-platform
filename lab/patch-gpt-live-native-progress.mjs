import assert from "node:assert/strict";

const diagnosticMethods = `\ttracePublicProgress(stage, delegationId, text, details = {}) {
\t\tif (!this.publicProgressTraceEnabled) return;
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
\t\tfor (const key of ["kind", "appendId", "chunkIndex", "chunkCount"]) {
\t\t\tif (typeof details[key] === "string" || Number.isSafeInteger(details[key])) event[key] = details[key];
\t\t}
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
  patched = replaceOnce(patched, runDelegationBefore, `${diagnosticMethods}${runDelegationAfter}`, "native consult progress and terminal delivery");
  patched = replaceOnce(patched, "\tsendAppend(delegationId, text, channel) {", "\tsendAppend(delegationId, text, channel, diagnostic = {}) {", "append diagnostic parameter");
  patched = replaceOnce(patched, "\t\tfor (const chunk of chunkOpenAIQuicksilverAppendText(text)) socket.send(JSON.stringify({", `\t\tconst chunks = chunkOpenAIQuicksilverAppendText(text);
\t\tconst appendId = ++this.publicProgressAppendSequence;
\t\tfor (const [chunkIndex, chunk] of chunks.entries()) {
\t\t\tsocket.send(JSON.stringify({`, "append chunk ownership");
  return replaceOnce(patched, "\t\t}));\n\t}\n\tfail(error)", `\t\t\t}));
\t\t\t// Successful send is the native append boundary, not an intention log.
\t\t\tthis.tracePublicProgress("context-append-sent", delegationId, chunk, { ...diagnostic, appendId, chunkIndex, chunkCount: chunks.length });
\t\t}
\t}
\tfail(error)`, "successful append diagnostic boundary");
}
