#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { configs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--config") options.configs.push(argv[++index]);
    else if (argv[index] === "--root") options.root = argv[++index];
    else fail(`Unknown argument: ${argv[index]}`);
  }
  if (!options.root || options.configs.length === 0) {
    fail("Usage: --root <candidate-workspace-root> --config <path> [--config <path>]");
  }
  return options;
}

function workspaceId(workspacePath) {
  return crypto.createHash("sha256").update(path.resolve(workspacePath)).digest("hex");
}

function linkDirectoryContents(source, target, exclusions = new Set()) {
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (exclusions.has(entry.name)) continue;
    const destination = path.join(target, entry.name);
    if (!fs.existsSync(destination)) fs.symlinkSync(path.join(source, entry.name), destination);
  }
}

function buildMirror(source, root) {
  const resolvedSource = path.resolve(source);
  const mirror = path.join(root, workspaceId(resolvedSource));
  if (!fs.statSync(resolvedSource).isDirectory()) fail(`Workspace is not a directory: ${resolvedSource}`);
  fs.mkdirSync(mirror, { recursive: true, mode: 0o700 });
  linkDirectoryContents(
    resolvedSource,
    mirror,
    new Set(["openclaw-workspace-state.json", ".openclaw"]),
  );

  const legacyRootState = path.join(resolvedSource, "openclaw-workspace-state.json");
  if (fs.existsSync(legacyRootState)) {
    fs.copyFileSync(legacyRootState, path.join(mirror, "openclaw-workspace-state.json"));
  }

  const sourceOpenClaw = path.join(resolvedSource, ".openclaw");
  if (fs.existsSync(sourceOpenClaw)) {
    const mirrorOpenClaw = path.join(mirror, ".openclaw");
    linkDirectoryContents(sourceOpenClaw, mirrorOpenClaw, new Set(["workspace-state.json"]));
    const legacyNestedState = path.join(sourceOpenClaw, "workspace-state.json");
    if (fs.existsSync(legacyNestedState)) {
      fs.copyFileSync(legacyNestedState, path.join(mirrorOpenClaw, "workspace-state.json"));
    }
  }
  return mirror;
}

const options = parseArgs(process.argv.slice(2));
const root = path.resolve(options.root);
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const mirrors = new Map();

for (const configPath of options.configs) {
  const resolvedConfig = path.resolve(configPath);
  const config = JSON.parse(fs.readFileSync(resolvedConfig, "utf8"));
  const rewrite = (workspace) => {
    if (typeof workspace !== "string" || workspace.length === 0) return workspace;
    const source = path.resolve(workspace);
    if (source.startsWith(`${root}${path.sep}`)) return source;
    if (!mirrors.has(source)) mirrors.set(source, buildMirror(source, root));
    return mirrors.get(source);
  };

  for (const entry of Object.values(config.agents.entries ?? {})) {
    if (entry && typeof entry === "object" && "workspace" in entry) {
      entry.workspace = rewrite(entry.workspace);
    }
  }
  const defaultWorkspace = config.agents.defaults.workspace;
  config.agents.defaults.workspace =
    typeof defaultWorkspace === "string" && fs.existsSync(defaultWorkspace)
      ? rewrite(defaultWorkspace)
      : config.agents.entries?.makaron?.workspace ?? defaultWorkspace;

  const temporary = `${resolvedConfig}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, resolvedConfig);
}

process.stdout.write(
  `${JSON.stringify({ ok: true, root, mirrors: [...mirrors.entries()].map(([source, target]) => ({ source, target })) })}\n`,
);
