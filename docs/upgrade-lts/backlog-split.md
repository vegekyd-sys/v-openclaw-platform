# 欠账分组（2026-10-29）

按"文件归属"分组：一个 dist 文件只属于一组，那一组按发版顺序把它的全部补丁翻译完。分组让各组改的源码尽量不重叠；真重叠时由汇总方合并 fork 分支时处理。

**第一波**只做 2026-10-27 之前的发版。`unified-session-20261027`、`release-batch-20261027`、`release-batch-20261028` 跨好几组，留到第二波统一做；只被这三次发版改过的文件也归第二波。

首次改动是 `v2026.9.1-db91.6`（或更早）的文件，M1 已经翻译过 9/24 的版本，只补之后的发版。

## memory：记忆检索（本会话自己做）（5 个文件）

| 文件 | 第一波要翻的发版 | 留给第二波 |
|---|---|---|
| `core:extensions/memory-core/manager-runtime.js` | v2026.9.1-db91.6, memory-search-fast-20261002, memory-search-1s-20261002, memory-search-mixed-20261002, memory-search-weighted-20261002, memory-search-guards-20261002, vector-budget-20261020, gateway-451-452-20261021 |  |
| `core:extensions/memory-core/memory-search-knn.child.js` | memory-search-fast-20261002 |  |
| `core:manager-search-knn-NiSMMJUM.js` | memory-search-fast-20261002 |  |
| `core:session-search-visibility-H6aL2Pcb.js` | memory-search-1s-20261002 |  |
| `core:tools-Byg09TOP.js` | v2026.9.1-db91.6, vector-budget-20261020 |  |

## voice：语音 / GPT Live（22 个文件）

| 文件 | 第一波要翻的发版 | 留给第二波 |
|---|---|---|
| `core:agent-run-control-BeeIeTBf.js` | voice-task-continuity-20261016-r3 |  |
| `core:agent-tools-djVuP1H1.js` | v2026.9.1-db91.6, voice-reliability-20261008 |  |
| `core:agent-tools.before-tool-call-g2OT63u5.js` | loopback-requester-sender-20261004, voice-confirmation-switch-20261005 |  |
| `core:embedded-agent.runtime-CL7poBKY.js` | voice-reliability-20261008 |  |
| `core:gpt-live-call-lifecycle.mjs` | loopback-requester-sender-20261004, gpt-live-voice-20261005, v-experience-channels-20261005, voice-reliability-20261008 |  |
| `core:gpt-live-consult-continuation.js` | loopback-requester-sender-20261004, gpt-live-voice-20261005, voice-spawn-20261020 | unified-session-20261027 |
| `core:gpt-live-voice-exec-lifetime.js` | loopback-requester-sender-20261004 |  |
| `core:realtime-quicksilver-delegation-controller-B0yPpiHp.js` | loopback-requester-sender-20261004, gpt-live-voice-20261005, voice-reliability-20261008, voice-streamed-hangup-20261013b |  |
| `core:realtime-quicksilver-session-B3HKftDE.js` | loopback-requester-sender-20261004, voice-reliability-20261008, v-voice-content-product-20261011 |  |
| `core:realtime-session-harness-CEO5kVAJ.js` | v2026.9.1-db91.6, loopback-requester-sender-20261004, gpt-live-voice-20261005, feishu-conversations-20261024 | unified-session-20261027 |
| `core:runs-5WnDPZ0V.js` | voice-task-continuity-20261016-r3 |  |
| `core:subagent-announce-delivery-Dosep7Zr.js` | loopback-requester-sender-20261004, voice-task-continuity-20261016-r3 | unified-session-20261027 |
| `core:subagent-announce.requester-settle-wake-B2NSziIo.js` | loopback-requester-sender-20261004, subagent-settle-20261016 |  |
| `core:talk-DkFuKRod.js` | v2026.9.1-db91.6, loopback-requester-sender-20261004, v-experience-channels-20261005, voice-reliability-20261008, v-voice-content-product-20261011, voice-task-continuity-20261016-r3, feishu-conversations-20261024 |  |
| `core:tool-resolution-Con11qMn.js` | loopback-requester-sender-20261004 |  |
| `core:v-feishu-voice-actor.mjs` | feishu-conversations-20261024 | unified-session-20261027 |
| `core:v-feishu-voice-policy.mjs` | feishu-conversations-20261024 |  |
| `core:v-feishu-voice-runtime.mjs` | feishu-conversations-20261024 |  |
| `core:v-feishu-voice-tools.mjs` | feishu-conversations-20261024 |  |
| `core:voice-process-owner.mjs` | voice-reliability-20261008 |  |
| `core:voice-task-lifetime.js` | voice-task-continuity-20261016-r3 |  |
| `feishu:dist/v-feishu-voice-confirm.mjs` | v-feishu-voice-confirm-20261025 |  |

