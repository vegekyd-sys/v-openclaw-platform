# 会话记录索引预检不再在写锁里全表扫描（2026-10-08）

## 问题

V 上 `sessions.transcript-index.preflight`（Gateway 主进程，makaron 库）在 Agent DB 写事务里同步执行：

- `deleteOrphanedTranscriptIndexRowsInTransaction`：三条 `DELETE … WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)`。`session_transcript_fts` 的 `session_id` 是 `UNINDEXED`，只能整表读 FTS 内容表。
- `listSessionsNeedingTranscriptIndexReconcile`。

10/08 V 文件日志里 ≥1 s 的持锁 11 次，最长 9975 / 10166 / 9275 ms，后两次打断聊天（`Agent DB process coordinator wait exceeded 5000ms`，用户看到「deepseek 请求失败」）。reconcile 结束时的 `orphan-sweep` 是同一个函数。

上游：9.5、9.8 是同一写法（9.8 只是挪进 worker 执行，仍在 IMMEDIATE 事务里）；main 上 #165090（10/04）改成 `EXCEPT` 集合比较，仍在写事务里扫描。没有配置开关。

## 改动

`lab/patch-transcript-index-preflight.mjs` → `lab/release-files/transcript-index-preflight/session-transcript-reconcile-j5qhAafV.js`（以 V 当前字节 `e95bb26a…` 为底，含 gpt-live 的改动）。

1. 一个临时 worker 线程用自己的只读连接、在一个读事务里读出：各索引表里 transcript 已不存在的 session（state、active 走主键 `NOT EXISTS`；FTS 整表读一次，按 session 收集 rowid，再逐 session 查 transcript 是否存在），以及原生 `listSessionsNeedingTranscriptIndexReconcile` 的结果（从同一个 chunk 导入）。不持写锁，也不占 Gateway 主线程。
2. 没有孤立行（常态）：不开写事务。
3. 有孤立行：按 session 分块写事务，每个事务先复核该 session 仍无 transcript，再按键删除，每表每次最多 512 行（active 用 rowid 子查询、FTS 按 rowid + session_id、state 按主键）。
4. worker 起不来或读失败：记 warn，退回原来的写事务内清理，结果不变。
5. reconcile 结束时的 orphan-sweep 走同一路径（不算重建判断）。

语义与原逻辑一致：`session_id` 为 NULL 的 FTS 行保留（`NOT IN` 对 NULL 不删）；孤立行不影响重建判断（重建判断只看有 transcript 的会话），所以先读后删与原来事务内「先删后判」等价。

## 证据

本地：`node --test lab/transcript-index-preflight.test.mjs`，8/8。原版 chunk 作为 oracle（桩 index chunk 带原生 SQL），覆盖：会话窗口被删（级联后只剩 FTS）、transcript 被清空（state+FTS）、外键关闭写入的 active/state/FTS 幽灵行、跨多块的大孤立 session、NULL owner、三种需要重建（flag / 水位落后 / 未分类事件）、删除前 transcript 复活、只读扫描失败回退。变异检查：去掉 FTS 孤立判定后等价测试失败。

VLab candidate（`lab/candidate/transcript-index-preflight.plan.json`，makaron 库副本 7.2 GB，真实 runtime 的 index chunk / node:sqlite / worker_threads；只替换 Agent DB 句柄、会话写队列、进程租约三个邻居，写事务计时 = 持锁）：

| 场景 | 原版持锁 | 补丁持锁 | 补丁主线程最大停顿 |
|---|---|---|---|
| 植入孤立行（5 session / 1229 行），冷缓存 | 18 670 ms（1 个事务） | 最长 12.2 ms（7 个事务） | 98 ms |
| 常态无孤立行，冷缓存 ×2 | 4 519 / 4 446 ms | 0（不开写事务） | 8–12 ms（worker 读 4.8–5.1 s） |
| 常态，热缓存 ×3 | 107–124 ms | 0 | 8–9 ms（worker 共约 630 ms） |
| 有会话需要重建 | 770 ms，启动 reconcile worker | 0，启动 reconcile worker | 8 ms |

等价：原版（事务内取摘要后回滚）与补丁版（提交）处理后 active / FTS / state 三表摘要相同（`7681b48e…`，131407 / 39048 / 4099 行），剩余孤立行 0。candidate `candidate-e5336fe3-2dc3-4f94-9db6-27bde2beb873`。

改动前分项（`lab/candidate/transcript-index-preflight-probe.mjs`，candidate `candidate-636ae7e7-…`，冷缓存）：FTS 删除 3.4–3.6 s、active 1.0–1.2 s、state 0.3 s、重建判断 0.4 s；原版整体 4.3–4.6 s。

V 的库比 VLab 大（约 12 GB），线上冷缓存 10 s 与此一致。

## 未覆盖

- 真实 `runOpenClawAgentWriteTransaction` / db91 完整性门与进程租约（测试里换成了直通桩，因为用真句柄打开 7 GB 副本要先跑完整性校验）。上 V 后看文件日志里 `sessions.transcript-index.preflight` 的 `slow SQLite transaction hold` 是否消失，以及 `orphans removed` 的 info 日志。
- 每次预检起一个 worker 线程（热缓存约 630 ms CPU、在主线程之外），频率等于原预检频率。
