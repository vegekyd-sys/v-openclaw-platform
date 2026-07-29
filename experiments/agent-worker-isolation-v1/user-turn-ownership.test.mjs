import assert from "node:assert/strict";
import test from "node:test";
import {
  acknowledgeWorkerUserTurn,
  shouldWorkerPersistUserTurn,
} from "./user-turn-ownership.mjs";

test("worker persists when the Gateway recorder has not persisted", () => {
  assert.equal(
    shouldWorkerPersistUserTurn({
      hasPersisted: () => false,
      isBlocked: () => false,
    }),
    true,
  );
});

test("worker suppresses persistence when Gateway already owns the user turn", () => {
  assert.equal(
    shouldWorkerPersistUserTurn({
      hasPersisted: () => true,
      isBlocked: () => false,
    }),
    false,
  );
});

test("acknowledges the matching user turn written by the worker", () => {
  let persisted = false;
  let persistedMessage;
  const recorder = {
    hasPersisted: () => persisted,
    isBlocked: () => false,
    markRuntimePersisted: (message) => {
      persisted = true;
      persistedMessage = message;
    },
  };
  const userMessage = {
    role: "user",
    content: [{ type: "text", text: "current turn" }],
  };

  const result = acknowledgeWorkerUserTurn({
    recorder,
    messages: [
      { role: "user", content: "older turn" },
      { role: "assistant", content: "older reply" },
      userMessage,
    ],
    expectedText: "current turn",
  });

  assert.equal(result, "acknowledged");
  assert.equal(persistedMessage, userMessage);
});

test("does not claim an unrelated historical user turn", () => {
  let calls = 0;
  const result = acknowledgeWorkerUserTurn({
    recorder: {
      hasPersisted: () => false,
      isBlocked: () => false,
      markRuntimePersisted: () => {
        calls += 1;
      },
    },
    messages: [{ role: "user", content: "older turn" }],
    expectedText: "current turn",
  });

  assert.equal(result, "not-found");
  assert.equal(calls, 0);
});

test("does not acknowledge an already persisted Gateway user turn twice", () => {
  let calls = 0;
  const result = acknowledgeWorkerUserTurn({
    recorder: {
      hasPersisted: () => true,
      isBlocked: () => false,
      markRuntimePersisted: () => {
        calls += 1;
      },
    },
    messages: [{ role: "user", content: "current turn" }],
    expectedText: "current turn",
  });

  assert.equal(result, "already-persisted");
  assert.equal(calls, 0);
});
