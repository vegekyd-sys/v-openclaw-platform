# 30–40 会话并发：首字归因工具（2026-11-18）

报告：`docs/experiments/concurrency-40-sessions-20261118.md`。全部只读。

| 文件 | 在哪跑 | 作用 |
|---|---|---|
| `codex-log-collector.mjs` | V，openclaw 用户，`nice -n 19 ionice -c3` | 每 90 s 从共享 Codex app-server 的 `codex-home/logs_2.sqlite`（只留约 14 分钟）增量抄出时间和类别（不抄内容）；每 15 s 采 Gateway 主线程和 app-server CPU。参数：`<codexHome> <outDir> <hours> <gatewayPid>` |
| `codex-join.mjs` | V，openclaw 用户 | 线程 → 会话（state 库 thread-bindings → agent 库 `current_session_id`），把 `[firsttext-e2e.1]` 聊天记录和 Codex 回合对上，输出每条聊天的分段和每次模型请求的时间 |
| `journal-buckets.py` | 本机 | journald 导出（gz）按时段 / 夜班在跑回合数分组：首次可见、分发→开始跑、开始跑→首次可见、liveness、RPC |
| `mainthread-regress.py` | 本机 | Gateway 主线程 CPU 对事件数的最小二乘回归，估计夜班份额 |

注意：logs_2.sqlite 的 WAL 很大，读事务要短；采集器按 id 增量查、每次几百毫秒。
