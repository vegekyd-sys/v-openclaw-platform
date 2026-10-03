import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { stageTrialTrace, assertTrialTrace, installTrialTrace, restoreTrialTrace, TRIAL_TRACE_ENV, TRIAL_TRACE_BYTES } from "./gpt-live-pr-trace.mjs";
import { stageTrialConfig, installTrialRelease, assertTrialConfig } from "./gpt-live-pr-config.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t, { original } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gpt-live-trace-test-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const unit = "fixture.service", systemdRoot = path.join(dir, "systemd"), releaseDir = path.join(dir, "release");
  fs.mkdirSync(systemdRoot); fs.mkdirSync(releaseDir, { mode: 0o700 });
  const directory = path.join(systemdRoot, unit + ".d"), file = path.join(directory, "90-gpt-live-pr154.conf");
  fs.mkdirSync(directory); const unrelated = path.join(directory, "91-other-task.conf");
  const unrelatedBytes = Buffer.from('[Service]\nEnvironment="OTHER_TASK=keep"\n'); fs.writeFileSync(unrelated, unrelatedBytes);
  if (original !== undefined) { fs.writeFileSync(file, original, { mode: 0o640 }); fs.chmodSync(file, 0o640); }
  const environment = original === undefined ? {} : { [TRIAL_TRACE_ENV]: "0" };
  const transaction = stageTrialTrace({ unit, systemdRoot, releaseDir, enabled: true, environment });
  const check = (side, env = side === "after" ? { [TRIAL_TRACE_ENV]: "1" } : environment) =>
    assertTrialTrace({ transaction, releaseDir, unit, enabled: true, environment: env, side, systemdRoot });
  const install = (from, to) => installTrialTrace(transaction, releaseDir, from, to, { systemdRoot });
  return { dir, unit, systemdRoot, releaseDir, file, directory, unrelated, unrelatedBytes, original, environment, transaction, check, install };
}

test("trace staging returns metadata only and never installs the dedicated drop-in", t => {
  const original = Buffer.from('[Service]\r\nEnvironment="PRIVATE_PLACEHOLDER=fake-secret"\r\n');
  const f = fixture(t, { original }); f.check("before");
  assert.deepEqual(fs.readFileSync(f.file), original);
  assert.deepEqual(fs.readFileSync(path.join(f.releaseDir, "trial-trace.before.conf")), original);
  assert.deepEqual(fs.readFileSync(path.join(f.releaseDir, "trial-trace.after.conf")), TRIAL_TRACE_BYTES);
  for (const side of ["before", "after"]) {
    const stat = fs.statSync(path.join(f.releaseDir, `trial-trace.${side}.conf`));
    assert.equal(stat.mode & 0o777, 0o600); assert.equal(stat.uid, process.getuid());
  }
  assert.equal(JSON.stringify(f.transaction).includes("fake-secret"), false);
  assert.equal(f.transaction.afterEnvironment, "1");
});

test("default-off trace performs no filesystem or environment mutation", t => {
  const f = fixture(t); const before = fs.readdirSync(f.releaseDir);
  const disabled = stageTrialTrace({ enabled: false });
  assert.deepEqual(disabled, { enabled: false });
  assertTrialTrace({ transaction: disabled, enabled: false, side: "before" });
  installTrialTrace(disabled, f.releaseDir, "before", "after");
  restoreTrialTrace(disabled, f.releaseDir, "before", "after");
  assert.deepEqual(fs.readdirSync(f.releaseDir), before); assert.equal(fs.existsSync(f.file), false);
});

for (const original of [undefined, Buffer.from('[Service]\r\nEnvironment="OPENCLAW_GPT_LIVE_PROGRESS_TRACE=0"\r\n')]) {
  test(`trace deploy/rollback preserves ${original === undefined ? "absent state" : "exact bytes and mode"} and every other task's file`, t => {
    const f = fixture(t, { original }); const before = original === undefined ? undefined : fs.statSync(f.file);
    f.install("before", "after"); f.check("after");
    assert.deepEqual(fs.readFileSync(f.file), TRIAL_TRACE_BYTES);
    f.install("after", "before"); f.check("before");
    if (original === undefined) assert.equal(fs.existsSync(f.file), false);
    else {
      assert.deepEqual(fs.readFileSync(f.file), original); const stat = fs.statSync(f.file);
      assert.equal(stat.uid, before.uid); assert.equal(stat.gid, before.gid); assert.equal(stat.mode & 0o777, before.mode & 0o777);
    }
    assert.deepEqual(fs.readFileSync(f.unrelated), f.unrelatedBytes);
  });
}

test("trace validates the actual process flag, policy, target path and fixed after bytes", t => {
  const f = fixture(t);
  assert.throws(() => f.check("before", { [TRIAL_TRACE_ENV]: "1" }), /process environment mismatch/);
  assert.throws(() => assertTrialTrace({ transaction: f.transaction, enabled: false, side: "before" }), /policy changed/);
  const actualPath = f.transaction.dropinPath; f.transaction.dropinPath = f.unrelated;
  assert.throws(() => f.install("before", "after"), /path changed/); f.transaction.dropinPath = actualPath;
  const afterFile = path.join(f.releaseDir, "trial-trace.after.conf"); fs.writeFileSync(afterFile, '[Service]\nEnvironment="ARBITRARY=value"\n');
  assert.throws(() => f.check("before"), /backup changed/);
  f.transaction.after.sha256 = sha(fs.readFileSync(afterFile));
  assert.throws(() => f.check("before"), /fixed metadata-only flag/);
});

