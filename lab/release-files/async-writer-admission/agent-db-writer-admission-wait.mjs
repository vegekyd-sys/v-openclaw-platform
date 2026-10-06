import fs from 'node:fs';

// OPENCLAW_ASYNC_WRITER_ADMISSION_V1
// Async callers of the sync Agent DB write transaction otherwise wait for the
// process-global writer lease with Atomics.wait, which freezes every session
// sharing the Node process. This waits on the event loop instead, by probing the
// same coordinator lease and releasing it at once. It never holds the lease
// across a yield and never throws: the sync transaction still acquires the lease
// itself and keeps its own timeout, error and safety checks.
const DEFAULT_SUFFIX = '.session-writer-coordinator';
const DEFAULT_MAX_WAIT_MS = 5_000;

function coordinatorPathIsPlainFile(coordinatorPath) {
  try {
    const stat = fs.lstatSync(coordinatorPath);
    return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

export async function waitForAgentDatabaseWriterAdmission(databasePath, options, timing = {}) {
  try {
    if (process.env.OPENCLAW_ASYNC_WRITER_ADMISSION === '0') return 'disabled';
    if (typeof databasePath !== 'string' || !databasePath.startsWith('/')) return 'skipped';
    if (options.isIncognito?.(databasePath) || options.isHeld?.(databasePath)) return 'skipped';
    const now = timing.now ?? Date.now;
    const sleep = timing.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const coordinatorPath = databasePath + (options.suffix ?? DEFAULT_SUFFIX);
    const deadline = now() + (options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);
    for (let attempt = 0;; attempt += 1) {
      if (!coordinatorPathIsPlainFile(coordinatorPath)) return 'skipped';
      const lease = options.acquire(coordinatorPath, {busyTimeoutMs: 0});
      if (lease) {
        lease.release();
        return attempt === 0 ? 'free' : 'waited';
      }
      const remainingMs = deadline - now();
      if (remainingMs <= 0) return 'timeout';
      const backoffMs = Math.min(50, 5 * 2 ** Math.min(attempt + 1, 4));
      await sleep(Math.min(remainingMs, backoffMs + ((process.pid + attempt) % 7)));
    }
  } catch {
    // Admission is advisory; the native sync path reports any real failure.
    return 'error';
  }
}
