import assert from "node:assert/strict";

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
\t\t\ttry {
\t\t\t\tthis.sendAppend(delegation.id, progress.text.trim(), "speakable");
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
\t\tif (this.isCurrentDelegation(delegation, signal)) this.sendAppend(delegation.id, text, "speakable");
\t}`;

function replaceOnce(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} must match exactly once; refresh the VLab baseline before applying`);
  return source.replace(before, after);
}

export function patchGptLiveNativeProgress(source) {
  let patched = replaceOnce(source, "\t\tthis.stopped = false;", "\t\tthis.stopped = false;\n\t\tthis.delegationGeneration = 0;", "delegation generation initialization");
  patched = replaceOnce(patched, "\t\tconst delegation = {\n\t\t\tid,", "\t\tconst delegation = {\n\t\t\tid,\n\t\t\tgeneration: ++this.delegationGeneration,", "delegation generation ownership");
  return replaceOnce(patched, runDelegationBefore, runDelegationAfter, "native consult progress and terminal delivery");
}
