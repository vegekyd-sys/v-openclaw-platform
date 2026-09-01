#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DISABLED_STALE_PLUGINS = [
  "landing-chat",
  "openclaw-qqbot",
  "openclaw-weixin",
  "slack",
];

function fail(message) {
  throw new Error(message);
}

export function prepareOpenClaw2026081PluginPolicy(input) {
  const config = structuredClone(input);
  config.plugins ??= {};
  config.plugins.entries ??= {};

  for (const pluginId of DISABLED_STALE_PLUGINS) {
    const existing = config.plugins.entries[pluginId];
    config.plugins.entries[pluginId] = {
      ...(existing && typeof existing === "object" ? existing : {}),
      enabled: false,
    };
  }

  const wecom = config.plugins.entries["wecom-openclaw-plugin"];
  if (wecom && typeof wecom === "object" && wecom.enabled !== false) {
    wecom.hooks = {
      ...(wecom.hooks && typeof wecom.hooks === "object" ? wecom.hooks : {}),
      allowConversationAccess: true,
    };
  }

  return config;
}

function parseArgs(argv) {
  const args = { inputs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--input") args.inputs.push(argv[++index]);
    else fail(`Unknown argument: ${argv[index]}`);
  }
  if (args.inputs.length === 0) fail("At least one --input is required");
  return args;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const inputPath of options.inputs) {
    const resolved = path.resolve(inputPath);
    const config = JSON.parse(fs.readFileSync(resolved, "utf8"));
    const prepared = prepareOpenClaw2026081PluginPolicy(config);
    const temporary = `${resolved}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, `${JSON.stringify(prepared, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, resolved);
    process.stdout.write(`${resolved}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
