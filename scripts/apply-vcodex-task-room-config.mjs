#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
  chmodSync,
  chownSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));

const configPath = args.get("--config") ? resolve(args.get("--config")) : null;
const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
const dryRun = args.has("--dry-run");

if (!configPath) {
  throw new Error("Usage: --config=/path/openclaw.json [--backup-dir=/path] [--dry-run]");
}
if (!dryRun && !backupDir) throw new Error("--backup-dir is required unless --dry-run is used");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const source = readFileSync(configPath, "utf8");
const config = JSON.parse(source);
const makaron = (config.agents?.list ?? []).find((entry) => entry?.id === "makaron");
if (!makaron) throw new Error("Refusing to patch: agents.list[makaron] is missing");
if (config.plugins?.entries?.codex?.enabled !== true) {
  throw new Error("Refusing to patch: the official Codex plugin is not enabled");
}

makaron.models ??= {};
const targetModel = "openai/gpt-5.6-sol";
const expectedModel = {
  alias: "vcodex",
  params: { thinking: "medium" },
  agentRuntime: { id: "codex" },
};
const existingModel = makaron.models[targetModel];
if (existingModel && JSON.stringify(existingModel) !== JSON.stringify(expectedModel)) {
  throw new Error(`Refusing to overwrite an unexpected makaron model policy for ${targetModel}`);
}
makaron.models[targetModel] = expectedModel;

const updated = `${JSON.stringify(config, null, 2)}\n`;
const beforeSha256 = sha256(source);
const afterSha256 = sha256(updated);
const changed = source !== updated;

if (!dryRun && changed) {
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupFile = join(backupDir, `${basename(configPath)}.${beforeSha256}.before`);
  if (!existsSync(backupFile)) copyFileSync(configPath, backupFile);

  const originalStat = statSync(configPath);
  const tempPath = join(dirname(configPath), `.${basename(configPath)}.vcodex-${process.pid}.tmp`);
  writeFileSync(tempPath, updated, { mode: originalStat.mode });
  chmodSync(tempPath, originalStat.mode);
  chownSync(tempPath, originalStat.uid, originalStat.gid);
  renameSync(tempPath, configPath);
}

process.stdout.write(`${JSON.stringify({
  changed: changed && !dryRun,
  dryRun,
  configPath,
  beforeSha256,
  afterSha256,
  model: targetModel,
  alias: "vcodex",
  runtime: "codex",
  status: !changed ? "already-configured" : dryRun ? "would-configure" : "configured",
})}\n`);
