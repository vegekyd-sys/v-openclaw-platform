// Give the turn that delivers a finished subagent's result to its parent session as long as the
// parent needs to finish its work.
//
// Why: when a child finishes (Codex native subagent or sessions_spawn), OpenClaw wakes the parent
// session with an announce turn. That turn is a Gateway `agent` call with expectFinal and
// timeoutMs = agents.defaults.subagents.announceTimeoutMs; V never set it, so the default 120 000
// applies, and the run itself is aborted when the call times out. The reply instruction tells the
// parent to "continue or wrap up the parent task", so a parent with real work left keeps working in
// that turn and is cut off at ~120 s with no final reply and nothing in Feishu (production
// 2026-10-26 14:27 and 14:38 CST, group oc_1f2843b2, task row delivery_status=failed / "gateway
// request timeout for agent"; 7 of 9 Feishu-group Codex native completions in the week before were
// not visible). 30 min, chosen by Tianyi (2026-10-26) as the first step: long enough for the follow-up
// work seen so far, short enough that a hung announce turn is given up and retried within the hour.
// Ordinary turns already get the 48 h default; raise this (e.g. 6 h = runTimeoutSeconds) if parents
// need to work longer inside the announce turn.
// Validated by lab/candidate/codex-announce-timeout-{baseline,fixed}.plan.json (V's bytes: unset
// cuts the parent's 150 s command at the 120 s mark; 30 min finishes it and delivers the final).
//
// The Gateway reads openclaw.json; turns run in Workers, which read worker-openclaw.json (a second
// file). Both get the same value.
//
// Usage (root):  node configure-v-announce-timeout.mjs check|apply|restore|apply-hot|restore-hot
// apply/restore write both files and refuse while the Gateway is running (use them as
// v-self-restart --while-stopped).
// apply-hot/restore-hot write only openclaw.json with the Gateway running: the key reloads hot
// (config.schema.lookup reloadKind=hot) and is read at every announce; the Worker plugin derives
// worker-openclaw.json, and since that path does not roll the Worker generation, finish with
// scripts/v-workers-roll.mjs.
// Runs on production V and on shared VLab (picked by hostname).

import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export const NEW = 1_800_000;
export const OLD = undefined; // unset: OpenClaw's default 120 000

export const timeoutOf = (config) => config.agents?.defaults?.subagents?.announceTimeoutMs;

// Returns true when the value changed (mutates config).
export function setTimeoutMs(config, want) {
  const defaults = config.agents?.defaults;
  assert(defaults, "config has no agents.defaults");
  if (timeoutOf(config) === want) return false;
  if (want === undefined) {
    delete defaults.subagents.announceTimeoutMs;
  } else {
    defaults.subagents = { ...(defaults.subagents ?? {}), announceTimeoutMs: want };
  }
  return true;
}

const targets = {
  "VM-8-2-ubuntu": {
    service: "openclaw-gateway.service",
    files: [
      "/home/openclaw/.openclaw/openclaw.json",
      "/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json",
    ],
  },
  "VM-0-4-ubuntu": {
    service: "openclaw-vlab-production-mirror-v8.service",
    files: [
      "/srv/vlab-production-mirror/labs/instances/db91-parity/state/openclaw.json",
      "/srv/vlab-production-mirror/labs/instances/db91-parity/state/worker-openclaw.json",
    ],
  },
};

function main() {
  const [mode = "check"] = process.argv.slice(2);
  assert(["check", "apply", "restore", "apply-hot", "restore-hot"].includes(mode), "mode must be check|apply|restore|apply-hot|restore-hot");
  const hot = mode.endsWith("-hot");
  assert.equal(process.getuid(), 0, "run as root");
  const target = targets[os.hostname()];
  assert(target, `unknown host ${os.hostname()}: this configures production V or shared VLab only`);
  const want = mode.startsWith("restore") ? OLD : NEW;
  // is-active exits non-zero when stopped, so read the property instead
  const state = execFileSync("systemctl", ["show", target.service, "-p", "ActiveState", "--value"], { encoding: "utf8" }).trim();
  const active = !["inactive", "failed"].includes(state);

  const read = (file) => {
    assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  // Hot: only the Gateway file; the Worker plugin derives the Worker file from it.
  const writable = hot ? target.files.slice(0, 1) : target.files;
  const pending = writable.filter((file) => timeoutOf(read(file)) !== want);
  const changes = [];
  if (mode !== "check" && pending.length) {
    if (!hot) assert(!active, `${target.service} is running; stop it first, or use ${mode}-hot`);
    if (hot) assert(active, `${target.service} is not running; use ${mode.replace("-hot", "")}`);
    const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
    for (const file of pending) {
      const raw = fs.readFileSync(file, "utf8");
      const config = JSON.parse(raw);
      const from = timeoutOf(config);
      setTimeoutMs(config, want);
      const stat = fs.statSync(file);
      const backup = `${file}.bak-announce-timeout-${stamp}`;
      fs.writeFileSync(backup, raw, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(backup, stat.uid, stat.gid);
      const tmp = `${file}.tmp-announce-timeout-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(tmp, stat.uid, stat.gid);
      fs.renameSync(tmp, file);
      assert.equal(timeoutOf(read(file)), want, `${file} did not take the new value`);
      changes.push({ file, backup, from: from ?? null, to: want ?? null });
    }
  }

  const after = target.files.map((file) => ({ file, announceTimeoutMs: timeoutOf(read(file)) ?? null }));
  if (mode !== "check") assert(writable.every((file) => timeoutOf(read(file)) === want), "not every config file has the expected value");
  console.log(JSON.stringify({
    mode, host: os.hostname(), service: target.service, gatewayState: state, want: want ?? null,
    files: after, changes, restartRequired: !hot && changes.length > 0,
    next: hot && changes.length ? "wait ~10 s for the Worker file to be derived, then node v-workers-roll.mjs announce-timeout" : undefined,
  }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
