#!/usr/bin/env node
// v-quota-router: move important conversations to subscription models (/vcc, /vcodex)
// while the week's subscription quota would otherwise expire unused, and move them
// back to the agent default (/vds) before the quota runs out.
//
//   node quota-router.mjs probe            read quota and print pacing (no Gateway)
//   node quota-router.mjs tick [--dry-run] one controller pass (systemd timer runs this)
//   node quota-router.mjs release-all      revert every session this controller switched
//
// Config and state live in <stateDir>/v-quota-router/ (see README.md).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { paceTier, recordSample, DEFAULT_PACING } from "./lib/pacing.mjs";
import { readClaudeUsage, readCodexRollouts, codexFromUsageStatus, normalizeClaudeUsage, normalizeCodexRateLimits } from "./lib/quota.mjs";
import { decide, commitAction, rowModelRef } from "./lib/decide.mjs";
import { connectGateway, detectGatewayDist, resolveGatewayToken, listSessions, patchSessionModel } from "./lib/gateway.mjs";

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "tick";
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const home = os.homedir();
const openclawConfigPath = option("openclaw-config") ?? process.env.OPENCLAW_CONFIG_PATH ?? path.join(home, ".openclaw", "openclaw.json");
const stateDir = option("state-dir") ?? path.join(process.env.OPENCLAW_STATE_DIR ?? path.join(home, ".openclaw"), "v-quota-router");
const configPath = option("config") ?? path.join(stateDir, "config.json");
const statePath = path.join(stateDir, "state.json");
const eventsPath = path.join(stateDir, "events.jsonl");
const now = Number(option("now") ?? Date.now());

const DEFAULT_CONFIG = {
  mode: "dry-run", // dry-run | apply | off (off reverts everything it switched)
  agentId: "makaron",
  // sessions.list on V: ~1.7 s warm, 5.8-7 s cold (2026-11-17). Only sessions active within a
  // day can score anyway, so list one day and at most 60 rows.
  listActiveMinutes: 1440,
  listLimit: 60,
  tiers: [
    { id: "claude", model: "anthropic/claude-opus-5-5", quota: "claude", maxSessions: 2, ownerOnly: true, maxTotalTokens: 300_000 },
    { id: "codex", model: "openai/gpt-6.1-sol", quota: "codex", maxSessions: 3, ownerOnly: false, maxTotalTokens: 250_000 },
  ],
  pacing: { claude: {}, codex: {} },
  policy: {},
  importance: {},
  claude: { credentialsPath: path.join(home, ".claude", ".credentials.json"), minIntervalMinutes: 15 },
  codex: { sessionsDirs: [], usageStatusFallback: true },
  gateway: { url: null, dist: null, unit: "openclaw-gateway.service" },
};

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } };
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function logEvent(event) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  try { if (fs.statSync(eventsPath).size > 5 * 1024 * 1024) fs.renameSync(eventsPath, `${eventsPath}.1`); } catch { /* first write */ }
  fs.appendFileSync(eventsPath, `${JSON.stringify({ t: new Date(now).toISOString(), ...event })}\n`, { mode: 0o600 });
}

function loadConfig(openclaw) {
  const user = readJson(configPath, {});
  const cfg = { ...DEFAULT_CONFIG, ...user };
  for (const k of ["claude", "codex", "gateway", "pacing", "policy", "importance"]) cfg[k] = { ...DEFAULT_CONFIG[k], ...(user[k] ?? {}) };
  if (!cfg.codex.sessionsDirs.length) cfg.codex.sessionsDirs = [path.join(path.dirname(openclawConfigPath), "agents", cfg.agentId, "agent", "codex-home", "sessions")];
  if (!cfg.importance.ownerIds) cfg.importance.ownerIds = (openclaw?.commands?.ownerAllowFrom ?? []).map(String);
  if (!cfg.gateway.url && openclaw?.gateway?.port) cfg.gateway.url = `ws://127.0.0.1:${openclaw.gateway.port}`;
  return cfg;
}

async function readQuota(cfg, state, gw) {
  const fixture = option("quota-fixture");
  if (fixture) {
    const f = readJson(fixture, {});
    return {
      claude: { snapshot: f.claudeBody ? normalizeClaudeUsage(f.claudeBody, now) : f.claude ?? null, source: "fixture", stale: false },
      codex: { snapshot: f.codexRateLimits ? normalizeCodexRateLimits(f.codexRateLimits, now) : f.codex ?? null, source: "fixture", stale: false },
    };
  }
  const claude = await readClaudeUsage({ credentialsPath: cfg.claude.credentialsPath, cache: state.claudeCache, now, minIntervalMs: cfg.claude.minIntervalMinutes * 60_000 });
  state.claudeCache = claude.cache;
  let codex = readCodexRollouts({ sessionsDirs: cfg.codex.sessionsDirs, now });
  if ((codex.stale || !codex.snapshot) && cfg.codex.usageStatusFallback && gw) {
    try {
      const fromStatus = codexFromUsageStatus(await gw.call("usage.status", {}, 30_000), now);
      if (fromStatus?.weekly) codex = { snapshot: fromStatus, source: "usage.status", stale: false, note: "rollouts stale" };
    } catch (error) {
      codex.note = `${codex.note}; usage.status failed: ${error.message}`;
    }
  }
  return { claude, codex };
}

