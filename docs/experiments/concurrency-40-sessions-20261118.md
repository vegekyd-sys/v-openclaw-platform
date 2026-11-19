# 30–40 个会话同时跑，聊天首字不变慢：归因、方案与 VLab 原型（2026-11-18，11-19 续）

分支 `claude/concurrency-40-sessions-45bb6e`。只做研究、原型和 VLab candidate，**未合入 dev，未上线 V**。生产数据只读（journald、SQLite `mode=ro` + `ionice -c3`）；11-19 14:33 经 Tianyi 授权在 V 上抓过一次 60 s 主线程 CPU profile（第 7 节），没有发消息、压测、抓堆或重启，profile 文件已删。

## 一句话结论

变慢的是 **Gateway 主线程**，不是模型，也不是共享 Codex app-server。夜班 15–24 张 /vds 卡在跑时，聊天消息的「发出→开始跑」P50 从 1.1 s 变成 3.2 s、P90 从 3.6 s 变成 9.9 s；「开始跑→模型首个正文 token」P50 没变（8.3 s 对 8.1 s），DeepSeek 首字节 P50 0.7 s 也不随在途请求数变。聊天自己那约 1 s 的主线程工作，被切成碎片夹在别人的工作之间做完。

夜班留在 /vds（Tianyi 11-18 否决了改回 Worker），所以要削的是 /vds 负载在 Gateway 主线程上的单位成本。V 上的 profile（第 7 节）显示真正的大头和 VLab 看到的不一样：

1. **exec 起子进程**：每次 exec 工具调用，Gateway 都 `spawn` 一个 service-child relay。Linux 上这一步要 fork 一个 6.1 GB 的进程，复制 139 MB 页表，**每次同步卡主线程约 54 ms**，一分钟 69 次，合计 3.8 s，占主线程 6–7%。修复：一个常驻小进程代 fork，把管道交回 Gateway，每次约 1 ms（第 8.1 节）。VLab ABBA 4 对（第 8.3 节）：聊天首字 P50 8.5 → 4.3 s、P90 14.5 → 8.1 s，「发出→开始跑」P50 1.62 → 0.65 s，后台吞吐 +12%，4 对每一对都更好。VLab 的 exec 比 V 多、单次 fork 比 V 慢，V 上的收益会小一些。
2. **Workboard 全表读**：每次 agent 结束都读一遍全部未归档卡片（2 万张，表 650 MB），`listBoards` 每次聚合约 100 ms，合计约 4 s/分钟。修复：两个覆盖索引，查询不变（第 8.2 节）。

另外 GC 4.2 s、密钥脱敏 3.5 s、转录广播与镜像各约 2.2 s、本地 HTTPS 转发代理每次重建 TLS 上下文 0.9 s，列为后续。

已否决或不推荐的方向：
- **夜班改走 Worker**：VLab 上首字 P50 7.4→2.5 s，但 Tianyi 否决（夜班两天前才刻意切到 /vds），第 5.3 节只留作机制证据。
- **交互优先闸门**：收益在噪声内（首字 P50 6.0→5.9 s），夜班吞吐少 7%，不推荐。

## 1. 数据与口径

| 数据 | 来源 | 时段 |
|---|---|---|
| 用户口径首字 | V Gateway journald 的 `[firsttext-e2e.1]`，飞书 create_time → 卡片首次推送 | 11/18 09:00–18:00，763 条 |
| 夜班在跑回合数 | journald `run workboard:<card>:<startMs> ended`，区间 [startMs, 结束] | 同上，425 个回合 |
| Codex 回合内部分段 | **共享 app-server 自己的日志库** `codex-home/logs_2.sqlite`（只留约 14 分钟），只读增量采集 | 17:33 起，见注 |
| 线程 → 会话 | state 库 `plugin_state_entries(codex, app-server-thread-bindings)` → agent 库 `session_nodes.current_session_id` | 同上 |
| 主线程 / app-server CPU | `/proc/<pid>/task/<tid>/stat`，每 15 s | 17:50 起 |
| RPC 耗时 | journald `[ws] ⇄ res`（只记 ≥50 ms 的请求） | 09:00–18:00 |

注：Codex 日志库里每个线程有「收到回合」`turn_input`、「DeepSeek 响应头到达」`Request completed …/v1/responses`、「输出项完成」`Output item`、「工具结果送回」`dynamic_tool_response`，正好补上 `toModelMs` / `modelFirstEventMs` 对 Codex 回合没有样本的缺口。采集只抄时间和类别，不抄内容。采集脚本和分析脚本在本分支 `lab/concurrency-40/`。

口径限制：
- 15:15:51 V 的 Gateway 重启过一次（V 自己调用 v-self-restart），正好落在负载切换点上。下面按「同时在跑的夜班回合数」分组，而不是按时段前后比，以免把重启后冷启动算进去。
- 下午聊天量本身也涨了（每 30 分钟 15–46 条涨到 57–75 条），聊天自己也占主线程。
- Codex 日志库只有 17:33 之后的数据，看不到上午低负载时的同一段。