## codex：Codex 插件层（15 个文件）

| 文件 | 第一波要翻的发版 | 留给第二波 |
|---|---|---|
| `codex:dist/attempt-context-DmQUNWwT.js` | codex-ds-window-20261013 | release-batch-20261028 |
| `codex:dist/bounded-turn-wzJrwKKe.js` | codex-ds-window-20261013 | unified-session-20261027 |
| `codex:dist/dynamic-tools-BU9tmlYm.js` | codex-ds-window-20261013 |  |
| `codex:dist/harness-DXVZ5II5.js` | codex-ds-window-20261013 |  |
| `codex:dist/native-subagent-monitor-CnH147jH.js` | codex-ds-window-20261013, codex-followup-admission-20261018 |  |
| `codex:dist/run-attempt-D1hJO4fX.js` | codex-ds-window-20261013, codex-ds-window-20261019 | unified-session-20261027 |
| `codex:dist/session-history-C5J1AKzG.js` | codex-ds-window-20261013 |  |
| `codex:dist/settled-turn-context-D3SNWtUn.js` | codex-ds-window-20261013 | unified-session-20261027 |
| `codex:dist/settled-turn-finalizer-BVJx4yoc.js` | codex-ds-window-20261013 | unified-session-20261027 |
| `codex:dist/side-question-BTZAII4l.js` | codex-ds-window-20261013 |  |
| `codex:dist/thread-lifecycle-DAcEJ_Om.js` | codex-ds-window-20261013 |  |
| `codex:dist/transcript-mirror-DTUxFWa_.js` | codex-ds-window-20261013 | unified-session-20261027 |
| `codex:dist/transport-stdio-CyPldczm.js` | codex-ds-window-20261013, codex-inspection-budget-20261017 |  |
| `codex:dist/v-deepseek-base-instructions.md` | codex-ds-window-20261013 |  |
| `codex:dist/v-deepseek-model-catalog.json` | codex-ds-window-20261013 |  |

## channels：渠道：飞书插件层、v-experience、钉钉/企微（18 个文件）

| 文件 | 第一波要翻的发版 | 留给第二波 |
|---|---|---|
| `core:bot-message-DC6p8sB3.js` | v-experience-channels-20261005 |  |
| `core:bot-native-command-builtins-mQhamMB9.js` | v-experience-channels-20261005 |  |
| `core:bot-native-command-dispatch-7hG7WSS2.js` | v-experience-channels-20261005 |  |
| `core:command-auth-DmNN2m2f.js` | feishu-model-20260924, v-experience-channels-20261005 |  |
| `core:helpers-DEd6NfQU.js` | v-experience-channels-20261005 |  |
| `core:progress-card-CciYmFS8.js` | feishu-progress-20260926 | unified-session-20261027 |
| `core:server-methods-CLElG7qF.js` | feishu-conversations-20261024 |  |
| `core:telegram-ingress-drain-factory-DJM2Jqrc.js` | v-experience-channels-20261005 |  |
| `core:tools-catalog-DGR0f9wo.js` | feishu-conversations-20261024 |  |
| `core:tools-invoke-ev4-EXmh.js` | feishu-conversations-20261024 |  |
| `core:v-experience.js` | v-experience-channels-20261005 | unified-session-20261027 |
| `core:x-search-shared-CJa_QAnc.js` | v-experience-channels-20261005 |  |
| `feishu:dist/channel-DSYCNah8.js` | v2026.9.1-db91.6, hotreload-feishu-approvals-20261003 |  |
| `feishu:dist/client-DMbIL3UH.js` | v2026.9.1-db91.6, session-phone-20261023 |  |
| `feishu:dist/index.js` | v2026.9.1-db91.6 | unified-session-20261027 |
| `feishu:dist/monitor.account-WFdlCDhR.js` | v2026.9.1-db91.6, feishu-progress-20260926, feishu-ask-user-20260930, background-work-20261002, feishu-ask-chat-answer-20261003, hotreload-feishu-approvals-20261003, firsttext-e2e-20261005, firsttext-runid-20261005, batch-20261010-codex-feishu-workboard, firsttext-card-note-20261010b, night-batch-20261010, sharing-feishu-catchup-20261018, session-phone-20261023, feishu-conversations-20261024, v-feishu-voice-confirm-20261025 | unified-session-20261027, release-batch-20261027 |
| `feishu:dist/v-feishu-approvals.js` | hotreload-feishu-approvals-20261003 |  |
| `feishu:dist/v-feishu-phone-tabs.mjs` | session-phone-20261023, feishu-conversations-20261024, v-feishu-phone-entry-20261026 | release-batch-20261027 |

