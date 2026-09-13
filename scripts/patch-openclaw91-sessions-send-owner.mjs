#!/usr/bin/env node

import {
  chmod,
  chown,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SUPPORTED_PACKAGE_VERSIONS = new Set(["2026.9.1"]);
const BACKUP_SUFFIX = ".v-sessions-send-owner-v1.bak";
const PATCH_MARKER = "v-sessions-send-owner-v1";

const ORIGINAL = `\t\t\tconst requesterRoute = requesterRouteBindings?.length && requesterRouteChannel && requesterRoutePeerId ? resolveAgentRoute({
\t\t\t\tcfg,
\t\t\t\tchannel: requesterRouteChannel,
\t\t\t\taccountId: requesterDeliveryRoute?.accountId,
\t\t\t\tpeer: {`;

const PATCHED = `\t\t\tconst requesterRoute = requesterRouteBindings?.length && requesterRouteChannel && requesterRoutePeerId ? resolveAgentRoute({
\t\t\t\tcfg,
\t\t\t\tchannel: requesterRouteChannel,
\t\t\t\taccountId: requesterDeliveryRoute?.accountId,
\t\t\t\t// ${PATCH_MARKER}: an agent-prefixed source Session already has an
\t\t\t\t// explicit owner. Keep binding precedence, but do not fall through to
\t\t\t\t// ambient channel ownership when this exact peer has no binding.
\t\t\t\tdefaultAgentId: parsedRequesterSessionKey?.agentId,
\t\t\t\tpeer: {`;

function replaceExactlyOnce(source, original, replacement) {
  const first = source.indexOf(original);
  if (first === -1) {
    throw new Error("sessions_send requester route anchor was not found");
  }
  if (source.indexOf(original, first + original.length) !== -1) {
    throw new Error("sessions_send requester route anchor was not unique");
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + original.length)}`;
}

export function patchSessionsSendRequesterOwner(source) {
  if (source.includes(PATCHED)) return { changed: false, source };
  if (source.includes(PATCH_MARKER)) {
    throw new Error("sessions_send requester owner patch is partial or drifted");
  }
  return {
    changed: true,
    source: replaceExactlyOnce(source, ORIGINAL, PATCHED),
  };
}

async function resolveBundle(packageRoot) {
  const resolvedRoot = path.resolve(packageRoot);
  const packageJson = JSON.parse(
    await readFile(path.join(resolvedRoot, "package.json"), "utf8"),
  );
  if (packageJson.name !== "openclaw") {
    throw new Error(`unexpected package at ${resolvedRoot}: ${packageJson.name}`);
  }
  if (!SUPPORTED_PACKAGE_VERSIONS.has(packageJson.version)) {
    throw new Error(
      `unsupported OpenClaw version ${packageJson.version}; expected 2026.9.1`,
    );
  }

  const distDir = path.join(resolvedRoot, "dist");
  const candidates = (await readdir(distDir))
    .filter((name) => /^sessions-spawn-tool-[A-Za-z0-9_-]+\.js$/.test(name))
    .sort();
  const matches = [];
  for (const name of candidates) {
    const filename = path.join(distDir, name);
    const source = await readFile(filename, "utf8");
    if (
      source.includes("function createSessionsSendTool(opts)") &&
      (source.includes(ORIGINAL) || source.includes(PATCH_MARKER))
    ) {
      matches.push({ filename, source });
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `expected one OpenClaw 2026.9.1 sessions_send bundle in ${distDir}, found ${matches.length}`,
    );
  }
  return matches[0];
}

async function atomicReplace(filename, contents) {
  const metadata = await stat(filename);
  const temporary = `${filename}.v-sessions-send-owner-${process.pid}.tmp`;
  await writeFile(temporary, contents, {
    flag: "wx",
    mode: metadata.mode & 0o777,
  });
  await chmod(temporary, metadata.mode & 0o777);
  await chown(temporary, metadata.uid, metadata.gid);
  await rename(temporary, filename);
}

export async function patchPackage(packageRoot) {
  const { filename, source } = await resolveBundle(packageRoot);
  const result = patchSessionsSendRequesterOwner(source);
  const backup = `${filename}${BACKUP_SUFFIX}`;
  if (result.changed) {
    try {
      await writeFile(backup, source, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if ((await readFile(backup, "utf8")) !== source) {
        throw new Error(`backup drift for ${filename}`);
      }
    }
    await atomicReplace(filename, result.source);
  }
  return { changed: result.changed, filename, backup };
}

export async function restorePackage(packageRoot) {
  const { filename, source } = await resolveBundle(packageRoot);
  const backup = `${filename}${BACKUP_SUFFIX}`;
  let original;
  try {
    original = await readFile(backup, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { changed: false, filename, backup };
    }
    throw error;
  }
  const patched = patchSessionsSendRequesterOwner(original).source;
  if (source !== original && source !== patched) {
    throw new Error(`refusing to restore drifted bundle ${filename}`);
  }
  if (source !== original) await atomicReplace(filename, original);
  return { changed: source !== original, filename, backup };
}

async function main(args) {
  const restore = args[0] === "--restore";
  const packageRoot = restore ? args[1] : args[0];
  if (!packageRoot || args.length !== (restore ? 2 : 1)) {
    throw new Error(
      "usage: patch-openclaw91-sessions-send-owner.mjs [--restore] <openclaw-package-root>",
    );
  }
  const result = restore
    ? await restorePackage(packageRoot)
    : await patchPackage(packageRoot);
  process.stdout.write(`${JSON.stringify({ restore, result })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
