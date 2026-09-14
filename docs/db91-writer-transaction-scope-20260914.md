# OpenClaw 9.1 Agent DB writer 事务边界修复

## 原因

`551d5a2` 首次把 Agent DB writer 与 transcript reconcile 从进程内单例提升为跨进程
协调。跨进程方向是对的，但 writer lease 放错了一层：它包住了整个
`runExclusiveSqliteSessionWrite` 回调。

这个回调不是 SQLite transaction。现有调用方会在其中执行异步消息筛选、用户回调、
transcript 计算、归档文件操作和磁盘统计。因此一个 Gateway/Worker 可以在没有持有
Agent DB 写事务时长时间占用 `.session-writer-coordinator`；其他进程则在同步 transaction
入口等待，最终出现 `V_AGENT_DB_PROCESS_COORDINATOR_TIMEOUT`，并阻塞各自 event loop。

## 修复边界

1. `runExclusiveSqliteSessionWrite` 恢复为进程内顺序队列，只负责同一进程的 mutation
   生命周期，不再拥有跨进程 writer lease。
2. 所有普通 Agent DB 写入仍由 `runOpenClawAgentWriteTransaction` 在真正的
   `BEGIN IMMEDIATE` 前获取全局 writer lease，在 COMMIT/ROLLBACK 后释放。
3. 同步兼容入口的 admission budget 与原 transaction busy timeout 对齐，默认 5 秒，
   不再允许协调器额外阻塞 event loop 30 秒。
4. 不经过普通 transaction wrapper 的 `ANALYZE main` 和 free-page checkpoint/vacuum
   改为显式事务级/维护操作级协调，避免因收窄外层 lease 形成漏网 writer。
5. transcript reconcile 继续使用独立的 `.transcript-reconcile-coordinator`。它只保证同一
   Agent DB 同时有一个 reconcile owner；每个 reconcile 写 chunk 仍走普通 transaction
   writer lease。
6. Memory FTS 的健康 schema 检查补丁保持不变。健康 `memory_search` 不进入
   `BEGIN IMMEDIATE`；缺失派生索引时才进入真实回填事务。

## 本地证据

- 回归测试真实启动两个 Node 进程。A 复现旧范围：进程 1 在持 writer lease 时执行
  250ms 非数据库等待，进程 2 在 80ms 后稳定得到
  `V_AGENT_DB_PROCESS_COORDINATOR_TIMEOUT`，只提交 1/2 写入。
- B 使用 transaction-only 范围：相同非数据库等待期间进程 2 可先完成写入，随后进程 1
  完成，最终 2/2 写入。
- 原有 15 进程 × 5 次真实 SQLite 写入回归保持 75/75，无 `SQLITE_BUSY` 写丢失。
- Memory FTS 健康路径、多进程健康 schema 检查、P50/P99 指标和 A/B 比较器回归均通过。

## 共享 VLab 验收

共享 VLab 固定 `minWorkers=5`，不得提高 `maxWorkers` 或额外启动第六个 Worker。A/B 使用
相同配置、相同数据负载和相同采样窗口：

- A：当前 broad-scope 版本，必须复现 coordinator wait/写入排队；
- B：本候选版本；
- 两侧记录 receive → dispatch → Worker first non-empty → visible reply、成功持久化数、
  `database is locked`/coordinator timeout、event-loop P50/P99、cgroup memory/swap 和每个
  Worker RSS；
- B 必须 0 `database is locked`、0 coordinator timeout、全部请求 terminal persistence；
- 本轮不以长期内存增长作为 writer 正确性阻断项，但完整保留数据，不宣称内存问题已修复。

生产 V 不在本任务当前范围。共享 VLab 通过并取得生产授权后，应从已验收 commit 构建
与生产基线匹配的同逻辑产物，不能直接复用只适配共享 VLab 当前 SHA 的增量包。
