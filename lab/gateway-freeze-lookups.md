# Two Gateway lookups that froze V read only the matching session rows

Status: candidate only (2026-10-27). Not merged, not on shared VLab, not on V.

Two main-thread lookups read the agent's whole session store (full projection, never cached) to find one
entry. Each froze V on 2026-10-27; both now read only the matching rows.

| | path | V CPU profile |
| --- | --- | --- |
| 1 | server-chat `handleEvent` → `resolveSessionKeyForRun` (`server-session-key-ZtX3Ble7.js`) | 16:48, 18 of 25 s, GC 7.3 s |
| 2 | host-thaw / `restartChannels` → restart blockers → `findTaskSessionEntry` (`task-registry.maintenance-C4nMaDY9.js`) | 18:36, 15 of 23.5 s, GC 7.2 s |

makaron on V at 17:26 that day: 10,724 rows, 708 MB of entry JSON.

## Freeze 1: server-chat run lookup

2026-10-27 16:37–16:41 CST the V Gateway froze ~171 s, from 16:41 again for more than 6 minutes; Feishu
ingress stopped until Codex restarted V at 16:45–16:48 (287 s). The journal from 16:32 shows liveness
coming 1.5–11 s late every ~30 s (`eventLoopDelayP99Ms=28118.6 eventLoopUtilization=1` at 16:37:37), then
worker turns failing with `Worker stream acknowledgement timed out` once the main thread stopped answering
their IPC.

CPU profile taken during the freeze (`/tmp/gw-prof/freeze-1648.cpuprofile` on V, 20 s): 18 s under

```
processTicksAndRejections
  > server-runtime-subscriptions dispatchEventHandler (.then)     server-runtime-subscriptions-DBC0HRs-.js:1176
  > handleEvent                                                   server-chat-Mh_L0_2e.js:752
  > resolveEventSession                                           server-chat-Mh_L0_2e.js:242
  > resolveSessionKeyForRun                                       server-session-key-ZtX3Ble7.js:51
  > loadCombinedSessionStoreForGatewayCore → listSqliteSessionEntriesFromDatabase / parseSessionEntryJson
```

and 7.3 s of GC. Every sample is the async dispatch, so the profile cannot name the emitter.

## Why

`resolveEventSession` (server-chat) takes an event's session from the chat link, the event's own
`sessionKey`, the run context, and only then `resolveSessionKeyForRun(evt.runId, { agentId })`. That function
loads the agent's whole combined store with the `full` projection (never cached) and keeps the entries whose
`sessionId === runId`. Run ids are almost never session ids, so it almost always misses, and a miss is
remembered for `RUN_LOOKUP_MISS_TTL_MS = 1e3`: one second. makaron on V is ~9–10k rows / ~600 MB of entry
JSON; one read is seconds of main thread and >2 GB of short-lived objects (#462 measured 5.0–6.3 s on V,
7.4 s on VLab for the same read).

An event reaches the lookup when it has no chat link, no `sessionKey` and its run has no context with a
`sessionKey` at the moment the handler runs. On V that happens in three ways (read from V's dist):

1. **Runs registered without a session key.** `prepareEmbeddedSessionState` (agent-command) registers a
   context with only `agentId` when `suppressVisibleSessionEffects` is set and there is no `sessionKey`
   (`sessionEffects: "internal"` runs). Every event of such a run goes to the lookup, for the whole run.
2. **Events with no run context and no session key**, e.g. a run whose Gateway context is gone (finished,
   failed, swept) while something still emits for its id without a key.
3. **Channel reply runs whose context is cleared before the handler runs.** agent-runner registers every
   reply run with `isControlUiVisible: isInternalMessageChannel(provider)`, i.e. `false` for everything but `webchat`: Feishu,
   DingTalk, Telegram. `enrichAgentEvent` then drops `sessionKey` from the run's non-lifecycle events
   (`sessionKey = isControlUiVisible || stream === "lifecycle" ? … : undefined`; `deliverySessionKey` is
   only kept for claim-owned events), so the handler depends on the run context. server-runtime-subscriptions
   hands events to the handler on a later microtask; events emitted in the same tick as the context is
   cleared find nothing.

With a 1 s miss cache and a read that takes longer than 1 s, a run that keeps emitting costs one read per
event round, and several such runs keep the main thread busy back to back. Everything else waits (Feishu
ingress, worker IPC), worker turns time out, their failure paths emit more events: positive feedback.

Which of the three produced the 16:37 events is not identified: the profile only shows the async dispatch,
and V logs no run id for this path. The 16:37 batch of failed worker turns (`workboard:…` Night Shift runs and
one Feishu direct run, failing 815–1,048 s after start) and the `announce:codex-native:…` runs before it
are candidates for (2) and (3). The fix below does not depend on which.

## Freeze 2: restart blockers in the host-thaw loop

18:28:48–18:30:17 V froze again (~89 s, ELU 1, event loop delay max 86 s), and from 18:30 the host-thaw
loop kept the Gateway stalled. Monitor's watchdog profile (`/tmp/gw-prof/freeze-auto-183622.cpuprofile`,
23.5 s): 15 s under

