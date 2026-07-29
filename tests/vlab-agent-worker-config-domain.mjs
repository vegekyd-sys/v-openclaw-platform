import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const labRoot = process.env.LAB_ROOT ?? "/srv/vlab";
const runtimePath =
  process.env.VLAB_OPENCLAW_GATEWAY_RUNTIME ??
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js";
const nodePath = process.env.VLAB_NODE ?? "/opt/vlab/node/bin/node";
const openClawPath =
  process.env.VLAB_OPENCLAW ??
  "/opt/vlab/current/node_modules/openclaw/openclaw.mjs";
const timeoutMs = 180_000;
const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z");
const token = timestamp.toLowerCase();
const sessionKey = `agent:makaron:explicit:vlab-config-domain-${token}`;
const runId = `vlab-config-domain-${token}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRawConfig(response) {
  assert.equal(typeof response.raw, "string");
  return JSON.parse(response.raw);
}

function runGatewayConfigCommand(args, gatewayConfigPath) {
  return execFileSync(nodePath, [openClawPath, "config", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: labRoot,
      OPENCLAW_HOME: labRoot,
      OPENCLAW_STATE_DIR: `${labRoot}/state`,
      OPENCLAW_CONFIG_PATH: gatewayConfigPath,
      OPENCLAW_WORKSPACE_DIR: `${labRoot}/workspace`,
    },
  });
}

const { callGatewayFromCli } = await import(pathToFileURL(runtimePath).href);
const call = async (method, params = {}) =>
  await callGatewayFromCli(
    method,
    {
      timeout: String(timeoutMs),
      json: true,
    },
    params,
  );

const statusBefore = await call("vlab.workers.status");
assert.equal(statusBefore.integration.workerIsolationVersion, "0.1.2");
assert.equal(
  statusBefore.integration.configDomainIsolation.execUsesGatewayConfig,
  true,
);
const gatewayConfigPath =
  statusBefore.integration.configDomainIsolation.workerExecConfigPath;
const workerConfigPath =
  statusBefore.integration.configDomainIsolation.workerRuntimeConfigPath;
assert.equal(gatewayConfigPath, `${labRoot}/state/openclaw.json`);
assert.notEqual(workerConfigPath, gatewayConfigPath);

const gatewayBeforeResponse = await call("config.get");
assert.equal(gatewayBeforeResponse.path, gatewayConfigPath);
const gatewayBefore = parseRawConfig(gatewayBeforeResponse);
const previousMaxSkillBytes =
  gatewayBefore.skills?.workshop?.maxSkillBytes;
const probeMaxSkillBytes =
  previousMaxSkillBytes === 100_001 ? 100_002 : 100_001;
const workerBeforeRaw = await readFile(workerConfigPath, "utf8");
const completedBefore =
  statusBefore.integration.nativeHarnessStats.completed;
const failedBefore = statusBefore.integration.nativeHarnessStats.failed;

const command =
  `${nodePath} ${openClawPath} config set ` +
  `skills.workshop.maxSkillBytes ${probeMaxSkillBytes} --strict-json && ` +
  `/usr/bin/printf 'OPENCLAW_CONFIG_PATH=%s\\nVLAB_ACTIVE_CONFIG_DOMAIN=%s\\n' ` +
  `"$OPENCLAW_CONFIG_PATH" "$VLAB_ACTIVE_CONFIG_DOMAIN" && ` +
  `${nodePath} ${openClawPath} config get skills.workshop --json`;
const message =
  `这是 vLab Worker 配置域验收。必须使用 exec 原样执行下面命令一次：\n` +
  `${command}\n` +
  `执行后只回复 VLAB_CONFIG_DOMAIN_OK。不要调用其他工具。`;

try {
  const sent = await call("chat.send", {
    sessionKey,
    agentId: "makaron",
    message,
    deliver: false,
    timeoutMs,
    idempotencyKey: runId,
  });
  assert.equal(sent.runId, runId);

  let terminal = false;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const status = await call("vlab.workers.status");
    const completed =
      status.integration.nativeHarnessStats.completed - completedBefore;
    const failed =
      status.integration.nativeHarnessStats.failed - failedBefore;
    if (failed > 0) {
      throw new Error("Worker config-domain probe failed in Agent Harness");
    }
    if (completed > 0) {
      terminal = true;
      break;
    }
    await sleep(1_000);
  }
  assert.equal(terminal, true, "Worker config-domain probe did not complete");

  const history = await call("chat.history", {
    sessionKey,
    limit: 30,
  });
  const execResults = history.messages
    .filter(
      (messageEntry) =>
        messageEntry.role === "toolResult" &&
        messageEntry.toolName === "exec",
    )
    .flatMap((messageEntry) =>
      Array.isArray(messageEntry.content)
        ? messageEntry.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
        : [],
    );
  assert.ok(execResults.length > 0, "Agent did not return an exec tool result");
  const execOutput = execResults.join("\n");
  assert.match(
    execOutput,
    new RegExp(`OPENCLAW_CONFIG_PATH=${gatewayConfigPath}`),
  );
  assert.match(execOutput, /VLAB_ACTIVE_CONFIG_DOMAIN=gateway/);
  assert.match(
    execOutput,
    new RegExp(`"maxSkillBytes"\\s*:\\s*${probeMaxSkillBytes}`),
  );

  const gatewayAfterResponse = await call("config.get");
  assert.equal(gatewayAfterResponse.path, gatewayConfigPath);
  const gatewayAfter = parseRawConfig(gatewayAfterResponse);
  assert.equal(
    gatewayAfter.skills?.workshop?.maxSkillBytes,
    probeMaxSkillBytes,
  );
  assert.equal(await readFile(workerConfigPath, "utf8"), workerBeforeRaw);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        version: statusBefore.integration.workerIsolationVersion,
        workerRuntimeConfigPath: workerConfigPath,
        workerExecConfigPath: gatewayConfigPath,
        gatewayConfigSetObserved: true,
        workerOverlayUnchanged: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  const currentConfig = JSON.parse(await readFile(gatewayConfigPath, "utf8"));
  const currentMaxSkillBytes =
    currentConfig.skills?.workshop?.maxSkillBytes;
  if (currentMaxSkillBytes !== previousMaxSkillBytes) {
    if (previousMaxSkillBytes === undefined) {
      runGatewayConfigCommand(
        ["unset", "skills.workshop.maxSkillBytes"],
        gatewayConfigPath,
      );
    } else {
      runGatewayConfigCommand(
        [
          "set",
          "skills.workshop.maxSkillBytes",
          String(previousMaxSkillBytes),
          "--strict-json",
        ],
        gatewayConfigPath,
      );
    }
  }
}
