# 2026-10-15 V Gateway 主线程卡死、飞书消息进不来

- 时间：2026-10-15 21:05 前后开始，21:11–21:40 完全不可用。21:40 重启后，21:56–22:14 又发作一次。
- 影响：
  - 这段时间飞书消息都没有进入 agent，每条都在 5 分钟后报 `claim→adoption stalled`；21–22 时共 14 条。
  - 钉钉断线，夜班派卡超时。
  - 22:03 有一次 session 写入失败：临界区 5004 ms，与进程锁 5 s 的等待上限一致。
- 处置：
  - 21:40、22:14 两次重启。
  - 22:46 `session.maintenance.maxDiskBytes` 从 `32gb` 改为 `48gb` 并重启；文件 mtime 是 22:46:13。
  - 到写这份报告时，没有再复发。
- 调查：只读 V 上的现场和日志，没有压测、没有重启、没有改配置。现场在 `/root/incident-20261015-feishu-ingress-stall/`。

## 结论

**根因是 session 磁盘预算的 enforce 维护。** 存储的物理总量越过 `maxDiskBytes` 后，9.1 会做一轮「删一个归档 → checkpoint + incremental_vacuum → 重扫整个 sessions 目录（3 万个文件）」的循环。整轮循环都占着 makaron 的 session 写队列，而且永远降不到高水位，只能一直跑到重启。

- **写队列被一直占住**，所以：
  - 飞书入站写不了 session 元数据，过不了 adoption；
  - 夜班建不了会话；
  - 普通回合拿不到写锁。
- **主线程被扫描吃满**：每次扫描对每个文件调一次同步 `realpathSync`，加上 GC，ELU 约 0.99。这又让钉钉心跳之类的事件处理不过来。

另外三个怀疑方向的结论如下（证据在后面）：

- **ingress 重试**：是受害者，不是原因。ingress 表只有 14,564 行，事故期间每条只重试了 1 次。`drainOnce` 在两份 profile 里 10 s 内只占 22–31 ms。
- **日志脱敏**：在两份 profile 里实际只占约 10 ms。那条「3 s」是 profile 第 0 个样本的采样间隔造成的读数伪影。logger 这条脱敏路径以前从来没修过。Tianyi 记得的「修过」是 9/10 让 worker 计时日志绕开脱敏，那个修复在 V 上一直有效。
- **为什么是今天**：代码和流量都不是关键。按预算口径算的总量本来就贴着 32 GiB：sessions 目录 16.5 GB + agent 库 16.9 GB + WAL。库每天涨约 0.37 GB，再遇上 WAL 偏大，就越线了。10/12 16:00–18:30 有同样的特征，很可能是第一次越线。

## 时间线（CST）

| 时间 | 事件 | 来源 |
|---|---|---|
| 10/12 16:00–17:24 | ELU=1、liveness 告警、飞书 ingress stall 10 条；17:24、17:55 两次重启（哨兵注释里的「半小时没人得到回复」） | journal |
| 10/12 18:48 | 现存最老的 canonical 归档。更早的全部不见了，而 14 天的保留期本应留着它们 | `session_transcript_archives` |
| 10/15 13:01 | 发版重启（#372、#375、#377） | systemd |
| 10/15 21:05:16 | 最后一个新归档生成（一次会话删除或重置），lifecycle 提交带 force 触发预算检查 | 归档 `created_at` |
| 21:08:22 / 21:11:13 | 两次 session 写的临界区分别是 9.8 s 和 16.9 s（预算检查在写队列里做 reclaim 加全量测量） | 文件日志 session-sqlite |
| **21:11:30–21:41:13** | **30 分钟内没有任何一次 session 写完成**，此前每小时有十几次 | 文件日志 session-sqlite |
| 21:12 起 | liveness 告警 ELU 0.96–0.995；21:26 以后 active=0，仍然满负荷 | journal |
| 21:16:48 起 | 飞书每条消息 5 分钟后报 `claim→adoption stalled … handler-timeout`，21:16–21:34 共 8 条 | journal |
| 21:16 | 哨兵 `saturated` 告警，在开始后 5 分钟 | v-sentinel |
| 21:39:57 | 抓现场，CPU profile `gw-20261015-2140` | incident 目录 |
| 21:40:27 | 重启。内存里的检查状态清零 | systemd |
| 21:56:42–22:03:18 | 写入再次停止；22:03 一次 session 写入失败（5004 ms） | 文件日志 |
| 22:05 | CPU profile `gw-20261015-2206`：仍在 `pruneCanonical…` 里删归档 | incident 目录 |
| 22:14:38 | 重启 | systemd |
| 22:46:13 | `maxDiskBytes` 改为 `48gb` 并重启 | 配置 mtime |

