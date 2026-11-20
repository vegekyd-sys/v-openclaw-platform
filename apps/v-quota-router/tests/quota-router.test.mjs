import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { paceTier, recordSample, consumptionRate } from "../lib/pacing.mjs";
import { normalizeClaudeUsage, normalizeCodexRateLimits, readCodexRollouts, readClaudeUsage, codexFromUsageStatus } from "../lib/quota.mjs";
import { scoreSession } from "../lib/importance.mjs";
import { decide, commitAction } from "../lib/decide.mjs";

const H = 3_600_000;
const DAY = 24 * H;
const WEEK = 7 * DAY;
const NOW = Date.parse("2026-11-17T02:00:00Z");

// Shapes observed on V 2026-11-17 (account fields removed).
const claudeBody = {
  five_hour: null,
  seven_day: { utilization: 21.0, resets_at: "2026-11-21T19:00:00.804623+00:00", locked_reason: null },
  limits: [
    { kind: "weekly_all", group: "weekly", percent: 21, severity: "normal", resets_at: "2026-11-21T19:00:00.804623+00:00", scope: null, is_active: true },
    { kind: "weekly_scoped", group: "weekly", percent: 0, severity: "normal", resets_at: "2026-11-21T19:00:00+00:00", scope: { model: { id: null, display_name: "Fable" } }, is_active: false },
  ],
};
const codexRateLimits = { limit_id: "codex", limit_name: null, primary: { used_percent: 6.0, window_minutes: 10080, resets_at: 1795451338 }, secondary: null, credits: { has_credits: true, unlimited: false, balance: "1" }, plan_type: "pro", rate_limit_reached_type: null };

test("Claude usage body normalizes to a weekly window", () => {
  const s = normalizeClaudeUsage(claudeBody, NOW);
  assert.equal(s.weekly.usedPercent, 21);
  assert.equal(s.weekly.windowMs, WEEK);
  assert.equal(s.weekly.resetsAt, Date.parse("2026-11-21T19:00:00.804Z"));
  assert.equal(s.fiveHour, null);
  assert.equal(s.weekly.limited, false);
  assert.equal(s.scoped.length, 0, "inactive scoped limits are ignored");
});

test("Codex rate_limits with only a weekly primary window (Pro has no 5h limit)", () => {
  const s = normalizeCodexRateLimits(codexRateLimits, NOW);
  assert.equal(s.weekly.usedPercent, 6);
  assert.equal(s.weekly.windowMs, WEEK);
  assert.equal(s.weekly.resetsAt, 1795451338000);
  assert.equal(s.fiveHour, null);
  assert.equal(normalizeCodexRateLimits({ ...codexRateLimits, rate_limit_reached_type: "primary" }, NOW).weekly.limited, true);
  const camel = normalizeCodexRateLimits({ primary: { usedPercent: 50, windowDurationMins: 300, resetsAt: 1795400000 }, secondary: { usedPercent: 10, windowDurationMins: 10080, resetsAt: 1795451338 } }, NOW);
  assert.equal(camel.fiveHour.usedPercent, 50);
  assert.equal(camel.weekly.usedPercent, 10);
});

test("rollout reader finds the newest token_count without walking the tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qr-rollouts-"));
  const d = new Date(NOW);
  const dir = path.join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
  fs.mkdirSync(dir, { recursive: true });
  const line = (ts, used, limitId = "codex") => JSON.stringify({ timestamp: ts, type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: { ...codexRateLimits, limit_id: limitId, primary: { ...codexRateLimits.primary, used_percent: used } } } });
  fs.writeFileSync(path.join(dir, "rollout-a.jsonl"), [line("2026-11-17T01:00:00Z", 4), line("2026-11-17T01:30:00Z", 5)].join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "rollout-b.jsonl"), [line("2026-11-17T01:50:00Z", 6), line("2026-11-17T01:55:00Z", 99, "other")].join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "rollout-deepseek.jsonl"), JSON.stringify({ timestamp: "2026-11-17T01:59:00Z", type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: { limit_id: "codex", primary: null, secondary: null, plan_type: null, rate_limit_reached_type: null } } }) + "\n");
  const r = readCodexRollouts({ sessionsDirs: [root], now: NOW });
  assert.equal(r.snapshot.weekly.usedPercent, 6);
  assert.equal(r.stale, false);
  assert.equal(readCodexRollouts({ sessionsDirs: [root], now: NOW + 5 * H }).stale, true);
});

