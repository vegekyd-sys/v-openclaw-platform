#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [mode, target, backup] = process.argv.slice(2);
if (!mode || !target || !backup || !["apply", "restore"].includes(mode)) {
  throw new Error("Usage: instrument-openclaw-2026.8.1-active-work.mjs <apply|restore> <target> <backup>");
}

if (mode === "restore") {
  fs.copyFileSync(backup, target);
  process.stdout.write(`${JSON.stringify({ ok: true, mode, target, backup })}\n`);
  process.exit(0);
}

const source = fs.readFileSync(target, "utf8");
if (!fs.existsSync(backup)) {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
}

const needle = `\t\t\t\t} else try {\n\t\t\t\t\tconst activeWorkDrain = await eagerLifecycleRuntime.waitForGatewayActiveWork`;
const replacement = `\t\t\t\t} else try {\n\t\t\t\t\tgatewayLog$1.info(\`[acceptance-shutdown-trace] active work snapshot: \${JSON.stringify(eagerLifecycleRuntime.createGatewayActiveWorkSnapshot())}\`);\n\t\t\t\t\tconst activeWorkDrain = await eagerLifecycleRuntime.waitForGatewayActiveWork`;
if (!source.includes(needle)) throw new Error("Active-work instrumentation anchor missing");
fs.writeFileSync(target, source.replace(needle, replacement));
process.stdout.write(`${JSON.stringify({ ok: true, mode, target, backup })}\n`);
