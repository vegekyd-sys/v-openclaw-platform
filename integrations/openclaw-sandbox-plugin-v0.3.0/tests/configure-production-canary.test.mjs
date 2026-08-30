import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const configure = new URL("../scripts/configure-production-canary.mjs", import.meta.url).pathname;

test("production canary is scoped to one Agent, one Session, and one project", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-sandbox-prod-config-"));
  const configPath = path.join(root, "openclaw.json");
  try {
    await writeFile(configPath, `${JSON.stringify({
      plugins: {
        allow: ["existing-plugin"],
        entries: {
          "project-sandbox": {
            enabled: false,
            config: {
              allowedAgentIds: ["old-agent"],
              allowedSessionKeys: ["agent:old-agent:old"],
              allowedSessionPrefixes: ["agent:old-agent:"],
              blockedAgentIds: ["hard-sandbox-agent"],
              projects: { old: { path: "/old" } },
            },
          },
        },
      },
      tools: { alsoAllow: ["existing_tool"] },
    })}\n`, { mode: 0o600 });

    const session = "agent:v-codex:feishu:group:oc-canary";
    await run([configPath, "v-evolution-engine", "/approved/v-evolution-engine", "v-codex", session]);
    const updated = JSON.parse(await readFile(configPath, "utf8"));
    const plugin = updated.plugins.entries["project-sandbox"];
    assert.equal(plugin.enabled, true);
    assert.deepEqual(plugin.config.allowedAgentIds, ["v-codex"]);
    assert.deepEqual(plugin.config.allowedSessionKeys, [session]);
    assert.deepEqual(plugin.config.allowedSessionPrefixes, []);
    assert.deepEqual(plugin.config.blockedAgentIds, []);
    assert.deepEqual(Object.keys(plugin.config.projects), ["v-evolution-engine"]);
    assert.equal(plugin.config.projects["v-evolution-engine"].path, "/approved/v-evolution-engine");
    assert.equal(plugin.config.projects["v-evolution-engine"].networkProfile, "packages");
    assert.deepEqual(updated.plugins.allow, ["existing-plugin", "project-sandbox"]);
    assert.deepEqual(updated.tools.alsoAllow, [
      "existing_tool",
      "project_sandbox_open",
      "project_sandbox_files",
      "project_sandbox_exec",
      "project_sandbox_finish",
    ]);
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production canary rejects a Session owned by another Agent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-sandbox-prod-config-"));
  const configPath = path.join(root, "openclaw.json");
  try {
    await writeFile(configPath, "{}\n", { mode: 0o600 });
    await assert.rejects(
      run([configPath, "demo", "/approved/demo", "v-codex", "agent:makaron:feishu:group:oc-other"]),
      /sessionKey must belong/,
    );
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
