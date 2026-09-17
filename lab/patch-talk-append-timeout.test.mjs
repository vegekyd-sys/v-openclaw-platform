import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPEND_TIMEOUT_AFTER,
  APPEND_TIMEOUT_BEFORE,
  patchTalkAppendTimeout,
} from "./patch-talk-append-timeout.mjs";

const fixture = readFileSync(
  new URL("./fixtures/talk-append-timeout/control-ui-boot-chat-DWTSrxxk.js", import.meta.url),
  "utf8",
);

test("only the appendAudio budget moves", () => {
  const patched = patchTalkAppendTimeout(fixture);
  assert.equal(patched.includes("yN=3e4"), true);
  // yN is the one referenced by the appendAudio request.
  assert.match(patched, /talk\.session\.appendAudio[\s\S]{0,260}timeoutMs:yN/u);
  // The neighbouring 8s budget and the pending-append cap are untouched.
  assert.equal(patched.includes("bN=8e3"), true, "the neighbouring budget moved");
  assert.equal(patched.includes("vN=32"), true, "the pending append cap moved");
  assert.equal(patched.length, fixture.length, "the patch changed the file length");
  assert.equal(patchTalkAppendTimeout(patched), patched);
});

test("fails closed on drift", () => {
  assert.throws(() => patchTalkAppendTimeout("unrelated"), /anchor drifted/u);
});
