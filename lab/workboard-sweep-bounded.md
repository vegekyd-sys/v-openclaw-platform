# workboard-sweep-bounded：lifecycle 巡检不再整读会话和卡片

Status: candidate only (2026-10-26). Not merged, not on shared VLab, not on V. The V export used below was
read-only and has been deleted from V.

## 现象

V 上 Gateway 主线程大约每 64 s 卡一次，`liveness heartbeat delayed: overdue≈2.3–6.5 s`。来源是 workboard 插件的
`workboard-lifecycle-sync`（`createWorkboardLifecycleService` 的 `reconcile`）。

V 10/26 14:49 的 CPU profile（`/tmp/gw-prof/gw-1449.cpuprofile`，140 s）里有两次巡检：

| 巡检 | 主线程连续占用 | 主要组成 |
|---|---|---|
| 每分钟增量（`activeMinutes`） | 2.7 s | `listVisibleSessions` 1.96 s，其中 store_load 整读 makaron 会话 1.5 s、subagent 索引 0.33 s、participants 0.27 s；`listLifecycleLinks` 0.28 s |
| 每 10 分钟全量 | 9.0 s | store_load 1.6 s、`buildGatewaySessionRow` 建 1 万行完整行 2.1 s、`readCards → store.list()` 整读卡片和 11 张子表 1.8 s（`loadCardChildRows` 0.9 s）、GC 1.9 s |

另有 `/status` 的 `loadSubagentRegistryFromSqlite` 1 s，不属于巡检，本次未改。

## 原因（读完整条链路后的结论）

- **会话侧**：巡检调 `sessions.list`（`lifecycleOnly: true`，增量时带 `activeMinutes`）。handler 先 `loadCombinedSessionStoreForGatewayCore`
  读整个会话库，`activeMinutes` 过滤在 `filterSessionEntries` 里才生效。whole-store entry 缓存以 `data_version` 判有效，V 上任何连接一写就失效，
  所以每分钟都是冷读 1 万行（约 600 MB entry JSON）。最后留下的只有约 9 行（V 10/26 16:55：最近 2 分钟 9 行，10 分钟 16 行）。
- 全量巡检对每个会话都走 `buildGatewaySessionRow`，算模型、thinking、用量、ACP 等投影，而巡检只读 key / updatedAt / status / hasActiveRun / abortedLastRun。
  #418 的 `lifecycleOnly` 只跳过了共享解析和 placement，没有跳过行投影。
- **卡片侧**：只要有卡关联会话（V 上一直如此），`cards` 先为空。全量巡检或增量匹配超过 64 张时，`cardIds = undefined`，
  `readCards()` 走 `store.list()`，读出全部卡片和全部子表（V：12,051 张卡、198,441 条事件）。真正用到的只有父行字段，外加状态栅栏要的一条事件。
- brief 里的推测有一半成立：增量巡检读卡片其实已经是按 id 读（匹配数 ≤ 64）；每分钟 2.7 s 的大头在会话侧，不在卡片侧。
- 「终态卡不需要对账」**不成立**：`lifecycleSyncPatch` 对 done 卡仍可能改 `execution.status`、清 stale、更新关联（只是不改 `status`）。
  所以本补丁不排除任何卡，只让读取有界，对账语义不变。
- 没有官方开关：巡检周期、全量周期、`HYDRATE_LIMIT` 都是常量；上游 9.5 fork 的这段代码与 9.1 相同。

## 改动（`lab/patch-workboard-sweep-bounded.mjs`，6 个 dist 文件，基线 = V 线上字节 `v2026.9.1-db91.6-sessions-search-20261026`）

1. `v-session-entries-matching.mjs`（#475 的模块）：`match.updatedSince` 走 `idx_agent_session_nodes_updated_at` 取 `updated_at >= cutoff` 的 key，
   再加上 `entry_valid = 0` 的行（走部分索引；写入方还没校验的行，列值可能落后）。读行用整库读同一套列、解析器和 participants 投影。
   依据：写入方 `bindSessionNode` 用 `entry.updatedAt` 投影 `updated_at`；V 上 5 个库 10,046 行逐行核对，列值与 entry 全部一致，`entry_valid` 全为 1。
