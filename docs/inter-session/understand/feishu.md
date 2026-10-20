**直接结论**

1. 收到 Feishu 消息后，所有 V 体验都挂在 `createFeishuReplyDispatcher(params)` 上，并且都按 `params.sessionKey` 绑定：进度清单、后台任务行、ask_user、卡片预建和底部 runtime 信息都是。所以只要把一条合成事件喂进 `handleFeishuMessage`，并让它路由到目标会话，目标会话那边就能拿到与今天完全相同的流式卡片。卡片会以「回复」形式挂在那条真实的请求消息下面。
2. 先发一条真实的「来自 X 的请求」拿到 message_id，再合成事件交给 handler，这条路可行。card-action 已经这样做了。必须注意两点：
   - 发件人不能用 `sender_type:"bot"`。走 bot 分支会在群里关掉流式卡片，还会触发互发循环抑制。
   - 私聊的会话路由取自发件人的 open_id，所以私聊时发件人必须是对话里那位真人。
3. `InputProvenance` 可以经 `buildContext` 的 `extra` 透传到这一轮。核心会把 `extra` 展开在上下文对象的最后，因此它能一路传到 run，模型会看到 `[Inter-session message] … isUser=false` 前缀，provenance 也会写进 transcript。
4. handler 会等这一轮跑完，但返回值是 undefined。现成能接的点有三个：拿 runId 用 `replyOptions.onAgentRunStart`，拿最终文字和图片用 `delivery.deliver/onDelivered`，拿结果统计用 `turnResult.dispatchResult`。
5. 桥最好在 `monitorSingleAccount` 里调完 `registerEventHandlers` 之后，注册到一个 `Symbol.for` 全局表。调用方必须在 Gateway 进程内，跑在 worker 里的 sessions_send 访问不到这个表。

下文 M 指 `release/captured/v2026.9.1-db91.6-subagent-index-20261020.feishu/dist/dist/monitor.account-WFdlCDhR.js`。它是 10/20 从 V 的 `/opt/openclaw-experiments/worker-visible-progress-v2026.9.1-20260909/feishu` 抓下来的完整插件，manifest 记录 48 个文件。

---

### 1. 从收到消息到流式卡片的调用链（已验证）

**入口到 handler**
- WS 连上后，事件经 durable ingress 和 catch-up 包装（M:8701-8707），注册在 `"im.message.receive_v1"`（M:8226）。
- 接收 handler（M:7518）依次做：丢弃自己发的消息（M:7535）→ 按 message_id 去重 claim（M:7540）→ ask_user 文字作答（M:7560-7568）→ 防抖（M:7569）→ 每个聊天一条串行队列（M:7379-7411）→ `handleFeishuMessage`（M:3987）。
- 进入 handler 后：再次去重（M:3998）→ 群/私聊准入闸门（M:4184-4332）→ 路由 `resolveAgentRoute`（M:4365）→ `buildCtxPayloadForAgent` 调 `core.channel.inbound.buildContext`（M:4719、4751）→ `createFeishuReplyDispatcher`（M:5063）→ `await core.channel.inbound.run`（M:5085）。
- `inbound.run` 在核心里是 `runChannelTurn`（VLab 镜像 `dist/run-channel-turn-aZxCVWWO.js:432`，在 :530 等待 dispatch 完成）。

**V 体验各挂在哪**
- **流式卡片 / 卡片预建**：`onReplyStart` 里调 `startStreaming` 或 `vPrecreateCard`（M:3568-3581；3037-3087；2987-3036）。
- **过程流（Codex commentary）**：`replyOptions.onItemEvent`（M:3808-3815）；工具状态行走 `onToolStart`（M:3842-3857）；思考预览走 `onReasoningStream`（M:3833）。
- **进度清单**：`onReplyStart` 里的 `vProgressAttach` 调 `vProgressSubscribe(params.sessionKey)`（M:3256-3269、3578），订阅的全局键是 `Symbol.for("openclaw.v.progressCardChangedListeners")`（M:480、488-512）。
- **后台任务行**：卡片建好后调 `vTaskStatusAttach(params.sessionKey, session)`（M:3076），数据来自 `Symbol.for("openclaw.v.taskRegistryBridge")`（M:8857-8870）。
- **runtime 底部信息**：`resolveCardNote` 输出 Agent/Model/Provider/Runtime（M:2765-2772），模型选定后由 `onModelSelected` 补全（M:3799-3803、3014-3029）。
- **插话（steer）**：
  - 保留了 `queuedFollowupLifecycle`（M:5126-5127），`deferredToActiveRun==="steer"` 时不发兜底消息（M:5136）。
  - 串行队列的旁路由环境变量 `VLAB_FEISHU_STEER_*` 控制（M:7386-7410）。
  - V 配置 `messages.queue.mode="steer"`（已在 V 上用 jq 读到）。
- **ask_user**：`vFeishuAsk.bindStream(params.sessionKey, …, {chatId, senderOpenId: askUserSenderOpenId})`（M:3088-3104）；出站时 `deliver` 截获问题载荷（M:3611-3615）；聊天作答入口在 M:134-151、9029。
- **图片/文件**：`deliver` 里的 `sendMediaReplies`（M:3746、3786）。
- **首字指标**：`vFirsttextE2e`（M:2816-2826），每轮结束时打一行 `[firsttext-e2e.1]`（M:5139）。

