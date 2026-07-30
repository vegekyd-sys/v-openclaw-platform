import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const labRoot = process.env.LAB_ROOT ?? "/srv/vlab";
const reportRoot = process.env.VLAB_REPORT_ROOT ?? `${labRoot}/logs`;
const service =
  process.env.VLAB_GATEWAY_SERVICE ?? "openclaw-vlab-gateway.service";
const runtimePath =
  process.env.VLAB_OPENCLAW_GATEWAY_RUNTIME ??
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js";
const runTimeoutMs = 300_000;
const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z");
const token = timestamp.toLowerCase();
const targetSessionKey = process.env.VLAB_STREAM_SESSION_KEY?.trim();
const sessionKey =
  targetSessionKey ||
  `agent:makaron:explicit:vlab-stream-parity-${token}`;
const deliver = Boolean(targetSessionKey);
const runId = `vlab-stream-parity-${token}`;
const marker = `VLAB_STREAM_PARITY_OK_${token}`;
const reportDir = `${reportRoot}/agent-worker-stream-parity-${timestamp}`;

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

function assistantTexts(history) {
  return history.messages.flatMap((message) =>
    message.role === "assistant"
      ? message.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
      : [],
  );
}

await mkdir(reportDir, { recursive: true, mode: 0o700 });
const { callGatewayFromCli } = await import(pathToFileURL(runtimePath).href);
const call = async (method, params = {}) =>
  await callGatewayFromCli(
    method,
    { timeout: String(runTimeoutMs + 60_000), json: true },
    params,
  );

const restartsBefore = systemdNumber("NRestarts");
const before = await call("vlab.workers.status");
await saveJson("status-before.json", before);
const parityBefore = before.integration.nativeHarnessEventParity;
const partialRepliesBefore = parityBefore.eventsByCallback?.onPartialReply ?? 0;
const completedBefore = before.integration.nativeHarnessStats.completed;

assert.equal(before.integration.workerIsolationVersion, "0.1.7");
assert.equal(parityBefore.contractVersion, "openclaw-2026.7.1-v2");
assert.equal(parityBefore.orderedBackpressure, true);
assert.equal(parityBefore.eventRelayFailures, 0);
assert.deepEqual(parityBefore.unclassifiedCallbacks, []);
assert.deepEqual(parityBefore.unclassifiedOptions, []);

const message =
  "这是 vLab Worker 流式事件验收。不要调用任何工具。请直接输出 30 行中文，" +
  "每行以“流式验收第 N 行：”开头并写一句不同的短句；最后单独输出 " +
  `${marker}。`;
const sent = await call("chat.send", {
  sessionKey,
  agentId: "makaron",
  message,
  deliver,
  timeoutMs: runTimeoutMs,
  idempotencyKey: runId,
});
await saveJson("send.json", sent);
assert.equal(sent.runId, runId);

let history;
const deadline = Date.now() + runTimeoutMs;
while (Date.now() < deadline) {
  history = await call("chat.history", { sessionKey, limit: 80 });
  if (assistantTexts(history).some((text) => text.includes(marker))) {
    break;
  }
  await sleep(1_000);
}
assert.ok(history, "chat.history did not return");
await saveJson("history.json", history);
assert.ok(
  assistantTexts(history).some((text) => text.includes(marker)),
  "native Worker response did not complete",
);

let after = await call("vlab.workers.status");
const completionDeadline = Date.now() + 60_000;
while (
  after.integration.nativeHarnessStats.completed - completedBefore < 1 &&
  Date.now() < completionDeadline
) {
  await sleep(500);
  after = await call("vlab.workers.status");
}
await saveJson("status-after.json", after);
const parityAfter = after.integration.nativeHarnessEventParity;
const partialRepliesAfter = parityAfter.eventsByCallback?.onPartialReply ?? 0;

assert.ok(
  after.integration.nativeHarnessStats.completed - completedBefore >= 1,
);
assert.ok(
  partialRepliesAfter - partialRepliesBefore >= 1,
  "real native Harness did not relay onPartialReply through Worker IPC",
);
assert.ok(parityAfter.observedCallbacks.includes("onPartialReply"));
assert.ok(parityAfter.bridgedCallbacks.includes("onPartialReply"));
assert.deepEqual(parityAfter.unclassifiedCallbacks, []);
assert.deepEqual(parityAfter.unclassifiedOptions, []);
assert.equal(parityAfter.eventRelayFailures, 0);
assert.equal(after.integration.productionPromotionBlocked, false);
assert.equal(systemdNumber("NRestarts"), restartsBefore);

const summary = {
  ok: true,
  version: after.integration.workerIsolationVersion,
  contractVersion: parityAfter.contractVersion,
  entry: "chat.send -> native AgentHarness -> Worker IPC -> Gateway callback",
  channelAcceptance: deliver ? "feishu-visible" : "webchat-internal",
  sessionKey,
  runId,
  partialReplyEventsRelayed:
    partialRepliesAfter - partialRepliesBefore,
  totalEventsRelayed:
    parityAfter.eventsRelayed - parityBefore.eventsRelayed,
  eventsByCallback: parityAfter.eventsByCallback,
  unclassifiedCallbacks: parityAfter.unclassifiedCallbacks,
  unclassifiedOptions: parityAfter.unclassifiedOptions,
  eventRelayFailures: parityAfter.eventRelayFailures,
  productionPromotionBlocked:
    after.integration.productionPromotionBlocked,
  gatewayRestarted: false,
  reportDir,
};
await saveJson("summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
