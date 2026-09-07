# 同 Agent 多项目写库验收

用户 2026-09-07 明确重点是同 Agent 多个项目争用同一个库，多 Agent 不作为本轮上线前置条件。原有冷开库提速、双会话工具返回不是高负载通过；生产仍不改。

## 负载合同

使用已保留的 2,523,619,328 字节完整 VLab makaron 数据库私有副本，原始源不写入。通过 projects.register 和 sessions.create 注册真正 Git 项目并绑定会话；项目只是测试代码与空 Git 初始提交，不含生产工作目录内容。

真实模型调用有界 Lab 工具。每个项目另外创建带 projectId 的专用写入会话，使用原生 SDK 执行 metadata patch 和 transcript append，逐条读回 eventId/内容哈希，验证归属、无丢失和重复。原生真实工具结果与最终回复保存在模型会话里，与生成的压力测试转录分开。不能把合成转录冒充真实工具调用。

所有实际工具进入异步 barrier 后同时开始写入；记录每个执行 PID、开始结束时间和共同重叠时间。目标是五个活跃项目同时尝试写同一库，不是要求 SQLite 同时持有五个 writer 锁。每项目最多 240 轮、4KiB/条，持续目标 15 秒，逐级由两项目三轮脚本验收开始。

观测分别记录原生 patch 总耗时/回调前等待、append 总耗时、真实对话端到端和外部 HTTP。回调前等待含队列、开库、调度，不能称纯 SQLite 锁等待。正式比较需相同数据起点、资源、模型、进程模式和固定负载，完整保留失败和未复现。

## 临时 C5 资源例外

只使用本任务 source/lab/labctl.mjs 的显式 db91-project-write-c5-v1 profile，name=db91-fix、owner=codex-db91-contention-20260907；不修改服务器全局 labctl 或其他实例。默认 profile 不变。所有 Gateway、Worker、工具子进程和 labctl run 驱动置于同一个 vlabdb91benchmark.slice，整个切片合计 CPU200%、MemoryHigh4GiB/Max6GiB、TasksMax256，不给每个 Worker 独立累加配额。

grant 最大 25 分钟，记录 exact commit/owner/截止时间；到期拒绝新运行，每个服务有有界 RuntimeMaxSec。创建前确认宿主可用内存至少8GiB、磁盘至少3.5GiB且 Worker 实验已停止。工具在3.25GiB磁盘余量处停止加压，为3GiB硬保留线留余量。C5 完成后停止自己实例，并恢复两槽配置；不得把测试 profile 发布生产。

目前脚本为待实机验证候选，不代表压测通过。补丁默认保留完整校验/外键/事务/归属语义；不以健康响应或冷开库单项改善替代完整业务验收。
