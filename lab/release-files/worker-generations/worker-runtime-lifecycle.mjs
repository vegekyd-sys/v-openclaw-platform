// Share only a live generation across OpenClaw's duplicate runtime registries.
// Service ownership is tied to the native service context, not module identity:
// a cached plugin registration can be started again with a new service context.
export function acquireWorkerRuntime(key, createRuntime) {
  const previous = globalThis[key];
  if (previous && !previous.pool.closing) return previous;
  const runtime = createRuntime();
  runtime.generation = (previous?.generation ?? 0) + 1;
  if (previous) {
    runtime.predecessorClosed = Promise.resolve(previous.pool.close());
    // Registration alone may never be activated. Observe cleanup rejection
    // here; an actual service start still awaits and propagates it.
    runtime.predecessorClosed.catch(() => {});
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
          await runtime.predecessorClosed;
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
      const { runtime } = owner;
      owner.stopPromise = (async () => {
        // A late stop belongs only to the generation and lease it started.
        if (runtime.serviceOwner !== owner) return;
        try {
          await runtime.pool.close();
          await owner.startPromise.catch(() => {});
        } finally {
          if (runtime.serviceOwner === owner) runtime.serviceOwner = undefined;
        }
      })();
      return owner.stopPromise;
    },
  };
}