## 2. 首字链路分段

### 2.1 随夜班负载怎么变（全天，/vds 聊天，按发消息那一刻同时在跑的夜班回合数分组）

| 夜班在跑回合 | n | 首次可见 P50 / P90 | 发出→开始跑 P50 / P90 | 开始跑→首次可见 P50 / P90 |
|---|---|---|---|---|
| 0–2 | 153 | 9.7 / 28.8 s | 1.1 / 3.6 s | 6.6 / 17.2 s |
| 3–5 | 123 | 9.5 / 16.6 | 1.1 / 2.9 | 6.7 / 11.9 |
| 6–9 | 77 | 11.0 / 21.5 | 1.3 / 3.7 | 7.4 / 16.0 |
| 10–14 | 22 | 13.7 / 28.5 | 2.5 / 4.3 | 9.6 / 16.9 |
| 15–19 | 84 | 12.8 / 28.3 | 2.4 / 8.8 | 7.2 / 18.1 |
| ≥20 | 94 | 14.6 / 32.1 | 3.2 / 9.9 | 8.0 / 19.5 |

细分（夜班 <6 对 ≥15，P50 / P90）：

| 段 | 夜班 <6 | 夜班 ≥15 | 归属 |
|---|---|---|---|
| 分发→「正在输入」表情出现 | 1.05 / 1.97 s | 1.77 / 4.47 s | Gateway 主线程 + 飞书 API |
| 表情→开始跑 | 0.04 / 0.92 | 1.03 / 5.14 | Gateway 主线程 |
| 开始跑→首个正文 token | 8.31 / 50.6 | 8.11 / 116 | 模型 + 工具（P50 不变） |
| 建卡（两次飞书 API） | 0.76 / 1.03 | 0.91 / 1.86 | 飞书 API + 主线程 |
| 正文 token→推到卡片 | 0.73 / 1.04 | 0.75 / 1.51 | Gateway + 飞书 API |

### 2.2 一个 /vds 聊天回合内部（17:30–19:00，夜班 15–22 个回合在跑，115 条里 111 条对上线程）

| 段 | P50 | P90 | 归属 |
|---|---|---|---|
| 飞书入站（create_time→Gateway 收到） | 0.81 s | 1.45 s | 飞书 |
| 分发→开始跑 | **3.13** | **7.43** | Gateway 主线程 |
| 开始跑→app-server 收到回合 | 0.22 | 1.91 | Gateway 主线程（Codex 回合准备） |
| app-server 收到→DeepSeek 响应头 | 1.72 | 3.85 | app-server + DeepSeek（聊天线程上下文大，首个请求预填充慢） |
| 响应头→首个输出项完成 | 0.62 | 1.06 | DeepSeek |
| 首个输出项→首次可见 | 4.20 | 9.25 | DeepSeek 继续生成 / 先跑工具（约 2.7 s），再加正文 token→卡片约 1.0 s（建卡） |
| **首次可见** | **13.3** | **22.9** | |

### 2.3 模型和 app-server 不是瓶颈的证据

- **DeepSeek 不排队。** 3,165 次模型请求，把「上一个工具结果送回→下一次响应头」按同时在途的请求数分组：在途 0–4 时 P50 0.71 s，在途 5–9 时 0.69 s。夜班回合第一个请求 P50 0.72 s / P90 0.93 s。P90 在在途 5–9 时从 2.7 s 升到 4.7 s，这一段混着 app-server 处理，样本还不够分开。
- **app-server 不饱和。** 单个共享进程承载全部 DeepSeek 线程，CPU P50 31%、P90 38%（单核口径），而它是多线程的 tokio 运行时，CPU 全在 `tokio-rt-worker` 里分摊。聊天回合「开始跑→app-server 收到」P50 0.22 s。
- **按夜班负载分组，开始跑→首个正文 token 的 P50 没变**（8.3 s 对 8.1 s）。

### 2.4 Gateway 主线程

- 17:50–19:00 每 15 s 采样：主线程 CPU 平均 72%，P50 67%、P90 83%、最高 92%（只算 CPU，不含同步 I/O 等待，实际忙碌度还要高一点）。共享 app-server P50 35%、P90 47%（单核口径）。
- 主线程 CPU 对事件数做最小二乘回归（60 s 窗口 59 个，R² 0.5）：夜班每次工具调用约 90 ms，任何 Codex 回合开始约 1.0–1.1 s（其中约三分之一是夜班回合）。合起来**夜班约占主线程 27–30%**，聊天和其他会话的 Codex 事件约 14%，**截距约 40% 是与 Codex 事件无关的常驻工作**，这部分本次没拆开。特征之间相关性强，单事件系数只当量级看。夜班相关的 RPC（`workboard.cards.list` 每小时 578 次 × 248 ms、`dispatchWithOptions` 119 次 × 469 ms、`vlab.workers.status`、`health`）每小时合计约 210 s，约 6%，在截距里。
- 处理器共享模型能对上：聊天自己的分发→开始跑约 1.0 s 主线程工作，等待时间约为 1.0 s ÷ (1 − 其他人的负载)。其他人占 60–65% 时是 2.5–3 s，和实测 P50 2.9–3.2 s 一致。
- 外推：现在主线程平均已经 72%。夜班从约 20 个回合涨到 36 个，夜班这块按线性约从 28% 涨到 50%，主线程就顶满了；即使截距里有一部分不随负载涨，聊天的「发出→开始跑」也会到 10 s 以上。**不改结构，30–40 并发做不到聊天不变慢。**

