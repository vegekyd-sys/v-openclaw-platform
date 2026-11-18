import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { HOSTS, PLUGIN_ID, applyEdits, checkPluginDir, revertEdits, run } from "./configure-v-meeting-bridge.mjs";

const PLUGIN = new URL("../apps/v-meeting-bridge/plugin/", import.meta.url).pathname.replace(/\/$/u, "");
const base = () => ({ plugins: { allow: ["feishu", "v-session-relay"], load: { paths: ["/x/v-session-relay"] }, entries: { feishu: { enabled: true } } }, channels: { feishu: { appSecret: "s" } } });

test("apply on V: path, allowlist and an empty-config entry; idempotent; revert keeps an explicit off switch", () => {
  const { config, changes } = applyEdits(base(), { pluginDir: HOSTS["VM-8-2-ubuntu"].pluginDir });
  assert.equal(PLUGIN_ID, "v-meeting-bridge");
  assert.deepEqual(config.plugins.load.paths, ["/x/v-session-relay", "/home/openclaw/.openclaw/extensions/v-meeting-bridge"]);
  assert.deepEqual(config.plugins.allow, ["feishu", "v-session-relay", "v-meeting-bridge"]);
  assert.deepEqual(config.plugins.entries["v-meeting-bridge"], { enabled: true, config: {} });
  assert.equal(changes.length, 3);
  assert.equal(applyEdits(config, { pluginDir: HOSTS["VM-8-2-ubuntu"].pluginDir }).changes.length, 0);
  const off = revertEdits(config, { pluginDir: HOSTS["VM-8-2-ubuntu"].pluginDir }).config;
  assert.equal(off.plugins.entries["v-meeting-bridge"].enabled, false);
  assert(!off.plugins.load.paths.some((p) => p.includes("v-meeting-bridge")));
  assert(!off.plugins.allow.includes("v-meeting-bridge"));
});

test("shared VLab names the vlab-bot lark-cli profile", () => {
  const vlab = HOSTS["VM-0-4-ubuntu"];
  const { config } = applyEdits(base(), { pluginDir: vlab.pluginDir, larkCliProfile: vlab.larkCliProfile });
  assert.deepEqual(config.plugins.entries["v-meeting-bridge"].config, { larkCli: { profile: "vlab-bot" } });
});

test("the plugin in this repo passes the directory check; one without declared tools does not", () => {
  assert.deepEqual(checkPluginDir(PLUGIN).problems, []);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vmb-cfg-"));
  fs.cpSync(PLUGIN, tmp, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "openclaw.plugin.json"), "utf8"));
  delete manifest.contracts;
  fs.writeFileSync(path.join(tmp, "openclaw.plugin.json"), JSON.stringify(manifest));
  assert.match(checkPluginDir(tmp).problems.join(";"), /contracts\.tools/u);
});

test("apply writes only with the Gateway stopped, keeps an undo file, and revert --undo restores the bytes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmb-cfg-"));
  const file = path.join(dir, "openclaw.json");
  const original = `${JSON.stringify(base(), null, 2)}\n`;
  fs.writeFileSync(file, original);
  const undoDir = path.join(dir, "undo");
  const running = () => "active";
  assert.throws(() => run({ mode: "apply", config: file, pluginDir: PLUGIN, unit: "u", undoDir, exec: running }), /stop it first/u);
  const applied = run({ mode: "apply", config: file, pluginDir: PLUGIN, unit: "none", undoDir });
  assert.equal(applied.result, "written");
  assert.doesNotMatch(applied.diff, /appSecret/u);
  run({ mode: "revert", config: file, pluginDir: PLUGIN, unit: "none", undoDir, undo: applied.undo });
  assert.equal(fs.readFileSync(file, "utf8"), original);
});
