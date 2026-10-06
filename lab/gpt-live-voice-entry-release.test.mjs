import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assertEntrySnapshot, entryLaunchOverride, remoteSource } from "./gpt-live-voice-entry-release.mjs";

const snapshot = { pointer: "/opt/voice/old", unitSha: "unit", environmentSha: "env", gatewayPid: 12,
  gatewayStart: "13", gatewayInvocation: "invocation", configSha: "config", openVoices: 0 };
test("voice cutover rejects a busy call or any concurrent entry/Gateway change", () => {
  assertEntrySnapshot(snapshot, snapshot);
  for (const key of Object.keys(snapshot)) assert.throws(() => assertEntrySnapshot(snapshot, { ...snapshot, [key]: key === "openVoices" ? 1 : "changed" }));
});
test('H5-only cutover also refuses a live direct-provider relay or an unknown connection count', () => {
  const idle={...snapshot,relayConnections:0};
  assertEntrySnapshot(idle,idle);
  assert.throws(()=>assertEntrySnapshot(idle,{...idle,relayConnections:1}));
  assert.throws(()=>assertEntrySnapshot(idle,snapshot));
});
test("serialized production controller parses without loading credentials or touching V", () => {
  execFileSync(process.execPath, ["--check", "--input-type=module"], { input: remoteSource() });
});
test("symlink launcher uses the frozen real entrypoint and retains existing Node flags", () => {
  const definition = "{ path=/opt/node/bin/node ; argv[]=/opt/node/bin/node --max-old-space-size=512 /opt/openclaw-voice-h5/current/server.mjs ; ignore_errors=no ; }";
  const real = "/opt/openclaw-voice-h5/releases/gpt-live-abc/lab/gpt-live-h5/server.mjs";
  assert.equal(entryLaunchOverride(definition, real), "[Service]\nExecStart=\nExecStart=/opt/node/bin/node --max-old-space-size=512 " + real + "\n");
  assert.throws(() => entryLaunchOverride(definition, "/tmp/foreign/server.mjs"));
  assert.throws(() => entryLaunchOverride(definition.replace("/opt/openclaw-voice-h5/current/", "/tmp/foreign/"), real));
  assert.throws(() => entryLaunchOverride(definition.replace(" ; ignore_errors", "\n ; ignore_errors"), real));
});

test("native provider environment stays in the owned private release and rejects foreign paths", () => {
  const definition = "{ path=/opt/node/bin/node ; argv[]=/opt/node/bin/node /opt/openclaw-voice-h5/current/server.mjs ; ignore_errors=no ; }";
  const server = "/opt/openclaw-voice-h5/releases/gpt-live-abc/lab/gpt-live-h5/server.mjs";
  const env = "/opt/openclaw-voice-h5/releases/gpt-live-abc/native-voice.env";
  assert(entryLaunchOverride(definition, server, env).endsWith("EnvironmentFile=" + env + "\n"));
  assert.throws(() => entryLaunchOverride(definition, server, "/tmp/foreign.env"));
  assert.throws(() => entryLaunchOverride(definition, server, env + "\nUser=root"));
});
