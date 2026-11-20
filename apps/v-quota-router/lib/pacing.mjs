// Weekly-quota pacing: decide, per subscription, whether there is spare quota
// that would otherwise expire unused at the next reset.
//
// A window is { usedPercent, resetsAt (ms), windowMs, limited, label }.
// Samples are [{ t (ms), used (percent) }] for the same window, oldest first.

const HOUR = 3_600_000;

export const DEFAULT_PACING = {
  reservePercent: 15, // keep for the owner's own Claude Code / Codex use; never plan to spend it
  hardStopPercent: 90, // weekly used >= this: revert everything on this tier
  fiveHourBrakePercent: 70, // 5h window used >= this: no new upgrades
  fiveHourStopPercent: 85, // 5h window used >= this: revert everything on this tier
  upMarginPercent: 10, // projected unused at reset >= this: may add sessions
  downMarginPercent: 2, // projected unused at reset < this: shed sessions
  rateLookbackHours: 24, // consumption rate is measured over this much history (one day/night cycle)
  minRateSpanHours: 6, // shorter sample history falls back to the window-average rate
  minRateDenominatorHours: 24, // early in a window, average over at least one day: usage is bursty
  endgameHours: 36, // in the last N hours before reset, spend the remaining headroom
  percentPerSession: 4, // rough weekly-percent one upgraded session uses until reset
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Consumption rate in percent per hour, measured from samples, else from the window average. */
export function consumptionRate(window, samples, now, cfg = DEFAULT_PACING) {
  const start = window.resetsAt - window.windowMs;
  const elapsedH = Math.max((now - start) / HOUR, 1 / 60);
  const average = window.usedPercent / Math.max(elapsedH, cfg.minRateDenominatorHours);
  const since = now - cfg.rateLookbackHours * HOUR;
  const inWindow = (samples ?? []).filter((s) => s.t >= Math.max(start, since) && s.t <= now);
  if (inWindow.length >= 2) {
    const first = inWindow[0];
    const last = inWindow.at(-1);
    const spanH = (last.t - first.t) / HOUR;
    if (spanH >= cfg.minRateSpanHours) {
      return { rate: Math.max(0, (last.used - first.used) / spanH), basis: "samples", spanH: round(spanH) };
    }
  }
  return { rate: Math.max(0, average), basis: "window-average", spanH: round(elapsedH) };
}

/**
 * Pace one weekly window (optionally with a 5h window as a brake).
 * Returns { state, surplusPercent, slots, ... } where state is one of
 * exhausted | brake | hold | surplus | unknown.
 */
export function paceTier({ weekly, fiveHour, samples, now, config }) {
  const cfg = { ...DEFAULT_PACING, ...(config ?? {}) };
  if (!weekly || !Number.isFinite(weekly.usedPercent) || !Number.isFinite(weekly.resetsAt)) {
    return { state: "unknown", reason: "no weekly window", slots: 0 };
  }
  const used = weekly.usedPercent;
  const remainingH = Math.max(0, (weekly.resetsAt - now) / HOUR);
  const elapsedFraction = clamp(1 - (weekly.resetsAt - now) / weekly.windowMs, 0, 1);
  const budgetEnd = 100 - cfg.reservePercent;
  const headroom = budgetEnd - used;
  const { rate, basis, spanH } = consumptionRate(weekly, samples, now, cfg);
  const projectedAtReset = used + rate * remainingH;
  const endgame = remainingH <= cfg.endgameHours;
  // In the endgame the projection is dominated by noise; what is left will expire anyway.
  const surplusPercent = endgame ? headroom : budgetEnd - projectedAtReset;
  const facts = {
    usedPercent: round(used),
    elapsedPercent: round(elapsedFraction * 100),
    remainingHours: round(remainingH),
    ratePercentPerHour: round(rate, 3),
    rateBasis: basis,
    rateSpanHours: spanH,
    projectedAtResetPercent: round(projectedAtReset),
    budgetEndPercent: budgetEnd,
    surplusPercent: round(surplusPercent),
    endgame,
  };
  if (weekly.limited || used >= cfg.hardStopPercent) {
    return { state: "exhausted", reason: weekly.limited ? "provider reports limit reached" : `weekly ${used}% >= ${cfg.hardStopPercent}%`, slots: 0, ...facts };
  }
  if (fiveHour && Number.isFinite(fiveHour.usedPercent)) {
    facts.fiveHourPercent = round(fiveHour.usedPercent);
    if (fiveHour.limited || fiveHour.usedPercent >= cfg.fiveHourStopPercent) {
      return { state: "exhausted", reason: `5h ${fiveHour.usedPercent}% >= ${cfg.fiveHourStopPercent}%`, slots: 0, ...facts };
    }
  }
  if (surplusPercent < cfg.downMarginPercent) {
    return { state: "brake", reason: `projected unused ${round(surplusPercent)}% < ${cfg.downMarginPercent}%`, slots: 0, ...facts };
  }
  const fiveHourBraked = fiveHour && fiveHour.usedPercent >= cfg.fiveHourBrakePercent;
  if (surplusPercent < cfg.upMarginPercent || fiveHourBraked) {
    return { state: "hold", reason: fiveHourBraked ? `5h ${fiveHour.usedPercent}% >= ${cfg.fiveHourBrakePercent}%` : `projected unused ${round(surplusPercent)}% < ${cfg.upMarginPercent}%`, slots: 0, ...facts };
  }
  const slots = Math.max(1, Math.floor(surplusPercent / cfg.percentPerSession));
  return { state: "surplus", reason: `projected unused ${round(surplusPercent)}%${endgame ? " (endgame)" : ""}`, slots, ...facts };
}

/** Keep samples of the current window only, and at most one per `minGapMs`. */
export function recordSample(samples, window, now, { minGapMs = 10 * 60_000, max = 400 } = {}) {
  const start = window.resetsAt - window.windowMs;
  const kept = (samples ?? []).filter((s) => s.t >= start && s.used <= window.usedPercent + 0.5);
  const last = kept.at(-1);
  if (!last || now - last.t >= minGapMs || window.usedPercent !== last.used) {
    kept.push({ t: now, used: window.usedPercent });
  }
  return kept.slice(-max);
}

function round(x, digits = 1) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