test("Codex from usage.status provider windows", () => {
  const s = codexFromUsageStatus({ updatedAt: NOW, providers: [{ provider: "openai", displayName: "Codex", windows: [{ label: "Week", usedPercent: 30, resetAt: NOW + DAY }] }] }, NOW);
  assert.equal(s.weekly.usedPercent, 30);
});

test("Claude reader never touches an expired token and respects the poll interval", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qr-claude-"));
  const cred = path.join(dir, "c.json");
  let calls = 0;
  const fetchFn = async () => { calls += 1; return { ok: true, json: async () => claudeBody }; };
  fs.writeFileSync(cred, JSON.stringify({ claudeAiOauth: { accessToken: "x", refreshToken: "y", expiresAt: NOW - 1 } }));
  const expired = await readClaudeUsage({ credentialsPath: cred, now: NOW, fetchFn });
  assert.equal(calls, 0);
  assert.equal(expired.stale, true);
  fs.writeFileSync(cred, JSON.stringify({ claudeAiOauth: { accessToken: "x", expiresAt: NOW + H } }));
  const fresh = await readClaudeUsage({ credentialsPath: cred, now: NOW, fetchFn });
  assert.equal(calls, 1);
  assert.equal(fresh.snapshot.weekly.usedPercent, 21);
  assert.equal(JSON.stringify(fresh.cache).includes("refresh"), false);
  const again = await readClaudeUsage({ credentialsPath: cred, cache: fresh.cache, now: NOW + 60_000, fetchFn });
  assert.equal(calls, 1, "cached within the poll interval");
  assert.equal(again.source, "cache");
  const limited = async () => ({ ok: false, status: 429 });
  const r429 = await readClaudeUsage({ credentialsPath: cred, cache: fresh.cache, now: NOW + 20 * 60_000, fetchFn: limited });
  assert.equal(r429.source, "cache");
  assert.match(r429.note, /429/);
});

const weekly = (used, resetInH) => ({ usedPercent: used, resetsAt: NOW + resetInH * H, windowMs: WEEK, limited: false });

test("pacing: slow week has surplus, fast week brakes, hard stop exhausts", () => {
  // 21% used after ~2.3 days with 4.7 days left: average rate projects ~64%, budget 85% -> surplus.
  const slow = paceTier({ weekly: weekly(21, 113), samples: [], now: NOW });
  assert.equal(slow.state, "surplus");
  assert.ok(slow.slots >= 1);
  // 60% used after 2 days: projects way past 85%.
  const fast = paceTier({ weekly: weekly(60, 120), samples: [], now: NOW });
  assert.equal(fast.state, "brake");
  assert.equal(paceTier({ weekly: weekly(91, 10), samples: [], now: NOW }).state, "exhausted");
  assert.equal(paceTier({ weekly: { ...weekly(10, 100), limited: true }, samples: [], now: NOW }).state, "exhausted");
  assert.equal(paceTier({ weekly: weekly(10, 100), fiveHour: { usedPercent: 90 }, samples: [], now: NOW }).state, "exhausted");
  assert.equal(paceTier({ weekly: weekly(10, 100), fiveHour: { usedPercent: 75 }, samples: [], now: NOW }).state, "hold");
});

test("pacing: recent samples override the window average; endgame spends what is left", () => {
  // 30% used over 3.5 days (avg 0.36%/h) but the last 6 h burned 6% (1%/h) with 84 h left -> 114% projected.
  const samples = [{ t: NOW - 6 * H, used: 24 }, { t: NOW, used: 30 }];
  const r = consumptionRate(weekly(30, 84), samples, NOW);
  assert.equal(r.basis, "samples");
  assert.equal(paceTier({ weekly: weekly(30, 84), samples, now: NOW }).state, "brake");
  // 12 h before reset with 50% used: projection noise ignored, 35% headroom spent.
  const end = paceTier({ weekly: weekly(50, 12), samples: [], now: NOW });
  assert.equal(end.state, "surplus");
  assert.equal(end.endgame, true);
  assert.equal(end.surplusPercent, 35);
});

test("recordSample keeps one window and drops samples from before a reset", () => {
  let s = recordSample([], weekly(10, 100), NOW);
  s = recordSample(s, weekly(10, 100), NOW + 60_000);
  assert.equal(s.length, 1, "unchanged and within the gap");
  s = recordSample(s, weekly(12, 99), NOW + H);
  assert.equal(s.length, 2);
  const reset = recordSample(s, { ...weekly(1, 200), resetsAt: NOW + 200 * H }, NOW + 2 * H);
  assert.deepEqual(reset.map((x) => x.used), [1]);
});

