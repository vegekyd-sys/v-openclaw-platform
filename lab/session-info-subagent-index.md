# Session info subagent index

Status: candidate only (2026-10-20). Not merged, not on shared VLab, not on V.

## The stall

On 2026-10-19 02:20:32–02:21:20 CST the V Gateway main thread was held ~43 s
(`liveness overdue=43394ms`, heap 2 → 4.24 GiB, RSS 7.55 GiB). PR #432 ruled out
`sessions.branches.list` and concluded the Control UI open was unrelated; that conclusion is
wrong. The block is `chat.history` for `agent:makaron:main`.

- The client is the OpenClaw iOS app (its node 8885c3… connects at every one of these opens).
  Every such open since 2026-10-14 was slow: 10/14 21 s, 10/15 9.5 s + 11.4 s, 10/16 49.5 s +
  94 s (two `chat.history` calls, two blocks), 10/16 94.6 s (overdue 78 s), 10/17 27 s and 23.7 s,
  10/19 49.7 s (overdue 43 s). The same app's opens on 10/05–10/12 were not.
- Liveness is sampled every 30 s, so blocks under 30 s are often not reported as overdue.
- 02:20–02:30 sar: iowait 0.12 %, 42 kB/s disk read, reclaim scanning: CPU-bound JS and
  allocation, not I/O; swap peak of that process 0 B. No slow SQLite transaction was logged.
- The cron `companion-01-hourly-heartbeat-lite` was a victim: its 93 ms `test -s` result was
  persisted at 02:21:22, after the Gateway acknowledged the worker stream again.

## Cause

`buildGatewaySessionInfo` (chat.history, the embedded backend, sessions.resolve) and
`loadGatewaySessionSnapshot` (session rows and lifecycle snapshots) built one row without the
subagent read index that `sessions.list` prepares for its rows. The row builder then resolved the
session's runtime children run by run through the global registry functions:
`getSessionDisplaySubagentRunByChildSessionKey(child)` and `countActiveDescendantRuns(child)`,
each of which takes the whole registry snapshot (`SUBAGENT_RUNS_READ_CACHE_TTL_MS = 500`, so it is
reloaded from SQLite and JSON-parsed once 500 ms old) and rebuilds the read index over every run.

