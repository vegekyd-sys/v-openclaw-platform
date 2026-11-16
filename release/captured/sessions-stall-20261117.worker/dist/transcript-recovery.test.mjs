import assert from "node:assert/strict";
import test from "node:test";
import {
  closeInterruptedToolCalls,
  findInterruptedToolCalls,
} from "./transcript-recovery.mjs";

function event(id, parentId, message) {
  return {
    type: "message",
    id,
    parentId,
    message,
  };
}

test("finds only tool calls without a terminal tool result", () => {
  const events = [
    event("user", null, { role: "user", content: "run two tools" }),
    event("assistant", "user", {
      role: "assistant",
      content: [
        { type: "toolCall", id: "call-1", name: "exec" },
        { type: "toolCall", id: "call-2", name: "read" },
      ],
    }),
    event("result", "assistant", {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "exec",
      content: [{ type: "text", text: "done" }],
      isError: false,
    }),
  ];

  assert.deepEqual(findInterruptedToolCalls(events), [
    { toolCallId: "call-2", toolName: "read" },
  ]);
});

test("does not repair an already terminal turn or cross a newer user turn", () => {
  assert.deepEqual(
    findInterruptedToolCalls([
      event("user-1", null, { role: "user", content: "old" }),
      event("assistant", "user-1", {
        role: "assistant",
        content: [{ type: "toolCall", id: "call-1", name: "exec" }],
      }),
      event("user-2", "assistant", { role: "user", content: "new" }),
    ]),
    [],
  );
});

test("atomically appends error results for interrupted tool calls", async () => {
  const events = [
    event("user", null, { role: "user", content: "run" }),
    event("assistant", "user", {
      role: "assistant",
      content: [{ type: "toolCall", id: "call-1", name: "exec" }],
    }),
  ];
  const appended = [];
  let published = false;

  const count = await closeInterruptedToolCalls({
    withSessionTranscriptWriteLock: async (_target, run) =>
      await run({
        readEvents: async () => events,
        appendMessage: async ({ message }) => {
          appended.push(message);
          return { appended: true };
        },
        publishUpdate: async () => {
          published = true;
        },
      }),
    target: {
      agentId: "makaron",
      sessionKey: "agent:makaron:test",
      sessionId: "session-1",
    },
    config: {},
    error: new Error("worker exited"),
  });

  assert.equal(count, 1);
  assert.equal(appended[0].role, "toolResult");
  assert.equal(appended[0].toolCallId, "call-1");
  assert.equal(appended[0].isError, true);
  assert.match(appended[0].content[0].text, /worker exited/);
  assert.equal(published, true);
});
