#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") options.config = argv[++index];
    else if (arg === "--openclaw-root") options.openClawRoot = argv[++index];
    else if (arg === "--state-dir") options.stateDir = argv[++index];
    else if (arg === "--expected-source-count") {
      options.expectedSourceCount = Number(argv[++index]);
    } else if (arg === "--apply") options.apply = true;
    else fail(`Unknown argument: ${arg}`);
  }
  if (!options.config || !options.openClawRoot || !options.stateDir) {
    fail(
      "Usage: --config <path> --openclaw-root <path> --state-dir <path> " +
        "--expected-source-count <n> [--apply]",
    );
  }
  if (!Number.isSafeInteger(options.expectedSourceCount) || options.expectedSourceCount < 0) {
    fail("--expected-source-count must be a non-negative integer");
  }
  return options;
}

function resolveDoctorMigrationModule(openClawRoot) {
  const distDir = path.join(openClawRoot, "node_modules", "openclaw", "dist");
  const matches = fs
    .readdirSync(distDir)
    .filter((name) => /^state-migrations\.doctor-[A-Za-z0-9_]+\.js$/.test(name));
  if (matches.length !== 1) {
    fail(`Expected one OpenClaw Doctor migration bundle, found ${matches.length}`);
  }
  return path.join(distDir, matches[0]);
}

function disableUnrelatedMigration(detection) {
  if (!detection || typeof detection !== "object" || !("hasLegacy" in detection)) {
    return detection;
  }
  const next = { ...detection };
  next.hasLegacy = false;
  for (const key of ["sources", "plans", "preview", "legacyKeys"]) {
    if (Array.isArray(next[key])) next[key] = [];
  }
  if ("sourcePresent" in next) next.sourcePresent = false;
  return next;
}

const options = parseArgs(process.argv.slice(2));
const config = JSON.parse(fs.readFileSync(options.config, "utf8"));
const migrationConfig = {
  agents: config.agents,
  session: config.session,
  channels: {},
  // Importing the Doctor bundle registers built-in plugin migrations.  This
  // cutover is intentionally limited to OpenClaw's workspace state, so deny
  // every plugin migration at the config boundary as well as filtering the
  // detected result below.  Without this, Memory Core can move its event log
  // even when the returned plugin plan was removed before apply.
  plugins: { allow: [], deny: ["memory-core"], entries: {} },
};
const stateDir = path.resolve(options.stateDir);
const env = { ...process.env, OPENCLAW_STATE_DIR: stateDir };
const legacySessionSurfaces = { failures: [], surfaces: [] };
const migrationModule = await import(
  pathToFileURL(resolveDoctorMigrationModule(options.openClawRoot)).href
);

const detected = await migrationModule.detectLegacyStateMigrations({
  cfg: migrationConfig,
  mode: "doctor",
  doctorOnlyStateMigrations: true,
  legacySessionSurfaces,
  env,
});
const workspaceSources = detected.workspace?.sources ?? [];
const detectedPluginIds = (detected.pluginPlans?.plans ?? [])
  .map((plan) => plan.pluginId)
  .filter((pluginId) => typeof pluginId === "string")
  .sort();
if (workspaceSources.length !== options.expectedSourceCount) {
  fail(
    `Workspace source count changed: expected ${options.expectedSourceCount}, got ${workspaceSources.length}`,
  );
}

const skippedLegacyCategories = Object.entries(detected)
  .filter(
    ([key, value]) =>
      key !== "workspace" &&
      value &&
      typeof value === "object" &&
      value.hasLegacy === true,
  )
  .map(([key]) => key)
  .sort();

if (!options.apply) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: "dry-run",
        stateDir,
        workspaceSources: workspaceSources.map((source) => ({
          kind: source.kind,
          sourcePath: source.sourcePath,
          workspaceKey: source.workspaceKey,
          workspaceDir: source.workspaceDir,
        })),
        skippedLegacyCategories,
        detectedPluginIds,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const targeted = { ...detected };
for (const [key, value] of Object.entries(targeted)) {
  if (key !== "workspace") targeted[key] = disableUnrelatedMigration(value);
}
targeted.warnings = [];
targeted.notices = [];
targeted.preview = [];

const result = await migrationModule.runLegacyStateMigrations({
  detected: targeted,
  config: migrationConfig,
  env,
  doctorOnlyStateMigrations: true,
  legacySessionSurfaces,
});
const unrelatedMemoryCoreWarnings = (result.warnings ?? []).filter(
  (warning) =>
    warning.startsWith("Skipped unsafe Memory Core host event source for ") ||
    warning ===
      "An old writer recreated the Memory Core host event source; rerun openclaw doctor --fix to import the retained rows",
);
const workspaceWarnings = (result.warnings ?? []).filter(
  (warning) => !unrelatedMemoryCoreWarnings.includes(warning),
);
if (workspaceWarnings.length) {
  fail(`Workspace migration warnings: ${JSON.stringify(workspaceWarnings)}`);
}
const unexpectedChanges = (result.changes ?? []).filter(
  (change) =>
    !/^Migrated workspace (setup state|attestation) to SQLite\.$/.test(change) &&
    !/^Verified canonical SQLite workspace (setup state|attestation)\.$/.test(change),
);
if (unexpectedChanges.length > 0) {
  fail(`Unexpected migration changes: ${JSON.stringify(unexpectedChanges)}`);
}

const after = await migrationModule.detectLegacyStateMigrations({
  cfg: migrationConfig,
  mode: "doctor",
  doctorOnlyStateMigrations: true,
  legacySessionSurfaces,
  env,
});
if (after.workspace?.hasLegacy || (after.workspace?.sources?.length ?? 0) !== 0) {
  fail("Legacy workspace state remained after verified migration");
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      mode: "apply",
      stateDir,
      migratedSourceCount: workspaceSources.length,
      changes: result.changes ?? [],
      notices: result.notices ?? [],
      ignoredUnrelatedMemoryCoreWarnings: unrelatedMemoryCoreWarnings,
      skippedLegacyCategories,
      detectedPluginIds,
    },
    null,
    2,
  )}\n`,
);
