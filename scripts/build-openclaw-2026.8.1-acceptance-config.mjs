#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") options.input = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--worker-input") options.workerInput = argv[++index];
    else if (arg === "--worker-output") options.workerOutput = argv[++index];
    else if (arg === "--port") options.port = Number(argv[++index]);
    else fail(`Unknown argument: ${arg}`);
  }
  if (!options.input || !options.output || !options.workerInput || !options.workerOutput) {
    fail("Usage: --input <gateway.json> --output <acceptance.json> --worker-input <worker.json> --worker-output <acceptance-worker.json> --port <port>");
  }
  options.port ??= 29379;
  if (!Number.isSafeInteger(options.port) || options.port < 1024 || options.port > 65535) {
    fail("--port must be a non-privileged TCP port");
  }
  return options;
}

function readConfig(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(`Config is not an object: ${filePath}`);
  return parsed;
}

function isolateInbound(config, port) {
  const isolated = structuredClone(config);
  isolated.channels = {};
  isolated.gateway ??= {};
  isolated.gateway.port = port;
  isolated.gateway.mode = "local";
  isolated.gateway.bind = "loopback";
  isolated.gateway.tailscale = { mode: "off" };
  if (isolated.hooks && typeof isolated.hooks === "object") isolated.hooks.enabled = false;
  return isolated;
}

function writePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, filePath);
  fs.chmodSync(filePath, 0o600);
}

const options = parseArgs(process.argv.slice(2));
const gateway = isolateInbound(readConfig(options.input), options.port);
const worker = isolateInbound(readConfig(options.workerInput), options.port + 1);
const workerPlugin = gateway.plugins?.entries?.["vlab-agent-worker-isolation"];
if (!workerPlugin?.enabled || !workerPlugin.config) fail("Worker isolation plugin is not enabled in the Gateway config");
workerPlugin.config.workerConfigPath = path.resolve(options.workerOutput);
workerPlugin.config.gatewayConfigPath = path.resolve(options.output);
writePrivateJson(options.workerOutput, worker);
writePrivateJson(options.output, gateway);
process.stdout.write(`${JSON.stringify({
  gatewayConfig: path.resolve(options.output),
  gatewayPort: options.port,
  inboundChannels: 0,
  workerConfig: path.resolve(options.workerOutput),
}, null, 2)}\n`);
