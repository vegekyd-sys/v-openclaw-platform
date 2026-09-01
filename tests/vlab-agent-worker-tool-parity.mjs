import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const reportDir = `${labRoot}/logs/agent-worker-tool-parity-${timestamp}`;
const workshopMutationProposalId =
  process.env.VLAB_WORKSHOP_MUTATION_PROPOSAL_ID?.trim();

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

function textContent(message) {
  if (typeof message?.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message?.content)) {
    return "";
  }
  return message.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function isToolError(message) {
  return message?.isError === true;
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
const call = async (method, params = {}) =>
  await callGatewayFromCli(
    method,
    { timeout: "180000", json: true },
    params,
  );

const baselineRestarts = systemdNumber("NRestarts");
const statusBefore = await call("vlab.workers.status");
await saveJson("status-before.json", statusBefore);
const workshopCallsBefore = statusBefore.workers.reduce(
  (sum, worker) => sum + Number(worker.gatewayOwnedToolProxy?.calls ?? 0),
  0,
);

const probes = [
  {
    name: "read",
    toolName: "read",
    instruction:
      `调用 read 读取 ${labRoot}/workspace/AGENTS.md 的前 5 行；` +
      "完成后只回复 TOOL_PARITY_READ_OK。",
    marker: "TOOL_PARITY_READ_OK",
  },
  {
    name: "exec",
    toolName: "exec",
    instruction:
      "调用 exec 原样执行 /usr/bin/printf TOOL_PARITY_EXEC_OUTPUT；完成后只回复 TOOL_PARITY_EXEC_OK。",
    marker: "TOOL_PARITY_EXEC_OK",
  },
  {
    name: "sessions-list",
    toolName: "sessions_list",
    instruction:
      "调用 sessions_list，limit=1；完成后只回复 TOOL_PARITY_SESSIONS_OK。",
    marker: "TOOL_PARITY_SESSIONS_OK",
  },
  {
    name: "browser-status",
    toolName: "browser",
    instruction:
      "必须直接调用 OpenClaw 原生 browser 工具，action=status。禁止用 exec、CLI 或 HTTP 代替；完成后只回复 TOOL_PARITY_BROWSER_OK。",
    marker: "TOOL_PARITY_BROWSER_OK",
  },
  {
    name: "skill-workshop-list",
    toolName: "skill_workshop",
    instruction:
      "必须直接调用原生 skill_workshop 工具，参数 action=list、query=vlab-tool-parity-no-match、limit=1。禁止用 exec 或 CLI 代替；完成后只回复 TOOL_PARITY_WORKSHOP_OK。",
    marker: "TOOL_PARITY_WORKSHOP_OK",
  },
];
if (workshopMutationProposalId) {
  probes.push({
    name: "skill-workshop-reject",
    toolName: "skill_workshop",
    instruction:
      `必须直接调用原生 skill_workshop 工具，action=reject、proposalId=${workshopMutationProposalId}、reason=VLab isolated tool mutation acceptance。` +
      "禁止用 exec 或 CLI 代替；完成后只回复 TOOL_PARITY_WORKSHOP_REJECT_OK。",
    marker: "TOOL_PARITY_WORKSHOP_REJECT_OK",
  });
}

const results = await Promise.all(probes.map(async (probe) => {
  const sessionKey =
    `agent:makaron:explicit:vlab-worker-tool-parity-${probe.name}-${token}`;
  const runId = `vlab-worker-tool-parity-${probe.name}-${token}`;
  const startedAt = Date.now();
  const sent = await call("chat.send", {
    sessionKey,
    agentId: "makaron",
    message: probe.instruction,
    deliver: false,
    timeoutMs: 120_000,
    idempotencyKey: runId,
  });
  assert.equal(sent.runId, runId);

  let history;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
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
    const toolResults = history.messages.filter(
      (message) =>
        message.role === "toolResult" && message.toolName === probe.toolName,
    );
    const assistantText = history.messages
      .filter((message) => message.role === "assistant")
      .map(textContent)
      .join("\n");
    if (toolResults.length > 0 && assistantText.includes(probe.marker)) {
      break;
    }
    if (toolResults.some(isToolError)) {
      break;
    }
    await sleep(1_000);
  }
  assert.ok(history, `${probe.name}: chat.history did not return`);
  await saveJson(`${probe.name}-history.json`, history);
  const matchingResults = history.messages.filter(
    (message) =>
      message.role === "toolResult" && message.toolName === probe.toolName,
  );
  assert.ok(
    matchingResults.length > 0,
    `${probe.name}: model did not call ${probe.toolName}`,
  );
  assert.equal(
    matchingResults.some(isToolError),
    false,
    `${probe.name}: ${probe.toolName} returned an error`,
  );
  const assistantText = history.messages
    .filter((message) => message.role === "assistant")
    .map(textContent)
    .join("\n");
  assert.match(
    assistantText,
    new RegExp(probe.marker),
    `${probe.name}: final marker was not returned`,
  );
  return {
    name: probe.name,
    toolName: probe.toolName,
    elapsedMs: Date.now() - startedAt,
    toolResultCount: matchingResults.length,
  };
}));
results.sort((left, right) => left.name.localeCompare(right.name));

let statusAfter;
let workshopCallsAfter = workshopCallsBefore;
for (let attempt = 0; attempt < 30; attempt += 1) {
  statusAfter = await call("vlab.workers.status");
  workshopCallsAfter = statusAfter.workers.reduce(
    (sum, worker) => sum + Number(worker.gatewayOwnedToolProxy?.calls ?? 0),
    0,
  );
  if (workshopCallsAfter >= workshopCallsBefore + 1) {
    break;
  }
  // Worker process stats are delivered on the heartbeat, not synchronously
  // with the final tool result.
  await sleep(1_000);
}
const health = await call("health");
await saveJson("status-after.json", statusAfter);
await saveJson("health.json", health);
assert.equal(systemdNumber("NRestarts"), baselineRestarts);
assert.equal(statusAfter.pending, 0);
assert.equal(health.eventLoop?.degraded, false);
assert.ok(
  workshopCallsAfter >= workshopCallsBefore + 1,
  "skill_workshop did not pass through the isolated tool proxy",
);
if (workshopMutationProposalId) {
  const manifest = JSON.parse(
    await readFile(`${labRoot}/state/skill-workshop/proposals.json`, "utf8"),
  );
  const proposal = manifest.proposals.find(
    (candidate) => candidate.id === workshopMutationProposalId,
  );
  assert.equal(proposal?.status, "rejected");
}

const summary = {
  ok: true,
  version: statusAfter.integration.workerIsolationVersion,
  results,
  gatewayRestarted: false,
  ranConcurrently: true,
  isolatedWorkshopCalls: workshopCallsAfter - workshopCallsBefore,
  workshopMutationRejected: Boolean(workshopMutationProposalId),
  eventLoop: health.eventLoop,
  reportDir,
};
await saveJson("summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
