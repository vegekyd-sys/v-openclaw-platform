import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const configure = new URL("../scripts/configure-vlab-agents.mjs", import.meta.url).pathname;
const allowed = [
  "project_sandbox_open",
  "project_sandbox_files",
  "project_sandbox_exec",
  "project_sandbox_finish",
  "message",
];

test("VLab acceptance agents force distinct runtimes through one Plugin tool contract", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-sandbox-agents-"));
  const configPath = path.join(root, "openclaw.json");
  try {
    await writeFile(configPath, `${JSON.stringify({
      plugins: { allow: ["existing"], entries: { codex: { config: { appServer: { homeScope: "agent" } } } } },
      agents: { list: [{ id: "existing-agent", model: "provider/model" }] },
    })}\n`, { mode: 0o640 });

    await run([configPath]);
    const updated = JSON.parse(await readFile(configPath, "utf8"));
    assert.deepEqual(updated.plugins.allow, ["existing", "codex", "project-sandbox"]);
    assert.equal(updated.plugins.entries.codex.enabled, true);
    assert.equal(updated.plugins.entries.codex.config.codexDynamicToolsLoading, "direct");
    assert.equal(updated.plugins.entries.codex.config.codexPlugins.enabled, false);
    assert.equal(updated.plugins.entries.codex.config.appServer.homeScope, "agent");
    assert.ok(updated.agents.list.some((agent) => agent.id === "existing-agent"));

    const openclaw = updated.agents.list.find((agent) => agent.id === "vlab-sandbox-openclaw");
    const codex = updated.agents.list.find((agent) => agent.id === "vlab-sandbox-codex");
    assert.deepEqual(openclaw.tools.allow, allowed);
    assert.deepEqual(codex.tools.allow, allowed);
    assert.deepEqual(openclaw.tools.deny, ["group:runtime", "group:fs"]);
    assert.deepEqual(codex.tools.deny, ["group:runtime", "group:fs"]);
    assert.equal(openclaw.models["deepseek/deepseek-v4-pro"].agentRuntime.id, "openclaw");
    assert.equal(codex.models["openai/gpt-5.6-sol"].agentRuntime.id, "codex");
    assert.equal(Object.hasOwn(openclaw, "agentRuntime"), false);
    assert.equal(Object.hasOwn(codex, "agentRuntime"), false);
    assert.equal((await stat(configPath)).mode & 0o777, 0o640);
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
