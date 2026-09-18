# Dreaming 03:00 卡顿：session 转录语料的同步全量列举

任务分支 `codex/dreaming-session-ingestion`，开发基线 dev `2113a1e57dcc04978c56ad5a4d35f579ad7bdc46`。
2026-09-18 21:03 CST 已合入 dev（`223db24`）并部署共享 VLab（release `dreaming-session-ingestion-v1`，accepted）。2026-09-18 21:32 CST 已上线生产 V（`scripts/deploy-dreaming-session-ingestion-production.sh`，备份 `*.predeploy-20260918-213202`）：Gateway 92 s 就绪、飞书 98 s 连上、29 个插件、重启后 liveness 告警 0；同一次重启激活了 PR #39 的 pruner，`last-prune.json` 现在如实报 `ok:false / outcome:no-central-store`。预启动脚本 `apply-feishu-steer91-prestart.mjs` 抛 "No reviewed Feishu 9.1 generation found" 是 9/17 重启时就有的老问题，不阻塞启动。**待验证：2026-09-19 03:00 生产 dreaming 的 eventLoopDelayMax 与 liveness 告警数（基线 137 s / 03:00–03:06 三个 narrative 超时）。**

## 现象（生产 V，2026-09-18 03:00）

- `03:00:04 memory-core: managed dreaming cron could not be reconciled (cron service unavailable)`，之后主线程 `03:00:05 → 03:02:22` 没有任何一行日志。
- `03:02:26 liveness warning: eventLoopDelayP99Ms=137573.2 eventLoopDelayMaxMs=137573.2 eventLoopUtilization=1`：一次 137 秒的同步阻塞。
- `03:02:57 memory pressure: level=critical reason=rss_growth rss=3.97 GiB heap=3.63 GiB rssGrowth=1.39 GiB windowMs=31156`。
- 三个 dreaming narrative run（light / rem / deep）全部 `Worker stream acknowledgement timed out`，memory-core 写入 fallback diary。
- 9/17 上午已把 `memory-host.events` 从 10000 行删到 1579 行（#35 的第 3 处），说明 plugin_state 的 COUNT 不是主因。

## 机制

dreaming sweep 对每个 workspace 依次跑 light、rem 两个 phase，每个 phase 都调用
`ingestSessionTranscriptSignals → collectSessionIngestionBatches`，后者对 workspace 下的每个 agent 调用
`listSessionTranscriptCorpusEntriesForAgentSync(agentId, { includeRetainedSqlite: true })`
（`memory-core-host-engine-sessions-CAnvQ_5o.js:204`）。这个函数完全同步、没有任何让出：

| 步骤 | 代码 | 生产规模 |
|---|---|---|
| `listSessionEntries`（projection `full`，`readSessionEntryCache` 对 full 永不缓存） | `:219` | session_nodes 2011 行 / 148 MB entry_json，逐行 JSON.parse |
| `listSessionTranscriptInstances(readConsistency: "latest")` 再整表加载一次，每条 `structuredClone` | `:225` | 同上 |
| `readdirSync` sessions 目录 + 每个归档文件 `realpathSync` / `statSync` | `:183`, `:233` | 29,178 个文件，其中 4,491 个归档 |
| 每个 session `readTranscriptContentRevisionSync`（transcript_events 聚合 + session_windows 各一条同步 SQL） | `:138`, `:162` | ≈2,000 个 session |

第 4 步的结果 `contentRevision` 在 `dreaming-phases` 与 `session-ingestion` 里零引用。

生产 workspace `/home/openclaw/makaron-openclaw/.openclaw-local/workspace` 下挂了 makaron、v-codex、hy-codex 三个 agent，另有 vspark、dealclaw、workspace-xiaoai 三个 workspace，所以一晚 = 2 phase × (3+1+1+1) = 12 次上述列举。

列举之后 `scanSessionIngestionSource` 对每个 interactive session 再做一次 `statSessionEntrySync`（同步 SQL），指纹变化的 session 用 `loadTranscriptEventsSync` 整份同步载入转录再逐行解析、脱敏。生产 ingestion 状态里跟踪了 1029 个 session、共 440 MB 转录，最大单个 28 MB，7 个超过 10 MB。这一层本轮没有改。

