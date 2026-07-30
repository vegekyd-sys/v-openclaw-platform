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
const mainCount = 5;
const childCount = 5;
const mainHoldSeconds = Number(process.env.VLAB_MAIN_HOLD_SECONDS ?? 180);
const childHoldSeconds = Number(process.env.VLAB_CHILD_HOLD_SECONDS ?? 60);
const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z");
const token = timestamp.toLowerCase();
const sessionPrefix = `agent:makaron:explicit:vlab-five-plus-five-${token}`;
const reportDir =
  `${labRoot}/logs/agent-worker-five-main-five-subagents-${timestamp}`;
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
const assistantTexts = (history) =>
  (history.messages ?? []).flatMap((message) =>
    message.role === "assistant" && Array.isArray(message.content)
      ? message.content
          .filter(
            (block) =>
              block?.type === "text" && typeof block.text === "string",
          )
          .map((block) => block.text)
      : [],
  );
const parseAcceptedSpawn = (history) => {
  for (const message of history.messages ?? []) {
    if (
      message.role !== "toolResult" ||
      message.toolName !== "sessions_spawn"
    ) {
      continue;
    }
    if (
      message.details?.status === "accepted" &&
      message.details?.childSessionKey
    ) {
      return message.details;
    }
    for (const block of message.content ?? []) {
      if (block?.type !== "text" || typeof block.text !== "string") {
        continue;
      }
      try {
        const payload = JSON.parse(block.text);
        if (payload?.status === "accepted" && payload?.childSessionKey) {
          return payload;
        }
      } catch {
        // Human-readable tool results are not spawn acknowledgements.
      }
    }
  }
  return undefined;
};

await mkdir(reportDir, { recursive: true, mode: 0o700 });
const { callGatewayFromCli } = await import(pathToFileURL(runtimePath).href);
const call = async (method, params = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      return await callGatewayFromCli(
        method,
        { timeout: "480000", json: true },
        params,
      );
    } catch (error) {
      lastError = error;
      if (attempt < 8) {
        await sleep(1_500);
      }
    }
  }
  throw lastError;
};

const baselineRestarts = systemdNumber("NRestarts");
const before = await call("vlab.workers.status");
await saveJson("status-before.json", before);
assert.equal(before.integration.workerIsolationVersion, "0.1.7");
assert.equal(before.integration.nestedGatewayHarnessRouting, true);
assert.equal(before.integration.workerUsesIngressAgentCommand, true);
assert.equal(before.maxWorkers, 3);
assert.equal(before.sessionsPerWorker, 3);
assert.equal(before.openClawConcurrency.maxConcurrent, 10);
assert.equal(before.openClawConcurrency.subagentsMaxConcurrent, 8);

const mains = Array.from({ length: mainCount }, (_, index) => {
  const number = index + 1;
  return {
    number,
    sessionKey: `${sessionPrefix}-main-${number}`,
    runId: `vlab-five-plus-five-${token}-${number}`,
    mainMarker: `VLAB_MAIN_${number}_OK_${token}`,
    childMarker: `VLAB_CHILD_${number}_OK_${token}`,
  };
});

await Promise.all(
  mains.map(async (item) => {
    const childTask =
      `使用 exec 执行 /bin/sleep ${childHoldSeconds}；如果返回后台进程，` +
      `必须使用 process poll 等待真实退出，然后只回复 ${item.childMarker}。` +
      `不要发送外部消息，不要修改文件。`;
    const message =
      `这是 vLab 0.1.7 的 5 main + 5 Subagent 回归。严格执行：` +
      `1) 使用 sessions_spawn 启动恰好一个 isolated subagent，必须显式设置 ` +
      `agentId=makaron，child 任务为：${childTask} ` +
      `2) spawn accepted 后，main 立即使用 exec 执行 /bin/sleep ` +
      `${mainHoldSeconds}；如果返回后台进程，必须使用 process poll 等待真实退出。` +
      `3) main 结束时，如果真实 child completion 已在本轮到达，直接只回复 ` +
      `${item.mainMarker}；如果尚未到达，才调用 sessions_yield，收到真实 ` +
      `completion 后只回复 ${item.mainMarker}。不能用文字假装收到 completion，` +
      `也不能为已经收到的 completion 再次 yield。`;
    const sent = await call("chat.send", {
      sessionKey: item.sessionKey,
      agentId: "makaron",
      message,
      deliver: false,
      timeoutMs: 420_000,
      idempotencyKey: item.runId,
    });
    assert.equal(sent.runId, item.runId);
    await saveJson(`send-${item.number}.json`, sent);
  }),
);

