import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
const runtimeRoot = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
const baseOutputDir = resolve(root, "lab/release-files/talk-audio-wan-backpressure");
const outputDir = resolve(root, "lab/release-files/talk-agent-continuation");
const bundleOutput = resolve(outputDir, "control-ui-boot-chat-DWTSrxxk.js");
const manifestOutput = resolve(outputDir, "asset-manifest.json");
const planPath = resolve(root, "lab/realtime-talk-agent-continuation-plan.json");
const expectedBaseRelease = "talk-audio-wan-backpressure-v3";
const expectedManifestSha = "d26f184ddd625458a08abfbbfde4433aaadb46a75f777ec43122b2d7da3a9f95";
const ssh = [
  "-F",
  "/Users/tianyicai/v-upgrade-private/20260904/ssh-config",
  "-o",
  "ControlPath=none",
  "-o",
  "ControlMaster=no",
  "-o",
  "ControlPersist=no",
  "-o",
  "BatchMode=yes",
  "-o",
  "ConnectTimeout=10",
  "vlab91",
];
const remoteTool =
  "sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab-production-mirror/labs/shared-workflow/tool/server.mjs";

function verifyRuntimeFile(relativePath, expectedSha) {
  const runtimePath = `${runtimeRoot}/${relativePath}`;
  const actualSha = execFileSync("ssh", [...ssh, `sudo sha256sum ${runtimePath}`], {
    encoding: "utf8",
    timeout: 30_000,
  }).trim().split(/\s+/u)[0];
  assert.equal(actualSha, expectedSha, `runtime file drifted: ${relativePath}`);
}

function remote(request) {
  return JSON.parse(
    execFileSync("ssh", [...ssh, remoteTool], {
      input: JSON.stringify(request),
      encoding: "utf8",
      maxBuffer: 8 * 1024 ** 2,
      timeout: 120_000,
    }),
  );
}

export function build() {
  const statusBefore = remote({ command: "status" });
  assert.equal(statusBefore.lease?.owner, "01a099a7-b5f8-78b0-ad3d-b87e542e425c");
  assert.equal(statusBefore.pending, null, "shared VLab has an unresolved deployment");
  assert.equal(statusBefore.current.release, expectedBaseRelease, "shared VLab release drifted");

  verifyRuntimeFile(target, CONTROL_UI_ASSET_BEFORE.sha256);
  const bundleBefore = readFileSync(
    resolve(baseOutputDir, "control-ui-boot-chat-DWTSrxxk.js"),
  );
  assert.deepEqual(describeAsset(bundleBefore), CONTROL_UI_ASSET_BEFORE, "bundle drifted");
  const bundleAfter = patchRealtimeTalkAgentContinuation(bundleBefore.toString("utf8"));
  const nextAsset = describeAsset(bundleAfter);

  verifyRuntimeFile(manifestTarget, expectedManifestSha);
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

  const statusAfter = remote({ command: "status" });
  assert.equal(statusAfter.current.release, statusBefore.current.release, "release changed during build");
  assert.equal(statusAfter.current.runtimeSha, statusBefore.current.runtimeSha);
  return { baseRelease: expectedBaseRelease, bundle: nextAsset, manifest: describeAsset(manifestAfter) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
