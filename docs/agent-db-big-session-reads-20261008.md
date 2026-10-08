# 大会话同步读取：第一阶段证据与分阶段计划（2026-10-08）

数据来源：V `/tmp/openclaw/openclaw-2026-10-0{7,8}.log`（10/07 00:00 – 10/08 19:36 CST，653 条 `slow SQLite transaction hold`、16 行协调器超时），V 的 db91.6 core dist 源码，V makaron 库只读查询（ionice 空闲级，35 s）。

## 1. 先更正一个前提

这两类操作**不占写锁**。它们是 `runSqliteDeferredTransactionSync` 开的 DEFERRED 只读事务，库是 WAL 模式，读事务不挡写；协调器租约（`agent-db-process-coordinator.mjs`）只包在写事务外面。日志里的 "transaction hold" 对读事务来说，量的是**同步阻塞所在进程主线程**的时长。

时间对齐验证了这一点：

| 检查 | 结果 |
|---|---|
| 27 次 ≥3 s 的长读期间，有没有写者在等（admission / lock wait / 超时） | **0 次**有重叠 |
| 10/08 的 7 次协调器超时，前 8 秒内谁在占锁 | `agent.write` 8–10 s 三次，无标签占锁两次（pid 3365951 = v-memory-indexer），`sessions.transcript-index.preflight` 两次；**没有一次是这两类读** |

所以它们不是写锁超时的直接原因。真实伤害是**冻结 Gateway 主线程**：10:50:47–58 Gateway 主进程被一次 10.9 s 的 context 读冻住，期间钉钉 socket 心跳超时被断开重连（"已 21 秒未确认 socket 可用"）；同期所有 RPC、首字、语音都在等。

还有一个待证实的连接：`agent.write` 8–10 s（3 次超时的元凶）里面可能嵌套着同样的全量读——嵌套时走 SAVEPOINT，不单独记日志，算在外层 `agent.write` 上。第二阶段用调用栈确认。

## 2. 两次 48 小时的统计

| operation | 次数 | ≥3 s | ≥5 s | p50 | 最长 | 主要进程 |
|---|---|---|---|---|---|---|
| session context snapshot read | 126 | 15 | 9 | 1.5 s | 10.9 s | Gateway 主进程 |
| session transcript fenced read | 33 | 12 | 7 | 1.6 s | 8.6 s | worker（也有 Gateway） |
| （对照）agent.write | 47 | 5 | 4 | 1.2 s | 9.8 s | Gateway |
| （对照）transcript-index.preflight | 11 | 3 | 3 | 2.5 s | 10.2 s | Gateway |

## 3. 读的是什么（代码，db91.6）

- **fenced read** = `loadTranscriptEventsSync`（`session-accessor.sqlite-transcript-store-*.js:860`）：把会话**每一行** `event_json` 取出并 `JSON.parse`。入口主要是不带 limits 的 `SessionManager.open(target)`，调用点有 15 处：embedded-agent 开跑、compact、context-engine、transcript-commit、worker 云端执行（server-worker-placement）、cli-runner 等。9.1 已有有界版本 `SessionManager.openBounded` / `readSessionTranscriptBoundedActiveContextCore`，但这些调用点没用。
- **context snapshot read** = `withTranscriptContextSnapshot`（`session-manager-*.js:146`）：对会话每一行在 SQLite 里做 JSON 导航投影（要读完每行的溢出页），在 JS 里建整棵树，再按活跃路径逐条取 payload。入口 `SessionManager.openModelContext` / `readSessionContext`。core 里唯一找到的调用者是 Skill Workshop 经验复盘，但 V 日志里没有复盘运行记录，所以 Gateway 上这 126 次的真实调用者还要用调用栈确认（插件 dist 不在 core 里）。

两者的共同点：**不管会话压缩过多少次，都扫全部历史**。VLab 那个会话有 130 次压缩，活跃上下文很小，读取仍按 2.46 万行全量扫。

## 4. 是哪些会话

长读按时间对到同一进程前 15 秒内被派发的会话（多数一一对应）：

| 会话 | 大小 | 行数 | >1 MB 的行 | 对上的长读 |
|---|---|---|---|---|
| 飞书私聊 ou_0674…（2b21b4a0） | **158 MB** | 10,431 | 41 行 58 MB（全是 view_image 内联 base64） | 14:08 4.6 s、16:51 6.2 s、17:04 6.2 s、17:19 4.4 s、18:05 6.4 s、18:37 6.1 s |
| 飞书私聊 ou_cb13…（7612daa9） | 153 MB | 19,120 | 0 | 10/07 09:36 8.0 s、10:50 **10.9 s**、14:11 6.7 s |
| 飞书私聊 ou_98a5…（7da00997） | 123 MB | 24,206 | 4 行 9 MB | 10:25 6.1 s |
| 群「十二家」oc_fab9… | 114 MB | 9,130 | 55 行 67 MB | 11:10 4.2 s、11:30 4.1 s、16:21 5.1 s、17:40 5.1 s |
| 群「v-云机」oc_8e44… | 96 MB | 10,533 | 7 行 8 MB | 12:00 3.1 s |
| 群「潘浩-tianyi-蔡天懿」oc_6873… | 114 MB | 1,984 | 22 行 25 MB | （10/07 后无活动） |

