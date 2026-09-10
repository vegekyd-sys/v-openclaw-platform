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
const BACKUP_SUFFIX = ".oc64-session-races-v1.bak";

const LIVE_SWITCH_ORIGINAL = `function resolveLiveSessionModelSwitchRedirectIndex(params) {
\tconst targetKey = modelKey(params.error.provider, params.error.model);
\tconst targetIndex = params.candidates.findIndex((candidate) => modelKey(candidate.provider, candidate.model) === targetKey);
\tif (targetIndex === -1) throw params.error;
\treturn targetIndex > params.currentIndex ? targetIndex : null;
}`;

const LIVE_SWITCH_PATCHED = `function resolveLiveSessionModelSwitchRedirectIndex(params) {
\tconst targetKey = modelKey(params.error.provider, params.error.model);
\tconst targetIndex = params.candidates.findIndex((candidate) => modelKey(candidate.provider, candidate.model) === targetKey);
\tif (targetIndex === -1) throw params.error;
\t// oc64-session-races-v1: a same/earlier-model live switch must restart the
\t// outer run so auth/runtime selection is rebuilt instead of failing the
\t// already successful candidate as an unknown fallback error.
\tif (targetIndex <= params.currentIndex) throw params.error;
\treturn targetIndex;
}`;

const SQLITE_SNAPSHOT_DECLARATION =
  "async function patchSqliteSessionEntrySnapshot(params) {";
const SQLITE_PATCH_MARKER = "oc64-session-races-v1: bounded cross-process retry";
const SQLITE_SNAPSHOT_WRAPPER = `const SQLITE_SESSION_SNAPSHOT_RETRY_LIMIT = 5;
function isRetryableSqliteSessionSnapshotConflict(error) {
\treturn error instanceof Error && error.name === "SqliteSessionMutationConflictError" && error.message.startsWith("SQLite session state changed while preparing ");
}
async function patchSqliteSessionEntrySnapshot(params) {
\tfor (let attempt = 1;; attempt += 1) {
\t\ttry {
\t\t\treturn await patchSqliteSessionEntrySnapshotOnce(params);
\t\t} catch (error) {
\t\t\t// ${SQLITE_PATCH_MARKER}. Opt-in keeps callbacks with external side
\t\t\t// effects single-shot; reply-session persistence is a pure merge and
\t\t\t// explicitly enables this retry below.
\t\t\tif (params.options.retrySnapshotConflicts !== true || !isRetryableSqliteSessionSnapshotConflict(error) || attempt >= SQLITE_SESSION_SNAPSHOT_RETRY_LIMIT) throw error;
\t\t\tawait new Promise((resolve) => setTimeout(resolve, 2 ** attempt));
\t\t}
\t}
}
async function patchSqliteSessionEntrySnapshotOnce(params) {`;

const REPLY_PERSISTENCE_ORIGINAL = `\t}, {
\t\tfallbackEntry: params.entry,
\t\treplaceEntry: true,
\t\tskipMaintenance: params.skipMaintenance
\t});`;

const REPLY_PERSISTENCE_PATCHED = `\t}, {
\t\tfallbackEntry: params.entry,
\t\treplaceEntry: true,
\t\t// oc64-session-races-v1: recompute this pure three-way merge when a
\t\t// Gateway/Worker process commits the same Session row first.
\t\tretrySnapshotConflicts: true,
\t\tskipMaintenance: params.skipMaintenance
\t});`;

