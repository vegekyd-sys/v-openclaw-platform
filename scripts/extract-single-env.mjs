#!/usr/bin/env node
import {
  chmodSync,
  chownSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

const [, , sourcePath, destinationPath, variableName, uidText, gidText] =
  process.argv;
if (!sourcePath || !destinationPath || !variableName) {
  throw new Error(
    "usage: extract-single-env.mjs <source> <destination> <variable> [uid] [gid]",
  );
}
if (!/^[A-Z][A-Z0-9_]*$/.test(variableName)) {
  throw new Error("variable name is invalid");
}

const matches = readFileSync(sourcePath, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.startsWith(`${variableName}=`));
if (matches.length !== 1 || matches[0] === `${variableName}=`) {
  throw new Error(`expected exactly one non-empty ${variableName} assignment`);
}

const tempPath = resolve(
  dirname(destinationPath),
  `.${basename(destinationPath)}.${process.pid}.${Date.now()}`,
);
try {
  writeFileSync(tempPath, `${matches[0]}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(tempPath, 0o600);
  if (uidText !== undefined || gidText !== undefined) {
    const uid = Number(uidText ?? -1);
    const gid = Number(gidText ?? -1);
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) {
      throw new Error("uid and gid must be integers");
    }
    chownSync(tempPath, uid, gid);
  }
  renameSync(tempPath, destinationPath);
} catch (error) {
  try {
    unlinkSync(tempPath);
  } catch {
    // Preserve the original extraction failure.
  }
  throw error;
}

process.stdout.write(
  `${JSON.stringify({ ok: true, variableName, destinationPath })}\n`,
);
