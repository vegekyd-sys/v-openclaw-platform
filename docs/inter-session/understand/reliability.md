## 直接结论

### (1) 账本 + follower：做过什么，入站桥下还要什么，最小持久化设计

插件的 follower 做五件事（已验证，`apps/v-session-relay/plugin/core/dispatcher.js:1-12`）：
- **a. 线程卡片**：方向已改，不再需要。
- **b. 发起方的收尾话由插件补发**：v2 补丁的唤醒轮已经是 `deliver:true`（`lab/release-files/sessions-send-reply-once/patch.mjs:113-126`），不再需要。
- **c. Gateway 重启后补等、补唤醒**：仍需要。原因：
  - 核心的等待只存在于进程内（patch 中的 FLOW），9.8 也一样，#148296 仍 OPEN。（已验证）
  - README 说"用同一个 run id 唤醒，不会跑两次"，这个说法不成立。Gateway 的去重表是内存 Map（`src/gateway/server-connection-state.ts:48`），TTL 只有 5 分钟（`server-constants.ts:14`），重启就清空。（已验证）
  - 而 `recovering` 分支会直接自己发唤醒（`dispatcher.js:115-125`）。如果核心在重启前已经唤醒过 A，A 会跑两次、在聊天里说两遍。（推断）
  - 恢复时 B 的回复取的是"createdAt 之后最后一条 assistant"（`dispatcher.js:92-95`）。如果 B 群里其后有别人的对话，这段内容可能被送到 A。（推断）
- **d. steered 补唤醒**：原生 agent RPC 路径下，飞书会话基本不会遇到。
  - 9.1 只对 `:run:` 形式的 key 走 steer（V dist `sessions-spawn-tool-1FQMTkIo.js:787-790`、`:845`）。（已验证）
  - 10/07 实测"对方正忙→排在当前轮之后"。README 中关于 steered 的描述已过时。
  - **但改走渠道入站桥后，这个问题会放大**：入站默认队列模式是 `"steer"`（9.1 `src/auto-reply/reply/queue/settings.ts:36`，已验证）。B 正忙时，请求会被并进人类当前那一轮，没有独立 run，回信就丢了。所以桥必须对 inter-session 输入强制 followup/queue（inlineMode）。（推断）
- **e. 失败告知**：仍需要，而且 v2 有漏洞，见 (4)。

入站桥另外必须满足两点（推断）：
- **run id 由调用方给定（idempotencyKey）**，否则核心的 wait 和账本都关联不上。
- **provenance 保持 `inter_session`**，不能让 B 把请求当成 owner 的直接指令。

**最小持久化设计**（建议，推断）：
- **放在小插件里，用文件账本**：
  - 不用 plugin_state：`openKeyedStore` 对非 bundled、非官方安装的插件直接抛错（9.1 `src/plugins/registry-runtime.ts:169-186`，已验证）。而且 hook 在 worker 进程里也要写。
  - 不复用核心的 session-delivery 队列：它的 agentTurn 重放路径专为生成媒体设计，会 `disableMessageTool`、`forceRestartSafeTools`，中断后直接 dead-letter（`server-restart-sentinel-agent-delivery.ts:319,495-496`，已验证），不适合做"带全部工具继续干活"的唤醒。
- **文件布局**：
  - `runs/<h(runId)>.json`：由 hook 只创建、不修改，记录 `{chainId, depth, edge, requesterSessionKey, requesterRunId, grant}`。
  - `sends/<h(targetRunId)>.json`：状态只由 Gateway 推进，保持单写者。
  - 预算计数用 `chains/<id>/slot-<k>` 以 O_EXCL 方式抢占，避免多进程读改写竞争。
