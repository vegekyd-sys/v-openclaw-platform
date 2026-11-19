// Turn Skill Workshop's autonomous learning off (or back to the default) in V's config.
//
// Why (2026-11-10, Tianyi): background experience reviews created 91 skills (79 never read),
// rewrote heavily used skills without review (fcloud-publish's trigger description was truncated
// mid-sentence), and turned one-off correlations into hard rules. Until we can measure whether
// learned skills help, V stops learning on its own. Foreground Workshop use (an explicit request,
// /learn, the operator's proposals) is unaffected.
//
// The key is the official switch `skills.workshop.autonomous.mode` (off | propose | auto; unset =
// auto). 9.1 hot-applies it with reconcile-skill-review-jobs only (src/gateway/config-reload-plan.ts):
// no plugin reload, so the Worker pool is not touched. New reviews stop being scheduled at once;
// a review already running finishes, and its result is not auto-applied (mode is re-read before apply).
//
// The Gateway reads openclaw.json; Workers read worker-openclaw.json (derived by the Worker plugin).
// Usage (root):  node configure-v-skill-workshop-autonomy.mjs check|apply-hot|restore-hot|apply|restore
// apply/restore write both files and refuse while the Gateway is running.
// apply-hot/restore-hot write openclaw.json with the Gateway running; check the Worker file afterwards
// and roll Workers (scripts/v-workers-roll.mjs) if it did not follow.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

export const OFF = "off";

// Returns whether the config changed (mutates config). want: "off" sets it, null removes it (default auto).
export function setAutonomousMode(config, want) {
  const current = config.skills?.workshop?.autonomous?.mode;
  if (want === null) {
    if (current === undefined) return false;
    delete config.skills.workshop.autonomous.mode;
    if (Object.keys(config.skills.workshop.autonomous).length === 0) delete config.skills.workshop.autonomous;
    return true;
  }
  if (current === want) return false;
  config.skills ??= {};
  config.skills.workshop ??= {};
  config.skills.workshop.autonomous ??= {};
  config.skills.workshop.autonomous.mode = want;
  return true;
}

export const autonomousMode = (config) => config.skills?.workshop?.autonomous?.mode ?? null;

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
      "/srv/vlab-production-mirror/labs/instances/db91-parity/state/shared-vlab-20260909-v3/openclaw.json",
      "/srv/vlab-production-mirror/labs/instances/db91-parity/state/shared-vlab-20260909-v3/worker-openclaw.json",
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
  const want = mode.startsWith("restore") ? null : OFF;
  const state = execFileSync("systemctl", ["show", target.service, "-p", "ActiveState", "--value"], { encoding: "utf8" }).trim();
  const active = !["inactive", "failed"].includes(state);
  if (active) {
    const pid = execFileSync("systemctl", ["show", target.service, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim();
    const live = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").find((s) => s.startsWith("OPENCLAW_CONFIG_PATH="))?.slice("OPENCLAW_CONFIG_PATH=".length);
    assert.equal(live ?? target.files[0], target.files[0], `${target.service} reads ${live}, not ${target.files[0]}`);
  }
  const read = (file) => {
    assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  const writable = hot ? target.files.slice(0, 1) : target.files;
  const pending = writable.filter((file) => setAutonomousMode(read(file), want));
  const changes = [];
  if (mode !== "check" && pending.length) {
    if (!hot) assert(!active, `${target.service} is running; stop it first, or use ${mode}-hot`);
    if (hot) assert(active, `${target.service} is not running; use ${mode.replace("-hot", "")}`);
    const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
    for (const file of pending) {
      const raw = fs.readFileSync(file, "utf8");
      const config = JSON.parse(raw);
      setAutonomousMode(config, want);
      const stat = fs.statSync(file);
      const backup = `${file}.bak-skill-workshop-autonomy-${stamp}`;
      fs.writeFileSync(backup, raw, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(backup, stat.uid, stat.gid);
      const tmp = `${file}.tmp-skill-workshop-autonomy-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(tmp, stat.uid, stat.gid);
      fs.renameSync(tmp, file);
      assert.equal(setAutonomousMode(read(file), want), false, `${file} did not take the change`);
      changes.push({ file, backup });
    }
  }
  console.log(JSON.stringify({
    mode, host: os.hostname(), service: target.service, gatewayState: state, want: want ?? "default (auto)",
    files: target.files.map((file) => ({ file, autonomousMode: autonomousMode(read(file)) })),
    changes, restartRequired: !hot && changes.length > 0,
    next: hot && changes.length ? "check the Worker file follows within ~10 s; if not, node v-workers-roll.mjs skill-workshop-autonomy" : undefined,
  }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