## 证据

### 1. 两份 profile 的主体是 disk-budget

10 s 采样，第 0 个样本的间隔已扣除：

| | 21:39 | 22:05 |
|---|---|---|
| disk-budget `readSessionsDirFiles` 回调（含） | 4.9 s | 3.7 s |
| 其中 `realpathSync`（`resolveRealpathOrAbsolute`） | 3.4 s | 2.6 s |
| GC | 2.3 s | 1.4 s |
| `pruneCanonicalSessionTranscriptArchivesToHighWater` | 0.19 s | 2.2 s |
| 其中 `reclaimSqliteFreePages`（checkpoint + incremental_vacuum） | — | 1.7 s |
| `subagent-registry` 整表读取 | — | 0.5 s |
| ingress `drainOnce` | 0.03 s | 0.02 s |
| 日志脱敏（`redact-*`） | <0.01 s | 0.01 s |

- 两份都出现了 `pruneCanonical…`，22:05 那份里还能看到删除归档行的事务（`session-history-eviction-d5aiCsHS.js:825`）。
- 这个分支只有在「本轮开始时总量 > `maxDiskBytes`」的 enforce 路径里才会进入，不是 30 分钟一次的普通测量。

### 2. 预算口径与 V 的数值

`measureSessionPhysicalDiskUsage` 统计这几项：`agents/makaron/sessions` 顶层的普通文件、prompt blob、agent SQLite 主文件和 WAL。

| 项 | 10/15 22:30 |
|---|---|
| sessions 目录顶层文件 | 30,049 个，16.51 GB（其中 jsonl 4,257 个、trajectory 7,781 个、`.deleted.<紧凑时间戳>` 4,436 个等，绝大部分是 9 月以前的遗留） |
| prompt blob | 1,443 个，0.025 GB |
| `openclaw-agent.sqlite` | 16.91 GB（9/29 是 11 GB，约 +0.37 GB/天） |
| WAL | 实测 3 MB–274 MB 之间波动 |
| 合计 | 约 33.4–33.7 GB |
| `maxDiskBytes` `32gb` | 34.36e9（`parseByteSize` 按 GiB 换算），已用约 97–98% |
| 高水位（80%） | 27.49e9 |

- sessions 目录从 10/08 以后只新增 `.zst` 归档：10/12 137 MB、10/13 197 MB、10/14 224 MB。
- 全部 871 个 canonical 归档加起来只有 0.58 GB。所以只要一越线，enforce 永远到不了高水位，会按这个顺序一直执行下去：
  1. 删光 canonical 归档；
  2. 删 dash 时间戳的遗留归档（49 个；紧凑时间戳那 4,436 个不匹配，删不掉）；
  3. 逐个驱逐历史会话代：会归档，然后归档又被删掉。`preserveRecent` 没有配，所以只有当前代受保护。
- 每一项之后都要重扫 3 万个文件。在 V 上一项要 5–7 s，一轮要跑一个小时以上。

### 3. 写队列被整轮占住

`enforceSessionHistoryMaintenanceSerialized` 的调用方式是 `runExclusiveSqliteSessionWrite(resolved, () => pruneAllSessionTranscriptArchivesToHighWater(…))`，也就是在 per-agent 的 session 写队列里跑完整个清理。

- 同一个队列还承载 `recordInboundSessionMeta`、`patchSessionEntry` 和会话的创建、删除。
- 文件日志里的 `slow SQLite session write`（≥1 s 才记）在 21:11:30 之后整整 30 分钟一条都没有，21:41（重启后）才恢复。21:56:42 到 22:14 又一次中断。
- 队列里排着的写入永远等不到完成，所以既不会记 slow，也不会记 failed。

### 4. 触发频率

`kickSessionHistoryDiskBudgetMaintenance` 本来有 30 分钟节流，但有两个绕过节流的入口：