- **去掉每 2 s 一次的全量 tick**（`index.js:160-163`）和每轮 `before_prompt_build` 里的 `store.list()`（`index.js:98`）。两者都是在 Gateway 主线程同步读整个目录。follower 只在两种时候工作：启动时扫一遍非终态记录；核心明确声明不跟的发送（skipped/steered）。
- **恢复时先查 B 会话的 `restartRecoveryDeliverySourceRunId`**。若等于本次 runId，就改等 `restartRecoveryDeliveryRunId`（9.1 有这两个字段，`server-restart-sentinel-agent-delivery.ts:449,535`，已验证）。补唤醒之前，先查 A 的 transcript 里是否已经有来自 B 的那条 inter-session 输入。
- **核心补丁只再加三处**：
  - 目标 run id 可预测：`sessions-send:<hash(requesterSessionKey,toolCallId)>`。这样 `before_tool_call` 能预先登记子 run 的深度，不再依赖"解析信封 + 取最近一次 send"的猜测（`turns.js:13-23`、`index.js:114`）。
  - one-way 标志。
  - `isDeliveryFailureWait` 改用 9.8 版。

### (2) 防兜圈设计

**深度定义**：人/外部触发的轮次 depth=0；只有"下派"边会 +1；唤醒轮继承发起方的深度。

深度不能放进 provenance：`normalizeInputProvenance` 只保留 5 个字段（9.1 `src/sessions/input-provenance.ts:12-18,36-50`，已验证）。所以深度走账本。

**按边的类型判定**（插件在 `before_tool_call` 里查账本）：

| 边 | 判定 | 规则 |
|---|---|---|
| 下派 | 目标还不是本 chain 的成员 | 要求 depth < 2，且成员数 ≤ 1+1+N（N 默认 5）。depth=1 下派还需要显式授权 grant：A 的 message 里写明标记（如 `[可开房间:3]`），由 A 侧的 hook 记到 B 的 run 记录里。depth=2（房间）不能再下派 |
| 询问 | 目标已是成员（兄弟房间或 coordinator） | 任何深度都可以发。被问的那一轮是叶子，本轮禁止任何 `sessions_send`，答案自动回去。原规则 `policy.js:34-38` 收窄到这一类 |
| 回报 | 唤醒轮发给自己的发起方或 coordinator | 允许，应当是 one-way：对方那一轮在其群里正常可见，但不再唤醒发送方。核心没有这个标志时，A 的回复会再唤醒 B，形成 A↔B 来回，只能靠 pair 预算兜底 |
| 禁止 | — | 请求轮发回给自己的请求方（回信会自动回去）；自己发给自己；同一 run 对同一目标已有在途请求 |

**预算**：
- 每个 chain 总共 ≤ 24 次 send；每对会话（无向）≤ 6 次；速率 ≤ 4 次/60 s；chain 有效期 6 h。
- 超限就 block，blockReason 写"停下，把现有结果告诉这里的人"。
- SDK 里有现成的 pair-loop-guard（导出路径 `./plugin-sdk/pair-loop-guard-runtime`，默认 20 条/60 s/冷却 60 s，`pair-loop-guard-runtime.ts:83-88`），但它是进程内存（`:54`）。worker 和 Gateway 各算各的，所以计数必须落到账本里。

**发起方 sleep 轮询**：同一 run 里已有一次被接受的异步 send 时，拦截该 run 中的长 `exec sleep`，以及对该目标的 `sessions_history` 轮询。blockReason 写"结果会作为新的一轮回来，请结束本轮"。

**执行点**：
- **插件 `before_tool_call`**：上表全部规则在这里执行，只用 block，不改写参数（Codex 会拒绝 hook 改写参数，来自记忆，推断）。
  - claude-cli 的 MCP loopback 会触发这个 hook，ctx 里带 `sessionKey` 和 `runId`（V `mcp-http-BL3X6y4w.js:158-164,954-967`，已验证）。
  - worker、vds、vcc 由 10/07 实测"被拦 2 次"佐证。
- **核心**：只负责可预测的 run id 和 one-way 标志。

### (3) 9.8 的行为：照搬与避开

