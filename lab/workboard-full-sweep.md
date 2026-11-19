# workboard-full-sweep：Workboard 每 10 分钟的全量巡检不再卡 Gateway 主线程

Status: candidate only (2026-11-17). Not merged, not on shared VLab, not on V.

## 现象

V 的 Gateway 主线程约每 613 秒停 6–9 秒（`journalctl -u openclaw-gateway`：`liveness heartbeat delayed: overdue=…`）。
2026-11-17 的时刻：19:49:12、19:59:26、20:09:39、20:19:53、20:30:05、20:40:17、20:50:31、21:00:43，各 7.7–8.8 s。
几周前约 3 s，随会话数增长（V 现在 makaron 22,922 个会话，其中 20,441 个是 Workboard 子会话）。

## 原因

来源是 Workboard 插件的 `workboard-lifecycle-sync`：每 60 s 一轮，距上次全量 ≥600 s 就做一次全量，调
`sessions.list { limit: 10000, configuredAgentsOnly, lifecycleOnly, includeGlobal: false, includeUnknown }`（不带 activeMinutes）。
#487（workboard-sweep-bounded）只让每分钟那轮按 `updatedSince` 读窗口，全量这轮仍然：

1. `loadCombinedSessionStoreForGatewayCore` 读整个会话库的 list 投影：每行在 SQLite 里 json_valid / json_type / json_remove，
   再在 JS 里 JSON.parse（V：2.1 GB entry JSON）；
2. 行数超过 64，`listSessionLifecycleRowsFromStore` 建整库的子 agent 索引，读 `subagent_runs` 的 session-list 投影（V：22,033 行，263 MB payload）。

V 17:05 的 CPU 剖析（本机 `~/.cache/v-watch/prof/gw-prof-claude-20261117.cpuprofile`）里那段 12 s 忙段：
`listVisibleSessions` 49%（其中 store_load 39.6%、子 agent 索引 7.5%）、由此引起的 GC 12.6%、Workboard 自己的 reconcile 6.7%，
其余是同一时段里无关的工作（placement 巡检、typebox 校验等）。调用来自定时器，不是外部 RPC。

## 为什么不是另外两个方向

- **按卡片关联的 key 定向读（方向 A）**：V 上未归档卡 18,294 张，关联会话 17,654 个，其中 17,095 个现存——2.29 万会话里要读 1.7 万，省不了多少。
- **只读列（方向 B）**：巡检在 entry 上读的字段里，`archivedAt / sessionId / updatedAt / pinnedAt / status` 都有列，但 `abortedLastRun` 没有。
  V 上只有 14 行是 true（全是 status=killed），可 1,823 行带这个键，判断它就得读 JSON：V 上 `instr` 扫一遍 3.2 s、`json_extract` 3.2 s（ionice/nice 下），
  主线程照样卡。没有可靠的「行变了」信号可以缓存（`entry_valid` 在同一事务里被写回 1；长度不能证明没变）。

所以选择：**数据和读取代码都不变，换线程**。

## 改动（`lab/patch-workboard-full-sweep.mjs`，6 个 dist 文件 + 1 个新文件，before = V 线上字节）

只对「lifecycleOnly、不带 activeMinutes、参数只有 Workboard 全量巡检那几个」的 `sessions.list` 生效：

1. `combined-store-gateway`：把 `loadCombinedSessionStoreForGatewayCore` 里读 durable 库的循环原样抽成 `mergeDurableGatewayStores`。
   `readCombinedLifecycleSnapshotInWorker` 在主线程解析出 durable targets，起一个一次性 worker（`v-session-lifecycle-snapshot-worker.mjs`），
   在 worker 里跑同一个循环（list 投影、同一套解析、规范 key 校验、lineage 解析），每条合并后的 entry 只保留合并之后会被读到的 12 个字段
   （`LIFECYCLE_SNAPSHOT_ENTRY_FIELDS`）；worker 也用只读连接打开主线程正在用的状态库，跑同一条 `subagent_runs` 查询。
   `loadCombinedSessionStoreForGatewayCore` 在 targets 相同时用这份结果代替循环；incognito 库、configured-agent 过滤照旧在主线程。
