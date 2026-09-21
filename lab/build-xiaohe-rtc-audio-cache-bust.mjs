import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RTC_BOOT_AFTER,
  addManifestAsset,
  patchControlUiRtcAdapterVersion,
  patchControlUiServerRtcBootVersion,
} from "./patch-xiaohe-rtc-audio-cache-bust.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "lab/release-files/xiaohe-rtc-audio-cache-bust");
const planPath = resolve(root, "lab/xiaohe-rtc-audio-cache-bust-plan.json");
const inputs = {
  server: resolve(root, "lab/release-files/xiaohe-ui-import-map-match/control-ui-DhD7PO_6.js"),
  manifest: resolve(root, "lab/release-files/xiaohe-ui-import-map/asset-manifest.json"),
  boot: resolve(root, "lab/release-files/xiaohe-ui-import-map/control-ui-boot-chat-DWTSrxxk-rtc-v4.js"),
};
const expected = {
  server: "fb92c027f5789f3f8c2fffa76595aeec880e9a7da67c7e3347b5114ee8102085",
  manifest: "3e359090a1ab840f7bd42a22560237d51bd7b036a0d43d01e8e04a47162254ab",
  boot: "71f6b0960f0d4d38ac586892bf0bbed30f270e55d227cf2d0e63e54f454c9c4b",
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function checkedRead(key) {
  const value = readFileSync(inputs[key]);
  assert.equal(sha256(value), expected[key], `${key} input drifted`);
  return value;
}

export function build() {
  const server = Buffer.from(patchControlUiServerRtcBootVersion(checkedRead("server").toString("utf8")));
  const boot = Buffer.from(patchControlUiRtcAdapterVersion(checkedRead("boot").toString("utf8")));
  const manifest = Buffer.from(
    addManifestAsset(checkedRead("manifest").toString("utf8"), `assets/${RTC_BOOT_AFTER}`, boot),
  );
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "control-ui-DhD7PO_6.js"), server);
  writeFileSync(resolve(outputDir, RTC_BOOT_AFTER), boot);
  writeFileSync(resolve(outputDir, "asset-manifest.json"), manifest);
  const plan = {
    baseRelease: "xiaohe-rtc-audio-startup-v1",
    tests: ["lab/patch-xiaohe-rtc-audio-cache-bust.test.mjs"],
    support: ["lab/patch-xiaohe-rtc-audio-cache-bust.mjs"],
    timeoutSeconds: 60,
    files: [
      {
        source: "lab/release-files/xiaohe-rtc-audio-cache-bust/control-ui-DhD7PO_6.js",
        target: "openclaw/dist/control-ui-DhD7PO_6.js",
        before: expected.server,
      },
      {
        source: "lab/release-files/xiaohe-rtc-audio-cache-bust/asset-manifest.json",
        target: "openclaw/dist/control-ui/asset-manifest.json",
        before: expected.manifest,
      },
      {
        source: `lab/release-files/xiaohe-rtc-audio-cache-bust/${RTC_BOOT_AFTER}`,
        target: `openclaw/dist/control-ui/assets/${RTC_BOOT_AFTER}`,
        before: null,
      },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return {
    planPath,
    hashes: { server: sha256(server), manifest: sha256(manifest), boot: sha256(boot) },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
