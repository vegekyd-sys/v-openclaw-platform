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
  patchRealtimeTalkPrecompressedFallback,
  patchRealtimeTalkAudioBackpressure,
} from "./patch-realtime-talk-audio-backpressure.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = "openclaw/dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk.js";
const runtimeFile = `/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/${target}`;
const serverTarget = "openclaw/dist/control-ui-DhD7PO_6.js";
const serverRuntimeFile =
  "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/dist/control-ui-DhD7PO_6.js";
const manifestRuntimeFile =
  "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/dist/control-ui/asset-manifest.json";
const outputRelative =
  "lab/release-files/talk-audio-wan-backpressure/control-ui-boot-chat-DWTSrxxk.js";
const output = resolve(root, outputRelative);
const serverOutputRelative =
  "lab/release-files/talk-audio-wan-backpressure/control-ui-DhD7PO_6.js";
const serverOutput = resolve(root, serverOutputRelative);
const manifestOutput = resolve(
  root,
  "lab/release-files/talk-audio-wan-backpressure/asset-manifest.json",
);
const planPath = resolve(root, "lab/realtime-talk-audio-backpressure-plan.json");
const expectedServerBefore =
  "638fd21e36e1ed8b6b2d6d02608fd59485f1c3a7bb65d28276d7c860c264f205";
const expectedManifest = "d26f184ddd625458a08abfbbfde4433aaadb46a75f777ec43122b2d7da3a9f95";
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
  const serverBefore = readRuntimeFile(serverRuntimeFile);
  assert.equal(sha256(serverBefore), expectedServerBefore, "Control UI server SHA drifted");
  const serverAfter = patchRealtimeTalkPrecompressedFallback(serverBefore.toString("utf8"));
  writeFileSync(serverOutput, serverAfter);
  const manifest = readRuntimeFile(manifestRuntimeFile);
  assert.equal(sha256(manifest), expectedManifest, "Control UI manifest SHA drifted");
  writeFileSync(manifestOutput, manifest);
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
        source: serverOutputRelative,
        target: serverTarget,
        before: expectedServerBefore,
      },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return {
    baseRelease: plan.baseRelease,
    bundle: { target, sha256: sha256(after), bytes: Buffer.byteLength(after) },
    server: {
      target: serverTarget,
      before: expectedServerBefore,
      after: sha256(serverAfter),
      bytes: Buffer.byteLength(serverAfter),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
