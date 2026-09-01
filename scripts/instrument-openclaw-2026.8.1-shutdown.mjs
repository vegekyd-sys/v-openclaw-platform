#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [mode, target, backup] = process.argv.slice(2);
if (!mode || !target || !backup || !["apply", "restore"].includes(mode)) {
  throw new Error("Usage: instrument-openclaw-2026.8.1-shutdown.mjs <apply|restore> <target> <backup>");
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

const replacements = [
  [
    `async function shutdownStep(name, fn, warnings) {\n\ttry {\n\t\tawait fn();\n\t\treturn true;`,
    `async function shutdownStep(name, fn, warnings) {\n\tshutdownLog.info(\`[acceptance-shutdown-trace] start \${name}\`);\n\ttry {\n\t\tawait fn();\n\t\tshutdownLog.info(\`[acceptance-shutdown-trace] done \${name}\`);\n\t\treturn true;`,
  ],
  [
    `async function runGatewayClosePrelude(params) {\n\tparams.stopDiagnostics?.();`,
    `async function runGatewayClosePrelude(params) {\n\tshutdownLog.info("[acceptance-shutdown-trace] prelude start");\n\tparams.stopDiagnostics?.();`,
  ],
  [
    `\tawait params.closeMcpServer?.().catch(() => {});\n}`,
    `\tawait params.closeMcpServer?.().catch(() => {});\n\tshutdownLog.info("[acceptance-shutdown-trace] prelude done");\n}`,
  ],
  [
    `\t\ttry {\n\t\t\tfenceSessionSuspensionWritesForGatewayShutdown();`,
    `\t\ttry {\n\t\t\tshutdownLog.info("[acceptance-shutdown-trace] close handler start");\n\t\t\tfenceSessionSuspensionWritesForGatewayShutdown();`,
  ],
];

let instrumented = source;
for (const [needle, replacement] of replacements) {
  if (!instrumented.includes(needle)) throw new Error(`Instrumentation anchor missing: ${needle}`);
  instrumented = instrumented.replace(needle, replacement);
}

fs.writeFileSync(target, instrumented);
process.stdout.write(`${JSON.stringify({ ok: true, mode, target, backup })}\n`);
