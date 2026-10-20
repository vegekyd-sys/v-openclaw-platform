# Gateway full-read hot paths

Status: candidate only (2026-10-20). Not merged, not on shared VLab, not on V. No production data was
changed; the V exports below are read-only copies.

## The stalls

V's Gateway (PID 3202008 until the 10/20 02:37 restart) stopped answering for 39 s on 2026-10-19
21:09:21–21:10:00 and 43 s at 02:21; `~/.cache/v-watch/rss.jsonl` has ~80 RSS jumps of +2.5–5 GB since
10/06, and OpenClaw logs `[diagnostics/memory] level=critical` ~20 times a day, mostly at :00 and :30.
The 21:10 stall dropped the Feishu websocket for ~5.5 min and failed 6 Night Shift runs with
"Worker stream acknowledgement timed out".

## What the Gateway spends its time on

Two profiles from V, taken with the inspector on 2026-10-19 21:29 – 10/20 00:29 CST
(`/tmp/spike-prof.mjs`): a 3 h CPU profile (1 ms sampling) and a 32 min sampling heap profile that counts
objects later collected by GC (RSS 2.0 → 5.0 GiB at 22:01).

CPU, 3 h: main thread busy 1,540 s, of which GC 264 s.

| path | busy | trigger |
| --- | --- | --- |
| `sessions.list` (`listVisibleSessions`) | 220 s | workboard lifecycle reconcile's full sweep, Control UI |
| `runTaskRegistryMaintenance` | 86 s | every 60 s |
| `sessions.resolve` → `loadGatewaySessionLookupStoreUncached` | 83 s | RPC; 14 s per minute at 22:04–22:05 |
| `sweepCronRunSessions` | 76 s | every 5 min per agent |
| workboard `reconcile` → `readCards` | 35 s | lifecycle timer |
| workboard `syncWorkboardLifecycleEvent` | 24 s | every subagent / agent end |
| `resolveCronSession` | 22 s | every cron run (bursts at :00 and :30) |
| `assertSessionIdentitiesOwned` | 9 s | plugin `runEmbeddedAgent` |

Heap, 32 min: 72.5 GB allocated. 20.0 GB of it is `loadSessionEntrySnapshot`, the whole-store read of
`session_nodes`: `sweepCronRunSessions` 8.2 GB, combined store for `sessions.list` 5.2 GB,
`resolveCronSession` 4.0 GB, `assertSessionIdentitiesOwned` 2.7 GB. Then `runTaskRegistryMaintenance`
7.2 GB (`listTaskRecords` 4.5 GB of it), workboard `listLifecycleLinks` 5.3 GB (3.6 GB from
`listLifecycleCandidates`, 1.7 GB from the reconcile timer).

Per minute, the 22:00 minute (just before the 22:01 RSS jump) was 33.7 s busy: GC 6.6 s,
`resolveCronSession` 4.8 s, workboard `readCards` 4.8 s, `sweepCronRunSessions` 2.8 s. 00:00 again had
`resolveCronSession` at 4.7 s. 22:04 and 22:05 were 38–42 s busy, 14 s each in `sessions.resolve`
lookups and 12 s GC.

### Why a whole-store read is so expensive on V

`session_nodes` on V: 5,157 rows, 335 MB of `entry_json`; 3,877 rows (250 MB) are
`agent:makaron:subagent:workboard-nightshift-*`, the oldest last updated 10/01–10/02. An entry is ~63 KB,
mostly `skillsSnapshot` and `systemPromptReport`. Callers that ask for the default (`full`) projection
never hit the entry cache (`readSessionEntryCache` returns early for `full`), so each such call parses
the whole 335 MB and projects participants (4,940 rows, each schema-checked). Measured on a copy of V's
tables (below): 3.7 s and 1.28 GB allocated per call; the `list` projection is 0.2 s and 96 MB once the
cache is invalid (any write invalidates it).

There are no cron run sessions on V (`%:cron:%:run:%` = 0 rows): `sweepCronRunSessions` parsed 335 MB
every 5 minutes to find nothing.

## Change

Plan `lab/gateway-fullread-hotpaths.plan.json`, patcher `lab/patch-gateway-fullread-hotpaths.mjs`,
builder `lab/build-gateway-fullread-hotpaths.mjs` (from V's bytes, `db91-release-v2026.9.1-db91.6`; the
shared VLab runtime `subagent-index-20261020` has the same bytes for all five files). Five core dist
files; `OPENCLAW_V_FULLREAD_HOTPATHS=0` restores the original read at every patched site.

