> **2026-10-20 执行决定（Claude，待 Tianyi 验收时确认）**
> - 按本设计实施；R1 与 R2 合并，四个渠道一起做完再交验收。
> - §12.2 默认：(1) 严格批次；(2) 有外人的群可见正文裁到 200 字；(3) 不额外加对外发送闸；(4) worker 轮询硬闸按 `requester_tail_ms` 判据；(5) 先只读确认 VLab bot 的 `im:chat` 权限，有则一次性建 3 个「VLab 测试｜房间」群复用，绝不用生产 app 的 lark-cli；(6) 企微不流式、钉钉无页脚照实说明。
> - 调查报告原文：`docs/inter-session/understand/`。

# V 跨会话协作最终设计：`sessions_send` 经渠道入站桥 + Gateway 账本（综合版）

**基线**
- 分支：`claude/cross-session-task-coordination-f7789a`
- V 字节：`release/captured/v2026.9.1-db91.6-subagent-index-20261020{,.feishu,.dingtalk,.wecom,.worker}`。这是目前 git 里最新的 V 捕获。WP0 要先确认 V 线上没有更新的发版；stage 时会逐个文件校验 `before`。
- 底稿：评审多数票选出的 reliability 设计。
- 嫁接：minimal 的爆炸半径控制（插件只在 Gateway 加载、`DISABLED` 开关、plugin-sdk 预检、交接点放在读历史之前、全局并发上限）；UX 的文案、边类型、脱敏和续接测试。
- 修正：三位评审列出的全部 must-fix 和 fatal flaw，逐条见附录 A。评审意见冲突时的裁决见附录 B。

**证据标注**
- 【核实】：本轮只读读过 V 捕获字节或 `~/openclaw-versa` 的 v2026.9.1 源码，带 file:line。附录 C 汇总。
- 【报告】：引自 understand 下的调查报告，与 critic 冲突时以 critic 为准。
- 【假设 A#】：未验证，第 12 节列出验证方法和退路。

**行号前缀**
- `S:` = `…20261020/dist/sessions-spawn-tool-1FQMTkIo.js`
- `G:` = `…/get-reply-CqW1y05D.js`
- `R:` = `…/agent-runner.runtime-CAdsMsQt.js`
- `T:` = `…/task-registry-activity-DSlVVJwD.js`
- `M:` = `…20261020.feishu/dist/dist/monitor.account-WFdlCDhR.js`
- `BM:` = `…/bot-message-DC6p8sB3.js`
- `TG:` = `…/telegram-ingress-drain-factory-DJM2Jqrc.js`

---

## 1. 总体架构

### 1.1 一句话

`sessions_send` 仍是唯一入口。核心补丁照常做原生校验，然后把这次发送交给 Gateway 里的 `vrelay.send`。之后发请求、排队、等待、收齐和唤醒全部由 Gateway 里的插件 `v-session-relay` 2.0 负责：

- **请求（对方侧）**：先由渠道桥在对方聊天发一条原生「📨 请求」消息，再合成一次普通入站交给该渠道原来的 handler。对方因此拿到和真人发消息完全一样的流式卡、过程流、清单、后台行、runtime 页脚、ask_user 和图片文件，插话也照常可用。
- **唤醒（发起方侧）**：同样走桥：先发一条「↩️ 交回」消息，再合成一次入站，发起方开一张普通回复卡，汇报一次。
- **worker 不再持有任何等待。**

### 1.2 进程分工

```
 发起方回合所在进程                                   Gateway 进程（账本唯一写者）
 ┌────────────────────────────────┐  vrelay.send   ┌──────────────────────────────────────────────┐
 │ sessions_send（核心补丁 v3）      │──RPC(write)──►│ v-session-relay 2.0（只在 Gateway 加载）          │
 │ 原生 allow/可见性/sandbox 校验     │◄─accepted──── │  ledger：sends/batches/runs/chains，异步原子写    │
 │ 交接点：读 baseline 历史之前        │  vrelay.wait  │  policy：边分类/层数/预算/防死锁（唯一执行点）       │
 │ inline：≤55 s 一片长轮询（≤300 s） │◄─result────── │  engine：每目标 FIFO、全局上限、批次、续接、唤醒     │
 │ async：立即返回 note               │               │  recovery：启动后后台续跑，不阻塞新请求             │
 │ 写进程内 accepted 表（给轮询闸用）   │               │  tasks：后台行数据源（extraSources）               │
 └────────────────────────────────┘               │  guard：before_tool_call 轮询闸（Gateway 内工具）    │
  worker 子进程 / Gateway 内 codex 动态工具 /         │  transports：bridge ｜ agent（callGatewayFromCli）  │
  /vcc MCP loopback                                └───────────────┬──────────────────────────────┘
                                                                     │ registry.bridges.get("feishu:default")
                               ┌─────────────────────────────────────▼───────────────────────────────┐
                               │ 渠道入站桥（dist 补丁，Gateway 内；R1 只有飞书，R2 加 TG/钉钉/企微）          │
                               │  post()：请求锚点 / 交回锚点 / 失败说明（飞书带 uuid 幂等）                   │
                               │  start()：合成入站 → 原 handler → 核心 dispatch                            │
                               │     → G 独占准入守卫：忙则 BUSY（零可见输出），闲则带预设 runId 立即开跑          │
                               │     → 原流式卡/过程流/清单/后台行/页脚/ask_user/图文/插话（全部复用）              │
                               │  done：截获 deliver(kind=final) 的文字和媒体                               │
                               └─────────────────────────────────────────────────────────────────────┘
  没有桥的渠道（R1 的 TG/钉钉/企微）或无渠道会话（main/webchat）：
      agent transport = Gateway "agent"（deliver:true，即 v2 语义）+ 渠道 outbound.sendText 发可见请求
  插件缺席、DISABLED 或不支持的发起方（subagent/隔离 cron/hook）：核心照常走 v2 路径
```

### 1.3 时序

**A. 异步单件**（发起方 A 在飞书私聊，目标 B 是飞书群）

```
A 回合 rA ─ sessions_send(B, msg, timeoutSeconds:0)
 └► vrelay.send：去重 → 边分类/预算 → 写账本(accepted) → 同步发锚点(≤5 s) → 进 B 的 FIFO → 返回 accepted
    A 拿到 note「结果会作为新的一轮回来，现在结束本轮」→ 一句话收尾
    A 的卡片后台行出现「⏳ 后台 1 项进行中 · 会话请求」
engine：B 预检空闲 → bridge.start(runId=v-a2a-req-<sendId>-0)
    → B 群：「📨 来自「Tianyi 私聊」的请求 #7F3A」下面挂 B 的普通流式卡
    → done(finals) → target_done → B 没有子请求、没有后台工作 → result_ready
    → A 的批次已封口（rA lifecycle end）且全员终态 → 等 A 空闲
    → A 私聊：「↩️「任务群 a」交回了 #7F3A 的结果」→ bridge.start(runId=v-a2a-wake-<batchId>-0)
    → A 的普通流式卡汇报一次 → batch woken，send handed_back
```

**B. 续接：A → X → 三个房间**

```
A(depth0) ─async→ X(depth1)：X 的第一轮建群，对三个房间各 sessions_send(timeoutSeconds:0)，然后说「三个群已开工」
   X 的第一轮结束：S(A→X) 有未完成子批次 B1，所以进 awaiting_children。「已开工」这句不交给 A
   房间 a/b/c 各在自己群里流式工作；a 可以 inline 问 X 或问 b（§5）
   三个结果齐 → 唤醒 X 一次（该回合 servesSendId=S）→ X 汇总 → 没有新的未完成项 → S.result = X 汇总
   → A 的批次齐 → 唤醒 A 一次 → A 向 Tianyi 汇报一次
```

**C. inline 提问**（房间 a 问它的请求方 X）

```
a 回合 ─ sessions_send(X, "问题", timeoutSeconds:120) → vrelay.send(edge=ask, mode=inline)
   X 空闲 → X 聊天出现「❓「任务群 a」问 #Q2」+ X 的叶子回合卡片（不能再发 sessions_send）
   vrelay.wait 原子领取答案 → a 的工具结果 ok → a 在同一轮继续
   超过 inline 上限仍未答完 → 转异步：答案以唤醒形式回到 a（服务于 S(X→a)）
```

### 1.4 谁等、谁唤醒

| 动作 | 由谁做 | 依据 |
|---|---|---|
| 等目标回合结束 | Gateway engine：await 桥的 `done` promise，或 agent transport 的 `agent.wait`；状态逐步落盘 | worker 池看不到 worker 内的等待，回收或换代会丢回信【critic §一.4】 |
| 唤醒发起方 | engine：经发起方渠道的桥（R1 飞书），否则用 agent transport | 只有入站链路有卡片体验【harness (2)】 |
| inline 等待 | 发起方工具循环调 `vrelay.wait`（每片 ≤55 s，总共 ≤300 s），由 Gateway 原子领取 | 领取是 CAS，与异步唤醒互斥 |
| 判断忙闲 | 核心 G 的独占准入守卫是唯一权威；插件预检只是优化 | §4 |
| 防兜圈 | 只在 `vrelay.send` 执行 | §5 |

---

## 2. 接口契约

所有常量都放在 `apps/v-session-relay/plugin/core/contracts.js`（WP0）。dist 补丁内联同名字面量，测试断言两边一致。

### 2.a 渠道入站桥注册表

```ts
// ---- 注册表（渠道补丁与插件用同一句取到同一个对象）----
const BRIDGES = Symbol.for("openclaw.v.interSessionInboundBridges");
type BridgeRegistry = {
  v: 1;
  bridges: Map<string, InterSessionBridge>;     // key = `${channel}:${accountId}`；accountId 先 normalizeAccountId，空则 "default"
  listeners: Set<(key: string, bridge: InterSessionBridge | null) => void>;  // 插件恢复时等桥就绪
};
const reg: BridgeRegistry = (globalThis[BRIDGES] ??= { v: 1, bridges: new Map(), listeners: new Set() });
// 注册：reg.bridges.set(key, b); for (const l of reg.listeners) l(key, b)
// 注销：只在 reg.bridges.get(key) === b 时删除，并调用 l(key, null)

interface InterSessionBridge {
  v: 1;
  channel: "feishu" | "telegram" | "dingtalk" | "wecom";
  accountId: string;
  caps: {
    streaming: boolean;        // feishu/telegram/dingtalk=true，wecom=false
    replyAnchor: boolean;      // 回复卡能否挂在锚点下：feishu 群、telegram=true
    idempotentPost: boolean;   // 只有 feishu=true（im.message.create 的 uuid，1 h 去重）
    editPost: boolean;         // 只有 feishu=true
    maxVisibleChars: number;   // feishu 1500 / telegram 3500 / dingtalk 1500 / wecom 1000
    maxVisibleBytes?: number;  // wecom 3800（UTF-8）
    askUser: boolean; media: boolean;
  };
  resolveRoute(q: RouteQuery): Promise<RouteResult>;
  post(p: PostRequest): Promise<PostResult>;      // 只发可见消息
  edit?(p: { route: Route; messageId: string; text: string }): Promise<void>;
  start(r: StartRequest): Promise<StartOutcome>;  // 只合成入站，不发可见消息
}

type RouteQuery = {
  sessionKey: string; agentId: string;
  delivery?: { channel?: string; to?: string; accountId?: string; threadId?: string }; // 来自 entry.delivery.context（kind==="external"）
  ownerIds: string[];   // 该渠道在 commands.ownerAllowFrom 里的 id（已去掉 "feishu:" 等前缀）
};
type Route = {
  channel: string; accountId: string;
  to: string;           // feishu "chat:oc_…"|"user:ou_…"；telegram chat id；dingtalk userId|openConversationId；wecom chatId
  chatId: string; chatType: "direct" | "group";
  peerId?: string;      // 私聊对端真人
  humans: "owner_only" | "single_peer" | "shared" | "unknown";
  label?: string;       // 群名
};
type RouteResult = { ok: true; route: Route } | { ok: false; code: "NO_ROUTE" | "CHAT_GONE" | "NOT_MEMBER"; reason: string };
type PostRequest = { route: Route; text: string; idempotencyKey: string; replyToMessageId?: string };
type PostResult  = { messageId: string | null; deduped?: boolean };
// post 失败时抛 BridgeError { code: "POST_FAILED"|"CHAT_GONE"|"NOT_MEMBER"|"CHANNEL_DOWN", transient: boolean, message }
```

**`resolveRoute` 的规则**（修正 UX 设计中新 Task Room 拿到 NO_ROUTE 的问题）：

| 渠道 | 有 `delivery.to` | 没有 `delivery.to` | 判断 `humans` |
|---|---|---|---|
| 飞书 | 用它 | 从 key 推导：`agent:<a>:feishu:group:<oc_…>` → `chat:<oc>`，`…:feishu:direct:<ou_…>` → `user:<ou>`。oc_/ou_ 是小写 hex，可以安全反推 | 群：`getChatInfo`（M:911；chat-CxXaPTuO.js:52-71 返回 `owner_id`、`user_count`），缓存 10 min。`user_count===1 && ownerIds.includes(owner_id)` 为 owner_only；`user_count===1` 为 single_peer；大于 1 为 shared；出错为 unknown。私聊：peer 在 ownerIds 里为 owner_only，否则为 single_peer |
| Telegram | 用它 | 从 key 推导：`…:telegram:(direct\|group):<id>` | 私聊同上；群为 shared |
| 钉钉 | 只用它 | NO_ROUTE（key 里的 cid 已被转成小写，不能反推【报告 dingtalk】） | 私聊 single_peer；群 shared |
| 企微 | 只用它 | NO_ROUTE | 同钉钉 |

> 飞书入站会写 `updateLastRoute`（M:5108-5111），所以一个房间经桥收到第一条请求后，它就有了持久化的路由。

```ts
type StartRequest = {
  route: Route; sessionKey: string; agentId: string;
  kind: "request" | "ask" | "wake" | "collect";
  id: string;                  // sendId（request/ask/collect）或 batchId（wake）
  attempt: number;             // 从 0 开始，每次 BUSY 或重试加 1
  runId: string;               // 预设，按尝试唯一：`v-a2a-${kind}-${id}-${attempt}`（kind 缩写 req/ask/wake/col）
  messageSid: string;          // 按尝试唯一：`v-a2a:${kind}:${id}:${attempt}`（核心去重 20 min，inbound-dedupe.ts:56-75）
  syntheticMessageId: string;  // 渠道内的合成消息 id，按尝试唯一：飞书 message_id = `v-a2a-${kind}-${id}-${attempt}`；Telegram messageIdOverride = messageSid
  anchorMessageId: string | null;
  promptText: string;          // 模型看到的完整正文，不裁剪、不加 header（核心会自动加 [Inter-session message] 前缀）
  channelPromptContext: string;// 走 ChannelPromptContext，绝不走 GroupSystemPrompt（critic §一.5）
  provenance: { kind: "inter_session"; sourceSessionKey: string; sourceChannel?: string;
                sourceTool: "sessions_send"; originSessionId: string };  // 见 2.d
  sender: { id: string; name: string; isOwnerIdentity: boolean };  // 权限身份，规则见下
  routePeerId?: string;        // 合成事件的发送者（只用于路由和渠道闸门），私聊必须是对端真人
  askUserAnswererId?: string;  // 允许回答 ask_user 的真人，绝不是合成 id
};

type StartOutcome =
  | { status: "started"; runId: string; done: Promise<RunOutcome> }      // 在 onAgentRunStart 时 resolve
  | { status: "busy"; reason: "active_run" | "pending_queue" | "recovery_owner" }  // 零可见输出，零 transcript
  | { status: "rejected";
      code: "NO_ROUTE" | "ROUTE_MISMATCH" | "GATED" | "CHANNEL_DOWN" | "RESTART_WEDGE" | "ARCHIVED" | "INTERNAL";
      message: string; started: false };

type RunOutcome = {
  status: "ok" | "error" | "aborted";
  finals: Array<{ text?: string; mediaUrls?: string[] }>;  // 在 deliver(kind=final) 截获，不含 ask_user 问题载荷
  visibleReplySent: boolean; finalCount: number; error?: string;
};
```

**分类规则**
- handler 返回时既没有触发 `onAgentRunStart`，也没有触发 `onBusy`：返回 `rejected:GATED`（被闸门丢弃或命中去重）。
- 路由断言不符：返回 `ROUTE_MISMATCH`。
- 异常信息包含 `restart recovery claim changed`：返回 `RESTART_WEDGE`（记忆 v-restart-recovery-wedge）。

**权限身份 `sender` 的取法**（chain-root 规则；修正 UX 和 minimal 的提权漏洞）。`principal` 是链根真人，即第 0 层回合的发送者：`{channel, id, name, isOwner}`，来自核心传的 `requesterSenderId` 和 `senderIsOwner`。

```
ownerIdHere = ownerAllowFrom 里目标渠道的第一个 id（钉钉、企微没有）
if principal.isOwner && ownerIdHere           → sender = { id: ownerIdHere, isOwnerIdentity: true }
elif principal.channel === 目标渠道 && principal.id → sender = { id: principal.id, isOwnerIdentity: false }  // 与他本人在那里发消息的权限相同
else                                            → sender = { id: `v-a2a:${chainId}`, isOwnerIdentity: false }  // 合成，非 owner
sender.name        = `「${fromLabel}」的 V（会话协作）`
routePeerId        = route.chatType==="direct" ? route.peerId : (ownerIdHere ?? principalIdHere)   // 只给渠道路由和闸门用
askUserAnswererId  = principalIdHere ?? ownerIdHere ?? undefined
```

- **绝不**回退到私聊对端、群里最后一个发言人，或"群里一律用 owner"。
- `SenderId`、`SenderName` 通过 `extra` 覆盖。`extra` 最后展开，`context.ts:592`【报告 core Q1】。
- 为什么不需要"目标聊天只有 owner"这个附加条件，见附录 B-D3：核心 steer 有工具权限指纹检查，非 owner 的插话进不了 owner 权限的回合【核实 R:7961-7967】。

**核心侧接缝**（WP1 和 WP4–WP8 必须使用完全相同的名字）：

