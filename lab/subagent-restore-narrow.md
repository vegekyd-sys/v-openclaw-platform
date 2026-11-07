# A fresh Worker's first turn: 18-19 s restoring the subagent registry

Status: candidate-tested, not on V. Branch `claude/firsttext-four-paths-20261107`; fork source
`vegekyd-sys/openclaw-versa` `versa/port-subagent-restore-narrow-20261107`.

## What V shows

Feishu 首字 (create_time to first push), 2026-11-04..06, 1,912 messages, turns queued behind the same
session's previous turn left out:

| Worker (deepseek-flash), n=1038 | P50 | P90 |
|---|---|---|
| Worker command enter to first model request | 1.09 s | 3.42 s |
| same, first turn of a Worker process (n=~80 of 1084 messages) | 18.6 s | 22.3 s |
| same, every later turn | 1.01 s | 2.04 s |

On 2026-11-07 all six Workers V forked had the same shape: prompt-prep `total` 1.6-3.1 s after command
enter, first model call 20.7-21.4 s after it, so 18.4-19.3 s between the two; their second turns took
0.1-0.4 s for the same span. The first-turn gap grew with Night Shift: P50 6 s on 10/06, 11 s on 10/20,
17.6 s on 10/28, 21.7 s on 11/06.

## Cause

The first registry access in a process runs `restoreSubagentRunsOnce`, and its
`reconcileOrphanedRestoredRuns` asks `resolveSubagentRunOrphanReason` about every row. That loads the
child's whole session entry (`loadSessionEntryReadOnly`: a Kysely query, the full `entry_json`, its
parse and participant projection) once per row.

V, read-only, 2026-11-07: `subagent_runs` 16,663 rows; 15,495 distinct `agent:makaron:subagent:*`
children, every one present in `session_nodes`, average entry 80 KB (skillsSnapshot 68 KB,
systemPromptReport 39 KB), 1.24 GB in all. Reading and parsing them in Python takes 6.6 s; selecting
`current_session_id` for the same keys takes 0.07 s. Every Worker pays this on its first turn, and the
Gateway pays it once at start.

The earlier candidate (`lab/candidate/worker-first-turn-ack.mjs`, 11/05) seeded V-sized registries
and V-sized session rows, but its subagent rows pointed at random child keys with no row, so restore
pruned them as orphans without reading anything and VLab never showed V's gap.

## The change

`listLiveSessionKeysReadOnly` (session accessor) reads `session_key, current_session_id` of the rows
with `entry_valid = 1` for a key list, 400 per query, no entry JSON. Restore asks it once per agent
store for all children. A child in that set has an entry whose `sessionId` is that id
(`bindSessionNode` writes both from the same entry), so it is not orphaned unless the run is stale and
unended, which only the full entry can clear (`abortedLastRun`). Those, and every child not in the set
(missing, tombstoned, not validated, blank id), and everything after a failed bulk read, keep the
original exact read.

Why the pruning decisions cannot change: the fast path only ever answers "not an orphan", and for a
valid row with a session id the exact read answers the same (its parse or canonical-key errors are
caught as "not an orphan" too).

`OPENCLAW_V_SUBAGENT_RESTORE_NARROW=0` (Gateway process) turns the fast path off.

Files: `session-accessor.sqlite-entry-BlklNPKQ.js` (new function and export at the end) and
`subagent-completion-admission.store-JmpNDYTF.js` (helper, fast path, restore call), built from V's
bytes by `lab/patch-subagent-restore-narrow.mjs`. Worker turns pick it up through `vlab.workers.roll`;
the Gateway's own start uses it after the next restart.

## Tests

- Fork: `src/agents/subagents/registry/subagent-restore-live-children.test.ts` on a real SQLite store
  (live, missing, stale-unended, aborted, padded keys, failed bulk read); the restore test fails without
  the change. `subagent-registry-helpers.test.ts` unchanged and passing (36/36 on Node 22.23.1).
- Platform: `lab/subagent-restore-narrow.test.mjs`: release files equal a fresh build from V's
  captured bytes; nothing else changes; the patched check gives the original answer for every child state
  and reads entries only for the rows it must.
- Candidate: `lab/candidate/subagent-restore-narrow.mjs` (see results below).

## Measurements

V, read-only (`/opt/node-v22.23.1`, `ionice -c3`, 2026-11-07 23:20 CST), the 15,496 distinct children:

| | time |
|---|---|
| per child: `select * from session_nodes where session_key = ?`, `JSON.parse(entry_json)`, participants query | 6,894 ms |
| bulk: `session_key, current_session_id` where `entry_valid = 1`, 400 keys per query | 62 ms |

That is the floor of the old path; OpenClaw adds a Kysely build, the canonical-key assertion, lookup-key
collection and entry projection per row, which is how V gets to ~15 s inside the 18-19 s gap.

The real code at V's size (`lab/bench/subagent-restore-live-children.bench.test.ts`, run in the fork
checkout: a temp SQLite store with 15,495 validated Night Shift children of ~80 KB, then
`resolveSubagentRunOrphanReason` over every run as restore calls it, Node 22.23.1, Mac):

| restore orphan check, 15,495 runs | time | kept |
|---|---|---|
| before (exact read per child) | 20,677 ms | 15,495 |
| after (column prefetch, then the check) | 668 ms | 15,495 |

## Candidate results

Candidate A/B (`lab/candidate/subagent-restore-narrow-{base,narrow}.plan.json`): pending. The first
attempt (both arms with the V-sized registry seeded before the Gateway started) gave one data point
for the Gateway's own start: base bytes did not answer `hello` within 15 min (182 GB of logical reads),
patched bytes had forked its Workers about 3.5 min after start (its hello line was not reached because
the Workers' prewarm then looped on the clone rows); both runs shared a busy 4-core VLab and the clone
rows still had shared identity fields, so this is a hint, not a number. Running both arms in parallel then exhausted
VLab's 15 GB and VLab stopped answering (2026-11-07 23:05 CST); the arms must run one at a time.
