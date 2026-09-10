// Cache only complete, stable, non-transactional native lookup results.
// Mutation/CAS/owner-slot code never consults this cache.
const caches = new WeakMap();
// Native board limit is 2,000 cards. Cover a complete lifecycle sweep without
// eviction churn, while retaining an independent byte cap for unusually large
// histories (less than 0.2% of the shared service's existing memory.high).
export const MAX_KEYS = 2048;
export const MAX_BYTES = 16 * 1024 ** 2;
export const MAX_ENTRY_BYTES = 512 * 1024;
function epoch(db) {
  // Query the live handle on every call: closed databases and schema failures
  // cannot accidentally return a cached card. Own writes include rolled back
  // writes; data_version detects commits from every other SQLite connection.
  return [db.prepare('PRAGMA data_version').get().data_version,
    db.prepare('PRAGMA schema_version').get().schema_version,
    db.prepare('SELECT total_changes() AS changes').get().changes].join(':');
}
export function lookupWorkboardSnapshot(db, key, read) {
  if (db.isTransaction !== false) { caches.delete(db); return read(); }
  let version;
  try { version = epoch(db); } catch (error) { caches.delete(db); throw error; }
  let cache = caches.get(db);
  // A DatabaseSync object may be closed and reopened with reset counters.
  // Statements are finalized on close, so this proves the same live handle.
  if (cache) {
    try { cache.witness.get(); } catch { caches.delete(db); cache = undefined; }
  }
  if (!cache || cache.version !== version) {
    cache = {version, bytes: 0, values: new Map(), witness: db.prepare('SELECT 1')}; caches.set(db, cache);
  }
  const cached = cache.values.get(key);
  if (cached) {
    cache.values.delete(key); cache.values.set(key, cached);
    return structuredClone(cached.value);
  }
  const value = read();
  // An external writer can commit between the parent and child table reads.
  // Preserve that native result, but never save it for a later lookup.
  if (epoch(db) !== version || db.isTransaction !== false) { caches.delete(db); return value; }
  // Large/unserializable cards remain uncached; bounds do not reject a result.
  let bytes, snapshot;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value) ?? '') + Buffer.byteLength(String(key));
    if (bytes > MAX_ENTRY_BYTES) return value;
    snapshot = structuredClone(value);
  } catch { return value; }
  while (cache.values.size >= MAX_KEYS || cache.bytes + bytes > MAX_BYTES) {
    const oldest = cache.values.keys().next().value;
    cache.bytes -= cache.values.get(oldest).bytes; cache.values.delete(oldest);
  }
  cache.values.set(key, {bytes, value: snapshot}); cache.bytes += bytes;
  return value;
}
