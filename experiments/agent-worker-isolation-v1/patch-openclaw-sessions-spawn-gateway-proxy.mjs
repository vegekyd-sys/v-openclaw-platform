#!/usr/bin/env node

import {
  chown,
  copyFile,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PATCH_MARKER =
  "v-worker-sessions-spawn-external-task-bridge-v0.2.8-v4";
const ACCEPTED_PATCH_MARKER =
  "v-worker-sessions-spawn-external-task-record-v0.2.8-v4";
const LEGACY_TOOL_ANCHOR = "sessions_spawn built-in tool";
const TOOL_FUNCTION_ANCHOR = "function createSessionsSpawnTool(opts)";
const EXECUTE_ANCHOR = "\t\texecute: async (_toolCallId, args) => {\n";
const ACCEPTED_CALL_PATTERN =
  /\t+recordAcceptedSessionSpawn\(result, [^)]+\);\n/g;
const BACKUP_SUFFIX = ".v-worker-sessions-spawn-v0.2.8-v4.bak";
const INJECTION = `\t\t\t// ${PATCH_MARKER}\n\t\t\tif (globalThis[Symbol.for("versa.vlab.external-harness-task-bridge-v1")] === true && args && typeof args === "object") {\n\t\t\t\targs = { ...args, expectsCompletionMessage: false };\n\t\t\t}\n`;
const ACCEPTED_INJECTION = `\t\t\t// ${ACCEPTED_PATCH_MARKER}\n\t\t\tconst externalTaskFact = {\n\t\t\t\t...result,\n\t\t\t\tparentSessionKey: opts?.agentSessionKey,\n\t\t\t\trequesterTurnRunId: opts?.requesterTurnRunId,\n\t\t\t\ttask: params.task,\n\t\t\t\tmode: params.mode,\n\t\t\t\tcleanup: params.cleanup,\n\t\t\t\tlabel: params.label\n\t\t\t};\n\t\t\tconst externalTaskRecorder = globalThis[Symbol.for("versa.vlab.external-harness-task-record-v1")];\n\t\t\tif (typeof externalTaskRecorder === "function") externalTaskRecorder(externalTaskFact);\n\t\t\tconst externalTaskOwnerKeys = [\n\t\t\t\topts?.agentSessionKey?.trim(),\n\t\t\t\topts?.completionOwnerKey?.trim(),\n\t\t\t\topts?.requesterTurnRunId ? \`run:\${opts.requesterTurnRunId}\` : undefined\n\t\t\t].filter(Boolean);\n\t\t\tif (result?.status === "accepted" && externalTaskOwnerKeys.length > 0) {\n\t\t\t\tconst ownerSymbol = Symbol.for("versa.vlab.external-harness-task-owners-v1");\n\t\t\t\tconst owners = globalThis[ownerSymbol] instanceof Set ? globalThis[ownerSymbol] : new Set();\n\t\t\t\tfor (const ownerKey of externalTaskOwnerKeys) owners.add(ownerKey);\n\t\t\t\tglobalThis[ownerSymbol] = owners;\n\t\t\t}\n`;

