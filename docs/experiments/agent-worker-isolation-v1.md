# Agent Worker Isolation v1

## Goal

Prove in vLab that one Gateway can keep control-plane RPC responsive while
sticky child-process workers run agent workloads on separate CPU cores.
Workers scale out only when simultaneous session work requires them and return
to one warm process after the configured idle timeout.

This experiment does not change private V and does not route production
channels. It adds five vLab-only Gateway methods:

- `vlab.workers.status`
- `vlab.workers.ping`
- `vlab.workers.cpu`
- `vlab.workers.hold`
- `vlab.workers.agent`

Only synthetic session keys beginning with
`agent:makaron:explicit:vlab-worker-` are accepted.

## Candidate

- OpenClaw: `2026.7.1`
- Worker count: elastic from `minWorkers` to `maxWorkers`
- Defaults: `minWorkers=1`, `maxWorkers=2`, `idleTimeoutMs=180000`
- vLab concurrency acceptance: `minWorkers=1`, `maxWorkers=8`
- Integration: OpenClaw plugin API plus the stable
  `dist/plugin-sdk/agent-runtime.js` entrypoint
- Feature switch: enable or disable the
  `vlab-agent-worker-isolation` plugin

The plugin does not patch OpenClaw's compiled files.

## Acceptance

1. One warm worker is ready behind the running vLab Gateway.
2. Simultaneous sessions create additional workers up to `maxWorkers`.
3. Work for the same active session stays on one worker and is serialized.
4. Work above `maxWorkers` waits without creating extra processes.
5. Idle workers exit safely until only `minWorkers` remain.
6. Gateway health remains non-degraded during overlapping jobs.
7. Two synthetic agent sessions can run real model calls without sharing
   context or duplicating terminal replies.
8. The worker result resolves the same native OpenClaw `sessionKey` and
   `sessionId` visible through `sessions.list` and history.
9. Existing `sessions_list`, `sessions_history`, and `sessions_send` remain the
   only cross-session discovery and communication mechanisms.
10. A bounded write/read/delete tool probe leaves no file residue.
11. Gateway restart count, worker count, and memory remain bounded.
12. Restoring the saved config removes the plugin RPC methods while base
   Gateway health, model execution, tools, memory, and copied sessions remain
   valid.
13. With eight workers, eight synthetic sessions run
   continuously without a worker queue while Gateway event-loop health remains
   materially better than the same workload on the core Gateway path.

## Deploy and rollback

Deploy only a clean committed candidate:

```bash
VLAB_WORKER_MIN_COUNT=1 \
VLAB_WORKER_COUNT=8 \
VLAB_WORKER_IDLE_TIMEOUT_MS=180000 \
scripts/deploy-agent-worker-experiment.sh
```

Rollback on the vLab host:

```bash
/tmp/rollback-agent-worker-experiment.sh
```

The activation script stores the exact previous vLab config path in the
server-side experiment manifest. No mutable state, credential, session, or
backup is committed to Git.

## Session boundary

The worker pool does not create a second session database or transcript
registry. OpenClaw's native session key, store, history, visibility rules, and
`sessions_*` tools remain authoritative. The pool owns only ephemeral
`sessionKey -> worker process` routing while work is active; the mapping is
discarded when the active burst ends and can be rebuilt after a worker exit.

The custom `vlab.workers.*` methods are vLab experiment probes. Production
promotion must attach execution isolation to OpenClaw's native dispatch/runtime
seam instead of exposing a second user-facing agent/session API.
