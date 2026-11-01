# The Worker's 2.3 s before each model call: the subagent registry

Status: on V since 2026-11-01 10:00 CST (`v2026.9.1-db91.6-subagent-precheck-20261101`, PR #525).
Activated by `vlab.workers.roll`, without a Gateway restart. See "Production result" below.

## Where the time goes

Serial tests on V put the Worker about 2.5 s behind `/vds` from message received to run start. For the
default Worker path (22 Feishu turns on the evening of 10/31):

| Segment | P50 |
|---|---|
| received to dispatcher | 6 ms |
| dispatcher to Worker harness | 409 ms |
| harness, preflight, IPC to the Worker | about 3 ms |
| Worker: command start to system prompt ready | about 300 ms (P90 about 1 s, MCP catalog) |
| **system prompt ready to model call** | **2349 ms** |

`runStart` on this path is the first event after the model call starts, so it lands about 40 ms after
`model-call-enter`. It is not the same moment on Codex, so the 2.5 s compares two different marks; the
first-text gap on V (5.9 against 3.4 s) is the number that shows the cost is real.

The 2.3 s does not depend on the session: 48 runs on 10/31 gave P50 2264 ms with input from 1 to 1206
items and 2 to 109 tools. `/proc` during four of those gaps showed the Worker's main thread running, with
678-803 MB of logical reads, none from disk, and pwrites to SQLite temporary files.

`buildActiveSubagentSystemPromptAddition` causes it. Every embedded attempt asks whether the session has an
active subagent, through `listControlledSubagentRuns`, which runs
`select * from subagent_runs order by created_at, run_id` with no usable index. V has 13,550 rows and
217 MB of payload; run directly on V it takes 1085 ms and 678 MB of logical reads (782 ms and 238 MB
without the ORDER BY), then every payload is parsed. `cleanup: keep` rows are never pruned, so it grows
with Night Shift. On 10/31, 13,549 of the 13,550 rows had finished. Codex does not build this addition.

## The change

A check through the existing requester and controller indexes runs first
(`v-subagent-active-precheck.mjs`). It walks the session's runs and their descendants along the requester
edge, in SQLite and in the process's memory. If each one has `execution.status = terminal`, a numeric
`endedAt` and a numeric `cleanupCompletedAt`, nothing can be listed as active and the addition returns
early. Anything else takes the original path, as does an error or more than 5000 rows.
`OPENCLAW_V_SUBAGENT_ACTIVE_PRECHECK=0` turns the check off without a release.

Why this cannot hide an active run: the original lists a run as active when it is live and unended, or
when a descendant found along the requester edge is unended or ended without cleanup. Its visibility rule
is controller or requester equal to the session. Both sets are inside what the check walks. Keys on V have
no surrounding whitespace (0 of 13,550), so comparing them untrimmed matches.

## What was tested

- `lab/subagent-active-precheck.test.mjs`: plan and bytes, tree walk, memory, cycle, row budget.
- Equivalence, `lab/candidate/subagent-active-precheck-ab.mjs` (candidate-01656dbd): V's topology with free
  text removed, the real function with the check on and off. 59 of 59 real keys gave the same text, and so
  did 7 injected cases (settled tree, running child, running grandchild, ended without cleanup, requester
  only, controller only, in memory only). The 6 cases that should list a run did.
- On V, read-only: 55 Feishu sessions of the last two days. No fallback; P50 0.03 ms, max 1.7 ms.
- End to end, Worker with `deepseek-flash`, one turn at a time, 12 levels, the first 2 warming the Workers and
  the registry refilled to V's size before each of the other 10 (`lab/candidate/subagent-active-precheck-e2e.diff`
  on `runtime-concurrency.mjs` from `claude/harness-concurrency-20261031`). 12/12 correct on both sides.

| | Before (candidate-a448b771) | After (candidate-fedd4427) |
|---|---|---|
| system prompt to model call, median | 7075 ms | 205 ms |
| first text, P50 of 10 hot turns | 16.6 s | 9.2 s |
| whole-registry reads | 28 | 2 (each Worker's one restore) |

## Limits

- This is not the Feishu measure (`create_time` to first answer push): candidates have no channels, and
  shared VLab has only 111 rows, so it would not show the cost. On V today the same measure is P50 27.6 s
  for Worker flash and 17.7 s for `/vds` (10/30-10/31, 473 and 123 turns), which are different sessions and
  tasks. Expect about 2.3 s off on V, not VLab's 7 s; VLab has 4 busy cores and V 16. The first post-release
  check is `scripts/firsttext-e2e-report.mjs` and the same serial test as 10/31.
- Absolute candidate times are high because refilling the registry stalled the private Gateway 4-6 s on both
  sides, and the runs were one after the other, not interleaved. Use the difference.
- A session with an unsettled run in its tree still pays the full read. That is the point of the fallback, and
  on V it is rare (1 of 13,550 rows).
- A Worker's first turn still reads the registry once (`restoreSubagentRunsOnce`) and loads the task registry.
  Other full readers (`buildSubagentList`, session lists) are unchanged.
- The table still grows. Retention for `cleanup: keep` rows is a separate decision.

## Files

`lab/subagent-active-precheck.plan.json` pins V's bytes (`dbe28902...` before). The helper is a new file in
`openclaw/dist`. Results: `lab/subagent-active-precheck-results-20261101.json`.

## Production result (2026-11-01)

Same bench before and after: 5 groups holding only Tianyi and V, deepseek-flash on the Worker, one
message per group per round, first text = Feishu `create_time` to first answer push. Before ran 09:33
to 09:44 (6 rounds), after ran 10:00 to 10:14 (8 rounds), straight after the worker roll. The Gateway did
not restart in between (up since 10/30).

| | before | after |
|---|---|---|
| first text P50, all rounds | 7.2 s (n=30) | 4.6 s (n=40) |
| first text P50, rounds 3 to 6 | 6.6 s | 4.9 s |
| first text P50, last 4 rounds | 6.6 s | 4.4 s |
| first text P95, all rounds | 10.6 s | 18.7 s |
| prompt ready to model call, P50 | 2496 ms | 176 ms |
| model call to first text, P50 (control) | 2188 ms | 1846 ms |

Over the 26 hours around the roll, by whether the turn was the first in its Worker process:

| prompt ready to model call | before | after |
|---|---|---|
| later turns, P50 / P99 | 2326 / 4182 ms (n=386) | 170 / 2965 ms (n=41) |
| first turn in a process, P50 / max | 18171 / 21388 ms (n=28) | 15852 / 16374 ms (n=6) |

The worse P95 comes from two things this release did not add. The roll made five new Workers, and each
first turn in a process waits 16 to 18 s; that was already so before the release and happens on every
natural recycle too. One round (10:08) lost 3 to 5 s inbound while the Gateway's liveness heartbeat was late.

Not measured: real user traffic. No other user sent a Worker message in the after window, so the bench
is the whole comparison so far. Liveness delays: 189 in the 25.7 hours before, 4 in the 16 minutes after;
that sample is too small to read a rate from.

Acceptance on V, in the release acceptance group: a 100 s turn kept by the old generation through the
roll and finished, the next turn replied, the old generation drained, 0 Worker errors. With a child
running, the model quoted the real run id from the Active Subagents section.
