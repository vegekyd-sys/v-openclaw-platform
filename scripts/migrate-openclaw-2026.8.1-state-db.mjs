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
    if (arg === "--database") options.database = argv[++index];
    else if (arg === "--openclaw-root") options.openClawRoot = argv[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  if (!options.database || !options.openClawRoot) {
    fail("Usage: --database <path> --openclaw-root <path>");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const database = path.resolve(options.database);
  const openClawRoot = path.resolve(options.openClawRoot);
  const packageJsonPath = path.join(openClawRoot, "node_modules", "openclaw", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (packageJson.version !== "2026.8.1") {
    fail(`Expected OpenClaw 2026.8.1, found ${packageJson.version ?? "unknown"}`);
  }
  if (!fs.statSync(database).isFile()) fail(`State database is not a file: ${database}`);

  const distDir = path.join(openClawRoot, "node_modules", "openclaw", "dist");
  const moduleNames = fs
    .readdirSync(distDir)
    .filter(
      (name) =>
        /^openclaw-state-db-[A-Za-z0-9_-]+\.js$/.test(name) &&
        !name.startsWith("openclaw-state-db-contract-") &&
        !name.startsWith("openclaw-state-db-readonly-") &&
        !name.startsWith("openclaw-state-db-schema-migration-required-"),
    );
  if (moduleNames.length !== 1) {
    fail(`Expected one OpenClaw state DB module, found ${moduleNames.length}`);
  }

  const stateModule = await import(pathToFileURL(path.join(distDir, moduleNames[0])).href);
  if (typeof stateModule.o !== "function") {
    fail("OpenClaw 2026.8.1 schema-only repair export was not found");
  }

  const result = await stateModule.o({
    path: database,
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: path.dirname(path.dirname(database)),
    },
  });
  if (result.warnings?.length > 0) {
    fail(`Schema repair warnings: ${result.warnings.join("; ")}`);
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, database, changes: result.changes ?? [] }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
