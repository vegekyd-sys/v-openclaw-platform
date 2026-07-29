import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { pathToFileURL } from "node:url";

const labRoot = process.env.LAB_ROOT ?? "/srv/vlab";
const stateRoot =
  process.env.OPENCLAW_STATE_DIR ?? `${labRoot}/state`;
const bootstrapGatewayConfigPath =
  process.env.OPENCLAW_CONFIG_PATH ?? `${stateRoot}/openclaw.json`;
const bootstrapConfig = JSON.parse(
  readFileSync(bootstrapGatewayConfigPath, "utf8"),
);
const configuredMakaronWorkspace = bootstrapConfig.agents?.list?.find(
  (agent) => agent.id === "makaron",
)?.workspace;
const workspaceDir =
  process.env.VLAB_WORKSHOP_WORKSPACE ??
  configuredMakaronWorkspace ??
  `${labRoot}/workspace`;
const runtimePath =
  process.env.VLAB_OPENCLAW_GATEWAY_RUNTIME ??
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js";
const nodePath = process.env.VLAB_NODE ?? "/opt/vlab/node/bin/node";
const openClawPath =
  process.env.VLAB_OPENCLAW ??
  "/opt/vlab/current/node_modules/openclaw/openclaw.mjs";
const timeoutMs = 240_000;
const timestamp = new Date()
  .toISOString()
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replace(/\.\d{3}Z$/, "Z");
const token = timestamp.toLowerCase();
const skillName = `vlab-worker-config-smoke-${token}`;
const sessionKey = `agent:makaron:explicit:${skillName}`;
const runId = skillName;
const targetRoot =
  process.env.VLAB_WORKSHOP_TARGET_ROOT ??
  bootstrapConfig.skills?.load?.allowSymlinkTargets?.[0] ??
  `${labRoot}/.agents/skills`;
