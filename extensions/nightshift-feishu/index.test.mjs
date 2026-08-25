import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewArgs } from "./review-command.js";

test("parses an exact one-time Night Shift review command", () => {
  assert.deepEqual(parseReviewArgs("approve abcdefghijklmnopqrstuvwxyz012345"), {
    action: "approve",
    token: "abcdefghijklmnopqrstuvwxyz012345",
  });
});

test("rejects unknown actions, short tokens, and trailing arguments", () => {
  assert.throws(() => parseReviewArgs("approve short"));
  assert.throws(() => parseReviewArgs("delete abcdefghijklmnopqrstuvwxyz012345"));
  assert.throws(() => parseReviewArgs("approve abcdefghijklmnopqrstuvwxyz012345 extra"));
});
