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

## 还没做的（需要先合入 dev）

`vlab.mjs package` 要求打包的提交就是 dev HEAD，所以共享 VLab 的 stage/deploy 只能在合入 dev 之后做。合入后的步骤：

1. `vlab-v-parity.mjs` 确认 ALIGNED → lease → package/stage/deploy → 共享 VLab 上：真实 Codex（/vds 或 /vcodex）回合在标脏会话上镜像正常、Gateway 日志不再出现 mirror-facts 慢事务；同一组压测群部署前后各测一轮首字（飞书 create_time → 首段正文），统一口径对比 → accept。
2. `promote-to-v.mjs` 装同一份字节到 V（不重启）→ Tianyi 定的时间用 `v-self-restart` 重启。
3. 上线后验收：V 日志里 `operation=session.transcript.mirror-facts` 的慢事务按小时计数应从当前的每小时 45–137 次降到接近 0；首字前后对比（重启满 20 分钟后再测）。

回滚：`node scripts/promote-to-v.mjs --undo <这次的 V 备份目录>` 后重启；只换一个文件（`30c7b9d6` → `5c2eb542`），不涉及配置与数据库。
