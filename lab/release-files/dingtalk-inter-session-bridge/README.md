# 钉钉入站桥（sessions_send，WP7）

设计：`docs/inter-session/design.md` §2.a、§3.8、§13。marker `v-dingtalk-inter-session-bridge-v1`。

## 内容

| 文件 | 来源 |
|---|---|
| `dist/connection-DCvu-l09.mjs` | V 线上字节（`release/captured/v2026.9.1-db91.6-subagent-index-20261020.dingtalk/dist/dist/`，10/20 在 V 上逐字节核对过）+ `patchConnectionChunk` |
| `dist/message-handler-BUoLSylZ.mjs` | 同上 + `patchMessageHandlerChunk` |
| `manifest.json` | 每个文件的 V 路径（`hostPath`）、`before`（V 现有字节）、`after`（本补丁） |

两份文件都叠在 V 已有的 `v-experience-dingtalk-v1` 之上；生成器拒绝没有这个 marker 的字节（npm 原版），也拒绝已带本 marker 的字节。

重新生成或核对：

```
node apps/v-experience/dingtalk/patch-inter-session.mjs          # 写入本目录
node apps/v-experience/dingtalk/patch-inter-session.mjs --check  # 只核对，不一致退出 1
```

stage 时逐个文件校验 `before`；V 上的钉钉插件目录换了 generation，就按新捕获重新生成（记忆 release-artifact-rebase-trap）。

## 行为

**connection（每个账号一个桥）**
- `monitorSingleAccount` 的闭包里注册 `dingtalk:<accountId>`；连接停止（abort、连不上、进程退出）时在 `stop()` 里注销。
- 连接器的默认账号叫 `__default__`，核心在会话没有 accountId 时用 `default`：两个键都注册（同一组方法）。
- `resolveRoute`：只用会话存的 `delivery.to`（裸 id、`user:`、`group:`、`dingtalk-connector:group:` 都认）。没有就 `NO_ROUTE`，绝不从 sessionKey 反推（cid 已被转小写）。群为 `shared`，私聊对端在 `ownerIds` 里为 `owner_only`，否则 `single_peer`。
- `post`：`sendProactive(…, {msgType:"markdown", useAICard:false})`，返回 `processQueryKey` 作 messageId；失败抛 `BridgeError`（4xx 非瞬时，5xx/429/网络为瞬时）。至少一次，没有幂等。
- `start`：构造合成 `data`（群：`conversationId = openConversationId`；私聊：`dm:<userId>`，发送者是对端），以 `params.vInterSession` 调用连接器自己的 `messageHandler`。`onAgentRunStart` 时返回 `started`，核心守卫调 `onBusy` 时返回 `busy`；开跑前的异常按文本分 `RESTART_WEDGE` / `CHANNEL_DOWN` / `INTERNAL`。
- 没有 `onAgentRunStart` 但核心报了终态（例如 harness 接手前就失败的未知模型）或已经发出回复：仍算 `started`（与飞书桥一致），`done` 带这个结果，账本记 started_failed 而不是 not_started。什么都没发生才是 `GATED`。
- BUSY / GATED 的尝试没有 run，核心的 typing 也没开始，分发器收不到 `onCleanup`；桥在 handler 返回后释放它的工作视图和问题路由（否则每次退避重试都留一个进度卡监听器）。
- 自回声防御（A11）：Stream 回调的发送者就是机器人，或正文就是本进程 10 分钟内发出的锚点，直接丢弃。

**message-handler（协作回合）**
- 入口跳过 `prepareDingTalkMessage`（白名单、路由）和待答问题拦截，路由强制为目标会话。
- 不贴/不撤表情；不做斜杠命令归一化和养成系统命令；`asyncMode` 对协作回合关闭（否则 BUSY 时会先发确认语）。
- ctx：`InputProvenance`、`ChannelPromptContext`（9.1 的类型是 `string[]`，写成 `[channelPromptContext]`；传字符串会被 `appendChannelPromptContext` 静默丢掉，模型看不到协作上下文）、`CommandInterpretationSuppressed:true`、`CommandAuthorized:false`、`SenderId`/`SenderName`（chain-root 规则，取自请求）、`From` 同 `SenderId`、`MessageSid`、`VInterSession`。
- replyOptions：`runId`、`vInterSession`、`onAgentRunStart`、`onAgentRunTerminalOutcome`。
- AI 卡只在 run 开跑后创建（原来在 `onReplyStart`）；空闲提示、会话问题路由也等开跑后才生效。BUSY 时聊天里什么都不出现。
- 回复分发器里所有走 sessionWebhook 的发送（错误兜底、关卡失败降级、空闲提示、问题、迟到 block、非流式终稿、actionCard）改为主动消息发到同一聊天；dispatch 异常直接抛给桥，不发 webhook 错误回复。
- `deliver(kind=final)` 截获终稿文字和媒体（不含 ask_user 问题载荷），作为 `RunOutcome.finals`。
- 私聊里协作回合问的 ask_user 记在 `<accountId>:dm:<userId>` 下；对端在真实私聊里的回答照样被拦截为答案。

## 已知差距

- 钉钉没有页脚（今天也没有）；机器人消息不能编辑，锚点不能被回复卡挂住。
- 协作回合的兜底主动消息不做 @机器人 名称替换（原 webhook 路径的 `substituteBotMentions`）。
- 合成回合拿不到机器人的 `chatbotUserId`，ctx 里 `BotChatbotUserId` 为空。