| file | change |
| --- | --- |
| `session-D4AJhdUK.js` | `resolveCronSession` reads only its run key and, for a bound `current` job, the source key, with `loadExactSessionEntry` (same writable handle, full projection, errors still throw). Callers only get/set those keys. |
| `service-CzmmKrEg.js` | `sweepCronRunSessions` lists keys only (`listSessionEntryKeysReadOnly`), keeps `isCronRunSessionKey`, and reads just those rows (`loadExactSessionEntriesReadOnly`, full projection, one snapshot, key order). Everything after the loop is unchanged. |
| `task-registry.maintenance-C4nMaDY9.js` | the 60 s sweep iterates the live task records in `listTaskRecords` order without cloning them (with the default runtime only); each task is still re-read with `getTaskById` before any decision. |
| `sqlite-store-CH-caj1l.js`, `runtime-api-1CCazqtv.js` | `listLifecycleCandidates` (every subagent/agent end) uses a narrow projection: SQLite extracts `automation.boardId`, rows with an integer non-zero `archived_at` are skipped; any other boardId shape or invalid JSON keeps the full automation JSON for the original parse. |

Edge differences, both on corrupt data only: a cron session row whose JSON does not parse makes
`resolveCronSession` throw (the whole-store read skipped it, so the run started a new session); in the
reaper the same row fails that sweep (logged, retried next sweep) instead of being skipped.

## Results

