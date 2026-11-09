# agent-shell cgroup：VLab candidate 证据（2026-11-10）

- **脚本与计划**：`lab/candidate/agent-shell-cgroup.mjs`、`agent-shell-cgroup.plan.json`。
- **原始结果**：[agent-shell-cgroup-20261110.json](agent-shell-cgroup-20261110.json)。
- **主要一轮**：`candidate-8ecac732`，ok，用户 `lab-db91-parity`，runtime 基线 `cli-readonly-live-20261109`。

## 做法

candidate 单元和 V 的 Gateway 单元一样是委托出来的（`Delegate=yes`、`DelegateSubgroup=foreground`）。在它下面建：

| cgroup | 里面是什么 | 作用 |
|---|---|---|
| `box` | — | `memory.max` = 预热后的占用 + 768 MB，充当整机内存。V 上 37 GB 的扫描远大于空闲内存；这里 6 GB 的扫描远大于 box 剩下的空间 |
| `box/gw` | 真 Gateway（共享 VLab dealclaw 库的副本，30 个会话），一个客户端每 0.3 秒读一次 `chat.history`，以及一个「热库页」读进程 | 模拟 V 上的 Gateway |
| `box/agent-shell` | 由 `scripts/v-agent-shell-cgroup.py`（真 sidecar）建立并放进进程 | 本方案 |

- **热库页读进程**：V 的 Gateway 在页缓存里放着约 18 GB 库页，并在主线程上读它们；这里复制来的库小得多。所以在 Gateway 的 cgroup 里放一个读进程，把 2 GB 文件预热进缓存，每 5 毫秒随机读 64 KB，代表库页查询。
- **Gateway 停顿**：通过 `--import` 注入 `monitorEventLoopDelay`，记录主线程每秒最坏的停顿。
- **grep**：每组都是同一条 `grep -r -l <不存在的串> <6 GB 新生成的随机文件>`。agent 那几组从一个路径带 `/process/supervisor/service-child-relay.js` 的父进程启动，起点在 Gateway 的 cgroup，和 V 上 OpenClaw exec 一样；sidecar 在 0.5 秒内把它挪走。

## 结果

| 组 | grep 在哪 | 热库页随机读，每秒最坏（中位 / p95 / 最大） | Gateway 主线程每秒最坏停顿（p95 / 最大） | chat.history（p95 / 最大） | Gateway io.pressure avg10 | grep 结果 |
|---|---|---|---|---|---|---|
| 基线：不扫盘 | — | 0 / 0.1 / 0.1 ms | 58 / 60 ms | 50 / 58 ms | 0% | — |
| **V 现状**：同一 cgroup | `gw` | **5.4 / 26 / 36.9 ms** | **116 / 153 ms** | **96 / 153 ms** | **21%** | 42.8 秒跑完，读 6.7 GB |
| agent-shell，只限内存（memory.high 256M） | `agent-shell` | 0 / 0.1 / 0.1 ms | 72 / 85 ms | 54 / 69 ms | 0% | 33.7 秒跑完，读 6.0 GB |
| agent-shell，内存加 io.max 60 MB/s | `agent-shell` | 0 / 0.1 / 2.1 ms | 55 / 60 ms | 49 / 61 ms | 0% | 100.6 秒跑完，读 6.0 GB |

- **V 现状这组**：扫描的缓存挤掉了 Gateway 的热页，热页读从 0.1 ms 涨到几十毫秒；Gateway 主线程的停顿和读库延迟都翻倍，Gateway 有 21% 的时间在等 IO。
- **进了 agent-shell 之后**：Gateway 和热页都看不出 grep 的存在；agent-shell 的缓存停在约 250 MB（memory.high）。grep 每一组都跑完了，限 io 那组慢了一倍多，只慢它自己。
- **规模和 V 不同**：VLab 只有 15 GB 内存、热库页 2 GB，所以 V 现状这组的停顿是 153 ms，而不是 V 上的 89 秒。机制相同；规模越大，挤掉的页越多。
- **另一轮**（`candidate-062c0e15`，没有热页读进程）：只限内存那组的 Gateway io.pressure 也到了 20%。这一轮里限 io 是 0%。所以 V 上同时设 io.max，而不是只设 memory.high。

## 正常命令

正常命令按 V 的设置测（memory.high 12G，两块盘 io.max 80 MB/s 读写），和不限制的同级 cgroup 比：

| 命令 | 不限制 | 按 V 的设置 |
|---|---|---|
| `ls -la <state>` | 14 ms | 6 ms |
| `grep -rn gateway openclaw.json` | 17 ms | 8 ms |
| ffmpeg 编码 20 秒 720p（libx264 veryfast） | 9.0 s | 8.5 s |
| `cp` 1 GB 文件 | 2.9 s | **8.6 s** |

只有大文件读写被限速，这是有意的，代价是一次 1 GB 的拷贝多 6 秒。ffmpeg 以 CPU 为主，不受影响。

## 没有覆盖的

- 真实 agent 回合在真实进程树上被 sidecar 挪动：由 `lab/candidate/codex-turn-end-terminals.mjs` 覆盖，结果见 PR 说明。
- V 规模的冻结没有在 VLab 复现：VLab 的磁盘、内存和库都小一个数量级。
