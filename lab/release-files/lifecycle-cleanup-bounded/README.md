# lifecycle-cleanup-bounded — no main-thread stall and 8 GB heap after every Gateway start

## Symptom (production V)

Every Gateway start since at least 11/10 is followed by two main-thread
stalls of 35–50 s. The first starts 52–59 s after `http server listening`.
The second starts 346–357 s after the first. During each, the heap reaches
7.6–8.4 GB (12 GB limit). The third 5-minute cycle no longer stalls.

| Process (CST) | stall 1 | stall 2 | heap |
|---|---|---|---|
| 11/12 22:17 | +59 s, 50.7 s | +416 s, 35.4 s | 8.31 / 8.16 GB |
| 11/13 12:41 | +56 s, 45.6 s | +404 s, 37.0 s | 7.66 / 8.05 GB |
| 11/13 20:49 | +52 s, 42.9 s | +398 s, 38.8 s | 7.85 / 7.86 GB |

On 11/11 21:36 the same spike pushed three consecutive processes past 12 GB
(OOM, 25 minutes down). The 11/13 20:56 stall of about 40 s, right after a
/vds reply in the test group, is the second stall of the 20:49 process. That
/vds turn had finished its tail in 254 ms (`[codex-turn-tail.1]`).

The only log line is `slow SQLite session write criticalSectionMs=35–50 s`,
with no `sqlite/transaction` line beside it. That write is the planner below,
which runs inside `runExclusiveSqliteSessionWrite`. Every other session write
in the process queues behind it.

## Cause

memory-core's Dreaming cleanup (`startDreamingSessionCleanup`) runs at
`gateway_start`, after the cron service is up (`cron: started` is logged
6–9 s before each first stall). It runs once more after
`DREAMING_ORPHAN_MIN_AGE_MS` (5 min), and then never again. It runs whether
or not Dreaming is enabled; on V it is disabled.

`scrubDreamingNarrativeArtifacts` calls `cleanupSessionLifecycleArtifacts`,
whose planner in 9.1 (`planSessionLifecycleArtifactCleanup`) does all of this
synchronously on the Gateway main thread:

1. `SELECT entry_json, …` for every session node. The JSON is not used.
2. `readSessionEntryStore(database)`, which parses every entry in full,
   skills snapshot and prompt report included.
3. `readReferencedSessionIds`, a second metadata pass over every row.
4. For every historical window, the whole transcript is loaded into
   JavaScript strings and searched for the run marker.

V's makaron store has 20,920 session nodes holding 1.85 GB of entry JSON
(about 55 KB of `skillsSnapshot` plus 32 KB of `systemPromptReport` per row;
18,638 rows are subagent sessions). It also has 4,692 historical windows with
120,148 events (608 MB). The prefix `dreaming-narrative-` matches none of the
entries.

Ruled out on V: `usage.cost` (PR #604, not called at these starts), the health
snapshot (summary already in a worker, no fallback logged), Codex
`sessions.catalog` (never called), task-registry maintenance (already exact
reads), the canonical-key scan (once per process, already trimmed), memory
sync (`intervalMinutes` 0), the cron session reaper (2 cron-run sessions), and
/vds bounded history (111 ms).

## Change (marker `lifecycle-cleanup-bounded-v1`)

Source: openclaw-versa `versa/port-lifecycle-cleanup-bounded-20261113` @
`ca32fca3e29`. One commit on `39242f5b4fc`, which is V's source for both chunks
(it contains `3951d3e691b`). It adds the unit test
`session-accessor.sqlite-lifecycle-cleanup-bounded.test.ts`: 3 tests, all of
which fail on the old code.

The planner follows upstream's shape (#167549, #186103; upstream also moved it
into a database worker, which 9.1 lacks):

- **Candidates only.** Read keys and current ids only (both precede
  `entry_json` in the row). Read `updated_at` and the entry only for keys with
  the prefix.
- **Markers and ages in SQLite.** The query is
  `instr(event_json, marker) > 0` for windows whose transcript's
  `max(created_at)` is old enough. No transcript text reaches JavaScript.
