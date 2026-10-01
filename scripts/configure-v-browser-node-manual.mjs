// Route V's browser tool to a node only when the call names one.
//
// Why: gateway.nodes.browser.mode defaults to "auto", and in auto mode a
// browser call without a target goes to the single connected browser-capable
// node. Turning on the browser proxy of Tianyi's Mac node ("Tianyi Mac") would
// therefore send every untargeted browser call on V -- night shift, groups --
// to that Mac. "manual" keeps those calls on V and routes to the Mac only for
// target="node" or node=<name> (extensions/browser/src/browser-node-routing.ts).
//
// The Gateway and the worker pool read different files
// (docs memory: v-worker-config-second-file), so both get the key.
// A config write on a running Gateway hot-reloads it and has closed the worker
// pool before, so apply/restore refuse unless the Gateway is stopped.
//
// Usage (root on V):  node configure-v-browser-node-manual.mjs check|apply|restore

import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [mode = "check"] = process.argv.slice(2);
assert(["check", "apply", "restore"].includes(mode), "mode must be check|apply|restore");
assert.equal(os.hostname(), "VM-8-2-ubuntu", "this configures production V only");
assert.equal(process.getuid(), 0, "run as root");

const service = "openclaw-gateway.service";
const files = [
  "/home/openclaw/.openclaw/openclaw.json",
  "/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json",
];
const wanted = { mode: "manual" };

let active;
try {
  active = execFileSync("systemctl", ["is-active", service], { encoding: "utf8" }).trim() === "active";
} catch {
  active = false; // is-active exits non-zero for inactive/failed
}
if (mode !== "check") assert.equal(active, false, `stop ${service} first; a live config write hot-reloads the Gateway`);

const report = [];
for (const file of files) {
  assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);
  const stat = fs.statSync(file);
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = config.gateway?.nodes?.browser ?? null;
  let backup = null;
  if (mode !== "check") {
    const next = structuredClone(config);
    next.gateway ??= {};
    next.gateway.nodes ??= {};
    if (mode === "apply") next.gateway.nodes.browser = { ...(before ?? {}), ...wanted };
    else delete next.gateway.nodes.browser;
    if (JSON.stringify(next) !== JSON.stringify(config)) {
      backup = `/var/backups/${file.split("/").pop()}-browser-node-${mode}-${Date.now()}`;
      fs.copyFileSync(file, backup);
      const tmp = `${file}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: stat.mode & 0o777 });
      fs.chownSync(tmp, stat.uid, stat.gid);
      fs.renameSync(tmp, file);
    }
  }
  const after = JSON.parse(fs.readFileSync(file, "utf8")).gateway?.nodes?.browser ?? null;
  if (mode === "apply") assert.equal(after?.mode, "manual", `${file} did not take the key`);
  if (mode === "restore") assert.equal(after, null, `${file} still has the key`);
  report.push({ file, before, after, backup });
}

console.log(JSON.stringify({ mode, service, gatewayActive: active, files: report }, null, 2));