## VLab 复现（共享 db91-parity，2026-09-18 15:36 CST）

dist 三个相关 chunk 与生产 sha256 完全一致。数据：makaron 5264 个 session（生产 2011），sessions 目录 1114 个文件（生产 29,178）。

用 `openclaw cron run a2e895b2-94d9-492b-97cb-7fec087c27c9` 触发托管 dreaming 任务，同时用 inspector 采 CPU profile、每 5 秒打一次 `openclaw health --json`：

- 触发后约 3 分钟 `eventLoopUtilization=1`，`eventLoopDelayMaxMs` 依次 9185 / 12876 / 9387 / 6975 ms；健康 RPC 单次墙钟最高 12.4 s。
- `15:36:55 memory pressure: level=critical reason=rss_growth rss=2.53 GiB rssGrowth=1.91 GiB`，`15:37:56 rss=4.4 GiB heap=4.02 GiB`。
- 同样出现 `managed dreaming cron could not be reconciled (cron service unavailable)`。
- `15:39:33 dreaming promotion complete (workspaces=4 …)`。

CPU profile 按“最长连续非空闲段”切（`lab/…/profile-stretches.mjs`，样本间隔 2 ms）：

| 连续阻塞 | 时间点 | 归属 |
|---|---|---|
| 13.7 s | 触发后 +21 s | 72% `listSessionTranscriptCorpusEntriesForAgentSync`：36% `listSessionTranscriptInstances`、28% `listSqliteSessionEntriesFromDatabase`；self 里 `structuredClone` 19%、GC 17%、`parseSqliteSessionEntryRecord` 14% |
| 8.0 s | +109 s | 79% 同一函数（另一 agent/phase） |
| 11.6 s / 7.7 s | +157 s / +88 s | `runExclusiveSqliteSessionWrite` 内的 session 写入维护（同类整表 parse，不在本补丁范围） |
| 7.3 s | +181 s | `readSessionIdentityEvidenceBatch`（worker placement，同类整表加载，不在本补丁范围） |

单进程基准（同一份 VLab 数据，读取真实 runtime dist）：`listSessionEntries(full)` 与 `listSessionTranscriptInstances(latest)` 是大头，一次完整列举 7–8 s、堆增长约 1 GB；`includeContentRevision: false` 单独几乎不省时间（300 次 stats 查询 88 ms），说明大头是两次整表加载而不是逐 session 查询。第一次在新进程里打开 7.5 GB 的 agent 库要 281 s（`confirmOpenClawAgentDatabaseIntegrity`），但生产 03:00 没有 `slow OpenClaw agent database open` 日志，agent 库在 Gateway 里本来就是打开的，这个冷启动成本不在生产的 137 s 里。

## 补丁

`lab/patch-dreaming-session-ingestion.mjs`（锚点必须唯一命中，漂移即失败）；`lab/build-dreaming-session-ingestion.mjs` 从 `lab/fixtures/dreaming-session-ingestion-baseline/`（生产与 VLab 同字节）生成 `lab/release-files/` 与 `lab/dreaming-session-ingestion-plan.json`。

1. `memory-core-host-engine-sessions-CAnvQ_5o.js`：新增可选参数 `entryProjection: "list"`。
   - 用 `listSessionEntriesReadOnly({ projection: "list", clone: false })` 代替 `listSessionEntries`：SQL 层 `json_remove` 掉 `skillsSnapshot` / `systemPromptReport`（entry_json 的大头），并走进程级 session-entry 缓存（按 `PRAGMA data_version` + session_nodes 代数校验）。
   - 把 `projection: "list"` 透传给 `listSessionTranscriptInstances`，它的 `latest` 读不走缓存但只解析轻量 JSON，`structuredClone` 也随之变轻。
   - 语料只读 `sessionId / updatedAt / spawnedBy / parentSessionKey / heartbeatIsolatedBaseSessionKey`，都不在被去掉的两个字段里，也不在 `projectPluginSessionEntry` 剥离的私有字段里。不传该参数的调用方（memory 索引等）代码路径字节不变。