### 2.5 顺带发现（不在首字关键路径上，未处理）

- app-server 日志库 `logs_2.sqlite-wal` 8.5 GB（高水位），2.5 小时逻辑读 514 GB、写 41 GB；日志里有工具输出原文和 base64 图片。
- 15:21 Gateway 重启后第一次 `tasks.list` 用了 99.9 s（夜班的连接）。
- 每 5–10 分钟有一次 1–9 s 的 liveness 延迟，会拉高聊天 P90。

## 3. 候选方案与取舍

| 方向 | 量化依据 | 预期收益 | 代价 / 风险 |
|---|---|---|---|
| A. 交互优先闸门（本次原型） | 聊天分发→开始跑这段几乎全在主线程上；夜班份额约 28% | VLab：首字 P50 −0.1 s，在噪声内（第 5.2 节） | 夜班每次最多让 3 s；聊天连续不断时夜班持续变慢（不会停）；只拦得住还没开始的工作，已在流式输出的夜班请求照常 |
| B. 刹车改看用户首字（v-nightshift） | 现刹车只看 RPC 延迟、写锁、内存 | 兜底：分发→开始跑 P50 超过 2 s 时停派新卡 | 是封顶；单独用不能减在跑的卡。和 A 叠加后，「减在跑」可以通过 A 的强制让路实现，不用杀卡 |
| C. 夜班改走 Worker 运行时（`deepseek-flash`，夜班 #44 已支持按会话钉模型） | VLab run7：主线程每回合 Worker 0.72 s，/vds 1.55 s；本次 5.3 节：每次后台工具调用占主线程 0.12 s 对 0.33 s | VLab：聊天首字 P50 7.4→2.5 s、P90 14.7→3.6 s，夜班吞吐 +52%（第 5.3 节） | **11-18 Tianyi 否决**：夜班两天前才刻意切到 /vds。（原列的代价：Worker 跨进程写锁、每个约 1 GB、冷启动、工作流要重新验收） |
| D. 主线程上的每事件成本 | VLab profile：会话快照每次 16–20 ms、转录镜像、工具重建；#576/#577 未合 | 每个点 2–14% | 改 core 共享路径，每处要单独 A/B；只降常数，不改变「谁先」 |
| E. 夜班轮询降频 | 夜班 RPC 约 6% | ≤6% | 改 v-nightshift，低风险 |
| F. Codex app-server 分池 | app-server 31% 单核、不饱和，DeepSeek 首字节不随在途数变 | 当前负载下约 0 | 多一个进程、多一套线程绑定；可作为隔离故障的措施，不是提速 |
| G. 夜班单独的 DeepSeek key / provider | 同上，模型侧不排队 | 当前约 0 | 额度隔离有价值，但不改首字 |
| H. 把 Codex 回合的事件处理挪进 worker 线程或独立进程 | 主线程是唯一的串行点 | 根治 | 改动面最大，上游代码，周期长 |
| I. exec 改由常驻小进程代 fork（11-19 加） | V profile：relay spawn 69 次/分钟 × 54.6 ms | 主线程约 −6% | 新增一个常驻进程；第 8.1 节 |
| J. Workboard 覆盖索引（11-19 加） | V profile：Workboard SQL 约 4 s/分钟 | 主线程约 −5% | 每次写卡多维护两个索引；第 8.2 节 |

## 4. 原型：交互优先闸门

代码：`lab/patch-interactive-priority.mjs`（三处 dist 补丁，单测 `lab/patch-interactive-priority.test.mjs`）。

- `dispatchReplyFromConfig`（所有渠道入站和 `chat.send`）进入时，把非后台会话标记为「等首次可见」。
- 事件总线 `emitAgentEventIfCurrent` 看到该会话第一个 assistant / tool / item 事件，或分发结束，或 15 s 超时，就撤销标记。
- Codex 插件 `runCodexAppServerAttempt` 开始时，以及每次 OpenClaw 动态工具调用执行前：如果会话是后台会话（默认 `:subagent:workboard-`，夜班钉卡用的会话），而当前有聊天在等，就等到没人等或 3 s 为止。
- 开关 `OPENCLAW_V_INTERACTIVE_PRIORITY=0` 关闭（每次调用时读取，同一进程可 A/B）；`_MAX_WAIT_MS`、`_TTL_MS`、`_BACKGROUND` 可调。每 60 s 打一行 `[v-interactive-priority.1]` 计数。
- 不丢任何工作，不中断已经在跑的工具，也不碰模型请求。