function paceAll(cfg, quota, state) {
  state.samples ??= {};
  const pace = {};
  for (const key of ["claude", "codex"]) {
    const q = quota[key];
    const weekly = q?.snapshot?.weekly;
    if (weekly && !q.stale) state.samples[key] = recordSample(state.samples[key], weekly, q.snapshot.observedAt ?? now);
    const p = q?.stale && !weekly
      ? { state: "unknown", reason: q?.note ?? "no data", slots: 0 }
      : paceTier({ weekly, fiveHour: q?.snapshot?.fiveHour, samples: state.samples[key], now, config: { ...DEFAULT_PACING, ...(cfg.pacing[key] ?? {}) } });
    // A stale reading never authorizes new spending, but still enforces stops.
    if (q?.stale && p.state === "surplus") Object.assign(p, { state: "hold", reason: `stale reading (${q.note})`, slots: 0 });
    pace[key] = { ...p, source: q?.source, note: q?.note };
  }
  return pace;
}

async function withLock(fn) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lock = path.join(stateDir, "LOCK");
  let fd;
  try { fd = fs.openSync(lock, "wx"); } catch {
    const age = now - fs.statSync(lock).mtimeMs;
    if (age < 15 * 60_000) throw new Error("another tick is running (LOCK)");
    fs.rmSync(lock, { force: true });
    fd = fs.openSync(lock, "wx");
  }
  try { return await fn(); } finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
}

async function main() {
  const openclaw = readJson(openclawConfigPath, null);
  const cfg = loadConfig(openclaw);
  if (fs.existsSync(path.join(stateDir, "PAUSE")) && command === "tick") {
    console.log(JSON.stringify({ paused: true }));
    return;
  }
  const state = readJson(statePath, { version: 1, ledger: { sessions: {} } });

  if (command === "probe") {
    const quota = await readQuota(cfg, state, null);
    const pace = paceAll(cfg, quota, state);
    if (!option("quota-fixture")) writeJsonAtomic(statePath, state);
    console.log(JSON.stringify({ at: new Date(now).toISOString(), pace }, null, 2));
    return;
  }

  await withLock(async () => {
    const dist = cfg.gateway.dist ?? detectGatewayDist(cfg.gateway.unit);
    const gw = await connectGateway({ dist, url: cfg.gateway.url, token: resolveGatewayToken(openclaw) });
    try {
      const quota = await readQuota(cfg, state, gw);
      const pace = paceAll(cfg, quota, state);
      const listStarted = Date.now();
      const { rows, defaults } = await listSessions(gw, { agentId: cfg.agentId, activeMinutes: cfg.listActiveMinutes, limit: cfg.listLimit });
      const listMs = Date.now() - listStarted;
      const mode = command === "release-all" ? "off" : cfg.mode;
      const apply = mode !== "dry-run" && !flag("dry-run");
      let plan;
      if (mode === "off") {
        const byKey = new Map(rows.map((r) => [r.key, r]));
        plan = { actions: [], notes: [], candidates: [], ledger: state.ledger };
        for (const [key, entry] of Object.entries(state.ledger.sessions ?? {})) {
          const row = byKey.get(key);
          if (row && rowModelRef(row) === entry.model) plan.actions.push({ type: "revert", key, tier: entry.tier, why: "controller off" });
          else plan.actions.push({ type: "release", key, tier: entry.tier, why: row ? "model changed by someone else" : "not in active list" });
        }
      } else {
        plan = decide({ now, tiers: cfg.tiers, pace, rows, ledger: state.ledger, policy: cfg.policy, importance: cfg.importance, listActiveMinutes: cfg.listActiveMinutes });
      }
      let ledger = plan.ledger;
      const results = [];
      for (const action of plan.actions) {
        if (action.type === "release") { if (apply) ledger = commitAction(ledger, action, now); results.push({ ...action, done: apply }); continue; }
        if (!apply) { results.push({ ...action, done: false }); continue; }
        try {
          const after = await patchSessionModel(gw, { key: action.key, model: action.type === "upgrade" ? action.model : null });
          const want = action.type === "upgrade" ? action.model : `${defaults.modelProvider}/${defaults.model}`;
          const done = after.ok && (after.modelRef === want || (action.type === "revert" && after.overrideSource === null));
          if (done) ledger = commitAction(ledger, action, now);
          results.push({ ...action, done, after });
        } catch (error) {
          results.push({ ...action, done: false, error: error.message });
        }
      }
      if (apply) state.ledger = ledger;
      writeJsonAtomic(statePath, state);
      const report = { at: new Date(now).toISOString(), mode, applied: apply, defaultModel: `${defaults.modelProvider}/${defaults.model}`, pace, rows: rows.length, listMs, managed: Object.keys(state.ledger.sessions ?? {}), actions: results, notes: plan.notes, candidates: plan.candidates };
      if (results.length || flag("verbose")) logEvent({ mode, applied: apply, listMs, pace: Object.fromEntries(Object.entries(pace).map(([k, p]) => [k, { state: p.state, used: p.usedPercent, surplus: p.surplusPercent }])), actions: results, ...(apply ? {} : { candidates: plan.candidates }) });
      console.log(JSON.stringify(report, null, 2));
    } finally {
      gw.stop();
    }
  });
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
