**结论**

1. **可以。** 走入站路径的回合可以带 `InputProvenance{kind:"inter_session"}`，提示词会被加上 `[Inter-session message] … isUser=false` 前缀，前缀里写明「这不是用户直接指令」。用户在对话记录里看到的正文不带这个前缀，provenance 会存到 user 消息上。目前飞书、钉钉、企微以及所有上游渠道的入站路径都**不设置**这个字段，设置它的只有 chat.send、重启哨兵、talk consult 和 followup 重放。
   - 设置之后有几个副作用：回合不再算「交互」(isInteractive=false)，session lane 优先级降为 background，actor 不算 human。
   - 主人身份要靠 `SenderId` 匹配，不能留空。
   - 本次 A2A 的上下文应放进正文或 `ChannelPromptContext`，**不要放 `GroupSystemPrompt`**，否则会让 /vcc 的 CLI 会话重启。
2. **run id 有条件可控。**
   - 调用方可以通过 `GetReplyOptions.runId` 预先指定，但只在目标空闲、立即开跑（run-now）时生效。
   - 一旦进 followup 队列，会被换成新的随机 UUID；被 steer 时根本不产生新 run。
   - lifecycle 事件带 `runId/sessionKey/sessionId/agentId`，**不带** provenance、messageId 或任何自定义标记，所以「X 会话在 T 之后带标记 M 的下一个 run」靠事件流**无法可靠匹配**。
   - 可行做法二选一：桥先等目标空闲再用预分配的 runId 立即开跑；或者打一个 dist 补丁，让 followup 入队时保留预分配的 runId。
   - `agent.wait` 对任何 Gateway 进程内发出 lifecycle 事件的 run 都有效，包括入站 run。
3. **目标正忙时选 followup 语义。** 9.1 默认是 steer（`messages.queue.mode` 未配置；VLab 镜像里也是 null）。
   - steer 会把请求塞进用户正在跑的 run，不产生新 run，也没有独立回复卡片，A 也等不到对应的 run。
   - collect 可能把同一来源的多条请求合成一个回合。
   - interrupt 会打断用户。
   - 9.8 上游给 sessions_send 加了 `mode:followup`，含义正是「开一个独立回合，不 steer」。
   - 问题是 followup 回合的回复走 followup-delivery，**不会经过**原渠道入站的流式卡片 dispatcher（推断）。所以桥最好自己等目标 lane 空闲后立即开跑，等待期间 A 侧显示「排队中」。
4. **需要改的点见下面「需改动点」清单，共 9 处。** 第 2、5 处是核心接缝，第 7、8 处解决「A 用 sleep 轮询」的问题。
5. **9.1 没有任何 A2A 深度或血缘跟踪。** 只有 agentToAgent 的 allow 名单、写死的 ping-pong 5 轮（v2 已删掉）和「不能发给自己」。
   - 深度计数不能放进 InputProvenance 的新字段：Gateway 的 schema 是 closed，normalize 也会丢掉未知字段。
   - 建议放进 `originSessionId`（自由字符串、能过 schema、会持久化），再给 sessions_send 工具传入当前回合的 provenance 和 runId。
   - 9.1 里 sessions_send 不像 sessions_spawn 那样拿得到当前回合信息，需要补丁 `openclaw-tools-BODVdJQD.js:17617`。

---

**证据**（以下 `9.1:` 均指 `~/openclaw-versa` 的 v2026.9.1；`cap:` 指 `release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist/`，该捕获**不含** v2 marker，已验证）