2. `session-accessor.sqlite-transcript-state`：导出本进程「已证明规范」的库路径（`assertCanonicalSqliteSessionKeysCurrent` 的路径缓存），
   worker 从同一份证明开始（仍会比对库里存的 main key），不会对整库再做一遍规范校验。
3. `subagent-registry.store.sqlite`：`loadSubagentSessionListRunsFromSqlite` / `readSubagentSessionListRows` 接受可选的数据库（默认仍是共享句柄）。
4. `subagent-registry-read`：`buildSubagentSessionListReadIndexFromPersisted`，用给定的持久化 run 加内存 registry 建索引，合并方式与 `getSubagentRunsSnapshot` 相同（内存覆盖持久化）。
5. `session-utils-list`：`buildSessionListRowMetadataContext` 可以接收现成的 subagentRuns 索引；`listSessionLifecycleRowsFromStore` 有 `persistedSubagentRuns` 时用它建。
6. `sessions-read`：上述那种请求先 await worker，再把 `durableSnapshot` 交给 store_load、把 `subagentRuns` 交给行。

失败一律回到原路径：worker 起不来、配置克隆失败、报错、退出、120 s 超时，记一条 warn
（`sessions.list lifecycle snapshot worker failed; reading on the main thread: …`），这一轮按原样在主线程读；
worker 里状态库读失败只是不带 subagentRuns，行照旧在主线程读。`OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER=0` 一键关闭（读环境变量，每次请求生效）。
每分钟那轮（带 activeMinutes）、其他任何 `sessions.list`、Workboard 插件本身都没有改。

## 语义等价

- 读的是同一份数据、同一段解析代码；主线程拿到的 entry 只是去掉了之后不会被读到的字段。保留字段是按带这组参数时
  `filterCombinedStoreToConfiguredAgents` → `filterSessionEntries` → 排序 → `listSessionLifecycleRowsFromStore`（含行分类、单行子 agent 索引）实际读的字段列出来的；
  其他会读更多字段的参数（search、label、spawnedBy、creatorId、ownerId、involving、includePeople、sortBy、archived…）都不走 worker。
- 规范 key 违规、重复 key 等异常：worker 里抛出 → 回到主线程原路径 → 原样抛出。
- 快照时序：原来 store 读和 subagent_runs 读本来就不在同一事务（中间隔 5 s）；现在两者都在 worker 里、略早几秒读，
  行与 active-run 标记仍在主线程用当时的内存状态算。这与「巡检早几秒开始」等价，内存里的 live run 仍然覆盖持久化记录。

## 验证

### V 规模 A/B（`lab/candidate/workboard-full-sweep-ab.mjs`，candidate-02f14630，vlab91）

数据：`v-scale-session-fixture.mjs` 生成 makaron 22,922 行（1.8 GB entry JSON，与 V 同量级），其中 198 行 aborted+killed、1,471 行 abortedLastRun=false、
215 行 failed、361 行 archived、10 行 pinned、7 行 running、5 行落在增量窗口；私有状态库 `subagent_runs` 按 V 扩到 22,033 行（ok 21,325 / error 593 / running 105）；
子进程内存 registry 里另放 2 个 live run 覆盖持久化的终态记录；3 个 tracked active run。每臂各一份副本，每次计时前另一连接改写 100 行。
直接调用真实 `sessions.list` handler，参数与 Workboard 全量/增量巡检完全相同。A = V 字节，B = release 文件。

| | A：全量 wall / 主线程最长阻塞 | B：全量 wall / 主线程最长阻塞 |
|---|---|---|
| 首次 | 6,394 / 6,395 ms | 7,556 / 774 ms |
| 稳态 ×4 | 5,400–5,418 / 5,400–5,418 ms | 7,391–7,717 / 651–690 ms |
| 增量（activeMinutes 2） | 10–20 ms | 8–14 ms |

