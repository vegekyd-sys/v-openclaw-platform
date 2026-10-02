import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { stageTrialConfig, assertTrialConfig, installTrialConfig, installTrialRelease, validateTrialInstructions } from "./gpt-live-pr-config.mjs";
import { digest, PR_URL, PR_BRANCH, validatePrCandidate, buildPrController } from "./gpt-live-pr-provenance.mjs";
import { read, save, replace, name, sha, fingerprint, installFiles, assertVersion } from "./shared/files.mjs";

const instructions = "Keep complete backend dates and timezones unchanged.";
function setup(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gpt-live-config-test-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configPath = path.join(dir, "openclaw.json"), releaseDir = path.join(dir, "release");
  fs.mkdirSync(releaseDir, { mode: 0o700 });
  const original = Buffer.from('{\r\n "gateway":{"port":24993,"auth":{"token":"fake-local-secret"}}, "talk":{"provider":"volcengine","realtime":{"voice":"xiaohe","instructions":"original"}}, "plugins":{"other":{"enabled":true}}\r\n}\r\n');
  fs.writeFileSync(configPath, original, { mode: 0o640 }); fs.chmodSync(configPath, 0o640);
  const transaction = stageTrialConfig({ configPath, releaseDir, instructions, instructionsSha: digest(instructions), beforeSha: digest(original) });
  const check = side => assertTrialConfig({ transaction, releaseDir, configPath, instructions, instructionsSha: digest(instructions), side });
  return { dir, configPath, releaseDir, original, transaction, check };
}

test("stage stores private original bytes, changes only instructions, and returns no configuration content", t => {
  const f = setup(t);
  assert.deepEqual(fs.readFileSync(f.configPath), f.original);
  assert.deepEqual(fs.readFileSync(path.join(f.releaseDir, "trial-config.before.json")), f.original);
  for (const side of ["before", "after"]) {
    const stat = fs.statSync(path.join(f.releaseDir, `trial-config.${side}.json`));
    assert.equal(stat.mode & 0o777, 0o600); assert.equal(stat.uid, process.getuid());
  }
  const before = JSON.parse(f.original), after = read(path.join(f.releaseDir, "trial-config.after.json"));
  const expected = structuredClone(before); expected.talk.realtime.instructions = instructions;
  assert.deepEqual(after, expected);
  assert.equal(JSON.stringify(f.transaction).includes("fake-local-secret"), false);
  assert.equal(JSON.stringify(f.transaction).includes(instructions), false);
  f.check("before");
});

test("deploy and rollback restore exact C0 bytes and ownership/mode", t => {
  const f = setup(t); const stat = fs.statSync(f.configPath);
  installTrialConfig(f.transaction, f.releaseDir, "before", "after"); f.check("after");
  installTrialConfig(f.transaction, f.releaseDir, "after", "before"); f.check("before");
  assert.deepEqual(fs.readFileSync(f.configPath), f.original);
  const restored = fs.statSync(f.configPath);
  assert.equal(restored.uid, stat.uid); assert.equal(restored.gid, stat.gid); assert.equal(restored.mode & 0o777, stat.mode & 0o777);
});

test("instructions require the exact policy SHA and cannot be an object", () => {
  for (const value of [undefined, {}, "", "changed"]) assert.throws(() => validateTrialInstructions(value, digest(instructions)));
});

test("backup changes and additional provider changes are rejected without exposing credentials", t => {
  const f = setup(t), afterPath = path.join(f.releaseDir, "trial-config.after.json");
  const changed = read(afterPath); changed.talk.provider = "openai";
  fs.writeFileSync(afterPath, JSON.stringify(changed));
  assert.throws(() => f.check("before"), /backup changed/);
  f.transaction.after = digest(fs.readFileSync(afterPath));
  assert.throws(() => f.check("before"), /changes more than realtime instructions/);
  assert.deepEqual(fs.readFileSync(f.configPath), f.original);
});

test("live config or permission drift fails before installation", t => {
  const f = setup(t);
  fs.chmodSync(f.configPath, 0o644);
  assert.throws(() => f.check("before"), /ownership or permissions/);
  fs.chmodSync(f.configPath, 0o640); fs.appendFileSync(f.configPath, " ");
  assert.throws(() => installTrialConfig(f.transaction, f.releaseDir, "before", "after"), /source changed/);
  assert.deepEqual(fs.readFileSync(f.configPath), Buffer.concat([f.original, Buffer.from(" ")]));
});

