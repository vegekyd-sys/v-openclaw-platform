import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const labRoot = process.env.LAB_ROOT ?? "/srv/vlab";
const service =
  process.env.VLAB_GATEWAY_SERVICE ?? "openclaw-vlab-gateway.service";
const runtimePath =
  process.env.VLAB_OPENCLAW_GATEWAY_RUNTIME ??
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js";
const childHoldSeconds = Number(
  process.env.VLAB_LONG_SUBAGENT_HOLD_SECONDS ?? 660,
);
const upstreamTimeoutMs = Number(
  process.env.VLAB_LONG_SUBAGENT_UPSTREAM_TIMEOUT_MS ?? 600_000,
);
const acceptanceTimeoutMs = Number(
  process.env.VLAB_LONG_SUBAGENT_ACCEPTANCE_TIMEOUT_MS ?? 900_000,
);

assert.ok(childHoldSeconds > 600, "child must cross the old ten-minute wall");
assert.equal(
  upstreamTimeoutMs,
  600_000,
  "the regression must exercise OpenClaw's observed 600s default",
);
assert.ok(
  acceptanceTimeoutMs > childHoldSeconds * 1_000,
  "acceptance timeout must outlive the child",
);

const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z");
const token = timestamp.toLowerCase();
const parentSessionKey =
  `agent:makaron:explicit:vlab-long-subagent-${token}`;
const runId = `vlab-long-subagent-${token}`;
const childMarker = `VLAB_LONG_CHILD_OK_${token}`;
const parentMarker = `VLAB_LONG_PARENT_OK_${token}`;
const reportDir = `${labRoot}/logs/agent-worker-long-subagent-${timestamp}`;
const startedAt = Date.now();
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
const textBlocks = (history, role = "assistant") =>
  (history.messages ?? []).flatMap((message) =>
    message.role === role && Array.isArray(message.content)
      ? message.content
          .filter(
            (block) =>
              block?.type === "text" && typeof block.text === "string",
          )
          .map((block) => block.text)
      : [],
  );
const acceptedSpawn = (history) => {
  for (const message of history.messages ?? []) {
    if (message.role !== "toolResult" || message.toolName !== "sessions_spawn") {
      continue;
    }
    if (
      message.details?.status === "accepted" &&
      message.details?.childSessionKey
    ) {
      return message.details;
    }
    for (const block of message.content ?? []) {
      if (block?.type !== "text" || typeof block.text !== "string") continue;
      try {
        const parsed = JSON.parse(block.text);
        if (parsed?.status === "accepted" && parsed?.childSessionKey) {
          return parsed;
        }
      } catch {
        // Human-readable tool output is not a spawn acknowledgement.
      }
    }
  }
  return undefined;
};

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
await saveJson("status-before.json", before);
assert.equal(before.integration.workerIsolationVersion, "0.2.6");
assert.equal(before.integration.upstreamDefaultDoesNotCapNativeRun, true);
assert.ok(before.integration.nativeRequestTimeoutFloorMs > upstreamTimeoutMs);
assert.equal(before.integration.nativeCommandLaneProgress.failed, 0);

const childTask =
  `使用 exec 前台执行 /bin/sleep ${childHoldSeconds}；必须等待它真实退出，` +
  `然后只回复 ${childMarker}。不要发送外部消息，不要修改文件。`;
const parentMessage =
  `这是 Worker 0.2.6 长 Sub-Agent 回归。严格执行：` +
  `使用 sessions_spawn 启动恰好一个 isolated subagent，显式设置 ` +
  `agentId=makaron、cleanup=keep，任务为：${childTask} ` +
  `spawn accepted 后立即调用 sessions_yield。收到真实 completion 后，` +
  `只回复 ${parentMarker}；不能轮询、不能假装 completion 已到达。`;

