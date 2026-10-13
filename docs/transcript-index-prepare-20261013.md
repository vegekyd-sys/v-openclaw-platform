# 会话投影重建（transcript-index.prepare）提速（2026-10-13）

## 结论先说

- `sessions.transcript-index.prepare` **不在 Gateway 主线程上**。它唯一的调用点在 reconcile worker 线程（`config/sessions/session-transcript-reconcile.worker.js`），是一个只读 DEFERRED 事务，走独立连接，不占写锁。文件日志里 pid 和 Gateway 相同，是因为 worker 线程同进程。所以 PR 评估（#356）里「主线程最大卡顿源」这个判断要更正。
- 它的代价是间接的。会话投影被标脏后，到 prepare 和写回完成之前这段时间（下称「标脏窗口」）：
  1. 新回合在调模型前会在 `waitForSessionTranscriptProjection` 里等投影就绪，最多 15 s，直接加在首字上。
  2. `withCurrentProjectionSnapshot` 类读取报 ProjectionUnavailable；context window read（#286）退回主线程整段读。
  3. 每次 prepare 之前，worker 用**写入路径**打开数据库：新线程的校验缓存是空的，所以每次都要在 `BEGIN IMMEDIATE` 里跑一遍 `ensureAgentSchema`（无标签）。这一步会占住全进程的写锁。
- 本 PR 做两件事，都在 VLab candidate 上用 V 规模会话做了 A/B，结果逐项一致：
  - worker 改为只读打开，回移上游 2026.9.5 #138585 的做法：消除 prepare 前的写事务。
  - 投影重建每行只读一遍：prepare 3.2 s → 1.7 s，标脏窗口（也就是紧接着来的回合要等的时间）8.3 s → 5.1 s。

## V 证据（只读，文件日志 /tmp/openclaw/openclaw-2026-10-1{2,3}*.log）

- prepare 慢事务：
  - 10/12 00:00–22:18 CST：217 次，合计 587 s，最长 11.9 s。
  - 10/12 22:18–10/13 16:10：104 次，合计 296 s，最长 21.1 s（数字来自 PR 评估）。
- 活跃的大会话每约 10 s 重建一次。例如 10/13 16:43–17:07，每次 2–8 s。
- 本次统计 10/12 16:00–10/13 17:15 共 287 次 prepare，其中 **264 次**开始前紧挨一条无标签的慢写事务（`database` 与 `operation` 都缺省）：同 pid，结束时刻与 prepare 开始相差 ≤0.6 s，持锁 p50 1161 ms、最长 4232 ms。这条写事务就是 worker 打开数据库时跑的 `ensureAgentSchema`（见下文 A/B 中 A 的 `worker:immediate:null`）。
- liveness 停顿（事件循环延迟、心跳超时）大多和 prepare 对不上，与「prepare 跑在 worker 线程」一致。

## 链路

1. 投影被标脏的来源：旁路追加（channel 回复审计记录 `appendMode: "side"`）、leaf 控制、parentId 不是当前 leaf、`message-rewrite` 改写等。原生追加器 `createTranscriptIndexAppenderInTransaction` 会写 `needs_rebuild=1`，然后在提交后调度 `startSessionTranscriptIndexReconcile`。会话 ≤4000 行且 ≤4 MB 时在写事务里同步重建，更大的会话交给后台处理。
2. 后台重建流程（`reconcileSessionTranscriptIndexesAsProcessOwner`）：
   1. 预检（#285，只读 worker）；
   2. 起 reconcile worker 线程：打开库 → `listSessionsNeedingTranscriptIndexReconcile` → 每个会话跑一次 `prepareSessionTranscriptProjection`；
   3. 主线程分块写回：claim → delete-chunk → active-chunk → fts-chunk → finalize。
3. 与已上线 PR 的关系：
   - #285 只改了预检（读出孤立行 / 是否需要重建），没碰 prepare。
   - #315 让 mirror-facts 在标脏期间改查 identity 表。它是绕开标脏窗口，没有缩短窗口。
   - #286 的 context window read 在 `index-not-current` 时退回整段读，标脏窗口越长，回退越多。
   - 本 PR 缩短的正是这个窗口。
