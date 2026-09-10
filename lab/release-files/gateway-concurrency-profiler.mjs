// Temporary VLab-only diagnostic; no listener, signal handler, or business-state mutation.
import {Session} from 'node:inspector';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import os from 'node:os';
let current, lastStart = 0;
const emit = data => console.error('[gateway-concurrency-profile] ' + JSON.stringify(data));
const post = (session, method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
export function summarizeProfile(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parents = new Map();
  for (const n of nodes.values()) for (const child of n.children ?? []) parents.set(child, n.id);
  const self = new Map(), inclusive = new Map();
  const frame = n => `${n.callFrame.functionName || '(anonymous)'} @ ${n.callFrame.url.split('/').at(-1)}:${n.callFrame.lineNumber + 1}`;
  for (let i = 0; i < (profile.samples ?? []).length; i++) {
    const id = profile.samples[i], dt = profile.timeDeltas[i];
    const name = frame(nodes.get(id)); self.set(name, (self.get(name) ?? 0) + dt);
    let at = id; const seen = new Set();
    while (at) {const f = frame(nodes.get(at)); if (!seen.has(f)) {inclusive.set(f, (inclusive.get(f) ?? 0) + dt); seen.add(f);} at = parents.get(at);}
  }
  const top = map => [...map].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([frame, us]) => ({frame, ms: us / 1000}));
  return {durationMs: (profile.endTime - profile.startTime) / 1000, topSelf: top(self), topInclusive: top(inclusive)};
}
export async function finishConcurrencyProfile() {
  const state = current; if (!state) return;
  current = undefined; clearTimeout(state.timer);
  try {const {profile} = await post(state.session, 'Profiler.stop'); emit({event: 'summary', pid: process.pid, ...summarizeProfile(profile), eventLoop: {p50Ms: state.lag.percentile(50) / 1e6, p95Ms: state.lag.percentile(95) / 1e6, maxMs: state.lag.max / 1e6}});}
  catch {emit({event: 'profile-failed', pid: process.pid});}
  finally {state.lag.disable(); state.session.disconnect();}
}
function beginProfile() {
  const session = new Session(), lag = monitorEventLoopDelay({resolution: 10});
  session.connect(); lag.enable();
  const state = {session, lag, startedAt: Date.now()}; current = state; lastStart = state.startedAt;
  void (async () => {
    try {
      await post(session, 'Profiler.enable'); await post(session, 'Profiler.setSamplingInterval', {interval: 1000}); await post(session, 'Profiler.start');
      emit({event: 'start', pid: process.pid, at: state.startedAt});
      state.timer = setTimeout(() => void finishConcurrencyProfile(), 25000).unref();
    } catch {lag.disable(); session.disconnect(); if (current === state) current = undefined; emit({event: 'start-failed', pid: process.pid});}
  })();
}
export async function withConcurrencyProfile(params, operation) {
  // Only dedicated operator-created diagnostic sessions on VLab can trigger it.
  const selected = os.hostname() === 'VM-0-4-ubuntu' && String(params?.sessionKey ?? '').startsWith('agent:makaron:explicit:concurrency-fix-profile-');
  if (selected && !current && Date.now() - lastStart >= 60000) {try {beginProfile();} catch {emit({event: 'start-failed', pid: process.pid});}}
  if (!selected) return await operation();
  const startedAt = performance.now();
  try {return await operation();}
  finally {emit({event: 'handler-return', runId: /^[a-f0-9-]{36}$/.test(params?.idempotencyKey ?? '') ? params.idempotencyKey : undefined, ms: performance.now() - startedAt});}
}
