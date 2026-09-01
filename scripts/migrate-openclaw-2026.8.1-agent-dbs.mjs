#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--state-dir") options.stateDir = argv[++index];
    else if (arg === "--openclaw-root") options.openClawRoot = argv[++index];
    else if (arg === "--lease-ms") options.leaseMs = Number(argv[++index]);
    else fail(`Unknown argument: ${arg}`);
  }
  if (!options.stateDir || !options.openClawRoot) {
    fail("Usage: --state-dir <path> --openclaw-root <path> [--lease-ms <milliseconds>]");
  }
  options.leaseMs ??= 3_600_000;
  if (!Number.isSafeInteger(options.leaseMs) || options.leaseMs < 60_000) {
    fail("--lease-ms must be an integer of at least 60000");
  }
  return options;
}

function findOne(distDir, pattern, label) {
  const matches = fs.readdirSync(distDir).filter((name) => pattern.test(name));
  if (matches.length !== 1) fail(`Expected one ${label} module, found ${matches.length}`);
  return path.join(distDir, matches[0]);
}

function findOneContaining(distDir, pattern, marker, label) {
  const matches = fs
    .readdirSync(distDir)
    .filter((name) => pattern.test(name))
    .filter((name) => fs.readFileSync(path.join(distDir, name), "utf8").includes(marker));
  if (matches.length !== 1) fail(`Expected one ${label} module, found ${matches.length}`);
  return path.join(distDir, matches[0]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stateDir = path.resolve(options.stateDir);
  const openClawRoot = path.resolve(options.openClawRoot);
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(openClawRoot, "node_modules", "openclaw", "package.json"), "utf8"),
  );
  if (packageJson.version !== "2026.8.1") {
    fail(`Expected OpenClaw 2026.8.1, found ${packageJson.version ?? "unknown"}`);
  }

  const distDir = path.join(openClawRoot, "node_modules", "openclaw", "dist");
  const runtimePath = findOneContaining(
    distDir,
    /^openclaw-agent-db-[A-Za-z0-9_-]+\.js$/,
    "withAgentDatabaseMaintenanceLease };",
    "agent DB runtime",
  );
  const maintenancePath = findOne(
    distDir,
    /^openclaw-agent-db-maintenance-[A-Za-z0-9_-]+\.js$/,
    "agent DB maintenance",
  );
  const stateLeasePath = findOne(
    distDir,
    /^openclaw-state-lease-[A-Za-z0-9_-]+\.js$/,
    "state lease",
  );
  const runtime = await import(pathToFileURL(runtimePath).href);
  const maintenance = await import(pathToFileURL(maintenancePath).href);
  const stateLease = await import(pathToFileURL(stateLeasePath).href);
  if (
    typeof runtime.withAgentDatabaseMaintenanceLease !== "function" ||
    typeof runtime.listOpenClawRegisteredAgentDatabases !== "function" ||
    typeof runtime.migrateOpenClawAgentDatabaseForMaintenance !== "function" ||
    typeof stateLease.n !== "function" ||
    typeof maintenance.J !== "function" ||
    typeof maintenance.G !== "function"
  ) {
    fail("OpenClaw 2026.8.1 agent DB maintenance exports were not found");
  }

  const env = { ...process.env, OPENCLAW_STATE_DIR: stateDir };
  const before = runtime.listOpenClawRegisteredAgentDatabases({
    env,
    includeIncompatibleSchemaVersions: true,
  });
  if (before.length === 0) {
    process.stdout.write(`${JSON.stringify({ ok: true, migrated: [] }, null, 2)}\n`);
    return;
  }
  for (const entry of before) {
    const resolved = path.resolve(entry.path);
    if (resolved !== stateDir && !resolved.startsWith(`${stateDir}${path.sep}`)) {
      fail(`Refusing to migrate agent DB outside state dir: ${resolved}`);
    }
  }

  await stateLease.n(
    {
      scope: maintenance.W.scope,
      key: maintenance.W.key,
      database: { scope: "shared", options: { env } },
      leaseMs: options.leaseMs,
      waitMs: 5_000,
      leaseLabel: "agent database maintenance lease",
      operationLabel: "agent.database.maintenance.lease",
    },
    (authority) =>
      maintenance.J(authority, () => {
        maintenance.G(authority, { env });
        for (const entry of before) {
          runtime.migrateOpenClawAgentDatabaseForMaintenance({
            agentId: entry.agentId,
            pathname: entry.path,
          });
          if (typeof maintenance.R === "function") {
            maintenance.R({ agentId: entry.agentId, path: entry.path, env });
          }
        }
      }),
  );

  const after = runtime.listOpenClawRegisteredAgentDatabases({
    env,
    includeIncompatibleSchemaVersions: true,
  });
  const migrated = after.map((entry) => ({
    agentId: entry.agentId,
    path: entry.path,
    schemaVersion: entry.schemaVersion,
  }));
  const incomplete = migrated.filter((entry) => entry.schemaVersion !== 19);
  if (incomplete.length > 0) {
    fail(`Agent DB registry did not reach schema 19 for: ${incomplete.map((entry) => entry.agentId).join(", ")}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, migrated }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