```ts
// 渠道桥放进 replyOptions（经 dispatch-from-config 的 getReplyOptions 展开进 get-reply 的 opts，
// dispatch-from-config-DOJq_7CI.js:1678-1697【核实】）
replyOptions.runId = StartRequest.runId;
replyOptions.onAgentRunStart = wrap(原回调, (runId) => started(runId));
replyOptions.vInterSession = { exclusive: true, id, kind, onBusy(info: { reason; activeSessionId? }): void };

// 同一个对象也经 extra 放进 ctx（ctx.VInterSession）。守卫读 opts?.vInterSession ?? ctx.VInterSession【退路 A1】

// ctx（经 buildContext 的 extra，或钉钉/企微的 ctxPayload）
InputProvenance = StartRequest.provenance;
ChannelPromptContext = StartRequest.channelPromptContext;
CommandInterpretationSuppressed = true;   // G:1810/4195 原生开关【核实】：正文不会被当成斜杠命令
CommandAuthorized = false;                // 飞书走 access.commands.authorized=false（M:4812）
SenderId = sender.id; SenderName = sender.name; MessageSid = StartRequest.messageSid;

// 冲刷让路接缝（WP1 在 R 里导出）
globalThis[Symbol.for("openclaw.v.deferredMemoryFlush")] = { v: 1, activeAfterYield({ sessionKey, providedReplyOperation }): boolean };

// 轮询闸接缝（WP2 在核心 sessions_send 里写入；任何进程里的 guard 都能读）
globalThis[Symbol.for("openclaw.v.sessionsSendAccepted")]: Map<requesterRunId, { at: number; targets: Map<sessionKey, { code; label; historyReads: number }> }>;

// 后台行接缝（WP3 在 T 里加）
globalThis[Symbol.for("openclaw.v.taskRegistryBridge")].extraSources: Set<(sessionKey: string) => TaskLike[]>;
```

### 2.b Gateway 方法（插件用 `api.registerGatewayMethod(name, handler, {scope})` 注册）

`vrelay.*` 不在保留前缀里（`exec.approvals.`、`config.`、`wizard.`、`update.`），所以声明的 scope 不会被强制改成 admin【核实 gateway-method-policy.ts:2-7；registry-registrars-network.ts:58-90】。

| 方法 | scope | 参数 | 结果 |
|---|---|---|---|
| `vrelay.send` | operator.write | 见下 | 见下 |
| `vrelay.wait` | operator.write | `{v:1, sendId, timeoutMs ≤ 55000}` | `{status:"pending"\|"ok"\|"no_reply"\|"failed"\|"expired", code, reply?, media?:string[], failure?:{class, reason}, note}`。返回 ok/no_reply/failed 时在 Gateway 内原子领取（CAS → `delivered_inline`）。超过 `inline.until` 返回 `expired`，此时该记录已转为异步 |
| `vrelay.get` | operator.read | `{sendId}` 或 `{code}` | 脱敏后的记录（message 只返回 visibleText） |
| `vrelay.list` | operator.read | `{sessionKey?, active?:boolean, limit≤100}` | `{items:[{sendId, code, phase, requester, target, ageMs}], counts:{running, queued, awaiting}}`。v-self-restart 也用它 |
| `vrelay.cancel` | operator.admin | `{sendId, reason}` | `{ok}`。只给运维或 Tianyi 用，不暴露给模型 |

**`vrelay.send` 参数**（由核心补丁组装）：

```ts
{
  v: 1,
  idempotencyKey: string,   // "ss:" + sha256(`${requesterSessionKey}|${requesterRunId ?? "nr:" + floor(now/600000)}|${toolCallId}`).slice(0,32)
  toolCallId: string,       // execute(_toolCallId, …)，S:901
  requester: {
    sessionKey: string,       // requesterSessionKey（S:1140）
    replySessionKey: string,  // replyRequesterSessionKey
    agentId: string,
    runId: string | null,     // opts.runId（WP2 接线）
    channel: string | null,   // opts.agentChannel
    accountId: string | null, to: string | null, threadId: string | null,
    senderId: string | null,  // opts.requesterSenderId
    senderIsOwner: boolean | null
  },
  target: { sessionKey: resolvedKey, agentId: targetAgentId, displayKey, created: boolean /* visibleSession.missing */ },
  message: string,
  mode: "async" | "inline",
  inlineTimeoutMs: number   // async 为 0；inline 为 min(timeoutSeconds*1000, 300000)
}
```

**`vrelay.send` 结果**：

```ts
| { status: "fallback"; reason: "disabled" | "unsupported_requester" | "unsupported_target" }       // 核心继续走 v2
| { status: "accepted"; sendId; code; runId /* 预设的目标 runId（attempt 0）*/;
    targetDisposition: "queued"; queuePosition: number; waitingBehindActiveRun: boolean;
    delivery: { status: "pending"; mode: "announce" }; note: string; deduped?: true }
| { status: "forbidden"; code: PolicyCode; error: string }                                             // 文案见 §5、§7
| { status: "error"; code: "NO_ROUTE" | "CHAT_GONE" | "NOT_MEMBER" | "LEDGER" | "INTERNAL"; error: string }
```

**去重**
- 主键是 `idempotencyKey`，命中时返回同一条记录（`deduped:true`）。
- 内容去重：同一 requester 会话、同一目标、相同 `sha256(message)`，并且命中的记录**仍在途**（非终态）且不超过 10 分钟，才返回已有记录。**终态记录永远不匹配**，因此合法的重复发送不会被吞掉。

**核心侧调用与退路**（WP2）
- 调用：`gatewayCall({ method: "vrelay.send", params, scopes: ["operator.write"], timeoutMs: 20000 })`。必须显式传 scopes：进程内对未知方法按最小权限解析会得到 `[]`【核实 method-scopes.ts:215-228；in-process-gateway.ts:161-162】。
- 只有错误文本匹配 `/unknown method: vrelay\.send|missing scope: operator\.admin/` 时，才判定插件缺席：本进程缓存 60 s，走 v2，并记一次 warn。具体文本由 C-fallback 计划确认，见 A4。
- 其他 RPC 错误一律返回 `status:"error"`，文案见 §7.6，**不降级**，避免同一请求发两次。
- inline 等待中途 RPC 出错（例如 Gateway 重启）：此时请求已被受理，返回 `accepted`，note 用 §7.6 的"连接中断"文案。

### 2.c 账本

**目录**：`$OPENCLAW_STATE_DIR/v-session-relay/v2/`，V 上是 `/home/openclaw/.openclaw/v-session-relay/v2/`。

```
sends/<sendId>.json     batches/<batchId>.json     runs/<sha1(runId)>.json     chains/<chainId>.json
archive/<YYYYMMDD>/…    LOCK（{pid, bootId, startedAt}）    DISABLED（存在即停止受理新请求，退回 v2）
```

**写入规则**
- 只有 Gateway 进程里的插件写。
- 每条记录各有一条内存 promise 链串行化。写法：`fs.promises.writeFile(tmp)` → `filehandle.sync()` → `rename` → 目录 fsync（尽力而为）。全部异步，不在事件循环上同步 fsync。
- **先落盘，后产生副作用**：发锚点、start 和唤醒之前，对应 phase 必须已经写盘。
- `LOCK` 被另一个活着的 pid 持有时，引擎拒绝启动并记 error（防 candidate 与共享 VLab 误用同一目录）。

**清理**
- 记录进入终态 24 h 后移到 `archive/<date>/`。
- 每 6 h 删除 7 天以上的归档。
- 启动时只读 `sends/`、`batches/`、`chains/`（只剩非终态和最近 24 h 的终态，规模很小）。
- 不做定时全量扫描；`before_prompt_build` 不读目录。旧插件的 2 s tick 和每轮 `store.list()` 都删掉【报告 rel (1)】。

**SendRecord**：

```jsonc
{
  "v": 2, "sendId": "s_mgk3x1a2f9c1", "code": "7F3A",
  "idempotencyKey": "ss:…", "contentKey": "<sha256(reqKey|tgtKey|message)>",
  "chainId": "c_…", "depth": 1,
  "edge": "delegate|followup|ask", "kind": "request|ask",
  "parentSendId": "s_…|null",          // 发起回合服务于哪个请求（= 该回合的 servesSendId）
  "batchId": "b_…|null",               // async 或 inline 转 async 才有
  "mode": "async|inline",
  "inline": { "until": 0, "claimedAt": null, "expiredAt": null },
  "requester": { "sessionKey": "", "replySessionKey": "", "agentId": "", "runId": null,
                 "runRole": "root|request|ask|wake|collect|unknown", "label": "", "channel": null,
                 "transport": "bridge|agent", "route": null },
  "target":    { "sessionKey": "", "agentId": "", "displayKey": "", "label": "",
                 "transport": "bridge|agent", "bridgeKey": "feishu:default|null", "route": null, "leaf": false },
  "principal": { "channel": "feishu", "id": "ou_…", "name": "Tianyi", "isOwner": true },
  "message":   { "text": "…", "chars": 0, "sha256": "", "visibleText": "…", "trimmed": false, "redactions": 0 },
  "phase": "accepted|posting|posted|queued|starting|running|target_done|awaiting_children|awaiting_background|result_ready|failure_ready|handed_back|delivered_inline|skipped|cancelled",
  "request":   { "messageId": null, "postAttempts": 0, "postedAt": null, "queueNoteEditedAt": null },
  "attempt": 0,
  "targetRun": { "runId": null, "startedAt": null, "endedAt": null, "status": null, "error": null, "recoveryRunId": null },
  "children":  { "batchIds": [] },
  "wakeRounds": 0,
  "result":  null,   // { "text": "…", "media": ["…"], "noReply": false, "source": "bridge|agent|transcript", "fromRunId": "" }
  "failure": null,   // { "class": "not_started|started_failed|interrupted|aborted|timeout|cancelled", "code": "", "reason": "" }
  "deadlines": { "queueBy": 0, "runBy": 0 },
  "createdAt": 0, "updatedAt": 0,
  "history": [ { "at": 0, "phase": "", "note": "" } ]   // 最多 30 条
}
```

**BatchRecord**：

```jsonc
{ "v": 2, "batchId": "b_…", "chainId": "c_…", "depth": 1,
  "requester": { "sessionKey": "", "agentId": "", "runId": "…|null", "label": "", "transport": "bridge|agent", "route": null },
  "servesSendId": "s_…|null",   // 发起回合服务于哪个请求（续接）
  "members": ["s_…"], "sealed": false, "sealedAt": null,
  "phase": "open|sealed|ready|waking|woken|skipped",
  "wake": { "attempt": 0, "runId": null, "handbackMessageId": null, "startedAt": null, "endedAt": null, "status": null, "transport": "bridge|agent" },
  "createdAt": 0, "updatedAt": 0 }
```

**RunRecord**（`runs/<sha1(runId)>.json`）：插件生成的回合在 start 前创建；根回合在第一次发送时创建。

```jsonc
{ "runId": "", "sessionKey": "", "role": "root|request|ask|wake|collect", "chainId": "", "depth": 0, "leaf": false,
  "servesSendId": null, "batchId": null, "createdAt": 0 }
```

- 预设 runId 没被采用时（A2），以 `onAgentRunStart` 报回的实际 runId 再写一份。
- 核心 sessions_send 在目标回合里调用时，传的就是这个实际 runId（`opts.runId`）。

**ChainRecord**：

```jsonc
{ "v": 2, "chainId": "c_…", "root": { "sessionKey": "", "runId": "", "label": "" },
  "principal": { "channel": "", "id": "", "name": "", "isOwner": true },
  "createdAt": 0, "lastActivityAt": 0, "idleExpiresAt": 0, "hardExpiresAt": 0,
  "members": { "<sessionKey>": { "depth": 0, "parent": null } },
  "counters": { "sends": 0, "pairs": { "<a>|<b>": 0 }, "recent": [] } }
```

**ID 规则**

| 用途 | 格式 |
|---|---|
| sendId / batchId / chainId | `s_` / `b_` / `c_` + `Date.now().toString(36)` + 5 字节随机 hex |
| `#code` | 4 位 Crockford base32；在非终态记录中撞码时扩到 5 位 |
| 目标/提问/收尾/唤醒的 runId | `v-a2a-req-<sendId>-<n>` / `v-a2a-ask-<sendId>-<n>` / `v-a2a-col-<sendId>-<n>` / `v-a2a-wake-<batchId>-<n>` |
| MessageSid | `v-a2a:<kind>:<id>:<n>` |
| 飞书合成 message_id | `v-a2a-<kind>-<id>-<n>` |
| 飞书 post 的 uuid | `va` + kind 首字母 + `sha256(id + ":" + purpose).slice(0, 40)`（≤ 50 字符） |
| transcript 标签 | `originSessionId = "v-a2a:<chainId>:<depth>:<kind>:<id>"` |

**为什么 runId 也按尝试唯一**：worker 对已经跑过的 runId 会拒绝再用（重复 runId 直接 throw，跑完后记入 retired）【核实 worker native-attempt-bridge.mjs:28-33】。BUSY 的尝试不产生 run；但万一崩溃窗口里已经开跑，新尝试必须换新 runId。

**为什么加 `v-a2a-` 前缀**：worker 首字统计只认 UUID 或 `DB91_HI_*` 格式的 runId【核实 worker index.mjs:11】，探针、哨兵、首字报表也统一按这个前缀把它们归为内部回合（WP11）。

### 2.d 链与深度

- **权威来源是账本**，不是 provenance。provenance 是封闭 schema，只保留 5 个字段【报告 core Q5】。
- **识别发起回合**，按以下顺序找：
  1. 用 `requester.runId` 查 `runs/`；
  2. 用插件内存 `activeTurnBySession`（由 `onAgentEvent` 的 lifecycle start/end 维护）按 `requester.sessionKey` 查当前 runId，再查 `runs/`；
  3. 都没有时视为根回合：新开一条 chain，depth 0，`principal = {requester.channel, requester.senderId, isOwner: requester.senderIsOwner}`，并创建 `runs/<runId>`（role root）。
  - **绝不用时间窗猜**。连 runId 都拿不到时，这次发送单独成一个批次，并记 `batch.unkeyed` warn。
- **深度**
  - 只有 `delegate` 边让目标 depth + 1，上限 `maxDepth = 2`（A=0、X=1、房间=2）。
  - `followup`（发给自己已有的子会话）沿用子会话原来的深度。
  - `ask` 的目标回合不改变成员深度，并且 `leaf=true`。
  - wake 和 collect 回合继承被唤醒会话的深度和 `servesSendId`。
- **成员**：`chains.members[sessionKey] = {depth, parent}`，用来分类边（§5）。
- **transcript 标签**：`InputProvenance.originSessionId` 是自由字符串，能通过 schema，会持久化到 user 消息，并进入 collect 分组键，所以不同请求不会被合并【报告 core Q3/Q5】。它只在重启恢复时用来判断"这一轮是否已进入 transcript"。

---

## 3. 改动点（逐文件；全部由 V 线上字节生成，测试钉死）

### 3.0 R1 / R2 文件清单

| 发版 | dist 文件 | 新组件 |
|---|---|---|
| **R1** | 核心 `sessions-spawn-tool-1FQMTkIo.js`、`openclaw-tools-BODVdJQD.js`、`get-reply-CqW1y05D.js`、`agent-runner.runtime-CAdsMsQt.js`、`task-registry-activity-DSlVVJwD.js`；飞书 `monitor.account-WFdlCDhR.js` | `extensions/v-session-relay/`（插件 2.0） |
| **R2** | 核心 `telegram-ingress-drain-factory-DJM2Jqrc.js`、`bot-message-DC6p8sB3.js`、`v-experience.js`；钉钉 `connection-DCvu-l09.mjs`、`message-handler-BUoLSylZ.mjs`、`v-experience.mjs`；企微 `src/monitor.js`、`v-experience.mjs` | — |

R1 里 Telegram、钉钉、企微目标走 agent transport：请求由 `outbound.sendText` 可见地发出，回复只有最终出站。因此遗留问题 (1) 和 (3) 在四个渠道都解决；(2) 在 R1 只覆盖飞书。

**不改的文件**
- `tool-description-presets-C6exCTZo.js`：仍是 npm 原版，不在捕获里。描述在 S 内拼接。
- 不新增任何依赖 hash chunk 导出字母的核心文件（否决 UX 的 probe 文件）。
- worker 插件、codex 插件、worker 第二份配置（R1 不动，见 §8.7）。

### 3.1 核心 `S:` sessions-spawn-tool（WP2，marker `v-sessions-send-relay-v3`）

生成器 `lab/release-files/sessions-send-relay/patch.mjs`：

```js
patchSessionsSendRelay(src) = applyV3(patchSessionsSendReplyOnce(src))   // v2 原样保留，作为插件缺席时的退路
```

**(1) 模块级 helper**：插在 `function createSessionsSendTool(opts) {`（S:892）之前。

```js
// v-sessions-send-relay-v3
const V_RELAY_FALLBACK_RE = /unknown method: vrelay\.send|missing scope: operator\.admin/u;
let vRelayAbsentUntil = 0;
async function vSessionRelaySend(p) {
  if (Date.now() < vRelayAbsentUntil) return { kind: "fallback" };
  const idemSeed = `${p.requesterSessionKey}|${p.requesterRunId ?? `nr:${Math.floor(Date.now() / 6e5)}`}|${p.toolCallId}`;
  const params = { v: 1, idempotencyKey: "ss:" + createHash("sha256").update(idemSeed).digest("hex").slice(0, 32), /* … 2.b 的全部字段 … */ };
  let r;
  try { r = await p.gatewayCall({ method: "vrelay.send", params, scopes: ["operator.write"], timeoutMs: 2e4 }); }
  catch (err) {
    const msg = formatErrorMessage(err);
    if (V_RELAY_FALLBACK_RE.test(msg)) { vRelayAbsentUntil = Date.now() + 6e4; log.warn("vrelay absent; using v2", { error: msg }); return { kind: "fallback" }; }
    return { kind: "result", result: { runId: crypto.randomUUID(), status: "error", error: V_RELAY_UNKNOWN_STATE_TEXT(msg), sessionKey: p.displayKey } };
  }
  if (r?.status === "fallback") return { kind: "fallback" };
  if (r?.status === "forbidden" || r?.status === "error")
    return { kind: "result", result: { runId: crypto.randomUUID(), status: r.status, error: r.error, code: r.code, sessionKey: p.displayKey } };
  return { kind: "accepted", accepted: r };   // r.status === "accepted"
}
```

