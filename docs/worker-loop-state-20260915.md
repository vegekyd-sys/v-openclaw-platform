# Worker 并发下的 Memory 状态写入与 Gateway 响应

本轮是独立候选修复，尚未合入 dev、部署共享 VLab 或上线 V。任务分支为
`codex/worker-loop-scalability-20260915`，开发基线是
`081f9854925166d2ac2dc2e91017dac429c8e449`。

## 与已有 DB91.5 修复的关系

已核对用户指定的「V event loop 监控」任务及当前发布代码。Agent DB 跨进程 writer、
reconcile 唯一 owner、只在真实事务内持有 writer，以及 Memory FTS 修复已经上线。
该任务的生产两轮 C15 共 30/30 成功，数据库锁错误为零；剩余问题是负载下首字和
Event Loop 长尾。本轮保留这些修复，不重新实现写锁。

先前对生产 V 的自然业务 CPU 采样，在一个约 11.6 秒窗口中发现
`writeMemoryCoreWorkspaceEntries -> register -> synchronous SQLite -> count/expiry`
调用树占约 68.5% 的采样时间。这个比例仅是该窗口的栈归属，不能当成全天 CPU
占比，也不能单凭它认定 Worker 数量是原因。

## 修复

只替换两个当前 9.1 dist 文件，源文件与产物都可用构建脚本重现：

1. `plugin-state-store-PhQA2Nhh.js`：新增有界 `registerMany`，每批最多 32 行，
   事务内共用原生 retention 计数。批次之间通过进程内公平队列和 `setImmediate`
   让出 Event Loop；不会在等待下一批时持有 SQLite 事务。失败批次回滚，队列继续可用。
2. `dreaming-state-B0qd2W7q.js`：Memory 工作区快照使用上述有界批次；通过工作区
   SHA256 前缀的 SQL 范围读取，只解析自己的记录，保留原有 age/key 排序。
   旧 keyed-store 接口仍有兼容路径。过时记录删除每 32 条让出一次 Event Loop。

没有跳过未变化记录，因为普通 register 会更新保留顺序；直接跳过会改变配额淘汰
语义。单条写入、过期/容量策略和 doctor import 的原代码保持不变。新批次 API 的
原子性以每个 chunk 为单位：后续 chunk 失败不会撤销已提交 chunk；没有增加跨进程
整份工作区快照的原子性承诺。SDK 旧方法仍可照常使用。

## A/B 的测量范围

测试在 VLab candidate 的私有目录执行，导入当前 runtime 的真实 Memory Core 与
plugin-state SQLite 实现。A 保留原文件，B 与交付产物逐字节匹配。每个 case 独立
启动协调进程、初始化同规模数据库、完成连接预热，再进入计时。

- 固定 12,000 条合成状态记录，45 个工作区各 128 条，另有 6,240 条同 plugin 的
  其他 namespace 记录。避免真实业务内容进入报告。
- 固定 15 个状态任务比较 1/3/5 个真实 IPC 回传进程；固定 5 个进程比较
  5/15/45 个状态任务。
- 每种组合采用 A→B、B→A，保存每个 case，要求每一对都通过，不能靠平均数掩盖失败。
- 每个任务完成后核对原生 SQLite 的最终内容，再由回传进程确认收到完成结果。
  核对未参与更新的工作区和其他 namespace 不丢行。
- 同时记录 SQL 操作数量、CPU、RSS、Event Loop histogram、独立定时器和独立进程
  的 10ms 心跳往返延迟。独立心跳避免主进程卡住时监测器自身也不能运行。

这些是原生状态任务和真实 IPC 进程，**不是完整 production-worker Agent，也不是
45 个模型会话**。数据是规模受控的合成数据；另有真实 VLab SQLite 副本兼容性测试。
本轮没有真实模型首字或飞书收发 A/B，因此不宣称已恢复历史 45 线程业务能力。

## 指标解释与已保留的问题

原生 `monitorEventLoopDelay` 在本实验的一整段 microtask 阻塞中会漏掉首个长停顿，
出现主线程十余秒不响应、histogram P99 却仍约 10ms 的矛盾。原始值全部保留，
但不能拿该 histogram 的 A/B 数字宣称 P50/P95/P99 改善。放行使用独立进程心跳
P99、独立定时器最大间隔、完成耗时及数据正确性；心跳 P99 不是 Gateway 原生
`health.eventLoop.delayP99Ms`，完成耗时也不是模型首字。

