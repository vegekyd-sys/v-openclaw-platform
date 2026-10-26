import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  HOSTS, PLUGIN_ID, UNDO_DIR, applyEdits, checkPluginDir, formatDiff, main, relayKeys, revertEdits, run,
} from "./configure-v-session-relay.mjs";
import { VLAB_RUNTIME, byId } from "./lib/runtime-components.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(repo, "scripts/configure-v-session-relay.mjs");
const PLUGIN = path.join(repo, "apps/v-session-relay/plugin");
const V_DIR = HOSTS["VM-8-2-ubuntu"].pluginDir;
const SECRET = "SECRET-not-to-be-printed-0123456789";
const sha = (b) => createHash("sha256").update(b).digest("hex");

// The shape of V's plugins block (2026-10-20, read-only: ids and paths only), plus a
// secret-looking value in another plugin's config that must never be printed.
const vConfig = () => ({
  gateway: { port: 18789 },
  plugins: {
    allow: ["anthropic", "codex", "deepseek", "feishu", "telegram", "vlab-agent-worker-isolation", "wecom-openclaw-plugin", "v-deepseek-web"],
    entries: {
      feishu: { enabled: true },
      google: { enabled: true, config: { apiKey: SECRET } },
      "vlab-agent-worker-isolation": { enabled: true, config: { minWorkers: 5, maxWorkers: 15 } },
    },
    load: { paths: ["/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/worker", "/opt/v-deepseek-web/plugin"] },
  },
  channels: { feishu: { appSecret: SECRET } },
});
const withoutOwned = (c) => {
  const x = JSON.parse(JSON.stringify(c));
  delete x.plugins.load.paths; delete x.plugins.allow; delete x.plugins.entries[PLUGIN_ID];
  return x;
};

test("defaults: the plugin directory on each host is the component table's, the V config and unit are v-self-restart's", () => {
  const c = byId("session-relay");
  assert.equal(HOSTS["VM-8-2-ubuntu"].pluginDir, c.v.fixed);
  assert.equal(HOSTS["VM-0-4-ubuntu"].pluginDir, `${VLAB_RUNTIME}/${c.vlab.fixed}`);
  const py = fs.readFileSync(path.join(repo, "scripts/v-self-restart.py"), "utf8");
  assert.equal(HOSTS["VM-8-2-ubuntu"].config, /^CONFIG = env\("CONFIG", "([^"]+)"\)/mu.exec(py)[1]);
  assert.equal(HOSTS["VM-8-2-ubuntu"].unit, /^UNIT = env\("UNIT", "([^"]+)"\)/mu.exec(py)[1]);
  // The shared VLab config is the one its unit reads, the same file vlab-v-parity reads through systemd.
  assert.match(HOSTS["VM-0-4-ubuntu"].config, /\/state\/shared-vlab-20260909-v3\/openclaw\.json$/u);
  assert.equal(UNDO_DIR, "/var/backups/v-config");
  // v-self-restart passes V_SELF_RESTART_CONFIG to --while-stopped; this script reads it.
  assert.match(py, /V_SELF_RESTART_CONFIG=CONFIG/u);
});

test("apply adds the load path, the allowlist id and the entry; touches nothing else; a second apply changes nothing", () => {
  const before = vConfig();
  const { config, changes } = applyEdits(before, { pluginDir: V_DIR });
  assert.deepEqual(changes.map((c) => [c.path, c.op]), [["plugins.load.paths", "add"], ["plugins.allow", "add"], [`plugins.entries.${PLUGIN_ID}`, "add"]]);
  assert.deepEqual(config.plugins.load.paths.at(-1), V_DIR);
  assert.deepEqual(config.plugins.allow.at(-1), PLUGIN_ID);
  assert.deepEqual(config.plugins.entries[PLUGIN_ID], { enabled: true, config: { workerGuard: false } });
  assert.deepEqual(withoutOwned(config), withoutOwned(before), "only the three owned keys differ");
  assert.deepEqual(before, vConfig(), "the input is not modified");
  assert.deepEqual(applyEdits(config, { pluginDir: V_DIR }).changes, []);
  // The same directory with a trailing slash is the same load path.
  assert.deepEqual(applyEdits(applyEdits(vConfig(), { pluginDir: `${V_DIR}/` }).config, { pluginDir: V_DIR }).changes, []);
});

