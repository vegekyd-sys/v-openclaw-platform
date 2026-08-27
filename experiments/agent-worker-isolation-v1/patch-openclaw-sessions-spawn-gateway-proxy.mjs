#!/usr/bin/env node

import { copyFile, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PATCH_MARKER = "v-worker-sessions-spawn-gateway-owner-v0.2.5";
const TOOL_ANCHOR = "sessions_spawn built-in tool";
const EXECUTE_ANCHOR = "\t\texecute: async (_toolCallId, args) => {\n";
const BACKUP_SUFFIX = ".v-worker-sessions-spawn-v0.2.5.bak";
const INJECTION = `\t\t\t// ${PATCH_MARKER}\n\t\t\tconst workerToolProxy = globalThis[Symbol.for("versa.vlab.gateway-owned-tool-proxy-v1")];\n\t\t\tif (typeof workerToolProxy === "function") return await workerToolProxy({\n\t\t\t\ttoolName: "sessions_spawn",\n\t\t\t\ttoolCallId: _toolCallId,\n\t\t\t\targs,\n\t\t\t\tcontext: {\n\t\t\t\t\tworkspaceDir: opts?.workspaceDir,\n\t\t\t\t\tagentSessionKey: opts?.agentSessionKey,\n\t\t\t\t\tcompletionOwnerKey: opts?.completionOwnerKey,\n\t\t\t\t\tagentChannel: opts?.agentChannel,\n\t\t\t\t\tagentAccountId: opts?.agentAccountId,\n\t\t\t\t\tagentTo: opts?.agentTo,\n\t\t\t\t\tagentThreadId: opts?.agentThreadId,\n\t\t\t\t\tagentGroupId: opts?.agentGroupId,\n\t\t\t\t\tagentGroupChannel: opts?.agentGroupChannel,\n\t\t\t\t\tagentGroupSpace: opts?.agentGroupSpace,\n\t\t\t\t\tagentMemberRoleIds: opts?.agentMemberRoleIds,\n\t\t\t\t\trequesterAgentIdOverride: opts?.requesterAgentIdOverride,\n\t\t\t\t\tinheritedToolAllowlist: opts?.inheritedToolAllowlist,\n\t\t\t\t\tinheritedToolDenylist: opts?.inheritedToolDenylist\n\t\t\t\t}\n\t\t\t});\n`;

export function patchSessionsSpawnGatewayProxy(source) {
  if (source.includes(PATCH_MARKER)) return { source, changed: false };
  const sectionStart = source.indexOf(TOOL_ANCHOR);
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
  return {
    source: source.slice(0, sectionStart) + patched + source.slice(sectionEnd),
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
    const filePath = join(distDir, name);
    const source = await readFile(filePath, "utf8");
    if (source.includes(TOOL_ANCHOR)) matches.push(filePath);
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
  const mode = (await stat(bundlePath)).mode;
  const temporaryPath = `${bundlePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, result.source, { encoding: "utf8", mode });
  await rename(temporaryPath, bundlePath);
  return { ...result, bundlePath, backupPath };
}

async function main() {
  const packageDir = process.argv[2];
  if (!packageDir) {
    throw new Error("usage: patch-openclaw-sessions-spawn-gateway-proxy.mjs <openclaw-package-dir>");
  }
  const result = await patchPackage(packageDir);
  process.stdout.write(`${result.changed ? "patched" : "already patched"} ${result.bundlePath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

