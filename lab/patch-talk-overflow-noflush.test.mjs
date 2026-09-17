import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OVERFLOW_FLUSH_AFTER,
  OVERFLOW_FLUSH_BEFORE,
  patchTalkOverflowNoFlush,
} from "./patch-talk-overflow-noflush.mjs";

const fixture = readFileSync(
  new URL("./fixtures/talk-overflow-noflush/control-ui-boot-chat-DWTSrxxk.js", import.meta.url),
  "utf8",
);

test("an overflow no longer flushes unheard audio, a real interruption still does", () => {
  assert.equal(fixture.includes(OVERFLOW_FLUSH_BEFORE), true, "fixture lost the unconditional flush");
  const patched = patchTalkOverflowNoFlush(fixture);
  assert.equal(patched.includes(OVERFLOW_FLUSH_AFTER), true);
  // The RPC must still be sent so the server keeps observing the condition.
  assert.match(patched, /talk\.session\.cancelOutput/u);
  // The flush must still run for every other reason, including barge-in.
  assert.match(patched, /e!==`playback-overflow`&&this\.stopOutput/u);
  assert.equal(patchTalkOverflowNoFlush(patched), patched);
});

test("fails closed on drift", () => {
  assert.throws(() => patchTalkOverflowNoFlush("unrelated"), /anchor drifted/u);
});
