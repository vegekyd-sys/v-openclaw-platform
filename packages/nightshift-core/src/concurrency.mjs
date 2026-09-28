// How many cards one project may have in flight this pass.
//
// A Workflow's concurrency.perInstance is the project's guaranteed share, not a
// ceiling. When the board has room and few projects have work, idle capacity
// goes to the projects that do, up to a burst cap: perInstance x burstFactor,
// or the Workflow's own concurrency.maxPerInstance when a stage is bound by
// something outside Night Shift (devices, accounts). The global target stays
// with the dispatch-pressure guard, so borrowing never outruns the lease, host
// memory or harm-ceiling brakes.
//
// On V (2026-09-28) two 星擎夜班 D projects ran 2 cards each with a board
// target of 18 and 18 GB free: perInstance: 2 held the batch to a fifth of
// what the host could take.
export function effectivePerInstance(release, { fairShare = null, burstFactor = 3 } = {}) {
  const concurrency = release?.spec?.concurrency ?? {};
  const base = positiveInteger(concurrency.perInstance) ?? 1;
  if (!Number.isFinite(fairShare) || fairShare <= base) return base;
  const cap = positiveInteger(concurrency.maxPerInstance) ?? Math.max(base, Math.floor(base * Math.max(1, burstFactor)));
  return Math.max(base, Math.min(cap, Math.floor(fairShare)));
}

// The board's target split across the projects that have work right now.
export function fairShareOf(maxActive, busyProjects) {
  return Math.floor(Math.max(0, maxActive) / Math.max(1, busyProjects));
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