const childByMain = new Map();
const samples = [];
let peakWorkers = 0;
let peakMainActive = 0;
let peakChildActive = 0;
let peakTargetActive = 0;
let peakPending = 0;
let maxMemoryCurrent = 0;
let maxWarmEventLoopP99Ms = 0;
let degradedSamples = 0;
let currentDegradedStreak = 0;
let maxDegradedStreak = 0;
let completionCount = 0;
const deadline = Date.now() + 420_000;

while (Date.now() < deadline) {
  const [status, health] = await Promise.all([
    call("vlab.workers.status"),
    call("health"),
  ]);
  for (const item of mains) {
    if (childByMain.has(item.number)) {
      continue;
    }
    const history = await call("chat.history", {
      sessionKey: item.sessionKey,
      limit: 100,
    });
    const spawn = parseAcceptedSpawn(history);
    if (spawn) {
      childByMain.set(item.number, spawn);
    }
  }
  const childKeys = new Set(
    [...childByMain.values()].map((spawn) => spawn.childSessionKey),
  );
  const activeEntries = status.workers.flatMap((worker) => worker.active);
  const mainActive = activeEntries.filter((entry) =>
    entry.sessionKey?.startsWith(sessionPrefix),
  ).length;
  const childActive = activeEntries.filter((entry) =>
    childKeys.has(entry.sessionKey),
  ).length;
  const targetActive = mainActive + childActive;
  const elapsedMs = Date.now() - startedAt;
  const eventLoopP99 = Number(health.eventLoop?.delayP99Ms ?? 0);
  if (elapsedMs >= 30_000) {
    maxWarmEventLoopP99Ms = Math.max(
      maxWarmEventLoopP99Ms,
      eventLoopP99,
    );
    if (health.eventLoop?.degraded) {
      degradedSamples += 1;
      currentDegradedStreak += 1;
      maxDegradedStreak = Math.max(
        maxDegradedStreak,
        currentDegradedStreak,
      );
    } else {
      currentDegradedStreak = 0;
    }
  }
  peakWorkers = Math.max(peakWorkers, status.workers.length);
  peakMainActive = Math.max(peakMainActive, mainActive);
  peakChildActive = Math.max(peakChildActive, childActive);
  peakTargetActive = Math.max(peakTargetActive, targetActive);
  peakPending = Math.max(peakPending, status.pending);
  maxMemoryCurrent = Math.max(
    maxMemoryCurrent,
    systemdNumber("MemoryCurrent"),
  );

  completionCount = 0;
  for (const item of mains) {
    const history = await call("chat.history", {
      sessionKey: item.sessionKey,
      limit: 160,
    });
    if (assistantTexts(history).some((text) =>
      text.includes(item.mainMarker),
    )) {
      completionCount += 1;
    }
  }
  samples.push({
    at: new Date().toISOString(),
    workers: status.workers.length,
    mainActive,
    childActive,
    targetActive,
    pending: status.pending,
    acceptedChildren: childByMain.size,
    completedParents: completionCount,
    eventLoop: health.eventLoop,
    memoryCurrentBytes: systemdNumber("MemoryCurrent"),
    memoryPeakBytes: systemdNumber("MemoryPeak"),
    restarts: systemdNumber("NRestarts"),
  });
  await saveJson("metrics.json", samples);
  if (completionCount === mainCount) {
    break;
  }
  await sleep(5_000);
}

