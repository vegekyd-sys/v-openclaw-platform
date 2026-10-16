# 连续子任务完成通知修复

状态：候选、合并回归和共享 VLab 真实飞书验收均通过。已验收组合为 `subagent-settle-completion-20261016e`，生产 V 未部署。积压修复见 [独立说明](subagent-settle-backlog.md)。

## 问题与最终改动

旧飞书群中，父任务创建两个子任务并 yield。第一条通知唤醒父任务后，第二条通知在模型执行前遇到 `SessionTranscriptProjectionUnavailableError`，最终汇总未送达。队列里的上一回合退出，不代表它触发的异步索引重建已经完成。

在原生 `prepareEmbeddedAttemptTranscriptLifecycle` 解析当前目标会话之后、创建 transcript 写上下文之前，复用已有的 `waitForSessionTranscriptProjection`。只处理 `inter_session` 且来源为 `subagent_announce` 或 Worker 实际使用的 `agent_harness_task`。原生 waiter 最多等待 15 秒，并验证索引代次；等待前后和期间检查取消、writer 归属和会话身份。超时或数据库错误继续抛出，不重试整个回合，也不重放模型或工具。

另一个问题是父任务在收到第一条通知后再次 yield，被错误判为没有 continuation source。此时子任务是在前一个回合创建，当前 attempt 没有 spawn 记录；yield 中断也可能早于 tool-end 元数据。原生 `onYield` 只有 pending-child claim 成功后才调用，故把其凭据 `nativeYieldClaimed` 从原生 attempt 传到最终 meta，再由 Worker adapter 经 IPC 带回 Gateway。终结判定要求 `yieldDetected` 和该凭据均为 true；只有外部 yield 标记、无 claim 或失败工具记录均不能消除诊断。

通知修复涉及三个 runtime 文件：builtin、embedded-agent、Worker harness-result。与积压修复合并后共六个文件，无数据库迁移或配置调整。生成器及发布计划校验实际基线 SHA，防止覆盖其他版本。

## 验证

```sh
node --test lab/subagent-completion-projection.test.mjs experiments/agent-worker-isolation-v1/harness-result.test.mjs lab/gpt-live-projection-readiness.test.mjs lab/subagent-settle-backlog.test.mjs
node lab/vlab.mjs candidate --repo "$PWD" --owner YOUR_TASK_ID --plan "$PWD/lab/candidate/subagent-completion-projection.plan.json"
```

本地及 dev 合并后均为 67/67 通过。覆盖实际 lifecycle 执行顺序、取消/归属失效/会话身份错误、数据库错误与超时不重放、原生 yield 的三种 claim、无 claim 拒绝、实际 final meta 投影、实际 Worker adapter 与 JSON 序列化后的 Gateway 判定，并保留已有语音和积压回归。

真实旧群会话副本 `candidate-852de947-ba6e-45e5-bf8d-23918112dc77`：17/17 通过。共享源库以只读事务复制受影响会话及完整 schema/triggers 到私有库，14,688,256 字节，757 条 transcript 事件。原生 SessionManager 先复现索引重建错误，候选三次等待 1179 / 2263 / 1057 ms 后读回完全相同的 742 条历史消息；原始事件数和 SHA 不变，没有模型或工具调用。共享 PID/runtime/config 保持不变。

实际输入 SHA256 `5ac0ee8238ecf6710fbfcc92cf0cc70c687eb0fe986bb30d10172960cb5783b4` 与合并后的全部测试/support/overlay 输入一致。精确文件 hash 和副本证据见 [候选记录](subagent-completion-projection.evidence.json)。组合 e 的部署源提交为 `24ad9998da030cfafb51089b6c1a62d43ea73793`，artifact SHA `a465dd0a42bea1e8b040373de17cc51399179e7c335bf05bca92130c8054149e`。

## 前序失败与运行影响

- 初轮 b/c：旧群双子任务最终汇总可见，但仍出现 yield 误报，未验收，均正式回滚。
- d：实际 native attempt 投影已有凭据，但 final meta 与 Worker adapter 均丢失字段；误报仍出现，还记录一次 `session-entry.patch` 并发版本冲突。未确认该轮最终汇总成功，22:36 正式回滚。最终 e 的跨进程回归专门覆盖此遗漏。
- 首次完整数据库备份约 7.3 GB，叠加候选 runtime 副本耗尽共享磁盘，21:59:49 发生一次 Workboard recovery 磁盘满错误。停止本任务备份，runner 清理自己的临时目录后恢复约 7.7 GB 可用空间。改为受影响会话的定向副本；22:04 health 和 22:06 真实飞书普通回复均恢复。没有清理其他任务数据。
- 21:14–21:18 SSH 曾超时，21:57 恢复；未改网络配置，也未使用公网 SSH。部署前全量 parity 核对 18,812 文件 ALIGNED。

共享验收须同时证明实际子任务命令输出、两条通知进入父会话、最终群回复独立读回、没有错误提示或重复最终消息。通过后保存 artifact 对应证据，再按共享流程回滚基线并释放 lease；生产推广另按授权执行。

## 共享真实渠道验收（22:42–22:47）

两轮双子任务分别覆盖立即完成、B 延迟 8 秒完成；父会话均在第一条通知后再次 yield，再收到第二条结果。五个子任务的真实 exec 命令及输出逐条核对，单子任务与普通消息也通过。飞书独立读回最终消息，每种场景只有一条正确回复，没有错误 continuation 提示或重复最终消息。

| 场景 | 最终消息 ID |
| --- | --- |
| 双子任务立即完成 | `om_x100b6217cf7794acce9c7c9360a363e` |
| 双子任务延迟完成 | `om_x100b6217cb52a8a0cf37149591a566d` |
| 单子任务 | `om_x100b6217c77a44a0ce41a575f234a03` |
| 普通消息 | `om_x100b6217c34bbcacb0f88ab08853376` |

结束时注册表保留 35 行，运行中 0，待收尾 0，无需通知的待收尾 0。health 为 ok，事件循环未降级。最终轮日志没有 projection error、可见 yield 误报、session-entry.patch 版本冲突或磁盘满。

仍观察到两条中途 yield 对应的 `visible_reply_missing` 后台诊断、一次 2 秒 abort-settle 超时及一次远端 node probe 超时；后续结果均实际送达。这里证明本次通知链路和积压场景通过，不代表清除了所有后台诊断，也不证明生产 Night Shift 峰值负载已解决。完整可复核摘要、五条实际输出、输入/读回 hash 见 [共享验收记录](subagent-completion-projection.integration.json)。

22:50 正式 rollback 已完成：恢复 `voice-batch-shared-20261016e`，完整 runtime SHA `a9578e93ea3b86d50b48e4b8ca561394cba8424fa87e7200e3fb3d8fada544b3` 与部署前基线一致，pending 为 null，状态数据保留，health ok（54 ms）。该版本的共享验收凭据保留，生产未部署。
integration lease 已释放；其他候选可按流程取得租约后继续。
