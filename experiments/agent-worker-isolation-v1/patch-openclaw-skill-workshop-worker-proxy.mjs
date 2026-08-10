#!/usr/bin/env node

import { copyFile, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PATCH_MARKER = "v-worker-skill-workshop-subprocess-v0.2.2";
const TOOL_ANCHOR =
  "/** Create the Skill Workshop tool for proposal discovery and lifecycle actions. */";
const EXECUTE_ANCHOR = "\t\texecute: async (_toolCallId, args) => {\n";
const BACKUP_SUFFIX = ".v-worker-tool-proxy-v0.2.2.bak";
const INJECTION = `\t\t\t// ${PATCH_MARKER}\n\t\t\tconst workerToolProxy = globalThis[Symbol.for("versa.vlab.gateway-owned-tool-proxy-v1")];\n\t\t\tif (typeof workerToolProxy === "function") return await workerToolProxy({\n\t\t\t\ttoolName: "skill_workshop",\n\t\t\t\ttoolCallId: _toolCallId,\n\t\t\t\targs,\n\t\t\t\tcontext: {\n\t\t\t\t\tworkspaceDir: options.workspaceDir,\n\t\t\t\t\tagentId: options.agentId,\n\t\t\t\t\tagentSessionKey: options.agentSessionKey,\n\t\t\t\t\trequesterAgentIdOverride: options.requesterAgentIdOverride\n\t\t\t\t}\n\t\t\t});\n`;

export function patchSkillWorkshopWorkerProxy(source) {
  if (source.includes(PATCH_MARKER)) {
    return { source, changed: false };
  }
  const sectionStart = source.indexOf(TOOL_ANCHOR);
  if (sectionStart < 0) {
    throw new Error("Skill Workshop tool anchor was not found");
  }
  const nextSection = source.indexOf("//#endregion", sectionStart);
  const sectionEnd = nextSection >= 0 ? nextSection : source.length;
  const section = source.slice(sectionStart, sectionEnd);
  const matches = section.split(EXECUTE_ANCHOR).length - 1;
  if (matches !== 1) {
    throw new Error(
      `expected one Skill Workshop execute anchor, found ${matches}`,
    );
  }
  const patchedSection = section.replace(
    EXECUTE_ANCHOR,
    `${EXECUTE_ANCHOR}${INJECTION}`,
  );
  return {
    source:
      source.slice(0, sectionStart) +
      patchedSection +
      source.slice(sectionEnd),
    changed: true,
  };
}

async function resolveBundle(packageDir) {
  const distDir = join(resolve(packageDir), "dist");
  const candidates = (await readdir(distDir))
    .filter((name) => /^openclaw-tools-.*\.js$/.test(name))
    .sort();
  const matches = [];
  for (const name of candidates) {
    const path = join(distDir, name);
    const source = await readFile(path, "utf8");
    if (source.includes(TOOL_ANCHOR)) {
      matches.push(path);
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `expected one OpenClaw Skill Workshop bundle, found ${matches.length}`,
    );
  }
  return matches[0];
}

export async function patchPackage(packageDir) {
  const bundlePath = await resolveBundle(packageDir);
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  const current = await readFile(bundlePath, "utf8");
  const result = patchSkillWorkshopWorkerProxy(current);
  if (!result.changed) {
    return { ...result, bundlePath, backupPath };
  }
  try {
    await stat(backupPath);
  } catch {
    await copyFile(bundlePath, backupPath);
  }
  const mode = (await stat(bundlePath)).mode;
  const temporaryPath = `${bundlePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, result.source, { encoding: "utf8", mode });
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
      "usage: patch-openclaw-skill-workshop-worker-proxy.mjs [--restore] <openclaw-package-dir>",
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
