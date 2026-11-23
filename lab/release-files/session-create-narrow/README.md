# session-create-narrow — creating a session no longer parses every session row

`sessions.create`, and so `sessions_spawn` with `visible: true`, read and parsed makaron's whole
session store on the Gateway thread. On V that stops the Gateway for 40–60 s and allocates
~4.6 GiB per call.

## What happened (V, 2026-11-23 CST)

| visible spawn (tool call → result) | child window created | stall | heap after |
|---|---|---|---|
| 14:51:25.672 → 14:52:15.533 (49.9 s), group `oc_eb6d0748…` | 14:52:03.217 | liveness overdue 42.8 s, `eventLoopDelayMaxMs` 49,929 | 7.51 GiB (from < 6 GiB) |
| 15:07:27.6 → 15:08:27.3 (59.8 s), same group | 15:08:13.500 | overdue 38.4 s, max 59,861 | 7.46 GiB |
| ~15:24:4x, same group | 15:25:22.127 | overdue 46.6 s | — |

The same pattern goes back to the first visible spawns after the store reached its current size:
11/16 23:47:56 (overdue 17.6 s), 11/17 01:06:26 (23.7 s). Every visible spawn since 11/16 lines
up with a >17 s stall, and it grows with the store (makaron today: 26,779 rows, 2.64 GB of
`entry_json`, mostly Chinese text, i.e. two bytes per character once in V8).

Inside each stall the Gateway wrote no log line until its end; the only lines are two slow
agent.write holds at the end (`appendTranscriptEvent` 5.9–7.6 s — the child's transcript
header — and `runSqliteSessionDeletionTransaction` 6.1 s — the child's lifecycle upsert, not a
deletion). Both are victims: they are short writes timed across major GCs of a 7.5 GiB heap.
The window of the child session is created *after* 38–46 s of the stall, so most of it is
before the commit. Feishu card updates timed out, DingTalk reconnected after 50 s without ack,
and Feishu ingress catch-up reported `event loop stalled 51s` / `61s`.

## The allocator (candidate, V's bytes)

`lab/candidate/visible-spawn-heap.mjs` builds a V-scale makaron store (21,800 rows, 1.7 GB of
entry JSON, `v-scale-session-fixture.mjs`) and calls the real `sessions.create` handler with the
parameters `sessions_spawn(visible)` sends (agentId, label, parentSessionKey of a Feishu group,
spawnDepth 1), once to warm the process and once under the CPU profiler and the sampling heap
profiler (objects later freed by GC included).

One warm call: **21.9–23.0 s wall, 24–25 s main-thread block, 6.9 GB sampled allocation.**

| where (bottom-up) | sampled allocation | CPU |
|---|---|---|
| `createSessionEntryWithTranscript` → `listSessionEntriesCore` → `listSessionEntryRows` → `readSessionEntryCache` → `loadSessionEntrySnapshot`: `SELECT session_key, entry_json, owner_* FROM session_nodes ORDER BY session_key`, every row, then `parseSessionEntryJson` per row | 3.4 GB row strings + 2.9 GB parsed entries | ~25 s |
| `createGatewaySession` → `resolveGatewaySessionStoreTarget` → `loadGatewaySessionLookupStoreUncached` → `listSessionEntriesCore` (list projection, `json_remove` per row) | 0.1 GB | ~4–6 s |
| `applySessionEntryLifecycleMutation` → `readSessionEntryCount` in and after the commit | — | 0.2 s warm, 5.5 s cold |

Why the full reads:

1. `createSessionEntryWithTranscript` builds `store` from every entry (full projection, skills and
   prompt snapshots included) to resolve **one** key with `resolveSessionStoreEntryCore`, and hands
   a shallow clone of all of it to the creation callback. The only consumer of the whole store is
   session-create-service's `isLabelInUse`: `Object.entries(sessionEntries).some(e.label === label)`.
2. `resolveGatewaySessionStoreTarget` loads the list projection of every row and then drops the
   store; `findCanonicalStoreMatch` only looks at the seed keys.
3. The lifecycle mutation counts every row before and after the commit; `createSessionEntryWithTranscript`
   discards the result.

## Change (marker `session-create-narrow-v1`)

