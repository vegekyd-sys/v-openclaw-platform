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
`tools.sessions.visibility="all"` policy. Session Hotset never replaces this
central directory: `sessions_list`, `sessions_history`, `sessions_send`, A2A,
transcripts and active-run ownership continue to use OpenClaw's native
Gateway mechanisms.

## Candidate

- OpenClaw: `2026.7.1`
- Worker isolation plugin: `0.2.6`
- Worker heartbeats refresh both the Worker liveness watchdog and OpenClaw's
  native command-lane progress lease. Long isolated Subagents therefore do not
  fall out of the native lane at `timeoutMs + 30s` while their foreground tool
  call is still making Worker-level progress.
- The default Subagent runtime budget is aligned to the same six-hour native
  lease (`agents.defaults.subagents.runTimeoutSeconds=21600`). Explicit tool
  cancellation still wins, while the Worker stall watchdog remains 120s.
- Worker count: elastic from one warm worker to three workers
- Sessions per worker: at most three active, distinct sessions
- Total active-session capacity: `3 workers x 3 sessions = 9`
- Same-session turns: sticky and serialized inside one worker
- Different sessions in the same worker use distinct OpenClaw global lanes;
  repeated turns for one session still use the same per-session lane
- Defaults: `minWorkers=1`, `maxWorkers=3`,
  `sessionsPerWorker=3`, `idleTimeoutMs=180000`
- OpenClaw Gateway parent-session concurrency:
  `agents.defaults.maxConcurrent=10`; this admits a full 5 main + 5 child
  composite load into the Harness while the Worker pool still limits actual
  execution to `3 workers x 3 sessions = 9`
- Subagent concurrency: `agents.defaults.subagents.maxConcurrent=8`, preserving
  V's existing subagent capacity
- vLab host capacity: 4 vCPUs, `CPUQuota=400%`, `MemoryHigh=5G`,
  `MemoryMax=6G`
- Integration: OpenClaw plugin API plus the stable
  `dist/plugin-sdk/agent-runtime.js` entrypoint
- Feature switch: enable or disable the
  `vlab-agent-worker-isolation` plugin
- Long Agent runs publish a `run.progress` heartbeat from their Worker back to
  the Gateway every 15 seconds. This preserves OpenClaw's native stuck-session
  diagnosis without treating Feishu's 300-second per-chat queue cap as an
  Agent lifetime.
- OpenClaw 2026.7.1's 600-second default attempt budget is not allowed to cap
  a healthy Worker run. `nativeRequestTimeoutMs` defaults to six hours; a
  deliberately longer upstream deadline is preserved, and explicit
  AbortSignal cancellation remains authoritative.
- `requestStallTimeoutMs=120000` is a separate Worker-process liveness
  watchdog. Every Worker heartbeat refreshes it, so a healthy long model or
  foreground tool run is not terminated merely because its wall time passed
  ten minutes.
- A real request deadline first sends an AbortSignal to that request only. If
  it does not unwind, the Worker is quarantined: the expired request is
  detached, sibling Sessions drain on the same PID, and only then is the
  Worker replaced. Immediate process kill is reserved for a missing-heartbeat
  Worker stall, where the whole process is already unhealthy.
- The Worker process loads its private runtime overlay from
  `workerConfigPath`, but OpenClaw's `resolve_exec_env` hook gives Agent
  `exec` commands the Gateway's `gatewayConfigPath`. Global CLI changes made
  inside a Worker therefore update the Gateway control-plane config instead of
  silently mutating the runtime overlay.
- Worker IPC preserves OpenClaw's native terminal semantics for
  `sessions_yield`, hosted client-tool calls, accepted subagent spawns,
  async-started tools, cron additions, message-tool delivery, and media-only
  replies. These are not treated as empty or incomplete turns.
- Pool ownership is keyed by the native transcript session ID, separately from
  the channel dispatch key. A synthetic subagent completion announce and its
  active parent therefore cannot write the same transcript concurrently.
- A dispatch whose session ID became stale after compaction is rebound to the
  latest native session before its first execution. The existing one-time
  admission retry remains as a race fallback and never replays a post-tool
  failure.