test("apply never creates an allowlist (that would switch every unlisted plugin off) and keeps an existing entry's config", () => {
  const none = vConfig(); delete none.plugins.allow;
  const a = applyEdits(none, { pluginDir: V_DIR });
  assert.equal(a.config.plugins.allow, undefined);
  const empty = vConfig(); empty.plugins.allow = [];
  assert.deepEqual(applyEdits(empty, { pluginDir: V_DIR }).config.plugins.allow, []);
  const bare = applyEdits({}, { pluginDir: V_DIR }).config;
  assert.deepEqual(bare, { plugins: { load: { paths: [V_DIR] }, entries: { [PLUGIN_ID]: { enabled: true, config: { workerGuard: false } } } } });
  // An entry left by an earlier revert: its config survives, it is switched back on.
  const old = vConfig();
  old.plugins.entries[PLUGIN_ID] = { enabled: false, config: { ownerName: "Tianyi", limits: { maxConcurrentRequestTurns: 2 }, workerGuard: true } };
  const on = applyEdits(old, { pluginDir: V_DIR });
  assert.deepEqual(on.config.plugins.entries[PLUGIN_ID], { enabled: true, config: { ownerName: "Tianyi", limits: { maxConcurrentRequestTurns: 2 }, workerGuard: false } });
  assert.equal(applyEdits(old, { pluginDir: V_DIR, workerGuard: true }).config.plugins.entries[PLUGIN_ID].config.workerGuard, true);
});

test("apply refuses configs it cannot make load the plugin", () => {
  for (const [mutate, re] of [
    [(c) => { c.plugins.enabled = false; }, /plugins.enabled is false/],
    [(c) => { c.plugins.deny = [PLUGIN_ID]; }, /plugins.deny lists/],
    [(c) => { c.plugins.load.paths = "x"; }, /not an array/],
    [(c) => { c.plugins.allow = "x"; }, /not an array/],
  ]) {
    const c = vConfig(); mutate(c);
    assert.throws(() => applyEdits(c, { pluginDir: V_DIR }), re);
  }
  assert.throws(() => applyEdits(vConfig(), { pluginDir: "relative/dir" }), /absolute/);
});

test("revert: enabled false first, then the load path and the allowlist id go; the entry stays as the off switch; idempotent", () => {
  const applied = applyEdits(vConfig(), { pluginDir: V_DIR }).config;
  applied.plugins.entries[PLUGIN_ID].config.ownerName = "Tianyi";
  applied.plugins.load.paths.push(`${V_DIR}/`); // a duplicate written by hand
  const { config, changes } = revertEdits(applied, { pluginDir: V_DIR });
  assert.deepEqual(changes.map((c) => [c.path, c.op]), [[`plugins.entries.${PLUGIN_ID}.enabled`, "set"], ["plugins.load.paths", "remove"], ["plugins.allow", "remove"]]);
  assert.deepEqual(config.plugins.entries[PLUGIN_ID], { enabled: false, config: { workerGuard: false, ownerName: "Tianyi" } });
  assert.deepEqual(config.plugins.load.paths, vConfig().plugins.load.paths);
  assert.deepEqual(config.plugins.allow, vConfig().plugins.allow);
  assert.deepEqual(withoutOwned(config), withoutOwned(vConfig()));
  assert.deepEqual(revertEdits(config, { pluginDir: V_DIR }).changes, []);
  // Never applied: revert only writes the explicit off switch (no load path to remove).
  assert.deepEqual(revertEdits(vConfig(), { pluginDir: V_DIR }).changes.map((c) => c.path), [`plugins.entries.${PLUGIN_ID}.enabled`]);
  // And apply after revert is a clean re-activation.
  assert.deepEqual(relayKeys(applyEdits(config, { pluginDir: V_DIR }).config)[`plugins.entries.${PLUGIN_ID}`], { enabled: true, config: { workerGuard: false, ownerName: "Tianyi" } });
});

