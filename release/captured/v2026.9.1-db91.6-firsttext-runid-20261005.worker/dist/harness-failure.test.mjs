import assert from "node:assert/strict";
import test from "node:test";
import { buildHarnessFailureAttempt } from "./harness-failure.mjs";

test("model timeout becomes a terminal non-replayable Harness attempt", () => {
  const error = new Error("LLM request timed out.");
  const attempt = buildHarnessFailureAttempt(error, {
    sessionId: "session-1",
    sessionFile: "/tmp/session-1.jsonl",
  });

  assert.equal(attempt.aborted, false);
  assert.equal(attempt.externalAbort, false);
  assert.equal(attempt.timedOut, true);
  assert.equal(attempt.promptError, error);
  assert.equal(attempt.promptErrorSource, "prompt");
  assert.equal(attempt.sessionIdUsed, "session-1");
  assert.equal(attempt.sessionFileUsed, "/tmp/session-1.jsonl");
  assert.equal(attempt.replayMetadata.replaySafe, false);
  assert.equal(attempt.itemLifecycle.activeCount, 0);
});

test("compaction failure is not replayed as a fresh prompt", () => {
  const attempt = buildHarnessFailureAttempt(
    new Error("CLI transcript compaction timed out"),
    { sessionId: "session-2" },
  );

  assert.equal(attempt.timedOut, false);
  assert.equal(attempt.timedOutDuringCompaction, true);
  assert.equal(attempt.promptErrorSource, "compaction");
  assert.equal(attempt.replayMetadata.hadPotentialSideEffects, true);
  assert.equal(attempt.replayMetadata.replaySafe, false);
  assert.equal(attempt.itemLifecycle.activeCount, 0);
});

test("provider errors still produce a completed Harness lifecycle", () => {
  const error = new Error("Our servers are currently overloaded.");
  error.code = "server_is_overloaded";
  const attempt = buildHarnessFailureAttempt(error, {
    sessionId: "session-3",
  });

  assert.equal(attempt.timedOut, false);
  assert.equal(attempt.promptErrorSource, "prompt");
  assert.equal(attempt.promptError, error);
  assert.deepEqual(attempt.itemLifecycle, {
    startedCount: 1,
    completedCount: 1,
    activeCount: 0,
  });
});
