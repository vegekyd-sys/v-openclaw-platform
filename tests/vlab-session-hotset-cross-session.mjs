import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const labRoot = process.env.LAB_ROOT ?? "/srv/vlab";
const runtimePath =
  process.env.VLAB_OPENCLAW_GATEWAY_RUNTIME ??
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js";
const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z")
  .toLowerCase();
const targetSessionKey =
  `agent:makaron:explicit:vlab-hotset-target-${timestamp}`;
const observerSessionKey =
  `agent:makaron:explicit:vlab-hotset-observer-${timestamp}`;
const taskMarker = `VLAB_HOTSET_ACTIVE_TASK_${timestamp}`;
const observerMarker = `VLAB_HOTSET_OBSERVER_OK_${timestamp}`;
const targetDoneMarker = `VLAB_HOTSET_TARGET_DONE_${timestamp}`;
const reportDir = `${labRoot}/logs/session-hotset-cross-session-${timestamp}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await mkdir(reportDir, { recursive: true, mode: 0o700 });
const save = async (name, value) =>
  await writeFile(
    `${reportDir}/${name}`,
    `${JSON.stringify(value, null, 2)}\n`,
    { mode: 0o600 },
  );
const { callGatewayFromCli } = await import(pathToFileURL(runtimePath).href);
const call = async (method, params = {}) =>
  await callGatewayFromCli(
    method,
    { timeout: "240000", json: true },
    params,
  );
const assistantTexts = (history) =>
  (history.messages ?? []).flatMap((message) =>
    message.role === "assistant" && Array.isArray(message.content)
      ? message.content
          .filter((block) => block?.type === "text")
          .map((block) => block.text)
      : [],
  );
const toolNames = (history) =>
  new Set(
    (history.messages ?? []).flatMap((message) => [
      ...(message.role === "toolResult" && message.toolName
        ? [message.toolName]
        : []),
      ...(Array.isArray(message.content)
        ? message.content
            .filter((block) => block?.type === "toolCall" && block.name)
            .map((block) => block.name)
        : []),
    ]),
  );

const before = await call("vlab.workers.status");
assert.equal(before.integration.workerIsolationVersion, "0.2.8");
assert.equal(before.integration.sessionHotset.gateway.enabled, true);
assert.equal(
  before.integration.sessionHotset.gateway.strategy,
  "central-directory-cold-derived-state-v1",
);

await call("chat.send", {
  sessionKey: targetSessionKey,
  agentId: "makaron",
  message:
    `这是跨 Session 可见性验收，任务标记是 ${taskMarker}。` +
    "必须使用 exec 前台执行 /bin/sleep 45；完成后只回复 " +
    `${targetDoneMarker}。不要调用 sessions_* 工具。`,
  deliver: false,
  timeoutMs: 120_000,
  idempotencyKey: `target-${timestamp}`,
});

let targetActive = false;
const activeDeadline = Date.now() + 45_000;
while (Date.now() < activeDeadline) {
  const status = await call("vlab.workers.status");
  targetActive = status.workers.some((worker) =>
    worker.active.some((entry) => entry.sessionKey === targetSessionKey),
  );
  if (targetActive) break;
  await sleep(500);
}
assert.equal(targetActive, true, "target Session never became active");

await call("chat.send", {
  sessionKey: observerSessionKey,
  agentId: "makaron",
  message:
    "这是跨 Session 能力验收。你必须真实调用 sessions_list 找到正在运行的 " +
    `${targetSessionKey}，然后真实调用 sessions_history 查询它正在做什么。` +
    `确认 history 中存在 ${taskMarker} 后，只回复 ${observerMarker}。` +
    "不要调用 exec，不要猜测，不要给目标 Session 发消息。",
  deliver: false,
  timeoutMs: 180_000,
  idempotencyKey: `observer-${timestamp}`,
});

let observerHistory;
const observerDeadline = Date.now() + 180_000;
while (Date.now() < observerDeadline) {
  observerHistory = await call("chat.history", {
    sessionKey: observerSessionKey,
    limit: 120,
  });
  if (assistantTexts(observerHistory).some((text) => text.includes(observerMarker))) {
    break;
  }
  await sleep(1_000);
}
assert.ok(observerHistory, "observer history unavailable");
await save("observer-history.json", observerHistory);
const observedTools = toolNames(observerHistory);
assert.ok(observedTools.has("sessions_list"), "observer did not call sessions_list");
assert.ok(
  observedTools.has("sessions_history"),
  "observer did not call sessions_history",
);
assert.ok(
  assistantTexts(observerHistory).some((text) => text.includes(observerMarker)),
  "observer did not confirm the active sibling task",
);

let targetHistory;
const targetDeadline = Date.now() + 120_000;
while (Date.now() < targetDeadline) {
  targetHistory = await call("chat.history", {
    sessionKey: targetSessionKey,
    limit: 80,
  });
  if (assistantTexts(targetHistory).some((text) => text.includes(targetDoneMarker))) {
    break;
  }
  await sleep(1_000);
}
assert.ok(
  assistantTexts(targetHistory).some((text) => text.includes(targetDoneMarker)),
  "target Session did not complete normally",
);

const listing = await call("sessions.list", {
  search: "vlab-hotset-",
  limit: 20,
});
await save("sessions-list.json", listing);
const listedKeys = new Set((listing.sessions ?? []).map((entry) => entry.key));
assert.ok(listedKeys.has(targetSessionKey));
assert.ok(listedKeys.has(observerSessionKey));
const after = await call("vlab.workers.status");
const health = await call("health");
await save("status-after.json", after);
await save("health.json", health);
assert.equal(health.eventLoop?.degraded, false);

const summary = {
  ok: true,
  version: after.integration.workerIsolationVersion,
  targetSessionKey,
  observerSessionKey,
  activeSiblingVisible: true,
  sessionsListUsed: true,
  sessionsHistoryUsed: true,
  centralDirectoryStillListsBoth: true,
  targetCompletedNormally: true,
  eventLoop: health.eventLoop,
  reportDir,
};
await save("summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
