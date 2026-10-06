import fs from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
// OPENCLAW_FIRSTTEXT_GAP_MARKS_V1: [firsttext-lease.1] lines (pid, mode, wait, hold, short caller chain; no data).
function firsttextLeaseLog(mode, waitMs, holdMs, attempts) {
  try {
    if (process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES !== '1' || process.env.OPENCLAW_FIRSTTEXT_GAP_MARKS === '0') return;
    if (waitMs < 20 && holdMs < 20) return;
    const callers = String(new Error().stack ?? '').split('\n').slice(2, 10)
      .map(line => /at (?:async )?([A-Za-z0-9_$.<>]+) /.exec(line)?.[1]).filter(Boolean).slice(0, 6);
    console.error('[firsttext-lease.1] ' + JSON.stringify({v: 1, mode, pid: process.pid, atMs: Date.now(), waitMs, holdMs, attempts, callers}));
  } catch { /* Observation must not alter runtime control flow. */ }
}

const DEFAULT_MAX_WAIT_MS = 300_000;
const heldLeases = new AsyncLocalStorage();
const syncWait = new Int32Array(new SharedArrayBuffer(4));

function leaseKey(databasePath, suffix) {
  return `${databasePath}\0${suffix}`;
}

function runWithHeldLease(databasePath, suffix, fn) {
  const current = heldLeases.getStore();
  const next = new Set(current ?? []);
  next.add(leaseKey(databasePath, suffix));
  return heldLeases.run(next, fn);
}

export function isAgentDatabaseProcessLeaseHeld(databasePath, suffix = '.session-writer-coordinator') {
  return heldLeases.getStore()?.has(leaseKey(databasePath, suffix)) ?? false;
}

function assertCoordinatorPathSafe(coordinatorPath) {
  try {
    const stat = fs.lstatSync(coordinatorPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error('Unsafe Agent DB process coordinator file');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function validateOptions(databasePath, suffix, maxWaitMs) {
  if (typeof databasePath !== 'string' || !databasePath.startsWith('/')) {
    throw new Error('Agent DB process coordination requires an absolute database path');
  }
  if (typeof suffix !== 'string' || !/^\.[a-z0-9-]+$/u.test(suffix)) {
    throw new Error('Invalid Agent DB process coordinator suffix');
  }
  if (!Number.isFinite(maxWaitMs) || maxWaitMs < 0) {
    throw new Error('Invalid Agent DB process coordinator wait budget');
  }
}

/**
 * Acquires a process-global, data-free SQLite sidecar lease without blocking the
 * caller's event loop. The OS releases the SQLite lock if the owner exits.
 */
export async function withAgentDatabaseProcessLease(params, timing = {}) {
  const now = timing.now ?? Date.now;
  const sleep = timing.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maxWaitMs = params.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const suffix = params.suffix ?? '.session-writer-coordinator';
  validateOptions(params.databasePath, suffix, maxWaitMs);
  const coordinatorPath = params.databasePath + suffix;
  const startedAt = now();
  const deadline = startedAt + maxWaitMs;
  let attempt = 0;
  let lease;
  for (;;) {
    assertCoordinatorPathSafe(coordinatorPath);
    lease = params.acquire(coordinatorPath, {busyTimeoutMs: 0});
    if (lease) break;
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      const error = new Error(`Agent DB process coordinator wait exceeded ${maxWaitMs}ms`);
      error.code = 'V_AGENT_DB_PROCESS_COORDINATOR_TIMEOUT';
      error.databasePath = params.databasePath;
      error.coordinatorPath = coordinatorPath;
      throw error;
    }
    attempt += 1;
    const backoffMs = Math.min(50, 5 * 2 ** Math.min(attempt, 4));
    const jitterMs = (process.pid + attempt) % 7;
    await sleep(Math.min(remainingMs, backoffMs + jitterMs));
  }
  const waitMs = Math.max(0, now() - startedAt);
  params.onAcquired?.({attempts: attempt + 1, coordinatorPath, waitMs});
  const firsttextHeldAt = Date.now();
  let operationError;
  try {
    return await runWithHeldLease(params.databasePath, suffix, params.fn);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    firsttextLeaseLog('async', waitMs, Date.now() - firsttextHeldAt, attempt + 1);
    try {
      lease.release();
    } catch (releaseError) {
      try { params.onReleaseError?.(releaseError); } catch {}
      if (!operationError) throw releaseError;
    }
  }
}

/** Synchronous fallback for legacy write entry points not admitted by the async session lane. */
export function withAgentDatabaseProcessLeaseSync(params, timing = {}) {
  const now = timing.now ?? Date.now;
  const sleep = timing.sleep ?? (ms => Atomics.wait(syncWait, 0, 0, ms));
  const maxWaitMs = params.maxWaitMs ?? 30_000;
  const suffix = params.suffix ?? '.session-writer-coordinator';
  validateOptions(params.databasePath, suffix, maxWaitMs);
  if (isAgentDatabaseProcessLeaseHeld(params.databasePath, suffix)) return params.fn();
  const coordinatorPath = params.databasePath + suffix;
  const startedAt = now();
  const deadline = startedAt + maxWaitMs;
  let attempt = 0;
  let lease;
  for (;;) {
    assertCoordinatorPathSafe(coordinatorPath);
    lease = params.acquire(coordinatorPath, {busyTimeoutMs: 0});
    if (lease) break;
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      const error = new Error(`Agent DB process coordinator wait exceeded ${maxWaitMs}ms`);
      error.code = 'V_AGENT_DB_PROCESS_COORDINATOR_TIMEOUT';
      error.databasePath = params.databasePath;
      error.coordinatorPath = coordinatorPath;
      throw error;
    }
    attempt += 1;
    const backoffMs = Math.min(50, 5 * 2 ** Math.min(attempt, 4));
    sleep(Math.min(remainingMs, backoffMs + ((process.pid + attempt) % 7)));
  }
  const firsttextWaitMs = Math.max(0, now() - startedAt);
  params.onAcquired?.({attempts: attempt + 1, coordinatorPath, waitMs: firsttextWaitMs});
  const firsttextHeldAt = Date.now();
  let operationError;
  try {
    return runWithHeldLease(params.databasePath, suffix, params.fn);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    firsttextLeaseLog('sync', firsttextWaitMs, Date.now() - firsttextHeldAt, attempt + 1);
    try {
      lease.release();
    } catch (releaseError) {
      try { params.onReleaseError?.(releaseError); } catch {}
      if (!operationError) throw releaseError;
    }
  }
}
