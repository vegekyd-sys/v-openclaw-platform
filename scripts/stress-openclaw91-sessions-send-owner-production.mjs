import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

assert.equal(os.hostname(), "VM-8-2-ubuntu");
assert.equal(process.getuid(), 0);

const state = "/home/openclaw/.openclaw";
const core = "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core";
const unit = "openclaw-gateway.service";
const outputDirectory = `${state}/backups/sessions-send-owner-91-20260913-v2`;
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", timeout: 30_000 }).trim();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const gatewayPid = Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"]));
assert(gatewayPid > 1);
assert.equal(
  run("sha256sum", [`${core}/dist/sessions-spawn-tool-1FQMTkIo.js`]).split(" ")[0],
  "52b6ea5448e758f6d764200d946853be80a0fe5b419629801ee761173741d848",
);

const env = Object.fromEntries(
  fs.readFileSync(`/proc/${gatewayPid}/environ`, "utf8").split("\0").filter(Boolean).map((entry) => {
    const index = entry.indexOf("=");
    return [entry.slice(0, index), entry.slice(index + 1)];
  }),
);
Object.assign(process.env, env);
const configPath = env.OPENCLAW_CONFIG_PATH ?? `${state}/openclaw.json`;
const config = JSON.parse(fs.readFileSync(configPath));
const configSha = hash(fs.readFileSync(configPath));
const token = config.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => {
  assert(env[key]);
  return env[key];
});
const cgroup = `/sys/fs/cgroup/system.slice/${unit}`;
const counters = (file) => Object.fromEntries(fs.readFileSync(file, "utf8").trim().split("\n").map((line) => {
  const [key, value] = line.split(/\s+/);
  return [key, Number(value)];
}));
const resources = () => ({
  at: Date.now(),
  memoryCurrent: Number(fs.readFileSync(`${cgroup}/memory.current`, "utf8")),
  memoryEvents: counters(`${cgroup}/memory.events`),
  cpu: counters(`${cgroup}/cpu.stat`),
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const blocks = (message) => Array.isArray(message?.content) ? message.content : [];
const text = (message) => typeof message?.content === "string"
  ? message.content
  : blocks(message).filter((block) => block?.type === "text").map((block) => block.text).join("\n");
const stamp = Date.now();
const output = `${outputDirectory}/stress-c15-${stamp}.json`;
const targetKey = `agent:makaron:feishu:direct:prod-c15-target-${stamp}`;
const targetMarker = `PROD_C15_SEND_${randomUUID().replaceAll("-", "")}`;
const jobs = Array.from({ length: 15 }, (_, index) => ({
  index,
  runId: `PROD_C15_${stamp}_${index}`,
  sessionKey: `agent:makaron:feishu:group:prod-c15-${stamp}-${index}`,
  expected: `PROD_C15_REPLY_${index}_${randomUUID().replaceAll("-", "")}`,
}));
const report = {
  version: "sessions-send-owner.production-c15.1",
  startedAt: new Date().toISOString(),
  gatewayPid,
  configSha,
  count: jobs.length,
  sessionsSendJob: 0,
  targetKey,
  targetMarker,
  jobs,
  samples: [],
  completed: false,
};
const persist = () => fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
persist();

const { GatewayClient } = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
let client;
const tracked = new Map(jobs.map((job) => [job.runId, job]));
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
    onEvent: (event) => {
      const payload = event.payload;
      const job = tracked.get(payload?.runId);
      if (!job || !job.startedAt) return;
      const elapsed = Date.now() - job.startedAt;
      if (event.event === "agent" && payload.stream === "assistant" && payload.data?.text?.trim()) {
        job.firstTextMs ??= elapsed;
      }
      if (event.event === "chat" && payload.state === "final") job.finalMs = elapsed;
      if (event.event === "chat" && ["error", "aborted"].includes(payload.state)) job.error = payload.state;
    },
  });
  client.start();
});
const call = (method, params = {}, timeoutMs = 45_000) => client.request(method, params, { timeoutMs });
const status = async () => {
  const value = await call("vlab.workers.status");
  return {
    pending: value.pending,
    active: value.workers.reduce((count, worker) => count + worker.activeCount, 0),
    queued: value.workers.reduce((count, worker) => count + (worker.queued ?? 0), 0),
    detached: value.workers.reduce((count, worker) => count + (worker.detachedTaskCount ?? 0), 0),
    workers: value.workers.map((worker) => ({
      slot: worker.slot,
      ready: worker.ready,
      active: worker.activeCount,
      queued: worker.queued,
    })),
  };
};

async function waitForOwnFinal(job) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (job.error) throw new Error(`Run ${job.index} ended as ${job.error}`);
    if (Number.isFinite(job.firstTextMs) && Number.isFinite(job.finalMs)) break;
    await sleep(100);
  }
  assert(Number.isFinite(job.firstTextMs), `Run ${job.index} has no first text`);
  assert(Number.isFinite(job.finalMs), `Run ${job.index} has no final event`);
  const history = await call("chat.history", { agentId: "makaron", sessionKey: job.sessionKey, limit: 80 });
  const userIndex = history.messages.findLastIndex((message) => message.role === "user" && message.idempotencyKey === `${job.runId}:user`);
  assert(userIndex >= 0, `Run ${job.index} user turn is missing`);
  const turn = history.messages.slice(userIndex + 1);
  const last = turn.filter((message) => message.role === "assistant").at(-1);
  assert(last && last.stopReason !== "error", `Run ${job.index} assistant final is invalid`);
  assert.equal(history.sessionInfo?.agentRuntime?.id, "vlab-worker");
  job.model = last.model;
  job.finalTextSha = hash(text(last));
  if (job.index === 0) {
    const toolCall = turn.flatMap((message) => blocks(message)).filter((block) =>
      block?.type === "toolCall" && block.name === "sessions_send").at(-1);
    assert(toolCall, "Concurrent sessions_send call is missing");
    const toolResult = turn.find((message) => message.role === "toolResult" && message.toolCallId === toolCall.id);
    assert(toolResult && toolResult.isError !== true, `Concurrent sessions_send failed: ${text(toolResult)}`);
    assert(!text(toolResult).includes("Multiple agents are configured"));
    job.sessionsSendStatus = text(toolResult);
  } else {
    assert(text(last).includes(job.expected), `Run ${job.index} did not return its marker`);
  }
  job.verified = true;
  persist();
}

