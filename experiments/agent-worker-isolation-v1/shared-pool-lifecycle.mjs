// A stopped generation is never resurrected. Registrations may share a live
// generation, but their service leases may only stop that captured generation.
export function acquirePoolGeneration(current, create) {
  if (!current || current.retired || current.pool.closing) return create();
  return current;
}

export function createPoolServiceLease(shared, onStarted = () => {}) {
  const owners = shared.serviceOwners ??= new Set();
  const owner = {};
  let startPromise;
  let stopPromise;
  let stopped = false;
  return {
    start() {
      if (stopped || shared.retired || shared.pool.closing) {
        return Promise.reject(new Error("Worker pool service generation is retired"));
      }
      if (startPromise) return startPromise;
      owners.add(owner);
      startPromise = (async () => {
        try {
          await shared.pool.start();
          if (stopped || shared.retired || shared.pool.closing) {
            throw new Error("Worker pool service stopped during startup");
          }
          onStarted();
        } catch (error) {
          owners.delete(owner);
          if (owners.size === 0) {
            shared.retired = true;
            await shared.pool.close();
          }
          throw error;
        }
      })();
      return startPromise;
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopped = true;
      owners.delete(owner);
      if (owners.size === 0) {
        shared.retired = true;
        stopPromise = shared.pool.close();
      } else {
        stopPromise = Promise.resolve();
      }
      return stopPromise;
    },
  };
}
