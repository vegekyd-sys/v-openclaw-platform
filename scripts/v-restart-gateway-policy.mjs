// Pure decision logic for scripts/v-restart-gateway.mjs (no I/O, unit-tested).
//
// Why this exists: on OpenClaw 2026.9.1 every restart path that does not carry an
// explicit restart intent either exits at once (plain `systemctl restart` hits the
// QQBot SIGTERM hook that calls process.exit) or waits through the Gateway's own
// deferral, which is hard-coded to 300 s and then emits `{force:true}`, i.e. a
// 0 ms drain that cuts in-flight runs and replies (2026-10-03 20:15). On V the
// Night Shift / cron background tasks are almost never idle, so that deferral
// nearly always ends forced. The sanctioned path waits for user-facing work on
// our side (while the Gateway keeps serving), then hands the Gateway a native
// restart intent with a bounded, non-zero drain.

export const DEFAULTS = Object.freeze({
  host: 'v',
  unit: 'openclaw-gateway.service',
  idleWaitMs: 10 * 60_000,
  pollMs: 15_000,
  quietPolls: 2,
  drainMs: 60_000,
  readyTimeoutMs: 10 * 60_000,
});

// A drain shorter than this cannot even settle a reply delivery; longer than
// this keeps admission closed (new messages rejected) for too long.
export const MIN_DRAIN_MS = 10_000;
export const MAX_DRAIN_MS = 10 * 60_000;
export const MAX_IDLE_WAIT_MS = 2 * 60 * 60_000;

const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** Parses "90s", "10m", "1h", "500ms" or a bare number of milliseconds. */
export function parseDurationMs(value, name = 'duration') {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(String(value ?? '').trim());
  if (!match) throw new Error(`${name}: expected a duration like 90s, 10m or 1h, got ${JSON.stringify(value)}`);
  const ms = Math.round(Number(match[1]) * UNIT_MS[match[2] ?? 'ms']);
  if (!Number.isFinite(ms) || ms < 0) throw new Error(`${name}: invalid duration ${JSON.stringify(value)}`);
  return ms;
}

