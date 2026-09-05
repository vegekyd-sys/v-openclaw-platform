# Steer 9.1 repair candidate

Branch: `codex/steer91-repair`; integrated in `codex/steer91-integration`.
Worker release: 0.2.11 (same functional code as accepted 0.2.11-rc.1).
Status: private Worker, real Feishu integration, and production V Backup canary passed.

## Confirmed causes

- Production's installed Feishu 9.1 monitor serializes same-chat turns before native Steer admission. Environment flags and queue.mode=steer alone cannot bypass this queue. Read-only copies of the earliest available Sep 5 03:41 backup and subsequent 10:29/11:12 backups all lack the admission patch. This does not establish a unique later update as the cause.
- The legacy Worker proxy registers an embedded run but not the 9.1 Reply Operation backend. It rejects transcript-commit waiting and uses the deprecated synchronous eligibility API in the child. A real private Gateway test reproduced a second request failing to change the original active turn.

## Changes

- Port the existing Feishu active-run ingress patch to 9.1. Preserve the 300-second transport cap, permission checks, ingress adoption/abandonment, and existing display patches.
- Suppress the extra empty-reply warning only when native dispatch confirms `deferredToActiveRun=steer`, not merely because a request used the active-run transport lane.
- Attach the Worker proxy to the original native Reply Operation. Invoke the actual native child run's asynchronous queue method, preserving its authority fingerprint and readiness checks.
- Relay queue acceptance, native persisted transcript receipt and final commit outcome separately. Keep callback functions and authoritative recorder on the Gateway; transfer only validated data over IPC.
- Use native transcript waiting deadlines, forward cancellation to the specific pending injection, and return unconfirmed settlement after acceptance loss rather than replaying accepted input.
- Do not advertise image injection support. Unsupported capabilities retain native fallback rather than silently weakening checks.

## Evidence

- 43 scoped local tests passed against the actual read-only production Feishu bundle, Worker proxy, IPC receipts, native data/registry parity and legacy worker harness fixture.
- Private instance `steer91`, port 26160, own state/config/HOME/runtime, no channels or cron.
- 2026-09-06 02:51:59–02:52:42 CST: actual DeepSeek + Worker + exec task adopted the changed target; original marker absent.
- 2026-09-06 03:00:19–03:00:55 CST: repeated actual tool-boundary injection passed, exactly two user transcript messages, exactly one Worker attempt, original and injected run handles settled normally.
- Private native /stop and same-session next turn: 03:06:52–03:06:59 CST passed. The test uses one native requester connection; a separate disposable CLI connection is correctly denied ownership, not worked around with elevated privileges.
- Real Feishu Worker: A received/dispatch 03:12:04, B received/dispatch 03:13:01 while A active, B accepted with no own final 03:13:05, original run emitted only `FEISHU_WORKER_STEER_OK_0312`. Visible card `om_x100b66f2d20ecca8b32e80ab97c5bd5`; exactly one Worker attempt, no failed attempts, no extra empty-reply warning.
- Real Feishu Codex: A 03:14:59, actual bash sleep 60 at 03:15:16, B received/dispatch 03:15:55, accepted 03:16:02, original completed 03:16:19. Visible card `om_x100b66f2eae974a4b11551299b47bd8` contains only `FEISHU_CODEX_STEER_OK_0314` and Runtime codex. No original result or empty warning.
- Real Feishu /stop: 03:20:26 actual foreground-tool boundary; stop sent and original run released 03:20:28; same-session next visible reply `STOP_NEXT_OK_1788636012677` at 03:20:48. A prior manual 45-second test expired before stop was sent and is not counted as stop acceptance.
- Test-only per-session Codex model override restored to null; default agent/model, business bindings, permissions and concurrency never changed.

## Release boundary

Shared VLab was acquired through explicit Browser lease handoff; its changes are reverted before returning the window. Production deployment must preserve other plugins/config and install from exact candidate with pre-change hashes and rollback. Do not reset business sessions or widen tool permissions. Native code remains 9.1; no core bundle is changed beyond the Feishu transport adapter. A startup check reapplies the reviewed adapter to installed Feishu 9.1 generations; future versions require explicit migration review.

## Production acceptance — 2026-09-06 CST

- Exact release commit `0c3efefcc0623c8282a35a8bda298586ae9ded64`, archive SHA-256 `b4dfa8d62fa975b43b23ee9fbe1e50de01d7cd60a514bbf766b3f2f5e5e824a0`.
- 03:23:20 preflight: health ok, no active sessions/Worker work/pending/queued. Verified old Worker hashes and unchanged capability manifest.
- 03:23:46 and 03:23:51 repeated idle checks. 03:23:52 restart after validated, backed-up configuration changes.
- Gateway PID 1171400 -> 1213009. Worker 0.2.11, NRestarts=0; Feishu connected and existing channels recovered. Startup Steer recheck reported changed=false, proving idempotence.
- V Backup: original message `om_x100b66f2825728a0c388191e188f0d8`, receive 03:26:02.564, dispatch 03:26:02.781. Existing session/runtime/model preserved.
- During actual exec/process tool execution, Steer message `om_x100b66f29ff9b8a8c43b1d92c9ef616` received 03:27:15.694, dispatched 03:27:15.704. Injection settled with zero standalone replies 03:27:25.740. Original run completed 03:27:37.804 with one final reply.
- Visible card `om_x100b66f29cb710a4b174f862caa59ca` replies to the ORIGINAL message and contains `V_STEER_OK_1788636358641`, Runtime vlab-worker. No old-result marker or empty-reply warning. Native counters admitted=1/completed=1/workerAttempts=1/failed=0; pending=0, all Workers idle afterward.
- First history read returned native retryable `session history is rebuilding`; fixed the read-only observer to honor retryAfterMs and resumed the SAME canary manually. No duplicate first message or session reset. Do not describe the original observer process as having passed automatically.
- Shared VLab restored to Worker 0.2.10, original Feishu file and modelOverride=null. Temporary Steer environment drop-in removed. Lease released at 03:22:41 and explicitly handed to Browser repair.

### Rollback

Preserved old Worker: `/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.10-5f9e136`.
Backup: `/home/openclaw/.openclaw/backups/steer91-0.2.11-20260906`.

On production through management Tailscale SSH:

```sh
sudo /opt/node-v22.23.1/bin/node /home/openclaw/.openclaw/backups/steer91-0.2.11-20260906/deploy.mjs rollback
```

The rollback checks for active work and file drift, restores only the Worker load paths (preserving later unrelated config changes), restores Feishu's pre-Steer file, removes the new Steer prestart hook, and restarts the same Gateway. Recheck channels and visible reply afterward. Never run an old doctor --fix or reset business sessions to roll back Steer.
