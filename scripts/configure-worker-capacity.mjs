#!/usr/bin/env node

import { readFileSync, renameSync, statSync, writeFileSync, chownSync, chmodSync } from "node:fs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));
const gatewayConfig = args.get("--gateway-config");
const workerConfig = args.get("--worker-config");
const maxWorkers = integer(args.get("--max-workers"), "max-workers");
const sessionsPerWorker = integer(args.get("--sessions-per-worker") ?? "3", "sessions-per-worker");
const maxConcurrent = integer(args.get("--max-concurrent"), "max-concurrent");
const subagentsMaxConcurrent = integer(args.get("--subagents-max-concurrent"), "subagents-max-concurrent");
const dryRun = args.has("--dry-run");

if (!gatewayConfig || !workerConfig) {
  throw new Error("Usage: configure-worker-capacity.mjs --gateway-config=/path --worker-config=/path --max-workers=15 --sessions-per-worker=3 --max-concurrent=45 --subagents-max-concurrent=45 [--dry-run]");
}
const capacity = maxWorkers * sessionsPerWorker;
if (maxConcurrent > capacity || subagentsMaxConcurrent > capacity) {
  throw new Error(`Configured concurrency cannot exceed Worker capacity ${capacity}`);
}

const results = [gatewayConfig, workerConfig].map((path) => updateConfig(path));
process.stdout.write(`${JSON.stringify({
  capacity,
  dryRun,
  maxConcurrent,
  maxWorkers,
  results,
  sessionsPerWorker,
  subagentsMaxConcurrent,
})}\n`);

function updateConfig(path) {
  const info = statSync(path);
  const config = JSON.parse(readFileSync(path, "utf8"));
  const worker = config.plugins?.entries?.["vlab-agent-worker-isolation"];
  if (!worker?.enabled || !worker.config) throw new Error(`Enabled Worker plugin config missing in ${path}`);
  config.plugins.entries.workboard ??= {};
  config.plugins.entries.workboard.enabled = true;

  config.agents ??= {};
  config.agents.defaults ??= {};
  config.agents.defaults.subagents ??= {};
  config.agents.defaults.maxConcurrent = maxConcurrent;
  config.agents.defaults.subagents.maxConcurrent = subagentsMaxConcurrent;
  worker.config.maxWorkers = maxWorkers;
  worker.config.sessionsPerWorker = sessionsPerWorker;

  if (!dryRun) {
    const temporary = `${path}.capacity-next`;
    writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: info.mode & 0o777 });
    chownSync(temporary, info.uid, info.gid);
    chmodSync(temporary, info.mode & 0o777);
    renameSync(temporary, path);
  }
  return { path, changed: true };
}

function integer(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`${name} must be an integer between 1 and 100`);
  }
  return parsed;
}
