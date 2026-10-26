// lab/inter-session.plan.json, the one release of the inter-session work (design §11 WP12):
// every `before` is V's bytes, every `after` the committed artifact, every artifact the
// package's own patcher applied to V's captured bytes, and the plan survives the two
// installers it will meet (shared VLab's deploy/rollback, promote-to-v's install/undo).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { PATCHED, PLAN, PLUGIN_SOURCE, PLUGIN_TARGET, REPO, V_BYTES, buildPlan, pluginFiles, render, sha256, vBytesOf } from "../lab/build-inter-session-plan.mjs";
import { byId, componentOfTarget, resolveVDirs, vPathForTarget } from "../scripts/lib/runtime-components.mjs";
import { assertVersion, fingerprint, installFiles, validateFiles } from "../lab/shared/files.mjs";
import { REMOTE } from "../scripts/promote-to-v.mjs";

const plan = JSON.parse(fs.readFileSync(path.join(REPO, PLAN), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(REPO, V_BYTES), "utf8"));
const read = (rel) => fs.readFileSync(path.join(REPO, rel));
const byTarget = new Map(plan.files.map((f) => [f.target, f]));
const tmp = (t, prefix) => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
};

test("the committed plan is exactly what lab/build-inter-session-plan.mjs builds (rerun it after any package changes)", () => {
  assert.equal(fs.readFileSync(path.join(REPO, PLAN), "utf8"), render(buildPlan()));
  assert.equal(plan.baseRelease, "REPLACE_AT_STAGE");
  assert.deepEqual(Object.keys(plan), ["baseRelease", "files"]);
  for (const f of plan.files) assert.deepEqual(Object.keys(f), ["source", "target", "before", "after"]);
});

test("one release: all 15 patched V files (core incl. Telegram, Feishu, DingTalk, WeCom) and the plugin directory", () => {
  // Every R1 and R2 file the fixture records on V is in the plan, and nothing else from V.
  assert.deepEqual(PATCHED.map((r) => `${r.component}/${r.file}`).sort(), fixture.files.map((f) => `${f.component}/${f.file}`).sort());
  for (const file of ["sessions-spawn-tool-1FQMTkIo.js", "openclaw-tools-BODVdJQD.js", "get-reply-CqW1y05D.js", "agent-runner.runtime-CAdsMsQt.js",
    "dispatch-from-config-DOJq_7CI.js", "task-registry-activity-DSlVVJwD.js", "v-experience.js", "telegram-ingress-drain-factory-DJM2Jqrc.js", "bot-message-DC6p8sB3.js"]) {
    assert(byTarget.has(`openclaw/dist/${file}`), file);
  }
  const plugin = plan.files.filter((f) => f.target.startsWith(`${PLUGIN_TARGET}/`));
  assert.equal(plan.files.length, PATCHED.length + plugin.length);
  assert(plan.files.length <= 100, "the shared release channel takes at most 100 files");
  assert.equal(new Set(plan.files.map((f) => f.target)).size, plan.files.length);
});

test("every before is the bytes V runs: the capture equals the sha recorded on V", () => {
  assert.equal(fixture.verifiedOnV.allMatch, true);
  for (const r of PATCHED) {
    const v = vBytesOf(fixture, r.component, r.file);
    const f = byTarget.get(r.target);
    assert.equal(sha256(read(v.captured)), v.sha256, v.captured);
    assert.equal(f.before, v.sha256, r.target);
  }
});

test("every after is the committed artifact, and that artifact is its package's patcher run on V's captured bytes", async () => {
  for (const r of PATCHED) {
    const f = byTarget.get(r.target);
    assert.equal(f.source, r.source);
    const artifact = read(r.source);
    assert.equal(f.after, sha256(artifact), r.source);
    const mod = await import(pathToFileURL(path.join(REPO, r.module)).href);
    assert.equal(typeof mod[r.fn], "function", `${r.module} exports ${r.fn}`);
    const v = vBytesOf(fixture, r.component, r.file);
    const out = mod[r.fn](read(v.captured).toString("utf8"));
    assert.equal(sha256(Buffer.from(out)), f.after, `${r.module} ${r.fn}(V's ${r.file}) is not the committed ${r.source}`);
  }
});