- 返回内容：A 与 B 的全量、增量载荷逐字节相同（去掉 ts 后 sha256）；B 里 worker 路径与 `=0` 的主线程路径也相同。B 没有任何 fallback warn，5 次全量都走了 worker。
- 全量 10,000 行（totalCount 19,088，hasMore true），状态分布两臂相同（done 9,789 / failed 106 / killed+aborted 90 / killed 9 / 无状态 4 / running+active 1 / failed+aborted 1）。
- B 剩下的约 0.65 s（剖析）：selection + configured-agent 过滤 + 行约 0.43 s，用 worker 结果建子 agent 索引 40 ms，其余是消息反序列化。低于 liveness 的 1 s 告警阈值（`DEFAULT_LIVENESS_EVENT_LOOP_DELAY_WARN_MS`）。
- 代价：B 每次全量多约 3 s 进程 CPU（worker 加载模块图 + 在另一个核上读库），wall 时间多约 2 s（巡检本来就是后台的）；主线程堆采样增长 137 MB → 60 MB。
  整读产生的临时堆在 worker 的 isolate 里，worker 每次用完就 terminate。worker 的 RSS 峰值没有单独量。
- 前两轮（candidate-68ee75f9、candidate-2d488e11）：只把会话库挪进 worker 时 B 还剩 1.3–1.5 s，剖析显示其中 844 ms 是 `subagent_runs` 读，于是一并挪走；
  那两轮 A/B 摘要不一致分别来自测试脚本随机生成的 active run id、以及夹具里一行在两臂之间滑出 2 分钟窗口，脚本已改成确定性。

数字只有计数和耗时，见 `workboard-full-sweep-results-20261117.json`。VLab 比 V 慢约 1.5–2 倍（#487 的对比），按此估计 V 上全量那一轮主线程阻塞从 6–9 s 降到约 0.4–0.5 s。上线后要用 journalctl 的 liveness 行和 profile 实测。

### 单测

- 平台：`node --test lab/workboard-full-sweep.test.mjs`（6 项）：plan 与字节一致、patch(V)=release、unpatch(release)=V、与 #613 无文件重叠、开关与参数白名单、durable 循环与 V 逐字相同、
  保留字段等于行函数实际读的字段、子 agent 合并方式与 V 相同、worker 失败回传与只读打开。
- versa：`versa/port-workboard-full-sweep-20261117` @ `1d013cb6c39`（基于 #613 的 `3dfc7c4c4fb`）。新增 `sessions-read.lifecycle-snapshot.test.ts` 6 项
  （worker 结果与主线程结果相同；增量/带其他参数/非 lifecycle 不走 worker；配置不可克隆时回退且结果相同；只保留生命周期字段；真起 worker 线程读出的快照与进程内相同；规范证明的传递），
  `sessions-read*` 72/72、subagent registry 32/32、session-utils.subagent 31/31、canonical-key/conformance 50/50 通过；tsgo、oxlint 无新增问题。

## 上线

- 换 7 个 core dist 文件（6 个改 + `v-session-lifecycle-snapshot-worker.mjs` 新增），需要重启 Gateway。before 哈希 = V 当前字节；
  与今晚 #613（infer-latency）的 9 个文件没有重叠，所以 #613 上线后 before 不变。部署前按线上字节再核对一次。
- 上线后核对：`liveness heartbeat delayed` 不再每 ~613 s 出现；没有 `lifecycle snapshot worker failed`；Workboard 卡片状态照常推进（running/review/blocked/stale）。
- 回退：`OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER=0`（Gateway 环境，需重启进程生效），或按 plan 换回 before 字节。

## 没覆盖 / 观察到的现有问题（本补丁没有改）

- **全量巡检现在已经不完整**：V 上可列出的会话超过 `WORKBOARD_SESSION_SWEEP_LIMIT = 10000`（夹具 totalCount 19,088），所以 `complete` 一直是 false——
  prepared launch 的失败判定在全量巡检里不会触发，而且最旧的那部分会话（排在第 10,001 名之后）不再被全量巡检对账。是否要改，需要单独决定。
- V 上另有零星 1.2–1.5 s 的停顿（11/17 20:31、20:37、20:55），不在 613 s 周期上，来源没查；每分钟那轮仍要读 2.4 万张卡的父行（`listLifecycleSweepLinks`，#487 时 V 约 0.45 s）。
- 没有在私有 Gateway 里跑真实巡检节奏（#487 的 Part G 做法），没有在共享 VLab 集成验收，没有上 V。