Copy of V's tables (exported read-only at 2026-10-20 12:07 CST; `candidate/gateway-fullread-ab.mjs`):
a makaron agent database created by OpenClaw and filled with all of V's `session_nodes`,
`session_windows`, `session_participants`, `session_transcript_index_state`, `session_progress_cards`,
every `session_transcript_fts` row, and the transcripts of the 150 oldest Night Shift subagent sessions
(783 MB); V's `workboard.sqlite`; V's `task_runs` (22,341 tasks). Both chunks are loaded side by side from
the candidate dist (V's bytes and the release file under another name).

Per call, V's chunk vs the release chunk (`allocated` counts objects later collected by GC):

| path | V chunk | release | equivalence |
| --- | --- | --- | --- |
| `resolveCronSession` (one run) | 3,739 ms, 1,271 MB | 0.8 ms, 0.3 MB | 101 cases (40 cron keys × forceNew on/off, 20 bound-source misses, 1 miss): results and store entries identical (random ids normalized) |
| `sweepCronRunSessions` (V: 0 run keys) | 3,837 ms, 1,273 MB | 18.9 ms, 5.8 MB | 60 run sessions added (30 expired), each arm on its own copy: both prune 30, same 30 remain |
| `runTaskRegistryMaintenance`, steady 60 s sweep | 542 ms, 159 MB, longest event-loop block 336 ms | 211 ms, 55 MB, 28 ms | separate processes, clock frozen at the export time: ledger hash after first and steady sweeps identical (1 task pruned in both) |
| `listLifecycleCandidates` (every subagent/agent end) | 265 ms, 61 MB | 77 ms, 13 MB | 301 probes over 26,718 sources (every card's session key / run id, mixed, unknown): candidate ids identical, 280 with matches |

Candidates: `a29699ab` (cron, sweep, list; V's `session.maintenance`), `46dde4e1` (workboard),
`4f4c3756` / `c7993cf7` (tasks), on
VLab runtime `subagent-index-20261020` (byte-identical to V for these files).

For scale: one `listSessionEntriesCore` full-projection read of this copy is 3.7–4.3 s and 1.29 GB; the
list projection with an invalid cache is 0.19 s and 98 MB. Numbers in
`gateway-fullread-hotpaths-results-20261020.json`.

## Retiring old Night Shift sessions

`candidate/nightshift-session-retire.mjs` on the same copy, with V's `session.maintenance`
(`mode: warn`, `pruneAfter: 14d`, `maxEntries: 6000`, `maxDiskBytes: 48gb`). A probe process takes a tiny
`BEGIN IMMEDIATE` transaction every 50 ms on the same database: its waits are what the Gateway and
workers would see.

**The official cleanup is not usable on V.**

| | time | removed | longest wait of another writer |
| --- | --- | --- | --- |
| `openclaw sessions cleanup --agent makaron --dry-run --json` | 20.7 s | (would prune 101: entries older than 14 d) | 19 ms |
| `... --enforce --json` (run locally, no Gateway reachable) | 101.9 s | 101 | **49.8 s** (3 waits over 5 s) |

- With a reachable Gateway, `--enforce` is delegated to the `sessions.cleanup` RPC and runs on the
  Gateway's main thread.
- `pruneAfter: 14d` covers 38 Night Shift sessions; the bulk is 3–14 days old.
- V's own dry-run timed out after 300 s. The copy is 0.78 GB; V's database is 21 GB, and the dry-run
  includes the disk-budget inspection over it (`inspectSqliteSessionHistoryDiskBudget`).
- Shared VLab runs `session.maintenance.mode: enforce` (V runs `warn`); a lifecycle write in a candidate
  that keeps VLab's config triggers the same 14-day prune (50.7 s write hold seen in one A/B run).

**Why removal is slow: costs inside the write transaction.**

- Every removal reads every row's session ids (`readReferencedSessionIds`).
- For each session, the transcript index delete runs `DELETE FROM session_transcript_fts WHERE
  session_id = ?`. `session_id` is an UNINDEXED FTS5 column, so that is a full FTS scan (157,180 rows,
  105 MB of text on V) per session.

**Batched retirement through the same lifecycle API.** Night Shift subagent sessions not updated for
N days, status not running, each removal conditional on the entry being unchanged; transcripts archived
and published as usual.

| run | sessions | batch / pause | wall | write hold per batch (median / max) | other writer: max wait, p99, waits > 1 s |
| --- | --- | --- | --- | --- | --- |
| 7 days (`c287a034`) | 1,543 | 20 / 200 ms | 5.5 min | 3.7 s / 4.3 s (6.3 s / 7.2 s with transcripts) | 4.1 s, 3.2 s, 77 |
| 3 days (`6002c0e6`) | 3,273 | 2 / 500 ms | 58 min | 1.5 s / 2.6 s (3.1 s / 4.3 s with transcripts) | 1.7 s, 1.0 s, 596 of 36,176 |
| script, 3 days (`d157231f`) | 40 | 2 / 1 s | 1 min | 1.9 s / 3.1 s | 1.9 s, 1.1 s, 20 of 703 |

A batch costs ~1.3 s of fixed work plus ~0.12 s per session; nothing came close to the 5 s process lease.
150 sessions had transcripts in the copy (60 MB of archive blobs, all published).

| whole-store read after retiring | rows | entry JSON | full projection | list projection |
| --- | --- | --- | --- | --- |
| before | 5,164 | 336 MB | 3.4–3.7 s | 178–194 ms |
| older than 7 days retired | 3,621 | 234 MB | 2.46 s | 150 ms |
| older than 3 days retired | 1,891 | 124 MB | 1.34 s | 114 ms |

**Proposed procedure (needs Tianyi's approval; nothing has been run on V):**
`scripts/retire-nightshift-sessions.mjs`. By default it only previews: plan, counts and sample keys. It
selects Night Shift subagent sessions of `makaron` that meet all of these:

- older than `--older-than-days` (3);
- status not running;
- no workboard card links them, or every linking card is `done` or archived (blocked / review / ready /
  todo cards keep their session).

On the copy: 3,204 candidates; 108 kept for open cards and 565 for being recent. With `--apply` it removes
`--batch` (2) keys per lifecycle mutation. Before each batch it measures its own `BEGIN IMMEDIATE` wait
and backs off when that wait exceeds `--max-lock-wait-ms` (1.5 s). It stops outside `--window`.

Suggested order on V:

1. Preview.
2. `--apply --max 10` as a canary, then check `slow SQLite transaction hold` lines in
   `/tmp/openclaw/openclaw-*.log` and Gateway liveness.
3. 7 days in 03:00–05:30 (Night Shift's quietest hours, ~50 new sessions an hour).
4. 3 days the next night.

Expect about 1 h for ~3,200 sessions. Not measured: the Night Shift transcripts on V average ~1.6 MB a
session (sample of 30), so V's archive work per batch is larger than the copy's mix. Also unknown:
whether opening V's 21 GB database from a second process triggers the DB91 integrity gate, so watch the
first open.

## Not covered

- `sessions.list` (220 s / 3 h, mostly the workboard reconcile's full sweep), `sessions.resolve` by key
  (83 s; the visibility filter takes the whole store), `assertSessionIdentitiesOwned` (2.7 GB / 32 min;
  needs a sessionId index lookup in the plugin runtime API) and the workboard reconcile's own
  `listLifecycleLinks`/`readCards` still read everything. Retiring old Night Shift sessions shrinks the
  session-store ones by ~75 %.
- The subagent run registry keeps every terminal Night Shift run (4,569 runs, 51 MB; see
  `session-info-subagent-index.md`); retiring their sessions does not prune those rows.
- Candidate runs are single-process replays; the Gateway's own timers, concurrency and GC pressure on
  V are not reproduced. The allocation and per-call times are what each path costs on V's data.

## Files

- `release-files/gateway-fullread-hotpaths/*`: the first commit is V's bytes, the next commit the change;
  `patch-gateway-fullread-hotpaths.mjs`, `build-gateway-fullread-hotpaths.mjs <V dist dir>`,
  `gateway-fullread-hotpaths.plan.json`, `gateway-fullread-hotpaths.test.mjs` (pins before/after hashes and
  the exact removed lines). Deploying needs a Gateway restart (`v-self-restart`).
- `candidate/gateway-fullread-ab.mjs` + plans (`gateway-fullread-ab`, `gateway-fullread-tasks-{base,patched}`),
  `candidate/nightshift-session-retire.mjs` + plan, `../scripts/retire-nightshift-sessions.mjs`.
- The plans read the V export from `FIXTURE_DIR` (`/var/tmp/gwstall` on the VLab host, root disk; the
  candidate data disk had 9 GB free). The export carries real session content and was deleted after the
  runs; to re-run, export again read-only from V (`sqlite3` with `ATTACH 'file:…?mode=ro'`: the session
  tables, `session_transcript_fts` as `fts_rows`, `sample_keys`/`sample_ids` and their transcript rows,
  `task_runs`/`task_delivery_state`, and a `.backup` of `workboard.sqlite`).
