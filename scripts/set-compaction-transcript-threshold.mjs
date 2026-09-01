#!/usr/bin/env node
import {
  chmodSync,
  chownSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const configPath = readFlag("--config");
const value = readFlag("--value");
const unset = process.argv.includes("--unset");
if (!configPath || !isAbsolute(configPath)) {
  throw new Error("--config must be an absolute path");
}
if ((value === undefined) === !unset) {
  throw new Error("provide exactly one of --value or --unset");
}

const text = readFileSync(configPath, "utf8");
const config = JSON.parse(text);
const defaults = config?.agents?.defaults;
if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) {
  throw new Error("agents.defaults must be an object");
}
const compaction = defaults.compaction;
if (!compaction || typeof compaction !== "object" || Array.isArray(compaction)) {
  throw new Error("agents.defaults.compaction must be an object");
}
if (unset) {
  delete compaction.maxActiveTranscriptBytes;
} else {
  compaction.maxActiveTranscriptBytes = value;
}

const nextText = `${JSON.stringify(config, null, 2)}\n`;
const currentStat = statSync(configPath);
const currentMode = currentStat.mode & 0o777;
const tempPath = resolve(
  dirname(configPath),
  `.${basename(configPath)}.compaction-${process.pid}-${Date.now()}`,
);
try {
  writeFileSync(tempPath, nextText, {
    encoding: "utf8",
    mode: currentMode,
    flag: "wx",
  });
  chmodSync(tempPath, currentMode);
  chownSync(tempPath, currentStat.uid, currentStat.gid);
  renameSync(tempPath, configPath);
} catch (error) {
  try {
    unlinkSync(tempPath);
  } catch {
    // Best-effort cleanup; preserve the original update failure.
  }
  throw error;
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    configPath,
    action: unset ? "unset" : "set",
    value: unset ? undefined : value,
  })}\n`,
);
