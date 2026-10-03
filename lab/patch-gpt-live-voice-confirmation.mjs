import assert from "node:assert/strict";
import { createGptLiveClientVoiceConfirmationAuthorizer, createGptLiveClientVoiceConfirmationTracer } from "./gpt-live-voice-confirmation.mjs";

const marker = "// gpt-live-client-voice-confirmation-v1: durable exact-scope host grant";
export function patchGptLiveClientVoiceConfirmation(source) {
  if (source.includes(marker)) return source;
  const replace = (before, after) => {
    assert.equal(source.split(before).length - 1, 1, `voice confirmation anchor drifted: ${before.slice(0, 100)}`);
    source = source.replace(before, after);
  };
  const traceAnchor = "const CONFIRMATION_TTL_MS = 12e4;";
  replace(traceAnchor, `const traceGptLiveVoiceConfirmation = (${createGptLiveClientVoiceConfirmationTracer.toString()})({
\tenv: process.env, createHash, write: line => process.stderr.write(line)
});\n${traceAnchor}`);
  replace('const REFUSAL_PATTERN = /\\b(no|don\'t|do not|cancel|stop|never mind)\\b/;',
    'const REFUSAL_PATTERN = /\\b(no|don\'t|do not|cancel|stop|never mind)\\b|^(?:不|不要|别|不同意|取消|停止|算了)|(?:不要执行|不要确认|不同意|别执行|取消任务|停止执行)/;');
  replace('return text.trim().toLowerCase().replace(/[‘’ʼ]/g, "\'").replace(/[,;:.!?]+/g, "").replace(/\\s+/g, " ");',
    'return text.trim().toLowerCase().replace(/[‘’ʼ]/g, "\'").replace(/[,;:.!?，；：。！？、]+/g, "").replace(/\\s+/g, " ");');
  replace('return /^(yes|yes do it|do it|confirm|confirmed|go ahead|proceed|send it|make the change|restart it)$/.test(normalized);',
    'return /^(yes|yes do it|do it|confirm|confirmed|go ahead|proceed|send it|make the change|restart it|确认|确认执行|同意|同意执行|允许执行|请执行|执行吧|继续执行)$/.test(normalized);');
  const anchor = "function checkClientVoiceToolConfirmationPolicy(params) {\n\treturn resolveClientVoiceToolConfirmationPolicy(params, false);\n}";
  replace(anchor, `${anchor}\nconst authorizeGptLiveClientVoicePendingConfirmation = (${createGptLiveClientVoiceConfirmationAuthorizer.toString()})({\n\treadVoiceSessionRecord, getPrunedConfirmationScope, confirmationScopeKey,\n\tisExplicitAffirmation, authorizeClientVoiceConfirmation, trace: traceGptLiveVoiceConfirmation\n});`);
  replace("\tif (consume) {\n\t\tapproved?.delete(fingerprint);\n\t\tif (approved?.size === 0) state?.approvedByRun.delete(runId);\n\t\tif (state) cleanupConfirmationScope(scopeKey, state);\n\t}",
    `\tif (consume) {
\t\tconst grantDeleted = approved?.delete(fingerprint);
\t\tif (approved?.size === 0) state?.approvedByRun.delete(runId);
\t\tif (state) cleanupConfirmationScope(scopeKey, state);
\t\tif (grantDeleted === true) traceGptLiveVoiceConfirmation("consume", { at: now, scopeKey, runId, fingerprint });
\t}`);
  replace("\tstate.approvedByRun.set(params.runId, approved);\n\tclearPendingConfirmation(state);\n\tcleanupConfirmationScope(scopeKey, state);\n\treturn true;",
    `\tstate.approvedByRun.set(params.runId, approved);
\tclearPendingConfirmation(state);
\tcleanupConfirmationScope(scopeKey, state);
\ttraceGptLiveVoiceConfirmation("bind", { at: now, scopeKey, runId: params.runId,
\t\tconfirmationId: pending.confirmationId, fingerprint: pending.fingerprint });
\treturn true;`);
  return `${marker}\n${source}\nexport { authorizeGptLiveClientVoicePendingConfirmation };\n`;
}