如果模块里没有 `createHash`，就改用已 import 的 `crypto`（生成器在补丁时检查 import 表）。`formatErrorMessage`、`log`、`crypto` 都已在模块作用域内。

**(2) 交接点**：插在 `\t\t\t\t\tconst fallbackA2ASessionKey = timeoutSeconds === 0 && isIsolatedCronRequester`（S:1220，唯一）之前。这一位置在 baseline 读历史（S:1221）之前，inline 发送因此不再整读目标大会话（minimal）。

```js
// v-sessions-send-relay-v3
const vTargetEntry = loadSessionEntryByKey(resolvedKey, targetAgentId);
const vAcpMeta = readAcpSessionMeta({ sessionKey: resolvedKey, agentId: targetAgentId, cfg });
const vSkip = sameSessionA2A || isIsolatedCronRequester || Boolean(expectedSessionId) || resolvedKey.includes(":run:")
  || isSubagentSessionKey(resolvedKey)
  || isRequesterParentOfBackgroundAcpSession(vAcpMeta && vTargetEntry ? { ...vTargetEntry, acp: vAcpMeta } : vTargetEntry, effectiveRequesterKey)
  || isRequesterParentOfNativeSubagentSession({ entry: vTargetEntry, acpMeta: vAcpMeta, requesterSessionKey: effectiveRequesterKey, targetSessionKey: resolvedKey });
if (!vSkip) {
  const vr = await vSessionRelaySend({ gatewayCall, toolCallId: _toolCallId, requesterSessionKey, replyRequesterSessionKey, requesterAgentId,
    requesterRunId: opts?.runId, requesterChannel, requesterAccountId: opts?.agentAccountId, requesterTo: opts?.agentTo, requesterThreadId: opts?.agentThreadId,
    requesterSenderId: opts?.requesterSenderId, senderIsOwner: opts?.senderIsOwner,
    targetSessionKey: resolvedKey, targetAgentId, displayKey, created: visibleSession.missing === true, message, timeoutSeconds });
  if (vr.kind === "result") return jsonResult({ ...vr.result, ...registerWatchIfRequested(resolvedKey) });
  if (vr.kind === "accepted") {
    /* 照 S:1316-1335 调用 recordSessionToolActionFact 和 recordSessionParticipantBestEffort（targetSessionKey=resolvedKey） */
    vRecordAccepted(opts?.runId, resolvedKey, vr.accepted);   // 写 Symbol.for("openclaw.v.sessionsSendAccepted")；只有 async 和 inline 转 async 才写
    if (timeoutSeconds === 0) return jsonResult(vAcceptedResult(vr.accepted, displayKey, registerWatchIfRequested(resolvedKey)));
    return jsonResult(await vWaitInline({ gatewayCall, accepted: vr.accepted, displayKey, deadlineMs: Math.min(timeoutMs, 3e5), watch: registerWatchIfRequested(resolvedKey) }));
  }
}
// vr.kind === "fallback" 或 vSkip：继续执行原代码（v2）
```

`vWaitInline` 的流程：

```
循环 vrelay.wait({sendId, timeoutMs: min(55000, 剩余)})，每次 gateway timeoutMs = 片长 + 15 s
  ok       → {runId, sessionKey, status:"ok", delivery:{status:"skipped",mode:"announce"}, reply, requestCode, note, media?}
  no_reply → {runId, sessionKey, status:"no_reply", message: NO_REPLY_MESSAGE, requestCode, note}
  failed   → {runId, status:"error", error: note, sentBeforeError: true, sessionKey, requestCode}
  expired，或到 deadline 仍是 pending
           → {runId, sessionKey, status:"accepted", targetDisposition:"queued", delivery:{status:"pending",mode:"announce"}, requestCode, note: §7.6 的「inline 超时」文案}
             同时把这次发送写进 accepted 表
  RPC 异常 → 同上 accepted，note 用「连接中断」文案
```

`readAcpSessionMeta`、`loadSessionEntryByKey`（S:96 import）、`isRequesterParentOfBackgroundAcpSession`（S:63 import）、`isRequesterParentOfNativeSubagentSession`（S:773）、`isSubagentSessionKey` 都在模块作用域内【核实】。

**(3) 输出 schema**（S:663-701，各分支都是 `additionalProperties:false`，必须同步改）

| 分支 | 新增可选字段 |
|---|---|
| error/forbidden | `code: String`、`requestCode: String` |
| accepted | `requestCode: String`、`note: String`、`queuePosition: Integer`、`waitingBehindActiveRun: Boolean` |
| no_reply | `requestCode`、`note` |
| ok | `requestCode`、`note`、`media: Array(String)` |

`SessionsSendDeliverySchema` 不变（`mode` 仍是 `"announce"`）。

**(4) 工具描述**（S:897）：`description: describeSessionsSendTool(),` 改为 `description: describeSessionsSendTool() + V_SESSIONS_SEND_GUIDANCE,`。文案见 §8.2。

**(5) 测试** `tests/sessions-send-relay.test.mjs`
- 读捕获 → `patchSessionsSendRelay` → 等于 `generated/sessions-spawn-tool-1FQMTkIo.js`；`node --check` 通过；每个锚点只出现一次；marker 只出现一次；v2 marker 仍在。
- 交接点位于 `const baselineReply` 之前。
- schema 各分支包含新增字段。
- 原 `tests/sessions-send-reply-once.test.mjs` 不改，继续钉 v2。

### 3.2 核心 openclaw-tools（WP2，marker `v-sessions-send-relay-tools-v1`）

`openclaw-tools-BODVdJQD.js:17617-17623` 的 `createSessionsSendTool({…})` 加上：

```js
runId: options?.runId, requesterSenderId: options?.requesterSenderId ?? void 0, senderIsOwner: options?.senderIsOwner,
agentAccountId: options?.agentAccountId, agentTo: options?.agentTo, agentThreadId: options?.agentThreadId,
```

这些字段 `options` 里都有【核实：runId 18 处、requesterSenderId :1605/:17395、senderIsOwner 6 处】。

**不传 inputProvenance**：`createOpenClawTools` 没有当前回合 provenance 这个选项【核实】。回合角色一律由账本按 runId 判断（§2.d）。

### 3.3 核心 `G:` get-reply 独占准入守卫一（WP1，marker `v-inter-session-exclusive-v1`）

插在 `const queueAdmissionState = …;`（G:3584，唯一）之后、`const activeRunAcceptsCurrentThread`（G:3585）之前。作用域在 `prepareReplyRunAdmission`（G:3275），其中 `ctx/opts/typing/sessionKey/queueKey/providedReplyOperation/recoveryOwnerActive/isActive/activeSessionId` 都可用【核实 G:3277、3536、3560、3581】。

```js
// v-inter-session-exclusive-v1
const vInter = opts?.vInterSession ?? ctx?.VInterSession;
if (vInter?.exclusive === true) {
	const vFlush = globalThis[Symbol.for("openclaw.v.deferredMemoryFlush")];
	const vFlushOnly = isActive && !recoveryOwnerActive && Boolean(sessionKey) && typeof vFlush?.activeAfterYield === "function"
		&& vFlush.activeAfterYield({ sessionKey, providedReplyOperation }) === false;
	const vBusy = recoveryOwnerActive ? "recovery_owner" : queueAdmissionState !== "empty" ? "pending_queue" : isActive && !vFlushOnly ? "active_run" : void 0;
	if (vBusy) {
		try { vInter.onBusy?.({ reason: vBusy, activeSessionId }); } catch {}
		opts?.onDeliberateSilentTerminalReply?.();
		typing.cleanup();
		return { kind: "reply", reply: void 0 };
	}
}
```

**为什么能做到零可见输出**
- `onDeliberateSilentTerminalReply` 会把 `deliberateSilentTerminalReply` 置为 true。这样核心 finalize 的 `NO_VISIBLE_REPLY_FALLBACK_TEXT` 兜底不发，`noVisibleReplyFallbackEligible` 也不置位【核实 9.1 finalize.ts:336-349、474-485；V dispatch-from-config:1019】。
- 飞书 `shouldSendNoVisibleReplyFallback`（M:3892-3896）和 Telegram 第二道兜底（BM:4055）都依赖这个 eligibility，于是一并被压住。
- 有原生先例：未授权命令就是这样早退的（G:4198）【核实】。
- 这时尚未写 transcript：user 消息在 get-reply-run-execute 才写【报告 core Q1】。

**为什么不在 drain 之后再返回 BUSY**：G:3633 之后会 `drainSystemEventBlocks()` 把系统事件消费进正文，在那之后返回 BUSY 会丢事件（J1）。所以 BUSY 只能在这里返回。

### 3.4 核心 `R:` agent-runner.runtime（WP1，同一 marker）

**(a) 冲刷让路接缝**：插在 `function resolveReplyActiveAfterDeferredFlushYield(params) {` 定义（R:7430 起）结束之后。逻辑复刻这个函数，但不打日志。

```js
// v-inter-session-exclusive-v1
globalThis[Symbol.for("openclaw.v.deferredMemoryFlush")] = { v: 1, activeAfterYield: ({ sessionKey, providedReplyOperation }) => {
	const job = deferredMemoryFlushJobs.get(sessionKey);
	if (!job || !(job.inFlight > 0)) return true;
	const operation = replyRunRegistry.get(sessionKey);
	return operation !== void 0 && operation !== providedReplyOperation;
} };
```

- 效果：会话里只有 deferred flush 在跑时，协作回合和真人消息一样被视为空闲，随后 `runReplyAgent` 开头的 `yieldDeferredMemoryFlush` 会让 flush 让路（R:7920-7926）【核实】。
- runtime chunk 在 G:3520 已经懒加载过，所以守卫执行时这个接缝已经存在。接缝缺失时，flush 期间按忙处理，结果只是有界延迟（J1 允许）。

**(b) 绝不 steer、绝不 followup**：把 R:7957 和 R:7958 改为

```js
const vExclusive = opts?.vInterSession?.exclusive === true;
const effectiveShouldSteer = !vExclusive && !isHeartbeat && !effectiveResetTriggered && shouldSteer;
const effectiveShouldFollowup = !vExclusive && !effectiveResetTriggered && shouldFollowup;
if (vExclusive && isActive) logVerbose("inter-session exclusive turn found the session active after admission; running after it");
```

在 G 守卫与这里之间的极窄窗口里，可能有一个不经准入票据的 agent RPC 回合（cron）开跑。这时本回合走 run-now，按 session lane 串行排在它后面【假设 A8】，**不 BUSY**（系统事件已 drain）也**不 steer**。

**(c) 测试** `tests/inter-session-admission.test.mjs`：两个文件分别"读捕获、打补丁、等于 generated"；锚点唯一；`node --check`；断言守卫位于 `queueAdmissionState` 之后、`shouldSteer` 之前；断言调用了 `onDeliberateSilentTerminalReply`。行为由 candidate F3/F3b/F3c 验证。

### 3.5 核心 `T:` task-registry-activity（WP3，marker `v-task-bridge-extra-sources-v1`）

在 `vTaskRegistryBridge.listActive` 的 `return active;`（T:540，函数内唯一）之前插入：

```js
for (const source of vTaskRegistryBridge.extraSources ?? []) { try { for (const row of source(key) ?? []) if (row?.taskId) active.push(row); } catch {} }
```

- 为什么要 dist hook：`listActive` 在 chunk 求值时被无条件重新赋值（T:498），插件包一层会被覆盖（J1 对 minimal 的 fatal flaw）。现有的可选钩子 `listActivePersisted`/`listActiveSubagentsPersisted` 是同样的写法【核实 T:521-532】。
- 插件提供的行：`{taskId:"v-a2a:<sendId>", runtime:"session", taskKind:"sessions_send", label:"「a」#7F3A", status:"running"|"queued", runId, childSessionKey: targetKey, createdAt}`，只给 requester 的 sessionKey。
- 变化时插件调用 `bridge.listeners` 发出 `{kind:"v-a2a", sessionKeys:[requesterKey]}`（与 T:543-552 的通知格式一致）。
- 种类文字：R1 飞书在 M 里映射成"会话请求"（§3.6）；核心 `v-experience.js`（Telegram 用）在 R2 改（WP6）。改之前显示"后台任务"，属于可接受的降级。

### 3.6 飞书 `M:`（WP4，marker `v-feishu-inter-session-bridge-v1`）

**(1) 在 `createFeishuMessageReceiveHandler`（M:7369）里、`const enqueue = createSequentialQueue(…)`（M:7376）之后**，往模块级 `vFeishuInterSessionDispatch: Map<accountId, fn>` 注册：

```js
vFeishuInterSessionDispatch.set(accountId, (event, interSession) => {
  const sequentialKey = resolveSequentialKey({ accountId, event, botOpenId: getBotOpenId(accountId), botName: getBotName(accountId) });
  return enqueue(sequentialKey, () => handleMessage({ cfg, event, botOpenId: getBotOpenId(accountId), botName: getBotName(accountId),
    runtime, channelRuntime, chatHistories, accountId, interSession }));     // 永远不用 `:active-run` 键（critic 矛盾表）
});
```

**(2) 在 `monitorSingleAccount` 的 `registerEventHandlers(...)`（M:8713）之后**构造桥，注册到 `reg.bridges` 的 `feishu:<accountId>`；在 finally（M:8746-8753）里注销桥并删除 dispatch 项。

| 方法 | 实现 |
|---|---|
| `resolveRoute` | 按 §2.a；`getChatInfo(createFeishuClient(account), oc)`（M:909、911 已 import），缓存 10 min |
| `post` | `client.im.message.create({ params:{ receive_id_type }, data:{ receive_id, msg_type:"text", content: JSON.stringify({ text }), uuid } })`；有 `replyToMessageId` 时用 `client.im.message.reply`。纯文本，不发自建卡片 |
| `edit` | `client.im.message.update`，失败忽略 |
| `start` | 合成事件（仿 `buildSyntheticMessageEvent$1`，M:5260-5287）：`message_id = syntheticMessageId`、`reply_target_message_id = anchorMessageId`、`chat_id`、`chat_type`、`sender.sender_id.open_id = routePeerId`、**不填 `sender_type`**（走 bot 分支会关掉流式卡，M:2886）、群里带 mention_bot、`create_time = String(Date.now())`、`content = { text: promptText }`，然后调 `vFeishuInterSessionDispatch.get(accountId)(event, interSession)`。`started/busy/rejected` 通过 deferred 在 `onAgentRunStart`、`onBusy` 或 handler 返回时 resolve |

`caps = {streaming:true, replyAnchor:true, idempotentPost:true, editPost:true, maxVisibleChars:1500, askUser:true, media:true}`。

**(3) `handleFeishuMessage`（M:3987）加 `interSession` 分支**

1. 解构里加 `interSession`。
2. 跳过查通讯录（M:4099），`ctx.senderName = interSession.sender.name`。
3. 路由在绑定块（M:4436-4460）结束、`buildCtxPayloadForAgent`（M:4719）之前断言 `route.sessionKey === interSession.sessionKey`，不等就返回 `ROUTE_MISMATCH`。
4. 跳过命令解析（M:4549-4570）。
5. `access.commands.authorized = false`（M:4812）。`extra`（M:4814）加 `InputProvenance`、`ChannelPromptContext`、`CommandInterpretationSuppressed: true`、`SenderId`、`SenderName`、`MessageSid`、`VInterSession`。
6. `createFeishuReplyDispatcher` 的 `askUserSenderOpenId = interSession.askUserAnswererId`（M:5068）；`typingTargetMessageId` 设为 undefined（不给合成 id 或锚点贴打字表情）。
7. dispatcher 的 `onReplyStart`（M:3568-3581）在 interSession 时**不预建卡、不 startStreaming**。改为在包装后的 `onAgentRunStart`（M:3795）里执行 `startStreaming()` / `vPrecreateCard()`，防止 BUSY 时留下孤儿卡。
8. 在 `delivery.deliver`（M:3611，`info.kind==="final"`，排除问题载荷）和 `onDelivered`（M:3600）截获 finals。
9. `replyOptions`（M:5121 resolveTurn 内）加 `runId`、`vInterSession`。
10. M:5136：interSession 且 BUSY 时直接 return，不调 `ensureNoVisibleReplyFallback`（eligibility 已为 false，这里再加一层保险）。
11. M:5139 的 firsttext 行加 `origin:"inter_session"`、`attempt`，并且 `receivedAtMs` 取本次尝试开始时间（不是受理时间）。
12. M:5144：interSession 时重新抛出异常（供 `RESTART_WEDGE`、`CHANNEL_DOWN` 分类）；正常时返回 `{runId, dispatchResult, finals, visibleReplySent}`。

**(4) 后台行种类**：`V_TASK_STATUS_KIND_ORDER`（M:8802）加"会话请求"；`feishuTaskStatusKind`（M:8805）加 `taskKind==="sessions_send" → "会话请求"`。

**(5) 不需要改的部分**
- 请求消息 `sender_type=app`：已被自发丢弃（M:7535）和补漏拉取的 `shouldPull`（M:8536）挡住【报告 feishu §2】。
- 合成事件 `message_id` 按尝试唯一，能通过 `finalizeFeishuMessageProcessing` 去重（M:3998-4006）。

**(6) 测试** `tests/patch-feishu-inter-session-bridge.test.mjs`：读 `.feishu/dist/dist/` 捕获，打补丁，等于 generated；锚点唯一；`node --check`；并断言源码里不存在 `${sequentialKey}:active-run` 的 interSession 用法。

### 3.7 Telegram（R2，WP6，marker `v-telegram-inter-session-bridge-v1`，必须叠在 `v-experience-telegram-v1` 之后）

**`TG:`**
- 在 `const message = createTelegramMessagePipeline(params);`（TG:4046）之后注册 `telegram:<accountId>`；在 `originalStop` 包装（TG:5008）里注销。
- `post`：`bot.api.sendMessage(chatId, text)`，纯文本，不带 parse_mode。
- `start`：以锚点消息为 base 构造合成消息：from 为 `routePeerId`，`update.vInterSession = req`，带 `me` 和 `getFile`，**不带 update_id**（会污染水位【报告 telegram】）。然后调 `message.processMessageWithReplyChain({…, options:{ forceWasMentioned:true, messageIdOverride: req.messageSid }})`。