4. 上游情况：
   - 2026.9.5 起 reconcile worker 改用 `openOpenClawAgentDatabaseReadOnly`（#138585，2026-09-04），本 PR 回移的就是这个思路。
   - prepare 的两遍读算法在 9.5、9.8、main 上都没变。
   - side append 在 main 上仍会标脏。
   - 没有配置开关。

## 改动（dist 补丁，底本 = V 字节 = 上游 2026.9.1 原版，10/13 在 V 上核对）

| 文件 | V sha256 | 补丁后 | 改了什么 |
|---|---|---|---|
| `config/sessions/session-transcript-reconcile.worker.js` | `9e676169…` | `95b9ddcd…` | 先 claim 同一个 agent 库 lease，再开只读连接，检查 user_version=19 和 schema owner，用完释放 lease。claim 失败、版本不对或 owner 不对时，回退原来的 `openOpenClawAgentDatabase`，结果不变。 |
| `session-transcript-index-9itOio9h.js` | `ae034fcf…` | `5504f5de…` | `visitSessionTranscriptProjection` 在建树那一遍同时记下每行的 FTS 条目、是否投影、是否带 message、context eligibility；第二遍沿可见路径直接取这些结果，不再逐行回库查询、重新 parse。 |

- 补丁器：`lab/patch-transcript-reconcile-readonly.mjs`、`lab/patch-transcript-projection-single-pass.mjs`，锚点各恰好命中一次。
- 构建：`node lab/build-transcript-index-prepare.mjs`，输入 `lab/fixtures/transcript-index-prepare/`，输出 `lab/release-files/transcript-index-prepare/` 和 `lab/transcript-index-prepare-plan.json`。

## 证据

### 本地单测（`node --test lab/transcript-index-prepare.test.mjs`，4/4）

- release 文件 = 补丁器作用于 V 字节；重复打补丁会报错。
- **等价性**：以原版 chunk 为准，与补丁版一起跑真实的 transcript-tree，Kysely→SQLite 用一个小替身执行相同查询。覆盖以下场景，`prepare` 输出逐项 deepEqual：
  - 线性会话；
  - 旁路追加；
  - 回退分支（leaf 控制）；
  - leaf 指向 null；
  - 无 parentId 的旧记录；
  - 非法 leaf 控制；
  - 3000 行混合会话（含离开可见路径的分支、toolResult 图片、excludeFromContext）；
  - 空会话 / 不存在的会话。
- **变异检查**：改 contextEligible、messagePosition、可见路径过滤，三处任何一处都会让等价测试失败。
- 补丁版对每个会话只迭代一次、不再准备逐行查询；原版是 1 次迭代 + 逐行查询。
- worker 验证：
  - 补丁版走只读连接（写入失败），lease 成对，原写入路径从未调用；推给父线程的计划消息与原版相同。
  - schema 版本不对、owner 不对、claim 抛错时，都回退原路径。

### VLab candidate A/B（`lab/candidate/transcript-index-prepare.mjs`）

- **数据**：私有 makaron 库，来自共享 VLab 镜像（只读）。
  - 最大会话放大 5 倍并加入 view_image 形态的图片，得到 32,786 行 / 184 MB；
  - 另外 20 个最大的真实会话按原样复制；
  - 合计 21 会话、77,714 行、371 MB。
- **代码**：真实 runtime（与 V 同字节：node-sqlite b4516f85、agent-db 046d7a82、accessor 30c7b9d6、reconcile b63bdf05…），只替换本 PR 的两个文件。
- **变体**：
  - A = V 原版；
  - B = 本 PR；
  - C = 只改 worker 只读打开；
  - D = 只改单遍读。
- **流程**：
  - 每个子进程独立、各用一份库副本，按 A,B,C,D,A,B,C,D 交错，每次 6 轮；
  - 每轮写一条旁路回复审计记录（V 上 channel 回复写的就是这个），然后测量它引起的重建；
  - node-sqlite 探针记录每个事务（标签 / 模式 / 持锁含 commit / 所在线程）；
  - 主线程另有 5 ms 采样器，记录停顿及当时的事务和 GC。

主报告 candidate-28340059-8a9d-4f74-a975-28bf8f30bc4b（输入为提交 c1c3c8fa；receipt 的 dirty 标记只来自当时尚未提交的本文档），每个变体 12 轮：

