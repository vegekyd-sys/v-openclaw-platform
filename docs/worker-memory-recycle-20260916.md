# Worker 常驻内存不释放：诊断与修复（2026-09-16）

## 现场

生产 V (`VM-8-2-ubuntu`)，`v2026.9.1-db91.6`，gateway 与 worker 均已存活约 15 小时。

| 进程 | RSS | Swap | 存活 |
|---|---|---|---|
| worker slot0 `2985378` | 3.30 GB | 279 MB | ~15h |
| worker `3058342` | 1.90 GB | 209 MB | ~14h |
| worker `3059096` | 620 MB | 236 MB | ~14h |
| worker `3065204` | 66 MB | — | ~14h |
| worker `3087331` | 64 MB | — | ~13.5h |
| gateway `2984601` | 3.43 GB | 493 MB | ~15h |

整机 30 GB，gateway cgroup anon 9.6 GB（`MemoryHigh=20G`），swap 已用 4.7 GB。

同龄的五个 worker 里，干过活的涨到 GB 级，没干过活的还在 64 MB；已经闲下来的那个 RSS 没有回落，只是被换出了 236 MB。增长严格跟"服务过多少 turn"走，且干完不回落。

## 根因

三处叠加，都在 `experiments/agent-worker-isolation-v1/`。

1. **常驻 worker 永不退休。** `reapIdleWorkers()` 第一行 `if (this.closing || this.workers.size <= this.minWorkers) return;`。生产 `minWorkers=5`，弹性扩出来的 worker 会被回收，但打底这 5 个永远不会。
2. **worker 继承 gateway 的堆上限。** `resolveWorkerExecArgv()` 只过滤 `--inspect`/`--debug`，`--max-old-space-size=12288` 原样 fork 给每个 worker。V8 在离 12 GB 还很远时没有做 major GC 的压力，回收掉的页也不还给 OS。
3. **完全没有内存可观测性。** `worker.mjs` / `worker-pool.mjs` / `index.mjs` 里 `memoryUsage|rss|heapUsed` 零命中。没有按内存回收的逻辑，也看不到它在涨。

这是 `db91.5` 验收时留下的那条尾巴（"高负载首字仍未稳定回到 3–7 秒，剩余延迟主要在 Worker/model/queue 与 event-loop 压力面"）的主因：热 worker 在 3 GB+ 且部分页在 swap 上，major GC 停顿加上 swap-in 延迟直接打在首字上。

## 修复

设计前提：V 的 turn 很重、可能跑很久，回收绝不能让用户有感。

- **worker 自己定时上报内存**，不只搭在 progress heartbeat 上——回收决策恰好发生在 worker 空闲、没有 heartbeat 的时候。
- **越界的 worker 即使在 `minWorkers` 底线上也会被退休**，但一次只退一个，只在它完全空闲时（无 owner session、无 detached task、无 active、无 queue，且空闲已超过 `idleTimeoutMs`），并且**先起替补、等它 ready 再退**，所以没有调用方会撞上冷启动，也不会打断任何正在跑的 run。
- **最小存活期**（`recycleMinAgeMs`，默认 5 分钟）防止阈值配低时退化成 spawn/retire 循环。

触发条件：

| 配置 | 默认 | 说明 |
|---|---|---|
| `recycleRssMb` | 1536 | 主触发。直接对症，不胖不动，干扰最小 |
| `recycleMaxLifetimeMs` | 12h | 兜底，接住不越过 RSS 线的慢增长 |
| `recycleMaxSessions` | 0（关） | V 的 turn 轻重差异太大，session 计数跟内存相关性差，默认不用 |
| `recycleCooldownMs` | 60s | 两次回收间隔 |
| `recycleMinAgeMs` | 300s | 新 worker 的保护期 |
| `workerMaxOldSpaceMb` | 0（继承） | 改成显式 opt-in，由 vLab A/B 决定取值，不做静默变更 |

`status()` 现在按 worker 上报 `memory`、`ageMs`、`servedSessionCount` 和当前的 `recycleReason`，以及池级的 `recycledWorkerCount`。

## 验证

- 本机：`experiments/agent-worker-isolation-v1` 全套 222 项，221 通过。唯一失败项 `release Worker changes only optional pre-import acceleration` 在未改动的 `dev` 上同样失败，与本次改动无关（它比对的是 `lab/release-files/`，本次未触及）。
- VLab 主机 candidate（receipt `candidate-fdc4a642-8ca8-440c-8538-a62a92f2ea15`）：13/13 通过，exit 0，`sharedUnchanged: true`，不占 integration lease，未触碰生产。
- soak 用例走真实分配而非脚本数值：worker 在 8 个 turn 里真实涨到 317 MB，越过 220 MB 阈值后被回收，替补是全新进程、`servedSessionCount=0`、RSS 不到原来的一半——证明内存是真的回收了，而不是换出。

## 尚未做的事

- 生产未做任何改动。当前那 5 个 worker 靠自身逻辑清不掉，只有重启 gateway 才能释放约 6 GB。
- `workerMaxOldSpaceMb` 的生产取值未定。需要一次 A/B 判断 4096 是否足够重任务使用。
- 回收阈值 1536 MB 是基于现场观测的初值，生产实际分布需要开启遥测后再校准。
