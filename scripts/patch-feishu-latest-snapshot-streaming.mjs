#!/usr/bin/env node

import { chmod, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_PACKAGE_VERSION = "2026.7.1";

const ORIGINAL_DECLARATIONS = `\tlet partialUpdateQueue = Promise.resolve();
\tlet streamingStartPromise = null;`;

const PATCHED_DECLARATIONS = `\tlet partialUpdateQueue = Promise.resolve();
\tlet streamingFlushScheduled = false;
\tlet latestStreamingCombined = null;
\tlet streamingStartPromise = null;`;

const ORIGINAL_FLUSH = `\tconst flushStreamingCardUpdate = (combined) => {
\t\tpartialUpdateQueue = partialUpdateQueue.then(async () => {
\t\t\tif (streamingStartPromise) await streamingStartPromise;
\t\t\tif (streaming?.isActive()) await streaming.update(combined);
\t\t});
\t};`;

const PATCHED_FLUSH = `\tconst flushStreamingCardUpdate = (combined) => {
\t\tlatestStreamingCombined = combined;
\t\tif (streamingFlushScheduled) return;
\t\tstreamingFlushScheduled = true;
\t\tpartialUpdateQueue = partialUpdateQueue.then(async () => {
\t\t\ttry {
\t\t\t\twhile (latestStreamingCombined !== null) {
\t\t\t\t\tconst nextCombined = latestStreamingCombined;
\t\t\t\t\tlatestStreamingCombined = null;
\t\t\t\t\tif (streamingStartPromise) await streamingStartPromise;
\t\t\t\t\tif (streaming?.isActive()) await streaming.update(nextCombined);
\t\t\t\t}
\t\t\t} finally {
\t\t\t\tstreamingFlushScheduled = false;
\t\t\t}
\t\t});
\t};`;

const ORIGINAL_DELTA = `\t\tif ((options?.mode ?? "snapshot") === "delta") streamText = \`\${streamText}\${nextText}\`;`;
const PATCHED_DELTA = `\t\tif ((options?.mode ?? "snapshot") === "delta") streamText = mergeStreamingText(streamText, nextText);`;

const ORIGINAL_RESET = `\t\tpartialUpdateQueue = Promise.resolve();
\t\tstreamText = "";`;

const PATCHED_RESET = `\t\tpartialUpdateQueue = Promise.resolve();
\t\tstreamingFlushScheduled = false;
\t\tlatestStreamingCombined = null;
\t\tstreamText = "";`;

function replaceExactlyOnce(source, original, replacement, label) {
  const first = source.indexOf(original);
  if (first === -1) {
    throw new Error(`Feishu streaming patch could not find ${label}`);
  }
  if (source.indexOf(original, first + original.length) !== -1) {
    throw new Error(`Feishu streaming patch found multiple ${label} blocks`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + original.length)}`;
}

export function patchFeishuStreamingBundle(source) {
  const patchedMarkers = [
    PATCHED_DECLARATIONS,
    PATCHED_FLUSH,
    PATCHED_DELTA,
    PATCHED_RESET,
  ];
  const markerCount = patchedMarkers.filter((marker) => source.includes(marker)).length;

  if (markerCount === patchedMarkers.length) {
    return { changed: false, source };
  }
  if (markerCount !== 0) {
    throw new Error(
      `Feishu streaming bundle is partially patched (${markerCount}/${patchedMarkers.length} markers)`,
    );
  }

  let patched = source;
  patched = replaceExactlyOnce(
    patched,
    ORIGINAL_DECLARATIONS,
    PATCHED_DECLARATIONS,
    "streaming queue declarations",
  );
  patched = replaceExactlyOnce(
    patched,
    ORIGINAL_FLUSH,
    PATCHED_FLUSH,
    "streaming flush function",
  );
  patched = replaceExactlyOnce(
    patched,
    ORIGINAL_DELTA,
    PATCHED_DELTA,
    "delta merge statement",
  );
  patched = replaceExactlyOnce(
    patched,
    ORIGINAL_RESET,
    PATCHED_RESET,
    "streaming state reset",
  );
  return { changed: true, source: patched };
}

async function resolveBundle(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (packageJson.name !== "@openclaw/feishu") {
    throw new Error(`unexpected package at ${packageRoot}: ${packageJson.name ?? "unknown"}`);
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
  const result = patchFeishuStreamingBundle(original);
  if (!result.changed) {
    return { bundlePath, changed: false };
  }

  const originalStat = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.latest-snapshot-${process.pid}.tmp`;
  await writeFile(temporaryPath, result.source, { mode: originalStat.mode });
  await chmod(temporaryPath, originalStat.mode);
  await rename(temporaryPath, bundlePath);
  return { bundlePath, changed: true };
}

async function main(args) {
  if (args.length === 0) {
    throw new Error("usage: patch-feishu-latest-snapshot-streaming.mjs <package-root> [...]");
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
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
