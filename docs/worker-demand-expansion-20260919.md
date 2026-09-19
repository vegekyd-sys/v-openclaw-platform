# Worker 池按需扩容：生产血脉移植

## 为什么

2026-09-19 在生产 V 上做了第一次分级压测（5 / 15 / 30 并发，真实飞书多步任务，每档之间过中止闸门）。三档 **50/50 全部完成、0 超时、0 失败**，但 30 并发档首字 p50 到了 201 秒。

分段归因排除了模型链：并发从 15 到 30、模型调用从 104 次到 241 次，单次调用 p50 只从 4.2s 动到 4.6s，上游握手 p50 0.6→0.7s。

等待几乎全在「开始之前」——30 并发档首字 201s、完成 214s，只差 12 秒。从第一条分发到各 run 首次 `model-call-enter`：p50 58s、p90 93s、**max 154s**。

根因在生产跑的 `worker-pool.mjs` 里：

```js
if (!this.capacityStartupPromise && this.workers.size < this.maxWorkers) {
```

`capacityStartupPromise` 是单槽锁，同一时刻只允许一个 Worker 因需求启动。池子从 5 长到 13 需要 8 次**串行**启动，每次约 19 秒 ≈ 152 秒，与实测 154 秒吻合。

## 改了什么

在**线上实际字节**上做最小移植（不是用 `experiments/` 覆盖）：

- 新增 `maxConcurrentStarts`，默认 `min(maxWorkers, 4, availableParallelism())`，带边界校验，并在 `status` 中暴露
- 新增 `startingWorkerCount()` 与 `ensureDemandWorkers()`：按「没有 Worker 的不同 session 数 − 现有 Worker 还能接的槽位」计算缺口，一次启动至多 `maxConcurrentStarts` 个
- 用 `ensureDemandWorkers()` 替换单槽锁分支

净增 24 行，与线上差异 52 行，全部与扩容相关。

## 血脉现状（本次的核心发现）

同一个 `worker-pool.mjs` 在仓库和机器上有多份，能力互不相同：

| 能力 | 线上 (9/16) | `release-files/` (9/13) | `experiments/` (dev) | 本候选 |
| --- | --- | --- | --- | --- |
| Worker 内存回收 | 有 | 无 | 有 | 有 |
| firsttext 阶段埋点 | 有 | 有 | 无 | 有 |
| late Worker reply | 有 | 有 | 无 | 有 |
| runtimePrewarm 状态 | 无 | 有 | 有 | 无 |
| spawn EAGAIN 重试 | 无 | 有 | 有 | 无 |
| **按需扩容** | **无** | 有 | 有 | **有** |

两条结论：

1. **`experiments/` 版不能直接部署** —— 它没有埋点和 late reply，部署会丢掉这两项生产能力。
2. **`lab/release-files/production-worker-worker-pool.mjs`（9/13 那份）是部署陷阱** —— 它没有 Worker 内存回收，而 `worker-coldstart-longterm-plan.json`、`concurrency-final-plan.json`、`worker-runtime-readiness-plan.json`、`concurrency-fix-v2-plan.json` 四个 plan 仍指向它。按这些 plan 部署会静默回退 9/16 的回收修复。

`lab/worker-demand-expansion.test.mjs` 把上表钉成断言：候选必须保留线上已有的每一项能力，且只移植本次压测证实的那一项；未移植的两项（spawn 重试、runtimePrewarm 状态）被显式断言为「仍然缺失」，让缺口留在视野里而不是被重新发现一遍。

## 验收

1. **本机**：`node --test lab/worker-demand-expansion.test.mjs`（7/7）与 Worker 全套回归。
2. **共享 VLab**：走 `lab/worker-demand-expansion-plan.json`。已核对 VLab 与生产 V 的 `production-worker/worker-pool.mjs` **字节完全一致**（sha256 `a9f718d0c9ca1f20…`），所以这一层的结论可以迁移到生产——这是本文件成立的前提，下次部署前要重新核对，不要假定它还成立。
3. **生产复测**：与 2026-09-19 的基线同法对比（30 并发、同样 6 个多步任务模板、同样中止闸门）：

| 指标 | 修复前实测 | 期望 |
| --- | ---: | --- |
| 最后一个 run 开始等待 | 154 s | 明显下降 |
| 首字 p50 | 201.4 s | 显著下降 |
| 首字与完成之差 | 12 s | 仍然很小 |
| 完成率 | 30/30 | 必须仍是 30/30 |
| 主机可用内存最低 | 7.7 G | **重点观察** |

最后一行是这次改动的真实风险：扩容变快意味着更早到达内存压力点。13 个 Worker 已占 15.1 G，`maxWorkers=15` 需要按主机内存（31 G）重新评估。复测必须开着内存闸门（<4 G 中止）。

本文件不含部署授权。
