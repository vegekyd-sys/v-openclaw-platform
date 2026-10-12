# 转录镜像查重改查 identity 表（PR #315）上线前验收

记录：2026-10-12 19:10 CST。分支 `claude/mirror-facts-identity`，发布文件 `lab/release-files/mirror-facts-identity/session-accessor-K0XuW6ln.js`（`5c2eb542…` → `30c7b9d6…`）。

## 为什么要上

10/12 16:50–17:24 V 整体不可用：Gateway 主线程被大会话的同步整段读取占满，其中 `session.transcript.mirror-facts`（Codex 镜像查重遇到投影标脏时整段读转录）是主要来源之一。V 当天 Gateway 文件日志里的 `slow SQLite transaction hold operation=session.transcript.mirror-facts`（UTC 小时换算成 CST）：

| 时段（CST） | 次数 | 累计 | 最长 |
|---|---|---|---|
| 16:00–17:00 | 45 | 77 s | 7,343 ms |
| 17:00–18:00 | 137 | 190 s | 2,551 ms |
| 18:00–18:25 | 45 | 53 s | 2,404 ms |

17:55 重启之后仍在持续，平均每次约 1.1–1.4 s，全部是主线程同步阻塞。

## 基线字节

- V 当前 `core/dist/session-accessor-K0XuW6ln.js` = `5c2eb5425df9…`（2026-10-12 18:3x CST 在 V 上 sha256sum）。
- 仓库里 `night-batch-20261010`、`worker-secret-egress-20261010`、`v-voice-content-product-20261011` 三个捕获里这个文件都是 `5c2eb542`；补丁的基线 `lab/release-files/placement-evidence-absence/` 也是 `5c2eb542`。整文件替换不会回退别的补丁。
- dev 上没有其他待上线改动写这个文件（`lab/release-files/session-accessor-K0XuW6ln.js` = `17a22d79` 是旧实验的产物，不在任何待发 plan 里）。

## 合入前验收（VLab candidate，共享 VLab 运行时 `voice-content-product-20261011-v3` = V）

### 1. 功能、故障路径、日志、耗时：`lab/candidate/mirror-facts-identity-accept.mjs`

receipt `candidate-e431fff2-831e-47e1-b9f5-3eb08f874a62`（`tmp/candidate/`，不进 Git）。私有 agent 库里用 V 自己的批量追加，把共享镜像最大的 makaron 转录写 6 遍：36,505 条事件、134 MB（V 上出事的 /vds 会话是 13,787 条）。同一进程同时加载 V 原版、补丁版，以及两份只多一行探针的副本（记录这次读走了哪条路）。

| 投影状态 | 走的路径（探针） | V 原版 | 补丁版 | 结果比较 |
|---|---|---|---|---|
| current | 补丁：current | 中位 20 ms | 中位 20 ms | 一致，含 40 个 anchor |
| 标脏（追加一条 side 回复审计记录，`needs_rebuild=1`，与 V 一致） | 原版：整段读；补丁：lagging（identity） | 中位 1,278 ms（1,131–1,340） | 中位 13 ms（12–17） | 存在性、消息一致；两边都不给 anchor |
| 无 identity 行（300 条） | 原版：整段读；补丁：unindexed（仍整段读） | 5 ms | 6 ms | 一致 |
| 空会话 | — | — | — | 建会话会写一条 header，空会话分支没法自然构造，未测 |

- **故障路径确实被触发，且是 V 同款日志**：本次进程写出 7 条 `slow SQLite transaction hold … "operation":"session.transcript.mirror-facts"`（1,130–1,338 ms），按时间窗逐条对到读取方：7 条全部来自原版（1 次探针 + 5 次计时 + 1 次镜像对照读），补丁版 18 次读 0 条。另外 2 条 `agent.write` 是造数据时的批量追加。
- **镜像不重复写、不漏写**：在标脏的大会话上按 `@openclaw/codex` transcript-mirror 的做法（先 `readMessageFacts`，缺的键再用 `idempotencyLookup:"scan"` 追加）镜像 15 个键（10 个已存在 + 5 个新的）：已存在的 10 个全部跳过、和 V 原版的跳过判断相同；新的 5 个各追加 1 次、各占 1 行 identity；同一批重放一遍，0 追加。
- 注：candidate 进程的文件日志落在共享 VLab 的 `tmp/openclaw-977/openclaw-2026-10-12.log`（同一服务用户），多了 9 行，`database` 字段是 candidate 目录，可区分。

### 2. 真实数据语料比对：`lab/candidate/mirror-facts-identity-corpus.mjs`

receipt `candidate-424706ba-fe8d-419d-ad52-b45702080516`。补丁成立的前提是「每条带幂等键的事件都有拥有这个键的 identity 行」。写入路径上有两种可能打破它：没有 event id 的事件不写 identity 行；同一个键重复追加时，后来的 identity 行的键被置空（identity 记所有者，原来的整段读取最后一条）。对共享 VLab 镜像（V 的数据副本）里所有 agent 库只读逐会话比对：

| agent | 库大小 | 带键会话 | 键 | 缺失 | 多出 | 消息不同 |
|---|---|---|---|---|---|---|
| makaron | 6.9 GB | 3,494 | 18,544 | 0 | 0 | 0 |
| v-codex | 5.0 GB | 39 | 4,336 | 0 | 0 | 0 |
| dealclaw | 379 MB | 23 | 525 | 0 | 0 | 0 |
| xiaoai / short-v / progress-codex / main / openclaw | — | 6 | 84 | 0 | 0 | 0 |

共 3,562 个会话、23,489 个键，0 差异；没有一个会话是「有事件没有 identity 行」。

### 3. 不变慢

