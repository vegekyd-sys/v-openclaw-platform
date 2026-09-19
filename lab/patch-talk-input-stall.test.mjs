import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUDIO_APPEND_LIMIT,
  AUDIO_APPEND_LIMIT_AFTER,
  AUDIO_APPEND_LIMIT_BEFORE,
  AUDIO_BACKLOG_COVERAGE_MS,
  MICROPHONE_GUARD_AFTER,
  MICROPHONE_GUARD_BEFORE,
  patchTalkInputStall,
} from "./patch-talk-input-stall.mjs";

const fixture = readFileSync(
  new URL(
    "./release-files/talk-append-timeout/control-ui-boot-chat-DWTSrxxk.js",
    import.meta.url,
  ),
  "utf8",
);

test("preserves microphone audio through the full append timeout window", () => {
  const patched = patchTalkInputStall(fixture);
  assert.equal(AUDIO_APPEND_LIMIT, 192);
  assert(AUDIO_BACKLOG_COVERAGE_MS > 30_000, "queue must outlive the append timeout");
  assert(AUDIO_BACKLOG_COVERAGE_MS < 35_000, "queue must remain tightly bounded");
  assert.equal(patched.includes(AUDIO_APPEND_LIMIT_BEFORE), false);
  assert.equal(patched.includes(AUDIO_APPEND_LIMIT_AFTER), true);
  assert.match(patched, /talk\.session\.appendAudio[\s\S]{0,260}timeoutMs:yN/u);
  assert.equal(patched.includes("yN=3e4"), true, "append timeout regressed");
  assert.equal(patched.includes("bN=8e3"), true, "unrelated close timeout moved");
});

test("does not erase barge-in speech while output cancellation is pending", () => {
  const patched = patchTalkInputStall(fixture);
  assert.equal(patched.includes(MICROPHONE_GUARD_BEFORE), false);
  assert.equal(patched.includes(MICROPHONE_GUARD_AFTER), true);
  assert.match(
    patched,
    /detectBargeInSpeech\(e\)&&this\.cancelOutputForBargeIn\(\);let t=this\.audioAppendAbortController;if\(!t\|\|t\.signal\.aborted\)return;/u,
  );
  assert.match(
    patched,
    /pendingAudioAppends\.size>=vN\)return;let n=Ch\(e\),r=this\.ctx\.client\.request\(`talk\.session\.appendAudio`/u,
  );
});

test("is idempotent and fails closed on drift or partial application", () => {
  const patched = patchTalkInputStall(fixture);
  assert.equal(patchTalkInputStall(patched), patched);
  assert.throws(() => patchTalkInputStall("unrelated"), /anchor drifted/u);
  assert.throws(
    () => patchTalkInputStall(fixture.replace(AUDIO_APPEND_LIMIT_BEFORE, AUDIO_APPEND_LIMIT_AFTER)),
    /partial/u,
  );
});
