# V upgrade to OpenClaw 2026.9.1

## Target and authority

- On 2026-09-04 Tianyi requested VLab-first migration and production promotion after acceptance.
- The requested `2026.9.2` is not published in the official registry. Tianyi explicitly confirmed `2026.9.1` instead.
- Exact official artifact: `openclaw@2026.9.1`, Git tag `v2026.9.1`, commit prefix `ad6fe23`.
- Registry integrity: `sha512-0Ve0631CdgkJDwd4NNG1BawIdF5yCL2sO+Tts8amStw+H6vKURTj0K4rOa4+hFpJk1Dnw5LyKl5twzwX1VtA2w==`.
- No production changes until the lab migration, business regressions, and recovery gates pass.

## Observed starting state

- Production: OpenClaw 2026.7.1, system service `openclaw-gateway.service`, port 22793. Root disk 96% used / approximately 16 GB available.
- Independent VLab: Tailscale `100.75.190.64` (SSH as root using existing management identity). Production V uses its separate management identity and `100.82.39.107`. No public SSH fallback.
- Original `openclaw-vlab-gateway.service` is inactive with 2026.8.1 installed.
- Actual current lab mirror: `openclaw-vlab-production-mirror-v8.service`, port 24993, generation `candidate-official-update-final-20260902`.
- Preserved read-only lab baseline: `baseline-2026.7.1-20260902`. It is historical, not proof of current production parity.
- Old 8.1 mirror artifacts say official updater exit 1, final Doctor exit 0. These are not a complete business acceptance.
- Production has gained agent/plugin/config changes since the old mirror; recapture before promotion.

## Release gates

1. Adequate disk for candidate, migration temporary data, fresh consistent rollback snapshot, and operating reserve. Do not treat `/srv` as a separate disk unless verified mounted separately.
2. Prepare exact official artifacts and reviewed plugin dependencies before stopping production. Preserve prior runtime; use the official update/Doctor/migration path before considering patches.
3. Isolate lab state, workspace, channel credentials, ports, browser resources, and scheduled tasks. Never attach lab to live production databases or production channel credentials.
4. Rehearse current production-shaped 7.1 data, including every agent, transcript path topology, ownership, auth references, and plugin/runtime settings. Count sessions and validate database integrity before and after; historical sampled fixture success is insufficient.
5. Verify 5 main + 5 subagents genuinely overlap, multiple subagents survive over 10 minutes, tools settle, and completion reaches parent. Verify configured capacity 15 x 3 / 45 and Night Shift reserves interactive capacity.
6. Real-channel ingress -> dispatch -> streaming -> final visible reply, ordinary DM without per-user manual binding, group binding, steer, cancel, session history visibility, and restart recovery.
7. VCodex streaming and tools; V Browser acquire/read/release; Night Shift chained work; image completion; Workshop/config ownership; skill inventory; OpenClaw-runtime compaction; positive memory search and five known-empty searches without forced reindex.
8. Audit every active 7.1 patch: upstream equivalent, retained compatible patch, or explicit blocker. A setting or health response is not behavioral proof.
9. Rehearse rollback: exact pre-cutover state, configuration, auth/plugin installation metadata, runtime and service. Fail loudly on restore errors and prove a real reply after rollback. Do not restore an obsolete shared database from a prior date.
10. Freeze tested code/artifact hashes, check production drift, enter a controlled idle window, prevent watchdog resurrection, take a fresh snapshot, migrate, start, and run business smoke before marking promoted.
11. Feishu card footer parity: show the actual Runtime alongside Agent, Model and Provider for both ordinary isolated-Worker turns and VCodex turns. Verify the visible card against the executing runtime, not only configuration. Tianyi's 2026-09-04 21:55 screenshot and the real smoke reply show Runtime is currently missing; this gate is NOT passed. Audit the previous footer patch and prefer an upstream equivalent when available.

## Recovery requirements

