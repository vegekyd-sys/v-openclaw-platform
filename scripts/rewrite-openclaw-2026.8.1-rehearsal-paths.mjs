#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--state-dir") options.stateDir = argv[++index];
    else if (arg === "--source-state-dir") options.sourceStateDir = argv[++index];
    else if (arg === "--config") options.config = argv[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  if (!options.stateDir || !options.sourceStateDir || !options.config) {
    fail("Usage: --state-dir <copy> --source-state-dir <live> --config <copy/openclaw.json>");
  }
  return options;
}

function rewriteString(value, sourceRoot, targetRoot) {
  if (value === sourceRoot) return targetRoot;
  if (value.startsWith(`${sourceRoot}${path.sep}`)) {
    return `${targetRoot}${value.slice(sourceRoot.length)}`;
  }
  return value;
}

function rewriteJsonValue(value, sourceRoot, targetRoot, stats) {
  if (typeof value === "string") {
    const next = rewriteString(value, sourceRoot, targetRoot);
    if (next !== value) stats.configPaths += 1;
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteJsonValue(entry, sourceRoot, targetRoot, stats));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        rewriteJsonValue(entry, sourceRoot, targetRoot, stats),
      ]),
    );
  }
  return value;
}

function listSessionStores(stateDir) {
  const agentsDir = path.join(stateDir, "agents");
  if (!fs.existsSync(agentsDir)) return [];
  return fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(agentsDir, entry.name, "sessions", "sessions.json"))
    .filter((pathname) => fs.existsSync(pathname))
    .sort();
}

function writeJsonAtomic(pathname, value) {
  const temporary = `${pathname}.rewrite-${process.pid}`;
  const original = fs.statSync(pathname);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temporary, original.mode & 0o777);
  fs.chownSync(temporary, original.uid, original.gid);
  fs.renameSync(temporary, pathname);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(options.sourceStateDir);
  const targetRoot = path.resolve(options.stateDir);
  const configPath = path.resolve(options.config);
  if (sourceRoot === targetRoot) fail("Source and rehearsal state directories must differ");
  if (!targetRoot.startsWith(`${path.dirname(targetRoot)}${path.sep}`)) {
    fail("Invalid rehearsal state directory");
  }
  if (!configPath.startsWith(`${targetRoot}${path.sep}`)) {
    fail("Refusing to rewrite a config outside the rehearsal state directory");
  }

  const stats = { configPaths: 0, sessionStores: 0, sessionPaths: 0, sessions: 0 };
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rewrittenConfig = rewriteJsonValue(config, sourceRoot, targetRoot, stats);
  writeJsonAtomic(configPath, rewrittenConfig);

  for (const storePath of listSessionStores(targetRoot)) {
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    for (const [sessionKey, entry] of Object.entries(store)) {
      stats.sessions += 1;
      if (!entry || typeof entry !== "object" || typeof entry.sessionFile !== "string") continue;
      const nextPath = rewriteString(entry.sessionFile, sourceRoot, targetRoot);
      if (nextPath === entry.sessionFile) {
        if (nextPath === targetRoot || nextPath.startsWith(`${targetRoot}${path.sep}`)) continue;
        fail(`Session path is outside the source state directory: ${sessionKey}`);
      }
      entry.sessionFile = nextPath;
      stats.sessionPaths += 1;
    }
    writeJsonAtomic(storePath, store);
    stats.sessionStores += 1;
  }

  process.stdout.write(`${JSON.stringify({ ok: true, sourceRoot, targetRoot, ...stats }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
}
