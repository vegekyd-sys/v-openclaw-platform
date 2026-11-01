# Two whole-registry reads on the Gateway's main thread during Codex turns

Status: tested in candidates, not merged, not on VLab or V.

## The short version

In the five-step load test, main-thread CPU falls 30% (525 to 369 s over 6 pairs at c15). That test calls
`session_status` on every turn. Real Codex traffic almost never does: 23 of 12,819 tool calls in 5 days. With
`session_status` taken out of the same test the fall is 9% and within the noise, and the profile accounts for
1.8 s per c15 level. In real use, expect about 120-170 ms less main thread per Codex turn and little else.

The fix is safe and cheap to carry, and it makes the benchmark measure something closer to real traffic. It
does not remove the main-thread gap to the Worker in real use.

## Where the time went

On V (2026-11-01, `/vds`, c15, five steps, `docs/evidence/harness-compare-20261031/v-staged-20261101/gateway-profile-summary.txt`) the main
thread was busy 47 s:

- 25% `session_status`: `buildStatusReplyParts` calls `buildControlledSubagentRunsReadContext`, which reads and
  parses every `subagent_runs` row (13,572 rows, 217 MB) to answer about one session. The 500 ms cache does
  not help when 15 sessions ask over tens of seconds.
- 21% GC, part of it from that read.
- 5% `reconcileTaskRowsForParent`: the Codex task runtime's `listTaskRecords` clones and sorts every task
  (22,423) when a turn registers, then keeps those its session owns.

## The change

1. `buildControlledSubagentRunsReadContext` reads the session's tree through the existing indexes, using
   `loadSubagentRunTreeFromSqlite` as `buildSingleRowSubagentRunIndex` already does
   (`v-subagent-control-scoped-runs.mjs`). In-memory runs of the same closure replace their rows by run id. A key
   above `OPENCLAW_V_SCOPED_ROW_MAX_RUNS` (256), a closure above 4 times that, or an error takes the original
   path. On V 58 of the 59 owning keys hold at most 20 runs; the other holds 13,330 and stays on the original
   path. `OPENCLAW_V_SCOPED_CONTROL_SUBAGENT_RUNS=0` turns it off without a release.
2. The task runtime's `listTaskRecords` starts from `listTasksForOwnerKey`, an index that already exists in memory.
   The original filter stays, and it requires `ownerKey === requesterSessionKey`, so the result cannot be wider.
   `OPENCLAW_V_HARNESS_TASKS_BY_OWNER=0` turns it off. This needs no change in the Codex plugin.

Why the first gives the same answer: a visible run has the key as controller or requester, both of which the
tree reads. The latest-generation choice needs the child's other generations, read through the child index. The
pending count walks the requester edge from those children, which the tree follows, in SQLite and in memory.
Keys are compared without trimming; V has 0 of 13,572 rows with surrounding whitespace, and controller keys are
trimmed on write.

Other callers get the same read: `/status`, the subagents tool, and the Worker's `listControlledSubagentRuns`
when #525's precheck finds something unsettled.

## Equivalence

`lab/candidate/subagent-control-scoped-read-ab.mjs`, candidate-6debf2f4: V's registries with free text removed,
padded to V's sizes, real chunks, each switch off and on. Runs and pending counts compared as JSON, order included.

| Check | Result |
|---|---|
| 465 real keys (59 owners, 406 children), process holding no runs | 0 differ |
| same keys, process holding every run, as a Gateway does | 0 differ |
| 40 keys with another agent id, both shapes | 0 differ |
| 16 injected trees, both shapes | 0 differ |
| budget cases really read everything; a small tree does not | cold 1.5-3.2 s against under 50 ms |
| all 3,819 task owners, index against a filter of the whole list | 0 differ |
| 1,145 wrapper comparisons over 229 owners and 5 runtime shapes | 0 differ, 150 ms to 0.06 ms |
| tasks created, updated and finished through the runtime | same at each step |

The injected trees: settled, running child, running grandchild, ended without cleanup, requester only, controller
only, no controller column, later generation under another requester, same start time, cycle, non-canonical
row, above budget, closure above budget, in memory only, memory ahead of its row, memory moved to the key.

`listTasksForOwnerKey` could differ from the full list only in the order of two same-millisecond tasks after one is
re-upserted. No caller depends on that: they use `.some`, `.find` by run id, and a map by thread id.

## Load A/B

`lab/candidate/subagent-control-scoped-read-load.plan.json`, candidate-ed77a9a7, 14:43-16:00 CST, VLab (4 cores).
One Gateway, both switches flipped between levels, order alternating per round (off-on, on-off). `/vds`, c15,
small sessions, 13,516 runs and 22,400 tasks held across the run (V: 13,572, 217 MB; 22,421). Six pairs per
task, 90 turns per side. `bash5` is the same five steps with `date` in place of `session_status`.

| Medians over 6 levels unless noted | multi off | multi on | bash5 off | bash5 on |
|---|---|---|---|---|
| **main-thread CPU, sum of 6 levels** | **525 s** | **369 s (-30%)** | **401 s** | **367 s (-9%)** |
| main-thread CPU, first 3 pairs, sum | 144 s | 100 s (-31%) | 108 s | 97 s (-10%) |
| paired difference, off minus on | | 24.8 s (11.8 to 46.1) | | 4.7 s (-2.3 to 17.4) |
| `session_status` P50 | 10.6 s | 4.5 s | | |
| same, first 2 pairs | 4.3, 9.9 s | 2.4, 1.7 s | | |
| completion P50 | 78.1 s | 54.6 s | 67.9 s | 57.7 s |
| worst main-thread stall | 8.9 s | 2.6 s | 8.9 s | 5.7 s |
| correct answers | 90/90 | 90/90 | 90/90 | 90/90 |

