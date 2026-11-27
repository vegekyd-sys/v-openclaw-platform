// Gateway stand-in for the usage-session-select repro: loads the runtime's real (offload-wrapped)
// usage handlers and calls sessions.usage the way V saw it on 2026-11-20, measuring the stand-in's
// event loop, heap and the usage worker's peak RSS. Run with V's Gateway node flags. Prints one
// JSON report.
//
// C1, C2: `openclaw gateway call sessions.usage` from a /vcc session (operator.read client):
//   C1 {"key": <direct session>}                                   V: 29,826 ms
//   C2 {"key": ..., "mode": "specific", one day, Asia/Shanghai}    V: 65,909 ms
// C3: the Control UI usage page (operator.admin client, 30 days, limit 1000).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import v8 from 'node:v8';
import { AGENT, readConfig, targetPath } from './usage-session-select-setup.mjs';

const TICK_MS = 50;
const SETTLE_MS = Number(process.env.USS_SETTLE_MS ?? 15_000);
const target = JSON.parse(fs.readFileSync(targetPath(), 'utf8'));

const probe = { maxGapMs: 0, gaps: [], heapMax: 0, childHwmKb: 0, childPids: new Set() };
let last = performance.now();
const childHwm = () => {
  try {
    const kids = fs.readFileSync(`/proc/${process.pid}/task/${process.pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean);
    for (const pid of kids) {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!cmd.includes('usage-offload-child')) continue;
      probe.childPids.add(pid);
      const hwm = Number(/VmHWM:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0);
      probe.childHwmKb = Math.max(probe.childHwmKb, hwm);
    }
  } catch {}
};
let ticks = 0;
let measuring = false;
setInterval(() => {
  const now = performance.now();
  const gap = now - last - TICK_MS;
  last = now;
  if (!measuring) return;
  if (gap > probe.maxGapMs) probe.maxGapMs = gap;
  if (gap > 1000) probe.gaps.push({ at: new Date().toISOString(), gapMs: Math.round(gap) });
  ticks += 1;
  if (ticks % 4 === 0) {
    probe.heapMax = Math.max(probe.heapMax, v8.getHeapStatistics().used_heap_size);
    childHwm();
  }
}, TICK_MS);

const dist = path.join(process.env.VLAB_CANDIDATE_RUNTIME, 'openclaw', 'dist');
const usageSource = fs.readFileSync(path.join(dist, 'usage-C3nh9kcO.js'));
const { t: usageHandlers } = await import(pathToFileURL(path.join(dist, 'usage-C3nh9kcO.js')).href);
const { i: loadGatewaySessionEntryReadOnly } = await import(pathToFileURL(path.join(dist, 'session-utils-store-Dlphca2N.js')).href);
const config = readConfig();
const context = { getRuntimeConfig: () => config };
const reader = { connect: { scopes: ['operator.read'] } };
const admin = { connect: { scopes: ['operator.admin'] } };

// Like V's Gateway, which opened the agent database long before: the first open (DB91 integrity
// receipt for this epoch) happens before measuring.
const warmStarted = performance.now();
const warm = loadGatewaySessionEntryReadOnly(target.key, { agentId: AGENT });
const warmMs = Math.round(performance.now() - warmStarted);
await new Promise((resolve) => setTimeout(resolve, 1000));

const digest = (value) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
const comparable = (payload) => payload && {
  sessions: (payload.sessions ?? []).map(({ updatedAt, ...rest }) => rest),
  totals: payload.totals,
  aggregates: payload.aggregates,
};

async function call(label, client, params) {
  measuring = true;
  probe.maxGapMs = 0; probe.gaps = []; probe.heapMax = v8.getHeapStatistics().used_heap_size; probe.childHwmKb = 0;
  const started = performance.now();
  const reply = await new Promise((resolve) => {
    Promise.resolve(usageHandlers['sessions.usage']({
      params, context, client, respond: (ok, payload, error) => resolve({ ok, payload, error }),
      req: { type: 'req', id: `2:${label}`, method: 'sessions.usage' }, isWebchatConnect: () => false,
    })).catch((error) => resolve({ ok: false, error: String(error?.stack ?? error) }));
  });
  const ms = Math.round(performance.now() - started);
  const during = { maxGapMs: Math.round(probe.maxGapMs), gaps: [...probe.gaps], heapMaxMiB: Math.round(probe.heapMax / 1048576), workerHwmMiB: Math.round(probe.childHwmKb / 1024) };
  probe.maxGapMs = 0; probe.gaps = [];
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const after = { maxGapMs: Math.round(probe.maxGapMs), gaps: [...probe.gaps], workerHwmMiB: Math.round(probe.childHwmKb / 1024) };
  const sessions = reply.payload?.sessions ?? [];
  return {
    label, params, ms, ok: reply.ok, error: reply.error?.message ?? reply.error, during, after,
    sessions: sessions.length,
    withContextWeight: sessions.filter((s) => s.hasContextWeight).length,
    contextWeightReturned: sessions.filter((s) => s.contextWeight).length,
    totals: reply.payload?.totals && { totalTokens: reply.payload.totals.totalTokens, totalCost: reply.payload.totals.totalCost },
    first: sessions[0] && { key: sessions[0].key, tokens: sessions[0].usage?.totalTokens ?? null },
    cacheStatus: reply.payload?.cacheStatus?.status,
    replyDigest: digest(comparable(reply.payload)),
  };
}

const results = [];
results.push(await call('C1', reader, { key: target.key }));
results.push(await call('C2', reader, { key: target.key, mode: 'specific', startDate: '2026-11-20', endDate: '2026-11-20', timeZone: 'Asia/Shanghai' }));
results.push(await call('C3', admin, { agentId: AGENT, startDate: '2026-10-22', endDate: '2026-11-20', mode: 'specific', timeZone: 'Asia/Shanghai', limit: 1000, includeContextWeight: false }));
console.log(JSON.stringify({
  arm: process.env.ARM,
  usageChunkSha256: createHash('sha256').update(usageSource).digest('hex'),
  marker: usageSource.includes('usage-session-select-v1') ? 'usage-session-select-v1' : usageSource.includes('usage-offload-v1') ? 'usage-offload-v1' : 'none',
  target, warm: { ms: warmMs, found: Boolean(warm.entry) },
  results,
}));
process.exit(0);