export function formatMs(ms) {
  if (ms % 3_600_000 === 0 && ms >= 3_600_000) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0 && ms >= 60_000) return `${ms / 60_000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

/** Validates the operator options; there is deliberately no way to request a forced (0 ms) drain. */
export function resolveRestartOptions(raw = {}) {
  if (raw.force !== undefined) {
    throw new Error('--force is not offered: a forced restart skips the drain and cuts in-flight runs and replies. ' +
      'Use --allow-interrupt to proceed after --idle-wait with a bounded drain instead.');
  }
  const reason = String(raw.reason ?? '').trim();
  if (!reason) throw new Error('--reason is required (it is written into the restart intent and the Gateway log)');
  if (reason.length > 200) throw new Error('--reason must be at most 200 characters');
  const pick = (key, name) => (raw[key] === undefined ? DEFAULTS[key] : parseDurationMs(raw[key], name));
  const drainMs = pick('drainMs', '--drain');
  const idleWaitMs = pick('idleWaitMs', '--idle-wait');
  const pollMs = pick('pollMs', '--poll');
  const readyTimeoutMs = pick('readyTimeoutMs', '--ready-timeout');
  if (drainMs < MIN_DRAIN_MS || drainMs > MAX_DRAIN_MS) {
    throw new Error(`--drain must be between ${formatMs(MIN_DRAIN_MS)} and ${formatMs(MAX_DRAIN_MS)} ` +
      '(0 would mean "no drain" to operators but "wait forever" to the Gateway; both are wrong here)');
  }
  if (idleWaitMs > MAX_IDLE_WAIT_MS) throw new Error(`--idle-wait must be at most ${formatMs(MAX_IDLE_WAIT_MS)}`);
  if (pollMs < 1000) throw new Error('--poll must be at least 1s');
  if (readyTimeoutMs < 30_000) throw new Error('--ready-timeout must be at least 30s');
  const quietPolls = raw.quietPolls === undefined ? DEFAULTS.quietPolls : Number(raw.quietPolls);
  if (!Number.isInteger(quietPolls) || quietPolls < 1 || quietPolls > 20) throw new Error('--quiet-polls must be an integer 1..20');
  return {
    reason,
    host: raw.host ?? DEFAULTS.host,
    unit: raw.unit ?? DEFAULTS.unit,
    drainMs,
    idleWaitMs,
    pollMs,
    quietPolls,
    readyTimeoutMs,
    allowInterrupt: raw.allowInterrupt === true,
    dryRun: raw.dryRun === true,
  };
}

const count = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Splits the Gateway's restart preflight (gateway.restart.preflight) plus the
 * Worker pool status (vlab.workers.status) into work a person is waiting on and
 * long-running background work. Background work (Night Shift sub-agents, cron,
 * long-poll RPCs, background exec) never goes idle on V; it is resumed by
 * restart recovery / the Night Shift restart hold, so it is reported but does
 * not block. User-facing work blocks.
 */
export function classifyActivity(status) {
  const c = status?.preflight?.counts ?? {};
  const workers = status?.workers ?? null;
  const userFacing = {
    queuedTurns: count(c.queueSize),
    pendingReplies: count(c.pendingReplies),
    embeddedRuns: count(c.embeddedRuns),
    workerRuns: count(workers?.active),
    workerQueued: count(workers?.queued),
  };
  const background = {
    activeTasks: count(c.activeTasks),
    cronRuns: count(c.cronRuns),
    backgroundExecSessions: count(c.backgroundExecSessions),
    rootRequests: count(c.rootRequests),
  };
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return {
    userFacing,
    background,
    userFacingTotal: sum(userFacing),
    backgroundTotal: sum(background),
    workersKnown: workers !== null,
  };
}

/**
 * Decides the next step from the samples taken so far.
 * Returns {action:'proceed'|'wait'|'refuse'|'interrupt', why}.
 *  - proceed: the last `quietPolls` samples all had zero user-facing work.
 *  - wait: still busy and the idle wait has time left.
 *  - interrupt: busy at the deadline and the operator allowed a bounded interrupting drain.
 *  - refuse: busy at the deadline; nothing is restarted.
 */
export function decide({ samples, startedAt, now, idleWaitMs, quietPolls, allowInterrupt }) {
  if (!samples.length) return { action: 'wait', why: 'no sample yet' };
  const recent = samples.slice(-quietPolls);
  if (recent.length === quietPolls && recent.every((s) => classifyActivity(s).userFacingTotal === 0)) {
    return { action: 'proceed', why: `no user-facing work in the last ${quietPolls} sample(s)` };
  }
  if (now - startedAt < idleWaitMs) return { action: 'wait', why: 'user-facing work is active' };
  const last = classifyActivity(samples.at(-1));
  if (last.userFacingTotal === 0) {
    // Quiet right now but not for long enough; the bounded drain covers the rest.
    return { action: 'proceed', why: 'quiet at the deadline' };
  }
  return allowInterrupt
    ? { action: 'interrupt', why: `user-facing work still active after ${formatMs(idleWaitMs)}; --allow-interrupt given` }
    : { action: 'refuse', why: `user-facing work still active after ${formatMs(idleWaitMs)}` };
}

export function describeActivity(status) {
  const a = classifyActivity(status);
  const parts = (o) => Object.entries(o).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
  const lines = [
    `user-facing: ${parts(a.userFacing)}${a.workersKnown ? '' : ' (worker pool status unavailable)'}`,
    `background:  ${parts(a.background)}`,
  ];
  for (const run of status?.workers?.runs ?? []) lines.push(`  worker run ${run.runId ?? '?'} ${run.sessionKey ?? ''}`.trimEnd());
  for (const blocker of status?.preflight?.blockers ?? []) lines.push(`  ${String(blocker.message ?? blocker).slice(0, 240)}`);
  return lines.join('\n');
}

/**
 * Finds the minified export name of writeGatewayRestartIntentSync in a
 * restart-intent-*.js dist chunk (9.1 exports it as `a`; do not hard-code it).
 */
export function resolveIntentWriterExport(source) {
  if (!/function writeGatewayRestartIntentSync\s*\(/.test(source)) return null;
  const m = /export\s*\{[^}]*\bwriteGatewayRestartIntentSync\s+as\s+([A-Za-z_$][\w$]*)/.exec(source);
  if (m) return m[1];
  return /export\s*\{[^}]*\bwriteGatewayRestartIntentSync\b(?!\s+as)/.test(source) ? 'writeGatewayRestartIntentSync' : null;
}

const RESTART_JOURNAL_PATTERNS = [
  ['configRestartDeferred', /\[reload\] config change requires gateway restart \(([^)]*)\)/],
  ['configRestartForced', /\[reload\] restart timeout after (\d+)ms/],
  ['configRestartReady', /\[reload\] all operations and replies completed; restarting gateway now/],
  ['signal', /\[gateway\] received (SIG[A-Z0-9]+); restarting/],
  ['drainStart', /\[gateway\] draining active work before restart (?:with timeout (\d+)ms|without a timeout)/],
  ['forced', /\[gateway\] forced restart requested; skipping active work drain/],
  ['drained', /\[gateway\] all active work drained/],
  ['drainTimeout', /\[gateway\] active-work drain timeout reached/],
  ['interrupted', /\[main-session-restart-recovery\] marked (\d+) interrupted main session/],
  ['fullRestart', /\[gateway\] restart mode: full process restart/],
];

/** Summarizes Gateway journal lines (journalctl -o cat) around a restart. */
export function summarizeRestartJournal(lines) {
  const out = {
    configRestartDeferred: [], configRestartForced: false, configRestartReady: false,
    signal: null, drainTimeoutMs: undefined, forced: false, drained: false, drainTimeout: false,
    interruptedMainSessions: 0, fullRestart: false,
  };
  for (const line of lines) {
    for (const [key, re] of RESTART_JOURNAL_PATTERNS) {
      const m = re.exec(line);
      if (!m) continue;
      if (key === 'configRestartDeferred') { if (!out.configRestartDeferred.includes(m[1])) out.configRestartDeferred.push(m[1]); }
      else if (key === 'signal') out.signal = m[1];
      else if (key === 'drainStart') out.drainTimeoutMs = m[1] === undefined ? null : Number(m[1]);
      else if (key === 'interrupted') out.interruptedMainSessions += Number(m[1]);
      else out[key] = true;
    }
  }
  // A config-reload restart is still waiting inside the Gateway when it was
  // deferred and neither its ready nor its timeout path has run yet.
  out.configRestartPending = out.configRestartDeferred.length > 0 && !out.configRestartReady && !out.configRestartForced && !out.signal;
  return out;
}

/** One-line verdict on how the restart drained. */
export function drainVerdict(summary) {
  if (summary.forced || summary.drainTimeoutMs === 0) return { ok: false, text: 'FORCED: drain was skipped (0 ms)' };
  if (summary.drained) return { ok: true, text: 'all active work drained before restart' };
  if (summary.drainTimeout) return { ok: true, text: 'bounded drain timed out; remaining work was handed to restart recovery' };
  if (summary.signal && summary.drainTimeoutMs === undefined) return { ok: true, text: 'Gateway was idle; nothing to drain' };
  return { ok: false, text: 'no restart drain lines found in the journal' };
}
