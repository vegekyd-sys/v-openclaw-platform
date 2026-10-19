#!/usr/bin/env node
// Bound the transcript-archive retention scan by created_at (OpenClaw 2026.9.1).
//
// prunePublishedSessionArchivesByRetention runs on every session lifecycle mutation. It read the
// oldest 256 published rows of session_transcript_archives and only then dropped the rows that
// were younger than the retention. Every selected column except created_at/session_id/generation
// sits after archive_blob, so each visited row walks its whole blob overflow chain. On V
// (10/17: 902 archives, oldest 5 days, retention 14 days) that is a several-second synchronous
// read on the Gateway main thread that removes nothing, repeated on the next reset or delete.
//
// A row younger than the shortest retention rule can never be removable, so the scan is bounded
// to created_at < now - min(olderThanMs). The removable set is unchanged.
//
//   node scripts/patch-openclaw91-archive-retention-cutoff.mjs <lifecycle-state-chunk.js> [--check]

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PATCH_MARKER = "v-archive-retention-cutoff-v1";

const EDITS = [
  {
    name: "cutoff before the scan",
    original: `\tif (rules.size === 0) return 0;
\tconst candidates = await runExclusiveSqliteSessionWrite(params.scope, async () => {`,
    patched: `\tif (rules.size === 0) return 0;
\t// ${PATCH_MARKER}: a row younger than the shortest retention can never be removable, so bound
\t// the scan by created_at. Reading published_at/archive_name walks each row's archive_blob
\t// overflow chain; unbounded, every lifecycle mutation re-read the oldest 256 archives.
\tconst now = params.nowMs ?? Date.now();
\tconst retentionCutoff = now - Math.min(...rules.values());
\tif (now < (archiveRetentionIdleUntil.get(resolveSqliteTranscriptArchiveDirectory(params.scope)) ?? 0)) return 0;
\tconst candidates = await runExclusiveSqliteSessionWrite(params.scope, async () => {`,
  },
  {
    name: "created_at bound in the query",
    original: `]).where("published_at", "is not", null).orderBy("created_at", "asc").orderBy("session_id", "asc").orderBy("generation", "asc").limit(ARCHIVE_RETENTION_BATCH_SIZE)).rows;`,
    patched: `]).where("published_at", "is not", null).where("created_at", "<", retentionCutoff).orderBy("created_at", "asc").orderBy("session_id", "asc").orderBy("generation", "asc").limit(ARCHIVE_RETENTION_BATCH_SIZE)).rows;`,
  },
  {
    name: "reuse now",
    original: `\tconst now = params.nowMs ?? Date.now();
\tconst archiveDirectory = resolveSqliteTranscriptArchiveDirectory(params.scope);`,
    patched: `\tconst archiveDirectory = resolveSqliteTranscriptArchiveDirectory(params.scope);`,
  },
  {
    name: "idle recheck instead of rescanning unremovable archives",
    original: `\tif (removable.length === 0) return 0;
\treturn await runExclusiveSqliteSessionWrite(params.scope, async () => {
\t\tlet removed = 0;`,
    patched: `\t// ${PATCH_MARKER}: aged rows whose files still exist stay unremovable until file retention
\t// runs (never, while session maintenance is in warn mode). Re-reading them on every lifecycle
\t// mutation costs the same blob walk, so an empty pass waits an hour before scanning again.
\tif (removable.length === 0) {
\t\tif (candidates.length > 0) archiveRetentionIdleUntil.set(archiveDirectory, now + ARCHIVE_RETENTION_IDLE_RECHECK_MS);
\t\treturn 0;
\t}
\tarchiveRetentionIdleUntil.delete(archiveDirectory);
\treturn await runExclusiveSqliteSessionWrite(params.scope, async () => {
\t\tlet removed = 0;`,
  },
  {
    name: "idle state",
    original: `const ARCHIVE_RETENTION_BATCH_SIZE = 256;`,
    patched: `const ARCHIVE_RETENTION_BATCH_SIZE = 256;
const ARCHIVE_RETENTION_IDLE_RECHECK_MS = 36e5;
const archiveRetentionIdleUntil = /* @__PURE__ */ new Map();`,
  },
];

function replaceExactlyOnce(source, { name, original, patched }) {
  const first = source.indexOf(original);
  if (first === -1) throw new Error(`archive retention anchor not found: ${name}`);
  if (source.indexOf(original, first + original.length) !== -1) {
    throw new Error(`archive retention anchor not unique: ${name}`);
  }
  return `${source.slice(0, first)}${patched}${source.slice(first + original.length)}`;
}

export function patchArchiveRetentionCutoff(source) {
  if (source.includes(PATCH_MARKER)) {
    if (EDITS.every((edit) => source.includes(edit.patched))) return { changed: false, source };
    throw new Error("archive retention cutoff patch is partial or drifted");
  }
  let next = source;
  for (const edit of EDITS) next = replaceExactlyOnce(next, edit);
  return { changed: true, source: next };
}

async function main([file, mode]) {
  if (!file) throw new Error("usage: patch-openclaw91-archive-retention-cutoff.mjs <chunk.js> [--check]");
  const source = await readFile(file, "utf8");
  const result = patchArchiveRetentionCutoff(source);
  if (mode !== "--check" && result.changed) await writeFile(file, result.source);
  console.log(JSON.stringify({ file, changed: result.changed, mode: mode ?? "--apply" }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