```
processTimers > server-maintenance tick > restartChannelsIfIdle > restartChannels
  > createGatewayActiveWorkSnapshot > getInspectableActiveTaskRestartBlockers
  > reconcileTaskRecordForOperatorInspectionWithContexts > shouldMarkLost > hasBackingSession
  > findTaskSessionEntry > getSessionEntryLookup > listSessionEntriesReadOnly   (whole store)
```

`findTaskSessionEntry` needs one entry (does the task's child session exist, is its orphan recovery
tombstoned) but `getSessionEntryLookup` reads the whole store once per reconcile context. The restart-blocker
check builds a fresh context on every call, and `restartChannelsIfIdle` runs it every 30 s once the Gateway
was stalled for more than 75 s: each round reads the whole store again, which keeps the stall going (18 rounds
from 18:30). The 60 s task sweep and the task audit go through the same lookup (once per pass).

## Change

Plan `lab/gateway-freeze-lookups.plan.json`, patcher `lab/patch-gateway-freeze-lookups.mjs`, builder
`lab/build-gateway-freeze-lookups.mjs`, test `lab/gateway-freeze-lookups.test.mjs`. Two core dist files; the
first commit of each release file is V's bytes (checked on V 2026-10-27 after Codex's 03:30 release):
`server-session-key-ZtX3Ble7.js` `30a0e1f9…` (9.1 install bytes) and `task-registry.maintenance-C4nMaDY9.js`
`b6fe747f…` (#442's bytes, also in `release/captured/v2026.9.1-db91.6-unified-session-20261027`).

**1. `resolveSessionKeyForRun`**

- `resolveSessionKeyForRun` passes `match: { sessionIds: [runId] }` to `loadCombinedSessionStoreForGatewayCore`.
  That option is already on V (sessions-search-exact-read, #475, 2026-10-25: `combined-store-gateway-BwDhjbIt.js`
  `9cb53296…` and `v-session-entries-matching.mjs` `d2d2c2cd…`, both verified on V): candidate keys come from the
  indexed `current_session_id` column, which the entry writer projects from `entry.sessionId`, and those rows
  are read with the whole-store read's columns, parser, participant projection, internal-session-effects skip
  and canonical-key check. Open incognito databases are still read whole, as before.
- The filter (`entry.sessionId === runId` and the agent check), the selection
  (`resolvePreferredSessionKeyForSessionIdMatches`) and both caches are V's code.
- A run id that is not a non-empty string keeps the whole-store read.
- `OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT=0` restores the whole-store read.
- The 1 s miss TTL is kept: a miss now costs well under a millisecond, and a longer TTL would change when a
  session persisted later under that id is found.

Difference on corrupt data only: the whole-store read throws if any row of the store fails the canonical-key
check (the exception then fails the event dispatch); the indexed read only checks the matching rows.

Other callers get the same change: `sessions.abort` by run id, artifacts by run id, and the terminal
persistence path in server-runtime-subscriptions.

**2. `findTaskSessionEntry`**

- With the default maintenance runtime it reads the task's child session key with
  `listSessionEntriesMatchingReadOnly({ storePath }, { sessionKeys: [key] })` (same store path as before; the
  reader looks the key up in `session_nodes` and reads that row as the whole-store read does) and caches the
  entry, or its absence, in the reconcile context for the rest of the pass.
- Callers, decisions (`Boolean(entry)`, `isSubagentRecoveryWedgedEntry`, the lost reason) and the context's
  other caches are V's code. A test runtime with its own `listSessionEntries` keeps the whole-store lookup.
- `OPENCLAW_V_TASK_SESSION_LOOKUP_EXACT=0` restores the whole-store lookup.
- Same corrupt-data difference as above.

## Results

Candidate `candidate-4207ba89` (commit `85eef9cf`, clean) on the VLab runtime, whose four relevant chunks
are V's bytes (the harness asserts `server-session-key`, `task-registry.maintenance`, `combined-store-gateway`,
`v-session-entries-matching` and `server-chat` hashes). Harness `candidate/gateway-freeze-lookups-ab.mjs`: a
makaron agent database created by OpenClaw and filled with V's `session_nodes`, `session_windows`,
`session_participants`, `session_transcript_index_state` and `session_progress_cards` (exported read-only
2026-10-27 17:26 CST: 10,724 sessions, 708 MB of entry JSON; every valid row has
`current_session_id = entry.sessionId`), plus synthetic rows. V's chunks and the release chunks are loaded
side by side. Numbers in `gateway-freeze-lookups-results-20261027.json`. VLab is slower than V: the same
whole-store read takes 10–13 s here, 5–6 s on V on 10/23 (with 9,050 rows).