- Session Hotset retains every Session identity, transcript pointer, route,
  compaction checkpoint and plugin state. After 180 seconds of inactivity it
  evicts only `skillsSnapshot` and `systemPromptReport`; OpenClaw's native
  reply path rebuilds them when that Session is activated again.
- Pre-start projection makes an existing large store lightweight. OpenClaw's
  native full-store persistence path applies the same projection again without
  changing the concurrency-sensitive single-entry write path.
- Worker and isolated-subagent Skill activations preserve OpenClaw's native
  `skill.used` accounting. The Worker resolves the exact Skill file from the
  admitted `skillsSnapshot`, relays only identity metadata through the existing
  acknowledged Worker-to-Gateway channel, and the Gateway writes the event
  through OpenClaw's trusted diagnostic API into the central `skill_usage`
  ledger. No prompt, transcript, tool input, or tool output is copied into the
  telemetry event. Event IDs are deduplicated before acknowledgement.

After activation, operators can snapshot a baseline and inspect cumulative or
post-baseline counts without reading transcripts:

```bash
node skill-usage-report.mjs \
  --db /path/to/state/openclaw.sqlite \
  --write-baseline /path/to/skill-usage-baseline.json

node skill-usage-report.mjs \
  --db /path/to/state/openclaw.sqlite \
  --baseline /path/to/skill-usage-baseline.json
```

The Hotset persistence hook is an exact, version-gated patch for OpenClaw
`2026.7.1`. Activation backs up the original bundle and installs a systemd
drop-in; rollback restores that bundle and removes the drop-in. A bundle shape
or OpenClaw version mismatch fails before activation.

## Config-domain acceptance

Run the real Worker-to-exec smoke after activation:

```bash
/tmp/vlab-agent-worker-config-domain.sh
```

The smoke temporarily changes `skills.workshop.maxSkillBytes` from inside a
Worker Agent, verifies the value through Gateway `config.get`, proves the
Worker overlay remained byte-for-byte unchanged, and then restores the
original Gateway value.

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
19. A native Agent run remains active past 300 seconds, emits Gateway-visible
    Worker progress, completes with its expected transcript marker, and is not
    aborted by `active_work_without_progress`.
20. Timing out one request on a three-session Worker leaves the other two
    requests running to completion on the same Worker PID.
21. A parent spawns an isolated child, remains active until the child
    completes, then calls `sessions_yield`; the queued completion announce
    resumes the parent with a visible reply and no incomplete-turn card or
    transcript takeover.
22. A store with at least 500 Sessions keeps the same directory count while
    cold `readSessionEntry` latency and heap allocation improve over `0.1.7`.
23. One active Session can use native `sessions_list` and `sessions_history`
    to inspect a simultaneously running sibling Session.
24. Reading the same known Skill through native Gateway, isolated Worker, and
    isolated Subagent paths increments the same central OpenClaw usage ledger
    exactly once per activation; Worker retries do not duplicate counts.
25. `vlab.workers.status` reports zero Skill telemetry failures and unmatched
    Skill identities before promotion.

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

Harness semantic parity acceptance covers the v0.1.7 incident path:

```bash
/tmp/vlab-agent-worker-harness-parity.sh
```

Worker/native user-visible parity is a versioned contract, not an informal
checklist. `harness-event-contract.mjs` classifies every callback exposed by
the native Agent Harness as one of:

- bridged through Worker IPC with ordered async backpressure;
- retained by the Gateway as lifecycle control; or
- unclassified, which sets `productionPromotionBlocked=true`.

`worker-stream-parity.test.mjs` compares the complete native and Worker event
traces and verifies callback-failure cleanup. The real vLab promotion probe:

```bash
node /tmp/vlab-agent-worker-stream-parity.mjs
```

must observe `onPartialReply` on the native `chat.send` path, zero event relay
failures, zero unclassified callbacks, and no Gateway restart. This contract
must be rerun whenever OpenClaw is upgraded so new Harness behavior cannot
silently bypass Worker isolation.

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
