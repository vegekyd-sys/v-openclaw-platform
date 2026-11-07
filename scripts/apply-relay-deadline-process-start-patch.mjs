#!/usr/bin/env node
// `openclaw hooks relay` denies a Codex tool call when the Gateway does not answer before --timeout
// (hook budget minus 1 s), but counts from when its own code starts. Codex kills the hook at the full
// budget and then runs the tool. So a relay that started more than 1 s late (a loaded host, the hook
// runs under `nice`) never gets to deny, and the policy fails open: docs/codex-default-harness-rollout.md.
//
// With this patch the deadline counts from process start, so the deny still comes first. A relay that
// takes the whole budget just to start is not covered.

import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MARKER = "v-relay-deadline-process-start-v1";
const before = "\tconst deadline = createNativeHookRelayDeadline(timeoutMs);\n";
const after = `\t// ${MARKER}\n\tconst deadline = createNativeHookRelayDeadline(Math.max(1, timeoutMs - Math.ceil(process.uptime() * 1e3)));\n`;

export function patchRelayDeadline(source) {
  if (source.includes(MARKER)) return { changed: false, source };
  if (source.split(before).length !== 2) throw new Error("OpenClaw relay CLI shape changed; refusing to patch");
  return { changed: true, source: source.replace(before, after) };
}

function main() {
  const args = new Map(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.split("=");
    return [key, rest.join("=")];
  }));
  if (!args.get("--dist")) throw new Error("Usage: apply-relay-deadline-process-start-patch.mjs --dist=/path/to/openclaw/dist [--backup-dir=/path|--no-backup] [--dry-run]");
  const distDir = resolve(args.get("--dist"));
  const dryRun = args.has("--dry-run");
  const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
  const matches = readdirSync(distDir).filter((name) => /^native-hook-relay-cli-.*\.js$/.test(name)).map((name) => join(distDir, name)).filter((file) => readFileSync(file, "utf8").includes("createNativeHookRelayDeadline"));
  if (matches.length !== 1) throw new Error(`Expected exactly one relay CLI, found ${matches.length}`);
  const [file] = matches;
  const { changed, source } = patchRelayDeadline(readFileSync(file, "utf8"));
  if (changed && !dryRun) {
    if (backupDir) copyFileSync(file, join(backupDir, basename(file)));
    else if (!args.has("--no-backup")) throw new Error("--backup-dir or --no-backup is required unless --dry-run is used");
    writeFileSync(file, source);
  }
  process.stdout.write(`${JSON.stringify({ changed: changed && !dryRun, dryRun, file })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
