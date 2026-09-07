# OpenClaw 9.1 database contention: isolated repair investigation

## Latest authorization: two parallel tasks

The user subsequently split the work into two concurrent threads. This current
thread owns the urgent Database repair: reproduce and pass VLab validation,
then deploy the targeted repair to production V with rollback and real-path
acceptance. A separate thread owns the Worker high-concurrency/process-necessity
evaluation, with no production write scope. The earlier sequential Worker-first
gate below is superseded by this parallel split, not by permission to skip Lab
acceptance. This Database task must remain compatible with the existing Worker
architecture; do not make production Worker removal a prerequisite for repair.

The Database task retains the stopped, independently owned `db91-fix` instance.
The Worker task must not change it. Coordinate exclusive heavy-load windows and
data-disk capacity even though development proceeds in parallel.

## Current user gate: evaluate Worker necessity first

### Clarification: high concurrency is the primary criterion

The user clarified that the original value of Worker was avoiding system-wide
stalls under high concurrency (historically described as roughly five jobs
stalling without Worker versus around one hundred remaining responsive with
Worker). Treat those numbers as the user's historical observation, NOT a
verified current 9.1 benchmark. Two-session success does not establish that
Worker is unnecessary.

The first decision must use matched resource/model/database inputs and a
stepped load test: 5, 10, 20, then higher only within an exclusive resource
budget. Record submitted, queued, actually executing and completed tasks
separately; do not call 100 queued requests “100 concurrent executions.” Record
worker OS processes separately from agent/task concurrency. Measure completed
throughput, queue/admission latency, response p95/p99, Gateway heartbeat/RPC,
CPU/RSS/swap/I/O, database-open/lock waits, failure/cancel/recovery rates, and
missing/duplicated results. Include steady-state, cold starts and bursts.

Personal-instance default concurrency remains two until an explicitly scoped
load-test resource/lease arrangement is in place. Do not bypass that limit or
load-test 100 active jobs alongside someone else's VLab runtime.

Current evidence only: native two-session real tool/final test passed in
11,214 ms; one Worker with two slots passed in 15,994 ms. These single rounds
include provider/startup variation and are NOT a throughput ranking. The
two-Worker mode was started but not tested before the user's interruption.
Synchronous SQLite injection is a secondary fault-containment test; it does
not replace the required high-concurrency comparison.

On 2026-09-07 the user explicitly reordered the work:
first establish in VLab whether the custom multiprocess Worker layer is needed
under native 9.1; only then choose and accept a database fix in VLab. No
production change before that acceptance. The coordinator proposal below is
paused, not the selected architecture.

Compare original native 9.1, one Worker with two slots, and two Workers with one
slot each, keeping model, total concurrency and instance resources equal. Do
not change integrity code during the comparison. Separate normal I/O concurrency
from CPU/database stall isolation, process failure containment, memory overhead,
transcript integrity, cancellation and subagent completion. A fast normal-path
result alone is insufficient to remove the isolation layer.

Scope: production incident of 2026-09-07, native 9.1 agent database open path.
Branch: `codex/db91-contention-20260907`; baseline `6b78fffe432a7741e270526a75027bdd657bbaca`.
No 9.2 platform upgrade is included.

## Confirmed from the live 9.1 bundle

- A cold agent database open invokes `assertAgentDatabaseIntegrityBeforeMutation`.
- For an already-current schema 19, that invokes `verifyAndRepairCanonicalSqliteIndexes`, which unconditionally runs full `PRAGMA integrity_check` and `PRAGMA foreign_key_check` synchronously before checking index contracts.
- Each process has its own connection/validated-path cache. Parallel cold opens therefore repeat the whole-file work.
- The schema initialization path also takes `BEGIN IMMEDIATE` for current databases and settles pending session validity rows.
- The canonical schema already includes a partial index for `entry_valid = 0`; adding another such index is not a fix.

Live evidence: 114–130 second database opens, database-is-locked write failures,
120 second worker stalls, and substantial I/O pressure. The exact holder of each
historical write lock has not been identified. Full integrity checks themselves
are reads; they must not be described as holding SQLite's exclusive writer lock.

## Safety boundaries