- 会话 reset/delete 的 lifecycle 提交带 `force: true`，会绕过节流；
- 一轮结束时如果有 `pendingForce`，会立刻再跑一轮。

夜班白天每小时删除或重置 10–60 个会话，所以在没越线的日子里，主线程也在反复做「扫 3 万个文件」的测量。这是平时 liveness 底噪的一部分。重启会清掉 `lastCheckAt`，所以重启后的第一次触发会立刻跑一轮；如果那时仍然越线，就会马上复发（21:56）。

## 四个方向的结论

### ① ingress 重试越积越多：否

- `channel_ingress_events` 共 14,564 行，全是 completed。payload 合计 58 KB，`max(attempts)` 为 125，出现在历史行上。
- 10/15 13:00 以后有 attempts 的 18 行都是 1 次。被 300 s 看门狗截断后，下一次就完成了。
- 重试设计：
  - `adoptionStallTimeoutMs` 300 s；
  - `maxAttempts` 8；
  - `deadLetterMinAgeMs` 24 h；
  - `drainOnce` 每轮 `listPending(limit:"all")` 加 `recoverStaleClaims`，表很小，开销很低。
- adoption 要等 handler 把消息送进会话。卡住的原因是上面说的写队列和主线程，不是 ingress 自身。
- 委托里提到「kysely-sync 8.5 s / 18.5 s、ingress-queue 8.6 s」：现场目录里的 `profile-summary.txt` 和两份 `.cpuprofile` 都不支持这组数字（`profile-summary.txt` 里排第一的是 disk-budget 5.4 s）。如果有第三份 profile，需要另行找出。
- 不需要修 ingress。监控上加了 stall 计数（见下文）。

### ② disk-budget 扫描：是，主因

修复见下一节。上游 10.1 到 main 已经按同样的思路重写了这部分：

- #167449、#168310：测量放进 worker 线程；
- #170913：forced 检查每分钟最多一次，耗尽后退避 30 分钟并告警一次；
- #170977、#171211：清理不再整轮占着写队列，每个删除或回收单元单独取 admission 并让出。

9/16 的事故是同一个循环（当时是 `maxDiskBytes` 默认 10 GB）。那次只是调大了阈值，代码里「先扫后比、每删一个重扫、整轮占写队列、主线程同步 realpath」都没有动。之后库从 11 GB 涨到 16.9 GB，又把阈值吃完了。

### ③ 日志脱敏：否，22:06 的「3 s」是读数伪影

- **为什么是伪影**：两份 profile 的第 0 个 timeDelta 分别是 3800 ms 和 3037 ms，正常间隔中位数是 1.07 ms。V 上写的 `prof2206.txt` 把这段空档算给了第一个样本，而第一个样本恰好落在 `redactRegisteredSecretValues` 里。去掉第 0 个样本后，22:05 那份里 `redact-*` 一共只有 10 ms。
- **调用来源**：不是 vlab-worker 的消息。是 Telegram 入站轮询 worker 的诊断行，链路为 `telegram-ingress-worker` → `monitor-polling` → `probe.logInfo` → subsystem logger。
- **「以前修过」是哪次**：
  - V 上 db91.1 到 db91.6 的 `secret-redaction-registry-BOLC6DkF.js`、`redact-Df68iObN.js`、`logger-Dj_CBJHF.js` 都是 9/04 的原始字节。git、PR、CHANGELOG、wiki 里都没有针对这条路径的补丁。
  - Tianyi 记得的应该是 9/10 Codex 的 `3783076e` / `33a53673`：worker 的 `[firsttext-worker-phases]` 计时行改用私有 `node:console`，绕开 OpenClaw logger 的脱敏。V 的 `worker/{index,worker,worker-pool}.mjs` 里仍有 `ocFirsttextMetricConsole`，没有被覆盖。那次修的是另一条路径。
  - 10/05 会话里的 `handleAgentEvent → redactSecrets` 只有约 9 ms，当时没有修。
- **registry 的机制**：
  - 最多登记 512 个值，按 LRU；
  - 登记新值会清掉 `firstChars` 和编译好的正则，重复登记不会；
  - 首字符预检几乎总会命中；
  - 结构化日志的每个字符串叶子都要扫一遍。