2. `sessions-read-C6mAMxyQ.js`：`lifecycleOnly` 且没有可见性过滤（与 #418 的条件相同）时：
   - 带 `activeMinutes` 的读取只取窗口内的行（比 selection 自己的 cutoff 多留 1 分钟余量，selection 照旧再过滤一遍）；
   - 行由 `listSessionLifecycleRowsFromStore` 生成；
   - 这种结果不进 completed 缓存（和 visibilityRowsOnly 同理，行里没有判过期要的字段）。
3. `session-utils-list-BUP03AzS.js`：`listSessionLifecycleRowsFromStore`，selection 与 `listSessionsFromStoreAsync` 相同，status 推导与
   `buildGatewaySessionRow` 逐字相同（同一个 row context 和时钟）。行里只有 key / agentId / updatedAt / sessionId / abortedLastRun / status。
   hasActiveRun 和 running 状态仍由 sessions.list 的 active-run 标记补上，那一步读 sessionId 和 agentId。
4. `sqlite-store-CH-caj1l.js`：
   - `listLifecycleStates()` 只读未归档卡的父行，构造方式与 `readCard` 一致，不带 notes、labels 和子表；
   - `lifecycleStatusTransition(id, status)` 用一条索引查询取出 `latestStatusTransitionAt` 会读的那条事件；
   - `listLifecycleSweepLinks()` 即 `listLifecycleLinks` 加窄 automation。巡检只读 automation 的 `boardId`、`launch`、`workspace`，
     由 SQLite 用 `->` 取出这三个键的 JSON 文本，不在 JS 里解析每张卡约 1.8 KB 的完整 automation（V 共 22 MB）。
     automation 不是 JSON 对象的行（非法 JSON 或别的 JSON 值）退回原解析。states 也用同一套列。
5. `runtime-api-1CCazqtv.js`：store 包装与 `WorkboardStore.listLifecycleStates()`，排序与 `list()` 相同（`compareCards`，先按 created_at, id）。
6. `extensions/workboard/index.js`：巡检读 links 改用 `listLifecycleSweepLinks`；原来要整读卡片的地方（全量巡检，或增量匹配超过 64 张），改成在 lifecycle state 上做 no-op 判定：
   - state 没有事件，状态栅栏 `shouldSkipPersistedLifecycleStatusUpdate` 永远不跳过，所以判定只会多放行、不会漏；
   - 放行的卡如果没有 `lifecycleStatusSourceUpdatedAt`，补上那一条事件再判一次，结果就等于完整卡片的判定；
   - 仍然放行的卡交给原样的 `syncLifecycle`（读当前完整卡片 + CAS）；
   - worktree 清理改为整读 worktree 卡（清理候选只可能是这些卡；V 上为 0 张）。

`OPENCLAW_V_WORKBOARD_SWEEP_BOUNDED=0` 关闭全部改动（sessions-read 两处、index.js 两处）。

## 验证

数据：V 10/26 17:01 CST 只读导出（workboard `.backup`；makaron、v-codex、xiaoai、dealclaw、short-v 的 session_nodes /
session_windows / session_participants / session_transcript_index_state / session_progress_cards；state 库 subagent_runs）。
共 12,056 张卡（6,082 张未归档，5,590 张关联会话）、10,090 个会话、9,436 条 subagent 记录。经 tailnet 传到 VLab 后，V 上的导出已删除。
两臂：before 是 V 字节（由 release 文件反补丁得到，sha256 等于 plan 的 `before`），after 是 release 文件，同一进程、同一份数据、同一时钟。
数字全部来自 VLab（vlab91），机器比 V 慢约 1.5–2 倍。原始数字见 `workboard-sweep-bounded-results-20261026.json`（只有计数和耗时）。

文中的 commit（ed447481、03848fa1、8d6dab2d）是压缩前的 WIP 提交，没有推送。release 文件按 sha256 对应：Part S 和 Part G 测的 6 个文件与本 PR 的完全相同。
Part W 测的版本只有 `session-utils-list-BUP03AzS.js` 与本 PR 不同（后来加了单行 subagent 索引），Part W 不用这个文件。