## store：会话存储与投影、全量读、doctor（22 个文件）

| 文件 | 第一波要翻的发版 | 留给第二波 |
|---|---|---|
| `core:collector-DyqVHdcZ.js` | gateway-451-452-20261021 |  |
| `core:combined-store-gateway-BwDhjbIt.js` | fullread-doctor-dingtalk-20261025 |  |
| `core:config/sessions/session-transcript-reconcile.worker.js` | restart-speed-2-reconcile-20261014, projection-incremental-20261017, workboard-projection-20261017 |  |
| `core:disk-budget-BzLS0kmH.js` | disk-budget-websearch-20261017 |  |
| `core:doctor-health-contributions-Dz7xROs_.js` | fullread-doctor-dingtalk-20261025 |  |
| `core:operations-CTofDiKh.js` | fullread-doctor-dingtalk-20261025 |  |
| `core:registry-runtime-session-ownership-B1XvaNE7.js` | fullread-doctor-dingtalk-20261025 |  |
| `core:session-accessor-K0XuW6ln.js` | v2026.9.1-db91.6, placement-evidence-20261005, mirror-facts-identity-20261012 |  |
| `core:session-accessor.sqlite-entry-BlklNPKQ.js` | v2026.9.1-db91.6, subagent-lazy-store-20261017, sharing-feishu-catchup-20261018 |  |
| `core:session-accessor.sqlite-lifecycle-state-CrB_K2kA.js` | archive-retention-cutoff-20261017 |  |
| `core:session-accessor.sqlite-transcript-state-Cz9g7S9v.js` | v2026.9.1-db91.6, release-batch-20261009, sharing-feishu-catchup-20261018 |  |
| `core:session-accessor.sqlite-transcript-store-DV0WFe1a.js` | projection-checkpoint-20261017 |  |
| `core:session-history-eviction-d5aiCsHS.js` | v2026.9.1-db91.6, disk-budget-websearch-20261017 |  |
| `core:session-manager-CNTG_BAJ.js` | big-session-reads-20261008, batch-20261010-codex-feishu-workboard |  |
| `core:session-transcript-index-9itOio9h.js` | tooling-prepare-20261013, projection-checkpoint-20261017, projection-incremental-20261017 |  |
| `core:session-transcript-reconcile-j5qhAafV.js` | v2026.9.1-db91.6, gpt-live-voice-20261005, release-batch-20261009, projection-incremental-20261017, workboard-projection-20261017 |  |
| `core:session-utils-list-BUP03AzS.js` | subagent-index-20261020, gateway-451-452-20261021, sessions-search-20261026 | release-batch-20261027 |
| `core:session-utils-store-Dlphca2N.js` | v2026.9.1-db91.6, sharing-feishu-catchup-20261018 |  |
| `core:sessions-read-C6mAMxyQ.js` | worker-secret-egress-20261010, workboard-projection-20261017, sharing-feishu-catchup-20261018, sessions-search-20261026 | release-batch-20261027 |
| `core:sessions-resolve-_D6BmQTT.js` | fullread-doctor-dingtalk-20261025 |  |
| `core:v-health-session-summary-worker.mjs` | gateway-451-452-20261021 |  |
| `core:v-session-entries-matching.mjs` | fullread-doctor-dingtalk-20261025 | release-batch-20261027 |

