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
| `scripts/v-memory-index.sh` | 增量 `openclaw memory index`，用正在运行的 Gateway 自己的 node、dist、配置、用户和环境（从 /proc 读），保证与提供搜索的代码一致 |

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

**增量同步的代价**（副本，同时跑一个每 200 ms 写一次的探针，模拟 Gateway 的 5 秒写租约）：
- 一小时量级的变动（当天日志、15 个项目页、5 个新页、3 个移走）用时 23 s，写等待最长 0.73 s；
- 无变动的同步 50–88 s，大部分是打开库时的完整性检查（V 上 12 GB 约 90 s，9/28 有记录）；
- 4 次里有 2 次，写探针最长等了 4.2–5.1 s，单独跑时 schema 步骤只要 0.72 s。在 V 上这可能让一次 Gateway 写入撞到 5 秒租约，所以同步只排在低峰。

## 上 V 的步骤（需要 Tianyi 批准，按 review → 合 dev → 从 dev 打包 → 部署的顺序）

1. **合入 dev**，从 dev 提交打包补丁，用 `scripts/promote-to-v.mjs` 发布（3 个 dist 文件；需要重启 Gateway 才生效）。
2. **同一个维护窗口里重建 makaron 索引**（低峰，约 20–25 分钟停机）：
   1. Gateway 在线时先做 `backup sqlite create --agent makaron`，留作回滚；
   2. 停 `openclaw-gateway-memory-snapshot.timer`（它 `Requires=` Gateway，会把 Gateway 拉起来），再停 Gateway；
   3. 用 Gateway 同一份代码和环境跑 `openclaw memory index --force --agent makaron`（9/28 实测 11 分钟）。不要包 `timeout`，否则会在提交阶段被杀掉回滚；
   4. 启动 Gateway；恢复 snapshot timer、`openclaw-rtc-h5.service`。

   重建一次解决三件事：补上 9/28 之后的所有变动、换成新的 64 条/块布局（V 上省约 1.4 s）、消除碎片。不在 Gateway 运行时做，因为 9/28 那次在线 `--force` 锁库 5–6 分钟，丢了两条群消息。
3. **安装定时同步**：把 `scripts/v-memory-index.sh` 装成 systemd timer（root 运行，Nice=10，IOSchedulingClass=idle）。建议每天 05:40 和 21:40 各一次，21:40 排在 Librarian 21:00 编译之后。频率要权衡：越频繁，当天的新内容越早能搜到，但每次约 90 s 的完整性检查和偶发的写等待也越多。
4. **验收**：
   - `memory status --agent makaron` 不再 dirty，files 等于 eligible；
   - 用 `/root/claude-memsearch-20261002/probe.mjs` 跑同一组 48 条查询（只读、status purpose、间隔 3 s），看 searchMs；
   - 观察 1–2 天线上 toolResult 里的 `debug.searchMs` 分布（之前 p50 7–9 s）。

**V 上的预期**：低峰 p50 约 1.3–1.6 s（V 的 CPU 比 VLab 快，副本补丁后是 1.59 s）。这是按分阶段测量推算的，要等上线后实测确认。

## 还没做到 1 秒的部分

补丁后剩下的大头：Gemini embedding 0.5 s（下限）、子进程启动 0.2 s、向量查询 0.3 s、合并 0.2 s。要进 1 秒，可选的路：
- 上游 9.6 的常驻 KNN 子进程（随 9.6 升级自然获得），或者在 9.1 上让子进程在 embedding 期间预先启动（再省约 0.2 s）；
- 查一下合并阶段的 0.2 s 花在哪里（provenance 读取、时间衰减、MMR）；
- embedding 的 0.5 s 只能靠缓存重复查询或换就近的 provider，代价大，暂不建议。

## 其他 agent

dealclaw、xiaoai、short-v、v-codex 各有自己的 agent 库，大概率也没在同步。`v-memory-index.sh` 支持传多个 agent，要不要一起同步待定。

## 运维提醒

- VLab 私有实验目录 `/var/tmp/claude-memsearch-20261002` 约 14 GB，验收结束后删除。
- V 上 `/root/claude-memsearch-20261002/`（V 记忆导出约 1.2 GB，root 700）和 `/root/claude-memsearch-evidence/gw.env`（Gateway 环境副本，含密钥）用完即删。
