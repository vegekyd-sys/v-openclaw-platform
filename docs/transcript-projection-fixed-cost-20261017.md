# 投影重建窗口的固定开销（2026-10-17）

接 #411（F4，从最后一个有效投影接着算）。#411 上线后，一次分叉、回退或旁路追加从写入到投影可读还要 1.3–2.4 s，36 行的会话也是这个数。这次把这段固定开销拆开计时，然后去掉。

## 结论

- 窗口里几乎全是整库扫描和线程启动，与会话本身无关。
- 改完后，在 V 数据副本上：
  - 复用 Worker 时，分叉、回退为 0.12–0.21 s，跨检查点分叉 0.02–0.03 s；
  - 进程里第一次重建（Worker 冷启动）0.68–0.79 s；
  - 紧接着的第二次写入 0.03–0.06 s，原来要 3.6–3.9 s。
- 投影与全量重建逐行一致；模型看到的内容与 A0 逐字段比对，零差异。

## 原来的 1.2 s 由什么组成

### 计时方法

- 只在 candidate 里给 #411 的字节插入计时标记（`lab/candidate/projection-fixed-cost-instrument.mjs`，不上线）。
- 时间戳用 `performance.timeOrigin + now()`，主线程和 Worker 线程之间可以直接比较。

### V 数据副本的做法

- 导出：在 V 上一个读事务里只读导出 4 个目标会话的全部行。
- 其余 6,297 个会话作为"背景"一起导出：
  - 窗口、索引状态、active 行照原样导出；
  - 每个会话的最新一行 transcript，正文换成占位符；
  - FTS 行只导出字节长度，到 VLab 上再填成等长的占位文本。
- 这样整表扫描读到的数据量与 V 一样，但其他会话的正文不会离开 V。
- 背景的 FTS 有 138,226 行，active 有 926,664 行。
- 不带背景时，F4 的 candidate 量到 1.1–2.4 s；带上背景，A 量到 2.1–2.5 s。说明大部分时间花在整库扫描上。

### 拆开的结果

TA（= #411 的字节）在两次 candidate 里共 6 个旁路、分叉场景的分段，单位 ms。vlab91 只有 4 核，同时还跑着别的任务：

| 段 | 耗时 |
|---|---|
| preflight：拉起 eval Worker 并 import 索引模块 | 380–480 |
| preflight：读整张 FTS 表（`session_id` 是 UNINDEXED，要连正文一起读） | 1,060–1,540 |
| preflight：列出所有脏会话 | 40–75 |
| reconcile Worker：启动和加载模块 | 490–760 |
| reconcile Worker：只读打开（在状态库里写一条 agent-database 租约） | 180–360 |
| Worker 内再列一次所有脏会话 | 20–40 |
| 规划 delta 并应用 | 5–15（分叉、回退另有一次 FTS 扫描，见后续） |

- 投影可读之后，同一轮里还会在 reconcile 租约下再做一次 preflight，用作 orphan sweep，又是 1.5 s。
- 紧接着到来的写入要先等它做完，再从头做一轮 preflight 和 Worker 启动。这就是第二次写入要等 3.6–3.9 s 的原因。

### V 上同样的扫描

- 2026-10-17 13:51，在 V 上 nice/ionice 只读执行一次：
  - FTS 扫描冷读 16.8 s，热读 0.18 s；
  - active 孤儿查询冷读 6.2 s，热读 0.35 s。
- V 的库有 19.5 GB，页缓存只有约 9 GB，FTS 页经常被挤出缓存。
- 当天 12:13 的日志里有 `waited for process owner waitMs=6706` 和 `waitMs=25802`：别的进程在 reconcile 租约下做冷扫描，这个进程只能等着。

### 读者轮询多出来的一轮

- 读者（包括回合开始前的投影等待）看到"重建中"，就会再调用一次 `startSessionTranscriptIndexReconcile`，把 pending 置上。
- 结果每次重建之后都多跑一轮：preflight 先跑一遍，发现没活，就结束了。
- 单测里 V 的字节把这一轮完整走了一遍。

## 改动

改的是两个 dist 文件，before = V 线上字节（#411 的 after），10/17 15:50 在 V 上核对过：

| 文件 | before | after |
|---|---|---|
| `session-transcript-reconcile-j5qhAafV.js` | `9fac1d4a…` | `85455fa4…` |
| `config/sessions/session-transcript-reconcile.worker.js` | `2fa289dd…` | `fdce59ff…` |

- 不碰 builtin-openclaw 里的回合等待（F3），也不碰 F1 的三个分块，index 分块也不改。
- 构建：`node lab/build-transcript-projection-fixed-cost.mjs`。
- 计划文件：`lab/transcript-projection-fixed-cost-plan.json`。
- 发布计划：`lab/release-projection-fixed-cost-20261017.plan.json`（baseRelease 为 archive-retention-cutoff-20261017）。

