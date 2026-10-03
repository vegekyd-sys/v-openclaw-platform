// Share only a live generation across OpenClaw's duplicate runtime registries.
// Service ownership is tied to the native service context, not module identity:
// a cached plugin registration can be started again with a new service context.
//
// worker-generations.1: a replaced generation drains instead of being killed.
// Stopping a service only stops admission; the new generation starts at once
// and takes over unassigned turns, while runs already in the old Workers finish
// there. WorkerPool.close() stays the hard stop.
export function acquireWorkerRuntime(key, createRuntime) {
  const previous = globalThis[key];
  if (previous && !previous.pool.closing) return previous;
  const runtime = createRuntime();
  runtime.generation = (previous?.generation ?? 0) + 1;
  runtime.pool.generation = runtime.generation;
  if (previous) {
    runtime.predecessor = previous;
    runtime.predecessorDrained = Promise.resolve(previous.pool.beginDrain(runtime.pool));
    runtime.predecessorDrained.catch(() => {});
  }
  globalThis[key] = runtime;
  return runtime;
}

// Prepared model snapshots can retain a harness registration whose service was
// never restarted. Resolve only at admission, then keep that generation for the
// entire request. Never create a pool using a stale snapshot's configuration.
export function resolveWorkerRuntime(key, captured) {
  if (!captured.pool.closing) return captured;
  const current = globalThis[key];
  if (current && !current.pool.closing && current.serviceOwner && !current.serviceOwner.stopped) {
    return current;
  }
  throw new Error("worker pool is closing; no active service generation");
}

// A turn admitted during the few seconds of a plugin reload waits for the next
// generation instead of failing.
export async function awaitWorkerRuntime(key, captured, { timeoutMs = 60_000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return resolveWorkerRuntime(key, captured);
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Operator-requested roll: replace the live generation so new Workers re-read
// worker code, worker config and plugins from disk, without a Gateway restart.
// Service ownership moves to the new generation; the old one drains.
export async function rollWorkerRuntime(key, acquire, bind) {
  const previous = globalThis[key];
  if (!previous || previous.pool.closing || !previous.serviceOwner || previous.serviceOwner.stopped) {
    throw new Error("no active worker generation to roll");
  }
  const owner = previous.serviceOwner;
  previous.pool.beginDrain();
  const runtime = acquire();
  if (runtime === previous) throw new Error("worker generation did not change");
  runtime.serviceOwner = owner;
  owner.runtime = runtime;
  previous.serviceOwner = undefined;
  bind(runtime);
  await runtime.pool.start();
  return runtime;
}

export function createWorkerRuntimeLifecycle({ acquire, bind }) {
  const owners = new WeakMap();
  const defaultContext = {};
  const contextKey = context => context && typeof context === "object"
    ? context : defaultContext;

  return {
    start(context) {
      const key = contextKey(context);
      const existing = owners.get(key);
      if (existing) {
        if (existing.stopped) return Promise.reject(new Error("Worker service context is retired"));
        return existing.startPromise;
      }
      const runtime = acquire();
      const owner = { runtime, stopped: false, startPromise: null, stopPromise: null };
      owners.set(key, owner);
      runtime.serviceOwner = owner;
      owner.startPromise = (async () => {
        try {
          if (owner.stopped || runtime.serviceOwner !== owner) {
            throw new Error("Worker service start was superseded");
          }
          bind(runtime);
          await runtime.pool.start();
          if (owner.stopped || runtime.serviceOwner !== owner || runtime.pool.closing) {
            throw new Error("Worker service start was superseded");
          }
        } catch (error) {
          if (runtime.serviceOwner === owner) {
            await runtime.pool.close();
            if (runtime.serviceOwner === owner) runtime.serviceOwner = undefined;
          }
          throw error;
        }
      })();
      return owner.startPromise;
    },
    stop(context) {
      const owner = owners.get(contextKey(context));
      if (!owner) return Promise.resolve();
      if (owner.stopPromise) return owner.stopPromise;
      owner.stopped = true;
      owner.stopPromise = (async () => {
        // A late stop belongs only to the generation and lease it started.
        // A roll may have moved this owner to a newer generation.
        const runtime = owner.runtime;
        if (runtime.serviceOwner !== owner) return;
        try {
          // Stop admission only; the next generation adopts unassigned turns
          // and admitted runs finish in the Workers that own them.
          runtime.pool.beginDrain();
          await owner.startPromise.catch(() => {});
        } finally {
          if (runtime.serviceOwner === owner) runtime.serviceOwner = undefined;
        }
      })();
      return owner.stopPromise;
    },
  };
}