const owner = "feishu:ou_owner";
const row = (key, extra = {}) => ({ key, chatType: key.includes(":group:") ? "group" : "direct", kind: key.includes(":group:") ? "group" : "direct", modelProvider: "deepseek", model: "vds-deepseek-flash", modelOverrideSource: null, lastInteractionAt: NOW - 10 * 60_000, totalTokens: 50_000, participants: [], ...extra });

test("importance: owner DM, owner-only group, VIP, pinned, exclusions", () => {
  const imp = { ownerIds: [owner], vip: { "feishu:group:oc_vip": 45 } };
  const dm = scoreSession(row("agent:makaron:feishu:direct:ou_owner"), NOW, imp);
  assert.equal(dm.ownerOnly, true);
  assert.ok(dm.score >= 70, JSON.stringify(dm));
  const stranger = scoreSession(row("agent:makaron:feishu:direct:ou_someone"), NOW, imp);
  assert.equal(stranger.ownerOnly, false);
  assert.ok(stranger.score < 40);
  const soloGroup = scoreSession(row("agent:makaron:feishu:group:oc_solo", { participants: [{ identity: { type: "observation", pluginId: "feishu", id: "ou_owner", senderKind: "human" } }] }), NOW, imp);
  assert.equal(soloGroup.ownerOnly, true);
  const withCliAndAgent = scoreSession(row("agent:makaron:feishu:group:oc_solo2", { participants: [{ identity: { type: "observation", pluginId: "feishu", id: "ou_owner", senderKind: "human" } }, { identity: { type: "observation", pluginId: null, id: "cli", senderKind: "unknown" } }, { identity: { type: "agent", id: "v-codex" } }] }), NOW, imp);
  assert.equal(withCliAndAgent.ownerOnly, true, "operator CLI and agents are not people");
  const sharedGroup = scoreSession(row("agent:makaron:feishu:group:oc_vip", { participants: [{ identity: { type: "observation", pluginId: "feishu", id: "ou_owner", senderKind: "human" } }, { identity: { type: "observation", pluginId: "feishu", id: "ou_other", senderKind: "human" } }] }), NOW, imp);
  assert.equal(sharedGroup.ownerOnly, false);
  assert.ok(sharedGroup.score >= 45);
  assert.ok(scoreSession(row("agent:makaron:feishu:group:oc_x", { pinned: true }), NOW, imp).score >= 30);
  assert.equal(scoreSession(row("agent:makaron:cron:daily"), NOW, imp).excluded, true);
  assert.equal(scoreSession(row("agent:makaron:subagent:abc"), NOW, imp).excluded, true);
  assert.equal(scoreSession(row("agent:makaron:feishu:direct:ou_owner", { lastInteractionAt: NOW - 3 * DAY }), NOW, imp).excluded, true);
});

const tiers = [
  { id: "claude", model: "anthropic/claude-opus-5-5", quota: "claude", maxSessions: 2, ownerOnly: true, maxTotalTokens: 300_000 },
  { id: "codex", model: "openai/gpt-6.1-sol", quota: "codex", maxSessions: 3, ownerOnly: false, maxTotalTokens: 250_000 },
];
const surplus = (pct, slots = 3) => ({ state: "surplus", surplusPercent: pct, slots, endgame: false });
const importance = { ownerIds: [owner], vip: { "feishu:group:oc_vip": 45 } };

test("decide: upgrades the most important default session onto the quota most likely to be wasted", () => {
  const rows = [row("agent:makaron:feishu:direct:ou_owner"), row("agent:makaron:feishu:group:oc_vip", { participants: [{ identity: { type: "observation", pluginId: "feishu", id: "ou_other", senderKind: "human" } }] }), row("agent:makaron:feishu:group:oc_low")];
  const out = decide({ now: NOW, tiers, pace: { claude: surplus(40), codex: surplus(20) }, rows, ledger: { sessions: {} }, importance });
  assert.deepEqual(out.actions.map((a) => [a.type, a.key, a.tier]), [["upgrade", "agent:makaron:feishu:direct:ou_owner", "claude"]]);
  // Two ticks later the VIP group (others present) goes to Codex, never Claude.
  let ledger = commitAction(out.ledger, out.actions[0], NOW);
  const rows2 = rows.map((r) => (r.key.endsWith("ou_owner") ? { ...r, modelProvider: "anthropic", model: "claude-opus-5-5", modelOverrideSource: "user" } : r));
  const out2 = decide({ now: NOW, tiers, pace: { claude: surplus(40), codex: surplus(20) }, rows: rows2, ledger, policy: { maxUpgradesPerTick: 5 }, importance });
  assert.deepEqual(out2.actions.map((a) => [a.type, a.key, a.tier]), [["upgrade", "agent:makaron:feishu:group:oc_vip", "codex"]]);
});

