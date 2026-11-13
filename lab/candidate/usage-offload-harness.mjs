// Gateway stand-in for the usage-offload repro: loads the runtime's real usage handlers, calls
// `usage.cost` like `openclaw gateway call` does, and measures what the Gateway's event loop and
// heap go through. Run with the Gateway's node flags (--experimental-async-context-frame,
// --max-old-space-size). Prints one JSON report.
import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import v8 from 'node:v8';
import { readConfig } from './usage-offload-setup.mjs';

const TICK_MS = 50;
const MAX_WAIT_MS = Number(process.env.UO_MAX_WAIT_MS ?? 45 * 60_000);
const POLL_MS = Number(process.env.UO_POLL_MS ?? 15_000);
const range = (startDate) => ({
  agentId: 'makaron', startDate, endDate: '2026-11-12', mode: 'specific', utcOffset: 'UTC+8',
});
const P1 = range('2026-11-12'); // one day, the size of the 22:00 incident request
const P2 = range('2026-10-14'); // 30 days, the Control UI default

const probe = { maxGapMs: 0, overallMaxGapMs: 0, gaps: [], heapMax: 0, childHwmKb: 0, childPids: new Set() };
let last = performance.now();
const elDelay = monitorEventLoopDelay({ resolution: 20 });
elDelay.enable();
let ticks = 0;
const childHwm = () => {
  try {
    const kids = fs.readFileSync(`/proc/${process.pid}/task/${process.pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean);
    for (const pid of kids) {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!cmd.includes('usage-offload-child')) continue;
      probe.childPids.add(pid);
      const hwm = Number(/VmHWM:\s+(\d+)/.exec(status)?.[1] ?? 0);
      probe.childHwmKb = Math.max(probe.childHwmKb, hwm);
    }
  } catch {}
};
const timer = setInterval(() => {
  const now = performance.now();
  const gap = now - last - TICK_MS;
  last = now;
  if (gap > probe.maxGapMs) probe.maxGapMs = gap;
  if (gap > probe.overallMaxGapMs) probe.overallMaxGapMs = gap;
  if (gap > 1000) probe.gaps.push({ at: new Date().toISOString(), gapMs: Math.round(gap) });
  ticks += 1;
  if (ticks % 4 === 0) {
    probe.heapMax = Math.max(probe.heapMax, v8.getHeapStatistics().used_heap_size);
    childHwm();
  }
}, TICK_MS);

const dist = path.join(process.env.VLAB_CANDIDATE_RUNTIME, 'openclaw', 'dist');
const { t: usageHandlers } = await import(pathToFileURL(path.join(dist, 'usage-C3nh9kcO.js')).href);
const config = readConfig();
const context = { getRuntimeConfig: () => config };
const client = { connect: { scopes: ['operator.admin'] } };

async function call(method, params) {
  const started = performance.now();
  const startAt = new Date().toISOString();
  probe.maxGapMs = 0;
  const reply = await new Promise((resolve) => {
    Promise.resolve(usageHandlers[method]({
      params, context, client, respond: (ok, payload, error) => resolve({ ok, payload, error }),
    })).catch((error) => resolve({ ok: false, error: String(error) }));
  });
  const ms = Math.round(performance.now() - started);
  const gapDuring = Math.round(probe.maxGapMs);
  return {
    method, startAt, endAt: new Date().toISOString(), ms, maxGapMs: gapDuring, ok: reply.ok, error: reply.error?.message ?? reply.error,
    status: reply.payload?.cacheStatus, totals: reply.payload?.totals, daily: reply.payload?.daily,
  };
}

const brief = (r) => ({ startAt: r.startAt, endAt: r.endAt, ms: r.ms, maxGapMs: r.maxGapMs, ok: r.ok, error: r.error, status: r.status, tokens: r.totals?.totalTokens, cost: r.totals?.totalCost });

async function untilFresh(label, params) {
  const calls = [];
  const started = Date.now();
  for (;;) {
    const result = await call('usage.cost', params);
    calls.push(brief(result));
    if (!result.ok || result.status?.status === 'fresh' || Date.now() - started > MAX_WAIT_MS) {
      return { label, calls, final: result, elapsedMs: Date.now() - started };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const report = { arm: process.env.ARM, pid: process.pid, execArgv: process.execArgv };
const first = await call('usage.cost', P1);
report.incidentRequest = brief(first);
// Watch the Gateway after the answer: the old code keeps refreshing on this thread.
const watchUntil = Date.now() + Number(process.env.UO_WATCH_MS ?? 120_000);
probe.maxGapMs = 0;
while (Date.now() < watchUntil) await new Promise((resolve) => setTimeout(resolve, 1_000));
report.afterAnswer = { maxGapMs: Math.round(probe.maxGapMs), windowMs: Number(process.env.UO_WATCH_MS ?? 120_000) };
const p1 = await untilFresh('P1-1day', P1);
const p2 = await untilFresh('P2-30day', P2);
const p2Again = await call('usage.cost', P2);
const sessionsUsage = await call('sessions.usage', { ...P2, limit: 1000 });
report.p1 = { ...p1, final: undefined };
report.p2 = { ...p2, final: undefined };
report.warmP2 = brief(p2Again);
report.sessionsUsage = { ...brief(sessionsUsage), status: undefined, sessions: undefined };
report.results = {
  P1: { status: p1.final.status, totals: p1.final.totals, daily: p1.final.daily },
  P2: { status: p2.final.status, totals: p2.final.totals, daily: p2.final.daily },
};
report.eventLoop = {
  maxGapMs: Math.round(probe.overallMaxGapMs),
  gapsOver1s: probe.gaps.length,
  longestGaps: probe.gaps.toSorted((a, b) => b.gapMs - a.gapMs).slice(0, 10),
  p99Ms: Math.round(elDelay.percentile(99) / 1e6),
  maxMs: Math.round(elDelay.max / 1e6),
};
report.memory = {
  sampledHeapMaxMiB: Math.round(probe.heapMax / 1048576),
  maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
  childPeakRssMiB: Math.round(probe.childHwmKb / 1024),
  childPids: [...probe.childPids],
};
clearInterval(timer);
console.log(JSON.stringify(report));
process.exit(0);
