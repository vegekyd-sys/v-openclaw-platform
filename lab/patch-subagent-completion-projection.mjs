import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILTIN_BEFORE = "5638a3b7071bbbfa20da7b7c2098facdbd3c15bedf723e922c2f68a3f550f5e9";
export const MARKER = "// subagent-completion-projection-v1: admitted-attempt-readiness";
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
  const region = 'async function prepareEmbeddedAttemptTranscriptLifecycle(input) {';
  assert.equal(source.split(region).length - 1, 1, "attempt lifecycle function drifted");
  return `${MARKER}\n${source.replace(region, HELPER + region)}`;
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = path.join(root, OUTPUT_SOURCE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, patchSubagentCompletionProjection(fs.readFileSync(path.join(root, BASELINE_SOURCE), "utf8")));
  console.log(OUTPUT_SOURCE);
}