### 2. 合成事件能不能走同一个 handler

**card-action 的先例（已验证）**
- `buildSyntheticMessageEvent$1`（M:5260-5287）：发件人取点击者，`message_id` 设为 `card-action-<token>`，`reply_target_message_id` 设为卡片消息；群里还会放一个 mention_bot。
- `dispatchSyntheticCommand`（M:5293-5308）直接调 `handleFeishuMessage`，绕过了自发消息丢弃、防抖和串行队列。

**会话间请求的做法（推断可行，闸门逐项已验证）**

先 `sendMessageFeishu` 发出请求，返回 `{messageId, chatId}`（`reply-delivery-result-CEFTDA3f.js:1898-1912`）。再用这个 id、chat_id 和选定的发件人合成事件，`sender_type` 不填（按 user 处理）。逐项闸门：

| 闸门 | 结果 |
|---|---|
| 去重 | 键见 M:1869-1877。不带 `create_time` 时键就是 message_id，命名空间是 accountId（M:3998-4006）。新 id 能通过；同一个 id 重放会被丢，等于自带幂等。 |
| 发件人是 bot | 不能走（M:4013-4065、4252-4267、4537-4541）。走了会要求 allowBots（V 为 true）、用真消息核对 @、触发互发循环抑制，并且 `requiredMentionTargets` 会让 `streamingEnabled=false`（M:2886），流式卡片直接没了。 |
| 群准入 | 群被禁用会丢（M:4185）；`groupPolicy`/`groupAllowFrom` 在 V 上是 open/`["*"]`（M:4206）；发件人白名单和 requireMention 在 M:4224-4251。V 全局 `requireMention=false`，两个 group 配置是 null/false。如果需要 @，照 card-action 放 mentions（M:5280-5284）。 |
| 私聊准入 | `dmPolicy=open`、`allowFrom=["*"]`，可以通过（M:4290-4332）。 |
| 路由 | 私聊的 `peerId=ctx.senderOpenId`（M:4356），V 的 `dmScope=per-channel-peer`，所以私聊发件人必须是那位真人，否则会进错会话。群默认 `peerId=chatId`（M:1159-1207），与发件人无关。 |
| 命令 | `commands.allowFrom.feishu=["*"]`，正文以 `/` 开头会被当成命令（M:4549-4570），正文前要加前缀。 |
| 补漏拉取（#415） | bot 发的请求消息 `sender_type` 是 app，`shouldPull` 返回 false（M:8536），不会被重复注入。 |
| 首字指标 | 会多出一条记录，`inboundMessageId` 是请求消息（M:2820、5139）；`scripts/firsttext-e2e-report.mjs:36-38` 不过滤。需要加 `origin:"inter_session"` 并在统计时排除。 |
| 发件人名 | user 类型会去查通讯录（M:4099-4129），查到的是真人姓名，正文会显示成「真人名: …」（M:966）。需要跳过查找，直接覆盖成来源会话的标签。 |
| ask_user 作答人 | 必须传真人（M:5068）。文字作答只认 `origin.senderOpenId`（M:239 一带）；如果传合成 id，用户在聊天里打字作答永远匹配不上。 |

**发件人身份（模型行为部分已验证）**
- 是否 owner 只看 `SenderId` 是否命中 `commands.ownerAllowFrom`（上游 `src/auto-reply/command-auth.ts:515-539`）。
- 非 owner 会被拒掉 `GATEWAY_OWNER_ONLY_CORE_TOOLS`，包括 sessions、computer、nodes、terminal、conversations_* 和控制面工具（`src/security/dangerous-tools.ts:61-74`），工具来源也会被标成 untrusted（`src/agents/agent-tools.ts:562-564、694-703`）。
- 现在的 agent RPC 路径里，`senderIsOwner` 由调用方是否有 admin scope 决定（`src/gateway/agent-turn/agent-run-user-turn.ts:130-132`）。sessions_send 在 Gateway 内部调用时有 admin scope，这一点是推断。

建议：
- 路由和 `SenderId` 用真人：私聊用对端，群里用 owner。这样工具权限与今天一致，B 也还能用 sessions_send 回信、用 computer。
- 让模型「当数据不当指令」靠两样东西：`InputProvenance` 的前缀，加上覆盖后的 `SenderName`（「来源会话名（会话间请求）」）。
- 另外设 `access.commands.authorized=false`。

如果想要最小权限，可以用 `extra` 把 `SenderId`/`From` 覆盖成合成 id，同时保留真人 peer 做路由，代价是失去上面那些工具。

### 3. inputProvenance 能否带进这一轮

