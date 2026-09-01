#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [mode, target, backup] = process.argv.slice(2);
if (!mode || !target || !backup || !["apply", "restore"].includes(mode)) {
  throw new Error("Usage: instrument-openclaw-2026.8.1-shutdown-steps.mjs <apply|restore> <target> <backup>");
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

const needle = `async function runGatewayShutdownSteps(params) {\n\tfor (const step of params.steps) try {\n\t\tawait step.run();`;
const replacement = `async function runGatewayShutdownSteps(params) {\n\tfor (const step of params.steps) try {\n\t\tconsole.info(\`[acceptance-shutdown-trace] outer start \${step.name}\`);\n\t\tawait step.run();\n\t\tconsole.info(\`[acceptance-shutdown-trace] outer done \${step.name}\`);`;
if (!source.includes(needle)) throw new Error("Shutdown step instrumentation anchor missing");
fs.writeFileSync(target, source.replace(needle, replacement));
process.stdout.write(`${JSON.stringify({ ok: true, mode, target, backup })}\n`);
