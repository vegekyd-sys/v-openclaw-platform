import assert from "node:assert/strict";
import test from "node:test";
import { validateJobInput } from "../src/validation.mjs";

const base = {
  owner: "ou-test", session: "agent:test:group:1", request: "run tests",
  idempotencyKey: "session:message", projectPath: "/tmp/project", command: ["npm", "test"],
};

test("accepts bounded argv work", () => {
  const value = validateJobInput(base);
  assert.equal(value.cpu, "1");
  assert.equal(value.memory, "2Gi");
  assert.equal(value.networkProfile, "offline");
});

test("blocks host-control commands", () => {
  assert.throws(() => validateJobInput({ ...base, command: ["docker", "ps"] }), /blocked/);
});

test("blocks shell by default and unsafe artifacts", () => {
  assert.throws(() => validateJobInput({ ...base, command: ["bash", "-lc", "npm test"] }), /operator-only/);
  assert.throws(() => validateJobInput({ ...base, collect: ["../secret"] }), /unsafe artifact/);
});