test("the plugin ships exactly its package files (no tests), new on both hosts", () => {
  const shipped = pluginFiles();
  const plugin = plan.files.filter((f) => f.target.startsWith(`${PLUGIN_TARGET}/`));
  assert.deepEqual(plugin.map((f) => f.target.slice(PLUGIN_TARGET.length + 1)), shipped);
  for (const f of plugin) {
    assert.equal(f.before, null, `${f.target} is new on V and VLab`);
    assert.equal(f.source, `${PLUGIN_SOURCE}/${f.target.slice(PLUGIN_TARGET.length + 1)}`);
    assert.equal(f.after, sha256(read(f.source)));
  }
  assert(shipped.includes("index.js") && shipped.includes("openclaw.plugin.json") && shipped.includes("package.json"));
  assert(shipped.some((p) => p.startsWith("core/transports/")));
  assert(!shipped.some((p) => p.startsWith("tests/")));
  // Shipped = what git tracks (minus tests): nothing untracked slips in, nothing tracked is left out.
  const tracked = execFileSync("git", ["-C", REPO, "ls-files", PLUGIN_SOURCE], { encoding: "utf8" }).split("\n").filter(Boolean)
    .map((p) => p.slice(PLUGIN_SOURCE.length + 1)).filter((p) => !p.startsWith("tests/")).sort();
  assert.deepEqual(shipped, tracked);
  const manifest = JSON.parse(read(`${PLUGIN_SOURCE}/openclaw.plugin.json`));
  assert.equal(manifest.id, "v-session-relay");
  assert.equal(JSON.parse(read(`${PLUGIN_SOURCE}/package.json`)).version, "2.0.0");
});

test("every target is a known component and maps to the path the fixture recorded on V", () => {
  const core = vBytesOf(fixture, "core", "get-reply-CqW1y05D.js").hostPath.replace(/\/dist\/[^/]+$/u, "");
  const dingtalk = vBytesOf(fixture, "dingtalk", "connection-DCvu-l09.mjs").hostPath.replace(/\/dist\/[^/]+$/u, "");
  const vDirs = resolveVDirs(core, (glob) => (glob.includes("dingtalk") ? [dingtalk] : glob.includes("openclaw-codex") ? ["/home/openclaw/.openclaw/npm/projects/openclaw-codex-x/node_modules/@openclaw/codex"] : []));
  for (const r of PATCHED) {
    assert.equal(componentOfTarget(r.target)?.id, r.component, r.target);
    assert.equal(vPathForTarget(r.target, vDirs), vBytesOf(fixture, r.component, r.file).hostPath, r.target);
  }
  for (const f of plan.files.filter((x) => x.target.startsWith(`${PLUGIN_TARGET}/`))) {
    assert.equal(componentOfTarget(f.target)?.id, "session-relay");
    assert.equal(vPathForTarget(f.target, vDirs), `${byId("session-relay").v.fixed}/${f.target.slice(PLUGIN_TARGET.length + 1)}`);
  }
});

test("the packages' own manifests agree with the plan", () => {
  const check = (target, before, after, where) => {
    const f = byTarget.get(target);
    assert(f, `${where}: ${target} not in the plan`);
    assert.deepEqual([f.before, f.after], [before, after], where);
  };
  for (const m of JSON.parse(read("lab/release-files/task-bridge-extra-sources/manifest.json"))) check(m.target, m.before, m.after, "task-bridge-extra-sources");
  for (const m of JSON.parse(read("lab/release-files/v-experience-session-kind/manifest.json"))) check(m.target, m.before, m.after, "v-experience-session-kind");
  for (const m of JSON.parse(read("lab/release-files/wecom-inter-session-bridge/manifest.json"))) check(m.target, m.before, m.after, "wecom-inter-session-bridge");
  const dingtalk = JSON.parse(read("lab/release-files/dingtalk-inter-session-bridge/manifest.json"));
  for (const m of dingtalk.files) check(`${PATCHED.find((r) => r.source === m.generated).target}`, m.before, m.after, "dingtalk-inter-session-bridge");
});

// A runtime tree holding V's bytes at every patched target (the shape VLab's runtime/ has).
function vlabTree(root) {
  for (const r of PATCHED) {
    const dest = path.join(root, r.target);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, read(vBytesOf(fixture, r.component, r.file).captured));
  }
  fs.chmodSync(path.join(root, "extensions"), 0o700); // as on vlab91: drwx------ lab-db91-parity
}

