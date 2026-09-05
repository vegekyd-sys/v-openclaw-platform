# Worker 0.2.10 — scoped 9.1 parity repair

2026-09-05 Asia/Shanghai. Supersedes the unresolved gates in the RC.1 report.
Initial functional candidate: 6a9393930676963f2338d8de006cccd0da0d761c.
Later image-provenance and native setup-probe corrections are recorded below.
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

First production attempt: 18:10:52 applied, ready 18:11:24. Four previously
finished sessions were reconciled by core (started=0, settled=4). Live old-history
Worker test exposed `Unreviewed symbol capability: images`, triggering model
fallback; this was an acceptance failure. Codex Browser attempt separately failed
before tool execution with process-inspection deadline during cold startup.

Rolled back 18:14:52; ready 18:15:26, PID 934726, NRestarts 0. Config rollback
retained unrelated changes. Backup: production `.openclaw/backups/worker-0.2.10-browser-policy-20260905`.

Second candidate 5f9e136 preserves native `runtimePromptImageFactIndexes` via a
validated data sidecar on annotated image arrays at any parameter path; native
9.1 factory/reader and three concurrent real fork/IPC tests verify ownership.
Unknown symbols/authority handles are still rejected, not silently removed.
140 local tests passed. This is a codec exception for native image provenance,
not a claim that all future opaque JavaScript values can transport automatically.
VLab Grok attempt could not run because its independent OAuth refresh token was
expired; production credentials were not copied or changed. Testing the same
native image path with VLab's configured Azure vision model passed at 18:26:
the real supplied fixture image was read correctly, native TTS returned Feishu
audio (2 seconds), and the Session finished `done` without an active run.

### Production R2 and remaining Browser gate

- 18:29:37 applied 5f9e136; service restarted 18:29:38, ready 18:30:34,
  PID 941511, NRestarts 0. Capacity remains 45 main / 45 subagents, 15 × 3.
- 18:32 actual production Worker TTS was delivered as Feishu `audio` (3 seconds),
  Session `done`, no active run. Actual model was GPT-5.6 Terra: a concurrent
  Makaron model change was preserved, not overwritten by this deployment.
- The test group was later found to be the wrong business group. No more test
  messages are to be sent there. Subsequent production Browser acceptance uses
  V Backup only. The original external voice group could not be messaged via
  this user's CLI (230027); no alternative identity was used to bypass it.
- Browser production tests did not pass: the original localhost page had left
  the authorized tab inventory. HA overview remained authorized, but native
  snapshot and screenshot reported unresolved Playwright target identities.
  A fresh direct CDP diagnostic resolved the real target in 136–154 ms; this is
  not equivalent to VCodex user-path acceptance. A scoped native attach-only
  stop/reacquire restored tabs but did not restore snapshot/screenshot.
- A later Gateway health sample was not degraded, Event Loop P99 21.3 ms,
  ELU 0.039, pending 0. Earlier cold-start samples were degraded and must not
  be omitted when assessing performance.

### Native setup inference follow-up

At 18:34 production's internal `openclaw` diagnostic failed at Worker admission:
`Unreviewed runtime object: sessionManager`. This is a native tool-free,
caller-owned in-memory setup probe, not a durable chat.

An attempted delegation from inside the plugin to the built-in Harness was
rejected in VLab (native admission had already been stripped). Commits 8f78001
and 511bb43 were reverted; they were never deployed to production.

The effective correction is 3dc0d04: before plugin capability stripping, native
Harness selection retains the built-in OpenClaw owner only for the detached,
tool-free setup-inference probe when the selected harness would be vlab-worker.
Normal chats, tool-enabled runs, Codex and persisted Sessions are unchanged.
No failed run is retried as a fallback. VLab actual `openclaw.chat` returned
NATIVE_PROBE_0210_OK twice, including after removing the failed helper candidate.

19:10:18 production received this native selection correction plus failure-only
Browser target-identity diagnostics (74d0f67); no production config was changed.
Service ready 19:10:41, PID 961442, NRestarts 0. Production acceptance continues;
Browser is explicitly not yet accepted.

### Browser screenshot isolation and rejected timeout experiment

Production's real internal setup probe subsequently returned NATIVE_PROBE_0210_OK
in 42,729 ms, action `none`. This acceptance is separate from Browser.

Candidate 7963c3b enlarged the native page-identity deadline from 2 to 8 seconds.
Its private native-function test resolved a 2.8-second identity response, and
VLab's second real Codex/fixture run delivered a verified screenshot. The first
cold fixture run still had discovery-only `tab-*` handles and failed; it is not
counted as passed. Production deployment at 19:21:58 did not fix the actual
Chrome path: getTargetInfo timed out at 8,001 and 8,000 ms. This experiment was
rolled back on production at 19:30:12 and VLab at 19:30:56, with no config changes.
Production ready PID 971960, Worker 0.2.10 ready, pending 0, no active sessions.
VLab integration lease was released. Proven voice/native-probe fixes remain.

A bounded, model-free production Browser RPC diagnostic at 19:34 reproduced:

- authorized HA tab enumeration: 1,313 ms;
- native snapshot: 2,673 ms, 4,465 characters, 80 refs;
- native screenshot: timeout after 20,497 ms;
- Broker pending Page.captureScreenshot and Runtime.callFunctionOn;
- subsequent native target queries timed out while extension frame count
  stopped advancing. Earlier matching failures also ended in extension
  heartbeat timeout. The diagnostic released its lease successfully.

This changes the working hypothesis: at least some identity failures are
downstream of screenshot/Chrome transport stalling, not missing Worker fields.
The desktop tool then explicitly reported the user's Mac locked and automatic
unlock unsuccessful. No lock-screen bypass was attempted. Unlock-and-repeat
is required before attributing all prior failures to screen locking or declaring
Browser repaired. Loaded extension files already have concurrent CDP handling;
file presence alone does not prove which code is currently running in Chrome.

Next: with the Mac unlocked, compare the same authorized tab snapshot/screenshot
path, including foreground/background behavior. Do not increase timeouts again
without evidence. Do not send more tests to the business group previously used
in error; use V Backup or VLab. The external 十二家 group's send denial remains
respected. Production voice acceptance was an actual Feishu audio message using
GPT-5.6 Terra, not Grok; original screenshot failure is not a new passing test.

### Rollback

- Native selection and Browser diagnostics only:
  `/home/openclaw/.openclaw/backups/native-probe-owner-3dc0d04/deploy.mjs rollback`.
- Worker R2 plus native channel registry and exact-host browser policy:
  `/home/openclaw/.openclaw/backups/worker-0.2.10-browser-policy-r2-20260905/deploy.mjs rollback`.
- Run with production Node as root during an idle window. Both scripts validate
  current owned file hashes/config deltas and preserve unrelated model/binding
  changes. For a full return to the previous stable release, undo the native
  follow-up first, then R2; each operation restarts the Gateway.
