// One controller tick: given quota pacing, session rows and the ledger of
// sessions this controller switched, decide which sessions to upgrade or revert.
//
// Ownership rule: the controller only ever touches
//   - sessions with no model override at all (they run the agent default), and
//   - sessions it switched itself and whose model is still exactly what it set.
// Anything else (a /model or alias the user typed, an automatic fallback) belongs
// to someone else and is released from the ledger without a patch.

import { scoreSession, DEFAULT_IMPORTANCE } from "./importance.mjs";

export const DEFAULT_POLICY = {
  maxUpgradesPerTick: 1, // ramp slowly; quota readings lag behind usage
  minHoldMinutes: 120, // do not bounce a session between harnesses
  idleReleaseHours: 24, // an upgraded session idle this long gives its slot back
  forgetAfterDays: 30,
};

export const rowModelRef = (row) => (row.modelProvider && row.model ? `${row.modelProvider}/${row.model}` : row.model ?? null);

/**
 * @param {object} p
 * @param {number} p.now
 * @param {Array} p.tiers [{ id, model, quota, maxSessions, ownerOnly, maxTotalTokens }]
 * @param {object} p.pace { [quotaKey]: paceTier() result }
 * @param {Array} p.rows sessions.list rows
 * @param {object} p.ledger { sessions: { [key]: { tier, model, upgradedAt, score } } }
 * @param {object} [p.policy]
 * @param {object} [p.importance]
 * @param {number} [p.listActiveMinutes] the activeMinutes the rows were listed with
 */