- Preserve candidate-era data before rollback, including messages accepted after cutover; do not silently drop or replay business actions.
- No automatic irreversible cleanup of migration originals during initial rollout.
- Do not reuse the old 8.1 cutover script's unconditional success message after ignored restoration failures.
- Do not mark success from Gateway ready / Worker ready alone.
- The operator must report: lab-only, migration-tested, deployed, and production-accepted as separate states.

## Current progress

- Official 9.1 tarball downloaded to VLab and SHA-512 verified.
- New runtime installed separately at `/opt/vlab/releases/2026.9.1`; official package lifecycle completed; CLI version verified.
- Production untouched; VLab mirror Gateway is now running 9.1 (started 21:46 Asia/Shanghai).
- VLab mirror and its Night Shift companion were stopped after pending/active were zero.
- Operational snapshot verified by zstd frame validation, tar listing, and SHA-256:
  `b34ac6d6baf99ace5299d253197d800ae5464d4d45c0227a1736ef6c8a3427b5`.
  Location: `/srv/vlab/staging/pre91-backup/mirror.tar.zst` (4.9 GiB;
  9,829,457,920 uncompressed archive bytes). Excludes only old `tmp` diagnostic
  artifacts and `.npm` download cache, which remain untouched at their original
  locations. This is not a full-machine backup.
- An earlier full archive was aborted and its incomplete temporary output removed
  before the disk filled. The interrupted Mac stream is explicitly named
  `vlab-mirror-pre91.INCOMPLETE.tar.zst` and must never be used for recovery.
- Read-only mirror inventory: 9 agents, 483 session nodes, 19,529 transcript events.
- Worker candidate branch `codex/worker-openclaw91`, commit `0cfb47a`, version
  `0.2.9-rc.1`: hyphenated module hashes, preserved 9.1 spawn abort signal, and
  exact exec-config-domain patch compatibility. 106 local tests passed.
- All six runtime imports resolve on actual 9.1; four retained patches passed
  pure string transformation and idempotency checks against official bundles.
  These are compatibility checks, not real-model or channel acceptance.
- Official update dry-run correctly targets the isolated mirror npm prefix.
  A first attempt from root's cwd failed EACCES without package changes; running
  from the mirror directory fixed it.
- Actual official update installed 2026.9.1 and its Doctor step exited zero, but
  the overall command exited one with `post-update-plugins`: existing
  `dingtalk-connector@0.8.23` required renewed capability consent. Inspection
  showed the same channel capability, with no added tools, services, or hooks;
  scoped native re-enable completed in VLab. No blanket capability flag was
  passed to the overall update.
- A fresh 9.1 validation then exposed three retired Codex app-server idle-timeout
  fields. A second native `doctor --fix --non-interactive` removed them. The
  Worker overlay has none of those retired fields. Revalidate after plugin sync,
  not only before it.
- After the update: all 9 agents / 483 session nodes / 19,529 transcript events
  remain. Only database byte sizes changed in the inventory (schema metadata);
  session, transcript, memory-index, and auth-profile row counts are unchanged.
- Four compatibility patches were applied to the updated mirror runtime. After
  reviewing the sole pending capability delta (the existing Dingtalk channel),
  official `update repair --no-restart --accept-capabilities` exited zero. Both
  main and Worker-overlay config validations passed. Gateway ready, Feishu
  WebSocket connected, Worker 0.2.9-rc.1 ready with elastic 1-15 workers / 3 slots.
- Operator confirmed the real test DM is V - Lab (not production V). Tianyi
  explicitly approved a tool-reply smoke and two 660-second child tasks sent as
  his user identity. Do not treat prior VLab messages as current 9.1 acceptance.
- Real smoke: sent 21:52:09, received 21:52:10.583, dispatch 21:52:10.612,
  streaming 21:52:43.423, dispatch complete 21:52:45.995. Transcript confirms
  exec returned VLAB91_TOOL_OK; Feishu card visibly returned VLAB91_REPLY_OK.
  The card footer lacks Runtime (see gate 11).
- Two-child 660-second test sent 21:53:39. Both spawns accepted and both local
  heartbeat files started; completion acceptance is still pending. Parent and
  two children were observed active together; pending/queued zero.
