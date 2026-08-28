export async function runNightShiftSchedulerPulse({
  dispatchMaxStarts = 12,
  maxWorkboardActive = 36,
  refreshCards,
  runtime,
  store,
  syncContentItemsManifest,
  workboard,
}) {
  const startedAt = performance.now();
  const timings = { instances: [] };
  const activeInstances = store.listInstances().filter((instance) => instance.status === "active");
  let cardIds = instanceCardIds(store, activeInstances);
  const refreshStartedAt = performance.now();
  let cards = await refreshCards({ cardIds });
  timings.refreshMs = elapsedMs(refreshStartedAt);
  let changed = false;
  const warnings = [];

  const runningSessionKeys = cards
    .filter(cardIsRunning)
    .map((card) => card.sessionKey)
    .filter((sessionKey) => typeof sessionKey === "string" && sessionKey);
  if (typeof workboard.prefetchSessions === "function" && runningSessionKeys.length > 0) {
    const prefetchStartedAt = performance.now();
    const prefetched = await workboard.prefetchSessions(runningSessionKeys, { concurrency: 8, limit: 12 });
    timings.prefetchMs = elapsedMs(prefetchStartedAt);
    if (prefetched.failed > 0) warnings.push(`Session snapshot prefetch failed for ${prefetched.failed}/${prefetched.count} running cards`);
  }

  try {
    for (const instance of activeInstances) {
      const instanceStartedAt = performance.now();
      try {
        await syncContentItemsManifest(instance);
      } catch (error) {
        warnings.push(`${instance.id}: ${error.message}`);
        store.appendEvent({
          instanceId: instance.id,
          type: "content-items.import.failed",
          payload: { error: error.message },
        });
      }
      const result = await runtime.tick(instance.id, {
        cards,
        dispatch: false,
      });
      const mutations = result.applied.filter((entry) => ["created", "reopened"].includes(entry.status)).length;
      timings.instances.push({ id: instance.id, ms: elapsedMs(instanceStartedAt), applied: result.applied.length, mutations });
      if (mutations === 0) continue;
      changed = true;
      cards = mergeAppliedCards(cards, result.applied);
    }
  } finally {
    workboard.clearSessionSnapshots?.();
  }

  if (changed) {
    cardIds = instanceCardIds(store, activeInstances);
    const secondRefreshStartedAt = performance.now();
    cards = await refreshCards({ cardIds });
    timings.secondRefreshMs = elapsedMs(secondRefreshStartedAt);
  }

  const running = cards.filter(cardIsRunning).length;
  const ready = cards.filter((card) => card.status === "ready").length;
  const available = Math.max(0, maxWorkboardActive - running);
  const maxStarts = Math.min(dispatchMaxStarts, available, ready);
  const dispatchStartedAt = performance.now();
  const dispatch = maxStarts > 0 ? await workboard.dispatch(maxStarts, { cardIds }) : null;
  timings.dispatchMs = elapsedMs(dispatchStartedAt);
  timings.totalMs = elapsedMs(startedAt);

  return {
    changed,
    dispatch,
    maxStarts,
    ready,
    running,
    scopedCardCount: cardIds.length,
    timings,
    warnings,
  };
}

function elapsedMs(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

export function instanceCardIds(store, instances) {
  const ids = new Set();
  for (const instance of instances) {
    const latestRuns = latestLogicalRuns([
      ...store.listStageRuns(instance.id),
      ...store.listContentItemRuns(instance.id),
    ]);
    for (const run of latestRuns) {
      if (!schedulerRelevantStatus(run.status)) continue;
      if (typeof run.cardId === "string" && run.cardId.trim()) ids.add(run.cardId.trim());
    }
  }
  for (const cardId of store.listActionCardIds?.(instances.map((instance) => instance.id)) ?? []) ids.add(cardId);
  return [...ids];
}

function latestLogicalRuns(runs) {
  const latest = new Map();
  for (const run of runs) {
    const key = `${run.contentItemId ?? ""}\u0000${run.stageId ?? ""}`;
    const current = latest.get(key);
    if (!current || Number(run.attempt ?? 1) >= Number(current.attempt ?? 1)) latest.set(key, run);
  }
  return [...latest.values()];
}

function schedulerRelevantStatus(status) {
  return ["planned", "todo", "ready", "running", "review"].includes(String(status));
}

export function mergeAppliedCards(cards, applied) {
  const merged = new Map(cards.map((card) => [card.id, card]));
  for (const result of applied) {
    if (result.card?.id) merged.set(result.card.id, result.card);
  }
  return [...merged.values()];
}

function cardIsRunning(card) {
  return card.status === "running" ||
    card.execution?.status === "running" ||
    Boolean(card.metadata?.claim);
}
