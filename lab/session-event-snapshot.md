# Session snapshots in the agent event broadcast

Status: measured and A/B-tested in a VLab candidate (2026-11-08). Not merged, not on VLab or V.

## The short version

Rebuilding a session row for agent events is a large share of the Gateway main thread under load, well above
the 5% bar: in the candidate (V-scale registry, V's planner statistics, a tool-event client plus one more
session-event subscriber) it is 14% (c1), 19-21% (c5) and 27-30% (c15) of `/vds` main-thread CPU, and 31-59%
for the Worker; on V's own 11/01 profile (n=1) it is 5.8%, plus 5.4% for the transcript-broadcast row.

The change shares one row between the frames of one handled event. With the tool-event client and another
subscriber, `/vds` c15 main-thread CPU falls 13.8% (77.8 to 67.1 s over 3 pairs, every pair lower) and the
row time per turn halves; c5 falls 3.8%; the Worker c15 pair falls 13%. All turns in the measured pairs were
correct on both sides (`/vds` 122, Worker 42).

What it does not do: a Feishu run on V has no tool-event client, so each tool event builds the row once and
this change saves nothing there. The bigger remaining cost is one row per tool event, two per lifecycle and,
for `/vds` only, 13-14 transcript-broadcast rows per turn (the Worker has 2). 94-96% of consecutive rows of a
session are byte-identical, so a cross-event cache is where the rest of the time is; it is not in this change.

## Where the calls are

`buildSessionEventSnapshot` (server-chat) calls `loadGatewaySessionLifecycleSnapshot` -> `loadGatewaySessionSnapshot`:
the entry with its store children (`listSessionChildEntriesReadOnly`), the single-row subagent index (a SQLite
tree read plus a pass over every in-memory run), and the row projection.

| site | when | shared by the change |
|---|---|---|
| `tool.agent` | tool event; the run has tool-event clients (a `chat.send` client with `tool-events`) | yes |
| `tool.sessionTool` | tool event; session-event subscribers other than those clients | yes |
| `tool.node` | tool event; verbose not off | yes |
| `tool.hidden` | tool event of a hidden run; session-message subscribers | yes |
| `item.hidden` | item/assistant event of a hidden run; session-message subscribers | yes |
| `lifecycle.start` / `lifecycle.end` | `sessions.changed` with active run state and lifecycle projection | never |

The transcript-broadcast row (`server-session-events`, `loadGatewaySessionRow`, not lightweight) is a separate
path, measured but not changed.

## The change

`lab/patch-session-event-snapshot.mjs` (release file `lab/release-files/session-event-snapshot-coalesce/server-chat-Mh_L0_2e.js`):

- `handleEvent` opens a per-event map and restores the previous one when it returns or throws; calls outside a
  handled event (timers, persistence callbacks) find no map and load as before.
- A call with no event, no active run state and no lifecycle projection takes the row from the map, building it
  on first use; each frame gets its own top-level and `session` objects (`copySessionEventSnapshot`).
- Lifecycle calls always go to the original builder.
- `OPENCLAW_V_SESSION_EVENT_SNAPSHOT_COALESCE=0` restores one load per call, read per call.

Why nothing can change between the shared calls: they all run in one synchronous `handleEvent` pass, and what
runs between them only sends frames or updates in-memory run state. Time-derived fields (`runtimeMs` of a
running session) are computed at the first call instead of a few ms later; two uncached loads of the same
event differ in exactly that way today (see equivalence).

| file | before (V) | after |
|---|---|---|
| `server-chat-Mh_L0_2e.js` | `9c2f1bb1fd63684edfc89c1314fb668c5e4363b98e269507b9caf81ec052faed` | `011bef28c77f96b4e727394019032ff1a50b2f50bba2554e0597f58f630da854` |

Built from V's bytes (`/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist`, read-only):
`node lab/build-session-event-snapshot.mjs <dist>`. Source: `vegekyd-sys/openclaw-versa` branch
`claude/session-event-snapshot-coalesce` @ `3a565c98eacd1a6e56f2ae533114d7827e7bb118` (on `versa/main`
@ `aea2dae2`), `src/gateway/server-chat.ts` and two cases in `server-chat.agent-events.test.ts`; not merged,
the vitest cases were not run (no CI on a branch push). A capture PR would map the new bytes to `versa:3a565c9`.

## Method

All in one candidate (`lab/candidate/session-event-snapshot-ab.plan.json`, candidate-f664d2fd, VLab 4 cores,
14:27-15:07 CST), on the shared rig `lab/candidate/runtime-concurrency.mjs` (#535/#534 merged by the
`claude/vds-concurrency-deep` session):