- Real Harness calls exposed one unclassified callback (onAttemptDeadlineChanged)
  and three options (conversationRoutePeerId, messageActionTurnCapability,
  permissionChange). These remain compatibility blockers, not silently ignored
  fields. The spawn proxy also returns a misleading native quiet-run note while
  the Worker owns completion relay; verify/fix its model-visible semantics.
- Footer audit (read-only): production's Feishu 7.1 bundle contains
  `if (prefixCtx.agentRuntime) parts.push(Runtime...)`; the installed mirror
  Feishu 8.1 bundle does not. Native 9.1 reply-prefix also does not retain a
  runtime field. Thus restoring only a footer string is insufficient: verify
  selected-runtime metadata reaches it, including session overrides/fallbacks.
  No production footer files were changed.
- 660-second result: A heartbeat started 21:54:52 and completed 22:05:52;
  B started 21:54:57 and completed 22:05:57. Each has 12 heartbeats (0..660)
  and its DONE marker. Child assistant completions appeared 22:05:57.898 and
  22:06:00.717; parent card VLAB91_LONG_OK delivered 22:06:09.867.
  Endurance and visible final reply PASSED, but automatic completion delivery
  NOT passed: relay started=2, completed=2, failed=0, delivered=0. Two warnings
  at 22:06:07 report active requester wake failed (queue_message_failed /
  no_active_run) with fallback attempted. Parent actually polled files and
  called subagents.list; no child completion event appears in its transcript.
  A successful final marker must not conceal this gap.
- Feishu released its per-chat queue at 21:58:39 (300 seconds) without killing
  either child. Observed active parent + two children, zero pending/queued.
  Mid-test Event Loop P99=23ms / max=73.5ms / utilization=0.035, not degraded;
  Feishu connected, NRestarts=0. Service MemoryCurrent approximately 1.48GB;
  service-lifetime MemoryPeak approximately 3.61GB (not attributed solely to test).
  Final Worker snapshot active=0 / pending=0 / queued=0, eventRelayFailures=0.
  Unclassified Harness fields still keep productionPromotionBlocked=true.
- Second Worker candidate `8750ef7` was installed in the isolated mirror at
  22:15. It preserves native quiet/collector semantics but restores the public
  completion expectation for normal external children, explicitly instructing
  parents to yield instead of polling. It also counts unconfirmed delivery
  separately from completed relay attempts. 108 local tests passed.
- Runtime footer patch `cf7e75c` is applied to the mirror's 9.1 runtime and
  installed Feishu bundle. Three unit tests, exact-version/anchor checks,
  idempotency and JavaScript syntax checks passed. Visible Feishu verification
  for Worker and Codex remains pending; this is not a passed gate yet.
- Short relay R2: parent yielded, received a native `agent_harness_task`
  inter-session completion event and replied. Relay delivered=1, unconfirmed=0.
- Five-parent/five-child R3: all parents were executing between 22:19 and their
  yield times (earliest yield 22:21:56); all five children had begun real exec
  by 22:21:39. Thus all ten overlapped for at least approximately 17 seconds.
  Direct status snapshots independently observed eight active and no queue;
  do not call eight a sampled peak of ten. The pool grew to five Workers.
- All five R3 child processes completed exactly 660 wall-clock seconds:
  22:20:31–22:31:31, 22:20:43–22:31:43, 22:20:58–22:31:58,
  22:21:23–22:32:23, and 22:21:39–22:32:39. Each child ended `done`.
  Five separate native completion events reached their own parents between
  22:31:38 and 22:32:46; all five parent final markers followed by 22:32:50.
  No parent polled child files/history/status as a substitute for delivery.
  Combined relay counters (short R2 + five R3) are started=6, completed=6,
  delivered=6, failed=0, unconfirmed=0; final active=0 and pending=0.
  Evidence: `pre91-backup/evidence/5p5-final-evidence.json` and
  `5p5-final-status.json` on VLab. These contain dedicated test-session evidence
  and are intentionally excluded from git.
