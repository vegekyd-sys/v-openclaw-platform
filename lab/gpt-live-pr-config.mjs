import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sides = new Set(["before", "after"]);
const backupPath = (dir, side) => {
  assert(sides.has(side), "Invalid trial configuration side");
  return path.join(dir, `trial-config.${side}.json`);
};
export function validateTrialInstructions(instructions, expectedSha) {
  assert(typeof instructions === "string" && instructions.trim() && Buffer.byteLength(instructions) <= 65536,
    "Trial instructions must be one non-empty string of at most 64 KiB");
  assert(/^[a-f0-9]{64}$/.test(expectedSha ?? ""), "Trial instructions SHA is unavailable");
  assert.equal(sha(instructions), expectedSha, "Trial instructions changed after verification");
}

function parseConfig(bytes) {
  let config;
  try { config = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("Trial configuration is not valid JSON"); }
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  assert(object(config), "Trial configuration must be an object");
  assert(config.talk === undefined || object(config.talk), "Talk configuration must be an object");
  assert(config.talk?.realtime === undefined || object(config.talk.realtime), "Realtime Talk configuration must be an object");
  return config;
}

export function buildTrialConfigBytes(before, instructions) {
  const config = parseConfig(before);
  config.talk ??= {};
  config.talk.realtime ??= {};
  config.talk.realtime.instructions = instructions;
  return Buffer.from(JSON.stringify(config, null, 2) + "\n");
}

function liveStat(configPath) {
  assert(path.isAbsolute(configPath), "Trial configuration path must be absolute");
  assert.equal(fs.realpathSync(configPath), configPath, "Trial configuration path must be canonical");
  const stat = fs.lstatSync(configPath);
  assert(stat.isFile() && !stat.isSymbolicLink(), "Trial configuration must be a regular file");
  return { uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777 };
}

export function stageTrialConfig({ configPath, releaseDir, instructions, instructionsSha, beforeSha }) {
  validateTrialInstructions(instructions, instructionsSha);
  const stat = liveStat(configPath);
  const before = fs.readFileSync(configPath);
  assert.equal(sha(before), beforeSha, "Configuration changed during trial staging");
  const after = buildTrialConfigBytes(before, instructions);
  for (const [side, bytes] of [["before", before], ["after", after]]) {
    const file = backupPath(releaseDir, side);
    fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
    fs.chmodSync(file, 0o600);
    assert.equal(fs.statSync(file).uid, process.getuid(), "Trial configuration backup owner changed");
  }
  assert.equal(sha(fs.readFileSync(configPath)), beforeSha, "Configuration changed during trial staging");
  // No config bytes, credentials or instructions are returned to the client.
  return { configPath, before: beforeSha, after: sha(after), stat, instructionsSha };
}

export function assertTrialConfig({ transaction, releaseDir, configPath, instructions, instructionsSha, side }) {
  assert(transaction && sides.has(side), "Trial configuration transaction is unavailable");
  validateTrialInstructions(instructions, instructionsSha);
  assert.equal(transaction.instructionsSha, instructionsSha, "Trial configuration policy changed");
  assert.equal(transaction.configPath, configPath, "Trial configuration path changed");
  for (const name of sides) {
    const file = backupPath(releaseDir, name), stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600,
      "Trial configuration backup is not private");
    assert.equal(stat.uid, process.getuid(), "Trial configuration backup owner changed");
    assert.equal(sha(fs.readFileSync(file)), transaction[name], `Trial configuration ${name} backup changed`);
  }
  const before = fs.readFileSync(backupPath(releaseDir, "before"));
  assert.equal(sha(buildTrialConfigBytes(before, instructions)), transaction.after,
    "Trial configuration changes more than realtime instructions");
  assert.deepEqual(liveStat(configPath), transaction.stat, "Trial configuration ownership or permissions changed");
  assert.equal(sha(fs.readFileSync(configPath)), transaction[side], `Trial configuration source ${side} changed`);
}

export function installTrialConfig(transaction, releaseDir, from, to) {
  assert(sides.has(from) && sides.has(to), "Invalid trial configuration direction");
  const configPath = transaction.configPath;
  assert.deepEqual(liveStat(configPath), transaction.stat, "Trial configuration ownership or permissions changed");
  assert.equal(sha(fs.readFileSync(configPath)), transaction[from], "Trial configuration source changed before installation");
  const bytes = fs.readFileSync(backupPath(releaseDir, to));
  assert.equal(sha(bytes), transaction[to], "Trial configuration target backup changed");
  const temporary = `${configPath}.gpt-live-pr-${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
    fs.chownSync(temporary, transaction.stat.uid, transaction.stat.gid);
    fs.chmodSync(temporary, transaction.stat.mode);
    fs.renameSync(temporary, configPath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  assert.equal(sha(fs.readFileSync(configPath)), transaction[to], "Trial configuration installation mismatch");
}

function restoreSourceConfig(transaction, releaseDir, from, to) {
  const current = sha(fs.readFileSync(transaction.configPath));
  if (current === transaction[from]) return;
  assert.equal(current, transaction[to], "Trial configuration changed outside the failed transaction");
  installTrialConfig(transaction, releaseDir, to, from);
}

// The caller holds the existing shared lease, operation lock and idle fence.
// Recovery performs another stop before restoring; it never hot-writes config.
export async function installTrialRelease({ transaction, releaseDir, from, to, stop, start, installCode, waitReady }) {
  try {
    await stop();
    await installCode(to);
    installTrialConfig(transaction, releaseDir, from, to);
    await start();
    await waitReady(to);
  } catch (error) {
    try {
      await stop();
      const failures = [];
      try { restoreSourceConfig(transaction, releaseDir, from, to); } catch (failure) { failures.push(failure); }
      try { await installCode(from); } catch (failure) { failures.push(failure); }
      await start();
      if (failures.length) throw new AggregateError(failures, "PR trial source restoration failed");
      await waitReady(from);
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], "PR trial failed and source recovery requires attention; journal retained");
    }
    throw error;
  }
}
