#!/usr/bin/env node

import { chmod, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_PACKAGE_VERSION = "2026.7.1";

const ORIGINAL_QUEUE_RETURN = `\treturn (key, task) => {
\t\tconst previous = queues.get(key) ?? Promise.resolve();
\t\tconst wrapped = () => boundedRun(key, task, taskTimeoutMs, onTaskTimeout);
\t\tconst next = previous.then(wrapped, wrapped);
\t\tqueues.set(key, next);
\t\tconst cleanup = () => {
\t\t\tif (queues.get(key) === next) queues.delete(key);
\t\t};
\t\tnext.then(cleanup, cleanup);
\t\treturn next;
\t};`;

const PATCHED_QUEUE_RETURN = `\tconst enqueue = (key, task) => {
\t\tconst previous = queues.get(key) ?? Promise.resolve();
\t\tconst wrapped = () => boundedRun(key, task, taskTimeoutMs, onTaskTimeout);
\t\tconst next = previous.then(wrapped, wrapped);
\t\tqueues.set(key, next);
\t\tconst cleanup = () => {
\t\t\tif (queues.get(key) === next) queues.delete(key);
\t\t};
\t\tnext.then(cleanup, cleanup);
\t\treturn next;
\t};
\tenqueue.isBusy = (key) => queues.has(key);
\treturn enqueue;`;

const ORIGINAL_DISPATCH = `\t\tawait enqueue(sequentialKey, task);`;
const PATCHED_DISPATCH = `\t\tconst dispatchKey = enqueue.isBusy(sequentialKey) ? \`\${sequentialKey}:active-run\` : sequentialKey;
\t\tawait enqueue(dispatchKey, task);`;

function replaceExactlyOnce(source, original, replacement, label) {
  const first = source.indexOf(original);
  if (first === -1) {
    throw new Error(`Feishu active-run steering patch could not find ${label}`);
  }
  if (source.indexOf(original, first + original.length) !== -1) {
    throw new Error(
      `Feishu active-run steering patch found multiple ${label} blocks`,
    );
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + original.length)}`;
}

export function patchFeishuActiveRunSteeringBundle(source) {
  const patchedMarkers = [PATCHED_QUEUE_RETURN, PATCHED_DISPATCH];
  const markerCount = patchedMarkers.filter((marker) =>
    source.includes(marker),
  ).length;
  if (markerCount === patchedMarkers.length) {
    return { changed: false, source };
  }
  if (markerCount !== 0) {
    throw new Error(
      `Feishu active-run steering bundle is partially patched (${markerCount}/${patchedMarkers.length} markers)`,
    );
  }
  let patched = source;
  patched = replaceExactlyOnce(
    patched,
    ORIGINAL_QUEUE_RETURN,
    PATCHED_QUEUE_RETURN,
    "sequential queue return",
  );
  patched = replaceExactlyOnce(
    patched,
    ORIGINAL_DISPATCH,
    PATCHED_DISPATCH,
    "message dispatch enqueue",
  );
  return { changed: true, source: patched };
}

// Exported as an executable specification for the ordering regression test.
export function createActiveRunAwareQueue() {
  const queues = new Map();
  const enqueue = (key, task) => {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    queues.set(key, next);
    const cleanup = () => {
      if (queues.get(key) === next) queues.delete(key);
    };
    next.then(cleanup, cleanup);
    return next;
  };
  enqueue.isBusy = (key) => queues.has(key);
  enqueue.dispatch = (key, task) =>
    enqueue(enqueue.isBusy(key) ? `${key}:active-run` : key, task);
  return enqueue;
}

async function resolveBundle(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (packageJson.name !== "@openclaw/feishu") {
    throw new Error(
      `unexpected package at ${packageRoot}: ${packageJson.name ?? "unknown"}`,
    );
  }
  if (packageJson.version !== EXPECTED_PACKAGE_VERSION) {
    throw new Error(
      `unsupported @openclaw/feishu version ${packageJson.version}; expected ${EXPECTED_PACKAGE_VERSION}`,
    );
  }
  const distDir = path.join(packageRoot, "dist");
  const candidates = (await readdir(distDir))
    .filter((name) => /^monitor\.account-[A-Za-z0-9_-]+\.js$/.test(name))
    .sort();
  if (candidates.length !== 1) {
    throw new Error(
      `expected one Feishu monitor.account bundle in ${distDir}, found ${candidates.length}`,
    );
  }
  return path.join(distDir, candidates[0]);
}

async function patchPackage(packageRoot) {
  const bundlePath = await resolveBundle(path.resolve(packageRoot));
  const original = await readFile(bundlePath, "utf8");
  const result = patchFeishuActiveRunSteeringBundle(original);
  if (!result.changed) return { bundlePath, changed: false };
  const originalStat = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.active-run-steering-${process.pid}.tmp`;
  await writeFile(temporaryPath, result.source, { mode: originalStat.mode });
  await chmod(temporaryPath, originalStat.mode);
  await rename(temporaryPath, bundlePath);
  return { bundlePath, changed: true };
}

async function main(args) {
  if (args.length === 0) {
    throw new Error(
      "usage: patch-feishu-active-run-steering.mjs <package-root> [...]",
    );
  }
  for (const packageRoot of args) {
    const result = await patchPackage(packageRoot);
    process.stdout.write(
      `${result.changed ? "patched" : "already-patched"} ${result.bundlePath}\n`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
