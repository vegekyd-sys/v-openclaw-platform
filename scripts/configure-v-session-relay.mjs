#!/usr/bin/env node
// Turn the v-session-relay plugin on or off in the Gateway's main config
// (docs/inter-session/design.md §11 WP12, §13.1; user guide docs/inter-session/README.md).
//
//   node configure-v-session-relay.mjs plan             what apply and revert would change; changes nothing
//   node configure-v-session-relay.mjs apply            add the plugin: plugins.load.paths, plugins.allow,
//                                                       plugins.entries["v-session-relay"] = {enabled:true, config:{workerGuard:false}}
//   node configure-v-session-relay.mjs revert           enabled:false, then take its path out of plugins.load.paths
//                                                       (and its id out of plugins.allow); the directory can go after the restart
//   node configure-v-session-relay.mjs revert --undo F  put back the exact bytes apply replaced (F = apply's undo file),
//                                                       refused if the config changed since; shared VLab's rollback needs this
//                                                       (its release records the config hash at stage)
//
// Options: --config FILE  --plugin-dir DIR  --unit NAME|none  --undo-dir DIR  --worker-guard (apply: workerGuard true)
//
// Only the Gateway's main config is written. The Worker config is derived from
// it when the Gateway starts (worker-config-derive.mjs), so the plugin also
// loads in every Worker, where it starts nothing unless workerGuard is true.
//
// apply and revert refuse while the Gateway runs. On V a change to
// plugins.load.paths or plugins.entries makes the running Gateway restart
// itself on the spot (memory desktop-config-write-restarts-v), and a config
// hot reload has closed the Worker pool for good before
// (config-hot-reload-kills-worker-pool). Run them inside the one restart:
//
//   sudo v-self-restart --reason "inter-session: activate v-session-relay" --requested-by release \
//     --if-busy abort --idle-timeout 3600 --delay 0 \
//     --while-stopped "/opt/node-v22.23.1/bin/node /opt/v-sentinel/configure-v-session-relay.mjs apply"
//
// v-self-restart passes the config path (V_SELF_RESTART_CONFIG), backs both
// configs up, validates them with `openclaw config validate` after this
// command, and rolls both back if the Gateway does not come up.
//
// apply refuses when the plugin directory is missing or is not plugin 2.0: a
// load path that does not exist makes the whole config invalid (Workers fail
// every turn at once; memory deleted-plugin-dir-breaks-worker-config). For the
// same reason the directory may only be removed after revert has run and the
// Gateway has restarted on it.
//
// Every write first saves an undo file (the replaced bytes, the hashes, what
// changed) in --undo-dir, default /var/backups/v-config (root only, out of the
// agent's reach). Nothing secret is printed: only plugins.load.paths,
// plugins.allow and this plugin's entry are shown.
//
// Self-contained (no repo imports): it is copied to V on its own. The test pins
// its defaults to scripts/lib/runtime-components.mjs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PLUGIN_ID = "v-session-relay";
export const UNDO_DIR = "/var/backups/v-config";

