# OpenClaw 9.1 database contention: isolated repair investigation

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