- **上游**：9.5 到 main 有一串脱敏性能修复（#170023 文件日志只在出口处脱敏、#170225 复用 matcher 等），V 一个都没回移。这次的数据不支持它是瓶颈，所以没有做补丁。

### ④ 为什么今天才卡

| | 10/12 | 10/13 | 10/14 | 10/15 |
|---|---|---|---|---|
| liveness warning（全天 / 17–22 时） | 38 / 27 | 33 / 20 | 21 / 11 | **46 / 41** |
| liveness heartbeat delayed | 250 / 144 | 225 / 67 | 176 / 69 | 240 / 140 |
| slow SQLite | 1644 / 989 | 1448 / 596 | 1280 / 473 | 1099 / 592 |
| 飞书 ingress stall（事件数） | **11** / 10 | 4 / 0 | 2 / 1 | **19** / 14 |
| memory pressure | 77 / 46 | 153 / 58 | 43 / 21 | 148 / 82 |

- 「heartbeat delayed」和 slow SQLite 这类底噪，10/15 并不比前几天高；10/12 更高。
- 真正突变的是 ingress stall 和持续满负荷，只出现在 10/12 和 10/15，形态完全相同。
- disk-budget 的运行次数：9.1 没有任何日志，这也是这次补丁加了结果日志的原因。只能用上面的 profile、写入中断和归档消失来间接证明。
- 登记的密钥数没有日志可查，脱敏又不在热点里，所以没有做对比。
- 今天的变更：
  - #372 history-image-e3、#375/#377 upstream-5xx fallback：改的是 embedded-agent 和 worker，与 Gateway 维护路径无关，profile 里也看不到它们；
  - luna 10:04–13:01：同上；
  - 13:01 的发版重启只是清掉了预算检查的节流状态。
- Codex 超大会话整读：memory pressure 偏高，GC 占 14–23%。它是放大器，正在另一条线处理（夜班监控会话）。

## 修复

### 止血（已在 V 上）

`maxDiskBytes: "48gb"`，上限 51.5e9，高水位 41.2e9。当前 33.3e9，占 65%。

- 按每天 +0.4 GB 估算，约 45 天后会再次越线。
- 在那之前要决定怎么处理 16.5 GB 的遗留 sessions 目录（见后续）。

### 代码补丁：disk-budget-stall-v1

PR 与本报告同分支。底本是 V 当前字节，`before` 已在 V 上核对：

| 文件 | V sha256 | 改动 |
|---|---|---|
| `disk-budget-BzLS0kmH.js` | `9e5c3708…` | ① 目录只做一次 realpath，文件不再逐个同步 realpath（readdir 已经排除了 symlink）；② 遗留归档按 16 个一批删，批与批之间释放写队列，一批只重测一次 |
| `session-history-eviction-d5aiCsHS.js` | `014136ce…` | ① canonical 归档按 16 个一批，一个 admission 内完成「删文件 + 删行」，回收（checkpoint + vacuum）单独一个 admission，中间 `setImmediate` 让出；测量放在写队列之外；用文件大小估算余量，避免多删；② forced 检查每分钟最多一次，多出来的合并成一个延后定时器；③ 一轮结束后仍超过 `maxDiskBytes` 就退避 30 分钟，并 warn 一次 `session history disk budget exhausted…`；④ 有删除时记一条 `session history disk-budget pass` |

**candidate A/B**：VLab，`lab/candidate/disk-budget-stall.mjs`。用真实 runtime 和真实 agent 库，sessions 目录放 3 万个稀疏文件。完整结果见 [disk-budget-stall-20261015.md](../evidence/disk-budget-stall-20261015.md)。

| 场景 | A（V 原字节） | B（补丁） |
|---|---|---|
| 越线但能清到高水位 | 83 s，扫描 33 次，realpath 99 万次，**写队列被占 78 s** | 5 s，扫描 4 次，写队列最长 2 ms；删的是同样 29 个最老归档 |
| 越线且清不到（V 10/15 的情形） | 156 s，扫描 59 次，**写队列被占 144 s** | 13 s，扫描 8 次，写队列最长 12 ms；同样删光 50 个 |
| 预算内，1 次/秒 force | 30 s 内扫描 13 次，ELU 0.51 | 30 s 内 1 次，60 s 后补 1 次，ELU 0.04 |
| 耗尽后继续触发 | 又跑 29 次扫描，写队列被占 67 s | 0 次，告警一次 |