// Where the plugin lives and which config loads it, per host.
export const HOSTS = Object.freeze({
  // Production V. The directory is in the Gateway's auto-discovered extensions
  // directory; V's plugins.allow keeps it off until apply lists it.
  "VM-8-2-ubuntu": Object.freeze({
    config: "/home/openclaw/.openclaw/openclaw.json",
    pluginDir: "/home/openclaw/.openclaw/extensions/v-session-relay",
    unit: "openclaw-gateway.service",
  }),
  // Shared VLab: the config its Gateway unit actually reads (OPENCLAW_CONFIG_PATH).
  "VM-0-4-ubuntu": Object.freeze({
    config: "/srv/vlab-production-mirror/labs/instances/db91-parity/state/shared-vlab-20260909-v3/openclaw.json",
    pluginDir: "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/extensions/v-session-relay",
    unit: "openclaw-vlab-production-mirror-v8.service",
  }),
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const norm = (p) => String(p).replace(/\/+$/u, "");
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ------------------------------------------------------------------ edits

/** The three places this script owns, as plain values (absent = undefined). */
export function relayKeys(config) {
  const plugins = config?.plugins ?? {};
  return {
    "plugins.load.paths": clone(plugins.load?.paths),
    "plugins.allow": clone(plugins.allow),
    [`plugins.entries.${PLUGIN_ID}`]: clone(plugins.entries?.[PLUGIN_ID]),
  };
}

function refuseUnless(config) {
  const plugins = config.plugins ?? {};
  assert(plugins.enabled !== false, "plugins.enabled is false: every plugin is off; this script does not change that");
  assert(!(Array.isArray(plugins.deny) && plugins.deny.includes(PLUGIN_ID)), `plugins.deny lists ${PLUGIN_ID}; remove it there first (deny wins over allow)`);
  for (const key of ["load", "entries"]) {
    assert(plugins[key] === undefined || (plugins[key] && typeof plugins[key] === "object" && !Array.isArray(plugins[key])), `plugins.${key} is not an object`);
  }
  assert(plugins.load?.paths === undefined || Array.isArray(plugins.load.paths), "plugins.load.paths is not an array");
  assert(plugins.allow === undefined || Array.isArray(plugins.allow), "plugins.allow is not an array");
}

/**
 * apply: the plugin loaded from pluginDir, allowed, enabled with config.workerGuard.
 * Returns { config, changes } and leaves the input alone. Idempotent: a second
 * call on its output has no changes.
 */
export function applyEdits(input, { pluginDir, workerGuard = false }) {
  assert(typeof pluginDir === "string" && path.isAbsolute(pluginDir), "pluginDir must be an absolute path");
  const config = clone(input);
  refuseUnless(config);
  const changes = [];
  const plugins = (config.plugins ??= {});
  const load = (plugins.load ??= {});
  const paths = (load.paths ??= []);
  if (!paths.some((p) => norm(p) === norm(pluginDir))) {
    paths.push(pluginDir);
    changes.push({ path: "plugins.load.paths", op: "add", value: pluginDir });
  }
  // An allowlist that exists must name it (9.1: "not in allowlist" = disabled).
  // No allowlist is never created: that would switch off every unlisted plugin.
  if (Array.isArray(plugins.allow) && plugins.allow.length > 0 && !plugins.allow.includes(PLUGIN_ID)) {
    plugins.allow.push(PLUGIN_ID);
    changes.push({ path: "plugins.allow", op: "add", value: PLUGIN_ID });
  }
  const entries = (plugins.entries ??= {});
  const before = entries[PLUGIN_ID];
  const entry = before && typeof before === "object" ? clone(before) : {};
  entry.enabled = true;
  entry.config = { ...(entry.config && typeof entry.config === "object" ? entry.config : {}), workerGuard: workerGuard === true };
  if (JSON.stringify(entry) !== JSON.stringify(before)) {
    entries[PLUGIN_ID] = entry;
    changes.push({ path: `plugins.entries.${PLUGIN_ID}`, op: before === undefined ? "add" : "set", value: entry });
  }
  return { config, changes };
}

/**
 * revert: enabled:false (the entry stays as an explicit off switch, its config
 * kept for the next apply), the load path out, the id out of plugins.allow.
 */
export function revertEdits(input, { pluginDir }) {
  assert(typeof pluginDir === "string" && path.isAbsolute(pluginDir), "pluginDir must be an absolute path");
  const config = clone(input);
  const changes = [];
  const plugins = (config.plugins ??= {});
  const entries = (plugins.entries ??= {});
  const before = entries[PLUGIN_ID];
  if (!(before && typeof before === "object" && before.enabled === false)) {
    entries[PLUGIN_ID] = { ...(before && typeof before === "object" ? before : {}), enabled: false };
    changes.push({ path: `plugins.entries.${PLUGIN_ID}.enabled`, op: "set", value: false });
  }
  if (Array.isArray(plugins.load?.paths)) {
    const kept = plugins.load.paths.filter((p) => norm(p) !== norm(pluginDir));
    if (kept.length !== plugins.load.paths.length) {
      changes.push({ path: "plugins.load.paths", op: "remove", value: pluginDir });
      plugins.load.paths = kept;
    }
  }
  if (Array.isArray(plugins.allow) && plugins.allow.includes(PLUGIN_ID)) {
    plugins.allow = plugins.allow.filter((id) => id !== PLUGIN_ID);
    changes.push({ path: "plugins.allow", op: "remove", value: PLUGIN_ID });
  }
  return { config, changes };
}

// ------------------------------------------------------------------- diff

function lineDiff(a, b) {
  // Longest common subsequence; the lists are short (plugins.allow ~ 80 ids).
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push([" ", a[i]]); i += 1; j += 1; }
    else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) { out.push(["-", a[i]]); i += 1; }
    else { out.push(["+", b[j]]); j += 1; }
  }
  return out;
}

// A list is shown one element per line (no brackets or commas, so adding at the
// end changes one line); the entry as indented JSON.
const render = (v) => (v === undefined ? [] : Array.isArray(v) ? v.map((x) => `  ${JSON.stringify(x)}`) : JSON.stringify(v, null, 2).split("\n"));

