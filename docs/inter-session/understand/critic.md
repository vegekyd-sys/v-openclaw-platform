**完整性审查结论（只读；没有改动、重启或发送任何东西）**

最要紧的结论：**桥不能走 followup 队列，也不能像 card-action 那样直接调 handler。B 正忙时，必须先确认它在核心层面空闲，再带预设的 runId 立即开跑。** V 上飞书的 steer 旁路是开着的，而 VLab 和 candidate 上是关的，所以在 candidate 里测"B 忙"测不出 V 的行为。

## 一、我已核实的 5 个关键问题

1. **B 忙时该怎么排队（已验证）**
   - 9.1 在会话忙、模式为 steer 时，返回 `enqueue-followup`（`queue-policy.ts:16-33`，`get-reply-run-admission.ts:553-572`）。
   - followup 回合把 `onBlockReply`/`onPartialReply` 设成 undefined，进度回调用的是"按会话刷新的 sourceOpts"（`followup-turn-execution.ts:189-199`），runId 会被换成随机 UUID（`followup-turn-admission.ts:291`）。
   - 后果：请求要么挤进人正在用的那张卡，要么根本没有卡，A 也等不到这个 run。core 报告里"followup 不经过流式卡"这条推断成立，而且情况更糟。
   - 飞书的每聊天串行队列会等整轮跑完，但单个任务上限 10 分钟（M:7222 `DEFAULT_TASK_TIMEOUT_MS=6e5`），超时就放行下一条。所以串行队列只能做第一道排队，**还要再加一层核心忙闲检查**：`resolveActiveReplyRunSessionId`（admission.ts:470-500），这个函数没有导出给插件，需要打 dist 补丁。

2. **V 与 VLab 的差异（已验证）**
   - V 的 Gateway 环境里 `VLAB_FEISHU_STEER_ENABLED=1`、`CHAT_IDS=*`。B 忙时，新消息走 `:active-run` 通道绕过串行队列（M:7386-7410），直接被 steer。
   - 共享 VLab 的 unit 环境里这两个变量都没有，`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` 也没有。candidate 继承 VLab 的环境（`runner.mjs:194`），所以 candidate 里"B 忙"的表现和 V 不一样。
   - harness 报告说"VLab 是 renderMode card、block 开、messages 未配置"，**这是错的**：它读的是过期的 `state/openclaw.json`。实际生效的 `shared-vlab-20260909-v3` 是 render auto、block off、`visibleReplies=automatic`、groupChat 也是 automatic，和 V 一样。candidate 用的也是这份配置（`runner.mjs:46`）。
   - V 的 `visibleReplies=automatic`，所以 harness 担心的"Codex 私聊入站是 message_tool_only"在 V 上不会发生。

3. **发件人身份和 owner（已验证）**
   - V 的 `commands.ownerAllowFrom` 只有 `feishu:ou_cb13…` 和 `telegram:5368086561`。**钉钉和企微的会话里从来没有 owner**，今天就拿不到 computer、nodes、automations。
   - `GATEWAY_OWNER_ONLY_CORE_TOOLS` 里的 `"sessions"` 是会话设置工具，**不是 sessions_send**（dangerous-tools.ts:61-74；sessions_send 只在 HTTP 拒绝表 :10-32 里）。飞书和 core 报告把非 owner 说成"失去 sessions"，不准确：非 owner 也能用 sessions_send。
   - core 报告担心"有 senderId 就被当成外部请求者"，这条只影响 subagent 的持久化策略继承（`requester-tool-policy.ts:100-169`），普通渠道会话不受影响。
   - 因此四个渠道统一的做法是：**SenderId 用会话里那位真人的 id**。权限和今天他亲自发消息时完全一样，ask_user 的作答人也能对上。钉钉报告里"群聊 senderId 传 undefined"这条应该作废。

4. **入站 run 能不能被 agent.wait 等到（已验证到代码层）**
   - 回复路径自己会发 lifecycle 终态事件（`agent-lifecycle-terminal.ts:153`，`agent-runner-cli-dispatch.ts:499-659`，`agent-runner-result-payloads.ts:331-358`），所以 Gateway 的 job 表能等到入站 run。
   - v2 的等待循环通过 RPC 轮询 `agent.wait`（`run-wait-jtRAC3Yh.js:187-191`），但**循环本身跑在发起方进程里**（generated:503-514）。V 的 worker `idleTimeoutMs=180000`、`minWorkers=5`（V 配置），池子判断空闲时看不到这段等待（`worker-pool.mjs:1426-1435`）。结论：**整个流程（发请求→B 回合→等待→唤醒 A）应当由 Gateway 侧的方法负责**，worker 里只调一次 RPC 就返回。

5. **/vcc 会不会因为附加上下文重开会话（已验证）**
   - `ChannelPromptContext` 拼进的是用户正文（`prompt-prelude.ts:47-49`），不进 `extraSystemPromptStatic`（`get-reply-run-context.ts:263-275`），不会改变 CLI 指纹。A2A 上下文用它是安全的。
   - `CommandAuthorized` 默认就是拒绝（`inbound-context.ts:167-172`），钉钉和企微在 ctx 里显式写 false 就有效。

**顺带确认（已验证）：** 飞书入站本身会写 `record.updateLastRoute`（M:5108-5111）。所以 Task Room 群只要经桥收到第一条请求，投递路由就有了。workspace 报告说的"sessions.patch 建的群没有路由"，用桥之后不再挡路，但桥需要从 key 里推出 `oc_` chat id。

