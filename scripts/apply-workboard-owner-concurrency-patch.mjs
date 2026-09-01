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
  return source.includes(beforeSelection) ||
    source.includes(afterSelection) ||
    (source.includes("workboard.cards.dispatch") && source.includes("async function runWorkboardDispatch(params)"));
});

if (matches.length !== 1) throw new Error(`Expected exactly one Workboard runtime bundle, found ${matches.length}`);

const file = matches[0];
const source = readFileSync(file, "utf8");
if (source.includes("async function runWorkboardDispatch(params)")) {
  const updated = patch2026081(source);
  if (updated === source) {
    process.stdout.write(JSON.stringify({ changed: false, file, maxPerOwner: 3, status: "already-patched" }) + "\n");
    process.exit(0);
  }
  if (!dryRun) {
    if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
    copyFileSync(file, join(backupDir, file.split("/").at(-1)));
    writeFileSync(file, updated);
  }
  process.stdout.write(JSON.stringify({ changed: !dryRun, dryRun, file, maxPerOwner: 3 }) + "\n");
  process.exit(0);
}
if (source.includes(afterSelection) && source.includes("DEFAULT_DISPATCH_MAX_PER_OWNER")) {
  process.stdout.write(JSON.stringify({ changed: false, file, status: "already-patched" }) + "\n");
  process.exit(0);
}
if (!source.includes(before) || !source.includes(beforeSelection)) {
  throw new Error("OpenClaw Workboard dispatcher shape changed; refusing to patch");
}

const updated = source.replace(before, after).replace(beforeSelection, afterSelection);
if (updated === source || !updated.includes(afterSelection)) throw new Error("Patch verification failed");

if (!dryRun) {
  if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
  const backupFile = join(backupDir, file.split("/").at(-1));
  copyFileSync(file, backupFile);
  writeFileSync(file, updated);
}

process.stdout.write(JSON.stringify({ changed: !dryRun, dryRun, file, maxPerOwner: 3 }) + "\n");

function patch2026081(value) {
  const limit = "const DEFAULT_DISPATCH_MAX_PER_OWNER = 3;";
  const patchedGuard = "(runningByOwner.get(owner) ?? 0) >= DEFAULT_DISPATCH_MAX_PER_OWNER";
  const patchedOwners = "const startedOwners = /* @__PURE__ */ new Map();";
  if (value.includes(limit) && value.includes(patchedGuard) && value.includes(patchedOwners)) return value;
  if (!value.includes(before)) throw new Error("OpenClaw 2026.8.1 dispatch constant changed; refusing to patch");
  let updated = value.replace(before, `${before}\n${limit}`);
  const guard = "(runningByOwner.get(owner) ?? 0) > 0";
  if (!updated.includes(guard)) throw new Error("OpenClaw 2026.8.1 owner guard changed; refusing to patch");
  updated = updated.replace(guard, patchedGuard);
  const owners = "const startedOwners = /* @__PURE__ */ new Set();";
  if (!updated.includes(owners)) throw new Error("OpenClaw 2026.8.1 started-owner state changed; refusing to patch");
  updated = updated.replace(owners, patchedOwners);
  const startGuard = "if (startedOwners.has(ownerId)) continue;";
  if (!updated.includes(startGuard)) throw new Error("OpenClaw 2026.8.1 started-owner guard changed; refusing to patch");
  updated = updated.replace(startGuard, "if ((startedOwners.get(ownerId) ?? 0) >= DEFAULT_DISPATCH_MAX_PER_OWNER) continue;");
  const addOwner = "startedOwners.add(ownerId);";
  if (!updated.includes(addOwner)) throw new Error("OpenClaw 2026.8.1 started-owner update changed; refusing to patch");
  updated = updated.replace(addOwner, "startedOwners.set(ownerId, (startedOwners.get(ownerId) ?? 0) + 1);");
  return updated;
}
