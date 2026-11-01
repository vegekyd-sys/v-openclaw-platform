// Fit V's skills catalog into the system prompt, and report what actually gets in.
//
// Why: 9.1 renders the <available_skills> catalog under two limits, skills.limits.maxSkillsInPrompt
// (default 150, applied after sorting by name) and maxSkillsPromptChars (default 18,000). When the
// full catalog does not fit, it switches to a compact catalog, shortens and then drops every
// description, and finally keeps only the alphabetically first skills that fit. On V (2026-10-26)
// makaron has 339 prompt-visible skills: every session gets "included 109 of 339 (compact format,
// descriptions omitted)", i.e. skills "11" … "geelark-tiktok-login" by name only, and nothing from
// "gh-issues" to "zhongfang-aff-preshow" (makaron, scene-cli, lark-*, night-shift-*, wecom-*, …).
// V still reads many of those (AGENTS.md/TOOLS.md name makaron and scene-cli by path, the agent
// lists skill directories), but a skill nothing points to can only be found by luck.
//
// The fix uses the official knobs only: skills.limits (no restart: "skills" reloads as kind none)
// and skills.entries.<key>.enabled=false for skills Tianyi approves to switch off
// (config/v-skills-catalog.json). Nothing is deleted.
//
// Usage:
//   node v-skills-catalog.mjs report [--config FILE] [--proposal FILE] [--agent ID] [--core DIR] [--names]
//       Builds the snapshot with the runtime's own buildSkillSnapshot, read-only. Run it as the
//       Gateway's user with its HOME (on V: sudo -u openclaw env HOME=/home/openclaw ...), so the
//       same skill roots are found. --proposal applies the proposal in memory first.
//   node v-skills-catalog.mjs check|apply-hot [--proposal FILE]   (root)
//   node v-skills-catalog.mjs restore-hot --backup FILE             (root)
//       apply-hot/restore-hot write openclaw.json with the Gateway running; finish with
//       scripts/v-workers-roll.mjs so the Workers re-derive worker-openclaw.json and roll.
//       apply-hot prints the backup it wrote; restore-hot puts that backup's skills section back.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROPOSAL = path.join(here, "..", "config", "v-skills-catalog.json");

const targets = {
  "VM-8-2-ubuntu": {
    service: "openclaw-gateway.service",
    core: "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core",
    config: "/home/openclaw/.openclaw/openclaw.json",
    workerConfig: "/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json",
  },
  "VM-0-4-ubuntu": {
    service: "openclaw-vlab-production-mirror-v8.service",
    core: "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw",
    config: "/srv/vlab-production-mirror/labs/instances/db91-parity/state/openclaw.json",
    workerConfig: "/srv/vlab-production-mirror/labs/instances/db91-parity/state/worker-openclaw.json",
  },
};

export function readProposal(file = DEFAULT_PROPOSAL) {
  const proposal = JSON.parse(fs.readFileSync(file, "utf8"));
  assert(proposal.limits && typeof proposal.limits === "object", "proposal has no limits");
  for (const key of ["maxSkillsInPrompt", "maxSkillsPromptChars"]) {
    assert(Number.isInteger(proposal.limits[key]) && proposal.limits[key] > 0, `limits.${key} must be a positive integer`);
  }
  return { limits: proposal.limits, disable: Object.keys(proposal.disable ?? {}) };
}

// Mutates config; returns what changed.
export function applyProposal(config, proposal) {
  config.skills ??= {};
  const changes = [];
  const before = JSON.stringify(config.skills.limits ?? null);
  config.skills.limits = { ...config.skills.limits, ...proposal.limits };
  if (JSON.stringify(config.skills.limits) !== before) changes.push({ key: "skills.limits", from: JSON.parse(before), to: config.skills.limits });
  config.skills.entries ??= {};
  for (const key of proposal.disable) {
    const entry = config.skills.entries[key];
    if (entry?.enabled === false) continue;
    config.skills.entries[key] = { ...entry, enabled: false };
    changes.push({ key: `skills.entries.${key}.enabled`, from: entry?.enabled ?? null, to: false });
  }
  return changes;
}

// Put the skills section back exactly as the backup written by apply-hot has it; the rest of the
// config (changed by others since) is left alone.
export function restoreSkills(config, backup) {
  const before = JSON.stringify(config.skills ?? null);
  if (backup.skills === undefined) delete config.skills;
  else config.skills = backup.skills;
  return before === JSON.stringify(config.skills ?? null) ? [] : [{ key: "skills", restoredFrom: "backup" }];
}

export function pending(config, proposal) {
  const limits = config.skills?.limits ?? {};
  const limitsDiffer = Object.entries(proposal.limits).some(([k, v]) => limits[k] !== v);
  const stillEnabled = proposal.disable.filter((key) => config.skills?.entries?.[key]?.enabled !== false);
  return { limitsDiffer, stillEnabled };
}