function lifecycle(f, { failInstall = false, failStart = false, failReady = false } = {}) {
  let stopped = false, code = "before", starts = 0;
  const trace = [];
  return {
    trace, code: () => code,
    options: { transaction: f.transaction, releaseDir: f.releaseDir, from: "before", to: "after",
      stop: () => { stopped = true; trace.push("stop"); },
      installCode: side => { assert(stopped); code = side; trace.push(`code:${side}`); if (failInstall && side === "after") throw new Error("fixture install failure"); },
      start: () => { trace.push("start"); if (failStart && starts++ === 0) throw new Error("fixture start failure"); stopped = false; },
      waitReady: side => { trace.push(`ready:${side}`); assert(!stopped); f.check(side); if (failReady && side === "after") throw new Error("fixture readiness failure"); },
    },
  };
}

test("code installation failure restores source files/config before restart", async t => {
  const f = setup(t), state = lifecycle(f, { failInstall: true });
  await assert.rejects(installTrialRelease(state.options), /fixture install failure/);
  assert.equal(state.code(), "before"); f.check("before");
  assert.deepEqual(state.trace, ["stop", "code:after", "stop", "code:before", "start", "ready:before"]);
});

test("atomic configuration write failure removes temporary file and restores source code", async t => {
  const f = setup(t), state = lifecycle(f), originalRename = fs.renameSync;
  fs.renameSync = (source, target) => { if (target === f.configPath) throw new Error("fixture atomic write failure"); return originalRename(source, target); };
  try { await assert.rejects(installTrialRelease(state.options), /fixture atomic write failure/); }
  finally { fs.renameSync = originalRename; }
  assert.equal(state.code(), "before"); f.check("before");
  assert.equal(fs.readdirSync(f.dir).some(name => name.includes(".gpt-live-pr-")), false);
});

for (const failure of ["failStart", "failReady"]) {
  test(`${failure} after C1 installation restores exact source bytes and code`, async t => {
    const f = setup(t), state = lifecycle(f, { [failure]: true });
    await assert.rejects(installTrialRelease(state.options), /fixture/);
    assert.equal(state.code(), "before"); f.check("before");
    assert.deepEqual(fs.readFileSync(f.configPath), f.original);
    assert(state.trace.includes("ready:before"));
  });
}

test("failed rollback restores its C1 source and code, rather than leaving mixed versions", async t => {
  const f = setup(t); installTrialConfig(f.transaction, f.releaseDir, "before", "after");
  const state = lifecycle(f);
  state.options.from = "after"; state.options.to = "before";
  const ready = state.options.waitReady;
  state.options.waitReady = side => { ready(side); if (side === "before") throw new Error("fixture rollback readiness failure"); };
  await assert.rejects(installTrialRelease(state.options), /fixture rollback readiness/);
  assert.equal(state.code(), "after"); f.check("after");
});

test("external config drift during recovery is preserved and reported for journal recovery", async t => {
  const f = setup(t), state = lifecycle(f);
  state.options.waitReady = side => {
    if (side === "after") { fs.appendFileSync(f.configPath, " "); throw new Error("fixture readiness failure"); }
  };
  await assert.rejects(installTrialRelease(state.options), /source recovery requires attention; journal retained/);
  assert.equal(fs.readFileSync(f.configPath, "utf8").endsWith(" "), true);
  assert.equal(state.code(), "before");
});

