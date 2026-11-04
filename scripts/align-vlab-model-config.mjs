// Bring shared VLab's model configuration to V's, without copying credentials.
//
// Why: shared VLab is supposed to equal V, but vlab-v-parity compares code and plugin switches only,
// and VLab's model configuration had drifted far (2026-11-04): no luna fallback, no openai / xai /
// moonshot / azure-openai / makaron-image providers, older aliases and model policy, DeepSeek timeout
// 300 s against V's 90 s. VLab then routes and compacts differently from V, so its results do not
// predict V's (e.g. the luna row tried on 2026-11-03, which also went to a file nothing reads).
//
// What is taken from V: models.providers (every provider), agents.defaults.{model, models, modelPolicy,
// compaction}, and {model, models} of each agent that exists on both. Credential fields (apiKey,
// headers) are never copied: VLab keeps its own where it has them; a provider VLab has no credential
// for is configured without one and fails at call time only.
//
//   on V (root):     node align-vlab-model-config.mjs export > v-models.json
//   on VLab (root):  node align-vlab-model-config.mjs plan|apply-hot v-models.json
//                    node align-vlab-model-config.mjs restore-hot <backup>
// apply-hot writes the Gateway file the running service reads (checked against its
// OPENCLAW_CONFIG_PATH); the Worker plugin derives the Worker file; then roll the Worker generation.

import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export const CREDENTIAL_KEYS = ["apiKey", "headers"];
const AUTH_MODES = new Set(["api-key", "oauth", "token", "none", "aws-sdk"]);
const DEFAULT_KEYS = ["model", "models", "modelPolicy", "compaction"];
const AGENT_KEYS = ["model", "models"];

const V = { host: "VM-8-2-ubuntu", config: "/home/openclaw/.openclaw/openclaw.json" };
const VLAB = { host: "VM-0-4-ubuntu", service: "openclaw-vlab-production-mirror-v8.service",
  config: "/srv/vlab-production-mirror/labs/instances/db91-parity/state/shared-vlab-20260909-v3/openclaw.json" };

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function stripCredentials(provider) {
  const out = clone(provider);
  for (const k of CREDENTIAL_KEYS) delete out[k];
  if (out.auth !== undefined && !AUTH_MODES.has(out.auth)) delete out.auth;
  return out;
}

export function exportModels(config) {
  const agents = config.agents ?? {};
  return {
    providers: Object.fromEntries(Object.entries(config.models?.providers ?? {}).map(([id, p]) => [id, stripCredentials(p)])),
    defaults: Object.fromEntries(DEFAULT_KEYS.filter((k) => agents.defaults?.[k] !== undefined).map((k) => [k, clone(agents.defaults[k])])),
    entries: Object.fromEntries(Object.entries(agents.entries ?? {}).map(([id, a]) => [id, Object.fromEntries(AGENT_KEYS.filter((k) => a?.[k] !== undefined).map((k) => [k, clone(a[k])]))])),
  };
}

// Mutates config to carry V's model sections; returns the changed paths.
export function applyModels(config, v) {
  const changed = [];
  const set = (path, obj, key, value) => {
    if (JSON.stringify(obj[key]) === JSON.stringify(value)) return;
    if (value === undefined) delete obj[key]; else obj[key] = clone(value);
    changed.push(path);
  };
  config.models ??= {};
  config.models.providers ??= {};
  const providers = config.models.providers;
  for (const id of Object.keys(providers)) if (!(id in v.providers)) { delete providers[id]; changed.push(`models.providers.${id} (removed)`); }
  for (const [id, p] of Object.entries(v.providers)) {
    const next = clone(p);
    for (const k of CREDENTIAL_KEYS) if (providers[id]?.[k] !== undefined) next[k] = providers[id][k];
    if (providers[id]?.auth !== undefined && next.auth === undefined) next.auth = providers[id].auth;
    set(`models.providers.${id}`, providers, id, next);
  }
  config.agents ??= {};
  config.agents.defaults ??= {};
  for (const k of DEFAULT_KEYS) set(`agents.defaults.${k}`, config.agents.defaults, k, v.defaults[k]);
  for (const [id, agent] of Object.entries(config.agents.entries ?? {})) {
    if (!v.entries[id]) continue; // an agent V does not have keeps its own models
    for (const k of AGENT_KEYS) set(`agents.entries.${id}.${k}`, agent, k, v.entries[id][k]);
  }
  return changed;
}

export function missingCredentials(config) {
  return Object.entries(config.models?.providers ?? {})
    .filter(([, p]) => p.baseUrl && !/^https?:\/\/(127\.0\.0\.1|localhost)/u.test(p.baseUrl) && p.apiKey === undefined && p.headers === undefined)
    .map(([id]) => id);
}

function liveConfigPath(service) {
  const pid = execFileSync("systemctl", ["show", service, "-p", "MainPID", "--value"], { encoding: "utf8" }).trim();
  assert(Number(pid) > 0, `${service} is not running`);
  return fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").find((s) => s.startsWith("OPENCLAW_CONFIG_PATH="))?.slice("OPENCLAW_CONFIG_PATH=".length);
}

function writeAtomic(file, config, tag) {
  const raw = fs.readFileSync(file, "utf8");
  const stat = fs.statSync(file);
  const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
  const backup = `${file}.bak-${tag}-${stamp}`;
  fs.writeFileSync(backup, raw, { flag: "wx", mode: stat.mode & 0o777 });
  fs.chownSync(backup, stat.uid, stat.gid);
  const tmp = `${file}.tmp-${tag}-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: stat.mode & 0o777 });
  fs.chownSync(tmp, stat.uid, stat.gid);
  fs.renameSync(tmp, file);
  return backup;
}

function main() {
  const [mode, arg] = process.argv.slice(2);
  assert(["export", "plan", "apply-hot", "restore-hot"].includes(mode), "mode must be export|plan|apply-hot|restore-hot");
  assert.equal(process.getuid(), 0, "run as root");
  if (mode === "export") {
    assert.equal(os.hostname(), V.host, "export runs on production V");
    process.stdout.write(`${JSON.stringify(exportModels(JSON.parse(fs.readFileSync(V.config, "utf8"))), null, 1)}\n`);
    return;
  }
  assert.equal(os.hostname(), VLAB.host, "plan/apply runs on shared VLab");
  assert.equal(liveConfigPath(VLAB.service), VLAB.config, `${VLAB.service} reads a different config`);
  const config = JSON.parse(fs.readFileSync(VLAB.config, "utf8"));
  if (mode === "restore-hot") {
    assert(arg && arg.startsWith(`${VLAB.config}.bak-`), "restore-hot needs a backup of the live config");
    const backup = writeAtomic(VLAB.config, JSON.parse(fs.readFileSync(arg, "utf8")), "align-vlab-models-restore");
    console.log(JSON.stringify({ mode, restoredFrom: arg, backup }, null, 1));
    return;
  }
  const v = JSON.parse(fs.readFileSync(arg, "utf8"));
  const changed = applyModels(config, v);
  const out = { mode, file: VLAB.config, changed, providersWithoutCredential: missingCredentials(config) };
  if (mode === "apply-hot" && changed.length) {
    out.backup = writeAtomic(VLAB.config, config, "align-vlab-models");
    assert.equal(applyModels(JSON.parse(fs.readFileSync(VLAB.config, "utf8")), v).length, 0, "the file did not take V's model sections");
    out.next = "wait ~10 s for the Worker file to be derived, then roll the Worker generation (vlab.workers.roll)";
  }
  console.log(JSON.stringify(out, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