## 5. VLab 对照

测量台 `lab/candidate/runtime-mix.mjs`（runtime-concurrency 加 MIX 模式）：一个私有 Gateway，V 当前字节（Codex 插件整目录 a864aa8f、Codex 0.169.1），按 V 规模铺注册表（11/08 的 16,748 runs / 18,867 tasks）和 V 的规划器统计，订阅会话事件（V 上语音 H5 常连）。N 个后台 /vds 会话一刻不停地跑 8 步 shell 任务（夜班形态），每 12 s 往另外 6 个会话之一发一条不用工具的聊天探针，量「发出→首个正文」和「发出→开始跑」。开关按窗口 ABBA 交替（关、开、开、关……），前后各有一个没有后台负载的基线窗口。

### 5.1 第一轮作废：后台会话复用导致漂移

`candidate-723763f8`，14 个后台会话一直复用，5 分钟一窗。从第一个对照窗起候选 Gateway 主线程就是满的（每 300 s 窗口主线程 CPU 约 290 s），而且越跑越慢：后台工具调用每分钟 204→30 次，最后两窗探针全部超时。慢在每回合的 `sessions.history.read`（308 次，平均 0.8 s）和 `session.transcript.mirror-facts`（192 次，平均 1.6 s），它们随会话转录长度线性变贵。夜班卡的会话随卡结束，不会这样无限变长，所以这轮不代表夜班；但它说明**同一个会话跑得越久，每回合的主线程成本越高**，这在 V 的大会话上同样成立（已知问题，见记忆 codex-flush-loop-big-history）。

### 5.2 第二轮：交互优先闸门 A/B

`candidate-8edf4054`，10 个后台槽，每槽跑 2 个回合就换新会话，3 分钟一窗，ABBA 四对。候选 Gateway 主线程 64–93%（V 当时 61–82%），对得上。

| 窗口 | 探针首字 P50 / P90 | 发出→开始跑 P50 / P90 | 开始跑→首字 P50 | 后台工具调用/分钟 | 主线程 CPU（180 s 窗） |
|---|---|---|---|---|---|
| 基线（无后台） | 2.0 / 3.2 s | 0.2 / 0.3 s | 1.8 s | 0 | 14 s |
| r0 关 / 开 | 3.5 / 4.1 · 2.9 / 5.4 | 0.3 / 0.9 · 0.4 / 1.8 | 2.6 · 2.3 | 181 · 160 | 115 · 127 |
| r1 开 / 关 | 3.5 / 6.7 · 3.4 / 12.4 | 0.6 / 2.0 · 0.7 / 3.9 | 2.5 · 2.6 | 150 · 144 | 129 · 140 |
| r2 关 / 开 | 5.3 / 14.0 · 6.5 / 17.1 | 0.9 / 3.6 · 1.6 / 4.5 | 3.7 · 4.7 | 137 · 112 | 146 · 156 |
| r3 开 / 关 | 10.8 / 22.1 · 11.8 / 23.3 | 1.8 / 8.4 · 2.3 / 7.7 | 5.6 · 7.8 | 108 · 108 | 165 · 168 |
| **四对平均 关 → 开** | **6.0 → 5.9 / 13.5 → 12.8** | **1.05 → 1.10 / 4.0 → 4.2** | **4.2 → 3.8** | **142 → 133（−7%）** | 142 → 144 |

- 所有回合都答对（探针 120/120，后台 330/330）。闸门确实在工作：162 次让路，平均 2.5 s，其中 77 次等满 3 s；102 次聊天标记里 95 次在首次可见时撤销。
- **结论：机制成立，收益没兑现。** 首字 P50 差 0.1 s、P90 差 0.6 s，「发出→开始跑」没有变化，都在窗口间噪声之内；后台吞吐少 7%。说明挤占聊天的主线程工作主要不是「新回合开始、新工具调用」这类还没开始、可以推迟的工作，而是已经在进行中的东西（模型流式事件、转录镜像、会话快照与广播）。
- 第二轮仍有漂移：后台会话已轮换，30 分钟里每窗主线程 CPU 从 64% 涨到 93%，探针首字 3.5→11 s。ABBA 让漂移在两侧平均掉，但绝对值只看前两对。V 上 17:50–19:50 按 15 分钟窗看，每个归一化事件的主线程成本稳定在 0.21–0.27 s，没有这种漂移，所以这是候选环境（新起的 Gateway、不断新建会话）的问题，没有继续追。

### 5.3 第三轮：后台跑 Worker 运行时 vs /vds（`candidate-d529ad33`）

