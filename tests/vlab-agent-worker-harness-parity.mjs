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
const token = timestamp.toLowerCase();
const sessionKey = `agent:makaron:explicit:vlab-harness-parity-${token}`;
const runId = `vlab-harness-parity-${token}`;
const marker = `VLAB_HARNESS_PARITY_OK_${token}`;
const expectedWorkerVersion =
  process.env.VLAB_EXPECTED_WORKER_VERSION ?? "0.2.8";
const reportDir =
  `${labRoot}/logs/agent-worker-harness-parity-${timestamp}`;

function systemdNumber(property) {
  const raw = execFileSync(
    "systemctl",
    ["show", service, `-p${property}`, "--value"],
    { encoding: "utf8" },
  ).trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assistantTexts(history) {
  return history.messages.flatMap((message) =>
    message.role === "assistant" && Array.isArray(message.content)
      ? message.content
          .filter(
            (block) =>
              block?.type === "text" && typeof block.text === "string",
          )
          .map((block) => block.text)
      : [],
  );
}

function modelAssistantTexts(history) {
  return history.messages.flatMap((message) =>
    message.role === "assistant" &&
    message.provider !== "openclaw" &&
    Array.isArray(message.content)
      ? message.content
          .filter(
            (block) =>
              block?.type === "text" && typeof block.text === "string",
          )
          .map((block) => block.text)
      : [],
  );
}

function toolResults(history, toolName) {
  return history.messages.filter(
    (message) =>
      message.role === "toolResult" && message.toolName === toolName,
  );
}

function toolResultStatus(result) {
  if (typeof result.details?.status === "string") {
    return result.details.status;
  }
  for (const block of result.content ?? []) {
    if (block?.type !== "text" || typeof block.text !== "string") {
      continue;
    }
    try {
      const parsed = JSON.parse(block.text);
      if (typeof parsed?.status === "string") {
        return parsed.status;
      }
    } catch {
      // Some native tools return human-readable text instead of JSON.
    }
  }
  return undefined;
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
const call = async (method, params = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      return await callGatewayFromCli(
        method,
        { timeout: "300000", json: true },
        params,
      );
    } catch (error) {
      lastError = error;
      if (attempt === 10) {
        break;
      }
      await sleep(2_000);
    }
  }
  throw lastError;
};

const baselineRestarts = systemdNumber("NRestarts");
const before = await call("vlab.workers.status");
await saveJson("status-before.json", before);
assert.equal(
  before.integration.workerIsolationVersion,
  expectedWorkerVersion,
  `vLab is not running worker isolation ${expectedWorkerVersion}`,
);

const message =
  `这是 Worker Harness 语义回归，必须严格按顺序调用工具：` +
  `1) 使用 sessions_spawn 启动一个 isolated subagent；child 必须先用 ` +
  `exec 执行 /bin/sleep 20，然后只回复 CHILD_DONE_${token}。` +
  `2) spawn 被接受后，parent 必须立即调用 sessions_yield 等待 child，` +
  `不要调用 exec、process、sessions_list、sessions_history 或任何轮询工具。` +
  `3) 收到真实 subagent completion event 后，只回复 ${marker}。` +
  `不要发送外部消息，不要修改文件，不能用文字假装调用工具。`;

const sent = await call("chat.send", {
  sessionKey,
  agentId: "makaron",
  message,
  deliver: false,
  timeoutMs: 240_000,
  idempotencyKey: runId,
});
await saveJson("send.json", sent);
assert.equal(sent.runId, runId);

let history;
const deadline = Date.now() + 180_000;
while (Date.now() < deadline) {
  history = await call("chat.history", { sessionKey, limit: 120 });
  const texts = modelAssistantTexts(history);
  if (
    texts.some((text) => text.includes(marker)) &&
    toolResults(history, "sessions_yield").length > 0
  ) {
    break;
  }
  await sleep(2_000);
}
assert.ok(history, "chat.history did not return");
await saveJson("history.json", history);

const texts = assistantTexts(history);
const modelTexts = modelAssistantTexts(history);
const allAssistantText = texts.join("\n");
assert.ok(
  modelTexts.some((text) => text.includes(marker)),
  "parent did not resume with the final marker after sessions_yield",
);
assert.equal(
  /Agent couldn't generate a response|Something went wrong while processing|incomplete turn/i.test(
    allAssistantText,
  ),
  false,
  "Worker surfaced a generic incomplete-turn failure",
);

const spawns = toolResults(history, "sessions_spawn");
assert.ok(
  spawns.some((result) => toolResultStatus(result) === "accepted"),
  "sessions_spawn was not accepted",
);
const yields = toolResults(history, "sessions_yield");
assert.ok(
  yields.some((result) => toolResultStatus(result) === "yielded"),
  "sessions_yield did not reach its native yielded terminal state",
);

const after = await call("vlab.workers.status");
const health = await call("health");
await saveJson("status-after.json", after);
await saveJson("health.json", health);
const finalRestarts = systemdNumber("NRestarts");
assert.equal(finalRestarts, baselineRestarts);
assert.equal(health.eventLoop?.degraded, false);

const summary = {
  ok: true,
  version: after.integration.workerIsolationVersion,
  sessionKey,
  runId,
  sessionsSpawnAccepted: true,
  sessionsYieldPreserved: true,
  parentResumedAfterCompletion: true,
  genericIncompleteTurnFailure: false,
  gatewayRestarted: false,
  eventLoop: health.eventLoop,
  memoryCurrentBytes: systemdNumber("MemoryCurrent"),
  memoryPeakBytes: systemdNumber("MemoryPeak"),
  nativeHarnessStats: after.integration.nativeHarnessStats,
  reportDir,
};
await saveJson("summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