test("decide: never touches user-chosen models and releases sessions the user moved", () => {
  const rows = [row("agent:makaron:feishu:direct:ou_owner", { modelProvider: "anthropic", model: "claude-opus-5-5", modelOverrideSource: "user" })];
  const none = decide({ now: NOW, tiers, pace: { claude: surplus(40), codex: surplus(40) }, rows, ledger: { sessions: {} } });
  assert.equal(none.actions.length, 0, "a session the user put on /vcc is not ours");
  const ledger = { sessions: { "agent:makaron:feishu:direct:ou_owner": { tier: "codex", model: "openai/gpt-6.1-sol", upgradedAt: NOW - DAY } } };
  const out = decide({ now: NOW, tiers, pace: { claude: { state: "exhausted", reason: "x" }, codex: { state: "exhausted", reason: "x" } }, rows, ledger });
  assert.deepEqual(out.actions.map((a) => a.type), ["release"]);
  assert.deepEqual(out.ledger.sessions, {});
});

test("decide: exhausted reverts all of a tier, brake sheds the least important after the hold time", () => {
  const k1 = "agent:makaron:feishu:direct:ou_owner";
  const k2 = "agent:makaron:feishu:group:oc_a";
  const onClaude = { modelProvider: "anthropic", model: "claude-opus-5-5", modelOverrideSource: "user" };
  const rows = [row(k1, onClaude), row(k2, onClaude)];
  const ledger = { sessions: { [k1]: { tier: "claude", model: "anthropic/claude-opus-5-5", upgradedAt: NOW - 3 * H, score: 80 }, [k2]: { tier: "claude", model: "anthropic/claude-opus-5-5", upgradedAt: NOW - 3 * H, score: 30 } } };
  const ex = decide({ now: NOW, tiers, pace: { claude: { state: "exhausted", reason: "429" }, codex: surplus(0, 0) }, rows, ledger });
  assert.deepEqual(ex.actions.filter((a) => a.type === "revert").map((a) => a.key).sort(), [k1, k2].sort());
  const br = decide({ now: NOW, tiers, pace: { claude: { state: "brake", reason: "fast" }, codex: { state: "hold" } }, rows, ledger });
  assert.deepEqual(br.actions.map((a) => [a.type, a.key]), [["revert", k2]]);
  const young = { sessions: Object.fromEntries(Object.entries(ledger.sessions).map(([k, v]) => [k, { ...v, upgradedAt: NOW - 10 * 60_000 }])) };
  assert.equal(decide({ now: NOW, tiers, pace: { claude: { state: "brake", reason: "fast" }, codex: { state: "hold" } }, rows, ledger: young }).actions.length, 0, "minHold protects fresh switches");
  const busy = rows.map((r) => ({ ...r, hasActiveRun: true }));
  const deferred = decide({ now: NOW, tiers, pace: { claude: { state: "exhausted", reason: "x" }, codex: { state: "hold" } }, rows: busy, ledger });
  assert.equal(deferred.actions.length, 0, "never patch a session while it runs");
});

test("decide: unknown or stale quota never upgrades; oversized sessions are skipped", () => {
  const rows = [row("agent:makaron:feishu:direct:ou_owner")];
  assert.equal(decide({ now: NOW, tiers, pace: { claude: { state: "unknown" }, codex: { state: "hold" } }, rows, ledger: { sessions: {} }, importance }).actions.length, 0);
  const big = [row("agent:makaron:feishu:direct:ou_owner", { totalTokens: 900_000 })];
  assert.equal(decide({ now: NOW, tiers, pace: { claude: surplus(40), codex: surplus(40) }, rows: big, ledger: { sessions: {} }, importance }).actions.length, 0);
});

test("decide: a switched session missing from the one-day active list is reverted as idle", () => {
  const k = "agent:makaron:feishu:direct:ou_owner";
  const ledger = { sessions: { [k]: { tier: "claude", model: "anthropic/claude-opus-5-5", upgradedAt: NOW - 30 * H, score: 80 } } };
  const out = decide({ now: NOW, tiers, pace: { claude: surplus(40), codex: surplus(40) }, rows: [], ledger, importance, listActiveMinutes: 1440 });
  assert.deepEqual(out.actions.map((a) => [a.type, a.key]), [["revert", k]]);
  const wide = decide({ now: NOW, tiers, pace: { claude: surplus(40), codex: surplus(40) }, rows: [], ledger, importance, listActiveMinutes: 4320 });
  assert.equal(wide.actions.length, 0, "absence from a wider list proves nothing about the last day");
});
