// Give V's DeepSeek models an output budget and a context window that fit DeepSeek's real limit.
//
// Why: DeepSeek rejects any request whose messages + max_tokens exceed 1,048,576 tokens. V
// configured every DeepSeek model with contextWindow 1,000,000 and maxTokens 384,000, and sends
// that maxTokens on every request. OpenClaw's compaction precheck compares the prompt against the
// context window only, so from ~664k real tokens of history every turn is rejected ("Context
// overflow: prompt too large"), and the overflow compaction carries the same 384k budget and is
// rejected too: the session stays broken until someone runs /new (production 10/15–10/19, 24
// rejections, e.g. group oc_5195cdfe 2026-10-19 16:07, 664,997 + 384,000).
// DeepSeek replies never came close to 384k: across 44,949 DeepSeek assistant messages in the VLab
// mirror the largest output was 37,704 tokens (3 above 32k, none above 64k).
// New values: maxTokens 64,000, contextWindow 980,000 → 980,000 + 64,000 = 1,044,000 ≤ 1,048,576,
// so a prompt that OpenClaw lets through (it compacts before the window) always fits with its budget.
//
// The Gateway reads openclaw.json; turns run in Workers, which read worker-openclaw.json (a second
// file). Both get the same values.
//
// Usage (root):  node configure-v-deepseek-output-budget.mjs check|apply|restore|apply-hot|restore-hot
// apply/restore write both files and refuse while the Gateway is running (use them as
// v-self-restart --while-stopped).
// apply-hot/restore-hot write only openclaw.json with the Gateway running: 9.1 hot-applies
// `models.*`, the Worker plugin derives worker-openclaw.json, and since that path does not roll the
// Worker generation, finish with scripts/v-workers-roll.mjs (lab/candidate/deepseek-budget-hot-reload.mjs:
// no restart, an in-flight 45 s turn completed, new turns sent max_tokens 64000).
// Runs on production V and on shared VLab (picked by hostname).

import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export const MODELS = ["deepseek-flash", "vds-deepseek-flash", "deepseek-v4-flash", "deepseek-v4-pro"];
export const NEW = { contextWindow: 980000, maxTokens: 64000 };
export const OLD = { contextWindow: 1000000, maxTokens: 384000 };
export const DEEPSEEK_LIMIT = 1048576;
assert(NEW.contextWindow + NEW.maxTokens <= DEEPSEEK_LIMIT, "new values exceed DeepSeek's limit");

// Returns the models whose values differ from want, after setting them (mutates config).
export function setBudget(config, want) {
  const models = config.models?.providers?.deepseek?.models;
  assert(Array.isArray(models), "config has no models.providers.deepseek.models");
  const changed = [];
  for (const id of MODELS) {
    const model = models.find((m) => m.id === id);
    if (!model) continue;
    if (model.contextWindow === want.contextWindow && model.maxTokens === want.maxTokens) continue;
    changed.push({ id, from: { contextWindow: model.contextWindow, maxTokens: model.maxTokens }, to: want });
    model.contextWindow = want.contextWindow;
    model.maxTokens = want.maxTokens;
  }
  return changed;
}

export function budgets(config) {
  const models = config.models?.providers?.deepseek?.models ?? [];
  return Object.fromEntries(models.filter((m) => MODELS.includes(m.id)).map((m) => [m.id, { contextWindow: m.contextWindow, maxTokens: m.maxTokens }]));
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
  const pending = writable.filter((file) => setBudget(read(file), want).length > 0);
  const changes = [];
  if (mode !== "check" && pending.length) {
    if (!hot) assert(!active, `${target.service} is running; stop it first, or use ${mode}-hot`);
    if (hot) assert(active, `${target.service} is not running; use ${mode.replace("-hot", "")}`);
    const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
    for (const file of pending) {
      const raw = fs.readFileSync(file, "utf8");
      const config = JSON.parse(raw);
      const changed = setBudget(config, want);
      const stat = fs.statSync(file);
      const backup = `${file}.bak-deepseek-output-budget-${stamp}`;
      fs.writeFileSync(backup, raw, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(backup, stat.uid, stat.gid);
      const tmp = `${file}.tmp-deepseek-output-budget-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(tmp, stat.uid, stat.gid);
      fs.renameSync(tmp, file);
      assert.equal(setBudget(read(file), want).length, 0, `${file} did not take the new values`);
      changes.push({ file, backup, models: changed.map((c) => c.id) });
    }
  }

  const after = target.files.map((file) => ({ file, budgets: budgets(read(file)) }));
  if (mode !== "check") assert(writable.every((file) => setBudget(read(file), want).length === 0), "not every config file has the expected values");
  console.log(JSON.stringify({
    mode, host: os.hostname(), service: target.service, gatewayState: state, want,
    files: after, changes, restartRequired: !hot && changes.length > 0,
    next: hot && changes.length ? "wait ~10 s for the Worker file to be derived, then node v-workers-roll.mjs deepseek-output-budget" : undefined,
  }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
