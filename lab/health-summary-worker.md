# Health summary worker

Status: candidate only (2026-10-21). Not merged, not on shared VLab, not on V.

## The stalls

After the #447 restart V's Gateway stopped twice:

| time | stop | slow read-only hold logged by #397 |
| --- | --- | --- |
| 02:07 | 51 s | 19,449 ms, then ~30 s without any log output |
| 03:03 | 29.6 s | 9,197 ms (03:02:56) |

Same stack both times: `session-accessor.entry-B8arwR7t.js:138` < `withOpenClawAgentDatabaseReadOnly` <
`readSessionStoreSummaryReadOnly` < collector `Object.read` < `buildHealthAgentSummaries`.

## Who runs it, how often, why it is sometimes slow

- **Who calls it.** `collectGatewayHealthSnapshot` (via `refreshGatewayHealthSnapshot`) builds the health
  snapshot. Its per-agent summary reads each physical session store once with
  `readSessionStoreSummaryReadOnly` (count plus the 5 most recent sessions, overall and per agent), on
  the main thread.
- **How often.** The Gateway refreshes the snapshot itself every 60 s (`HEALTH_REFRESH_INTERVAL_MS`,
  server-maintenance). A `health` RPC served from the cache also starts a background refresh.
- **Why every call reads the whole table.** The query walks `session_nodes` by
  `idx_agent_session_nodes_updated_at` and reads `entry_valid` from the table row for every key. In the
  record `entry_valid` comes after `entry_json` (~63 KB average on V, stored in overflow pages), and SQLite
  must follow a row's overflow chain to reach any later column. So each call touches every overflow page
  of the table (300+ MB on V).
- **Why only sometimes.** With the page cache warm that is ~0.1 s; the ~100 ms health calls seen most
  of the time are this. When the Gateway's own memory pushes the 21 GB database's pages out, it becomes a
  cold read of the whole table: 9–19 s on the main thread.

## Why not a cheaper query

`entry_valid = 0` has a covering partial index, but `-1` does not. `-1` is written with `entry_json = '{}'`
by the session-clear paths, and also on large rows whose JSON failed validation (the pending-entry
validation pass). Telling 1 from -1 for a large row requires reading that row past its entry JSON, so no
index-only variant gives the same counts.

## Change

Plan `lab/health-summary-worker.plan.json`, patcher `lab/patch-health-summary-worker.mjs`, builder
`lab/build-health-summary-worker.mjs <V dist dir>`. The patch is on V's bytes under release
`memsearch-overlap-20261021`:

| file | before | after |
| --- | --- | --- |
| `collector-DyqVHdcZ.js` | `8056582c…` | `376387c5…` |
| `v-health-session-summary-worker.mjs` (new) | — | `b5cf6c19…` |

- **The worker.** A persistent worker thread, created on first use and unref'd, runs the same
  `readSessionStoreSummaryReadOnly` with the same `isTransientSqliteError` classification.
- **What the collector sends.** Before building the synchronous reader it sends one request per
  physical store. These are the scopes and options the reader would pass: first agent per
  `resolveSqliteTargetFromSessionStorePath` path, in `ordered` order, `recentLimit` 5. The reader then
  returns those results. Transient SQLite errors give the same empty summary; other errors are rethrown
  with the same message.
- **Fallbacks.** On worker start failure, a crash or a 120 s timeout, the reader falls back to the
  original main-thread read. `OPENCLAW_V_HEALTH_SUMMARY_WORKER=0` turns the worker off.

## Results

Copy of V's `session_nodes` and `session_participants` (exported read-only 2026-10-21 03:34, 5,729
sessions, 380 MB). `candidate/health-summary-worker-ab.mjs` (candidate `52929948`) loads V's collector and
the release one side by side.

**Equivalence.** `buildHealthAgentSummaries` for `makaron` plus an agent without a database, as JSON with
`age` (milliseconds since update, computed at projection) removed. Four states:

- V's rows as exported;
- after making rows pending (`entry_valid` 0), cleared (`'{}'`, -1), invalid large (-1) and newer in
  the recent window;
- the worker module missing (main-thread fallback);
- the worker back.

8 comparisons, 0 differences.

**Main thread**, one summary, 3 runs each. Cold: the database file's pages are evicted with `posix_fadvise
DONTNEED`. The stall is the largest gap between 5 ms timer ticks.

| | V chunk: wall / main-thread stall | release: wall / main-thread stall |
| --- | --- | --- |
| cold | 1.47–1.76 s / 1.47–1.77 s | 1.45–1.61 s / 8–16 ms |
| warm | 54–73 ms / 54–74 ms | 56–83 ms / 8 ms |

The copy is 0.38 GB on VLab's disk; on V the same cold read is 9–19 s. It now runs in the worker, so the
health refresh still takes that long but the Gateway keeps serving.

## Not covered

- The worker thread holds its own module graph and a read-only connection; its resident memory on V was
  not measured. First use of V's 21 GB database in the worker may run its own read-only open checks, off
  the main thread.
- `status` (`readStatusSessionStores`) uses the same summary on the main thread. It is called on demand,
  not every minute, and is unchanged.
- The cold read itself remains, so retiring old sessions still makes it smaller.

## Files

- `release-files/health-summary-worker/*`: the first commit is V's collector bytes, the next commit the
  change. `health-summary-worker.test.mjs` pins the hashes and the replaced lines. Deploying needs a
  Gateway restart.
- `candidate/health-summary-worker-ab.mjs` + plan. It reads `FIXTURE_DIR/v-sn.sqlite`, a read-only export
  of V's session tables on the VLab host's root disk. The export carries real content and was deleted
  after the run.