export function patchSessionsSpawnGatewayProxy(source) {
  if (
    source.includes("v-worker-sessions-spawn-external-task-bridge-v0.2.8") &&
    !source.includes(PATCH_MARKER)
  ) {
    source = source
      .replace(
        /\n\t\t\t\/\/ v-worker-sessions-spawn-external-task-bridge-v0\.2\.8(?:-v[23])?\n\t\t\tif \(globalThis\[Symbol\.for\("versa\.vlab\.external-harness-task-bridge-v1"\)\] === true && args && typeof args === "object"\) \{\n\t\t\t\targs = \{ \.\.\.args, expectsCompletionMessage: false \};\n\t\t\t\}\n/,
        "\n",
      )
      .replace(
        /\n\t\t\t\/\/ v-worker-sessions-spawn-external-task-record-v0\.2\.8(?:-v[23])?\n[\s\S]*?\n\t\t\t\}\n/,
        "\n",
      );
  }
  const hasExecutePatch = source.includes(PATCH_MARKER);
  const hasAcceptedPatch = source.includes(ACCEPTED_PATCH_MARKER);
  if (hasExecutePatch && hasAcceptedPatch) return { source, changed: false };
  if (hasExecutePatch || hasAcceptedPatch) {
    throw new Error("partial sessions_spawn external Harness patch detected");
  }
  const sectionStart = source.includes(LEGACY_TOOL_ANCHOR)
    ? source.indexOf(LEGACY_TOOL_ANCHOR)
    : source.indexOf(TOOL_FUNCTION_ANCHOR);
  if (sectionStart < 0) throw new Error("sessions_spawn tool anchor was not found");
  const nextSection = source.indexOf("//#endregion", sectionStart);
  const sectionEnd = nextSection >= 0 ? nextSection : source.length;
  const section = source.slice(sectionStart, sectionEnd);
  const matches = section.split(EXECUTE_ANCHOR).length - 1;
  if (matches !== 1) {
    throw new Error(`expected one sessions_spawn execute anchor, found ${matches}`);
  }
  const patched = section.replace(
    EXECUTE_ANCHOR,
    `${EXECUTE_ANCHOR}${INJECTION}`,
  );
  const acceptedMatches = [...patched.matchAll(ACCEPTED_CALL_PATTERN)].length;
  if (acceptedMatches < 1) {
    throw new Error(
      `expected at least one sessions_spawn accepted fact anchor, found ${acceptedMatches}`,
    );
  }
  const acceptedPatched = patched.replace(
    ACCEPTED_CALL_PATTERN,
    (acceptedCall) => `${acceptedCall}${ACCEPTED_INJECTION}`,
  );
  return {
    source:
      source.slice(0, sectionStart) +
      acceptedPatched +
      source.slice(sectionEnd),
    changed: true,
  };
}

async function resolveBundle(packageDir) {
  const distDir = join(resolve(packageDir), "dist");
  const candidates = (await readdir(distDir))
    .filter(
      (name) =>
        /^openclaw-tools-.*\.js$/.test(name) ||
        /^sessions-spawn-tool-.*\.js$/.test(name),
    )
    .sort();
  const matches = [];
  for (const name of candidates) {
    const filePath = join(distDir, name);
    const source = await readFile(filePath, "utf8");
    if (
      source.includes(TOOL_FUNCTION_ANCHOR) &&
      source.includes('name: "sessions_spawn"')
    ) {
      matches.push(filePath);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`expected one sessions_spawn bundle, found ${matches.length}`);
  }
  return matches[0];
}

export async function patchPackage(packageDir) {
  const bundlePath = await resolveBundle(packageDir);
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  const current = await readFile(bundlePath, "utf8");
  const result = patchSessionsSpawnGatewayProxy(current);
  if (!result.changed) return { ...result, bundlePath, backupPath };
  await copyFile(bundlePath, backupPath);
  const metadata = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, result.source, {
    encoding: "utf8",
    mode: metadata.mode,
  });
  await chown(temporaryPath, metadata.uid, metadata.gid);
  await rename(temporaryPath, bundlePath);
  return { ...result, bundlePath, backupPath };
}

export async function restorePackage(packageDir) {
  const bundlePath = await resolveBundle(packageDir);
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  await rename(backupPath, bundlePath);
  return { restored: true, bundlePath, backupPath };
}

async function main() {
  const [first, second] = process.argv.slice(2);
  const restoring = first === "--restore";
  const packageDir = restoring ? second : first;
  if (!packageDir) {
    throw new Error("usage: patch-openclaw-sessions-spawn-gateway-proxy.mjs [--restore] <openclaw-package-dir>");
  }
  const result = restoring
    ? await restorePackage(packageDir)
    : await patchPackage(packageDir);
  process.stdout.write(`${restoring ? "restored" : result.changed ? "patched" : "already patched"} ${result.bundlePath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
