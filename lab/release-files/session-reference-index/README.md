# session-reference-index — session deletions no longer parse every session entry inside their write transaction

## Symptom (production V)

The Gateway file log (`/tmp/openclaw-1002/openclaw-*.log`, subsystem
`sqlite/transaction`) shows synchronous `agent.write` holds on the makaron
agent database, 106 of them between 11/16 00:01 and 11/17 02:45 CST (about
4 an hour):

| path (callers) | holds | median | worst |
|---|---|---|---|
| `runSqliteSessionDeletionTransaction` ← `sqlite-lifecycle:377` (sessions.delete) | 103 | 2.95 s | 3.7 s |
| `runSqliteSessionDeletionTransaction` ← `commitProjectedLifecycleMutation` | 3 | 5.3 s | **38.2 s** |

The 38.2 s hold (11/16 19:53:52) was `cron.remove`, which took 59 s: removing
the job removed its run sessions in one projected mutation, and the DingTalk
socket timed out and reconnected meanwhile. The 01:06 23.6 s liveness stall was
a 5.2 s projected hold right after another hold (about 10 s), the rest most
likely GC at a 5.8 GiB heap.

The stack name is misleading: `runSqliteSessionDeletionTransaction` is the
wrapper every agent write transaction goes through. The time is spent in what
the deletion does inside it.

## Cause

V's makaron store has 21,923 session nodes and 1.99 GB of `entry_json` (each
row carries a ~55 KB skills snapshot and a ~32 KB prompt report). Measured on V
with a read-only connection (`mode=ro`, `ionice -c3`):

| query over all rows | time |
|---|---|
| `json_remove(entry_json, '$.skillsSnapshot', '$.systemPromptReport')` (the metadata projection) | 2.6 s |
| `length(entry_json)` | 1.2 s |
| `octet_length(entry_json)`, rowid, key, current id, updated_at | 0.18 s warm (0.75 s cold); 26 ms for `octet_length` alone |

Two places run the metadata projection over every row and parse each row in
JavaScript:

1. `deleteSessionEntryRows` (entry-store chunk). Whenever the deleted key still
   owns windows, it looks for a surviving node to rehome each window to: every
   other row, sorted by key, projected and parsed until one references the
   window. With no match, that is every row. Deletions that keep transcript
   state (the cron run cleanup) and every projected removal take this path.
2. `readReferencedSessionIds` (lifecycle-state chunk), the set of session ids
   any live node references. Deletions that drop transcript state call it in
   their preparation lane and again inside the transaction
   (`deleteMaterializedSessionStatePlans`); projected removals call it too.

A projected mutation removing N entries runs (1) once per entry inside one
transaction, which is the 38 s hold. The log's callers do not say which kind of
deletion each 3 s hold was; both kinds are covered and measured below.

Only about 250 of V's rows reference anything besides their own current
session id (10 `previousSessionId`, 156 `usageFamilySessionIds`, 80
`compactionCheckpoints`).

## Change (marker `session-reference-index-v1`)

Source: openclaw-versa `versa/port-session-reference-index-20261117` @
`1a9308eec02` (three commits on `ca32fca3e29`, which is V's source for these
chunks). New module `session-accessor.sqlite-reference-index.ts` and its test
(10 tests); `session-history-eviction.admission.test.ts` now asserts the
transcript-dropping deletion no longer scans every row.

A per-connection index keeps, for every session node, the session ids it
references (`sessionId`, `previousSessionId`, `usageFamilySessionIds`,
compaction checkpoints; the same `collectSessionStateIdsForEntry` over the same
metadata projection) and a fingerprint read in the same statement: rowid,
current id, `updated_at`, `octet_length(entry_json)`. The byte length comes from
the record header, so validating every row reads leaf pages only (90 MB on V),
never the JSON.

- **This connection's writes.** TEMP triggers on `main.session_nodes` record
  each inserted, updated or deleted key in a TEMP table, raw DML included. The
  TEMP tables have no constraints: an outer statement's `ON CONFLICT` clause
  overrides a trigger's own conflict handling, so a constrained insert could
  fail the session write (the first version did, in a test).
- **Other connections' writes** (workers, CLI): when `PRAGMA data_version` moved
  since the last validation, every fingerprint is compared and changed rows are
  re-read. Inside a write transaction no other connection can commit, so a
  second read in the same transaction (N removals) costs only its own writes.
- **Rollback.** Each refresh writes an epoch token into a TEMP table through the
  caller's transaction. If that transaction rolls back, the token goes with it;
  the next refresh then compares every fingerprint and re-reads every row it
  had loaded inside unconfirmed transactions.
- **Prewarm.** Before the deletion transaction (and before the preparation lane
  of transcript-dropping deletions, on an already open store only), the index
  is validated outside the writer lane: fingerprints 2,000 rows per page, stale
  rows 200 per page, one page per event-loop turn. The first deletion after a
  start loads all rows this way instead of in the transaction.
- `deleteSessionEntryRows` takes the first surviving owner per window from the
  index (lowest key in SQLite BINARY order, as the sorted scan did);
  `readReferencedSessionIds` builds its set from the index. On any error both
  fall back to the old full read.

Rollback switch: `OPENCLAW_V_SESSION_REFERENCE_INDEX=0` in the Gateway's
environment restores the full read on every call (arm C below). It needs a
restart to take effect, like any environment change.