### Part W：真实 lifecycle 区段 + 真实 WorkboardStore（`candidate/workboard-sweep-bounded-ab.mjs`，candidate-d0db6bc6，commit ed447481）

每个场景两臂各用一份 V 库副本，最终全部卡片（只剔除本次新写入子行的随机 UUID）逐字节一致，每轮变更数也一致：

| 场景 | 两臂变更数 | before 每轮 ms | after 每轮 ms |
|---|---|---|---|
| V 快照：全量 1 次 + 稳态全量 3 次 | 0 | 5,228 / 4,999 / 4,998 / 5,047 | 645 / 601 / 628 / 732 |
| 扰动 ×3（600 个关联会话改成 running / stale / failed / done / aborted / 消失），全量 + 稳态 | 497 / 489 / 510，之后 0 | 12,813–13,749，稳态 4,925–5,038 | 4,188–4,436，稳态 617–798 |
| prepared launch 8 张（一半被活跃 run 证明），快照完整 | 4（另 4 张走 failPreparedLaunch） | 8,724 | 715 |
| 增量，匹配 > 64 张 | 22 | 10,102 | 862 |
| 增量，匹配 ≤ 64 张（这条路径代码未改） | 2 | 711 | 531 |

after 的读取次数：`entries()` 0 次（before 每轮 1–2 次）；`lifecycleStatusTransition` 每轮 7–9 次（稳态），扰动时与放行的卡数相当（503 / 495 / 516）。
扰动轮里剩下的约 4 s 是 500 次真实的 `syncLifecycle` 写入，两臂相同。V 上平时一轮改 0–几张卡。

逐行核对窄读取：`listLifecycleSweepLinks` 和 `listLifecycleLinks` 的 12,056 行，`listLifecycleStates` 和 `list()` 的 6,082 张未归档卡，
在巡检读的字段上全部一致。耗时：links 460 → 374 ms；整读卡片 4,887 ms → states 223 ms。

### Part S：sessions.list 的行（同一 candidate 脚本，candidate-6d305b53，commit 03848fa1；最终 commit 之后会话侧文件未再变）

before 是 V 的 `listSessionsFromStoreAsync` 加整库读；after 是 `listSessionLifecycleRowsFromStore` 加有界读。
每次计时前从另一条连接写一次，让 entry 缓存像 V 上一样失效。比对的字段是 key / updatedAt / status / abortedLastRun / sessionId / agentId，14 组全部逐行一致：

| 情形 | 行数 | before ms（分配 MB） | after ms（分配 MB） |
|---|---|---|---|
| 全量（10 分钟巡检） | 9,949 | 5,461（805） | 2,896（418） |
| activeMinutes 1 / 2 / 3（每分钟巡检） | 5 / 8 / 11 | 2,889–3,048（396–451） | 35–47（2.4–3.8） |
| activeMinutes 10 / 60 / 1440 | 17 / 40 / 216 | 3,115 / 2,958 / 2,998（≈400） | 55 / 97 / 176（5–25） |
| activeMinutes 10080 / 43200 | 5,375 / 9,578 | 4,137 / 4,698 | 1,646 / 2,831 |
| activeMinutes 2，时钟 +90 s | 4 | 3,022 | 36 |

### Part G：私有 Gateway，真实巡检节奏（`candidate/workboard-sweep-bounded-gateway.mjs`，candidate-ecc4bbef，commit 8d6dab2d，tree 干净）

两臂各起一个私有 Gateway（渠道和 cron 关闭，同一份 V 数据的全新副本，`--inspect`），抓 13 分钟 CPU profile。
期间每分钟改 8 个关联卡片的会话 label，接近 V 的写入频率（V 10/26 16:55：最近 2 分钟 9 个会话有更新）。
巡检时间按调用栈里含巡检函数的样本统计（同一段内 20 s 内的连续占用算一轮）。