Profiled pair after the numbers, 15 turns each side (1 ms sampling, so absolute times are high):

| main thread, ms | multi off | multi on | bash5 off | bash5 on |
|---|---|---|---|---|
| `buildControlledSubagentRunsReadContext` | 23,810 | not in top 90 | | |
| `buildStatusReplyParts` | 52,430 | 31,066 | | |
| GC | 15,279 | 3,105 | 2,983 | 2,854 |
| whole task list and clones | 1,604 | 0 | 1,791 | 0 |

So on multi, the read and its garbage are gone, and what is left in `session_status` is
`readUsageFromSessionLog`. On bash5 the only attributed saving is the 1.8 s of task list; read the rest of its 9%
as drift and noise, since odd rounds (on first, sessions shorter) show 11 s and even rounds 0.4 s.

Load and limits of this run:

- Others ran at the same time: load 1.75 to 8, 0 to 2 other candidates, Chrome on the host. The upgrade line on
  vlab91 was due to end about 14:40, just before the first level; I did not check that it had. One off level (round 4, multi) hit 187 MB available and a 51 s stall; it stays
  in the sum. The medians do not depend on it.
- Numbers from before VLab's 12:5x tab closure are not comparable, and none are used here.
- Main-thread CPU grew about 5 times from the first round to the last on both sides, in sessions of a few
  hundred events. The profile puts it in SQLite `next` under `readActiveTranscriptEntryAnchorInTransaction`
  (66-71 s) and `withCurrentProjectionSnapshot` (86-92 s), reached from `runMemoryFlushIfNeeded`,
  `readTranscriptMirrorFacts`, `readUsageFromSessionLog` and `prepareCodexAttemptContext`. On V the same anchor query
  takes 0.1 ms on a session of 25,324 active events, and V's profile shows `next` at 4.5 s of 47. The candidate's new
  agent database has no `sqlite_stat1`, while V's has 74 rows, which may be why, but that is not checked. So
  later rounds overstate transcript cost and the percentages above are not V's percentages.
- The first level per task was discarded. The test sessions own no subagent runs, so they read an empty tree.
  Real keys were timed in the equivalence run instead: P50 0.9 ms holding no runs, 16 ms holding all of them, because
  `loadControlledSubagentRuns` and the tree loader walk the in-memory registry.

## Real traffic on V

Read-only, `mode=ro`, `ionice -c3 nice -n19`, 100 s, agent `makaron`, 381,881 events in the 4,209 session windows
touched in the 5 days to 2026-11-01 13:42 CST. Counts from `toolResult` events.

| Harness / kind | Turns | Tool calls | `session_status` |
|---|---|---|---|
| Codex, chat | 904 | 12,819 | 23 (0.18%), 17 of them one session on 10/31 |
| Codex, cron | 46 | 1,768 | 1 |
| Codex, bench sessions | 124 | 457 | 82 |
| Worker, chat | 2,157 | 11,768 | 1 |
| Worker, cron | 555 | 4,824 | 1 |
| Worker, bench sessions | 182 | 614 | 108 |

Codex chat's most used tools: `bash` 8,641, `gateway_exec` 774, `gateway_process` 705, `browser` 683,
`progress_card` 559, `apply_patch` 402, `exec` 140, `web_search` 120, `message` 114, `node_exec` 110.

190 of the 216 `session_status` calls in `makaron` are the load tests. `subagents` was called 0 times. A search of the
newest 200 user messages in each of 207 chat windows found no `/status`; the command may not always reach the
transcript, so treat that as weak. Agents `v-codex`, `short-v` and `main` had no window in the period, and `dealclaw` had
2 and no `session_status`.

## On V, what to expect

- `session_status` on Codex: from 6.4 s towards the Worker's 2.4 s under c15. Rare in practice.
- Each Codex turn: about 120-170 ms less main thread.
- The five-step benchmark would drop, roughly as here. Do not read that as real-use gain. A benchmark with `bash5`'s shape
  is the better guide to the default-harness decision.

Next candidates, unmeasured: `buildSingleRowSubagentRunIndex` scans the in-memory registry on each session event
(self 1.0 s of 47 on V), and retention for `cleanup: keep` rows would shrink every path here.

## Not covered

- Production. No channels, no Feishu measure, 4 cores against V's 16.
- Shared VLab Gateway integration: not staged, as instructed.
- Real sessions with subagent trees under Codex load. The equivalence run covers their answers, not their load.
- A key at or just under the 256 budget under load. Its read parses up to 1,024 rows on the main thread before declining.

## Source map

`scripts/check-source-map.mjs` passes. No capture is added here, so nothing new is mapped yet. Before promotion the
fork needs:

- `src/agents/subagents/registry/subagent-control-scope.ts`: the scoped read in `buildControlledSubagentRunsReadContext`,
  behind `shouldReadPersistedSubagentRuns()`, because tests there read no persisted runs by default. The helper
  can live in the same file.
- `src/plugin-sdk/agent-harness-task-runtime.ts`: `listTaskRecords` from `listTasksForOwnerKey`.
- A port of the unit cases in `lab/subagent-control-scoped-read.test.mjs`.

## Files

`lab/subagent-control-scoped-read.plan.json` pins V's bytes (`feb68aa7...`, `50dc439b...` before; the helper is new). Build:
`lab/build-subagent-control-scoped-read.mjs <V core dist>`. Results, without session keys:
`lab/subagent-control-scoped-read-results-20261101.json`. Fixtures stayed outside the repository and were deleted after the run.
`lab/candidate/runtime-concurrency.mjs` gained `AB_ROUNDS`, `SEED_REGISTRY`, per-thread CPU, tool durations and the `bash5` task.
