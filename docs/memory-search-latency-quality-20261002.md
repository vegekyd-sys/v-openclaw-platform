# V memory_search：速度与质量（2026-10-02）

目标：V 上 memory_search 小于 2 秒，争取 1 秒内；同时让搜索质量跟上 9/27 之后重整理过的记忆结构。

## 结论

1. **质量的最大问题不是排序，是索引停了。** makaron 的记忆索引自 2026-09-28 00:32（trigram 重建）之后再没更新过：
   - 949 个已被 Librarian 归档、移走的文件（1,466 个片段）仍在被搜出来；
   - 90 个新文件（68 个项目页、9/28–10/02 的日志）搜不到；
   - 207 个改过的文件（其中 175 个项目页，包括 makaron、star-engine、nexus 的 main.md）搜到的是旧内容。

   原因：9/11 的 query-isolation 补丁让 memory_search 改用只读的 `search` manager，它不监听文件、搜索时也不同步。同步本来由 Gateway 里长驻的 default manager 负责（watcher + onSearch，`intervalMinutes: 0`）。补丁之后没有任何东西去跑 `openclaw memory index`。V 上 `memory status` 也显示 `dirty: true`，已索引 2,617 个文件，实际有效文件是 1,758 个。

2. **慢在固定开销，不在数据量。** V 低峰实测（48 条真实查询）p50 3.6 s，其中向量阶段 2.7 s。拆开看：
   - KNN 子进程每次启动都要 1.37 s，几乎全花在 import 用不到的模块上（9.1 打包把 foundation barrel、schema 入口、sqlite-runtime 留成了裸 side-effect import；上游 9.5 已用精简的 `memory-core-host-engine-knn` 入口修掉）。
   - V 的向量表还是旧版默认的 1024 条/块布局，KNN 查询要对 1,280 个候选逐个从 12.6 MB 的块里重新取向量算余弦。这一步在 V 上要 1.8 s，同样的查询在新布局（64 条/块，任何一次重建都会生成）上只要 0.34 s。不读向量的纯 vec0 扫描在 V 上只要 0.3 s。
   - query embedding（Gemini）要等关键词搜索做完才开始。Gemini embedding 本身 p50 0.5 s、p90 0.86 s，与模型无关，是这条链路的下限。
   - 线上真实分布（9/23–10/02）p50 7–9 s、p90 14–24 s，比低峰探针高，多出的部分来自繁忙时段争用和冷缓存（向量表碎片 3,313 段，9/19 compact 后只有 130 段）。

3. **剔除 `dreaming/`、`daily-session-review/` 不值得做。** 片段数少 47%，但速度只快约 0.1 s，盲评质量也没有提升（nDCG 0.601，对照全量 0.640，差异来自关键词统计带来的排序扰动，不是噪音命中）。不建议为此改 SCHEMA。

## 改动（分支 `claude/v-memory-search-perf-9ad6eb`）

| 文件 | 作用 |
|---|---|
| `lab/patch-memory-search-fast.mjs`、`lab/build-memory-search-fast.mjs` | 从 V 线上字节生成补丁（输入 sha 校验） |
| `lab/release-files/memory-search-fast/` | 三个补丁后的 dist 文件：KNN 子进程去掉 3 个裸 import；`search()` 先发 embedding 再跑关键词搜索 |
| `lab/candidate/memory-search-fast.{plan.json,test.mjs}` | 正式候选测试 |
| `scripts/v-memory-indexer.mjs`、`scripts/v-memory-indexer-run.py`、`systemd/v-memory-indexer.service`、`scripts/install-v-memory-indexer.sh` | 实时索引进程：在 Gateway 之外常驻，用 OpenClaw 原生的 watcher 同步变动的文件。node、dist、用户和环境都从 Gateway 的 systemd unit 解析（Gateway 停着也能用）；`--cli` 模式用同一套环境跑 OpenClaw CLI |

dist 补丁只改启动和并发顺序，不改排序；所有对照测试结果逐条一致。