| | 每分钟增量（11–12 轮） | 10 分钟全量 |
|---|---|---|
| before 巡检 CPU | 1.38–2.12 s，中位 1.67 s | 15.1 / 15.2 s（主线程连续占用 15.9 / 26.4 s） |
| after 巡检 CPU | 0.49–0.92 s，中位 0.75 s | 1.69 s（连续占用 2.66 s） |
| before 最长连续占用 | 1.76–2.84 s，中位 2.26 s | |
| after 最长连续占用 | 0.70–2.36 s，中位 1.15 s | |

after 那几次 1.5–2.4 s 的连续占用里，非巡检部分主要是 harness 自己每分钟改 label 的写入（`sessions.patch → readLabelOwnerKeys`），它和巡检都是 60 s 一次，正好落进同一段。V 上没有这种写入。
after 每分钟巡检剩下的：`listLifecycleSweepLinks` 0.33–0.48 s，单行 subagent 索引 0.2–0.4 s，有界会话读取不到 0.1 s。

两臂都在同一 Gateway 内，把 sessions.list 按巡检参数带和不带 `lifecycleOnly` 各调一次，比对巡检读的字段，全部逐行一致：

| activeMinutes | 行数 | before：普通 / lifecycleOnly ms | after：普通 / lifecycleOnly ms |
|---|---|---|---|
| 无（全量） | 9,949 | 20,687 / 7,815 | 16,177 / 1,634 |
| 2 | 5 | 4,424 / 3,769 | 5,230 / 127 |
| 60 | 5 | 3,911 / 4,337 | 5,175 / 92 |
| 1440 | 209 | 1,235 / 1,162 | 2,848 / 1,996 |
| 100000 | 9,861 | 11,726 / 8,552 | 13,140 / 16,576 |

（后两行 lifecycleOnly 不比普通快：行数超过 64，走全量 subagent 索引，而且当时正赶上同一 Gateway 的其他工作。巡检实际只用前三种情形。）
两臂都没有 workboard lifecycle sync/recovery failed、TypeError、ReferenceError 或 unexpected property。
私有状态缺 codex 插件，两臂都把它关掉了。VLab 同时有别人的 candidate 在跑，绝对数字有噪声，两臂是先后连着跑的。

### 推到 V

V 原 profile 和 VLab before 臂对比：增量 V 2.7 s 对 VLab 1.8–2.8 s，全量 V 9 s 对 VLab 15–26 s，说明 V 比 VLab 快约 1.5–2 倍。
据此估计 V 上：每分钟巡检约 0.3–0.5 s（原 2.7 s），10 分钟全量约 1–1.5 s（原 9 s）。上线后要用 profile 实测。

## 没覆盖 / 后续

- 10 分钟全量巡检仍要整读会话库的 list 投影（V 约 1 万行）。要再降，需要让巡检按卡片的会话 key 定向读，并且仍能判断快照是否完整。
- 每分钟巡检剩下的大头是读 1.2 万张卡的父行（含已归档的 6 千张）。归档卡只用于找 worktree 清理候选，可以单独再收窄。
- V 的会话库有 10,350 行，但巡检全量 listing 过滤后（排除已归档、cron 等）是 9,949 行（10/26 导出），仍低于 `limit 10000`，所以 `complete` 目前为 true。一旦超过 1 万，`complete` 会变成 false：最旧的会话会掉出全量巡检，prepared launch 的失败判定也不再触发。这是现有行为，本补丁不改。
- 没有在共享 VLab 上集成验收，也没有上 V。

单测（`workboard-sweep-bounded.test.mjs`，离线）：
- plan 与字节一致，patch(V) 等于 release 文件；
- 每处改动都在开关后面；
- 在 3,000 张卡的随机事件历史上，`lifecycleStatusTransition` 的 SQL 等于 V 的 `latestStatusTransitionAt`；
- 2 万组随机卡片和输入：无事件的 state 判定是完整卡片判定的超集，补上那条事件后两者相等；
- SQLite 取出的 automation 三个键等于 `JSON.parse` 的结果（null、缺失、非对象、非法 JSON、大整数、小数）。
