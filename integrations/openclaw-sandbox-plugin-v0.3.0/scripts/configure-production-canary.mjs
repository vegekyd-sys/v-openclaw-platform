#!/usr/bin/env node
import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

const [configPath, projectId, projectPath, agentId, sessionKey] = process.argv.slice(2);
if (!configPath || !projectId || !projectPath || !agentId || !sessionKey) {
  throw new Error("usage: configure-production-canary.mjs CONFIG PROJECT_ID PROJECT_PATH AGENT_ID SESSION_KEY");
}
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(projectId)) {
  throw new Error("projectId must be lower-case letters, numbers, and hyphens");
}
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(agentId)) {
  throw new Error("agentId must be lower-case letters, numbers, and hyphens");
}
if (!sessionKey.startsWith(`agent:${agentId}:`)) {
  throw new Error("sessionKey must belong to the configured Agent");
}

const original = await readFile(configPath);
const originalStat = await stat(configPath);
const config = JSON.parse(original.toString("utf8"));
config.plugins ??= {};
config.plugins.allow = unique([...(config.plugins.allow ?? []), "project-sandbox"]);
config.plugins.entries ??= {};
const previous = config.plugins.entries["project-sandbox"] ?? {};
const previousConfig = previous.config ?? {};
config.plugins.entries["project-sandbox"] = {
  ...previous,
  enabled: true,
  config: {
    ...previousConfig,
    allowedAgentIds: [agentId],
    allowedSessionKeys: [sessionKey],
    allowedSessionPrefixes: [],
    // VCodex keeps its normal runtime and native tools. The routing Skill lets
    // it choose Project Sandbox only for approved project execution.
    blockedAgentIds: [],
    socketPath: "/home/openclaw/.openclaw/experiments/project-sandbox-v0.3.1/state/broker.sock",
    openWaitMs: 45000,
    projects: {
      [projectId]: {
        path: projectPath,
        description: "Production VCodex canary project",
        cpu: "2",
        memory: "4Gi",
        networkProfile: "packages",
        leaseSeconds: 3600,
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
  if (!current.equals(original)) throw new Error(`configuration changed concurrently: ${configPath}`);
  await rename(temp, configPath);
} catch (error) {
  await rm(temp, { force: true });
  throw error;
}

function unique(values) {
  return [...new Set(values)];
}
