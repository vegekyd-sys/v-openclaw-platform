# 跨 session 分发、原会话回传与统一飞书呈现：组合验收

2026-10-26。Draft PR #486。**本版本主功能仍是跨 session 分发和原会话接续；卡片是同一次执行的呈现。** 未合 dev，未部署共享 VLab 或生产。本轮使用真实 Worker/VDS、真实工具与独立 Gateway，飞书使用 loopback API transport；不是新组合的真实飞书客户端或电话通话验收。

逐次输入摘要、SHA、结果与失败样本见 [evidence.json](unified-session-presentation-20261026.evidence.json)。本地完整回执在任务 worktree 的 `tmp/unified-acceptance/`，不把包含临时配置路径的原始诊断打包成发布物。

## 1. 核心功能是否正确

组合 #482（fdc4ff46）与 #483（028e2bf7），隔离合并提交 96b79c3c。主实现提交 74fb977c，最终发送恢复修正提交 a2e71b75。最终故障候选的 42 个 runtime 输入 SHA 均与 a2e71b75 当前源码产物逐项一致。没有改变原 relay 的调度、持久化账本或原会话唤醒语义。

| 场景 | 实际断言与结果 |
|---|---|
| 长任务自动交回 F2 | 在 74fb977c 的候选 `ac5ec526` 中，目标实际执行 `sleep 75 && date`；请求会话约 2004 ms 释放，没有 sleep/poll；目标执行一次，原请求会话唤醒一次，实际工具输出自动交回。平台读回 6 项断言通过。 |
| 逐层拆分汇总 F13 | 同一候选中，A 派给 X，X 再派三个已有会话；三个任务均为 depth 2，X 经过 `awaiting_children`，收齐后才交回。实际结果 323、667、1793021093；汇总来源 runId 正是 X 的 wake run。X、A 各唤醒一次，平台读回 16 项断言通过。 |
| Worker 组合基线 | `2c13b054`，9/9：F1i、F2、F3b-rpc、F3c、F5、F7、F10、F13、F15。包含 inline、异步、竞争/排队、重启恢复、并行收齐、执行失败与受管后台任务。此轮早于最终展示错误处理修正，不冒充最终全部字节验收。 |
| VDS 组合基线 | `616b7606`，4/4：F1i、F2、F7、F13。随后在 74fb977c 上再次跑 F2/F13，通过。 |
| 禁用 relay 的 fallback | VDS `0e13672e`、最终错误处理版本的 Worker `5ac36281`：真实模型调用 `sessions_send`，目标有一份结果卡，原请求会话结果唤醒仍然保留，完成后重启不重复发送。 |

组合中专门修正一个语义冲突：旧展示补丁抑制的是“目标聊天的重复 announce”；#482 的 fallback 是“唤醒原请求会话”。不能因为目标已经有卡片就吞掉后者。离线矩阵分别覆盖同会话/跨会话、inline/async、owner 查询成功/失败，核对原会话、结果正文和 reply-once idempotency key。

## 2. 新功能本身是否对

验收围绕两种用户工作流，而非入口数量或卡片数量：

1. **“交给已有会话做，完成后回这里告诉我。”** 用户在原会话派活即可；目标保持自己的会话上下文和执行权；请求方无需盯着查询。受理、执行、回传分别有账本证据，失败不伪装成功，也不会因为飞书发送失败重新做一遍工作。
2. **“让 X 拆给三个会话，收齐后汇总回来。”** X 是协调者，不能把“已经派出去”当成结果。F13 证明结果逐层回到真正的请求方，最后继续原会话；并非在旁边另发一条失去上下文的通知。

当前机制符合这两个流程。展示只消费已授权执行的公开请求、公开过程与结果；正常飞书入站继续使用其原 dispatcher。Voice 后台同时回到语音调用方与绑定飞书，不同步普通逐句语音、私有 transcript delta、完整 prompt 或隐藏推理。

用户不需要增加“同步飞书”命令。对排队追问，本实现于 followup **实际获准执行时** 建立独立进度卡，复用用户原消息作为锚点；没有承诺入队瞬间已经发送“排队中”卡。普通渠道子任务回报使用独立续跑卡；已关联的 Voice resume 保留同一任务身份。显式 `message_tool_only`、drop、拒绝发送、内部静默任务等既有策略仍然生效，不能用镜像绕过。

## 3. 新增入口的功能验收

| 功能 | 证据 |
|---|---|
| announce 回传 | `4ad35990`：VDS 原生 `spawn_agent` → `sessions_yield` → 父会话继续实际执行工具。子任务哈希、父任务随机 token 均正确，公开过程早于 final，原生 final ACK 与 `task_runs.delivery_status=delivered` 一致。 |
| 生产 steer 模式的组合场景 | `27334e1c`：`messages.queue.mode=steer`，announce 父回合执行 35 秒时注入人类追问。追问以另一 run 成为 queued followup；复用原消息锚点，有自己的 card/message ID。两轮公开文字和 `progress_card` 步骤都在 final 前通过 API 进入对应卡片；没有相互串入旧计划；最终均取得真实模拟平台 ACK。 |
| 两条 Voice 后台入口 | VDS `0e13672e`、Worker `5ac36281`：Direct Tools backend 和原生 realtime consult 均执行真实工具、回到调用者、在飞书原生卡片先显示过程再给结果；实际 harness footer 正确；私有 context/transcript 标记没有进入平台消息。不是本轮新建真实通话。 |
| 普通飞书兼容 | 上述两轮均验证 native 入站不创建第二个 task/card。 |
| 完成后重启 | 上述两轮均在所有请求方唤醒回合完成后重启独立 Gateway，消息数不增加。 |
| 归属与权限 | 离线覆盖 sessionId/lifecycleRevision/绑定路由变更、迟到旧 run、同 task 新 run 抢占、跨连接 Voice actor、错误 account/recipient。 |
| 逐 payload ACK | 单独文本成功不能遮蔽后续附件失败；final 必须取得自己的原生 ACK，游标只越过已确认 payload。 |

