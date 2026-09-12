import { stat } from "node:fs/promises";

const DEFAULT_POLL_MS = 250;
const DEFAULT_QUIET_MS = 30_000;
const DEFAULT_MAX_WAIT_MS = 300_000;

function assertAbsolutePath(value, label) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error(`${label} must be an absolute path`);
  }
}

async function fingerprintFile(filename, readStat) {
  try {
    const value = await readStat(filename, { bigint: true });
    if (!value.isFile()) throw new Error(`Automatic maintenance activity path is not a file: ${filename}`);
    // A read-only SQLite connection can update WAL ctime while taking/releasing
    // locks even though the WAL contents did not change. Including ctime makes
    // the isolated planner observe its own read as foreground write activity
    // and interrupt itself. Device/inode still detect replacement; size/mtime
    // track content changes without that self-interference.
    return [value.dev, value.ino, value.size, value.mtimeNs].join(":");
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
}

/**
 * Cross-process foreground writes are visible through the owned Agent database
 * and its WAL. The SHM file is intentionally excluded because readers update it.
 */
export async function readAutomaticMaintenanceActivityFingerprint(databasePath, options = {}) {
  assertAbsolutePath(databasePath, "Automatic maintenance databasePath");
  const readStat = options.stat ?? stat;
  return [
    await fingerprintFile(databasePath, readStat),
    await fingerprintFile(`${databasePath}-wal`, readStat),
  ].join("|");
}

/**
 * Wait until every process sharing this Agent database has stopped committing
 * foreground work for one continuous quiet window. This keeps the expensive
 * best-effort global scan out of burst traffic without changing explicit
 * maintenance or foreground writes.
 */
export async function waitForAutomaticMaintenanceQuietWindow(params, options = {}) {
  assertAbsolutePath(params.databasePath, "Automatic maintenance databasePath");
  if (typeof params.isCurrent !== "function" || typeof params.isLocallyIdle !== "function") {
    throw new Error("Automatic maintenance quiet window requires current and idle checks");
  }
  const quietMs = options.quietMs ?? DEFAULT_QUIET_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  for (const [label, value] of [["quietMs", quietMs], ["pollMs", pollMs], ["maxWaitMs", maxWaitMs]]) {
    if (!Number.isFinite(value) || value < 0 || (label === "pollMs" && value === 0)) {
      throw new Error(`Automatic maintenance ${label} is invalid`);
    }
  }
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  }));
  const readFingerprint = options.readFingerprint ?? (() => readAutomaticMaintenanceActivityFingerprint(params.databasePath));
  const startedAt = now();
  let fingerprint = await readFingerprint();
  let quietSince = params.isLocallyIdle() ? startedAt : undefined;
  while (params.isCurrent()) {
    const at = now();
    if (at - startedAt >= maxWaitMs) return null;
    if (quietSince !== undefined && at - quietSince >= quietMs) {
      return {
        databasePath: params.databasePath,
        fingerprint,
        async changed() {
          return await readFingerprint() !== fingerprint;
        },
      };
    }
    await sleep(Math.min(pollMs, Math.max(0, maxWaitMs - (now() - startedAt))));
    if (!params.isCurrent()) return null;
    const next = await readFingerprint();
    const locallyIdle = params.isLocallyIdle();
    if (!locallyIdle || next !== fingerprint) quietSince = locallyIdle ? now() : undefined;
    else quietSince ??= now();
    fingerprint = next;
  }
  return null;
}

export const automaticMaintenanceQuietWindowDefaults = Object.freeze({
  maxWaitMs: DEFAULT_MAX_WAIT_MS,
  pollMs: DEFAULT_POLL_MS,
  quietMs: DEFAULT_QUIET_MS,
});
