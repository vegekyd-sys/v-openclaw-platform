import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const runner = new URL("../src/workspace-runner.py", import.meta.url).pathname;

test("durable runner starts quickly, polls output, and is idempotent", async () => {
  const fixture = await makeFixture();
  try {
    const operationId = "vop-111111111111111111111111";
    const startedAt = Date.now();
    const first = await invoke(fixture, ["start", operationId, "10"], [
      "python3", "-c", "import time; print('BEGIN', flush=True); time.sleep(0.4); print('DONE', flush=True)",
    ]);
    assert.ok(Date.now() - startedAt < 2000);
    assert.equal(first.operationId, operationId);
    assert.ok(["starting", "running", "completed"].includes(first.status));

    const second = await invoke(fixture, ["start", operationId, "10"], ["python3", "-c", "raise SystemExit(91)"]);
    assert.equal(second.operationId, operationId);
    assert.notEqual(second.exitCode, 91);

    const completed = await poll(fixture, operationId, (status) => status.status === "completed");
    assert.equal(completed.exitCode, 0);
    assert.match(completed.stdout, /BEGIN/);
    assert.match(completed.stdout, /DONE/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("durable runner cancels an active process group", async () => {
  const fixture = await makeFixture();
  try {
    const operationId = "vop-222222222222222222222222";
    await invoke(fixture, ["start", operationId, "30"], ["python3", "-c", "import time; print('WAIT', flush=True); time.sleep(30)"]);
    const cancelled = await invoke(fixture, ["cancel", operationId, "200000"]);
    assert.ok(["cancelled", "failed"].includes(cancelled.status));
    const final = await poll(fixture, operationId, (status) => status.status === "cancelled");
    assert.equal(final.status, "cancelled");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-runner-"));
  const project = path.join(root, "project");
  const operations = path.join(root, "operations");
  await mkdir(project);
  return {
    root,
    env: {
      ...process.env,
      VLAB_SANDBOX_RUNNER_ROOT: operations,
      VLAB_SANDBOX_RUNNER_PROJECT: project,
    },
  };
}

async function poll(fixture, operationId, done) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await invoke(fixture, ["status", operationId, "200000"]);
    if (done(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("runner did not reach the expected state");
}

function invoke(fixture, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [runner, ...args], { env: fixture.env, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(stderr).toString("utf8") || `runner exited ${code}`));
      try { resolve(JSON.parse(Buffer.concat(stdout).toString("utf8"))); } catch (error) { reject(error); }
    });
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
}
