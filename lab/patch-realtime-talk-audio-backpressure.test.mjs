import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import {
  AUDIO_APPEND_LIMIT,
  AUDIO_APPEND_LIMIT_AFTER,
  AUDIO_APPEND_LIMIT_BEFORE,
  CONTROL_UI_ASSET_AFTER,
  CONTROL_UI_ASSET_BEFORE,
  CONTROL_UI_ASSET_PATH,
  CONTROL_UI_COMPRESSED_ASSETS,
  patchControlUiAssetManifest,
  patchRealtimeTalkAudioBackpressure,
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
  const assets = [
    { path: CONTROL_UI_ASSET_PATH, ...CONTROL_UI_ASSET_BEFORE },
    ...CONTROL_UI_COMPRESSED_ASSETS.map((asset) => ({ path: asset.path, ...asset.before })),
  ];
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
  for (const compressed of CONTROL_UI_COMPRESSED_ASSETS) {
    assert.deepEqual(
      after.assets.find((asset) => asset.path === compressed.path),
      { path: compressed.path, ...compressed.after },
    );
  }
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
  for (const compressed of CONTROL_UI_COMPRESSED_ASSETS) {
    assert.deepEqual(
      manifest.assets.find((asset) => asset.path === compressed.path),
      { path: compressed.path, ...compressed.after },
    );
  }
  assert.equal(patchControlUiAssetManifest(release), release);
});

test("precompressed release artifacts decode to the patched bundle", () => {
  const directory = new URL("./release-files/talk-audio-wan-backpressure/", import.meta.url);
  const bundle = readFileSync(new URL("control-ui-boot-chat-DWTSrxxk.js", directory));
  assert.deepEqual(
    brotliDecompressSync(readFileSync(new URL("control-ui-boot-chat-DWTSrxxk.js.br", directory))),
    bundle,
  );
  assert.deepEqual(
    gunzipSync(readFileSync(new URL("control-ui-boot-chat-DWTSrxxk.js.gz", directory))),
    bundle,
  );
});
