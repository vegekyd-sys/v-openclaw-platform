# Worker runtime readiness candidate 2026-09-12

## Observed cause

On the shared VLab, a restarted Worker with one resident process completed a
first unique-session reply in 14.503 s, while the next unique session on the
same process completed in 3.820 s. The first request spent 5.383 s acquiring
the process-local prepared runtime. During elastic C5/C10/C15 runs, each newly
spawned process repeated that one-time cost; the slowest C15 requests (24.628–
27.609 s) were all assigned to the newest Worker.

IPC and pool queueing were not the cause: the cold C1 reached the Worker about
3 ms after pool submission. Native and Worker both retain per-session
preparation costs, but only Worker expansion adds a fresh process runtime to an
already admitted request.

## Candidate

`OPENCLAW_WORKER_EAGER_PREPARE=1` now acquires and releases the same static
prepared-runtime lease before a child reports `ready`. It imports no new
business data and does not issue an Agent, model, or tool request. Preparation
has a bounded timeout (`OPENCLAW_WORKER_EAGER_PREPARE_TIMEOUT_MS`, default 30 s,
clamped to 1–180 s). Failure is fail-open: the Worker reports
`deferred-to-normal-turn` and preserves the old first-request behavior.

The sanitized readiness result is included in `vlab.workers.status`, so an
operator can distinguish a genuinely prepared process from a merely forked
one. The feature remains opt-in until same-background VLab acceptance is
complete.

## Release and rollback

The plan `lab/worker-runtime-readiness-plan.json` changes only the Worker child,
the static prewarm helper, and Worker status propagation. It is based on the
unaccepted `worker-coldstart-longterm-20260912-v1` VLab candidate. Rollback is
the normal VLab artifact rollback plus removal of the VLab-only systemd
environment flag. Production V is outside this candidate and remains
unchanged.