- Production read-only refresh at 22:28: service active, NRestarts=0,
  MemoryCurrent approximately 21.5GB, MemoryHigh=28GiB, MemoryMax=34GiB;
  root disk remains 96% used with approximately 16GB free. Main and subagent
  concurrency are both 45. Current production includes the additional xiaoai
  Agent and newer plugin settings; preserve these during promotion.
- Production remains unchanged. Remaining interface, current-topology,
  business-path, storage and rollback gates must pass before cutover.
- VCodex internal RPC smoke: `agent:v-codex:explicit:vlab91-codex-tools-r1-20260904`
  resolved actual runtime `codex`; transcript contains progress text, a successful
  native `bash` tool with VLAB91_CODEX_TOOL_OK, further progress, and the final
  VLAB91_CODEX_FINAL_OK marker. This proves runtime/tools/progress events, not
  the real Feishu streaming card or Runtime footer.
- Native OpenClaw compaction smoke: the test session used `vlab-worker`, not
  Codex. `sessions.compact` reduced 64,968 tokens to 435 in 24,511ms. Continuation
  recalled a random project code and both release constraints without the
  follow-up repeating those facts. Script `vlab91-compact-smoke.mjs` passed.
- Memory: real positive search returned six results. A first batch of five
  threshold-1 empty queries encountered two Gemini embedding 429 errors and
  was NOT accepted. The follow-up strictly sequential five calls all returned
  zero results without errors (22:40:49–22:41:08). No reindex/sync log appeared
  in this interval; background-job inventory still needs checking before
  claiming the full no-reindex-storm gate.
- Browser internal-session check reached the native `v_browser_devices` tool
  successfully but returned an empty device list. No device was paired,
  acquired, navigated or released. This is not browser acceptance and does not
  prove no devices exist globally: the explicit test session may lack the
  real Feishu requester's device authorization.
- Read-only Lark check still showed the 22:06 pre-footer-patch card as latest.
  Further user-identity test messages await explicit confirmation; no extra
  user-identity messages were sent after the two individually approved tests.
- 9.1 authority audit: `messageActionTurnCapability` resolves against a
  process-local native Map and is checked again when minting Gateway runtime
  identity. Blind JSON forwarding or minting an unrelated Worker token cannot
  establish equivalent Gateway authorization. `permissionChange` contains
  host-issued WeakMap-backed callbacks, not serializable configuration.
  Preserve native scope/revocation checks; do not waive these fields merely to
  clear `productionPromotionBlocked`. No authority-boundary patch is deployed.
- Night Shift mirror companion remains stopped following the snapshot; its
  transient unit disappeared after stop. The separate original VLab Night Shift
  service is still active and was not modified. Recreate the mirror companion
  with verified isolated paths/ports before claiming Night Shift acceptance.

## Follow-up authorization and real-channel checks (2026-09-04 evening)

- Tianyi explicitly authorized further VLab acceptance messages as his Feishu
  user identity, without repeated per-test confirmation in this workflow. He
  also authorized deletion of unneeded old 8.1 intermediate backups instead of
  COS archival. This is not authorization for unrelated messages or data loss.
- Production cleanup completed: deleted only `20260902T110500-fresh` (incomplete,
  sessions archive only) and `20260902T111124-fresh` (superseded intermediate)
  under the verified canonical `openclaw-2026.8.1-cutover` backup directory.
  Before deletion, all ten entries in the retained `20260902T114920-fresh`
  SHA-256 manifest passed, including configs, all listed databases and sessions
  archive. Retained the 22.53GB `20260901T150143Z-full.tar.zst` and its prior
  successful archive-validation metadata, plus the latest complete snapshot.
  The two deleted intermediate directories cannot be recovered verbatim.
  Production root free space increased from approximately 16GB to 33GB;
  production service stayed active with NRestarts=0. No production runtime,
  session, configuration, credentials or service were changed.
- R4 real Feishu tool reply at 23:19 displayed the system footer
  `Runtime: vlab-worker` beside Agent/Model/Provider. The footer was not model
  prose. Message `om_x100b669a5989c0a0b2a26e1d64caa35` confirms it. Codex's real
  card footer remains a separate unpassed gate.
