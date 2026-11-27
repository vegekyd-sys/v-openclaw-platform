# memory-close-passive-v1

`manager-vector-warning-BHH19jrh.js` (V's bytes: npm openclaw@2026.9.1, `8e513488…`). Rebuild with
`node lab/build-memory-close-passive.mjs --base <dir>`; plan `lab/memory-close-passive.plan.json`.
Source: openclaw-versa `versa/memory-close-passive-checkpoint-20261120` @ `b09039594d8`.

## What V did (2026-11-20, CST)

- Every `tools.invoke` memory_search took 6.1–7.5 s between 22:29–22:34 and 23:06–23:09 instead
  of 1.0–1.3 s. The Gateway's own `⇄ res ✓ tools.invoke <ms>` agrees with the voice
  candidate's `gatewayMs` to the millisecond, and the tool's `toolMs`/`searchMs` stayed ~1.0 s.
- In one slow call the file log shows the request at 22:34:07.35, the search manager opened by
  07.52, the search done by ~08.5, then nothing until the reply at 13.47: the 5 s is after the
  search.
- `liveness heartbeat delayed: overdue=3591ms` at 22:43:53.123 and `overdue=1640ms` at
  22:51:25.619, the same moments two slow replies were sent: the Gateway thread was blocked, not
  waiting on I/O.
- web_search through the same `tools.invoke` path stayed at 0.4–0.6 s; only memory_search was slow.
- The 23:28 restart cleared it (≈600 calls 23:34–23:44 at 1.0–1.3 s), but one call at 23:37:50
  still took 6.0 s.

## Why

memory_search opens a `search` `MemoryIndexManager` per call and closes it in its `finally`,
after `toolMs` is taken. `close()` → `closeMemoryDatabase` → `closeMemorySqliteWalMaintenance` →
`PRAGMA wal_checkpoint(TRUNCATE)`, synchronously, with the connection's `busy_timeout = 5000`.

The memory index is in the shared agent database (`openclaw-agent.sqlite`). TRUNCATE (like
RESTART) takes the WAL writer lock and then calls the busy handler until no other connection is
still reading the WAL. While any connection keeps a read transaction open, every close waits the
whole 5000 ms, gets `busy=1` (nothing logs it), and returns. Meanwhile the Gateway thread is frozen
and other processes' writes to the agent database are refused.

Reproduced with node:sqlite: reader holding a transaction → TRUNCATE 5192 ms (`busy: 1`), event
loop frozen throughout, a second process's write `database is locked`; PASSIVE 0–1 ms.

Which connection held the read open from about 22:30 to 23:07 is not in V's logs (SQLite does not
log readers; the candidates are the Gateway, its workers, v-memory-indexer, v-memory-vector-pin,
agent shell commands). It does not matter for the fix: any long reader reproduces it.

## Change

`openMemoryDatabaseAtPath` configures the memory connection's WAL maintenance with
`checkpointMode: "PASSIVE"`. PASSIVE never calls the busy handler. It is used for the close-time
checkpoint (the periodic one was already PASSIVE; nothing in this file calls an explicit checkpoint).
The database's owner (the Gateway's agent-database handle) keeps its own WAL maintenance; a
reindex shadow file is the last connection to itself, and SQLite checkpoints and removes the WAL
when the last connection closes.

Upstream main still closes memory connections with TRUNCATE and a 5000 ms busy timeout; there is
no setting for it.

## Deploy

Gateway restart required (the module is loaded once with the memory runtime). Processes that
import the same dist (v-memory-indexer, CLI) pick it up on their next start; no other action.

## Candidate

See the PR for the VLab candidate results (`lab/candidate/memory-close-passive-{old,new}.plan.json`).
