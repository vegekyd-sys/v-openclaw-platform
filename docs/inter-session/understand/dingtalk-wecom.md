**直接结论**

1. **钉钉可以完整复用现有体验，企微不行。** 钉钉的 AI 卡片按会话目标（userId 或 openConversationId）主动创建，不依赖入站消息本身。所以一条合成入站也能拿到 V 已有的整套体验：流式卡片、工作视图、清单、工具行、后台行。企微的流式回复必须挂在平台推来的回调 `req_id` 上，合成入站没有这个 id。因此企微最多只能做到：一条原生请求消息、问题单独发、最终答复作为主动 markdown、后台「已结束」另发一条。中间过程无法流式显示。
2. **两个渠道都不能走现成入口 `handleDingTalkMessage` 或 ws `message`。** 这两个入口会做三件事，都会坏事：
   - 权限闸门；
   - 「待回答问题拦截」：B 的聊天里如果有未答的 ask_user，这条请求会被当成回答吃掉；
   - 钉钉会自动把 `CommandAuthorized` 判成 true，等于 A 能在 B 那里执行斜杠命令。

   正确做法：在插件内部新增一个导出入口，直接调用内部函数；补丁用自己的 marker。
3. **InputProvenance 能一路传到核心，但两个插件今天都没带上，需要补丁加。**
4. **run id：** 通过 `replyOptions.runId` 指定，核心会照用。如果 B 正忙，请求会被并入当前回合（steer），这时不产生新 run。
5. **V 与 VLab 字节一致。** 两边跑的都是 `lab/release-files/v-experience-channels` 的字节，sha256 逐个比对一致（已验证）。#381 的 empty-reply 版本两边都没装（已验证）。
6. **重新跑现有 `patch.mjs` 不会改任何东西。** `applyAll` 只要发现文件里已有 marker 就整文件跳过（dingtalk/patch.mjs:516，wecom/patch.mjs:416），所以新桥接必须单独做一个补丁。

下面引用中，DT = `release/captured/v2026.9.1-db91.6-subagent-index-20261020.dingtalk/dist/dist/`，WC = `…20261020.wecom/dist/dist/src/`。

---

## 钉钉（connector 0.8.26）

**(1) 链路（已验证）**
- Stream 回调进入 `connection-DCvu-l09.mjs:328`，先立即 ack，再按协议 id 去重（:343），然后调用 `messageHandler`（:379）。
- `handleDingTalkMessage`（message-handler-BUoLSylZ.mjs:2100）里依次是：V 的问题回答拦截（:2107），`prepareDingTalkMessage`（:1595，含 dm/group allowlist 和路由），`handleDingTalkMessageInternal`（:1768）。
- 之后：贴表情（:1932），组 `ctxPayload`（:1971），建 dispatcher（:1994，带 `vSessionKey`），调用 `dispatchReplyWithBufferedBlockDispatcher`（:2016，用低层 `dispatchReplyFromConfig`，所以忙时由核心决定排队或 steer）。
- 渲染：`onReplyStart` 调 `startStreaming` 后走 `createAICardForTarget(account.config, target)`（:356，不需要 sessionWebhook）。`onPartialReply` 加上 `vWork.compose` 做工作视图；收尾时 `finishCardOnce` 之后接 `vStartBackground` 写后台行（:445）。
- 页脚：v-experience.mjs 里没有 footer 相关代码，钉钉和企微都没有运行时页脚。

**(2) 注入合成入站**
- 先发原生请求消息：`sendProactive(config, {userId}|{openConversationId}, text, {msgType:"markdown", useAICard:false})`。这个函数已经被 runtime 补丁导入，名字是 `vSendProactive`（runtime-C81EKBS1.mjs:10；messaging 导出 `i as sendProactive`，:686）。机器人自己发的消息不会触发回调（推断）。
- 然后构造 `data` 和 `prepared`，直接调用 `handleDingTalkMessageInternal`。这样会绕开连接层去重、allowlist 和问题拦截。
- 还需要补的几处：
  - **sessionWebhook：** 合成入站没有，而以下回退路径都用它（:240/453/483–497/545/550/744/789–797/2085）。如果建卡失败（V-Makaron 在 10/06 前就一直 403），最终答复会静默丢失，需要改成 proactive 发送。
  - **贴表情：** 跳过 `addEmotionReply`/`recallEmotionReply`，否则会对一个假 msgId 调接口。
  - **MessageSid：** 必须每次唯一。核心按（channel, peer, session, MessageSid）去重，TTL 20 分钟（核心 inbound-dedupe.ts:13,56-59）。
  - **群聊的 senderId：** 传 undefined。否则 ask_user 只接受这个合成发送者的回答（v-experience.mjs:1093）。
