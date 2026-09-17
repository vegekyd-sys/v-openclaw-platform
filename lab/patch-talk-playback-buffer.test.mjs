import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAYBACK_BUFFER_AFTER,
  PLAYBACK_BUFFER_BEFORE,
  patchTalkPlaybackBuffer,
} from "./patch-talk-playback-buffer.mjs";

const fixture = readFileSync(
  new URL("./fixtures/talk-playback-buffer/control-ui-boot-shared-VfuwipMj.js", import.meta.url),
  "utf8",
);

test("raises the playback lead budget exactly once", () => {
  assert.equal(fixture.includes(PLAYBACK_BUFFER_BEFORE), true, "fixture no longer carries the old bound");
  const patched = patchTalkPlaybackBuffer(fixture);
  assert.equal(patched.includes(PLAYBACK_BUFFER_AFTER), true);
  assert.equal(patched.includes(PLAYBACK_BUFFER_BEFORE), false);
  // "10"->"120" and "320"->"8000" add one character each.
  assert.equal(patched.length, fixture.length + 2);
  assert.equal(patchTalkPlaybackBuffer(patched), patched);
});

test("the constants belong only to the audio queue", () => {
  // _E and vE are minified per file. Guard against widening an unrelated
  // constant: both may appear only in the declaration and inside play().
  const uses = (name) => fixture.match(new RegExp(`[^A-Za-z0-9_$]${name}[^A-Za-z0-9_$]`, "gu")) ?? [];
  assert.equal(uses("_E").length, 4);
  assert.equal(uses("vE").length, 3);
  const play = fixture.slice(fixture.indexOf("play(e,t,n){"), fixture.indexOf("play(e,t,n){") + 400);
  assert.match(play, /this\.sources\.size>=vE/u);
  assert.match(play, /a=_E-i/u);
});

test("fails closed on drift", () => {
  assert.throws(() => patchTalkPlaybackBuffer("unrelated"), /anchor drifted/u);
});