const sent = await call(
  "chat.send",
  {
    sessionKey: parentSessionKey,
    agentId: "makaron",
    message: parentMessage,
    deliver: false,
    timeoutMs: upstreamTimeoutMs,
    idempotencyKey: runId,
  },
  upstreamTimeoutMs + 120_000,
);
await saveJson("send.json", sent);
assert.equal(sent.runId, runId);

let spawn;
let crossedOldBoundaryWhileActive = false;
let completionObserved = false;
let childWorkerPid;
const samples = [];
const deadline = Date.now() + acceptanceTimeoutMs;
while (Date.now() < deadline) {
  const [status, parentHistory] = await Promise.all([
    call("vlab.workers.status"),
    call("chat.history", { sessionKey: parentSessionKey, limit: 160 }),
  ]);
  spawn ??= acceptedSpawn(parentHistory);
  const active = spawn
    ? status.workers
        .flatMap((worker) =>
          worker.active.map((entry) => ({ ...entry, workerPid: worker.pid })),
        )
        .find((entry) => entry.sessionKey === spawn.childSessionKey)
    : undefined;
  if (active) {
    childWorkerPid ??= active.workerPid;
    assert.equal(active.workerPid, childWorkerPid);
    assert.ok(
      active.requestTimeoutMs >= before.integration.nativeRequestTimeoutFloorMs,
      "child did not receive the extended native lease",
    );
    if (Date.now() - startedAt > upstreamTimeoutMs) {
      crossedOldBoundaryWhileActive = true;
    }
  }
  completionObserved = textBlocks(parentHistory).some((text) =>
    text.includes(parentMarker),
  );
  samples.push({
    at: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    childSessionKey: spawn?.childSessionKey,
    childActive: Boolean(active),
    childWorkerPid: active?.workerPid,
    childRequestTimeoutMs: active?.requestTimeoutMs,
    parentCompleted: completionObserved,
    pending: status.pending,
    workers: status.workers.length,
    gatewayRestarts: systemdNumber("NRestarts") - baselineRestarts,
    memoryCurrentBytes: systemdNumber("MemoryCurrent"),
  });
  await saveJson("samples.json", samples);
  if (completionObserved) break;
  await sleep(10_000);
}

assert.ok(spawn?.childSessionKey, "parent never registered a real child Session");
assert.equal(
  crossedOldBoundaryWhileActive,
  true,
  "child was not active beyond the previous 600s wall",
);
assert.equal(completionObserved, true, "completion never returned to Parent");

const [childHistory, after, health] = await Promise.all([
  call("chat.history", { sessionKey: spawn.childSessionKey, limit: 120 }),
  call("vlab.workers.status"),
  call("health"),
]);
await saveJson("child-history.json", childHistory);
await saveJson("status-after.json", after);
await saveJson("health-after.json", health);
assert.ok(
  textBlocks(childHistory).some((text) => text.includes(childMarker)),
  "child terminal result is missing",
);
assert.equal(systemdNumber("NRestarts"), baselineRestarts);
assert.equal(health.ok, true);

const journal = execFileSync(
  "journalctl",
  [
    "-u",
    service,
    "--since",
    new Date(startedAt).toISOString(),
    "--no-pager",
  ],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
assert.equal(
  /timed out after 600000ms|Command lane .* timed out after 630000ms|worker \d+ exited.*SIGKILL/.test(
    journal,
  ),
  false,
  "a Worker or native command-lane timeout reappeared",
);

const summary = {
  ok: true,
  version: after.integration.workerIsolationVersion,
  reportDir,
  parentSessionKey,
  childSessionKey: spawn.childSessionKey,
  childWorkerPid,
  childHoldSeconds,
  upstreamTimeoutMs,
  elapsedMs: Date.now() - startedAt,
  crossedOldBoundaryWhileActive,
  parentCompletionReturned: completionObserved,
  nativeCommandLaneProgress: after.integration.nativeCommandLaneProgress,
  gatewayRestarts: systemdNumber("NRestarts") - baselineRestarts,
};
await saveJson("summary.json", summary);
console.log(JSON.stringify(summary, null, 2));