// Parse the rendered catalog: names in order, the truncation note, the longest description kept.
export function describePrompt(prompt) {
  const names = [...prompt.matchAll(/<name>(.*?)<\/name>/gu)].map((m) => m[1]);
  const descriptions = [...prompt.matchAll(/<description>([\s\S]*?)<\/description>/gu)].map((m) => m[1]);
  const note = /⚠️[^\n]*/u.exec(prompt)?.[0] ?? null;
  return {
    promptChars: prompt.length,
    included: names.length,
    withDescription: descriptions.length,
    longestDescription: descriptions.reduce((max, d) => Math.max(max, d.length), 0),
    note,
    names,
  };
}

async function report(args) {
  const host = targets[os.hostname()];
  const core = args.core ?? host?.core;
  assert(core, "pass --core <runtime dir containing dist/>");
  const configPath = args.config ?? host?.config ?? process.env.OPENCLAW_CONFIG_PATH;
  assert(configPath, "pass --config <openclaw.json>");
  const dist = path.join(core, "dist");
  const moduleFile = fs.readdirSync(dist).find((f) => /^workspace-skill-prompt-[\w-]+\.js$/u.test(f));
  assert(moduleFile, `no workspace-skill-prompt-*.js in ${dist}`);
  const mod = await import(pathToFileURL(path.join(dist, moduleFile)).href);
  // export { resolveSkillsPrompt as n, buildSkillSnapshot as t }
  const buildSkillSnapshot = mod.t;
  assert.equal(typeof buildSkillSnapshot, "function", `${moduleFile} does not export buildSkillSnapshot as t`);

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (args.proposal) applyProposal(config, readProposal(args.proposal));
  const agentId = args.agent ?? "makaron";
  const agent = config.agents?.entries?.[agentId] ?? config.agents?.list?.find((a) => a.id === agentId);
  const workspaceDir = agent?.workspace ?? config.agents?.defaults?.workspace;
  assert(workspaceDir, `no workspace for agent ${agentId}`);

  const started = Date.now();
  const snapshot = buildSkillSnapshot(workspaceDir, { config, agentId, snapshotVersion: 1 });
  const described = describePrompt(snapshot.prompt);
  const eligible = snapshot.skills.map((s) => s.name);
  const included = new Set(described.names);
  const result = {
    host: os.hostname(), core, configPath, proposal: args.proposal ?? null, agentId, workspaceDir,
    limits: config.skills?.limits ?? null,
    eligible: eligible.length,
    ...described,
    excluded: eligible.filter((n) => !included.has(n)),
    elapsedMs: Date.now() - started,
  };
  if (!args.names) delete result.names;
  console.log(JSON.stringify(result, null, 1));
}

function edit(mode, args) {
  assert.equal(process.getuid(), 0, "run as root");
  const target = targets[os.hostname()];
  assert(target, `unknown host ${os.hostname()}: this configures production V or shared VLab only`);
  const proposal = readProposal(args.proposal ?? DEFAULT_PROPOSAL);
  const state = execFileSync("systemctl", ["show", target.service, "-p", "ActiveState", "--value"], { encoding: "utf8" }).trim();
  const read = (file) => {
    assert.equal(fs.realpathSync(file), file, `${file} is a symlink`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  const changes = [];
  if (mode !== "check") {
    assert(!["inactive", "failed"].includes(state), `${target.service} is not running; the hot path needs the Worker plugin to re-derive the Worker file`);
    const file = target.config;
    const raw = fs.readFileSync(file, "utf8");
    const config = JSON.parse(raw);
    let changed;
    if (mode === "apply-hot") changed = applyProposal(config, proposal);
    else {
      assert(args.backup, "restore-hot needs --backup <file written by apply-hot>");
      changed = restoreSkills(config, JSON.parse(fs.readFileSync(args.backup, "utf8")));
    }
    if (changed.length) {
      const stat = fs.statSync(file);
      const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "");
      const backup = `${file}.bak-skills-catalog-${stamp}`;
      fs.writeFileSync(backup, raw, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(backup, stat.uid, stat.gid);
      const tmp = `${file}.tmp-skills-catalog-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: stat.mode & 0o777 });
      fs.chownSync(tmp, stat.uid, stat.gid);
      fs.renameSync(tmp, file);
      changes.push({ file, backup, changed });
    }
  }
  const files = [target.config, target.workerConfig].map((file) => {
    const { limitsDiffer, stillEnabled } = pending(read(file), proposal);
    return { file, limits: read(file).skills?.limits ?? null, limitsDiffer, stillEnabled: stillEnabled.length };
  });
  if (mode === "apply-hot") {
    const gateway = pending(read(target.config), proposal);
    assert(!gateway.limitsDiffer && gateway.stillEnabled.length === 0, "openclaw.json did not take the proposal");
  }
  console.log(JSON.stringify({
    mode, host: os.hostname(), service: target.service, gatewayState: state,
    proposal: { limits: proposal.limits, disable: proposal.disable.length }, files, changes,
    next: mode !== "check" && changes.length ? "wait ~10 s, then node v-workers-roll.mjs skills-catalog, then rerun check: both files must agree" : undefined,
  }, null, 1));
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--names") args.names = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[(i += 1)];
    else args._.push(a);
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const [mode = "report"] = args._;
  assert(["report", "check", "apply-hot", "restore-hot"].includes(mode), "mode must be report|check|apply-hot|restore-hot");
  if (mode === "report") await report(args);
  else edit(mode, args);
}
