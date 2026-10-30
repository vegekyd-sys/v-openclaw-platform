# V App 渠道（vapp）设计

2026-10-30 CST。Tianyi 定：V 的 iOS App 作为 V Experience 的一个渠道，体验和飞书 1:1，
以后的体验优化只做一次（规划见 v-voice `client/docs/plan.md`）。本文是服务端这一半。

## 1. 为什么是渠道，不是 operator 客户端

App 现在以 operator 身份连 Gateway，自己用 Swift 从 `chat` / `agent` 事件拼工作卡。问题：

- 飞书上的体验大半不在 Gateway 事件里（插件卡片、插话、Harness 切换、页脚），App 永远追不上；
- operator 能看全部会话，等于管理员，不能给别人用；
- 每次体验改动都要在 Swift 里再做一遍。

做成渠道后，App 和飞书、钉钉一样是「一个人在某个渠道里和 V 说话」：身份、主人规则、命令权限、
插话都走渠道那一套；工作卡由 V Experience 算好，App 只画。

## 2. 结构

```
App ──WS（同一条 Gateway 连接，设备身份）──► Gateway
  vapp.send / vapp.action / vapp.history        │
  ◄── plugin.vapp.card / plugin.vapp.message    │
                                                ▼
                       vapp 渠道插件（apps/v-experience/app/）
                         入站：消息 → 渠道入站上下文 → agent 回合
                         回合回调 → V Experience 工作视图 → V 卡片
                         出站：文本 / 媒体 / presentation → V 卡片或消息
```

### 2.1 传输：复用 Gateway 连接

不另开端口、不另起服务：

- **App → V**：插件用 `api.registerGatewayMethod` 注册 `vapp.send`、`vapp.action`（按钮回调）、
  `vapp.history`。App 已有的设备配对和令牌就是鉴权；处理函数拿到 `client`（连接、设备 ID）。
- **V → App**：处理函数的 `context.broadcastToConnIds(event, payload, connIds)` 推给这个用户的连接。
  9.1 允许 `plugin.*` 命名的事件发给带 `operator.write` 的客户端（`server-broadcast.ts`），
  所以事件叫 `plugin.vapp.card`、`plugin.vapp.message`。插件记住「用户 → 在线连接」。
- 以后 App 不再需要 `operator.read` 看全部会话；普通用户的设备只给 `operator.write`。
  主人的「控制台」视图仍用现在的 operator 能力。

### 2.2 身份与会话

- App 用户 ID：`vapp:<userId>`。v1 只有一种来源：配对时设备 ID 绑定到一个 V 用户
  （主人设备 = Tianyi）。以后飞书登录 / Apple 登录 / 手机号都只是「把设备绑到同一个 V 用户」的不同方式。
- 会话键：`agent:<agent>:vapp:direct:<userId>`；群聊沿用飞书群（App 里看飞书群是控制台视图，不是 vapp 会话）。
- 同一个人在飞书和 App 是同一条私聊：`session.identityLinks` 把 `feishu:<ou_…>` 和
  `vapp:<userId>` 映射到同一个规范身份（9.1 原生配置，`config/types.base.ts`）。
- 主人判定、`commands.allowFrom`、命令权限 V3 的渠道列表里加上 `vapp`。

### 2.3 入站

`vapp.send {text, media?, clientMessageId}` →
`runtime.channel.inbound.runChannelInboundEvent`（或 `dispatchChannelInboundReply`），
入站上下文带发送者、会话、媒体（`toInboundMediaFacts`）。回合进行中再发的消息按飞书插话规则注入（C2）。

### 2.4 回合可见性 → V 卡片

回合回调（`onPlanUpdate`、`onToolStart`、`onItemEvent`、压缩回调、`progressCard` 监听）喂给
`createWorkView()`；每次变化（节流 300 ms）用 `workCard({answer, view: view.snapshot(), phase, background})`
算卡片，推 `plugin.vapp.card {sessionKey, runId, card}`，同一个 `runId` 原地替换。
回合结束推最终卡片（只留答案和页脚）。后台任务行用 `watchBackground`。

### 2.5 提问、审批、插件卡片

- `ask_user`：`onQuestionRequested` → `questionCard(record)`；按钮回调
  `{kind: "question", id, question, option}` / `{submit: true}` → `vapp.action` → 暂存或 `question.resolve`。
- 审批：飞书的私聊审批逻辑迁入 V Experience 后（阶段 3）同样出卡；之前 App 继续用 operator 的
  `session.approval` 订阅。
- 插件卡片（「电脑」接管、凭据、夜班）：插件发的是 presentation，渠道出站实现
  `renderPresentation` → V 卡片；按钮的命令（`/v-handback <id>` 等）由 App 作为点按者的消息发回。

### 2.6 出站

`message` 工具和普通回复发到 vapp 目标时：文本 → `plugin.vapp.message`；媒体 → 带 V 媒体源
（App 用 `assistant-media` 路由取，已实现）；presentation → V 卡片。用户不在线时消息留在会话里，
App 上线后 `vapp.history` 补齐（以后加推送）。

## 3. 第一步做什么（阶段 1）

