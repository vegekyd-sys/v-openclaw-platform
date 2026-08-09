#!/usr/bin/env node

import { chmod, copyFile, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_PACKAGE_VERSION = "2026.7.1";
const IMPORT_ANCHOR = `import fs from "node:fs";\nimport path from "node:path";`;
const IMPORT_IDENTIFIER = "applyVersaSessionHotsetProjection";
const PATCH_MARKER = "versa-session-hotset-v0.2.0";

const ORIGINAL_PERSISTENCE_PROJECTION = `const persisted = projectSessionStoreForPersistence({
\t\tstorePath,
\t\tstore
\t});`;

const PATCHED_PERSISTENCE_PROJECTION = `const persisted = projectSessionStoreForPersistence({
\t\tstorePath,
\t\tstore
\t});
\t// ${PATCH_MARKER}: retain every Session directory entry, evict only dormant derived prompt state.
\t${IMPORT_IDENTIFIER}(persisted.store, { activeSessionKey: opts?.activeSessionKey });`;

function replaceExactlyOnce(source, original, replacement, label) {
  const first = source.indexOf(original);
  if (first === -1) {
    throw new Error(`Session Hotset patch could not find ${label}`);
  }
  if (source.indexOf(original, first + original.length) !== -1) {
    throw new Error(`Session Hotset patch found multiple ${label} blocks`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + original.length)}`;
}

export function patchOpenClawSessionStoreBundle(source, moduleUrl) {
  const importLine = `import { applySessionHotsetProjection as ${IMPORT_IDENTIFIER} } from ${JSON.stringify(moduleUrl)};`;
  const importPrefix = `import { applySessionHotsetProjection as ${IMPORT_IDENTIFIER} } from `;
  const existingImports = source
    .split("\n")
    .filter((line) => line.startsWith(importPrefix));
  const hasImport = source.includes(importLine);
  const hasFunction = source.includes(PATCH_MARKER);
  if (hasImport && hasFunction) {
    return { changed: false, source };
  }
  if (hasFunction && existingImports.length === 1) {
    return {
      changed: true,
      source: source.replace(existingImports[0], importLine),
    };
  }
  if (hasImport || hasFunction || existingImports.length > 0) {
    throw new Error("Session Hotset bundle is partially patched");
  }

  let patched = replaceExactlyOnce(
    source,
    IMPORT_ANCHOR,
    `${IMPORT_ANCHOR}\n${importLine}`,
    "Node fs/path import anchor",
  );
  patched = replaceExactlyOnce(
    patched,
    ORIGINAL_PERSISTENCE_PROJECTION,
    PATCHED_PERSISTENCE_PROJECTION,
    "Session Store persistence projection",
  );
  return { changed: true, source: patched };
}

async function resolveBundle(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (packageJson.name !== "openclaw") {
    throw new Error(`unexpected package at ${packageRoot}: ${packageJson.name ?? "unknown"}`);
  }
  if (packageJson.version !== EXPECTED_PACKAGE_VERSION) {
    throw new Error(
      `unsupported OpenClaw version ${packageJson.version}; expected ${EXPECTED_PACKAGE_VERSION}`,
    );
  }
  const distDir = path.join(packageRoot, "dist");
  const candidates = (await readdir(distDir))
    .filter((name) => /^store-[A-Za-z0-9_-]+\.js$/.test(name))
    .sort();
  const matches = [];
  for (const candidate of candidates) {
    const candidatePath = path.join(distDir, candidate);
    const source = await readFile(candidatePath, "utf8");
    if (
      source.includes(ORIGINAL_PERSISTENCE_PROJECTION) ||
      source.includes(PATCH_MARKER)
    ) {
      matches.push(candidatePath);
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `expected one writable OpenClaw Session Store bundle in ${distDir}, found ${matches.length}`,
    );
  }
  return matches[0];
}

async function patchPackage(packageRoot, modulePath) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const moduleUrl = pathToFileURL(path.resolve(modulePath)).href;
  const original = await readFile(bundlePath, "utf8");
  const result = patchOpenClawSessionStoreBundle(original, moduleUrl);
  if (!result.changed) {
    return { bundlePath, changed: false };
  }

  const backupPath = `${bundlePath}.pre-session-hotset-v0.2.0`;
  try {
    await stat(backupPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    await copyFile(bundlePath, backupPath);
  }
  const originalStat = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.session-hotset-${process.pid}.tmp`;
  await writeFile(temporaryPath, result.source, { mode: originalStat.mode });
  await chmod(temporaryPath, originalStat.mode);
  await rename(temporaryPath, bundlePath);
  return { bundlePath, backupPath, changed: true };
}

async function restorePackage(packageRoot) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const backupPath = `${bundlePath}.pre-session-hotset-v0.2.0`;
  const backup = await readFile(backupPath, "utf8");
  const originalStat = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.session-hotset-restore-${process.pid}.tmp`;
  await writeFile(temporaryPath, backup, { mode: originalStat.mode });
  await chmod(temporaryPath, originalStat.mode);
  await rename(temporaryPath, bundlePath);
  return { bundlePath, backupPath };
}

async function main(args) {
  if (args[0] === "--restore") {
    if (args.length !== 2) {
      throw new Error("usage: patch-openclaw-session-hotset.mjs --restore <openclaw-package-root>");
    }
    const result = await restorePackage(args[1]);
    process.stdout.write(`restored ${result.bundlePath}\n`);
    return;
  }
  if (args.length !== 2) {
    throw new Error(
      "usage: patch-openclaw-session-hotset.mjs <openclaw-package-root> <session-hotset-module>",
    );
  }
  const result = await patchPackage(args[0], args[1]);
  process.stdout.write(
    `${result.changed ? "patched" : "already-patched"} ${result.bundlePath}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
