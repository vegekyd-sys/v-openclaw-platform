import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUDIO_APPEND_LIMIT,
  AUDIO_APPEND_LIMIT_AFTER,
  AUDIO_APPEND_LIMIT_BEFORE,
  CONTROL_UI_ASSET_AFTER,
  CONTROL_UI_ASSET_BEFORE,
  CONTROL_UI_ASSET_PATH,
  PRECOMPRESSED_GUARD_AFTER,
  PRECOMPRESSED_GUARD_BEFORE,
  patchControlUiAssetManifest,
  patchRealtimeTalkAudioBackpressure,
  patchRealtimeTalkPrecompressedFallback,
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

test("manifest patch publishes a new retained Control UI generation", () => {
  const assets = [{ path: CONTROL_UI_ASSET_PATH, ...CONTROL_UI_ASSET_BEFORE }];
  const before = {
    version: 1,
    generation: "",
    assets,
  };
  const manifestHash = createHash("sha256")
    .update(assets.map((asset) => `${asset.path}\0${asset.size}\0${asset.sha256}\n`).join(""))
    .digest("hex");
  before.generation = manifestHash;
  const patched = patchControlUiAssetManifest(JSON.stringify(before));
  const after = JSON.parse(patched);
  assert.deepEqual(after.assets[0], { path: CONTROL_UI_ASSET_PATH, ...CONTROL_UI_ASSET_AFTER });
  assert.notEqual(after.generation, before.generation);
  assert.equal(patchControlUiAssetManifest(patched), patched);
});

test("release manifest points at the patched bundle", () => {
  const release = readFileSync(
    new URL(
      "./release-files/talk-audio-wan-backpressure/asset-manifest.json",
      import.meta.url,
    ),
    "utf8",
  );
  const manifest = JSON.parse(release);
  const entry = manifest.assets.find((asset) => asset.path === CONTROL_UI_ASSET_PATH);
  assert.deepEqual(entry, { path: CONTROL_UI_ASSET_PATH, ...CONTROL_UI_ASSET_AFTER });
  assert.equal(patchControlUiAssetManifest(release), release);
});

test("patched Talk bundle bypasses stale precompressed sidecars", () => {
  const fixture = `function resolveOpenedControlUiRepresentation(params) {\n\tconst { req, precompressed } = params;\n\tconst extension = \".js\";\n\t${PRECOMPRESSED_GUARD_BEFORE}\n\treturn encodings;\n}`;
  const patched = patchRealtimeTalkPrecompressedFallback(fixture);
  assert.equal(patched.includes(PRECOMPRESSED_GUARD_BEFORE), false);
  assert.equal(patched.includes(PRECOMPRESSED_GUARD_AFTER), true);
  assert.equal(patchRealtimeTalkPrecompressedFallback(patched), patched);
});

test("release server artifact contains the scoped identity fallback", () => {
  const release = readFileSync(
    new URL(
      "./release-files/talk-audio-wan-backpressure/control-ui-DhD7PO_6.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(patchRealtimeTalkPrecompressedFallback(release), release);
  assert.equal(release.includes(PRECOMPRESSED_GUARD_AFTER), true);
});
