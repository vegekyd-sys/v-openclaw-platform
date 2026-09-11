# Automatic session maintenance off the request event loop

Date: 2026-09-12. Scope: source candidate and shared VLab only. Production V is unchanged.

## Proven failure mode

A fresh Worker C1 on the current shared-VLab candidate completed correctly but
needed 11.386 seconds to first response text. Run-correlated Gateway and SQLite
instrumentation attributed 3.331 seconds of the 5.032-second projected-dispatch
to harness gap to the automatic `applySessionEntryMaintenance` planning snapshot
in `session-accessor.sqlite-entry`. The Worker pool enqueue and IPC steps were
sub-millisecond.

Holding only the existing data-free automatic-maintenance coordinator so that
the same request skipped that best-effort scan reduced first text to 4.619
seconds and projected dispatch to harness to about 0.66 seconds. The model,
Worker, configuration, database, session shape, and test workload were otherwise
unchanged.

## Candidate

- File-backed automatic maintenance planning runs in a bounded Node Worker
  thread. Its SQLite scan can no longer stop the Gateway or Agent Worker event
  loop.
- The isolated thread is read-only and returns the same native plan. The owner
  process retains the cross-process maintenance permit, exact-entry
  revalidation, short archive commit transaction, filesystem finalization,
  deletion transactions, lifecycle publication, and stale-owner checks.
- Incognito stores remain process-local and use the existing inline path.
- The worker protocol validates paths, resolved policy, plan shape, exit status,
  and a 120-second timeout. The worker heap is capped at 512 MiB.

This does not remove retention, archive, cap, integrity, or SQLite contention
guards. It changes only which event loop performs the read-only global planning
scan.

## V2: archive sizing in the same isolated snapshot

The first VLab deployment removed the proven 3.3-second Gateway planning
transaction, but a clean C15 still produced a 5-second health timeout and a
5.824-second event-loop interval. The remaining automatic finalizer was sizing
2,871 archive candidates on the Gateway in 64-session synchronous batches after
the isolated planner returned.

V2 computes those transcript byte totals in the planner's existing read-only
Worker transaction and forwards the validated map to the native finalizer. A
session with no transcript rows is represented as zero bytes. The finalizer
keeps its native sizing path for explicit maintenance and older callers, while
the automatic path refuses an incomplete or duplicate size map. Late active
admissions filter both the deletion plan and its matching size entry together.
All native materialization, size-bounded batching, delete transactions,
archive publication, lifecycle events, and commit-time revalidation remain in
the owner process.

## Acceptance gates

1. Deterministic queue and planner tests, including archive revalidation and a
   deliberately blocking scan that proves the caller event loop advances.
2. Exact installed-runtime read-only planner and transcript-sizing probe against
   the full Makaron database, with zero mutations and bounded worker exit.
3. Fresh-session C1 before increasing load; then identical min=1 and min=5
   C1/C5/C10/C15 matrices, HTTP/RPC health, event-loop lag, memory, and OOM gates.
4. Three configuration generations, soak, tools/context/Memory, and real Feishu
   receive to visible process/final acceptance before accepting a release.
