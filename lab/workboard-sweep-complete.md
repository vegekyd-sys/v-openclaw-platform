# workboard-sweep-complete：Workboard 全量巡检在会话超过 1 万后重新完整

Status: candidate only (2026-11-18). Not merged, not on shared VLab, not on V. 改变 Workboard 行为，等 Tianyi 决定。

## 问题

Workboard 插件的 `workboard-lifecycle-sync` 每 10 分钟做一次全量巡检，调
`sessions.list { limit: 10000, configuredAgentsOnly, lifecycleOnly, includeGlobal: false, includeUnknown }`，
然后 `complete = payload.sessions.length < 10000`（V 的 `core/dist/extensions/workboard/index.js` 309 行、571–600 行）。
会话超过 1 万后 `complete` 恒为 false，带来两个后果：

1. `syncWorkboardLifecycleSessions` 里的 `failPreparedLaunch`（prepared launch 没被 Gateway 接受时判失败）在全量巡检里不再触发。
   一张因重启丢失的 prepared 卡会永远停在 prepared，而且只要有 prepared 卡，每分钟那轮都会被强制成全量巡检（`linked.some(… phase === "prepared")`）。
2. 按 pinned、updatedAt 排序第 10,001 名之后的会话不再被全量巡检对账（陈旧判定、状态同步）。

## V 上的只读核实（2026-11-18 00:40 CST，`ssh v`，`sqlite3 -readonly file:…?mode=ro` + `ionice -c3 nice -n19`，没有调 Gateway RPC）

| 项 | 值 |
|---|---|
| makaron `session_nodes` | 22,977 行，未归档 22,854，未归档且非 cron run 22,852；其余 agent：v-codex 46、xiaoai 41、dealclaw 26、short-v 2（未归档） |
| 全量巡检可列出的会话（近似 `filterSessionEntries`） | ≈ 22,967，远超 10,000 |
| 第 1 / 5,000 / 10,000 / 15,000 / 20,000 名的 updatedAt | 11-18 00:36 / 11-10 11:10 / **10-30 17:19** / 10-22 23:55 / 10-15 22:43 |
| 未归档且关联会话的卡 | 17,705 张：窗口内 9,021，**窗口外 8,125**，会话不存在 559 |
| 窗口外 8,125 张卡 | 全部已结算且与会话一致：done/review 7,735、blocked/review 295、done/blocked 65（会话 timeout/failed/killed）等；没有 running 卡，窗口外没有 status=running 的会话，没有 stale 标记 |
| `automation.launch.phase = "prepared"` 的卡 | **0 张**（accepted 22,517，failed 11，其余无 launch） |
| 曾被判失败的 launch | 11 张；9 张原因是 "Gateway did not accept the prepared Workboard session before restart."，都在 9/10–9/23，**prepare 后 1–36 s 就被判失败**；10 月下旬 V 超过 1 万后再没有过 |

结论：
- 现在 V 上没有卡受影响（没有 prepared 卡；掉出窗口的会话都已结算且已对账过）。窗口按每天约 540 个新会话前移，现在覆盖约 18.5 天。
- 风险在以后：一次重启丢掉一张 prepared 卡，它就永远卡住，还会让每分钟都跑一次全量巡检（#614 后读库在 worker 线程，主线程每次约 0.65 s，worker 每次约 3 s CPU）；
  一个运行超过 18 天不更新 updatedAt 的会话、或新卡关联到一个旧会话，全量巡检都看不到。

### 顺带发现：恢复完整性会同时恢复一个旧竞态

dispatcher（`runtime-api-1CCazqtv.js` 约 3900–3990 行）是 `prepareExecutionLaunch` → `await params.subagent.run(...)`（几秒到几十秒）→ `acceptExecutionLaunch`。
巡检在这段时间里列会话（run 的会话还没建）再读到仍是 prepared 的卡，就会 `failPreparedLaunch`，CAS 成功，把正在启动的卡判失败；
dispatcher 之后的 accept CAS 失败被 `.catch` 吞掉，worker 照常跑。9 月那 9 张卡 prepare 后 1–36 s 就失败（V 重启要 2.5 分钟，不可能是重启），其中 6 张后来 done——正是这个竞态。
所以只把 `complete` 改对是不够的。

## 修法比较