大行的形状：`toolResult` / `toolName: view_image`，content 里 2–6 张 `{"type":"image","data":"<base64 8–1260 KB>"}`。也就是 9/29 记过的「媒体没外置」，主要来自 view_image。

注：会话大小只查了按事件数排前 40 的会话；按字节全量排行要扫整表（约 3 GB），留到夜里低峰做。

## 5. 分阶段计划

**阶段 1（本文，已完成）**：日志统计、时间对齐、调用点、会话名单。

**阶段 2：VLab 复现与调用栈（下一步，进行中）**
- candidate `lab/candidate/big-session-reads.mjs`：私有库里放一个按块放大到 V 量级的会话（复制 VLab 会话 ×N、重写 id 链、补派生表、注入 view_image 形状的 base64 行），V 同款配置（deepseek-flash 经 vlab-worker）跑真实回合。
- 每次 ≥200 ms 的事务记录调用栈、sessionId、行数、字节数；旁路一个写者进程每 25 ms 走一次真实协调器，量读期间的写准入等待。
- 回答三件事：Gateway 上 context 读的真实调用者；worker 上 fenced read 的入口；`agent.write` 8–10 s 是不是嵌套了全量读。

**阶段 3：缩短阻塞（目标 <500 ms），按代价排**
1. 先查上游（9.9 / 10.1 / main）是否已有有界读、工作线程读或缓存（9.9 新增了 `session-manager-metadata.worker.ts`，正在核对），有就回移而不是自造。
2. 调用点改用已有的有界读（`openBounded` / `readSessionTranscriptBoundedActiveContextCore`，只读最近一次压缩之后的尾段），不改存储格式。
3. 导航投影只扫最近压缩边界之后的行（压缩会话占绝大多数）。
4. view_image 内联 base64 的写入路径外置（只影响新数据；旧数据要迁移，单独评估）。
- 每个改法在 candidate 里对照：持锁/阻塞时长、读出的上下文与原实现逐条一致、真实回合回复正常。达不到明显下降就不合入。

**阶段 4：合入与上线**：VLab 证据达标 + CI 全绿 → 合 dev；上 V 等你说「上线」，`promote-to-v.mjs` → `vlab.mjs align` → parity ALIGNED。

**阶段 5：清理名单**：只出名单（上表 + 按字节全量排行），说明每个会话 reset 或压缩的影响，由你决定，我不动任何会话。

## 6. 这条线和另外两条的关系

10/08 的 7 次写锁超时里，索引预检 2 次、v-memory-indexer 2 次，分别在另外两个会话里修；剩下 3 次 `agent.write` 8–10 s 的内容还不知道，阶段 2 的调用栈会回答它是否属于本线。


---

# 第二阶段：VLab 复现、调用者与修复（2026-10-08 20:00–21:30 CST）

candidate：`lab/candidate/big-session-reads.mjs`。私有库里把一个 VLab 会话按块放大到 **184 MB / 3.3 万行**（id 链重写、派生表同步、40 行 view_image 形状的内联 base64），V 同款路由跑真实回合；另外复制 VLab 最大的 20 个真实会话做逐条对照。旁路写者每 25 ms 走一次真实协调器 + `BEGIN IMMEDIATE`。

## 7. 两类读取是谁调的（调用栈）

| operation | 调用者 | V 上对应的会话 |
|---|---|---|
| session transcript fenced read | **我们自己的 vlab-worker 插件**：`production-worker/harness-result.mjs` `readNativeSessionMessages` → core `readVisibleSessionTranscriptMessageEntries`。每轮结束在 Worker 里整会话读一遍，Gateway 兜底路径再读一遍；结果作为 `messagesSnapshot`（整段历史）经 IPC 发回 Gateway | vlab-worker 会话：ou_98a5（123 MB）、v-backup、张家赫v |
| session context snapshot read | **Codex harness（vcodex/vds）回合开始**：codex 插件 `session-history` → `SessionManager.openModelContext` / `readSessionContext`，带 fence、不限量、Gateway 主线程同步 | codex/vds 会话：ou_0674（158 MB）、十二家（114 MB）、v-云机（96 MB） |

V 上核对：上述会话的 `agent_harness_id` 与此一一对应。

## 8. 修复与 VLab 证据

**F1 worker 尾部读取**（`experiments/agent-worker-isolation-v1/harness-result.mjs`，发布产物 `lab/release-files/worker-native-tail/`）：用 core 公开的分页读取器 `readSessionTranscriptVisibleMessageDelta` 从尾部附近的游标往后读，游标锚点由一次只读的活跃路径索引查询给出（core 自己校验锚点，不一致就 reset）；窗口 128 条起按 4 倍扩大，直到覆盖本轮开始之前的消息；任何拒绝都退回原全量读。

