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

## V5: require a cross-process quiet window

V4 bounded the plan transfer, but clean C10 still produced one 5.002-second HTTP
timeout and a 6.375-second event-loop interval. Repeating C10 with four resident
Workers removed process creation but retained the stall. Holding only the
data-free automatic-maintenance coordinator for the same four-Worker C10 reduced
first-text P50/P95 to 10.137/12.145 seconds, kept HTTP and RPC errors at zero,
and bounded the event-loop interval to 0.536 seconds. Automatic maintenance,
not Worker residency or model latency, remained the causal difference.

V5 acquires that coordinator only to elect one maintenance process, then waits
for 30 continuous seconds with no local admission and no change to the Agent
database or WAL. Database/WAL identity, size, nanosecond modification time, and
change time form the cross-process activity fingerprint; SHM is excluded because
readers legitimately update it. The wait is bounded to five minutes and never
blocks a foreground write.

During the isolated scan, the owner polls the same fingerprint every 100ms. The
scan runs in a niceness-10, 512 MiB-capped subprocess so synchronous SQLite work
can be terminated at the operating-system boundary. A new write from any
Gateway or Worker terminates the read-only planning process;
local admission also interrupts it before that admission's first database write.
This interruption is an expected best-effort deferral and is not logged as a
maintenance failure. The next committed reply re-kicks maintenance, while all
explicit maintenance behavior remains unchanged.

## V6: retry an interrupted sweep without requiring another write

Installed V5 evidence showed the intended foreground isolation: a hot C1
returned first text in 2.99 seconds with HTTP max 129 ms, then the niceness-10
planner started only after the 30-second quiet window. However, a foreground
interruption released the coordinator immediately and removed the in-process
owner. With no later write there was no new kick, so the existing backlog did
not resume.

V6 keeps the same owner only when an expected foreground interruption, a
post-plan database/WAL change, or an admission-drain timeout occurs and the
owner is still current. It releases the coordinator, waits for a fresh full
quiet window, and retries without requiring another session write. Stale
owners, closed databases, coordinator contention, and unexpected failures keep
their previous bounded best-effort exits. Every retry still re-plans from a new
read-only snapshot and passes all late-admission, exact-entry, archive, and
deletion revalidation gates.

## V7: preserve one file-backed owner across handle rotation

V6 proved that the interrupted planner's owner was already stale: the retry
branch did not run even though the Gateway remained healthy and no later sweep
started. The queue previously coalesced only when the cached SQLite handle was
the same JavaScript object. During a 30-second wait, a handle rotation could
therefore replace the owner while the old owner still held the cross-process
coordinator. The replacement observed the coordinator as busy and removed
itself; the old owner then observed itself as stale. Both exits were individually
safe, but together they lost the background retry.

V7 coalesces a new kick into the existing owner when both resolve to the same
file-backed physical database path, rebinding the owner to the current open
handle and advancing its generation. Incognito owners continue to require exact
database-object identity. Tests cover both boundaries. This changes no
coordinator, quiet-window, plan, transaction, or lifecycle revalidation rule.

## V8: detach file ownership from the cached SQLite handle

Installed V7 proved that same-path kick coalescing was necessary but not
sufficient. The first isolated planner still exited after about 1.8 seconds and
never retried even though no replacement owner existed. The cached SQLite handle
that originally queued maintenance can close without a later write/rebind; V7's
`isCurrent` therefore still retired a valid physical-store owner mid-scan.

V8 treats a file-backed automatic-maintenance owner as current while its exact
map entry owns the same resolved store path. The quiet wait and planner require
no live cached handle. Coordinator acquisition and cooldown may likewise outlive
that handle because the lock lives in a separate, data-free sidecar keyed by the
owned absolute path. Any archive write explicitly reopens the current database
under the native writer lane, and final cleanup already opens fresh handles and
revalidates exact snapshots at commit. Incognito work remains live-handle scoped.

The installed V7 process table also exposed that the intended lower CPU priority
had not reached the spawned Node process (`NI=0`). V8 executes the bounded planner
through `/usr/bin/nice -n 10` on Unix while preserving the same IPC channel and
512 MiB heap cap. This affects only the isolated read-only planner subprocess.

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