// Execute the actual generated cutover against real temporary config/runtime
// bytes. Only systemd, Gateway readiness and the idle-fence transport are fake.
function controllerFixture(t) {
  const f = setup(t), workflow = path.join(f.dir, "workflow"), runtime = path.join(f.dir, "runtime");
  const id = "gpt-live-trial", releaseDir = path.join(workflow, "releases", id);
  fs.mkdirSync(path.dirname(releaseDir), { recursive: true }); fs.renameSync(f.releaseDir, releaseDir); f.releaseDir = releaseDir;
  fs.mkdirSync(path.join(runtime, "openclaw/dist"), { recursive: true });
  fs.mkdirSync(path.join(releaseDir, "before")); fs.mkdirSync(path.join(releaseDir, "after"));
  const codeBefore = Buffer.from("export const value=0;\n"), codeAfter = Buffer.from("export const value=1;\n");
  fs.writeFileSync(path.join(runtime, "openclaw/dist/test.mjs"), codeBefore, { mode: 0o644 });
  fs.writeFileSync(path.join(releaseDir, "before/0"), codeBefore); fs.writeFileSync(path.join(releaseDir, "after/0"), codeAfter);
  const files = [{ target: "openclaw/dist/test.mjs", before: digest(codeBefore), after: digest(codeAfter), content: codeAfter.toString("base64") }];
  const policy = { prUrl: PR_URL, branch: PR_BRANCH, owner: "trial-owner", releaseId: id, sourceCommit: "a".repeat(40), baseRelease: "parent", filesSha: digest(JSON.stringify(files)), trialInstructionsSha: digest(instructions) };
  const artifact = { command: "stage", owner: policy.owner, id, branch: PR_BRANCH, sourceCommit: policy.sourceCommit, baseRelease: "parent", candidatePr: { url: PR_URL, head: policy.sourceCommit, productionAuthorized: false }, files, trialInstructions: instructions };
  save(path.join(releaseDir, "artifact.json"), artifact);
  const parent = { release: "parent", runtimeSha: fingerprint(runtime).sha256, accepted: true, v: { aligned: true } };
  const manifest = { id, baseRelease: "parent", parent, sourceCommit: policy.sourceCommit, candidatePr: artifact.candidatePr, artifactSha: digest(fs.readFileSync(path.join(releaseDir, "artifact.json"))), configSha: f.transaction.before, trialConfig: f.transaction, files: files.map(({ content, ...file }) => file) };
  save(path.join(releaseDir, "manifest.json"), manifest); save(path.join(workflow, "current.json"), parent);
  const source = buildPrController(fs.readFileSync(new URL("./shared/server.mjs", import.meta.url), "utf8"));
  const start = source.indexOf("async function cutover("), end = source.indexOf("\nasync function main(", start);
  const build = new Function("deps", `const {fs,assert,HOME,RUNTIME,UNIT,PR_POLICY,read,save,replace,name,sha,fingerprint,installFiles,assertVersion,validatePrCandidate,assertTrialConfig,installTrialRelease,lease,current,live,pid,connect,acquireIdleFence,run,rpc,delay,Date}=deps;\n${source.slice(start, end)}\nreturn cutover;`);
  let running = 123, clock = 1_000_000, targetHealthFails = false;
  const trace = [];
  class Clock extends Date { constructor() { super(clock); } static now() { return clock++; } }
  const live = () => ({ pid: running, configSha: digest(fs.readFileSync(f.configPath)), env: { OPENCLAW_CONFIG_PATH: f.configPath } });
  const cutover = build({ fs, assert, HOME: workflow, RUNTIME: runtime, UNIT: "test-unit", PR_POLICY: policy,
    read, save, replace, name, sha, fingerprint, installFiles, assertVersion, validatePrCandidate, assertTrialConfig, installTrialRelease,
    lease: owner => { assert.equal(owner, policy.owner); trace.push("lease"); },
    current: () => read(path.join(workflow, "current.json")), live, pid: () => running,
    connect: async () => ({ l: live(), c: { stop: () => trace.push("close") }, call: async () => ({}) }),
    acquireIdleFence: async () => { trace.push("fence"); return { suspensionId: "fixture-fence" }; },
    run: (bin, args) => { assert.equal(bin, "systemctl"); assert.equal(args[1], "test-unit"); trace.push(args[0]); running = args[0] === "stop" ? 0 : 124; },
    rpc: async () => { if (targetHealthFails && live().configSha === f.transaction.after) throw new Error("fixture cold failure"); return { ok: true }; },
    delay: async () => { clock += 900001; }, Date: Clock,
  });
  return { ...f, workflow, runtime, trace, cutover, id, policy, failHealth: () => { targetHealthFails = true; } };
}

test("generated private controller deploy/rollback uses target config SHA and restores parent fingerprint", async t => {
  const f = controllerFixture(t);
  const deployed = await f.cutover({ owner: f.policy.owner, id: f.id });
  assert.equal(deployed.configSha, f.transaction.after); assert.equal(deployed.current.accepted, false);
  assert.equal(fs.existsSync(path.join(f.workflow, "pending.json")), false);
  const rolledBack = await f.cutover({ owner: f.policy.owner, id: f.id }, true);
  assert.equal(rolledBack.configSha, f.transaction.before); assert.equal(rolledBack.current.release, "parent");
  assert.deepEqual(fs.readFileSync(f.configPath), f.original);
  assert.equal(fs.existsSync(path.join(f.workflow, "pending.json")), false);
  assert.equal(f.trace.filter(step => step === "fence").length, 2);
});

test("generated controller cold failure restores source code/config and retains recovery journal", async t => {
  const f = controllerFixture(t); f.failHealth();
  await assert.rejects(f.cutover({ owner: f.policy.owner, id: f.id }), /source recovery required/);
  assert.deepEqual(fs.readFileSync(f.configPath), f.original);
  assert.equal(read(path.join(f.workflow, "current.json")).release, "parent");
  assert.equal(fingerprint(f.runtime).sha256, read(path.join(f.workflow, "current.json")).runtimeSha);
  assert.equal(fs.existsSync(path.join(f.workflow, "pending.json")), true);
  assert(f.trace.includes("close"));
});