- R5 exposed a concrete mirror parity gap: native `message` tool failed with
  `Feishu account "default" not configured`. Production overlay has the Feishu
  account; the mirror overlay had no `channels.feishu` at all. After an idle
  gate, copied only the mirror's own VLAB_FEISHU environment references and
  Feishu settings into its overlay. No production credentials were copied.
  Overlay validation passed. Mirror Gateway restarted and became ready at
  23:40:57; production was not restarted. Guarded operator script is
  `vlab91-align-feishu-tools.mjs`; it preserves a mode-0600 config rollback copy.
- R6 native message tool successfully sent `VLAB91_MESSAGE_TOOL_R6_OK`
  (platform message `om_x100b669a22e080bcb10989382c3fb63`). The subsequent requested
  second reply conflicted with the Agent's NO_REPLY anti-duplication instruction;
  the model produced explanatory text in its ordinary assistant text channel.
  Do not mislabel that observation as confirmed thinking-channel relay leakage.
- R7 deliberately followed the native post-send NO_REPLY convention. The native
  message tool delivered `VLAB91_MESSAGE_TOOL_R7_OK` exactly once (platform
  message `om_x100b669a3c46a4a4b348faffac7e164`) without a second reply card in the
  observed message list. The Gateway/Worker completion state is checked separately.
- Real Feishu `v_browser_devices` also returned zero devices, so browser
  acquire/read/release is still not accepted. Message delivery success does not
  clear the separate four-field Harness authority/route/deadline audit.

## Post-midnight continuation (2026-09-05)

- Restored the isolated Night Shift companion on loopback port 24980 using the
  existing `bbc2ead-openclaw81-statefix1` dashboard release and the 9.1 Gateway
  at 24993. External scheduler mode and notifications disabled prevent dispatch
  or messages from unrelated cloned business instances. The original VLab
  service and production were not touched.
- Dedicated `NS-V91-RELAY-20260904` three-stage native Workboard smoke completed
  A -> B -> C. Created 23:57:33; final observation 00:00:53 showed all three
  stages done. The test harness only pulsed the native scheduler for this test
  instance; Agents themselves ran the foreground tools and native
  `workboard_proof` / `workboard_complete`. No operator forced card completion.
  This accepts isolated task succession, not Feishu approval notifications or
  an unattended production scheduler timer.
- Production read-only refresh at 00:08:19: service active, NRestarts=0,
  MemoryCurrent=17,158,529,024 bytes and root free space 33GB. Five live Agents
  include xiaoai; enabled plugins additionally include QQ, Codex Supervisor,
  Landing Chat and Xiaoai Cloud. The old candidate cannot replace that config.
- Temporarily routed only the already-known VLab acceptance DM to v-codex.
  `vlab91-codex-dm-binding.mjs restore` restores only this route, not a stale
  whole-config backup. It must be restored before handing the lab back.
- R8 actual Codex Feishu run (00:03:32–00:04:23): native terminal worked but
  interim preambles did not appear. Final used native message(action=send,
  final=true), producing a plain post with no footer. NOT streaming acceptance.
- Official 9.1 `messages.visibleReplies="automatic"` is now explicit in both
  lab configs. It preserves prior automatic reply behavior; group policy was
  already explicit automatic. Source room-event and send-policy restrictions
  remain native and unchanged. R9 then produced a real streaming final card
  with `Runtime: codex` (message `om_x100b669a9e8fd8a0b1a4477778bc58f`), but
  commentary before/during its 30-second tool still did not appear.
- Production's existing `VCODEX_COMMENTARY_STREAM_V2` patch consumes explicit
  preamble Item events. Ported that narrow integration to the candidate's
  Feishu adapter, keeping native final delivery and actual-runtime detection.
  Six local tests pass, including no reasoning/tool event display, bounds,
  idempotency and anchor-drift refusal. Live acceptance remains pending.