2. `dreaming-phases-C5ItPb99.js`：
   - `resolveDreamingSessionCorpusEntries(agentId, nowMs)`：同一个 sweep（light 与 rem 共用 `sweepNowMs`）每个 agent 只列举一次，新 sweep 的 `nowMs` 自动淘汰旧缓存，失败不缓存。
   - 列举参数改为 `{ includeRetainedSqlite: true, includeContentRevision: false, entryProjection: "list" }`。
   - session 扫描循环每 32 个 source `setImmediate` 让出一次。

语义变化只有一处：同一 sweep 的 rem phase 复用 light phase 的语料列表（相隔数秒），期间新建的 session 留到下一晚。

## 验证

- `node --test lab/dreaming-session-ingestion-build.test.mjs`：5/5 通过（fixture 即生产/VLab 字节、release 文件等于构建输出、重复打补丁与锚点漂移都被拒绝、非 dreaming 调用保持原调用）。
- A/B（VLab 主机独立进程、同一份共享 db91-parity 数据、baseline runtime 与 patched runtime 各跑 3 次，`lab/dreaming-corpus-ab.mjs`）：

| agent | 版本 | 语料条数 / 指纹 | 中位耗时 | 最长同步块 | 堆增长 |
|---|---|---|---|---|---|
| makaron | baseline | 6383 / `89bc3b81…ee60` | 7849 ms（7701 / 8324 / 7849） | 8319 ms | 1015 MB |
| makaron | patched | 6383 / `89bc3b81…ee60`（相同） | **2906 ms**（2906 / 2798 / 2907） | **2903 ms** | **83 MB** |

同一份数据、同一台机器、间隔 3 分钟。列举耗时 2.7 倍、最长同步块 2.9 倍、每次列举的堆垃圾 12 倍；加上每个 sweep 从 2 次列举减到 1 次，Gateway 内每个 agent 每晚的列举阻塞总量按 VLab 规模从约 16 s 降到约 3 s，垃圾从约 2 GB 降到 83 MB。剩下的 2.9 s 是 `listSessionTranscriptInstances(readConsistency: "latest")` 那次不走缓存的整表读，是下一步的目标。另一个副作用：patched 在新进程里第一次调用只用 3.8 s，因为它全程只用只读连接，不再触发写连接冷启动的 281 s 完整性校验。

指纹是每条语料的 `agentId, artifactKind, sessionFile, sessionId, sessionKind, transcriptSource, storePath, updatedAtMs, sessionKey, cron/dreaming 标记` 排序后的 sha256，`contentRevision` 除外。

- 候选通道（`node lab/vlab.mjs candidate … --plan lab/dreaming-session-ingestion.candidate.plan.json`，receipt `candidate-fa9c5227-a42c-443c-8371-a32e166a2209`）：在候选 runtime 上对 dealclaw / short-v / xiaoai 的在线 backup 副本跑 `tests/dreaming-session-ingestion-candidate.test.mjs`，4/4 通过，三个 agent 的语料条数（30 / 10 / 43）与指纹在 baseline 与 patched 之间完全一致，共享 Gateway PID 未变。makaron 7.5 GB 副本超出共享 VLab 剩余磁盘，等价性与耗时只能在共享原库上由上表给出。

## 共享 VLab 部署后对照（release `dreaming-session-ingestion-v1`，2026-09-18 21:03 CST）

Tianyi 批准合入 dev（`223db24`）后走 package → stage → deploy，Gateway PID 2826250 → 2893146，runtimeSha `891f4e9c…`，accepted=true。部署后 3 分钟再次 `openclaw cron run a2e895b2…`，同样的 inspector profile 与 5 秒健康探针：

| | 部署前（15:36，Gateway 已热） | 部署后（21:07，Gateway 刚重启、缓存冷） |
|---|---|---|
| dreaming 窗口（触发 → promotion complete） | 约 180 s | **83 s** |
| 窗口内 `eventLoopDelayMaxMs` 序列 | 9185 / 12876 / 9387 / 6975 | 6912 / 6556 / 5050 / 4408 / 5121 / 7277 / 4954 / 4293 |
| 窗口内 liveness warning | 1（degradedFor=77s）+ heartbeat delayed 7.4s | **0** |
| 同样 421 s profile 的 idle 占比 | 44% | 60% |
| 最长连续阻塞段 | 13.7 s，72% 在 `listSessionTranscriptCorpusEntriesForAgentSync` | 14.5 s，在 `runQueuedStoreWrite` 的 session 写入维护（整表 parse）；语料列举函数不再出现在任何前列阻塞段 |