同一测量台，不打闸门补丁。后台 10 个槽交替跑在 Worker 运行时的 `deepseek/deepseek-flash`（V 的默认模型）和 /vds 上，每槽 2 个回合换新会话（换会话时用当前窗口的运行时），4 分钟一窗，ABAB 三对；聊天探针始终是 /vds。Worker 池 4–6 个（V 是 5–24）。

| 窗口 | 探针首字 P50 / P90 | 发出→开始跑 P50 / P90 | 开始跑→首字 P50 | 后台工具调用/分钟 | 后台回合 P50 | 主线程 CPU（240 s 窗） | >1 s 停顿 |
|---|---|---|---|---|---|---|---|
| 基线（无后台） | 1.8 / 2.8 s | 0.2 / 0.2 s | 1.6 s | 0 | — | 14 s | 2 |
| r0 Worker / /vds | 2.2 / 2.7 · 3.3 / 8.5 | 0.2 / 0.4 · 0.4 / 2.3 | 1.9 · 2.8 | 222 · 164 | 23.9 · 30.2 s | 91 · 164 | 0 · 1 |
| r1 /vds / Worker | 4.1 / 12.1 · 2.4 / 4.5 | 1.1 / 1.8 · 0.4 / 0.9 | 3.0 · 2.0 | 143 · 207 | 34.4 · 25.5 | 187 · 115 | 5 · 2 |
| r2 Worker / /vds | 2.8 / 3.7 · 14.7 / 23.5 | 0.6 / 0.7 · 3.4 / 9.6 | 2.2 · 10.3 | 218 · 119 | 24.3 · 42.3 | 115 · 217 | 1 · 10 |
| **三对平均 Worker 对 /vds** | **2.5 / 3.6 对 7.4 / 14.7** | **0.4 / 0.7 对 1.6 / 4.6** | **2.0 对 5.4** | **215 对 142** | **24.6 对 35.6 s** | **107 对 189** | **1 对 5.3** |

- 全部答对：探针 155/155，后台 Worker 354/354、/vds 192/192。两侧都没有写锁超时、Worker stream-ack 超时。
- 每次后台工具调用的 Gateway 主线程成本：Worker 0.12 s，/vds 0.33 s（2.7 倍）。Worker 回合的模型调用、工具执行、提示准备在 Worker 进程里做，Gateway 只转发事件。
- 漂移只出现在 /vds 窗口：/vds 三窗首字 3.3 → 4.1 → 14.7 s，最后一窗出现 16 次 `mirror-facts` 长持锁和 2 次 liveness；Worker 三窗 2.2 → 2.4 → 2.8 s。一个没验证的猜测：后台每轮换一次会话就多一个常驻的 Codex 线程（app-server 线程空闲 30 分钟才卸载），每事件成本随常驻线程数涨。值得单独查，V 上夜班卡也是这样不断新建线程。
- 这一轮最干净的是第一对（r0）：/vds 3.3 / 8.5 s，Worker 2.2 / 2.7 s，没有漂移成分也已经是 P90 的 3 倍差距。

### 5.4 VLab 和 V 的差距（这些结论能迁移多少）

| | VLab 候选 | V |
|---|---|---|
| CPU | 4 核，单核约 V 的 0.8 | 16 核 |
| 内存 | 15 GB（可用 6–8 GB） | 61 GB |
| 后台负载 | 10 个人造 8 步 shell 任务 | 15–24 张夜班卡，真实工作流（写文件、生成媒体、子 agent） |
| Worker 池 | 4–6 个 | min 5 / max 24 |
| 会话与数据 | 新会话、注册表按 11/08 V 规模铺 | 2.2 万会话、44 GB agent 库、真实大会话 |
| 聊天 | 6 个会话轮流发一句算术题，不用工具 | 飞书真人，常带工具、长上下文 |
| 首字口径 | Gateway 事件「首个正文」 | 飞书卡片首次推送（多约 1–2 s 建卡、推送） |

只能证明机制和方向：Worker 运行时让 Gateway 主线程每件工作便宜 2.7 倍，聊天首字对后台负载不再敏感。这个方向已被否决；它说明的「/vds 每件工作贵在 Gateway 主线程上」由第 7 节 V 的 profile 拆开。

## 6. 推荐第一步、验收标准、风险

### 6.1 第一步：两处主线程修复一起灰度（夜班留在 /vds）

1. **exec 改由常驻小进程代 fork**（`lab/patch-spawn-broker.mjs`，第 8.1 节）。默认开，`OPENCLAW_V_SPAWN_BROKER=0` 每次调用时读取，不用重启就能关；broker 任何异常都回退到原来的直接 `spawn`。
2. **Workboard 两个覆盖索引**（`lab/patch-workboard-hotpath-index.mjs`，第 8.2 节）。第一次打开库时建索引，之后不再建；回退就是 `DROP INDEX`，查询本身没改。
3. 上线前两处都要按 AGENTS.md 先 port 到 `openclaw-versa` 的 `versa/main`（源码加测试），capture PR 在 `release/source-map.json` 里映射；再走 VLab 共享 Gateway 门禁，用 `promote-to-v` 上 V。这些都要等 Tianyi 拍板。