- 普通入站消息不设 `InputProvenance`：Feishu 传的 `extra` 只有 `RootMessageId/Transcript/GroupSubject`（M:4814-4818）。
- 上游 `buildChannelInboundEventContextValue` 把 `...params.extra` 放在对象最后展开（`src/channels/inbound-event/context.ts:592`；V 镜像 `run-channel-turn-aZxCVWWO.js:354`），所以 `extra` 里的值能覆盖 `SenderId/SenderName/InputProvenance` 等字段。
- `finalizeInboundContext` 不碰这几个字段，只重算 `CommandAuthorized`（`inbound-context-CTXmHYVF.js:81-85`），因此命令权限要走 `access` 设置，不能靠 extra 覆盖。
- 进入 run 的位置：`get-reply-CqW1y05D.js:4379`（回复路由）、`:4429`（写进用户轮 provenance）、`:4065` 和 `:6292`（工具策略）。前缀字符串在 `input-provenance-CCQsDhUy.js:10、79`。
- 回复路由不受影响：只有当前 surface 是 internal 时才走继承分支（`effective-reply-route.ts:85-90`），Feishu 入站照常回到原聊天。
- 副作用（已验证）：inter_session 下 `isInteractive=false`，sessions_yield 的确认回复不会生成（`agent-runner-result-payloads.ts:158-161`）；已归档的会话不会因此复活（`dispatch-from-config.lifecycle.ts:87`）。

### 4. 是否等完、如何拿结果

- handler 会 `await inbound.run`（M:5085），返回值丢弃了，异常也被吞掉，只有 `turnAdoptionLifecycle` 或 askUserAnswerOnly 时才重新抛出（M:5133-5145）。
- 正常收消息时整个过程是 fire-and-forget（M:8719、7581）；直接调用 handler 则可以完整等待。
- 可抓的信号：

  | 要拿的东西 | 位置 |
  |---|---|
  | runId | `replyOptions.onAgentRunStart(runId)`（M:3795-3798），`getFirsttextE2e()` 也带（M:3863） |
  | 最终文字和媒体 | `delivery.deliver(payload, info)`（M:3611 起，`info.kind==="final"`）和 `onDelivered(..., result.visibleReplySent)`（M:3600） |
  | 结果统计 | `dispatchResult.{queuedFinal, counts, deferredToActiveRun}`（M:5134-5136） |
  | 跨进程生命周期 | 核心 `onAgentEvent`（上游 `src/plugin-sdk/agent-harness-runtime.ts:207`） |

- 如果结果是 `deferredToActiveRun==="steer"`，说明这条请求被并进了正在跑的那一轮，没有新卡片。桥要返回 `{deferred:"steer"}`，结果由那一轮的卡片带出。

### 5. 桥注册在哪（V 字节上的锚点）

**注册**
- 位置：`monitorSingleAccount` 中 `registerEventHandlers(...)` 之后（M:8713-8724）。这里 `cfg/accountId/channelRuntime/runtime/chatHistories` 齐全，bot 身份可从 `botOpenIds/botNames` 取（M:8237-8238）。
- 注册到 `globalThis[Symbol.for("openclaw.v.interSessionInboundBridges")]`，键 `feishu:<accountId>`；在 `finally` 里注销（M:8746-8753）。
- 同类先例：`vFeishuIngressCatchups` 的 set/delete（M:8640/8653），Symbol 键（M:480、8857），`vFeishuApprovalRegisterContext`（M:8690）。

**`run()` 的做法**
1. `sendMessageFeishu` 发请求消息。
2. 仿照 M:5260-5287 合成事件。
3. 像 M:5300 那样直接调 `handleFeishuMessage`，额外带一个 `interSession` 参数。

**handleFeishuMessage 需要的小补丁**
- **参数**：解构里加 `interSession`（M:3988）。
- **发件人名**：有 `interSession` 时跳过查名，直接覆盖 `ctx.senderName`（M:4099）。
- **路由校验**：M:4441 之后断言 `route.sessionKey === interSession.sessionKey`，不一致就拒绝。topic、group_sender 作用域和绑定会话都会触发不一致。
- **上下文**：
  - `extra` 加 `InputProvenance`（M:4814）；
  - `access.commands.authorized` 设为 false（M:4812）。
- **dispatcher**：`askUserSenderOpenId` 传真人（M:5068）；包一层 `onAgentRunStart` 和 `deliver/onDelivered` 来收集结果（M:5063-5083）。
- **返回与异常**：返回 `{runId, dispatchResult, finals}`（M:5133-5140）；有 `interSession` 时重新抛出异常（M:5144）。
- **指标**：firsttext 那一行加 `origin` 字段（M:5139）。

**进程位置（推断）**
- 这个表只在 Gateway 进程里存在，worker 访问不到。sessions_send 补丁（`sessions-spawn-tool-1FQMTkIo.js`）里发起目标轮和回唤请求方的那两处，现在用的是 Gateway `agent` RPC 加 `deliver:true`（`lab/release-files/sessions-send-reply-once/patch.mjs:31、34`）。
- 要么在 Gateway 的 `agent` 处理逻辑里按目标会话的 deliveryContext（channel/to/accountId）查表改走桥，要么由插件 `registerGatewayMethod` 暴露一个新 RPC。
- 私聊所需的真人 open_id 可以从 `deliveryContext.to` 的 `user:<ou_…>` 里取（M:4354）。