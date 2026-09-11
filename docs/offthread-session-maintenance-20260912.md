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

## V3: destructive work waits for admission drain

On V2, C1 and C5 passed, but C10 showed a simultaneous 5.002-second HTTP
timeout and 6.225-second Gateway health response while all 10 replies still
completed correctly. The isolated planner had returned and the native archive
materializer later entered its short deletion transaction while the same store
still had active Agent turns. SQLite's synchronous lock wait could therefore
stall the Gateway even though the read scan and archive encoding were already
off-thread.

V3 lets the read-only planner overlap active work, then waits asynchronously for
that store's native admission registry to become empty before any automatic
archive commit or deletion finalization. The wait polls every 250ms for at most
30 seconds. A continuously busy store skips that best-effort cycle and releases
the coordinator immediately; explicit maintenance is unchanged. Plan snapshots,
late-admission filtering, entry compare-and-swap, transcript snapshot fences,
and final deletion revalidation remain authoritative after the wait.

## V4: bound the Worker result to one native cleanup batch

V3's first fresh C1 still produced a simultaneous 2.448-second health response
when the isolated planner finished. The Agent turn was still admitted, so the
new V3 drain had not entered any archive or deletion write. The pause instead
matched delivery of the complete plan: roughly 2,900 entry snapshots, state
delete snapshots, archive candidates, worktrees, and transcript sizes were
structured-cloned back onto the Gateway event loop at once.

V4 still performs the complete read-only selection and transcript-size scan in
the Worker, but returns only the first batch from the existing native
`buildSessionMaintenanceBatches` policy and at most 64 independent dashboard
archive candidates. Matching byte sizes and worktrees are filtered with the
same identities. Counts describe only the returned work while a compact summary
records the full backlog. Later automatic kicks progressively drain the rest;
the native coordinator already limits successful sweeps to once per minute.

This preserves native session-family grouping, 64 MiB archive boundaries,
entry compare-and-swap, late-admission filtering, and state deletion snapshots.
It bounds the common multi-thousand-session process crossing without moving any
destructive or lifecycle work into the Worker.

## Acceptance gates

1. Deterministic queue and planner tests, including archive revalidation and a
   deliberately blocking scan that proves the caller event loop advances.
2. Exact installed-runtime read-only planner and transcript-sizing probe against
   the full Makaron database, with zero mutations, bounded returned-plan size,
   and bounded worker exit.
3. Fresh-session C1 before increasing load; then identical min=1 and min=5
   C1/C5/C10/C15 matrices, HTTP/RPC health, event-loop lag, memory, and OOM gates.
4. Three configuration generations, soak, tools/context/Memory, and real Feishu
   receive to visible process/final acceptance before accepting a release.
