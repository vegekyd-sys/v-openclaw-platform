#!/usr/bin/env node

import {
  chmod,
  copyFile,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const EXPECTED_NAME = "@dingtalk-real-ai/dingtalk-connector";
const EXPECTED_VERSION = "0.8.25";
const MARKER = "versa-dingtalk-openclaw81-channel-message-v1";
const ORIGINAL = 'await import("openclaw/plugin-sdk/channel-runtime")';
const REPLACEMENT =
  'await import("openclaw/plugin-sdk/channel-message") /* ' + MARKER + " */";
const BACKUP_SUFFIX = ".pre-dingtalk-openclaw81-channel-message-v1";

function fail(message) {
  throw new Error(message);
}

export function patchSource(source) {
  const markerCount = source.split(MARKER).length - 1;
  if (markerCount === 1) return { changed: false, source };
  if (markerCount !== 0) fail(`unexpected marker count: ${markerCount}`);
  const occurrences = source.split(ORIGINAL).length - 1;
  if (occurrences !== 1) fail(`expected one legacy channel-runtime import, found ${occurrences}`);
  return { changed: true, source: source.replace(ORIGINAL, REPLACEMENT) };
}

async function resolveBundle(packageRoot) {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  if (packageJson.name !== EXPECTED_NAME || packageJson.version !== EXPECTED_VERSION) {
    fail(
      `unsupported package ${packageJson.name}@${packageJson.version}; ` +
        `expected ${EXPECTED_NAME}@${EXPECTED_VERSION}`,
    );
  }
  const distDir = path.join(packageRoot, "dist");
  const matches = [];
  for (const name of await readdir(distDir)) {
    if (!/^message-handler-[A-Za-z0-9_-]+\.mjs$/.test(name)) continue;
    const candidate = path.join(distDir, name);
    const source = await readFile(candidate, "utf8");
    if (source.includes(ORIGINAL) || source.includes(MARKER)) matches.push(candidate);
  }
  if (matches.length !== 1) fail(`expected one DingTalk message-handler bundle, found ${matches.length}`);
  return matches[0];
}

async function patchPackage(packageRoot) {
  const bundle = await resolveBundle(path.resolve(packageRoot));
  const source = await readFile(bundle, "utf8");
  const result = patchSource(source);
  if (!result.changed) return { bundle, changed: false };
  const backup = `${bundle}${BACKUP_SUFFIX}`;
  try {
    await stat(backup);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await copyFile(bundle, backup);
  }
  const originalStat = await stat(bundle);
  const temporary = `${bundle}.dingtalk-openclaw81-${process.pid}.tmp`;
  await writeFile(temporary, result.source, { mode: originalStat.mode });
  await chmod(temporary, originalStat.mode);
  await rename(temporary, bundle);
  return { bundle, backup, changed: true };
}

async function restorePackage(packageRoot) {
  const bundle = await resolveBundle(path.resolve(packageRoot));
  const backup = `${bundle}${BACKUP_SUFFIX}`;
  const source = await readFile(backup, "utf8");
  const originalStat = await stat(bundle);
  const temporary = `${bundle}.dingtalk-openclaw81-restore-${process.pid}.tmp`;
  await writeFile(temporary, source, { mode: originalStat.mode });
  await chmod(temporary, originalStat.mode);
  await rename(temporary, bundle);
  return { bundle, backup };
}

const args = process.argv.slice(2);
const restore = args[0] === "--restore";
const packageRoot = restore ? args[1] : args[0];
if (!packageRoot || args.length !== (restore ? 2 : 1)) {
  fail("usage: patch-dingtalk-openclaw81-channel-runtime.mjs [--restore] <package-root>");
}
const result = restore
  ? await restorePackage(packageRoot)
  : await patchPackage(packageRoot);
process.stdout.write(
  `${restore ? "restored" : result.changed ? "patched" : "already-patched"} ${result.bundle}\n`,
);
