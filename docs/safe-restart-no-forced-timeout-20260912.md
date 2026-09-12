# Safe restart must not become a forced restart

## Problem

The OpenClaw-aware `gateway restart --safe` path and the restart-required config reload path both waited for active work for five minutes, then emitted a forced restart intent. On a busy Gateway this could interrupt admitted turns, queued work, embedded runs, and pending replies even though the operator selected the safe path.

## Policy

- A safe restart waits until the active-work count reaches zero. It has no automatic escalation deadline.
- A restart-required config reload follows the same rule.
- An immediate restart remains available only through the existing explicit `--force` operator action.
- Ordinary update drain timeouts, listener health waits, channel reload behavior, restart admission, reply drain, and signal fencing are unchanged.
- The existing 30-second still-pending diagnostics remain active while a restart is deferred.

## Implementation

The two Gateway-restart callers now pass an unbounded `maxWaitMs` and no `timeoutIntent`. The shared CLI help and acknowledgement text state the same behavior. The generic deferral helper still supports bounded callers, so this patch does not change unrelated lifecycle policy.

Artifacts are generated mechanically from the exact shared-VLab runtime hashes in `lab/safe-restart-no-forced-timeout-plan.json`. The builder rejects release or hash drift before producing output.

## Verification before merge

- Patch-contract tests cover both restart call sites, anchor drift, and operator-facing text.
- Generated JavaScript files pass `node --check`.
- All registered non-platform offline tests pass.
- Re-running the builder produces byte-identical artifacts and plan.

## Required live acceptance after explicit merge approval

1. Deploy the exact staged artifact to shared VLab under the integration lease.
2. Start a controlled, cancellable blocker and request `--safe` restart.
3. Hold the blocker beyond the configured legacy timeout; verify PID stability, no SIGUSR1, and still-pending diagnostics.
4. Drain the blocker; verify exactly one restart, healthy recovery, and no lost terminal reply.
5. Repeat the timeout portion for a restart-required config reload, then revert the test config.
6. Verify explicit `--force` still restarts immediately in the isolated acceptance window.

No production deployment is part of this source candidate.
