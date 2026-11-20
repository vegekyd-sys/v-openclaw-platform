// Reply equivalence for usage-session-select-v1: on the same data, calls the in-process
// sessions.usage handler of V's current chunk (usage-offload-v1, published next to it as
// usage-old-C3nh9kcO.js) and of the patched chunk with the same params, repeats until both report a
// fresh usage cache, and diffs the replies (updatedAt excluded). Prints one JSON report.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AGENT, readConfig, targetPath } from './usage-session-select-setup.mjs';

const target = JSON.parse(fs.readFileSync(targetPath(), 'utf8'));
const dist = path.join(process.env.VLAB_CANDIDATE_RUNTIME, 'openclaw', 'dist');
const load = async (name) => (await import(pathToFileURL(path.join(dist, name)).href)).usageHandlersInProcess;
const arms = { old: await load('usage-old-C3nh9kcO.js'), new: await load('usage-C3nh9kcO.js') };
const { i: loadGatewaySessionEntryReadOnly } = await import(pathToFileURL(path.join(dist, 'session-utils-store-Dlphca2N.js')).href);
loadGatewaySessionEntryReadOnly(target.key, { agentId: AGENT });
const config = readConfig();
const admin = { connect: { scopes: ['operator.admin'] } };

const invoke = (handlers, params) => new Promise((resolve) => {
  Promise.resolve(handlers['sessions.usage']({
    params, context: { getRuntimeConfig: () => config }, client: admin,
    respond: (ok, payload, error) => resolve({ ok, payload, error }),
    req: { type: 'req', id: '2:compare', method: 'sessions.usage' }, isWebchatConnect: () => false,
  })).catch((error) => resolve({ ok: false, error: String(error?.stack ?? error) }));
});
const strip = (value) => JSON.parse(JSON.stringify(value ?? null, (key, v) => (key === 'updatedAt' ? undefined : v)));

function diff(a, b, at = '$', out = []) {
  if (out.length >= 20) return out;
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key], b[key], `${at}.${key}`, out);
  } else out.push({ at, old: JSON.stringify(a)?.slice(0, 200), new: JSON.stringify(b)?.slice(0, 200) });
  return out;
}

const cases = {
  C1: { key: target.key },
  C2: { key: target.key, mode: 'specific', startDate: '2026-11-20', endDate: '2026-11-20', timeZone: 'Asia/Shanghai' },
  C3: { agentId: AGENT, startDate: '2026-10-22', endDate: '2026-11-20', mode: 'specific', timeZone: 'Asia/Shanghai', limit: 1000, includeContextWeight: false },
  C4: { key: target.key, includeContextWeight: true },
  C5: { agentId: AGENT, startDate: '2026-10-22', endDate: '2026-11-20', mode: 'specific', timeZone: 'Asia/Shanghai', limit: 1000, groupBy: 'family' },
};
const results = [];
for (const [label, params] of Object.entries(cases)) {
  let last;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const started = performance.now();
    const old = await invoke(arms.old, params);
    const oldMs = Math.round(performance.now() - started);
    const fresh = await invoke(arms.new, params);
    const newMs = Math.round(performance.now() - started) - oldMs;
    const statuses = [old.payload?.cacheStatus?.status, fresh.payload?.cacheStatus?.status];
    last = {
      label, attempt, oldMs, newMs, ok: [old.ok, fresh.ok], statuses,
      sessions: [old.payload?.sessions?.length, fresh.payload?.sessions?.length],
      withContextWeight: [old.payload?.sessions?.filter((s) => s.hasContextWeight).length, fresh.payload?.sessions?.filter((s) => s.hasContextWeight).length],
      contextWeightReturned: [old.payload?.sessions?.filter((s) => s.contextWeight).length, fresh.payload?.sessions?.filter((s) => s.contextWeight).length],
      identical: JSON.stringify(strip(old.payload)) === JSON.stringify(strip(fresh.payload)),
      errors: [old.error, fresh.error].map((e) => e?.message ?? e),
    };
    if (last.identical || statuses.every((s) => !s || s === 'fresh')) break;
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  if (!last.identical) {
    const old = await invoke(arms.old, params);
    const fresh = await invoke(arms.new, params);
    last.diff = diff(strip(old.payload), strip(fresh.payload));
  }
  results.push(last);
}
console.log(JSON.stringify({ arm: 'compare', target, results }));
process.exit(0);
