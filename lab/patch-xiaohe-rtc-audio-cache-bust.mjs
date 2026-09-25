import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const RTC_BOOT_BEFORE = "control-ui-boot-chat-DWTSrxxk-rtc-v4.js";
export const RTC_BOOT_AFTER = "control-ui-boot-chat-DWTSrxxk-rtc-v5.js";
export const RTC_ADAPTER_BEFORE = "./volcengine-rtc-managed-room-client.js";
export const RTC_ADAPTER_AFTER =
  "./volcengine-rtc-managed-room-client.js?xiaohe-audio-startup-v1";

const count = (source, needle) => source.split(needle).length - 1;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function patchControlUiServerRtcBootVersion(source) {
  assert.equal(typeof source, "string", "Control UI server module must be text");
  if (source.includes(RTC_BOOT_AFTER)) {
    assert.equal(count(source, RTC_BOOT_AFTER), 1, "RTC boot version patch is ambiguous");
    return source;
  }
  assert.equal(count(source, RTC_BOOT_BEFORE), 1, "RTC boot version anchor drifted");
  return source.replace(RTC_BOOT_BEFORE, RTC_BOOT_AFTER);
}

export function patchControlUiRtcAdapterVersion(source) {
  assert.equal(typeof source, "string", "RTC boot module must be text");
  if (source.includes(RTC_ADAPTER_AFTER)) {
    assert.equal(count(source, RTC_ADAPTER_AFTER), 1, "RTC adapter version patch is ambiguous");
    return source;
  }
  assert.equal(count(source, `import(\"${RTC_ADAPTER_BEFORE}\")`), 1, "RTC adapter import anchor drifted");
  return source.replace(RTC_ADAPTER_BEFORE, RTC_ADAPTER_AFTER);
}

export function addManifestAsset(manifestSource, assetPath, assetBytes) {
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.version, 1, "unsupported Control UI manifest");
  assert.equal(
    manifest.assets.some((entry) => entry.path === assetPath),
    false,
    "versioned RTC boot asset already exists",
  );
  manifest.assets.push({
    path: assetPath,
    sha256: sha256(assetBytes),
    size: Buffer.byteLength(assetBytes),
  });
  manifest.assets.sort((left, right) => left.path.localeCompare(right.path));
  return serializeManifest(manifest);
}

export function normalizeManifest(manifestSource) {
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.version, 1, "unsupported Control UI manifest");
  manifest.assets.sort((left, right) => left.path.localeCompare(right.path));
  return serializeManifest(manifest);
}

export function updateManifestAsset(manifestSource, assetPath, assetBytes) {
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.version, 1, "unsupported Control UI manifest");
  const matches = manifest.assets.filter((entry) => entry.path === assetPath);
  assert.equal(matches.length, 1, "Control UI asset manifest entry drifted");
  matches[0].sha256 = sha256(assetBytes);
  matches[0].size = Buffer.byteLength(assetBytes);
  manifest.assets.sort((left, right) => left.path.localeCompare(right.path));
  return serializeManifest(manifest);
}

function serializeManifest(manifest) {
  const hash = createHash("sha256");
  for (const asset of manifest.assets) {
    hash.update(asset.path);
    hash.update("\0");
    hash.update(String(asset.size));
    hash.update("\0");
    hash.update(asset.sha256);
    hash.update("\n");
  }
  manifest.generation = hash.digest("hex");
  return `${JSON.stringify(manifest)}\n`;
}
