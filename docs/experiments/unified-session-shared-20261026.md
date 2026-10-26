# 统一跨会话功能：共享 VLab 真实联动验收

2026-10-26。用户已授权合入 dev 并独占共享 VLab 验收，未授权生产上线。

**结论：核心正常路径通过，整个版本暂不通过上线门禁。** 长历史测试会话的原生 Codex announce 曾未生成最终总结，随后 queued followup 因 runner 占用失败。重置测试会话后正常，不足以证明旧会话问题已修复。失败状态被误显示成“没有文字结果”的呈现缺陷已修正并通过本地回归；这不等于 Codex 生命周期问题已修复。

本报告追加当前共享现场证据；[此前候选报告](unified-session-presentation-20261026.md)的“未合并、未部署”是该历史轮次状态，不代表本轮。原始历史、日志、截图留在受控本地验收目录，不进入 Git。

## 被测版本

- PR #486 已合入 dev：`fee00635d3c1df6bd10a7685dc0b886437c3c527`。
- 共享 release：`unified-session-20261026-v1`，42 个 runtime target；源实现 `a2e71b75`，报告提交 `ac438c4c`。
- artifact SHA：`c482bc76ff6c98e4a9f8ed8461e9e011494236b5f5f0f6220196607ace4a69d1`，已与 stage/deploy 回执核对。
- runtime SHA：`340e44f5c4f1d26201376f556789c4e9f2df93a63ed62174b48c550029c5394e`。
- Voice 插件：`26c7bf9b381ffd6eb39fb8389027508499c4ec01`（v-voice PR #151），239 files，files SHA `222c5d0277f896e05f4e27ce61f857505548ca3eaac08b59489d1668896d362d`。
- 激活 relay、`V_FEISHU_TASK_PRESENTATION=1`、共享 announceTimeoutMs=21600000。未触碰生产实例。
- 合并后相关回归 335/335，部署工具回归 14/14；后续错误状态修正回归 48/48。

## 核心：分发和原会话回复

| 实际场景 | 结果与证据 |
|---|---|
| VDS F2：A 派给 B，目标真实执行 75 秒任务，再自动回 A | `SHARED-F2-fa2daf`；send `s_mvpd8kctef28a5f230` handed_back；batch `b_mvpd8kct3946c44161` woken，attempt=0。目标实际时间戳 1793025833；目标结果卡 `om_x100b62c22321aca0b0fe90b81a2c232`，A 最终卡 `om_x100b62c23ddbbca0b09ff5736dd04a6`。一次执行、一次原会话唤醒。 |
| VDS F13：A→B→三个已有房间，收齐后逐层汇总 | `SHARED-F13-b0c074`；root send `s_mvpdfbbnf2a8795a3d`，三个子任务 depth=2，真实结果 323、667、1793026112。B 最终结果来自其 children batch 的 wake run，而非初始派发 ACK。两个 batch 均 woken/attempt=0。A 最终卡 `om_x100b62c2ca32eca4cef182b437ce116`，B 汇总卡 `om_x100b62c2ca6d84accd1c15ab73d5c45`。 |
| Worker：目标实际执行 sleep25 与 37×41，回源会话 | 明确引用任务 `SHARED-WORKER-CLEAR-059b30` 通过；补充协作规则后，清理测试会话上下文再用原自然语言 `SHARED-WORKER-FRESH-42dd6d` 通过。后者 source 仅 sessions_send(timeoutSeconds=0)，完整任务交给 target；target 实际 exec 得到 1517，send `s_mvpel4ch8e12a0c981` handed_back，batch `b_mvpel4ch96ab993b4b` woken/attempt=0，手回消息 `om_x100b62c2b3f184a0b4fc9caaec076a8`。 |

Worker 保留失败样本：`SHARED-WORKER-070f57`、`2fa0c4`、`ddfaec` 曾由请求方自己算完，再派目标只回复 ACK。relay 按模型实际工具参数正确投递，**产品层面的任务分配仍是错的**，不能算成功。仅提高 thinking 没解决；清晰任务边界与干净上下文后通过。共享 workspace 试加“完整交给目标、不可代做或改成 ACK”等协作规则；未把私有 workspace 内容提交仓库，也未证明所有长历史模型行为都已修复。正式上线仍应把工作规则作为有回滚的配套项验收。

## 两条真实语音后台任务

使用真实 H5、真实 GPT Live / Grok 连接和实际工具执行；输入为预制合成用户语音，通过私有 Pulse 输入，未录制用户麦克风。后台请求为“先等 30 秒再计算 123×45”，期间再问普通“2+2”。

| 入口 | 真实结果 |
|---|---|
| GPT Live native consult | run `talk-realtime-consult:1793026797593:5db4de4e-b46d-4561-a6f0-bd1ffb27769c` → Worker 子任务 → announce resume。真实结果 5535 返回语音调用方；任务锚点 `om_x100b62c2e02814a4cf27ef353323f4b`，过程与最终结果在同一卡 `om_x100b62c2e15db4a4cfd8c482ee664d6`。 |
| Grok Direct Tools backend | call `e371783f-1089-4d8a-80f1-5cb1005a2206`；run `voice-product-task:1793027027479:89360208-1e0c-44b3-941f-d95280486f2c` → Worker 子任务 → announce resume。真实结果 5535 返回调用方；锚点 `om_x100b62c2f38310b0ce54d5f3aef2704`，过程和结果同一卡 `om_x100b62c2f32608b0ce5bf9d3329ca85`。 |