const failures = [];
for (const item of mains) {
  const mainHistory = await call("chat.history", {
    sessionKey: item.sessionKey,
    limit: 240,
  });
  await saveJson(`main-history-${item.number}.json`, mainHistory);
  const spawn = parseAcceptedSpawn(mainHistory);
  if (!spawn) {
    failures.push(`main-${item.number}-spawn-not-accepted`);
    continue;
  }
  const childHistory = await call("chat.history", {
    sessionKey: spawn.childSessionKey,
    limit: 200,
  });
  await saveJson(`child-history-${item.number}.json`, childHistory);
  const mainText = assistantTexts(mainHistory).join("\n");
  const childText = assistantTexts(childHistory).join("\n");
  if (!mainText.includes(item.mainMarker)) {
    failures.push(`main-${item.number}-missing-marker`);
  }
  if (!childText.includes(item.childMarker)) {
    failures.push(`child-${item.number}-missing-marker`);
  }
  if (
    /session file changed while embedded prompt lock was released|Agent couldn't generate a response|incomplete turn/i.test(
      `${mainText}\n${childText}`,
    )
  ) {
    failures.push(`session-${item.number}-takeover-or-generic-failure`);
  }
}

const journal = execFileSync(
  "journalctl",
  [
    "-u",
    service,
    "--since",
    `@${Math.floor(startedAt / 1_000)}`,
    "--no-pager",
  ],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);
await writeFile(`${reportDir}/journal.log`, journal, { mode: 0o600 });
const takeoverErrors = (
  journal.match(
    /session file changed while embedded prompt lock was released|EmbeddedAttemptSessionTakeoverError/g,
  ) ?? []
).length;
const after = await call("vlab.workers.status");
let healthAfter = await call("health");
const eventLoopRecovery = [
  {
    at: new Date().toISOString(),
    eventLoop: healthAfter.eventLoop,
  },
];
const eventLoopRecoveryDeadline = Date.now() + 30_000;
while (
  healthAfter.eventLoop?.degraded === true &&
  Date.now() < eventLoopRecoveryDeadline
) {
  await sleep(2_000);
  healthAfter = await call("health");
  eventLoopRecovery.push({
    at: new Date().toISOString(),
    eventLoop: healthAfter.eventLoop,
  });
}
await saveJson("status-after.json", after);
await saveJson("health-after.json", healthAfter);
await saveJson("event-loop-recovery.json", eventLoopRecovery);
const finalRestarts = systemdNumber("NRestarts");

assert.equal(childByMain.size, childCount);
assert.equal(completionCount, mainCount);
assert.equal(failures.length, 0, failures.join(", "));
assert.equal(takeoverErrors, 0);
assert.equal(finalRestarts, baselineRestarts);
assert.equal(healthAfter.eventLoop?.degraded, false);
assert.equal(peakMainActive, mainCount);
assert.ok(
  peakChildActive >= 4,
  `only ${peakChildActive} child runs entered the pool concurrently`,
);
assert.ok(
  peakTargetActive >= 9,
  `only ${peakTargetActive} target runs were simultaneously active`,
);
assert.ok(
  after.integration.nativeHarnessStats.admitted -
    before.integration.nativeHarnessStats.admitted >=
    mainCount + childCount,
);
assert.ok(
  maxDegradedStreak <= 2,
  `Event Loop remained degraded for ${maxDegradedStreak} samples`,
);

const summary = {
  ok: true,
  version: after.integration.workerIsolationVersion,
  reportDir,
  configured: {
    mainCount,
    childCount,
    mainHoldSeconds,
    childHoldSeconds,
    maxActiveSessions: 9,
  },
  acceptance: {
    acceptedChildren: childByMain.size,
    completedParents: completionCount,
    completedChildren: childCount,
    peakWorkers,
    peakMainActive,
    peakChildActive,
    peakTargetActive,
    peakPending,
    takeoverErrors,
    failures,
  },
  gateway: {
    restartsBefore: baselineRestarts,
    restartsAfter: finalRestarts,
    degradedSamples,
    maxDegradedStreak,
    maxWarmEventLoopP99Ms,
    eventLoopRecoverySamples: eventLoopRecovery.length,
    eventLoopRecovered: healthAfter.eventLoop?.degraded === false,
    memoryCurrentPeakObservedBytes: maxMemoryCurrent,
    memoryPeakBytes: systemdNumber("MemoryPeak"),
    eventLoopAfter: healthAfter.eventLoop,
  },
  nativeHarnessStatsBefore: before.integration.nativeHarnessStats,
  nativeHarnessStatsAfter: after.integration.nativeHarnessStats,
};
await saveJson("summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
