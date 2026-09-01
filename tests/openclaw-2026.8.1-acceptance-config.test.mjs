import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("../scripts/build-openclaw-2026.8.1-acceptance-config.mjs", import.meta.url);

test("acceptance config keeps runtime state but removes every inbound channel", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw81-acceptance-"));
  const input = path.join(root, "gateway.json");
  const workerInput = path.join(root, "worker.json");
  const output = path.join(root, "acceptance.json");
  const workerOutput = path.join(root, "acceptance-worker.json");
  const base = {
    channels: { feishu: { enabled: true }, wecom: { enabled: true } },
    gateway: { port: 22793, bind: "lan", auth: { mode: "token" }, tailscale: { mode: "serve" } },
    hooks: { enabled: true, path: "/hooks" },
    agents: { defaults: { sessionStore: { agentId: "makaron" } } },
    plugins: { entries: { "vlab-agent-worker-isolation": { enabled: true, config: { maxWorkers: 15 } } } },
  };
  fs.writeFileSync(input, JSON.stringify(base));
  fs.writeFileSync(workerInput, JSON.stringify(base));
  const result = spawnSync(process.execPath, [script.pathname, "--input", input, "--output", output, "--worker-input", workerInput, "--worker-output", workerOutput, "--port", "29379"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const gateway = JSON.parse(fs.readFileSync(output, "utf8"));
  const worker = JSON.parse(fs.readFileSync(workerOutput, "utf8"));
  assert.deepEqual(gateway.channels, {});
  assert.deepEqual(worker.channels, {});
  assert.equal(gateway.gateway.port, 29379);
  assert.equal(gateway.gateway.bind, "loopback");
  assert.equal(gateway.gateway.tailscale.mode, "off");
  assert.equal(gateway.hooks.enabled, false);
  assert.equal(gateway.agents.defaults.sessionStore.agentId, "makaron");
  assert.equal(gateway.plugins.entries["vlab-agent-worker-isolation"].config.workerConfigPath, workerOutput);
  assert.equal(gateway.plugins.entries["vlab-agent-worker-isolation"].config.gatewayConfigPath, output);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
});