最初 200 条冷启动探针包括 schema/连接初始化，不用于热态收益结论。首个多进程
试跑因私有 state read-ahead 路径未重定位而失败；后续修正只发生在测试目录。
早期对照因 histogram 漏采导致门槛失败；完整原始 receipts 仍保留在任务 tmp，
没有选择性删除。最终 recipe 还明确把重新打开 writer 的预热放到计时之前。

VLab 主机不是独占性能机器，另一个任务在最终 A/B 期间更新了共享 VLab。candidate
冻结的 runtime 和输入没有变化，receipt 记录了共享 PID 变化。反向重复和 SQL 调用
计数支持本轮机制归因，但机器负载变化仍是绝对耗时的限制。

## 复现与后续集成

在任务 worktree 执行：

```sh
node lab/build-worker-loop-state.mjs
node --test lab/worker-loop-state-build.test.mjs
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner worker-loop-scalability-20260915 --plan "$PWD/lab/worker-loop-state-snapshot.plan.json"
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner worker-loop-scalability-20260915 --plan "$PWD/lab/worker-loop-benchmark.plan.json"
```

`lab/worker-loop-state-plan.json` 保存两个文件的 before/after SHA；这是针对当前
dist 的发布补丁，不会自动套用到新 OpenClaw 版本。用户批准合入后，应以当时的
共享 release 重核文件 before hash、补充 baseRelease、正常 package/stage/deploy。
真实模型 C5/C15/C45 混跑的首字、完成、取消、Memory 搜索和渠道可见回复仍需
集成验收；不得把本轮局部性能收益当成整个平台的承诺。

会话磁盘扫描、会话列表重复读取子任务注册表、原生 Worker 初始化与模型阶段仍是
候选瓶颈，本轮没有对应完整基线，故没有顺手修改它们或声称已解决。

## 最终 A/B 结果

A→B / B→A 共 20 个 case，380/380 完成、持久化并收到完成确认，每一对均通过门槛。表中数值为两个反向轮次的中位数（两点取均值）；单位 ms。

| 回传进程 / 状态任务 | A 完成耗时 | B 完成耗时 | A 独立心跳 P99 | B 独立心跳 P99 | B 最大定时器间隔 |
|---|---:|---:|---:|---:|---:|
| 1 / 15 | 18727.7 | 784.7 | 18538.3 | 34.7 | 37.3 |
| 3 / 15 | 18760.4 | 790.4 | 18568.2 | 33.4 | 35.9 |
| 5 / 15 | 17589.5 | 758.3 | 17403.4 | 24.3 | 28.9 |
| 5 / 5 | 5861.9 | 268.6 | 5802.2 | 15.2 | 17.5 |
| 5 / 45 | 54927.5 | 2151.7 | 54378.5 | 30.4 | 40.6 |

在 C15 的同等内容下，原生 COUNT 从 **3,840 次降到 60 次**，过期清理从 **1,920 次降到 60 次**，真实 upsert 仍是 **1,920 次**。C45 的 upsert 保持 **5,760 次**，COUNT 从 **11,520 次降到 180 次**。收益来自消除重复工作与调度让步，不是少保存数据。

固定 15 个状态任务时，1/3/5 个回传进程的同版本耗时相近：本实验没有证明“每增加一个完整 Agent Worker 都会增加固定的 Gateway 延迟”。它证明的是任务引发的状态维护会堵住主线程，而且这条路径可以改好。

原始指标、SQL 计数、样本量与精确产物身份见 [完整 A/B 证据](evidence/worker-loop-state-ab-20260915.json)。最终服务器执行约 269 秒，冻结 runtime SHA 为 `c7e0083421a2d3bca05fe145437a9cdef42d44f17f4d9b920dec0be7943e35d5`。

## 正确性验收

真实 VLab `state/openclaw.sqlite` 的 SQLite 一致性备份大小为 **166,916,096 bytes**。
在副本上执行 **10 passed / 0 failed / 0 skipped**，包括五进程共写 320 条、容量与
过期边界、整批回滚、失败后队列恢复，以及全部非测试 plugin-state 记录的逐字节
指纹前后相同。本机产物重建/重复应用拒绝/旧单行与迁移路径保留测试 **3 passed**。

副本准备约 69.9 秒，测试约 4.7 秒；准备耗时没有混进性能收益指标。数据副本与
临时进程由 candidate 回收，不进入 Git。详细结果见
[真实数据副本验收](evidence/worker-loop-state-snapshot-20260915.json)。

Mac worktree：`/Users/tianyicai/v-worktrees/worker-loop-scalability-20260915`。
VLab worktree：`/srv/vlab-production-mirror/labs/shared-workflow/v-worktrees/worker-loop-scalability-20260915`。
发布只需两个产物；测试工具、基线代码与报告随同一 commit 交付。
