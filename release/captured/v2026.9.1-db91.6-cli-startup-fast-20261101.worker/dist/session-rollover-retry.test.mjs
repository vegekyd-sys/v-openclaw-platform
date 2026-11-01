import assert from "node:assert/strict";
import test from "node:test";
import {
  isSessionRolloverAdmissionError,
  runWithSessionRolloverRetry,
} from "./session-rollover-retry.mjs";

test("rebinds to the latest session and retries once after compaction rotation", async () => {
  const attempts = [];
  const retries = [];
  let latestReads = 0;

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
    readLatestSession: async () => {
      latestReads += 1;
      return latestReads === 1
        ? {
            exists: true,
            sessionId: "session-before",
            sessionFile: "/tmp/session-before.jsonl",
          }
        : {
            exists: true,
            sessionId: "session-after",
            sessionFile: "/tmp/session-after.jsonl",
          };
    },
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
      sameSessionId: false,
    },
  ]);
});

test("rebinds stale dispatch parameters before the first execution", async () => {
  const attempts = [];
  const rebinds = [];

  const result = await runWithSessionRolloverRetry({
    initialSession: {
      sessionId: "session-before",
      sessionFile: "/tmp/session-before.jsonl",
    },
    execute: async (session, attempt) => {
      attempts.push({ ...session, attempt });
      return "VISIBLE_REPLY";
    },
    readLatestSession: async () => ({
      exists: true,
      sessionId: "session-after",
      sessionFile: "/tmp/session-after.jsonl",
    }),
    onRebind: (event) => rebinds.push(event),
  });

  assert.equal(result.value, "VISIBLE_REPLY");
  assert.equal(result.retries, 0);
  assert.deepEqual(attempts, [
    {
      sessionId: "session-after",
      sessionFile: "/tmp/session-after.jsonl",
      attempt: 0,
    },
  ]);
  assert.deepEqual(rebinds, [
    {
      previousSessionId: "session-before",
      nextSessionId: "session-after",
    },
  ]);
});

test("a preflight lookup failure does not block the original session", async () => {
  const errors = [];
  const result = await runWithSessionRolloverRetry({
    initialSession: { sessionId: "session-before" },
    execute: async (session) => session.sessionId,
    readLatestSession: async () => {
      throw new Error("session store temporarily unavailable");
    },
    onRebindError: (error) => errors.push(error.message),
  });

  assert.equal(result.value, "session-before");
  assert.deepEqual(errors, ["session store temporarily unavailable"]);
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

test("retries once when the same session revision changed before work started", async () => {
  let executions = 0;
  const result = await runWithSessionRolloverRetry({
    initialSession: { sessionId: "session-before" },
    execute: async () => {
      executions += 1;
      if (executions === 1) {
        throw new Error(
          'Session "agent:makaron:feishu:direct:test" changed while starting work. Retry.',
        );
      }
      return "VISIBLE_REPLY";
    },
    readLatestSession: async () => ({
      exists: true,
      sessionId: "session-before",
    }),
  });
  assert.equal(result.value, "VISIBLE_REPLY");
  assert.equal(result.retries, 1);
  assert.equal(executions, 2);
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