### 6.2 验收标准（V 上，夜班在跑回合 ≥15 时，与 11-18、11-19 同口径比）

| 指标 | 现在 | 目标 |
|---|---|---|
| journald `[v-spawn-broker.1]` | — | 启动一行、没有 `lost`；同时段 exec 成功率不变 |
| 再抓一次 60 s 主线程 profile：`spawn` 自身 | 4.45 s（relay 3.8 s） | relay 路径 < 0.2 s |
| 同一 profile：Workboard SQL（`listLifecycleCandidates` + `listBoards`） | 约 3.7 s | < 0.5 s |
| Gateway 主线程 CPU（15 s 窗口）P50 / P90 | 67% / 83% | 下降 ≥ 8 个百分点 |
| 聊天 /vds「发出→开始跑」P50 / P90 | 2.4–3.2 / 8.8–9.9 s | 下降；按 2.4 节的处理器共享模型，主线程降 10 个点约省 0.4–0.8 s |
| exec 结果、取消、超时 | 基线 | 行为不变：输出完整、取消生效、没有孤儿进程 |

### 6.3 风险

- **broker 进程本身**：它和 Gateway 同一个 cgroup，Gateway 退出时它跟着退出，relay 的「父进程丢失」语义不变。但如果 broker 单独崩溃，它手上在跑的 exec 会被当作父进程丢失而取消（等同 Gateway 重启时的行为），下一次 exec 会自动重启 broker。每次启动和丢失 journald 各记一行。
- **句柄转交**：relay 的 stdin/stdout/stderr/control 是 libuv 建的 socketpair，经 Node IPC 转交前要先停读，否则数据会被 broker 读走丢掉。测试覆盖了 300 KB 输出、stdin、双向 control、IPC、kill、broker 被杀后自动重启；带密钥 fd、Windows、detached 这三种情况不走 broker。
- **索引写放大**：每次写卡多维护两个索引，索引合计约几 MB，卡片写入频率每分钟几十次，代价可以忽略。第一次建索引在 Gateway 启动时，V 的规模下估计 1–3 s（冷缓存），占 Workboard 库的写锁。
- **VLab 只证明机制**：见 5.4 和 8.3。V 上的收益要按 6.2 再抓一次 profile 去量。

### 6.4 其他方向的定位

- 夜班改走 Worker（C）：Tianyi 已否决，不再推进。
- 交互优先闸门（A）：不推荐上线。补丁和单测留在本分支，作为「推迟还没开始的工作不够」的证据。
- 刹车改看用户首字（B）：仍建议在 v-nightshift 做，作为兜底。
- 第 7 节里排在后面的几项（GC、脱敏、转录广播与镜像、TLS 上下文）作为下一批，见 7.3。
- 查 /vds 后台的漂移（5.3）：VLab 上漂移全是 SQLite 读（8.4），V 上同类读便宜得多，优先级下调。

## 7. V 上的主线程 profile（2026-11-19 14:33:45–14:34:46 CST）

做法：V 的 Gateway 本来就带 `--inspect=127.0.0.1:9229`。用 `lab/concurrency-40/inspector-cpu-profile.mjs` 连上抓 60 s（1 ms 采样）就断开；attach 用了 3.2 s。抓之前和之后各在 journal 记一次 liveness（之前 10 分钟 1 次告警，之后 0 次），抓完 Gateway active。分析脚本放在 V 的 `/var/tmp` 下运行，只拉回文本结果，用完整个目录删除。

当时的负载：27 张夜班卡在跑，近 30 分钟聊天 60 条，首字 P50 11.0 s / P90 18.0 s。共享 Codex app-server 日志显示，这 60 s 里夜班 21 个线程共有 118 次动态工具调用；同一时段没有聊天走 Codex。

### 7.1 主线程时间去哪了（60 s 里忙 39.4 s）

| 项 | 主线程 | 次数 / 单次 | 来源 |
|---|---|---|---|
| `child_process.spawn` | 4.45 s | relay 69 次，P50 54.6 ms；execa 10 次约 53 ms | exec 工具 → `createServiceChildRelayAdapter`；本地代理生成证书 |
| GC | 4.17 s | 512 段，P50 7.4 ms，最长 287 ms | 全局 |
| Workboard SQL | 约 4 s | `listLifecycleCandidates` 64 次（P90 120 ms）、`listBoards` 16 次（约 97 ms）、`reconcile` 29 次 | agent/子 agent 结束钩子、定时器 |
| 密钥脱敏 `redactRegisteredSecretValues` | 3.48 s 自身 | 716 次结构化脱敏 | 转录写入、Codex 事件、日志 |
| 转录广播 `handleTranscriptUpdateBroadcast` | 2.21 s | 311 次，P50 7.4 ms | 全局会话事件订阅者 |
| 转录镜像写入 `appendMessageWithMessageSequence` | 2.20 s | 288 次，P50 5.3 ms | Codex 转录镜像 |
| 新建 TLS 上下文 | 0.94 s | 125 次，约 7.4 ms | 本地 HTTPS 转发代理每次新连接都重新载入 CA |
| Codex 回合准备 `runCodexAppServerAttempt` | 0.21 s | 17 次 | |

