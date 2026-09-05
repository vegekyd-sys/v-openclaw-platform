# Steer 9.1 repair candidate

Branch: `codex/steer91-repair`. Worker candidate: 0.2.11-rc.1.
Status: private Worker passed; real Feishu integration and production not yet accepted.

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
- These RPC tests are not real Feishu acceptance. Pending: Feishu Worker/Codex visible reply, repeated steer, /stop + next message, and production canary.

## Release boundary

No production Steer mutation so far. Shared VLab requires explicit integration lease handoff from Browser repair. Keep `productionPromotionBlocked=true` until channel acceptance. Production deployment must preserve other plugins/config and install from exact candidate with pre-change hashes and rollback. Do not reset business sessions or widen tool permissions.
