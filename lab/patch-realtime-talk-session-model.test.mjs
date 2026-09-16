import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  REALTIME_TALK_SESSION_MODEL_AFTER,
  REALTIME_TALK_SESSION_MODEL_BEFORE,
  patchRealtimeTalkSessionModel,
} from "./patch-realtime-talk-session-model.mjs";

const fixture = readFileSync(
  new URL(
    "./fixtures/realtime-talk-session-model/realtime-session-harness-CEO5kVAJ.js",
    import.meta.url,
  ),
  "utf8",
);

test("Talk Agent consult inherits the selected session provider and model", () => {
  const patched = patchRealtimeTalkSessionModel(fixture);
  assert.equal(patched.includes(REALTIME_TALK_SESSION_MODEL_BEFORE), false);
  assert.equal(patched.includes(REALTIME_TALK_SESSION_MODEL_AFTER), true);
  assert.match(patched, /sessionEntry\.providerOverride/u);
  assert.match(patched, /sessionEntry\.modelOverride/u);
  assert.equal(patchRealtimeTalkSessionModel(patched), patched);
});

test("Talk Agent consult patch fails closed when the runtime anchor drifts", () => {
  assert.throws(
    () => patchRealtimeTalkSessionModel("const unrelated = true;"),
    /anchor drifted/u,
  );
});
