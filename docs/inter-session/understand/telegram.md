**Telegram 入站：跨会话请求怎么注入**

## 直接回答

**(1) 收到消息到渲染回复的链路（已验证）**

整条链路如下：
1. 隔离 worker 线程跑 getUpdates，消息写入持久 ingress 队列。
2. 主线程 drain 时调用 `bot.handleUpdate`。
3. 经过 grammY 中间件：updateTracker → callback 应答 → V 的 v-experience middleware → sequentialize。
4. `bot.on("message")` → `handleMessage` → `handleInboundMessageLike`：依次做 shouldSkip、authorize、dispatch-dedupe。
5. `processInboundMessage`（文本分片、媒体组、debounce）→ `processMessageWithReplyChain` → `processMessage` → `buildTelegramMessageContext` → `runTelegramDispatchTurn` → `runChannelInboundEvent`。

所有渲染都挂在 `runTelegramDispatchTurn` 的 replyOptions 和 `deliverReply` 上：
- `onPartialReply` 编辑草稿。
- `onToolStart` / `onPlanUpdate` / `onItemEvent` 交给 V 的 workView，改写同一条草稿。
- 问题按 sessionKey 路由。
- finally 里的 `watchBackground` 负责后台行。
- 最终 payload（文本、图片、文件）走 `deliverReply`。

Telegram 默认 streamMode 是 `progress`，V 的 workView 只在 progress 下开。V 和 VLab 都没配 `streaming`，所以两边都走默认值。

**(2) 怎么注入**

不要伪造整条 update 去调 `handleUpdate`，改用 9.1 自带的"合成消息"写法，poll_answer 和按钮回调就是这么做的：
1. bot 先 `sendMessage` 发出请求原文，拿到 message_id X。
2. 以 X 为 base，from 设为该会话的人类用户，构造合成消息。
3. 直接调 `message.processMessageWithReplyChain({ctx, msg, allMedia: [], storeAllowFrom, options: {forceWasMentioned: true, messageIdOverride: "inter-session:<runId>"}})`。

这样会绕过 updateTracker、dedupe、allowFrom、debounce 和提及门，但仍然走正常的回复卡渲染（已验证这是现成先例；用在桥上是推断）。

如果坚持用 `handleUpdate`，会被这些门挡住（均已验证，除非另注）：
- **自己发的消息被丢**：`from.id` 等于 bot id 时直接忽略。Telegram 也不会把 bot 自己发的消息推回来（推断）。
- **update_id 有副作用**：带了就进入 watermark，并经 `onAcceptedUpdateId` 持久化。伪造一个大 id，重启后真实消息会被当成已处理而丢弃。不带 update_id 时，去重键退化为 `message:<chat>:<id>`，有 5 分钟去重缓存。
- **持久去重**：键是 (account, bot, chat, message_id)，保留 7 天。复用 X 不会撞上真实消息（推断）。
- **白名单**：V 是 `dmPolicy: pairing`，allowFrom 和 groupAllowFrom 都只有 5368086561（Tianyi）。私聊里非白名单发送者会触发配对挑战，bot 会回一条配对消息。
- **debounce 合并**：V 的 `queue.debounceMsByChannel.telegram=1000`，键按发送者 + 会话。用 Tianyi 身份伪造的消息会和他 1 秒内发的真实消息合并。
- **群提及**：`requireMention` 为真且没被提及时直接跳过。V 配了 `groups "*": requireMention:false`；VLab 没配 groups。
- **steer 模式**：V 的 `queue.mode=steer`。目标会话正在跑时，新消息会并入当前回合，不会另起一张卡（推断）。
- **斜杠命令**：请求文本以 `/` 开头会被当成命令处理。

**(3) inputProvenance 能不能带进 run**

能，需要一个小补丁。9.1 和 9.8 的 Telegram 都不设置 `InputProvenance`（已验证）。但 ctxPayload 的 `extra` 会原样展开进 ctx，get-reply 再把 `ctx.InputProvenance` 带进 run：既写到转录的 user 消息上，也写进 `followupRun.run.inputProvenance`（已验证）。

带上后的影响：
- `inter_session` 不改变投递模式，仍是 automatic；只影响会话的稳定模式。
- 也不改变路由：重路由只在当前渠道是 internal 时触发，而这里 Provider 是 telegram。
- followup 被拒时不会提示，静默处理。
- session actor 不再算 human。

以上均已验证。

**(4) 怎么拿到 run id 和最终回复文本**

- `GetReplyOptions.runId` 可以覆盖 run id，`onAgentRunStart(runId)` 会回报 run id（已验证）。
- agent.wait 的 job 表监听全局 lifecycle 事件，所以由渠道发起的 run 也能被 `waitForAgentRun` 等到（推断）。这样 sessions_send 补丁里现有的 `waitForAgentRun` + `readLatestAssistantReplySnapshot` 可以原样复用。
- 最终文本也可以在 `deliverReply` 里截获 `info.kind==="final"` 的 payload（已验证）。

**(5) 补丁放哪**

都在 V 的 dist 里，下面的锚点各只出现一次（已验证）：