## 二、报告之间的矛盾

| 矛盾 | 裁定 |
|---|---|
| 飞书报告建议照 card-action 直接调 `handleFeishuMessage`，core 报告建议等空闲 | 直接调会绕过串行队列，B 忙时会被 steer 或进 followup。必须走 `enqueue(sequentialKey,…)`，而且不能用 `:active-run` key。`enqueue` 闭包在 M:7376，所以桥要在这个作用域里注册，不能放在 M:8713 |
| core 说 B 忙时"等空闲"，可靠性报告说"强制 followup"，企微报告说"进插件聊天队列" | 按第一节第 1 条：插件队列加核心空闲检查，不用 followup |
| core 说"内存账本防环"，可靠性报告说"计数必须落账本" | 流程集中到 Gateway 后，计数可以放内存。`before_tool_call` 是在 worker 里执行，所以仍要能读到文件或调 RPC，最终还是以文件为准 |
| harness 报告对 VLab 渠道配置的描述 | 错误，见第一节第 2 条 |
| 钉钉报告说群聊 senderId 传 undefined | 作废，见第一节第 3 条 |

## 三、仍未核实、但设计依赖的推断（附只读检查方法）

1. **钉钉和企微的机器人主动消息会不会回调到自己。** 如果会，同一条请求会被处理两次。检查方法：在 `connection-DCvu-l09.mjs:328` 附近找 senderId 等于 robotCode 的过滤；企微在 monitor.js:1007 前后找同类过滤；最终要用真实测试机器人验证。
2. **v2 的唤醒回合和 cron 跑的 agent RPC 会不会登记进 replyRunRegistry。** 如果不登记，空闲检查会漏判。检查方法：`git -C ~/openclaw-versa grep -n "registerReplyRun\|replyRunRegistry" v2026.9.1 -- src/agents/command src/gateway/agent-turn`。
3. **入站回合有没有 `wait.terminalReply`。** 没有的话会退回到读历史，群里其他人的对话可能被串过来。检查方法：`grep -n terminalReply` 查 `agent-job.ts` 和 `agent-lifecycle-terminal.ts`。
4. **worker、codex、claude-cli 三个 harness 在入站路径上是否都接受预设的 runId。** 检查方法：`agent-runner-execution.ts:164`、`agent-runner-cli-dispatch.ts`，以及 worker 的 `harness-channel.mjs` 是否透传 runId。
5. **企微复用最近一次 req_id 能不能开流。** 只能在真机上验证，fake 不模拟 846605。
6. **9.1 的 /vcc 跨轮续接会不会丢上下文**（对应上游 #164972）。需要跑 candidate 实测，并带上 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`。

## 四、八份报告都没覆盖、会挡住实现的主题

- **"空闲"的定义需要一个 Gateway 内部接口。** 现在没有导出，而且检查和开跑之间有竞态，需要一个"预约"机制。
- **请求消息与合成事件之间的幂等。** 桥绕过了 durable ingress，Gateway 重启时可能重复发出可见请求，也可能 B 没开跑。账本要记 `requestMessageId` 和阶段。
- **目标地址怎么解析。** 私聊的真人 id 和群 id 要从 `deliveryContext` 取。钉钉 key 里的 cid 被转成了小写，不能反推；没有渠道的会话（main、cron、subagent、talk）要回退到 v2；跨 agent（allow 名单里有 v-codex、short-v、xiaoai）要选对 accountId 和机器人。
- **把请求贴进有别人的群，有隐私和"对外发送"闸门问题**（REDLINES 49-58，AGENTS 第 86 行）。可见请求的正文要裁剪，要设长度上限（Telegram 4096）。
- **VLab 的 lark-cli 绑的是 V 生产 app**（workspace 报告已验证）。在 VLab 或 candidate 里测 Task Room 建群，会把 V 生产机器人拉进群，然后由 V 生产来回复。
- **监控口径。** firsttext、哨兵、失败率统计都要排除 inter-session 回合，否则会误报警。
- **AGENTS.md 和 Task Room 技能改动需要 Tianyi 按 diff 确认**（AGENTS 第 23 行）。群聊沉默规则和 `NO_REPLY` 会直接让 B 交空答复，这一项会挡住验收。

## 五、风险排序

1. B 忙时请求被 steer 或进 followup：没有卡，A 永远等不到。V 有 steer 旁路，candidate 测不出来。
2. 发起方是 worker 时，等待和唤醒挂在 worker 内存里，空闲 180 s 后或换代时可能被回收，回信丢失。
3. 用 VLab 测 Task Room 时误用 V 生产 app 建群。
4. 工作区规则（`NO_REPLY`、群聊沉默）让 B 的结果为空。
5. 重启或重放造成重复的可见请求或重复唤醒（Gateway 去重表只在内存里，TTL 5 分钟）。
6. 企微无法流式显示，钉钉在没有 sessionWebhook 时的回退会静默丢掉答复：与"复用同一套体验"的目标有差距，要事先说明。
7. 钉钉和企微的会话没有 owner，B 在那里做不了 computer 和 automations。这是今天就有的限制，验收时要说明，避免误判为 bug。
8. 发版：v-session-relay 不在组件表里，CI 不跑它的测试；新补丁必须由 V 的线上字节生成并登记进 catalog。