const targetSkillDir = `${targetRoot}/${skillName}`;
const targetSkillFile = `${targetSkillDir}/SKILL.md`;
const workspaceSkillDir = `${workspaceDir}/skills/${skillName}`;
const workspaceSkillFile = `${workspaceSkillDir}/SKILL.md`;
const draftDir = `${workspaceDir}/.openclaw/vlab-worker-smoke`;
const draftPath = `${draftDir}/${skillName}.md`;
const marker = `VLAB_WORKSHOP_APPLIED_${timestamp}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRawConfig(response) {
  if (typeof response.raw === "string") {
    return JSON.parse(response.raw);
  }
  const config = response.raw ?? response.config ?? response.parsed;
  assert.equal(typeof config, "object");
  assert.notEqual(config, null);
  return config;
}

function runGatewayConfigCommand(args, gatewayConfigPath) {
  return execFileSync(nodePath, [openClawPath, "config", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: labRoot,
      OPENCLAW_HOME: labRoot,
      OPENCLAW_STATE_DIR: stateRoot,
      OPENCLAW_CONFIG_PATH: gatewayConfigPath,
      OPENCLAW_WORKSPACE_DIR: workspaceDir,
    },
  });
}

function restoreConfigValue(gatewayConfigPath, key, value) {
  if (value === undefined) {
    runGatewayConfigCommand(["unset", key], gatewayConfigPath);
    return;
  }
  runGatewayConfigCommand(
    ["set", key, JSON.stringify(value), "--strict-json"],
    gatewayConfigPath,
  );
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
assert.equal(statusBefore.integration.workerIsolationVersion, "0.1.5-p1");
assert.equal(
  statusBefore.integration.configDomainIsolation.execUsesGatewayConfig,
  true,
);
const gatewayConfigPath =
  statusBefore.integration.configDomainIsolation.workerExecConfigPath;
const workerConfigPath =
  statusBefore.integration.configDomainIsolation.workerRuntimeConfigPath;
const gatewayBefore = parseRawConfig(await call("config.get"));
const previousMaxSkillBytes = gatewayBefore.skills?.workshop?.maxSkillBytes;
const previousAllowWrites =
  gatewayBefore.skills?.workshop?.allowSymlinkTargetWrites;
const previousAllowedTargets =
  gatewayBefore.skills?.load?.allowSymlinkTargets;
const probeAllowedTargets = [
  ...(previousAllowedTargets ?? []),
  targetRoot,
].filter((value, index, values) => values.indexOf(value) === index);
const workerBeforeRaw = await readFile(workerConfigPath, "utf8");
let targetCreated = false;
let linkCreated = false;
let draftCreated = false;

try {
  await mkdir(targetRoot, { recursive: true });
  await mkdir(targetSkillDir, { recursive: false });
  targetCreated = true;
  await writeFile(
    targetSkillFile,
    [
      "---",
      `name: ${skillName}`,
      "description: Temporary vLab worker config-domain smoke skill.",
      "---",
      "",
      "# Baseline",
      "",
      "This disposable skill exists only for the Workshop symlink smoke.",
      "",
    ].join("\n"),
    "utf8",
  );
  await symlink(targetSkillDir, workspaceSkillDir, "dir");
  linkCreated = true;
  await mkdir(draftDir, { recursive: true });
  await writeFile(
    draftPath,
    [
      "# Applied through Worker",
      "",
      `Marker: ${marker}`,
      "",
      "This content proves Workshop apply used the Gateway config domain.",
      "",
    ].join("\n"),
    "utf8",
  );
  draftCreated = true;

  const allowedTargetsJson = JSON.stringify(probeAllowedTargets);
  const command = [
    `${nodePath} ${openClawPath} config set skills.workshop.maxSkillBytes 100000 --strict-json`,
    `${nodePath} ${openClawPath} config set skills.workshop.allowSymlinkTargetWrites true --strict-json`,
    `${nodePath} ${openClawPath} config set skills.load.allowSymlinkTargets '${allowedTargetsJson}' --strict-json`,
    `proposal_json="$(${nodePath} ${openClawPath} skills workshop propose-update ${skillName} --proposal ${draftPath} --description 'vLab worker config-domain symlink smoke' --json)"`,
    `proposal_id="$(/usr/bin/printf '%s' "$proposal_json" | /usr/bin/jq -r '.record.id')"`,
    `${nodePath} ${openClawPath} skills workshop apply "$proposal_id" --json`,
    `/usr/bin/printf 'VLAB_WORKSHOP_SYMLINK_OK proposal=%s\\n' "$proposal_id"`,
  ].join(" && ");
  const message =
    "这是 vLab Workshop 配置域验收。必须使用 exec 原样执行下面命令一次：\n" +
    `${command}\n` +
    "如果 exec 返回 Command still running，必须使用 process poll 对返回的 " +
    "session 持续轮询，直到命令退出并拿到最终输出。然后只回复 " +
    "VLAB_WORKSHOP_SYMLINK_OK。不要执行其他操作。";

  const sent = await call("chat.send", {
    sessionKey,
    agentId: "makaron",
    message,
    deliver: false,
    timeoutMs,
    idempotencyKey: runId,
  });
  assert.equal(sent.runId, runId);

  const waited = await call("agent.wait", {
    runId,
    timeoutMs: timeoutMs - 10_000,
  });
  assert.ok(
    waited.status === "ok" ||
      waited.status === "succeeded" ||
      (waited.status === "timeout" &&
        waited.timeoutPhase === "gateway_draining"),
    `Worker Workshop symlink smoke did not terminate: ${waited.status}`,
  );

  let history;
  let execOutput = "";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    history = await call("chat.history", {
      sessionKey,
      limit: 40,
    });
    execOutput = history.messages
      .filter(
        (entry) =>
          entry.role === "toolResult" &&
          (entry.toolName === "exec" || entry.toolName === "process"),
      )
      .flatMap((entry) =>
        Array.isArray(entry.content)
          ? entry.content
              .filter((item) => item.type === "text")
              .map((item) => item.text)
          : [],
      )
      .join("\n");
    if (execOutput.length > 0) {
      break;
    }
    await sleep(1_000);
  }
  assert.ok(history);
  assert.match(execOutput, /VLAB_WORKSHOP_SYMLINK_OK proposal=/);

  assert.equal(await realpath(workspaceSkillDir), targetSkillDir);
  assert.match(await readFile(workspaceSkillFile, "utf8"), new RegExp(marker));
  assert.equal(await readFile(workerConfigPath, "utf8"), workerBeforeRaw);
  const gatewayAfter = parseRawConfig(await call("config.get"));
  assert.equal(gatewayAfter.skills?.workshop?.maxSkillBytes, 100_000);
  assert.equal(
    gatewayAfter.skills?.workshop?.allowSymlinkTargetWrites,
    true,
  );
  assert.deepEqual(
    gatewayAfter.skills?.load?.allowSymlinkTargets,
    probeAllowedTargets,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        version: statusBefore.integration.workerIsolationVersion,
        workerExecConfigPath: gatewayConfigPath,
        workerOverlayUnchanged: true,
        workshopProposalApplied: true,
        symlinkTargetUpdated: true,
        marker,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  const current = JSON.parse(await readFile(gatewayConfigPath, "utf8"));
  if (
    current.skills?.workshop?.maxSkillBytes !== previousMaxSkillBytes
  ) {
    restoreConfigValue(
      gatewayConfigPath,
      "skills.workshop.maxSkillBytes",
      previousMaxSkillBytes,
    );
  }
  if (
    current.skills?.workshop?.allowSymlinkTargetWrites !==
    previousAllowWrites
  ) {
    restoreConfigValue(
      gatewayConfigPath,
      "skills.workshop.allowSymlinkTargetWrites",
      previousAllowWrites,
    );
  }
  if (
    JSON.stringify(current.skills?.load?.allowSymlinkTargets) !==
    JSON.stringify(previousAllowedTargets)
  ) {
    restoreConfigValue(
      gatewayConfigPath,
      "skills.load.allowSymlinkTargets",
      previousAllowedTargets,
    );
  }
  if (linkCreated) {
    await rm(workspaceSkillDir, { force: true });
  }
  if (targetCreated) {
    await rm(targetSkillDir, { recursive: true, force: true });
  }
  if (draftCreated) {
    await rm(draftPath, { force: true });
  }
}