test("the diff shows the three owned keys only, never another plugin's config", () => {
  const before = vConfig();
  const after = applyEdits(before, { pluginDir: V_DIR }).config;
  const diff = formatDiff(before, after);
  assert.match(diff, /^--- plugins\.load\.paths$/mu);
  assert.match(diff, new RegExp(`^\\+  "${V_DIR.replaceAll("/", "\\/")}"$`, "mu"));
  assert.match(diff, /^\+  "v-session-relay"$/mu);
  assert.match(diff, /^--- plugins\.entries\.v-session-relay \(absent\)$/mu);
  assert(!diff.includes(SECRET) && !diff.includes("apiKey") && !diff.includes("minWorkers"));
  assert.equal(formatDiff(after, after), "");
});

test("plugin directory check: this repo's plugin is 2.0; 1.x (no workerGuard), another id, a missing entry or no directory are refused", (t) => {
  assert.deepEqual(checkPluginDir(PLUGIN), { ok: true, version: "2.0.0", problems: [] });
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vsr-plugin-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.match(checkPluginDir(path.join(dir, "nope")).problems[0], /does not exist/);
  fs.writeFileSync(path.join(dir, "openclaw.plugin.json"), JSON.stringify({ id: PLUGIN_ID, configSchema: { properties: { role: {} } } }));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "1.4.0", openclaw: { extensions: ["./index.js"] } }));
  assert.deepEqual(checkPluginDir(dir).problems, ["openclaw.plugin.json has no workerGuard in configSchema (not plugin 2.0)", "entry ./index.js is missing"]);
  fs.writeFileSync(path.join(dir, "openclaw.plugin.json"), JSON.stringify({ id: "other", configSchema: { properties: { workerGuard: {} } } }));
  fs.writeFileSync(path.join(dir, "index.js"), "");
  assert.deepEqual(checkPluginDir(dir).problems, ['openclaw.plugin.json id is "other", not v-session-relay']);
});

function sandbox(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vsr-config-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = path.join(dir, "openclaw.json");
  // Not JSON.stringify's own formatting, so an exact restore is visible.
  const original = `${JSON.stringify(vConfig(), null, 4)}\n`;
  fs.writeFileSync(config, original, { mode: 0o600 });
  return { dir, config, original, undoDir: path.join(dir, "undo") };
}
const cli = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env }, timeout: 20000 });

test("CLI: plan writes nothing; apply writes once with an undo file; revert --undo puts the exact bytes back", (t) => {
  const { config, original, undoDir } = sandbox(t);
  const common = ["--config", config, "--plugin-dir", PLUGIN, "--unit", "none", "--undo-dir", undoDir];
  let r = cli(["plan", ...common]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(config, "utf8"), original);
  assert.equal(fs.existsSync(undoDir), false);
  const plan = JSON.parse(r.stdout.slice(r.stdout.indexOf("\n{") + 1));
  assert.deepEqual(plan.apply.changes.map((c) => c.path), ["plugins.load.paths", "plugins.allow", `plugins.entries.${PLUGIN_ID}`]);
  assert.equal(plan.plugin.ok, true);
  assert(!r.stdout.includes(SECRET), "no secret in the output");

  r = cli(["apply", ...common]);
  assert.equal(r.status, 0, r.stderr);
  assert(!r.stdout.includes(SECRET));
  const applied = JSON.parse(fs.readFileSync(config, "utf8"));
  assert.deepEqual(applied.plugins.entries[PLUGIN_ID], { enabled: true, config: { workerGuard: false } });
  assert.equal(fs.statSync(config).mode & 0o777, 0o600, "mode kept");
  const [undoFile] = fs.readdirSync(undoDir);
  assert.match(undoFile, /^v-session-relay-apply-\d{8}T\d{6}-\d+\.json$/u);
  assert.equal(fs.statSync(path.join(undoDir, undoFile)).mode & 0o777, 0o600);
  assert.equal(fs.statSync(undoDir).mode & 0o777, 0o700);
  const undo = JSON.parse(fs.readFileSync(path.join(undoDir, undoFile), "utf8"));
  assert.deepEqual([undo.shaBefore, undo.shaAfter], [sha(original), sha(fs.readFileSync(config))]);
  assert.equal(Buffer.from(undo.original, "base64").toString("utf8"), original);

  r = cli(["apply", ...common]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /already applied; nothing written/);
  assert.equal(fs.readdirSync(undoDir).length, 1, "an idempotent apply leaves no undo file");

  r = cli(["revert", ...common, "--undo", path.join(undoDir, undoFile)]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(config, "utf8"), original, "byte-identical: shared VLab's config hash is back");
  assert.equal(fs.readdirSync(undoDir).length, 2);
});

