import assert from "node:assert/strict";

/** Add host-only final classification; a client-tool receipt remains separate. */
export function patchGptLiveCallTerminalEmbedded(source) {
  const marker = "// gpt-live-call-terminal-v1: exact embedded terminal state";
  if (source.includes(marker)) return source;
  const startAnchor = "async function completeEmbeddedRun(input) {";
  const endAnchor = "\n//#endregion\n//#region src/agents/embedded-agent-runner/run/settled-turn-finalization.ts";
  assert.equal(source.split(startAnchor).length - 1, 1, "embedded terminal owner must occur exactly once");
  const from = source.indexOf(startAnchor), to = source.indexOf(endAnchor, from);
  // The standalone captured function fixture ends immediately after its body.
  const end = to >= 0 ? to : from === 0 && source.trimEnd().endsWith("}") ? source.length : -1;
  assert(end > from, "embedded terminal owner boundary drifted");
  const original = source.slice(from, end);
  const anchor = "\t\t\t\taborted: terminalAborted,\n\t\t\t\tsystemPromptReport: input.attempt.systemPromptReport,";
  assert.equal(original.split(anchor).length - 1, 1, "embedded terminal meta must occur exactly once");
  const replacement = `\t\t\t\taborted: terminalAborted,
\t\t\t\t// This private host projection is made only from the final core owner.
\t\t\t\t// Model tool args and pending-tool IDs cannot supply its identity.
\t\t\t\t...(input.attempt.clientToolCalls?.some((call) => call.name === "openclaw_end_call") ? {
\t\t\t\t\tgptLiveTerminalOutcome: Object.freeze({
\t\t\t\t\t\tversion: 1, source: "embedded_terminal_state",
\t\t\t\t\t\tclassification: classifyAgentRunTerminalOutcome(input.terminalState.outcome),
\t\t\t\t\t\treason: input.terminalState.outcome.reason,
\t\t\t\t\t\trunId: input.runParams.runId, sessionId: input.runParams.sessionId
\t\t\t\t\t})
\t\t\t\t} : {}),
\t\t\t\tsystemPromptReport: input.attempt.systemPromptReport,`;
  return marker + "\n" + source.slice(0, from) + original.replace(anchor, replacement) + source.slice(end);
}
