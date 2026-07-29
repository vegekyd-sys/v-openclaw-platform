import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const labRoot = process.env.LAB_ROOT ?? "/srv/vlab";
const reportRoot = process.env.VLAB_REPORT_ROOT ?? `${labRoot}/logs`;
const service =
  process.env.VLAB_GATEWAY_SERVICE ?? "openclaw-vlab-gateway.service";
const runtimePath =
  process.env.VLAB_OPENCLAW_GATEWAY_RUNTIME ??
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js";
const sessionCount = readInteger("VLAB_NATIVE_SESSION_COUNT", 9, 1, 9);
const toolHoldSeconds = readInteger(
  "VLAB_NATIVE_TOOL_HOLD_SECONDS",
  15,
  1,
  420,
);
const toolHoldStaggerSeconds = readInteger(
  "VLAB_NATIVE_TOOL_HOLD_STAGGER_SECONDS",
  0,
  0,
  30,
);
const runTimeoutMs = readInteger(
  "VLAB_NATIVE_RUN_TIMEOUT_MS",
  420_000,
  180_000,
  600_000,
);
const gatewayTimeoutMs = readInteger(
  "VLAB_NATIVE_GATEWAY_TIMEOUT_MS",
  480_000,
  runTimeoutMs,
  600_000,
);
const saturationWaitSeconds = readInteger(
  "VLAB_NATIVE_SATURATION_WAIT_SECONDS",
  180,
  60,
  300,
);
const controlPlaneMaxLatencyMs = readInteger(
  "VLAB_CONTROL_PLANE_MAX_LATENCY_MS",
  3_000,
  500,
  10_000,
);
const expectedMaxConcurrent = readInteger(
  "VLAB_EXPECTED_MAX_CONCURRENT",
  10,
  1,
  64,
);
const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z");
const token = timestamp.toLowerCase();
const sessionPrefix = `agent:makaron:explicit:vlab-native-${token}`;
const runPrefix = `vlab-native-${token}`;
const reportDir =
  `${reportRoot}/agent-worker-native-dispatch-${timestamp}`;
const startedAt = Date.now();