- **Reference scan only when needed.** It runs only if an entry or a marked
  orphan is to be reclaimed. Removed entries used to be subtracted from a
  full projected store. That store is now empty: the remaining rows'
  metadata projection already carries the same session ids
  (`collectSessionStateIdsForEntry` reads `sessionId`, `previousSessionId`,
  `usageFamilySessionIds` and `compactionCheckpoints`; the projection only
  drops `skillsSnapshot` and `systemPromptReport`).
- **Marker scan before the writer lane.** `cleanupSessionLifecycleArtifactsCore`
  calls the new `readMarkedOrphanLifecycleSessionIds`. It reads on read-only
  snapshots, 16 windows per event-loop turn, before
  `runExclusiveSqliteSessionWrite`. Inside the lane the planner re-checks age
  and marker only for the ids found. Markers are append-only, so a marker
  written after the scan waits for the next cleanup. Deletion still
  revalidates snapshots as before.

Every filter of the old per-window loop still applies: agent, not referenced,
not excluded, plugin owner, age, marker. Results come out in the same order.

Files: `session-accessor.sqlite-lifecycle-state-CrB_K2kA.js` (planner,
prescan) and `session-accessor.sqlite-lifecycle-dtL0ZEAl.js` (prescan call).
Plan: `lab/lifecycle-cleanup-bounded.plan.json`. Needs one Gateway restart.

## Evidence

Fixture (`lab/candidate/v-scale-session-fixture.mjs`) is built from VLab data
only. It holds 20,900 session nodes / 1.6 GB of entry JSON (VLab's real
subagent rows cloned, skills lists grown to V's size) and 4,708 historical
windows / 570 MB of transcripts.

**Gateway start, V bytes** (`lab/candidate/startup-heap-spike.mjs`; private
Gateway, V routing, no channels, CPU profile from boot, `voicewake.get` ping
every second): the same two stalls as on V. One began 14.5 s after
listening and lasted 70.9 s; the other began at +384.7 s and lasted 60 s.
RSS peaked at 6.4 GB, `heap=6.1 GiB critical`, and liveness was overdue by
56 s and 62 s. Both profiles have the same stack:
`startDreamingSessionCleanup → scrubDreamingNarrativeArtifacts →
cleanupSessionLifecycleArtifactsCore → runExclusiveSqliteSessionWrite →
planSessionLifecycleArtifactCleanup → readSessionEntryStore` (35.5 s of the
first) plus `readReferencedSessionIds` (12.2 s), with 10–12 s of GC.

**Gateway start, release files** (same harness and fixture): one stall, 4.5 s
at +17.8 s. It is the per-process canonical-key scan, which in the V-bytes
run was taken by cron's session broadcast (3.9 s). There is no second stall;
RSS peaks at 853 MB (6.4 GB before) and the longest ping is 4.5 s (30 s
before).

**Planner A/B** (`lab/candidate/lifecycle-cleanup-bounded-ab.mjs`, both chunks
in one process, candidate-9088a9cd):

| clean store (V's case) | per pass | allocated |
|---|---|---|
| V's planner | 75.0 s / 117.3 s | 9.7 GB |
| release, plan | 0.2 s (6.8 s when measured right after V's pass: its garbage) | 31 MB |
| release, prescan | 1.4–2.3 s in total, longest block 25–28 ms | — |

With seeded leftovers (entries old/recent/foreign-owned/with a previous
generation; orphans marked/unmarked, old/recent, referenced, foreign-owned,
own-plugin), V's plan, the release plan, and the release plan without the
prescan are deep-equal: the same entries with expected entries, and the same
delete plans with snapshots. V's pass took 109 s; the release took 18.5 s,
most of it the reference scan that runs only when something is reclaimed,
plus a 5.6 s prescan with its longest block at 61 ms.

## Not covered

- Real V data: no copy was made. The fixture reproduces V's sizes and the
  stall shape.
- When a cleanup does find something to reclaim, it still runs one metadata
  reference scan over every row on the main thread. That is about 5 s on the
  fixture, and on V it happens only after a Dreaming run was interrupted.
