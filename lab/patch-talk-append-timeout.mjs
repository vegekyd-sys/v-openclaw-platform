import assert from "node:assert/strict";

// talk.session.appendAudio carries microphone audio up to the Gateway and is
// issued roughly every 20ms. Its client timeout was 8s, and a timeout does not
// just drop that chunk: failAudioAppend tears the Talk session down, which
// closes it mid-reply and kills the in-flight Agent run with "agent harness
// host capability requires active admitted run authority".
//
// Measured 2026-09-17 on the user's link: the Gateway answered 45 appendAudio
// calls with p50 139ms and max 242ms while the browser still hit the 8s
// timeout, so the delay is the wire, not the server. Over a public tunnel that
// shares one WebSocket with the outbound reply audio, an 8s budget is too tight
// to justify destroying the session.
//
// This is a mitigation, not the fix. The real work is pacing outbound audio so
// the link is not saturated in the first place; this only stops a transient
// stall from ending the conversation.
export const APPEND_TIMEOUT_BEFORE = "vN=32,yN=8e3,bN=8e3,xN=32,";
export const APPEND_TIMEOUT_AFTER = "vN=32,yN=3e4,bN=8e3,xN=32,";

const count = (source, needle) => source.split(needle).length - 1;

export function patchTalkAppendTimeout(source) {
  assert.equal(typeof source, "string", "Control UI bundle must be text");
  if (source.includes(APPEND_TIMEOUT_AFTER)) {
    assert.equal(count(source, APPEND_TIMEOUT_AFTER), 1, "append timeout patch is ambiguous");
    return source;
  }
  assert.equal(count(source, APPEND_TIMEOUT_BEFORE), 1, "append timeout anchor drifted");
  // Only yN moves. bN is a different 8s budget and must stay put.
  return source.replace(APPEND_TIMEOUT_BEFORE, APPEND_TIMEOUT_AFTER);
}
