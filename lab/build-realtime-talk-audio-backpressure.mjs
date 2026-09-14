// Build one exact code-only artifact from the current shared VLab runtime.
// The regular read-code JSON transport truncates this 785 KiB bundle, so this
// builder uses the same private VLab SSH alias and validates the full file hash.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTROL_UI_ASSET_AFTER,
  patchControlUiAssetManifest,
  patchRealtimeTalkAudioBackpressure,
} from "./patch-realtime-talk-audio-backpressure.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = "openclaw/dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk.js";
const runtimeFile = `/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/${target}`;
const manifestTarget = "openclaw/dist/control-ui/asset-manifest.json";
const manifestRuntimeFile =
  "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/dist/control-ui/asset-manifest.json";
const outputRelative =
  "lab/release-files/talk-audio-wan-backpressure/control-ui-boot-chat-DWTSrxxk.js";
const output = resolve(root, outputRelative);
const manifestOutputRelative =
  "lab/release-files/talk-audio-wan-backpressure/asset-manifest.json";
const manifestOutput = resolve(root, manifestOutputRelative);
const planPath = resolve(root, "lab/realtime-talk-audio-backpressure-plan.json");
const expectedManifestBefore =
  "a967daf8fe509bc38378f53ee9a1b8d7de8181e6adb7e3dc9c21c3ae3fe39dbc";
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
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function readRuntimeFile(runtimePath) {
  const encoded = execFileSync("ssh", [...ssh, `sudo base64 -w0 ${runtimePath}`], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 ** 2,
    timeout: 120_000,
  });
  const content = Buffer.from(encoded.trim(), "base64");
  assert.equal(content.toString("base64"), encoded.trim(), `runtime file was truncated: ${runtimePath}`);
  return content;
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
  assert.equal(
    statusBefore.lease?.owner,
    "01a099a7-b5f8-78b0-ad3d-b87e542e425c",
    "integration lease is not held by this task",
  );
  assert.equal(statusBefore.pending, null, "shared VLab has an unresolved deployment");

  const liveBundleSha = execFileSync("ssh", [...ssh, `sudo sha256sum ${runtimeFile}`], {
    encoding: "utf8",
    timeout: 30_000,
  }).split(/\s+/u)[0];
  assert.equal(liveBundleSha, CONTROL_UI_ASSET_AFTER.sha256, "control UI bundle SHA drifted");
  const before = readFileSync(output);
  assert.equal(sha256(before), CONTROL_UI_ASSET_AFTER.sha256, "local release bundle SHA drifted");
  const after = patchRealtimeTalkAudioBackpressure(before.toString("utf8"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, after);
  const manifestBefore = readRuntimeFile(manifestRuntimeFile);
  assert.equal(sha256(manifestBefore), expectedManifestBefore, "asset manifest SHA drifted");
  const manifestAfter = patchControlUiAssetManifest(manifestBefore.toString("utf8"));
  writeFileSync(manifestOutput, manifestAfter);
  const statusAfter = remote({ command: "status" });
  assert.equal(
    statusAfter.current.release,
    statusBefore.current.release,
    "shared release changed during build",
  );
  assert.equal(statusAfter.current.runtimeSha, statusBefore.current.runtimeSha);

  const plan = {
    baseRelease: statusBefore.current.release,
    files: [
      {
        source: manifestOutputRelative,
        target: manifestTarget,
        before: expectedManifestBefore,
      },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return {
    baseRelease: plan.baseRelease,
    bundle: { target, sha256: sha256(after), bytes: Buffer.byteLength(after) },
    manifest: {
      target: manifestTarget,
      before: expectedManifestBefore,
      after: sha256(manifestAfter),
      bytes: Buffer.byteLength(manifestAfter),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
