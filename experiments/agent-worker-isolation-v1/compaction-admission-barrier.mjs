function readSessionKey(event, context) {
  for (const value of [context?.sessionKey, event?.sessionKey]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function createCompactionAdmissionBarrier(options = {}) {
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 120_000));
  const active = new Map();
  const stats = {
    started: 0,
    completed: 0,
    waits: 0,
    timedOut: 0,
    lastWaitMs: undefined,
    lastSessionKey: undefined,
  };

  function finish(sessionKey, outcome) {
    const entry = active.get(sessionKey);
    if (!entry) {
      return;
    }
    active.delete(sessionKey);
    clearTimeout(entry.timer);
    entry.resolve(outcome);
  }

  function beforeCompaction(event, context) {
    const sessionKey = readSessionKey(event, context);
    if (!sessionKey || active.has(sessionKey)) {
      return;
    }
    let resolveWait;
    const promise = new Promise((resolve) => {
      resolveWait = resolve;
    });
    const timer = setTimeout(() => {
      stats.timedOut += 1;
      finish(sessionKey, "timeout");
    }, timeoutMs);
    timer.unref?.();
    active.set(sessionKey, {
      promise,
      resolve: resolveWait,
      timer,
      startedAt: Date.now(),
    });
    stats.started += 1;
    stats.lastSessionKey = sessionKey;
  }

  function afterCompaction(event, context) {
    const sessionKey = readSessionKey(event, context);
    if (!sessionKey) {
      return;
    }
    if (active.has(sessionKey)) {
      stats.completed += 1;
    }
    finish(sessionKey, "completed");
  }

  async function beforeDispatch(event, context) {
    const sessionKey = readSessionKey(event, context);
    const entry = sessionKey ? active.get(sessionKey) : undefined;
    if (!entry) {
      return;
    }
    stats.waits += 1;
    await entry.promise;
    stats.lastWaitMs = Date.now() - entry.startedAt;
  }

  function status() {
    return {
      ...stats,
      timeoutMs,
      activeSessions: active.size,
    };
  }

  function dispose() {
    for (const sessionKey of active.keys()) {
      finish(sessionKey, "disposed");
    }
  }

  return {
    beforeCompaction,
    afterCompaction,
    beforeDispatch,
    status,
    dispose,
  };
}