test("shared VLab: the plan validates, deploys (creating the plugin directory) and rolls back to the exact fingerprint", (t) => {
  const root = tmp(t, "isc-plan-vlab-");
  const payload = tmp(t, "isc-plan-payload-");
  vlabTree(root);
  const files = plan.files.map((f, i) => {
    const after = read(f.source);
    fs.mkdirSync(path.join(payload, "after"), { recursive: true });
    fs.mkdirSync(path.join(payload, "before"), { recursive: true });
    fs.writeFileSync(path.join(payload, "after", String(i)), after);
    if (f.before !== null) fs.copyFileSync(path.join(root, f.target), path.join(payload, "before", String(i)));
    return { ...f, content: after.toString("base64") };
  });
  validateFiles(root, files);
  const old = fingerprint(root);
  const meta = files.map(({ content, ...f }) => f);
  assertVersion(root, meta, "before");
  installFiles(root, meta, payload, "after");
  assertVersion(root, meta, "after");
  assert.equal(fs.statSync(path.join(root, PLUGIN_TARGET)).mode & 0o777, 0o700, "created like extensions/");
  assert(fs.existsSync(path.join(root, PLUGIN_TARGET, "core/transports/bridge.js")));
  installFiles(root, meta, payload, "before");
  assertVersion(root, meta, "before");
  assert.deepEqual(fingerprint(root), old);
  assert.equal(fs.existsSync(path.join(root, PLUGIN_TARGET)), false, "rollback leaves no empty plugin directory behind");
});

test("V: promote-to-v's installer accepts the plan on a V-shaped tree, refuses a moved before-byte, and undo restores V", (t) => {
  const vroot = tmp(t, "isc-plan-v-");
  const core = vBytesOf(fixture, "core", "get-reply-CqW1y05D.js").hostPath.replace(/\/dist\/[^/]+$/u, "");
  const dingtalk = vBytesOf(fixture, "dingtalk", "connection-DCvu-l09.mjs").hostPath.replace(/\/dist\/[^/]+$/u, "");
  const vDirs = resolveVDirs(core, (glob) => (glob.includes("dingtalk") ? [dingtalk] : glob.includes("openclaw-codex") ? ["/x/codex"] : []));
  const inV = (abs) => path.join(vroot, abs);
  for (const r of PATCHED) {
    const dest = inV(vBytesOf(fixture, r.component, r.file).hostPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, read(vBytesOf(fixture, r.component, r.file).captured));
  }
  const dir = tmp(t, "isc-plan-promote-");
  fs.mkdirSync(path.join(dir, "files"));
  const files = plan.files.map((f, i) => {
    fs.writeFileSync(path.join(dir, "files", String(i)), read(f.source));
    return { target: f.target, vPath: inV(vPathForTarget(f.target, vDirs)), before: f.before, after: f.after };
  });
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify({ files }));
  const remote = (mode) => spawnSync(process.execPath, ["-", mode, dir], { input: REMOTE, encoding: "utf8", timeout: 30000 });
  const snapshot = () => files.map((f) => (fs.existsSync(f.vPath) ? sha256(fs.readFileSync(f.vPath)) : null));
  const before = snapshot();
  let r = remote("check"); assert.equal(r.status, 0, r.stderr);
  // A V file that moved since the capture stops the promotion before anything is touched.
  const moved = files[0].vPath; const original = fs.readFileSync(moved);
  fs.writeFileSync(moved, "moved on V\n");
  r = remote("install"); assert.equal(r.status, 1); assert.match(r.stderr, /V is not where this release starts/);
  fs.writeFileSync(moved, original);
  r = remote("install"); assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(), files.map((f) => f.after));
  const pluginDir = inV(byId("session-relay").v.fixed);
  assert.equal(fs.statSync(pluginDir).mode & 0o777, 0o755);
  r = remote("undo"); assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(), before);
  assert.equal(fs.existsSync(pluginDir), false);
  assert.deepEqual(fs.readdirSync(path.dirname(pluginDir)), ["wecom-openclaw-plugin"]);
});
