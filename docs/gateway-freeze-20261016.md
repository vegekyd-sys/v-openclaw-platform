# 10/16 Gateway 反复冻结 50–70 秒：根因与修法

2026-10-17 CST 调查。生产 V：OpenClaw 2026.9.1 db91.6，Gateway 单元 `openclaw-gateway`。

## 结论

**冻结是 V8 完整 GC 撞上了被换出到 swap 的 Gateway 堆，不是转录投影重建。修法：Gateway 单元设 `MemorySwapMax=0`。**

- V 的 `vm.swappiness` 是内核默认值 50。Gateway、Worker 反复读取 18.5 GB 的 agent 数据库，页缓存一直在周转。内核做内存回收时，把 Gateway 堆里长时间没碰过的老生代页换到了 swap。
  - 10/16 23:32 重启后只过了 1.5 小时，Gateway 已有 469–507 MB 在 swap 里，并且还在增长。
- 完整 GC 要标记所有存活对象，被换出的页只能一页一页缺页读回。这段时间主线程停住，CPU 却几乎不动。
- 当天下午 Gateway 堆涨到 4.6–6.9 GB（平时 1.5–2.5 GB），一次 GC 就停 50–70 秒。
  - 停住期间，Worker 的流事件确认超时，钉钉断线，RPC 排队。
  - 重启换成一个新堆、全部常驻内存，所以重启后会好一阵。

## 证据

### V 的日志和主机指标

日志来自轮转后的 `/tmp/openclaw/openclaw-2026-10-16.1.log` 和 `.2.log`，主机指标来自 sar。

1. **只有 Gateway 停住。** journal 里 Gateway 自己的输出整段静默，例如 16:37:58.25 → 16:39:08.68，共 70.4 s，与报告的 69.7 s 一致。同一时段 Worker 子进程照常写文件日志，sshd、cron 等照常写 journal。
2. **冻结期间 CPU 几乎为零。** 19:20 那次 liveness 告警记录了 `eventLoopDelayMaxMs=57076 eventLoopUtilization=0.922 cpuCoreRatio=0.247`。整个进程 66 s 内只用了约 16 CPU 秒，所以不是 JS 计算，也不是普通 GC（普通 GC 多线程并行，核比 > 1）。
3. **冻结时段有换页。**

   | sar 10 分钟区间 | pswpout/s | 冻结 |
   |---|---|---|
   | 01:30–01:40 | 359 | 01:47 冻结 48 s |
   | 16:30–16:40 | 975（约 2.3 GB 换出） | 16:38 起冻结风暴 |
   | 16:40–16:50 | 1，但 pswpin 234、majflt 135/s | 冻结 5 次：正在把换出去的堆读回 |
   | 18:10–18:20 | 2068 | 18:19:37 冻结 50 s；18:20:24 journald 打印「Under memory pressure」 |
   | 19:10–19:20 | 456 | 19:19 冻结 54 s |
   | 23:20–23:30 | 454 | 23:34 事件循环逾期 43 s |

4. **堆涨了，常驻内存没涨。**
   - 16:16 RSS 7.58 GB、堆 2.41 GB；16:21 堆 6.93 GB，RSS 仍是 7.51 GB；之后 RSS 一直停在 7.5–8.0 GB。
   - 正常时段 RSS ≈ 堆 + 0.3–0.9 GB。多出来的堆页不在内存里，在 swap 里。
5. **冻结期间 Gateway 没有一条 ≥1 s 的 SQLite 慢持锁记录。** 所以冻结不在任何 agent DB 事务里，包括投影重建的 claim/delete/append/finalize。

### VLab 机制复现：`lab/candidate/gc-swapped-heap.sh`

- 环境：Node 22.23.1，参数与 V 相同（`--max-old-space-size=12288`）；约 2.5 GB 转录形状的存活对象。
- 换出方式：用 cgroup v2 的 `memory.reclaim` 把其中 1.5 GB 压进 swap。

| 完整 GC | 墙钟 | 进程 CPU 核比 | 缺页 |
|---|---|---|---|
| 堆全部常驻（两次） | 2.4 / 2.9 s | 1.89 / 1.74 | 0 |
| 1.5 GB 在 swap | **36.9 s** | **0.247** | 130,514 |
| 读回之后 | 4.1 s | 1.24 | 3 |

0.247 与 V 在 19:20 记录的值相同。V 的堆是这次的 2–3 倍，停顿 50–70 s 与此相符。

### 「投影重建冻结主线程」：已否定

**代码。**
- `session-transcript-reconcile` 把整会话的读取和解析放在 worker 线程里（`session-transcript-reconcile.worker.js`）。
- 主线程只按 512 行（active）或 128 行 / 256 KB（FTS）分块写入，每块之后 `setImmediate` 让出事件循环。

**时间线。**
- 7da00997 的 rebuilding 报错在 16:02–16:08，冻结风暴从 16:38 才开始。
- 18:20 那次冻结（18:19:37 开始）早于 3c3fab41 第一次报错（18:21:22）。
- 22:00 的 6506ca7f 没有对应冻结。
- 重建和冻结同时出现，更可能是冻结导致的：写入超时打乱了转录，会话因此被标记为需要重建。

