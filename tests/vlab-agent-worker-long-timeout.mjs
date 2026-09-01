import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const labRoot = process.env.LAB_ROOT ?? "/srv/vlab";
const service =
  process.env.VLAB_GATEWAY_SERVICE ?? "openclaw-vlab-gateway.service";
const runtimePath =
  process.env.VLAB_OPENCLAW_GATEWAY_RUNTIME ??
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js";
const durationMs = Number(process.env.VLAB_LONG_HOLD_MS ?? 630_000);
const requestTimeoutMs = Number(
  process.env.VLAB_LONG_REQUEST_TIMEOUT_MS ?? 900_000,
);
assert.ok(durationMs > 600_000, "long hold must cross the old 600s boundary");
assert.ok(
  requestTimeoutMs >= durationMs + 30_000,
  "request timeout must exceed the hold by at least 30s",
);

const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z");
const token = timestamp.toLowerCase();
const sessionKey =
  `agent:makaron:explicit:vlab-worker-long-timeout-${token}`;
const reportDir =
  `${labRoot}/logs/agent-worker-long-timeout-${timestamp}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const systemdNumber = (property) =>
  Number(
    execFileSync(
      "systemctl",
      ["show", service, `-p${property}`, "--value"],
      { encoding: "utf8" },
    ).trim(),
  ) || 0;
const saveJson = async (name, value) =>
  await writeFile(
    `${reportDir}/${name}`,
    `${JSON.stringify(value, null, 2)}\n`,
    { mode: 0o600 },
  );

await mkdir(reportDir, { recursive: true, mode: 0o700 });
const { callGatewayFromCli } = await import(pathToFileURL(runtimePath).href);
const call = async (method, params = {}, timeoutMs = 120_000) =>
  await callGatewayFromCli(
    method,
    { timeout: String(timeoutMs), json: true },
    params,
  );

const baselineRestarts = systemdNumber("NRestarts");
const before = await call("vlab.workers.status");
assert.equal(before.integration.workerIsolationVersion, "0.2.8");
assert.equal(before.integration.upstreamAttemptTimeoutPropagation, true);
assert.equal(before.integration.upstreamDefaultDoesNotCapNativeRun, true);
assert.ok(before.integration.nativeRequestTimeoutFloorMs > 600_000);
await saveJson("status-before.json", before);

const startedAt = Date.now();
let settled = false;
const holdPromise = call(
  "vlab.workers.hold",
  {
    sessionKey,
    durationMs,
    requestTimeoutMs,
  },
  requestTimeoutMs + 120_000,
).then(
  (result) => {
    settled = true;
    return { result };
  },
  (error) => {
    settled = true;
    return { error };
  },
);

const samples = [];
let observedActive = false;
let workerPid;
const activeDeadline = Date.now() + 60_000;
while (!observedActive && Date.now() < activeDeadline) {
  const status = await call("vlab.workers.status");
  const active = status.workers
    .flatMap((worker) =>
      worker.active.map((entry) => ({ ...entry, workerPid: worker.pid })),
    )
    .find((entry) => entry.sessionKey === sessionKey);
  if (active) {
    observedActive = true;
    workerPid = active.workerPid;
    assert.equal(active.requestTimeoutMs, requestTimeoutMs);
  } else {
    await sleep(1_000);
  }
}
assert.equal(observedActive, true, "long hold never entered the Worker pool");

while (!settled) {
  const [status, health] = await Promise.all([
    call("vlab.workers.status"),
    call("health"),
  ]);
  const active = status.workers
    .flatMap((worker) =>
      worker.active.map((entry) => ({ ...entry, workerPid: worker.pid })),
    )
    .find((entry) => entry.sessionKey === sessionKey);
  samples.push({
    at: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    active,
    pending: status.pending,
    eventLoop: health.eventLoop,
    memoryCurrentBytes: systemdNumber("MemoryCurrent"),
    memoryPeakBytes: systemdNumber("MemoryPeak"),
    restarts: systemdNumber("NRestarts"),
  });
  await saveJson("samples.json", samples);
  if (!settled) {
    await sleep(15_000);
  }
}

const outcome = await holdPromise;
if (outcome.error) {
  throw outcome.error;
}
const { result } = outcome;
const elapsedMs = Date.now() - startedAt;
const after = await call("vlab.workers.status");
const healthAfter = await call("health");
await saveJson("status-after.json", after);
await saveJson("health-after.json", healthAfter);

assert.equal(result.kind, "hold");
assert.ok(
  elapsedMs >= durationMs - 1_000,
  `hold ended too early after ${elapsedMs}ms`,
);
assert.equal(systemdNumber("NRestarts"), baselineRestarts);
assert.ok(
  samples.some((sample) => sample.elapsedMs > 600_000 && sample.active),
  "request was not still active after the old 600s boundary",
);
assert.ok(
  samples
    .filter((sample) => sample.active)
    .every((sample) => sample.active.workerPid === workerPid),
  "long request changed Worker PID",
);
assert.ok(
  samples
    .filter((sample) => sample.active)
    .every(
      (sample) =>
        sample.active.lastProgressAgeMs <
        before.requestStallTimeoutMs,
    ),
  "long request stopped publishing Worker progress",
);
assert.equal(healthAfter.ok, true);

const summary = {
  ok: true,
  version: after.integration.workerIsolationVersion,
  reportDir,
  sessionKey,
  durationMs,
  elapsedMs,
  requestTimeoutMs,
  workerPid,
  samples: samples.length,
  crossedOldBoundary: true,
  gatewayRestarts: systemdNumber("NRestarts") - baselineRestarts,
  maxMemoryPeakBytes: Math.max(
    ...samples.map((sample) => sample.memoryPeakBytes),
  ),
  maxEventLoopP99Ms: Math.max(
    ...samples.map((sample) => sample.eventLoop?.delayP99Ms ?? 0),
  ),
  finalEventLoop: healthAfter.eventLoop,
};
await saveJson("summary.json", summary);
console.log(JSON.stringify(summary, null, 2));
