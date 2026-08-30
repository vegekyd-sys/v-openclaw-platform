#!/usr/bin/env node
import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

const [configPath, projectId, projectPath] = process.argv.slice(2);
if (!configPath || !projectId || !projectPath) {
  throw new Error("usage: configure-vlab.mjs CONFIG PROJECT_ID PROJECT_PATH");
}
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(projectId)) {
  throw new Error("projectId must be lower-case letters, numbers, and hyphens");
}

const original = await readFile(configPath);
const originalStat = await stat(configPath);
const config = JSON.parse(original.toString("utf8"));
config.plugins ??= {};
config.plugins.allow = unique([...(config.plugins.allow ?? []), "project-sandbox"]);
config.plugins.entries ??= {};
const previous = config.plugins.entries["project-sandbox"] ?? {};
const previousConfig = previous.config ?? {};
const protectedAgentIds = String(
  process.env.VLAB_SANDBOX_PROTECTED_AGENT_IDS ?? "vlab-sandbox-openclaw,vlab-sandbox-codex",
).split(",").map((value) => value.trim()).filter(Boolean);
config.plugins.entries["project-sandbox"] = {
  ...previous,
  enabled: true,
  config: {
    ...previousConfig,
    allowedAgentIds: unique([
      ...(previousConfig.allowedAgentIds ?? []),
      ...protectedAgentIds,
    ]),
    allowedSessionPrefixes: unique([
      ...(previousConfig.allowedSessionPrefixes ?? []),
      ...protectedAgentIds.map((agentId) => `agent:${agentId}:`),
    ]),
    blockedAgentIds: unique([
      ...(previousConfig.blockedAgentIds ?? []),
      ...protectedAgentIds,
    ]),
    socketPath: "/srv/vlab/state/sandbox-broker/broker.sock",
    openWaitMs: 45000,
    projects: {
      ...(previousConfig.projects ?? {}),
      [projectId]: {
        path: projectPath,
        description: "VLab approved source-only acceptance project",
        cpu: "1",
        memory: "2Gi",
        networkProfile: "offline",
        leaseSeconds: 900,
      },
    },
  },
};
config.tools ??= {};
config.tools.alsoAllow = unique([
  ...(config.tools.alsoAllow ?? []),
  "project_sandbox_open",
  "project_sandbox_files",
  "project_sandbox_exec",
  "project_sandbox_finish",
]);

const temp = `${configPath}.${process.pid}.tmp`;
try {
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: originalStat.mode & 0o777 });
  await chmod(temp, originalStat.mode & 0o777);
  const current = await readFile(configPath);
  if (!current.equals(original)) {
    throw new Error(`configuration changed concurrently: ${configPath}`);
  }
  await rename(temp, configPath);
} catch (error) {
  await rm(temp, { force: true });
  throw error;
}

function unique(values) {
  return [...new Set(values)];
}
