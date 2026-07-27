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
They are normalized to lowercase before native OpenClaw session lookup and
dispatch, matching OpenClaw's canonical session-key format.

## Candidate

- OpenClaw: `2026.7.1`
- Worker count: elastic from `minWorkers` to `maxWorkers`
- Defaults: `minWorkers=1`, `maxWorkers=2`, `idleTimeoutMs=180000`
- vLab concurrency acceptance: `minWorkers=1`, `maxWorkers=8`
- vLab host capacity: 4 vCPUs, `CPUQuota=400%`, `MemoryHigh=5G`,
  `MemoryMax=6G`
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

The production-shaped soak is executable on vLab:

```bash
VLAB_SOAK_SESSION_COUNT=8 \
VLAB_SOAK_ROUNDS=3 \
VLAB_SOAK_TOOL_HOLD_SECONDS=30 \
/tmp/vlab-agent-worker-soak.sh
```

It runs 24 real OpenClaw Agent turns across eight native sessions for roughly
three to four minutes. Every turn must perform a real read-only `exec` tool
call, session IDs must remain stable across rounds, all eight sessions must be
visible through native `sessions.list` and `chat.history`, Gateway event-loop
health must remain non-degraded, and the Gateway restart count must not change.

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

Because the current OpenClaw session index is shared by all processes, worker
completion metadata is merged back through OpenClaw's native
`api.runtime.agent.session.upsertSessionEntry` API on the Gateway. These native
writes are serialized and replay all completed synthetic sessions after every
completion, preventing concurrent child processes from losing an index entry.
Transcripts remain OpenClaw's per-session JSONL files; no parallel session
owner or database is introduced.

Scale-in first sends `SIGTERM`, then uses a bounded forced exit if an Agent
Runtime plugin keeps the child event loop alive. A retiring process therefore
cannot occupy a worker slot forever and block queued sessions from scaling out.

The custom `vlab.workers.*` methods are vLab experiment probes. Production
promotion must attach execution isolation to OpenClaw's native dispatch/runtime
seam instead of exposing a second user-facing agent/session API.
