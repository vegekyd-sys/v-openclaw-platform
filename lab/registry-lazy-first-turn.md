# A fresh Worker's first turn: two whole-registry restores before the model

Status: candidate A/B done (VLab), not on V. Fork source `vegekyd-sys/openclaw-versa`
`versa/port-registry-lazy-first-turn-20261108` @4ee0e038099. Follows #567 (subagent-restore-narrow).

## What V shows

After #567 (on V since 2026-11-08 10:08), a new Worker's first turn still spends 5.4-5.7 s from command
enter to the first model request (later turns ~1 s). /proc on V for one such turn (10:15, read-only
sampler): 5.85 s, 7.8 s CPU, 1.48 GB logical reads from the page cache.

VLab CPU profile of that turn (`lab/candidate/worker-first-turn-profile.mjs`, V-sized registries, #567 bytes):

| | time |
|---|---|
| `leasePendingAgentSteeringItems` -> `restoreSubagentRunsOnce` | 5.9 s (reading every `subagent_runs` payload 5.1 s; the orphan check after #567 0.38 s) |
| `buildActiveTaskPromptContextForSession` -> `listFreshTasksForOwnerKey` -> `restoreTaskRegistryOnce` | 3.0 s (`task_runs` rows 2.1 s, records 0.37 s, integrity check 0.33 s) |
| GC | 1.1 s |

V, read-only (`state/openclaw.sqlite`, 2026-11-08): `subagent_runs` 16,770 rows / 203 MB (`task` text
143 MB, `completion` 40 MB; 1 run not ended, 3,199 created in the last 7 days), read alone 1.0 s;
`task_runs` 18,960 rows / 50 MB, 0.4 s. Every new Worker reads both, then parses them.

## The change

1. **Steering lease.** Prompt assembly leases pending agent-steering items for the requester and restored
   the whole subagent registry first. An item needs a run whose delivery payload is addressed to this
   requester and is pending (or leased with a lease that may be stale). The payload's
   `requesterSessionKey` is always the run's `requesterSessionKey` (`loadPendingFinalDeliveryPayload`; the
   field is never reassigned), which is the indexed `requester_session_key` column written in the same
   statement (V: 5 rows carry a delivery payload, 0 disagree with the column). So the lease first checks
   in-memory runs and the requester's rows (`idx_subagent_runs_requester_session_key`, json fields of
   those rows only); with no candidate it returns without restoring. A query error or more than 5,000
   rows takes the original path.
2. **Owner task lookup.** `listFreshTasksForOwnerKey` restored the task registry, then read the owner's
   tasks from the store (`idx_task_runs_owner_key`) and returned them; the in-memory registry is only its
   fallback when that read fails. The restore now happens only on the fallback. The restore is read-only,
   so the store read sees the same rows.

What still restores: everything that mutates in-memory runs (`markRequesterTurnYielded`, spawning,
the lease when a candidate exists) and every task query that reads the in-memory registry
(`ensureTaskRegistryReady` in each). Cross-process subagent readers (`subagents` list, active counts,
session lists) never depended on the restore: `getSubagentRunsSnapshot` merges in-memory runs with the
persisted rows itself ("for cross-process readers", 500 ms cache).

`OPENCLAW_V_REGISTRY_LAZY_FIRST_TURN=0` restores the old behavior for both. Files:
`subagent-registry-C24yr_PF.js` (V's captured bytes 1d9f45d6 -> 52b3b571) and `task-registry-B4-CJZk7.js`
(npm's bytes 6051d0be -> 7d1871cc), by `lab/patch-registry-lazy-first-turn.mjs`. Worker turns pick them
up through `vlab.workers.roll`.

## Tests

- Platform: `lab/registry-lazy-first-turn.test.mjs` (7): release files = V's bytes + only this patch; the
  inserted precheck runs in vm against a real SQLite table for every case (none, pending, leased, other
  requester, in-memory only, query error, 5,001 rows, switch); the task lookup reads the store without a
  restore and still restores on the fallback.
- Fork: `subagent-registry-public-api.steering-precheck.test.ts`, a store test for the requester query,
  a task-registry-query test (fails without the change); `task-registry.store.test.ts` asserted the old
  restore-before-read and now asserts no restore. 143 related test files, 3,310 tests pass; tsgo clean
  on the changed files.

## Candidate A/B

VLab, 2026-11-08 15:42-15:58 CST, `lab/candidate/registry-lazy-first-turn-{base,lazy}.plan.json`: private
Gateway on VLab's runtime (= V's bytes with #567), private agent database with 15,486 Night Shift children,
16,663 `subagent_runs` and 23,187 `task_runs`; each round rolls the Worker pool, sends one turn to the
fresh Worker and one more after it; send -> first request at the loopback model, no memory.high events:

| | base (V bytes) | registry-lazy |
|---|---|---|
| fresh Worker's first turn | 20.1, 13.7, 13.7 s | **5.7, 1.7, 1.6 s** |
| next turn | 4.6, 1.1, 1.3 s | 8.6, 0.9, 1.1 s |

Round 1 follows the seeding with a cold page cache in both arms. A profiled rerun of the patched arm
(`...-lazy-profile.plan.json`): first turns 4.2 and 1.8 s, next turns 1.3 and 1.1 s, and no registry
restore anywhere in the measured windows (round 1's first turn is the Gateway's own module loading). All
turns replied visibly.

On V the same two reads cost ~1.4 s plus parsing and GC of ~250 MB, which is most of the ~4.4 s a new
Worker's first turn still pays over a warm one; it also stops every Worker from holding the whole
registry in memory.