### 7.2 和 VLab profile 对不上的地方

VLab（11-19 上午 prof1，6 个 60 s 窗）上每次后台工具调用的主线程成本，/vds 是 434 ms，Worker 是 145 ms，多出的部分几乎全是 SQLite 读：转录广播补用量读转录尾部约 76 ms、镜像找锚点 62–80 ms。V 上同一条广播路径每次只要 7.4 ms，一分钟才 2.2 s。原因是 VLab 候选的库是冷缓存、磁盘慢，而 V 的页缓存命中率约 99.7%（见记忆 vlab-fidelity-gap）。反过来，exec 的 fork 成本随 Gateway 内存涨，VLab 候选的 Gateway 只有约 1 GB，这一项被低估了。**两处修复都是按 V 的 profile 挑的。**

### 7.3 下一批（这次没做）

- GC 4.2 s：先看是哪几类短命大对象（转录行、事件快照），需要授权抓一次 allocation 采样。
- 密钥脱敏 3.5 s：结构化脱敏逐字段扫全部已注册密钥。可以按值长度预筛，或给同一对象做缓存。
- 本地 HTTPS 转发代理（`runtime-Cy2RRq4n.js` `forwardRequest`）：每次转发都新建连接和 TLS 上下文，还用 openssl 子进程生成叶子证书。复用 `https.Agent`（keepAlive）、缓存 SecureContext 和证书，预计省约 1.4 s/分钟。
- 转录广播与镜像写入：V 上单次只要几毫秒，但次数多。可以把同一 tick 内同一会话的多次广播合并（分支 `claude/session-event-snapshot-coalesce` 已有原型）。

## 8. 修复与 VLab 验证

### 8.1 exec 改由常驻小进程代 fork

代码：`lab/spawn-broker/v-spawn-broker.mjs`（运行时模块）、`lab/patch-spawn-broker.mjs`（dist 补丁，只改 `supervisor-*.js` 起 relay 的那一处 `spawn`）、两份单测。

- Gateway 第一次需要起 relay 时，fork 一个常驻小进程（这一次 fork 照常要付约 54 ms）。之后每个 relay 都由它来 fork。
- 小进程起好 relay 以后，先停读 relay 的各个 stdio 管道（libuv 建的 socketpair），再经 IPC 把父端句柄交给 Gateway。relay 的 IPC 通道终止在小进程，`message`、`disconnect`、`exit`、`error` 由小进程双向转发。`kill()` 由 Gateway 直接按 pid 发信号。Gateway 拿到的是一个和 ChildProcess 接口一致的对象，`createServiceChildRelayAdapter` 其余代码一行没改。
- 小进程在 Gateway 的 IPC 断开时自己退出，所以 relay 看到的「父进程丢失」时机和原来一样。
- 任何不能或不该代起的情况都返回 null，回退到原来的 `spawn`：stdio 里有密钥 fd、Windows、detached、开关关闭、小进程未就绪、5 s 超时或出错。

隔离测量（VLab，Node 22.23.1，起一个带 IPC 和 4 条管道的子进程，调用方线程被阻塞的时间）：

| 调用方匿名内存 | 直接 spawn P50 | 经小进程 |
|---|---|---|
| 0 GB | 1.3 ms | 1.1 ms（往返 1.7 ms，调用方不阻塞） |
| 1 GB | 21.5 ms | 1.0 ms |
| 2 GB | 36.2 ms | 1.0 ms |
| 4 GB | 63.6 ms | 1.0 ms |
| 6 GB | 93.0 ms | 1.0 ms |

V 的 Gateway 是 6.1 GB，实测每次 54.6 ms：V 的 CPU 比 VLab 快，斜率更小。

### 8.2 Workboard 覆盖索引

代码：`lab/patch-workboard-hotpath-index.mjs`，在 `ensureWorkboardSchema` 里，接在列迁移之后执行：

```sql
CREATE INDEX IF NOT EXISTS workboard_cards_board_agg_idx ON workboard_cards(board_id, status, archived_at, updated_at);
CREATE INDEX IF NOT EXISTS workboard_cards_lifecycle_link_idx ON workboard_cards(created_at, id, archived_at, agent_id, session_key, run_id, execution_id, execution_session_key, execution_run_id);
```

