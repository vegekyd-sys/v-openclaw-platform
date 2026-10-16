// projection-wait-inter-session-v1: wait for the transcript projection before every
// inter-session turn, not only subagent announcements, on V's db91.6 bytes
// (core/dist/builtin-openclaw-zQV8Wwjr.js as shipped by PR #399).
//
// V 2026-10-17 00:39: four generated-media completion turns of 7da00997 (143 MB,
// runId image_generate:<id>:ok:agent-loop) failed in about 300 ms with "Session transcript
// projection is rebuilding" before reaching the model. Those turns are queued by
// subagent-announce-delivery with inputProvenance { kind: "inter_session", sourceTool:
// "image_generate" | "video_generate" | ... }, but waitForSubagentCompletionProjection (PR #399)
// only waited for sourceTool "subagent_announce" and "agent_harness_task". User turns already
// wait (persistUserTurnTranscript). The wait itself is unchanged: the bounded native waiter
// (15 s, cross-process readiness, canonical generation check), no prompt replay, no retry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const MARKER = "projection-wait-inter-session-v1";
export const BUILTIN_FILE = "builtin-openclaw-zQV8Wwjr.js";
export const BUILTIN_BEFORE = "71c2310a73dbfa66d70fe560ff13132c620f0033439e604417842412758a67bc";
const BEFORE_LINE = '\tif (provenance?.kind !== "inter_session" || !["subagent_announce", "agent_harness_task"].includes(provenance.sourceTool)) return;';
const AFTER_LINE = `\t// ${MARKER}: every inter-session turn (subagent and harness announcements, generated-media\n\t// completions) reads the requester transcript; wait for its projection like user turns do.\n\tif (provenance?.kind !== "inter_session") return;`;

export function patchBuiltinProjectionWait(source) {
  assert.ok(!source.includes(MARKER), `${BUILTIN_FILE} already carries ${MARKER}`);
  assert.equal(createHash("sha256").update(source).digest("hex"), BUILTIN_BEFORE, `${BUILTIN_FILE} is not V's db91.6 bytes`);
  assert.equal(source.split(BEFORE_LINE).length, 2, "waitForSubagentCompletionProjection anchor");
  return source.replace(BEFORE_LINE, () => AFTER_LINE);
}