- Prepared a dedicated real headless Chrome with a synthetic extension
  protocol peer, owned by the VLab test identity, at CDP port 24952. It does not
  pre-acquire any lease; the Agent must list/acquire/operate/release it. This
  is not acceptance of the user's physical installed browser extension.

## Continued live checks and promotion blockers (2026-09-05 00:34)

- R10 Codex failed before its tool with process-inspection deadline / Linux
  namespace diagnostics; R11 and R12 subsequently completed. This cold-start
  anomaly is not dismissed merely because retries worked.
- R12 after the narrow commentary-v2 patch: received 00:22:36.140, dispatch
  00:22:36.166, streaming card opened 00:22:54.108, closed 00:23:33.520, dispatch
  complete 00:23:33.552 with one reply. Live observations showed a Bash progress
  indicator at 00:23:17/23 and preamble text at 00:23:29. Later Feishu readback
  confirmed the same card held only `VLAB91_CODEX_FINAL_R12_OK` and the system
  `Runtime: codex` footer. This proves an in-progress card and clean finalization;
  it does not yet prove the requested START preamble appeared before tool start.
- Restored the temporary VLab DM binding from v-codex to makaron. Restarted only
  the idle candidate Gateway; ready at 00:30:32.059. Production was untouched.
- R13 real Feishu browser test received the fixture's exact device ID but native
  `v_browser_devices` returned empty and acquire failed `actor cannot access
  this device`; release returned false because no lease existed. The Agent
  accurately reported failure, with `Runtime: vlab-worker` in the system footer.
  Independent broker read for the intended trusted Feishu principal returned
  that device online; both main and overlay target the same 24891 broker.
  Browser acceptance remains FAILED pending identity/context investigation;
  do not broaden access or alias arbitrary principals to make the test pass.
- The first Worker dispatch after restart again reported unclassified route,
  message-action authority, and permission-change fields. A fresh-process
  `productionPromotionBlocked=false` before any Worker run is NOT clearance:
  these counters are discovered dynamically. The four-field audit remains open.
- Normal macOS SSH routing timed out for both Tailscale addresses despite node
  pings working. Existing management SSH keys succeeded through
  `ProxyCommand=/usr/local/bin/tailscale nc <tailscale-ip> 22`; no public SSH
  fallback was used. Production readonly at 00:29:24: active, NRestarts=0,
  MemoryCurrent=17,333,379,072 bytes.
- Deployment remains NOT READY. In addition to the above browser/Harness
  blockers, latest production topology, migration/rollback, and remaining
  7.1 capability gates must be reconciled before cutover. No production upgrade,
  configuration change, or restart was performed in this continuation.
- Browser investigation identified a concrete adapter mismatch: 9.1's real
  Harness input carried `messageProvider` without `messageChannel`; native
  tool selection uses `messageChannel ?? messageProvider`. Our IPC nested
  ingress defaulted the absent channel to webchat, changing the trusted actor's
  channel namespace. Worker commit `395c9d9` normalizes the native channel before
  populating all IPC channel/reply/run-context fields. It never uses model
  provider or session-key text to infer identity. All 112 Worker tests passed.
  Candidate main and overlay point to an isolated `worker-openclaw91-395c9d9`
  release; previous config copies end in `.pre-395c9d9`. Archive extraction
  initially preserved local UID 501 and was correctly rejected by the loader;
  fixed ownership on that new release only to root:root, then restarted the
  lab. Do not retain local ownership when packaging the production artifact.
  Real-channel browser re-acceptance remains required.
- R14 (00:37:53) confirmed the corrected trusted identity: native device listing
  now returned the intended online test device. Acquire then failed at a
  separate downstream boundary, `browser gateway connection timed out`.
  The broker is configured to the existing dedicated browser-assist 8.1
  Gateway on 24793 (not the 9.1 main Gateway on 24993). Its active process
  answered neither loopback nor Tailscale HTTP within four seconds. Registry
  contains only the old synthetic fixture and this run's test device, no human
  browser devices. Restarted only that lab browser-assist service to restore
  the test topology; this is not production/browser-component upgrade proof.
