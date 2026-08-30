#!/usr/bin/env node
import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

const [configPath] = process.argv.slice(2);
if (!configPath) throw new Error("usage: configure-vlab-agents.mjs CONFIG");

const original = await readFile(configPath);
const originalStat = await stat(configPath);
const config = JSON.parse(original.toString("utf8"));

config.plugins ??= {};
config.plugins.allow = unique([...(config.plugins.allow ?? []), "codex", "project-sandbox"]);
config.plugins.entries ??= {};
const previousCodex = config.plugins.entries.codex ?? {};
config.plugins.entries.codex = {
  ...previousCodex,
  enabled: true,
  config: {
    ...(previousCodex.config ?? {}),
    codexDynamicToolsLoading: "searchable",
    codexPlugins: { enabled: false },
  },
};

config.agents ??= {};
config.agents.list ??= [];
upsertAgent(config.agents.list, {
  id: "vlab-sandbox-openclaw",
  name: "VLab Sandbox OpenClaw",
  workspace: "/srv/vlab/workspaces/vlab-sandbox-openclaw",
  model: { primary: "deepseek/deepseek-v4-pro", fallbacks: [] },
  models: {
    "deepseek/deepseek-v4-pro": { agentRuntime: { id: "openclaw" } },
  },
  tools: sandboxToolPolicy(),
});
upsertAgent(config.agents.list, {
  id: "vlab-sandbox-codex",
  name: "VLab Sandbox Codex",
  workspace: "/srv/vlab/workspaces/vlab-sandbox-codex",
  model: { primary: "openai/gpt-5.6-sol", fallbacks: [] },
  models: {
    "openai/gpt-5.6-sol": { agentRuntime: { id: "codex" } },
  },
  tools: undefined,
});

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

function upsertAgent(agents, managed) {
  const index = agents.findIndex((agent) => agent?.id === managed.id);
  if (index === -1) agents.push(managed);
  else agents[index] = { ...agents[index], ...managed };
}

function sandboxToolPolicy() {
  return {
    allow: [
      "project_sandbox_open",
      "project_sandbox_files",
      "project_sandbox_exec",
      "project_sandbox_finish",
      "message",
    ],
    deny: ["group:runtime", "group:fs"],
  };
}

function unique(values) {
  return [...new Set(values)];
}