**candidate 实测**（candidate-d1affc7d，`lab/candidate/projection-rebuild-freeze.mjs`）：
- 数据：24,073 事件、170 MB 的放大会话，FTS 117k 行（V 是 144k）；用 db91.6 原版代码重建 2 轮。
- 重建耗时 9.3 / 9.8 s。主线程最长停顿 160 / 267 ms，停顿合计 0.8 / 1.5 s。同时进行的 Agent DB 写入最长 3 / 7 ms。
- 但重建期间约 8 s 内，读这个会话都返回「projection is rebuilding」（每轮 34–35 次失败读取）。这解释了「重建期间消息直接失败」，不解释冻结。另见下方后续。

## 修法：Gateway 单元 `MemorySwapMax=0`

- 文件：`systemd/openclaw-gateway.service.d/gateway-no-swap.conf`。
- 安装：`scripts/install-v-gateway-no-swap.sh v`；可选 `--dry-run` 或 `--rollback`。
- 脚本先装 drop-in，供以后每次启动使用；再用 `systemctl set-property --runtime` 把 cgroup 的 `memory.swap.max` 立即设为 0，所以**不需要重启**。
- 作用范围：Gateway 和它的 Worker 的匿名内存不再进 swap。
  - 这个单元读数据库产生的页缓存照常可以回收。
  - 别的服务照常可以用 swap。
  - MemoryHigh 和 MemoryMax 不变。
- 已经在 swap 里的页不会自己回来。V 上这个 cgroup 在 10/17 01:3x 有约 2.85 GB 在 swap。下一次完整 GC 会把它们读回来，可能停一次。要避免这次停顿，可以在低峰重启 Gateway，或者在空闲内存远大于已用 swap 时执行一次 `swapoff -a && swapon -a`。
- 风险：这个单元的匿名内存只能常驻。
  - 10/17 01:3x 的现状：匿名 14 GB + swap 2.85 GB，可用内存 13.4 GB，余量够。
  - 夜班满并发时匿名内存会更高。上线后要盯 `memory.events` 里的 high / oom 计数和 MemAvailable。
  - 内存真的不够时，表现会从「冻结」变成 memory.high 节流或 OOM，需要 Tianyi 判断能否接受。

**为什么不调 `vm.swappiness`。**
- V 和 VLab 都开着 MGLRU（`lru_gen/enabled = 0x0007`），swappiness 对是否换出 Node 堆没有单调效果。
- VLab 实测里，swappiness=10 那一档反而出现过一次 1.87 GB 的自然换出，随后 GC 停了 60.5 s，核比 0.18。这次换出没有任何人为干预，是冻结机制的第二次复现。

**VLab 实测：修法前后，同一个确定性测试**（`lab/candidate/gc-swapped-heap.sh`）：2.5 GB 堆，用 `memory.reclaim` 回收 1.5 GB 后做一次完整 GC。

| 设置 | 回收后在 swap 里 | 完整 GC | 核比 | 缺页 |
|---|---|---|---|---|
| 无修复（两次） | 1.50 / 1.48 GB | 36.9 / 40.3 s | 0.247 / 0.242 | 13.1 万 / 13.3 万 |
| `MemorySwapMax=0` | 0（内核拒绝回收，EAGAIN） | **1.9 s** | 2.43 | 0 |
| 常驻基线（两边一样） | — | 2.1–3.2 s | 1.6–2.4 | 0 |

**自然压力实测**（`lab/candidate/gc-swap-pressure.sh`）：
- 设置：1.8 GB 堆和一个反复读 2 GB 热文件的进程放在同一个 MemoryHigh=2.8 GB 的 cgroup 里，每 60 s 做一次完整 GC，跑 5 分钟。
- 无修复跑了 3 次：1 次出现 1.87 GB 换出，GC 60.5 s；2 次没有换出。所以是否被换出不确定。
- `MemorySwapMax=0` 两档 swappiness 各跑 1 次：swap 都是 0，缺页都是 0，GC 最长 3.2 s。

## 没做的和后续

- **重建期间消息直接失败。**
  - `withCurrentProjectionSnapshot` 发现投影过期就直接抛错，调用方不等。
  - 10/16 16:00–16:10 Gateway 做了 22 次 `transcript-index.prepare`，说明同一批大会话在反复重建：会话一直有新写入，finalize 发现快照不符就放弃，下一次读又重新触发。
  - 这是独立的可用性问题，建议另开任务处理（排队等待或用旧投影应答，并让重建对追加写入做增量收尾）。
- **监控。** 上线后对比 V 上 Gateway 的 `VmSwap`（应为 0）、`memory.swap.current`、`memory.events`，以及 liveness 告警里的 `cpuCoreRatio`。
- **备选。** 如果调低 swappiness 仍压不住，可以考虑降低 `--max-old-space-size`，让堆小而热，但 GC 会更频繁（见 gateway-memory-findings），需要另行实测。