- R15 (sent 00:42:31) after browser-assist recovery reached device discovery,
  acquire, fixture tab metadata, and successful release. Native `browser`
  snapshot still targeted default `vbrowser-01` rather than the leased profile
  (assist authenticated the new route as vbrowser-02), and reported attachOnly
  profile not running. This is a remaining Session lease -> native browser
  profile binding failure; tab metadata alone is NOT browser-read acceptance.
  Final failure card: `om_x100b669b1ddb64a4b2e1489055abe84`.
- Final candidate pool read: pending=0, two ready Workers, active=0/queued=0;
  productionPromotionBlocked=true remains intentional. Test DM is back on
  Makaron; no test browser lease was retained. The dedicated R13–R15 fixture
  service is stopped after testing. Production cutover is NOT performed.

## Updated promotion order authorized by Tianyi

- Complete and regress the 9.1 Worker permission/lifecycle compatibility first,
  then deploy production V when the remaining non-browser safety gates pass.
- Browser end-to-end acceptance is explicitly deferred until after production
  cutover. R15 remains a known unresolved browser issue, not a passed test.
- This does not waive Worker authority checks, current-production configuration
  preservation, rollback readiness, or real Feishu reply acceptance.

## 2026-09-05 native authority and recovery follow-up

- Scope narrowed at Tianyi's request: do not repeat the accepted 5+5/660-second,
  compaction, memory-search, and VCodex suites. Regress only changed native
  boundaries and the actually failing real-Feishu completion path.
- Worker `cead1c5` bridges native attempt deadlines and running permission changes,
  and keeps opaque message-action authority in the Gateway. `7613f98` delegates
  backend RPC identity minting to the original native Gateway admission rather
  than a Worker-local authority. No hand-built signed claims or broad allowlist.
- Running permission smoke at 01:11:38–01:11:53 passed: while a 90-second Python
  tool was running, native sessions.patch read-only interrupted the tool; the
  Agent returned VLAB91_PERMISSION_INTERRUPTED_OK and the Worker PID survived.
- Real Feishu R16 delivered VLAB91_NATIVE_MESSAGE_R16_OK through the native message
  tool at about 01:07:43, with no duplicate final after NO_REPLY.
- Explicit headless approval test was NOT an interactive approval-pause pass:
  before the identity bridge, exec.approval.request rejected stale runtime
  authority; after it, registration succeeded at 01:24:27 but native policy
  denied waiting because the explicit headless ingress had no approval route.
  Do not loosen production security or count the already-ended run as cancelled.
- R17 real Feishu child e9e23b09-8893-4bf0-815d-e0d898005fa1 finished at
  01:25:43 but Parent delivery remained unconfirmed. `f5b815e` uses the official
  withoutGatewayToolCallerIdentity helper for process-owned completion delivery,
  retaining the original native task-runtime scope. Its real-channel result is
  pending; it must not be called accepted from unit tests.
- R18/R19 then exposed an earlier failure after restart: Worker attempted to
  claim a second main-session recovery owner. The captured stack points exactly
  to claimAgentCommandRecoveryOwner in official agent-command-DPfawBbr.js:352.
  `114c2dc` sets native mainRestartRecoveryAdmitted only on trusted Harness
  requests, after forwarded options. Gateway continues owning recovery; no
  serialized lease, reset, tombstone removal, or lifecycle bypass patch. The
  targeted 12-test suite passed, including refusing caller option spoofing on
  non-Harness requests. Candidate main+overlay now use that exact release.
- R20 received at 01:42:22.808 in the same existing Feishu DM and passed the
  formerly failing admission into model execution. Await actual child completion
  and visible Parent reply before marking this regression passed.
- Production readonly: PID 293790, active, NRestarts=0; 33 GiB filesystem free.
  No production configuration/runtime/restart mutation in this follow-up yet.
  Latest production inventory includes the xiaoai Agent/plugin, NightShift 0.1.2,
  WeCom 2026.8.17-vlab.1 and 26 bindings; do not overwrite these with the older lab
  fixture config. Fresh rollback snapshot remains a cutover prerequisite.