function readInteger(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function systemdNumber(property) {
  const raw = execFileSync(
    "systemctl",
    ["show", service, `-p${property}`, "--value"],
    { encoding: "utf8" },
  ).trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

async function saveJson(name, value) {
  await writeFile(
    `${reportDir}/${name}`,
    `${JSON.stringify(value, null, 2)}\n`,
    { mode: 0o600 },
  );
}

await mkdir(reportDir, { recursive: true, mode: 0o700 });

const { callGatewayFromCli } = await import(pathToFileURL(runtimePath).href);
const rpcOptions = {
  timeout: String(gatewayTimeoutMs),
  json: true,
};
const call = async (method, params = {}) =>
  await callGatewayFromCli(method, rpcOptions, params);

function targetActiveSessions(status) {
  return status.workers.reduce(
    (sum, worker) =>
      sum +
      worker.active.filter((entry) =>
        entry.sessionKey?.startsWith(`${sessionPrefix}-`),
      ).length,
    0,
  );
}

const baselineRestarts = systemdNumber("NRestarts");
const before = await call("vlab.workers.status");
await saveJson("status-before.json", before);

assert.equal(before.integration.nativeAgentHarnessDispatchAttached, true);
assert.equal(before.integration.nativeAgentHarnessId, "vlab-worker");
assert.equal(before.maxWorkers, 3);
assert.equal(before.sessionsPerWorker, 3);
assert.equal(
  before.openClawConcurrency.maxConcurrent,
  expectedMaxConcurrent,
);
assert.equal(before.openClawConcurrency.subagentsMaxConcurrent, 8);
assert.ok(before.openClawConcurrency.configuredModelRuntimes.length > 0);
assert.ok(
  before.openClawConcurrency.configuredModelRuntimes.every(
    (runtime) => runtime === "vlab-worker",
  ),
);

const admittedBefore = before.integration.nativeHarnessStats.admitted;
const completedBefore = before.integration.nativeHarnessStats.completed;
const requiredWorkers = Math.ceil(
  sessionCount / before.sessionsPerWorker,
);
assert.ok(requiredWorkers <= before.maxWorkers);

let agentWaitTerminalCount = 0;
let agentWaitRegistryTimeoutCount = 0;
for (let index = 1; index <= sessionCount; index += 1) {
  const sessionKey = `${sessionPrefix}-${index}`;
  const runId = `${runPrefix}-${index}`;
  const marker = `VLAB_NATIVE_OK_${index}`;
  const sessionToolHoldSeconds =
    toolHoldSeconds + (index - 1) * toolHoldStaggerSeconds;
  assert.ok(
    sessionToolHoldSeconds <= 420,
    `session ${index} tool hold ${sessionToolHoldSeconds}s exceeds 420s`,
  );
  const message =
    `这是 vLab 原生 dispatch 验收。必须使用 exec 执行 /bin/sleep ` +
    `${sessionToolHoldSeconds}，然后只回复 ${marker}。不要发送外部消息，不要修改文件。`;
  const sent = await call("chat.send", {
    sessionKey,
    agentId: "makaron",
    message,
    deliver: false,
    timeoutMs: runTimeoutMs,
    idempotencyKey: runId,
  });
  await saveJson(`send-${index}.json`, sent);
  assert.equal(sent.runId, runId);
  assert.ok(sent.status === "started" || sent.status === "in_flight");
}

let saturated = false;
let peakWorkers = 0;
let peakActiveSessions = 0;
let peakTargetActiveSessions = 0;
let maxPendingDuringScaleUp = 0;
const saturationDeadline = Date.now() + saturationWaitSeconds * 1_000;
while (Date.now() < saturationDeadline) {
  const status = await call("vlab.workers.status");
  peakWorkers = Math.max(peakWorkers, status.workers.length);
  const active = status.workers.reduce(
    (sum, worker) => sum + worker.activeCount,
    0,
  );
  const targetActive = targetActiveSessions(status);
  peakActiveSessions = Math.max(peakActiveSessions, active);
  peakTargetActiveSessions = Math.max(
    peakTargetActiveSessions,
    targetActive,
  );
  maxPendingDuringScaleUp = Math.max(
    maxPendingDuringScaleUp,
    status.pending,
  );
  await saveJson("status-during.json", status);
  if (
    status.workers.length >= requiredWorkers &&
    targetActive === sessionCount &&
    status.workers
      .map(
        (worker) =>
          worker.active.filter((entry) =>
            entry.sessionKey?.startsWith(`${sessionPrefix}-`),
          ).length,
      )
      .filter((count) => count > 0)
      .sort()
      .length >= requiredWorkers &&
    status.pending === 0
  ) {
    saturated = true;
    break;
  }
  await sleep(1_000);
}
assert.equal(saturated, true, "native workload never reached 3x3 saturation");

const metrics = [];
let maxPendingAtSteadyState = 0;
const completionDeadline = Date.now() + runTimeoutMs + 120_000;
while (Date.now() < completionDeadline) {
  const healthStartedAt = performance.now();
  const health = await call("health");
  const healthRpcMs = performance.now() - healthStartedAt;
  const statusStartedAt = performance.now();
  const status = await call("vlab.workers.status");
  const workerStatusRpcMs = performance.now() - statusStartedAt;
  const active = status.workers.reduce(
    (sum, worker) => sum + worker.activeCount,
    0,
  );
  const targetActive = targetActiveSessions(status);
  peakWorkers = Math.max(peakWorkers, status.workers.length);
  peakActiveSessions = Math.max(peakActiveSessions, active);
  peakTargetActiveSessions = Math.max(
    peakTargetActiveSessions,
    targetActive,
  );
  maxPendingAtSteadyState = Math.max(
    maxPendingAtSteadyState,
    status.pending,
  );
  metrics.push({
    timestamp: new Date().toISOString(),
    eventLoop: health.eventLoop,
    controlPlane: {
      healthRpcMs,
      workerStatusRpcMs,
    },
    memoryCurrentBytes: systemdNumber("MemoryCurrent"),
    memoryPeakBytes: systemdNumber("MemoryPeak"),
    restarts: systemdNumber("NRestarts"),
    workers: status.workers.length,
    activeSessions: active,
    targetActiveSessions: targetActive,
    pending: status.pending,
  });
  await writeFile(
    `${reportDir}/metrics.jsonl`,
    `${metrics.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
    { mode: 0o600 },
  );

  if (targetActive === 0) {
    break;
  }
  await sleep(5_000);
}

const after = await call("vlab.workers.status");
await saveJson("status-after.json", after);
const statsAfter = after.integration.nativeHarnessStats;
assert.ok(statsAfter.admitted - admittedBefore >= sessionCount);
assert.ok(statsAfter.completed - completedBefore >= sessionCount);

for (let index = 1; index <= sessionCount; index += 1) {
  const runId = `${runPrefix}-${index}`;
  const waited = await call("agent.wait", {
    runId,
    timeoutMs: 1_000,
  });
  await saveJson(`wait-${index}.json`, waited);
  if (waited.status === "ok" || waited.status === "succeeded") {
    agentWaitTerminalCount += 1;
  } else {
    assert.equal(waited.status, "timeout");
    assert.equal(waited.timeoutPhase, "gateway_draining");
    agentWaitRegistryTimeoutCount += 1;
  }

  const sessionKey = `${sessionPrefix}-${index}`;
  const marker = `VLAB_NATIVE_OK_${index}`;
  const history = await call("chat.history", {
    sessionKey,
    limit: 30,
  });
  await saveJson(`history-${index}.json`, history);
  const texts = history.messages.flatMap((message) =>
    message.role === "assistant"
      ? message.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
      : [],
  );
  assert.ok(texts.some((text) => text.includes(marker)));
}

const idempotentRetry = await call("chat.send", {
  sessionKey: `${sessionPrefix}-1`,
  agentId: "makaron",
  message: "THIS_MUST_NOT_EXECUTE",
  deliver: false,
  timeoutMs: runTimeoutMs,
  idempotencyKey: `${runPrefix}-1`,
});
await saveJson("idempotent-retry.json", idempotentRetry);
assert.equal(idempotentRetry.runId, `${runPrefix}-1`);
const idempotentHistory = await call("chat.history", {
  sessionKey: `${sessionPrefix}-1`,
  limit: 40,
});
await saveJson("idempotent-history.json", idempotentHistory);
assert.equal(
  idempotentHistory.messages.some(
    (message) =>
      message.role === "user" &&
      JSON.stringify(message.content).includes("THIS_MUST_NOT_EXECUTE"),
  ),
  false,
);

const finalStatus = await call("vlab.workers.status");
const finalRestarts = systemdNumber("NRestarts");
assert.equal(finalRestarts, baselineRestarts);

const degradedSamples = metrics.filter(
  (sample) => sample.eventLoop?.degraded === true,
).length;
let currentDegradedStreak = 0;
let maxDegradedStreak = 0;
for (const sample of metrics) {
  currentDegradedStreak =
    sample.eventLoop?.degraded === true ? currentDegradedStreak + 1 : 0;
  maxDegradedStreak = Math.max(maxDegradedStreak, currentDegradedStreak);
}
assert.ok(
  maxDegradedStreak <= 1,
  `event loop was degraded for ${maxDegradedStreak} consecutive samples`,
);
assert.ok(peakWorkers >= requiredWorkers);
assert.equal(peakTargetActiveSessions, sessionCount);
assert.equal(maxPendingAtSteadyState, 0);

const maximum = (read) =>
  metrics.reduce((max, sample) => Math.max(max, read(sample) ?? 0), 0);
const maxHealthRpcMs = maximum(
  (sample) => sample.controlPlane?.healthRpcMs,
);
const maxWorkerStatusRpcMs = maximum(
  (sample) => sample.controlPlane?.workerStatusRpcMs,
);
assert.ok(
  maxHealthRpcMs <= controlPlaneMaxLatencyMs,
  `health RPC latency ${maxHealthRpcMs.toFixed(1)}ms exceeded ` +
    `${controlPlaneMaxLatencyMs}ms`,
);
assert.ok(
  maxWorkerStatusRpcMs <= controlPlaneMaxLatencyMs,
  `worker status RPC latency ${maxWorkerStatusRpcMs.toFixed(1)}ms exceeded ` +
    `${controlPlaneMaxLatencyMs}ms`,
);
const summary = {
  ok: true,
  entry: "chat.send -> native AgentHarness -> elastic worker",
  topology:
    `${requiredWorkers}+ workers x up to ` +
    `${before.sessionsPerWorker} sessions`,
  sessionCount,
  toolHoldSeconds,
  toolHoldStaggerSeconds,
  durationSeconds: Math.round((Date.now() - startedAt) / 1_000),
  nativeHarnessAdmittedDelta:
    finalStatus.integration.nativeHarnessStats.admitted - admittedBefore,
  nativeHarnessCompletedDelta:
    finalStatus.integration.nativeHarnessStats.completed - completedBefore,
  targetSessionsCompleted: sessionCount,
  agentWaitTerminalCount,
  agentWaitRegistryTimeoutCount,
  idempotentRetryReexecuted: false,
  gatewayRestarted: false,
  metrics: {
    samples: metrics.length,
    degradedSamples,
    maxConsecutiveDegradedSamples: maxDegradedStreak,
    controlPlaneMaxLatencyMs,
    maxHealthRpcMs,
    maxWorkerStatusRpcMs,
    maxEventLoopUtilization: maximum(
      (sample) => sample.eventLoop?.utilization,
    ),
    maxEventLoopDelayP99Ms: maximum(
      (sample) => sample.eventLoop?.delayP99Ms,
    ),
    maxEventLoopDelayMaxMs: maximum(
      (sample) => sample.eventLoop?.delayMaxMs,
    ),
    maxMemoryCurrentBytes: maximum(
      (sample) => sample.memoryCurrentBytes,
    ),
    maxMemoryPeakBytes: maximum((sample) => sample.memoryPeakBytes),
    peakWorkers,
    peakActiveSessions,
    peakTargetActiveSessions,
    maxPendingDuringScaleUp,
    maxPendingAtSteadyState,
  },
  reportDir,
};
await saveJson("summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