| 方向 | 做法 | 行为影响 | 代价 |
|---|---|---|---|
| **提高 limit + 用 hasMore 判完整（采用）** | 全量那轮 `limit: 1e6`，`complete = hasMore === false`；增量那轮仍 1 万 | 恢复 V 超过 1 万之前的语义：全部会话参与全量对账，prepared 失败判定重新生效 | 主线程多建约 1.3 万行 lifecycle 行（见下方实测）；读库本来就是整库（#614 在 worker 里读全部行，只是返回前截到 1 万），所以读库成本不变 |
| 分页直到 `hasMore=false` | 用 offset 连续调 | 同上 | **每页都在 worker 里整库读一次**（V 约 7 s wall / 3 s CPU），3 页就是 3 倍；页与页之间 updatedAt 会变，行会在页间移动（重复或漏），完整性证明本身不成立。否决 |
| 按卡片 key 补读掉出窗口的会话 | 1 万页之外，对未在页内的卡片 key 定向读 | 能对账掉出窗口的会话 | 9.1 的 `sessions.list` 没有按 key 批量读的参数，要新增 RPC 参数或 8 千次单查；V 上 1.77 万张关联卡里 8 千张在窗口外，省不了多少（#614 文档同一结论）。上游（2026-10-15 #173740、#173793）走的是这条路：先分页再改成逐卡 `sessions.describe` 并跳过已结算卡，依赖 9.1 没有的接口，移植量大。不采用 |
| 只修 prepared（窗口截止判定） | 页按 updatedAt 降序，若 `preparedAt` 晚于页内最旧未置顶行，则缺席可证明 | 只修后果 1，后果 2 不变 | 零成本，但 hasActiveRun 证明不依赖 updatedAt，边界有漏洞；不采用 |

另加 **prepared 失败判定的宽限**：完整快照只判「孤儿」launch 失败——
- `preparedAt <= performance.timeOrigin`（本进程启动前 prepare，即被重启丢掉的）：第一次完整快照就判失败，与上游 restart 语义相同；
- 本进程 prepare 的：`preparedAt + 30 min <= 本轮巡检开始时间` 仍没有被接受的会话才判失败（30 min = `WORKBOARD_STALE_SESSION_MS`）。
  dispatcher 正在 `subagent.run` 里的卡不再被巡检误判。

### 与 PR #614（全量巡检读库挪到 worker）的关系

- #614 已经在 V 上（V 的 `sessions-read-C6mAMxyQ.js` 等 7 个文件 = #614 的 after 哈希），本补丁只改 `extensions/workboard/index.js`，与 #614 没有文件重叠。
- #614 的 worker 白名单只看参数名（`limit` 仍在白名单里），本补丁只改 `limit` 的值，所以全量那轮仍走 worker。候选测试里 B 臂每次全量都起了 worker。
- #614 的 worker 本来就读整库、合并全部 entry，`limit` 只决定主线程从中选出、建行、返回多少行。所以本补丁不增加读库成本，增加的是主线程上 selection 之后的建行和 Workboard 的对账循环。
- 没有 #614 时（`OPENCLAW_V_WORKBOARD_FULL_SWEEP_WORKER=0`）本补丁也成立，但全量那轮主线程本来就要 5–9 s。

## 改动（`lab/patch-workboard-sweep-complete.mjs`，1 个 dist 文件，before = V 线上字节 = #487 release）

`extensions/workboard/index.js` 的 lifecycle-sync 区段：

1. `readWorkboardLifecycleSessions`：没有 activeMinutes 时请求 `limit: 1e6`（`WORKBOARD_SESSION_FULL_SWEEP_LIMIT`，只防失控），
   `complete = hasMore === false`；响应没有 `hasMore`（旧 peer、mock）时仍用「行数 < 1 万」。增量那轮不变。
2. `syncWorkboardLifecycleSessions`：prepared 失败判定加上上面的孤儿条件（`snapshotStartedAt`、`processStartedAt` 两个新参数）。
3. `createWorkboardLifecycleService` 的 reconcile 把 `sweepStartedAt` 和 `processStartedAt`（默认 `performance.timeOrigin`）传给 sync。

`OPENCLAW_V_WORKBOARD_SWEEP_COMPLETE=0` 恢复 V 原行为（每次巡检读环境变量）。

源码：openclaw-versa `versa/port-workboard-sweep-complete-20261118` @ `e27869be125`（基于 #614 的 `1d013cb6c39`）。

## 验证

### 单测

- versa：`extensions/workboard/src/` 25 个文件 377/377 通过；去掉源码改动后 4 项失败（新加的「本进程正在启动的 launch 不被判失败」「宽限前 1 ms 不判失败」「整目录 + hasMore」，以及 limit 断言）。
  restart 测试的替换服务改为显式传 `processStartedAt`（模拟重启后的新进程），原有 6 项 restart 语义不变。新增宽限到点判失败的用例。
  oxlint 无新增（`lifecycle-sync.test.ts` 原本就超 max-lines 1035 行，没有加长）；tsgo 无 workboard 相关错误。
- 平台：`node --test lab/workboard-sweep-complete.test.mjs`（5 项）：plan 与字节一致、patch(V)=release、unpatch(release)=V、没有别的 plan 从 V 字节改同一文件；
  整目录与 hasMore 判定（含无 hasMore 的旧 peer、增量不变、其他请求参数不变）；开关；五种 preparedAt 的孤儿判定（V 字节下全部会被判失败，release 只判三个孤儿）。

### V 规模候选（`lab/candidate/workboard-sweep-complete-ab.mjs`）

candidate-e64239aa（vlab91，2026-11-18 01:02–01:06 CST，baseRelease `workboard-full-sweep-20261117`，即 V 现在的字节、#614 已在内；测试 218 s）。

