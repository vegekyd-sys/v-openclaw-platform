// Read subscription quota without spending any of it.
//
// Claude: GET /api/oauth/usage with the access token Claude Code already holds
//   (read-only; never refreshes the token, because Claude's refresh tokens are
//   single-use and a refresh here would log the CLI out). The endpoint is rate
//   limited per account and shared with the owner's own Claude Code statusline,
//   so it is polled at most every `minIntervalMs` and a cached value is reused.
// Codex: the newest `token_count` event in the Codex rollouts (written by every
//   GPT turn, zero extra requests), or Gateway `usage.status` when that is stale.

import fs from "node:fs";
import path from "node:path";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const FIVE_HOURS = 5 * 3_600_000;

// ---------------------------------------------------------------- Claude

/** Normalize the /api/oauth/usage body into { weekly, fiveHour, scoped[] }. */
export function normalizeClaudeUsage(body, observedAt) {
  const window = (w, windowMs, label) => {
    if (!w || !Number.isFinite(w.utilization)) return null;
    const resetsAt = Date.parse(w.resets_at);
    if (!Number.isFinite(resetsAt)) return null;
    return { label, usedPercent: w.utilization, resetsAt, windowMs, limited: w.utilization >= 100 || Boolean(w.locked_reason) };
  };
  const weekly = window(body?.seven_day, WEEK, "claude-week");
  const fiveHour = window(body?.five_hour, FIVE_HOURS, "claude-5h");
  const scoped = [];
  for (const limit of Array.isArray(body?.limits) ? body.limits : []) {
    if (limit?.kind !== "weekly_scoped" || limit.is_active !== true) continue;
    scoped.push({ label: `claude-week:${limit.scope?.model?.display_name ?? "scoped"}`, usedPercent: limit.percent, resetsAt: Date.parse(limit.resets_at), windowMs: WEEK, limited: limit.percent >= 100 });
  }
  // A non-normal severity on an active limit means Anthropic is already warning or blocking.
  const severities = (Array.isArray(body?.limits) ? body.limits : []).filter((l) => l?.is_active).map((l) => l.severity);
  if (weekly && severities.some((s) => s && s !== "normal" && s !== "warning")) weekly.limited = true;
  return { provider: "claude", observedAt, weekly, fiveHour, scoped };
}

/**
 * Read Claude usage. Never refreshes OAuth tokens. Returns { snapshot, source, stale, note }.
 * `cache` is { observedAt, body } from the previous successful read (or undefined).
 */
