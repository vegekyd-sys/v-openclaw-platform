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
const sessionKey = `agent:makaron:explicit:openclaw81-native-compact-${timestamp}`;
const seedRunId = `openclaw81-native-compact-seed-${timestamp}`;
const continueRunId = `openclaw81-native-compact-continue-${timestamp}`;
const exactIdentifier = `oc_native_compact_${timestamp}`;
const finalMarker = `OPENCLAW81_NATIVE_COMPACT_OK_${timestamp.toUpperCase()}`;
const seedBody = "C".repeat(180_000);

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
    { timeout: "900000", json: true },
    params,
  );

await call("chat.send", {
  sessionKey,
  agentId: "makaron",
  message:
    `记住精确标识 ${exactIdentifier}。不要调用工具，只回复 SEED_ACCEPTED。\n` +
    seedBody,
  deliver: false,
  timeoutMs: 600_000,
  idempotencyKey: seedRunId,
});
await call("agent.wait", { runId: seedRunId, timeoutMs: 600_000 });

const before = await call("chat.history", { sessionKey, limit: 20 });
assert.equal(before.sessionInfo?.agentRuntime?.id, "vlab-worker");

const compacted = await call("sessions.compact", {
  key: sessionKey,
  agentId: "makaron",
});
assert.equal(compacted.ok, true);
assert.equal(compacted.compacted, true);
assert.ok(compacted.result?.tokensBefore > compacted.result?.tokensAfter);

await call("chat.send", {
  sessionKey,
  agentId: "makaron",
  message:
    `继续本会话。确认你记得精确标识 ${exactIdentifier}，然后只回复 ${finalMarker}。`,
  deliver: false,
  timeoutMs: 600_000,
  idempotencyKey: continueRunId,
});
await call("agent.wait", { runId: continueRunId, timeoutMs: 600_000 });

let history;
for (let attempt = 0; attempt < 600; attempt += 1) {
  try {
    history = await call("chat.history", { sessionKey, limit: 80 });
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
      .map(textContent)
      .join("\n")
      .includes(finalMarker)
  ) {
    break;
  }
  await sleep(500);
}

assert.ok(history, "post-compaction history was unavailable");
assert.equal(history.sessionInfo?.agentRuntime?.id, "vlab-worker");
assert.ok(
  history.messages
    .filter((message) => message.role === "assistant")
    .map(textContent)
    .join("\n")
    .includes(finalMarker),
  "post-compaction continuation marker was not returned",
);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      runtime: history.sessionInfo.agentRuntime.id,
      compacted: true,
      tokensBefore: compacted.result.tokensBefore,
      tokensAfter: compacted.result.tokensAfter,
      exactIdentifierPreserved: true,
      continuationCompleted: true,
      finalMarker,
    },
    null,
    2,
  )}\n`,
);