### 1. 有首选会话时先做它

- 每次追加和读者请求都会带上首选会话。
- 如果这个会话按列表的判定条件确实需要重建，就跳过开头的 preflight，Worker 先规划这个会话，再去列出其他会话。
  - 判定条件就是 `listSessionsNeedingTranscriptIndexReconcile` 的那条查询，只限这一个会话，全部走索引查找。
  - 在 candidate 里，用 V 的真实列表查询逐个会话比对了 6,301 个会话：80 个处于各种脏状态，零差异。
- 其他脏会话仍在同一轮里依次处理，每个只处理一次。
- 首选会话不需要重建，或者这一轮没有首选会话（启动、搜索），就照原样先跑 preflight。

### 2. orphan sweep 改到整条链结束之后做

- 一条 reconcile 链结束后只做一次 orphan sweep，放在链和 reconcile 租约之外。
  - 它用自己的 sidecar 租约 `.transcript-orphan-sweep-coordinator`，只试一次；别的进程正在扫，就跳过，由它覆盖。
- 新的一条链不用等上一条链的 sweep。
- `waitForSessionTranscriptIndexReconcile` 仍会等 sweep 做完。
- 直接调用 `reconcileSessionTranscriptIndexes` 的路径（启动）保持原样：sweep 仍在租约内、在 resolve 之前做。
- 孤儿删除的逻辑不变：同一个只读扫描；每一块删除前，都在写事务里复核这个会话确实没有 transcript 行。

### 3. 只为还没完成的请求再跑一轮

- 一轮进行期间，如果只收到针对具体会话的请求，下一轮只在其中某个会话这时仍需重建时才跑。
- 收到过不带会话的请求，就照原样再跑一轮。

### 4. 复用 reconcile Worker

- 每个进程、每个库最多保留一个空闲 Worker：
  - unref，不阻止进程退出；
  - 空闲 5 分钟后退出；
  - 出错、或这一轮以失败结束，就不保留。
- Worker 每一轮仍然自己打开库、登记租约、最后关掉。空闲时不持有租约，也不持有快照。
- 停车时只移除我们自己挂的 message/error/exit 监听。
  - 不带参数调用 `removeAllListeners()`，会把 Node 内部启动端口的 `newListener` 钩子也删掉，之后新挂的监听收不到任何消息。第一版就是这样卡住的，单测里的假 Worker 现在模拟了这个行为。
- 空闲 Worker 会保持它与状态库之间的连接（没有事务）。

## 验证

### 单测（`lab/transcript-projection-fixed-cost.test.mjs`，14/14，已进 catalog）

- release 文件等于补丁器作用在 V 字节上的结果；before 等于 #411 的 after；重复打补丁会报错。
- 单会话判定与原生列表逐会话一致，覆盖以下状态：
  - flag、追加脏、watermark 落后、未分类、没有 state、indexed 超前、没有窗口、孤儿。
- reconcile 链：真实的进程协调器，桩 sibling，真实 SQLite。
  - 追加脏：V 的顺序是 preflight → Worker → delta → sweep；现在是 Worker → delta → 其他脏会话 → 单独租约下的 sweep。两边最终的表逐行相同（包括孤儿）。
  - 读者在一轮进行中请求一个这一轮已经补好的会话：V 会再跑一轮 preflight；现在不会。
  - 某个会话在这一轮里又被弄脏：另起一轮，这一轮同样不先扫描。
  - 不带会话的请求：照原样跑完整一轮。
  - 首选会话不需要重建、或没有首选会话：与 V 的事件序列和最终的表都相同。
  - 直接调用：sweep 仍在租约内。
  - sweep 租约被占：跳过，不报错。
  - 新链不等上一条链的 sweep。
  - 一个 Worker 服务两条链；V 每轮都新起一个。
  - 失败的 Worker 不保留。
- Worker：真实线程。
  - 首选会话排在列表之前；其余会话各处理一次；没有首选会话时与 V 相同。
  - 可复用的 Worker 每条 run 命令做一轮；普通 Worker 做完一轮就退出。

### candidate A/B（V 数据副本，`candidate-91e032db-efeb-49cb-9197-c92cc801a921`，ok）

- 数据：10/17 14:02 在 V 上用一个读事务只读导出。
  - 文件 758 MB，sha256 `ae323606…`，经 tailnet 用 nc 推到 vlab91，哈希一致，V 上的导出文件当即删除；
  - A/B 跑完后，vlab91 上的副本也已删除（15:50）。
- 方法：
  - A = V 的字节（#411），B = 本补丁，TA/TB = 加了计时标记的 A/B。
  - 按 A,B,TA,TB 交错跑两轮，每次都从同一份基线出发。
  - 写入走真实 API，id 和时间戳固定。reconcile owner、Worker、等待都是真实代码。