export async function readClaudeUsage({ credentialsPath, cache, now = Date.now(), minIntervalMs = 15 * 60_000, fetchFn = fetch, timeoutMs = 10_000 }) {
  const fromCache = (note) => cache?.body
    ? { snapshot: normalizeClaudeUsage(cache.body, cache.observedAt), source: "cache", stale: now - cache.observedAt > 2 * minIntervalMs, note, cache }
    : { snapshot: null, source: "none", stale: true, note, cache };
  if (cache?.observedAt && now - cache.observedAt < minIntervalMs) return fromCache("fresh cache");
  let oauth;
  try {
    oauth = JSON.parse(fs.readFileSync(credentialsPath, "utf8")).claudeAiOauth;
  } catch (error) {
    return fromCache(`credentials unreadable: ${error.code ?? error.message}`);
  }
  if (!oauth?.accessToken) return fromCache("no access token");
  if (Number.isFinite(oauth.expiresAt) && oauth.expiresAt < now + 60_000) {
    // Claude Code refreshes its own token on its next turn; do not touch the refresh token.
    return fromCache("access token expired (refreshed only by Claude Code itself)");
  }
  try {
    const response = await fetchFn("https://api.anthropic.com/api/oauth/usage", {
      headers: { Authorization: `Bearer ${oauth.accessToken}`, "anthropic-beta": "oauth-2025-04-20", "User-Agent": "v-quota-router" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return fromCache(`usage endpoint HTTP ${response.status}`);
    const body = await response.json();
    const next = { observedAt: now, body: pickClaudeFields(body) };
    return { snapshot: normalizeClaudeUsage(next.body, now), source: "oauth-usage", stale: false, note: "fetched", cache: next };
  } catch (error) {
    return fromCache(`usage endpoint failed: ${error.name === "TimeoutError" ? "timeout" : error.message}`);
  }
}

// Keep only the fields we use; the body also carries account-level details we do not store.
function pickClaudeFields(body) {
  return {
    five_hour: body?.five_hour ?? null,
    seven_day: body?.seven_day ?? null,
    limits: Array.isArray(body?.limits) ? body.limits.map((l) => ({ kind: l.kind, percent: l.percent, severity: l.severity, resets_at: l.resets_at, is_active: l.is_active, scope: l.scope?.model ? { model: { display_name: l.scope.model.display_name } } : null })) : [],
  };
}

// ---------------------------------------------------------------- Codex

/** Normalize a Codex `rate_limits` object (rollout token_count / app-server snake_case). */
export function normalizeCodexRateLimits(rateLimits, observedAt) {
  if (!rateLimits || typeof rateLimits !== "object") return null;
  const windows = [];
  for (const key of ["primary", "secondary"]) {
    const w = rateLimits[key];
    if (!w) continue;
    const usedPercent = w.used_percent ?? w.usedPercent;
    const minutes = w.window_minutes ?? w.windowDurationMins;
    const resetsAtS = w.resets_at ?? w.resetsAt;
    if (!Number.isFinite(usedPercent) || !Number.isFinite(minutes) || !Number.isFinite(resetsAtS)) continue;
    windows.push({ label: `codex-${minutes}m`, usedPercent, resetsAt: resetsAtS * 1000, windowMs: minutes * 60_000, limited: usedPercent >= 100 });
  }
  const reached = rateLimits.rate_limit_reached_type ?? rateLimits.rateLimitReachedType ?? null;
  const weekly = windows.filter((w) => w.windowMs >= 2 * DAY).sort((a, b) => b.windowMs - a.windowMs)[0] ?? null;
  const fiveHour = windows.filter((w) => w.windowMs < 2 * DAY).sort((a, b) => a.windowMs - b.windowMs)[0] ?? null;
  if (reached && weekly) weekly.limited = true;
  return { provider: "codex", observedAt, weekly, fiveHour, plan: rateLimits.plan_type ?? rateLimits.planType ?? null, reached };
}

const localDay = (ms) => {
  const d = new Date(ms);
  return [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")];
};

/**
 * Newest Codex rate-limit snapshot from rollouts. Only today's and yesterday's
 * day directories are listed (no recursive walk) and only each file's tail is read.
 */
export function readCodexRollouts({ sessionsDirs, now = Date.now(), maxFiles = 400, tailBytes = 256 * 1024 }) {
  const files = [];
  for (const root of sessionsDirs) {
    for (const day of [now, now - DAY]) {
      const dir = path.join(root, ...localDay(day));
      let names = [];
      try { names = fs.readdirSync(dir).filter((n) => n.startsWith("rollout-") && n.endsWith(".jsonl")); } catch { continue; }
      for (const name of names) {
        try { files.push({ file: path.join(dir, name), mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs }); } catch { /* raced with deletion */ }
      }
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  let best = null;
  for (const { file, mtimeMs } of files.slice(0, maxFiles)) {
    if (best && mtimeMs < best.observedAt) break;
    if (!isOpenAiRollout(file)) continue;
    const found = lastRateLimits(file, tailBytes);
    if (found && (!best || found.observedAt > best.observedAt)) best = { ...found, file };
  }
  if (!best) return { snapshot: null, source: "rollouts", stale: true, note: `no rate_limits in ${files.length} recent rollouts` };
  return { snapshot: normalizeCodexRateLimits(best.rateLimits, best.observedAt), source: "rollouts", stale: now - best.observedAt > 3 * 3_600_000, note: path.basename(best.file) };
}

// The session_meta line at the top names the provider; /vds (DeepSeek) rollouts are the
// majority on V and are skipped after reading 8 KB instead of their tails.
function isOpenAiRollout(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(8192);
    const n = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, n).toString("utf8");
    const m = /"model_provider":"([^"]+)"/.exec(head);
    return !m || m[1] === "openai";
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function lastRateLimits(file, tailBytes) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, tailBytes);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line.includes('"rate_limits"') || !line.includes('"token_count"')) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      const rateLimits = event?.payload?.rate_limits;
      if (!rateLimits || (rateLimits.limit_id && rateLimits.limit_id !== "codex")) continue;
      // DeepSeek (/vds) turns write an all-null rate_limits object; it says nothing about ChatGPT.
      if (!rateLimits.primary && !rateLimits.secondary) continue;
      return { rateLimits, observedAt: Date.parse(event.timestamp) };
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Extract a Codex snapshot from Gateway `usage.status` (OpenClaw's own app-server read). */
export function codexFromUsageStatus(summary, observedAt) {
  const provider = (summary?.providers ?? []).find((p) => /codex|openai/i.test(`${p.provider} ${p.displayName}`) && Array.isArray(p.windows) && p.windows.length);
  if (!provider || provider.error) return null;
  const windows = provider.windows
    .filter((w) => Number.isFinite(w.usedPercent) && Number.isFinite(w.resetAt))
    .map((w) => ({ label: `codex-${w.label}`, usedPercent: w.usedPercent, resetsAt: w.resetAt, windowMs: /5\s*h/i.test(w.label) ? FIVE_HOURS : WEEK, limited: w.usedPercent >= 100 }));
  return {
    provider: "codex",
    observedAt: summary.updatedAt ?? observedAt,
    weekly: windows.find((w) => w.windowMs === WEEK) ?? null,
    fiveHour: windows.find((w) => w.windowMs === FIVE_HOURS) ?? null,
    plan: provider.plan ?? null,
  };
}
