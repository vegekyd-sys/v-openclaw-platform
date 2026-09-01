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
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const configPath = readFlag("--config");
const from = readFlag("--from");
const to = readFlag("--to");
for (const [name, value] of [
  ["--config", configPath],
  ["--from", from],
  ["--to", to],
]) {
  if (!isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
}

const text = readFileSync(configPath, "utf8");
const config = JSON.parse(text);
const paths = config?.plugins?.load?.paths;
if (!Array.isArray(paths)) {
  throw new Error("plugins.load.paths must be an array");
}
const matches = paths.filter((entry) => entry === from).length;
if (matches !== 1) {
  throw new Error(`expected one source plugin path, found ${matches}`);
}
if (paths.includes(to)) {
  throw new Error("destination plugin path is already configured");
}

const fromLiteral = JSON.stringify(from);
const toLiteral = JSON.stringify(to);
const literalMatches = text.split(fromLiteral).length - 1;
if (literalMatches !== 1) {
  throw new Error(`expected one serialized source path, found ${literalMatches}`);
}
const nextText = text.replace(fromLiteral, toLiteral);
JSON.parse(nextText);

const currentStat = statSync(configPath);
const currentMode = currentStat.mode & 0o777;
const tempPath = resolve(
  dirname(configPath),
  `.${basename(configPath)}.release-${process.pid}-${Date.now()}`,
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
  `${JSON.stringify({ ok: true, configPath, from, to })}\n`,
);