**上线前提**：第二版不驱逐会话历史，越线时只删已删除或已重置会话的归档，删完就停下、告警并退避，所以不会丢失会话历史。V 当前是 warn 模式，Gateway 不会走到这段代码；它的作用是将来切回 enforce 时不再卡死。

### 监控（`scripts/v-sentinel/sentinel.py`，PR #384）

| 规则 | 条件 | 本次能提前多少 |
|---|---|---|
| `budget_near` | 每 10 分钟按同一口径测一次（V 上 0.63 s），≥ 90% `maxDiskBytes` | 10/12 之前几天就会报，32 GiB 下一直是 97–98% |
| `budget_over` | 超过 `maxDiskBytes` | 越线当时就报 |
| `budget_exhausted` | Gateway 打出新的 exhausted 告警行（需要先上补丁） | — |
| `ingress_stalled` | 3 分钟窗口内出现 `claim→adoption stalled` | 21:16:48 第一条时就报，和 `saturated` 同时 |
| 原有的 `saturated` | ELU ≥ 0.95 持续 ≥ 60 s，10 分钟内 3 次 | 21:16 已报过 |

## 根治（10/16 补充）

Tianyi 的约束：**不丢数据**，只能调大上限，不清理老数据。

V 的现状：
- 22:46 `maxDiskBytes` 改为 `48gb`。
- 23:03 按 Tianyi 的要求，主配置 `session.maintenance.mode` 改为 `warn`（重启 20261015-230233-58da；配置文件 mtime 是 23:55，备份 `/root/openclaw.json.before-warn-20261015`）。worker 那份配置原来就是 warn。

warn 模式的含义：
- Gateway 的磁盘预算检查直接返回：不扫描、不清理。这次的卡死不会再发生。
- **条目维护也一起停了**：`pruneAfter 14d`、`maxEntries 6000`、model-run 1 天清理都不再执行。会话和转录会一直留在库里，只有显式的删除或重置还会生成归档。

### 1. 增长来源（V 实测，只读，10/15 23:47–10/16 00:05）

**统计方法**：
- 按 rowid 分块，每块 4000 行，每块是一个独立的短读事务，块与块之间让出时间。全程 WAL 保持在 64 MB。
- 先前试过一次性的 `dbstat` 长读事务：12 分钟里 WAL 涨到 2.17 GB，已经中止，WAL 也回落了。**不要在 V 的库上开长读事务。**

**库文件大小的历史**：

| 时间（CST） | page_count × 4096 | 来源 |
|---|---|---|
| 9/29 17:25 | 10.87 GB | 监控会话当时的查询 |
| 10/13 15:39 | 16.19 GB | 另一个会话当时的 `ls` |
| 10/15 22:43 | 16.95 GB | 监控会话 |
| 10/16 00:00 | 17.08 GB | 本次 |

9/29 到 10/15 平均每天 **+0.375 GB**，freelist 只有 641 页。

**按表拆分**：dbstat 的页面大小，大表用 payload 合计。

| 类别 | 大小 | 说明 |
|---|---|---|
| **记忆索引** | **约 7.3 GB（43%）** | `memory_embedding_cache` 3.32 GB、`memory_index_chunks` 2.71 GB、向量表 0.70 GB、FTS 0.61 GB |
| 会话转录 `transcript_events` | 5.68 GB payload，加索引约 6.1 GB | 432k 条事件，4,667 个会话 |
| `trajectory_runtime_events` | 0.47 GB | 每天约 85 MB |
| `session_transcript_archives.archive_blob` | 0.58 GB | 与 sessions 目录里的 `.zst` 文件是**同一份内容存了两次** |
| `cache_entries`（`session-cost-usage-rollup-v2`） | 0.46 GB | 6,214 行 |
| session FTS 与其他 | 约 0.9 GB | |