/** A unified-style diff of the three owned keys only (never the rest of the config). */
export function formatDiff(before, after, context = 2) {
  const a = relayKeys(before), b = relayKeys(after);
  const parts = [];
  for (const key of Object.keys(a)) {
    const left = render(a[key]);
    const right = render(b[key]);
    const lines = lineDiff(left, right);
    if (lines.every(([op]) => op === " ")) continue;
    parts.push(`--- ${key}${a[key] === undefined ? " (absent)" : ""}`, `+++ ${key}${b[key] === undefined ? " (absent)" : ""}`);
    let skipped = false;
    lines.forEach(([op, text], k) => {
      const near = lines.slice(Math.max(0, k - context), k + context + 1).some(([o]) => o !== " ");
      if (op === " " && !near) { if (!skipped) parts.push(" …"); skipped = true; return; }
      skipped = false;
      parts.push(`${op}${text}`);
    });
  }
  return parts.join("\n");
}

// ----------------------------------------------------------------- checks

/** Is pluginDir v-session-relay 2.0 as OpenClaw 9.1 will load it? */
export function checkPluginDir(dir) {
  const problems = [];
  const json = (name) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch (e) { problems.push(`${name}: ${e.code === "ENOENT" ? "missing" : e.message}`); return null; }
  };
  if (!fs.existsSync(dir)) return { ok: false, version: null, problems: [`${dir} does not exist (promote the release first)`] };
  const manifest = json("openclaw.plugin.json");
  const pkg = json("package.json");
  if (manifest && manifest.id !== PLUGIN_ID) problems.push(`openclaw.plugin.json id is ${JSON.stringify(manifest.id)}, not ${PLUGIN_ID}`);
  // Plugin 1.x has no workerGuard in its schema; 9.1 rejects the entry's config then.
  if (manifest && !manifest.configSchema?.properties?.workerGuard) problems.push("openclaw.plugin.json has no workerGuard in configSchema (not plugin 2.0)");
  const extensions = pkg?.openclaw?.extensions;
  if (pkg && !(Array.isArray(extensions) && extensions.length)) problems.push("package.json has no openclaw.extensions");
  for (const entry of Array.isArray(extensions) ? extensions : []) {
    if (!fs.existsSync(path.join(dir, entry))) problems.push(`entry ${entry} is missing`);
  }
  return { ok: problems.length === 0, version: pkg?.version ?? null, problems };
}

export function gatewayState(unit, exec = execFileSync) {
  if (unit === "none") return "unchecked";
  // is-active exits non-zero when stopped, so read the property instead
  return exec("systemctl", ["show", unit, "-p", "ActiveState", "--value"], { encoding: "utf8" }).trim();
}
const stopped = (state) => ["inactive", "failed", "unchecked"].includes(state);

// ----------------------------------------------------------------- writes

function readConfig(file) {
  assert.equal(fs.realpathSync(file), file, `${file} is a symlink or not a canonical path`);
  const raw = fs.readFileSync(file);
  return { raw, sha: sha256(raw), config: JSON.parse(raw.toString("utf8")), stat: fs.statSync(file) };
}