- **`telegram-ingress-drain-factory-DJM2Jqrc.js`**
  - 在 `registerTelegramHandlers`（4045–4076）里，`const message = createTelegramMessagePipeline(params);`（4046）之后，注册 `globalThis[Symbol.for("v.telegram.interSessionInbound")].set(accountId, fn)`。这里能拿到 `message.processMessageWithReplyChain`、`buildSyntheticTextMessage`、`buildSyntheticContext`、`authorization` 和 `params.bot`。
  - 在 `const originalStop = bot.stop.bind(bot);`（5008）包装的 stop 里注销。
  - 合成 ctx 需要自带 `update`（标记放在 `update.vInterSession`）、`me: bot.botInfo` 和 `getFile`。
- **`bot-message-DC6p8sB3.js`**
  - 在 `runTelegramDispatchTurn`（3547）里读 `context.primaryCtx.update.vInterSession`，设置 `context.ctxPayload.InputProvenance`。
  - 在 `replyOptions: {`（3631）里加 `runId` 和 `onAgentRunStart`。
  - 在 `deliverReply`（3315）里记下 final 文本，在 finally（约 3755）里 resolve。
- **marker**：新补丁要用新 marker。`apply()` 看到 `v-experience-telegram-v1` 就会整块跳过，所以必须叠在 v-experience 补丁之后。
- **跨进程**：sessions_send 可能在 worker 子进程里执行，而 globalThis 注册表只在 Gateway 进程里。因此要由插件 `registerGatewayMethod` 提供一个 Gateway RPC 来调桥（推断；v-session-relay 的 README 也写明了 Gateway 和 worker 是两个进程）。

**VLab 测试 bot 和 409**

- **有测试 bot**（已验证）：共享 VLab 实际生效的配置是 `state/shared-vlab-20260909-v3/openclaw.json`。其中 `channels.telegram` 已启用，botToken 是字符串（未打印），`dmPolicy: allowlist`，allowFrom 和 groupAllowFrom 只有 5368086561。token 和 bot id 都与 V 不同（只比对了 hash）。日志显示 10/20 15:28 仍在 poll-start，说明正在轮询。
- **第二个 poller 会冲突**（已验证）：polling lease 存在 `process[Symbol.for(...)]` 里，只在单个进程内有效，挡不住另一个进程或另一台机器。共享 VLab 10/15 的 10:59 和 11:06 已经出现过两次 `getUpdates conflict: terminated by other getUpdates request`。candidate 应继续用 `lab/candidate/telegram-fake-bot-api.mjs`（`apiRoot` 指向 loopback，假 token）。要看真实客户端的渲染，得先停掉共享 VLab 的 Telegram（需要 lease），或者另建一个 bot。

## 证据

上游代码引用以 `v2026.9.1:` 开头，路径在 `extensions/telegram/src/` 下；V dist 的路径相对于 `release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist/`。

- **V 捕获件与共享 VLab 一致**：两个 chunk 的 sha256 相同（f37781c4…、acdf98ee…）。
- **ingress**
  - `telegram-ingress-drain-factory.ts:85-92`：drain 调 `bot.handleUpdate`（dist 5527）。
  - `bot-core.ts:200-238`：beginUpdate。`:270`：sequentialize（dist 4860–4861，V 中间件在前一行）。`:399`、`:433`：processMessage 与 registerTelegramHandlers。`:473-480`：stop 包装与 `return bot`。
  - `bot-update-tracker.ts:216-261`：watermark 与语义去重。`bot-updates.ts:37-70`：更新键规则。
- **pipeline 门**：`bot-handlers.inbound-pipeline.ts:178`（skip）、`:181-192`（authorize）、`:224`（dedupe）、`:300`（自己发的消息）、`:432`（`bot.on`）。dist 对应 3141、3174、3235、3325。
- **授权**：`bot-handlers.inbound-authorization.ts:341-472`，私聊走 challenge 时 `enforceTelegramDmAccess` 会回配对消息。
- **持久去重**：`message-dispatch-dedupe.ts:16`（7 天）、`:56-77`（键）。
- **提及门**：`bot-message-context.body.ts:340`（forceWasMentioned）、`:392`（跳过）。
- **合成消息先例**：`bot-handlers.event-bindings.ts:387-413`（poll_answer，base 用 bot 自己的消息 id）、`bot-handlers.callback-router.ts:376-392`；dist 3356、3366、3887–4006、4019–4041。
- **ctxPayload 构建**：`bot-message-context.session.ts:689`、`:805`（extra）；`src/channels/inbound-event/context.ts:592` 展开 `...params.extra`。
- **provenance**：`src/auto-reply/reply/get-reply-run-execute.ts:255,300,504,553`；`source-reply-delivery-mode.ts:138-147`；`effective-reply-route.ts:40-46,86-102`；`followup-delivery.ts:114-135`。
- **run id**：`src/auto-reply/get-reply-options.types.ts:139,154`；`src/gateway/agent-turn/agent-job.ts:351`（全局 lifecycle 监听）。
- **dispatch**：dist 3547–3772，包括 workView、`replyOptions` 3631 和 finally 中的 `watchBackground`；`deliverReply` 在 3315。默认 progress 见 `preview-streaming.ts:15`。
- **409**：`polling-lease.ts:41-46`（进程内）；`polling-session.ts:654-673,861-890`（409 处理）；`journalctl -u openclaw-vlab-production-mirror-v8` 里 10/15 的两条冲突日志。
- **V 配置**（只读，用 sudo jq 删掉了 token）：`dmScope per-channel-peer`；telegram 绑定到 makaron；`groups "*" requireMention:false`；`queue steer`，telegram debounce 1000 ms。