import assert from "node:assert/strict";

// The Control UI schedules provider audio directly onto the AudioContext and
// refuses anything that would buffer more than _E seconds ahead of the
// playhead. Seeduplex delivers a finished reply far faster than real time, so a
// 29-second answer overran the 10-second budget: the opening played, every
// frame that arrived while the buffer was full was dropped outright by play(),
// and the tail resumed once the playhead caught up. That is the reported
// "speaks the start, skips the middle, speaks the end".
//
// This raises the bound. It is not real backpressure - a reply longer than the
// new budget would still lose audio - but it removes the loss for the reply
// lengths this product actually produces, with a stated limit.
export const PLAYBACK_BUFFER_BEFORE = "_E=10,vE=320,yE=class{";
export const PLAYBACK_BUFFER_AFTER = "_E=120,vE=8000,yE=class{";

const count = (source, needle) => source.split(needle).length - 1;

export function patchTalkPlaybackBuffer(source) {
  assert.equal(typeof source, "string", "Control UI bundle must be text");
  if (source.includes(PLAYBACK_BUFFER_AFTER)) {
    assert.equal(count(source, PLAYBACK_BUFFER_AFTER), 1, "playback buffer patch is ambiguous");
    assert.equal(count(source, PLAYBACK_BUFFER_BEFORE), 0, "playback buffer patch is partially applied");
    return source;
  }
  assert.equal(count(source, PLAYBACK_BUFFER_BEFORE), 1, "playback buffer anchor drifted");
  return source.replace(PLAYBACK_BUFFER_BEFORE, PLAYBACK_BUFFER_AFTER);
}
