import assert from "node:assert/strict";

// The browser emits microphone chunks faster than a WAN relay can acknowledge
// each RPC. Keep the queue bounded, but allow enough headroom for normal WAN
// jitter instead of aborting as soon as four requests overlap.
export const AUDIO_APPEND_LIMIT_BEFORE = "vN=4,yN=8e3";
export const AUDIO_APPEND_LIMIT_AFTER = "vN=32,yN=8e3";
export const AUDIO_APPEND_LIMIT = 32;

const count = (source, needle) => source.split(needle).length - 1;

export function patchRealtimeTalkAudioBackpressure(source) {
  assert.equal(typeof source, "string", "control UI bundle must be text");

  if (source.includes(AUDIO_APPEND_LIMIT_AFTER)) {
    assert.equal(count(source, AUDIO_APPEND_LIMIT_AFTER), 1, "patched limit is ambiguous");
    assert.equal(count(source, AUDIO_APPEND_LIMIT_BEFORE), 0, "bundle is partially patched");
    return source;
  }

  assert.equal(count(source, AUDIO_APPEND_LIMIT_BEFORE), 1, "audio append limit anchor drifted");
  assert.equal(
    count(source, "pendingAudioAppends.size>=vN"),
    1,
    "audio append guard anchor drifted",
  );
  assert.equal(
    count(source, "Realtime Talk audio input fell behind"),
    1,
    "audio append failure anchor drifted",
  );
  return source.replace(AUDIO_APPEND_LIMIT_BEFORE, AUDIO_APPEND_LIMIT_AFTER);
}