1. 插件骨架：`api.registerChannel` 最小适配器（配置、会话语法、出站文本）+ 三个 gateway 方法。
2. 入站一条文本 → 真实模型回合 → 工作卡事件 → 最终卡片。
3. `ask_user` 卡片和按钮回答。
4. candidate：私有 Gateway + 假 App 客户端（Node，走真实 WS 和设备签名），断言收到的卡片序列；
   再用模拟器连同一个 candidate 看一遍。

验收：同一个回合，假飞书收到的卡片和 App 收到的 V 卡片语义一致（答案、清单、后台行、提问）。

## 3.1 第一版实现（2026-10-30）

- 插件：`apps/v-experience/app/`（`index.js` 接 9.1 SDK，`core/vapp.js` 是逻辑，测试 `tests/vapp-channel.test.mjs`）。
  安装时把 `apps/v-experience/v-experience.mjs` 复制到插件目录覆盖同名转发文件（插件加载器不支持顶层 await）。
- 配置：`channels.vapp = {defaultUser, users: {<id>: {name, owner, devices: [设备 ID]}}}`；
  `bindings` 加 `{agentId, match: {channel: "vapp"}}`；`commands.ownerAllowFrom` 加 `vapp:<主人 id>`。
  没列在 `devices` 里的已配对设备算 `defaultUser`（只有主人用的阶段）。
- 方法（都是 `operator.write`）：
  - `vapp.hello` → `{userId, sessionKey, cardVersion}`
  - `vapp.send {text, media?, quote?, clientMessageId}`：有待答问题时直接当回答。附件单个不超过 18 MB（一帧 25 MiB）。
  - `vapp.action {value, form?}`：`question` / `command` / `secret` 回调。`secret` 的值只进 `question.resolve`，不进日志和记录。
  - `vapp.stop`：用渠道自己的 `/stop` 停掉这个用户进行中的回合。
  - `vapp.history {before?, limit?}` → `{items, hasMore, live}`：见下面的聊天记录。
  - `vapp.react {messageId, emoji, remove?}`：用户加表情，V 在下一轮知道。V 这边走 `message` 工具的 `react`。
  - `vapp.push {token, sandbox?}`：登记 APNs 令牌。
  - `vapp.deliver`：Worker 等其他进程的出站转给 Gateway。
- 事件：`plugin.vapp.card {sessionKey, turnId, cardId, seq, at, final, live, card | removed}`，同一 `cardId` 按 `seq` 原地替换，
  `live` 表示还在变；提问卡 `cardId = q:<questionId>`；问题答完后回复接着出在新卡片 `<turnId>:<n+1>`。
  `plugin.vapp.message {id, sessionKey, at, text?, media?, card?}`；`plugin.vapp.user`（用户自己发的，多设备同步）；`plugin.vapp.reaction`。
- 聊天记录：`<state>/vapp/<user>.jsonl`，每人保留最近 600 条（用户消息、定稿卡片、消息、表情），异步写，不碰会话转录，
  所以大会话也不会卡 Gateway。进行中的卡片只在内存（`live`），断线重连时随 `vapp.history` 补回；App 里还显示进行中、
  但服务端既没记录也不在 `live` 里的卡片，是 Gateway 重启切断的，App 标为「连接中断」。
- 其他来源的回合：`runtime.events.onAgentEvent` 看到这个会话上不是 `vapp.send` 发起的回合（跨会话派活、语音委派、
  定时续接、子 agent 回报、别的设备的操作者消息）也出同样的卡片；核心随后用消息送达同一份回复时，卡片撤掉不重复。
  生命周期开始事件可能还没有会话键，所以按第一个带会话键的事件认领。Worker 回合可能不流式，结束时从 `chat.history` 尾部取答案。
- 审批：App 以 `operator.approvals` 收 `exec/plugin.approval.requested`，卡片出现在 App 私聊（和飞书发到 owner 私聊一致）。
- 推送：`channels.vapp.apns = {keyFile, keyId, teamId, bundleId}`；没配就不发。每个回复、提问、消息都推，
  因为服务端判断不了 App 是否真在前台（断掉的连接几分钟内看着还活着），由 App 在正在看那个会话时隐藏横幅。
- App（v-voice `claude/v-client-feishu-cards`）：连上后调 `vapp.hello`，App 私聊走上面这套；其他会话仍是控制台视图。
- 「电脑」接管卡：接管插件的代码不动（它的发布字节被锁定），部署时在它的配置里把 `vapp` 加进 `cardChannels` 和 `nativeCardChannels`。
  状态变化的提示语目前只发给钉钉和企微，App 上卡片不会提示状态变化，要等下一次改接管插件时加上。
- 还没做：多用户登录；`session.identityLinks` 需要部署时配 Tianyi 的飞书 open_id；飞书群的回复只在 App 内（`deliver:false`），
  要不要代发到飞书群待定。

已知差异：回复中发的第二条消息现在是紧接着的第二条回复，内容不丢，但没有并入当前回合（核心走了 followup 而不是 steer）。
钉钉的 candidate 要求并入。原因待查。

## 4. 待确认

- 9.1 的渠道插件最小必需面（`registerChannel` 的哪些适配器可以省）——照钉钉连接器的结构先跑通再删。
- `plugin.*` 事件对只有 `operator.write` 的设备是否也受会话订阅限制（`SESSION_SUBSCRIPTION_EVENTS` 不含 `plugin.*`，预计不受）。
- 推送（APNs）放在插件里还是单独服务。
