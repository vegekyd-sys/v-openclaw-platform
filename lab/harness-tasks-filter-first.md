# Codex 回合不再克隆全部任务

状态：已在 Mac 上做过单测和等价测试，还没在 VLab candidate 上做 A/B，没有合入，没有上 VLab 或 V。

## 问题

Codex harness 每个回合都会调 `createAgentHarnessTaskRuntime().listTaskRecords()`，调用链是
`createCodexAttemptNotificationController`，再到 `registerNativeSubagentMonitor`。这个函数先让任务注册表把全部任务克隆并排序
（V 2026-11-08 共 18,867 条），再从里面挑出本会话拥有的那几条。

2026-11-08 VLab candidate run2 的条件：V 规模注册表、订阅会话事件、bash5、c10，在私有 Gateway 主线程里 profile。
结果：这一项每个 Codex 回合占主线程约 220 ms，Worker 没有这项开销。在 /vds 比 Worker 多出的 684 ms/回合里，它排第一。
数据见共享笔记 `vds-concurrency-deep-20261108.md` 的「run2 结果」。

## 改动

把同一个判断条件作为参数传给 `listTaskRecords(filter)`。注册表本来就支持先过滤、再克隆排序，只是这里没用上。

- **结果相同。** 返回的记录相同，顺序也相同。过滤保持原来的相对顺序；新到旧排序的同毫秒并列，按插入序号决定，在过滤后的子集上次序不变。
- **源码。** openclaw-versa `versa/harness-tasks-filter-first-20261108` @2523e563e9d，带 vitest 单测，去掉改动后单测失败。
  这个分支还没有合入 versa/main。
- **开关。** dist 版本多一个开关：`OPENCLAW_V_HARNESS_TASKS_FILTER_FIRST=0` 恢复原来的整表调用，每次调用时读取，
  用于同一个 Gateway 上的 A/B 和紧急关闭。
- **不需要改 Codex 插件。**

这个 PR 只含这一处，是从 #535 里拆出来的。#535 的另一半是按树读 subagent_runs，只有 `session_status` 会用到，真实流量里很少走到，这次不带。

## 验证

- `lab/harness-tasks-filter-first.test.mjs`：
  - 确认 plan 锁定了 V 的原字节和发布字节；
  - 把发布文件里的方法体原样取出，接上从 V dist 复制的注册表实现（克隆、排序、同毫秒并列）；
  - 用 600 条任务、每毫秒 4 条，分三种作用域，比较原调用、开关开、开关关三者的结果，逐条逐序全部相同；
  - 确认开关开时只请求过滤后的列表，开关关时请求整表。
- 微基准（Mac，合成任务 18,867 条）：每次调用 12.1 ms 降到 0.15 ms。这只证明机制。VLab profile 里的 220 ms/回合
  还包括 4 核机器、真实记录大小和 GC，收益以 A/B 为准。

## 待做

- 在共享测量台（`claude/vds-concurrency-deep`，订阅会话事件、V 规模注册表、bash5）上做 A/B：
  在同一个 Gateway 上切换 `AB_ENVS=OPENCLAW_V_HARNESS_TASKS_FILTER_FIRST`，跑 /vds c10/c15。
- 上线前要做三件事：
  - versa 分支合入 versa/main；
  - 捕获 PR 在 `release/source-map.json` 里映射到 `versa:2523e563e9d`；
  - 按线上字节重新构建，V 的原字节 `50dc439b…` 不变才能直接用。