| | 修复前 | 修复后 |
|---|---|---|
| 3 个真实回合（184 MB 会话，chat.send） | Worker fenced read 4.1 s、2.4 s，Gateway 2.8 s | **没有任何整会话读取** |
| 尾部读取耗时 | — | 128 条 5–30 ms；扩到 2048 条 95–167 ms |
| Worker→Gateway 的 messagesSnapshot | **165.8 MB** | 1.1 MB |
| 正确性 | — | 21 个会话 × 3 种起点，尾部条目与全量读取最后 N 条逐条相同；按本轮构建的 attempt 结果（toolMetas、spawns、lastAssistant、itemLifecycle 等）与全量版逐字段相同。唯一不同项是放大数据自身（各块时间戳重复，2352 条乱序），真实会话 0 例 |

**F2 上下文窗口读取**（core dist 补丁 `lab/patch-context-window-read.mjs`，产物 `lab/release-files/context-window-read/session-manager-CNTG_BAJ.js`，原文件 sha 8db52c1a… 无人改过）：model context 只用"最近一次压缩/重置边界的 firstKept 之后"的路径。新实现从 OpenClaw 自己的活跃路径索引取这一段，只对它做导航投影；窗口前最近的 thinking_level_change / model_change / assistant 按类型索引补到链前面。索引不是最新、没有边界、leaf 或窗口起点对不上、任何异常 → 退回原全量扫描。新 operationLabel `session context window read`；`OPENCLAW_V_CONTEXT_WINDOW_READ=0` 关闭。

| | 原实现 | 新实现 |
|---|---|---|
| 184 MB 会话，model-context 视图（无/两种 fence） | 3.0–3.4 s | **114–167 ms** |
| 同上，transcript 视图 | 2.7–2.9 s | 109–188 ms |
| 5.8k 条的真实会话 | 550–670 ms | 148–207 ms |
| 正确性 | — | 21 个会话 × 3 种 fence：消息摘要、model、thinkingLevel、header、leaf、transcript 视图全部相同（含"元数据只在会话开头"的形态）；6 个从未压缩的会话按设计回退 |
| **vds 真实回合**（184 MB 会话） | Gateway 读 **4.6 s、5.5 s**，两轮都失败："Cannot inspect Codex processes. Process inspection exceeded its deadline" | Gateway 读 **255 ms、116 ms**，两轮都成功 |

两类操作的持续时间都从秒级降到 300 ms 以内，满足 <500 ms 的目标。

## 9. 读不挡写，但冻结会连带写

旁路写者在所有长读期间准入等待 ≤3 ms，再次确认这两类读本身不占写锁。真正占写锁的另有两类，本次观察到：
- **重置大会话**：V 19:13:08 用户在私聊 ou_cb13（153 MB）发 `/new`，紧接着 Gateway `agent.write` 持锁 **9.8 s**，同时一个夜班回复因协调器超时失败。candidate 里会话删除事务也持锁 1.1–1.2 s。
- **大会话的索引 prepare**：vds 回合写入后 `sessions.transcript-index.prepare` 持写锁 4.3–6.8 s（V 上同名操作最长 5 s）。不在本线范围，列为后续。

## 10. 清理名单（只出名单，不动任何会话）

| 会话 | 归属 | 大小 / 行数 | 大头 | harness | 影响（修复前） | 建议 |
|---|---|---|---|---|---|---|
| 2b21b4a0 | 飞书私聊 ou_0674… | 158 MB / 10.4k | 41 行 view_image 共 58 MB | codex(vds) | 每轮 Gateway 冻结 4.6–6.4 s | F2 上线后可不急；若要瘦身，压缩不会删内联图片，只有 /new |
| 7612daa9 | 飞书私聊 ou_cb13… | 153 MB / 19.1k | 无大行 | — | Gateway 冻结 8–10.9 s | **用户 19:13 已自行 /new**，该次 /new 本身占写锁 9.8 s |
| 7da00997 | 飞书私聊 ou_98a5… | 123 MB / 24.2k | 4 行 9 MB | vlab-worker | 每轮 Worker 读 6.1 s | F1 上线后不再读全量 |
| 8b0b646d | 群「十二家」 | 114 MB / 9.1k | 55 行 67 MB | codex(vds) | Gateway 4.1–5.1 s | 同 2b21b4a0 |
| 618b8006 | 群「潘浩-tianyi-蔡天懿」 | 114 MB / 2.0k | 22 行 25 MB | — | 10/07 后无活动 | 不活跃，可留到归档 |
| 9e7ce112 | 群「v-云机」 | 96 MB / 10.5k | 7 行 8 MB | codex(vds) | Gateway 3.1 s | 同上 |
| 3c3fab41 / 74a8784d / 941a78dd / d084edfe | 夜班 0721、陈杰x小奥、nexus开发、张家赫v | 59–73 MB | 小奥群 13 行 38 MB | 多为 vlab-worker | Worker 读 1–6 s | F1 后不急 |

**注意**：重置一个 150 MB 的会话会在一个写事务里持锁约 10 s（19:13 实测），期间其他回复会被协调器超时打断。如果决定 reset，请在凌晨低峰、一次一个、间隔几分钟做。本名单只覆盖按事件数前 40 的会话；按字节全量排行要扫整表，留到夜里低峰。
