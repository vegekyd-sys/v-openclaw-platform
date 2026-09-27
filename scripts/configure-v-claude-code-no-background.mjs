// Turn off Claude Code background tasks for every claude child of V's Gateway.
//
// Why: under the claude-cli harness a background subagent (Agent tool with
// run_in_background=true) keeps the Claude CLI turn open, so the reply it has
// already written is not delivered until the background task ends -- and when
// that takes longer than the stuck-session threshold the run is aborted and the
// reply is lost (production, 2026-09-27 23:14). OpenClaw already disallows
// Bash(run_in_background:true); CLAUDE_CODE_DISABLE_BACKGROUND_TASKS is Claude
// Code's own switch and also covers the Agent tool and auto-backgrounding.
// The claude child inherits the Gateway environment, so a unit drop-in is
// enough. Validated by lab/candidate/vcc-background-tasks*.plan.json.
//
// Usage (root on V):  node configure-v-claude-code-no-background.mjs check|apply|restore
// apply/restore only daemon-reload; the running Gateway keeps its old
// environment until it is restarted, and `check` says whether it has.

import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const [mode = "check"] = process.argv.slice(2);
assert(["check", "apply", "restore"].includes(mode), "mode must be check|apply|restore");
assert.equal(os.hostname(), "VM-8-2-ubuntu", "this configures production V only");
assert.equal(process.getuid(), 0, "run as root");

const service = "openclaw-gateway.service";
const name = "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS";
const directory = `/etc/systemd/system/${service}.d`;
const filename = `${directory}/60-claude-code-no-background-tasks.conf`;
const content = `[Service]\nEnvironment=${name}=1\n`;
const sha256 = createHash("sha256").update(content).digest("hex");
const show = (key) => execFileSync("systemctl", ["show", service, "-p", key, "--value"], { encoding: "utf8" }).trim();

assert.equal(fs.realpathSync(directory), directory, "drop-in directory is a symlink");
if (fs.existsSync(filename)) {
  assert.equal(fs.realpathSync(filename), filename, "drop-in is a symlink");
  assert.equal(fs.readFileSync(filename, "utf8"), content, "refusing to touch an unrelated drop-in with this name");
}

if (mode === "apply" && !fs.existsSync(filename)) {
  fs.writeFileSync(filename, content, { flag: "wx", mode: 0o644 });
  execFileSync("systemctl", ["daemon-reload"]);
} else if (mode === "restore" && fs.existsSync(filename)) {
  const backup = `/var/backups/${service}-60-claude-code-no-background-tasks-${Date.now()}.conf`;
  fs.renameSync(filename, backup);
  execFileSync("systemctl", ["daemon-reload"]);
  console.log(JSON.stringify({ recoverableDropIn: backup }));
}

const unitHasSwitch = show("Environment").split(/\s+/u).includes(`${name}=1`);
const pid = Number(show("MainPID"));
let runningHasSwitch = null;
if (pid > 0) {
  runningHasSwitch = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").some((e) => e === `${name}=1`);
}
if (mode === "apply") assert.equal(unitHasSwitch, true, "systemd did not pick up the drop-in");
if (mode === "restore") assert.equal(unitHasSwitch, false, "the switch is still in the unit environment");

console.log(JSON.stringify({
  mode, service, dropIn: filename, present: fs.existsSync(filename), sha256,
  unitHasSwitch, gatewayPid: pid, runningHasSwitch,
  restartRequired: unitHasSwitch !== runningHasSwitch, restartPerformed: false,
}));
