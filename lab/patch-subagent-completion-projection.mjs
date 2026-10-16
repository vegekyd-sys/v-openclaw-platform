import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILTIN_BEFORE = "5638a3b7071bbbfa20da7b7c2098facdbd3c15bedf723e922c2f68a3f550f5e9";
export const MARKER = "// subagent-completion-projection-v3: admitted-attempt-readiness-and-native-yield-claim";
export const BASELINE_SOURCE = "lab/release-files/upstream-5xx-fallback/builtin-openclaw-zQV8Wwjr.js";
export const OUTPUT_SOURCE = "lab/release-files/subagent-completion-projection/builtin-openclaw-zQV8Wwjr.js";

export const HELPER = `/** Wait inside the admitted attempt, after any previous completion has left its lane. */
async function waitForSubagentCompletionProjection(input) {
\tconst { attempt, sessionTarget, externalAbortController, initialWriter } = input;
\tconst provenance = attempt.inputProvenance;
\tif (provenance?.kind !== "inter_session" || !["subagent_announce", "agent_harness_task"].includes(provenance.sourceTool)) return;
\tconst assertCurrent = () => {
\t\texternalAbortController.throwIfFired();
\t\tattempt.abortSignal?.throwIfAborted();
\t\tinitialWriter?.assertActive();
\t\tif (!sessionTarget?.sessionId || sessionTarget.sessionId !== attempt.sessionId || !sessionTarget.agentId || !sessionTarget.storePath || !sessionTarget.sessionKey || attempt.sessionKey && sessionTarget.sessionKey !== attempt.sessionKey) throw new Error("Subagent completion projection wait requires the admitted session target");
\t};
\tassertCurrent();
\tconst { waitForSessionTranscriptProjection } = await import("./session-transcript-reconcile-DFsDtc9l.js");
\tassertCurrent();
\t// The existing native waiter is bounded and validates the canonical generation.
\t// Do not acquire a transcript write context, replay a prompt, or retry a run.
\tawait waitForSessionTranscriptProjection(sessionTarget, attempt.abortSignal, { assertActive: assertCurrent });
\tassertCurrent();
}
`;

export function patchSubagentCompletionProjection(source) {
  if (source.includes(MARKER)) return source;
  assert.equal(createHash("sha256").update(source).digest("hex"), BUILTIN_BEFORE, "completion projection baseline drifted");
  const anchor = '\tinitialWriter?.assertActive();\n\tconst transcriptLifecycle = createEmbeddedAttemptTranscriptLifecycle({';
  assert.equal(source.split(anchor).length - 1, 1, "admitted attempt lifecycle anchor drifted");
  source = source.replace(anchor, '\tinitialWriter?.assertActive();\n\tawait waitForSubagentCompletionProjection({ attempt, sessionTarget, externalAbortController, initialWriter });\n\tconst transcriptLifecycle = createEmbeddedAttemptTranscriptLifecycle({');
  const yieldAnchor = 'function hasYieldContinuationEvidence(attempt) {\n';
  assert.equal(source.split(yieldAnchor).length - 1, 1, "yield evidence function drifted");
  source = source.replace(yieldAnchor, yieldAnchor + '\t// Native onYield already claimed a pending child, possibly from a prior turn.\n\tif (attempt.yieldDetected === true && attempt.nativeYieldClaimed === true) return true;\n');
  const resultAnchor = '\t\tyieldDetected: state.yieldDetected || void 0,\n';
  assert.equal(source.split(resultAnchor).length - 1, 1, "native attempt result anchor drifted");
  source = source.replace(resultAnchor, '\t\t// onYield runs only after the pending-child claim succeeds. Yield may abort\n\t\t// before tool-end metadata arrives, so preserve its native receipt directly.\n\t\t...state.yieldDetected === true ? { nativeYieldClaimed: true } : {},\n' + resultAnchor);
  const region = 'async function prepareEmbeddedAttemptTranscriptLifecycle(input) {';
  assert.equal(source.split(region).length - 1, 1, "attempt lifecycle function drifted");
  return `${MARKER}\n${source.replace(region, HELPER + region)}`;
}

export const EMBEDDED_SOURCE = "release/captured/v2026.9.1-db91.6-voice-task-continuity-20261016-r3/dist/embedded-agent-DaSvA-Yk.js";
export const EMBEDDED_OUTPUT = "lab/release-files/subagent-completion-projection/embedded-agent-DaSvA-Yk.js";
export const EMBEDDED_BEFORE = "a53fe92d1c6d1a1690587ade48271f7d1c960922716bc84935e6511242215e54";
export function patchNativeYieldReceipt(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), EMBEDDED_BEFORE, "native completion baseline drifted");
  const anchor = "...input.attempt.yieldDetected ? { yielded: true } : {},";
  assert.equal(source.split(anchor).length - 1, 1);
  return source.replace(anchor, anchor + "\n\t\t\t\t\t...input.attempt.yieldDetected === true && input.attempt.nativeYieldClaimed === true ? { nativeYieldClaimed: true } : {},");
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = path.join(root, OUTPUT_SOURCE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, patchSubagentCompletionProjection(fs.readFileSync(path.join(root, BASELINE_SOURCE), "utf8")));
  fs.writeFileSync(path.join(root, EMBEDDED_OUTPUT), patchNativeYieldReceipt(fs.readFileSync(path.join(root, EMBEDDED_SOURCE), "utf8")));
  console.log(OUTPUT_SOURCE, EMBEDDED_OUTPUT);
}
