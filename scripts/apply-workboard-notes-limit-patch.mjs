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
const limit = Number(args.get("--limit") || 12000);

if (!args.get("--dist") || !Number.isSafeInteger(limit) || limit < 4000) {
  throw new Error("Usage: apply-workboard-notes-limit-patch.mjs --dist=/path/to/openclaw/dist [--backup-dir=/path] [--limit=12000] [--dry-run]");
}

const original = `if (notes.length > 4e3) throw new Error("notes must be 4000 characters or fewer.");`;
const patched = `if (notes.length > ${limit}) throw new Error("notes must be ${limit} characters or fewer.");`;
const candidates = readdirSync(distDir)
  .filter((name) => /^runtime-api-.*\.js$/.test(name))
  .map((name) => join(distDir, name));
const matches = candidates.filter((file) => {
  const source = readFileSync(file, "utf8");
  return source.includes(original) || source.includes(patched);
});

if (matches.length !== 1) {
  throw new Error(`Expected exactly one Workboard runtime bundle, found ${matches.length}`);
}

const file = matches[0];
const source = readFileSync(file, "utf8");
if (source.includes(patched)) {
  process.stdout.write(`${JSON.stringify({ changed: false, file, limit, status: "already-patched" })}\n`);
  process.exit(0);
}
if (!source.includes(original)) {
  throw new Error("OpenClaw Workboard notes validation shape changed; refusing to patch");
}

const updated = source.replace(original, patched);
if (updated === source || !updated.includes(patched) || updated.includes(original)) {
  throw new Error("Patch verification failed");
}

if (!dryRun) {
  if (!backupDir) throw new Error("--backup-dir is required unless --dry-run is used");
  copyFileSync(file, join(backupDir, file.split("/").at(-1)));
  writeFileSync(file, updated);
}

process.stdout.write(`${JSON.stringify({ changed: !dryRun, dryRun, file, limit })}\n`);