- 场景：
  - 旁路追加；
  - 回退到 6 条前，再续两条；
  - 从 20 条前分叉；
  - 从最近一次压缩检查点之前分叉；
  - 旁路追加，等它可读后立刻再追加一条。
- 每个进程里，第一个场景（side）是 Worker 冷启动，后面的场景都复用同一个 Worker。

写入后到投影可读（windowMs），两轮的范围：

| 会话 | 场景 | A | B |
|---|---|---|---|
| 马晴 7da00997（26,030 行） | 旁路（冷 Worker） | 2.13–2.15 s | **0.68–0.74 s** |
| | 回退 | 2.25–2.31 s | **0.16–0.17 s** |
| | 分叉 | 2.42–2.46 s | **0.17–0.20 s** |
| | 跨检查点分叉 | 2.20–2.31 s | **0.02–0.03 s** |
| | 连续第二次 | 3.63–3.68 s | **0.04–0.05 s** |
| 夜班群 3c3fab41（12,870 行） | 旁路（冷 Worker） | 2.20–2.26 s | **0.72–0.75 s** |
| | 回退 | 2.33–2.36 s | **0.15–0.21 s** |
| | 分叉 | 2.25–2.32 s | **0.13–0.17 s** |
| | 跨检查点分叉 | 2.14–2.18 s | **0.02–0.03 s** |
| | 连续第二次 | 3.56–3.63 s | **0.03 s** |
| Tianyi 主会话 7612daa9（21,492 行） | 旁路（冷 Worker） | 2.36–2.43 s | **0.71–0.75 s** |
| | 回退 | 2.44–2.46 s | **0.18 s** |
| | 分叉 | 2.32–2.34 s | **0.17 s** |
| | 跨检查点分叉 | 2.19–2.23 s | **0.02–0.03 s** |
| | 连续第二次 | 3.82–3.88 s | **0.04–0.06 s** |
| 06d45f08（36 行） | 旁路（冷 Worker） | 2.27–2.32 s | **0.73–0.79 s** |
| | 回退 | 2.46–2.54 s | **0.12–0.14 s** |
| | 分叉 | 2.41–2.45 s | **0.14–0.15 s** |
| | 连续第二次 | 3.65–3.73 s | **0.03–0.04 s** |

- 整条链结束（rebuildMs，含 sweep）：A 3.7–5.4 s，B 1.5–3.1 s。
- 主线程最长停顿：A 和 B 在同一量级。旁路场景里最大的那次停顿（7da00997 达到 0.6–1.1 s）出现在写入本身，两边都有，与本补丁无关。
- 每个场景、每一轮之后，投影（active、FTS、状态）都与全量重建逐行一致。
- 追加只写了标记 2。四个会话的模型视图（上下文消息、model、thinkingLevel、leaf、尾部 200 条、统计）与 A0 逐字段对比，零差异。

B 剩下的窗口（TB，7da00997）：

- 冷 Worker：启动和加载模块 519 ms，只读打开 182 ms，规划和应用 delta 21 ms。
- 复用的 Worker：只读打开 4–10 ms。
  - 回退、分叉还有一次 172 ms：规划时要找出被裁掉的旧节点的 FTS 行，按 `session_id` 扫了整张 FTS 表；
  - 跨检查点分叉没有被裁掉的行，规划只要 18 ms。

## 上线须知（交给监控 session）

- 两个文件都只在 reconcile 链中生效，不需要改配置。
- Gateway 和 worker 进程重启之后才会加载新字节。
- 验收建议：
  - 哈希等于 after；
  - 文件日志里 `session transcript reconcile waited for process owner` 的次数和 waitMs 下降；
  - 没有 `session transcript orphan sweep failed`；
  - 只读检查 7da00997、3c3fab41 的 `needs_rebuild` 保持 0，`indexed_seq` 跟上最新 seq。
- 回滚：把两个文件换回 before 字节，再重启。

## 剩下的部分（后续）

- 分叉或回退要裁掉旧路径时，规划 delta 要按 `session_id` 扫整张 FTS 表来找那些行的 rowid。这在 VLab 上要 0.1–0.2 s，在 V 上冷读可能要几秒。
  - 可以和 #398（FTS 按 rowid 窗口删除，已合入 dev，未上 V）一起处理。
  - 或者在 index 分块里按 message_id 找到这些行，不再扫全表。
- 超过 5 分钟没有重建时，下一次仍要冷启动 Worker，约 0.7 s。
- 投影可读之后，orphan sweep 和 Worker 里的全库列表仍会各读一次全表，但已经不在窗口里了。sweep 也不再占着 reconcile 租约。
