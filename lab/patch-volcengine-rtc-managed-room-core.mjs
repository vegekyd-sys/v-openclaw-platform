import assert from "node:assert/strict";

export const MANAGED_ROOM_REJECTION =
  '\t\tif (transport === "managed-room") {\n' +
  '\t\t\trejectTalkClientRequest(respond, ErrorCodes.UNAVAILABLE, "managed-room realtime Talk sessions are not available in the browser UI yet");\n' +
  "\t\t\treturn;\n" +
  "\t\t}\n";

export const SESSION_ACCEPT_BEFORE =
  '\t\t\t\tif ((session.transport === "webrtc" || session.transport === "provider-websocket") && !isUnsupportedBrowserWebRtcSession(session) && (!transport || session.transport === transport)) {';
export const SESSION_ACCEPT_AFTER =
  '\t\t\t\tif ((session.transport === "webrtc" || session.transport === "provider-websocket" || session.transport === "managed-room") && !isUnsupportedBrowserWebRtcSession(session) && (!transport || session.transport === transport)) {';

export const PLUGIN_CANCEL_BEFORE =
  "async function cancelInternalRealtimeVoiceBrowserSession(params) {\n" +
  "\tawait readInternalRealtimeVoiceProviderApi(params.provider)?.cancelBrowserSession?.(params.request, params.session);\n" +
  "}";
export const PLUGIN_CANCEL_AFTER =
  "async function cancelInternalRealtimeVoiceBrowserSession(params) {\n" +
  "\tconst internal = readInternalRealtimeVoiceProviderApi(params.provider)?.cancelBrowserSession;\n" +
  "\tif (internal) {\n" +
  "\t\tawait internal(params.request, params.session);\n" +
  "\t\treturn;\n" +
  "\t}\n" +
  "\tawait params.provider.cancelBrowserSession?.(params.request, params.session);\n" +
  "}";

const count = (source, needle) => source.split(needle).length - 1;

function replaceExactlyOnce(source, before, after, label) {
  if (source.includes(after)) {
    assert.equal(count(source, after), 1, `${label} patched anchor is ambiguous`);
    assert.equal(count(source, before), 0, `${label} is partially patched`);
    return source;
  }
  assert.equal(count(source, before), 1, `${label} anchor drifted`);
  return source.replace(before, after);
}

export function patchVolcengineRtcManagedRoomTalk(source) {
  assert.equal(typeof source, "string", "Talk runtime must be text");
  let patched = source;
  if (patched.includes(MANAGED_ROOM_REJECTION)) {
    assert.equal(count(patched, MANAGED_ROOM_REJECTION), 1, "managed-room rejection is ambiguous");
    patched = patched.replace(MANAGED_ROOM_REJECTION, "");
  } else {
    assert.equal(
      patched.includes(SESSION_ACCEPT_AFTER),
      true,
      "managed-room rejection anchor drifted",
    );
  }
  return replaceExactlyOnce(
    patched,
    SESSION_ACCEPT_BEFORE,
    SESSION_ACCEPT_AFTER,
    "managed-room browser session acceptance",
  );
}

export function patchVolcengineRtcManagedRoomHarness(source) {
  assert.equal(typeof source, "string", "Realtime session harness must be text");
  return replaceExactlyOnce(
    source,
    PLUGIN_CANCEL_BEFORE,
    PLUGIN_CANCEL_AFTER,
    "plugin browser-session cancellation",
  );
}
