import assert from "node:assert/strict";

// The browser produces one 4096-frame microphone chunk about every 171ms at
// 24kHz.  The previous cap of 32 therefore preserved only ~5.5s of speech
// while appendAudio acknowledgements were stalled.  The Gateway has been
// observed taking 8-11.4s to acknowledge these calls, so the old guard silently
// discarded the rest of an otherwise healthy utterance.
//
// Keep the queue bounded, but align it with the existing 30s append timeout.
// 192 chunks cover 32.8s and are ~2 MiB of PCM after base64 encoding.  If the
// Gateway cannot recover inside the timeout, the existing failure path still
// closes the unhealthy session instead of growing memory without bound.
export const AUDIO_APPEND_LIMIT_BEFORE = "vN=32,yN=3e4,bN=8e3,xN=32,";
export const AUDIO_APPEND_LIMIT_AFTER = "vN=192,yN=3e4,bN=8e3,xN=32,";
export const AUDIO_APPEND_LIMIT = 192;
export const AUDIO_CHUNK_FRAMES = 4096;
export const AUDIO_SAMPLE_RATE_HZ = 24_000;
export const AUDIO_BACKLOG_COVERAGE_MS =
  (AUDIO_APPEND_LIMIT * AUDIO_CHUNK_FRAMES * 1000) / AUDIO_SAMPLE_RATE_HZ;

// Barge-in used to increment pendingOutputCancellations and then immediately
// drop the very microphone frames that caused the interruption.  On a slow
// cancelOutput acknowledgement that can erase the user's whole follow-up.
// Sending input while cancellation is pending is safe: the relay already owns
// turn ordering, and preserving speech is strictly better than silent loss.
export const MICROPHONE_GUARD_BEFORE =
  "if(!t||t.signal.aborted||this.pendingOutputCancellations)return;if(this.pendingAudioAppends.size>=vN)return;";
export const MICROPHONE_GUARD_AFTER =
  "if(!t||t.signal.aborted)return;if(this.pendingAudioAppends.size>=vN)return;";

const count = (source, needle) => source.split(needle).length - 1;

export function patchTalkInputStall(source) {
  assert.equal(typeof source, "string", "Control UI bundle must be text");

  const hasLimitAfter = source.includes(AUDIO_APPEND_LIMIT_AFTER);
  const hasGuardAfter = source.includes(MICROPHONE_GUARD_AFTER);
  if (hasLimitAfter || hasGuardAfter) {
    assert.equal(hasLimitAfter, true, "input-stall limit patch is partial");
    assert.equal(hasGuardAfter, true, "input-stall guard patch is partial");
    assert.equal(count(source, AUDIO_APPEND_LIMIT_AFTER), 1, "patched limit is ambiguous");
    assert.equal(count(source, MICROPHONE_GUARD_AFTER), 1, "patched guard is ambiguous");
    assert.equal(count(source, AUDIO_APPEND_LIMIT_BEFORE), 0, "old limit remains");
    assert.equal(count(source, MICROPHONE_GUARD_BEFORE), 0, "old guard remains");
    return source;
  }

  assert.equal(count(source, AUDIO_APPEND_LIMIT_BEFORE), 1, "audio append limit anchor drifted");
  assert.equal(count(source, MICROPHONE_GUARD_BEFORE), 1, "microphone guard anchor drifted");
  return source
    .replace(AUDIO_APPEND_LIMIT_BEFORE, AUDIO_APPEND_LIMIT_AFTER)
    .replace(MICROPHONE_GUARD_BEFORE, MICROPHONE_GUARD_AFTER);
}
