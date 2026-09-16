import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTROL_UI_ASSET_BEFORE,
  describeAsset,
  patchControlUiAssetManifest,
  patchRealtimeTalkAgentContinuation,
} from "./patch-realtime-talk-agent-continuation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = "openclaw/dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk.js";
const manifestTarget = "openclaw/dist/control-ui/asset-manifest.json";
const baseOutputDir = resolve(root, "lab/release-files/talk-audio-wan-backpressure");
const outputDir = resolve(root, "lab/release-files/talk-agent-continuation");
const bundleOutput = resolve(outputDir, "control-ui-boot-chat-DWTSrxxk.js");
const manifestOutput = resolve(outputDir, "asset-manifest.json");
const planPath = resolve(root, "lab/realtime-talk-agent-continuation-plan.json");
const expectedBaseRelease = "talk-audio-wan-backpressure-v3";
const expectedManifestSha = "d26f184ddd625458a08abfbbfde4433aaadb46a75f777ec43122b2d7da3a9f95";
export function build() {
  const bundleBefore = readFileSync(
    resolve(baseOutputDir, "control-ui-boot-chat-DWTSrxxk.js"),
  );
  assert.deepEqual(describeAsset(bundleBefore), CONTROL_UI_ASSET_BEFORE, "bundle drifted");
  const bundleAfter = patchRealtimeTalkAgentContinuation(bundleBefore.toString("utf8"));
  const nextAsset = describeAsset(bundleAfter);

  const manifestBefore = readFileSync(resolve(baseOutputDir, "asset-manifest.json"));
  assert.equal(describeAsset(manifestBefore).sha256, expectedManifestSha, "manifest drifted");
  const manifestAfter = patchControlUiAssetManifest(manifestBefore.toString("utf8"), nextAsset);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(bundleOutput, bundleAfter);
  writeFileSync(manifestOutput, manifestAfter);

  const plan = {
    baseRelease: expectedBaseRelease,
    files: [
      {
        source: "lab/release-files/talk-agent-continuation/control-ui-boot-chat-DWTSrxxk.js",
        target,
        before: CONTROL_UI_ASSET_BEFORE.sha256,
      },
      {
        source: "lab/release-files/talk-agent-continuation/asset-manifest.json",
        target: manifestTarget,
        before: expectedManifestSha,
      },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  return { baseRelease: expectedBaseRelease, bundle: nextAsset, manifest: describeAsset(manifestAfter) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
