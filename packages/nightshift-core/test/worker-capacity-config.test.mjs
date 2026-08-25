import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const script = new URL("../../../scripts/configure-worker-capacity.mjs", import.meta.url);

test("aligns Gateway and Worker overlay to one elastic 45-session pool", () => {
  const root = mkdtempSync(join(tmpdir(), "worker-capacity-config-"));
  const gateway = join(root, "openclaw.json");
  const worker = join(root, "worker-openclaw.json");
  const original = {
    agents: { defaults: { maxConcurrent: 30, subagents: { maxConcurrent: 8, runTimeoutSeconds: 600 } } },
    plugins: {
      entries: {
        "vlab-agent-worker-isolation": {
          enabled: true,
          config: { minWorkers: 1, maxWorkers: 10, sessionsPerWorker: 3, idleTimeoutMs: 180000 },
        },
      },
    },
  };
  writeFileSync(gateway, JSON.stringify(original));
  writeFileSync(worker, JSON.stringify(original));

  execFileSync(process.execPath, [
    script.pathname,
    `--gateway-config=${gateway}`,
    `--worker-config=${worker}`,
    "--max-workers=15",
    "--sessions-per-worker=3",
    "--max-concurrent=45",
    "--subagents-max-concurrent=45",
  ]);

  for (const path of [gateway, worker]) {
    const config = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(config.agents.defaults.maxConcurrent, 45);
    assert.equal(config.agents.defaults.subagents.maxConcurrent, 45);
    assert.equal(config.agents.defaults.subagents.runTimeoutSeconds, 600);
    assert.equal(config.plugins.entries["vlab-agent-worker-isolation"].config.maxWorkers, 15);
    assert.equal(config.plugins.entries["vlab-agent-worker-isolation"].config.sessionsPerWorker, 3);
    assert.equal(config.plugins.entries["vlab-agent-worker-isolation"].config.idleTimeoutMs, 180000);
    assert.equal(config.plugins.entries.workboard.enabled, true);
  }
});

test("refuses concurrency above actual Worker capacity", () => {
  const root = mkdtempSync(join(tmpdir(), "worker-capacity-invalid-"));
  const gateway = join(root, "openclaw.json");
  const worker = join(root, "worker-openclaw.json");
  const config = {
    plugins: { entries: { "vlab-agent-worker-isolation": { enabled: true, config: {} } } },
  };
  writeFileSync(gateway, JSON.stringify(config));
  writeFileSync(worker, JSON.stringify(config));
  assert.throws(() => execFileSync(process.execPath, [
    script.pathname,
    `--gateway-config=${gateway}`,
    `--worker-config=${worker}`,
    "--max-workers=10",
    "--sessions-per-worker=3",
    "--max-concurrent=45",
    "--subagents-max-concurrent=45",
  ]));
});
