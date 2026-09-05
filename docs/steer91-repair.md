# Steer 9.1 repair candidate

Branch: `codex/steer91-repair`; integrated in `codex/steer91-integration`.
Worker release: 0.2.11 (same functional code as accepted 0.2.11-rc.1).
Status: private Worker and real Feishu integration passed; production not yet deployed.

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

- 35 scoped local tests passed against the actual read-only production Feishu bundle, Worker proxy, IPC receipts and legacy worker harness fixture.
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
