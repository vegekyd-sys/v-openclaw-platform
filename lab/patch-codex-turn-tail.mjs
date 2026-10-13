import assert from 'node:assert/strict';
import { TAIL_HELPER, TAIL_MARKER } from './codex-turn-tail.mjs';

// codex-turn-tail-v1, core side (see lab/codex-turn-tail.mjs). Three V db91.6 core chunks:
//   node-sqlite      every top-level transaction during a tail: lock wait (BEGIN) and hold, with its label
//   ws-log           every Gateway RPC response >= 200 ms during a tail
//   embedded-agent   the core's marks (attempt-return, user-message-persistence, normalize, failover-decision,
//                    settle) and the [codex-turn-tail.1] line after settleEmbeddedRun
// The tail starts in the Codex plugin (run-attempt, turn/completed); a run without it logs nothing.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function withTailHelper(source) {
  assert(!source.includes(TAIL_MARKER), `already carries ${TAIL_MARKER}`);
  const at = source.indexOf('\n//#region');
  assert(at > 0, 'no //#region to insert the helper before');
  return `${source.slice(0, at + 1)}${TAIL_HELPER}${source.slice(at + 1)}`;
}

export function patchNodeSqlite(source) {
  let out = withTailHelper(source);
  out = replaceExactlyOnce(out, '\tbeginTransaction(db, options, mode);\n\tsetTransactionDepth(db, 1);\n',
    `\tconst vTailBeginAt = Date.now(); // V ${TAIL_MARKER}
\tbeginTransaction(db, options, mode);
\tconst vTailWaitMs = Date.now() - vTailBeginAt;
\tsetTransactionDepth(db, 1);
`, 'top-level BEGIN');
  out = replaceExactlyOnce(out, '\t\tlogSlowTransactionHold({\n\t\t\telapsedMs: Date.now() - transactionStartedAt,\n\t\t\toptions\n\t\t});\n',
    `\t\tlogSlowTransactionHold({
\t\t\telapsedMs: Date.now() - transactionStartedAt,
\t\t\toptions
\t\t});
\t\t{
\t\t\t// V ${TAIL_MARKER}: transactions during a Codex turn's tail
\t\t\tconst vTail = __vCodexTurnTail();
\t\t\tconst vTailHoldMs = Date.now() - transactionStartedAt;
\t\t\tif (vTail.active() && (vTailWaitMs >= 20 || vTailHoldMs >= 50)) vTail.note("tx", { op: options?.operationLabel ?? null, waitMs: vTailWaitMs, holdMs: vTailHoldMs });
\t\t}
`, 'transaction hold log');
  return out;
}

export function patchWsLog(source) {
  let out = withTailHelper(source);
  const note = (indent) => `${indent}if (typeof durationMs === "number" && durationMs >= 200 && __vCodexTurnTail().active()) __vCodexTurnTail().note("rpc", { method: method ?? null, ms: durationMs, conn: connId ? shortId(connId) : null }); // V ${TAIL_MARKER}\n`;
  out = replaceExactlyOnce(out, '\tif (!(ok === false || typeof durationMs === "number" && durationMs >= 50)) return;\n',
    `${note('\t')}\tif (!(ok === false || typeof durationMs === "number" && durationMs >= 50)) return;\n`, 'optimized response threshold');
  return out;
}

const NORMALIZE_HEAD = 'async function normalizeEmbeddedRunAttempt(input) {\n\tconst { runInput, preparedRuntime, dispatchedAttempt, sessionPromptState, provider, modelId } = input;\n\tconst params = runInput.runParams;\n';
const PERSIST_WAIT = '\tawait sessionPromptState.waitForCurrentUserMessagePersistence();\n\tsessionPromptState.suppressNextUserMessagePersistence = sessionPromptState.activePrompt.persisted;\n';
const NORMALIZE_CALL_END = '\t\t\t\tthinkLevel,\n\t\t\t\tcontextRecoveryState\n\t\t\t});\n';
const DECISION_LOG = '\t\tlog$3.warn("embedded run failover decision", {\n';
const SETTLE_CALL = '\t\tawait settleEmbeddedRun({\n\t\t\trunInput: admittedRunInput,\n\t\t\truntime: preparedRuntime,\n\t\t\tcompaction: {\n\t\t\t\tstate: contextRecoveryState,\n\t\t\t\tsession: sessionPromptState,\n\t\t\t\toriginalTarget: originalCompactionTarget,\n\t\t\t\tdurable: durableCompactionAccounting,\n\t\t\t\tauthority: accountingAuthority\n\t\t\t},\n\t\t\townedContextEngineLease\n\t\t});\n';

export function patchEmbeddedAgent(source) {
  let out = withTailHelper(source);
  out = replaceExactlyOnce(out, NORMALIZE_HEAD, `${NORMALIZE_HEAD}\t__vCodexTurnTail().mark(params.runId, "attempt-return"); // V ${TAIL_MARKER}\n`, 'attempt normalization head');
  out = replaceExactlyOnce(out, PERSIST_WAIT, `${PERSIST_WAIT}\t__vCodexTurnTail().mark(params.runId, "user-message-persistence"); // V ${TAIL_MARKER}\n`, 'user message persistence wait');
  out = replaceExactlyOnce(out, NORMALIZE_CALL_END, `${NORMALIZE_CALL_END}\t\t\t__vCodexTurnTail().mark(admittedRunInput.runParams.runId, "normalize"); // V ${TAIL_MARKER}\n`, 'attempt normalization call');
  out = replaceExactlyOnce(out, DECISION_LOG, `\t\t__vCodexTurnTail().mark(normalizedBase.runId, "failover-decision"); // V ${TAIL_MARKER}\n${DECISION_LOG}`, 'failover decision log');
  out = replaceExactlyOnce(out, SETTLE_CALL, `${SETTLE_CALL}\t\t{
\t\t\t// V ${TAIL_MARKER}: one line per Codex run tail
\t\t\tconst vTailRunId = admittedRunInput.runParams.runId;
\t\t\t__vCodexTurnTail().mark(vTailRunId, "settle");
\t\t\tconst vTail = __vCodexTurnTail().end(vTailRunId);
\t\t\tif (vTail) log$3.info(\`[codex-turn-tail.1] \${JSON.stringify(vTail)}\`);
\t\t}
`, 'run settlement');
  return out;
}
