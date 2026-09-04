#!/usr/bin/env node

import {
  copyFile,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PATCH_MARKER = "versa-worker-exec-config-domain-openclaw81-v1";
const BACKUP_SUFFIX = ".pre-worker-exec-config-domain-openclaw81-v1";
const ORIGINAL = `\t\tconst execParams = normalizeParams(rawArgs);
\t\tif (!execParams.command) return execParams;
\t\tif (isResolveExecEnvPrepared(execParams)) return markResolveExecEnvPrepared(execParams);
\t\tconst hookRunner = getGlobalHookRunner();`;
const PATCHED = `\t\tconst execParams = normalizeParams(rawArgs);
\t\tif (!execParams.command) return execParams;
\t\tif (isResolveExecEnvPrepared(execParams)) return markResolveExecEnvPrepared(execParams);
\t\t// ${PATCH_MARKER}: the embedded Worker runtime and the exec-tool bundle
\t\t// can hold different plugin-generation scopes. Keep Agent-launched local
\t\t// CLI commands on the Gateway control-plane config deterministically.
\t\tconst isolatedWorkerGatewayConfig = process.env.VLAB_WORKER_CHILD === "1" ? process.env.VLAB_GATEWAY_CONFIG_PATH?.trim() : "";
\t\tif (isolatedWorkerGatewayConfig) {
\t\t\tlet isolatedWorkerExecHost;
\t\t\ttry {
\t\t\t\tisolatedWorkerExecHost = params.resolveHostForParams(execParams);
\t\t\t} catch {
\t\t\t\treturn execParams;
\t\t\t}
\t\t\tif (isolatedWorkerExecHost !== "sandbox") return markResolveExecEnvPrepared(execParams, {
\t\t\t\thost: isolatedWorkerExecHost,
\t\t\t\tpluginEnv: filterPluginExecEnv({
\t\t\t\t\tOPENCLAW_CONFIG_PATH: isolatedWorkerGatewayConfig,
\t\t\t\t\tVLAB_ACTIVE_CONFIG_DOMAIN: "gateway"
\t\t\t\t})
\t\t\t});
\t\t}
\t\tconst hookRunner = getGlobalHookRunner();`;

export function patchWorkerExecConfigDomainBundle(source) {
  if (source.includes(PATCH_MARKER)) {
    return { source, changed: false };
  }
  const first = source.indexOf(ORIGINAL);
  if (first < 0) {
    throw new Error("Worker exec config-domain anchor was not found");
  }
  if (source.indexOf(ORIGINAL, first + ORIGINAL.length) >= 0) {
    throw new Error("Worker exec config-domain anchor was not unique");
  }
  return {
    source: `${source.slice(0, first)}${PATCHED}${source.slice(first + ORIGINAL.length)}`,
    changed: true,
  };
}

async function resolveBundle(packageRoot) {
  const root = resolve(packageRoot);
  const packageJson = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  if (packageJson.name !== "openclaw" || !["2026.8.1", "2026.9.1"].includes(packageJson.version)) {
    throw new Error(
      `unsupported OpenClaw package ${packageJson.name}@${packageJson.version}; expected audited openclaw@2026.8.1 or 2026.9.1`,
    );
  }
  const dist = join(root, "dist");
  const matches = [];
  for (const name of (await readdir(dist)).filter((entry) =>
    /^bash-tools-[A-Za-z0-9_-]+\.js$/.test(entry),
  )) {
    const candidate = join(dist, name);
    const source = await readFile(candidate, "utf8");
    if (source.includes(ORIGINAL) || source.includes(PATCH_MARKER)) {
      matches.push(candidate);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`expected one OpenClaw exec-tools bundle, found ${matches.length}`);
  }
  return matches[0];
}

export async function patchPackage(packageRoot) {
  const bundlePath = await resolveBundle(packageRoot);
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  const source = await readFile(bundlePath, "utf8");
  const result = patchWorkerExecConfigDomainBundle(source);
  if (!result.changed) return { ...result, bundlePath, backupPath };
  await copyFile(bundlePath, backupPath);
  const mode = (await stat(bundlePath)).mode;
  const temporaryPath = `${bundlePath}.worker-config-domain-${process.pid}.tmp`;
  await writeFile(temporaryPath, result.source, { encoding: "utf8", mode });
  await rename(temporaryPath, bundlePath);
  return { ...result, bundlePath, backupPath };
}

export async function restorePackage(packageRoot) {
  const bundlePath = await resolveBundle(packageRoot);
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  await rename(backupPath, bundlePath);
  return { restored: true, bundlePath, backupPath };
}

async function main() {
  const [first, second] = process.argv.slice(2);
  const restoring = first === "--restore";
  const packageRoot = restoring ? second : first;
  if (!packageRoot) {
    throw new Error(
      "usage: patch-openclaw-worker-exec-config-domain.mjs [--restore] <openclaw-package-root>",
    );
  }
  const result = restoring
    ? await restorePackage(packageRoot)
    : await patchPackage(packageRoot);
  process.stdout.write(
    `${restoring ? "restored" : result.changed ? "patched" : "already-patched"} ${result.bundlePath}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