| target | change |
|---|---|
| `openclaw/dist/session-accessor-K0XuW6ln.js` (before `13af5e83…`, the infer-latency release file) | `createSessionEntryWithTranscript` lists session keys only (`SCAN … USING COVERING INDEX sqlite_autoindex_session_nodes_1`), keeps the keys `resolveSessionStoreEntryCore` can consult — the trimmed key, its folded aliases (`collectSessionEntryLookupKeys`) and keys whose `normalizeStoreSessionKey` equals the requested key (prefiltered by whitespace-free lowercase, a necessary condition) — and reads just those rows with the same projection, parser, participant projection, internal-key filter, canonical-key check and key order as the listing, in one deferred snapshot. The creation callback also gets `isSessionLabelInUse(label, exceptKey)`. The lifecycle mutation takes `skipEntryCounts`, which this caller sets. |
| `openclaw/dist/session-create-service--hv2vsLh.js` (before `83b8f923…`, npm 2026.9.1) | `isLabelInUse` uses `isSessionLabelInUse` when the accessor provides it. |
| `openclaw/dist/session-utils-store-Dlphca2N.js` (before `b566c7e9…`, the session-sharing-bounded-reads release file) | `resolveGatewaySessionStoreTarget` reads its seed keys exactly unless the caller says otherwise (the batch cache path already does this). |

`isSessionLabelInUse`: the canonical writer stores `label = normalizeText(entry.label)` on every
`entry_valid = 1` row (`bindSessionNode`); a cleared row (`entry_valid = -1`) has `{}` and no label.
So for a label that is already trimmed and non-empty, the rows with `entry.label === label` are among
`label = ? OR entry_valid != 1`; those rows are read and decided by the parsed `entry.label`, exactly as
before. NULL, 0 and 1 are stored in the SQLite record header, so the scan does not walk the overflow
pages of unlabeled rows. Any other label (untrimmed, empty, non-string) uses the full listing as before.
Checked on V (read-only, 2026-11-23): 26,779 valid rows, 624 with a label, **0** rows whose label column
differs from the trimmed JSON label, 0 labels with surrounding whitespace.

Incognito keys keep the full listing (their database is not opened read-only and is tiny).
`OPENCLAW_V_SESSION_CREATE_NARROW=0` restores V's behaviour for all three points (read per call).

Built by `node lab/build-session-create-narrow.mjs`; plan `lab/session-create-narrow.plan.json`.
Takes effect at the next Gateway start.

## Evidence (vlab91, 2026-11-23)

`candidate-f58cdc42-0016-4116-a09a-bb3f3db2c678` (plan `lab/candidate/visible-spawn-heap.plan.json`):
same fixture, A = V's bytes, B = release files, A/B/A/B, each a fresh process (warm-up call, then the
measured call), runtime bytes checked equal to V's before the run.

| | A (V) | B (session-create-narrow-v1) |
|---|---|---|
| sessions.create wall | 22,967 / 21,885 ms | 435 / 439 ms |
| longest main-thread block | 25,332 / 24,248 ms | 717 / 717 ms |
| sampled allocation during the call | 6,901 / 6,933 MB | 38 / 40 MB |
| rows of `entry_json` read | 21,801 full + 21,801 list | 1 (the parent) |
| duplicate label refused (`label already in use`) | 20.5 / 21.3 s | 0.41 / 0.42 s |
| first call in a fresh process (includes the one-time canonical key proof) | 26.8 / 27.1 s | 6.7 / 6.7 s |

The created entries are identical field by field (ids and timestamps masked); the duplicate-label
outcome is identical. The B label scan took 333 ms on this fixture, where every cloned row carries a
label; on V 624 of 26,779 rows have one.

On V the A numbers are larger: 2.64 GB of mostly two-byte text (vs 1.7 GB ASCII here), an 8 GiB heap
already in use, and the major GCs that follow (the two 6 s holds at the end of each stall).

Not covered: the `chat.send` of the child's first turn under real channel/plugin load (the stub
context does not start a run); the `create+task` arm measured on V's bytes (26.5 s) showed the same
full read before the run starts.

## Rollback

Set `OPENCLAW_V_SESSION_CREATE_NARROW=0` in the Gateway's environment (read per call, but a systemd
environment change still needs a restart), or restore the three files' `before` bytes.