**Equivalence**

| | cases | differences |
| --- | --- | --- |
| `resolveSessionKeyForRun`: 30 real session ids (15 Night Shift, 15 others), 5 upper-cased, two keys sharing an id (fresher wins), a tie (no key), an internal-session-effects row, a tombstone, a structural-suffix pair, 10 unknown UUIDs, 5 `workboard:` and 1 `announce:codex-native:` run ids, an empty id; each with agentId makaron, v-codex and none | 171 | 0 |
| miss cache (hit remembered, miss cached), switch off reads the whole store again (13.3 s) | | same |
| restart blockers over 62 tasks: subagent tasks on 40 real sessions, 10 missing, internal, tombstone, wedged, archived, upper-cased key; cli tasks (subagent key, direct chat, with run id); fresh, queued, harness-owned, other agent | 43 blockers | identical |
| `reconcileTaskLookupToken` for each of the 62 tasks (43 running, 16 lost "backing session missing", 1 lost with the wedged reason, 1 queued, 1 harness-owned lost) | 62 | 0 |
| task switch off reads the whole store again (8.7 s) | | |

Without agentId both arms throw the same error on VLab ("Multiple agents are configured, but this operation
has no explicit owner"); on V the events reaching the lookup carry an agentId.

**Cost per call** (V chunk 3 calls, release 30–60; synchronous, so wall time is main-thread time; allocated
includes garbage):

| | V chunk | release |
| --- | --- | --- |
| run lookup, hit (Night Shift session id) | 12,781 ms, 2,716 MB | 2.3 ms, 0.4 MB |
| run lookup, miss (unknown UUID) | 10,451 ms, 2,718 MB | 0.6 ms, 0.1 MB |
| run lookup, miss (`workboard:` run id) | 10,840 ms, 2,705 MB | 0.6 ms, 0.1 MB |
| restart blockers, 62 tasks | 9,945 ms, 2,675 MB | 55 ms, 13.4 MB |

**Event stream** (OpenClaw's own agent event bus and server-chat `createAgentEventHandler`, events handed to
the handler on a later microtask as server-runtime-subscriptions does; 2 runs × 10 rounds, each round after
the previous was handled plus 125 ms, longer than server-chat's 75 ms live-text pacing, so both arms send the
same messages):

| scenario | lookups | V chunk: lookup time / longest timer delay | release | handler output |
| --- | --- | --- | --- | --- |
| run context without sessionKey | 20 | 212 s / 24.0 s | 6 ms / 11 ms | identical (0 messages, invisible run) |
| no run context, no sessionKey | 20 | 192 s / 23.2 s | 5 ms / 6 ms | identical (18 messages) |
| channel run, context cleared after emit | 20 | 244 s / 34.9 s | 6 ms / 5 ms | identical (0 messages) |

With the V chunk every event did a whole-store read: each read takes longer than the 1 s miss cache, so the
cache has always expired by the next event.

Not covered: V's concurrency and page-cache state, the real emitters (the scenarios reproduce the three
conditions, not the 16:37 runs), and a Gateway restart with the patch (single-process replay of the chunks).

## Deploying

Replace two files in `core/dist` (before = V's bytes), restart the Gateway. No dist file overlap with #484 or
#487 (all three touch `platform/catalog.json` / `platform.test.mjs` counts). Requires `v-session-entries-matching.mjs`
and the `match` option of `combined-store-gateway-BwDhjbIt.js` (#475), both on V.

After the restart: a CPU profile (or Monitor's `freeze-watch.sh` captures) should show no
`resolveSessionKeyForRun` or `getSessionEntryLookup` → `listSqliteSessionEntriesFromDatabase` stacks.