- V-scale registry from V's read-only export (16,748 subagent runs, 18,867 tasks, free text removed),
  `SEED_CHILD_ENTRY_KB=0` (77 KB child entries put the Gateway at 5.7 GB anon and the candidate slice over
  MemoryHigh; the row reads exact keys and store children, and V has 0 rows with `spawned_by`/`parent_session_key`
  pointing at the big parent, so entry size does not enter these rows).
- `SEED_STAT1_FROM_V`: V's 74 `sqlite_stat1` rows for the agent database, and none for the state database (V has
  none). ANALYZE over the seeded rows sees 16.7k NULL `spawned_by`/`parent_session_key` and plans
  `listSessionChildEntriesReadOnly` as a whole-table walk in key order; V runs two index searches. In the rig's
  run2 profile that walk was 796 of 1,892 ms of the row loader.
- Two session-event subscribers: the rig's client (tool-event client, `SUBSCRIBE_SESSIONS=1`) and a second
  connection subscribed to session events only (`SUBSCRIBE_SECOND_CLIENT=1`), as V's voice H5 server or a
  Control UI tab is. `session.tool` excludes the tool-event client, so without the second connection a tool event
  has one call and nothing to share.
- The probe (`probeFile`, candidate only): wall time of every snapshot call by site, every row load, every
  `handleEvent`, every transcript-broadcast row; a hash of each row. Shares divide wall time inside the
  synchronous calls by the main thread's CPU for the level, so they are upper bounds on a shared 4-core host.
- Order: idle single-row bench, equivalence scenarios (shadow on), then A/B with shadow off: c1 `/vds`, c1 and c5
  Worker once, `/vds` c5 and c15 three pairs each (off-on, on-off, off-on), Worker c15 once; each side warmed once.
- Another session's load candidate overlapped until about 14:38 CST: the bench, the scenarios and part of the
  warm levels. The measured pairs (from 14:45) ran with no other candidate.

Results: `lab/session-event-snapshot-results-20261108.json`. Summary script:
`lab/candidate/session-event-snapshot-summary.mjs <OUT_DIR>`.

## Step 1: how much (off sides = V's code path)

| per turn, bash5 | `/vds` c1 | `/vds` c5 (3) | `/vds` c15 (3) | Worker c1 | Worker c5 | Worker c15 |
|---|---|---|---|---|---|---|
| snapshot calls | 22 | 18.8 | 20.9 | 29 | 29 | 27.9 |
| of which `tool.agent` / `tool.sessionTool` / lifecycle | 10 / 10 / 2 | 8.4 / 8.4 / 2 | 9.5 / 9.5 / 2 | 14 / 14 / 1 | 14 / 14 / 1 | 13.5 / 13.5 / 1 |
| single call p50 / p95, ms | 17 / 22 | 16-17 / 22-27 | 18-20 / 37-59 | 19 / 29 | 15 / 20 | 19 / 33 |
| row time per turn, ms | 373 | 316-336 | 443-526 | 566 | 461 | 566 |
| share of main-thread CPU | 14% | 19-21% | 27-30% | 31% | 46% | 59% |
| transcript-broadcast rows | 14 (9%) | 13 (13-15%) | 14 (17-18%) | 2 (2%) | 2 (3%) | 2 (3%) |
| consecutive rows identical | 95% | 94% | 95% | 96% | 96% | 96% |

(n = turns per level: 1, 5, 15; `/vds` c5 and c15 are ranges over 3 levels.)

On V's traffic shape (a Feishu run, voice H5 subscribed, no tool-event client) a `/vds` turn builds about 11.5
snapshot rows and 14 transcript rows; a Worker turn about 15 and 2.

Single-row bench (idle Gateway but during the overlap, 20 loads each):

| session | back to back | 700 ms apart |
|---|---|---|
| `lt-vds-small-00` (no children) | p50 23 ms, p95 38 ms (entry read 7.5 ms) | p50 83 ms, skewed by the next row |
| `agent:makaron:main` (16,482 child runs, above the 256-run scoped budget) | first 11.1 s, p50 457 ms, p95 8.7 s | p50 3.6 s, max 20.7 s |

`agent:makaron:main` falls back to the whole registry on every row (cached 500 ms). On V its own last activity
was 2026-10-04 (read-only), so V rarely pays it; its 3,169 child runs of the last 7 days have their own small rows.