**`BM:`**
- `runTelegramDispatchTurn`（BM:3547）读 `vInterSession`，设置 `InputProvenance`、`ChannelPromptContext`、`CommandInterpretationSuppressed`、`CommandAuthorized:false`、`SenderId`/`SenderName`/`MessageSid`、`VInterSession`。
- `replyOptions`（BM:3631）加 `runId`、`vInterSession`，并包装 `onAgentRunStart`。
- `deliverReply`（BM:3315）截获 final；finally（约 BM:3755）resolve done。
- interSession 时 `statusReactionController` 设为 undefined（不给锚点贴状态表情）。BUSY 时跳过 BM:4068 的 `finalizeInBackground({outcome:"error"})` 和 BM:4053 的失败兜底【核实这两处会产生可见副作用】。

**`v-experience.js`**（marker `v-experience-session-kind-v1`）：`backgroundKind` 加 `if (kind === "sessions_send") return "会话请求";`，`KIND_ORDER` 加"会话请求"（V:260-273）。

### 3.8 钉钉（R2，WP7，新模块 `apps/v-experience/dingtalk/patch-inter-session.mjs`，marker `v-dingtalk-inter-session-bridge-v1`）

原 `applyAll` 见到已有 marker 会整文件跳过（dingtalk/patch.mjs:516），所以必须另起模块。

**`connection-DCvu-l09.mjs`**
- 在 :328 一带的闭包里（cfg、account、runtime 可用）注册 `dingtalk:<accountId>`。
- `post`：`vSendProactive(cfg, target, text, {msgType:"markdown", useAICard:false})`（runtime-C81EKBS1.mjs:10）。
- `start`：构造 data 和 prepared，route 强制为目标会话，直接调 `handleDingTalkMessageInternal`（:1768）。这样绕过问题回答拦截、prepare 和 allowlist。
- 在 :343 去重处加防御：丢弃 `senderStaffId/senderId === chatbotUserId` 的回调，以及 msgId 命中本进程已发锚点的回调【假设 A11】。

**`message-handler-BUoLSylZ.mjs`**
- :2100 入口遇 `vInterSession` 跳过 :2107 拦截。
- :1932 跳过贴表情和撤回表情。
- :1971 ctxPayload 加字段（同 §2.a；`SenderId` 按 chain-root 规则，作废"传 undefined"【critic】）。
- :2016 `replyOptions` 加 `runId` 和 `vInterSession`，并包装 deliver 截获 final。
- AI 卡建卡从 `onReplyStart` 移到 `onAgentRunStart`。
- :170 dispatcher 里所有依赖 sessionWebhook 的回退（:240/453/483-497/545/550/744/789-797/2085），在 interSession 时改用 `vSendProactive`，否则建卡失败会静默丢答复【报告 dingtalk】。

**`v-experience.mjs`**：种类映射同 §3.7。

### 3.9 企微（R2，WP8，`apps/v-experience/wecom/patch-inter-session.mjs`，marker `v-wecom-inter-session-bridge-v1`）

`src/monitor.js`：
- 在 `setWeComWebSocket` 之后（:910）注册桥。
- `post`：`getWeComWebSocket(acc).sendMessage(chatId, {msgtype:"markdown", markdown:{content}})`。
- `start`：`enqueueWeComChatTask({chatId, task: () => processWeComMessageNow(entry)})`（:1044），不走 active-run 车道。
  - entry 带 `vInterSession`、`vFromCardEvent:true`，使 `streamExpired=true`（:390），终稿走主动 markdown（:364）。
  - 跳过 `setReqIdForChat`（:797）。
  - `SessionKey` 强制写成目标会话，防止 `processDynamicRouting` 改写（:134）。
- `buildMessageContext`/`finalizeInboundContext`（:190-218）加 provenance 和 ctx 字段，`CommandAuthorized:false`（:209）。
- :542 `replyOptions` 加 `runId` 和 `vInterSession`。
- finals 取 `state.accumulatedText`，要在 `vStop` 拼后台行**之前**取。
- 自回声防御同钉钉（:1007 前）。
- `caps.streaming=false`。
- `v-experience.mjs` 种类映射同上。

### 3.10 插件 `apps/v-session-relay/plugin` 2.0（WP5；发布到 V 的 `extensions/v-session-relay/`）

**删除**
- `core/feishu.js`（自建线程卡）
- `core/native.js`、`core/turns.js`（猜信封）
- `core/dispatcher.js`、`core/store.js`
- `before_prompt_build`、`after_tool_call`
- 2 s tick
- 对 `hooks.allowConversationAccess` 的依赖

`sessions.js` 和 `text.js` 的有用部分迁入 `labels.js` 和 `copy.js`。

**模块**

| 模块 | 职责与主要导出 |
|---|---|
| `core/contracts.js`（WP0） | Symbol、方法名、ID 和 code 生成、错误码、PolicyCode、默认限额、`validateBridge`/`validateStartRequest` |
| `core/ledger.js` | `open(dir)`（LOCK、加载非终态记录）、`get/put/cas(id, fromPhases, patch)`、归档清理、内存索引（按 target、batch、chain、runId） |
| `core/policy.js` | `classify({chain, requesterRun, target, mode, timeoutMs})` 返回 `{edge, depth, leaf}` 或 `{forbidden: code, text}`；预算计数；等待图环检测 |
| `core/engine.js` | `send(params)`、`wait(sendId, timeoutMs)`、每目标 FIFO pump、全局上限、批次封口和就绪、续接（W(S)）、awaiting_background 与 collect、唤醒、`cancel` |
| `core/routes.js` | 读 `api.runtime.agent.session.getSessionEntry({sessionKey, agentId})` 的 `entry.delivery`（kind=external → `.context`）【核实 types-core.ts:381；delivery-context.shared.ts:235-256】，选择 transport（bridge 或 agent），算 audience 与 sender |
| `core/transports/bridge.js` | 包装 `reg.bridges`，等桥就绪（listeners，最长 60 s） |
| `core/transports/agent.js` | `callGatewayFromCli("agent", {config}, {message, sessionKey, idempotencyKey: runId, deliver:true, bestEffortDeliver:true, sourceReplyDeliveryMode:"automatic", inputProvenance, extraSystemPrompt: channelPromptContext, lane}, {scopes: principal.isOwner ? ["operator.admin"] : ["operator.write"], progress:false})`，再调 `agent.wait`（先例 apps/v-experience/dingtalk/patch.mjs:24、143）【假设 A5】；可见请求用 `api.runtime.channel.outbound.loadAdapter(channel).sendText({cfg, to, text, accountId})`【核实 runtime-channel.ts:194-196；outbound.types.ts:299】 |
| `core/labels.js` | 会话标签（§7.1） |
| `core/copy.js` | §7、§8 的全部文案 |
| `core/recovery.js` | §6.3 |
| `core/tasks.js` | 往 `extraSources` 注册数据源，并通知 listeners |
| `core/guard.js` | `before_tool_call` 轮询闸，只读 `sessionsSendAccepted`，只返回 block，不改写参数（Codex 拒绝改参，记忆 codex-refuses-hook-param-rewrite） |
| `index.js` | 见下 |

**`index.js`** 按 `config.role` 分两种：

| role | 注册内容 |
|---|---|
| 默认 `gateway` | `registerGatewayMethod` 注册 5 个方法；`registerService` 启动引擎、跑恢复、注册 tasks；`api.on("before_tool_call", guard)`；生命周期订阅用 `onAgentEvent`（`openclaw/plugin-sdk/agent-harness-runtime`，:207）；预检用同一入口导出的 `resolveActiveEmbeddedRunSessionId`（:304；合并 reply 和 embedded 两个登记表，active-run-projections.ts:48-57）【核实】 |
| `worker-guard` | 只注册 guard。只在 §8.7 的条件触发后，才在 worker 第二份配置里声明 |

**`openclaw.plugin.json` configSchema**

```jsonc
{ "role": "gateway|worker-guard", "ledgerDir": "<optional>", "ownerName": "Tianyi", "agentNames": {},
  "limits": { "maxDepth": 2, "maxFanoutPerRun": 5, "maxChainMembers": 8, "maxSendsPerChain": 24, "maxPerPair": 6,
              "maxSendsPerMinute": 8, "chainIdleTtlMs": 21600000, "chainHardTtlMs": 86400000,
              "maxWakeRoundsPerSend": 4, "queueTimeoutMs": 21600000, "runTimeoutMs": 43200000,
              "inlineMaxMs": 300000, "maxConcurrentRequestTurns": 4, "maxQueuePerTarget": 10,
              "sharedVisibleChars": 200 } }
```

**配置**（WP12）
- 只写 Gateway 主配置：`plugins.load.paths` 加入插件目录，`plugins.entries["v-session-relay"]={enabled:true, config:{role:"gateway"}}`，并把插件 id 加进 trusted 名单。
- **R1 不动 worker 第二份配置。**

---

## 4. 忙闲与排队

### 4.1 判定分两层

1. **预检（插件，纯内存）**：

   ```
   busy = resolveActiveEmbeddedRunSessionId(target) !== undefined
          && !(deferredMemoryFlush.activeAfterYield({sessionKey: target}) === false)
       || engine.running.has(target)
   ```

   只是为了减少 BUSY 派发。BUSY 会走完整的入站前处理，包括 `updateLastRoute` 写库。
2. **权威判定（核心 G:3584 之后的守卫）**：与 9.1 决定 steer/followup/run-now 的位置相同。

### 4.2 竞态

- `dispatchReplyFromConfig` 一开始就按 sessionKey 预约准入票据，直到 `runReplyAgent` 做完排队决策才释放。所以同一会话所有入站回合的"判忙到登记"是串行的【报告 rel / reliability §4.2】。G 守卫在票据持有期内。

| 情形 | 结果 |
|---|---|
| 真人先拿到票 | 真人回合先登记；我们的回合在 G 守卫处看到 `isActive`，返回 BUSY（零输出、零 transcript），等真人回合结束再试。**永远不 steer 进真人回合** |
| 我们先拿到票 | 立即开跑。真人随后的消息见 4.5 |
| agent RPC 回合（cron、agent transport）在 G 与 R 之间开跑 | 我们按 run-now 串行（§3.4b），不 steer |
| 飞书串行队列 | `start()` 走 `enqueue(sequentialKey)`，排在已排队的真人消息之后（FIFO 公平）。单任务 10 分钟上限放行之后（M:7222），仍由 G 守卫兜底 |

### 4.3 每目标 FIFO 与 pump

```
队列项按类别排序（同类内 FIFO）：ask > wake = collect > request。
  ask 能解开正在 inline 等待的房间，wake/collect 能收尾链条。

enqueue(target, item)：
  if queue(target).filter(request).length >= maxQueuePerTarget → 受理时就返回 forbidden QUEUE_FULL（不写记录）
  追加；schedulePump(target)

pump(target)：                        // 每个目标同一时刻最多一个账本驱动的回合
  if running.has(target) || recoveryLock.has(target) → return
  head = queue(target)[0]；if !head → return
  if head.kind === "request" && globalRunningRequests >= maxConcurrentRequestTurns(4) → 加入全局等待集合；return
  if now > head.deadlines.queueBy → fail(head, not_started, "queue_timeout")；出队；pump
  if precheckBusy(target) → 进入 waiting；return             // 由事件或计时器再次触发
  CAS phase queued→starting，attempt 写盘（runId、messageSid 按 attempt 生成）
  outcome = await transport.start(head.startRequest())
  switch outcome.status
    started  → CAS starting→running(runId, startedAt)；飞书 edit 锚点去掉「⏳」行
               → await done → onRunEnd(head, outcome) → 出队 → pump(target)
    busy     → CAS starting→queued(attempt++, lastBusyAt)
               → 退避 5→10→20→40→60 s 封顶，或等到下一次 lifecycle end
    rejected → ROUTE_MISMATCH 或 NO_ROUTE：改走 agent transport 重试一次（记 transport=agent）
               RESTART_WEDGE：fail(interrupted, restart_wedge)
               其他：fail(not_started, code)

触发 pump：
  onAgentEvent(stream=lifecycle, phase∈{end,error}, sessionKey=target) → 防抖 1.5 s
  有排队项的目标各挂一个 30 s 内存计时器（不读写文件）
  全局并发名额释放时，唤起全局等待集合
排队提示：排队满 30 min 时，飞书 edit 锚点，末行改为 §7.2 的排队文案（只改一次）
```

### 4.4 同一目标收到多个并发请求

- 严格按类别和到达顺序处理。每个请求各占一个回合、一张卡、一个 runId，互不合并，保证"一个请求对应一个结果"。
- 同一发起回合对同一目标发同样内容：在途时按 §2.b 的内容去重返回原记录。内容不同则允许，按 FIFO 排队，同属一个批次。

### 4.5 插话（不承诺一定 steer，J1）

我们的回合正在跑时，真人在目标聊天里发消息：

| 环境 | 行为 |
|---|---|
| V（`VLAB_FEISHU_STEER_*` 开） | 飞书走 `:active-run` 车道（M:7385-7410），进入核心 steer。核心比较两个回合的**工具权限指纹**，指纹由 sender、senderIsOwner、traceAuthorized、policy 等派生（reply-tool-authority.ts；R:7961-7967）。**一致**才 steer 进协作回合，例如 owner 根链里 Tianyi 本人插话【假设 A9：provenance 不影响 policy】。**不一致**就转成 followup，在协作回合之后单独跑，这条 followup 没有流式卡（V 现状，不是新行为） |
| VLab、candidate（没有该变量） | 真人消息在飞书串行队列里排在协作回合之后，作为普通回合运行，有完整卡片 |

两种情况下协作结果都只交回一次。被 steer 的插话会影响交回的内容，文档如实说明。F4a/F4b 断言实际行为。

### 4.6 发起方正在 inline 等时

- 结果由 `vrelay.wait` 原子领取，engine 不再唤醒。
- inline 窗口过期，或发起回合 lifecycle 结束且结果尚未被领取，就转为异步，加入（或新建）该发起回合的批次。
- 已领取但发起回合以 error 或 abort 结束：`delivered_inline` 退回 `result_ready`，改走异步唤醒，防止"工具拿到了结果但 worker 死了"。

---

## 5. 防兜圈

**执行点**：只在 Gateway 的 `vrelay.send` 里执行（单写者，四个 harness 共用）。核心收到 `forbidden` 就把 `error` 原样作为工具结果，模型在过程流里能看到。worker 侧不读账本。

### 5.1 边分类（d = 发起回合的深度，C = 所属链）

| 边 | 判定（按顺序） | 规则 | 拦截码 |
|---|---|---|---|
| 自发自收 | target == requester | 走核心原逻辑（不进插件） | — |
| 叶子回合再发 | 当前回合 `leaf`（ask 回合） | 一律拒 | `LEAF` |
| 等待环（死锁） | 从 target 出发，沿"target 正 inline 等某会话"的边能走回当前 requester 会话 | 拒（reliability 的 ancestor 规则推广到任意环） | `WAIT_CYCLE` |
| 向自己的请求方发异步消息 | 当前回合服务于 S，且 target == S.requester，且 timeoutSeconds == 0 | 拒：异步与自动交回无法区分，会造成重复交回 | `REPLY_TO_REQUESTER` |
| 向自己的请求方提问 | 同上，但是 inline（timeoutSeconds ≥ 30） | **允许**，edge=ask，目标回合为叶子 | — |
| ask | target 已在 C 中、不是自己的子会话（兄弟房间、协调者、祖先） | 允许 inline 或 async，目标回合为叶子；计入 pair | — |
| followup | target 是自己的子会话（`members[target].parent == requester`） | 允许，深度不变，目标回合是 request（非叶子） | — |
| delegate | target 不在 C 中 | `d+1 ≤ maxDepth(2)`；本回合 delegate ≤ `maxFanoutPerRun(5)`；链成员 ≤ 8；成功后 target 入链（parent = requester） | `DEPTH` / `FANOUT` / `MEMBERS` |
| 预算 | 任何边 | 链 sends ≤ 24；每对会话（无向）≤ 6；速率 ≤ 8 次/60 s；链空闲 6 h 或总长 24 h 过期 | `CHAIN_BUDGET` / `PAIR_BUDGET` / `RATE` / `CHAIN_EXPIRED` |
| 排队满 | 目标 request 队列 ≥ 10 | 拒 | `QUEUE_FULL` |

**拦截文案**：见 §7.5。真人在任何会话里手动发的消息会开一条新链，所以人随时可以接着推进。

### 5.2 计数示例（A→X→三个房间）

| 环节 | 次数 |
|---|---|
| A→X | delegate 1 次 |
| X→a/b/c | delegate 3 次 |
| 房间 inline 问 X | 各 ≤ 2 次 |
| 房间之间互问 | 各 ≤ 2 次 |

合计 ≤ 16，低于 24。每对会话 ≤ 6。

### 5.3 回报只走自动结果

- 房间的最终回复自动交回 X。X 的批量唤醒回合汇总，它的最终回复自动交回 A。A 被唤醒一次，向 Tianyi 汇报一次。
- 唤醒回合的回复不会再送回对方（reply-once）。叶子回合不能再发。往上只能 inline 提问。
- 所以不会形成 ping-pong。

### 5.4 fan-in：收齐再报一次

- **批次** = 同一个发起 runId 交出的所有 async 发送（含 inline 转 async 的）。
- **封口**：发起回合 lifecycle end 或 error 时封口。重启后，已不在跑的发起回合的 open 批次立即封口。
- **就绪**：已封口且全员处于 `result_ready`、`failure_ready` 或 `skipped`。
- 就绪后只发**一个**唤醒回合，正文逐条列出结果。
- 唤醒要求发起方空闲，在它的 FIFO 里按 wake 类别排队。

### 5.5 续接（W(S)）与后台收尾

**W(S) 的定义** = {S 的目标回合} ∪ {servesSendId = S 的批量唤醒回合} ∪ {S 的 collect 回合}。answer（ask 叶子）回合和真人回合不算在内。

W(S) 中某个回合结束时，按顺序判断：
1. 该回合产生了 servesSendId=S 的新批次，或已有这样的批次未就绪：S 进入 `awaiting_children`。
2. 否则，`backgroundTasks(listActive(B), B)` 过滤后还有活：S 进入 `awaiting_background`。
   - 过滤规则：用 v-experience 的过滤去掉 B 自己的前台 cli 任务（v-experience.js:276-279），只保留 runtime 为 subagent/acp，以及 taskKind 为 exec、image_generation、video_generation、music_generation 的任务。排除 `sessions_send`（已由第 1 条覆盖）和 cron（长期存在的自动化）。
   - 覆盖 sessions_yield：yield 的回合等的是子 agent 任务，会出现在上述列表里。
