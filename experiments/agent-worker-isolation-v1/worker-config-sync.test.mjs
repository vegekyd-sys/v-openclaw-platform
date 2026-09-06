import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  syncWorkerRuntimeConfigFile,
  synchronizeWorkerRuntimePolicy,
} from "./worker-config-sync.mjs";

test("copies Gateway compaction policy without changing Worker isolation routes", () => {
  const gatewayConfig = {
    agents: {
      defaults: {
        compaction: {
          mode: "safeguard",
          maxActiveTranscriptBytes: "40kb",
        },
      },
    },
  };
  const workerConfig = {
    agents: {
      defaults: {
        compaction: { mode: "default" },
        models: {
          "deepseek/deepseek-v4-pro": {
            agentRuntime: { id: "openclaw" },
          },
        },
      },
    },
    plugins: {
      entries: {
        "vlab-agent-worker-isolation": { enabled: true },
      },
    },
  };

  const result = synchronizeWorkerRuntimePolicy(gatewayConfig, workerConfig);

  assert.deepEqual(result.agents.defaults.compaction, {
    mode: "safeguard",
    maxActiveTranscriptBytes: "40kb",
  });
  assert.equal(
    result.agents.defaults.models["deepseek/deepseek-v4-pro"].agentRuntime.id,
    "openclaw",
  );
  assert.deepEqual(result.plugins, workerConfig.plugins);
  assert.notEqual(result, workerConfig);
});

test("removes stale Worker compaction policy when Gateway policy is absent", () => {
  const result = synchronizeWorkerRuntimePolicy(
    { agents: { defaults: {} } },
    {
      agents: {
        defaults: {
          compaction: { maxActiveTranscriptBytes: "40kb" },
          sessionStore: { agentId: "makaron" },
        },
      },
    },
  );

  assert.equal("compaction" in result.agents.defaults, false);
  assert.deepEqual(result.agents.defaults.sessionStore, { agentId: "makaron" });
});

test("atomically updates only the Worker config and becomes a no-op", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "worker-config-sync-"));
  const gatewayConfigPath = resolve(directory, "gateway.json");
  const workerConfigPath = resolve(directory, "worker.json");
  writeFileSync(
    gatewayConfigPath,
    JSON.stringify({
      agents: {
        defaults: {
          compaction: { mode: "safeguard", keepRecentTokens: 8000 },
        },
      },
    }),
  );
  writeFileSync(
    workerConfigPath,
    JSON.stringify({
      agents: {
        defaults: {
          compaction: { mode: "default" },
          models: {
            "deepseek/deepseek-v4-pro": {
              agentRuntime: { id: "openclaw" },
            },
          },
        },
      },
    }),
    { mode: 0o640 },
  );
  // The Lab service has UMask=0077. Establish the fixture's intended mode
  // explicitly so this tests preservation, not the parent's creation mask.
  chmodSync(workerConfigPath, 0o640);
  assert.equal(statSync(workerConfigPath).mode & 0o777, 0o640);

  const first = syncWorkerRuntimeConfigFile({
    gatewayConfigPath,
    workerConfigPath,
  });
  const modeAfterFirstWrite = statSync(workerConfigPath).mode & 0o777;
  const second = syncWorkerRuntimeConfigFile({
    gatewayConfigPath,
    workerConfigPath,
  });
  const written = JSON.parse(readFileSync(workerConfigPath, "utf8"));

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(modeAfterFirstWrite, 0o640);
  assert.equal(written.agents.defaults.compaction.keepRecentTokens, 8000);
  assert.equal(
    written.agents.defaults.models["deepseek/deepseek-v4-pro"].agentRuntime.id,
    "openclaw",
  );
});

test("rejects relative or shared config paths", () => {
  assert.throws(
    () =>
      syncWorkerRuntimeConfigFile({
        gatewayConfigPath: "gateway.json",
        workerConfigPath: "/tmp/worker.json",
      }),
    /gatewayConfigPath must be an absolute path/,
  );
  assert.throws(
    () =>
      syncWorkerRuntimeConfigFile({
        gatewayConfigPath: "/tmp/openclaw.json",
        workerConfigPath: "/tmp/openclaw.json",
      }),
    /must be different/,
  );
});
