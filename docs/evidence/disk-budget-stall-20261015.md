# disk-budget-stall-v1 candidate A/B（2026-10-15）

事故与根因见 [docs/incidents/2026-10-15-feishu-ingress-stall.md](../incidents/2026-10-15-feishu-ingress-stall.md)。

- **环境**：VLab candidate，runtime 用真实的 9.1 db91.6 chunk，`before` 与 V 当前字节一致（`9e5c3708…`、`014136ce…`）。没占 lease，也没碰共享 Gateway。
- **输入**：
  - 第一版：A 臂和 B 臂都跑过，本地提交 `46e442d2`。
  - 第二版：只重跑了 B 臂，提交 `8a67ddde`，dirty=false。A 臂没有改动。
  - 第二版被测的文件哈希：
    - `disk-budget-BzLS0kmH.js` `aa6aaf56…`
    - `session-history-eviction-d5aiCsHS.js` `0c43970f…`
    - 脚本 `970c96e4…`
- **脚本**：`lab/candidate/disk-budget-stall.mjs`。plan 在 `lab/candidate/disk-budget-stall-{reachable,exhausted,kicks}-{A,B}.plan.json`。
  - A 臂是 `lab/fixtures/disk-budget-stall/` 下的 V 原字节，以私有文件名放在同一个 dist 里，其他兄弟 chunk 与 B 共用。
  - B 臂是 `lab/release-files/disk-budget-stall/`。
- **数据**：在 runner 的 `OPENCLAW_STATE_DIR` 下建一个私有 agent，agent 库由 runtime 自己创建。
  - sessions 目录：3 万个稀疏文件，每个 580 KiB，合计 16.6 GiB。
  - canonical 归档：同时写 `session_transcript_archives` 行和 `.zst` 文件，每个 2 MiB。
  - 遗留 dash 归档：每个 2 MiB。
- **测量**：每次清理运行时，每 250 ms 向 `runExclusiveSqliteSessionWrite` 申请一次写队列，记下等待时间，也就是飞书入站元数据写入要等的时间。同时用 `monitorEventLoopDelay` 和 ELU 记录主线程。全量扫描按 `readdir(sessionsDir)` 计数，realpath 按 `fs.realpathSync` 计数。

## 结果

| 场景 | 臂 | 用时 | 全量扫描 | realpathSync | 写队列最长等待 | 事件循环 max / p99 | ELU | 结果 |
|---|---|---|---|---|---|---|---|---|
| reachable（删 29 个能到高水位，120 个归档） | A | 83.4 s | 33 | 994,913 | **77,938 ms** | 172 / 17 ms | 0.986 | 删最老 29 个，剩 91 个 |
| | B | 5.1 s | 4 | 8 | 2 ms | 158 / 51 ms | 0.946 | 同 A，剩余最老的一个也相同 |
| exhausted（到不了高水位，40 + 10 个归档） | A | 156.2 s | 59 | 1,771,561 | **144,090 ms** | 1138 / 20 ms | 0.986 | 50 个全删，仍超预算 |
| | B | 12.8 s | 8 | 12 | 12 ms | 785 / 51 ms | 0.975 | 同 A |
| kicks ①：预算内，30 s 内 force 30 次 | A | 65 s | 30 s 内 13 次 | 420,308 | 4 ms | 191 / 13 ms | **0.51** | 每次删除或重置都触发一次全量扫描 |
| | B | 65 s | 30 s 内 1 次，65 s 内 2 次 | 4 | 3 ms | 191 / 12 ms | 0.04 | 一分钟内合并成一次，延后的那次在 60 s 后跑 |
| kicks ②：耗尽后再 force 10 次加普通触发 10 次 | A | 216 s | 耗尽那轮 29 次，之后又 29 次 | 1,741,605 | **66,940 ms** | 928 / 14 ms | 0.69 | 耗尽后照样一轮接一轮 |
| | B | 146 s | 耗尽那轮 6 次，之后 0 次 | 10 | 0 ms | 200 / 12 ms | 0.06 | 退避 30 分钟，告警一次 `session history disk budget exhausted…`，另有一条 `disk-budget pass` 结果日志 |

**第二版**（`8a67ddde`）：批与批之间只重新 stat 库文件，一整轮只在开头和结尾各做一次全量扫描；不驱逐会话历史。

| 场景 | 用时 | 全量扫描 | 写队列最长等待 | 事件循环 max | 结果 |
|---|---|---|---|---|---|
| reachable | 3.7 s | 3 | 3 ms | 179 ms | 同 A：删最老的 29 个 |
| exhausted | 6.4 s | 5 | 4 ms | 185 ms | 同 A：50 个全删 |
| kicks | 预算内：30 s 内 1 次，65 s 内 2 次。耗尽后：0 次，告警一次 | — | 2 ms | 344 ms | — |

第二版 receipt：reachable f3a15234、exhausted 6f0ac932、kicks 2a4928f9。

receipt 是本机的 `tmp/candidate/candidate-*.json`，对应 id 如下：

| 场景 | A | B |
|---|---|---|
| reachable | f865a912 | d775829a |
| exhausted | 1f10758d | dcf2787e |
| kicks | 6894360a | ee5fec16 |

## 读法

- **写队列**：A 在整轮清理期间把 session 写队列一直占住。在 V 上，一轮要几十分钟到一个小时以上（3 万个真实文件，每项 5–7 s），这就是 21:11–21:40 飞书全部卡在 adoption 的原因。B 每批之间都释放写队列，最长只等 12 ms。
- **扫描量**：B 同样的删除结果，全量扫描次数降到 1/8 到 1/15，并且不再逐文件同步 realpath。A 的 realpath 在 V 的 profile 里是 2.6–3.4 s/10 s。
- **事件循环 max**：B 的 exhausted 仍有一次 785 ms。那是批内的 checkpoint 加 `incremental_vacuum`，或者一次 GC，补丁没动这部分。A 是 1138 ms。
- **ELU**：B 在清理期间 ELU 仍有 0.95–0.98，因为 3 万次异步 stat 的回调还在主线程上。不同的是现在可以穿插别的工作，写队列不再被占住，而且整轮缩短了 6–16 倍。上游 10.x 把测量挪进了 worker 线程（`disk-budget.worker`），这次没有回移。
- **没覆盖到**：「逐个驱逐历史会话」那一步。fixture 里没有会话代。只有删完全部归档后仍然越线才会走到它，补丁也只改了其中的重扫和写队列。上线前提是 `maxDiskBytes` 留有余量，V 现在是 48gb，用了 65%。
