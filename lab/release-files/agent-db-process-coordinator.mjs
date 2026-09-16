import fs from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';

const DEFAULT_MAX_WAIT_MS = 300_000;
const heldLeases = new AsyncLocalStorage();
const syncWait = new Int32Array(new SharedArrayBuffer(4));

function leaseKey(databasePath, suffix) {
  return `${databasePath}\0${suffix}`;
}

function createHeldLeaseScope(databasePath, suffix) {
  const token = {key: leaseKey(databasePath, suffix), active: true};
  const next = [...(heldLeases.getStore() ?? []), token];
  return {
    run: fn => heldLeases.run(next, fn),
    close: () => { token.active = false; },
  };
}

export function isAgentDatabaseProcessLeaseHeld(databasePath, suffix = '.session-writer-coordinator') {
  const key = leaseKey(databasePath, suffix);
  return heldLeases.getStore()?.some(token => token.active && token.key === key) ?? false;
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
  const scope = createHeldLeaseScope(params.databasePath, suffix);
  let operationError;
  try {
    params.onAcquired?.({attempts: attempt + 1, coordinatorPath, waitMs});
    const result = scope.run(params.fn);
    // A synchronous commit must release before yielding to another microtask.
    // Otherwise a same-process synchronous writer can wait on our own lease.
    return result && typeof result.then === 'function' ? await result : result;
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    scope.close();
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
  const scope = createHeldLeaseScope(params.databasePath, suffix);
  let operationError;
  try {
    params.onAcquired?.({attempts: attempt + 1, coordinatorPath, waitMs: Math.max(0, now() - startedAt)});
    return scope.run(params.fn);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    scope.close();
    try {
      lease.release();
    } catch (releaseError) {
      try { params.onReleaseError?.(releaseError); } catch {}
      if (!operationError) throw releaseError;
    }
  }
}