V reference: 11/01 profile, c15 `multi` (with `session_status`), n=1: `buildSessionEventSnapshot` 2,733 ms and
`handleTranscriptUpdateBroadcast` 2,529 ms of 47,047 ms busy. The rig's run2 profiles (c10, ANALYZE plan):
`buildSessionEventSnapshot` 1,904 ms of 15.1 s busy for `/vds` and 2,526 ms of 12.5 s for the Worker.

## A/B (same Gateway, switch flipped between levels)

| | main-thread CPU, s | completion p50, s | row ms per turn | correct |
|---|---|---|---|---|
| `/vds` c15, 3 pairs (off -> on) | 24.6->22.7, 26.0->22.5, 27.2->21.9; sum 77.8 -> 67.1 (-13.8%) | 26.9->24.4, 31.7->24.5, 30.1->23.8 | 443->250, 516->258, 526->249 | 45/45, 45/45 |
| `/vds` c5, 3 pairs | 7.5->7.4, 8.0->7.8, 8.2->7.6; sum 23.7 -> 22.8 (-3.8%) | 12.2->13.4, 13.6->13.2, 14.4->14.2 | 316->208, 336->188, 318->189 | 15/15, 15/15 |
| Worker c15, 1 pair | 14.5 -> 12.6 (-13%) | 17.9 -> 17.4 | 566 -> 429 | 15/15, 15/15 |
| Worker c5 / c1, 1 pair each | 5.0 -> 3.2 / 1.8 -> 0.8 | 7.0 -> 5.6 / 4.9 -> 4.2 | 461 -> 249 / 566 -> 257 | all |

The CPU saved at c15 (3.5 s per level on average) matches the row time removed (2.9-4.2 s). The worst stall at
c15 went from 1.0-2.4 s to 0.55-0.87 s. The c15 completion gain (about 6 s) is larger than the main-thread
saving alone would suggest and has 3 pairs behind it; c5 shows none. This is VLab with 4 cores; it shows the
mechanism, not V's gain, and V's gain is 0 for runs without a tool-event client.

## Equivalence

- Shadow (the probe rebuilds every shared row, uncached, at the moment it is served): on the switch-on side 48
  shared rows (24 `tool.agent`, 24 `session.tool`) identical to the rebuild; switch off, 40 identical. Scenarios per
  side: a five-step `/vds` turn (tool start/result, lifecycle start/end), a rename (`sessions.patch label`) then
  a turn, a model switch to the Worker then a turn, and a `/vds` turn that ran `sessions_spawn` and
  `sessions_yield` (subagent created and ended under the parent).
- 6 rows of subagent child sessions differed from their rebuild in `runtimeMs` only, 3 with the switch off and
  3 with it on: the field is now minus start for a running session, so two uncached loads differ the same way.
- Lifecycle start/end never take the shared row (code, and the candidate unit test checks `hasActiveRun` and
  `activeRunIds`).
- Unit tests `lab/session-event-snapshot.test.mjs`: the 3 static cases pass locally; the 4 behaviour cases ran
  against the real runtime with the release file (candidate-b3720c67) and passed: one tool event, two frames,
  one load, equal but distinct `session` objects and the same frames with the switch off; the next event loads
  again and carries a changed label, model and children; the hidden mirror shares only within its event;
  lifecycle start keeps its active run state. (In that run the 3 static cases failed only because the release
  file was not a support input; the plan now lists it.)
- Not proven by frames: the off/on comparison of the second subscriber's frames in this run also picked up
  frames of other sessions (the subagent of the previous side finishing late), and two LLM runs never emit the
  same events. The filter by session key is fixed in the rig but was not rerun.

## Not covered

- V itself. VLab numbers are higher per call (4 cores, slower) than V's profile suggests (about 8 ms a row on V
  if the 11/01 profile had 22 rows per turn).
- A single-subscriber (Feishu-shaped) A/B: nothing is shared there by construction.
- `tool.node` (verbose on) and `tool.hidden`/`item.hidden` under load; the unit test covers the hidden mirror.
- 77 KB child entries (did not fit the candidate slice).
- The fork's vitest cases.

## Next

A cross-event row cache for calls without an event: 94-96% of consecutive rows are identical. It needs
invalidation on the agent database's validity token (data_version plus the session_nodes generation, which
already drives the session entry cache), subagent registry changes and config reloads, and a bound on
time-derived fields (`runtimeMs`). The transcript-broadcast row (13-14 per `/vds` turn against 2 for the
Worker) is the same cost on another path and is part of the main-thread gap between the two.