test("CLI: an exact revert is refused once the config changed after apply; a plain revert still works", (t) => {
  const { config, undoDir } = sandbox(t);
  const common = ["--config", config, "--plugin-dir", PLUGIN, "--unit", "none", "--undo-dir", undoDir];
  assert.equal(cli(["apply", ...common]).status, 0);
  const [undoFile] = fs.readdirSync(undoDir);
  const c = JSON.parse(fs.readFileSync(config, "utf8")); c.gateway.port = 18790;
  fs.writeFileSync(config, JSON.stringify(c, null, 2));
  const changed = fs.readFileSync(config, "utf8");
  let r = cli(["revert", ...common, "--undo", path.join(undoDir, undoFile)]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /changed since that apply.*run revert without --undo/u);
  assert.equal(fs.readFileSync(config, "utf8"), changed);
  r = cli(["revert", ...common]);
  assert.equal(r.status, 0, r.stderr);
  const reverted = JSON.parse(fs.readFileSync(config, "utf8"));
  assert.equal(reverted.gateway.port, 18790, "the later change survives");
  assert.deepEqual(reverted.plugins.entries[PLUGIN_ID], { enabled: false, config: { workerGuard: false } });
  assert(!reverted.plugins.load.paths.includes(PLUGIN));
  assert(!reverted.plugins.allow.includes(PLUGIN_ID));
});

test("apply and revert refuse while the Gateway runs, and apply refuses a missing plugin directory; nothing is written either way", (t) => {
  const { config, original, undoDir, dir } = sandbox(t);
  const base = { config, pluginDir: PLUGIN, unit: "openclaw-gateway.service", undoDir };
  const calls = [];
  const exec = (state) => (cmd, args) => { calls.push([cmd, ...args]); return `${state}\n`; };
  assert.throws(() => run({ ...base, mode: "apply", exec: exec("active") }), /openclaw-gateway.service is active; stop it first/);
  assert.throws(() => run({ ...base, mode: "revert", exec: exec("deactivating") }), /is deactivating; stop it first/);
  assert.deepEqual(calls[0], ["systemctl", "show", "openclaw-gateway.service", "-p", "ActiveState", "--value"]);
  assert.equal(run({ ...base, mode: "plan", exec: exec("active") }).gatewayState, "active", "plan is fine while running");
  assert.throws(() => run({ ...base, mode: "apply", pluginDir: path.join(dir, "missing"), exec: exec("inactive") }), /plugin directory not usable.*does not exist/u);
  assert.equal(fs.readFileSync(config, "utf8"), original);
  assert.equal(fs.existsSync(undoDir), false);
  assert.equal(run({ ...base, mode: "apply", exec: exec("inactive") }).result, "written");
});

test("under v-self-restart --while-stopped the config path comes from V_SELF_RESTART_CONFIG", (t) => {
  const { config, undoDir } = sandbox(t);
  const log = console.log; console.log = () => {};
  try {
    const report = main(["plan", "--plugin-dir", PLUGIN, "--unit", "none", "--undo-dir", undoDir], { V_SELF_RESTART_CONFIG: config });
    assert.equal(report.config, config);
    assert.throws(() => main(["revert", "--worker-guard", "--plugin-dir", PLUGIN, "--unit", "none"], { V_SELF_RESTART_CONFIG: config }), /--worker-guard is for apply/);
    assert.throws(() => main(["apply", "--undo", "x", "--plugin-dir", PLUGIN, "--unit", "none"], { V_SELF_RESTART_CONFIG: config }), /--undo is for revert/);
  } finally {
    console.log = log;
  }
  if (!HOSTS[os.hostname()]) assert.throws(() => main(["plan"], {}), /unknown host/);
});
