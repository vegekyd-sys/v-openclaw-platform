// Query current rows on every open. No durable "done" bit: later missing
// provenance still runs the original conservative backfill and hash invalidation.
const stats = {skippedComplete: 0, originalRequired: 0};
export function getProvenanceFastPathStats() {return {pid: process.pid, ...stats};}
const canonical = sql => sql.replace(/\bIF\s+NOT\s+EXISTS\b/gi, '').replace(/\s+/g, ' ').trim().replace(/;$/, '');
export function isMemoryProvenanceBackfillComplete(db, expectedSchema, env = process.env) {
  if (env.OPENCLAW_DB91_PROVENANCE_ENABLE !== '1') return false;
  const schema = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='memory_index_chunk_provenance'").get();
  if (typeof schema?.sql !== 'string' || canonical(schema.sql) !== canonical(expectedSchema)) {
    stats.originalRequired++; return false;
  }
  // Both observations share one SQLite statement/read snapshot. The first
  // anti-join uses the two PK covering indexes, not the large text/vector rows.
  const row = db.prepare(`SELECT
    EXISTS(SELECT 1 FROM sqlite_schema WHERE type='trigger' AND
      (name='memory_index_chunk_provenance_after_insert' OR tbl_name='memory_index_chunk_provenance')) AS has_trigger,
    EXISTS(SELECT 1 FROM memory_index_chunks AS chunk
      LEFT JOIN memory_index_chunk_provenance AS provenance ON provenance.chunk_id=chunk.id
      WHERE provenance.chunk_id IS NULL LIMIT 1) AS has_missing`).get();
  if (row.has_trigger || row.has_missing) {stats.originalRequired++; return false;}
  stats.skippedComplete++;
  return true;
}
