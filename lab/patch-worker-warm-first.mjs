import assert from 'node:assert/strict';

// Worker pool prefers a Worker that has already run a turn (worker-warm-first), on top of
// V's production-worker/worker-pool.mjs (voice-reliability-20261007, captured from V
// 2026-10-08).
//
// A Worker's first turn is slow even after prewarm. V 2026-10-10 01:24-09:37 CST,
// vlab-worker: Worker command entry -> model call P50 1.02 s, P90 5.70 s, P95 6.02 s. In
// every one of the 13 turns over 3 s, the Worker had just started. The extra 3-4 s sits
// between the Worker's first stream message and its model call. 77 turns ran on 33
// processes. The private VLab candidate (lab/candidate/worker-prewarm-v.mjs) still measures
// a cold-turn surcharge of ~4 s after prewarm: skill snapshot, tool construction, first imports.
//
// selectSessionWorker ranks Workers by load (active + detached + queued + owners), then by
// slot. Suppose a warm Worker carries one detached task, for example a background
// subagent or a long poll. A Worker that has never run a turn has load 0, so it wins, and
// the new Session pays the cold first turn. Each admission also asks for a fresh warm spare.
//
// Mode "idle", the default, works in two tiers:
// - First tier: Workers that have already admitted a turn and have no foreground run or
//   queued turn at the moment. Inside this tier the original load order and slot order apply.
// - Second tier: everything else, in the original order.
// A new Session therefore never lands next to a running foreground turn, as before. It only
// stops paying a cold start because of detached work. The affinity hint is compared with
// the same order. The idle reaper retires never-used Workers before warm ones.
// Mode "all" puts every warm Worker with a free Session slot in the first tier.
// OPENCLAW_WORKER_WARM_FIRST=0 restores the original order.

export const MARKER = '/* OPENCLAW_WORKER_WARM_FIRST_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWorkerPool(source) {
  assert.equal(source.includes(MARKER), false, 'already patched');
  let out = replaceExactlyOnce(
    source,
    `function readIntEnv(env, key, fallback) {`,
    `${MARKER}
// "idle" (default) | "all" | "off"; anything unrecognised falls back to the default.
function readWarmFirstMode(env) {
  const raw = String(env?.OPENCLAW_WORKER_WARM_FIRST ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false") return "off";
  if (raw === "all") return "all";
  return "idle";
}

function readIntEnv(env, key, fallback) {`,
    'readIntEnv',
  );
  out = replaceExactlyOnce(
    out,
    `    this.sessionAffinityTtlMs = options.sessionAffinityTtlMs ?? 180_000;`,
    `    this.sessionAffinityTtlMs = options.sessionAffinityTtlMs ?? 180_000;
    // worker-warm-first.1: prefer a process that has already paid its first turn.
    this.warmFirstMode = options.warmFirstMode ?? readWarmFirstMode(this.configEnv);`,
    'affinity TTL option',
  );
  out = replaceExactlyOnce(
    out,
    `      servedSessionCount: 0,
      memory: null,`,
    `      servedSessionCount: 0,
      turnsAdmitted: 0,
      memory: null,`,
    'worker record',
  );
  out = replaceExactlyOnce(
    out,
    `  selectSessionWorker(key) {
    const candidates = [...this.workers.values()]
      .filter(
        (candidate) =>
          candidate.ready &&
          !candidate.retiring &&
          candidate.ownerSessionKeys.size < this.sessionsPerWorker,
      )
      .sort(
        (left, right) =>
          this.compareSessionWorkerLoad(left, right) || left.slot - right.slot,
      );
    const leastLoaded = candidates[0];
    if (!leastLoaded) return undefined;
    const preferred = this.preferredSessionWorker(key);
    // Affinity is valuable only when it does not place a new Session behind
    // more work in one Node process. Spread across ready Workers first, then
    // pack up to sessionsPerWorker once every process is equally occupied.
    return preferred &&
        this.compareSessionWorkerLoad(preferred, leastLoaded) <= 0
      ? preferred
      : leastLoaded;
  }`,
    `  // worker-warm-first.1: 0 = already ran a turn and (mode "idle") runs no
  // foreground turn right now; 1 = everything else, in the original order.
  warmFirstTier(worker) {
    if (this.warmFirstMode === "off" || !(worker.turnsAdmitted > 0)) return 1;
    if (this.warmFirstMode === "all") return 0;
    return worker.active.size === 0 && worker.queue.length === 0 ? 0 : 1;
  }

  compareSessionWorkerSelection(left, right) {
    return this.warmFirstTier(left) - this.warmFirstTier(right) ||
      this.compareSessionWorkerLoad(left, right);
  }

  selectSessionWorker(key) {
    const candidates = [...this.workers.values()]
      .filter(
        (candidate) =>
          candidate.ready &&
          !candidate.retiring &&
          candidate.ownerSessionKeys.size < this.sessionsPerWorker,
      )
      .sort(
        (left, right) =>
          this.compareSessionWorkerSelection(left, right) || left.slot - right.slot,
      );
    const leastLoaded = candidates[0];
    if (!leastLoaded) return undefined;
    const preferred = this.preferredSessionWorker(key);
    // Affinity is valuable only when it does not place a new Session behind
    // more work in one Node process. Spread across ready Workers first, then
    // pack up to sessionsPerWorker once every process is equally occupied.
    return preferred &&
        this.compareSessionWorkerSelection(preferred, leastLoaded) <= 0
      ? preferred
      : leastLoaded;
  }`,
    'selectSessionWorker',
  );
  out = replaceExactlyOnce(
    out,
    `        this.pending.splice(index, 1);
        this.rememberSessionWorker(job.sessionOwnerKey, worker);`,
    `        this.pending.splice(index, 1);
        worker.turnsAdmitted += 1;
        this.rememberSessionWorker(job.sessionOwnerKey, worker);`,
    'admission',
  );
  out = replaceExactlyOnce(
    out,
    `      .filter((worker) => this.isFullyIdle(worker, now))
      .sort((left, right) => right.slot - left.slot);`,
    `      .filter((worker) => this.isFullyIdle(worker, now))
      .sort((left, right) =>
        // worker-warm-first.1: keep the processes that already paid a first turn.
        (this.warmFirstMode === "off" ? 0 :
          Number(left.turnsAdmitted > 0) - Number(right.turnsAdmitted > 0)) ||
        right.slot - left.slot);`,
    'idle reap order',
  );
  out = replaceExactlyOnce(
    out,
    `          servedSessionCount: worker.servedSessionCount,
          memory: worker.memory,`,
    `          servedSessionCount: worker.servedSessionCount,
          turnsAdmitted: worker.turnsAdmitted,
          memory: worker.memory,`,
    'status record',
  );
  return out;
}
