import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const runtimePath =
  process.env.VLAB_OPENCLAW_GATEWAY_RUNTIME ??
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js";
const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z")
  .toLowerCase();
const agentId = process.env.VLAB_CODEX_AGENT_ID ?? "vlab-sandbox-codex";
const sessionKey = `agent:${agentId}:explicit:openclaw81-codex-${timestamp}`;
const runId = `openclaw81-codex-${timestamp}`;
const marker = `OPENCLAW81_CODEX_RUNTIME_OK_${timestamp.toUpperCase()}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageText(message) {
  if (typeof message?.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message?.content)) {
    return "";
  }
  return message.content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("\n");
}

const { callGatewayFromCli } = await import(pathToFileURL(runtimePath).href);
const call = async (method, params = {}) =>
  await callGatewayFromCli(
    method,
    { timeout: "240000", json: true },
    params,
  );

const sent = await call("chat.send", {
  sessionKey,
  agentId,
  message:
    `这是 OpenClaw 8.1 Codex runtime 验收。不要调用工具，只回复精确文本 ${marker}`,
  deliver: false,
  timeoutMs: 180_000,
  idempotencyKey: runId,
});
assert.equal(sent.runId, runId);

let history;
for (let attempt = 0; attempt < 180; attempt += 1) {
  try {
    history = await call("chat.history", { sessionKey, limit: 40 });
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
  if (
    history.messages
      .filter((message) => message.role === "assistant")
      .map(messageText)
      .join("\n")
      .includes(marker)
  ) {
    break;
  }
  await sleep(1_000);
}
assert.ok(history, "Codex runtime history was unavailable");
const assistantText = history.messages
  .filter((message) => message.role === "assistant")
  .map(messageText)
  .join("\n");
assert.match(assistantText, new RegExp(marker));
assert.equal(history.sessionInfo?.agentRuntime?.id, "codex");
assert.equal(
  history.messages.some(
    (message) => message.role === "toolResult" && message.isError === true,
  ),
  false,
);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      agentId,
      sessionKey,
      agentRuntime: history.sessionInfo.agentRuntime,
      modelProvider: history.sessionInfo.modelProvider,
      model: history.sessionInfo.model,
      marker,
    },
    null,
    2,
  )}\n`,
);