## 证据

全部在 VLab 主机上，用 V 当前记忆的副本（2026-10-02 03:2x 只读导出 V 的记忆文件和 embedding 缓存，在私有目录 `/var/tmp/claude-memsearch-20261002` 里用 VLab runtime 重建索引，与 V 的 memory-core 代码逐字节相同）。

**延迟**（searchMs，不含 manager 打开；线上 Gateway 打开约 70 ms）

| 场景 | p50 | p90 |
|---|---|---|
| V 现状，低峰只读探针 | 3.63 s | 3.93 s |
| 副本（已同步、新布局），原代码 | 2.77 s | 3.44 s |
| 副本（已同步、新布局），补丁 | **1.59 s** | **2.17 s** |

上表后两行来自同一进程内的交错 A/B（每条查询原代码与补丁轮流跑，共 96 次），结果 96/96 逐条一致。补丁后各阶段中位数：关键词约 0.19 s（被 embedding 遮住）、embedding 约 0.5–0.8 s、向量约 0.5 s、合并约 0.24 s。

正式候选 `tmp/candidate/candidate-8e994631-789e-4ebc-8c09-fb02a3f2da17.json`（提交 `a1a9cc9`，4/4 通过，共享 VLab 未受影响）：
- 子进程启动 1,372 → 204 ms；
- KNN 结果逐行一致；
- 在共享 VLab 旧布局索引上，搜索中位数 3,512 → 2,016 ms，结果一致。

**质量**：48 条真实线上查询（9/23–10/02），各方案前 8 条结果合并去重后共 905 条，隐藏来源，按 0–3 打分（3 = 正中要找的页面）。

| 方案 | nDCG@8 | 第一条有用（≥2） | 前 5 条有用率 | 死链 |
|---|---|---|---|---|
| VLab 旧记忆（9/11 结构） | 0.323 | 40% | 23% | — |
| V 现状（索引停在 9/28） | 0.543 | 50% | 45% | 4% |
| **V 当前记忆，索引已同步** | **0.640** | **73%** | **54%** | 0% |
| 同步 + 剔除 dreaming/daily-session-review | 0.601 | 69% | 51% | 0% |

新结构本身比旧结构好得多（0.32 → 0.64）。但 V 现在只拿到了一部分好处，因为一半的新页面和新改动没进索引。旧记忆的分数还受时效影响：9/11 的数据里没有后来的事。

**实时同步**（副本，`v-memory-indexer` 常驻；同时跑一个每 200 ms 写一次的探针，模拟 Gateway 的 5 秒写租约）：

| 变动 | 能被搜到的时间 |
|---|---|
| 新建文件 | 2.8–3.0 s |
| 编辑文件 | 2.8–3.6 s |
| 删除或移走文件 | 2.2 s |
| 一次改 200 个文件 | 50 s 全部完成；写探针最长等待 0.74 s，没有超过 1 s |

进程常驻内存约 350 MB。代价集中在启动：完整性检查 2–4 分钟（V 上约 90 s），schema 步骤会持写锁 4–8.5 s。所以它不随 Gateway 重启，只在维护窗口里 Gateway 停着时启动一次。
- 进程外跑索引，是因为原生 watcher 原本跑在 Gateway 里，写库会卡住 Gateway 的事件循环（9/11 补丁正是为此把搜索改成只读）。
- 脱离插件宿主运行时，要手动给 memory-core 配置 plugin state store（`createPluginStateKeyedStore("memory-core")`，与宿主给的一样），否则文件一变，同步就会报 `dreaming SQLite state store is not configured`。
- 每 60 分钟再做一次全量对账，防止 inotify 事件丢失。

## 上 V 的步骤（Tianyi 2026-10-02 已批准；顺序：review → 合 dev → 从 dev 打包 → 部署）