Benchmark only synthetic data inside the owned `db91-fix` instance, using native
bundle functions. Do not copy production state to VLab. Do not run a heavy
integrity scan against active production as a diagnostic probe.

Any proposal to move full physical checks out of normal opens is a change to
check timing, not proof that corruption is impossible. Migration, schema and
ownership checks, permissions, error quarantine, and physical validation after
actual index repair must remain. A production change needs an explicit mode,
controlled full-check maintenance, rollback, and real runtime acceptance.

Status: investigation/benchmark candidate only; no production modification.

## User requirement: integrity AND speed, not an either/or switch

The repair design must distinguish transaction correctness from full physical
scrubbing. Do not simply switch off `integrity_check` in production.

1. Keep transactional atomicity, current durability settings, foreign-key
   enforcement, schema/owner/permission checks and error quarantine in the
   normal write/open path. Do not silently change synchronous/NORMAL, WAL
   checkpoint policy, schema version, or retention as a performance fix.
2. Introduce one validation coordinator per database. Full integrity and foreign
   key scans execute in a resource-bounded independent process, not the Gateway
   event loop. Multiple workers subscribe to the same validation job instead
   of each issuing a full scan. Each scan uses one consistent SQLite read
   transaction; limit concurrency and reader duration to avoid WAL growth.
3. Reuse a successful validation only within an explicitly defined database
   lifecycle. A path string, timestamp, or inode alone is NOT sufficient proof
   that new content is validated. Replacement, restore, migration, schema
   changes, failed/incomplete checks and detected corruption invalidate trust.
   The exact lifecycle/attestation design needs fault tests before deployment.
4. Prevalidate existing databases during controlled startup so live requests
   do not pay for a multi-GB scan. Revalidate in the background before the
   successful result becomes stale. If a first-use check is still running,
   queue only the affected database's work asynchronously; do not busy-wait
   inside the synchronous database-open API and block every agent.
5. Keep migration/repair out of the request path. A schema defect or corrupt
   database must fail closed for that database and require exclusive, backed-up
   repair; it must not silently reopen using an old successful receipt.

This requires changes to the database lifecycle/open orchestration, not just a
one-line pragma replacement. Shared validation can match the current cached
connection lifecycle, but it must not be presented as detecting arbitrary new
hardware corruption instantaneously. Background scrubbing plus transaction
constraints and runtime error handling are complementary protections.

### Required acceptance

- Five simultaneous cold users of one large synthetic database cause one full
  check, with Gateway RPC still responsive and no global watchdog stall.
- Successful ordinary writes remain atomic and foreign-key invalid writes are
  rejected; concurrent readers/writers preserve committed record counts.
- Missing or drifted indexes are detected; full validation follows repair.
- Replaced/truncated database, stale receipt, schema migration, checker crash,
  lock contention and interrupted recovery never reuse an invalid result.
- A failed database is isolated without stalling unrelated agents.
- Record scan duration, disk I/O, WAL growth, open p95/p99 and event-loop lag;
  do not extrapolate a tiny warm-cache benchmark into production acceptance.
- Full production rollback and real model/tool/channel acceptance remain
  required before calling the original repair request complete.

## Native-bundle experiment (completed, not production acceptance)

Owned VLab instance: `db91-fix`, owner `codex-db91-contention-20260907`, port
26300; source commit `12bbea3383cfb7ce2cd0ef693fdc666cca19242a`.
Gateway was not started. The probe ran under `labctl run` using the instance UID,
isolated paths and cgroup limits. Other gateways were not modified or restarted.

Native 9.1 functions on 72,929,280 bytes of synthetic SQLite data, 8,192 rows:

| Pass | Full integrity + index contracts | Index contracts only |
| --- | ---: | ---: |
| 1 | 20.83 ms | 0.30 ms |
| 2 | 18.41 ms | 0.30 ms |

The index-contract repair function still repaired a deliberately drifted index;
the post-repair full integrity check passed and all 8,192 rows remained. This
proves the physical scrub and structural checks are separate native mechanisms.
It does **not** establish a production speedup or justify disabling full checks.
This is a small, warm-cache synthetic test, not the 6.9 GB production workload.

No production code/config/data was changed. The coordinator, lifecycle fencing,
asynchronous readiness path and fault acceptance above are not implemented yet.