**记忆索引为什么这么大**：
- 源文件只有 1,758 个、32 MB 文本，却被切成 34,851 个 chunk。
- chunk 的正文合计约 35 MB；**98.7% 的空间是 JSON 文本形式的 3072 维 embedding**，每条约 75 KB。
- 同一个向量存了三份：`memory_index_chunks.embedding`（JSON）、`memory_embedding_cache.embedding`（JSON）、vec 表（float32）。
- 这部分是存量大，增长不明显：chunk 数从 9 月底约 34.8k 到现在几乎没变。按天的统计反映的是行被访问时刷新的 `updated_at`，不是新增。
- 上游 main 的 schema 仍然是 `embedding TEXT`，没有现成修复可以回移。

**转录的每日增量**：按 `created_at` 统计仍在库里的事件，逻辑字节，单位 MB。

| 日期 | 合计 | 内嵌图片 | toolResult | assistant | user |
|---|---|---|---|---|---|
| 10/09 | 651 | 314 | 188 | 79 | 69 |
| 10/10 | 626 | 327 | 185 | 88 | 26 |
| 10/11 | 43 | 16 | 14 | 8 | 6 |
| 10/12 | 596 | 354 | 148 | 74 | 19 |
| 10/13 | 625 | 397 | 135 | 70 | 24 |
| 10/14 | 344 | 189 | 92 | 51 | 11 |
| 10/15 | 464 | 280 | 114 | 60 | 9 |

- 近 7 天平均每天 **478 MB**，其中 **59% 是内嵌的 base64 图片**。这些图片主要来自 `view_image` 工具结果，一张约 0.8–1.3 MB。
- 工具输出里最大的是 `exec`（654 MB）、`read`（325 MB）、`bash`（189 MB）。
- 10/08 之前的天数少，是因为那些会话已经被 14 天清理归档出库了。
- 体量最大的会话：飞书私聊 `ou_0674…` 242 MB（近 7 天 96 MB）、群 `oc_fab9…` 166 MB、群 `oc_8e44…` 156 MB。
- 夜班子 agent 会话单个约 25 MB。
- 「Codex 超大会话」在这张表里不单独突出。它的代价主要是整读时的 CPU，不是磁盘占用（由夜班监控会话另行跟踪）。

**sessions 目录（16.24 GB）**：
- 29,178 个遗留文件，修改时间都在 2026-05 到 09 月，迁到 SQLite 以后没有新增过。
- 另有 `.zst` 归档 871 个，0.58 GB。归档几乎全来自夜班子 agent 会话被删除，每天 114–339 个、约 0.2 GB；10/15 只有 20 个。
- 当前 SQLite 里有 38 个会话条目的 compaction checkpoint（pre/postCompaction.sessionFile）仍然指向遗留 jsonl，共 77 个文件、134.7 MB。没有条目的顶层 sessionFile 指向遗留文件。另外，871 个 `.zst` 是 canonical 归档，不属于遗留文件。不被引用、且 14 天未修改的文件共 29,079 个、15.78 GB（10/16 00:40 实测）。

### 2. 预计触线日期（48 GiB = 51.54e9）

起点：10/16 00:00，按预算口径实测 33.384e9，占 64.8%。

| 口径 | 每天增量 | 85% 线（43.81e9） | 100% 线 |
|---|---|---|---|
| A：库 +0.375 GB（9/29–10/15 实测）加归档文件 +0.15 GB（10/13–10/15 平均） | 0.53 GB | **11/04**（19.7 天） | **11/19**（34.3 天） |
| B：只算库（归档文件不再增长） | 0.375 GB | 11/12 | 12/03 |

- **建议按 A 规划**：85% 告警大约在 **11/04** 触发，**11/19** 前后到 48 GiB。
- **warn 模式的影响**：清理停了以后，原本会被归档出库的转录会留在库里，归档文件的增长会变慢。总增量估计仍在每天 0.45–0.55 GB，所以 A 是偏保守、也更接近实际的口径。
- **warn 模式下 100% 只是一条容量线**，越过它不会触发任何清理。真正的硬上限是根分区，目前剩 55 GB。按每天 0.53 GB 算约 100 天，还要扣掉其他目录的增长。

### 3. 不丢数据的减量方案