**照搬**：
- **`isDeliveryFailureWait` 把终态 timeout 也算作失败**（9.8 `sessions-send-tool.a2a.ts:43-47`）。9.1 版只认 `pendingError`（V dist `:457-459`）。所以当前 v2 FLOW 遇到 abort/hard_timeout 时静默返回（`patch.mjs:53-73`）。（已验证）
- **失败提示区分 `sourceReplyDelivered`**（9.8 `a2a.ts:127-146`）。9.1 的 run-wait 没有这个字段，只能用"目标已开始，可能已在对方群发过"来近似。
- **唤醒提示带 `SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION`**（9.8 `a2a.ts:220`），让发起方对照原需求判断是否真的完成。
- **工具结果如实给出 `delivery: pending/skipped`**（9.8 `sessions-send-tool.ts:719-727`）。steered 也明确标为 skipped（`:719`）。
- **请求方是 subagent 或隔离 cron 时不走回信流**（9.8 `:654-655`）。

**避开**：
- **唤醒轮 `deliver:false` + `message_tool_only` + 内部频道**（9.8 `agent-step.ts:74-76`）。这就是 #164732 的成因：只写进 transcript，却报告"已可见"。我们保持 `deliver:true`。
- **#161719（OPEN）**：9.8 在重启恢复时，会把被打断的 inter_session 轮所在的整个会话 tombstone（9.8 `main-session-restart-recovery-store.ts:522`；9.1 dist 里没有这段逻辑，已验证）。升级 9.8 前必须补上，否则 Gateway 一重启，任务房间群就要求 `/new`，等于废掉。
- **不要指望升级后删掉 follower**：9.8 的 notify 模式 `durability: "process"`（`:604`），回信流仍在进程内，#148296 仍 OPEN。
- **claude-cli 跨轮续接会丢上下文**（#164972 OPEN，#164960 已关）：/vcc 作为被派方时，只做一次性的完整交接。9.1 上是否同样会丢，还需要实测（推断）。
- **#162299（请求方本轮先结束导致回信丢失）**：V 的 dist 里没有 "This turn has ended" 相关代码，不适用（已验证）。

### (4) 失败可见性

**现状（v2）**：
- **异步 send**：只有"非可重试的 error"或"带 pendingError 的 timeout"会唤醒 A 报失败。abort、hard_timeout、6 h 截止的普通 timeout 都静默丢掉（代码已验证；abort 具体映射到哪个 status 是推断）。
- **内联 send**：错误在工具结果里，由 A 当轮处理。
- **B 群**：agent RPC 路径失败时是否会发错误文案，未验证。

**建议**：
- **每个被接受的 send 必须以且只以三种方式之一结束**：结果唤醒、失败唤醒、或工具结果里明确写 skipped。follower 负责兜底超时。
- **B 群**：
  - 请求先以原生消息出现（由桥负责）。
  - B 失败时，它的回复卡复用入站链路的失败收尾，以失败状态结束。
  - B 从未开始（重启、排队被拒）时，由 follower 在 B 群补一句"没开始处理：原因"。
- **A 群**：失败唤醒轮用 idempotency key `sessions-send-failed:<runId>`（插件已有，`dispatcher.js:149-165`），走普通回复卡。文案分三类：
  - 没送到：可以重试一次。
  - 已开始：可能已在对方群里发过内容，不要重发，直接报告。
  - 重启打断：先查 B 是否在被恢复；若在恢复，就等恢复那一轮，不报失败。
- **链级**：
  - 房间失败时唤醒它的发起方 B，由 B 再回报 coordinator。
  - 预算或防兜圈拦截时，blockReason 作为本轮的工具错误，出现在发起方的过程流里。

## 关键证据索引
- 插件规则与流程：`plugin/index.js:48-67`（before_tool_call），`:92-125`（before_prompt_build），`core/policy.js:33-50`，`core/native.js:62-64`（同一线程只认唤醒轮或同一轮）。
- 跨层发送不会形成一个 chain：B→房间时会另起一个 chainId，因为 `wokenBy`/`sameTurn` 都不命中，现有 `maxChain` 管不到整棵树。（推断，依据 `native.js:62-64`）
- 上游 issue 状态（gh 查询）：#148296 OPEN、#161719 OPEN、#164972 OPEN、#164732 已关、#161769 已关、#164960 已关、#162299 已合并。