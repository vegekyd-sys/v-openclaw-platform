const DEFAULT_TTL_MS = 180_000;
const DERIVED_FIELDS = ["skillsSnapshot", "systemPromptReport"];

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(env = process.env) {
  return /^(1|true|yes)$/i.test(
    env.OPENCLAW_SESSION_HOTSET_ENABLED ?? "",
  );
}

function serializedBytes(value) {
  if (value === undefined) {
    return 0;
  }
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

const runtimeStats = {
  projections: 0,
  scannedEntries: 0,
  hotEntries: 0,
  coldEntries: 0,
  changedEntries: 0,
  derivedFieldsRemoved: 0,
  bytesRemoved: 0,
};

/**
 * Keeps the central Session directory intact while evicting only derived,
 * reproducible prompt state from dormant entries. OpenClaw rebuilds both
 * fields through its native ensureSkillSnapshot/run-result paths when the
 * Session is activated again.
 */
export function applySessionHotsetProjection(store, options = {}) {
  const ttlMs = positiveInteger(
    options.ttlMs ?? process.env.OPENCLAW_SESSION_HOTSET_TTL_MS,
    DEFAULT_TTL_MS,
  );
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const cutoffMs = nowMs - ttlMs;
  const preserveKeys = new Set([
    ...(Array.isArray(options.preserveKeys) ? options.preserveKeys : []),
    ...(typeof options.activeSessionKey === "string" &&
    options.activeSessionKey.trim()
      ? [options.activeSessionKey]
      : []),
  ]);
  const result = {
    enabled: options.force === true || enabled(),
    ttlMs,
    scannedEntries: 0,
    hotEntries: 0,
    coldEntries: 0,
    changedEntries: 0,
    derivedFieldsRemoved: 0,
    bytesRemoved: 0,
    sessionCountBefore: Object.keys(store ?? {}).length,
    sessionCountAfter: Object.keys(store ?? {}).length,
  };
  if (!result.enabled || !store || typeof store !== "object") {
    return result;
  }

  for (const [sessionKey, entry] of Object.entries(store)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    result.scannedEntries += 1;
    const updatedAt = Number(entry.updatedAt);
    const isHot =
      preserveKeys.has(sessionKey) ||
      (Number.isFinite(updatedAt) && updatedAt >= cutoffMs);
    if (isHot) {
      result.hotEntries += 1;
      continue;
    }

    result.coldEntries += 1;
    let changed = false;
    for (const field of DERIVED_FIELDS) {
      if (!Object.hasOwn(entry, field) || entry[field] === undefined) {
        continue;
      }
      result.bytesRemoved += serializedBytes(entry[field]);
      delete entry[field];
      result.derivedFieldsRemoved += 1;
      changed = true;
    }
    if (changed) {
      result.changedEntries += 1;
    }
  }

  runtimeStats.projections += 1;
  for (const key of [
    "scannedEntries",
    "hotEntries",
    "coldEntries",
    "changedEntries",
    "derivedFieldsRemoved",
    "bytesRemoved",
  ]) {
    runtimeStats[key] += result[key];
  }
  return result;
}

export function getSessionHotsetStatus() {
  return {
    enabled: enabled(),
    ttlMs: positiveInteger(
      process.env.OPENCLAW_SESSION_HOTSET_TTL_MS,
      DEFAULT_TTL_MS,
    ),
    strategy: "central-directory-cold-derived-state-v1",
    retainedForEverySession: [
      "sessionId",
      "sessionFile",
      "updatedAt",
      "deliveryContext",
      "route",
      "compactionCheckpoints",
      "pluginState",
    ],
    rebuiltOnActivation: [...DERIVED_FIELDS],
    ...runtimeStats,
  };
}

export function resetSessionHotsetStatsForTest() {
  for (const key of Object.keys(runtimeStats)) {
    runtimeStats[key] = 0;
  }
}
