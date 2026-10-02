// Turn on OpenClaw's mid-turn context precheck in both config files V reads.
//
// Why: a big session that fits at turn start can be pushed past the context budget by
// tool results inside the same turn. Since PR #108 the completions transport then
// throws "Context overflow: [V_COMPLETIONS_CONTEXT_BUDGET_EXHAUSTED]", but after tools
// have run the turn is not replay-safe, so nothing compacts and the user sees
// "Agent couldn't generate a response" (production 2026-09-30 x3, 2026-10-02 17:41).
// agents.defaults.compaction.midTurnPrecheck (OpenClaw 9.1, default off) checks context
// pressure after each new tool result, before the next model call, and compacts or
// truncates tool results first. Validated by lab/candidate/midturn-precheck-{off,on}.plan.json.
//
// The Gateway reads openclaw.json; turns run in Workers, which read worker-openclaw.json
// (a second file, see docs). Both get the same value.
//
// Usage (root):  node configure-v-midturn-precheck.mjs check|apply|restore
// apply/restore refuse while the Gateway is running: writing openclaw.json under a
// running Gateway triggers a config hot reload, which has closed the worker pool for
// good before (2026-09-20). Stop the Gateway, apply, start it.
// Runs on production V and on shared VLab (picked by hostname).

import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [mode = "check"] = process.argv.slice(2);
assert(["check", "apply", "restore"].includes(mode), "mode must be check|apply|restore");
assert.equal(process.getuid(), 0, "run as root");

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
const target = targets[os.hostname()];
assert(target, `unknown host ${os.hostname()}: this configures production V or shared VLab only`);
const want = mode === "restore" ? false : true;
// is-active exits non-zero when stopped, so read the property instead
const state = execFileSync("systemctl", ["show", target.service, "-p", "ActiveState", "--value"], { encoding: "utf8" }).trim();
const active = !["inactive", "failed"].includes(state);

const read = (file) => {
  assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
};
const flag = (config) => config.agents?.defaults?.compaction?.midTurnPrecheck?.enabled === true;

const before = target.files.map((file) => ({ file, enabled: flag(read(file)) }));
const changes = [];
if (mode !== "check" && before.some((b) => b.enabled !== want)) {
  assert(!active, `${target.service} is running; stop it first (a config write under a running Gateway hot-reloads and can close the worker pool)`);
  const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
  for (const { file, enabled } of before) {
    if (enabled === want) continue;
    const raw = fs.readFileSync(file, "utf8");
    const config = JSON.parse(raw);
    assert(config.agents?.defaults?.compaction, `${file} has no agents.defaults.compaction block`);
    const stat = fs.statSync(file);
    const backup = `${file}.bak-midturn-precheck-${stamp}`;
    fs.writeFileSync(backup, raw, { flag: "wx", mode: stat.mode & 0o777 });
    fs.chownSync(backup, stat.uid, stat.gid);
    config.agents.defaults.compaction.midTurnPrecheck = { ...(config.agents.defaults.compaction.midTurnPrecheck ?? {}), enabled: want };
    const next = `${JSON.stringify(config, null, 2)}\n`;
    const tmp = `${file}.tmp-midturn-precheck-${process.pid}`;
    fs.writeFileSync(tmp, next, { flag: "wx", mode: stat.mode & 0o777 });
    fs.chownSync(tmp, stat.uid, stat.gid);
    fs.renameSync(tmp, file);
    assert.equal(flag(read(file)), want, `${file} did not take the new value`);
    changes.push({ file, backup });
  }
}

const after = target.files.map((file) => ({ file, enabled: flag(read(file)) }));
if (mode !== "check") assert(after.every((a) => a.enabled === want), "not every config file has the expected value");
console.log(JSON.stringify({
  mode, host: os.hostname(), service: target.service, gatewayState: state,
  files: after, changes, restartRequired: changes.length > 0,
}, null, 1));