- R20 eventually executed the requested child plus the previously queued R18
  child. Both finished at 01:45:59–01:46:00. Completion diagnostics now identify
  the precise remaining fault: `In-process gateway dispatch requires a gateway
  request scope or instance binding (method: agent).` Thus caller detachment
  alone (`f5b815e`) was insufficient. Native recovery admission did work.
- `4c69527` binds detached SDK completion to the native Gateway instance resolver
  already attached to api.runtime.subagent; it keeps the original host-issued
  task scope, gives an existing scoped resolver precedence, and never substitutes
  a new instance for an expired lifecycle fence. Nine targeted context/relay
  tests passed. This is pending real-channel acceptance, not production clearance.

## 2026-09-05 production cutover and final acceptance

- Production V now runs OpenClaw `2026.9.1 (ad6fe23)` from
  `/opt/openclaw-2026.9.1-v/openclaw`. The fresh pre-cutover rollback snapshot is
  `/srv/openclaw-data/disk/openclaw-storage/cold-migrated-2/openclaw/backups/openclaw-2026.9.1-cutover/20260905T020829-pre91/openclaw-state.tar.zst`.
- Worker `0.2.9-rc.2`, commit `2d8595f`, is promoted with the 9.1 v8 Harness
  contract. Capacity remains elastic `1-15 x 3 = 45`; production status is ready,
  pending/queued zero, and no permission/lifecycle field remains unclassified.
  Previously accepted 5+5 and 660-second suites were not repeated.
- Feishu 9.1 parity restored commentary streaming and system Runtime footers.
  Real VCodex showed an in-progress card and final `Runtime: codex`; ordinary
  Worker cards show `Runtime: vlab-worker`. Production V Browser completed native
  devices -> acquire -> browser snapshot -> release and replied `V91_BROWSER_OK`.
- OpenClaw 9.1 marked the old Memory indexes as provenance-mismatched. Official
  sequential indexing, never `--force`, rebuilt all five Agent indexes. Makaron
  and VCodex each have 3,531 files / 30,657 chunks; Short-V, DealClaw and XiaoAI
  are also valid and complete. Real main-DM `memory_search` replied
  `V91_MEMORY_SEARCH_OK`.
- Night Shift required three genuine 9.1 compatibility repairs, kept in branch
  `codex/nightshift-openclaw91-dispatch`: use
  `workboard.cards.dispatchWithOptions` (`aa9ed88`), preserve scoped `cardIds` and
  the 36-slot global/owner budget (`aec4dc0`, `9939566`), and retain the 12,000
  character Workboard notes limit. The final real Pulse started two Makaron cards
  concurrently with zero start failures and zero warnings; the formerly failing
  long-notes instance advanced normally.
- After the final restart, two Night Shift Worker tasks were active while the main
  DM independently returned `V91_CONCURRENT_REPLY_OK`. Gateway and Night Shift
  are active with `NRestarts=0`; Feishu is ready/connected, WeCom is running,
  Worker pending/queued are zero, Event Loop P99 is 20.8 ms and degraded=false.
  The final log audit found no per-chat 300-second timeout, Worker timeout/exit,
  event relay failure, SIGKILL, OOM, unclassified option, or plugin load failure.
- Rollback material for the final Workboard compatibility patch is under
  `/home/openclaw/.openclaw/backups/openclaw91-workboard-parity/20260905T0435-prepatch`.
  The Night Shift release rollback pointer/state backup is under
  `/home/openclaw/.openclaw/backups/nightshift-openclaw91-dispatch/20260905T0425-predeploy`.
- One 9.1 validation-only regression was also closed: the legacy
  `data-selection` Skill lacked frontmatter metadata. It now registers as eligible;
  its prior file is backed up under
  `/home/openclaw/.openclaw/backups/openclaw91-data-selection-skill/20260905T0450`.

Final decision: production 9.1 is accepted and kept. Browser, VCodex streaming,
Night Shift, Memory Search, real Feishu tools, Worker concurrency, Runtime footer,
WeCom, and rollback paths are all available on the production-shaped path.