async function waitForTarget() {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const history = await call("chat.history", { agentId: "makaron", sessionKey: targetKey, limit: 80 });
    if (history.sessionInfo?.hasActiveRun === false && history.messages.some((message) =>
      message.role === "assistant" && text(message).includes(targetMarker))) return history;
    await sleep(500);
  }
  assert.fail("Concurrent sessions_send target did not process its marker");
}

let sampling = false;
let sampler;
try {
  report.before = await status();
  assert.equal(report.before.pending, 0);
  assert(report.before.workers.every((worker) => worker.ready));
  for (const key of [targetKey, ...jobs.map((job) => job.sessionKey)]) {
    await call("sessions.patch", { key, agentId: "makaron", model: "deepseek/deepseek-v4-pro" });
    await call("sessions.messages.subscribe", { key, agentId: "makaron" });
  }
  report.resourceBefore = resources();
  report.batchStartedAt = Date.now();
  sampling = true;
  sampler = (async () => {
    while (sampling) {
      const sample = { at: Date.now(), resources: resources() };
      try {
        sample.status = await status();
      } catch {
        sample.statusUnavailable = true;
      }
      report.samples.push(sample);
      persist();
      await sleep(500);
    }
  })();

  const outcomes = await Promise.allSettled(jobs.map(async (job) => {
    job.startedAt = Date.now();
    const message = job.index === 0
      ? `只调用一次 sessions_send，sessionKey 必须精确使用 ${targetKey}，message 必须精确使用 ${targetMarker}。不要调用其他工具，不要向飞书发送外部消息。工具成功后只回复 PROD_C15_SEND_OK。`
      : `这是 15 Session 并发验收。不要调用工具，只回复 ${job.expected}`;
    const response = await call("chat.send", {
      agentId: "makaron",
      sessionKey: job.sessionKey,
      message,
      thinking: "low",
      deliver: false,
      idempotencyKey: job.runId,
      timeoutMs: 240_000,
    }, 60_000);
    job.ackMs = Date.now() - job.startedAt;
    job.ackRunId = response.runId;
    assert.equal(response.runId, job.runId);
    await waitForOwnFinal(job);
  }));
  assert(outcomes.every((outcome) => outcome.status === "fulfilled"), `Concurrent cohort failed: ${outcomes.map((outcome) => outcome.status === "rejected" ? String(outcome.reason) : "ok").join(" | ")}`);
  const targetHistory = await waitForTarget();
  report.targetReceived = targetHistory.messages.some((message) => text(message).includes(targetMarker));
  sampling = false;
  await sampler;
  report.after = await status();
  report.resourceAfter = resources();
  report.maxObservedActive = Math.max(...report.samples.map((sample) => sample.status?.active ?? 0));
  report.firstTextMs = jobs.map((job) => job.firstTextMs).sort((a, b) => a - b);
  report.latency = {
    min: report.firstTextMs[0],
    median: report.firstTextMs[Math.floor(report.firstTextMs.length / 2)],
    p95: report.firstTextMs[Math.ceil(report.firstTextMs.length * 0.95) - 1],
    max: report.firstTextMs.at(-1),
  };
  assert(report.maxObservedActive >= 15, `Only observed ${report.maxObservedActive} active sessions`);
  assert.equal(report.resourceAfter.memoryEvents.oom_kill, report.resourceBefore.memoryEvents.oom_kill);
  assert.equal(hash(fs.readFileSync(configPath)), configSha, "Production config changed during stress run");
  const journal = run("journalctl", ["-u", unit, "--since", new Date(stamp - 1_000).toISOString(), "--no-pager", "-o", "cat"]);
  assert(!journal.includes("Multiple agents are configured, but feishu account default routing has no explicit owner"));
  report.defaultOwnerErrorAbsent = true;
  report.completed = true;
} catch (error) {
  report.error = String(error?.stack ?? error).slice(0, 2400);
  throw error;
} finally {
  sampling = false;
  if (sampler) await sampler;
  report.finishedAt = new Date().toISOString();
  persist();
  for (const job of jobs.filter((entry) => !entry.verified)) {
    await call("chat.abort", { sessionKey: job.sessionKey, runId: job.runId }).catch(() => {});
  }
  client?.stop();
}

process.stdout.write(`${JSON.stringify({
  output,
  completed: report.completed,
  count: report.count,
  maxObservedActive: report.maxObservedActive,
  latency: report.latency,
  targetReceived: report.targetReceived,
  defaultOwnerErrorAbsent: report.defaultOwnerErrorAbsent,
})}\n`);
process.exit(0);
