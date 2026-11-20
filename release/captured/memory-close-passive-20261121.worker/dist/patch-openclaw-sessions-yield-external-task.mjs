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
  "v-worker-sessions-yield-external-task-bridge-v0.2.8-v3";
const TOOL_ANCHOR = "function createSessionsYieldTool(opts)";
const CLAIM_ANCHOR =
  "\t\t\tif (!await opts.claimYield?.()) return jsonResult({\n";
const INVOCATION_ANCHOR = `\t\tcreateSessionsYieldTool({\n\t\t\tsessionId: options?.sessionId,\n`;
const BACKUP_SUFFIX = ".v-worker-sessions-yield-v0.2.8-v3.bak";
const REPLACEMENT = `\t\t\t// ${PATCH_MARKER}\n\t\t\tconst nativeYieldClaimed = await opts.claimYield?.() ?? false;\n\t\t\tconst externalYieldClaim = globalThis[Symbol.for("versa.vlab.external-harness-task-yield-v1")];\n\t\t\tconst callbackYieldClaimed = nativeYieldClaimed || typeof externalYieldClaim !== "function" ? false : await externalYieldClaim({ sessionId: opts.sessionId, requesterSessionKey: opts.requesterSessionKey, requesterTurnRunId: opts.requesterTurnRunId });\n\t\t\tconst ownerSymbol = Symbol.for("versa.vlab.external-harness-task-owners-v1");\n\t\t\tconst owners = globalThis[ownerSymbol];\n\t\t\tconst ownerKeys = [opts.requesterSessionKey?.trim(), opts.requesterTurnRunId ? \`run:\${opts.requesterTurnRunId}\` : undefined].filter(Boolean);\n\t\t\tconst ownerYieldClaimed = !nativeYieldClaimed && !callbackYieldClaimed && owners instanceof Set ? ownerKeys.some((ownerKey) => owners.delete(ownerKey)) : false;\n\t\t\tconst externalYieldClaimed = callbackYieldClaimed || ownerYieldClaimed;\n\t\t\tif (!nativeYieldClaimed && !externalYieldClaimed) return jsonResult({\n`;

export function patchSessionsYieldExternalTask(source) {
  if (
    source.includes("v-worker-sessions-yield-external-task-bridge-v0.2.8") &&
    !source.includes(PATCH_MARKER)
  ) {
    source = source.replace(
      /\t\t\t\/\/ v-worker-sessions-yield-external-task-bridge-v0\.2\.8(?:-v2)?\n[\s\S]*?\t\t\tif \(!nativeYieldClaimed && !externalYieldClaimed\) return jsonResult\(\{\n/,
      CLAIM_ANCHOR,
    );
    source = source.replace(
      `${INVOCATION_ANCHOR}\t\t\trequesterSessionKey: trimmedRunSessionKey || options?.agentSessionKey,\n`,
      INVOCATION_ANCHOR,
    );
  }
  if (source.includes(PATCH_MARKER)) return { source, changed: false };
  const sectionStart = source.indexOf(TOOL_ANCHOR);
  if (sectionStart < 0) {
    throw new Error("sessions_yield tool anchor was not found");
  }
  const nextSection = source.indexOf("//#endregion", sectionStart);
  const sectionEnd = nextSection >= 0 ? nextSection : source.length;
  const section = source.slice(sectionStart, sectionEnd);
  const matches = section.split(CLAIM_ANCHOR).length - 1;
  if (matches !== 1) {
    throw new Error(`expected one sessions_yield claim anchor, found ${matches}`);
  }
  const patched = section.replace(CLAIM_ANCHOR, REPLACEMENT);
  let patchedSource =
    source.slice(0, sectionStart) + patched + source.slice(sectionEnd);
  const invocationMatches = patchedSource.split(INVOCATION_ANCHOR).length - 1;
  if (invocationMatches !== 1) {
    throw new Error(
      `expected one sessions_yield invocation anchor, found ${invocationMatches}`,
    );
  }
  patchedSource = patchedSource.replace(
    INVOCATION_ANCHOR,
    `${INVOCATION_ANCHOR}\t\t\trequesterSessionKey: trimmedRunSessionKey || options?.agentSessionKey,\n\t\t\trequesterTurnRunId: options?.runId,\n`,
  );
  return {
    source: patchedSource,
    changed: true,
  };
}

async function resolveBundle(packageDir) {
  const distDir = join(resolve(packageDir), "dist");
  const matches = [];
  for (const name of (await readdir(distDir))
    .filter((candidate) => /^openclaw-tools-.*\.js$/.test(candidate))
    .sort()) {
    const bundlePath = join(distDir, name);
    const source = await readFile(bundlePath, "utf8");
    if (source.includes(TOOL_ANCHOR)) matches.push(bundlePath);
  }
  if (matches.length !== 1) {
    throw new Error(`expected one sessions_yield bundle, found ${matches.length}`);
  }
  return matches[0];
}

export async function patchPackage(packageDir) {
  const bundlePath = await resolveBundle(packageDir);
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  const current = await readFile(bundlePath, "utf8");
  const result = patchSessionsYieldExternalTask(current);
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
    throw new Error(
      "usage: patch-openclaw-sessions-yield-external-task.mjs [--restore] <openclaw-package-dir>",
    );
  }
  const result = restoring
    ? await restorePackage(packageDir)
    : await patchPackage(packageDir);
  process.stdout.write(
    `${restoring ? "restored" : result.changed ? "patched" : "already patched"} ${result.bundlePath}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
