#!/usr/bin/env node

import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));

const distDir = resolve(args.get("--dist") || "");
const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
const dryRun = args.has("--dry-run");

if (!args.get("--dist")) {
  throw new Error("Usage: apply-workboard-owner-concurrency-patch.mjs --dist=/path/to/openclaw/dist [--backup-dir=/path] [--dry-run]");
}

const before = `const DEFAULT_DISPATCH_MAX_STARTS = 3;`;
const beforeSelection = `if ((runningByOwner.get(owner) ?? 0) > 0) continue;\n\t\tselected.push(card);\n\t\trunningByOwner.set(owner, 1);`;
const after = `const DEFAULT_DISPATCH_MAX_STARTS = 3;\nconst DEFAULT_DISPATCH_MAX_PER_OWNER = 3;`;
const afterSelection = `if ((runningByOwner.get(owner) ?? 0) >= DEFAULT_DISPATCH_MAX_PER_OWNER) continue;\n\t\tselected.push(card);\n\t\trunningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);`;

const candidates = readdirSync(distDir)
  .filter((name) => /^runtime-api-.*\.js$/.test(name))
  .map((name) => join(distDir, name));
const matches = candidates.filter((file) => {
  const source = readFileSync(file, "utf8");
  return source.includes(beforeSelection) || source.includes(afterSelection);
});

if (matches.length !== 1) {
  throw new Error(`Expected exactly one Workboard runtime bundle, found ${matches.length}`);
}

const file = matches[0];
const source = readFileSync(file, "utf8");
if (source.includes(afterSelection) && source.includes("DEFAULT_DISPATCH_MAX_PER_OWNER")) {
  process.stdout.write(JSON.stringify({ changed: false, file, status: "already-patched" }) + "\n");
  process.exit(0);
}
if (!source.includes(before) || !source.includes(beforeSelection)) {
  throw new Error("OpenClaw Workboard dispatcher shape changed; refusing to patch");
}

const updated = source.replace(before, after).replace(beforeSelection, afterSelection);
if (updated === source || !updated.includes(afterSelection)) {
  throw new Error("Patch verification failed");
}

if (!dryRun) {
  if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
  const backupFile = join(backupDir, file.split("/").at(-1));
  copyFileSync(file, backupFile);
  writeFileSync(file, updated);
}

process.stdout.write(JSON.stringify({ changed: !dryRun, dryRun, file, maxPerOwner: 3 }) + "\n");