On V the registry has 4,569 runs (51 MB of payload JSON); 4,345 were requested by
`agent:makaron:main`, 4,323 of them Night Shift workboard subagents
(`agent:makaron:subagent:workboard-nightsh…`, all terminal, ~150–900 a day since 10/08: about
1.6k by 10/12, 2.1k by 10/14, 4.3k by 10/19; the cost grows with that count times the registry
size, which is why the same app's opens turned slow from 10/14). One
`chat.history` of main is therefore ~4,345 × (index over 4,569 runs) plus a full registry reload
every 500 ms. VLab has 108 runs (54 under main), which is why private-Gateway replays of the open
answered in 113–546 ms with VLab data and with V's main session spliced in.

Profile evidence (V, inspector sampling, `lab/v-control-ui-open-profiler.mjs`, 2026-10-20
00:00:44): a midnight burst of `chat.history` calls for ordinary sessions held the main thread
8.9 s; the stack was `handleChatHistoryRequest → buildGatewaySessionInfo → buildGatewaySessionRow →
countActiveDescendantRuns → getSubagentRunsSnapshot → loadSubagentRegistryFromSqlite →
readSubagentRegistryRows`, 19 full reloads of ~0.7 s each, 2.3 s GC. Every `chat.history` on V costs
one such reload when the cache is older than 500 ms (the ~600 ms seen on V for small sessions);
for main the per-child lookups repeat it every 500 ms for the whole row build.

## Change

`session-utils-list-BUP03AzS.js` only (V bytes `353e0f21…`, pristine 2026.9.1):

- `buildSingleRowSubagentRunIndex(now)`: `buildSubagentRunReadIndexFromRuns` over the same full
  snapshot (`getSubagentRunsSnapshotForRead`) and in-memory runs the global lookups read.
- `buildGatewaySessionInfo` and `loadGatewaySessionSnapshot` build it once and pass it to both the
  store-child scan (`buildSingleRowStoreChildSessionsByKey`) and the row.
- `buildGatewaySessionRow` uses `rowContext.subagentRuns`, else the passed index, else builds one;
  so `sessions.describe` and the Control UI session preview get it too. sessions.list rows with a
  row context are unchanged.

Upstream (openclaw main) builds single rows from a scoped session-list read index as well
(`buildSubagentSessionListReadIndex(now, sessionKeys)`); that needs the scoped loader, not in 9.1.

## Results

Numbers: `session-info-subagent-index-results-20261020.json`.

**A/B in private Gateways** (candidate `0480bf24`): the same private data for both arms, the shared
makaron database (7.35 GB) with V's `agent:makaron:main`, V's 4,569 `subagent_runs` and the 4,027
child session entries they point at; the Control UI's open of main sent all at once, inspector
profile at 1 ms.

| | V chunk | release chunk |
| --- | --- | --- |
| chat.history(main), 2nd open | 88.7 s, main thread busy 90.1 s, liveness overdue 78.7 s | 0.87 s, longest busy 2.3 s |
| registry reloads in that open | 1,557 stretches, 40.0 s | 21, 0.56 s |
| chat.history(main), 1st open | 265 s (incl. a 140 s cron-binding row build of main) | 1.1 s |
| sessions.describe × 41 sessions | 97.0 s | 2.5 s |
| Gateway ready | 325 s | 74 s |
| 41 rows + the chat.history sessionInfo | — | identical, 0 field differences |

The V chunk's stack is the one in V's profile: `handleChatHistoryRequest → buildGatewaySessionInfo
→ buildGatewaySessionRow → resolveRuntimeChildSessionKeys → countActiveDescendantRuns →
getSubagentRunsSnapshotForRead → loadPersistedSubagentRunsForRead`. The 140 s in the first open is
`broadcastCronBoundSessionChanges → loadGatewaySessionRow → loadGatewaySessionSnapshot`: VLab has
cron jobs with `sessionTarget: "main"`, so a cron list change rebuilds main's row through the same
lookups. V's makaron jobs are isolated/current, so V does not hit this path today; the change
covers it anyway.

**Row equivalence in one process** (`candidate/session-info-subagent-equivalence.mjs`, candidates
`1cb80e01`, `1ee31364`, `7cd7f04e`, three seeds): both chunks loaded side by side over one registry
module; 600 persisted V runs (510 under main) and 300 rounds per seed of random in-memory runs
(running, queued, recently and long ended, newer generations, grandchild chains, other
controllers). 16,810 comparisons of `buildGatewaySessionRow` without a row context and
`buildGatewaySessionInfo`: 0 differences; 1,454 rows had an active subagent run and 1,502 kept
child links. Same calls: 638 s with the V chunk, 80 s with the release chunk.

Earlier private-Gateway replays with VLab's own registry (108 runs) or V's main session alone
(candidates `dd1f1f2f`, `4f398a32`, `9c5c05c2`) answered in 113–546 ms, which is why PR #432
concluded the open was unrelated.

## Files

- `release-files/session-info-subagent-index/session-utils-list-BUP03AzS.js`: first commit is V's
  bytes, the next commit the change; plan `session-info-subagent-index.plan.json`.
- `session-info-subagent-index.test.mjs`: pins before/after hashes and the exact changed lines.
- `candidate/session-info-subagent-ab.mjs` (+ `.plan.json`): two private Gateways (V chunk, release
  chunk) on the same data: whole shared makaron database with V's `agent:makaron:main` and the runs'
  child session entries spliced in, shared state database with V's `subagent_runs` rows.
- `candidate/session-info-subagent-equivalence.mjs` (+ `.plan.json`): the one-process row comparison.
- Fixtures (`v-main.json.gz`, `v-subagent-runs.json.gz`, `v-subagent-children.json.gz`) are exported
  read-only from V and carry real content, so the plans name them as `<v-fixtures>/…`: replace with a
  local directory outside the repository. Splices keep V's `entry_valid` (the insert trigger resets
  it, and one unvalidated row makes every store read rescan the whole store).
- `v-control-ui-open-profiler.mjs`: the night-time inspector sampler that produced the V profile.

## Remaining

- With the fix a single row still costs one full registry reload when the 500 ms cache is cold
  (~0.7 s on V). Scoping the load to the row's subtree, or pruning terminal workboard runs from the
  registry, removes that; separate change.
