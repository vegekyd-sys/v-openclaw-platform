// Which conversations deserve the stronger (subscription) models first.
//
// Every rule is configuration; the score is a plain sum so a decision can be
// explained line by line ("owner DM +50, pinned +30, active 20 min ago +15").

export const DEFAULT_IMPORTANCE = {
  ownerIds: [], // channel sender ids of the owner, e.g. "feishu:ou_..." (defaults to commands.ownerAllowFrom)
  vip: {}, // session key, key suffix (e.g. "feishu:group:oc_x") or glob -> score
  ownerDirectScore: 50, // a direct chat whose peer is the owner
  ownerOnlyGroupScore: 25, // a group where the owner is the only human participant
  pinnedScore: 30, // pinned in Control UI
  labelKeywords: { "重要": 40, "vip": 40 }, // case-insensitive substring of the session label -> score
  recentMinutes: [[30, 20], [180, 10], [1440, 0]], // last interaction within N minutes -> score; older is excluded
  bigTaskTokens: 120_000, // sessions already carrying long work get a small bonus
  bigTaskScore: 5,
  minScore: 40, // below this a session is never upgraded automatically
  endgameMinScore: 25, // threshold in the last hours before a reset
  exclude: ["*:cron:*", "*:subagent:*", "*:heartbeat*", "*:explicit:vlab-*", "*nightshift*", "*:talk:*"],
};

const globToRegExp = (glob) => new RegExp(`^${glob.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");

export function matchesAny(key, patterns) {
  return (patterns ?? []).some((p) => globToRegExp(p).test(key));
}

function vipScore(key, vip) {
  let best = 0;
  for (const [pattern, score] of Object.entries(vip ?? {})) {
    const hit = pattern.includes("*") ? globToRegExp(pattern).test(key) : key === pattern || key.toLowerCase().endsWith(`:${pattern.toLowerCase()}`);
    if (hit) best = Math.max(best, Number(score) || 0);
  }
  return best;
}

/** Owner-ish identity of a session row: direct peer id from the key, or participant ids. */
function peerIdFromKey(key) {
  // agent:<agent>:<channel>:direct:<peer>  (also :dm:)
  const m = /^agent:[^:]+:([^:]+):(?:direct|dm):(.+)$/i.exec(key);
  return m ? `${m[1]}:${m[2]}` : null;
}

// 2026.9.1 records chat members as { type: "observation", pluginId: "feishu", id: "ou_…",
// senderKind: "human" }; operator/CLI entries carry senderKind "unknown" and agents type "agent".
function humanParticipantIds(row) {
  return (row.participants ?? [])
    .map((p) => p?.identity)
    .filter((i) => i && i.id && i.type !== "agent" && (i.senderKind === "human" || i.type === "user"))
    .map((i) => (i.pluginId ? `${i.pluginId}:${i.id}` : String(i.id)));
}

const isOwnerId = (id, ownerIds) => ownerIds.some((o) => o.toLowerCase() === String(id).toLowerCase() || String(id).toLowerCase().endsWith(`:${o.split(":").pop().toLowerCase()}`));

/**
 * Score one sessions.list row. Returns { score, reasons[], excluded?, ownerOnly }.
 * `ownerOnly` means no human other than the owner is known to be in the chat.
 */
export function scoreSession(row, now, config) {
  const cfg = { ...DEFAULT_IMPORTANCE, ...(config ?? {}) };
  const key = row.key;
  const reasons = [];
  if (matchesAny(key, cfg.exclude)) return { score: 0, reasons: ["excluded by pattern"], excluded: true, ownerOnly: false };
  if (row.isBackground) return { score: 0, reasons: ["background session"], excluded: true, ownerOnly: false };
  const last = row.lastInteractionAt ?? row.updatedAt ?? 0;
  const ageMin = (now - last) / 60_000;
  const recency = [...cfg.recentMinutes].sort((a, b) => a[0] - b[0]).find(([minutes]) => ageMin <= minutes);
  if (!recency) return { score: 0, reasons: [`idle ${Math.round(ageMin)} min`], excluded: true, ownerOnly: false };

  let score = 0;
  const add = (n, why) => { if (n) { score += n; reasons.push(`${why} +${n}`); } };
  const peer = peerIdFromKey(key);
  const humans = humanParticipantIds(row);
  const ownerIds = cfg.ownerIds ?? [];
  const direct = row.chatType === "direct" || row.kind === "direct";
  const ownerDirect = direct && peer !== null && isOwnerId(peer, ownerIds);
  const othersPresent = humans.some((id) => !isOwnerId(id, ownerIds)) || (direct && peer !== null && !ownerDirect);
  const ownerPresent = ownerDirect || humans.some((id) => isOwnerId(id, ownerIds));
  const ownerOnly = ownerPresent && !othersPresent;
  if (ownerDirect) add(cfg.ownerDirectScore, "owner direct chat");
  else if (!direct && ownerOnly) add(cfg.ownerOnlyGroupScore, "group with only the owner");
  add(vipScore(key, cfg.vip), "configured VIP");
  if (row.pinned) add(cfg.pinnedScore, "pinned");
  const label = `${row.label ?? ""} ${row.displayName ?? ""}`.toLowerCase();
  let labelBest = 0;
  for (const [word, n] of Object.entries(cfg.labelKeywords ?? {})) if (word && label.includes(word.toLowerCase())) labelBest = Math.max(labelBest, n);
  add(labelBest, "label keyword");
  add(recency[1], `active ${Math.round(ageMin)} min ago`);
  if ((row.totalTokens ?? 0) >= cfg.bigTaskTokens) add(cfg.bigTaskScore, "long-running work");
  return { score, reasons, excluded: false, ownerOnly };
}