**Q1 入站字段**
- 已验证：MsgContext 字段的定义位置是 `9.1:src/auto-reply/templating.ts`。`MessageSid` 在 :166，`GroupSystemPrompt` 在 :291，`ChannelPromptContext` 在 :298，`InputProvenance` 在 :306，`InternalTurnSource` 在 :308，`SenderId` 在 :312，`CommandAuthorized` 在 :363，`OriginatingChannel/To` 在 :406/:411。
- 已验证：插件运行时的入站入口在 `9.1:src/plugins/runtime/runtime-channel.ts:197-203`（`inbound.run=runChannelTurn`、`dispatchReply`）。`buildChannelInboundEventContext` 通过 `...params.extra` 透传任意字段（`9.1:src/channels/inbound-event/context.ts:592`），所以可以带进 `InputProvenance`。
- 已验证：提示词加注在 `9.1:src/auto-reply/reply/prompt-prelude.ts:76-80`，作用于 prefixedCommandBody 和 queuedBody，transcriptCommandBody 不加。前缀文案在 `9.1:src/sessions/input-provenance.ts:23-30,177-192`。provenance 持久化在 `get-reply-run-execute.ts:255,300`。
- 已验证：今天设置 InputProvenance 的地方只有这几处：`chat-send-user-turn.ts:138`、`server-restart-sentinel.ts:270`、`followup-turn-execution.ts:61`、`talk-agent-consult.ts:97`。V 的运行时也一样，`grep "InputProvenance:"` 在 feishu、dingtalk、wecom 的捕获里都没有命中。
- 已验证，副作用：
  - `agent-runner-result-payloads.ts:158-161`：isInteractive=false，yield 时的「等待中」确认语不发。
  - `followup-delivery.ts:114-120,132-133`：失败结果直接静默。
  - `attempt-terminal-evidence.ts:168`。
  - `lane-runtime.ts:69-72`：优先级降为 background。
  - `dispatch-from-config.lifecycle.ts:87`。
- 已验证：回复路由。`InternalTurnSource` 为空时走 `OriginatingChannel/To/AccountId`（`effective-reply-route.ts:102-108`）。sessions_send 的特殊继承分支只在当前 surface 是 internal 时生效（:85-101）。
- 已验证：主人身份。agent RPC 路径是 `senderIsOwner = clientHasAdminScope`（`gateway/agent-turn/agent-run-user-turn.ts:130-132`）；入站路径要靠身份匹配，scope 只在 internal Provider 时才算（`auto-reply/command-auth.ts:533-539`）。另外 `requester-tool-policy.ts:102-104` 只要有 senderId 就把请求方当成外部请求者。由此推断：桥要把 `SenderId` 设为主人 ID，`CommandAuthorized` 设为 false，否则会丢失 owner 工具，或者别的会话的文本会被当成斜杠命令执行。
- 已验证：去重键是 agent、路由和 `MessageSid` 的组合（`inbound-dedupe.ts:56-75`）。所以 MessageSid 应该用 `a2a:<idempotencyKey>` 这样稳定且唯一的值。
- `GroupSystemPrompt` 会进入 extraSystemPromptStatic（`get-reply-run-context.ts:263-270`，已验证）。CLI 指纹包含 extraSystemPromptHash（`cli-runner/live-session-fingerprint.ts:83`，已验证），所以每轮改它会让 claude-cli 会话重启（推断）。

**Q2 run id**
- 已验证：`GetReplyOptions.runId` 在 `get-reply-options.types.ts:139`，执行侧 `runId = opts?.runId ?? randomUUID()` 在 `agent-runner-execution.ts:164`。`onAgentRunStart(runId)` 定义在 :154，在 `agent-runner-execution.ts:256` 调用，在 `channels/turn/lifecycle.ts:385-390` 被包装。
- 已验证：followup 入队后 `runId: crypto.randomUUID()`（`followup-turn-admission.ts:291`）。
- 已验证：事件结构在 `infra/agent-events.ts:58-74`；lifecycle 事件即使对隐藏 run 也保留 sessionKey（:279-280）。`agent.wait` 在 `agent-job.ts:351-380` 全局监听 lifecycle，在 `agent-turn-service.ts:662-713` 按 runId 等待。
- 已验证：plugin hook 的 agent 上下文只有 runId 和 sessionKey，没有 provenance（`plugins/hook-types.ts:299-310`）。

**Q3 排队**
- 已验证：默认值 `"steer"` 在 `queue/settings.ts:31-36`；四种 mode 定义在 `gateway-protocol/.../logs-chat.ts:209`。`get-reply-run-admission.ts:554-578` 判断 steer 或 followup，`queue-policy.ts:8-32` 决定动作。调用方不能直接指定 mode：`queueModeOverride` 只来自 `/steer` 命令或 inline 指令（`get-reply.ts:1178,1344`；`get-reply-run-context.ts:95`）。
- 已验证：collect 的分组键包含 provenance 各字段（`queue/drain.ts:354-358`，在 :1117-1120 使用），所以给每个请求一个唯一的 `originSessionId` 就不会被合并。
- 已验证：agent RPC 路径在 session lane 上以 background 优先级排队（`session-placement-admission.ts:182`）。这正是 v2 现在的语义，A 等的就是这个 run。
- 已验证：9.8 的 `mode:followup` 说明在 `v2026.9.8:src/agents/tool-description-presets.ts:101-109`。

