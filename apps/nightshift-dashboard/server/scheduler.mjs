export async function runNightShiftSchedulerPulse({
  dispatchMaxStarts = 12,
  maxWorkboardActive = 36,
  refreshCards,
  runtime,
  store,
  syncContentItemsManifest,
  workboard,
}) {
  let cards = await refreshCards();
  let changed = false;
  const warnings = [];

  for (const instance of store.listInstances()) {
    if (instance.status !== "active") continue;
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
    if (result.applied.length === 0) continue;
    changed = true;
    cards = mergeAppliedCards(cards, result.applied);
  }

  if (changed) cards = await refreshCards();

  const running = cards.filter(cardIsRunning).length;
  const ready = cards.filter((card) => card.status === "ready").length;
  const available = Math.max(0, maxWorkboardActive - running);
  const maxStarts = Math.min(dispatchMaxStarts, available, ready);
  const dispatch = maxStarts > 0 ? await workboard.dispatch(maxStarts) : null;

  return {
    changed,
    dispatch,
    maxStarts,
    ready,
    running,
    warnings,
  };
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
