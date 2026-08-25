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
const maxPerOwner = positiveInteger(args.get("--max-per-owner"), 36);
const maxTotal = positiveInteger(args.get("--max-total"), 36);

if (!args.get("--dist")) {
  throw new Error("Usage: apply-workboard-owner-concurrency-patch.mjs --dist=/path/to/openclaw/dist [--backup-dir=/path] [--max-per-owner=36] [--max-total=36] [--dry-run]");
}

const candidates = readdirSync(distDir)
  .filter((name) => /^runtime-api-.*\.js$/.test(name))
  .map((name) => join(distDir, name));
const matches = candidates.filter((file) => readFileSync(file, "utf8").includes("workboard.cards.dispatch"));

if (matches.length !== 1) {
  throw new Error(`Expected exactly one Workboard runtime bundle, found ${matches.length}`);
}

const file = matches[0];
const source = readFileSync(file, "utf8");
const marker = `const DEFAULT_DISPATCH_MAX_TOTAL = ${maxTotal};`;
const maxStartsForwarding = "maxStarts: typeof maxStarts === \"number\" ? maxStarts : void 0,";
if (source.includes(marker) &&
    source.includes(`const DEFAULT_DISPATCH_MAX_PER_OWNER = ${maxPerOwner};`) &&
    source.includes(maxStartsForwarding)) {
  process.stdout.write(JSON.stringify({ changed: false, file, maxPerOwner, maxTotal, status: "already-patched" }) + "\n");
  process.exit(0);
}

let updated = source;
updated = patchConstants(updated, { maxPerOwner, maxTotal });
updated = patchOwnerAndTotalSelection(updated);
updated = patchGatewayMaxStartsForwarding(updated);

if (updated === source || !updated.includes(marker) || !updated.includes(maxStartsForwarding)) {
  throw new Error("Patch verification failed");
}

if (!dryRun) {
  if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
  const backupFile = join(backupDir, file.split("/").at(-1));
  copyFileSync(file, backupFile);
  writeFileSync(file, updated);
}

process.stdout.write(JSON.stringify({ changed: !dryRun, dryRun, file, maxPerOwner, maxTotal }) + "\n");

function patchConstants(value, limits) {
  const constants = /const DEFAULT_DISPATCH_MAX_STARTS = 3;(?:\nconst DEFAULT_DISPATCH_MAX_PER_OWNER = \d+;)?(?:\nconst DEFAULT_DISPATCH_MAX_TOTAL = \d+;)?/;
  if (!constants.test(value)) throw new Error("OpenClaw Workboard dispatch constants changed; refusing to patch");
  return value.replace(constants, [
    "const DEFAULT_DISPATCH_MAX_STARTS = 3;",
    `const DEFAULT_DISPATCH_MAX_PER_OWNER = ${limits.maxPerOwner};`,
    `const DEFAULT_DISPATCH_MAX_TOTAL = ${limits.maxTotal};`,
  ].join("\n"));
}

function patchOwnerAndTotalSelection(value) {
  let updated = value;
  const unpatchedOwner = "if ((runningByOwner.get(owner) ?? 0) > 0) continue;\n\t\tselected.push(card);\n\t\trunningByOwner.set(owner, 1);";
  const patchedOwner = "if ((runningByOwner.get(owner) ?? 0) >= DEFAULT_DISPATCH_MAX_PER_OWNER) continue;\n\t\tselected.push(card);\n\t\trunningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);";
  if (updated.includes(unpatchedOwner)) updated = updated.replace(unpatchedOwner, patchedOwner);
  if (!updated.includes(patchedOwner)) throw new Error("OpenClaw Workboard owner selection changed; refusing to patch");

  const totalInit = "const selected = [];\n\tlet runningTotal = [...runningByOwner.values()].reduce((sum, count) => sum + count, 0);";
  if (!updated.includes(totalInit)) {
    updated = updated.replace("const selected = [];\n\tfor (const card of candidates.filter", `${totalInit}\n\tfor (const card of candidates.filter`);
  }
  const ownerCheck = "const owner = card.agentId ?? DEFAULT_DISPATCH_OWNER;\n\t\tif ((runningByOwner.get(owner) ?? 0) >= DEFAULT_DISPATCH_MAX_PER_OWNER) continue;";
  const totalCheck = "const owner = card.agentId ?? DEFAULT_DISPATCH_OWNER;\n\t\tif (runningTotal >= DEFAULT_DISPATCH_MAX_TOTAL) break;\n\t\tif ((runningByOwner.get(owner) ?? 0) >= DEFAULT_DISPATCH_MAX_PER_OWNER) continue;";
  if (!updated.includes(totalCheck)) updated = updated.replace(ownerCheck, totalCheck);
  const increment = "runningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);\n\t\trunningTotal += 1;";
  if (!updated.includes(increment)) {
    updated = updated.replace("runningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);\n\t\tif (selected.length >= limit) break;", `${increment}\n\t\tif (selected.length >= limit) break;`);
  }
  if (!updated.includes(totalInit) || !updated.includes(totalCheck) || !updated.includes(increment)) {
    throw new Error("OpenClaw Workboard total-cap selection changed; refusing to patch");
  }
  return updated;
}

function patchGatewayMaxStartsForwarding(value) {
  let updated = value;
  const boardLine = "const boardId = requestParams && typeof requestParams === \"object\" && \"boardId\" in requestParams ? requestParams.boardId : void 0;";
  const maxStartsLine = "const maxStarts = requestParams && typeof requestParams === \"object\" && \"maxStarts\" in requestParams ? requestParams.maxStarts : void 0;";
  if (!updated.includes(maxStartsLine)) updated = updated.replace(boardLine, `${boardLine}\n\t\t\t${maxStartsLine}`);
  if (!updated.includes(maxStartsForwarding)) {
    updated = updated.replace(
      "boardId: typeof boardId === \"string\" ? boardId : void 0,\n\t\t\t\t\tallowManagedWorktrees:",
      `boardId: typeof boardId === \"string\" ? boardId : void 0,\n\t\t\t\t\t${maxStartsForwarding}\n\t\t\t\t\tallowManagedWorktrees:`,
    );
  }
  if (!updated.includes(maxStartsLine) || !updated.includes(maxStartsForwarding)) {
    throw new Error("OpenClaw Workboard Gateway dispatch handler changed; refusing to patch");
  }
  return updated;
}

function positiveInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`Expected an integer between 1 and 100, received ${value}`);
  }
  return parsed;
}
