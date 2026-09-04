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