剩下的 5–7 s 停顿来源（`docs/evidence/dreaming-vlab-after-cpu-stretches-20260918.txt`）：session 写入维护里 `listSqliteSessionEntriesFromDatabase` 整表 parse（14.5 s、8.8 s）、worker placement 的 `readSessionIdentityEvidenceBatch`（8.1 s）。都是同一类"整表同步加载"，不在本补丁范围。另外该实例在 dreaming 之外每约 60 秒有一次 3–5 s 的停顿（探针 21:09:47 / 21:10:46 / 21:11:48 / 21:12:47 / 21:13:47），部署前的探针尾段也有，与本补丁无关，值得单独查。

同一次重启顺带带上的：PR #39（hotset pruner 诚实报告）。生产磁盘上 `/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/prune-openclaw-session-hotset.mjs` 已是 PR 版本（sha `09d58196…`），它是 `ExecStartPre`，生产下次 Gateway 重启即生效；共享 VLab 的 db91-parity 单元没有这个 `ExecStartPre`，只有未运行的旧 `openclaw-vlab-gateway` 单元引用它，已把 `/srv/vlab/experiments/agent-worker-isolation-v1/prune-openclaw-session-hotset.mjs` 更新为 PR 版本（备份 `.pre-pr39-20260918`）。

## 覆盖边界

- 部署后对照跑在刚重启的 Gateway 上（缓存冷），部署前对照的 Gateway 是热的；方向上对补丁不利，结论仍成立。
- 生产的 137 s 里，本补丁只覆盖列举部分；变化 session 的整份转录同步加载、session 写入维护的整表 parse、worker placement 的整表加载都是同一类问题，各自另立。
- VLab 的 session 数比生产多，但 sessions 目录只有生产的 1/26，`readdirSync + realpathSync` 那一项在 VLab 上量不出来。

## 第二层（2026-09-19）：生产上线后 03:00 仍冻结 75 s

生产 9/19 03:00：最长冻结 137 s → 75 s（`host timing gap detected: process was frozen ~74949ms`），dreaming 窗口 8 min → 5 min，但 4 个 narrative run 仍 "Worker stream acknowledgement timed out"。

**否定的假设**：变化 session 的整份转录同步加载。只读探针（`transcript-cost-probe.mjs`，私有 node:sqlite 只读连接 + 运行时的 `redactSensitiveText`）把当晚重扫的 29 个 session / 55 MB 全部加载、解析、脱敏：load 292 ms、解析循环 613 ms、最长同步块 107 ms。不是它。

**真正的来源**（用 `profile-stacks.mjs` 按完整调用栈重切 VLab 补丁后 profile，`docs/evidence/dreaming-vlab-after-cpu-stretches-20260918.txt` 的同一份 profile）：

| 阻塞段 | 主要栈 |
|---|---|
| 14.5 s | `clearPluginOwnedSessionStores → cleanupPluginHostSessionStore → listSessionEntriesCore`（full 投影、逐行 parse、每个 agent store 一次）；`planSessionLifecycleArtifactCleanup → readSessionEntryStore`（全 parse）；GC 22% |
| 8.8 s | `runPendingMaintenance → applySessionEntryMaintenance`（`readSessionEntryStore` / `readSessionMaintenanceCapCandidates` / `cloneSessionEntry`） |
| 8.1 s | `createWorkerPlacementSessionEvidenceResolver → readSessionIdentityEvidenceBatch`；`listSessionEntriesReadOnly` full 投影 |

每个 narrative run 都走 `subagent.deleteSession` 两次（运行前后），每次 `cleanupSessionBeforeMutation → runPluginHostCleanup → clearPluginOwnedSessionStores` 对**每个 agent 的 store**整表加载只为找一个 key；run 结束再 `scrubDreamingNarrativeArtifacts` 做一次整表两读的 lifecycle 清理规划。生产 9 个 agent store、makaron 148 MB entry_json、一晚最多 12 个 narrative。

**补丁**（`lab/patch-session-store-hotpaths.mjs`，两个文件，生产与 VLab 同字节）：

