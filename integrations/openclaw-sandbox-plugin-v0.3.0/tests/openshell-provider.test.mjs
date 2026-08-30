import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OpenShellProvider } from "../src/openshell-provider.mjs";

test("persistent Workspaces keep a canonical process alive until Broker cleanup", async () => {
  const provider = new OpenShellProvider({
    OPENSHELL_GATEWAY: "test-gateway",
    VLAB_SANDBOX_POLICY_DIR: "/policies",
  });
  let command;
  provider.openshell = async (args) => {
    command = args;
    return { code: 0, stdout: Buffer.from("{}"), stderr: Buffer.alloc(0) };
  };

  await provider.createSandbox("vsw-test", {
    cpu: "1",
    memory: "2Gi",
    networkProfile: "offline",
  }, "workspace-id", "vws-test");

  assert.deepEqual(command.slice(-3), ["--", "sleep", "infinity"]);
  assert.ok(command.includes("--detach"));
  assert.ok(!command.includes("--no-keep"));
  assert.ok(!command.includes("--output"));
  assert.ok(!command.includes("-o"));
});

test("project uploads are split below the OpenShell stdin cap and verified", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "openshell-upload-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  await mkdir(project);
  await writeFile(path.join(project, "payload.bin"), randomBytes(1_400_000));
  await writeFile(path.join(project, ".env"), "MUST_NOT_LEAVE_HOST=1\n");

  const provider = new OpenShellProvider({
    OPENSHELL_GATEWAY: "test-gateway",
    VLAB_SANDBOX_STATE_DIR: path.join(root, "state"),
  });
  let remoteArchive = Buffer.alloc(0);
  const chunkSizes = [];
  let extracted = false;
  provider.execInWorkspace = async (_name, argv, options = {}) => {
    if (argv[0] === "tee") {
      const payload = Buffer.from(options.stdin);
      chunkSizes.push(payload.length);
      remoteArchive = argv.includes("-a") ? Buffer.concat([remoteArchive, payload]) : payload;
    } else if (argv[0] === "sha256sum") {
      return success(`${createHash("sha256").update(remoteArchive).digest("hex")}  project-upload.tgz\n`);
    } else if (argv[0] === "stat") {
      return success(`${remoteArchive.length}\n`);
    } else if (argv[0] === "tar") {
      extracted = true;
    }
    return success();
  };

  await provider.uploadProject("vsw-test", project);

  assert.ok(chunkSizes.length >= 3);
  assert.ok(chunkSizes.every((size) => size <= 512 * 1024));
  assert.ok(remoteArchive.length > 1_048_576);
  assert.equal(extracted, true);
});

function success(stdout = "") {
  return { code: 0, signal: null, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
}
