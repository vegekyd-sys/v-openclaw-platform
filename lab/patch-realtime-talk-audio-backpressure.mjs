import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// The browser emits microphone chunks faster than a WAN relay can acknowledge
// each RPC. Keep the queue bounded, but allow enough headroom for normal WAN
// jitter instead of aborting as soon as four requests overlap.
export const AUDIO_APPEND_LIMIT_BEFORE = "vN=4,yN=8e3";
export const AUDIO_APPEND_LIMIT_AFTER = "vN=32,yN=8e3";
export const AUDIO_APPEND_LIMIT = 32;
export const CONTROL_UI_ASSET_PATH = "assets/control-ui-boot-chat-DWTSrxxk.js";
export const CONTROL_UI_ASSET_BEFORE = {
  sha256: "ef2fb5a520b04cdc214fb055652c3c307f683b5f245216644b74859253391bb1",
  size: 785579,
};
export const CONTROL_UI_ASSET_AFTER = {
  sha256: "6f9b3d199a587cd8ed85117b2bb21c0e0665682ec7a38692a95a8897c3358e57",
  size: 785580,
};
export const CONTROL_UI_COMPRESSED_ASSETS = [
  {
    path: `${CONTROL_UI_ASSET_PATH}.br`,
    before: {
      sha256: "0abfd28a4cc2afa954f5f1462af1de9d53e49177cab0b0d662ad53f322af3ef7",
      size: 188564,
    },
    after: {
      sha256: "8f23ce143f4f34c39d2addf3ab7b0a148588c4941ed54b65f90653e57f9ab4ce",
      size: 174060,
    },
  },
  {
    path: `${CONTROL_UI_ASSET_PATH}.gz`,
    before: {
      sha256: "15b58a1ff8080f96e20706d2fa2ffac0257a0079d3e1d59d9972c133f4b3b0bf",
      size: 214433,
    },
    after: {
      sha256: "dcaad0c597c79a8746fe531e64215e51d98bc30768bfb678313e820ddfd539a4",
      size: 214432,
    },
  },
];

const count = (source, needle) => source.split(needle).length - 1;

export function patchRealtimeTalkAudioBackpressure(source) {
  assert.equal(typeof source, "string", "control UI bundle must be text");

  if (source.includes(AUDIO_APPEND_LIMIT_AFTER)) {
    assert.equal(count(source, AUDIO_APPEND_LIMIT_AFTER), 1, "patched limit is ambiguous");
    assert.equal(count(source, AUDIO_APPEND_LIMIT_BEFORE), 0, "bundle is partially patched");
    return source;
  }

  assert.equal(count(source, AUDIO_APPEND_LIMIT_BEFORE), 1, "audio append limit anchor drifted");
  assert.equal(
    count(source, "pendingAudioAppends.size>=vN"),
    1,
    "audio append guard anchor drifted",
  );
  assert.equal(
    count(source, "Realtime Talk audio input fell behind"),
    1,
    "audio append failure anchor drifted",
  );
  return source.replace(AUDIO_APPEND_LIMIT_BEFORE, AUDIO_APPEND_LIMIT_AFTER);
}

function hashManifestAssets(assets) {
  const hash = createHash("sha256");
  for (const asset of assets) {
    hash.update(asset.path);
    hash.update("\0");
    hash.update(String(asset.size));
    hash.update("\0");
    hash.update(asset.sha256);
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function patchControlUiAssetManifest(source) {
  const manifest = JSON.parse(source);
  assert.equal(manifest.version, 1, "unsupported Control UI asset manifest");
  assert(Array.isArray(manifest.assets), "Control UI manifest assets are missing");
  assert.equal(
    manifest.generation,
    hashManifestAssets(manifest.assets),
    "Control UI manifest generation drifted",
  );
  const replacements = [
    { path: CONTROL_UI_ASSET_PATH, before: CONTROL_UI_ASSET_BEFORE, after: CONTROL_UI_ASSET_AFTER },
    ...CONTROL_UI_COMPRESSED_ASSETS,
  ];
  for (const replacement of replacements) {
    const matches = manifest.assets.filter((asset) => asset.path === replacement.path);
    assert.equal(matches.length, 1, `Control UI manifest entry drifted: ${replacement.path}`);
    const entry = matches[0];
    if (entry.sha256 === replacement.after.sha256 && entry.size === replacement.after.size) continue;
    assert.deepEqual(
      { sha256: entry.sha256, size: entry.size },
      replacement.before,
      `Control UI manifest value drifted: ${replacement.path}`,
    );
    Object.assign(entry, replacement.after);
  }
  manifest.generation = hashManifestAssets(manifest.assets);
  return `${JSON.stringify(manifest)}\n`;
}
