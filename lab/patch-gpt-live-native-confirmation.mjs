import assert from "node:assert/strict";

/** Native delegations have a prompt, not the legacy tool's confirmationId field. */
export function patchGptLiveNativeConfirmationTalk(source) {
  const marker = "// gpt-live-native-confirmation-v1: durable caller affirmation";
  if (source.includes(marker)) return source;
  const before = `\t\t\treturn await params.runAgentConsult({ question: prompt }, AbortSignal.any([consultSignal, signal]), onProgress, continuationContext);`;
  const after = `\t\t\t// Only the host's durable finalized USER transcript can authorize this.
\t\t\t// Neither the native prompt nor a model-supplied id is an affirmation.
\t\t\tawait params.flushTranscript();
\t\t\towner.assertOpen();
\t\t\tconsultSignal.throwIfAborted();
\t\t\tif (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active");
\t\t\tconst spokenGrant = authorizeGptLiveClientVoicePendingConfirmation({
\t\t\t\tagentId: params.sessionTarget.agentId,
\t\t\t\tsessionKey: params.sessionTarget.sessionKey,
\t\t\t\tvoiceSessionId: params.voiceSessionId,
\t\t\t\tcallerInputAcceptedAt
\t\t\t});
\t\t\t// Existing runArgs validates again and binds the exact one-shot grant at
\t\t\t// actual onRunStarted. Canonical tool params must still match at execution.
\t\t\treturn await params.runAgentConsult({ question: prompt,
\t\t\t\t...spokenGrant ? { confirmationId: spokenGrant.confirmationId } : {}
\t\t\t}, AbortSignal.any([consultSignal, signal]), onProgress, continuationContext);`;
  const runSignature = "runAgentConsult: async ({ prompt, signal: consultSignal = new AbortController().signal, onProgress, continuationIdentity, onCanceled, onRunStarted }) =>";
  assert.equal(source.split(runSignature).length - 1, 1, "native caller checkpoint Talk anchor drifted");
  source = source.replace(runSignature, runSignature.replace("onRunStarted })", "onRunStarted, callerInputAcceptedAt })"));
  assert.equal(source.split(before).length - 1, 1, "native spoken confirmation Talk anchor drifted");
  return marker + "\n" +
    `import { authorizeGptLiveClientVoicePendingConfirmation } from "./agent-tools.before-tool-call-g2OT63u5.js";\n` +
    source.replace(before, after);
}