数据：`v-scale-session-fixture.mjs` 生成 makaron 22,922 行（1.8 GB entry JSON），私有状态库 `subagent_runs` 扩到 22,033 行（ok 21,325 / error 593 / running 105）；
全量 lifecycle listing 19,449 行。每臂一个子进程：真实 `sessions.list` handler（#614 worker 路径）+ 真实 WorkboardStore（全新 Workboard 库）+ 该臂 index.js 的 lifecycle-sync 区段。
卡片（三臂相同）：排在 1.2 万名之后、已一致的会话 300 张（done/review）；排在 1.2 万名之后、卡还写着 running 的 30 张；前 5,000 名里卡还写着 running 的 30 张；
本进程启动前 prepare、没有会话的 2 张（孤儿）；本进程刚 prepare、没有会话的 2 张（正在启动）。有 prepared 卡，所以每轮都是全量巡检，各跑 4 轮。

| 臂 | 列出行数 / hasMore | 首轮改动 | 窗口外漂移卡 30 | 孤儿 2 | 正在启动 2 | 已一致 300 | 首轮 / 稳态主线程最长阻塞 | 全量 wall |
|---|---|---|---|---|---|---|---|---|
| A（V 字节） | 10,000 / true | 30 | 不动（running） | 不动（prepared） | prepared | 不动 | 637 / 620–651 ms | 7.3–7.7 s |
| B（release） | 19,449 / false | 62 | → review | → blocked，launch failed | prepared | 不动 | 843 / 741–800 ms | 7.5–7.7 s |
| B0（B + 开关=0） | 10,000 / true | 30 | 不动 | 不动 | prepared | 不动 | 649 / 594–662 ms | 7.3–7.6 s |

- 三臂 4 轮全量都走了 #614 的 worker；B 第 2–4 轮改动 0（首轮收敛）；B0 的最终卡片指纹与 A 相同；三臂都没有 lifecycle 告警。
- 代价：B 的主线程最长阻塞比 A 多约 150 ms（多建约 9,400 行 lifecycle 行 + Workboard 对账循环多匹配这些会话），全量 wall 基本不变（读库本来就是整库）。
  V 比 VLab 快约 1.5–2 倍，按此估计 V 上全量那轮主线程阻塞从约 0.4 s 到约 0.5 s，仍低于 1 s liveness 告警阈值；随会话数线性增长（每 1 万行约 +0.15 s，VLab 口径）。
- 原始数字见 receipt（本机 `tmp/candidate/candidate-e64239aa-03ea-479e-840f-8dcb5312258d.json`，不进仓库）。VLab 工作目录已自动删除；这次新建的基线 `8c879da1…` 就是当前 VLab runtime 的基线，按清理规则保留。

### 2026-11-20 复跑（上线前，rebase 到 dev c6dfffd6 之后）

- V 上 `extensions/workboard/index.js` 仍是 `448d3ae8…`（11-20 21:04 CST 只读核对），按线上字节重建的 release 与之前逐字节相同（`62a0a1b5…`）。
- candidate-4a90559b（baseRelease `spawnbroker-egress-20261119`，commit 7780d638、tree 干净，测试 211 s），同一夹具与断言，全部通过：

| 臂 | 列出行数 / hasMore | 首轮改动 | 首轮 / 稳态主线程最长阻塞 | 全量 wall |
|---|---|---|---|---|
| A | 10,000 / true | 30 | 641 / 622–649 ms | 7.2–7.4 s |
| B | 19,449 / false | 62 | 888 / 760–776 ms | 7.4–7.8 s |
| B0 | 10,000 / true | 30 | 635 / 627–639 ms | 7.3–7.4 s |

  卡片结果与 11-18 相同（B：窗口外 30 张 → review、孤儿 2 张 → blocked/failed、正在启动 2 张仍 prepared；B0 指纹 = A）。稳态代价约 +130–150 ms。

## 上线

- 换 1 个 core dist 文件 `extensions/workboard/index.js`，需要重启 Gateway。before = V 当前字节（#487 release，448d3ae8…）。部署前按线上字节再核对一次。
- 首个全量巡检会对掉出窗口的 8 千多张卡做 no-op 判定（V 上它们都已一致，预计 0 改动）；没有 prepared 卡，所以不会有卡被判失败。
- 上线后核对：每 10 分钟 liveness 不出现新的 ≥1 s 停顿；`workboard lifecycle sync failed` 不出现；Workboard 卡状态照常推进；
  以后若出现 `Gateway did not accept the prepared Workboard session before restart.`，应只在重启后或 prepare 30 分钟后。
- 回退：`OPENCLAW_V_WORKBOARD_SWEEP_COMPLETE=0`（Gateway 环境，重启生效），或换回 before 字节。

## 没覆盖

- 没在私有 Gateway 里跑真实巡检节奏，没在共享 VLab 集成验收，没上 V。
- 每分钟那轮在有 prepared 卡时被强制全量的行为没有改（上游一样）；dispatcher 正常启动时 prepared 只持续几秒，所以影响有限。
- 「会话不存在」的 559 张卡（关联的会话已删除或归档）不受本补丁影响：完整快照下只有 prepared 卡会因缺席被处理，其他卡缺席时跳过，与原逻辑相同。
