# V 重启变慢：启动时逐条读取 3.4 万个已结束子 agent 的会话

状态：VLab candidate A/B 已做，未合入 dev，未上 V。源码在 `vegekyd-sys/openclaw-versa` 的
`versa/port-subagent-activate-settled-20261129` @ `9dc9d2c5592`，基于 `4ee0e038099`（V 现行这个 chunk 的
字节就映射到这个提交）。

## 现象：一路变慢，不是某一版突然变慢

`/var/lib/v-self-restart/*.json` 里的 `start` 秒数，是从 systemd Start 到 `[gateway] ready`。journald 只保留到
11/19，更早的分段取自 10/13–10/14 的计时记录（记忆 `v-restart-time-breakdown`）。

| 日期 | start（到 ready） | 当日 `subagent_runs` 累计行数 |
|---|---|---|
| 10/13（restart-speed 上线后） | 46–51 s | 2,082 |
| 10/20 | 66–85 s | 4,941 |
| 10/27 | 91–101 s | 10,383 |
| 11/07 | 126 s | 16,663 |
| 11/19 | 111 s | 24,403 |
| 11/24–11/27 | 201–206 s | 29,602–33,546 |
| 11/28 | 156–161 s | 33,724 |

10/13 那次：飞书 WS 31 s、ready 43 s，就是 Tianyi 记得的「20 几秒」。从那以后每次发版重启都更慢一点。

## 11/28 23:41 这次的分段（V journald + 结构化日志，从 systemd Start 起算）

| 段 | 时刻 | 耗时 | 内容 |
|---|---|---|---|
| 停机 | -1 s | 1 s | 干净停机；ExecStartPre 共 0.3 s（steer91 照旧报错、被忽略，不耗时） |
| db91 预检 | 0.5 s | 0.03 s | carry 8/8 沿用 |
| 加载核心模块 → `loading configuration` | 19.0 s | 18.5 s | |
| `starting...` → `starting HTTP server` | 51.4 s | 32 s | 插件、secrets，以及会话启动迁移对 entry JSON 的全表扫描 |
| → listening，渠道启动 | 55.8 s | 4 s | |
| 飞书 `WebSocket client started` | 67.6 s | 12 s | |
| worker 5/5 就绪、`startup outcomes` | 90.6 s | 23 s | |
| **`startup outcomes` → `[gateway] ready`** | **157.8 s** | **67 s** | 主线程完全无日志；liveness 记到超时 46.5 s；ready 时堆 6.57 GiB |
| **ready 之后第二次停顿** | ~178 → 242 s | **62 s** | ELU 1、cpuCoreRatio 1.0，原因未定（见下） |
| cron 启动、4 条 stream 回到 running | 244–252 s | | |
| settled | 291 s | | |

飞书 WS 在 67.6 s 就连上了，但主线程到 242 s 之前基本一直被占着，期间收到的消息都只能排队等。

## 根因（ready 前的 67 s）

`startup outcomes` 和 `gateway ready` 之间只执行一件事：`activateSubagentRegistry`。它调用
`activateRestoredRuns`，对注册表里的每一行先读一次子会话 entry，判断 `abortedLastRun`，再交给
`resumeSubagentRun`。V 上的数据（2026-11-29，只读）：

- `subagent_runs` 33,729 行，payload 404 MB。33,723 行已结束且 `cleanupCompletedAt` 有值，其中 33,677 行是
  `cleanup=keep`、`spawnMode=run`、没有 `archiveAtMs`，永远不会被清扫。来源：30,987 行是 `plugin:workboard`
  （夜班卡），2,405 行是 `plugin:v-meeting-bridge`。
- 每个子 key 在 makaron `session_nodes` 里都有一行。抽样 300 行，entry JSON 平均 103.5 KB，合计约 3.4 GB。
- 读一次就是开一次库、跑一次 Kysely 查询、解析一次 JSON。lazy store（`OPENCLAW_V_SUBAGENT_LAZY_STORE`）会把读到的
  entry 一直缓存到循环结束，所以堆涨到 6.5 GB。
- 而 `resumeSubagentRun` 对这些行走到 `if (entry.cleanupCompletedAt) return;` 就返回了，什么都不做。

所以这段时间随夜班卡数量线性增长，也解释了上表的趋势。

## 改法

满足以下三条的行，在读子会话之前直接跳过：`cleanupCompletedAt` 有值；没有 `requesterSettleWake`（resume
先查这个）；不归中断恢复所有（resume 会把这类行标成 resumed）。

