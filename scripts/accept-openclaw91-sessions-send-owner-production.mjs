import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

assert.equal(os.hostname(), "VM-8-2-ubuntu");
assert.equal(process.getuid(), 0);

const state = "/home/openclaw/.openclaw";
const core = "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core";
const unit = "openclaw-gateway.service";
const outputDirectory = `${state}/backups/sessions-send-owner-91-20260913-v2`;
const run = (command, args) => execFileSync(command, args, {
  encoding: "utf8",
  timeout: 30_000,
}).trim();
const pid = Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"]));
assert(pid > 1);
assert.equal(JSON.parse(fs.readFileSync(`${core}/package.json`)).version, "2026.9.1");
assert.equal(
  run("sha256sum", [`${core}/dist/sessions-spawn-tool-1FQMTkIo.js`]).split(" ")[0],
  "52b6ea5448e758f6d764200d946853be80a0fe5b419629801ee761173741d848",
);

const env = Object.fromEntries(
  fs.readFileSync(`/proc/${pid}/environ`, "utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const index = entry.indexOf("=");
      return [entry.slice(0, index), entry.slice(index + 1)];
    }),
);
Object.assign(process.env, env);
const config = JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH ?? `${state}/openclaw.json`));
const token = config.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => {
  assert(env[key]);
  return env[key];
});
const { GatewayClient } = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
const startedAt = Date.now();
const sourceKey = `agent:makaron:feishu:direct:prod-send-source-${startedAt}`;
const dmTargetKey = `agent:makaron:feishu:direct:prod-send-target-${startedAt}`;
const dmMarker = `PROD_SEND_DM_${randomUUID().replaceAll("-", "")}`;
const childReadyMarker = `PROD_CHILD_READY_${randomUUID().replaceAll("-", "")}`;
const childSendMarker = `PROD_SEND_CHILD_${randomUUID().replaceAll("-", "")}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const blocks = (message) => Array.isArray(message?.content) ? message.content : [];
const text = (message) => typeof message?.content === "string"
  ? message.content
  : blocks(message).filter((block) => block?.type === "text").map((block) => block.text).join("\n");
let client;

async function idle() {
  const deadline = Date.now() + 120_000;
  let status;
  while (Date.now() < deadline) {
    status = await client.request("vlab.workers.status", {});
    if (status.pending === 0 && status.workers.every((worker) =>
      worker.activeCount === 0 && worker.queued === 0 && worker.detachedTaskCount === 0)) return status;
    await sleep(500);
  }
  assert.fail(`Worker did not become idle: ${JSON.stringify(status?.workers)}`);
}

async function history(key) {
  return client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 120 });
}

async function sendTurn(key, message) {
  const response = await client.request("chat.send", {
    agentId: "makaron",
    sessionKey: key,
    message,
    deliver: false,
    thinking: "low",
    timeoutMs: 180_000,
    idempotencyKey: randomUUID(),
  });
  const deadline = Date.now() + 190_000;
  let value;
  while (Date.now() < deadline) {
    value = await history(key);
    const messages = value.messages ?? [];
    const userIndex = messages.findLastIndex((entry) => entry.role === "user" && text(entry) === message);
    if (userIndex >= 0 && value.sessionInfo?.hasActiveRun === false && messages.slice(userIndex + 1).some((entry) =>
      entry.role === "assistant" && entry.stopReason === "stop")) return { response, history: value };
    await sleep(500);
  }
  assert.fail(`Run did not complete for ${key}`);
}

function latestTool(historyValue, name) {
  const messages = historyValue.messages ?? [];
  const call = messages.flatMap((message) => blocks(message))
    .filter((block) => block?.type === "toolCall" && block.name === name).at(-1);
  assert(call, `Missing ${name} call`);
  const result = messages.find((message) => message.role === "toolResult" && message.toolCallId === call.id);
  assert(result, `Missing ${name} result`);
  assert.notEqual(result.isError, true, `${name} returned an error: ${text(result)}`);
  assert(!text(result).includes("Multiple agents are configured"), `${name} hit the default-owner regression`);
  return { call, result, body: text(result) };
}

async function waitForMarker(key, marker) {
  const deadline = Date.now() + 190_000;
  let value;
  while (Date.now() < deadline) {
    value = await history(key);
    if (value.sessionInfo?.hasActiveRun === false && (value.messages ?? []).some((message) =>
      message.role === "assistant" && text(message).includes(marker))) return value;
    await sleep(500);
  }
  assert.fail(`Target did not process ${marker}`);
}

let report;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Gateway connect timeout")), 30_000);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${config.gateway.port}`,
      token,
      deviceIdentity: null,
      clientName: "cli",
      mode: "cli",
      caps: ["tool-events"],
      scopes: ["operator.read", "operator.write", "operator.admin"],
      onHelloOk: () => {
        clearTimeout(timeout);
        resolve();
      },
      onConnectError: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      onEvent() {},
    });
    client.start();
  });
  const initialWorkers = await client.request("vlab.workers.status", {});
  assert.equal(initialWorkers.pending, 0);
  assert(initialWorkers.workers.every((worker) => worker.ready));
  for (const key of [sourceKey, dmTargetKey]) {
    await client.request("sessions.patch", { key, agentId: "makaron", model: "deepseek/deepseek-v4-pro" });
    await client.request("sessions.messages.subscribe", { key, agentId: "makaron" });
  }

  const dmTurn = await sendTurn(
    sourceKey,
    `只调用一次 sessions_send，sessionKey 必须精确使用 ${dmTargetKey}，message 必须精确使用 ${dmMarker}。不要调用其他工具，不要向飞书发送外部消息。工具成功后只回复 DM_SEND_OK。`,
  );
  const dmTool = latestTool(dmTurn.history, "sessions_send");
  const dmTarget = await waitForMarker(dmTargetKey, dmMarker);

  const spawnTurn = await sendTurn(
    sourceKey,
    `只调用一次 sessions_spawn，runtime 使用 subagent，mode 使用 run，cleanup 使用 keep，model 必须精确使用 deepseek/deepseek-v4-pro，task 是“只回复 ${childReadyMarker}”。不要调用其他工具。工具接受后只回复 CHILD_CREATED。`,
  );
  const spawnTool = latestTool(spawnTurn.history, "sessions_spawn");
  const childMatch = spawnTool.body.match(/agent:makaron:subagent:[A-Za-z0-9_-]+/);
  assert(childMatch, `sessions_spawn did not return a child session key: ${spawnTool.body}`);
  const childKey = childMatch[0];
  await waitForMarker(childKey, childReadyMarker);
  await sleep(3_000);

  const childTurn = await sendTurn(
    sourceKey,
    `只调用一次 sessions_send，sessionKey 必须精确使用 ${childKey}，message 必须精确使用 ${childSendMarker}。不要调用其他工具。工具成功后只回复 CHILD_SEND_OK。`,
  );
  const childTool = latestTool(childTurn.history, "sessions_send");
  const childTarget = await waitForMarker(childKey, childSendMarker);
  const finalWorkers = await client.request("vlab.workers.status", {});
  const journal = run("journalctl", ["-u", unit, "--since", new Date(startedAt - 1_000).toISOString(), "--no-pager", "-o", "cat"]);
  assert(!journal.includes("Multiple agents are configured, but feishu account default routing has no explicit owner"));
  report = {
    ok: true,
    pid,
    sourceKey,
    dmTargetKey,
    childKey,
    dmStatus: dmTool.body,
    childStatus: childTool.body,
    dmTargetReceived: (dmTarget.messages ?? []).some((message) => text(message).includes(dmMarker)),
    childTargetReceived: (childTarget.messages ?? []).some((message) => text(message).includes(childSendMarker)),
    defaultOwnerErrorAbsent: true,
    final: {
      pending: finalWorkers.pending,
      active: finalWorkers.workers.reduce((count, worker) => count + worker.activeCount, 0),
      queued: finalWorkers.workers.reduce((count, worker) => count + (worker.queued ?? 0), 0),
    },
    durationMs: Date.now() - startedAt,
  };
} catch (error) {
  report = { ok: false, pid, sourceKey, dmTargetKey, error: String(error?.stack ?? error).slice(0, 1800) };
  throw error;
} finally {
  const output = `${outputDirectory}/acceptance-${startedAt}.json`;
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ output, ...report })}\n`);
  client?.stop();
}
