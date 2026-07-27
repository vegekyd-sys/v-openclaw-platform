# Agent Worker Isolation v1

## Goal

Prove in vLab that one Gateway can keep control-plane RPC responsive while
sticky child-process workers run agent workloads on separate CPU cores.

This experiment does not change private V and does not route production
channels. It adds four vLab-only Gateway methods:

- `vlab.workers.status`
- `vlab.workers.ping`
- `vlab.workers.cpu`
- `vlab.workers.agent`

Only synthetic session keys beginning with
`agent:makaron:explicit:vlab-worker-` are accepted.

## Candidate

- OpenClaw: `2026.7.1`
- Worker count: configurable from `2` to `16`; deploys default to `2`
- Integration: OpenClaw plugin API plus the stable
  `dist/plugin-sdk/agent-runtime.js` entrypoint
- Feature switch: enable or disable the
  `vlab-agent-worker-isolation` plugin

The plugin does not patch OpenClaw's compiled files.

## Acceptance

1. Two worker PIDs are ready behind the running vLab Gateway.
2. Two 5-second CPU jobs on different sticky slots overlap and complete in
   less than 8 seconds wall time.
3. A ping on Worker B completes in less than 1 second while Worker A is CPU
   bound.
4. Gateway health remains non-degraded during the overlapping jobs.
5. Two synthetic agent sessions can run real model calls without sharing
   context or duplicating terminal replies.
6. A bounded write/read/delete tool probe leaves no file residue.
7. Gateway restart count, worker count, and memory remain bounded.
8. Restoring the saved config removes the plugin RPC methods while base
   Gateway health, model execution, tools, memory, and copied sessions remain
   valid.
9. With eight workers, eight synthetic sessions mapped to distinct slots run
   continuously without a worker queue while Gateway event-loop health remains
   materially better than the same workload on the core Gateway path.

## Deploy and rollback

Deploy only a clean committed candidate:

```bash
VLAB_WORKER_COUNT=8 scripts/deploy-agent-worker-experiment.sh
```

Rollback on the vLab host:

```bash
/tmp/rollback-agent-worker-experiment.sh
```

The activation script stores the exact previous vLab config path in the
server-side experiment manifest. No mutable state, credential, session, or
backup is committed to Git.
