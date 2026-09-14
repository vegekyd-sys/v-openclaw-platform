// Build one exact code-only artifact from the current shared VLab runtime.
// The regular read-code JSON transport truncates this 785 KiB bundle, so this
// builder uses the same private VLab SSH alias and validates the full file hash.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchRealtimeTalkAudioBackpressure } from "./patch-realtime-talk-audio-backpressure.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = "openclaw/dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk.js";
const runtimeFile = `/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/${target}`;
const outputRelative =
  "lab/release-files/talk-audio-wan-backpressure/control-ui-boot-chat-DWTSrxxk.js";
const output = resolve(root, outputRelative);
const planPath = resolve(root, "lab/realtime-talk-audio-backpressure-plan.json");
const expectedBefore = "ef2fb5a520b04cdc214fb055652c3c307f683b5f245216644b74859253391bb1";
const ssh = [
  "-F",
  "/Users/tianyicai/v-upgrade-private/20260904/ssh-config",
  "-o",
  "ControlPath=none",
  "-o",
  "BatchMode=yes",
  "-o",
  "ConnectTimeout=10",
  "vlab91",
];
const remoteTool =
  "sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab-production-mirror/labs/shared-workflow/tool/server.mjs";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

  const encoded = execFileSync("ssh", [...ssh, `sudo base64 -w0 ${runtimeFile}`], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 ** 2,
    timeout: 120_000,
  });
  const before = Buffer.from(encoded.trim(), "base64");
  assert.equal(before.toString("base64"), encoded.trim(), "runtime bundle was truncated");
  assert.equal(sha256(before), expectedBefore, "control UI bundle SHA drifted");

  const after = patchRealtimeTalkAudioBackpressure(before.toString("utf8"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, after);
  const statusAfter = remote({ command: "status" });
  assert.equal(
    statusAfter.current.release,
    statusBefore.current.release,
    "shared release changed during build",
  );
  assert.equal(statusAfter.current.runtimeSha, statusBefore.current.runtimeSha);

  const plan = {
    baseRelease: statusBefore.current.release,
    files: [{ source: outputRelative, target, before: expectedBefore }],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return {
    baseRelease: plan.baseRelease,
    target,
    before: expectedBefore,
    after: sha256(after),
    bytes: Buffer.byteLength(after),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
