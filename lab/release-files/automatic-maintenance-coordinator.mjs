// One best-effort automatic sweep per physical Agent store per minute.
// Uses the native SQLite coordinator lock on a separate, data-free sidecar;
// never locks the Agent database or changes foreground/explicit maintenance.
import fs from 'node:fs';
export function acquireAutomaticMaintenancePermit(database, acquire, options = {}) {
  if (!database.db.isOpen) return null;
  if (typeof database.path !== 'string' || !database.path.startsWith('/')) throw new Error('Automatic maintenance requires an owned absolute database path');
  const cooldownMs = options.cooldownMs ?? 60_000;
  if (!Number.isFinite(cooldownMs) || cooldownMs < 0) throw new Error('Invalid automatic maintenance cooldown');
  const coordinatorPath = database.path + '.automatic-maintenance-coordinator';
  try {
    const stat = fs.lstatSync(coordinatorPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe automatic maintenance coordinator file');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lease = acquire(coordinatorPath, {busyTimeoutMs: 0});
  if (!lease) return null;
  let finished = false, released = false;
  const release = () => {
    if (released) return;
    released = true;
    try { lease.release(); } catch (error) { try { options.onReleaseError?.(error); } catch {} }
  };
  return {
    finish(success) {
      if (finished) return;
      finished = true;
      if (!success || !database.db.isOpen || cooldownMs === 0) { release(); return; }
      const timer = (options.setTimer ?? setTimeout)(release, cooldownMs);
      timer.unref?.();
    },
  };
}
