# OpenClaw 9.1 Makaron Agent DB 跨进程 writer 修复

## 结论

V 的架构判断成立：`SQLITE_SESSION_WRITER_QUEUES` 和
`runningReconciles` 都是模块内 `Map`，只能约束一个 Node 进程。Gateway 与
多个 production-worker 进程会各自通过本地队列，然后同时竞争同一个
`openclaw-agent.sqlite` 的 SQLite writer。

`memory.fts.ensure-body` 使用的是 memory index 数据库。它会造成 CPU、事件循环和
Worker 延迟，是事故放大器，但不直接持有 Makaron Agent DB 的 writer lock。

## 生产 V 日志关联（只读）

V 提供的结构化日志显示：

- 15:01–15:08，Makaron Agent DB session write 已从 11–66 秒增长到
  147–162 秒；
- 15:38:45 完成的一批 session write 总耗时 477–485 秒。

源码中的 `slow SQLite session write.elapsedMs` 从进入本地
`runQueuedStoreWrite` 前开始计时，因此 477–485 秒是“本进程排队 + 跨进程锁等待 +
真正临界区”的总和，不能解释成一笔 SQLite 事务持锁八分钟。本补丁新增三段独立
计时：`localQueueWaitMs`、`processQueueWaitMs`、`criticalSectionMs`。

本次从生产 journal 独立确认：

- 14:58 已有 SQLite lock wait，14:59 liveness heartbeat 延迟；
- 15:03:22 主 Gateway 出现 transaction hold，同时其他写入等待；
- 15:08:42 已连续 degraded 90 秒，event-loop P99 1120.9ms、利用率 1、
  CPU core ratio 1.281、active=4、queued=1；15:08 可见回复已出现 aborted；
- 15:13 多个 Worker 与 Gateway 同时出现 transcript-index preflight/claim 和
  `agent.write` 竞争，5 秒 lock wait 失败后出现 `database is locked`；
- 15:29–15:37 event loop 持续接近 100%；15:39:35 active=15、queued=5；
- 15:40–15:42 Worker 0–7 批量 lock wait/fail，随后出现 Worker stream ack、
  Feishu HTTP、消息 dispatch 超时；15:42:18 Gateway RSS 5.02 GiB。

9 月 14 日 18:08 的只读现场又确认：Gateway service cgroup 已使用 24.8 GiB、
峰值 27.7 GiB、swap 3.6 GiB；Gateway 本身 3.3 GiB RSS/1.3 GiB swap，两个运行约
24 小时的 Worker 分别约 4.7 GiB 和 3.1 GiB RSS，匿名私有内存占绝大多数。18:06
Gateway 仍报告 30 秒增长 520 MiB。此时连只读 `health` RPC 都超过 30 秒未返回，
但 SSH/systemd 仍可访问，说明不是单纯飞书连接故障，而是进程内存、CPU/event-loop
和写入积压共同失稳。

所以锁竞争是消息失败的直接链路和正反馈核心，但不是所有资源压力的唯一来源：
CPU/event-loop 饱和和 memory FTS 慢操作会扩大排队，排队又增加 reconcile 与状态写入。
进程级 writer 补丁只能在实测中证明是否打断这一正反馈，不能从“没有锁错误”推导出
内存或 event loop 已恢复。

## 9.1 修法

这次不把现有同步 transaction closure 改造成一套新的 Gateway RPC 协议。那会要求把
所有同步写 API 命令化并处理进程退出、回复丢失、幂等和回压，风险不适合作为 9.1
事故补丁。

补丁实现等价的“每个 Agent DB 同时只有一个 writer owner”：

1. 在原有进程内 writer queue 内侧，异步获取数据文件旁的、无业务数据的 SQLite
   coordinator lease；等待期间不阻塞 Gateway/Worker event loop。
2. lease 获取后才进入原生 Agent DB transaction，结束后立即释放；进程退出时由 OS
   自动释放锁。
3. `AsyncLocalStorage` 标记当前进程已持有 writer lease，嵌套 transaction 不重复取锁。
4. 中央 `runOpenClawAgentWriteTransaction` 增加同步兜底，覆盖没有经过异步 session lane
   的旧写入口；不重放已经进入的 mutation、commit 或 post-commit publication。
5. transcript-index 使用独立的 process-global reconcile lease。其他进程保留数据库里的
   dirty 状态并在前一个 owner 结束后重新 preflight；同一脏工作不会由多个 reconcile
   Worker 同时处理。
6. incognito 内存库保持进程私有，不创建无意义的跨进程 lease。

旁路 coordinator 不修改 Agent DB schema，不携带业务数据；回滚代码后遗留的空 sidecar
文件无业务影响。

## 本地复现与回归

- 原 9.1 行为：两个真实 Node 进程分别通过各自本地队列；第一进程持有
  `BEGIN IMMEDIATE` 时，第二进程稳定得到 `SQLITE_BUSY`。
- 补丁行为：两个真实进程都成功提交，等待进程的 5ms timer 持续运行。
- C15：15 个真实进程各写 5 次，共 75 次，全部完成，最终计数 75，无写丢失。
- reconcile：两个真实进程针对同一 dirty 状态只执行一次 reconcile。
- 全套相关回归：68 passed，0 failed，1 个仅 VLab native dist 可跑的测试 skipped。

## VLab 合入后验收门槛

