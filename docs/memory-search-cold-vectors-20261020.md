# 语音里 memory_search 要 25–48 秒：向量表冷读（2026-10-20）

## 现象

语音入口（网页电话、ReSpeaker、StackChan）经 Gateway `tools.invoke` 调 memory_search，偶尔要 27–48 s 才返回，同一通电话里 web_search 只要 1–3 s。上海语音节点转写：10/19 14:38:27 用了 48.3 s，10/20 10:55:13 用了 27.0 s。

Gateway 日志里 10/19–10/20 一共 44 次 tools.invoke，其中 5 次 ≥25 s（25.1、25.2、26.2、26.7、47.9 s）。这 5 次**都不是"慢慢返回了结果"，而是撞上了工具固定的 25 s 截止**：开库日志（`database-open:search`）之后 25 s 没有任何阶段日志，然后返回 `memory_search timed out after 25s`。V 拿到的是"记忆搜索超时"，不是记忆。工具随后对整个 makaron agent 暂停重试 60 s，这段时间里所有入口的 memory_search 都直接失败。48 s 那次是同一个 25 s 截止，计时器被同时发生的 Gateway 主线程 27 s 停顿推迟了。

规律：慢的总是**隔了一段时间之后的第一次搜索**（10:55 那次是 02:37 Gateway 重启后的第一次；11:11 那次是第二次，第一次被截断了）。连续搜索都在 1–3 s。

## 根因

memory_search 的向量阶段在 KNN 子进程里对整张 sqlite-vec 表做暴力扫描（`memory_index_chunks_vec_vector_chunks00`）：

- 这张表现在 **743 MB**（41.5k 片段 × 3072 维，加上 vec0 删除后留下的空槽），**散成 56,061 段**（190,150 页；9/19 compact 之后是 130 段，compact 之前的 9,419 段时冷搜就是 27–47 s）。实时索引进程每次同步都是删除再插入，碎片回升很快。
- agent 库 20 GB，页缓存约 12 GB，要和 Gateway、worker 共用；实测某一时刻整个库只有 2.6 GB 在缓存里。真实搜索一天只有几十次，两次之间向量页就被挤出去了。
- 冷扫描 = 约 19 万次随机读，在 V 的云盘上要 23–24 s，加上 embedding 和开库就超过 25 s。

定向复现（只把向量表的页踢出缓存，其他不动）：

| 阶段 | 冷 | 热 |
|---|---|---|
| embedding（Gemini） | 0.48–0.74 s | 0.55–0.59 s |
| 关键词 | 0.03–0.25 s | 0.03–0.08 s |
| **向量（KNN）** | **22.9–24.4 s** | **0.55 s** |

经 Gateway 端到端：冷态 `searchVector` 24.4 s → 截止。排除项：v-memory-indexer 写锁（10:55、11:11 两次期间它都没有活动）、主线程卡顿（11:11 那次 Gateway 主线程正常响应 health）、Gemini（每次 0.5 s 左右）、完整性检查（integrity 20–80 ms）。

## 修复：在 Gateway 外把向量读热

OpenClaw 没有向量常驻或预热的配置；官方整理碎片的手段是 `openclaw doctor --session-sqlite compact`，必须停 Gateway。所以这里先在 Gateway 外做：

| 文件 | 作用 |
|---|---|
| `scripts/v-memory-vector-warm.py` | 只读连接，按 rowid 分批（每批是一个独立的短读事务）读一遍 vec0 的 4 张影子表。不调 Gateway、不拿写锁、不长时间占读快照（不挡 WAL checkpoint） |
| `systemd/v-memory-vector-warm.{service,timer}` | 每 60 s 一次，openclaw 用户，nice 19、IO best-effort 7 |
| `scripts/install-v-memory-vector-warm.sh` | 安装并启动；随时可装，不需要重启 Gateway；回滚：`systemctl disable --now v-memory-vector-warm.timer` |
| `tests/v-memory-vector-warm.test.py` | 读满每个字节、库字节不变、分批之间不钉快照、缺表/缺库跳过、坏库报错 |

两个刹车（后续 PR）：`MemAvailable` 低于 4 GiB 时这一轮跳过，输出 `{"skipped":"low-memory","memAvailableMb":N}`（10/19 21:10 V 只剩 3.7 GB 时 Gateway 卡了 30 s，那时再读 743 MB 只会和内存回收抢资源）；单遍超过 10 s 就在两批之间停下，输出 `{"aborted":"time-budget","ms":N,"touchedMB":N}`，下一轮从头读。已读过的部分还在缓存里，所以每一轮都能读得更远，冷的时候大约 3 轮就能读满。

成本（V 实测）：热的时候一次 0.3 s、CPU 0.33 s、RSS 65 MB；完全冷的时候一次 23 s（在后台，不在用户路径上）。常驻缓存约 750 MB（30 GB 内存的 2.5%）。

## 前后对比（V，2026-10-20 11:29–11:45）

**同一份搜索代码在 Gateway 外跑**（status manager、同一个 KNN 子进程，不会触发工具的 60 s 暂停），每轮先把向量页踢出缓存，再交替做两种：直接搜（修复前）、先跑一次预热再搜（修复后）。5 轮、5 条不同查询，结果都是 8 条命中：

| | 搜索总耗时 | 其中向量阶段 |
|---|---|---|
| 修复前（冷） | 23.5 / 24.0 / 24.0 / 24.6 / 24.8 s，p50 24.0 s | 22.9–23.9 s |
| 修复后（预热过） | 1.15 / 1.15 / 1.19 / 1.28 / 1.37 s，p50 1.19 s | 0.55–0.58 s |

**经运行中的 Gateway 端到端**（`tools.invoke memory_search`，带语音同一个 sessionKey，toolMs）：

| | n | p50 | p95 / 最大 | 结果 |
|---|---|---|---|---|
| 修复前：线上 10/19–10/20 的慢调用 + 一次定向冷复现 | 6 | 25 s 截止 | 47.9 s | 全部「memory_search timed out」，之后 60 s 内所有 memory_search 直接失败 |
| 修复后：每次先把向量踢冷，再跑一次预热，然后搜 | 10 | 1.47 s | 2.2 s | 10/10 返回结果 |

连续热态（不踢缓存、20 s 一次）13 次 wall 1.3–5.4 s，p50 2.3 s，作为日常基线。墙钟里还有 tools.invoke 每次构造整套工具的 0.2–3.8 s，那是测试路径和语音入口都有、与记忆无关的开销，另案。

## 不影响其他入口

预热只读库，不改 Gateway、不改 dist、不改配置。飞书、网页电话、语音、worker 里的 memory_search 走的都是同一条搜索路径，只会变快。

## 后续（需要 Tianyi 拍板）

1. **整理碎片**：`openclaw doctor --session-sqlite compact --session-sqlite-agent makaron`，需要停 Gateway（9/19 停机 9 分 23 秒，现在库 20 GB 会更久），流程见 `docs/memory-search-latency-quality-20261002.md` 与 9/19 的 compact 记录。整理后冷读从 24 s 降到约 5 s，预热即使偶尔失手也不会撞截止，还能把表缩回约 510 MB。
2. **工具层兜底**（dist 补丁，要重启）：向量阶段超过预算时退回关键词结果，而不是整个 25 s 截止后什么都不给；并且 query embedding 的单次超时（60 s）比工具截止（25 s）还长，也应收紧。
