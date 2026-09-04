#!/usr/bin/env node

import {
  chmodSync,
  chownSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((entry) => {
    const [name, ...value] = entry.replace(/^--/, "").split("=");
    return [name, value.join("=") || true];
  }),
);

const configPath = args.config;
const backupDir = args["backup-dir"];
const dryRun = args["dry-run"] === true;

if (typeof configPath !== "string" || (!dryRun && typeof backupDir !== "string")) {
  throw new Error(
    "Usage: ensure-workboard-plugin-enabled.mjs --config=/path/openclaw.json --backup-dir=/path [--dry-run]",
  );
}

const originalText = readFileSync(configPath, "utf8");
const original = JSON.parse(originalText);
const next = structuredClone(original);

next.plugins ??= {};
next.plugins.entries ??= {};
next.plugins.entries.workboard = {
  ...(next.plugins.entries.workboard ?? {}),
  enabled: true,
};

if (Array.isArray(next.plugins.allow) && !next.plugins.allow.includes("workboard")) {
  next.plugins.allow.push("workboard");
}

const protectedBefore = protectedProjection(original);
const protectedAfter = protectedProjection(next);
if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) {
  throw new Error("Refusing to write: fields outside Workboard enablement changed");
}

const changed = JSON.stringify(original) !== JSON.stringify(next);
if (!dryRun && changed) {
  const originalStat = statSync(configPath);
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = join(backupDir, `${basename(configPath)}.before`);
  if (existsSync(backupPath)) throw new Error(`Backup already exists: ${backupPath}`);
  copyFileSync(configPath, backupPath);
  chmodSync(backupPath, originalStat.mode & 0o777);
  chownSync(backupPath, originalStat.uid, originalStat.gid);

  const temporaryPath = `${configPath}.workboard-next`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
    mode: originalStat.mode & 0o777,
  });
  // writeFile mode is filtered through the process umask. Restore the exact
  // source permissions before the atomic rename.
  chmodSync(temporaryPath, originalStat.mode & 0o777);
  chownSync(temporaryPath, originalStat.uid, originalStat.gid);
  renameSync(temporaryPath, configPath);

  const written = JSON.parse(readFileSync(configPath, "utf8"));
  if (JSON.stringify(protectedProjection(written)) !== JSON.stringify(protectedBefore)) {
    throw new Error("Post-write verification failed: protected configuration changed");
  }
}

process.stdout.write(
  `${JSON.stringify({
    status: dryRun ? "dry-run" : changed ? "updated" : "already-enabled",
    configPath,
    allowlistUpdated:
      Array.isArray(original.plugins?.allow) && !original.plugins.allow.includes("workboard"),
    workerCapacity: {
      maxConcurrent: next.agents?.defaults?.maxConcurrent ?? null,
      maxWorkers:
        next.plugins?.entries?.["vlab-agent-worker-isolation"]?.config?.maxWorkers ?? null,
      sessionsPerWorker:
        next.plugins?.entries?.["vlab-agent-worker-isolation"]?.config?.sessionsPerWorker ?? null,
    },
  })}\n`,
);

function protectedProjection(config) {
  const copy = structuredClone(config);
  const entries = copy.plugins?.entries;
  if (entries?.workboard) {
    delete entries.workboard.enabled;
    if (Object.keys(entries.workboard).length === 0) delete entries.workboard;
  }
  if (Array.isArray(copy.plugins?.allow)) {
    copy.plugins.allow = copy.plugins.allow.filter((entry) => entry !== "workboard");
  }
  return copy;
}