- 不要从 sessionKey 反推 conversationId，要用会话 delivery 里存的 `to`（推断）。`dingtalk-peer-case` 补丁在 V 和 VLab 都没装（已验证），群的 cid 在 sessionKey 里已被转成小写。
- **队列：** 插件没有自己的队列，核心默认模式是 `steer`（核心 queue/settings.ts:36）。B 忙时，这条请求会并进 B 正在跑的那张卡。

**(3) InputProvenance：** `ctxPayload` 字面量（:1971-1993）里没有这个字段。核心的 `finalizeInboundContext` 会原样保留它（inbound-context.ts:122-130）。核心随后：
- 用于 run（get-reply-run-execute.ts:255）；
- 给 prompt 加 inter-session 标注（prompt-prelude.ts:78-80）；
- 视为合成回合，不改写会话的回复策略（source-reply-delivery-mode.ts:142-150）。

在 VLab 上群聊 `visibleReplies` 是 automatic，所以不会被压成 message_tool_only（已验证配置）。

**(4) run id 和最终答复：** dispatch 只返回 `{queuedFinal, counts}`。可以在 :2016 处传 `replyOptions:{...replyOptions, runId, onAgentRunStart}`（get-reply-options.types.ts:138-158；agent-runner-execution.ts:164）。最终文本有两种拿法：包一层 `deliver` 截取 kind=final，或沿用现有 agent.wait 加读历史。

**(5) 补丁点**
- connection chunk 在 :328 前后：用 `Symbol.for("openclaw.v.interSessionInbound")` 注册 `{accountId → req ⇒ messageHandler({...,data:合成, vInterSession:req})}`。闭包里的 cfg、account、runtime 在这里能拿到（:49,:379）。
- message-handler 的 :2100 入口：遇到 `vInterSession` 时跳过 prepare 和拦截。
- :1971 ctx：加 `InputProvenance`、设 `CommandAuthorized:false`。
- dispatcher（:170）：把 sessionWebhook 发送改成 proactive。
- 注意跨进程：worker 里的 `sessions_send` 拿不到 Gateway 进程里的 Symbol 注册表，必须先经一个 Gateway 方法转一次（推断）。

## 企业微信（plugin 2026.8.17-vlab.2）

**(1) 链路（已验证）**
- ws `message`（monitor.js:1007）→ `prepareWeComMessage`（:689，空消息、群策略、DM 策略、下载媒体）→ V 问题回答拦截（:1021）。
- 有任务正在跑时转到 `chatId:active-run` 车道交给核心 steer（:1036），否则 `enqueueWeComChatTask` 按 `accountId:chatId` 串行（:1044；chat-queue.js 里用 `prev.then(task,task)` 串起来）。
- `processWeComMessageNow`（:797，会 `setReqIdForChat`）→ `buildMessageContext`/`finalizeInboundContext`（:190）→ `routeAndDispatchMessage`（:374）。
- 回复是对 `frame` 的 `replyStream`，V 的 `vFlush` 每 400 ms 刷一次工作视图，回合结束时 `vStop` 把后台行并入最终答复（:655）。

**(2) 注入合成入站**
- 原生请求消息：`getWeComWebSocket(acc).sendMessage(chatId,{msgtype:"markdown"})`。SDK 主动发送只支持 markdown 和 template_card，不能主动发流（aibot SDK index.cjs.js:1129-1159）。
- 合成帧没有有效的 `req_id`。插件自己在注释里写明非回调帧会报 846605（message-sender.js:46-47）。
- 可用的现成通道有两条：
  - 帧带 `vFromCardEvent`，V 补丁会把 `streamExpired` 设为 true（:390），终稿走主动 markdown（:364）；
  - 或令 `body.msgtype="event"`，中间帧直接跳过（message-sender.js:48-63）。