function replaceExactlyOnce(source, original, replacement, label) {
  const first = source.indexOf(original);
  if (first === -1) {
    throw new Error(`Session race patch could not find ${label}`);
  }
  if (source.indexOf(original, first + original.length) !== -1) {
    throw new Error(`Session race patch found multiple ${label} blocks`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + original.length)}`;
}

export function patchLiveModelSwitchBundle(source) {
  if (source.includes(LIVE_SWITCH_PATCHED)) {
    return { changed: false, source };
  }
  if (source.includes("oc64-session-races-v1")) {
    throw new Error("Live model switch bundle is partially patched");
  }
  return {
    changed: true,
    source: replaceExactlyOnce(
      source,
      LIVE_SWITCH_ORIGINAL,
      LIVE_SWITCH_PATCHED,
      "live model switch redirect",
    ),
  };
}

export function patchSqliteSessionAccessorBundle(source) {
  if (
    source.includes(SQLITE_PATCH_MARKER) &&
    source.includes("async function patchSqliteSessionEntrySnapshotOnce(params) {")
  ) {
    return { changed: false, source };
  }
  if (source.includes(SQLITE_PATCH_MARKER)) {
    throw new Error("SQLite session accessor bundle is partially patched");
  }
  return {
    changed: true,
    source: replaceExactlyOnce(
      source,
      SQLITE_SNAPSHOT_DECLARATION,
      SQLITE_SNAPSHOT_WRAPPER,
      "SQLite session snapshot declaration",
    ),
  };
}

export function patchReplySessionPersistenceBundle(source) {
  if (source.includes(REPLY_PERSISTENCE_PATCHED)) {
    return { changed: false, source };
  }
  if (source.includes("oc64-session-races-v1")) {
    throw new Error("Reply session persistence bundle is partially patched");
  }
  return {
    changed: true,
    source: replaceExactlyOnce(
      source,
      REPLY_PERSISTENCE_ORIGINAL,
      REPLY_PERSISTENCE_PATCHED,
      "reply session persistence options",
    ),
  };
}

const bundleSpecs = [
  {
    label: "live model switch fallback",
    pattern: /^model-fallback-attempt-[A-Za-z0-9_-]+\.js$/,
    patch: patchLiveModelSwitchBundle,
    marker: "resolveLiveSessionModelSwitchRedirectIndex",
  },
  {
    label: "SQLite session accessor",
    pattern: /^session-accessor\.sqlite-entry-[A-Za-z0-9_-]+\.js$/,
    patch: patchSqliteSessionAccessorBundle,
    marker: SQLITE_SNAPSHOT_DECLARATION,
    patchedMarker: SQLITE_PATCH_MARKER,
  },
  {
    label: "reply session persistence",
    pattern: /^session-entry-persistence-[A-Za-z0-9_-]+\.js$/,
    patch: patchReplySessionPersistenceBundle,
    marker: "persistReplySessionEntry",
  },
];

async function resolveBundles(packageRoot) {
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
  const names = await readdir(distDir);
  const bundles = [];
  for (const spec of bundleSpecs) {
    const candidates = names.filter((name) => spec.pattern.test(name)).sort();
    const matches = [];
    for (const name of candidates) {
      const filename = path.join(distDir, name);
      const source = await readFile(filename, "utf8");
      if (
        source.includes(spec.marker) ||
        (spec.patchedMarker && source.includes(spec.patchedMarker))
      ) {
        matches.push({ filename, source, spec });
      }
    }
    if (matches.length !== 1) {
      throw new Error(
        `expected one ${spec.label} bundle in ${distDir}, found ${matches.length}`,
      );
    }
    bundles.push(matches[0]);
  }
  return bundles;
}

async function atomicReplace(filename, contents) {
  const metadata = await stat(filename);
  const temporary = `${filename}.oc64-session-races-${process.pid}.tmp`;
  await writeFile(temporary, contents, {
    flag: "wx",
    mode: metadata.mode & 0o777,
  });
  await chmod(temporary, metadata.mode & 0o777);
  await chown(temporary, metadata.uid, metadata.gid);
  await rename(temporary, filename);
}

export async function patchPackage(packageRoot) {
  const bundles = await resolveBundles(packageRoot);
  const results = [];
  for (const { filename, source, spec } of bundles) {
    const result = spec.patch(source);
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
    results.push({ changed: result.changed, filename, backup });
  }
  return results;
}

export async function restorePackage(packageRoot) {
  const bundles = await resolveBundles(packageRoot);
  const results = [];
  for (const { filename, source, spec } of bundles) {
    const backup = `${filename}${BACKUP_SUFFIX}`;
    let original;
    try {
      original = await readFile(backup, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      results.push({ changed: false, filename, backup });
      continue;
    }
    const patched = spec.patch(original).source;
    if (source !== original && source !== patched) {
      throw new Error(`refusing to restore drifted bundle ${filename}`);
    }
    if (source !== original) await atomicReplace(filename, original);
    results.push({ changed: source !== original, filename, backup });
  }
  return results;
}

async function main(args) {
  const restore = args[0] === "--restore";
  const packageRoot = restore ? args[1] : args[0];
  if (!packageRoot || args.length !== (restore ? 2 : 1)) {
    throw new Error(
      "usage: patch-openclaw91-session-races.mjs [--restore] <openclaw-package-root>",
    );
  }
  const results = restore
    ? await restorePackage(packageRoot)
    : await patchPackage(packageRoot);
  process.stdout.write(`${JSON.stringify({ restore, results })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