1. **合入 dev**，从 dev 提交打包补丁：先在共享 VLab 上 stage、deploy、accept，再用 `scripts/promote-to-v.mjs` 装到 V（3 个 dist 文件；不重启，下次 Gateway 启动时生效）。`scripts/install-v-memory-indexer.sh v` 安装实时索引服务，只 enable 不启动。
2. **维护窗口**（低峰，约 25 分钟停机）：
   1. Gateway 在线时先做 `backup sqlite create --agent makaron`，留作回滚；
   2. 停 `openclaw-gateway-memory-snapshot.timer`（它 `Requires=` Gateway，会把 Gateway 拉起来），再停 Gateway；
   3. `python3 /opt/v-sentinel/v-memory-indexer-run.py --cli memory index --force --agent makaron`（9/28 实测 11 分钟）。不要包 `timeout`，否则会在提交阶段被杀掉回滚；
   4. `systemctl start v-memory-indexer`，等日志里出现 `indexer-startup` 那一行同步（启动时持写锁的那几秒落在停机期内）；
   5. 启动 Gateway（这次重启也让 dist 补丁生效）；恢复 snapshot timer、`openclaw-rtc-h5.service`。

   重建一次解决三件事：补上 9/28 之后的所有变动、换成新的 64 条/块布局（V 上省约 1.4 s）、消除碎片。不在 Gateway 运行时做，因为 9/28 那次在线 `--force` 锁库 5–6 分钟，丢了两条群消息。
3. **验收**：
   - `memory status --agent makaron` 不再 dirty，files 等于 eligible；
   - 在 memory 里写一个带唯一字符串的测试页，几秒内能用 memory_search 搜到，删掉后几秒内搜不到；
   - 用 `/root/claude-memsearch-20261002/probe.mjs` 跑同一组 48 条查询（只读、status purpose、间隔 3 s），看 searchMs；
   - 观察 1–2 天线上 toolResult 里的 `debug.searchMs` 分布（之前 p50 7–9 s），以及 `journalctl -u v-memory-indexer` 里有没有 `sync-failed`。

**V 上的预期**：低峰 p50 约 1.3–1.6 s（V 的 CPU 比 VLab 快，副本补丁后是 1.59 s）。这是按分阶段测量推算的，要等上线后实测确认。

## 上线结果（2026-10-02 V 实测）

维护窗口 10:57:30–11:30:36（33 分钟，比计划多约 8 分钟：一是为测冷搜索清了缓存，让重建前的完整性检查变成 5.5 分钟冷读；二是实时索引进程的启动完整性检查花了 10.7 分钟）。重建 `memory index --force` 用时 846 s，rc=0。备份：`/var/backups/openclaw-memsearch-20261002`（12 GB，已校验，确认无问题后删除）。

**速度**（同一组 48 条真实查询，只读探针，searchMs）

| | 升级前 | 升级后 |
|---|---|---|
| 热搜索（白天，前后相隔约 1 小时） | p50 4.29 s · p90 5.86 s | **p50 1.68 s · p90 2.36 s** |
| 热搜索中向量阶段 | 2.94 s | 0.48 s |
| 完全冷（整库清出页缓存，10 条） | p50 32.6 s · 最慢 34.3 s | **p50 6.7 s · 最慢 8.9 s** |
| 完全冷的向量阶段 | 29.0 s | 3.6 s |

升级前的热搜索用原始代码跑在一份副本 runtime 上（`/opt/v-release-backups/…memory-search-fast…` 里的原字节）；03:xx 低峰同口径为 p50 3.63 s。“完全冷”比日常的冷搜索苛刻，日常冷搜索只有一部分数据不在缓存里；升级后完全冷的瓶颈变成冷的关键词全文索引（0.3–4.7 s）。

**新鲜度**（V 上实测，测试页已删除）：新建页面 6.2 s 进索引（启动后第一次变动），编辑 2.8 s，删除 2.2 s；用唯一字符串搜索，测试页排第一，searchMs 1.25 s。实时索引启动后 `files=1758`，等于有效文件数。

