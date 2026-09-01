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
const sessionKey = `agent:makaron:explicit:openclaw81-browser-${timestamp}`;
const runId = `openclaw81-browser-${timestamp}`;
const marker = `OPENCLAW81_BROWSER_OK_${timestamp.toUpperCase()}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const textContent = (message) =>
  Array.isArray(message?.content)
    ? message.content
        .filter((block) => block?.type === "text")
        .map((block) => block.text)
        .join("\n")
    : String(message?.content ?? "");

const { callGatewayFromCli } = await import(pathToFileURL(runtimePath).href);
const call = async (method, params = {}) =>
  await callGatewayFromCli(
    method,
    { timeout: "240000", json: true },
    params,
  );

await call("chat.send", {
  sessionKey,
  agentId: "makaron",
  message:
    "必须直接调用 OpenClaw 原生 browser 工具，action=status，profile=vbrowser-01。" +
    `禁止用 exec、CLI 或 HTTP 代替；成功后只回复 ${marker}。`,
  deliver: false,
  timeoutMs: 180_000,
  idempotencyKey: runId,
});

let history;
for (let attempt = 0; attempt < 600; attempt += 1) {
  try {
    history = await call("chat.history", { sessionKey, limit: 60 });
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
  const toolResults = history.messages.filter(
    (message) =>
      message.role === "toolResult" && message.toolName === "browser",
  );
  const assistantText = history.messages
    .filter((message) => message.role === "assistant")
    .map(textContent)
    .join("\n");
  if (toolResults.some((message) => message.isError === true)) break;
  if (toolResults.length > 0 && assistantText.includes(marker)) break;
  await sleep(500);
}

assert.ok(history, "browser smoke history was unavailable");
const toolResults = history.messages.filter(
  (message) =>
    message.role === "toolResult" && message.toolName === "browser",
);
assert.ok(toolResults.length > 0, "model did not call the browser tool");
assert.equal(
  toolResults.some((message) => message.isError === true),
  false,
  "browser status returned a tool error",
);
assert.ok(
  history.messages
    .filter((message) => message.role === "assistant")
    .map(textContent)
    .join("\n")
    .includes(marker),
  "browser success marker was not returned",
);

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    sessionKey,
    marker,
    browserToolResults: toolResults.length,
  })}\n`,
);