export function decide({ now, tiers, pace, rows, ledger, policy, importance, listActiveMinutes }) {
  const pol = { ...DEFAULT_POLICY, ...(policy ?? {}) };
  const imp = { ...DEFAULT_IMPORTANCE, ...(importance ?? {}) };
  const managed = { ...(ledger?.sessions ?? {}) };
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const actions = [];
  const notes = [];

  // 1. Reconcile the ledger with what the sessions actually run now.
  for (const [key, entry] of Object.entries(managed)) {
    const row = byKey.get(key);
    if (!row) {
      if (now - (entry.lastSeenAt ?? entry.upgradedAt) > pol.forgetAfterDays * 86_400_000) {
        delete managed[key];
        notes.push(`${key}: not seen for ${pol.forgetAfterDays} days, forgotten`);
      }
      continue;
    }
    entry.lastSeenAt = now;
    if (rowModelRef(row) !== entry.model || row.modelOverrideSource !== "user") {
      actions.push({ type: "release", key, tier: entry.tier, why: `model is now ${rowModelRef(row)} (${row.modelOverrideSource ?? "default"}); someone else chose it` });
      delete managed[key];
      continue;
    }
    if (!tierById.has(entry.tier)) {
      actions.push({ type: "revert", key, tier: entry.tier, why: "tier no longer configured" });
    }
  }

  const reverting = new Set(actions.filter((a) => a.type === "revert").map((a) => a.key));
  const liveManaged = (tierId) => Object.entries(managed)
    .filter(([key, e]) => e.tier === tierId && !reverting.has(key))
    .map(([key, e]) => ({ key, ...e, row: byKey.get(key) }));
  const revert = (m, why) => {
    if (reverting.has(m.key)) return;
    if (m.row?.hasActiveRun) { notes.push(`${m.key}: revert deferred, a run is active`); return; }
    if (!m.row && !m.idleByAbsence) { notes.push(`${m.key}: revert deferred, session not in the active list`); return; }
    reverting.add(m.key);
    actions.push({ type: "revert", key: m.key, tier: m.tier, why });
  };

  // 2. Shed load where quota is exhausted, braking, or over the configured slots.
  for (const tier of tiers) {
    const p = pace[tier.quota] ?? { state: "unknown" };
    const list = liveManaged(tier.id).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    if (p.state === "exhausted") {
      for (const m of list) revert(m, `${tier.quota} exhausted: ${p.reason}`);
      continue;
    }
    const held = (m) => now - m.upgradedAt >= pol.minHoldMinutes * 60_000;
    if (p.state === "brake") {
      const victim = list.find(held);
      if (victim) revert(victim, `${tier.quota} brake: ${p.reason}`);
    }
    const over = list.length - (tier.maxSessions ?? Infinity);
    for (const m of list.slice(0, Math.max(0, over))) revert(m, `more than maxSessions=${tier.maxSessions}`);
    for (const m of list) {
      const last = m.row?.lastInteractionAt ?? m.row?.updatedAt;
      if (last && now - last > pol.idleReleaseHours * 3_600_000) revert(m, `idle ${Math.round((now - last) / 3_600_000)} h`);
      // Not in a list of sessions active within listActiveMinutes <= idle window: nobody touched
      // it (no message, no model change) for that long, so reverting cannot undo a user choice.
      if (!m.row && listActiveMinutes && listActiveMinutes <= pol.idleReleaseHours * 60 && now - m.upgradedAt > pol.idleReleaseHours * 3_600_000) {
        revert({ ...m, idleByAbsence: true }, `idle: not active within ${listActiveMinutes} min`);
      }
    }
  }

  // 3. Spend surplus: best-scoring default-model sessions first.
  const capacity = new Map();
  for (const tier of tiers) {
    const p = pace[tier.quota] ?? { state: "unknown" };
    const used = liveManaged(tier.id).length;
    const cap = p.state === "surplus" ? Math.max(0, Math.min(tier.maxSessions ?? Infinity, p.slots) - used) : 0;
    capacity.set(tier.id, cap);
  }
  const scored = [];
  for (const row of rows) {
    if (managed[row.key] || row.modelOverrideSource) continue; // only sessions running the agent default
    if (row.hasActiveRun) continue;
    const s = scoreSession(row, now, imp);
    if (s.excluded) continue;
    scored.push({ row, ...s });
  }
  scored.sort((a, b) => b.score - a.score || (b.row.lastInteractionAt ?? 0) - (a.row.lastInteractionAt ?? 0));
  let upgrades = 0;
  for (const cand of scored) {
    if (upgrades >= pol.maxUpgradesPerTick) break;
    const eligible = tiers.filter((tier) => {
      const p = pace[tier.quota];
      const minScore = p?.endgame ? imp.endgameMinScore : imp.minScore;
      if (cand.score < minScore) return false;
      if ((capacity.get(tier.id) ?? 0) <= 0) return false;
      if (tier.ownerOnly && !cand.ownerOnly) return false;
      if (tier.maxTotalTokens && (cand.row.totalTokens ?? 0) > tier.maxTotalTokens) return false;
      return true;
    });
    if (!eligible.length) continue;
    // Spend the quota that is most likely to expire unused.
    eligible.sort((a, b) => (pace[b.quota].surplusPercent ?? 0) - (pace[a.quota].surplusPercent ?? 0));
    const tier = eligible[0];
    capacity.set(tier.id, capacity.get(tier.id) - 1);
    upgrades += 1;
    actions.push({ type: "upgrade", key: cand.row.key, tier: tier.id, model: tier.model, score: cand.score, reasons: cand.reasons });
  }

  return {
    actions,
    notes,
    candidates: scored.slice(0, 10).map((c) => ({ key: c.row.key, score: c.score, ownerOnly: c.ownerOnly, reasons: c.reasons })),
    ledger: { ...(ledger ?? {}), sessions: managed },
  };
}

/** Apply a successful action to the ledger. */
export function commitAction(ledger, action, now) {
  const sessions = { ...(ledger.sessions ?? {}) };
  if (action.type === "upgrade") sessions[action.key] = { tier: action.tier, model: action.model, upgradedAt: now, lastSeenAt: now, score: action.score };
  else delete sessions[action.key];
  return { ...ledger, sessions };
}
