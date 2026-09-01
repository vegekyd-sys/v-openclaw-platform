import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const script = new URL("../../../scripts/ensure-workboard-plugin-enabled.mjs", import.meta.url);

test("enables Workboard without changing Worker 0.2.5 capacity", () => {
  const root = mkdtempSync(join(tmpdir(), "workboard-config-safety-"));
  const configPath = join(root, "openclaw.json");
  const backupDir = join(root, "backup");
  const config = fixtureConfig({ withAllowlist: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o640 });

  const result = JSON.parse(
    execFileSync(process.execPath, [
      script.pathname,
      `--config=${configPath}`,
      `--backup-dir=${backupDir}`,
    ], { encoding: "utf8" }),
  );
  const written = JSON.parse(readFileSync(configPath, "utf8"));

  assert.equal(result.status, "updated");
  assert.equal(result.workerCapacity.maxConcurrent, 30);
  assert.equal(result.workerCapacity.maxWorkers, 10);
  assert.equal(written.plugins.entries.workboard.enabled, true);
  assert.equal(written.plugins.allow.filter((entry) => entry === "workboard").length, 1);
  assert.deepEqual(written.plugins.entries["vlab-agent-worker-isolation"], config.plugins.entries["vlab-agent-worker-isolation"]);
  assert.deepEqual(written.agents, config.agents);
  assert.deepEqual(written.session, config.session);
  assert.equal(statSync(configPath).mode & 0o777, 0o640);
  assert.deepEqual(JSON.parse(readFileSync(join(backupDir, "openclaw.json.before"), "utf8")), config);

  const second = JSON.parse(
    execFileSync(process.execPath, [
      script.pathname,
      `--config=${configPath}`,
      `--backup-dir=${join(root, "unused-backup")}`,
    ], { encoding: "utf8" }),
  );
  assert.equal(second.status, "already-enabled");
});

test("leaves an absent plugin allowlist absent", () => {
  const root = mkdtempSync(join(tmpdir(), "workboard-config-no-allowlist-"));
  const configPath = join(root, "openclaw.json");
  const backupDir = join(root, "backup");
  const config = fixtureConfig({ withAllowlist: false });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  execFileSync(process.execPath, [
    script.pathname,
    `--config=${configPath}`,
    `--backup-dir=${backupDir}`,
  ]);
  const written = JSON.parse(readFileSync(configPath, "utf8"));

  assert.equal(written.plugins.entries.workboard.enabled, true);
  assert.equal(written.plugins.allow, undefined);
  assert.equal(written.plugins.entries["vlab-agent-worker-isolation"].config.maxWorkers, 10);
});

function fixtureConfig({ withAllowlist }) {
  return {
    agents: {
      defaults: {
        maxConcurrent: 30,
        subagents: { maxConcurrent: 8, runTimeoutSeconds: 600 },
      },
    },
    session: { maintenance: { maxEntries: 2000 } },
    plugins: {
      ...(withAllowlist ? { allow: ["feishu", "vlab-agent-worker-isolation"] } : {}),
      load: {
        paths: [
          "/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.5-capacity-20260821-r5",
        ],
      },
      entries: {
        "vlab-agent-worker-isolation": {
          enabled: true,
          config: { minWorkers: 1, maxWorkers: 10, sessionsPerWorker: 3 },
        },
      },
    },
  };
}
