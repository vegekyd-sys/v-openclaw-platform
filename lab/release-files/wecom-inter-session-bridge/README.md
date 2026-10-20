# wecom-inter-session-bridge — 企微的会话协作入站桥（WP8）

设计：`docs/inter-session/design.md` §3.9（另见 §2.a、§4、§7、§13）。R2 发版件，R1 不带。

## 由什么生成

- 输入：V 线上的企微插件 `dist/src/monitor.js`，即
  `release/captured/v2026.9.1-db91.6-subagent-index-20261020.wecom/dist/dist/src/monitor.js`
  （sha256 `d4fe3561…`，`tests/fixtures/inter-session-v-bytes.json` 记录，10/20 在 V 上核对过）。
  它已带 `v-experience-wecom-v2`，这个 marker 原样保留。
- 生成器：`node apps/v-experience/wecom/patch-inter-session.mjs <输入> <输出>`，marker
  `v-wecom-inter-session-bridge-v1`。每个锚点必须恰好出现一次，已打过补丁的文件会被拒绝。
- 产物：`dist/src/monitor.js`。`manifest.json` 给出 `before`（V 现在的 sha256）、`after`、
  发版计划的 `target`（`extensions/wecom-openclaw-plugin/dist/src/monitor.js`）和 V 上的路径。
  只改这一个文件；`v-experience.mjs` 的「会话请求」种类映射由 WP3 统一处理（§13.12）。
- 测试：`tests/patch-wecom-inter-session-bridge.test.mjs`。

## 补丁做了什么

| 位置 | 改动 |
|---|---|
| 认证成功 `setWeComWebSocket` 之后 | 注册桥 `wecom:<accountId>`（`Symbol.for("openclaw.v.interSessionInboundBridges")`）；monitor 的 cleanup 里注销（只删自己那个对象） |
| `post` | `getWeComWebSocket(acc).sendMessage(chatId, {msgtype:"markdown"})`；正文裁到 ≤1000 字且 ≤3800 字节（超出以「…」结尾）；未连接抛 `CHANNEL_DOWN`（可重试），企微拒收抛 `POST_FAILED` |
| `resolveRoute` | 只用会话存的 `delivery.to`（会话 key 已转小写，不能反推）；私聊 `single_peer`，群 `shared`；广播目标（party/dept/tag）、别的账号或别的渠道一律 `NO_ROUTE` |
| `start` | 构造合成帧，`enqueueWeComChatTask(() => processWeComMessageNow(entry))`，排在该聊天的串行队列里，不走 active-run 车道。帧标 `vFromCardEvent`，入口不开流、不发「思考中」、不调 `setReqIdForChat`；10 分钟还没轮到就报 `busy: pending_queue`，那条排队项轮到时什么也不做 |
| `buildMessageContext` | 跳过通讯录查人；动态路由之后把 `agentId/SessionKey` 强制改回目标会话；`CommandAuthorized:false`；ctx 加 `InputProvenance`、`ChannelPromptContext`、`CommandInterpretationSuppressed`、`SenderId/SenderName/MessageSid`、`VInterSession`，并清掉合成的 `ReqId/WeComFrame/ResponseUrl`。`ChannelPromptContext` 按 9.1 的类型写成**字符串数组** `[channelPromptContext]`：V 的 `appendChannelPromptContext` 只认数组，传字符串会被静默丢掉，模型看不到协作上下文 |
| `routeAndDispatchMessage` | `replyOptions` 加 `runId`、`vInterSession`、`onAgentRunStart`；ask_user 只认链根真人（`askUserAnswererId`）；结果在 `vStop` 拼后台行**之前**取；核心返回 BUSY 时直接收尾，`deliver` 收到什么都不发，聊天里零输出；合成回合**开跑之后**（`onAgentRunStart`）才登记本会话的问题路由，BUSY 的尝试不会抢走正在跑的那一轮的 ask_user；合成回合不改 main 会话的 lastRoute |
| `finishThinkingStream` | 协作回合的答复一律主动发 markdown，超过 3800 字节分段发（企微 markdown 上限 4096 字节） |
| ws `message` 入口 | 自回声防御：机器人自己发的、或与桥刚发出的请求正文相同（10 分钟内、同一聊天）的消息直接丢弃 |