对这些行，原逻辑读完 entry 后只有两种走向：aborted 时跳过 resume，否则调用一个立刻返回的 resume。两种都不改任何
状态，所以跳过读取不改变结果。其余所有行照旧读取、照旧 resume。设置 `OPENCLAW_V_SUBAGENT_ACTIVATE_SETTLED=0`
（Gateway 进程环境）可恢复成对每行都读取。

文件：`subagent-registry-C24yr_PF.js`，由 `lab/patch-subagent-activate-settled.mjs` 从 V 现行字节生成
（before `52b3b571…`，after `4b2d1abc…`），只多 5 行。

## 测试

- versa：`src/agents/subagents/registry/subagent-registry-restore-activate.test.ts` 4 项。去掉改动后，
  「settled 行不读」那项失败。原有 `subagent-registry.test.ts`（152）、`subagent-registry.persistence.test.ts`
  和 `subagent-registry-restart-recovery.test.ts`（合计 173）全部通过。测试在 Node 22.23.1 下运行。
- 平台：`lab/subagent-activate-settled.test.mjs` 4 项，覆盖以下几点：
  - 发布文件等于用捕获的 V 字节重新构建的结果；
  - 只新增 helper 和一行判断；
  - 用 V 自己的 `resumeSubagentRun` 在沙箱里跑 216 种被跳过的行形态，全部零调用、不标 resumed；
  - 不该跳过的行仍然会被读取。

## VLab candidate（`lab/candidate/restart-time.mjs`，结果 `lab/restart-time-results-20261129.json`）

私有 Gateway 用 V 字节，数据是只用 VLab 数据造的 V 规模 fixture：

- 33,900 个会话，entry 3.08 GB（平均 93 KB）；
- 30,114 条 terminal keep 的 subagent_runs；
- 预热启动一次之后，从进程启动起全程 CPU profile，每秒一次 RPC 测主线程。

| | V 字节 | 修复 | 修复 + Codex + cron + 15,171 条 Codex 绑定（618 MB） |
|---|---|---|---|
| spawn → listening | 43.6 s | 24.3 s | 40.4 s |
| **startup outcomes → ready** | **84.6 s** | **0.1 s** | **0.1 s** |
| spawn → ready | 154.2 s | 47.2 s | 64.9 s |
| 其中 `activateRestoredRuns` | 65.7 s | 0.02 s | 0.02 s |
| RSS 峰值 | 6,035 MB | 1,481 MB | 1,506 MB |
| ready 后 90 s 内最长 RPC | — | 3.4 s | 2.9 s |

spawn → listening 一段三次差异大，原因是页缓存冷热不同（profile 里同一段迁移扫描分别是 14.3 s、5.2 s、5.1 s），
与本改动无关。可比的指标是 outcomes → ready。

## 还没解决的：ready 之后的 62 s

V 上 11/19–11/28 每次重启都有这一段，都在 ready 后约 20–31 s 开始，长度从 15 s 涨到 62 s；纯 CPU，期间
主线程无日志。三种 candidate 配置都**没有**复现：基线、修复、修复 + Codex 插件 + cron + V 规模的 Codex 绑定。
所以它依赖 candidate 里没有的东西：真实渠道（飞书/钉钉/企微/Telegram）、已连接的远程节点，或渠道带来的流量。

已排除：

- Dreaming 清理：#604/#605 已修；
- 子 agent sweeper：对 keep 行第一条判断就 continue；
- GC：candidate 基线 ready 后 GC 只有 2.5 s；
- Codex 绑定表：启动时没有代码遍历它；
- 会话启动迁移：在 listening 之前，V 热缓存下 4–5 s。

剩下的嫌疑都要 V 上的证据才能定：

- `refreshRemoteBinsForConnectedNodes`：技能变更后防抖 30 s，每个 Mac 节点都把所有 agent 工作区的技能加载一遍。
  但 V 在停顿开始时只有一次技能加载日志。
- 飞书 / 钉钉的恢复逻辑。

V 上禁止抓 profile，所以这里没有再往下猜。

## 上 V

- 合入 dev 后，用 `promote-to-v.mjs` 替换这一个 core dist 文件，重启一次 Gateway（这段代码只在启动时跑）。
- 预期：outcomes → ready 从 67 s 降到 <1 s，ready 时堆从 6.5 GB 降到约 2 GB，ready 从约 158 s 降到约 91 s。
  飞书 WS 仍在约 68 s；如果 ready 后那段停顿还在，「能回复」会落在约 175 s，现在是约 245 s。
- 回滚：换回 before 字节（`52b3b571…`）后重启，或者设 `OPENCLAW_V_SUBAGENT_ACTIVATE_SETTLED=0` 后重启。
- capture PR：把 after 字节映射到 `versa:9dc9d2c5592`。
