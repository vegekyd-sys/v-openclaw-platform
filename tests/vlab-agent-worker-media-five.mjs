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
const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z");
const reuseToken = process.env.VLAB_MEDIA_REUSE_TOKEN?.trim();
const token = reuseToken || timestamp.toLowerCase();
const reportDir = `${labRoot}/logs/agent-worker-media-five-${timestamp}`;

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

function sum(values) {
  return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

function historyText(history) {
  return JSON.stringify(history);
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
const call = async (method, params = {}, timeout = "240000") =>
  await callGatewayFromCli(method, { timeout, json: true }, params);

async function readHistory(sessionKey) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await call("chat.history", { sessionKey, limit: 100 });
    } catch (error) {
      if (
        error?.retryable === true ||
        /session history is rebuilding/i.test(String(error?.message ?? error))
      ) {
        await sleep(Number(error?.retryAfterMs ?? 250));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`session history stayed unavailable: ${sessionKey}`);
}

const baselineRestarts = systemdNumber("NRestarts");
const statusBefore = await call("vlab.workers.status");
const healthBefore = await call("health");
await saveJson("status-before.json", statusBefore);
await saveJson("health-before.json", healthBefore);
const mediaBefore = statusBefore.integration.mediaCompletionRelay;

const sessions = Array.from({ length: 5 }, (_, offset) => {
  const index = offset + 1;
  return {
    index,
    sessionKey: `agent:makaron:explicit:openclaw81-media-${token}-${index}`,
    runId: `openclaw81-media-${token}-${index}`,
  };
});

if (!reuseToken) {
  await Promise.all(
    sessions.map(async ({ index, sessionKey, runId }) => {
    const message =
      `这是 OpenClaw 8.1 Worker 异步媒体回传验收，第 ${index}/5 个并发 Session。` +
      "请只调用一次 image_generate，生成一张以 V - Makaron 为主角、回顾上周工作、" +
      `具有连续剧情和中文对白的四格漫画（第 ${index} 个版本，自由发挥不同情节）。` +
      "不要使用参考图。工具确认后台任务已启动后不要重试，只简短说明已启动并等待完成事件。";
    const sent = await call("chat.send", {
      sessionKey,
      agentId: "makaron",
      message,
      deliver: false,
      timeoutMs: 180_000,
      idempotencyKey: runId,
    });
    assert.equal(sent.runId, runId);
    }),
  );
}

const samples = [];
let statusAfter = statusBefore;
let healthAfter = healthBefore;
let completed = false;
let completedHistories = 0;
for (let attempt = 0; attempt < 180; attempt += 1) {
  statusAfter = await call("vlab.workers.status");
  healthAfter = await call("health");
  const media = statusAfter.integration.mediaCompletionRelay;
  const detached = sum(
    statusAfter.workers.map((worker) => worker.detachedTaskCount),
  );
  samples.push({
    at: new Date().toISOString(),
    workers: statusAfter.workers.length,
    active: sum(statusAfter.workers.map((worker) => worker.activeCount)),
    detached,
    pending: statusAfter.pending,
    media,
    eventLoop: healthAfter.eventLoop,
    memoryCurrent: systemdNumber("MemoryCurrent"),
    memoryPeak: systemdNumber("MemoryPeak"),
  });
  completedHistories = 0;
  for (const session of sessions) {
    const history = await readHistory(session.sessionKey);
    const serialized = historyText(history);
    if (
      /image_generate/.test(serialized) &&
      /"type":"image"|"type": "image"/.test(serialized) &&
      /MEDIA:|media\/tool-image-generation/i.test(serialized)
    ) {
      completedHistories += 1;
    }
  }
  if (completedHistories === 5 && detached === 0) {
    completed = true;
    break;
  }
  await sleep(5_000);
}
assert.equal(completed, true, "five native media completions did not arrive");

const histories = [];
for (const session of sessions) {
  const history = await readHistory(session.sessionKey);
  histories.push(history);
  await saveJson(`history-${session.index}.json`, history);
  const serialized = historyText(history);
  assert.match(serialized, /image_generate/);
  assert.match(
    serialized,
    /MEDIA:|media\/tool-image-generation|image generation task completed|background task completed/i,
    `${session.sessionKey}: completion media was not recorded in session history`,
  );
}

assert.equal(systemdNumber("NRestarts"), baselineRestarts);
assert.equal(statusAfter.pending, 0);
assert.equal(healthAfter.eventLoop?.degraded, false);
assert.equal(
  Number(statusAfter.integration.mediaCompletionRelay.failed ?? 0),
  Number(mediaBefore.failed ?? 0),
);
if (!reuseToken) {
  assert.ok(
    Number(statusAfter.integration.mediaCompletionRelay.received ?? 0) >=
      Number(mediaBefore.received ?? 0) + 5,
    "Gateway did not receive all five Worker media lifecycle events",
  );
}

const summary = {
  ok: true,
  version: statusAfter.integration.workerIsolationVersion,
  sessionKeys: sessions.map((session) => session.sessionKey),
  mediaBefore,
  mediaAfter: statusAfter.integration.mediaCompletionRelay,
  nativeCompletionHistoryCount: completedHistories,
  reusedExistingSessions: Boolean(reuseToken),
  peakWorkers: Math.max(...samples.map((sample) => sample.workers)),
  peakActive: Math.max(...samples.map((sample) => sample.active)),
  peakDetached: Math.max(...samples.map((sample) => sample.detached)),
  peakPending: Math.max(...samples.map((sample) => sample.pending)),
  peakMemoryCurrent: Math.max(
    ...samples.map((sample) => sample.memoryCurrent),
  ),
  peakEventLoopP99Ms: Math.max(
    ...samples.map((sample) => sample.eventLoop?.delayP99Ms ?? 0),
  ),
  nRestarts: systemdNumber("NRestarts"),
  reportDir,
};
await saveJson("samples.json", samples);
await saveJson("summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