## workboard：工作板、子 agent、任务注册、写锁（16 个文件）

| 文件 | 第一波要翻的发版 | 留给第二波 |
|---|---|---|
| `core:extensions/workboard/index.js` | v2026.9.1-db91.6, workboard-incremental-sweep-20261006, firsttext-r2-20261007, workboard-projection-20261017 | release-batch-20261027 |
| `core:node-sqlite-CL-d6drd.js` | worker-secret-egress-20261010, hold-roll-20261020 |  |
| `core:reply-admission-ticket-QG2vY13O.js` | claim-workboard-20261013 |  |
| `core:runtime-api-1CCazqtv.js` | v2026.9.1-db91.6, batch-20261010-codex-feishu-workboard, worker-secret-egress-20261010, claim-workboard-20261013, workboard-projection-20261017, fullread-hotpaths-20261020, nightshift-throughput-20261022 | release-batch-20261027 |
| `core:service-CzmmKrEg.js` | fullread-hotpaths-20261020 |  |
| `core:session-D4AJhdUK.js` | fullread-hotpaths-20261020 |  |
| `core:sqlite-store-CH-caj1l.js` | v2026.9.1-db91.6, batch-20261010-codex-feishu-workboard, worker-secret-egress-20261010, claim-workboard-20261013, fullread-hotpaths-20261020 | release-batch-20261027 |
| `core:src-B9mb84px.js` | workboard-projection-20261017, sessions-search-20261026 | unified-session-20261027 |
| `core:subagent-capabilities-CPAHEjL-.js` | subagent-lazy-store-20261017 |  |
| `core:subagent-completion-admission.store-JmpNDYTF.js` | subagent-lazy-store-20261017 |  |
| `core:subagent-registry-C24yr_PF.js` | background-work-20261002, loopback-requester-sender-20261004 |  |
| `core:subagent-registry-read-UaDFTyfW.js` | subagent-settle-20261016 |  |
| `core:subagent-registry.store.sqlite-hzGu4QSk.js` | subagent-settle-20261016, gateway-451-452-20261021 |  |
| `core:task-registry-activity-DSlVVJwD.js` | background-work-20261002 | unified-session-20261027 |
| `core:task-registry.maintenance-C4nMaDY9.js` | fullread-hotpaths-20261020 | release-batch-20261027 |
| `core:ws-log-CFwaDvs6.js` | worker-secret-egress-20261010 |  |

## turn：回合主路径：首字、重启提速、上游回退、图片裁剪（28 个文件）

