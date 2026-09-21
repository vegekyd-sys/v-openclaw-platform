import assert from "node:assert/strict";
import test from "node:test";
import {
  RTC_ADAPTER_AFTER,
  RTC_BOOT_AFTER,
  addManifestAsset,
  normalizeManifest,
  patchControlUiRtcAdapterVersion,
  patchControlUiServerRtcBootVersion,
} from "./patch-xiaohe-rtc-audio-cache-bust.mjs";

test("versions the RTC boot module served by the Control UI", () => {
  const before = 'const after = `${basePath}/assets/control-ui-boot-chat-DWTSrxxk-rtc-v4.js`;';
  const after = patchControlUiServerRtcBootVersion(before);
  assert.match(after, new RegExp(RTC_BOOT_AFTER));
  assert.equal(patchControlUiServerRtcBootVersion(after), after);
});

test("versions the managed-room adapter dynamic import", () => {
  const before = 'const client = await import("./volcengine-rtc-managed-room-client.js");';
  const after = patchControlUiRtcAdapterVersion(before);
  assert.match(after, new RegExp(RTC_ADAPTER_AFTER.replace(/[.?]/g, "\\$&")));
  assert.equal(patchControlUiRtcAdapterVersion(after), after);
});

test("adds the versioned boot module to the asset manifest", () => {
  const source = JSON.stringify({
    version: 1,
    generation: "stale-on-purpose",
    assets: [{ path: "assets/base.js", sha256: "abc", size: 3 }],
  });
  const result = JSON.parse(addManifestAsset(source, `assets/${RTC_BOOT_AFTER}`, Buffer.from("rtc")));
  assert.equal(result.assets.at(-1).path, `assets/${RTC_BOOT_AFTER}`);
  assert.equal(result.assets.at(-1).size, 3);
  assert.deepEqual(result.assets.map((entry) => entry.path), [...result.assets.map((entry) => entry.path)].sort());
  assert.match(result.generation, /^[a-f0-9]{64}$/);
});

test("normalizes an existing unsorted manifest", () => {
  const source = JSON.stringify({
    version: 1,
    generation: "stale-on-purpose",
    assets: [
      { path: "assets/z.js", sha256: "a".repeat(64), size: 1 },
      { path: "assets/a.js", sha256: "b".repeat(64), size: 2 },
    ],
  });
  const result = JSON.parse(normalizeManifest(source));
  assert.deepEqual(result.assets.map((entry) => entry.path), ["assets/a.js", "assets/z.js"]);
  assert.match(result.generation, /^[a-f0-9]{64}$/);
});
