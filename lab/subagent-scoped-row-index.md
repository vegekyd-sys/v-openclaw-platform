# Subagent scoped row index

Status: candidate only (2026-10-21). Not merged, not on shared VLab, not on V.

## The stalls

After #442 went to V (10/20 23:11 restart), the Gateway still stopped for ~30 s (23:23: 29 s), and RSS
went from 3.3 to 6.5 GB within 12 minutes of the restart. A sampling heap profile on V
(`/tmp/gw-spike-2026-10-20T152531668Z.heapprofile`, 23:25 – 01:25, saved when RSS reached 5.1 GiB)
counted 1,039 GB allocated in two hours:

| path | allocated |
| --- | --- |
| `loadGatewaySessionSnapshot` (one session row) | 785 GB |
| ← `buildSessionEventSnapshot` ← chat `handleEvent` (every session event) | 689 GB |
| ← `handleTranscriptUpdateBroadcast` → `loadGatewaySessionRow` | 73 GB |
| `getSubagentRunsSnapshot` → `loadSubagentRegistryFromSqlite` | 748 / 725 GB |
| SQLite row fetch of `subagent_runs` (`executeWithCachedStatement`) | 416 GB |
| `buildSingleRowSubagentRunIndex` (#437) / `buildSubagentRunReadIndexFromRuns` | 113 / 45 GB |
| whole-store `session_nodes` reads (after #442) | 51 GB |

## Cause

Every session event and transcript broadcast builds that session's row. Since #437 the row builds one
subagent read index (`buildSingleRowSubagentRunIndex`) over the whole registry snapshot
(`getSubagentRunsSnapshotForRead`). The snapshot is cached for only 500 ms
(`SUBAGENT_RUNS_READ_CACHE_TTL_MS`); once it is older, it is reloaded from SQLite: every row of
`subagent_runs` fetched (5,039 rows, 56 MB of `payload_json` on V) and JSON-parsed.

With Night Shift and group chats streaming, events arrive faster than every 500 ms, so the registry was
reloaded about twice a second, ~100 MB/s of rows and JSON, plus an index over ~5,000 runs per event.

Before #437 the same rows went through the global lookups instead, one snapshot per child run, so this
cost was there before, in another shape.

Two things rule out simply invalidating the cache when the data changes:

- **No cheap change signal.** `subagent_runs` has no `updated_at` column. Twelve worker processes hold
  the state database open and commit often, so `PRAGMA data_version` changes all the time. A reliable
  signal needs a persistent trigger in V's state schema, which the DB91 integrity gate inspects.
- **Every run is in memory.** The Gateway restores every persisted run into its in-memory registry at
  startup (`restoreSubagentRunsOnce`). A fresh cache would still merge and index ~5,000 runs per event.

## Change

A row only asks the index about:

- its own key;
- its runtime children (runs it controls);
- its store children (session entries whose `spawnedBy` / `parentSessionKey` is the key);
- the descendants of those, walked through requester → child links. Each child's latest run is taken
  over all of that child's runs.

These are `getDisplaySubagentRun`, `countActiveDescendantRuns` and `runsByControllerSessionKey.get(key)`;
every use in `session-utils-list` is keyed. The index answers for those keys depend only on these runs:

- runs whose child is in the closure;
- runs whose requester is in the closure;
- runs controlled by the key.

Plan `lab/subagent-scoped-row-index.plan.json`, patcher `lab/patch-subagent-scoped-row-index.mjs`,
builder `lab/build-subagent-scoped-row-index.mjs <V dist dir>`. The patch is on V's bytes under release
`memsearch-overlap-20261021`:

| file | before | after |
| --- | --- | --- |
| `subagent-registry.store.sqlite-hzGu4QSk.js` | `f37ed94d…` | `60a3e8c5…` |
| `session-utils-list-BUP03AzS.js` (#437's release file) | `2f30da37…` | `d274c9eb…` |

- **`loadSubagentRunTreeFromSqlite`** (store chunk, new export): one deferred read transaction on the
  state database.
  - It starts from the key and its store children, and adds the runs the key controls.
  - It then alternates indexed `requester_session_key IN (…)` and `child_session_key IN (…)` queries
    (400 keys per query). Every child found joins the closure, and so does every in-memory run whose
    requester is in it.
  - Rows are parsed by the same `rowToSubagentRunRecord` and returned in the whole registry's order
    (`created_at`, `run_id`), together with the closure's keys.
- **`buildSingleRowSubagentRunIndex(now, { key, store })`**: those persisted runs, plus the in-memory
  runs in the closure (or replacing a selected run), merged in the same order with in-memory winning.
  The result goes into the same `buildSubagentRunReadIndexFromRuns`. It is used by
  `loadGatewaySessionSnapshot` (session events, lifecycle snapshots, transcript broadcasts),
  `buildGatewaySessionInfo` (chat.history) and `buildGatewaySessionRow` without an index
  (`sessions.describe`).
- **Fallbacks**: without a scope, on any error, or with `OPENCLAW_V_SCOPED_ROW_SUBAGENT_RUNS=0`, the
  original whole-registry index is built.
- **Freshness**: the persisted runs are read at call time, so a row is never staler than with the 500 ms
  cache.
- **What it costs**: a Night Shift child row reads its own few runs. `agent:makaron:main` still walks
  its ~4,300 children (about the whole table), but only for main's own events.

## Results

Copy of V's tables (exported read-only 2026-10-21 01:37): 5,039 subagent runs, 5,624 session entries.
`candidate/subagent-scoped-row-ab.mjs` loads V's `session-utils-list` and the release one side by side over
the release store chunk.

**Equivalence.** For each key, three entry points are compared as JSON:

- `loadGatewaySessionLifecycleSnapshot` (session events);
- `loadGatewaySessionRow` (transcript broadcasts);
- `buildGatewaySessionInfo` (chat.history).

The 289 keys: `agent:makaron:main`, every requester and controller (52), 200 child sessions, 30
store-child parents and other sessions. Two passes: in-memory registry empty, then every run restored into
memory as on V. Then 40 rounds of random in-memory runs, half of them over the restored registry:

- running, queued, regenerated (higher generation), ended recently or 10 days ago;
- grandchildren chained under a child;
- controlled by another session;
- the same run id as a persisted run in another state.

V's chunk has its 500 ms cache cleared before each call.

| run | threshold | comparisons | differences |
| --- | --- | --- | --- |
| `ff08b81a` | default (256: main keeps the old path) | 1,734 + 1,254 | 0 |
| `8ba39b42` | none (every key scoped, main included) | 1,734 + 1,254 | 0 |

No registry key has surrounding whitespace (the SQL lookups compare raw keys).

**Cost of one session-event snapshot** (`ff08b81a`, every run in memory as on V; VLab load ~7 on 4 cores):

| session | V chunk, cache stale | V chunk, cache warm | release |
| --- | --- | --- | --- |
| Night Shift child | 978 ms, 224 MB | 21 ms, 49 MB | 18 ms, 1.9 MB |
| group chat | 916 ms, 226 MB | 29 ms, 48 MB | 14 ms, 1.6 MB |
| `agent:makaron:main` | 956 ms, 231 MB | 40 ms, 53 MB | same path as V (40 ms warm, ~1 s stale) |

On V events come faster than 500 ms apart, so most event snapshots paid the stale-cache column plus GC.
Scoping main's closure was measured too (an earlier build): 2.1 s and 460 MB, worse than the stale reload,
hence the threshold.

## Archiving ended runs

Proposal only; nothing has been run on V. Deleting rows needs Tianyi to run it or to approve it explicitly.

**Why runs stay forever.** The registry's own sweep deletes an ended run once its cleanup is done,
except when `cleanup` is `"keep"` and `spawnMode` is not `"session"`: those are skipped forever. Night
Shift subagents are of that kind. V has 5,039 runs, almost all ended.

**Why the archive must run offline.**

- The Gateway restores every persisted run into memory at startup.
- A full registry save (`saveSubagentRegistryToSqlite`, used after restore reconciliation and by sweeps)
  upserts every in-memory run.
- So rows deleted under a running Gateway come back, and its memory does not shrink until a restart.

**`scripts/archive-subagent-runs.mjs`.** By default it only previews. It selects a run when all hold:

- execution terminal with `endedAt` older than `--older-than-days` (14);
- `cleanupCompletedAt` set, not paused for `sessions_yield`;
- delivery not `pending` / `in_progress`; not session mode;
- its child session is gone or idle past the same threshold;
- no unended run whose requester is that child, so descendants stay reachable.

With `--apply` it:

1. writes every selected row (all columns) to a gzip JSONL file plus a `.sha256` of the content;
2. reads the file back and compares;
3. deletes each row only if `run_id` and `payload_json` are still identical, 200 per transaction.

It refuses to apply while another process has the state database open (`lsof`) unless
`--allow-open-db` is given. Restoring is `INSERT` of the JSONL rows back into `subagent_runs`.

On the V export (2026-10-21 01:37):

| threshold | runs selected | payload | left |
| --- | --- | --- | --- |
| 14 days | 181 | 1.4 MB | 4,858 |
| 7 days | 2,064 | 29.1 MB | 2,975 |
| 3 days | 4,039 | 58.6 MB | 1,000 |

The run counts are close to the session retirement counts, since both follow Night Shift's batches.

On a copy, `--older-than-days 7 --apply`: 2,064 rows exported (3.6 MB gzip) and deleted in 5 s. 2,975
rows left, `integrity_check` ok; a second run selects nothing.

Suggested use: during a planned Gateway stop (with workers stopped), preview, then apply, then start.

What removing a run changes:

- An archived child no longer shows a subagent run in its parent's child list (Control UI). With the
  child-session condition it is old and idle there anyway.
- `sessions.list` and the session row read fewer runs.

## Files

- `release-files/subagent-scoped-row-index/*`: the first commit is V's bytes, the next commit the change.
  `subagent-scoped-row-index.test.mjs` pins the hashes and the exact replaced lines. Deploying needs a
  Gateway restart.
- `candidate/subagent-scoped-row-ab.mjs` + plan. It reads a read-only export of V's `subagent_runs`,
  `session_nodes` and `session_participants` from `FIXTURE_DIR` (`/var/tmp/gwreg` on the VLab host, root
  disk). The export carries real content and was deleted after the runs.
- `../scripts/archive-subagent-runs.mjs`.
