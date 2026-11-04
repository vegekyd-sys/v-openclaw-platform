// Give gpt-6-luna its 850k budget in V's config, so the Gateway's checks use it before the first luna turn.
//
// Why: since 2026-11-04 (luna-fallback-takeover + session-budget-maintenance) luna turns run with 850k and
// the post-turn checks read that budget from the session entry. The pre-turn compaction and memory flush
// of the first turn after a switch to luna (/luna from DeepSeek, vcodex or terra) still look the model up:
// the entry records the previous model, and V's config has no luna row, so the Gateway's catalog cache
// answers 272000 (threshold 252000). A session over ~252k tokens is compacted before that turn, and stays
// compacted. With an authored row, resolveContextTokensForModel answers min(contextTokens, contextWindow)
// = 850000 (threshold 830000). On the Worker an authored contextTokens only caps the model's own value,
// which is also 850000, so turns are unchanged. sessions.list and /status show 850000 instead of 272000.
// Metadata is the synthesized entry's (luna-fallback-takeover openai-chatgpt-provider): same values.
//
// The Gateway reads openclaw.json; turns run in Workers, which read worker-openclaw.json (a second
// file). Both get the same row.
//
// Usage (root):  node configure-v-luna-context.mjs check|apply|restore|apply-hot|restore-hot
// apply/restore write both files and refuse while the Gateway is running (use them as
// v-self-restart --while-stopped).
// apply-hot/restore-hot write only openclaw.json with the Gateway running: 9.1 hot-applies
// `models.*`, the Worker plugin derives worker-openclaw.json, and since that path does not roll the
// Worker generation, finish with scripts/v-workers-roll.mjs.
// Runs on production V and on shared VLab (picked by hostname).

import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export const LUNA_ROW = {
  id: "gpt-6-luna",
  name: "GPT-6 Luna",
  api: "openai-chatgpt-responses",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  contextWindow: 1050000,
  contextTokens: 850000,
  maxTokens: 128000,
  compat: { supportsReasoningEffort: true, supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"] },
};

// Returns whether the config changed (mutates config). want: true = the row present and equal, false = absent.
export function setLunaRow(config, want) {
  const provider = config.models?.providers?.openai;
  assert(provider && typeof provider === "object", "config has no models.providers.openai");
  const models = provider.models ?? [];
  assert(Array.isArray(models), "models.providers.openai.models is not a list");
  const at = models.findIndex((m) => m?.id === LUNA_ROW.id);
  if (!want) {
    if (at === -1) return false;
    provider.models = models.filter((_, i) => i !== at);
    return true;
  }
  if (at !== -1 && JSON.stringify(models[at]) === JSON.stringify(LUNA_ROW)) return false;
  provider.models = at === -1 ? [...models, structuredClone(LUNA_ROW)] : models.map((m, i) => (i === at ? structuredClone(LUNA_ROW) : m));
  return true;
}

export function lunaRow(config) {
  return (config.models?.providers?.openai?.models ?? []).find((m) => m?.id === LUNA_ROW.id) ?? null;
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
  const want = !mode.startsWith("restore");
  // is-active exits non-zero when stopped, so read the property instead
  const state = execFileSync("systemctl", ["show", target.service, "-p", "ActiveState", "--value"], { encoding: "utf8" }).trim();
  const active = !["inactive", "failed"].includes(state);

  const read = (file) => {
    assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  // Hot: only the Gateway file; the Worker plugin derives the Worker file from it.
  const writable = hot ? target.files.slice(0, 1) : target.files;
  const pending = writable.filter((file) => setLunaRow(read(file), want));
  const changes = [];
  if (mode !== "check" && pending.length) {
    if (!hot) assert(!active, `${target.service} is running; stop it first, or use ${mode}-hot`);
    if (hot) assert(active, `${target.service} is not running; use ${mode.replace("-hot", "")}`);
    const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
    for (const file of pending) {
      const raw = fs.readFileSync(file, "utf8");
      const config = JSON.parse(raw);
      setLunaRow(config, want);
      const stat = fs.statSync(file);
      const backup = `${file}.bak-luna-context-${stamp}`;
      fs.writeFileSync(backup, raw, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(backup, stat.uid, stat.gid);
      const tmp = `${file}.tmp-luna-context-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(tmp, stat.uid, stat.gid);
      fs.renameSync(tmp, file);
      assert.equal(setLunaRow(read(file), want), false, `${file} did not take the change`);
      changes.push({ file, backup });
    }
  }

  const after = target.files.map((file) => ({ file, luna: lunaRow(read(file)) && { contextTokens: lunaRow(read(file)).contextTokens, contextWindow: lunaRow(read(file)).contextWindow } }));
  if (mode !== "check") assert(writable.every((file) => !setLunaRow(read(file), want)), "not every config file has the expected row");
  console.log(JSON.stringify({
    mode, host: os.hostname(), service: target.service, gatewayState: state, want: want ? "row" : "no row",
    files: after, changes, restartRequired: !hot && changes.length > 0,
    next: hot && changes.length ? "wait ~10 s for the Worker file to be derived, then node v-workers-roll.mjs luna-context" : undefined,
  }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