**质量**：升级后 V 的 384 条结果里 383 条与上午已盲评的条目完全相同，另 1 条补评 1 分。nDCG@8 0.543 → **0.641**，第一条有用 50% → **73%**，死链 4% → **0%**，与副本预测一致。

**健康**：重启后 Gateway 0 条 liveness/stalled、0 条数据库锁错误；索引进程 0 次同步失败；夜班、rtc-h5、内存快照定时器均已恢复。

## 第二轮：冲 1 秒（2026-10-02 下午，端到端为准）

衡量标准改为端到端：用 `tools.invoke memory_search` 走运行中的 Gateway（与 V 调用工具的路径相同），读工具自己报的 toolMs。

- **端到端比单独测慢约 2 秒。** 第一轮后 V 上端到端 toolMs 中位数 3.40 秒，单独跑搜索只要 1.3–1.7 秒。用 inspector 在 VLab Gateway 里给各阶段计时：`manager.search()` 本身 1.24 秒；差额来自工具层的会话可见性过滤。它每次调用都在 Gateway 主线程同步加载整个会话目录（VLab 3,743 个会话，每次 0.82–0.99 秒；V 的会话约为两倍），而 makaron 只索引记忆文件，这一步对结果没有任何作用。
- **改动**（PR #143，`lab/release-files/memory-search-1s/`）：
  - 命中里没有会话记录时直接返回，不加载会话目录（上游 9.5 修复的回移）；
  - 预先启动一个向量查找子进程在 stdin 上等待，搜索时直接拿来用（副本上中位数 1.61 → 1.33 秒，结果 48/48 一致）。
- **VLab 端到端**（同一组 48 条）：中位数 2.81 → 1.26 秒，较慢的 10% 3.34 → 1.61 秒，结果 48/48 一致。
- **V 端到端**（13:17 重启后）：中位数 3.31 → **1.07 秒**，较慢的 10% 4.38 → 3.60 秒；1 秒以内 12/48，1.5 秒以内 41/48；结果 48/48 一致。
- **重启后的预热问题**：重启后第一次搜索 13 秒；紧接着的测试里第一条撞到 25 秒超时，触发“超时后一分钟内暂停重试”，之后约一分钟的 23 条全部直接报错，然后恢复正常。线上用户在这一分钟里调用搜索也会受影响。要在重启后自动预热，留到下一轮。
- **VLab 与 V 的又一处差异**：VLab Gateway 里第一次打开搜索时，可能在主线程上做一次完整的数据库检查（12:15 那次卡住 Gateway 207 秒）；V 上同样的操作只要 43 毫秒（Gateway 启动时的校验结果被复用）。

剩下的离 1 秒还差：Gemini 生成查询向量 0.5–0.9 秒（下限），向量查询约 0.3 秒，以及繁忙时段的长尾。

## 还没做到 1 秒的部分

补丁后剩下的大头：Gemini embedding 0.5 s（下限）、子进程启动 0.2 s、向量查询 0.3 s、合并 0.2 s。要进 1 秒，可选的路：
- 上游 9.6 的常驻 KNN 子进程（随 9.6 升级自然获得），或者在 9.1 上让子进程在 embedding 期间预先启动（再省约 0.2 s）；
- 查一下合并阶段的 0.2 s 花在哪里（provenance 读取、时间衰减、MMR）；
- embedding 的 0.5 s 只能靠缓存重复查询或换就近的 provider，代价大，暂不建议。

## 其他 agent

dealclaw、xiaoai、short-v、v-codex 各有自己的 agent 库，大概率也没在同步。`v-memory-indexer-run.py` 支持传多个 agent，要不要一起同步待定。

## 运维提醒

- VLab 私有实验目录 `/var/tmp/claude-memsearch-20261002` 约 14 GB，验收结束后删除。
- V 上 `/root/claude-memsearch-20261002/`（V 记忆导出约 1.2 GB，root 700）验收后删除。探测用的 Gateway 环境副本已于 2026-10-02 删除。