function writeAtomic(file, bytes, stat) {
  const tmp = `${file}.tmp-v-session-relay-${process.pid}`;
  fs.writeFileSync(tmp, bytes, { flag: "wx", mode: stat.mode & 0o777 });
  try {
    fs.chmodSync(tmp, stat.mode & 0o777);
    if (process.getuid?.() === 0) fs.chownSync(tmp, stat.uid, stat.gid);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

function saveUndo(undoDir, record) {
  fs.mkdirSync(undoDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
  const file = path.join(undoDir, `${PLUGIN_ID}-${record.mode}-${stamp}-${process.pid}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 1)}\n`, { flag: "wx", mode: 0o600 });
  return file;
}

/** Run one mode against explicit paths. Returns the report printed by main(). */
export function run({ mode, config: file, pluginDir, unit, undoDir = UNDO_DIR, undo, workerGuard = false, host = os.hostname(), exec } = {}) {
  assert(["plan", "apply", "revert"].includes(mode), "mode must be plan|apply|revert");
  assert(file && pluginDir && unit, "config, plugin dir and unit are required");
  const current = readConfig(file);
  const plugin = checkPluginDir(pluginDir);
  const state = gatewayState(unit, exec);
  const report = { mode, host, config: file, pluginDir, unit, gatewayState: state, plugin,
    allowlist: Array.isArray(current.config.plugins?.allow) && current.config.plugins.allow.length > 0 ? "present" : "absent" };

  if (mode === "plan") {
    for (const [name, edits] of [["apply", () => applyEdits(current.config, { pluginDir, workerGuard })], ["revert", () => revertEdits(current.config, { pluginDir })]]) {
      try {
        const next = edits();
        report[name] = { changes: next.changes, diff: formatDiff(current.config, next.config) };
      } catch (e) {
        report[name] = { refused: e.message };
      }
    }
    if (!plugin.ok) report.apply.refused ??= `plugin directory not usable: ${plugin.problems.join("; ")}`;
    return report;
  }

  let next;
  if (mode === "revert" && undo) {
    // Exact bytes back: only from the state that apply left.
    const record = JSON.parse(fs.readFileSync(undo, "utf8"));
    assert.equal(record.tool, "configure-v-session-relay", `${undo} is not an undo file of this script`);
    assert.equal(record.mode, "apply", `${undo} records a ${record.mode}, not an apply`);
    assert.equal(record.config, file, `${undo} is for ${record.config}`);
    assert.equal(current.sha, record.shaAfter, `${file} changed since that apply (sha ${current.sha.slice(0, 12)}, apply left ${record.shaAfter.slice(0, 12)}); run revert without --undo`);
    const bytes = Buffer.from(record.original, "base64");
    assert.equal(sha256(bytes), record.shaBefore, "undo file is corrupt");
    next = { bytes, config: JSON.parse(bytes.toString("utf8")), changes: [{ path: "*", op: "restore", value: record.shaBefore }] };
  } else {
    const edited = mode === "apply" ? applyEdits(current.config, { pluginDir, workerGuard }) : revertEdits(current.config, { pluginDir });
    next = { ...edited, bytes: Buffer.from(`${JSON.stringify(edited.config, null, 2)}\n`) };
  }
  report.changes = next.changes;
  report.diff = formatDiff(current.config, next.config);
  if (next.changes.length === 0) {
    report.result = mode === "apply" ? "already applied; nothing written" : "already reverted; nothing written";
    return report;
  }
  assert(stopped(state), `${unit} is ${state}; stop it first: run this as v-self-restart --while-stopped (a write under a running Gateway restarts V on the spot or reloads plugins)`);
  if (mode === "apply") assert(plugin.ok, `plugin directory not usable, refusing to point the config at it: ${plugin.problems.join("; ")}`);

  const shaAfter = sha256(next.bytes);
  report.undo = saveUndo(undoDir, {
    tool: "configure-v-session-relay", schema: 1, mode: undo ? "revert-exact" : mode, at: new Date().toISOString(), host,
    config: file, pluginDir, shaBefore: current.sha, shaAfter, changes: next.changes,
    owned: { before: relayKeys(current.config), after: relayKeys(next.config) },
    original: current.raw.toString("base64"),
  });
  writeAtomic(file, next.bytes, current.stat);
  const written = readConfig(file);
  assert.equal(written.sha, shaAfter, `${file} does not hold what was written`);
  if (!undo) {
    const again = mode === "apply" ? applyEdits(written.config, { pluginDir, workerGuard }) : revertEdits(written.config, { pluginDir });
    assert.equal(again.changes.length, 0, `${file} did not take the change`);
  }
  report.result = "written";
  report.shaBefore = current.sha;
  report.shaAfter = shaAfter;
  report.next = mode === "apply"
    ? "start the Gateway (v-self-restart does); after ready: the plugin log line, vrelay.list answers, and the Worker config lists the plugin"
    : "start the Gateway (v-self-restart does); only after it is ready may the plugin directory be removed (promote-to-v --undo)";
  return report;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
    if (key === "workerGuard") { out.workerGuard = true; continue; }
    const value = argv[i + 1];
    assert(value !== undefined && !value.startsWith("--"), `--${a.slice(2)} needs a value`);
    out[key] = value;
    i += 1;
  }
  return out;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const [mode = "plan"] = args._;
  const defaults = HOSTS[os.hostname()] ?? {};
  const options = {
    mode,
    config: args.config ?? env.V_SELF_RESTART_CONFIG ?? defaults.config,
    pluginDir: args.pluginDir ?? defaults.pluginDir,
    unit: args.unit ?? env.V_SELF_RESTART_UNIT ?? defaults.unit,
    undoDir: args.undoDir ?? UNDO_DIR,
    undo: args.undo,
    workerGuard: args.workerGuard === true,
  };
  assert(options.config && options.pluginDir && options.unit,
    `unknown host ${os.hostname()}: pass --config, --plugin-dir and --unit (or --unit none for a Gateway not run by systemd)`);
  assert(!options.undo || mode === "revert", "--undo is for revert");
  assert(!options.workerGuard || mode !== "revert", "--worker-guard is for apply and plan");
  const report = run(options);
  if (report.diff) console.log(report.diff);
  for (const name of ["apply", "revert"]) if (report[name]?.diff) console.log(`# ${name} would change:\n${report[name].diff}`);
  console.log(JSON.stringify(report, null, 1));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`configure-v-session-relay: ${e.message}`);
    process.exit(1);
  }
}