3. 否则 `S.result` = 这个回合的 finals（文字 + 媒体），进入 `result_ready`。

**`awaiting_background` 的退出**
- 检查时机：每次 B 的 lifecycle end、`taskRegistryBridge.listeners` 通知，以及 30 s 内存计时器。过滤列表为空且 B 空闲时，engine 给 B 入队一个 **collect** 回合：可见锚点见 §7.2，提示见 §8.4。collect 回合的 finals 就是 `S.result`。
- 等待期间，A 的后台行仍显示这一项（会话请求）。超过 `runTimeoutMs` 按 timeout 失败；B 群不发消息，A 侧收到失败说明。
- 唤醒轮数上限：S 的 wake 加 collect 回合 ≤ `maxWakeRoundsPerSend(4)`。超过就以最后一轮的 finals 作为结果，并在唤醒 A 的正文里注明"对方仍有未完成项"。

---

## 6. 失败与重启

### 6.1 不变式

每个被受理的发送，恰好以下列之一收尾：
- 结果交回：所在批次 woken，或 inline 已领取（`delivered_inline`）；
- 失败交回：失败也算批次成员，随批次唤醒；
- 明确跳过：`skipped`、`cancelled`，并说明原因。

唤醒是否已完成，判据是唤醒回合已被准入：`wake.startedAt` 已落盘，或 transcript 里有它的标签。唤醒回合自己出错时，A 的卡片照常显示错误，**不重发**。

### 6.2 失败与跳过：两边分别看到什么

| 场景 | 目标聊天 B | 发起方 A | 账本 |
|---|---|---|---|
| NO_ROUTE / CHAT_GONE / NOT_MEMBER（受理时同步发现） | 无 | 工具立即报错：「发不到「{to}」的聊天：{原因}」 | 不建记录 |
| 锚点发送暂时失败（重试 2/10/30 s，三次仍失败） | 无 | 批次里该项 ⚠️ not_started「{渠道}暂时发不出消息」 | failure_ready |
| 路由断言不符或桥缺失 | 改走 agent transport：有可见请求，回复只有最终出站 | 正常 | transport=agent |
| 排队超过 6 h | 回复锚点：§7.4「一直在忙」 | ⚠️ not_started | failure_ready |
| 目标回合出错（模型、工具、worker 崩溃） | B 的卡按入站链路的失败收尾 | ⚠️ started_failed（「可能已在对方聊天发过部分内容」） | failure_ready |
| 在 B 群被人 /stop | B 原有的中止表现 | ⏹ aborted（「不要自动重发」） | failure_ready |
| 目标回合 12 h 仍未结束 | 继续跑（不强行中止） | ⚠️ timeout | failure_ready |
| NO_REPLY 或没有文字 | 卡片照常 | ↩️ 有结果，noReply（「请到「B」查看」） | result_ready(noReply) |
| 发起方是 subagent、隔离 cron 或 hook | 正常（v2 路径） | 无 | 插件返回 fallback |
| `vrelay.cancel` | 回复锚点 ⏹「已撤回」（纯消息，不起回合） | 批次里该项 ⏹ | cancelled |
| 发起方会话已删除 | — | — | skipped（只记日志） |
| 发起方会话 /new 重置 | — | 唤醒照常进入同一个 key 的新会话 | 正常 |
| 账本写盘失败 | 无 | 工具 error（先写账本后产生副作用，不会留下孤儿） | 不受理 |
| `vrelay.send` RPC 状态未知 | 视实际情况 | 工具 error：§7.6「状态未知，不要马上重发」；重发相同内容会被内容去重识别 | — |
| 重启楔死（`restart recovery claim changed`） | 回复锚点：§7.4「可能需要人工恢复」 | ⚠️ interrupted，提示「对该房间发一句『接着做完』需等它恢复」 | failure_ready(code=restart_wedge)，**不重排** |

### 6.3 重启恢复算法

**入口**：`registerService.start` 里，等所需的桥注册完（listeners，最长 60 s）之后，在后台顺序执行。不阻塞 `vrelay.send`；有记录正在恢复的目标会挂上 `recoveryLock`，pump 等它恢复完再处理。transcript 读取只针对不确定的阶段：一律 `api.runtime.subagent.getSessionMessages({sessionKey, limit: ≤20})`，并发 1，每次间隔 ≥ 500 ms【假设 A20】。

```
for rec in 非终态 send（按 createdAt）:
  accepted|posting:
    飞书：用同一个 uuid 重发锚点（距首次 post < 50 min 时由服务端去重；超过则照发，#code 相同便于辨认）
    其他渠道：重发（至少一次，#code 相同）
    → posted → 入队
  posted|queued: 入队（attempt+1，新 runId 和 messageSid）。不算失败
  starting（无 targetRun.startedAt）:
    读 target transcript 尾部，找 originSessionId 以 ":<kind>:<sendId>" 结尾的 user 消息
    找到 → 视为 running 且被打断，转下一分支
    没找到 → 入队（attempt+1）
  running:
    if rec.result 已落盘                                    → target_done 再判断
    entry = getSessionEntry(target)
    if entry.restartRecoveryDeliverySourceRunId === targetRun.runId
         → 订阅 / agent.wait(entry.restartRecoveryDeliveryRunId)
         → 结束后读 transcript 尾部：取恢复 run 开始之后、下一条非本标签 user 消息之前的 assistant 文本 → result(source=transcript)
    elif entry.status === "running" 且没有活跃 run（楔死前兆）
         → failure(interrupted, restart_wedge)；B 回复锚点（楔死文案）
    else → 观察 120 s，看有没有该会话的恢复回合开跑；没有 → failure(interrupted)；B 回复锚点（重启文案）
    不自动重跑：B 可能已经做了一半有副作用的事
  target_done|awaiting_children|awaiting_background|result_ready|failure_ready: 重新评估（§5.5），照常调度
for batch in 非终态 batch:
  open 且发起 run 不在跑 → 封口
  ready → 唤醒
  waking:
    if wake.startedAt 已落盘 → woken
       该回合在重启前没有结束，且 120 s 内没有核心恢复回合
       → 在 A 聊天发 §7.4 的「汇总被打断」说明（不重唤醒）
    else 读 A transcript 尾部，找 ":wake:<batchId>" 标签：
       找到 → woken
       没找到 → 重新唤醒（attempt+1；交回锚点已有 handbackMessageId，不再重发）
```

### 6.4 为什么不会重复唤醒

四层判据，前一层失效才轮到后一层：
1. 账本 CAS：先落 `waking`，再调桥；
2. `wake.startedAt` 或 transcript 标签；
3. 核心按 MessageSid 去重（20 min）；
4. 飞书锚点 uuid 去重。

本设计不依赖 Gateway 内存去重表（TTL 5 min）【报告 rel (1)】。

### 6.5 worker 回收与换代

worker 里不再有任何等待，回收或换代不影响结果。目标回合所在的 worker 崩溃时，lifecycle error 会走 started_failed。inline 等待中的发起方 worker 死掉时，按 §4.6 转为异步。

### 6.6 运维配套（WP11）

- `v-self-restart.py` 的 `busy_reasons`（:577）加一项：调 `vrelay.list({active:true})`，有在跑的协作回合时报「会话协作有 {n} 个回合在跑」；`--if-busy abort` 时据此不重启。
- 重启后 6.3 的 wedge 判定会在两边留下说明。

---

## 7. 用户可见文案

各渠道一律发纯文本或 markdown 消息，**不发自建卡片**。`#code` 在请求、排队、失败、交回各处一致。

### 7.1 标签（`labels.js`）

`{from}`/`{to}` 按以下顺序取：
1. 飞书群名（getChatInfo 缓存）或会话条目的 subject；
2. owner 私聊：「{ownerName} 私聊」，例如「Tianyi 私聊」；
3. 其他人的私聊：「一个私聊」（不暴露是谁）；
4. main：「V 主会话」；cron：「定时任务」；webchat 或 iOS：「V App」。

跨 agent 时加前缀「{agentName} · 」。总长 ≤ 24 字，超出用 `…` 截断。`{root}` = 链根标签，`{via}` = 上一层标签。

### 7.2 目标聊天里的锚点（机器人发出；飞书群和 Telegram 的回复卡挂在它下面）

| 情形 | 文案 |
|---|---|
| 下派 | `📨 来自「{from}」的请求 #{code}` / `{仅 depth=2：经「{via}」转来 · 源头「{root}」}` / `—` / `{visible}` |
| 追加给已有子会话 | `📨「{from}」追加了一件事 #{code}` / `—` / `{visible}` |
| 提问 | `❓「{from}」问 #{code}` / `—` / `{visible}` |
| 收尾（后台工作结束） | `📨 #{code} 的后台工作都结束了：请给出最终结果，会交回「{from}」` |
| 受理时目标正忙（追加在末行） | `⏳ 这里正在处理别的事，处理完就开始这条（前面还有 {n} 件）` |
| 飞书排队满 30 min（edit 末行） | `⏳ 已排队 {m} 分钟：这里一直在忙，处理完就开始` |
| 开跑时（飞书 edit） | 删掉 ⏳ 行 |
| 被截断（追加在末行） | `…（全文 {n} 字已交给 V）` |
| 企微（追加在末行） | `（企业微信里看不到处理过程，做完会发结果）` |

Telegram 用纯文本；钉钉和企微用 markdown，第一行加粗，正文转义 `` \`*_[]<>#|~ ``。

### 7.3 发起方聊天里的交回锚点（唤醒卡紧随其后；不重复贴结果全文）

| 情形 | 文案 |
|---|---|
| 单件成功 | `↩️「{to}」交回了 #{code} 的结果` |
| 单件无文字 | `↩️「{to}」交回了 #{code}（没有文字结果，请到「{to}」查看）` |
| 单件失败 | `⚠️「{to}」没能完成 #{code}：{reason}` |
| 单件中止 | `⏹「{to}」那边中止了 #{code}` |
| 批次 | `↩️ {n} 件都有结果了：「a」✅ ·「b」✅ ·「c」⚠️`（超过 5 件只列前 5 个，后接「等 {n} 件」；整行 ≤ 200 字） |
| 异步提问的答案 | `💬「{to}」回答了 #{code}` |

### 7.4 补充说明（回复对应锚点）

| 位置 | 情形 | 文案 |
|---|---|---|
| 目标聊天 | 没开始 | `⚠️ #{code} 没有开始：{reason}。已告诉「{from}」。` |
| 目标聊天 | 重启打断 | `⚠️ #{code} 做到一半 V 重启了，没做完。已告诉「{from}」。` |
| 目标聊天 | 楔死 | `⚠️ #{code} 做到一半 V 重启了，这个聊天可能要人工恢复后才能继续。已告诉「{from}」。` |
| 目标聊天 | 撤回 | `⏹ #{code} 已撤回（{reason}）。` |
| 发起方聊天 | 汇总被重启打断 | `⚠️ V 重启打断了 #{code} 的汇总。结果已在本对话的上下文里，发一句「继续」就能接着汇报。` |

**reason 词表**（每项 ≤ 30 字）

| 情形 | 文案 |
|---|---|
| 无路由 | 找不到这个聊天的投递地址 |
| 机器人不在 | 机器人不在这个聊天里 |
| 渠道不可用 | {渠道}暂时发不出消息 |
| 排队超时 | 这里一直在忙，等了 {h} 小时 |
| 出错 | 处理时出错：{err 前 30 字} |
| 中止 | 在对方聊天里被中止 |
| 超时 | 超过 12 小时还没结束 |
| 重启 | V 重启打断了处理 |
| 撤回 | 已撤回 |
| 会话归档 | 对方会话已归档 |

### 7.5 拦截文案（工具 `forbidden.error`，出现在发起方的过程流里）

| code | 文案 |
|---|---|
| LEAF | 这一轮是在回答「{asker}」的问题，不能再用 sessions_send；直接在回复里回答，回答会自动送回。 |
| WAIT_CYCLE | 「{to}」正在等你这一轮的结果，再发过去会互相卡住；直接把需要的内容写进你的回复。 |
| REPLY_TO_REQUESTER | 你在做「{to}」交来的事，最终回复会自动交回给它，不用发；要问它问题，用 timeoutSeconds=120 当场等回答。 |
| DEPTH | 已经是第 {d} 层转派（{path}），不能再往下派；自己做完，或在最终回复里说明需要谁来做。 |
| FANOUT | 这一轮已经交出 {n} 件事，不能再派；结果会一起回来。 |
| MEMBERS | 这项任务已经牵涉 {n} 个会话，不能再拉新的会话进来。 |
| CHAIN_BUDGET | 这条协作链已来回 {n} 次，为防止打转已停止。把现有结果告诉这里的人。 |
| PAIR_BUDGET | 你和「{to}」在这项任务里已来回 {n} 次，先停下，把分歧或现状写进回复。 |
| RATE | 发得太快（1 分钟 {n} 次），稍等再发。 |
| CHAIN_EXPIRED | 这项任务的协作已超过 {h} 小时，请直接向人汇报。 |
| QUEUE_FULL | 「{to}」排队已满（{n} 件），稍后再发或换个会话。 |

### 7.6 工具结果 note 与核心错误