- 构造 entry 后直接 `enqueueWeComChatTask({chatId, task:()=>processWeComMessageNow(entry)})`。这样会排在 B 正在跑的回合之后，成为单独一轮；走 active-run 车道则会 steer 进当前回合。
- 跳过 `setReqIdForChat`。
- `SessionKey` 要强制写成目标会话，因为 `processDynamicRouting` 可能改写 key（:134 起）。
- 「复用该聊天最近一条真实回调的 req_id 再开一个流」能不能行：未验证，需要真机试。

**(3) InputProvenance：** `finalizeInboundContext({...})`（:190-218）里没有。在这里加上，同时把 `CommandAuthorized`（:209）对合成请求强制为 false。

**(4) run id：** 往 :542 的 `replyOptions` 里加 `runId`。终稿取 `deliver` 累积的 `state.accumulatedText`，注意要在 `vStop` 拼上后台行之前取。

**(5) 补丁点：** 在 `wsClient.on("authenticated")` 里，紧跟 `setWeComWebSocket` 之后（:910）注册桥接器。`buildMessageContext`、`processWeComMessageNow`、`routeAndDispatchMessage` 各认一个 `entry.vInterSession` 标志。

## 测试机器人，以及会不会抢事件

- **测试机器人：**
  - 钉钉「Vlab」：扫码注册，凭据变量 `VLAB_DINGTALK_TEST_CLIENT_ID/SECRET`（docs/v-experience.md:213）。
  - 企微测试机器人：仓库里没记名字，变量是 `VLAB_WECOM_TEST_BOT_ID/SECRET`。
  - 两个都写在共享 VLab 的生效配置 `shared-vlab-20260909-v3/openclaw.json` 里且是 enabled。
  - 共享 VLab 目前两个都连着（已验证）：journal 显示 dingtalk-connector 10/20 14:41 重连成功，企微 Authentication successful；`ss` 能看到 Gateway 到 openws.work.weixin.qq.com（43.163.165.94）的连接。
- **现有 candidate 不会抢：** 脚本会整体替换 `config.channels`，只连本机假平台（dingtalk-experience.mjs:105-117；wecom-experience.mjs:84-90）。
- **如果 candidate 用测试机器人凭据：**
  - **企微：** 新连接会把共享 VLab 踢下线（SDK :383-395）。插件被踢后故意不自动重连（monitor.js:931），共享 VLab 的企微会一直断着，直到重启。这比抢事件更严重（已验证代码）。
  - **钉钉：** 同一应用的多条 Stream 连接会被平台随机分配事件；connector 收到就 ack，不会重投，所以被分到 candidate 的消息在共享 VLab 那边就丢了（推断，和飞书 runner 那次同类）。
- **生产 V 不受影响：** 钉钉生产用的是另一个应用 V-Makaron（凭据不同，已验证）。

## 可复用的假平台

`lab/candidate/` 下：
- `dingtalk-fake-open-api.mjs`、`dingtalk-experience.mjs`；
- `wecom-fake-aibot.mjs`、`wecom-experience.mjs`；
- `channel-cards-support.mjs`、`model-roles.mjs`；
- 计划文件 `dingtalk-{experience,experience-baseline,experience-card,handoff-card,model-roles,secret-link,tool-only}.plan.json`、`wecom-{experience,experience-baseline,handoff-card,handoff-card-loopback,model-roles,secret-link,tool-only}.plan.json`；
- 输入：`apps/v-experience/{dingtalk/fetch-connector.sh,wecom/fetch-plugin.sh}` 会把插件代码拷到 `tmp/inputs/`；
- 基线：`apps/v-experience/*/baseline/`。

假平台的盲区：
- 企微 fake 对任何 `req_id` 的 `aibot_respond_msg` 都接受，没有模拟 846605（wecom-fake-aibot.mjs:41-58），也没有模拟「新连接踢旧连接」。企微流式能否成立，只能在真机上验证。
- 钉钉 fake 会记录 webhook 请求，所以「合成入站没有 sessionWebhook」这个故障在 fake 上能复现出来。