1. 用旁路 lease 强制占用 writer 10–30 秒，同时启动真实 Agent 消息；Gateway liveness
   必须继续，lease 释放后同一 run 必须持久化并完成。
2. C15 真实 Agent 路径必须 15/15 terminal persistence；不得出现新的
   `SQLITE_BUSY`、`database is locked`、Worker stream ack failure。
3. 同时触发多个 dirty transcript，只允许一个 process reconcile owner；后到的 dirty
   状态最终清零，不丢索引。
4. 日志必须能区分本地队列、跨进程等待和真正临界区；不得再把总 elapsed 当作持锁时间。
5. Gateway health、Feishu receive → dispatch → visible reply 分别验收；健康检查不替代真实消息。
6. 必须做同配置、同模型、同轮数、同 C15 和同大上下文负载的 A/B。A 与 B 都从一次
   明确的干净 Gateway 生命周期开始，采样整个 service cgroup，而不只看主 PID。
7. A/B 原始项必须包含 event-loop `delayP50Ms`/`delayP99Ms`、cgroup memory/swap、
   Gateway RSS、每个 Worker RSS、完成/持久化数和 journal 错误。20ms monitor 分辨率会让
   P50 中位数落在同一个底值，因此当前门槛使用 P50 的 P95 必须下降、P99 中位数必须下降，
   且 P99 的 P95 不得回退超过 5%；最大单点继续完整报告，但不单独作为放行门槛。
8. 2026-09-14 用户明确决定把长期内存回收拆到下一步。本轮仍完整记录 memory peak、
   growth、Gateway/Worker RSS，但不作为 writer 正确性补丁的阻断门槛，也不宣称内存泄漏
   已修复。

验收脚本为 `lab/run-db91-writer-ab.mjs`，固定使用 `deliver:false` 的独立 session，
默认执行两轮 C15、每个请求约 1,500 行合成上下文，并在完成后保留 30 秒 cooldown。

## 固定 5 Worker A/B（2026-09-14）

按生产 V 的常驻 Worker 数，将共享 VLab 临时设置为 `minWorkers=5`、`maxWorkers=15`、
`sessionsPerWorker=3`。A/B 的 Gateway 配置 SHA 均为
`d7546232f72936f49cb85a6d43ea52b42c6413b43f161f2d7aeea106bb6e619b`，Worker 配置
SHA 均为 `1d77c89aef2edcbe5f43f912da4b23cc5ad0edcbb8a5bd3feab8e1a2a58dd0ff`；
两侧均执行两轮 C15 和真实 40 秒 Agent DB 持写事务，五个 Agent Worker 全程常驻。

- A（`db91-writer-ab-baseline-1789385650456.json`）：29/30 完成并持久化，1 次
  `database is locked`，失败写等待 30,287ms，7 次 health timeout；P50 P95 36.6ms，
  P99 median/P95/max 为 68.8/442.8/3338.7ms；测试窗口内存增长 2.29GiB，峰值 9.59GiB。
- B（`db91-writer-ab-candidate-1789386541368.json`）：30/30 完成并持久化，0 次
  `database is locked`、0 次 runner runtime error；仍有 3 次 health timeout 和 1 次
  liveness delayed；P50 P95 27.1ms，P99 median/P95/max 为 64.8/371.5/545.8ms；
  测试窗口内存增长 0.36GiB，峰值 6.84GiB。
- B 的请求总耗时中位数从 11,837ms 降至 10,639ms，但 P95 从 57,198ms 升至
  59,152ms。补丁因此证明了锁错误和最坏 event-loop stall 的显著改善，不证明所有请求
  都更快，也不证明 event-loop 或内存问题已经根治。
- 第一笔 B 尝试在正式 `startedAt` 前因后台 reconcile 令测试 holder 超过 180 秒仍未取得
  Writer 而作废；重跑得到上述有效 B。该作废样本和 B 的 3 次 health timeout 都必须保留
  为后续异步 Writer/P99 工作的输入，不能从验收记录中删去。

用户基于这一固定 5 Worker 对照，明确批准把本补丁作为 Agent DB 跨进程写入正确性修复
上线；发布接受范围不包含剩余 event-loop、reconcile 排队或长期内存回收问题。
它不复用夜班业务会话，也不向飞书发送测试消息。A 必须先把已验收 baseline 同产物重新
部署到一次干净生命周期后运行；B 再部署候选同样运行。`lab/compare-db91-writer-ab.mjs`
比较两份原始 JSON 并以非零退出码拒绝任何 event-loop 或内存门槛失败。

9.1 原始 `health.eventLoop` 只返回 P99。为满足 P50/P99 同窗比较，先部署只增加
`monitor.percentile(50)` 返回字段、完全不改变分类阈值或调度行为的
`db91-writer-ab-metrics-v1`，A 和 B 都以这层观测补丁为共同基线。没有 P50 样本的
旧 A 结果一律无效，不参与放行。

A 还必须由一个真实独立 Node 进程通过 9.1 的
`runOpenClawAgentWriteTransaction` 持有 Agent DB 写事务 40 秒；持锁后再从主 Gateway
同时发起 `sessions.patch` 和 C15 Worker 消息。比较器要求 A 同时出现数据库锁错误、
至少 30 秒的 slow session write，或等价的 session mutation 等待后以 DB lock 失败；
同时还要有至少 1 秒 event-loop P99 和至少 1 GiB cgroup 内存增长。少任何一项都
视为“没有复现线上故障”，不得拿来与 B 比较。