| # | 方案 | 能省多少 | 数据 | 工作量 | 风险 |
|---|---|---|---|---|---|
| 1 | **遗留 sessions 目录移到冷存储**：把 29,178 个 5–9 月的遗留文件移出 `sessions/`，打成 `tar.zst` 放到 `.openclaw/cold/`，并写一份清单。按运行时规则被引用的 77 个文件（compaction checkpoint）、会话 id 仍在库里的 22 个 trajectory.gz，以及全部 `.zst` canonical 归档都原地保留 | 预算 −16 GB；冷存储压缩后估计 3–5 GB（trajectory 和 jsonl 都是文本） | 不丢，可原样解压回去 | 小，半天：脚本 + candidate 校验 + 一次移动 | 低：运行时不再读这些文件，移动前要在 candidate 上核对引用。V 上动数据需要 Tianyi 批准 |
| 2 | **图片不内嵌**：`view_image` 等工具结果里的 base64 写入按内容寻址的媒体文件，转录里只留引用；读取时回填。history-image-e3 已经让旧图片不再发给模型 | 新增量 −59%，每天约 −0.28 GB；存量迁移后 −2–3 GB | 不丢，原字节保存在文件里 | 中到大：dist 补丁要覆盖写入路径、读取或回填路径（会话历史、Control UI、压缩、mirror-facts）以及迁移脚本 | 中：所有读转录的地方都要认识引用格式；上游没有现成实现 |
| 3 | **embedding 缓存设上限**：官方配置 `memory.search.cache.maxEntries` | 设为 5000 可释放约 2.9 GB 页面，库文件本身不会变小 | 不丢用户数据，缓存可以重算 | 小：只改配置，热生效待验证 | 低到中：重建索引时要重新调 Gemini（花钱、更慢） |
| 4 | **embedding 改为二进制存储**：`embedding TEXT`（JSON）改为 float32 BLOB | 记忆索引 6.7 GB 降到约 1.3 GB | 不丢 | 大：改 schema、迁移，要和上游分叉 | 高：上游 main 仍然是 TEXT，每次升级都要背着这个补丁 |
| 5 | **`outputDimensionality` 从 3072 降到 768**：官方配置 | 记忆索引约 −75% | 不丢源文件，但检索质量会变 | 中：全量重建索引，并用检索基准对比质量 | 中：需要先复现线上检索基准，再在同一口径下对比 |
| 6 | **归档只保留一份**：`.zst` 发布到文件后清掉 `archive_blob` | 每天约 −0.15 GB，存量 −0.58 GB | 不丢，文件里有 | 中 | 中：要确认 restore 和读归档的路径都能从文件读 |
| 7 | **旧会话冷热分离**：超过 N 天不活跃的会话，把转录导出成压缩归档并移出库，访问时再取回 | 视 N 而定 | 不丢 | 大：要做取回路径和 UI | 中到高 |

**建议顺序**：先做 1（立刻腾出 16 GB 预算并解决 3 万文件扫描），同时做 3（只改配置）；接着做 2（掐住每天最大的增量来源）。4 和 5 等 OpenClaw 升级时一起评估。

### 4. 代码修复的覆盖情况

| 要求 | 实现 |
|---|---|
| 删不动就停下并报警，不无限循环 | 一轮结束后仍超 `maxDiskBytes` 就退避 30 分钟，只告警一次；会话的旧代历史不驱逐（`OPENCLAW_SESSION_BUDGET_EVICT_HISTORY=1` 才恢复上游行为）；forced 检查每分钟最多一次 |
| 去掉主线程上的同步 realpath | 每次扫描只对目录做一次异步 realpath，不再逐文件 |
| 去掉全量重扫 | 一整轮只在开头和结尾各做一次全量扫描，批与批之间只重新 stat 库文件 |
| 监控 85% | #384：`DISK_BUDGET_WARN_RATIO = 0.85`，warn 模式下照样测量 |

注意：warn 模式下 Gateway 不会走到这段代码。补丁的价值在于将来切回 enforce 时的安全性，以及 worker 那份配置的行为。

## 后续（未做）

1. 冷存储迁移（方案 1）要先在 V 上动数据，需要 Tianyi 批准。
2. 图片外置（方案 2）需要单独立项。
3. 补丁仍然在主线程上做异步 stat（3 万次），上游已经挪进 worker 线程。如果后续回移 10.x 的 `disk-budget.worker`，这部分也能移出主线程。
4. 驱逐历史会话那一步仍然是每驱逐一个就测一次。只有在仍然越线时才会走到这里，有余量时不会触发。