`caps.streaming=false`：企微的流式回复只能挂在平台回调的 `req_id` 上，合成回合没有，所以
目标聊天里只能看到请求、单独发的问题、终稿和后台「已结束」行。对伪造 `req_id` 发
`aibot_respond_msg` 会被企微以 846605 拒绝；`lab/candidate/wecom-fake-aibot.mjs` 现在也这样拒绝并记录，
WP13 的 candidate 用 `respondsToUnknownReqIds()` 断言为空。

## 上线

R2 和 WP6/WP7/WP13 一起走 candidate → Tianyi 授权合 dev → 共享 VLab stage → Tianyi 授权上 V。
插件目录在 V 的 `/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin/`，Gateway 下次启动生效。
`v-experience-wecom-empty-reply`（10/16 的 #381）目前不在 V 上；如果它先上线，本补丁要按新的线上字节重新生成
（`before` 校验会挡住旧产物）。已试过：生成器能直接叠在 #381 的 monitor.js 上，所有锚点都在，`node --check` 通过。

## 验证

- 离线：`node --test tests/patch-wecom-inter-session-bridge.test.mjs`。除了字节和锚点，还把 V 的整套插件模块
  （捕获的 `dist/src`，换上生成的 `monitor.js`）配上桩模块（aibot SDK、plugin-sdk、核心 dispatch）真正跑起来：
  注册与注销、`resolveRoute`、`post` 的裁剪与错误分类、`start` 的 started / BUSY / GATED / RESTART_WEDGE、结果不含后台行、
  长答复分段、自回声丢弃、真人消息仍走原来的流式路径，以及整个过程没有对合成 `req_id` 的任何回复。
- candidate 冒烟：`lab/candidate/inter-session-wecom-smoke.plan.json`（私有 Gateway + 假企微机器人 + 真实 Worker 回合；
  一个只在 candidate 里加载的探针插件按 v-session-relay 的方式驱动桥）。没有 WP1 的核心守卫，所以不测 BUSY。
  2026-10-20 在 vlab91 跑了两次，都通过（`candidate-d37aba30-…` @34e10add，`candidate-a5621f83-…` @a7b10ec8，
  共享 VLab 未受影响，基线命中缓存）：
  - 真人消息照常流式回复，回复都挂在它自己的 `req_id` 上；
  - 协作请求（已有会话、从未入站的新会话各一次）：锚点和终稿都是主动 markdown，没有开流，
    没有任何对合成 `req_id` 或未知 `req_id` 的 `aibot_respond_msg`；
  - 企微链路上 A1/A2 成立：`onAgentRunStart` 报回的就是预设 runId（会话 `lastRunId` 也是它），回合跑在
    `vlab-worker` 上；transcript 里的 user 消息带 `provenance.kind = inter_session` 和
    `originSessionId = v-a2a:<chain>:1:req:<sendId>`；会话的 `deliveryContext.to` 是 `wecom:<chatId>`，正是 `resolveRoute` 用的格式；
  - `done` 的 finals 就是模型的答复，`visibleReplySent: true`。
- 评审修复后（`ChannelPromptContext` 改成数组、BUSY 不抢问题）在 vlab91 又跑了一次：`candidate-81a1563f-…` @ebd8a4a0，通过，
  共享 VLab 未受影响（基线未命中缓存，新建的是当前 VLab runtime `voice-spawn-20261020` 那份，按规则保留）。S2 的
  `channelPromptContext` 里放了一个只在那里出现的校验码，模型的答复带回了它（`ISC_WECOM_OK_…` 下一行是 `CTX…`），
  证明协作上下文真的进了提示词；改之前传的是字符串，V 的 9.1 会把它静默丢掉。