| 情形 | 文案 |
|---|---|
| async，已开工 | 已交给「{to}」(#{code})，对方聊天里能看到这条请求，正在处理。结果会作为新的一轮自动回到这里；这一轮交出的几件会等齐后一起回来，只叫醒你一次。现在用一句话告诉这里的人交给了谁、做什么，然后结束本轮。不要 sleep，不要轮询 sessions_history / session_status。 |
| async，排队 | 已交给「{to}」(#{code})，它正在忙（前面还有 {k} 件），轮到后自动开始。（后半同上） |
| 去重命中 | 同样的请求 #{code} 已在进行，结果会自动回来；不要重复发送。 |
| inline 成功 | 这是「{to}」的回答（它的聊天里也看得到），不会再单独送回。接着做你的事，不要重复问同样的问题。 |
| inline 无文字 | 「{to}」这一轮没有给出文字结果，可以到它的聊天里看，或换个问法再问一次。 |
| inline 失败 | 「{to}」没能完成 #{code}：{reason}。{按 §8.4 类别补一句} |
| inline 超时转异步 | 「{to}」还在处理（已等 {s} 秒）。结果会作为新的一轮自动回到这里；现在先做别的或结束本轮，不要等待或轮询。 |
| inline 连接中断 | 和「{to}」之间的等待中断了，但请求 #{code} 已受理，结果会作为新的一轮回来；现在结束本轮，不要重发。 |
| 核心：状态未知 | 会话转交的状态未知（{err}）。先不要重发：一分钟后对方聊天里还没有出现这条请求再发一次，相同内容会被识别为同一件事。 |

### 7.7 长度上限（只限制可见正文；模型永远拿到全文）

| 渠道 | 上限 |
|---|---|
| 飞书 | 1500 字 |
| Telegram | 3500 字（硬上限 4096） |
| 钉钉 | 1500 字 |
| 企微 | 1000 字，且 ≤ 3800 字节 |

### 7.8 隐私裁剪

- **可见正文** = 请求方 V 写的 message，去掉 `MEDIA:` 行（改成「附 {n} 个文件」）。
- 密钥类内容替换为 `‹已隐去›`：`sk-…`、`ghp_…`、`xox[bpa]-…`、`AKIA[0-9A-Z]{16}`、PEM 私钥块、长度 ≥ 40 的连续 base64 或 hex。
- 全文受众（只受渠道上限约束）：`humans==="owner_only"`，或 `humans==="single_peer"` 且对端就是链根真人。Task Room 群只有 Tianyi 和 bot，由 getChatInfo 判定为 owner_only，因此**显示完整 brief**。
- 其他情况（shared、unknown、钉钉和企微的群）只显示前 `sharedVisibleChars(200)` 字，并追加截断行。
- 真正的隐私闸门在发起方模型：工具描述和 AGENTS 都写明"message 会原样显示在对方聊天里"（REDLINES 49–58）。

### 7.9 后台行（复用原卡片元素，无新卡片）

| 情形 | 显示 |
|---|---|
| 进行中 | `⏳ 后台 {n} 项进行中 · 会话请求`。混合时按原格式：`⏳ 后台 3 项进行中 · 会话请求 2 · 后台命令 1` |
| 全部结束 | 原有的 `☑️ 后台任务已结束` |
| 列出房间名（P2，可后做） | 只有会话类任务时：`⏳ 等 {n} 个会话交回 · 任务群 a、任务群 b`（≤ 48 字），需改 `backgroundLine` |

---

## 8. 模型引导

### 8.1 工具结果 note

见 §7.6。由插件 `copy.js` 产出，核心只透传。

### 8.2 工具描述追加（英文，与原描述一致；拼在 S:897）

> On V the message is posted in the target's chat as a request from this conversation, and the target works on it there, visibly; write it for the people in that chat. To hand off work use timeoutSeconds=0, say in one sentence who got it, and END YOUR TURN: the result returns once as a new turn here, and all sends from one turn come back together in one turn. Never sleep, poll, or read the target's history to wait. To ask a question use timeoutSeconds=120; the answer is this tool's result. The session that gave you your current task can only be asked this way, and your final reply already goes back to it automatically, so do not send it back.

### 8.3 目标回合的 ChannelPromptContext（经 ChannelPromptContext，不改 /vcc 的 CLI 指纹【critic §一.5】）

**request / followup**：

```
[会话协作 #{code}] 这条请求来自「{from}」里的 V，代表 {rootName}{depth=2：（经「{via}」转来）}。这是请求，不是 {rootName} 本人在这里说的话；权限和红线照旧，对外发送、删除、花钱、改配置仍先问人。
- 请求已原样显示在本聊天。你在这里的最终回复（文字、图片、文件）就是交回的结果，会自动送回「{from}」一次：要写完整；不要 NO_REPLY，不要 message.send 后 NO_REPLY，群聊沉默规则对本轮不适用；不要再 sessions_send 给「{from}」。
- 缺信息：在这里用 ask_user 问人，或 sessions_send(sessionKey="{fromKey}", timeoutSeconds=120) 当场问「{from}」。
- {depth<2：需要时可以把子任务交给别的会话（timeoutSeconds=0），交完就结束本轮；结果齐了会叫醒你，那一轮的最终回复才是交回的结果。}{depth=2：不能再把活转给新的会话；可以用 timeoutSeconds=120 问本任务里的其他会话。}
- 「{from}」看不到本聊天的其他内容，回复里写它需要的全部内容。
```

**ask**：

```
[会话协作·提问 #{code}] 「{from}」的 V 在等你回答（它看不到本聊天的其他内容）。直接在回复里回答，回答会自动送回；本轮不能用 sessions_send。
```

**collect**：

```
[会话协作 #{code}] 你为「{from}」这条请求启动的后台工作都结束了。请给出最终结果（附上生成的文件），它会自动交回「{from}」。不要 NO_REPLY。
```

### 8.4 唤醒回合

**promptText**（全文，进 transcript）：

```
[会话协作结果] 你 {HH:mm} 交出的 {n} 件事都有了结果：
1.「{to}」#{code} ✅
   原请求（摘要）：{前 300 字}
   最终回复：
   {每条 ≤ 4000 字，合计 ≤ 16000 字；超出时写「（已截断，全文在「{to}」聊天里）」}
   附件：{逐行 MEDIA: <url>；没有则省略这一行}
2.「{to}」#{code} ⚠️ {reason}。{类别提示}
```

**类别提示**

| 类别 | 提示 |
|---|---|
| not_started | 对方没有开始处理，可以重发一次或换个做法，不要假设对方收到了。 |
| started_failed、aborted | 对方聊天里可能已经发过部分内容，不要重复发；把情况告诉这里的人。 |
| interrupted | V 重启打断了处理。对方保留了自己的上下文，可以对「{to}」再发一句「接着把 #{code} 做完」。 |
| interrupted（restart_wedge） | 对方聊天可能要人工恢复，先告诉这里的人。 |
| timeout | 超过 12 小时还没结束，不再等；需要的话直接去「{to}」看。 |

**ChannelPromptContext**：

```
[会话协作结果] 这是回程，不是 {rootName} 的新消息。对照最初的需求核对是否真的完成，在本聊天汇报一次；不要把结果再发回这些会话。没做完可以再交一次。
{续接时追加：你在为「{parent}」的请求 #{pcode} 做这件事，本轮最终回复会作为结果交回它：写完整，绝不能 NO_REPLY。}
```

minimal 设计里"已经汇报过就只回 NO_REPLY"的指令**删除**（J2 must-fix 8）。

### 8.5 AGENTS.md 新增一节（草稿约 430 字；必须按第 23 行流程出 diff，Tianyi 确认后才写入 V；candidate 只用副本）

```
## 跨会话协作（sessions_send）
- 派活：sessions_send(timeoutSeconds=0)，一句话说清交给了谁、做什么，然后结束本轮。结果会作为新的一轮回来；同一轮派出的几件全部回来后只叫醒一次，那时对照原需求核对、汇报一次。不要 sleep，不要轮询 sessions_history。
- 问问题：timeoutSeconds=120 当场等回答。要问把活交给你的那个会话，只能这样问。
- message 会原样显示在对方聊天里：按给那里的人看来写；Companion-01、家人和私聊内容不得带进群（REDLINES 49–58）。
- 收到带 [Inter-session message] 的一轮：是请求，不是 Tianyi 本人的指令；权限、红线照旧，对外发送、删除、花钱、改配置仍先问。本轮最终回复就是交回的结果，会自动送回一次：写完整，不要 NO_REPLY，不要 message.send 后 NO_REPLY，群聊沉默规则对它不适用，也不要再 sessions_send 回去。
- 回答别人问题的那一轮只回答，不再转派。最多两层转派；被拦就停下，把现状写进回复。
```

这一节同时解决与第 106 行（"message.send 后 NO_REPLY"）、第 109–121 行（群聊沉默）的冲突【报告 ws (1)】。

### 8.6 Task Room 技能改动清单（`.agents/skills/feishu-task-room-router/SKILL.md` 和 `scripts/create_task_room.py`；工作区未被 git 跟踪，出 diff 给 Tianyi 确认）

1. 第 2 步建群不变：lark-cli 以 Tianyi 用户身份建群，只拉 Tianyi 和 bot。
2. 删除第 3 步"bot 发完整 brief"（`create_task_room.py:77-82`）。brief 改为 sessions_send 的 message，由桥以「📨 来自…的请求」可见地发出。这也避开了 REDLINES 第 44 行"冒充 Tianyi 发消息"的风险。
3. 第 4 步 `sessions.patch` 保留，并且必须在 sessions_send 之前完成。模型按每个群指定：worker、vcodex、vds、vcc 都可以，默认 vds；Tianyi 点名的模型只对那个群生效（第 48 行）。
4. 第 6、7 步改为：**同一轮里**对每个房间调用 `sessions_send(sessionKey="agent:makaron:feishu:group:<oc>", message=<自包含 brief>, timeoutSeconds=0)`，再用一句话列出房间，结束本轮。删除"请 Tianyi 去群里说开始吧"和"群里第一条用户消息才算开工"。
5. 第 8 步改为：三个房间的结果齐了会叫醒一次，那一轮汇总，只汇报一次。
6. 新增，brief 模板必须写明：交付物；「做完在群里给出最终结果，会自动交回」；「缺信息用 timeoutSeconds=120 问 <coordinator sessionKey> 或其他房间」。
7. 新增：一次最多 5 个房间；Tianyi 随时可以在房间里插话。
8. 第 18、26 行"不用 sessions_spawn 代替建群"保留。

### 8.7 杜绝 sleep 轮询

1. **结构**：工具立即返回，唤醒由 Gateway 持久负责，按批次只唤醒一次。等待没有任何收益；即使模型还是等了，唤醒也只是排在它的回合之后，不丢、不重。
2. **文字**：工具结果 note、工具描述、AGENTS 三处说法一致。
3. **硬闸（R1）**：Gateway 内的 `before_tool_call` guard 覆盖 vcodex/vds（经 Codex PreToolUse 中继，只 block）和 /vcc 的 OpenClaw 工具（MCP loopback）。规则如下，只在 `sessionsSendAccepted` 有当前 runId 时生效：
   - `exec`/`bash`/`process`/`shell`/`exec_command`/`local_shell` 的命令匹配 `\bsleep\s+(\d+(\.\d+)?)` 且秒数 ≥ 15，或 `\btimeout\s+\d{2,}`，或 `while\b[^;]*;\s*do\b[\s\S]*\bsleep\b`；
   - 对 accepted 表里的目标第 2 次起调用 `sessions_history`/`session_status`。
   - 拦截文案：「你已把 #{code} 交给「{to}」，结果会作为新的一轮自动回来。现在结束本轮（说清交给了谁、做什么），不要等待或轮询。」
4. **worker 硬闸（按指标决定是否开）**：代码在 R1 一并交付（`role:"worker-guard"`）。R1 candidate 对 worker 跑 5 次，统计 `requester_tail_ms`（受理到发起回合结束的时间）。**少于 4 次在 60 s 内结束**，就在 worker 第二份配置里声明 `role:"worker-guard"`，并写明回滚顺序：先改配置，再删目录（记忆 deleted-plugin-dir-breaks-worker-config）。否则 R1 不声明。
5. **/vcc 原生 Bash 拦不到**，只能靠第 1、2 层，如实说明。

---

## 9. 各 harness 与各渠道的差异与降级

### 9.1 harness

| | V worker | /vcodex | /vds | /vcc |
|---|---|---|---|---|
| sessions_send 在哪执行 | worker 子进程【报告 harness (1)】 | Gateway 内 codex 动态工具 | 同 vcodex | Gateway MCP loopback |
| `vrelay.*` 调用方式 | worker 的 gateway client，显式 scopes【A4】 | 进程内 dispatch，显式 scopes | 同 | 同 |
| `opts.runId`/sender 是否到位 | 【A3】；不到位时退到 activeTurnBySession | 【A3】 | 【A3】 | 【A3】；MCP 已回移 requesterSenderId（tool-resolution:103-180） |
| 作为目标或被唤醒 | 入站链路；流式回调按白名单桥接（harness-event-contract:27-54） | 入站链路；V 和 VLab 生效配置都是 `visibleReplies=automatic`【critic §一.2】；不再在入站与 RPC 两种投递模式间翻转 | 同 | 入站链路；inter_session 算 synthetic；ChannelPromptContext 不改 CLI 指纹 |
| 预设 runId | Gateway 把 runId 传给 worker（worker index.mjs:630、656）【核实】 | 【A2】 | 【A2】 | 【A2】 |
| 轮询硬闸 | 按 §8.7 第 4 条决定 | 有 | 有 | 只拦 OpenClaw 工具；原生 Bash 不拦 |
| 在哪测 | candidate | **只能共享 VLab stage**（OAuth 令牌风险） | candidate（按 harness 报告准备 3 个补丁和 config.toml） | candidate（私装 2.1.280 + `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`） |
| 已知问题 | worker 回收不再丢回信 | 无新增 | vds↔vcodex 同会话切换 401（记忆） | #164972 跨轮丢上下文【A14】，所以 brief 必须自包含；inter_session 回合建不了 cron（没有签名发送者）【报告 harness (3)】 |

### 9.2 渠道

| | 飞书（R1） | Telegram（R2；R1 走 agent） | 钉钉（R2；R1 走 agent） | 企微（R2；R1 走 agent） | 无渠道会话 |
|---|---|---|---|---|---|
| 请求锚点 | text，可编辑，uuid 幂等 | sendMessage（R1 用 outbound.sendText） | 主动 markdown | ws 主动 markdown | 无（只进 transcript） |
| 回复体验 | 流式卡、过程流、清单、后台行、页脚、ask_user、图文、插话 | progress 草稿、workView 清单、后台行、图文 | AI 卡和 vWork（按目标建卡）；没有页脚（今天就没有） | **不能流式**：只有锚点、单独发的问题、终稿 markdown、后台结束行 | agent RPC 只有最终出站 |
| R1 时的状态 | 完整 | 可见请求 + 最终出站（v2 语义） | 同左 | 同左 | 同左 |
| 卡片挂在锚点下 | 群里是；私聊不挂（skipReplyTo） | 是 | 否（紧随其后） | 否 | — |
| owner 身份 | 有（ownerAllowFrom feishu） | 有（ownerAllowFrom telegram） | **永远没有**（今天也没有）【critic §一.3】 | 永远没有 | 按 agent transport 的 scope【A5】 |
| BUSY 零输出要点 | 核心 eligibility + M:5136 + 推迟预建卡 + 不贴打字表情 | 核心 eligibility + 关闭状态表情 + 跳过 BM:4053/4068 | 推迟建 AI 卡 + 跳过贴表情 | 本来就不流式 | — |
| 幂等 | 有 | 至少一次（#code 可辨认） | 同 | 同 | — |
| 自回声 | 已挡（M:7535、8536） | 平台不推送 | 加防御【A11】 | 加防御【A11】 | — |
| 降级 | ROUTE_MISMATCH 走 agent | — | 建卡失败（403）改走 proactive | 体验差距事先告诉 Tianyi | — |

---

## 10. 测试计划

### 10.1 离线测试（CI，全部登记进 catalog）

- **补丁测试**：读捕获 → 打补丁 → 等于 generated → 锚点唯一 → marker 正确 → `node --check`。
  - `tests/sessions-send-relay.test.mjs`
  - `tests/inter-session-admission.test.mjs`
  - `tests/task-bridge-extra-sources.test.mjs`
  - `tests/patch-feishu-inter-session-bridge.test.mjs`
  - R2：`tests/patch-telegram-inter-session-bridge.test.mjs`、`tests/patch-dingtalk-inter-session-bridge.test.mjs`、`tests/patch-wecom-inter-session-bridge.test.mjs`，各读自己的捕获或 baseline。
- **插件测试**：放在 `apps/v-session-relay/plugin/tests/`，由 `tests/v-session-relay.test.mjs` 统一 import 进 catalog（`apps/` 不在 audit 扫描范围）。内容：
  - contracts；
  - policy：§5.1 每一行和每个拦截码，以及等待环；
  - engine：全部 phase 转移、FIFO 类别排序、全局上限、批次封口与就绪、续接 W(S)、awaiting_background 与 collect、inline 领取 CAS 竞态、`delivered_inline` 退回；
  - ledger：原子写、LOCK、归档；
  - recovery：每个 phase 的分支；
  - guard：sleep、timeout、while 正则，以及 history 计数；
  - copy：长度和转义；
  - **故障注入**：`VSR_CRASH_AT=<phase>`，在 accepted、posting、posted、starting、running、target_done、result_ready、waking 各阶段落盘后 `process.exit`，再用 fake-bridge 重启，断言：唤醒 ≤ 1 次，结果不丢，飞书锚点不重复（非飞书只允许 #code 相同的重复锚点）。
- **计数**：`platform/platform.test.mjs:29` 的 `offlineFiles` 按新增测试文件数增加。

### 10.2 candidate 公共设置

- **换文件**：用 plan 的 `files` 加 `before`，receipt 可追溯【报告 release (2)】；不在脚本里改 runtime。
- **飞书**：loopback webhook 入站，真实 VLab app 出站，**不开第二条长连接**。读回用 Mac 上 owner 身份的 `lark-cli im +chat-messages-list`（只读，10/20 文档的做法）。断言：卡片 `parent_id` 等于锚点、有页脚、正文含 RUN_TAG。
- **Telegram/钉钉/企微**：只用 `lab/candidate/{telegram-fake-bot-api,dingtalk-fake-open-api,wecom-fake-aibot}.mjs`，脚本整体替换 `config.channels`，绝不连共享 VLab 的机器人。
- **两种环境**：每个飞书计划跑两遍。
  - `env=v`：`VLAB_FEISHU_STEER_ENABLED=1`、`VLAB_FEISHU_STEER_CHAT_IDS=*`、`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`；
  - `env=vlab`：不补这些变量【critic §一.2】。
- **工作区**：把 V 当前的 AGENTS、REDLINES、SOUL、USER、TOOLS、MEMORY 和 Task Room 技能作为 plan inputs（带 sha256，不进 git），再把 §8.5、§8.6 的草稿叠到副本上。加载器为 `lab/candidate/inter-session-workspace.mjs`。
- **owner**：`commands.ownerAllowFrom=["feishu:ou_775a78b0…"]`，即 Tianyi 在 VLab app 下的 open_id（session-relay-native.mjs 先例）。
- **清理**：每次跑完删除 candidate 基线和产物（记忆 vlab-clean-caches-after-use，防止 vlab91 磁盘写满挡住所有 stage）。

### 10.3 飞书场景（`lab/candidate/inter-session-feishu.mjs`；`RELAY_HARNESS=worker|vds|vcc`；plan 为 `inter-session-feishu-{v,vlab}-env.plan.json`）

断言一律要证明功能成立：读回两侧聊天，并核对账本和 transcript，不能只查错误字符串（记忆 acceptance-must-prove-function）。

| 编号 | 场景 | 断言 |
|---|---|---|
| F1 | inline 提问 | 目标聊天有 ❓ 锚点，卡片是锚点的回复；工具结果 ok；**没有**交回锚点 |
| F2 | async 单件（目标跑 75 s） | 发起回合在受理后 60 s 内结束（`requester_tail_ms`），过程流里没有 sleep；目标有 📨 锚点和流式卡；发起方恰好 1 条 ↩️ 和 1 张唤醒卡 |
| F3 | 目标忙：先经 webhook 让真人开一个 60 s 回合，再发请求 | 锚点带 ⏳；协作卡在真人回合结束后才出现，runId 等于预设值；真人回合的 transcript 不含请求；BUSY 期间目标聊天**零新消息**（读回比对）；会话 transcript 没有多余 user 消息 |
| F3b | 竞态：`VSR_TEST_START_DELAY_MS=3000`，延迟期内注入真人消息 | 出现 BUSY，attempt 1 重试成功；零孤儿卡、零兜底文案、无打字表情残留；下一条真人回合的 prompt 里没有把请求当群历史【A7】 |
| F3c | 守卫与 R 之间的窗口：测试钩子在守卫后、R 前触发一个 agent RPC 回合 | 协作回合排在其后运行，没有 steer【A8】 |
| F4a | owner 根链，协作回合运行中 Tianyi（owner）插话（env=v） | 记录实际行为（steer 进同一张卡，或排在之后）；结果只交回一次 |
| F4b | 同上，插话者是非 owner 的第二个模拟用户（env=v） | 插话被排队，**不** steer 进 owner 权限回合 |
| F5 | 目标回合运行中 kill -9 Gateway 再启动 | B 群出现重启说明或恢复回合，二者择一；A 恰好收到 1 次结果或失败唤醒；**重启后房间能接住一条真人消息**（楔死检测） |
| F6 | `VSR_CRASH_AT` 各阶段的真机版（posting、running、waking） | 唤醒 ≤ 1；飞书锚点不重复 |
| F7 | fan-out 3 + fan-in | 只有 1 个 ↩️ 和 1 张汇总卡；A 的后台行从 3 降到「已结束」；**一次 fan-out 3 恰好一次交回** |
| F8 | 诱导兜圈（「你们互相确认 10 次」，以及房间再下派） | 被拦，拦截文案出现在过程流；chain 计数正确 |
| F9 | 目标 NO_REPLY | A 收到 noReply 文案 |
| F10 | 目标模型无效 | B 卡失败收尾；A 收到 started_failed |
| F11 | 可见正文裁剪：owner_only 群显示全文；共享群（成员多于 1）≤ 200 字；植入假密钥被隐去 | 模型拿到全文（读 transcript） |
| F12 | **新房间只经 sessions.patch 建过条目、从未收过入站** | 路由从 key 推出；锚点和卡出现；之后条目有 `delivery.kind=external` |
| F13 | 续接 A→X→3 房间 | A 拿到的是 X 收齐后的汇总，**不是**「已开工」那句 |
| F14 | 兄弟互问：a inline 问 b，同时 b inline 问 a | 后发的一方被 WAIT_CYCLE 拦；没有回合挂起超过 inline 上限 |
| F15 | 后台收尾：房间起一个 90 s 后台 exec 后结束本轮 | 进 awaiting_background；之后出现 collect 锚点和卡；结果是 collect 的回复 |
| F16 | `DISABLED` 文件存在 | 走 v2：没有锚点，只有最终出站 |
| F17 | 全局上限：fan-out 5 | 4 个开跑，第 5 个锚点带 ⏳，名额释放后开跑 |
| C-stock | V 原字节（不打补丁）跑 F1–F3 | 复现三个遗留问题（对照） |
| C-fallback | 核心打补丁、插件禁用 | 行为等于 v2；确认降级错误文本匹配正则【A4】 |
| S-tail | 每个 harness（worker、vds、vcc）跑 F2 各 5 次 | 输出 `requester_tail_ms` 分布，作为 §8.7 第 4 条的判据 |

### 10.4 三房间协调者场景（`lab/candidate/inter-session-taskroom.mjs` + `inter-session-taskroom.plan.json`）

**建群：绝不用生产 lark-cli。**
- candidate 给 agent 进程设私有 `HOME`（没有任何 `.lark-cli` 配置）。
- 在 PATH 最前放 shim `lab/candidate/lark-cli-shim/lark-cli`（node 脚本）：
  - 只接受 `im +chat-create`（不管 `--as`），**从不访问网络**，从预建池轮转返回 `oc_…`，并把参数记到 `$VLAB_CANDIDATE_DATA/lark-shim.log`；
  - 其他子命令一律退出码 3 并打印说明；
  - 如果在环境变量或任何配置里发现 appId `cli_a9365919fc3a1bd6`（V 生产），立即退出 4。
- 预建池：请 Tianyi 一次性手工建 3 个群「VLab 测试｜房间 1/2/3」，成员只有 Tianyi 和 VLab bot `cli_aae2…`，之后每次复用。
- 工作区副本里的 `create_task_room.py` 用 §8.6 改过的版本，它会调用 shim。
- 每个房间 `sessions.patch` 分别指定 worker、vds、vcc。

**变体**
- TR1：X = owner 私聊（深度 1）。
- TR2：A = owner 私聊，X = 「VLab 发布验收 B」，房间深度 2，测续接。

**剧本**
1. 经 webhook 注入 Tianyi 私聊：「让 X 开三个 Task Room，分别做 a/b/c」。
2. a 的任务设计成需要 inline 问 b；b 的任务设计成需要 inline 问 X。
3. 期间 kill -9 一次 Gateway（TR2 才做）。

**断言**
- 3 个群各有一条 📨 锚点（显示完整 brief）和一张卡；
- a 问 b、b 问 X 的问答可见并回流；
- X 只被批量唤醒一次、汇总一次；
- 私聊只有一个 ↩️ 和一张汇报卡；
- 没有超出预算，没有重复消息；
- shim 日志里没有网络访问。

**真实建群**：只有在只读确认 VLab app 有 `im:chat` 写权限、且 Tianyi 同意之后，才改用 VLab bot 身份的 `im/v1/chats`。

### 10.5 R2 场景（`lab/candidate/inter-session-{telegram,dingtalk,wecom}.mjs`）

对每个渠道跑 F1、F2、F3、F5。断言 fake 平台记录到的请求序列：

| 渠道 | 额外断言 |
|---|---|
| 共同 | BUSY 时零 sendMessage、零编辑、零表情 |
| Telegram | 草稿编辑序列；锚点 reply |
| 钉钉 | AI 卡建在 onAgentRunStart 之后；注入 403 后改走 proactive 兜底；**零 sessionWebhook 请求** |
| 企微 | **没有**对伪造 req_id 的 `aibot_respond_msg`；终稿 markdown 正确 |

### 10.6 必须在共享 VLab 做的

只能在 Tianyi 授权合入 dev 之后的 stage 阶段做：持有 lease，占唯一的槽，最后必须上 V 后 `align`，或者 `rollback`【报告 release (3)】。

- vcodex 当协调者，也当其中一个房间。
- 真实飞书 WS 下跑 F2、F7。
- R2：真实 Telegram 测试 bot、钉钉「Vlab」、企微测试 bot，由 Tianyi 真人发消息驱动。可选：企微复用 req_id 开流的实验，不进 v1。
- **共享 VLab 不测"建群"那一步**：共享 Gateway 用户的 lark-cli 绑的是 V 生产 app【报告 ws (4)】。用预建群加 sessions.patch。

### 10.7 Tianyi 验收清单（上 V 后，在飞书私聊）

1. 说「让 X 开三个 Task Room，分别做 a/b/c」：V 的卡片说已交出，本轮结束，后台行显示「⏳ … 会话请求」。
2. 1 分钟内 3 个群各出现「📨 来自「X」的请求 #…」（完整 brief），下面紧跟平时的流式卡（有过程流、清单、页脚，页脚显示该群的模型）。
3. 在群 b 让它问 X：X 的聊天出现 ❓ 和回答卡，群 b 接着做。
4. 在群 a 中途插一句话：被吸收进当前卡，或排在当前任务之后（两种都对）；最终结果只交回一次。
5. 全部完成后：X 只出现一条 ↩️ 和一张汇总卡；私聊只出现一条 ↩️ 和**一张**最终汇报卡。
6. 中途用 v-self-restart 重启一次：没有丢失，被打断的明确报告，没有重复的请求或唤醒；重启后各群还能正常对话。
7. 诱导兜圈：被清楚地叫停。
8. 全程所有过程流里没有 sleep 或轮询。
9. R2 上线后：从私聊对 Telegram、钉钉、企微各发一次，看到请求和回复。钉钉没有页脚、企微没有流式，事先已说明。
10. worker、vcodex、vds、vcc 各至少当一次房间。

---

## 11. 实施拆分

依赖链：**WP0 → {WP1, WP2, WP3, WP4, WP5, WP9, WP11} 并行 → WP10（跑 candidate）→ WP12 → R1 上线 → {WP6, WP7, WP8} → WP13 → R2 上线**。

**WP0 契约冻结与基线**（S，1 d；无依赖）
- 新文件：
  - `apps/v-session-relay/plugin/core/contracts.js`
  - `apps/v-session-relay/plugin/tests/fixtures/fake-bridge.mjs`（实现 §2.a 的假桥，可注入 busy、rejected 和延迟）
  - `apps/v-session-relay/plugin/tests/contracts.test.mjs`
  - `tests/fixtures/inter-session-v-bytes.json`（R1、R2 每个目标文件 → 捕获路径 + sha256）
  - `lab/candidate/inter-session-probe.mjs` + `.plan.json`（只读探针：A1、A2、A3、A4、A6）
- 输入：本文 §2；最新 V 捕获。若 dev 上有比 subagent-index-20261020 更新的 capture PR，以它为基。
- 输出：冻结的常量和类型；A1–A6 的结论（写进 PR 说明，并回填本文 §12）。

**WP1 核心独占准入守卫**（S，1 d；依赖 WP0）
- 新文件：`lab/release-files/inter-session-admission/patch.mjs`（导出 `MARKER`、`FILES`、`patchGetReply`、`patchAgentRunnerRuntime`）、`generated/get-reply-CqW1y05D.js`、`generated/agent-runner.runtime-CAdsMsQt.js`、`tests/inter-session-admission.test.mjs`。
- 内容：§3.3、§3.4。

**WP2 核心 sessions_send v3 和工具接线**（M，2 d；依赖 WP0）
- 新文件：`lab/release-files/sessions-send-relay/patch.mjs`（`patchSessionsSendRelay` 内部先应用 `../sessions-send-reply-once/patch.mjs` 的 v2；`patchOpenclawTools`）、`generated/sessions-spawn-tool-1FQMTkIo.js`、`generated/openclaw-tools-BODVdJQD.js`、`tests/sessions-send-relay.test.mjs`。
- 内容：§3.1、§3.2。

**WP3 后台行数据源 hook**（S，0.5 d；依赖 WP0）
- 新文件：`lab/release-files/task-bridge-extra-sources/patch.mjs`、`generated/task-registry-activity-DSlVVJwD.js`、`tests/task-bridge-extra-sources.test.mjs`。
- 内容：§3.5。

**WP4 飞书桥**（M，2.5 d；依赖 WP0，字段名以 §2.a 为准，可与 WP1 并行）
- 新文件：`lab/release-files/feishu-inter-session-bridge/patch.mjs`、`generated/monitor.account-WFdlCDhR.js`、`tests/patch-feishu-inter-session-bridge.test.mjs`。
- 如果 `tests/vlab-static.sh` 显式列举飞书补丁测试，把它加进去。
- 内容：§3.6。

**WP5 插件 2.0**（L，5 d；依赖 WP0）
- 改写：`apps/v-session-relay/plugin/{index.js, openclaw.plugin.json, package.json(version 2.0.0)}`。
- 新文件：`core/{ledger,policy,engine,routes,labels,copy,recovery,tasks,guard}.js`、`core/transports/{bridge,agent}.js`。
- 删除：`core/{feishu,native,turns,dispatcher,store,sessions,text}.js`、旧 `tests/relay.test.mjs`。
- 测试：`tests/{policy,engine,ledger,recovery,crash-injection,guard,copy,routes}.test.mjs`；仓库根 `tests/v-session-relay.test.mjs`（汇总 import）。
- 内容：§2.b–§2.d、§4–§8。

**WP6 Telegram 桥**（R2；M，1.5 d；依赖 WP0、WP1）
- 新文件：`lab/release-files/telegram-inter-session-bridge/patch.mjs`、generated 3 个文件（`telegram-ingress-drain-factory-DJM2Jqrc.js`、`bot-message-DC6p8sB3.js`、`v-experience.js`）、`tests/patch-telegram-inter-session-bridge.test.mjs`。
- 内容：§3.7。

**WP7 钉钉桥**（R2；M，2 d；依赖 WP0、WP1）
- 新文件：`apps/v-experience/dingtalk/patch-inter-session.mjs`；`lab/release-files/v-experience-channels/` 下的新产物和 manifest before/after；测试。
- 内容：§3.8。

**WP8 企微桥**（R2；M，1 d；依赖 WP0、WP1）
- 新文件：`apps/v-experience/wecom/patch-inter-session.mjs`；产物与测试同上。
- 内容：§3.9。

**WP9 工作区草稿**（S，0.5 d；无依赖）
- 不进 git：AGENTS 一节、SKILL.md 和 `create_task_room.py` 的 diff 交给 Tianyi 看。
- 新文件：`lab/candidate/inter-session-workspace.mjs`（把带哈希的 inputs 复制进私有工作区，再叠上草稿）。

**WP10 candidate 驱动**（L，3 d；脚本开发不依赖其他 WP，实跑需要 WP1、WP2、WP4、WP5）
- 新文件：
  - `lab/candidate/inter-session-support.mjs`（启停私有 Gateway、webhook 注入、owner 读回、kill -9 重启、`requester_tail_ms` 采集）
  - `inter-session-feishu.mjs`、`inter-session-taskroom.mjs`
  - `lark-cli-shim/lark-cli`
  - plans：`inter-session-feishu-{v,vlab}-env`、`inter-session-taskroom`、`inter-session-control-stock`、`inter-session-control-fallback`、`inter-session-crash`、`inter-session-tail`
- 内容：§10.2–§10.4。

**WP11 监控与运维**（S，1 d；依赖 WP0）
- `scripts/firsttext-e2e-report.mjs`（:36-38）：排除 `origin:"inter_session"` 和 `v-a2a-` 前缀的 runId。
- `scripts/v-sentinel/sentinel.py`：SLOW_FIRST_VISIBLE、SLOW_DISPATCH、claimed-300s、DISPATCH_FAIL 排除 `v-a2a-` 和 BUSY；保留房间回合的 cutoff 告警。
- `scripts/v-self-restart.py`：`busy_reasons` 加 `vrelay.list`。
- 对应的已有测试各加用例。

**WP12 发版接入**（M，1.5 d；依赖 WP1–WP5 和 WP10 通过）
- `scripts/lib/runtime-components.mjs` 加组件 `{id:'session-relay', target:/^(extensions\/v-session-relay)\/(.+)$/, capture:{base:'none'}, …}`，并做第一次捕获。
- `platform/catalog.json` 登记全部新测试；`platform/platform.test.mjs` 改计数。
- `lab/inter-session-r1.plan.json`：`baseRelease:"REPLACE_AT_STAGE"`，files 为 5 个核心文件、1 个飞书文件和插件目录，带 before/after。
- `scripts/configure-v-session-relay.mjs plan|apply|revert`：只改主配置；由 `v-self-restart --while-stopped` 调用。
- `docs/inter-session-collaboration.md`（替代 `docs/session-relay-native-push-20261020.md`）；PR 文案；回滚说明：
  1. 立即止血：创建 `DISABLED`；
  2. 整体回滚：promote 的 `undo.json` 恢复 dist；
  3. `configure-v-session-relay.mjs revert`（undo.json 不覆盖配置），再删插件目录；
  4. 若开过 worker-guard：先改 worker 配置，再删目录。

**WP13 R2 candidate**（M，2 d；依赖 WP6–WP8）
- 新文件：`lab/candidate/inter-session-{telegram,dingtalk,wecom}.mjs` + plans。
- 内容：§10.5。

**上线**（每次都走：candidate → Tianyi 授权合 dev → 共享 VLab stage 验收 → Tianyi 授权上 V）
- **R1**：WP1–WP5 和 WP12，覆盖 Tianyi 的端到端场景。新增插件声明会碰到"配置热重载关掉 worker 池"的坑，必须用 `v-self-restart --while-stopped "node scripts/configure-v-session-relay.mjs apply"` 先停再写，并由 Tianyi 授权【REDLINES 125；记忆 config-hot-reload-kills-worker-pool】。
- **R2**：WP6–WP8 和 WP13。

---

## 12. 风险与未决

### 12.1 需要验证的假设

| ID | 假设 | 验证 | 不成立时的退路 |
|---|---|---|---|
| A1 | `replyOptions.vInterSession/runId/onAgentRunStart` 在四条渠道链路上都能原样到达 get-reply 的 `opts`。dispatch-from-config 这一层已核实（:1678-1697），渠道层未核实 | WP0 探针。结果：飞书入站成立（worker/vds/vcc 三条都执行到 G:3584）：`opts.vInterSession` 为对象、`onBusy` 仍是函数，`opts.runId` 为预设值，`ctx.VInterSession` 也到达，`opts.onDeliberateSilentTerminalReply` 可用；Telegram/钉钉/企微留给 R2 各自的 candidate（probe-results.md） | 守卫同时读 `ctx.VInterSession`（经 extra） |
| A2 | 预设 runId 在 worker、codex、claude-cli 的入站路径上都生效（critic §三.4） | 探针：对比 `onAgentRunStart` 报回的 runId 与预设值。结果：成立，worker、vds、vcc 报回的都是预设 `v-a2a-req-<sendId>-0`（probe-results.md） | 账本用实际 runId |
| A3 | 三类工具构造处都填了 `options.runId/requesterSenderId/senderIsOwner` | 探针。结果：按 §3.2 接线后，worker（子进程）和 vds（Gateway 进程）的 sessions_send 都拿到预设 runId、真人 `requesterSenderId`、`senderIsOwner:true`、`agentAccountId/agentTo`；vcc 因 VLab 的 claude 登录 10/17 起失效没跑到工具，未取得 | 退到 activeTurnBySession；单件批次加 warn |
| A4 | worker client 带 operator.write 能调插件方法；插件缺席时错误文本匹配正则 | C-fallback。结果（WP0 探针）：worker 与 vds 调未知 `vrelay.send` 都得到 `missing scope: operator.admin`（带不带 `scopes:["operator.write"]` 一样），正则命中；插件 operator.write 方法带显式 scopes 可调；worker 不带 scopes 会被拒（`missing scope: operator.write`）。vds 的工具走回环客户端，真正的进程内 dispatch（MCP loopback）未执行，源码同样先鉴权 | 改正则 |
| A5 | 插件经 `callGatewayFromCli` 能拿到 operator.admin（agent transport 的 owner 身份） | 探针。结果：WP0 未探（不在 WP0 范围），留给 WP5/WP10 | agent transport 一律非 owner，作为已知降级写进文档 |
| A6 | Gateway 的 `onAgentEvent` 能看到 worker 回合的 lifecycle（start/end 带 runId 和 sessionKey） | 探针。结果：部分成立。Gateway 只看到 worker 回合的 end（带 runId、sessionKey），看不到 start（start 只在 worker 进程内），之前的 `run_status` 不带 sessionKey；codex/claude-cli 回合 start、end/error 都可见。顺带发现：主配置里的插件也会在 worker 里加载（worker 配置由主配置推导），且同一进程 `register()` 被调用 3 次（probe-results.md F-a/F-b） | 改用桥的 done、预检轮询，以及 v2 的 agent.wait 兜底 |
| A7 | 守卫早退不留 transcript、群历史和打字痕迹 | F3、F3b | 补丁里对 interSession 跳过 history 记录 |
| A8 | run-now 在已有 embedded run 时按 session lane 串行 | F3c | 守卫 B 改成等 `waitForEmbeddedAgentRunEnd` 后再跑 |
| A9 | inputProvenance 不影响 policy，因此 owner 插话能 steer | F4a | 文档只承诺"吸收或排后" |
| A10 | 飞书 `uuid` 去重和 `im.chat.get` 权限在 V app 和 VLab app 上都可用 | F12、F11 | 不带 uuid（至少一次）；humans=unknown 时按 200 字裁剪 |
| A11 | 钉钉、企微机器人主动发的消息不回调到自己 | 只能真机验证 | 补丁已加防御 |
| A12 | 企微合成回合不能流式 | 按设计处理 | 可选实验：复用 req_id |
| A13 | 9.1 对被打断的 inter_session 入站回合的恢复字段（`restartRecoveryDelivery*`），以及楔死窗口 | F5 | §6.3 已做识别，不重排 |
| A14 | 9.1 上 /vcc 跨轮续接是否丢上下文（#164972） | H-vcc | brief 自包含 |
| A15 | VLab 飞书 app 没有建群写权限；共享 VLab 的 lark-cli 绑的是生产 app | 只读权限查询 | 预建池 + shim |
| A16 | V 在 subagent-index 之后又有发版（10/20 的 #439/#440 已合 dev，是否改动 dist 未知） | WP0；stage 校验 before。结果：没有。10/20 16:50 只读核对，14 个 R1+R2 目标文件在 V 上与 subagent-index-20261020 捕获逐一相同，Gateway 仍跑该发版；#439/#440/#443 不涉及 dist（tests/fixtures/inter-session-v-bytes.json） | 按新捕获重新生成 |
| A17 | 跨 agent（v-codex、short-v、xiaoai）选对 accountId | 读 config bindings | 选错时 ROUTE_MISMATCH，再走 agent transport |
| A18 | 工作区规则在 Tianyi 确认前不生效，群聊沉默和 NO_REPLY 会让结果为空 | — | 空结果作为 noReply 如实交回，不会丢，但验收会失败；需先确认 diff |
| A19 | `getSessionEntry` 读单个条目的开销可接受 | 实测 | 加内存缓存（30 s） |
| A20 | `getSessionMessages(limit≤20)` 在超大会话上的开销 | 恢复时实测（只有不确定阶段才读） | 跳过 transcript 检查，按 interrupted 处理（宁可报失败，不重复） |
| A21 | awaiting_background 的过滤对 sessions_yield、生图、夜班的覆盖程度 | F15 | 漏判只会让结果早交，6 h/12 h 有封顶 |

### 12.2 需要 Tianyi 拍板

1. **严格批次**：一个房间卡住，汇报会等到它结束或超时（后台行可以看到进度）。是否接受？
2. **共享群里可见正文裁到 200 字**（有外人的群）：是否接受？
3. 往有外人的群发请求，算不算 AGENTS 第 86 行说的"对外发送闸门"？草稿目前不额外加闸。
4. worker 轮询硬闸按指标决定开不开（§8.7 第 4 条）。
5. 在 candidate 或 VLab 里真实建群，需要 VLab bot 的 `im:chat` 权限，或一份 VLab app 用户身份的 lark-cli。
6. R1 期间 Telegram、钉钉、企微只有"可见请求 + 最终出站"；R2 前钉钉没有页脚、企微不流式。

### 12.3 已知缺口（v1 不做）

- coordinator 不能 steer 或撤回正在跑的房间，只能由人在群里插话或停止。
- /vcc 的 sleep 只能靠文字约束。
- inter_session 回合建不了 cron。

### 12.4 9.8 升级时

- 本设计的核心补丁要回移到 fork 源码：`sessions-send-tool.ts` 的交接点和 schema、`get-reply-run-admission.ts` 的守卫、飞书和 Telegram 扩展里的桥。
- 唤醒绝不用 9.8 的 `deliver:false` 方式（#164732）。
- 升级前必须先修 #161719（重启会把 inter_session 回合所在会话 tombstone）。
- 进程内回信流 #148296 仍需本插件。

---

## 附录 A：must-fix 与 fatal flaw 的处理

| 来源 | 问题 | 处理 | 位置 |
|---|---|---|---|
| J1-1 / J2-3 / UX-fatal / minimal-fatal | 发件人提权 | 采用 chain-root 规则：非 owner 链一律用合成 id；不回退到私聊对端、最后发言人或"群里用 owner"；routePeerId 和 askUserAnswererId 分开 | §2.a |
| J1-2 / J2-1 / rel-fatal | 房间问不了 coordinator（"交回请求方一律拒"） | 只禁止向自己的请求方发**异步**消息；inline 提问允许，目标回合为叶子；兄弟和祖先可以 inline 或 async；三处文案一致 | §5.1、§8 |
| J1-3 / J3-1 / rel-fatal / UX-fatal / minimal-fatal | BUSY 触发核心和渠道兜底 | 守卫调用 `onDeliberateSilentTerminalReply`（有 G:4198 先例），核心和各渠道 eligibility 都被压住；飞书 M:5136 再加一层；推迟预建卡；Telegram 关状态表情并跳过 BM:4053/4068；钉钉推迟 AI 卡、跳过表情；candidate 断言零出站 | §3.3、§3.6–3.9、F3/F3b |
| J1-4 / rel-fatal | MessageSid 和 TG override 不按尝试唯一 | MessageSid、飞书 message_id、TG override、runId 全部按尝试唯一 | §2.c |
| J1-5 / J2-2 / UX-fatal / minimal-fatal | 新 Task Room 没有路由 | 飞书和 Telegram 从 key 推导，钉钉和企微只用存储的 `to`；F12 覆盖只经 sessions.patch 建的会话 | §2.a、F12 |
| J1-6 / J3-2 | 守卫位置和 deferred flush | 守卫放在 G:3584 后；flush 接缝让 flush-only 视为空闲；R 不再 BUSY，只禁止 steer 和 followup | §3.3、§3.4 |
| J1-7 | 不能承诺插话一定 steer | 文档如实说明；F4a/F4b 断言实际行为 | §4.5 |
| J1-8 / J2-7 / minimal-fatal | 后台行包装 listActive 会被覆盖 | 用 dist `extraSources` hook，种类显示"会话请求"；awaiting_background 用过滤后的列表 | §3.5、§5.5 |
| J1-9 | 工具接线 | 不传 inputProvenance；传 runId、senderId、owner；退路是 activeTurnBySession | §3.2、§2.d |
| J1-10 / J3-7 / minimal-fatal | 幂等键 | `(requesterSessionKey, requesterRunId, toolCallId)`；内容去重只匹配在途记录 | §2.b |
| J1-11 | RPC scopes 与退路 | 显式 `scopes:["operator.write"]`；只有 unknown method 或 missing scope 才降级 | §2.b、§3.1 |
| J1-12 / J3-3 / J3-6 | 嫁接 minimal | `DISABLED` 开关、plugin-sdk 预检、交接点在读历史之前、插件只在 Gateway、全局上限 4 和每目标上限 10 | §2.c、§3.1、§4.3 |
| J1-13 / J3-9 / J2-13 | 嫁接测试纪律 | 两种环境各跑一遍、VSR_CRASH_AT、C-stock 和 C-fallback、shim、跑完清基线 | §10 |
| J1-14 / J3-11 | 先重新捕获 V | WP0；stage 校验 before | §11 |
| J2-4 / minimal-fatal | 批次按时间窗分 | 按显式 runId；连 runId 都没有时单件成批，**没有时间窗** | §2.d、§5.4、F7 |
| J2-5 | awaiting_background | 保留；用 collect 回合取结果（不扫 transcript）；有封顶和可见说明 | §5.5、F15 |
| J2-6 | 硬轮询闸 | Codex 和 MCP 在 R1 就有；worker 按 `requester_tail_ms` 判据开启；/vcc 原生 Bash 靠文字 | §8.7（分歧见 B-D2） |
| J2-8 / minimal-fatal | 续接唤醒回 NO_REPLY | 删除该指令；续接唤醒明确要求"绝不能 NO_REPLY" | §8.4 |
| J2-9 / rel-fatal | 文案视角错误、❓/📨 不分、#code 不一致 | 目标侧用房间视角；❓ 表示提问、📨 表示请求；交回锚点不贴全文；#code 处处一致 | §7 |
| J2-10 | Task Room 要显示完整 brief | 用 getChatInfo 判定 owner_only，显示全文；只有 shared/unknown 才裁到 200 字 | §7.8 |
| J2-11 | 重启的体验 | 优先等核心的恢复回合；否则提示「接着把 #code 做完」；唤醒被打断时提示「继续」 | §6.3、§8.4 |
| J2-12 | 运维安全 | 开关、上限和企微说明都已加入 | §3.10、§7.2 |
| J3-4 / minimal-fatal | 重启楔死 | 识别 `RESTART_WEDGE`，标 interrupted 不重排，两边都有说明；v-self-restart 统计协作回合；F5 断言重启后房间还能接住真人消息 | §6.2–6.6、F5 |
| J3-5 | 监控口径 | firsttext 加 origin，receivedAt 取尝试开始时间；哨兵排除排队时间和 BUSY；统一用 `v-a2a-` 前缀 | §3.6、WP11 |
| J3-8 | 恢复时的 I/O | 只读不确定阶段，有界、后台、并发 1；账本全部异步 | §2.c、§6.3 |
| J3-10 | R1/R2 分开上线 | R1 = 核心 5 个文件 + 飞书 + 插件；没有桥的渠道走 agent transport，并补可见请求 | §3.0、§11 |
| J3-12 | 防兜圈统一执行、ask 默认异步 | 统一在 send handler；等待环规则；兄弟间 ask 允许异步；向请求方提问只能 inline，且 inline 上限 300 s | §5（分歧见 B-D4） |
| UX-fatal | probe 文件依赖 hash 导出字母 | 不新增这类文件；预检用 plugin-sdk 导出 | §3.0、§4.1 |
| UX-fatal | 强制 inline 占用 worker 槽 | 只有向请求方提问必须 inline，上限 300 s；超时转异步 | §5.1、§3.1 |
| minimal-fatal | 90 s 时间窗 | 删除 | §2.d |

## 附录 B：评审分歧的裁决

- **D1 底稿**：用 reliability（两票）。按 J3 的要求收紧爆炸半径：R1 只改 6 个 dist 文件（核心 5 个加飞书 1 个），插件只在 Gateway 加载，有 `DISABLED` 开关，不改 presets，不新增依赖 hash 的文件。
- **D2 轮询硬闸**：J2 要求 worker 和 Codex 都有硬闸，J3 主张先靠文字加指标。裁决：
  - Codex 和 MCP 的闸在 Gateway 内，不增加爆炸半径，R1 直接上；
  - worker 闸需要声明到 worker 第二份配置，有配置漂移和删目录事故的历史，所以按 `requester_tail_ms` 的事先判据（5 次中少于 4 次在 60 s 内结束就开）决定是否开启，代码在 R1 一并交付。
- **D3 owner 身份**：只要链根是 owner，就用该渠道的 owner id（J1、reliability），不附加 UX 和 J2 的"目标聊天只有 owner"条件。理由：
  - 核心 steer 有工具权限指纹检查，非 owner 的插话会被排队，进不了 owner 回合【核实 R:7961-7967；reply-tool-authority.ts】；
  - 链根是 owner 等价于 Tianyi 本人在那里发话；
  - 加这个条件会让 Task Room 在 humans=unknown 时被静默降成非 owner（J2 指出的问题）。
  - 聊天成员只影响可见正文的裁剪，不影响权限。
- **D4 提问方式**：向自己的请求方只能 inline（J1 和 UX；防止和自动交回重复）。向兄弟和祖先可以 async（J3），文案统一建议 inline 120 s。inline 上限 300 s，回应 J3 对占用 worker 槽的担心。
- **D5 守卫位置**：只在 G 返回 BUSY（drain 之前，满足 J1）；flush 通过 R 导出的接缝让路（满足 J3）；R 只做"不 steer、不 followup"。
- **D6 并发上限**：取 4（minimal、J3）。上限只算 request 回合；ask、wake、collect 不受限，避免卡住链条。fan-out 上限 5，第 5 个可见排队。
- **D7 runId 按尝试唯一**：比 J1 只要求 MessageSid 唯一更严，依据是 worker 拒绝重用已退役的 runId【核实】。
- **D8 R1 里没有桥的渠道**：走 agent transport，并用 outbound.sendText 发可见请求。这是新增做法，使遗留问题 (1) 和 (3) 在 R1 就覆盖四个渠道。
- **D9 后台收尾**：用 collect 回合取结果，不扫 transcript，避免把群里别人的对话串进结果（critic §三.3）。

## 附录 C：本轮新增的只读核实（报告之外）

1. `G:4195-4200` 未授权命令的早退写法 `opts?.onDeliberateSilentTerminalReply?.(); typing.cleanup(); return {kind:"reply", reply: void 0}`，就是 BUSY 静默早退的原生先例。9.1 `finalize.ts:336-349、474-485`：deliberateSilent 同时压住核心兜底和 eligibility。
2. `dispatch-from-config-DOJq_7CI.js:1678-1697`：`getReplyOptions` 展开 `params.replyOptions`，自定义字段能到达 get-reply 的 `opts`。
3. `M:3892-3896` 和 `BM:4055`：渠道兜底都依赖 eligibility。`BM:4053、4068` 另有失败兜底和状态表情，需要单独处理。
4. `G:3275-3277、3536-3586`：守卫作用域内的变量。`R:7408-7440、7911-7958`：flush 让路与 steer/followup 的决策点。`R:7961-7967`：权限指纹不一致时排队而不是 steer。
5. `S:892/897/901/906/1148/1210/1220/1221/1249/1262/1272/1305/659-701`：sessions_send 的锚点（默认 `timeoutSeconds` 是 30，模型不传就会 inline）。
6. `openclaw-tools:17617-17623`：`options` 里有 runId、requesterSenderId、senderIsOwner，没有 inputProvenance。
7. `T:497-552`：`listActive` 在 chunk 求值时重新赋值，已有可选钩子先例，listeners 的通知格式。`v-experience.js:260-299`：后台行种类与过滤规则。
8. plugin-sdk `agent-harness-runtime.ts:207/304` 导出 `onAgentEvent` 和 `resolveActiveEmbeddedRunSessionId`（active-run-projections.ts:48-57 合并两个登记表）。
9. `registry-registrars-network.ts:58-90`、`gateway-method-policy.ts:2-7`：插件方法的 scope，以及保留前缀。`in-process-gateway.ts:161-162`：`request.scopes` 覆盖最小权限。`server-methods.ts`：先做准入授权，再报 `unknown method: X`。
10. `types-core.ts:381`：`api.runtime.agent.session.getSessionEntry`。`delivery-context.shared.ts:235-256`：`entry.delivery.kind==="external"` 时的 `.context`。`runtime-channel.ts:194-196`：`outbound.loadAdapter`。`types.ts:16-35`：`subagent.run` 不接受 inputProvenance，因此 agent transport 改用 `callGatewayFromCli("agent")`（先例 dingtalk/patch.mjs:24、143）。
11. 飞书：`M:909/911` 已 import `createFeishuClient` 和 `getChatInfo`（chat-CxXaPTuO.js:52-71 返回 owner_id、user_count）。`G:1810/4195`：`CommandInterpretationSuppressed` 是原生开关。
12. worker：`index.mjs:630/656` 从 Gateway 接收 runId；`native-attempt-bridge.mjs:28-33` 拒绝重复的 runId；`index.mjs:11` 首字统计只认 UUID 或 `DB91_HI_*`。
13. 记忆 v-restart-recovery-wedge：重启时有一轮在跑的会话，之后每条消息都报 `restart recovery claim changed`。`scripts/v-self-restart.py:410/577`：有 `--while-stopped` 和 `busy_reasons`。
---

## 13. 实施修订（2026-10-20 18:30 CST，探针与评审之后；与前文冲突时以本节为准）

1. **插件也会在每个 worker 里加载**（F-a，`probe-results.md`）。V 的 worker 配置由主配置自动派生，主配置里声明的插件会进每个 worker；改主配置还会触发 worker 换代。
   - `index.js` 用 `contracts.isWorkerChildProcess()`（`VLAB_WORKER_CHILD`）判断进程：worker 里**不**启动引擎、服务、账本和事件订阅，只在 `config.workerGuard === true` 时注册 §8.7 的轮询闸。
   - `config.role` 作废，改为布尔开关 `workerGuard`（默认 false）。§8.7 第 4 条的"声明到 worker 第二份配置"改为"在主配置把 `workerGuard` 设为 true"。
   - WP12 回滚步骤改为：先把插件 `enabled:false`（配置），再删目录；不再有单独的 worker 配置步骤。
2. **`register()` 在同一 Gateway 里会被调用三次**（F-b）。所有订阅、引擎、计时器只能在 `registerService` 的 start/stop 里创建，或用模块级单例守卫；Gateway 方法和 hook 重复注册要幂等。
3. **worker 回合在 Gateway 侧只有 lifecycle end/error，没有 start**（A6）。§2.d 的 `activeTurnBySession` 不用 lifecycle start：发起回合靠核心传来的 `requester.runId`（A3 已证实四路都到位），插件生成的回合靠桥的 `onAgentRunStart`。lifecycle end/error 仍可用于 pump 触发与 W(S) 判定。
4. **vds 的 sessions_send 经 loopback Gateway client 调用**（F-d），与 worker 一样必须显式传 `scopes:["operator.write"]`；插件缺席时错误文本是 `missing scope: operator.admin`（A4），回退正则不变。
5. **飞书 `getChatInfo` 返回的 `user_count` 是字符串**，`humans` 判定先 `Number()`。bot 读不了群成员（缺 `im:chat.members:read`），`NOT_MEMBER` 只能从 chat.get 或发送错误码推断。
6. **VLab app 有 `im:chat:create`**（PERM 报告）。测试房间由编排方一次性用 VLab bot 建 3 个「VLab 测试｜房间 1/2/3」（创建时带上 Tianyi），之后放进 shim 的 `INTER_SESSION_ROOM_POOL` 复用；shim 本身仍不联网。
7. **ID 统一用短 kind**：runId、MessageSid、飞书合成 message_id、originSessionId 都用 `req/ask/col/wake`。
8. **`cancelled` 也算批次终态**（§5.4 补充）。
9. **candidate 工作区**必须在私有 Gateway 启动前调用 `applyInterSessionWorkspace`（否则 9.1 会写 BOOTSTRAP.md），并关闭 heartbeat；`IDENTITY.md` 一并带入。
10. **`vrelay.list` 必须注册为 `operator.read`**，`counts.running` 包含在途的 wake/collect 回合（v-self-restart 闲置门依赖它）。
11. **/vcc 的 candidate 实测受阻**：共享 VLab 的 claude 登录 10/17 起过期，需要 Tianyi 重新登录；在此之前用 worker、vds 完成 candidate，vcc 只做离线与已有路径验证。
12. **v-experience 的「会话请求」种类映射**由 WP3 统一改 `apps/v-experience/v-experience.mjs` 及其三份产物（核心 Telegram 用、钉钉、企微）；WP6/7/8 不碰这些文件，各自的桥放在独立的 `lab/release-files/<channel>-inter-session-bridge/`。
13. **测试房间已建**（2026-10-20 18:50 CST，VLab bot `im/v1/chats`，成员只有 Tianyi 和「V - Lab」）：「VLab 测试｜房间 1」`oc_fe63730f4bc817cd46ccd325ab990a74`、「房间 2」`oc_c7074487c880fb9792a663750b2f22ba`、「房间 3」`oc_a14d4ff92e03b4d52420ef20e56eaba6`。candidate 的 `INTER_SESSION_ROOM_POOL` 用这三个。