| 文件 | 第一波要翻的发版 | 留给第二波 |
|---|---|---|
| `core:agent-command-DPfawBbr.js` | feishu-model-20260924, worker-prewarm-20261005, firsttext-r1-20261006, firsttext-r3-20261007, release-batch-20261009, restart-speed-20261013, upstream-5xx-fallback-20261015 | unified-session-20261027 |
| `core:agent-command-DeP5kHlK.js` | worker-prewarm-20261005 |  |
| `core:agent-runner-memory-7VF-zwNt.js` | firsttext-r4-20261007, batch-20261010-codex-feishu-workboard, nightshift-throughput-20261022 |  |
| `core:agent-runner.runtime-CAdsMsQt.js` | feishu-model-20260924, firsttext-r4-20261007, batch-20261010-codex-feishu-workboard, history-image-e3-20261015 | unified-session-20261027 |
| `core:bash-tools-DiAfkLAC.js` | feishu-model-20260924, loopback-requester-sender-20261004 |  |
| `core:builtin-openclaw-zQV8Wwjr.js` | v2026.9.1-db91.6, loopback-requester-sender-20261004, gpt-live-voice-20261005, v-experience-channels-20261005, firsttext-r4-20261007, night-batch-20261010, upstream-5xx-fallback-20261015, subagent-settle-20261016, projection-checkpoint-20261017 |  |
| `core:classify-Dm9sTbZz.js` | upstream-5xx-fallback-20261015 |  |
| `core:command-secret-gateway-DCJZ8pGz.js` | restart-speed-2-reconcile-20261014 |  |
| `core:db91-integrity-bootstrap.mjs` | v2026.9.1-db91.6, feishu-model-20260924, restart-speed-20261013 |  |
| `core:db91-restart-carry.mjs` | restart-speed-20261013 |  |
| `core:dispatch-from-config-DOJq_7CI.js` | v2026.9.1-db91.6 | unified-session-20261027 |
| `core:embedded-agent-DaSvA-Yk.js` | gpt-live-voice-20261005, worker-secret-egress-20261010, history-image-e3-20261015, upstream-5xx-fallback-20261015, subagent-settle-20261016 | unified-session-20261027 |
| `core:embedded-agent-helpers-CzpaLpCq.js` | v2026.9.1-db91.6, history-image-e3-20261015, upstream-5xx-fallback-20261015 |  |
| `core:get-reply-CqW1y05D.js` | v2026.9.1-db91.6, firsttext-r1-20261006 | unified-session-20261027 |
| `core:get-reply-from-config.runtime-CWdWv_c6.js` | firsttext-r1-20261006 |  |
| `core:history-image-prune-Dg0CDQ4a.js` | computer-frame-prune-20260928, history-image-e3-20261015 |  |
| `core:host-capability-Dq3cEEWF.js` | v2026.9.1-db91.6, loopback-requester-sender-20261004 |  |
| `core:index.js` | feishu-model-20260924, restart-speed-20261013 |  |
| `core:openclaw-tools-BODVdJQD.js` | v2026.9.1-db91.6, media-relay-20260925, view-image-overflow-signal-20260929, night-batch-20261010, sessions-search-20261026 | unified-session-20261027, release-batch-20261028 |
| `core:placement-store-CkyLHi6x.js` | firsttext-r2-20261007 |  |
| `core:plugin-sdk/agent-harness-task-runtime.js` | background-work-20261002, loopback-requester-sender-20261004 |  |
| `core:refresh-BzYxPady.js` | firsttext-r3-20261007 |  |
| `core:runner-BIhCXp3h.js` | firsttext-r2-20261007 |  |
| `core:selection-BC0YSSFq.js` | feishu-model-20260924 | release-batch-20261027 |
| `core:server-startup-post-attach-BPE6Pv6n.js` | firsttext-r1-20261006 |  |
| `core:server-worker-placement-startup-BvPREvpr.js` | feishu-model-20260924, placement-evidence-20261005, firsttext-r2-20261007 |  |
| `core:sessions-spawn-tool-1FQMTkIo.js` | v2026.9.1-db91.6, loopback-requester-sender-20261004 | unified-session-20261027 |
| `core:tools-invoke-shared-CjpflNGO.js` | firsttext-r2-20261007, feishu-conversations-20261024 |  |

## 第二波（16 个文件只被 10/27–10/28 发版改过）

- `core:v-feishu-task-presentation-command.mjs`：unified-session-20261027
- `core:v-feishu-task-presentation-core-bridge.mjs`：unified-session-20261027
- `core:v-feishu-task-presentation-cron.mjs`：release-batch-20261027
- `core:v-feishu-task-presentation-delivery.mjs`：unified-session-20261027, release-batch-20261027
- `core:v-feishu-task-presentation-followup.mjs`：unified-session-20261027, release-batch-20261027
- `core:v-feishu-task-presentation-runtime.mjs`：unified-session-20261027, release-batch-20261027
- `feishu:dist/feishu-private-conversations.mjs`：release-batch-20261027
- `feishu:dist/v-feishu-task-presentation.mjs`：unified-session-20261027, release-batch-20261027
- `core:delivery.runtime-CAsclR-9.js`：unified-session-20261027
- `core:experience-review-default-Dr4f0pMZ.js`：release-batch-20261028
- `core:isolated-agent-BxeXdw5A.js`：release-batch-20261027
- `core:run-delivery.runtime-falxHVAy.js`：release-batch-20261027
- `core:server-session-key-ZtX3Ble7.js`：release-batch-20261027
- `core:service-query-Bt8YN8NM.js`：release-batch-20261028
- `core:session-task-lifecycle.mjs`：unified-session-20261027
- `core:workspace-BFk42BX6.js`：release-batch-20261028

钉钉（4 个）和企微（9 个）是第三方插件，源码放平台仓库（`lab/` 补丁 + 测试），不进 fork，归 channels 组。
