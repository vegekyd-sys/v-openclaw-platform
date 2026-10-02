import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const TRIAL_TRACE_ENV = "OPENCLAW_GPT_LIVE_PROGRESS_TRACE";
export const TRIAL_TRACE_BYTES = Buffer.from('[Service]\nEnvironment="OPENCLAW_GPT_LIVE_PROGRESS_TRACE=1"\n');
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sides = new Set(["before", "after"]);
const backup = (dir, side) => {
  assert(sides.has(side), "Invalid trial trace direction");
  return path.join(dir, `trial-trace.${side}.conf`);
};
function dropinPath(unit, systemdRoot) {
  assert(/^[\w.-]+\.service$/u.test(unit), "Invalid trial service");
  assert(path.isAbsolute(systemdRoot) && fs.realpathSync(systemdRoot) === systemdRoot, "Trial systemd directory must be canonical");
  const directory = path.join(systemdRoot, `${unit}.d`);
  try { assert(fs.lstatSync(directory).isDirectory() && fs.realpathSync(directory) === directory, "Trial drop-in directory must not be a symlink"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return path.join(directory, "90-gpt-live-pr154.conf");
}
function state(file) {
  try {
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), "Trial trace drop-in must be a regular file");
    return { exists: true, sha256: sha(fs.readFileSync(file)), stat: { uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777 } };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, sha256: null, stat: null };
    throw error;
  }
}
function environmentValue(environment) {
  const value = environment[TRIAL_TRACE_ENV] ?? null;
  assert(value === null || value === "" || value === "0" || value === "1", "Existing trial trace environment is not a boolean flag");
  return value;
}
function privateBackup(file, bytes) {
  fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  fs.chmodSync(file, 0o600);
  assert.equal(fs.statSync(file).uid, process.getuid(), "Trial trace backup owner changed");
}
export function stageTrialTrace({ unit, releaseDir, enabled, environment, systemdRoot = "/run/systemd/system" }) {
  assert.equal(typeof enabled, "boolean", "Trial trace must be explicitly boolean");
  if (!enabled) return { enabled: false };
  const file = dropinPath(unit, systemdRoot), before = state(file);
  const directoryExisted = fs.existsSync(path.dirname(file));
  if (before.exists) privateBackup(backup(releaseDir, "before"), fs.readFileSync(file));
  privateBackup(backup(releaseDir, "after"), TRIAL_TRACE_BYTES);
  assert.deepEqual(state(file), before, "Trial trace changed during staging");
  return { enabled: true, unit, dropinPath: file, directoryExisted, before,
    after: { exists: true, sha256: sha(TRIAL_TRACE_BYTES), stat: { uid: process.getuid(), gid: process.getgid(), mode: 0o600 } },
    beforeEnvironment: environmentValue(environment), afterEnvironment: "1" };
}
function assertBackups(transaction, releaseDir) {
  assert.equal(transaction.after.sha256, sha(TRIAL_TRACE_BYTES), "Trial trace is not the fixed metadata-only flag");
  assert.deepEqual(transaction.after.stat, { uid: process.getuid(), gid: process.getgid(), mode: 0o600 }, "Trial trace target ownership changed");
  for (const side of sides) {
    const expected = transaction[side], file = backup(releaseDir, side);
    assert.equal(typeof expected.exists, "boolean", "Trial trace manifest state is unavailable");
    if (!expected.exists) {
      assert.equal(expected.sha256, null); assert.equal(expected.stat, null);
      assert(!fs.existsSync(file), "An absent trace source has unexpected backup bytes");
      continue;
    }
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600 && stat.uid === process.getuid(), "Trial trace backup is not private");
    assert.equal(sha(fs.readFileSync(file)), expected.sha256, "Trial trace backup changed");
  }
}
export function assertTrialTrace({ transaction, releaseDir, unit, enabled, environment, side, systemdRoot = "/run/systemd/system" }) {
  assert(transaction && sides.has(side), "Trial trace transaction is unavailable");
  assert.equal(transaction.enabled, enabled, "Trial trace policy changed");
  if (!enabled) { assert.deepEqual(transaction, { enabled: false }); return; }
  assert.equal(transaction.unit, unit, "Trial trace service changed");
  assert.equal(transaction.dropinPath, dropinPath(unit, systemdRoot), "Trial trace path changed");
  assertBackups(transaction, releaseDir);
  assert.deepEqual(state(transaction.dropinPath), transaction[side], "Trial trace source changed");
  assert.equal(environmentValue(environment), side === "before" ? transaction.beforeEnvironment : transaction.afterEnvironment,
    "Trial trace process environment mismatch");
}
export function installTrialTrace(transaction, releaseDir, from, to, { systemdRoot = "/run/systemd/system" } = {}) {
  assert(sides.has(from) && sides.has(to), "Invalid trial trace direction");
  if (!transaction.enabled) { assert.deepEqual(transaction, { enabled: false }); return; }
  const file = dropinPath(transaction.unit, systemdRoot);
  assert.equal(transaction.dropinPath, file, "Trial trace path changed");
  assertBackups(transaction, releaseDir);
  assert.deepEqual(state(file), transaction[from], "Trial trace source changed before installation");
  const target = transaction[to];
  if (!target.exists) {
    fs.unlinkSync(file);
    if (!transaction.directoryExisted && fs.readdirSync(path.dirname(file)).length === 0) fs.rmdirSync(path.dirname(file));
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 });
    const temporary = `${file}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(temporary, fs.readFileSync(backup(releaseDir, to)), { flag: "wx", mode: 0o600 });
      fs.chownSync(temporary, target.stat.uid, target.stat.gid); fs.chmodSync(temporary, target.stat.mode);
      fs.renameSync(temporary, file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  assert.deepEqual(state(file), target, "Trial trace installation mismatch");
}
export function restoreTrialTrace(transaction, releaseDir, from, to, options) {
  if (!transaction.enabled) return;
  const file = dropinPath(transaction.unit, options?.systemdRoot ?? "/run/systemd/system");
  assert.equal(transaction.dropinPath, file, "Trial trace path changed");
  if (JSON.stringify(state(file)) === JSON.stringify(transaction[from])) return;
  assert.deepEqual(state(file), transaction[to], "Trial trace changed outside the failed transaction");
  installTrialTrace(transaction, releaseDir, to, from, options);
}
