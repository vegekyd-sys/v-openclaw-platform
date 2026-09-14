import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUDIO_APPEND_LIMIT,
  AUDIO_APPEND_LIMIT_AFTER,
  AUDIO_APPEND_LIMIT_BEFORE,
  patchRealtimeTalkAudioBackpressure,
} from "./patch-realtime-talk-audio-backpressure.mjs";

const fixture = `const ${AUDIO_APPEND_LIMIT_BEFORE};class Talk{append(){if(this.pendingAudioAppends.size>=vN){this.failAudioAppend(\"Realtime Talk audio input fell behind\");return}this.pendingAudioAppends.add(r)}}`;

test("raises the bounded audio append window for WAN jitter", () => {
  const patched = patchRealtimeTalkAudioBackpressure(fixture);
  assert.equal(AUDIO_APPEND_LIMIT, 32);
  assert.equal(patched.includes(AUDIO_APPEND_LIMIT_BEFORE), false);
  assert.equal(patched.includes(AUDIO_APPEND_LIMIT_AFTER), true);
  assert.match(patched, /pendingAudioAppends\.size>=vN/);
});

test("patch is idempotent and fails closed on bundle drift", () => {
  const patched = patchRealtimeTalkAudioBackpressure(fixture);
  assert.equal(patchRealtimeTalkAudioBackpressure(patched), patched);
  assert.throws(
    () => patchRealtimeTalkAudioBackpressure("const vN=4,yN=8e3;"),
    /audio append guard anchor drifted/,
  );
  assert.throws(
    () => patchRealtimeTalkAudioBackpressure(`${fixture}${fixture}`),
    /audio append limit anchor drifted/,
  );
});

test("release artifact contains the reviewed bounded limit", () => {
  const release = readFileSync(
    new URL(
      "./release-files/talk-audio-wan-backpressure/control-ui-boot-chat-DWTSrxxk.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(patchRealtimeTalkAudioBackpressure(release), release);
  assert.equal(release.includes(AUDIO_APPEND_LIMIT_BEFORE), false);
  assert.equal(
    createHash("sha256").update(release).digest("hex"),
    "6f9b3d199a587cd8ed85117b2bb21c0e0665682ec7a38692a95a8897c3358e57",
  );
});