test("trace rejects live source drift and preserves unknown changes during recovery", t => {
  const f = fixture(t); f.install("before", "after"); fs.appendFileSync(f.file, "# another writer\n");
  assert.throws(() => f.check("after"), /source changed/);
  assert.throws(() => restoreTrialTrace(f.transaction, f.releaseDir, "before", "after", { systemdRoot: f.systemdRoot }), /outside the failed transaction/);
  assert(fs.readFileSync(f.file, "utf8").endsWith("# another writer\n"));
});

test("failed atomic drop-in installation removes its temporary bytes and preserves source", t => {
  const f = fixture(t), rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (to === f.file) throw new Error("fixture drop-in rename failure"); return rename(from, to); };
  try { assert.throws(() => f.install("before", "after"), /drop-in rename failure/); }
  finally { fs.renameSync = rename; }
  f.check("before"); assert.equal(fs.existsSync(f.file), false);
  assert.equal(fs.readdirSync(f.directory).some(name => name.includes(".tmp-")), false);
  assert.deepEqual(fs.readFileSync(f.unrelated), f.unrelatedBytes);
});

test("trace rejects symlink files and symlink drop-in directories", t => {
  const f = fixture(t);
  fs.symlinkSync(f.unrelated, f.file);
  assert.throws(() => f.check("before"), /regular file/); fs.unlinkSync(f.file);
  const target = path.join(f.dir, "outside"); fs.mkdirSync(target); fs.renameSync(f.directory, path.join(target, "moved")); fs.symlinkSync(path.join(target, "moved"), f.directory);
  assert.throws(() => f.install("before", "after"), /must not be a symlink/);
});

test("trace removes only its newly created empty drop-in directory on rollback", t => {
  const f = fixture(t); fs.rmSync(f.directory, { recursive: true });
  const release = path.join(f.dir, "second-release"); fs.mkdirSync(release);
  const transaction = stageTrialTrace({ unit: f.unit, systemdRoot: f.systemdRoot, releaseDir: release, enabled: true, environment: {} });
  installTrialTrace(transaction, release, "before", "after", { systemdRoot: f.systemdRoot });
  installTrialTrace(transaction, release, "after", "before", { systemdRoot: f.systemdRoot });
  assert.equal(fs.existsSync(f.directory), false);
});

for (const failure of ["install", "reload", "start", "ready"]) {
  test(`a trace ${failure} failure restores config, trace and code before the recovery restart`, async t => {
    const f = fixture(t), configPath = path.join(f.dir, "config.json");
    const originalConfig = Buffer.from('{"talk":{"realtime":{"instructions":"before"}}}\n'); fs.writeFileSync(configPath, originalConfig);
    const instructions = "Only report complete facts.";
    const config = stageTrialConfig({ configPath, releaseDir: f.releaseDir, instructions, instructionsSha: sha(instructions), beforeSha: sha(originalConfig) });
    let stopped = false, code = "before", failed = false, currentEnv = {}, loadedEnv = {}, reloads = 0;
    const trace = [];
    const fail = phase => { if (!failed && failure === phase) { failed = true; throw new Error("fixture trace " + phase + " failure"); } };
    await assert.rejects(installTrialRelease({ transaction: config, releaseDir: f.releaseDir, from: "before", to: "after",
      stop: () => { stopped = true; trace.push("stop"); },
      installCode: side => { assert(stopped); code = side; trace.push("code:" + side); },
      installEnvironment: (from, to) => { assert(stopped); f.install(from, to); fail("install"); },
      restoreEnvironment: (from, to) => { assert(stopped); restoreTrialTrace(f.transaction, f.releaseDir, from, to, { systemdRoot: f.systemdRoot }); },
      reloadEnvironment: () => { assert(stopped); trace.push("reload"); reloads++; fail("reload"); loadedEnv = fs.existsSync(f.file) ? { [TRIAL_TRACE_ENV]: "1" } : {}; },
      start: () => { trace.push("start"); fail("start"); stopped = false; currentEnv = { ...loadedEnv }; },
      waitReady: side => { assert(!stopped); trace.push("ready:" + side); fail("ready");
        assertTrialConfig({ transaction: config, releaseDir: f.releaseDir, configPath, instructions, instructionsSha: sha(instructions), side }); f.check(side, currentEnv); },
    }), /fixture trace/);
    assert.equal(code, "before"); assert.equal(stopped, false); assert(reloads >= 1);
    assert.equal(fs.existsSync(f.file), false); assert.deepEqual(currentEnv, {}); assert.deepEqual(fs.readFileSync(configPath), originalConfig);
    assert(trace.includes("ready:before")); assert.equal(trace.filter(value => value === "stop").length, 2);
    assert.deepEqual(fs.readFileSync(f.unrelated), f.unrelatedBytes);
  });
}
