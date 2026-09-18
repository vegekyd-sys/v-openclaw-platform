#!/usr/bin/env node

import {
  chmod,
  chown,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function sessionStorePaths(agentStateRoot) {
  const agents = await readdir(agentStateRoot, { withFileTypes: true });
  return agents
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      path.join(agentStateRoot, entry.name, "sessions", "sessions.json"),
    );
}

async function pruneStore(storePath, project, ttlMs) {
  let metadata;
  let source;
  try {
    [metadata, source] = await Promise.all([
      stat(storePath),
      readFile(storePath, "utf8"),
    ]);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { storePath, skipped: "missing" };
    }
    throw error;
  }

  let store;
  try {
    store = JSON.parse(source);
  } catch (error) {
    return {
      storePath,
      skipped: "invalid-json",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const projection = project(store, {
    force: true,
    ttlMs,
    nowMs: Date.now(),
  });
  if (projection.changedEntries === 0) {
    return {
      storePath,
      beforeBytes: metadata.size,
      afterBytes: metadata.size,
      ...projection,
    };
  }

  const next = `${JSON.stringify(store, null, 2)}\n`;
  const temporaryPath = `${storePath}.session-hotset-${process.pid}.tmp`;
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(temporaryPath, next, { mode: metadata.mode });
  await chmod(temporaryPath, metadata.mode);
  await chown(temporaryPath, metadata.uid, metadata.gid);
  await rename(temporaryPath, storePath);
  return {
    storePath,
    beforeBytes: metadata.size,
    afterBytes: Buffer.byteLength(next, "utf8"),
    ...projection,
  };
}

async function main(args) {
  if (args.length !== 3) {
    throw new Error(
      "usage: prune-openclaw-session-hotset.mjs <agents-state-root> <session-hotset-module> <ttl-ms>",
    );
  }
  const [agentStateRoot, modulePath, rawTtlMs] = args;
  const ttlMs = Number(rawTtlMs);
  if (!Number.isInteger(ttlMs) || ttlMs < 100 || ttlMs > 3_600_000) {
    throw new Error("ttl-ms must be an integer between 100 and 3600000");
  }
  const { applySessionHotsetProjection } = await import(
    pathToFileURL(path.resolve(modulePath)).href
  );
  const stores = [];
  for (const storePath of await sessionStorePaths(path.resolve(agentStateRoot))) {
    stores.push(
      await pruneStore(storePath, applySessionHotsetProjection, ttlMs),
    );
  }
  // A store that is absent everywhere is not success. Releases that keep
  // Sessions in SQLite never have the central directory this strategy
  // projects, so every store is "missing" and nothing was evicted; reporting
  // ok=true there hides that the pre-start step is a no-op.
  const projected = stores.filter((entry) => entry.skipped === undefined);
  const invalid = stores.filter((entry) => entry.skipped === "invalid-json");
  const outcome =
    invalid.length > 0
      ? "invalid-store"
      : projected.length > 0
        ? "projected"
        : stores.length > 0 &&
            stores.every((entry) => entry.skipped === "missing")
          ? "no-central-store"
          : "nothing-to-project";
  const report = {
    ok: outcome === "projected",
    outcome,
    ...(outcome === "no-central-store" && {
      note:
        "No agent has sessions/sessions.json. This OpenClaw release stores " +
        "Sessions in SQLite and evicts skillsSnapshot/systemPromptReport " +
        "natively; the pre-start projection is a no-op here.",
    }),
    strategy: "central-directory-cold-derived-state-v1",
    ttlMs,
    stores,
    totals: {
      sessionCountBefore: stores.reduce(
        (sum, entry) => sum + (entry.sessionCountBefore ?? 0),
        0,
      ),
      sessionCountAfter: stores.reduce(
        (sum, entry) => sum + (entry.sessionCountAfter ?? 0),
        0,
      ),
      changedEntries: stores.reduce(
        (sum, entry) => sum + (entry.changedEntries ?? 0),
        0,
      ),
      beforeBytes: stores.reduce(
        (sum, entry) => sum + (entry.beforeBytes ?? 0),
        0,
      ),
      afterBytes: stores.reduce(
        (sum, entry) => sum + (entry.afterBytes ?? 0),
        0,
      ),
    },
  };
  const reportPath = process.env.OPENCLAW_SESSION_HOTSET_REPORT;
  if (reportPath) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