两条后台任务均取得实际飞书 API 读回；普通逐句语音没有创建额外任务锚点/卡。截图保留 `gpt-shared-final.png`、`grok-shared-final.png`，不能把截图单独当成实际音频听感验收。Voice 首次部署因 unpack 后文件 uid=501 被插件安全检查拒绝，修为该新 release 的 root ownership 后重启共享，再测通过；没有放宽安全检查。

## 原生子 agent 回报和排队追问

`SHARED-NATIVE3-1026`：重置测试 A 会话后，GPT 原生 spawn_agent 取得哈希 `6dbb1a138142e926`，父会话 sessions_yield。announce 回合先显示公开文字和步骤，再实际执行 sleep50/read 测试文件；期间发送人类追问，追问以 queued followup 独立执行 sleep20。

- announce 过程与最终结果同一卡 `om_x100b62c34eb8b4a8b4f5c9c9f917790`，最终 hash 和测试 token 正确。
- queued followup run `8ebb4e83-a187-4d9e-be16-4429647e9e12`；过程计划在 final 前已从真实平台读回，结果卡 `om_x100b62c34a6ae8a8b09b0e5f2312565`。原人类消息作为锚点，没有重复的模型请求。
- 两个 presentation 都 completed/delivered，分别有本轮 message receipt。没有把 history 有输出或 progress_card revision 增长当成平台可见。

不重置会话再做 `SHARED-NATIVE4-1026` 连续复测也通过：announce 卡 `om_x100b62c351e7eca0ce9ca30b0a6ab28` 的哈希/token 正确，followup 卡 `om_x100b62c368d8bca4b0f812f3f20088e` 的过程早于 final，并取得最终回复。此连续复测增加正常路径证据，不能消除下述已发生故障。

**保留阻塞样本 `SHARED-NATIVE2-1026`：** 同一测试群更早的混合模型/语音历史上下文里，announce 的公开进展确实可见，但末尾出现 `Codex settled-turn finalization context is unavailable`，最终退化为工具完成但未总结。紧接着 queued run `618a3b77-39e4-4889-8066-26521b65209d` 报 `Codex session became active in another runner; wait for it to finish before continuing`，没有执行追问任务。

该 queued 卡 `om_x100b62c2919d60a8cf2b5e70bf2b667` 却显示“任务已结束，本轮没有文字结果”。原因已定位到 presentation 的 final 分支先将正规化后的 NO_REPLY 固化为 completed；finally 才检查 operation.result，已经太晚。修正使 final 在固化前读取原生 operation 的 failed/aborted；测试验证错误卡、取消卡及发送失败后恢复同一错误结果，不能重跑模型。**此修正只解决误报，未解决 Codex runner 衔接。** 未重置生产或真实用户会话来掩盖问题。

早期夹具误用 service PrivateTmp 的 `/tmp` 导致子任务无法读文件，已改为专用 workspace 子目录；该轮不算功能失败或通过。一次 VDS 测试遇到旧 Codex PID reaper 拒绝，重试后执行通过，但没有因为超时就杀进程或删 registry。

## 环境与交付边界

真实发送只在授权的 5 个私人测试群。VLab 飞书应用原来仍把事件投向旧候选 HTTP webhook，已在应用控制台恢复长连接并发布 VLab 应用 1.0.8；真实 @ 入站恢复。没有更改生产 V 的飞书应用。不同 app scope 的 open_id 不同，不能据此误判机器人身份。

完整受控证据目录：`/Users/tianyicai/vlab-dev/tmp/unified-shared/`。包括 stage/deploy 回执、每个场景账本、实际飞书读回、有限 chat.history、语音 audit 与截图。仅报告中筛选的测试标记和消息/运行 ID 进入 Git；不提交 token、私有配置或完整转录。

未执行 `accept` 或 production promote。该轮不能对外声称“全部验收通过”或“可直接上线”。下一轮门禁是：在保留长历史和模型切换的情况下稳定复现并解决 Codex announce→queued 生命周期衔接，随后用最终完整产物复验分发/回传与两条语音入口。

## 收尾

2026-10-26 23:37 CST，已通过正式 `vlab.mjs rollback` 回退 `unified-session-20261026-v1`，保留对话和账本证据，未执行 accept。共享恢复 `sessions-search-20261026`；runtime SHA `e645d63018565c6c0f451eec2a57c24460ad831edd3d65bbb08c64a1c1045ec3`，配置按原始字节恢复为 `d2511d0b51aac69bb3ef4506bcac96789ca2453660cd5e2807ef1549fe1a881a`。新 feature gate 已撤销，共享 workspace AGENTS.md 也按原 hash 恢复。回执中的 accepted=true 属于旧基线，不是本次新功能获验收。

本轮专用 Voice companion 和合成语音浏览器服务已停止，临时浏览器控制凭据已移除。VLab 飞书事件长连接恢复保留，以免重新指向已失效的旧候选 webhook。生产配置、workspace 与 runtime 均未修改。

错误状态修正提交 `3b6d4ada`，PR #488。该修正未进入本轮被测共享 v1，不把本地通过写成服务器已复验。