**Q4 需改动点**（行号是 `cap:sessions-spawn-tool-1FQMTkIo.js` 的原始字节）
1. `runAgentStep` 在 :320-401。Gateway 的 `agent` 调用在 :355-369，A 的唤醒回合走这里，桥接入点就在这。
   - :333-352 是进程内 `agentCommandFromIngress` 分支，只给 announce 用，v2 之后已经不用。
   - 唤醒之后它自己还会等最多 60 秒（:381-387），然后关闭 MCP。
2. `startAgentRun` 在 :812-890。目标回合的 `agent` 调用在 :871-879，这是 B 侧的桥接点。
   - :815-848 是 steer 分支，只对 run-scoped key 且 timeoutSeconds=0 生效，保持不动。
   - :849-866 是 cron 回退。
3. `sendParams` 在 :1243-1254，里面有 deliver、channel internal、extraSystemPrompt=agentMessageContext（:1232）和 inputProvenance（:1237-1242）。桥要把这些映射成 MsgContext：annotated 正文、`InputProvenance`、`ChannelPromptContext`。
4. `runSessionsSendA2AFlow` 在 :489-636，被 v2 整段替换。v2 里 `waitForAgentRun(params.waitRunId)` 依赖 runId 一致；桥如果进了 followup 队列，runId 就对不上（见 Q2）。
5. `startA2AFlow` 和 `skipA2AFlow` 在 :1270-1296。条件 `Boolean(expectedSessionId)` 会跳过唤醒；上游的 worker-environment 发送会设 `expectedTargetSessionId`（`9.1:src/gateway/worker-environments/worker-session-tool-send.ts:42`）。V 的 vlab-worker 会不会走这条路**待核对**（推断有风险）。
6. 返回结果的位置：
   - timeoutSeconds=0 时 :1338-1347 返回 `accepted{runId,targetDisposition,delivery:{status:"pending"|"skipped",mode:"announce"}}`；
   - 等待超时但 run 未结束时 :1371-1380 也返回 accepted；
   - :1399-1407 返回 `ok{reply}` 或 `no_reply`。
   - 输出 schema 每个分支都是 `additionalProperties:false`（:659-695），要加提示字段必须同步改 schema（已验证）。
7. 模型怎么读 accepted 结果：`tool-description-presets-C6exCTZo.js` 的 `SESSIONS_SEND_RESULT_GUIDANCE` 只说「两者都不代表目标已完成」，**没有说结果会以新回合回来、应当结束本回合**。这是 A 用 sleep 轮询的直接诱因（文案已验证，因果是推断）。需要同时补丁这份描述，并在 accepted 结果里写明「结果会自动以新回合送回，请结束本回合」。
8. `openclaw-tools-BODVdJQD.js:17617-17623` 构造 sessions_send 时没传 `runId` 和 `inputProvenance`，深度控制需要补这两个参数（已验证）。
9. 回退逻辑：桥在入站准入前抛错，或该渠道没有注册桥时，回到现有 v2 的 `deliver:true`。

**Q5 回环控制**
- 已验证：A2A 策略检查在 :956-966 和 :1162-1175（`createAgentToAgentPolicy`，`9.1:src/plugin-sdk/session-visibility.ts:200`）。ping-pong 写死 `min(20,5)`（:225-226, :295-297），不可配置。自发自收守卫在 :1153-1158，只在 timeoutSeconds≠0 时生效。
- 已验证：InputProvenance 只有 5 个字段（`input-provenance.ts:12-18`），Gateway 的 schema 是 closed（`gateway-protocol/src/schema/primitives.ts:38-44`），normalize 会丢掉未知字段（:37-50）。只有子代理有深度概念：`maxSpawnDepth`（`subagent-capabilities.ts:174-185`），以及 `requester-tool-policy.ts:123` 的血缘深度上限。
- 建议（推断）：
  - **用 `originSessionId` 承载链信息**，格式如 `a2a:<chainId>:<depth>:<rootSessionKey>`。它能过 schema，会持久化到 user 消息，还会进 collect 分组键。
  - **在 sessions_send 里校验。** 从工具拿到的当前回合 provenance 读出深度 d，目标回合写 d+1，超过上限（比如 3）就返回 `forbidden`。
  - **另加内存账本防环。** 按 chainId 记录已经走过的 sessionKey，再次发往其中任一会话就拒绝。
  - **唤醒回合不加深度。** 它沿用请求时的同一 chainId 和 depth，因为它是回程，不是新一跳。