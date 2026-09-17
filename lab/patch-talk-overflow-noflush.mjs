import assert from "node:assert/strict";

// The Control UI flushes its own playback queue inside cancelOutput, before the
// RPC is even sent:
//
//   this.stopOutput({releaseDelayedToolResults:!1}),
//   this.ctx.client.request(`talk.session.cancelOutput`, ...)
//
// For a real interruption that is correct. For "playback-overflow" it is
// backwards: the browser is reporting that its queue is FULL, and the response
// throws away exactly the audio the user has not heard yet. A reply that was
// mid-sentence stops dead.
//
// This also means no Gateway-side change can fix the overflow case - by the
// time the server sees the request the queue is already gone.
//
// Keep sending the RPC so the server still observes the condition; only skip
// the local flush for that one reason.
export const OVERFLOW_FLUSH_BEFORE =
  "this.pauseDelayedToolResults(),this.stopOutput({releaseDelayedToolResults:!1}),";
export const OVERFLOW_FLUSH_AFTER =
  "this.pauseDelayedToolResults(),e!==`playback-overflow`&&this.stopOutput({releaseDelayedToolResults:!1}),";

const count = (source, needle) => source.split(needle).length - 1;

export function patchTalkOverflowNoFlush(source) {
  assert.equal(typeof source, "string", "Control UI bundle must be text");
  if (source.includes(OVERFLOW_FLUSH_AFTER)) {
    assert.equal(count(source, OVERFLOW_FLUSH_AFTER), 1, "overflow flush patch is ambiguous");
    return source;
  }
  assert.equal(count(source, OVERFLOW_FLUSH_BEFORE), 1, "overflow flush anchor drifted");
  return source.replace(OVERFLOW_FLUSH_BEFORE, OVERFLOW_FLUSH_AFTER);
}
