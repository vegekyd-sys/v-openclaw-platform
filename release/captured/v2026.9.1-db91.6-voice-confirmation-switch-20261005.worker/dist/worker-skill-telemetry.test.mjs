import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";

const agentRuntimePath = fileURLToPath(
  new URL("./fake-agent-runtime.mjs", import.meta.url),
);
const diagnosticRuntimePath = fileURLToPath(
  new URL("./fake-diagnostic-runtime.mjs", import.meta.url),
);

test("Worker observes and relays a trusted native skill.used event", async () => {
  const events = [];
  const pool = new WorkerPool({
    minWorkers: 1,
    maxWorkers: 1,
    sessionsPerWorker: 1,
    idleTimeoutMs: 1_000,
    workerEnv: {
      ...process.env,
      VLAB_OPENCLAW_AGENT_RUNTIME: agentRuntimePath,
      VLAB_OPENCLAW_DIAGNOSTIC_RUNTIME: diagnosticRuntimePath,
      VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME: "1",
      VLAB_REQUIRE_SKILL_USAGE_TELEMETRY: "1",
      VLAB_WORKER_GATEWAY_EVENT_TIMEOUT_MS: "1000",
    },
    async onWorkerEvent(event) {
      events.push(event);
      return { handled: true, recorded: true };
    },
  });
  try {
    const result = await pool.dispatch("agent:fixture:skill-telemetry", {
      kind: "agent",
      message: "skill-telemetry",
      runId: "fixture-skill-run",
      sessionId: "fixture-skill-session",
      agentId: "makaron",
      skillTelemetryIndex: [
        {
          name: "fixture-skill",
          source: "workspace",
          skillFile: "/srv/skills/fixture-skill/SKILL.md",
        },
      ],
    });
    assert.equal(result.payloads[0].text, "SKILL_TELEMETRY_FIXTURE_OK");
    const deadline = Date.now() + 1_000;
    while (events.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(events.length, 1);
    assert.equal(events[0].eventKind, "skill_usage");
    assert.equal(
      events[0].usage.skillFile,
      "/srv/skills/fixture-skill/SKILL.md",
    );
    while (
      pool.status().workers[0].skillUsageTelemetry?.relayed !== 1 &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const status = pool.status().workers[0].skillUsageTelemetry;
    assert.equal(status.observed, 1);
    assert.equal(status.relayed, 1);
    assert.equal(status.failed, 0);
    assert.equal(status.unmatched, 0);
  } finally {
    await pool.close();
  }
});