队列与 command 适配接在现有准入、执行事件、正规化后投递三个阶段。它们共享一个 presentation owner、一个原生回复器工厂和一套回执规则；不会另起模型执行或扫描整份 session transcript 来广播。

## 4. 故障注入与修复

保留失败证据，不把后续成功覆盖掉：

- `9571f813`：测试夹具误用不支持的 `sessions.patch.queueMode`，未进入业务测试；改为私有配置设置。
- `d1fee5dd`：锚点校验排除了带下划线的模拟消息 ID；修正后 `a95f7578` 通过。
- `2aa0de81`：候选 webhook 端口被占用，未进入业务逻辑；改用非 ephemeral 范围并明确排除 Gateway 端口，启动遇冲突立即失败。
- `5cb47349`：测试只写 progress_card.markdown，而现有飞书渲染器展示步骤 plan。改成真实支持的步骤列表后，原判据“API 中先于 final 可见”在 `27334e1c` 通过；没有放宽成只检查 history/revision。
- `e24f27a6` / `037faf66`：真实发送拒绝暴露 finalization Promise 未接住的异常，会使私有 Gateway 退出。现已同时观察 idle 与 finalization 两个 Promise；失败的 sender 被释放，重试从已保存的同一 card/message 恢复。
- `45ecf54a`：重试期间的 checkpoint 曾先保存不带 messageId 的 state，导致最终回执丢失原消息身份；现已在第一次 checkpoint 前恢复 ID，并优先读取当前 payload 的原生 receipt，禁止用旧进度卡 ID 替代实际附件 ID。已确认的流式任务卡由同一 owner 重试，禁止另发静态兜底卡。
- `42ae3fbe`：修复后 Gateway 保持运行、原卡恢复、任务交付账本已经变为 delivered；该轮测试仍错误要求被故障夹具主动清掉的 final 正文存在，故保留失败，不记全通过。正确断言是“真实工具执行证据仍在、卡片展示无文字结果的真实状态、无重派/无重复卡”。

最终故障复验 `e723ec98` 通过：API 连续拒绝 5 次，manager 经 3 次失败恢复后仍更新 `card_mock_6 / om_mock_7`，没有第二张续跑卡；父回合副作用计数为 1。无文字 final 展示中性状态提示，最终 `task_runs.delivery_status=delivered`。底层任务表保留上次临时失败的 error 文本作历史信息，不能把它单独解读为当前交付失败。详见 evidence.json。自动 retry 仅重投记录的结果。原生 announce 重试使用同一 idempotency key；后到的卡片 ACK 能覆盖该次 run 缓存的投递失败，不能再运行模型。

## 5. 构建与复验

```sh
node lab/build-feishu-task-presentation.mjs
node lab/build-unified-session-presentation.mjs
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner YOUR_TASK_ID --plan "$PWD/lab/unified-session-presentation.joint.plan.json"
```

构建产物为 `lab/unified-session-presentation.plan.json`（42 个唯一 runtime target）和 `lab/release-files/unified-session-presentation/manifest.json`。必须作为一份组合产物使用；不可再叠加旧 #482/#483 plan，否则可能覆盖另一部分改动。

另生成 core.worker/core.vds、voice.worker/voice.vds、announce-fault 候选计划。core/joint 复用既有私有 V workspace fixture，复验者须提供对应已授权路径；私有 workspace 内容不包含在此 PR 中。所有生成计划默认模拟飞书，Voice candidate probe 插件只在测试计划里，不能部署到共享或生产。

本地最终相关回归：**335/335**。覆盖 relay 账本/恢复/权限/协议、回传、主干补丁、manager/native renderer 以及平台目录审计。目录审计曾发现新适配的 component 写为 `core` 而非 `openclaw-core`，已修正并完整重跑；不是运行时故障。

## 6. 发布与交接边界

本轮没有真实飞书发送，没有复制新 access token，没有修改共享 VLab、生产 V、6 小时 announce timeout 或其他任务进程。各候选回执记录共享 PID 未改变。此前 #483/#151 的真实 Voice/飞书证据仍保留，但不把它们称为当前组合的新现场验收。

继续保持 Draft，不自行合 dev、部署或上线。若进入发布验收，应以本次组合产物执行真实 VLab 飞书读回与 Voice 通话的最终联合抽查，并确认 feature gate `V_FEISHU_TASK_PRESENTATION=1`；普通逐句语音仍不展示。生产交接对象是用户指定的 Claude Monitor `local_7e0f8065-b83c-4405-811d-a1330adf75d8`，不是标题相似的 Codex 聊天。
