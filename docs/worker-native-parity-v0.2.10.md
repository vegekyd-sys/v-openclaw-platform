# Worker 0.2.10 — scoped 9.1 parity repair

2026-09-05 Asia/Shanghai. Supersedes the unresolved gates in the RC.1 report.
Functional candidate: 6a9393930676963f2338d8de006cccd0da0d761c.
Release changes after that candidate only adjust version and acceptance metadata.
Production deployment/acceptance is recorded separately below, not implied by this report.

## Fixes

- RC.1 native per-attempt channel registry and plain-data Harness transport,
  retaining explicit ownership, authority and opaque callback boundaries.
- Initialize native prepared hooks (already separately deployed to V).
- Defer nested Worker `end/error` callback notifications to `finishing`.
  The native Gateway backstop must publish the real terminal lifecycle event.
  Previously it interpreted the callback as an already-published terminal event,
  leaving text and media-only sessions persistently `running` after completion.
  No direct Session status writes or new recovery-state system are introduced.
- Browser configuration delta: exact native allowedHostnames `localhost` and
  `192.168.1.50` for the user's requested existing local pages. No blanket private
  network permission; other private addresses and metadata endpoints remain denied.

## VLab evidence

- 139 local unit/contract/process-IPC tests passed (not 139 live workloads).
- Private instance `astra` native 9.1 backstop comparison: old callback suppresses
  publication, fixed callback permits exactly one; cancellation and paused/yield
  metadata retained. No Gateway/session writes in that probe.
- 17:31 R13 native TTS: Feishu `audio`, 2 seconds.
- 17:33 active R14 `/stop`: aborted, no task final; R15 exec + audio afterward.
- R15 initially failed restart gate: audio delivered but status `running`, restart
  17:36 started recovery. R16 plain-text control also remained `running`.
- 17:52–17:53 R17 after terminal fix: actual exec marker + native TTS `audio`,
  3 seconds; status `done`, no active run. Restart 17:54:01, ready 17:54:19,
  no orphan marking/recovery replay for this completed turn.
- 17:55 R18 active sleep 60 cancelled after 38 seconds; no unwanted final.
- 17:55–17:56 R19: subsequent `audio`, two isolated child runs accepted,
  two completion-driven continuations, final `R19_BOTH_CHILDREN_OK`, status done.
- 17:57–18:01 Codex/Astra Browser: localhost URL no longer blocked. R20 image
  actually delivered but initial snapshot had tab not found. R21 acquired same
  tab and used the full real targetId: native snapshot + screenshot, image sent
  to Feishu, release confirmed, final `BROWSER_R21_OK`.

## Limits and remaining observations

- R19 emitted a redundant native yield-without-source warning between child
  completions; final result arrived without user intervention. Not claimed fixed.
- First cold Browser snapshot returned a synthetic target id before attachment;
  repeat tabs exposed the real Chrome target and worked. Not claimed universally
  fixed by the exact-host policy. Production user's existing tab already exposed
  a real target ID in the captured failure (which was navigation_blocked).
- No new hour-long load test or exhaustive plugin parity claim. Old long-task
  and crash tests are not represented as new live acceptance.
- Only ordinary serializable fields auto-pass. New functions/authority handles
  and changed core contracts still require explicit compatibility review.

## Production

Not deployed as of writing this candidate acceptance. Use a versioned Worker
release, back up the single native registry file and current config delta,
validate as the actual service user, preserve concurrent configuration edits,
restart in an idle window, then verify real audio and Browser output in V.
