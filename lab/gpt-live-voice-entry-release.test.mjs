import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assertEntrySnapshot, remoteSource } from "./gpt-live-voice-entry-release.mjs";

const snapshot = { pointer: "/opt/voice/old", unitSha: "unit", environmentSha: "env", gatewayPid: 12,
  gatewayStart: "13", gatewayInvocation: "invocation", configSha: "config", openVoices: 0 };
test("voice cutover rejects a busy call or any concurrent entry/Gateway change", () => {
  assertEntrySnapshot(snapshot, snapshot);
  for (const key of Object.keys(snapshot)) assert.throws(() => assertEntrySnapshot(snapshot, { ...snapshot, [key]: key === "openVoices" ? 1 : "changed" }));
});
test("serialized production controller parses without loading credentials or touching V", () => {
  execFileSync(process.execPath, ["--check", "--input-type=module"], { input: remoteSource() });
});