1. `session-accessor-K0XuW6ln.js` `cleanupPluginHostSessionStore`：预扫描改 `projection: "list"`。谓词 `matchesPluginHostCleanupSession / hasPluginOwnedSessionState / hasPromotedSessionEntrySlot / isLockedHarnessSessionOwnedByPlugin` 只读 sessionId、pluginExtensions、pluginExtensionSlotKeys、pluginNextTurnInjections、promoted slot keys、modelSelectionLocked、agentHarnessId，不在被去掉的 skillsSnapshot / systemPromptReport 里；命中后的变更仍由 `patchSessionEntryCore` 重读全量。list 投影走进程缓存（data_version + session_nodes 代数校验），store 未变时不再 parse。
2. `dreaming-session-cleanup-CILX8EJS.js` `scrubDreamingNarrativeArtifacts`：每 agent 每 10 分钟最多跑一次（孤儿最小年龄本来就是 5 分钟，跳过的 scrub 由下一次补上）；带 `nowMs` 的显式调用不节流。

没动的：`applySessionEntryMaintenance` 的写后维护整表 parse（`session-accessor.sqlite-entry-BlklNPKQ.js` 在生产与 VLab 字节不同，不能一份补丁两边发）、worker placement 的 `readSessionIdentityEvidenceBatch`、`planSessionLifecycleArtifactCleanup` 自身的两次整表读（规划删除转录的代码，改动风险高，只靠节流减少次数）。

验证：`lab/session-store-hotpaths-build.test.mjs` 5/5（含用 stub 执行补丁后模块的节流行为测试）。
**共享 VLab 对照（release `session-store-hotpaths-v1`，2026-09-19 07:11 CST，dev `592a2b7`，accepted 但注明"未证明收益"）**：9.4 线 06:54 回滚后，等 Jev 线 candidate 12 分钟，07:07 stage/deploy（PID 2968572 → 2970259），重启后已顺手拉起 nightshift 镜像（24980 http 200）。同一 cron 手动触发：dreaming 窗口 97 s（第一层后 83 s，基线 180 s），`eventLoopDelayMaxMs` 最高 10.8 s，1 次 liveness warning（degradedFor=65s）。**这轮不可比**：整机同时被 gpt-live91（55% CPU）和 browser91（35% CPU）两个无关常驻进程压着，4 核只剩不到一核。

按完整调用栈切剩余 >7 s 的阻塞段（`docs/evidence/dreaming-vlab-layer2-after-cpu-stacks-20260919.txt`）：

| 阻塞段 | 主要栈 |
|---|---|
| 11.0 s | `applySessionEntryMaintenance`（写后维护：readSessionEntryStore / readSessionMaintenanceCapCandidates / cloneSessionEntry）20%；`planSessionLifecycleArtifactCleanup → readSessionEntryStore` 7%；GC 22% |
| 8.2 s | worker placement `readSessionIdentityEvidenceBatch` 逐行 parse 29%；lifecycle 删除路径 `readReferencedSessionIdsAfterTargetMutation` / `collectAdmissionProtectedSessionIds` / `deleteLifecycleTargetRows` 24% |
| 7.5 s | worker placement 22%；`cleanupPluginHostSessionStore`（已改 list 投影）仍 7%——dreaming 期间 worker 进程在写 session，data_version 变化让 list 缓存持续失效，仍要整表轻量 parse；plugin-state retention 7%；`loadGatewaySessionLookupStoreUncached` 6% |
| 7.2 s | worker placement 28% |

结论：第二层两处改动方向正确但量小，剩下的停顿是四个核心 session-store 调用方（写后维护、worker placement 证据读取、lifecycle 删除/清理规划、session lookup）各自"parse 全部 session_nodes"，在 dreaming 这种 worker 持续写入的窗口里缓存也救不了，要改成按 key/索引的定点查询而不是 dist 级补丁。**未上线生产**（生产仍是 `dreaming-session-ingestion-v1`），等 9/20 03:00 的生产 profile（定时器已装）再定第三层。


## 顺带发现（未处理）

- VLab 与生产的 dreaming narrative 结束时都有 `narrative session cleanup failed for … phase: cannot start a transaction within a transaction`。
- 生产 `memory-host.events` 会以 100–180 条/天重新顶回 10000 上限（#35 第 3 处）。
