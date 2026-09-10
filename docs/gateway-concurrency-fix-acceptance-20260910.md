# Gateway 同库并发修复与验收

日期：2026-09-10。当前状态：**修复候选，性能验收尚未通过；生产 V 未操作。**

## 范围

- 工作区：`/Users/tianyicai/v-worktrees/gateway-concurrency-20260910`，分支 `codex/gateway-concurrency-20260910`。
- 通过统一 VLab CLI 合入 dev、打包、持有 integration lease 后部署。唯一共享 Gateway 为 24993；没有创建独立 Gateway，没有复制在线数据库。
- 实际使用完整 Makaron Agent SQLite（约 7.59 GB）、DeepSeek V4 Pro、high 思考档位。测试为专用新会话、`deliver:false`，不向飞书发消息，不调用 GPT。
- 生产发布、飞书渠道 receive-to-visible 验收均不在本次完成范围内。

## 已证实根因与改动

1. 原生普通回复初始化传入日常 maintenance 配置后，被底层视为强制同步维护。15 路 CPU 采样中，`applySessionEntryMaintenance` 占约 9.338 秒，长写事务约 10.697 秒；基线真实出现一条 `database is locked` 失败。
2. 普通回复改为提交后唤起已有原生合并维护队列；显式维护调用保持同步行为。CAS、sessionId/revision、commit guard、reset/delete 和原生 maintenance queue 未被移除。
3. 压测又发现终态落盘可能争抢 BEGIN 锁。新增异步有界退避，但仅限带原生 busy/locked 类型、事务回调尚未执行的 BEGIN 失败；不重放事务回调、COMMIT、模型请求或已发布结果，不提高 busy timeout。
4. 高频、严格白名单的纯计时日志绕开通用业务日志脱敏的重复 CPU 开销，使用独立、error-safe 的 Node Console。业务日志及其脱敏未改。

## 正确性证据

- 候选代码相关回归共 47 项通过（包括实际本地双进程 SQLite BEGIN 竞争）；诊断 wrapper 另有真实 inspector start/stop 和正常请求透明性测试。
- 完整 VLab 库原生 reply commit 回归通过：回调一次、交错元数据保留、commit guard 拒绝时无写入、sessionId rollover 后旧 revision 被拒绝。专用会话：`concurrency-fix-native-commit-1789030029402`。
- 完整 VLab 库两个独立进程、同会话竞争写入通过：`oc64-sqlite-1789031453253`；slowExitCode=0、preservedBoth=true。冷校验耗时不计入热并发延迟。
- `concurrency-fix-final` 的 ramp 1/5/10/15 共 31 条、随后两整波及第三波 1/5/10 共 78 条均通过正文、provider/model、stop、status=done、lastRunId 和 hasActiveRun 检查，外层 persistence/dispatch 错误为 0。低层已恢复的 BEGIN 竞争不等同于丢写，也不声称不存在任何 SQLite warning。
- 第三波 C=15 触发磁盘保护，未完成请求仅按各自 runId abort，不能算完整通过。

## 性能：仍未通过，不能交付为修复完成

以下均为该候选热池、新 session；P95 为小样本经验分位，不是长期 SLO。

| 波次 | C=1 正文首字 | C=5 P50/P95 | C=10 P50/P95 | C=15 P50/P95 |
|---|---:|---:|---:|---:|
| 1 | 3.541s | 8.064/10.990s | 11.227/18.643s | 21.421/29.516s |
| 2 | 5.674s | 9.013/9.965s | 13.967/17.608s | 17.278/24.848s |
| 3（部分） | 6.005s | 8.898/11.247s | 11.055/17.759s | 磁盘保护中止 |

- 实际 Worker 执行区间已证明最大 15 路重叠，不是只把上限配置成 15。
- 热波 1 的 C=15 请求到 harness P50/P95 为 3.858/4.101s，Worker 到模型为 11.226/12.700s。原始串行入口显著缩短，但阻塞转移/暴露到后续执行阶段，端到端仍不合格。
- 同期 memory.high 从 72 增至 3041，未出现 OOM/kill 或 CPU quota throttling。cgroup memory 包括大量文件缓存，不能等同于 Node heap。
- Worker 继承了 Gateway 的 `--max-old-space-size=8192`；当前 15 路会使用 5 个 Worker（每个 3 session）。尚不能仅凭该配置断言它是唯一根因，也未擅自改成更小堆或降低实际并发。

## 资源、操作与回退

- 磁盘保护一直保留 3 GiB。4 个已核实属于本线程、无运行引用的旧 synthetic fixture 已可恢复归档：原 53,496,148 bytes，压缩包 738,793 bytes；没有删除业务对话、其他任务、依赖或回退产物。
- 恢复包：服务器 `labs/control/fixture-archives/own-empty-length-fixtures-1789029920537.tar.gz`，SHA256 `019b8387065b7c85b29d9a5e4581691290eee80493b7a4668cfc1446aa471f1a`；删除前已 `tar -d` 比较通过。
- 空闲 checkpoint 首次因独立校验读事务返回 busy，被安全拒绝。读进程退出后 WAL 已由原生连接收尾回收；再次原生 checkpoint 返回 busy=0/log=0/checkpointed=0，未删除逻辑数据。
- 初次采样误用 SIGUSR1：OpenClaw 将其解释为重启，空闲 Gateway 正常退出。已说明并恢复原代码，没有活跃业务被强杀；之后仅用无监听端口的进程内 inspector。
- 诊断第一版存在 sampler start 名字遮蔽，导致无 profile；业务请求未失败。修复并增加真实分支测试后取得有效采样。
- 所有发布保留 CLI manifest 与 rollback 产物。验收未通过，未调用 accept；最终运行 release、指纹及 lease 收尾将在性能定位结束后更新。

## 证据定位

- 服务器 `labs/control/concurrency-profile-final-ramp-*.json`、`concurrency-profile-final-warm-*.json`：包括失败批次、终态校验、资源保护与实际 runId。
- `labs/control/concurrency-metrics-1789030742448.json`：前两波阶段汇总；`concurrency-metrics-1789030629184.json`：ramp 阶段汇总。
- 完整库原生回归入口：`lab/probe-native-reply-commit.mjs`、`lab/run-native-session-race.mjs`；后者调用现有同仓库 native race probe。
- 当前补充 Worker CPU 采样已部署为独立候选 `concurrency-worker-diag-v1`，非最终接受产物。
