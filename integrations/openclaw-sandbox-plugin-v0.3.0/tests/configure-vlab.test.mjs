import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const configure = new URL("../scripts/configure-vlab.mjs", import.meta.url).pathname;

test("VLab config mutator preserves existing plugin policy and file mode", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-sandbox-config-"));
  const configPath = path.join(root, "openclaw.json");
  try {
    await writeFile(configPath, `${JSON.stringify({
      plugins: {
        allow: ["existing-plugin"],
        entries: {
          "project-sandbox": {
            enabled: false,
            config: {
              blockedAgentIds: ["sandbox-codex"],
              projects: { retained: { path: "/approved/retained" } },
            },
          },
        },
      },
      tools: { alsoAllow: ["existing_tool"] },
    })}\n`, { mode: 0o640 });

    await run([configPath, "v-core", "/srv/vlab/projects/v-core"]);
    const updated = JSON.parse(await readFile(configPath, "utf8"));
    assert.deepEqual(updated.plugins.allow, ["existing-plugin", "project-sandbox"]);
    assert.deepEqual(updated.plugins.entries["project-sandbox"].config.blockedAgentIds, [
      "sandbox-codex",
      "vlab-sandbox-openclaw",
      "vlab-sandbox-codex",
    ]);
    assert.equal(updated.plugins.entries["project-sandbox"].config.projects.retained.path, "/approved/retained");
    assert.equal(updated.plugins.entries["project-sandbox"].config.projects["v-core"].path, "/srv/vlab/projects/v-core");
    assert.deepEqual(updated.tools.alsoAllow, [
      "existing_tool",
      "project_sandbox_open",
      "project_sandbox_files",
      "project_sandbox_exec",
      "project_sandbox_finish",
    ]);
    assert.equal((await stat(configPath)).mode & 0o777, 0o640);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("VLab config mutator rejects unsafe project ids", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-sandbox-config-"));
  const configPath = path.join(root, "openclaw.json");
  try {
    await writeFile(configPath, "{}\n", { mode: 0o600 });
    await assert.rejects(run([configPath, "../escape", "/srv/vlab/projects/v-core"]), /projectId must be/);
    assert.equal(await readFile(configPath, "utf8"), "{}\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [configure, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || `configure exited ${code}`));
    });
  });
}
