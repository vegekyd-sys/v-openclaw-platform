# 子代理查询不再整表读会话库（subagent-lazy-session-store-v1）

2026-10-17 CST。接 `docs/gateway-freeze-20261016.md`（10/16 Gateway 冻结，PR #402）。

## 问题

V 在 10/17 00:42–01:22 抓了一份 Gateway 主线程 CPU profile（2406 s，1 ms 采样）：

- 主线程忙了 793 s，其中 GC 150 s。
- 有 310 s 花在 `listSessionEntriesReadOnly → loadSessionEntrySnapshot`：把 `session_nodes` 全部 3,909 行、245 MB 的 `entry_json` 读出来，再逐条 JSON 解析，一次 5–8 s。
- 每次都重新解析，因为 `projection === "full"` 不走会话条目缓存（`session-accessor.sqlite-transcript-state-Cz9g7S9v.js:252`）。

真正只需要少数几个 key 的调用方：

| 调用方 | 触发时机 | 耗时 |
|---|---|---|
| `subagent-capabilities` 的 `readSubagentSessionStore` | 每个插件 harness 回合准备工具权限时（`preparePluginHarnessParams → resolveConversationCapabilityProfile → resolveRequesterToolPolicies`）；用来算子代理深度和读取父子信封 | 170 s |
| `subagent-completion-admission.store` 的 `loadSubagentSessionEntry` | 每个子代理结束清理时 | 73 s |

后果：
- 这些读取占住主线程，Codex 进程检查因此超过 deadline，/vds 回合失败。
- 产生的大量垃圾把堆推到 4.6–6.9 GB；堆被换出后，完整 GC 冻结 50–70 s。swap 的问题由 PR #402 兜底。

## 改动

改了 3 个 core dist 分块，before 哈希都是 V 线上字节：

| 分块 | before | after |
|---|---|---|
| `session-accessor.sqlite-entry-BlklNPKQ.js` | `6b12190c…669d96b` | `a15b1426…e1da7d7` |
| 同上，叠在 PR #403 之上 | `ba3e8dbb…f096a99e84` | `bcfbdde7…b5b4fd8fd41d4` |
| `subagent-capabilities-CPAHEjL-.js` | `76ac1cc6…4135a68` | `4ee0a32e…19753695b` |
| `subagent-completion-admission.store-JmpNDYTF.js` | `ee0d42e6…8e8a73` | `c106a6ce…bad48c43` |

**新增 `createSessionEntryLookupReadOnly(scope)`**，返回一个只读的、按 key 读取的会话视图：
- `store[key]`：只读这一行，用上游精确读取的同一个读取器（`readExactSessionEntryRowValidated`，full 投影）。过滤规则与整表读取相同：隐藏 internal session-effects key，拒绝非规范的投递 key。读过的结果在视图存活期间保留。
- 按 sessionId 查找：走 `session_nodes.current_session_id` 索引，仍然逐条核对 `entry.sessionId`。
- 遍历整个视图（`Object.keys/values/entries`、展开等）：退回一次整表读取，结果与原来完全一致。
- 出错时：所有查找返回空，等同原来 try/catch 返回 `{}`。
- 开关：`OPENCLAW_V_SUBAGENT_LAZY_STORE=0` 恢复整表读取。

`readSubagentSessionStore` 和 `loadSubagentSessionEntry` 改用这个视图；`findSubagentSessionEntryById` 遇到这个视图时走索引查找。

文件：
- 补丁：`lab/patch-subagent-lazy-session-store.mjs`
- 构建：`lab/build-subagent-lazy-session-store.mjs`
- 发布 plan：`lab/subagent-lazy-session-store.plan.json`

## 验证

数据：共享 VLab 会话库副本，4,265 行、163 MB（`lab/candidate/subagent-lazy-store.mjs`）。

**等价性。** 7 个函数（深度、能力、是否子代理信封、持久化信封、继承的 deny、继承的 allow、完成条目）在 156 个样本上运行，输出摘要 A、B 完全相同。样本包括 100 个普通 key、全部子代理 key，以及合成的未命中样例（未知 key、拿 sessionId 当 key、其他 agent 的 key）。B 版里，视图与整表读取逐 key 比较，4,289 个 key 0 差异；按 id 查找 0 差异；整体枚举一致。

**耗时**（每次调用，中位 / 最长）：

| | 原版（candidate-a6e4c958） | 补丁（candidate-d0fd82f7） |
|---|---|---|
| 主会话深度 | 1,447 / 2,189 ms | 1 / 2 ms |
| 子代理能力 | 1,644 / 2,034 ms | 2 / 5 ms |
| 子代理持久化信封 | 1,729 / 1,963 ms | 1 / 2 ms |
| 子代理完成条目 | 1,546 / 2,021 ms | 1 / 2 ms |

## 未处理

- `sessions.list`（28 s / 40 min）可能由 PR #403 处理。
- cron 的 `sweepCronRunSessions` / `resolveCronSession`（22 s / 40 min）还是整表读取。
- 夜班看板 `readCards`：每次 7–8 s。
- 投影重建期间回合直接失败：原生代码只有子代理完成通知（`waitForSubagentCompletionProjection`）和 GPT-Live 语音会在回合开始前等投影；普通回合和媒体完成唤醒回合不等。这是下一步。