| 每轮中位数 | A（V 原版） | C（只改只读打开） | D（只改单遍读） | B（本 PR） |
|---|---|---|---|---|
| 紧接着的回合在 `waitForSessionTranscriptProjection` 里的等待（= 标脏窗口） | 8256 ms | 7375 ms | 6191 ms | **5120 ms** |
| prepare（worker 读事务） | 3214 ms | 3636 ms | 1571 ms | **1709 ms** |
| worker 写事务合计 | 47 ms（含 agent 库无标签 IMMEDIATE） | 7 ms | 39 ms | **6 ms**（只剩 state 库 lease） |
| 主线程写回合计持锁 | 2020 ms | 1950 ms | 1849 ms | 1865 ms |
| 主线程最长单次持锁（最大值） | 104 ms（431） | 110 ms（570） | 110 ms（147） | 90 ms（133） |
| 主线程事件循环延迟最大值：中位 / p75 / 最大 | 102 / 150 / 157 | 137 / 216 / 571 | 116 / 124 / 148 | 109 / 144 / 196 |

- 另有两次独立的 A/B 运行（A B A B，各 8 轮）：candidate-5deedae9…、candidate-dd7b8114…（后者在干净提交 1ea79e3a 上）。等待 8145 / 8455 → 5218 / 6341 ms，prepare 3227 / 3325 → 1783 / 2105 ms，方向一致。
- **主线程停顿**：所有 ≥40 ms 的停顿，都落在主线程的原生写回事务上（主要是 delete-chunk，按 `session_id` 删 FTS，要扫整张 FTS 表）。这段代码本 PR 没有动。
  - 离群值（431 ms、570 ms、某次 687 ms）在 A 和 C 里同样出现，是 VLab IO 抖动；
  - 前两次运行里 B 的延迟中位数略高，在 12 轮交错样本中不复现（B 109 对 A 102，p75 B 更低）；
  - 主线程 GC 没有 ≥10 ms 的。
- **机制**：A 每轮有一次 worker 线程对 agent 库的无标签 IMMEDIATE 写事务（`worker:immediate:null`，与 V 日志里 `database`/`operation` 缺省的那条相同），B 和 C 里都没有。私有库只有 371 MB，这个事务在这里只要 41–54 ms；在 V 的 12 GB 库上是 p50 1161 ms。收益大小以 V 日志为准。
- **普通回合不受影响**（每个变体 40 次，沿活跃分支用 `appendTranscriptMessageSync` 追加）：
  - 单次追加中位数 A 6–7 ms / B 6–8 ms；
  - 两边都没有触发任何 prepare，投影保持最新。
- 同步重建（4 个小会话，在写事务里）：A 153–186 ms，B 99–186 ms，在噪声范围内。
- 全部 21 个会话后台重建：A 16.5–18.4 s → B 10.9–13.6 s。
- **等价性**：每次运行结束后，所有子进程（含 C、D）的 21 个会话 active / FTS / state（不含 updated_at）摘要都相同（`0f539f3f…`）。

### 补丁不该影响、也确实没影响的

- 主线程写回的事务数（173）、合计持锁、事件循环延迟：在噪声范围内相同。
- 普通追加路径（前向索引）：代码没动，实测相同。

## 是否需要重启

需要（按惯例 promote-to-v 之后 v-self-restart）。
- worker 侧（只读打开 + prepare 一遍读）：reconcile worker 线程每次新起都会从磁盘加载模块，文件替换后的下一次重建就生效。
- 主线程上的同步重建（小会话）：要等重启。

新旧两种状态混跑没问题：父线程和 worker 之间的消息协议没变。

## 与其他未上线 PR 的冲突

本 PR 的两个文件，没有其他 open PR 改动（10/13 `gh pr list` 核对过）；PR 评估第 7 节的同文件冲突清单里也没有它们。

## 没解决、留作后续

- 标脏本身：旁路回复审计、改写等事件仍然触发整段重建（上游 main 也一样）。要改成前向索引，得先证明结果和整段重建一致。
- 主线程写回：184 MB 会话每次重建约 1.9 s，分 173 个事务。其中 delete-chunk 按 `session_id` 删 FTS，`session_id` 在 FTS 里是 UNINDEXED 列，每块都要扫整张 FTS 表；V 的表更大，单块代价会更高。
- 上线后判据：
  - V 文件日志里，prepare 之前的无标签慢写事务应当消失；
  - prepare 单次耗时下降；
  - 「projection unavailable」等待次数下降。
