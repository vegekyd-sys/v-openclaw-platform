// Retry only before the supplied synchronous transaction callback was entered.
// The prepared patch, commit guard, SQL transaction and publications stay native.
export async function withSqliteBeginContentionRetry({database, run, operation}, timing = {}) {
  const now = timing.now ?? Date.now;
  const sleep = timing.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maxWaitMs = timing.maxWaitMs ?? 30000;
  const deadline = now() + maxWaitMs;
  let attempt = 0;
  for (;;) {
    let entered = false;
    try {
      return run(db => {entered = true; return operation(db);});
    } catch (error) {
      const primary = Number.isInteger(error?.errcode) ? error.errcode & 255 : undefined;
      const locked = error?.code === 'SQLITE_BUSY' || error?.code === 'SQLITE_LOCKED' || primary === 5 || primary === 6;
      // Never retry corruption, stale snapshots, SQL errors, nested transactions,
      // a closed handle, or any failure after entering the commit callback.
      if (entered || !locked || !database.isOpen || database.isTransaction || now() >= deadline || ++attempt >= 32) throw error;
      await sleep(Math.min(80, 5 * 2 ** Math.min(attempt, 4), Math.max(0, deadline - now())));
      if (!database.isOpen || database.isTransaction) throw error;
    }
  }
}

// Synchronous session-admission paths cannot yield while preserving their native
// API. Retry only a failed BEGIN edge; once the callback is entered, the write and
// its post-commit publications remain single-shot.
const SQLITE_SYNC_RETRY_WAIT = new Int32Array(new SharedArrayBuffer(4));
export function withSqliteBeginContentionRetrySync({database, run, operation}, timing = {}) {
  const now = timing.now ?? Date.now;
  const sleep = timing.sleep ?? (ms => Atomics.wait(SQLITE_SYNC_RETRY_WAIT, 0, 0, ms));
  const maxWaitMs = timing.maxWaitMs ?? 30000;
  const deadline = now() + maxWaitMs;
  let attempt = 0;
  for (;;) {
    let entered = false;
    try {
      return run(db => {entered = true; return operation(db);});
    } catch (error) {
      const primary = Number.isInteger(error?.errcode) ? error.errcode & 255 : undefined;
      const locked = error?.code === 'SQLITE_BUSY' || error?.code === 'SQLITE_LOCKED' || primary === 5 || primary === 6;
      if (entered || !locked || !database.isOpen || database.isTransaction || now() >= deadline || ++attempt >= 32) throw error;
      sleep(Math.min(80, 5 * 2 ** Math.min(attempt, 4), Math.max(0, deadline - now())));
      if (!database.isOpen || database.isTransaction) throw error;
    }
  }
}
