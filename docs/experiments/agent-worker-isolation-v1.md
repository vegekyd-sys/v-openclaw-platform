# Agent Worker Isolation v1

## Goal

Prove in vLab that one Gateway can keep control-plane RPC responsive while
sticky child-process workers run agent workloads on separate CPU cores.
Workers scale out only when simultaneous session work requires them and return
to one warm process after the configured idle timeout.

This experiment does not change private V and does not route production
channels. It adds vLab-only Gateway methods:

- `vlab.workers.status`
- `vlab.workers.ping`
- `vlab.workers.cpu`
- `vlab.workers.hold`
- `vlab.workers.agent`
- `vlab.workers.start`
- `vlab.workers.operation`
- `vlab.workers.cancel`
- `vlab.workers.kill`

Only synthetic session keys beginning with
`agent:makaron:explicit:vlab-worker-` are accepted.
They are normalized to lowercase before native OpenClaw session lookup and
dispatch, matching OpenClaw's canonical session-key format.

The vLab experiment sets OpenClaw's existing
`tools.sessions.visibility="agent"` policy. This lets one `makaron` session
inspect another `makaron` session through `sessions_list` and
`sessions_history` without enabling unrestricted cross-agent visibility or
introducing a separate worker registry.

## Candidate

- OpenClaw: `2026.7.1`
- Worker count: elastic from one warm worker to three workers
- Sessions per worker: at most three active, distinct sessions
- Total active-session capacity: `3 workers x 3 sessions = 9`
- Same-session turns: sticky and serialized inside one worker
- Different sessions in the same worker use distinct OpenClaw global lanes;
  repeated turns for one session still use the same per-session lane
- Defaults: `minWorkers=1`, `maxWorkers=3`,
  `sessionsPerWorker=3`, `idleTimeoutMs=180000`
- OpenClaw Gateway parent-session concurrency:
  `agents.defaults.maxConcurrent=9`, one above V's existing value of 8 so the
  native dispatch path can fill all `3 workers x 3 sessions` slots
- Subagent concurrency: `agents.defaults.subagents.maxConcurrent=8`, preserving
  V's existing subagent capacity
- vLab host capacity: 4 vCPUs, `CPUQuota=400%`, `MemoryHigh=5G`,
  `MemoryMax=6G`
- Integration: OpenClaw plugin API plus the stable
  `dist/plugin-sdk/agent-runtime.js` entrypoint
- Feature switch: enable or disable the
  `vlab-agent-worker-isolation` plugin

The plugin does not patch OpenClaw's compiled files.

## Acceptance

1. One warm worker is ready behind the running vLab Gateway.
2. Nine simultaneous sessions create three workers, with exactly three active
   sessions in each worker.
3. Work for the same active session stays on one worker and is serialized.
   Different sessions assigned to that worker execute concurrently instead of
   sharing OpenClaw's default `main` lane.
4. A tenth simultaneous session waits without creating a fourth process.
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
13. Nine synthetic sessions run continuously on three workers without a queue
   while Gateway event-loop health remains non-degraded.
14. Samples record Gateway `MemoryCurrent`, `MemoryPeak`, CPU core ratio,
   Event Loop utilization/P99/max delay, worker RSS/CPU, active sessions,
   pending sessions, and restart count.
15. Killing a worker with an active Agent turn fails the in-flight operation;
   the same idempotency key returns that terminal failure and does not
   automatically replay the turn.
16. Cancelling an active Agent turn propagates an `AbortSignal` into
   `agentCommand` and reaches a terminal `cancelled` state.
17. Recovery requires an explicit new idempotency key and succeeds on a
   replacement worker.
18. One worker accepts eight `sessions_spawn` calls, reports all eight
   subagents simultaneously running, and records all eight child completion
   markers without a Gateway restart or Event Loop degradation.

The production-shaped soak is executable on vLab:

```bash
VLAB_SOAK_SESSION_COUNT=9 \
VLAB_SOAK_ROUNDS=2 \
VLAB_SOAK_TOOL_HOLD_SECONDS=30 \
/tmp/vlab-agent-worker-soak.sh
```

It runs 18 real OpenClaw Agent turns across nine native sessions with an active
workload window of roughly three to five minutes. Every turn must perform a real read-only `exec` tool
call, session IDs must remain stable across rounds, all nine sessions must be
visible through native `sessions.list` and `chat.history`, Gateway event-loop
health must remain non-degraded, and the Gateway restart count must not change.
The report separates active workload duration from setup and post-run native
history validation, and includes sampled resource and queue maxima.

Fault acceptance uses real Agent turns:

```bash
/tmp/vlab-agent-worker-faults.sh
```

Subagent capacity acceptance preserves V's existing `8/8` limits:

```bash
/tmp/vlab-agent-worker-subagents.sh
```

## Deploy and rollback

Deploy only a clean committed candidate:

```bash
VLAB_WORKER_MIN_COUNT=1 \
VLAB_WORKER_COUNT=3 \
VLAB_WORKER_SESSIONS_PER_WORKER=3 \
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

Because the current OpenClaw session index is shared by all processes, each
worker completion is checked and, when necessary, merged back through
OpenClaw's native `api.runtime.agent.session.upsertSessionEntry` API on the
Gateway. These native writes are serialized, but only the completed session is
checked; the Gateway does not repeatedly rescan every prior completion.
Transcripts remain OpenClaw's per-session JSONL files; no parallel session
owner or database is introduced.

The native saturation gate also probes Gateway health and worker-status RPC
latency throughout the 3 workers x 3 sessions run. A single transient degraded
event-loop sample is recorded but does not fail the run; consecutive degraded
samples or a control-plane RPC slower than 3 seconds do. This distinguishes a
brief CPU spike from a Gateway that is actually preventing unrelated sessions
or channel ingress from being received and registered.
Queue depth is reported separately for elastic scale-up and steady-state
saturation: a request may wait briefly while a worker process starts, but once
3 x 3 is reached the steady-state pending count must remain zero.

For the sustained gate, set `VLAB_NATIVE_TOOL_HOLD_SECONDS=180`. This keeps all
nine native sessions active for roughly three minutes while retaining the same
control-plane, memory, event-loop, transcript, and idempotency assertions.

Scale-in first sends `SIGTERM`, then uses a bounded forced exit if an Agent
Runtime plugin keeps the child event loop alive. A retiring process therefore
cannot occupy a worker slot forever and block queued sessions from scaling out.

The custom `vlab.workers.*` methods remain diagnostic and fault-injection
probes. Normal WebChat and channel traffic now enters through OpenClaw's
native Agent Harness selection, where the `vlab-worker` Harness submits the
turn to the elastic pool. Each child invokes the stable native `agentCommand`
entry point against the same OpenClaw state directory, session key, and
session id. The child owns the native transcript write and returns an
`AgentHarnessAttemptResult` to the Gateway for ordinary reply delivery.

`integration.nativeAgentHarnessDispatchAttached=true` proves registration,
not production readiness by itself. The vLab candidate now reports
`productionPromotionBlocked=false` because native `chat.send` 3x3 saturation,
idempotent retry, cancellation, active-worker crash recovery, resource
monitoring, and rollback/redeploy acceptance passed. This marks the candidate
eligible for a separately authorized production change; it does not deploy or
restart production V.
