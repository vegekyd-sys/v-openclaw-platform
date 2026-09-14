# OpenClaw 9.1 shared Agent DB lock root cause and acceptance

## Scope

This patch targets the deployed OpenClaw `2026.9.1` DB91 runtime. It does not
depend on, install, or backport the unpublished 9.4 runtime.

The exact production and shared-VLab input is
`openclaw/dist/memory-schema-BSs9MQgq.js` at SHA-256
`826691c2d7cb634ed6762908e34f015aaf508eaaabc9936a73cafd83929f4da5`.

## Production evidence

The production JSON log shows a repeatable shared-database writer amplifier:

- `memory.fts.ensure-body` held an immediate write transaction for 7.848 s at
  15:15:11, 15.261 s at 15:41:33, 3.140 s at 15:42:17, and 8.005 s at
  15:53:33.
- The 15.261 s hold ran in the same request trace as repeated Feishu callback
  acknowledgement timeouts. Nearby Agent DB writers then exhausted their 5 s
  SQLite busy timeout and surfaced `database is locked`.
- Between 14:30 and 16:05, generic `agent.write` transactions also showed 17
  slow holds, with a maximum of 11.358 s. The Gateway reported warning or
  critical memory pressure during the incident, which made synchronous Worker
  processes retain locks while descheduled.

The body/path FTS schema functions unconditionally entered
`BEGIN IMMEDIATE` whenever DB91 memory schema support was enabled. That happened
even when the FTS tables were already valid and populated and all path triggers
already existed. Every Worker therefore converted a read-only readiness check
into a shared Agent DB writer.

## Fix

For both body and path FTS:

1. inspect table shape, population, and required path triggers without acquiring
   a writer;
2. return immediately when reconciliation cannot change persisted state;
3. acquire `BEGIN IMMEDIATE` only for a missing, mismatched, or unpopulated
   derived table or missing trigger;
4. repeat the inspection after acquiring the writer so concurrent repair does
   not cause duplicate DDL/backfill.

The feature-flag-off path remains byte-for-byte behaviorally equivalent to 9.1.

## Acceptance gates

Before promotion to production, shared VLab must run the same packaged artifact
and pass all of the following:

- exact before/after hashes and 9.1 runtime identity;
- healthy Memory schema and real `memory_search` results;
- 15 concurrent, separate Agent runs that exercise prompt assembly and Memory;
- zero `memory.fts.ensure-body`/`memory.fts.ensure-path` write transactions for
  already healthy schema;
- zero `SQLite transaction lock wait failed`, `database is locked`, Worker
  acknowledgement timeout, and visible delivery failure in the test window;
- a forced missing-FTS fixture that performs one repair and then returns to the
  zero-writer healthy path;
- Gateway health, Worker readiness, and a real Feishu receive -> dispatch ->
  visible reply after the load test.

Production remains unchanged until those gates pass and the tested artifact is
explicitly promoted.
