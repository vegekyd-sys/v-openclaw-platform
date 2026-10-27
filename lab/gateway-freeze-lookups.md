# server-chat run lookup reads only the run's session rows

Status: candidate only (2026-10-27). Not merged, not on shared VLab, not on V.

## The freeze

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
   reply run with `isControlUiVisible: isInternalMessageChannel(provider)`, i.e. `false` for Feishu,
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

## Change

Plan `lab/run-session-lookup-exact.plan.json`, patcher `lab/patch-run-session-lookup-exact.mjs`, builder
`lab/build-run-session-lookup-exact.mjs`, test `lab/run-session-lookup-exact.test.mjs`. One core dist file,
V's bytes unchanged since the 9.1 install (`30a0e1f9…`, checked on V 2026-10-27 17:00 after Codex's 03:30
release); the first commit of the release file is that copy.

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

## Results

RESULTS_PLACEHOLDER

## Deploying

Replace one file in `core/dist` (before = V's bytes), restart the Gateway. No file overlap with #484 or #487.
After the restart, a CPU profile during busy hours should show no `resolveSessionKeyForRun` →
`listSqliteSessionEntriesFromDatabase` stacks.