- 关键路径上唯一的新增是 `readTranscriptMirrorProjectionState` 在投影非 current 时多一条按主键取 1 行的 identity 查询；current 状态下的查询与 anchor 完全不变（20 ms vs 20 ms）。
- 首字（飞书 create_time → 首段正文推送）的前后对比需要真实渠道和常驻 Gateway，只能在共享 VLab 部署后做（见下）。

### 4. 本地与 CI

- 合并最新 dev（解决 `platform/platform.test.mjs` 离线文件计数冲突：dev 275 + 本 PR 1 = 276）。
- `tests/vlab-static.sh` 通过；`lab/mirror-facts-identity.test.mjs` 4/4；GitHub `static` 通过。
- 本机 `npm test` 有 1 条与本 PR 无关的失败（`a child forked with the parent execArgv minus --inspect keeps the flag`，本机 Node 24 环境），CI（Node 22）通过。

## 共享 VLab 验收（2026-10-12 19:30–21:05 CST）

> **这一节测的是回归，不是修复。** 修复只改了「投影标脏」时的那条分支；共享 VLab 上没有标脏会话（见本节末），压测群走 vlab-worker 根本不调用 mirror-facts，/vds 群调用了但投影一直是最新的。所以下面的首字、Codex 回合、日志只证明：这个文件装上去 Gateway 正常、没改的路径没坏也没变慢。「部署后 mirror-facts 慢事务 0 条」部署前也是 0，不是修复的证据。修复的证据是上面的 candidate（与部署字节相同）和上 V 后的小时计数。

Tianyi 授权合入（监控 session 转达，原话「315合入在共享vlab上验收」）。PR #315 合入 dev = `3490b79a`；合并后 `lab/mirror-facts-identity.test.mjs`、platform 测试、`tests/vlab-static.sh` 通过。

- 部署前 parity：ALIGNED（18,663 个文件）。配置 advisory：V 开着 `parallel` 插件、VLab 没开（与本改动无关）。
- lease owner `pr315-mirror-facts`；release `mirror-facts-identity-20261012`，artifact `12d18469…`，只换 `openclaw/dist/session-accessor-K0XuW6ln.js` `5c2eb542 → 30c7b9d6`。19:56:59 Gateway ready（PID 3043932 → 3643712），线上文件 sha256 核对为 `30c7b9d6`。部署后无 `Cannot reap`、无 `lacked a final answer`、无 error（启动时一条 Codex orphan cleanup 进程检查超时，随后 Codex 回合正常）。

**首字（飞书 create_time → 首段正文推送，同 8 个压测群，vlab-worker / DeepSeek Flash）**

| 轮次 | 部署前 P50 / Max | 部署后 P50 / Max |
|---|---|---|
| 第 1 轮（空闲后冷） | 50.5 s / 58.7 s | 13.5 s / 17.2 s |
| 第 2 轮 | 6.3 s / 12.1 s | 4.8 s / 9.0 s |
| 第 3 轮 | 5.0 s / 10.7 s | 4.9 s / 10.4 s |

部署前第 1 轮是 Gateway 空闲一天多后的冷启动（入站 7.9 s、排队 36 s），部署后第 1 轮是重启后 21 分钟，二者都不代表稳态；热态（第 2、3 轮）不慢。部署后第 3 轮压测脚本自己的 ssh 读日志失败、误报 0/8，已按消息 id 重查 Gateway 记录，8 条都有正文推送。

**Codex 路径（「VLab 发布验收 B」群切到 /vds = Codex + DeepSeek Flash，同样 4 条消息）**

| 消息 | 部署前 | 部署后 |
|---|---|---|
| 记暗号（每轮第一条） | 12.7 s | 9.0 s |
| 解释幂等 | 3.9 s | 3.3 s |
| 1 到 50 求和 | 3.6 s | 3.7 s |
| 复述暗号 | 3.3 s | 4.0 s |

回答全部正确（1275、两个暗号；部署后还答出了部署前记下的暗号）；该会话转录 254 个幂等键全部唯一，没有重复写入。测完已切回 `deepseek-flash / vlab-worker`。

**日志**：部署后共享 VLab Gateway 文件日志 `session.transcript.mirror-facts` 慢事务 0 条。另有 `session.transcript.message-rewrite` 2 条（2.5 s、3.7 s）和 worker `agent.write` 1 条，不在本次改动里；V 今天也有 message-rewrite 2 条，属于既有问题。

**共享 VLab 上没能直接复现的**：回复审计记录只在 `capturePendingConversationTurnReply`（agent 发出的消息被回执确认）这条路径写，普通问答不写，VLab 三天内一条都没有、标脏会话 0 个。所以标脏大会话上「秒级 → 毫秒级」和 V 同款日志的证据来自上面的 candidate（与部署字节相同），不是共享 Gateway。V 上线后按小时数 mirror-facts 慢事务来兑现。

**V 今天的对照**：截至 20:52 CST，V 当天 `slow SQLite transaction hold` 按 operation：mirror-facts 426、transcript-index.prepare 135、sessions.history.read 44、agent.write 16，其他个位数。

## 上 V

1. 等 Tianyi 定重启时间。
2. `node scripts/promote-to-v.mjs --release mirror-facts-identity-20261012 --name <V 发版名> --owner <o> --apply`：备份、装同一份字节、捕获、更新哨兵、align（不重启）。
3. 按定的时间 `v-self-restart`；重启满 20 分钟后测首字，并按小时统计 mirror-facts 慢事务（预期从每小时 45–137 次降到接近 0）。
4. 回滚：`node scripts/promote-to-v.mjs --undo <V 上的备份目录>` 后重启，只换回一个文件（`30c7b9d6 → 5c2eb542`），不涉及配置与数据库。