- V 的 `workboard.sqlite` 有 25,992 张卡（已归档 5,975 张），650 MB，notes 共 144 MB，automation 共 46 MB。只读测量（独立进程）：聚合每次 122–140 ms，生命周期匹配查询每次 465–680 ms。
- 聚合原来用 `(board_id, status, position)` 索引，但仍要逐行回表读 `archived_at`、`updated_at`；加了覆盖索引后整条查询只读索引。生命周期查询按 `ORDER BY created_at, id` 走新索引，SQLite 延迟回表，只有那约 670 张未链接、要看 automation 的卡才读表行。
- 按 V 规模造的合成库（本机）：聚合 42 → 1.5 ms，生命周期 55 → 14 ms，19,992 行结果逐行一致，建两个索引共 78 ms。单测里还用各种 automation 形态（空、非 JSON、boardId 为 null、数字）核对了加索引前后结果一致。

### 8.3 VLab candidate A/B（exec 代 fork，`candidate-bbbe08e4`）

同一测量台，10 个后台 /vds 槽，每槽 2 个回合换会话，每 12 s 一个聊天探针。补丁打在候选 dist 上，`OPENCLAW_V_SPAWN_BROKER` 按窗口关开交替（ABBA 4 对，每窗 3 分钟，每窗中段抓 60 s 主线程 profile）。为接近 V，做了两处设置：
- 候选 Gateway 额外持有 3 GB 匿名内存（`LT_BALLAST_GB=3`，只加在 Gateway 进程），进程 RSS 约 6.6 GB，V 是 6.1 GB；
- 后台任务明确要求用 OpenClaw 的 exec 工具（`MIX_BG_TOOL=exec`）。

第一次跑（candidate-b6def479）没有加第二项：Codex 用自己的 shell，命令在 app-server 里执行，Gateway 一次 `spawn` 都没有，两侧没有差别。那一轮只说明「测量台没打到这条路径」，已作废。这一轮的后台工具 100% 是 `gateway_exec`（3,021 次）。

| 窗口 | 探针首字 P50 / P90 | 发出→开始跑 P50 / P90 | 后台工具调用/分钟 | 主线程忙（60 s profile） | 其中 `spawn` |
|---|---|---|---|---|---|
| 基线（无后台） | 1.8 / 2.7 s | 0.2 / 0.2 s | 0 | — | — |
| r0 关 / 开 | 3.9 / 7.8 · **2.7 / 7.0** | 0.8 / 1.7 · **0.4 / 1.1** | 143.7 · 148.7 | 51.5 · **39.8 s** | 17.1 · **0.003 s** |
| r1 开 / 关 | **3.2 / 6.7** · 7.8 / 13.8 | **0.4 / 1.9** · 1.1 / 3.0 | 146.3 · 123.7 | **45.6** · 58.6 | **0.002** · 11.9 |
| r2 关 / 开 | 6.7 / 12.4 · **5.7 / 9.4** | 1.5 / 3.3 · **0.8 / 3.1** | 115.7 · 119.7 | 59.2 · **52.1** | 12.7 · **0** |
| r3 开 / 关 | **5.4 / 9.4** · 15.5 / 24.0 | **1.0 / 2.6** · 3.1 / 5.8 | 111.3 · 87.0 | **55.6** · 59.8 | **0** · 8.5 |
| **四对平均 关 → 开** | **8.5 → 4.3 / 14.5 → 8.1 s** | **1.62 → 0.65 / 3.45 → 2.17 s** | **117.5 → 131.5（+12%）** | **57.2 → 48.3 s** | **12.5 → 0.001 s** |

- 4 对里每一对都是开的一侧更快。全部回合答对：探针 120/120，后台 336/336。broker 是 Gateway 的子进程，常驻约 55 MB，整轮只启动一次，没有 `lost`。
- 后台回合 P50 46.2 → 41.5 s：主线程空出来以后，夜班自己也更快。
- 这一轮也有漂移（各对从 r0 到 r3 逐步变慢，原因见 8.4），ABBA 把它在两侧平均掉了。
- 迁移到 V 时，收益要打折。VLab 每次 relay `spawn` 约 80–110 ms（CPU 慢，压舱内存有一部分被换到了 swap），V 是 54.6 ms；VLab 后台每分钟 120–150 次 exec，V 当时是 69 次。按 V 的数字，主线程大约省 6%（3.8 s/分钟）。按 2.4 节的处理器共享模型，在主线程 70–80% 忙的时段，聊天「发出→开始跑」大约省 0.3–0.6 s。V 上的实际收益按 6.2 再抓一次 profile 去量。

### 8.4 VLab 上的漂移

11-19 上午 prof1：最后一个 /vds 窗口每次后台工具调用的主线程成本，比第一个高 323 ms，增量全是 SQLite 读（`readRecentSessionTranscriptMessageEvents` 41→162 ms，`withCurrentProjectionSnapshot` 73→278 ms）。V 上同类读便宜得多，这个漂移主要是候选环境冷缓存的问题，优先级下调。
