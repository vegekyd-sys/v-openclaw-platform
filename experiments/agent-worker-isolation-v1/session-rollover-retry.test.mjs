import assert from "node:assert/strict";
import test from "node:test";
import {
  isSessionRolloverAdmissionError,
  runWithSessionRolloverRetry,
} from "./session-rollover-retry.mjs";

test("rebinds to the latest session and retries once after compaction rotation", async () => {
  const attempts = [];
  const retries = [];

  const result = await runWithSessionRolloverRetry({
    initialSession: {
      sessionId: "session-before",
      sessionFile: "/tmp/session-before.jsonl",
    },
    execute: async (session, attempt) => {
      attempts.push({ ...session, attempt });
      if (attempt === 0) {
        throw new Error(
          'Session "agent:makaron:feishu:direct:test" changed while starting work. Retry.',
        );
      }
      return "VISIBLE_REPLY";
    },
    readLatestSession: async () => ({
      exists: true,
      sessionId: "session-after",
      sessionFile: "/tmp/session-after.jsonl",
    }),
    onRetry: (event) => retries.push(event),
  });

  assert.equal(result.value, "VISIBLE_REPLY");
  assert.equal(result.retries, 1);
  assert.deepEqual(attempts, [
    {
      sessionId: "session-before",
      sessionFile: "/tmp/session-before.jsonl",
      attempt: 0,
    },
    {
      sessionId: "session-after",
      sessionFile: "/tmp/session-after.jsonl",
      attempt: 1,
    },
  ]);
  assert.deepEqual(retries, [
    {
      attempt: 1,
      previousSessionId: "session-before",
      nextSessionId: "session-after",
    },
  ]);
});

test("does not replay a non-admission failure with possible side effects", async () => {
  let executions = 0;
  await assert.rejects(
    runWithSessionRolloverRetry({
      initialSession: { sessionId: "session-before" },
      execute: async () => {
        executions += 1;
        throw new Error("exec tool failed after writing a file");
      },
      readLatestSession: async () => ({
        exists: true,
        sessionId: "session-after",
      }),
    }),
    /exec tool failed/,
  );
  assert.equal(executions, 1);
});

test("does not retry when the latest store entry did not actually rotate", async () => {
  let executions = 0;
  await assert.rejects(
    runWithSessionRolloverRetry({
      initialSession: { sessionId: "session-before" },
      execute: async () => {
        executions += 1;
        throw new Error(
          'Session "agent:makaron:feishu:direct:test" changed while starting work. Retry.',
        );
      },
      readLatestSession: async () => ({
        exists: true,
        sessionId: "session-before",
      }),
    }),
    /changed while starting work/,
  );
  assert.equal(executions, 1);
});

test("recognizes only the pre-work session lifecycle guard", () => {
  assert.equal(
    isSessionRolloverAdmissionError(
      new Error('Session "key" changed while starting work. Retry.'),
    ),
    true,
  );
  assert.equal(
    isSessionRolloverAdmissionError(
      new Error("Session key changed before transcript mirror."),
    ),
    false,
  );
  assert.equal(
    isSessionRolloverAdmissionError(new Error("worker request was cancelled")),
    false,
  );
});