## Evidence

Fixture: `lab/candidate/v-scale-session-fixture.mjs`, VLab data only. 21,900
session nodes, 1.71 GB of entry JSON, 5,008 historical windows, 2.7 GB file.
Rows VLab's own store holds that the canonical-key scan rejects are dropped
first (none this run).

`lab/candidate/session-reference-index-ab.mjs` runs three arms in separate
processes, each on its own copy, with the same operations in the same order:
8 Gateway `sessions.delete` calls as `session-reset-service` issues them
(transcripts dropped; two sessions have a historical window another node
references), 4 projected removals, and one projected mutation removing 6
entries. Before each operation another connection rewrites 100 other rows the
way `writeSessionEntry` does (worker commits), so `data_version` moves. Each
operation is timed with a 1 ms ticker.

Two VLab candidate runs with the same release files, `candidate-a67ed071` and
`candidate-0769bda7`. The second one runs the canonical-key scan before
measuring, as V does at Gateway start. VLab is a 4-core host: a deletion that
holds 3.5 s on V blocks 15–25 s there.

| longest main-thread block | A: V bytes | B: release | C: release, switch off |
|---|---|---|---|
| sessions.delete, first in the process | 27.2 s / 56.9 s | **1.7 s** / 5.0 s¹ | 31.6 s / 33.4 s |
| sessions.delete, 2nd–8th | 14.9–25.2 s | **0.18–0.32 s** | 17.5–31.5 s |
| projected removal | 11.2–13.6 s | 0.76–2.3 s | 11.6–16.6 s |
| projected mutation, 6 removals | 32.5 s / 34.6 s | **1.17 s / 1.38 s** | 35.9 s / 41.3 s |

¹ In the first run the harness had not triggered the per-connection canonical
scan, so B's first deletion paid it (`scanCanonicalSqliteSessionEntries` in its
CPU profile). In the second run, which takes that scan up front, the cold index
load ran in the prewarm's pages and the longest block was 1.7 s.

B's projected removals keep part of their cost: the fingerprint pass in their
preparation lane (`collectStaleSessionReferenceKeys` and node:sqlite `next` in
the profile; other connections had committed just before) plus the
pre-existing `readSessionEntryCount` over every row. No entry JSON is parsed.
The timings vary between the two runs with VLab's page-cache pressure (four
2.7 GB copies on a 15 GB host).

Data: after all operations, the three databases are identical. The digests
cover `session_nodes` (keys, current ids, `updated_at`, entry JSON),
`session_windows` ownership with per-window transcript counts, and the total
transcript count. Every referenced historical window ended owned by the
surviving node that references it, with its transcript intact; every
unreferenced one was deleted.

Unit tests (openclaw-versa, Node 22.23.1): the new index tests (equivalence
with the full read with and without exclusions; zero parses when nothing
changed; own same-fingerprint writes; other connections' updates, inserts and
deletes; rollback; reuse within one transaction; prewarm; identical rehoming;
`INSERT OR REPLACE` / `UPDATE OR ROLLBACK` / `UPDATE OR FAIL` writes never
fail). The whole `src/config/sessions` directory passes: 119 files, 1331 tests.
In `src/state`, 3 tests fail the same way on `ca32fca3e29`.

## Deploy

- Files (whole-file replacement, `lab/session-reference-index.plan.json`):
  `session-accessor.sqlite-entry-store-VfW3gyuj.js`,
  `session-accessor.sqlite-lifecycle-state-CrB_K2kA.js`,
  `session-accessor.sqlite-lifecycle-dtL0ZEAl.js`, all in core `dist/`. The
  `before` hashes are V's bytes as of 11/17 (the lifecycle chunks include
  lifecycle-cleanup-bounded, already on V).
- One Gateway restart (the chunks load at start; worker processes restart with
  the pool).
- It touches no file that #608 (sessions-search-stall) or #609
  (sessions-visibility-columns) replaces.
- After the deployment, look in the Gateway file log for `slow SQLite
  transaction hold` with `runSqliteSessionDeletionTransaction` in its callers.
  Expect none above 1 s, except the first deletion after a start if its
  prewarm was skipped.

## Residual risks

- **Same-fingerprint edits by another process.** If another connection changes a
  row's referenced ids without changing its byte length, `updated_at` or current
  id, the index keeps the old ids until that row changes again. Reference
  changes come with rollovers (new current id), compactions or appends (length
  and `updated_at` change); none known keeps all three. The outcome would be a
  window treated as unreferenced, so it is deleted or not rehomed. This
  connection's own writes are tracked exactly.
- **Remaining cost.** When other connections committed since the last
  validation (normal on V), a reference read inside a transaction still
  compares every fingerprint, about 0.18 s on V. Projected removals do this in
  their preparation lane, where there is no prewarm.
- Each connection that used the index has three TEMP triggers on
  `session_nodes`: one indexed lookup and insert into a TEMP table per written
  row. It holds a few MB of ids per connection.
- **Cold reads outside a deletion.** Other callers of `readReferencedSessionIds`
  (the Dreaming cleanup when it reclaims something, disk-budget eviction) use the
  index without a prewarm. The first such call in a process loads it in place,
  at the old cost, once.
